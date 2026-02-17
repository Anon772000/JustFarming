import { z } from "zod";

const deviceIdSchema = z.string().trim().min(8).max(200).optional();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  deviceId: deviceIdSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(16),
  deviceId: deviceIdSchema,
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(16),
});

export const logoutOthersSchema = z.object({
  refreshToken: z.string().min(16),
});

export const listSessionsQuerySchema = z.object({
  deviceId: deviceIdSchema,
});

export const revokeSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
