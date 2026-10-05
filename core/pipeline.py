from datetime import datetime, timezone
from functools import lru_cache

import pandas as pd

from . import shadow, sources, store
from .backtest import evaluate, walk_forward
from .explain import explain
from .features import TF_MINUTES, build_features, feature_group, make_target, select_columns
from .models import context_rows, fit
from .regime import REGIMES
from .signal import decide

DEFAULT_SET, DEFAULT_MODEL = "tech+", "lgbm"
MUST_EXIST = {"technical", "technical_extra", "calendar"}  # rows without these are warm-up rows; other families may be NaN


def _core_cols(X: pd.DataFrame) -> list:
    """Columns that must be present to train (market, positioning and higher-timeframe features may legitimately be NaN)."""
    # a column that is empty everywhere (for example volume_z when volume never changes) must not wipe out every row
    return [c for c in X.columns if feature_group(c) in MUST_EXIST and c.split("_")[0] not in TF_MINUTES and X[c].notna().any()]


@lru_cache(maxsize=4)
def _cot_for(data_dir: str):
    try:
        return sources.cot_features(sources.load_cot_raw(data_dir))
    except Exception as e:
        print(f"warning: positioning data unavailable: {e}", flush=True)
        return None


def load_cot(cfg: dict):
    """Positioning features, or None when offline (the models then simply see no positioning information)."""
    return _cot_for(cfg.get("data_dir", "data"))


def _features(inst: dict, tf: str, get_bars, get_drivers, cot=None, news=None):
    df = get_bars(tf)
    htf = {t: get_bars(t) for t in inst.get("htf", [])} if tf != "D1" else None
    return df, build_features(df, tf, htf, get_drivers(), cot, news)


def _periods_per_year(inst: dict, tf: str) -> float:
    return 252.0 if tf == "D1" else 252 * inst["minutes_per_day"] / TF_MINUTES[tf]


def train(name: str, cfg: dict, get_bars, get_drivers, db, get_cot=None, get_news=None) -> dict:
    """Fit the final model per horizon. If the locked hold-out study (research) chose a model and inputs, use them and
    take the edge verdict from that study; otherwise fall back to a default model judged by walk-forward testing."""
    inst = cfg["instruments"][name]
    cot = (get_cot or (lambda: load_cot(cfg)))()
    news = get_news() if get_news else None
    report = {}
    for hz in inst["horizons"]:
        df, X = _features(inst, hz["tf"], get_bars, get_drivers, cot, news)
        y, fwd = make_target(df, hz["steps"])
        ok = y.notna() & X[_core_cols(X)].notna().all(axis=1)
        X, y, fwd = X[ok], y[ok], fwd[ok]

        study = store.load_research(db, name, hz["name"])
        if study and study.get("selected"):
            feature_set, model_name = study["selected"]["feature_set"], study["selected"]["model"]
            metrics = {**study["holdout"], "source": "locked hold-out study"}
        else:
            feature_set, model_name = DEFAULT_SET, DEFAULT_MODEL
            cols = select_columns(X.columns, feature_set)
            oof = walk_forward(X[cols], y, hz["steps"], model=model_name)
            metrics = {**evaluate(oof, fwd, hz["steps"], cfg["signal_threshold"], inst["cost_bps"],
                                  _periods_per_year(inst, hz["tf"])), "source": "walk-forward (no hold-out study yet)"}

        cols = select_columns(X.columns, feature_set)
        model = fit(X[cols], y, model_name)
        version = f"{name}_{hz['name']}_{datetime.now(timezone.utc):%Y%m%d}"
        meta = {"version": version, "features": cols, "model": model_name, "feature_set": feature_set,
                "medians": {c: float(X[c].median()) if X[c].notna().any() else None for c in cols},
                "metrics": metrics, "trained_rows": int(len(X)), "horizon": hz}
        store.save_model(db, f"{name}_{hz['name']}", model, meta)
        report[hz["name"]] = {"version": version, "rows": int(len(X)), "model": model_name, "feature_set": feature_set,
                              **metrics}
    store.save_report(db, name, report)
    return report


def predict(name: str, cfg: dict, get_bars, get_drivers, db, get_cot=None, get_news=None) -> list:
    inst = cfg["instruments"][name]
    cot = (get_cot or (lambda: load_cot(cfg)))()
    news = get_news() if get_news else None
    results = []
    for hz in inst["horizons"]:
        saved = store.load_model(db, f"{name}_{hz['name']}")
        if saved is None:
            results.append({"instrument": name, "horizon": hz["name"], "signal": "WAIT",
                            "reason": "model not trained yet (run train first)"})
            continue
        meta, model = saved["meta"], saved["model"]
        df, X = _features(inst, hz["tf"], get_bars, get_drivers, cot, news)
        ctx = X.iloc[-(context_rows(model) + 1):].reindex(columns=meta["features"])
        p_up = float(model.predict_proba(ctx)[-1, 1])
        row = X.iloc[[-1]]
        regime = REGIMES[int(row["regime_code"].iloc[0])] if pd.notna(row["regime_code"].iloc[0]) else "RANGING"
        has_edge = bool(meta["metrics"].get("has_edge"))
        signal, reason = decide(p_up, has_edge, regime, cfg["signal_threshold"])
        price = float(df["close"].iloc[-1])
        rec = {
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds"), "instrument": name,
            "horizon": hz["name"], "tf": hz["tf"], "steps": hz["steps"], "bar_ts": str(df.index[-1]),
            "price": price, "atr": float(row["atr_pct"].iloc[0] * price), "p_up": p_up, "signal": signal,
            "regime": regime, "has_edge": int(has_edge), "model_version": meta["version"], "reason": reason,
        }
        pid = store.log_prediction(db, rec)
        rec["is_new"] = pid is not None
        if rec["is_new"]:  # explain each new reading once; the screen shows the latest
            try:
                ex = explain(model, ctx, meta.get("medians", {}))
                ex.update({"model": meta.get("model"), "feature_set": meta.get("feature_set"), "bar_ts": rec["bar_ts"]})
                store.save_explanation(db, name, hz["name"], ex)
            except Exception as e:  # the explanation is extra; never lose the prediction because of it
                print(f"explanation skipped for {name} {hz['name']}: {e}", flush=True)
        shadow.open_trade(db, pid, rec, cfg["shadow"])
        results.append(rec)
    return results


def update(name: str, cfg: dict, get_bars, db):
    shadow.update_trades(db, name, get_bars, cfg["instruments"][name]["cost_bps"])
    shadow.resolve_predictions(db, name, get_bars)
