import { HttpError } from "@/lib/api/http";
import { query } from "@/lib/db/pool";
import type { PaperSummary } from "@/lib/types";
import { escapeLike } from "./search";

export interface AuthorHit {
  author_id: number;
  full_name: string;
  institution_name: string | null;
  paper_count: number;
  similarity: number;
}

export interface AuthorProfile {
  author: {
    author_id: number;
    full_name: string;
    orcid: string | null;
    institution_name: string | null;
    country_code: string | null;
    paper_count: number;
    platform_citations: number;
    external_citations: number;
    first_year: number | null;
    last_year: number | null;
    h_index: number;
  };
  papers: PaperSummary[];
  coauthors: { author_id: number; full_name: string; shared_papers: number }[];
  domains: { domain_name: string; paper_count: number }[];
}

/**
 * Typo-tolerant author search: pg_trgm's % operator matches names with similar
 * three-letter fragments ("Hintn" finds "Hinton"); ILIKE catches exact substrings.
 * paper_count is a correlated subquery evaluated once per matching author.
 */
export async function searchAuthors(text: string): Promise<AuthorHit[]> {
  const { rows } = await query<AuthorHit>(
    `SELECT a.author_id, a.full_name, i.name AS institution_name,
            (SELECT COUNT(*)
               FROM paper_authors pa JOIN papers p ON p.paper_id = pa.paper_id
              WHERE pa.author_id = a.author_id AND p.status = 'approved') AS paper_count,
            similarity(a.full_name, $1) AS similarity
     FROM authors a
     LEFT JOIN institutions i ON i.institution_id = a.institution_id
     WHERE a.full_name % $1 OR a.full_name ILIKE $2
     ORDER BY similarity DESC, paper_count DESC
     LIMIT 10`,
    [text, `%${escapeLike(text)}%`],
  );
  return rows;
}

export async function getAuthorProfile(authorId: number): Promise<AuthorProfile> {
  const stats = await query<Omit<AuthorProfile["author"], "h_index">>(
    `SELECT author_id, full_name, orcid, institution_name, country_code, paper_count,
            platform_citations, external_citations, first_year, last_year
     FROM v_author_stats
     WHERE author_id = $1`,
    [authorId],
  );
  if (!stats.rows[0]) throw new HttpError(404, "Author not found");

  const [hIndex, papers, coauthors, domains] = await Promise.all([
    query<{ h: number }>("SELECT fn_author_h_index($1) AS h", [authorId]),
    query<PaperSummary>(
      `SELECT vp.paper_id, vp.title, vp.publication_year, vp.status, vp.domain_id, vp.domain_name,
              vp.venue_name, vp.venue_type, vp.author_names, vp.keywords,
              vp.citation_count, vp.external_citation_count
       FROM paper_authors pa
       JOIN v_paper_details vp ON vp.paper_id = pa.paper_id
       WHERE pa.author_id = $1 AND vp.status = 'approved'
       ORDER BY vp.publication_year DESC, vp.title`,
      [authorId],
    ),
    // Self-join on paper_authors: other authors who share a paper with this one.
    query<AuthorProfile["coauthors"][number]>(
      `SELECT a2.author_id, a2.full_name, COUNT(*) AS shared_papers
       FROM paper_authors pa1
       JOIN paper_authors pa2 ON pa2.paper_id = pa1.paper_id AND pa2.author_id <> pa1.author_id
       JOIN papers p          ON p.paper_id = pa1.paper_id AND p.status = 'approved'
       JOIN authors a2        ON a2.author_id = pa2.author_id
       WHERE pa1.author_id = $1
       GROUP BY a2.author_id, a2.full_name
       ORDER BY shared_papers DESC, a2.full_name
       LIMIT 15`,
      [authorId],
    ),
    query<AuthorProfile["domains"][number]>(
      `SELECT d.name AS domain_name, COUNT(*) AS paper_count
       FROM paper_authors pa
       JOIN papers p  ON p.paper_id = pa.paper_id AND p.status = 'approved'
       JOIN domains d ON d.domain_id = p.domain_id
       WHERE pa.author_id = $1
       GROUP BY d.name
       ORDER BY paper_count DESC`,
      [authorId],
    ),
  ]);

  return {
    author: { ...stats.rows[0], h_index: hIndex.rows[0].h },
    papers: papers.rows,
    coauthors: coauthors.rows,
    domains: domains.rows,
  };
}
