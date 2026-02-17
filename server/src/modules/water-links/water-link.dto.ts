import { z } from "zod";

const waterLinkBaseSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  fromAssetId: z.string().uuid(),
  toAssetId: z.string().uuid(),
  connectionType: z.string().min(1).max(50),
  diameterMm: z.number().positive().optional(),
});

export const createWaterLinkSchema = waterLinkBaseSchema.refine((v) => v.fromAssetId !== v.toAssetId, {
  message: "fromAssetId and toAssetId must differ",
  path: ["toAssetId"],
});

export const updateWaterLinkSchema = waterLinkBaseSchema.partial().omit({ farmId: true, id: true });

export type CreateWaterLinkInput = z.infer<typeof createWaterLinkSchema>;
export type UpdateWaterLinkInput = z.infer<typeof updateWaterLinkSchema>;
