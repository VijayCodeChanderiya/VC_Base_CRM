import { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Prisma, SimCarrier, SimBillingCycle } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { resolveBranchId } from "@/utils/branch";
import { logAudit } from "@/utils/audit";
import { iccidSchema, optionalM2mNumberSchema } from "@/utils/validators";
import { formatDate } from "@/utils/date";
import { parseSortOrder } from "@/utils/sort";

const SIM_SORT_FIELDS: Record<string, Prisma.SimOrderByWithRelationInput> = {
  iccid: { iccid: "asc" },
  msisdn: { msisdn: "asc" },
  carrier: { carrier: "asc" },
  purchaseDate: { purchaseDate: "asc" },
  saleDate: { saleDate: "asc" },
  expiryDate: { expiryDate: "asc" },
  billingCycle: { billingCycle: "asc" },
  status: { status: "asc" },
  customer: { customer: { name: "asc" } },
  device: { imeiRecord: { imei: "asc" } },
};

export const simUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const simSchema = z.object({
  iccid: iccidSchema,
  msisdn: optionalM2mNumberSchema,
  carrier: z.nativeEnum(SimCarrier),
  billingCycle: z.nativeEnum(SimBillingCycle).optional(),
  branchId: z.string().uuid().optional(),
  purchaseDate: z.string().optional(),
  notes: z.string().optional(),
});

const assignSchema = z.object({
  customerId: z.string().uuid().optional(),
  imeiRecordId: z.string().uuid().optional(),
  saleDate: z.string().optional(),
  billingCycle: z.nativeEnum(SimBillingCycle).optional(),
});

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

const bulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  customerId: z.string().uuid(),
  saleDate: z.string().optional(),
  billingCycle: z.nativeEnum(SimBillingCycle).optional(),
});

function parseOptionalDate(value: string | undefined, fieldLabel: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`Invalid ${fieldLabel}`, 422);
  }
  if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new AppError(`${fieldLabel} cannot be in the future`, 422);
  }
  return parsed;
}

const BILLING_CYCLE_MONTHS: Record<SimBillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

// Expiry is always derived: saleDate/current expiry + the billing cycle's month count.
function addBillingCycle(date: Date, cycle: SimBillingCycle): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + BILLING_CYCLE_MONTHS[cycle]);
  return result;
}

const renewSimSchema = z.object({
  billingCycle: z.nativeEnum(SimBillingCycle),
});

export async function listSims(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";
  const status = req.query.status as string | undefined;
  const carrier = req.query.carrier as string | undefined;
  const branchId = req.query.branchId as string | undefined;
  const customerId = req.query.customerId as string | undefined;

  const where = {
    ...(search
      ? {
          OR: [
            { iccid: { contains: search, mode: "insensitive" as const } },
            { msisdn: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status ? { status: status as never } : {}),
    ...(carrier ? { carrier: carrier as never } : {}),
    ...(branchId ? { branchId } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.sim.findMany({
      where,
      include: { customer: true, imeiRecord: { include: { product: true } }, branch: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, SIM_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.sim.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getSimStats(req: Request, res: Response) {
  const branchId = req.query.branchId as string | undefined;
  const where = branchId ? { branchId } : {};

  const [total, assigned, available] = await Promise.all([
    prisma.sim.count({ where }),
    prisma.sim.count({ where: { ...where, status: "ASSIGNED" } }),
    prisma.sim.count({ where: { ...where, status: "AVAILABLE" } }),
  ]);

  res.json({ total, assigned, available });
}

export async function createSim(req: Request, res: Response) {
  const data = simSchema.parse(req.body);
  const branchId = await resolveBranchId(data.branchId);
  const purchaseDate = parseOptionalDate(data.purchaseDate, "purchase date");

  const sim = await prisma.sim.create({
    data: {
      iccid: data.iccid,
      msisdn: data.msisdn,
      carrier: data.carrier,
      notes: data.notes,
      branchId,
      purchaseDate,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SIM_CREATED",
    entityType: "Sim",
    entityId: sim.id,
    metadata: { iccid: sim.iccid, carrier: sim.carrier },
  });

  res.status(201).json(sim);
}

interface BulkSimEntry {
  iccid: string;
  msisdn?: string;
}

async function createSimsFromEntries(
  entries: BulkSimEntry[],
  carrier: SimCarrier,
  branchId: string,
  purchaseDate: Date | undefined,
  userId: string
): Promise<{ created: string[]; failed: { iccid: string; reason: string }[] }> {
  const created: string[] = [];
  const failed: { iccid: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const iccidTrimmed = entry.iccid.trim();
    const iccidParsed = iccidSchema.safeParse(iccidTrimmed);
    if (!iccidParsed.success) {
      failed.push({
        iccid: iccidTrimmed || "(blank)",
        reason: iccidParsed.error.issues[0]?.message ?? "Invalid ICCID",
      });
      continue;
    }
    const iccid = iccidParsed.data;
    if (seen.has(iccid)) {
      failed.push({ iccid, reason: "Duplicate in this batch" });
      continue;
    }
    seen.add(iccid);

    let msisdn: string | undefined;
    if (entry.msisdn && entry.msisdn.trim()) {
      const msisdnParsed = optionalM2mNumberSchema.safeParse(entry.msisdn.trim());
      if (!msisdnParsed.success) {
        failed.push({ iccid, reason: "M2M number must be exactly 13 digits" });
        continue;
      }
      msisdn = msisdnParsed.data;
    }

    try {
      const sim = await prisma.sim.create({
        data: { iccid, msisdn, carrier, branchId, purchaseDate },
      });
      created.push(sim.iccid);
    } catch (err) {
      const reason =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
          ? "ICCID already exists"
          : "Failed to add";
      failed.push({ iccid, reason });
    }
  }

  if (created.length > 0) {
    await logAudit(prisma, {
      userId,
      action: created.length === 1 ? "SIM_CREATED" : "SIM_BATCH_CREATED",
      entityType: "Sim",
      metadata: { carrier, count: created.length, iccids: created },
    });
  }

  return { created, failed };
}

const bulkSimSchema = z.object({
  carrier: z.nativeEnum(SimCarrier),
  branchId: z.string().uuid().optional(),
  purchaseDate: z.string().optional(),
  entries: z.array(z.object({ iccid: z.string(), msisdn: z.string().optional() })).min(1),
});

export async function bulkCreateSims(req: Request, res: Response) {
  const data = bulkSimSchema.parse(req.body);
  const branchId = await resolveBranchId(data.branchId);
  const purchaseDate = parseOptionalDate(data.purchaseDate, "date of uploading");

  const result = await createSimsFromEntries(data.entries, data.carrier, branchId, purchaseDate, req.user!.sub);
  res.status(201).json(result);
}

const bulkSimUploadFieldsSchema = z.object({
  carrier: z.nativeEnum(SimCarrier),
  branchId: z.string().uuid().optional(),
  purchaseDate: z.string().optional(),
});

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text ?? "");
  }
  return String(value).trim();
}

export async function bulkUploadSimsFromExcel(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No file uploaded", 422);
  }
  const fields = bulkSimUploadFieldsSchema.parse(req.body);
  const branchId = await resolveBranchId(fields.branchId);
  const defaultPurchaseDate = parseOptionalDate(fields.purchaseDate, "date of uploading");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Could not read the uploaded file — please upload a valid .xlsx file", 422);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError("The uploaded file has no sheets", 422);
  }

  const headerRow = sheet.getRow(1);
  const columnIndex: { iccid?: number; msisdn?: number } = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = normalizeHeader(cell.value);
    if (key.includes("iccid")) columnIndex.iccid = colNumber;
    else if (key.includes("sim") || key.includes("m2m") || key.includes("msisdn")) columnIndex.msisdn = colNumber;
  });

  if (!columnIndex.iccid) {
    throw new AppError('Could not find an "ICCID" column in the uploaded file', 422);
  }

  const entries: BulkSimEntry[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const iccid = cellToString(row.getCell(columnIndex.iccid!).value);
    if (!iccid) return;
    entries.push({
      iccid,
      msisdn: columnIndex.msisdn ? cellToString(row.getCell(columnIndex.msisdn).value) : undefined,
    });
  });

  if (entries.length === 0) {
    throw new AppError("No SIM rows found in the uploaded file", 422);
  }

  const result = await createSimsFromEntries(
    entries,
    fields.carrier,
    branchId,
    defaultPurchaseDate,
    req.user!.sub
  );
  res.status(201).json(result);
}

export async function downloadSimBulkTemplate(_req: Request, res: Response) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("SIMs");
  sheet.columns = [
    { header: "ICCID", key: "iccid", width: 24 },
    { header: "SIM number", key: "msisdn", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="Bulk upload file.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}

async function loadCustomerSims(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const sims = await prisma.sim.findMany({
    where: { customerId },
    include: { imeiRecord: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { customer, sims };
}

export async function exportCustomerSimsExcel(req: Request, res: Response) {
  const { customer, sims } = await loadCustomerSims(req.params.customerId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("SIMs");
  sheet.columns = [
    { header: "ICCID", key: "iccid", width: 24 },
    { header: "M2M Number", key: "msisdn", width: 18 },
    { header: "Carrier", key: "carrier", width: 12 },
    { header: "Sale Date", key: "saleDate", width: 14 },
    { header: "Expiry Date", key: "expiryDate", width: 14 },
    { header: "Billing Cycle", key: "billingCycle", width: 14 },
    { header: "Device (IMEI)", key: "imei", width: 20 },
    { header: "Status", key: "status", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const s of sims) {
    sheet.addRow({
      iccid: s.iccid,
      msisdn: s.msisdn ?? "",
      carrier: s.carrier,
      saleDate: formatDate(s.saleDate),
      expiryDate: formatDate(s.expiryDate),
      billingCycle: s.billingCycle ?? "",
      imei: s.imeiRecord?.imei ?? "",
      status: s.status,
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${customer.name.replace(/[^a-z0-9]/gi, "_")}-sims.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportCustomerSimsPdf(req: Request, res: Response) {
  const { customer, sims } = await loadCustomerSims(req.params.customerId);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${customer.name.replace(/[^a-z0-9]/gi, "_")}-sims.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  doc.fontSize(16).text("Customer SIM Details", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor("#000000").text(`Customer: ${customer.name}`);
  doc.fontSize(10).fillColor("#555555").text(`Phone: ${customer.phone}`);
  doc.moveDown(1);

  const columns = [
    { label: "ICCID", width: 110 },
    { label: "SIM Number", width: 70 },
    { label: "Carrier", width: 50 },
    { label: "Sale Date", width: 60 },
    { label: "Expiry Date", width: 60 },
    { label: "Billing", width: 55 },
    { label: "Status", width: 55 },
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
        s.saleDate ? formatDate(s.saleDate) : "-",
        s.expiryDate ? formatDate(s.expiryDate) : "-",
        s.billingCycle ?? "-",
        s.status,
      ],
      y
    );
    y += 18;
  }

  doc.end();
}

const updateSimSchema = simSchema.omit({ branchId: true }).partial().extend({
  customerId: z.string().uuid().nullable().optional(),
  saleDate: z.string().optional(),
  billingCycle: z.nativeEnum(SimBillingCycle).nullable().optional(),
});

export async function updateSim(req: Request, res: Response) {
  const data = updateSimSchema.parse(req.body);
  const purchaseDate = parseOptionalDate(data.purchaseDate, "purchase date");
  const saleDate = parseOptionalDate(data.saleDate, "sale date");
  const existing = await prisma.sim.findUniqueOrThrow({ where: { id: req.params.id } });

  const updateData: Prisma.SimUpdateInput = {
    ...(data.iccid !== undefined ? { iccid: data.iccid } : {}),
    ...(data.msisdn !== undefined ? { msisdn: data.msisdn } : {}),
    ...(data.carrier !== undefined ? { carrier: data.carrier } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(purchaseDate !== undefined ? { purchaseDate } : {}),
  };

  // Status and expiryDate are always derived automatically — never settable directly.
  // Expiry = saleDate + billing cycle, recomputed whenever either changes.
  if (data.customerId !== undefined) {
    if (data.customerId === null) {
      updateData.customer = { disconnect: true };
      updateData.imeiRecord = { disconnect: true };
      updateData.status = "AVAILABLE";
      updateData.saleDate = null;
      updateData.billingCycle = null;
      updateData.expiryDate = null;
    } else {
      updateData.customer = { connect: { id: data.customerId } };
      updateData.status = "ASSIGNED";
      const effectiveSaleDate = saleDate ?? existing.saleDate ?? new Date();
      const effectiveBillingCycle = data.billingCycle !== undefined ? data.billingCycle : existing.billingCycle;
      updateData.saleDate = effectiveSaleDate;
      if (data.billingCycle !== undefined) updateData.billingCycle = data.billingCycle;
      updateData.expiryDate = effectiveBillingCycle ? addBillingCycle(effectiveSaleDate, effectiveBillingCycle) : null;
    }
  } else if (data.billingCycle !== undefined) {
    updateData.billingCycle = data.billingCycle;
    const effectiveSaleDate = saleDate ?? existing.saleDate;
    updateData.expiryDate =
      data.billingCycle && effectiveSaleDate ? addBillingCycle(effectiveSaleDate, data.billingCycle) : null;
  }

  const sim = await prisma.sim.update({
    where: { id: req.params.id },
    data: updateData,
    include: { customer: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SIM_UPDATED",
    entityType: "Sim",
    entityId: sim.id,
    metadata: { iccid: sim.iccid, customerId: sim.customerId, status: sim.status },
  });

  res.json(sim);
}

export async function assignSim(req: Request, res: Response) {
  const data = assignSchema.parse(req.body);
  const saleDate = parseOptionalDate(data.saleDate, "sale date");

  const sim = await prisma.sim.findUniqueOrThrow({ where: { id: req.params.id } });
  if (sim.status !== "AVAILABLE" && (data.customerId || data.imeiRecordId)) {
    throw new AppError("SIM is not available for assignment", 409);
  }

  const effectiveSaleDate = data.customerId || data.imeiRecordId ? (saleDate ?? new Date()) : undefined;
  const updated = await prisma.sim.update({
    where: { id: sim.id },
    data: {
      customerId: data.customerId,
      imeiRecordId: data.imeiRecordId,
      status: data.customerId || data.imeiRecordId ? "ASSIGNED" : "AVAILABLE",
      saleDate: effectiveSaleDate,
      billingCycle: data.billingCycle ?? undefined,
      expiryDate:
        effectiveSaleDate && data.billingCycle ? addBillingCycle(effectiveSaleDate, data.billingCycle) : undefined,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SIM_ASSIGNED",
    entityType: "Sim",
    entityId: sim.id,
    metadata: {
      customerId: data.customerId,
      imeiRecordId: data.imeiRecordId,
      saleDate: updated.saleDate,
      billingCycle: updated.billingCycle,
    },
  });

  res.json(updated);
}

export async function bulkAssignSims(req: Request, res: Response) {
  const data = bulkAssignSchema.parse(req.body);
  const saleDate = parseOptionalDate(data.saleDate, "sale date");

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
  if (!customer) {
    throw new AppError("Client not found", 404);
  }

  const assigned: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of data.ids) {
    try {
      const existing = await prisma.sim.findUniqueOrThrow({ where: { id } });
      const effectiveSaleDate = saleDate ?? existing.saleDate ?? new Date();
      const effectiveBillingCycle = data.billingCycle !== undefined ? data.billingCycle : existing.billingCycle;
      const sim = await prisma.sim.update({
        where: { id },
        data: {
          customer: { connect: { id: data.customerId } },
          status: "ASSIGNED",
          saleDate: effectiveSaleDate,
          ...(data.billingCycle !== undefined ? { billingCycle: data.billingCycle } : {}),
          expiryDate: effectiveBillingCycle ? addBillingCycle(effectiveSaleDate, effectiveBillingCycle) : null,
        },
      });
      assigned.push(sim.iccid);
    } catch {
      failed.push({ id, reason: "Failed to assign" });
    }
  }

  if (assigned.length > 0) {
    await logAudit(prisma, {
      userId: req.user!.sub,
      action: "SIM_BULK_ASSIGNED",
      entityType: "Sim",
      metadata: { customerId: data.customerId, count: assigned.length, iccids: assigned },
    });
  }

  res.json({ assigned, failed });
}

export async function renewSim(req: Request, res: Response) {
  const data = renewSimSchema.parse(req.body);
  const sim = await prisma.sim.findUniqueOrThrow({ where: { id: req.params.id } });

  if (!sim.customerId) {
    throw new AppError("Only a SIM assigned to a client can be renewed", 409);
  }

  // Extends from the current expiry (or sale date if no expiry yet), not from today —
  // renewing early doesn't shorten the extension.
  const previousExpiryDate = sim.expiryDate;
  const baseDate = sim.expiryDate ?? sim.saleDate ?? new Date();
  const newExpiryDate = addBillingCycle(baseDate, data.billingCycle);

  const [updated, renewal] = await prisma.$transaction([
    prisma.sim.update({
      where: { id: sim.id },
      data: { billingCycle: data.billingCycle, expiryDate: newExpiryDate },
    }),
    prisma.simRenewal.create({
      data: {
        simId: sim.id,
        billingCycle: data.billingCycle,
        previousExpiryDate,
        newExpiryDate,
        renewedById: req.user!.sub,
      },
    }),
  ]);

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SIM_RENEWED",
    entityType: "Sim",
    entityId: sim.id,
    metadata: { iccid: sim.iccid, billingCycle: data.billingCycle, previousExpiryDate, newExpiryDate },
  });

  res.json({ sim: updated, renewal });
}

export async function listSimRenewals(req: Request, res: Response) {
  const renewals = await prisma.simRenewal.findMany({
    where: { simId: req.params.id },
    include: { renewedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items: renewals });
}

export async function updateSimStatus(req: Request, res: Response) {
  const status = z.enum(["AVAILABLE", "ASSIGNED", "ACTIVE", "SUSPENDED", "CANCELLED"]).parse(req.body.status);

  const sim = await prisma.sim.update({
    where: { id: req.params.id },
    data: {
      status,
      activatedAt: status === "ACTIVE" ? new Date() : undefined,
      ...(status === "AVAILABLE" ? { customerId: null, imeiRecordId: null, saleDate: null } : {}),
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SIM_STATUS_UPDATED",
    entityType: "Sim",
    entityId: sim.id,
    metadata: { status },
  });

  res.json(sim);
}

async function deleteSimCore(id: string, userId: string): Promise<void> {
  const sim = await prisma.sim.findUniqueOrThrow({ where: { id } });

  const [installationCount, renewalCount] = await Promise.all([
    prisma.installationRecord.count({ where: { simId: id } }),
    prisma.simRenewal.count({ where: { simId: id } }),
  ]);
  if (installationCount > 0) {
    throw new AppError(`Cannot delete sim: ${installationCount} installation(s) reference this sim`, 409);
  }
  if (renewalCount > 0) {
    throw new AppError(`Cannot delete sim: ${renewalCount} renewal record(s) reference this sim`, 409);
  }

  await prisma.sim.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "SIM_DELETED",
    entityType: "Sim",
    entityId: id,
    metadata: { iccid: sim.iccid },
  });
}

export async function deleteSim(req: Request, res: Response) {
  await deleteSimCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

export async function bulkDeleteSims(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteSimCore(id, req.user!.sub);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete sim" });
    }
  }

  res.json({ deleted, failed });
}
