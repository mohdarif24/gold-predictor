import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache or image optimisation: every page is client-rendered and all data comes from /api/*.
export default defineCloudflareConfig();
