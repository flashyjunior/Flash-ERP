-- Store policy, licensing, UOM, and gift certificate foundations.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "storeGroupCode" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "storeGroupName" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "storeGroupType" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "licenseStatus" TEXT NOT NULL DEFAULT 'LICENSED';
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "licenseKey" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "licensedUntil" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "catalogPolicyJson" JSONB;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "touchModeEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Terminal" ADD COLUMN IF NOT EXISTS "licenseStatus" TEXT NOT NULL DEFAULT 'LICENSED';
ALTER TABLE "Terminal" ADD COLUMN IF NOT EXISTS "licenseKey" TEXT;
ALTER TABLE "Terminal" ADD COLUMN IF NOT EXISTS "licensedUntil" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "UnitOfMeasure" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "decimalPrecision" INTEGER NOT NULL DEFAULT 0,
  "allowFractionalSale" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GiftCertificate" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "storeId" TEXT,
  "certificateNo" TEXT NOT NULL,
  "recipientName" TEXT,
  "purchaserName" TEXT,
  "originalAmount" DECIMAL(18,2) NOT NULL,
  "balanceAmount" DECIMAL(18,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiryDate" TIMESTAMP(3),
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "GiftCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UnitOfMeasure_retailOrgId_code_key" ON "UnitOfMeasure"("retailOrgId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCertificate_retailOrgId_certificateNo_key" ON "GiftCertificate"("retailOrgId", "certificateNo");
CREATE INDEX IF NOT EXISTS "Store_retailOrgId_storeGroupCode_idx" ON "Store"("retailOrgId", "storeGroupCode");
CREATE INDEX IF NOT EXISTS "Store_retailOrgId_licenseStatus_idx" ON "Store"("retailOrgId", "licenseStatus");
CREATE INDEX IF NOT EXISTS "Terminal_retailOrgId_licenseStatus_idx" ON "Terminal"("retailOrgId", "licenseStatus");
CREATE INDEX IF NOT EXISTS "GiftCertificate_storeId_status_idx" ON "GiftCertificate"("storeId", "status");

ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCertificate" ADD CONSTRAINT "GiftCertificate_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCertificate" ADD CONSTRAINT "GiftCertificate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "UnitOfMeasure" ("id", "retailOrgId", "code", "name", "description", "decimalPrecision", "allowFractionalSale", "status", "createdAt", "updatedAt")
SELECT CONCAT('uom-', org."id", '-', seed."code"), org."id", seed."code", seed."name", seed."description", seed."decimalPrecision", seed."allowFractionalSale", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "RetailOrg" AS org
CROSS JOIN (VALUES
  ('EA', 'Each', 'Single retail unit', 0, false),
  ('KG', 'Kilogram', 'Weight-based merchandise', 3, true),
  ('L', 'Litre', 'Volume-based merchandise', 3, true),
  ('PACK', 'Pack', 'Packaged retail unit', 0, false),
  ('CTN', 'Carton', 'Carton or case quantity', 0, false)
) AS seed("code", "name", "description", "decimalPrecision", "allowFractionalSale")
ON CONFLICT ("retailOrgId", "code") DO NOTHING;
