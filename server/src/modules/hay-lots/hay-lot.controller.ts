import { Request, Response } from "express";
import { z } from "zod";
import { createHayLotSchema, updateHayLotSchema } from "./hay-lot.dto";
import { HayLotService } from "./hay-lot.service";

const hayLotIdSchema = z.object({ hayLotId: z.string().uuid() });

export class HayLotController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await HayLotService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { hayLotId } = hayLotIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await HayLotService.get(farmId, hayLotId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createHayLotSchema.parse({ ...req.body, farmId });
    const data = await HayLotService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { hayLotId } = hayLotIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateHayLotSchema.parse(req.body);
    const data = await HayLotService.update(farmId, hayLotId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { hayLotId } = hayLotIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await HayLotService.remove(farmId, hayLotId);
    res.status(204).send();
  }
}
