import { contextBridge, ipcRenderer } from "electron";
import type {
  DesktopRuntimeApi,
  StoreBasketCheckoutRequest,
  StoreBasketItemRequest,
  StoreBasketLineUpdateRequest,
  StoreCancelSalesOrderRequest,
  StoreCreateSalesOrderRequest,
  StoreOperatorSignInInput,
  StoreRecordBankingDepositRequest,
  StoreRecordEodReconciliationRequest,
  StoreSellCaptureRequest,
  StoreSyncCycleStatusEvent
} from "../src/shared/desktop-runtime.js";

const desktopRuntime: DesktopRuntimeApi = {
  getContext: () => ({
    mode: "store-desktop",
    offlineFirst: true,
    platform: process.platform,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    storeRuntimeRole:
      process.env.FLASH_ERP_STORE_RUNTIME_ROLE === "store-server" ||
      process.env.FLASH_ERP_STORE_RUNTIME_ROLE === "server"
        ? "store-server"
        : process.env.FLASH_ERP_STORE_RUNTIME_ROLE === "terminal-client" ||
            process.env.FLASH_ERP_STORE_RUNTIME_ROLE === "terminal" ||
            process.env.FLASH_ERP_STORE_SERVER_URL
          ? "terminal-client"
          : "embedded",
    storeDatabaseProvider:
      process.env.FLASH_ERP_STORE_DATABASE_PROVIDER === "mssql" ||
      process.env.FLASH_ERP_STORE_DATABASE_PROVIDER === "sqlserver" ||
      process.env.FLASH_ERP_STORE_DATABASE_PROVIDER === "sql-server"
        ? "mssql"
        : process.env.FLASH_ERP_STORE_DATABASE_PROVIDER === "postgres" ||
            process.env.FLASH_ERP_STORE_DATABASE_PROVIDER === "postgresql"
        ? "postgres"
        : "sqlite",
    terminalCode: process.env.FLASH_ERP_STORE_TERMINAL_CODE?.trim() || null,
    storeServerUrl: process.env.FLASH_ERP_STORE_SERVER_URL?.trim() || null
  }),
  ping: () => ipcRenderer.invoke("rms:ping").catch(() => "unavailable"),
  getStoreRuntimeStatus: () => ipcRenderer.invoke("flash-erp:get-store-runtime-status"),
  getDesktopWindowStatus: () => ipcRenderer.invoke("flash-erp:get-desktop-window-status"),
  recoverDesktopWindow: (reason?: string | null) =>
    ipcRenderer.invoke("flash-erp:recover-desktop-window", reason ?? "renderer-requested"),
  notifyRendererReady: () => {
    ipcRenderer.send("flash-erp:renderer-ready");
  },
  reportRendererHeartbeat: () => {
    ipcRenderer.send("flash-erp:renderer-heartbeat");
  },
  writeDesktopDiagnostic: (level, label, details) => {
    ipcRenderer.send("flash-erp:desktop-diagnostic", {
      level,
      label,
      details: details ?? null
    });
  },
  getDesktopUpdateStatus: () => ipcRenderer.invoke("flash-erp:get-desktop-update-status"),
  checkForDesktopUpdate: () => ipcRenderer.invoke("flash-erp:check-for-desktop-update"),
  installDesktopUpdate: () => ipcRenderer.invoke("flash-erp:install-desktop-update"),
  onDesktopUpdateStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => {
      listener(status as Awaited<ReturnType<DesktopRuntimeApi["getDesktopUpdateStatus"]>>);
    };

    ipcRenderer.on("flash-erp:desktop-update-status", handler);

    return () => {
      ipcRenderer.removeListener("flash-erp:desktop-update-status", handler);
    };
  },
  onSyncCycleStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => {
      listener(status as StoreSyncCycleStatusEvent);
    };

    ipcRenderer.on("flash-erp:sync-cycle-status", handler);

    return () => {
      ipcRenderer.removeListener("flash-erp:sync-cycle-status", handler);
    };
  },
  getDesktopConnectionConfig: () =>
    ipcRenderer.invoke("flash-erp:get-desktop-connection-config"),
  saveDesktopConnectionConfig: (input) =>
    ipcRenderer.invoke("flash-erp:save-desktop-connection-config", input),
  provisionStoreDatabase: (input) =>
    ipcRenderer.invoke("flash-erp:provision-store-database", input),
  restartDesktop: () => ipcRenderer.invoke("flash-erp:restart-desktop"),
  getSyncSnapshot: () => ipcRenderer.invoke("flash-erp:get-sync-snapshot"),
  getSyncStatusSnapshot: () =>
    ipcRenderer.invoke("flash-erp:get-sync-status-snapshot"),
  bootstrapStandaloneAdmin: (input) =>
    ipcRenderer.invoke("flash-erp:bootstrap-standalone-admin", input),
  saveStandaloneSettings: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-settings", input),
  saveStandaloneDepartment: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-department", input),
  saveStandaloneCategory: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-category", input),
  saveStandaloneUnitOfMeasure: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-unit-of-measure", input),
  saveStandaloneTaxProfile: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-tax-profile", input),
  saveStandaloneTenderMethod: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-tender-method", input),
  saveStandaloneLocation: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-location", input),
  saveStandaloneBankAccount: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-bank-account", input),
  saveStandaloneSupplier: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-supplier", input),
  saveStandalonePriceListEntry: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-price-list-entry", input),
  saveStandalonePromotion: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-promotion", input),
  saveStandaloneProduct: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-product", input),
  saveStandalonePasswordPolicy: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-password-policy", input),
  saveStandaloneRole: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-role", input),
  saveStandaloneUser: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-user", input),
  saveStandaloneCustomer: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-customer", input),
  signInOperator: (input: StoreOperatorSignInInput) =>
    ipcRenderer.invoke("flash-erp:sign-in-operator", input),
  signOutOperator: () => ipcRenderer.invoke("flash-erp:sign-out-operator"),
  lookupCatalogItem: (query: string) => ipcRenderer.invoke("flash-erp:lookup-catalog-item", query),
  browseCatalogItems: (input) => ipcRenderer.invoke("flash-erp:browse-catalog-items", input),
  browseInventoryPositions: (input) =>
    ipcRenderer.invoke("flash-erp:browse-inventory-positions", input),
  lookupRemoteStoreInventory: (input) =>
    ipcRenderer.invoke("flash-erp:lookup-remote-store-inventory", input),
  requestRemoteInterStoreStock: (input) =>
    ipcRenderer.invoke("flash-erp:request-remote-inter-store-stock", input),
  browseSerialRegistry: (input) =>
    ipcRenderer.invoke("flash-erp:browse-serial-registry", input),
  browsePurchaseOrders: (input) =>
    ipcRenderer.invoke("flash-erp:browse-purchase-orders", input),
  saveStandalonePurchaseOrder: (input) =>
    ipcRenderer.invoke("flash-erp:save-standalone-purchase-order", input),
  browseInterStoreTransfers: (input) =>
    ipcRenderer.invoke("flash-erp:browse-inter-store-transfers", input),
  searchCustomers: (input) => ipcRenderer.invoke("flash-erp:search-customers", input),
  searchTransactionReferences: (input) =>
    ipcRenderer.invoke("flash-erp:search-transaction-references", input),
  browseStoreReports: (input) => ipcRenderer.invoke("flash-erp:browse-store-reports", input),
  recordCustomerAccountPayment: (input) =>
    ipcRenderer.invoke("flash-erp:record-customer-account-payment", input),
  createSalesOrderFromActiveBasket: (input?: StoreCreateSalesOrderRequest) =>
    ipcRenderer.invoke("flash-erp:create-sales-order-from-active-basket", input),
  resumeSalesOrder: (orderId: string) =>
    ipcRenderer.invoke("flash-erp:resume-sales-order", orderId),
  cancelSalesOrder: (input: StoreCancelSalesOrderRequest) =>
    ipcRenderer.invoke("flash-erp:cancel-sales-order", input),
  recordEodReconciliation: (input: StoreRecordEodReconciliationRequest) =>
    ipcRenderer.invoke("flash-erp:record-eod-reconciliation", input),
  recordBankingDeposit: (input: StoreRecordBankingDepositRequest) =>
    ipcRenderer.invoke("flash-erp:record-banking-deposit", input),
  attachCustomerToActiveBasket: (input) =>
    ipcRenderer.invoke("flash-erp:attach-customer-to-active-basket", input),
  setActiveBasketLoyaltyRedemption: (input) =>
    ipcRenderer.invoke("flash-erp:set-active-basket-loyalty-redemption", input),
  saveInterStoreTransferRequestDraft: (input) =>
    ipcRenderer.invoke("flash-erp:save-inter-store-transfer-request-draft", input),
  submitInterStoreTransferRequestDraft: (draftId: string) =>
    ipcRenderer.invoke("flash-erp:submit-inter-store-transfer-request-draft", draftId),
  saveStockCountSessionDraft: (input) =>
    ipcRenderer.invoke("flash-erp:save-stock-count-session-draft", input),
  submitStockCountSession: (sessionId: string) =>
    ipcRenderer.invoke("flash-erp:submit-stock-count-session", sessionId),
  commitStockCountSession: (sessionId: string) =>
    ipcRenderer.invoke("flash-erp:commit-stock-count-session", sessionId),
  openShift: (input) => ipcRenderer.invoke("flash-erp:open-shift", input),
  closeActiveShift: (input) => ipcRenderer.invoke("flash-erp:close-active-shift", input),
  searchReceipts: (input) => ipcRenderer.invoke("flash-erp:search-receipts", input),
  lookupReceiptForCorrection: (transactionNo: string) =>
    ipcRenderer.invoke("flash-erp:lookup-receipt-for-correction", transactionNo),
  addItemToBasket: (input: StoreBasketItemRequest) =>
    ipcRenderer.invoke("flash-erp:add-item-to-basket", input),
  startReturnBasket: (input) => ipcRenderer.invoke("flash-erp:start-return-basket", input),
  startExchangeBasket: (input) => ipcRenderer.invoke("flash-erp:start-exchange-basket", input),
  startReturnFromReceipt: (transactionNo: string) =>
    ipcRenderer.invoke("flash-erp:start-return-from-receipt", transactionNo),
  startExchangeFromReceipt: (transactionNo: string) =>
    ipcRenderer.invoke("flash-erp:start-exchange-from-receipt", transactionNo),
  addReceiptLineToBasket: (input) =>
    ipcRenderer.invoke("flash-erp:add-receipt-line-to-basket", input),
  updateBasketLine: (input: StoreBasketLineUpdateRequest) =>
    ipcRenderer.invoke("flash-erp:update-basket-line", input),
  removeBasketLine: (lineId: string) =>
    ipcRenderer.invoke("flash-erp:remove-basket-line", lineId),
  discardActiveBasket: () => ipcRenderer.invoke("flash-erp:discard-active-basket"),
  checkoutActiveBasket: (input?: StoreBasketCheckoutRequest) =>
    ipcRenderer.invoke("flash-erp:checkout-active-basket", input),
  listReceiptPrinters: () => ipcRenderer.invoke("flash-erp:list-receipt-printers"),
  saveReceiptPrinterSettings: (input) =>
    ipcRenderer.invoke("flash-erp:save-receipt-printer-settings", input),
  saveLocalReceiptLogo: (input) =>
    ipcRenderer.invoke("flash-erp:save-local-receipt-logo", input),
  printReceipt: (input) => ipcRenderer.invoke("flash-erp:print-receipt", input),
  printSalesOrderReceipt: (input) =>
    ipcRenderer.invoke("flash-erp:print-sales-order-receipt", input),
  printAccountPaymentReceipt: (input) =>
    ipcRenderer.invoke("flash-erp:print-account-payment-receipt", input),
  printShiftReport: (input) => ipcRenderer.invoke("flash-erp:print-shift-report", input),
  printThermalTestSlip: () => ipcRenderer.invoke("flash-erp:print-thermal-test-slip"),
  kickCashDrawer: (input) => ipcRenderer.invoke("flash-erp:kick-cash-drawer", input),
  parkActiveBasket: () => ipcRenderer.invoke("flash-erp:park-active-basket"),
  resumeParkedBasket: (transactionId: string) =>
    ipcRenderer.invoke("flash-erp:resume-parked-basket", transactionId),
  captureDemoSale: () => ipcRenderer.invoke("flash-erp:capture-demo-sale"),
  captureScannedSale: (input: StoreSellCaptureRequest) =>
    ipcRenderer.invoke("flash-erp:capture-scanned-sale", input),
  receivePurchaseOrder: (input) => ipcRenderer.invoke("flash-erp:receive-purchase-order", input),
  recordSupplierReturn: (input) => ipcRenderer.invoke("flash-erp:record-supplier-return", input),
  acknowledgeSupplierReturnCancellation: (input) =>
    ipcRenderer.invoke("flash-erp:acknowledge-supplier-return-cancellation", input),
  issueInterStoreTransfer: (input) =>
    ipcRenderer.invoke("flash-erp:issue-inter-store-transfer", input),
  receiveInterStoreTransfer: (input) =>
    ipcRenderer.invoke("flash-erp:receive-inter-store-transfer", input),
  startSyncCycle: (input) => ipcRenderer.invoke("flash-erp:start-sync-cycle", input),
  runSyncCycle: (input) => ipcRenderer.invoke("flash-erp:run-sync-cycle", input),
  requeueDeadLetters: () => ipcRenderer.invoke("flash-erp:requeue-dead-letters"),
  completeRecoveryTask: (taskId: string) =>
    ipcRenderer.invoke("flash-erp:complete-recovery-task", taskId)
};

contextBridge.exposeInMainWorld("desktopRuntime", desktopRuntime);
