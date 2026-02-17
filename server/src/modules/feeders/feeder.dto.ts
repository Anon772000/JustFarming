import { z } from "zod";

export const createFeederSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  name: z.string().min(1).max(120),
  feederType: z.string().min(1).max(80),
  locationGeoJson: z.unknown().optional(),
  capacityKg: z.number().positive().optional(),
});

export const updateFeederSchema = createFeederSchema.partial().omit({ farmId: true, id: true });

export type CreateFeederInput = z.infer<typeof createFeederSchema>;
export type UpdateFeederInput = z.infer<typeof updateFeederSchema>;
