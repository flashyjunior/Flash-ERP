/*
  Flash ERP manual SQL Server migration script for SSMS.

  Use this only when you cannot run `npx prisma migrate deploy` against the
  deployed database. Select the deployed RMS database in SSMS, then execute the
  whole script.

  The script applies the latest SQL Server migrations only when they have not
  already been recorded in [dbo].[_prisma_migrations].
*/

SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'[dbo].[_prisma_migrations]', N'U') IS NULL
BEGIN
    THROW 51000, 'Missing [dbo].[_prisma_migrations]. Stop here and confirm how this deployed database was originally created before applying manual migrations.', 1;
END;
GO

PRINT N'Current Flash ERP migration state';
SELECT
    [migration_name],
    [finished_at],
    [rolled_back_at],
    [applied_steps_count]
FROM [dbo].[_prisma_migrations]
WHERE [migration_name] IN (
    N'20260524090000_product_matrix_variants',
    N'20260527010000_pos_line_notes_store_location'
)
ORDER BY [migration_name];
GO

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[_prisma_migrations]
    WHERE [migration_name] = N'20260524090000_product_matrix_variants'
      AND [finished_at] IS NOT NULL
      AND [rolled_back_at] IS NULL
)
BEGIN
    PRINT N'Applying 20260524090000_product_matrix_variants';

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

        IF EXISTS (
            SELECT 1 FROM [dbo].[_prisma_migrations]
            WHERE [migration_name] = N'20260524090000_product_matrix_variants'
        )
        BEGIN
            UPDATE [dbo].[_prisma_migrations]
            SET
                [checksum] = N'ff885b9a046c66f0b515aa771d6e7b873166bf68de1df5443c7cb1c4de32f425',
                [finished_at] = SYSDATETIMEOFFSET(),
                [logs] = NULL,
                [rolled_back_at] = NULL,
                [applied_steps_count] = 1
            WHERE [migration_name] = N'20260524090000_product_matrix_variants';
        END
        ELSE
        BEGIN
            INSERT INTO [dbo].[_prisma_migrations] (
                [id],
                [checksum],
                [finished_at],
                [migration_name],
                [logs],
                [rolled_back_at],
                [started_at],
                [applied_steps_count]
            )
            VALUES (
                LOWER(CONVERT(NVARCHAR(36), NEWID())),
                N'ff885b9a046c66f0b515aa771d6e7b873166bf68de1df5443c7cb1c4de32f425',
                SYSDATETIMEOFFSET(),
                N'20260524090000_product_matrix_variants',
                NULL,
                NULL,
                SYSDATETIMEOFFSET(),
                1
            );
        END

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRAN;
        END;
        THROW;
    END CATCH
END
ELSE
BEGIN
    PRINT N'Skipping 20260524090000_product_matrix_variants because it is already recorded as applied';
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM [dbo].[_prisma_migrations]
    WHERE [migration_name] = N'20260527010000_pos_line_notes_store_location'
      AND [finished_at] IS NOT NULL
      AND [rolled_back_at] IS NULL
)
BEGIN
    PRINT N'Applying 20260527010000_pos_line_notes_store_location';

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

        IF EXISTS (
            SELECT 1 FROM [dbo].[_prisma_migrations]
            WHERE [migration_name] = N'20260527010000_pos_line_notes_store_location'
        )
        BEGIN
            UPDATE [dbo].[_prisma_migrations]
            SET
                [checksum] = N'245a6d272a91eff1e4f7b23700e7127d69ccc77fdcaaa8411516140f7940bdda',
                [finished_at] = SYSDATETIMEOFFSET(),
                [logs] = NULL,
                [rolled_back_at] = NULL,
                [applied_steps_count] = 1
            WHERE [migration_name] = N'20260527010000_pos_line_notes_store_location';
        END
        ELSE
        BEGIN
            INSERT INTO [dbo].[_prisma_migrations] (
                [id],
                [checksum],
                [finished_at],
                [migration_name],
                [logs],
                [rolled_back_at],
                [started_at],
                [applied_steps_count]
            )
            VALUES (
                LOWER(CONVERT(NVARCHAR(36), NEWID())),
                N'245a6d272a91eff1e4f7b23700e7127d69ccc77fdcaaa8411516140f7940bdda',
                SYSDATETIMEOFFSET(),
                N'20260527010000_pos_line_notes_store_location',
                NULL,
                NULL,
                SYSDATETIMEOFFSET(),
                1
            );
        END

        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRAN;
        END;
        THROW;
    END CATCH
END
ELSE
BEGIN
    PRINT N'Skipping 20260527010000_pos_line_notes_store_location because it is already recorded as applied';
END;
GO

PRINT N'Flash ERP migration state after manual SSMS apply';
SELECT
    [migration_name],
    [finished_at],
    [rolled_back_at],
    [applied_steps_count]
FROM [dbo].[_prisma_migrations]
WHERE [migration_name] IN (
    N'20260524090000_product_matrix_variants',
    N'20260527010000_pos_line_notes_store_location'
)
ORDER BY [migration_name];
GO

PRINT N'Flash ERP latest schema checks';
SELECT
    IIF(OBJECT_ID(N'[dbo].[ProductMatrixVariant]', N'U') IS NOT NULL, 1, 0) AS [HasProductMatrixVariant],
    IIF(COL_LENGTH(N'[dbo].[PosTransactionLine]', N'productVariantId') IS NOT NULL, 1, 0) AS [HasPosLineProductVariantId],
    IIF(COL_LENGTH(N'[dbo].[PosTransactionLine]', N'variantAttributesSnapshot') IS NOT NULL, 1, 0) AS [HasVariantAttributesSnapshot],
    IIF(COL_LENGTH(N'[dbo].[PosTransactionLine]', N'lineNote') IS NOT NULL, 1, 0) AS [HasLineNote],
    IIF(COL_LENGTH(N'[dbo].[Store]', N'location') IS NOT NULL, 1, 0) AS [HasStoreLocation],
    IIF(OBJECT_ID(N'[dbo].[transaction_reference_capture]', N'U') IS NOT NULL, 1, 0) AS [HasTransactionReferenceCapture],
    IIF(OBJECT_ID(N'[dbo].[StoreProductPrice]', N'U') IS NOT NULL, 1, 0) AS [HasStoreProductPrice];
GO
