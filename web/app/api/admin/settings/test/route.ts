import { testLlm } from "@/lib/admin";
import { secured } from "@/lib/http";

export const POST = secured(async ({ req, run }) => {
  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return testLlm(run, { url: str(body?.url), model: str(body?.model), key: str(body?.key) });
}, { admin: true });
