"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PaperCard } from "@/components/paper-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { CollectionRow } from "@/lib/db/queries/library";
import type { PaperSummary } from "@/lib/types";

interface CollectionData {
  collection: CollectionRow & { owner_name: string };
  papers: PaperSummary[];
  isOwner: boolean;
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<CollectionData>(`/api/collections/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setActionError(null);
    try {
      await action();
      if (after) after();
      else reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <EmptyState title="Collection not found">{error}</EmptyState>;
  const { collection, papers, isOwner } = data;

  return (
    <>
      <PageHeader
        title={collection.name}
        description={
          <>
            {collection.description ? `${collection.description} · ` : ""}by {collection.owner_name}{" "}
            {collection.is_public ? <Badge tone="ok">public</Badge> : <Badge>private</Badge>}
          </>
        }
        actions={
          isOwner ? (
            <>
              <Button
                variant="secondary"
                onClick={() => run(() => apiFetch(`/api/collections/${id}`, { method: "PATCH", body: JSON.stringify({ isPublic: !collection.is_public }) }))}
              >
                Make {collection.is_public ? "private" : "public"}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm("Delete this collection? Papers stay in the platform.")) {
                    void run(() => apiFetch(`/api/collections/${id}`, { method: "DELETE" }), () => router.push("/library"));
                  }
                }}
              >
                Delete
              </Button>
            </>
          ) : null
        }
      />
      {actionError ? <Notice tone="danger" className="mb-4">{actionError}</Notice> : null}
      {papers.length === 0 ? (
        <EmptyState title="This collection is empty">Add papers from any paper page.</EmptyState>
      ) : (
        <div className="space-y-3">
          {papers.map((paper) => (
            <PaperCard
              key={paper.paper_id}
              paper={paper}
              extra={
                isOwner ? (
                  <Button size="sm" variant="ghost" onClick={() => run(() => apiFetch(`/api/collections/${id}/papers/${paper.paper_id}`, { method: "DELETE" }))}>
                    Remove from collection
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
