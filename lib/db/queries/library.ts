import { registerConstraintMessages } from "@/lib/api/db-errors";
import { HttpError } from "@/lib/api/http";
import type { SessionUser } from "@/lib/auth/token";
import { query } from "@/lib/db/pool";
import type { PaperSummary, ReadingStatus } from "@/lib/types";

registerConstraintMessages({
  uq_collections_user_name: "You already have a collection with this name",
  ck_collections_name: "Collection name cannot be empty",
  ck_notes_body: "Notes must be between 1 and 5000 characters",
  ck_reading_list_status: "Status must be to_read, reading or read",
});

const SUMMARY = `vp.paper_id, vp.title, vp.publication_year, vp.status, vp.domain_id, vp.domain_name,
  vp.venue_name, vp.venue_type, vp.author_names, vp.keywords, vp.citation_count, vp.external_citation_count`;

export interface LibraryEntry extends PaperSummary {
  reading_status: ReadingStatus;
  is_bookmarked: boolean;
  updated_at: string;
}

export interface CollectionRow {
  collection_id: number;
  user_id: number;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  paper_count: number;
}

export interface NoteRow {
  note_id: number;
  paper_id: number;
  body: string;
  created_at: string;
  updated_at: string;
}

async function assertApprovedPaper(paperId: number): Promise<void> {
  const { rows } = await query("SELECT 1 FROM papers WHERE paper_id = $1 AND status = 'approved'", [paperId]);
  if (!rows[0]) throw new HttpError(404, "Paper not found");
}

// ---------- reading list ----------

export async function getLibrary(userId: number) {
  const [entries, counts, collections] = await Promise.all([
    query<LibraryEntry>(
      `SELECT ${SUMMARY}, rl.status AS reading_status, rl.is_bookmarked, rl.updated_at
       FROM reading_list rl
       JOIN v_paper_details vp ON vp.paper_id = rl.paper_id
       WHERE rl.user_id = $1
       ORDER BY rl.updated_at DESC`,
      [userId],
    ),
    // Aggregate FILTER clauses: several counts from one pass over the rows.
    query<{ to_read: number; reading: number; read: number; bookmarked: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'to_read') AS to_read,
              COUNT(*) FILTER (WHERE status = 'reading') AS reading,
              COUNT(*) FILTER (WHERE status = 'read')    AS read,
              COUNT(*) FILTER (WHERE is_bookmarked)      AS bookmarked,
              COUNT(*)                                   AS total
       FROM reading_list
       WHERE user_id = $1`,
      [userId],
    ),
    listCollections(userId),
  ]);
  return { entries: entries.rows, counts: counts.rows[0], collections };
}

/** INSERT a new entry or UPDATE only the fields that were sent (UPSERT). */
export async function upsertReadingEntry(
  userId: number,
  paperId: number,
  changes: { status?: ReadingStatus; isBookmarked?: boolean },
) {
  await assertApprovedPaper(paperId);
  const { rows } = await query<{ status: ReadingStatus; is_bookmarked: boolean }>(
    `INSERT INTO reading_list (user_id, paper_id, status, is_bookmarked)
     VALUES ($1, $2, COALESCE($3, 'to_read'), COALESCE($4, FALSE))
     ON CONFLICT (user_id, paper_id) DO UPDATE
       SET status        = COALESCE($3, reading_list.status),
           is_bookmarked = COALESCE($4, reading_list.is_bookmarked)
     RETURNING status, is_bookmarked`,
    [userId, paperId, changes.status ?? null, changes.isBookmarked ?? null],
  );
  return rows[0];
}

export async function removeReadingEntry(userId: number, paperId: number): Promise<void> {
  await query("DELETE FROM reading_list WHERE user_id = $1 AND paper_id = $2", [userId, paperId]);
}

/** Everything the paper page needs about the current user's relation to one paper. */
export async function getPaperLibraryState(userId: number, paperId: number) {
  const [entry, collections, notes] = await Promise.all([
    query<{ status: ReadingStatus; is_bookmarked: boolean }>(
      "SELECT status, is_bookmarked FROM reading_list WHERE user_id = $1 AND paper_id = $2",
      [userId, paperId],
    ),
    query<{ collection_id: number; name: string; contains: boolean }>(
      `SELECT c.collection_id, c.name,
              EXISTS (SELECT 1 FROM collection_papers cp
                      WHERE cp.collection_id = c.collection_id AND cp.paper_id = $2) AS contains
       FROM collections c
       WHERE c.user_id = $1
       ORDER BY c.name`,
      [userId, paperId],
    ),
    listNotes(userId, paperId),
  ]);
  return { entry: entry.rows[0] ?? null, collections: collections.rows, notes };
}

// ---------- collections ----------

export async function listCollections(userId: number): Promise<CollectionRow[]> {
  const { rows } = await query<CollectionRow>(
    `SELECT c.collection_id, c.user_id, c.name, c.description, c.is_public, c.created_at,
            COUNT(cp.paper_id) AS paper_count
     FROM collections c
     LEFT JOIN collection_papers cp ON cp.collection_id = c.collection_id
     WHERE c.user_id = $1
     GROUP BY c.collection_id
     ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getCollection(collectionId: number, viewer: SessionUser | null) {
  const { rows } = await query<CollectionRow & { owner_name: string }>(
    `SELECT c.collection_id, c.user_id, c.name, c.description, c.is_public, c.created_at,
            u.full_name AS owner_name,
            (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_id = c.collection_id) AS paper_count
     FROM collections c
     JOIN users u ON u.user_id = c.user_id
     WHERE c.collection_id = $1`,
    [collectionId],
  );
  const collection = rows[0];
  const isOwner = !!viewer && collection?.user_id === viewer.userId;
  if (!collection || (!collection.is_public && !isOwner)) throw new HttpError(404, "Collection not found");

  const papers = await query<PaperSummary & { added_at: string }>(
    `SELECT ${SUMMARY}, cp.added_at
     FROM collection_papers cp
     JOIN v_paper_details vp ON vp.paper_id = cp.paper_id
     WHERE cp.collection_id = $1 AND vp.status = 'approved'
     ORDER BY cp.added_at DESC`,
    [collectionId],
  );
  return { collection, papers: papers.rows, isOwner };
}

export async function createCollection(userId: number, input: { name: string; description: string; isPublic: boolean }) {
  const { rows } = await query<CollectionRow>(
    `INSERT INTO collections (user_id, name, description, is_public)
     VALUES ($1, $2, NULLIF($3, ''), $4)
     RETURNING *, 0 AS paper_count`,
    [userId, input.name, input.description, input.isPublic],
  );
  return rows[0];
}

export async function updateCollection(
  userId: number,
  collectionId: number,
  changes: { name?: string; description?: string; isPublic?: boolean },
) {
  const { rows } = await query<CollectionRow>(
    `UPDATE collections
     SET name        = COALESCE($3, name),
         description = CASE WHEN $4::text IS NULL THEN description ELSE NULLIF($4, '') END,
         is_public   = COALESCE($5, is_public)
     WHERE collection_id = $1 AND user_id = $2
     RETURNING *`,
    [collectionId, userId, changes.name ?? null, changes.description ?? null, changes.isPublic ?? null],
  );
  if (!rows[0]) throw new HttpError(404, "Collection not found");
  return rows[0];
}

export async function deleteCollection(userId: number, collectionId: number): Promise<void> {
  const result = await query("DELETE FROM collections WHERE collection_id = $1 AND user_id = $2", [collectionId, userId]);
  if (result.rowCount === 0) throw new HttpError(404, "Collection not found");
}

export async function addPaperToCollection(userId: number, collectionId: number, paperId: number): Promise<void> {
  await assertApprovedPaper(paperId);
  // INSERT ... SELECT ... WHERE EXISTS: only inserts when the collection belongs to this user.
  const result = await query(
    `INSERT INTO collection_papers (collection_id, paper_id)
     SELECT $1, $3
     WHERE EXISTS (SELECT 1 FROM collections WHERE collection_id = $1 AND user_id = $2)
     ON CONFLICT DO NOTHING`,
    [collectionId, userId, paperId],
  );
  if (result.rowCount === 0) {
    const owned = await query("SELECT 1 FROM collections WHERE collection_id = $1 AND user_id = $2", [collectionId, userId]);
    if (!owned.rows[0]) throw new HttpError(404, "Collection not found");
  }
}

export async function removePaperFromCollection(userId: number, collectionId: number, paperId: number): Promise<void> {
  // DELETE ... USING joins collections to check ownership in the same statement.
  await query(
    `DELETE FROM collection_papers cp
     USING collections c
     WHERE cp.collection_id = c.collection_id
       AND c.collection_id = $1 AND c.user_id = $2 AND cp.paper_id = $3`,
    [collectionId, userId, paperId],
  );
}

// ---------- notes ----------

export async function listNotes(userId: number, paperId: number): Promise<NoteRow[]> {
  const { rows } = await query<NoteRow>(
    `SELECT note_id, paper_id, body, created_at, updated_at
     FROM notes WHERE user_id = $1 AND paper_id = $2
     ORDER BY created_at DESC`,
    [userId, paperId],
  );
  return rows;
}

export async function createNote(userId: number, paperId: number, body: string): Promise<NoteRow> {
  await assertApprovedPaper(paperId);
  const { rows } = await query<NoteRow>(
    `INSERT INTO notes (user_id, paper_id, body) VALUES ($1, $2, $3)
     RETURNING note_id, paper_id, body, created_at, updated_at`,
    [userId, paperId, body],
  );
  return rows[0];
}

export async function updateNote(userId: number, noteId: number, body: string): Promise<NoteRow> {
  const { rows } = await query<NoteRow>(
    `UPDATE notes SET body = $3 WHERE note_id = $1 AND user_id = $2
     RETURNING note_id, paper_id, body, created_at, updated_at`,
    [noteId, userId, body],
  );
  if (!rows[0]) throw new HttpError(404, "Note not found");
  return rows[0];
}

export async function deleteNote(userId: number, noteId: number): Promise<void> {
  const result = await query("DELETE FROM notes WHERE note_id = $1 AND user_id = $2", [noteId, userId]);
  if (result.rowCount === 0) throw new HttpError(404, "Note not found");
}
