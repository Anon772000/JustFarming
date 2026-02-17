import { Request, Response } from "express";
import { z } from "zod";
import { MobService } from "./mob.service";
import { createMobSchema, updateMobSchema } from "./mob.dto";

const mobIdSchema = z.object({ mobId: z.string().uuid() });

export class MobController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await MobService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { mobId } = mobIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await MobService.get(farmId, mobId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createMobSchema.parse({ ...req.body, farmId });
    const data = await MobService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { mobId } = mobIdSchema.parse(req.params);
    const payload = updateMobSchema.parse(req.body);
    const farmId = req.auth!.farmId;
    const data = await MobService.update(farmId, mobId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { mobId } = mobIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await MobService.remove(farmId, mobId);
    res.status(204).send();
  }
}
