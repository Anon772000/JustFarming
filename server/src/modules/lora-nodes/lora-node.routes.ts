import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { LoraNodeController } from "./lora-node.controller";

export const loraNodeRouter = Router();

loraNodeRouter.get("/", asyncHandler(LoraNodeController.list));
loraNodeRouter.get("/:loraNodeId", asyncHandler(LoraNodeController.get));
loraNodeRouter.post("/", asyncHandler(LoraNodeController.create));
loraNodeRouter.patch("/:loraNodeId", asyncHandler(LoraNodeController.update));
loraNodeRouter.delete("/:loraNodeId", asyncHandler(LoraNodeController.remove));
