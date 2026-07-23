import { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { resolveBranchId } from "@/utils/branch";
import { assertSupplierInOrg, resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";
import { parseSortOrder } from "@/utils/sort";
import { loadWorkbookSheet, mapRowByHeader, cellToString } from "@/utils/bulkUpload";

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
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { branch: { organizationId } } : {}),
    ...(branchId ? { branchId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: {
        supplier: true,
        branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
        items: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, PURCHASE_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.purchase.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getPurchase(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const purchase = await prisma.purchase.findFirst({
    where: { id: req.params.id, ...(organizationId ? { branch: { organizationId } } : {}) },
    include: {
      supplier: true,
      branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
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
  if (!purchase) throw new AppError("Purchase not found", 404);
  res.json(purchase);
}

async function createPurchaseCore(
  data: z.infer<typeof purchaseSchema>,
  userId: string,
  organizationId: string
) {
  const branchId = await resolveBranchId(organizationId, data.branchId);
  await assertSupplierInOrg(data.supplierId, organizationId);

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
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, organizationId } });
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

  return full;
}

export async function createPurchase(req: Request, res: Response) {
  const data = purchaseSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;
  const full = await createPurchaseCore(data, userId, organizationId);
  res.status(201).json(full);
}

export async function deletePurchaseCore(id: string, userId?: string | null, organizationId?: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { id, ...(organizationId ? { branch: { organizationId } } : {}) },
    include: { items: { include: { imeiRecords: true, product: true } } },
  });
  if (!purchase) throw new AppError("Purchase not found", 404);

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
  await deletePurchaseCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeletePurchases(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deletePurchaseCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete purchase" });
    }
  }

  res.json({ deleted, failed });
}

// ---------------------------------------------------------------------------
// Bulk upload — same convention as Sales: each row is one line item tagged
// with a shared "PO Ref"; rows sharing the same ref group into one Purchase.
// Reuses createPurchaseCore (same stock/inventory logic as the single-record
// create form) per group.
// ---------------------------------------------------------------------------

export const purchaseUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const PURCHASE_TEMPLATE_COLUMNS: { header: string; key: string; match: (h: string) => boolean }[] = [
  { header: "PO Ref", key: "reference", match: (h) => h.includes("poref") || h === "reference" || h === "ref" },
  { header: "Supplier Phone", key: "supplierPhone", match: (h) => h.includes("supplierphone") || h === "phone" },
  { header: "Invoice Number", key: "invoiceNumber", match: (h) => h.includes("invoicenumber") },
  { header: "Purchase Date (YYYY-MM-DD)", key: "purchaseDate", match: (h) => h.includes("purchasedate") },
  { header: "Product SKU", key: "productSku", match: (h) => h.includes("productsku") || h === "sku" },
  { header: "Quantity", key: "quantity", match: (h) => h === "quantity" || h === "qty" },
  { header: "Unit Cost", key: "unitCost", match: (h) => h.includes("unitcost") },
  { header: "Tax Percent", key: "taxPercent", match: (h) => h.includes("taxpercent") },
];

const PURCHASE_SAMPLE_ROWS = [
  {
    reference: "PO-SAMPLE-1",
    supplierPhone: "9876543210",
    invoiceNumber: "SUP-INV-001",
    purchaseDate: "",
    productSku: "SKU-001",
    quantity: "10",
    unitCost: "900",
    taxPercent: "18",
  },
  {
    reference: "PO-SAMPLE-1",
    supplierPhone: "9876543210",
    invoiceNumber: "",
    purchaseDate: "",
    productSku: "SKU-002",
    quantity: "5",
    unitCost: "300",
    taxPercent: "18",
  },
];

async function buildPurchaseTemplateWorkbook(withSample: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Purchases");
  sheet.columns = PURCHASE_TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  if (withSample) {
    for (const row of PURCHASE_SAMPLE_ROWS) sheet.addRow(row);
    sheet.addRow({});
    sheet.addRow({
      reference:
        "Rows sharing the same PO Ref become one purchase with multiple items. Delete the example rows above before uploading your own data.",
    });
  }
  return workbook;
}

export async function downloadPurchaseBulkTemplate(req: Request, res: Response) {
  const withSample = req.query.sample === "1";
  const workbook = await buildPurchaseTemplateWorkbook(withSample);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${withSample ? "Purchases sample file" : "Purchases bulk upload template"}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}

interface PurchaseBulkRow {
  rowNumber: number;
  reference: string;
  supplierPhone: string;
  invoiceNumber?: string;
  purchaseDate?: string;
  productSku: string;
  quantity?: string;
  unitCost?: string;
  taxPercent?: string;
}

export async function bulkUploadPurchasesFromExcel(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No file uploaded", 422);
  }
  const organizationId = req.user!.organizationId!;
  const userId = req.user!.sub;
  const sheet = await loadWorkbookSheet(req.file.buffer);

  const headerRow = sheet.getRow(1);
  const columnIndex = mapRowByHeader(headerRow, PURCHASE_TEMPLATE_COLUMNS);

  if (!columnIndex.reference || !columnIndex.supplierPhone || !columnIndex.productSku) {
    throw new AppError(
      'Could not find "PO Ref", "Supplier Phone" and "Product SKU" columns in the uploaded file',
      422
    );
  }

  const get = (row: ExcelJS.Row, key: string) => (columnIndex[key] ? cellToString(row.getCell(columnIndex[key]).value) : "");

  const rawRows: PurchaseBulkRow[] = [];
  for (const row of sheet.getRows(2, Math.max(0, sheet.rowCount - 1)) ?? []) {
    const reference = get(row, "reference");
    const productSku = get(row, "productSku");
    if (!reference && !productSku) continue;
    rawRows.push({
      rowNumber: row.number,
      reference,
      supplierPhone: get(row, "supplierPhone"),
      invoiceNumber: get(row, "invoiceNumber") || undefined,
      purchaseDate: get(row, "purchaseDate") || undefined,
      productSku,
      quantity: get(row, "quantity") || undefined,
      unitCost: get(row, "unitCost") || undefined,
      taxPercent: get(row, "taxPercent") || undefined,
    });
  }

  if (rawRows.length === 0) {
    throw new AppError("No purchase rows found in the uploaded file", 422);
  }

  const groups = new Map<string, PurchaseBulkRow[]>();
  for (const r of rawRows) {
    const key = r.reference || `__row_${r.rowNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const phones = [...new Set(rawRows.map((r) => r.supplierPhone).filter(Boolean))];
  const skus = [...new Set(rawRows.map((r) => r.productSku).filter(Boolean))];
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({ where: { organizationId, phone: { in: phones } } }),
    prisma.product.findMany({ where: { organizationId, sku: { in: skus } } }),
  ]);
  const supplierByPhone = new Map(suppliers.map((s) => [s.phone, s]));
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const created: string[] = [];
  const failed: { reference: string; rows: number[]; reason: string }[] = [];

  for (const [key, rows] of groups) {
    const rowNumbers = rows.map((r) => r.rowNumber);
    const label = key.startsWith("__row_") ? `(row ${rowNumbers[0]}, no PO Ref)` : key;
    try {
      const first = rows[0];
      const supplier = supplierByPhone.get(first.supplierPhone);
      if (!supplier) {
        throw new AppError(`Supplier with phone "${first.supplierPhone}" not found in your organization`, 404);
      }

      const items = rows.map((r) => {
        const product = productBySku.get(r.productSku);
        if (!product) {
          throw new AppError(`Product with SKU "${r.productSku}" not found in your organization`, 404);
        }
        return {
          productId: product.id,
          quantity: r.quantity ? Number(r.quantity) : 1,
          unitCost: r.unitCost ? Number(r.unitCost) : Number(product.costPrice),
          taxPercent: r.taxPercent ? Number(r.taxPercent) : Number(product.taxPercent),
        };
      });

      const data = purchaseSchema.parse({
        supplierId: supplier.id,
        invoiceNumber: first.invoiceNumber,
        purchaseDate: first.purchaseDate,
        items,
      });

      const purchase = await createPurchaseCore(data, userId, organizationId);
      created.push(purchase.purchaseNumber);
    } catch (err) {
      failed.push({
        reference: label,
        rows: rowNumbers,
        reason:
          err instanceof z.ZodError
            ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            : err instanceof AppError
              ? err.message
              : "Failed to create purchase",
      });
    }
  }

  res.status(201).json({ totalRecords: groups.size, created, failed });
}
