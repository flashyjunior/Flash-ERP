IF OBJECT_ID(N'[dbo].[ErpFixedAssetClass]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFixedAssetClass] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(1000) NULL,
        [assetType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_assetType_df] DEFAULT 'TANGIBLE',
        [depreciationMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_depreciationMethod_df] DEFAULT 'STRAIGHT_LINE',
        [defaultUsefulLifeMonths] INT NOT NULL CONSTRAINT [ErpFixedAssetClass_defaultUsefulLifeMonths_df] DEFAULT 60,
        [defaultResidualValue] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetClass_defaultResidualValue_df] DEFAULT 0,
        [acquisitionAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_acquisitionAccountCode_df] DEFAULT '1500',
        [accumulatedDepreciationAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_accumulatedDepreciationAccountCode_df] DEFAULT '1590',
        [depreciationExpenseAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_depreciationExpenseAccountCode_df] DEFAULT '6100',
        [gainOnDisposalAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_gainOnDisposalAccountCode_df] DEFAULT '7010',
        [lossOnDisposalAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_lossOnDisposalAccountCode_df] DEFAULT '8010',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetClass_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFixedAssetClass_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFixedAssetClass_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFixedAssetClass_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpFixedAsset]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFixedAsset] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [assetClassId] NVARCHAR(1000) NOT NULL,
        [assetNo] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [serialNo] NVARCHAR(1000) NULL,
        [modelNo] NVARCHAR(1000) NULL,
        [manufacturer] NVARCHAR(1000) NULL,
        [locationCode] NVARCHAR(1000) NULL,
        [custodianName] NVARCHAR(1000) NULL,
        [acquisitionDate] DATETIME2 NOT NULL,
        [inServiceDate] DATETIME2 NULL,
        [depreciationStartDate] DATETIME2 NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [acquisitionCost] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAsset_acquisitionCost_df] DEFAULT 0,
        [residualValue] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAsset_residualValue_df] DEFAULT 0,
        [usefulLifeMonths] INT NOT NULL CONSTRAINT [ErpFixedAsset_usefulLifeMonths_df] DEFAULT 60,
        [depreciationMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAsset_depreciationMethod_df] DEFAULT 'STRAIGHT_LINE',
        [accumulatedDepreciation] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAsset_accumulatedDepreciation_df] DEFAULT 0,
        [netBookValue] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAsset_netBookValue_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAsset_status_df] DEFAULT 'ACTIVE',
        [retiredAt] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFixedAsset_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFixedAsset_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFixedAsset_companyId_assetNo_key] UNIQUE NONCLUSTERED ([companyId], [assetNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpFixedAssetBook]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFixedAssetBook] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fixedAssetId] NVARCHAR(1000) NOT NULL,
        [bookCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetBook_bookCode_df] DEFAULT 'COMPANY',
        [bookName] NVARCHAR(1000) NOT NULL,
        [depreciationMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetBook_depreciationMethod_df] DEFAULT 'STRAIGHT_LINE',
        [usefulLifeMonths] INT NOT NULL CONSTRAINT [ErpFixedAssetBook_usefulLifeMonths_df] DEFAULT 60,
        [residualValue] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetBook_residualValue_df] DEFAULT 0,
        [depreciationStartDate] DATETIME2 NULL,
        [lastDepreciationDate] DATETIME2 NULL,
        [accumulatedDepreciation] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetBook_accumulatedDepreciation_df] DEFAULT 0,
        [netBookValue] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetBook_netBookValue_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetBook_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFixedAssetBook_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFixedAssetBook_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFixedAssetBook_fixedAssetId_bookCode_key] UNIQUE NONCLUSTERED ([fixedAssetId], [bookCode])
    );
END

IF OBJECT_ID(N'[dbo].[ErpFixedAssetTransaction]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFixedAssetTransaction] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fixedAssetId] NVARCHAR(1000) NOT NULL,
        [journalEntryId] NVARCHAR(1000) NULL,
        [transactionNo] NVARCHAR(1000) NOT NULL,
        [transactionType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_transactionType_df] DEFAULT 'ACQUISITION',
        [transactionDate] DATETIME2 NOT NULL,
        [postingDate] DATETIME2 NOT NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [amount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_amount_df] DEFAULT 0,
        [accumulatedDepreciationAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_accumulatedDepreciationAmount_df] DEFAULT 0,
        [proceedsAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_proceedsAmount_df] DEFAULT 0,
        [sourceType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_sourceType_df] DEFAULT 'MANUAL',
        [sourceReference] NVARCHAR(1000) NULL,
        [memo] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFixedAssetTransaction_status_df] DEFAULT 'DRAFT',
        [postedAt] DATETIME2 NULL,
        [postedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFixedAssetTransaction_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFixedAssetTransaction_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFixedAssetTransaction_retailOrgId_transactionNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [transactionNo])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetClass_retailOrgId_assetType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetClass]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetClass_retailOrgId_assetType_status_idx] ON [dbo].[ErpFixedAssetClass]([retailOrgId], [assetType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetClass_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetClass]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetClass_companyId_status_idx] ON [dbo].[ErpFixedAssetClass]([companyId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAsset_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAsset]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAsset_retailOrgId_status_idx] ON [dbo].[ErpFixedAsset]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAsset_assetClassId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAsset]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAsset_assetClassId_idx] ON [dbo].[ErpFixedAsset]([assetClassId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAsset_companyId_acquisitionDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAsset]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAsset_companyId_acquisitionDate_idx] ON [dbo].[ErpFixedAsset]([companyId], [acquisitionDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAsset_companyId_locationCode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAsset]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAsset_companyId_locationCode_idx] ON [dbo].[ErpFixedAsset]([companyId], [locationCode]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetBook_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetBook]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetBook_companyId_status_idx] ON [dbo].[ErpFixedAssetBook]([companyId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetBook_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetBook]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetBook_retailOrgId_status_idx] ON [dbo].[ErpFixedAssetBook]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetTransaction_companyId_transactionType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetTransaction_companyId_transactionType_status_idx] ON [dbo].[ErpFixedAssetTransaction]([companyId], [transactionType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetTransaction_fixedAssetId_transactionDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetTransaction_fixedAssetId_transactionDate_idx] ON [dbo].[ErpFixedAssetTransaction]([fixedAssetId], [transactionDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetTransaction_journalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetTransaction_journalEntryId_idx] ON [dbo].[ErpFixedAssetTransaction]([journalEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFixedAssetTransaction_retailOrgId_postingDate_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFixedAssetTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFixedAssetTransaction_retailOrgId_postingDate_status_idx] ON [dbo].[ErpFixedAssetTransaction]([retailOrgId], [postingDate], [status]);
END
