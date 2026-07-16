-- AlterTable
ALTER TABLE "ImeiRecord" ADD COLUMN     "supplierId" TEXT;

-- AddForeignKey
ALTER TABLE "ImeiRecord" ADD CONSTRAINT "ImeiRecord_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
