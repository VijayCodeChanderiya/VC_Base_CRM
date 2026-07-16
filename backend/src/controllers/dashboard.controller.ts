import { Request, Response } from "express";
import { prisma } from "@/config/prisma";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export async function getDashboardStats(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  const branchWhere = branchId ? { branchId } : {};

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const trendStart = daysAgo(13); // last 14 days including today

  const [
    salesThisMonth,
    revenueThisMonthAgg,
    totalCustomers,
    totalProducts,
    lowStockInventory,
    imeiInStock,
    imeiSold,
    pendingReturns,
    activeWarrantyClaims,
    pendingRma,
    activeSims,
    totalVehicles,
    recentSales,
    topProductAgg,
  ] = await Promise.all([
    prisma.sale.count({ where: { ...branchWhere, createdAt: { gte: startOfMonth } } }),
    prisma.sale.aggregate({
      where: { ...branchWhere, createdAt: { gte: startOfMonth } },
      _sum: { grandTotal: true },
    }),
    prisma.customer.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.inventory.findMany({ where: branchWhere, include: { product: true } }),
    prisma.imeiRecord.count({ where: { ...branchWhere, status: "IN_STOCK" } }),
    prisma.imeiRecord.count({ where: { ...branchWhere, status: "SOLD" } }),
    prisma.return.count({ where: { status: "PENDING" } }),
    prisma.warrantyClaim.count({ where: { status: "ACTIVE" } }),
    prisma.rma.count({ where: { status: { in: ["REQUESTED", "SHIPPED_TO_SUPPLIER", "RECEIVED_BY_SUPPLIER"] } } }),
    prisma.sim.count({ where: { ...branchWhere, status: "ACTIVE" } }),
    prisma.vehicle.count({ where: branchWhere }),
    prisma.sale.findMany({
      where: { ...branchWhere, createdAt: { gte: trendStart } },
      select: { createdAt: true, grandTotal: true },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 5,
    }),
  ]);

  const recentPurchases = await prisma.purchase.findMany({
    where: { ...branchWhere, purchaseDate: { gte: trendStart } },
    select: { purchaseDate: true, grandTotal: true },
  });

  // Build a 14-day revenue trend, zero-filled for days with no sales
  const trendMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    trendMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const sale of recentSales) {
    const key = startOfDay(sale.createdAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      trendMap.set(key, (trendMap.get(key) ?? 0) + Number(sale.grandTotal));
    }
  }
  const salesTrend = [...trendMap.entries()].map(([date, revenue]) => ({ date, revenue }));

  const purchaseTrendMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    purchaseTrendMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const purchase of recentPurchases) {
    const key = startOfDay(purchase.purchaseDate).toISOString().slice(0, 10);
    if (purchaseTrendMap.has(key)) {
      purchaseTrendMap.set(key, (purchaseTrendMap.get(key) ?? 0) + Number(purchase.grandTotal));
    }
  }
  const purchaseTrend = [...purchaseTrendMap.entries()].map(([date, amount]) => ({ date, amount }));

  const lowStockCount = lowStockInventory.filter((i) => i.quantity <= i.product.reorderLevel).length;

  const topProductIds = topProductAgg.map((p) => p.productId);
  const products = await prisma.product.findMany({ where: { id: { in: topProductIds } } });
  const productNameMap = new Map(products.map((p) => [p.id, p.name]));
  const topProducts = topProductAgg.map((p) => ({
    productId: p.productId,
    name: productNameMap.get(p.productId) ?? "Unknown",
    revenue: Number(p._sum.lineTotal ?? 0),
    quantity: p._sum.quantity ?? 0,
  }));

  res.json({
    salesThisMonth,
    revenueThisMonth: Number(revenueThisMonthAgg._sum.grandTotal ?? 0),
    totalCustomers,
    totalProducts,
    lowStockCount,
    imeiInStock,
    imeiSold,
    pendingReturns,
    activeWarrantyClaims,
    pendingRma,
    activeSims,
    totalVehicles,
    salesTrend,
    purchaseTrend,
    topProducts,
  });
}

export async function getPurchaseTrend(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  const branchWhere = branchId ? { branchId } : {};
  const period = (req.query.period as string) === "month" || (req.query.period as string) === "year"
    ? (req.query.period as "month" | "year")
    : "day";

  if (period === "day") {
    const start = daysAgo(13);
    const purchases = await prisma.purchase.findMany({
      where: { ...branchWhere, purchaseDate: { gte: start } },
      select: { purchaseDate: true, grandTotal: true },
    });
    const map = new Map<string, number>();
    for (let i = 13; i >= 0; i--) map.set(daysAgo(i).toISOString().slice(0, 10), 0);
    for (const p of purchases) {
      const key = startOfDay(p.purchaseDate).toISOString().slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(p.grandTotal));
    }
    return res.json({ period, data: [...map.entries()].map(([label, amount]) => ({ label, amount })) });
  }

  if (period === "month") {
    const monthsBack = 11;
    const start = new Date();
    start.setMonth(start.getMonth() - monthsBack, 1);
    start.setHours(0, 0, 0, 0);
    const purchases = await prisma.purchase.findMany({
      where: { ...branchWhere, purchaseDate: { gte: start } },
      select: { purchaseDate: true, grandTotal: true },
    });
    const map = new Map<string, number>();
    const cursor = new Date(start);
    for (let i = 0; i <= monthsBack; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    for (const p of purchases) {
      const d = p.purchaseDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(p.grandTotal));
    }
    return res.json({ period, data: [...map.entries()].map(([label, amount]) => ({ label, amount })) });
  }

  // year
  const yearsBack = 4;
  const currentYear = new Date().getFullYear();
  const start = new Date(currentYear - yearsBack, 0, 1);
  const purchases = await prisma.purchase.findMany({
    where: { ...branchWhere, purchaseDate: { gte: start } },
    select: { purchaseDate: true, grandTotal: true },
  });
  const map = new Map<string, number>();
  for (let i = yearsBack; i >= 0; i--) map.set(String(currentYear - i), 0);
  for (const p of purchases) {
    const key = String(p.purchaseDate.getFullYear());
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(p.grandTotal));
  }
  res.json({ period, data: [...map.entries()].map(([label, amount]) => ({ label, amount })) });
}

const DETAIL_ROW_CAP = 500;

export async function getDashboardDetail(req: Request, res: Response) {
  const type = req.query.type as string;
  const branchId = req.query.branchId as string | undefined;
  const branchWhere = branchId ? { branchId } : {};

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const trendStart = daysAgo(13);

  switch (type) {
    case "revenue":
    case "salesCount": {
      const sales = await prisma.sale.findMany({
        where: { ...branchWhere, createdAt: { gte: startOfMonth } },
        include: { customer: true, branch: true },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Sales this month",
        columns: ["Invoice #", "Customer", "Branch", "Date", "Total"],
        rows: sales.map((s) => [
          s.invoiceNumber,
          s.customer.name,
          s.branch.name,
          s.createdAt.toLocaleDateString(),
          Number(s.grandTotal).toLocaleString(),
        ]),
      });
    }

    case "salesTrend": {
      const sales = await prisma.sale.findMany({
        where: { ...branchWhere, createdAt: { gte: trendStart } },
        include: { customer: true, branch: true },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Sales — last 14 days",
        columns: ["Invoice #", "Customer", "Branch", "Date", "Total"],
        rows: sales.map((s) => [
          s.invoiceNumber,
          s.customer.name,
          s.branch.name,
          s.createdAt.toLocaleDateString(),
          Number(s.grandTotal).toLocaleString(),
        ]),
      });
    }

    case "purchaseTrend": {
      const purchases = await prisma.purchase.findMany({
        where: { ...branchWhere, purchaseDate: { gte: trendStart } },
        include: { supplier: true, branch: true },
        orderBy: { purchaseDate: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Purchases — last 14 days",
        columns: ["PO #", "Invoice #", "Supplier", "Branch", "Date", "Total"],
        rows: purchases.map((p) => [
          p.purchaseNumber,
          p.invoiceNumber ?? "-",
          p.supplier.name,
          p.branch.name,
          p.purchaseDate.toLocaleDateString(),
          Number(p.grandTotal).toLocaleString(),
        ]),
      });
    }

    case "customers": {
      const customers = await prisma.customer.findMany({
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Customers",
        columns: ["Name", "Phone", "Email", "City", "Company"],
        rows: customers.map((c) => [c.name, c.phone, c.email ?? "-", c.city ?? "-", c.company ?? "-"]),
      });
    }

    case "products": {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Active products",
        columns: ["Product name", "SKU", "Tracking"],
        rows: products.map((p) => [p.name, p.sku, p.hasImei ? "IMEI" : "Quantity"]),
      });
    }

    case "lowStock": {
      const inventory = await prisma.inventory.findMany({
        where: branchWhere,
        include: { product: true, branch: true },
      });
      const low = inventory.filter((i) => i.quantity <= i.product.reorderLevel);
      return res.json({
        type,
        title: "Low stock alerts",
        columns: ["Product", "SKU", "Branch", "In stock", "Reorder level"],
        rows: low.map((i) => [
          i.product.name,
          i.product.sku,
          i.branch.name,
          String(i.quantity),
          String(i.product.reorderLevel),
        ]),
      });
    }

    case "imeiStock": {
      const products = await prisma.product.findMany({ where: { hasImei: true, isActive: true } });
      const imeis = await prisma.imeiRecord.findMany({
        where: branchWhere,
        include: {
          product: true,
          saleItem: { include: { sale: { include: { customer: true } } } },
        },
      });

      const summaryMap = new Map<string, { name: string; sku: string; inStock: number; issued: number }>();
      for (const p of products) summaryMap.set(p.id, { name: p.name, sku: p.sku, inStock: 0, issued: 0 });
      for (const r of imeis) {
        const entry = summaryMap.get(r.productId);
        if (!entry) continue;
        if (r.status === "IN_STOCK") entry.inStock += 1;
        else entry.issued += 1;
      }

      const assignmentRows = imeis
        .filter((r) => r.status !== "IN_STOCK")
        .map((r) => [
          r.product.name,
          r.imei,
          r.status,
          r.saleItem?.sale.customer.name ?? "-",
          r.saleItem?.sale.customer.phone ?? "-",
          r.saleItem?.sale.invoiceNumber ?? "-",
        ]);

      return res.json({
        type,
        title: "IMEI stock — product-wise",
        summaryColumns: ["Product", "SKU", "In stock", "Issued/allocated"],
        summaryRows: [...summaryMap.values()].map((s) => [s.name, s.sku, String(s.inStock), String(s.issued)]),
        columns: ["Product", "IMEI", "Status", "Assigned to", "Phone", "Invoice #"],
        rows: assignmentRows.slice(0, DETAIL_ROW_CAP),
      });
    }

    case "pendingReturns": {
      const returns = await prisma.return.findMany({
        where: { status: "PENDING" },
        include: { customer: true, sale: true },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Pending returns",
        columns: ["Invoice #", "Customer", "Type", "Reason", "Date"],
        rows: returns.map((r) => [
          r.sale.invoiceNumber,
          r.customer.name,
          r.type,
          r.reason ?? "-",
          r.createdAt.toLocaleDateString(),
        ]),
      });
    }

    case "warrantyClaims": {
      const claims = await prisma.warrantyClaim.findMany({
        where: { status: "ACTIVE" },
        include: { customer: true, imeiRecord: { include: { product: true } } },
        orderBy: { claimDate: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Active warranty claims",
        columns: ["Customer", "Product", "IMEI", "Description", "Filed"],
        rows: claims.map((c) => [
          c.customer.name,
          c.imeiRecord?.product.name ?? "-",
          c.imeiRecord?.imei ?? "-",
          c.description ?? "-",
          c.claimDate.toLocaleDateString(),
        ]),
      });
    }

    case "pendingRma": {
      const rmas = await prisma.rma.findMany({
        where: { status: { in: ["REQUESTED", "SHIPPED_TO_SUPPLIER", "RECEIVED_BY_SUPPLIER"] } },
        include: { supplier: true, imeiRecord: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Open RMA cases",
        columns: ["Product", "IMEI", "Supplier", "Status", "Reason", "Date"],
        rows: rmas.map((r) => [
          r.imeiRecord.product.name,
          r.imeiRecord.imei,
          r.supplier.name,
          r.status,
          r.reason,
          r.createdAt.toLocaleDateString(),
        ]),
      });
    }

    case "activeSims": {
      const sims = await prisma.sim.findMany({
        where: { ...branchWhere, status: "ACTIVE" },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Active SIMs",
        columns: ["ICCID", "MSISDN", "Carrier", "Customer"],
        rows: sims.map((s) => [s.iccid, s.msisdn ?? "-", s.carrier ?? "-", s.customer?.name ?? "-"]),
      });
    }

    case "vehicles": {
      const vehicles = await prisma.vehicle.findMany({
        where: branchWhere,
        include: { ownerCustomer: true, branch: true },
        orderBy: { createdAt: "desc" },
        take: DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "Vehicles tracked",
        columns: ["Registration", "Make/Model", "Owner", "Branch"],
        rows: vehicles.map((v) => [
          v.registrationNumber,
          [v.make, v.model].filter(Boolean).join(" ") || "-",
          v.ownerCustomer.name,
          v.branch.name,
        ]),
      });
    }

    case "topProducts": {
      const agg = await prisma.saleItem.groupBy({
        by: ["productId"],
        _sum: { lineTotal: true, quantity: true },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: 20,
      });
      const products = await prisma.product.findMany({ where: { id: { in: agg.map((a) => a.productId) } } });
      const nameMap = new Map(products.map((p) => [p.id, p.name]));
      return res.json({
        type,
        title: "Top products by revenue",
        columns: ["Product", "Quantity sold", "Revenue"],
        rows: agg.map((a) => [
          nameMap.get(a.productId) ?? "Unknown",
          String(a._sum.quantity ?? 0),
          Number(a._sum.lineTotal ?? 0).toLocaleString(),
        ]),
      });
    }

    default:
      return res.status(400).json({ error: `Unknown detail type: ${type}` });
  }
}
