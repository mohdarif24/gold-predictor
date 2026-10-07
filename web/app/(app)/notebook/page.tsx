"use client";
import { Fragment } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, PageTitle } from "@/components/ui";
import { FLOWS, MAP, PITCH, SECTIONS, type Flow } from "@/lib/content/notebook";
import { useT } from "@/lib/i18n";

function Down() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <svg width="18" height="26" viewBox="0 0 18 26" className="text-brass">
        <line x1="9" y1="0" x2="9" y2="18" stroke="currentColor" strokeWidth="2" />
        <path d="M2 16 L9 25 L16 16 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

/** One code flow: each step is a function, arrows show the order, indented boxes are what that step calls. */
function FlowChart({ flow, lang }: { flow: Flow; lang: "en" | "bn" }) {
  return (
    <section id={flow.id} className="flex scroll-mt-24 flex-col gap-2">
      <h3 className="text-lg font-bold">{flow.title[lang]}</h3>
      <p className="w-fit rounded-lg border border-brass bg-brass-soft px-3 py-1.5 text-sm">▶ {flow.trigger[lang]}</p>
      <ol className="flex flex-col">
        {flow.steps.map((s, i) => (
          <li key={s.fn + i}>
            <Down />
            <div className="rounded-xl border-2 border-line bg-surface p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="rounded bg-brass px-1.5 text-xs font-bold text-bg">{i + 1}</span>
                <code className="font-mono font-semibold break-all">{s.fn}</code>
                <code className="rounded bg-bg px-1.5 py-0.5 text-xs text-muted break-all">{s.file}</code>
                {s.lib ? <span className="rounded-full border border-line px-2 py-0.5 text-xs text-brass">{s.lib}</span> : null}
              </div>
              <p className="mt-1 text-sm">{s.what[lang]}</p>
              {s.calls ? (
                <div className="mt-2 border-l-2 border-dashed border-brass pl-3">
                  <div className="mb-1 text-xs font-semibold text-muted">{lang === "en" ? "calls ↘" : "যা ডাকে ↘"}</div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 13rem), 1fr))" }}>
                    {s.calls.map((c) => (
                      <div key={c.fn} className="rounded-lg border border-line bg-bg p-2">
                        <code className="block font-mono text-sm font-semibold break-all">{c.fn}</code>
                        <code className="block text-xs text-muted break-all">{c.file}{c.lib ? ` · ${c.lib}` : ""}</code>
                        <p className="mt-1 text-xs leading-snug">{c.what[lang]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NotebookInner() {
  const { t, lang } = useT();
  const L = (x: { en: string; bn: string }) => x[lang];
  const W = lang === "en"
    ? { what: "What", why: "Why", pitch: "The 60-second explanation", map: "Architecture map", contents: "Contents",
        flows: "Code flowcharts", flowsSub: "Every box is a real function, in the order it runs. Arrows show what happens next; the dashed boxes are the functions that step calls. File paths are from the repository root." }
    : { what: "কী", why: "কেন", pitch: "৬০ সেকেন্ডের ব্যাখ্যা", map: "আর্কিটেকচার মানচিত্র", contents: "সূচিপত্র",
        flows: "কোড ফ্লোচার্ট", flowsSub: "প্রতিটি বাক্স একটি আসল ফাংশন, যে ক্রমে চলে সেই ক্রমে। তীর দেখায় এরপর কী হয়; ড্যাশ-দেওয়া বাক্সগুলো সেই ধাপ যে ফাংশনগুলো ডাকে। ফাইলের পথ রিপোজিটরির মূল থেকে।" };

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
        {FLOWS.map((f) => (
          <a key={f.id} href={`#${f.id}`} className="rounded-lg border border-brass px-3 py-1 text-sm text-brass">{L(f.title).split(":")[0]}</a>
        ))}
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-lg border border-line px-3 py-1 text-sm text-muted hover:text-ink">{L(s.title)}</a>
        ))}
      </nav>

      <section className="flex flex-col gap-8">
        <div>
          <h2 className="text-xl font-bold">{W.flows}</h2>
          <p className="text-sm text-muted">{W.flowsSub}</p>
        </div>
        {FLOWS.map((f) => <FlowChart key={f.id} flow={f} lang={lang} />)}
      </section>

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
