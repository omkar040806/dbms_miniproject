import { apiHandler, json, parseBody, parseId, type RouteContext } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { updateUser } from "@/lib/db/queries/admin";
import { userUpdateSchema } from "@/lib/validation/admin";

// PATCH /api/admin/users/:id  { role?, isActive? }
export const PATCH = apiHandler(async (request, { params }: RouteContext<{ id: string }>) => {
  const admin = await requireRole("admin");
  const userId = parseId((await params).id);
  const changes = await parseBody(request, userUpdateSchema);
  return json({ user: await updateUser(admin, userId, changes) });
});
