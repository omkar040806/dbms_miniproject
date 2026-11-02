import { describe, expect, it } from "vitest";
import { buildFilters, escapeLike, orderBy, Params } from "@/lib/db/queries/search";
import { searchQuerySchema } from "@/lib/validation/search";

describe("search SQL builder", () => {
  it("numbers parameters in the order they are added", () => {
    const params = new Params();
    expect(params.add("a")).toBe("$1");
    expect(params.add(2)).toBe("$2");
    expect(params.values).toEqual(["a", 2]);
  });

  it("puts every user value into a parameter, never into the SQL text", () => {
    const filters = searchQuerySchema.parse({
      domainId: "3",
      yearFrom: "2015",
      yearTo: "2020",
      author: "O'Brien; DROP TABLE papers;--",
      venueType: "journal",
      minCitations: "10",
    });
    const params = new Params();
    const sql = buildFilters(filters, params).join(" AND ");
    expect(sql).not.toContain("DROP");
    expect(sql).not.toContain("O'Brien");
    expect(params.values).toEqual([3, 2015, 2020, 10, "journal", "%O'Brien; DROP TABLE papers;--%"]);
    expect(sql).toContain("p.status = 'approved'");
    expect(sql).toContain("fn_domain_subtree($1)");
  });

  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("orders by relevance only when there is a score", () => {
    expect(orderBy("relevance", "rank_expr")).toBe("rank_expr DESC, p.paper_id");
    expect(orderBy("relevance", null)).toContain("GREATEST");
    expect(orderBy("newest", "rank_expr")).toContain("publication_year DESC");
  });
});

describe("searchQuerySchema", () => {
  it("applies defaults", () => {
    expect(searchQuerySchema.parse({})).toMatchObject({ q: "", mode: "keyword", sort: "relevance", author: "" });
  });

  it("rejects an inverted year range and unknown modes", () => {
    expect(searchQuerySchema.safeParse({ yearFrom: "2020", yearTo: "2010" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ mode: "magic" }).success).toBe(false);
  });

  it("treats empty strings from the URL as missing", () => {
    expect(searchQuerySchema.parse({ domainId: "", venueType: "" })).toMatchObject({ domainId: undefined, venueType: undefined });
  });
});
