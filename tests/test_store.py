import numpy as np
import pandas as pd

from core import alerts, store


def rec(**kw):
    base = {"created": "2026-10-05T10:00:00+00:00", "instrument": "nse_etf", "horizon": "1d", "tf": "D1", "steps": 1,
            "bar_ts": "2026-10-02 00:00:00+05:30", "price": 121.4, "atr": 1.2, "p_up": 0.61, "signal": "WAIT",
            "regime": "RANGING", "has_edge": 0, "model_version": "v1", "reason": "x"}
    return {**base, **kw}


def test_prediction_dedup_and_numpy_values(db):
    first = store.log_prediction(db, rec(price=np.float64(121.4), p_up=np.float32(0.5)))
    assert isinstance(first, int)
    assert store.log_prediction(db, rec()) is None
    assert store.log_prediction(db, rec(bar_ts="2026-10-03 00:00:00+05:30")) != first
    assert db.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()["n"] == 2


def test_heartbeat_upserts(db):
    store.beat(db, "nse_etf")
    store.beat(db, "nse_etf")
    rows = db.execute("SELECT * FROM heartbeat").fetchall()
    assert len(rows) == 1 and rows[0]["ts"].endswith("+00:00")


def test_model_roundtrip_gives_same_predictions(db):
    from core.models import fit
    rng = np.random.default_rng(0)
    X = pd.DataFrame(rng.normal(size=(300, 4)), columns=list("abcd"))
    y = pd.Series((X["a"] + rng.normal(size=300) > 0).astype(float))
    m = fit(X, y)
    store.save_model(db, "x_1d", m, {"version": "v1", "features": list("abcd")})
    store.save_model(db, "x_1d", m, {"version": "v2", "features": list("abcd")})  # overwrite, not duplicate
    got = store.load_model(db, "x_1d")
    assert got["meta"]["version"] == "v2"
    np.testing.assert_allclose(got["model"].predict_proba(X), m.predict_proba(X))
    assert store.load_model(db, "missing") is None


def test_report_json_is_browser_safe(db):
    store.save_report(db, "x", {"1d": {"auc": float("nan"), "n": 3,
                                       "calibration": [{"pred": 0.5, "actual": np.float64(0.4)}]}})
    body = db.execute("SELECT body FROM reports WHERE instrument='x'").fetchone()["body"]
    assert "NaN" not in body and "Infinity" not in body
    assert store.load_report(db, "x")["1d"]["auc"] is None
    assert store.load_report(db, "nope") == {}


def test_candles_upsert_is_idempotent(db):
    idx = pd.date_range("2026-09-01", periods=5, freq="D", tz="Asia/Kolkata")
    df = pd.DataFrame({"open": 1.0, "high": 2.0, "low": 0.5, "close": [1, 2, 3, 4, 5.0]}, index=idx)
    store.save_candles(db, "nse_etf", "D1", df)
    df2 = df.copy()
    df2.iloc[-1, df2.columns.get_loc("close")] = 9.0
    store.save_candles(db, "nse_etf", "D1", df2)
    rows = db.execute("SELECT ts, close FROM candles WHERE instrument='nse_etf' ORDER BY ts").fetchall()
    assert len(rows) == 5 and rows[-1]["close"] == 9.0
    assert rows[0]["ts"] == int(pd.Timestamp("2026-09-01").timestamp())  # naive local clock read as UTC


def test_instruments_sync(db):
    cfg = {"instruments": {"a": {"label": "A", "horizons": [{"name": "1d"}, {"name": "1w"}]},
                           "b": {"label": "B", "enabled": False, "horizons": [{"name": "1d"}]}}}
    store.sync_instruments(db, cfg)
    store.sync_instruments(db, cfg)
    rows = {r["id"]: r for r in db.execute("SELECT * FROM instruments").fetchall()}
    assert rows["a"]["enabled"] == 1 and rows["b"]["enabled"] == 0 and rows["a"]["horizons"] == '["1d", "1w"]'


def test_alerts_only_new_buy_sell_to_opted_in_users(db, monkeypatch):
    sent = []
    monkeypatch.setattr(alerts, "telegram_send", lambda chat, text: sent.append((chat, text)) or True)
    monkeypatch.setattr(alerts, "email_send", lambda to, subj, body: sent.append((to, subj)) or True)
    sql = "INSERT INTO user_settings(email, telegram_chat_id, telegram_on, email_on) VALUES(?,?,?,?)"
    db.execute(sql, ("a@x.com", "9", 1, 1))
    db.execute(sql, ("b@x.com", None, 0, 0))
    db.commit()
    cfg = {"instruments": {"nse_etf": {"label": "Gold ETF (India, NSE)"}}}
    base = {"instrument": "nse_etf", "horizon": "1d", "p_up": 0.7, "price": 120.0}
    res = [{**base, "signal": "WAIT", "is_new": True}, {**base, "signal": "BUY", "is_new": False},
           {**base, "signal": "BUY", "is_new": True}]
    assert alerts.notify_new(db, cfg, res) == 2
    assert sent[0][0] == "9" and "not financial advice" in sent[0][1] and sent[1][0] == "a@x.com"


def test_postgres_survives_reconnects_and_repeated_statements(pg_dsn):
    """Scheduled runs open a fresh connection every time and repeat the same statements. This must keep working, and it
    covers a candle batch larger than one INSERT chunk. (The first version of save_candles used executemany, which broke on
    the second run against a real Postgres engine; the end-to-end check found it, this keeps it fixed.)"""
    idx = pd.date_range("2025-01-01", periods=450, freq="h")
    df = pd.DataFrame({"open": 1.0, "high": 2.0, "low": 0.5, "close": np.arange(450.0)}, index=idx)
    for _ in range(3):  # three separate connections, like three scheduled runs
        db = store.connect(pg_dsn)
        for _ in range(8):  # more than psycopg's default prepare threshold (5)
            store.beat(db, "x")
        store.save_candles(db, "x", "H1", df, limit=400)
        n = db.execute("SELECT COUNT(*) AS n FROM candles WHERE instrument = 'x'").fetchone()["n"]
        assert n == 400
        db.execute("DROP TABLE candles")
        db.execute("DROP TABLE heartbeat")
        db.commit()
        db.close()
