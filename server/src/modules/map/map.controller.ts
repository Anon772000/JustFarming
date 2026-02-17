import { SensorType } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../../shared/db/prisma";

type AlertType = "LOW_WATER" | "LOW_FEED" | "LOW_BATTERY";

type AlertMeta = {
  alertType: AlertType;
  lowThreshold: number;
  waterAssetId?: string;
  feederId?: string;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function parseAlertMeta(sensorType: SensorType, metadataJson: unknown): AlertMeta | null {
  if (!metadataJson || typeof metadataJson !== "object") return null;
  const meta = metadataJson as any;

  const threshold = toFiniteNumber(meta.lowThreshold);
  if (threshold === null) return null;

  const rawAlertType = typeof meta.alertType === "string" ? meta.alertType.trim().toUpperCase() : "";

  let alertType: AlertType | null = null;

  if (rawAlertType === "LOW_WATER" || rawAlertType === "LOW_FEED" || rawAlertType === "LOW_BATTERY") {
    alertType = rawAlertType as AlertType;
  } else if (sensorType === SensorType.WATER_LEVEL) {
    alertType = "LOW_WATER";
  } else if (sensorType === SensorType.BATTERY) {
    alertType = "LOW_BATTERY";
  }

  if (!alertType) return null;

  const waterAssetId = typeof meta.waterAssetId === "string" ? meta.waterAssetId : undefined;
  const feederId = typeof meta.feederId === "string" ? meta.feederId : undefined;

  return { alertType, lowThreshold: threshold, waterAssetId, feederId };
}

export class MapController {
  static async summary(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;

    const [paddocks, mobs, waterAssets, loraNodes] = await Promise.all([
      prisma.paddock.findMany({ where: { farmId, deletedAt: null } }),
      prisma.mob.findMany({ where: { farmId, deletedAt: null } }),
      prisma.waterAsset.findMany({ where: { farmId, deletedAt: null } }),
      prisma.loraNode.findMany({ where: { farmId, deletedAt: null } }),
    ]);

    res.json({ paddocks, mobs, waterAssets, loraNodes });
  }

  static async waterNetwork(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;

    const [assets, links] = await Promise.all([
      prisma.waterAsset.findMany({ where: { farmId, deletedAt: null } }),
      prisma.waterLink.findMany({ where: { farmId, deletedAt: null } }),
    ]);

    res.json({ assets, links });
  }

  static async alerts(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;

    const sensors = await prisma.sensor.findMany({
      where: {
        deletedAt: null,
        node: {
          farmId,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        nodeId: true,
        key: true,
        type: true,
        unit: true,
        metadataJson: true,
        node: {
          select: {
            id: true,
            name: true,
            locationGeoJson: true,
          },
        },
      },
    });

    const configured = sensors
      .map((s) => {
        const meta = parseAlertMeta(s.type, s.metadataJson);
        return meta ? { sensor: s, meta } : null;
      })
      .filter((v): v is NonNullable<typeof v> => !!v);

    if (configured.length === 0) {
      res.json({ data: [] });
      return;
    }

    const sensorIds = configured.map((c) => c.sensor.id);

    const latestReadings = await prisma.sensorReading.findMany({
      where: {
        farmId,
        sensorId: { in: sensorIds },
      },
      orderBy: { observedAt: "desc" },
      distinct: ["sensorId"],
      select: {
        sensorId: true,
        observedAt: true,
        numericValue: true,
      },
    });

    const readingBySensorId = new Map(latestReadings.map((r) => [r.sensorId, r]));

    const waterAssetIds = Array.from(
      new Set(configured.map((c) => c.meta.waterAssetId).filter((v): v is string => typeof v === "string")),
    );

    const feederIds = Array.from(
      new Set(configured.map((c) => c.meta.feederId).filter((v): v is string => typeof v === "string")),
    );

    const [waterAssets, feeders] = await Promise.all([
      waterAssetIds.length
        ? prisma.waterAsset.findMany({
            where: { farmId, deletedAt: null, id: { in: waterAssetIds } },
            select: { id: true, name: true, locationGeoJson: true },
          })
        : Promise.resolve([]),
      feederIds.length
        ? prisma.feeder.findMany({
            where: { farmId, deletedAt: null, id: { in: feederIds } },
            select: { id: true, name: true, locationGeoJson: true, feederType: true },
          })
        : Promise.resolve([]),
    ]);

    const waterAssetById = new Map(waterAssets.map((a) => [a.id, a]));
    const feederById = new Map(feeders.map((f) => [f.id, f]));

    const alerts = [] as Array<Record<string, unknown>>;

    for (const { sensor, meta } of configured) {
      const reading = readingBySensorId.get(sensor.id);
      if (!reading) continue;

      const valueNum = Number(reading.numericValue);
      if (!Number.isFinite(valueNum)) continue;

      const isLow = valueNum <= meta.lowThreshold;
      if (!isLow) continue;

      const linkedWater = meta.waterAssetId ? waterAssetById.get(meta.waterAssetId) ?? null : null;
      const linkedFeeder = meta.feederId ? feederById.get(meta.feederId) ?? null : null;

      const locationGeoJson = linkedWater?.locationGeoJson ?? linkedFeeder?.locationGeoJson ?? sensor.node.locationGeoJson;
      if (!locationGeoJson) continue;

      const entityName = linkedWater?.name ?? linkedFeeder?.name ?? sensor.node.name;

      const title =
        meta.alertType === "LOW_WATER"
          ? `Low water: ${entityName}`
          : meta.alertType === "LOW_FEED"
            ? `Low feed: ${entityName}`
            : `Low battery: ${entityName}`;

      alerts.push({
        key: `sensor:${sensor.id}:${meta.alertType}`,
        alertType: meta.alertType,
        title,
        observedAt: reading.observedAt.toISOString(),
        value: reading.numericValue,
        threshold: meta.lowThreshold,
        unit: sensor.unit ?? null,
        nodeId: sensor.node.id,
        nodeName: sensor.node.name,
        sensorId: sensor.id,
        sensorKey: sensor.key,
        waterAssetId: linkedWater?.id ?? null,
        waterAssetName: linkedWater?.name ?? null,
        feederId: linkedFeeder?.id ?? null,
        feederName: linkedFeeder?.name ?? null,
        locationGeoJson,
      });
    }

    res.json({ data: alerts });
  }
}
