import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { CustomerSource, Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { phoneSchema, emailSchema } from "@/utils/validators";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const CUSTOMER_SORT_FIELDS: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
  name: { name: "asc" },
  phone: { phone: "asc" },
  city: { city: "asc" },
  company: { company: "asc" },
  source: { source: "asc" },
};

const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

const customerSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  phone: phoneSchema,
  city: z.string().optional(),
  address: z.string().optional(),
  company: z.string().optional(),
  gstNumber: z.string().optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  notes: z.string().optional(),
});

const createCustomerSchema = customerSchema.extend({
  username: z.string().trim().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const updateCustomerSchema = customerSchema.partial().extend({
  username: z.string().trim().min(3, "Username must be at least 3 characters").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

function omitPasswordHash<T extends { passwordHash?: string | null }>(customer: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = customer;
  return rest;
}

export async function listCustomers(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const search = (req.query.search as string) ?? "";
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { organizationId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { company: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        organization: { select: ORG_SUMMARY_SELECT },
        sims: {
          select: { id: true, iccid: true, carrier: true, billingCycle: true, status: true, expiryDate: true },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: parseSortOrder(req, CUSTOMER_SORT_FIELDS, { createdAt: "desc" }),
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ items: items.map(omitPasswordHash), total, page, pageSize });
}

export async function getCustomer(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, ...(organizationId ? { organizationId } : {}) },
    include: {
      organization: { select: ORG_SUMMARY_SELECT },
      sales: { include: { items: { include: { product: true, imei: true } } }, orderBy: { createdAt: "desc" } },
      warrantyClaims: true,
    },
  });
  if (!customer) throw new AppError("Customer not found", 404);
  res.json(omitPasswordHash(customer));
}

export async function createCustomer(req: Request, res: Response) {
  const { password, ...rest } = createCustomerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(password, 10);
  const customer = await prisma.customer.create({
    data: { ...rest, passwordHash, organizationId: req.user!.organizationId! },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "CUSTOMER_CREATED",
    entityType: "Customer",
    entityId: customer.id,
    metadata: { name: customer.name, phone: customer.phone, username: customer.username },
  });

  res.status(201).json(omitPasswordHash(customer));
}

export async function updateCustomer(req: Request, res: Response) {
  const { password, ...rest } = updateCustomerSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user!.organizationId! },
  });
  if (!existing) throw new AppError("Customer not found", 404);

  const data: Record<string, unknown> = { ...rest };
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
  res.json(omitPasswordHash(customer));
}

async function deleteCustomerCore(id: string, userId: string, organizationId: string): Promise<void> {
  const customer = await prisma.customer.findFirst({ where: { id, organizationId } });
  if (!customer) throw new AppError("Customer not found", 404);

  const [saleCount, returnCount, warrantyClaimCount, paymentCount, simCount] = await Promise.all([
    prisma.sale.count({ where: { customerId: id } }),
    prisma.return.count({ where: { customerId: id } }),
    prisma.warrantyClaim.count({ where: { customerId: id } }),
    prisma.payment.count({ where: { customerId: id } }),
    prisma.sim.count({ where: { customerId: id } }),
  ]);

  const blockers: string[] = [];
  if (saleCount > 0) blockers.push(`${saleCount} sale(s)`);
  if (returnCount > 0) blockers.push(`${returnCount} return(s)`);
  if (warrantyClaimCount > 0) blockers.push(`${warrantyClaimCount} warranty claim(s)`);
  if (paymentCount > 0) blockers.push(`${paymentCount} payment(s)`);
  if (simCount > 0) blockers.push(`${simCount} sim(s)`);

  if (blockers.length > 0) {
    throw new AppError(`Cannot delete customer: ${blockers.join(", ")} reference this customer`, 409);
  }

  await prisma.customer.delete({ where: { id } });

  await logAudit(prisma, {
    userId,
    action: "CUSTOMER_DELETED",
    entityType: "Customer",
    entityId: id,
    metadata: { name: customer.name },
  });
}

export async function deleteCustomer(req: Request, res: Response) {
  await deleteCustomerCore(req.params.id, req.user!.sub, req.user!.organizationId!);
  res.status(204).send();
}

export async function bulkDeleteCustomers(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const organizationId = req.user!.organizationId!;
  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deleteCustomerCore(id, req.user!.sub, organizationId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete customer" });
    }
  }

  res.json({ deleted, failed });
}
