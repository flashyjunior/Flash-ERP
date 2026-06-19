ALTER TABLE "PosTransactionLine"
ADD COLUMN "appliedPromotionCodeSnapshot" TEXT,
ADD COLUMN "appliedPromotionNameSnapshot" TEXT;

CREATE INDEX "PosTransactionLine_appliedPromotionCodeSnapshot_idx"
ON "PosTransactionLine"("appliedPromotionCodeSnapshot");
