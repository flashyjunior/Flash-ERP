IF OBJECT_ID(N'[dbo].[StoreProductSellingUnit]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[StoreProductSellingUnit] (
    [id] NVARCHAR(1000) NOT NULL,
    [configurationKey] NVARCHAR(450) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [productVariantId] NVARCHAR(1000) NULL,
    [unitOfMeasureId] NVARCHAR(1000) NOT NULL,
    [unitOfMeasureCodeSnapshot] NVARCHAR(1000) NOT NULL,
    [unitOfMeasureNameSnapshot] NVARCHAR(1000) NOT NULL,
    [conversionFactor] DECIMAL(18, 6) NOT NULL,
    [unitPrice] DECIMAL(18, 2) NOT NULL,
    [barcode] NVARCHAR(450) NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [StoreProductSellingUnit_isDefault_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [StoreProductSellingUnit_status_df] DEFAULT N'ACTIVE',
    [recordVersion] INT NOT NULL CONSTRAINT [StoreProductSellingUnit_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [StoreProductSellingUnit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [StoreProductSellingUnit_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StoreProductSellingUnit_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StoreProductSellingUnit_configurationKey_key] UNIQUE NONCLUSTERED ([configurationKey])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'StoreProductSellingUnit_retailOrgId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductSellingUnit]'))
  CREATE INDEX [StoreProductSellingUnit_retailOrgId_idx] ON [dbo].[StoreProductSellingUnit]([retailOrgId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'StoreProductSellingUnit_storeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductSellingUnit]'))
  CREATE INDEX [StoreProductSellingUnit_storeId_idx] ON [dbo].[StoreProductSellingUnit]([storeId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'StoreProductSellingUnit_productId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductSellingUnit]'))
  CREATE INDEX [StoreProductSellingUnit_productId_idx] ON [dbo].[StoreProductSellingUnit]([productId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'StoreProductSellingUnit_productVariantId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductSellingUnit]'))
  CREATE INDEX [StoreProductSellingUnit_productVariantId_idx] ON [dbo].[StoreProductSellingUnit]([productVariantId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'StoreProductSellingUnit_barcode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductSellingUnit]'))
  CREATE INDEX [StoreProductSellingUnit_barcode_idx] ON [dbo].[StoreProductSellingUnit]([barcode]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'StoreProductSellingUnit_unitOfMeasureId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductSellingUnit]'))
  CREATE INDEX [StoreProductSellingUnit_unitOfMeasureId_idx] ON [dbo].[StoreProductSellingUnit]([unitOfMeasureId]);

IF COL_LENGTH(N'dbo.PosTransactionLine', N'sellingUnitOfMeasure') IS NULL
  ALTER TABLE [dbo].[PosTransactionLine] ADD [sellingUnitOfMeasure] NVARCHAR(1000) NOT NULL CONSTRAINT [PosTransactionLine_sellingUnitOfMeasure_df] DEFAULT N'EA';
IF COL_LENGTH(N'dbo.PosTransactionLine', N'baseUnitOfMeasure') IS NULL
  ALTER TABLE [dbo].[PosTransactionLine] ADD [baseUnitOfMeasure] NVARCHAR(1000) NOT NULL CONSTRAINT [PosTransactionLine_baseUnitOfMeasure_df] DEFAULT N'EA';
IF COL_LENGTH(N'dbo.PosTransactionLine', N'uomConversionFactor') IS NULL
  ALTER TABLE [dbo].[PosTransactionLine] ADD [uomConversionFactor] DECIMAL(18, 6) NOT NULL CONSTRAINT [PosTransactionLine_uomConversionFactor_df] DEFAULT 1;
IF COL_LENGTH(N'dbo.PosTransactionLine', N'baseQuantity') IS NULL
  ALTER TABLE [dbo].[PosTransactionLine] ADD [baseQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [PosTransactionLine_baseQuantity_df] DEFAULT 0;

EXEC(N'
  UPDATE line
  SET [sellingUnitOfMeasure] = COALESCE(NULLIF(product.[unitOfMeasure], N''''), N''EA''),
      [baseUnitOfMeasure] = COALESCE(NULLIF(base_uom.[code], N''''), NULLIF(product.[unitOfMeasure], N''''), N''EA''),
      [uomConversionFactor] = 1,
      [baseQuantity] = line.[quantity]
  FROM [dbo].[PosTransactionLine] AS line
  INNER JOIN [dbo].[Product] AS product ON product.[id] = line.[productId]
  LEFT JOIN [dbo].[UnitOfMeasure] AS base_uom ON base_uom.[id] = product.[baseUnitOfMeasureId]
  WHERE line.[baseQuantity] = 0;
');

IF COL_LENGTH(N'dbo.SalesOrderLine', N'sellingUnitOfMeasure') IS NULL
  ALTER TABLE [dbo].[SalesOrderLine] ADD [sellingUnitOfMeasure] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrderLine_sellingUnitOfMeasure_df] DEFAULT N'EA';
IF COL_LENGTH(N'dbo.SalesOrderLine', N'baseUnitOfMeasure') IS NULL
  ALTER TABLE [dbo].[SalesOrderLine] ADD [baseUnitOfMeasure] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrderLine_baseUnitOfMeasure_df] DEFAULT N'EA';
IF COL_LENGTH(N'dbo.SalesOrderLine', N'uomConversionFactor') IS NULL
  ALTER TABLE [dbo].[SalesOrderLine] ADD [uomConversionFactor] DECIMAL(18, 6) NOT NULL CONSTRAINT [SalesOrderLine_uomConversionFactor_df] DEFAULT 1;
IF COL_LENGTH(N'dbo.SalesOrderLine', N'baseQuantity') IS NULL
  ALTER TABLE [dbo].[SalesOrderLine] ADD [baseQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [SalesOrderLine_baseQuantity_df] DEFAULT 0;

EXEC(N'
  UPDATE line
  SET [sellingUnitOfMeasure] = COALESCE(NULLIF(product.[unitOfMeasure], N''''), N''EA''),
      [baseUnitOfMeasure] = COALESCE(NULLIF(base_uom.[code], N''''), NULLIF(product.[unitOfMeasure], N''''), N''EA''),
      [uomConversionFactor] = 1,
      [baseQuantity] = line.[quantity]
  FROM [dbo].[SalesOrderLine] AS line
  INNER JOIN [dbo].[SalesOrder] AS sales_order ON sales_order.[id] = line.[salesOrderId]
  INNER JOIN [dbo].[Product] AS product
    ON product.[retailOrgId] = sales_order.[retailOrgId]
   AND product.[code] = line.[productCodeSnapshot]
  LEFT JOIN [dbo].[UnitOfMeasure] AS base_uom ON base_uom.[id] = product.[baseUnitOfMeasureId]
  WHERE line.[baseQuantity] = 0;
');
