import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { parseSortOrder } from "@/utils/sort";

const PLAN_SORT_FIELDS: Record<string, Prisma.PlanOrderByWithRelationInput> = {
  name: { name: "asc" },
  code: { code: "asc" },
  isActive: { isActive: "asc" },
};

export async function listPlans(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 100);

  const [items, total] = await Promise.all([
    prisma.plan.findMany({
      include: {
        planFeatures: { include: { feature: true } },
        _count: { select: { organizations: true } },
      },
      orderBy: parseSortOrder(req, PLAN_SORT_FIELDS, { createdAt: "asc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.plan.count(),
  ]);

  res.json({ items, total, page, pageSize });
}

const planSchema = z.object({
  name: z.string().trim().min(2),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Code must be uppercase letters/digits/underscore"),
  description: z.string().optional(),
});

export async function createPlan(req: Request, res: Response) {
  const data = planSchema.parse(req.body);

  const plan = await prisma.plan.create({ data });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PLAN_CREATED",
    entityType: "Plan",
    entityId: plan.id,
    metadata: { code: plan.code },
  });

  res.status(201).json(plan);
}

const updatePlanSchema = planSchema.omit({ code: true }).partial().extend({ isActive: z.boolean().optional() });

export async function updatePlan(req: Request, res: Response) {
  const data = updatePlanSchema.parse(req.body);
  const plan = await prisma.plan.update({ where: { id: req.params.id }, data });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PLAN_UPDATED",
    entityType: "Plan",
    entityId: plan.id,
    metadata: data,
  });

  res.json(plan);
}

const setFeaturesSchema = z.object({
  features: z.array(
    z.object({
      featureId: z.string().uuid(),
      boolValue: z.boolean().nullable().optional(),
      numValue: z.number().int().nullable().optional(),
    })
  ),
});

export async function setPlanFeatures(req: Request, res: Response) {
  const { features } = setFeaturesSchema.parse(req.body);
  const planId = req.params.id;

  await prisma.$transaction(
    features.map((f) =>
      prisma.planFeature.upsert({
        where: { planId_featureId: { planId, featureId: f.featureId } },
        create: { planId, featureId: f.featureId, boolValue: f.boolValue ?? undefined, numValue: f.numValue ?? undefined },
        update: { boolValue: f.boolValue ?? undefined, numValue: f.numValue ?? undefined },
      })
    )
  );

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PLAN_FEATURES_UPDATED",
    entityType: "Plan",
    entityId: planId,
    metadata: { count: features.length },
  });

  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: planId },
    include: { planFeatures: { include: { feature: true } } },
  });
  res.json(plan);
}

export async function deletePlan(req: Request, res: Response) {
  const inUse = await prisma.organization.count({ where: { planId: req.params.id } });
  if (inUse > 0) {
    throw new AppError(`Cannot delete: ${inUse} organization(s) are on this plan`, 409);
  }

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: req.params.id } });
  await prisma.$transaction([
    prisma.planFeature.deleteMany({ where: { planId: req.params.id } }),
    prisma.plan.delete({ where: { id: req.params.id } }),
  ]);

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PLAN_DELETED",
    entityType: "Plan",
    entityId: req.params.id,
    metadata: { code: plan.code },
  });

  res.status(204).send();
}
