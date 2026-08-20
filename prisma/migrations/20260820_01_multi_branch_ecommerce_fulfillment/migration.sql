IF COL_LENGTH(N'dbo.EcommerceOrder', N'storefrontStoreId') IS NULL
BEGIN
  ALTER TABLE [dbo].[EcommerceOrder]
    ADD [storefrontStoreId] NVARCHAR(1000) NULL;
END;

IF OBJECT_ID(N'[dbo].[EcommerceFulfillmentLocation]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceFulfillmentLocation] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storefrontStoreId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [EcommerceFulfillmentLocation_status_df] DEFAULT N'ACTIVE',
    [supportsPickup] BIT NOT NULL CONSTRAINT [EcommerceFulfillmentLocation_supportsPickup_df] DEFAULT 1,
    [supportsDelivery] BIT NOT NULL CONSTRAINT [EcommerceFulfillmentLocation_supportsDelivery_df] DEFAULT 1,
    [routingPriority] INT NOT NULL CONSTRAINT [EcommerceFulfillmentLocation_routingPriority_df] DEFAULT 100,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillmentLocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillmentLocation_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceFulfillmentLocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceFulfillmentLocation_storefrontStoreId_inventoryLocationId_key]
      UNIQUE NONCLUSTERED ([storefrontStoreId], [inventoryLocationId])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceFulfillment]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceFulfillment] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [ecommerceOrderId] NVARCHAR(1000) NOT NULL,
    [ecommerceFulfillmentLocationId] NVARCHAR(1000) NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [inventoryLocationId] NVARCHAR(1000) NULL,
    [salesOrderId] NVARCHAR(1000) NOT NULL,
    [sequenceNo] INT NOT NULL CONSTRAINT [EcommerceFulfillment_sequenceNo_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [EcommerceFulfillment_status_df] DEFAULT N'PLACED',
    [fulfilmentMethod] NVARCHAR(1000) NOT NULL,
    [routingMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [EcommerceFulfillment_routingMethod_df] DEFAULT N'PRIORITY_STOCK',
    [storeCodeSnapshot] NVARCHAR(1000) NOT NULL,
    [storeNameSnapshot] NVARCHAR(1000) NOT NULL,
    [inventoryLocationCodeSnapshot] NVARCHAR(1000) NULL,
    [inventoryLocationNameSnapshot] NVARCHAR(1000) NULL,
    [assignedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillment_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [fulfilledAt] DATETIME2(3) NULL,
    [cancelledAt] DATETIME2(3) NULL,
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillment_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceFulfillment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceFulfillment_salesOrderId_key] UNIQUE NONCLUSTERED ([salesOrderId]),
    CONSTRAINT [EcommerceFulfillment_ecommerceOrderId_sequenceNo_key]
      UNIQUE NONCLUSTERED ([ecommerceOrderId], [sequenceNo])
  );
END;

IF OBJECT_ID(N'[dbo].[EcommerceFulfillmentLine]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[EcommerceFulfillmentLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [ecommerceFulfillmentId] NVARCHAR(1000) NOT NULL,
    [salesOrderLineId] NVARCHAR(1000) NOT NULL,
    [productCodeSnapshot] NVARCHAR(1000) NOT NULL,
    [productVariantCodeSnapshot] NVARCHAR(1000) NULL,
    [productNameSnapshot] NVARCHAR(1000) NOT NULL,
    [sellingUnitOfMeasure] NVARCHAR(1000) NOT NULL,
    [baseUnitOfMeasure] NVARCHAR(1000) NOT NULL,
    [uomConversionFactor] DECIMAL(18, 6) NOT NULL,
    [quantity] DECIMAL(18, 3) NOT NULL,
    [baseQuantity] DECIMAL(18, 3) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [EcommerceFulfillmentLine_status_df] DEFAULT N'ALLOCATED',
    [createdAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillmentLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2(3) NOT NULL CONSTRAINT [EcommerceFulfillmentLine_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EcommerceFulfillmentLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EcommerceFulfillmentLine_salesOrderLineId_key] UNIQUE NONCLUSTERED ([salesOrderLineId])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceOrder_storefrontStoreId_status_updatedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceOrder]'))
  CREATE INDEX [EcommerceOrder_storefrontStoreId_status_updatedAt_idx] ON [dbo].[EcommerceOrder]([storefrontStoreId], [status], [updatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillmentLocation_retailOrgId_storefrontStoreId_status_routingPriority_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillmentLocation]'))
  CREATE INDEX [EcommerceFulfillmentLocation_retailOrgId_storefrontStoreId_status_routingPriority_idx] ON [dbo].[EcommerceFulfillmentLocation]([retailOrgId], [storefrontStoreId], [status], [routingPriority]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillmentLocation_storeId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillmentLocation]'))
  CREATE INDEX [EcommerceFulfillmentLocation_storeId_status_idx] ON [dbo].[EcommerceFulfillmentLocation]([storeId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillmentLocation_inventoryLocationId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillmentLocation]'))
  CREATE INDEX [EcommerceFulfillmentLocation_inventoryLocationId_idx] ON [dbo].[EcommerceFulfillmentLocation]([inventoryLocationId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillment_retailOrgId_storeId_status_updatedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillment]'))
  CREATE INDEX [EcommerceFulfillment_retailOrgId_storeId_status_updatedAt_idx] ON [dbo].[EcommerceFulfillment]([retailOrgId], [storeId], [status], [updatedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillment_ecommerceFulfillmentLocationId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillment]'))
  CREATE INDEX [EcommerceFulfillment_ecommerceFulfillmentLocationId_idx] ON [dbo].[EcommerceFulfillment]([ecommerceFulfillmentLocationId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillment_inventoryLocationId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillment]'))
  CREATE INDEX [EcommerceFulfillment_inventoryLocationId_idx] ON [dbo].[EcommerceFulfillment]([inventoryLocationId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillmentLine_ecommerceFulfillmentId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillmentLine]'))
  CREATE INDEX [EcommerceFulfillmentLine_ecommerceFulfillmentId_status_idx] ON [dbo].[EcommerceFulfillmentLine]([ecommerceFulfillmentId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'EcommerceFulfillmentLine_productCodeSnapshot_idx' AND [object_id] = OBJECT_ID(N'[dbo].[EcommerceFulfillmentLine]'))
  CREATE INDEX [EcommerceFulfillmentLine_productCodeSnapshot_idx] ON [dbo].[EcommerceFulfillmentLine]([productCodeSnapshot]);
