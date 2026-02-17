import { z } from "zod";

export const createHayLotSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  lotCode: z.string().min(1).max(80),
  quantityTons: z.number().positive(),
  qualityGrade: z.string().max(80).optional(),
  location: z.string().max(120).optional(),
});

export const updateHayLotSchema = createHayLotSchema.partial().omit({ farmId: true, id: true });

export type CreateHayLotInput = z.infer<typeof createHayLotSchema>;
export type UpdateHayLotInput = z.infer<typeof updateHayLotSchema>;
