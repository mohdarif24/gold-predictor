import type { NextConfig } from "next";

// The frontend is a static site (every page is client-rendered; all data comes from the separate API in ../api).
// `next build` writes plain files to out/, which a Cloudflare Worker serves as static assets. Security headers for
// those files are written to out/_headers by scripts/write-headers.mjs, because static exports cannot set headers here.
const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
