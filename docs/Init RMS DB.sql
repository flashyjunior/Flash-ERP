USE [YOUR_HQ_DATABASE_NAME];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  /* Sync/audit children */
  IF OBJECT_ID(N'dbo.SyncOperatorAction', N'U') IS NOT NULL DELETE FROM dbo.SyncOperatorAction;
  IF OBJECT_ID(N'dbo.SyncOutboxEvent', N'U') IS NOT NULL DELETE FROM dbo.SyncOutboxEvent;
  IF OBJECT_ID(N'dbo.SyncInboundEvent', N'U') IS NOT NULL DELETE FROM dbo.SyncInboundEvent;
  IF OBJECT_ID(N'dbo.SyncInboxCheckpoint', N'U') IS NOT NULL DELETE FROM dbo.SyncInboxCheckpoint;
  IF OBJECT_ID(N'dbo.SecurityLog', N'U') IS NOT NULL DELETE FROM dbo.SecurityLog;

  /* POS, sales, banking, customer transaction history */
  IF OBJECT_ID(N'dbo.BankingDeposit', N'U') IS NOT NULL DELETE FROM dbo.BankingDeposit;
  IF OBJECT_ID(N'dbo.EodReconciliation', N'U') IS NOT NULL DELETE FROM dbo.EodReconciliation;
  IF OBJECT_ID(N'dbo.SalesOrder', N'U') IS NOT NULL DELETE FROM dbo.SalesOrder;
  IF OBJECT_ID(N'dbo.CustomerAccountEntry', N'U') IS NOT NULL DELETE FROM dbo.CustomerAccountEntry;
  IF OBJECT_ID(N'dbo.PosPayment', N'U') IS NOT NULL DELETE FROM dbo.PosPayment;
  IF OBJECT_ID(N'dbo.PosTransactionLine', N'U') IS NOT NULL DELETE FROM dbo.PosTransactionLine;
  IF OBJECT_ID(N'dbo.PosTransaction', N'U') IS NOT NULL DELETE FROM dbo.PosTransaction;
  IF OBJECT_ID(N'dbo.PosShift', N'U') IS NOT NULL DELETE FROM dbo.PosShift;
  IF OBJECT_ID(N'dbo.transaction_reference_capture', N'U') IS NOT NULL DELETE FROM dbo.transaction_reference_capture;

  /* Inventory transactions, GRN, purchasing, returns, transfers, stock counts */
  IF OBJECT_ID(N'dbo.InventoryLedgerEntry', N'U') IS NOT NULL DELETE FROM dbo.InventoryLedgerEntry;
  IF OBJECT_ID(N'dbo.InventorySerialUnit', N'U') IS NOT NULL DELETE FROM dbo.InventorySerialUnit;

  IF OBJECT_ID(N'dbo.SupplierReturnLine', N'U') IS NOT NULL DELETE FROM dbo.SupplierReturnLine;
  IF OBJECT_ID(N'dbo.SupplierReturn', N'U') IS NOT NULL DELETE FROM dbo.SupplierReturn;

  IF OBJECT_ID(N'dbo.SupplierClaimLine', N'U') IS NOT NULL DELETE FROM dbo.SupplierClaimLine;
  IF OBJECT_ID(N'dbo.SupplierClaim', N'U') IS NOT NULL DELETE FROM dbo.SupplierClaim;

  IF OBJECT_ID(N'dbo.GoodsReceiptLine', N'U') IS NOT NULL DELETE FROM dbo.GoodsReceiptLine;
  IF OBJECT_ID(N'dbo.GoodsReceipt', N'U') IS NOT NULL DELETE FROM dbo.GoodsReceipt;

  IF OBJECT_ID(N'dbo.PurchaseOrderLine', N'U') IS NOT NULL DELETE FROM dbo.PurchaseOrderLine;
  IF OBJECT_ID(N'dbo.PurchaseOrder', N'U') IS NOT NULL DELETE FROM dbo.PurchaseOrder;

  IF OBJECT_ID(N'dbo.InterStoreTransfer', N'U') IS NOT NULL DELETE FROM dbo.InterStoreTransfer;
  IF OBJECT_ID(N'dbo.StockCountSession', N'U') IS NOT NULL DELETE FROM dbo.StockCountSession;

  /* Finance transaction docs */
  IF OBJECT_ID(N'dbo.GlJournalLine', N'U') IS NOT NULL DELETE FROM dbo.GlJournalLine;
  IF OBJECT_ID(N'dbo.GlJournalEntry', N'U') IS NOT NULL DELETE FROM dbo.GlJournalEntry;
  IF OBJECT_ID(N'dbo.OperatingExpense', N'U') IS NOT NULL DELETE FROM dbo.OperatingExpense;

  /* Product/catalog item data and prices */
  IF OBJECT_ID(N'dbo.StoreProductPrice', N'U') IS NOT NULL DELETE FROM dbo.StoreProductPrice;
  IF OBJECT_ID(N'dbo.PriceListEntry', N'U') IS NOT NULL DELETE FROM dbo.PriceListEntry;
  IF OBJECT_ID(N'dbo.Barcode', N'U') IS NOT NULL DELETE FROM dbo.Barcode;

  IF OBJECT_ID(N'dbo.InventoryCatalogProduct', N'U') IS NOT NULL DELETE FROM dbo.InventoryCatalogProduct;
  IF OBJECT_ID(N'dbo.ProductSupplier', N'U') IS NOT NULL DELETE FROM dbo.ProductSupplier;
  IF OBJECT_ID(N'dbo.ProductMatrixVariantValue', N'U') IS NOT NULL DELETE FROM dbo.ProductMatrixVariantValue;
  IF OBJECT_ID(N'dbo.ProductMatrixVariant', N'U') IS NOT NULL DELETE FROM dbo.ProductMatrixVariant;
  IF OBJECT_ID(N'dbo.ProductMatrixAttribute', N'U') IS NOT NULL DELETE FROM dbo.ProductMatrixAttribute;
  IF OBJECT_ID(N'dbo.Product', N'U') IS NOT NULL DELETE FROM dbo.Product;

  /* Reset customer running balances after clearing transaction ledger */
  IF OBJECT_ID(N'dbo.Customer', N'U') IS NOT NULL
  BEGIN
    UPDATE dbo.Customer
    SET receivableBalanceAmount = 0,
        loyaltyPointsBalance = 0,
        updatedAt = SYSUTCDATETIME();
  END;

  COMMIT TRANSACTION;
  PRINT 'HQ transaction/product/sync/audit cleanup completed.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

  DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
  DECLARE @ErrorLine INT = ERROR_LINE();

  PRINT 'Cleanup failed. Transaction rolled back.';
  PRINT CONCAT('Line ', @ErrorLine, ': ', @ErrorMessage);

  THROW;
END CATCH;
GO