-- CreateEnum
CREATE TYPE "PromotionDiscountType" AS ENUM ('PERCENT', 'AMOUNT', 'FIXED_PRICE');

-- CreateEnum
CREATE TYPE "PromotionTargetScope" AS ENUM ('ALL_ITEMS', 'DEPARTMENT', 'CATEGORY', 'PRODUCT');

-- CreateTable
CREATE TABLE "PromotionCampaign" (
    "id" TEXT NOT NULL,
    "retailOrgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "PromotionDiscountType" NOT NULL,
    "targetScope" "PromotionTargetScope" NOT NULL DEFAULT 'ALL_ITEMS',
    "discountValue" DECIMAL(18,2) NOT NULL,
    "minimumBasketAmount" DECIMAL(18,2),
    "targetDepartmentCode" TEXT,
    "targetCategoryCode" TEXT,
    "targetProductCode" TEXT,
    "allowWithLoyalty" BOOLEAN NOT NULL DEFAULT true,
    "applyOncePerBasket" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "originNodeCode" TEXT,
    "lastModifiedByNodeCode" TEXT,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PromotionCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionCampaign_retailOrgId_status_updatedAt_idx" ON "PromotionCampaign"("retailOrgId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCampaign_retailOrgId_code_key" ON "PromotionCampaign"("retailOrgId", "code");

-- AddForeignKey
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_retailOrgId_fkey" FOREIGN KEY ("retailOrgId") REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
