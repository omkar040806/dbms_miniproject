import { z } from "zod";

export const reviewSchema = z
  .object({
    action: z.enum(["approve", "reject", "reopen"]),
    reason: z.string().trim().max(1000).optional().default(""),
  })
  .refine((v) => v.action !== "reject" || v.reason.length >= 5, {
    message: "A rejection needs a reason of at least 5 characters",
    path: ["reason"],
  });

export const adminDeleteSchema = z.object({
  reason: z.string().trim().max(1000).optional().default(""),
});

export const userUpdateSchema = z
  .object({
    role: z.enum(["researcher", "admin"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, "Send role and/or isActive");

export const reviewListSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional().default("pending"),
});
