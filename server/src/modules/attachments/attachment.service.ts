import { AttachmentEntityType, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateAttachmentInput, ListAttachmentsQuery, UpdateAttachmentInput } from "./attachment.dto";

const ENTITY_TYPE = "attachments";
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/app/uploads";

function localUploadPathFromUrl(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;

  // url: /uploads/<farmId>/<filename>
  const rel = url.slice("/uploads/".length);
  const safeRel = path.normalize(rel).replace(/^([/\\])+/, "");
  if (safeRel.startsWith("..")) return null;

  return path.join(UPLOAD_DIR, safeRel);
}

async function tryDeleteFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
}

export class AttachmentService {
  static async list(farmId: string, query: ListAttachmentsQuery) {
    const where: Prisma.AttachmentWhereInput = {
      farmId,
    };

    if (query.entityType) where.entityType = query.entityType as AttachmentEntityType;
    if (query.entityId) where.entityId = query.entityId;

    return prisma.attachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(farmId: string, attachmentId: string) {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, farmId },
    });

    if (!attachment) {
      throw new ApiError(404, "Attachment not found");
    }

    return attachment;
  }

  static async create(input: CreateAttachmentInput) {
    return prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          id: input.id,
          farm: { connect: { id: input.farmId } },
          entityType: input.entityType,
          entityId: input.entityId,
          mediaType: input.mediaType,
          mimeType: input.mimeType,
          url: input.url,
          thumbnailUrl: input.thumbnailUrl,
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : undefined,
          createdById: input.createdById,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: attachment.id,
        operation: "CREATE",
        payload: attachment,
      });

      return attachment;
    });
  }

  static async update(farmId: string, attachmentId: string, input: UpdateAttachmentInput) {
    await this.get(farmId, attachmentId);

    return prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.update({
        where: { id: attachmentId },
        data: {
          thumbnailUrl: input.thumbnailUrl,
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : undefined,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: attachment.id,
        operation: "UPDATE",
        payload: attachment,
      });

      return attachment;
    });
  }

  static async remove(farmId: string, attachmentId: string) {
    const existing = await this.get(farmId, attachmentId);

    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({ where: { id: attachmentId } });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: attachmentId,
      });
    });

    const localPath = localUploadPathFromUrl(existing.url);
    if (localPath) await tryDeleteFile(localPath);

    if (existing.thumbnailUrl) {
      const thumbPath = localUploadPathFromUrl(existing.thumbnailUrl);
      if (thumbPath) await tryDeleteFile(thumbPath);
    }
  }
}
