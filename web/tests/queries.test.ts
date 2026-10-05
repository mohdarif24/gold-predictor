import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as q from "../lib/queries";

let db: PGlite;
let run: q.Run;

const pred = (horizon: string, bar_ts: string, over: Record<string, unknown> = {}) => ({
  created: "2026-10-05T10:00:00+00:00", instrument: "gold", horizon, tf: "D1", steps: 1, bar_ts, price: 4100.5,
  atr: 30, p_up: 0.61, signal: "WAIT", regime: "RANGING", has_edge: 0, model_version: "v1", reason: "x", ...over,
});

async function insertPrediction(p: Record<string, unknown>) {
  const cols = Object.keys(p);
  await db.query(
    `INSERT INTO predictions(${cols.join(",")}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(",")})`,
    cols.map((c) => p[c]),
  );
}

beforeAll(async () => {
  db = new PGlite();
  // the schema file is generated from core/store.py, so Python and the website cannot drift apart
  await db.exec(readFileSync(new URL("./schema.pg.sql", import.meta.url), "utf8"));
  run = async (text, params = []) => (await db.query(text, params)).rows as never;

  await db.exec(`
    INSERT INTO instruments(id, label, horizons, enabled, sort) VALUES
      ('gold', 'Gold', '["30m","1d","1w"]', 1, 1),
      ('etf', 'ETF', '["1d"]', 1, 0),
      ('hidden', 'Hidden', '["1d"]', 0, 2);
    INSERT INTO heartbeat VALUES ('gold', '2026-10-05T10:05:00+00:00');
    INSERT INTO reports VALUES ('gold', '{"1d":{"auc":0.51,"accuracy":0.5,"baseline_accuracy":0.52,"signal_accuracy":null,"n_trades":3,"has_edge":false}}', 'now');
  `);
  await insertPrediction(pred("1d", "2026-10-01"));
  await insertPrediction(pred("1d", "2026-10-02", { p_up: 0.7, signal: "BUY", has_edge: 1, outcome_up: 1 }));
  await insertPrediction(pred("30m", "2026-10-02 09:00", { p_up: 0.5, has_edge: 1, signal: "WAIT" }));
  await insertPrediction(pred("1w", "2026-10-01", { p_up: 0.2, outcome_up: 1 }));
  await insertPrediction(pred("1w", "2026-10-02", { has_edge: 1, regime: "ABNORMAL", signal: "WAIT" }));

  for (let i = 0; i < 5; i++) {
    await db.query("INSERT INTO candles VALUES('gold','D1',$1,1,2,0.5,$2)", [1_790_000_000 + i * 86400, 100 + i]);
  }
  await db.query("INSERT INTO candles VALUES('gold','H1',1790000000,1,2,0.5,100)");
  const trade = "INSERT INTO shadow_trades(prediction_id, instrument, horizon, direction, bar_ts, entry, sl, tp, status, exit_ts, exit_price, pnl_pct) VALUES(1,'gold','1d',$1,'2026-10-01',100,98,103,$2,$3,101,$4)";
  await db.query(trade, ["BUY", "TP", "2026-10-02", 0.02]);
  await db.query(trade, ["SELL", "SL", "2026-10-03", -0.01]);
  await db.query(trade, ["BUY", "TP", "2026-10-04", 0.03]);
  await db.query(trade, ["BUY", "OPEN", null, null]);
});

describe("instruments", () => {
  it("lists only enabled ones, in configured order, with parsed horizons", async () => {
    const list = await q.listInstruments(run);
    expect(list.map((i) => i.id)).toEqual(["etf", "gold"]);
    expect(list[1].horizons).toEqual(["30m", "1d", "1w"]);
  });

  it("rejects unknown, disabled and injection-shaped names with 404", async () => {
    for (const bad of ["nope", "hidden", "x' OR '1'='1"]) {
      await expect(q.getSignals(run, bad)).rejects.toMatchObject({ status: 404 });
    }
  });
});

describe("signals", () => {
  it("returns the latest reading per horizon with plain reason codes", async () => {
    const s = await q.getSignals(run, "gold");
    const by = Object.fromEntries(s.signals.map((x) => [x.horizon, x]));
    expect(s.label).toBe("Gold");
    expect(by["1d"].signal).toBe("BUY");
    expect(by["1d"].reason_code).toBe("signal");
    expect(by["30m"].reason_code).toBe("uncertain");
    expect(by["1w"].reason_code).toBe("abnormal");
    expect(by["1d"].backtest.baseline_accuracy).toBe(0.52);
    expect(typeof by["1d"].p_up).toBe("number");
    expect(s.last_check).toBe("2026-10-05T10:05:00+00:00");
  });

  it("reports no_data and no_edge when there is nothing yet", async () => {
    const s = await q.getSignals(run, "etf");
    expect(s.signals[0]).toMatchObject({ horizon: "1d", signal: "WAIT", reason_code: "no_data", p_up: null });
    expect(s.last_check).toBeNull();
    expect(q.reasonCode(false, "RANGING", "BUY")).toBe("no_edge");
  });
});

describe("candles, trades, history", () => {
  it("returns candles oldest first as plain numbers", async () => {
    const c = await q.getCandles(run, "gold", "D1", 3);
    expect(c.candles).toHaveLength(3);
    expect(c.candles.map((x) => x.close)).toEqual([102, 103, 104]);
    expect(typeof c.candles[0].time).toBe("number");
    await expect(q.getCandles(run, "gold", "W1", 10)).rejects.toMatchObject({ status: 400 });
  });

  it("returns trades newest first with numeric ids", async () => {
    const t = (await q.getTrades(run, "gold", 10)) as { id: number }[];
    expect(t).toHaveLength(4);
    expect(typeof t[0].id).toBe("number");
    expect(t[0].id).toBeGreaterThan(t[1].id);
  });

  it("returns history newest first", async () => {
    const h = (await q.getHistory(run, "gold", 100)) as { bar_ts: string }[];
    expect(h).toHaveLength(5);
  });
});

describe("performance", () => {
  it("computes win rate, total, curve and direction hit rate", async () => {
    const p = await q.getPerformance(run, "gold");
    expect(p.closed_trades).toBe(3);
    expect(p.open_trades).toBe(1);
    expect(p.win_rate).toBeCloseTo(2 / 3);
    expect(p.total_return).toBeCloseTo(0.04);
    expect(p.curve.map((c) => c.equity)).toEqual([0.02, 0.01, 0.04]);
    // resolved: (p_up 0.7, up) is a hit; (p_up 0.2, up) is a miss
    expect(p.checked_predictions).toBe(2);
    expect(p.direction_hit_rate).toBeCloseTo(0.5);
  });

  it("is empty-safe", async () => {
    const p = await q.getPerformance(run, "etf");
    expect(p).toMatchObject({ closed_trades: 0, open_trades: 0, win_rate: null, curve: [], direction_hit_rate: null });
  });
});

describe("alert settings", () => {
  it("defaults to off, saves, and updates in place", async () => {
    expect(await q.getAlerts(run, "a@x.com")).toEqual({ telegram_on: false, telegram_chat_id: null, email_on: false });
    await q.putAlerts(run, "a@x.com", { telegram_on: true, telegram_chat_id: "123456", email_on: true });
    await q.putAlerts(run, "a@x.com", { telegram_on: false, telegram_chat_id: "123456", email_on: false });
    expect(await q.getAlerts(run, "a@x.com")).toEqual({ telegram_on: false, telegram_chat_id: "123456", email_on: false });
    const rows = await run<{ n: number }>("SELECT COUNT(*)::int AS n FROM user_settings WHERE email = 'a@x.com'");
    expect(rows[0].n).toBe(1);
  });

  it("validates the Telegram chat id", async () => {
    await expect(q.putAlerts(run, "b@x.com", { telegram_on: true })).rejects.toMatchObject({ status: 400 });
    await expect(q.putAlerts(run, "b@x.com", { telegram_chat_id: "abc; DROP TABLE users" })).rejects.toMatchObject({ status: 400 });
  });
});
