"use client";
import { useState } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import {
  ApiError,
  type LlmSettings,
  type LlmTest,
  apiFetch,
  useApi,
} from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useMe } from "@/lib/role";

// OpenAI-compatible providers (any other one works too: type its address and model). Model names change over time:
// edit them if a provider renames one. One model serves both news scoring and the AI mentor.
const PRESETS = [
  {
    name: "DeepSeek",
    url: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
  {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  {
    name: "GitHub Models",
    url: "https://models.github.ai/inference/chat/completions",
    model: "openai/gpt-4o-mini",
  },
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
  },
  {
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
  },
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
];

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2";

function SettingsInner() {
  const { t } = useT();
  const res = useApi<LlmSettings>("admin/settings");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle title={t("api.title")} sub={t("api.sub")} />
      {res.error ? (
        <ErrorNotice message={res.error} onRetry={res.reload} />
      ) : null}
      {res.loading ? <Skeleton className="h-80" /> : null}
      {/* the form starts from the saved values; after a save, `s` refreshes the key hint and "last changed" line */}
      {res.data ? <SettingsForm s={res.data} reload={res.reload} /> : null}
    </div>
  );
}

function SettingsForm({ s, reload }: { s: LlmSettings; reload: () => void }) {
  const { t, lang, num } = useT();
  const [url, setUrl] = useState(s.url);
  const [model, setModel] = useState(s.model);
  const [key, setKey] = useState("");
  const [enabled, setEnabled] = useState(s.enabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<LlmTest | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const admin = useMe().data?.role === "admin";

  const err = (ex: unknown) =>
    ex instanceof ApiError ? ex.message : t("error.generic");

  async function save(extra: { clear_key?: boolean } = {}) {
    setBusy("save");
    setMsg(null);
    try {
      await apiFetch<LlmSettings>("admin/settings", {
        method: "PUT",
        body: JSON.stringify({ url, model, enabled, key, ...extra }),
      });
      setKey("");
      setMsg({ ok: true, text: t("api.saved") });
      reload();
    } catch (ex) {
      setMsg({ ok: false, text: err(ex) });
    }
    setBusy("");
  }

  async function runTest() {
    setBusy("test");
    setTest(null);
    setMsg(null);
    try {
      setTest(
        await apiFetch<LlmTest>("admin/settings/test", {
          method: "POST",
          body: JSON.stringify({ url, model, key }),
        }),
      );
    } catch (ex) {
      setMsg({ ok: false, text: err(ex) });
    }
    setBusy("");
  }

  return (
    <Card className="flex flex-col gap-4">
      {!admin ? <p className="rounded-lg bg-wait-soft p-3 text-sm text-wait">🔒 {t("api.readonly")}</p> : null}
      {/* a person given this page reads it; only the super admin can change or test the provider */}
      <fieldset disabled={!admin} className="contents">
      {!s.encryption_ready ? (
        <p className="rounded-lg bg-wait-soft p-3 text-sm text-wait">
          {t("api.noenc")}
        </p>
      ) : null}
      <label className="flex items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        {t("api.enabled")}
      </label>

      <div>
        <div className="mb-1 text-sm font-medium">{t("api.presets")}</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setUrl(p.url);
                setModel(p.model);
              }}
              className={`rounded-lg border px-3 py-1 text-sm ${url === p.url ? "border-brass bg-brass-soft text-brass" : "border-line text-muted hover:text-ink"}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="url" className="mb-1 block text-sm font-medium">
          {t("api.url")}
        </label>
        <input
          id="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={input}
        />
        <p className="mt-1 text-xs text-muted">{t("api.url.help")}</p>
      </div>
      <div>
        <label htmlFor="model" className="mb-1 block text-sm font-medium">
          {t("api.model")}
        </label>
        <input
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="key" className="mb-1 block text-sm font-medium">
          {t("api.key")}
        </label>
        <input
          id="key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className={input}
          disabled={!s.encryption_ready && !key}
        />
        <p className="mt-1 text-xs text-muted">
          {s.key_set
            ? t("api.key.saved", { hint: s.key_hint ?? "" })
            : t("api.key.none")}{" "}
          {t("api.secure")}
        </p>
        {s.key_set ? (
          <button
            type="button"
            onClick={() => save({ clear_key: true })}
            className="mt-1 text-xs text-sell underline"
          >
            {t("api.key.clear")}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== ""}
          onClick={() => save()}
          className="rounded-lg bg-brass px-4 py-2 font-semibold text-bg disabled:opacity-60"
        >
          {t("api.save")}
        </button>
        <button
          type="button"
          disabled={busy !== ""}
          onClick={runTest}
          className="rounded-lg border border-line px-4 py-2 font-semibold disabled:opacity-60"
        >
          {busy === "test" ? t("api.testing") : t("api.test")}
        </button>
      </div>

      {msg ? (
        <p
          role="status"
          className={`text-sm ${msg.ok ? "text-buy" : "text-sell"}`}
        >
          {msg.text}
        </p>
      ) : null}
      {test ? (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${test.ok ? "border-buy bg-buy-soft" : "border-sell bg-sell-soft"}`}
        >
          <p className="font-semibold">
            {test.ok
              ? t("api.test.ok", { ms: test.ms })
              : t("api.test.fail", { err: test.error ?? "" })}
          </p>
          {test.answer ? (
            <p className="mt-1 break-words">
              <span className="text-muted">{t("api.test.answer")}:</span>{" "}
              <code>{test.answer}</code>
            </p>
          ) : null}
        </div>
      ) : null}
      {s.updated ? (
        <p className="text-xs text-muted">
          {t("api.updated", {
            when: num(fmtDateTime(s.updated, lang)),
            who: s.updated_by ?? "-",
          })}
        </p>
      ) : null}
      </fieldset>
    </Card>
  );
}

export default function ApiSettingsPage() {
  return (
    <AdminOnly perm="apisettings">
      <SettingsInner />
    </AdminOnly>
  );
}
