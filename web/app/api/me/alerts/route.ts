import { secured } from "@/lib/http";
import { HttpError, getAlerts, putAlerts } from "@/lib/queries";

export const GET = secured(async ({ email, run }) => getAlerts(run, email));

export const PUT = secured(async ({ req, email, run }) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid request");
  return putAlerts(run, email, body);
});
