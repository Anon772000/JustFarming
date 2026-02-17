import { z } from "zod";

export const createCropSeasonSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  paddockId: z.string().uuid(),
  seasonName: z.string().min(1).max(120),
  cropType: z.string().min(1).max(120),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable().optional(),
  targetYieldTons: z.number().positive().nullable().optional(),
  actualYieldTons: z.number().positive().nullable().optional(),
  notes: z.string().max(10_000).optional(),
});

export const updateCropSeasonSchema = createCropSeasonSchema.partial().omit({ farmId: true, id: true });

export type CreateCropSeasonInput = z.infer<typeof createCropSeasonSchema>;
export type UpdateCropSeasonInput = z.infer<typeof updateCropSeasonSchema>;
