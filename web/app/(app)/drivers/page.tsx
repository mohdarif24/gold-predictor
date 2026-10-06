"use client";
import { AdminOnly } from "@/components/AdminOnly";
import { useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type DriversResponse, useApi } from "@/lib/api";
import { fmtDate, pct, price, wilson } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";
import { DRIVERS, DRIVER_GROUPS, GROUPS, GROUP_ORDER, INPUT_SETS, MODEL_NAMES, REGIME_ORDER, featureLabel, niceNumber } from "@/lib/labels";

function Tile({ title, value, sub, chip }: { title: string; value: string; sub: string; chip?: { text: string; good: boolean } }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">{title}</h3>
        {chip ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${chip.good ? "bg-buy-soft text-buy" : "bg-wait-soft text-wait"}`}>{chip.text}</span>
        ) : null}
      </div>
      <div className="text-4xl font-bold tabular-nums">{value}</div>
      <p className="text-sm text-muted">{sub}</p>
    </Card>
  );
}

function PushBar({ label, hint, share, push }: { label: string; hint?: string; share: number; push: number }) {
  const { t, num } = useT();
  const up = push >= 0;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-medium">{label}</span>
        <span className={`shrink-0 text-sm tabular-nums ${up ? "text-buy" : "text-sell"}`}>
          {num(`${(share * 100).toFixed(0)}%`)} · {up ? "▲" : "▼"} {t("drv.push.pts", { pp: `${up ? "+" : ""}${push.toFixed(1)}` })}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${label} ${Math.round(share * 100)}%`}>
        <div className={`h-full ${up ? "bg-buy" : "bg-sell"}`} style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </li>
  );
}

const move = (x: number | null | undefined, num: (s: string) => string, points = false) =>
  x == null ? <span className="text-muted">-</span> : (
    <span className={x >= 0 ? "text-buy" : "text-sell"}>{num(points ? `${x >= 0 ? "+" : ""}${x.toFixed(2)} pt` : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`)}</span>
  );

function DriversPageInner() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const res = useApi<DriversResponse>(current ? `drivers/${current.id}` : null, 300_000);
  const [picked, setPicked] = useState<string | null>(null);

  const d = res.data;
  const hz = d?.horizons.find((h) => h.horizon === picked) ?? d?.horizons.find((h) => h.explanation) ?? d?.horizons[0];
  const acc = hz?.accuracy;
  const ex = hz?.explanation;
  const [lo, hi] = acc?.accuracy != null && acc.n ? wilson(acc.accuracy, acc.n) : [0, 1];
  const better = acc?.accuracy != null && acc.baseline != null && lo > acc.baseline;
  const hc80 = hz?.high_confidence?.find((r) => r.says_at_least === 0.8);
  const sel = hz?.selective?.by_meta_model ?? hz?.selective?.by_probability;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("drv.title")} sub={t("drv.sub")} />
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-64" /> : null}

      {d ? (
        <>
          <div role="tablist" className="flex flex-wrap gap-2">
            {d.horizons.map((h) => (
              <button
                key={h.horizon}
                role="tab"
                aria-selected={hz?.horizon === h.horizon}
                onClick={() => setPicked(h.horizon)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${hz?.horizon === h.horizon ? "border-brass bg-brass-soft text-brass" : "border-line text-muted hover:text-ink"}`}
              >
                {t(`h.${h.horizon}` as Key)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              title={t("drv.acc.title")}
              value={acc?.accuracy != null ? num(pct(acc.accuracy, 1)) : "--"}
              chip={acc?.accuracy != null ? { text: better ? t("drv.acc.better") : t("drv.acc.notbetter"), good: better } : undefined}
              sub={
                acc?.accuracy != null && acc.baseline != null
                  ? `${acc.source === "holdout" && acc.period
                      ? t("drv.acc.sub", { n: acc.n ?? 0, from: fmtDate(acc.period[0], lang), to: fmtDate(acc.period[1], lang), base: pct(acc.baseline, 1) })
                      : t("drv.acc.walk", { n: acc.n ?? 0, base: pct(acc.baseline, 1) })} ${t("drv.acc.range", { lo: pct(lo, 1), hi: pct(hi, 1) })}`
                  : t("drv.acc.none")
              }
            />
            <Tile title={t("drv.latest.title")} value={ex ? num(pct(ex.recency.latest?.share, 0)) : "--"} sub={t("drv.latest.sub")} />
            <Tile title={t("drv.bg.title")} value={ex ? num(pct(ex.recency.background?.share, 0)) : "--"} sub={t("drv.bg.sub")} />
            <Tile
              title={t("drv.c80.title")}
              value={hc80 ? (hc80.n === 0 ? t("drv.c80.never") : num(pct(hc80.accuracy, 0))) : "--"}
              sub={hc80 && hc80.n > 0 ? t("drv.c80.times", { n: hc80.n, pct: pct(hc80.accuracy, 0) }) : t("drv.c80.sub")}
            />
          </div>

          <Card>
            <h2 className="text-lg font-semibold">{t("drv.push.title")}</h2>
            <p className="mb-4 text-sm text-muted">{t("drv.push.sub")}</p>
            {ex ? (
              <ul className="flex flex-col gap-4">
                {GROUP_ORDER.filter((g) => g !== "news" || ex.groups[g]).sort((a, b) => (ex.groups[b]?.share ?? -1) - (ex.groups[a]?.share ?? -1)).map((g) =>
                  ex.groups[g] ? (
                    <PushBar key={g} label={GROUPS[g][lang]} hint={`${t("drv.group.hint")}: ${GROUPS[g].hint[lang]}`} share={ex.groups[g].share} push={ex.groups[g].push} />
                  ) : (
                    <li key={g} className="flex flex-col gap-0.5 opacity-70">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{GROUPS[g][lang]}</span>
                        <span className="text-sm text-muted">{t("drv.unused")}</span>
                      </div>
                      <p className="text-xs text-muted">{`${t("drv.group.hint")}: ${GROUPS[g].hint[lang]}`}</p>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("drv.noexp")}</p>
            )}
            {hz?.model ? (
              <p className="mt-4 text-xs text-muted">{t("drv.model", { model: MODEL_NAMES[hz.model]?.[lang] ?? hz.model, set: INPUT_SETS[hz.feature_set ?? ""]?.[lang] ?? hz.feature_set ?? "-", n: hz.candidates_tested ?? "-" })}</p>
            ) : null}
          </Card>

          {ex && ex.top.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <h2 className="p-5 pb-3 text-lg font-semibold">{t("drv.top.title")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-y border-line">
                      <th className="px-5 py-2 font-medium">{t("drv.top.input")}</th>
                      <th className="px-5 py-2 font-medium">{t("drv.top.now")}</th>
                      <th className="px-5 py-2 font-medium">{t("drv.top.push")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ex.top.map((r) => (
                      <tr key={r.feature} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5">{featureLabel(r.feature, lang)}<div className="text-xs text-muted">{GROUPS[r.group]?.[lang]}</div></td>
                        <td className="px-5 py-2.5 tabular-nums">{r.value === null ? "-" : r.feature === "regime_code" ? t(`regime.${REGIME_ORDER[Math.round(r.value)] ?? "RANGING"}` as Key) : num(niceNumber(r.value))}</td>
                        <td className={`px-5 py-2.5 tabular-nums ${r.push >= 0 ? "text-buy" : "text-sell"}`}>{r.push >= 0 ? "▲ +" : "▼ "}{num(r.push.toFixed(2))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {sel ? (
            <Card className="overflow-hidden p-0">
              <div className="p-5 pb-3">
                <h2 className="text-lg font-semibold">{t("drv.rel.title")}</h2>
                <p className="text-sm text-muted">{t("drv.rel.sub")}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-y border-line">
                      <th className="px-5 py-2 font-medium">{t("drv.rel.keep")}</th>
                      <th className="px-5 py-2 font-medium">{t("drv.rel.cases")}</th>
                      <th className="px-5 py-2 font-medium">{t("drv.rel.acc")}</th>
                      <th className="px-5 py-2 font-medium">{t("drv.rel.range")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.map((r) => (
                      <tr key={r.coverage} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5">{num(pct(r.coverage, 0))}</td>
                        <td className="px-5 py-2.5 tabular-nums">{num(String(r.n))}</td>
                        <td className="px-5 py-2.5 font-semibold tabular-nums">{num(pct(r.accuracy, 1))}</td>
                        <td className="px-5 py-2.5 tabular-nums text-muted">{num(`${pct(r.ci_lo, 0)} - ${pct(r.ci_hi, 0)}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hz?.high_confidence ? (
                <div className="border-t border-line p-5">
                  <h3 className="mb-2 font-semibold">{t("drv.hc.title")}</h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {hz.high_confidence.map((r) => (
                      <li key={r.says_at_least} className="flex justify-between gap-3">
                        <span>{t("drv.hc.says")} {num(pct(r.says_at_least, 0))}</span>
                        <span className="tabular-nums text-muted">{r.n === 0 ? t("drv.hc.never") : `${num(String(r.n))}× · ${num(pct(r.accuracy, 0))}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <h2 className="text-lg font-semibold">{t("drv.now.title")}</h2>
            <p className="mb-4 text-sm text-muted">{t("drv.now.sub")}</p>
            {["dollar", "rates", "metals", "risk"].map((grp) => {
              const rows = d.drivers.filter((x) => DRIVERS[x.key]?.group === grp);
              if (!rows.length) return null;
              return (
                <div key={grp} className="mb-5 last:mb-0">
                  <h3 className="mb-2 text-sm font-semibold text-brass">{DRIVER_GROUPS[grp][lang]}</h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {rows.map((x) => (
                      <details key={x.key} className="rounded-lg border border-line p-3">
                        <summary className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{DRIVERS[x.key].label[lang]}</span>
                          <span className="tabular-nums text-sm">{num(price(x.last))} · {move(DRIVERS[x.key].level ? x.d1 : x.chg1, num, DRIVERS[x.key].level)} · {move(DRIVERS[x.key].level ? x.d5 : x.chg5, num, DRIVERS[x.key].level)} · {move(DRIVERS[x.key].level ? x.d20 : x.chg20, num, DRIVERS[x.key].level)}</span>
                        </summary>
                        <p className="mt-2 text-xs text-muted">{t("drv.now.d1")} · {t("drv.now.d5")} · {t("drv.now.d20")}</p>
                        <p className="mt-1 text-sm"><strong>{t("drv.now.why")}:</strong> {DRIVERS[x.key].why[lang]}</p>
                      </details>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>

          {d.positioning ? (
            <Card>
              <h2 className="text-lg font-semibold">{t("drv.pos.title")}</h2>
              <p className="mt-1 text-sm">
                {t("drv.pos.body", {
                  net: pct(d.positioning.speculators_net, 0), rank: d.positioning.rank3y == null ? "-" : pct(d.positioning.rank3y, 0),
                  date: fmtDate(d.positioning.asof, lang),
                })}
              </p>
            </Card>
          ) : null}

          <p className="rounded-xl border border-line bg-brass-soft p-4 text-sm">{t("drv.note")}</p>
        </>
      ) : null}
    </div>
  );
}

export default function DriversPage() {
  return (
    <AdminOnly>
      <DriversPageInner />
    </AdminOnly>
  );
}
