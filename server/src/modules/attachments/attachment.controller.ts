import { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../shared/http/api-error";
import {
  createAttachmentBodySchema,
  listAttachmentsQuerySchema,
  updateAttachmentSchema,
  uploadAttachmentFieldsSchema,
} from "./attachment.dto";
import { AttachmentService } from "./attachment.service";

const attachmentIdSchema = z.object({ attachmentId: z.string().uuid() });

function mediaTypeFromMime(mimeType: string): string {
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return "PHOTO";
  if (m.startsWith("video/")) return "VIDEO";
  return "FILE";
}

export class AttachmentController {
  static async list(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const query = listAttachmentsQuerySchema.parse(req.query);
    const data = await AttachmentService.list(farmId, query);
    res.json({ data });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { attachmentId } = attachmentIdSchema.parse(req.params);
    const data = await AttachmentService.get(farmId, attachmentId);
    res.json({ data });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const createdById = req.auth!.sub;
    const payload = createAttachmentBodySchema.parse(req.body);

    const data = await AttachmentService.create({
      ...payload,
      farmId,
      createdById,
    });

    res.status(201).json({ data });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { attachmentId } = attachmentIdSchema.parse(req.params);
    const payload = updateAttachmentSchema.parse(req.body);
    const data = await AttachmentService.update(farmId, attachmentId, payload);
    res.json({ data });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const { attachmentId } = attachmentIdSchema.parse(req.params);
    await AttachmentService.remove(farmId, attachmentId);
    res.status(204).send();
  }

  static async upload(req: Request, res: Response): Promise<void> {
    const farmId = req.auth!.farmId;
    const createdById = req.auth!.sub;

    if (!req.file) {
      throw new ApiError(400, "Missing file");
    }

    const fields = uploadAttachmentFieldsSchema.parse(req.body);

    const mimeType = req.file.mimetype || "application/octet-stream";
    const mediaType = mediaTypeFromMime(mimeType);
    const url = `/uploads/${farmId}/${req.file.filename}`;

    const data = await AttachmentService.create({
      farmId,
      createdById,
      entityType: fields.entityType,
      entityId: fields.entityId,
      mediaType,
      mimeType,
      url,
      capturedAt: fields.capturedAt,
    });

    res.status(201).json({ data });
  }
}
