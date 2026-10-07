import numpy as np
import pandas as pd
import pytest

from core.models import Weighted, fit, make_model, sample_weights


def test_weights_favour_recent_rows_and_balance_up_and_down():
    y = np.array([1] * 700 + [0] * 300)
    w = sample_weights(y, half_life_frac=0.25)
    assert w.mean() == pytest.approx(1.0)
    rec = sample_weights(np.array([1, 0] * 500), half_life_frac=0.25)
    assert rec[-1] / rec[-3] < 1.01 and rec[-1] > rec[1] * 10  # newest rows count far more than the oldest
    plain = sample_weights(np.array([1, 0] * 50), half_life_frac=1e9)  # no recency: equal classes -> equal weights
    assert np.allclose(plain, 1.0)
    flat = sample_weights(y, half_life_frac=1e9)
    assert flat[y == 1].sum() == pytest.approx(flat[y == 0].sum())  # up and down count the same in total


@pytest.mark.parametrize("name", ["lgbm_w", "xgb_w", "et_w"])
def test_weighted_models_train_and_lose_the_majority_lean(name):
    rng = np.random.default_rng(1)
    X = pd.DataFrame(rng.normal(size=(800, 5)), columns=list("abcde"))
    y = pd.Series((rng.random(800) < 0.7).astype(int))  # 70% "up", no real signal
    m = fit(X, y, name)
    assert isinstance(make_model(name), Weighted)
    p_w = m.predict_proba(X)[:, 1].mean()
    p_plain = fit(X, y, name[:-2]).predict_proba(X)[:, 1].mean()
    assert p_w < p_plain  # balancing pulls the average call back from the 70% majority
