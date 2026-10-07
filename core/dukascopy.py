"""Years of free intraday history for spot gold (XAU/USD) from Dukascopy's public datafeed.

Yahoo only keeps ~60 days of intraday bars, far too little for the 30-minute and 1-hour models to see different kinds of
market. Dukascopy publishes one LZMA-compressed file of 1-minute candles per day:
    https://datafeed.dukascopy.com/datafeed/XAUUSD/{year}/{month-1:02d}/{day:02d}/BID_candles_min_1.bi5
Each record is 24 bytes, big-endian: seconds since midnight UTC (int32), open, close, low, high (int32, price x 1000),
volume (float32). Finished months are cached as parquet files; days of the current month are cached one by one.

splice() uses this spot history as the backbone and adds only Yahoo's newest bars (hours Dukascopy has not published
yet), scaled to the spot price where they meet, so there is no artificial jump and no futures roll in the series.
"""
import lzma
import struct
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

URL = "https://datafeed.dukascopy.com/datafeed/{sym}/{y}/{m:02d}/{d:02d}/BID_candles_min_1.bi5"
SCALE = {"XAUUSD": 1000.0, "XAGUSD": 1000.0}
RULE = {"M5": "5min", "M15": "15min", "M30": "30min", "H1": "1h", "H4": "4h"}


def decode(blob: bytes, day: date, scale: float) -> pd.DataFrame:
    if not blob:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    raw = lzma.decompress(blob)
    rec = np.array(list(struct.iter_unpack(">5if", raw[: len(raw) // 24 * 24])), dtype=float)
    idx = pd.Timestamp(day, tz="UTC") + pd.to_timedelta(rec[:, 0], unit="s")
    df = pd.DataFrame({"open": rec[:, 1] / scale, "close": rec[:, 2] / scale, "low": rec[:, 3] / scale,
                       "high": rec[:, 4] / scale, "volume": rec[:, 5]}, index=idx)[["open", "high", "low", "close", "volume"]]
    # closed market (weekends, holidays): Dukascopy repeats the last price with no volume
    return df[(df["volume"] > 0) | (df["high"] > df["low"])]


def fetch_day(sym: str, day: date, get, tries: int = 4) -> pd.DataFrame:
    url = URL.format(sym=sym, y=day.year, m=day.month - 1, d=day.day)
    for attempt in range(tries):
        try:
            r = get(url, timeout=45, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 404:
                return decode(b"", day, SCALE.get(sym, 1000.0))
            r.raise_for_status()
            return decode(r.content, day, SCALE.get(sym, 1000.0))
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def load_minutes(sym: str, start: date, end: date, data_dir: str = "data", workers: int = 8, client=None,
                 max_fetch: int | None = None) -> pd.DataFrame:
    """1-minute bars from `start` to `end` (inclusive, UTC days). Days that fail are skipped with a warning and tried
    again next run; finished months are cached for good. `max_fetch` caps how many days are downloaded in this call
    (newest first), so a short scheduled run never stalls on a large first download; the long jobs fill the rest."""
    import httpx

    get = client.get if client is not None else httpx.Client(follow_redirects=True).get
    cache = Path(data_dir) / "dukascopy" / sym
    cache.mkdir(parents=True, exist_ok=True)
    today = date.today()
    budget = max_fetch if max_fetch is not None else 10**9
    parts, months = [], list(pd.period_range(start, end, freq="M"))[::-1]  # newest first: live use needs recent days
    for m in months:
        mfile = cache / f"{m}.parquet"
        finished = m.end_time.date() < today - timedelta(days=2)  # the provider publishes a day after it ends
        if finished and mfile.exists():
            parts.append(pd.read_parquet(mfile))
            continue
        days = [d.date() for d in pd.date_range(max(m.start_time.date(), start), min(m.end_time.date(), end, today - timedelta(days=1)))]
        dfile = cache / f"{m}.days.parquet"
        have = pd.read_parquet(dfile) if dfile.exists() else pd.DataFrame()
        done = set(pd.DatetimeIndex(have.index).tz_convert("UTC").date) if len(have) else set()
        # Saturdays are always closed; holidays come back empty and are simply asked for again next run (cheap)
        todo = [d for d in days if d not in done and d.weekday() != 5]
        skipped = max(0, len(todo) - budget)
        todo = sorted(todo, reverse=True)[:budget]
        budget -= len(todo)
        fetched, failed = [], skipped
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for d, res in zip(todo, pool.map(lambda d: _safe(sym, d, get), todo)):
                if res is None:
                    failed += 1
                else:
                    fetched.append(res)
        if failed - skipped:
            print(f"warning: dukascopy {sym} {m}: {failed - skipped} day(s) failed, will retry next run", flush=True)
        month_df = pd.concat([have, *fetched]) if len(have) or fetched else pd.DataFrame()
        if len(month_df):
            month_df = month_df[~month_df.index.duplicated(keep="last")].sort_index()
        if finished and not failed:
            month_df.to_parquet(mfile)
            dfile.unlink(missing_ok=True)
        elif len(month_df):
            month_df.to_parquet(dfile)
        parts.append(month_df)
    parts = [p for p in parts if len(p)]
    if not parts:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    out = pd.concat(parts)
    return out[~out.index.duplicated(keep="last")].sort_index()


def _safe(sym, day, get):
    try:
        return fetch_day(sym, day, get)
    except Exception:
        return None


def resample(minutes: pd.DataFrame, tf: str) -> pd.DataFrame:
    if not len(minutes):
        return minutes
    agg = minutes.resample(RULE[tf], label="left", closed="left").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
    return agg.dropna(subset=["close"])


def splice(recent: pd.DataFrame, history: pd.DataFrame, min_overlap: int = 50, join_bars: int = 4) -> pd.DataFrame:
    """Spot `history` is the backbone; `recent` (Yahoo futures) only fills the hours after it (Dukascopy publishes a day
    once it has ended), scaled to the spot price at that join.

    Why not the other way round: Yahoo's continuous futures series jumps by ~1-2% whenever the contract rolls (every
    couple of months), which shows up as fake returns. Spot XAU/USD has no rolls, and it is what Exness trades.
    Returns `recent` unchanged when the two overlap too little to join safely."""
    if not len(history) or not len(recent):
        return recent
    h = history.copy()
    if recent.index.tz is not None:
        h.index = h.index.tz_convert(recent.index.tz)
    both = recent.index.intersection(h.index).sort_values()  # intersection() does not promise time order
    if len(both) < min_overlap:
        print(f"warning: only {len(both)} overlapping bars with the long history; using recent bars only", flush=True)
        return recent
    # scale with the last few shared bars only: the futures/spot ratio drifts and jumps at rolls
    near = both[-join_bars:]
    ratio = float(np.median(h.loc[near, "close"] / recent.loc[near, "close"]))
    rv, hv = recent.loc[both, "volume"], h.loc[both, "volume"]
    vol = float(hv[hv > 0].median() / rv[rv > 0].median()) if (rv > 0).any() and (hv > 0).any() else 1.0
    tail = recent[recent.index > h.index[-1]].copy()
    tail[["open", "high", "low", "close"]] *= ratio
    tail["volume"] *= vol
    return pd.concat([h, tail])
