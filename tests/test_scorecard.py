import numpy as np
import pandas as pd

from core import scorecard


def frame(n=3000, seed=0, planted=0.0):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2010-01-01", periods=n, freq="B")
    X = pd.DataFrame({"real_yield_ret5": rng.normal(size=n), "dxy_ret5": rng.normal(size=n), "breakeven_ret20": rng.normal(size=n),
                      "vix_ret5": rng.normal(size=n), "silver_ret5": rng.normal(size=n), "ma_gap_50": rng.normal(size=n),
                      "rsi": rng.uniform(10, 90, n), "cot_mm_rank3y": rng.uniform(0, 1, n), "news_sent_mean": rng.normal(0, 0.2, n),
                      "fed_funds_ret20": rng.choice([-0.25, 0.0, 0.25], n)}, index=idx)
    # planted: a falling dollar really does raise gold
    fwd = pd.Series(rng.normal(0, 0.01, n) - planted * np.sign(X["dxy_ret5"]) * 0.01, index=idx)
    fwd.iloc[-1] = np.nan  # the latest day's outcome is not known yet
    return X, fwd


def test_signals_follow_the_written_rules():
    X = pd.DataFrame({"real_yield_ret5": [-0.1, 0.1, 0.0], "rsi": [25, 50, 75], "cot_mm_rank3y": [0.1, 0.5, 0.9]})
    S = scorecard.factor_signals(X)
    assert list(S["real_yield"]) == [1, -1, 0] and list(S["rsi"]) == [1, 0, -1] and list(S["positioning"]) == [1, 0, -1]
    assert "dollar" not in S  # a factor without its input is left out, not guessed


def test_no_planted_effect_means_about_fifty_percent():
    sc = scorecard.build(*frame())
    for f in sc["full"]["factors"].values():
        assert abs(f["any"]["rate"] - 0.5) < 0.05


def test_a_real_effect_is_measured_and_the_total_matches_past_agreement():
    X, fwd = frame(planted=1.0)
    sc = scorecard.build(X, fwd)
    assert sc["full"]["factors"]["dollar"]["any"]["rate"] > 0.75
    # the total is the hit rate of past days that agreed at least as strongly, in the same direction, as today
    S = scorecard.factor_signals(X); net = S.sum(axis=1); k, d = abs(net.iloc[-1]), np.sign(net.iloc[-1])
    sel = fwd.notna() & (np.sign(net) == d) & (net.abs() >= k)
    want = ((fwd[sel] > 0) if d > 0 else (fwd[sel] <= 0)).mean() if d != 0 else None
    if d != 0:
        assert sc["full"]["total"]["n"] == int(sel.sum()) and abs(sc["full"]["total"]["rate"] - want) < 1e-3
    assert sc["recent"]["base_up"]["n"] < sc["full"]["base_up"]["n"]
    assert sc["now"] == {k: int(v) for k, v in S.iloc[-1].items()}
