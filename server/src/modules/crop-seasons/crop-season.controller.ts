import { Request, Response } from "express";
import { z } from "zod";
import { CropSeasonService } from "./crop-season.service";
import { createCropSeasonSchema, updateCropSeasonSchema } from "./crop-season.dto";

const cropSeasonIdSchema = z.object({ cropSeasonId: z.string().uuid() });

const cropSeasonListQuerySchema = z.object({
  paddockId: z.string().uuid().optional(),
});

export class CropSeasonController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockId } = cropSeasonListQuerySchema.parse(req.query);
    const data = await CropSeasonService.list(farmId, { paddockId });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { cropSeasonId } = cropSeasonIdSchema.parse(req.params);
    const data = await CropSeasonService.get(farmId, cropSeasonId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createCropSeasonSchema.parse({ ...req.body, farmId });
    const data = await CropSeasonService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { cropSeasonId } = cropSeasonIdSchema.parse(req.params);
    const payload = updateCropSeasonSchema.parse(req.body);
    const data = await CropSeasonService.update(farmId, cropSeasonId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { cropSeasonId } = cropSeasonIdSchema.parse(req.params);
    await CropSeasonService.remove(farmId, cropSeasonId);
    res.status(204).send();
  }
}
