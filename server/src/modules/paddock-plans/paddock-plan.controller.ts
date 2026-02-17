import { PlanStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { createPaddockPlanSchema, updatePaddockPlanSchema } from "./paddock-plan.dto";
import { PaddockPlanService } from "./paddock-plan.service";

const paddockPlanIdSchema = z.object({ paddockPlanId: z.string().uuid() });

const paddockPlanListQuerySchema = z.object({
  paddockId: z.string().uuid().optional(),
  status: z.nativeEnum(PlanStatus).optional(),
});

export class PaddockPlanController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockId, status } = paddockPlanListQuerySchema.parse(req.query);
    const data = await PaddockPlanService.list(farmId, { paddockId, status });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockPlanId } = paddockPlanIdSchema.parse(req.params);
    const data = await PaddockPlanService.get(farmId, paddockPlanId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createPaddockPlanSchema.parse({ ...req.body, farmId });
    const data = await PaddockPlanService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockPlanId } = paddockPlanIdSchema.parse(req.params);
    const payload = updatePaddockPlanSchema.parse(req.body);
    const data = await PaddockPlanService.update(farmId, paddockPlanId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockPlanId } = paddockPlanIdSchema.parse(req.params);
    await PaddockPlanService.remove(farmId, paddockPlanId);
    res.status(204).send();
  }
}
