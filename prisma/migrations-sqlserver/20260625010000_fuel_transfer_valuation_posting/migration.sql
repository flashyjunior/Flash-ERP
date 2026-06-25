IF COL_LENGTH(N'dbo.InterStoreTransfer', N'valuationStatus') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer]
    ADD [valuationStatus] NVARCHAR(1000) NOT NULL
      CONSTRAINT [InterStoreTransfer_valuationStatus_df] DEFAULT N'PENDING';
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'issueJournalEntryId') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [issueJournalEntryId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'receiptJournalEntryId') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [receiptJournalEntryId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'issuedValuationAmount') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [issuedValuationAmount] DECIMAL(18, 2) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'receivedValuationAmount') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [receivedValuationAmount] DECIMAL(18, 2) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'varianceValuationAmount') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [varianceValuationAmount] DECIMAL(18, 2) NULL;
END;

IF COL_LENGTH(N'dbo.InterStoreTransfer', N'valuationPostedAt') IS NULL
BEGIN
  ALTER TABLE [dbo].[InterStoreTransfer] ADD [valuationPostedAt] DATETIME2(3) NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [name] = N'InterStoreTransfer_issueJournalEntryId_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[InterStoreTransfer]')
)
BEGIN
  CREATE INDEX [InterStoreTransfer_issueJournalEntryId_idx]
    ON [dbo].[InterStoreTransfer]([issueJournalEntryId]);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE [name] = N'InterStoreTransfer_receiptJournalEntryId_idx'
    AND [object_id] = OBJECT_ID(N'[dbo].[InterStoreTransfer]')
)
BEGIN
  CREATE INDEX [InterStoreTransfer_receiptJournalEntryId_idx]
    ON [dbo].[InterStoreTransfer]([receiptJournalEntryId]);
END;
