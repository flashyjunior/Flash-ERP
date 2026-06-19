-- AlterTable
ALTER TABLE "SupplierReturn"
ADD COLUMN "cancellationAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "cancellationAcknowledgedByNodeCode" TEXT,
ADD COLUMN "cancellationAcknowledgedBy" TEXT,
ADD COLUMN "cancellationAcknowledgementNote" TEXT;
