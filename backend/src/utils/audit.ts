import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/config/prisma";

type TxClient = PrismaClient | Prisma.TransactionClient;

export async function logAudit(
  client: TxClient,
  params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await client.auditLog.create({
    data: {
      userId: params.userId ?? undefined,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export { prisma };
