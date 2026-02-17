import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { WaterAssetController } from "./water-asset.controller";

export const waterAssetRouter = Router();

waterAssetRouter.get("/", asyncHandler(WaterAssetController.list));
waterAssetRouter.get("/:waterAssetId", asyncHandler(WaterAssetController.get));
waterAssetRouter.post("/", asyncHandler(WaterAssetController.create));
waterAssetRouter.patch("/:waterAssetId", asyncHandler(WaterAssetController.update));
waterAssetRouter.delete("/:waterAssetId", asyncHandler(WaterAssetController.remove));
