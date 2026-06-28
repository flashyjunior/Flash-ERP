BEGIN TRY

BEGIN TRAN;

-- SQL Server unique indexes allow only one NULL. Payroll runs are linked to a posting batch only after posting.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ErpPayrollRun_postingBatchId_key' AND object_id = OBJECT_ID('dbo.ErpPayrollRun'))
    DROP INDEX [ErpPayrollRun_postingBatchId_key] ON [dbo].[ErpPayrollRun];

-- AlterTable
ALTER TABLE [dbo].[ErpPayrollRun] ADD [totalEmployeeBenefits] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalEmployeeBenefits_df] DEFAULT 0,
[totalEmployerBenefits] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalEmployerBenefits_df] DEFAULT 0,
[totalLoanRepayments] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRun_totalLoanRepayments_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[ErpPayrollRunEmployee] ADD [employeeBenefits] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_employeeBenefits_df] DEFAULT 0,
[employerBenefits] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_employerBenefits_df] DEFAULT 0,
[loanRepayments] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpPayrollRunEmployee_loanRepayments_df] DEFAULT 0;

-- CreateTable
CREATE TABLE [dbo].[ErpBenefitPlan] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [providerName] NVARCHAR(1000),
    [description] NVARCHAR(max),
    [employeeContributionType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBenefitPlan_employeeContributionType_df] DEFAULT 'FIXED',
    [employeeContribution] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBenefitPlan_employeeContribution_df] DEFAULT 0,
    [employerContributionType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBenefitPlan_employerContributionType_df] DEFAULT 'FIXED',
    [employerContribution] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpBenefitPlan_employerContribution_df] DEFAULT 0,
    [isTaxable] BIT NOT NULL CONSTRAINT [ErpBenefitPlan_isTaxable_df] DEFAULT 0,
    [isPensionable] BIT NOT NULL CONSTRAINT [ErpBenefitPlan_isPensionable_df] DEFAULT 0,
    [effectiveFrom] DATETIME2,
    [effectiveTo] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpBenefitPlan_status_df] DEFAULT 'ACTIVE',
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpBenefitPlan_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpBenefitPlan_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpBenefitPlan_companyId_code_key] UNIQUE NONCLUSTERED ([companyId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[ErpEmployeeBenefitEnrollment] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [benefitPlanId] NVARCHAR(1000) NOT NULL,
    [employeeId] NVARCHAR(1000) NOT NULL,
    [employeeContributionOverride] DECIMAL(18,2),
    [employerContributionOverride] DECIMAL(18,2),
    [effectiveFrom] DATETIME2 NOT NULL,
    [effectiveTo] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeBenefitEnrollment_status_df] DEFAULT 'ACTIVE',
    [note] NVARCHAR(max),
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeBenefitEnrollment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpEmployeeBenefitEnrollment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpEmployeeBenefitEnrollment_benefitPlanId_employeeId_effectiveFrom_key] UNIQUE NONCLUSTERED ([benefitPlanId],[employeeId],[effectiveFrom])
);

-- CreateTable
CREATE TABLE [dbo].[ErpEmployeeLoan] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [employeeId] NVARCHAR(1000) NOT NULL,
    [loanNo] NVARCHAR(1000) NOT NULL,
    [loanType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeLoan_loanType_df] DEFAULT 'LOAN',
    [requestDate] DATETIME2 NOT NULL,
    [principalAmount] DECIMAL(18,2) NOT NULL,
    [interestAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpEmployeeLoan_interestAmount_df] DEFAULT 0,
    [totalRepayable] DECIMAL(18,2) NOT NULL,
    [installmentAmount] DECIMAL(18,2) NOT NULL,
    [outstandingBalance] DECIMAL(18,2) NOT NULL,
    [purpose] NVARCHAR(max) NOT NULL,
    [note] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeLoan_status_df] DEFAULT 'DRAFT',
    [approvedAt] DATETIME2,
    [approvedBy] NVARCHAR(1000),
    [approvalNote] NVARCHAR(max),
    [disbursedAt] DATETIME2,
    [disbursedBy] NVARCHAR(1000),
    [cashbookAccountId] NVARCHAR(1000),
    [disbursementJournalEntryId] NVARCHAR(1000),
    [settledAt] DATETIME2,
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeLoan_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpEmployeeLoan_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpEmployeeLoan_companyId_loanNo_key] UNIQUE NONCLUSTERED ([companyId],[loanNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpEmployeeLoanRepayment] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [employeeLoanId] NVARCHAR(1000) NOT NULL,
    [employeeId] NVARCHAR(1000) NOT NULL,
    [repaymentKey] NVARCHAR(1000) NOT NULL,
    [payrollRunId] NVARCHAR(1000),
    [payrollRunEmployeeId] NVARCHAR(1000),
    [repaymentDate] DATETIME2 NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [sourceType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeLoanRepayment_sourceType_df] DEFAULT 'PAYROLL',
    [reference] NVARCHAR(1000),
    [journalEntryId] NVARCHAR(1000),
    [createdBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeLoanRepayment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpEmployeeLoanRepayment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpEmployeeLoanRepayment_repaymentKey_key] UNIQUE NONCLUSTERED ([repaymentKey])
);

-- CreateTable
CREATE TABLE [dbo].[ErpExpenseClaim] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [employeeId] NVARCHAR(1000) NOT NULL,
    [claimNo] NVARCHAR(1000) NOT NULL,
    [claimDate] DATETIME2 NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL,
    [purpose] NVARCHAR(max) NOT NULL,
    [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpExpenseClaim_totalAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpExpenseClaim_status_df] DEFAULT 'DRAFT',
    [submittedAt] DATETIME2,
    [submittedBy] NVARCHAR(1000),
    [decidedAt] DATETIME2,
    [decidedBy] NVARCHAR(1000),
    [decisionNote] NVARCHAR(max),
    [paidAt] DATETIME2,
    [paidBy] NVARCHAR(1000),
    [paymentReference] NVARCHAR(1000),
    [cashbookAccountId] NVARCHAR(1000),
    [journalEntryId] NVARCHAR(1000),
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpExpenseClaim_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpExpenseClaim_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpExpenseClaim_companyId_claimNo_key] UNIQUE NONCLUSTERED ([companyId],[claimNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpExpenseClaimLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [expenseClaimId] NVARCHAR(1000) NOT NULL,
    [lineNo] INT NOT NULL,
    [expenseDate] DATETIME2 NOT NULL,
    [category] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [expenseAccountCode] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [reference] NVARCHAR(1000),
    [evidenceUrl] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpExpenseClaimLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpExpenseClaimLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpExpenseClaimLine_expenseClaimId_lineNo_key] UNIQUE NONCLUSTERED ([expenseClaimId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTravelRequest] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [employeeId] NVARCHAR(1000) NOT NULL,
    [travelNo] NVARCHAR(1000) NOT NULL,
    [destination] NVARCHAR(1000) NOT NULL,
    [purpose] NVARCHAR(max) NOT NULL,
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2 NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL,
    [estimatedAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTravelRequest_estimatedAmount_df] DEFAULT 0,
    [approvedAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTravelRequest_approvedAmount_df] DEFAULT 0,
    [advanceAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTravelRequest_advanceAmount_df] DEFAULT 0,
    [actualAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTravelRequest_actualAmount_df] DEFAULT 0,
    [returnedAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTravelRequest_returnedAmount_df] DEFAULT 0,
    [employeePayableAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpTravelRequest_employeePayableAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpTravelRequest_status_df] DEFAULT 'DRAFT',
    [submittedAt] DATETIME2,
    [submittedBy] NVARCHAR(1000),
    [approvedAt] DATETIME2,
    [approvedBy] NVARCHAR(1000),
    [decisionNote] NVARCHAR(max),
    [cashbookAccountId] NVARCHAR(1000),
    [advanceJournalEntryId] NVARCHAR(1000),
    [settlementJournalEntryId] NVARCHAR(1000),
    [returnJournalEntryId] NVARCHAR(1000),
    [settledAt] DATETIME2,
    [settledBy] NVARCHAR(1000),
    [createdBy] NVARCHAR(1000),
    [updatedBy] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTravelRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ErpTravelRequest_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTravelRequest_companyId_travelNo_key] UNIQUE NONCLUSTERED ([companyId],[travelNo])
);

-- CreateTable
CREATE TABLE [dbo].[ErpTravelExpenseLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [companyId] NVARCHAR(1000) NOT NULL,
    [travelRequestId] NVARCHAR(1000) NOT NULL,
    [lineNo] INT NOT NULL,
    [expenseDate] DATETIME2 NOT NULL,
    [category] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [expenseAccountCode] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [reference] NVARCHAR(1000),
    [evidenceUrl] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpTravelExpenseLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ErpTravelExpenseLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ErpTravelExpenseLine_travelRequestId_lineNo_key] UNIQUE NONCLUSTERED ([travelRequestId],[lineNo])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpBenefitPlan_retailOrgId_status_idx] ON [dbo].[ErpBenefitPlan]([retailOrgId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpBenefitPlan_companyId_effectiveFrom_effectiveTo_status_idx] ON [dbo].[ErpBenefitPlan]([companyId], [effectiveFrom], [effectiveTo], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeBenefitEnrollment_retailOrgId_status_idx] ON [dbo].[ErpEmployeeBenefitEnrollment]([retailOrgId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeBenefitEnrollment_companyId_employeeId_status_idx] ON [dbo].[ErpEmployeeBenefitEnrollment]([companyId], [employeeId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeBenefitEnrollment_benefitPlanId_status_idx] ON [dbo].[ErpEmployeeBenefitEnrollment]([benefitPlanId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoan_retailOrgId_status_idx] ON [dbo].[ErpEmployeeLoan]([retailOrgId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoan_companyId_employeeId_status_idx] ON [dbo].[ErpEmployeeLoan]([companyId], [employeeId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoan_disbursementJournalEntryId_idx] ON [dbo].[ErpEmployeeLoan]([disbursementJournalEntryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoanRepayment_retailOrgId_repaymentDate_idx] ON [dbo].[ErpEmployeeLoanRepayment]([retailOrgId], [repaymentDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoanRepayment_companyId_employeeId_repaymentDate_idx] ON [dbo].[ErpEmployeeLoanRepayment]([companyId], [employeeId], [repaymentDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoanRepayment_employeeLoanId_repaymentDate_idx] ON [dbo].[ErpEmployeeLoanRepayment]([employeeLoanId], [repaymentDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpEmployeeLoanRepayment_payrollRunId_idx] ON [dbo].[ErpEmployeeLoanRepayment]([payrollRunId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpExpenseClaim_retailOrgId_status_claimDate_idx] ON [dbo].[ErpExpenseClaim]([retailOrgId], [status], [claimDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpExpenseClaim_companyId_employeeId_status_idx] ON [dbo].[ErpExpenseClaim]([companyId], [employeeId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpExpenseClaim_journalEntryId_idx] ON [dbo].[ErpExpenseClaim]([journalEntryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpExpenseClaimLine_companyId_expenseAccountCode_expenseDate_idx] ON [dbo].[ErpExpenseClaimLine]([companyId], [expenseAccountCode], [expenseDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTravelRequest_retailOrgId_status_startDate_idx] ON [dbo].[ErpTravelRequest]([retailOrgId], [status], [startDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTravelRequest_companyId_employeeId_status_idx] ON [dbo].[ErpTravelRequest]([companyId], [employeeId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTravelRequest_advanceJournalEntryId_idx] ON [dbo].[ErpTravelRequest]([advanceJournalEntryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTravelRequest_settlementJournalEntryId_idx] ON [dbo].[ErpTravelRequest]([settlementJournalEntryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ErpTravelExpenseLine_companyId_expenseAccountCode_expenseDate_idx] ON [dbo].[ErpTravelExpenseLine]([companyId], [expenseAccountCode], [expenseDate]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
