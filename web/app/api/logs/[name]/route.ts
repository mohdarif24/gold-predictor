import { type NameCtx, secured } from "@/lib/http";
import { getPredictionLog } from "@/lib/queries";

export const GET = secured(async ({ req, run }, ctx: NameCtx) => {
  const q = new URL(req.url).searchParams;
  return getPredictionLog(run, (await ctx.params).name, {
    horizon: q.get("horizon"), period: q.get("period"), status: q.get("status"), limit: Number(q.get("limit") ?? 100),
  });
}, { admin: true });
