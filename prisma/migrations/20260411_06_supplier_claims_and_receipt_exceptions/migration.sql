-- CreateEnum
CREATE TYPE "SupplierClaimStatus" AS ENUM ('OPEN', 'CREDIT_REQUESTED', 'CREDIT_RECEIVED', 'WRITTEN_OFF', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupplierClaimReason" AS ENUM ('SHORT_SUPPLIED', 'REJECTED_AT_RECEIPT', 'DAMAGED_INBOUND', 'WRONG_ITEM', 'OTHER');

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "exceptionQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SupplierClaim" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT,
    "warehouseId" TEXT,
    "inventoryLocationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "goodsReceiptId" TEXT,
    "claimNo" TEXT NOT NULL,
    "externalReference" TEXT,
    "status" "SupplierClaimStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "operatorName" TEXT,
    "sourceNodeCode" TEXT,
    "creditNoteReference" TEXT,
    "creditNoteAmount" DECIMAL(18,2),
    "creditReceivedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaimLine" (
    "id" TEXT NOT NULL,
    "supplierClaimId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    "goodsReceiptLineId" TEXT,
    "productId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,2),
    "reason" "SupplierClaimReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierClaim_inventoryLocationId_status_updatedAt_idx" ON "SupplierClaim"("inventoryLocationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaim_retailOrgId_claimNo_key" ON "SupplierClaim"("retailOrgId", "claimNo");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaimLine_supplierClaimId_lineNo_key" ON "SupplierClaimLine"("supplierClaimId", "lineNo");

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaim" ADD CONSTRAINT "SupplierClaim_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimLine" ADD CONSTRAINT "SupplierClaimLine_supplierClaimId_fkey" FOREIGN KEY ("supplierClaimId") REFERENCES "SupplierClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimLine" ADD CONSTRAINT "SupplierClaimLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimLine" ADD CONSTRAINT "SupplierClaimLine_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierClaimLine" ADD CONSTRAINT "SupplierClaimLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

