/**
 * All database reads and writes for the website. Pure functions over a `Run` callback, so production binds Neon
 * (HTTP) and tests bind a local Postgres engine. Postgres returns BIGINT/COUNT as strings, hence the casts.
 */
export type Run = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const CANDLE_TFS = ["D1", "H1", "M15"] as const;
export type CandleTf = (typeof CANDLE_TFS)[number];

export async function listInstruments(run: Run) {
  const rows = await run<{ id: string; label: string; horizons: string }>(
    "SELECT id, label, horizons FROM instruments WHERE enabled = 1 ORDER BY sort, id",
  );
  return rows.map((r) => ({ id: r.id, label: r.label, horizons: JSON.parse(r.horizons) as string[] }));
}

async function requireInstrument(run: Run, name: string) {
  const rows = await run<{ label: string; horizons: string }>(
    "SELECT label, horizons FROM instruments WHERE id = $1 AND enabled = 1",
    [name],
  );
  if (rows.length === 0) throw new HttpError(404, "unknown instrument");
  return { label: rows[0].label, horizons: JSON.parse(rows[0].horizons) as string[] };
}

type PredictionRow = {
  horizon: string;
  signal: "BUY" | "SELL" | "WAIT";
  p_up: number;
  price: number;
  regime: string;
  has_edge: number;
  bar_ts: string;
  created: string;
  model_version: string;
};

export function reasonCode(hasEdge: boolean, regime: string | null, signal: string): string {
  if (!hasEdge) return "no_edge";
  if (regime === "ABNORMAL") return "abnormal";
  return signal !== "WAIT" ? "signal" : "uncertain";
}

export async function getSignals(run: Run, name: string) {
  const inst = await requireInstrument(run, name);
  const [preds, reportRows, beat] = await Promise.all([
    run<PredictionRow>(
      "SELECT horizon, signal, p_up, price, regime, has_edge, bar_ts, created, model_version FROM predictions " +
        "WHERE id IN (SELECT MAX(id) FROM predictions WHERE instrument = $1 GROUP BY horizon)",
      [name],
    ),
    run<{ body: string }>("SELECT body FROM reports WHERE instrument = $1", [name]),
    run<{ ts: string }>("SELECT ts FROM heartbeat WHERE instrument = $1", [name]),
  ]);
  const report: Record<string, Record<string, number | boolean | null>> = reportRows[0] ? JSON.parse(reportRows[0].body) : {};
  const byHorizon = new Map(preds.map((p) => [p.horizon, p]));

  const signals = inst.horizons.map((h) => {
    const bt = report[h] ?? {};
    const backtest = {
      auc: (bt.auc as number) ?? null,
      accuracy: (bt.accuracy as number) ?? null,
      baseline_accuracy: (bt.baseline_accuracy as number) ?? null,
      signal_accuracy: (bt.signal_accuracy as number) ?? null,
      n_trades: (bt.n_trades as number) ?? null,
      has_edge: (bt.has_edge as boolean) ?? null,
    };
    const p = byHorizon.get(h);
    if (!p) {
      return {
        horizon: h, backtest, signal: "WAIT" as const, reason_code: "no_data", p_up: null, price: null,
        regime: null, has_edge: Boolean(bt.has_edge), bar_ts: null, created: null,
      };
    }
    const hasEdge = Boolean(p.has_edge);
    return {
      horizon: h, backtest, signal: p.signal, reason_code: reasonCode(hasEdge, p.regime, p.signal), p_up: p.p_up,
      price: p.price, regime: p.regime, has_edge: hasEdge, bar_ts: p.bar_ts, created: p.created,
    };
  });
  return { instrument: name, label: inst.label, signals, last_check: beat[0]?.ts ?? null };
}

export async function getCandles(run: Run, name: string, tf: string, limit: number) {
  await requireInstrument(run, name);
  if (!(CANDLE_TFS as readonly string[]).includes(tf)) throw new HttpError(400, "tf must be D1, H1 or M15");
  const n = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 250, 1000));
  const rows = await run<{ time: number; open: number; high: number; low: number; close: number }>(
    "SELECT ts::float8 AS time, open, high, low, close FROM candles WHERE instrument = $1 AND tf = $2 ORDER BY ts DESC LIMIT $3",
    [name, tf, n],
  );
  return { tf, candles: rows.reverse() };
}

export async function getTrades(run: Run, name: string, limit: number) {
  await requireInstrument(run, name);
  const n = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 50, 500));
  return run(
    "SELECT id::int AS id, horizon, direction, bar_ts, entry, status, pnl_pct FROM shadow_trades " +
      "WHERE instrument = $1 ORDER BY id DESC LIMIT $2",
    [name, n],
  );
}

export async function getHistory(run: Run, name: string, limit: number) {
  await requireInstrument(run, name);
  const n = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 100, 500));
  return run(
    "SELECT created, horizon, bar_ts, price, p_up, signal, regime, has_edge, outcome_up FROM predictions " +
      "WHERE instrument = $1 ORDER BY id DESC LIMIT $2",
    [name, n],
  );
}

export async function getPerformance(run: Run, name: string) {
  await requireInstrument(run, name);
  const [closed, open, resolved] = await Promise.all([
    run<{ pnl_pct: number; exit_ts: string }>(
      "SELECT pnl_pct, exit_ts FROM shadow_trades WHERE instrument = $1 AND status <> 'OPEN' ORDER BY exit_ts, id",
      [name],
    ),
    run<{ n: number }>("SELECT COUNT(*)::int AS n FROM shadow_trades WHERE instrument = $1 AND status = 'OPEN'", [name]),
    run<{ p_up: number; outcome_up: number }>(
      "SELECT p_up, outcome_up FROM predictions WHERE instrument = $1 AND outcome_up IS NOT NULL",
      [name],
    ),
  ]);
  const total = closed.reduce((s, r) => s + r.pnl_pct, 0);
  let running = 0;
  const curve = closed.map((r) => {
    running += r.pnl_pct;
    return { time: r.exit_ts, equity: Math.round(running * 1e6) / 1e6 };
  });
  const hits = resolved.filter((r) => (r.p_up >= 0.5) === (r.outcome_up === 1)).length;
  return {
    open_trades: open[0]?.n ?? 0,
    closed_trades: closed.length,
    win_rate: closed.length ? closed.filter((r) => r.pnl_pct > 0).length / closed.length : null,
    total_return: total,
    avg_return: closed.length ? total / closed.length : null,
    curve,
    checked_predictions: resolved.length,
    direction_hit_rate: resolved.length ? hits / resolved.length : null,
  };
}

export type AlertSettings = { telegram_on: boolean; telegram_chat_id: string | null; email_on: boolean };

export async function getAlerts(run: Run, email: string): Promise<AlertSettings> {
  const rows = await run<{ telegram_chat_id: string | null; telegram_on: number; email_on: number }>(
    "SELECT telegram_chat_id, telegram_on, email_on FROM user_settings WHERE email = $1",
    [email],
  );
  const r = rows[0];
  return { telegram_on: Boolean(r?.telegram_on), telegram_chat_id: r?.telegram_chat_id ?? null, email_on: Boolean(r?.email_on) };
}

export async function putAlerts(run: Run, email: string, body: Partial<AlertSettings>) {
  const chat = (body.telegram_chat_id ?? "").toString().trim() || null;
  if (chat !== null && !/^-?\d{3,20}$/.test(chat)) throw new HttpError(400, "Telegram chat ID must be a number");
  if (body.telegram_on && !chat) throw new HttpError(400, "enter your Telegram chat ID first");
  await run(
    "INSERT INTO user_settings(email, telegram_chat_id, telegram_on, email_on) VALUES($1, $2, $3, $4) " +
      "ON CONFLICT(email) DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id, " +
      "telegram_on = excluded.telegram_on, email_on = excluded.email_on",
    [email, chat, body.telegram_on ? 1 : 0, body.email_on ? 1 : 0],
  );
  return { ok: true };
}
