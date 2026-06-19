-- Backfill the Warehouse licensing columns that already exist in Prisma schema.
-- The earlier store-policy migration added these fields for Store and Terminal only.
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "licenseStatus" TEXT NOT NULL DEFAULT 'UNLICENSED';
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "licenseKey" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "licensedUntil" TIMESTAMP(3);
