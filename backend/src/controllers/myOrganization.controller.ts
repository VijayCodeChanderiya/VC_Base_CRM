import path from "node:path";
import fs from "node:fs";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { UPLOADS_DIR } from "@/config/storage";
import { getOrganizationLogoFile, deleteOrganizationLogos } from "@/utils/orgBranding";
import { logAudit } from "@/utils/audit";

function requireOrgId(req: Request): string {
  const organizationId = req.user!.organizationId;
  if (!organizationId) {
    throw new AppError("SUPER_ADMIN accounts have no organization", 400);
  }
  return organizationId;
}

export async function getMyOrganization(req: Request, res: Response) {
  const organizationId = requireOrgId(req);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: { plan: { select: { id: true, name: true, code: true } } },
  });
  res.json(org);
}

export async function getMyOrganizationBranding(req: Request, res: Response) {
  const organizationId = req.user!.organizationId;
  if (!organizationId) {
    return res.json({ name: "Alphatech Platform", displayName: null, hasLogo: false });
  }
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, displayName: true },
  });
  const logo = await getOrganizationLogoFile(organizationId);
  res.json({ name: org.name, displayName: org.displayName, hasLogo: !!logo });
}

export async function getMyOrganizationLogo(req: Request, res: Response) {
  const organizationId = requireOrgId(req);
  const logo = await getOrganizationLogoFile(organizationId);
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

export async function deleteMyOrganizationLogo(req: Request, res: Response) {
  const organizationId = requireOrgId(req);
  const removed = await deleteOrganizationLogos(organizationId);
  if (removed === 0) {
    throw new AppError("No logo uploaded", 404);
  }

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "ORGANIZATION_LOGO_REMOVED",
    entityType: "Organization",
    entityId: organizationId,
    metadata: { removed },
  });

  res.status(204).send();
}

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
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
});

export async function updateMyOrganization(req: Request, res: Response) {
  const organizationId = requireOrgId(req);
  const data = updateSchema.parse(req.body);

  const org = await prisma.organization.update({
    where: { id: organizationId },
    data,
  });

  res.json(org);
}
