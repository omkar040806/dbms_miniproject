import { apiHandler, json, parseId, type RouteContext } from "@/lib/api/http";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { deletePaper, getPaperPage, recordView } from "@/lib/db/queries/papers";
import { deletePdf } from "@/lib/storage/pdf";

// GET /api/papers/:id: paper details with references and citing papers.
export const GET = apiHandler(async (_request, { params }: RouteContext<{ id: string }>) => {
  const paperId = parseId((await params).id);
  const user = await getCurrentUser();
  const data = await getPaperPage(paperId, user);
  if (data.paper.status === "approved") await recordView(paperId, user?.userId ?? null);
  return json(data);
});

// DELETE /api/papers/:id: owners delete their own pending/rejected uploads; admins any paper.
export const DELETE = apiHandler(async (_request, { params }: RouteContext<{ id: string }>) => {
  const paperId = parseId((await params).id);
  const user = await requireUser();
  const pdfPath = await deletePaper(paperId, user);
  await deletePdf(pdfPath);
  return json({ ok: true });
});
