"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { GraphLegend, NetworkGraph, type NetworkNode } from "@/components/graph/network-graph";
import { PaperSearch } from "@/components/graph/paper-search";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { GraphData, GraphNode } from "@/lib/graph/queries";
import { truncate } from "@/lib/utils";

interface CompareResult {
  depth: number;
  sql: { reachable: number; paths_explored: number; ms: number; query: string };
  cypher: { reachable?: number; ms?: number; error?: string; query: string };
}

export function GraphExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const center = Number(searchParams.get("paper")) || null;
  const depth = Number(searchParams.get("depth")) || 2;

  const { data, error, loading } = useApi<GraphData & { center: number }>(center ? `/api/graph/citations/${center}?depth=${depth}` : null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [path, setPath] = useState<(GraphData & { found: boolean; to: string }) | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  function go(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    setSelected(null);
    setPath(null);
    setCompare(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  async function findPath(targetId: number, title: string) {
    if (!center) return;
    setPathError(null);
    try {
      const result = await apiFetch<GraphData & { found: boolean }>(`/api/graph/path?from=${center}&to=${targetId}`);
      setPath({ ...result, to: title });
    } catch (err) {
      setPathError(err instanceof Error ? err.message : "Path search failed");
    }
  }

  async function runCompare() {
    if (!center) return;
    setComparing(true);
    try {
      setCompare(await apiFetch<CompareResult>(`/api/graph/compare/${center}?depth=${depth}`));
    } finally {
      setComparing(false);
    }
  }

  const pathIds = useMemo(() => new Set(path?.nodes.map((n) => n.id) ?? []), [path]);
  const pathEdges = useMemo(() => new Set(path?.links.map((l) => `${l.source}-${l.target}`) ?? []), [path]);

  const nodes: NetworkNode[] = useMemo(
    () =>
      (data?.nodes ?? []).map((n) => ({
        id: n.id,
        label: `${n.title} (${n.year})`,
        group: n.domain ?? "Unknown",
        size: n.id === center ? 8 : 1 + Math.min(6, Math.log10((n.citations ?? 0) + 1)),
        highlight: pathIds.has(n.id),
      })),
    [data, center, pathIds],
  );
  const links = useMemo(
    () => (data?.links ?? []).map((l) => ({ ...l, highlight: pathEdges.has(`${l.source}-${l.target}`) })),
    [data, pathEdges],
  );
  const groups = useMemo(() => [...new Set(nodes.map((n) => n.group))].sort(), [nodes]);

  return (
    <>
      <PageHeader
        title="Citation graph"
        description="Explore how papers cite each other. Served by Neo4j with variable-length path queries."
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px]">
        <PaperSearch placeholder="Choose a paper to centre the graph on…" onPick={(paper) => go({ paper: String(paper.paper_id) })} />
        <Select value={depth} onChange={(e) => go({ depth: e.target.value })} aria-label="Hops">
          <option value={1}>1 hop</option>
          <option value={2}>2 hops</option>
          <option value={3}>3 hops</option>
        </Select>
      </div>

      {!center ? (
        <EmptyState title="Pick a paper to start">The graph shows every paper within the chosen number of citation hops.</EmptyState>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {center && loading && !data ? <Spinner label="Querying Neo4j…" /> : null}

      {data && center ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            {data.nodes.length <= 1 ? (
              <Notice tone="info">This paper has no citation links to other papers on the platform yet.</Notice>
            ) : null}
            <NetworkGraph
              nodes={nodes}
              links={links}
              directed
              onNodeClick={(node) => setSelected(data.nodes.find((n) => n.id === node.id) ?? null)}
            />
            <GraphLegend groups={groups} />
            <p className="mt-1 text-xs text-muted">
              {data.nodes.length} papers · {data.links.length} citations · arrows point from citing to cited paper · node size grows with citations
            </p>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardTitle>Selected paper</CardTitle>
              {selected ? (
                <div className="mt-2 space-y-2 text-sm">
                  <p className="font-medium">{selected.title}</p>
                  <p className="text-muted">
                    {selected.year} · {selected.domain} · {selected.citations ?? 0} citations
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/papers/${selected.id}`} className="text-accent underline">
                      Open paper
                    </Link>
                    {selected.id !== center ? (
                      <>
                        <button type="button" className="text-accent underline" onClick={() => go({ paper: String(selected.id) })}>
                          Centre here
                        </button>
                        <button type="button" className="text-accent underline" onClick={() => findPath(selected.id, selected.title ?? "")}>
                          Shortest path to it
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">Click a node to see details.</p>
              )}
            </Card>

            <Card>
              <CardTitle>Shortest citation path</CardTitle>
              <p className="mb-2 mt-1 text-xs text-muted">Neo4j shortestPath() over CITES edges, in either direction, up to 8 hops.</p>
              <PaperSearch placeholder="Find path to another paper…" onPick={(paper) => findPath(paper.paper_id, paper.title)} />
              {pathError ? <Notice tone="danger" className="mt-2">{pathError}</Notice> : null}
              {path ? (
                path.found ? (
                  <ol className="mt-3 space-y-1 text-sm">
                    {path.nodes.map((node, index) => (
                      <li key={node.id}>
                        <span className="text-muted">{index + 1}.</span>{" "}
                        <Link href={`/papers/${node.id}`} className="hover:text-accent">
                          {truncate(node.title, 60)}
                        </Link>{" "}
                        <span className="text-muted">({node.year})</span>
                      </li>
                    ))}
                    <li className="pt-1 text-xs text-muted">{path.links.length} hop(s), highlighted in orange where visible</li>
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-muted">No citation path to “{truncate(path.to, 50)}” within 8 hops.</p>
                )
              ) : null}
            </Card>

            <Card>
              <CardTitle>SQL vs Cypher</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Count papers within {depth} hop(s) using a PostgreSQL recursive CTE and a Neo4j pattern.
              </p>
              <Button size="sm" variant="secondary" className="mt-3" disabled={comparing} onClick={runCompare}>
                {comparing ? "Running…" : "Run both"}
              </Button>
              {compare ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="font-medium">
                      PostgreSQL: {compare.sql.reachable} papers in {compare.sql.ms} ms
                    </p>
                    <p className="text-xs text-muted">{compare.sql.paths_explored} paths expanded</p>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-paper p-2 text-[11px] leading-snug">{compare.sql.query}</pre>
                  </div>
                  <div>
                    <p className="font-medium">
                      Neo4j: {compare.cypher.error ? compare.cypher.error : `${compare.cypher.reachable} papers in ${compare.cypher.ms} ms`}
                    </p>
                    <pre className="mt-1 overflow-auto rounded bg-paper p-2 text-[11px] leading-snug">{compare.cypher.query}</pre>
                  </div>
                </div>
              ) : null}
            </Card>
          </aside>
        </div>
      ) : null}
    </>
  );
}
