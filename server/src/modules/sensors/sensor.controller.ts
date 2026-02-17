import { Request, Response } from "express";
import { z } from "zod";
import { createSensorSchema, updateSensorSchema } from "./sensor.dto";
import { SensorService } from "./sensor.service";

const sensorIdSchema = z.object({ sensorId: z.string().uuid() });
const sensorListQuerySchema = z.object({
  nodeId: z.string().uuid().optional(),
});

export class SensorController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { nodeId } = sensorListQuerySchema.parse(req.query);
    const data = await SensorService.list(farmId, { nodeId });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { sensorId } = sensorIdSchema.parse(req.params);
    const data = await SensorService.get(farmId, sensorId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createSensorSchema.parse({ ...req.body, farmId });
    const data = await SensorService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { sensorId } = sensorIdSchema.parse(req.params);
    const payload = updateSensorSchema.parse(req.body);
    const data = await SensorService.update(farmId, sensorId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { sensorId } = sensorIdSchema.parse(req.params);
    await SensorService.remove(farmId, sensorId);
    res.status(204).send();
  }
}
