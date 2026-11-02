import { apiHandler, json } from "@/lib/api/http";
import { requireRole } from "@/lib/auth/session";
import { refreshAnalytics } from "@/lib/db/queries/analytics";

// POST /api/admin/analytics/refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY via fn_refresh_analytics().
export const POST = apiHandler(async () => {
  await requireRole("admin");
  return json({ refreshedAt: await refreshAnalytics() });
});
