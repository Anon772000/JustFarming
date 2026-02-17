import { PlanStatus } from "@prisma/client";
import { z } from "zod";

export const createMobMovementPlanSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  mobId: z.string().uuid(),
  fromPaddockId: z.string().uuid().optional(),
  toPaddockId: z.string().uuid(),
  status: z.nativeEnum(PlanStatus).optional(),
  plannedAt: z.string().datetime(),
  actualAt: z.string().datetime().optional(),
  reason: z.string().max(240).optional(),
});

export const updateMobMovementPlanSchema = createMobMovementPlanSchema
  .partial()
  .omit({ farmId: true, id: true });

export type CreateMobMovementPlanInput = z.infer<typeof createMobMovementPlanSchema>;
export type UpdateMobMovementPlanInput = z.infer<typeof updateMobMovementPlanSchema>;
