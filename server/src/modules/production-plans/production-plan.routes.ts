import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { ProductionPlanController } from "./production-plan.controller";

export const productionPlanRouter = Router();

productionPlanRouter.get("/", asyncHandler(ProductionPlanController.list));
productionPlanRouter.get("/:productionPlanId", asyncHandler(ProductionPlanController.get));
productionPlanRouter.post("/", asyncHandler(ProductionPlanController.create));
productionPlanRouter.patch("/:productionPlanId", asyncHandler(ProductionPlanController.update));
productionPlanRouter.delete("/:productionPlanId", asyncHandler(ProductionPlanController.remove));
