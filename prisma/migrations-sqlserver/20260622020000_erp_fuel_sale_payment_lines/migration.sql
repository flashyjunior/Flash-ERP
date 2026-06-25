IF OBJECT_ID(N'[dbo].[ErpFuelSalePayment]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ErpFuelSalePayment] (
        [id] NVARCHAR(1000) NOT NULL,
        [retailOrgId] NVARCHAR(1000) NOT NULL,
        [companyId] NVARCHAR(1000) NOT NULL,
        [fuelSaleId] NVARCHAR(1000) NOT NULL,
        [cashbookAccountId] NVARCHAR(1000) NOT NULL,
        [paymentMode] NVARCHAR(1000) NOT NULL,
        [amount] DECIMAL(18, 2) NOT NULL,
        [reference] NVARCHAR(1000) NULL,
        [receivedAt] DATETIME2 NULL,
        [notes] NVARCHAR(max) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [ErpFuelSalePayment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt] DATETIME2 NOT NULL,
        CONSTRAINT [ErpFuelSalePayment_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSalePayment_fuelSaleId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSalePayment_fuelSaleId_idx] ON [dbo].[ErpFuelSalePayment]([fuelSaleId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSalePayment_cashbookAccountId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSalePayment_cashbookAccountId_idx] ON [dbo].[ErpFuelSalePayment]([cashbookAccountId]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSalePayment_companyId_receivedAt_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSalePayment_companyId_receivedAt_idx] ON [dbo].[ErpFuelSalePayment]([companyId], [receivedAt]);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ErpFuelSalePayment_retailOrgId_idx' AND object_id = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSalePayment_retailOrgId_idx] ON [dbo].[ErpFuelSalePayment]([retailOrgId]);
END;
