"""Database layer. One code path for SQLite (local runs, tests) and Postgres (Neon in production).

`connect("store/predictor.db")` -> SQLite file.   `connect("postgresql://...")` -> Postgres.
SQL is written once with `?` placeholders and portable constructs (ON CONFLICT ... RETURNING); the Postgres side
translates placeholders. Rows behave like dicts (`row["col"]`, `dict(row)`) on both.
"""
import io
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib

_DDL = """
CREATE TABLE IF NOT EXISTS predictions(
  id {pk}, created TEXT, instrument TEXT, horizon TEXT, tf TEXT, steps INTEGER,
  bar_ts TEXT, price {real}, atr {real}, p_up {real}, signal TEXT, regime TEXT, has_edge INTEGER,
  model_version TEXT, reason TEXT, outcome_up INTEGER, resolved_ts TEXT, shown_p_up {real}, outcome_price {real}, event TEXT,
  UNIQUE(instrument, horizon, bar_ts)
);
CREATE TABLE IF NOT EXISTS shadow_trades(
  id {pk}, prediction_id INTEGER, instrument TEXT, horizon TEXT, direction TEXT,
  bar_ts TEXT, entry {real}, sl {real}, tp {real}, status TEXT, exit_ts TEXT, exit_price {real}, pnl_pct {real}
);
CREATE TABLE IF NOT EXISTS heartbeat(instrument TEXT PRIMARY KEY, ts TEXT);
CREATE TABLE IF NOT EXISTS models(name TEXT PRIMARY KEY, blob {blob}, meta TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS reports(instrument TEXT PRIMARY KEY, body TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS research(instrument TEXT, horizon TEXT, body TEXT, updated TEXT, PRIMARY KEY(instrument, horizon));
CREATE TABLE IF NOT EXISTS scorecards(instrument TEXT, horizon TEXT, body TEXT, updated TEXT, PRIMARY KEY(instrument, horizon));
CREATE TABLE IF NOT EXISTS explanations(instrument TEXT, horizon TEXT, body TEXT, updated TEXT, PRIMARY KEY(instrument, horizon));
CREATE TABLE IF NOT EXISTS series(name TEXT, ts TEXT, value {real}, PRIMARY KEY(name, ts));
CREATE TABLE IF NOT EXISTS news(
  id TEXT PRIMARY KEY, published TEXT, source TEXT, title TEXT, url TEXT, topic TEXT, sentiment {real}, impact TEXT,
  summary TEXT, scorer TEXT
);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, ts TEXT, country TEXT, title TEXT, impact TEXT, forecast TEXT, previous TEXT);
CREATE TABLE IF NOT EXISTS candles(
  instrument TEXT, tf TEXT, ts {big}, open {real}, high {real}, low {real}, close {real},
  PRIMARY KEY(instrument, tf, ts)
);
CREATE TABLE IF NOT EXISTS instruments(id TEXT PRIMARY KEY, label TEXT, horizons TEXT, enabled INTEGER, sort INTEGER);
CREATE TABLE IF NOT EXISTS access_codes(
  email TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, created TEXT, last_used TEXT, role TEXT DEFAULT 'user',
  perms TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS user_settings(
  email TEXT PRIMARY KEY, telegram_chat_id TEXT, telegram_on INTEGER DEFAULT 0, email_on INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_settings(name TEXT PRIMARY KEY, value TEXT, updated TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS api_logs(
  id {pk}, ts TEXT, source TEXT, url TEXT, model TEXT, ok INTEGER, status INTEGER, ms INTEGER,
  request TEXT, response TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_pred_inst ON predictions(instrument, id);
CREATE INDEX IF NOT EXISTS idx_trades_inst ON shadow_trades(instrument, status);
"""

_TYPES = {
    "sqlite": {"pk": "INTEGER PRIMARY KEY", "real": "REAL", "blob": "BLOB", "big": "INTEGER"},
    "postgres": {"pk": "BIGSERIAL PRIMARY KEY", "real": "DOUBLE PRECISION", "blob": "BYTEA", "big": "BIGINT"},
}


def _scalar(v):
    """numpy scalars -> plain Python (psycopg cannot adapt numpy.float64)."""
    return v.item() if hasattr(v, "item") and not isinstance(v, (bytes, bytearray, memoryview)) else v


class Db:
    def __init__(self, conn, kind: str, reconnect=None):
        self.conn, self.kind = conn, kind
        self._reconnect = reconnect  # Postgres only: opens a fresh connection
        self._dirty = False  # statements sent since the last commit / rollback

    def execute(self, sql: str, params=()):
        params = tuple(_scalar(p) for p in params)
        if self.kind == "postgres":
            import psycopg

            try:
                cur = self.conn.cursor()
                cur.execute(sql.replace("?", "%s"), params)
            except psycopg.Error as e:
                # Neon closes connections left idle during long computations (the model study runs for hours): as a
                # dropped socket (OperationalError) or as "idle-in-transaction timeout" when a read had left a
                # transaction open. When nothing is pending, a fresh connection loses nothing, so reconnect once and
                # repeat the statement. With uncommitted work the error must surface: silently dropping it loses data.
                gone = isinstance(e, (psycopg.OperationalError, psycopg.errors.IdleInTransactionSessionTimeout)) \
                    or getattr(self.conn, "broken", False) or self.conn.closed
                if not gone or self._dirty or self._reconnect is None:
                    raise
                print("database connection was closed while idle; reconnecting", flush=True)
                try:
                    self.conn.close()
                except Exception:
                    pass
                self.conn = self._reconnect()
                cur = self.conn.cursor()
                cur.execute(sql.replace("?", "%s"), params)
            if not sql.lstrip()[:6].upper() == "SELECT":  # a read leaves nothing to lose
                self._dirty = True
            return cur
        return self.conn.execute(sql, params)

    def commit(self):
        self.conn.commit()
        self._dirty = False

    def rollback(self):
        self.conn.rollback()
        self._dirty = False

    def close(self):
        self.conn.close()


def _is_postgres(target: str) -> bool:
    return target.startswith(("postgres://", "postgresql://", "host="))


def connect(target: str) -> Db:
    """target: SQLite file path, or a Postgres URL / libpq DSN."""
    if _is_postgres(target):
        import psycopg
        from psycopg.rows import dict_row

        # prepare_threshold=None: Neon's pooled endpoint is PgBouncer in transaction mode, which cannot keep prepared
        # statements; this is psycopg's documented setting for that. (Not exercised by the local tests.)
        # A few retries cover a database that is waking up or still closing the previous connection.
        def open_conn():
            for attempt in range(4):
                try:
                    return psycopg.connect(target, row_factory=dict_row, prepare_threshold=None)
                except psycopg.OperationalError:
                    if attempt == 3:
                        raise
                    time.sleep(1.5 * (attempt + 1))

        db = Db(open_conn(), "postgres", reconnect=open_conn)
    else:
        Path(target).parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False: connections are never shared between concurrent users of this module
        conn = sqlite3.connect(target, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        db = Db(conn, "sqlite")
    ensure_schema(db)
    return db


def connect_cfg(cfg: dict) -> Db:
    """DATABASE_URL (environment) wins over the local SQLite path in config.yaml."""
    return connect(os.getenv("DATABASE_URL") or cfg["db_path"])


def schema_sql(kind: str) -> str:
    return _DDL.format(**_TYPES[kind]).strip() + "\n"


# Columns added after a table first shipped: (table, column, definition). Existing databases get them on connect.
_ADDED_COLUMNS = [
    ("access_codes", "role", "TEXT DEFAULT 'user'"),
    ("access_codes", "perms", "TEXT DEFAULT ''"),  # extra pages a client may see, comma separated (e.g. "logs")
    ("predictions", "shown_p_up", "{real}"),  # the chance clients were shown at that moment
    ("predictions", "outcome_price", "{real}"),  # the price when the outcome was known
    ("predictions", "event", "TEXT"),  # big news that paused the client's signal for this reading
]


def _columns(db: Db, table: str) -> set:
    if db.kind == "sqlite":
        return {r[1] for r in db.conn.execute(f"PRAGMA table_info({table})").fetchall()}
    return {r["column_name"] for r in db.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ?", (table,)).fetchall()}


def ensure_schema(db: Db):
    for stmt in schema_sql(db.kind).split(";"):
        if stmt.strip():
            db.execute(stmt)
    for table, col, definition in _ADDED_COLUMNS:
        if col not in _columns(db, table):
            db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition.format(**_TYPES[db.kind])}")
    db.commit()


def _json_safe(o):
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return None
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
    return _scalar(o)


def dumps(o) -> str:
    """JSON that browsers can parse: NaN / Infinity become null."""
    return json.dumps(_json_safe(o), allow_nan=False)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------- predictions / heartbeat ----------

def log_prediction(db: Db, rec: dict):
    """Insert a prediction; returns its id, or None if this bar was already predicted."""
    cols = ["created", "instrument", "horizon", "tf", "steps", "bar_ts", "price", "atr", "p_up", "signal",
            "regime", "has_edge", "model_version", "reason", "shown_p_up", "event"]
    row = db.execute(
        f"INSERT INTO predictions({','.join(cols)}) VALUES({','.join('?' * len(cols))}) "
        "ON CONFLICT(instrument, horizon, bar_ts) DO NOTHING RETURNING id",
        [rec.get(c) for c in cols],
    ).fetchone()
    db.commit()
    return row["id"] if row else None


def beat(db: Db, instrument: str):
    """Record that a pass just finished, so the app can tell 'market closed' from 'updater stopped'."""
    db.execute("INSERT INTO heartbeat(instrument, ts) VALUES(?,?) ON CONFLICT(instrument) DO UPDATE SET ts=excluded.ts",
               (instrument, now_iso()))
    db.commit()


# ---------- models and reports (kept in the database so any machine can train or predict) ----------

def save_model(db: Db, name: str, model, meta: dict):
    buf = io.BytesIO()
    joblib.dump(model, buf)
    db.execute(
        "INSERT INTO models(name, blob, meta, updated) VALUES(?,?,?,?) "
        "ON CONFLICT(name) DO UPDATE SET blob=excluded.blob, meta=excluded.meta, updated=excluded.updated",
        (name, buf.getvalue(), dumps(meta), now_iso()),
    )
    db.commit()


def load_model(db: Db, name: str):
    """Returns {"model", "meta"} or None. The blob is a pickle: only ever load from a database you control."""
    row = db.execute("SELECT blob, meta FROM models WHERE name=?", (name,)).fetchone()
    if row is None:
        return None
    return {"model": joblib.load(io.BytesIO(bytes(row["blob"]))), "meta": json.loads(row["meta"])}


def save_report(db: Db, instrument: str, report: dict):
    db.execute(
        "INSERT INTO reports(instrument, body, updated) VALUES(?,?,?) "
        "ON CONFLICT(instrument) DO UPDATE SET body=excluded.body, updated=excluded.updated",
        (instrument, dumps(report), now_iso()),
    )
    db.commit()


def load_report(db: Db, instrument: str) -> dict:
    row = db.execute("SELECT body FROM reports WHERE instrument=?", (instrument,)).fetchone()
    return json.loads(row["body"]) if row else {}


def save_series(db: Db, name: str, s, keep: int = 70):
    """Publish the recent daily values of one input (a market price, a positioning number...) for the website."""
    s = s.dropna()
    s = s[~s.index.duplicated(keep="last")].tail(keep)
    for i in range(0, len(s), 100):
        part = list(zip(s.index[i:i + 100], s.values[i:i + 100]))
        db.execute(
            "INSERT INTO series(name, ts, value) VALUES " + ",".join(["(?,?,?)"] * len(part))
            + " ON CONFLICT(name, ts) DO UPDATE SET value=excluded.value",
            [v for ts, val in part for v in (name, str(pd_date(ts)), float(val))],
        )
    db.commit()


def pd_date(ts) -> str:
    """Daily series are keyed by calendar date text."""
    return str(ts)[:10]


def _save_json_row(db: Db, table: str, instrument: str, horizon: str, body: dict):
    db.execute(
        f"INSERT INTO {table}(instrument, horizon, body, updated) VALUES(?,?,?,?) "
        "ON CONFLICT(instrument, horizon) DO UPDATE SET body=excluded.body, updated=excluded.updated",
        (instrument, horizon, dumps(body), now_iso()),
    )
    db.commit()


def _load_json_row(db: Db, table: str, instrument: str, horizon: str):
    row = db.execute(f"SELECT body FROM {table} WHERE instrument=? AND horizon=?", (instrument, horizon)).fetchone()
    return json.loads(row["body"]) if row else None


def save_research(db: Db, instrument: str, horizon: str, body: dict):
    """Result of the locked hold-out study for one instrument and horizon."""
    _save_json_row(db, "research", instrument, horizon, body)


def load_research(db: Db, instrument: str, horizon: str):
    return _load_json_row(db, "research", instrument, horizon)


def save_explanation(db: Db, instrument: str, horizon: str, body: dict):
    """What drove the latest reading (shown on the 'what gold depends on' screen)."""
    _save_json_row(db, "explanations", instrument, horizon, body)


def save_scorecard(db: Db, instrument: str, horizon: str, body: dict):
    """The factor checklist for one horizon (what each factor says now and how often it was right before)."""
    _save_json_row(db, "scorecards", instrument, horizon, body)


def load_scorecard(db: Db, instrument: str, horizon: str):
    return _load_json_row(db, "scorecards", instrument, horizon)


def load_explanation(db: Db, instrument: str, horizon: str):
    return _load_json_row(db, "explanations", instrument, horizon)


# ---------- data for the website ----------

def save_candles(db: Db, instrument: str, tf: str, df, limit: int = 400, chunk: int = 200):
    """Upsert the latest `limit` candles; times are epoch seconds of the exchange's local clock read as UTC."""
    df = df[~df.index.duplicated(keep="last")].tail(limit)
    t = df.index.tz_localize(None) if df.index.tz is not None else df.index
    rows = [(instrument, tf, int(ts.timestamp()), float(o), float(h), float(lo), float(c))
            for ts, o, h, lo, c in zip(t, df["open"], df["high"], df["low"], df["close"])]
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        db.execute(
            "INSERT INTO candles(instrument, tf, ts, open, high, low, close) VALUES "
            + ",".join(["(?,?,?,?,?,?,?)"] * len(part))
            + " ON CONFLICT(instrument, tf, ts) DO UPDATE SET open=excluded.open, high=excluded.high, "
            "low=excluded.low, close=excluded.close",
            [v for r in part for v in r],
        )
    db.commit()


def sync_instruments(db: Db, cfg: dict):
    """Publish instrument names and horizons so the website needs no copy of config.yaml."""
    for i, (name, inst) in enumerate(cfg["instruments"].items()):
        db.execute(
            "INSERT INTO instruments(id, label, horizons, enabled, sort) VALUES(?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET label=excluded.label, horizons=excluded.horizons, "
            "enabled=excluded.enabled, sort=excluded.sort",
            (name, inst.get("label", name), dumps([h["name"] for h in inst["horizons"]]),
             int(inst.get("enabled", True)), i),
        )
    db.commit()
