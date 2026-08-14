SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.ErpFuelOperationsSettings', N'saleReceiptPaperKind') IS NULL
  ALTER TABLE [dbo].[ErpFuelOperationsSettings]
    ADD [saleReceiptPaperKind] NVARCHAR(1000) NOT NULL
      CONSTRAINT [ErpFuelOperationsSettings_saleReceiptPaperKind_df] DEFAULT N'THERMAL' WITH VALUES;

IF COL_LENGTH(N'dbo.ErpFuelOperationsSettings', N'deliveryReceiptPaperKind') IS NULL
  ALTER TABLE [dbo].[ErpFuelOperationsSettings]
    ADD [deliveryReceiptPaperKind] NVARCHAR(1000) NOT NULL
      CONSTRAINT [ErpFuelOperationsSettings_deliveryReceiptPaperKind_df] DEFAULT N'THERMAL' WITH VALUES;

IF COL_LENGTH(N'dbo.ErpFuelOperationsSettings', N'salesOrderReceiptPaperKind') IS NULL
  ALTER TABLE [dbo].[ErpFuelOperationsSettings]
    ADD [salesOrderReceiptPaperKind] NVARCHAR(1000) NOT NULL
      CONSTRAINT [ErpFuelOperationsSettings_salesOrderReceiptPaperKind_df] DEFAULT N'A4' WITH VALUES;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'ErpPayrollFiling_companyId_filingType_periodCode_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollFiling]')
)
  CREATE NONCLUSTERED INDEX [ErpPayrollFiling_companyId_filingType_periodCode_idx]
    ON [dbo].[ErpPayrollFiling]([companyId], [filingType], [periodCode]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'ErpPayrollRun_companyId_paymentDate_status_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRun]')
)
  CREATE NONCLUSTERED INDEX [ErpPayrollRun_companyId_paymentDate_status_idx]
    ON [dbo].[ErpPayrollRun]([companyId], [paymentDate], [status]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'ErpPayrollRun_statutoryRuleSetId_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRun]')
)
  CREATE NONCLUSTERED INDEX [ErpPayrollRun_statutoryRuleSetId_idx]
    ON [dbo].[ErpPayrollRun]([statutoryRuleSetId]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'ErpPayrollRunEmployee_employeeId_createdAt_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollRunEmployee]')
)
  CREATE NONCLUSTERED INDEX [ErpPayrollRunEmployee_employeeId_createdAt_idx]
    ON [dbo].[ErpPayrollRunEmployee]([employeeId], [createdAt]);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'ErpPayrollStatutoryRuleSet_companyId_countryCode_effectiveFrom_effectiveTo_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[ErpPayrollStatutoryRuleSet]')
)
  CREATE NONCLUSTERED INDEX [ErpPayrollStatutoryRuleSet_companyId_countryCode_effectiveFrom_effectiveTo_idx]
    ON [dbo].[ErpPayrollStatutoryRuleSet]([companyId], [countryCode], [effectiveFrom], [effectiveTo]);
