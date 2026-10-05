import { type NameCtx, secured } from "@/lib/http";
import { getHistory } from "@/lib/queries";

export const GET = secured(async ({ req, run }, ctx: NameCtx) =>
  getHistory(run, (await ctx.params).name, Number(new URL(req.url).searchParams.get("limit") ?? 100)),
);
