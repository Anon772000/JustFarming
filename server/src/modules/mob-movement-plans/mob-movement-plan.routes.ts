import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { MobMovementPlanController } from "./mob-movement-plan.controller";

export const mobMovementPlanRouter = Router();

mobMovementPlanRouter.get("/", asyncHandler(MobMovementPlanController.list));
mobMovementPlanRouter.get("/:mobMovementPlanId", asyncHandler(MobMovementPlanController.get));
mobMovementPlanRouter.post("/", asyncHandler(MobMovementPlanController.create));
mobMovementPlanRouter.patch("/:mobMovementPlanId", asyncHandler(MobMovementPlanController.update));
mobMovementPlanRouter.delete("/:mobMovementPlanId", asyncHandler(MobMovementPlanController.remove));
