import { IssueCategory, IssueStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { createIssueSchema, updateIssueSchema } from "./issue.dto";
import { IssueService } from "./issue.service";

const issueIdSchema = z.object({ issueId: z.string().uuid() });

const issueListQuerySchema = z.object({
  status: z.nativeEnum(IssueStatus).optional(),
  category: z.nativeEnum(IssueCategory).optional(),
  paddockId: z.string().uuid().optional(),
  mobId: z.string().uuid().optional(),
  feederId: z.string().uuid().optional(),
  waterAssetId: z.string().uuid().optional(),
});

export class IssueController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { status, category, paddockId, mobId, feederId, waterAssetId } = issueListQuerySchema.parse(req.query);
    const data = await IssueService.list(farmId, { status, category, paddockId, mobId, feederId, waterAssetId });
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { issueId } = issueIdSchema.parse(req.params);
    const data = await IssueService.get(farmId, issueId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const userId = req.auth!.sub;
    const payload = createIssueSchema.parse({ ...req.body, farmId, createdById: userId });
    const data = await IssueService.create(payload);
    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { issueId } = issueIdSchema.parse(req.params);
    const payload = updateIssueSchema.parse(req.body);
    const data = await IssueService.update(farmId, issueId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { issueId } = issueIdSchema.parse(req.params);
    await IssueService.remove(farmId, issueId);
    res.status(204).send();
  }
}
