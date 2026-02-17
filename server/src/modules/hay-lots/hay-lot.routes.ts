import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { HayLotController } from "./hay-lot.controller";

export const hayLotRouter = Router();

hayLotRouter.get("/", asyncHandler(HayLotController.list));
hayLotRouter.get("/:hayLotId", asyncHandler(HayLotController.get));
hayLotRouter.post("/", asyncHandler(HayLotController.create));
hayLotRouter.patch("/:hayLotId", asyncHandler(HayLotController.update));
hayLotRouter.delete("/:hayLotId", asyncHandler(HayLotController.remove));
