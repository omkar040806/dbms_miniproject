/**
 * Minimal migration runner.
 *
 *   npm run db:migrate   apply every db/migrations/*.sql file not yet applied, in order
 *   npm run db:status    list applied and pending migrations
 *   npm run db:reset     DROP the whole public schema and re-apply everything (development only)
 *
 * Each file runs inside its own transaction: a failing migration leaves the schema unchanged.
 * Uses MIGRATION_DATABASE_URL (the owner role) because app_user cannot CREATE or DROP tables.
 */
import "./lib/env";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve("db/migrations");

async function main() {
  const args = new Set(process.argv.slice(2));
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Set MIGRATION_DATABASE_URL (owner role) in .env");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    if (args.has("--reset")) {
      if (!args.has("--yes")) {
        console.error("db:reset deletes ALL data. Re-run with --yes to confirm.");
        process.exit(1);
      }
      console.log("Dropping schema public ...");
      await client.query("DROP SCHEMA IF EXISTS public CASCADE");
      await client.query("CREATE SCHEMA public");
      await client.query(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN GRANT USAGE ON SCHEMA public TO app_user; END IF; END $$",
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(200) PRIMARY KEY,
        checksum    CHAR(64)     NOT NULL,
        applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
      )`);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    const applied = new Map(
      (await client.query<{ filename: string; checksum: string }>("SELECT filename, checksum FROM schema_migrations")).rows.map(
        (r) => [r.filename, r.checksum],
      ),
    );

    let pending = 0;
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          console.warn(`! ${file} was edited after it was applied. Never edit applied migrations; add a new one.`);
        }
        if (args.has("--status")) console.log(`  applied  ${file}`);
        continue;
      }

      pending += 1;
      if (args.has("--status")) {
        console.log(`  pending  ${file}`);
        continue;
      }

      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
        console.log("done");
      } catch (error) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        throw error;
      }
    }

    if (!args.has("--status")) {
      console.log(pending === 0 ? "Database is up to date." : `Applied ${pending} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
