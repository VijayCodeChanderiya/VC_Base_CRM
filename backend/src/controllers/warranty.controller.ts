import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { assertCustomerInOrg, resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";
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

  const organizationId = resolveOrgFilterMode(req);
  const where = organizationId ? { customer: { organizationId } } : {};

  const [items, total] = await Promise.all([
    prisma.warrantyClaim.findMany({
      where,
      include: {
        customer: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
        imeiRecord: { include: { product: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, WARRANTY_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.warrantyClaim.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function createWarrantyClaim(req: Request, res: Response) {
  const data = warrantySchema.parse(req.body);
  await assertCustomerInOrg(data.customerId, req.user!.organizationId!);
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
  const existing = await prisma.warrantyClaim.findFirst({
    where: { id: req.params.id, customer: { organizationId: req.user!.organizationId! } },
  });
  if (!existing) throw new AppError("Warranty claim not found", 404);
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

export async function deleteWarrantyClaimCore(id: string, userId?: string | null, organizationId?: string) {
  const claim = await prisma.warrantyClaim.findFirst({
    where: { id, ...(organizationId ? { customer: { organizationId } } : {}) },
  });
  if (!claim) throw new AppError("Warranty claim not found", 404);

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
  await deleteWarrantyClaimCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteWarrantyClaims(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteWarrantyClaimCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}
