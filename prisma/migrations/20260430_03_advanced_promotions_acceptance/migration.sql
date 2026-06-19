ALTER TABLE "PromotionCampaign"
ADD COLUMN "minimumLineQuantity" DECIMAL(18,3),
ADD COLUMN "buyQuantity" DECIMAL(18,3),
ADD COLUMN "rewardQuantity" DECIMAL(18,3),
ADD COLUMN "eligibleStoreCodes" JSONB,
ADD COLUMN "eligibleCustomerTypes" JSONB,
ADD COLUMN "eligibleLoyaltyTiers" JSONB,
ADD COLUMN "activeDaysOfWeek" JSONB,
ADD COLUMN "activeFromMinutes" INTEGER,
ADD COLUMN "activeToMinutes" INTEGER,
ADD COLUMN "couponRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "couponCode" TEXT;
