import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreatePestSpottingInput, UpdatePestSpottingInput } from "./pest-spotting.dto";

const ENTITY_TYPE = "pest_spottings";

export class PestSpottingService {
  static async list(farmId: string, opts?: { paddockId?: string; pestType?: string }) {
    return prisma.pestSpotting.findMany({
      where: {
        farmId,
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
        ...(opts?.pestType ? { pestType: opts.pestType } : {}),
      },
      orderBy: { spottedAt: "desc" },
    });
  }

  static async get(farmId: string, pestSpottingId: string) {
    const spot = await prisma.pestSpotting.findFirst({
      where: { id: pestSpottingId, farmId },
    });

    if (!spot) {
      throw new ApiError(404, "Pest spotting not found");
    }

    return spot;
  }

  static async create(input: CreatePestSpottingInput) {
    return prisma.$transaction(async (tx) => {
      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, input.farmId, input.paddockId);
      }

      const data: Prisma.PestSpottingCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        paddock: input.paddockId ? { connect: { id: input.paddockId } } : undefined,
        pestType: input.pestType,
        severity: input.severity,
        locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
        spottedAt: input.spottedAt,
        notes: input.notes,
      };

      const spot = await tx.pestSpotting.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: spot.id,
        operation: "CREATE",
        payload: spot,
      });

      return spot;
    });
  }

  static async update(farmId: string, pestSpottingId: string, input: UpdatePestSpottingInput) {
    await this.get(farmId, pestSpottingId);

    if (typeof input.paddockId === "string") {
      await this.assertPaddockExists(prisma, farmId, input.paddockId);
    }

    return prisma.$transaction(async (tx) => {
      const spot = await tx.pestSpotting.update({
        where: { id: pestSpottingId },
        data: {
          paddockId: input.paddockId,
          pestType: input.pestType,
          severity: input.severity,
          locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
          spottedAt: input.spottedAt,
          notes: input.notes,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: spot.id,
        operation: "UPDATE",
        payload: spot,
      });

      return spot;
    });
  }

  static async remove(farmId: string, pestSpottingId: string) {
    await this.get(farmId, pestSpottingId);

    await prisma.$transaction(async (tx) => {
      await tx.pestSpotting.delete({ where: { id: pestSpottingId } });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: pestSpottingId,
      });
    });
  }

  private static async assertPaddockExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, paddockId: string) {
    const paddock = await db.paddock.findFirst({
      where: { id: paddockId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!paddock) {
      throw new ApiError(400, "Invalid paddock reference");
    }
  }
}
