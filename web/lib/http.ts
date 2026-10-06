import { NextResponse } from "next/server";
import { caller } from "./access";
import { run } from "./db";
import { HttpError, type Run, hasAccessCode } from "./queries";

/** Wraps an API handler: checks the sign-in, turns errors into clean JSON responses. */
export function secured<A extends unknown[]>(
  handler: (ctx: { req: Request; email: string; run: Run }, ...args: A) => Promise<unknown>,
) {
  return async (req: Request, ...args: A) => {
    const who = await caller(req);
    if (!who) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
    try {
      // a session is only as good as the code behind it: a revoked code locks the person out at once
      if (who.via === "session" && !(await hasAccessCode(run, who.email))) {
        return NextResponse.json({ detail: "not signed in" }, { status: 401 });
      }
      return NextResponse.json(await handler({ req, email: who.email, run }, ...args), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ detail: e.message }, { status: e.status });
      console.error("api error", e instanceof Error ? e.message : e);
      return NextResponse.json({ detail: "data unavailable" }, { status: 502 });
    }
  };
}

export type NameCtx = { params: Promise<{ name: string }> };
