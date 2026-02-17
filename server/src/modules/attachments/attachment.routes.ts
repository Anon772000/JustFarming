import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ApiError } from "../../shared/http/api-error";
import { asyncHandler } from "../../shared/http/async-handler";
import { AttachmentController } from "./attachment.controller";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/app/uploads";

function ensureDir(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const farmId = (req as any).auth?.farmId as string | undefined;
    if (!farmId) {
      cb(new ApiError(401, "Missing auth"), UPLOAD_DIR);
      return;
    }

    const dir = path.join(UPLOAD_DIR, farmId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const id = randomUUID();
    (req as any).uploadAttachmentId = id;

    const ext = path.extname(file.originalname || "");
    const safeExt = ext && ext.length <= 10 ? ext : "";

    cb(null, `${id}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mt = (file.mimetype || "").toLowerCase();
    if (mt.startsWith("image/") || mt.startsWith("video/")) {
      cb(null, true);
      return;
    }

    cb(new ApiError(400, "Only image/* and video/* uploads are supported"));
  },
});

export const attachmentRouter = Router();

attachmentRouter.get("/", asyncHandler(AttachmentController.list));
attachmentRouter.get("/:attachmentId", asyncHandler(AttachmentController.get));
attachmentRouter.post("/", asyncHandler(AttachmentController.create));
attachmentRouter.post("/upload", upload.single("file"), asyncHandler(AttachmentController.upload));
attachmentRouter.patch("/:attachmentId", asyncHandler(AttachmentController.update));
attachmentRouter.delete("/:attachmentId", asyncHandler(AttachmentController.remove));
