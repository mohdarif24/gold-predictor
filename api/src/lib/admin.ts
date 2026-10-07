/**
 * What only the site administrator can see and change: the LLM provider used for news scoring, and the log of every
 * outside API call (written here for test calls and by core/settings.py for the scheduled jobs).
 */
import { hashCode } from "./access";
import { HttpError, PERMS, type Perm, type Run, parsePerms } from "./queries";
import { decrypt, encrypt, encryptionReady } from "./secret";

export const DEFAULT_LLM = { url: "https://models.github.ai/inference/chat/completions", model: "openai/gpt-4o-mini" };
const CLIP = 4000;
const nowIso = () => new Date().toISOString().slice(0, 19) + "+00:00";

export async function listUsers(run: Run) {
  const rows = await run<{ email: string; role: string; perms: string | null; created: string | null; last_used: string | null }>(
    "SELECT email, role, perms, created, last_used FROM access_codes ORDER BY role, email",
  );
  return rows.map((r) => ({ ...r, role: r.role === "admin" ? "admin" : "user", perms: parsePerms(r.perms) }));
}

/** Keep only known page names, in a fixed order, so the stored text stays tidy. */
export function cleanPerms(v: unknown): Perm[] {
  const asked = Array.isArray(v) ? v.map(String) : [];
  return PERMS.filter((p) => asked.includes(p));
}

/** 22 random URL-safe characters (~128 bits), the same shape as scripts/access_code.py makes. */
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_CODE = 10; // the sign-in endpoint refuses anything shorter
const MAX_CODE = 100;

/**
 * Create a person, or give an existing person a new code. The super admin either lets the server generate the code or
 * types one; either way only its hash is stored and the code is returned once.
 */
export async function createUser(run: Run, body: { email?: unknown; role?: unknown; perms?: unknown; code?: unknown }) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "admin" ? "admin" : "user";
  const perms = cleanPerms(body.perms);
  if (!EMAIL.test(email)) throw new HttpError(400, "enter a valid email");
  const typed = typeof body.code === "string" ? body.code.trim() : "";
  if (typed) {
    if (typed.length < MIN_CODE || typed.length > MAX_CODE) throw new HttpError(400, `the code must be ${MIN_CODE} to ${MAX_CODE} characters`);
    if (/\s/.test(typed)) throw new HttpError(400, "the code cannot contain spaces");
  }
  const code = typed || newCode();
  const hash = await hashCode(code);
  // a code identifies the person at sign-in, so two people can never share one
  const taken = await run<{ email: string }>("SELECT email FROM access_codes WHERE code_hash = $1 AND email <> $2", [hash, email]);
  if (taken.length) throw new HttpError(409, "this code is already used by someone else; choose another");
  await run(
    "INSERT INTO access_codes(email, code_hash, created, role, perms) VALUES($1, $2, $3, $4, $5) " +
      "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, created = excluded.created, last_used = NULL, " +
      "role = excluded.role, perms = excluded.perms",
    [email, hash, nowIso(), role, perms.join(",")],
  );
  return { email, role, perms, code, typed: Boolean(typed) };
}

/** Environment of this backend Worker: name -> (purpose, secret?). Secret values are never returned, only whether set. */
const API_ENV: Record<string, [string, boolean]> = {
  DATABASE_URL: ["Neon Postgres connection (main branch)", true],
  SESSION_SECRET: ["signs the 30-day sign-in cookie", true],
  SETTINGS_KEY: ["encrypts the AI key saved on the Model API page (same value as the jobs' GitHub secret)", true],
  ALLOWED_ORIGINS: ["browser origins allowed to call this API (the frontend)", false],
  CF_ACCESS_TEAM_DOMAIN: ["Cloudflare Access team domain (optional login)", false],
  CF_ACCESS_AUD: ["Cloudflare Access application audience tag (optional login)", true],
  ADMIN_EMAILS: ["super admins when signing in through Cloudflare Access", false],
  DEV_USER_EMAIL: ["local development shortcut (ignored in production and off localhost)", false],
};

type RouteInfo = { method: string; path: string; access: string };

/**
 * Everything the super admin's "Data & APIs" page lists: the jobs' inventory of outside sources and settings (written
 * by run.py from config.yaml on every run), this API's own environment and endpoints. Read-only by design.
 */
export async function getCatalog(run: Run, apiOrigin: string, routes: RouteInfo[]) {
  const rows = await run<{ value: string; updated: string }>("SELECT value, updated FROM app_settings WHERE name = 'catalog'");
  let jobs: unknown = null;
  try {
    jobs = rows[0] ? JSON.parse(rows[0].value) : null;
  } catch {
    jobs = null;
  }
  const env = Object.entries(API_ENV).map(([name, [purpose, secret]]) => {
    const v = process.env[name];
    return { name, purpose, secret, set: Boolean(v && v.trim()), value: !secret && v ? v : null };
  });
  return { jobs, jobs_updated: rows[0]?.updated ?? null, api: { origin: apiOrigin, env, routes } };
}

/** Turn a client's extra pages on or off without giving them a new code. */
export async function setUserPerms(run: Run, email: string, perms: unknown) {
  const clean = cleanPerms(perms);
  const rows = await run("UPDATE access_codes SET perms = $2 WHERE email = $1 RETURNING email", [email.trim().toLowerCase(), clean.join(",")]);
  if (!rows.length) throw new HttpError(404, "no such person");
  return { email: email.trim().toLowerCase(), perms: clean };
}

async function settingsMap(run: Run) {
  const rows = await run<{ name: string; value: string; updated: string; updated_by: string }>(
    "SELECT name, value, updated, updated_by FROM app_settings WHERE name LIKE 'llm_%'",
  );
  return new Map(rows.map((r) => [r.name, r]));
}

/** The settings as the admin page shows them. The key itself never leaves the server: only its last 4 characters. */
export async function getLlmSettings(run: Run) {
  const s = await settingsMap(run);
  let hint: string | null = null;
  const enc = s.get("llm_key_enc")?.value;
  if (enc) {
    try {
      hint = (await decrypt(enc)).slice(-4);
    } catch {
      hint = "????"; // saved with a different SETTINGS_KEY
    }
  }
  const latest = [...s.values()].sort((a, b) => (a.updated < b.updated ? 1 : -1))[0];
  return {
    url: s.get("llm_url")?.value || DEFAULT_LLM.url,
    model: s.get("llm_model")?.value || DEFAULT_LLM.model,
    enabled: s.get("llm_enabled")?.value !== "0",
    key_set: Boolean(enc),
    key_hint: hint,
    updated: latest?.updated ?? null,
    updated_by: latest?.updated_by ?? null,
    encryption_ready: encryptionReady(),
  };
}

function checkUrl(u: string): string {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new HttpError(400, "the API address is not a valid URL");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "the API address must start with https://");
  return url.toString();
}

/** Save the provider. An empty key keeps the saved one; `clear_key` removes it. */
export async function putLlmSettings(run: Run, by: string, body: { url?: string; model?: string; enabled?: boolean; key?: string; clear_key?: boolean }) {
  const values: [string, string | null][] = [];
  if (body.url !== undefined) values.push(["llm_url", body.url.trim() ? checkUrl(body.url.trim()) : null]);
  if (body.model !== undefined) values.push(["llm_model", body.model.trim().slice(0, 200) || null]);
  if (body.enabled !== undefined) values.push(["llm_enabled", body.enabled ? "1" : "0"]);
  if (body.key?.trim()) {
    if (!encryptionReady()) throw new HttpError(400, "SETTINGS_KEY is not set on the server, so a key cannot be stored safely");
    values.push(["llm_key_enc", await encrypt(body.key.trim())]);
  } else if (body.clear_key) values.push(["llm_key_enc", null]);
  for (const [name, value] of values) {
    if (value === null) await run("DELETE FROM app_settings WHERE name = $1", [name]);
    else
      await run(
        "INSERT INTO app_settings(name, value, updated, updated_by) VALUES($1, $2, $3, $4) " +
          "ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated = excluded.updated, updated_by = excluded.updated_by",
        [name, value, nowIso(), by],
      );
  }
  return getLlmSettings(run);
}

export async function logApi(
  run: Run, e: { source: string; url: string; model?: string; ok: boolean; status?: number | null; ms?: number | null; request?: string; response?: string; error?: string },
) {
  await run(
    "INSERT INTO api_logs(ts, source, url, model, ok, status, ms, request, response, error) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [nowIso(), e.source, e.url, e.model ?? "", e.ok ? 1 : 0, e.status ?? null, e.ms ?? null,
      (e.request ?? "").slice(0, CLIP), (e.response ?? "").slice(0, CLIP), (e.error ?? "").slice(0, CLIP)],
  );
}

export async function getApiLogs(run: Run, opts: { limit?: number; failed?: boolean } = {}) {
  const n = Math.max(1, Math.min(Number.isFinite(opts.limit) ? opts.limit! : 100, 500));
  const [rows, stats] = await Promise.all([
    run(
      "SELECT id::int AS id, ts, source, url, model, ok, status, ms, request, response, error FROM api_logs " +
        "WHERE ($1::boolean IS NOT TRUE OR ok = 0) ORDER BY id DESC LIMIT $2",
      [opts.failed ?? false, n],
    ),
    run<{ calls: number; failed: number; avg_ms: number | null; last_ok: string | null; last_fail: string | null }>(
      "SELECT COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE ok = 0)::int AS failed, AVG(ms)::float8 AS avg_ms, " +
        "MAX(ts) FILTER (WHERE ok = 1) AS last_ok, MAX(ts) FILTER (WHERE ok = 0) AS last_fail " +
        "FROM api_logs WHERE ts >= $1",
      [new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 19)],
    ),
  ]);
  return { rows, last24h: stats[0] };
}

/**
 * Send one tiny request to the provider (the saved one, or the values typed but not yet saved) and log the answer.
 * `fetcher` is injectable for tests.
 */
export async function testLlm(run: Run, body: { url?: string; model?: string; key?: string }, fetcher: typeof fetch = fetch) {
  const saved = await settingsMap(run);
  const url = checkUrl((body.url?.trim() || saved.get("llm_url")?.value || DEFAULT_LLM.url));
  const model = body.model?.trim() || saved.get("llm_model")?.value || DEFAULT_LLM.model;
  let key = body.key?.trim() || "";
  if (!key && saved.get("llm_key_enc")) {
    try {
      key = await decrypt(saved.get("llm_key_enc")!.value);
    } catch {
      throw new HttpError(400, "the saved key cannot be read (SETTINGS_KEY changed?). Enter the key again.");
    }
  }
  if (!key) throw new HttpError(400, "no API key: enter one to test");
  const request = JSON.stringify({
    model, temperature: 0, max_tokens: 60,
    messages: [{ role: "user", content: 'Headline: "Fed signals rate cuts as dollar weakens". Reply with JSON only: {"sentiment_for_gold": number from -1 to 1}' }],
  });
  const t0 = Date.now();
  let status: number | null = null, text = "", error = "";
  try {
    const r = await fetcher(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: request, signal: AbortSignal.timeout(30_000) });
    status = r.status;
    text = await r.text();
    if (!r.ok) error = `HTTP ${r.status}`;
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  const ms = Date.now() - t0;
  let answer: string | null = null;
  if (!error) {
    try {
      answer = JSON.parse(text).choices[0].message.content;
    } catch {
      error = "the reply is not in the expected chat-completions format";
    }
  }
  const ok = !error;
  await logApi(run, { source: "llm:test", url, model, ok, status, ms, request, response: text, error });
  return { ok, status, ms, answer, error: error || null };
}
