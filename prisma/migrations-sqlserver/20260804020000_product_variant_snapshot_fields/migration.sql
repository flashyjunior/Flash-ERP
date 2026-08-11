IF COL_LENGTH(N'[dbo].[Product]', N'trackSize') IS NULL
BEGIN
  ALTER TABLE [dbo].[Product]
  ADD [trackSize] BIT NOT NULL
    CONSTRAINT [Product_trackSize_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[Product]', N'trackColor') IS NULL
BEGIN
  ALTER TABLE [dbo].[Product]
  ADD [trackColor] BIT NOT NULL
    CONSTRAINT [Product_trackColor_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[PosTransactionLine]', N'variantSizeSnapshot') IS NULL
  ALTER TABLE [dbo].[PosTransactionLine] ADD [variantSizeSnapshot] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[PosTransactionLine]', N'variantColorSnapshot') IS NULL
  ALTER TABLE [dbo].[PosTransactionLine] ADD [variantColorSnapshot] NVARCHAR(1000) NULL;
