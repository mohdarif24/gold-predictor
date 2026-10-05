import numpy as np
import pandas as pd

from core.explain import explain, recency
from core.features import feature_group
from core.models import fit


def data(n=900, seed=0):
    rng = np.random.default_rng(seed)
    X = pd.DataFrame({
        "rsi": rng.normal(size=n),            # technical: no effect
        "bb_pctb": rng.normal(size=n),        # technical_extra: no effect
        "dxy_ret1": rng.normal(size=n),       # macro, a latest-data input: drives the outcome
        "dxy_lvlz": rng.normal(size=n),       # macro, background: no effect
        "cot_mm_net": rng.normal(size=n),     # positioning: no effect
    })
    y = pd.Series((X["dxy_ret1"] * 1.5 + rng.normal(size=n) * 0.5 > 0).astype(float))
    return X, y


def test_explanation_points_at_the_input_that_really_matters():
    X, y = data()
    m = fit(X.iloc[:700], y.iloc[:700], "lgbm")
    medians = X.iloc[:700].median().to_dict()
    row = X.iloc[[700]].copy()
    row["dxy_ret1"] = 2.5  # a strong, clearly positive reading
    ex = explain(m, row, medians)
    assert ex["top"][0]["feature"] == "dxy_ret1" and ex["top"][0]["push"] > 0
    assert ex["groups"]["macro"]["share"] > 0.5
    assert abs(sum(g["share"] for g in ex["groups"].values()) - 1) < 1e-3  # each share is rounded to 4 places
    assert ex["recency"]["latest"]["share"] > ex["recency"]["background"]["share"]  # dxy_ret1 is a latest-data input


def test_a_negative_reading_pushes_the_other_way():
    X, y = data(seed=1)
    m = fit(X.iloc[:700], y.iloc[:700], "lgbm")
    row = X.iloc[[701]].copy()
    row["dxy_ret1"] = -2.5
    ex = explain(m, row, X.iloc[:700].median().to_dict())
    assert ex["top"][0]["push"] < 0 and ex["groups"]["macro"]["push"] < 0


def test_works_for_models_that_need_context_and_for_nan_inputs():
    X, y = data(seed=2)
    X.loc[:, "cot_mm_net"] = np.nan  # an input that is entirely missing must not break anything
    for name in ("logit", "rf"):
        m = fit(X.iloc[:700], y.iloc[:700], name)
        ex = explain(m, X.iloc[[700]], {c: (0.0 if X[c].isna().all() else float(X[c].median())) for c in X.columns})
        assert 0 <= ex["p_up"] <= 1 and len(ex["top"]) == 5


def test_groups_and_recency_labels():
    assert feature_group("dxy_ret5") == "macro" and feature_group("x_curve_10y3m") == "macro"
    assert feature_group("cot_mm_net") == "positioning" and feature_group("cal_days_to_nfp") == "calendar"
    assert feature_group("news_sent_mean") == "news" and feature_group("bb_pctb") == "technical_extra"
    assert feature_group("rsi") == "technical" and feature_group("volume_z") == "technical"  # '_z' is not a macro suffix
    assert recency("ret_1") == "latest" and recency("vix_ret1") == "latest" and recency("news_sent_3d") == "latest"
    assert recency("ma_gap_50") == "background" and recency("cot_mm_rank3y") == "background"
