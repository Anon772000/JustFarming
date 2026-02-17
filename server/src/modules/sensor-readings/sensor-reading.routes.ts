import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { SensorReadingController } from "./sensor-reading.controller";

export const sensorReadingRouter = Router();

sensorReadingRouter.get("/", asyncHandler(SensorReadingController.list));
sensorReadingRouter.get("/:sensorReadingId", asyncHandler(SensorReadingController.get));
