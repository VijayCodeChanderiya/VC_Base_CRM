import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { resolveBranchId } from "@/utils/branch";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const RMA_SORT_FIELDS: Record<string, Prisma.RmaOrderByWithRelationInput> = {
  device: { imeiRecord: { imei: "asc" } },
  supplier: { supplier: { name: "asc" } },
  reason: { reason: "asc" },
  status: { status: "asc" },
};

const rmaCreateSchema = z.object({
  imeiRecordId: z.string().uuid(),
  supplierId: z.string().uuid(),
  reason: z.string().min(1),
  branchId: z.string().uuid().optional(),
});

const rmaResolveSchema = z.object({
  status: z.enum(["REPLACED", "REPAIRED", "REJECTED"]),
  replacementImeiRecordId: z.string().optional(),
  notes: z.string().optional(),
});

export async function listRmas(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;
  const organizationId = resolveOrgFilterMode(req);

  const where = { ...(organizationId ? { branch: { organizationId } } : {}), ...(status ? { status: status as never } : {}) };

  const [items, total] = await Promise.all([
    prisma.rma.findMany({
      where,
      include: {
        imeiRecord: { include: { product: true } },
        supplier: true,
        branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, RMA_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.rma.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function createRma(req: Request, res: Response) {
  const data = rmaCreateSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const branchId = await resolveBranchId(organizationId, data.branchId);
  const userId = req.user!.sub;

  const imei = await prisma.imeiRecord.findFirst({
    where: { id: data.imeiRecordId, branch: { organizationId } },
  });
  if (!imei) throw new AppError("IMEI not found", 404);
  if (imei.status === "RMA") {
    throw new AppError("An RMA is already open for this IMEI", 409);
  }

  const [rma] = await prisma.$transaction([
    prisma.rma.create({
      data: {
        imeiRecordId: data.imeiRecordId,
        supplierId: data.supplierId,
        reason: data.reason,
        branchId,
        status: "REQUESTED",
      },
      include: { imeiRecord: { include: { product: true } }, supplier: true },
    }),
    prisma.imeiRecord.update({ where: { id: data.imeiRecordId }, data: { status: "RMA" } }),
  ]);

  await logAudit(prisma, {
    userId,
    action: "RMA_CREATED",
    entityType: "Rma",
    entityId: rma.id,
    metadata: { imei: imei.imei, supplierId: data.supplierId },
  });

  res.status(201).json(rma);
}

export async function shipRma(req: Request, res: Response) {
  const rma = await prisma.rma.findUniqueOrThrow({ where: { id: req.params.id } });
  if (rma.status !== "REQUESTED") {
    throw new AppError("Only requested RMAs can be shipped", 409);
  }

  const updated = await prisma.rma.update({
    where: { id: rma.id },
    data: { status: "SHIPPED_TO_SUPPLIER", shippedDate: new Date() },
  });

  res.json(updated);
}

export async function receiveRma(req: Request, res: Response) {
  const rma = await prisma.rma.findUniqueOrThrow({ where: { id: req.params.id } });
  if (rma.status !== "SHIPPED_TO_SUPPLIER") {
    throw new AppError("Only shipped RMAs can be marked as received by supplier", 409);
  }

  const updated = await prisma.rma.update({
    where: { id: rma.id },
    data: { status: "RECEIVED_BY_SUPPLIER" },
  });

  res.json(updated);
}

export async function resolveRma(req: Request, res: Response) {
  const data = rmaResolveSchema.parse(req.body);
  const userId = req.user!.sub;

  const rma = await prisma.rma.findUniqueOrThrow({ where: { id: req.params.id } });
  if (rma.status !== "RECEIVED_BY_SUPPLIER" && rma.status !== "SHIPPED_TO_SUPPLIER") {
    throw new AppError("RMA must be shipped or received by supplier before it can be resolved", 409);
  }

  const imeiStatus = data.status === "REPAIRED" ? "IN_STOCK" : "DEFECTIVE";

  const [updated] = await prisma.$transaction([
    prisma.rma.update({
      where: { id: rma.id },
      data: {
        status: data.status,
        resolvedDate: new Date(),
        replacementImeiRecordId: data.replacementImeiRecordId,
        notes: data.notes,
      },
    }),
    prisma.imeiRecord.update({ where: { id: rma.imeiRecordId }, data: { status: imeiStatus } }),
  ]);

  await logAudit(prisma, {
    userId,
    action: "RMA_RESOLVED",
    entityType: "Rma",
    entityId: rma.id,
    metadata: { status: data.status },
  });

  res.json(updated);
}

export async function deleteRmaCore(id: string, userId?: string | null, organizationId?: string) {
  const rma = await prisma.rma.findFirst({
    where: { id, ...(organizationId ? { branch: { organizationId } } : {}) },
    include: { imeiRecord: true },
  });
  if (!rma) throw new AppError("RMA not found", 404);

  await prisma.$transaction(async (tx) => {
    if (rma.imeiRecord.status === "RMA") {
      await tx.imeiRecord.update({ where: { id: rma.imeiRecordId }, data: { status: "IN_STOCK" } });
    }

    await tx.rma.delete({ where: { id } });

    await logAudit(tx, {
      userId,
      action: "RMA_DELETED",
      entityType: "Rma",
      entityId: id,
      metadata: { imei: rma.imeiRecord.imei, supplierId: rma.supplierId, status: rma.status },
    });
  });
}

export async function deleteRma(req: Request, res: Response) {
  await deleteRmaCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteRmas(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteRmaCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}
