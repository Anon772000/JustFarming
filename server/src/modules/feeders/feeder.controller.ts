import { Request, Response } from "express";
import { z } from "zod";
import { createFeederSchema, updateFeederSchema } from "./feeder.dto";
import { FeederService } from "./feeder.service";

const feederIdSchema = z.object({ feederId: z.string().uuid() });

export class FeederController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await FeederService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { feederId } = feederIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await FeederService.get(farmId, feederId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createFeederSchema.parse({ ...req.body, farmId });
    const data = await FeederService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { feederId } = feederIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateFeederSchema.parse(req.body);
    const data = await FeederService.update(farmId, feederId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { feederId } = feederIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await FeederService.remove(farmId, feederId);
    res.status(204).send();
  }
}
