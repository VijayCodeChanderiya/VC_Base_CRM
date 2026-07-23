import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/config/prisma";

type TxClient = PrismaClient | Prisma.TransactionClient;

// Small in-memory cache so we don't hit the DB on every audit write to resolve
// a userId -> organizationId. Never caches misses/SUPER_ADMIN (null org) so a
// promotion or org change is picked up on the next write.
const userOrgCache = new Map<string, string>();

async function resolveOrganizationId(
  client: TxClient,
  userId: string | null | undefined
): Promise<string | undefined> {
  if (!userId) return undefined;
  const cached = userOrgCache.get(userId);
  if (cached) return cached;
  const user = await client.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
  if (user?.organizationId) {
    userOrgCache.set(userId, user.organizationId);
    return user.organizationId;
  }
  return undefined;
}

export async function logAudit(
  client: TxClient,
  params: {
    userId?: string | null;
    organizationId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const organizationId = params.organizationId ?? (await resolveOrganizationId(client, params.userId));
  await client.auditLog.create({
    data: {
      userId: params.userId ?? undefined,
      organizationId: organizationId ?? undefined,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export { prisma };
