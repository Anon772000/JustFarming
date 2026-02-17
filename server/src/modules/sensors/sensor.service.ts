import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateSensorInput, UpdateSensorInput } from "./sensor.dto";

const ENTITY_TYPE = "sensors";

export class SensorService {
  static async list(farmId: string, args?: { nodeId?: string }) {
    return prisma.sensor.findMany({
      where: {
        deletedAt: null,
        ...(args?.nodeId ? { nodeId: args.nodeId } : {}),
        node: {
          farmId,
          deletedAt: null,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, sensorId: string) {
    const sensor = await prisma.sensor.findFirst({
      where: {
        id: sensorId,
        deletedAt: null,
        node: { farmId, deletedAt: null },
      },
    });

    if (!sensor) {
      throw new ApiError(404, "Sensor not found");
    }

    return sensor;
  }

  static async create(input: CreateSensorInput) {
    return prisma.$transaction(async (tx) => {
      const node = await tx.loraNode.findFirst({
        where: { id: input.nodeId, farmId: input.farmId, deletedAt: null },
        select: { id: true },
      });

      if (!node) {
        throw new ApiError(400, "Invalid lora node reference");
      }

      try {
        const sensor = await tx.sensor.create({
          data: {
            id: input.id,
            node: { connect: { id: input.nodeId } },
            key: input.key,
            type: input.type,
            unit: input.unit,
            metadataJson: input.metadataJson === undefined ? undefined : (input.metadataJson as any),
          },
        });

        await syncWriter.recordChange(tx, {
          farmId: input.farmId,
          entityType: ENTITY_TYPE,
          entityId: sensor.id,
          operation: "CREATE",
          payload: sensor,
        });

        return sensor;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ApiError(409, "Sensor key already exists for this node");
        }
        throw err;
      }
    });
  }

  static async update(farmId: string, sensorId: string, input: UpdateSensorInput) {
    await this.get(farmId, sensorId);

    return prisma.$transaction(async (tx) => {
      const sensor = await tx.sensor.update({
        where: { id: sensorId },
        data: {
          type: input.type,
          unit: input.unit,
          metadataJson: input.metadataJson === undefined ? undefined : (input.metadataJson as any),
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: sensor.id,
        operation: "UPDATE",
        payload: sensor,
      });

      return sensor;
    });
  }

  static async remove(farmId: string, sensorId: string) {
    await this.get(farmId, sensorId);

    await prisma.$transaction(async (tx) => {
      await tx.sensor.update({
        where: { id: sensorId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: sensorId,
      });
    });
  }
}
