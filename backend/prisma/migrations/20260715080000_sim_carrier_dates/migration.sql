-- CreateEnum
CREATE TYPE "SimCarrier" AS ENUM ('JIO', 'AIRTEL', 'VI', 'BSNL', 'OTHER');

-- Convert Sim.carrier from free-text to enum, mapping existing values best-effort
ALTER TABLE "Sim" ADD COLUMN "carrierNew" "SimCarrier";
UPDATE "Sim" SET "carrierNew" = CASE
  WHEN carrier ILIKE 'jio%' THEN 'JIO'::"SimCarrier"
  WHEN carrier ILIKE 'airtel%' THEN 'AIRTEL'::"SimCarrier"
  WHEN carrier ILIKE 'vi%' OR carrier ILIKE 'vodafone%' THEN 'VI'::"SimCarrier"
  WHEN carrier ILIKE 'bsnl%' THEN 'BSNL'::"SimCarrier"
  ELSE 'OTHER'::"SimCarrier"
END;
ALTER TABLE "Sim" DROP COLUMN "carrier";
ALTER TABLE "Sim" RENAME COLUMN "carrierNew" TO "carrier";
ALTER TABLE "Sim" ALTER COLUMN "carrier" SET NOT NULL;
ALTER TABLE "Sim" ALTER COLUMN "carrier" SET DEFAULT 'OTHER';

-- AlterTable: purchase/sale/expiry dates
ALTER TABLE "Sim" ADD COLUMN "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Sim" ADD COLUMN "saleDate" TIMESTAMP(3);
ALTER TABLE "Sim" ADD COLUMN "expiryDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Sim_carrier_idx" ON "Sim"("carrier");
CREATE INDEX "Sim_expiryDate_idx" ON "Sim"("expiryDate");
