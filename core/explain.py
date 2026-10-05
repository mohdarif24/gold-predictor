"""What is pushing the current reading up or down? Works for every model type.

Method: neutralise an input (replace it with its typical training value) and see how far the probability moves.
Doing that for one column gives that input's push; doing it for a whole family gives the family's push.
The numbers are percentage points of P(up), so a push of +3.0 means that input lifts the chance of a rise by 3 points.
"""
import numpy as np
import pandas as pd

from .features import GROUPS, feature_group

_RECENT_EXACT = {"ret_1", "ret_3", "gap", "hl_range", "body", "volume_z", "spread_z", "obv_slope20", "stoch_k"}


def recency(col: str) -> str:
    """'latest' = inputs that describe the last bar or last day; 'background' = longer-run context."""
    if col in _RECENT_EXACT or col.endswith("_ret1") or col.startswith(("pat_", "news_")):
        return "latest"
    return "background"


def _p_last(model, X: pd.DataFrame) -> float:
    return float(model.predict_proba(X)[-1, 1])


def _neutral(X: pd.DataFrame, cols, medians: dict) -> pd.DataFrame:
    X2 = X.copy()
    for c in cols:
        m = medians.get(c)
        X2[c] = 0.0 if m is None or not np.isfinite(m) else m
    return X2


def explain(model, X: pd.DataFrame, medians: dict, top: int = 12) -> dict:
    """X: the latest row, preceded by any context rows the model needs. Columns must be the model's own."""
    base = _p_last(model, X)
    cols = list(X.columns)

    def push(subset) -> float:
        return (base - _p_last(model, _neutral(X, subset, medians))) * 100  # percentage points

    groups = {g: push([c for c in cols if feature_group(c) == g]) for g in GROUPS if any(feature_group(c) == g for c in cols)}
    rec = {r: push([c for c in cols if recency(c) == r]) for r in ("latest", "background")}
    single = sorted(({"feature": c, "group": feature_group(c), "value": None if pd.isna(X[c].iloc[-1]) else float(X[c].iloc[-1]),
                      "push": push([c])} for c in cols), key=lambda d: -abs(d["push"]))[:top]

    def shares(d: dict) -> dict:
        tot = sum(abs(v) for v in d.values()) or 1.0
        return {k: {"push": round(v, 3), "share": round(abs(v) / tot, 4)} for k, v in d.items()}

    return {"p_up": base, "groups": shares(groups), "recency": shares(rec),
            "top": [{**s, "push": round(s["push"], 3)} for s in single]}
