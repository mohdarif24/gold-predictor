"""The free inputs added on 2026-10-07: they must never show a value before it was public."""
import io

import numpy as np
import pandas as pd
import pytest

from core import sources
from core.features import build_features, feature_group


def _bars(start="2024-01-01", days=400, tf="D1"):
    if tf == "D1":
        idx = pd.bdate_range(start, periods=days)
    else:
        idx = pd.date_range(start, periods=days, freq="15min", tz="America/New_York")
    c = pd.Series(100 + np.cumsum(np.random.default_rng(0).normal(0, 1, len(idx))), index=idx)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c, "volume": 1.0}, index=idx)


def test_monthly_release_is_invisible_until_its_publication_lag():
    df = _bars()
    # CPI for March 2024 (dated 2024-03-01) moved forward by a 45-day lag -> first public 2024-04-15
    cpi = pd.Series([300.0, 301.0, 330.0], index=pd.to_datetime(["2024-01-01", "2024-02-01", "2024-03-01"]) + pd.Timedelta(days=45))
    f = build_features(df, "D1", drivers={"cpi": cpi})
    jump = f["cpi_ret1"]
    assert jump.loc[:"2024-04-15"].dropna().abs().max() < 0.01  # before (and on) the release day only the small move is known
    assert jump.loc["2024-04-16"] == pytest.approx(330 / 301 - 1)  # the next day the big jump is visible


def test_changes_use_each_market_s_own_calendar():
    df = _bars()
    btc_idx = pd.date_range("2023-06-01", "2025-06-01", freq="D")  # trades every day
    btc = pd.Series(np.arange(len(btc_idx), dtype=float) + 100, index=btc_idx)
    gold_idx = pd.bdate_range("2023-06-01", "2025-06-01")
    gold = pd.Series(np.arange(len(gold_idx), dtype=float) + 1000, index=gold_idx)
    f = build_features(df, "D1", drivers={"btc": btc, "global_gold": gold})
    # gold's 5-change is 5 of gold's own trading days (+5), not 5 calendar days that include Bitcoin weekends
    assert f["global_gold_ret5"].dropna().map(lambda r: r > 0).all()
    mon = f.index[f.index.dayofweek == 0][10]
    expected = gold.loc[:mon - pd.Timedelta(days=1)].iloc[-1] / gold.loc[:mon - pd.Timedelta(days=1)].iloc[-6] - 1
    assert f.loc[mon, "global_gold_ret5"] == pytest.approx(expected)


def test_india_calendar_and_sessions():
    f = build_features(_bars("2025-10-01", 30), "D1")
    assert f.loc["2025-10-17", "cal_days_to_dhanteras"] == 1  # Diwali 2025-10-20, Dhanteras two days earlier
    assert f.loc["2025-10-17", "cal_india_festival_window"] == 1
    assert {"cal_india_wedding_season", "cal_days_to_akshaya", "cal_days_to_india_budget"} <= set(f.columns)
    assert all(feature_group(c) == "calendar" for c in f.columns if c.startswith("cal_india") or c.startswith("cal_days_to_"))
    g = build_features(_bars("2025-03-03", 200, tf="M15"), "M15")
    london = g.index.tz_convert("UTC").hour == 9
    assert g.loc[london, "sess_london"].eq(1).all() and g.loc[london, "sess_asia"].eq(0).all()


def test_india_budget_days():
    d = sources.india_budget_days(range(2015, 2020))
    assert pd.Timestamp("2016-02-29") in d and pd.Timestamp("2017-02-01") in d and pd.Timestamp("2019-07-05") in d


def test_gpr_loader_parses_lags_and_falls_back_to_cache(tmp_path):
    raw = pd.DataFrame({"DAY": [20260101, 20260102], "GPRD_MA7": [100.0, 110.0], "GPRD_THREAT": [90.0, 95.0], "N10D": [1, 2]})
    buf = io.BytesIO()
    raw.to_csv(buf, index=False)

    class Resp:
        content = b""
        def raise_for_status(self):
            pass

    class Client:
        def get(self, *a, **k):
            return Resp()

    real = pd.read_excel
    try:
        pd.read_excel = lambda b: raw  # the parsing, not xlrd, is under test
        out = sources.load_gpr({"url": "https://x", "lag": 7}, str(tmp_path), client=Client())
    finally:
        pd.read_excel = real
    assert out["gpr"].index[0] == pd.Timestamp("2026-01-08") and out["gpr_threat"].iloc[1] == 95.0

    class Down:
        def get(self, *a, **k):
            raise OSError("offline")
    again = sources.load_gpr({"url": "https://x", "lag": 7}, str(tmp_path), client=Down())
    assert list(again["gpr"].values) == [100.0, 110.0]
    assert sources.load_gpr({"url": "https://x"}, str(tmp_path / "empty"), client=Down()) == {}
