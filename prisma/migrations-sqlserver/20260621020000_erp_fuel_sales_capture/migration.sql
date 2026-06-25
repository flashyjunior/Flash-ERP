IF OBJECT_ID(N'[dbo].[ErpFuelSale]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelSale] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [sourceOperatingSiteId] NVARCHAR(1000) NOT NULL,
        [customerId] NVARCHAR(1000) NULL,
        [stationId] NVARCHAR(1000) NULL,
        [linkedStationDeliveryId] NVARCHAR(1000) NULL,
        [paymentCashbookAccountId] NVARCHAR(1000) NULL,
        [saleNo] NVARCHAR(1000) NOT NULL,
        [loadingDate] DATETIME2 NOT NULL,
        [dispatchDate] DATETIME2 NULL,
        [serviceType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelSale_serviceType_df] DEFAULT N'COMBO',
        [customerName] NVARCHAR(1000) NOT NULL,
        [paymentReceivedAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelSale_paymentReceivedAmount_df] DEFAULT 0,
        [balanceAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelSale_balanceAmount_df] DEFAULT 0,
        [paymentDate] DATETIME2 NULL,
        [paymentReference] NVARCHAR(1000) NULL,
        [paymentDetails] NVARCHAR(max) NULL,
        [truckLoaded] NVARCHAR(1000) NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [totalQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelSale_totalQuantity_df] DEFAULT 0,
        [totalAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelSale_totalAmount_df] DEFAULT 0,
        [paymentStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelSale_paymentStatus_df] DEFAULT N'UNPAID',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelSale_status_df] DEFAULT N'POSTED',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelSale_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelSale_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelSale_companyId_saleNo_key] UNIQUE NONCLUSTERED ([companyId], [saleNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelSaleLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelSaleLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fuelSaleId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NOT NULL,
        [productCodeSnapshot] NVARCHAR(1000) NOT NULL,
        [productNameSnapshot] NVARCHAR(1000) NOT NULL,
        [quantity] DECIMAL(18, 3) NOT NULL,
        [unitPrice] DECIMAL(18, 4) NOT NULL,
        [lineAmount] DECIMAL(18, 2) NOT NULL,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelSaleLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelSaleLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_companyId_loadingDate_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_companyId_loadingDate_idx] ON [dbo].[ErpFuelSale]([companyId], [loadingDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_sourceOperatingSiteId_loadingDate_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_sourceOperatingSiteId_loadingDate_idx] ON [dbo].[ErpFuelSale]([sourceOperatingSiteId], [loadingDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_customerId_paymentStatus_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_customerId_paymentStatus_idx] ON [dbo].[ErpFuelSale]([customerId], [paymentStatus]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_stationId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_stationId_idx] ON [dbo].[ErpFuelSale]([stationId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_linkedStationDeliveryId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_linkedStationDeliveryId_idx] ON [dbo].[ErpFuelSale]([linkedStationDeliveryId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_paymentCashbookAccountId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_paymentCashbookAccountId_idx] ON [dbo].[ErpFuelSale]([paymentCashbookAccountId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSale_retailOrgId_status_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSale]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSale_retailOrgId_status_idx] ON [dbo].[ErpFuelSale]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSaleLine_fuelSaleId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSaleLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSaleLine_fuelSaleId_idx] ON [dbo].[ErpFuelSaleLine]([fuelSaleId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSaleLine_productProfileId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSaleLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSaleLine_productProfileId_idx] ON [dbo].[ErpFuelSaleLine]([productProfileId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSaleLine_companyId_productProfileId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSaleLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSaleLine_companyId_productProfileId_idx] ON [dbo].[ErpFuelSaleLine]([companyId], [productProfileId]);
END;
