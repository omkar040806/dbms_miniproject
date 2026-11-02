import { apiHandler, json, parseQuery } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { listPapersForReview } from "@/lib/db/queries/admin";
import { reviewListSchema } from "@/lib/validation/admin";

// GET /api/admin/papers?status=pending: moderation queue (admin only).
export const GET = apiHandler(async (request) => {
  await requireRole("admin");
  const { status } = parseQuery(request, reviewListSchema);
  return json(await listPapersForReview(status));
});
