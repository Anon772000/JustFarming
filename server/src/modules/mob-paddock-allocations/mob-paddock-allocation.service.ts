import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateMobPaddockAllocationInput, UpdateMobPaddockAllocationInput } from "./mob-paddock-allocation.dto";

const ENTITY_TYPE = "mob_paddock_allocations";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

async function assertMobExists(db: Prisma.TransactionClient, farmId: string, mobId: string) {
  const mob = await db.mob.findFirst({
    where: {
      id: mobId,
      farmId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!mob) {
    throw new ApiError(400, "Invalid mob reference");
  }
}

async function assertPaddockExists(db: Prisma.TransactionClient, farmId: string, paddockId: string) {
  const paddock = await db.paddock.findFirst({
    where: {
      id: paddockId,
      farmId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!paddock) {
    throw new ApiError(400, "Invalid paddock reference");
  }
}

export type MobPaddockAllocationListOpts = {
  mobId?: string;
  paddockId?: string;
  active?: boolean;
};

export class MobPaddockAllocationService {
  static async list(farmId: string, opts?: MobPaddockAllocationListOpts) {
    const where: Prisma.MobPaddockAllocationWhereInput = {
      farmId,
      deletedAt: null,
      ...(opts?.mobId ? { mobId: opts.mobId } : {}),
      ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
    };

    if (opts?.active === true) {
      where.endedAt = null;
    } else if (opts?.active === false) {
      where.endedAt = { not: null };
    }

    return prisma.mobPaddockAllocation.findMany({
      where,
      orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
    });
  }

  static async get(farmId: string, allocationId: string) {
    const allocation = await prisma.mobPaddockAllocation.findFirst({
      where: { id: allocationId, farmId, deletedAt: null },
    });

    if (!allocation) {
      throw new ApiError(404, "Mob paddock allocation not found");
    }

    return allocation;
  }

  static async create(input: CreateMobPaddockAllocationInput) {
    return prisma.$transaction(async (tx) => {
      await assertMobExists(tx, input.farmId, input.mobId);
      await assertPaddockExists(tx, input.farmId, input.paddockId);

      const startedAt = typeof input.startedAt === "string" ? parseDate(input.startedAt) : new Date();
      const endedAt =
        input.endedAt === undefined
          ? undefined
          : input.endedAt === null
            ? null
            : parseDate(input.endedAt);

      // If the user is creating a new active allocation for the same mob+paddock,
      // automatically end any previous active allocation to keep "current" sane.
      if (endedAt === null || endedAt === undefined) {
        await tx.mobPaddockAllocation.updateMany({
          where: {
            farmId: input.farmId,
            mobId: input.mobId,
            paddockId: input.paddockId,
            deletedAt: null,
            endedAt: null,
          },
          data: {
            endedAt: new Date(),
          },
        });
      }

      const data: Prisma.MobPaddockAllocationCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        mob: { connect: { id: input.mobId } },
        paddock: { connect: { id: input.paddockId } },
        headCount: input.headCount === undefined ? undefined : input.headCount,
        startedAt,
        endedAt,
        notes: input.notes,
      };

      const allocation = await tx.mobPaddockAllocation.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: allocation.id,
        operation: "CREATE",
        payload: allocation,
      });

      return allocation;
    });
  }

  static async update(farmId: string, allocationId: string, input: UpdateMobPaddockAllocationInput) {
    const existing = await this.get(farmId, allocationId);

    return prisma.$transaction(async (tx) => {
      const nextMobId = input.mobId ?? existing.mobId;
      const nextPaddockId = input.paddockId ?? existing.paddockId;

      await assertMobExists(tx, farmId, nextMobId);
      await assertPaddockExists(tx, farmId, nextPaddockId);

      const startedAt = typeof input.startedAt === "string" ? parseDate(input.startedAt) : undefined;
      const endedAt =
        input.endedAt === undefined
          ? undefined
          : input.endedAt === null
            ? null
            : parseDate(input.endedAt);

      const allocation = await tx.mobPaddockAllocation.update({
        where: { id: allocationId },
        data: {
          mobId: input.mobId,
          paddockId: input.paddockId,
          headCount: input.headCount === undefined ? undefined : input.headCount,
          startedAt,
          endedAt,
          notes: input.notes,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: allocation.id,
        operation: "UPDATE",
        payload: allocation,
      });

      return allocation;
    });
  }

  static async remove(farmId: string, allocationId: string) {
    await this.get(farmId, allocationId);

    await prisma.$transaction(async (tx) => {
      await tx.mobPaddockAllocation.update({
        where: { id: allocationId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: allocationId,
      });
    });
  }
}
