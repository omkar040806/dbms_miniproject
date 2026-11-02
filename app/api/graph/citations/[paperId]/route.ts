import { apiHandler, json, parseId, parseQuery, type RouteContext } from "@/lib/api/http";
import { citationNeighborhood } from "@/lib/graph/queries";
import { depthSchema } from "@/lib/validation/graph";

// GET /api/graph/citations/:paperId?depth=1..3: citation neighbourhood from Neo4j.
export const GET = apiHandler(async (request, { params }: RouteContext<{ paperId: string }>) => {
  const paperId = parseId((await params).paperId, "paperId");
  const { depth } = parseQuery(request, depthSchema);
  return json({ center: paperId, depth, ...(await citationNeighborhood(paperId, depth as 1 | 2 | 3)) });
});
