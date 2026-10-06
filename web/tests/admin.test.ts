import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as admin from "../lib/admin";
import * as q from "../lib/queries";
import { decrypt, encrypt } from "../lib/secret";

let db: PGlite;
let run: q.Run;
const KEY = "test-settings-key-123";
const before = process.env.SETTINGS_KEY;

async function insert(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  await db.query(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => row[c]));
}

const reading = (over: Record<string, unknown>) => ({
  created: "2026-10-05T10:00:00+00:00", instrument: "gold", horizon: "1d", tf: "D1", steps: 1, bar_ts: "x", price: 100,
  atr: 1, p_up: 0.5, signal: "WAIT", regime: "RANGING", has_edge: 0, model_version: "v1", reason: "", ...over,
});

beforeAll(async () => {
  process.env.SETTINGS_KEY = KEY;
  db = new PGlite();
  await db.exec(readFileSync(new URL("./schema.pg.sql", import.meta.url), "utf8"));
  run = async (text, params = []) => (await db.query(text, params)).rows as never;
  await db.exec(`INSERT INTO instruments(id, label, horizons, enabled, sort) VALUES ('gold', 'Gold', '["30m","1d"]', 1, 1)`);
  await insert("access_codes", { email: "boss@x.com", code_hash: "h1", role: "admin" });
  await insert("access_codes", { email: "client@x.com", code_hash: "h2", role: "user" });
  await insert("access_codes", { email: "old@x.com", code_hash: "h3", role: null });

  // prediction log fixtures: right, wrong, pending, no-call, and an old row judged by the model's own number
  await insert("predictions", reading({ bar_ts: "a", created: "2026-10-01T09:00:00+00:00", shown_p_up: 0.62, outcome_up: 1, outcome_price: 103 }));
  await insert("predictions", reading({ bar_ts: "b", created: "2026-10-01T10:00:00+00:00", shown_p_up: 0.4, outcome_up: 1, outcome_price: 101 }));
  await insert("predictions", reading({ bar_ts: "c", created: "2026-10-06T09:00:00+00:00", shown_p_up: 0.6 }));
  await insert("predictions", reading({ bar_ts: "d", created: "2026-10-06T09:00:00+00:00", shown_p_up: 0.53, outcome_up: 0 }));
  await insert("predictions", reading({ bar_ts: "e", created: "2025-12-31T09:00:00+00:00", p_up: 0.3, outcome_up: 0 }));
  await insert("predictions", reading({ bar_ts: "f", horizon: "30m", tf: "M5", steps: 6, created: "2026-10-06T09:30:00+00:00", p_up: 0.58 }));

  await insert("scorecards", {
    instrument: "gold", horizon: "1d", updated: "now",
    body: JSON.stringify({ direction: "down", as_of: "2026-10-06", full: { base_up: { rate: 0.53, n: 2000 }, total: { rate: 0.6, n: 120 } } }),
  });
  await insert("research", {
    instrument: "gold", horizon: "30m", updated: "now",
    body: JSON.stringify({ holdout: { calibration: [{ pred: 0.45, actual: 0.48, n: 300 }, { pred: 0.56, actual: 0.54, n: 200 }, { pred: 0.7, actual: 0.9, n: 4 }] } }),
  });
});

afterAll(() => {
  process.env.SETTINGS_KEY = before;
});

describe("roles", () => {
  it("reads admin, user, treats a missing role as user, and unknown people as signed out", async () => {
    expect(await q.roleOf(run, "boss@x.com")).toBe("admin");
    expect(await q.roleOf(run, "client@x.com")).toBe("user");
    expect(await q.roleOf(run, "old@x.com")).toBe("user");
    expect(await q.roleOf(run, "nobody@x.com")).toBeNull();
  });
});

describe("public signal", () => {
  it("daily windows use the checklist's measured rate in its direction; intraday uses calibration", async () => {
    const s = await q.getPublicSignal(run, "gold");
    const by = Object.fromEntries(s.signals.map((x) => [x.horizon, x]));
    expect(by["1d"]).toMatchObject({ p_up: 0.4, p_down: 0.6, source: "checklist", cases: 120 });
    expect(by["30m"]).toMatchObject({ p_up: 0.54, p_down: 0.46, source: "model_calibrated", cases: 200 });
    for (const x of s.signals) expect(x).not.toHaveProperty("model_p_up"); // clients never get the raw number
  });
});

describe("prediction log", () => {
  it("marks each reading and counts right / wrong per period", async () => {
    const log = await q.getPredictionLog(run, "gold", { period: "day" });
    const by = Object.fromEntries(log.rows.map((r) => [r.bar_ts as string, r.status]));
    expect(by).toEqual({ a: "right", b: "wrong", c: "pending", d: "nocall", e: "right", f: "pending" });
    expect(log.total).toEqual({ right: 2, wrong: 1, pending: 2, nocall: 1, accuracy: 2 / 3 });
    expect(log.buckets[0]).toMatchObject({ period: "2026-10-06", right: 0, wrong: 0, pending: 2, nocall: 1 });
    expect(log.buckets.find((b) => b.period === "2026-10-01")).toMatchObject({ right: 1, wrong: 1, accuracy: 0.5 });
  });

  it("groups by week, month and year, and filters by window and status", async () => {
    expect((await q.getPredictionLog(run, "gold", { period: "week" })).buckets.map((b) => b.period)).toEqual(["2026-10-05", "2026-09-28", "2025-12-29"]);
    expect((await q.getPredictionLog(run, "gold", { period: "month" })).buckets.map((b) => b.period)).toEqual(["2026-10", "2025-12"]);
    const year = await q.getPredictionLog(run, "gold", { period: "year" });
    expect(year.buckets.map((b) => [b.period, b.right, b.wrong])).toEqual([["2026", 1, 1], ["2025", 1, 0]]);
    const intraday = await q.getPredictionLog(run, "gold", { horizon: "30m" });
    expect(intraday.rows.map((r) => r.bar_ts)).toEqual(["f"]);
    const wrong = await q.getPredictionLog(run, "gold", { status: "wrong" });
    expect(wrong.rows.map((r) => r.bar_ts)).toEqual(["b"]);
    expect(wrong.total.right).toBe(2); // counts are not narrowed by the status filter
  });

  it("ignores unknown options instead of failing", async () => {
    const log = await q.getPredictionLog(run, "gold", { period: "decade", horizon: "5y", status: "x' OR 1=1" });
    expect(log.period).toBe("day");
    expect(log.horizon).toBeNull();
    expect(log.rows).toHaveLength(6);
  });
});

describe("settings encryption", () => {
  it("round-trips and reads a key encrypted by the Python jobs", async () => {
    const tok = await encrypt("sk-abc");
    expect(tok).not.toContain("sk-abc");
    expect(await decrypt(tok)).toBe("sk-abc");
    expect(await decrypt("3Qd0nV7gNXNWr4hn74cWfjeYtWMG_ssULWkCjETw-qtR-kTPXAdKVzSE")).toBe("sk-from-python");
    await expect(decrypt(tok, "another-secret-key")).rejects.toThrow();
  });
});

describe("model API settings", () => {
  it("stores the key encrypted, shows only its last 4 characters, keeps it when left empty", async () => {
    const empty = await admin.getLlmSettings(run);
    expect(empty).toMatchObject({ url: admin.DEFAULT_LLM.url, enabled: true, key_set: false, encryption_ready: true });

    const saved = await admin.putLlmSettings(run, "boss@x.com", { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama", key: "gsk_secret_9876" });
    expect(saved).toMatchObject({ model: "llama", key_set: true, key_hint: "9876", updated_by: "boss@x.com" });
    const raw = await run<{ value: string }>("SELECT value FROM app_settings WHERE name = 'llm_key_enc'");
    expect(raw[0].value).not.toContain("gsk_secret");

    const again = await admin.putLlmSettings(run, "boss@x.com", { model: "llama-2", key: "", enabled: false });
    expect(again).toMatchObject({ model: "llama-2", key_hint: "9876", enabled: false });
    const cleared = await admin.putLlmSettings(run, "boss@x.com", { clear_key: true, enabled: true });
    expect(cleared).toMatchObject({ key_set: false, enabled: true });
  });

  it("refuses non-https addresses", async () => {
    await expect(admin.putLlmSettings(run, "boss@x.com", { url: "http://example.com" })).rejects.toMatchObject({ status: 400 });
    await expect(admin.putLlmSettings(run, "boss@x.com", { url: "not a url" })).rejects.toMatchObject({ status: 400 });
  });

  it("tests the provider and logs request, response and failures (never the key)", async () => {
    await admin.putLlmSettings(run, "boss@x.com", { key: "sk-live-1111" });
    let sentAuth = "";
    const ok: typeof fetch = async (_url, init) => {
      sentAuth = String((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"sentiment_for_gold": 0.7}' } }] }), { status: 200 });
    };
    const good = await admin.testLlm(run, {}, ok);
    expect(good).toMatchObject({ ok: true, status: 200, answer: '{"sentiment_for_gold": 0.7}', error: null });
    expect(sentAuth).toBe("Bearer sk-live-1111");

    const quota: typeof fetch = async () => new Response('{"error":"rate limit"}', { status: 429 });
    expect(await admin.testLlm(run, { model: "other" }, quota)).toMatchObject({ ok: false, status: 429, error: "HTTP 429" });
    const down: typeof fetch = async () => { throw new TypeError("fetch failed"); };
    expect(await admin.testLlm(run, {}, down)).toMatchObject({ ok: false, status: null });

    const logs = await admin.getApiLogs(run);
    expect(logs.rows.map((r) => [r.source, r.ok, r.status])).toEqual([["llm:test", 0, null], ["llm:test", 0, 429], ["llm:test", 1, 200]]);
    expect(logs.rows[1].response).toContain("rate limit");
    expect(JSON.stringify(logs.rows)).not.toContain("sk-live-1111");
    expect(logs.last24h).toMatchObject({ calls: 3, failed: 2 });
    expect((await admin.getApiLogs(run, { failed: true })).rows).toHaveLength(2);
  });

  it("asks for a key when there is none to test with", async () => {
    await admin.putLlmSettings(run, "boss@x.com", { clear_key: true });
    await expect(admin.testLlm(run, {}, fetch)).rejects.toMatchObject({ status: 400 });
  });
});
