import { SensorType } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";

const ingestSchema = z.object({
  devEui: z.string().min(6),
  ts: z.string().datetime(),
  sensors: z.array(
    z.object({
      key: z.string().min(1),
      type: z.string().min(1),
      value: z.number(),
      unit: z.string().optional(),
    }),
  ),
});

function toSensorType(type: string): SensorType {
  const normalized = type.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (SensorType as Record<string, SensorType>)[normalized] ?? SensorType.CUSTOM;
}

function unitOrNull(unit: string | undefined): string | null {
  const trimmed = unit?.trim();
  return trimmed ? trimmed : null;
}

export class LoraController {
  static async ingest(req: Request, res: Response): Promise<void> {
    if (env.LORA_INGEST_KEY) {
      const provided = req.header("x-ingest-key");
      if (!provided || provided !== env.LORA_INGEST_KEY) {
        throw new ApiError(401, "Invalid ingest key");
      }
    }

    const payload = ingestSchema.parse(req.body);

    const node = await prisma.loraNode.findFirst({
      where: {
        deletedAt: null,
        devEui: { equals: payload.devEui, mode: "insensitive" },
      },
    });

    if (!node) {
      throw new ApiError(404, "LoRa node not found");
    }

    const observedAt = new Date(payload.ts);

    await prisma.$transaction(async (tx) => {
      for (const sensorPayload of payload.sensors) {
        const sensorType = toSensorType(sensorPayload.type);
        const unit = unitOrNull(sensorPayload.unit);

        const existing = await tx.sensor.findUnique({
          where: {
            nodeId_key: {
              nodeId: node.id,
              key: sensorPayload.key,
            },
          },
        });

        let sensor = existing;

        if (!existing) {
          sensor = await tx.sensor.create({
            data: {
              node: { connect: { id: node.id } },
              key: sensorPayload.key,
              type: sensorType,
              unit: unit ?? undefined,
            },
          });

          await syncWriter.recordChange(tx, {
            farmId: node.farmId,
            entityType: "sensors",
            entityId: sensor.id,
            operation: "CREATE",
            payload: sensor,
          });
        } else {
          const existingUnit = existing.unit ?? null;
          const needsUpdate =
            existing.deletedAt !== null || existing.type !== sensorType || existingUnit !== unit;

          if (needsUpdate) {
            sensor = await tx.sensor.update({
              where: { id: existing.id },
              data: {
                type: sensorType,
                unit: unit ?? undefined,
                deletedAt: null,
              },
            });

            await syncWriter.recordChange(tx, {
              farmId: node.farmId,
              entityType: "sensors",
              entityId: sensor.id,
              operation: "UPDATE",
              payload: sensor,
            });
          }
        }

        await tx.sensorReading.create({
          data: {
            farm: { connect: { id: node.farmId } },
            node: { connect: { id: node.id } },
            sensor: { connect: { id: sensor!.id } },
            observedAt,
            numericValue: sensorPayload.value,
            rawPayloadJson: {
              devEui: payload.devEui,
              ts: payload.ts,
              sensor: sensorPayload,
            },
          },
        });
      }
    });

    res.status(202).json({ accepted: true, received: payload.sensors.length });
  }
}
