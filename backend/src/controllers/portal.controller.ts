import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { toCsv } from "@/utils/csv";
import { formatDate } from "@/utils/date";
import { getBrandingLogoFile } from "@/controllers/publicBranding.controller";
import { UPLOADS_DIR } from "@/config/storage";
import path from "node:path";
import fs from "node:fs";

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
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
  const sales = await prisma.sale.findMany({
    where: { customerId: req.customer!.sub },
    include: { items: { include: { product: true, imei: true } }, branch: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items: sales });
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
  const setting = await prisma.setting.findUnique({ where: { key: "companyProfile" } });
  const profile = (setting?.value as Record<string, unknown>) ?? {};
  const companyName = (profile.companyName as string) || "Alphatech CRM";
  const logo = await getBrandingLogoFile();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="purchase-history.pdf"');

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

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
    .text("Purchase History", 110, 55);

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
  const claims = await prisma.warrantyClaim.findMany({
    where: { customerId: req.customer!.sub },
    include: { imeiRecord: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items: claims });
}

export async function listMyReturns(req: Request, res: Response) {
  const returns = await prisma.return.findMany({
    where: { customerId: req.customer!.sub },
    include: { sale: true, items: { include: { saleItem: { include: { product: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items: returns });
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
