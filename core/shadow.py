"""Shadow (paper) trading: virtual trades with deterministic ATR-based SL/TP, plus prediction-vs-outcome tracking."""
import pandas as pd


def open_trade(conn, pred_id: int, rec: dict, shadow_cfg: dict):
    if rec["signal"] == "WAIT" or pred_id is None:
        return
    d = 1 if rec["signal"] == "BUY" else -1
    entry, atr = rec["price"], rec["atr"]
    sl = entry - d * shadow_cfg["sl_atr"] * atr
    tp = entry + d * shadow_cfg["tp_atr"] * atr
    conn.execute(
        "INSERT INTO shadow_trades(prediction_id, instrument, horizon, direction, bar_ts, entry, sl, tp, status) "
        "VALUES(?,?,?,?,?,?,?,?,'OPEN')",
        (pred_id, rec["instrument"], rec["horizon"], rec["signal"], rec["bar_ts"], entry, sl, tp),
    )
    conn.commit()


def _pos(bars: pd.DataFrame, ts: str) -> int | None:
    t = pd.Timestamp(ts)
    i = bars.index.searchsorted(t)
    return int(i) if i < len(bars) and bars.index[i] == t else None


def update_trades(conn, instrument: str, get_bars, cost_bps: float):
    """Close open shadow trades on SL / TP / horizon expiry. If SL and TP hit in one bar, SL is assumed first."""
    rows = conn.execute(
        "SELECT t.*, p.tf, p.steps FROM shadow_trades t JOIN predictions p ON p.id=t.prediction_id "
        "WHERE t.instrument=? AND t.status='OPEN'", (instrument,)).fetchall()
    cache = {}
    for r in rows:
        bars = cache.setdefault(r["tf"], get_bars(r["tf"]))
        i0 = _pos(bars, r["bar_ts"])
        if i0 is None:
            continue
        d = 1 if r["direction"] == "BUY" else -1
        for i in range(i0 + 1, len(bars)):
            b = bars.iloc[i]
            hit_sl = b["low"] <= r["sl"] if d == 1 else b["high"] >= r["sl"]
            hit_tp = b["high"] >= r["tp"] if d == 1 else b["low"] <= r["tp"]
            if hit_sl:
                status, px = "SL", r["sl"]
            elif hit_tp:
                status, px = "TP", r["tp"]
            elif i >= i0 + r["steps"]:
                status, px = "EXPIRED", b["close"]
            else:
                continue
            pnl = d * (px - r["entry"]) / r["entry"] - cost_bps / 1e4
            conn.execute("UPDATE shadow_trades SET status=?, exit_ts=?, exit_price=?, pnl_pct=? WHERE id=?",
                         (status, str(bars.index[i]), float(px), float(pnl), r["id"]))
            break
    conn.commit()


def resolve_predictions(conn, instrument: str, get_bars):
    """Record what actually happened `steps` bars after each prediction (for calibration tracking)."""
    rows = conn.execute("SELECT * FROM predictions WHERE instrument=? AND outcome_up IS NULL", (instrument,)).fetchall()
    cache = {}
    for r in rows:
        bars = cache.setdefault(r["tf"], get_bars(r["tf"]))
        i0 = _pos(bars, r["bar_ts"])
        if i0 is None or i0 + r["steps"] >= len(bars):
            continue
        up = int(bars["close"].iloc[i0 + r["steps"]] > bars["close"].iloc[i0])
        conn.execute("UPDATE predictions SET outcome_up=?, resolved_ts=? WHERE id=?",
                     (up, str(bars.index[i0 + r["steps"]]), r["id"]))
    conn.commit()
