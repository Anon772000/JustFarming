import { z } from "zod";

export const createPestSpottingSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  paddockId: z.string().uuid().nullable().optional(),
  pestType: z.string().min(1).max(120),
  severity: z.string().max(40).optional(),
  locationGeoJson: z.unknown().optional(),
  spottedAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export const updatePestSpottingSchema = z.object({
  paddockId: z.string().uuid().nullable().optional(),
  pestType: z.string().min(1).max(120).optional(),
  severity: z.string().max(40).nullable().optional(),
  locationGeoJson: z.unknown().nullable().optional(),
  spottedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreatePestSpottingInput = z.infer<typeof createPestSpottingSchema>;
export type UpdatePestSpottingInput = z.infer<typeof updatePestSpottingSchema>;
