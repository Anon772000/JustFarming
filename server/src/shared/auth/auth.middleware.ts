import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { ApiError } from "../http/api-error";
import { tokenService, AccessTokenPayload } from "./token.service";

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  void (async () => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Missing bearer token");
    }

    const token = header.slice("Bearer ".length);

    let payload: AccessTokenPayload;
    try {
      payload = tokenService.verifyAccessToken(token);
    } catch {
      throw new ApiError(401, "Invalid bearer token");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: payload.sub,
        farmId: payload.farmId,
      },
      select: {
        id: true,
        farmId: true,
        role: true,
        disabledAt: true,
      },
    });

    if (!user) {
      throw new ApiError(401, "Session is no longer valid");
    }

    if (user.disabledAt) {
      throw new ApiError(401, "Account disabled");
    }

    // Keep request auth aligned with current DB role/farm state.
    req.auth = {
      sub: user.id,
      farmId: user.farmId,
      role: user.role,
    };

    next();
  })().catch(next);
};
