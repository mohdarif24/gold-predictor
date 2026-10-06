"use client";
import { Fragment } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { FLOW, PAPER, SECTIONS, type Box } from "@/lib/content/model";
import { type DriversResponse, useApi } from "@/lib/api";
import { pct } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";
import { MODEL_NAMES } from "@/lib/labels";

const KIND: Record<Box["kind"], string> = {
  data: "border-brass bg-brass-soft",
  step: "border-line bg-surface",
  check: "border-wait bg-wait-soft",
  out: "border-buy bg-buy-soft",
};

function Arrow() {
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <svg width="20" height="28" viewBox="0 0 20 28" className="text-muted">
        <line x1="10" y1="0" x2="10" y2="20" stroke="currentColor" strokeWidth="2" />
        <path d="M3 18 L10 27 L17 18 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

function ModelInner() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const res = useApi<DriversResponse>(current ? `drivers/${current.id}` : null, 300_000);
  const L = (x: { en: string; bn: string }) => x[lang];

  return (
    <article className="flex max-w-4xl flex-col gap-6">
      <PageTitle title={L(PAPER.title)} sub={current?.label} />

      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{lang === "en" ? "Abstract" : "সারসংক্ষেপ"}</h2>
        <p className="leading-relaxed">{L(PAPER.abstract)}</p>
      </Card>

      <figure className="flex flex-col gap-2">
        <div className="rounded-xl border border-line bg-bg p-4">
          {FLOW.map((row, i) => (
            <Fragment key={i}>
              {i > 0 ? <Arrow /> : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="shrink-0 text-sm font-bold text-brass sm:w-36 sm:pt-3">{L(row.label)}</div>
                <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${row.boxes.length > 2 ? 11 : 15}rem), 1fr))` }}>
                  {row.boxes.map((b, j) => (
                    <div key={j} className={`rounded-lg border-2 p-3 ${KIND[b.kind]}`}>
                      <div className="font-semibold">{L(b.title)}</div>
                      <p className="mt-1 text-sm leading-snug">{L(b.body)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Fragment>
          ))}
          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3 text-xs">
            {(Object.keys(KIND) as Box["kind"][]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded border-2 ${KIND[k]}`} />
                {L(PAPER.legend[k])}
              </span>
            ))}
          </div>
        </div>
        <figcaption className="text-center text-sm text-muted">{L(PAPER.figure)}</figcaption>
      </figure>

      <Card className="overflow-hidden p-0">
        <h2 className="p-5 pb-3 font-semibold">{L(PAPER.results)}</h2>
        {res.loading ? <Skeleton className="m-5 h-32" /> : null}
        {res.data ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-y border-line">
                  {[PAPER.cols.window, PAPER.cols.model, PAPER.cols.tested, PAPER.cols.acc, PAPER.cols.auc, PAPER.cols.verdict].map((c) => (
                    <th key={c.en} className="px-4 py-2 font-medium">{L(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.data.horizons.map((h) => {
                  const a = h.accuracy;
                  return (
                    <tr key={h.horizon} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap">{t(`h.${h.horizon}` as Key)}</td>
                      <td className="px-4 py-2.5">{h.model ? (MODEL_NAMES[h.model]?.[lang] ?? h.model) : "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{h.candidates_tested ? num(String(h.candidates_tested)) : "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {a?.accuracy != null ? num(`${pct(a.accuracy, 1)} vs ${pct(a.baseline, 1)}`) : "-"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {a?.auc != null ? num(`${a.auc.toFixed(3)}${a.auc_ci ? ` (${a.auc_ci[0]?.toFixed(3)}–${a.auc_ci[1]?.toFixed(3)})` : ""}`) : "-"}
                      </td>
                      <td className={`px-4 py-2.5 font-semibold ${!a ? "text-muted" : a.has_edge ? "text-buy" : "text-wait"}`}>
                        {L(!a ? PAPER.cols.none : a.has_edge ? PAPER.cols.pass : PAPER.cols.fail)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {SECTIONS.map((s) => (
        <section key={s.h.en}>
          <h2 className="mb-1 text-lg font-semibold">{L(s.h)}</h2>
          <p className="leading-relaxed text-ink/90">{L(s.p)}</p>
        </section>
      ))}
    </article>
  );
}

export default function ModelPage() {
  return (
    <AdminOnly>
      <ModelInner />
    </AdminOnly>
  );
}
