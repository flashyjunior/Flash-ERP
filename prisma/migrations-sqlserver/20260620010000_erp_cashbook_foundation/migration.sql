IF OBJECT_ID(N'[dbo].[ErpCashbookAccount]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpCashbookAccount] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [bankAccountId] NVARCHAR(1000) NULL,
        [glAccountId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [accountType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookAccount_accountType_df] DEFAULT 'CASH',
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [glAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookAccount_glAccountCode_df] DEFAULT '1000',
        [accountNumber] NVARCHAR(1000) NULL,
        [bankName] NVARCHAR(1000) NULL,
        [branchName] NVARCHAR(1000) NULL,
        [openingBalance] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpCashbookAccount_openingBalance_df] DEFAULT 0,
        [reconciliationEnabled] BIT NOT NULL CONSTRAINT [ErpCashbookAccount_reconciliationEnabled_df] DEFAULT 1,
        [isDefault] BIT NOT NULL CONSTRAINT [ErpCashbookAccount_isDefault_df] DEFAULT 0,
        [lastReconciledAt] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookAccount_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpCashbookAccount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpCashbookAccount_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpCashbookAccount_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpCashbookEntry]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpCashbookEntry] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [cashbookAccountId] NVARCHAR(1000) NOT NULL,
        [postingJournalEntryId] NVARCHAR(1000) NULL,
        [settlementAllocationId] NVARCHAR(1000) NULL,
        [entryNo] NVARCHAR(1000) NOT NULL,
        [entryType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookEntry_entryType_df] DEFAULT 'RECEIPT',
        [direction] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookEntry_direction_df] DEFAULT 'INFLOW',
        [entryDate] DATETIME2 NOT NULL,
        [postingDate] DATETIME2 NOT NULL,
        [valueDate] DATETIME2 NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [amount] DECIMAL(18,2) NOT NULL,
        [offsetAccountCode] NVARCHAR(1000) NOT NULL,
        [counterpartyName] NVARCHAR(1000) NULL,
        [externalReference] NVARCHAR(1000) NULL,
        [clearingReference] NVARCHAR(1000) NULL,
        [memo] NVARCHAR(max) NULL,
        [reconciliationStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookEntry_reconciliationStatus_df] DEFAULT 'UNRECONCILED',
        [clearedAt] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookEntry_status_df] DEFAULT 'DRAFT',
        [postedAt] DATETIME2 NULL,
        [postedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpCashbookEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpCashbookEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpCashbookEntry_retailOrgId_entryNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [entryNo])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookAccount_retailOrgId_accountType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookAccount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookAccount_retailOrgId_accountType_status_idx] ON [dbo].[ErpCashbookAccount]([retailOrgId], [accountType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookAccount_companyId_isDefault_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookAccount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookAccount_companyId_isDefault_idx] ON [dbo].[ErpCashbookAccount]([companyId], [isDefault]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookAccount_bankAccountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookAccount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookAccount_bankAccountId_idx] ON [dbo].[ErpCashbookAccount]([bankAccountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookAccount_glAccountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookAccount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookAccount_glAccountId_idx] ON [dbo].[ErpCashbookAccount]([glAccountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_companyId_entryType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_companyId_entryType_status_idx] ON [dbo].[ErpCashbookEntry]([companyId], [entryType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_cashbookAccountId_entryDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_cashbookAccountId_entryDate_idx] ON [dbo].[ErpCashbookEntry]([cashbookAccountId], [entryDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_postingJournalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_postingJournalEntryId_idx] ON [dbo].[ErpCashbookEntry]([postingJournalEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_settlementAllocationId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_settlementAllocationId_idx] ON [dbo].[ErpCashbookEntry]([settlementAllocationId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_retailOrgId_entryDate_reconciliationStatus_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_retailOrgId_entryDate_reconciliationStatus_idx] ON [dbo].[ErpCashbookEntry]([retailOrgId], [entryDate], [reconciliationStatus]);
END
