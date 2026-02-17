import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateFeederInput, UpdateFeederInput } from "./feeder.dto";

const ENTITY_TYPE = "feeders";

export class FeederService {
  static async list(farmId: string) {
    return prisma.feeder.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, feederId: string) {
    const feeder = await prisma.feeder.findFirst({
      where: { id: feederId, farmId, deletedAt: null },
    });

    if (!feeder) {
      throw new ApiError(404, "Feeder not found");
    }

    return feeder;
  }

  static async create(input: CreateFeederInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.FeederCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        name: input.name,
        feederType: input.feederType,
        locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
        capacityKg: input.capacityKg,
      };

      const feeder = await tx.feeder.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: feeder.id,
        operation: "CREATE",
        payload: feeder,
      });

      return feeder;
    });
  }

  static async update(farmId: string, feederId: string, input: UpdateFeederInput) {
    await this.get(farmId, feederId);

    return prisma.$transaction(async (tx) => {
      const feeder = await tx.feeder.update({
        where: { id: feederId },
        data: {
          name: input.name,
          feederType: input.feederType,
          locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
          capacityKg: input.capacityKg,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: feeder.id,
        operation: "UPDATE",
        payload: feeder,
      });

      return feeder;
    });
  }

  static async remove(farmId: string, feederId: string) {
    await this.get(farmId, feederId);

    await prisma.$transaction(async (tx) => {
      await tx.feeder.update({
        where: { id: feederId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: feederId,
      });
    });
  }
}
