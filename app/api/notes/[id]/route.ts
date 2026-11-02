import { apiHandler, json, parseBody, parseId, type RouteContext } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { deleteNote, updateNote } from "@/lib/db/queries/library";
import { noteUpdateSchema } from "@/lib/validation/library";

type Context = RouteContext<{ id: string }>;

// PATCH /api/notes/:id  { body }
export const PATCH = apiHandler(async (request, { params }: Context) => {
  const user = await requireUser();
  const { body } = await parseBody(request, noteUpdateSchema);
  return json({ note: await updateNote(user.userId, parseId((await params).id), body) });
});

// DELETE /api/notes/:id
export const DELETE = apiHandler(async (_request, { params }: Context) => {
  const user = await requireUser();
  await deleteNote(user.userId, parseId((await params).id));
  return json({ ok: true });
});
