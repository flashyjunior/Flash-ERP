ALTER TABLE "PosTransactionLine"
ADD COLUMN IF NOT EXISTS "lineNote" TEXT;

ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "location" TEXT;

CREATE TABLE IF NOT EXISTS "transaction_reference_capture" (
  "id" TEXT PRIMARY KEY,
  "retailOrgId" TEXT NOT NULL,
  "referenceValue" TEXT NOT NULL,
  "normalizedReference" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "source" TEXT NOT NULL,
  "sourceTransactionNo" TEXT,
  "customerName" TEXT,
  "notes" TEXT,
  "firstCapturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCapturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_reference_capture_org_ref_key" UNIQUE ("retailOrgId", "normalizedReference")
);

CREATE TABLE IF NOT EXISTS "StoreProductPrice" (
  "id" TEXT PRIMARY KEY,
  "retailOrgId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productVariantId" TEXT,
  "unitPrice" DECIMAL(18, 2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreProductPrice_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoreProductPrice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoreProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoreProductPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductMatrixVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreProductPrice_store_product_variant_key"
  ON "StoreProductPrice"("storeId", "productId", "productVariantId");

CREATE UNIQUE INDEX IF NOT EXISTS "StoreProductPrice_store_product_base_key"
  ON "StoreProductPrice"("storeId", "productId")
  WHERE "productVariantId" IS NULL;

CREATE INDEX IF NOT EXISTS "StoreProductPrice_retailOrgId_storeId_status_idx"
  ON "StoreProductPrice"("retailOrgId", "storeId", "status");

CREATE INDEX IF NOT EXISTS "StoreProductPrice_productId_idx"
  ON "StoreProductPrice"("productId");

CREATE INDEX IF NOT EXISTS "StoreProductPrice_productVariantId_idx"
  ON "StoreProductPrice"("productVariantId");
