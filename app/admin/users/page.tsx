"use client";

import { useState } from "react";
import { AdminNav } from "@/components/admin-nav";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Notice, Spinner } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { apiFetch, toQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { AdminUserRow } from "@/lib/db/queries/admin";
import { formatDate } from "@/lib/utils";

export default function AdminUsersPage() {
  const { user: me } = useSession();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const { data, error, loading, reload } = useApi<{ users: AdminUserRow[] }>(`/api/admin/users${toQuery({ q: applied })}`);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  async function change(userId: number, changes: { role?: string; isActive?: boolean }) {
    setMessage(null);
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(changes) });
      setMessage({ tone: "ok", text: "User updated" });
      reload();
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Update failed" });
    }
  }

  return (
    <>
      <PageHeader title="Administration" description="Promote researchers to admin or deactivate accounts." />
      <AdminNav />
      <form
        className="mb-4 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search.trim());
        }}
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {message ? <Notice tone={message.tone} className="mb-4">{message.text}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !data ? <Spinner /> : null}
      {data ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Uploads</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.users.map((u) => {
                const isMe = u.user_id === me?.userId;
                return (
                  <tr key={u.user_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.full_name}{isMe ? " (you)" : ""}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={u.role} disabled={isMe} className="h-8 w-auto" onChange={(e) => change(u.user_id, { role: e.target.value })} aria-label="Role">
                        <option value="researcher">researcher</option>
                        <option value="admin">admin</option>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {u.uploads} ({u.approved_uploads} approved)
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-muted">{u.last_login_at ? formatDate(u.last_login_at) : "never"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={u.is_active ? "ok" : "danger"}>{u.is_active ? "active" : "deactivated"}</Badge>
                        {!isMe ? (
                          <Button size="sm" variant="ghost" onClick={() => change(u.user_id, { isActive: !u.is_active })}>
                            {u.is_active ? "Deactivate" : "Reactivate"}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
