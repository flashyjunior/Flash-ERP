ALTER TABLE "RetailOrg"
ADD COLUMN "loyaltyProgramEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "loyaltyPointsPerCurrencyUnit" DECIMAL(12,4) NOT NULL DEFAULT 1,
ADD COLUMN "loyaltyRedemptionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "loyaltyRedemptionPointsStep" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "loyaltyRedemptionValueAmount" DECIMAL(12,2) NOT NULL DEFAULT 1,
ADD COLUMN "loyaltyMinimumRedeemPoints" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "loyaltyMaximumRedeemPercentOfSale" DECIMAL(5,2) NOT NULL DEFAULT 100;
