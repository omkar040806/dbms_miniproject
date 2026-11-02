"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/field";
import { apiFetch, toQuery } from "@/lib/client/api";
import type { PaperSummary, SearchResponse } from "@/lib/types";
import { truncate } from "@/lib/utils";

/** Type-ahead search that picks a single paper. */
export function PaperSearch({ placeholder, onPick }: { placeholder: string; onPick: (paper: PaperSummary) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<PaperSummary[]>([]);

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

  const visible = text.trim().length >= 3 ? results : [];

  return (
    <div className="relative">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      {visible.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full divide-y divide-line rounded-md border border-line bg-card shadow-lg">
          {visible.map((paper) => (
            <li key={paper.paper_id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent-soft"
                onClick={() => {
                  onPick(paper);
                  setText("");
                }}
              >
                {truncate(paper.title, 80)} <span className="text-muted">({paper.publication_year})</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
