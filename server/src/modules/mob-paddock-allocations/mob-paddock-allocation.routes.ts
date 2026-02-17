import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { MobPaddockAllocationController } from "./mob-paddock-allocation.controller";

export const mobPaddockAllocationRouter = Router();

mobPaddockAllocationRouter.get("/", asyncHandler(MobPaddockAllocationController.list));
mobPaddockAllocationRouter.get("/:allocationId", asyncHandler(MobPaddockAllocationController.get));
mobPaddockAllocationRouter.post("/", asyncHandler(MobPaddockAllocationController.create));
mobPaddockAllocationRouter.patch("/:allocationId", asyncHandler(MobPaddockAllocationController.update));
mobPaddockAllocationRouter.delete("/:allocationId", asyncHandler(MobPaddockAllocationController.remove));
