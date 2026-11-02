// Helpers for database tests. Every test runs inside a transaction that is
// rolled back at the end, so tests never leave data behind.
import { Client } from "pg";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export async function withRollback(work: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

interface PgErrorShape {
  code?: string;
  constraint?: string;
}

/**
 * Run a statement that MUST fail. A savepoint lets the surrounding transaction
 * continue after the expected error. Returns the error so tests can inspect it.
 */
export async function expectDbError(
  client: Client,
  sql: string,
  params: unknown[],
  expected: { code: string; constraint?: string },
): Promise<PgErrorShape> {
  await client.query("SAVEPOINT expect_error");
  try {
    await client.query(sql, params);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT expect_error");
    const pgError = error as PgErrorShape;
    if (pgError.code !== expected.code || (expected.constraint && pgError.constraint !== expected.constraint)) {
      throw new Error(
        `Expected ${expected.code}${expected.constraint ? ` on ${expected.constraint}` : ""}, got ${pgError.code} on ${pgError.constraint}`,
      );
    }
    return pgError;
  }
  throw new Error(`Statement should have failed with ${expected.code}: ${sql}`);
}

/** A syntactically valid bcrypt hash for inserting test users. */
export const TEST_HASH = "$2b$12$raEFZN/5M5qwUZG6ByL5gepEccU0O6kJjfSE8K1prfXPm1JLN7jBK";

export async function insertUser(client: Client, email: string, role: "researcher" | "admin" = "researcher"): Promise<number> {
  const { rows } = await client.query<{ user_id: number }>(
    "INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id",
    ["Test User", email, TEST_HASH, role],
  );
  return rows[0].user_id;
}
