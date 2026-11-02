"use client";

import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { useApi } from "@/lib/client/use-api";
import type { ModerationLogRow } from "@/lib/db/queries/admin";

const TONES: Record<string, "ok" | "danger" | "warn" | "neutral" | "accent"> = {
  approve: "ok",
  reject: "danger",
  delete: "danger",
  submit: "accent",
  reopen: "warn",
};

export default function AuditLogPage() {
  const { data, error, loading } = useApi<{ entries: ModerationLogRow[] }>("/api/admin/moderation-log");

  return (
    <>
      <PageHeader title="Administration" description="Every submission and moderation decision, recorded by database triggers." />
      <AdminNav />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !data ? <Spinner /> : null}
      {data && data.entries.length === 0 ? <EmptyState title="No activity yet" /> : null}
      {data && data.entries.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Paper</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.entries.map((entry) => (
                <tr key={entry.log_id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(entry.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONES[entry.action] ?? "neutral"}>{entry.action}</Badge>
                    {entry.old_status ? <span className="ml-1 text-xs text-muted">{entry.old_status} → {entry.new_status ?? "deleted"}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {entry.paper_id ? (
                      <Link href={`/papers/${entry.paper_id}`} className="hover:text-accent">
                        {entry.paper_title}
                      </Link>
                    ) : (
                      <span className="text-muted">{entry.paper_title} (deleted)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{entry.actor_name ?? "system"}</td>
                  <td className="px-4 py-3 text-muted">{entry.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
