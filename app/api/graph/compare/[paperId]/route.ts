import { apiHandler, json, parseId, parseQuery, type RouteContext } from "@/lib/api/http";
import { SQL_REACHABLE, sqlReachable } from "@/lib/db/queries/graph-sql";
import { CYPHER_REACHABLE, cypherReachable } from "@/lib/graph/queries";
import { depthSchema } from "@/lib/validation/graph";

// GET /api/graph/compare/:paperId?depth=2
// Same question ("how many papers are within N citation hops?") answered by a
// PostgreSQL recursive CTE and by a Neo4j pattern, with timings. Used in the demo
// to justify storing the citation network in a graph database.
export const GET = apiHandler(async (request, { params }: RouteContext<{ paperId: string }>) => {
  const paperId = parseId((await params).paperId, "paperId");
  const { depth } = parseQuery(request, depthSchema);

  const sql = await sqlReachable(paperId, depth);
  let cypher: { reachable: number; ms: number } | { error: string };
  try {
    cypher = await cypherReachable(paperId, depth);
  } catch (error) {
    cypher = { error: error instanceof Error ? error.message : "Neo4j unavailable" };
  }
  return json({
    paperId,
    depth,
    sql: { ...sql, query: SQL_REACHABLE },
    cypher: { ...cypher, query: CYPHER_REACHABLE(depth) },
  });
});
