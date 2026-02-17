import { Request, Response } from "express";
import { z } from "zod";
import { createWaterLinkSchema, updateWaterLinkSchema } from "./water-link.dto";
import { WaterLinkService } from "./water-link.service";

const waterLinkIdSchema = z.object({ waterLinkId: z.string().uuid() });

export class WaterLinkController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await WaterLinkService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { waterLinkId } = waterLinkIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await WaterLinkService.get(farmId, waterLinkId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createWaterLinkSchema.parse({ ...req.body, farmId });
    const data = await WaterLinkService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { waterLinkId } = waterLinkIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateWaterLinkSchema.parse(req.body);
    const data = await WaterLinkService.update(farmId, waterLinkId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { waterLinkId } = waterLinkIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await WaterLinkService.remove(farmId, waterLinkId);
    res.status(204).send();
  }
}
