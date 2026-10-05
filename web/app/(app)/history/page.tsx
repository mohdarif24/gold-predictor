"use client";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type HistoryRow, useApi } from "@/lib/api";
import { fmtDateTime, pct } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

export default function HistoryPage() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const h = useApi<HistoryRow[]>(current ? `history/${current.id}?limit=100` : null, 120_000);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("hist.title")} sub={t("hist.intro")} />
      {h.error ? <ErrorNotice message={h.error} onRetry={h.reload} /> : null}
      {h.loading ? <Skeleton className="h-64" /> : null}
      {h.data ? (
        <Card className="overflow-hidden p-0">
          {h.data.length === 0 ? (
            <p className="p-5 text-sm text-muted">{t("hist.none")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-line">
                    {(["hist.col.time", "perf.col.window", "perf.col.dir", "hist.col.chance", "hist.col.after"] as Key[]).map((k) => (
                      <th key={k} className="px-5 py-3 font-medium">
                        {t(k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {h.data.map((r, i) => {
                    const tone = r.signal === "BUY" ? "text-buy" : r.signal === "SELL" ? "text-sell" : "text-wait";
                    return (
                      <tr key={`${r.created}-${r.horizon}-${i}`} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5 whitespace-nowrap">{num(fmtDateTime(r.created, lang))}</td>
                        <td className="px-5 py-2.5">{t(`h.${r.horizon}` as Key)}</td>
                        <td className={`px-5 py-2.5 font-semibold ${tone}`}>{t(`act.${r.signal}` as Key)}</td>
                        <td className="px-5 py-2.5 tabular-nums">{r.has_edge ? num(pct(r.p_up)) : "-"}</td>
                        <td className="px-5 py-2.5">
                          {r.outcome_up === null ? t("hist.pending") : r.outcome_up === 1 ? t("hist.up") : t("hist.down")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
