"use client";
import { useState } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { API_URL, type Catalog, type CatalogParam, useApi } from "@/lib/api";
import { HONEST, LEGEND, PARAMETERS, type Status } from "@/lib/content/parameters";
import { fmtDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`${label}: ${text}`}
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }).catch(() => null)}
      className="shrink-0 rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:text-ink">
      {done ? "✓" : label}
    </button>
  );
}

/** A value with its own copy button. */
function Val({ v, copy }: { v: string; copy: string }) {
  return (
    <span className="flex items-start gap-2">
      <code className="min-w-0 break-all font-mono text-xs">{v}</code>
      <Copy text={v} label={copy} />
    </span>
  );
}

function ParamTable({ rows, W }: { rows: CatalogParam[]; W: Record<string, string> }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="py-1.5 pr-3 font-medium">{W.param}</th>
            <th className="py-1.5 pr-3 font-medium">{W.value}</th>
            <th className="py-1.5 font-medium">{W.where}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name + p.where} className="border-b border-line last:border-0 align-top">
              <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{p.name}</td>
              <td className="py-1.5 pr-3"><Val v={p.value} copy={W.copy} /></td>
              <td className="py-1.5 text-xs text-muted">{p.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvTable({ rows, how, W }: { rows: { name: string; purpose: string; secret: boolean; set: boolean | null; value?: string | null }[]; how: (n: string, secret: boolean) => string; W: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="py-1.5 pr-3 font-medium">{W.name}</th>
            <th className="py-1.5 pr-3 font-medium">{W.status}</th>
            <th className="py-1.5 pr-3 font-medium">{W.purpose}</th>
            <th className="py-1.5 font-medium">{W.change}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.name} className="border-b border-line last:border-0 align-top">
              <td className="py-1.5 pr-3"><Val v={e.name} copy={W.copy} /></td>
              <td className="py-1.5 pr-3 text-xs whitespace-nowrap">
                {e.set === null ? "-" : e.set ? <span className="text-buy">● {W.set}</span> : <span className="text-muted">○ {W.unset}</span>}
                {e.secret ? <span className="ml-1 text-muted">({W.secret})</span> : null}
                {e.value ? <div className="mt-1"><Val v={e.value} copy={W.copy} /></div> : null}
              </td>
              <td className="py-1.5 pr-3 text-xs">{e.purpose}</td>
              <td className="py-1.5"><Val v={how(e.name, e.secret)} copy={W.copy} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ACCESS_TONE: Record<string, string> = { open: "text-muted", "signed-in": "text-buy", logs: "text-wait", admin: "text-brass" };

function SourcesInner() {
  const { t, lang, num } = useT();
  const res = useApi<Catalog>("admin/catalog");
  const c = res.data;
  const W = lang === "en"
    ? {
        sub: "Every outside API the system pulls data from, every parameter it sends, and every setting and environment variable. Read-only: to change something, edit the file named in “where” (or the environment variable) and deploy.",
        readonly: "Nothing here can be edited on this page, on purpose. Values from config.yaml and code change through a commit; environment variables change in GitHub or Cloudflare.",
        sources: "Outside data APIs", model: "Settings the models and signals run with", env: "Environment variables",
        jobsEnv: "Python jobs (GitHub Actions secrets)", apiEnv: "Backend API (Cloudflare Worker gold-predictor-api)", webEnv: "Frontend build (static site)",
        routes: "This system’s own API endpoints", params: "Everything that moves gold, and where each stands",
        param: "Parameter", value: "Value", where: "Where it is set", name: "Name", status: "Status", purpose: "Used for", change: "How to change",
        set: "set", unset: "not set", secret: "secret; value never shown", copy: "Copy", copyAll: "Copy everything (JSON)",
        url: "Address", method: "Call", code: "Code", auth: "Key", refresh: "When",
        snapshot: "Inventory written by the last job run", none: "The jobs have not written their inventory yet; it appears after the next scheduled run (every 15 minutes).",
        jobsNote: "“set” is what the last scheduled run saw.", access: "Who may call", honest: "Honest note",
      }
    : {
        sub: "সিস্টেম যেসব বাইরের API থেকে ডেটা আনে, প্রতিটি API-তে কী প্যারামিটার পাঠায়, আর সব সেটিং ও environment variable। শুধু দেখার জন্য: কিছু বদলাতে “কোথায়” ঘরে লেখা ফাইল (বা environment variable) বদলে deploy করুন।",
        readonly: "এই পাতায় কিছুই বদলানো যায় না, ইচ্ছাকৃতভাবে। config.yaml ও কোডের মান commit করে বদলায়; environment variable বদলায় GitHub বা Cloudflare-এ।",
        sources: "বাইরের ডেটা API", model: "মডেল ও সংকেত যে সেটিংয়ে চলে", env: "Environment variable",
        jobsEnv: "Python কাজ (GitHub Actions secret)", apiEnv: "ব্যাকএন্ড API (Cloudflare Worker gold-predictor-api)", webEnv: "ফ্রন্টএন্ড বিল্ড (স্ট্যাটিক সাইট)",
        routes: "এই সিস্টেমের নিজস্ব API এন্ডপয়েন্ট", params: "সোনার দামকে প্রভাবিত করে এমন সবকিছু, আর প্রতিটির অবস্থা",
        param: "প্যারামিটার", value: "মান", where: "কোথায় সেট করা", name: "নাম", status: "অবস্থা", purpose: "কীসের জন্য", change: "কীভাবে বদলাবেন",
        set: "সেট আছে", unset: "সেট নেই", secret: "গোপন; মান কখনো দেখানো হয় না", copy: "কপি", copyAll: "সব কপি করুন (JSON)",
        url: "ঠিকানা", method: "কল", code: "কোড", auth: "Key", refresh: "কখন",
        snapshot: "শেষ কাজ চলার সময় লেখা তালিকা", none: "কাজগুলো এখনো তালিকা লেখেনি; পরের নির্ধারিত রানে (প্রতি ১৫ মিনিটে) দেখা যাবে।",
        jobsNote: "“সেট আছে” মানে শেষ নির্ধারিত রানে যা দেখা গেছে।", access: "কে ডাকতে পারে", honest: "সৎ কথা",
      };

  const webEnv = [
    { name: "NEXT_PUBLIC_API_URL", purpose: lang === "en" ? "where the frontend finds the API (baked in at build)" : "ফ্রন্টএন্ড কোথায় API পাবে (বিল্ডের সময় বসে)", secret: false, set: Boolean(API_URL), value: API_URL || null },
    { name: "NEXT_PUBLIC_APP_NAME", purpose: lang === "en" ? "name in the header" : "হেডারে নাম", secret: false, set: Boolean(process.env.NEXT_PUBLIC_APP_NAME), value: process.env.NEXT_PUBLIC_APP_NAME ?? null },
  ];

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageTitle title={t("nav.sources")} sub={W.sub} />
      <p className="rounded-xl border border-wait bg-wait-soft p-4 text-sm">🔒 {W.readonly}</p>
      {res.error ? <ErrorNotice message={res.error} onRetry={res.reload} /> : null}
      {res.loading ? <Skeleton className="h-64" /> : null}

      {c ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{c.jobs_updated ? `${W.snapshot}: ${num(fmtDateTime(c.jobs_updated, lang))}` : W.none}</span>
            <Copy text={JSON.stringify(c, null, 2)} label={W.copyAll} />
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{W.sources}</h2>
            {(c.jobs?.sources ?? []).map((s) => (
              <Card key={s.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-semibold">{s.name}</h3>
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{s.group}</span>
                </div>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
                  <dt className="text-muted">{W.url}</dt><dd><Val v={s.url} copy={W.copy} /></dd>
                  <dt className="text-muted">{W.method}</dt><dd className="text-xs">{s.method}</dd>
                  <dt className="text-muted">{W.code}</dt><dd><Val v={s.code} copy={W.copy} /></dd>
                  <dt className="text-muted">{W.auth}</dt><dd className="text-xs">{s.auth}</dd>
                  <dt className="text-muted">{W.refresh}</dt><dd className="text-xs">{s.refresh}</dd>
                </dl>
                <ParamTable rows={s.params} W={W} />
              </Card>
            ))}
          </section>

          {c.jobs?.model ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">{W.model}</h2>
              <Card><ParamTable rows={c.jobs.model} W={W} /></Card>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{W.env}</h2>
            <Card className="flex flex-col gap-2">
              <h3 className="font-semibold">{W.jobsEnv}</h3>
              <p className="text-xs text-muted">{W.jobsNote}</p>
              <EnvTable rows={(c.jobs?.job_env ?? []).map((e) => ({ ...e }))} W={W}
                how={(n) => (n.startsWith("MT5_") ? `.env (local): ${n}=...` : `gh secret set ${n}`)} />
            </Card>
            <Card className="flex flex-col gap-2">
              <h3 className="font-semibold">{W.apiEnv}</h3>
              <EnvTable rows={c.api.env} W={W}
                how={(n, secret) => (secret ? `cd api && npx wrangler secret put ${n}` : n === "DEV_USER_EMAIL" ? `api/.dev.vars (local): ${n}=...` : `api/wrangler.jsonc > vars.${n}`)} />
            </Card>
            <Card className="flex flex-col gap-2">
              <h3 className="font-semibold">{W.webEnv}</h3>
              <EnvTable rows={webEnv} W={W}
                how={(n) => (n === "NEXT_PUBLIC_API_URL" ? "gh variable set API_URL --body <backend address>" : `web/.env.local: ${n}=...`)} />
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{W.routes}</h2>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 pr-3 font-medium">{W.method}</th>
                    <th className="py-1.5 pr-3 font-medium">{W.url}</th>
                    <th className="py-1.5 font-medium">{W.access}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.api.routes.map((r) => (
                    <tr key={r.method + r.path} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs font-semibold">{r.method}</td>
                      <td className="py-1.5 pr-3"><Val v={c.api.origin + r.path} copy={W.copy} /></td>
                      <td className={`py-1.5 text-xs font-semibold ${ACCESS_TONE[r.access] ?? ""}`}>{r.access}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{W.params}</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {(Object.keys(LEGEND) as Status[]).map((s) => <span key={s}>{LEGEND[s].icon} {LEGEND[s].label[lang]}</span>)}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PARAMETERS.map((g) => (
            <Card key={g.title.en} className="flex flex-col gap-2">
              <h3 className="font-semibold">{g.title[lang]}</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {g.items.map((it) => (
                  <li key={it.text.en} className="flex gap-2">
                    <span aria-label={LEGEND[it.status].label[lang]}>{LEGEND[it.status].icon}</span>
                    <span>
                      {it.text[lang]}
                      {it.note ? <span className="mt-0.5 block text-xs text-muted">{it.note[lang]}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Card className="flex flex-col gap-2 border-brass">
          <h3 className="font-semibold">{W.honest}</h3>
          {HONEST.map((h) => <p key={h.en} className="text-sm">{h[lang]}</p>)}
        </Card>
      </section>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <AdminOnly>
      <SourcesInner />
    </AdminOnly>
  );
}
