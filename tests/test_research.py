"""The study must be trustworthy before its verdicts are: no phantom edges, real edges found, hold-out never touched."""
import numpy as np
import pandas as pd

from core import pipeline
from core.features import build_features, make_target
from research import study

CFG = {"signal_threshold": 0.55}
INST = {"minutes_per_day": 1380, "cost_bps": 1.0}
HZ = {"name": "1d", "tf": "D1", "steps": 1}


def series(n: int, ar: float, seed: int) -> pd.DataFrame:
    """Daily bars whose returns follow r[t] = ar * r[t-1] + noise. ar = 0 is a pure random walk."""
    rng = np.random.default_rng(seed)
    r = np.zeros(n)
    for t in range(1, n):
        r[t] = ar * r[t - 1] + rng.normal(0, 0.01)
    close = 100 * np.exp(np.cumsum(r))
    open_ = np.r_[close[0], close[:-1]]
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.002, n)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.002, n)))
    idx = pd.date_range("2015-01-01", periods=n, freq="B")
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": 1000}, index=idx)


def prepare(df):
    X = build_features(df, "D1")
    y, fwd = make_target(df, HZ["steps"])
    ok = y.notna() & X[pipeline._core_cols(X)].notna().all(axis=1)
    return df, X[ok], y[ok], fwd[ok]


def run(df, models=("lgbm", "logit")):
    df, X, y, fwd = prepare(df)
    return study.study_horizon("x", CFG, INST, HZ, df, X, y, fwd, list(models), log=lambda *_: None)


def test_random_walk_never_gets_an_edge():
    for seed in (1, 2):
        res = run(series(2600, 0.0, seed))
        assert res["holdout"]["has_edge"] is False, res["holdout"]["reason"]
        assert res["holdout"]["auc_ci"][0] <= 0.5 <= res["holdout"]["auc_ci"][1] + 0.05


def test_a_planted_signal_is_found():
    res = run(series(3000, 0.35, 7))
    h = res["holdout"]
    assert h["auc_ci"][0] > 0.5, h
    assert h["has_edge"] is True, h["reason"]
    assert h["accuracy"] > h["baseline_accuracy"] + 0.01


def test_holdout_labels_never_influence_development_scores():
    """Flip every label in the hold-out part: if development scoring ever read it, these scores would change."""
    df, X, y, fwd = prepare(series(2200, 0.2, 3))
    dev_n = int(len(X) * (1 - study.HOLDOUT_FRAC))
    clean = study.dev_score(X, y, HZ["steps"], dev_n, "tech+", "lgbm")
    y2 = y.copy()
    y2.iloc[dev_n:] = 1 - y2.iloc[dev_n:]
    poisoned = study.dev_score(X, y2, HZ["steps"], dev_n, "tech+", "lgbm")
    assert clean["auc"] == poisoned["auc"] and clean["fold_auc"] == poisoned["fold_auc"]


def test_result_records_its_own_protocol_and_candidate_count():
    res = run(series(2000, 0.0, 5), models=("lgbm",))
    assert res["protocol"]["holdout_fraction"] == 0.2 and res["protocol"]["candidates_tested"] == len(res["candidates"])
    assert res["selected"]["dev_note"].startswith("best of")
    assert set(res["holdout"]["checks"]) == {"enough_rows", "auc_interval_above_half", "accuracy_beats_guessing",
                                             "positive_return_after_costs", "enough_trades"}
    assert len(res["holdout"]["high_confidence"]) == 3 and res["holdout"]["selective"]["by_probability"][0]["coverage"] == 1.0


def test_selective_and_high_confidence_tables():
    p = np.array([0.9, 0.8, 0.7, 0.55, 0.45, 0.2])
    y = np.array([1, 1, 0, 1, 0, 0])
    sel = study.selective_table(p, y, np.abs(p - 0.5))
    assert [r["coverage"] for r in sel] == [1.0, 0.5, 0.25, 0.1]
    # the 3 most confident calls are 0.9, 0.8 and 0.2 (the 0.7 call is less sure than the 0.2 one): all three are right
    assert sel[1]["n"] == 3 and sel[1]["accuracy"] == 1.0
    assert sel[0]["accuracy"] == round(5 / 6, 4)  # keeping everything: 0.7 -> predicted up, was down, so 5 of 6
    hc = {r["says_at_least"]: r for r in study.high_confidence_table(p, y)}
    assert hc[0.8]["n"] == 3 and hc[0.8]["accuracy"] == 1.0
    assert study.high_confidence_table(np.array([0.5, 0.52]), np.array([1, 0]))[2]["n"] == 0
