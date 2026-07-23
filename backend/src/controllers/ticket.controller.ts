import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { logAudit } from "@/utils/audit";
import { createNotification } from "@/utils/notify";
import { parseSortOrder } from "@/utils/sort";
import { resolveOrgFilterMode, ORG_SUMMARY_SELECT } from "@/utils/tenant";

const TICKET_SORT_FIELDS: Record<string, Prisma.SupportTicketOrderByWithRelationInput> = {
  ticketNumber: { ticketNumber: "asc" },
  customer: { customer: { name: "asc" } },
  subject: { subject: "asc" },
  category: { category: "asc" },
  priority: { priority: "asc" },
  status: { status: "asc" },
  updatedAt: { updatedAt: "asc" },
};

async function nextTicketNumber(): Promise<string> {
  const count = await prisma.supportTicket.count();
  return `TKT-${String(count + 1).padStart(6, "0")}`;
}

const SAFE_CUSTOMER_SELECT = { id: true, name: true, phone: true, email: true } as const;
const SAFE_USER_SELECT = { id: true, name: true, email: true } as const;

const TICKET_INCLUDE = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: {
      senderCustomer: { select: SAFE_CUSTOMER_SELECT },
      senderUser: { select: SAFE_USER_SELECT },
    },
  },
  customer: { select: SAFE_CUSTOMER_SELECT },
  assignedTo: { select: SAFE_USER_SELECT },
};

// ---------------------------------------------------------------------------
// Customer-side (mounted under /api/portal)
// ---------------------------------------------------------------------------

export async function listMyTickets(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;

  const where = { customerId, ...(status ? { status: status as never } : {}) };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getMyTicket(req: Request, res: Response) {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({
    where: { id: req.params.id },
    include: TICKET_INCLUDE,
  });
  if (ticket.customerId !== req.customer!.sub) {
    throw new AppError("Not found", 404);
  }
  res.json(ticket);
}

const createTicketSchema = z.object({
  subject: z.string().trim().min(3),
  category: z.enum(["WARRANTY", "BILLING", "TECHNICAL", "SUBSCRIPTION", "INSTALLATION", "OTHER"]).default("OTHER"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  relatedSaleId: z.string().uuid().optional(),
  relatedImeiRecordId: z.string().uuid().optional(),
  message: z.string().trim().min(1),
});

export async function createMyTicket(req: Request, res: Response) {
  const data = createTicketSchema.parse(req.body);
  const customerId = req.customer!.sub;
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { organizationId: true },
  });
  const organizationId = customer.organizationId;

  if (data.relatedSaleId) {
    const sale = await prisma.sale.findFirst({
      where: { id: data.relatedSaleId, customerId, branch: { organizationId } },
    });
    if (!sale) throw new AppError("Related sale not found", 404);
  }
  if (data.relatedImeiRecordId) {
    const imei = await prisma.imeiRecord.findFirst({
      where: { id: data.relatedImeiRecordId, branch: { organizationId } },
    });
    if (!imei) throw new AppError("Related device not found", 404);
  }

  const ticketNumber = await nextTicketNumber();

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        ticketNumber,
        customerId,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        relatedSaleId: data.relatedSaleId,
        relatedImeiRecordId: data.relatedImeiRecordId,
      },
    });
    await tx.ticketMessage.create({
      data: {
        ticketId: created.id,
        senderType: "CUSTOMER",
        senderCustomerId: customerId,
        message: data.message,
      },
    });
    return created;
  });

  await logAudit(prisma, {
    userId: null,
    organizationId,
    action: "TICKET_CREATED",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { customerId, ticketNumber },
  });

  const full = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: TICKET_INCLUDE });
  res.status(201).json(full);
}

const replySchema = z.object({ message: z.string().trim().min(1) });

export async function replyToMyTicket(req: Request, res: Response) {
  const data = replySchema.parse(req.body);
  const customerId = req.customer!.sub;
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: req.params.id } });

  if (ticket.customerId !== customerId) throw new AppError("Not found", 404);
  if (ticket.status === "CLOSED") throw new AppError("This ticket is closed", 409);

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, senderType: "CUSTOMER", senderCustomerId: customerId, message: data.message },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: ticket.status === "AWAITING_CUSTOMER" ? "OPEN" : ticket.status },
    }),
  ]);

  const full = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: TICKET_INCLUDE });
  res.json(full);
}

export async function closeMyTicket(req: Request, res: Response) {
  const customerId = req.customer!.sub;
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: req.params.id } });
  if (ticket.customerId !== customerId) throw new AppError("Not found", 404);

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  res.json(updated);
}

// ---------------------------------------------------------------------------
// Staff-side (mounted under /api/tickets)
// ---------------------------------------------------------------------------

export async function listTickets(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(1000, Number(req.query.pageSize) || 20);
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const assignedToId = req.query.assignedToId as string | undefined;
  const customerId = req.query.customerId as string | undefined;
  const organizationId = resolveOrgFilterMode(req);

  const where = {
    ...(organizationId ? { customer: { organizationId } } : {}),
    ...(status ? { status: status as never } : {}),
    ...(category ? { category: category as never } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(customerId ? { customerId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        customer: { select: { ...SAFE_CUSTOMER_SELECT, organization: { select: ORG_SUMMARY_SELECT } } },
        assignedTo: { select: SAFE_USER_SELECT },
      },
      orderBy: parseSortOrder(req, TICKET_SORT_FIELDS, { updatedAt: "desc" }),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}

export async function getTicket(req: Request, res: Response) {
  const organizationId = resolveOrgFilterMode(req);
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, ...(organizationId ? { customer: { organizationId } } : {}) },
    include: TICKET_INCLUDE,
  });
  if (!ticket) throw new AppError("Ticket not found", 404);
  res.json(ticket);
}

async function assertTicketInOrg(id: string, organizationId: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id, customer: { organizationId } } });
  if (!ticket) throw new AppError("Ticket not found", 404);
  return ticket;
}

const assignSchema = z.object({ assignedToId: z.string().uuid().nullable() });

export async function assignTicket(req: Request, res: Response) {
  const data = assignSchema.parse(req.body);
  await assertTicketInOrg(req.params.id, req.user!.organizationId!);
  const ticket = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: { assignedToId: data.assignedToId },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "TICKET_ASSIGNED",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { assignedToId: data.assignedToId },
  });

  res.json(ticket);
}

const staffReplySchema = z.object({
  message: z.string().trim().min(1),
  resolve: z.boolean().optional(),
});

export async function replyToTicket(req: Request, res: Response) {
  const data = staffReplySchema.parse(req.body);
  const userId = req.user!.sub;
  const ticket = await assertTicketInOrg(req.params.id, req.user!.organizationId!);

  const nextStatus = data.resolve ? "RESOLVED" : "AWAITING_CUSTOMER";

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, senderType: "STAFF", senderUserId: userId, message: data.message },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: nextStatus, closedAt: nextStatus === "RESOLVED" ? new Date() : null },
    }),
  ]);

  await logAudit(prisma, {
    userId,
    action: "TICKET_REPLIED",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { status: nextStatus },
  });

  await createNotification(prisma, {
    customerId: ticket.customerId,
    type: "INFO",
    title: `New reply on ${ticket.ticketNumber}`,
    message: data.message.slice(0, 200),
  });

  const full = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: TICKET_INCLUDE });
  res.json(full);
}

const statusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "AWAITING_CUSTOMER", "RESOLVED", "CLOSED"]),
});

export async function updateTicketStatus(req: Request, res: Response) {
  const data = statusSchema.parse(req.body);
  await assertTicketInOrg(req.params.id, req.user!.organizationId!);
  const ticket = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      closedAt: data.status === "CLOSED" || data.status === "RESOLVED" ? new Date() : null,
    },
  });

  await logAudit(prisma, {
    userId: req.user!.sub,
    action: "TICKET_STATUS_CHANGED",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { status: data.status },
  });

  res.json(ticket);
}
