import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Request, Response } from "express";
import { BACKUPS_DIR } from "@/config/storage";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { prisma } from "@/config/prisma";

const execFileAsync = promisify(execFile);

function timestampedFilename() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `alphatech-crm-backup-${stamp}.sql`;
}

// pg_dump/psql don't understand Prisma's "?schema=public" query param on the connection URI.
function stripSchemaParam(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

export async function createBackup(req: Request, res: Response) {
  const pgDumpPath = process.env.PG_DUMP_PATH;
  const databaseUrl = process.env.DATABASE_URL;
  if (!pgDumpPath || !databaseUrl) {
    throw new AppError("Backup is not configured (PG_DUMP_PATH / DATABASE_URL missing)", 500);
  }

  const filename = timestampedFilename();
  const outputPath = path.join(BACKUPS_DIR, filename);

  try {
    await execFileAsync(pgDumpPath, ["--format=plain", `--file=${outputPath}`, stripSchemaParam(databaseUrl)]);
  } catch (err) {
    throw new AppError(`pg_dump failed: ${(err as Error).message}`, 500);
  }

  const stats = fs.statSync(outputPath);

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "BACKUP_CREATED",
    entityType: "Backup",
    entityId: filename,
    metadata: { size: stats.size },
  });

  res.status(201).json({ filename, size: stats.size, createdAt: stats.birthtime });
}

export async function listBackups(_req: Request, res: Response) {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const stats = fs.statSync(path.join(BACKUPS_DIR, f));
      return { filename: f, size: stats.size, createdAt: stats.birthtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({ items: files });
}

export async function downloadBackup(req: Request, res: Response) {
  const filename = path.basename(req.params.filename);
  const fullPath = path.join(BACKUPS_DIR, filename);
  if (!fullPath.startsWith(BACKUPS_DIR) || !fs.existsSync(fullPath)) {
    throw new AppError("Backup not found", 404);
  }
  res.download(fullPath, filename);
}
