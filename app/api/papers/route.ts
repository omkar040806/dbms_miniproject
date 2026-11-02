import { apiHandler, HttpError, json } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/session";
import { createPaper } from "@/lib/db/queries/papers";
import { deletePdf, savePdf, type StoredPdf } from "@/lib/storage/pdf";
import { paperUploadSchema } from "@/lib/validation/paper";

// POST /api/papers (multipart/form-data): submit a paper for moderation.
export const POST = apiHandler(async (request) => {
  const user = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }

  const input = paperUploadSchema.parse({
    title: form.get("title"),
    abstract: form.get("abstract") ?? "",
    doi: form.get("doi") ?? "",
    publicationYear: form.get("publicationYear"),
    domainId: form.get("domainId"),
    venueId: form.get("venueId"),
    authors: form.get("authors"),
    keywords: form.get("keywords") ?? "",
    citedPaperIds: form.get("citedPaperIds") ?? "",
  });

  const file = form.get("pdf");
  let stored: StoredPdf | null = null;
  if (file instanceof File && file.size > 0) {
    stored = await savePdf(file);
  }

  try {
    const paperId = await createPaper(input, user, stored);
    return json({ paperId, status: "pending" }, 201);
  } catch (error) {
    // The transaction rolled back, so remove the orphaned file too.
    await deletePdf(stored?.relativePath);
    throw error;
  }
});
