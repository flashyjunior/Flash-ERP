IF COL_LENGTH(N'[dbo].[ErpOperationalDocumentLine]', N'taxCodeId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpOperationalDocumentLine] ADD [taxCodeId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpOperationalDocumentLine]', N'taxCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpOperationalDocumentLine] ADD [taxCode] NVARCHAR(1000) NULL;
END

IF OBJECT_ID(N'[dbo].[ErpTaxRegistration]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpTaxRegistration] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [registrationNo] NVARCHAR(1000) NULL,
        [authorityName] NVARCHAR(1000) NULL,
        [countryCode] NVARCHAR(1000) NULL,
        [taxCurrencyCode] NVARCHAR(1000) NOT NULL,
        [defaultInputTaxAccountCode] NVARCHAR(1000) NULL,
        [defaultOutputTaxAccountCode] NVARCHAR(1000) NULL,
        [taxPayableAccountCode] NVARCHAR(1000) NULL,
        [taxReceivableAccountCode] NVARCHAR(1000) NULL,
        [filingFrequency] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxRegistration_filingFrequency_df] DEFAULT 'MONTHLY',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxRegistration_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTaxRegistration_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpTaxRegistration_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpTaxRegistration_companyId_key] UNIQUE NONCLUSTERED ([companyId])
    );
END

IF OBJECT_ID(N'[dbo].[ErpTaxCode]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpTaxCode] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [taxType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxCode_taxType_df] DEFAULT 'VAT',
        [calculationMode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxCode_calculationMode_df] DEFAULT 'PERCENTAGE',
        [ratePercent] DECIMAL(9,4) NOT NULL CONSTRAINT [ErpTaxCode_ratePercent_df] DEFAULT 0,
        [recoverablePercent] DECIMAL(9,4) NOT NULL CONSTRAINT [ErpTaxCode_recoverablePercent_df] DEFAULT 100,
        [inputTaxAccountCode] NVARCHAR(1000) NULL,
        [outputTaxAccountCode] NVARCHAR(1000) NULL,
        [payableAccountCode] NVARCHAR(1000) NULL,
        [receivableAccountCode] NVARCHAR(1000) NULL,
        [effectiveFrom] DATETIME2 NULL,
        [effectiveTo] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxCode_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTaxCode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpTaxCode_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpTaxCode_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpTaxGroup]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpTaxGroup] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxGroup_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTaxGroup_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpTaxGroup_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpTaxGroup_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpTaxGroupLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpTaxGroupLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [taxGroupId] NVARCHAR(1000) NOT NULL,
        [taxCodeId] NVARCHAR(1000) NOT NULL,
        [lineNo] INT NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxGroupLine_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTaxGroupLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpTaxGroupLine_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpTaxGroupLine_taxGroupId_taxCodeId_key] UNIQUE NONCLUSTERED ([taxGroupId], [taxCodeId])
    );
END

IF OBJECT_ID(N'[dbo].[ErpTaxTransaction]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpTaxTransaction] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [taxCodeId] NVARCHAR(1000) NULL,
        [documentLineId] NVARCHAR(1000) NULL,
        [partyProfileId] NVARCHAR(1000) NULL,
        [journalEntryId] NVARCHAR(1000) NULL,
        [sourceType] NVARCHAR(1000) NOT NULL,
        [sourceId] NVARCHAR(1000) NOT NULL,
        [sourceReference] NVARCHAR(1000) NULL,
        [transactionDate] DATETIME2 NOT NULL,
        [postingDate] DATETIME2 NOT NULL,
        [taxDirection] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxTransaction_taxDirection_df] DEFAULT 'OUTPUT',
        [taxableAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTaxTransaction_taxableAmount_df] DEFAULT 0,
        [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTaxTransaction_taxAmount_df] DEFAULT 0,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [taxAccountCode] NVARCHAR(1000) NOT NULL,
        [memo] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTaxTransaction_status_df] DEFAULT 'POSTED',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTaxTransaction_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpTaxTransaction_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocumentLine_taxCodeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocumentLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocumentLine_taxCodeId_idx] ON [dbo].[ErpOperationalDocumentLine]([taxCodeId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxRegistration_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxRegistration]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxRegistration_retailOrgId_status_idx] ON [dbo].[ErpTaxRegistration]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxCode_retailOrgId_taxType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxCode]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxCode_retailOrgId_taxType_status_idx] ON [dbo].[ErpTaxCode]([retailOrgId], [taxType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxCode_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxCode]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxCode_companyId_status_idx] ON [dbo].[ErpTaxCode]([companyId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxGroup_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxGroup]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxGroup_retailOrgId_status_idx] ON [dbo].[ErpTaxGroup]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxGroupLine_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxGroupLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxGroupLine_companyId_status_idx] ON [dbo].[ErpTaxGroupLine]([companyId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxGroupLine_taxCodeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxGroupLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxGroupLine_taxCodeId_idx] ON [dbo].[ErpTaxGroupLine]([taxCodeId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxGroupLine_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxGroupLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxGroupLine_retailOrgId_status_idx] ON [dbo].[ErpTaxGroupLine]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxTransaction_companyId_taxDirection_postingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxTransaction_companyId_taxDirection_postingDate_idx] ON [dbo].[ErpTaxTransaction]([companyId], [taxDirection], [postingDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxTransaction_retailOrgId_sourceType_sourceId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxTransaction_retailOrgId_sourceType_sourceId_idx] ON [dbo].[ErpTaxTransaction]([retailOrgId], [sourceType], [sourceId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxTransaction_taxCodeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxTransaction_taxCodeId_idx] ON [dbo].[ErpTaxTransaction]([taxCodeId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxTransaction_documentLineId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxTransaction_documentLineId_idx] ON [dbo].[ErpTaxTransaction]([documentLineId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxTransaction_partyProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxTransaction_partyProfileId_idx] ON [dbo].[ErpTaxTransaction]([partyProfileId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpTaxTransaction_journalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpTaxTransaction]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpTaxTransaction_journalEntryId_idx] ON [dbo].[ErpTaxTransaction]([journalEntryId]);
END
