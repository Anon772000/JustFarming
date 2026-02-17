import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { PestSpottingController } from "./pest-spotting.controller";

export const pestSpottingRouter = Router();

pestSpottingRouter.get("/", asyncHandler(PestSpottingController.list));
pestSpottingRouter.get("/:pestSpottingId", asyncHandler(PestSpottingController.get));
pestSpottingRouter.post("/", asyncHandler(PestSpottingController.create));
pestSpottingRouter.patch("/:pestSpottingId", asyncHandler(PestSpottingController.update));
pestSpottingRouter.delete("/:pestSpottingId", asyncHandler(PestSpottingController.remove));
