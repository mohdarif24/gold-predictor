import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as admin from "../src/lib/admin";
import * as advisor from "../src/lib/advisor";
import type { Run } from "../src/lib/queries";

let db: PGlite;
let run: Run;
const before = process.env.SETTINGS_KEY;
const NOW = new Date("2026-10-07T11:00:00Z");

async function insert(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  await db.query(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => row[c]));
}

/** A fake AI provider that answers from a queue and records what it was sent. */
function provider(answers: string[]) {
  const sent: { messages: { role: string; content: string }[] }[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: answers.shift() ?? "" } }] }), { status: 200 });
  };
  return { fetcher, sent };
}

beforeAll(async () => {
  process.env.SETTINGS_KEY = "test-settings-key-123";
  db = new PGlite();
  await db.exec(readFileSync(new URL("./schema.pg.sql", import.meta.url), "utf8"));
  run = async (text, params = []) => (await db.query(text, params)).rows as never;
  await db.exec(`INSERT INTO instruments(id, label, horizons, enabled, sort) VALUES ('gold', 'Gold spot', '["1h","1d"]', 1, 1)`);
  const p = { instrument: "gold", tf: "M15", steps: 4, p_up: 0.58, signal: "WAIT", has_edge: 0, model_version: "v", reason: "" };
  await insert("predictions", { ...p, created: "2026-10-07T10:45:00+00:00", horizon: "1h", bar_ts: "a", price: 4118.08, atr: 6.4,
    regime: "LOW_VOL", shown_p_up: 0.47 });
  await insert("predictions", { ...p, created: "2026-10-07T00:10:00+00:00", horizon: "1d", tf: "D1", steps: 1, bar_ts: "b", price: 4120.5,
    atr: 38.2, regime: "RANGING", shown_p_up: 0.5, event: "CPI m/m at 2026-10-07T12:30+00:00" });
  await insert("research", { instrument: "gold", horizon: "1h", updated: "now",
    body: JSON.stringify({ holdout: { accuracy: 0.4583, baseline_accuracy: 0.5093, has_edge: false } }) });
  await insert("series", { name: "driver:dxy", ts: "2026-10-05", value: 99.1 });
  await insert("series", { name: "driver:dxy", ts: "2026-10-06", value: 99.6 });
  await insert("news", { id: "n", published: "2026-10-07T09:00:00+00:00", source: "x", title: "Dollar firms before CPI", url: "u",
    topic: "dollar", sentiment: -0.4, impact: "high", scorer: "rules" });
  await admin.putLlmSettings(run, "boss@x.com", { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat", key: "sk-test-key-0001" });
});

afterAll(() => {
  process.env.SETTINGS_KEY = before;
});

describe("snapshot", () => {
  it("reads the current state and computes risk in code", async () => {
    const s = await advisor.buildSnapshot(run, "gold", NOW);
    expect(s.windows.map((w) => w.window)).toEqual(["1h", "1d"]);
    expect(s.windows[0]).toMatchObject({ price: 4118.08, chance_higher_pct: 47, tested_accuracy_pct: 45.8, proven_edge: false });
    expect(s.windows[1].event_pause).toContain("CPI");
    const r = s.risk.per_window[0];
    expect(r.stop_distance_usd).toBeCloseTo(9.6, 2); // 1.5 x ATR 6.4
    expect(r.size_oz).toBeCloseTo(10 / 9.6, 3); // loses $10 (1% of $1,000) at the stop
    expect(s.drivers.dxy).toMatchObject({ last: 99.6 });
    expect(s.news_24h[0].mood).toBe("bad for gold");
    expect(s.verdicts.any_proven_edge).toBe(false);
  });
});

describe("number check", () => {
  it("accepts numbers from the data or the trader, in English or Bengali digits", () => {
    const snap = { price: 4118.08, chance: 0.47 };
    expect(advisor.unknownNumbers("Gold is near 4118 and the chance of higher is 47%.", snap)).toEqual([]);
    expect(advisor.unknownNumbers("সোনা ৪১১৮ ডলারের কাছে", snap)).toEqual([]);
    expect(advisor.unknownNumbers("It will hit 4300.", snap)).toEqual([4300]);
    expect(advisor.unknownNumbers("With your 5000 dollars...", snap, "I have 5000 dollars")).toEqual([]);
  });
});

describe("chat", () => {
  it("answers from the current data, keeps the conversation, and sends the system rules with every question", async () => {
    const { fetcher, sent } = provider(["Gold is at 4118.08. The 1h chance of higher is 47%, close to a coin flip. Your choice: stay out or a small position."]);
    const r = await advisor.chat(run, "boss@x.com", "gold", "Explain the current situation", fetcher, NOW);
    expect(r).toMatchObject({ grounded: true, model: "deepseek-chat" });
    const msgs = sent[0].messages;
    expect(msgs[0].content).toContain("Use ONLY facts and numbers that appear in DATA");
    expect(msgs[1].content).toContain("4118.08");
    expect(msgs.at(-1)!.content).toBe("Explain the current situation");
    const history = await advisor.getChat(run, "boss@x.com", "gold");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);

    const second = provider(["Hold only with a stop 9.6 dollars away."]);
    await advisor.chat(run, "boss@x.com", "gold", "What about risk?", second.fetcher, NOW);
    expect(second.sent[0].messages.map((m) => m.content)).toContain("Explain the current situation"); // the past is sent along
  });

  it("sends an answer with invented numbers back once, then flags it", async () => {
    const { fetcher, sent } = provider(["Target 4300 by Friday.", "Still aiming for 4300."]);
    const r = await advisor.chat(run, "boss@x.com", "gold", "Where is it going?", fetcher, NOW);
    expect(sent).toHaveLength(2);
    expect(sent[1].messages.at(-1)!.content).toContain("4300");
    expect(r).toMatchObject({ grounded: false, issues: [4300] });
    const last = (await advisor.getChat(run, "boss@x.com", "gold")).at(-1)!;
    expect(last).toMatchObject({ role: "assistant", grounded: false, issues: "4300" });
  });

  it("sends the person's permanent context with every question and accepts its numbers", async () => {
    await advisor.putContext(run, "boss@x.com", "My account is 2500 dollars. I risk at most 1% per trade. I hold 0.05 lots long.", NOW);
    expect((await advisor.getContext(run, "boss@x.com")).content).toContain("2500");
    const { fetcher, sent } = provider(["With 2500 dollars and 1% risk you risk 25 dollars... stay small.",
      "With your 2500 dollars, keep risk at 1%; your 0.05 lots can stay with a stop 9.6 dollars away, or stay out."]);
    const r = await advisor.chat(run, "boss@x.com", "gold", "What should I do with my position?", fetcher, NOW);
    expect(sent[0].messages.some((m) => m.content.startsWith("MY CONTEXT") && m.content.includes("0.05 lots"))).toBe(true);
    expect(sent).toHaveLength(2); // 25 was the model's own arithmetic, in neither the data nor the context: sent back
    expect(sent[1].messages.at(-1)!.content).toContain("25");
    expect(r).toMatchObject({ grounded: true, issues: [] }); // the context's own numbers (2500, 0.05) are accepted
    expect((await advisor.getContext(run, "other@x.com")).content).toBe(""); // each person has their own box
  });

  it("forgets chat older than 15 days but keeps the context box", async () => {
    await run("INSERT INTO advisor_messages(ts, email, instrument, role, content) VALUES('2026-09-01T10:00:00+00:00','boss@x.com','gold','user','old')");
    const hist = await advisor.getChat(run, "boss@x.com", "gold", 200, NOW);
    expect(hist.some((m) => m.content === "old")).toBe(false);
    expect((await advisor.getContext(run, "boss@x.com")).content).toContain("2500");
  });

  it("keeps each person's chat separate and can clear it", async () => {
    expect(await advisor.getChat(run, "other@x.com", "gold")).toEqual([]);
    await advisor.clearChat(run, "boss@x.com", "gold");
    expect(await advisor.getChat(run, "boss@x.com", "gold")).toEqual([]);
  });

  it("explains clearly when no AI model is set up or the provider fails", async () => {
    const failing: typeof fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
    await expect(advisor.chat(run, "boss@x.com", "gold", "hi", failing, NOW)).rejects.toMatchObject({ status: 502 });
    await expect(advisor.chat(run, "boss@x.com", "gold", "hi", failing, NOW)).rejects.toThrow(/HTTP 401: bad key/);
    await admin.putLlmSettings(run, "boss@x.com", { clear_key: true });
    await expect(advisor.chat(run, "boss@x.com", "gold", "hi", failing, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(advisor.chat(run, "boss@x.com", "gold", "   ", failing, NOW)).rejects.toMatchObject({ status: 400 });
  });
});
