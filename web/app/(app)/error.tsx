"use client";
import { useT } from "@/lib/i18n";

/** Shown if a page crashes while rendering, instead of a blank screen. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 rounded-xl border border-line bg-surface p-6">
      <p>{t("error.generic")}</p>
      <button type="button" onClick={reset} className="rounded-lg bg-brass px-4 py-2 font-semibold text-bg">
        {t("retry")}
      </button>
    </div>
  );
}
