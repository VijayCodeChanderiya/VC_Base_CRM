-- AlterEnum
ALTER TYPE "SimBillingCycle" ADD VALUE 'HALF_YEARLY';

-- CreateTable
CREATE TABLE "SimRenewal" (
    "id" TEXT NOT NULL,
    "simId" TEXT NOT NULL,
    "billingCycle" "SimBillingCycle" NOT NULL,
    "previousExpiryDate" TIMESTAMP(3),
    "newExpiryDate" TIMESTAMP(3) NOT NULL,
    "renewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimRenewal_simId_idx" ON "SimRenewal"("simId");

-- AddForeignKey
ALTER TABLE "SimRenewal" ADD CONSTRAINT "SimRenewal_simId_fkey" FOREIGN KEY ("simId") REFERENCES "Sim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRenewal" ADD CONSTRAINT "SimRenewal_renewedById_fkey" FOREIGN KEY ("renewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
