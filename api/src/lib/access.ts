import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Who is calling? Two ways in, checked on every API request:
 *  1. Cloudflare Access (if CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set): Access signs a JWT per request and we
 *     verify it ourselves (signature, issuer, audience), so data stays private even on the raw *.workers.dev address.
 *  2. An access code (scripts/access_code.py): signing in sets an HttpOnly session cookie signed with SESSION_SECRET.
 *     The API also re-checks that the person's code still exists, so revoking a code locks them out at once.
 */
export const SESSION_COOKIE = "gp_session";
export const SESSION_DAYS = 30;
const ISSUER = "gold-predictor";

export type Caller = { email: string; via: "access" | "session" | "dev" };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function sessionKey(): Uint8Array | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? new TextEncoder().encode(s) : null;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** SHA-256 of an access code, hex: the same as hashlib.sha256(code).hexdigest() in the Python script. */
export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(email: string): Promise<string | null> {
  const key = sessionKey();
  if (!key) return null;
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

async function fromAccess(req: Request): Promise<string | null> {
  const team = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!team || !aud || !token) return null;
  try {
    jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: aud });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function fromSession(req: Request): Promise<string | null> {
  const key = sessionKey();
  const token = readCookie(req, SESSION_COOKIE);
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ["HS256"] });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The local-development shortcut only ever applies to requests addressed to this computer. */
function isLocal(req: Request): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(req.url).hostname);
}

export async function caller(req: Request): Promise<Caller | null> {
  const dev = process.env.DEV_USER_EMAIL;
  if (dev && process.env.NODE_ENV !== "production" && isLocal(req)) return { email: dev.toLowerCase(), via: "dev" };
  const a = await fromAccess(req);
  if (a) return { email: a, via: "access" };
  const s = await fromSession(req);
  return s ? { email: s, via: "session" } : null;
}

export async function userEmail(req: Request): Promise<string | null> {
  return (await caller(req))?.email ?? null;
}
