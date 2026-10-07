"use client";
import Link from "next/link";
import { AdminOnly } from "@/components/AdminOnly";
import { useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { LiveStatus } from "@/components/LiveStatus";
import { PriceChart } from "@/components/Charts";
import { SignalCard } from "@/components/SignalCard";
import { Card, Notice, PageTitle, Skeleton, Stat } from "@/components/ui";
import { type Candle, type Performance, type SignalsResponse, useApi } from "@/lib/api";
import { fmtDateTime, price, pct, signedPct } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

function DashboardInner() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const id = current?.id;
  const sig = useApi<SignalsResponse>(id ? `signals/${id}` : null, 60_000);
  const perf = useApi<Performance>(id ? `performance/${id}` : null, 120_000);
  const [tf, setTf] = useState<"D1" | "H1">("D1");
  const candles = useApi<{ candles: Candle[] }>(id ? `candles/${id}?tf=${tf}&limit=250` : null, 120_000);

  const rows = sig.data?.signals ?? [];
  const proven = rows.filter((r) => r.has_edge).length;
  const latest = rows.map((r) => r.created ?? r.bar_ts).filter(Boolean).sort().at(-1);

  const cs = candles.data?.candles ?? [];
  const last = cs.at(-1);
  const prev = cs.at(-2);
  const change = last && prev ? last.close / prev.close - 1 : null;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t("dash.title")}
        sub={`${sig.data?.label ?? current?.label ?? ""}${latest ? ` · ${t("dash.updated")}: ${num(fmtDateTime(latest, lang))}` : ""}`}
      />

      {sig.data ? <LiveStatus lastCheck={sig.data.last_check} /> : null}
      {sig.error ? <ErrorNotice message={sig.error} onRetry={sig.reload} /> : null}

      {rows.length > 0 ? (
        <Notice
          action={
            <Link href="/about" className="text-sm font-medium text-brass underline underline-offset-2">
              {t("trust.learn")}
            </Link>
          }
        >
          <strong className="block">{proven === 0 ? t("trust.none.title") : t("trust.some.title", { n: proven })}</strong>
          <span className="text-sm text-muted">{proven === 0 ? t("trust.none.body") : t("trust.some.body")}</span>
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sig.loading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)
          : rows.map((r) => <SignalCard key={r.horizon} row={r} />)}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("chart.title")}</h2>
            {last ? (
              <p className="text-sm text-muted">
                {t("chart.last")}: <span className="font-semibold text-ink tabular-nums">{num(price(last.close))}</span>
                {change !== null ? (
                  <span className={`ml-2 tabular-nums ${change >= 0 ? "text-buy" : "text-sell"}`}>{num(signedPct(change))}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div role="group" className="flex overflow-hidden rounded-lg border border-line text-sm">
            {(["D1", "H1"] as const).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTf(x)}
                aria-pressed={tf === x}
                className={`px-3 py-1.5 font-medium ${tf === x ? "bg-brass-soft text-brass" : "text-muted hover:text-ink"}`}
              >
                {x === "D1" ? t("chart.daily") : t("chart.hourly")}
              </button>
            ))}
          </div>
        </div>
        {candles.error ? (
          <p className="py-10 text-center text-muted">{t("chart.error")}</p>
        ) : cs.length === 0 ? (
          <Skeleton className="h-72" />
        ) : (
          <PriceChart candles={cs} label={t("chart.title")} />
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t("practice.title")}</h2>
            <p className="text-sm text-muted">{t("practice.sub")}</p>
          </div>
          <Link href="/performance" className="text-sm font-medium text-brass underline underline-offset-2">
            {t("practice.more")}
          </Link>
        </div>
        {perf.data && perf.data.closed_trades > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("practice.closed")} value={num(String(perf.data.closed_trades))} />
            <Stat label={t("practice.win")} value={num(pct(perf.data.win_rate))} />
            <Stat
              label={t("practice.total")}
              value={num(signedPct(perf.data.total_return))}
              tone={perf.data.total_return >= 0 ? "buy" : "sell"}
            />
            <Stat label={t("practice.open")} value={num(String(perf.data.open_trades))} />
          </div>
        ) : (
          <p className="text-sm text-muted">{t("practice.none")}</p>
        )}
      </Card>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AdminOnly perm="dashboard">
      <DashboardInner />
    </AdminOnly>
  );
}
