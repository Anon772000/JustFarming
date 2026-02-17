import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { createCropSeasonSchema, updateCropSeasonSchema } from "../crop-seasons/crop-season.dto";
import { CropSeasonService } from "../crop-seasons/crop-season.service";
import { createPaddockPlanSchema, updatePaddockPlanSchema } from "../paddock-plans/paddock-plan.dto";
import { PaddockPlanService } from "../paddock-plans/paddock-plan.service";
import { createProductionPlanSchema, updateProductionPlanSchema } from "../production-plans/production-plan.dto";
import { ProductionPlanService } from "../production-plans/production-plan.service";
import { createIssueSchema, updateIssueSchema } from "../issues/issue.dto";
import { IssueService } from "../issues/issue.service";
import { createMobMovementPlanSchema, updateMobMovementPlanSchema } from "../mob-movement-plans/mob-movement-plan.dto";
import { MobMovementPlanService } from "../mob-movement-plans/mob-movement-plan.service";
import { createMobSchema, updateMobSchema } from "../mobs/mob.dto";
import { MobService } from "../mobs/mob.service";
import { createMobPaddockAllocationSchema, updateMobPaddockAllocationSchema } from "../mob-paddock-allocations/mob-paddock-allocation.dto";
import { MobPaddockAllocationService } from "../mob-paddock-allocations/mob-paddock-allocation.service";
import { createPaddockSchema, updatePaddockSchema } from "../paddocks/paddock.dto";
import { PaddockService } from "../paddocks/paddock.service";
import { createTaskSchema, updateTaskSchema } from "../tasks/task.dto";
import { TaskService } from "../tasks/task.service";
import { createWaterAssetSchema, updateWaterAssetSchema } from "../water-assets/water-asset.dto";
import { WaterAssetService } from "../water-assets/water-asset.service";
import { createWaterLinkSchema, updateWaterLinkSchema } from "../water-links/water-link.dto";
import { WaterLinkService } from "../water-links/water-link.service";
import { createFeederSchema, updateFeederSchema } from "../feeders/feeder.dto";
import { FeederService } from "../feeders/feeder.service";
import { createHayLotSchema, updateHayLotSchema } from "../hay-lots/hay-lot.dto";
import { HayLotService } from "../hay-lots/hay-lot.service";
import { createGrainLotSchema, updateGrainLotSchema } from "../grain-lots/grain-lot.dto";
import { GrainLotService } from "../grain-lots/grain-lot.service";
import { createFeedEventSchema, updateFeedEventSchema } from "../feed-events/feed-event.dto";
import { FeedEventService } from "../feed-events/feed-event.service";
import { createContractorSchema, updateContractorSchema } from "../contractors/contractor.dto";
import { ContractorService } from "../contractors/contractor.service";
import { createPestSpottingSchema, updatePestSpottingSchema } from "../pest-spottings/pest-spotting.dto";
import { PestSpottingService } from "../pest-spottings/pest-spotting.service";
import { createActivityEventSchema, updateActivityEventSchema } from "../activity-events/activity-event.dto";
import { ActivityEventService } from "../activity-events/activity-event.service";

const sinceQuerySchema = z.object({
  since: z.string().datetime(),
});

const syncBatchSchema = z.object({
  actions: z.array(
    z.object({
      clientId: z.string().min(1),
      ts: z.string().datetime(),
      entity: z.string().min(1),
      op: z.enum(["CREATE", "UPDATE", "DELETE"]),
      data: z.record(z.any()),
    }),
  ),
});

type SyncAction = z.infer<typeof syncBatchSchema>["actions"][number];

const uuidSchema = z.string().uuid();

function normalizeEntity(raw: string): string {
  return raw.trim().toLowerCase().replaceAll("-", "_");
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof z.ZodError) return err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

async function applyAction(
  farmId: string,
  userId: string,
  action: SyncAction,
): Promise<{ entity: string; op: SyncAction["op"]; entityId: string }> {
  const entity = normalizeEntity(action.entity);

  if (action.op === "CREATE") {
    const id = action.data.id;
    if (typeof id !== "string" || !uuidSchema.safeParse(id).success) {
      throw new ApiError(400, "CREATE actions must include a stable UUID id");
    }
  }

  const entityId = uuidSchema.parse(action.data.id);

  switch (entity) {
    case "paddocks": {
      if (action.op === "CREATE") {
        const payload = createPaddockSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE paddocks");

        const existing = await prisma.paddock.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await PaddockService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updatePaddockSchema.parse(action.data);
        const updated = await PaddockService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.paddock.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await PaddockService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "mobs": {
      if (action.op === "CREATE") {
        const payload = createMobSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE mobs");

        const existing = await prisma.mob.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await MobService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateMobSchema.parse(action.data);
        const updated = await MobService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.mob.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await MobService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }


    case "mob_paddock_allocations": {
      if (action.op === "CREATE") {
        const payload = createMobPaddockAllocationSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE mob_paddock_allocations");

        const existing = await prisma.mobPaddockAllocation.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await MobPaddockAllocationService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateMobPaddockAllocationSchema.parse(action.data);
        const updated = await MobPaddockAllocationService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.mobPaddockAllocation.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await MobPaddockAllocationService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }



    case "feeders": {
      if (action.op === "CREATE") {
        const payload = createFeederSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE feeders");

        const existing = await prisma.feeder.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await FeederService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateFeederSchema.parse(action.data);
        const updated = await FeederService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.feeder.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await FeederService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "hay_lots": {
      if (action.op === "CREATE") {
        const payload = createHayLotSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE hay_lots");

        const existing = await prisma.hayLot.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await HayLotService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateHayLotSchema.parse(action.data);
        const updated = await HayLotService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.hayLot.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await HayLotService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "grain_lots": {
      if (action.op === "CREATE") {
        const payload = createGrainLotSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE grain_lots");

        const existing = await prisma.grainLot.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await GrainLotService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateGrainLotSchema.parse(action.data);
        const updated = await GrainLotService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.grainLot.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await GrainLotService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "feed_events": {
      if (action.op === "CREATE") {
        const payload = createFeedEventSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE feed_events");

        const existing = await prisma.feedEvent.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await FeedEventService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateFeedEventSchema.parse(action.data);
        const updated = await FeedEventService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.feedEvent.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await FeedEventService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }


    case "contractors": {
      if (action.op === "CREATE") {
        const payload = createContractorSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE contractors");

        const existing = await prisma.contractor.findFirst({ where: { id: payload.id, farmId } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await ContractorService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateContractorSchema.parse(action.data);
        const updated = await ContractorService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.contractor.findFirst({ where: { id: entityId, farmId } });
      if (!existing) return { entity, op: action.op, entityId };

      await ContractorService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "pest_spottings": {
      if (action.op === "CREATE") {
        const payload = createPestSpottingSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE pest_spottings");

        const existing = await prisma.pestSpotting.findFirst({ where: { id: payload.id, farmId } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await PestSpottingService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updatePestSpottingSchema.parse(action.data);
        const updated = await PestSpottingService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.pestSpotting.findFirst({ where: { id: entityId, farmId } });
      if (!existing) return { entity, op: action.op, entityId };

      await PestSpottingService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }


    case "activity_events": {
      if (action.op === "CREATE") {
        const payload = createActivityEventSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE activity_events");

        const existing = await prisma.activityEvent.findFirst({ where: { id: payload.id, farmId } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await ActivityEventService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateActivityEventSchema.parse(action.data);
        const updated = await ActivityEventService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.activityEvent.findFirst({ where: { id: entityId, farmId } });
      if (!existing) return { entity, op: action.op, entityId };

      await ActivityEventService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "water_assets": {
      if (action.op === "CREATE") {
        const payload = createWaterAssetSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE water_assets");

        const existing = await prisma.waterAsset.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await WaterAssetService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateWaterAssetSchema.parse(action.data);
        const updated = await WaterAssetService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.waterAsset.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await WaterAssetService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "water_links": {
      if (action.op === "CREATE") {
        const payload = createWaterLinkSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE water_links");

        const existing = await prisma.waterLink.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await WaterLinkService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateWaterLinkSchema.parse(action.data);
        const updated = await WaterLinkService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.waterLink.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await WaterLinkService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "mob_movement_plans": {
      if (action.op === "CREATE") {
        const payload = createMobMovementPlanSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE mob_movement_plans");

        const existing = await prisma.mobMovementPlan.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await MobMovementPlanService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateMobMovementPlanSchema.parse(action.data);
        const updated = await MobMovementPlanService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.mobMovementPlan.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await MobMovementPlanService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "issues": {
      if (action.op === "CREATE") {
        const payload = createIssueSchema.parse({ ...action.data, farmId, createdById: userId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE issues");

        const existing = await prisma.issue.findFirst({ where: { id: payload.id, farmId } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await IssueService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateIssueSchema.parse(action.data);
        const updated = await IssueService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.issue.findFirst({ where: { id: entityId, farmId } });
      if (!existing) return { entity, op: action.op, entityId };

      await IssueService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "tasks": {
      if (action.op === "CREATE") {
        const payload = createTaskSchema.parse({ ...action.data, farmId, createdById: userId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE tasks");

        const existing = await prisma.task.findFirst({ where: { id: payload.id, farmId } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await TaskService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateTaskSchema.parse(action.data);
        const updated = await TaskService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.task.findFirst({ where: { id: entityId, farmId } });
      if (!existing) return { entity, op: action.op, entityId };

      await TaskService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }


    case "crop_seasons": {
      if (action.op === "CREATE") {
        const payload = createCropSeasonSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE crop_seasons");

        const existing = await prisma.cropSeason.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await CropSeasonService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateCropSeasonSchema.parse(action.data);
        const updated = await CropSeasonService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.cropSeason.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await CropSeasonService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "paddock_plans": {
      if (action.op === "CREATE") {
        const payload = createPaddockPlanSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE paddock_plans");

        const existing = await prisma.paddockPlan.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await PaddockPlanService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updatePaddockPlanSchema.parse(action.data);
        const updated = await PaddockPlanService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.paddockPlan.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await PaddockPlanService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }

    case "production_plans": {
      if (action.op === "CREATE") {
        const payload = createProductionPlanSchema.parse({ ...action.data, farmId });
        if (!payload.id) throw new ApiError(400, "Missing id for CREATE production_plans");

        const existing = await prisma.productionPlan.findFirst({ where: { id: payload.id, farmId, deletedAt: null } });
        if (existing) return { entity, op: action.op, entityId: existing.id };

        const created = await ProductionPlanService.create(payload);
        return { entity, op: action.op, entityId: created.id };
      }

      if (action.op === "UPDATE") {
        const input = updateProductionPlanSchema.parse(action.data);
        const updated = await ProductionPlanService.update(farmId, entityId, input);
        return { entity, op: action.op, entityId: updated.id };
      }

      const existing = await prisma.productionPlan.findFirst({ where: { id: entityId, farmId, deletedAt: null } });
      if (!existing) return { entity, op: action.op, entityId };

      await ProductionPlanService.remove(farmId, entityId);
      return { entity, op: action.op, entityId };
    }
    default:
      throw new ApiError(400, `Unsupported entity: ${action.entity}`);
  }
}

export class SyncController {
  static async changes(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { since } = sinceQuerySchema.parse(req.query);
    const sinceDate = new Date(since);

    const [syncChanges, tombstones] = await Promise.all([
      prisma.syncChange.findMany({
        where: { farmId, changedAt: { gt: sinceDate } },
        orderBy: { changedAt: "asc" },
      }),
      prisma.syncTombstone.findMany({
        where: { farmId, deletedAt: { gt: sinceDate } },
        orderBy: { deletedAt: "asc" },
      }),
    ]);

    res.json({
      serverTime: new Date().toISOString(),
      changes: syncChanges,
      tombstones,
    });
  }

  static async batch(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const userId = req.auth!.sub;
    const payload = syncBatchSchema.parse(req.body);

    const applied: Array<{ clientId: string; status: "applied"; entity: string; op: string; entityId: string }> = [];
    const conflicts: Array<{ clientId: string; reason: string }> = [];

    for (const action of payload.actions) {
      try {
        const result = await applyAction(farmId, userId, action);
        applied.push({
          clientId: action.clientId,
          status: "applied",
          entity: result.entity,
          op: result.op,
          entityId: result.entityId,
        });
      } catch (err) {
        conflicts.push({ clientId: action.clientId, reason: describeError(err) });
      }
    }

    res.status(202).json({ applied, conflicts });
  }
}
