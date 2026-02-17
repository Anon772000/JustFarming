import { Request, Response } from "express";
import { z } from "zod";
import { createMobMovementPlanSchema, updateMobMovementPlanSchema } from "./mob-movement-plan.dto";
import { MobMovementPlanService } from "./mob-movement-plan.service";

const mobMovementPlanIdSchema = z.object({ mobMovementPlanId: z.string().uuid() });

const mobMovementPlanListQuerySchema = z.object({
  mobId: z.string().uuid().optional(),
  paddockId: z.string().uuid().optional(),
});

export class MobMovementPlanController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { mobId, paddockId } = mobMovementPlanListQuerySchema.parse(req.query);
    const data = await MobMovementPlanService.list(farmId, { mobId, paddockId });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { mobMovementPlanId } = mobMovementPlanIdSchema.parse(req.params);
    const data = await MobMovementPlanService.get(farmId, mobMovementPlanId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createMobMovementPlanSchema.parse({ ...req.body, farmId });
    const data = await MobMovementPlanService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { mobMovementPlanId } = mobMovementPlanIdSchema.parse(req.params);
    const payload = updateMobMovementPlanSchema.parse(req.body);
    const data = await MobMovementPlanService.update(farmId, mobMovementPlanId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { mobMovementPlanId } = mobMovementPlanIdSchema.parse(req.params);
    await MobMovementPlanService.remove(farmId, mobMovementPlanId);
    res.status(204).send();
  }
}
