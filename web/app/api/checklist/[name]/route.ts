import { type NameCtx, secured } from "@/lib/http";
import { getChecklist } from "@/lib/queries";

export const GET = secured(async ({ run }, ctx: NameCtx) => getChecklist(run, (await ctx.params).name));
