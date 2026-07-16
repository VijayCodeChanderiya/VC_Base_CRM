import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { resolveBranchId } from "@/utils/branch";
import { parseSortOrder } from "@/utils/sort";

const PURCHASE_SORT_FIELDS: Record<string, Prisma.PurchaseOrderByWithRelationInput> = {
  purchaseNumber: { purchaseNumber: "asc" },
  invoiceNumber: { invoiceNumber: "asc" },
  purchaseDate: { purchaseDate: "asc" },
  supplier: { supplier: { name: "asc" } },
  status: { status: "asc" },
  grandTotal: { grandTotal: "asc" },
};

const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
  taxPercent: z.number().min(0).max(100).default(0),
});

const purchaseSchema = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  invoiceNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

async function nextPurchaseNumber(): Promise<string> {
  const count = await prisma.purchase.count();
  const year = new Date().getFullYear();
  return `PO-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listPurchases(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const branchId = req.query.branchId as string | undefined;

  const where = branchId ? { branchId } : {};

  const [items, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: { supplier: true, branch: true, items: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, PURCHASE_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.purchase.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getPurchase(req: Request, res: Response) {
  const purchase = await prisma.purchase.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      supplier: true,
      branch: true,
      user: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: true,
          imeiRecords: {
            include: {
              saleItem: { include: { sale: { include: { customer: true } } } },
            },
          },
        },
      },
      payments: true,
    },
  });
  res.json(purchase);
}

export async function createPurchase(req: Request, res: Response) {
  const data = purchaseSchema.parse(req.body);
  const userId = req.user!.sub;
  const branchId = await resolveBranchId(data.branchId);

  let purchaseDate: Date | undefined;
  if (data.purchaseDate) {
    const parsedDate = new Date(data.purchaseDate);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new AppError("Invalid purchase date", 422);
    }
    if (parsedDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new AppError("Purchase date cannot be in the future", 422);
    }
    purchaseDate = parsedDate;
  }

  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of data.items) {
    if (!productMap.has(item.productId)) {
      throw new AppError(`Product ${item.productId} not found`, 404);
    }
  }

  let subtotal = 0;
  let taxTotal = 0;
  for (const item of data.items) {
    const base = item.unitCost * item.quantity;
    subtotal += base;
    taxTotal += base * (item.taxPercent / 100);
  }
  const grandTotal = subtotal + taxTotal;
  const purchaseNumber = await nextPurchaseNumber();

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        purchaseNumber,
        supplierId: data.supplierId,
        userId,
        branchId,
        status: "RECEIVED",
        invoiceNumber: data.invoiceNumber,
        purchaseDate,
        subtotal,
        taxTotal,
        grandTotal,
      },
    });

    for (const item of data.items) {
      const product = productMap.get(item.productId)!;
      const lineTotal = item.unitCost * item.quantity * (1 + item.taxPercent / 100);

      const purchaseItem = await tx.purchaseItem.create({
        data: {
          purchaseId: created.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          taxPercent: item.taxPercent,
          lineTotal,
        },
      });

      if (!product.hasImei) {
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: item.productId, branchId } },
          create: { productId: item.productId, branchId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            type: "PURCHASE_IN",
            quantity: item.quantity,
            reference: purchaseNumber,
            branchId,
          },
        });
      }
    }

    await logAudit(tx, {
      userId,
      action: "PURCHASE_RECEIVED",
      entityType: "Purchase",
      entityId: created.id,
      metadata: { purchaseNumber, grandTotal, branchId },
    });

    return created;
  });

  const full = await prisma.purchase.findUniqueOrThrow({
    where: { id: purchase.id },
    include: { items: { include: { product: true, imeiRecords: true } }, supplier: true, branch: true },
  });

  res.status(201).json(full);
}

export async function deletePurchaseCore(id: string, userId?: string | null) {
  const purchase = await prisma.purchase.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { imeiRecords: true, product: true } } },
  });

  const nonInStock = purchase.items.some((item) =>
    item.imeiRecords.some((rec) => rec.status !== "IN_STOCK")
  );
  if (nonInStock) {
    throw new AppError(
      "Cannot delete purchase: some received IMEIs have already been sold or moved (RMA/etc) — cannot safely reverse",
      409
    );
  }

  const nonImeiItems = purchase.items.filter((item) => !item.product.hasImei);
  if (nonImeiItems.length > 0) {
    const inventories = await prisma.inventory.findMany({
      where: {
        branchId: purchase.branchId,
        productId: { in: nonImeiItems.map((item) => item.productId) },
      },
    });
    const inventoryMap = new Map(inventories.map((inv) => [inv.productId, inv]));
    for (const item of nonImeiItems) {
      const inventory = inventoryMap.get(item.productId);
      const remaining = (inventory?.quantity ?? 0) - item.quantity;
      if (remaining < 0) {
        throw new AppError(
          "Cannot delete purchase: stock from this purchase has already been partially sold elsewhere",
          409
        );
      }
    }
  }

  const itemIds = purchase.items.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    await tx.imeiRecord.deleteMany({ where: { purchaseItemId: { in: itemIds } } });

    for (const item of nonImeiItems) {
      await tx.inventory.update({
        where: { productId_branchId: { productId: item.productId, branchId: purchase.branchId } },
        data: { quantity: { decrement: item.quantity } },
      });
      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          type: "ADJUSTMENT",
          quantity: -item.quantity,
          reference: `REVERSAL:${purchase.purchaseNumber}`,
          branchId: purchase.branchId,
        },
      });
    }

    await tx.payment.deleteMany({ where: { purchaseId: purchase.id } });
    await tx.purchaseItem.deleteMany({ where: { purchaseId: purchase.id } });
    await tx.purchase.delete({ where: { id: purchase.id } });

    await logAudit(tx, {
      userId,
      action: "PURCHASE_DELETED",
      entityType: "Purchase",
      entityId: purchase.id,
      metadata: { purchaseNumber: purchase.purchaseNumber, grandTotal: purchase.grandTotal },
    });
  });
}

export async function deletePurchase(req: Request, res: Response) {
  await deletePurchaseCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeletePurchases(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deletePurchaseCore(id, userId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete purchase" });
    }
  }

  res.json({ deleted, failed });
}
