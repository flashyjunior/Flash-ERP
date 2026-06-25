IF OBJECT_ID(N'[dbo].[ErpBudgetVersion]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpBudgetVersion] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fiscalYearId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [budgetType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetVersion_budgetType_df] DEFAULT 'OPERATING',
        [scenario] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetVersion_scenario_df] DEFAULT 'BASE',
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBudgetVersion_totalAmount_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetVersion_status_df] DEFAULT 'DRAFT',
        [approvedAt] DATETIME2 NULL,
        [approvedBy] NVARCHAR(1000) NULL,
        [lockedAt] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBudgetVersion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpBudgetVersion_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpBudgetVersion_companyId_fiscalYearId_code_key] UNIQUE NONCLUSTERED ([companyId], [fiscalYearId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpBudgetLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpBudgetLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fiscalYearId] NVARCHAR(1000) NOT NULL,
        [budgetVersionId] NVARCHAR(1000) NOT NULL,
        [accountId] NVARCHAR(1000) NULL,
        [accountCode] NVARCHAR(1000) NOT NULL,
        [lineNo] INT NOT NULL,
        [description] NVARCHAR(max) NULL,
        [annualAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBudgetLine_annualAmount_df] DEFAULT 0,
        [spreadMethod] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetLine_spreadMethod_df] DEFAULT 'EVEN',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetLine_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBudgetLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpBudgetLine_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpBudgetLine_budgetVersionId_accountCode_key] UNIQUE NONCLUSTERED ([budgetVersionId], [accountCode])
    );
END

IF OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpBudgetPeriodAmount] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [budgetVersionId] NVARCHAR(1000) NOT NULL,
        [budgetLineId] NVARCHAR(1000) NOT NULL,
        [fiscalPeriodId] NVARCHAR(1000) NOT NULL,
        [accountId] NVARCHAR(1000) NULL,
        [accountCode] NVARCHAR(1000) NOT NULL,
        [periodNo] INT NOT NULL,
        [periodAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBudgetPeriodAmount_periodAmount_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBudgetPeriodAmount_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBudgetPeriodAmount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpBudgetPeriodAmount_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpBudgetPeriodAmount_budgetLineId_fiscalPeriodId_key] UNIQUE NONCLUSTERED ([budgetLineId], [fiscalPeriodId])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetVersion_retailOrgId_budgetType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetVersion]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetVersion_retailOrgId_budgetType_status_idx] ON [dbo].[ErpBudgetVersion]([retailOrgId], [budgetType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetVersion_fiscalYearId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetVersion]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetVersion_fiscalYearId_idx] ON [dbo].[ErpBudgetVersion]([fiscalYearId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetVersion_companyId_fiscalYearId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetVersion]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetVersion_companyId_fiscalYearId_status_idx] ON [dbo].[ErpBudgetVersion]([companyId], [fiscalYearId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_fiscalYearId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetLine_fiscalYearId_idx] ON [dbo].[ErpBudgetLine]([fiscalYearId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_companyId_fiscalYearId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetLine_companyId_fiscalYearId_status_idx] ON [dbo].[ErpBudgetLine]([companyId], [fiscalYearId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_accountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetLine_accountId_idx] ON [dbo].[ErpBudgetLine]([accountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetLine_retailOrgId_accountCode_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetLine_retailOrgId_accountCode_status_idx] ON [dbo].[ErpBudgetLine]([retailOrgId], [accountCode], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_companyId_fiscalPeriodId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_companyId_fiscalPeriodId_status_idx] ON [dbo].[ErpBudgetPeriodAmount]([companyId], [fiscalPeriodId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_fiscalPeriodId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_fiscalPeriodId_idx] ON [dbo].[ErpBudgetPeriodAmount]([fiscalPeriodId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_budgetVersionId_accountCode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_budgetVersionId_accountCode_idx] ON [dbo].[ErpBudgetPeriodAmount]([budgetVersionId], [accountCode]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_accountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_accountId_idx] ON [dbo].[ErpBudgetPeriodAmount]([accountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpBudgetPeriodAmount_retailOrgId_accountCode_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpBudgetPeriodAmount]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpBudgetPeriodAmount_retailOrgId_accountCode_status_idx] ON [dbo].[ErpBudgetPeriodAmount]([retailOrgId], [accountCode], [status]);
END
