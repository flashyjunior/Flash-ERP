IF OBJECT_ID(N'[dbo].[ErpBankStatement]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpBankStatement] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [cashbookAccountId] NVARCHAR(1000) NOT NULL,
        [statementNo] NVARCHAR(1000) NOT NULL,
        [statementType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankStatement_statementType_df] DEFAULT 'BANK_STATEMENT',
        [statementDate] DATETIME2 NOT NULL,
        [fromDate] DATETIME2 NOT NULL,
        [toDate] DATETIME2 NOT NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [openingBalance] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBankStatement_openingBalance_df] DEFAULT 0,
        [closingBalance] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBankStatement_closingBalance_df] DEFAULT 0,
        [sourceType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankStatement_sourceType_df] DEFAULT 'MANUAL',
        [externalReference] NVARCHAR(1000) NULL,
        [memo] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankStatement_status_df] DEFAULT 'OPEN',
        [importedAt] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBankStatement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpBankStatement_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpBankStatement_retailOrgId_statementNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [statementNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpBankStatementLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpBankStatementLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [bankStatementId] NVARCHAR(1000) NOT NULL,
        [cashbookAccountId] NVARCHAR(1000) NOT NULL,
        [lineNo] INT NOT NULL,
        [transactionDate] DATETIME2 NOT NULL,
        [valueDate] DATETIME2 NULL,
        [direction] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankStatementLine_direction_df] DEFAULT 'INFLOW',
        [amount] DECIMAL(18,2) NOT NULL,
        [description] NVARCHAR(1000) NOT NULL,
        [reference] NVARCHAR(1000) NULL,
        [counterpartyName] NVARCHAR(1000) NULL,
        [matchStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankStatementLine_matchStatus_df] DEFAULT 'UNMATCHED',
        [ignoredReason] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankStatementLine_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBankStatementLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpBankStatementLine_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpBankStatementLine_bankStatementId_lineNo_key] UNIQUE NONCLUSTERED ([bankStatementId], [lineNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpBankReconciliationMatch] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [cashbookAccountId] NVARCHAR(1000) NOT NULL,
        [bankStatementId] NVARCHAR(1000) NOT NULL,
        [statementLineId] NVARCHAR(1000) NOT NULL,
        [cashbookEntryId] NVARCHAR(1000) NOT NULL,
        [matchedAmount] DECIMAL(18,2) NOT NULL,
        [matchType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankReconciliationMatch_matchType_df] DEFAULT 'MANUAL',
        [matchedBy] NVARCHAR(1000) NULL,
        [matchedAt] DATETIME2 NOT NULL CONSTRAINT [ErpBankReconciliationMatch_matchedAt_df] DEFAULT CURRENT_TIMESTAMP,
        [reversedAt] DATETIME2 NULL,
        [reversalReason] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBankReconciliationMatch_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBankReconciliationMatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpBankReconciliationMatch_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankStatement_companyId_status_statementDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankStatement]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankStatement_companyId_status_statementDate_idx] ON [dbo].[ErpBankStatement]([companyId], [status], [statementDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankStatement_cashbookAccountId_fromDate_toDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankStatement]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankStatement_cashbookAccountId_fromDate_toDate_idx] ON [dbo].[ErpBankStatement]([cashbookAccountId], [fromDate], [toDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankStatement_retailOrgId_sourceType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankStatement]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankStatement_retailOrgId_sourceType_status_idx] ON [dbo].[ErpBankStatement]([retailOrgId], [sourceType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankStatementLine_companyId_matchStatus_transactionDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankStatementLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankStatementLine_companyId_matchStatus_transactionDate_idx] ON [dbo].[ErpBankStatementLine]([companyId], [matchStatus], [transactionDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankStatementLine_cashbookAccountId_transactionDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankStatementLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankStatementLine_cashbookAccountId_transactionDate_idx] ON [dbo].[ErpBankStatementLine]([cashbookAccountId], [transactionDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankStatementLine_retailOrgId_reference_matchStatus_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankStatementLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankStatementLine_retailOrgId_reference_matchStatus_idx] ON [dbo].[ErpBankStatementLine]([retailOrgId], [reference], [matchStatus]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankReconciliationMatch_companyId_status_matchedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankReconciliationMatch_companyId_status_matchedAt_idx] ON [dbo].[ErpBankReconciliationMatch]([companyId], [status], [matchedAt]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankReconciliationMatch_cashbookAccountId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankReconciliationMatch_cashbookAccountId_status_idx] ON [dbo].[ErpBankReconciliationMatch]([cashbookAccountId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankReconciliationMatch_bankStatementId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankReconciliationMatch_bankStatementId_idx] ON [dbo].[ErpBankReconciliationMatch]([bankStatementId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankReconciliationMatch_statementLineId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankReconciliationMatch_statementLineId_idx] ON [dbo].[ErpBankReconciliationMatch]([statementLineId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankReconciliationMatch_cashbookEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankReconciliationMatch_cashbookEntryId_idx] ON [dbo].[ErpBankReconciliationMatch]([cashbookEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBankReconciliationMatch_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBankReconciliationMatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBankReconciliationMatch_retailOrgId_status_idx] ON [dbo].[ErpBankReconciliationMatch]([retailOrgId], [status]);
END
