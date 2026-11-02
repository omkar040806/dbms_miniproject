import { z } from "zod";

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().pipe(schema).optional());

// keyword = full-text search, semantic = vector similarity, hybrid = both merged by rank fusion.
export const SEARCH_MODES = ["keyword", "semantic", "hybrid"] as const;
export const SORTS = ["relevance", "newest", "oldest", "citations"] as const;

export const searchQuerySchema = z
  .object({
    q: z.string().trim().max(300).optional().default(""),
    mode: z.enum(SEARCH_MODES).optional().default("keyword"),
    domainId: optionalNumber(z.number().int().positive()),
    yearFrom: optionalNumber(z.number().int().min(1900).max(2100)),
    yearTo: optionalNumber(z.number().int().min(1900).max(2100)),
    author: z.string().trim().max(150).optional().default(""),
    venueType: z.enum(["journal", "conference", "preprint", "book", "other"]).optional().or(z.literal("").transform(() => undefined)),
    minCitations: optionalNumber(z.number().int().min(0)),
    sort: z.enum(SORTS).optional().default("relevance"),
    page: optionalNumber(z.number().int().min(1).max(500)),
    pageSize: optionalNumber(z.number().int().min(1).max(50)),
  })
  .refine((v) => !v.yearFrom || !v.yearTo || v.yearFrom <= v.yearTo, {
    message: "yearFrom must not be after yearTo",
    path: ["yearFrom"],
  });

export type SearchQuery = z.infer<typeof searchQuerySchema>;
