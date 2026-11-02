import { z } from "zod";
import { apiHandler, json, parseQuery } from "@/lib/api/http";
import { getAnalytics } from "@/lib/db/queries/analytics";

const schema = z.object({ minPapers: z.coerce.number().int().min(1).max(1000).optional().default(1) });

// GET /api/analytics?minPapers=5: public research analytics.
export const GET = apiHandler(async (request) => {
  const { minPapers } = parseQuery(request, schema);
  return json(await getAnalytics(minPapers));
});
