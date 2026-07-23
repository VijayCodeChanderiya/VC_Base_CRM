import { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { phoneSchema, optionalEmailSchema, optionalPhoneSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";
import { loadWorkbookSheet, mapRowByHeader, cellToString } from "@/utils/bulkUpload";

const SUPPLIER_SORT_FIELDS: Record<string, Prisma.SupplierOrderByWithRelationInput> = {
  name: { name: "asc" },
  phone: { phone: "asc" },
  email: { email: "asc" },
  contactPerson: { contactPerson: "asc" },
};

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

const supplierSchema = z.object({
  name: z.string().min(1),
  phone: phoneSchema,
  email: optionalEmailSchema,
  contactPerson: z.string().optional(),
  alternatePhone: optionalPhoneSchema,
  address: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankAccountHolder: z.string().optional(),
  categorySupplied: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

export async function listSuppliers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { organizationId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: { organization: { select: ORG_SUMMARY_SELECT } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, SUPPLIER_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.supplier.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getSupplier(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const supplier = await prisma.supplier.findFirst({
    where: { id: req.params.id, ...(organizationId ? { organizationId } : {}) },
    include: {
      organization: { select: ORG_SUMMARY_SELECT },
      purchases: { orderBy: { createdAt: "desc" } },
      products: true,
    },
  });
  if (!supplier) throw new AppError("Supplier not found", 404);
  res.json(supplier);
}

export async function createSupplier(req: Request, res: Response) {
  const data = supplierSchema.parse(req.body);
  const supplier = await prisma.supplier.create({ data: { ...data, organizationId: req.user!.organizationId! } });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SUPPLIER_CREATED",
    entityType: "Supplier",
    entityId: supplier.id,
    metadata: { name: supplier.name, phone: supplier.phone },
  });

  res.status(201).json(supplier);
}

export async function updateSupplier(req: Request, res: Response) {
  const data = supplierSchema.partial().parse(req.body);
  const existing = await prisma.supplier.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId! },
  });
  if (!existing) throw new AppError("Supplier not found", 404);

  const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data });
  res.json(supplier);
}

async function deleteSupplierCore(id: string, userId: string, organizationId: string): Promise<void> {
  const supplier = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!supplier) throw new AppError("Supplier not found", 404);

  const [purchaseCount, productCount, rmaCount] = await Promise.all([
    prisma.purchase.count({ where: { supplierId: id } }),
    prisma.product.count({ where: { supplierId: id } }),
    prisma.rma.count({ where: { supplierId: id } }),
  ]);

  const blockers: string[] = [];
  if (purchaseCount > 0) blockers.push(`${purchaseCount} purchase(s)`);
  if (productCount > 0) blockers.push(`${productCount} product(s)`);
  if (rmaCount > 0) blockers.push(`${rmaCount} RMA(s)`);

  if (blockers.length > 0) {
    throw new AppError(`Cannot delete supplier: ${blockers.join(", ")} reference this supplier`, 409);
  }

  await prisma.supplier.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "SUPPLIER_DELETED",
    entityType: "Supplier",
    entityId: id,
    metadata: { name: supplier.name },
  });
}

export async function deleteSupplier(req: Request, res: Response) {
  await deleteSupplierCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

export async function bulkDeleteSuppliers(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteSupplierCore(id, req.user!.sub, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete supplier" });
    }
  }

  res.json({ deleted, failed });
}

// ---------------------------------------------------------------------------
// Bulk upload — mirrors the SIM bulk-upload pattern (multer memory storage +
// ExcelJS), reusing supplierSchema/createSupplier's own creation shape so
// bulk and single-record creation stay in sync.
// ---------------------------------------------------------------------------

export const supplierUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const SUPPLIER_TEMPLATE_COLUMNS: {
  header: string;
  key: keyof z.infer<typeof supplierSchema>;
  match: (h: string) => boolean;
}[] = [
  { header: "Supplier Name", key: "name", match: (h) => h === "suppliername" || h === "name" },
  { header: "Phone", key: "phone", match: (h) => h === "phone" },
  { header: "Email", key: "email", match: (h) => h === "email" },
  { header: "Contact Person Name", key: "contactPerson", match: (h) => h.includes("contactperson") },
  { header: "Alternate Phone", key: "alternatePhone", match: (h) => h.includes("alternatephone") },
  { header: "Address Line 1", key: "address", match: (h) => h === "addressline1" || h === "address" },
  { header: "Address Line 2", key: "addressLine2", match: (h) => h.includes("addressline2") },
  { header: "City", key: "city", match: (h) => h === "city" },
  { header: "State", key: "state", match: (h) => h === "state" },
  { header: "Pincode", key: "pincode", match: (h) => h === "pincode" },
  { header: "Country", key: "country", match: (h) => h === "country" },
  { header: "GSTIN / Tax ID", key: "gstNumber", match: (h) => h.includes("gst") },
  { header: "PAN Number", key: "panNumber", match: (h) => h.includes("pan") },
  { header: "Category / Products Supplied", key: "categorySupplied", match: (h) => h.includes("category") },
  { header: "Credit Limit", key: "creditLimit", match: (h) => h.includes("creditlimit") },
  { header: "Website", key: "website", match: (h) => h === "website" },
  { header: "Account Number", key: "bankAccountNumber", match: (h) => h.includes("accountnumber") },
  { header: "IFSC", key: "bankIfsc", match: (h) => h.includes("ifsc") },
  { header: "Account Holder Name", key: "bankAccountHolder", match: (h) => h.includes("accountholder") },
  { header: "Notes / Remarks", key: "notes", match: (h) => h.includes("notes") || h.includes("remarks") },
];

const SUPPLIER_SAMPLE_ROWS = [
  {
    name: "Acme Distributors",
    phone: "9876543210",
    email: "sales@acmedist.example",
    contactPerson: "Rahul Sharma",
    alternatePhone: "",
    address: "12 MG Road",
    addressLine2: "",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    country: "India",
    gstNumber: "27ABCDE1234F1Z5",
    panNumber: "ABCDE1234F",
    categorySupplied: "GPS Trackers",
    creditLimit: "50000",
    website: "https://acmedist.example",
    bankAccountNumber: "",
    bankIfsc: "",
    bankAccountHolder: "",
    notes: "",
  },
];

async function buildSupplierTemplateWorkbook(withSample: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Suppliers");
  sheet.columns = SUPPLIER_TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  if (withSample) {
    for (const row of SUPPLIER_SAMPLE_ROWS) sheet.addRow(row);
    sheet.addRow({});
    sheet.addRow({ name: "Delete the example row(s) above before uploading your own data." });
  }
  return workbook;
}

export async function downloadSupplierBulkTemplate(req: Request, res: Response) {
  const withSample = req.query.sample === "1";
  const workbook = await buildSupplierTemplateWorkbook(withSample);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${withSample ? "Suppliers sample file" : "Suppliers bulk upload template"}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}

export async function bulkUploadSuppliersFromExcel(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No file uploaded", 422);
  }
  const organizationId = req.user!.organizationId!;
  const sheet = await loadWorkbookSheet(req.file.buffer);

  const headerRow = sheet.getRow(1);
  const columnIndex = mapRowByHeader(
    headerRow,
    SUPPLIER_TEMPLATE_COLUMNS.map((c) => ({ key: c.key, match: c.match }))
  );

  if (!columnIndex.name || !columnIndex.phone) {
    throw new AppError('Could not find "Supplier Name" and "Phone" columns in the uploaded file', 422);
  }

  const created: string[] = [];
  const failed: { row: number; reason: string }[] = [];
  let totalRows = 0;

  for (const row of sheet.getRows(2, sheet.rowCount - 1) ?? []) {
    const rowNumber = row.number;
    const rawName = columnIndex.name ? cellToString(row.getCell(columnIndex.name).value) : "";
    if (!rawName) continue; // skip blank/instructional rows
    totalRows += 1;

    try {
      const rowData: Record<string, unknown> = {};
      for (const col of SUPPLIER_TEMPLATE_COLUMNS) {
        const idx = columnIndex[col.key];
        if (!idx) continue;
        const raw = cellToString(row.getCell(idx).value);
        if (raw === "") continue;
        rowData[col.key] = col.key === "creditLimit" ? Number(raw) : raw;
      }

      const data = supplierSchema.parse(rowData);
      const supplier = await prisma.supplier.create({ data: { ...data, organizationId } });
      await logAudit(prisma, {
        userId: req.user!.sub,
        action: "SUPPLIER_CREATED",
        entityType: "Supplier",
        entityId: supplier.id,
        metadata: { name: supplier.name, phone: supplier.phone, bulkUpload: true },
      });
      created.push(supplier.id);
    } catch (err) {
      failed.push({
        row: rowNumber,
        reason:
          err instanceof z.ZodError
            ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            : err instanceof AppError
              ? err.message
              : err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
                ? "A supplier with this phone number already exists"
                : "Failed to create supplier",
      });
    }
  }

  if (totalRows === 0) {
    throw new AppError("No supplier rows found in the uploaded file", 422);
  }

  res.status(201).json({ totalRows, created, failed });
}
