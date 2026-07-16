import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";

const paymentSchema = z
  .object({
    direction: z.enum(["INBOUND", "OUTBOUND"]),
    method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "UPI", "OTHER"]),
    amount: z.number().positive(),
    saleId: z.string().uuid().optional(),
    purchaseId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    reference: z.string().optional(),
  })
  .refine((d) => d.saleId || d.purchaseId, {
    message: "Either saleId or purchaseId is required",
  });

export async function listPayments(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      include: { sale: true, purchase: true, customer: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.count(),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function createPayment(req: Request, res: Response) {
  const data = paymentSchema.parse(req.body);

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({ data });

    if (data.saleId && data.direction === "INBOUND") {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: data.saleId } });
      const newPaid = Number(sale.amountPaid) + data.amount;
      if (newPaid > Number(sale.grandTotal) + 0.01) {
        throw new AppError("Payment exceeds outstanding sale balance", 422);
      }
      await tx.sale.update({ where: { id: data.saleId }, data: { amountPaid: newPaid } });
    }

    await logAudit(tx, {
      userId: req.user!.sub,
      action: "PAYMENT_RECORDED",
      entityType: "Payment",
      entityId: created.id,
      metadata: { amount: data.amount, direction: data.direction },
    });

    return created;
  });

  res.status(201).json(payment);
}

export async function deletePaymentCore(id: string, userId?: string | null) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id } });

  await prisma.$transaction(async (tx) => {
    if (payment.direction === "INBOUND" && payment.saleId) {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: payment.saleId } });
      const newPaid = Math.max(0, Number(sale.amountPaid) - Number(payment.amount));
      await tx.sale.update({ where: { id: payment.saleId }, data: { amountPaid: newPaid } });
    }

    await tx.payment.delete({ where: { id: payment.id } });

    await logAudit(tx, {
      userId,
      action: "PAYMENT_DELETED",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { amount: payment.amount, direction: payment.direction },
    });
  });
}

export async function deletePayment(req: Request, res: Response) {
  await deletePaymentCore(req.params.id, req.user!.sub);
  res.status(204).send();
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function bulkDeletePayments(req: Request, res: Response) {
  const { ids } = bulkDeleteSchema.parse(req.body);
  const userId = req.user!.sub;

  const deleted: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await deletePaymentCore(id, userId);
      deleted.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof AppError ? err.message : "Failed to delete payment" });
    }
  }

  res.json({ deleted, failed });
}
