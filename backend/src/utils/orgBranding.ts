import path from "node:path";
import fs from "node:fs";
import { prisma } from "@/config/prisma";
import { UPLOADS_DIR } from "@/config/storage";

export async function getOrganizationLogoFile(organizationId: string) {
  return prisma.file.findFirst({
    where: { entityType: "Organization", entityId: organizationId },
    orderBy: { createdAt: "desc" },
  });
}

// Removes every File row tagged to this org's logo (not just the most recent) —
// each upload creates a new row rather than replacing one, so this also cleans
// up the orphaned rows left behind by prior "change logo" uploads.
export async function deleteOrganizationLogos(organizationId: string) {
  const files = await prisma.file.findMany({ where: { entityType: "Organization", entityId: organizationId } });
  for (const file of files) {
    const fullPath = path.join(UPLOADS_DIR, file.path);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
  await prisma.file.deleteMany({ where: { entityType: "Organization", entityId: organizationId } });
  return files.length;
}
