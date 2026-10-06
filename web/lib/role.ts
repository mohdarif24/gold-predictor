"use client";
import { useApi } from "./api";

export type Me = { email: string; role: "admin" | "user" };

export function useMe() {
  return useApi<Me>("me");
}
