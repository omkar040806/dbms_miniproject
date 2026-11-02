import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// PostgreSQL returns BIGINT (COUNT(*), SUM of INT) and NUMERIC as strings by default.
// Our counts are far below 2^53, so parse them into JavaScript numbers.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));

// Keep one pool per server process (Next.js dev reloads modules on every change).
const globalForPg = globalThis as unknown as { rpPool?: Pool };

export function getPool(): Pool {
  if (!globalForPg.rpPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    }
    globalForPg.rpPool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return globalForPg.rpPool;
}

/**
 * Run one parameterized statement. Always pass user input through `params`
 * ($1, $2, ...) and never by string concatenation: this blocks SQL injection.
 */
export function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

/**
 * Run `work` inside BEGIN ... COMMIT on a single connection.
 * Any thrown error triggers ROLLBACK, so either every statement is saved or none is.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type DbClient = Pick<PoolClient, "query">;
