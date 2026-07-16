-- CreateTable: Branch
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- Seed a MAIN branch and backfill all existing branch-scoped rows onto it
INSERT INTO "Branch" ("id", "code", "name", "isActive", "createdAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'MAIN', 'Main Branch', true, CURRENT_TIMESTAMP);

-- Inventory: replace free-text branch with branchId FK
ALTER TABLE "Inventory" ADD COLUMN "branchId" TEXT;
UPDATE "Inventory" SET "branchId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Inventory" ALTER COLUMN "branchId" SET NOT NULL;

DROP INDEX "Inventory_productId_key";
DROP INDEX "Inventory_branch_idx";
ALTER TABLE "Inventory" DROP COLUMN "branch";

CREATE UNIQUE INDEX "Inventory_productId_branchId_key" ON "Inventory"("productId", "branchId");
CREATE INDEX "Inventory_branchId_idx" ON "Inventory"("branchId");
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InventoryTransaction: replace free-text branch with branchId FK
ALTER TABLE "InventoryTransaction" ADD COLUMN "branchId" TEXT;
UPDATE "InventoryTransaction" SET "branchId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "InventoryTransaction" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "InventoryTransaction" DROP COLUMN "branch";

CREATE INDEX "InventoryTransaction_branchId_idx" ON "InventoryTransaction"("branchId");
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ImeiRecord: replace free-text branch with branchId FK
ALTER TABLE "ImeiRecord" ADD COLUMN "branchId" TEXT;
UPDATE "ImeiRecord" SET "branchId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "ImeiRecord" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "ImeiRecord" DROP COLUMN "branch";

CREATE INDEX "ImeiRecord_branchId_idx" ON "ImeiRecord"("branchId");
ALTER TABLE "ImeiRecord" ADD CONSTRAINT "ImeiRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sale: add branchId FK
ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT;
UPDATE "Sale" SET "branchId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Sale" ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX "Sale_branchId_idx" ON "Sale"("branchId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purchase: add branchId FK
ALTER TABLE "Purchase" ADD COLUMN "branchId" TEXT;
UPDATE "Purchase" SET "branchId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Purchase" ALTER COLUMN "branchId" SET NOT NULL;

CREATE INDEX "Purchase_branchId_idx" ON "Purchase"("branchId");
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
