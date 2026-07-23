import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { toCsv } from "@/utils/csv";
import { formatDate } from "@/utils/date";
import { getBrandingHeaderInfo } from "@/controllers/publicBranding.controller";
import { UPLOADS_DIR } from "@/config/storage";
import { WARRANTY_YEARS, computeWarrantyExpiry } from "@/config/warranty";
import path from "node:path";
import fs from "node:fs";

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

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

function drawPdfBrandingHeader(
  doc: PDFKit.PDFDocument,
  companyName: string,
  logo: { path: string } | null,
  title: string
) {
  if (logo) {
    const logoPath = path.join(UPLOADS_DIR, logo.path);
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 40, 30, { width: 60 });
      } catch {
        // ignore unreadable/unsupported image formats, fall back to text-only header
      }
    }
  }
  doc
    .fontSize(16)
    .text(companyName, 110, 35, { align: "left" })
    .fontSize(10)
    .fillColor("#555555")
    .text(title, 110, 55);
}

export async function getMyProfile(req: Request, res: Response) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.sub } });
  res.json({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    username: customer.username,
    address: customer.address,
  });
}

export async function listMySales(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 1000);
  const q = (req.query.q as string) ?? "";

  const where = {
    customerId,
    ...(q ? { invoiceNumber: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { items: { include: { product: true, imei: true } }, branch: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getMySale(req: Request, res: Response) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      customer: true,
      branch: true,
      items: { include: { product: true, imei: true } },
      payments: true,
    },
  });

  if (sale.customerId !== req.customer!.sub) {
    throw new AppError("Not found", 404);
  }

  res.json(sale);
}

async function loadMySalesForExport(customerId: string) {
  return prisma.sale.findMany({
    where: { customerId },
    include: { items: { include: { product: true, imei: true } }, branch: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function exportMySalesCsv(req: Request, res: Response) {
  const sales = await loadMySalesForExport(req.customer!.sub);

  const rows: Record<string, string | number>[] = [];
  for (const sale of sales) {
    for (const item of sale.items) {
      rows.push({
        invoiceNumber: sale.invoiceNumber,
        date: formatDate(sale.createdAt),
        branch: sale.branch.name,
        product: item.product.name,
        sku: item.product.sku,
        imei: item.imei?.imei ?? "",
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
      });
    }
  }

  const csv = toCsv(rows, [
    "invoiceNumber",
    "date",
    "branch",
    "product",
    "sku",
    "imei",
    "quantity",
    "unitPrice",
    "lineTotal",
  ]);

  sendCsv(res, "purchase-history.csv", csv);
}

export async function exportMySalesPdf(req: Request, res: Response) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.sub } });
  const sales = await loadMySalesForExport(req.customer!.sub);
  const { companyName, logo } = await getBrandingHeaderInfo();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="purchase-history.pdf"');

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  drawPdfBrandingHeader(doc, companyName, logo, "Purchase History");

  doc.moveDown(3);
  doc.fillColor("#000000").fontSize(12).text(`Customer: ${customer.name}`);
  doc.fontSize(10).fillColor("#555555").text(`Phone: ${customer.phone}${customer.email ? ` | Email: ${customer.email}` : ""}`);
  doc.moveDown(1);

  const columns = [
    { label: "Invoice #", width: 80 },
    { label: "Date", width: 60 },
    { label: "Product", width: 130 },
    { label: "IMEI / Serial", width: 90 },
    { label: "Qty", width: 30 },
    { label: "Total", width: 60 },
  ];

  function drawRow(values: string[], y: number, bold = false) {
    doc.fontSize(9).fillColor("#000000");
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
    let x = 40;
    values.forEach((v, i) => {
      doc.text(v, x, y, { width: columns[i].width, ellipsis: true });
      x += columns[i].width;
    });
  }

  let y = doc.y + 5;
  drawRow(columns.map((c) => c.label), y, true);
  y += 16;
  doc.moveTo(40, y - 4).lineTo(450, y - 4).strokeColor("#dddddd").stroke();

  let grandTotal = 0;
  for (const sale of sales) {
    for (const item of sale.items) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      drawRow(
        [
          sale.invoiceNumber,
          formatDate(sale.createdAt),
          item.product.name,
          item.imei?.imei ?? "-",
          String(item.quantity),
          Number(item.lineTotal).toFixed(2),
        ],
        y
      );
      y += 16;
    }
    grandTotal += Number(sale.grandTotal);
  }

  y += 10;
  doc.moveTo(40, y).lineTo(450, y).strokeColor("#dddddd").stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(11).text(`Grand Total: ${grandTotal.toFixed(2)}`, 40, y);

  doc.end();
}

export async function listMyWarrantyClaims(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 1000);
  const q = (req.query.q as string) ?? "";

  const where = {
    customerId,
    ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.warrantyClaim.findMany({
      where,
      include: { imeiRecord: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.warrantyClaim.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function listMyReturns(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 1000);
  const q = (req.query.q as string) ?? "";

  const where = {
    customerId,
    ...(q ? { sale: { invoiceNumber: { contains: q, mode: "insensitive" as const } } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.return.findMany({
      where,
      include: { sale: true, items: { include: { saleItem: { include: { product: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.return.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function listMyDevices(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const devices = await prisma.imeiRecord.findMany({
    where: { saleItem: { sale: { customerId } } },
    include: {
      product: true,
      saleItem: { include: { sale: true } },
      sim: true,
      installations: { include: { vehicle: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    items: devices.map((d) => {
      const sale = d.saleItem?.sale;
      const warrantyExpiry = sale ? computeWarrantyExpiry(sale.createdAt) : null;
      const warrantyActive = warrantyExpiry ? warrantyExpiry.getTime() >= Date.now() : false;
      const installation = d.installations[0] ?? null;
      return {
        id: d.id,
        imei: d.imei,
        status: d.status,
        product: { name: d.product.name, sku: d.product.sku },
        invoiceNumber: sale?.invoiceNumber ?? null,
        purchaseDate: sale?.createdAt ?? null,
        warrantyExpiry,
        warrantyActive,
        sim: d.sim ? { iccid: d.sim.iccid, status: d.sim.status, expiryDate: d.sim.expiryDate } : null,
        vehicle: installation?.vehicle
          ? { registrationNumber: installation.vehicle.registrationNumber }
          : null,
      };
    }),
  });
}

export async function listMyProducts(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const saleItems = await prisma.saleItem.findMany({
    where: { sale: { customerId } },
    include: { product: true, sale: { select: { createdAt: true } } },
  });

  const byProduct = new Map<
    string,
    { name: string; sku: string; isActive: boolean; quantityOwned: number; first: Date; last: Date }
  >();
  for (const item of saleItems) {
    const existing = byProduct.get(item.productId);
    const purchaseDate = item.sale.createdAt;
    if (existing) {
      existing.quantityOwned += item.quantity;
      if (purchaseDate < existing.first) existing.first = purchaseDate;
      if (purchaseDate > existing.last) existing.last = purchaseDate;
    } else {
      byProduct.set(item.productId, {
        name: item.product.name,
        sku: item.product.sku,
        isActive: item.product.isActive,
        quantityOwned: item.quantity,
        first: purchaseDate,
        last: purchaseDate,
      });
    }
  }

  res.json({
    items: [...byProduct.entries()].map(([productId, p]) => ({
      productId,
      name: p.name,
      sku: p.sku,
      isActive: p.isActive,
      quantityOwned: p.quantityOwned,
      firstPurchaseDate: p.first,
      lastPurchaseDate: p.last,
    })),
  });
}

function buildMySimsWhere(req: Request) {
  const customerId = req.customer!.sub;
  const q = ((req.query.q as string) ?? "").trim();
  const status = req.query.status as string | undefined;
  const carrier = req.query.carrier as string | undefined;

  return {
    customerId,
    ...(q
      ? {
          OR: [
            { iccid: { contains: q, mode: "insensitive" as const } },
            { msisdn: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status ? { status: status as never } : {}),
    ...(carrier ? { carrier: carrier as never } : {}),
  };
}

export async function listMySims(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 1000);
  const where = buildMySimsWhere(req);

  const [items, total] = await Promise.all([
    prisma.sim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sim.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getMySimsExcel(req: Request, res: Response) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.sub } });
  const where = buildMySimsWhere(req);
  const sims = await prisma.sim.findMany({ where, orderBy: { createdAt: "desc" } });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("SIMs");
  sheet.columns = [
    { header: "ICCID", key: "iccid", width: 24 },
    { header: "Mobile Number", key: "msisdn", width: 18 },
    { header: "Operator", key: "carrier", width: 12 },
    { header: "Activation Date", key: "activatedAt", width: 16 },
    { header: "Expiry / Renewal Date", key: "expiryDate", width: 18 },
    { header: "Billing Cycle", key: "billingCycle", width: 14 },
    { header: "Status", key: "status", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const s of sims) {
    sheet.addRow({
      iccid: s.iccid,
      msisdn: s.msisdn ?? "",
      carrier: s.carrier,
      activatedAt: formatDate(s.activatedAt),
      expiryDate: formatDate(s.expiryDate),
      billingCycle: s.billingCycle ?? "",
      status: s.status,
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${customer.name.replace(/[^a-z0-9]/gi, "_")}-sims.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function getMySimsPdf(req: Request, res: Response) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.sub } });
  const where = buildMySimsWhere(req);
  const sims = await prisma.sim.findMany({ where, orderBy: { createdAt: "desc" } });
  const { companyName, logo } = await getBrandingHeaderInfo();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${customer.name.replace(/[^a-z0-9]/gi, "_")}-sims.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  drawPdfBrandingHeader(doc, companyName, logo, "My SIM Cards");
  doc.moveDown(3);
  doc.fontSize(11).fillColor("#000000").text(`Customer: ${customer.name}`);
  doc.fontSize(10).fillColor("#555555").text(`Phone: ${customer.phone}`);
  doc.moveDown(1);

  const columns = [
    { label: "ICCID", width: 110 },
    { label: "Mobile Number", width: 80 },
    { label: "Operator", width: 55 },
    { label: "Activated", width: 65 },
    { label: "Expiry", width: 65 },
    { label: "Status", width: 65 },
  ];

  function drawRow(values: string[], y: number, bold = false) {
    doc.fontSize(9).fillColor("#000000");
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
    let x = 40;
    values.forEach((v, i) => {
      doc.text(v, x, y, { width: columns[i].width, ellipsis: true });
      x += columns[i].width;
    });
  }

  let y = doc.y;
  drawRow(columns.map((c) => c.label), y, true);
  y += 18;
  doc.moveTo(40, y - 4).lineTo(500, y - 4).strokeColor("#cccccc").stroke();

  for (const s of sims) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    drawRow(
      [
        s.iccid,
        s.msisdn ?? "-",
        s.carrier,
        s.activatedAt ? formatDate(s.activatedAt) : "-",
        s.expiryDate ? formatDate(s.expiryDate) : "-",
        s.status,
      ],
      y
    );
    y += 18;
  }

  doc.end();
}

export async function getMyDashboard(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const trendStart = daysAgo(29);

  const [
    totalPurchases,
    totalSpendAgg,
    activeDevices,
    activeSims,
    expiringSimsCount,
    openTickets,
    activeAmcCount,
    expiringAmcCount,
    recentSales,
    recentTickets,
    recentReturns,
    recentClaims,
  ] = await Promise.all([
    prisma.sale.count({ where: { customerId } }),
    prisma.sale.aggregate({ where: { customerId }, _sum: { grandTotal: true } }),
    prisma.imeiRecord.count({ where: { saleItem: { sale: { customerId } } } }),
    prisma.sim.count({ where: { customerId, status: { in: ["ACTIVE", "ASSIGNED"] } } }),
    prisma.sim.count({
      where: { customerId, expiryDate: { gte: new Date(), lte: daysAgo(-30) } },
    }),
    prisma.supportTicket.count({ where: { customerId, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.amcContract.count({ where: { customerId, status: { in: ["ACTIVE", "EXPIRING_SOON"] } } }),
    prisma.amcContract.count({ where: { customerId, status: "EXPIRING_SOON" } }),
    prisma.sale.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, invoiceNumber: true, grandTotal: true, createdAt: true },
    }),
    prisma.supportTicket.findMany({
      where: { customerId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, ticketNumber: true, subject: true, status: true, updatedAt: true },
    }),
    prisma.return.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, createdAt: true, sale: { select: { invoiceNumber: true } } },
    }),
    prisma.warrantyClaim.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, createdAt: true, description: true },
    }),
  ]);

  const recentActivity = [
    ...recentSales.map((s) => ({
      type: "sale" as const,
      date: s.createdAt,
      label: `Purchase — ${s.invoiceNumber}`,
      detail: `₹${Number(s.grandTotal).toLocaleString()}`,
    })),
    ...recentTickets.map((t) => ({
      type: "ticket" as const,
      date: t.updatedAt,
      label: `Ticket ${t.ticketNumber} — ${t.subject}`,
      detail: t.status,
    })),
    ...recentReturns.map((r) => ({
      type: "return" as const,
      date: r.createdAt,
      label: `Return — ${r.sale.invoiceNumber}`,
      detail: r.status,
    })),
    ...recentClaims.map((c) => ({
      type: "warranty" as const,
      date: c.createdAt,
      label: `Warranty claim${c.description ? ` — ${c.description}` : ""}`,
      detail: c.status,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  res.json({
    totalPurchases,
    totalSpend: Number(totalSpendAgg._sum.grandTotal ?? 0),
    activeDevices,
    activeSims,
    expiringSimsCount,
    openTickets,
    activeAmcCount,
    expiringAmcCount,
    recentActivity,
  });
}

export async function getMyDashboardCharts(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const trendStart = daysAgo(13);

  const [recentSales, devices, sims] = await Promise.all([
    prisma.sale.findMany({
      where: { customerId, createdAt: { gte: trendStart } },
      select: { createdAt: true, grandTotal: true },
    }),
    prisma.imeiRecord.findMany({
      where: { saleItem: { sale: { customerId } } },
      include: { saleItem: { include: { sale: true } } },
    }),
    prisma.sim.findMany({ where: { customerId }, select: { status: true } }),
  ]);

  const trendMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) trendMap.set(daysAgo(i).toISOString().slice(0, 10), 0);
  for (const sale of recentSales) {
    const key = startOfDay(sale.createdAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + Number(sale.grandTotal));
  }
  const purchaseTrend = [...trendMap.entries()].map(([date, amount]) => ({ date, value: amount }));

  let devicesActive = 0;
  let devicesExpired = 0;
  for (const d of devices) {
    const sale = d.saleItem?.sale;
    const active = sale ? computeWarrantyExpiry(sale.createdAt).getTime() >= Date.now() : false;
    if (active) devicesActive += 1;
    else devicesExpired += 1;
  }

  const simStatusCounts = new Map<string, number>();
  for (const s of sims) simStatusCounts.set(s.status, (simStatusCounts.get(s.status) ?? 0) + 1);

  res.json({
    purchaseTrend,
    deviceStatus: [
      { name: "Under warranty", value: devicesActive },
      { name: "Warranty expired", value: devicesExpired },
    ],
    subscriptionStatus: [...simStatusCounts.entries()].map(([name, value]) => ({ name, value })),
  });
}

const PORTAL_DETAIL_ROW_CAP = 200;

export async function getMyDashboardDetail(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const type = req.query.type as string;

  switch (type) {
    case "purchases": {
      const sales = await prisma.sale.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: PORTAL_DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "My Purchases",
        columns: ["Invoice #", "Date", "Status", "Total"],
        rows: sales.map((s) => [
          s.invoiceNumber,
          formatDate(s.createdAt),
          s.status,
          Number(s.grandTotal).toLocaleString(),
        ]),
      });
    }
    case "devices": {
      const devices = await prisma.imeiRecord.findMany({
        where: { saleItem: { sale: { customerId } } },
        include: { product: true, saleItem: { include: { sale: true } } },
        orderBy: { createdAt: "desc" },
        take: PORTAL_DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "My Devices",
        columns: ["Product", "IMEI", "Invoice #", "Warranty Until"],
        rows: devices.map((d) => [
          d.product.name,
          d.imei,
          d.saleItem?.sale.invoiceNumber ?? "-",
          d.saleItem?.sale ? formatDate(computeWarrantyExpiry(d.saleItem.sale.createdAt)) : "-",
        ]),
      });
    }
    case "tickets": {
      const tickets = await prisma.supportTicket.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: PORTAL_DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "My Support Tickets",
        columns: ["Ticket #", "Subject", "Status", "Created"],
        rows: tickets.map((t) => [t.ticketNumber, t.subject, t.status, formatDate(t.createdAt)]),
      });
    }
    case "amc": {
      const contracts = await prisma.amcContract.findMany({
        where: { customerId },
        include: { vehicle: true },
        orderBy: { endDate: "asc" },
        take: PORTAL_DETAIL_ROW_CAP,
      });
      return res.json({
        type,
        title: "My AMC Contracts",
        columns: ["Contract #", "Vehicle", "Status", "Valid Until"],
        rows: contracts.map((c) => [
          c.contractNumber,
          c.vehicle?.registrationNumber ?? "-",
          c.status,
          formatDate(c.endDate),
        ]),
      });
    }
    default:
      return res.status(400).json({ error: `Unknown detail type: ${type}` });
  }
}

async function loadMyReportData(customerId: string) {
  const [sales, devices, amcContracts, sims] = await Promise.all([
    prisma.sale.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
    prisma.imeiRecord.findMany({
      where: { saleItem: { sale: { customerId } } },
      include: { product: true, saleItem: { include: { sale: true } } },
    }),
    prisma.amcContract.findMany({ where: { customerId }, include: { vehicle: true } }),
    prisma.sim.findMany({ where: { customerId } }),
  ]);
  return { sales, devices, amcContracts, sims };
}

export async function getMyReportExcel(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const { sales, devices, amcContracts, sims } = await loadMyReportData(customerId);

  const workbook = new ExcelJS.Workbook();

  const purchasesSheet = workbook.addWorksheet("Purchases");
  purchasesSheet.columns = [
    { header: "Invoice #", key: "invoiceNumber", width: 20 },
    { header: "Date", key: "date", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Total", key: "total", width: 14 },
  ];
  purchasesSheet.getRow(1).font = { bold: true };
  for (const s of sales) {
    purchasesSheet.addRow({
      invoiceNumber: s.invoiceNumber,
      date: formatDate(s.createdAt),
      status: s.status,
      total: Number(s.grandTotal),
    });
  }

  const devicesSheet = workbook.addWorksheet("Devices");
  devicesSheet.columns = [
    { header: "Product", key: "product", width: 24 },
    { header: "IMEI", key: "imei", width: 20 },
    { header: "Invoice #", key: "invoiceNumber", width: 20 },
    { header: "Warranty Until", key: "warrantyUntil", width: 16 },
  ];
  devicesSheet.getRow(1).font = { bold: true };
  for (const d of devices) {
    devicesSheet.addRow({
      product: d.product.name,
      imei: d.imei,
      invoiceNumber: d.saleItem?.sale.invoiceNumber ?? "",
      warrantyUntil: d.saleItem?.sale ? formatDate(computeWarrantyExpiry(d.saleItem.sale.createdAt)) : "",
    });
  }

  const amcSheet = workbook.addWorksheet("AMC Contracts");
  amcSheet.columns = [
    { header: "Contract #", key: "contractNumber", width: 20 },
    { header: "Vehicle", key: "vehicle", width: 18 },
    { header: "Status", key: "status", width: 14 },
    { header: "Valid Until", key: "validUntil", width: 16 },
  ];
  amcSheet.getRow(1).font = { bold: true };
  for (const c of amcContracts) {
    amcSheet.addRow({
      contractNumber: c.contractNumber,
      vehicle: c.vehicle?.registrationNumber ?? "",
      status: c.status,
      validUntil: formatDate(c.endDate),
    });
  }

  const simsSheet = workbook.addWorksheet("Subscriptions");
  simsSheet.columns = [
    { header: "ICCID", key: "iccid", width: 24 },
    { header: "Carrier", key: "carrier", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Valid Until", key: "validUntil", width: 16 },
  ];
  simsSheet.getRow(1).font = { bold: true };
  for (const s of sims) {
    simsSheet.addRow({
      iccid: s.iccid,
      carrier: s.carrier,
      status: s.status,
      validUntil: formatDate(s.expiryDate),
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${customer.name.replace(/[^a-z0-9]/gi, "_")}-report.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function getMyReportPdf(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const { sales, devices, amcContracts, sims } = await loadMyReportData(customerId);
  const { companyName, logo } = await getBrandingHeaderInfo();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${customer.name.replace(/[^a-z0-9]/gi, "_")}-report.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  drawPdfBrandingHeader(doc, companyName, logo, "Account Report");
  doc.moveDown(3);
  doc.fontSize(11).fillColor("#000000").text(`Customer: ${customer.name}`);
  doc.fontSize(10).fillColor("#555555").text(`Phone: ${customer.phone}`);
  doc.moveDown(1);

  function section(title: string, columns: string[], widths: number[], rows: string[][]) {
    doc.fontSize(13).fillColor("#000000").text(title);
    doc.moveDown(0.3);
    let y = doc.y;
    doc.fontSize(9).font("Helvetica-Bold");
    let x = 40;
    columns.forEach((c, i) => {
      doc.text(c, x, y, { width: widths[i] });
      x += widths[i];
    });
    y += 16;
    doc.font("Helvetica");
    for (const row of rows) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      x = 40;
      row.forEach((v, i) => {
        doc.text(v, x, y, { width: widths[i], ellipsis: true });
        x += widths[i];
      });
      y += 14;
    }
    doc.y = y + 12;
  }

  section(
    "Purchases",
    ["Invoice #", "Date", "Status", "Total"],
    [110, 80, 80, 80],
    sales.map((s) => [s.invoiceNumber, formatDate(s.createdAt), s.status, Number(s.grandTotal).toFixed(2)])
  );

  section(
    "Devices",
    ["Product", "IMEI", "Warranty Until"],
    [150, 120, 100],
    devices.map((d) => [
      d.product.name,
      d.imei,
      d.saleItem?.sale ? formatDate(computeWarrantyExpiry(d.saleItem.sale.createdAt)) : "-",
    ])
  );

  section(
    "AMC Contracts",
    ["Contract #", "Status", "Valid Until"],
    [150, 100, 100],
    amcContracts.map((c) => [c.contractNumber, c.status, formatDate(c.endDate)])
  );

  section(
    "Subscriptions",
    ["ICCID", "Carrier", "Valid Until"],
    [180, 100, 100],
    sims.map((s) => [s.iccid, s.carrier, formatDate(s.expiryDate)])
  );

  doc.end();
}

const updateAccountSchema = z
  .object({
    currentPassword: z.string().min(1),
    newUsername: z.string().trim().min(3).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine((d) => d.newUsername || d.newPassword, {
    message: "Provide a new username and/or a new password",
  });

export async function updateMyAccount(req: Request, res: Response) {
  const data = updateAccountSchema.parse(req.body);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customer!.sub } });

  if (!customer.passwordHash) {
    throw new AppError("No password set on this account yet. Contact the store.", 409);
  }

  const valid = await bcrypt.compare(data.currentPassword, customer.passwordHash);
  if (!valid) {
    throw new AppError("Current password is incorrect", 401);
  }

  const update: Record<string, unknown> = {};
  if (data.newUsername) update.username = data.newUsername;
  if (data.newPassword) update.passwordHash = await bcrypt.hash(data.newPassword, 10);

  const updated = await prisma.customer.update({ where: { id: customer.id }, data: update });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    username: updated.username,
  });
}
