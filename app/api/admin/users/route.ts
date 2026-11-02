import { apiHandler, json } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { listUsers } from "@/lib/db/queries/admin";

// GET /api/admin/users?q=: list accounts with upload counts (admin only).
export const GET = apiHandler(async (request) => {
  await requireRole("admin");
  const search = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  return json({ users: await listUsers(search) });
});
