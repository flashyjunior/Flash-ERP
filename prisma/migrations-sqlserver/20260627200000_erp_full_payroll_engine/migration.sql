IF COL_LENGTH(N'[dbo].[ErpEmployeePayrollProfile]', N'taxResidency') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayrollProfile] ADD [taxResidency] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_taxResidency_df] DEFAULT N'RESIDENT';
IF COL_LENGTH(N'[dbo].[ErpEmployeePayrollProfile]', N'monthlyTaxRelief') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayrollProfile] ADD [monthlyTaxRelief] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_monthlyTaxRelief_df] DEFAULT 0;
IF COL_LENGTH(N'[dbo].[ErpEmployeePayrollProfile]', N'pensionStatus') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayrollProfile] ADD [pensionStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_pensionStatus_df] DEFAULT N'CONTRIBUTING';
IF COL_LENGTH(N'[dbo].[ErpEmployeePayrollProfile]', N'tier2TrusteeName') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayrollProfile] ADD [tier2TrusteeName] NVARCHAR(1000) NULL;
IF COL_LENGTH(N'[dbo].[ErpEmployeePayrollProfile]', N'tier2MemberNo') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayrollProfile] ADD [tier2MemberNo] NVARCHAR(1000) NULL;

IF COL_LENGTH(N'[dbo].[ErpEmployeePayItem]', N'isTaxable') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayItem] ADD [isTaxable] BIT NOT NULL CONSTRAINT [ErpEmployeePayItem_isTaxable_df] DEFAULT 1;
IF COL_LENGTH(N'[dbo].[ErpEmployeePayItem]', N'isPensionable') IS NULL
    ALTER TABLE [dbo].[ErpEmployeePayItem] ADD [isPensionable] BIT NOT NULL CONSTRAINT [ErpEmployeePayItem_isPensionable_df] DEFAULT 0;

IF OBJECT_ID(N'[dbo].[ErpPayrollStatutoryRuleSet]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollStatutoryRuleSet] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [countryCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_countryCode_df] DEFAULT N'GH',
        [currencyCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_currencyCode_df] DEFAULT N'GHS',
        [effectiveFrom] DATETIME2 NOT NULL,
        [effectiveTo] DATETIME2 NULL,
        [employeePensionRate] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_employeePensionRate_df] DEFAULT 5.5,
        [employerPensionRate] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_employerPensionRate_df] DEFAULT 13,
        [ssnitRemittanceRate] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_ssnitRemittanceRate_df] DEFAULT 13.5,
        [tier2Rate] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_tier2Rate_df] DEFAULT 5,
        [minimumInsurableEarnings] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_minimumInsurableEarnings_df] DEFAULT 0,
        [maximumInsurableEarnings] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_maximumInsurableEarnings_df] DEFAULT 0,
        [nonResidentTaxRate] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_nonResidentTaxRate_df] DEFAULT 25,
        [casualWorkerTaxRate] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_casualWorkerTaxRate_df] DEFAULT 5,
        [payeFilingDueDay] INT NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_payeFilingDueDay_df] DEFAULT 15,
        [pensionFilingDueDay] INT NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_pensionFilingDueDay_df] DEFAULT 14,
        [sourceName] NVARCHAR(1000) NOT NULL,
        [sourceUrl] NVARCHAR(1000) NULL,
        [pensionSourceUrl] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollStatutoryRuleSet_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollStatutoryRuleSet_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollStatutoryRuleSet_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpPayrollTaxBand]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollTaxBand] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [statutoryRuleSetId] NVARCHAR(1000) NOT NULL,
        [sequenceNo] INT NOT NULL,
        [bandAmount] DECIMAL(18,2) NULL,
        [ratePercent] DECIMAL(8,4) NOT NULL,
        [description] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollTaxBand_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollTaxBand_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollTaxBand_statutoryRuleSetId_sequenceNo_key] UNIQUE NONCLUSTERED ([statutoryRuleSetId], [sequenceNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpPayrollRun]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollRun] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [statutoryRuleSetId] NVARCHAR(1000) NOT NULL,
        [postingBatchId] NVARCHAR(1000) NULL,
        [runNo] NVARCHAR(1000) NOT NULL,
        [payPeriodCode] NVARCHAR(1000) NOT NULL,
        [payPeriodStart] DATETIME2 NOT NULL,
        [payPeriodEnd] DATETIME2 NOT NULL,
        [paymentDate] DATETIME2 NOT NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollRun_status_df] DEFAULT N'DRAFT',
        [employeeCount] INT NOT NULL CONSTRAINT [ErpPayrollRun_employeeCount_df] DEFAULT 0,
        [totalBasicPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalBasicPay_df] DEFAULT 0,
        [totalGrossPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalGrossPay_df] DEFAULT 0,
        [totalTaxablePay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalTaxablePay_df] DEFAULT 0,
        [totalEmployeePension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalEmployeePension_df] DEFAULT 0,
        [totalPayeTax] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalPayeTax_df] DEFAULT 0,
        [totalOtherDeductions] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalOtherDeductions_df] DEFAULT 0,
        [totalNetPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalNetPay_df] DEFAULT 0,
        [totalEmployerPension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalEmployerPension_df] DEFAULT 0,
        [totalTier1Pension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalTier1Pension_df] DEFAULT 0,
        [totalTier2Pension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalTier2Pension_df] DEFAULT 0,
        [totalEmployerCost] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalEmployerCost_df] DEFAULT 0,
        [calculatedAt] DATETIME2 NULL,
        [calculatedBy] NVARCHAR(1000) NULL,
        [approvedAt] DATETIME2 NULL,
        [approvedBy] NVARCHAR(1000) NULL,
        [reopenedAt] DATETIME2 NULL,
        [reopenedBy] NVARCHAR(1000) NULL,
        [postedAt] DATETIME2 NULL,
        [postedBy] NVARCHAR(1000) NULL,
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollRun_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollRun_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollRun_companyId_runNo_key] UNIQUE NONCLUSTERED ([companyId], [runNo]),
        CONSTRAINT [ErpPayrollRun_companyId_payPeriodCode_key] UNIQUE NONCLUSTERED ([companyId], [payPeriodCode])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollRun_postingBatchId_key' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRun]'))
    CREATE UNIQUE NONCLUSTERED INDEX [ErpPayrollRun_postingBatchId_key] ON [dbo].[ErpPayrollRun]([postingBatchId]) WHERE [postingBatchId] IS NOT NULL;

IF OBJECT_ID(N'[dbo].[ErpPayrollRunEmployee]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollRunEmployee] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [payrollRunId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [employeeNo] NVARCHAR(1000) NOT NULL,
        [employeeName] NVARCHAR(1000) NOT NULL,
        [departmentCode] NVARCHAR(1000) NOT NULL,
        [positionTitle] NVARCHAR(1000) NOT NULL,
        [categoryCode] NVARCHAR(1000) NOT NULL,
        [taxResidency] NVARCHAR(1000) NOT NULL,
        [taxId] NVARCHAR(1000) NULL,
        [ssnitId] NVARCHAR(1000) NULL,
        [bankName] NVARCHAR(1000) NULL,
        [bankAccountNo] NVARCHAR(1000) NULL,
        [basicPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_basicPay_df] DEFAULT 0,
        [recurringEarnings] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_recurringEarnings_df] DEFAULT 0,
        [grossPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_grossPay_df] DEFAULT 0,
        [pensionableEarnings] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_pensionableEarnings_df] DEFAULT 0,
        [insurableEarnings] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_insurableEarnings_df] DEFAULT 0,
        [employeePension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_employeePension_df] DEFAULT 0,
        [employerPension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_employerPension_df] DEFAULT 0,
        [tier1Pension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_tier1Pension_df] DEFAULT 0,
        [tier2Pension] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_tier2Pension_df] DEFAULT 0,
        [taxablePay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_taxablePay_df] DEFAULT 0,
        [payeTax] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_payeTax_df] DEFAULT 0,
        [recurringDeductions] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_recurringDeductions_df] DEFAULT 0,
        [totalDeductions] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_totalDeductions_df] DEFAULT 0,
        [netPay] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_netPay_df] DEFAULT 0,
        [employerCost] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_employerCost_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_status_df] DEFAULT N'CALCULATED',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollRunEmployee_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollRunEmployee_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollRunEmployee_payrollRunId_employeeId_key] UNIQUE NONCLUSTERED ([payrollRunId], [employeeId])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpPayrollRunLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollRunLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [payrollRunEmployeeId] NVARCHAR(1000) NOT NULL,
        [lineNo] INT NOT NULL,
        [componentCode] NVARCHAR(1000) NOT NULL,
        [componentName] NVARCHAR(1000) NOT NULL,
        [componentType] NVARCHAR(1000) NOT NULL,
        [calculationType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollRunLine_calculationType_df] DEFAULT N'FIXED',
        [ratePercent] DECIMAL(8,4) NOT NULL CONSTRAINT [ErpPayrollRunLine_ratePercent_df] DEFAULT 0,
        [basisAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunLine_basisAmount_df] DEFAULT 0,
        [amount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunLine_amount_df] DEFAULT 0,
        [isTaxable] BIT NOT NULL CONSTRAINT [ErpPayrollRunLine_isTaxable_df] DEFAULT 0,
        [isPensionable] BIT NOT NULL CONSTRAINT [ErpPayrollRunLine_isPensionable_df] DEFAULT 0,
        [sourceType] NVARCHAR(1000) NOT NULL,
        [sourceId] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollRunLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ErpPayrollRunLine_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollRunLine_payrollRunEmployeeId_lineNo_key] UNIQUE NONCLUSTERED ([payrollRunEmployeeId], [lineNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpPayrollFiling]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpPayrollFiling] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [payrollRunId] NVARCHAR(1000) NOT NULL,
        [filingNo] NVARCHAR(1000) NOT NULL,
        [filingType] NVARCHAR(1000) NOT NULL,
        [periodCode] NVARCHAR(1000) NOT NULL,
        [dueDate] DATETIME2 NOT NULL,
        [liabilityAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollFiling_liabilityAmount_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpPayrollFiling_status_df] DEFAULT N'READY',
        [filedAt] DATETIME2 NULL,
        [filedBy] NVARCHAR(1000) NULL,
        [filingReference] NVARCHAR(1000) NULL,
        [paidAt] DATETIME2 NULL,
        [paidBy] NVARCHAR(1000) NULL,
        [paymentReference] NVARCHAR(1000) NULL,
        [note] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpPayrollFiling_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpPayrollFiling_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpPayrollFiling_payrollRunId_filingType_key] UNIQUE NONCLUSTERED ([payrollRunId], [filingType]),
        CONSTRAINT [ErpPayrollFiling_companyId_filingNo_key] UNIQUE NONCLUSTERED ([companyId], [filingNo])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollStatutoryRuleSet_retailOrgId_effectiveFrom_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollStatutoryRuleSet]'))
    CREATE INDEX [ErpPayrollStatutoryRuleSet_retailOrgId_effectiveFrom_status_idx] ON [dbo].[ErpPayrollStatutoryRuleSet]([retailOrgId], [effectiveFrom], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollTaxBand_companyId_statutoryRuleSetId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollTaxBand]'))
    CREATE INDEX [ErpPayrollTaxBand_companyId_statutoryRuleSetId_idx] ON [dbo].[ErpPayrollTaxBand]([companyId], [statutoryRuleSetId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollRun_retailOrgId_status_payPeriodEnd_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRun]'))
    CREATE INDEX [ErpPayrollRun_retailOrgId_status_payPeriodEnd_idx] ON [dbo].[ErpPayrollRun]([retailOrgId], [status], [payPeriodEnd]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollRunEmployee_companyId_employeeNo_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRunEmployee]'))
    CREATE INDEX [ErpPayrollRunEmployee_companyId_employeeNo_status_idx] ON [dbo].[ErpPayrollRunEmployee]([companyId], [employeeNo], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollRunLine_companyId_componentType_componentCode_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRunLine]'))
    CREATE INDEX [ErpPayrollRunLine_companyId_componentType_componentCode_idx] ON [dbo].[ErpPayrollRunLine]([companyId], [componentType], [componentCode]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpPayrollFiling_retailOrgId_status_dueDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollFiling]'))
    CREATE INDEX [ErpPayrollFiling_retailOrgId_status_dueDate_idx] ON [dbo].[ErpPayrollFiling]([retailOrgId], [status], [dueDate]);
