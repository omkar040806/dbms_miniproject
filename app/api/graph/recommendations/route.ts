import { apiHandler, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { libraryPaperIds } from "@/lib/db/queries/graph-sql";
import { recommendFromPapers } from "@/lib/graph/queries";

// GET /api/graph/recommendations: suggestions from the citation graph for the user's saved papers.
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const saved = await libraryPaperIds(user.userId); // PostgreSQL: what the user saved
  return json({ basedOn: saved.length, recommendations: await recommendFromPapers(saved) }); // Neo4j: graph patterns
});
