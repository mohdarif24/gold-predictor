"""yfinance data with a local parquet cache, so intraday history (limited to ~60 days) keeps growing over time."""
from pathlib import Path

import pandas as pd
import yfinance as yf

from core.features import TF_MINUTES

INTERVAL = {"M5": ("5m", "60d"), "M15": ("15m", "60d"), "H1": ("60m", "730d"), "D1": ("1d", "max")}


def sanitize(df: pd.DataFrame) -> pd.DataFrame:
    """Drop bars whose price is off the local median by >2x (yfinance sometimes returns wrong-scale bars)."""
    med = df["close"].rolling(11, center=True, min_periods=3).median()
    ratio = df["close"] / med
    wild = df[["open", "high", "low"]].div(df["close"], axis=0)
    bad = (ratio < 0.5) | (ratio > 2) | (wild > 2).any(axis=1) | (wild < 0.5).any(axis=1)
    if bad.any():
        print(f"warning: dropped {int(bad.sum())} bad bars")
    return df[~bad]


def get_bars(symbol: str, tf: str, data_dir: str = "data") -> pd.DataFrame:
    interval, period = INTERVAL[tf]
    path = Path(data_dir) / f"{symbol.replace('^', '').replace('=', '_')}_{tf}.parquet"
    path.parent.mkdir(parents=True, exist_ok=True)
    new = yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=False)
    new = new.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna(subset=["close"])
    if path.exists():
        old = pd.read_parquet(path)
        new = pd.concat([old, new])
        new = new[~new.index.duplicated(keep="last")].sort_index()
    new = sanitize(new)
    if len(new):
        new.to_parquet(path)
    # drop the still-forming last bar so training and prediction only see completed bars
    now = pd.Timestamp.now(tz=new.index.tz)
    if tf == "D1":
        new = new[new.index.normalize() < now.normalize()]
    else:
        new = new[new.index + pd.Timedelta(minutes=TF_MINUTES[tf]) <= now]
    return new


def get_drivers(drivers_cfg: dict) -> dict:
    """Daily close series for macro drivers; missing ones are skipped rather than failing."""
    out = {}
    for name, sym in drivers_cfg.items():
        try:
            h = yf.Ticker(sym).history(period="max", interval="1d")["Close"].dropna()
            h.index = h.index.tz_localize(None).normalize()
            out[name] = h
        except Exception as e:  # network / delisted ticker
            print(f"warning: driver {name} ({sym}) unavailable: {e}")
    return out
