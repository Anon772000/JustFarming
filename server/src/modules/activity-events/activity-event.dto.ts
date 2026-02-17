import { z } from "zod";

export const createActivityEventSchema = z
  .object({
    id: z.string().uuid().optional(),
    farmId: z.string().uuid(),
    entityType: z.string().min(1).max(60),
    entityId: z.string().uuid(),
    eventType: z.string().min(1).max(120),
    plannedAt: z.string().datetime().nullable().optional(),
    actualAt: z.string().datetime().nullable().optional(),
    payloadJson: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    const plannedOk = typeof value.plannedAt === "string";
    const actualOk = typeof value.actualAt === "string";

    if (!plannedOk && !actualOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "plannedAt or actualAt is required",
        path: ["plannedAt"],
      });
    }
  });

export const updateActivityEventSchema = z.object({
  entityType: z.string().min(1).max(60).optional(),
  entityId: z.string().uuid().optional(),
  eventType: z.string().min(1).max(120).optional(),
  plannedAt: z.string().datetime().nullable().optional(),
  actualAt: z.string().datetime().nullable().optional(),
  payloadJson: z.unknown().nullable().optional(),
});

export type CreateActivityEventInput = z.infer<typeof createActivityEventSchema>;
export type UpdateActivityEventInput = z.infer<typeof updateActivityEventSchema>;
