ALTER TYPE "InterStoreTransferStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

ALTER TABLE "InterStoreTransfer"
  ADD COLUMN IF NOT EXISTS "transferBatchNo" TEXT,
  ADD COLUMN IF NOT EXISTS "lineNo" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "requiredAt" TIMESTAMP(3);

UPDATE "InterStoreTransfer"
SET "transferBatchNo" = "transferNo"
WHERE "transferBatchNo" IS NULL;

CREATE INDEX IF NOT EXISTS "InterStoreTransfer_retailOrgId_transferBatchNo_idx"
  ON "InterStoreTransfer"("retailOrgId", "transferBatchNo");
