IF OBJECT_ID(N'[dbo].[ErpFinanceDimension]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFinanceDimension] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [dimensionType] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpFinanceDimension_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFinanceDimension_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFinanceDimension_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpFinanceDimension_companyId_dimensionType_code_key] UNIQUE NONCLUSTERED ([companyId], [dimensionType], [code])
    );
END;

IF COL_LENGTH('dbo.GlJournalLine', 'financeDimensionId') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalLine] ADD [financeDimensionId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.GlJournalLine', 'dimensionType') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalLine] ADD [dimensionType] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.GlJournalLine', 'dimensionCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[GlJournalLine] ADD [dimensionCode] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetLine', 'financeDimensionId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetLine] ADD [financeDimensionId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetLine', 'dimensionType') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetLine] ADD [dimensionType] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetLine', 'dimensionCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetLine] ADD [dimensionCode] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetLine', 'dimensionKey') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetLine]
    ADD [dimensionKey] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetLine_dimensionKey_df] DEFAULT 'ACCOUNT_ONLY';
END;

IF COL_LENGTH('dbo.ErpBudgetPeriodAmount', 'financeDimensionId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetPeriodAmount] ADD [financeDimensionId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetPeriodAmount', 'dimensionType') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetPeriodAmount] ADD [dimensionType] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetPeriodAmount', 'dimensionCode') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetPeriodAmount] ADD [dimensionCode] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH('dbo.ErpBudgetPeriodAmount', 'dimensionKey') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpBudgetPeriodAmount]
    ADD [dimensionKey] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetPeriodAmount_dimensionKey_df] DEFAULT 'ACCOUNT_ONLY';
END;

IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE [name] = N'ErpBudgetLine_budgetVersionId_accountCode_key'
      AND [parent_object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]')
)
BEGIN
    ALTER TABLE [dbo].[ErpBudgetLine] DROP CONSTRAINT [ErpBudgetLine_budgetVersionId_accountCode_key];
END;

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE [name] = N'ErpBudgetLine_budgetVersionId_accountCode_key'
      AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]')
)
BEGIN
    DROP INDEX [ErpBudgetLine_budgetVersionId_accountCode_key] ON [dbo].[ErpBudgetLine];
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFinanceDimension_retailOrgId_dimensionType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFinanceDimension]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFinanceDimension_retailOrgId_dimensionType_status_idx] ON [dbo].[ErpFinanceDimension]([retailOrgId], [dimensionType], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFinanceDimension_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFinanceDimension]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFinanceDimension_companyId_status_idx] ON [dbo].[ErpFinanceDimension]([companyId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalLine_financeDimensionId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalLine_financeDimensionId_idx] ON [dbo].[GlJournalLine]([financeDimensionId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'GlJournalLine_dimensionType_dimensionCode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[GlJournalLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [GlJournalLine_dimensionType_dimensionCode_idx] ON [dbo].[GlJournalLine]([dimensionType], [dimensionCode]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_budgetVersionId_accountCode_dimensionKey_key' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [ErpBudgetLine_budgetVersionId_accountCode_dimensionKey_key] ON [dbo].[ErpBudgetLine]([budgetVersionId], [accountCode], [dimensionKey]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_financeDimensionId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetLine_financeDimensionId_idx] ON [dbo].[ErpBudgetLine]([financeDimensionId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_companyId_dimensionType_dimensionCode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetLine_companyId_dimensionType_dimensionCode_idx] ON [dbo].[ErpBudgetLine]([companyId], [dimensionType], [dimensionCode]);
END;

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE [name] = N'ErpBudgetPeriodAmount_budgetVersionId_accountCode_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]')
)
BEGIN
    DROP INDEX [ErpBudgetPeriodAmount_budgetVersionId_accountCode_idx] ON [dbo].[ErpBudgetPeriodAmount];
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_budgetVersionId_accountCode_dimensionKey_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_budgetVersionId_accountCode_dimensionKey_idx] ON [dbo].[ErpBudgetPeriodAmount]([budgetVersionId], [accountCode], [dimensionKey]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_financeDimensionId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_financeDimensionId_idx] ON [dbo].[ErpBudgetPeriodAmount]([financeDimensionId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_companyId_dimensionType_dimensionCode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_companyId_dimensionType_dimensionCode_idx] ON [dbo].[ErpBudgetPeriodAmount]([companyId], [dimensionType], [dimensionCode]);
END;
