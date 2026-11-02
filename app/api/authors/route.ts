import { z } from "zod";
import { apiHandler, json, parseQuery } from "@/lib/api/http";
import { searchAuthors } from "@/lib/db/queries/authors";

const schema = z.object({ q: z.string().trim().min(2, "Type at least 2 characters").max(100) });

// GET /api/authors?q=hinton: fuzzy author search.
export const GET = apiHandler(async (request) => {
  const { q } = parseQuery(request, schema);
  return json({ authors: await searchAuthors(q) });
});
