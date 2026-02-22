import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { CreateUserInput, UpdateUserInput } from "./user.dto";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDeviceId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

function extractActorUserId(payload: Prisma.JsonValue | null): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const v = (payload as Prisma.JsonObject).actorUserId;
  return typeof v === "string" ? v : null;
}

function extractDetails(payload: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const details = (payload as Prisma.JsonObject).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details as Record<string, unknown>;
}

function buildAuditPayload(
  actorUserId?: string | null,
  details?: Record<string, unknown>,
): Prisma.InputJsonValue | null {
  const payload: Record<string, unknown> = {};
  if (actorUserId) {
    payload.actorUserId = actorUserId;
  }
  if (details && Object.keys(details).length > 0) {
    payload.details = details;
  }
  return Object.keys(payload).length > 0 ? (payload as Prisma.InputJsonValue) : null;
}

export type UserAuditEventType =
  | "USER_ADMIN_CREATE"
  | "USER_ADMIN_UPDATE"
  | "USER_ADMIN_REVOKE_SESSION"
  | "USER_ADMIN_REVOKE_SESSIONS"
  | "USER_AUTH_LOGIN_SUCCESS"
  | "USER_AUTH_LOGIN_FAILED"
  | "USER_AUTH_LOGIN_BLOCKED"
  | "USER_AUTH_REFRESH"
  | "USER_AUTH_LOGOUT"
  | "USER_AUTH_LOGOUT_OTHERS"
  | "USER_AUTH_REVOKE_SESSION"
  | "USER_ACTION_API_MUTATION";

type UserAdminAuditEventType = Extract<
  UserAuditEventType,
  "USER_ADMIN_CREATE" | "USER_ADMIN_UPDATE" | "USER_ADMIN_REVOKE_SESSION" | "USER_ADMIN_REVOKE_SESSIONS"
>;

export async function logUserAudit(
  db: Prisma.TransactionClient | typeof prisma,
  args: {
    farmId: string;
    targetUserId: string;
    eventType: UserAuditEventType;
    actorUserId?: string | null;
    details?: Record<string, unknown>;
    actualAt?: Date;
  },
): Promise<void> {
  const payloadJson = buildAuditPayload(args.actorUserId, args.details);
  await db.activityEvent.create({
    data: {
      farmId: args.farmId,
      entityType: "users",
      entityId: args.targetUserId,
      eventType: args.eventType,
      actualAt: args.actualAt ?? new Date(),
      payloadJson: payloadJson === null ? undefined : payloadJson,
    },
  });
}

async function logUserAdminAudit(
  tx: Prisma.TransactionClient,
  args: {
    farmId: string;
    actorUserId: string;
    targetUserId: string;
    eventType: UserAdminAuditEventType;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await logUserAudit(tx, args);
}

const userSelect = {
  id: true,
  farmId: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  disabledAt: true,
} as const;

export type UserAuditEntry = {
  id: string;
  farmId: string;
  targetUserId: string;
  eventType: UserAuditEventType | string;
  actorUserId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
};

export class UserService {
  static async list(farmId: string) {
    return prisma.user.findMany({
      where: { farmId },
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, farmId },
      select: userSelect,
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return user;
  }

  static async me(farmId: string, userId: string) {
    return this.get(farmId, userId);
  }

  static async listAudit(farmId: string, opts?: { limit?: number; targetUserId?: string }): Promise<UserAuditEntry[]> {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 120));

    const rows = await prisma.activityEvent.findMany({
      where: {
        farmId,
        entityType: "users",
        eventType: { startsWith: "USER_" },
        ...(opts?.targetUserId ? { entityId: opts.targetUserId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        farmId: true,
        entityId: true,
        eventType: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      farmId: row.farmId,
      targetUserId: row.entityId,
      eventType: row.eventType as UserAuditEventType | string,
      actorUserId: extractActorUserId(row.payloadJson),
      details: extractDetails(row.payloadJson),
      createdAt: row.createdAt,
    }));
  }

  static async create(input: CreateUserInput, actorUserId?: string) {
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            id: input.id,
            farmId: input.farmId,
            email: normalizeEmail(input.email),
            passwordHash,
            displayName: input.displayName,
            role: input.role ?? "worker",
          },
          select: userSelect,
        });

        if (actorUserId) {
          await logUserAdminAudit(tx, {
            farmId: input.farmId,
            actorUserId,
            targetUserId: created.id,
            eventType: "USER_ADMIN_CREATE",
            details: {
              email: created.email,
              role: created.role,
            },
          });
        }

        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ApiError(409, "Email already exists");
      }
      throw err;
    }
  }

  static async update(farmId: string, userId: string, input: UpdateUserInput, actorUserId?: string) {
    const existing = await this.get(farmId, userId);

    const existingRole = existing.role.toLowerCase();
    const nextRole = (input.role ?? existingRole) as "manager" | "worker";
    const nextDisabled = input.disabled ?? existing.disabledAt !== null;

    const existingActiveManager = existingRole === "manager" && existing.disabledAt === null;
    const nextActiveManager = nextRole === "manager" && !nextDisabled;

    if (existingActiveManager && !nextActiveManager) {
      const otherActiveManagers = await prisma.user.count({
        where: {
          farmId,
          role: "manager",
          disabledAt: null,
          id: { not: userId },
        },
      });

      if (otherActiveManagers <= 0) {
        throw new ApiError(400, "At least one active manager is required");
      }
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;

    const wasDisabled = existing.disabledAt !== null;
    let disabledAtPatch: Date | null | undefined;
    if (input.disabled === true && !wasDisabled) {
      disabledAtPatch = new Date();
    } else if (input.disabled === false) {
      disabledAtPatch = null;
    }

    const auditDetails: Record<string, unknown> = {};

    if (input.displayName !== undefined && input.displayName !== existing.displayName) {
      auditDetails.displayName = { from: existing.displayName, to: input.displayName };
    }

    if (input.role !== undefined && input.role !== existing.role) {
      auditDetails.role = { from: existing.role, to: input.role };
    }

    if (input.disabled !== undefined && input.disabled !== wasDisabled) {
      auditDetails.disabled = { from: wasDisabled, to: input.disabled };
    }

    if (input.password !== undefined) {
      auditDetails.passwordReset = true;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          displayName: input.displayName,
          role: input.role,
          passwordHash,
          disabledAt: disabledAtPatch,
        },
        select: userSelect,
      });

      if (input.disabled === true && existing.disabledAt === null) {
        await tx.refreshToken.updateMany({
          where: {
            userId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
            lastUsedAt: new Date(),
          },
        });
      }

      if (actorUserId && Object.keys(auditDetails).length > 0) {
        await logUserAdminAudit(tx, {
          farmId,
          actorUserId,
          targetUserId: userId,
          eventType: "USER_ADMIN_UPDATE",
          details: auditDetails,
        });
      }

      return updated;
    });
  }

  static async listSessions(farmId: string, userId: string, currentDeviceId?: string) {
    await this.get(farmId, userId);

    const normalizedDeviceId = normalizeDeviceId(currentDeviceId);

    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrentDevice: !!normalizedDeviceId && normalizeDeviceId(s.deviceId) === normalizedDeviceId,
    }));
  }

  static async revokeSession(farmId: string, userId: string, sessionId: string, actorUserId?: string) {
    await this.get(farmId, userId);

    const session = await prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, revokedAt: true, deviceId: true, userAgent: true },
    });

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    if (session.revokedAt) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: sessionId },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });

      if (actorUserId) {
        await logUserAdminAudit(tx, {
          farmId,
          actorUserId,
          targetUserId: userId,
          eventType: "USER_ADMIN_REVOKE_SESSION",
          details: {
            sessionId,
            deviceId: session.deviceId,
            userAgent: session.userAgent,
          },
        });
      }
    });
  }

  static async revokeSessions(farmId: string, userId: string, actorUserId?: string) {
    await this.get(farmId, userId);

    await prisma.$transaction(async (tx) => {
      const result = await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });

      if (actorUserId) {
        await logUserAdminAudit(tx, {
          farmId,
          actorUserId,
          targetUserId: userId,
          eventType: "USER_ADMIN_REVOKE_SESSIONS",
          details: {
            revokedCount: result.count,
          },
        });
      }
    });
  }
}
