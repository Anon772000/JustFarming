import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { CropSeasonController } from "./crop-season.controller";

export const cropSeasonRouter = Router();

cropSeasonRouter.get("/", asyncHandler(CropSeasonController.list));
cropSeasonRouter.get("/:cropSeasonId", asyncHandler(CropSeasonController.get));
cropSeasonRouter.post("/", asyncHandler(CropSeasonController.create));
cropSeasonRouter.patch("/:cropSeasonId", asyncHandler(CropSeasonController.update));
cropSeasonRouter.delete("/:cropSeasonId", asyncHandler(CropSeasonController.remove));
