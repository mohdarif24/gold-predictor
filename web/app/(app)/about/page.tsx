"use client";
import { Card, PageTitle } from "@/components/ui";
import { type Key, useT } from "@/lib/i18n";

const STEPS = ["s1", "s2", "s3", "s4", "s5"] as const;
const WORDS = ["buy", "sell", "wait", "chance", "proven"] as const;
const TERMS = ["t1", "t2", "t3", "t4", "t5"] as const;

export default function AboutPage() {
  const { t } = useT();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle title={t("about.title")} />

      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={s}>
            <Card className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-soft font-bold text-brass" aria-hidden="true">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold">{t(`about.${s}.t` as Key)}</h2>
                <p className="text-muted">{t(`about.${s}.b` as Key)}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t("about.words")}</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {WORDS.map((w) => (
            <li key={w}>{t(`about.w.${w}` as Key)}</li>
          ))}
        </ul>
      </Card>

      <section id="terms" className="scroll-mt-4 rounded-xl border border-line bg-brass-soft p-5">
        <h2 className="mb-2 text-lg font-semibold">{t("about.terms")}</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          {TERMS.map((k) => (
            <li key={k}>{t(`about.${k}` as Key)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
