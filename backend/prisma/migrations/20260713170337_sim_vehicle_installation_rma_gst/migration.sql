-- CreateEnum
CREATE TYPE "SimStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'REMOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RmaStatus" AS ENUM ('REQUESTED', 'SHIPPED_TO_SUPPLIER', 'RECEIVED_BY_SUPPLIER', 'REPLACED', 'REPAIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GstType" AS ENUM ('INTRA_STATE', 'INTER_STATE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "cgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstType" "GstType" NOT NULL DEFAULT 'INTRA_STATE',
ADD COLUMN     "igstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "sgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Sim" (
    "id" TEXT NOT NULL,
    "iccid" TEXT NOT NULL,
    "msisdn" TEXT,
    "carrier" TEXT,
    "status" "SimStatus" NOT NULL DEFAULT 'AVAILABLE',
    "customerId" TEXT,
    "imeiRecordId" TEXT,
    "branchId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "ownerCustomerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "imeiRecordId" TEXT NOT NULL,
    "simId" TEXT,
    "installedBy" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledDate" TIMESTAMP(3),
    "installedDate" TIMESTAMP(3),
    "removedDate" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rma" (
    "id" TEXT NOT NULL,
    "imeiRecordId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "RmaStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "shippedDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "replacementImeiRecordId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sim_iccid_key" ON "Sim"("iccid");

-- CreateIndex
CREATE UNIQUE INDEX "Sim_imeiRecordId_key" ON "Sim"("imeiRecordId");

-- CreateIndex
CREATE INDEX "Sim_status_idx" ON "Sim"("status");

-- CreateIndex
CREATE INDEX "Sim_customerId_idx" ON "Sim"("customerId");

-- CreateIndex
CREATE INDEX "Sim_branchId_idx" ON "Sim"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationNumber_key" ON "Vehicle"("registrationNumber");

-- CreateIndex
CREATE INDEX "Vehicle_ownerCustomerId_idx" ON "Vehicle"("ownerCustomerId");

-- CreateIndex
CREATE INDEX "Vehicle_branchId_idx" ON "Vehicle"("branchId");

-- CreateIndex
CREATE INDEX "InstallationRecord_vehicleId_idx" ON "InstallationRecord"("vehicleId");

-- CreateIndex
CREATE INDEX "InstallationRecord_imeiRecordId_idx" ON "InstallationRecord"("imeiRecordId");

-- CreateIndex
CREATE INDEX "InstallationRecord_status_idx" ON "InstallationRecord"("status");

-- CreateIndex
CREATE INDEX "InstallationRecord_branchId_idx" ON "InstallationRecord"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Rma_replacementImeiRecordId_key" ON "Rma"("replacementImeiRecordId");

-- CreateIndex
CREATE INDEX "Rma_imeiRecordId_idx" ON "Rma"("imeiRecordId");

-- CreateIndex
CREATE INDEX "Rma_supplierId_idx" ON "Rma"("supplierId");

-- CreateIndex
CREATE INDEX "Rma_status_idx" ON "Rma"("status");

-- CreateIndex
CREATE INDEX "Rma_branchId_idx" ON "Rma"("branchId");

-- AddForeignKey
ALTER TABLE "Sim" ADD CONSTRAINT "Sim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sim" ADD CONSTRAINT "Sim_imeiRecordId_fkey" FOREIGN KEY ("imeiRecordId") REFERENCES "ImeiRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sim" ADD CONSTRAINT "Sim_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerCustomerId_fkey" FOREIGN KEY ("ownerCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRecord" ADD CONSTRAINT "InstallationRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRecord" ADD CONSTRAINT "InstallationRecord_imeiRecordId_fkey" FOREIGN KEY ("imeiRecordId") REFERENCES "ImeiRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRecord" ADD CONSTRAINT "InstallationRecord_simId_fkey" FOREIGN KEY ("simId") REFERENCES "Sim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRecord" ADD CONSTRAINT "InstallationRecord_installedBy_fkey" FOREIGN KEY ("installedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRecord" ADD CONSTRAINT "InstallationRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rma" ADD CONSTRAINT "Rma_imeiRecordId_fkey" FOREIGN KEY ("imeiRecordId") REFERENCES "ImeiRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rma" ADD CONSTRAINT "Rma_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rma" ADD CONSTRAINT "Rma_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
