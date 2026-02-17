import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateWaterAssetInput, UpdateWaterAssetInput } from "./water-asset.dto";

const ENTITY_TYPE = "water_assets";

export class WaterAssetService {
  static async list(farmId: string) {
    return prisma.waterAsset.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, waterAssetId: string) {
    const asset = await prisma.waterAsset.findFirst({
      where: { id: waterAssetId, farmId, deletedAt: null },
    });

    if (!asset) {
      throw new ApiError(404, "Water asset not found");
    }

    return asset;
  }

  static async create(input: CreateWaterAssetInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.WaterAssetCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        type: input.type,
        name: input.name,
        locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
        capacityLitres: input.capacityLitres,
        metadataJson: input.metadataJson === undefined ? undefined : (input.metadataJson as any),
      };

      const asset = await tx.waterAsset.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: asset.id,
        operation: "CREATE",
        payload: asset,
      });

      return asset;
    });
  }

  static async update(farmId: string, waterAssetId: string, input: UpdateWaterAssetInput) {
    await this.get(farmId, waterAssetId);

    return prisma.$transaction(async (tx) => {
      const asset = await tx.waterAsset.update({
        where: { id: waterAssetId },
        data: {
          type: input.type,
          name: input.name,
          locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
          capacityLitres: input.capacityLitres,
          metadataJson: input.metadataJson === undefined ? undefined : (input.metadataJson as any),
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: asset.id,
        operation: "UPDATE",
        payload: asset,
      });

      return asset;
    });
  }

  static async remove(farmId: string, waterAssetId: string) {
    await this.get(farmId, waterAssetId);

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.waterAsset.update({
        where: { id: waterAssetId },
        data: { deletedAt: now },
      });

      // Soft-delete any links connected to this asset to avoid dangling map edges.
      const links = await tx.waterLink.findMany({
        where: {
          farmId,
          deletedAt: null,
          OR: [{ fromAssetId: waterAssetId }, { toAssetId: waterAssetId }],
        },
      });

      if (links.length) {
        await tx.waterLink.updateMany({
          where: { id: { in: links.map((l) => l.id) } },
          data: { deletedAt: now },
        });

        for (const link of links) {
          await syncWriter.recordTombstone(tx, {
            farmId,
            entityType: "water_links",
            entityId: link.id,
          });
        }
      }

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: waterAssetId,
      });
    });
  }
}
