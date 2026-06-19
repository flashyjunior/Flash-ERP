export const retailEntityKeys = [
  "retailOrg",
  "store",
  "warehouse",
  "terminal",
  "syncNode",
  "retailUser",
  "role",
  "permission",
  "customer",
  "customerAccountEntry",
  "salesOrder",
  "eodReconciliation",
  "bankingDeposit",
  "bankAccount",
  "supplier",
  "taxProfile",
  "tenderMethod",
  "unitOfMeasure",
  "giftCertificate",
  "promotion",
  "productDepartment",
  "productCategory",
  "product",
  "productSupplier",
  "barcode",
  "priceList",
  "inventoryLocation",
  "inventorySerialSnapshot",
  "purchaseOrder",
  "stockCountSession",
  "interStoreTransfer",
  "interStoreTransferTarget",
  "goodsReceipt",
  "supplierReturn",
  "syncTask",
  "storeInstruction",
  "inventoryTransfer",
  "inventoryLedgerEntry",
  "posShift",
  "posTransaction",
  "posTransactionLine",
  "posPayment"
] as const;

export type RetailEntityKey = (typeof retailEntityKeys)[number];

export const appSurfaces = [
  "enterprise-web",
  "store-desktop",
  "mobile"
] as const;

export type AppSurface = (typeof appSurfaces)[number];

export type SyncableRecordEnvelope = {
  id: string;
  recordVersion: number;
  updatedAt: string;
  deletedAt: string | null;
  originNodeCode: string | null;
  lastModifiedByNodeCode: string | null;
};

export type StoreBinding = {
  retailOrgCode: string;
  storeCode: string;
  storeName: string;
  terminalCode?: string;
  nodeCode: string;
  timezone: string;
  currencyCode: string;
};

export type DesktopPeripheralSupport = {
  barcodeScanner: boolean;
  receiptPrinter: boolean;
  cashDrawer: boolean;
  weighingScale: boolean;
};
