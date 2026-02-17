import { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateTaskInput, UpdateTaskInput } from "./task.dto";

const ENTITY_TYPE = "tasks";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

export class TaskService {
  static async list(
    farmId: string,
    opts?: { status?: TaskStatus; assignedToId?: string; paddockId?: string; mobId?: string },
  ) {
    return prisma.task.findMany({
      where: {
        farmId,
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.assignedToId ? { assignedToId: opts.assignedToId } : {}),
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
        ...(opts?.mobId ? { mobId: opts.mobId } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async get(farmId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, farmId },
    });

    if (!task) {
      throw new ApiError(404, "Task not found");
    }

    return task;
  }

  static async create(input: CreateTaskInput) {
    return prisma.$transaction(async (tx) => {
      await this.assertUserExists(tx, input.farmId, input.createdById);

      if (typeof input.assignedToId === "string") {
        await this.assertUserExists(tx, input.farmId, input.assignedToId);
      }

      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, input.farmId, input.paddockId);
      }

      if (typeof input.mobId === "string") {
        await this.assertMobExists(tx, input.farmId, input.mobId);
      }

      const status = input.status ?? TaskStatus.OPEN;
      const now = new Date();
      const dueAt = typeof input.dueAt === "string" ? parseDate(input.dueAt) : null;
      const completedAt = status === TaskStatus.DONE ? now : null;

      const data: Prisma.TaskCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        title: input.title,
        description: input.description,
        status,
        dueAt,
        paddock: input.paddockId ? { connect: { id: input.paddockId } } : undefined,
        mob: input.mobId ? { connect: { id: input.mobId } } : undefined,
        createdBy: { connect: { id: input.createdById } },
        assignedTo: input.assignedToId ? { connect: { id: input.assignedToId } } : undefined,
        completedAt,
      };

      const task = await tx.task.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: task.id,
        operation: "CREATE",
        payload: task,
      });

      return task;
    });
  }

  static async update(farmId: string, taskId: string, input: UpdateTaskInput) {
    const existing = await this.get(farmId, taskId);

    if (typeof input.assignedToId === "string") {
      await this.assertUserExists(prisma, farmId, input.assignedToId);
    }

    if (typeof input.paddockId === "string") {
      await this.assertPaddockExists(prisma, farmId, input.paddockId);
    }

    if (typeof input.mobId === "string") {
      await this.assertMobExists(prisma, farmId, input.mobId);
    }

    return prisma.$transaction(async (tx) => {
      const nextStatus = input.status ?? existing.status;

      let completedAt: Date | null | undefined;
      if (input.status !== undefined) {
        completedAt = nextStatus === TaskStatus.DONE ? existing.completedAt ?? new Date() : null;
      }

      const dueAt =
        typeof input.dueAt === "string" ? parseDate(input.dueAt) : input.dueAt === null ? null : undefined;

      const task = await tx.task.update({
        where: { id: taskId },
        data: {
          title: input.title,
          description: input.description,
          status: input.status,
          dueAt,
          paddockId: input.paddockId,
          mobId: input.mobId,
          assignedToId: input.assignedToId,
          completedAt,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: task.id,
        operation: "UPDATE",
        payload: task,
      });

      return task;
    });
  }

  static async remove(farmId: string, taskId: string) {
    await this.get(farmId, taskId);

    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: taskId,
      });
    });
  }

  private static async assertPaddockExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, paddockId: string) {
    const paddock = await db.paddock.findFirst({
      where: { id: paddockId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!paddock) {
      throw new ApiError(400, "Invalid paddock reference");
    }
  }

  private static async assertMobExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, mobId: string) {
    const mob = await db.mob.findFirst({
      where: { id: mobId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!mob) {
      throw new ApiError(400, "Invalid mob reference");
    }
  }

  private static async assertUserExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, userId: string) {
    const user = await db.user.findFirst({
      where: { id: userId, farmId },
      select: { id: true },
    });

    if (!user) {
      throw new ApiError(400, "Invalid user reference");
    }
  }
}
