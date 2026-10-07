"use client";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type PublicSignal, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

/** What the gap between the two chances means, in plain words (whole percents, as shown on screen). */
function leaning(up: number): Key {
  const d = up - 50;
  if (Math.abs(d) <= 3) return "sig.lean.none";
  if (Math.abs(d) <= 8) return d > 0 ? "sig.lean.slight.up" : "sig.lean.slight.down";
  return d > 0 ? "sig.lean.up" : "sig.lean.down";
}

/** The page everyone sees: for each time window, the measured chance that gold ends higher or lower. */
export default function SignalPage() {
  const { t, lang, num } = useT();
  const { current } = useInstrument();
  const res = useApi<PublicSignal>(current ? `public/${current.id}` : null, 120_000);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("sig.title")} sub={res.data?.label ?? current?.label} />
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {res.loading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)
          : res.data?.signals.map((s) => {
              const up = Math.round(s.p_up * 100);
              const down = 100 - up;
              return (
                <Card key={s.horizon} className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold">{t(`h.${s.horizon}` as Key)}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-buy-soft p-3 text-buy">
                      <div className="text-sm font-medium">▲ {t("sig.higher")}</div>
                      <div className="text-3xl font-bold tabular-nums">{num(`${up}%`)}</div>
                    </div>
                    <div className="rounded-lg bg-sell-soft p-3 text-sell">
                      <div className="text-sm font-medium">▼ {t("sig.lower")}</div>
                      <div className="text-3xl font-bold tabular-nums">{num(`${down}%`)}</div>
                    </div>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={`${up}% / ${down}%`}>
                    <div className="bg-buy" style={{ width: `${up}%` }} />
                    <div className="bg-sell" style={{ width: `${down}%` }} />
                  </div>
                  <p className="font-medium">{t(leaning(up))}</p>
                  {s.event ? (
                    <p role="note" className="rounded-lg border border-wait bg-wait-soft p-2 text-sm">
                      ⚠️ {t("sig.event", { title: s.event.title, time: num(fmtDateTime(s.event.ts, lang)) })}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted">
                    {s.cases ? t("sig.basis", { n: s.cases.toLocaleString("en-US") }) : null}
                    {s.cases && s.as_of ? " · " : null}
                    {s.as_of ? `${t("dash.updated")}: ${num(fmtDateTime(s.as_of, lang))}` : null}
                  </p>
                </Card>
              );
            })}
      </div>
      <p className="rounded-xl border border-line bg-brass-soft p-4 text-sm">{t("sig.note")}</p>
    </div>
  );
}
