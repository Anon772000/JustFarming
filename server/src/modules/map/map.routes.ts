import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { MapController } from "./map.controller";

export const mapRouter = Router();

mapRouter.get("/summary", asyncHandler(MapController.summary));
mapRouter.get("/water-network", asyncHandler(MapController.waterNetwork));
mapRouter.get("/alerts", asyncHandler(MapController.alerts));
