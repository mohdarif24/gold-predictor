/**
 * Gold Predictor API: the backend, deployed on its own Cloudflare Worker. The frontend (web/) is a separate static site
 * that calls this API from the browser. Bindings (DATABASE_URL, SESSION_SECRET, ...) reach the code as process.env
 * through the nodejs_compat flag.
 */
import { allowedOrigins, corsHeaders, errorResponse, json } from "./lib/http";
import { match } from "./routes";

const CHANGES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  // Changes from a page on another site are refused outright (defence in depth on top of the SameSite cookie).
  if (CHANGES.has(req.method) && origin && origin !== url.origin && !allowedOrigins().includes(origin)) {
    return json({ detail: "origin not allowed" }, 403);
  }
  if (url.pathname === "/" || url.pathname === "") return json({ service: "gold-predictor-api", docs: "/api/health" });
  const m = match(req.method, url.pathname);
  if (m === null) return json({ detail: "not found" }, 404);
  if (m === "method") return json({ detail: "method not allowed" }, 405);
  try {
    return await m.handler(req, m.params);
  } catch (e) {
    return errorResponse(e);
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    const res = await handle(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(corsHeaders(req.headers.get("Origin")))) out.headers.set(k, v);
    out.headers.set("X-Content-Type-Options", "nosniff");
    out.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    return out;
  },
};
