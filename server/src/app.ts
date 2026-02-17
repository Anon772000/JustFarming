import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import { apiRouter } from "./routes";
import { errorHandler } from "./shared/http/error-handler";

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch {
    // ignore
  }
  app.use("/uploads", express.static(uploadDir));

  app.use("/api/v1", apiRouter);
  app.use(errorHandler);

  return app;
};
