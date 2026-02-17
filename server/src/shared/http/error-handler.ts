import { NextFunction, Request, Response } from "express";
import { ApiError } from "./api-error";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  const error = err as Error;
  res.status(500).json({ error: "Internal server error", detail: error?.message ?? "unknown" });
};
