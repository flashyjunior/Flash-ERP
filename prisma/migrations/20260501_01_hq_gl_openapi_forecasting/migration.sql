CREATE TYPE "GlAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COST_OF_SALES', 'EXPENSE');

CREATE TYPE "GlNormalBalance" AS ENUM ('DEBIT', 'CREDIT');

CREATE TYPE "GlJournalStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

CREATE TABLE "GlAccount" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountType" "GlAccountType" NOT NULL,
  "normalBalance" "GlNormalBalance" NOT NULL,
  "externalCode" TEXT,
  "description" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlJournalEntry" (
  "id" TEXT NOT NULL,
  "retailOrgId" TEXT NOT NULL,
  "journalNo" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceReference" TEXT,
  "postingDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "status" "GlJournalStatus" NOT NULL DEFAULT 'POSTED',
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlJournalLine" (
  "id" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "storeId" TEXT,
  "debitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GlJournalLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlAccount_retailOrgId_code_key" ON "GlAccount"("retailOrgId", "code");
CREATE INDEX "GlAccount_retailOrgId_accountType_status_idx" ON "GlAccount"("retailOrgId", "accountType", "status");

CREATE UNIQUE INDEX "GlJournalEntry_retailOrgId_journalNo_key" ON "GlJournalEntry"("retailOrgId", "journalNo");
CREATE UNIQUE INDEX "GlJournalEntry_retailOrgId_sourceType_sourceId_key" ON "GlJournalEntry"("retailOrgId", "sourceType", "sourceId");
CREATE INDEX "GlJournalEntry_retailOrgId_postingDate_status_idx" ON "GlJournalEntry"("retailOrgId", "postingDate", "status");

CREATE INDEX "GlJournalLine_accountId_idx" ON "GlJournalLine"("accountId");
CREATE INDEX "GlJournalLine_storeId_idx" ON "GlJournalLine"("storeId");

ALTER TABLE "GlAccount"
  ADD CONSTRAINT "GlAccount_retailOrgId_fkey"
  FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlJournalEntry"
  ADD CONSTRAINT "GlJournalEntry_retailOrgId_fkey"
  FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlJournalLine"
  ADD CONSTRAINT "GlJournalLine_journalEntryId_fkey"
  FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlJournalLine"
  ADD CONSTRAINT "GlJournalLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "GlAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GlJournalLine"
  ADD CONSTRAINT "GlJournalLine_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
