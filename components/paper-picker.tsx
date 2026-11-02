"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { apiFetch, toQuery } from "@/lib/client/api";
import type { PaperSummary, SearchResponse } from "@/lib/types";
import { truncate } from "@/lib/utils";

export interface PickedPaper {
  paper_id: number;
  title: string;
  publication_year: number;
}

/** Search existing papers and pick the ones this paper cites. */
export function PaperPicker({ value, onChange }: { value: PickedPaper[]; onChange: (papers: PickedPaper[]) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<PaperSummary[]>([]);

  // Debounce: wait 300 ms after typing stops before querying.
  useEffect(() => {
    const q = text.trim();
    if (q.length < 3) return;
    const timer = setTimeout(() => {
      apiFetch<SearchResponse>(`/api/search${toQuery({ q, pageSize: 6 })}`)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const chosen = new Set(value.map((p) => p.paper_id));
  const visible = text.trim().length >= 3 ? results.filter((r) => !chosen.has(r.paper_id)) : [];

  return (
    <div>
      {value.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((paper) => (
            <li key={paper.paper_id}>
              <Badge tone="accent" className="gap-1 py-1">
                {truncate(paper.title, 50)} ({paper.publication_year})
                <button
                  type="button"
                  aria-label={`Remove ${paper.title}`}
                  className="ml-1 font-bold"
                  onClick={() => onChange(value.filter((p) => p.paper_id !== paper.paper_id))}
                >
                  ×
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search papers on the platform by title or topic" />
      {visible.length > 0 ? (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-card">
          {visible.map((paper) => (
            <li key={paper.paper_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {truncate(paper.title, 90)} <span className="text-muted">({paper.publication_year})</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onChange([...value, { paper_id: paper.paper_id, title: paper.title, publication_year: paper.publication_year }]);
                  setText("");
                }}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
