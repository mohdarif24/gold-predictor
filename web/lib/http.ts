import { NextResponse } from "next/server";
import { userEmail } from "./access";
import { run } from "./db";
import { HttpError, type Run } from "./queries";

/** Wraps an API handler: checks the Cloudflare Access login, turns errors into clean JSON responses. */
export function secured<A extends unknown[]>(
  handler: (ctx: { req: Request; email: string; run: Run }, ...args: A) => Promise<unknown>,
) {
  return async (req: Request, ...args: A) => {
    const email = await userEmail(req);
    if (!email) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
    try {
      return NextResponse.json(await handler({ req, email, run }, ...args), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ detail: e.message }, { status: e.status });
      console.error("api error", e instanceof Error ? e.message : e);
      return NextResponse.json({ detail: "data unavailable" }, { status: 502 });
    }
  };
}

export type NameCtx = { params: Promise<{ name: string }> };
