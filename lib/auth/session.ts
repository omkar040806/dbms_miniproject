// Session helpers for route handlers. The cookie is httpOnly, so page JavaScript
// can never read the token.
import { cookies } from "next/headers";
import { findActiveUserById } from "@/lib/db/queries/users";
import { HttpError } from "@/lib/api/http";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type Role,
  type SessionUser,
} from "./token";

export async function startSession(user: SessionUser): Promise<void> {
  const token = await signSessionToken(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * The logged-in user, re-checked against the database on every call so that a
 * deactivated account or a changed role takes effect immediately, not after the token expires.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const fromToken = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!fromToken) return null;

  const row = await findActiveUserById(fromToken.userId);
  if (!row) return null;
  return { userId: row.user_id, name: row.full_name, email: row.email, role: row.role };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please log in to continue");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new HttpError(403, "You do not have permission to do this");
  return user;
}
