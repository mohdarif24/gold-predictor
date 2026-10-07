import lzma
import struct
from datetime import date

import numpy as np
import pandas as pd
import pytest

from core import dukascopy


def _blob(rows):
    return lzma.compress(b"".join(struct.pack(">5if", *r) for r in rows), format=lzma.FORMAT_ALONE)


def test_decode_reads_dukascopy_candles_and_drops_closed_market_minutes():
    rows = [(0, 1902935, 1902035, 1901805, 1903128, 0.05),  # seconds, open, close, low, high (x1000), volume
            (60, 1902035, 1902100, 1902000, 1902200, 0.02),
            (120, 1902100, 1902100, 1902100, 1902100, 0.0)]  # flat and no volume: market closed
    df = dukascopy.decode(_blob(rows), date(2023, 3, 15), 1000.0)
    assert len(df) == 2
    assert df.index[1] == pd.Timestamp("2023-03-15 00:01", tz="UTC")
    assert df.iloc[0][["open", "high", "low", "close"]].tolist() == [1902.935, 1903.128, 1901.805, 1902.035]


def test_fetch_retries_and_treats_404_as_an_empty_day():
    calls = []

    class R:
        def __init__(self, code, content=b""):
            self.status_code, self.content = code, content

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(self.status_code)

    def flaky(url, **k):
        calls.append(url)
        return R(500) if len(calls) == 1 else R(200, _blob([(0, 1000000, 1001000, 999000, 1002000, 1.0)]))

    df = dukascopy.fetch_day("XAUUSD", date(2024, 1, 2), flaky, tries=3)
    assert len(df) == 1 and len(calls) == 2
    assert "/2024/00/02/" in calls[0]  # Dukascopy months start at 00
    assert dukascopy.fetch_day("XAUUSD", date(2024, 1, 6), lambda u, **k: R(404)).empty


def test_splice_keeps_spot_history_and_adds_only_newer_futures_bars_without_a_jump():
    idx = pd.date_range("2026-01-01", periods=400, freq="15min", tz="UTC")
    spot = pd.Series(2000 + np.cumsum(np.random.default_rng(0).normal(0, 1, 400)), index=idx)
    full = pd.DataFrame({"open": spot, "high": spot + 1, "low": spot - 1, "close": spot, "volume": 2.0})
    hist = full.iloc[:360]  # spot published up to bar 359; the last 40 bars only exist in the futures feed
    # futures = spot x 1.000 until bar 300, then the contract rolls and futures sit 1.5% higher (a fake jump)
    ratio = np.where(np.arange(400) < 300, 1.000, 1.015)
    fut = full.iloc[200:].copy()
    fut[["open", "high", "low", "close"]] = fut[["open", "high", "low", "close"]].mul(ratio[200:], axis=0)
    fut["volume"] = 500.0
    fut.index = fut.index.tz_convert("America/New_York")
    out = dukascopy.splice(fut, hist, min_overlap=50)
    assert len(out) == 400 and out.index.is_monotonic_increasing
    r = out["close"].pct_change()
    assert np.allclose(r.iloc[1:], spot.pct_change().iloc[1:])  # the roll jump is gone; every return is the spot return
    assert np.allclose(out["close"].iloc[-40:], spot.iloc[-40:])  # newest bars scaled back to the spot price
    assert out["volume"].iloc[-1] == pytest.approx(2.0)  # and to the spot volume level
    assert dukascopy.splice(fut, hist.iloc[:220], min_overlap=50) is fut  # too little overlap: recent bars only


def test_resample_to_15_minutes():
    idx = pd.date_range("2026-01-01 00:00", periods=30, freq="1min", tz="UTC")
    m = pd.DataFrame({"open": np.arange(30.0), "high": np.arange(30.0) + 1, "low": np.arange(30.0) - 1,
                      "close": np.arange(30.0) + 0.5, "volume": 1.0}, index=idx)
    r = dukascopy.resample(m, "M15")
    assert len(r) == 2 and r.iloc[0].tolist() == [0.0, 15.0, -1.0, 14.5, 15.0]
