"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/client/use-api";
import type { Recommendation } from "@/lib/graph/queries";
import { truncate } from "@/lib/utils";

/** Suggestions from citation patterns around the papers in the user's library. */
export function GraphRecommendations() {
  const { data, error } = useApi<{ basedOn: number; recommendations: Recommendation[] }>("/api/graph/recommendations");
  if (error || !data || data.basedOn === 0) return null;

  return (
    <Card>
      <CardTitle>Recommended from the citation graph</CardTitle>
      <p className="mb-3 text-xs text-muted">Based on {data.basedOn} saved paper(s), using Neo4j citation and co-citation patterns.</p>
      {data.recommendations.length === 0 ? (
        <p className="text-sm text-muted">No suggestions yet. Save papers that cite or are cited by others.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.recommendations.map((rec) => (
            <li key={rec.paper_id}>
              <Link href={`/papers/${rec.paper_id}`} className="font-medium hover:text-accent">
                {truncate(rec.title, 80)}
              </Link>
              <p className="text-xs text-muted">
                {rec.year} · {rec.reason}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
