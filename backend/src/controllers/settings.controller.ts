import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/config/prisma";

const setSchema = z.object({
  value: z.unknown(),
});

export async function listSettings(_req: Request, res: Response) {
  const settings = await prisma.setting.findMany();
  const map: Record<string, unknown> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
}

export async function setSetting(req: Request, res: Response) {
  const { value } = setSchema.parse(req.body);
  const key = req.params.key;

  const setting = await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });

  res.json(setting);
}
