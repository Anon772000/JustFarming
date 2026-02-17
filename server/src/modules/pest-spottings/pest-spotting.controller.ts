import { Request, Response } from "express";
import { z } from "zod";
import { createPestSpottingSchema, updatePestSpottingSchema } from "./pest-spotting.dto";
import { PestSpottingService } from "./pest-spotting.service";

const pestSpottingIdSchema = z.object({ pestSpottingId: z.string().uuid() });

const pestSpottingListQuerySchema = z.object({
  paddockId: z.string().uuid().optional(),
  pestType: z.string().min(1).optional(),
});

export class PestSpottingController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockId, pestType } = pestSpottingListQuerySchema.parse(req.query);
    const data = await PestSpottingService.list(farmId, { paddockId, pestType });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { pestSpottingId } = pestSpottingIdSchema.parse(req.params);
    const data = await PestSpottingService.get(farmId, pestSpottingId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createPestSpottingSchema.parse({ ...req.body, farmId });
    const data = await PestSpottingService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { pestSpottingId } = pestSpottingIdSchema.parse(req.params);
    const payload = updatePestSpottingSchema.parse(req.body);
    const data = await PestSpottingService.update(farmId, pestSpottingId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { pestSpottingId } = pestSpottingIdSchema.parse(req.params);
    await PestSpottingService.remove(farmId, pestSpottingId);
    res.status(204).send();
  }
}
