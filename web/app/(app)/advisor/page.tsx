"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { ApiError, apiFetch, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

type Msg = { id?: number; ts: string; role: "user" | "assistant"; content: string; model?: string | null; grounded?: boolean | null; issues?: string | null };
type Ctx = { content: string; updated: string | null };

const QUICK: Key[] = ["advisor.q.now", "advisor.q.risk", "advisor.q.choice", "advisor.q.news"];

/** The permanent notes the advisor always reads: account size, risk limits, open positions, style. */
function ContextBox() {
  const { t, lang, num } = useT();
  const res = useApi<Ctx>("advisor-context");
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const value = text ?? res.data?.content ?? "";

  async function save() {
    try {
      const r = await apiFetch<Ctx>("advisor-context", { method: "PUT", body: JSON.stringify({ content: value }) });
      setSaved(r.updated);
      setText(null);
      res.reload();
    } catch {
      setSaved(null);
    }
  }

  return (
    <Card className="flex flex-col gap-2">
      <label htmlFor="ctx" className="font-semibold">{t("advisor.context")}</label>
      <p className="text-xs text-muted">{t("advisor.context.help")}</p>
      <textarea id="ctx" rows={3} maxLength={4000} value={value} onChange={(e) => setText(e.target.value)}
        placeholder={t("advisor.context.placeholder")} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={text === null}
          className="rounded-lg border border-brass px-3 py-1.5 text-sm font-semibold text-brass disabled:opacity-50">{t("advisor.context.save")}</button>
        {(saved ?? res.data?.updated) ? <span className="text-xs text-muted">{t("advisor.context.saved", { when: num(fmtDateTime(saved ?? res.data!.updated, lang)) })}</span> : null}
      </div>
    </Card>
  );
}

function Bubble({ m }: { m: Msg }) {
  const { t, lang, num } = useT();
  const mine = m.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? "bg-brass-soft" : "border border-line bg-surface"}`}>
        <div className="text-sm whitespace-pre-wrap">{m.content}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>{num(fmtDateTime(m.ts, lang))}</span>
          {!mine && m.model ? <span>· {m.model}</span> : null}
          {!mine && m.grounded === true ? <span className="font-semibold text-buy">✓ {t("advisor.grounded")}</span> : null}
          {!mine && m.grounded === false ? <span className="font-semibold text-sell">⚠️ {t("advisor.ungrounded", { n: m.issues ?? "" })}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Chat() {
  const { t } = useT();
  const { current } = useInstrument();
  const id = current?.id;
  const res = useApi<Msg[]>(id ? `advisor/${id}` : null);
  const [extra, setExtra] = useState<Msg[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const messages = [...(res.data ?? []), ...extra];

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  async function ask(q: string) {
    if (!id || !q.trim() || busy) return;
    setBusy(true);
    setErr("");
    const now = new Date().toISOString();
    setExtra((x) => [...x, { ts: now, role: "user", content: q.trim() }]);
    setQuestion("");
    try {
      const r = await apiFetch<{ answer: string; grounded: boolean; issues: number[]; model: string }>(`advisor/${id}`,
        { method: "POST", body: JSON.stringify({ question: q.trim() }) });
      setExtra((x) => [...x, { ts: new Date().toISOString(), role: "assistant", content: r.answer, model: r.model, grounded: r.grounded,
        issues: r.issues.join(", ") }]);
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : t("error.generic"));
      setExtra((x) => x.slice(0, -1));
      setQuestion(q);
    }
    setBusy(false);
  }

  async function clear() {
    if (!id) return;
    await apiFetch(`advisor/${id}`, { method: "DELETE" }).catch(() => null);
    setExtra([]);
    res.reload();
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t("advisor.chat")}</h2>
        {messages.length ? <button type="button" onClick={clear} className="text-xs text-muted underline">{t("advisor.clear")}</button> : null}
      </div>
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-40" /> : null}
      <div className="flex max-h-[60vh] min-h-40 flex-col gap-3 overflow-y-auto rounded-lg bg-bg p-3" aria-live="polite">
        {!messages.length && !res.loading ? <p className="text-sm text-muted">{t("advisor.empty")}</p> : null}
        {messages.map((m, i) => <Bubble key={m.id ?? `x${i}`} m={m} />)}
        {busy ? <p className="text-sm text-muted">{t("advisor.thinking")}</p> : null}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((k) => (
          <button key={k} type="button" disabled={busy} onClick={() => ask(t(k))}
            className="rounded-full border border-line px-3 py-1 text-xs hover:border-brass disabled:opacity-50">{t(k)}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex gap-2">
        <label htmlFor="q" className="sr-only">{t("advisor.ask")}</label>
        <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("advisor.ask")} maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2" />
        <button type="submit" disabled={busy || !question.trim()} className="rounded-lg bg-brass px-4 py-2 font-semibold text-bg disabled:opacity-60">
          {t("advisor.send")}
        </button>
      </form>
      {err ? (
        <p role="alert" className="text-sm text-sell">
          {err} {err.includes("Model API") ? <Link href="/api-settings" className="underline">{t("nav.apisettings")}</Link> : null}
        </p>
      ) : null}
    </Card>
  );
}

function AdvisorInner() {
  const { t } = useT();
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle title={t("nav.advisor")} sub={t("advisor.sub")} />
      <ContextBox />
      <Chat />
      <p className="rounded-xl border border-wait bg-wait-soft p-3 text-xs">{t("advisor.note")}</p>
    </div>
  );
}

export default function AdvisorPage() {
  return (
    <AdminOnly perm="advisor">
      <AdvisorInner />
    </AdminOnly>
  );
}
