"""Local dashboard:  streamlit run app.py   (reads DATABASE_URL, or the SQLite file in config.yaml)"""
import pandas as pd
import streamlit as st
import yaml
from pathlib import Path

from core import store

cfg = yaml.safe_load(Path("config.yaml").read_text())
db = store.connect_cfg(cfg)
st.set_page_config(page_title="Gold Predictor", layout="wide")
st.title("Gold Predictor")
st.caption("Shadow (paper) trading only. Signals are WAIT unless a model beat the baseline out of sample. Not financial advice.")


def frame(sql: str, params=()) -> pd.DataFrame:
    return pd.DataFrame([dict(r) for r in db.execute(sql, params).fetchall()])


inst = st.sidebar.selectbox("Instrument", list(cfg["instruments"]))
preds = frame("SELECT * FROM predictions WHERE instrument=? ORDER BY id DESC", (inst,))
trades = frame("SELECT * FROM shadow_trades WHERE instrument=? ORDER BY id DESC", (inst,))

st.subheader("Latest signal per horizon")
if preds.empty:
    st.info(f"No predictions yet. Run: python run.py {inst} train, then python run.py {inst} predict")
else:
    latest = preds.groupby("horizon").head(1)[["horizon", "bar_ts", "price", "p_up", "signal", "regime", "reason"]]
    st.dataframe(latest, hide_index=True, width="stretch")

st.subheader("Backtest (walk-forward, out of sample)")
r = store.load_report(db, inst)
if r:
    cols = ["rows", "auc", "accuracy", "baseline_accuracy", "signal_accuracy", "net_return_total", "sharpe",
            "max_drawdown", "n_trades", "has_edge"]
    st.dataframe(pd.DataFrame(r).T.reindex(columns=cols), width="stretch")
    hz = st.selectbox("Calibration for horizon", list(r))
    cal = pd.DataFrame(r[hz].get("calibration", []))
    if not cal.empty:
        st.line_chart(cal.set_index("pred")[["actual"]].assign(perfect=cal["pred"].values))
else:
    st.info("No backtest report yet.")

st.subheader("Shadow trading")
closed = trades[trades["status"] != "OPEN"] if not trades.empty else trades
c1, c2, c3 = st.columns(3)
c1.metric("Open trades", int((trades["status"] == "OPEN").sum()) if not trades.empty else 0)
c2.metric("Closed trades", len(closed))
c3.metric("Win rate", f"{(closed['pnl_pct'] > 0).mean():.0%}" if len(closed) else "n/a")
if len(closed):
    st.line_chart(closed.sort_values("id")["pnl_pct"].cumsum().reset_index(drop=True))
if not trades.empty:
    st.dataframe(trades.head(50), hide_index=True, width="stretch")

st.subheader("Live calibration (resolved predictions)")
done = preds.dropna(subset=["outcome_up"]) if not preds.empty else preds
if len(done) >= 20:
    cal = done.groupby(pd.cut(done["p_up"], [0, .4, .45, .5, .55, .6, 1]), observed=True).agg(
        predicted=("p_up", "mean"), actual=("outcome_up", "mean"), n=("p_up", "size"))
    st.dataframe(cal)
else:
    st.info(f"{len(done)} resolved predictions so far (need 20+).")
