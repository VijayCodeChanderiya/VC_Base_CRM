import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { createNotification, notifySuperAdmins } from "@/utils/notify";
import { parseSortOrder } from "@/utils/sort";

const PLATFORM_TICKET_SORT_FIELDS: Record<string, Prisma.PlatformTicketOrderByWithRelationInput> = {
  ticketNumber: { ticketNumber: "asc" },
  organization: { organization: { name: "asc" } },
  subject: { subject: "asc" },
  category: { category: "asc" },
  priority: { priority: "asc" },
  status: { status: "asc" },
  updatedAt: { updatedAt: "asc" },
};

async function nextTicketNumber(): Promise<string> {
  const count = await prisma.platformTicket.count();
  return `PTKT-${String(count + 1).padStart(6, "0")}`;
}

const SAFE_USER_SELECT = { id: true, name: true, email: true } as const;

const PLATFORM_TICKET_INCLUDE = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { senderUser: { select: SAFE_USER_SELECT } },
  },
  organization: { select: { id: true, name: true, slug: true } },
  raisedBy: { select: SAFE_USER_SELECT },
  assignedTo: { select: SAFE_USER_SELECT },
};

// ---------------------------------------------------------------------------
// Org-side (any tenant ADMIN/STAFF/COMPANY/RESELLER, mounted under /api/platform-tickets)
// ---------------------------------------------------------------------------

export async function listMyOrgTickets(req: Request, res: Response) {
  const organizationId = req.user!.organizationId;
  if (!organizationId) throw new AppError("SUPER_ADMIN accounts have no organization", 400);

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;

  const where = { organizationId, ...(status ? { status: status as never } : {}) };

  const [items, total] = await Promise.all([
    prisma.platformTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.platformTicket.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getMyOrgTicket(req: Request, res: Response) {
  const organizationId = req.user!.organizationId;
  const ticket = await prisma.platformTicket.findUniqueOrThrow({
    where: { id: req.params.id },
    include: PLATFORM_TICKET_INCLUDE,
  });
  if (ticket.organizationId !== organizationId) {
    throw new AppError("Not found", 404);
  }
  res.json(ticket);
}

const createOrgTicketSchema = z.object({
  subject: z.string().trim().min(3),
  category: z.enum(["BILLING", "PLAN_UPGRADE", "TECHNICAL", "BUG", "OTHER"]).default("OTHER"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  message: z.string().trim().min(1),
});

export async function createOrgTicket(req: Request, res: Response) {
  const data = createOrgTicketSchema.parse(req.body);
  const organizationId = req.user!.organizationId;
  if (!organizationId) throw new AppError("SUPER_ADMIN accounts have no organization", 400);
  const userId = req.user!.sub;
  const ticketNumber = await nextTicketNumber();

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.platformTicket.create({
      data: {
        ticketNumber,
        organizationId,
        raisedById: userId,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
      },
    });
    await tx.platformTicketMessage.create({
      data: { ticketId: created.id, senderType: "ORG", senderUserId: userId, message: data.message },
    });
    return created;
  });

  await logAudit(prisma, {
    userId,
    action: "PLATFORM_TICKET_CREATED",
    entityType: "PlatformTicket",
    entityId: ticket.id,
    metadata: { organizationId, ticketNumber },
  });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  await notifySuperAdmins(prisma, {
    type: "INFO",
    title: `New platform ticket ${ticketNumber}`,
    message: `${org.name}: ${data.subject}`,
  });

  const full = await prisma.platformTicket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: PLATFORM_TICKET_INCLUDE,
  });
  res.status(201).json(full);
}

const replySchema = z.object({ message: z.string().trim().min(1) });

export async function replyToMyOrgTicket(req: Request, res: Response) {
  const data = replySchema.parse(req.body);
  const organizationId = req.user!.organizationId;
  const userId = req.user!.sub;
  const ticket = await prisma.platformTicket.findUniqueOrThrow({ where: { id: req.params.id } });

  if (ticket.organizationId !== organizationId) throw new AppError("Not found", 404);
  if (ticket.status === "CLOSED") throw new AppError("This ticket is closed", 409);

  await prisma.$transaction([
    prisma.platformTicketMessage.create({
      data: { ticketId: ticket.id, senderType: "ORG", senderUserId: userId, message: data.message },
    }),
    prisma.platformTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "AWAITING_ORG" ? "OPEN" : ticket.status },
    }),
  ]);

  const full = await prisma.platformTicket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: PLATFORM_TICKET_INCLUDE,
  });
  res.json(full);
}

export async function closeMyOrgTicket(req: Request, res: Response) {
  const organizationId = req.user!.organizationId;
  const ticket = await prisma.platformTicket.findUniqueOrThrow({ where: { id: req.params.id } });
  if (ticket.organizationId !== organizationId) throw new AppError("Not found", 404);

  const updated = await prisma.platformTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  res.json(updated);
}

// ---------------------------------------------------------------------------
// Super-Admin side (cross-org, mounted under /api/platform/tickets)
// ---------------------------------------------------------------------------

export async function listPlatformTickets(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;
  const organizationId = req.query.organizationId as string | undefined;
  const assignedToId = req.query.assignedToId as string | undefined;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(assignedToId ? { assignedToId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.platformTicket.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        assignedTo: { select: SAFE_USER_SELECT },
      },
      orderBy: parseSortOrder(req, PLATFORM_TICKET_SORT_FIELDS, { updatedAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.platformTicket.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getPlatformTicket(req: Request, res: Response) {
  const ticket = await prisma.platformTicket.findUniqueOrThrow({
    where: { id: req.params.id },
    include: PLATFORM_TICKET_INCLUDE,
  });
  res.json(ticket);
}

const assignSchema = z.object({ assignedToId: z.string().uuid().nullable() });

export async function assignPlatformTicket(req: Request, res: Response) {
  const data = assignSchema.parse(req.body);
  const ticket = await prisma.platformTicket.update({
    where: { id: req.params.id },
    data: { assignedToId: data.assignedToId },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PLATFORM_TICKET_ASSIGNED",
    entityType: "PlatformTicket",
    entityId: ticket.id,
    metadata: { assignedToId: data.assignedToId },
  });

  res.json(ticket);
}

const staffReplySchema = z.object({
  message: z.string().trim().min(1),
  resolve: z.boolean().optional(),
});

export async function replyToPlatformTicket(req: Request, res: Response) {
  const data = staffReplySchema.parse(req.body);
  const userId = req.user!.sub;
  const ticket = await prisma.platformTicket.findUniqueOrThrow({ where: { id: req.params.id } });

  const nextStatus = data.resolve ? "RESOLVED" : "AWAITING_ORG";

  await prisma.$transaction([
    prisma.platformTicketMessage.create({
      data: { ticketId: ticket.id, senderType: "SUPER_ADMIN", senderUserId: userId, message: data.message },
    }),
    prisma.platformTicket.update({
      where: { id: ticket.id },
      data: { status: nextStatus, closedAt: nextStatus === "RESOLVED" ? new Date() : null },
    }),
  ]);

  await logAudit(prisma, {
    userId,
    action: "PLATFORM_TICKET_REPLIED",
    entityType: "PlatformTicket",
    entityId: ticket.id,
    metadata: { status: nextStatus },
  });

  await createNotification(prisma, {
    userId: ticket.raisedById,
    type: "INFO",
    title: `New reply on ${ticket.ticketNumber}`,
    message: data.message.slice(0, 200),
  });

  const full = await prisma.platformTicket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: PLATFORM_TICKET_INCLUDE,
  });
  res.json(full);
}

const statusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "AWAITING_ORG", "RESOLVED", "CLOSED"]),
});

export async function updatePlatformTicketStatus(req: Request, res: Response) {
  const data = statusSchema.parse(req.body);
  const ticket = await prisma.platformTicket.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      closedAt: data.status === "CLOSED" || data.status === "RESOLVED" ? new Date() : null,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "PLATFORM_TICKET_STATUS_CHANGED",
    entityType: "PlatformTicket",
    entityId: ticket.id,
    metadata: { status: data.status },
  });

  res.json(ticket);
}
