CREATE TYPE "PaymentGatewayProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'OTHER');

CREATE TYPE "PaymentGatewayMode" AS ENUM ('TEST', 'LIVE');

CREATE TYPE "PaymentGatewayStatus" AS ENUM ('DISABLED', 'READY', 'NEEDS_REVIEW');

CREATE TYPE "OperatingExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'POSTED', 'VOIDED');

ALTER TABLE "TenderMethod"
  ADD COLUMN "gatewayProvider" "PaymentGatewayProvider",
  ADD COLUMN "gatewayMode" "PaymentGatewayMode",
  ADD COLUMN "gatewayMerchantId" TEXT,
  ADD COLUMN "gatewayPublicKey" TEXT,
  ADD COLUMN "gatewaySecretMask" TEXT,
  ADD COLUMN "gatewayWebhookSecretMask" TEXT,
  ADD COLUMN "gatewayCallbackUrl" TEXT,
  ADD COLUMN "gatewayActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gatewayStatus" "PaymentGatewayStatus" NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "gatewayConfigJson" JSONB;

CREATE INDEX "TenderMethod_retailOrgId_gatewayProvider_gatewayStatus_idx"
  ON "TenderMethod"("retailOrgId", "gatewayProvider", "gatewayStatus");

CREATE TABLE "OperatingExpense" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "storeId" TEXT,
  "expenseNo" TEXT NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "supplierName" TEXT,
  "paymentMethod" "PaymentMethod",
  "externalReference" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" "OperatingExpenseStatus" NOT NULL DEFAULT 'APPROVED',
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperatingExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatingExpense_retailOrgId_expenseNo_key"
  ON "OperatingExpense"("retailOrgId", "expenseNo");

CREATE INDEX "OperatingExpense_retailOrgId_expenseDate_status_idx"
  ON "OperatingExpense"("retailOrgId", "expenseDate", "status");

CREATE INDEX "OperatingExpense_storeId_idx" ON "OperatingExpense"("storeId");

ALTER TABLE "OperatingExpense"
  ADD CONSTRAINT "OperatingExpense_retailOrgId_fkey"
  FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperatingExpense"
  ADD CONSTRAINT "OperatingExpense_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
