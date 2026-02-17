import { z } from "zod";

export const createLoraNodeSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  name: z.string().min(1).max(120),
  devEui: z.string().min(6).max(64),
  locationGeoJson: z.unknown().optional(),
  installedAt: z.string().datetime().optional(),
});

export const updateLoraNodeSchema = createLoraNodeSchema.partial().omit({ farmId: true, id: true });

export type CreateLoraNodeInput = z.infer<typeof createLoraNodeSchema>;
export type UpdateLoraNodeInput = z.infer<typeof updateLoraNodeSchema>;
