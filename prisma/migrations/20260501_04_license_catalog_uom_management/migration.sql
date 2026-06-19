-- HQ-managed licensing, inventory catalogs, and UOM schedules.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "baseUnitOfMeasureId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "uomScheduleId" TEXT;

CREATE TABLE IF NOT EXISTS "UnitOfMeasureSchedule" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "baseUnitOfMeasureId" TEXT NOT NULL,
  "isDefaultForStock" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "UnitOfMeasureSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UnitOfMeasureScheduleLine" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "unitOfMeasureId" TEXT NOT NULL,
  "conversionFactor" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "isBaseUnit" BOOLEAN NOT NULL DEFAULT false,
  "allowSale" BOOLEAN NOT NULL DEFAULT true,
  "allowPurchase" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitOfMeasureScheduleLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryCatalog" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "InventoryCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryCatalogProduct" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryCatalogStore" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCatalogStore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LicenseEvent" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "storeId" TEXT,
  "terminalId" TEXT,
  "scope" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT NOT NULL,
  "previousLicensedUntil" TIMESTAMP(3),
  "newLicensedUntil" TIMESTAMP(3),
  "previousLicenseKey" TEXT,
  "newLicenseKey" TEXT,
  "operatorName" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UnitOfMeasureSchedule_retailOrgId_code_key" ON "UnitOfMeasureSchedule"("retailOrgId", "code");
CREATE INDEX IF NOT EXISTS "UnitOfMeasureSchedule_retailOrgId_status_isDefaultForStock_idx" ON "UnitOfMeasureSchedule"("retailOrgId", "status", "isDefaultForStock");
CREATE UNIQUE INDEX IF NOT EXISTS "UnitOfMeasureScheduleLine_scheduleId_unitOfMeasureId_key" ON "UnitOfMeasureScheduleLine"("scheduleId", "unitOfMeasureId");
CREATE INDEX IF NOT EXISTS "UnitOfMeasureScheduleLine_unitOfMeasureId_idx" ON "UnitOfMeasureScheduleLine"("unitOfMeasureId");

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCatalog_retailOrgId_code_key" ON "InventoryCatalog"("retailOrgId", "code");
CREATE INDEX IF NOT EXISTS "InventoryCatalog_retailOrgId_status_idx" ON "InventoryCatalog"("retailOrgId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCatalogProduct_catalogId_productId_key" ON "InventoryCatalogProduct"("catalogId", "productId");
CREATE INDEX IF NOT EXISTS "InventoryCatalogProduct_retailOrgId_productId_idx" ON "InventoryCatalogProduct"("retailOrgId", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCatalogStore_catalogId_storeId_key" ON "InventoryCatalogStore"("catalogId", "storeId");
CREATE INDEX IF NOT EXISTS "InventoryCatalogStore_retailOrgId_storeId_idx" ON "InventoryCatalogStore"("retailOrgId", "storeId");

CREATE INDEX IF NOT EXISTS "LicenseEvent_retailOrgId_createdAt_idx" ON "LicenseEvent"("retailOrgId", "createdAt");
CREATE INDEX IF NOT EXISTS "LicenseEvent_storeId_createdAt_idx" ON "LicenseEvent"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "LicenseEvent_terminalId_createdAt_idx" ON "LicenseEvent"("terminalId", "createdAt");

ALTER TABLE "UnitOfMeasureSchedule" ADD CONSTRAINT "UnitOfMeasureSchedule_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOfMeasureSchedule" ADD CONSTRAINT "UnitOfMeasureSchedule_baseUnitOfMeasureId_fkey" FOREIGN KEY ("baseUnitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnitOfMeasureScheduleLine" ADD CONSTRAINT "UnitOfMeasureScheduleLine_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "UnitOfMeasureSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOfMeasureScheduleLine" ADD CONSTRAINT "UnitOfMeasureScheduleLine_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryCatalog" ADD CONSTRAINT "InventoryCatalog_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCatalogProduct" ADD CONSTRAINT "InventoryCatalogProduct_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCatalogProduct" ADD CONSTRAINT "InventoryCatalogProduct_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "InventoryCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCatalogProduct" ADD CONSTRAINT "InventoryCatalogProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCatalogStore" ADD CONSTRAINT "InventoryCatalogStore_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCatalogStore" ADD CONSTRAINT "InventoryCatalogStore_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "InventoryCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCatalogStore" ADD CONSTRAINT "InventoryCatalogStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LicenseEvent" ADD CONSTRAINT "LicenseEvent_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseEvent" ADD CONSTRAINT "LicenseEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LicenseEvent" ADD CONSTRAINT "LicenseEvent_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_baseUnitOfMeasureId_fkey" FOREIGN KEY ("baseUnitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_uomScheduleId_fkey" FOREIGN KEY ("uomScheduleId") REFERENCES "UnitOfMeasureSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "UnitOfMeasureSchedule" (
  "id", "retailOrgId", "code", "name", "description", "baseUnitOfMeasureId", "isDefaultForStock", "status", "createdAt", "updatedAt"
)
SELECT CONCAT('uom-schedule-', org."id", '-EA-STOCK'), org."id", 'EA-STOCK', 'Each stock schedule', 'Default stock-item schedule for each-based inventory.', uom."id", true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "RetailOrg" AS org
JOIN "UnitOfMeasure" AS uom ON uom."retailOrgId" = org."id" AND uom."code" = 'EA'
ON CONFLICT ("retailOrgId", "code") DO NOTHING;

INSERT INTO "UnitOfMeasureScheduleLine" (
  "id", "scheduleId", "unitOfMeasureId", "conversionFactor", "isBaseUnit", "allowSale", "allowPurchase", "sortOrder", "createdAt", "updatedAt"
)
SELECT CONCAT('uom-schedule-line-', schedule."id", '-', uom."code"), schedule."id", uom."id", 1, true, true, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UnitOfMeasureSchedule" AS schedule
JOIN "UnitOfMeasure" AS uom ON uom."retailOrgId" = schedule."retailOrgId" AND uom."code" = 'EA'
ON CONFLICT ("scheduleId", "unitOfMeasureId") DO NOTHING;

UPDATE "Product" AS product
SET
  "baseUnitOfMeasureId" = uom."id",
  "uomScheduleId" = schedule."id"
FROM "UnitOfMeasure" AS uom
LEFT JOIN "UnitOfMeasureSchedule" AS schedule
  ON schedule."retailOrgId" = uom."retailOrgId"
  AND schedule."baseUnitOfMeasureId" = uom."id"
  AND schedule."isDefaultForStock" = true
WHERE product."retailOrgId" = uom."retailOrgId"
  AND UPPER(product."unitOfMeasure") = UPPER(uom."code")
  AND product."baseUnitOfMeasureId" IS NULL;
