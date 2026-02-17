import { z } from "zod";

export const createPaddockSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  name: z.string().min(1).max(120),
  areaHa: z.number().positive().optional(),
  boundaryGeoJson: z.unknown().optional(),
  currentStatus: z.string().max(200).optional(),
});

export const updatePaddockSchema = createPaddockSchema.partial().omit({ farmId: true, id: true });

export type CreatePaddockInput = z.infer<typeof createPaddockSchema>;
export type UpdatePaddockInput = z.infer<typeof updatePaddockSchema>;
