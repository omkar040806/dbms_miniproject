import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  mapVenueType,
  normalizeDoi,
  normalizeOrcid,
  reconstructAbstract,
  shortOpenAlexId,
} from "@/lib/openalex/transform";

describe("OpenAlex transforms", () => {
  it("rebuilds an abstract from an inverted index", () => {
    const index = { Attention: [0], is: [1], all: [2], you: [3], need: [4], "attention.": [5] };
    expect(reconstructAbstract(index)).toBe("Attention is all you need attention.");
  });

  it("handles words that appear more than once", () => {
    expect(reconstructAbstract({ the: [0, 2], cat: [1], dog: [3] })).toBe("the cat the dog");
  });

  it("returns null for a missing abstract", () => {
    expect(reconstructAbstract(null)).toBeNull();
  });

  it("normalizes DOIs to lowercase without the resolver prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1145/ABC.123")).toBe("10.1145/abc.123");
    expect(normalizeDoi("not a doi")).toBeNull();
  });

  it("extracts ids", () => {
    expect(shortOpenAlexId("https://openalex.org/W2741809807")).toBe("W2741809807");
    expect(shortOpenAlexId("https://example.com/x")).toBeNull();
    expect(normalizeOrcid("https://orcid.org/0000-0002-1825-0097")).toBe("0000-0002-1825-0097");
    expect(normalizeOrcid("https://orcid.org/123")).toBeNull();
  });

  it("strips HTML from titles and rejects very short ones", () => {
    expect(cleanTitle("Deep <i>Residual</i> Learning")).toBe("Deep Residual Learning");
    expect(cleanTitle("Hi")).toBeNull();
  });

  it("maps source types onto venue types allowed by the CHECK constraint", () => {
    expect(mapVenueType("repository")).toBe("preprint");
    expect(mapVenueType("conference")).toBe("conference");
    expect(mapVenueType("something-new")).toBe("other");
  });
});
