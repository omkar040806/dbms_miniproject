"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CoauthorNetwork } from "@/components/graph/coauthor-network";
import { PaperCard } from "@/components/paper-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle, Stat } from "@/components/ui/card";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { useApi } from "@/lib/client/use-api";
import type { AuthorProfile } from "@/lib/db/queries/authors";

export default function AuthorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useApi<AuthorProfile>(`/api/authors/${id}`);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <EmptyState title="Author not found">{error}</EmptyState>;

  const { author, papers, coauthors, domains } = data;
  const years = author.first_year ? (author.first_year === author.last_year ? `${author.first_year}` : `${author.first_year}–${author.last_year}`) : "—";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Researcher</p>
        <h1 className="mt-1 text-3xl font-semibold">{author.full_name}</h1>
        <p className="mt-1 text-muted">
          {author.institution_name ?? "Institution unknown"}
          {author.country_code ? ` · ${author.country_code}` : ""}
          {author.orcid ? (
            <>
              {" · ORCID "}
              <a href={`https://orcid.org/${author.orcid}`} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                {author.orcid}
              </a>
            </>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Papers" value={author.paper_count} />
        <Stat label="h-index" value={author.h_index} hint="Computed by fn_author_h_index" />
        <Stat label="Platform citations" value={author.platform_citations.toLocaleString("en-IN")} />
        <Stat label="Worldwide citations" value={author.external_citations.toLocaleString("en-IN")} />
        <Stat label="Active years" value={years} />
      </div>

      <CoauthorNetwork authorId={author.author_id} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Papers</h2>
          {papers.length === 0 ? <EmptyState title="No approved papers yet" /> : papers.map((paper) => <PaperCard key={paper.paper_id} paper={paper} />)}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardTitle>Research domains</CardTitle>
            <div className="mt-3 flex flex-wrap gap-1">
              {domains.map((d) => (
                <Badge key={d.domain_name} tone="accent">
                  {d.domain_name} · {d.paper_count}
                </Badge>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle>Frequent co-authors</CardTitle>
            {coauthors.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No co-authors on the platform.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {coauthors.map((c) => (
                  <li key={c.author_id} className="flex justify-between gap-2">
                    <Link href={`/authors/${c.author_id}`} className="hover:text-accent">
                      {c.full_name}
                    </Link>
                    <span className="text-muted">{c.shared_papers}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
