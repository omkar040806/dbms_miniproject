import { apiHandler, json, parseId, type RouteContext } from "@/lib/api/http";
import { getAuthorProfile } from "@/lib/db/queries/authors";

// GET /api/authors/:id: researcher profile with statistics, papers and co-authors.
export const GET = apiHandler(async (_request, { params }: RouteContext<{ id: string }>) => {
  const authorId = parseId((await params).id);
  return json(await getAuthorProfile(authorId));
});
