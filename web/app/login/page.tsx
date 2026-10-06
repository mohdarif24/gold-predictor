"use client";
import { useState } from "react";
import { LangToggle } from "@/components/AppShell";
import { useT } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (res.ok) {
        // full reload on purpose: drops any state from the old session
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
        return;
      }
      setError(res.status === 401 ? t("login.wrongcode") : res.status === 500 ? t("login.notconfigured") : t("error.backend"));
    } catch {
      setError(t("error.backend"));
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen flex-col px-4">
      <div className="mx-auto flex w-full max-w-md justify-end py-4">
        <LangToggle />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-16">
        <div className="mb-8 flex items-center gap-2 text-xl font-bold">
          <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-full bg-brass" />
          {t("app.name")}
        </div>
        <h1 className="text-3xl font-bold">{t("login.title")}</h1>
        <p className="mt-1 mb-6 text-muted">{t("login.subtitle")}</p>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium">{t("login.code")}</label>
            <input
              id="code"
              type="password"
              autoComplete="current-password"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 font-mono"
            />
            <p className="mt-1 text-xs text-muted">{t("login.code.help")}</p>
          </div>
          {error ? <p role="alert" className="text-sm text-sell">{error}</p> : null}
          <button type="submit" disabled={busy} className="rounded-lg bg-brass px-4 py-3 font-semibold text-bg disabled:opacity-60">
            {busy ? t("login.busy") : t("login.submit")}
          </button>
        </form>
      </main>
    </div>
  );
}
