import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateLoraNodeInput, UpdateLoraNodeInput } from "./lora-node.dto";

const ENTITY_TYPE = "lora_nodes";

function normalizeDevEui(devEui: string): string {
  return devEui.trim().toLowerCase();
}

export class LoraNodeService {
  static async list(farmId: string) {
    return prisma.loraNode.findMany({
      where: { farmId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, loraNodeId: string) {
    const node = await prisma.loraNode.findFirst({
      where: { id: loraNodeId, farmId, deletedAt: null },
    });

    if (!node) {
      throw new ApiError(404, "LoRa node not found");
    }

    return node;
  }

  static async create(input: CreateLoraNodeInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.LoraNodeCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        name: input.name,
        devEui: normalizeDevEui(input.devEui),
        locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
        installedAt: input.installedAt ? new Date(input.installedAt) : undefined,
      };

      const node = await tx.loraNode.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: node.id,
        operation: "CREATE",
        payload: node,
      });

      return node;
    });
  }

  static async update(farmId: string, loraNodeId: string, input: UpdateLoraNodeInput) {
    await this.get(farmId, loraNodeId);

    return prisma.$transaction(async (tx) => {
      const node = await tx.loraNode.update({
        where: { id: loraNodeId },
        data: {
          name: input.name,
          devEui: input.devEui ? normalizeDevEui(input.devEui) : undefined,
          locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
          installedAt: input.installedAt ? new Date(input.installedAt) : undefined,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: node.id,
        operation: "UPDATE",
        payload: node,
      });

      return node;
    });
  }

  static async remove(farmId: string, loraNodeId: string) {
    await this.get(farmId, loraNodeId);

    await prisma.$transaction(async (tx) => {
      await tx.loraNode.update({
        where: { id: loraNodeId },
        data: { deletedAt: new Date() },
      });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: loraNodeId,
      });
    });
  }
}
