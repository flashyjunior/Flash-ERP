BEGIN TRY

BEGIN TRAN;

IF OBJECT_ID(N'[dbo].[ProductAttributeDefinition]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductAttributeDefinition] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(1000),
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ProductAttributeDefinition_status_df] DEFAULT 'ACTIVE',
        [sortOrder] INT NOT NULL CONSTRAINT [ProductAttributeDefinition_sortOrder_df] DEFAULT 0,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductAttributeDefinition_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ProductAttributeDefinition_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ProductAttributeDefinition_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ProductAttributeValue]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductAttributeValue] (
        [id] NVARCHAR(1000) NOT NULL,
        [attributeId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [label] NVARCHAR(1000) NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ProductAttributeValue_status_df] DEFAULT 'ACTIVE',
        [sortOrder] INT NOT NULL CONSTRAINT [ProductAttributeValue_sortOrder_df] DEFAULT 0,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductAttributeValue_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ProductAttributeValue_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ProductAttributeValue_attributeId_code_key] UNIQUE NONCLUSTERED ([attributeId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ProductMatrixAttribute]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductMatrixAttribute] (
        [id] NVARCHAR(1000) NOT NULL,
        [productId] NVARCHAR(1000) NOT NULL,
        [attributeId] NVARCHAR(1000) NOT NULL,
        [isRequired] BIT NOT NULL CONSTRAINT [ProductMatrixAttribute_isRequired_df] DEFAULT 1,
        [sortOrder] INT NOT NULL CONSTRAINT [ProductMatrixAttribute_sortOrder_df] DEFAULT 0,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductMatrixAttribute_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ProductMatrixAttribute_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ProductMatrixAttribute_productId_attributeId_key] UNIQUE NONCLUSTERED ([productId], [attributeId])
    );
END

IF OBJECT_ID(N'[dbo].[ProductMatrixVariant]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductMatrixVariant] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [productId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [sku] NVARCHAR(1000),
        [displayName] NVARCHAR(1000),
        [unitPrice] DECIMAL(18,2) NOT NULL,
        [costPrice] DECIMAL(18,2),
        [quantityOnHand] DECIMAL(18,3) NOT NULL CONSTRAINT [ProductMatrixVariant_quantityOnHand_df] DEFAULT 0,
        [barcode] NVARCHAR(1000),
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ProductMatrixVariant_status_df] DEFAULT 'ACTIVE',
        [sortOrder] INT NOT NULL CONSTRAINT [ProductMatrixVariant_sortOrder_df] DEFAULT 0,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductMatrixVariant_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ProductMatrixVariant_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ProductMatrixVariant_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId], [code]),
        CONSTRAINT [ProductMatrixVariant_productId_code_key] UNIQUE NONCLUSTERED ([productId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ProductMatrixVariantValue]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductMatrixVariantValue] (
        [id] NVARCHAR(1000) NOT NULL,
        [variantId] NVARCHAR(1000) NOT NULL,
        [attributeId] NVARCHAR(1000) NOT NULL,
        [attributeValueId] NVARCHAR(1000) NOT NULL,
        [valueLabelSnapshot] NVARCHAR(1000) NOT NULL,
        [sortOrder] INT NOT NULL CONSTRAINT [ProductMatrixVariantValue_sortOrder_df] DEFAULT 0,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductMatrixVariantValue_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ProductMatrixVariantValue_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ProductMatrixVariantValue_variantId_attributeId_key] UNIQUE NONCLUSTERED ([variantId], [attributeId])
    );
END

IF COL_LENGTH(N'dbo.Barcode', N'productVariantId') IS NULL
BEGIN
    ALTER TABLE [dbo].[Barcode] ADD [productVariantId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'dbo.InventoryLedgerEntry', N'productVariantId') IS NULL
BEGIN
    ALTER TABLE [dbo].[InventoryLedgerEntry] ADD [productVariantId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'dbo.PosTransactionLine', N'productVariantId') IS NULL
BEGIN
    ALTER TABLE [dbo].[PosTransactionLine] ADD [productVariantId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'dbo.PosTransactionLine', N'variantAttributesSnapshot') IS NULL
BEGIN
    ALTER TABLE [dbo].[PosTransactionLine] ADD [variantAttributesSnapshot] NVARCHAR(MAX) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductAttributeDefinition_retailOrgId_status_sortOrder_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductAttributeDefinition]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductAttributeDefinition_retailOrgId_status_sortOrder_idx]
        ON [dbo].[ProductAttributeDefinition]([retailOrgId], [status], [sortOrder]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductAttributeValue_attributeId_status_sortOrder_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductAttributeValue]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductAttributeValue_attributeId_status_sortOrder_idx]
        ON [dbo].[ProductAttributeValue]([attributeId], [status], [sortOrder]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductMatrixAttribute_attributeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductMatrixAttribute]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductMatrixAttribute_attributeId_idx]
        ON [dbo].[ProductMatrixAttribute]([attributeId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductMatrixVariant_productId_status_sortOrder_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductMatrixVariant]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductMatrixVariant_productId_status_sortOrder_idx]
        ON [dbo].[ProductMatrixVariant]([productId], [status], [sortOrder]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductMatrixVariant_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductMatrixVariant]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductMatrixVariant_retailOrgId_status_idx]
        ON [dbo].[ProductMatrixVariant]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductMatrixVariantValue_attributeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductMatrixVariantValue]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductMatrixVariantValue_attributeId_idx]
        ON [dbo].[ProductMatrixVariantValue]([attributeId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ProductMatrixVariantValue_attributeValueId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ProductMatrixVariantValue]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ProductMatrixVariantValue_attributeValueId_idx]
        ON [dbo].[ProductMatrixVariantValue]([attributeValueId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'Barcode_productVariantId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[Barcode]'))
BEGIN
    CREATE NONCLUSTERED INDEX [Barcode_productVariantId_idx]
        ON [dbo].[Barcode]([productVariantId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'InventoryLedgerEntry_productVariantId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryLedgerEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [InventoryLedgerEntry_productVariantId_idx]
        ON [dbo].[InventoryLedgerEntry]([productVariantId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'PosTransactionLine_productVariantId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[PosTransactionLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [PosTransactionLine_productVariantId_idx]
        ON [dbo].[PosTransactionLine]([productVariantId]);
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
