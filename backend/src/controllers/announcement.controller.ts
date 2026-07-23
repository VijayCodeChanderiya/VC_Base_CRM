import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const ANNOUNCEMENT_SORT_FIELDS: Record<string, Prisma.AnnouncementOrderByWithRelationInput> = {
  title: { title: "asc" },
  publishedAt: { publishedAt: "asc" },
  isActive: { isActive: "asc" },
};

// ---------------------------------------------------------------------------
// Staff CRUD
// ---------------------------------------------------------------------------

export async function listAnnouncements(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);

  const organizationId = resolveOrgFilterMode(req);
  const where = organizationId ? { organizationId } : {};

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      include: { organization: { select: ORG_SUMMARY_SELECT } },
      orderBy: parseSortOrder(req, ANNOUNCEMENT_SORT_FIELDS, { publishedAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.announcement.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

const announcementSchema = z.object({
  title: z.string().trim().min(1),
  message: z.string().trim().min(1),
  type: z.enum(["INFO", "WARNING", "ALERT"]).default("INFO"),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
});

export async function createAnnouncement(req: Request, res: Response) {
  const data = announcementSchema.parse(req.body);
  const announcement = await prisma.announcement.create({
    data: {
      organizationId: req.user!.organizationId!,
      title: data.title,
      message: data.message,
      type: data.type,
      isActive: data.isActive,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      createdById: req.user!.sub,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ANNOUNCEMENT_CREATED",
    entityType: "Announcement",
    entityId: announcement.id,
    metadata: { title: announcement.title },
  });

  res.status(201).json(announcement);
}

const updateSchema = announcementSchema.partial();

export async function updateAnnouncement(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);
  const existing = await prisma.announcement.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId! },
  });
  if (!existing) throw new AppError("Announcement not found", 404);
  const announcement = await prisma.announcement.update({
    where: { id: req.params.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.message !== undefined ? { message: data.message } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ANNOUNCEMENT_UPDATED",
    entityType: "Announcement",
    entityId: announcement.id,
  });

  res.json(announcement);
}

async function deleteAnnouncementCore(id: string, userId?: string | null, organizationId?: string) {
  const announcement = await prisma.announcement.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
  });
  if (!announcement) throw new AppError("Announcement not found", 404);
  await prisma.announcement.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "ANNOUNCEMENT_DELETED",
    entityType: "Announcement",
    entityId: id,
    metadata: { title: announcement.title },
  });
}

export async function deleteAnnouncement(req: Request, res: Response) {
  await deleteAnnouncementCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function bulkDeleteAnnouncements(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteAnnouncementCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}

// ---------------------------------------------------------------------------
// Customer-side
// ---------------------------------------------------------------------------

export async function listMyAnnouncements(req: Request, res: Response) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: req.customer!.sub },
    select: { organizationId: true },
  });
  const items = await prisma.announcement.findMany({
    where: {
      organizationId: customer.organizationId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });
  res.json({ items });
}
