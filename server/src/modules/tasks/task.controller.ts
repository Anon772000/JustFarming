import { TaskStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { createTaskSchema, updateTaskSchema } from "./task.dto";
import { TaskService } from "./task.service";

const taskIdSchema = z.object({ taskId: z.string().uuid() });

const taskListQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  assignedToId: z.string().uuid().optional(),
  paddockId: z.string().uuid().optional(),
  mobId: z.string().uuid().optional(),
});

export class TaskController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { status, assignedToId, paddockId, mobId } = taskListQuerySchema.parse(req.query);
    const data = await TaskService.list(farmId, { status, assignedToId, paddockId, mobId });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { taskId } = taskIdSchema.parse(req.params);
    const data = await TaskService.get(farmId, taskId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const userId = req.auth!.sub;
    const payload = createTaskSchema.parse({ ...req.body, farmId, createdById: userId });
    const data = await TaskService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { taskId } = taskIdSchema.parse(req.params);
    const payload = updateTaskSchema.parse(req.body);
    const data = await TaskService.update(farmId, taskId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { taskId } = taskIdSchema.parse(req.params);
    await TaskService.remove(farmId, taskId);
    res.status(204).send();
  }
}
