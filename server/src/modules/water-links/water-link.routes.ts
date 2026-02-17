import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { WaterLinkController } from "./water-link.controller";

export const waterLinkRouter = Router();

waterLinkRouter.get("/", asyncHandler(WaterLinkController.list));
waterLinkRouter.get("/:waterLinkId", asyncHandler(WaterLinkController.get));
waterLinkRouter.post("/", asyncHandler(WaterLinkController.create));
waterLinkRouter.patch("/:waterLinkId", asyncHandler(WaterLinkController.update));
waterLinkRouter.delete("/:waterLinkId", asyncHandler(WaterLinkController.remove));
