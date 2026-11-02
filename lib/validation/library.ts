import { z } from "zod";

export const readingEntrySchema = z
  .object({
    status: z.enum(["to_read", "reading", "read"]).optional(),
    isBookmarked: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.isBookmarked !== undefined, "Send status and/or isBookmarked");

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(500).optional().default(""),
  isPublic: z.boolean().optional().default(false),
});

export const collectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const collectionPaperSchema = z.object({ paperId: z.number().int().positive() });

export const noteCreateSchema = z.object({
  paperId: z.number().int().positive(),
  body: z.string().trim().min(1, "Note cannot be empty").max(5000),
});

export const noteUpdateSchema = z.object({ body: z.string().trim().min(1, "Note cannot be empty").max(5000) });
