"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LibraryPanel } from "@/components/library-panel";
import { useSession } from "@/components/session-provider";
import { SimilarPapers } from "@/components/similar-papers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, Spinner } from "@/components/ui/feedback";
import { apiFetch } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";
import type { PaperLink, PaperPageData } from "@/lib/types";
import { formatDate, truncate } from "@/lib/utils";

function LinkList({ items, empty }: { items: PaperLink[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.paper_id} className="text-sm">
          <Link href={`/papers/${item.paper_id}`} className="font-medium hover:text-accent">
            {item.title}
          </Link>
          <span className="text-muted"> · {item.publication_year} · {truncate(item.author_names, 60)}</span>
        </li>
      ))}
    </ul>
  );
}

function PaperView() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useSession();
  const { data, error, loading } = useApi<PaperPageData>(`/api/papers/${id}`);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <EmptyState title="Paper not found">{error ?? "It may be pending review or deleted."}</EmptyState>;

  const { paper, references, citedBy, canDelete } = data;

  async function handleDelete() {
    if (!window.confirm("Delete this paper permanently?")) return;
    try {
      await apiFetch(`/api/papers/${paper.paper_id}`, { method: "DELETE" });
      router.push("/my-papers");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        {searchParams.get("submitted") ? (
          <Notice tone="ok">Submitted. Your paper is pending review and will appear in search once an admin approves it.</Notice>
        ) : null}
        {deleteError ? <Notice tone="danger">{deleteError}</Notice> : null}

        <header>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone="accent">{paper.parent_domain_name ? `${paper.parent_domain_name} › ` : ""}{paper.domain_name}</Badge>
            <span>{paper.publication_year}</span>
            {paper.venue_name ? <span>· {paper.venue_name}</span> : null}
            {paper.status !== "approved" ? <StatusBadge status={paper.status} /> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">{paper.title}</h1>
          <p className="mt-3 text-sm">
            {paper.authors.map((author, index) => (
              <span key={author.author_id}>
                {index > 0 ? ", " : ""}
                <Link href={`/authors/${author.author_id}`} className="text-accent hover:underline">
                  {author.full_name}
                </Link>
              </span>
            ))}
          </p>
        </header>

        <Card>
          <CardTitle>Abstract</CardTitle>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{paper.abstract || "No abstract provided."}</p>
          {paper.keywords.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1">
              {paper.keywords.map((keyword) => (
                <Link key={keyword} href={`/search?q=${encodeURIComponent(keyword)}`}>
                  <Badge className="hover:border-accent">{keyword}</Badge>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardTitle>References ({references.length})</CardTitle>
          <p className="mb-3 text-xs text-muted">Papers on this platform that this paper cites.</p>
          <LinkList items={references} empty="No references to other papers on the platform." />
        </Card>

        <Card>
          <CardTitle>Cited by ({citedBy.length})</CardTitle>
          <p className="mb-3 text-xs text-muted">Papers on this platform that cite this one.</p>
          <LinkList items={citedBy} empty="Not cited by any paper on the platform yet." />
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="space-y-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Citations on this platform</p>
            <p className="font-serif text-2xl font-semibold">{paper.citation_count.toLocaleString("en-IN")}</p>
          </div>
          {paper.external_citation_count > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Citations worldwide (OpenAlex)</p>
              <p className="font-serif text-2xl font-semibold">{paper.external_citation_count.toLocaleString("en-IN")}</p>
            </div>
          ) : null}
          {paper.doi ? (
            <p>
              DOI:{" "}
              <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
                {paper.doi}
              </a>
            </p>
          ) : null}
          {paper.has_pdf ? (
            <a href={`/api/papers/${paper.paper_id}/pdf`} target="_blank" rel="noopener noreferrer" className="block text-accent underline">
              Open PDF ({Math.round((paper.pdf_size_bytes ?? 0) / 1024)} KB)
            </a>
          ) : null}
          {paper.status === "approved" ? (
            <Link href={`/graph?paper=${paper.paper_id}`} className="block text-accent underline">
              Explore in the citation graph
            </Link>
          ) : null}
          <p className="text-xs text-muted">Added {formatDate(paper.created_at)}</p>
          {canDelete ? (
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Delete paper
            </Button>
          ) : null}
        </Card>
        {paper.status === "approved" ? <SimilarPapers paperId={paper.paper_id} /> : null}
        {user && paper.status === "approved" ? <LibraryPanel paperId={paper.paper_id} /> : null}
      </aside>
    </div>
  );
}

export default function PaperPage() {
  return (
    <Suspense>
      <PaperView />
    </Suspense>
  );
}
