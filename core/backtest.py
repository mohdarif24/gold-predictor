import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from .models import fit


def walk_forward(X: pd.DataFrame, y: pd.Series, steps: int, n_splits: int = 5, min_train_frac: float = 0.4) -> pd.DataFrame:
    """Expanding-window walk-forward. A `steps`-bar purge gap keeps overlapping labels out of the train set."""
    n = len(X)
    start = int(n * min_train_frac)
    edges = np.linspace(start, n, n_splits + 1).astype(int)
    parts = []
    for a, b in zip(edges[:-1], edges[1:]):
        tr_end = a - steps
        if tr_end < 100 or b <= a:
            continue
        model = fit(X.iloc[:tr_end], y.iloc[:tr_end])
        p = model.predict_proba(X.iloc[a:b])[:, 1]
        base = float(y.iloc[:tr_end].mean())
        parts.append(pd.DataFrame({"p": p, "y": y.iloc[a:b].values, "base_p": base}, index=X.index[a:b]))
    return pd.concat(parts) if parts else pd.DataFrame(columns=["p", "y", "base_p"])


def calibration_table(p: pd.Series, y: pd.Series, bins: int = 10) -> list:
    cut = pd.cut(p, np.linspace(0, 1, bins + 1), include_lowest=True)
    g = pd.DataFrame({"p": p, "y": y}).groupby(cut, observed=True)
    t = g.agg(pred=("p", "mean"), actual=("y", "mean"), n=("y", "size")).reset_index(drop=True)
    return t.round(4).to_dict("records")


def evaluate(oof: pd.DataFrame, fwd_ret: pd.Series, steps: int, thr: float, cost_bps: float, periods_per_year: float) -> dict:
    """Metrics for out-of-sample predictions. The strategy only trades every `steps` bars (no overlapping trades)."""
    if len(oof) < 50 or oof["y"].nunique() < 2:
        return {"has_edge": False, "reason": "not enough out-of-sample data", "n": int(len(oof))}
    p, y = oof["p"], oof["y"]
    auc = float(roc_auc_score(y, p))
    acc = float(((p >= 0.5) == (y == 1)).mean())
    base_acc = float(((oof["base_p"] >= 0.5) == (y == 1)).mean())

    s = oof.iloc[::steps]
    ret = fwd_ret.reindex(s.index)
    pos = np.where(s["p"] >= thr, 1, np.where(s["p"] <= 1 - thr, -1, 0))
    net = pos * ret.values - np.abs(pos) * cost_bps / 1e4
    traded = pos != 0
    sig_acc = float(((pos[traded] == 1) == (s["y"].values[traded] == 1)).mean()) if traded.any() else float("nan")
    ppy = periods_per_year / steps
    sharpe = float(net.mean() / net.std() * np.sqrt(ppy)) if net.std() > 0 else 0.0
    equity = np.cumsum(net)
    mdd = float((equity - np.maximum.accumulate(equity)).min()) if len(equity) else 0.0

    m = {
        "n": int(len(oof)), "n_trades": int(traded.sum()),
        "auc": round(auc, 4), "accuracy": round(acc, 4), "baseline_accuracy": round(base_acc, 4),
        "signal_accuracy": round(sig_acc, 4) if not np.isnan(sig_acc) else None,
        "net_return_total": round(float(net.sum()), 4), "sharpe": round(sharpe, 2), "max_drawdown": round(mdd, 4),
        # context for the return: how often the model leaned long, and what simply holding on every sampled bar paid
        "long_share": round(float((pos[traded] == 1).mean()), 3) if traded.any() else None,
        "buy_hold_return": round(float(ret.sum()), 4),
        "calibration": calibration_table(p, y),
    }
    m["has_edge"] = bool(auc >= 0.52 and acc >= base_acc + 0.005 and m["net_return_total"] > 0 and m["n_trades"] >= 30)
    m["reason"] = "beats baseline out of sample" if m["has_edge"] else "no reliable edge over baseline: signals forced to WAIT"
    return m
