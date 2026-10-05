import io

import joblib
import numpy as np
import pandas as pd
import pytest

from core.models import ALL_MODELS, MetaLabeled, context_rows, fit, make_model


def data(n=700, seed=0):
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(rng.normal(size=(n, 6)), columns=list("abcdef"))
    X.loc[::17, "b"] = np.nan  # models must cope with missing values
    y = pd.Series((X["a"].fillna(0) * 0.8 + rng.normal(size=n) > 0).astype(float))
    return X, y


@pytest.mark.parametrize("name", ALL_MODELS)
def test_every_model_fits_predicts_and_survives_pickling(name):
    if name == "lstm":
        pytest.importorskip("torch")
    X, y = data()
    m = fit(X.iloc[:500], y.iloc[:500], name)
    k = context_rows(m)
    p = m.predict_proba(X.iloc[500 - k:700])
    assert p.shape == (200 + k, 2)
    assert np.all((p >= 0) & (p <= 1)) and np.allclose(p.sum(axis=1), 1, atol=1e-6)
    buf = io.BytesIO()
    joblib.dump(m, buf)
    again = joblib.load(io.BytesIO(buf.getvalue()))
    np.testing.assert_allclose(again.predict_proba(X.iloc[500 - k:700]), p, atol=1e-5)


@pytest.mark.parametrize("name", ["lgbm", "xgb", "rf", "et", "logit", "ridge", "mlp", "stack", "blend"])
def test_models_learn_a_real_signal(name):
    """Sanity: with a genuine relationship in the data, every model must beat chance out of sample."""
    from sklearn.metrics import roc_auc_score
    X, y = data(1500)
    m = fit(X.iloc[:1000], y.iloc[:1000], name)
    assert roc_auc_score(y.iloc[1000:], m.predict_proba(X.iloc[1000:])[:, 1]) > 0.7


def test_meta_labeling_scores_confident_calls_as_more_reliable():
    X, y = data(2500, seed=3)
    m = MetaLabeled("lgbm").fit(X.iloc[:1800], y.iloc[:1800])
    Xt, yt = X.iloc[1800:], y.iloc[1800:]
    conf = m.predict_confidence(Xt)
    right = ((m.predict_proba(Xt)[:, 1] >= 0.5).astype(int) == yt.values)
    top = conf >= np.quantile(conf, 0.7)
    assert right[top].mean() >= right.mean()
    assert conf.min() >= 0 and conf.max() <= 1


def test_lstm_uses_context_rows_and_pads_short_history():
    pytest.importorskip("torch")
    X, y = data(400)
    m = make_model("lstm").fit(X.iloc[:300], y.iloc[:300])
    assert m.context == 29
    assert m.predict_proba(X.iloc[300:301]).shape == (1, 2)  # a single row still works (history is padded)


def test_unknown_model_name_is_rejected():
    with pytest.raises(ValueError):
        make_model("magic")
