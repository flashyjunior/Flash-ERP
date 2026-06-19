BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[RetailOrg] (
    [id] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [baseCurrencyCode] NVARCHAR(1000) NOT NULL,
    [timezone] NVARCHAR(1000) NOT NULL,
    [companySettingsJson] NVARCHAR(max),
    [ldapSettingsJson] NVARCHAR(max),
    [smtpSettingsJson] NVARCHAR(max),
    [smsSettingsJson] NVARCHAR(max),
    [optionsSettingsJson] NVARCHAR(max),
    [passwordPolicyJson] NVARCHAR(max),
    [loyaltyProgramEnabled] BIT NOT NULL CONSTRAINT [RetailOrg_loyaltyProgramEnabled_df] DEFAULT 1,
    [loyaltyPointsPerCurrencyUnit] DECIMAL(12,4) NOT NULL CONSTRAINT [RetailOrg_loyaltyPointsPerCurrencyUnit_df] DEFAULT 1,
    [loyaltyRedemptionEnabled] BIT NOT NULL CONSTRAINT [RetailOrg_loyaltyRedemptionEnabled_df] DEFAULT 0,
    [loyaltyRedemptionPointsStep] INT NOT NULL CONSTRAINT [RetailOrg_loyaltyRedemptionPointsStep_df] DEFAULT 100,
    [loyaltyRedemptionValueAmount] DECIMAL(12,2) NOT NULL CONSTRAINT [RetailOrg_loyaltyRedemptionValueAmount_df] DEFAULT 1,
    [loyaltyMinimumRedeemPoints] INT NOT NULL CONSTRAINT [RetailOrg_loyaltyMinimumRedeemPoints_df] DEFAULT 100,
    [loyaltyMaximumRedeemPercentOfSale] DECIMAL(5,2) NOT NULL CONSTRAINT [RetailOrg_loyaltyMaximumRedeemPercentOfSale_df] DEFAULT 100,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RetailOrg_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetailOrg_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RetailOrg_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RetailOrg_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[ReceiptTemplate] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [templateHtml] NVARCHAR(1000) NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [ReceiptTemplate_isDefault_df] DEFAULT 0,
    [paperWidthMm] INT NOT NULL CONSTRAINT [ReceiptTemplate_paperWidthMm_df] DEFAULT 80,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ReceiptTemplate_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ReceiptTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ReceiptTemplate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ReceiptTemplate_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[Bank] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Bank_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [Bank_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Bank_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Bank_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Bank_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[BankBranch] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [bankId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [addressLine1] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [BankBranch_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [BankBranch_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BankBranch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [BankBranch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BankBranch_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[BankAccount] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [accountNumber] NVARCHAR(1000) NOT NULL,
    [accountName] NVARCHAR(1000) NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [BankAccount_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [BankAccount_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BankAccount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [BankAccount_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BankAccount_branchId_key] UNIQUE NONCLUSTERED ([branchId]),
    CONSTRAINT [BankAccount_retailOrgId_accountNumber_key] UNIQUE NONCLUSTERED ([retailOrgId],[accountNumber])
);

-- CreateTable
CREATE TABLE [dbo].[Store] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [shortName] NVARCHAR(1000),
    [timezone] NVARCHAR(1000) NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL,
    [salesEnabled] BIT NOT NULL CONSTRAINT [Store_salesEnabled_df] DEFAULT 1,
    [warehouseEnabled] BIT NOT NULL CONSTRAINT [Store_warehouseEnabled_df] DEFAULT 1,
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [managerName] NVARCHAR(1000),
    [addressLine1] NVARCHAR(1000),
    [addressLine2] NVARCHAR(1000),
    [city] NVARCHAR(1000),
    [region] NVARCHAR(1000),
    [storeGroupCode] NVARCHAR(1000),
    [storeGroupName] NVARCHAR(1000),
    [storeGroupType] NVARCHAR(1000),
    [countryCode] NVARCHAR(1000),
    [postalCode] NVARCHAR(1000),
    [taxRegistrationNo] NVARCHAR(1000),
    [receiptHeader] NVARCHAR(1000),
    [receiptFooter] NVARCHAR(1000),
    [salesReceiptTemplateId] NVARCHAR(1000),
    [salesReceiptTemplateHtml] NVARCHAR(1000),
    [accountPaymentReceiptTemplateId] NVARCHAR(1000),
    [accountPaymentReceiptTemplateHtml] NVARCHAR(1000),
    [licenseStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Store_licenseStatus_df] DEFAULT 'UNLICENSED',
    [licenseKey] NVARCHAR(1000),
    [licensedUntil] DATETIME2,
    [catalogPolicyJson] NVARCHAR(max),
    [storeMode] NVARCHAR(1000) NOT NULL CONSTRAINT [Store_storeMode_df] DEFAULT 'OFFLINE_FIRST',
    [touchModeEnabled] BIT NOT NULL CONSTRAINT [Store_touchModeEnabled_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Store_status_df] DEFAULT 'ACTIVE',
    [openedOn] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Store_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Store_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Store_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[GlAccount] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [accountType] NVARCHAR(1000) NOT NULL,
    [normalBalance] NVARCHAR(1000) NOT NULL,
    [externalCode] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [GlAccount_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GlAccount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GlAccount_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GlAccount_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[GlJournalEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [journalNo] NVARCHAR(1000) NOT NULL,
    [sourceType] NVARCHAR(1000) NOT NULL,
    [sourceId] NVARCHAR(1000) NOT NULL,
    [sourceReference] NVARCHAR(1000),
    [postingDate] DATETIME2 NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [GlJournalEntry_status_df] DEFAULT 'POSTED',
    [postedAt] DATETIME2 NOT NULL CONSTRAINT [GlJournalEntry_postedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GlJournalEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GlJournalEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GlJournalEntry_retailOrgId_journalNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[journalNo]),
    CONSTRAINT [GlJournalEntry_retailOrgId_sourceType_sourceId_key] UNIQUE NONCLUSTERED ([retailOrgId],[sourceType],[sourceId])
);

-- CreateTable
CREATE TABLE [dbo].[GlJournalLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [journalEntryId] NVARCHAR(1000) NOT NULL,
    [accountId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [debitAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [GlJournalLine_debitAmount_df] DEFAULT 0,
    [creditAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [GlJournalLine_creditAmount_df] DEFAULT 0,
    [memo] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GlJournalLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [GlJournalLine_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[OperatingExpense] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [expenseNo] NVARCHAR(1000) NOT NULL,
    [expenseDate] DATETIME2 NOT NULL,
    [category] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [supplierName] NVARCHAR(1000),
    [paymentMethod] NVARCHAR(1000),
    [externalReference] NVARCHAR(1000),
    [amount] DECIMAL(18,2) NOT NULL,
    [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [OperatingExpense_taxAmount_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [OperatingExpense_status_df] DEFAULT 'APPROVED',
    [approvedBy] NVARCHAR(1000),
    [approvedAt] DATETIME2,
    [postedAt] DATETIME2,
    [note] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OperatingExpense_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [OperatingExpense_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [OperatingExpense_retailOrgId_expenseNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[expenseNo])
);

-- CreateTable
CREATE TABLE [dbo].[Warehouse] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [licenseStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Warehouse_licenseStatus_df] DEFAULT 'UNLICENSED',
    [licenseKey] NVARCHAR(1000),
    [licensedUntil] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Warehouse_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Warehouse_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Warehouse_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Warehouse_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[Terminal] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Terminal_status_df] DEFAULT 'ACTIVE',
    [licenseStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Terminal_licenseStatus_df] DEFAULT 'UNLICENSED',
    [licenseKey] NVARCHAR(1000),
    [licensedUntil] DATETIME2,
    [registeredAt] DATETIME2 NOT NULL CONSTRAINT [Terminal_registeredAt_df] DEFAULT CURRENT_TIMESTAMP,
    [lastHeartbeatAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Terminal_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Terminal_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Terminal_storeId_code_key] UNIQUE NONCLUSTERED ([storeId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[LicenseEvent] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [terminalId] NVARCHAR(1000),
    [scope] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [previousStatus] NVARCHAR(1000),
    [newStatus] NVARCHAR(1000) NOT NULL,
    [previousLicensedUntil] DATETIME2,
    [newLicensedUntil] DATETIME2,
    [previousLicenseKey] NVARCHAR(1000),
    [newLicenseKey] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LicenseEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LicenseEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SyncNode] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [terminalId] NVARCHAR(1000),
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [nodeType] NVARCHAR(1000) NOT NULL,
    [direction] NVARCHAR(1000) NOT NULL CONSTRAINT [SyncNode_direction_df] DEFAULT 'BIDIRECTIONAL',
    [isPrimary] BIT NOT NULL CONSTRAINT [SyncNode_isPrimary_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SyncNode_status_df] DEFAULT 'ACTIVE',
    [lastHeartbeatAt] DATETIME2,
    [lastTelemetryAt] DATETIME2,
    [lastReportedHealth] NVARCHAR(1000),
    [lastReportedUpstreamQueued] INT,
    [lastReportedUpstreamInFlight] INT,
    [lastReportedDownstreamQueued] INT,
    [lastReportedDeadLetter] INT,
    [lastReportedLastSyncAt] DATETIME2,
    [lastReportedLastLocalWriteAt] DATETIME2,
    [autoSyncEnabled] BIT NOT NULL CONSTRAINT [SyncNode_autoSyncEnabled_df] DEFAULT 1,
    [syncIntervalMinutes] INT NOT NULL CONSTRAINT [SyncNode_syncIntervalMinutes_df] DEFAULT 15,
    [syncActiveFromMinutes] INT NOT NULL CONSTRAINT [SyncNode_syncActiveFromMinutes_df] DEFAULT 0,
    [syncActiveToMinutes] INT NOT NULL CONSTRAINT [SyncNode_syncActiveToMinutes_df] DEFAULT 1440,
    [syncJitterSeconds] INT NOT NULL CONSTRAINT [SyncNode_syncJitterSeconds_df] DEFAULT 30,
    [syncBackoffBaseSeconds] INT NOT NULL CONSTRAINT [SyncNode_syncBackoffBaseSeconds_df] DEFAULT 60,
    [syncBackoffMaxSeconds] INT NOT NULL CONSTRAINT [SyncNode_syncBackoffMaxSeconds_df] DEFAULT 900,
    [nextScheduledSyncAt] DATETIME2,
    [lastManualSyncAt] DATETIME2,
    [lastAutoSyncAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SyncNode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SyncNode_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SyncNode_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Permission] (
    [id] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Permission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Permission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permission_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Role_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Role_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[RolePermission] (
    [roleId] NVARCHAR(1000) NOT NULL,
    [permissionId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RolePermission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RolePermission_pkey] PRIMARY KEY CLUSTERED ([roleId],[permissionId])
);

-- CreateTable
CREATE TABLE [dbo].[RetailUser] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [homeStoreId] NVARCHAR(1000),
    [loginId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000),
    [displayName] NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000),
    [passwordUpdatedAt] DATETIME2,
    [failedLoginAttempts] INT NOT NULL CONSTRAINT [RetailUser_failedLoginAttempts_df] DEFAULT 0,
    [lockedUntil] DATETIME2,
    [lastLoginAt] DATETIME2,
    [accountStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [RetailUser_accountStatus_df] DEFAULT 'INVITED',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [RetailUser_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetailUser_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [RetailUser_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RetailUser_retailOrgId_loginId_key] UNIQUE NONCLUSTERED ([retailOrgId],[loginId])
);

-- CreateTable
CREATE TABLE [dbo].[RetailUserRole] (
    [retailUserId] NVARCHAR(1000) NOT NULL,
    [roleId] NVARCHAR(1000) NOT NULL,
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [RetailUserRole_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RetailUserRole_pkey] PRIMARY KEY CLUSTERED ([retailUserId],[roleId])
);

-- CreateTable
CREATE TABLE [dbo].[RetailUserSession] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [retailUserId] NVARCHAR(1000) NOT NULL,
    [tokenHash] NVARCHAR(1000) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetailUserSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [lastSeenAt] DATETIME2 NOT NULL CONSTRAINT [RetailUserSession_lastSeenAt_df] DEFAULT CURRENT_TIMESTAMP,
    [revokedAt] DATETIME2,
    [ipAddress] NVARCHAR(1000),
    [userAgent] NVARCHAR(1000),
    CONSTRAINT [RetailUserSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RetailUserSession_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[Customer] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [customerNo] NVARCHAR(1000) NOT NULL,
    [customerType] NVARCHAR(1000) NOT NULL CONSTRAINT [Customer_customerType_df] DEFAULT 'INDIVIDUAL',
    [fullName] NVARCHAR(1000) NOT NULL,
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [addressLine1] NVARCHAR(1000),
    [city] NVARCHAR(1000),
    [countryCode] NVARCHAR(1000),
    [loyaltyEnrolled] BIT NOT NULL CONSTRAINT [Customer_loyaltyEnrolled_df] DEFAULT 0,
    [loyaltyTier] NVARCHAR(1000),
    [loyaltyPointsBalance] INT NOT NULL CONSTRAINT [Customer_loyaltyPointsBalance_df] DEFAULT 0,
    [allowCreditSales] BIT NOT NULL CONSTRAINT [Customer_allowCreditSales_df] DEFAULT 0,
    [creditLimitAmount] DECIMAL(12,2),
    [receivableBalanceAmount] DECIMAL(12,2) NOT NULL CONSTRAINT [Customer_receivableBalanceAmount_df] DEFAULT 0,
    [note] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Customer_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [Customer_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Customer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Customer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Customer_retailOrgId_customerNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[customerNo])
);

-- CreateTable
CREATE TABLE [dbo].[CustomerAccountEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [customerId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [terminalId] NVARCHAR(1000),
    [posTransactionId] NVARCHAR(1000),
    [bankAccountId] NVARCHAR(1000),
    [entryType] NVARCHAR(1000) NOT NULL,
    [transactionNoSnapshot] NVARCHAR(1000),
    [sourceTransactionNoSnapshot] NVARCHAR(1000),
    [bankCodeSnapshot] NVARCHAR(1000),
    [bankNameSnapshot] NVARCHAR(1000),
    [bankBranchCodeSnapshot] NVARCHAR(1000),
    [bankBranchNameSnapshot] NVARCHAR(1000),
    [bankAccountNumberSnapshot] NVARCHAR(1000),
    [bankAccountNameSnapshot] NVARCHAR(1000),
    [receivableDeltaAmount] DECIMAL(12,2) NOT NULL CONSTRAINT [CustomerAccountEntry_receivableDeltaAmount_df] DEFAULT 0,
    [loyaltyPointsDelta] INT NOT NULL CONSTRAINT [CustomerAccountEntry_loyaltyPointsDelta_df] DEFAULT 0,
    [resultingReceivableBalance] DECIMAL(12,2) NOT NULL CONSTRAINT [CustomerAccountEntry_resultingReceivableBalance_df] DEFAULT 0,
    [resultingLoyaltyPointsBalance] INT NOT NULL CONSTRAINT [CustomerAccountEntry_resultingLoyaltyPointsBalance_df] DEFAULT 0,
    [note] NVARCHAR(1000),
    [originNodeCode] NVARCHAR(1000),
    [occurredAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerAccountEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CustomerAccountEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Supplier] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [supplierNo] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [contactName] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [addressLine1] NVARCHAR(1000),
    [city] NVARCHAR(1000),
    [countryCode] NVARCHAR(1000),
    [leadTimeDays] INT,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Supplier_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [Supplier_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Supplier_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Supplier_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Supplier_retailOrgId_supplierNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[supplierNo])
);

-- CreateTable
CREATE TABLE [dbo].[TaxProfile] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [ratePercent] DECIMAL(5,2) NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [TaxProfile_isDefault_df] DEFAULT 0,
    [isTaxInclusive] BIT NOT NULL CONSTRAINT [TaxProfile_isTaxInclusive_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TaxProfile_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [TaxProfile_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TaxProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [TaxProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TaxProfile_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[TenderMethod] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [paymentMethod] NVARCHAR(1000) NOT NULL,
    [gatewayProvider] NVARCHAR(1000),
    [gatewayMode] NVARCHAR(1000),
    [gatewayMerchantId] NVARCHAR(1000),
    [gatewayPublicKey] NVARCHAR(1000),
    [gatewaySecretMask] NVARCHAR(1000),
    [gatewayWebhookSecretMask] NVARCHAR(1000),
    [gatewayCallbackUrl] NVARCHAR(1000),
    [gatewayActive] BIT NOT NULL CONSTRAINT [TenderMethod_gatewayActive_df] DEFAULT 0,
    [gatewayStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [TenderMethod_gatewayStatus_df] DEFAULT 'DISABLED',
    [gatewayConfigJson] NVARCHAR(max),
    [description] NVARCHAR(1000),
    [requiresReference] BIT NOT NULL CONSTRAINT [TenderMethod_requiresReference_df] DEFAULT 0,
    [allowChange] BIT NOT NULL CONSTRAINT [TenderMethod_allowChange_df] DEFAULT 0,
    [allowRefund] BIT NOT NULL CONSTRAINT [TenderMethod_allowRefund_df] DEFAULT 1,
    [allowOpenCashDrawer] BIT NOT NULL CONSTRAINT [TenderMethod_allowOpenCashDrawer_df] DEFAULT 0,
    [sortOrder] INT NOT NULL CONSTRAINT [TenderMethod_sortOrder_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TenderMethod_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [TenderMethod_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TenderMethod_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [TenderMethod_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TenderMethod_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[PromotionCampaign] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [discountType] NVARCHAR(1000) NOT NULL,
    [targetScope] NVARCHAR(1000) NOT NULL CONSTRAINT [PromotionCampaign_targetScope_df] DEFAULT 'ALL_ITEMS',
    [discountValue] DECIMAL(18,2) NOT NULL,
    [minimumBasketAmount] DECIMAL(18,2),
    [minimumLineQuantity] DECIMAL(18,3),
    [buyQuantity] DECIMAL(18,3),
    [rewardQuantity] DECIMAL(18,3),
    [targetDepartmentCode] NVARCHAR(1000),
    [targetCategoryCode] NVARCHAR(1000),
    [targetProductCode] NVARCHAR(1000),
    [eligibleStoreCodes] NVARCHAR(max),
    [eligibleCustomerTypes] NVARCHAR(max),
    [eligibleLoyaltyTiers] NVARCHAR(max),
    [activeDaysOfWeek] NVARCHAR(max),
    [activeFromMinutes] INT,
    [activeToMinutes] INT,
    [couponRequired] BIT NOT NULL CONSTRAINT [PromotionCampaign_couponRequired_df] DEFAULT 0,
    [couponCode] NVARCHAR(1000),
    [allowWithLoyalty] BIT NOT NULL CONSTRAINT [PromotionCampaign_allowWithLoyalty_df] DEFAULT 1,
    [applyOncePerBasket] BIT NOT NULL CONSTRAINT [PromotionCampaign_applyOncePerBasket_df] DEFAULT 0,
    [priority] INT NOT NULL CONSTRAINT [PromotionCampaign_priority_df] DEFAULT 0,
    [startAt] DATETIME2,
    [endAt] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PromotionCampaign_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [PromotionCampaign_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PromotionCampaign_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [PromotionCampaign_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PromotionCampaign_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[ProductDepartment] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [sortOrder] INT NOT NULL CONSTRAINT [ProductDepartment_sortOrder_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ProductDepartment_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [ProductDepartment_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductDepartment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [ProductDepartment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProductDepartment_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[ProductCategory] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [departmentId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [sortOrder] INT NOT NULL CONSTRAINT [ProductCategory_sortOrder_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ProductCategory_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [ProductCategory_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [ProductCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProductCategory_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[UnitOfMeasure] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [decimalPrecision] INT NOT NULL CONSTRAINT [UnitOfMeasure_decimalPrecision_df] DEFAULT 0,
    [allowFractionalSale] BIT NOT NULL CONSTRAINT [UnitOfMeasure_allowFractionalSale_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [UnitOfMeasure_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [UnitOfMeasure_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UnitOfMeasure_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [UnitOfMeasure_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UnitOfMeasure_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[UnitOfMeasureSchedule] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [baseUnitOfMeasureId] NVARCHAR(1000) NOT NULL,
    [isDefaultForStock] BIT NOT NULL CONSTRAINT [UnitOfMeasureSchedule_isDefaultForStock_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [UnitOfMeasureSchedule_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [UnitOfMeasureSchedule_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UnitOfMeasureSchedule_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [UnitOfMeasureSchedule_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UnitOfMeasureSchedule_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[UnitOfMeasureScheduleLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [scheduleId] NVARCHAR(1000) NOT NULL,
    [unitOfMeasureId] NVARCHAR(1000) NOT NULL,
    [conversionFactor] DECIMAL(18,6) NOT NULL CONSTRAINT [UnitOfMeasureScheduleLine_conversionFactor_df] DEFAULT 1,
    [isBaseUnit] BIT NOT NULL CONSTRAINT [UnitOfMeasureScheduleLine_isBaseUnit_df] DEFAULT 0,
    [allowSale] BIT NOT NULL CONSTRAINT [UnitOfMeasureScheduleLine_allowSale_df] DEFAULT 1,
    [allowPurchase] BIT NOT NULL CONSTRAINT [UnitOfMeasureScheduleLine_allowPurchase_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [UnitOfMeasureScheduleLine_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UnitOfMeasureScheduleLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [UnitOfMeasureScheduleLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UnitOfMeasureScheduleLine_scheduleId_unitOfMeasureId_key] UNIQUE NONCLUSTERED ([scheduleId],[unitOfMeasureId])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryCatalog] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [InventoryCatalog_status_df] DEFAULT 'ACTIVE',
    [effectiveFrom] DATETIME2,
    [effectiveUntil] DATETIME2,
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [InventoryCatalog_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryCatalog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [InventoryCatalog_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryCatalog_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryCatalogProduct] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [catalogId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [InventoryCatalogProduct_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryCatalogProduct_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventoryCatalogProduct_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryCatalogProduct_catalogId_productId_key] UNIQUE NONCLUSTERED ([catalogId],[productId])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryCatalogStore] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [catalogId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryCatalogStore_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventoryCatalogStore_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryCatalogStore_catalogId_storeId_key] UNIQUE NONCLUSTERED ([catalogId],[storeId])
);

-- CreateTable
CREATE TABLE [dbo].[Product] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [taxProfileId] NVARCHAR(1000),
    [baseUnitOfMeasureId] NVARCHAR(1000),
    [uomScheduleId] NVARCHAR(1000),
    [code] NVARCHAR(1000) NOT NULL,
    [sku] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [shortName] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [productType] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_productType_df] DEFAULT 'STOCK',
    [department] NVARCHAR(1000),
    [category] NVARCHAR(1000),
    [subcategory] NVARCHAR(1000),
    [brand] NVARCHAR(1000),
    [seasonCode] NVARCHAR(1000),
    [unitOfMeasure] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_unitOfMeasure_df] DEFAULT 'EA',
    [packSize] NVARCHAR(1000),
    [countryOfOrigin] NVARCHAR(1000),
    [primaryImageUrl] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [taxable] BIT NOT NULL CONSTRAINT [Product_taxable_df] DEFAULT 1,
    [trackInventory] BIT NOT NULL CONSTRAINT [Product_trackInventory_df] DEFAULT 1,
    [isSerialized] BIT NOT NULL CONSTRAINT [Product_isSerialized_df] DEFAULT 0,
    [allowPriceOverride] BIT NOT NULL CONSTRAINT [Product_allowPriceOverride_df] DEFAULT 0,
    [mustEnterPriceAtPos] BIT NOT NULL CONSTRAINT [Product_mustEnterPriceAtPos_df] DEFAULT 0,
    [minStockLevel] DECIMAL(18,3),
    [reorderPoint] DECIMAL(18,3),
    [reorderQuantity] DECIMAL(18,3),
    [safetyStockLevel] DECIMAL(18,3),
    [shelfLifeDays] INT,
    [weightKg] DECIMAL(18,3),
    [volumeLitres] DECIMAL(18,3),
    [baseUnitPrice] DECIMAL(18,2) NOT NULL,
    [baseCostPrice] DECIMAL(18,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [Product_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Product_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [Product_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Product_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code]),
    CONSTRAINT [Product_retailOrgId_sku_key] UNIQUE NONCLUSTERED ([retailOrgId],[sku])
);

-- CreateTable
CREATE TABLE [dbo].[GiftCertificate] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [certificateNo] NVARCHAR(1000) NOT NULL,
    [recipientName] NVARCHAR(1000),
    [purchaserName] NVARCHAR(1000),
    [originalAmount] DECIMAL(18,2) NOT NULL,
    [balanceAmount] DECIMAL(18,2) NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL,
    [issueDate] DATETIME2 NOT NULL CONSTRAINT [GiftCertificate_issueDate_df] DEFAULT CURRENT_TIMESTAMP,
    [expiryDate] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [GiftCertificate_status_df] DEFAULT 'ACTIVE',
    [originNodeCode] NVARCHAR(1000),
    [lastModifiedByNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [GiftCertificate_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GiftCertificate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [GiftCertificate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GiftCertificate_retailOrgId_certificateNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[certificateNo])
);

-- CreateTable
CREATE TABLE [dbo].[ProductSupplier] (
    [id] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [supplierId] NVARCHAR(1000) NOT NULL,
    [supplierSku] NVARCHAR(1000),
    [supplierProductName] NVARCHAR(1000),
    [packCostPrice] DECIMAL(18,2),
    [leadTimeDays] INT,
    [minimumOrderQuantity] DECIMAL(18,3),
    [isPrimary] BIT NOT NULL CONSTRAINT [ProductSupplier_isPrimary_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductSupplier_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ProductSupplier_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProductSupplier_productId_supplierId_key] UNIQUE NONCLUSTERED ([productId],[supplierId])
);

-- CreateTable
CREATE TABLE [dbo].[Barcode] (
    [id] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [barcodeType] NVARCHAR(1000) NOT NULL CONSTRAINT [Barcode_barcodeType_df] DEFAULT 'EAN13',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Barcode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Barcode_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Barcode_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[PriceList] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [currencyCode] NVARCHAR(1000) NOT NULL,
    [isDefault] BIT NOT NULL CONSTRAINT [PriceList_isDefault_df] DEFAULT 0,
    [customerType] NVARCHAR(1000),
    [loyaltyTier] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PriceList_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PriceList_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PriceList_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PriceList_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[PriceListEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [priceListId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [unitPrice] DECIMAL(18,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PriceListEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PriceListEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PriceListEntry_priceListId_productId_key] UNIQUE NONCLUSTERED ([priceListId],[productId])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryLocation] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [locationType] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [InventoryLocation_status_df] DEFAULT 'ACTIVE',
    [useForSalesDefault] BIT NOT NULL CONSTRAINT [InventoryLocation_useForSalesDefault_df] DEFAULT 0,
    [useForReceivingDefault] BIT NOT NULL CONSTRAINT [InventoryLocation_useForReceivingDefault_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryLocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventoryLocation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryLocation_retailOrgId_code_key] UNIQUE NONCLUSTERED ([retailOrgId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryLedgerEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [movementType] NVARCHAR(1000) NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitCost] DECIMAL(18,2),
    [referenceType] NVARCHAR(1000) NOT NULL,
    [referenceId] NVARCHAR(1000) NOT NULL,
    [externalReference] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [occurredAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryLedgerEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InventoryLedgerEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[InventorySerialUnit] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000),
    [productId] NVARCHAR(1000) NOT NULL,
    [serialNumber] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [InventorySerialUnit_status_df] DEFAULT 'AVAILABLE',
    [sourceReferenceType] NVARCHAR(1000),
    [sourceReferenceId] NVARCHAR(1000),
    [sourceReferenceLabel] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [lastOccurredAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventorySerialUnit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventorySerialUnit_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventorySerialUnit_retailOrgId_productId_serialNumber_key] UNIQUE NONCLUSTERED ([retailOrgId],[productId],[serialNumber])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrder] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [supplierId] NVARCHAR(1000),
    [purchaseOrderNo] NVARCHAR(1000) NOT NULL,
    [externalReference] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PurchaseOrder_status_df] DEFAULT 'DRAFT',
    [note] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000),
    [subtotalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_subtotalAmount_df] DEFAULT 0,
    [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_discountAmount_df] DEFAULT 0,
    [shippingAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_shippingAmount_df] DEFAULT 0,
    [freightAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_freightAmount_df] DEFAULT 0,
    [otherChargesAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_otherChargesAmount_df] DEFAULT 0,
    [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_taxAmount_df] DEFAULT 0,
    [grandTotalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [PurchaseOrder_grandTotalAmount_df] DEFAULT 0,
    [committedAt] DATETIME2,
    [closedAt] DATETIME2,
    [closureReason] NVARCHAR(1000),
    [closureNote] NVARCHAR(1000),
    [closureOperatorName] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PurchaseOrder_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PurchaseOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrder_retailOrgId_purchaseOrderNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[purchaseOrderNo])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseOrderLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [purchaseOrderId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [lineNo] INT NOT NULL,
    [orderedQuantity] DECIMAL(18,3) NOT NULL,
    [receivedQuantity] DECIMAL(18,3) NOT NULL CONSTRAINT [PurchaseOrderLine_receivedQuantity_df] DEFAULT 0,
    [exceptionQuantity] DECIMAL(18,3) NOT NULL CONSTRAINT [PurchaseOrderLine_exceptionQuantity_df] DEFAULT 0,
    [unitCost] DECIMAL(18,2),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PurchaseOrderLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PurchaseOrderLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PurchaseOrderLine_purchaseOrderId_lineNo_key] UNIQUE NONCLUSTERED ([purchaseOrderId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[InterStoreTransfer] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [sourceStoreId] NVARCHAR(1000) NOT NULL,
    [destinationStoreId] NVARCHAR(1000) NOT NULL,
    [sourceInventoryLocationId] NVARCHAR(1000) NOT NULL,
    [destinationInventoryLocationId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [transferNo] NVARCHAR(1000) NOT NULL,
    [transferBatchNo] NVARCHAR(1000),
    [lineNo] INT NOT NULL CONSTRAINT [InterStoreTransfer_lineNo_df] DEFAULT 1,
    [externalReference] NVARCHAR(1000),
    [origin] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [InterStoreTransfer_status_df] DEFAULT 'REQUESTED',
    [requestedQuantity] DECIMAL(18,3) NOT NULL,
    [issuedQuantity] DECIMAL(18,3) NOT NULL CONSTRAINT [InterStoreTransfer_issuedQuantity_df] DEFAULT 0,
    [receivedQuantity] DECIMAL(18,3) NOT NULL CONSTRAINT [InterStoreTransfer_receivedQuantity_df] DEFAULT 0,
    [unitCost] DECIMAL(18,2),
    [issuedSerialNumbersSnapshot] NVARCHAR(max),
    [receivedSerialNumbersSnapshot] NVARCHAR(max),
    [requestNote] NVARCHAR(1000),
    [issueNote] NVARCHAR(1000),
    [receiptNote] NVARCHAR(1000),
    [requestOperatorName] NVARCHAR(1000),
    [issueOperatorName] NVARCHAR(1000),
    [receiptOperatorName] NVARCHAR(1000),
    [requestedByNodeCode] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [destinationNodeCode] NVARCHAR(1000),
    [requestedAt] DATETIME2 NOT NULL CONSTRAINT [InterStoreTransfer_requestedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [requiredAt] DATETIME2,
    [issuedAt] DATETIME2,
    [receivedAt] DATETIME2,
    [closedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InterStoreTransfer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InterStoreTransfer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InterStoreTransfer_retailOrgId_transferNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[transferNo])
);

-- CreateTable
CREATE TABLE [dbo].[GoodsReceipt] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [purchaseOrderId] NVARCHAR(1000),
    [supplierId] NVARCHAR(1000),
    [receiptNo] NVARCHAR(1000) NOT NULL,
    [externalReference] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000),
    [receivedAt] DATETIME2 NOT NULL,
    [postedAt] DATETIME2 NOT NULL CONSTRAINT [GoodsReceipt_postedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [sourceNodeCode] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GoodsReceipt_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GoodsReceipt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GoodsReceipt_retailOrgId_receiptNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[receiptNo])
);

-- CreateTable
CREATE TABLE [dbo].[GoodsReceiptLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [goodsReceiptId] NVARCHAR(1000) NOT NULL,
    [purchaseOrderLineId] NVARCHAR(1000),
    [productId] NVARCHAR(1000) NOT NULL,
    [lineNo] INT NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitCost] DECIMAL(18,2),
    [serialNumbersSnapshot] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GoodsReceiptLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GoodsReceiptLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GoodsReceiptLine_goodsReceiptId_lineNo_key] UNIQUE NONCLUSTERED ([goodsReceiptId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[SupplierClaim] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [supplierId] NVARCHAR(1000) NOT NULL,
    [purchaseOrderId] NVARCHAR(1000),
    [goodsReceiptId] NVARCHAR(1000),
    [claimNo] NVARCHAR(1000) NOT NULL,
    [externalReference] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SupplierClaim_status_df] DEFAULT 'OPEN',
    [note] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [supplierCaseReference] NVARCHAR(1000),
    [creditRequestedAt] DATETIME2,
    [creditRequestedBy] NVARCHAR(1000),
    [creditNoteReference] NVARCHAR(1000),
    [creditNoteAmount] DECIMAL(18,2),
    [creditReceivedAt] DATETIME2,
    [resolvedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SupplierClaim_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SupplierClaim_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SupplierClaim_retailOrgId_claimNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[claimNo])
);

-- CreateTable
CREATE TABLE [dbo].[SupplierClaimLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [supplierClaimId] NVARCHAR(1000) NOT NULL,
    [purchaseOrderLineId] NVARCHAR(1000),
    [goodsReceiptLineId] NVARCHAR(1000),
    [productId] NVARCHAR(1000) NOT NULL,
    [lineNo] INT NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitCost] DECIMAL(18,2),
    [reason] NVARCHAR(1000) NOT NULL,
    [note] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SupplierClaimLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SupplierClaimLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SupplierClaimLine_supplierClaimId_lineNo_key] UNIQUE NONCLUSTERED ([supplierClaimId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[SupplierReturn] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [supplierId] NVARCHAR(1000) NOT NULL,
    [purchaseOrderId] NVARCHAR(1000),
    [goodsReceiptId] NVARCHAR(1000),
    [supplierReturnNo] NVARCHAR(1000) NOT NULL,
    [externalReference] NVARCHAR(1000),
    [reason] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SupplierReturn_status_df] DEFAULT 'POSTED',
    [note] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000),
    [returnedAt] DATETIME2 NOT NULL,
    [postedAt] DATETIME2 NOT NULL CONSTRAINT [SupplierReturn_postedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [cancelledAt] DATETIME2,
    [cancellationNote] NVARCHAR(1000),
    [cancellationOperatorName] NVARCHAR(1000),
    [cancellationAcknowledgedAt] DATETIME2,
    [cancellationAcknowledgedByNodeCode] NVARCHAR(1000),
    [cancellationAcknowledgedBy] NVARCHAR(1000),
    [cancellationAcknowledgementNote] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SupplierReturn_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SupplierReturn_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SupplierReturn_retailOrgId_supplierReturnNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[supplierReturnNo])
);

-- CreateTable
CREATE TABLE [dbo].[SupplierReturnLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [supplierReturnId] NVARCHAR(1000) NOT NULL,
    [goodsReceiptLineId] NVARCHAR(1000),
    [productId] NVARCHAR(1000) NOT NULL,
    [lineNo] INT NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitCost] DECIMAL(18,2),
    [serialNumbersSnapshot] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SupplierReturnLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SupplierReturnLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SupplierReturnLine_supplierReturnId_lineNo_key] UNIQUE NONCLUSTERED ([supplierReturnId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[StockCountSession] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000),
    [warehouseId] NVARCHAR(1000),
    [inventoryLocationId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [sessionNo] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [StockCountSession_status_df] DEFAULT 'SUBMITTED',
    [previousQuantity] DECIMAL(18,3) NOT NULL,
    [countedQuantity] DECIMAL(18,3) NOT NULL,
    [varianceQuantity] DECIMAL(18,3) NOT NULL,
    [previousSerialNumbersSnapshot] NVARCHAR(max),
    [countedSerialNumbersSnapshot] NVARCHAR(max),
    [note] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000) NOT NULL,
    [submittedByNodeCode] NVARCHAR(1000),
    [committedByNodeCode] NVARCHAR(1000),
    [submittedAt] DATETIME2 NOT NULL CONSTRAINT [StockCountSession_submittedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [committedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockCountSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [StockCountSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StockCountSession_retailOrgId_sessionNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[sessionNo])
);

-- CreateTable
CREATE TABLE [dbo].[PosShift] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [terminalId] NVARCHAR(1000) NOT NULL,
    [cashierUserId] NVARCHAR(1000) NOT NULL,
    [shiftNo] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PosShift_status_df] DEFAULT 'OPEN',
    [openingFloatAmount] DECIMAL(18,2) NOT NULL,
    [closingDeclaredCash] DECIMAL(18,2),
    [closingVariance] DECIMAL(18,2),
    [originNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [PosShift_recordVersion_df] DEFAULT 1,
    [openedAt] DATETIME2 NOT NULL,
    [closedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PosShift_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PosShift_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PosShift_storeId_shiftNo_key] UNIQUE NONCLUSTERED ([storeId],[shiftNo])
);

-- CreateTable
CREATE TABLE [dbo].[PosTransaction] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [terminalId] NVARCHAR(1000) NOT NULL,
    [posShiftId] NVARCHAR(1000),
    [customerId] NVARCHAR(1000),
    [sourceTransactionId] NVARCHAR(1000),
    [sourceTransactionNo] NVARCHAR(1000),
    [transactionNo] NVARCHAR(1000) NOT NULL,
    [transactionType] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PosTransaction_status_df] DEFAULT 'PARKED',
    [customerNameSnapshot] NVARCHAR(1000),
    [cashierCodeSnapshot] NVARCHAR(1000),
    [subtotalAmount] DECIMAL(18,2) NOT NULL,
    [discountAmount] DECIMAL(18,2) NOT NULL,
    [taxAmount] DECIMAL(18,2) NOT NULL,
    [totalAmount] DECIMAL(18,2) NOT NULL,
    [paidAmount] DECIMAL(18,2) NOT NULL,
    [changeAmount] DECIMAL(18,2) NOT NULL,
    [notes] NVARCHAR(1000),
    [originNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [PosTransaction_recordVersion_df] DEFAULT 1,
    [completedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PosTransaction_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [deletedAt] DATETIME2,
    CONSTRAINT [PosTransaction_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PosTransaction_retailOrgId_transactionNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[transactionNo])
);

-- CreateTable
CREATE TABLE [dbo].[PosTransactionLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [posTransactionId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [lineIntent] NVARCHAR(1000) NOT NULL CONSTRAINT [PosTransactionLine_lineIntent_df] DEFAULT 'SALE',
    [sourceLineId] NVARCHAR(1000),
    [productCodeSnapshot] NVARCHAR(1000) NOT NULL,
    [productNameSnapshot] NVARCHAR(1000) NOT NULL,
    [barcodeSnapshot] NVARCHAR(1000),
    [appliedPromotionCodeSnapshot] NVARCHAR(1000),
    [appliedPromotionNameSnapshot] NVARCHAR(1000),
    [serialNumbersSnapshot] NVARCHAR(max),
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitPrice] DECIMAL(18,2) NOT NULL,
    [discountAmount] DECIMAL(18,2) NOT NULL,
    [taxAmount] DECIMAL(18,2) NOT NULL,
    [lineTotal] DECIMAL(18,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PosTransactionLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PosTransactionLine_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PosPayment] (
    [id] NVARCHAR(1000) NOT NULL,
    [posTransactionId] NVARCHAR(1000) NOT NULL,
    [tenderMethodId] NVARCHAR(1000),
    [bankAccountId] NVARCHAR(1000),
    [tenderMethodCodeSnapshot] NVARCHAR(1000),
    [tenderMethodNameSnapshot] NVARCHAR(1000),
    [bankCodeSnapshot] NVARCHAR(1000),
    [bankNameSnapshot] NVARCHAR(1000),
    [bankBranchCodeSnapshot] NVARCHAR(1000),
    [bankBranchNameSnapshot] NVARCHAR(1000),
    [bankAccountNumberSnapshot] NVARCHAR(1000),
    [bankAccountNameSnapshot] NVARCHAR(1000),
    [method] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [reference] NVARCHAR(1000),
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [PosPayment_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PosPayment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PosPayment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SalesOrder] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [terminalId] NVARCHAR(1000) NOT NULL,
    [customerId] NVARCHAR(1000),
    [orderNo] NVARCHAR(1000) NOT NULL,
    [sourceTransactionId] NVARCHAR(1000) NOT NULL,
    [sourceTransactionNo] NVARCHAR(1000) NOT NULL,
    [customerNoSnapshot] NVARCHAR(1000),
    [customerNameSnapshot] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SalesOrder_status_df] DEFAULT 'OPEN',
    [totalAmount] DECIMAL(18,2) NOT NULL,
    [operatorName] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [fulfilledTransactionId] NVARCHAR(1000),
    [fulfilledTransactionNo] NVARCHAR(1000),
    [originNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [SalesOrder_recordVersion_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL,
    [fulfilledAt] DATETIME2,
    [cancelledAt] DATETIME2,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SalesOrder_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SalesOrder_retailOrgId_orderNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[orderNo])
);

-- CreateTable
CREATE TABLE [dbo].[EodReconciliation] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [terminalId] NVARCHAR(1000) NOT NULL,
    [shiftId] NVARCHAR(1000) NOT NULL,
    [shiftNo] NVARCHAR(1000) NOT NULL,
    [cashierCode] NVARCHAR(1000) NOT NULL,
    [reconciliationNo] NVARCHAR(1000) NOT NULL,
    [expectedCashAmount] DECIMAL(18,2) NOT NULL,
    [declaredCashAmount] DECIMAL(18,2) NOT NULL,
    [varianceAmount] DECIMAL(18,2) NOT NULL,
    [netSalesAmount] DECIMAL(18,2) NOT NULL,
    [cashTenderedAmount] DECIMAL(18,2) NOT NULL,
    [nonCashTenderedAmount] DECIMAL(18,2) NOT NULL,
    [transactionCount] INT NOT NULL,
    [operatorName] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [originNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [EodReconciliation_recordVersion_df] DEFAULT 1,
    [reconciledAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [EodReconciliation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EodReconciliation_retailOrgId_reconciliationNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[reconciliationNo]),
    CONSTRAINT [EodReconciliation_retailOrgId_shiftId_key] UNIQUE NONCLUSTERED ([retailOrgId],[shiftId])
);

-- CreateTable
CREATE TABLE [dbo].[BankingDeposit] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [storeId] NVARCHAR(1000) NOT NULL,
    [terminalId] NVARCHAR(1000) NOT NULL,
    [reconciliationId] NVARCHAR(1000) NOT NULL,
    [bankAccountId] NVARCHAR(1000),
    [depositNo] NVARCHAR(1000) NOT NULL,
    [reconciliationNo] NVARCHAR(1000) NOT NULL,
    [shiftId] NVARCHAR(1000) NOT NULL,
    [shiftNo] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [bankName] NVARCHAR(1000),
    [bankCodeSnapshot] NVARCHAR(1000),
    [bankNameSnapshot] NVARCHAR(1000),
    [bankBranchCodeSnapshot] NVARCHAR(1000),
    [bankBranchNameSnapshot] NVARCHAR(1000),
    [bankAccountNumberSnapshot] NVARCHAR(1000),
    [bankAccountNameSnapshot] NVARCHAR(1000),
    [reference] NVARCHAR(1000),
    [operatorName] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [originNodeCode] NVARCHAR(1000),
    [recordVersion] INT NOT NULL CONSTRAINT [BankingDeposit_recordVersion_df] DEFAULT 1,
    [depositedAt] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BankingDeposit_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BankingDeposit_retailOrgId_depositNo_key] UNIQUE NONCLUSTERED ([retailOrgId],[depositNo])
);

-- CreateTable
CREATE TABLE [dbo].[SyncOutboxEvent] (
    [id] NVARCHAR(1000) NOT NULL,
    [syncNodeId] NVARCHAR(1000) NOT NULL,
    [targetNodeCode] NVARCHAR(1000),
    [aggregateType] NVARCHAR(1000) NOT NULL,
    [aggregateId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [idempotencyKey] NVARCHAR(1000) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SyncOutboxEvent_status_df] DEFAULT 'PENDING',
    [attemptCount] INT NOT NULL CONSTRAINT [SyncOutboxEvent_attemptCount_df] DEFAULT 0,
    [lastAttemptAt] DATETIME2,
    [acknowledgedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SyncOutboxEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SyncOutboxEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SyncOutboxEvent_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey])
);

-- CreateTable
CREATE TABLE [dbo].[SyncInboundEvent] (
    [id] NVARCHAR(1000) NOT NULL,
    [syncNodeId] NVARCHAR(1000) NOT NULL,
    [sourceNodeCode] NVARCHAR(1000) NOT NULL,
    [aggregateType] NVARCHAR(1000) NOT NULL,
    [aggregateId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000) NOT NULL,
    [idempotencyKey] NVARCHAR(1000) NOT NULL,
    [recordVersion] INT NOT NULL CONSTRAINT [SyncInboundEvent_recordVersion_df] DEFAULT 1,
    [payload] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SyncInboundEvent_status_df] DEFAULT 'ACKNOWLEDGED',
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [SyncInboundEvent_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [appliedAt] DATETIME2,
    [errorMessage] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SyncInboundEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SyncInboundEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SyncInboundEvent_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey])
);

-- CreateTable
CREATE TABLE [dbo].[SyncInboxCheckpoint] (
    [id] NVARCHAR(1000) NOT NULL,
    [syncNodeId] NVARCHAR(1000) NOT NULL,
    [remoteNodeCode] NVARCHAR(1000) NOT NULL,
    [lastEventId] NVARCHAR(1000),
    [lastReceivedCursor] NVARCHAR(1000),
    [lastReceivedAt] DATETIME2,
    [lastAppliedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SyncInboxCheckpoint_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SyncInboxCheckpoint_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SyncInboxCheckpoint_syncNodeId_remoteNodeCode_key] UNIQUE NONCLUSTERED ([syncNodeId],[remoteNodeCode])
);

-- CreateTable
CREATE TABLE [dbo].[SyncOperatorAction] (
    [id] NVARCHAR(1000) NOT NULL,
    [syncNodeId] NVARCHAR(1000) NOT NULL,
    [syncOutboxEventId] NVARCHAR(1000),
    [syncInboundEventId] NVARCHAR(1000),
    [actionType] NVARCHAR(1000) NOT NULL,
    [operatorName] NVARCHAR(1000) NOT NULL,
    [note] NVARCHAR(1000) NOT NULL,
    [aggregateType] NVARCHAR(1000),
    [eventType] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SyncOperatorAction_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SyncOperatorAction_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SecurityLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [kind] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL CONSTRAINT [SecurityLog_severity_df] DEFAULT 'INFO',
    [category] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [actorLabel] NVARCHAR(1000) NOT NULL,
    [targetType] NVARCHAR(1000),
    [targetRef] NVARCHAR(1000),
    [sourceNodeCode] NVARCHAR(1000),
    [message] NVARCHAR(1000) NOT NULL,
    [detailsJson] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SecurityLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SecurityLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BankBranch_bankId_status_idx] ON [dbo].[BankBranch]([bankId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BankAccount_retailOrgId_status_idx] ON [dbo].[BankAccount]([retailOrgId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Store_retailOrgId_storeGroupCode_idx] ON [dbo].[Store]([retailOrgId], [storeGroupCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Store_retailOrgId_licenseStatus_idx] ON [dbo].[Store]([retailOrgId], [licenseStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Store_retailOrgId_storeMode_idx] ON [dbo].[Store]([retailOrgId], [storeMode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GlAccount_retailOrgId_accountType_status_idx] ON [dbo].[GlAccount]([retailOrgId], [accountType], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GlJournalEntry_retailOrgId_postingDate_status_idx] ON [dbo].[GlJournalEntry]([retailOrgId], [postingDate], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GlJournalLine_accountId_idx] ON [dbo].[GlJournalLine]([accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GlJournalLine_storeId_idx] ON [dbo].[GlJournalLine]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OperatingExpense_retailOrgId_expenseDate_status_idx] ON [dbo].[OperatingExpense]([retailOrgId], [expenseDate], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OperatingExpense_storeId_idx] ON [dbo].[OperatingExpense]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Terminal_retailOrgId_licenseStatus_idx] ON [dbo].[Terminal]([retailOrgId], [licenseStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LicenseEvent_retailOrgId_createdAt_idx] ON [dbo].[LicenseEvent]([retailOrgId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LicenseEvent_storeId_createdAt_idx] ON [dbo].[LicenseEvent]([storeId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LicenseEvent_terminalId_createdAt_idx] ON [dbo].[LicenseEvent]([terminalId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetailUserSession_retailUserId_expiresAt_idx] ON [dbo].[RetailUserSession]([retailUserId], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAccountEntry_customerId_occurredAt_idx] ON [dbo].[CustomerAccountEntry]([customerId], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAccountEntry_posTransactionId_idx] ON [dbo].[CustomerAccountEntry]([posTransactionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAccountEntry_retailOrgId_occurredAt_idx] ON [dbo].[CustomerAccountEntry]([retailOrgId], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAccountEntry_bankAccountId_idx] ON [dbo].[CustomerAccountEntry]([bankAccountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PromotionCampaign_retailOrgId_status_updatedAt_idx] ON [dbo].[PromotionCampaign]([retailOrgId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UnitOfMeasureSchedule_retailOrgId_status_isDefaultForStock_idx] ON [dbo].[UnitOfMeasureSchedule]([retailOrgId], [status], [isDefaultForStock]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UnitOfMeasureScheduleLine_unitOfMeasureId_idx] ON [dbo].[UnitOfMeasureScheduleLine]([unitOfMeasureId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryCatalog_retailOrgId_status_idx] ON [dbo].[InventoryCatalog]([retailOrgId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryCatalogProduct_retailOrgId_productId_idx] ON [dbo].[InventoryCatalogProduct]([retailOrgId], [productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryCatalogStore_retailOrgId_storeId_idx] ON [dbo].[InventoryCatalogStore]([retailOrgId], [storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GiftCertificate_storeId_status_idx] ON [dbo].[GiftCertificate]([storeId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PriceList_retailOrgId_customerType_loyaltyTier_status_idx] ON [dbo].[PriceList]([retailOrgId], [customerType], [loyaltyTier], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventorySerialUnit_storeId_productId_status_updatedAt_idx] ON [dbo].[InventorySerialUnit]([storeId], [productId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventorySerialUnit_inventoryLocationId_productId_status_updatedAt_idx] ON [dbo].[InventorySerialUnit]([inventoryLocationId], [productId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrder_inventoryLocationId_status_updatedAt_idx] ON [dbo].[PurchaseOrder]([inventoryLocationId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrderLine_productId_updatedAt_idx] ON [dbo].[PurchaseOrderLine]([productId], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterStoreTransfer_retailOrgId_transferBatchNo_idx] ON [dbo].[InterStoreTransfer]([retailOrgId], [transferBatchNo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterStoreTransfer_sourceStoreId_status_updatedAt_idx] ON [dbo].[InterStoreTransfer]([sourceStoreId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterStoreTransfer_destinationStoreId_status_updatedAt_idx] ON [dbo].[InterStoreTransfer]([destinationStoreId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterStoreTransfer_sourceInventoryLocationId_updatedAt_idx] ON [dbo].[InterStoreTransfer]([sourceInventoryLocationId], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterStoreTransfer_destinationInventoryLocationId_updatedAt_idx] ON [dbo].[InterStoreTransfer]([destinationInventoryLocationId], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceipt_inventoryLocationId_postedAt_idx] ON [dbo].[GoodsReceipt]([inventoryLocationId], [postedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaim_inventoryLocationId_status_updatedAt_idx] ON [dbo].[SupplierClaim]([inventoryLocationId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturn_inventoryLocationId_postedAt_idx] ON [dbo].[SupplierReturn]([inventoryLocationId], [postedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockCountSession_inventoryLocationId_status_updatedAt_idx] ON [dbo].[StockCountSession]([inventoryLocationId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockCountSession_productId_status_updatedAt_idx] ON [dbo].[StockCountSession]([productId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransactionLine_appliedPromotionCodeSnapshot_idx] ON [dbo].[PosTransactionLine]([appliedPromotionCodeSnapshot]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SalesOrder_storeId_status_updatedAt_idx] ON [dbo].[SalesOrder]([storeId], [status], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SalesOrder_customerId_updatedAt_idx] ON [dbo].[SalesOrder]([customerId], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EodReconciliation_storeId_reconciledAt_idx] ON [dbo].[EodReconciliation]([storeId], [reconciledAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EodReconciliation_terminalId_reconciledAt_idx] ON [dbo].[EodReconciliation]([terminalId], [reconciledAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BankingDeposit_reconciliationId_depositedAt_idx] ON [dbo].[BankingDeposit]([reconciliationId], [depositedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BankingDeposit_storeId_depositedAt_idx] ON [dbo].[BankingDeposit]([storeId], [depositedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SecurityLog_retailOrgId_createdAt_idx] ON [dbo].[SecurityLog]([retailOrgId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SecurityLog_retailOrgId_kind_createdAt_idx] ON [dbo].[SecurityLog]([retailOrgId], [kind], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SecurityLog_retailOrgId_category_createdAt_idx] ON [dbo].[SecurityLog]([retailOrgId], [category], [createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
