import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Request, Response } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { UPLOADS_DIR } from "@/config/storage";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";

const FILE_SORT_FIELDS: Record<string, Prisma.FileOrderByWithRelationInput> = {
  filename: { filename: "asc" },
  entityType: { entityType: "asc" },
  size: { size: "asc" },
  createdAt: { createdAt: "asc" },
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("file");

export async function uploadFile(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No file uploaded", 422);
  }
  const { entityType, entityId } = req.body as { entityType?: string; entityId?: string };

  const record = await prisma.file.create({
    data: {
      filename: req.file.originalname,
      path: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      entityType,
      entityId,
      uploadedBy: req.user!.sub,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "FILE_UPLOADED",
    entityType: entityType ?? "File",
    entityId: entityId ?? record.id,
    metadata: { filename: record.filename },
  });

  res.status(201).json(record);
}

export async function listFiles(req: Request, res: Response) {
  const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
  };

  const [files, total] = await Promise.all([
    prisma.file.findMany({
      where,
      orderBy: parseSortOrder(req, FILE_SORT_FIELDS, { createdAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.file.count({ where }),
  ]);

  res.json({ items: files, total, page, pageSize });
}

export async function downloadFile(req: Request, res: Response) {
  const file = await prisma.file.findUniqueOrThrow({ where: { id: req.params.id } });
  const fullPath = path.join(UPLOADS_DIR, file.path);
  if (!fs.existsSync(fullPath)) {
    throw new AppError("File missing from storage", 404);
  }
  res.download(fullPath, file.filename);
}

export async function deleteFile(req: Request, res: Response) {
  const file = await prisma.file.findUniqueOrThrow({ where: { id: req.params.id } });
  const fullPath = path.join(UPLOADS_DIR, file.path);

  await prisma.file.delete({ where: { id: file.id } });
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "FILE_DELETED",
    entityType: file.entityType ?? "File",
    entityId: file.entityId ?? file.id,
    metadata: { filename: file.filename },
  });

  res.status(204).send();
}
