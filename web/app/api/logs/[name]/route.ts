import { type NameCtx, secured } from "@/lib/http";
import { getPredictionLog } from "@/lib/queries";

/** Super admin: everything. A client with the "logs" page: only what clients were shown, without the model's own number. */
export const GET = secured(async ({ req, run, role }, ctx: NameCtx) => {
  const q = new URL(req.url).searchParams;
  return getPredictionLog(run, (await ctx.params).name, {
    horizon: q.get("horizon"), period: q.get("period"), status: q.get("status"), limit: Number(q.get("limit") ?? 100),
    client: role !== "admin",
  });
}, { perm: "logs" });
