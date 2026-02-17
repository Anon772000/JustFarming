import { Request, Response } from "express";
import { z } from "zod";
import {
  createMobPaddockAllocationSchema,
  updateMobPaddockAllocationSchema,
} from "./mob-paddock-allocation.dto";
import { MobPaddockAllocationService } from "./mob-paddock-allocation.service";

const allocationIdSchema = z.object({ allocationId: z.string().uuid() });

const listQuerySchema = z.object({
  mobId: z.string().uuid().optional(),
  paddockId: z.string().uuid().optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

export class MobPaddockAllocationController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { mobId, paddockId, active } = listQuerySchema.parse(req.query);
    const data = await MobPaddockAllocationService.list(farmId, { mobId, paddockId, active });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { allocationId } = allocationIdSchema.parse(req.params);
    const data = await MobPaddockAllocationService.get(farmId, allocationId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createMobPaddockAllocationSchema.parse({ ...req.body, farmId });
    const data = await MobPaddockAllocationService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { allocationId } = allocationIdSchema.parse(req.params);
    const payload = updateMobPaddockAllocationSchema.parse(req.body);
    const data = await MobPaddockAllocationService.update(farmId, allocationId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { allocationId } = allocationIdSchema.parse(req.params);
    await MobPaddockAllocationService.remove(farmId, allocationId);
    res.status(204).send();
  }
}
