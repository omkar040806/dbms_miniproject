import { apiHandler, json } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { listModerationLog } from "@/lib/db/queries/admin";

// GET /api/admin/moderation-log: latest 100 audit entries written by triggers.
export const GET = apiHandler(async () => {
  await requireRole("admin");
  return json({ entries: await listModerationLog() });
});
