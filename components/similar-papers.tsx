"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/client/use-api";
import type { PaperSummary } from "@/lib/types";
import { truncate } from "@/lib/utils";

/** Papers whose embeddings are closest to this one (cosine similarity). */
export function SimilarPapers({ paperId }: { paperId: number }) {
  const { data } = useApi<{ papers: PaperSummary[] }>(`/api/papers/${paperId}/similar`);
  if (!data) return null;

  return (
    <Card>
      <CardTitle>Similar papers</CardTitle>
      <p className="mb-3 text-xs text-muted">Closest by meaning (vector similarity on title, abstract and keywords).</p>
      {data.papers.length === 0 ? (
        <p className="text-sm text-muted">No embedding yet for this paper.</p>
      ) : (
        <ul className="space-y-3">
          {data.papers.map((paper) => (
            <li key={paper.paper_id} className="text-sm">
              <Link href={`/papers/${paper.paper_id}`} className="font-medium hover:text-accent">
                {truncate(paper.title, 90)}
              </Link>
              <p className="text-xs text-muted">
                {paper.publication_year} · similarity {typeof paper.score === "number" ? paper.score.toFixed(2) : "–"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
