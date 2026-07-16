import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { notifyAdmins } from "@/utils/notify";
import { resolveBranchId } from "@/utils/branch";
import { imeiSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";

const SALE_SORT_FIELDS: Record<string, Prisma.SaleOrderByWithRelationInput> = {
  invoiceNumber: { invoiceNumber: "asc" },
  customer: { customer: { name: "asc" } },
  status: { status: "asc" },
  grandTotal: { grandTotal: "asc" },
};

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative(),
  taxPercent: z.number().min(0).max(100).default(0),
  imei: imeiSchema.optional(), // required for IMEI-tracked products, quantity must be 1
});

const saleSchema = z.object({
  customerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  items: z.array(saleItemSchema).min(1),
  discountTotal: z.number().nonnegative().default(0),
  gstType: z.enum(["INTRA_STATE", "INTER_STATE"]).default("INTRA_STATE"),
  placeOfSupply: z.string().optional(),
});

function lineTotal(unitPrice: number, quantity: number, taxPercent: number) {
  const base = unitPrice * quantity;
  return base + base * (taxPercent / 100);
}

function gstSplit(base: number, taxPercent: number, gstType: "INTRA_STATE" | "INTER_STATE") {
  const taxAmount = base * (taxPercent / 100);
  if (gstType === "INTER_STATE") {
    return { cgst: 0, sgst: 0, igst: taxAmount };
  }
  const half = taxAmount / 2;
  return { cgst: half, sgst: half, igst: 0 };
}

async function nextInvoiceNumber(): Promise<string> {
  const count = await prisma.sale.count();
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function listSales(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const branchId = req.query.branchId as string | undefined;

  const where = branchId ? { branchId } : {};

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { customer: true, branch: true, items: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, SALE_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getSale(req: Request, res: Response) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      customer: true,
      branch: true,
      user: { select: { id: true, name: true, email: true } },
      items: { include: { product: true, imei: true } },
      payments: true,
    },
  });
  res.json(sale);
}

export async function createSale(req: Request, res: Response) {
  const data = saleSchema.parse(req.body);
  const userId = req.user!.sub;
  const branchId = await resolveBranchId(data.branchId);

  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const [products, inventories] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } } }),
    prisma.inventory.findMany({ where: { productId: { in: productIds }, branchId } }),
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const inventoryMap = new Map(inventories.map((i) => [i.productId, i]));

  for (const item of data.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new AppError(`Product ${item.productId} not found`, 404);
    }
    if (product.hasImei) {
      if (!item.imei) {
        throw new AppError(`IMEI is required for product ${product.name}`, 422);
      }
      if (item.quantity !== 1) {
        throw new AppError(`IMEI-tracked product ${product.name} must be sold one unit at a time`, 422);
      }
    } else {
      const inventory = inventoryMap.get(item.productId);
      if (!inventory || inventory.quantity < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${product.name} at this branch (available: ${inventory?.quantity ?? 0})`,
          409
        );
      }
    }
  }

  let subtotal = 0;
  let taxTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  const computedItems = data.items.map((item) => {
    const base = item.unitPrice * item.quantity;
    const tax = base * (item.taxPercent / 100);
    const split = gstSplit(base, item.taxPercent, data.gstType);
    subtotal += base;
    taxTotal += tax;
    cgstTotal += split.cgst;
    sgstTotal += split.sgst;
    igstTotal += split.igst;
    return { ...item, total: base + tax, ...split };
  });
  const grandTotal = subtotal + taxTotal - data.discountTotal;

  const invoiceNumber = await nextInvoiceNumber();

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        invoiceNumber,
        customerId: data.customerId,
        userId,
        branchId,
        status: "CONFIRMED",
        gstType: data.gstType,
        placeOfSupply: data.placeOfSupply,
        subtotal,
        taxTotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        discountTotal: data.discountTotal,
        grandTotal,
      },
    });

    for (const item of computedItems) {
      const product = productMap.get(item.productId)!;

      const saleItem = await tx.saleItem.create({
        data: {
          saleId: created.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          hsnCode: product.hsnCode,
          cgstAmount: item.cgst,
          sgstAmount: item.sgst,
          igstAmount: item.igst,
          lineTotal: lineTotal(item.unitPrice, item.quantity, item.taxPercent),
        },
      });

      if (product.hasImei) {
        // Atomically claim the IMEI only if it is still IN_STOCK at this branch — prevents double-sell races.
        const result = await tx.imeiRecord.updateMany({
          where: { imei: item.imei!, productId: item.productId, branchId, status: "IN_STOCK" },
          data: { status: "SOLD", saleItemId: saleItem.id },
        });
        if (result.count === 0) {
          throw new AppError(`IMEI ${item.imei} is not available for sale at this branch`, 409);
        }
      } else {
        // Atomically decrement only if enough stock remains — prevents going below zero under concurrency.
        const result = await tx.inventory.updateMany({
          where: { productId: item.productId, branchId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw new AppError(`Insufficient stock for ${product.name} at this branch`, 409);
        }
        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            type: "SALE_OUT",
            quantity: -item.quantity,
            reference: invoiceNumber,
            branchId,
          },
        });

        const updatedInventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId } },
        });
        if (updatedInventory && updatedInventory.quantity <= product.reorderLevel) {
          await notifyAdmins(tx, {
            type: "WARNING",
            title: "Low stock alert",
            message: `${product.name} (${product.sku}) is at ${updatedInventory.quantity} units, at or below reorder level ${product.reorderLevel}.`,
          });
        }
      }
    }

    await logAudit(tx, {
      userId,
      action: "SALE_CREATED",
      entityType: "Sale",
      entityId: created.id,
      metadata: { invoiceNumber, grandTotal, branchId },
    });

    return created;
  });

  const full = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: { include: { product: true, imei: true } }, customer: true, branch: true },
  });

  res.status(201).json(full);
}

export async function deleteSaleCore(id: string, userId?: string | null) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { imei: true } } },
  });

  const saleItemIds = sale.items.map((item) => item.id);

  const [returnCount, warrantyClaimCount] = await Promise.all([
    prisma.return.count({ where: { saleId: sale.id } }),
    saleItemIds.length
      ? prisma.warrantyClaim.count({ where: { saleItemId: { in: saleItemIds } } })
      : Promise.resolve(0),
  ]);

  if (returnCount > 0 || warrantyClaimCount > 0) {
    const parts: string[] = [];
    if (returnCount > 0) parts.push(`${returnCount} return(s)`);
    if (warrantyClaimCount > 0) parts.push(`${warrantyClaimCount} warranty claim(s)`);
    throw new AppError(`Cannot delete sale: ${parts.join(" and ")} reference it`, 409);
  }

  await prisma.$transaction(async (tx) => {
    for (const saleItem of sale.items) {
      if (saleItem.imei) {
        await tx.imeiRecord.update({
          where: { id: saleItem.imei.id },
          data: { status: "IN_STOCK", saleItemId: null },
        });
      } else {
        await tx.inventory.update({
          where: { productId_branchId: { productId: saleItem.productId, branchId: sale.branchId } },
          data: { quantity: { increment: saleItem.quantity } },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: saleItem.productId,
            type: "ADJUSTMENT",
            quantity: saleItem.quantity,
            reference: `REVERSAL:${sale.invoiceNumber}`,
            branchId: sale.branchId,
          },
        });
      }
    }

    await tx.payment.deleteMany({ where: { saleId: sale.id } });
    await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.delete({ where: { id: sale.id } });

    await logAudit(tx, {
      userId,
      action: "SALE_DELETED",
      entityType: "Sale",
      entityId: sale.id,
      metadata: { invoiceNumber: sale.invoiceNumber, grandTotal: sale.grandTotal },
    });
  });
}

export async function deleteSale(req: Request, res: Response) {
  await deleteSaleCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteSales(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteSaleCore(id, userId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete sale" });
    }
  }

  res.json({ deleted, failed });
}
