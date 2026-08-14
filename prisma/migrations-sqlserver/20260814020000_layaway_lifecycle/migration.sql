IF COL_LENGTH(N'dbo.SalesOrder', N'orderType') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [orderType] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrder_orderType_df] DEFAULT N'SALES_ORDER';
IF COL_LENGTH(N'dbo.SalesOrder', N'paidAmount') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [paidAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [SalesOrder_paidAmount_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.SalesOrder', N'layawayPolicySnapshotJson') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [layawayPolicySnapshotJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.SalesOrder', N'minimumDepositAmount') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [minimumDepositAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [SalesOrder_minimumDepositAmount_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.SalesOrder', N'reservationStatus') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [reservationStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrder_reservationStatus_df] DEFAULT N'NOT_APPLICABLE';
IF COL_LENGTH(N'dbo.SalesOrder', N'reservationCreatedAt') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [reservationCreatedAt] DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.SalesOrder', N'reservationReleasedAt') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [reservationReleasedAt] DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.SalesOrder', N'layawayExpiresAt') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [layawayExpiresAt] DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.SalesOrder', N'expiredAt') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [expiredAt] DATETIME2(3) NULL;
IF COL_LENGTH(N'dbo.SalesOrder', N'cancellationFeeAmount') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [cancellationFeeAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [SalesOrder_cancellationFeeAmount_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.SalesOrder', N'refundedAmount') IS NULL
  ALTER TABLE [dbo].[SalesOrder] ADD [refundedAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [SalesOrder_refundedAmount_df] DEFAULT 0;

EXEC(N'
  UPDATE [dbo].[SalesOrder]
  SET [paidAmount] = [depositAmount]
  WHERE [paidAmount] = 0 AND [depositAmount] > 0;
');

IF OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[SalesOrderInventoryReservation] (
    [id] NVARCHAR(1000) NOT NULL,
    [salesOrderId] NVARCHAR(1000) NOT NULL,
    [salesOrderLineId] NVARCHAR(1000) NOT NULL,
    [inventoryLocationId] NVARCHAR(1000) NULL,
    [inventoryLocationCodeSnapshot] NVARCHAR(1000) NULL,
    [productCodeSnapshot] NVARCHAR(1000) NOT NULL,
    [productVariantCodeSnapshot] NVARCHAR(1000) NULL,
    [baseUnitOfMeasure] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrderInventoryReservation_baseUom_df] DEFAULT N'EA',
    [baseQuantity] DECIMAL(18, 3) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrderInventoryReservation_status_df] DEFAULT N'ACTIVE',
    [releaseReason] NVARCHAR(1000) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [SalesOrderInventoryReservation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [releasedAt] DATETIME2(3) NULL,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [SalesOrderInventoryReservation_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SalesOrderInventoryReservation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_key] UNIQUE NONCLUSTERED ([salesOrderId], [salesOrderLineId])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'SalesOrderInventoryReservation_salesOrderId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]'))
  CREATE INDEX [SalesOrderInventoryReservation_salesOrderId_status_idx] ON [dbo].[SalesOrderInventoryReservation]([salesOrderId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'SalesOrderInventoryReservation_inventoryLocationId_productCodeSnapshot_productVariantCodeSnapshot_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]'))
  CREATE INDEX [SalesOrderInventoryReservation_inventoryLocationId_productCodeSnapshot_productVariantCodeSnapshot_status_idx] ON [dbo].[SalesOrderInventoryReservation]([inventoryLocationId], [productCodeSnapshot], [productVariantCodeSnapshot], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'SalesOrderInventoryReservation_productCodeSnapshot_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[SalesOrderInventoryReservation]'))
  CREATE INDEX [SalesOrderInventoryReservation_productCodeSnapshot_status_idx] ON [dbo].[SalesOrderInventoryReservation]([productCodeSnapshot], [status]);
