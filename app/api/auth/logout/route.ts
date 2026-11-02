import { apiHandler, json } from "@/lib/api/http";
import { endSession } from "@/lib/auth/session";

// POST /api/auth/logout
export const POST = apiHandler(async () => {
  await endSession();
  return json({ ok: true });
});
