DECLARE @fuelSalePaymentCashbookFk NVARCHAR(255);

SELECT @fuelSalePaymentCashbookFk = fk.name
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns c
  ON c.object_id = fkc.parent_object_id
 AND c.column_id = fkc.parent_column_id
WHERE fk.parent_object_id = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]')
  AND c.name = N'cashbookAccountId';

IF @fuelSalePaymentCashbookFk IS NOT NULL
BEGIN
  EXEC(N'ALTER TABLE [dbo].[ErpFuelSalePayment] DROP CONSTRAINT [' + @fuelSalePaymentCashbookFk + N']');
END;

ALTER TABLE [dbo].[ErpFuelSalePayment]
ALTER COLUMN [cashbookAccountId] NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelSalePayment_cashbookAccountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSalePayment_cashbookAccountId_idx] ON [dbo].[ErpFuelSalePayment]([cashbookAccountId]);
END;
