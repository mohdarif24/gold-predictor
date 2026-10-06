"use client";
import { useState } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton, Stat } from "@/components/ui";
import { type LogStatus, type PredictionLog, useApi } from "@/lib/api";
import { fmtDateTime, pct, price } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

const PERIODS = ["day", "week", "month", "year"] as const;
const STATUSES: LogStatus[] = ["right", "wrong", "pending", "nocall"];
const TONE: Record<LogStatus, string> = {
  right: "bg-buy-soft text-buy",
  wrong: "bg-sell-soft text-sell",
  pending: "bg-wait-soft text-wait",
  nocall: "bg-bg text-muted",
};

function Toggle<T extends string>({ value, options, label, onChange }: { value: T; options: { v: T; label: string }[]; label: string; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-lg border border-line p-1 text-sm">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1 font-medium ${value === o.v ? "bg-brass text-bg" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LogsInner() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("day");
  const [horizon, setHorizon] = useState("");
  const [status, setStatus] = useState<"" | LogStatus>("");
  const qs = new URLSearchParams({ period, limit: "150", ...(horizon ? { horizon } : {}), ...(status ? { status } : {}) });
  const res = useApi<PredictionLog>(current ? `logs/${current.id}?${qs}` : null, 60_000);
  const d = res.data;

  const said = (p: number) => {
    const up = Math.round(p * 100);
    if (up >= 47 && up <= 53) return t("log.said.none");
    return up > 50 ? t("log.said.up", { pct: `${up}%` }) : t("log.said.down", { pct: `${100 - up}%` });
  };
  const periodLabel = (k: string) => (period === "week" ? t("log.week.of", { d: k }) : num(k));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("log.title")} sub={t("log.sub")} />

      <div className="flex flex-wrap items-center gap-3">
        <select aria-label={t("log.col.window")} value={horizon} onChange={(e) => setHorizon(e.target.value)}
          className="rounded-lg border border-line bg-bg px-3 py-2 text-sm">
          <option value="">{t("log.all")}</option>
          {current?.horizons.map((h) => <option key={h} value={h}>{t(`h.${h}` as Key)}</option>)}
        </select>
        <Toggle value={period} label={t("log.col.period")} onChange={setPeriod}
          options={PERIODS.map((p) => ({ v: p, label: t(`log.period.${p}` as Key) }))} />
      </div>

      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-64" /> : null}

      {d ? (
        <>
          <Card>
            <h2 className="mb-3 text-sm font-medium text-muted">{t("log.overall")}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Stat label={t("log.right")} value={num(String(d.total.right))} tone="buy" />
              <Stat label={t("log.wrong")} value={num(String(d.total.wrong))} tone="sell" />
              <Stat label={t("log.accuracy")} value={d.total.accuracy === null ? "-" : num(pct(d.total.accuracy, 1))} />
              <Stat label={t("log.pending")} value={num(String(d.total.pending))} />
              <Stat label={t("log.nocall")} value={num(String(d.total.nocall))} />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="p-5 pb-3 text-lg font-semibold">{t(`log.period.${period}` as Key)}</h2>
            {d.buckets.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">{t("log.none")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-y border-line">
                      {(["log.col.period", "log.right", "log.wrong", "log.accuracy", "log.pending", "log.nocall"] as Key[]).map((k) => (
                        <th key={k} className="px-5 py-2 font-medium">{t(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.buckets.map((b) => (
                      <tr key={b.period} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5 whitespace-nowrap">{periodLabel(b.period)}</td>
                        <td className="px-5 py-2.5 font-semibold text-buy tabular-nums">{num(String(b.right))}</td>
                        <td className="px-5 py-2.5 font-semibold text-sell tabular-nums">{num(String(b.wrong))}</td>
                        <td className="px-5 py-2.5">
                          {b.accuracy === null ? "-" : (
                            <div className="flex items-center gap-2">
                              <div className="flex h-2 w-24 overflow-hidden rounded-full bg-sell-soft" aria-hidden="true">
                                <div className="bg-buy" style={{ width: `${b.accuracy * 100}%` }} />
                              </div>
                              <span className="tabular-nums">{num(pct(b.accuracy))}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-muted tabular-nums">{num(String(b.pending))}</td>
                        <td className="px-5 py-2.5 text-muted tabular-nums">{num(String(b.nocall))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
              <h2 className="text-lg font-semibold">{t("log.title")}</h2>
              <Toggle value={status} label={t("log.col.status")} onChange={setStatus}
                options={[{ v: "" as const, label: t("log.status.all") }, ...STATUSES.map((s) => ({ v: s, label: t(`log.${s}` as Key) }))]} />
            </div>
            {d.rows.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">{t("log.none")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-y border-line">
                      {(["log.col.time", "log.col.window", "log.col.said", "log.col.model", "log.col.price", "log.col.status"] as Key[]).map((k) => (
                        <th key={k} className="px-4 py-2 font-medium">{t(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => {
                      const moved = r.outcome_price === null ? null : r.outcome_price - r.price;
                      return (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="px-4 py-2.5 whitespace-nowrap">{num(fmtDateTime(r.created, lang))}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">{t(`h.${r.horizon}` as Key)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-medium">{num(said(r.said))}</td>
                          <td className="px-4 py-2.5 text-muted tabular-nums">{num(pct(r.p_up, 1))}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                            {num(price(r.price))} →{" "}
                            {r.outcome_price === null ? (
                              r.outcome_up === null ? "…" : r.outcome_up ? "▲" : "▼"
                            ) : (
                              <span className={moved! > 0 ? "text-buy" : "text-sell"}>{num(price(r.outcome_price))}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[r.status]}`}>{t(`log.${r.status}` as Key)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="rounded-xl border border-line bg-brass-soft p-4 text-sm">{t("log.note")}</p>
        </>
      ) : null}
    </div>
  );
}

export default function LogsPage() {
  return (
    <AdminOnly>
      <LogsInner />
    </AdminOnly>
  );
}
