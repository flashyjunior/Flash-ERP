IF OBJECT_ID(N'[dbo].[ErpHrDocument]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpHrDocument] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [documentNo] NVARCHAR(1000) NOT NULL,
        [documentType] NVARCHAR(1000) NOT NULL,
        [title] NVARCHAR(1000) NOT NULL,
        [referenceNo] NVARCHAR(1000) NULL,
        [issueDate] DATETIME2 NULL,
        [expiryDate] DATETIME2 NULL,
        [fileName] NVARCHAR(1000) NOT NULL,
        [mimeType] NVARCHAR(1000) NULL,
        [fileSizeBytes] INT NULL,
        [storageKey] NVARCHAR(1000) NULL,
        [externalUrl] NVARCHAR(1000) NULL,
        [note] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpHrDocument_status_df] DEFAULT N'ACTIVE',
        [uploadedBy] NVARCHAR(1000) NOT NULL,
        [uploadedAt] DATETIME2 NOT NULL CONSTRAINT [ErpHrDocument_uploadedAt_df] DEFAULT CURRENT_TIMESTAMP,
        [deletedBy] NVARCHAR(1000) NULL,
        [deletedAt] DATETIME2 NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpHrDocument_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpHrDocument_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpHrDocument_companyId_documentNo_key] UNIQUE NONCLUSTERED ([companyId], [documentNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpEmployeeExit]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployeeExit] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [exitNo] NVARCHAR(1000) NOT NULL,
        [exitType] NVARCHAR(1000) NOT NULL,
        [noticeDate] DATETIME2 NULL,
        [resignationDate] DATETIME2 NULL,
        [terminationDate] DATETIME2 NULL,
        [lastWorkingDate] DATETIME2 NOT NULL,
        [exitReason] NVARCHAR(1000) NOT NULL,
        [note] NVARCHAR(max) NULL,
        [finalSettlementStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeExit_finalSettlementStatus_df] DEFAULT N'NOT_STARTED',
        [assetReturnStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeExit_assetReturnStatus_df] DEFAULT N'NOT_STARTED',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeExit_status_df] DEFAULT N'DRAFT',
        [previousEmployeeStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeExit_previousEmployeeStatus_df] DEFAULT N'ACTIVE',
        [confirmedBy] NVARCHAR(1000) NULL,
        [confirmedAt] DATETIME2 NULL,
        [reopenedBy] NVARCHAR(1000) NULL,
        [reopenedAt] DATETIME2 NULL,
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeExit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployeeExit_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployeeExit_employeeId_key] UNIQUE NONCLUSTERED ([employeeId]),
        CONSTRAINT [ErpEmployeeExit_companyId_exitNo_key] UNIQUE NONCLUSTERED ([companyId], [exitNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpVisitorVisit]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpVisitorVisit] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [visitorNo] NVARCHAR(1000) NOT NULL,
        [visitorName] NVARCHAR(1000) NOT NULL,
        [phone] NVARCHAR(1000) NULL,
        [organization] NVARCHAR(1000) NULL,
        [idType] NVARCHAR(1000) NULL,
        [idNumber] NVARCHAR(1000) NULL,
        [purpose] NVARCHAR(max) NOT NULL,
        [hostEmployeeId] NVARCHAR(1000) NULL,
        [hostDepartmentId] NVARCHAR(1000) NULL,
        [expectedAt] DATETIME2 NULL,
        [checkInAt] DATETIME2 NULL,
        [checkOutAt] DATETIME2 NULL,
        [passNo] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpVisitorVisit_status_df] DEFAULT N'REGISTERED',
        [registeredBy] NVARCHAR(1000) NOT NULL,
        [checkInBy] NVARCHAR(1000) NULL,
        [checkOutBy] NVARCHAR(1000) NULL,
        [cancelledBy] NVARCHAR(1000) NULL,
        [cancelledAt] DATETIME2 NULL,
        [cancellationReason] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpVisitorVisit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpVisitorVisit_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpVisitorVisit_companyId_visitorNo_key] UNIQUE NONCLUSTERED ([companyId], [visitorNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpVisitorStatusLog]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpVisitorStatusLog] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [visitorVisitId] NVARCHAR(1000) NOT NULL,
        [action] NVARCHAR(1000) NOT NULL,
        [previousStatus] NVARCHAR(1000) NULL,
        [newStatus] NVARCHAR(1000) NOT NULL,
        [note] NVARCHAR(max) NULL,
        [changedBy] NVARCHAR(1000) NOT NULL,
        [changedAt] DATETIME2 NOT NULL CONSTRAINT [ErpVisitorStatusLog_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ErpVisitorStatusLog_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDocument_retailOrgId_status_uploadedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDocument]'))
    CREATE NONCLUSTERED INDEX [ErpHrDocument_retailOrgId_status_uploadedAt_idx] ON [dbo].[ErpHrDocument]([retailOrgId], [status], [uploadedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDocument_companyId_employeeId_documentType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDocument]'))
    CREATE NONCLUSTERED INDEX [ErpHrDocument_companyId_employeeId_documentType_status_idx] ON [dbo].[ErpHrDocument]([companyId], [employeeId], [documentType], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDocument_companyId_expiryDate_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDocument]'))
    CREATE NONCLUSTERED INDEX [ErpHrDocument_companyId_expiryDate_status_idx] ON [dbo].[ErpHrDocument]([companyId], [expiryDate], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDocument_storageKey_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDocument]'))
    CREATE NONCLUSTERED INDEX [ErpHrDocument_storageKey_idx] ON [dbo].[ErpHrDocument]([storageKey]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeExit_retailOrgId_status_lastWorkingDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeExit]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeExit_retailOrgId_status_lastWorkingDate_idx] ON [dbo].[ErpEmployeeExit]([retailOrgId], [status], [lastWorkingDate]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeExit_companyId_exitType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeExit]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeExit_companyId_exitType_status_idx] ON [dbo].[ErpEmployeeExit]([companyId], [exitType], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeExit_companyId_finalSettlementStatus_assetReturnStatus_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeExit]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeExit_companyId_finalSettlementStatus_assetReturnStatus_idx] ON [dbo].[ErpEmployeeExit]([companyId], [finalSettlementStatus], [assetReturnStatus]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpVisitorVisit_retailOrgId_status_expectedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpVisitorVisit]'))
    CREATE NONCLUSTERED INDEX [ErpVisitorVisit_retailOrgId_status_expectedAt_idx] ON [dbo].[ErpVisitorVisit]([retailOrgId], [status], [expectedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpVisitorVisit_companyId_hostDepartmentId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpVisitorVisit]'))
    CREATE NONCLUSTERED INDEX [ErpVisitorVisit_companyId_hostDepartmentId_status_idx] ON [dbo].[ErpVisitorVisit]([companyId], [hostDepartmentId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpVisitorVisit_hostEmployeeId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpVisitorVisit]'))
    CREATE NONCLUSTERED INDEX [ErpVisitorVisit_hostEmployeeId_status_idx] ON [dbo].[ErpVisitorVisit]([hostEmployeeId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpVisitorVisit_checkInAt_checkOutAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpVisitorVisit]'))
    CREATE NONCLUSTERED INDEX [ErpVisitorVisit_checkInAt_checkOutAt_idx] ON [dbo].[ErpVisitorVisit]([checkInAt], [checkOutAt]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpVisitorStatusLog_retailOrgId_changedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpVisitorStatusLog]'))
    CREATE NONCLUSTERED INDEX [ErpVisitorStatusLog_retailOrgId_changedAt_idx] ON [dbo].[ErpVisitorStatusLog]([retailOrgId], [changedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpVisitorStatusLog_companyId_visitorVisitId_changedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpVisitorStatusLog]'))
    CREATE NONCLUSTERED INDEX [ErpVisitorStatusLog_companyId_visitorVisitId_changedAt_idx] ON [dbo].[ErpVisitorStatusLog]([companyId], [visitorVisitId], [changedAt]);
