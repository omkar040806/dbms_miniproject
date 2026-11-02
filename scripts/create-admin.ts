/**
 * Create the first admin account, or promote an existing user to admin.
 *   npm run admin:create
 * Reads SEED_ADMIN_EMAIL, SEED_ADMIN_NAME and SEED_ADMIN_PASSWORD from .env,
 * so no credentials are written in the source code.
 */
import { requireEnv } from "./lib/env";
import { hashPassword } from "@/lib/auth/password";
import { getPool, query } from "@/lib/db/pool";

async function main() {
  const email = requireEnv("SEED_ADMIN_EMAIL").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Platform Admin";
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  if (password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");

  const passwordHash = await hashPassword(password);
  // Upsert: INSERT a new admin, or UPDATE the role if the email already exists.
  const { rows } = await query<{ user_id: number; inserted: boolean }>(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = TRUE
     RETURNING user_id, (xmax = 0) AS inserted`,
    [name, email, passwordHash],
  );
  const row = rows[0];
  console.log(`${row.inserted ? "Created" : "Promoted existing user to"} admin ${email} (user_id ${row.user_id})`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
