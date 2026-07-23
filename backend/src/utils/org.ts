import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";

let defaultOrganizationIdCache: string | null = null;

export async function getDefaultOrganizationId(): Promise<string> {
  if (defaultOrganizationIdCache) return defaultOrganizationIdCache;
  const org = await prisma.organization.findUnique({ where: { slug: "alphatech-default" } });
  if (!org) throw new AppError("No default organization configured", 500);
  defaultOrganizationIdCache = org.id;
  return org.id;
}
