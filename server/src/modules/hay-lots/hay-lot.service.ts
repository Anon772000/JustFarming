import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateHayLotInput, UpdateHayLotInput } from "./hay-lot.dto";

const ENTITY_TYPE = "hay_lots";

export class HayLotService {
  static async list(farmId: string) {
    return prisma.hayLot.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, hayLotId: string) {
    const lot = await prisma.hayLot.findFirst({
      where: { id: hayLotId, farmId, deletedAt: null },
    });

    if (!lot) {
      throw new ApiError(404, "Hay lot not found");
    }

    return lot;
  }

  static async create(input: CreateHayLotInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.HayLotCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        lotCode: input.lotCode,
        quantityTons: input.quantityTons,
        qualityGrade: input.qualityGrade,
        location: input.location,
      };

      const lot = await tx.hayLot.create({ data });

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

  static async update(farmId: string, hayLotId: string, input: UpdateHayLotInput) {
    await this.get(farmId, hayLotId);

    return prisma.$transaction(async (tx) => {
      const lot = await tx.hayLot.update({
        where: { id: hayLotId },
        data: {
          lotCode: input.lotCode,
          quantityTons: input.quantityTons,
          qualityGrade: input.qualityGrade,
          location: input.location,
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

  static async remove(farmId: string, hayLotId: string) {
    await this.get(farmId, hayLotId);

    await prisma.$transaction(async (tx) => {
      await tx.hayLot.update({
        where: { id: hayLotId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: hayLotId,
      });
    });
  }
}
