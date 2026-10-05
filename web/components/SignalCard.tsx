"use client";
import { useT, type Key } from "@/lib/i18n";
import type { SignalRow } from "@/lib/api";
import { fmtDateTime, pct, price } from "@/lib/format";
import { ArrowDown, ArrowUp, Pause } from "./ui";

const TONE = {
  BUY: { text: "text-buy", soft: "bg-buy-soft", bar: "bg-buy", icon: <ArrowUp /> },
  SELL: { text: "text-sell", soft: "bg-sell-soft", bar: "bg-sell", icon: <ArrowDown /> },
  WAIT: { text: "text-wait", soft: "bg-wait-soft", bar: "bg-wait", icon: <Pause /> },
} as const;

export function SignalCard({ row }: { row: SignalRow }) {
  const { t, lang, num } = useT();
  const tone = TONE[row.signal];
  const chance = row.p_up === null ? null : row.signal === "SELL" ? 1 - row.p_up : row.p_up;

  let reason: string;
  if (row.reason_code === "signal" && chance !== null) reason = t(`r.${row.signal}` as Key, { pct: pct(chance) });
  else if (row.reason_code === "uncertain") reason = t("r.uncertain", { pct: pct(row.p_up) });
  else reason = t(`r.${row.reason_code}` as Key);

  const bt = row.backtest;
  const tested = bt.accuracy !== null && bt.baseline_accuracy !== null;

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5" aria-label={t(`h.${row.horizon}` as Key)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold">{t(`h.${row.horizon}` as Key)}</h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.has_edge ? "bg-buy-soft text-buy" : "bg-wait-soft text-wait"}`}
        >
          {row.has_edge ? t("ev.proven") : t("ev.unproven")}
        </span>
      </div>

      <div className={`flex items-center gap-3 rounded-lg ${tone.soft} ${tone.text} px-4 py-3`}>
        {tone.icon}
        <div className="min-w-0">
          <div className="text-xl font-bold leading-tight">{t(`act.${row.signal}` as Key)}</div>
          <div className="text-sm opacity-90">{t(`act.${row.signal}.sub` as Key)}</div>
        </div>
      </div>

      <p className="text-sm">{reason}</p>

      {row.signal !== "WAIT" && chance !== null ? (
        <div role="img" aria-label={pct(chance)}>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className={`h-full ${tone.bar}`} style={{ width: `${Math.round(chance * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <details className="mt-auto border-t border-line pt-3 text-sm">
        <summary className="font-medium text-brass">{t("details.show")}</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">{t("details.mood")}</dt>
          <dd className="text-right">{row.regime ? t(`regime.${row.regime}` as Key) : "-"}</dd>
          <dt className="text-muted">{t("details.price")}</dt>
          <dd className="text-right tabular-nums">{num(price(row.price))}</dd>
          <dt className="text-muted">{t("details.time")}</dt>
          <dd className="text-right">{num(fmtDateTime(row.created ?? row.bar_ts, lang))}</dd>
          <dt className="text-muted">{t("details.acc")}</dt>
          <dd className="text-right">
            {tested ? t("details.vs", { acc: pct(bt.accuracy, 1), base: pct(bt.baseline_accuracy, 1) }) : t("details.na")}
          </dd>
        </dl>
      </details>
    </article>
  );
}
