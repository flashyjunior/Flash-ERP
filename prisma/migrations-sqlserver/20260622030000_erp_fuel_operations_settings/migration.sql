IF OBJECT_ID(N'[dbo].[ErpFuelOperationsSettings]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelOperationsSettings] (
        [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelOperationsSettings_id_df] DEFAULT NEWID(),
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [defaultSaleSourceSiteId] NVARCHAR(1000) NULL,
        [defaultDispatchSiteId] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFuelOperationsSettings_status_df] DEFAULT N'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelOperationsSettings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelOperationsSettings_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFuelOperationsSettings_companyId_key] UNIQUE NONCLUSTERED ([companyId])
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ErpFuelOperationsSettings_retailOrgId_status_idx'
      AND object_id = OBJECT_ID(N'[dbo].[ErpFuelOperationsSettings]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelOperationsSettings_retailOrgId_status_idx]
    ON [dbo].[ErpFuelOperationsSettings] ([retailOrgId], [status]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ErpFuelOperationsSettings_defaultSaleSourceSiteId_idx'
      AND object_id = OBJECT_ID(N'[dbo].[ErpFuelOperationsSettings]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelOperationsSettings_defaultSaleSourceSiteId_idx]
    ON [dbo].[ErpFuelOperationsSettings] ([defaultSaleSourceSiteId]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ErpFuelOperationsSettings_defaultDispatchSiteId_idx'
      AND object_id = OBJECT_ID(N'[dbo].[ErpFuelOperationsSettings]')
)
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelOperationsSettings_defaultDispatchSiteId_idx]
    ON [dbo].[ErpFuelOperationsSettings] ([defaultDispatchSiteId]);
END;
