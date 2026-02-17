import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { LoraController } from "./lora.controller";

export const loraRouter = Router();

loraRouter.post("/ingest", asyncHandler(LoraController.ingest));
