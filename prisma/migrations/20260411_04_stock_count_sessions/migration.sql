-- CreateEnum
CREATE TYPE "StockCountSessionStatus" AS ENUM ('SUBMITTED', 'COMMITTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockCountSession" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT,
    "warehouseId" TEXT,
    "inventoryLocationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sessionNo" TEXT NOT NULL,
    "status" "StockCountSessionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "previousQuantity" DECIMAL(18,3) NOT NULL,
    "countedQuantity" DECIMAL(18,3) NOT NULL,
    "varianceQuantity" DECIMAL(18,3) NOT NULL,
    "previousSerialNumbersSnapshot" JSONB,
    "countedSerialNumbersSnapshot" JSONB,
    "note" TEXT,
    "operatorName" TEXT NOT NULL,
    "submittedByNodeCode" TEXT,
    "committedByNodeCode" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCountSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCountSession_inventoryLocationId_status_updatedAt_idx" ON "StockCountSession"("inventoryLocationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "StockCountSession_productId_status_updatedAt_idx" ON "StockCountSession"("productId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountSession_retailOrgId_sessionNo_key" ON "StockCountSession"("retailOrgId", "sessionNo");

-- AddForeignKey
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountSession" ADD CONSTRAINT "StockCountSession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
