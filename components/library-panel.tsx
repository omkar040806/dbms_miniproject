"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/field";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { NoteRow } from "@/lib/db/queries/library";
import type { ReadingStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

interface LibraryState {
  entry: { status: ReadingStatus; is_bookmarked: boolean } | null;
  collections: { collection_id: number; name: string; contains: boolean }[];
  notes: NoteRow[];
}

const STATUSES: { value: ReadingStatus; label: string }[] = [
  { value: "to_read", label: "To read" },
  { value: "reading", label: "Reading" },
  { value: "read", label: "Read" },
];

/** Reading status, bookmark, collections and private notes for one paper. */
export function LibraryPanel({ paperId }: { paperId: number }) {
  const { data, reload } = useApi<LibraryState>(`/api/library/${paperId}`);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [newCollection, setNewCollection] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!data) return null;
  const entry = data.entry;

  return (
    <Card className="space-y-5">
      <CardTitle>My library</CardTitle>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Reading status</p>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => run(() => apiFetch(`/api/library/${paperId}`, { method: "PUT", body: JSON.stringify({ status: s.value }) }))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                entry?.status === s.value ? "border-accent bg-accent text-white" : "border-line hover:border-accent",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              run(() => apiFetch(`/api/library/${paperId}`, { method: "PUT", body: JSON.stringify({ isBookmarked: !entry?.is_bookmarked }) }))
            }
          >
            {entry?.is_bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
          </Button>
          {entry ? (
            <Button size="sm" variant="ghost" onClick={() => run(() => apiFetch(`/api/library/${paperId}`, { method: "DELETE" }))}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Collections</p>
        {data.collections.length === 0 ? <p className="text-sm text-muted">No collections yet.</p> : null}
        <ul className="space-y-1 text-sm">
          {data.collections.map((c) => (
            <li key={c.collection_id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.contains}
                  onChange={() =>
                    run(() =>
                      c.contains
                        ? apiFetch(`/api/collections/${c.collection_id}/papers/${paperId}`, { method: "DELETE" })
                        : apiFetch(`/api/collections/${c.collection_id}/papers`, { method: "POST", body: JSON.stringify({ paperId }) }),
                    )
                  }
                />
                {c.name}
              </label>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCollection.trim();
            if (!name) return;
            void run(async () => {
              const created = await apiFetch<{ collection: { collection_id: number } }>("/api/collections", {
                method: "POST",
                body: JSON.stringify({ name }),
              });
              await apiFetch(`/api/collections/${created.collection.collection_id}/papers`, { method: "POST", body: JSON.stringify({ paperId }) });
              setNewCollection("");
            });
          }}
        >
          <Input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder="New collection" className="h-8" maxLength={80} />
          <Button type="submit" size="sm" variant="secondary">
            Add
          </Button>
        </form>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Private notes</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiFetch("/api/notes", { method: "POST", body: JSON.stringify({ paperId, body: note }) });
              setNote("");
            });
          }}
        >
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000} placeholder="What did you learn?" />
          <Button type="submit" size="sm" className="mt-2" disabled={!note.trim()}>
            Save note
          </Button>
        </form>
        <ul className="mt-3 space-y-2">
          {data.notes.map((n) => (
            <li key={n.note_id} className="rounded-md bg-paper p-3 text-sm">
              <p className="whitespace-pre-line">{n.body}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-muted">
                <span>{formatDate(n.created_at)}</span>
                <button type="button" className="hover:text-danger" onClick={() => run(() => apiFetch(`/api/notes/${n.note_id}`, { method: "DELETE" }))}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
