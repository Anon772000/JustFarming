import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import type { SensorReadingListQuery } from "./sensor-reading.dto";

export class SensorReadingService {
  static async list(farmId: string, query: SensorReadingListQuery) {
    const where: Record<string, unknown> = {
      farmId,
      ...(query.nodeId ? { nodeId: query.nodeId } : {}),
      ...(query.sensorId ? { sensorId: query.sensorId } : {}),
    };

    if (query.from || query.to) {
      where.observedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    return prisma.sensorReading.findMany({
      where: where as any,
      orderBy: { observedAt: (query.order ?? "desc") as any },
      take: query.limit ?? 200,
    });
  }

  static async get(farmId: string, sensorReadingId: string) {
    const reading = await prisma.sensorReading.findFirst({
      where: { id: sensorReadingId, farmId },
    });

    if (!reading) {
      throw new ApiError(404, "Sensor reading not found");
    }

    return reading;
  }
}
