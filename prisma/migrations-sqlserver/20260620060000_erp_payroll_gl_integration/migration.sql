IF OBJECT_ID(N'[dbo].[ErpPayrollGlMapping]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollGlMapping] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [componentType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollGlMapping_componentType_df] DEFAULT 'EARNING',
        [accountId] NVARCHAR(1000) NULL,
        [accountCode] NVARCHAR(1000) NOT NULL,
        [defaultEntrySide] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollGlMapping_defaultEntrySide_df] DEFAULT 'DEBIT',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollGlMapping_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollGlMapping_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollGlMapping_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollGlMapping_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END

IF OBJECT_ID(N'[dbo].[ErpPayrollPostingBatch]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollPostingBatch] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [journalEntryId] NVARCHAR(1000) NULL,
        [batchNo] NVARCHAR(1000) NOT NULL,
        [payPeriodCode] NVARCHAR(1000) NOT NULL,
        [payPeriodStart] DATETIME2 NOT NULL,
        [payPeriodEnd] DATETIME2 NOT NULL,
        [paymentDate] DATETIME2 NULL,
        [postingDate] DATETIME2 NOT NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [sourceSystem] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_sourceSystem_df] DEFAULT 'MANUAL',
        [sourceReference] NVARCHAR(1000) NULL,
        [description] NVARCHAR(max) NULL,
        [employeeCount] INT NOT NULL CONSTRAINT [ErpPayrollPostingBatch_employeeCount_df] DEFAULT 0,
        [grossPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_grossPay_df] DEFAULT 0,
        [employeeDeductions] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_employeeDeductions_df] DEFAULT 0,
        [employerCosts] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_employerCosts_df] DEFAULT 0,
        [netPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_netPay_df] DEFAULT 0,
        [totalDebit] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_totalDebit_df] DEFAULT 0,
        [totalCredit] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_totalCredit_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollPostingBatch_status_df] DEFAULT 'DRAFT',
        [postedAt] DATETIME2 NULL,
        [postedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollPostingBatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollPostingBatch_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollPostingBatch_retailOrgId_batchNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [batchNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpPayrollPostingLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollPostingLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [payrollPostingBatchId] NVARCHAR(1000) NOT NULL,
        [mappingId] NVARCHAR(1000) NULL,
        [accountId] NVARCHAR(1000) NULL,
        [lineNo] INT NOT NULL,
        [employeeReference] NVARCHAR(1000) NULL,
        [departmentCode] NVARCHAR(1000) NULL,
        [componentCode] NVARCHAR(1000) NOT NULL,
        [componentName] NVARCHAR(1000) NOT NULL,
        [componentType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollPostingLine_componentType_df] DEFAULT 'EARNING',
        [accountCode] NVARCHAR(1000) NOT NULL,
        [entrySide] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollPostingLine_entrySide_df] DEFAULT 'DEBIT',
        [debitAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingLine_debitAmount_df] DEFAULT 0,
        [creditAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollPostingLine_creditAmount_df] DEFAULT 0,
        [memo] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollPostingLine_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollPostingLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollPostingLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollGlMapping_companyId_componentType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollGlMapping]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollGlMapping_companyId_componentType_status_idx] ON [dbo].[ErpPayrollGlMapping]([companyId], [componentType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollGlMapping_accountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollGlMapping]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollGlMapping_accountId_idx] ON [dbo].[ErpPayrollGlMapping]([accountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollGlMapping_retailOrgId_code_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollGlMapping]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollGlMapping_retailOrgId_code_status_idx] ON [dbo].[ErpPayrollGlMapping]([retailOrgId], [code], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingBatch_companyId_payPeriodStart_payPeriodEnd_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingBatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingBatch_companyId_payPeriodStart_payPeriodEnd_idx] ON [dbo].[ErpPayrollPostingBatch]([companyId], [payPeriodStart], [payPeriodEnd]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingBatch_companyId_status_postingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingBatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingBatch_companyId_status_postingDate_idx] ON [dbo].[ErpPayrollPostingBatch]([companyId], [status], [postingDate]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingBatch_journalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingBatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingBatch_journalEntryId_idx] ON [dbo].[ErpPayrollPostingBatch]([journalEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingBatch_retailOrgId_sourceSystem_sourceReference_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingBatch]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingBatch_retailOrgId_sourceSystem_sourceReference_idx] ON [dbo].[ErpPayrollPostingBatch]([retailOrgId], [sourceSystem], [sourceReference]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingLine_payrollPostingBatchId_lineNo_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingLine_payrollPostingBatchId_lineNo_idx] ON [dbo].[ErpPayrollPostingLine]([payrollPostingBatchId], [lineNo]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingLine_mappingId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingLine_mappingId_idx] ON [dbo].[ErpPayrollPostingLine]([mappingId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingLine_accountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingLine_accountId_idx] ON [dbo].[ErpPayrollPostingLine]([accountId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingLine_companyId_componentType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingLine_companyId_componentType_status_idx] ON [dbo].[ErpPayrollPostingLine]([companyId], [componentType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollPostingLine_retailOrgId_componentCode_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollPostingLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpPayrollPostingLine_retailOrgId_componentCode_status_idx] ON [dbo].[ErpPayrollPostingLine]([retailOrgId], [componentCode], [status]);
END
