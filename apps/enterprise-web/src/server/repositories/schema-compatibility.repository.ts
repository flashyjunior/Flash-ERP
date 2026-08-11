import { prisma } from "@/lib/db/prisma";

let interStoreTransferSchemaReady: Promise<void> | null = null;
let permissionCatalogSchemaReady: Promise<void> | null = null;
let inventoryLocationSalesOrderSchemaReady: Promise<void> | null = null;
let productVariantSalesOrderDepositSchemaReady: Promise<void> | null = null;
let operatingExpenseSchemaReady: Promise<void> | null = null;
let inventoryExpirySchemaReady: Promise<void> | null = null;

function isSqlServerDatabase() {
  return (process.env.DATABASE_URL ?? "").trim().toLowerCase().startsWith("sqlserver://");
}

export function ensureInterStoreTransferSchemaCompatibility() {
  interStoreTransferSchemaReady ??= (async () => {
    if (isSqlServerDatabase()) {
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'transferBatchNo') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [transferBatchNo] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'lineNo') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [lineNo] INT NOT NULL CONSTRAINT [InterStoreTransfer_lineNo_df] DEFAULT 1;
        END
        ELSE
        BEGIN
          UPDATE [dbo].[InterStoreTransfer] SET [lineNo] = 1 WHERE [lineNo] IS NULL;
          ALTER TABLE [dbo].[InterStoreTransfer] ALTER COLUMN [lineNo] INT NOT NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'requiredAt') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [requiredAt] DATETIME2(3) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'transporterName') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [transporterName] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'vehicleRegistrationNo') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [vehicleRegistrationNo] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'driverName') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [driverName] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'driverContact') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [driverContact] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'deliveryNoteNo') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [deliveryNoteNo] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'feedbackDipReading') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [feedbackDipReading] DECIMAL(18, 3) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'beforeDischargeEvidenceJson') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [beforeDischargeEvidenceJson] NVARCHAR(MAX) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'afterDischargeEvidenceJson') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [afterDischargeEvidenceJson] NVARCHAR(MAX) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE [name] = N'InterStoreTransfer_retailOrgId_transferBatchNo_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[InterStoreTransfer]')
        )
        BEGIN
          CREATE INDEX [InterStoreTransfer_retailOrgId_transferBatchNo_idx]
            ON [dbo].[InterStoreTransfer]([retailOrgId], [transferBatchNo]);
        END
      `);
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "transferBatchNo" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "lineNo" INTEGER'
      );
      await prisma.$executeRawUnsafe(
        'UPDATE "InterStoreTransfer" SET "lineNo" = 1 WHERE "lineNo" IS NULL'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ALTER COLUMN "lineNo" SET DEFAULT 1'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ALTER COLUMN "lineNo" SET NOT NULL'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "requiredAt" TIMESTAMP(3)'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "transporterName" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "vehicleRegistrationNo" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "driverName" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "driverContact" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "deliveryNoteNo" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "feedbackDipReading" DECIMAL(18,3)'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "beforeDischargeEvidenceJson" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "afterDischargeEvidenceJson" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "InterStoreTransfer_retailOrgId_transferBatchNo_idx" ON "InterStoreTransfer"("retailOrgId", "transferBatchNo")'
      );
    }
  })().catch((error) => {
    interStoreTransferSchemaReady = null;
    throw error;
  });

  return interStoreTransferSchemaReady;
}

export function ensureOperatingExpenseSchemaCompatibility() {
  operatingExpenseSchemaReady ??= (async () => {
    if (isSqlServerDatabase()) {
      const columns = [
        ["attachmentFileName", "NVARCHAR(1000) NULL"],
        ["attachmentUrl", "NVARCHAR(1000) NULL"],
        ["confirmedBy", "NVARCHAR(1000) NULL"],
        ["confirmedAt", "DATETIME2(3) NULL"],
        ["financeExpenseAccountCode", "NVARCHAR(1000) NULL"],
        ["financePaymentAccountCode", "NVARCHAR(1000) NULL"],
        ["financeAssignedBy", "NVARCHAR(1000) NULL"],
        ["financeAssignedAt", "DATETIME2(3) NULL"],
      ] as const;

      for (const [columnName, columnType] of columns) {
        await prisma.$executeRawUnsafe(`
          IF COL_LENGTH(N'dbo.OperatingExpense', N'${columnName}') IS NULL
          BEGIN
            ALTER TABLE [dbo].[OperatingExpense] ADD [${columnName}] ${columnType};
          END
        `);
      }
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "attachmentFileName" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "confirmedBy" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3)'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "financeExpenseAccountCode" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "financePaymentAccountCode" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "financeAssignedBy" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OperatingExpense" ADD COLUMN IF NOT EXISTS "financeAssignedAt" TIMESTAMP(3)'
      );
    }
  })().catch((error) => {
    operatingExpenseSchemaReady = null;
    throw error;
  });

  return operatingExpenseSchemaReady;
}

export function ensurePermissionCatalogSchemaCompatibility() {
  permissionCatalogSchemaReady ??= (async () => {
    if (isSqlServerDatabase()) {
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Permission', N'name') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Permission] ADD [name] NVARCHAR(1000) NOT NULL CONSTRAINT [Permission_name_df] DEFAULT N'';
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Permission', N'description') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Permission] ADD [description] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE [name] = N'Permission_code_key'
            AND [object_id] = OBJECT_ID(N'[dbo].[Permission]')
        )
        BEGIN
          CREATE UNIQUE INDEX [Permission_code_key] ON [dbo].[Permission]([code]);
        END
      `);
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Permission" ADD COLUMN IF NOT EXISTS "name" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Permission" ADD COLUMN IF NOT EXISTS "description" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "Permission_code_key" ON "Permission"("code")'
      );
    }
  })().catch((error) => {
    permissionCatalogSchemaReady = null;
    throw error;
  });

  return permissionCatalogSchemaReady;
}

export function ensureInventoryLocationSalesOrderSchemaCompatibility() {
  inventoryLocationSalesOrderSchemaReady ??= (async () => {
    if (isSqlServerDatabase()) {
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InventoryLocation', N'useForSalesOrderDefault') IS NULL
        BEGIN
          BEGIN TRY
            EXEC sp_executesql N'
              ALTER TABLE [dbo].[InventoryLocation]
                ADD [useForSalesOrderDefault] BIT NOT NULL
                  CONSTRAINT [InventoryLocation_useForSalesOrderDefault_df] DEFAULT 0;
            ';
          END TRY
          BEGIN CATCH
            IF COL_LENGTH(N'dbo.InventoryLocation', N'useForSalesOrderDefault') IS NULL
              THROW;
          END CATCH
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Store', N'location') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Store]
            ADD [location] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE [dbo].[InventoryLocation]
        SET [useForSalesOrderDefault] = [useForSalesDefault]
        WHERE [useForSalesOrderDefault] = 0
          AND [useForSalesDefault] = 1;
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'inventoryLocationId') IS NULL
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine]
            ADD [inventoryLocationId] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE [name] = N'PosTransactionLine_inventoryLocationId_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[PosTransactionLine]')
        )
        BEGIN
          CREATE NONCLUSTERED INDEX [PosTransactionLine_inventoryLocationId_idx]
            ON [dbo].[PosTransactionLine]([inventoryLocationId]);
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.foreign_keys
          WHERE [name] = N'PosTransactionLine_inventoryLocationId_fkey'
        )
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine]
            ADD CONSTRAINT [PosTransactionLine_inventoryLocationId_fkey]
            FOREIGN KEY ([inventoryLocationId]) REFERENCES [dbo].[InventoryLocation]([id])
            ON DELETE SET NULL ON UPDATE CASCADE;
        END
      `);
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "InventoryLocation" ADD COLUMN IF NOT EXISTS "useForSalesOrderDefault" BOOLEAN NOT NULL DEFAULT false'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "location" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'UPDATE "InventoryLocation" SET "useForSalesOrderDefault" = "useForSalesDefault" WHERE "useForSalesOrderDefault" = false AND "useForSalesDefault" = true'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "PosTransactionLine" ADD COLUMN IF NOT EXISTS "inventoryLocationId" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "PosTransactionLine_inventoryLocationId_idx" ON "PosTransactionLine"("inventoryLocationId")'
      );
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'PosTransactionLine_inventoryLocationId_fkey'
          ) THEN
            ALTER TABLE "PosTransactionLine"
              ADD CONSTRAINT "PosTransactionLine_inventoryLocationId_fkey"
              FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id")
              ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
    }
  })().catch((error) => {
    inventoryLocationSalesOrderSchemaReady = null;
    throw error;
  });

  return inventoryLocationSalesOrderSchemaReady;
}

export function ensureProductVariantSalesOrderDepositSchemaCompatibility() {
  productVariantSalesOrderDepositSchemaReady ??= (async () => {
    if (isSqlServerDatabase()) {
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Product', N'trackSize') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Product]
            ADD [trackSize] BIT NOT NULL
              CONSTRAINT [Product_trackSize_df] DEFAULT 0;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Product', N'trackColor') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Product]
            ADD [trackColor] BIT NOT NULL
              CONSTRAINT [Product_trackColor_df] DEFAULT 0;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'variantSizeSnapshot') IS NULL
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine]
            ADD [variantSizeSnapshot] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'variantColorSnapshot') IS NULL
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine]
            ADD [variantColorSnapshot] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'lineNote') IS NULL
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine]
            ADD [lineNote] NVARCHAR(MAX) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Store', N'location') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Store]
            ADD [location] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
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
      `);
      await prisma.$executeRawUnsafe(`
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
      `);
      await prisma.$executeRawUnsafe(`
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
      `);
      await prisma.$executeRawUnsafe(`
        IF OBJECT_ID(N'[dbo].[ProductMatrixVariant]', N'U') IS NULL
        BEGIN
          CREATE TABLE [dbo].[ProductMatrixVariant] (
            [id] NVARCHAR(1000) NOT NULL,
            [retailOrgId] NVARCHAR(1000) NOT NULL,
            [productId] NVARCHAR(1000) NOT NULL,
            [code] NVARCHAR(1000) NOT NULL,
            [sku] NVARCHAR(1000),
            [displayName] NVARCHAR(1000),
            [unitPrice] DECIMAL(18, 2) NOT NULL,
            [costPrice] DECIMAL(18, 2),
            [quantityOnHand] DECIMAL(18, 3) NOT NULL CONSTRAINT [ProductMatrixVariant_quantityOnHand_df] DEFAULT 0,
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
      `);
      await prisma.$executeRawUnsafe(`
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
      `);
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE [name] = N'StoreProductPrice_retailOrgId_storeId_status_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[StoreProductPrice]')
        )
        BEGIN
          CREATE INDEX [StoreProductPrice_retailOrgId_storeId_status_idx]
            ON [dbo].[StoreProductPrice]([retailOrgId], [storeId], [status]);
        END
      `);
      await prisma.$executeRawUnsafe(`
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
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Barcode', N'productVariantId') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Barcode] ADD [productVariantId] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.InventoryLedgerEntry', N'productVariantId') IS NULL
        BEGIN
          ALTER TABLE [dbo].[InventoryLedgerEntry] ADD [productVariantId] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'productVariantId') IS NULL
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine] ADD [productVariantId] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'variantAttributesSnapshot') IS NULL
        BEGIN
          ALTER TABLE [dbo].[PosTransactionLine] ADD [variantAttributesSnapshot] NVARCHAR(MAX) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'depositAmount') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [depositAmount] DECIMAL(18, 2) NOT NULL
              CONSTRAINT [SalesOrder_depositAmount_df] DEFAULT 0;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'balanceAmount') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [balanceAmount] DECIMAL(18, 2) NOT NULL
              CONSTRAINT [SalesOrder_balanceAmount_df] DEFAULT 0;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'depositTenderMethodCodeSnapshot') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [depositTenderMethodCodeSnapshot] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'depositTenderMethodNameSnapshot') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [depositTenderMethodNameSnapshot] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'depositPaymentMethodSnapshot') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [depositPaymentMethodSnapshot] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'depositReference') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [depositReference] NVARCHAR(1000) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.SalesOrder', N'depositPaidAt') IS NULL
        BEGIN
          ALTER TABLE [dbo].[SalesOrder]
            ADD [depositPaidAt] DATETIME2(3) NULL;
        END
      `);
      await prisma.$executeRawUnsafe(`
        UPDATE [dbo].[SalesOrder]
        SET [balanceAmount] = [totalAmount]
        WHERE [balanceAmount] = 0
          AND [status] = N'OPEN';
      `);
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "trackSize" BOOLEAN NOT NULL DEFAULT false'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "trackColor" BOOLEAN NOT NULL DEFAULT false'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "PosTransactionLine" ADD COLUMN IF NOT EXISTS "variantSizeSnapshot" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "PosTransactionLine" ADD COLUMN IF NOT EXISTS "variantColorSnapshot" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "PosTransactionLine" ADD COLUMN IF NOT EXISTS "lineNote" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "location" TEXT'
      );
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "StoreProductPrice" (
          "id" TEXT PRIMARY KEY,
          "retailOrgId" TEXT NOT NULL REFERENCES "RetailOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "productVariantId" TEXT REFERENCES "ProductMatrixVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "unitPrice" DECIMAL(18, 2) NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "StoreProductPrice_store_product_variant_key" ON "StoreProductPrice"("storeId", "productId", "productVariantId")'
      );
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "StoreProductPrice_store_product_base_key" ON "StoreProductPrice"("storeId", "productId") WHERE "productVariantId" IS NULL'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "StoreProductPrice_retailOrgId_storeId_status_idx" ON "StoreProductPrice"("retailOrgId", "storeId", "status")'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "depositAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "balanceAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "depositTenderMethodCodeSnapshot" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "depositTenderMethodNameSnapshot" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "depositPaymentMethodSnapshot" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "depositReference" TEXT'
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "depositPaidAt" TIMESTAMP(3)'
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "SalesOrder"
         SET "balanceAmount" = "totalAmount"
         WHERE "balanceAmount" = 0
           AND "status" = 'OPEN'`
      );
    }
  })().catch((error) => {
    productVariantSalesOrderDepositSchemaReady = null;
    throw error;
  });

  return productVariantSalesOrderDepositSchemaReady;
}

export function ensureInventoryExpirySchemaCompatibility() {
  inventoryExpirySchemaReady ??= (async () => {
    if (isSqlServerDatabase()) {
      await prisma.$executeRawUnsafe(`
        IF COL_LENGTH(N'dbo.Product', N'trackExpiry') IS NULL
        BEGIN
          ALTER TABLE [dbo].[Product]
            ADD [trackExpiry] BIT NOT NULL
              CONSTRAINT [Product_trackExpiry_df] DEFAULT 0;
        END

        IF OBJECT_ID(N'[dbo].[InventoryBatch]', N'U') IS NULL
        BEGIN
          CREATE TABLE [dbo].[InventoryBatch] (
            [id] NVARCHAR(64) NOT NULL,
            [retailOrgId] NVARCHAR(1000) NOT NULL,
            [storeId] NVARCHAR(1000) NULL,
            [warehouseId] NVARCHAR(1000) NULL,
            [inventoryLocationId] NVARCHAR(1000) NOT NULL,
            [productId] NVARCHAR(1000) NOT NULL,
            [batchNo] NVARCHAR(200) NOT NULL,
            [manufacturedAt] DATETIME2(3) NULL,
            [expiryDate] DATETIME2(3) NOT NULL,
            [quantityOnHand] DECIMAL(18, 3) NOT NULL CONSTRAINT [InventoryBatch_quantityOnHand_df] DEFAULT 0,
            [status] NVARCHAR(40) NOT NULL CONSTRAINT [InventoryBatch_status_df] DEFAULT N'ACTIVE',
            [sourceReferenceType] NVARCHAR(1000) NULL,
            [sourceReferenceId] NVARCHAR(1000) NULL,
            [sourceReferenceLabel] NVARCHAR(1000) NULL,
            [sourceNodeCode] NVARCHAR(1000) NULL,
            [lastOccurredAt] DATETIME2(3) NULL,
            [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [InventoryBatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
            [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [InventoryBatch_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT [InventoryBatch_pkey] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [InventoryBatch_retailOrgId_inventoryLocationId_productId_batchNo_key]
              UNIQUE NONCLUSTERED ([retailOrgId], [inventoryLocationId], [productId], [batchNo])
          );
        END

        IF OBJECT_ID(N'[dbo].[InventoryBatch]', N'U') IS NOT NULL
        BEGIN
          IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'InventoryLedgerEntry_inventoryBatchId_fkey')
            ALTER TABLE [dbo].[InventoryLedgerEntry] DROP CONSTRAINT [InventoryLedgerEntry_inventoryBatchId_fkey];
          IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'InventoryBatch_retailOrgId_fkey')
            ALTER TABLE [dbo].[InventoryBatch] DROP CONSTRAINT [InventoryBatch_retailOrgId_fkey];
          IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'InventoryBatch_storeId_fkey')
            ALTER TABLE [dbo].[InventoryBatch] DROP CONSTRAINT [InventoryBatch_storeId_fkey];
          IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'InventoryBatch_warehouseId_fkey')
            ALTER TABLE [dbo].[InventoryBatch] DROP CONSTRAINT [InventoryBatch_warehouseId_fkey];
          IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'InventoryBatch_inventoryLocationId_fkey')
            ALTER TABLE [dbo].[InventoryBatch] DROP CONSTRAINT [InventoryBatch_inventoryLocationId_fkey];
          IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'InventoryBatch_productId_fkey')
            ALTER TABLE [dbo].[InventoryBatch] DROP CONSTRAINT [InventoryBatch_productId_fkey];

          IF EXISTS (
            SELECT 1
            FROM sys.columns
            WHERE [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]')
              AND [name] IN (N'retailOrgId', N'storeId', N'warehouseId', N'inventoryLocationId', N'productId')
              AND [max_length] <> 2000
          )
          BEGIN
            IF EXISTS (
              SELECT 1 FROM sys.key_constraints
              WHERE [name] = N'InventoryBatch_retailOrgId_inventoryLocationId_productId_batchNo_key'
                AND [parent_object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]')
            )
              ALTER TABLE [dbo].[InventoryBatch]
                DROP CONSTRAINT [InventoryBatch_retailOrgId_inventoryLocationId_productId_batchNo_key];

            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'InventoryBatch_storeId_productId_status_expiryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]'))
              DROP INDEX [InventoryBatch_storeId_productId_status_expiryDate_idx] ON [dbo].[InventoryBatch];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'InventoryBatch_inventoryLocationId_productId_status_expiryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]'))
              DROP INDEX [InventoryBatch_inventoryLocationId_productId_status_expiryDate_idx] ON [dbo].[InventoryBatch];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'InventoryBatch_warehouseId_productId_status_expiryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]'))
              DROP INDEX [InventoryBatch_warehouseId_productId_status_expiryDate_idx] ON [dbo].[InventoryBatch];
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'InventoryBatch_productId_expiryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]'))
              DROP INDEX [InventoryBatch_productId_expiryDate_idx] ON [dbo].[InventoryBatch];

            ALTER TABLE [dbo].[InventoryBatch] ALTER COLUMN [retailOrgId] NVARCHAR(1000) NOT NULL;
            ALTER TABLE [dbo].[InventoryBatch] ALTER COLUMN [storeId] NVARCHAR(1000) NULL;
            ALTER TABLE [dbo].[InventoryBatch] ALTER COLUMN [warehouseId] NVARCHAR(1000) NULL;
            ALTER TABLE [dbo].[InventoryBatch] ALTER COLUMN [inventoryLocationId] NVARCHAR(1000) NOT NULL;
            ALTER TABLE [dbo].[InventoryBatch] ALTER COLUMN [productId] NVARCHAR(1000) NOT NULL;

            ALTER TABLE [dbo].[InventoryBatch]
              ADD CONSTRAINT [InventoryBatch_retailOrgId_inventoryLocationId_productId_batchNo_key]
                UNIQUE NONCLUSTERED ([retailOrgId], [inventoryLocationId], [productId], [batchNo]);
          END;
        END

        IF COL_LENGTH(N'dbo.InventoryLedgerEntry', N'inventoryBatchId') IS NULL
          ALTER TABLE [dbo].[InventoryLedgerEntry] ADD [inventoryBatchId] NVARCHAR(64) NULL;
        IF COL_LENGTH(N'dbo.InventoryLedgerEntry', N'batchNoSnapshot') IS NULL
          ALTER TABLE [dbo].[InventoryLedgerEntry] ADD [batchNoSnapshot] NVARCHAR(200) NULL;
        IF COL_LENGTH(N'dbo.InventoryLedgerEntry', N'expiryDateSnapshot') IS NULL
          ALTER TABLE [dbo].[InventoryLedgerEntry] ADD [expiryDateSnapshot] DATETIME2(3) NULL;
        IF COL_LENGTH(N'dbo.GoodsReceiptLine', N'batchNo') IS NULL
          ALTER TABLE [dbo].[GoodsReceiptLine] ADD [batchNo] NVARCHAR(200) NULL;
        IF COL_LENGTH(N'dbo.GoodsReceiptLine', N'manufacturedAt') IS NULL
          ALTER TABLE [dbo].[GoodsReceiptLine] ADD [manufacturedAt] DATETIME2(3) NULL;
        IF COL_LENGTH(N'dbo.GoodsReceiptLine', N'expiryDate') IS NULL
          ALTER TABLE [dbo].[GoodsReceiptLine] ADD [expiryDate] DATETIME2(3) NULL;
        IF COL_LENGTH(N'dbo.PosTransactionLine', N'batchAllocationsSnapshot') IS NULL
          ALTER TABLE [dbo].[PosTransactionLine] ADD [batchAllocationsSnapshot] NVARCHAR(MAX) NULL;
        IF COL_LENGTH(N'dbo.SupplierReturnLine', N'batchAllocationsSnapshot') IS NULL
          ALTER TABLE [dbo].[SupplierReturnLine] ADD [batchAllocationsSnapshot] NVARCHAR(MAX) NULL;
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'issuedBatchAllocationsSnapshot') IS NULL
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [issuedBatchAllocationsSnapshot] NVARCHAR(MAX) NULL;
        IF COL_LENGTH(N'dbo.InterStoreTransfer', N'receivedBatchAllocationsSnapshot') IS NULL
          ALTER TABLE [dbo].[InterStoreTransfer] ADD [receivedBatchAllocationsSnapshot] NVARCHAR(MAX) NULL;
        IF COL_LENGTH(N'dbo.StockCountSession', N'previousBatchQuantitiesSnapshot') IS NULL
          ALTER TABLE [dbo].[StockCountSession] ADD [previousBatchQuantitiesSnapshot] NVARCHAR(MAX) NULL;
        IF COL_LENGTH(N'dbo.StockCountSession', N'countedBatchQuantitiesSnapshot') IS NULL
          ALTER TABLE [dbo].[StockCountSession] ADD [countedBatchQuantitiesSnapshot] NVARCHAR(MAX) NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE [name] = N'InventoryBatch_storeId_productId_status_expiryDate_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]')
        )
          CREATE INDEX [InventoryBatch_storeId_productId_status_expiryDate_idx]
            ON [dbo].[InventoryBatch]([storeId], [productId], [status], [expiryDate]);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE [name] = N'InventoryBatch_inventoryLocationId_productId_status_expiryDate_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]')
        )
          CREATE INDEX [InventoryBatch_inventoryLocationId_productId_status_expiryDate_idx]
            ON [dbo].[InventoryBatch]([inventoryLocationId], [productId], [status], [expiryDate]);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE [name] = N'InventoryBatch_warehouseId_productId_status_expiryDate_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]')
        )
          CREATE INDEX [InventoryBatch_warehouseId_productId_status_expiryDate_idx]
            ON [dbo].[InventoryBatch]([warehouseId], [productId], [status], [expiryDate]);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE [name] = N'InventoryLedgerEntry_inventoryBatchId_idx'
            AND [object_id] = OBJECT_ID(N'[dbo].[InventoryLedgerEntry]')
        )
          CREATE INDEX [InventoryLedgerEntry_inventoryBatchId_idx]
            ON [dbo].[InventoryLedgerEntry]([inventoryBatchId]);
      `);
    } else {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "trackExpiry" BOOLEAN NOT NULL DEFAULT false'
      );
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "InventoryBatch" (
          "id" TEXT PRIMARY KEY,
          "retailOrgId" TEXT NOT NULL,
          "storeId" TEXT,
          "warehouseId" TEXT,
          "inventoryLocationId" TEXT NOT NULL,
          "productId" TEXT NOT NULL,
          "batchNo" TEXT NOT NULL,
          "manufacturedAt" TIMESTAMP(3),
          "expiryDate" TIMESTAMP(3) NOT NULL,
          "quantityOnHand" DECIMAL(18, 3) NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "sourceReferenceType" TEXT,
          "sourceReferenceId" TEXT,
          "sourceReferenceLabel" TEXT,
          "sourceNodeCode" TEXT,
          "lastOccurredAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE ("retailOrgId", "inventoryLocationId", "productId", "batchNo")
        )
      `);
      for (const statement of [
        'ALTER TABLE "InventoryLedgerEntry" ADD COLUMN IF NOT EXISTS "inventoryBatchId" TEXT',
        'ALTER TABLE "InventoryLedgerEntry" ADD COLUMN IF NOT EXISTS "batchNoSnapshot" TEXT',
        'ALTER TABLE "InventoryLedgerEntry" ADD COLUMN IF NOT EXISTS "expiryDateSnapshot" TIMESTAMP(3)',
        'ALTER TABLE "GoodsReceiptLine" ADD COLUMN IF NOT EXISTS "batchNo" TEXT',
        'ALTER TABLE "GoodsReceiptLine" ADD COLUMN IF NOT EXISTS "manufacturedAt" TIMESTAMP(3)',
        'ALTER TABLE "GoodsReceiptLine" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3)',
        'ALTER TABLE "PosTransactionLine" ADD COLUMN IF NOT EXISTS "batchAllocationsSnapshot" TEXT',
        'ALTER TABLE "SupplierReturnLine" ADD COLUMN IF NOT EXISTS "batchAllocationsSnapshot" TEXT',
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "issuedBatchAllocationsSnapshot" TEXT',
        'ALTER TABLE "InterStoreTransfer" ADD COLUMN IF NOT EXISTS "receivedBatchAllocationsSnapshot" TEXT',
        'ALTER TABLE "StockCountSession" ADD COLUMN IF NOT EXISTS "previousBatchQuantitiesSnapshot" TEXT',
        'ALTER TABLE "StockCountSession" ADD COLUMN IF NOT EXISTS "countedBatchQuantitiesSnapshot" TEXT'
      ]) {
        await prisma.$executeRawUnsafe(statement);
      }
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "InventoryBatch_inventoryLocationId_productId_status_expiryDate_idx" ON "InventoryBatch"("inventoryLocationId", "productId", "status", "expiryDate")'
      );
    }
  })().catch((error) => {
    inventoryExpirySchemaReady = null;
    throw error;
  });

  return inventoryExpirySchemaReady;
}
