import { z } from "zod";

export const depthSchema = z.object({
  depth: z.coerce.number().int().min(1).max(3).optional().default(2),
});

export const pathSchema = z
  .object({
    from: z.coerce.number().int().positive(),
    to: z.coerce.number().int().positive(),
  })
  .refine((v) => v.from !== v.to, { message: "Choose two different papers", path: ["to"] });
