import { apiHandler, json } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/session";

// GET /api/auth/me: who is logged in (null for guests).
export const GET = apiHandler(async () => {
  const user = await getCurrentUser();
  return json({ user });
});
