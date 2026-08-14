IF COL_LENGTH(N'dbo.Store', N'ecommerceLayawayEnabled') IS NULL
BEGIN
  ALTER TABLE [dbo].[Store]
    ADD [ecommerceLayawayEnabled] BIT NOT NULL
      CONSTRAINT [Store_ecommerceLayawayEnabled_df] DEFAULT 0;
END;

IF COL_LENGTH(N'dbo.EcommerceOrder', N'layawayDepositAmount') IS NULL
BEGIN
  ALTER TABLE [dbo].[EcommerceOrder]
    ADD [layawayDepositAmount] DECIMAL(18, 2) NOT NULL
      CONSTRAINT [EcommerceOrder_layawayDepositAmount_df] DEFAULT 0;
END;
