// Pure helpers that turn OpenAlex API records into values our schema accepts.
// Kept free of database code so they can be unit-tested.

/** "https://openalex.org/W2741809807" -> "W2741809807" */
export function shortOpenAlexId(url: string | null | undefined): string | null {
  if (!url) return null;
  const id = url.split("/").pop() ?? "";
  return /^[WASIV]\d+$/.test(id) ? id : null;
}

/** "https://doi.org/10.1145/ABC" -> "10.1145/abc" (DOIs are case-insensitive). */
export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const cleaned = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(cleaned) && cleaned.length <= 255 ? cleaned : null;
}

/** "https://orcid.org/0000-0002-1825-0097" -> "0000-0002-1825-0097" */
export function normalizeOrcid(orcid: string | null | undefined): string | null {
  if (!orcid) return null;
  const id = orcid.split("/").pop() ?? "";
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id) ? id : null;
}

/**
 * OpenAlex stores abstracts as an inverted index: { "word": [positions] }.
 * Rebuild the text by placing every word at each of its positions.
 */
export function reconstructAbstract(index: Record<string, number[]> | null | undefined, maxLength = 10_000): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  const text = words.filter((w) => w !== undefined).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/** Remove HTML tags such as <i>…</i> that sometimes appear in titles. */
export function cleanTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const text = title.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text.length >= 5 ? text.slice(0, 500) : null;
}

/** Map an OpenAlex source type onto our venues.venue_type CHECK values. */
export function mapVenueType(sourceType: string | null | undefined): "journal" | "conference" | "preprint" | "book" | "other" {
  switch (sourceType) {
    case "journal":
      return "journal";
    case "conference":
      return "conference";
    case "repository":
      return "preprint";
    case "book series":
    case "ebook platform":
      return "book";
    default:
      return "other";
  }
}
