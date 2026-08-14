ALTER TABLE "InterStoreTransfer"
  ADD COLUMN IF NOT EXISTS "requestedUnitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
  ADD COLUMN IF NOT EXISTS "requestedUnitQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "uomConversionFactor" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "baseUnitOfMeasure" TEXT NOT NULL DEFAULT 'EA';

UPDATE "InterStoreTransfer"
SET "requestedUnitQuantity" = "requestedQuantity"
WHERE "requestedUnitQuantity" <= 0;

UPDATE "InterStoreTransfer" AS transfer_row
SET "requestedUnitOfMeasure" = product."unitOfMeasure",
    "baseUnitOfMeasure" = product."unitOfMeasure"
FROM "Product" AS product
WHERE product."id" = transfer_row."productId"
  AND transfer_row."requestedUnitOfMeasure" = 'EA'
  AND transfer_row."baseUnitOfMeasure" = 'EA'
  AND product."unitOfMeasure" <> 'EA';
