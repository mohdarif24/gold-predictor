import { type NameCtx, secured } from "@/lib/http";
import { getPublicSignal } from "@/lib/queries";

/** The plain signal every signed-in person may see. */
export const GET = secured(async ({ run }, ctx: NameCtx) => getPublicSignal(run, (await ctx.params).name));
