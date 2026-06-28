IF OBJECT_ID(N'[dbo].[ErpHrDepartment]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpHrDepartment] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [financeDimensionId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [headEmployeeId] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpHrDepartment_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpHrDepartment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpHrDepartment_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpHrDepartment_financeDimensionId_key] UNIQUE NONCLUSTERED ([financeDimensionId]),
        CONSTRAINT [ErpHrDepartment_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpHrPosition]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpHrPosition] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [departmentId] NVARCHAR(1000) NOT NULL,
        [reportsToPositionId] NVARCHAR(1000) NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [title] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpHrPosition_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpHrPosition_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpHrPosition_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpHrPosition_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpEmployeeCategory]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployeeCategory] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeCategory_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployeeCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployeeCategory_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDepartment_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDepartment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpHrDepartment_retailOrgId_status_idx] ON [dbo].[ErpHrDepartment]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDepartment_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDepartment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpHrDepartment_companyId_status_idx] ON [dbo].[ErpHrDepartment]([companyId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrDepartment_headEmployeeId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrDepartment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpHrDepartment_headEmployeeId_idx] ON [dbo].[ErpHrDepartment]([headEmployeeId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrPosition_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrPosition]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpHrPosition_retailOrgId_status_idx] ON [dbo].[ErpHrPosition]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrPosition_companyId_departmentId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrPosition]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpHrPosition_companyId_departmentId_status_idx] ON [dbo].[ErpHrPosition]([companyId], [departmentId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpHrPosition_reportsToPositionId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpHrPosition]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpHrPosition_reportsToPositionId_idx] ON [dbo].[ErpHrPosition]([reportsToPositionId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeCategory_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeCategory]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpEmployeeCategory_retailOrgId_status_idx] ON [dbo].[ErpEmployeeCategory]([retailOrgId], [status]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeCategory_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeCategory]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpEmployeeCategory_companyId_status_idx] ON [dbo].[ErpEmployeeCategory]([companyId], [status]);
END;
