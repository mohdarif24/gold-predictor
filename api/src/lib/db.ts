import { neon } from "@neondatabase/serverless";
import type { Run } from "./queries";

/** Production binding: Neon over HTTPS (works inside Cloudflare Workers; no TCP pool to manage). */
export const run: Run = async <T,>(text: string, params: unknown[] = []) => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (await neon(url).query(text, params)) as T[];
};
