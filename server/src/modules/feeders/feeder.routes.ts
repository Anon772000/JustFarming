import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { FeederController } from "./feeder.controller";

export const feederRouter = Router();

feederRouter.get("/", asyncHandler(FeederController.list));
feederRouter.get("/:feederId", asyncHandler(FeederController.get));
feederRouter.post("/", asyncHandler(FeederController.create));
feederRouter.patch("/:feederId", asyncHandler(FeederController.update));
feederRouter.delete("/:feederId", asyncHandler(FeederController.remove));
