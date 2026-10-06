"use client";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useMe } from "@/lib/role";
import { Notice, Skeleton } from "./ui";

/** Hides an administrator screen from everyone else. The data behind it is also refused by the API (403). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useT();
  const me = useMe();
  if (me.loading) return <Skeleton className="h-40" />;
  if (me.data?.role !== "admin") return <Notice>{t("admin.only")}</Notice>;
  return <>{children}</>;
}
