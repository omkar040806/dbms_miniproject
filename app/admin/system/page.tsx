"use client";

import { useState } from "react";
import { AdminNav } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui/card";
import { Notice, Spinner } from "@/components/ui/feedback";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import { formatDate } from "@/lib/utils";

interface GraphStatus {
  queue: { pending: number; failed: number; processed: number; last_processed_at: string | null };
  graph: { papers: number; authors: number; citations: number; coauthorships: number } | null;
  graphError: string | null;
}

export default function SystemPage() {
  const { data, error, loading, reload } = useApi<GraphStatus>("/api/admin/graph");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  async function run(mode: "sync" | "rebuild") {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiFetch<Record<string, unknown>>(`/api/admin/graph?mode=${mode}`, { method: "POST" });
      setMessage({ tone: "ok", text: `${mode === "sync" ? "Sync" : "Rebuild"} finished: ${JSON.stringify(Object.values(result)[0])}` });
      reload();
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Administration" description="Keep the Neo4j graph in step with PostgreSQL." />
      <AdminNav />
      {message ? <Notice tone={message.tone} className="mb-4">{message.text}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !data ? <Spinner /> : null}
      {data ? (
        <div className="space-y-6">
          <Card>
            <CardTitle>Graph sync queue (PostgreSQL outbox)</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Triggers add a job whenever an approved paper, its authors or its citations change. Jobs are applied to Neo4j after each
              approval, or here on demand.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Pending" value={data.queue.pending} />
              <Stat label="Failed (5 tries)" value={data.queue.failed} />
              <Stat label="Processed" value={data.queue.processed.toLocaleString("en-IN")} />
              <Stat label="Last sync" value={data.queue.last_processed_at ? formatDate(data.queue.last_processed_at) : "never"} />
            </div>
            <div className="mt-4 flex gap-2">
              <Button disabled={busy} onClick={() => run("sync")}>
                Sync now
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run("rebuild")}>
                Rebuild whole graph
              </Button>
            </div>
          </Card>
          <Card>
            <CardTitle>Neo4j contents</CardTitle>
            {data.graph ? (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Paper nodes" value={data.graph.papers.toLocaleString("en-IN")} />
                <Stat label="Author nodes" value={data.graph.authors.toLocaleString("en-IN")} />
                <Stat label="CITES edges" value={data.graph.citations.toLocaleString("en-IN")} />
                <Stat label="CO_AUTHORED edges" value={data.graph.coauthorships.toLocaleString("en-IN")} />
              </div>
            ) : (
              <Notice tone="warn" className="mt-3">
                {data.graphError ?? "Neo4j is not reachable."}
              </Notice>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
