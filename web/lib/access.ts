import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Who is calling? Cloudflare Access signs a JWT for every request that passed its login. We verify that token
 * ourselves (signature, issuer, audience) so the data stays private even if someone reaches the raw *.workers.dev
 * address that Access does not cover. Set CF_ACCESS_TEAM_DOMAIN (e.g. myteam.cloudflareaccess.com) and CF_ACCESS_AUD.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function userEmail(req: Request): Promise<string | null> {
  const dev = process.env.DEV_USER_EMAIL;
  if (dev && process.env.NODE_ENV !== "production") return dev.toLowerCase();

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
