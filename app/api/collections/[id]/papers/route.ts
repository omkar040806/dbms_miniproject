import { apiHandler, json, parseBody, parseId, type RouteContext } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { addPaperToCollection } from "@/lib/db/queries/library";
import { collectionPaperSchema } from "@/lib/validation/library";

// POST /api/collections/:id/papers  { paperId }
export const POST = apiHandler(async (request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireUser();
  const { paperId } = await parseBody(request, collectionPaperSchema);
  await addPaperToCollection(user.userId, parseId((await params).id), paperId);
  return json({ ok: true }, 201);
});
