import { getLlmSettings, putLlmSettings } from "@/lib/admin";
import { secured } from "@/lib/http";
import { HttpError } from "@/lib/queries";

export const GET = secured(async ({ run }) => getLlmSettings(run), { admin: true });

export const PUT = secured(async ({ req, run, email }) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new HttpError(400, "send the settings as JSON");
  return putLlmSettings(run, email, {
    url: typeof body.url === "string" ? body.url : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    key: typeof body.key === "string" ? body.key : undefined,
    clear_key: body.clear_key === true,
  });
}, { admin: true });
