import path from "node:path";
import fs from "node:fs";
import { Request, Response } from "express";
import { prisma } from "@/config/prisma";
import { UPLOADS_DIR } from "@/config/storage";
import { AppError } from "@/utils/AppError";

export const BRANDING_LOGO_ENTITY = { entityType: "Branding", entityId: "logo" } as const;

export async function getBrandingLogoFile() {
  return prisma.file.findFirst({
    where: BRANDING_LOGO_ENTITY,
    orderBy: { createdAt: "desc" },
  });
}

export async function getBranding(_req: Request, res: Response) {
  const setting = await prisma.setting.findUnique({ where: { key: "companyProfile" } });
  const profile = (setting?.value as Record<string, unknown>) ?? {};
  const logo = await getBrandingLogoFile();

  res.json({
    companyName: (profile.companyName as string) || "Alphatech CRM",
    phone: (profile.phone as string) || null,
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
  res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(fullPath);
}
