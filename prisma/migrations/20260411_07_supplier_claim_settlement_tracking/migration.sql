-- AlterTable
ALTER TABLE "SupplierClaim" ADD COLUMN     "creditRequestedAt" TIMESTAMP(3),
ADD COLUMN     "creditRequestedBy" TEXT,
ADD COLUMN     "supplierCaseReference" TEXT;

