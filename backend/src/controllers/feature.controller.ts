import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, FeatureType } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";

const FEATURE_SORT_FIELDS: Record<string, Prisma.FeatureOrderByWithRelationInput> = {
  key: { key: "asc" },
  label: { label: "asc" },
  type: { type: "asc" },
};

export async function listFeatures(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 100);

  const [items, total] = await Promise.all([
    prisma.feature.findMany({
      orderBy: parseSortOrder(req, FEATURE_SORT_FIELDS, { createdAt: "asc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feature.count(),
  ]);

  res.json({ items, total, page, pageSize });
}

const featureSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "Key must be camelCase, letters and digits only"),
  label: z.string().trim().min(2),
  description: z.string().optional(),
  type: z.nativeEnum(FeatureType),
});

export async function createFeature(req: Request, res: Response) {
  const data = featureSchema.parse(req.body);

  const existing = await prisma.feature.findUnique({ where: { key: data.key } });
  if (existing) {
    throw new AppError("A feature with this key already exists", 409);
  }

  const feature = await prisma.feature.create({ data });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "FEATURE_CREATED",
    entityType: "Feature",
    entityId: feature.id,
    metadata: { key: feature.key },
  });

  res.status(201).json(feature);
}

const updateFeatureSchema = featureSchema.omit({ key: true, type: true }).partial();

export async function updateFeature(req: Request, res: Response) {
  const data = updateFeatureSchema.parse(req.body);
  const feature = await prisma.feature.update({ where: { id: req.params.id }, data });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "FEATURE_UPDATED",
    entityType: "Feature",
    entityId: feature.id,
    metadata: data,
  });

  res.json(feature);
}

export async function deleteFeature(req: Request, res: Response) {
  const inUse = await prisma.planFeature.count({ where: { featureId: req.params.id } });
  if (inUse > 0) {
    throw new AppError(`Cannot delete: ${inUse} plan(s) reference this feature`, 409);
  }

  const feature = await prisma.feature.findUniqueOrThrow({ where: { id: req.params.id } });
  await prisma.feature.delete({ where: { id: req.params.id } });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "FEATURE_DELETED",
    entityType: "Feature",
    entityId: req.params.id,
    metadata: { key: feature.key },
  });

  res.status(204).send();
}
