import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { tokenService, AccessTokenPayload } from "../../shared/auth/token.service";
import type { LoginInput } from "./auth.dto";

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
  static async login(input: LoginInput, userAgent?: string | null) {
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
      throw new ApiError(403, "Account disabled. Contact your manager.");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new ApiError(401, "Invalid credentials");
    }

    const payload: AccessTokenPayload = { sub: user.id, farmId: user.farmId, role: user.role };
    const tokens = await issueAndStoreTokens(payload, {
      deviceId: input.deviceId,
      userAgent,
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

  static async refresh(refreshToken: string, deviceId?: string, userAgent?: string | null) {
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

    return tokens;
  }

  static async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
  }

  static async logoutOthers(userId: string, currentRefreshToken: string) {
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

    await prisma.refreshToken.updateMany({
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

  static async revokeSession(userId: string, sessionId: string) {
    const session = await prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
      select: { id: true, revokedAt: true },
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
  }
}
