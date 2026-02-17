import { z } from "zod";

export const createGrainLotSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  lotCode: z.string().min(1).max(80),
  grainType: z.string().min(1).max(80),
  quantityTons: z.number().positive(),
  moisturePct: z.number().positive().max(100).optional(),
});

export const updateGrainLotSchema = createGrainLotSchema.partial().omit({ farmId: true, id: true });

export type CreateGrainLotInput = z.infer<typeof createGrainLotSchema>;
export type UpdateGrainLotInput = z.infer<typeof updateGrainLotSchema>;
