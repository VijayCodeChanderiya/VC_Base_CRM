import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";

const WARRANTY_SORT_FIELDS: Record<string, Prisma.WarrantyClaimOrderByWithRelationInput> = {
  customer: { customer: { name: "asc" } },
  product: { imeiRecord: { product: { name: "asc" } } },
  description: { description: "asc" },
  status: { status: "asc" },
};

const warrantySchema = z.object({
  customerId: z.string().uuid(),
  imeiRecordId: z.string().uuid().optional(),
  saleItemId: z.string().uuid().optional(),
  description: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "EXPIRED", "CLAIMED", "VOID"]),
  resolution: z.string().optional(),
});

export async function listWarrantyClaims(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);

  const [items, total] = await Promise.all([
    prisma.warrantyClaim.findMany({
      include: { customer: true, imeiRecord: { include: { product: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, WARRANTY_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.warrantyClaim.count(),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function createWarrantyClaim(req: Request, res: Response) {
  const data = warrantySchema.parse(req.body);
  const claim = await prisma.warrantyClaim.create({
    data: { ...data, status: "ACTIVE" },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "WARRANTY_CLAIM_CREATED",
    entityType: "WarrantyClaim",
    entityId: claim.id,
  });

  res.status(201).json(claim);
}

export async function updateWarrantyClaim(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);
  const claim = await prisma.warrantyClaim.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      resolution: data.resolution,
      resolvedDate: ["CLAIMED", "VOID", "EXPIRED"].includes(data.status) ? new Date() : undefined,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "WARRANTY_CLAIM_UPDATED",
    entityType: "WarrantyClaim",
    entityId: claim.id,
    metadata: { status: data.status },
  });

  res.json(claim);
}

export async function deleteWarrantyClaimCore(id: string, userId?: string | null) {
  const claim = await prisma.warrantyClaim.findUniqueOrThrow({ where: { id } });

  await prisma.warrantyClaim.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "WARRANTY_CLAIM_DELETED",
    entityType: "WarrantyClaim",
    entityId: id,
    metadata: { status: claim.status, customerId: claim.customerId },
  });
}

export async function deleteWarrantyClaim(req: Request, res: Response) {
  await deleteWarrantyClaimCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteWarrantyClaims(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteWarrantyClaimCore(id, userId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}
