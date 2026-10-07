import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TEAM = "acme.cloudflareaccess.com";
const AUD = "app-audience-tag";

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let userEmail: (req: Request) => Promise<string | null>;

async function token(opts: { aud?: string; iss?: string; exp?: string; key?: CryptoKey; email?: unknown } = {}) {
  return new SignJWT({ email: "email" in opts ? opts.email : "Client@Example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.key ?? privateKey);
}

const req = (jwt?: string) => new Request("https://app.example.com/api/me", { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} });

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  // Cloudflare publishes its signing keys at /cdn-cgi/access/certs; serve our own test key there
  vi.stubGlobal("fetch", async (url: string | URL) => {
    expect(String(url)).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
  });
  vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", TEAM);
  vi.stubEnv("CF_ACCESS_AUD", AUD);
  vi.stubEnv("NODE_ENV", "production");
  ({ userEmail } = await import("../src/lib/access"));
});

afterEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEV_USER_EMAIL", "");
});

describe("Cloudflare Access token check", () => {
  it("accepts a valid token and lower-cases the email", async () => {
    expect(await userEmail(req(await token()))).toBe("client@example.com");
  });

  it("rejects a request with no token", async () => {
    expect(await userEmail(req())).toBeNull();
  });

  it("rejects a token for another application (wrong audience)", async () => {
    expect(await userEmail(req(await token({ aud: "someone-elses-app" })))).toBeNull();
  });

  it("rejects a token from another issuer", async () => {
    expect(await userEmail(req(await token({ iss: "https://evil.cloudflareaccess.com" })))).toBeNull();
  });

  it("rejects an expired token", async () => {
    expect(await userEmail(req(await token({ exp: "-1m" })))).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    expect(await userEmail(req(await token({ key: otherKey })))).toBeNull();
  });

  it("rejects a tampered token and garbage", async () => {
    const jwt = await token();
    const [h, , s] = jwt.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "boss@example.com", aud: AUD, iss: `https://${TEAM}` })).toString("base64url");
    expect(await userEmail(req(`${h}.${forged}.${s}`))).toBeNull();
    expect(await userEmail(req("not-a-jwt"))).toBeNull();
  });

  it("rejects a valid token that carries no email", async () => {
    expect(await userEmail(req(await token({ email: undefined })))).toBeNull();
  });

  it("ignores the DEV_USER_EMAIL shortcut in production", async () => {
    vi.stubEnv("DEV_USER_EMAIL", "attacker@example.com");
    expect(await userEmail(req())).toBeNull();
  });

  it("allows the DEV_USER_EMAIL shortcut outside production, and only on localhost", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_USER_EMAIL", "Dev@Example.com");
    expect(await userEmail(new Request("http://localhost:8787/api/me"))).toBe("dev@example.com");
    expect(await userEmail(req())).toBeNull(); // a public address never gets the shortcut, even if the variable leaks
  });

  it("fails closed when the Access settings are missing", async () => {
    vi.stubEnv("CF_ACCESS_AUD", "");
    expect(await userEmail(req(await token()))).toBeNull();
    vi.stubEnv("CF_ACCESS_AUD", AUD);
  });
});
