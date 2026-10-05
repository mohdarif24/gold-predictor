import { secured } from "@/lib/http";

export const GET = secured(async ({ email }) => ({ email }));
