import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export type AccessTokenPayload = {
  sub: string;
  farmId: string;
  role: string;
};

export const tokenService = {
  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    });
  },
  signRefreshToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
    });
  },
  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  },
  verifyRefreshToken(token: string): AccessTokenPayload {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as AccessTokenPayload;
  },
  decode(token: string): jwt.JwtPayload | null {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== "object") return null;
    return decoded as jwt.JwtPayload;
  },
};
