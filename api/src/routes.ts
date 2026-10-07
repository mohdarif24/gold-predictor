/**
 * Every API endpoint in one table: method, path (":name" is a parameter), handler.
 * `secured(..., { admin: true })` = super admin only; `{ perm }` = super admin or a client given that page.
 */
import { SESSION_COOKIE, SESSION_DAYS, createSession, hashCode } from "./lib/access";
import { cleanPerms, getApiLogs, getLlmSettings, listUsers, putLlmSettings, setUserPerms, testLlm } from "./lib/admin";
import { run } from "./lib/db";
import { type Handler, json, secured } from "./lib/http";
import {
  HttpError, emailForCode, getAlerts, getCandles, getChecklist, getDrivers, getHistory, getNews, getPerformance,
  getPredictionLog, getPublicSignal, getSignals, getTrades, listInstruments, putAlerts,
} from "./lib/queries";

const body = async (req: Request) => req.json().catch(() => null);
const query = (req: Request) => new URL(req.url).searchParams;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** 22 random URL-safe characters (~128 bits), the same shape as scripts/access_code.py makes. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionCookie(req: Request, value: string, maxAge: number): string {
  // SameSite=Lax still travels between the frontend and API hosts because both sit under the same site
  // (for example *.predictor-au.workers.dev); a different site would need a shared custom domain.
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

const login: Handler = async (req) => {
  const b = await body(req);
  const code = typeof b?.code === "string" ? b.code.trim() : "";
  if (code.length < 10 || code.length > 100) return json({ detail: "wrong code" }, 401);
  let email: string | null;
  try {
    email = await emailForCode(run, await hashCode(code));
  } catch {
    return json({ detail: "data unavailable" }, 502);
  }
  if (!email) return json({ detail: "wrong code" }, 401);
  const token = await createSession(email);
  if (!token) return json({ detail: "sign-in is not configured on the server" }, 500);
  return json({ email }, 200, { "Set-Cookie": sessionCookie(req, token, SESSION_DAYS * 86400) });
};

const logout: Handler = async (req) => json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, "", 0) });

export const ROUTES: [method: string, path: string, handler: Handler][] = [
  ["GET", "/api/health", async () => json({ ok: true, service: "gold-predictor-api" })],
  ["POST", "/api/login", login],
  ["POST", "/api/logout", logout],

  // everyone who is signed in
  ["GET", "/api/me", secured(({ email, role, perms }) => ({ email, role, perms }))],
  ["GET", "/api/instruments", secured(({ run }) => listInstruments(run))],
  ["GET", "/api/public/:name", secured(({ run, params }) => getPublicSignal(run, params.name))],
  ["GET", "/api/me/alerts", secured(({ email, run }) => getAlerts(run, email))],
  ["PUT", "/api/me/alerts", secured(async ({ req, email, run }) => {
    const b = await body(req);
    if (!b || typeof b !== "object") throw new HttpError(400, "invalid request");
    return putAlerts(run, email, b);
  })],

  // super admin, or a client given the Prediction Logs page (clients get only what they were shown)
  ["GET", "/api/logs/:name", secured(({ req, run, role, params }) => {
    const q = query(req);
    return getPredictionLog(run, params.name, {
      horizon: q.get("horizon"), period: q.get("period"), status: q.get("status"), limit: Number(q.get("limit") ?? 100),
      client: role !== "admin",
    });
  }, { perm: "logs" })],

  // super admin only
  ["GET", "/api/signals/:name", secured(({ run, params }) => getSignals(run, params.name), { admin: true })],
  ["GET", "/api/candles/:name", secured(({ req, run, params }) => {
    const q = query(req);
    return getCandles(run, params.name, q.get("tf") ?? "D1", Number(q.get("limit") ?? 250));
  }, { admin: true })],
  ["GET", "/api/trades/:name", secured(({ req, run, params }) => getTrades(run, params.name, Number(query(req).get("limit") ?? 50)), { admin: true })],
  ["GET", "/api/history/:name", secured(({ req, run, params }) => getHistory(run, params.name, Number(query(req).get("limit") ?? 100)), { admin: true })],
  ["GET", "/api/performance/:name", secured(({ run, params }) => getPerformance(run, params.name), { admin: true })],
  ["GET", "/api/drivers/:name", secured(({ run, params }) => getDrivers(run, params.name), { admin: true })],
  ["GET", "/api/checklist/:name", secured(({ run, params }) => getChecklist(run, params.name), { admin: true })],
  ["GET", "/api/news", secured(({ run }) => getNews(run), { admin: true })],

  ["GET", "/api/admin/users", secured(({ run }) => listUsers(run), { admin: true })],
  // create a person (or give an existing person a new code); the code is returned once and only its hash is stored
  ["POST", "/api/admin/users", secured(async ({ req, run }) => {
    const b = await body(req);
    const email = String(b?.email ?? "").trim().toLowerCase();
    const role = b?.role === "admin" ? "admin" : "user";
    const perms = cleanPerms(b?.perms);
    if (!EMAIL.test(email)) throw new HttpError(400, "enter a valid email");
    const code = newCode();
    await run(
      "INSERT INTO access_codes(email, code_hash, created, role, perms) VALUES($1, $2, $3, $4, $5) " +
        "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, created = excluded.created, last_used = NULL, " +
        "role = excluded.role, perms = excluded.perms",
      [email, await hashCode(code), new Date().toISOString().slice(0, 19) + "+00:00", role, perms.join(",")],
    );
    return { email, role, perms, code };
  }, { admin: true })],
  ["PATCH", "/api/admin/users", secured(async ({ req, run }) => {
    const b = await body(req);
    return setUserPerms(run, String(b?.email ?? ""), b?.perms);
  }, { admin: true })],
  // you cannot remove yourself, so the site never ends up without an administrator by accident
  ["DELETE", "/api/admin/users", secured(async ({ req, run, email: me }) => {
    const email = String((await body(req))?.email ?? "").trim().toLowerCase();
    if (email === me) throw new HttpError(400, "you cannot remove your own access");
    const rows = await run("DELETE FROM access_codes WHERE email = $1 RETURNING email", [email]);
    if (!rows.length) throw new HttpError(404, "no such person");
    return { ok: true };
  }, { admin: true })],

  ["GET", "/api/admin/settings", secured(({ run }) => getLlmSettings(run), { admin: true })],
  ["PUT", "/api/admin/settings", secured(async ({ req, run, email }) => {
    const b = await body(req);
    if (!b || typeof b !== "object") throw new HttpError(400, "send the settings as JSON");
    return putLlmSettings(run, email, {
      url: str(b.url), model: str(b.model), key: str(b.key),
      enabled: typeof b.enabled === "boolean" ? b.enabled : undefined, clear_key: b.clear_key === true,
    });
  }, { admin: true })],
  ["POST", "/api/admin/settings/test", secured(async ({ req, run }) => {
    const b = (await body(req)) ?? {};
    return testLlm(run, { url: str(b.url), model: str(b.model), key: str(b.key) });
  }, { admin: true })],
  ["GET", "/api/admin/api-logs", secured(({ req, run }) => {
    const q = query(req);
    return getApiLogs(run, { limit: Number(q.get("limit") ?? 100), failed: q.get("failed") === "1" });
  }, { admin: true })],
];

/** Find the handler for a request: exact segments, ":x" matches one segment. */
export function match(method: string, path: string): { handler: Handler; params: Record<string, string> } | "method" | null {
  const parts = path.replace(/\/+$/, "").split("/");
  let pathFound = false;
  for (const [m, pattern, handler] of ROUTES) {
    const want = pattern.split("/");
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = want.every((w, i) => {
      if (w.startsWith(":")) {
        try {
          params[w.slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          return false;
        }
        return parts[i] !== "";
      }
      return w === parts[i];
    });
    if (!ok) continue;
    pathFound = true;
    if (m === method) return { handler, params };
  }
  return pathFound ? "method" : null;
}
