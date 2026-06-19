BEGIN TRY

BEGIN TRAN;

IF COL_LENGTH(N'[dbo].[PosTransactionLine]', N'lineNote') IS NULL
BEGIN
    ALTER TABLE [dbo].[PosTransactionLine] ADD [lineNote] NVARCHAR(MAX) NULL;
END

IF COL_LENGTH(N'[dbo].[Store]', N'location') IS NULL
BEGIN
    ALTER TABLE [dbo].[Store] ADD [location] NVARCHAR(1000) NULL;
END

IF OBJECT_ID(N'[dbo].[transaction_reference_capture]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[transaction_reference_capture] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [referenceValue] NVARCHAR(1000) NOT NULL,
        [normalizedReference] NVARCHAR(1000) NOT NULL,
        [phoneNumber] NVARCHAR(1000) NULL,
        [source] NVARCHAR(100) NOT NULL,
        [sourceTransactionNo] NVARCHAR(1000) NULL,
        [customerName] NVARCHAR(1000) NULL,
        [notes] NVARCHAR(MAX) NULL,
        [firstCapturedAt] DATETIME2(3) NOT NULL CONSTRAINT [transaction_reference_capture_first_df] DEFAULT CURRENT_TIMESTAMP,
        [lastCapturedAt] DATETIME2(3) NOT NULL CONSTRAINT [transaction_reference_capture_last_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [transaction_reference_capture_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [transaction_reference_capture_org_ref_key] UNIQUE NONCLUSTERED ([retailOrgId], [normalizedReference])
    );
END

IF OBJECT_ID(N'[dbo].[StoreProductPrice]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[StoreProductPrice] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [storeId] NVARCHAR(1000) NOT NULL,
        [productId] NVARCHAR(1000) NOT NULL,
        [productVariantId] NVARCHAR(1000) NULL,
        [unitPrice] DECIMAL(18, 2) NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [StoreProductPrice_status_df] DEFAULT N'ACTIVE',
        [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [StoreProductPrice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [StoreProductPrice_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [StoreProductPrice_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [StoreProductPrice_retailOrgId_fkey] FOREIGN KEY ([retailOrgId]) REFERENCES [dbo].[RetailOrg]([id]) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT [StoreProductPrice_storeId_fkey] FOREIGN KEY ([storeId]) REFERENCES [dbo].[Store]([id]) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT [StoreProductPrice_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT [StoreProductPrice_productVariantId_fkey] FOREIGN KEY ([productVariantId]) REFERENCES [dbo].[ProductMatrixVariant]([id]) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT [StoreProductPrice_storeId_productId_productVariantId_key] UNIQUE NONCLUSTERED ([storeId], [productId], [productVariantId])
    );
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'StoreProductPrice_retailOrgId_storeId_status_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductPrice]')
)
BEGIN
    CREATE INDEX [StoreProductPrice_retailOrgId_storeId_status_idx]
        ON [dbo].[StoreProductPrice]([retailOrgId], [storeId], [status]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'StoreProductPrice_productId_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductPrice]')
)
BEGIN
    CREATE INDEX [StoreProductPrice_productId_idx]
        ON [dbo].[StoreProductPrice]([productId]);
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'StoreProductPrice_productVariantId_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductPrice]')
)
BEGIN
    CREATE INDEX [StoreProductPrice_productVariantId_idx]
        ON [dbo].[StoreProductPrice]([productVariantId]);
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
