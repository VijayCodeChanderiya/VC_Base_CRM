-- AlterEnum: Role gains SUPER_ADMIN (kept in its own migration/transaction —
-- Postgres disallows using a new enum value in the same transaction that added it)
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
