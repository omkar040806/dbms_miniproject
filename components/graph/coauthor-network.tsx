"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { GraphLegend, NetworkGraph } from "@/components/graph/network-graph";
import { Card, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { useApi } from "@/lib/client/use-api";
import type { GraphData } from "@/lib/graph/queries";

const HOP_GROUPS = ["This author", "Co-author", "Co-author of co-author"];

/** Two-hop co-author network from Neo4j, shown on researcher profiles. */
export function CoauthorNetwork({ authorId }: { authorId: number }) {
  const router = useRouter();
  const { data, error } = useApi<GraphData>(`/api/graph/coauthors/${authorId}`);

  const nodes = useMemo(
    () =>
      (data?.nodes ?? []).map((n) => ({
        id: n.id,
        label: n.name ?? "",
        group: HOP_GROUPS[n.hop ?? 2],
        size: n.hop === 0 ? 8 : n.hop === 1 ? 3 : 1,
      })),
    [data],
  );

  if (error) return <Notice tone="warn">Co-author network unavailable: {error}</Notice>;
  if (!data) return null;

  return (
    <Card>
      <CardTitle>Co-author network</CardTitle>
      <p className="mb-3 text-xs text-muted">From Neo4j: CO_AUTHORED edges up to two hops away. Click a person to open their profile.</p>
      {data.nodes.length <= 1 ? (
        <p className="text-sm text-muted">No co-authors in the graph yet.</p>
      ) : (
        <>
          <NetworkGraph nodes={nodes} links={data.links} height={380} onNodeClick={(node) => router.push(`/authors/${node.id}`)} />
          <GraphLegend groups={HOP_GROUPS} />
        </>
      )}
    </Card>
  );
}
