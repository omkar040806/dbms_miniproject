// SQL counterparts used next to the Neo4j queries.
import { query } from "@/lib/db/pool";

/**
 * Papers reachable within `depth` citation hops (either direction), computed with a
 * recursive CTE. Each step joins citations twice (cites / cited-by) and carries the
 * visited path to avoid cycles. Neo4j answers the same question with one pattern:
 * (p)-[:CITES*1..depth]-(q).
 */
export const SQL_REACHABLE = `WITH RECURSIVE hops (paper_id, depth, path) AS (
    SELECT $1::int, 0, ARRAY[$1::int]
    UNION ALL
    SELECT nxt.id, h.depth + 1, h.path || nxt.id
    FROM hops h
    CROSS JOIN LATERAL (
        SELECT c.cited_paper_id AS id FROM citations c WHERE c.citing_paper_id = h.paper_id
        UNION ALL
        SELECT c.citing_paper_id FROM citations c WHERE c.cited_paper_id = h.paper_id
    ) nxt
    JOIN papers p ON p.paper_id = nxt.id AND p.status = 'approved'
    WHERE h.depth < $2 AND NOT nxt.id = ANY (h.path)
)
SELECT COUNT(DISTINCT paper_id) - 1 AS reachable, COUNT(*) AS paths_explored
FROM hops`;

export async function sqlReachable(paperId: number, depth: number): Promise<{ reachable: number; paths_explored: number; ms: number }> {
  const started = performance.now();
  const { rows } = await query<{ reachable: number; paths_explored: number }>(SQL_REACHABLE, [paperId, depth]);
  return { ...rows[0], ms: Math.round((performance.now() - started) * 100) / 100 };
}

/** Paper ids in a user's reading list or collections (UNION removes duplicates). */
export async function libraryPaperIds(userId: number): Promise<number[]> {
  const { rows } = await query<{ paper_id: number }>(
    `SELECT paper_id FROM reading_list WHERE user_id = $1
     UNION
     SELECT cp.paper_id
     FROM collection_papers cp
     JOIN collections c ON c.collection_id = cp.collection_id
     WHERE c.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.paper_id);
}
