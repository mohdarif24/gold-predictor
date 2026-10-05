"use client";
import { useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { ApiError, apiFetch, useApi } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Alerts = { telegram_on: boolean; telegram_chat_id: string | null; email_on: boolean };

function Form({ initial }: { initial: Alerts }) {
  const { t } = useT();
  const [tgOn, setTgOn] = useState(initial.telegram_on);
  const [chat, setChat] = useState(initial.telegram_chat_id ?? "");
  const [emailOn, setEmailOn] = useState(initial.email_on);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    try {
      await apiFetch("me/alerts", {
        method: "PUT",
        body: JSON.stringify({ telegram_on: tgOn, telegram_chat_id: chat, email_on: emailOn }),
      });
      setState("saved");
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : "");
      setState("error");
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <Card>
        <label className="flex items-center justify-between gap-4">
          <span className="text-lg font-semibold">{t("set.tg")}</span>
          <input type="checkbox" checked={tgOn} onChange={(e) => setTgOn(e.target.checked)} className="h-6 w-6 accent-[var(--brass)]" aria-label={`${t("set.tg")} ${t("set.on")}`} />
        </label>
        <p className="mt-1 text-sm text-muted">{t("set.tg.help")}</p>
        <label htmlFor="chat" className="mt-4 block text-sm font-medium">
          {t("set.tg.id")}
        </label>
        <input
          id="chat"
          inputMode="numeric"
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-lg border border-line bg-bg px-3 py-2"
          placeholder="123456789"
        />
      </Card>

      <Card>
        <label className="flex items-center justify-between gap-4">
          <span className="text-lg font-semibold">{t("set.email")}</span>
          <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} className="h-6 w-6 accent-[var(--brass)]" aria-label={`${t("set.email")} ${t("set.on")}`} />
        </label>
        <p className="mt-1 text-sm text-muted">{t("set.email.help")}</p>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-lg bg-brass px-5 py-2.5 font-semibold text-bg disabled:opacity-60"
        >
          {state === "saving" ? t("set.saving") : t("set.save")}
        </button>
        <span role="status" className={state === "error" ? "text-sell" : "text-buy"}>
          {state === "saved" ? t("set.saved") : state === "error" ? err || t("error.generic") : ""}
        </span>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { t } = useT();
  const a = useApi<Alerts>("me/alerts");
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageTitle title={t("set.title")} sub={t("set.intro")} />
      {a.error ? <ErrorNotice message={a.error} onRetry={a.reload} /> : null}
      {a.loading ? <Skeleton className="h-48" /> : null}
      {a.data ? <Form initial={a.data} /> : null}
    </div>
  );
}
