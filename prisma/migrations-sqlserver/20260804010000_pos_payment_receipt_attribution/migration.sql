IF COL_LENGTH(N'[dbo].[PosPayment]', N'paymentPurpose') IS NULL
BEGIN
  ALTER TABLE [dbo].[PosPayment]
  ADD [paymentPurpose] NVARCHAR(1000) NOT NULL
    CONSTRAINT [PosPayment_paymentPurpose_df] DEFAULT N'TRANSACTION_SETTLEMENT';
END;

IF COL_LENGTH(N'[dbo].[PosPayment]', N'receivedShiftId') IS NULL
  ALTER TABLE [dbo].[PosPayment] ADD [receivedShiftId] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[PosPayment]', N'receivedShiftNoSnapshot') IS NULL
  ALTER TABLE [dbo].[PosPayment] ADD [receivedShiftNoSnapshot] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[PosPayment]', N'receivedTerminalCodeSnapshot') IS NULL
  ALTER TABLE [dbo].[PosPayment] ADD [receivedTerminalCodeSnapshot] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[PosPayment]', N'receivedCashierCodeSnapshot') IS NULL
  ALTER TABLE [dbo].[PosPayment] ADD [receivedCashierCodeSnapshot] NVARCHAR(1000) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'PosPayment_receivedShiftId_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[PosPayment]')
)
  EXEC sys.sp_executesql N'
    CREATE NONCLUSTERED INDEX [PosPayment_receivedShiftId_idx]
      ON [dbo].[PosPayment]([receivedShiftId]);';

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'PosPayment_receivedAt_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[PosPayment]')
)
  CREATE NONCLUSTERED INDEX [PosPayment_receivedAt_idx]
    ON [dbo].[PosPayment]([receivedAt]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'PosPayment_paymentPurpose_receivedAt_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[PosPayment]')
)
  EXEC sys.sp_executesql N'
    CREATE NONCLUSTERED INDEX [PosPayment_paymentPurpose_receivedAt_idx]
      ON [dbo].[PosPayment]([paymentPurpose], [receivedAt]);';

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_key_columns AS foreign_key_column
  WHERE foreign_key_column.[parent_object_id] = OBJECT_ID(N'[dbo].[PosPayment]')
    AND foreign_key_column.[parent_column_id] = COLUMNPROPERTY(
      OBJECT_ID(N'[dbo].[PosPayment]'), N'receivedShiftId', 'ColumnId'
    )
    AND foreign_key_column.[referenced_object_id] = OBJECT_ID(N'[dbo].[PosShift]')
)
  EXEC sys.sp_executesql N'
    ALTER TABLE [dbo].[PosPayment]
    ADD CONSTRAINT [PosPayment_receivedShiftId_fkey]
      FOREIGN KEY ([receivedShiftId]) REFERENCES [dbo].[PosShift]([id])
      ON DELETE SET NULL;';

EXEC sys.sp_executesql N'
  UPDATE payment
  SET
    [receivedShiftId] = receipt_shift.[id],
    [receivedShiftNoSnapshot] = receipt_shift.[shiftNo],
    [receivedTerminalCodeSnapshot] = receipt_shift.[terminalCode],
    [receivedCashierCodeSnapshot] = receipt_shift.[cashierCode]
  FROM [dbo].[PosPayment] AS payment
  INNER JOIN [dbo].[PosTransaction] AS transaction_row
    ON transaction_row.[id] = payment.[posTransactionId]
  OUTER APPLY (
    SELECT TOP (1)
      shift.[id], shift.[shiftNo], terminal.[code] AS [terminalCode],
      cashier.[loginId] AS [cashierCode]
    FROM [dbo].[PosShift] AS shift
    INNER JOIN [dbo].[Terminal] AS terminal ON terminal.[id] = shift.[terminalId]
    INNER JOIN [dbo].[RetailUser] AS cashier ON cashier.[id] = shift.[cashierUserId]
    WHERE shift.[storeId] = transaction_row.[storeId]
      AND shift.[terminalId] = transaction_row.[terminalId]
      AND shift.[openedAt] <= payment.[receivedAt]
      AND (shift.[closedAt] IS NULL OR shift.[closedAt] >= payment.[receivedAt])
    ORDER BY shift.[openedAt] DESC
  ) AS receipt_shift
  WHERE payment.[receivedShiftId] IS NULL
    AND receipt_shift.[id] IS NOT NULL;';

EXEC sys.sp_executesql N'
  UPDATE payment
  SET
    [receivedShiftId] = transaction_row.[posShiftId],
    [receivedShiftNoSnapshot] = shift.[shiftNo],
    [receivedTerminalCodeSnapshot] = terminal.[code],
    [receivedCashierCodeSnapshot] = transaction_row.[cashierCodeSnapshot]
  FROM [dbo].[PosPayment] AS payment
  INNER JOIN [dbo].[PosTransaction] AS transaction_row
    ON transaction_row.[id] = payment.[posTransactionId]
  LEFT JOIN [dbo].[PosShift] AS shift ON shift.[id] = transaction_row.[posShiftId]
  LEFT JOIN [dbo].[Terminal] AS terminal ON terminal.[id] = transaction_row.[terminalId]
  WHERE payment.[receivedShiftId] IS NULL
    AND transaction_row.[posShiftId] IS NOT NULL;';

EXEC sys.sp_executesql N'
  UPDATE payment
  SET [paymentPurpose] = N''SALES_ORDER_DEPOSIT''
  FROM [dbo].[PosPayment] AS payment
  INNER JOIN [dbo].[SalesOrder] AS sales_order
    ON sales_order.[sourceTransactionId] = payment.[posTransactionId]
  WHERE sales_order.[depositPaidAt] IS NOT NULL
    AND payment.[receivedAt] <= sales_order.[depositPaidAt];';

EXEC sys.sp_executesql N'
  UPDATE payment
  SET [paymentPurpose] = N''SALES_ORDER_BALANCE''
  FROM [dbo].[PosPayment] AS payment
  INNER JOIN [dbo].[SalesOrder] AS sales_order
    ON sales_order.[sourceTransactionId] = payment.[posTransactionId]
  WHERE payment.[paymentPurpose] = N''TRANSACTION_SETTLEMENT''
    AND (
      sales_order.[depositPaidAt] IS NULL
      OR payment.[receivedAt] > sales_order.[depositPaidAt]
    );';
