IF COL_LENGTH(N'[dbo].[SalesOrder]', N'depositAmount') IS NULL
BEGIN
  ALTER TABLE [dbo].[SalesOrder]
  ADD [depositAmount] DECIMAL(18,2) NOT NULL
    CONSTRAINT [SalesOrder_depositAmount_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[SalesOrder]', N'balanceAmount') IS NULL
BEGIN
  ALTER TABLE [dbo].[SalesOrder]
  ADD [balanceAmount] DECIMAL(18,2) NOT NULL
    CONSTRAINT [SalesOrder_balanceAmount_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[SalesOrder]', N'depositTenderMethodCodeSnapshot') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [depositTenderMethodCodeSnapshot] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[SalesOrder]', N'depositTenderMethodNameSnapshot') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [depositTenderMethodNameSnapshot] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[SalesOrder]', N'depositPaymentMethodSnapshot') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [depositPaymentMethodSnapshot] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[SalesOrder]', N'depositReference') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [depositReference] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[SalesOrder]', N'depositPaidAt') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [depositPaidAt] DATETIME2 NULL;

EXEC sys.sp_executesql N'
  UPDATE [dbo].[SalesOrder]
  SET [balanceAmount] = [totalAmount]
  WHERE [balanceAmount] = 0
    AND [status] = N''OPEN'';';
