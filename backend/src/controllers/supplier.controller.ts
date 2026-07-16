import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { phoneSchema, optionalEmailSchema, optionalPhoneSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";

const SUPPLIER_SORT_FIELDS: Record<string, Prisma.SupplierOrderByWithRelationInput> = {
  name: { name: "asc" },
  phone: { phone: "asc" },
  email: { email: "asc" },
  contactPerson: { contactPerson: "asc" },
};

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

const supplierSchema = z.object({
  name: z.string().min(1),
  phone: phoneSchema,
  email: optionalEmailSchema,
  contactPerson: z.string().optional(),
  alternatePhone: optionalPhoneSchema,
  address: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankAccountHolder: z.string().optional(),
  categorySupplied: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

export async function listSuppliers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, SUPPLIER_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.supplier.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getSupplier(req: Request, res: Response) {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { purchases: { orderBy: { createdAt: "desc" } }, products: true },
  });
  res.json(supplier);
}

export async function createSupplier(req: Request, res: Response) {
  const data = supplierSchema.parse(req.body);
  const supplier = await prisma.supplier.create({ data });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "SUPPLIER_CREATED",
    entityType: "Supplier",
    entityId: supplier.id,
    metadata: { name: supplier.name, phone: supplier.phone },
  });

  res.status(201).json(supplier);
}

export async function updateSupplier(req: Request, res: Response) {
  const data = supplierSchema.partial().parse(req.body);
  const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data });
  res.json(supplier);
}

async function deleteSupplierCore(id: string, userId: string): Promise<void> {
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id } });

  const [purchaseCount, productCount, rmaCount] = await Promise.all([
    prisma.purchase.count({ where: { supplierId: id } }),
    prisma.product.count({ where: { supplierId: id } }),
    prisma.rma.count({ where: { supplierId: id } }),
  ]);

  const blockers: string[] = [];
  if (purchaseCount > 0) blockers.push(`${purchaseCount} purchase(s)`);
  if (productCount > 0) blockers.push(`${productCount} product(s)`);
  if (rmaCount > 0) blockers.push(`${rmaCount} RMA(s)`);

  if (blockers.length > 0) {
    throw new AppError(`Cannot delete supplier: ${blockers.join(", ")} reference this supplier`, 409);
  }

  await prisma.supplier.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "SUPPLIER_DELETED",
    entityType: "Supplier",
    entityId: id,
    metadata: { name: supplier.name },
  });
}

export async function deleteSupplier(req: Request, res: Response) {
  await deleteSupplierCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

export async function bulkDeleteSuppliers(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteSupplierCore(id, req.user!.sub);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete supplier" });
    }
  }

  res.json({ deleted, failed });
}
