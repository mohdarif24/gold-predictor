"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApi } from "@/lib/api";
import { setLang, useT, type Key } from "@/lib/i18n";
import { useInstrument } from "@/lib/instrument";

const NAV: { href: string; key: Key }[] = [
  { href: "/", key: "nav.today" },
  { href: "/performance", key: "nav.performance" },
  { href: "/history", key: "nav.history" },
  { href: "/settings", key: "nav.settings" },
  { href: "/about", key: "nav.about" },
];

export function LangToggle() {
  const { lang } = useT();
  return (
    <div role="group" aria-label="Language" className="flex overflow-hidden rounded-lg border border-line text-sm">
      {(["en", "bn"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-3 py-1.5 font-medium ${lang === l ? "bg-brass text-bg" : "text-muted hover:text-ink"}`}
        >
          {l === "en" ? "EN" : "বাং"}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const path = usePathname();
  const { list, current, select } = useInstrument();
  const { data: me } = useApi<{ email: string }>("me");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-brass" />
            {t("app.name")}
          </Link>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {list.length > 1 ? (
              <select
                aria-label="Instrument"
                value={current?.id ?? ""}
                onChange={(e) => select(e.target.value)}
                className="max-w-[8.5rem] rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm sm:max-w-[14rem]"
              >
                {list.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            ) : null}
            <LangToggle />
            {/* Cloudflare Access serves this path and ends the login session */}
            <a href="/cdn-cgi/access/logout" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink" title={me?.email}>
              {t("logout")}
            </a>
          </div>

          <nav aria-label="Main" className="-mx-1 flex w-full gap-1 overflow-x-auto pb-1">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brass-soft text-brass" : "text-muted hover:text-ink"
                  }`}
                >
                  {t(n.key)}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted">
          <span>{t("footer.note")}</span>
          <Link href="/about#terms" className="underline underline-offset-2">
            {t("footer.terms")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
