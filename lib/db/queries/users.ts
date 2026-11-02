import { query } from "@/lib/db/pool";
import type { Role } from "@/lib/auth/token";

export interface UserRow {
  user_id: number;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  // email is CITEXT, so this comparison ignores letter case.
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] ?? null;
}

export async function findActiveUserById(userId: number): Promise<UserRow | null> {
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE user_id = $1 AND is_active", [userId]);
  return rows[0] ?? null;
}

export async function createUser(input: { fullName: string; email: string; passwordHash: string }): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.fullName, input.email, input.passwordHash],
  );
  return rows[0];
}

export async function recordLogin(userId: number): Promise<void> {
  await query("UPDATE users SET last_login_at = now() WHERE user_id = $1", [userId]);
}
