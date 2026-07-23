-- AuditLog: add nullable organizationId, best-effort backfill from the acting user's org
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
UPDATE "AuditLog" a
SET "organizationId" = u."organizationId"
FROM "User" u
WHERE a."userId" = u.id AND u."organizationId" IS NOT NULL;
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Announcement: add required organizationId (no existing rows to backfill in any environment that
-- hasn't shipped this feature yet, but backfill to the grandfathered default org defensively)
ALTER TABLE "Announcement" ADD COLUMN "organizationId" TEXT;
UPDATE "Announcement" SET "organizationId" = '10000000-0000-0000-0000-000000000001' WHERE "organizationId" IS NULL;
ALTER TABLE "Announcement" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "Announcement_organizationId_idx" ON "Announcement"("organizationId");
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
