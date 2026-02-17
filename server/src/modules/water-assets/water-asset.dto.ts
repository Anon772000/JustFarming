import { WaterAssetType } from "@prisma/client";
import { z } from "zod";

export const createWaterAssetSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  type: z.nativeEnum(WaterAssetType),
  name: z.string().min(1).max(120),
  locationGeoJson: z.unknown().optional(),
  capacityLitres: z.number().positive().optional(),
  metadataJson: z.unknown().optional(),
});

export const updateWaterAssetSchema = createWaterAssetSchema.partial().omit({ farmId: true, id: true });

export type CreateWaterAssetInput = z.infer<typeof createWaterAssetSchema>;
export type UpdateWaterAssetInput = z.infer<typeof updateWaterAssetSchema>;
