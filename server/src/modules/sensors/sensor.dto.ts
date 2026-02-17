import { SensorType } from "@prisma/client";
import { z } from "zod";

export const createSensorSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  nodeId: z.string().uuid(),
  key: z.string().min(1).max(80),
  type: z.nativeEnum(SensorType),
  unit: z.string().max(40).optional(),
  metadataJson: z.unknown().optional(),
});

export const updateSensorSchema =
  z
    .object({
      type: z.nativeEnum(SensorType).optional(),
      unit: z.string().max(40).optional(),
      metadataJson: z.unknown().optional(),
    })
    .strict();

export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type UpdateSensorInput = z.infer<typeof updateSensorSchema>;
