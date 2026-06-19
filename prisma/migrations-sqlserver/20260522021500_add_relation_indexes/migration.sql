BEGIN TRY

BEGIN TRAN;

-- CreateIndex
CREATE NONCLUSTERED INDEX [BankingDeposit_terminalId_idx] ON [dbo].[BankingDeposit]([terminalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BankingDeposit_bankAccountId_idx] ON [dbo].[BankingDeposit]([bankAccountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Barcode_productId_idx] ON [dbo].[Barcode]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Customer_storeId_idx] ON [dbo].[Customer]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAccountEntry_storeId_idx] ON [dbo].[CustomerAccountEntry]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAccountEntry_terminalId_idx] ON [dbo].[CustomerAccountEntry]([terminalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GlJournalLine_journalEntryId_idx] ON [dbo].[GlJournalLine]([journalEntryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceipt_storeId_idx] ON [dbo].[GoodsReceipt]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceipt_warehouseId_idx] ON [dbo].[GoodsReceipt]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceipt_purchaseOrderId_idx] ON [dbo].[GoodsReceipt]([purchaseOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceipt_supplierId_idx] ON [dbo].[GoodsReceipt]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceiptLine_purchaseOrderLineId_idx] ON [dbo].[GoodsReceiptLine]([purchaseOrderLineId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GoodsReceiptLine_productId_idx] ON [dbo].[GoodsReceiptLine]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InterStoreTransfer_productId_idx] ON [dbo].[InterStoreTransfer]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryCatalogProduct_productId_idx] ON [dbo].[InventoryCatalogProduct]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryCatalogStore_storeId_idx] ON [dbo].[InventoryCatalogStore]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedgerEntry_retailOrgId_idx] ON [dbo].[InventoryLedgerEntry]([retailOrgId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedgerEntry_storeId_idx] ON [dbo].[InventoryLedgerEntry]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedgerEntry_warehouseId_idx] ON [dbo].[InventoryLedgerEntry]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedgerEntry_inventoryLocationId_idx] ON [dbo].[InventoryLedgerEntry]([inventoryLocationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLedgerEntry_productId_idx] ON [dbo].[InventoryLedgerEntry]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLocation_storeId_idx] ON [dbo].[InventoryLocation]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryLocation_warehouseId_idx] ON [dbo].[InventoryLocation]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventorySerialUnit_warehouseId_idx] ON [dbo].[InventorySerialUnit]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventorySerialUnit_productId_idx] ON [dbo].[InventorySerialUnit]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosPayment_posTransactionId_idx] ON [dbo].[PosPayment]([posTransactionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosPayment_tenderMethodId_idx] ON [dbo].[PosPayment]([tenderMethodId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosPayment_bankAccountId_idx] ON [dbo].[PosPayment]([bankAccountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosShift_retailOrgId_idx] ON [dbo].[PosShift]([retailOrgId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosShift_terminalId_idx] ON [dbo].[PosShift]([terminalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosShift_cashierUserId_idx] ON [dbo].[PosShift]([cashierUserId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransaction_storeId_idx] ON [dbo].[PosTransaction]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransaction_terminalId_idx] ON [dbo].[PosTransaction]([terminalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransaction_posShiftId_idx] ON [dbo].[PosTransaction]([posShiftId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransaction_customerId_idx] ON [dbo].[PosTransaction]([customerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransactionLine_posTransactionId_idx] ON [dbo].[PosTransactionLine]([posTransactionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PosTransactionLine_productId_idx] ON [dbo].[PosTransactionLine]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PriceListEntry_productId_idx] ON [dbo].[PriceListEntry]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_taxProfileId_idx] ON [dbo].[Product]([taxProfileId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_baseUnitOfMeasureId_idx] ON [dbo].[Product]([baseUnitOfMeasureId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_uomScheduleId_idx] ON [dbo].[Product]([uomScheduleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductCategory_departmentId_idx] ON [dbo].[ProductCategory]([departmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductSupplier_supplierId_idx] ON [dbo].[ProductSupplier]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrder_storeId_idx] ON [dbo].[PurchaseOrder]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrder_warehouseId_idx] ON [dbo].[PurchaseOrder]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseOrder_supplierId_idx] ON [dbo].[PurchaseOrder]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetailUser_homeStoreId_idx] ON [dbo].[RetailUser]([homeStoreId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetailUserRole_roleId_idx] ON [dbo].[RetailUserRole]([roleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetailUserSession_retailOrgId_idx] ON [dbo].[RetailUserSession]([retailOrgId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RolePermission_permissionId_idx] ON [dbo].[RolePermission]([permissionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SalesOrder_terminalId_idx] ON [dbo].[SalesOrder]([terminalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockCountSession_storeId_idx] ON [dbo].[StockCountSession]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockCountSession_warehouseId_idx] ON [dbo].[StockCountSession]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Store_salesReceiptTemplateId_idx] ON [dbo].[Store]([salesReceiptTemplateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Store_accountPaymentReceiptTemplateId_idx] ON [dbo].[Store]([accountPaymentReceiptTemplateId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaim_storeId_idx] ON [dbo].[SupplierClaim]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaim_warehouseId_idx] ON [dbo].[SupplierClaim]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaim_supplierId_idx] ON [dbo].[SupplierClaim]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaim_purchaseOrderId_idx] ON [dbo].[SupplierClaim]([purchaseOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaim_goodsReceiptId_idx] ON [dbo].[SupplierClaim]([goodsReceiptId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaimLine_purchaseOrderLineId_idx] ON [dbo].[SupplierClaimLine]([purchaseOrderLineId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaimLine_goodsReceiptLineId_idx] ON [dbo].[SupplierClaimLine]([goodsReceiptLineId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierClaimLine_productId_idx] ON [dbo].[SupplierClaimLine]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturn_storeId_idx] ON [dbo].[SupplierReturn]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturn_warehouseId_idx] ON [dbo].[SupplierReturn]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturn_supplierId_idx] ON [dbo].[SupplierReturn]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturn_purchaseOrderId_idx] ON [dbo].[SupplierReturn]([purchaseOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturn_goodsReceiptId_idx] ON [dbo].[SupplierReturn]([goodsReceiptId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturnLine_goodsReceiptLineId_idx] ON [dbo].[SupplierReturnLine]([goodsReceiptLineId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SupplierReturnLine_productId_idx] ON [dbo].[SupplierReturnLine]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncInboundEvent_syncNodeId_idx] ON [dbo].[SyncInboundEvent]([syncNodeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncNode_retailOrgId_idx] ON [dbo].[SyncNode]([retailOrgId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncNode_storeId_idx] ON [dbo].[SyncNode]([storeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncNode_terminalId_idx] ON [dbo].[SyncNode]([terminalId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncOperatorAction_syncNodeId_idx] ON [dbo].[SyncOperatorAction]([syncNodeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncOperatorAction_syncOutboxEventId_idx] ON [dbo].[SyncOperatorAction]([syncOutboxEventId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncOperatorAction_syncInboundEventId_idx] ON [dbo].[SyncOperatorAction]([syncInboundEventId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncOutboxEvent_syncNodeId_idx] ON [dbo].[SyncOutboxEvent]([syncNodeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UnitOfMeasureSchedule_baseUnitOfMeasureId_idx] ON [dbo].[UnitOfMeasureSchedule]([baseUnitOfMeasureId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Warehouse_storeId_idx] ON [dbo].[Warehouse]([storeId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
