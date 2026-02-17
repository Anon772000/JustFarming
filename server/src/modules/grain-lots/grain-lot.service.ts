import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateGrainLotInput, UpdateGrainLotInput } from "./grain-lot.dto";

const ENTITY_TYPE = "grain_lots";

export class GrainLotService {
  static async list(farmId: string) {
    return prisma.grainLot.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, grainLotId: string) {
    const lot = await prisma.grainLot.findFirst({
      where: { id: grainLotId, farmId, deletedAt: null },
    });

    if (!lot) {
      throw new ApiError(404, "Grain lot not found");
    }

    return lot;
  }

  static async create(input: CreateGrainLotInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.GrainLotCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        lotCode: input.lotCode,
        grainType: input.grainType,
        quantityTons: input.quantityTons,
        moisturePct: input.moisturePct,
      };

      const lot = await tx.grainLot.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: lot.id,
        operation: "CREATE",
        payload: lot,
      });

      return lot;
    });
  }

  static async update(farmId: string, grainLotId: string, input: UpdateGrainLotInput) {
    await this.get(farmId, grainLotId);

    return prisma.$transaction(async (tx) => {
      const lot = await tx.grainLot.update({
        where: { id: grainLotId },
        data: {
          lotCode: input.lotCode,
          grainType: input.grainType,
          quantityTons: input.quantityTons,
          moisturePct: input.moisturePct,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: lot.id,
        operation: "UPDATE",
        payload: lot,
      });

      return lot;
    });
  }

  static async remove(farmId: string, grainLotId: string) {
    await this.get(farmId, grainLotId);

    await prisma.$transaction(async (tx) => {
      await tx.grainLot.update({
        where: { id: grainLotId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: grainLotId,
      });
    });
  }
}
