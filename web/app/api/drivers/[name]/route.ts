import { type NameCtx, secured } from "@/lib/http";
import { getDrivers } from "@/lib/queries";

export const GET = secured(async ({ run }, ctx: NameCtx) => getDrivers(run, (await ctx.params).name));
