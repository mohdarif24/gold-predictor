import { type NameCtx, secured } from "@/lib/http";
import { getPerformance } from "@/lib/queries";

export const GET = secured(async ({ run }, ctx: NameCtx) => getPerformance(run, (await ctx.params).name));
