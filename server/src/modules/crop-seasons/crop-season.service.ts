import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateCropSeasonInput, UpdateCropSeasonInput } from "./crop-season.dto";

const ENTITY_TYPE = "crop_seasons";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

export class CropSeasonService {
  static async list(farmId: string, opts?: { paddockId?: string }) {
    return prisma.cropSeason.findMany({
      where: {
        farmId,
        deletedAt: null,
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
      },
      orderBy: { startDate: "desc" },
    });
  }

  static async get(farmId: string, cropSeasonId: string) {
    const season = await prisma.cropSeason.findFirst({
      where: { id: cropSeasonId, farmId, deletedAt: null },
    });

    if (!season) {
      throw new ApiError(404, "Crop season not found");
    }

    return season;
  }

  static async create(input: CreateCropSeasonInput) {
    return prisma.$transaction(async (tx) => {
      await this.assertPaddockExists(tx, input.farmId, input.paddockId);

      const startDate = parseDate(input.startDate);
      const endDate = typeof input.endDate === "string" ? parseDate(input.endDate) : null;

      const data: Prisma.CropSeasonCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        paddock: { connect: { id: input.paddockId } },
        seasonName: input.seasonName,
        cropType: input.cropType,
        startDate,
        endDate,
        targetYieldTons: input.targetYieldTons ?? undefined,
        actualYieldTons: input.actualYieldTons ?? undefined,
        notes: input.notes,
      };

      const season = await tx.cropSeason.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: season.id,
        operation: "CREATE",
        payload: season,
      });

      return season;
    });
  }

  static async update(farmId: string, cropSeasonId: string, input: UpdateCropSeasonInput) {
    await this.get(farmId, cropSeasonId);

    return prisma.$transaction(async (tx) => {
      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, farmId, input.paddockId);
      }

      let endDate: Date | null | undefined;
      if (input.endDate === null) endDate = null;
      if (typeof input.endDate === "string") endDate = parseDate(input.endDate);

      const season = await tx.cropSeason.update({
        where: { id: cropSeasonId },
        data: {
          paddockId: input.paddockId,
          seasonName: input.seasonName,
          cropType: input.cropType,
          startDate: input.startDate ? parseDate(input.startDate) : undefined,
          endDate,
          targetYieldTons: input.targetYieldTons,
          actualYieldTons: input.actualYieldTons,
          notes: input.notes,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: season.id,
        operation: "UPDATE",
        payload: season,
      });

      return season;
    });
  }

  static async remove(farmId: string, cropSeasonId: string) {
    await this.get(farmId, cropSeasonId);

    await prisma.$transaction(async (tx) => {
      await tx.cropSeason.update({
        where: { id: cropSeasonId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: cropSeasonId,
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
}
