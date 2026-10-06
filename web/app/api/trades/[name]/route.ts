import { type NameCtx, secured } from "@/lib/http";
import { getTrades } from "@/lib/queries";

export const GET = secured(
  async ({ req, run }, ctx: NameCtx) => getTrades(run, (await ctx.params).name, Number(new URL(req.url).searchParams.get("limit") ?? 50)),
  { admin: true },
);
