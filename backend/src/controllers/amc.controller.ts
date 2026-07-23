import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { createNotification } from "@/utils/notify";
import { assertCustomerInOrg, resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";
import { parseSortOrder } from "@/utils/sort";

const AMC_SORT_FIELDS: Record<string, Prisma.AmcContractOrderByWithRelationInput> = {
  contractNumber: { contractNumber: "asc" },
  customer: { customer: { name: "asc" } },
  endDate: { endDate: "asc" },
  status: { status: "asc" },
};

const EXPIRING_SOON_DAYS = 30;

// Flips ACTIVE -> EXPIRING_SOON/EXPIRED based on endDate. Never touches CANCELLED —
// that's a manual, permanent state set by staff. Called before every list read.
async function recomputeAmcStatuses() {
  const now = new Date();
  const soonCutoff = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.amcContract.updateMany({
      where: { status: { in: ["ACTIVE", "EXPIRING_SOON"] }, endDate: { lt: now } },
      data: { status: "EXPIRED" },
    }),
    prisma.amcContract.updateMany({
      where: { status: "ACTIVE", endDate: { gte: now, lte: soonCutoff } },
      data: { status: "EXPIRING_SOON" },
    }),
    prisma.amcContract.updateMany({
      where: { status: "EXPIRING_SOON", endDate: { gt: soonCutoff } },
      data: { status: "ACTIVE" },
    }),
  ]);
}

async function nextContractNumber(): Promise<string> {
  const count = await prisma.amcContract.count();
  return `AMC-${String(count + 1).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Staff CRUD
// ---------------------------------------------------------------------------

export async function listAmcContracts(req: Request, res: Response) {
  await recomputeAmcStatuses();

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;
  const organizationId = resolveOrgFilterMode(req);
  const where = { ...(organizationId ? { customer: { organizationId } } : {}), ...(status ? { status: status as never } : {}) };

  const [items, total] = await Promise.all([
    prisma.amcContract.findMany({
      where,
      include: {
        customer: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
        vehicle: true,
        imeiRecord: { include: { product: true } },
      },
      orderBy: parseSortOrder(req, AMC_SORT_FIELDS, { endDate: "asc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.amcContract.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getAmcContract(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const contract = await prisma.amcContract.findFirst({
    where: { id: req.params.id, ...(organizationId ? { customer: { organizationId } } : {}) },
    include: {
      customer: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
      vehicle: true,
      imeiRecord: { include: { product: true } },
    },
  });
  if (!contract) throw new AppError("AMC contract not found", 404);
  res.json(contract);
}

const amcSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid().optional(),
  imeiRecordId: z.string().uuid().optional(),
  startDate: z.string(),
  endDate: z.string(),
  billingAmount: z.number().positive(),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]).default("YEARLY"),
  autoRenew: z.boolean().default(false),
  notes: z.string().optional(),
});

export async function createAmcContract(req: Request, res: Response) {
  const data = amcSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  await assertCustomerInOrg(data.customerId, organizationId);
  const contractNumber = await nextContractNumber();

  const contract = await prisma.amcContract.create({
    data: {
      contractNumber,
      customerId: data.customerId,
      vehicleId: data.vehicleId,
      imeiRecordId: data.imeiRecordId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      billingAmount: data.billingAmount,
      billingCycle: data.billingCycle,
      autoRenew: data.autoRenew,
      notes: data.notes,
      createdById: req.user!.sub,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "AMC_CREATED",
    entityType: "AmcContract",
    entityId: contract.id,
    metadata: { contractNumber, customerId: data.customerId },
  });

  res.status(201).json(contract);
}

const updateSchema = amcSchema.partial().extend({ status: z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "CANCELLED"]).optional() });

export async function updateAmcContract(req: Request, res: Response) {
  const data = updateSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const existing = await prisma.amcContract.findFirst({
    where: { id: req.params.id, customer: { organizationId } },
  });
  if (!existing) throw new AppError("AMC contract not found", 404);
  if (data.customerId) {
    await assertCustomerInOrg(data.customerId, organizationId);
  }

  const contract = await prisma.amcContract.update({
    where: { id: req.params.id },
    data: {
      ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId } : {}),
      ...(data.imeiRecordId !== undefined ? { imeiRecordId: data.imeiRecordId } : {}),
      ...(data.startDate !== undefined ? { startDate: new Date(data.startDate) } : {}),
      ...(data.endDate !== undefined ? { endDate: new Date(data.endDate) } : {}),
      ...(data.billingAmount !== undefined ? { billingAmount: data.billingAmount } : {}),
      ...(data.billingCycle !== undefined ? { billingCycle: data.billingCycle } : {}),
      ...(data.autoRenew !== undefined ? { autoRenew: data.autoRenew } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "AMC_UPDATED",
    entityType: "AmcContract",
    entityId: contract.id,
  });

  res.json(contract);
}

const renewSchema = z.object({
  newEndDate: z.string(),
  billingAmount: z.number().positive().optional(),
});

export async function renewAmcContract(req: Request, res: Response) {
  const data = renewSchema.parse(req.body);
  const existing = await prisma.amcContract.findFirst({
    where: { id: req.params.id, customer: { organizationId: req.user!.organizationId! } },
  });
  if (!existing) throw new AppError("AMC contract not found", 404);

  const contract = await prisma.amcContract.update({
    where: { id: existing.id },
    data: {
      endDate: new Date(data.newEndDate),
      billingAmount: data.billingAmount ?? existing.billingAmount,
      status: "ACTIVE",
      lastRenewedAt: new Date(),
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "AMC_RENEWED",
    entityType: "AmcContract",
    entityId: contract.id,
    metadata: { previousEndDate: existing.endDate, newEndDate: contract.endDate },
  });

  await createNotification(prisma, {
    customerId: contract.customerId,
    type: "INFO",
    title: `AMC contract ${contract.contractNumber} renewed`,
    message: `Your AMC contract has been renewed until ${new Date(contract.endDate).toLocaleDateString()}.`,
  });

  res.json(contract);
}

async function deleteAmcContractCore(id: string, userId?: string | null, organizationId?: string) {
  const contract = await prisma.amcContract.findFirst({
    where: { id, ...(organizationId ? { customer: { organizationId } } : {}) },
  });
  if (!contract) throw new AppError("AMC contract not found", 404);
  await prisma.amcContract.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "AMC_DELETED",
    entityType: "AmcContract",
    entityId: id,
    metadata: { contractNumber: contract.contractNumber, customerId: contract.customerId },
  });
}

export async function deleteAmcContract(req: Request, res: Response) {
  await deleteAmcContractCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function bulkDeleteAmcContracts(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteAmcContractCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}

// ---------------------------------------------------------------------------
// Customer-side
// ---------------------------------------------------------------------------

export async function listMyAmcContracts(req: Request, res: Response) {
  await recomputeAmcStatuses();
  const contracts = await prisma.amcContract.findMany({
    where: { customerId: req.customer!.sub },
    include: { vehicle: true },
    orderBy: { endDate: "asc" },
  });
  res.json({ items: contracts });
}
