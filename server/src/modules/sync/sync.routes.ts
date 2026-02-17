import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { SyncController } from "./sync.controller";

export const syncRouter = Router();

syncRouter.get("/changes", asyncHandler(SyncController.changes));
syncRouter.post("/batch", asyncHandler(SyncController.batch));
