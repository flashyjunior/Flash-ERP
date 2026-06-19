-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "customerId" TEXT,
    "orderNo" TEXT NOT NULL,
    "sourceTransactionId" TEXT NOT NULL,
    "sourceTransactionNo" TEXT NOT NULL,
    "customerNoSnapshot" TEXT,
    "customerNameSnapshot" TEXT,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'OPEN',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "operatorName" TEXT,
    "note" TEXT,
    "fulfilledTransactionId" TEXT,
    "fulfilledTransactionNo" TEXT,
    "originNodeCode" TEXT,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EodReconciliation" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "shiftNo" TEXT NOT NULL,
    "cashierCode" TEXT NOT NULL,
    "reconciliationNo" TEXT NOT NULL,
    "expectedCashAmount" DECIMAL(18,2) NOT NULL,
    "declaredCashAmount" DECIMAL(18,2) NOT NULL,
    "varianceAmount" DECIMAL(18,2) NOT NULL,
    "netSalesAmount" DECIMAL(18,2) NOT NULL,
    "cashTenderedAmount" DECIMAL(18,2) NOT NULL,
    "nonCashTenderedAmount" DECIMAL(18,2) NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "operatorName" TEXT,
    "note" TEXT,
    "originNodeCode" TEXT,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "reconciledAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EodReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankingDeposit" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "depositNo" TEXT NOT NULL,
    "reconciliationNo" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "shiftNo" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "bankName" TEXT,
    "reference" TEXT,
    "operatorName" TEXT,
    "note" TEXT,
    "originNodeCode" TEXT,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "depositedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankingDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_retailOrgId_orderNo_key" ON "SalesOrder"("retailOrgId", "orderNo");
CREATE INDEX "SalesOrder_storeId_status_updatedAt_idx" ON "SalesOrder"("storeId", "status", "updatedAt");
CREATE INDEX "SalesOrder_customerId_updatedAt_idx" ON "SalesOrder"("customerId", "updatedAt");

CREATE UNIQUE INDEX "EodReconciliation_retailOrgId_reconciliationNo_key" ON "EodReconciliation"("retailOrgId", "reconciliationNo");
CREATE UNIQUE INDEX "EodReconciliation_retailOrgId_shiftId_key" ON "EodReconciliation"("retailOrgId", "shiftId");
CREATE INDEX "EodReconciliation_storeId_reconciledAt_idx" ON "EodReconciliation"("storeId", "reconciledAt");
CREATE INDEX "EodReconciliation_terminalId_reconciledAt_idx" ON "EodReconciliation"("terminalId", "reconciledAt");

CREATE UNIQUE INDEX "BankingDeposit_retailOrgId_depositNo_key" ON "BankingDeposit"("retailOrgId", "depositNo");
CREATE INDEX "BankingDeposit_reconciliationId_depositedAt_idx" ON "BankingDeposit"("reconciliationId", "depositedAt");
CREATE INDEX "BankingDeposit_storeId_depositedAt_idx" ON "BankingDeposit"("storeId", "depositedAt");

-- AddForeignKey
ALTER TABLE "SalesOrder"
ADD CONSTRAINT "SalesOrder_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesOrder"
ADD CONSTRAINT "SalesOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesOrder"
ADD CONSTRAINT "SalesOrder_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesOrder"
ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EodReconciliation"
ADD CONSTRAINT "EodReconciliation_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EodReconciliation"
ADD CONSTRAINT "EodReconciliation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EodReconciliation"
ADD CONSTRAINT "EodReconciliation_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankingDeposit"
ADD CONSTRAINT "BankingDeposit_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankingDeposit"
ADD CONSTRAINT "BankingDeposit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankingDeposit"
ADD CONSTRAINT "BankingDeposit_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BankingDeposit"
ADD CONSTRAINT "BankingDeposit_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "EodReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateViews
CREATE OR REPLACE VIEW "SalesOrderProjectionView" AS
SELECT
  sales_order."id",
  sales_order."retailOrgId",
  sales_order."storeId",
  store."code" AS "storeCode",
  store."name" AS "storeName",
  sales_order."terminalId",
  terminal."code" AS "terminalCode",
  sales_order."customerId",
  COALESCE(customer."customerNo", sales_order."customerNoSnapshot") AS "customerNo",
  COALESCE(customer."fullName", sales_order."customerNameSnapshot") AS "customerName",
  sales_order."orderNo",
  sales_order."sourceTransactionId",
  sales_order."sourceTransactionNo",
  sales_order."status",
  sales_order."totalAmount",
  sales_order."operatorName",
  sales_order."note",
  sales_order."fulfilledTransactionId",
  sales_order."fulfilledTransactionNo",
  sales_order."originNodeCode",
  sales_order."recordVersion",
  sales_order."createdAt",
  sales_order."fulfilledAt",
  sales_order."cancelledAt",
  sales_order."updatedAt"
FROM "SalesOrder" AS sales_order
INNER JOIN "Store" AS store
  ON store."id" = sales_order."storeId"
INNER JOIN "Terminal" AS terminal
  ON terminal."id" = sales_order."terminalId"
LEFT JOIN "Customer" AS customer
  ON customer."id" = sales_order."customerId";

CREATE OR REPLACE VIEW "EodReconciliationProjectionView" AS
SELECT
  reconciliation."id",
  reconciliation."retailOrgId",
  reconciliation."storeId",
  store."code" AS "storeCode",
  store."name" AS "storeName",
  reconciliation."terminalId",
  terminal."code" AS "terminalCode",
  reconciliation."shiftId",
  reconciliation."shiftNo",
  reconciliation."cashierCode",
  reconciliation."reconciliationNo",
  reconciliation."expectedCashAmount",
  reconciliation."declaredCashAmount",
  reconciliation."varianceAmount",
  reconciliation."netSalesAmount",
  reconciliation."cashTenderedAmount",
  reconciliation."nonCashTenderedAmount",
  reconciliation."transactionCount",
  COALESCE(banking."depositCount", 0) AS "depositCount",
  COALESCE(banking."bankedAmount", 0::DECIMAL(18,2)) AS "bankedAmount",
  reconciliation."declaredCashAmount" - COALESCE(banking."bankedAmount", 0::DECIMAL(18,2)) AS "remainingBankingAmount",
  reconciliation."operatorName",
  reconciliation."note",
  reconciliation."originNodeCode",
  reconciliation."recordVersion",
  reconciliation."reconciledAt",
  reconciliation."updatedAt"
FROM "EodReconciliation" AS reconciliation
INNER JOIN "Store" AS store
  ON store."id" = reconciliation."storeId"
INNER JOIN "Terminal" AS terminal
  ON terminal."id" = reconciliation."terminalId"
LEFT JOIN (
  SELECT
    deposit."reconciliationId",
    COUNT(*)::INTEGER AS "depositCount",
    COALESCE(SUM(deposit."amount"), 0::DECIMAL(18,2)) AS "bankedAmount"
  FROM "BankingDeposit" AS deposit
  GROUP BY deposit."reconciliationId"
) AS banking
  ON banking."reconciliationId" = reconciliation."id";

CREATE OR REPLACE VIEW "BankingDepositProjectionView" AS
SELECT
  deposit."id",
  deposit."retailOrgId",
  deposit."storeId",
  store."code" AS "storeCode",
  store."name" AS "storeName",
  deposit."terminalId",
  terminal."code" AS "terminalCode",
  deposit."reconciliationId",
  deposit."reconciliationNo",
  deposit."shiftId",
  deposit."shiftNo",
  deposit."depositNo",
  deposit."amount",
  deposit."bankName",
  deposit."reference",
  deposit."operatorName",
  deposit."note",
  deposit."originNodeCode",
  deposit."recordVersion",
  deposit."depositedAt",
  deposit."updatedAt",
  reconciliation."expectedCashAmount",
  reconciliation."declaredCashAmount",
  reconciliation."varianceAmount"
FROM "BankingDeposit" AS deposit
INNER JOIN "Store" AS store
  ON store."id" = deposit."storeId"
INNER JOIN "Terminal" AS terminal
  ON terminal."id" = deposit."terminalId"
INNER JOIN "EodReconciliation" AS reconciliation
  ON reconciliation."id" = deposit."reconciliationId";
