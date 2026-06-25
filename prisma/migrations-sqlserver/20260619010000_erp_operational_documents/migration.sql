IF OBJECT_ID(N'[dbo].[ErpOperationalDocument]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpOperationalDocument] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [partyProfileId] NVARCHAR(1000) NULL,
        [postingJournalEntryId] NVARCHAR(1000) NULL,
        [documentNo] NVARCHAR(1000) NOT NULL,
        [documentType] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpOperationalDocument_documentType_df] DEFAULT 'SALES_INVOICE',
        [documentDirection] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpOperationalDocument_documentDirection_df] DEFAULT 'SALES',
        [partyType] NVARCHAR(1000) NOT NULL,
        [partyNo] NVARCHAR(1000) NOT NULL,
        [partyName] NVARCHAR(1000) NOT NULL,
        [documentDate] DATETIME2 NOT NULL,
        [postingDate] DATETIME2 NOT NULL,
        [dueDate] DATETIME2 NULL,
        [currencyCode] NVARCHAR(1000) NOT NULL,
        [exchangeRate] DECIMAL(18,6) NOT NULL CONSTRAINT [ErpOperationalDocument_exchangeRate_df] DEFAULT 1,
        [externalReference] NVARCHAR(1000) NULL,
        [memo] NVARCHAR(max) NULL,
        [subtotalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocument_subtotalAmount_df] DEFAULT 0,
        [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocument_discountAmount_df] DEFAULT 0,
        [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocument_taxAmount_df] DEFAULT 0,
        [chargeAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocument_chargeAmount_df] DEFAULT 0,
        [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocument_totalAmount_df] DEFAULT 0,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpOperationalDocument_status_df] DEFAULT 'DRAFT',
        [postedAt] DATETIME2 NULL,
        [postedBy] NVARCHAR(1000) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpOperationalDocument_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpOperationalDocument_pkey] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ErpOperationalDocument_retailOrgId_documentNo_key] UNIQUE NONCLUSTERED ([retailOrgId], [documentNo])
    );
END

IF OBJECT_ID(N'[dbo].[ErpOperationalDocumentLine]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpOperationalDocumentLine] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [operationalDocumentId] NVARCHAR(1000) NOT NULL,
        [productProfileId] NVARCHAR(1000) NULL,
        [lineNo] INT NOT NULL,
        [itemCode] NVARCHAR(1000) NULL,
        [description] NVARCHAR(1000) NOT NULL,
        [quantity] DECIMAL(18,3) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_quantity_df] DEFAULT 1,
        [unitPrice] DECIMAL(18,4) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_unitPrice_df] DEFAULT 0,
        [discountAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_discountAmount_df] DEFAULT 0,
        [taxAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_taxAmount_df] DEFAULT 0,
        [chargeAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_chargeAmount_df] DEFAULT 0,
        [lineAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_lineAmount_df] DEFAULT 0,
        [postingAccountCode] NVARCHAR(1000) NULL,
        [taxAccountCode] NVARCHAR(1000) NULL,
        [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ErpOperationalDocumentLine_status_df] DEFAULT 'ACTIVE',
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpOperationalDocumentLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpOperationalDocumentLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocument_companyId_documentType_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocument]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocument_companyId_documentType_status_idx] ON [dbo].[ErpOperationalDocument]([companyId], [documentType], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocument_retailOrgId_documentDate_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocument]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocument_retailOrgId_documentDate_status_idx] ON [dbo].[ErpOperationalDocument]([retailOrgId], [documentDate], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocument_partyProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocument]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocument_partyProfileId_idx] ON [dbo].[ErpOperationalDocument]([partyProfileId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocument_postingJournalEntryId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocument]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocument_postingJournalEntryId_idx] ON [dbo].[ErpOperationalDocument]([postingJournalEntryId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocumentLine_operationalDocumentId_lineNo_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocumentLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocumentLine_operationalDocumentId_lineNo_idx] ON [dbo].[ErpOperationalDocumentLine]([operationalDocumentId], [lineNo]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocumentLine_retailOrgId_status_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocumentLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocumentLine_retailOrgId_status_idx] ON [dbo].[ErpOperationalDocumentLine]([retailOrgId], [status]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpOperationalDocumentLine_productProfileId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpOperationalDocumentLine]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpOperationalDocumentLine_productProfileId_idx] ON [dbo].[ErpOperationalDocumentLine]([productProfileId]);
END
