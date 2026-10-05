def decide(p_up: float, has_edge: bool, regime: str, thr: float) -> tuple[str, str]:
    """BUY / SELL / WAIT plus the reason. WAIT whenever the model has not proven an edge out of sample."""
    if not has_edge:
        return "WAIT", "model has no proven out-of-sample edge for this horizon"
    if regime == "ABNORMAL":
        return "WAIT", "abnormal market regime (extreme move or volatility spike)"
    if p_up >= thr:
        return "BUY", f"P(up)={p_up:.1%} >= {thr:.0%} in {regime} regime"
    if p_up <= 1 - thr:
        return "SELL", f"P(down)={1 - p_up:.1%} >= {thr:.0%} in {regime} regime"
    return "WAIT", f"probability {p_up:.1%} inside the no-trade band ({1 - thr:.0%}-{thr:.0%})"
