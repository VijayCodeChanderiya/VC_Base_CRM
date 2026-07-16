import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { toCsv } from "@/utils/csv";
import { ADD_ACTIONS, DELETE_ACTIONS } from "@/utils/auditActions";
import { formatDateTime } from "@/utils/date";
import { parseSortOrder } from "@/utils/sort";

const ACTIVITY_SORT_FIELDS: Record<string, Prisma.AuditLogOrderByWithRelationInput> = {
  createdAt: { createdAt: "asc" },
  user: { user: { name: "asc" } },
  action: { action: "asc" },
  entityType: { entityType: "asc" },
  entityId: { entityId: "asc" },
};

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function salesReport(_req: Request, res: Response) {
  const sales = await prisma.sale.findMany({
    include: { customer: true, branch: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = sales.flatMap((sale) =>
    sale.items.map((item) => ({
      invoiceNumber: sale.invoiceNumber,
      date: formatDateTime(sale.createdAt),
      branch: sale.branch.code,
      customer: sale.customer.name,
      product: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
      saleStatus: sale.status,
      grandTotal: sale.grandTotal.toString(),
    }))
  );

  const csv = toCsv(rows, [
    "invoiceNumber",
    "date",
    "branch",
    "customer",
    "product",
    "sku",
    "quantity",
    "unitPrice",
    "lineTotal",
    "saleStatus",
    "grandTotal",
  ]);
  sendCsv(res, "sales-report.csv", csv);
}

export async function purchasesReport(_req: Request, res: Response) {
  const purchases = await prisma.purchase.findMany({
    include: { supplier: true, branch: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = purchases.flatMap((purchase) =>
    purchase.items.map((item) => ({
      purchaseNumber: purchase.purchaseNumber,
      date: formatDateTime(purchase.createdAt),
      branch: purchase.branch.code,
      supplier: purchase.supplier.name,
      product: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitCost: item.unitCost.toString(),
      lineTotal: item.lineTotal.toString(),
      status: purchase.status,
      grandTotal: purchase.grandTotal.toString(),
    }))
  );

  const csv = toCsv(rows, [
    "purchaseNumber",
    "date",
    "branch",
    "supplier",
    "product",
    "sku",
    "quantity",
    "unitCost",
    "lineTotal",
    "status",
    "grandTotal",
  ]);
  sendCsv(res, "purchases-report.csv", csv);
}

export async function inventoryReport(_req: Request, res: Response) {
  const [products, branches, inventories, imeiCounts] = await Promise.all([
    prisma.product.findMany({ include: { category: true }, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ orderBy: { code: "asc" } }),
    prisma.inventory.findMany(),
    prisma.imeiRecord.groupBy({ by: ["productId", "branchId", "status"], _count: { _all: true } }),
  ]);

  const quantityByProductBranch = new Map<string, number>();
  for (const inv of inventories) {
    quantityByProductBranch.set(`${inv.productId}:${inv.branchId}`, inv.quantity);
  }
  const imeiInStockByProductBranch = new Map<string, number>();
  for (const row of imeiCounts) {
    if (row.status === "IN_STOCK") {
      imeiInStockByProductBranch.set(`${row.productId}:${row.branchId}`, row._count._all);
    }
  }

  const rows = products.flatMap((p) =>
    branches.map((b) => {
      const key = `${p.id}:${b.id}`;
      return {
        sku: p.sku,
        name: p.name,
        category: p.category?.name ?? "",
        branch: b.code,
        tracking: p.hasImei ? "IMEI" : "QUANTITY",
        stock: p.hasImei ? imeiInStockByProductBranch.get(key) ?? 0 : quantityByProductBranch.get(key) ?? 0,
        reorderLevel: p.reorderLevel,
        unitPrice: p.unitPrice.toString(),
        isActive: p.isActive,
      };
    })
  );

  const csv = toCsv(rows, [
    "sku",
    "name",
    "category",
    "branch",
    "tracking",
    "stock",
    "reorderLevel",
    "unitPrice",
    "isActive",
  ]);
  sendCsv(res, "inventory-report.csv", csv);
}

function buildActivityWhere(req: Request): Prisma.AuditLogWhereInput {
  const actionFilter = (req.query.action as string | undefined)?.toUpperCase() ?? "ALL";
  const entityType = req.query.entityType as string | undefined;
  const userId = req.query.userId as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const where: Prisma.AuditLogWhereInput = {};

  if (actionFilter === "ADD") {
    where.action = { in: ADD_ACTIONS };
  } else if (actionFilter === "DELETE") {
    where.action = { in: DELETE_ACTIONS };
  }

  if (entityType) {
    where.entityType = entityType;
  }
  if (userId) {
    where.userId = userId;
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  return where;
}

export async function listActivity(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const where = buildActivityWhere(req);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: parseSortOrder(req, ACTIVITY_SORT_FIELDS, { createdAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function exportActivityCsv(req: Request, res: Response) {
  const where = buildActivityWhere(req);

  const items = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = items.map((item) => ({
    dateTime: formatDateTime(item.createdAt),
    user: item.user?.name ?? "System",
    action: item.action,
    module: item.entityType,
    entityId: item.entityId ?? "",
    details: item.metadata ? JSON.stringify(item.metadata) : "",
  }));

  const csv = toCsv(rows, ["dateTime", "user", "action", "module", "entityId", "details"]);
  sendCsv(res, "activity-report.csv", csv);
}
