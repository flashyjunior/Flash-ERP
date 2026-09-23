UPDATE "SalesOrder"
SET "balanceAmount" = GREATEST("totalAmount" - "paidAmount", 0)
WHERE "status" = 'OPEN'
  AND "balanceAmount" IS DISTINCT FROM GREATEST("totalAmount" - "paidAmount", 0);
