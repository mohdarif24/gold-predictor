"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const STALE_MIN = 15;

/** Tells "the updater is running" apart from "it stopped", independent of whether the market is open. */
export function LiveStatus({ lastCheck }: { lastCheck: string | null | undefined }) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const checked = lastCheck ? new Date(lastCheck).getTime() : NaN;
  const mins = Number.isNaN(checked) ? null : Math.max(0, Math.round((now - checked) / 60_000));
  const live = mins !== null && mins <= STALE_MIN;
  const label = mins === null ? t("live.never") : t(live ? "live.ok" : "live.paused", { n: mins });

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted" title={t("live.hint")}>
      <span className="flex items-center gap-1.5 font-medium text-ink">
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${live ? "bg-buy" : "bg-sell"}`} />
        {label}
      </span>
      <span className="hidden sm:inline">· {t("live.hint")}</span>
    </p>
  );
}
