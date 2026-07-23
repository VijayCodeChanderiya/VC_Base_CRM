import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";

const defaultBranchIdCache = new Map<string, string>();

export async function getDefaultBranchId(organizationId: string): Promise<string> {
  const cached = defaultBranchIdCache.get(organizationId);
  if (cached) return cached;

  const branch = await prisma.branch.findFirst({ where: { code: "MAIN", organizationId } });
  if (!branch) {
    throw new AppError("No default branch configured", 500);
  }
  defaultBranchIdCache.set(organizationId, branch.id);
  return branch.id;
}

// Resolves a branchId for the caller's own organization, validating ownership when a
// caller-supplied branchId is given (a foreign branchId — from another organization —
// is rejected rather than silently trusted).
export async function resolveBranchId(organizationId: string, branchId?: string): Promise<string> {
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId } });
    if (!branch) {
      throw new AppError("Branch not found in your organization", 403);
    }
    return branch.id;
  }
  return getDefaultBranchId(organizationId);
}
