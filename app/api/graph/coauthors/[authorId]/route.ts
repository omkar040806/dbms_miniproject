import { apiHandler, json, parseId, type RouteContext } from "@/lib/api/http";
import { coauthorNetwork } from "@/lib/graph/queries";

// GET /api/graph/coauthors/:authorId: two-hop co-author network from Neo4j.
export const GET = apiHandler(async (_request, { params }: RouteContext<{ authorId: string }>) => {
  const authorId = parseId((await params).authorId, "authorId");
  return json({ center: authorId, ...(await coauthorNetwork(authorId)) });
});
