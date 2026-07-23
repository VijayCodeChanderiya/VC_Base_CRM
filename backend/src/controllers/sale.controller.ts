import { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { notifyAdmins } from "@/utils/notify";
import { resolveBranchId } from "@/utils/branch";
import { assertCustomerInOrg, resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";
import { imeiSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";
import { loadWorkbookSheet, mapRowByHeader, cellToString } from "@/utils/bulkUpload";

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
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { branch: { organizationId } } : {}),
    ...(branchId ? { branchId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { customer: true, branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } }, items: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, SALE_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getSale(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, ...(organizationId ? { branch: { organizationId } } : {}) },
    include: {
      customer: true,
      branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
      user: { select: { id: true, name: true, email: true } },
      items: { include: { product: true, imei: true } },
      payments: true,
    },
  });
  if (!sale) throw new AppError("Sale not found", 404);
  res.json(sale);
}

async function createSaleCore(
  data: z.infer<typeof saleSchema>,
  userId: string,
  organizationId: string
) {
  const branchId = await resolveBranchId(organizationId, data.branchId);
  await assertCustomerInOrg(data.customerId, organizationId);

  const productIds = [...new Set(data.items.map((i) => i.productId))];
  const [products, inventories] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds }, organizationId } }),
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

  return full;
}

export async function createSale(req: Request, res: Response) {
  const data = saleSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;
  const full = await createSaleCore(data, userId, organizationId);
  res.status(201).json(full);
}

export async function deleteSaleCore(id: string, userId?: string | null, organizationId?: string) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { imei: true } }, branch: true },
  });
  if (organizationId && sale.branch.organizationId !== organizationId) {
    throw new AppError("Sale not found", 404);
  }

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
  await deleteSaleCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteSales(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteSaleCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete sale" });
    }
  }

  res.json({ deleted, failed });
}

// ---------------------------------------------------------------------------
// Bulk upload — a Sale is a variable-length cart, not a flat form, so each
// spreadsheet row is one line item tagged with a shared "Invoice Ref"; rows
// sharing the same ref are grouped into one Sale. Reuses createSaleCore (the
// same pricing/GST/stock logic as the single-record create form) per group.
// ---------------------------------------------------------------------------

export const saleUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const SALE_TEMPLATE_COLUMNS: { header: string; key: string; match: (h: string) => boolean }[] = [
  { header: "Invoice Ref", key: "reference", match: (h) => h.includes("invoiceref") || h === "reference" || h === "ref" },
  { header: "Customer Phone", key: "customerPhone", match: (h) => h.includes("customerphone") || h === "phone" },
  { header: "GST Type (INTRA_STATE / INTER_STATE)", key: "gstType", match: (h) => h.includes("gsttype") },
  { header: "Place Of Supply", key: "placeOfSupply", match: (h) => h.includes("placeofsupply") },
  { header: "Discount Total", key: "discountTotal", match: (h) => h.includes("discounttotal") },
  { header: "Product SKU", key: "productSku", match: (h) => h.includes("productsku") || h === "sku" },
  { header: "Quantity", key: "quantity", match: (h) => h === "quantity" || h === "qty" },
  { header: "Unit Price", key: "unitPrice", match: (h) => h.includes("unitprice") },
  { header: "Tax Percent", key: "taxPercent", match: (h) => h.includes("taxpercent") },
  { header: "IMEI (for IMEI-tracked products)", key: "imei", match: (h) => h === "imei" },
];

const SALE_SAMPLE_ROWS = [
  {
    reference: "INV-SAMPLE-1",
    customerPhone: "9876543210",
    gstType: "INTRA_STATE",
    placeOfSupply: "Maharashtra",
    discountTotal: "0",
    productSku: "SKU-001",
    quantity: "1",
    unitPrice: "1500",
    taxPercent: "18",
    imei: "",
  },
  {
    reference: "INV-SAMPLE-1",
    customerPhone: "9876543210",
    gstType: "",
    placeOfSupply: "",
    discountTotal: "",
    productSku: "SKU-002",
    quantity: "2",
    unitPrice: "500",
    taxPercent: "18",
    imei: "",
  },
];

async function buildSaleTemplateWorkbook(withSample: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sales");
  sheet.columns = SALE_TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  if (withSample) {
    for (const row of SALE_SAMPLE_ROWS) sheet.addRow(row);
    sheet.addRow({});
    sheet.addRow({
      reference:
        "Rows sharing the same Invoice Ref become one sale with multiple items. Delete the example rows above before uploading your own data.",
    });
  }
  return workbook;
}

export async function downloadSaleBulkTemplate(req: Request, res: Response) {
  const withSample = req.query.sample === "1";
  const workbook = await buildSaleTemplateWorkbook(withSample);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${withSample ? "Sales sample file" : "Sales bulk upload template"}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}

interface SaleBulkRow {
  rowNumber: number;
  reference: string;
  customerPhone: string;
  gstType?: string;
  placeOfSupply?: string;
  discountTotal?: string;
  productSku: string;
  quantity?: string;
  unitPrice?: string;
  taxPercent?: string;
  imei?: string;
}

export async function bulkUploadSalesFromExcel(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No file uploaded", 422);
  }
  const organizationId = req.user!.organizationId!;
  const userId = req.user!.sub;
  const sheet = await loadWorkbookSheet(req.file.buffer);

  const headerRow = sheet.getRow(1);
  const columnIndex = mapRowByHeader(headerRow, SALE_TEMPLATE_COLUMNS);

  if (!columnIndex.reference || !columnIndex.customerPhone || !columnIndex.productSku) {
    throw new AppError(
      'Could not find "Invoice Ref", "Customer Phone" and "Product SKU" columns in the uploaded file',
      422
    );
  }

  const get = (row: ExcelJS.Row, key: string) => (columnIndex[key] ? cellToString(row.getCell(columnIndex[key]).value) : "");

  const rawRows: SaleBulkRow[] = [];
  for (const row of sheet.getRows(2, Math.max(0, sheet.rowCount - 1)) ?? []) {
    const reference = get(row, "reference");
    const productSku = get(row, "productSku");
    if (!reference && !productSku) continue;
    rawRows.push({
      rowNumber: row.number,
      reference,
      customerPhone: get(row, "customerPhone"),
      gstType: get(row, "gstType") || undefined,
      placeOfSupply: get(row, "placeOfSupply") || undefined,
      discountTotal: get(row, "discountTotal") || undefined,
      productSku,
      quantity: get(row, "quantity") || undefined,
      unitPrice: get(row, "unitPrice") || undefined,
      taxPercent: get(row, "taxPercent") || undefined,
      imei: get(row, "imei") || undefined,
    });
  }

  if (rawRows.length === 0) {
    throw new AppError("No sale rows found in the uploaded file", 422);
  }

  const groups = new Map<string, SaleBulkRow[]>();
  for (const r of rawRows) {
    const key = r.reference || `__row_${r.rowNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const phones = [...new Set(rawRows.map((r) => r.customerPhone).filter(Boolean))];
  const skus = [...new Set(rawRows.map((r) => r.productSku).filter(Boolean))];
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { organizationId, phone: { in: phones } } }),
    prisma.product.findMany({ where: { organizationId, sku: { in: skus } } }),
  ]);
  const customerByPhone = new Map(customers.map((c) => [c.phone, c]));
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const created: string[] = [];
  const failed: { reference: string; rows: number[]; reason: string }[] = [];

  for (const [key, rows] of groups) {
    const rowNumbers = rows.map((r) => r.rowNumber);
    const label = key.startsWith("__row_") ? `(row ${rowNumbers[0]}, no Invoice Ref)` : key;
    try {
      const first = rows[0];
      const customer = customerByPhone.get(first.customerPhone);
      if (!customer) {
        throw new AppError(`Customer with phone "${first.customerPhone}" not found in your organization`, 404);
      }

      const items = rows.map((r) => {
        const product = productBySku.get(r.productSku);
        if (!product) {
          throw new AppError(`Product with SKU "${r.productSku}" not found in your organization`, 404);
        }
        return {
          productId: product.id,
          quantity: r.quantity ? Number(r.quantity) : 1,
          unitPrice: r.unitPrice ? Number(r.unitPrice) : Number(product.unitPrice),
          taxPercent: r.taxPercent ? Number(r.taxPercent) : Number(product.taxPercent),
          imei: r.imei || undefined,
        };
      });

      const data = saleSchema.parse({
        customerId: customer.id,
        items,
        discountTotal: first.discountTotal ? Number(first.discountTotal) : undefined,
        gstType: first.gstType || undefined,
        placeOfSupply: first.placeOfSupply || undefined,
      });

      const sale = await createSaleCore(data, userId, organizationId);
      created.push(sale.invoiceNumber);
    } catch (err) {
      failed.push({
        reference: label,
        rows: rowNumbers,
        reason:
          err instanceof z.ZodError
            ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            : err instanceof AppError
              ? err.message
              : "Failed to create sale",
      });
    }
  }

  res.status(201).json({ totalRecords: groups.size, created, failed });
}
