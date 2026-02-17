import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { GrainLotController } from "./grain-lot.controller";

export const grainLotRouter = Router();

grainLotRouter.get("/", asyncHandler(GrainLotController.list));
grainLotRouter.get("/:grainLotId", asyncHandler(GrainLotController.get));
grainLotRouter.post("/", asyncHandler(GrainLotController.create));
grainLotRouter.patch("/:grainLotId", asyncHandler(GrainLotController.update));
grainLotRouter.delete("/:grainLotId", asyncHandler(GrainLotController.remove));
