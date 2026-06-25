IF OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplate]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpRecurringJournalTemplate] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [templateCode] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [frequency] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpRecurringJournalTemplate_frequency_df] DEFAULT 'MONTHLY',
        [startDate] DATETIME2 NOT NULL,
        [endDate] DATETIME2 NULL,
        [nextRunDate] DATETIME2 NOT NULL,
        [lastRunDate] DATETIME2 NULL,
        [lastGeneratedBatchNo] NVARCHAR(1000) NULL,
        [lastGeneratedAt] DATETIME2 NULL,
        [sourceReference] NVARCHAR(1000) NULL,
        [journalType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpRecurringJournalTemplate_journalType_df] DEFAULT 'RECURRING',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpRecurringJournalTemplate_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpRecurringJournalTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpRecurringJournalTemplate_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpRecurringJournalTemplate_companyId_templateCode_key] UNIQUE NONCLUSTERED ([companyId], [templateCode])
    );
END

IF OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplateLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpRecurringJournalTemplateLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [recurringJournalTemplateId] NVARCHAR(1000) NOT NULL,
        [accountId] NVARCHAR(1000) NULL,
        [lineNo] INT NOT NULL,
        [accountCode] NVARCHAR(1000) NOT NULL,
        [debitAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpRecurringJournalTemplateLine_debitAmount_df] DEFAULT 0,
        [creditAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpRecurringJournalTemplateLine_creditAmount_df] DEFAULT 0,
        [memo] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpRecurringJournalTemplateLine_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpRecurringJournalTemplateLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpRecurringJournalTemplateLine_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpRecurringJournalTemplateLine_recurringJournalTemplateId_lineNo_key] UNIQUE NONCLUSTERED ([recurringJournalTemplateId], [lineNo])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpRecurringJournalTemplate_retailOrgId_frequency_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplate]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpRecurringJournalTemplate_retailOrgId_frequency_status_idx] ON [dbo].[ErpRecurringJournalTemplate]([retailOrgId], [frequency], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpRecurringJournalTemplate_companyId_nextRunDate_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplate]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpRecurringJournalTemplate_companyId_nextRunDate_status_idx] ON [dbo].[ErpRecurringJournalTemplate]([companyId], [nextRunDate], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpRecurringJournalTemplateLine_companyId_accountCode_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplateLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpRecurringJournalTemplateLine_companyId_accountCode_status_idx] ON [dbo].[ErpRecurringJournalTemplateLine]([companyId], [accountCode], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpRecurringJournalTemplateLine_accountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplateLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpRecurringJournalTemplateLine_accountId_idx] ON [dbo].[ErpRecurringJournalTemplateLine]([accountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpRecurringJournalTemplateLine_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpRecurringJournalTemplateLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpRecurringJournalTemplateLine_retailOrgId_status_idx] ON [dbo].[ErpRecurringJournalTemplateLine]([retailOrgId], [status]);
END
