"use client";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { canSee, useMe } from "@/lib/role";
import { Notice, Skeleton } from "./ui";

/**
 * Hides a super-admin screen from everyone else; with `perm`, also shows it to clients who were given that page.
 * The data behind it is refused by the API as well (403).
 */
export function AdminOnly({ children, perm }: { children: ReactNode; perm?: string }) {
  const { t } = useT();
  const me = useMe();
  if (me.loading) return <Skeleton className="h-40" />;
  if (!canSee(me.data, perm)) return <Notice>{t("admin.only")}</Notice>;
  return <>{children}</>;
}
