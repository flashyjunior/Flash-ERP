BEGIN TRY

BEGIN TRAN;

IF COL_LENGTH(N'[dbo].[GlAccount]', N'companyId') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlAccount] ADD [companyId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlAccount]', N'accountGroup') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlAccount] ADD [accountGroup] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlAccount]', N'isControlAccount') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlAccount]
        ADD [isControlAccount] BIT NOT NULL
        CONSTRAINT [GlAccount_isControlAccount_df] DEFAULT 0;
END

IF COL_LENGTH(N'[dbo].[GlAccount]', N'allowManualPosting') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlAccount]
        ADD [allowManualPosting] BIT NOT NULL
        CONSTRAINT [GlAccount_allowManualPosting_df] DEFAULT 1;
END

IF COL_LENGTH(N'[dbo].[GlAccount]', N'sortOrder') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlAccount]
        ADD [sortOrder] INT NOT NULL
        CONSTRAINT [GlAccount_sortOrder_df] DEFAULT 0;
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'companyId') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry] ADD [companyId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'journalBatchId') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry] ADD [journalBatchId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'fiscalPeriodId') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry] ADD [fiscalPeriodId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'journalType') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry]
        ADD [journalType] NVARCHAR(1000) NOT NULL
        CONSTRAINT [GlJournalEntry_journalType_df] DEFAULT 'GENERAL';
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'reversalOfJournalEntryId') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry] ADD [reversalOfJournalEntryId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'postedBy') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry] ADD [postedBy] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[GlJournalEntry]', N'reversalReason') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalEntry] ADD [reversalReason] NVARCHAR(1000) NULL;
END

IF OBJECT_ID(N'[dbo].[ErpCompany]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpCompany] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [legalName] NVARCHAR(1000) NOT NULL,
        [tradingName] NVARCHAR(1000) NULL,
        [companyType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCompany_companyType_df] DEFAULT 'LEGAL_ENTITY',
        [registrationNo] NVARCHAR(1000) NULL,
        [taxRegistrationNo] NVARCHAR(1000) NULL,
        [baseCurrencyCode] NVARCHAR(1000) NOT NULL,
        [timezone] NVARCHAR(1000) NOT NULL,
        [phone] NVARCHAR(1000) NULL,
        [email] NVARCHAR(1000) NULL,
        [addressLine1] NVARCHAR(1000) NULL,
        [city] NVARCHAR(1000) NULL,
        [region] NVARCHAR(1000) NULL,
        [countryCode] NVARCHAR(1000) NULL,
        [isPrimary] BIT NOT NULL CONSTRAINT [ErpCompany_isPrimary_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCompany_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpCompany_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpCompany_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpCompany_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpCurrency]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpCurrency] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [symbol] NVARCHAR(1000) NULL,
        [decimalPlaces] INT NOT NULL CONSTRAINT [ErpCurrency_decimalPlaces_df] DEFAULT 2,
        [exchangeRateToBase] DECIMAL(18,6) NOT NULL CONSTRAINT [ErpCurrency_exchangeRateToBase_df] DEFAULT 1,
        [isBaseCurrency] BIT NOT NULL CONSTRAINT [ErpCurrency_isBaseCurrency_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCurrency_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpCurrency_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpCurrency_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpCurrency_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpFiscalYear]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFiscalYear] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [startsOn] DATETIME2 NOT NULL,
        [endsOn] DATETIME2 NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFiscalYear_status_df] DEFAULT 'OPEN',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFiscalYear_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFiscalYear_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFiscalYear_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpFiscalPeriod]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFiscalPeriod] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fiscalYearId] NVARCHAR(1000) NOT NULL,
        [periodNo] INT NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [startsOn] DATETIME2 NOT NULL,
        [endsOn] DATETIME2 NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFiscalPeriod_status_df] DEFAULT 'OPEN',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFiscalPeriod_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFiscalPeriod_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFiscalPeriod_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code]),
        CONSTRAINT [ErpFiscalPeriod_fiscalYearId_periodNo_key] UNIQUE NONCLUSTERED ([fiscalYearId], [periodNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpAccountingSettings]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpAccountingSettings] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [baseCurrencyCode] NVARCHAR(1000) NOT NULL,
        [fiscalYearStartMonth] INT NOT NULL CONSTRAINT [ErpAccountingSettings_fiscalYearStartMonth_df] DEFAULT 1,
        [journalNumberPrefix] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpAccountingSettings_journalNumberPrefix_df] DEFAULT 'GL',
        [nextJournalSequence] INT NOT NULL CONSTRAINT [ErpAccountingSettings_nextJournalSequence_df] DEFAULT 1,
        [retainedEarningsAccountCode] NVARCHAR(1000) NULL,
        [arControlAccountCode] NVARCHAR(1000) NULL,
        [apControlAccountCode] NVARCHAR(1000) NULL,
        [cashControlAccountCode] NVARCHAR(1000) NULL,
        [inventoryControlAccountCode] NVARCHAR(1000) NULL,
        [taxControlAccountCode] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpAccountingSettings_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpAccountingSettings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpAccountingSettings_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpAccountingSettings_companyId_key] UNIQUE NONCLUSTERED ([companyId])
    );
END

IF OBJECT_ID(N'[dbo].[ErpArApPostingProfile]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpArApPostingProfile] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [profileType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpArApPostingProfile_profileType_df] DEFAULT 'CUSTOMER',
        [description] NVARCHAR(1000) NULL,
        [receivablesControlAccountCode] NVARCHAR(1000) NULL,
        [payablesControlAccountCode] NVARCHAR(1000) NULL,
        [customerAdvanceAccountCode] NVARCHAR(1000) NULL,
        [supplierAdvanceAccountCode] NVARCHAR(1000) NULL,
        [withholdingTaxAccountCode] NVARCHAR(1000) NULL,
        [customerDiscountAccountCode] NVARCHAR(1000) NULL,
        [supplierDiscountAccountCode] NVARCHAR(1000) NULL,
        [writeOffAccountCode] NVARCHAR(1000) NULL,
        [exchangeGainAccountCode] NVARCHAR(1000) NULL,
        [exchangeLossAccountCode] NVARCHAR(1000) NULL,
        [isDefault] BIT NOT NULL CONSTRAINT [ErpArApPostingProfile_isDefault_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpArApPostingProfile_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpArApPostingProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpArApPostingProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpArApPostingProfile_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpPartyAccountingProfile]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPartyAccountingProfile] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [partyType] NVARCHAR(1000) NOT NULL,
        [partyNo] NVARCHAR(1000) NOT NULL,
        [partyName] NVARCHAR(1000) NOT NULL,
        [customerId] NVARCHAR(1000) NULL,
        [supplierId] NVARCHAR(1000) NULL,
        [postingProfileId] NVARCHAR(1000) NULL,
        [taxProfileId] NVARCHAR(1000) NULL,
        [creditTermsCode] NVARCHAR(1000) NULL,
        [paymentTermsCode] NVARCHAR(1000) NULL,
        [creditLimitAmount] DECIMAL(18,2) NULL,
        [creditStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPartyAccountingProfile_creditStatus_df] DEFAULT 'ACTIVE',
        [allowCredit] BIT NOT NULL CONSTRAINT [ErpPartyAccountingProfile_allowCredit_df] DEFAULT 0,
        [statementDeliveryMode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPartyAccountingProfile_statementDeliveryMode_df] DEFAULT 'EMAIL',
        [invoiceDeliveryMode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPartyAccountingProfile_invoiceDeliveryMode_df] DEFAULT 'EMAIL',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPartyAccountingProfile_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPartyAccountingProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPartyAccountingProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPartyAccountingProfile_companyId_partyType_partyNo_key] UNIQUE NONCLUSTERED ([companyId], [partyType], [partyNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpDocumentSequence]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpDocumentSequence] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fiscalYearId] NVARCHAR(1000) NOT NULL,
        [documentType] NVARCHAR(1000) NOT NULL,
        [prefix] NVARCHAR(1000) NOT NULL,
        [suffix] NVARCHAR(1000) NULL,
        [nextSequence] INT NOT NULL CONSTRAINT [ErpDocumentSequence_nextSequence_df] DEFAULT 1,
        [paddingLength] INT NOT NULL CONSTRAINT [ErpDocumentSequence_paddingLength_df] DEFAULT 6,
        [resetPolicy] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpDocumentSequence_resetPolicy_df] DEFAULT 'FISCAL_YEAR',
        [lastIssuedNo] NVARCHAR(1000) NULL,
        [lastIssuedAt] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpDocumentSequence_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpDocumentSequence_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpDocumentSequence_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpDocumentSequence_companyId_documentType_fiscalYearId_key] UNIQUE NONCLUSTERED ([companyId], [documentType], [fiscalYearId])
    );
END

IF OBJECT_ID(N'[dbo].[GlJournalBatch]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[GlJournalBatch] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NULL,
        [batchNo] NVARCHAR(1000) NOT NULL,
        [sourceType] NVARCHAR(1000) NOT NULL CONSTRAINT [GlJournalBatch_sourceType_df] DEFAULT 'MANUAL',
        [postingDate] DATETIME2 NOT NULL,
        [description] NVARCHAR(1000) NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [GlJournalBatch_status_df] DEFAULT 'DRAFT',
        [totalDebit] DECIMAL(18,2) NOT NULL CONSTRAINT [GlJournalBatch_totalDebit_df] DEFAULT 0,
        [totalCredit] DECIMAL(18,2) NOT NULL CONSTRAINT [GlJournalBatch_totalCredit_df] DEFAULT 0,
        [postedAt] DATETIME2 NULL,
        [reversedAt] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [GlJournalBatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [GlJournalBatch_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [GlJournalBatch_retailOrgId_batchNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [batchNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpProductProfile]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpProductProfile] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [productFamily] NVARCHAR(1000) NOT NULL,
        [variantName] NVARCHAR(1000) NULL,
        [defaultUomCode] NVARCHAR(1000) NOT NULL,
        [trackingMode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpProductProfile_trackingMode_df] DEFAULT 'QUANTITY',
        [attributesJson] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpProductProfile_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpProductProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpProductProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpProductProfile_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpOperatingSite]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpOperatingSite] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [siteType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpOperatingSite_siteType_df] DEFAULT 'LOCATION',
        [location] NVARCHAR(1000) NULL,
        [city] NVARCHAR(1000) NULL,
        [region] NVARCHAR(1000) NULL,
        [countryCode] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpOperatingSite_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpOperatingSite_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpOperatingSite_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpOperatingSite_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpStorageUnit]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpStorageUnit] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [operatingSiteId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [capacityQuantity] DECIMAL(18,3) NOT NULL CONSTRAINT [ErpStorageUnit_capacityQuantity_df] DEFAULT 0,
        [safeCapacityQuantity] DECIMAL(18,3) NULL,
        [uomCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpStorageUnit_uomCode_df] DEFAULT 'EA',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpStorageUnit_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpStorageUnit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpStorageUnit_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpStorageUnit_operatingSiteId_code_key] UNIQUE NONCLUSTERED ([operatingSiteId], [code])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlAccount_companyId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlAccount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlAccount_companyId_idx] ON [dbo].[GlAccount]([companyId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalEntry_companyId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalEntry_companyId_idx] ON [dbo].[GlJournalEntry]([companyId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalEntry_journalBatchId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalEntry_journalBatchId_idx] ON [dbo].[GlJournalEntry]([journalBatchId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalEntry_fiscalPeriodId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalEntry_fiscalPeriodId_idx] ON [dbo].[GlJournalEntry]([fiscalPeriodId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalEntry_reversalOfJournalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalEntry_reversalOfJournalEntryId_idx] ON [dbo].[GlJournalEntry]([reversalOfJournalEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCompany_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCompany]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCompany_retailOrgId_status_idx] ON [dbo].[ErpCompany]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCurrency_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCurrency]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCurrency_retailOrgId_status_idx] ON [dbo].[ErpCurrency]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFiscalYear_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFiscalYear]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFiscalYear_retailOrgId_status_idx] ON [dbo].[ErpFiscalYear]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFiscalPeriod_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFiscalPeriod]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFiscalPeriod_retailOrgId_status_idx] ON [dbo].[ErpFiscalPeriod]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpAccountingSettings_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpAccountingSettings]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpAccountingSettings_retailOrgId_status_idx] ON [dbo].[ErpAccountingSettings]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpArApPostingProfile_retailOrgId_profileType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpArApPostingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpArApPostingProfile_retailOrgId_profileType_status_idx] ON [dbo].[ErpArApPostingProfile]([retailOrgId], [profileType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpArApPostingProfile_companyId_profileType_isDefault_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpArApPostingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpArApPostingProfile_companyId_profileType_isDefault_idx] ON [dbo].[ErpArApPostingProfile]([companyId], [profileType], [isDefault]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPartyAccountingProfile_retailOrgId_partyType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPartyAccountingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPartyAccountingProfile_retailOrgId_partyType_status_idx] ON [dbo].[ErpPartyAccountingProfile]([retailOrgId], [partyType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPartyAccountingProfile_customerId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPartyAccountingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPartyAccountingProfile_customerId_idx] ON [dbo].[ErpPartyAccountingProfile]([customerId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPartyAccountingProfile_supplierId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPartyAccountingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPartyAccountingProfile_supplierId_idx] ON [dbo].[ErpPartyAccountingProfile]([supplierId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPartyAccountingProfile_postingProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPartyAccountingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPartyAccountingProfile_postingProfileId_idx] ON [dbo].[ErpPartyAccountingProfile]([postingProfileId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPartyAccountingProfile_taxProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPartyAccountingProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPartyAccountingProfile_taxProfileId_idx] ON [dbo].[ErpPartyAccountingProfile]([taxProfileId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpDocumentSequence_retailOrgId_documentType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpDocumentSequence]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpDocumentSequence_retailOrgId_documentType_status_idx] ON [dbo].[ErpDocumentSequence]([retailOrgId], [documentType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpDocumentSequence_fiscalYearId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpDocumentSequence]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpDocumentSequence_fiscalYearId_idx] ON [dbo].[ErpDocumentSequence]([fiscalYearId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalBatch_retailOrgId_status_postingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalBatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalBatch_retailOrgId_status_postingDate_idx] ON [dbo].[GlJournalBatch]([retailOrgId], [status], [postingDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalBatch_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalBatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalBatch_companyId_status_idx] ON [dbo].[GlJournalBatch]([companyId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpProductProfile_retailOrgId_productFamily_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpProductProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpProductProfile_retailOrgId_productFamily_status_idx] ON [dbo].[ErpProductProfile]([retailOrgId], [productFamily], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpProductProfile_companyId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpProductProfile]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpProductProfile_companyId_idx] ON [dbo].[ErpProductProfile]([companyId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperatingSite_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperatingSite]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperatingSite_retailOrgId_status_idx] ON [dbo].[ErpOperatingSite]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperatingSite_companyId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperatingSite]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperatingSite_companyId_idx] ON [dbo].[ErpOperatingSite]([companyId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpStorageUnit_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpStorageUnit]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpStorageUnit_retailOrgId_status_idx] ON [dbo].[ErpStorageUnit]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpStorageUnit_productProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpStorageUnit]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpStorageUnit_productProfileId_idx] ON [dbo].[ErpStorageUnit]([productProfileId]);
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
