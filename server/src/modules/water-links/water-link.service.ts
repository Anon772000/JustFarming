import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateWaterLinkInput, UpdateWaterLinkInput } from "./water-link.dto";

const ENTITY_TYPE = "water_links";

export class WaterLinkService {
  static async list(farmId: string) {
    return prisma.waterLink.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, waterLinkId: string) {
    const link = await prisma.waterLink.findFirst({
      where: { id: waterLinkId, farmId, deletedAt: null },
    });

    if (!link) {
      throw new ApiError(404, "Water link not found");
    }

    return link;
  }

  static async create(input: CreateWaterLinkInput) {
    return prisma.$transaction(async (tx) => {
      await this.assertAssetsExist(tx, input.farmId, [input.fromAssetId, input.toAssetId]);

      const data: Prisma.WaterLinkCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        fromAsset: { connect: { id: input.fromAssetId } },
        toAsset: { connect: { id: input.toAssetId } },
        connectionType: input.connectionType,
        diameterMm: input.diameterMm,
      };

      const link = await tx.waterLink.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: link.id,
        operation: "CREATE",
        payload: link,
      });

      return link;
    });
  }

  static async update(farmId: string, waterLinkId: string, input: UpdateWaterLinkInput) {
    const existing = await this.get(farmId, waterLinkId);

    const fromAssetId = input.fromAssetId ?? existing.fromAssetId;
    const toAssetId = input.toAssetId ?? existing.toAssetId;

    if (fromAssetId === toAssetId) {
      throw new ApiError(400, "fromAssetId and toAssetId must differ");
    }

    return prisma.$transaction(async (tx) => {
      await this.assertAssetsExist(tx, farmId, [fromAssetId, toAssetId]);

      const link = await tx.waterLink.update({
        where: { id: waterLinkId },
        data: {
          fromAssetId: input.fromAssetId,
          toAssetId: input.toAssetId,
          connectionType: input.connectionType,
          diameterMm: input.diameterMm,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: link.id,
        operation: "UPDATE",
        payload: link,
      });

      return link;
    });
  }

  static async remove(farmId: string, waterLinkId: string) {
    await this.get(farmId, waterLinkId);

    await prisma.$transaction(async (tx) => {
      await tx.waterLink.update({
        where: { id: waterLinkId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: waterLinkId,
      });
    });
  }

  private static async assertAssetsExist(
    db: Prisma.TransactionClient,
    farmId: string,
    assetIds: string[],
  ): Promise<void> {
    const unique = Array.from(new Set(assetIds));

    const count = await db.waterAsset.count({
      where: {
        farmId,
        deletedAt: null,
        id: { in: unique },
      },
    });

    if (count !== unique.length) {
      throw new ApiError(400, "Invalid water asset reference");
    }
  }
}
