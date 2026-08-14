SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.EcommerceOrder', N'checkoutRequestKey') IS NULL
  EXEC(N'ALTER TABLE [dbo].[EcommerceOrder] ADD [checkoutRequestKey] NVARCHAR(160) NULL;');
IF COL_LENGTH(N'dbo.EcommerceOrder', N'checkoutRequestHash') IS NULL
  EXEC(N'ALTER TABLE [dbo].[EcommerceOrder] ADD [checkoutRequestHash] NVARCHAR(64) NULL;');

EXEC(N'UPDATE [dbo].[EcommerceOrder]
  SET
    [checkoutRequestKey] = CONCAT(N''legacy-order:'', [id]),
    [checkoutRequestHash] = CONVERT(NVARCHAR(64), HASHBYTES(''SHA2_256'', CONVERT(NVARCHAR(4000), [id])), 2)
  WHERE [checkoutRequestKey] IS NULL OR [checkoutRequestHash] IS NULL;');

EXEC(N'ALTER TABLE [dbo].[EcommerceOrder] ALTER COLUMN [checkoutRequestKey] NVARCHAR(160) NOT NULL;');
EXEC(N'ALTER TABLE [dbo].[EcommerceOrder] ALTER COLUMN [checkoutRequestHash] NVARCHAR(64) NOT NULL;');

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'EcommerceOrder_checkoutRequestKey_key'
    AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrder]')
)
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [EcommerceOrder_checkoutRequestKey_key]
    ON [dbo].[EcommerceOrder] ([checkoutRequestKey]);');

IF COL_LENGTH(N'dbo.EcommercePayment', N'initializationRequestKey') IS NULL
  EXEC(N'ALTER TABLE [dbo].[EcommercePayment] ADD [initializationRequestKey] NVARCHAR(160) NULL;');
IF COL_LENGTH(N'dbo.EcommercePayment', N'initializationRequestHash') IS NULL
  EXEC(N'ALTER TABLE [dbo].[EcommercePayment] ADD [initializationRequestHash] NVARCHAR(64) NULL;');

EXEC(N'UPDATE [dbo].[EcommercePayment]
  SET
    [initializationRequestKey] = CONCAT(N''legacy-payment:'', [id]),
    [initializationRequestHash] = CONVERT(NVARCHAR(64), HASHBYTES(''SHA2_256'', CONVERT(NVARCHAR(4000), [id])), 2)
  WHERE [initializationRequestKey] IS NULL OR [initializationRequestHash] IS NULL;');

EXEC(N'ALTER TABLE [dbo].[EcommercePayment] ALTER COLUMN [initializationRequestKey] NVARCHAR(160) NOT NULL;');
EXEC(N'ALTER TABLE [dbo].[EcommercePayment] ALTER COLUMN [initializationRequestHash] NVARCHAR(64) NOT NULL;');

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'EcommercePayment_initializationRequestKey_key'
    AND [object_id] = OBJECT_ID(N'[dbo].[EcommercePayment]')
)
  EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [EcommercePayment_initializationRequestKey_key]
    ON [dbo].[EcommercePayment] ([initializationRequestKey]);');
