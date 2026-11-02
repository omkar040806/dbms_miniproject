"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthorSuggest } from "@/components/author-suggest";
import { DomainSelect } from "@/components/domain-select";
import { Pagination } from "@/components/pagination";
import { PaperCard } from "@/components/paper-card";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { useApi } from "@/lib/client/use-api";
import type { MetaData, SearchResponse } from "@/lib/types";
import { plural } from "@/lib/utils";

const FILTER_KEYS = ["q", "domainId", "yearFrom", "yearTo", "author", "venueType", "minCitations", "sort"] as const;

const MODES = [
  { value: "keyword", label: "Keyword", help: "Full-text search on words in the title and abstract (PostgreSQL tsvector)." },
  { value: "semantic", label: "Semantic", help: "Finds papers with similar meaning, even without shared words (pgvector)." },
  { value: "hybrid", label: "Hybrid", help: "Merges keyword and semantic rankings with Reciprocal Rank Fusion." },
] as const;

/** Search state lives in the URL, so results can be bookmarked and shared. */
export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: meta } = useApi<MetaData>("/api/meta");

  const queryString = searchParams.toString();
  const semanticWithoutText = (searchParams.get("mode") ?? "keyword") !== "keyword" && !searchParams.get("q");
  const { data, error, loading } = useApi<SearchResponse>(semanticWithoutText ? null : `/api/search?${queryString}`);
  const [text, setText] = useState(searchParams.get("q") ?? "");

  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    update({ q: text.trim() || null });
  }

  const value = (key: (typeof FILTER_KEYS)[number]) => searchParams.get(key) ?? "";
  const mode = searchParams.get("mode") ?? "keyword";
  const needsText = semanticWithoutText;
  const hasFilters = FILTER_KEYS.some((key) => key !== "sort" && searchParams.get(key));

  return (
    <>
      <PageHeader title="Search papers" description="Full-text search over titles and abstracts, with filters on any metadata." />

      <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Search mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            title={m.help}
            onClick={() => update({ mode: m.value === "keyword" ? null : m.value })}
            className={
              mode === m.value
                ? "rounded-full border border-accent bg-accent px-4 py-1.5 text-sm text-white"
                : "rounded-full border border-line bg-card px-4 py-1.5 text-sm hover:border-accent"
            }
          >
            {m.label}
          </button>
        ))}
        <span className="text-xs text-muted">{MODES.find((m) => m.value === mode)?.help}</span>
      </div>

      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Try: graph neural networks, "attention mechanism", transformer -vision'
          aria-label="Search query"
          className="h-11 text-base"
        />
        <Button type="submit" className="h-11 px-6">
          Search
        </Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside>
          <Card className="space-y-4 p-4">
            <Field label="Domain" htmlFor="domain">
              <DomainSelect
                id="domain"
                domains={meta?.domains ?? []}
                emptyLabel="All domains"
                value={value("domainId")}
                onChange={(e) => update({ domainId: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From year" htmlFor="yearFrom">
                <Input id="yearFrom" type="number" min={1900} max={2100} defaultValue={value("yearFrom")} onBlur={(e) => update({ yearFrom: e.target.value })} />
              </Field>
              <Field label="To year" htmlFor="yearTo">
                <Input id="yearTo" type="number" min={1900} max={2100} defaultValue={value("yearTo")} onBlur={(e) => update({ yearTo: e.target.value })} />
              </Field>
            </div>
            <Field label="Author" htmlFor="author" hint="Press Enter or pick a suggestion.">
              <AuthorSuggest key={value("author")} initial={value("author")} onApply={(name) => update({ author: name })} />
            </Field>
            <Field label="Venue type" htmlFor="venueType">
              <Select id="venueType" value={value("venueType")} onChange={(e) => update({ venueType: e.target.value })}>
                <option value="">Any</option>
                <option value="journal">Journal</option>
                <option value="conference">Conference</option>
                <option value="preprint">Preprint</option>
                <option value="book">Book</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Minimum citations" htmlFor="minCitations">
              <Input id="minCitations" type="number" min={0} defaultValue={value("minCitations")} onBlur={(e) => update({ minCitations: e.target.value })} />
            </Field>
            <Field label="Sort by" htmlFor="sort">
              <Select id="sort" value={value("sort") || "relevance"} onChange={(e) => update({ sort: e.target.value })} disabled={mode === "hybrid"}>
                <option value="relevance">{mode === "semantic" ? "Similarity" : "Relevance"}</option>
                <option value="citations">Most cited</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </Select>
            </Field>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setText("");
                  router.replace(pathname);
                }}
              >
                Clear all filters
              </Button>
            ) : null}
          </Card>
        </aside>

        <section aria-live="polite">
          {needsText ? <Notice tone="info">Type a question or topic above to search by meaning.</Notice> : null}
          {error && !needsText ? <Notice tone="danger">{error}</Notice> : null}
          {loading && !data && !needsText ? <Spinner label={mode === "keyword" ? "Searching…" : "Embedding your query and searching…"} /> : null}
          {data && !needsText ? (
            <>
              <p className="mb-3 text-sm text-muted">
                {plural(data.total, "paper")} found
                {data.mode !== "keyword" ? ` (top ${data.mode === "semantic" ? "50 nearest by meaning" : "results of both rankings"})` : ""}
                {loading ? " · updating…" : ""}
              </p>
              {data.results.length === 0 ? (
                <EmptyState title="No papers match">Try fewer filters or different words.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {data.results.map((paper) => (
                    <PaperCard key={paper.paper_id} paper={paper} />
                  ))}
                </div>
              )}
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={(page) => update({ page: String(page) }, false)}
              />
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
