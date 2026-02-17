import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateMobInput, UpdateMobInput } from "./mob.dto";

const ENTITY_TYPE = "mobs";

export class MobService {
  static async list(farmId: string) {
    return prisma.mob.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, mobId: string) {
    const mob = await prisma.mob.findFirst({
      where: { id: mobId, farmId, deletedAt: null },
    });

    if (!mob) {
      throw new ApiError(404, "Mob not found");
    }

    return mob;
  }

  static async create(input: CreateMobInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.MobCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        name: input.name,
        species: input.species,
        headCount: input.headCount,
        avgWeightKg: input.avgWeightKg,
        currentPaddock: input.currentPaddockId ? { connect: { id: input.currentPaddockId } } : undefined,
      };

      const mob = await tx.mob.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: mob.id,
        operation: "CREATE",
        payload: mob,
      });

      return mob;
    });
  }

  static async update(farmId: string, mobId: string, input: UpdateMobInput) {
    await this.get(farmId, mobId);

    return prisma.$transaction(async (tx) => {
      const mob = await tx.mob.update({
        where: { id: mobId },
        data: {
          name: input.name,
          species: input.species,
          headCount: input.headCount,
          avgWeightKg: input.avgWeightKg,
          currentPaddockId: input.currentPaddockId,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: mob.id,
        operation: "UPDATE",
        payload: mob,
      });

      return mob;
    });
  }

  static async remove(farmId: string, mobId: string) {
    await this.get(farmId, mobId);

    await prisma.$transaction(async (tx) => {
      await tx.mob.update({
        where: { id: mobId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: mobId,
      });
    });
  }
}
