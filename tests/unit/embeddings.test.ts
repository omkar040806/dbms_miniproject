import { describe, expect, it } from "vitest";
import { toPgVector } from "@/lib/embeddings/model";
import { buildEmbeddingText, textHash } from "@/lib/embeddings/text";

describe("embedding text", () => {
  it("joins title, abstract and keywords", () => {
    const text = buildEmbeddingText({ title: " Attention ", abstract: "Only attention.", keywords: ["transformer", "nlp"] });
    expect(text).toBe("Attention\nOnly attention.\nKeywords: transformer, nlp");
  });

  it("works without abstract or keywords", () => {
    expect(buildEmbeddingText({ title: "Title only", abstract: null, keywords: [] })).toBe("Title only");
  });

  it("hashes deterministically so stale vectors can be detected", () => {
    expect(textHash("abc")).toBe(textHash("abc"));
    expect(textHash("abc")).not.toBe(textHash("abd"));
    expect(textHash("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("formats vectors the way pgvector parses them", () => {
    expect(toPgVector([0.5, -1, 2])).toBe("[0.5,-1,2]");
  });
});
