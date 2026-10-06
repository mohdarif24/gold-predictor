import { NextResponse } from "next/server";
import { caller } from "./access";
import { run } from "./db";
import { HttpError, type Run, roleOf } from "./queries";

export type Role = "admin" | "user";

/** Administrators by Cloudflare Access email (only used when Access is the way in). */
function accessAdmin(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim()).filter(Boolean).includes(email);
}

/**
 * Wraps an API handler: checks the sign-in and the role, turns errors into clean JSON.
 * A session is only as good as the access code behind it, so the role is re-read on every request: revoking a code or
 * changing a role takes effect at once.
 */
export function secured<A extends unknown[]>(
  handler: (ctx: { req: Request; email: string; role: Role; run: Run }, ...args: A) => Promise<unknown>,
  opts: { admin?: boolean } = {},
) {
  return async (req: Request, ...args: A) => {
    const who = await caller(req);
    if (!who) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
    try {
      let role: Role;
      if (who.via === "session") {
        const r = await roleOf(run, who.email);
        if (!r) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
        role = r;
      } else {
        role = who.via === "dev" || accessAdmin(who.email) ? "admin" : "user";
      }
      if (opts.admin && role !== "admin") return NextResponse.json({ detail: "administrators only" }, { status: 403 });
      return NextResponse.json(await handler({ req, email: who.email, role, run }, ...args), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ detail: e.message }, { status: e.status });
      console.error("api error", e instanceof Error ? e.message : e);
      return NextResponse.json({ detail: "data unavailable" }, { status: 502 });
    }
  };
}

export type NameCtx = { params: Promise<{ name: string }> };
