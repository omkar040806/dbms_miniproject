import { apiHandler, HttpError, json, parseBody } from "@/lib/api/http";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { clearFailures, recordFailure, retryAfterSeconds } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/session";
import { findUserByEmail, recordLogin } from "@/lib/db/queries/users";
import { loginSchema } from "@/lib/validation/auth";

// POST /api/auth/login
export const POST = apiHandler(async (request) => {
  const { email, password } = await parseBody(request, loginSchema);

  // Throttle per email + client address: 5 failures in 15 minutes locks that pair out.
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limitKey = `${email}|${client}`;
  const wait = retryAfterSeconds(limitKey);
  if (wait > 0) throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`);

  const user = await findUserByEmail(email);

  // Always run bcrypt, even for unknown emails, so response time does not reveal which emails exist.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    recordFailure(limitKey);
    throw new HttpError(401, "Incorrect email or password");
  }
  if (!user.is_active) throw new HttpError(403, "This account has been deactivated");

  clearFailures(limitKey);
  await recordLogin(user.user_id);
  const session = { userId: user.user_id, name: user.full_name, email: user.email, role: user.role };
  await startSession(session);
  return json({ user: session });
});
