import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { resolveBranchId } from "@/utils/branch";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const PRODUCT_SORT_FIELDS: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  sku: { sku: "asc" },
  name: { name: "asc" },
  hsnCode: { hsnCode: "asc" },
  tracking: { hasImei: "asc" },
  unitPrice: { unitPrice: "asc" },
};

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  hasImei: z.boolean().default(false),
  hsnCode: z.string().optional(),
  unitPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  taxPercent: z.number().min(0).max(100).default(0),
  reorderLevel: z.number().int().min(0).default(0),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
});

export async function listProducts(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";
  const branchId = req.query.branchId as string | undefined;
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { organizationId } : {}),
    isActive: true,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
            { brand: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        organization: { select: ORG_SUMMARY_SELECT },
        category: true,
        supplier: true,
        inventory: branchId ? { where: { branchId }, include: { branch: true } } : { include: { branch: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, PRODUCT_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getProduct(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, ...(organizationId ? { organizationId } : {}) },
    include: {
      organization: { select: ORG_SUMMARY_SELECT },
      category: true,
      supplier: true,
      inventory: { include: { branch: true } },
    },
  });
  if (!product) throw new AppError("Product not found", 404);
  res.json(product);
}

export async function createProduct(req: Request, res: Response) {
  const data = productSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const branchId = await resolveBranchId(organizationId, data.branchId);

  const product = await prisma.product.create({
    data: {
      sku: data.sku,
      name: data.name,
      description: data.description,
      brand: data.brand,
      model: data.model,
      hasImei: data.hasImei,
      hsnCode: data.hsnCode,
      unitPrice: data.unitPrice,
      costPrice: data.costPrice,
      taxPercent: data.taxPercent,
      reorderLevel: data.reorderLevel,
      categoryId: data.categoryId,
      supplierId: data.supplierId,
      organizationId,
      inventory: data.hasImei ? undefined : { create: { quantity: 0, branchId } },
    },
    include: { inventory: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    metadata: { name: product.name, sku: product.sku },
  });

  res.status(201).json(product);
}

export async function updateProduct(req: Request, res: Response) {
  const data = productSchema.partial().omit({ branchId: true }).parse(req.body);
  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId! },
  });
  if (!existing) throw new AppError("Product not found", 404);

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data,
  });
  res.json(product);
}

async function deleteProductCore(id: string, userId: string, organizationId: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError("Product not found", 404);

  const soldImeiCount = await prisma.imeiRecord.count({
    where: { productId: id, status: "SOLD" },
  });
  if (soldImeiCount > 0) {
    throw new AppError("Cannot delete a product with sold IMEI history", 409);
  }

  const product = await prisma.product.update({
    where: { id },
    data: { isActive: false },
  });

  await logAudit(prisma, {
    userId,
    action: "PRODUCT_DELETED",
    entityType: "Product",
    entityId: id,
    metadata: { name: product.name, sku: product.sku },
  });
}

export async function deleteProduct(req: Request, res: Response) {
  await deleteProductCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

export async function bulkDeleteProducts(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteProductCore(id, req.user!.sub, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete product" });
    }
  }

  res.json({ deleted, failed });
}
