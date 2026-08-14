import type { StoreTerminalContext } from "./offline/local-store-service.js";

export const storeServiceMethods = [
  "getSyncSnapshot",
  "getSyncStatusSnapshot",
  "bootstrapStandaloneAdmin",
  "saveStandaloneSettings",
  "saveStandaloneDepartment",
  "saveStandaloneCategory",
  "saveStandaloneUnitOfMeasure",
  "saveStandaloneTaxProfile",
  "saveStandaloneTenderMethod",
  "saveStandaloneLocation",
  "saveStandaloneBankAccount",
  "saveStandaloneSupplier",
  "saveStandalonePriceListEntry",
  "saveStandalonePromotion",
  "saveStandaloneProduct",
  "saveStandalonePasswordPolicy",
  "saveStandaloneRole",
  "saveStandaloneUser",
  "saveStandaloneCustomer",
  "signInOperator",
  "signOutOperator",
  "lookupCatalogItem",
  "browseCatalogItems",
  "browseInventoryPositions",
  "lookupRemoteStoreInventory",
  "requestRemoteInterStoreStock",
  "browseSerialRegistry",
  "browsePurchaseOrders",
  "saveStandalonePurchaseOrder",
  "browseInterStoreTransfers",
  "searchCustomers",
  "searchTransactionReferences",
  "browseStoreReports",
  "recordCustomerAccountPayment",
  "createSalesOrderFromActiveBasket",
  "resumeSalesOrder",
  "receiveLayawayPayment",
  "releaseLayawayReservation",
  "expireLayaway",
  "cancelSalesOrder",
  "recordEodReconciliation",
  "recordBankingDeposit",
  "saveStoreExpenseDraft",
  "confirmStoreExpense",
  "attachCustomerToActiveBasket",
  "setActiveBasketLoyaltyRedemption",
  "saveInterStoreTransferRequestDraft",
  "submitInterStoreTransferRequestDraft",
  "saveStockCountSessionDraft",
  "submitStockCountSession",
  "commitStockCountSession",
  "openShift",
  "closeActiveShift",
  "searchReceipts",
  "lookupReceiptForCorrection",
  "addItemToBasket",
  "startReturnBasket",
  "startExchangeBasket",
  "startReturnFromReceipt",
  "startExchangeFromReceipt",
  "addReceiptLineToBasket",
  "updateBasketLine",
  "removeBasketLine",
  "discardActiveBasket",
  "checkoutActiveBasket",
  "saveReceiptPrinterSettings",
  "saveLocalReceiptLogo",
  "authorizeReceiptPrint",
  "getPrintableReceiptDocument",
  "getPrintableSalesOrderReceiptDocument",
  "getPrintableAccountPaymentReceiptDocument",
  "prepareThermalTestSlip",
  "prepareCashDrawerKick",
  "parkActiveBasket",
  "resumeParkedBasket",
  "captureDemoSale",
  "captureScannedSale",
  "receivePurchaseOrder",
  "recordSupplierReturn",
  "acknowledgeSupplierReturnCancellation",
  "issueInterStoreTransfer",
  "receiveInterStoreTransfer",
  "runSyncCycle",
  "requeueDeadLetters",
  "completeRecoveryTask"
] as const;

export type StoreServiceMethod = (typeof storeServiceMethods)[number];

export type StoreServiceRequest = {
  args?: unknown[];
  terminalContext?: StoreTerminalContext | null;
};

export type StoreServiceSuccessResponse = {
  ok: true;
  data: unknown;
};

export type StoreServiceErrorResponse = {
  ok: false;
  error: {
    message: string;
    name: string;
    stack?: string;
  };
};

export type StoreServiceResponse = StoreServiceSuccessResponse | StoreServiceErrorResponse;

const storeServiceMethodSet = new Set<string>(storeServiceMethods);

export function isStoreServiceMethod(value: string): value is StoreServiceMethod {
  return storeServiceMethodSet.has(value);
}
