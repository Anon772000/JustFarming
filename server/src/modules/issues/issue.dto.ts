import { IssueCategory, IssueStatus } from "@prisma/client";
import { z } from "zod";

export const createIssueSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  category: z.nativeEnum(IssueCategory).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
  status: z.nativeEnum(IssueStatus).optional(),
  severity: z.string().max(40).optional(),
  locationGeoJson: z.unknown().nullable().optional(),
  paddockId: z.string().uuid().nullable().optional(),
  mobId: z.string().uuid().nullable().optional(),
  feederId: z.string().uuid().nullable().optional(),
  waterAssetId: z.string().uuid().nullable().optional(),
  createdById: z.string().uuid(),
});

export const updateIssueSchema = createIssueSchema.partial().omit({
  id: true,
  farmId: true,
  createdById: true,
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
