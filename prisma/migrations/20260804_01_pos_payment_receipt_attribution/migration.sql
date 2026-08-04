ALTER TABLE "PosPayment"
ADD COLUMN IF NOT EXISTS "paymentPurpose" TEXT NOT NULL DEFAULT 'TRANSACTION_SETTLEMENT';

ALTER TABLE "PosPayment"
ADD COLUMN IF NOT EXISTS "receivedShiftId" TEXT;

ALTER TABLE "PosPayment"
ADD COLUMN IF NOT EXISTS "receivedShiftNoSnapshot" TEXT;

ALTER TABLE "PosPayment"
ADD COLUMN IF NOT EXISTS "receivedTerminalCodeSnapshot" TEXT;

ALTER TABLE "PosPayment"
ADD COLUMN IF NOT EXISTS "receivedCashierCodeSnapshot" TEXT;

CREATE INDEX IF NOT EXISTS "PosPayment_receivedShiftId_idx"
ON "PosPayment"("receivedShiftId");

CREATE INDEX IF NOT EXISTS "PosPayment_receivedAt_idx"
ON "PosPayment"("receivedAt");

CREATE INDEX IF NOT EXISTS "PosPayment_paymentPurpose_receivedAt_idx"
ON "PosPayment"("paymentPurpose", "receivedAt");

ALTER TABLE "PosPayment"
ADD CONSTRAINT "PosPayment_receivedShiftId_fkey"
FOREIGN KEY ("receivedShiftId") REFERENCES "PosShift"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

WITH receipt_context AS (
  SELECT
    payment."id" AS "paymentId",
    receipt_shift."id" AS "shiftId",
    receipt_shift."shiftNo" AS "shiftNo",
    terminal."code" AS "terminalCode",
    cashier."loginId" AS "cashierCode"
  FROM "PosPayment" AS payment
  INNER JOIN "PosTransaction" AS transaction_row
    ON transaction_row."id" = payment."posTransactionId"
  JOIN LATERAL (
    SELECT shift.*
    FROM "PosShift" AS shift
    WHERE shift."storeId" = transaction_row."storeId"
      AND shift."terminalId" = transaction_row."terminalId"
      AND shift."openedAt" <= payment."receivedAt"
      AND (shift."closedAt" IS NULL OR shift."closedAt" >= payment."receivedAt")
    ORDER BY shift."openedAt" DESC
    LIMIT 1
  ) AS receipt_shift ON TRUE
  INNER JOIN "Terminal" AS terminal ON terminal."id" = receipt_shift."terminalId"
  INNER JOIN "RetailUser" AS cashier ON cashier."id" = receipt_shift."cashierUserId"
  WHERE payment."receivedShiftId" IS NULL
)
UPDATE "PosPayment" AS payment
SET
  "receivedShiftId" = receipt_context."shiftId",
  "receivedShiftNoSnapshot" = receipt_context."shiftNo",
  "receivedTerminalCodeSnapshot" = receipt_context."terminalCode",
  "receivedCashierCodeSnapshot" = receipt_context."cashierCode"
FROM receipt_context
WHERE payment."id" = receipt_context."paymentId";

UPDATE "PosPayment" AS payment
SET
  "receivedShiftId" = transaction_row."posShiftId",
  "receivedShiftNoSnapshot" = shift."shiftNo",
  "receivedTerminalCodeSnapshot" = terminal."code",
  "receivedCashierCodeSnapshot" = transaction_row."cashierCodeSnapshot"
FROM "PosTransaction" AS transaction_row
LEFT JOIN "PosShift" AS shift ON shift."id" = transaction_row."posShiftId"
LEFT JOIN "Terminal" AS terminal ON terminal."id" = transaction_row."terminalId"
WHERE payment."posTransactionId" = transaction_row."id"
  AND payment."receivedShiftId" IS NULL
  AND transaction_row."posShiftId" IS NOT NULL;

UPDATE "PosPayment" AS payment
SET "paymentPurpose" = 'SALES_ORDER_DEPOSIT'
FROM "SalesOrder" AS sales_order
WHERE payment."posTransactionId" = sales_order."sourceTransactionId"
  AND sales_order."depositPaidAt" IS NOT NULL
  AND payment."receivedAt" <= sales_order."depositPaidAt";

UPDATE "PosPayment" AS payment
SET "paymentPurpose" = 'SALES_ORDER_BALANCE'
FROM "SalesOrder" AS sales_order
WHERE payment."posTransactionId" = sales_order."sourceTransactionId"
  AND payment."paymentPurpose" = 'TRANSACTION_SETTLEMENT'
  AND (
    sales_order."depositPaidAt" IS NULL
    OR payment."receivedAt" > sales_order."depositPaidAt"
  );
