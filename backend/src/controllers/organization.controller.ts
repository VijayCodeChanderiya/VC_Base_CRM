import path from "node:path";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { Prisma, BillingStatus, Role } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";
import { UPLOADS_DIR } from "@/config/storage";
import { getOrganizationLogoFile, deleteOrganizationLogos } from "@/utils/orgBranding";
import { assertUnderLimit } from "@/utils/entitlements";
import { optionalPhoneSchema, emailSchema } from "@/utils/validators";
import { loadWorkbookSheet, mapRowByHeader, cellToString } from "@/utils/bulkUpload";

const ORG_SORT_FIELDS: Record<string, Prisma.OrganizationOrderByWithRelationInput> = {
  name: { name: "asc" },
  slug: { slug: "asc" },
  billingStatus: { billingStatus: "asc" },
  createdAt: { createdAt: "asc" },
};

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function listOrganizations(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);

  const [items, total] = await Promise.all([
    prisma.organization.findMany({
      include: {
        plan: { select: { id: true, name: true, code: true } },
        _count: { select: { branches: true, users: true } },
      },
      orderBy: parseSortOrder(req, ORG_SORT_FIELDS, { createdAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.organization.count(),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getPlatformStats(_req: Request, res: Response) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalOrganizations,
    activeOrganizations,
    trialOrganizations,
    totalCustomers,
    totalProducts,
    totalUsers,
    salesThisMonthCount,
    revenueThisMonthAgg,
    topOrganizationsByRevenue,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { isActive: true, billingStatus: "ACTIVE" } }),
    prisma.organization.count({ where: { billingStatus: "TRIAL" } }),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.user.count({ where: { role: { not: "SUPER_ADMIN" } } }),
    prisma.sale.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.sale.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { grandTotal: true } }),
    prisma.sale.groupBy({
      by: ["branchId"],
      where: { createdAt: { gte: startOfMonth } },
      _sum: { grandTotal: true },
    }),
  ]);

  // Roll branch-level revenue up to organizations for the "top organizations" leaderboard.
  const branchIds = topOrganizationsByRevenue.map((r) => r.branchId);
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, organizationId: true, organization: { select: { name: true } } },
  });
  const branchToOrg = new Map(branches.map((b) => [b.id, { id: b.organizationId, name: b.organization.name }]));
  const revenueByOrg = new Map<string, { name: string; revenue: number }>();
  for (const row of topOrganizationsByRevenue) {
    const org = branchToOrg.get(row.branchId);
    if (!org) continue;
    const current = revenueByOrg.get(org.id) ?? { name: org.name, revenue: 0 };
    current.revenue += Number(row._sum.grandTotal ?? 0);
    revenueByOrg.set(org.id, current);
  }
  const topOrganizations = [...revenueByOrg.entries()]
    .map(([id, v]) => ({ organizationId: id, name: v.name, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  res.json({
    totalOrganizations,
    activeOrganizations,
    trialOrganizations,
    totalCustomers,
    totalProducts,
    totalUsers,
    salesThisMonth: salesThisMonthCount,
    revenueThisMonth: Number(revenueThisMonthAgg._sum.grandTotal ?? 0),
    topOrganizations,
  });
}

export async function getOrganization(req: Request, res: Response) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      plan: { include: { planFeatures: { include: { feature: true } } } },
      branches: { select: { id: true, code: true, name: true, isActive: true } },
      users: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      featureOverrides: { include: { feature: true } },
    },
  });
  const logo = await getOrganizationLogoFile(org.id);
  res.json({ ...org, hasLogo: !!logo });
}

export async function getOrganizationLogo(req: Request, res: Response) {
  const logo = await getOrganizationLogoFile(req.params.id);
  if (!logo) {
    throw new AppError("No logo uploaded", 404);
  }
  const fullPath = path.join(UPLOADS_DIR, logo.path);
  if (!fs.existsSync(fullPath)) {
    throw new AppError("Logo file missing from storage", 404);
  }
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(fullPath);
}

export async function deleteOrganizationLogo(req: Request, res: Response) {
  const removed = await deleteOrganizationLogos(req.params.id);
  if (removed === 0) {
    throw new AppError("No logo uploaded", 404);
  }

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ORGANIZATION_LOGO_REMOVED",
    entityType: "Organization",
    entityId: req.params.id,
    metadata: { removed },
  });

  res.status(204).send();
}

const profileFields = {
  displayName: z.string().trim().optional().nullable(),
  companyEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  mobileNumber: z.string().trim().optional().nullable(),
  alternateContactNumber: z.string().trim().optional().nullable(),
  gstNumber: z.string().trim().optional().nullable(),
  panNumber: z.string().trim().optional().nullable(),
  cinNumber: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  industryType: z.string().trim().optional().nullable(),
  businessType: z.string().trim().optional().nullable(),
  addressLine1: z.string().trim().optional().nullable(),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  country: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  ownerName: z.string().trim().optional().nullable(),
  ownerDesignation: z.string().trim().optional().nullable(),
  ownerEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  ownerMobile: z.string().trim().optional().nullable(),
};

const createOrgSchema = z.object({
  name: z.string().trim().min(2),
  planId: z.string().uuid().optional(),
  billingStatus: z.nativeEnum(BillingStatus).optional(),
  trialEndsAt: z.string().optional(),
  notes: z.string().optional(),
  ...profileFields,
});

async function createOrganizationCore(data: z.infer<typeof createOrgSchema>, userId: string) {
  const baseSlug = slugify(data.name);
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${++suffix}`;
  }
  const { name, planId, billingStatus, trialEndsAt, notes, ...profile } = data;

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name,
        slug,
        planId,
        billingStatus: billingStatus ?? "TRIAL",
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : undefined,
        notes,
        ...profile,
      },
    });
    await tx.branch.create({
      data: { code: "MAIN", name: "Main Branch", organizationId: created.id },
    });
    return created;
  });

  await logAudit(prisma, {
    userId,
    action: "ORGANIZATION_CREATED",
    entityType: "Organization",
    entityId: org.id,
    metadata: { name: org.name, slug: org.slug },
  });

  return org;
}

export async function createOrganization(req: Request, res: Response) {
  const data = createOrgSchema.parse(req.body);
  const org = await createOrganizationCore(data, req.user!.sub);
  res.status(201).json(org);
}

const updateOrgSchema = z.object({
  name: z.string().trim().min(2).optional(),
  planId: z.string().uuid().nullable().optional(),
  billingStatus: z.nativeEnum(BillingStatus).optional(),
  trialEndsAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  ...profileFields,
});

export async function updateOrganization(req: Request, res: Response) {
  const data = updateOrgSchema.parse(req.body);
  const { name, planId, billingStatus, trialEndsAt, notes, isActive, ...profile } = data;

  const org = await prisma.organization.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(planId !== undefined ? { planId } : {}),
      ...(billingStatus !== undefined ? { billingStatus } : {}),
      ...(trialEndsAt !== undefined ? { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...profile,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ORGANIZATION_UPDATED",
    entityType: "Organization",
    entityId: org.id,
    metadata: data,
  });

  res.json(org);
}

// ---------------------------------------------------------------------------
// Users — creating an org's first login is not optional: without at least one
// User row, nobody can ever sign into the organization createOrganization()
// just provisioned. Folded in here (not user.controller.ts) since only
// SUPER_ADMIN can target an arbitrary organizationId this way.
// ---------------------------------------------------------------------------

const createOrgUserSchema = z.object({
  name: z.string().trim().min(2),
  email: emailSchema,
  phone: optionalPhoneSchema,
  password: z.string().min(8),
  role: z.nativeEnum(Role).default("ADMIN"),
});

export async function createOrganizationUser(req: Request, res: Response) {
  const data = createOrgUserSchema.parse(req.body);
  const organizationId = req.params.id;

  if (data.role === Role.SUPER_ADMIN) {
    throw new AppError("SUPER_ADMIN accounts cannot belong to an organization", 422);
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("Email already in use", 409);
  }

  await assertUnderLimit(organizationId, "maxUsers", await prisma.user.count({ where: { organizationId } }));

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role,
      organizationId,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ORGANIZATION_USER_CREATED",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { userId: user.id, email: user.email, role: user.role },
  });

  res.status(201).json(user);
}

// ---------------------------------------------------------------------------
// Per-organization feature overrides — folded into this controller since they're
// always viewed/edited in the context of one org, not a standalone screen.
// ---------------------------------------------------------------------------

const overrideSchema = z.object({
  featureId: z.string().uuid(),
  boolValue: z.boolean().nullable().optional(),
  numValue: z.number().int().nullable().optional(),
  reason: z.string().optional(),
});

export async function upsertOrganizationOverride(req: Request, res: Response) {
  const data = overrideSchema.parse(req.body);
  const organizationId = req.params.orgId;

  const override = await prisma.organizationFeatureOverride.upsert({
    where: { organizationId_featureId: { organizationId, featureId: data.featureId } },
    create: {
      organizationId,
      featureId: data.featureId,
      boolValue: data.boolValue ?? undefined,
      numValue: data.numValue ?? undefined,
      reason: data.reason,
      createdById: req.user!.sub,
    },
    update: {
      boolValue: data.boolValue ?? undefined,
      numValue: data.numValue ?? undefined,
      reason: data.reason,
      createdById: req.user!.sub,
    },
    include: { feature: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ORG_OVERRIDE_SET",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { featureKey: override.feature.key, boolValue: data.boolValue, numValue: data.numValue },
  });

  res.json(override);
}

export async function deleteOrganizationOverride(req: Request, res: Response) {
  const organizationId = req.params.orgId;
  const featureId = req.params.featureId;

  const existing = await prisma.organizationFeatureOverride.findUnique({
    where: { organizationId_featureId: { organizationId, featureId } },
    include: { feature: true },
  });
  if (!existing) {
    throw new AppError("Override not found", 404);
  }

  await prisma.organizationFeatureOverride.delete({
    where: { organizationId_featureId: { organizationId, featureId } },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ORG_OVERRIDE_RESET",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { featureKey: existing.feature.key },
  });

  res.status(204).send();
}

// ---------------------------------------------------------------------------
// Bulk upload — one row = one Organization, reusing createOrganizationCore
// (same slug-generation + MAIN branch creation as the single-record create
// form). Admin-login credentials are intentionally NOT part of this upload —
// they're a separate step (createOrganizationUser) so no passwords ever sit
// in a spreadsheet.
// ---------------------------------------------------------------------------

export const organizationUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("file");

const ORGANIZATION_TEMPLATE_COLUMNS: { header: string; key: string; match: (h: string) => boolean }[] = [
  { header: "Organization Name", key: "name", match: (h) => h.includes("organizationname") || h === "name" },
  { header: "Display Name", key: "displayName", match: (h) => h.includes("displayname") },
  { header: "Company Email", key: "companyEmail", match: (h) => h.includes("companyemail") },
  { header: "Mobile Number", key: "mobileNumber", match: (h) => h.includes("mobilenumber") },
  { header: "Alternate Contact Number", key: "alternateContactNumber", match: (h) => h.includes("alternatecontact") },
  { header: "Website", key: "website", match: (h) => h === "website" },
  { header: "GST Number", key: "gstNumber", match: (h) => h.includes("gst") },
  { header: "PAN Number", key: "panNumber", match: (h) => h.includes("pan") },
  { header: "CIN Number", key: "cinNumber", match: (h) => h.includes("cin") },
  { header: "Industry Type", key: "industryType", match: (h) => h.includes("industrytype") },
  { header: "Business Type", key: "businessType", match: (h) => h.includes("businesstype") },
  { header: "Address Line 1", key: "addressLine1", match: (h) => h.includes("addressline1") },
  { header: "Address Line 2", key: "addressLine2", match: (h) => h.includes("addressline2") },
  { header: "City", key: "city", match: (h) => h === "city" },
  { header: "State", key: "state", match: (h) => h === "state" },
  { header: "Country", key: "country", match: (h) => h === "country" },
  { header: "Pincode", key: "pincode", match: (h) => h === "pincode" },
  { header: "Owner Name", key: "ownerName", match: (h) => h.includes("ownername") },
  { header: "Owner Designation", key: "ownerDesignation", match: (h) => h.includes("ownerdesignation") },
  { header: "Owner Email", key: "ownerEmail", match: (h) => h.includes("owneremail") },
  { header: "Owner Mobile", key: "ownerMobile", match: (h) => h.includes("ownermobile") },
  { header: "Plan Code", key: "planCode", match: (h) => h.includes("plancode") },
  {
    header: "Billing Status (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED)",
    key: "billingStatus",
    match: (h) => h.includes("billingstatus"),
  },
  { header: "Notes", key: "notes", match: (h) => h.includes("notes") },
];

const ORGANIZATION_SAMPLE_ROWS = [
  {
    name: "Acme GPS Solutions",
    displayName: "Acme GPS",
    companyEmail: "contact@acmegps.example",
    mobileNumber: "9876543210",
    alternateContactNumber: "",
    website: "https://acmegps.example",
    gstNumber: "27ABCDE1234F1Z5",
    panNumber: "ABCDE1234F",
    cinNumber: "",
    industryType: "GPS Tracking",
    businessType: "Reseller",
    addressLine1: "45 Industrial Estate",
    addressLine2: "",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    pincode: "411019",
    ownerName: "Priya Verma",
    ownerDesignation: "Founder",
    ownerEmail: "priya@acmegps.example",
    ownerMobile: "9876500000",
    planCode: "",
    billingStatus: "TRIAL",
    notes: "",
  },
];

async function buildOrganizationTemplateWorkbook(withSample: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Organizations");
  sheet.columns = ORGANIZATION_TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };
  if (withSample) {
    for (const row of ORGANIZATION_SAMPLE_ROWS) sheet.addRow(row);
    sheet.addRow({});
    sheet.addRow({ name: "Delete the example row(s) above before uploading your own data." });
  }
  return workbook;
}

export async function downloadOrganizationBulkTemplate(req: Request, res: Response) {
  const withSample = req.query.sample === "1";
  const workbook = await buildOrganizationTemplateWorkbook(withSample);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${withSample ? "Organizations sample file" : "Organizations bulk upload template"}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}

export async function bulkUploadOrganizationsFromExcel(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No file uploaded", 422);
  }
  const userId = req.user!.sub;
  const sheet = await loadWorkbookSheet(req.file.buffer);

  const headerRow = sheet.getRow(1);
  const columnIndex = mapRowByHeader(headerRow, ORGANIZATION_TEMPLATE_COLUMNS);

  if (!columnIndex.name) {
    throw new AppError('Could not find an "Organization Name" column in the uploaded file', 422);
  }

  const created: { id: string; name: string; slug: string }[] = [];
  const failed: { row: number; reason: string }[] = [];
  let totalRows = 0;

  for (const row of sheet.getRows(2, Math.max(0, sheet.rowCount - 1)) ?? []) {
    const rowNumber = row.number;
    const name = columnIndex.name ? cellToString(row.getCell(columnIndex.name).value) : "";
    if (!name) continue;
    totalRows += 1;

    try {
      const rowData: Record<string, unknown> = { name };
      for (const col of ORGANIZATION_TEMPLATE_COLUMNS) {
        if (col.key === "name") continue;
        const idx = columnIndex[col.key];
        if (!idx) continue;
        const raw = cellToString(row.getCell(idx).value);
        if (raw === "") continue;
        rowData[col.key] = raw;
      }

      const planCode = (rowData.planCode as string | undefined)?.trim();
      delete rowData.planCode;
      if (planCode) {
        const plan = await prisma.plan.findFirst({ where: { code: planCode } });
        if (!plan) {
          throw new AppError(`Plan with code "${planCode}" not found`, 404);
        }
        rowData.planId = plan.id;
      }

      const data = createOrgSchema.parse(rowData);
      const org = await createOrganizationCore(data, userId);
      created.push({ id: org.id, name: org.name, slug: org.slug });
    } catch (err) {
      failed.push({
        row: rowNumber,
        reason:
          err instanceof z.ZodError
            ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
            : err instanceof AppError
              ? err.message
              : "Failed to create organization",
      });
    }
  }

  if (totalRows === 0) {
    throw new AppError("No organization rows found in the uploaded file", 422);
  }

  res.status(201).json({ totalRows, created, failed });
}
