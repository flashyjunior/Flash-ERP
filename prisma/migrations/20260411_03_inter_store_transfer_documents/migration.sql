-- CreateEnum
CREATE TYPE "InterStoreTransferOrigin" AS ENUM ('ENTERPRISE', 'STORE_REQUEST');

-- CreateEnum
CREATE TYPE "InterStoreTransferStatus" AS ENUM ('REQUESTED', 'PART_ISSUED', 'ISSUED', 'PART_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "SerialInventoryStatus" ADD VALUE 'IN_TRANSIT';

-- CreateTable
CREATE TABLE "InterStoreTransfer" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "sourceStoreId" TEXT NOT NULL,
    "destinationStoreId" TEXT NOT NULL,
    "sourceInventoryLocationId" TEXT NOT NULL,
    "destinationInventoryLocationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "externalReference" TEXT,
    "origin" "InterStoreTransferOrigin" NOT NULL,
    "status" "InterStoreTransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedQuantity" DECIMAL(18,3) NOT NULL,
    "issuedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,2),
    "issuedSerialNumbersSnapshot" JSONB,
    "receivedSerialNumbersSnapshot" JSONB,
    "requestNote" TEXT,
    "issueNote" TEXT,
    "receiptNote" TEXT,
    "requestOperatorName" TEXT,
    "issueOperatorName" TEXT,
    "receiptOperatorName" TEXT,
    "requestedByNodeCode" TEXT,
    "sourceNodeCode" TEXT,
    "destinationNodeCode" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterStoreTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterStoreTransfer_sourceStoreId_status_updatedAt_idx" ON "InterStoreTransfer"("sourceStoreId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InterStoreTransfer_destinationStoreId_status_updatedAt_idx" ON "InterStoreTransfer"("destinationStoreId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InterStoreTransfer_sourceInventoryLocationId_updatedAt_idx" ON "InterStoreTransfer"("sourceInventoryLocationId", "updatedAt");

-- CreateIndex
CREATE INDEX "InterStoreTransfer_destinationInventoryLocationId_updatedAt_idx" ON "InterStoreTransfer"("destinationInventoryLocationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterStoreTransfer_retailOrgId_transferNo_key" ON "InterStoreTransfer"("retailOrgId", "transferNo");

-- AddForeignKey
ALTER TABLE "InterStoreTransfer" ADD CONSTRAINT "InterStoreTransfer_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterStoreTransfer" ADD CONSTRAINT "InterStoreTransfer_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterStoreTransfer" ADD CONSTRAINT "InterStoreTransfer_destinationStoreId_fkey" FOREIGN KEY ("destinationStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterStoreTransfer" ADD CONSTRAINT "InterStoreTransfer_sourceInventoryLocationId_fkey" FOREIGN KEY ("sourceInventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterStoreTransfer" ADD CONSTRAINT "InterStoreTransfer_destinationInventoryLocationId_fkey" FOREIGN KEY ("destinationInventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterStoreTransfer" ADD CONSTRAINT "InterStoreTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
