ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "trackSize" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "trackColor" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PosTransactionLine"
ADD COLUMN IF NOT EXISTS "variantSizeSnapshot" TEXT;

ALTER TABLE "PosTransactionLine"
ADD COLUMN IF NOT EXISTS "variantColorSnapshot" TEXT;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "depositAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "balanceAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "depositTenderMethodCodeSnapshot" TEXT;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "depositTenderMethodNameSnapshot" TEXT;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "depositPaymentMethodSnapshot" TEXT;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "depositReference" TEXT;

ALTER TABLE "SalesOrder"
ADD COLUMN IF NOT EXISTS "depositPaidAt" TIMESTAMP(3);

UPDATE "SalesOrder"
SET "balanceAmount" = "totalAmount"
WHERE "balanceAmount" = 0
  AND "status" = 'OPEN';
