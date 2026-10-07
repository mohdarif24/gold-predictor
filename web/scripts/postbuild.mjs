// Runs after `next build` (static export into out/):
//  1. out/_headers: security headers for the static frontend. The page talks to exactly one other place, the API, so
//     connect-src names that origin. Next.js needs inline scripts and styles for its own bootstrap.
//  2. Prefetch files: the export writes them nested (logs/__next.X/logs/__PAGE__.txt) but the browser asks for a flat
//     name (logs/__next.X.logs.__PAGE__.txt). A copy under the flat name stops the 404s on every navigation.
import { copyFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out", import.meta.url));

const api = process.env.NEXT_PUBLIC_API_URL;
if (!api) {
  console.error("NEXT_PUBLIC_API_URL is not set: the frontend would not know where the API is.");
  process.exit(1);
}
const apiOrigin = new URL(api).origin;

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

writeFileSync(
  join(OUT, "_headers"),
  [
    "/*",
    `  Content-Security-Policy: ${csp}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
    "  Strict-Transport-Security: max-age=63072000; includeSubDomains",
    "",
  ].join("\n"),
);

const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
let copies = 0;
function flatten(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const f of files(p)) {
        copyFileSync(f, join(dir, `${name}.${relative(p, f).split(/[\\/]/).join(".")}`));
        copies++;
      }
    } else if (name !== "_next") {
      flatten(p);
    }
  }
}
flatten(OUT);
console.log(`postbuild: out/_headers written (API: ${apiOrigin}); ${copies} prefetch files copied to their flat names`);
