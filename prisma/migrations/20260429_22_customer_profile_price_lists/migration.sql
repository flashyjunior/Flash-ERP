ALTER TABLE "PriceList"
ADD COLUMN "customerType" "CustomerType",
ADD COLUMN "loyaltyTier" TEXT;

CREATE INDEX "PriceList_retailOrgId_customerType_loyaltyTier_status_idx"
ON "PriceList"("retailOrgId", "customerType", "loyaltyTier", "status");
