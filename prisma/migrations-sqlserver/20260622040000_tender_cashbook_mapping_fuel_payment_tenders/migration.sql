IF COL_LENGTH(N'dbo.TenderMethod', N'cashbookAccountId') IS NULL
BEGIN
    ALTER TABLE [dbo].[TenderMethod] ADD [cashbookAccountId] NVARCHAR(1000) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'TenderMethod_cashbookAccountId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[TenderMethod]'))
BEGIN
    CREATE NONCLUSTERED INDEX [TenderMethod_cashbookAccountId_idx] ON [dbo].[TenderMethod]([cashbookAccountId]);
END;

IF COL_LENGTH(N'dbo.ErpFuelSalePayment', N'tenderMethodId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelSalePayment] ADD [tenderMethodId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.ErpFuelSalePayment', N'tenderMethodCodeSnapshot') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelSalePayment] ADD [tenderMethodCodeSnapshot] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.ErpFuelSalePayment', N'tenderMethodNameSnapshot') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpFuelSalePayment] ADD [tenderMethodNameSnapshot] NVARCHAR(1000) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'ErpFuelSalePayment_tenderMethodId_idx' AND [object_id] = OBJECT_ID(N'[dbo].[ErpFuelSalePayment]'))
BEGIN
    CREATE NONCLUSTERED INDEX [ErpFuelSalePayment_tenderMethodId_idx] ON [dbo].[ErpFuelSalePayment]([tenderMethodId]);
END;
