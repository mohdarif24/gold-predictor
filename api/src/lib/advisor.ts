/**
 * The AI advisor: a chat for the super admin. On every question it reads the current state from this system's own
 * database (a "snapshot"), sends it with the conversation to the configured LLM, and checks every number in the answer
 * against the snapshot. Answers with unknown numbers are sent back once for a rewrite, then flagged. Risk numbers are
 * computed here, never by the model. It guides; the trader decides.
 */
import { logApi, providerMessage, resolveLlm } from "./admin";
import { HttpError, type Run, requireInstrument } from "./queries";

const KEY_DRIVERS = ["dxy", "real_yield", "us10y", "fed_funds", "breakeven", "vix", "gvz", "silver", "oil", "spx", "btc",
  "usdinr", "usdbdt", "epu_us", "gpr"];
const RISK_PCT = 1; // at most 1% of the account on one trade
const OZ_PER_LOT = 100; // XAU/USD: one standard lot is 100 troy ounces
const HISTORY = 10; // earlier messages sent with each question

const SYSTEM = `You are a calm, experienced gold trading advisor and mentor talking to one trader. You explain; the trader decides.
Rules you must follow:
1. Use ONLY facts and numbers that appear in DATA (the system's current state), in MY CONTEXT, or in the trader's own messages. Never invent prices, levels, targets, news, events or dates. If something is not in DATA, say you do not know it.
2. Copy numbers as they appear in DATA (rounding is fine). Do not calculate new numbers.
3. Be honest about the evidence: DATA.verdicts.any_proven_edge says whether any time window passed the locked tests. If not, say the chances are close to a coin flip and position size should stay small or zero.
4. Never promise or predict a result. Speak in scenarios: if this happens, then that.
5. Risk: use only DATA.risk (stop distances and position sizes for 1% risk on a 1,000-dollar account; the trader can scale it). If a window has event_pause, advise staying out of that window until after the event.
6. When asked what to do, give choices (stay out, hold an existing position, a small position with a stop), say when each makes sense, and leave the decision to the trader.
7. Reply in the language the trader writes in (Bengali or English). Plain text, short paragraphs or "- " bullet points, no tables. Keep it under 250 words unless asked for more.`;

type Row = Record<string, unknown>;

async function driver(run: Run, name: string) {
  const rows = await run<{ ts: string; value: number }>("SELECT ts, value FROM series WHERE name = $1 ORDER BY ts DESC LIMIT 6", [`driver:${name}`]);
  if (!rows.length) return null;
  const v = rows.map((r) => Number(r.value));
  const out: Row = { last: Math.round(v[0] * 1e4) / 1e4, as_of: String(rows[0].ts).slice(0, 10) };
  if (v.length > 1 && v[1]) out.change_1d_pct = Math.round((v[0] / v[1] - 1) * 1e4) / 100;
  if (v.length > 5 && v[5]) out.change_5d_pct = Math.round((v[0] / v[5] - 1) * 1e4) / 100;
  return out;
}

/** Everything the advisor may talk about, read fresh from the database. */
export async function buildSnapshot(run: Run, name: string, now: Date = new Date()) {
  const inst = await requireInstrument(run, name);
  const [preds, research, cards, candles, news, events, catalog] = await Promise.all([
    run<Row>("SELECT horizon, created, price, atr, regime, signal, shown_p_up, event FROM predictions WHERE id IN " +
      "(SELECT MAX(id) FROM predictions WHERE instrument = $1 GROUP BY horizon)", [name]),
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM research WHERE instrument = $1", [name]),
    run<{ horizon: string; body: string }>("SELECT horizon, body FROM scorecards WHERE instrument = $1 AND horizon = '1d'", [name]),
    run<{ close: number }>("SELECT close FROM candles WHERE instrument = $1 AND tf = 'H1' ORDER BY ts DESC LIMIT 25", [name]),
    run<{ title: string; sentiment: number; impact: string }>(
      "SELECT title, sentiment, impact FROM news WHERE published >= $1 ORDER BY published DESC LIMIT 8",
      [new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 19)]),
    run<Row>("SELECT ts, title, impact, forecast, previous FROM events WHERE country = 'USD' AND ts >= $1 AND ts <= $2 ORDER BY ts LIMIT 6",
      [now.toISOString().slice(0, 16) + "+00:00", new Date(now.getTime() + 48 * 3600_000).toISOString().slice(0, 16) + "+00:00"]),
    run<{ value: string }>("SELECT value FROM app_settings WHERE name = 'catalog'"),
  ]);
  const study = new Map(research.map((r) => [r.horizon, JSON.parse(r.body)]));
  let slAtr = 1.5;
  try {
    const p = JSON.parse(catalog[0]?.value ?? "{}").model?.find((x: { name: string }) => x.name.startsWith("practice stop"));
    if (p) slAtr = Number(p.value) || slAtr;
  } catch {
    // keep the default
  }
  const order = inst.horizons;
  const windows = preds
    .sort((a, b) => order.indexOf(String(a.horizon)) - order.indexOf(String(b.horizon)))
    .map((p) => {
      const hold = study.get(String(p.horizon))?.holdout ?? {};
      return {
        window: p.horizon, reading_time: p.created, price: Math.round(Number(p.price) * 100) / 100, regime: p.regime,
        chance_higher_pct: p.shown_p_up == null ? null : Math.round(Number(p.shown_p_up) * 100),
        event_pause: p.event ?? null,
        tested_accuracy_pct: hold.accuracy == null ? null : Math.round(hold.accuracy * 1000) / 10,
        guessing_accuracy_pct: hold.baseline_accuracy == null ? null : Math.round(hold.baseline_accuracy * 1000) / 10,
        proven_edge: Boolean(hold.has_edge), atr_usd: Math.round(Number(p.atr) * 100) / 100,
      };
    });
  const c = candles.map((r) => Number(r.close));
  const moves: Row = {};
  for (const [label, k] of [["1h", 1], ["4h", 4], ["24h", 24]] as const) {
    if (c.length > k && c[k]) moves[`change_${label}_pct`] = Math.round((c[0] / c[k] - 1) * 1e4) / 100;
  }
  const card = cards[0] ? JSON.parse(cards[0].body) : null;
  const drivers: Row = {};
  for (const [k, v] of await Promise.all(KEY_DRIVERS.map(async (k) => [k, await driver(run, k)] as const))) if (v) drivers[k] = v;
  const risk = {
    rule: `risk at most ${RISK_PCT}% of the account on one trade`, stop_rule: `stop ${slAtr} x ATR away`,
    per_window: windows.filter((w) => w.atr_usd > 0).map((w) => {
      const stop = Math.round(slAtr * w.atr_usd * 100) / 100;
      const oz = Math.round(((1000 * RISK_PCT) / 100 / stop) * 1000) / 1000;
      return { window: w.window, stop_distance_usd: stop, account_usd: 1000, risk_usd: (1000 * RISK_PCT) / 100, size_oz: oz,
        size_lots: Math.round((oz / OZ_PER_LOT) * 1e4) / 1e4 };
    }),
  };
  return {
    instrument: inst.label, time_utc: now.toISOString().slice(0, 16), price: windows[0]?.price ?? null, recent_moves: moves, windows,
    checklist_1d: card ? { leaning: card.direction, factors_net: card.net,
      factors: Object.fromEntries(Object.entries(card.now ?? {}).map(([k, v]) => [k, Number(v) > 0 ? "up" : Number(v) < 0 ? "down" : "neutral"])) } : null,
    drivers,
    news_24h: news.map((n) => ({ title: n.title, impact: n.impact,
      mood: n.sentiment >= 0.2 ? "good for gold" : n.sentiment <= -0.2 ? "bad for gold" : "neutral" })),
    us_events_next_48h: events,
    verdicts: { any_proven_edge: windows.some((w) => w.proven_edge) },
    risk,
  };
}

// ---------------------------------------------------------------------------------------------- the number check
const BN = "০১২৩৪৫৬৭৮৯";
const ALWAYS_OK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 24, 30, 48, 50, 60, 100, 250, 1000];

export function numbersIn(text: string): number[] {
  const ascii = text.replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
  return (ascii.match(/\d+(?:[.,]\d+)*/g) ?? []).map((m) => Number(m.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

function allowed(source: unknown, extra: string): number[] {
  const vals = new Set<number>(ALWAYS_OK);
  const add = (v: number) => {
    for (const x of [v, v * 100, Math.abs(v), Math.abs(v) * 100]) for (const d of [0, 1, 2, 3]) vals.add(Math.round(x * 10 ** d) / 10 ** d);
  };
  const walk = (o: unknown): void => {
    if (typeof o === "number") add(o);
    else if (typeof o === "string") numbersIn(o).forEach((n) => { vals.add(n); vals.add(Math.round(n)); });
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(source);
  numbersIn(extra).forEach((n) => vals.add(n));
  return [...vals];
}

/** Numbers in the answer that appear neither in the snapshot nor in the trader's own messages. */
export function unknownNumbers(answer: string, snapshot: unknown, userText = ""): number[] {
  const ok = allowed(snapshot, userText);
  const okSet = new Set(ok);
  const bad = numbersIn(answer).filter((n) => !okSet.has(n) && !okSet.has(Math.round(n)) &&
    !ok.some((a) => a !== 0 && Math.abs(n - a) <= Math.max(0.006 * Math.abs(a), 0.051)));
  return [...new Set(bad)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------------------------- the chat
type Msg = { role: "system" | "user" | "assistant"; content: string };
async function ask(llm: { url: string; model: string; key: string }, messages: Msg[], run: Run, fetcher: typeof fetch) {
  const request = JSON.stringify({ model: llm.model, temperature: 0.2, max_tokens: 900, messages });
  const t0 = Date.now();
  let status: number | null = null, text = "", error = "";
  try {
    const r = await fetcher(llm.url, { method: "POST", headers: { Authorization: `Bearer ${llm.key}`, "Content-Type": "application/json" },
      body: request, signal: AbortSignal.timeout(60_000) });
    status = r.status;
    text = await r.text();
    if (!r.ok) error = `HTTP ${r.status}${providerMessage(text)}`;
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  let answer = "";
  if (!error) {
    try {
      answer = String(JSON.parse(text).choices[0].message.content ?? "").trim();
      if (!answer) error = "empty answer";
    } catch {
      error = "the reply is not in the chat-completions format";
    }
  }
  await logApi(run, { source: "llm:advisor", url: llm.url, model: llm.model, ok: !error, status, ms: Date.now() - t0,
    request: messages[messages.length - 1].content, response: text, error });
  if (error) throw new HttpError(502, `the AI model did not answer (${error}); see API Logs`);
  return answer;
}

export const KEEP_DAYS = 15; // chat history is kept this long; the context box is kept for good
const MAX_CONTEXT = 4000;

type ChatRow = { id: number; ts: string; role: "user" | "assistant"; content: string; model: string | null; grounded: boolean | null; issues: string | null };

async function forgetOld(run: Run, now: Date) {
  await run("DELETE FROM advisor_messages WHERE ts < $1", [new Date(now.getTime() - KEEP_DAYS * 86400_000).toISOString().slice(0, 19)]);
}

export async function getChat(run: Run, email: string, name: string, limit = 40, now = new Date()): Promise<ChatRow[]> {
  await forgetOld(run, now);
  const rows = await run<Omit<ChatRow, "grounded"> & { grounded: number | null }>(
    "SELECT id::int AS id, ts, role, content, model, grounded, issues FROM advisor_messages WHERE email = $1 AND instrument = $2 " +
      "ORDER BY id DESC LIMIT $3", [email, name, Math.max(1, Math.min(limit, 200))]);
  return rows.reverse().map((r) => ({ ...r, grounded: r.grounded == null ? null : Boolean(r.grounded) }));
}

/** The person's permanent notes for the advisor (account size, risk limits, open positions, style...). */
export async function getContext(run: Run, email: string) {
  const rows = await run<{ content: string; updated: string }>("SELECT content, updated FROM advisor_context WHERE email = $1", [email]);
  return { content: rows[0]?.content ?? "", updated: rows[0]?.updated ?? null };
}

export async function putContext(run: Run, email: string, content: unknown, now = new Date()) {
  const text = String(content ?? "").slice(0, MAX_CONTEXT);
  await run("INSERT INTO advisor_context(email, content, updated) VALUES($1, $2, $3) " +
    "ON CONFLICT(email) DO UPDATE SET content = excluded.content, updated = excluded.updated",
    [email, text, now.toISOString().slice(0, 19) + "+00:00"]);
  return getContext(run, email);
}

export async function clearChat(run: Run, email: string, name: string) {
  await run("DELETE FROM advisor_messages WHERE email = $1 AND instrument = $2", [email, name]);
  return { ok: true };
}

/** Answer one question about the current market, with the conversation so far. */
export async function chat(run: Run, email: string, name: string, question: string, fetcher: typeof fetch = fetch, now = new Date()) {
  const q = question.trim().slice(0, 2000);
  if (!q) throw new HttpError(400, "write a question");
  const llm = await resolveLlm(run);
  if (!llm) throw new HttpError(400, "no AI model is set up: add a key on the Model API page");
  const snapshot = await buildSnapshot(run, name, now);
  const past = (await getChat(run, email, name, HISTORY, now)).map((m) => ({ role: m.role, content: m.content }));
  const context = (await getContext(run, email)).content.trim();
  const userText = [context, ...past.filter((m) => m.role === "user").map((m) => m.content), q].join("\n");
  const messages: Msg[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: "DATA (the system's current state; the only facts you may use):\n" + JSON.stringify(snapshot) },
    { role: "assistant", content: "Understood. I will use only DATA." },
    ...(context ? [
      { role: "user" as const, content: "MY CONTEXT (always true about me unless I say otherwise; use it to tailor risk and choices):\n" + context },
      { role: "assistant" as const, content: "Noted. I will take your context into account." },
    ] : []),
    ...past,
    { role: "user", content: q },
  ];
  let answer = await ask(llm, messages, run, fetcher);
  let issues = unknownNumbers(answer, snapshot, userText);
  if (issues.length) {
    messages.push({ role: "assistant", content: answer },
      { role: "user", content: `These numbers are not in DATA: ${issues.join(", ")}. Answer again using only numbers from DATA.` });
    answer = await ask(llm, messages, run, fetcher);
    issues = unknownNumbers(answer, snapshot, userText);
  }
  const ts = now.toISOString().slice(0, 19) + "+00:00";
  await run("INSERT INTO advisor_messages(ts, email, instrument, role, content, model, grounded, issues) VALUES($1,$2,$3,'user',$4,NULL,NULL,NULL)",
    [ts, email, name, q]);
  await run("INSERT INTO advisor_messages(ts, email, instrument, role, content, model, grounded, issues) VALUES($1,$2,$3,'assistant',$4,$5,$6,$7)",
    [ts, email, name, answer, llm.model, issues.length ? 0 : 1, issues.join(", ")]);
  return { answer, grounded: !issues.length, issues, model: llm.model };
}
