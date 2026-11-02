import { apiHandler, json, parseBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { createNote } from "@/lib/db/queries/library";
import { noteCreateSchema } from "@/lib/validation/library";

// POST /api/notes  { paperId, body }: notes are private to their author.
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  const { paperId, body } = await parseBody(request, noteCreateSchema);
  return json({ note: await createNote(user.userId, paperId, body) }, 201);
});
