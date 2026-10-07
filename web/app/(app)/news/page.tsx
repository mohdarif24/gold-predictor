"use client";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type NewsResponse, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { type Key, useT } from "@/lib/i18n";

const TONE = {
  bullish: "bg-buy-soft text-buy",
  bearish: "bg-sell-soft text-sell",
  neutral: "bg-wait-soft text-wait",
} as const;

function NewsPageInner() {
  const { t, lang, num } = useT();
  const res = useApi<NewsResponse>("news", 300_000);
  const d = res.data;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("news.title")} sub={t("news.sub")} />
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-48" /> : null}

      {d ? (
        <>
          <Card>
            <h2 className="text-sm font-medium text-muted">{t("news.mood.title")}</h2>
            {d.mood.label ? (
              <>
                <div className={`mt-2 inline-block rounded-lg px-3 py-1.5 text-xl font-bold ${TONE[d.mood.label]}`}>
                  {t(`news.label.${d.mood.label}` as Key)}
                </div>
                <p className="mt-2 text-sm text-muted">{t("news.mood.detail", { n: d.mood.count, bull: d.mood.bullish, bear: d.mood.bearish })}</p>
              </>
            ) : (
              <p className="mt-2 text-muted">{t("news.mood.none")}</p>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="p-5 pb-3 text-lg font-semibold">{t("news.events.title")}</h2>
            {d.events.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">{t("news.events.none")}</p>
            ) : (
              <ul>
                {d.events.map((e) => (
                  <li key={e.ts + e.title} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line px-5 py-3">
                    <div className="min-w-0">
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-muted">
                        {e.country} · {num(fmtDateTime(e.ts, lang))}
                        {e.forecast ? ` · ${t("news.events.forecast")}: ${e.forecast}` : ""}
                        {e.previous ? ` · ${t("news.events.previous")}: ${e.previous}` : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${e.impact === "high" ? "bg-sell-soft text-sell" : "bg-wait-soft text-wait"}`}>
                      {t(`news.impact.${e.impact}` as Key)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            {d.articles.length === 0 ? (
              <p className="p-5 text-sm text-muted">{t("news.none")}</p>
            ) : (
              <ul>
                {d.articles.map((a) => (
                  <li key={a.url + a.published} className="flex flex-col gap-1.5 border-b border-line px-5 py-4 last:border-0">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      {a.title}
                    </a>
                    {a.summary ? <p className="text-sm text-muted">{a.summary}</p> : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${TONE[a.label]}`}>{t(`news.label.${a.label}` as Key)}</span>
                      <span className="text-muted">
                        {t(`news.topic.${a.topic}` as Key)} · {t(`news.impact.${a.impact}` as Key)} · {a.source} · {num(fmtDateTime(a.published, lang))}
                      </span>
                      <span className="text-muted">· {a.scorer.startsWith("llm") ? t("news.scored.llm") : t("news.scored.rules")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="rounded-xl border border-line bg-brass-soft p-4 text-sm">{t("news.note")}</p>
        </>
      ) : null}
    </div>
  );
}

export default function NewsPage() {
  return (
    <AdminOnly perm="news">
      <NewsPageInner />
    </AdminOnly>
  );
}
