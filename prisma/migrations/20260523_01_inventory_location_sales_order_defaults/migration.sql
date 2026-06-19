ALTER TABLE "InventoryLocation"
ADD COLUMN IF NOT EXISTS "useForSalesOrderDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "InventoryLocation"
SET "useForSalesOrderDefault" = "useForSalesDefault"
WHERE "useForSalesOrderDefault" = false
  AND "useForSalesDefault" = true;

ALTER TABLE "PosTransactionLine"
ADD COLUMN IF NOT EXISTS "inventoryLocationId" TEXT;

CREATE INDEX IF NOT EXISTS "PosTransactionLine_inventoryLocationId_idx"
ON "PosTransactionLine"("inventoryLocationId");

ALTER TABLE "PosTransactionLine"
ADD CONSTRAINT "PosTransactionLine_inventoryLocationId_fkey"
FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
