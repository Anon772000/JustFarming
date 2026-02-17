import { Prisma, type PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  // Prisma requires JSON-serializable payloads. Decimal and Date serialize via toJSON.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const syncWriter = {
  async recordChange(
    db: DbClient,
    args: {
      farmId: string;
      entityType: string;
      entityId: string;
      operation: "CREATE" | "UPDATE" | "UPSERT" | "DELETE";
      payload?: unknown;
    },
  ): Promise<void> {
    await db.syncChange.create({
      data: {
        farmId: args.farmId,
        entityType: args.entityType,
        entityId: args.entityId,
        operation: args.operation,
        payloadJson:
          args.payload === undefined
            ? undefined
            : args.payload === null
              ? Prisma.JsonNull
              : toJsonValue(args.payload),
      },
    });
  },

  async recordTombstone(
    db: DbClient,
    args: {
      farmId: string;
      entityType: string;
      entityId: string;
    },
  ): Promise<void> {
    await db.syncTombstone.create({
      data: {
        farmId: args.farmId,
        entityType: args.entityType,
        entityId: args.entityId,
      },
    });
  },
};
