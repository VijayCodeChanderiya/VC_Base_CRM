import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/config/prisma";
import { signToken } from "@/utils/jwt";
import { AppError } from "@/utils/AppError";
import { optionalPhoneSchema, emailSchema } from "@/utils/validators";

const registerSchema = z.object({
  name: z.string().min(2),
  email: emailSchema,
  phone: optionalPhoneSchema,
  password: z.string().min(8),
  role: z.nativeEnum(Role).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export async function register(req: Request, res: Response) {
  const data = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("Email already in use", 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role ?? Role.STAFF,
    },
  });

  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export async function login(req: Request, res: Response) {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !user.isActive) {
    throw new AppError("Invalid credentials", 401);
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid credentials", 401);
  }

  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}
