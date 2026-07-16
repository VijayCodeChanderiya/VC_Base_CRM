import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";

let defaultBranchIdCache: string | null = null;

export async function getDefaultBranchId(): Promise<string> {
  if (defaultBranchIdCache) return defaultBranchIdCache;

  const branch = await prisma.branch.findUnique({ where: { code: "MAIN" } });
  if (!branch) {
    throw new AppError("No default branch configured", 500);
  }
  defaultBranchIdCache = branch.id;
  return branch.id;
}

export async function resolveBranchId(branchId?: string): Promise<string> {
  if (branchId) return branchId;
  return getDefaultBranchId();
}
