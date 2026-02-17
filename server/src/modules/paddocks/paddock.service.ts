import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreatePaddockInput, UpdatePaddockInput } from "./paddock.dto";

const ENTITY_TYPE = "paddocks";

export class PaddockService {
  static async list(farmId: string) {
    return prisma.paddock.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, paddockId: string) {
    const paddock = await prisma.paddock.findFirst({
      where: { id: paddockId, farmId, deletedAt: null },
    });

    if (!paddock) {
      throw new ApiError(404, "Paddock not found");
    }

    return paddock;
  }

  static async create(input: CreatePaddockInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.PaddockCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        name: input.name,
        areaHa: input.areaHa,
        boundaryGeoJson: input.boundaryGeoJson as Prisma.InputJsonValue | undefined,
        currentStatus: input.currentStatus,
      };

      const paddock = await tx.paddock.create({ data });
      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: paddock.id,
        operation: "CREATE",
        payload: paddock,
      });

      return paddock;
    });
  }

  static async update(farmId: string, paddockId: string, input: UpdatePaddockInput) {
    await this.get(farmId, paddockId);

    return prisma.$transaction(async (tx) => {
      const paddock = await tx.paddock.update({
        where: { id: paddockId },
        data: {
          name: input.name,
          areaHa: input.areaHa,
          boundaryGeoJson: input.boundaryGeoJson as Prisma.InputJsonValue | undefined,
          currentStatus: input.currentStatus,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: paddock.id,
        operation: "UPDATE",
        payload: paddock,
      });

      return paddock;
    });
  }

  static async remove(farmId: string, paddockId: string) {
    await this.get(farmId, paddockId);

    await prisma.$transaction(async (tx) => {
      await tx.paddock.update({
        where: { id: paddockId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: paddockId,
      });
    });
  }
}
