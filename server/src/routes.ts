import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/users/user.routes";
import { loraRouter } from "./modules/lora/lora.routes";
import { loraNodeRouter } from "./modules/lora-nodes/lora-node.routes";
import { mapRouter } from "./modules/map/map.routes";
import { mobRouter } from "./modules/mobs/mob.routes";
import { mobMovementPlanRouter } from "./modules/mob-movement-plans/mob-movement-plan.routes";
import { mobPaddockAllocationRouter } from "./modules/mob-paddock-allocations/mob-paddock-allocation.routes";
import { paddockRouter } from "./modules/paddocks/paddock.routes";
import { cropSeasonRouter } from "./modules/crop-seasons/crop-season.routes";
import { paddockPlanRouter } from "./modules/paddock-plans/paddock-plan.routes";
import { productionPlanRouter } from "./modules/production-plans/production-plan.routes";
import { issueRouter } from "./modules/issues/issue.routes";
import { taskRouter } from "./modules/tasks/task.routes";
import { waterAssetRouter } from "./modules/water-assets/water-asset.routes";
import { waterLinkRouter } from "./modules/water-links/water-link.routes";
import { sensorRouter } from "./modules/sensors/sensor.routes";
import { sensorReadingRouter } from "./modules/sensor-readings/sensor-reading.routes";
import { feederRouter } from "./modules/feeders/feeder.routes";
import { hayLotRouter } from "./modules/hay-lots/hay-lot.routes";
import { grainLotRouter } from "./modules/grain-lots/grain-lot.routes";
import { feedEventRouter } from "./modules/feed-events/feed-event.routes";
import { contractorRouter } from "./modules/contractors/contractor.routes";
import { pestSpottingRouter } from "./modules/pest-spottings/pest-spotting.routes";
import { attachmentRouter } from "./modules/attachments/attachment.routes";
import { activityEventRouter } from "./modules/activity-events/activity-event.routes";
import { syncRouter } from "./modules/sync/sync.routes";
import { requireAuth } from "./shared/auth/auth.middleware";
import { auditMutatingUserAction } from "./shared/audit/user-action.middleware";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "croxton-east-api" });
});

apiRouter.use("/auth", authRouter);

const mountProtected = (path: string, router: Router): void => {
  apiRouter.use(path, requireAuth, auditMutatingUserAction, router);
};

mountProtected("/users", userRouter);
mountProtected("/mobs", mobRouter);
mountProtected("/mob-paddock-allocations", mobPaddockAllocationRouter);
mountProtected("/mob-movement-plans", mobMovementPlanRouter);
mountProtected("/paddocks", paddockRouter);
mountProtected("/crop-seasons", cropSeasonRouter);
mountProtected("/paddock-plans", paddockPlanRouter);
mountProtected("/production-plans", productionPlanRouter);
mountProtected("/issues", issueRouter);
mountProtected("/tasks", taskRouter);
mountProtected("/feeders", feederRouter);
mountProtected("/hay-lots", hayLotRouter);
mountProtected("/grain-lots", grainLotRouter);
mountProtected("/feed-events", feedEventRouter);
mountProtected("/contractors", contractorRouter);
mountProtected("/pest-spottings", pestSpottingRouter);
mountProtected("/attachments", attachmentRouter);
mountProtected("/activity-events", activityEventRouter);
mountProtected("/lora-nodes", loraNodeRouter);
mountProtected("/sensors", sensorRouter);
mountProtected("/sensor-readings", sensorReadingRouter);
mountProtected("/water-assets", waterAssetRouter);
mountProtected("/water-links", waterLinkRouter);
mountProtected("/sync", syncRouter);
mountProtected("/map", mapRouter);
apiRouter.use("/lora", loraRouter);
