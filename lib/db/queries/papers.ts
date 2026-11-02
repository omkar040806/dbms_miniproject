import { registerConstraintMessages } from "@/lib/api/db-errors";
import { HttpError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/token";
import { query, withTransaction } from "@/lib/db/pool";
import type { StoredPdf } from "@/lib/storage/pdf";
import type { MyPaper, PaperDetail, PaperLink, PaperPageData } from "@/lib/types";
import type { PaperUploadInput } from "@/lib/validation/paper";

registerConstraintMessages({
  uq_papers_doi_lower: "A paper with this DOI already exists",
  ck_papers_doi: "DOI must look like 10.1234/abc",
  ck_papers_year: "Publication year must be between 1900 and 2100",
  ck_papers_title: "Title must be at least 5 characters",
  ck_papers_abstract: "Abstract must be at most 10,000 characters",
  papers_domain_id_fkey: "The selected domain does not exist",
  papers_venue_id_fkey: "The selected venue does not exist",
  ck_papers_pdf_complete: "PDF path, size and checksum must be stored together",
});

/** Approved papers are public; others only for their uploader and admins. */
function canView(paper: { status: string; uploaded_by: number | null }, user: SessionUser | null): boolean {
  if (paper.status === "approved") return true;
  if (!user) return false;
  return user.role === "admin" || paper.uploaded_by === user.userId;
}

export async function getPaperPage(paperId: number, user: SessionUser | null): Promise<PaperPageData> {
  const { rows } = await query<PaperDetail>("SELECT * FROM v_paper_details WHERE paper_id = $1", [paperId]);
  const paper = rows[0];
  if (!paper || !canView(paper, user)) throw new HttpError(404, "Paper not found");

  // Two directions of the citations table, approved papers only.
  const [references, citedBy] = await Promise.all([
    query<PaperLink>(
      `SELECT vp.paper_id, vp.title, vp.publication_year, vp.author_names
       FROM citations c
       JOIN v_paper_details vp ON vp.paper_id = c.cited_paper_id
       WHERE c.citing_paper_id = $1 AND vp.status = 'approved'
       ORDER BY vp.publication_year DESC, vp.title
       LIMIT 100`,
      [paperId],
    ),
    query<PaperLink>(
      `SELECT vp.paper_id, vp.title, vp.publication_year, vp.author_names
       FROM citations c
       JOIN v_paper_details vp ON vp.paper_id = c.citing_paper_id
       WHERE c.cited_paper_id = $1 AND vp.status = 'approved'
       ORDER BY vp.publication_year DESC, vp.title
       LIMIT 100`,
      [paperId],
    ),
  ]);

  const canDelete = !!user && (user.role === "admin" || (paper.uploaded_by === user.userId && paper.status !== "approved"));
  return { paper, references: references.rows, citedBy: citedBy.rows, canDelete };
}

export async function recordView(paperId: number, userId: number | null): Promise<void> {
  await query("INSERT INTO paper_views (paper_id, user_id) VALUES ($1, $2)", [paperId, userId]);
}

/**
 * Upload = one transaction: the stored procedure inserts the paper, authors,
 * keywords and references, then the PDF metadata is attached. If anything fails,
 * ROLLBACK removes every row and the caller deletes the saved file.
 */
export async function createPaper(input: PaperUploadInput, user: SessionUser, pdf: StoredPdf | null): Promise<number> {
  return withTransaction(async (client) => {
    // Tells the audit trigger who is acting (SET LOCAL lasts until COMMIT/ROLLBACK).
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(user.userId)]);

    const result = await client.query<{ p_paper_id: number }>(
      `CALL sp_add_paper($1::text, $2::text, $3::text, $4::int, $5::int, $6::int, $7::int,
                         'pending'::text, $8::text[], $9::text[], $10::int[], NULL::int)`,
      [
        input.title,
        input.abstract,
        input.doi,
        input.publicationYear,
        input.venueId ?? null,
        input.domainId,
        user.userId,
        input.authors,
        input.keywords,
        input.citedPaperIds,
      ],
    );
    const paperId = result.rows[0].p_paper_id;

    if (pdf) {
      await client.query(
        "UPDATE papers SET pdf_path = $2, pdf_size_bytes = $3, pdf_sha256 = $4 WHERE paper_id = $1",
        [paperId, pdf.relativePath, pdf.sizeBytes, pdf.sha256],
      );
    }
    return paperId;
  });
}

/** Delete a paper. Uploaders may delete their own pending/rejected papers; admins any paper. */
export async function deletePaper(paperId: number, user: SessionUser, reason?: string): Promise<string | null> {
  return withTransaction(async (client) => {
    // FOR UPDATE locks the row so a concurrent approval cannot interleave with the delete.
    const { rows } = await client.query<{ status: string; uploaded_by: number | null; pdf_path: string | null }>(
      "SELECT status, uploaded_by, pdf_path FROM papers WHERE paper_id = $1 FOR UPDATE",
      [paperId],
    );
    const paper = rows[0];
    if (!paper) throw new HttpError(404, "Paper not found");

    const isOwner = paper.uploaded_by === user.userId;
    if (user.role !== "admin" && !(isOwner && paper.status !== "approved")) {
      throw new HttpError(403, "You can only delete your own papers that are not yet approved");
    }

    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(user.userId)]);
    if (reason) await client.query("SELECT set_config('app.moderation_reason', $1, true)", [reason]);
    await client.query("DELETE FROM papers WHERE paper_id = $1", [paperId]);
    return paper.pdf_path;
  });
}

export async function getPdfInfo(paperId: number): Promise<{ pdf_path: string | null; status: string; uploaded_by: number | null; title: string } | null> {
  const { rows } = await query<{ pdf_path: string | null; status: string; uploaded_by: number | null; title: string }>(
    "SELECT pdf_path, status, uploaded_by, title FROM papers WHERE paper_id = $1",
    [paperId],
  );
  return rows[0] ?? null;
}

export { canView as canViewPaper };

/** The current user's uploads, with the latest moderation reason (correlated subquery). */
export async function listMyPapers(userId: number): Promise<MyPaper[]> {
  const { rows } = await query<MyPaper>(
    `SELECT p.paper_id, p.title, p.publication_year, p.status, d.name AS domain_name, p.created_at,
            (SELECT m.reason
             FROM moderation_log m
             WHERE m.paper_id = p.paper_id AND m.reason IS NOT NULL
             ORDER BY m.created_at DESC
             LIMIT 1) AS last_reason
     FROM papers p
     JOIN domains d ON d.domain_id = p.domain_id
     WHERE p.uploaded_by = $1
     ORDER BY p.created_at DESC`,
    [userId],
  );
  return rows;
}
