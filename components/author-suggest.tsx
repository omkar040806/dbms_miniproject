"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/field";
import { apiFetch, toQuery } from "@/lib/client/api";
import type { AuthorHit } from "@/lib/db/queries/authors";

/**
 * Author filter with typo-tolerant suggestions (pg_trgm similarity, GIN trigram index).
 * Picking a suggestion applies the filter; the profile link opens the researcher page.
 */
export function AuthorSuggest({ initial, onApply }: { initial: string; onApply: (name: string) => void }) {
  const [text, setText] = useState(initial);
  const [hits, setHits] = useState<AuthorHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || q === initial) return;
    const timer = setTimeout(() => {
      apiFetch<{ authors: AuthorHit[] }>(`/api/authors${toQuery({ q })}`)
        .then((data) => setHits(data.authors.slice(0, 6)))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [text, initial]);

  const visible = open && text.trim().length >= 2 ? hits : [];

  return (
    <div className="relative">
      <Input
        id="author"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onApply(text.trim());
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Hinton (typos are fine)"
        autoComplete="off"
      />
      {visible.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full divide-y divide-line rounded-md border border-line bg-card text-sm shadow-lg">
          {visible.map((hit) => (
            <li key={hit.author_id} className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                className="text-left hover:text-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(hit.full_name);
                  setOpen(false);
                  onApply(hit.full_name);
                }}
              >
                {hit.full_name}
                <span className="block text-xs text-muted">{hit.paper_count} paper(s)</span>
              </button>
              <Link href={`/authors/${hit.author_id}`} className="text-xs text-accent underline" onMouseDown={(e) => e.preventDefault()}>
                profile
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
