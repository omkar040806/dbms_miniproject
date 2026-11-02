import { registerConstraintMessages } from "@/lib/api/db-errors";
import { HttpError } from "@/lib/api/http";
import type { Role, SessionUser } from "@/lib/auth/token";
import { query, withTransaction } from "@/lib/db/pool";
import type { PaperDetail, PaperStatus } from "@/lib/types";

registerConstraintMessages({
  ck_modlog_reject_reason: "A rejection needs a reason of at least 5 characters",
});

export interface ReviewItem extends PaperDetail {
  uploader_name: string | null;
  uploader_email: string | null;
}

export async function listPapersForReview(status: PaperStatus) {
  const [papers, counts] = await Promise.all([
    query<ReviewItem>(
      `SELECT vp.*, u.full_name AS uploader_name, u.email AS uploader_email
       FROM v_paper_details vp
       LEFT JOIN users u ON u.user_id = vp.uploaded_by
       WHERE vp.status = $1
       ORDER BY CASE WHEN $1 = 'pending' THEN vp.created_at END ASC,
                vp.updated_at DESC
       LIMIT 50`,
      [status],
    ),
    query<{ status: PaperStatus; count: number }>("SELECT status, COUNT(*) AS count FROM papers GROUP BY status"),
  ]);
  const totals = { pending: 0, approved: 0, rejected: 0 };
  for (const row of counts.rows) totals[row.status] = row.count;
  return { papers: papers.rows, totals };
}

const TARGET: Record<"approve" | "reject" | "reopen", PaperStatus> = {
  approve: "approved",
  reject: "rejected",
  reopen: "pending",
};

/**
 * Approve, reject or reopen a paper in one transaction.
 * SELECT ... FOR UPDATE locks the paper row, so if two admins click at the same
 * moment the second one waits and then sees the first one's decision.
 * The audit row is written by trigger trg_papers_moderation_update, which reads the
 * acting admin and the reason from transaction-local settings.
 */
export async function reviewPaper(
  paperId: number,
  admin: SessionUser,
  action: "approve" | "reject" | "reopen",
  reason: string,
): Promise<{ paperId: number; status: PaperStatus; previous: PaperStatus }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ status: PaperStatus }>("SELECT status FROM papers WHERE paper_id = $1 FOR UPDATE", [paperId]);
    if (!rows[0]) throw new HttpError(404, "Paper not found");

    const previous = rows[0].status;
    const target = TARGET[action];
    if (previous === target) throw new HttpError(409, `Paper is already ${target}`);

    await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.moderation_reason', $2, true)", [
      String(admin.userId),
      reason,
    ]);
    await client.query("UPDATE papers SET status = $2 WHERE paper_id = $1", [paperId, target]);
    return { paperId, status: target, previous };
  });
}

export interface ModerationLogRow {
  log_id: number;
  paper_id: number | null;
  paper_title: string;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  old_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
}

export async function listModerationLog(limit = 100): Promise<ModerationLogRow[]> {
  const { rows } = await query<ModerationLogRow>(
    `SELECT m.log_id, m.paper_id, m.paper_title, m.actor_id, u.full_name AS actor_name,
            m.action, m.old_status, m.new_status, m.reason, m.created_at
     FROM moderation_log m
     LEFT JOIN users u ON u.user_id = m.actor_id
     ORDER BY m.created_at DESC, m.log_id DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

export interface AdminUserRow {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  uploads: number;
  approved_uploads: number;
}

export async function listUsers(search: string): Promise<AdminUserRow[]> {
  const { rows } = await query<AdminUserRow>(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.created_at, u.last_login_at,
            COUNT(p.paper_id) AS uploads,
            COUNT(p.paper_id) FILTER (WHERE p.status = 'approved') AS approved_uploads
     FROM users u
     LEFT JOIN papers p ON p.uploaded_by = u.user_id
     WHERE $1 = '' OR u.full_name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%'
     GROUP BY u.user_id
     ORDER BY u.created_at DESC
     LIMIT 200`,
    [search.replace(/[\\%_]/g, (c) => `\\${c}`)],
  );
  return rows;
}

/**
 * Change a user's role or active flag. An admin cannot change their own account,
 * and the last active admin can never be demoted or deactivated.
 */
export async function updateUser(admin: SessionUser, userId: number, changes: { role?: Role; isActive?: boolean }) {
  if (userId === admin.userId) throw new HttpError(400, "You cannot change your own role or status");

  return withTransaction(async (client) => {
    // Lock all active admin rows so two concurrent demotions cannot both pass the check.
    const admins = await client.query<{ user_id: number }>(
      "SELECT user_id FROM users WHERE role = 'admin' AND is_active ORDER BY user_id FOR UPDATE",
    );
    const target = await client.query<{ role: Role; is_active: boolean }>("SELECT role, is_active FROM users WHERE user_id = $1 FOR UPDATE", [userId]);
    if (!target.rows[0]) throw new HttpError(404, "User not found");

    const losesAdmin = target.rows[0].role === "admin" && target.rows[0].is_active && (changes.role === "researcher" || changes.isActive === false);
    if (losesAdmin && admins.rows.length <= 1) throw new HttpError(409, "The platform needs at least one active admin");

    const { rows } = await client.query<AdminUserRow>(
      `UPDATE users
       SET role = COALESCE($2, role), is_active = COALESCE($3, is_active)
       WHERE user_id = $1
       RETURNING user_id, full_name, email, role, is_active, created_at, last_login_at`,
      [userId, changes.role ?? null, changes.isActive ?? null],
    );
    return rows[0];
  });
}
