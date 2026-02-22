import { NextFunction, Request, Response } from "express";
import { logUserAudit } from "../../modules/users/user.service";
import { prisma } from "../db/prisma";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

function normalizeUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

function requestPath(req: Request): string {
  const original = req.originalUrl || "";
  const q = original.indexOf("?");
  if (q >= 0) return original.slice(0, q);
  return original;
}

export const auditMutatingUserAction = (req: Request, res: Response, next: NextFunction): void => {
  const method = req.method.toUpperCase();
  if (!MUTATION_METHODS.has(method)) {
    next();
    return;
  }

  const auth = req.auth;
  if (!auth) {
    next();
    return;
  }

  const startedAt = Date.now();
  const path = requestPath(req);
  const ip = normalizeIp(req.ip ?? req.socket.remoteAddress ?? null);
  const userAgent = normalizeUserAgent(req.get("user-agent") ?? null);

  res.once("finish", () => {
    const durationMs = Date.now() - startedAt;

    void logUserAudit(prisma, {
      farmId: auth.farmId,
      targetUserId: auth.sub,
      actorUserId: auth.sub,
      eventType: "USER_ACTION_API_MUTATION",
      details: {
        method,
        path,
        statusCode: res.statusCode,
        durationMs,
        ip,
        userAgent,
      },
    }).catch(() => {
      // Never fail request lifecycle because audit write failed.
    });
  });

  next();
};
