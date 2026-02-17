import { Request, Response } from "express";
import { z } from "zod";
import { createUserSchema, updateUserSchema } from "./user.dto";
import { UserService } from "./user.service";

const userIdSchema = z.object({ userId: z.string().uuid() });
const listSessionsQuerySchema = z.object({ deviceId: z.string().min(1).max(200).optional() });
const revokeUserSessionParamsSchema = z.object({ userId: z.string().uuid(), sessionId: z.string().uuid() });
const listAuditQuerySchema = z.object({
  targetUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export class UserController {
  static async me(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const userId = req.auth!.sub;
    const data = await UserService.me(farmId, userId);
    res.json({ data });
  }

  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const data = await UserService.list(farmId);
    res.json({ data });
  }

  static async listAudit(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { targetUserId, limit } = listAuditQuerySchema.parse(req.query);
    const data = await UserService.listAudit(farmId, { targetUserId, limit });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const { userId } = userIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const data = await UserService.get(farmId, userId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const actorUserId = req.auth!.sub;
    const payload = createUserSchema.parse({ ...req.body, farmId });
    const data = await UserService.create(payload, actorUserId);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { userId } = userIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const actorUserId = req.auth!.sub;
    const payload = updateUserSchema.parse(req.body);
    const data = await UserService.update(farmId, userId, payload, actorUserId);
    res.json({ data });
  }

  static async listSessions(req: Request, res: Response): Promise<void> {
    const { userId } = userIdSchema.parse(req.params);
    const { deviceId } = listSessionsQuerySchema.parse(req.query);
    const farmId = req.auth!.farmId;
    const data = await UserService.listSessions(farmId, userId, deviceId);
    res.json({ data });
  }

  static async revokeSession(req: Request, res: Response): Promise<void> {
    const { userId, sessionId } = revokeUserSessionParamsSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const actorUserId = req.auth!.sub;
    await UserService.revokeSession(farmId, userId, sessionId, actorUserId);
    res.status(204).end();
  }

  static async revokeSessions(req: Request, res: Response): Promise<void> {
    const { userId } = userIdSchema.parse(req.params);
    const farmId = req.auth!.farmId;
    const actorUserId = req.auth!.sub;
    await UserService.revokeSessions(farmId, userId, actorUserId);
    res.status(204).end();
  }
}
