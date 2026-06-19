-- CreateEnum
CREATE TYPE "PurchaseOrderClosureReason" AS ENUM (
    'FULFILLED',
    'SHORT_SUPPLIED',
    'CANCELLED_BY_SUPPLIER',
    'REJECTED_AT_RECEIPT',
    'RETURNED_TO_VENDOR',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierReturnReason" AS ENUM (
    'DAMAGED',
    'REJECTED_AT_RECEIPT',
    'QUALITY_HOLD',
    'SHORT_EXPIRY',
    'WRONG_ITEM',
    'OTHER'
);

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'RETURN_TO_VENDOR';

-- AlterTable
ALTER TABLE "PurchaseOrder"
ADD COLUMN "closureNote" TEXT,
ADD COLUMN "closureOperatorName" TEXT,
ADD COLUMN "closureReason" "PurchaseOrderClosureReason";

-- CreateTable
CREATE TABLE "SupplierReturn" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT,
    "warehouseId" TEXT,
    "inventoryLocationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "goodsReceiptId" TEXT,
    "supplierReturnNo" TEXT NOT NULL,
    "externalReference" TEXT,
    "reason" "SupplierReturnReason" NOT NULL,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'POSTED',
    "note" TEXT,
    "operatorName" TEXT,
    "returnedAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceNodeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReturnLine" (
    "id" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT,
    "productId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,2),
    "serialNumbersSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierReturn_inventoryLocationId_postedAt_idx"
ON "SupplierReturn"("inventoryLocationId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturn_retailOrgId_supplierReturnNo_key"
ON "SupplierReturn"("retailOrgId", "supplierReturnNo");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReturnLine_supplierReturnId_lineNo_key"
ON "SupplierReturnLine"("supplierReturnId", "lineNo");

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_retailOrgId_fkey"
FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_warehouseId_fkey"
FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_inventoryLocationId_fkey"
FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn"
ADD CONSTRAINT "SupplierReturn_goodsReceiptId_fkey"
FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine"
ADD CONSTRAINT "SupplierReturnLine_supplierReturnId_fkey"
FOREIGN KEY ("supplierReturnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine"
ADD CONSTRAINT "SupplierReturnLine_goodsReceiptLineId_fkey"
FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturnLine"
ADD CONSTRAINT "SupplierReturnLine_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
