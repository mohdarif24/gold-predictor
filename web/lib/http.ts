import { NextResponse } from "next/server";
import { caller } from "./access";
import { run } from "./db";
import { HttpError, type Perm, type Run, accessOf } from "./queries";

export type Role = "admin" | "user";

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
export function secured<A extends unknown[]>(
  handler: (ctx: { req: Request; email: string; role: Role; perms: Perm[]; run: Run }, ...args: A) => Promise<unknown>,
  opts: { admin?: boolean; perm?: Perm } = {},
) {
  return async (req: Request, ...args: A) => {
    const who = await caller(req);
    if (!who) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
    try {
      let role: Role;
      let perms: Perm[] = [];
      if (who.via === "session") {
        const a = await accessOf(run, who.email);
        if (!a) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
        ({ role, perms } = a);
      } else {
        role = who.via === "dev" || accessAdmin(who.email) ? "admin" : "user";
      }
      const allowed = role === "admin" || (!opts.admin && (!opts.perm || perms.includes(opts.perm)));
      if (!allowed) return NextResponse.json({ detail: "administrators only" }, { status: 403 });
      return NextResponse.json(await handler({ req, email: who.email, role, perms, run }, ...args), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ detail: e.message }, { status: e.status });
      console.error("api error", e instanceof Error ? e.message : e);
      return NextResponse.json({ detail: "data unavailable" }, { status: 502 });
    }
  };
}

export type NameCtx = { params: Promise<{ name: string }> };
