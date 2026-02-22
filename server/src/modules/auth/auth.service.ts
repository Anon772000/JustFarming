import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { tokenService, AccessTokenPayload } from "../../shared/auth/token.service";
import type { LoginInput } from "./auth.dto";
import { logUserAudit } from "../users/user.service";

function hashToken(token: string): string {
  // Store only a hash of refresh tokens.
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getJwtExpiresAt(token: string): Date {
  const decoded = tokenService.decode(token);
  const exp = decoded?.exp;
  if (typeof exp === "number") {
    return new Date(exp * 1000);
  }

  // Fallback (should not normally happen)
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function normalizeDeviceId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

function normalizeUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

type UserAuditArgs = Parameters<typeof logUserAudit>[1];

async function safeLogUserAudit(args: UserAuditArgs): Promise<void> {
  try {
    await logUserAudit(prisma, args);
  } catch {
    // Avoid breaking auth/session flows if audit logging fails.
  }
}

async function issueAndStoreTokens(
  payload: AccessTokenPayload,
  options?: {
    deviceId?: string | null;
    userAgent?: string | null;
  },
) {
  const accessToken = tokenService.signAccessToken(payload);
  const refreshToken = tokenService.signRefreshToken(payload);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = getJwtExpiresAt(refreshToken);
  const now = new Date();

  const deviceId = normalizeDeviceId(options?.deviceId);
  const userAgent = normalizeUserAgent(options?.userAgent);

  // Keep one active refresh token per user+device while still allowing many devices.
  if (deviceId) {
    await prisma.refreshToken.updateMany({
      where: {
        userId: payload.sub,
        deviceId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        lastUsedAt: now,
      },
    });
  }

  await prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      deviceId,
      userAgent,
      tokenHash,
      expiresAt,
      lastUsedAt: now,
    },
  });

  return { accessToken, refreshToken };
}

export class AuthService {
  static async login(input: LoginInput, userAgent?: string | null, ip?: string | null) {
    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: input.email,
          mode: "insensitive",
        },
      },
    });

    if (!user) {
      throw new ApiError(401, "Invalid credentials");
    }

    if (user.disabledAt) {
      await safeLogUserAudit({
        farmId: user.farmId,
        targetUserId: user.id,
        actorUserId: user.id,
        eventType: "USER_AUTH_LOGIN_BLOCKED",
        details: {
          email: user.email,
          deviceId: normalizeDeviceId(input.deviceId),
          userAgent: normalizeUserAgent(userAgent),
          ip: normalizeIp(ip),
        },
      });
      throw new ApiError(403, "Account disabled. Contact your manager.");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      await safeLogUserAudit({
        farmId: user.farmId,
        targetUserId: user.id,
        actorUserId: user.id,
        eventType: "USER_AUTH_LOGIN_FAILED",
        details: {
          email: user.email,
          deviceId: normalizeDeviceId(input.deviceId),
          userAgent: normalizeUserAgent(userAgent),
          ip: normalizeIp(ip),
        },
      });
      throw new ApiError(401, "Invalid credentials");
    }

    const payload: AccessTokenPayload = { sub: user.id, farmId: user.farmId, role: user.role };
    const tokens = await issueAndStoreTokens(payload, {
      deviceId: input.deviceId,
      userAgent,
    });

    await safeLogUserAudit({
      farmId: user.farmId,
      targetUserId: user.id,
      actorUserId: user.id,
      eventType: "USER_AUTH_LOGIN_SUCCESS",
      details: {
        deviceId: normalizeDeviceId(input.deviceId),
        userAgent: normalizeUserAgent(userAgent),
        ip: normalizeIp(ip),
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        farmId: user.farmId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  static async refresh(refreshToken: string, deviceId?: string, userAgent?: string | null, ip?: string | null) {
    let payload: AccessTokenPayload;
    try {
      payload = tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new ApiError(401, "Invalid refresh token");
    }

    const tokenHash = hashToken(refreshToken);

    const stored = await prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!stored) {
      throw new ApiError(401, "Refresh token revoked or expired");
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

    if (!user || user.disabledAt) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });

      throw new ApiError(403, "Account disabled. Contact your manager.");
    }

    const requestedDeviceId = normalizeDeviceId(deviceId);
    const storedDeviceId = normalizeDeviceId(stored.deviceId);

    if (storedDeviceId && requestedDeviceId && storedDeviceId !== requestedDeviceId) {
      throw new ApiError(401, "Refresh token does not belong to this device");
    }

    const effectiveDeviceId = requestedDeviceId ?? storedDeviceId;
    const effectiveUserAgent = normalizeUserAgent(userAgent) ?? normalizeUserAgent(stored.userAgent);

    // Rotate refresh token on every refresh.
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    const nextPayload: AccessTokenPayload = {
      sub: user.id,
      farmId: user.farmId,
      role: user.role,
    };

    const tokens = await issueAndStoreTokens(nextPayload, {
      deviceId: effectiveDeviceId,
      userAgent: effectiveUserAgent,
    });

    await safeLogUserAudit({
      farmId: user.farmId,
      targetUserId: user.id,
      actorUserId: user.id,
      eventType: "USER_AUTH_REFRESH",
      details: {
        deviceId: effectiveDeviceId,
        userAgent: effectiveUserAgent,
        ip: normalizeIp(ip),
      },
    });

    return tokens;
  }

  static async logout(refreshToken: string, ip?: string | null) {
    let payload: AccessTokenPayload | null = null;
    try {
      payload = tokenService.verifyRefreshToken(refreshToken);
    } catch {
      // ignore; logout remains best-effort by token hash
    }

    const tokenHash = hashToken(refreshToken);
    const now = new Date();

    const result = await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        lastUsedAt: now,
      },
    });

    if (payload) {
      await safeLogUserAudit({
        farmId: payload.farmId,
        targetUserId: payload.sub,
        actorUserId: payload.sub,
        eventType: "USER_AUTH_LOGOUT",
        details: {
          revokedCount: result.count,
          ip: normalizeIp(ip),
        },
      });
    }
  }

  static async logoutOthers(userId: string, currentRefreshToken: string, ip?: string | null) {
    let payload: AccessTokenPayload;
    try {
      payload = tokenService.verifyRefreshToken(currentRefreshToken);
    } catch {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (payload.sub !== userId) {
      throw new ApiError(401, "Refresh token does not belong to this user");
    }

    const tokenHash = hashToken(currentRefreshToken);
    const current = await prisma.refreshToken.findFirst({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!current) {
      throw new ApiError(401, "Current device session is no longer active");
    }

    const result = await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: { not: current.id },
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    await safeLogUserAudit({
      farmId: payload.farmId,
      targetUserId: userId,
      actorUserId: userId,
      eventType: "USER_AUTH_LOGOUT_OTHERS",
      details: {
        revokedCount: result.count,
        ip: normalizeIp(ip),
      },
    });
  }

  static async listSessions(userId: string, currentDeviceId?: string) {
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

  static async revokeSession(userId: string, sessionId: string, ip?: string | null) {
    const user = await prisma.user.findFirst({
      where: { id: userId },
      select: { farmId: true },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

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

    await prisma.refreshToken.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    await safeLogUserAudit({
      farmId: user.farmId,
      targetUserId: userId,
      actorUserId: userId,
      eventType: "USER_AUTH_REVOKE_SESSION",
      details: {
        sessionId,
        deviceId: session.deviceId,
        userAgent: session.userAgent,
        ip: normalizeIp(ip),
      },
    });
  }
}
