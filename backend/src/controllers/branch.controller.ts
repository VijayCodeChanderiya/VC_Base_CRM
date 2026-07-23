import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";
import { assertUnderLimit } from "@/utils/entitlements";

const BRANCH_SORT_FIELDS: Record<string, Prisma.BranchOrderByWithRelationInput> = {
  code: { code: "asc" },
  name: { name: "asc" },
  address: { address: "asc" },
  isActive: { isActive: "asc" },
};

const branchSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  name: z.string().min(1),
  address: z.string().optional(),
});

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function listBranches(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const organizationId = req.user!.organizationId;

  // SUPER_ADMIN has no organizationId (platform-level, not tenant-scoped) — this
  // tenant-facing endpoint isn't meaningful for them, so return an empty page rather
  // than erroring; they manage branches per-org via the Platform > Organizations screens.
  if (!organizationId) {
    return res.json({ items: [], total: 0, page, pageSize });
  }

  const [branches, total] = await Promise.all([
    prisma.branch.findMany({
      where: { organizationId },
      orderBy: parseSortOrder(req, BRANCH_SORT_FIELDS, { createdAt: "asc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.branch.count({ where: { organizationId } }),
  ]);

  res.json({ items: branches, total, page, pageSize });
}

export async function createBranch(req: Request, res: Response) {
  const data = branchSchema.parse(req.body);
  const organizationId = req.user!.organizationId;
  if (!organizationId) {
    throw new AppError("SUPER_ADMIN accounts cannot create branches directly — use Platform > Organizations", 400);
  }

  await assertUnderLimit(
    organizationId,
    "maxBranches",
    await prisma.branch.count({ where: { organizationId } })
  );

  const branch = await prisma.branch.create({ data: { ...data, organizationId } });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "BRANCH_CREATED",
    entityType: "Branch",
    entityId: branch.id,
    metadata: { name: branch.name, code: branch.code },
  });

  res.status(201).json(branch);
}

export async function updateBranch(req: Request, res: Response) {
  const data = branchSchema.partial().parse(req.body);
  const branch = await prisma.branch.update({ where: { id: req.params.id }, data });
  res.json(branch);
}

async function deleteBranchCore(id: string, userId: string): Promise<void> {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id } });

  const [saleCount, purchaseCount, inventoryCount, imeiCount, simCount, installationCount, rmaCount] =
    await Promise.all([
      prisma.sale.count({ where: { branchId: id } }),
      prisma.purchase.count({ where: { branchId: id } }),
      prisma.inventory.count({ where: { branchId: id } }),
      prisma.imeiRecord.count({ where: { branchId: id } }),
      prisma.sim.count({ where: { branchId: id } }),
      prisma.installationRecord.count({ where: { branchId: id } }),
      prisma.rma.count({ where: { branchId: id } }),
    ]);

  const blockers: string[] = [];
  if (saleCount > 0) blockers.push(`${saleCount} sale(s)`);
  if (purchaseCount > 0) blockers.push(`${purchaseCount} purchase(s)`);
  if (inventoryCount > 0) blockers.push(`${inventoryCount} inventory row(s)`);
  if (imeiCount > 0) blockers.push(`${imeiCount} IMEI record(s)`);
  if (simCount > 0) blockers.push(`${simCount} sim(s)`);
  if (installationCount > 0) blockers.push(`${installationCount} installation(s)`);
  if (rmaCount > 0) blockers.push(`${rmaCount} RMA(s)`);

  if (blockers.length > 0) {
    throw new AppError(`Cannot delete branch: ${blockers.join(", ")} reference this branch`, 409);
  }

  await prisma.branch.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "BRANCH_DELETED",
    entityType: "Branch",
    entityId: id,
    metadata: { name: branch.name, code: branch.code },
  });
}

export async function deleteBranch(req: Request, res: Response) {
  await deleteBranchCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

export async function bulkDeleteBranches(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteBranchCore(id, req.user!.sub);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete branch" });
    }
  }

  res.json({ deleted, failed });
}
