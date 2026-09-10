IF COL_LENGTH(N'dbo.trial_signup_request', N'workspaceSlug') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [workspaceSlug] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'workspaceDatabaseName') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [workspaceDatabaseName] NVARCHAR(128) NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'workspacePort') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [workspacePort] INT NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'ownerLoginId') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [ownerLoginId] NVARCHAR(254) NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'activationSentAt') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [activationSentAt] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'expiredAt') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [expiredAt] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.trial_signup_request', N'extensionCount') IS NULL
    ALTER TABLE [dbo].[trial_signup_request]
        ADD [extensionCount] INT NOT NULL CONSTRAINT [trial_signup_request_extensionCount_df] DEFAULT 0;
IF COL_LENGTH(N'dbo.trial_signup_request', N'lastLifecycleAt') IS NULL
    ALTER TABLE [dbo].[trial_signup_request] ADD [lastLifecycleAt] DATETIME2 NULL;

IF OBJECT_ID(N'[dbo].[trial_lifecycle_event]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trial_lifecycle_event] (
        [id] NVARCHAR(100) NOT NULL,
        [trialSignupRequestId] NVARCHAR(100) NOT NULL,
        [eventType] NVARCHAR(60) NOT NULL,
        [outcome] NVARCHAR(30) NOT NULL,
        [actorType] NVARCHAR(40) NOT NULL,
        [actorRef] NVARCHAR(200) NULL,
        [previousStatus] NVARCHAR(40) NULL,
        [newStatus] NVARCHAR(40) NULL,
        [previousExpiresAt] DATETIME2 NULL,
        [newExpiresAt] DATETIME2 NULL,
        [detailsJson] NVARCHAR(MAX) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [trial_lifecycle_event_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [trial_lifecycle_event_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [trial_lifecycle_event_trialSignupRequestId_fkey]
            FOREIGN KEY ([trialSignupRequestId]) REFERENCES [dbo].[trial_signup_request]([id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'trial_lifecycle_event_request_created_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[trial_lifecycle_event]')
)
    CREATE INDEX [trial_lifecycle_event_request_created_idx]
        ON [dbo].[trial_lifecycle_event]([trialSignupRequestId], [createdAt]);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'trial_lifecycle_event_type_created_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[trial_lifecycle_event]')
)
    CREATE INDEX [trial_lifecycle_event_type_created_idx]
        ON [dbo].[trial_lifecycle_event]([eventType], [createdAt]);

IF OBJECT_ID(N'[dbo].[trial_workspace_runtime]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[trial_workspace_runtime] (
        [id] NVARCHAR(100) NOT NULL,
        [requestNo] NVARCHAR(50) NOT NULL,
        [workspaceSlug] NVARCHAR(80) NOT NULL,
        [companyName] NVARCHAR(200) NOT NULL,
        [ownerUserId] NVARCHAR(100) NOT NULL,
        [status] NVARCHAR(40) NOT NULL CONSTRAINT [trial_workspace_runtime_status_df] DEFAULT N'PROVISIONING',
        [trialStartsAt] DATETIME2 NOT NULL,
        [trialExpiresAt] DATETIME2 NOT NULL,
        [activatedAt] DATETIME2 NULL,
        [expiredAt] DATETIME2 NULL,
        [extensionCount] INT NOT NULL CONSTRAINT [trial_workspace_runtime_extensionCount_df] DEFAULT 0,
        [lastLifecycleAt] DATETIME2 NOT NULL CONSTRAINT [trial_workspace_runtime_lastLifecycleAt_df] DEFAULT CURRENT_TIMESTAMP,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [trial_workspace_runtime_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [trial_workspace_runtime_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [trial_workspace_runtime_requestNo_key] UNIQUE NONCLUSTERED ([requestNo]),
        CONSTRAINT [trial_workspace_runtime_workspaceSlug_key] UNIQUE NONCLUSTERED ([workspaceSlug])
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'trial_workspace_runtime_status_expiry_idx'
      AND [object_id] = OBJECT_ID(N'[dbo].[trial_workspace_runtime]')
)
    CREATE INDEX [trial_workspace_runtime_status_expiry_idx]
        ON [dbo].[trial_workspace_runtime]([status], [trialExpiresAt]);
