import { apiHandler, HttpError, json, parseBody } from "@/lib/api/http";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { findUserByEmail, recordLogin } from "@/lib/db/queries/users";
import { loginSchema } from "@/lib/validation/auth";

// POST /api/auth/login
export const POST = apiHandler(async (request) => {
  const { email, password } = await parseBody(request, loginSchema);
  const user = await findUserByEmail(email);

  // Always run bcrypt, even for unknown emails, so response time does not reveal which emails exist.
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw new HttpError(401, "Incorrect email or password");
  if (!user.is_active) throw new HttpError(403, "This account has been deactivated");

  await recordLogin(user.user_id);
  const session = { userId: user.user_id, name: user.full_name, email: user.email, role: user.role };
  await startSession(session);
  return json({ user: session });
});
