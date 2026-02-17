import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateFeedEventInput, UpdateFeedEventInput } from "./feed-event.dto";

const ENTITY_TYPE = "feed_events";

export class FeedEventService {
  static async list(
    farmId: string,
    opts?: { mobId?: string; paddockId?: string; feederId?: string; hayLotId?: string; grainLotId?: string },
  ) {
    return prisma.feedEvent.findMany({
      where: {
        farmId,
        deletedAt: null,
        ...(opts?.mobId ? { mobId: opts.mobId } : {}),
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
        ...(opts?.feederId ? { feederId: opts.feederId } : {}),
        ...(opts?.hayLotId ? { hayLotId: opts.hayLotId } : {}),
        ...(opts?.grainLotId ? { grainLotId: opts.grainLotId } : {}),
      },
      orderBy: { occurredAt: "desc" },
    });
  }

  static async get(farmId: string, feedEventId: string) {
    const evt = await prisma.feedEvent.findFirst({
      where: { id: feedEventId, farmId, deletedAt: null },
    });

    if (!evt) {
      throw new ApiError(404, "Feed event not found");
    }

    return evt;
  }

  static async create(input: CreateFeedEventInput) {
    return prisma.$transaction(async (tx) => {
      if (typeof input.mobId === "string") {
        await this.assertMobExists(tx, input.farmId, input.mobId);
      }

      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, input.farmId, input.paddockId);
      }

      if (typeof input.feederId === "string") {
        await this.assertFeederExists(tx, input.farmId, input.feederId);
      }

      if (typeof input.hayLotId === "string") {
        await this.assertHayLotExists(tx, input.farmId, input.hayLotId);
      }

      if (typeof input.grainLotId === "string") {
        await this.assertGrainLotExists(tx, input.farmId, input.grainLotId);
      }

      const data: Prisma.FeedEventCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        occurredAt: input.occurredAt,
        quantityKg: input.quantityKg,
        mob: input.mobId ? { connect: { id: input.mobId } } : undefined,
        paddock: input.paddockId ? { connect: { id: input.paddockId } } : undefined,
        feeder: input.feederId ? { connect: { id: input.feederId } } : undefined,
        hayLot: input.hayLotId ? { connect: { id: input.hayLotId } } : undefined,
        grainLot: input.grainLotId ? { connect: { id: input.grainLotId } } : undefined,
        notes: input.notes,
      };

      const evt = await tx.feedEvent.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: evt.id,
        operation: "CREATE",
        payload: evt,
      });

      return evt;
    });
  }

  static async update(farmId: string, feedEventId: string, input: UpdateFeedEventInput) {
    await this.get(farmId, feedEventId);

    if (typeof input.mobId === "string") {
      await this.assertMobExists(prisma, farmId, input.mobId);
    }

    if (typeof input.paddockId === "string") {
      await this.assertPaddockExists(prisma, farmId, input.paddockId);
    }

    if (typeof input.feederId === "string") {
      await this.assertFeederExists(prisma, farmId, input.feederId);
    }

    if (typeof input.hayLotId === "string") {
      await this.assertHayLotExists(prisma, farmId, input.hayLotId);
    }

    if (typeof input.grainLotId === "string") {
      await this.assertGrainLotExists(prisma, farmId, input.grainLotId);
    }

    return prisma.$transaction(async (tx) => {
      const evt = await tx.feedEvent.update({
        where: { id: feedEventId },
        data: {
          occurredAt: input.occurredAt,
          quantityKg: input.quantityKg,
          mobId: input.mobId,
          paddockId: input.paddockId,
          feederId: input.feederId,
          hayLotId: input.hayLotId,
          grainLotId: input.grainLotId,
          notes: input.notes,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: evt.id,
        operation: "UPDATE",
        payload: evt,
      });

      return evt;
    });
  }

  static async remove(farmId: string, feedEventId: string) {
    await this.get(farmId, feedEventId);

    await prisma.$transaction(async (tx) => {
      await tx.feedEvent.update({
        where: { id: feedEventId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: feedEventId,
      });
    });
  }

  private static async assertMobExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, mobId: string) {
    const mob = await db.mob.findFirst({
      where: { id: mobId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!mob) {
      throw new ApiError(400, "Invalid mob reference");
    }
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

  private static async assertFeederExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, feederId: string) {
    const feeder = await db.feeder.findFirst({
      where: { id: feederId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!feeder) {
      throw new ApiError(400, "Invalid feeder reference");
    }
  }

  private static async assertHayLotExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, hayLotId: string) {
    const lot = await db.hayLot.findFirst({
      where: { id: hayLotId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!lot) {
      throw new ApiError(400, "Invalid hay lot reference");
    }
  }

  private static async assertGrainLotExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, grainLotId: string) {
    const lot = await db.grainLot.findFirst({
      where: { id: grainLotId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!lot) {
      throw new ApiError(400, "Invalid grain lot reference");
    }
  }
}
