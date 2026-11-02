// Triggers and user-table rules (Member B). Each test runs in a rolled-back transaction.
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { expectDbError, hasDatabase, insertUser, TEST_HASH, withRollback } from "./helpers";

const describeDb = describe.skipIf(!hasDatabase);

async function newPaper(client: Client, status = "pending", uploadedBy: number | null = null): Promise<number> {
  const { rows } = await client.query<{ paper_id: number }>(
    `INSERT INTO papers (title, publication_year, domain_id, status, uploaded_by)
     VALUES ('Trigger test paper', 2024, (SELECT domain_id FROM domains WHERE name = 'Database Systems'), $1, $2)
     RETURNING paper_id`,
    [status, uploadedBy],
  );
  return rows[0].paper_id;
}

async function actAs(client: Client, userId: number, reason = ""): Promise<void> {
  await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.moderation_reason', $2, true)", [String(userId), reason]);
}

async function count(client: Client, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ n: string }>(sql, params);
  return Number(rows[0].n);
}

describeDb("users table rules", () => {
  it("rejects a plain-text password", () =>
    withRollback(async (client) => {
      await expectDbError(client, "INSERT INTO users (full_name, email, password_hash) VALUES ('Plain', 'plain@example.com', 'password123')", [], {
        code: "23514",
        constraint: "ck_users_password_is_bcrypt",
      });
    }));

  it("treats emails case-insensitively (CITEXT + UNIQUE)", () =>
    withRollback(async (client) => {
      await insertUser(client, "Case@Example.com");
      await expectDbError(client, "INSERT INTO users (full_name, email, password_hash) VALUES ('Dup', 'case@example.COM', $1)", [TEST_HASH], {
        code: "23505",
        constraint: "uq_users_email",
      });
    }));

  it("only allows the researcher and admin roles", () =>
    withRollback(async (client) => {
      await expectDbError(client, "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Boss', 'boss@example.com', $1, 'superuser')", [TEST_HASH], {
        code: "23514",
        constraint: "ck_users_role",
      });
    }));
});

describeDb("citation count trigger", () => {
  it("increments on insert and decrements on delete", () =>
    withRollback(async (client) => {
      const a = await newPaper(client, "approved");
      const b = await newPaper(client, "approved");
      await client.query("INSERT INTO citations VALUES ($1, $2)", [a, b]);
      expect(await count(client, "SELECT citation_count AS n FROM papers WHERE paper_id = $1", [b])).toBe(1);
      await client.query("DELETE FROM citations WHERE citing_paper_id = $1", [a]);
      expect(await count(client, "SELECT citation_count AS n FROM papers WHERE paper_id = $1", [b])).toBe(0);
    }));

  it("rejects self-citations", () =>
    withRollback(async (client) => {
      const a = await newPaper(client);
      await expectDbError(client, "INSERT INTO citations VALUES ($1, $1)", [a], { code: "23514", constraint: "ck_citations_no_self" });
    }));
});

describeDb("moderation audit triggers", () => {
  it("logs submission, approval with actor and reason, and deletion", () =>
    withRollback(async (client) => {
      const author = await insertUser(client, "uploader@example.com");
      const admin = await insertUser(client, "moderator@example.com", "admin");
      const paperId = await newPaper(client, "pending", author);

      await actAs(client, admin, "Well documented");
      await client.query("UPDATE papers SET status = 'approved' WHERE paper_id = $1", [paperId]);

      const log = await client.query("SELECT action, actor_id, old_status, new_status, reason FROM moderation_log WHERE paper_id = $1 ORDER BY log_id", [paperId]);
      expect(log.rows).toEqual([
        { action: "submit", actor_id: author, old_status: null, new_status: "pending", reason: null },
        { action: "approve", actor_id: admin, old_status: "pending", new_status: "approved", reason: "Well documented" },
      ]);

      await client.query("DELETE FROM papers WHERE paper_id = $1", [paperId]);
      const deleted = await client.query("SELECT paper_id, action FROM moderation_log WHERE action = 'delete' AND paper_title = 'Trigger test paper'");
      expect(deleted.rows).toEqual([{ paper_id: null, action: "delete" }]);
    }));

  it("refuses a rejection without a reason and keeps the old status", () =>
    withRollback(async (client) => {
      const admin = await insertUser(client, "strict@example.com", "admin");
      const paperId = await newPaper(client, "pending");
      await actAs(client, admin, "");
      await expectDbError(client, "UPDATE papers SET status = 'rejected' WHERE paper_id = $1", [paperId], {
        code: "23514",
        constraint: "ck_modlog_reject_reason",
      });
      const { rows } = await client.query("SELECT status FROM papers WHERE paper_id = $1", [paperId]);
      expect(rows[0].status).toBe("pending");
    }));
});

describeDb("updated_at trigger", () => {
  it("changes on real edits but not when only citation_count changes", () =>
    withRollback(async (client) => {
      const paperId = await newPaper(client);
      await client.query("UPDATE papers SET updated_at = '2000-01-01' WHERE paper_id = $1", [paperId]);
      await client.query("UPDATE papers SET citation_count = citation_count + 1 WHERE paper_id = $1", [paperId]);
      const before = await client.query("SELECT updated_at FROM papers WHERE paper_id = $1", [paperId]);
      expect(new Date(before.rows[0].updated_at).getUTCFullYear()).toBe(2000);

      await client.query("UPDATE papers SET title = 'Edited trigger test paper' WHERE paper_id = $1", [paperId]);
      const after = await client.query("SELECT updated_at FROM papers WHERE paper_id = $1", [paperId]);
      expect(new Date(after.rows[0].updated_at).getUTCFullYear()).toBeGreaterThan(2000);
    }));
});

describeDb("graph sync outbox triggers", () => {
  it("queues upserts for approved papers and deletes when they leave approved", () =>
    withRollback(async (client) => {
      const start = await count(client, "SELECT COALESCE(MAX(job_id), 0) AS n FROM graph_sync_queue");
      const paperId = await newPaper(client, "pending");
      expect(await count(client, "SELECT COUNT(*) AS n FROM graph_sync_queue WHERE job_id > $1 AND entity = 'paper'", [start])).toBe(0);

      // Approve, then reopen (back to pending): one upsert job, then one delete job.
      await client.query("UPDATE papers SET status = 'approved' WHERE paper_id = $1", [paperId]);
      await client.query("UPDATE papers SET status = 'pending' WHERE paper_id = $1", [paperId]);
      const jobs = await client.query("SELECT entity, op, payload FROM graph_sync_queue WHERE job_id > $1 ORDER BY job_id", [start]);
      expect(jobs.rows).toEqual([
        { entity: "paper", op: "upsert", payload: { paper_id: paperId } },
        { entity: "paper", op: "delete", payload: { paper_id: paperId } },
      ]);
    }));

  it("queues citation jobs", () =>
    withRollback(async (client) => {
      const a = await newPaper(client, "approved");
      const b = await newPaper(client, "approved");
      const start = await count(client, "SELECT COALESCE(MAX(job_id), 0) AS n FROM graph_sync_queue");
      await client.query("INSERT INTO citations VALUES ($1, $2)", [a, b]);
      const jobs = await client.query("SELECT entity, op, payload FROM graph_sync_queue WHERE job_id > $1", [start]);
      expect(jobs.rows).toEqual([{ entity: "citation", op: "upsert", payload: { citing: a, cited: b } }]);
    }));
});
