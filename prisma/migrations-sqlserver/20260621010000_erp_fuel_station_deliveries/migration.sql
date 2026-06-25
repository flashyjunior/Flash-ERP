IF OBJECT_ID(N'[dbo].[ErpFuelStation]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelStation] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [customerId] NVARCHAR(1000) NULL,
        [operatingSiteId] NVARCHAR(1000) NULL,
        [stationCode] NVARCHAR(1000) NOT NULL,
        [stationName] NVARCHAR(1000) NOT NULL,
        [stationType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelStation_stationType_df] DEFAULT N'CUSTOMER',
        [location] NVARCHAR(1000) NULL,
        [city] NVARCHAR(1000) NULL,
        [contactName] NVARCHAR(1000) NULL,
        [phone] NVARCHAR(1000) NULL,
        [paymentTermsCode] NVARCHAR(1000) NULL,
        [creditLimitAmount] DECIMAL(18, 2) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelStation_status_df] DEFAULT N'ACTIVE',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelStation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelStation_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelStation_companyId_stationCode_key] UNIQUE NONCLUSTERED ([companyId], [stationCode])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelStationDelivery]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelStationDelivery] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [stationId] NVARCHAR(1000) NOT NULL,
        [customerId] NVARCHAR(1000) NULL,
        [sourceOperatingSiteId] NVARCHAR(1000) NULL,
        [deliveryNo] NVARCHAR(1000) NOT NULL,
        [deliveryDate] DATETIME2 NOT NULL,
        [requestedDeliveryDate] DATETIME2 NULL,
        [dueDate] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelStationDelivery_status_df] DEFAULT N'POSTED',
        [invoiceStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelStationDelivery_invoiceStatus_df] DEFAULT N'NOT_INVOICED',
        [paymentMode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelStationDelivery_paymentMode_df] DEFAULT N'CREDIT',
        [paymentStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelStationDelivery_paymentStatus_df] DEFAULT N'UNPAID',
        [paymentReference] NVARCHAR(1000) NULL,
        [paymentReceivedAt] DATETIME2 NULL,
        [financeDocumentId] NVARCHAR(1000) NULL,
        [customerReference] NVARCHAR(1000) NULL,
        [deliveryNoteNo] NVARCHAR(1000) NULL,
        [transporterName] NVARCHAR(1000) NULL,
        [vehicleRegistrationNo] NVARCHAR(1000) NULL,
        [driverName] NVARCHAR(1000) NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [totalOrderedQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelStationDelivery_totalOrderedQuantity_df] DEFAULT 0,
        [totalLoadedQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelStationDelivery_totalLoadedQuantity_df] DEFAULT 0,
        [totalDeliveredQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelStationDelivery_totalDeliveredQuantity_df] DEFAULT 0,
        [totalVarianceQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelStationDelivery_totalVarianceQuantity_df] DEFAULT 0,
        [totalSalesAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDelivery_totalSalesAmount_df] DEFAULT 0,
        [totalCostAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDelivery_totalCostAmount_df] DEFAULT 0,
        [marginAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDelivery_marginAmount_df] DEFAULT 0,
        [amountReceived] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDelivery_amountReceived_df] DEFAULT 0,
        [outstandingAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDelivery_outstandingAmount_df] DEFAULT 0,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelStationDelivery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelStationDelivery_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelStationDelivery_companyId_deliveryNo_key] UNIQUE NONCLUSTERED ([companyId], [deliveryNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelStationDeliveryLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelStationDeliveryLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [stationDeliveryId] NVARCHAR(1000) NOT NULL,
        [sourceTankId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [orderedQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_orderedQuantity_df] DEFAULT 0,
        [loadedQuantity] DECIMAL(18, 3) NOT NULL,
        [deliveredQuantity] DECIMAL(18, 3) NOT NULL,
        [varianceQuantity] DECIMAL(18, 3) NOT NULL,
        [unitSellingPrice] DECIMAL(18, 4) NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_unitSellingPrice_df] DEFAULT 0,
        [salesAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_salesAmount_df] DEFAULT 0,
        [unitCost] DECIMAL(18, 4) NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_unitCost_df] DEFAULT 0,
        [costAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_costAmount_df] DEFAULT 0,
        [marginAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_marginAmount_df] DEFAULT 0,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelStationDeliveryLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelStationDeliveryLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF COL_LENGTH(N'[dbo].[ErpFuelDailyReconciliation]', N'totalStationDeliveryQuantity') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelDailyReconciliation] ADD [totalStationDeliveryQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalStationDeliveryQuantity_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelReconciliationLine]', N'stationDeliveryQuantity') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelReconciliationLine] ADD [stationDeliveryQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_stationDeliveryQuantity_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelReconciliationLine]', N'stationDeliverySalesAmount') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelReconciliationLine] ADD [stationDeliverySalesAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_stationDeliverySalesAmount_df] DEFAULT 0;
END;

IF COL_LENGTH(N'[dbo].[ErpFuelReconciliationLine]', N'stationDeliveryCostAmount') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelReconciliationLine] ADD [stationDeliveryCostAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_stationDeliveryCostAmount_df] DEFAULT 0;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStation_retailOrgId_status_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStation_retailOrgId_status_idx] ON [dbo].[ErpFuelStation]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStation_customerId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStation_customerId_idx] ON [dbo].[ErpFuelStation]([customerId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStation_operatingSiteId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStation_operatingSiteId_idx] ON [dbo].[ErpFuelStation]([operatingSiteId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDelivery_companyId_deliveryDate_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDelivery_companyId_deliveryDate_idx] ON [dbo].[ErpFuelStationDelivery]([companyId], [deliveryDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDelivery_stationId_deliveryDate_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDelivery_stationId_deliveryDate_idx] ON [dbo].[ErpFuelStationDelivery]([stationId], [deliveryDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDelivery_customerId_paymentStatus_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDelivery_customerId_paymentStatus_idx] ON [dbo].[ErpFuelStationDelivery]([customerId], [paymentStatus]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDelivery_retailOrgId_status_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDelivery_retailOrgId_status_idx] ON [dbo].[ErpFuelStationDelivery]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDeliveryLine_stationDeliveryId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDeliveryLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDeliveryLine_stationDeliveryId_idx] ON [dbo].[ErpFuelStationDeliveryLine]([stationDeliveryId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDeliveryLine_sourceTankId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDeliveryLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDeliveryLine_sourceTankId_idx] ON [dbo].[ErpFuelStationDeliveryLine]([sourceTankId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelStationDeliveryLine_productProfileId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelStationDeliveryLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelStationDeliveryLine_productProfileId_idx] ON [dbo].[ErpFuelStationDeliveryLine]([productProfileId]);
END;
