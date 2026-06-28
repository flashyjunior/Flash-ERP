IF OBJECT_ID(N'[dbo].[ErpEmployee]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployee] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeNo] NVARCHAR(1000) NOT NULL,
        [retailUserId] NVARCHAR(1000) NULL,
        [primaryStoreId] NVARCHAR(1000) NULL,
        [departmentId] NVARCHAR(1000) NOT NULL,
        [positionId] NVARCHAR(1000) NOT NULL,
        [employeeCategoryId] NVARCHAR(1000) NOT NULL,
        [reportingManagerId] NVARCHAR(1000) NULL,
        [firstName] NVARCHAR(1000) NOT NULL,
        [middleName] NVARCHAR(1000) NULL,
        [lastName] NVARCHAR(1000) NOT NULL,
        [displayName] NVARCHAR(1000) NOT NULL,
        [gender] NVARCHAR(1000) NULL,
        [dateOfBirth] DATETIME2 NULL,
        [phone] NVARCHAR(1000) NULL,
        [email] NVARCHAR(1000) NULL,
        [addressLine1] NVARCHAR(1000) NULL,
        [addressLine2] NVARCHAR(1000) NULL,
        [city] NVARCHAR(1000) NULL,
        [region] NVARCHAR(1000) NULL,
        [countryCode] NVARCHAR(1000) NULL,
        [emergencyContactName] NVARCHAR(1000) NULL,
        [emergencyContactPhone] NVARCHAR(1000) NULL,
        [emergencyContactRelation] NVARCHAR(1000) NULL,
        [employmentDate] DATETIME2 NOT NULL,
        [salaryType] NVARCHAR(1000) NOT NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployee_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployee_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployee_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployee_companyId_employeeNo_key] UNIQUE NONCLUSTERED ([companyId], [employeeNo])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpEmployeePayrollProfile]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployeePayrollProfile] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [basicSalary] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_basicSalary_df] DEFAULT 0,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [paymentFrequency] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_paymentFrequency_df] DEFAULT N'MONTHLY',
        [taxId] NVARCHAR(1000) NULL,
        [ssnitId] NVARCHAR(1000) NULL,
        [bankName] NVARCHAR(1000) NULL,
        [bankBranch] NVARCHAR(1000) NULL,
        [bankAccountName] NVARCHAR(1000) NULL,
        [bankAccountNo] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeePayrollProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployeePayrollProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployeePayrollProfile_employeeId_key] UNIQUE NONCLUSTERED ([employeeId])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpEmployeePayItem]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployeePayItem] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [componentType] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [calculationType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeePayItem_calculationType_df] DEFAULT N'FIXED',
        [amount] DECIMAL(18, 2) NOT NULL CONSTRAINT [ErpEmployeePayItem_amount_df] DEFAULT 0,
        [percentage] DECIMAL(8, 4) NOT NULL CONSTRAINT [ErpEmployeePayItem_percentage_df] DEFAULT 0,
        [effectiveFrom] DATETIME2 NULL,
        [effectiveTo] DATETIME2 NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeePayItem_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeePayItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployeePayItem_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployeePayItem_employeeId_componentType_code_key] UNIQUE NONCLUSTERED ([employeeId], [componentType], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpEmployeeAttendance]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployeeAttendance] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [departmentId] NVARCHAR(1000) NOT NULL,
        [storeId] NVARCHAR(1000) NULL,
        [workDate] DATETIME2 NOT NULL,
        [attendanceStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeAttendance_attendanceStatus_df] DEFAULT N'PRESENT',
        [checkInAt] DATETIME2 NULL,
        [checkOutAt] DATETIME2 NULL,
        [lateMinutes] INT NOT NULL CONSTRAINT [ErpEmployeeAttendance_lateMinutes_df] DEFAULT 0,
        [overtimeHours] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpEmployeeAttendance_overtimeHours_df] DEFAULT 0,
        [note] NVARCHAR(max) NULL,
        [entrySource] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeAttendance_entrySource_df] DEFAULT N'MANUAL',
        [externalReference] NVARCHAR(1000) NULL,
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeAttendance_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployeeAttendance_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployeeAttendance_companyId_employeeId_workDate_key] UNIQUE NONCLUSTERED ([companyId], [employeeId], [workDate])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpAttendanceChangeLog]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpAttendanceChangeLog] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [attendanceId] NVARCHAR(1000) NOT NULL,
        [action] NVARCHAR(1000) NOT NULL,
        [previousSnapshot] NVARCHAR(max) NULL,
        [newSnapshot] NVARCHAR(max) NOT NULL,
        [changedBy] NVARCHAR(1000) NOT NULL,
        [changedAt] DATETIME2 NOT NULL CONSTRAINT [ErpAttendanceChangeLog_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ErpAttendanceChangeLog_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpLeaveType]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpLeaveType] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [code] NVARCHAR(1000) NOT NULL,
        [name] NVARCHAR(1000) NOT NULL,
        [description] NVARCHAR(max) NULL,
        [defaultDays] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpLeaveType_defaultDays_df] DEFAULT 0,
        [isPaid] BIT NOT NULL CONSTRAINT [ErpLeaveType_isPaid_df] DEFAULT 1,
        [requiresAttachment] BIT NOT NULL CONSTRAINT [ErpLeaveType_requiresAttachment_df] DEFAULT 0,
        [genderEligibility] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpLeaveType_genderEligibility_df] DEFAULT N'ALL',
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpLeaveType_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpLeaveType_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpLeaveType_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpLeaveType_companyId_code_key] UNIQUE NONCLUSTERED ([companyId], [code])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpEmployeeLeaveEntitlement]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpEmployeeLeaveEntitlement] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [leaveTypeId] NVARCHAR(1000) NOT NULL,
        [leaveYear] INT NOT NULL,
        [openingDays] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_openingDays_df] DEFAULT 0,
        [allocatedDays] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_allocatedDays_df] DEFAULT 0,
        [adjustedDays] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_adjustedDays_df] DEFAULT 0,
        [usedDays] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_usedDays_df] DEFAULT 0,
        [pendingDays] DECIMAL(8, 2) NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_pendingDays_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_status_df] DEFAULT N'ACTIVE',
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpEmployeeLeaveEntitlement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpEmployeeLeaveEntitlement_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpEmployeeLeaveEntitlement_employeeId_leaveTypeId_leaveYear_key] UNIQUE NONCLUSTERED ([employeeId], [leaveTypeId], [leaveYear])
    );
END;

IF OBJECT_ID(N'[dbo].[ErpLeaveRequest]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpLeaveRequest] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [requestNo] NVARCHAR(1000) NOT NULL,
        [employeeId] NVARCHAR(1000) NOT NULL,
        [leaveTypeId] NVARCHAR(1000) NOT NULL,
        [approverEmployeeId] NVARCHAR(1000) NULL,
        [requestDate] DATETIME2 NOT NULL CONSTRAINT [ErpLeaveRequest_requestDate_df] DEFAULT CURRENT_TIMESTAMP,
        [startDate] DATETIME2 NOT NULL,
        [endDate] DATETIME2 NOT NULL,
        [requestedDays] DECIMAL(8, 2) NOT NULL,
        [reason] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpLeaveRequest_status_df] DEFAULT N'DRAFT',
        [decisionBy] NVARCHAR(1000) NULL,
        [decisionAt] DATETIME2 NULL,
        [decisionNote] NVARCHAR(max) NULL,
        [cancelledBy] NVARCHAR(1000) NULL,
        [cancelledAt] DATETIME2 NULL,
        [cancellationReason] NVARCHAR(max) NULL,
        [createdBy] NVARCHAR(1000) NULL,
        [updatedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpLeaveRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpLeaveRequest_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpLeaveRequest_companyId_requestNo_key] UNIQUE NONCLUSTERED ([companyId], [requestNo])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_retailOrgId_status_idx] ON [dbo].[ErpEmployee]([retailOrgId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_companyId_departmentId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_companyId_departmentId_status_idx] ON [dbo].[ErpEmployee]([companyId], [departmentId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_companyId_positionId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_companyId_positionId_status_idx] ON [dbo].[ErpEmployee]([companyId], [positionId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_employeeCategoryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_employeeCategoryId_idx] ON [dbo].[ErpEmployee]([employeeCategoryId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_reportingManagerId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_reportingManagerId_idx] ON [dbo].[ErpEmployee]([reportingManagerId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_retailUserId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_retailUserId_idx] ON [dbo].[ErpEmployee]([retailUserId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployee_primaryStoreId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployee]'))
    CREATE NONCLUSTERED INDEX [ErpEmployee_primaryStoreId_idx] ON [dbo].[ErpEmployee]([primaryStoreId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeePayrollProfile_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeePayrollProfile]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeePayrollProfile_retailOrgId_status_idx] ON [dbo].[ErpEmployeePayrollProfile]([retailOrgId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeePayrollProfile_companyId_paymentFrequency_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeePayrollProfile]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeePayrollProfile_companyId_paymentFrequency_status_idx] ON [dbo].[ErpEmployeePayrollProfile]([companyId], [paymentFrequency], [status]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeePayItem_retailOrgId_componentType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeePayItem]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeePayItem_retailOrgId_componentType_status_idx] ON [dbo].[ErpEmployeePayItem]([retailOrgId], [componentType], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeePayItem_companyId_employeeId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeePayItem]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeePayItem_companyId_employeeId_status_idx] ON [dbo].[ErpEmployeePayItem]([companyId], [employeeId], [status]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeAttendance_retailOrgId_workDate_attendanceStatus_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeAttendance]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeAttendance_retailOrgId_workDate_attendanceStatus_idx] ON [dbo].[ErpEmployeeAttendance]([retailOrgId], [workDate], [attendanceStatus]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeAttendance_companyId_departmentId_workDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeAttendance]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeAttendance_companyId_departmentId_workDate_idx] ON [dbo].[ErpEmployeeAttendance]([companyId], [departmentId], [workDate]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeAttendance_storeId_workDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeAttendance]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeAttendance_storeId_workDate_idx] ON [dbo].[ErpEmployeeAttendance]([storeId], [workDate]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpAttendanceChangeLog_retailOrgId_changedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpAttendanceChangeLog]'))
    CREATE NONCLUSTERED INDEX [ErpAttendanceChangeLog_retailOrgId_changedAt_idx] ON [dbo].[ErpAttendanceChangeLog]([retailOrgId], [changedAt]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpAttendanceChangeLog_companyId_attendanceId_changedAt_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpAttendanceChangeLog]'))
    CREATE NONCLUSTERED INDEX [ErpAttendanceChangeLog_companyId_attendanceId_changedAt_idx] ON [dbo].[ErpAttendanceChangeLog]([companyId], [attendanceId], [changedAt]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpLeaveType_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpLeaveType]'))
    CREATE NONCLUSTERED INDEX [ErpLeaveType_retailOrgId_status_idx] ON [dbo].[ErpLeaveType]([retailOrgId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpLeaveType_companyId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpLeaveType]'))
    CREATE NONCLUSTERED INDEX [ErpLeaveType_companyId_status_idx] ON [dbo].[ErpLeaveType]([companyId], [status]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeLeaveEntitlement_retailOrgId_leaveYear_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeLeaveEntitlement]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeLeaveEntitlement_retailOrgId_leaveYear_status_idx] ON [dbo].[ErpEmployeeLeaveEntitlement]([retailOrgId], [leaveYear], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpEmployeeLeaveEntitlement_companyId_employeeId_leaveYear_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpEmployeeLeaveEntitlement]'))
    CREATE NONCLUSTERED INDEX [ErpEmployeeLeaveEntitlement_companyId_employeeId_leaveYear_idx] ON [dbo].[ErpEmployeeLeaveEntitlement]([companyId], [employeeId], [leaveYear]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpLeaveRequest_retailOrgId_requestDate_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpLeaveRequest]'))
    CREATE NONCLUSTERED INDEX [ErpLeaveRequest_retailOrgId_requestDate_status_idx] ON [dbo].[ErpLeaveRequest]([retailOrgId], [requestDate], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpLeaveRequest_companyId_employeeId_startDate_endDate_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpLeaveRequest]'))
    CREATE NONCLUSTERED INDEX [ErpLeaveRequest_companyId_employeeId_startDate_endDate_idx] ON [dbo].[ErpLeaveRequest]([companyId], [employeeId], [startDate], [endDate]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpLeaveRequest_approverEmployeeId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpLeaveRequest]'))
    CREATE NONCLUSTERED INDEX [ErpLeaveRequest_approverEmployeeId_status_idx] ON [dbo].[ErpLeaveRequest]([approverEmployeeId], [status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpLeaveRequest_leaveTypeId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpLeaveRequest]'))
    CREATE NONCLUSTERED INDEX [ErpLeaveRequest_leaveTypeId_status_idx] ON [dbo].[ErpLeaveRequest]([leaveTypeId], [status]);
