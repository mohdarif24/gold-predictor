"use client";
import Link from "next/link";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type MentorBody, type MentorComment, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

const CHOICE_TONE: Record<string, string> = {
  "stay out": "border-wait bg-wait-soft",
  hold: "border-line bg-surface",
  "small position": "border-brass bg-brass-soft",
};

function Comment({ c, big }: { c: MentorComment; big?: boolean }) {
  const { t, lang, num } = useT();
  const b: MentorBody | undefined = c.body?.[lang] ?? c.body?.en;
  if (!b) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{num(fmtDateTime(c.ts, lang))}</span>
        <span>· {c.model}</span>
        {c.grounded ? (
          <span className="rounded-full bg-buy-soft px-2 py-0.5 font-semibold text-buy">✓ {t("mentor.grounded")}</span>
        ) : (
          <span className="rounded-full bg-sell-soft px-2 py-0.5 font-semibold text-sell">⚠️ {t("mentor.ungrounded", { n: c.issues ?? "" })}</span>
        )}
      </div>
      <h2 className={big ? "text-2xl font-bold" : "text-lg font-semibold"}>{b.headline}</h2>
      {big ? (
        <>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-muted">{t("mentor.market")}</h3>
            <ul className="list-disc pl-5">{b.market?.map((m) => <li key={m}>{m}</li>)}</ul>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-muted">{t("mentor.scenarios")}</h3>
            <ul className="flex flex-col gap-1">
              {b.scenarios?.map((s) => (
                <li key={s.if + s.then}><span className="font-semibold">{t("mentor.if")}</span> {s.if} → <span className="font-semibold">{t("mentor.then")}</span> {s.then}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-muted">{t("mentor.risk")}</h3>
            <ul className="list-disc pl-5">{b.risk?.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold text-muted">{t("mentor.options")}</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {b.options?.map((o) => (
                <div key={o.choice + o.when} className={`rounded-lg border-2 p-3 ${CHOICE_TONE[o.choice] ?? "border-line"}`}>
                  <div className="font-semibold capitalize">{o.choice in CHOICE_TONE ? t(`mentor.choice.${o.choice}` as Key) : o.choice}</div>
                  <p className="mt-1 text-sm">{o.when}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
      <p className={`rounded-lg border border-line p-3 ${big ? "bg-brass-soft font-medium" : "text-sm"}`}>{b.bottom_line}</p>
    </Card>
  );
}

function MentorInner() {
  const { t } = useT();
  const { current } = useInstrument();
  const res = useApi<MentorComment[]>(current ? `admin/mentor/${current.id}?limit=20` : null, 60_000);
  const list = res.data ?? [];
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageTitle title={t("nav.mentor")} sub={t("mentor.sub")} />
      <p className="rounded-xl border border-wait bg-wait-soft p-4 text-sm">{t("mentor.note")}</p>
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-64" /> : null}
      {res.data && list.length === 0 ? (
        <Card>
          <p>{t("mentor.none")}</p>
          <Link href="/api-settings" className="mt-2 inline-block font-medium text-brass underline underline-offset-2">{t("nav.apisettings")} →</Link>
        </Card>
      ) : null}
      {list[0] ? <Comment c={list[0]} big /> : null}
      {list.length > 1 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("mentor.earlier")}</h2>
          {list.slice(1).map((c) => <Comment key={c.id} c={c} />)}
        </section>
      ) : null}
    </div>
  );
}

export default function MentorPage() {
  return (
    <AdminOnly>
      <MentorInner />
    </AdminOnly>
  );
}
