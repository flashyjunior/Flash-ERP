IF OBJECT_ID(N'[dbo].[ErpFuelTank]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelTank] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [operatingSiteId] NVARCHAR(1000) NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [tankType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelTank_tankType_df] DEFAULT N'UNDERGROUND',
        [capacityQuantity] DECIMAL(18, 3) NOT NULL,
        [safeCapacityQuantity] DECIMAL(18, 3) NULL,
        [reorderLevelQuantity] DECIMAL(18, 3) NULL,
        [uomCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelTank_uomCode_df] DEFAULT N'LTR',
        [openingQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelTank_openingQuantity_df] DEFAULT 0,
        [currentBookQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelTank_currentBookQuantity_df] DEFAULT 0,
        [lastDipAt] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelTank_status_df] DEFAULT N'ACTIVE',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelTank_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelTank_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelTank_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelPump]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelPump] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [operatingSiteId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [pumpType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelPump_pumpType_df] DEFAULT N'DISPENSER',
        [manufacturer] NVARCHAR(1000) NULL,
        [serialNo] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelPump_status_df] DEFAULT N'ACTIVE',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelPump_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelPump_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelPump_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelNozzle]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelNozzle] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [pumpId] NVARCHAR(1000) NOT NULL,
        [tankId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [meterUomCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelNozzle_meterUomCode_df] DEFAULT N'LTR',
        [openingMeterReading] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelNozzle_openingMeterReading_df] DEFAULT 0,
        [currentMeterReading] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelNozzle_currentMeterReading_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelNozzle_status_df] DEFAULT N'ACTIVE',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelNozzle_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelNozzle_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelNozzle_pumpId_code_key] UNIQUE NONCLUSTERED ([pumpId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelTankDip]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelTankDip] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [tankId] NVARCHAR(1000) NOT NULL,
        [dipReference] NVARCHAR(1000) NULL,
        [dipDate] DATETIME2 NOT NULL,
        [dipQuantity] DECIMAL(18, 3) NOT NULL,
        [waterQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelTankDip_waterQuantity_df] DEFAULT 0,
        [temperatureReading] DECIMAL(18, 3) NULL,
        [bookQuantity] DECIMAL(18, 3) NOT NULL,
        [varianceQuantity] DECIMAL(18, 3) NOT NULL,
        [recordedBy] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelTankDip_status_df] DEFAULT N'POSTED',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelTankDip_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelTankDip_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelMeterReading]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelMeterReading] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [nozzleId] NVARCHAR(1000) NOT NULL,
        [tankId] NVARCHAR(1000) NOT NULL,
        [readingDate] DATETIME2 NOT NULL,
        [shiftReference] NVARCHAR(1000) NULL,
        [openingMeterReading] DECIMAL(18, 3) NOT NULL,
        [closingMeterReading] DECIMAL(18, 3) NOT NULL,
        [salesQuantity] DECIMAL(18, 3) NOT NULL,
        [adjustmentQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelMeterReading_adjustmentQuantity_df] DEFAULT 0,
        [unitSellingPrice] DECIMAL(18, 4) NOT NULL CONSTRAINT [ErpFuelMeterReading_unitSellingPrice_df] DEFAULT 0,
        [salesAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelMeterReading_salesAmount_df] DEFAULT 0,
        [recordedBy] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelMeterReading_status_df] DEFAULT N'POSTED',
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelMeterReading_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelMeterReading_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelDelivery]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelDelivery] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [operatingSiteId] NVARCHAR(1000) NULL,
        [deliveryNo] NVARCHAR(1000) NOT NULL,
        [supplierName] NVARCHAR(1000) NULL,
        [supplierDocumentNo] NVARCHAR(1000) NULL,
        [transporterName] NVARCHAR(1000) NULL,
        [vehicleRegistrationNo] NVARCHAR(1000) NULL,
        [deliveryDate] DATETIME2 NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelDelivery_status_df] DEFAULT N'POSTED',
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [totalOrderedQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDelivery_totalOrderedQuantity_df] DEFAULT 0,
        [totalDeliveredQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDelivery_totalDeliveredQuantity_df] DEFAULT 0,
        [totalAcceptedQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDelivery_totalAcceptedQuantity_df] DEFAULT 0,
        [totalVarianceQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDelivery_totalVarianceQuantity_df] DEFAULT 0,
        [totalCostAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelDelivery_totalCostAmount_df] DEFAULT 0,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelDelivery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelDelivery_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelDelivery_companyId_deliveryNo_key] UNIQUE NONCLUSTERED ([companyId], [deliveryNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelDeliveryLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelDeliveryLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [deliveryId] NVARCHAR(1000) NOT NULL,
        [tankId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [orderedQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDeliveryLine_orderedQuantity_df] DEFAULT 0,
        [deliveredQuantity] DECIMAL(18, 3) NOT NULL,
        [acceptedQuantity] DECIMAL(18, 3) NOT NULL,
        [varianceQuantity] DECIMAL(18, 3) NOT NULL,
        [unitCost] DECIMAL(18, 4) NOT NULL CONSTRAINT [ErpFuelDeliveryLine_unitCost_df] DEFAULT 0,
        [lineCostAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelDeliveryLine_lineCostAmount_df] DEFAULT 0,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelDeliveryLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelDeliveryLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelDailyReconciliation]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelDailyReconciliation] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [operatingSiteId] NVARCHAR(1000) NULL,
        [reconciliationNo] NVARCHAR(1000) NOT NULL,
        [reconciliationDate] DATETIME2 NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_status_df] DEFAULT N'POSTED',
        [totalOpeningQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalOpeningQuantity_df] DEFAULT 0,
        [totalDeliveredQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalDeliveredQuantity_df] DEFAULT 0,
        [totalMeterSalesQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalMeterSalesQuantity_df] DEFAULT 0,
        [totalBookClosingQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalBookClosingQuantity_df] DEFAULT 0,
        [totalDipClosingQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalDipClosingQuantity_df] DEFAULT 0,
        [totalGainLossQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalGainLossQuantity_df] DEFAULT 0,
        [totalSalesAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalSalesAmount_df] DEFAULT 0,
        [totalCostAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_totalCostAmount_df] DEFAULT 0,
        [marginAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_marginAmount_df] DEFAULT 0,
        [marginPercent] DECIMAL(9, 4) NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_marginPercent_df] DEFAULT 0,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelDailyReconciliation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelDailyReconciliation_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelDailyReconciliation_companyId_reconciliationNo_key] UNIQUE NONCLUSTERED ([companyId], [reconciliationNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpFuelReconciliationLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelReconciliationLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [reconciliationId] NVARCHAR(1000) NOT NULL,
        [tankId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [openingQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_openingQuantity_df] DEFAULT 0,
        [deliveredQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_deliveredQuantity_df] DEFAULT 0,
        [meterSalesQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_meterSalesQuantity_df] DEFAULT 0,
        [bookClosingQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_bookClosingQuantity_df] DEFAULT 0,
        [dipClosingQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_dipClosingQuantity_df] DEFAULT 0,
        [gainLossQuantity] DECIMAL(18, 3) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_gainLossQuantity_df] DEFAULT 0,
        [averageCostRate] DECIMAL(18, 4) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_averageCostRate_df] DEFAULT 0,
        [salesAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_salesAmount_df] DEFAULT 0,
        [costAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_costAmount_df] DEFAULT 0,
        [marginAmount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_marginAmount_df] DEFAULT 0,
        [marginPercent] DECIMAL(9, 4) NOT NULL CONSTRAINT [ErpFuelReconciliationLine_marginPercent_df] DEFAULT 0,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelReconciliationLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelReconciliationLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelTank_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelTank]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelTank_retailOrgId_status_idx] ON [dbo].[ErpFuelTank]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelTank_operatingSiteId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelTank]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelTank_operatingSiteId_status_idx] ON [dbo].[ErpFuelTank]([operatingSiteId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelTank_productProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelTank]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelTank_productProfileId_idx] ON [dbo].[ErpFuelTank]([productProfileId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelPump_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelPump]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelPump_retailOrgId_status_idx] ON [dbo].[ErpFuelPump]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelPump_operatingSiteId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelPump]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelPump_operatingSiteId_status_idx] ON [dbo].[ErpFuelPump]([operatingSiteId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelNozzle_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelNozzle]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelNozzle_companyId_status_idx] ON [dbo].[ErpFuelNozzle]([companyId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelNozzle_tankId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelNozzle]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelNozzle_tankId_status_idx] ON [dbo].[ErpFuelNozzle]([tankId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelNozzle_productProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelNozzle]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelNozzle_productProfileId_idx] ON [dbo].[ErpFuelNozzle]([productProfileId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelTankDip_companyId_dipDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelTankDip]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelTankDip_companyId_dipDate_idx] ON [dbo].[ErpFuelTankDip]([companyId], [dipDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelTankDip_tankId_dipDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelTankDip]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelTankDip_tankId_dipDate_idx] ON [dbo].[ErpFuelTankDip]([tankId], [dipDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelTankDip_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelTankDip]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelTankDip_retailOrgId_status_idx] ON [dbo].[ErpFuelTankDip]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelMeterReading_companyId_readingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelMeterReading]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelMeterReading_companyId_readingDate_idx] ON [dbo].[ErpFuelMeterReading]([companyId], [readingDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelMeterReading_nozzleId_readingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelMeterReading]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelMeterReading_nozzleId_readingDate_idx] ON [dbo].[ErpFuelMeterReading]([nozzleId], [readingDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelMeterReading_tankId_readingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelMeterReading]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelMeterReading_tankId_readingDate_idx] ON [dbo].[ErpFuelMeterReading]([tankId], [readingDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelMeterReading_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelMeterReading]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelMeterReading_retailOrgId_status_idx] ON [dbo].[ErpFuelMeterReading]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDelivery_companyId_deliveryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDelivery_companyId_deliveryDate_idx] ON [dbo].[ErpFuelDelivery]([companyId], [deliveryDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDelivery_operatingSiteId_deliveryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDelivery_operatingSiteId_deliveryDate_idx] ON [dbo].[ErpFuelDelivery]([operatingSiteId], [deliveryDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDelivery_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDelivery]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDelivery_retailOrgId_status_idx] ON [dbo].[ErpFuelDelivery]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDeliveryLine_deliveryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDeliveryLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDeliveryLine_deliveryId_idx] ON [dbo].[ErpFuelDeliveryLine]([deliveryId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDeliveryLine_tankId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDeliveryLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDeliveryLine_tankId_idx] ON [dbo].[ErpFuelDeliveryLine]([tankId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDeliveryLine_productProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDeliveryLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDeliveryLine_productProfileId_idx] ON [dbo].[ErpFuelDeliveryLine]([productProfileId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDailyReconciliation_companyId_operatingSiteId_reconciliationDate_key' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDailyReconciliation]'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [ErpFuelDailyReconciliation_companyId_operatingSiteId_reconciliationDate_key]
    ON [dbo].[ErpFuelDailyReconciliation]([companyId], [operatingSiteId], [reconciliationDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDailyReconciliation_companyId_reconciliationDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDailyReconciliation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDailyReconciliation_companyId_reconciliationDate_idx] ON [dbo].[ErpFuelDailyReconciliation]([companyId], [reconciliationDate]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelDailyReconciliation_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelDailyReconciliation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelDailyReconciliation_retailOrgId_status_idx] ON [dbo].[ErpFuelDailyReconciliation]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelReconciliationLine_reconciliationId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelReconciliationLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelReconciliationLine_reconciliationId_idx] ON [dbo].[ErpFuelReconciliationLine]([reconciliationId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelReconciliationLine_tankId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelReconciliationLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelReconciliationLine_tankId_idx] ON [dbo].[ErpFuelReconciliationLine]([tankId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelReconciliationLine_productProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelReconciliationLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelReconciliationLine_productProfileId_idx] ON [dbo].[ErpFuelReconciliationLine]([productProfileId]);
END;
