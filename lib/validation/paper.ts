import { z } from "zod";

const currentYear = new Date().getFullYear();

/** Split "a, b; c" or one-per-line text into a clean list. */
function splitList(value: unknown, separators: RegExp): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(separators)
    .map((s) => s.trim())
    .filter(Boolean);
}

const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

/** Fields of the upload form (sent as multipart/form-data). */
export const paperUploadSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(500),
  abstract: z.string().trim().max(10_000, "Abstract must be at most 10,000 characters").optional().default(""),
  doi: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""))
    .refine((v) => v === "" || /^10\.\d{4,9}\/\S+$/.test(v), "DOI must look like 10.1234/abc")
    .optional()
    .default(""),
  publicationYear: z.coerce
    .number()
    .int()
    .min(1900, "Year must be 1900 or later")
    .max(currentYear + 1, `Year must be ${currentYear + 1} or earlier`),
  domainId: z.coerce.number().int().positive("Choose a domain"),
  venueId: optionalInt,
  authors: z
    .preprocess((v) => splitList(v, /\r?\n|;/), z.array(z.string().min(2, "Author names need at least 2 characters").max(150)))
    .refine((list) => list.length >= 1, "Add at least one author")
    .refine((list) => list.length <= 50, "At most 50 authors"),
  keywords: z
    .preprocess((v) => splitList(v, /,|\r?\n/), z.array(z.string().max(80)))
    .refine((list) => list.length <= 15, "At most 15 keywords"),
  citedPaperIds: z.preprocess(
    (v) => splitList(v, /,|\s+/),
    z.array(z.coerce.number().int().positive()).max(200, "At most 200 references"),
  ),
});

export type PaperUploadInput = z.infer<typeof paperUploadSchema>;
