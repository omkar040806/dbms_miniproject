import { apiHandler, json, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { createCollection, listCollections } from "@/lib/db/queries/library";
import { collectionCreateSchema } from "@/lib/validation/library";

// GET /api/collections: the logged-in user's collections with paper counts.
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json({ collections: await listCollections(user.userId) });
});

// POST /api/collections  { name, description?, isPublic? }
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, collectionCreateSchema);
  return json({ collection: await createCollection(user.userId, input) }, 201);
});
