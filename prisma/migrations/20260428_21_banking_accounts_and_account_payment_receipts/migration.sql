-- Enterprise-controlled bank, branch, account-number setup plus account-payment receipt routing.

CREATE TABLE IF NOT EXISTS "Bank" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Bank_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Bank_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BankBranch" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "bankId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "addressLine1" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BankBranch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankBranch_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankBranch_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "originNodeCode" TEXT,
  "lastModifiedByNodeCode" TEXT,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankAccount_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BankAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "BankBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Bank_retailOrgId_code_key" ON "Bank"("retailOrgId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "BankBranch_retailOrgId_code_key" ON "BankBranch"("retailOrgId", "code");
CREATE INDEX IF NOT EXISTS "BankBranch_bankId_status_idx" ON "BankBranch"("bankId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_branchId_key" ON "BankAccount"("branchId");
CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_retailOrgId_accountNumber_key" ON "BankAccount"("retailOrgId", "accountNumber");
CREATE INDEX IF NOT EXISTS "BankAccount_retailOrgId_status_idx" ON "BankAccount"("retailOrgId", "status");

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "accountPaymentReceiptTemplateId" TEXT,
  ADD COLUMN IF NOT EXISTS "accountPaymentReceiptTemplateHtml" TEXT;

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_accountPaymentReceiptTemplateId_fkey"
  FOREIGN KEY ("accountPaymentReceiptTemplateId") REFERENCES "ReceiptTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PosPayment"
  ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "bankCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumberSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNameSnapshot" TEXT;

ALTER TABLE "PosPayment"
  ADD CONSTRAINT "PosPayment_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BankingDeposit"
  ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "bankCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumberSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNameSnapshot" TEXT;

ALTER TABLE "BankingDeposit"
  ADD CONSTRAINT "BankingDeposit_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerAccountEntry"
  ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "bankCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchCodeSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankBranchNameSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNumberSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccountNameSnapshot" TEXT;

CREATE INDEX IF NOT EXISTS "CustomerAccountEntry_bankAccountId_idx" ON "CustomerAccountEntry"("bankAccountId");

ALTER TABLE "CustomerAccountEntry"
  ADD CONSTRAINT "CustomerAccountEntry_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
