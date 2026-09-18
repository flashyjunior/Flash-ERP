IF OBJECT_ID(N'[dbo].[trial_signup_request]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trial_signup_request] (
        [id] NVARCHAR(100) NOT NULL,
        [requestNo] NVARCHAR(50) NOT NULL,
        [companyName] NVARCHAR(200) NOT NULL,
        [contactName] NVARCHAR(200) NOT NULL,
        [email] NVARCHAR(254) NOT NULL,
        [emailNormalized] NVARCHAR(254) NOT NULL,
        [phone] NVARCHAR(40) NOT NULL,
        [countryCode] NVARCHAR(2) NOT NULL CONSTRAINT [trial_signup_request_countryCode_df] DEFAULT N'GH',
        [city] NVARCHAR(200) NULL,
        [businessType] NVARCHAR(60) NOT NULL,
        [branchCount] INT NOT NULL CONSTRAINT [trial_signup_request_branchCount_df] DEFAULT 1,
        [employeeCountRange] NVARCHAR(30) NOT NULL,
        [preferredSlug] NVARCHAR(80) NULL,
        [status] NVARCHAR(40) NOT NULL CONSTRAINT [trial_signup_request_status_df] DEFAULT N'PENDING_VERIFICATION',
        [verificationCodeHash] NVARCHAR(64) NULL,
        [verificationExpiresAt] DATETIME2 NULL,
        [verificationAttemptCount] INT NOT NULL CONSTRAINT [trial_signup_request_verificationAttemptCount_df] DEFAULT 0,
        [verifiedAt] DATETIME2 NULL,
        [provisioningRequestKey] NVARCHAR(200) NOT NULL,
        [provisionerReference] NVARCHAR(200) NULL,
        [workspaceUrl] NVARCHAR(1000) NULL,
        [onlineStoreUrl] NVARCHAR(1000) NULL,
        [storefrontUrl] NVARCHAR(1000) NULL,
        [trialStartsAt] DATETIME2 NULL,
        [trialExpiresAt] DATETIME2 NULL,
        [failureCode] NVARCHAR(100) NULL,
        [failureMessage] NVARCHAR(1000) NULL,
        [marketingConsent] BIT NOT NULL CONSTRAINT [trial_signup_request_marketingConsent_df] DEFAULT 0,
        [termsAcceptedAt] DATETIME2 NOT NULL,
        [ipAddressHash] NVARCHAR(64) NULL,
        [userAgent] NVARCHAR(500) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [trial_signup_request_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [trial_signup_request_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [trial_signup_request_requestNo_key] UNIQUE NONCLUSTERED ([requestNo]),
        CONSTRAINT [trial_signup_request_provisioningRequestKey_key] UNIQUE NONCLUSTERED ([provisioningRequestKey])
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'trial_signup_request_emailNormalized_createdAt_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[trial_signup_request]')
)
BEGIN
    CREATE INDEX [trial_signup_request_emailNormalized_createdAt_idx]
        ON [dbo].[trial_signup_request]([emailNormalized], [createdAt]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'trial_signup_request_status_createdAt_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[trial_signup_request]')
)
BEGIN
    CREATE INDEX [trial_signup_request_status_createdAt_idx]
        ON [dbo].[trial_signup_request]([status], [createdAt]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'trial_signup_request_trialExpiresAt_status_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[trial_signup_request]')
)
BEGIN
    CREATE INDEX [trial_signup_request_trialExpiresAt_status_idx]
        ON [dbo].[trial_signup_request]([trialExpiresAt], [status]);
END;
