import { apiHandler, json, parseBody } from "@/lib/api/http";
import { hashPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { createUser } from "@/lib/db/queries/users";
import { registerSchema } from "@/lib/validation/auth";

// POST /api/auth/register: create a researcher account and log it in.
export const POST = apiHandler(async (request) => {
  const input = await parseBody(request, registerSchema);
  const passwordHash = await hashPassword(input.password);

  // Duplicate emails are rejected by the UNIQUE constraint uq_users_email (HTTP 409).
  const user = await createUser({ fullName: input.fullName, email: input.email, passwordHash });

  const session = { userId: user.user_id, name: user.full_name, email: user.email, role: user.role };
  await startSession(session);
  return json({ user: session }, 201);
});
