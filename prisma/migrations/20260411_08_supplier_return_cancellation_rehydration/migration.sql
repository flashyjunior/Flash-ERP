-- AlterTable
ALTER TABLE "SupplierReturn"
ADD COLUMN "cancellationNote" TEXT,
ADD COLUMN "cancellationOperatorName" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3);
