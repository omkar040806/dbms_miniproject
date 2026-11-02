"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { MyPaper } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function MyPapersPage() {
  const { data, error, loading, reload } = useApi<{ papers: MyPaper[] }>("/api/my/papers");
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(paperId: number) {
    if (!window.confirm("Delete this submission?")) return;
    setActionError(null);
    try {
      await apiFetch(`/api/papers/${paperId}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <PageHeader title="My uploads" description="Papers you submitted and their review status." actions={<LinkButton href="/upload">Upload a paper</LinkButton>} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {actionError ? <Notice tone="danger" className="mb-4">{actionError}</Notice> : null}
      {loading && !data ? <Spinner /> : null}
      {data && data.papers.length === 0 ? <EmptyState title="No uploads yet">Submit your first paper for review.</EmptyState> : null}
      {data && data.papers.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.papers.map((paper) => (
                <tr key={paper.paper_id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/papers/${paper.paper_id}`} className="font-medium hover:text-accent">
                      {paper.title}
                    </Link>
                    {paper.status === "rejected" && paper.last_reason ? (
                      <p className="mt-1 text-xs text-danger">Reason: {paper.last_reason}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">{paper.domain_name}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(paper.created_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={paper.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {paper.status !== "approved" ? (
                      <Button variant="ghost" size="sm" onClick={() => remove(paper.paper_id)}>
                        Delete
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  );
}
