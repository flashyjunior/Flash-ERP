IF COL_LENGTH(N'dbo.InterStoreTransfer', N'requestedUnitOfMeasure') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer]
    ADD [requestedUnitOfMeasure] NVARCHAR(1000) NOT NULL
      CONSTRAINT [InterStoreTransfer_requestedUnitOfMeasure_df] DEFAULT N'EA';
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'requestedUnitQuantity') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer]
    ADD [requestedUnitQuantity] DECIMAL(18,3) NOT NULL
      CONSTRAINT [InterStoreTransfer_requestedUnitQuantity_df] DEFAULT 0;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'uomConversionFactor') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer]
    ADD [uomConversionFactor] DECIMAL(18,6) NOT NULL
      CONSTRAINT [InterStoreTransfer_uomConversionFactor_df] DEFAULT 1;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'baseUnitOfMeasure') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer]
    ADD [baseUnitOfMeasure] NVARCHAR(1000) NOT NULL
      CONSTRAINT [InterStoreTransfer_baseUnitOfMeasure_df] DEFAULT N'EA';
END;

UPDATE [dbo].[InterStoreTransfer]
SET [requestedUnitQuantity] = [requestedQuantity]
WHERE [requestedUnitQuantity] <= 0;

UPDATE transferRow
SET [requestedUnitOfMeasure] = product.[unitOfMeasure],
    [baseUnitOfMeasure] = product.[unitOfMeasure]
FROM [dbo].[InterStoreTransfer] AS transferRow
INNER JOIN [dbo].[Product] AS product ON product.[id] = transferRow.[productId]
WHERE transferRow.[requestedUnitOfMeasure] = N'EA'
  AND transferRow.[baseUnitOfMeasure] = N'EA'
  AND product.[unitOfMeasure] <> N'EA';
