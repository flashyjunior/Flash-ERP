/*
  Flash ERP - Stock Update Confirmation Policy
  Date: 2026-07-12
  Target: SQL Server / SmarterASP hosted database

  Purpose:
  - Add company and store stock update policy controls.
  - Add Goods Receipt and Inter-Store Transfer stock confirmation status fields.
  - Backfill existing rows as already posted, preserving historical behavior.

  Safe to run more than once.
*/

SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF COL_LENGTH(N'dbo.RetailOrg', N'stockUpdateMode') IS NULL
  BEGIN
    ALTER TABLE [dbo].[RetailOrg]
      ADD [stockUpdateMode] NVARCHAR(1000) NOT NULL
        CONSTRAINT [RetailOrg_stockUpdateMode_df] DEFAULT N'AUTO'
        WITH VALUES;
  END;

  IF COL_LENGTH(N'dbo.Store', N'stockUpdateMode') IS NULL
  BEGIN
    ALTER TABLE [dbo].[Store]
      ADD [stockUpdateMode] NVARCHAR(1000) NULL;
  END;

  IF COL_LENGTH(N'dbo.GoodsReceipt', N'stockUpdateStatus') IS NULL
  BEGIN
    ALTER TABLE [dbo].[GoodsReceipt]
      ADD [stockUpdateStatus] NVARCHAR(1000) NOT NULL
        CONSTRAINT [GoodsReceipt_stockUpdateStatus_df] DEFAULT N'POSTED'
        WITH VALUES;
  END;

  IF COL_LENGTH(N'dbo.GoodsReceipt', N'stockConfirmedAt') IS NULL
  BEGIN
    ALTER TABLE [dbo].[GoodsReceipt]
      ADD [stockConfirmedAt] DATETIME2 NULL;
  END;

  IF COL_LENGTH(N'dbo.GoodsReceipt', N'stockConfirmedBy') IS NULL
  BEGIN
    ALTER TABLE [dbo].[GoodsReceipt]
      ADD [stockConfirmedBy] NVARCHAR(1000) NULL;
  END;

  IF COL_LENGTH(N'dbo.InterStoreTransfer', N'issueStockUpdateStatus') IS NULL
  BEGIN
    ALTER TABLE [dbo].[InterStoreTransfer]
      ADD [issueStockUpdateStatus] NVARCHAR(1000) NOT NULL
        CONSTRAINT [InterStoreTransfer_issueStockUpdateStatus_df] DEFAULT N'POSTED'
        WITH VALUES;
  END;

  IF COL_LENGTH(N'dbo.InterStoreTransfer', N'issueStockConfirmedAt') IS NULL
  BEGIN
    ALTER TABLE [dbo].[InterStoreTransfer]
      ADD [issueStockConfirmedAt] DATETIME2 NULL;
  END;

  IF COL_LENGTH(N'dbo.InterStoreTransfer', N'issueStockConfirmedBy') IS NULL
  BEGIN
    ALTER TABLE [dbo].[InterStoreTransfer]
      ADD [issueStockConfirmedBy] NVARCHAR(1000) NULL;
  END;

  IF COL_LENGTH(N'dbo.InterStoreTransfer', N'receiptStockUpdateStatus') IS NULL
  BEGIN
    ALTER TABLE [dbo].[InterStoreTransfer]
      ADD [receiptStockUpdateStatus] NVARCHAR(1000) NOT NULL
        CONSTRAINT [InterStoreTransfer_receiptStockUpdateStatus_df] DEFAULT N'POSTED'
        WITH VALUES;
  END;

  IF COL_LENGTH(N'dbo.InterStoreTransfer', N'receiptStockConfirmedAt') IS NULL
  BEGIN
    ALTER TABLE [dbo].[InterStoreTransfer]
      ADD [receiptStockConfirmedAt] DATETIME2 NULL;
  END;

  IF COL_LENGTH(N'dbo.InterStoreTransfer', N'receiptStockConfirmedBy') IS NULL
  BEGIN
    ALTER TABLE [dbo].[InterStoreTransfer]
      ADD [receiptStockConfirmedBy] NVARCHAR(1000) NULL;
  END;

  /*
    Keep these backfills dynamic so SQL Server compiles them after any ALTER TABLE
    statements above have completed in the same run.
  */
  EXEC(N'
    UPDATE [dbo].[RetailOrg]
      SET [stockUpdateMode] = N''AUTO''
      WHERE [stockUpdateMode] IS NULL OR LTRIM(RTRIM([stockUpdateMode])) = N'''';
  ');

  EXEC(N'
    UPDATE [dbo].[GoodsReceipt]
      SET
        [stockUpdateStatus] = COALESCE(NULLIF(LTRIM(RTRIM([stockUpdateStatus])), N''''), N''POSTED''),
        [stockConfirmedAt] = COALESCE([stockConfirmedAt], [postedAt]),
        [stockConfirmedBy] = COALESCE([stockConfirmedBy], [operatorName], [sourceNodeCode], N''Legacy posted stock'')
      WHERE COALESCE(NULLIF(LTRIM(RTRIM([stockUpdateStatus])), N''''), N''POSTED'') = N''POSTED'';
  ');

  EXEC(N'
    UPDATE [dbo].[InterStoreTransfer]
      SET
        [issueStockUpdateStatus] = COALESCE(NULLIF(LTRIM(RTRIM([issueStockUpdateStatus])), N''''), N''POSTED''),
        [issueStockConfirmedAt] = CASE
          WHEN [issueStockConfirmedAt] IS NULL AND [issuedAt] IS NOT NULL AND TRY_CONVERT(decimal(18, 3), [issuedQuantity]) > 0
            THEN [issuedAt]
          ELSE [issueStockConfirmedAt]
        END,
        [issueStockConfirmedBy] = CASE
          WHEN [issueStockConfirmedBy] IS NULL AND [issuedAt] IS NOT NULL AND TRY_CONVERT(decimal(18, 3), [issuedQuantity]) > 0
            THEN COALESCE([issueOperatorName], [sourceNodeCode], N''Legacy posted stock'')
          ELSE [issueStockConfirmedBy]
        END,
        [receiptStockUpdateStatus] = COALESCE(NULLIF(LTRIM(RTRIM([receiptStockUpdateStatus])), N''''), N''POSTED''),
        [receiptStockConfirmedAt] = CASE
          WHEN [receiptStockConfirmedAt] IS NULL AND [receivedAt] IS NOT NULL AND TRY_CONVERT(decimal(18, 3), [receivedQuantity]) > 0
            THEN [receivedAt]
          ELSE [receiptStockConfirmedAt]
        END,
        [receiptStockConfirmedBy] = CASE
          WHEN [receiptStockConfirmedBy] IS NULL AND [receivedAt] IS NOT NULL AND TRY_CONVERT(decimal(18, 3), [receivedQuantity]) > 0
            THEN COALESCE([receiptOperatorName], [destinationNodeCode], N''Legacy posted stock'')
          ELSE [receiptStockConfirmedBy]
        END;
  ');

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
  BEGIN
    ROLLBACK TRANSACTION;
  END;

  THROW;
END CATCH;
