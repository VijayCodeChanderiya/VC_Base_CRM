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
