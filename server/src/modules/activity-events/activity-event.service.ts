import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateActivityEventInput, UpdateActivityEventInput } from "./activity-event.dto";

const ENTITY_TYPE = "activity_events";

function parseDate(value: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new ApiError(400, "Invalid datetime");
  }
  return d;
}

export type ActivityEventListOpts = {
  entityType?: string;
  entityId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  when?: "any" | "planned" | "actual";
  limit?: number;
  order?: "asc" | "desc";
};

export class ActivityEventService {
  static async list(farmId: string, opts?: ActivityEventListOpts) {
    const when = opts?.when ?? "any";
    const limit = Math.max(1, Math.min(1000, opts?.limit ?? 250));
    const order: "asc" | "desc" = opts?.order === "asc" ? "asc" : "desc";

    let range: { gte?: Date; lte?: Date } | null = null;
    if (typeof opts?.from === "string" || typeof opts?.to === "string") {
      range = {};
      if (typeof opts?.from === "string") range.gte = parseDate(opts.from);
      if (typeof opts?.to === "string") range.lte = parseDate(opts.to);
    }

    const where: Prisma.ActivityEventWhereInput = {
      farmId,
      ...(opts?.entityType ? { entityType: opts.entityType } : {}),
      ...(opts?.entityId ? { entityId: opts.entityId } : {}),
      ...(opts?.eventType ? { eventType: opts.eventType } : {}),
    };

    if (range) {
      if (when === "planned") {
        where.plannedAt = range;
      } else if (when === "actual") {
        where.actualAt = range;
      } else {
        where.OR = [{ plannedAt: range }, { actualAt: range }];
      }
    }

    const orderBy: Prisma.ActivityEventOrderByWithRelationInput[] =
      order === "asc"
        ? [{ actualAt: "asc" }, { plannedAt: "asc" }, { createdAt: "asc" }]
        : [{ actualAt: "desc" }, { plannedAt: "desc" }, { createdAt: "desc" }];

    return prisma.activityEvent.findMany({
      where,
      orderBy,
      take: limit,
    });
  }

  static async get(farmId: string, activityEventId: string) {
    const ev = await prisma.activityEvent.findFirst({
      where: { id: activityEventId, farmId },
    });

    if (!ev) {
      throw new ApiError(404, "Activity event not found");
    }

    return ev;
  }

  static async create(input: CreateActivityEventInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.ActivityEventCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        plannedAt: typeof input.plannedAt === "string" ? parseDate(input.plannedAt) : undefined,
        actualAt: typeof input.actualAt === "string" ? parseDate(input.actualAt) : undefined,
        payloadJson: input.payloadJson === undefined ? undefined : (input.payloadJson as any),
      };

      const ev = await tx.activityEvent.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: ev.id,
        operation: "CREATE",
        payload: ev,
      });

      return ev;
    });
  }

  static async update(farmId: string, activityEventId: string, input: UpdateActivityEventInput) {
    await this.get(farmId, activityEventId);

    return prisma.$transaction(async (tx) => {
      const ev = await tx.activityEvent.update({
        where: { id: activityEventId },
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          eventType: input.eventType,
          plannedAt:
            input.plannedAt === undefined
              ? undefined
              : input.plannedAt === null
                ? null
                : parseDate(input.plannedAt),
          actualAt:
            input.actualAt === undefined
              ? undefined
              : input.actualAt === null
                ? null
                : parseDate(input.actualAt),
          payloadJson: input.payloadJson === undefined ? undefined : input.payloadJson === null ? Prisma.DbNull : (input.payloadJson as any),
        },
      });

      if (!ev.plannedAt && !ev.actualAt) {
        throw new ApiError(400, "plannedAt or actualAt is required");
      }

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: ev.id,
        operation: "UPDATE",
        payload: ev,
      });

      return ev;
    });
  }

  static async remove(farmId: string, activityEventId: string) {
    await this.get(farmId, activityEventId);

    await prisma.$transaction(async (tx) => {
      await tx.activityEvent.delete({ where: { id: activityEventId } });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: activityEventId,
      });
    });
  }
}
