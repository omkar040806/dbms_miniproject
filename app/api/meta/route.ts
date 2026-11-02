import { apiHandler, json } from "@/lib/api/http";
import { getMeta } from "@/lib/db/queries/meta";

// GET /api/meta: domains, venues and totals for forms, filters and the home page.
export const GET = apiHandler(async () => json(await getMeta()));
