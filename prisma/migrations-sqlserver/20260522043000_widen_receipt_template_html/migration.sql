BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ReceiptTemplate] ALTER COLUMN [templateHtml] NVARCHAR(max) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Store] ALTER COLUMN [salesReceiptTemplateHtml] NVARCHAR(max) NULL;
ALTER TABLE [dbo].[Store] ALTER COLUMN [accountPaymentReceiptTemplateHtml] NVARCHAR(max) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
