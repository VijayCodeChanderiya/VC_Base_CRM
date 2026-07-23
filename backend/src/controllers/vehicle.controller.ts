import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { resolveBranchId } from "@/utils/branch";
import { assertCustomerInOrg, resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";
import { parseSortOrder } from "@/utils/sort";

const VEHICLE_SORT_FIELDS: Record<string, Prisma.VehicleOrderByWithRelationInput> = {
  registrationNumber: { registrationNumber: "asc" },
  makeModel: { make: "asc" },
  owner: { ownerCustomer: { name: "asc" } },
};

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

const vehicleSchema = z.object({
  registrationNumber: z.string().min(1).toUpperCase(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  ownerCustomerId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export async function listVehicles(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { branch: { organizationId } } : {}),
    ...(search
      ? {
          OR: [
            { registrationNumber: { contains: search, mode: "insensitive" as const } },
            { make: { contains: search, mode: "insensitive" as const } },
            { model: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: {
        ownerCustomer: true,
        branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
        installations: { include: { imeiRecord: { include: { product: true } } } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, VEHICLE_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.vehicle.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getVehicle(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: req.params.id, ...(organizationId ? { branch: { organizationId } } : {}) },
    include: {
      ownerCustomer: true,
      branch: { include: { organization: { select: ORG_SUMMARY_SELECT } } },
      installations: { include: { imeiRecord: { include: { product: true } }, sim: true } },
    },
  });
  if (!vehicle) throw new AppError("Vehicle not found", 404);
  res.json(vehicle);
}

export async function createVehicle(req: Request, res: Response) {
  const data = vehicleSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const branchId = await resolveBranchId(organizationId, data.branchId);
  await assertCustomerInOrg(data.ownerCustomerId, organizationId);

  const vehicle = await prisma.vehicle.create({
    data: {
      registrationNumber: data.registrationNumber,
      make: data.make,
      model: data.model,
      year: data.year,
      ownerCustomerId: data.ownerCustomerId,
      notes: data.notes,
      branchId,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "VEHICLE_CREATED",
    entityType: "Vehicle",
    entityId: vehicle.id,
    metadata: { registrationNumber: vehicle.registrationNumber },
  });

  res.status(201).json(vehicle);
}

export async function updateVehicle(req: Request, res: Response) {
  const data = vehicleSchema.partial().omit({ branchId: true }).parse(req.body);
  const organizationId = req.user!.organizationId!;
  const existing = await prisma.vehicle.findFirst({ where: { id: req.params.id, branch: { organizationId } } });
  if (!existing) throw new AppError("Vehicle not found", 404);
  if (data.ownerCustomerId) {
    await assertCustomerInOrg(data.ownerCustomerId, organizationId);
  }
  const vehicle = await prisma.vehicle.update({ where: { id: req.params.id }, data });
  res.json(vehicle);
}

async function deleteVehicleCore(id: string, userId: string, organizationId?: string): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, ...(organizationId ? { branch: { organizationId } } : {}) },
  });
  if (!vehicle) throw new AppError("Vehicle not found", 404);

  const installationCount = await prisma.installationRecord.count({ where: { vehicleId: id } });
  if (installationCount > 0) {
    throw new AppError(`Cannot delete vehicle: ${installationCount} installation(s) reference this vehicle`, 409);
  }

  await prisma.vehicle.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "VEHICLE_DELETED",
    entityType: "Vehicle",
    entityId: id,
    metadata: { registrationNumber: vehicle.registrationNumber },
  });
}

export async function deleteVehicle(req: Request, res: Response) {
  await deleteVehicleCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

export async function bulkDeleteVehicles(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteVehicleCore(id, req.user!.sub, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete vehicle" });
    }
  }

  res.json({ deleted, failed });
}
