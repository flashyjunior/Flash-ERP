IF OBJECT_ID(N'[dbo].[CustomerAccountPaymentAllocation]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[CustomerAccountPaymentAllocation] (
    [id] NVARCHAR(1000) NOT NULL CONSTRAINT [CustomerAccountPaymentAllocation_id_df] DEFAULT NEWID(),
    [retailOrgId] NVARCHAR(1000) NOT NULL,
    [customerId] NVARCHAR(1000) NOT NULL,
    [paymentEntryId] NVARCHAR(1000) NOT NULL,
    [invoiceEntryId] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(12, 2) NOT NULL,
    [note] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerAccountPaymentAllocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CustomerAccountPaymentAllocation_pkey] PRIMARY KEY CLUSTERED ([id])
  );

  CREATE UNIQUE NONCLUSTERED INDEX [CustomerAccountPaymentAllocation_paymentEntryId_invoiceEntryId_key]
    ON [dbo].[CustomerAccountPaymentAllocation]([paymentEntryId], [invoiceEntryId]);

  CREATE NONCLUSTERED INDEX [CustomerAccountPaymentAllocation_customerId_invoiceEntryId_idx]
    ON [dbo].[CustomerAccountPaymentAllocation]([customerId], [invoiceEntryId]);

  CREATE NONCLUSTERED INDEX [CustomerAccountPaymentAllocation_invoiceEntryId_idx]
    ON [dbo].[CustomerAccountPaymentAllocation]([invoiceEntryId]);

  CREATE NONCLUSTERED INDEX [CustomerAccountPaymentAllocation_retailOrgId_createdAt_idx]
    ON [dbo].[CustomerAccountPaymentAllocation]([retailOrgId], [createdAt]);
END;
