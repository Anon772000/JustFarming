import { NextFunction, Request, Response } from "express";
import { ApiError } from "../http/api-error";

export const requireRole = (roles: string[]) => {
  const allowed = roles.map((r) => r.toLowerCase());

  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role) {
      throw new ApiError(401, "Missing auth context");
    }

    if (!allowed.includes(role.toLowerCase())) {
      throw new ApiError(403, "Forbidden");
    }

    next();
  };
};
