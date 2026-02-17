import { PlanStatus } from "@prisma/client";
import { z } from "zod";

export const createProductionPlanSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  paddockId: z.string().uuid().nullable().optional(),
  mobId: z.string().uuid().nullable().optional(),
  planName: z.string().min(1).max(120),
  status: z.nativeEnum(PlanStatus).optional(),
  targetMetric: z.string().max(120).optional(),
  targetValue: z.number().nullable().optional(),
  actualValue: z.number().nullable().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(10_000).optional(),
});

export const updateProductionPlanSchema = createProductionPlanSchema.partial().omit({ farmId: true, id: true });

export type CreateProductionPlanInput = z.infer<typeof createProductionPlanSchema>;
export type UpdateProductionPlanInput = z.infer<typeof updateProductionPlanSchema>;
