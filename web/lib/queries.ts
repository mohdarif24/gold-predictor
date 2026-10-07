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

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Percentage change between the last value and the value `back` observations earlier. */
function diff(values: number[], back: number): number | null {
  return values.length > back ? values[values.length - 1] - values[values.length - 1 - back] : null;
}

function change(values: number[], back: number): number | null {
  if (values.length <= back) return null;
  const old = values[values.length - 1 - back];
  return old ? values[values.length - 1] / old - 1 : null;
}

export async function getDrivers(run: Run, name: string) {
  const inst = await requireInstrument(run, name);
  const [research, reports, explanations, series] = await Promise.all([
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM research WHERE instrument = $1", [name]),
    run<{ body: string }>("SELECT body FROM reports WHERE instrument = $1", [name]),
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM explanations WHERE instrument = $1", [name]),
    run<{ name: string; ts: string; value: number }>(
      "SELECT name, ts, value FROM series WHERE name LIKE 'driver:%' OR name LIKE 'cot_%' ORDER BY name, ts",
    ),
  ]);
  const study = new Map(research.map((r) => [r.horizon, JSON.parse(r.body) as Json]));
  const walk: Json = reports[0] ? JSON.parse(reports[0].body) : {};
  const expl = new Map(explanations.map((r) => [r.horizon, JSON.parse(r.body) as Json]));

  const horizons = inst.horizons.map((h) => {
    const s = study.get(h);
    const w = walk[h];
    const hold = s?.holdout;
    // The headline accuracy is the locked hold-out when a study exists; otherwise the plain walk-forward test.
    const accuracy = hold
      ? {
          source: "holdout", accuracy: hold.accuracy ?? null, baseline: hold.baseline_accuracy ?? null, auc: hold.auc ?? null,
          auc_ci: hold.auc_ci ?? null, n: hold.n ?? null, period: hold.period ?? null, has_edge: Boolean(hold.has_edge),
        }
      : w
        ? {
            source: "walk_forward", accuracy: w.accuracy ?? null, baseline: w.baseline_accuracy ?? null, auc: w.auc ?? null,
            auc_ci: null, n: w.n ?? null, period: null, has_edge: Boolean(w.has_edge),
          }
        : null;
    return {
      horizon: h,
      accuracy,
      model: s?.selected?.model ?? w?.model ?? null,
      feature_set: s?.selected?.feature_set ?? w?.feature_set ?? null,
      candidates_tested: s?.protocol?.candidates_tested ?? null,
      selective: hold?.selective ?? null,
      high_confidence: hold?.high_confidence ?? null,
      explanation: expl.get(h) ?? null,
    };
  });

  const byName = new Map<string, { ts: string; value: number }[]>();
  for (const r of series) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name)!.push({ ts: r.ts, value: r.value });
  }
  const drivers = [...byName.entries()]
    .filter(([n]) => n.startsWith("driver:"))
    .map(([n, pts]) => {
      const v = pts.map((p) => p.value);
      return { key: n.slice(7), last: v[v.length - 1], asof: pts[pts.length - 1].ts, chg1: change(v, 1), chg5: change(v, 5), chg20: change(v, 20), d1: diff(v, 1), d5: diff(v, 5), d20: diff(v, 20) };
    });
  const cot = (n: string) => byName.get(n)?.at(-1);
  const positioning = cot("cot_mm_net")
    ? { speculators_net: cot("cot_mm_net")!.value, hedgers_net: cot("cot_pm_net")?.value ?? null, rank3y: cot("cot_mm_rank3y")?.value ?? null, asof: cot("cot_mm_net")!.ts }
    : null;
  return { instrument: name, horizons, drivers, positioning };
}

const iso = (d: Date) => d.toISOString().slice(0, 19); // second precision, comparable with the stored UTC text

/** Latest headlines with what they imply for gold, the overall mood, and the next scheduled events. */
export async function getNews(run: Run, now: Date = new Date()) {
  const [articles, events] = await Promise.all([
    run<{ published: string; source: string; title: string; url: string; topic: string; sentiment: number; impact: string; summary: string | null; scorer: string }>(
      "SELECT published, source, title, url, topic, sentiment, impact, summary, scorer FROM news ORDER BY published DESC LIMIT 40",
    ),
    run<{ ts: string; country: string; title: string; impact: string; forecast: string | null; previous: string | null }>(
      "SELECT ts, country, title, impact, forecast, previous FROM events WHERE ts >= $1 ORDER BY ts LIMIT 12",
      [iso(new Date(now.getTime() - 2 * 3600_000))],
    ),
  ]);
  const since = iso(new Date(now.getTime() - 24 * 3600_000));
  const recent = articles.filter((a) => a.published.slice(0, 19) >= since);
  const mean = recent.length ? recent.reduce((s, a) => s + a.sentiment, 0) / recent.length : null;
  const bucket = (x: number) => (x >= 0.2 ? "bullish" : x <= -0.2 ? "bearish" : "neutral");
  return {
    mood: {
      score: mean, label: mean === null ? null : bucket(mean), count: recent.length,
      bullish: recent.filter((a) => a.sentiment >= 0.2).length, bearish: recent.filter((a) => a.sentiment <= -0.2).length,
    },
    articles: articles.map((a) => ({ ...a, label: bucket(a.sentiment) })),
    events,
  };
}

/** The email whose access code has this hash (and record the sign-in), or null. */
export async function emailForCode(run: Run, codeHash: string, now: Date = new Date()): Promise<string | null> {
  const rows = await run<{ email: string }>(
    "UPDATE access_codes SET last_used = $2 WHERE code_hash = $1 RETURNING email",
    [codeHash, now.toISOString().slice(0, 19) + "+00:00"],
  );
  return rows[0]?.email ?? null;
}

export async function hasAccessCode(run: Run, email: string): Promise<boolean> {
  return (await roleOf(run, email)) !== null;
}

/** Extra pages the super admin can open to a client, one switch each on the Users page. */
export const PERMS = ["logs"] as const;
export type Perm = (typeof PERMS)[number];

export function parsePerms(s: string | null | undefined): Perm[] {
  return (s ?? "").split(",").map((p) => p.trim()).filter((p): p is Perm => (PERMS as readonly string[]).includes(p));
}

/** Role and extra pages, or null when the person has no (or a revoked) access code. */
export async function accessOf(run: Run, email: string): Promise<{ role: "admin" | "user"; perms: Perm[] } | null> {
  const rows = await run<{ role: string | null; perms: string | null }>("SELECT role, perms FROM access_codes WHERE email = $1", [email]);
  if (!rows.length) return null;
  return { role: rows[0].role === "admin" ? "admin" : "user", perms: parsePerms(rows[0].perms) };
}

/** "admin", "user", or null when the person has no (or a revoked) access code. */
export async function roleOf(run: Run, email: string): Promise<"admin" | "user" | null> {
  return (await accessOf(run, email))?.role ?? null;
}

const MIN_CASES = 30; // below this, a measured rate is too noisy to show to clients

type Bin = { pred: number; actual: number; n: number };

/**
 * The plain signal clients see: the chance gold ends higher or lower, measured from what actually happened in similar
 * past situations. Daily horizons use the factor checklist; intraday horizons use the model's hold-out calibration
 * (its raw probability is mapped to how often that probability came true). Never the model's own unchecked number.
 */
export async function getPublicSignal(run: Run, name: string) {
  const inst = await requireInstrument(run, name);
  const [cards, research, preds] = await Promise.all([
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM scorecards WHERE instrument = $1", [name]),
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM research WHERE instrument = $1", [name]),
    run<{ horizon: string; p_up: number; created: string }>(
      "SELECT horizon, p_up, created FROM predictions WHERE id IN (SELECT MAX(id) FROM predictions WHERE instrument = $1 GROUP BY horizon)",
      [name],
    ),
  ]);
  const card = new Map(cards.map((r) => [r.horizon, JSON.parse(r.body)]));
  const study = new Map(research.map((r) => [r.horizon, JSON.parse(r.body)]));
  const pred = new Map(preds.map((r) => [r.horizon, r]));

  const horizons = inst.horizons.map((h) => {
    const c = card.get(h);
    if (c) {
      const p = c.full;
      const base: number = p.base_up.rate ?? 0.5;
      let up = base;
      let n = p.base_up.n as number;
      if (c.direction !== "none" && p.total.rate != null && p.total.n >= MIN_CASES) {
        up = c.direction === "up" ? p.total.rate : 1 - p.total.rate;
        n = p.total.n;
      }
      return { horizon: h, p_up: up, source: "checklist", cases: n, as_of: c.as_of as string };
    }
    const bins: Bin[] = study.get(h)?.holdout?.calibration ?? [];
    const latest = pred.get(h);
    const total = bins.reduce((s, b) => s + b.n, 0);
    const base = total ? bins.reduce((s, b) => s + b.actual * b.n, 0) / total : 0.5;
    if (!latest || !bins.length) return { horizon: h, p_up: base, source: "base_rate", cases: total, as_of: latest?.created ?? null };
    const near = bins.reduce((a, b) => (Math.abs(b.pred - latest.p_up) < Math.abs(a.pred - latest.p_up) ? b : a));
    const up = near.n >= MIN_CASES ? near.actual : base;
    return { horizon: h, p_up: up, source: near.n >= MIN_CASES ? "model_calibrated" : "base_rate", cases: near.n >= MIN_CASES ? near.n : total, as_of: latest.created };
  });
  return {
    instrument: name,
    label: inst.label,
    signals: horizons.map((x) => ({ ...x, p_up: Math.round(Math.min(0.95, Math.max(0.05, x.p_up)) * 100) / 100, p_down: Math.round((1 - Math.min(0.95, Math.max(0.05, x.p_up))) * 100) / 100 })),
  };
}

export const LOG_PERIODS = ["day", "week", "month", "year"] as const;
export type LogPeriod = (typeof LOG_PERIODS)[number];
const BUCKET: Record<LogPeriod, string> = {
  day: "left(created, 10)",
  week: "to_char(date_trunc('week', left(created, 10)::date), 'YYYY-MM-DD')", // the Monday the week starts on
  month: "left(created, 7)",
  year: "left(created, 4)",
};
// What the reading said: the chance clients were shown, or the model's own number for readings logged before that was
// kept. 47-53% is shown to clients as "no clear direction", so it is neither right nor wrong.
const SAID = "COALESCE(shown_p_up, p_up)";
const STATUS =
  `CASE WHEN ROUND(${SAID} * 100) BETWEEN 47 AND 53 THEN 'nocall' WHEN outcome_up IS NULL THEN 'pending' ` +
  `WHEN (${SAID} > 0.5) = (outcome_up = 1) THEN 'right' ELSE 'wrong' END`;

/**
 * Every reading with whether it came true, and right / wrong counts per day, week, month or year. Optionally one horizon
 * and one status. Counts cover every reading; the list shows the newest `limit`.
 */
export async function getPredictionLog(
  run: Run, name: string,
  opts: { horizon?: string | null; period?: string | null; status?: string | null; limit?: number; client?: boolean } = {},
) {
  const inst = await requireInstrument(run, name);
  const horizon = opts.horizon && inst.horizons.includes(opts.horizon) ? opts.horizon : null;
  const period: LogPeriod = LOG_PERIODS.includes(opts.period as LogPeriod) ? (opts.period as LogPeriod) : "day";
  const status = ["right", "wrong", "pending", "nocall"].includes(opts.status ?? "") ? opts.status! : null;
  const n = Math.max(1, Math.min(Number.isFinite(opts.limit) ? opts.limit! : 100, 500));
  // A client sees only readings whose chance was really shown to clients, and never the model's own number.
  const shown = opts.client ? " AND shown_p_up IS NOT NULL" : "";
  const base = `FROM predictions WHERE instrument = $1 AND ($2::text IS NULL OR horizon = $2)${shown}`;
  const counts =
    "COUNT(*) FILTER (WHERE s = 'right')::int AS right_n, COUNT(*) FILTER (WHERE s = 'wrong')::int AS wrong_n, " +
    "COUNT(*) FILTER (WHERE s = 'pending')::int AS pending_n, COUNT(*) FILTER (WHERE s = 'nocall')::int AS nocall_n";
  const [rows, buckets, total] = await Promise.all([
    run(
      `SELECT * FROM (SELECT id::int AS id, created, horizon, bar_ts, price, p_up, shown_p_up, ${SAID} AS said, signal, regime, ` +
        `has_edge, outcome_up, outcome_price, resolved_ts, ${STATUS} AS status ${base}) x ` +
        `WHERE ($3::text IS NULL OR status = $3) ORDER BY id DESC LIMIT $4`,
      [name, horizon, status, n],
    ),
    run(`SELECT k AS period, ${counts} FROM (SELECT ${BUCKET[period]} AS k, ${STATUS} AS s ${base}) x GROUP BY k ORDER BY k DESC LIMIT 60`, [name, horizon]),
    run<Record<string, number>>(`SELECT ${counts} FROM (SELECT ${STATUS} AS s ${base}) x`, [name, horizon]),
  ]);
  const shape = (r: Record<string, unknown>) => {
    const right = Number(r.right_n), wrong = Number(r.wrong_n);
    return { right, wrong, pending: Number(r.pending_n), nocall: Number(r.nocall_n), accuracy: right + wrong ? right / (right + wrong) : null };
  };
  const CLIENT_COLS = ["id", "created", "horizon", "bar_ts", "price", "said", "outcome_up", "outcome_price", "resolved_ts", "status"];
  return {
    instrument: name, horizon, period,
    rows: opts.client ? rows.map((r) => Object.fromEntries(CLIENT_COLS.map((c) => [c, r[c]]))) : rows,
    buckets: buckets.map((b) => ({ period: b.period as string, ...shape(b) })),
    total: shape(total[0] ?? {}),
  };
}

/** The factor checklist per daily horizon, with the model's own tested accuracy next to it. */
export async function getChecklist(run: Run, name: string) {
  const inst = await requireInstrument(run, name);
  const [cards, research] = await Promise.all([
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM scorecards WHERE instrument = $1", [name]),
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM research WHERE instrument = $1", [name]),
  ]);
  const card = new Map(cards.map((r) => [r.horizon, JSON.parse(r.body)]));
  const study = new Map(research.map((r) => [r.horizon, JSON.parse(r.body)]));
  return {
    instrument: name,
    horizons: inst.horizons.filter((h) => card.has(h)).map((h) => {
      const hold = study.get(h)?.holdout;
      return {
        horizon: h,
        card: card.get(h),
        model: hold ? { name: study.get(h).selected?.model ?? null, accuracy: hold.accuracy ?? null, baseline: hold.baseline_accuracy ?? null, n: hold.n ?? null, has_edge: Boolean(hold.has_edge) } : null,
      };
    }),
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
