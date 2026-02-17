import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { IssueController } from "./issue.controller";

export const issueRouter = Router();

issueRouter.get("/", asyncHandler(IssueController.list));
issueRouter.get("/:issueId", asyncHandler(IssueController.get));
issueRouter.post("/", asyncHandler(IssueController.create));
issueRouter.patch("/:issueId", asyncHandler(IssueController.update));
issueRouter.delete("/:issueId", asyncHandler(IssueController.remove));
