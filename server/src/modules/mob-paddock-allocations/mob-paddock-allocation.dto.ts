import { z } from "zod";

const mobPaddockAllocationObjectSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  mobId: z.string().uuid(),
  paddockId: z.string().uuid(),
  headCount: z.number().int().positive().nullable().optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(400).optional(),
});

function validateEndedAfterStarted(
  value: {
    startedAt?: string;
    endedAt?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (typeof value.startedAt === "string" && typeof value.endedAt === "string") {
    const started = new Date(value.startedAt);
    const ended = new Date(value.endedAt);

    if (Number.isFinite(started.getTime()) && Number.isFinite(ended.getTime()) && ended.getTime() < started.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endedAt must be after startedAt",
        path: ["endedAt"],
      });
    }
  }
}

export const createMobPaddockAllocationSchema = mobPaddockAllocationObjectSchema.superRefine(validateEndedAfterStarted);

export const updateMobPaddockAllocationSchema = mobPaddockAllocationObjectSchema
  .partial()
  .omit({ farmId: true, id: true })
  .superRefine(validateEndedAfterStarted);

export type CreateMobPaddockAllocationInput = z.infer<typeof createMobPaddockAllocationSchema>;
export type UpdateMobPaddockAllocationInput = z.infer<typeof updateMobPaddockAllocationSchema>;
