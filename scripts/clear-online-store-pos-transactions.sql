/*
  Flash ERP online-store POS transaction cleanup (SQL Server / SSMS)

  This script deletes POS operational history for one ONLINE_DIRECT store:
  - sales, returns, exchanges, held sales, and their lines/payments
  - sales orders and their snapshot lines
  - customer account entries and self-contained payment allocations posted by that store
  - inventory ledger movements linked to the deleted POS transactions
  - finance journals generated from those POS and inventory ledger rows
  - POS shifts, EOD reconciliations, and banking deposits

  It does not delete stores, terminals, users, products, product variants,
  prices, inventory locations, customers, suppliers, tenders, company settings,
  purchasing/receiving, transfers, stock counts, transaction-reference captures,
  or audit/security logs.

  The script previews only by default. Back up the HQ database, set @StoreId,
  run once with @Execute = 0, review every result set, then change @Execute to 1.

  Find the store ID first with:
  SELECT [id], [code], [name], [storeMode]
  FROM [dbo].[Store]
  WHERE [storeMode] = N'ONLINE_DIRECT';
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @StoreId NVARCHAR(1000) = N'REPLACE-WITH-STORE-ID';
DECLARE @Execute BIT = 0;

IF NULLIF(LTRIM(RTRIM(@StoreId)), N'') IS NULL OR @StoreId = N'REPLACE-WITH-STORE-ID'
BEGIN
  RAISERROR('Set @StoreId to the exact Store.id before running this script.', 16, 1);
  RETURN;
END;

IF @Execute NOT IN (0, 1)
BEGIN
  RAISERROR('@Execute must be 0 for preview or 1 for deletion.', 16, 1);
  RETURN;
END;

IF EXISTS (
  SELECT 1
  FROM (VALUES
    (N'Store'),
    (N'PosTransaction'),
    (N'PosTransactionLine'),
    (N'PosPayment'),
    (N'PosShift'),
    (N'SalesOrder'),
    (N'SalesOrderLine'),
    (N'Customer'),
    (N'CustomerAccountEntry'),
    (N'CustomerAccountPaymentAllocation'),
    (N'InventoryLedgerEntry'),
    (N'ProductMatrixVariant'),
    (N'EodReconciliation'),
    (N'BankingDeposit'),
    (N'GlJournalEntry'),
    (N'GlJournalLine'),
    (N'InterStoreTransfer'),
    (N'ErpOperationalDocument'),
    (N'ErpTaxTransaction'),
    (N'ErpFixedAssetTransaction'),
    (N'ErpEmployeeLoan'),
    (N'ErpEmployeeLoanRepayment'),
    (N'ErpExpenseClaim'),
    (N'ErpTravelRequest'),
    (N'ErpPayrollPostingBatch'),
    (N'ErpSettlementAllocation'),
    (N'ErpCashbookEntry')
  ) AS requiredTable([name])
  WHERE OBJECT_ID(N'dbo.' + requiredTable.[name], N'U') IS NULL
)
BEGIN
  RAISERROR('The HQ database schema is behind this cleanup script. Apply all SQL Server migrations before retrying.', 16, 1);
  RETURN;
END;

DECLARE @StoreCode NVARCHAR(1000);
DECLARE @StoreName NVARCHAR(1000);
DECLARE @StoreMode NVARCHAR(1000);
DECLARE @RetailOrgId NVARCHAR(1000);

SELECT
  @StoreCode = [code],
  @StoreName = [name],
  @StoreMode = [storeMode],
  @RetailOrgId = [retailOrgId]
FROM [dbo].[Store]
WHERE [id] = @StoreId;

IF @StoreCode IS NULL
BEGIN
  RAISERROR('No store exists with the supplied @StoreId.', 16, 1);
  RETURN;
END;

IF UPPER(ISNULL(@StoreMode, N'')) <> N'ONLINE_DIRECT'
BEGIN
  RAISERROR('The supplied store is not an ONLINE_DIRECT store. This script will not clear an offline-first shop.', 16, 1);
  RETURN;
END;

BEGIN TRY
  BEGIN TRANSACTION;

  SELECT
    [id],
    [transactionNo]
  INTO #PosTransactions
  FROM [dbo].[PosTransaction] WITH (UPDLOCK, HOLDLOCK)
  WHERE [storeId] = @StoreId;

  SELECT
    [id],
    [orderNo],
    [sourceTransactionId],
    [fulfilledTransactionId]
  INTO #SalesOrders
  FROM [dbo].[SalesOrder] WITH (UPDLOCK, HOLDLOCK)
  WHERE [storeId] = @StoreId;

  SELECT [id], [customerId], [receivableDeltaAmount], [loyaltyPointsDelta]
  INTO #CustomerAccountEntries
  FROM [dbo].[CustomerAccountEntry] WITH (UPDLOCK, HOLDLOCK)
  WHERE [storeId] = @StoreId;

  SELECT
    allocation.[id],
    allocation.[paymentEntryId],
    allocation.[invoiceEntryId]
  INTO #CustomerAccountPaymentAllocations
  FROM [dbo].[CustomerAccountPaymentAllocation] AS allocation WITH (UPDLOCK, HOLDLOCK)
  WHERE EXISTS (
      SELECT 1
      FROM #CustomerAccountEntries AS targetEntry
      WHERE targetEntry.[id] = allocation.[paymentEntryId]
    )
    OR EXISTS (
      SELECT 1
      FROM #CustomerAccountEntries AS targetEntry
      WHERE targetEntry.[id] = allocation.[invoiceEntryId]
    );

  SELECT ledger.[id]
  INTO #InventoryLedgerEntries
  FROM [dbo].[InventoryLedgerEntry] AS ledger WITH (UPDLOCK, HOLDLOCK)
  INNER JOIN #PosTransactions AS transactionRow
    ON transactionRow.[id] = ledger.[referenceId]
  WHERE ledger.[referenceType] = N'POS_TRANSACTION';

  SELECT journal.[id]
  INTO #GlJournalEntries
  FROM [dbo].[GlJournalEntry] AS journal WITH (UPDLOCK, HOLDLOCK)
  WHERE journal.[retailOrgId] = @RetailOrgId
    AND (
      (
        journal.[sourceType] = N'POS_SALE'
        AND EXISTS (
          SELECT 1
          FROM #PosTransactions AS transactionRow
          WHERE transactionRow.[id] = journal.[sourceId]
        )
      )
      OR (
        journal.[sourceType] = N'INVENTORY_COGS'
        AND EXISTS (
          SELECT 1
          FROM #InventoryLedgerEntries AS ledgerRow
          WHERE ledgerRow.[id] = journal.[sourceId]
        )
      )
    );

  SELECT
    accountEntry.[customerId],
    SUM(CONVERT(DECIMAL(38, 4), accountEntry.[receivableDeltaAmount])) AS [receivableDeltaAmount],
    SUM(CONVERT(BIGINT, accountEntry.[loyaltyPointsDelta])) AS [loyaltyPointsDelta]
  INTO #CustomerEffects
  FROM [dbo].[CustomerAccountEntry] AS accountEntry
  INNER JOIN #CustomerAccountEntries AS targetEntry
    ON targetEntry.[id] = accountEntry.[id]
  GROUP BY accountEntry.[customerId];

  /*
    Online matrix sales decrement ProductMatrixVariant.quantityOnHand directly.
    This captures only those matching SALE movements so the deletion restores
    that derived balance without deleting or recreating the variant master row.
  */
  SELECT
    ledger.[productVariantId],
    SUM(CONVERT(DECIMAL(38, 4), ledger.[quantity])) AS [quantityDelta]
  INTO #MatrixVariantEffects
  FROM [dbo].[InventoryLedgerEntry] AS ledger
  INNER JOIN #InventoryLedgerEntries AS targetEntry
    ON targetEntry.[id] = ledger.[id]
  WHERE ledger.[productVariantId] IS NOT NULL
    AND ledger.[movementType] = N'SALE'
    AND ledger.[quantity] < 0
    AND ledger.[sourceNodeCode] = N'ONLINE_DIRECT'
  GROUP BY ledger.[productVariantId];

  DECLARE @ExternalPosReferences BIGINT;
  DECLARE @ExternalSalesOrderReferences BIGINT;
  DECLARE @ExternalAccountReferences BIGINT;
  DECLARE @ExternalLedgerReferences BIGINT;
  DECLARE @LinkedTransferReferences BIGINT;
  DECLARE @ExternalAccountAllocationReferences BIGINT;
  DECLARE @ExternalGlJournalReferences BIGINT;

  SELECT @ExternalPosReferences = COUNT_BIG(*)
  FROM [dbo].[PosTransaction] AS transactionRow
  INNER JOIN #PosTransactions AS sourceRow
    ON sourceRow.[id] = transactionRow.[sourceTransactionId]
  WHERE transactionRow.[storeId] <> @StoreId;

  SELECT @ExternalSalesOrderReferences = COUNT_BIG(*)
  FROM [dbo].[SalesOrder] AS salesOrder
  WHERE salesOrder.[storeId] <> @StoreId
    AND (
      EXISTS (
        SELECT 1
        FROM #PosTransactions AS transactionRow
        WHERE transactionRow.[id] = salesOrder.[sourceTransactionId]
           OR transactionRow.[id] = salesOrder.[fulfilledTransactionId]
      )
    );

  SELECT @ExternalAccountReferences = COUNT_BIG(*)
  FROM [dbo].[CustomerAccountEntry] AS accountEntry
  INNER JOIN #PosTransactions AS transactionRow
    ON transactionRow.[id] = accountEntry.[posTransactionId]
  WHERE accountEntry.[storeId] IS NULL OR accountEntry.[storeId] <> @StoreId;

  SELECT @ExternalLedgerReferences = COUNT_BIG(*)
  FROM [dbo].[InventoryLedgerEntry] AS ledger
  INNER JOIN #PosTransactions AS transactionRow
    ON transactionRow.[id] = ledger.[referenceId]
  WHERE ledger.[referenceType] = N'POS_TRANSACTION'
    AND (ledger.[storeId] IS NULL OR ledger.[storeId] <> @StoreId);

  SELECT @LinkedTransferReferences = COUNT_BIG(*)
  FROM [dbo].[InterStoreTransfer] AS transferRow
  INNER JOIN #SalesOrders AS salesOrder
    ON salesOrder.[orderNo] = transferRow.[externalReference];

  SELECT @ExternalAccountAllocationReferences = COUNT_BIG(*)
  FROM #CustomerAccountPaymentAllocations AS allocation
  WHERE NOT EXISTS (
      SELECT 1
      FROM #CustomerAccountEntries AS paymentEntry
      WHERE paymentEntry.[id] = allocation.[paymentEntryId]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM #CustomerAccountEntries AS invoiceEntry
      WHERE invoiceEntry.[id] = allocation.[invoiceEntryId]
    );

  SELECT @ExternalGlJournalReferences =
      (
        SELECT COUNT_BIG(*)
        FROM [dbo].[GlJournalEntry] AS reversal
        INNER JOIN #GlJournalEntries AS targetJournal
          ON targetJournal.[id] = reversal.[reversalOfJournalEntryId]
        WHERE NOT EXISTS (
          SELECT 1 FROM #GlJournalEntries AS sameTarget WHERE sameTarget.[id] = reversal.[id]
        )
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpOperationalDocument] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[postingJournalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpTaxTransaction] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[journalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpFixedAssetTransaction] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[journalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpEmployeeLoan] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[disbursementJournalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpEmployeeLoanRepayment] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[journalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpExpenseClaim] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[journalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpTravelRequest] AS row
        INNER JOIN #GlJournalEntries AS targetJournal
          ON targetJournal.[id] = row.[advanceJournalEntryId]
          OR targetJournal.[id] = row.[settlementJournalEntryId]
          OR targetJournal.[id] = row.[returnJournalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpPayrollPostingBatch] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[journalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpSettlementAllocation] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[postingJournalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[ErpCashbookEntry] AS row
        INNER JOIN #GlJournalEntries AS targetJournal ON targetJournal.[id] = row.[postingJournalEntryId]
      )
    + (
        SELECT COUNT_BIG(*) FROM [dbo].[InterStoreTransfer] AS row
        INNER JOIN #GlJournalEntries AS targetJournal
          ON targetJournal.[id] = row.[issueJournalEntryId]
          OR targetJournal.[id] = row.[receiptJournalEntryId]
      );

  SELECT
    @StoreId AS [StoreId],
    @StoreCode AS [StoreCode],
    @StoreName AS [StoreName],
    @StoreMode AS [StoreMode],
    CASE WHEN @Execute = 1 THEN N'DELETE' ELSE N'PREVIEW ONLY' END AS [Mode];

  SELECT N'POS transactions' AS [Entity], COUNT_BIG(*) AS [Rows]
  FROM #PosTransactions
  UNION ALL
  SELECT N'POS transaction lines', COUNT_BIG(*)
  FROM [dbo].[PosTransactionLine] AS line
  INNER JOIN #PosTransactions AS transactionRow ON transactionRow.[id] = line.[posTransactionId]
  UNION ALL
  SELECT N'POS payments', COUNT_BIG(*)
  FROM [dbo].[PosPayment] AS payment
  INNER JOIN #PosTransactions AS transactionRow ON transactionRow.[id] = payment.[posTransactionId]
  UNION ALL
  SELECT N'Sales orders', COUNT_BIG(*) FROM #SalesOrders
  UNION ALL
  SELECT N'Sales order lines', COUNT_BIG(*)
  FROM [dbo].[SalesOrderLine] AS line
  INNER JOIN #SalesOrders AS salesOrder ON salesOrder.[id] = line.[salesOrderId]
  UNION ALL
  SELECT N'Customer account entries', COUNT_BIG(*) FROM #CustomerAccountEntries
  UNION ALL
  SELECT N'Customer account payment allocations', COUNT_BIG(*) FROM #CustomerAccountPaymentAllocations
  UNION ALL
  SELECT N'POS inventory ledger movements', COUNT_BIG(*) FROM #InventoryLedgerEntries
  UNION ALL
  SELECT N'Finance journal entries', COUNT_BIG(*) FROM #GlJournalEntries
  UNION ALL
  SELECT N'Finance journal lines', COUNT_BIG(*)
  FROM [dbo].[GlJournalLine] AS journalLine
  INNER JOIN #GlJournalEntries AS journalEntry ON journalEntry.[id] = journalLine.[journalEntryId]
  UNION ALL
  SELECT N'POS shifts', COUNT_BIG(*) FROM [dbo].[PosShift] WHERE [storeId] = @StoreId
  UNION ALL
  SELECT N'EOD reconciliations', COUNT_BIG(*) FROM [dbo].[EodReconciliation] WHERE [storeId] = @StoreId
  UNION ALL
  SELECT N'Banking deposits', COUNT_BIG(*) FROM [dbo].[BankingDeposit] WHERE [storeId] = @StoreId;

  SELECT
    COUNT_BIG(*) AS [TransactionCount],
    COALESCE(SUM(CONVERT(DECIMAL(38, 2), transactionRow.[totalAmount])), 0) AS [NetTransactionTotal],
    COALESCE(SUM(CONVERT(DECIMAL(38, 2), transactionRow.[paidAmount])), 0) AS [PaymentTotal]
  FROM [dbo].[PosTransaction] AS transactionRow
  INNER JOIN #PosTransactions AS targetRow ON targetRow.[id] = transactionRow.[id];

  SELECT N'POS transactions in another store that reference these transactions' AS [Blocker], @ExternalPosReferences AS [Rows]
  UNION ALL SELECT N'Sales orders in another store that reference these transactions', @ExternalSalesOrderReferences
  UNION ALL SELECT N'Customer account entries outside this store linked to these transactions', @ExternalAccountReferences
  UNION ALL SELECT N'Inventory ledger entries outside this store linked to these transactions', @ExternalLedgerReferences
  UNION ALL SELECT N'Inventory transfers linked by sales-order number', @LinkedTransferReferences
  UNION ALL SELECT N'Customer account allocations linked outside this store', @ExternalAccountAllocationReferences
  UNION ALL SELECT N'ERP records linked to finance journals being removed', @ExternalGlJournalReferences;

  IF @Execute = 0
  BEGIN
    ROLLBACK TRANSACTION;
    PRINT N'Preview complete. No rows were changed. Review the counts, take a backup, then set @Execute = 1 to delete.';
    RETURN;
  END;

  IF @ExternalPosReferences > 0
     OR @ExternalSalesOrderReferences > 0
     OR @ExternalAccountReferences > 0
     OR @ExternalLedgerReferences > 0
     OR @LinkedTransferReferences > 0
     OR @ExternalAccountAllocationReferences > 0
     OR @ExternalGlJournalReferences > 0
  BEGIN
    RAISERROR('Deletion stopped because another store transaction, payment allocation, inventory transfer, or ERP finance record references this store data. Resolve the rows shown in the blocker result before retrying.', 16, 1);
  END;

  UPDATE customer
  SET
    customer.[receivableBalanceAmount] =
      customer.[receivableBalanceAmount] - effect.[receivableDeltaAmount],
    customer.[loyaltyPointsBalance] =
      customer.[loyaltyPointsBalance] - CONVERT(INT, effect.[loyaltyPointsDelta]),
    customer.[recordVersion] = customer.[recordVersion] + 1,
    customer.[updatedAt] = SYSUTCDATETIME()
  FROM [dbo].[Customer] AS customer
  INNER JOIN #CustomerEffects AS effect
    ON effect.[customerId] = customer.[id];

  DECLARE @CustomersAdjusted BIGINT = @@ROWCOUNT;

  UPDATE variant
  SET
    variant.[quantityOnHand] = variant.[quantityOnHand] - effect.[quantityDelta],
    variant.[updatedAt] = SYSUTCDATETIME()
  FROM [dbo].[ProductMatrixVariant] AS variant
  INNER JOIN #MatrixVariantEffects AS effect
    ON effect.[productVariantId] = variant.[id];

  DECLARE @MatrixVariantsAdjusted BIGINT = @@ROWCOUNT;
  DECLARE @DeletedBankingDeposits BIGINT;
  DECLARE @DeletedEodReconciliations BIGINT;
  DECLARE @DeletedSalesOrderLines BIGINT;
  DECLARE @DeletedSalesOrders BIGINT;
  DECLARE @DeletedCustomerAccountEntries BIGINT;
  DECLARE @DeletedCustomerAccountPaymentAllocations BIGINT;
  DECLARE @DeletedGlJournalLines BIGINT;
  DECLARE @DeletedGlJournalEntries BIGINT;
  DECLARE @DeletedInventoryLedgerEntries BIGINT;
  DECLARE @DeletedPosPayments BIGINT;
  DECLARE @DeletedPosTransactionLines BIGINT;
  DECLARE @DeletedPosTransactions BIGINT;
  DECLARE @DeletedPosShifts BIGINT;

  DELETE FROM [dbo].[BankingDeposit]
  WHERE [storeId] = @StoreId;
  SET @DeletedBankingDeposits = @@ROWCOUNT;

  DELETE FROM [dbo].[EodReconciliation]
  WHERE [storeId] = @StoreId;
  SET @DeletedEodReconciliations = @@ROWCOUNT;

  DELETE line
  FROM [dbo].[SalesOrderLine] AS line
  INNER JOIN #SalesOrders AS salesOrder ON salesOrder.[id] = line.[salesOrderId];
  SET @DeletedSalesOrderLines = @@ROWCOUNT;

  DELETE allocation
  FROM [dbo].[CustomerAccountPaymentAllocation] AS allocation
  INNER JOIN #CustomerAccountPaymentAllocations AS targetAllocation
    ON targetAllocation.[id] = allocation.[id];
  SET @DeletedCustomerAccountPaymentAllocations = @@ROWCOUNT;

  DELETE accountEntry
  FROM [dbo].[CustomerAccountEntry] AS accountEntry
  INNER JOIN #CustomerAccountEntries AS targetEntry ON targetEntry.[id] = accountEntry.[id];
  SET @DeletedCustomerAccountEntries = @@ROWCOUNT;

  DELETE journalLine
  FROM [dbo].[GlJournalLine] AS journalLine
  INNER JOIN #GlJournalEntries AS journalEntry ON journalEntry.[id] = journalLine.[journalEntryId];
  SET @DeletedGlJournalLines = @@ROWCOUNT;

  DELETE journal
  FROM [dbo].[GlJournalEntry] AS journal
  INNER JOIN #GlJournalEntries AS targetEntry ON targetEntry.[id] = journal.[id];
  SET @DeletedGlJournalEntries = @@ROWCOUNT;

  DELETE ledger
  FROM [dbo].[InventoryLedgerEntry] AS ledger
  INNER JOIN #InventoryLedgerEntries AS targetEntry ON targetEntry.[id] = ledger.[id];
  SET @DeletedInventoryLedgerEntries = @@ROWCOUNT;

  DELETE payment
  FROM [dbo].[PosPayment] AS payment
  INNER JOIN #PosTransactions AS transactionRow ON transactionRow.[id] = payment.[posTransactionId];
  SET @DeletedPosPayments = @@ROWCOUNT;

  DELETE line
  FROM [dbo].[PosTransactionLine] AS line
  INNER JOIN #PosTransactions AS transactionRow ON transactionRow.[id] = line.[posTransactionId];
  SET @DeletedPosTransactionLines = @@ROWCOUNT;

  DELETE salesOrder
  FROM [dbo].[SalesOrder] AS salesOrder
  INNER JOIN #SalesOrders AS targetOrder ON targetOrder.[id] = salesOrder.[id];
  SET @DeletedSalesOrders = @@ROWCOUNT;

  DELETE transactionRow
  FROM [dbo].[PosTransaction] AS transactionRow
  INNER JOIN #PosTransactions AS targetRow ON targetRow.[id] = transactionRow.[id];
  SET @DeletedPosTransactions = @@ROWCOUNT;

  DELETE FROM [dbo].[PosShift]
  WHERE [storeId] = @StoreId;
  SET @DeletedPosShifts = @@ROWCOUNT;

  COMMIT TRANSACTION;

  SELECT N'Customers with balances adjusted' AS [Result], @CustomersAdjusted AS [Rows]
  UNION ALL SELECT N'Matrix variants with stock restored', @MatrixVariantsAdjusted
  UNION ALL SELECT N'Banking deposits deleted', @DeletedBankingDeposits
  UNION ALL SELECT N'EOD reconciliations deleted', @DeletedEodReconciliations
  UNION ALL SELECT N'Sales order lines deleted', @DeletedSalesOrderLines
  UNION ALL SELECT N'Sales orders deleted', @DeletedSalesOrders
  UNION ALL SELECT N'Customer account entries deleted', @DeletedCustomerAccountEntries
  UNION ALL SELECT N'Customer account payment allocations deleted', @DeletedCustomerAccountPaymentAllocations
  UNION ALL SELECT N'Finance journal lines deleted', @DeletedGlJournalLines
  UNION ALL SELECT N'Finance journal entries deleted', @DeletedGlJournalEntries
  UNION ALL SELECT N'POS inventory ledger movements deleted', @DeletedInventoryLedgerEntries
  UNION ALL SELECT N'POS payments deleted', @DeletedPosPayments
  UNION ALL SELECT N'POS transaction lines deleted', @DeletedPosTransactionLines
  UNION ALL SELECT N'POS transactions deleted', @DeletedPosTransactions
  UNION ALL SELECT N'POS shifts deleted', @DeletedPosShifts;

  PRINT N'Online-store POS transaction cleanup committed successfully.';
END TRY
BEGIN CATCH
  DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();

  IF XACT_STATE() <> 0
  BEGIN
    ROLLBACK TRANSACTION;
  END;

  RAISERROR(@ErrorMessage, 16, 1);
END CATCH;
