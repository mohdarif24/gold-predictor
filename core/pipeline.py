from datetime import datetime, timezone

import pandas as pd

from . import shadow, store
from .backtest import evaluate, walk_forward
from .features import TF_MINUTES, build_features, make_target
from .models import fit
from .regime import REGIMES
from .signal import decide

DRIVER_SUFFIXES = ("_ret1", "_ret5")


def _core_cols(X: pd.DataFrame) -> list:
    """Columns that must be present to train (drivers and higher-timeframe features may legitimately be NaN)."""
    return [c for c in X.columns if not c.endswith(DRIVER_SUFFIXES) and c.split("_")[0] not in TF_MINUTES]


def _features(inst: dict, tf: str, get_bars, get_drivers):
    df = get_bars(tf)
    htf = {t: get_bars(t) for t in inst.get("htf", [])} if tf != "D1" else None
    drivers = get_drivers() if tf == "D1" else None
    return df, build_features(df, tf, htf, drivers)


def _periods_per_year(inst: dict, tf: str) -> float:
    return 252.0 if tf == "D1" else 252 * inst["minutes_per_day"] / TF_MINUTES[tf]


def train(name: str, cfg: dict, get_bars, get_drivers, db) -> dict:
    inst = cfg["instruments"][name]
    report = {}
    for hz in inst["horizons"]:
        df, X = _features(inst, hz["tf"], get_bars, get_drivers)
        y, fwd = make_target(df, hz["steps"])
        ok = y.notna() & X[_core_cols(X)].notna().all(axis=1)
        X, y, fwd = X[ok], y[ok], fwd[ok]
        oof = walk_forward(X, y, hz["steps"])
        metrics = evaluate(oof, fwd, hz["steps"], cfg["signal_threshold"], inst["cost_bps"],
                           _periods_per_year(inst, hz["tf"]))
        model = fit(X, y)
        version = f"{name}_{hz['name']}_{datetime.now(timezone.utc):%Y%m%d}"
        meta = {"version": version, "features": list(X.columns), "metrics": metrics, "trained_rows": int(len(X)),
                "horizon": hz}
        store.save_model(db, f"{name}_{hz['name']}", model, meta)
        report[hz["name"]] = {"version": version, "rows": int(len(X)), **metrics}
    store.save_report(db, name, report)
    return report


def predict(name: str, cfg: dict, get_bars, get_drivers, db) -> list:
    inst = cfg["instruments"][name]
    results = []
    for hz in inst["horizons"]:
        saved = store.load_model(db, f"{name}_{hz['name']}")
        if saved is None:
            results.append({"instrument": name, "horizon": hz["name"], "signal": "WAIT",
                            "reason": "model not trained yet (run train first)"})
            continue
        meta = saved["meta"]
        df, X = _features(inst, hz["tf"], get_bars, get_drivers)
        row = X.iloc[[-1]].reindex(columns=meta["features"])
        p_up = float(saved["model"].predict_proba(row)[0, 1])
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
        shadow.open_trade(db, pid, rec, cfg["shadow"])
        results.append(rec)
    return results


def update(name: str, cfg: dict, get_bars, db):
    shadow.update_trades(db, name, get_bars, cfg["instruments"][name]["cost_bps"])
    shadow.resolve_predictions(db, name, get_bars)
