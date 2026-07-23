import path from "node:path";
import fs from "node:fs";
import { Request, Response } from "express";
import { prisma } from "@/config/prisma";
import { UPLOADS_DIR } from "@/config/storage";
import { AppError } from "@/utils/AppError";
import { getDefaultOrganizationId } from "@/utils/org";
import { getOrganizationLogoFile } from "@/utils/orgBranding";

// The Customer Portal (and its exports) has no per-customer organization
// concept yet (deferred multi-tenant hardening item — see project memory),
// so it always resolves to the single grandfathered default Organization.
export async function getBrandingLogoFile() {
  const organizationId = await getDefaultOrganizationId();
  return getOrganizationLogoFile(organizationId);
}

// Shared by every customer-portal PDF export that needs a branded header.
export async function getBrandingHeaderInfo() {
  const organizationId = await getDefaultOrganizationId();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, displayName: true },
  });
  const logo = await getOrganizationLogoFile(organizationId);
  return { companyName: org.displayName || org.name || "Alphatech CRM", logo };
}

export async function getBranding(_req: Request, res: Response) {
  const organizationId = await getDefaultOrganizationId();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true, displayName: true, mobileNumber: true },
  });
  const logo = await getOrganizationLogoFile(organizationId);

  res.json({
    companyName: org.displayName || org.name || "Alphatech CRM",
    phone: org.mobileNumber || null,
    hasLogo: !!logo,
  });
}

export async function getBrandingLogo(_req: Request, res: Response) {
  const logo = await getBrandingLogoFile();
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
