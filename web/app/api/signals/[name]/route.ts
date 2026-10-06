import { type NameCtx, secured } from "@/lib/http";
import { getSignals } from "@/lib/queries";

export const GET = secured(async ({ run }, ctx: NameCtx) => getSignals(run, (await ctx.params).name), { admin: true });
