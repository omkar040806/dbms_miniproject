import { apiHandler, json, parseQuery } from "@/lib/api/http";
import { citationPath } from "@/lib/graph/queries";
import { pathSchema } from "@/lib/validation/graph";

// GET /api/graph/path?from=&to=: shortest citation chain between two papers.
export const GET = apiHandler(async (request) => {
  const { from, to } = parseQuery(request, pathSchema);
  const path = await citationPath(from, to);
  return json({ found: path !== null, ...(path ?? { nodes: [], links: [] }) });
});
