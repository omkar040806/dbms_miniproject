import { apiHandler, HttpError, json, parseQuery } from "@/lib/api/http";
import { hybridSearch, keywordSearch, semanticSearch } from "@/lib/db/queries/search";
import { embedText } from "@/lib/embeddings/model";
import { searchQuerySchema } from "@/lib/validation/search";

// GET /api/search?q=&mode=keyword|semantic|hybrid&domainId=&yearFrom=&yearTo=&author=&venueType=&minCitations=&sort=&page=
export const GET = apiHandler(async (request) => {
  const filters = parseQuery(request, searchQuerySchema);
  if (filters.mode === "keyword") return json(await keywordSearch(filters));

  if (!filters.q) throw new HttpError(400, "Type what you are looking for to use semantic search");
  // Embed the query with the same model used for the papers, then search by vector.
  let vector: number[];
  try {
    vector = await embedText(filters.q);
  } catch (error) {
    console.error("Embedding model failed to load", error);
    throw new HttpError(
      503,
      "The embedding model could not be loaded. Its first use downloads about 23 MB: check the internet connection and try again, or use keyword search.",
    );
  }
  return json(filters.mode === "semantic" ? await semanticSearch(filters, vector) : await hybridSearch(filters, vector));
});
