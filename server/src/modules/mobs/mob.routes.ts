import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { MobController } from "./mob.controller";

export const mobRouter = Router();

mobRouter.get("/", asyncHandler(MobController.list));
mobRouter.get("/:mobId", asyncHandler(MobController.get));
mobRouter.post("/", asyncHandler(MobController.create));
mobRouter.patch("/:mobId", asyncHandler(MobController.update));
mobRouter.delete("/:mobId", asyncHandler(MobController.remove));
