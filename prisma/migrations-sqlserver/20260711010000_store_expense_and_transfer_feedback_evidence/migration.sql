IF COL_LENGTH(N'dbo.InterStoreTransfer', N'feedbackDipReading') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [feedbackDipReading] DECIMAL(18, 3) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'beforeDischargeEvidenceJson') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [beforeDischargeEvidenceJson] NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'afterDischargeEvidenceJson') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [afterDischargeEvidenceJson] NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'attachmentFileName') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [attachmentFileName] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'attachmentUrl') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [attachmentUrl] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'confirmedBy') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [confirmedBy] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'confirmedAt') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [confirmedAt] DATETIME2(3) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'financeExpenseAccountCode') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [financeExpenseAccountCode] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'financePaymentAccountCode') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [financePaymentAccountCode] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'financeAssignedBy') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [financeAssignedBy] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.OperatingExpense', N'financeAssignedAt') IS NULL
BEGIN
  ALTER TABLE [dbo].[OperatingExpense] ADD [financeAssignedAt] DATETIME2(3) NULL;
END;
