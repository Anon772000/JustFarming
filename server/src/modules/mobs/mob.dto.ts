import { MobSpecies } from "@prisma/client";
import { z } from "zod";

export const createMobSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  name: z.string().min(1).max(120),
  species: z.nativeEnum(MobSpecies),
  headCount: z.number().int().positive(),
  avgWeightKg: z.number().positive().nullable().optional(),
  currentPaddockId: z.string().uuid().nullable().optional(),
});

export const updateMobSchema = createMobSchema.partial().omit({ farmId: true, id: true });

export type CreateMobInput = z.infer<typeof createMobSchema>;
export type UpdateMobInput = z.infer<typeof updateMobSchema>;
