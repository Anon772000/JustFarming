import { PlanStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreatePaddockPlanInput, UpdatePaddockPlanInput } from "./paddock-plan.dto";

const ENTITY_TYPE = "paddock_plans";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

function parseDateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseDate(value);
}

export class PaddockPlanService {
  static async list(farmId: string, opts?: { paddockId?: string; status?: PlanStatus }) {
    return prisma.paddockPlan.findMany({
      where: {
        farmId,
        deletedAt: null,
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { plannedStart: "desc" },
    });
  }

  static async get(farmId: string, paddockPlanId: string) {
    const plan = await prisma.paddockPlan.findFirst({
      where: { id: paddockPlanId, farmId, deletedAt: null },
    });

    if (!plan) {
      throw new ApiError(404, "Paddock plan not found");
    }

    return plan;
  }

  static async create(input: CreatePaddockPlanInput) {
    return prisma.$transaction(async (tx) => {
      await this.assertPaddockExists(tx, input.farmId, input.paddockId);

      const plannedStart = parseDate(input.plannedStart);
      const plannedEnd = parseDateOrNull(input.plannedEnd);
      const actualStart = parseDateOrNull(input.actualStart);
      const actualEnd = parseDateOrNull(input.actualEnd);

      const data: Prisma.PaddockPlanCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        paddock: { connect: { id: input.paddockId } },
        name: input.name,
        status: input.status ?? PlanStatus.DRAFT,
        plannedStart,
        plannedEnd: plannedEnd ?? null,
        actualStart: actualStart ?? null,
        actualEnd: actualEnd ?? null,
        notes: input.notes,
      };

      const plan = await tx.paddockPlan.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: plan.id,
        operation: "CREATE",
        payload: plan,
      });

      return plan;
    });
  }

  static async update(farmId: string, paddockPlanId: string, input: UpdatePaddockPlanInput) {
    await this.get(farmId, paddockPlanId);

    return prisma.$transaction(async (tx) => {
      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, farmId, input.paddockId);
      }

      const plannedEnd = parseDateOrNull(input.plannedEnd);
      const actualStart = parseDateOrNull(input.actualStart);
      const actualEnd = parseDateOrNull(input.actualEnd);

      const plan = await tx.paddockPlan.update({
        where: { id: paddockPlanId },
        data: {
          paddockId: input.paddockId,
          name: input.name,
          status: input.status,
          plannedStart: input.plannedStart ? parseDate(input.plannedStart) : undefined,
          plannedEnd,
          actualStart,
          actualEnd,
          notes: input.notes,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: plan.id,
        operation: "UPDATE",
        payload: plan,
      });

      return plan;
    });
  }

  static async remove(farmId: string, paddockPlanId: string) {
    await this.get(farmId, paddockPlanId);

    await prisma.$transaction(async (tx) => {
      await tx.paddockPlan.update({
        where: { id: paddockPlanId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: paddockPlanId,
      });
    });
  }

  private static async assertPaddockExists(db: Prisma.TransactionClient, farmId: string, paddockId: string) {
    const paddock = await db.paddock.findFirst({
      where: { id: paddockId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!paddock) {
      throw new ApiError(400, "Invalid paddock reference");
    }
  }
}
