import { apiHandler, HttpError, parseId, type RouteContext } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewPaper, getPdfInfo } from "@/lib/db/queries/papers";
import { readPdf } from "@/lib/storage/pdf";

// GET /api/papers/:id/pdf: stream the uploaded PDF if the viewer may see the paper.
export const GET = apiHandler(async (_request, { params }: RouteContext<{ id: string }>) => {
  const paperId = parseId((await params).id);
  const info = await getPdfInfo(paperId);
  const user = await getCurrentUser();
  if (!info || !canViewPaper(info, user) || !info.pdf_path) throw new HttpError(404, "PDF not found");

  const bytes = await readPdf(info.pdf_path);
  const filename = info.title.replace(/[^\w\s-]/g, "").trim().slice(0, 80) || `paper-${paperId}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
