-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('GOOGLE', 'INDIAMART', 'JUSTDIAL', 'WEBSITE', 'REFERRAL', 'OTHER');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "city" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "source" "CustomerSource";
