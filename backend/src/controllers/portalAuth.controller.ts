import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { signCustomerToken } from "@/utils/jwt";
import { AppError } from "@/utils/AppError";
import { optionalPhoneSchema, optionalEmailSchema } from "@/utils/validators";

const claimSchema = z
  .object({
    phone: optionalPhoneSchema,
    email: optionalEmailSchema,
    username: z.string().trim().min(3).optional(),
    password: z.string().min(8),
  })
  .refine((d) => d.phone || d.email || d.username, { message: "Phone, email, or username is required" });

const loginSchema = z
  .object({
    phone: optionalPhoneSchema,
    email: optionalEmailSchema,
    username: z.string().trim().min(3).optional(),
    password: z.string().min(1),
  })
  .refine((d) => d.phone || d.email || d.username, { message: "Phone, email, or username is required" });

function findByIdentifier(data: { phone?: string; email?: string; username?: string }) {
  if (data.username) return prisma.customer.findFirst({ where: { username: data.username } });
  if (data.phone) return prisma.customer.findFirst({ where: { phone: data.phone } });
  return prisma.customer.findFirst({ where: { email: data.email } });
}

function toPublicCustomer(customer: {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  username: string | null;
}) {
  return { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, username: customer.username };
}

export async function claimAccount(req: Request, res: Response) {
  const data = claimSchema.parse(req.body);

  const customer = await findByIdentifier(data);

  if (!customer) {
    throw new AppError(
      "No customer record found with that phone/email/username. Contact the store to be added first.",
      404
    );
  }
  if (customer.passwordHash) {
    throw new AppError("This account is already set up. Please log in instead.", 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const updated = await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash } });

  const token = signCustomerToken({ sub: updated.id });
  res.status(201).json({ token, customer: toPublicCustomer(updated) });
}

export async function portalLogin(req: Request, res: Response) {
  const data = loginSchema.parse(req.body);

  const customer = await findByIdentifier(data);

  if (!customer || !customer.passwordHash) {
    throw new AppError("Invalid credentials", 401);
  }

  const valid = await bcrypt.compare(data.password, customer.passwordHash);
  if (!valid) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = signCustomerToken({ sub: customer.id });
  res.json({ token, customer: toPublicCustomer(customer) });
}