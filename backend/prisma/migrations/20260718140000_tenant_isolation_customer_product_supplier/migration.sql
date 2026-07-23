-- Tenant isolation fix: Customer, Supplier, Product were fully global (no
-- organizationId at all), causing cross-organization data leakage once a
-- second real Organization existed. Backfill attributes all pre-existing
-- rows to the original grandfathered organization.

-- Customer: add organizationId, backfill, enforce NOT NULL
ALTER TABLE "Customer" ADD COLUMN "organizationId" TEXT;
UPDATE "Customer" SET "organizationId" = '10000000-0000-0000-0000-000000000001';
ALTER TABLE "Customer" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "Customer_email_key";
DROP INDEX "Customer_phone_key";
DROP INDEX "Customer_username_key";
CREATE UNIQUE INDEX "Customer_organizationId_email_key" ON "Customer"("organizationId", "email");
CREATE UNIQUE INDEX "Customer_organizationId_phone_key" ON "Customer"("organizationId", "phone");
CREATE UNIQUE INDEX "Customer_organizationId_username_key" ON "Customer"("organizationId", "username");
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supplier: add organizationId, backfill, enforce NOT NULL
ALTER TABLE "Supplier" ADD COLUMN "organizationId" TEXT;
UPDATE "Supplier" SET "organizationId" = '10000000-0000-0000-0000-000000000001';
ALTER TABLE "Supplier" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "Supplier_phone_key";
CREATE UNIQUE INDEX "Supplier_organizationId_phone_key" ON "Supplier"("organizationId", "phone");
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Product: add organizationId, backfill, enforce NOT NULL
ALTER TABLE "Product" ADD COLUMN "organizationId" TEXT;
UPDATE "Product" SET "organizationId" = '10000000-0000-0000-0000-000000000001';
ALTER TABLE "Product" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "Product_sku_key";
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
