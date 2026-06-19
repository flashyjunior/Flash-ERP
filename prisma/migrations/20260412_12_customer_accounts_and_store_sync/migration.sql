-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'WHOLESALE', 'STAFF', 'OTHER');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "allowCreditSales" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "creditLimitAmount" DECIMAL(12,2),
ADD COLUMN     "customerType" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "loyaltyEnrolled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyPointsBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyTier" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "receivableBalanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

