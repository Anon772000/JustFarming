import { Request, Response } from "express";
import { z } from "zod";
import { createGrainLotSchema, updateGrainLotSchema } from "./grain-lot.dto";
import { GrainLotService } from "./grain-lot.service";

const grainLotIdSchema = z.object({ grainLotId: z.string().uuid() });

export class GrainLotController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await GrainLotService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { grainLotId } = grainLotIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await GrainLotService.get(farmId, grainLotId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createGrainLotSchema.parse({ ...req.body, farmId });
    const data = await GrainLotService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { grainLotId } = grainLotIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateGrainLotSchema.parse(req.body);
    const data = await GrainLotService.update(farmId, grainLotId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { grainLotId } = grainLotIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await GrainLotService.remove(farmId, grainLotId);
    res.status(204).send();
  }
}
