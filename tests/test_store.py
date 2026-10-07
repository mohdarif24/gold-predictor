from pathlib import Path
import numpy as np
import pandas as pd
import pytest

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


def test_reconnects_after_an_idle_drop_but_never_loses_pending_writes():
    """Neon closes a connection left idle while the model study computes for hours (this failed the 2026-10-07 run)."""
    import psycopg

    class Cur:
        def __init__(self, conn):
            self.conn = conn

        def execute(self, sql, params):
            if self.conn.dead:
                raise psycopg.OperationalError("consuming input failed: SSL connection has been closed unexpectedly")
            self.conn.log.append(sql)

    class Conn:
        def __init__(self, dead=False):
            self.dead, self.log, self.closed = dead, [], False

        def cursor(self):
            return Cur(self)

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            self.closed = True

    opened = []

    def reconnect():
        opened.append(Conn())
        return opened[-1]

    first = Conn(dead=True)
    db = store.Db(first, "postgres", reconnect=reconnect)
    db.execute("SELECT 1")  # nothing pending: reconnects and repeats the statement
    assert first.closed and db.conn is opened[0] and opened[0].log == ["SELECT 1"]
    db.execute("INSERT INTO t VALUES (%s)", (1,))
    db.commit()
    db.conn.dead = True
    db.execute("UPDATE t SET x = 1")  # after a commit it is safe again
    assert len(opened) == 2 and opened[1].log == ["UPDATE t SET x = 1"]

    db2 = store.Db(Conn(), "postgres", reconnect=lambda: Conn())
    db2.execute("INSERT INTO t VALUES (%s)", (1,))  # uncommitted write...
    db2.conn.dead = True
    with pytest.raises(psycopg.OperationalError):  # ...so a drop must surface, not be papered over
        db2.execute("INSERT INTO t VALUES (%s)", (2,))


def test_copy_between_databases_keeps_everything_and_the_id_counter(tmp_path, pg_dsn):
    """Local SQLite -> Postgres (what moving to Neon does). Re-running must not duplicate, and new rows must get fresh ids."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("copy_db", Path(__file__).resolve().parents[1] / "scripts" / "copy_db.py")
    copy_db = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(copy_db)
    from core.models import fit
    src = store.connect(str(tmp_path / "src.db"))
    first = store.log_prediction(src, rec())
    store.log_prediction(src, rec(bar_ts="2026-10-03 00:00:00+05:30"))
    X = pd.DataFrame(np.random.default_rng(0).normal(size=(200, 3)), columns=list("abc"))
    store.save_model(src, "m", fit(X, (X["a"] > 0).astype(float)), {"version": "v"})
    store.save_research(src, "nse_etf", "1d", {"holdout": {"auc": 0.51}})
    dst = store.connect(pg_dsn)
    try:
        out = copy_db.copy(src, dst, log=lambda *_: None)
        assert out["predictions"] == (2, 2) and out["models"] == (1, 1) and out["research"] == (1, 1)
        copy_db.copy(src, dst, log=lambda *_: None)                                       # second run: no duplicates
        assert db_count(dst, "predictions") == 2
        assert store.load_model(dst, "m")["model"].predict_proba(X).shape == (200, 2)    # the model survived the trip
        new_id = store.log_prediction(dst, rec(bar_ts="2026-10-09 00:00:00+05:30"))
        assert new_id > first + 1                                                          # the id counter moved past copied ids
    finally:
        for t in copy_db.TABLES:
            dst.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
        dst.commit()
        dst.close()


def db_count(db, table):
    return db.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]


def test_access_codes_are_stored_hashed_replaceable_and_revocable(db):
    import importlib.util
    spec = importlib.util.spec_from_file_location("access_code", Path(__file__).resolve().parents[1] / "scripts" / "access_code.py")
    ac = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ac)
    code = ac.add(db, "Client@Example.com")
    assert len(code) >= 20
    row = db.execute("SELECT * FROM access_codes").fetchone()
    assert row["email"] == "client@example.com" and row["code_hash"] == ac.code_hash(code) and code not in str(dict(row))
    second = ac.add(db, "client@example.com")  # a new code replaces the old one
    assert second != code and db.execute("SELECT COUNT(*) AS n FROM access_codes").fetchone()["n"] == 1
    assert ac.revoke(db, "client@example.com") and not ac.revoke(db, "client@example.com")
    # a code chosen by the administrator: checked for length, spaces, and not being someone else's
    assert ac.add(db, "a@x.com", code=" My-Own-Code-1 ") == "My-Own-Code-1"
    for bad in ("short", "has spaces in it"):
        with pytest.raises(ValueError):
            ac.add(db, "b@x.com", code=bad)
    with pytest.raises(ValueError):
        ac.add(db, "b@x.com", code="My-Own-Code-1")
    assert ac.add(db, "a@x.com", code="My-Own-Code-1") == "My-Own-Code-1"  # the same person may keep their code


def test_roles_and_adding_a_column_to_an_existing_database(tmp_path):
    """A database created before roles existed gets the column on connect; new codes can be admin or user."""
    import sqlite3, importlib.util
    path = tmp_path / "old.db"
    c = sqlite3.connect(path)
    c.execute("CREATE TABLE access_codes(email TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, created TEXT, last_used TEXT)")
    c.execute("INSERT INTO access_codes VALUES('old@x.com', 'h', 'then', NULL)")
    c.commit(); c.close()
    db = store.connect(str(path))
    assert db.execute("SELECT role FROM access_codes WHERE email='old@x.com'").fetchone()["role"] == "user"
    spec = importlib.util.spec_from_file_location("access_code", Path(__file__).resolve().parents[1] / "scripts" / "access_code.py")
    ac = importlib.util.module_from_spec(spec); spec.loader.exec_module(ac)
    ac.add(db, "boss@x.com", admin=True)
    ac.add(db, "client@x.com")
    roles = {r["email"]: r["role"] for r in db.execute("SELECT email, role FROM access_codes").fetchall()}
    assert roles == {"old@x.com": "user", "boss@x.com": "admin", "client@x.com": "user"}
