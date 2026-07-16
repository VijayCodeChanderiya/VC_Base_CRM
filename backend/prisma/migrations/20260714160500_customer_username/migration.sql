-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_username_key" ON "Customer"("username");
