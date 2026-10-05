import { type NameCtx, secured } from "@/lib/http";
import { getCandles } from "@/lib/queries";

export const GET = secured(async ({ req, run }, ctx: NameCtx) => {
  const q = new URL(req.url).searchParams;
  return getCandles(run, (await ctx.params).name, q.get("tf") ?? "D1", Number(q.get("limit") ?? 250));
});
