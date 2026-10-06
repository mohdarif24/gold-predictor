import { hashCode } from "@/lib/access";
import { secured } from "@/lib/http";
import { HttpError } from "@/lib/queries";

/** 22 random URL-safe characters (~128 bits), the same shape as scripts/access_code.py makes. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = secured(
  async ({ run }) => run("SELECT email, role, created, last_used FROM access_codes ORDER BY role, email"),
  { admin: true },
);

/** Create a person (or give an existing person a new code). The code is returned once and never stored in plain text. */
export const POST = secured(async ({ req, run }) => {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = body?.role === "admin" ? "admin" : "user";
  if (!EMAIL.test(email)) throw new HttpError(400, "enter a valid email");
  const code = newCode();
  await run(
    "INSERT INTO access_codes(email, code_hash, created, role) VALUES($1, $2, $3, $4) " +
      "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, created = excluded.created, last_used = NULL, role = excluded.role",
    [email, await hashCode(code), new Date().toISOString().slice(0, 19) + "+00:00", role],
  );
  return { email, role, code };
}, { admin: true });

/** Take access away at once. You cannot remove yourself, so the site never ends up without an administrator by accident. */
export const DELETE = secured(async ({ req, run, email: me }) => {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (email === me) throw new HttpError(400, "you cannot remove your own access");
  const rows = await run("DELETE FROM access_codes WHERE email = $1 RETURNING email", [email]);
  if (!rows.length) throw new HttpError(404, "no such person");
  return { ok: true };
}, { admin: true });
