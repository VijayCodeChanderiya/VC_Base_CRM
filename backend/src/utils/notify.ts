import { Prisma, PrismaClient, NotificationType } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

export async function notifyAdmins(
  client: TxClient,
  params: { type: NotificationType; title: string; message: string }
) {
  const admins = await client.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  if (admins.length === 0) return;

  await client.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: params.type,
      title: params.title,
      message: params.message,
    })),
  });
}

export async function notifySuperAdmins(
  client: TxClient,
  params: { type: NotificationType; title: string; message: string }
) {
  const superAdmins = await client.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
  if (superAdmins.length === 0) return;

  await client.notification.createMany({
    data: superAdmins.map((a) => ({
      userId: a.id,
      type: params.type,
      title: params.title,
      message: params.message,
    })),
  });
}

// Every notification producer aimed at a single user or customer (ticket replies,
// AMC/SIM expiry, warranty updates) goes through this one function — the single seam
// where email/SMS dispatch gets added later without touching every call site.
export async function createNotification(
  client: TxClient,
  params: {
    userId?: string | null;
    customerId?: string | null;
    type?: NotificationType;
    title: string;
    message: string;
  }
) {
  const hasUser = !!params.userId;
  const hasCustomer = !!params.customerId;
  if (hasUser === hasCustomer) {
    throw new Error("createNotification requires exactly one of userId or customerId");
  }

  await client.notification.create({
    data: {
      userId: params.userId ?? undefined,
      customerId: params.customerId ?? undefined,
      type: params.type ?? "INFO",
      title: params.title,
      message: params.message,
    },
  });
}
