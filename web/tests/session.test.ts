import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, caller, createSession, hashCode, readCookie } from "../lib/access";
import * as q from "../lib/queries";

const SECRET = "x".repeat(40);
const req = (cookie?: string) => new Request("https://app.example.com/api/me", { headers: cookie ? { cookie } : {} });

beforeAll(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
  vi.stubEnv("CF_ACCESS_AUD", "");
});

describe("access-code sessions", () => {
  it("hashes codes exactly like the Python script (SHA-256 hex, trimmed)", async () => {
    expect(await hashCode(" abc ")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("accepts its own session cookie and lower-cases the email", async () => {
    const token = await createSession("Client@Example.com");
    expect(await caller(req(`other=1; ${SESSION_COOKIE}=${token}`))).toEqual({ email: "client@example.com", via: "session" });
  });

  it("rejects missing, tampered, foreign-key and expired sessions", async () => {
    expect(await caller(req())).toBeNull();
    const token = (await createSession("a@x.com"))!;
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "boss@x.com", iss: "gold-predictor" })).toString("base64url");
    expect(await caller(req(`${SESSION_COOKIE}=${h}.${forged}.${s}`))).toBeNull();
    const otherKey = await new SignJWT({ email: "a@x.com" }).setProtectedHeader({ alg: "HS256" }).setIssuer("gold-predictor")
      .setExpirationTime("1d").sign(new TextEncoder().encode("y".repeat(40)));
    expect(await caller(req(`${SESSION_COOKIE}=${otherKey}`))).toBeNull();
    const expired = await new SignJWT({ email: "a@x.com" }).setProtectedHeader({ alg: "HS256" }).setIssuer("gold-predictor")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(SECRET));
    expect(await caller(req(`${SESSION_COOKIE}=${expired}`))).toBeNull();
  });

  it("refuses to create or accept sessions when the server secret is missing or short", async () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(await createSession("a@x.com")).toBeNull();
    vi.stubEnv("SESSION_SECRET", SECRET);
  });

  it("reads cookies by exact name", () => {
    const r = req("gp_session_old=1; gp_session=abc%3D; z=2");
    expect(readCookie(r, "gp_session")).toBe("abc=");
    expect(readCookie(r, "missing")).toBeNull();
  });
});

describe("access codes in the database", () => {
  let run: q.Run;
  beforeAll(async () => {
    const db = new PGlite();
    await db.exec(readFileSync(new URL("./schema.pg.sql", import.meta.url), "utf8"));
    run = async (text, params = []) => (await db.query(text, params)).rows as never;
    await db.query("INSERT INTO access_codes(email, code_hash, created) VALUES($1, $2, 'now')", ["client@example.com", await hashCode("right-code-123456")]);
  });

  it("finds the person for a right code, records the sign-in, and refuses a wrong one", async () => {
    expect(await q.emailForCode(run, await hashCode("right-code-123456"), new Date("2026-10-07T10:00:00Z"))).toBe("client@example.com");
    expect((await run<{ last_used: string }>("SELECT last_used FROM access_codes"))[0].last_used).toBe("2026-10-07T10:00:00+00:00");
    expect(await q.emailForCode(run, await hashCode("wrong-code-123456"))).toBeNull();
  });

  it("knows when a code has been revoked", async () => {
    expect(await q.hasAccessCode(run, "client@example.com")).toBe(true);
    await run("DELETE FROM access_codes WHERE email = $1", ["client@example.com"]);
    expect(await q.hasAccessCode(run, "client@example.com")).toBe(false);
  });
});
