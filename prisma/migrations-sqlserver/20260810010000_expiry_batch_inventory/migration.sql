SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.Product', N'trackExpiry') IS NULL
BEGIN
  ALTER TABLE [dbo].[Product]
    ADD [trackExpiry] BIT NOT NULL
      CONSTRAINT [Product_trackExpiry_df] DEFAULT 0;
END;

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
    [quantityOnHand] DECIMAL(18, 3) NOT NULL
      CONSTRAINT [InventoryBatch_quantityOnHand_df] DEFAULT 0,
    [status] NVARCHAR(40) NOT NULL
      CONSTRAINT [InventoryBatch_status_df] DEFAULT N'ACTIVE',
    [sourceReferenceType] NVARCHAR(1000) NULL,
    [sourceReferenceId] NVARCHAR(1000) NULL,
    [sourceReferenceLabel] NVARCHAR(1000) NULL,
    [sourceNodeCode] NVARCHAR(1000) NULL,
    [lastOccurredAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL
      CONSTRAINT [InventoryBatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL
      CONSTRAINT [InventoryBatch_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InventoryBatch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryBatch_retailOrgId_inventoryLocationId_productId_batchNo_key]
      UNIQUE NONCLUSTERED ([retailOrgId], [inventoryLocationId], [productId], [batchNo])
  );
END;

-- Repair the table left by the first version of this migration. Enterprise IDs
-- use Prisma's SQL Server default NVARCHAR(1000); relations are enforced by
-- Prisma because the datasource uses relationMode = "prisma".
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
END;

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
  WHERE [name] = N'InventoryBatch_productId_expiryDate_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[InventoryBatch]')
)
  CREATE INDEX [InventoryBatch_productId_expiryDate_idx]
    ON [dbo].[InventoryBatch]([productId], [expiryDate]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'InventoryLedgerEntry_inventoryBatchId_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[InventoryLedgerEntry]')
)
  CREATE INDEX [InventoryLedgerEntry_inventoryBatchId_idx]
    ON [dbo].[InventoryLedgerEntry]([inventoryBatchId]);
