import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { FeedEventController } from "./feed-event.controller";

export const feedEventRouter = Router();

feedEventRouter.get("/", asyncHandler(FeedEventController.list));
feedEventRouter.get("/:feedEventId", asyncHandler(FeedEventController.get));
feedEventRouter.post("/", asyncHandler(FeedEventController.create));
feedEventRouter.patch("/:feedEventId", asyncHandler(FeedEventController.update));
feedEventRouter.delete("/:feedEventId", asyncHandler(FeedEventController.remove));
