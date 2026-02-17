import { Request, Response } from "express";
import { z } from "zod";
import { createContractorSchema, updateContractorSchema } from "./contractor.dto";
import { ContractorService } from "./contractor.service";

const contractorIdSchema = z.object({ contractorId: z.string().uuid() });

export class ContractorController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await ContractorService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { contractorId } = contractorIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await ContractorService.get(farmId, contractorId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createContractorSchema.parse({ ...req.body, farmId });
    const data = await ContractorService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { contractorId } = contractorIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateContractorSchema.parse(req.body);
    const data = await ContractorService.update(farmId, contractorId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { contractorId } = contractorIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await ContractorService.remove(farmId, contractorId);
    res.status(204).send();
  }
}
