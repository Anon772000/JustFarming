import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { PaddockController } from "./paddock.controller";

export const paddockRouter = Router();

paddockRouter.get("/", asyncHandler(PaddockController.list));
paddockRouter.get("/:paddockId", asyncHandler(PaddockController.get));
paddockRouter.post("/", asyncHandler(PaddockController.create));
paddockRouter.patch("/:paddockId", asyncHandler(PaddockController.update));
paddockRouter.delete("/:paddockId", asyncHandler(PaddockController.remove));
