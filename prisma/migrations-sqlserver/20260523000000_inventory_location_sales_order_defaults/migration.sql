IF COL_LENGTH(N'[dbo].[InventoryLocation]', N'useForSalesOrderDefault') IS NULL
BEGIN
  ALTER TABLE [dbo].[InventoryLocation]
  ADD [useForSalesOrderDefault] BIT NOT NULL
    CONSTRAINT [InventoryLocation_useForSalesOrderDefault_df] DEFAULT 0;
END;

EXEC(N'
UPDATE [dbo].[InventoryLocation]
SET [useForSalesOrderDefault] = [useForSalesDefault]
WHERE [useForSalesOrderDefault] = 0
  AND [useForSalesDefault] = 1;
');

IF COL_LENGTH(N'[dbo].[PosTransactionLine]', N'inventoryLocationId') IS NULL
BEGIN
  ALTER TABLE [dbo].[PosTransactionLine]
  ADD [inventoryLocationId] NVARCHAR(1000) NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [name] = N'PosTransactionLine_inventoryLocationId_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[PosTransactionLine]')
)
BEGIN
  EXEC(N'
  CREATE NONCLUSTERED INDEX [PosTransactionLine_inventoryLocationId_idx]
  ON [dbo].[PosTransactionLine]([inventoryLocationId]);
  ');
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE [name] = N'PosTransactionLine_inventoryLocationId_fkey'
)
BEGIN
  EXEC(N'
  ALTER TABLE [dbo].[PosTransactionLine]
  ADD CONSTRAINT [PosTransactionLine_inventoryLocationId_fkey]
  FOREIGN KEY ([inventoryLocationId]) REFERENCES [dbo].[InventoryLocation]([id])
  ON DELETE SET NULL ON UPDATE CASCADE;
  ');
END;
