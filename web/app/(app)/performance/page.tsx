"use client";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { EquityChart } from "@/components/Charts";
import { Card, PageTitle, Skeleton, Stat } from "@/components/ui";
import { type Performance, type Trade, useApi } from "@/lib/api";
import { chartTimes, fmtDateTime, pct, price, signedPct } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

function PerformancePageInner() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const id = current?.id;
  const perf = useApi<Performance>(id ? `performance/${id}` : null, 120_000);
  const trades = useApi<Trade[]>(id ? `trades/${id}?limit=30` : null, 120_000);
  const p = perf.data;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("perf.title")} sub={t("perf.intro")} />
      {perf.error ? <ErrorNotice message={perf.error} onRetry={perf.reload} /> : null}
      {perf.loading ? <Skeleton className="h-28" /> : null}

      {p ? (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={t("practice.closed")} value={num(String(p.closed_trades))} />
              <Stat label={t("practice.win")} value={num(pct(p.win_rate))} />
              <Stat label={t("practice.total")} value={num(signedPct(p.total_return))} tone={p.total_return >= 0 ? "buy" : "sell"} />
              <Stat label={t("practice.open")} value={num(String(p.open_trades))} />
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">{t("perf.curve")}</h2>
            {p.curve.length >= 2 ? (
              <EquityChart points={chartTimes(p.curve)} label={t("perf.curve")} />
            ) : (
              <p className="text-sm text-muted">{t("perf.curve.none")}</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-lg font-semibold">{t("perf.check")}</h2>
            <p className="text-muted">
              {p.direction_hit_rate !== null && p.checked_predictions >= 20
                ? t("perf.check.body", { n: p.checked_predictions, pct: pct(p.direction_hit_rate) })
                : t("perf.check.none")}
            </p>
          </Card>
        </>
      ) : null}

      <Card className="overflow-hidden p-0">
        <h2 className="p-5 pb-3 text-lg font-semibold">{t("perf.trades")}</h2>
        {trades.data && trades.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-y border-line">
                  {(["perf.col.time", "perf.col.window", "perf.col.dir", "perf.col.entry", "perf.col.result", "perf.col.status"] as Key[]).map((k) => (
                    <th key={k} className="px-5 py-2 font-medium">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.data.map((tr) => (
                  <tr key={tr.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 whitespace-nowrap">{num(fmtDateTime(tr.bar_ts, lang))}</td>
                    <td className="px-5 py-2.5">{t(`h.${tr.horizon}` as Key)}</td>
                    <td className={`px-5 py-2.5 font-semibold ${tr.direction === "BUY" ? "text-buy" : "text-sell"}`}>
                      {t(`act.${tr.direction}` as Key)}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums">{num(price(tr.entry))}</td>
                    <td className={`px-5 py-2.5 tabular-nums ${tr.pnl_pct === null ? "" : tr.pnl_pct >= 0 ? "text-buy" : "text-sell"}`}>
                      {tr.pnl_pct === null ? "-" : num(signedPct(tr.pnl_pct))}
                    </td>
                    <td className="px-5 py-2.5">{t(`status.${tr.status}` as Key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-sm text-muted">{t("practice.none")}</p>
        )}
      </Card>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <AdminOnly>
      <PerformancePageInner />
    </AdminOnly>
  );
}
