-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('WARRANTY', 'BILLING', 'TECHNICAL', 'SUBSCRIPTION', 'INSTALLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketSenderType" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "AmcStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED');

-- AlterTable: Notification gains customerId, userId becomes optional
ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "customerId" TEXT;

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "relatedSaleId" TEXT,
    "relatedImeiRecordId" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderType" "TicketSenderType" NOT NULL,
    "senderCustomerId" TEXT,
    "senderUserId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcContract" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "imeiRecordId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AmcStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingAmount" DECIMAL(12,2) NOT NULL,
    "billingCycle" "SimBillingCycle" NOT NULL DEFAULT 'YEARLY',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "lastRenewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_idx" ON "SupportTicket"("customerId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "AmcContract_contractNumber_key" ON "AmcContract"("contractNumber");

-- CreateIndex
CREATE INDEX "AmcContract_customerId_idx" ON "AmcContract"("customerId");

-- CreateIndex
CREATE INDEX "AmcContract_status_idx" ON "AmcContract"("status");

-- CreateIndex
CREATE INDEX "AmcContract_endDate_idx" ON "AmcContract"("endDate");

-- CreateIndex
CREATE INDEX "Announcement_isActive_publishedAt_idx" ON "Announcement"("isActive", "publishedAt");

-- CreateIndex
CREATE INDEX "Notification_customerId_isRead_idx" ON "Notification"("customerId", "isRead");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_relatedSaleId_fkey" FOREIGN KEY ("relatedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_relatedImeiRecordId_fkey" FOREIGN KEY ("relatedImeiRecordId") REFERENCES "ImeiRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_senderCustomerId_fkey" FOREIGN KEY ("senderCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_imeiRecordId_fkey" FOREIGN KEY ("imeiRecordId") REFERENCES "ImeiRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcContract" ADD CONSTRAINT "AmcContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
