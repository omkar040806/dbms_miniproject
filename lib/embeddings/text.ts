import { createHash } from "node:crypto";

/**
 * The text that represents a paper in vector space: title, abstract and keywords.
 * The model reads at most 256 tokens, so very long abstracts are cut off.
 */
export function buildEmbeddingText(paper: { title: string; abstract: string | null; keywords: string[] | null }): string {
  const parts = [paper.title.trim()];
  if (paper.abstract) parts.push(paper.abstract.trim());
  if (paper.keywords && paper.keywords.length > 0) parts.push(`Keywords: ${paper.keywords.join(", ")}`);
  return parts.join("\n").slice(0, 4000);
}

/** SHA-256 of the embedded text, stored with the vector to detect stale embeddings. */
export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
