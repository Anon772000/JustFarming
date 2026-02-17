import { Request, Response } from "express";
import { z } from "zod";
import { createFeedEventSchema, updateFeedEventSchema } from "./feed-event.dto";
import { FeedEventService } from "./feed-event.service";

const feedEventIdSchema = z.object({ feedEventId: z.string().uuid() });

const feedEventListQuerySchema = z.object({
  mobId: z.string().uuid().optional(),
  paddockId: z.string().uuid().optional(),
  feederId: z.string().uuid().optional(),
  hayLotId: z.string().uuid().optional(),
  grainLotId: z.string().uuid().optional(),
});

export class FeedEventController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { mobId, paddockId, feederId, hayLotId, grainLotId } = feedEventListQuerySchema.parse(req.query);
    const data = await FeedEventService.list(farmId, { mobId, paddockId, feederId, hayLotId, grainLotId });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { feedEventId } = feedEventIdSchema.parse(req.params);
    const data = await FeedEventService.get(farmId, feedEventId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createFeedEventSchema.parse({ ...req.body, farmId });
    const data = await FeedEventService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { feedEventId } = feedEventIdSchema.parse(req.params);
    const payload = updateFeedEventSchema.parse(req.body);
    const data = await FeedEventService.update(farmId, feedEventId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { feedEventId } = feedEventIdSchema.parse(req.params);
    await FeedEventService.remove(farmId, feedEventId);
    res.status(204).send();
  }
}
