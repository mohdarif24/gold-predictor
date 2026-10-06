"use client";
import { useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type ChecklistResponse, type Rate, useApi } from "@/lib/api";
import { fmtDate, pct } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";
import { FACTORS, MODEL_NAMES } from "@/lib/labels";

const CHIP = { 1: "bg-buy-soft text-buy", [-1]: "bg-sell-soft text-sell", 0: "bg-wait-soft text-wait" } as Record<number, string>;

export default function ChecklistPage() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const res = useApi<ChecklistResponse>(current ? `checklist/${current.id}` : null, 300_000);
  const [picked, setPicked] = useState<string | null>(null);
  const [per, setPer] = useState<"full" | "recent">("full");

  const hs = res.data?.horizons ?? [];
  const h = hs.find((x) => x.horizon === picked) ?? hs[0];
  const card = h?.card;
  const p = card?.[per];
  const say = (v: number) => (v > 0 ? t("chk.up") : v < 0 ? t("chk.down") : t("chk.none"));
  const rateText = (r: Rate) => (r.rate == null ? "-" : `${num(pct(r.rate, 1))}`);

  const ups = card ? Object.values(card.now).filter((v) => v > 0).length : 0;
  const downs = card ? Object.values(card.now).filter((v) => v < 0).length : 0;
  const up = card?.direction === "up";
  const words = { say: up ? t("chk.up") : t("chk.down"), where: t(up ? "chk.where.up" : "chk.where.down"), side: t(up ? "chk.side.up" : "chk.side.down") };
  const baseDir = p ? (card?.direction === "up" ? p.base_up.rate : p.base_up.rate == null ? null : 1 - p.base_up.rate) : null;
  const total = p?.total;
  const better = total?.lo != null && baseDir != null && total.lo > baseDir;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("chk.title")} sub={t("chk.sub")} />
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-96" /> : null}

      {card && p ? (
        <>
          <div className="flex flex-wrap gap-2">
            {hs.map((x) => (
              <button key={x.horizon} type="button" aria-pressed={x.horizon === h?.horizon} onClick={() => setPicked(x.horizon)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${x.horizon === h?.horizon ? "border-brass bg-brass-soft text-brass" : "border-line text-muted hover:text-ink"}`}>
                {t(`h.${x.horizon}` as Key)}
              </button>
            ))}
            <span className="mx-1 self-center text-line">|</span>
            {(["full", "recent"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={per === k} onClick={() => setPer(k)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${per === k ? "border-brass bg-brass-soft text-brass" : "border-line text-muted hover:text-ink"}`}>
                {t(k === "full" ? "chk.period.full" : "chk.period.recent", { from: num(fmtDate(card[k].from, lang)) })}
              </button>
            ))}
          </div>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-line">
                    <th className="px-5 py-3 font-medium">{t("chk.col.factor")}</th>
                    <th className="px-5 py-3 font-medium">{t("chk.col.now")}</th>
                    <th className="px-5 py-3 font-medium">{t("chk.col.before")}</th>
                    <th className="px-5 py-3 font-medium">{t("chk.col.anyway")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(FACTORS).filter((k) => k in card.now).map((k) => {
                    const v = card.now[k];
                    const f = p.factors[k];
                    const r = v > 0 ? f.up : v < 0 ? f.down : f.any;
                    const base = v > 0 ? p.base_up.rate : v < 0 && p.base_up.rate != null ? 1 - p.base_up.rate : null;
                    return (
                      <tr key={k} className="border-b border-line">
                        <td className="px-5 py-3">
                          <div className="font-medium">{FACTORS[k].label[lang]}</div>
                          <div className="text-xs text-muted">{FACTORS[k].rule[lang]}</div>
                        </td>
                        <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[Math.sign(v)]}`}>{v > 0 ? "▲ " : v < 0 ? "▼ " : ""}{say(v)}</span></td>
                        <td className="px-5 py-3 tabular-nums">
                          <span className="font-semibold">{rateText(r)}</span>
                          <span className="ml-1 text-xs text-muted">({t("chk.days", { n: r.n.toLocaleString("en-US") })})</span>
                        </td>
                        <td className="px-5 py-3 tabular-nums text-muted">{base == null ? "-" : num(pct(base, 1))}</td>
                      </tr>
                    );
                  })}
                  {h?.model ? (
                    <tr className="border-b border-line">
                      <td className="px-5 py-3 font-medium">{t("chk.model", { name: MODEL_NAMES[h.model.name ?? ""]?.[lang] ?? h.model.name ?? "-" })}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[0]}`}>{t("act.WAIT")}</span></td>
                      <td className="px-5 py-3 tabular-nums"><span className="font-semibold">{num(pct(h.model.accuracy, 1))}</span>
                        <span className="ml-1 text-xs text-muted">({t("chk.days", { n: (h.model.n ?? 0).toLocaleString("en-US") })})</span></td>
                      <td className="px-5 py-3 tabular-nums text-muted">{num(pct(h.model.baseline, 1))}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="border-t-2 border-ink/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{t("chk.total.title")}</h2>
                {card.direction !== "none" && total?.rate != null ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${better ? "bg-buy-soft text-buy" : "bg-wait-soft text-wait"}`}>
                    {better ? t("chk.better") : t("chk.notbetter")}
                  </span>
                ) : null}
              </div>
              {card.direction === "none" || total?.rate == null ? (
                <p className="mt-2 text-muted">{t("chk.total.none")}</p>
              ) : (
                <>
                  <p className="mt-1 text-sm">{t("chk.total.lean", { up: ups, down: downs, side: words.side, k: Math.abs(card.net) })}</p>
                  <div className={`mt-3 text-5xl font-bold tabular-nums ${card.direction === "up" ? "text-buy" : "text-sell"}`}>{num(pct(total.rate, 0))}</div>
                  <p className="mt-2 text-sm">
                    {t("chk.total.body", { k: Math.abs(card.net), say: words.say, where: words.where, pct: pct(total.rate, 0), n: total.n.toLocaleString("en-US"), lo: pct(total.lo, 0), hi: pct(total.hi, 0) })}
                  </p>
                  <p className="text-sm text-muted">{t("chk.total.anyway", { where: words.where, pct: pct(baseDir, 1) })}</p>
                </>
              )}
            </div>
          </Card>
          <p className="rounded-xl border border-line bg-brass-soft p-4 text-sm">{t("chk.note")}</p>
        </>
      ) : null}
    </div>
  );
}
