"""The plain chance clients see: how often gold actually ended higher in similar past situations.

Daily horizons use the factor checklist (the measured hit rate of past days that agreed at least as strongly in the same
direction); intraday horizons map the model's raw probability onto its hold-out calibration. Below MIN_CASES similar
cases, the plain base rate is used instead. The API (api/src/lib/queries.ts getPublicSignal) mirrors this logic.
"""

MIN_CASES = 30
LO, HI = 0.05, 0.95


def chance_up(card: dict | None, study: dict | None, model_p_up: float | None) -> dict:
    if card:
        p = card["full"]
        up = p["base_up"]["rate"] if p["base_up"]["rate"] is not None else 0.5
        n = p["base_up"]["n"]
        # with no direction (or too few similar days) the checklist's honest answer is the plain base rate
        if card["direction"] != "none" and p["total"]["rate"] is not None and p["total"]["n"] >= MIN_CASES:
            up = p["total"]["rate"] if card["direction"] == "up" else 1 - p["total"]["rate"]
            n = p["total"]["n"]
        source = "checklist"
    else:
        bins = ((study or {}).get("holdout") or {}).get("calibration") or []
        total = sum(b["n"] for b in bins)
        base = sum(b["actual"] * b["n"] for b in bins) / total if total else 0.5
        up, n, source = base, total, "base_rate"
        if bins and model_p_up is not None:
            near = min(bins, key=lambda b: abs(b["pred"] - model_p_up))
            if near["n"] >= MIN_CASES:
                up, n, source = near["actual"], near["n"], "model_calibrated"
    up = round(min(HI, max(LO, float(up))), 2)
    return {"p_up": up, "source": source, "cases": int(n)}
