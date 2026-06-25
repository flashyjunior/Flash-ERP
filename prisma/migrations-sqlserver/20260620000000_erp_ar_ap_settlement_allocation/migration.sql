IF OBJECT_ID(N'[dbo].[ErpSettlementAllocation]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpSettlementAllocation] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [partyProfileId] NVARCHAR(1000) NULL,
        [operationalDocumentId] NVARCHAR(1000) NOT NULL,
        [postingJournalEntryId] NVARCHAR(1000) NULL,
        [allocationNo] NVARCHAR(1000) NOT NULL,
        [allocationType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpSettlementAllocation_allocationType_df] DEFAULT 'CUSTOMER_RECEIPT',
        [partyType] NVARCHAR(1000) NOT NULL,
        [partyNo] NVARCHAR(1000) NOT NULL,
        [partyName] NVARCHAR(1000) NOT NULL,
        [allocationDate] DATETIME2 NOT NULL,
        [postingDate] DATETIME2 NOT NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [paymentAccountCode] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpSettlementAllocation_paymentAccountCode_df] DEFAULT '1000',
        [amount] DECIMAL(18,2) NOT NULL,
        [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpSettlementAllocation_discountAmount_df] DEFAULT 0,
        [writeOffAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpSettlementAllocation_writeOffAmount_df] DEFAULT 0,
        [memo] NVARCHAR(max) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpSettlementAllocation_status_df] DEFAULT 'DRAFT',
        [postedAt] DATETIME2 NULL,
        [postedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpSettlementAllocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpSettlementAllocation_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpSettlementAllocation_retailOrgId_allocationNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [allocationNo])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpSettlementAllocation_companyId_allocationType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpSettlementAllocation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpSettlementAllocation_companyId_allocationType_status_idx] ON [dbo].[ErpSettlementAllocation]([companyId], [allocationType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpSettlementAllocation_operationalDocumentId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpSettlementAllocation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpSettlementAllocation_operationalDocumentId_idx] ON [dbo].[ErpSettlementAllocation]([operationalDocumentId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpSettlementAllocation_partyProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpSettlementAllocation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpSettlementAllocation_partyProfileId_idx] ON [dbo].[ErpSettlementAllocation]([partyProfileId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpSettlementAllocation_postingJournalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpSettlementAllocation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpSettlementAllocation_postingJournalEntryId_idx] ON [dbo].[ErpSettlementAllocation]([postingJournalEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpSettlementAllocation_retailOrgId_allocationDate_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpSettlementAllocation]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpSettlementAllocation_retailOrgId_allocationDate_status_idx] ON [dbo].[ErpSettlementAllocation]([retailOrgId], [allocationDate], [status]);
END
