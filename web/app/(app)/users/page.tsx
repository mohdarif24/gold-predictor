"use client";
import { useState } from "react";
import { AdminOnly } from "@/components/AdminOnly";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { type AdminUser, ApiError, apiFetch, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

function UsersInner() {
  const { t, lang, num } = useT();
  const list = useApi<AdminUser[]>("admin/users");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [logs, setLogs] = useState(false);
  const [made, setMade] = useState<{ email: string; code: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (ex: unknown) => setErr(ex instanceof ApiError ? ex.message : t("error.generic"));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setMade(null);
    try {
      setMade(await apiFetch<{ email: string; code: string }>("admin/users", { method: "POST", body: JSON.stringify({ email, role, perms: logs ? ["logs"] : [] }) }));
      setEmail("");
      list.reload();
    } catch (ex) {
      fail(ex);
    }
    setBusy(false);
  }

  async function setPerm(u: AdminUser, perm: string, on: boolean) {
    setErr("");
    const perms = on ? [...new Set([...u.perms, perm])] : u.perms.filter((p) => p !== perm);
    try {
      await apiFetch("admin/users", { method: "PATCH", body: JSON.stringify({ email: u.email, perms }) });
      list.reload();
    } catch (ex) {
      fail(ex);
    }
  }

  async function revoke(who: string) {
    setErr("");
    try {
      await apiFetch("admin/users", { method: "DELETE", body: JSON.stringify({ email: who }) });
      list.reload();
    } catch (ex) {
      fail(ex);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle title={t("users.title")} sub={t("users.sub")} />
      <Card>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor="email" className="mb-1 block text-sm font-medium">{t("login.email")}</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
          </div>
          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium">{t("users.role")}</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")} className="rounded-lg border border-line bg-bg px-3 py-2">
              <option value="user">{t("users.role.user")}</option>
              <option value="admin">{t("users.role.admin")}</option>
            </select>
          </div>
          <button type="submit" disabled={busy} className="rounded-lg bg-brass px-4 py-2 font-semibold text-bg disabled:opacity-60">
            {t("users.add")}
          </button>
          {role === "user" ? (
            <label className="flex basis-full items-center gap-2 text-sm">
              <input type="checkbox" checked={logs} onChange={(e) => setLogs(e.target.checked)} className="h-4 w-4" />
              {t("users.perm.logs")}
            </label>
          ) : null}
        </form>
        {made ? (
          <div role="status" className="mt-4 rounded-lg border border-buy bg-buy-soft p-3 text-sm">
            <p>{t("users.made", { email: made.email })}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="select-all break-all rounded bg-surface px-2 py-1 font-mono text-base">{made.code}</code>
              <button type="button" className="rounded border border-line bg-surface px-2 py-1 text-xs"
                onClick={() => navigator.clipboard?.writeText(made.code).catch(() => null)}>
                {t("users.copy")}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">{t("users.once")}</p>
          </div>
        ) : null}
        {err ? <p role="alert" className="mt-3 text-sm text-sell">{err}</p> : null}
      </Card>

      {list.error ? <ErrorNotice message={list.error} onRetry={list.reload} /> : null}
      {list.loading ? <Skeleton className="h-40" /> : null}
      {list.data ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">{t("login.email")}</th>
                  <th className="px-5 py-3 font-medium">{t("users.role")}</th>
                  <th className="px-5 py-3 font-medium">{t("nav.logs")}</th>
                  <th className="px-5 py-3 font-medium">{t("users.lastused")}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.data.map((u) => (
                  <tr key={u.email} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 break-all">{u.email}</td>
                    <td className={`px-5 py-3 ${u.role === "admin" ? "font-semibold text-brass" : ""}`}>
                      {u.role === "admin" ? t("users.role.admin") : t("users.role.user")}
                    </td>
                    <td className="px-5 py-3">
                      {u.role === "admin" ? (
                        <span className="text-xs text-muted">{t("users.perm.always")}</span>
                      ) : (
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={u.perms.includes("logs")} onChange={(e) => setPerm(u, "logs", e.target.checked)}
                            className="h-4 w-4" aria-label={`${t("users.perm.logs")}: ${u.email}`} />
                          <span className="text-xs">{u.perms.includes("logs") ? t("users.perm.on") : t("users.perm.off")}</span>
                        </label>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">{u.last_used ? num(fmtDateTime(u.last_used, lang)) : "-"}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => revoke(u.email)} className="rounded border border-line px-2 py-1 text-xs text-sell">
                        {t("users.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default function UsersPage() {
  return (
    <AdminOnly>
      <UsersInner />
    </AdminOnly>
  );
}
