-- CreateEnum
CREATE TYPE "SerialInventoryStatus" AS ENUM ('AVAILABLE', 'SOLD', 'ADJUSTED_OUT');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "salesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "warehouseEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "InventorySerialUnit" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT,
    "warehouseId" TEXT,
    "inventoryLocationId" TEXT,
    "productId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "SerialInventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "sourceReferenceType" TEXT,
    "sourceReferenceId" TEXT,
    "sourceReferenceLabel" TEXT,
    "sourceNodeCode" TEXT,
    "lastOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySerialUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT,
    "warehouseId" TEXT,
    "inventoryLocationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "receiptNo" TEXT NOT NULL,
    "externalReference" TEXT,
    "note" TEXT,
    "operatorName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceNodeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,2),
    "serialNumbersSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventorySerialUnit_storeId_productId_status_updatedAt_idx" ON "InventorySerialUnit"("storeId", "productId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InventorySerialUnit_inventoryLocationId_productId_status_up_idx" ON "InventorySerialUnit"("inventoryLocationId", "productId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerialUnit_retailOrgId_productId_serialNumber_key" ON "InventorySerialUnit"("retailOrgId", "productId", "serialNumber");

-- CreateIndex
CREATE INDEX "GoodsReceipt_inventoryLocationId_postedAt_idx" ON "GoodsReceipt"("inventoryLocationId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_retailOrgId_receiptNo_key" ON "GoodsReceipt"("retailOrgId", "receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptLine_goodsReceiptId_lineNo_key" ON "GoodsReceiptLine"("goodsReceiptId", "lineNo");

-- AddForeignKey
ALTER TABLE "InventorySerialUnit" ADD CONSTRAINT "InventorySerialUnit_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerialUnit" ADD CONSTRAINT "InventorySerialUnit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerialUnit" ADD CONSTRAINT "InventorySerialUnit_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerialUnit" ADD CONSTRAINT "InventorySerialUnit_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerialUnit" ADD CONSTRAINT "InventorySerialUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

