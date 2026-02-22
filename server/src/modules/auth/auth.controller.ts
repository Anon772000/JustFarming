import { Request, Response } from "express";
import {
  listSessionsQuerySchema,
  loginSchema,
  logoutOthersSchema,
  logoutSchema,
  refreshSchema,
  revokeSessionParamsSchema,
} from "./auth.dto";
import { AuthService } from "./auth.service";

function requestIp(req: Request): string | null {
  return req.ip ?? req.socket.remoteAddress ?? null;
}

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const input = loginSchema.parse(req.body);
    const result = await AuthService.login(input, req.get("user-agent") ?? null, requestIp(req));
    res.json(result);
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken, deviceId } = refreshSchema.parse(req.body);
    const result = await AuthService.refresh(refreshToken, deviceId, req.get("user-agent") ?? null, requestIp(req));
    res.json(result);
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = logoutSchema.parse(req.body);
    await AuthService.logout(refreshToken, requestIp(req));
    res.status(204).send();
  }

  static async logoutOthers(req: Request, res: Response): Promise<void> {
    const { refreshToken } = logoutOthersSchema.parse(req.body);
    await AuthService.logoutOthers(req.auth!.sub, refreshToken, requestIp(req));
    res.status(204).send();
  }

  static async listSessions(req: Request, res: Response): Promise<void> {
    const { deviceId } = listSessionsQuerySchema.parse(req.query);
    const data = await AuthService.listSessions(req.auth!.sub, deviceId);
    res.json({ data });
  }

  static async revokeSession(req: Request, res: Response): Promise<void> {
    const { sessionId } = revokeSessionParamsSchema.parse(req.params);
    await AuthService.revokeSession(req.auth!.sub, sessionId, requestIp(req));
    res.status(204).send();
  }
}
