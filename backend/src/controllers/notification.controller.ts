import { Request, Response } from "express";
import { prisma } from "@/config/prisma";

export async function listNotifications(req: Request, res: Response) {
  const userId = req.user!.sub;
  const unreadOnly = req.query.unreadOnly === "true";

  const notifications = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({ items: notifications });
}

export async function markNotificationRead(req: Request, res: Response) {
  const userId = req.user!.sub;
  const notification = await prisma.notification.updateMany({
    where: { id: req.params.id, userId },
    data: { isRead: true },
  });
  if (notification.count === 0) {
    return res.status(404).json({ error: "Notification not found" });
  }
  res.status(204).send();
}

export async function listMyNotifications(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const unreadOnly = req.query.unreadOnly === "true";

  const notifications = await prisma.notification.findMany({
    where: { customerId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({ items: notifications });
}

export async function markMyNotificationRead(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const notification = await prisma.notification.updateMany({
    where: { id: req.params.id, customerId },
    data: { isRead: true },
  });
  if (notification.count === 0) {
    return res.status(404).json({ error: "Notification not found" });
  }
  res.status(204).send();
}
