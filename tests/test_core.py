import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import shadow, store
from core.backtest import evaluate, walk_forward
from core.features import build_features, make_target
from core.signal import decide


def synthetic(n=3000, tf_min=15, seed=0):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq=f"{tf_min}min")
    close = 2000 * np.exp(np.cumsum(rng.normal(0, 0.001, n)))
    open_ = np.r_[close[0], close[:-1]]
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.0005, n)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.0005, n)))
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close,
                         "volume": rng.integers(100, 1000, n), "spread": rng.integers(10, 30, n)}, index=idx)


def test_no_lookahead_in_features():
    df = synthetic()
    full = build_features(df, "M15")
    cut = build_features(df.iloc[:2000], "M15")
    pd.testing.assert_frame_equal(full.iloc[:2000], cut, check_exact=False, atol=1e-9)


def test_target_uses_future_only():
    df = synthetic(200)
    y, fwd = make_target(df, 3)
    assert np.isclose(fwd.iloc[10], df["close"].iloc[13] / df["close"].iloc[10] - 1)
    assert y.iloc[-3:].isna().all()


def test_random_walk_has_no_edge():
    df = synthetic(4000)
    X = build_features(df, "M15").iloc[100:]
    y, fwd = make_target(df, 4)
    ok = y.notna()
    X, y, fwd = X[ok[X.index]], y[X.index][ok[X.index]], fwd[X.index][ok[X.index]]
    oof = walk_forward(X, y, 4)
    m = evaluate(oof, fwd, 4, 0.55, 2.0, 252 * 25)
    assert m["has_edge"] is False


def test_signal_waits_without_edge_or_when_abnormal():
    assert decide(0.9, False, "TRENDING", 0.55)[0] == "WAIT"
    assert decide(0.9, True, "ABNORMAL", 0.55)[0] == "WAIT"
    assert decide(0.6, True, "TRENDING", 0.55)[0] == "BUY"
    assert decide(0.4, True, "TRENDING", 0.55)[0] == "SELL"
    assert decide(0.5, True, "TRENDING", 0.55)[0] == "WAIT"


def test_pipeline_smoke_with_htf(db):
    """XAU-style config (M5 + H1/H4 higher-timeframe features + D1) end to end on synthetic bars."""
    from core import pipeline
    cfg = {
        "signal_threshold": 0.55,
        "shadow": {"sl_atr": 1.5, "tp_atr": 2.0},
        "instruments": {"x": {"minutes_per_day": 1380, "cost_bps": 1.5, "htf": ["H1", "H4"],
                              "horizons": [{"name": "30m", "tf": "M5", "steps": 6},
                                           {"name": "1d", "tf": "D1", "steps": 1}]}},
    }
    data = {"M5": synthetic(6000, 5, 1), "H1": synthetic(1500, 60, 2), "H4": synthetic(600, 240, 3),
            "D1": synthetic(1500, 1440, 4)}
    get_bars = lambda tf: data[tf]
    rep = pipeline.train("x", cfg, get_bars, lambda: {}, db)
    assert set(rep) == {"30m", "1d"}
    assert set(store.load_report(db, "x")) == {"30m", "1d"}
    out = pipeline.predict("x", cfg, get_bars, lambda: {}, db)
    assert all(r["signal"] in ("BUY", "SELL", "WAIT") and r["is_new"] for r in out)
    again = pipeline.predict("x", cfg, get_bars, lambda: {}, db)  # same bars: nothing new, no duplicate rows
    assert not any(r["is_new"] for r in again)
    X = build_features(data["M5"], "M5", {"H1": data["H1"], "H4": data["H4"]})
    assert {"H1_trend", "H4_rsi"} <= set(X.columns)


def test_shadow_sl_tp_logic(db):
    idx = pd.date_range("2024-01-01", periods=6, freq="h")
    bars = pd.DataFrame({"open": 100.0, "high": [100, 100.5, 103, 100, 100, 100],
                         "low": [100, 99.5, 99.5, 100, 100, 100], "close": 100.0}, index=idx)
    rec = {"created": "x", "instrument": "x", "horizon": "1h", "tf": "H1", "steps": 3, "bar_ts": str(idx[0]),
           "price": 100.0, "atr": 1.0, "p_up": 0.7, "signal": "BUY", "regime": "TRENDING", "has_edge": 1,
           "model_version": "v", "reason": "r"}
    pid = store.log_prediction(db, rec)
    shadow.open_trade(db, pid, rec, {"sl_atr": 1.5, "tp_atr": 2.0})
    shadow.update_trades(db, "x", lambda tf: bars, cost_bps=0)
    t = db.execute("SELECT * FROM shadow_trades").fetchone()
    # bar 2 has high 103 (>= TP 102) and low 99.5 (> SL 98.5): TP hit
    assert t["status"] == "TP" and np.isclose(t["pnl_pct"], 0.02)
    assert store.log_prediction(db, rec) is None  # duplicate bar is ignored
