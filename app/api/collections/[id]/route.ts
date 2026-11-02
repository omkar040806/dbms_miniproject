import { apiHandler, json, parseBody, parseId, type RouteContext } from "@/lib/api/http";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { deleteCollection, getCollection, updateCollection } from "@/lib/db/queries/library";
import { collectionUpdateSchema } from "@/lib/validation/library";

type Context = RouteContext<{ id: string }>;

// GET /api/collections/:id: public collections are visible to everyone, private ones to the owner.
export const GET = apiHandler(async (_request, { params }: Context) => {
  const collectionId = parseId((await params).id);
  return json(await getCollection(collectionId, await getCurrentUser()));
});

// PATCH /api/collections/:id  { name?, description?, isPublic? }
export const PATCH = apiHandler(async (request, { params }: Context) => {
  const user = await requireUser();
  const changes = await parseBody(request, collectionUpdateSchema);
  return json({ collection: await updateCollection(user.userId, parseId((await params).id), changes) });
});

// DELETE /api/collections/:id (its paper links are removed by ON DELETE CASCADE)
export const DELETE = apiHandler(async (_request, { params }: Context) => {
  const user = await requireUser();
  await deleteCollection(user.userId, parseId((await params).id));
  return json({ ok: true });
});
