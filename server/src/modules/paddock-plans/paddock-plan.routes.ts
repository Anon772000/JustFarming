import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { PaddockPlanController } from "./paddock-plan.controller";

export const paddockPlanRouter = Router();

paddockPlanRouter.get("/", asyncHandler(PaddockPlanController.list));
paddockPlanRouter.get("/:paddockPlanId", asyncHandler(PaddockPlanController.get));
paddockPlanRouter.post("/", asyncHandler(PaddockPlanController.create));
paddockPlanRouter.patch("/:paddockPlanId", asyncHandler(PaddockPlanController.update));
paddockPlanRouter.delete("/:paddockPlanId", asyncHandler(PaddockPlanController.remove));
