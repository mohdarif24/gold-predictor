"use client";
import { useState } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton, Stat } from "@/components/ui";
import { type ApiLogs, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

/** Pretty-print JSON when it is JSON; otherwise show the text as it came. */
function pretty(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function ApiLogsInner() {
  const { t, lang, num } = useT();
  const [failed, setFailed] = useState(false);
  const res = useApi<ApiLogs>(`admin/api-logs?limit=100${failed ? "&failed=1" : ""}`, 60_000);
  const d = res.data;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("apilog.title")} sub={t("apilog.sub")} />
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-64" /> : null}
      {d ? (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label={t("apilog.calls")} value={num(String(d.last24h.calls))} />
              <Stat label={t("apilog.failed")} value={num(String(d.last24h.failed))} tone={d.last24h.failed ? "sell" : undefined} />
              <Stat label={t("apilog.avg")} value={d.last24h.avg_ms === null ? "-" : num(`${Math.round(d.last24h.avg_ms)} ms`)} />
            </div>
          </Card>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} className="h-4 w-4" />
            {t("apilog.onlyfailed")}
          </label>
          <Card className="overflow-hidden p-0">
            {d.rows.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t("apilog.none")}</p>
            ) : (
              <ul>
                {d.rows.map((r) => (
                  <li key={r.id} className="border-b border-line last:border-0">
                    <details className="group">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.ok ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell"}`}>
                          {r.ok ? t("apilog.ok") : t("apilog.fail")}{r.status ? ` ${r.status}` : ""}
                        </span>
                        <span className="whitespace-nowrap">{num(fmtDateTime(r.ts, lang))}</span>
                        <span className="font-medium">{r.source}</span>
                        <span className="text-muted">{r.model}</span>
                        {r.ms !== null ? <span className="text-muted tabular-nums">{num(`${r.ms} ms`)}</span> : null}
                        {r.error ? <span className="min-w-0 truncate text-sell">{r.error}</span> : null}
                      </summary>
                      <div className="flex flex-col gap-3 px-5 pb-4 text-xs">
                        <div className="break-all text-muted">{r.url}</div>
                        {r.error ? <div><div className="mb-1 font-semibold">{t("apilog.error")}</div><pre className="whitespace-pre-wrap break-words rounded bg-bg p-2">{r.error}</pre></div> : null}
                        {r.request ? <div><div className="mb-1 font-semibold">{t("apilog.request")}</div><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-2">{pretty(r.request)}</pre></div> : null}
                        {r.response ? <div><div className="mb-1 font-semibold">{t("apilog.response")}</div><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-2">{pretty(r.response)}</pre></div> : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function ApiLogsPage() {
  return (
    <AdminOnly>
      <ApiLogsInner />
    </AdminOnly>
  );
}
