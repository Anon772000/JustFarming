import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { SensorController } from "./sensor.controller";

export const sensorRouter = Router();

sensorRouter.get("/", asyncHandler(SensorController.list));
sensorRouter.get("/:sensorId", asyncHandler(SensorController.get));
sensorRouter.post("/", asyncHandler(SensorController.create));
sensorRouter.patch("/:sensorId", asyncHandler(SensorController.update));
sensorRouter.delete("/:sensorId", asyncHandler(SensorController.remove));
