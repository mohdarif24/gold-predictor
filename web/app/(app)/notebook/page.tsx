"use client";
import { Fragment } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, PageTitle } from "@/components/ui";
import { MAP, PITCH, SECTIONS } from "@/lib/content/notebook";
import { useT } from "@/lib/i18n";

function NotebookInner() {
  const { t, lang } = useT();
  const L = (x: { en: string; bn: string }) => x[lang];
  const W = lang === "en" ? { what: "What", why: "Why", pitch: "The 60-second explanation", map: "Architecture map", contents: "Contents" } : { what: "কী", why: "কেন", pitch: "৬০ সেকেন্ডের ব্যাখ্যা", map: "আর্কিটেকচার মানচিত্র", contents: "সূচিপত্র" };

  return (
    <article className="flex max-w-5xl flex-col gap-6">
      <PageTitle title={t("nav.notebook")} />

      <Card>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{W.pitch}</h2>
        <p className="leading-relaxed">{L(PITCH)}</p>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{W.map}</h2>
        <div className="flex flex-col items-stretch gap-1 lg:flex-row">
          {MAP.map((lane, i) => (
            <Fragment key={lane.tech}>
              {i > 0 ? (
                <div className="flex items-center justify-center text-2xl text-muted" aria-hidden="true">
                  <span className="lg:hidden">↓</span>
                  <span className="hidden lg:inline">→</span>
                </div>
              ) : null}
              <div className="flex-1 rounded-xl border-2 border-line bg-surface p-3">
                <div className="font-semibold">{L(lane.lane)}</div>
                <div className="mb-2 text-xs font-semibold text-brass">{lane.tech}</div>
                <ul className="list-disc pl-4 text-sm leading-snug">
                  {lane.items.map((it) => <li key={it.en}>{L(it)}</li>)}
                </ul>
              </div>
            </Fragment>
          ))}
        </div>
      </section>

      <nav aria-label={W.contents} className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-lg border border-line px-3 py-1 text-sm text-muted hover:text-ink">{L(s.title)}</a>
        ))}
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="text-xl font-bold">{L(s.title)}</h2>
          {s.intro ? <p className="leading-relaxed text-ink/90">{L(s.intro)}</p> : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {s.entries.map((e) => (
              <Card key={e.name} className="flex flex-col gap-1.5">
                <div className="font-mono font-semibold">{e.name}</div>
                {e.where ? <code className="w-fit max-w-full break-all rounded bg-bg px-1.5 py-0.5 text-xs text-muted">{e.where}</code> : null}
                <p className="text-sm"><span className="font-semibold">{W.what}: </span>{L(e.what)}</p>
                <p className="text-sm"><span className="font-semibold text-brass">{W.why}: </span>{L(e.why)}</p>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}

export default function NotebookPage() {
  return (
    <AdminOnly>
      <NotebookInner />
    </AdminOnly>
  );
}
