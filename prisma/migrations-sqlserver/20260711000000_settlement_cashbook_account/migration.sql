IF COL_LENGTH(N'dbo.ErpSettlementAllocation', N'cashbookAccountId') IS NULL
BEGIN
    ALTER TABLE [dbo].[ErpSettlementAllocation]
    ADD [cashbookAccountId] NVARCHAR(1000) NULL;
END;

IF COL_LENGTH(N'dbo.ErpSettlementAllocation', N'cashbookAccountId') IS NOT NULL
BEGIN
    EXEC sys.sp_executesql N'
        UPDATE settlement
        SET [cashbookAccountId] = cashbook.[id]
        FROM [dbo].[ErpSettlementAllocation] settlement
        INNER JOIN [dbo].[ErpCashbookAccount] cashbook
            ON cashbook.[companyId] = settlement.[companyId]
            AND cashbook.[glAccountCode] = settlement.[paymentAccountCode]
            AND cashbook.[status] = N''ACTIVE''
        WHERE settlement.[cashbookAccountId] IS NULL
          AND settlement.[paymentAccountCode] IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM [dbo].[ErpCashbookAccount] duplicate
              WHERE duplicate.[companyId] = settlement.[companyId]
                AND duplicate.[glAccountCode] = settlement.[paymentAccountCode]
                AND duplicate.[status] = N''ACTIVE''
                AND duplicate.[id] <> cashbook.[id]
          );
    ';
END;
