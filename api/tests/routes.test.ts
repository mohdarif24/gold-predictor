import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { corsHeaders } from "../src/lib/http";
import { ROUTES, match } from "../src/routes";

const FRONT = "https://gold-predictor.example.workers.dev";

beforeAll(() => {
  vi.stubEnv("ALLOWED_ORIGINS", `${FRONT}, http://localhost:3000/`);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEV_USER_EMAIL", "");
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
});
afterAll(() => vi.unstubAllEnvs());

const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://api.example.workers.dev${path}`, init));

describe("router", () => {
  it("matches exact paths and named parameters, and tells a wrong method from a missing path", () => {
    const m = match("GET", "/api/logs/xauusd_yf");
    expect(m).toMatchObject({ params: { name: "xauusd_yf" } });
    expect(match("GET", "/api/admin/users/")).not.toBeNull();
    expect(match("DELETE", "/api/me")).toBe("method");
    expect(match("GET", "/api/nope")).toBeNull();
    expect(match("GET", "/api/logs/")).toBeNull();
  });

  it("labels every admin path as admin-only and every other path sensibly", () => {
    for (const [, path, access] of ROUTES) {
      if (path.startsWith("/api/admin/")) expect(access).toBe("admin");
      if (["/api/login", "/api/logout", "/api/health"].includes(path)) expect(access).toBe("open");
    }
  });

  it("has every endpoint the frontend uses", () => {
    const paths = new Set(ROUTES.map(([m, p]) => `${m} ${p}`));
    for (const need of ["POST /api/login", "POST /api/logout", "GET /api/me", "GET /api/public/:name", "GET /api/logs/:name",
      "PATCH /api/admin/users", "POST /api/admin/settings/test", "GET /api/admin/api-logs", "PUT /api/me/alerts"]) {
      expect(paths.has(need)).toBe(true);
    }
  });
});

describe("CORS and origins", () => {
  it("names only listed origins and allows the session cookie", () => {
    expect(corsHeaders(FRONT)).toMatchObject({ "Access-Control-Allow-Origin": FRONT, "Access-Control-Allow-Credentials": "true" });
    expect(corsHeaders("http://localhost:3000")["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(corsHeaders("https://evil.example")).toEqual({});
    expect(corsHeaders(null)).toEqual({});
  });

  it("answers the browser's preflight for the frontend only", async () => {
    const ok = await call("/api/admin/users", { method: "OPTIONS", headers: { Origin: FRONT } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(FRONT);
    const bad = await call("/api/admin/users", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("refuses changes sent from another site before touching anything", async () => {
    const r = await call("/api/logout", { method: "POST", headers: { Origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("requires sign-in, and returns clean JSON errors", async () => {
    const me = await call("/api/me", { headers: { Origin: FRONT } });
    expect(me.status).toBe(401);
    expect(me.headers.get("Access-Control-Allow-Origin")).toBe(FRONT);
    expect(await me.json()).toEqual({ detail: "not signed in" });
    expect((await call("/api/nope")).status).toBe(404);
    expect((await call("/api/me", { method: "DELETE", headers: { Origin: FRONT } })).status).toBe(405);
    expect((await call("/api/health")).status).toBe(200);
  });

  it("logs out by expiring the HttpOnly cookie", async () => {
    const r = await call("/api/logout", { method: "POST", headers: { Origin: FRONT } });
    expect(r.headers.get("Set-Cookie")).toMatch(/^gp_session=; HttpOnly; Path=\/; Max-Age=0; SameSite=Lax; Secure$/);
  });
});
