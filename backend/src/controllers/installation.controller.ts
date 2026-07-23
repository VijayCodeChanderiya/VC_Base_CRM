import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { resolveBranchId } from "@/utils/branch";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const INSTALLATION_SORT_FIELDS: Record<string, Prisma.InstallationRecordOrderByWithRelationInput> = {
  vehicle: { vehicle: { registrationNumber: "asc" } },
  owner: { vehicle: { ownerCustomer: { name: "asc" } } },
  device: { imeiRecord: { product: { name: "asc" } } },
  sim: { sim: { iccid: "asc" } },
  installer: { installer: { name: "asc" } },
  status: { status: "asc" },
};

const installationSchema = z.object({
  vehicleId: z.string().uuid(),
  imeiRecordId: z.string().uuid(),
  simId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  scheduledDate: z.string().datetime().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "REMOVED", "CANCELLED"]),
  notes: z.string().optional(),
});

export async function listInstallations(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;
  const branchId = req.query.branchId as string | undefined;
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { branch: { organizationId } } : {}),
    ...(status ? { status: status as never } : {}),
    ...(branchId ? { branchId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.installationRecord.findMany({
      where,
      include: {
        vehicle: { include: { ownerCustomer: true } },
        imeiRecord: { include: { product: true } },
        sim: true,
        installer: { select: { id: true, name: true } },
        branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, INSTALLATION_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.installationRecord.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function createInstallation(req: Request, res: Response) {
  const data = installationSchema.parse(req.body);
  const branchId = await resolveBranchId(req.user!.organizationId!, data.branchId);
  const userId = req.user!.sub;

  const installation = await prisma.installationRecord.create({
    data: {
      vehicleId: data.vehicleId,
      imeiRecordId: data.imeiRecordId,
      simId: data.simId,
      installedBy: userId,
      branchId,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
      location: data.location,
      notes: data.notes,
      status: "SCHEDULED",
    },
    include: { vehicle: true, imeiRecord: { include: { product: true } }, sim: true },
  });

  if (data.simId) {
    await prisma.sim.update({ where: { id: data.simId }, data: { imeiRecordId: data.imeiRecordId } });
  }

  await logAudit(prisma, {
    userId,
    action: "INSTALLATION_SCHEDULED",
    entityType: "InstallationRecord",
    entityId: installation.id,
  });

  res.status(201).json(installation);
}

export async function updateInstallationStatus(req: Request, res: Response) {
  const data = statusUpdateSchema.parse(req.body);

  const installation = await prisma.installationRecord.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      notes: data.notes,
      installedDate: data.status === "COMPLETED" ? new Date() : undefined,
      removedDate: data.status === "REMOVED" ? new Date() : undefined,
    },
    include: { vehicle: true, imeiRecord: { include: { product: true } }, sim: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "INSTALLATION_STATUS_UPDATED",
    entityType: "InstallationRecord",
    entityId: installation.id,
    metadata: { status: data.status },
  });

  res.json(installation);
}

export async function deleteInstallationCore(id: string, userId?: string | null, organizationId?: string) {
  const installation = await prisma.installationRecord.findFirst({
    where: { id, ...(organizationId ? { branch: { organizationId } } : {}) },
  });
  if (!installation) throw new AppError("Installation not found", 404);

  await prisma.installationRecord.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "INSTALLATION_DELETED",
    entityType: "InstallationRecord",
    entityId: id,
    metadata: { vehicleId: installation.vehicleId, status: installation.status },
  });
}

export async function deleteInstallation(req: Request, res: Response) {
  await deleteInstallationCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteInstallations(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;
  const organizationId = req.user!.organizationId!;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteInstallationCore(id, userId, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  res.json({ deleted, failed });
}
