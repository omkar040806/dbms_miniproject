import { apiHandler, json, parseId, type RouteContext } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { deletePaper } from "@/lib/db/queries/papers";
import { drainSyncQueue } from "@/lib/graph/sync";
import { deletePdf } from "@/lib/storage/pdf";
import { adminDeleteSchema } from "@/lib/validation/admin";

// DELETE /api/admin/papers/:id?reason=...: admins may delete any paper; the trigger logs it.
export const DELETE = apiHandler(async (request, { params }: RouteContext<{ id: string }>) => {
  const admin = await requireRole("admin");
  const paperId = parseId((await params).id);
  const { reason } = adminDeleteSchema.parse({ reason: request.nextUrl.searchParams.get("reason") ?? "" });
  const pdfPath = await deletePaper(paperId, admin, reason || undefined);
  await deletePdf(pdfPath);
  // Remove the paper from Neo4j too; if Neo4j is down the job waits in the queue.
  await drainSyncQueue().catch(() => undefined);
  return json({ ok: true });
});
