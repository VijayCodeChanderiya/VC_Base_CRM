import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { notifyAdmins } from "@/utils/notify";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const returnItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  refundAmt: z.number().nonnegative().default(0),
});

const returnSchema = z.object({
  saleId: z.string().uuid(),
  type: z.enum(["RETURN", "REFUND", "REPLACEMENT"]),
  reason: z.string().optional(),
  items: z.array(returnItemSchema).min(1),
});

const RETURN_SORT_FIELDS: Record<string, Prisma.ReturnOrderByWithRelationInput> = {
  invoice: { sale: { invoiceNumber: "asc" } },
  customer: { customer: { name: "asc" } },
  type: { type: "asc" },
  status: { status: "asc" },
  reason: { reason: "asc" },
};

export async function listReturns(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const organizationId = resolveOrgFilterMode(req);
  const where = organizationId ? { customer: { organizationId } } : {};

  const [items, total] = await Promise.all([
    prisma.return.findMany({
      where,
      include: {
        customer: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
        sale: true,
        items: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, RETURN_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.return.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getReturn(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const rec = await prisma.return.findFirst({
    where: { id: req.params.id, ...(organizationId ? { customer: { organizationId } } : {}) },
    include: {
      customer: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
      sale: true,
      items: { include: { saleItem: { include: { product: true, imei: true } } } },
    },
  });
  if (!rec) throw new AppError("Return not found", 404);
  res.json(rec);
}

export async function createReturn(req: Request, res: Response) {
  const data = returnSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;

  const sale = await prisma.sale.findFirst({
    where: { id: data.saleId, branch: { organizationId } },
    include: { items: true },
  });
  if (!sale) throw new AppError("Sale not found", 404);
  const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));

  for (const item of data.items) {
    const saleItem = saleItemMap.get(item.saleItemId);
    if (!saleItem) {
      throw new AppError(`Sale item ${item.saleItemId} not part of this sale`, 422);
    }
    if (item.quantity > saleItem.quantity) {
      throw new AppError(`Return quantity exceeds sold quantity for item ${item.saleItemId}`, 422);
    }
  }

  const rec = await prisma.return.create({
    data: {
      saleId: data.saleId,
      customerId: sale.customerId,
      type: data.type,
      reason: data.reason,
      status: "PENDING",
      items: {
        create: data.items.map((i) => ({
          saleItemId: i.saleItemId,
          quantity: i.quantity,
          refundAmt: i.refundAmt,
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "RETURN_CREATED",
    entityType: "Return",
    entityId: rec.id,
    metadata: { type: data.type, saleId: data.saleId },
  });

  await notifyAdmins(prisma, {
    type: "INFO",
    title: "New return request",
    message: `${data.type} request submitted for sale ${sale.id.slice(0, 8)} (${data.items.length} item(s)).`,
  });

  res.status(201).json(rec);
}

export async function approveReturn(req: Request, res: Response) {
  const userId = req.user!.sub;

  const rec = await prisma.return.findFirst({
    where: { id: req.params.id, customer: { organizationId: req.user!.organizationId! } },
    include: {
      sale: true,
      items: { include: { saleItem: { include: { product: true, imei: true } } } },
    },
  });
  if (!rec) throw new AppError("Return not found", 404);

  if (rec.status !== "PENDING") {
    throw new AppError("Only pending returns can be approved", 409);
  }

  const branchId = rec.sale.branchId;

  await prisma.$transaction(async (tx) => {
    for (const item of rec.items) {
      const product = item.saleItem.product;

      if (product.hasImei && item.saleItem.imei) {
        await tx.imeiRecord.update({
          where: { id: item.saleItem.imei.id },
          data: { status: "RETURNED" },
        });
      } else if (!product.hasImei) {
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: product.id, branchId } },
          create: { productId: product.id, branchId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: product.id,
            type: "RETURN_IN",
            quantity: item.quantity,
            reference: `RETURN:${rec.id}`,
            branchId,
          },
        });
      }
    }

    await tx.return.update({
      where: { id: rec.id },
      data: { status: "COMPLETED" },
    });

    await logAudit(tx, {
      userId,
      action: "RETURN_APPROVED",
      entityType: "Return",
      entityId: rec.id,
      metadata: { type: rec.type },
    });
  });

  const full = await prisma.return.findUniqueOrThrow({
    where: { id: rec.id },
    include: { items: { include: { saleItem: { include: { product: true } } } } },
  });
  res.json(full);
}

export async function rejectReturn(req: Request, res: Response) {
  const userId = req.user!.sub;
  const rec = await prisma.return.findFirst({
    where: { id: req.params.id, customer: { organizationId: req.user!.organizationId! } },
  });
  if (!rec) throw new AppError("Return not found", 404);

  if (rec.status !== "PENDING") {
    throw new AppError("Only pending returns can be rejected", 409);
  }

  const updated = await prisma.return.update({
    where: { id: rec.id },
    data: { status: "REJECTED" },
  });

  await logAudit(prisma, {
    userId,
    action: "RETURN_REJECTED",
    entityType: "Return",
    entityId: rec.id,
  });

  res.json(updated);
}

export async function deleteReturnCore(id: string, userId?: string | null, organizationId?: string) {
  const rec = await prisma.return.findFirst({
    where: { id, ...(organizationId ? { customer: { organizationId } } : {}) },
  });
  if (!rec) throw new AppError("Return not found", 404);

  await prisma.returnItem.deleteMany({ where: { returnId: id } });
  await prisma.return.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "RETURN_DELETED",
    entityType: "Return",
    entityId: id,
    metadata: { type: rec.type, saleId: rec.saleId },
  });
}

export async function deleteReturn(req: Request, res: Response) {
  await deleteReturnCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteReturns(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteReturnCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}
