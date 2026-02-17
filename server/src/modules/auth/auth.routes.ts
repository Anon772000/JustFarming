import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { requireAuth } from "../../shared/auth/auth.middleware";
import { AuthController } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(AuthController.login));
authRouter.post("/refresh", asyncHandler(AuthController.refresh));
authRouter.post("/logout", asyncHandler(AuthController.logout));
authRouter.post("/logout-others", requireAuth, asyncHandler(AuthController.logoutOthers));
authRouter.get("/sessions", requireAuth, asyncHandler(AuthController.listSessions));
authRouter.delete("/sessions/:sessionId", requireAuth, asyncHandler(AuthController.revokeSession));
