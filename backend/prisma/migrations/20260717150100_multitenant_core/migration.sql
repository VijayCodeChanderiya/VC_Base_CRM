-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeatureType" AS ENUM ('BOOLEAN', 'LIMIT');

-- CreateEnum
CREATE TYPE "PlatformTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_ORG', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PlatformTicketCategory" AS ENUM ('BILLING', 'PLAN_UPGRADE', 'TECHNICAL', 'BUG', 'OTHER');

-- CreateEnum
CREATE TYPE "PlatformTicketSenderType" AS ENUM ('ORG', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
    "planId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "FeatureType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "boolValue" BOOLEAN,
    "numValue" INTEGER,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFeatureOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "boolValue" BOOLEAN,
    "numValue" INTEGER,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFeatureOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "PlatformTicketCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "PlatformTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "PlatformTicketStatus" NOT NULL DEFAULT 'OPEN',
    "raisedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderType" "PlatformTicketSenderType" NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_billingStatus_idx" ON "Organization"("billingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeature_planId_featureId_key" ON "PlanFeature"("planId", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFeatureOverride_organizationId_featureId_key" ON "OrganizationFeatureOverride"("organizationId", "featureId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTicket_ticketNumber_key" ON "PlatformTicket"("ticketNumber");
CREATE INDEX "PlatformTicket_organizationId_idx" ON "PlatformTicket"("organizationId");
CREATE INDEX "PlatformTicket_status_idx" ON "PlatformTicket"("status");

-- CreateIndex
CREATE INDEX "PlatformTicketMessage_ticketId_idx" ON "PlatformTicketMessage"("ticketId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationFeatureOverride" ADD CONSTRAINT "OrganizationFeatureOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationFeatureOverride" ADD CONSTRAINT "OrganizationFeatureOverride_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTicket" ADD CONSTRAINT "PlatformTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformTicket" ADD CONSTRAINT "PlatformTicket_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformTicket" ADD CONSTRAINT "PlatformTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTicketMessage" ADD CONSTRAINT "PlatformTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PlatformTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformTicketMessage" ADD CONSTRAINT "PlatformTicketMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: grandfathered Organization + Legacy Plan (effectively unlimited) + a starter Feature catalog
INSERT INTO "Organization" ("id", "name", "slug", "billingStatus", "isActive", "createdAt", "updatedAt")
VALUES ('10000000-0000-0000-0000-000000000001', 'Alphatech (Default)', 'alphatech-default', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Plan" ("id", "name", "code", "description", "isActive", "createdAt", "updatedAt")
VALUES ('10000000-0000-0000-0000-000000000002', 'Legacy', 'LEGACY', 'Grandfathered plan for the original single-tenant deployment — effectively unlimited.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Feature" ("id", "key", "label", "description", "type", "createdAt") VALUES
('10000000-0000-0000-0000-000000000003', 'maxBranches', 'Maximum branches', 'How many branches an organization may create.', 'LIMIT', CURRENT_TIMESTAMP),
('10000000-0000-0000-0000-000000000004', 'maxUsers', 'Maximum staff users', 'How many staff user accounts an organization may create.', 'LIMIT', CURRENT_TIMESTAMP),
('10000000-0000-0000-0000-000000000005', 'amcModule', 'AMC Contracts module', 'Access to the AMC Contracts feature.', 'BOOLEAN', CURRENT_TIMESTAMP),
('10000000-0000-0000-0000-000000000006', 'ticketingModule', 'Support Ticketing module', 'Access to the customer support ticket system.', 'BOOLEAN', CURRENT_TIMESTAMP);

INSERT INTO "PlanFeature" ("id", "planId", "featureId", "boolValue", "numValue") VALUES
('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', NULL, NULL),
('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', NULL, NULL),
('10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', true, NULL),
('10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', true, NULL);

UPDATE "Organization" SET "planId" = '10000000-0000-0000-0000-000000000002' WHERE "id" = '10000000-0000-0000-0000-000000000001';

-- Branch: attach to the grandfathered Organization, re-scope the code uniqueness to be per-organization
ALTER TABLE "Branch" ADD COLUMN "organizationId" TEXT;
UPDATE "Branch" SET "organizationId" = '10000000-0000-0000-0000-000000000001';
ALTER TABLE "Branch" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "Branch_code_key";
CREATE UNIQUE INDEX "Branch_organizationId_code_key" ON "Branch"("organizationId", "code");
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- User: attach every existing (non-SUPER_ADMIN, none exist yet) user to the grandfathered Organization
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
UPDATE "User" SET "organizationId" = '10000000-0000-0000-0000-000000000001' WHERE "role" != 'SUPER_ADMIN';
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
