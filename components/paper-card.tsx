import Link from "next/link";
import { Highlight } from "@/components/highlight";
import { Badge } from "@/components/ui/badge";
import type { PaperSummary } from "@/lib/types";
import { truncate } from "@/lib/utils";

/** One search result / list entry. */
export function PaperCard({ paper, extra }: { paper: PaperSummary; extra?: React.ReactNode }) {
  const citations = Math.max(paper.citation_count, paper.external_citation_count);
  return (
    <article className="rounded-lg border border-line bg-card p-4 transition-colors hover:border-accent/40">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="accent">{paper.domain_name}</Badge>
        <span>{paper.publication_year}</span>
        {paper.venue_name ? <span>· {truncate(paper.venue_name, 60)}</span> : null}
        <span>· {citations.toLocaleString("en-IN")} citations</span>
        {typeof paper.score === "number" ? <span>· score {paper.score.toFixed(3)}</span> : null}
      </div>
      <h3 className="mt-2 font-serif text-lg font-semibold leading-snug">
        <Link href={`/papers/${paper.paper_id}`} className="hover:text-accent">
          {paper.title}
        </Link>
      </h3>
      {paper.author_names ? <p className="mt-1 text-sm text-muted">{truncate(paper.author_names, 160)}</p> : null}
      {paper.snippet ? (
        <p className="mt-2 text-sm leading-relaxed text-ink/85">
          <Highlight text={paper.snippet} />
        </p>
      ) : null}
      {paper.keywords?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {paper.keywords.slice(0, 6).map((keyword) => (
            <Badge key={keyword}>{keyword}</Badge>
          ))}
        </div>
      ) : null}
      {extra ? <div className="mt-3">{extra}</div> : null}
    </article>
  );
}
