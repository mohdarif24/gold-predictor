CREATE TABLE IF NOT EXISTS predictions(
  id BIGSERIAL PRIMARY KEY, created TEXT, instrument TEXT, horizon TEXT, tf TEXT, steps INTEGER,
  bar_ts TEXT, price DOUBLE PRECISION, atr DOUBLE PRECISION, p_up DOUBLE PRECISION, signal TEXT, regime TEXT, has_edge INTEGER,
  model_version TEXT, reason TEXT, outcome_up INTEGER, resolved_ts TEXT, shown_p_up DOUBLE PRECISION, outcome_price DOUBLE PRECISION,
  UNIQUE(instrument, horizon, bar_ts)
);
CREATE TABLE IF NOT EXISTS shadow_trades(
  id BIGSERIAL PRIMARY KEY, prediction_id INTEGER, instrument TEXT, horizon TEXT, direction TEXT,
  bar_ts TEXT, entry DOUBLE PRECISION, sl DOUBLE PRECISION, tp DOUBLE PRECISION, status TEXT, exit_ts TEXT, exit_price DOUBLE PRECISION, pnl_pct DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS heartbeat(instrument TEXT PRIMARY KEY, ts TEXT);
CREATE TABLE IF NOT EXISTS models(name TEXT PRIMARY KEY, blob BYTEA, meta TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS reports(instrument TEXT PRIMARY KEY, body TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS research(instrument TEXT, horizon TEXT, body TEXT, updated TEXT, PRIMARY KEY(instrument, horizon));
CREATE TABLE IF NOT EXISTS scorecards(instrument TEXT, horizon TEXT, body TEXT, updated TEXT, PRIMARY KEY(instrument, horizon));
CREATE TABLE IF NOT EXISTS explanations(instrument TEXT, horizon TEXT, body TEXT, updated TEXT, PRIMARY KEY(instrument, horizon));
CREATE TABLE IF NOT EXISTS series(name TEXT, ts TEXT, value DOUBLE PRECISION, PRIMARY KEY(name, ts));
CREATE TABLE IF NOT EXISTS news(
  id TEXT PRIMARY KEY, published TEXT, source TEXT, title TEXT, url TEXT, topic TEXT, sentiment DOUBLE PRECISION, impact TEXT,
  summary TEXT, scorer TEXT
);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, ts TEXT, country TEXT, title TEXT, impact TEXT, forecast TEXT, previous TEXT);
CREATE TABLE IF NOT EXISTS candles(
  instrument TEXT, tf TEXT, ts BIGINT, open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION, close DOUBLE PRECISION,
  PRIMARY KEY(instrument, tf, ts)
);
CREATE TABLE IF NOT EXISTS instruments(id TEXT PRIMARY KEY, label TEXT, horizons TEXT, enabled INTEGER, sort INTEGER);
CREATE TABLE IF NOT EXISTS access_codes(email TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, created TEXT, last_used TEXT, role TEXT DEFAULT 'user');
CREATE TABLE IF NOT EXISTS user_settings(
  email TEXT PRIMARY KEY, telegram_chat_id TEXT, telegram_on INTEGER DEFAULT 0, email_on INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS app_settings(name TEXT PRIMARY KEY, value TEXT, updated TEXT, updated_by TEXT);
CREATE TABLE IF NOT EXISTS api_logs(
  id BIGSERIAL PRIMARY KEY, ts TEXT, source TEXT, url TEXT, model TEXT, ok INTEGER, status INTEGER, ms INTEGER,
  request TEXT, response TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_pred_inst ON predictions(instrument, id);
CREATE INDEX IF NOT EXISTS idx_trades_inst ON shadow_trades(instrument, status);
