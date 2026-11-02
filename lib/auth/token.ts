// Signing and verifying session tokens (JWT, HS256).
// No Next.js imports here, so proxy.ts and route handlers can both use it.
import { jwtVerify, SignJWT } from "jose";

export type Role = "researcher" | "admin";

export interface SessionUser {
  userId: number;
  name: string;
  email: string;
  role: Role;
}

export const SESSION_COOKIE = "rp_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the user stored in a valid token, or null if it is missing, expired or tampered with. */
export async function verifySessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (role !== "researcher" && role !== "admin") return null;
    return {
      userId: Number(payload.sub),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      role,
    };
  } catch {
    return null;
  }
}
