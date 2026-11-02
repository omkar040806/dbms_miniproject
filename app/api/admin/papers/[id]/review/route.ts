import { apiHandler, json, parseBody, parseId, type RouteContext } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { reviewPaper } from "@/lib/db/queries/admin";
import { refreshAnalytics } from "@/lib/db/queries/analytics";
import { embedPaper } from "@/lib/db/queries/embeddings";
import { drainSyncQueue } from "@/lib/graph/sync";
import { reviewSchema } from "@/lib/validation/admin";

// POST /api/admin/papers/:id/review  { action: "approve" | "reject" | "reopen", reason? }
export const POST = apiHandler(async (request, { params }: RouteContext<{ id: string }>) => {
  const admin = await requireRole("admin");
  const paperId = parseId((await params).id);
  const { action, reason } = await parseBody(request, reviewSchema);

  // 1. The decision itself: one PostgreSQL transaction (status + audit + outbox jobs).
  const result = await reviewPaper(paperId, admin, action, reason);

  // 2. Follow-up work after COMMIT. If it fails the decision still stands:
  //    `npm run embed` and `npm run graph:sync` can catch up later.
  const warnings: string[] = [];
  if (result.status === "approved") {
    try {
      await embedPaper(paperId);
    } catch (error) {
      warnings.push(`Embedding not created yet: ${error instanceof Error ? error.message : error}`);
    }
  }
  try {
    await refreshAnalytics(); // keep the trends materialized view current
  } catch (error) {
    warnings.push(`Analytics not refreshed: ${error instanceof Error ? error.message : error}`);
  }
  try {
    await drainSyncQueue();
  } catch (error) {
    warnings.push(`Neo4j not updated yet (job kept in the queue): ${error instanceof Error ? error.message : error}`);
  }

  return json({ ...result, warnings });
});
