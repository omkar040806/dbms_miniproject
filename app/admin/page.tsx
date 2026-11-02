"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminNav } from "@/components/admin-nav";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { ReviewItem } from "@/lib/db/queries/admin";
import type { PaperStatus } from "@/lib/types";
import { cn, formatDate, truncate } from "@/lib/utils";

interface QueueData {
  papers: ReviewItem[];
  totals: Record<PaperStatus, number>;
}

const STATUSES: PaperStatus[] = ["pending", "approved", "rejected"];

function ReviewCard({ paper, onDone }: { paper: ReviewItem; onDone: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject" | "reopen" | "delete") {
    setBusy(true);
    setError(null);
    try {
      if (action === "delete") {
        if (!window.confirm("Delete this paper permanently?")) return;
        await apiFetch(`/api/admin/papers/${paper.paper_id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
      } else {
        const result = await apiFetch<{ warnings?: string[] }>(`/api/admin/papers/${paper.paper_id}/review`, {
          method: "POST",
          body: JSON.stringify({ action, reason }),
        });
        if (result.warnings?.length) {
          onDone(`"${truncate(paper.title, 60)}": ${action}d. Note: ${result.warnings.join(" ")}`);
          return;
        }
      }
      onDone(`"${truncate(paper.title, 60)}": ${action === "delete" ? "deleted" : `${action}d`}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusBadge status={paper.status} />
        <Badge tone="accent">{paper.domain_name}</Badge>
        <span>{paper.publication_year}</span>
        <span>· submitted {formatDate(paper.created_at)}</span>
        <span>· by {paper.uploader_name ? `${paper.uploader_name} (${paper.uploader_email})` : "import"}</span>
      </div>
      <h3 className="mt-2 font-serif text-lg font-semibold">
        <Link href={`/papers/${paper.paper_id}`} className="hover:text-accent">
          {paper.title}
        </Link>
      </h3>
      <p className="text-sm text-muted">{paper.author_names}</p>
      <p className="mt-2 text-sm">{truncate(paper.abstract, 400) || "No abstract."}</p>
      {error ? <Notice tone="danger" className="mt-3">{error}</Notice> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" className="h-8 max-w-sm" maxLength={1000} />
        {paper.status !== "approved" ? (
          <Button size="sm" disabled={busy} onClick={() => act("approve")}>
            Approve
          </Button>
        ) : null}
        {paper.status !== "rejected" ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act("reject")}>
            Reject
          </Button>
        ) : null}
        {paper.status !== "pending" ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act("reopen")}>
            Back to pending
          </Button>
        ) : null}
        <Button size="sm" variant="danger" disabled={busy} onClick={() => act("delete")}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

export default function AdminPage() {
  const [status, setStatus] = useState<PaperStatus>("pending");
  const [message, setMessage] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<QueueData>(`/api/admin/papers?status=${status}`);

  return (
    <>
      <PageHeader title="Administration" description="Review submissions, manage users and inspect the audit trail." />
      <AdminNav />
      {message ? <Notice tone="ok" className="mb-4">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="mb-4 flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn("rounded-full border px-3 py-1 text-sm capitalize", status === s ? "border-accent bg-accent text-white" : "border-line bg-card")}
          >
            {s} ({data?.totals[s]?.toLocaleString("en-IN") ?? "…"})
          </button>
        ))}
      </div>

      {loading && !data ? <Spinner /> : null}
      {data && data.papers.length === 0 ? <EmptyState title={`No ${status} papers`}>Nothing to review right now.</EmptyState> : null}
      <div className="space-y-3">
        {data?.papers.map((paper) => (
          <ReviewCard
            key={paper.paper_id}
            paper={paper}
            onDone={(text) => {
              setMessage(text);
              reload();
            }}
          />
        ))}
      </div>
      {status !== "pending" && data && data.papers.length === 50 ? <p className="mt-3 text-xs text-muted">Showing the 50 most recently updated.</p> : null}
    </>
  );
}
