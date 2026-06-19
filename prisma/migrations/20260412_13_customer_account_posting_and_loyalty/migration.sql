-- CreateEnum
CREATE TYPE "CustomerAccountEntryType" AS ENUM ('POS_RECEIVABLE_CHARGE', 'POS_RECEIVABLE_SETTLEMENT', 'POS_LOYALTY_ACCRUAL', 'POS_LOYALTY_REVERSAL', 'MANUAL_RECEIVABLE_ADJUSTMENT', 'MANUAL_LOYALTY_ADJUSTMENT');

-- CreateTable
CREATE TABLE "CustomerAccountEntry" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT,
    "terminalId" TEXT,
    "posTransactionId" TEXT,
    "entryType" "CustomerAccountEntryType" NOT NULL,
    "transactionNoSnapshot" TEXT,
    "sourceTransactionNoSnapshot" TEXT,
    "receivableDeltaAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loyaltyPointsDelta" INTEGER NOT NULL DEFAULT 0,
    "resultingReceivableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "resultingLoyaltyPointsBalance" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "originNodeCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAccountEntry_customerId_occurredAt_idx" ON "CustomerAccountEntry"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "CustomerAccountEntry_posTransactionId_idx" ON "CustomerAccountEntry"("posTransactionId");

-- CreateIndex
CREATE INDEX "CustomerAccountEntry_retailOrgId_occurredAt_idx" ON "CustomerAccountEntry"("retailOrgId", "occurredAt");

-- AddForeignKey
ALTER TABLE "CustomerAccountEntry" ADD CONSTRAINT "CustomerAccountEntry_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountEntry" ADD CONSTRAINT "CustomerAccountEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountEntry" ADD CONSTRAINT "CustomerAccountEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountEntry" ADD CONSTRAINT "CustomerAccountEntry_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccountEntry" ADD CONSTRAINT "CustomerAccountEntry_posTransactionId_fkey" FOREIGN KEY ("posTransactionId") REFERENCES "PosTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

