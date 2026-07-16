-- CreateEnum
CREATE TYPE "SimBillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Sim" ADD COLUMN "billingCycle" "SimBillingCycle";
