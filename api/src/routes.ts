/**
 * Every API endpoint in one table: method, path (":name" is a parameter), handler.
 * `secured(..., { admin: true })` = super admin only; `{ perm }` = super admin or a client given that page.
 */
import { SESSION_COOKIE, SESSION_DAYS, createSession, hashCode } from "./lib/access";
import { createUser, getApiLogs, getCatalog, getLlmSettings, listUsers, putLlmSettings, setUserPerms, testLlm } from "./lib/admin";
import { run } from "./lib/db";
import { type Handler, json, secured } from "./lib/http";
import {
  HttpError, emailForCode, getAlerts, getCandles, getChecklist, getDrivers, getHistory, getNews, getPerformance,
  getPredictionLog, getPublicSignal, getSignals, getTrades, listInstruments, putAlerts,
} from "./lib/queries";

const body = async (req: Request) => req.json().catch(() => null);
const query = (req: Request) => new URL(req.url).searchParams;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

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

/** Who may call a route; shown on the super admin's "Data & APIs" page. The handler's secured() options enforce it. */
export type Access = "open" | "signed-in" | "logs" | "admin";

export const ROUTES: [method: string, path: string, access: Access, handler: Handler][] = [
  ["GET", "/api/health", "open", async () => json({ ok: true, service: "gold-predictor-api" })],
  ["POST", "/api/login", "open", login],
  ["POST", "/api/logout", "open", logout],

  // everyone who is signed in
  ["GET", "/api/me", "signed-in", secured(({ email, role, perms }) => ({ email, role, perms }))],
  ["GET", "/api/instruments", "signed-in", secured(({ run }) => listInstruments(run))],
  ["GET", "/api/public/:name", "signed-in", secured(({ run, params }) => getPublicSignal(run, params.name))],
  ["GET", "/api/me/alerts", "signed-in", secured(({ email, run }) => getAlerts(run, email))],
  ["PUT", "/api/me/alerts", "signed-in", secured(async ({ req, email, run }) => {
    const b = await body(req);
    if (!b || typeof b !== "object") throw new HttpError(400, "invalid request");
    return putAlerts(run, email, b);
  })],

  // super admin, or a client given the Prediction Logs page (clients get only what they were shown)
  ["GET", "/api/logs/:name", "logs", secured(({ req, run, role, params }) => {
    const q = query(req);
    return getPredictionLog(run, params.name, {
      horizon: q.get("horizon"), period: q.get("period"), status: q.get("status"), limit: Number(q.get("limit") ?? 100),
      client: role !== "admin",
    });
  }, { perm: "logs" })],

  // super admin only
  ["GET", "/api/signals/:name", "admin", secured(({ run, params }) => getSignals(run, params.name), { admin: true })],
  ["GET", "/api/candles/:name", "admin", secured(({ req, run, params }) => {
    const q = query(req);
    return getCandles(run, params.name, q.get("tf") ?? "D1", Number(q.get("limit") ?? 250));
  }, { admin: true })],
  ["GET", "/api/trades/:name", "admin", secured(({ req, run, params }) => getTrades(run, params.name, Number(query(req).get("limit") ?? 50)), { admin: true })],
  ["GET", "/api/history/:name", "admin", secured(({ req, run, params }) => getHistory(run, params.name, Number(query(req).get("limit") ?? 100)), { admin: true })],
  ["GET", "/api/performance/:name", "admin", secured(({ run, params }) => getPerformance(run, params.name), { admin: true })],
  ["GET", "/api/drivers/:name", "admin", secured(({ run, params }) => getDrivers(run, params.name), { admin: true })],
  ["GET", "/api/checklist/:name", "admin", secured(({ run, params }) => getChecklist(run, params.name), { admin: true })],
  ["GET", "/api/news", "admin", secured(({ run }) => getNews(run), { admin: true })],

  ["GET", "/api/admin/users", "admin", secured(({ run }) => listUsers(run), { admin: true })],
  // create a person (or give an existing person a new code): generated, or typed by the super admin; only the hash is stored
  ["POST", "/api/admin/users", "admin", secured(async ({ req, run }) => createUser(run, (await body(req)) ?? {}), { admin: true })],
  ["PATCH", "/api/admin/users", "admin", secured(async ({ req, run }) => {
    const b = await body(req);
    return setUserPerms(run, String(b?.email ?? ""), b?.perms);
  }, { admin: true })],
  // you cannot remove yourself, so the site never ends up without an administrator by accident
  ["DELETE", "/api/admin/users", "admin", secured(async ({ req, run, email: me }) => {
    const email = String((await body(req))?.email ?? "").trim().toLowerCase();
    if (email === me) throw new HttpError(400, "you cannot remove your own access");
    const rows = await run("DELETE FROM access_codes WHERE email = $1 RETURNING email", [email]);
    if (!rows.length) throw new HttpError(404, "no such person");
    return { ok: true };
  }, { admin: true })],

  ["GET", "/api/admin/settings", "admin", secured(({ run }) => getLlmSettings(run), { admin: true })],
  ["PUT", "/api/admin/settings", "admin", secured(async ({ req, run, email }) => {
    const b = await body(req);
    if (!b || typeof b !== "object") throw new HttpError(400, "send the settings as JSON");
    return putLlmSettings(run, email, {
      url: str(b.url), model: str(b.model), key: str(b.key),
      enabled: typeof b.enabled === "boolean" ? b.enabled : undefined, clear_key: b.clear_key === true,
    });
  }, { admin: true })],
  ["POST", "/api/admin/settings/test", "admin", secured(async ({ req, run }) => {
    const b = (await body(req)) ?? {};
    return testLlm(run, { url: str(b.url), model: str(b.model), key: str(b.key) });
  }, { admin: true })],
  ["GET", "/api/admin/catalog", "admin", secured(({ req, run }) => getCatalog(run, new URL(req.url).origin, ROUTES.map(([m, p, a]) => ({ method: m, path: p, access: a }))), { admin: true })],
  ["GET", "/api/admin/api-logs", "admin", secured(({ req, run }) => {
    const q = query(req);
    return getApiLogs(run, { limit: Number(q.get("limit") ?? 100), failed: q.get("failed") === "1" });
  }, { admin: true })],
];

/** Find the handler for a request: exact segments, ":x" matches one segment. */
export function match(method: string, path: string): { handler: Handler; params: Record<string, string> } | "method" | null {
  const parts = path.replace(/\/+$/, "").split("/");
  let pathFound = false;
  for (const [m, pattern, , handler] of ROUTES) {
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
