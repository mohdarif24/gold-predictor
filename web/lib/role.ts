"use client";
import { useApi } from "./api";

export type Me = { email: string; role: "admin" | "user"; perms: string[] };

export function useMe() {
  return useApi<Me>("me");
}

/** Super admin sees everything; a client sees a page only when the super admin switched it on for them. */
export function canSee(me: Me | undefined, perm?: string): boolean {
  if (!me) return false;
  return me.role === "admin" || (perm !== undefined && (me.perms ?? []).includes(perm));
}
