import { Request, Response } from "express";
import { z } from "zod";
import { createWaterAssetSchema, updateWaterAssetSchema } from "./water-asset.dto";
import { WaterAssetService } from "./water-asset.service";

const waterAssetIdSchema = z.object({ waterAssetId: z.string().uuid() });

export class WaterAssetController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await WaterAssetService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { waterAssetId } = waterAssetIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await WaterAssetService.get(farmId, waterAssetId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createWaterAssetSchema.parse({ ...req.body, farmId });
    const data = await WaterAssetService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { waterAssetId } = waterAssetIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateWaterAssetSchema.parse(req.body);
    const data = await WaterAssetService.update(farmId, waterAssetId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { waterAssetId } = waterAssetIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await WaterAssetService.remove(farmId, waterAssetId);
    res.status(204).send();
  }
}
