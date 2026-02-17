import { Request, Response } from "express";
import { z } from "zod";
import { createActivityEventSchema, updateActivityEventSchema } from "./activity-event.dto";
import { ActivityEventService } from "./activity-event.service";

const activityEventIdSchema = z.object({ activityEventId: z.string().uuid() });

const listQuerySchema = z.object({
  entityType: z.string().min(1).max(60).optional(),
  entityId: z.string().uuid().optional(),
  eventType: z.string().min(1).max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  when: z.enum(["any", "planned", "actual"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export class ActivityEventController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { entityType, entityId, eventType, from, to, when, limit, order } = listQuerySchema.parse(req.query);

    const data = await ActivityEventService.list(farmId, {
      entityType,
      entityId,
      eventType,
      from,
      to,
      when,
      limit,
      order,
    });

    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { activityEventId } = activityEventIdSchema.parse(req.params);
    const data = await ActivityEventService.get(farmId, activityEventId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const payload = createActivityEventSchema.parse({ ...req.body, farmId });
    const data = await ActivityEventService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { activityEventId } = activityEventIdSchema.parse(req.params);
    const payload = updateActivityEventSchema.parse(req.body);
    const data = await ActivityEventService.update(farmId, activityEventId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { activityEventId } = activityEventIdSchema.parse(req.params);
    await ActivityEventService.remove(farmId, activityEventId);
    res.status(204).send();
  }
}
