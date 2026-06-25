IF COL_LENGTH(N'[dbo].[ErpCashbookAccount]', N'mobileProviderName') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookAccount] ADD [mobileProviderName] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookAccount]', N'mobileWalletNumber') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookAccount] ADD [mobileWalletNumber] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookAccount]', N'pettyCashCustodian') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookAccount] ADD [pettyCashCustodian] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'workflowType') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [workflowType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpCashbookEntry_workflowType_df] DEFAULT 'STANDARD';
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'workflowReference') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [workflowReference] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'linkedCashbookAccountId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [linkedCashbookAccountId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'linkedCashbookEntryId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [linkedCashbookEntryId] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'pettyCashCustodian') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [pettyCashCustodian] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'providerName') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [providerName] NVARCHAR(1000) NULL;
END

IF COL_LENGTH(N'[dbo].[ErpCashbookEntry]', N'providerReference') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpCashbookEntry] ADD [providerReference] NVARCHAR(1000) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_companyId_workflowType_workflowReference_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_companyId_workflowType_workflowReference_idx] ON [dbo].[ErpCashbookEntry]([companyId], [workflowType], [workflowReference]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_linkedCashbookAccountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_linkedCashbookAccountId_idx] ON [dbo].[ErpCashbookEntry]([linkedCashbookAccountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpCashbookEntry_linkedCashbookEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpCashbookEntry]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpCashbookEntry_linkedCashbookEntryId_idx] ON [dbo].[ErpCashbookEntry]([linkedCashbookEntryId]);
END
