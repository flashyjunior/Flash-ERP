IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'bookCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [bookCode] NVARCHAR(100) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_bookCode_df] DEFAULT N'COMPANY';
END;

IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'gainLossAmount') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [gainLossAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_gainLossAmount_df] DEFAULT 0;
END;

IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'proceedsAccountCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [proceedsAccountCode] NVARCHAR(100) NULL;
END;

IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'fromLocationCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [fromLocationCode] NVARCHAR(100) NULL;
END;

IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'toLocationCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [toLocationCode] NVARCHAR(100) NULL;
END;

IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'fromCustodianName') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [fromCustodianName] NVARCHAR(100) NULL;
END;

IF COL_LENGTH('dbo.ErpFixedAssetTransaction', 'toCustodianName') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFixedAssetTransaction]
    ADD [toCustodianName] NVARCHAR(100) NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'ErpFixedAssetTransaction_companyId_bookCode_transactionType_idx'
      AND object_id = OBJECT_ID('dbo.ErpFixedAssetTransaction')
)
BEGIN
    CREATE INDEX [ErpFixedAssetTransaction_companyId_bookCode_transactionType_idx]
    ON [dbo].[ErpFixedAssetTransaction]([companyId], [bookCode], [transactionType]);
END;
