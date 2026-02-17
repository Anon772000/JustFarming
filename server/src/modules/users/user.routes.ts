import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { requireRole } from "../../shared/auth/role.middleware";
import { UserController } from "./user.controller";

export const userRouter = Router();

userRouter.get("/me", asyncHandler(UserController.me));

// Admin endpoints
userRouter.use(requireRole(["manager"]));

userRouter.get("/", asyncHandler(UserController.list));
userRouter.get("/audit", asyncHandler(UserController.listAudit));
userRouter.post("/", asyncHandler(UserController.create));
userRouter.get("/:userId", asyncHandler(UserController.get));
userRouter.patch("/:userId", asyncHandler(UserController.update));
userRouter.get("/:userId/sessions", asyncHandler(UserController.listSessions));
userRouter.delete("/:userId/sessions/:sessionId", asyncHandler(UserController.revokeSession));
userRouter.post("/:userId/revoke-sessions", asyncHandler(UserController.revokeSessions));
