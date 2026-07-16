import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { resolveBranchId } from "@/utils/branch";
import { imeiSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";

const IMEI_SORT_FIELDS: Record<string, Prisma.ImeiRecordOrderByWithRelationInput> = {
  imei: { imei: "asc" },
  product: { product: { name: "asc" } },
  vendor: { supplier: { name: "asc" } },
  receivedDate: { receivedDate: "asc" },
  customer: { saleItem: { sale: { customer: { name: "asc" } } } },
  status: { status: "asc" },
};

const imeiCreateSchema = z.object({
  imeis: z.array(z.string()).min(1),
  productId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  receivedDate: z.string().optional(),
});

export async function listImeis(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";
  const status = req.query.status as string | undefined;
  const branchId = req.query.branchId as string | undefined;
  const productId = req.query.productId as string | undefined;

  const where = {
    ...(search ? { imei: { contains: search, mode: "insensitive" as const } } : {}),
    ...(status ? { status: status as never } : {}),
    ...(branchId ? { branchId } : {}),
    ...(productId ? { productId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.imeiRecord.findMany({
      where,
      include: {
        product: true,
        branch: true,
        supplier: true,
        purchaseItem: { include: { purchase: { include: { supplier: true } } } },
        saleItem: { include: { sale: { include: { customer: true } } } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, IMEI_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.imeiRecord.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function searchImei(req: Request, res: Response) {
  const imei = req.params.imei;
  const record = await prisma.imeiRecord.findUnique({
    where: { imei },
    include: {
      product: true,
      branch: true,
      saleItem: { include: { sale: { include: { customer: true } } } },
      warrantyClaims: true,
    },
  });
  if (!record) {
    throw new AppError("IMEI not found", 404);
  }
  res.json(record);
}

interface TimelineEvent {
  date: string;
  type: string;
  title: string;
  detail?: string;
}

export async function getImeiTimeline(req: Request, res: Response) {
  const imei = req.params.imei;
  const record = await prisma.imeiRecord.findUnique({
    where: { imei },
    include: {
      product: true,
      branch: true,
      supplier: true,
      purchaseItem: { include: { purchase: { include: { supplier: true } } } },
      saleItem: {
        include: {
          sale: { include: { customer: true } },
          returnItems: { include: { returnRec: true } },
        },
      },
      warrantyClaims: { orderBy: { claimDate: "asc" } },
      sim: true,
      installations: { include: { vehicle: true, installer: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      rmas: { include: { supplier: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!record) {
    throw new AppError("IMEI not found", 404);
  }

  const events: TimelineEvent[] = [];

  if (record.purchaseItem?.purchase) {
    const purchase = record.purchaseItem.purchase;
    events.push({
      date: purchase.createdAt.toISOString(),
      type: "PURCHASE",
      title: `Purchased from ${purchase.supplier.name}`,
      detail: `PO ${purchase.purchaseNumber}`,
    });
  }

  events.push({
    date: record.receivedDate.toISOString(),
    type: "STOCKED",
    title: `Stocked in at ${record.branch.name}`,
    detail: !record.purchaseItem && record.supplier ? `Received from ${record.supplier.name}` : undefined,
  });

  if (record.saleItem?.sale) {
    const sale = record.saleItem.sale;
    events.push({
      date: sale.createdAt.toISOString(),
      type: "SALE",
      title: `Sold to ${sale.customer.name}`,
      detail: `Invoice ${sale.invoiceNumber}`,
    });

    for (const returnItem of record.saleItem.returnItems) {
      events.push({
        date: returnItem.returnRec.createdAt.toISOString(),
        type: "RETURN",
        title: `${returnItem.returnRec.type} requested (${returnItem.returnRec.status})`,
      });
    }
  }

  if (record.sim) {
    events.push({
      date: record.sim.createdAt.toISOString(),
      type: "SIM",
      title: `SIM ${record.sim.iccid} paired`,
      detail: record.sim.msisdn ?? undefined,
    });
  }

  for (const installation of record.installations) {
    events.push({
      date: installation.createdAt.toISOString(),
      type: "INSTALLATION",
      title: `Installation scheduled — ${installation.vehicle.registrationNumber}`,
      detail: installation.location ?? undefined,
    });
    if (installation.installedDate) {
      events.push({
        date: installation.installedDate.toISOString(),
        type: "INSTALLATION",
        title: `Installed in ${installation.vehicle.registrationNumber}`,
      });
    }
    if (installation.removedDate) {
      events.push({
        date: installation.removedDate.toISOString(),
        type: "INSTALLATION",
        title: `Removed from ${installation.vehicle.registrationNumber}`,
      });
    }
  }

  for (const claim of record.warrantyClaims) {
    events.push({
      date: claim.claimDate.toISOString(),
      type: "WARRANTY",
      title: "Warranty claim filed",
      detail: claim.description ?? undefined,
    });
    if (claim.resolvedDate) {
      events.push({
        date: claim.resolvedDate.toISOString(),
        type: "WARRANTY",
        title: `Warranty claim ${claim.status.toLowerCase()}`,
        detail: claim.resolution ?? undefined,
      });
    }
  }

  for (const rma of record.rmas) {
    events.push({
      date: rma.createdAt.toISOString(),
      type: "RMA",
      title: `RMA opened with ${rma.supplier.name}`,
      detail: rma.reason,
    });
    if (rma.shippedDate) {
      events.push({ date: rma.shippedDate.toISOString(), type: "RMA", title: "Shipped to supplier" });
    }
    if (rma.resolvedDate) {
      events.push({
        date: rma.resolvedDate.toISOString(),
        type: "RMA",
        title: `RMA resolved: ${rma.status.replace(/_/g, " ").toLowerCase()}`,
      });
    }
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  res.json({
    imei: record.imei,
    status: record.status,
    product: record.product,
    branch: record.branch,
    events,
  });
}

const imeiUpdateSchema = z.object({
  imei: imeiSchema,
});

export async function updateImei(req: Request, res: Response) {
  const data = imeiUpdateSchema.parse(req.body);
  const record = await prisma.imeiRecord.update({
    where: { id: req.params.id },
    data: { imei: data.imei },
  });
  res.json(record);
}

export async function createImei(req: Request, res: Response) {
  const data = imeiCreateSchema.parse(req.body);
  const branchId = await resolveBranchId(data.branchId);

  const product = await prisma.product.findUniqueOrThrow({ where: { id: data.productId } });
  if (!product.hasImei) {
    throw new AppError("Product is not IMEI/serial tracked", 422);
  }

  let receivedDate: Date | undefined;
  if (data.receivedDate) {
    const parsedDate = new Date(data.receivedDate);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new AppError("Invalid received date", 422);
    }
    if (parsedDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new AppError("Received date cannot be in the future", 422);
    }
    receivedDate = parsedDate;
  }

  const created: string[] = [];
  const failed: { imei: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const raw of data.imeis) {
    const trimmed = raw.trim();
    const parsed = imeiSchema.safeParse(trimmed);
    if (!parsed.success) {
      failed.push({ imei: trimmed || "(blank)", reason: "IMEI must be exactly 15 digits" });
      continue;
    }
    const imei = parsed.data;
    if (seen.has(imei)) {
      failed.push({ imei, reason: "Duplicate in this batch" });
      continue;
    }
    seen.add(imei);

    try {
      await prisma.$transaction(async (tx) => {
        const record = await tx.imeiRecord.create({
          data: {
            imei,
            productId: data.productId,
            branchId,
            supplierId: data.supplierId,
            status: "IN_STOCK",
            receivedDate,
          },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: data.productId,
            type: "ADJUSTMENT",
            quantity: 1,
            reference: `IMEI:${record.imei}`,
            branchId,
          },
        });
      });
      created.push(imei);
    } catch (err) {
      const reason =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
          ? "IMEI already exists"
          : "Failed to add";
      failed.push({ imei, reason });
    }
  }

  if (created.length > 0) {
    await logAudit(prisma, {
      userId: req.user!.sub,
      action: created.length === 1 ? "IMEI_CREATED" : "IMEI_BATCH_CREATED",
      entityType: "ImeiRecord",
      metadata: { productId: data.productId, supplierId: data.supplierId, count: created.length, imeis: created },
    });
  }

  res.status(201).json({ created, failed });
}

export async function deleteImeiCore(id: string, userId?: string | null) {
  const record = await prisma.imeiRecord.findUniqueOrThrow({
    where: { id },
    include: { warrantyClaims: true, sim: true, installations: true, rmas: true },
  });

  if (record.status !== "IN_STOCK") {
    throw new AppError("Cannot delete IMEI: it is not currently in stock (already sold/RMA/etc)", 409);
  }

  if (
    record.warrantyClaims.length > 0 ||
    record.sim ||
    record.installations.length > 0 ||
    record.rmas.length > 0
  ) {
    throw new AppError("Cannot delete IMEI: it has warranty/SIM/installation/RMA history", 409);
  }

  await prisma.imeiRecord.delete({ where: { id } });
  await logAudit(prisma, {
    userId,
    action: "IMEI_DELETED",
    entityType: "ImeiRecord",
    entityId: id,
    metadata: { imei: record.imei },
  });
}

export async function deleteImei(req: Request, res: Response) {
  await deleteImeiCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeleteImeis(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteImeiCore(id, userId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete IMEI" });
    }
  }

  res.json({ deleted, failed });
}
