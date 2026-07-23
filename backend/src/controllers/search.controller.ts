import { Request, Response } from "express";
import { prisma } from "@/config/prisma";

export async function globalSearch(req: Request, res: Response) {
  const q = ((req.query.q as string) ?? "").trim();
  const organizationId = req.user!.organizationId;
  if (q.length < 2 || !organizationId) {
    return res.json({ customers: [], products: [], imei: [], sales: [] });
  }

  const [customers, products, imei, sales] = await Promise.all([
    prisma.customer.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.product.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    prisma.imeiRecord.findMany({
      where: { imei: { contains: q, mode: "insensitive" }, branch: { organizationId } },
      include: { product: true },
      take: 5,
    }),
    prisma.sale.findMany({
      where: { invoiceNumber: { contains: q, mode: "insensitive" }, branch: { organizationId } },
      include: { customer: true },
      take: 5,
    }),
  ]);

  res.json({ customers, products, imei, sales });
}
