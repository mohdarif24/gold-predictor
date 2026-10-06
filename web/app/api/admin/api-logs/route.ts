import { getApiLogs } from "@/lib/admin";
import { secured } from "@/lib/http";

export const GET = secured(async ({ req, run }) => {
  const q = new URL(req.url).searchParams;
  return getApiLogs(run, { limit: Number(q.get("limit") ?? 100), failed: q.get("failed") === "1" });
}, { admin: true });
