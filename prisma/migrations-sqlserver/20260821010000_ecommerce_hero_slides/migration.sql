IF COL_LENGTH(N'dbo.Store', N'ecommerceHeroSlidesJson') IS NULL
  ALTER TABLE [dbo].[Store] ADD [ecommerceHeroSlidesJson] NVARCHAR(MAX) NULL;
