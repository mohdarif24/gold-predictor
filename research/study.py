"""Locked hold-out study.   python -m research.study <instrument|all> [--quick] [--horizons 1d,1w] [--models a,b]

Protocol (this is what makes a 'success' believable):
  1. The last 20% of each series is the HOLD-OUT. Nothing in steps 2-3 ever reads it.
  2. On the first 80% (the development part) every candidate - a model and an input set - is scored by walk-forward
     testing. Stage A compares all models on one input set; stage B tries the other input sets with the best two models.
  3. The single best development candidate is picked. Picking the best of many is optimistic by construction, so its
     development score is reported as optimistic and never used as evidence.
  4. That one candidate is tested ONCE on the hold-out, again walking forward (it is retrained as the hold-out unfolds,
     exactly as it would be live). Only this number counts.
  5. The verdict (has_edge) needs ALL of: the 95% interval of AUC entirely above 0.5, accuracy above plain guessing by a
     margin, positive return after costs, enough trades. Otherwise the app keeps saying Wait.
"""
import argparse
import time
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import pandas as pd
import yaml
from sklearn.metrics import roc_auc_score

from core import news as news_mod
from core import pipeline, store
from core.backtest import evaluate, walk_forward
from core.features import FEATURE_SETS, make_target, select_columns
from core.models import ALL_MODELS
from core.stats import block_bootstrap_auc, wilson

HOLDOUT_FRAC = 0.20
DEV_FOLDS, HOLD_FOLDS = 5, 4
STAGE_A_SET = "tech+"
STAGE_B_SETS = ["core", "macro", "flow", "all"]
CONF_LEVELS = [1.0, 0.5, 0.25, 0.10]
SINGLE_FOR_STAGE_B = ["lgbm", "xgb", "rf", "et", "logit", "ridge", "mlp", "lstm", "lgbm_w", "xgb_w", "et_w"]
GATE = {"min_rows": 300, "auc_lo": 0.5, "acc_margin": 0.01, "min_trades": 30}


def _have_torch() -> bool:
    try:
        import torch  # noqa: F401
        return True
    except ImportError:
        return False


def fold_aucs(oof: pd.DataFrame, k: int = DEV_FOLDS) -> list:
    out = []
    for part in np.array_split(np.arange(len(oof)), k):
        y, p = oof["y"].iloc[part], oof["p"].iloc[part]
        out.append(float(roc_auc_score(y, p)) if y.nunique() == 2 else None)
    return out


def dev_score(X, y, steps, dev_n, feature_set, model) -> dict:
    cols = select_columns(X.columns, feature_set)
    t0 = time.time()
    oof = walk_forward(X[cols], y, steps, n_splits=DEV_FOLDS, model=model, test_start=int(dev_n * 0.4), test_end=dev_n)
    folds = fold_aucs(oof)
    return {"feature_set": feature_set, "model": model, "n_features": len(cols),
            "auc": round(float(roc_auc_score(oof["y"], oof["p"])), 4), "fold_auc": [None if f is None else round(f, 4) for f in folds],
            "folds_above_half": int(sum(1 for f in folds if f is not None and f > 0.5)), "seconds": round(time.time() - t0, 1)}


def selective_table(p: np.ndarray, y: np.ndarray, conf: np.ndarray) -> list:
    """Accuracy when only the most confident calls are kept (coverage = share of all calls kept)."""
    order = np.argsort(-conf)
    right = ((p >= 0.5).astype(int) == y)[order]
    rows = []
    for cov in CONF_LEVELS:
        k = max(1, int(round(len(p) * cov)))
        lo, hi = wilson(int(right[:k].sum()), k)
        rows.append({"coverage": cov, "n": k, "accuracy": round(float(right[:k].mean()), 4),
                     "ci_lo": round(lo, 4), "ci_hi": round(hi, 4)})
    return rows


def high_confidence_table(p: np.ndarray, y: np.ndarray) -> list:
    """How often the model says 60/70/80% (either way) and how often it is then right. n = 0 means it never says it."""
    rows = []
    for t in (0.60, 0.70, 0.80):
        m = (p >= t - 1e-9) | (p <= 1 - t + 1e-9)  # tolerance: 1 - 0.8 is 0.19999999999999996 in floating point
        n = int(m.sum())
        right = int((((p[m] >= 0.5).astype(int)) == y[m]).sum()) if n else 0
        lo, hi = wilson(right, n) if n else (None, None)
        rows.append({"says_at_least": t, "n": n, "accuracy": round(right / n, 4) if n else None,
                     "ci_lo": None if lo is None else round(lo, 4), "ci_hi": None if hi is None else round(hi, 4)})
    return rows


def study_horizon(name, cfg, inst, hz, df, X, y, fwd, models, log=print) -> dict:
    n, steps = len(X), hz["steps"]
    dev_n = int(n * (1 - HOLDOUT_FRAC))
    log(f"  rows={n} development={dev_n} hold-out={n - dev_n} ({X.index[dev_n].date()} to {X.index[-1].date()})")

    cands = []
    for m in models:  # stage A
        try:
            c = dev_score(X, y, steps, dev_n, STAGE_A_SET, m)
        except Exception as e:
            log(f"    {STAGE_A_SET:6} {m:6} FAILED {type(e).__name__}: {e}")
            continue
        cands.append(c)
        log(f"    {c['feature_set']:6} {m:6} auc={c['auc']:.4f} folds>0.5: {c['folds_above_half']}/{DEV_FOLDS} ({c['seconds']}s)")
    singles = sorted((c for c in cands if c["model"] in SINGLE_FOR_STAGE_B), key=lambda c: -c["auc"])[:2]
    top2 = list(dict.fromkeys([c["model"] for c in sorted(cands, key=lambda c: -c["auc"])[:2]] + [c["model"] for c in singles[:1]]))
    for fs in STAGE_B_SETS:  # stage B
        for m in top2:
            try:
                c = dev_score(X, y, steps, dev_n, fs, m)
            except Exception as e:
                log(f"    {fs:6} {m:6} FAILED {type(e).__name__}: {e}")
                continue
            cands.append(c)
            log(f"    {fs:6} {m:6} auc={c['auc']:.4f} folds>0.5: {c['folds_above_half']}/{DEV_FOLDS} ({c['seconds']}s)")
    cands.sort(key=lambda c: -c["auc"])
    best = cands[0]
    selected = {"feature_set": best["feature_set"], "model": best["model"], "dev_auc": best["auc"],
                "dev_note": "best of %d candidates on the development part: optimistic, not evidence" % len(cands)}
    log(f"  selected on development data only: {best['feature_set']} + {best['model']} (dev auc {best['auc']:.4f}, optimistic)")

    cols = select_columns(X.columns, best["feature_set"])
    oof = walk_forward(X[cols], y, steps, n_splits=HOLD_FOLDS, model=best["model"], test_start=dev_n, test_end=n)
    ppy = pipeline._periods_per_year(inst, hz["tf"])
    m = evaluate(oof, fwd, steps, cfg["signal_threshold"], inst["cost_bps"], ppy)
    boot = block_bootstrap_auc(oof["y"].values, oof["p"].values, block=max(2 * steps, 20), n_boot=1000)
    p, yv = oof["p"].values, oof["y"].values.astype(int)

    selective = {"by_probability": selective_table(p, yv, np.abs(p - 0.5))}
    try:  # does a second model that estimates 'is this call right?' pick better calls than the probability itself?
        moof = walk_forward(X[cols], y, steps, n_splits=HOLD_FOLDS, model=f"meta:{best['model']}", test_start=dev_n, test_end=n)
        selective["by_meta_model"] = selective_table(moof["p"].values, moof["y"].values.astype(int), moof["conf"].values)
    except Exception as e:
        log(f"    meta-labeling skipped: {type(e).__name__}: {e}")

    base_acc = m.get("baseline_accuracy")
    checks = {
        "enough_rows": len(oof) >= GATE["min_rows"],
        "auc_interval_above_half": boot["lo"] is not None and boot["lo"] > GATE["auc_lo"],
        "accuracy_beats_guessing": base_acc is not None and m.get("accuracy", 0) >= base_acc + GATE["acc_margin"],
        "positive_return_after_costs": m.get("net_return_total", -1) > 0 and m.get("sharpe", -1) > 0,
        "enough_trades": m.get("n_trades", 0) >= GATE["min_trades"],
    }
    has_edge = all(checks.values())
    holdout = {**m, "auc": round(boot["auc"], 4) if boot["auc"] is not None else m.get("auc"),
               "auc_ci": [None if boot["lo"] is None else round(boot["lo"], 4), None if boot["hi"] is None else round(boot["hi"], 4)],
               "p_value": boot["p_value"], "checks": checks, "has_edge": bool(has_edge),
               "reason": "passed every check on the locked hold-out" if has_edge
               else "failed on the locked hold-out: " + ", ".join(k for k, v in checks.items() if not v),
               "selective": selective, "high_confidence": high_confidence_table(p, yv),
               "period": [str(X.index[dev_n].date()), str(X.index[-1].date())]}
    log(f"  HOLD-OUT: auc={holdout['auc']} CI={holdout['auc_ci']} acc={m.get('accuracy')} vs guess={base_acc} "
        f"net={m.get('net_return_total')} -> {'PASS' if has_edge else 'no edge'}")
    return {"instrument": name, "horizon": hz["name"], "rows": n, "development_rows": dev_n, "holdout_rows": n - dev_n,
            "candidates": cands, "selected": selected, "holdout": holdout,
            "protocol": {"holdout_fraction": HOLDOUT_FRAC, "dev_folds": DEV_FOLDS, "holdout_folds": HOLD_FOLDS,
                         "candidates_tested": len(cands), "gate": GATE},
            "ran": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("instrument")
    ap.add_argument("--horizons", default="")
    ap.add_argument("--models", default="")
    ap.add_argument("--quick", action="store_true", help="three fast models only (smoke test, not a real study)")
    a = ap.parse_args()

    import run as runner
    cfg = runner.load_config()
    db = store.connect_cfg(cfg)
    names = runner.targets(cfg, a.instrument)
    models = a.models.split(",") if a.models else (["lgbm", "logit", "rf"] if a.quick else
                                                    [m for m in ALL_MODELS if m != "meta" and (m != "lstm" or _have_torch())])
    for name in names:
        inst = cfg["instruments"][name]
        raw_bars, get_drivers = runner.providers(name, cfg)
        get_bars = lru_cache(maxsize=None)(raw_bars)
        cot = pipeline.load_cot(cfg)
        news_f = news_mod.news_features(db)  # daily news mood collected or backfilled so far
        print(f"inputs: positioning={'yes' if cot is not None else 'no'}, news days={len(news_f)}, market series={len(get_drivers())}", flush=True)
        for hz in inst["horizons"]:
            if a.horizons and hz["name"] not in a.horizons.split(","):
                continue
            print(f"\n== {name} {hz['name']}", flush=True)
            df, X = pipeline._features(inst, hz["tf"], get_bars, get_drivers, cot, news_f)
            y, fwd = make_target(df, hz["steps"])
            ok = y.notna() & X[pipeline._core_cols(X)].notna().all(axis=1)
            res = study_horizon(name, cfg, inst, hz, df, X[ok], y[ok], fwd[ok], models)
            if not a.quick:
                store.save_research(db, name, hz["name"], res)
            else:
                print("  (quick mode: result not saved)")


if __name__ == "__main__":
    main()
