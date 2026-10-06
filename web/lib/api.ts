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
    // Cloudflare Access sends a signed-out visitor to its login page on reload. Reload at most once per minute.
    try {
      const last = Number(sessionStorage.getItem("gp_reload") ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem("gp_reload", String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* storage blocked: the error notice below still shows */
    }
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
