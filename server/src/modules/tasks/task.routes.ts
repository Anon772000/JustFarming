import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { TaskController } from "./task.controller";

export const taskRouter = Router();

taskRouter.get("/", asyncHandler(TaskController.list));
taskRouter.get("/:taskId", asyncHandler(TaskController.get));
taskRouter.post("/", asyncHandler(TaskController.create));
taskRouter.patch("/:taskId", asyncHandler(TaskController.update));
taskRouter.delete("/:taskId", asyncHandler(TaskController.remove));
