import { Request, Response } from "express";
import { z } from "zod";
import { createPaddockSchema, updatePaddockSchema } from "./paddock.dto";
import { PaddockService } from "./paddock.service";

const paddockIdSchema = z.object({ paddockId: z.string().uuid() });

export class PaddockController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await PaddockService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { paddockId } = paddockIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await PaddockService.get(farmId, paddockId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createPaddockSchema.parse({ ...req.body, farmId });
    const data = await PaddockService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { paddockId } = paddockIdSchema.parse(req.params);
    const payload = updatePaddockSchema.parse(req.body);
    const farmId = req.auth!.farmId;
    const data = await PaddockService.update(farmId, paddockId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { paddockId } = paddockIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await PaddockService.remove(farmId, paddockId);
    res.status(204).send();
  }
}
