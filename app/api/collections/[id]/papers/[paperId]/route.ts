import { apiHandler, json, parseId, type RouteContext } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { removePaperFromCollection } from "@/lib/db/queries/library";

// DELETE /api/collections/:id/papers/:paperId
export const DELETE = apiHandler(async (_request, { params }: RouteContext<{ id: string; paperId: string }>) => {
  const user = await requireUser();
  const { id, paperId } = await params;
  await removePaperFromCollection(user.userId, parseId(id), parseId(paperId, "paperId"));
  return json({ ok: true });
});
