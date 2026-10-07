import { caller } from "./access";
import { run } from "./db";
import { HttpError, type Perm, type Run, accessOf } from "./queries";

export type Role = "admin" | "user";
export type Params = Record<string, string>;
export type Ctx = { req: Request; email: string; role: Role; perms: Perm[]; run: Run; params: Params };
export type Handler = (req: Request, params: Params) => Promise<Response>;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** Administrators by Cloudflare Access email (only used when Access is the way in). */
function accessAdmin(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean).includes(email);
}

/**
 * Wraps an API handler: checks the sign-in and the role, turns errors into clean JSON.
 * `admin`: super admin only. `perm`: super admin, or a client the super admin gave that page to.
 * A session is only as good as the access code behind it, so role and pages are re-read on every request: revoking a
 * code or changing a switch on the Users page takes effect at once.
 */
export function secured(handler: (ctx: Ctx) => Promise<unknown> | unknown, opts: { admin?: boolean; perm?: Perm } = {}): Handler {
  return async (req, params) => {
    const who = await caller(req);
    if (!who) return json({ detail: "not signed in" }, 401);
    try {
      let role: Role;
      let perms: Perm[] = [];
      if (who.via === "session") {
        const a = await accessOf(run, who.email);
        if (!a) return json({ detail: "not signed in" }, 401);
        ({ role, perms } = a);
      } else {
        role = who.via === "dev" || accessAdmin(who.email) ? "admin" : "user";
      }
      const allowed = role === "admin" || (!opts.admin && (!opts.perm || perms.includes(opts.perm)));
      if (!allowed) return json({ detail: "administrators only" }, 403);
      return json(await handler({ req, email: who.email, role, perms, run, params }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ detail: e.message }, e.status);
  console.error("api error", e instanceof Error ? e.message : e);
  return json({ detail: "data unavailable" }, 502);
}

/** Origins allowed to call this API from a browser (the frontend host, and localhost while developing). */
export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
}

/**
 * CORS for the separate frontend. Credentials are allowed so the HttpOnly session cookie travels with each call; that
 * requires naming the exact origin, never "*".
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
