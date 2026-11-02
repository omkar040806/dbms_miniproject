"use client";

import Link from "next/link";
import { useState } from "react";
import { PaperCard } from "@/components/paper-card";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, PageHeader, Stat } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { CollectionRow, LibraryEntry } from "@/lib/db/queries/library";
import type { ReadingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LibraryData {
  entries: LibraryEntry[];
  counts: { to_read: number; reading: number; read: number; bookmarked: number; total: number };
  collections: CollectionRow[];
}

type Filter = "all" | ReadingStatus | "bookmarked";

export default function LibraryPage() {
  const { data, error, loading, reload } = useApi<LibraryData>("/api/library");
  const [filter, setFilter] = useState<Filter>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await run(async () => {
      await apiFetch("/api/collections", {
        method: "POST",
        body: JSON.stringify({ name: values.get("name"), description: values.get("description"), isPublic: values.get("isPublic") === "on" }),
      });
      form.reset();
    });
  }

  if (loading && !data) return <Spinner />;
  if (error || !data) return <Notice tone="danger">{error}</Notice>;

  const entries = data.entries.filter((e) =>
    filter === "all" ? true : filter === "bookmarked" ? e.is_bookmarked : e.reading_status === filter,
  );
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: data.counts.total },
    { key: "to_read", label: "To read", count: data.counts.to_read },
    { key: "reading", label: "Reading", count: data.counts.reading },
    { key: "read", label: "Read", count: data.counts.read },
    { key: "bookmarked", label: "Bookmarked", count: data.counts.bookmarked },
  ];

  return (
    <>
      <PageHeader
        title="My library"
        description="Your reading list, bookmarks and collections."
        actions={<LinkButton href="/my-papers" variant="secondary">My uploads</LinkButton>}
      />
      {actionError ? <Notice tone="danger" className="mb-4">{actionError}</Notice> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="To read" value={data.counts.to_read} />
        <Stat label="Reading" value={data.counts.reading} />
        <Stat label="Read" value={data.counts.read} />
        <Stat label="Collections" value={data.collections.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-4 flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  filter === tab.key ? "border-accent bg-accent text-white" : "border-line bg-card hover:border-accent",
                )}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          {entries.length === 0 ? (
            <EmptyState title="Nothing here yet">
              Open any paper and set a reading status. <Link href="/search" className="text-accent underline">Find papers</Link>
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <PaperCard
                  key={entry.paper_id}
                  paper={entry}
                  extra={
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        aria-label="Reading status"
                        value={entry.reading_status}
                        className="h-8 w-auto"
                        onChange={(e) =>
                          run(() => apiFetch(`/api/library/${entry.paper_id}`, { method: "PUT", body: JSON.stringify({ status: e.target.value }) }))
                        }
                      >
                        <option value="to_read">To read</option>
                        <option value="reading">Reading</option>
                        <option value="read">Read</option>
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          run(() =>
                            apiFetch(`/api/library/${entry.paper_id}`, { method: "PUT", body: JSON.stringify({ isBookmarked: !entry.is_bookmarked }) }),
                          )
                        }
                      >
                        {entry.is_bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => apiFetch(`/api/library/${entry.paper_id}`, { method: "DELETE" }))}>
                        Remove
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold">Collections</h2>
            {data.collections.length === 0 ? <p className="mt-2 text-sm text-muted">Group papers by project or topic.</p> : null}
            <ul className="mt-3 space-y-2">
              {data.collections.map((c) => (
                <li key={c.collection_id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/collections/${c.collection_id}`} className="font-medium hover:text-accent">
                    {c.name}
                  </Link>
                  <span className="flex items-center gap-1 text-muted">
                    {c.is_public ? <Badge tone="ok">public</Badge> : null}
                    {c.paper_count}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">New collection</h2>
            <form onSubmit={createCollection} className="mt-3 space-y-3">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required maxLength={80} />
              </Field>
              <Field label="Description" htmlFor="description">
                <Textarea id="description" name="description" rows={2} maxLength={500} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPublic" /> Anyone with the link can view
              </label>
              <Button type="submit" size="sm">
                Create
              </Button>
            </form>
          </Card>
        </aside>
      </div>
    </>
  );
}
