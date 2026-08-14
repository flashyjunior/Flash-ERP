SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH(N'dbo.SyncOutboxEvent', N'errorMessage') IS NULL
  EXEC(N'ALTER TABLE [dbo].[SyncOutboxEvent] ADD [errorMessage] NVARCHAR(MAX) NULL;');
