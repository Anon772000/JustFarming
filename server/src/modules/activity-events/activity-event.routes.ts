import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { ActivityEventController } from "./activity-event.controller";

export const activityEventRouter = Router();

activityEventRouter.get("/", asyncHandler(ActivityEventController.list));
activityEventRouter.get("/:activityEventId", asyncHandler(ActivityEventController.get));
activityEventRouter.post("/", asyncHandler(ActivityEventController.create));
activityEventRouter.patch("/:activityEventId", asyncHandler(ActivityEventController.update));
activityEventRouter.delete("/:activityEventId", asyncHandler(ActivityEventController.remove));
