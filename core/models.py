"""Every model the research harness compares, behind one interface: fit(X, y) and predict_proba(X) -> [[p_down, p_up]].

Single models  : lgbm, xgb, rf, et, logit (elastic-net), ridge (L2), mlp, lstm
Combinations   : Blend (average), Stack (a small linear model learns how to weigh them), MetaLabeled (a second model
                 estimates how often the first one is right, so low-confidence calls can be skipped)
Models that need earlier rows to predict (LSTM) expose `context`: how many rows before the first row to supply.
"""
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import TimeSeriesSplit
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SINGLE = ["lgbm", "xgb", "rf", "et", "logit", "ridge", "mlp", "lstm"]
# the same trees, trained with recent rows counting more and up / down days counting equally (see Weighted)
WEIGHTED = ["lgbm_w", "xgb_w", "et_w"]
COMBINED = ["blend", "stack", "meta"]
ALL_MODELS = SINGLE + WEIGHTED + COMBINED
FAST_BASES = ["lgbm", "xgb", "rf", "et", "logit"]  # members of blend / stack (keeps training time bounded)


def new_model() -> lgb.LGBMClassifier:
    return lgb.LGBMClassifier(
        n_estimators=200, learning_rate=0.03, num_leaves=15, min_child_samples=50,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0,
        random_state=42, verbose=-1,
    )


def _prep(est):
    """Linear / neural models cannot take NaN and need comparable scales."""
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), est)


def make_model(name: str, seed: int = 42):
    if name == "lgbm":
        return new_model()
    if name == "xgb":
        from xgboost import XGBClassifier
        return XGBClassifier(n_estimators=200, max_depth=3, learning_rate=0.03, subsample=0.8, colsample_bytree=0.8,
                             min_child_weight=20, reg_lambda=5.0, eval_metric="logloss", tree_method="hist",
                             n_jobs=2, random_state=seed, verbosity=0)
    if name == "rf":
        return make_pipeline(SimpleImputer(strategy="median"),
                             RandomForestClassifier(n_estimators=300, min_samples_leaf=50, max_features="sqrt",
                                                    n_jobs=2, random_state=seed))
    if name == "et":
        return make_pipeline(SimpleImputer(strategy="median"),
                             ExtraTreesClassifier(n_estimators=300, min_samples_leaf=50, max_features="sqrt",
                                                  n_jobs=2, random_state=seed))
    if name == "logit":
        return _prep(LogisticRegression(solver="saga", l1_ratio=0.5, C=0.05, max_iter=3000, random_state=seed))
    if name == "ridge":
        return _prep(LogisticRegression(C=0.05, max_iter=3000, random_state=seed))
    if name == "mlp":
        return _prep(MLPClassifier(hidden_layer_sizes=(32, 16), alpha=1e-2, early_stopping=True, validation_fraction=0.15,
                                   n_iter_no_change=10, max_iter=300, random_state=seed))
    if name == "lstm":
        return LSTMClassifier(seed=seed)
    if name.endswith("_w") and name[:-2] in SINGLE:
        return Weighted(name[:-2], seed)
    if name == "blend":
        return Blend(FAST_BASES, seed)
    if name == "stack":
        return Stack(FAST_BASES, seed)
    if name == "meta" or name.startswith("meta:"):  # "meta:stack" = meta-label a stacked primary model
        return MetaLabeled(name.split(":", 1)[1] if ":" in name else "lgbm", seed)
    raise ValueError(f"unknown model {name!r}")


def fit(X, y, name: str = "lgbm", seed: int = 42):
    m = make_model(name, seed)
    m.fit(X, y.astype(int))
    return m


def context_rows(model) -> int:
    return int(getattr(model, "context", 0))


def _p_up(model, X) -> np.ndarray:
    return model.predict_proba(X)[:, 1]


# ----------------------------------------------------------------------------------------------- LSTM
try:
    import torch
    from torch import nn

    class _LSTMNet(nn.Module):
        # module level (not inside fit) so the trained model can be pickled into the database
        def __init__(self, n_in: int, hid: int):
            super().__init__()
            self.lstm = nn.LSTM(n_in, hid, batch_first=True)
            self.drop = nn.Dropout(0.3)
            self.out = nn.Linear(hid, 1)

        def forward(self, x):
            h, _ = self.lstm(x)
            return self.out(self.drop(h[:, -1])).squeeze(-1)

except ImportError:  # the LSTM is optional; everything else works without PyTorch
    torch = None


class LSTMClassifier:
    """Small LSTM over the last `seq_len` rows of features. Needs PyTorch (CPU is enough)."""

    def __init__(self, seq_len: int = 30, hidden: int = 32, epochs: int = 15, lr: float = 2e-3, seed: int = 42):
        self.seq_len, self.hidden, self.epochs, self.lr, self.seed = seq_len, hidden, epochs, lr, seed
        self.context = seq_len - 1

    def _arr(self, X) -> np.ndarray:
        a = X.to_numpy(dtype=float) if isinstance(X, pd.DataFrame) else np.asarray(X, dtype=float)
        a = np.where(np.isfinite(a), a, np.nan)
        a = np.where(np.isnan(a), self.med_, a)
        return (a - self.mu_) / self.sd_

    def _windows(self, a: np.ndarray) -> np.ndarray:
        pad = np.vstack([np.repeat(a[:1], self.seq_len - 1, axis=0), a])  # short history: repeat the first row
        return np.stack([pad[i:i + self.seq_len] for i in range(len(a))])

    def fit(self, X, y):
        if torch is None:
            raise ImportError("the LSTM model needs PyTorch (pip install torch)")
        torch.manual_seed(self.seed)
        torch.set_num_threads(2)
        raw = X.to_numpy(dtype=float) if isinstance(X, pd.DataFrame) else np.asarray(X, dtype=float)
        raw = np.where(np.isfinite(raw), raw, np.nan)
        self.med_ = np.nan_to_num(np.nanmedian(raw, axis=0))
        self.mu_ = np.nanmean(np.where(np.isnan(raw), self.med_, raw), axis=0)
        self.sd_ = np.nanstd(np.where(np.isnan(raw), self.med_, raw), axis=0) + 1e-9
        w = torch.tensor(self._windows(self._arr(X)), dtype=torch.float32)
        t = torch.tensor(np.asarray(y, dtype=float), dtype=torch.float32)

        self.net_ = _LSTMNet(w.shape[2], self.hidden)
        opt = torch.optim.AdamW(self.net_.parameters(), lr=self.lr, weight_decay=1e-2)
        loss_fn = nn.BCEWithLogitsLoss()
        g = torch.Generator().manual_seed(self.seed)
        self.net_.train()
        for _ in range(self.epochs):
            order = torch.randperm(len(w), generator=g)
            for i in range(0, len(w), 256):
                idx = order[i:i + 256]
                opt.zero_grad()
                loss_fn(self.net_(w[idx]), t[idx]).backward()
                opt.step()
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X) -> np.ndarray:
        self.net_.eval()
        with torch.no_grad():
            p = torch.sigmoid(self.net_(torch.tensor(self._windows(self._arr(X)), dtype=torch.float32))).numpy()
        return np.column_stack([1 - p, p])


# ----------------------------------------------------------------------------------------------- weighting
def sample_weights(y, half_life_frac: float = 0.25) -> np.ndarray:
    """Recency x class balance, mean 1.
    Recency: a row's weight halves every `half_life_frac` of the training length, so the newest market counts most
    (markets change character; the 2026-10 error analysis found a model stuck on an older pattern).
    Balance: up and down rows count equally in total, which removes the lean towards whichever was more common (the daily
    model said "higher" on 63% of days when gold rose on 54%)."""
    y = np.asarray(y, dtype=int)
    n = len(y)
    age = np.arange(n)[::-1]
    w = 0.5 ** (age / max(50.0, half_life_frac * n))
    n1 = max(int(y.sum()), 1)
    n0 = max(n - n1, 1)
    w = w * np.where(y == 1, n / (2 * n1), n / (2 * n0))
    return w / w.mean()


class Weighted:
    """A tree model trained with sample_weights(): a candidate in the study like any other, so it is only used if it wins
    on the development data and then passes the locked hold-out."""

    def __init__(self, base: str, seed: int = 42, half_life_frac: float = 0.25):
        self.base, self.seed, self.half_life_frac = base, seed, half_life_frac

    def fit(self, X, y):
        self.model_ = make_model(self.base, self.seed)
        w = sample_weights(y, self.half_life_frac)
        if hasattr(self.model_, "steps"):  # a scikit-learn pipeline: the weight goes to its last step
            self.model_.fit(X, y, **{f"{self.model_.steps[-1][0]}__sample_weight": w})
        else:
            self.model_.fit(X, y, sample_weight=w)
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(X)


# ----------------------------------------------------------------------------------------------- combinations
class Blend:
    """Average of several models' probabilities."""

    def __init__(self, names, seed: int = 42):
        self.names, self.seed = list(names), seed

    def fit(self, X, y):
        self.models_ = [fit(X, y, n, self.seed) for n in self.names]
        return self

    def predict_proba(self, X):
        p = np.mean([_p_up(m, X) for m in self.models_], axis=0)
        return np.column_stack([1 - p, p])


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


class Stack:
    """A small linear model learns how much to trust each base model, using their out-of-fold predictions."""

    def __init__(self, names, seed: int = 42, splits: int = 4):
        self.names, self.seed, self.splits = list(names), seed, splits

    def fit(self, X, y):
        y = np.asarray(y, dtype=int)
        oof = np.full((len(X), len(self.names)), np.nan)
        for tr, te in TimeSeriesSplit(self.splits).split(X):
            for j, n in enumerate(self.names):
                oof[te, j] = _p_up(fit(X.iloc[tr], y[tr], n, self.seed), X.iloc[te])
        ok = ~np.isnan(oof).any(axis=1)  # the first block has no earlier data to learn from
        self.meta_ = LogisticRegression(C=0.5, max_iter=1000).fit(_logit(oof[ok]), y[ok])
        self.models_ = [fit(X, y, n, self.seed) for n in self.names]
        return self

    def predict_proba(self, X):
        z = np.column_stack([_p_up(m, X) for m in self.models_])
        return self.meta_.predict_proba(_logit(z))


class MetaLabeled:
    """predict_proba is the primary model's. predict_confidence is a second model's estimate that the call is correct."""

    def __init__(self, primary: str = "lgbm", seed: int = 42, splits: int = 4):
        self.primary, self.seed, self.splits = primary, seed, splits

    def fit(self, X, y):
        y = np.asarray(y, dtype=int)
        oof = np.full(len(X), np.nan)
        for tr, te in TimeSeriesSplit(self.splits).split(X):
            oof[te] = _p_up(fit(X.iloc[tr], y[tr], self.primary, self.seed), X.iloc[te])
        ok = ~np.isnan(oof)
        correct = ((oof[ok] >= 0.5).astype(int) == y[ok]).astype(int)
        M = X[ok].copy()
        M["_p"] = oof[ok]
        M["_conf"] = np.abs(oof[ok] - 0.5)
        self.meta_ = lgb.LGBMClassifier(n_estimators=100, learning_rate=0.03, num_leaves=7, min_child_samples=80,
                                        subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=10.0,
                                        random_state=self.seed, verbose=-1).fit(M, correct)
        self.primary_ = fit(X, y, self.primary, self.seed)
        return self

    def predict_proba(self, X):
        return self.primary_.predict_proba(X)

    def predict_confidence(self, X) -> np.ndarray:
        p = _p_up(self.primary_, X)
        M = X.copy()
        M["_p"] = p
        M["_conf"] = np.abs(p - 0.5)
        return self.meta_.predict_proba(M)[:, 1]
