import { secured } from "@/lib/http";

export const GET = secured(async ({ email, role, perms }) => ({ email, role, perms }));
