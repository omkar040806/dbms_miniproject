// Paper search. All user input becomes a numbered parameter ($1, $2 ...);
// only fixed SQL fragments written in this file are concatenated.
import { query, withTransaction, type DbClient } from "@/lib/db/pool";
import { toPgVector } from "@/lib/embeddings/model";
import type { PaperSummary, SearchResponse } from "@/lib/types";
import { HIGHLIGHT_START, HIGHLIGHT_STOP } from "@/lib/search-markers";
import type { SearchQuery } from "@/lib/validation/search";

// ts_headline marks matches with these tokens; the browser turns them into <mark>
// after escaping, so text from an abstract can never inject HTML.
const HEADLINE_OPTIONS = `MaxFragments=2, MaxWords=28, MinWords=12, StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_STOP}`;

/** Collects parameters and returns their $n placeholder. */
export class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Escape % and _ so user text is matched literally inside ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** WHERE conditions shared by every search mode (filters on metadata). */
export function buildFilters(filters: SearchQuery, params: Params, alias = "p"): string[] {
  const where = [`${alias}.status = 'approved'`];
  if (filters.domainId) {
    // Recursive function: a parent domain also matches papers in its sub-domains.
    where.push(`${alias}.domain_id IN (SELECT domain_id FROM fn_domain_subtree(${params.add(filters.domainId)}))`);
  }
  if (filters.yearFrom) where.push(`${alias}.publication_year >= ${params.add(filters.yearFrom)}`);
  if (filters.yearTo) where.push(`${alias}.publication_year <= ${params.add(filters.yearTo)}`);
  if (filters.minCitations) {
    where.push(`GREATEST(${alias}.citation_count, ${alias}.external_citation_count) >= ${params.add(filters.minCitations)}`);
  }
  if (filters.venueType) {
    where.push(`EXISTS (SELECT 1 FROM venues v WHERE v.venue_id = ${alias}.venue_id AND v.venue_type = ${params.add(filters.venueType)})`);
  }
  if (filters.author) {
    where.push(
      `EXISTS (SELECT 1 FROM paper_authors pa JOIN authors a ON a.author_id = pa.author_id
               WHERE pa.paper_id = ${alias}.paper_id AND a.full_name ILIKE ${params.add(`%${escapeLike(filters.author)}%`)})`,
    );
  }
  return where;
}

/** ORDER BY for the chosen sort. `scoreExpr` is the relevance expression, or null when there is none. */
export function orderBy(sort: SearchQuery["sort"], scoreExpr: string | null): string {
  switch (sort) {
    case "newest":
      return "p.publication_year DESC, p.paper_id DESC";
    case "oldest":
      return "p.publication_year ASC, p.paper_id ASC";
    case "citations":
      return "GREATEST(p.citation_count, p.external_citation_count) DESC, p.paper_id";
    default:
      return scoreExpr ? `${scoreExpr} DESC, p.paper_id` : "GREATEST(p.citation_count, p.external_citation_count) DESC, p.paper_id";
  }
}

const SUMMARY_COLUMNS = `
  vp.paper_id, vp.title, vp.publication_year, vp.status, vp.domain_id, vp.domain_name,
  vp.venue_name, vp.venue_type, vp.author_names, vp.keywords,
  vp.citation_count, vp.external_citation_count`;

/**
 * Keyword search: PostgreSQL full-text search on the generated search_vector column
 * (GIN index), ranked with ts_rank_cd, plus metadata filters. Without a query it
 * simply browses with filters.
 */
export async function keywordSearch(filters: SearchQuery): Promise<SearchResponse> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const params = new Params();
  const hasText = filters.q.length > 0;

  let tsQuery = "NULL";
  if (hasText) tsQuery = `websearch_to_tsquery('english', ${params.add(filters.q)})`;
  const where = buildFilters(filters, params);
  if (hasText) where.push(`p.search_vector @@ ${tsQuery}`);

  const scoreExpr = hasText ? `ts_rank_cd(p.search_vector, ${tsQuery})` : null;
  const limit = params.add(pageSize);
  const offset = params.add((page - 1) * pageSize);

  // CTE: find and order the matching ids (COUNT(*) OVER () gives the total without a second query),
  // then join the view for display columns and build snippets only for the rows on this page.
  const sql = `
    WITH matches AS (
      SELECT p.paper_id,
             ${scoreExpr ?? "NULL::real"} AS score,
             ROW_NUMBER() OVER (ORDER BY ${orderBy(filters.sort, scoreExpr)}) AS position,
             COUNT(*) OVER () AS total_count
      FROM papers p
      WHERE ${where.join("\n        AND ")}
      ORDER BY position
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT ${SUMMARY_COLUMNS},
           m.score,
           m.total_count,
           ${hasText ? `ts_headline('english', coalesce(vp.abstract, ''), ${tsQuery}, '${HEADLINE_OPTIONS}')` : "left(vp.abstract, 280)"} AS snippet
    FROM matches m
    JOIN v_paper_details vp ON vp.paper_id = m.paper_id
    ORDER BY m.position`;

  const { rows } = await query<PaperSummary & { total_count: number }>(sql, params.values);
  return {
    results: rows, // total_count is an extra column; the client ignores it
    total: rows[0]?.total_count ?? 0,
    page,
    pageSize,
    mode: "keyword",
  };
}

// ---------------------------------------------------------------------------
// Vector search (pgvector)
// ---------------------------------------------------------------------------

/** How many nearest neighbours semantic search considers before paging. */
export const SEMANTIC_CANDIDATES = 50;

let vectorVersion: Promise<number[]> | null = null;

/** pgvector version as [major, minor], cached after the first lookup. */
function pgvectorVersion(client: DbClient): Promise<number[]> {
  vectorVersion ??= client
    .query<{ extversion: string }>("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    .then((r) => (r.rows[0]?.extversion ?? "0.0").split(".").map(Number));
  return vectorVersion;
}

/**
 * Tune the HNSW index scan for this transaction only (SET LOCAL).
 * ef_search must be at least the LIMIT, otherwise HNSW returns fewer rows.
 * pgvector 0.8+ can keep scanning when WHERE filters remove candidates (iterative scan).
 */
async function tuneVectorScan(client: DbClient): Promise<void> {
  await client.query("SELECT set_config('hnsw.ef_search', '100', true)");
  const [major, minor] = await pgvectorVersion(client);
  if (major > 0 || minor >= 8) {
    await client.query("SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)");
  }
}

function pageOf(filters: SearchQuery) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** ORDER BY inside the candidate set: "relevance" keeps similarity order. */
function candidateOrder(sort: SearchQuery["sort"]): string {
  switch (sort) {
    case "newest":
      return "publication_year DESC, distance";
    case "oldest":
      return "publication_year ASC, distance";
    case "citations":
      return "cites DESC, distance";
    default:
      return "distance";
  }
}

/**
 * Semantic search: the query text is embedded with the same model as the papers,
 * then the HNSW index finds the nearest paper vectors by cosine distance (<=>).
 * score = 1 - cosine distance = cosine similarity.
 */
export async function semanticSearch(filters: SearchQuery, queryVector: number[]): Promise<SearchResponse> {
  const { page, pageSize, offset } = pageOf(filters);
  const params = new Params();
  const vector = params.add(toPgVector(queryVector));
  const where = buildFilters(filters, params);
  const from = params.add(offset);
  const to = params.add(offset + pageSize);

  // The inner query is ORDER BY distance LIMIT n, which is exactly what the HNSW index serves.
  const sql = `
    WITH candidates AS (
      SELECT p.paper_id, p.publication_year,
             GREATEST(p.citation_count, p.external_citation_count) AS cites,
             e.embedding <=> ${vector}::vector AS distance
      FROM paper_embeddings e
      JOIN papers p ON p.paper_id = e.paper_id
      WHERE ${where.join("\n        AND ")}
      ORDER BY e.embedding <=> ${vector}::vector
      LIMIT ${SEMANTIC_CANDIDATES}
    ),
    ranked AS (
      SELECT paper_id, distance,
             ROW_NUMBER() OVER (ORDER BY ${candidateOrder(filters.sort)}) AS position,
             COUNT(*) OVER () AS total_count
      FROM candidates
    )
    SELECT ${SUMMARY_COLUMNS},
           ROUND((1 - r.distance)::numeric, 4)::float AS score,
           r.total_count,
           left(vp.abstract, 280) AS snippet
    FROM ranked r
    JOIN v_paper_details vp ON vp.paper_id = r.paper_id
    WHERE r.position > ${from} AND r.position <= ${to}
    ORDER BY r.position`;

  const rows = await withTransaction(async (client) => {
    await tuneVectorScan(client);
    return (await client.query<PaperSummary & { total_count: number }>(sql, params.values)).rows;
  });
  return { results: rows, total: rows[0]?.total_count ?? 0, page, pageSize, mode: "semantic" };
}

/**
 * Hybrid search with Reciprocal Rank Fusion (RRF): each paper scores
 * 1/(60 + rank) in the keyword list plus 1/(60 + rank) in the semantic list.
 * Papers found by both methods rise to the top; exact-term matches (acronyms,
 * names) are not lost the way they can be in pure vector search.
 */
export async function hybridSearch(filters: SearchQuery, queryVector: number[]): Promise<SearchResponse> {
  const { page, pageSize, offset } = pageOf(filters);
  const params = new Params();
  const vector = params.add(toPgVector(queryVector));
  const tsQuery = `websearch_to_tsquery('english', ${params.add(filters.q)})`;
  const where = buildFilters(filters, params).join("\n          AND ");
  const from = params.add(offset);
  const to = params.add(offset + pageSize);

  const sql = `
    WITH semantic AS (
      SELECT paper_id, ROW_NUMBER() OVER (ORDER BY distance) AS rank
      FROM (
        SELECT p.paper_id, e.embedding <=> ${vector}::vector AS distance
        FROM paper_embeddings e
        JOIN papers p ON p.paper_id = e.paper_id
        WHERE ${where}
        ORDER BY e.embedding <=> ${vector}::vector
        LIMIT ${SEMANTIC_CANDIDATES}
      ) nearest
    ),
    keyword AS (
      SELECT paper_id, ROW_NUMBER() OVER (ORDER BY text_rank DESC) AS rank
      FROM (
        SELECT p.paper_id, ts_rank_cd(p.search_vector, ${tsQuery}) AS text_rank
        FROM papers p
        WHERE ${where}
          AND p.search_vector @@ ${tsQuery}
        ORDER BY text_rank DESC
        LIMIT ${SEMANTIC_CANDIDATES}
      ) matched
    ),
    fused AS (
      SELECT COALESCE(s.paper_id, k.paper_id) AS paper_id,
             COALESCE(1.0 / (60 + s.rank), 0) + COALESCE(1.0 / (60 + k.rank), 0) AS rrf_score
      FROM semantic s
      FULL OUTER JOIN keyword k ON k.paper_id = s.paper_id
    ),
    ranked AS (
      SELECT paper_id, rrf_score,
             ROW_NUMBER() OVER (ORDER BY rrf_score DESC, paper_id) AS position,
             COUNT(*) OVER () AS total_count
      FROM fused
    )
    SELECT ${SUMMARY_COLUMNS},
           ROUND(r.rrf_score::numeric, 4)::float AS score,
           r.total_count,
           ts_headline('english', coalesce(vp.abstract, ''), ${tsQuery}, '${HEADLINE_OPTIONS}') AS snippet
    FROM ranked r
    JOIN v_paper_details vp ON vp.paper_id = r.paper_id
    WHERE r.position > ${from} AND r.position <= ${to}
    ORDER BY r.position`;

  const rows = await withTransaction(async (client) => {
    await tuneVectorScan(client);
    return (await client.query<PaperSummary & { total_count: number }>(sql, params.values)).rows;
  });
  return { results: rows, total: rows[0]?.total_count ?? 0, page, pageSize, mode: "hybrid" };
}

/**
 * "More like this": nearest neighbours of a paper's own vector.
 * The scalar subquery is evaluated once, so the HNSW index can be used.
 */
export async function similarPapers(paperId: number, limit = 6): Promise<PaperSummary[]> {
  return withTransaction(async (client) => {
    await tuneVectorScan(client);
    const { rows } = await client.query<PaperSummary>(
      `WITH nearest AS (
         SELECT e.paper_id,
                e.embedding <=> (SELECT embedding FROM paper_embeddings WHERE paper_id = $1) AS distance
         FROM paper_embeddings e
         WHERE e.paper_id <> $1
         ORDER BY distance
         LIMIT 30
       )
       SELECT ${SUMMARY_COLUMNS}, ROUND((1 - n.distance)::numeric, 4)::float AS score
       FROM nearest n
       JOIN v_paper_details vp ON vp.paper_id = n.paper_id
       WHERE vp.status = 'approved' AND n.distance IS NOT NULL
       ORDER BY n.distance
       LIMIT $2`,
      [paperId, limit],
    );
    return rows;
  });
}
