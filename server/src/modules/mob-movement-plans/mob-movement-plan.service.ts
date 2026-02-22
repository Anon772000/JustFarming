import { PlanStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateMobMovementPlanInput, UpdateMobMovementPlanInput } from "./mob-movement-plan.dto";

const ENTITY_TYPE = "mob_movement_plans";
const MOB_ENTITY_TYPE = "mobs";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

export class MobMovementPlanService {
  private static readonly mobInclude = {
    mob: {
      select: {
        id: true,
        name: true,
      },
    },
  } as const;

  static async list(farmId: string, opts?: { mobId?: string; paddockId?: string }) {
    return prisma.mobMovementPlan.findMany({
      where: {
        farmId,
        deletedAt: null,
        ...(opts?.mobId ? { mobId: opts.mobId } : {}),
        ...(opts?.paddockId
          ? { OR: [{ toPaddockId: opts.paddockId }, { fromPaddockId: opts.paddockId }] }
          : {}),
      },
      orderBy: { plannedAt: "desc" },
      include: this.mobInclude,
    });
  }

  static async get(farmId: string, mobMovementPlanId: string) {
    const plan = await prisma.mobMovementPlan.findFirst({
      where: { id: mobMovementPlanId, farmId, deletedAt: null },
      include: this.mobInclude,
    });

    if (!plan) {
      throw new ApiError(404, "Mob movement plan not found");
    }

    return plan;
  }

  static async create(input: CreateMobMovementPlanInput) {
    return prisma.$transaction(async (tx) => {
      const mob = await this.assertMobExists(tx, input.farmId, input.mobId);

      const plannedAt = parseDate(input.plannedAt);
      const completing = input.status === PlanStatus.COMPLETED || typeof input.actualAt === "string";
      const status = completing ? PlanStatus.COMPLETED : input.status ?? PlanStatus.PLANNED;
      const actualAt = completing ? (input.actualAt ? parseDate(input.actualAt) : new Date()) : undefined;

      const fromPaddockId = input.fromPaddockId ?? mob.currentPaddockId ?? undefined;

      await this.assertPaddocksExist(
        tx,
        input.farmId,
        [input.toPaddockId, fromPaddockId].filter(Boolean) as string[],
      );

      if (fromPaddockId && fromPaddockId === input.toPaddockId) {
        throw new ApiError(400, "fromPaddockId and toPaddockId must differ");
      }

      const data: Prisma.MobMovementPlanCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        mob: { connect: { id: input.mobId } },
        fromPaddock: fromPaddockId ? { connect: { id: fromPaddockId } } : undefined,
        toPaddock: { connect: { id: input.toPaddockId } },
        status,
        plannedAt,
        actualAt,
        reason: input.reason,
      };

      const plan = await tx.mobMovementPlan.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: plan.id,
        operation: "CREATE",
        payload: plan,
      });

      if (status === PlanStatus.COMPLETED) {
        const updatedMob = await tx.mob.update({
          where: { id: input.mobId },
          data: { currentPaddockId: input.toPaddockId },
        });

        await syncWriter.recordChange(tx, {
          farmId: input.farmId,
          entityType: MOB_ENTITY_TYPE,
          entityId: updatedMob.id,
          operation: "UPDATE",
          payload: updatedMob,
        });
      }

      const withMob = await tx.mobMovementPlan.findUnique({
        where: { id: plan.id },
        include: this.mobInclude,
      });

      if (!withMob) {
        throw new ApiError(404, "Mob movement plan not found");
      }

      return withMob;
    });
  }

  static async update(farmId: string, mobMovementPlanId: string, input: UpdateMobMovementPlanInput) {
    const existing = await this.get(farmId, mobMovementPlanId);

    const mobId = input.mobId ?? existing.mobId;
    const toPaddockId = input.toPaddockId ?? existing.toPaddockId;

    return prisma.$transaction(async (tx) => {
      const mob = await this.assertMobExists(tx, farmId, mobId);

      const completing = input.status === PlanStatus.COMPLETED || typeof input.actualAt === "string";
      const status = completing ? PlanStatus.COMPLETED : input.status;
      const actualAt = completing
        ? input.actualAt
          ? parseDate(input.actualAt)
          : existing.actualAt ?? new Date()
        : undefined;

      let fromPaddockId: string | undefined;
      if (typeof input.fromPaddockId === "string") {
        fromPaddockId = input.fromPaddockId;
      } else if (completing && !existing.fromPaddockId && mob.currentPaddockId) {
        // When completing a move, capture the mob's current paddock if the plan didn't have one.
        fromPaddockId = mob.currentPaddockId;
      }

      const paddockIdsToCheck = [
        input.toPaddockId,
        typeof fromPaddockId === "string" ? fromPaddockId : undefined,
      ].filter(Boolean) as string[];

      await this.assertPaddocksExist(tx, farmId, Array.from(new Set(paddockIdsToCheck)));

      const fromToCompare = fromPaddockId ?? existing.fromPaddockId;
      if (fromToCompare && fromToCompare === toPaddockId) {
        throw new ApiError(400, "fromPaddockId and toPaddockId must differ");
      }

      const plan = await tx.mobMovementPlan.update({
        where: { id: mobMovementPlanId },
        data: {
          mobId: input.mobId,
          fromPaddockId,
          toPaddockId: input.toPaddockId,
          status,
          plannedAt: input.plannedAt ? parseDate(input.plannedAt) : undefined,
          actualAt,
          reason: input.reason,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: plan.id,
        operation: "UPDATE",
        payload: plan,
      });

      if (plan.status === PlanStatus.COMPLETED) {
        const updatedMob = await tx.mob.update({
          where: { id: plan.mobId },
          data: { currentPaddockId: plan.toPaddockId },
        });

        await syncWriter.recordChange(tx, {
          farmId,
          entityType: MOB_ENTITY_TYPE,
          entityId: updatedMob.id,
          operation: "UPDATE",
          payload: updatedMob,
        });
      }

      const withMob = await tx.mobMovementPlan.findUnique({
        where: { id: plan.id },
        include: this.mobInclude,
      });

      if (!withMob) {
        throw new ApiError(404, "Mob movement plan not found");
      }

      return withMob;
    });
  }

  static async remove(farmId: string, mobMovementPlanId: string) {
    await this.get(farmId, mobMovementPlanId);

    await prisma.$transaction(async (tx) => {
      await tx.mobMovementPlan.update({
        where: { id: mobMovementPlanId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: mobMovementPlanId,
      });
    });
  }

  private static async assertMobExists(db: Prisma.TransactionClient, farmId: string, mobId: string) {
    const mob = await db.mob.findFirst({
      where: { id: mobId, farmId, deletedAt: null },
    });

    if (!mob) {
      throw new ApiError(400, "Invalid mob reference");
    }

    return mob;
  }

  private static async assertPaddocksExist(
    db: Prisma.TransactionClient,
    farmId: string,
    paddockIds: string[],
  ): Promise<void> {
    const unique = Array.from(new Set(paddockIds));
    if (unique.length === 0) return;

    const count = await db.paddock.count({
      where: { farmId, deletedAt: null, id: { in: unique } },
    });

    if (count !== unique.length) {
      throw new ApiError(400, "Invalid paddock reference");
    }
  }
}
