import { Request, Response } from "express";
import { z } from "zod";
import { createLoraNodeSchema, updateLoraNodeSchema } from "./lora-node.dto";
import { LoraNodeService } from "./lora-node.service";

const loraNodeIdSchema = z.object({ loraNodeId: z.string().uuid() });

export class LoraNodeController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await LoraNodeService.list(farmId);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { loraNodeId } = loraNodeIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await LoraNodeService.get(farmId, loraNodeId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createLoraNodeSchema.parse({ ...req.body, farmId });
    const data = await LoraNodeService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { loraNodeId } = loraNodeIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const payload = updateLoraNodeSchema.parse(req.body);
    const data = await LoraNodeService.update(farmId, loraNodeId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { loraNodeId } = loraNodeIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    await LoraNodeService.remove(farmId, loraNodeId);
    res.status(204).send();
  }
}
