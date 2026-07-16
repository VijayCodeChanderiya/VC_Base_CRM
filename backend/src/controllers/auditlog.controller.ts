import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { parseSortOrder } from "@/utils/sort";

const AUDIT_LOG_SORT_FIELDS: Record<string, Prisma.AuditLogOrderByWithRelationInput> = {
  createdAt: { createdAt: "asc" },
  user: { user: { name: "asc" } },
  action: { action: "asc" },
  entity: { entityType: "asc" },
};

export async function listAuditLogs(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 50);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, AUDIT_LOG_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.auditLog.count(),
  ]);

  res.json({ items, total, page, pageSize });
}
