/**
 * Print EXPLAIN ANALYZE plans for the most important queries, for the report.
 *   npm run db:explain                 normal planner choices
 *   npm run db:explain -- --no-seqscan discourage sequential scans to show index plans
 *
 * On small tables PostgreSQL often prefers a sequential scan because reading a few
 * pages is cheaper than using an index. That is correct behaviour; --no-seqscan shows
 * which index WOULD be used, and on the full imported dataset the indexes win anyway.
 */
import "./lib/env";
import { getPool } from "@/lib/db/pool";

const QUERIES: { name: string; sql: string; params: unknown[] }[] = [
  {
    name: "Full-text search (GIN on search_vector)",
    sql: `SELECT paper_id, ts_rank_cd(search_vector, q) AS rank
          FROM papers, websearch_to_tsquery('english', $1) q
          WHERE status = 'approved' AND search_vector @@ q
          ORDER BY rank DESC LIMIT 10`,
    params: ["transformer attention"],
  },
  {
    name: "Browse by year, most cited (partial composite index)",
    sql: `SELECT paper_id, title FROM papers
          WHERE status = 'approved' AND publication_year BETWEEN 2015 AND 2020
          ORDER BY publication_year DESC, citation_count DESC LIMIT 20`,
    params: [],
  },
  {
    name: "Fuzzy author search (trigram GIN)",
    sql: `SELECT author_id, full_name, similarity(full_name, $1) AS sim
          FROM authors WHERE full_name % $1 OR full_name ILIKE $2
          ORDER BY sim DESC LIMIT 10`,
    params: ["Jefrey Dean", "%dean%"],
  },
  {
    name: "Who cites paper X (idx_citations_cited)",
    sql: "SELECT citing_paper_id FROM citations WHERE cited_paper_id = $1",
    params: [19],
  },
  {
    name: "Semantic nearest neighbours (HNSW on embedding)",
    sql: `SELECT paper_id FROM paper_embeddings
          ORDER BY embedding <=> (SELECT embedding FROM paper_embeddings ORDER BY paper_id LIMIT 1)
          LIMIT 10`,
    params: [],
  },
];

async function main() {
  const noSeqScan = process.argv.includes("--no-seqscan");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (noSeqScan) await client.query("SET LOCAL enable_seqscan = off");
    for (const q of QUERIES) {
      const { rows } = await client.query<{ "QUERY PLAN": string }>(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${q.sql}`, q.params);
      console.log(`\n=== ${q.name} ===`);
      for (const row of rows) console.log(row["QUERY PLAN"]);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
