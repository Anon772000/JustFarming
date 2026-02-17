import { IssueCategory, IssueStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateIssueInput, UpdateIssueInput } from "./issue.dto";

const ENTITY_TYPE = "issues";

function isResolvedStatus(status: IssueStatus): boolean {
  return status === IssueStatus.RESOLVED || status === IssueStatus.CLOSED;
}

export class IssueService {
  static async list(
    farmId: string,
    opts?: {
      status?: IssueStatus;
      category?: IssueCategory;
      paddockId?: string;
      mobId?: string;
      feederId?: string;
      waterAssetId?: string;
    },
  ) {
    return prisma.issue.findMany({
      where: {
        farmId,
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.paddockId ? { paddockId: opts.paddockId } : {}),
        ...(opts?.mobId ? { mobId: opts.mobId } : {}),
        ...(opts?.feederId ? { feederId: opts.feederId } : {}),
        ...(opts?.waterAssetId ? { waterAssetId: opts.waterAssetId } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async get(farmId: string, issueId: string) {
    const issue = await prisma.issue.findFirst({
      where: { id: issueId, farmId },
    });

    if (!issue) {
      throw new ApiError(404, "Issue not found");
    }

    return issue;
  }

  static async create(input: CreateIssueInput) {
    return prisma.$transaction(async (tx) => {
      await this.assertUserExists(tx, input.farmId, input.createdById);

      if (typeof input.paddockId === "string") {
        await this.assertPaddockExists(tx, input.farmId, input.paddockId);
      }

      if (typeof input.mobId === "string") {
        await this.assertMobExists(tx, input.farmId, input.mobId);
      }

      if (typeof input.feederId === "string") {
        await this.assertFeederExists(tx, input.farmId, input.feederId);
      }

      if (typeof input.waterAssetId === "string") {
        await this.assertWaterAssetExists(tx, input.farmId, input.waterAssetId);
      }

      const status = input.status ?? IssueStatus.OPEN;
      const now = new Date();

      const data: Prisma.IssueCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        category: input.category ?? IssueCategory.GENERAL,
        title: input.title,
        description: input.description,
        status,
        severity: input.severity,
        locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
        paddock: input.paddockId ? { connect: { id: input.paddockId } } : undefined,
        mob: input.mobId ? { connect: { id: input.mobId } } : undefined,
        feeder: input.feederId ? { connect: { id: input.feederId } } : undefined,
        waterAsset: input.waterAssetId ? { connect: { id: input.waterAssetId } } : undefined,
        createdBy: { connect: { id: input.createdById } },
        resolvedAt: isResolvedStatus(status) ? now : null,
      };

      const issue = await tx.issue.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: issue.id,
        operation: "CREATE",
        payload: issue,
      });

      return issue;
    });
  }

  static async update(farmId: string, issueId: string, input: UpdateIssueInput) {
    const existing = await this.get(farmId, issueId);

    if (typeof input.paddockId === "string") {
      await this.assertPaddockExists(prisma, farmId, input.paddockId);
    }

    if (typeof input.mobId === "string") {
      await this.assertMobExists(prisma, farmId, input.mobId);
    }

    if (typeof input.feederId === "string") {
      await this.assertFeederExists(prisma, farmId, input.feederId);
    }

    if (typeof input.waterAssetId === "string") {
      await this.assertWaterAssetExists(prisma, farmId, input.waterAssetId);
    }

    return prisma.$transaction(async (tx) => {
      const nextStatus = input.status ?? existing.status;

      let resolvedAt: Date | null | undefined;
      if (input.status !== undefined) {
        resolvedAt = isResolvedStatus(nextStatus) ? existing.resolvedAt ?? new Date() : null;
      }

      const issue = await tx.issue.update({
        where: { id: issueId },
        data: {
          category: input.category,
          title: input.title,
          description: input.description,
          status: input.status,
          severity: input.severity,
          locationGeoJson: input.locationGeoJson === undefined ? undefined : (input.locationGeoJson as any),
          paddockId: input.paddockId,
          mobId: input.mobId,
          feederId: input.feederId,
          waterAssetId: input.waterAssetId,
          resolvedAt,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: issue.id,
        operation: "UPDATE",
        payload: issue,
      });

      return issue;
    });
  }

  static async remove(farmId: string, issueId: string) {
    await this.get(farmId, issueId);

    await prisma.$transaction(async (tx) => {
      await tx.issue.delete({ where: { id: issueId } });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: issueId,
      });
    });
  }

  private static async assertPaddockExists(
    db: Prisma.TransactionClient | typeof prisma,
    farmId: string,
    paddockId: string,
  ) {
    const paddock = await db.paddock.findFirst({
      where: { id: paddockId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!paddock) {
      throw new ApiError(400, "Invalid paddock reference");
    }
  }

  private static async assertMobExists(db: Prisma.TransactionClient | typeof prisma, farmId: string, mobId: string) {
    const mob = await db.mob.findFirst({
      where: { id: mobId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!mob) {
      throw new ApiError(400, "Invalid mob reference");
    }
  }

  private static async assertFeederExists(
    db: Prisma.TransactionClient | typeof prisma,
    farmId: string,
    feederId: string,
  ) {
    const feeder = await db.feeder.findFirst({
      where: { id: feederId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!feeder) {
      throw new ApiError(400, "Invalid feeder reference");
    }
  }

  private static async assertWaterAssetExists(
    db: Prisma.TransactionClient | typeof prisma,
    farmId: string,
    waterAssetId: string,
  ) {
    const asset = await db.waterAsset.findFirst({
      where: { id: waterAssetId, farmId, deletedAt: null },
      select: { id: true },
    });

    if (!asset) {
      throw new ApiError(400, "Invalid water asset reference");
    }
  }

  private static async assertUserExists(db: Prisma.TransactionClient, farmId: string, userId: string) {
    const user = await db.user.findFirst({
      where: { id: userId, farmId },
      select: { id: true },
    });

    if (!user) {
      throw new ApiError(400, "Invalid user reference");
    }
  }
}
