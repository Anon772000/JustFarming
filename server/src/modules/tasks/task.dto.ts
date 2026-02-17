import { TaskStatus } from "@prisma/client";
import { z } from "zod";

export const createTaskSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  paddockId: z.string().uuid().nullable().optional(),
  mobId: z.string().uuid().nullable().optional(),
  createdById: z.string().uuid(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().omit({
  id: true,
  farmId: true,
  createdById: true,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
