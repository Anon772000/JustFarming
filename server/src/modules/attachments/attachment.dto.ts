import { AttachmentEntityType } from "@prisma/client";
import { z } from "zod";

export const listAttachmentsQuerySchema = z
  .object({
    entityType: z.nativeEnum(AttachmentEntityType).optional(),
    entityId: z.string().uuid().optional(),
  })
  .refine((v) => {
    // Allow listing everything for the farm, but most UI paths will pass both.
    if (v.entityId && !v.entityType) return false;
    return true;
  }, "entityType is required when entityId is provided");

export const createAttachmentSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  entityType: z.nativeEnum(AttachmentEntityType),
  entityId: z.string().uuid(),
  mediaType: z.string().min(1).max(40),
  mimeType: z.string().min(1).max(120),
  url: z.string().min(1).max(1024),
  thumbnailUrl: z.string().min(1).max(1024).optional(),
  capturedAt: z.string().datetime().optional(),
  createdById: z.string().uuid(),
});

export const createAttachmentBodySchema = createAttachmentSchema
  .omit({ farmId: true, createdById: true })
  .extend({
    capturedAt: z.string().datetime().optional(),
  });

export const updateAttachmentSchema = z
  .object({
    thumbnailUrl: z.string().min(1).max(1024).optional(),
    capturedAt: z.string().datetime().optional(),
  })
  .strict();

export const uploadAttachmentFieldsSchema = z.object({
  entityType: z.nativeEnum(AttachmentEntityType),
  entityId: z.string().uuid(),
  capturedAt: z.string().datetime().optional(),
});

export type ListAttachmentsQuery = z.infer<typeof listAttachmentsQuerySchema>;
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
export type CreateAttachmentBody = z.infer<typeof createAttachmentBodySchema>;
export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;
export type UploadAttachmentFields = z.infer<typeof uploadAttachmentFieldsSchema>;
