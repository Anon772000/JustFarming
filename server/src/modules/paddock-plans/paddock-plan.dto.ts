import { PlanStatus } from "@prisma/client";
import { z } from "zod";

export const createPaddockPlanSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  paddockId: z.string().uuid(),
  name: z.string().min(1).max(120),
  status: z.nativeEnum(PlanStatus).optional(),
  plannedStart: z.string().datetime(),
  plannedEnd: z.string().datetime().nullable().optional(),
  actualStart: z.string().datetime().nullable().optional(),
  actualEnd: z.string().datetime().nullable().optional(),
  notes: z.string().max(10_000).optional(),
});

export const updatePaddockPlanSchema = createPaddockPlanSchema.partial().omit({ farmId: true, id: true });

export type CreatePaddockPlanInput = z.infer<typeof createPaddockPlanSchema>;
export type UpdatePaddockPlanInput = z.infer<typeof updatePaddockPlanSchema>;
