import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role, Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { optionalPhoneSchema, emailSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";

const USER_SORT_FIELDS: Record<string, Prisma.UserOrderByWithRelationInput> = {
  name: { name: "asc" },
  email: { email: "asc" },
  role: { role: "asc" },
  isActive: { isActive: "asc" },
};

const createUserSchema = z.object({
  name: z.string().min(2),
  email: emailSchema,
  phone: optionalPhoneSchema,
  password: z.string().min(8),
  role: z.nativeEnum(Role),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
});

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
      orderBy: parseSortOrder(req, USER_SORT_FIELDS, { createdAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);

  res.json({ items: users, total, page, pageSize });
}

export async function createUser(req: Request, res: Response) {
  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("Email already in use", 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, passwordHash, role: data.role },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role },
  });

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
}

export async function updateUser(req: Request, res: Response) {
  const data = updateUserSchema.parse(req.body);

  if (req.params.id === req.user!.sub && data.isActive === false) {
    throw new AppError("You cannot deactivate your own account", 422);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: user.id,
    metadata: data,
  });

  res.json(user);
}

async function deleteUserCore(id: string, currentUserId: string): Promise<void> {
  if (id === currentUserId) {
    throw new AppError("You cannot delete your own account", 400);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id } });

  const [saleCount, purchaseCount, installationCount] = await Promise.all([
    prisma.sale.count({ where: { userId: id } }),
    prisma.purchase.count({ where: { userId: id } }),
    prisma.installationRecord.count({ where: { installedBy: id } }),
  ]);

  const blockers: string[] = [];
  if (saleCount > 0) blockers.push(`${saleCount} sale(s)`);
  if (purchaseCount > 0) blockers.push(`${purchaseCount} purchase(s)`);
  if (installationCount > 0) blockers.push(`${installationCount} installation(s)`);

  if (blockers.length > 0) {
    throw new AppError(`Cannot delete user: ${blockers.join(", ")} reference this user`, 409);
  }

  await prisma.user.delete({ where: { id } });

  await logAudit(prisma, {
    userId: currentUserId,
    action: "USER_DELETED",
    entityType: "User",
    entityId: id,
    metadata: { name: user.name, email: user.email },
  });
}

export async function deleteUser(req: Request, res: Response) {
  await deleteUserCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

export async function bulkDeleteUsers(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteUserCore(id, req.user!.sub);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete user" });
    }
  }

  res.json({ deleted, failed });
}
