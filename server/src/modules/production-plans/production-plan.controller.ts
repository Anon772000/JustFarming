import { PlanStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { createProductionPlanSchema, updateProductionPlanSchema } from "./production-plan.dto";
import { ProductionPlanService } from "./production-plan.service";

const productionPlanIdSchema = z.object({ productionPlanId: z.string().uuid() });

const productionPlanListQuerySchema = z.object({
  paddockId: z.string().uuid().optional(),
  mobId: z.string().uuid().optional(),
  status: z.nativeEnum(PlanStatus).optional(),
});

export class ProductionPlanController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { paddockId, mobId, status } = productionPlanListQuerySchema.parse(req.query);
    const data = await ProductionPlanService.list(farmId, { paddockId, mobId, status });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { productionPlanId } = productionPlanIdSchema.parse(req.params);
    const data = await ProductionPlanService.get(farmId, productionPlanId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createProductionPlanSchema.parse({ ...req.body, farmId });
    const data = await ProductionPlanService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { productionPlanId } = productionPlanIdSchema.parse(req.params);
    const payload = updateProductionPlanSchema.parse(req.body);
    const data = await ProductionPlanService.update(farmId, productionPlanId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { productionPlanId } = productionPlanIdSchema.parse(req.params);
    await ProductionPlanService.remove(farmId, productionPlanId);
    res.status(204).send();
  }
}
