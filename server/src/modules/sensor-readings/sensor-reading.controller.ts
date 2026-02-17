import { Request, Response } from "express";
import { z } from "zod";
import { sensorReadingListQuerySchema } from "./sensor-reading.dto";
import { SensorReadingService } from "./sensor-reading.service";

const sensorReadingIdSchema = z.object({ sensorReadingId: z.string().uuid() });

export class SensorReadingController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const query = sensorReadingListQuerySchema.parse(req.query);
    const data = await SensorReadingService.list(farmId, query);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { sensorReadingId } = sensorReadingIdSchema.parse(req.params);
    const data = await SensorReadingService.get(farmId, sensorReadingId);
    res.json({ data });
  }
}
