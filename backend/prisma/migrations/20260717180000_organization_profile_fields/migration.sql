-- AlterTable: Organization gains a full company-profile field set
ALTER TABLE "Organization"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "companyEmail" TEXT,
  ADD COLUMN "mobileNumber" TEXT,
  ADD COLUMN "alternateContactNumber" TEXT,
  ADD COLUMN "gstNumber" TEXT,
  ADD COLUMN "panNumber" TEXT,
  ADD COLUMN "cinNumber" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "industryType" TEXT,
  ADD COLUMN "businessType" TEXT,
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "pincode" TEXT,
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "ownerDesignation" TEXT,
  ADD COLUMN "ownerEmail" TEXT,
  ADD COLUMN "ownerMobile" TEXT;

-- One-time best-effort carry-over from the old single-tenant "companyProfile" Setting
-- JSON ({ companyName, address, gstNumber, currency, phone }) into the grandfathered
-- default Organization. Best-effort only: the old shape had one freeform "address"
-- string, not line1/line2/city/state/pincode, so it lands in addressLine1 as-is.
UPDATE "Organization" o
SET
  "gstNumber" = COALESCE(s.value->>'gstNumber', o."gstNumber"),
  "mobileNumber" = COALESCE(s.value->>'phone', o."mobileNumber"),
  "addressLine1" = COALESCE(s.value->>'address', o."addressLine1")
FROM "Setting" s
WHERE s.key = 'companyProfile'
  AND o.slug = 'alphatech-default';
