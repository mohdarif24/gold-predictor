"use client";
import { useT } from "@/lib/i18n";
import { Notice } from "./ui";

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  const text = /unreachable|unavailable/i.test(message) ? t("error.backend") : t("error.generic");
  return (
    <Notice
      action={
        onRetry ? (
          <button type="button" onClick={onRetry} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium">
            {t("retry")}
          </button>
        ) : undefined
      }
    >
      {text}
    </Notice>
  );
}
