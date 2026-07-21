IF OBJECT_ID(N'[dbo].[SalesOrderLine]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[SalesOrderLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [salesOrderId] NVARCHAR(1000) NOT NULL,
    [productCodeSnapshot] NVARCHAR(1000) NOT NULL,
    [productVariantCodeSnapshot] NVARCHAR(1000) NULL,
    [productNameSnapshot] NVARCHAR(1000) NOT NULL,
    [variantSizeSnapshot] NVARCHAR(1000) NULL,
    [variantColorSnapshot] NVARCHAR(1000) NULL,
    [variantAttributesSnapshot] NVARCHAR(1000) NULL,
    [lineNote] NVARCHAR(1000) NULL,
    [quantity] DECIMAL(18, 3) NOT NULL,
    [unitPrice] DECIMAL(18, 2) NOT NULL,
    [discountAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [SalesOrderLine_discountAmount_df] DEFAULT 0,
    [taxAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [SalesOrderLine_taxAmount_df] DEFAULT 0,
    [lineTotal] DECIMAL(18, 2) NOT NULL,
    [appliedPromotionCode] NVARCHAR(1000) NULL,
    [appliedPromotionName] NVARCHAR(1000) NULL,
    CONSTRAINT [SalesOrderLine_pkey] PRIMARY KEY CLUSTERED ([id])
  );

  CREATE NONCLUSTERED INDEX [SalesOrderLine_salesOrderId_idx]
    ON [dbo].[SalesOrderLine]([salesOrderId]);
  CREATE NONCLUSTERED INDEX [SalesOrderLine_productCodeSnapshot_idx]
    ON [dbo].[SalesOrderLine]([productCodeSnapshot]);
END;
