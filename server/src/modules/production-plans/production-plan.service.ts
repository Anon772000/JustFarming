import { PlanStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateProductionPlanInput, UpdateProductionPlanInput } from "./production-plan.dto";

const ENTITY_TYPE = "production_plans";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

export class ProductionPlanService {
  static async list(
    farmId: string,
    opts?: { paddockId?: string; mobId?: string; status?: PlanStatus },
  ) {
    return prisma.productionPlan.findMany({
      where: {
        farmId,
        deletedAt: null,
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
        ...(opts?.mobId ? { mobId: opts.mobId } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { startDate: "desc" },
    });
  }

  static async get(farmId: string, productionPlanId: string) {
    const plan = await prisma.productionPlan.findFirst({
      where: { id: productionPlanId, farmId, deletedAt: null },
    });

    if (!plan) {
      throw new ApiError(404, "Production plan not found");
    }

    return plan;
  }

  static async create(input: CreateProductionPlanInput) {
    return prisma.$transaction(async (tx) => {
      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, input.farmId, input.paddockId);
      }

      if (typeof input.mobId === "string") {
        await this.assertMobExists(tx, input.farmId, input.mobId);
      }

      const startDate = parseDate(input.startDate);
      const endDate = typeof input.endDate === "string" ? parseDate(input.endDate) : null;

      const data: Prisma.ProductionPlanCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        paddock: input.paddockId ? { connect: { id: input.paddockId } } : undefined,
        mob: input.mobId ? { connect: { id: input.mobId } } : undefined,
        planName: input.planName,
        status: input.status ?? PlanStatus.DRAFT,
        targetMetric: input.targetMetric,
        targetValue: input.targetValue ?? undefined,
        actualValue: input.actualValue ?? undefined,
        startDate,
        endDate,
        notes: input.notes,
      };

      const plan = await tx.productionPlan.create({ data });

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

  static async update(farmId: string, productionPlanId: string, input: UpdateProductionPlanInput) {
    await this.get(farmId, productionPlanId);

    return prisma.$transaction(async (tx) => {
      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, farmId, input.paddockId);
      }

      if (typeof input.mobId === "string") {
        await this.assertMobExists(tx, farmId, input.mobId);
      }

      let endDate: Date | null | undefined;
      if (input.endDate === null) endDate = null;
      if (typeof input.endDate === "string") endDate = parseDate(input.endDate);

      const plan = await tx.productionPlan.update({
        where: { id: productionPlanId },
        data: {
          paddockId: input.paddockId,
          mobId: input.mobId,
          planName: input.planName,
          status: input.status,
          targetMetric: input.targetMetric,
          targetValue: input.targetValue,
          actualValue: input.actualValue,
          startDate: input.startDate ? parseDate(input.startDate) : undefined,
          endDate,
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

  static async remove(farmId: string, productionPlanId: string) {
    await this.get(farmId, productionPlanId);

    await prisma.$transaction(async (tx) => {
      await tx.productionPlan.update({
        where: { id: productionPlanId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: productionPlanId,
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

  private static async assertMobExists(db: Prisma.TransactionClient, farmId: string, mobId: string) {
    const mob = await db.mob.findFirst({
      where: { id: mobId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!mob) {
      throw new ApiError(400, "Invalid mob reference");
    }
  }
}
