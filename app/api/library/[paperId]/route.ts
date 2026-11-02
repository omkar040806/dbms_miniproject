import { apiHandler, json, parseBody, parseId, type RouteContext } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { getPaperLibraryState, removeReadingEntry, upsertReadingEntry } from "@/lib/db/queries/library";
import { readingEntrySchema } from "@/lib/validation/library";

type Context = RouteContext<{ paperId: string }>;

// GET /api/library/:paperId: reading status, collections and notes for one paper.
export const GET = apiHandler(async (_request, { params }: Context) => {
  const user = await requireUser();
  const paperId = parseId((await params).paperId, "paperId");
  return json(await getPaperLibraryState(user.userId, paperId));
});

// PUT /api/library/:paperId  { status?, isBookmarked? }
export const PUT = apiHandler(async (request, { params }: Context) => {
  const user = await requireUser();
  const paperId = parseId((await params).paperId, "paperId");
  const changes = await parseBody(request, readingEntrySchema);
  return json(await upsertReadingEntry(user.userId, paperId, changes));
});

// DELETE /api/library/:paperId: remove from the reading list.
export const DELETE = apiHandler(async (_request, { params }: Context) => {
  const user = await requireUser();
  await removeReadingEntry(user.userId, parseId((await params).paperId, "paperId"));
  return json({ ok: true });
});
