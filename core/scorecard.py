"""A checklist of well-known gold factors: what each says now, and how often it was right before.

The rules below are the usual market folklore, fixed in advance and never tuned to the results. Each factor says
+1 (gold up), -1 (gold down) or 0 (no view). The "total" is not a sum of percentages: it is the measured hit rate of
past days when the factors agreed at least as strongly, and in the same direction, as they do now.
"""
import numpy as np
import pandas as pd

from .stats import wilson


def _sign(cond_up: pd.Series, cond_down: pd.Series) -> pd.Series:
    out = pd.Series(0, index=cond_up.index, dtype=int)
    out[cond_up.fillna(False)] = 1
    out[cond_down.fillna(False)] = -1
    return out


# key: (columns needed, rule). Rules read only the feature table, which is already lagged to what was known that day.
FACTORS = {
    "real_yield": (["real_yield_ret5"], lambda X: _sign(X["real_yield_ret5"] < 0, X["real_yield_ret5"] > 0)),
    "dollar": (["dxy_ret5"], lambda X: _sign(X["dxy_ret5"] < 0, X["dxy_ret5"] > 0)),
    "inflation": (["breakeven_ret20"], lambda X: _sign(X["breakeven_ret20"] > 0, X["breakeven_ret20"] < 0)),
    "fear": (["vix_ret5"], lambda X: _sign(X["vix_ret5"] > 0, X["vix_ret5"] < 0)),
    "silver": (["silver_ret5"], lambda X: _sign(X["silver_ret5"] > 0, X["silver_ret5"] < 0)),
    "trend": (["ma_gap_50"], lambda X: _sign(X["ma_gap_50"] > 0, X["ma_gap_50"] < 0)),
    "rsi": (["rsi"], lambda X: _sign(X["rsi"] < 30, X["rsi"] > 70)),
    "positioning": (["cot_mm_rank3y"], lambda X: _sign(X["cot_mm_rank3y"] < 0.2, X["cot_mm_rank3y"] > 0.8)),
    "news": (["news_sent_mean"], lambda X: _sign(X["news_sent_mean"] > 0.1, X["news_sent_mean"] < -0.1)),
    "fed": (["fed_funds_ret20"], lambda X: _sign(X["fed_funds_ret20"] < 0, X["fed_funds_ret20"] > 0)),
}


def factor_signals(X: pd.DataFrame) -> pd.DataFrame:
    cols = {k: rule(X) for k, (need, rule) in FACTORS.items() if all(c in X.columns for c in need)}
    return pd.DataFrame(cols, index=X.index)


def _rate(hit: pd.Series) -> dict:
    n, k = int(hit.size), int(hit.sum())
    lo, hi = wilson(k, n) if n else (None, None)
    return {"n": n, "rate": round(k / n, 4) if n else None, "lo": None if lo is None else round(lo, 4), "hi": None if hi is None else round(hi, 4)}


def build(X: pd.DataFrame, fwd: pd.Series, recent_frac: float = 0.2) -> dict:
    """X: daily feature table; fwd: forward return over the horizon (NaN where unknown yet)."""
    S = factor_signals(X)
    known = fwd.notna()
    up = (fwd > 0)
    net = S.sum(axis=1)
    now = S.iloc[-1]
    start_recent = S.index[int(len(S) * (1 - recent_frac))]

    def period(mask) -> dict:
        m = known & mask
        base_up = _rate(up[m])
        factors = {}
        for k in S.columns:
            said = S[k][m]
            right = ((said == 1) & up[m]) | ((said == -1) & ~up[m])
            factors[k] = {"any": _rate(right[said != 0]),
                          "up": _rate(up[m][said == 1]), "down": _rate(~up[m][said == -1])}
        d = int(np.sign(net.iloc[-1]))
        k_now = int(abs(net.iloc[-1]))
        same = m & (np.sign(net) == d) & (net.abs() >= k_now) if d != 0 else m & (net == 0)
        total = _rate((up if d >= 0 else ~up)[same]) if d != 0 else {"n": int(same.sum()), "rate": None, "lo": None, "hi": None}
        ladder = []
        for kk in range(1, int(net.abs().max()) + 1 if len(net) else 1):
            for dd in (1, -1):
                sel = m & (np.sign(net) == dd) & (net.abs() >= kk)
                if sel.sum():
                    ladder.append({"direction": "up" if dd == 1 else "down", "at_least": kk, **_rate((up if dd == 1 else ~up)[sel])})
        return {"base_up": base_up, "factors": factors, "total": total, "ladder": ladder,
                "from": str(S.index[m][0].date()) if m.any() else None, "to": str(S.index[m][-1].date()) if m.any() else None}

    return {
        "now": {k: int(v) for k, v in now.items()},
        "net": int(net.iloc[-1]),
        "direction": "up" if net.iloc[-1] > 0 else "down" if net.iloc[-1] < 0 else "none",
        "as_of": str(S.index[-1].date()),
        "full": period(pd.Series(True, index=S.index)),
        "recent": period(pd.Series(S.index >= start_recent, index=S.index)),
    }
