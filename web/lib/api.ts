"use client";
import { useCallback, useEffect, useState } from "react";

export type ApiState<T> = { data?: T; error?: string; loading: boolean; reload: () => void };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  if (res.status === 401) {
    // not signed in (or the code was revoked): go to the sign-in page
    // full reload on purpose: drops any state from the old session
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (window.location.pathname !== "/login") window.location.assign("/login");
    throw new ApiError(401, "not signed in");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.detail ?? "request failed");
  return body as T;
}

/** Fetches `path` (null = skip), refreshing every `refreshMs` when given. */
export function useApi<T>(path: string | null, refreshMs?: number): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    apiFetch<T>(path)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    const timer = refreshMs ? setInterval(reload, refreshMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [path, refreshMs, tick, reload]);

  return { data, error, loading: path !== null && data === undefined && error === undefined, reload };
}

export type Instrument = { id: string; label: string; horizons: string[] };

export type SignalRow = {
  horizon: string;
  signal: "BUY" | "SELL" | "WAIT";
  reason_code: "no_edge" | "uncertain" | "abnormal" | "no_data" | "signal";
  p_up: number | null;
  price: number | null;
  regime: string | null;
  has_edge: boolean;
  bar_ts: string | null;
  created: string | null;
  backtest: {
    auc: number | null;
    accuracy: number | null;
    baseline_accuracy: number | null;
    signal_accuracy: number | null;
    n_trades: number | null;
    has_edge: boolean | null;
  };
};

export type SignalsResponse = { instrument: string; label: string; signals: SignalRow[]; last_check: string | null };
export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type Performance = {
  open_trades: number;
  closed_trades: number;
  win_rate: number | null;
  total_return: number;
  avg_return: number | null;
  curve: { time: string; equity: number }[];
  checked_predictions: number;
  direction_hit_rate: number | null;
};
export type Trade = {
  id: number;
  horizon: string;
  direction: "BUY" | "SELL";
  bar_ts: string;
  entry: number;
  status: "OPEN" | "TP" | "SL" | "EXPIRED";
  pnl_pct: number | null;
};
export type HistoryRow = {
  created: string;
  horizon: string;
  bar_ts: string;
  price: number;
  p_up: number;
  signal: "BUY" | "SELL" | "WAIT";
  regime: string;
  has_edge: number;
  outcome_up: number | null;
};

export type SelectiveRow = { coverage: number; n: number; accuracy: number; ci_lo: number; ci_hi: number };
export type HighConfRow = { says_at_least: number; n: number; accuracy: number | null; ci_lo: number | null; ci_hi: number | null };
export type Share = { push: number; share: number };
export type DriversHorizon = {
  horizon: string;
  accuracy: {
    source: "holdout" | "walk_forward"; accuracy: number | null; baseline: number | null; auc: number | null;
    auc_ci: [number, number] | null; n: number | null; period: [string, string] | null; has_edge: boolean;
  } | null;
  model: string | null;
  feature_set: string | null;
  candidates_tested: number | null;
  selective: { by_probability?: SelectiveRow[]; by_meta_model?: SelectiveRow[] } | null;
  high_confidence: HighConfRow[] | null;
  explanation: {
    p_up: number; model?: string; feature_set?: string; bar_ts?: string;
    groups: Record<string, Share>; recency: Record<string, Share>;
    top: { feature: string; group: string; value: number | null; push: number }[];
  } | null;
};
export type DriversResponse = {
  instrument: string;
  horizons: DriversHorizon[];
  drivers: { key: string; last: number; asof: string; chg1: number | null; chg5: number | null; chg20: number | null; d1: number | null; d5: number | null; d20: number | null }[];
  positioning: { speculators_net: number; hedgers_net: number | null; rank3y: number | null; asof: string } | null;
};

export type NewsResponse = {
  mood: { score: number | null; label: "bullish" | "bearish" | "neutral" | null; count: number; bullish: number; bearish: number };
  articles: { published: string; source: string; title: string; url: string; topic: string; sentiment: number; impact: string; summary: string | null; scorer: string; label: "bullish" | "bearish" | "neutral" }[];
  events: { ts: string; country: string; title: string; impact: string; forecast: string | null; previous: string | null }[];
};

export type Rate = { n: number; rate: number | null; lo: number | null; hi: number | null };
export type CardPeriod = {
  base_up: Rate; from: string | null; to: string | null; total: Rate;
  factors: Record<string, { any: Rate; up: Rate; down: Rate }>;
  ladder: ({ direction: "up" | "down"; at_least: number } & Rate)[];
};
export type ChecklistResponse = {
  instrument: string;
  horizons: {
    horizon: string;
    card: { now: Record<string, number>; net: number; direction: "up" | "down" | "none"; as_of: string; full: CardPeriod; recent: CardPeriod };
    model: { name: string | null; accuracy: number | null; baseline: number | null; n: number | null; has_edge: boolean } | null;
  }[];
};

export type PublicSignal = {
  instrument: string;
  label: string;
  signals: { horizon: string; p_up: number; p_down: number; source: string; cases: number; as_of: string | null }[];
};

export type AdminUser = { email: string; role: "admin" | "user"; created: string | null; last_used: string | null };

export type LogStatus = "right" | "wrong" | "pending" | "nocall";
export type Tally = { right: number; wrong: number; pending: number; nocall: number; accuracy: number | null };
export type PredictionLog = {
  instrument: string;
  horizon: string | null;
  period: "day" | "week" | "month" | "year";
  total: Tally;
  buckets: ({ period: string } & Tally)[];
  rows: {
    id: number; created: string; horizon: string; bar_ts: string; price: number; p_up: number; shown_p_up: number | null;
    said: number; signal: string; regime: string; has_edge: number; outcome_up: number | null; outcome_price: number | null;
    resolved_ts: string | null; status: LogStatus;
  }[];
};

export type LlmSettings = {
  url: string; model: string; enabled: boolean; key_set: boolean; key_hint: string | null;
  updated: string | null; updated_by: string | null; encryption_ready: boolean;
};
export type LlmTest = { ok: boolean; status: number | null; ms: number; answer: string | null; error: string | null };
export type ApiLogs = {
  rows: { id: number; ts: string; source: string; url: string; model: string; ok: number; status: number | null; ms: number | null; request: string; response: string; error: string }[];
  last24h: { calls: number; failed: number; avg_ms: number | null; last_ok: string | null; last_fail: string | null };
};
