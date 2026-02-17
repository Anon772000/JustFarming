import { z } from "zod";

const baseFeedEventSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  quantityKg: z.number().positive(),
  mobId: z.string().uuid().nullable().optional(),
  paddockId: z.string().uuid().nullable().optional(),
  feederId: z.string().uuid().nullable().optional(),
  hayLotId: z.string().uuid().nullable().optional(),
  grainLotId: z.string().uuid().nullable().optional(),
  notes: z.string().max(400).optional(),
});

function validateMutualExclusion(v: { hayLotId?: string | null; grainLotId?: string | null }): boolean {
  return !(typeof v.hayLotId === "string" && typeof v.grainLotId === "string");
}

export const createFeedEventSchema = baseFeedEventSchema.refine(validateMutualExclusion, {
  message: "hayLotId and grainLotId are mutually exclusive",
  path: ["hayLotId"],
});

export const updateFeedEventSchema = baseFeedEventSchema
  .partial()
  .omit({ farmId: true, id: true })
  .refine(validateMutualExclusion, {
    message: "hayLotId and grainLotId are mutually exclusive",
    path: ["hayLotId"],
  });

export type CreateFeedEventInput = z.infer<typeof createFeedEventSchema>;
export type UpdateFeedEventInput = z.infer<typeof updateFeedEventSchema>;
