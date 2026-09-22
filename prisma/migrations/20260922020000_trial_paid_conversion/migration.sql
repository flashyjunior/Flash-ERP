SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.trial_signup_request', N'subscriptionPlanCode') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [subscriptionPlanCode] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'subscriptionReference') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [subscriptionReference] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'subscriptionLicensedUntil') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [subscriptionLicensedUntil] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'convertedAt') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [convertedAt] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'convertedBy') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [convertedBy] NVARCHAR(254) NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'retainSupportAccess') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [retainSupportAccess] BIT NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'supportAccessExpiresAt') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [supportAccessExpiresAt] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'supportApprovalReference') IS NULL
  ALTER TABLE [dbo].[trial_signup_request] ADD [supportApprovalReference] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'subscriptionPlanCode') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [subscriptionPlanCode] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'subscriptionReference') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [subscriptionReference] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'subscriptionLicensedUntil') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [subscriptionLicensedUntil] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'convertedAt') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [convertedAt] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'convertedBy') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [convertedBy] NVARCHAR(254) NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'retainSupportAccess') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [retainSupportAccess] BIT NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'supportAccessExpiresAt') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [supportAccessExpiresAt] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_workspace_runtime', N'supportApprovalReference') IS NULL
  ALTER TABLE [dbo].[trial_workspace_runtime] ADD [supportApprovalReference] NVARCHAR(200) NULL;
