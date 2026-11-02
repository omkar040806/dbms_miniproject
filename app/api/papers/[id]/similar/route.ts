import { apiHandler, json, parseId, type RouteContext } from "@/lib/api/http";
import { similarPapers } from "@/lib/db/queries/search";

// GET /api/papers/:id/similar: nearest neighbours by embedding (empty if not embedded yet).
export const GET = apiHandler(async (_request, { params }: RouteContext<{ id: string }>) => {
  const paperId = parseId((await params).id);
  return json({ papers: await similarPapers(paperId) });
});
