import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  Dispatch,
  FormEvent,
  ReactNode,
  SetStateAction,
} from "react";

import retailLoginBackgroundUrl from "../assets/retail-login-bg.jpg";
import { buildGoodsReceiptPrintWindowHtml } from "../shared/receipt-printing";
import { computeNextStoreSyncAt } from "../shared/desktop-runtime";
import type {
  DesktopRuntimeApi,
  StoreBasketCheckoutPayment,
  StoreBasketLineSummary,
  StoreBasketSummary,
  StoreCatalogBrowseItem,
  StoreCatalogMatrixVariant,
  StoreCustomerSummary,
  StoreDesktopConnectionConfig,
  StoreDesktopConnectionConfigResult,
  StoreDesktopUpdateStatus,
  StoreDesktopWindowStatus,
  StoreInventoryBrowseItem,
  StoreInterStoreTransferRequestDraftSummary,
  StoreInterStoreTransferSummary,
  StoreLocalGoodsReceiptSummary,
  StoreLocalSupplierReturnReason,
  StorePurchaseOrderSummary,
  StoreReceiptHistoryKind,
  StoreReceiptLookupResult,
  StoreReceiptSearchResult,
  StoreRemoteInventoryLookupResult,
  StoreReportBrowseRequest,
  StoreReportResult,
  StoreSalesOrderSummary,
  StoreRuntimeStatus,
  StoreStandalonePasswordPolicyInput,
  StoreStandaloneProductInput,
  StoreStandalonePurchaseOrderInput,
  StoreStoreExpenseInput,
  StoreTransactionReferenceSummary,
  StoreSyncActionResult,
  StoreSyncRunOptions,
  StoreSyncSnapshot,
} from "@shared/desktop-runtime";

type SaleMode = "SALE" | "SALES_ORDER";

type OperationalWorkspace =
  | "dashboard"
  | "pos"
  | "setup"
  | "security"
  | "inventory"
  | "manager"
  | "reversals"
  | "reports"
  | "sync";
type StandaloneSetupSection =
  | "shop"
  | "operations"
  | "departments"
  | "categories"
  | "products"
  | "units"
  | "tax"
  | "tenders"
  | "catalog"
  | "pricing"
  | "receipt-templates"
  | "customers"
  | "people";
type StandaloneSecuritySection =
  | "roles"
  | "users"
  | "audit"
  | "password-policy";
type SidebarIconName =
  | "dashboard"
  | "pos"
  | "setup"
  | "security"
  | "inventory"
  | "manager"
  | "reversals"
  | "reports"
  | "sync"
  | "shop"
  | "operations"
  | "catalog"
  | "pricing"
  | "people";
type ReportKind =
  | "sales"
  | "tenders"
  | "products"
  | "orders"
  | "inventory"
  | "shifts"
  | "account-payments"
  | "banking";
type ReportWorkspace =
  | "report-cashier-sales"
  | "report-store-sales"
  | "report-tenders"
  | "report-products"
  | "report-orders"
  | "report-inventory"
  | "report-shifts"
  | "report-account-payments"
  | "report-banking";
type Workspace = OperationalWorkspace | ReportWorkspace;

type PaymentDraft = {
  id: string;
  tenderMethodCode: string;
  bankAccountId: string;
  amount: string;
  reference: string;
};

type OpenPriceDraft = {
  lookupValue: string;
  productCode: string;
  productVariantCode: string | null;
  productName: string;
  productType: string | null;
  quantity: string;
  unitPrice: string;
  mustEnterPriceAtPos: boolean;
  isSerialized: boolean;
  trackSize: boolean;
  trackColor: boolean;
  variantSize: string;
  variantColor: string;
  variantSearch: string;
  variantAttributesSnapshot: string | null;
  lineNote: string;
  matrixVariants: StoreCatalogMatrixVariant[];
  availableSerialNumbers: string[];
  serialNumbers: string;
  serialEntry: string;
  serialRangeStart: string;
  serialRangeEnd: string;
  serialValidationMessage: string | null;
};

type ProductColourOption = {
  name: string;
  value: string;
};

const productColourOptions: ProductColourOption[] = [
  { name: "Black", value: "#111827" },
  { name: "White", value: "#ffffff" },
  { name: "Grey", value: "#6b7280" },
  { name: "Navy", value: "#1e3a8a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Red", value: "#dc2626" },
  { name: "Burgundy", value: "#7f1d1d" },
  { name: "Brown", value: "#92400e" },
  { name: "Beige", value: "#d6c7a1" },
  { name: "Gold", value: "#d97706" },
  { name: "Orange", value: "#f97316" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Pink", value: "#ec4899" },
];

const productColourNameByValue = new Map(
  productColourOptions.map((option) => [option.value, option.name]),
);

function normalizeProductColour(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";

  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#111827";
}

function getProductColourName(value: string | null | undefined) {
  return productColourNameByValue.get(normalizeProductColour(value)) ?? "Custom";
}

type InventorySerialDraft = {
  title: string;
  productName: string;
  quantity: number;
  availableSerialNumbers: string[];
  serialNumbers: string;
  serialEntry: string;
  serialRangeStart: string;
  serialRangeEnd: string;
  message: string | null;
  submitLabel: string;
  onSubmit: (serialNumbers: string[]) => Promise<void>;
};

type StockCountUploadRow = {
  productCode: string;
  productName: string;
  systemQuantity: number;
  countedQuantity: number | null;
  varianceQuantity: number | null;
};

type PostgresConnectionDraft = {
  host: string;
  port: string;
  database: string;
  schema: string;
  username: string;
  password: string;
  sslMode: string;
};

type MssqlConnectionDraft = {
  server: string;
  port: string;
  database: string;
  username: string;
  password: string;
  encrypt: string;
  trustServerCertificate: string;
};

const supplierReturnReasonOptions: StoreLocalSupplierReturnReason[] = [
  "DAMAGED",
  "REJECTED_AT_RECEIPT",
  "QUALITY_HOLD",
  "SHORT_EXPIRY",
  "WRONG_ITEM",
  "OTHER",
];

const defaultDesktopConnectionConfig: StoreDesktopConnectionConfig = {
  deploymentMode: "ENTERPRISE_MANAGED",
  runtimeRole: "embedded",
  databaseProvider: "sqlite",
  nodeCode: "",
  terminalCode: "",
  terminalName: "",
  storeServerUrl: "",
  storeServerToken: "",
  storeServerHost: "0.0.0.0",
  storeServerPort: 4747,
  storeServerTimeoutMs: 8000,
  storeServerEnabled: false,
  databaseUrl: "",
  databasePath: "",
  userDataPath: "",
  syncBaseUrl: "",
  updateFeedUrl:
    "https://updates.flashcodesolutions.com/flash-erp/store-desktop/",
};

const workspaceItems: Array<{
  id: OperationalWorkspace;
  label: string;
  detail: string;
  icon: SidebarIconName;
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    detail: "Shop pulse, sales, stock",
    icon: "dashboard",
  },
  { id: "pos", label: "POS", detail: "Sales, orders, shifts", icon: "pos" },
  { id: "setup", label: "Master", detail: "Local masters", icon: "setup" },
  {
    id: "security",
    label: "Security",
    detail: "Users, roles, audit",
    icon: "security",
  },
  {
    id: "inventory",
    label: "Inventory",
    detail: "Request, receive, count",
    icon: "inventory",
  },
  {
    id: "manager",
    label: "Manager",
    detail: "EOD, banking, reports",
    icon: "manager",
  },
  {
    id: "reversals",
    label: "Reversals",
    detail: "Returns, exchanges",
    icon: "reversals",
  },
  {
    id: "reports",
    label: "Reports",
    detail: "Sales, stock, banking",
    icon: "reports",
  },
  { id: "sync", label: "Sync", detail: "Queues, recovery", icon: "sync" },
];

const standaloneSetupItems: Array<{
  id: StandaloneSetupSection;
  label: string;
  detail: string;
  icon: SidebarIconName;
}> = [
  { id: "shop", label: "Shop", detail: "Store profile", icon: "shop" },
  {
    id: "operations",
    label: "Operations",
    detail: "Locations, banks, suppliers",
    icon: "operations",
  },
  {
    id: "departments",
    label: "Departments",
    detail: "Product departments",
    icon: "catalog",
  },
  {
    id: "categories",
    label: "Categories",
    detail: "Product categories",
    icon: "catalog",
  },
  {
    id: "products",
    label: "Products",
    detail: "Product records",
    icon: "catalog",
  },
  { id: "units", label: "Units", detail: "Units of measure", icon: "pricing" },
  { id: "tax", label: "Tax", detail: "Tax profiles", icon: "pricing" },
  { id: "tenders", label: "Tenders", detail: "Payment methods", icon: "pricing" },
  {
    id: "pricing",
    label: "Pricing & Promotions",
    detail: "Local prices and offers",
    icon: "pricing",
  },
  {
    id: "customers",
    label: "Customers",
    detail: "Accounts receivable",
    icon: "people",
  },
  {
    id: "receipt-templates",
    label: "Receipt Templates",
    detail: "Print templates",
    icon: "shop",
  },
];

const standaloneSecurityItems: Array<{
  id: StandaloneSecuritySection;
  label: string;
  detail: string;
  icon: SidebarIconName;
}> = [
  {
    id: "roles",
    label: "Roles & Privileges",
    detail: "Role permissions",
    icon: "security",
  },
  { id: "users", label: "Users", detail: "Operator accounts", icon: "people" },
  { id: "audit", label: "Audit", detail: "Activity log", icon: "reports" },
  {
    id: "password-policy",
    label: "Password Policy",
    detail: "Local password rules",
    icon: "setup",
  },
];

const reportWorkspaceItems: Array<{
  id: ReportWorkspace;
  label: string;
  detail: string;
  scope: "CASHIER" | "STORE";
  reportKind: ReportKind;
}> = [
  {
    id: "report-cashier-sales",
    label: "My Sales",
    detail: "Cashier sales only",
    scope: "CASHIER",
    reportKind: "sales",
  },
  {
    id: "report-store-sales",
    label: "Sales",
    detail: "Store sales report",
    scope: "STORE",
    reportKind: "sales",
  },
  {
    id: "report-tenders",
    label: "Tenders",
    detail: "Tender totals",
    scope: "STORE",
    reportKind: "tenders",
  },
  {
    id: "report-products",
    label: "Products",
    detail: "Product sales",
    scope: "STORE",
    reportKind: "products",
  },
  {
    id: "report-orders",
    label: "Sales Orders",
    detail: "Deposits and balances",
    scope: "STORE",
    reportKind: "orders",
  },
  {
    id: "report-inventory",
    label: "Inventory",
    detail: "Stock position",
    scope: "STORE",
    reportKind: "inventory",
  },
  {
    id: "report-shifts",
    label: "Shifts",
    detail: "Start and end",
    scope: "STORE",
    reportKind: "shifts",
  },
  {
    id: "report-account-payments",
    label: "Account Pay",
    detail: "Customer collections",
    scope: "STORE",
    reportKind: "account-payments",
  },
  {
    id: "report-banking",
    label: "Banking",
    detail: "Deposits",
    scope: "STORE",
    reportKind: "banking",
  },
];

const moneyFormatter = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
});

const scheduleDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function readRuntime() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (window as Window & { desktopRuntime?: DesktopRuntimeApi })
      .desktopRuntime ?? null
  );
}

function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(value ?? 0);
}

function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0);
}

function isServiceCatalogItem(
  item: Pick<StoreCatalogBrowseItem, "productType" | "trackInventory">,
) {
  return (
    (item.productType ?? "").trim().toUpperCase() === "SERVICE" ||
    item.trackInventory === false
  );
}

function isCatalogItemSellable(
  item: Pick<
    StoreCatalogBrowseItem,
    "productType" | "trackInventory" | "quantityOnHand" | "salesLocationQuantity"
  >,
) {
  return isServiceCatalogItem(item) || (item.salesLocationQuantity ?? item.quantityOnHand) > 0;
}

function formatCatalogItemAvailability(
  item: Pick<
    StoreCatalogBrowseItem,
    | "productType"
    | "trackInventory"
    | "quantityOnHand"
    | "salesLocationQuantity"
    | "isSerialized"
  >,
) {
  const quantity = item.salesLocationQuantity ?? item.quantityOnHand;

  if (isServiceCatalogItem(item)) {
    return "Service";
  }

  if (item.isSerialized) {
    return quantity > 0
      ? `Serialized - Stock ${formatNumber(quantity)}`
      : "Serialized - Out of stock";
  }

  return quantity > 0 ? `Stock ${formatNumber(quantity)}` : "Out of stock";
}

function formatDiscountRate(rate: number) {
  return Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2);
}

function formatMatrixVariantLabel(variant: StoreCatalogMatrixVariant) {
  const attributes = variant.attributes
    .map((attribute) => `${attribute.attributeName}: ${attribute.valueLabel}`)
    .join(" / ");

  return variant.displayName ?? (attributes || variant.sku || variant.variantCode);
}

function getMatrixVariantSearchText(variant: StoreCatalogMatrixVariant) {
  return [
    variant.variantCode,
    variant.sku,
    variant.barcode,
    variant.displayName,
    ...variant.attributes.flatMap((attribute) => [
      attribute.attributeCode,
      attribute.attributeName,
      attribute.valueCode,
      attribute.valueLabel,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function filterMatrixVariants(
  variants: StoreCatalogMatrixVariant[],
  query: string,
  selectedVariantCode: string | null,
) {
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedSelectedCode = selectedVariantCode?.trim().toUpperCase() ?? "";

  if (!normalizedQuery) {
    return variants;
  }

  return variants.filter(
    (variant) =>
      variant.variantCode.toUpperCase() === normalizedSelectedCode ||
      getMatrixVariantSearchText(variant).includes(normalizedQuery),
  );
}

function resolveMatrixVariant(
  variants: StoreCatalogMatrixVariant[] | undefined,
  variantCode: string | null,
) {
  const normalizedCode = variantCode?.trim().toUpperCase();

  return (
    variants?.find(
      (variant) => variant.variantCode.toUpperCase() === normalizedCode,
    ) ?? null
  );
}

function withDesktopTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 15_000,
) {
  let timeoutHandle: number | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = window.setTimeout(() => {
      reject(
        new Error(
          `${label} did not respond within ${Math.round(timeoutMs / 1000)} seconds. Check the Sync > Runtime status panel, then recover the desktop window if it stays unresponsive.`,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  });
}

function createDesktopTraceId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatWindowBounds(bounds: StoreDesktopWindowStatus["bounds"]) {
  if (!bounds) {
    return "Unavailable";
  }

  return `${bounds.width}x${bounds.height} @ ${bounds.x},${bounds.y}`;
}

function formatDurationMs(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Unavailable";
  }

  if (value < 1_000) {
    return `${Math.round(value)} ms`;
  }

  const seconds = Math.round(value / 1_000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
}

function describeWindowWatchdog(status: StoreDesktopWindowStatus | null) {
  if (!status) {
    return "Waiting for runtime";
  }

  if (status.recoveryInFlight) {
    return "Recovering";
  }

  if (status.watchdogState === "healthy") {
    return "Healthy";
  }

  if (status.watchdogState === "stale") {
    return "Stale heartbeat";
  }

  if (status.watchdogState === "waiting") {
    return "Waiting for ready";
  }

  return "Unavailable";
}

function parseStockCountCsv(
  text: string,
): Array<{ productCode: string; countedQuantity: number | null }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [productCode = "", , countedQuantity = ""] = line
        .split(",")
        .map((value) => value.trim().replace(/^"|"$/g, ""));

      return {
        productCode: productCode.toUpperCase(),
        countedQuantity:
          countedQuantity === "" || !Number.isFinite(Number(countedQuantity))
            ? null
            : Number(countedQuantity),
      };
    })
    .filter((row) => row.productCode);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

function parseCsvRecords(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headers = parseCsvLine(lines[0] ?? "").map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]+/g, ""),
  );

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
}

function readCsvRecordValue(
  record: Record<string, string>,
  ...keys: string[]
) {
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const value = record[normalizedKey]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function readCsvNumber(
  record: Record<string, string>,
  fallback: number,
  ...keys: string[]
) {
  const raw = readCsvRecordValue(record, ...keys);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCsvBoolean(
  record: Record<string, string>,
  fallback: boolean,
  ...keys: string[]
) {
  const raw = readCsvRecordValue(record, ...keys).toLowerCase();

  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(raw)
    ? true
    : ["0", "false", "no", "n"].includes(raw)
      ? false
      : fallback;
}

function parseStandaloneProductCsv(text: string): StoreStandaloneProductInput[] {
  return parseCsvRecords(text)
    .map<StoreStandaloneProductInput>((record) => ({
      productCode: readCsvRecordValue(record, "productCode", "code").toUpperCase(),
      productName: readCsvRecordValue(record, "productName", "name"),
      shortName: readCsvRecordValue(record, "shortName", "short") || null,
      description: readCsvRecordValue(record, "description") || null,
      primaryImageUrl:
        readCsvRecordValue(record, "primaryImageUrl", "imageUrl") || null,
      barcode: readCsvRecordValue(record, "barcode") || null,
      departmentCode:
        readCsvRecordValue(record, "departmentCode", "department").toUpperCase() ||
        null,
      categoryCode:
        readCsvRecordValue(record, "categoryCode", "category").toUpperCase() ||
        null,
      subcategory: readCsvRecordValue(record, "subcategory") || null,
      unitOfMeasure:
        readCsvRecordValue(record, "unitOfMeasure", "unit").toUpperCase() ||
        "EA",
      taxable: readCsvBoolean(record, true, "taxable"),
      taxProfileCode:
        readCsvRecordValue(record, "taxProfileCode", "taxCode").toUpperCase() ||
        null,
      trackInventory: readCsvBoolean(record, true, "trackInventory", "inventory"),
      isSerialized: readCsvBoolean(record, false, "isSerialized", "serialized"),
      mustEnterPriceAtPos: readCsvBoolean(
        record,
        false,
        "mustEnterPriceAtPos",
        "manualPrice",
      ),
      unitPrice: readCsvNumber(record, 0, "unitPrice", "price"),
      quantityOnHand: readCsvNumber(record, 0, "quantityOnHand", "openingQty"),
      minStockLevel: readCsvNumber(record, 0, "minStockLevel", "minStock"),
      reorderPoint: readCsvNumber(record, 0, "reorderPoint", "reorder"),
      safetyStockLevel: readCsvNumber(
        record,
        0,
        "safetyStockLevel",
        "safetyStock",
      ),
      catalogSortOrder: readCsvNumber(record, 0, "catalogSortOrder", "sort"),
    }))
    .filter((row) => row.productCode && row.productName);
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildStandaloneProductCsv(items: StoreCatalogBrowseItem[]) {
  const header = [
    "productCode",
    "productName",
    "shortName",
    "description",
    "primaryImageUrl",
    "barcode",
    "departmentCode",
    "categoryCode",
    "subcategory",
    "unitOfMeasure",
    "taxable",
    "taxProfileCode",
    "trackInventory",
    "isSerialized",
    "mustEnterPriceAtPos",
    "unitPrice",
    "quantityOnHand",
    "minStockLevel",
    "reorderPoint",
    "safetyStockLevel",
    "catalogSortOrder",
  ];
  const rows = items.map((item) =>
    [
      item.productCode,
      item.productName,
      item.shortName,
      item.description,
      item.primaryImageUrl,
      item.barcode,
      item.departmentCode,
      item.categoryCode,
      item.subcategory,
      item.unitOfMeasure,
      item.taxable,
      item.taxProfileCode,
      item.trackInventory,
      item.isSerialized,
      item.mustEnterPriceAtPos,
      item.unitPrice,
      item.quantityOnHand,
      item.minStockLevel,
      item.reorderPoint,
      item.safetyStockLevel,
      item.catalogSortOrder,
    ]
      .map(csvCell)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

const standaloneRoleOptions = [
  "Standalone cashier",
  "Standalone manager",
  "Standalone administrator",
];

const standaloneCashierPermissionCodes = [
  "pos.shift.open",
  "pos.shift.close",
  "pos.sale.process",
  "pos.receipt.search",
  "pos.customer.attach",
] as const;

const standaloneSupervisorPermissionCodes = [
  ...standaloneCashierPermissionCodes,
  "pos.return.process",
  "pos.exchange.process",
  "pos.receipt.reprint",
  "pos.customer.account.collect",
  "pos.loyalty.redeem",
  "pos.override.no-receipt-return",
  "pos.override.discount",
  "pos.override.price",
  "inventory.view",
  "inventory.adjust",
  "inventory.count.submit",
  "inventory.count.commit",
  "inventory.transfer.request",
  "inventory.transfer.issue",
  "inventory.transfer.receive",
  "inventory.grn.receive",
  "inventory.supplier-return.manage",
  "sync.store.operate",
] as const;

const standaloneCashierPermissionCodeSet = new Set<string>(
  standaloneCashierPermissionCodes,
);

type StandaloneRoleDraft = {
  roleCode: string;
  roleName: string;
  description: string;
  status: string;
  permissionCodes: string[];
};

type StandalonePasswordPolicyDraft = {
  minimumLength: string;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  temporaryPasswordMustChange: boolean;
  passwordExpiryDays: string;
  passwordHistoryCount: string;
  lockoutThreshold: string;
  lockoutMinutes: string;
};

const defaultStandalonePasswordPolicyDraft: StandalonePasswordPolicyDraft = {
  minimumLength: "8",
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: false,
  temporaryPasswordMustChange: true,
  passwordExpiryDays: "0",
  passwordHistoryCount: "0",
  lockoutThreshold: "5",
  lockoutMinutes: "15",
};

const standalonePromotionDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const defaultStandaloneProductDraft = {
  productCode: "",
  productName: "",
  shortName: "",
  description: "",
  primaryImageUrl: "",
  barcode: "",
  departmentCode: "",
  categoryCode: "",
  subcategory: "",
  unitOfMeasure: "EA",
  taxable: true,
  taxProfileCode: "",
  trackInventory: true,
  isSerialized: false,
  mustEnterPriceAtPos: false,
  unitPrice: "0",
  quantityOnHand: "0",
  minStockLevel: "",
  reorderPoint: "",
  safetyStockLevel: "",
  catalogSortOrder: "0",
};

type StandaloneProductDraft = typeof defaultStandaloneProductDraft;

const defaultStandalonePromotionDraft = {
  promotionCode: "",
  promotionName: "",
  description: "",
  discountType: "PERCENT",
  targetScope: "ALL_ITEMS",
  discountValue: "0",
  minimumBasketAmount: "",
  minimumLineQuantity: "",
  buyQuantity: "",
  rewardQuantity: "",
  targetDepartmentCode: "",
  targetCategoryCode: "",
  targetProductCode: "",
  eligibleCustomerTypes: "",
  eligibleLoyaltyTiers: "",
  activeDaysOfWeek: [] as string[],
  activeFromTime: "",
  activeToTime: "",
  couponRequired: false,
  couponCode: "",
  allowWithLoyalty: true,
  applyOncePerBasket: false,
  priority: "0",
  startAt: "",
  endAt: "",
  status: "ACTIVE",
};

type StandalonePromotionDraft = typeof defaultStandalonePromotionDraft;

function createStandalonePromotionDraft(
  overrides: Partial<StandalonePromotionDraft> = {},
) {
  return {
    ...defaultStandalonePromotionDraft,
    ...overrides,
    activeDaysOfWeek: [
      ...(overrides.activeDaysOfWeek ??
        defaultStandalonePromotionDraft.activeDaysOfWeek),
    ],
  };
}

const standalonePromotionEditorTabs = [
  ["offer", "Offer"],
  ["target", "Target"],
  ["eligibility", "Eligibility"],
  ["schedule", "Schedule"],
] as const;

type StandalonePromotionEditorTab =
  (typeof standalonePromotionEditorTabs)[number][0];

function createStandaloneProductDraft(
  overrides: Partial<StandaloneProductDraft> = {},
) {
  return { ...defaultStandaloneProductDraft, ...overrides };
}

function createStandalonePasswordPolicyDraft(
  policy: StoreSyncSnapshot["passwordPolicy"] | null | undefined,
): StandalonePasswordPolicyDraft {
  if (!policy) {
    return { ...defaultStandalonePasswordPolicyDraft };
  }

  return {
    minimumLength: String(policy.minimumLength),
    requireUppercase: policy.requireUppercase,
    requireLowercase: policy.requireLowercase,
    requireNumber: policy.requireNumber,
    requireSymbol: policy.requireSymbol,
    temporaryPasswordMustChange: policy.temporaryPasswordMustChange,
    passwordExpiryDays: String(policy.passwordExpiryDays),
    passwordHistoryCount: String(policy.passwordHistoryCount),
    lockoutThreshold: String(policy.lockoutThreshold),
    lockoutMinutes: String(policy.lockoutMinutes),
  };
}

function createStandalonePasswordPolicyInput(
  draft: StandalonePasswordPolicyDraft,
): StoreStandalonePasswordPolicyInput {
  return {
    minimumLength: numberDraft(draft.minimumLength, 8),
    requireUppercase: draft.requireUppercase,
    requireLowercase: draft.requireLowercase,
    requireNumber: draft.requireNumber,
    requireSymbol: draft.requireSymbol,
    temporaryPasswordMustChange: draft.temporaryPasswordMustChange,
    passwordExpiryDays: numberDraft(draft.passwordExpiryDays, 0),
    passwordHistoryCount: numberDraft(draft.passwordHistoryCount, 0),
    lockoutThreshold: numberDraft(draft.lockoutThreshold, 5),
    lockoutMinutes: numberDraft(draft.lockoutMinutes, 15),
  };
}

function nullableNumberDraft(value: string) {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return trimmed && Number.isFinite(parsed) ? parsed : null;
}

function numberDraft(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvListDraft(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item, index, items) => item.length > 0 && items.indexOf(item) === index,
    );
}

function joinListDraft(values: string[] | null | undefined) {
  return (values ?? []).join(", ");
}

function timeDraftToMinutes(value: string) {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? Math.max(0, Math.min(1439, hours * 60 + minutes))
    : null;
}

function minutesToTimeDraft(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  const normalized = Math.max(0, Math.min(1439, Math.trunc(value)));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function createStandaloneProductInput(
  draft: StandaloneProductDraft,
): StoreStandaloneProductInput {
  return {
    productCode: draft.productCode,
    productName: draft.productName,
    shortName: draft.shortName,
    description: draft.description,
    primaryImageUrl: draft.primaryImageUrl,
    barcode: draft.barcode,
    departmentCode: draft.departmentCode,
    categoryCode: draft.categoryCode,
    subcategory: draft.subcategory,
    unitOfMeasure: draft.unitOfMeasure,
    taxable: draft.taxable,
    taxProfileCode: draft.taxProfileCode,
    trackInventory: draft.trackInventory,
    isSerialized: draft.isSerialized,
    mustEnterPriceAtPos: draft.mustEnterPriceAtPos,
    unitPrice: numberDraft(draft.unitPrice),
    quantityOnHand: numberDraft(draft.quantityOnHand),
    minStockLevel: nullableNumberDraft(draft.minStockLevel),
    reorderPoint: nullableNumberDraft(draft.reorderPoint),
    safetyStockLevel: nullableNumberDraft(draft.safetyStockLevel),
    catalogSortOrder: nullableNumberDraft(draft.catalogSortOrder),
  };
}

function createStandaloneProductDraftFromCatalogItem(
  row: StoreCatalogBrowseItem,
) {
  return createStandaloneProductDraft({
    productCode: row.productCode,
    productName: row.productName,
    shortName: row.shortName ?? "",
    description: row.description ?? "",
    primaryImageUrl: row.primaryImageUrl ?? "",
    barcode: row.barcode ?? "",
    departmentCode: row.departmentCode ?? "",
    categoryCode: row.categoryCode ?? "",
    subcategory: row.subcategory ?? "",
    unitOfMeasure: row.unitOfMeasure || "EA",
    taxable: row.taxable !== false,
    taxProfileCode: row.taxProfileCode ?? "",
    trackInventory: row.trackInventory !== false,
    isSerialized: row.isSerialized,
    mustEnterPriceAtPos: row.mustEnterPriceAtPos,
    unitPrice: String(row.unitPrice),
    quantityOnHand: String(row.quantityOnHand),
    minStockLevel: row.minStockLevel == null ? "" : String(row.minStockLevel),
    reorderPoint: row.reorderPoint == null ? "" : String(row.reorderPoint),
    safetyStockLevel:
      row.safetyStockLevel == null ? "" : String(row.safetyStockLevel),
    catalogSortOrder:
      row.catalogSortOrder == null ? "0" : String(row.catalogSortOrder),
  });
}

function buildStandaloneRoleOptions(
  users: StoreSyncSnapshot["storeUsers"],
  standaloneRoles: NonNullable<StoreSyncSnapshot["standaloneRoles"]> = [],
) {
  const roles = new Set(standaloneRoleOptions);

  standaloneRoles.forEach((role) => {
    if (role.roleName.trim()) {
      roles.add(role.roleName);
    }
  });

  users.forEach((user) => {
    user.roleNames.forEach((roleName) => {
      if (roleName.trim()) {
        roles.add(roleName);
      }
    });
  });

  return Array.from(roles);
}

function formatPermissionLabel(permissionCode: string) {
  return permissionCode
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function downloadTextFile(
  fileName: string,
  text: string,
  mimeType = "text/csv",
) {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatBytes(value: number | null | undefined) {
  if (!value) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDurationSeconds(value: number | null | undefined) {
  if (value == null) {
    return "Unknown";
  }

  if (value < 60) {
    return `${Math.floor(value)}s`;
  }

  const minutes = Math.floor(value / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  return dateTimeFormatter.format(new Date(value));
}

function todayInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatScheduleDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Not scheduled";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return scheduleDateTimeFormatter.format(date);
}

function formatCountdownDuration(valueMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(valueMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const timePart = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return days ? `${days}d ${timePart}` : timePart;
}

function formatAutoSyncCountdown(targetAt: Date | null, nowMs: number) {
  if (!targetAt) {
    return "Not scheduled";
  }

  const remainingMs = targetAt.getTime() - nowMs;

  if (remainingMs <= 0) {
    return "Due now";
  }

  return `in ${formatCountdownDuration(remainingMs)}`;
}

function resolveNextAutoSyncAt(snapshot: StoreSyncSnapshot | null) {
  if (!snapshot?.syncPolicy.autoSyncEnabled) {
    return null;
  }

  const scheduledFor =
    snapshot.syncPolicy.nextScheduledSyncAt ??
    computeNextStoreSyncAt({
      policy: snapshot.syncPolicy,
      baseAt: snapshot.lastSyncAt ?? snapshot.generatedAt,
      includeJitter: true,
    });
  const scheduledAt = new Date(scheduledFor);

  return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt;
}

function formatRelative(value: string | null | undefined) {
  if (!value) {
    return "Never";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function formatRuntimeRole(value: StoreRuntimeStatus["role"] | undefined) {
  switch (value) {
    case "store-server":
      return "Store server";
    case "terminal-client":
      return "Terminal client";
    case "embedded":
      return "Local store";
    default:
      return "Runtime";
  }
}

function formatDeploymentMode(
  value: StoreRuntimeStatus["deploymentMode"] | undefined,
) {
  return value === "STANDALONE" ? "Standalone" : "HQ managed";
}

function formatDatabaseProvider(
  value: StoreRuntimeStatus["databaseProvider"] | undefined,
) {
  return value === "mssql" ? "SQL Server" : value === "postgres" ? "PostgreSQL" : "SQLite";
}

function safeDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePostgresConnectionString(value: string): PostgresConnectionDraft {
  const fallback: PostgresConnectionDraft = {
    host: "",
    port: "5432",
    database: "",
    schema: "public",
    username: "",
    password: "",
    sslMode: "",
  };
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed);

    return {
      host: parsed.hostname,
      port: parsed.port || fallback.port,
      database: safeDecodeUriComponent(parsed.pathname.replace(/^\/+/, "")),
      schema: parsed.searchParams.get("schema") ?? fallback.schema,
      username: safeDecodeUriComponent(parsed.username),
      password: safeDecodeUriComponent(parsed.password),
      sslMode: parsed.searchParams.get("sslmode") ?? "",
    };
  } catch {
    return fallback;
  }
}

function buildPostgresConnectionString(config: PostgresConnectionDraft) {
  const host = config.host.trim();
  const database = config.database.trim();

  if (!host && !database && !config.username.trim()) {
    return "";
  }

  const username = config.username.trim();
  const password = config.password;
  const auth = username
    ? `${encodeURIComponent(username)}${
        password ? `:${encodeURIComponent(password)}` : ""
      }@`
    : "";
  const port = config.port.trim();
  const pathName = database ? `/${encodeURIComponent(database)}` : "";
  const searchParams = new URLSearchParams();

  if (config.schema.trim()) {
    searchParams.set("schema", config.schema.trim());
  }

  if (config.sslMode.trim()) {
    searchParams.set("sslmode", config.sslMode.trim());
  }

  const search = searchParams.toString();

  return `postgresql://${auth}${host}${port ? `:${port}` : ""}${pathName}${
    search ? `?${search}` : ""
  }`;
}

function splitMssqlServer(value: string) {
  const trimmed = value.trim();
  const portMatch = trimmed.match(/^(.*),(\d+)$/);

  if (!portMatch) {
    return { server: trimmed, port: "" };
  }

  return { server: portMatch[1]?.trim() ?? trimmed, port: portMatch[2] ?? "" };
}

function parseMssqlConnectionString(value: string): MssqlConnectionDraft {
  const fallback: MssqlConnectionDraft = {
    server: "",
    port: "",
    database: "",
    username: "",
    password: "",
    encrypt: "true",
    trustServerCertificate: "true",
  };
  const trimmed = value.trim().replace(/^"|"$/g, "");

  if (!trimmed) {
    return fallback;
  }

  const entries = new Map<string, string>();
  let server = "";

  if (trimmed.startsWith("sqlserver://")) {
    const body = trimmed.slice("sqlserver://".length);
    const [serverPart, ...parts] = body.split(";");
    server = serverPart ?? "";

    for (const part of parts) {
      const separator = part.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      entries.set(
        part.slice(0, separator).trim().toLowerCase(),
        part.slice(separator + 1),
      );
    }
  } else {
    for (const part of trimmed.split(";")) {
      const separator = part.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      entries.set(
        part.slice(0, separator).trim().toLowerCase(),
        part.slice(separator + 1),
      );
    }

    server =
      entries.get("server") ??
      entries.get("data source") ??
      entries.get("address") ??
      "";
  }

  const serverParts = splitMssqlServer(server);

  return {
    server: serverParts.server,
    port: serverParts.port,
    database:
      entries.get("database") ?? entries.get("initial catalog") ?? fallback.database,
    username:
      entries.get("user id") ??
      entries.get("uid") ??
      entries.get("user") ??
      fallback.username,
    password: entries.get("password") ?? entries.get("pwd") ?? fallback.password,
    encrypt: entries.get("encrypt") ?? fallback.encrypt,
    trustServerCertificate:
      entries.get("trustservercertificate") ??
      entries.get("trust server certificate") ??
      fallback.trustServerCertificate,
  };
}

function buildMssqlConnectionString(config: MssqlConnectionDraft) {
  const server = config.server.trim();
  const database = config.database.trim();

  if (!server && !database && !config.username.trim()) {
    return "";
  }

  const serverSegment = config.port.trim()
    ? `${server},${config.port.trim()}`
    : server;

  return [
    serverSegment ? `Server=${serverSegment}` : "",
    database ? `Database=${database}` : "",
    config.username.trim() ? `User Id=${config.username.trim()}` : "",
    config.password ? `Password=${config.password}` : "",
    `Encrypt=${config.encrypt}`,
    `TrustServerCertificate=${config.trustServerCertificate}`,
  ]
    .filter(Boolean)
    .join(";");
}

function formatDesktopUpdateStatus(
  value: StoreDesktopUpdateStatus["status"] | undefined,
) {
  switch (value) {
    case "disabled":
      return "Disabled";
    case "checking":
      return "Checking";
    case "available":
      return "Available";
    case "not-available":
      return "Current";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Ready";
    case "error":
      return "Error";
    case "idle":
    default:
      return "Idle";
  }
}

function getOperatorName(snapshot: StoreSyncSnapshot | null) {
  const session = snapshot?.activeOperatorSession;

  if (!session) {
    return null;
  }

  return `${session.displayName} (${session.loginId})`;
}

function firstOpenShift(snapshot: StoreSyncSnapshot | null) {
  return snapshot?.activeShift ?? null;
}

function normalizeLoginId(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function getCapabilities(snapshot: StoreSyncSnapshot | null) {
  return snapshot?.activeOperatorSession?.capabilities ?? null;
}

function isStandaloneDeployment(snapshot: StoreSyncSnapshot | null) {
  return snapshot?.deploymentMode === "STANDALONE";
}

function isActiveShiftOwnedByOperator(snapshot: StoreSyncSnapshot | null) {
  const shift = snapshot?.activeShift;
  const session = snapshot?.activeOperatorSession;

  if (!shift || !session) {
    return false;
  }

  return (
    normalizeLoginId(shift.cashierCode) === normalizeLoginId(session.loginId)
  );
}

function getVisibleWorkspaces(snapshot: StoreSyncSnapshot | null) {
  const capabilities = getCapabilities(snapshot);
  const standalone = isStandaloneDeployment(snapshot);

  if (!capabilities) {
    return workspaceItems.filter(
      (item) => item.id !== "sync" || !standalone,
    );
  }

  return workspaceItems.filter((item) => {
    switch (item.id) {
      case "dashboard":
        return true;
      case "pos":
        return (
          capabilities.cashierEligible ||
          capabilities.canOpenShift ||
          capabilities.canProcessSale ||
          capabilities.canProcessReturn ||
          capabilities.canProcessExchange
        );
      case "setup":
        return standalone && capabilities.supervisorEligible;
      case "security":
        return standalone && capabilities.supervisorEligible;
      case "inventory":
        return capabilities.hasInventoryVisibility;
      case "manager":
        return capabilities.supervisorEligible;
      case "reversals":
        return (
          capabilities.canSearchReceipt ||
          capabilities.canProcessReturn ||
          capabilities.canProcessExchange
        );
      case "reports":
        return getVisibleReportWorkspaces(snapshot).length > 0;
      case "sync":
        return !standalone && capabilities.canOperateStoreSync;
      default:
        return false;
    }
  });
}

function getVisibleReportWorkspaces(snapshot: StoreSyncSnapshot | null) {
  const capabilities = getCapabilities(snapshot);

  if (!capabilities) {
    return reportWorkspaceItems;
  }

  return reportWorkspaceItems.filter((item) => {
    if (item.id === "report-cashier-sales") {
      return capabilities.cashierEligible || capabilities.canProcessSale;
    }

    if (item.id === "report-inventory") {
      return (
        capabilities.supervisorEligible || capabilities.hasInventoryVisibility
      );
    }

    return capabilities.supervisorEligible;
  });
}

function isReportWorkspace(workspace: Workspace): workspace is ReportWorkspace {
  return reportWorkspaceItems.some((item) => item.id === workspace);
}

function getReportWorkspaceItem(workspace: Workspace) {
  return reportWorkspaceItems.find((item) => item.id === workspace) ?? null;
}

function tenderRequiresBankAccount(
  tender:
    | StoreSyncSnapshot["availableTenderMethods"][number]
    | null
    | undefined,
) {
  const tokens = [
    tender?.paymentMethod,
    tender?.tenderMethodCode,
    tender?.tenderMethodName,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toUpperCase();

  return (
    tokens.includes("BANK_TRANSFER") ||
    tokens.includes("BANK DEPOSIT") ||
    tokens.includes("BANK-DEPOSIT") ||
    tokens.includes("DEPOSIT") ||
    tokens.includes("CHEQUE") ||
    tokens.includes("CHECK")
  );
}

function getActiveBasketPrivilege(snapshot: StoreSyncSnapshot | null) {
  const capabilities = getCapabilities(snapshot);
  const basketType = snapshot?.activeBasket?.transactionType ?? "SALE";

  if (!capabilities) {
    return false;
  }

  if (basketType === "RETURN") {
    return capabilities.canProcessReturn;
  }

  if (basketType === "EXCHANGE") {
    return capabilities.canProcessExchange;
  }

  return capabilities.canProcessSale;
}

function isUsableLicenseStatus(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase() ?? "LICENSED";
  return normalized === "LICENSED" || normalized === "TRIAL";
}

function parseLicenseExpiry(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getLicenseBlockMessage(snapshot: StoreSyncSnapshot | null) {
  if (isStandaloneDeployment(snapshot)) {
    return null;
  }

  const storeLicenseStatus =
    snapshot?.storeLicenseStatus?.trim().toUpperCase() ?? "LICENSED";
  const now = Date.now();
  const storeLicenseExpiry = parseLicenseExpiry(snapshot?.storeLicensedUntil);

  if (
    !isUsableLicenseStatus(storeLicenseStatus) ||
    (storeLicenseExpiry !== null &&
      Number.isFinite(storeLicenseExpiry) &&
      storeLicenseExpiry < now)
  ) {
    return "This shop license is expired or inactive. Renew it at HQ before using or syncing the desktop.";
  }

  return null;
}

function getLicenseRenewalWarning(snapshot: StoreSyncSnapshot | null) {
  if (isStandaloneDeployment(snapshot)) {
    return null;
  }

  const warningWindowMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiries = [
    { label: "shop", value: parseLicenseExpiry(snapshot?.storeLicensedUntil) },
    {
      label: "terminal",
      value: parseLicenseExpiry(snapshot?.terminalLicensedUntil),
    },
  ].filter(
    (entry): entry is { label: string; value: number } =>
      entry.value !== null &&
      entry.value >= now &&
      entry.value - now <= warningWindowMs,
  );

  if (expiries.length === 0) {
    return null;
  }

  const firstExpiry = expiries.sort(
    (left, right) => left.value - right.value,
  )[0];
  const days = Math.max(
    0,
    Math.ceil((firstExpiry.value - now) / (24 * 60 * 60 * 1000)),
  );

  return `The ${firstExpiry.label} license expires in ${days} day${days === 1 ? "" : "s"}. Renew it at HQ before expiry.`;
}

function getPosLaneBlockMessage(snapshot: StoreSyncSnapshot | null) {
  const session = snapshot?.activeOperatorSession;
  const shift = snapshot?.activeShift;
  const capabilities = getCapabilities(snapshot);
  const licenseBlockMessage = getLicenseBlockMessage(snapshot);

  if (licenseBlockMessage) {
    return licenseBlockMessage;
  }

  if (!session || !capabilities) {
    return isStandaloneDeployment(snapshot)
      ? "Sign in with a local cashier before using the POS lane."
      : "Sign in with a synced cashier before using the POS lane.";
  }

  if (!shift) {
    return "Open a cashier shift before using the POS lane.";
  }

  if (!getActiveBasketPrivilege(snapshot)) {
    return "This operator does not have the required POS privilege for the active basket.";
  }

  return null;
}

function getCatalogLineIntent(snapshot: StoreSyncSnapshot | null) {
  return snapshot?.activeBasket?.transactionType === "EXCHANGE"
    ? "SALE"
    : undefined;
}

function findReceiptReturnLine(
  lookup: StoreReceiptLookupResult,
  lookupValue: string,
) {
  const normalizedValue = lookupValue.trim().toUpperCase();

  return (
    lookup.lines.find(
      (line) =>
        line.quantityAvailableToReturn > 0 &&
        (line.productCode.trim().toUpperCase() === normalizedValue ||
          line.barcode?.trim().toUpperCase() === normalizedValue),
    ) ?? null
  );
}

function buildReceiptLineQuantityDrafts(lookup: StoreReceiptLookupResult) {
  return lookup.lines.reduce<Record<string, string>>((drafts, line) => {
    if (line.quantityAvailableToReturn <= 0) {
      return drafts;
    }

    drafts[line.sourceLineId] =
      line.availableSerialNumbersToReturn.length > 0
        ? "0"
        : String(Math.min(1, line.quantityAvailableToReturn));

    return drafts;
  }, {});
}

function paymentDraftId() {
  return `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseSerialDraft(value: string) {
  const seen = new Set<string>();

  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (!entry) {
        return false;
      }

      const key = entry.toUpperCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function expandSerialRange(startValue: string, endValue: string) {
  const start = startValue.trim();
  const end = endValue.trim();
  const startMatch = /^(.*?)(\d+)$/.exec(start);
  const endMatch = /^(.*?)(\d+)$/.exec(end);

  if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) {
    return [start, end].filter(Boolean);
  }

  const prefix = startMatch[1];
  const startNumber = Number(startMatch[2]);
  const endNumber = Number(endMatch[2]);
  const width = Math.max(startMatch[2].length, endMatch[2].length);

  if (!Number.isFinite(startNumber) || !Number.isFinite(endNumber)) {
    return [start, end].filter(Boolean);
  }

  const [lower, upper] =
    startNumber <= endNumber
      ? [startNumber, endNumber]
      : [endNumber, startNumber];
  const values: string[] = [];

  for (let value = lower; value <= upper && values.length < 500; value += 1) {
    values.push(`${prefix}${String(value).padStart(width, "0")}`);
  }

  return values;
}

function defaultPaymentDraft(
  snapshot: StoreSyncSnapshot | null,
  basket: StoreBasketSummary | null,
  amount?: string,
): PaymentDraft {
  const sortedTenderMethods = sortTenderMethodsForPos(
    snapshot?.availableTenderMethods ?? [],
  );
  const cashTender =
    sortedTenderMethods.find((method) => isCashTender(method)) ??
    sortedTenderMethods[0] ??
    null;

  return {
    id: paymentDraftId(),
    tenderMethodCode: cashTender?.tenderMethodCode ?? "",
    bankAccountId: "",
    amount:
      amount ?? (basket ? Math.abs(basket.totalAmount).toFixed(2) : "0.00"),
    reference: "",
  };
}

function isCashTender(
  tender: StoreSyncSnapshot["availableTenderMethods"][number],
) {
  const tokens =
    `${tender.paymentMethod} ${tender.tenderMethodCode} ${tender.tenderMethodName}`.toUpperCase();

  return (
    tender.paymentMethod === "CASH" ||
    tokens.includes("CASH") ||
    tokens.includes("CASH SALE")
  );
}

function sortTenderMethodsForPos(
  methods: StoreSyncSnapshot["availableTenderMethods"],
) {
  return [...methods].sort((left, right) => {
    const leftRank = isCashTender(left) ? 0 : 1;
    const rightRank = isCashTender(right) ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.tenderMethodName.localeCompare(right.tenderMethodName);
  });
}

function paymentDraftsFromReceiptLookup(
  snapshot: StoreSyncSnapshot,
  basket: StoreBasketSummary | null,
  lookup: StoreReceiptLookupResult,
): PaymentDraft[] {
  const refundableTotal = Number(
    Math.abs(basket?.totalAmount ?? lookup.totalAmount).toFixed(2),
  );
  const receiptPayments = lookup.payments.filter(
    (payment) => Math.abs(payment.amount) > 0.005,
  );
  const originalPaymentTotal = receiptPayments.reduce(
    (sum, payment) => sum + Math.abs(payment.amount),
    0,
  );

  if (
    refundableTotal <= 0 ||
    receiptPayments.length === 0 ||
    originalPaymentTotal <= 0
  ) {
    return [defaultPaymentDraft(snapshot, basket)];
  }

  let allocatedAmount = 0;
  const drafts = receiptPayments.map<PaymentDraft>((payment, index) => {
    const remaining = Number(
      Math.max(0, refundableTotal - allocatedAmount).toFixed(2),
    );
    const amount =
      index === receiptPayments.length - 1
        ? remaining
        : Number(
            Math.min(
              remaining,
              (Math.abs(payment.amount) / originalPaymentTotal) *
                refundableTotal,
            ).toFixed(2),
          );
    allocatedAmount = Number((allocatedAmount + amount).toFixed(2));
    const tenderByCode = payment.tenderMethodCode
      ? snapshot.availableTenderMethods.find(
          (method) => method.tenderMethodCode === payment.tenderMethodCode,
        )
      : null;
    const tenderByMethod =
      snapshot.availableTenderMethods.find(
        (method) => method.paymentMethod === payment.method,
      ) ?? null;
    const tender = tenderByCode ?? tenderByMethod;

    return {
      id: paymentDraftId(),
      tenderMethodCode:
        tender?.tenderMethodCode ?? payment.tenderMethodCode ?? "",
      bankAccountId: payment.bankAccountId ?? "",
      amount: amount.toFixed(2),
      reference: payment.reference ?? "",
    };
  });

  const usableDrafts = drafts.filter((draft) => Number(draft.amount) > 0);

  return usableDrafts.length > 0
    ? usableDrafts
    : [defaultPaymentDraft(snapshot, basket)];
}

function resolveProductImageUrl(
  imageUrl: string | null | undefined,
  snapshot: StoreSyncSnapshot | null,
) {
  const trimmedImageUrl = imageUrl?.trim();

  if (!trimmedImageUrl) {
    return null;
  }

  if (/^(https?:|data:|file:|blob:)/i.test(trimmedImageUrl)) {
    return trimmedImageUrl;
  }

  const enterpriseBaseUrl = snapshot?.enterpriseBaseUrl?.trim();

  if (enterpriseBaseUrl) {
    try {
      const base = new URL(enterpriseBaseUrl);
      const rootBase = `${base.protocol}//${base.host}`;

      return new URL(
        trimmedImageUrl.startsWith("/")
          ? trimmedImageUrl
          : `/${trimmedImageUrl}`,
        rootBase,
      ).toString();
    } catch {
      return trimmedImageUrl;
    }
  }

  return trimmedImageUrl;
}

function CompanyLogo({
  className = "",
  snapshot,
}: {
  className?: string;
  snapshot: StoreSyncSnapshot | null;
}) {
  const brandName = snapshot?.retailOrgName?.trim() || "Flash ERP";
  const logoUrl = resolveProductImageUrl(snapshot?.companyLogoUrl, snapshot);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      <span className={`rms-logo rms-logo-image ${className}`}>
        <img
          alt={`${brandName} logo`}
          onError={() => setFailed(true)}
          src={logoUrl}
        />
      </span>
    );
  }

  return <span className={`rms-logo ${className}`}>RMS</span>;
}

function getLoginBackgroundStyle(
  snapshot: StoreSyncSnapshot | null,
): CSSProperties {
  const configuredBackgroundUrl = resolveProductImageUrl(
    snapshot?.loginBackgroundImageUrl,
    snapshot,
  );

  return {
    "--rms-login-background-image": `url(${configuredBackgroundUrl ?? retailLoginBackgroundUrl})`,
  } as CSSProperties;
}

function matchesText(query: string, values: Array<string | null | undefined>) {
  if (!query) {
    return true;
  }

  return values.some((value) => value?.toUpperCase().includes(query));
}

function isWithinDayWindow(
  value: string | null | undefined,
  windowDays: string,
) {
  const days = Number(windowDays);

  if (!Number.isFinite(days) || days <= 0 || !value) {
    return true;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function formatDesktopActionError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The desktop action could not complete.";

  return message.replace(
    /^Error invoking remote method '[^']+': Error:\s*/i,
    "",
  );
}

function formatSyncCompletionMessage(message: string) {
  return message.includes("More downstream packets")
    ? "Sync completed. More downstream packets are waiting; run sync again to continue."
    : message;
}

function showDesktopSyncToast(
  message: string,
  tone: "good" | "warn" | "bad" = "good",
) {
  if (typeof document === "undefined") {
    return;
  }

  const hostId = "rms-sync-toast-host";
  let host = document.getElementById(hostId);

  if (!host) {
    host = document.createElement("div");
    host.id = hostId;
    host.className = "rms-sync-toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }

  const toast = document.createElement("div");
  toast.className = `rms-sync-toast is-${tone}`;
  toast.textContent = message;
  host.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-hiding");
    window.setTimeout(() => toast.remove(), 250);
  }, 5200);
}

function formatSupplierReturnReason(value: StoreLocalSupplierReturnReason) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSalesOrderStatusTone(
  order: StoreSalesOrderSummary,
): "neutral" | "good" | "warn" | "bad" {
  if (order.status === "OPEN") {
    return "warn";
  }

  if (order.status === "FULFILLED") {
    return "good";
  }

  return "neutral";
}

function Stat({
  label,
  value,
  tone = "neutral",
  title,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  title?: string;
}) {
  return (
    <div className={`rms-stat is-${tone}`} title={title}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return <span className={`rms-pill is-${tone}`}>{children}</span>;
}

function FloatingAlerts({
  notice,
  error,
  warning,
}: {
  notice?: string | null;
  error?: string | null;
  warning?: string | null;
}) {
  if (!notice && !error && !warning) {
    return null;
  }

  return (
    <div aria-live="polite" className="rms-floating-alerts">
      {notice ? <div className="rms-banner is-good">{notice}</div> : null}
      {error ? <div className="rms-banner is-bad">{error}</div> : null}
      {warning ? <div className="rms-banner is-warn">{warning}</div> : null}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rms-empty">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

type StandaloneGridColumn<T> = {
  header: string;
  width?: string;
  value: (row: T) => ReactNode;
  exportValue?: (row: T) => string | number | boolean | null | undefined;
  searchValue?: (row: T) => string | number | boolean | null | undefined;
};

type StandaloneGridFilter<T> = {
  label: string;
  value: string;
  predicate: (row: T) => boolean;
};

function stringifyGridValue(value: ReactNode) {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function StandaloneRecordsGrid<T>({
  actions,
  columns,
  emptyLabel = "No records found.",
  exportFileName,
  filters = [],
  primaryAction,
  rows,
  searchPlaceholder = "Search records"
}: {
  actions?: (row: T) => ReactNode;
  columns: StandaloneGridColumn<T>[];
  emptyLabel?: string;
  exportFileName: string;
  filters?: StandaloneGridFilter<T>[];
  primaryAction?: ReactNode;
  rows: T[];
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("ALL");
  const selectedFilter = filters.find((filter) => filter.value === filterValue);
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (selectedFilter && !selectedFilter.predicate(row)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return columns.some((column) =>
        String(column.searchValue?.(row) ?? column.exportValue?.(row) ?? stringifyGridValue(column.value(row)))
          .toLowerCase()
          .includes(normalizedQuery),
      );
    });
  }, [columns, query, rows, selectedFilter]);
  const gridTemplateColumns = `${columns
    .map((column) => column.width ?? "minmax(0, 1fr)")
    .join(" ")}${actions ? " minmax(86px, auto)" : ""}`;

  function exportRows() {
    const csvRows = [
      [...columns.map((column) => column.header), ...(actions ? ["Action"] : [])]
        .map(csvCell)
        .join(","),
      ...visibleRows.map((row) =>
        [
          ...columns.map((column) =>
            csvCell(column.exportValue?.(row) ?? stringifyGridValue(column.value(row))),
          ),
          ...(actions ? ["Edit"] : []),
        ].join(","),
      ),
    ];

    downloadTextFile(exportFileName, csvRows.join("\n"));
  }

  return (
    <div className="rms-standalone-grid">
      <div
        className={[
          "rms-standalone-grid-toolbar",
          primaryAction ? "has-primary-action" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {primaryAction}
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          value={query}
        />
        {filters.length ? (
          <select
            onChange={(event) => setFilterValue(event.target.value)}
            value={filterValue}
          >
            <option value="ALL">All</option>
            {filters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        ) : null}
        <button className="rms-button" onClick={exportRows} type="button">
          Export
        </button>
      </div>
      <div className="rms-table rms-master-record-grid">
        <div className="rms-table-head" style={{ gridTemplateColumns }}>
          {columns.map((column) => (
            <span key={column.header}>{column.header}</span>
          ))}
          {actions ? <span>Action</span> : null}
        </div>
        {visibleRows.length ? (
          visibleRows.map((row, index) => (
            <div
              className="rms-table-row"
              key={index}
              style={{ gridTemplateColumns }}
            >
              {columns.map((column) => (
                <div key={column.header}>{column.value(row)}</div>
              ))}
              {actions ? <span>{actions(row)}</span> : null}
            </div>
          ))
        ) : (
          <EmptyState title={emptyLabel} />
        )}
      </div>
    </div>
  );
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const paths: Record<SidebarIconName, ReactNode> = {
    dashboard: (
      <>
        <path d="M4 13.5h6.5V20H4z" />
        <path d="M13.5 4H20v16h-6.5z" />
        <path d="M4 4h6.5v6.5H4z" />
      </>
    ),
    pos: (
      <>
        <path d="M5 5h14v10H5z" />
        <path d="M8 19h8" />
        <path d="M9 15v4" />
        <path d="M15 15v4" />
      </>
    ),
    setup: (
      <>
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M4.2 7.5 6.8 9" />
        <path d="m17.2 15 2.6 1.5" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    security: (
      <>
        <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6z" />
        <path d="M9.5 12.2 11.3 14 15 10" />
      </>
    ),
    inventory: (
      <>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
        <path d="M12 12 4.5 7.8" />
        <path d="M12 12v8.5" />
        <path d="m12 12 7.5-4.2" />
      </>
    ),
    manager: (
      <>
        <path d="M4 20V8" />
        <path d="M10 20V4" />
        <path d="M16 20v-9" />
        <path d="M22 20H2" />
      </>
    ),
    reversals: (
      <>
        <path d="M8 7H4v4" />
        <path d="M4 11c1.5-4 5.9-6.2 10-4.8 2.2.7 3.8 2.3 4.7 4.2" />
        <path d="M16 17h4v-4" />
        <path d="M20 13c-1.5 4-5.9 6.2-10 4.8-2.2-.7-3.8-2.3-4.7-4.2" />
      </>
    ),
    reports: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4" />
        <path d="M9 15h6" />
        <path d="M9 11h4" />
      </>
    ),
    sync: (
      <>
        <path d="M17 4v5h-5" />
        <path d="M7 20v-5h5" />
        <path d="M17 9a6 6 0 0 0-10-2.5" />
        <path d="M7 15a6 6 0 0 0 10 2.5" />
      </>
    ),
    shop: (
      <>
        <path d="M4 10h16l-1.5-5h-13z" />
        <path d="M6 10v10h12V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    operations: (
      <>
        <path d="M5 6h14" />
        <path d="M5 12h14" />
        <path d="M5 18h14" />
        <circle cx="8" cy="6" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="10" cy="18" r="1.5" />
      </>
    ),
    catalog: (
      <>
        <path d="M5 5h6v6H5z" />
        <path d="M13 5h6v6h-6z" />
        <path d="M5 13h6v6H5z" />
        <path d="M13 13h6v6h-6z" />
      </>
    ),
    pricing: (
      <>
        <path d="M4 12 12 4h7v7l-8 8z" />
        <circle cx="16" cy="8" r="1.5" />
        <path d="M8.5 13.5 10.5 15.5" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="10" r="2.2" />
        <path d="M15 16.5a4.5 4.5 0 0 1 5.5 3.5" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="rms-nav-icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg aria-hidden="true" className="rms-action-svg" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function ReceiveIcon() {
  return (
    <svg aria-hidden="true" className="rms-action-svg" viewBox="0 0 24 24">
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg aria-hidden="true" className="rms-action-svg" viewBox="0 0 24 24">
      <path d="M7 8V3h10v5" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-3.5A2.5 2.5 0 0 1 5.5 9h13A2.5 2.5 0 0 1 21 11.5V15a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v7H7z" />
    </svg>
  );
}

function escapeMarkup(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ActionIconButton({
  label,
  tone = "view",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "view" | "receive" | "print";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className={`rms-icon-button is-${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

type TransferDocumentGroup = {
  key: string;
  documentNo: string;
  statusLabel: string;
  sourceStoreName: string;
  sourceStoreCode: string;
  destinationStoreName: string;
  destinationStoreCode: string;
  externalReference: string | null;
  requiredAt: string | null;
  updatedAt: string;
  requestedQuantity: number;
  issuedQuantity: number;
  receivedQuantity: number;
  outstandingIssueQuantity: number;
  outstandingReceiptQuantity: number;
  lines: StoreInterStoreTransferSummary[];
};
type TransferDirectionFilter = "ALL" | "IN" | "OUT";

function getTransferDocumentKey(transfer: StoreInterStoreTransferSummary) {
  return transfer.transferBatchNo ?? transfer.transferNo;
}

function buildTransferDocumentGroups(
  transfers: StoreInterStoreTransferSummary[],
) {
  const groups = new Map<string, StoreInterStoreTransferSummary[]>();

  for (const transfer of transfers) {
    const key = getTransferDocumentKey(transfer);
    groups.set(key, [...(groups.get(key) ?? []), transfer]);
  }

  return Array.from(groups.entries())
    .map<TransferDocumentGroup>(([key, lines]) => {
      const orderedLines = [...lines].sort(
        (left, right) => left.lineNo - right.lineNo,
      );
      const firstLine = orderedLines[0];
      const statuses = Array.from(
        new Set(orderedLines.map((line) => line.status)),
      );
      const latestUpdatedAt = orderedLines
        .map((line) => line.updatedAt)
        .sort(
          (left, right) => new Date(right).getTime() - new Date(left).getTime(),
        )[0];

      return {
        key,
        documentNo: firstLine.transferBatchNo ?? firstLine.transferNo,
        statusLabel:
          statuses.length === 1 ? statuses[0] : `${statuses.length} states`,
        sourceStoreName: firstLine.sourceStoreName,
        sourceStoreCode: firstLine.sourceStoreCode,
        destinationStoreName: firstLine.destinationStoreName,
        destinationStoreCode: firstLine.destinationStoreCode,
        externalReference: firstLine.externalReference,
        requiredAt: firstLine.requiredAt,
        updatedAt: latestUpdatedAt ?? firstLine.updatedAt,
        requestedQuantity: orderedLines.reduce(
          (sum, line) => sum + line.requestedQuantity,
          0,
        ),
        issuedQuantity: orderedLines.reduce(
          (sum, line) => sum + line.issuedQuantity,
          0,
        ),
        receivedQuantity: orderedLines.reduce(
          (sum, line) => sum + line.receivedQuantity,
          0,
        ),
        outstandingIssueQuantity: orderedLines.reduce(
          (sum, line) => sum + line.outstandingIssueQuantity,
          0,
        ),
        outstandingReceiptQuantity: orderedLines.reduce(
          (sum, line) => sum + line.outstandingReceiptQuantity,
          0,
        ),
        lines: orderedLines,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
}

function getTransferDocumentRole(
  transfer: Pick<
    TransferDocumentGroup,
    "lines" | "issuedQuantity" | "receivedQuantity" | "outstandingIssueQuantity" | "outstandingReceiptQuantity"
  >,
  direction: TransferDirectionFilter,
) {
  if (direction === "OUT") {
    return "SOURCE" as const;
  }

  if (direction === "IN") {
    return "DESTINATION" as const;
  }

  const hasSource = transfer.lines.some((line) => line.role === "SOURCE");
  const hasDestination = transfer.lines.some(
    (line) => line.role === "DESTINATION",
  );

  if (hasSource && !hasDestination) {
    return "SOURCE" as const;
  }

  if (hasDestination && !hasSource) {
    return "DESTINATION" as const;
  }

  return null;
}

function getTransferRoleStatusLabel(
  transfer: TransferDocumentGroup,
  direction: TransferDirectionFilter,
) {
  const role = getTransferDocumentRole(transfer, direction);

  if (role === "SOURCE") {
    if (transfer.issuedQuantity <= 0) {
      return "Requested";
    }

    return transfer.outstandingIssueQuantity > 0 ? "Part issued" : "Issued";
  }

  if (role === "DESTINATION") {
    if (transfer.receivedQuantity > 0) {
      return transfer.outstandingReceiptQuantity > 0
        ? "Part received"
        : "Received";
    }

    return transfer.issuedQuantity > 0 ? "Ready to receive" : "Awaiting issue";
  }

  return transfer.statusLabel
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getTransferRoleOutstandingQuantity(
  transfer: TransferDocumentGroup,
  direction: TransferDirectionFilter,
) {
  const role = getTransferDocumentRole(transfer, direction);

  if (role === "SOURCE") {
    return transfer.outstandingIssueQuantity;
  }

  if (role === "DESTINATION") {
    return transfer.outstandingReceiptQuantity;
  }

  return transfer.outstandingIssueQuantity + transfer.outstandingReceiptQuantity;
}

function ProductTileImage({
  imageUrl,
  productName,
  snapshot,
}: {
  imageUrl: string | null;
  productName: string;
  snapshot: StoreSyncSnapshot | null;
}) {
  const resolvedImageUrl = resolveProductImageUrl(imageUrl, snapshot);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedImageUrl]);

  if (!resolvedImageUrl || failed) {
    return <span className="rms-product-placeholder">NO IMAGE</span>;
  }

  return (
    <img
      alt={productName}
      onError={() => setFailed(true)}
      src={resolvedImageUrl}
    />
  );
}

export function ModernDesktopApp() {
  const [runtime] = useState(() => readRuntime());
  const [runtimeStatus, setRuntimeStatus] = useState<StoreRuntimeStatus | null>(
    null,
  );
  const [desktopWindowStatus, setDesktopWindowStatus] =
    useState<StoreDesktopWindowStatus | null>(null);
  const [desktopUpdateStatus, setDesktopUpdateStatus] =
    useState<StoreDesktopUpdateStatus | null>(null);
  const [snapshot, setSnapshot] = useState<StoreSyncSnapshot | null>(null);
  const [activeWorkspace, setActiveWorkspace] =
    useState<Workspace>("dashboard");
  const [activeSetupSection, setActiveSetupSection] =
    useState<StandaloneSetupSection>("shop");
  const [activeSecuritySection, setActiveSecuritySection] =
    useState<StandaloneSecuritySection>("roles");
  const [setupMenuExpanded, setSetupMenuExpanded] = useState(false);
  const [securityMenuExpanded, setSecurityMenuExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [saleMode, setSaleMode] = useState<SaleMode>("SALE");
  const [shiftCloseDialogOpen, setShiftCloseDialogOpen] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [lockLoginId, setLockLoginId] = useState("");
  const [lockPassword, setLockPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isSyncRunning, setIsSyncRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [bootstrapAdminDraft, setBootstrapAdminDraft] = useState({
    loginId: "ADMIN",
    displayName: "Store administrator",
    email: "",
    password: "",
  });
  const [desktopConfigOpen, setDesktopConfigOpen] = useState(false);
  const [desktopConfigResult, setDesktopConfigResult] =
    useState<StoreDesktopConnectionConfigResult | null>(null);
  const [desktopConfigDraft, setDesktopConfigDraft] =
    useState<StoreDesktopConnectionConfig>(defaultDesktopConnectionConfig);
  const [desktopConfigSaving, setDesktopConfigSaving] = useState(false);
  const [scanQuery, setScanQuery] = useState("");
  const [scanQuantity, setScanQuantity] = useState("1");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogDepartment, setCatalogDepartment] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [catalogItems, setCatalogItems] = useState<StoreCatalogBrowseItem[]>(
    [],
  );
  const [itemSuggestions, setItemSuggestions] = useState<
    StoreCatalogBrowseItem[]
  >([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<StoreCustomerSummary[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<StoreCustomerSummary | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<PaymentDraft[]>(() => [
    defaultPaymentDraft(null, null),
  ]);
  const [salesOrderDepositAmount, setSalesOrderDepositAmount] = useState("0");
  const [salesOrderDepositTenderCode, setSalesOrderDepositTenderCode] =
    useState("");
  const [salesOrderDepositReference, setSalesOrderDepositReference] =
    useState("");
  const [voidModeTransactionNo, setVoidModeTransactionNo] = useState<
    string | null
  >(null);
  const [lineQuantityDrafts, setLineQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const [transactionDetailsOpen, setTransactionDetailsOpen] = useState(false);
  const [transactionReference, setTransactionReference] = useState("");
  const [transactionDetails, setTransactionDetails] = useState("");
  const [transactionReferenceMatches, setTransactionReferenceMatches] =
    useState<StoreTransactionReferenceSummary[]>([]);
  const [
    transactionReferenceSearchPending,
    setTransactionReferenceSearchPending,
  ] = useState(false);
  const [
    transactionReferenceSearchAttempted,
    setTransactionReferenceSearchAttempted,
  ] = useState(false);
  const [
    transactionReferenceSearchDismissed,
    setTransactionReferenceSearchDismissed,
  ] = useState(false);
  const [openPriceDraft, setOpenPriceDraft] = useState<OpenPriceDraft | null>(
    null,
  );
  const [shiftOpeningFloat, setShiftOpeningFloat] = useState("0");
  const [hasEditedShiftOpeningFloat, setHasEditedShiftOpeningFloat] =
    useState(false);
  const [shiftDeclaredCash, setShiftDeclaredCash] = useState("0");
  const [managerShiftId, setManagerShiftId] = useState("");
  const [eodDeclaredCash, setEodDeclaredCash] = useState("0");
  const [eodNote, setEodNote] = useState("");
  const [bankingReconciliationId, setBankingReconciliationId] = useState("");
  const [bankingAmount, setBankingAmount] = useState("0");
  const [bankingBankName, setBankingBankName] = useState("");
  const [bankingBankAccountId, setBankingBankAccountId] = useState("");
  const [bankingReference, setBankingReference] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryLocation, setInventoryLocation] = useState("");
  const [inventoryItems, setInventoryItems] = useState<
    StoreInventoryBrowseItem[]
  >([]);
  const [criticalStockRows, setCriticalStockRows] = useState<
    StoreInventoryBrowseItem[]
  >([]);
  const [criticalStockDialogOpen, setCriticalStockDialogOpen] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<
    StorePurchaseOrderSummary[]
  >([]);
  const [transfers, setTransfers] = useState<StoreInterStoreTransferSummary[]>(
    [],
  );
  const [stockCountProductCode, setStockCountProductCode] = useState("");
  const [stockCountQuantity, setStockCountQuantity] = useState("0");
  const [stockCountNote, setStockCountNote] = useState("");
  const [stockCountRows, setStockCountRows] = useState<StockCountUploadRow[]>(
    [],
  );
  const [transferSourceLocation, setTransferSourceLocation] = useState("");
  const [transferDestinationLocation, setTransferDestinationLocation] =
    useState("");
  const [transferProductCode, setTransferProductCode] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [remoteInventoryQuery, setRemoteInventoryQuery] = useState("");
  const [remoteInventoryStoreFilter, setRemoteInventoryStoreFilter] =
    useState("");
  const [remoteInventoryItemFilter, setRemoteInventoryItemFilter] =
    useState("");
  const [remoteInventoryLocationFilter, setRemoteInventoryLocationFilter] =
    useState("");
  const [remoteInventoryRows, setRemoteInventoryRows] = useState<
    StoreRemoteInventoryLookupResult["rows"]
  >([]);
  const [inventorySerialDraft, setInventorySerialDraft] =
    useState<InventorySerialDraft | null>(null);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptWindowDays, setReceiptWindowDays] = useState("30");
  const [receiptPanelOpen, setReceiptPanelOpen] = useState(false);
  const [receiptHistoryKind, setReceiptHistoryKind] =
    useState<StoreReceiptHistoryKind>("SALES");
  const [receiptResults, setReceiptResults] = useState<
    StoreReceiptSearchResult[]
  >([]);
  const [receiptLookup, setReceiptLookup] =
    useState<StoreReceiptLookupResult | null>(null);
  const [receiptLineQuantityDrafts, setReceiptLineQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const [receiptLineSerialDrafts, setReceiptLineSerialDrafts] = useState<
    Record<string, string>
  >({});
  const [heldSalePanelOpen, setHeldSalePanelOpen] = useState(false);
  const [heldSaleQuery, setHeldSaleQuery] = useState("");
  const [heldSaleWindowDays, setHeldSaleWindowDays] = useState("30");
  const [salesOrderPanelOpen, setSalesOrderPanelOpen] = useState(false);
  const [salesOrderQuery, setSalesOrderQuery] = useState("");
  const [salesOrderWindowDays, setSalesOrderWindowDays] = useState("30");
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [accountCustomerQuery, setAccountCustomerQuery] = useState("");
  const [accountCustomers, setAccountCustomers] = useState<
    StoreCustomerSummary[]
  >([]);
  const [selectedAccountCustomer, setSelectedAccountCustomer] =
    useState<StoreCustomerSummary | null>(null);
  const [accountPaymentTenderMethodCode, setAccountPaymentTenderMethodCode] =
    useState("");
  const [accountPaymentBankAccountId, setAccountPaymentBankAccountId] =
    useState("");
  const [accountPaymentAmount, setAccountPaymentAmount] = useState("");
  const [accountPaymentReference, setAccountPaymentReference] = useState("");
  const [accountPaymentNote, setAccountPaymentNote] = useState("");
  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  const [managerReportPanelOpen, setManagerReportPanelOpen] = useState(true);
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [reportCashierCode, setReportCashierCode] = useState("");
  const [reportCustomerQuery, setReportCustomerQuery] = useState("");
  const [reportProductQuery, setReportProductQuery] = useState("");
  const [cashierReport, setCashierReport] = useState<StoreReportResult | null>(
    null,
  );
  const [storeReport, setStoreReport] = useState<StoreReportResult | null>(
    null,
  );
  const [dashboardReport, setDashboardReport] =
    useState<StoreReportResult | null>(null);
  const [dashboardDateFrom, setDashboardDateFrom] = useState(() =>
    todayInputValue(),
  );
  const [dashboardDateTo, setDashboardDateTo] = useState(() =>
    todayInputValue(),
  );
  const autoSyncInFlightRef = useRef(false);
  const autoSyncTimerRef = useRef<number | null>(null);
  const syncActionInFlightRef = useRef(false);
  const startupSyncAttemptedRef = useRef(false);
  const criticalStockStartupAlertKeyRef = useRef<string | null>(null);
  const loginIdInputRef = useRef<HTMLInputElement | null>(null);
  const lockPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const canViewInventory =
    snapshot?.activeOperatorSession?.capabilities.hasInventoryVisibility ===
    true;
  const signedIn = Boolean(snapshot?.activeOperatorSession);

  const refreshRuntimeStatus = useCallback(
    async (reason = "manual") => {
      if (!runtime) {
        return null;
      }

      const traceId = createDesktopTraceId("runtime-status");
      const startedAt = Date.now();
      runtime.writeDesktopDiagnostic?.("info", "runtime-status-start", {
        traceId,
        reason,
      });

      try {
        const status = await withDesktopTimeout(
          runtime.getStoreRuntimeStatus(),
          "Runtime status check",
          8_000,
        );
        setRuntimeStatus(status);
        runtime.writeDesktopDiagnostic?.("info", "runtime-status-complete", {
          traceId,
          reason,
          elapsedMs: Date.now() - startedAt,
          connected: status.connected,
          role: status.role,
          databaseProvider: status.databaseProvider,
        });
        return status;
      } catch (nextError) {
        runtime.writeDesktopDiagnostic?.("error", "runtime-status-error", {
          traceId,
          reason,
          elapsedMs: Date.now() - startedAt,
          message:
            nextError instanceof Error
              ? nextError.message
              : "Runtime status check failed.",
        });
        return null;
      }
    },
    [runtime],
  );

  const refreshSnapshot = useCallback(async () => {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return null;
    }

    const traceId = createDesktopTraceId("snapshot-refresh");
    const startedAt = Date.now();
    runtime.writeDesktopDiagnostic?.("info", "snapshot-refresh-start", {
      traceId,
    });

    const nextRuntimeStatus = await refreshRuntimeStatus("snapshot-refresh");

    runtime.writeDesktopDiagnostic?.("info", "snapshot-ipc-start", {
      traceId,
      elapsedMs: Date.now() - startedAt,
    });

    const nextSnapshot = await withDesktopTimeout(
      runtime.getSyncSnapshot(),
      "Sync snapshot refresh",
      12_000,
    ).catch((nextError: unknown) => {
      const connectionMessage =
        nextRuntimeStatus && !nextRuntimeStatus.connected
          ? nextRuntimeStatus.message
          : nextError instanceof Error
            ? nextError.message
            : "The store service could not be reached.";

      runtime.writeDesktopDiagnostic?.("error", "snapshot-refresh-error", {
        traceId,
        elapsedMs: Date.now() - startedAt,
        message: connectionMessage,
      });
      setError(connectionMessage);
      return null;
    });

    if (!nextSnapshot) {
      return null;
    }

    runtime.writeDesktopDiagnostic?.("info", "snapshot-refresh-complete", {
      traceId,
      elapsedMs: Date.now() - startedAt,
      hasActiveSession: Boolean(nextSnapshot.activeOperatorSession),
      storeUsers: nextSnapshot.storeUsers.length,
      recentTransactions: nextSnapshot.recentTransactions.length,
    });
    setSnapshot(nextSnapshot);
    setPaymentDrafts([
      defaultPaymentDraft(nextSnapshot, nextSnapshot.activeBasket),
    ]);
    if (!nextSnapshot.activeBasket?.customerId) {
      setSelectedCustomer(null);
    }
    if (!nextSnapshot.activeBasket) {
      setTransactionReference("");
      setTransactionDetails("");
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchDismissed(false);
      setTransactionDetailsOpen(false);
      setOpenPriceDraft(null);
    }

    if (!bankingReconciliationId && nextSnapshot.recentEodReconciliations[0]) {
      const reconciliation = nextSnapshot.recentEodReconciliations[0];
      const deposited = nextSnapshot.recentBankingDeposits
        .filter(
          (deposit) =>
            deposit.reconciliationId === reconciliation.reconciliationId,
        )
        .reduce((sum, deposit) => sum + deposit.amount, 0);
      setBankingReconciliationId(reconciliation.reconciliationId);
      setBankingAmount(
        Math.max(0, reconciliation.declaredCashAmount - deposited).toFixed(2),
      );
    }

    if (!inventoryLocation && nextSnapshot.inventoryLocations[0]) {
      setInventoryLocation(nextSnapshot.inventoryLocations[0].locationCode);
    }

    if (!transferSourceLocation && nextSnapshot.transferRequestTargets[0]) {
      setTransferSourceLocation(
        nextSnapshot.transferRequestTargets[0].sourceLocationCode,
      );
    }

    if (!transferDestinationLocation && nextSnapshot.inventoryLocations[0]) {
      setTransferDestinationLocation(
        nextSnapshot.inventoryLocations[0].locationCode,
      );
    }

    if (!bankingBankAccountId && nextSnapshot.availableBankAccounts[0]) {
      setBankingBankAccountId(
        nextSnapshot.availableBankAccounts[0].bankAccountId,
      );
    }

    return nextSnapshot;
  }, [
    bankingBankAccountId,
    bankingReconciliationId,
    inventoryLocation,
    refreshRuntimeStatus,
    runtime,
    transferDestinationLocation,
    transferSourceLocation,
  ]);

  const applyActionResult = useCallback((result: StoreSyncActionResult) => {
    setSnapshot(result.snapshot);
    setNotice(result.message);
    setPaymentDrafts([
      defaultPaymentDraft(result.snapshot, result.snapshot.activeBasket),
    ]);
    if (!result.snapshot.activeBasket?.customerId) {
      setSelectedCustomer(null);
    }
    if (!result.snapshot.activeBasket) {
      setTransactionReference("");
      setTransactionDetails("");
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchDismissed(false);
      setTransactionDetailsOpen(false);
      setOpenPriceDraft(null);
    }
  }, []);

  const runAction = useCallback(
    async (
      action: (
        desktopRuntime: DesktopRuntimeApi,
      ) => Promise<StoreSyncActionResult>,
    ) => {
      if (!runtime) {
        setError(
          "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
        );
        return null;
      }

      setIsBusy(true);
      setError(null);

      try {
        const result = await action(runtime);
        applyActionResult(result);
        return result;
      } catch (nextError) {
        setError(formatDesktopActionError(nextError));
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [applyActionResult, runtime],
  );

  const runSyncAction = useCallback(
    async (
      input: StoreSyncRunOptions,
      label: string,
      timeoutMs = 120_000,
    ) => {
      if (!runtime) {
        showDesktopSyncToast(
          "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
          "bad",
        );
        return null;
      }

      if (syncActionInFlightRef.current) {
        showDesktopSyncToast(
          "A sync cycle is already running. Flash ERP will keep the POS available while it finishes.",
          "warn",
        );
        return null;
      }

      syncActionInFlightRef.current = true;
      setIsSyncRunning(true);
      let detachedSyncStarted = false;

      try {
        if (runtime.startSyncCycle && input.trigger !== "manual") {
          const startResult = await withDesktopTimeout(
            runtime.startSyncCycle({
              ...input,
              snapshotMode: input.snapshotMode ?? "status",
            }),
            `${label} start`,
            8_000,
          );

          runtime.writeDesktopDiagnostic?.(
            "info",
            "sync-render-detached-start-acknowledged",
            {
              label,
              accepted: startResult.accepted,
              status: startResult.status,
              trigger: startResult.trigger,
              startedAt: startResult.startedAt,
            },
          );

          if (!startResult.accepted) {
            syncActionInFlightRef.current = false;
            setIsSyncRunning(false);
            showDesktopSyncToast(startResult.message, "warn");
            return null;
          }

          showDesktopSyncToast(
            `${label} started in the background. You can keep using the desktop while it finishes.`,
            "warn",
          );
          detachedSyncStarted = true;
          return null;
        }

        showDesktopSyncToast(
          `${label} is running. You can keep using the desktop while it works.`,
          "warn",
        );
        const result = await withDesktopTimeout(
          runtime.runSyncCycle({
            ...input,
            snapshotMode: "full",
          }),
          label,
          timeoutMs,
        );
        runtime.writeDesktopDiagnostic?.("info", "sync-render-result-received", {
          label,
          health: result.snapshot.health,
          queueMetrics: result.snapshot.queueMetrics,
          lastSyncAt: result.snapshot.lastSyncAt,
          generatedAt: result.snapshot.generatedAt,
        });
        const message = formatSyncCompletionMessage(result.message);
        setSnapshot(result.snapshot);
        showDesktopSyncToast(message, "good");
        runtime.writeDesktopDiagnostic?.("info", "sync-render-result-toast-applied", {
          label,
        });
        runtime.writeDesktopDiagnostic?.("info", "sync-render-result-finished-without-react-state", {
          label,
          message,
        });
        return result;
      } catch (nextError) {
        const message = formatDesktopActionError(nextError);
        showDesktopSyncToast(message, "bad");
        runtime.writeDesktopDiagnostic?.("error", "sync-render-result-error-toast-applied", {
          label,
          message,
        });
        return null;
      } finally {
        if (!detachedSyncStarted) {
          syncActionInFlightRef.current = false;
          setIsSyncRunning(false);
        }
      }
    },
    [runtime],
  );

  const refreshDesktopWindowStatus = useCallback(async () => {
    if (!runtime?.getDesktopWindowStatus) {
      return null;
    }

    try {
      const status = await withDesktopTimeout(
        runtime.getDesktopWindowStatus(),
        "Desktop window status check",
        8_000,
      );
      setDesktopWindowStatus(status);
      return status;
    } catch {
      return null;
    }
  }, [runtime]);

  const recoverDesktopWindow = useCallback(async () => {
    if (!runtime?.recoverDesktopWindow) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const status = await runtime.recoverDesktopWindow(
        "operator-runtime-panel",
      );
      setDesktopWindowStatus(status);
      setNotice("Desktop window recovery was requested.");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Desktop window recovery failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [runtime]);

  const refreshDesktopUpdateStatus = useCallback(async () => {
    if (!runtime) {
      return null;
    }

    try {
      const status = await runtime.getDesktopUpdateStatus();
      setDesktopUpdateStatus(status);
      return status;
    } catch {
      return null;
    }
  }, [runtime]);

  const checkDesktopUpdate = useCallback(async () => {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const status = await runtime.checkForDesktopUpdate();
      setDesktopUpdateStatus(status);
      setNotice(status.message);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Desktop update check failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [runtime]);

  const installDesktopUpdate = useCallback(async () => {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const status = await runtime.installDesktopUpdate();
      setDesktopUpdateStatus(status);
      setNotice(status.message);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Desktop update install could not start.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [runtime]);

  const browseCatalog = useCallback(async () => {
    if (!runtime) {
      return;
    }

    setIsBusy(true);

    try {
      const results = await runtime.browseCatalogItems({
        query: catalogQuery,
        departmentCode: catalogDepartment || null,
        categoryCode: catalogCategory || null,
        sellableOnly:
          activeWorkspace !== "setup" &&
          !(activeWorkspace === "pos" && saleMode === "SALES_ORDER"),
        includeInactiveCatalog: activeWorkspace === "setup",
        limit: activeWorkspace === "setup" ? 500 : 30,
      });
      setCatalogItems(results);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The catalog could not be loaded.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [
    activeWorkspace,
    catalogCategory,
    catalogDepartment,
    catalogQuery,
    runtime,
    saleMode,
  ]);

  const browseInventory = useCallback(async () => {
    if (!runtime) {
      return;
    }

    if (!canViewInventory) {
      setInventoryItems([]);
      setPurchaseOrders([]);
      setTransfers([]);
      return;
    }

    setIsBusy(true);

    try {
      const [positions, orders, transferRows] = await Promise.all([
        runtime.browseInventoryPositions({
          query: inventoryQuery,
          locationCode: inventoryLocation || null,
          limit: 30,
        }),
        runtime.browsePurchaseOrders({
          status: null,
          locationCode: inventoryLocation || null,
          limit: 12,
        }),
        runtime.browseInterStoreTransfers({
          locationCode: inventoryLocation || null,
          limit: 12,
        }),
      ]);
      setInventoryItems(positions);
      setPurchaseOrders(orders);
      setTransfers(transferRows);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Inventory could not be loaded.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [canViewInventory, inventoryLocation, inventoryQuery, runtime]);

  async function lookupRemoteInventory() {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await runtime.lookupRemoteStoreInventory({
        query: remoteInventoryQuery.trim() || null,
        productCode: remoteInventoryItemFilter || null,
        storeCode: remoteInventoryStoreFilter || null,
        locationCode: remoteInventoryLocationFilter || null,
        limit: 30,
      });
      setRemoteInventoryRows(result.rows);
      setNotice(
        result.rows.length
          ? `Found ${result.rows.length} stock position(s) in other shops.`
          : "No matching stock was found in other shops.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Remote inventory could not be loaded from HQ.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function requestRemoteStock(
    row: StoreRemoteInventoryLookupResult["rows"][number],
  ) {
    const quantity = Number(transferQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a request quantity greater than zero.");
      return;
    }

    await runAction((desktopRuntime) =>
      desktopRuntime.requestRemoteInterStoreStock({
        sourceLocationCode: row.locationCode,
        destinationLocationCode: transferDestinationLocation || null,
        productCode: row.productCode,
        quantity,
        operatorName: operatorName ?? undefined,
        note: `Store requested stock after HQ lookup found ${formatNumber(row.quantityOnHand)} unit(s) at ${row.storeName}.`,
      }),
    );
  }

  useEffect(() => {
    runtime?.notifyRendererReady?.();
    void refreshDesktopWindowStatus();

    const handle = window.setInterval(() => {
      runtime?.reportRendererHeartbeat?.();
      void refreshDesktopWindowStatus();
    }, 10_000);

    return () => window.clearInterval(handle);
  }, [refreshDesktopWindowStatus, runtime]);

  useEffect(() => {
    if (!runtime) {
      return;
    }

    let cancelled = false;

    runtime.writeDesktopDiagnostic?.("info", "startup-status-snapshot-start", {
      reason:
        "Startup hydrates persisted store branding without loading the first full POS snapshot.",
    });

    void (async () => {
      await refreshRuntimeStatus("renderer-startup");

      try {
        const readStartupSnapshot =
          runtime.getSyncStatusSnapshot ?? runtime.getSyncSnapshot;
        const startupSnapshot = await withDesktopTimeout(
          readStartupSnapshot(),
          "Startup branding snapshot",
          8_000,
        );

        if (cancelled) {
          return;
        }

        setSnapshot((current) =>
          current?.activeOperatorSession ? current : startupSnapshot,
        );
        runtime.writeDesktopDiagnostic?.(
          "info",
          "startup-status-snapshot-complete",
          {
            hasCompanyLogo: Boolean(startupSnapshot.companyLogoUrl),
            hasLoginBackground: Boolean(
              startupSnapshot.loginBackgroundImageUrl,
            ),
            storeCode: startupSnapshot.storeCode,
            nodeCode: startupSnapshot.nodeCode,
          },
        );
      } catch (nextError) {
        runtime.writeDesktopDiagnostic?.(
          "warn",
          "startup-status-snapshot-error",
          {
            message:
              nextError instanceof Error
                ? nextError.message
                : "Startup branding snapshot failed.",
          },
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshRuntimeStatus, runtime]);

  useEffect(() => {
    if (!runtime || !signedIn || startupSyncAttemptedRef.current) {
      return;
    }

    startupSyncAttemptedRef.current = true;
    runtime.writeDesktopDiagnostic?.("info", "post-login-startup-sync-skipped", {
      reason:
        "Login keeps the dashboard responsive; setup sync and scheduled sync handle enterprise refreshes.",
    });
  }, [
    runtime,
    signedIn,
  ]);

  useEffect(() => {
    if (!runtime) {
      return;
    }

    void refreshDesktopUpdateStatus();

    return runtime.onDesktopUpdateStatus?.((status) => {
      setDesktopUpdateStatus(status);
    });
  }, [refreshDesktopUpdateStatus, runtime]);

  useEffect(() => {
    if (!runtime?.onSyncCycleStatus) {
      return;
    }

    return runtime.onSyncCycleStatus((status) => {
      syncActionInFlightRef.current = false;
      setIsSyncRunning(false);

      const snapshotRequest = runtime.getSyncSnapshot();
      void snapshotRequest
        .then((nextSnapshot) => setSnapshot(nextSnapshot))
        .catch((nextError) => {
          runtime.writeDesktopDiagnostic?.(
            "warn",
            "sync-render-status-refresh-failed",
            {
              message: formatDesktopActionError(nextError),
            },
          );
        });

      const message =
        status.status === "completed"
          ? formatSyncCompletionMessage(status.message)
          : status.message;

      showDesktopSyncToast(message, status.status === "completed" ? "good" : "bad");
      runtime.writeDesktopDiagnostic?.("info", "sync-render-detached-status-received", {
        traceId: status.traceId,
        trigger: status.trigger,
        status: status.status,
        elapsedMs: status.elapsedMs,
      });
    });
  }, [runtime]);

  useEffect(() => {
    const handle = window.setInterval(() => setCurrentTime(new Date()), 1000);

    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }

    if (!runtime || !snapshot?.syncPolicy.autoSyncEnabled || isSyncRunning) {
      return;
    }

    const scheduledFor =
      snapshot.syncPolicy.nextScheduledSyncAt ??
      computeNextStoreSyncAt({
        policy: snapshot.syncPolicy,
        baseAt: snapshot.lastSyncAt ?? snapshot.generatedAt,
        includeJitter: true,
      });
    const scheduledAt = new Date(scheduledFor);

    if (Number.isNaN(scheduledAt.getTime())) {
      return;
    }

    const delayMs = Math.max(60_000, scheduledAt.getTime() - Date.now());

    autoSyncTimerRef.current = window.setTimeout(() => {
      if (autoSyncInFlightRef.current) {
        return;
      }

      autoSyncInFlightRef.current = true;
      void runSyncAction(
        {
          trigger: "scheduled",
          scheduledFor,
        },
        "Scheduled sync",
      ).finally(() => {
        autoSyncInFlightRef.current = false;
      });
    }, delayMs);

    return () => {
      if (autoSyncTimerRef.current !== null) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [
    isSyncRunning,
    runSyncAction,
    runtime,
    snapshot?.generatedAt,
    snapshot?.lastSyncAt,
    snapshot?.syncPolicy,
  ]);

  useEffect(() => {
    if (!snapshot?.activeOperatorSession) {
      return;
    }

    if (activeWorkspace === "pos") {
      void browseCatalog();
    }

    if (
      activeWorkspace === "setup" &&
      ["catalog", "products", "pricing"].includes(activeSetupSection)
    ) {
      void browseCatalog();
    }

    if (activeWorkspace === "inventory" && canViewInventory) {
      void browseInventory();
    }
  }, [
    activeWorkspace,
    browseCatalog,
    browseInventory,
    canViewInventory,
    activeSetupSection,
    snapshot?.activeOperatorSession,
  ]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const handle = window.setTimeout(() => setNotice(null), 5000);

    return () => window.clearTimeout(handle);
  }, [notice]);

  const activeBasket = snapshot?.activeBasket ?? null;
  const activeSalesOrder =
    snapshot?.salesOrders.find(
      (order) =>
        order.status === "OPEN" &&
        order.sourceTransactionId === activeBasket?.transactionId,
    ) ?? null;
  const activeShift = firstOpenShift(snapshot);
  const configuredShiftOpeningFloat = (
    snapshot?.optionSettings.shiftFloatPromptAmount ?? 0
  ).toFixed(2);
  const isVoidReviewBasket = Boolean(
    voidModeTransactionNo &&
    activeBasket?.transactionType === "RETURN" &&
    activeBasket.sourceTransactionNo === voidModeTransactionNo,
  );
  const operatorName = getOperatorName(snapshot);
  const capabilities = getCapabilities(snapshot);
  const activeShiftOwnedByOperator = isActiveShiftOwnedByOperator(snapshot);
  const licenseBlockMessage = getLicenseBlockMessage(snapshot);
  const licenseRenewalWarning = getLicenseRenewalWarning(snapshot);
  const posLaneBlockMessage = getPosLaneBlockMessage(snapshot);
  const visibleWorkspaces = useMemo(
    () => getVisibleWorkspaces(snapshot),
    [snapshot],
  );
  const setupWorkspaceVisible = visibleWorkspaces.some(
    (item) => item.id === "setup",
  );
  const securityWorkspaceVisible = visibleWorkspaces.some(
    (item) => item.id === "security",
  );
  const visibleReportWorkspaces = useMemo(
    () => getVisibleReportWorkspaces(snapshot),
    [snapshot],
  );
  const allVisibleWorkspaces = useMemo(
    () => [...visibleWorkspaces, ...visibleReportWorkspaces],
    [visibleReportWorkspaces, visibleWorkspaces],
  );
  const renderedWorkspace = allVisibleWorkspaces.some(
    (item) => item.id === activeWorkspace,
  )
    ? activeWorkspace
    : (visibleWorkspaces[0]?.id ?? "pos");
  const renderedWorkspaceItem =
    visibleWorkspaces.find((item) => item.id === renderedWorkspace) ??
    visibleReportWorkspaces.find((item) => item.id === renderedWorkspace) ??
    workspaceItems.find((item) => item.id === renderedWorkspace) ??
    reportWorkspaceItems.find((item) => item.id === renderedWorkspace) ??
    workspaceItems[0];
  const activeSetupItem =
    standaloneSetupItems.find((item) => item.id === activeSetupSection) ??
    standaloneSetupItems[0];
  const activeSecurityItem =
    standaloneSecurityItems.find((item) => item.id === activeSecuritySection) ??
    standaloneSecurityItems[0];
  const renderedTopbarItem =
    renderedWorkspace === "setup"
      ? activeSetupItem
      : renderedWorkspace === "security"
        ? activeSecurityItem
      : renderedWorkspaceItem;

  useEffect(() => {
    if (renderedWorkspace === "setup") {
      setSetupMenuExpanded(true);
    }
    if (renderedWorkspace === "security") {
      setSecurityMenuExpanded(true);
    }
  }, [renderedWorkspace]);

  const handleShiftOpeningFloatChange = useCallback((value: string) => {
    setHasEditedShiftOpeningFloat(true);
    setShiftOpeningFloat(value);
  }, []);

  useEffect(() => {
    if (activeShift) {
      setShiftOpeningFloat(activeShift.openingFloatAmount.toFixed(2));
      setHasEditedShiftOpeningFloat(false);
      return;
    }

    if (
      !hasEditedShiftOpeningFloat &&
      shiftOpeningFloat !== configuredShiftOpeningFloat
    ) {
      setShiftOpeningFloat(configuredShiftOpeningFloat);
    }
  }, [
    activeShift,
    configuredShiftOpeningFloat,
    hasEditedShiftOpeningFloat,
    shiftOpeningFloat,
  ]);

  useEffect(() => {
    if (!snapshot?.activeOperatorSession || renderedWorkspace !== "dashboard") {
      return;
    }

    void loadDashboardReport();
  }, [
    activeShift?.shiftId,
    dashboardDateFrom,
    dashboardDateTo,
    renderedWorkspace,
    runtime,
    snapshot?.activeOperatorSession?.loginId,
    snapshot?.activeOperatorSession?.capabilities.supervisorEligible,
  ]);

  const categoriesForDepartment = useMemo(
    () =>
      (snapshot?.productCategories ?? []).filter(
        (category) =>
          !catalogDepartment || category.departmentCode === catalogDepartment,
      ),
    [catalogDepartment, snapshot?.productCategories],
  );
  const tenderMethods = useMemo(
    () => sortTenderMethodsForPos(snapshot?.availableTenderMethods ?? []),
    [snapshot?.availableTenderMethods],
  );
  const accountTenderMethods = tenderMethods.filter(
    (method) => method.paymentMethod !== "STORE_CREDIT",
  );
  const localClock = clockFormatter.format(currentTime);

  useEffect(() => {
    if (!voidModeTransactionNo) {
      return;
    }

    if (
      !activeBasket ||
      activeBasket.transactionType !== "RETURN" ||
      activeBasket.sourceTransactionNo !== voidModeTransactionNo
    ) {
      setVoidModeTransactionNo(null);
    }
  }, [
    activeBasket?.sourceTransactionNo,
    activeBasket?.transactionId,
    activeBasket?.transactionType,
    voidModeTransactionNo,
  ]);

  useEffect(() => {
    const reportWorkspace = getReportWorkspaceItem(renderedWorkspace);

    if (!snapshot?.activeOperatorSession || !reportWorkspace) {
      return;
    }

    void loadStoreReport(reportWorkspace.scope);
  }, [
    renderedWorkspace,
    reportCashierCode,
    reportCustomerQuery,
    reportDateFrom,
    reportDateTo,
    reportProductQuery,
    snapshot?.activeOperatorSession,
  ]);

  useEffect(() => {
    if (!accountPaymentTenderMethodCode && accountTenderMethods[0]) {
      setAccountPaymentTenderMethodCode(
        accountTenderMethods[0].tenderMethodCode,
      );
    }
  }, [accountPaymentTenderMethodCode, accountTenderMethods]);

  useEffect(() => {
    const sessionId = snapshot?.activeOperatorSession?.sessionId ?? null;
    const showStartupCriticalStockAlert =
      snapshot?.optionSettings.showCriticalStocksOnStartup === true;

    if (!sessionId) {
      criticalStockStartupAlertKeyRef.current = null;
      setCriticalStockDialogOpen(false);
      setCriticalStockRows([]);
      return undefined;
    }

    if (!showStartupCriticalStockAlert) {
      setCriticalStockDialogOpen(false);
      setCriticalStockRows([]);
      return undefined;
    }

    if (!runtime || criticalStockStartupAlertKeyRef.current === sessionId) {
      return undefined;
    }

    criticalStockStartupAlertKeyRef.current = sessionId;
    let cancelled = false;

    void runtime
      .browseInventoryPositions({
        criticalOnly: true,
        forStartupAlert: true,
        limit: 30,
      })
      .then((rows) => {
        if (cancelled) {
          return;
        }

        const criticalRows = rows
          .filter((row) => {
            const criticalStockFloor = getCriticalStockFloor(row);

            return (
              criticalStockFloor !== null &&
              row.quantityOnHand <= criticalStockFloor
            );
          })
          .sort(
            (left, right) =>
              left.quantityOnHand -
              (getCriticalStockFloor(left) ?? 0) -
              (right.quantityOnHand - (getCriticalStockFloor(right) ?? 0)),
          )
          .slice(0, 12);

        setCriticalStockRows(criticalRows);
        setCriticalStockDialogOpen(criticalRows.length > 0);
      })
      .catch((nextError) => {
        console.warn(
          "Flash ERP critical stock startup alert could not be loaded.",
          nextError,
        );

        if (!cancelled) {
          setCriticalStockRows([]);
          setCriticalStockDialogOpen(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    runtime,
    snapshot?.activeOperatorSession?.sessionId,
    snapshot?.optionSettings.showCriticalStocksOnStartup,
  ]);

  useEffect(() => {
    const selectedTender = accountTenderMethods.find(
      (method) => method.tenderMethodCode === accountPaymentTenderMethodCode,
    );

    if (
      tenderRequiresBankAccount(selectedTender) &&
      !accountPaymentBankAccountId &&
      snapshot?.availableBankAccounts[0]
    ) {
      setAccountPaymentBankAccountId(
        snapshot.availableBankAccounts[0].bankAccountId,
      );
    }

    if (
      !tenderRequiresBankAccount(selectedTender) &&
      accountPaymentBankAccountId
    ) {
      setAccountPaymentBankAccountId("");
    }
  }, [
    accountPaymentBankAccountId,
    accountPaymentTenderMethodCode,
    accountTenderMethods,
    snapshot?.availableBankAccounts,
  ]);

  useEffect(() => {
    if (!runtime || !signedIn || renderedWorkspace !== "pos") {
      setCustomers([]);
      return;
    }

    const query = customerQuery.trim();

    if (query.length < 2) {
      setCustomers([]);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const results = await runtime.searchCustomers({ query, limit: 8 });

        if (!cancelled) {
          setCustomers(results);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Customer search failed.",
          );
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [customerQuery, renderedWorkspace, runtime, signedIn]);

  useEffect(() => {
    const sourceTransactionNo = activeBasket?.sourceTransactionNo?.trim();
    const receiptLinkedCorrection =
      (activeBasket?.transactionType === "RETURN" ||
        activeBasket?.transactionType === "EXCHANGE") &&
      Boolean(activeBasket.sourceTransactionId) &&
      Boolean(sourceTransactionNo);

    if (
      !runtime ||
      !signedIn ||
      renderedWorkspace !== "pos" ||
      !receiptLinkedCorrection ||
      !sourceTransactionNo
    ) {
      setReceiptLookup(null);
      setReceiptLineQuantityDrafts({});
      setReceiptLineSerialDrafts({});
      return;
    }

    if (
      receiptLookup?.sourceTransactionId === activeBasket.sourceTransactionId
    ) {
      return;
    }

    let cancelled = false;

    void runtime
      .lookupReceiptForCorrection(sourceTransactionNo)
      .then((lookup) => {
        if (cancelled || !lookup) {
          return;
        }

        setReceiptLookup(lookup);
        setReceiptLineQuantityDrafts(buildReceiptLineQuantityDrafts(lookup));
        setReceiptLineSerialDrafts({});
      })
      .catch((nextError) => {
        if (!cancelled) {
          console.warn(
            "Flash ERP could not restore the active correction receipt.",
            nextError,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeBasket?.sourceTransactionId,
    activeBasket?.sourceTransactionNo,
    activeBasket?.transactionType,
    receiptLookup?.sourceTransactionId,
    renderedWorkspace,
    runtime,
    signedIn,
  ]);

  useEffect(() => {
    if (
      !runtime ||
      !signedIn ||
      renderedWorkspace !== "pos" ||
      !transactionDetailsOpen ||
      transactionReferenceSearchDismissed
    ) {
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchPending(false);
      setTransactionReferenceSearchAttempted(false);
      return;
    }

    const query = transactionReference.trim();

    if (query.length < 2) {
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchPending(false);
      setTransactionReferenceSearchAttempted(false);
      return;
    }

    setTransactionReferenceMatches([]);
    setTransactionReferenceSearchPending(true);
    setTransactionReferenceSearchAttempted(false);
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const results = await runtime.searchTransactionReferences({
          query,
          limit: 8,
        });

        if (!cancelled) {
          setTransactionReferenceMatches(results);
          setTransactionReferenceSearchAttempted(true);
        }
      } catch (nextError) {
        console.warn(
          "Flash ERP transaction reference lookup failed.",
          nextError,
        );

        if (!cancelled) {
          setTransactionReferenceMatches([]);
          setTransactionReferenceSearchAttempted(true);
        }
      } finally {
        if (!cancelled) {
          setTransactionReferenceSearchPending(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    renderedWorkspace,
    runtime,
    signedIn,
    transactionDetailsOpen,
    transactionReference,
    transactionReferenceSearchDismissed,
  ]);

  useEffect(() => {
    if (
      !runtime ||
      !signedIn ||
      renderedWorkspace !== "pos" ||
      !accountPanelOpen
    ) {
      setAccountCustomers([]);
      return;
    }

    const query = accountCustomerQuery.trim();

    if (query.length === 1) {
      setAccountCustomers([]);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const results = await runtime.searchCustomers({ query, limit: 10 });

        if (!cancelled) {
          setAccountCustomers(
            results.filter((customer) => customer.receivableBalanceAmount > 0),
          );
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Customer account search failed.",
          );
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    accountCustomerQuery,
    accountPanelOpen,
    renderedWorkspace,
    runtime,
    signedIn,
  ]);

  useEffect(() => {
    if (!runtime || !signedIn || renderedWorkspace !== "pos") {
      setItemSuggestions([]);
      return;
    }

    const query = scanQuery.trim();

    if (query.length < 2) {
      setItemSuggestions([]);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const results = await runtime.browseCatalogItems({
          query,
          sellableOnly: saleMode !== "SALES_ORDER",
          limit: 8,
        });

        if (!cancelled) {
          setItemSuggestions(results);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Item search failed.",
          );
        }
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [renderedWorkspace, runtime, saleMode, scanQuery, signedIn]);

  useEffect(() => {
    if (!runtime || !signedIn || renderedWorkspace !== "pos") {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const results = await runtime.browseCatalogItems({
          query: catalogQuery,
          departmentCode: catalogDepartment || null,
          categoryCode: catalogCategory || null,
          sellableOnly: saleMode !== "SALES_ORDER",
          limit: 30,
        });

        if (!cancelled) {
          setCatalogItems(results);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The catalog could not be loaded.",
          );
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    catalogCategory,
    catalogDepartment,
    catalogQuery,
    renderedWorkspace,
    runtime,
    saleMode,
    signedIn,
  ]);

  useEffect(() => {
    setLineQuantityDrafts(
      Object.fromEntries(
        (activeBasket?.lines ?? []).map((line) => [
          line.lineId,
          String(line.quantity),
        ]),
      ),
    );
  }, [activeBasket?.transactionId, activeBasket?.updatedAt]);

  useEffect(() => {
    if (!signedIn || renderedWorkspace === activeWorkspace) {
      return;
    }

    setActiveWorkspace(renderedWorkspace);
  }, [activeWorkspace, renderedWorkspace, signedIn]);

  useEffect(() => {
    if (!signedIn && !desktopConfigOpen && !isScreenLocked) {
      window.setTimeout(() => loginIdInputRef.current?.focus(), 50);
    }
  }, [desktopConfigOpen, isScreenLocked, signedIn]);

  useEffect(() => {
    if (isScreenLocked) {
      window.setTimeout(() => lockPasswordInputRef.current?.focus(), 50);
    }
  }, [isScreenLocked]);

  async function signIn() {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    const traceId = createDesktopTraceId("signin-renderer");
    const startedAt = Date.now();
    runtime.writeDesktopDiagnostic?.("info", "sign-in-submit", {
      traceId,
      loginId: loginId.trim(),
      loginIdLength: loginId.trim().length,
      passwordLength: password.length,
    });
    setIsBusy(true);
    setError(null);
    runtime.writeDesktopDiagnostic?.("info", "sign-in-ipc-start", {
      traceId,
    });

    try {
      const result = await withDesktopTimeout(
        runtime.signInOperator({ loginId, password, traceId }),
        "Operator sign-in",
      );
      runtime.writeDesktopDiagnostic?.("info", "sign-in-ipc-complete", {
        traceId,
        elapsedMs: Date.now() - startedAt,
        hasActiveSession: Boolean(result.snapshot.activeOperatorSession),
        storeUsers: result.snapshot.storeUsers.length,
      });
      runtime.writeDesktopDiagnostic?.("info", "sign-in-render-apply-start", {
        traceId,
      });
      setSnapshot(result.snapshot);
      setNotice(result.message);
      setPassword("");
      setActiveWorkspace("dashboard");
      runtime.writeDesktopDiagnostic?.("info", "sign-in-render-apply-complete", {
        traceId,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (nextError) {
      runtime.writeDesktopDiagnostic?.("error", "sign-in-renderer-error", {
        traceId,
        elapsedMs: Date.now() - startedAt,
        message:
          nextError instanceof Error
            ? nextError.message
            : "Sign-in failed with an unknown renderer error.",
      });
      setError(
        nextError instanceof Error ? nextError.message : "Sign-in failed.",
      );
      window.setTimeout(() => loginIdInputRef.current?.focus(), 50);
    } finally {
      setIsBusy(false);
      runtime.writeDesktopDiagnostic?.("info", "sign-in-renderer-finished", {
        traceId,
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  async function createStandaloneAdmin() {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await withDesktopTimeout(
        runtime.bootstrapStandaloneAdmin({
          loginId: bootstrapAdminDraft.loginId,
          displayName: bootstrapAdminDraft.displayName,
          email: bootstrapAdminDraft.email,
          password: bootstrapAdminDraft.password,
          cashierEligible: true,
          supervisorEligible: true,
          roleName: "Standalone administrator",
        }),
        "Standalone administrator setup",
      );
      setSnapshot(result.snapshot);
      setNotice(result.message);
      setLoginId(bootstrapAdminDraft.loginId);
      setPassword("");
      setBootstrapAdminDraft((draft) => ({ ...draft, password: "" }));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Standalone administrator setup failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function unlockScreen() {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await withDesktopTimeout(
        runtime.signInOperator({
          loginId: lockLoginId,
          password: lockPassword,
        }),
        "Screen unlock",
      );
      setSnapshot(result.snapshot);
      setNotice(result.message);
      setLockPassword("");
      setIsScreenLocked(false);
      setActiveWorkspace("dashboard");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unlock failed.",
      );
      window.setTimeout(() => lockPasswordInputRef.current?.focus(), 50);
    } finally {
      setIsBusy(false);
    }
  }

  function lockScreen() {
    setLockLoginId(snapshot?.activeOperatorSession?.loginId ?? loginId);
    setLockPassword("");
    setNotice(null);
    setError(null);
    setIsScreenLocked(true);
  }

  function openEnterprisePasswordRecovery() {
    const baseUrl = snapshot?.enterpriseBaseUrl?.trim();

    if (!baseUrl) {
      setError(
        "Enterprise password recovery is unavailable until this desktop has synced HQ settings.",
      );
      return;
    }

    try {
      const recoveryUrl = new URL("/forgot-password", baseUrl).toString();
      window.open(recoveryUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(
        "The enterprise password recovery URL is not valid on this desktop.",
      );
    }
  }

  function updateDesktopConfigDraft<
    K extends keyof StoreDesktopConnectionConfig,
  >(key: K, value: StoreDesktopConnectionConfig[K]) {
    setDesktopConfigDraft((draft) => ({ ...draft, [key]: value }));
  }

  function updatePostgresConnectionDraft<
    K extends keyof PostgresConnectionDraft,
  >(key: K, value: PostgresConnectionDraft[K]) {
    setDesktopConfigDraft((draft) => {
      const nextConfig = {
        ...parsePostgresConnectionString(draft.databaseUrl),
        [key]: value,
      };

      return {
        ...draft,
        databaseUrl: buildPostgresConnectionString(nextConfig),
      };
    });
  }

  function updateMssqlConnectionDraft<K extends keyof MssqlConnectionDraft>(
    key: K,
    value: MssqlConnectionDraft[K],
  ) {
    setDesktopConfigDraft((draft) => {
      const nextConfig = {
        ...parseMssqlConnectionString(draft.databaseUrl),
        [key]: value,
      };

      return {
        ...draft,
        databaseUrl: buildMssqlConnectionString(nextConfig),
      };
    });
  }

  async function openDesktopConfig() {
    if (!runtime) {
      setError(
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.",
      );
      return;
    }

    setDesktopConfigOpen(true);
    setDesktopConfigSaving(true);

    try {
      const result = await runtime.getDesktopConnectionConfig();
      setDesktopConfigResult(result);
      setDesktopConfigDraft(result.config);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The desktop configuration could not be loaded.",
      );
    } finally {
      setDesktopConfigSaving(false);
    }
  }

  async function saveDesktopConfig(restartAfterSave: boolean) {
    if (!runtime) {
      return;
    }

    setDesktopConfigSaving(true);
    setError(null);

    try {
      const result =
        await runtime.saveDesktopConnectionConfig(desktopConfigDraft);
      setDesktopConfigResult(result);
      setDesktopConfigDraft(result.config);
      setNotice(result.message);

      if (restartAfterSave) {
        await runtime.restartDesktop();
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The desktop configuration could not be saved.",
      );
    } finally {
      setDesktopConfigSaving(false);
    }
  }

  async function provisionDesktopStoreDatabase() {
    if (!runtime) {
      return;
    }

    const providerLabel = formatDatabaseProvider(
      desktopConfigDraft.databaseProvider,
    );
    const confirmed = window.confirm(
      desktopConfigDraft.databaseProvider === "sqlite"
        ? `Provision a fresh ${providerLabel} store database? This will replace the selected local SQLite file.`
        : `Provision the selected ${providerLabel} store database? Flash ERP will create the database when the server allows it, then apply the store schema.`,
    );

    if (!confirmed) {
      return;
    }

    setDesktopConfigSaving(true);
    setError(null);

    try {
      const savedConfig =
        await runtime.saveDesktopConnectionConfig(desktopConfigDraft);
      const result = await runtime.provisionStoreDatabase(savedConfig.config);
      setDesktopConfigResult(savedConfig);
      setDesktopConfigDraft(savedConfig.config);
      setNotice(
        `${result.message} Save is complete. Restart the desktop before continuing.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The store database could not be provisioned.",
      );
    } finally {
      setDesktopConfigSaving(false);
    }
  }

  async function syncSignInData() {
    const status = await refreshRuntimeStatus("sign-in-data-sync");

    if (status?.connected === false) {
      const message =
        status.message ||
        "Flash ERP store services are not available. Provision or repair the store database, then restart the desktop.";
      setError(message);
      showDesktopSyncToast(message, "bad");
      return;
    }

    await runSyncAction(
      {
        trigger: "startup",
        drainDownstream: true,
        snapshotMode: "status",
      },
      "Sign-in data sync",
    );
  }

  async function signOutCurrentOperator() {
    await runAction(async (desktopRuntime) => {
      const result = await desktopRuntime.signOutOperator();
      setLoginId("");
      setPassword("");
      return result;
    });
  }

  async function clearSaleScreen() {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      let nextSnapshot = snapshot;
      const basketToClear = activeBasket;

      if (basketToClear?.lines.length && !activeSalesOrder) {
        for (const line of basketToClear.lines) {
          const result = await runtime.removeBasketLine(line.lineId);
          nextSnapshot = result.snapshot;
        }
      }

      if (basketToClear) {
        const result = await runtime.discardActiveBasket();
        nextSnapshot = result.snapshot;
      }

      const refreshedSnapshot =
        nextSnapshot ?? (await runtime.getSyncSnapshot());
      setSnapshot(refreshedSnapshot);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setCustomers([]);
      setScanQuery("");
      setScanQuantity("1");
      setItemSuggestions([]);
      setPaymentDrafts([
        defaultPaymentDraft(refreshedSnapshot, refreshedSnapshot.activeBasket),
      ]);
      setTransactionReference("");
      setTransactionDetails("");
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchDismissed(false);
      setTransactionDetailsOpen(false);
      setOpenPriceDraft(null);
      setSaleMode("SALE");
      setVoidModeTransactionNo(null);
      setNotice(
        activeSalesOrder
          ? `${activeSalesOrder.orderNo} was returned to pending orders without changes.`
          : "Sale screen cleared.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The sale screen could not be cleared.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  function switchWorkspace(workspace: Workspace) {
    if (!allVisibleWorkspaces.some((item) => item.id === workspace)) {
      setError(
        "Local privilege policy does not allow this operator to open that desktop page.",
      );
      return;
    }

    if (workspace !== "setup") {
      setSetupMenuExpanded(false);
    }

    if (workspace !== "security") {
      setSecurityMenuExpanded(false);
    }

    setActiveWorkspace(workspace);
    setNotice(null);
    setError(null);
  }

  function openSetupSection(section: StandaloneSetupSection) {
    if (!setupWorkspaceVisible) {
      setError(
        "Local privilege policy does not allow this operator to open master pages.",
      );
      return;
    }

    setActiveSetupSection(section);
    setSetupMenuExpanded(true);
    setActiveWorkspace("setup");
    setNotice(null);
    setError(null);
    void refreshSnapshot();
  }

  function openSecuritySection(section: StandaloneSecuritySection) {
    if (!securityWorkspaceVisible) {
      setError(
        "Local privilege policy does not allow this operator to open security pages.",
      );
      return;
    }

    setActiveSecuritySection(section);
    setSecurityMenuExpanded(true);
    setActiveWorkspace("security");
    setNotice(null);
    setError(null);
    void refreshSnapshot();
  }

  async function addReceiptReturnItemIfActive(
    lookupValue: string,
    quantity: number,
  ) {
    if (
      !runtime ||
      activeBasket?.transactionType !== "RETURN" ||
      !activeBasket.sourceTransactionId
    ) {
      return false;
    }

    let lookup =
      receiptLookup?.sourceTransactionId === activeBasket.sourceTransactionId
        ? receiptLookup
        : null;

    if (!lookup && activeBasket.sourceTransactionNo) {
      lookup = await runtime.lookupReceiptForCorrection(
        activeBasket.sourceTransactionNo,
      );

      if (lookup) {
        setReceiptLookup(lookup);
        setReceiptLineQuantityDrafts(buildReceiptLineQuantityDrafts(lookup));
        setReceiptLineSerialDrafts({});
      }
    }

    if (!lookup) {
      setError("The original receipt is still loading. Try the item again.");
      return true;
    }

    const line = findReceiptReturnLine(lookup, lookupValue);

    if (!line) {
      setError(
        `${lookupValue} is not available to return on receipt ${lookup.sourceTransactionNo}.`,
      );
      return true;
    }

    const serialNumbers =
      line.availableSerialNumbersToReturn.length === quantity
        ? line.availableSerialNumbersToReturn
        : [];

    if (
      line.availableSerialNumbersToReturn.length > 0 &&
      serialNumbers.length !== quantity
    ) {
      setError(
        `Select the original serial number before adding ${line.productName} to this return.`,
      );
      return true;
    }

    const added = await addReceiptLineToBasket(
      line,
      quantity,
      serialNumbers,
      lookup,
    );

    if (added) {
      setScanQuery("");
      setScanQuantity("1");
      setItemSuggestions([]);
      setNotice(`${line.productName} was added from the original receipt.`);
    }

    return true;
  }

  async function addScannedItem() {
    if (!runtime) {
      return;
    }

    const quantity = Number(scanQuantity);
    const blockMessage = getPosLaneBlockMessage(snapshot);

    if (blockMessage) {
      setError(blockMessage);
      return;
    }

    if (!scanQuery.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a valid product or barcode and quantity.");
      return;
    }

    const lookup = await runtime.lookupCatalogItem(scanQuery.trim());

    if (!lookup) {
      setError(`No product or barcode matched "${scanQuery.trim()}".`);
      return;
    }

    if (
      await addReceiptReturnItemIfActive(lookup.productCode, quantity)
    ) {
      return;
    }

    const matrixVariants = lookup?.matrixVariants ?? [];
    const selectedMatrixVariant = resolveMatrixVariant(
      matrixVariants,
      lookup?.productVariantCode ?? null,
    );
    const needsMatrixChoice =
      lookup?.productType === "MATRIX" && matrixVariants.length > 0;
    const needsTrackedOptionChoice =
      !needsMatrixChoice && Boolean(lookup?.trackSize || lookup?.trackColor);

    if (
      lookup?.mustEnterPriceAtPos ||
      (lookup?.isSerialized && saleMode !== "SALES_ORDER") ||
      needsMatrixChoice ||
      needsTrackedOptionChoice
    ) {
      setOpenPriceDraft({
        lookupValue: scanQuery.trim(),
        productCode: lookup.productCode,
        productVariantCode:
          selectedMatrixVariant?.variantCode ??
          (matrixVariants.length === 1 ? matrixVariants[0].variantCode : null),
        productName: lookup.productName,
        productType: lookup.productType,
        quantity: scanQuantity,
        unitPrice: lookup.mustEnterPriceAtPos
          ? ""
          : (selectedMatrixVariant?.unitPrice ?? lookup.unitPrice).toFixed(2),
        mustEnterPriceAtPos: lookup.mustEnterPriceAtPos,
        isSerialized: lookup.isSerialized,
        trackSize: lookup.trackSize,
        trackColor: lookup.trackColor,
        variantSize: "",
        variantColor: "#111827",
        variantSearch: "",
        variantAttributesSnapshot: selectedMatrixVariant
          ? formatMatrixVariantLabel(selectedMatrixVariant)
          : null,
        lineNote: "",
        matrixVariants,
        availableSerialNumbers: lookup.availableSerialNumbers,
        serialNumbers: "",
        serialEntry: "",
        serialRangeStart: "",
        serialRangeEnd: "",
        serialValidationMessage: null,
      });
      return;
    }

    const result = await runAction((desktopRuntime) =>
      desktopRuntime.addItemToBasket({
        lookupValue: scanQuery.trim(),
        quantity,
        deferInventoryValidationForSalesOrder: saleMode === "SALES_ORDER",
        lineIntent: getCatalogLineIntent(snapshot),
      }),
    );

    if (result) {
      setNotice(null);
      setScanQuery("");
      setScanQuantity("1");
      setItemSuggestions([]);
    }
  }

  async function addCatalogItem(item: StoreCatalogBrowseItem) {
    if (!runtime) {
      return;
    }

    const blockMessage = getPosLaneBlockMessage(snapshot);

    if (blockMessage) {
      setError(blockMessage);
      return;
    }

    if (await addReceiptReturnItemIfActive(item.productCode, 1)) {
      return;
    }

    const itemMatrixVariants = item.matrixVariants ?? [];
    const needsMatrixChoice =
      item.productType === "MATRIX" && itemMatrixVariants.length > 0;
    const needsTrackedOptionChoice =
      !needsMatrixChoice && Boolean(item.trackSize || item.trackColor);

    if (
      item.mustEnterPriceAtPos ||
      (item.isSerialized && saleMode !== "SALES_ORDER") ||
      needsMatrixChoice ||
      needsTrackedOptionChoice
    ) {
      const lookup = await runtime.lookupCatalogItem(item.productCode);

      if (!lookup) {
        setError(
          `Flash ERP could not find ${item.productName} in the local catalog.`,
        );
        return;
      }

      const matrixVariants = lookup.matrixVariants ?? itemMatrixVariants;
      const selectedMatrixVariant =
        matrixVariants.length === 1 ? matrixVariants[0] : null;

      setOpenPriceDraft({
        lookupValue: item.productCode,
        productCode: item.productCode,
        productVariantCode: selectedMatrixVariant?.variantCode ?? null,
        productName: item.productName,
        productType: item.productType,
        quantity: "1",
        unitPrice: lookup.mustEnterPriceAtPos
          ? ""
          : (selectedMatrixVariant?.unitPrice ?? lookup.unitPrice).toFixed(2),
        mustEnterPriceAtPos: lookup.mustEnterPriceAtPos,
        isSerialized: lookup.isSerialized,
        trackSize: lookup.trackSize,
        trackColor: lookup.trackColor,
        variantSize: "",
        variantColor: "#111827",
        variantSearch: "",
        variantAttributesSnapshot: selectedMatrixVariant
          ? formatMatrixVariantLabel(selectedMatrixVariant)
          : null,
        lineNote: "",
        matrixVariants,
        availableSerialNumbers: lookup.availableSerialNumbers,
        serialNumbers: "",
        serialEntry: "",
        serialRangeStart: "",
        serialRangeEnd: "",
        serialValidationMessage: null,
      });
      return;
    }

    const result = await runAction((desktopRuntime) =>
      desktopRuntime.addItemToBasket({
        lookupValue: item.productCode,
        quantity: 1,
        deferInventoryValidationForSalesOrder: saleMode === "SALES_ORDER",
        lineIntent: getCatalogLineIntent(snapshot),
      }),
    );

    if (result) {
      setNotice(null);
      setScanQuery("");
      setItemSuggestions([]);
    }
  }

  async function submitOpenPriceDraft() {
    const draft = openPriceDraft;

    if (!draft) {
      return;
    }

    const quantity = Number(draft.quantity);
    const unitPrice = draft.unitPrice.trim() ? Number(draft.unitPrice) : null;
    const serialNumbers = parseSerialDraft(draft.serialNumbers);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a valid quantity before adding the item.");
      return;
    }

    if (await addReceiptReturnItemIfActive(draft.productCode, quantity)) {
      setOpenPriceDraft(null);
      return;
    }

    if (
      draft.isSerialized &&
      saleMode !== "SALES_ORDER" &&
      serialNumbers.length !== quantity
    ) {
      setError(
        `Choose exactly ${quantity} serial number(s) before adding ${draft.productName}.`,
      );
      return;
    }

    if (
      draft.mustEnterPriceAtPos &&
      (typeof unitPrice !== "number" ||
        !Number.isFinite(unitPrice) ||
        unitPrice <= 0)
    ) {
      setError(
        "Enter a valid selling price before adding the open-price item.",
      );
      return;
    }

    const selectedMatrixVariant = resolveMatrixVariant(
      draft.matrixVariants,
      draft.productVariantCode,
    );
    const isMatrixDraft =
      draft.productType === "MATRIX" && draft.matrixVariants.length > 0;

    if (isMatrixDraft && !selectedMatrixVariant) {
      setError(`Choose the option for ${draft.productName}.`);
      return;
    }

    const variantSize =
      !isMatrixDraft && draft.trackSize ? draft.variantSize.trim() || null : null;
    const variantColor =
      !isMatrixDraft && draft.trackColor ? draft.variantColor.trim() || null : null;

    const result = await runAction((desktopRuntime) =>
      desktopRuntime.addItemToBasket({
        lookupValue: draft.lookupValue,
        quantity,
        deferInventoryValidationForSalesOrder: saleMode === "SALES_ORDER",
        lineIntent: getCatalogLineIntent(snapshot),
        serialNumbers,
        unitPrice,
        productVariantCode: selectedMatrixVariant?.variantCode ?? null,
        variantSize,
        variantColor,
        variantAttributesSnapshot:
          selectedMatrixVariant !== null
            ? formatMatrixVariantLabel(selectedMatrixVariant)
            : draft.variantAttributesSnapshot,
        lineNote: draft.lineNote.trim() || null,
      }),
    );

    if (result) {
      setNotice(null);
      setOpenPriceDraft(null);
      setScanQuery("");
      setScanQuantity("1");
      setItemSuggestions([]);
    }
  }

  async function updateBasketLineQuantity(lineId: string) {
    const line = activeBasket?.lines.find(
      (candidate) => candidate.lineId === lineId,
    );
    const draft = lineQuantityDrafts[lineId]?.trim() ?? "";
    const quantity = Number(draft);
    const blockMessage = getPosLaneBlockMessage(snapshot);

    if (blockMessage) {
      setError(blockMessage);
      return;
    }

    if (!line || !draft || !Number.isFinite(quantity)) {
      setError("Enter a valid line quantity before updating the item.");
      return;
    }

    const configuredDiscountRate = resolveLineConfiguredPosDiscountRate(line);
    const overrideDiscountAmount =
      configuredDiscountRate === null
        ? undefined
        : Number((quantity * line.unitPrice * (configuredDiscountRate / 100)).toFixed(2));

    await runAction((desktopRuntime) =>
      desktopRuntime.updateBasketLine({
        lineId,
        quantity,
        deferInventoryValidationForSalesOrder: saleMode === "SALES_ORDER",
        serialNumbers: line.serialNumbers,
        overrideDiscountAmount,
        configuredDiscountRate,
      }),
    );
  }

  function buildCheckoutPayments(): StoreBasketCheckoutPayment[] {
    if (!activeBasket || Math.abs(activeBasket.totalAmount) <= 0) {
      return [];
    }

    return paymentDrafts
      .map<StoreBasketCheckoutPayment | null>((draft) => {
        const tender = tenderMethods.find(
          (method) => method.tenderMethodCode === draft.tenderMethodCode,
        );
        const amount = Number(draft.amount);

        if (!tender || !Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        return {
          method: tender.paymentMethod,
          tenderMethodCode: tender.tenderMethodCode,
          tenderMethodName: tender.tenderMethodName,
          bankAccountId: draft.bankAccountId || null,
          amount,
          reference: draft.reference.trim() || null,
        };
      })
      .filter(
        (payment): payment is StoreBasketCheckoutPayment => payment !== null,
      );
  }

  async function checkoutBasket() {
    if (!runtime || !activeBasket) {
      return;
    }

    const blockMessage = getPosLaneBlockMessage(snapshot);

    if (blockMessage) {
      setError(blockMessage);
      return;
    }

    const payments = buildCheckoutPayments();
    const basketTotal = activeSalesOrder
      ? Math.max(0, activeSalesOrder.balanceAmount)
      : Math.abs(activeBasket.totalAmount);

    if (basketTotal > 0 && payments.length === 0) {
      setError(
        "Add at least one valid payment row before completing the sale.",
      );
      return;
    }

    const tenderTotal = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    if (basketTotal > 0 && tenderTotal + 0.005 < basketTotal) {
      setError(`Tender is short by ${formatMoney(basketTotal - tenderTotal)}.`);
      return;
    }

    const transactionNoToPrint = activeBasket.transactionNo;
    setIsBusy(true);
    setError(null);

    try {
      const headerReference =
        isVoidReviewBasket && activeBasket.sourceTransactionNo
          ? transactionReference.trim() ||
            `VOID ${activeBasket.sourceTransactionNo}`
          : transactionReference.trim() || null;
      const additionalDetails =
        isVoidReviewBasket && activeBasket.sourceTransactionNo
          ? transactionDetails.trim() ||
            `Voided original receipt ${activeBasket.sourceTransactionNo}.`
          : transactionDetails.trim() || null;
      const result = await runtime.checkoutActiveBasket({
        payments,
        headerReference,
        additionalDetails,
      });
      setSnapshot(result.snapshot);
      setNotice(result.message);
      setPaymentDrafts([
        defaultPaymentDraft(result.snapshot, result.snapshot.activeBasket),
      ]);
      setSelectedCustomer(null);
      setTransactionReference("");
      setTransactionDetails("");
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchDismissed(false);
      setTransactionDetailsOpen(false);
      setVoidModeTransactionNo(null);

      if (transactionNoToPrint) {
        await runtime.printReceipt({
          transactionNo: transactionNoToPrint,
          autoPrint: true,
        });
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The basket could not be checked out locally.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function saveSalesOrderBasket() {
    const depositAmount = Math.max(0, Number(salesOrderDepositAmount) || 0);
    const depositTenderMethodCode =
      salesOrderDepositTenderCode ||
      snapshot?.availableTenderMethods.find(
        (method) => method.paymentMethod === "CASH",
      )?.tenderMethodCode ||
      snapshot?.availableTenderMethods[0]?.tenderMethodCode ||
      null;
    const result = await runAction((desktopRuntime) =>
      desktopRuntime.createSalesOrderFromActiveBasket({
        operatorName: getOperatorName(snapshot),
        headerReference: transactionReference.trim() || null,
        additionalDetails: transactionDetails.trim() || null,
        depositAmount,
        depositTenderMethodCode: depositAmount > 0 ? depositTenderMethodCode : null,
        depositReference: salesOrderDepositReference.trim() || null,
        note:
          [transactionReference.trim(), transactionDetails.trim()]
            .filter(Boolean)
            .join(" - ") || null,
      }),
    );

    if (result) {
      setSaleMode("SALE");
      setTransactionReference("");
      setTransactionDetails("");
      setTransactionReferenceMatches([]);
      setTransactionReferenceSearchDismissed(false);
      setSalesOrderDepositAmount("0");
      setSalesOrderDepositTenderCode("");
      setSalesOrderDepositReference("");
      setTransactionDetailsOpen(false);
      setHeldSalePanelOpen(false);
      setReceiptPanelOpen(false);
      setAccountPanelOpen(false);
      setSalesOrderPanelOpen(true);

      if (result.salesOrderNo && runtime?.printSalesOrderReceipt) {
        try {
          await runtime.printSalesOrderReceipt({
            orderNo: result.salesOrderNo,
            autoPrint: true,
          });
        } catch (nextError) {
          setError(formatDesktopActionError(nextError));
        }
      }
    }
  }

  async function cancelSalesOrder(order: StoreSalesOrderSummary) {
    await runAction((desktopRuntime) =>
      desktopRuntime.cancelSalesOrder({
        orderId: order.orderId,
        operatorName: getOperatorName(snapshot),
        note: order.note ?? "Cancelled from the POS sales order queue.",
      }),
    );
  }

  async function fulfilSalesOrder(order: StoreSalesOrderSummary) {
    const result = await runAction((desktopRuntime) =>
      desktopRuntime.resumeSalesOrder(order.orderId),
    );

    if (!result) {
      return;
    }

    setPaymentDrafts([
      defaultPaymentDraft(
        result.snapshot,
        result.snapshot.activeBasket,
        order.balanceAmount.toFixed(2),
      ),
    ]);
    setSaleMode("SALE");
    setSalesOrderPanelOpen(false);
    setHeldSalePanelOpen(false);
    setReceiptPanelOpen(false);
    setAccountPanelOpen(false);
  }

  async function resumeHeldSale(
    basket: NonNullable<StoreSyncSnapshot["parkedBaskets"]>[number],
  ) {
    const heldActiveBasketNo = snapshot?.activeBasket?.transactionNo ?? null;
    const result = await runAction(async (desktopRuntime) => {
      if (
        snapshot?.activeBasket &&
        snapshot.activeBasket.transactionId !== basket.transactionId
      ) {
        await desktopRuntime.parkActiveBasket();
      }

      return desktopRuntime.resumeParkedBasket(basket.transactionId);
    });

    if (result) {
      setHeldSalePanelOpen(false);
      setSalesOrderPanelOpen(false);
      setReceiptPanelOpen(false);
      setAccountPanelOpen(false);
      setSaleMode("SALE");

      if (heldActiveBasketNo) {
        setNotice(
          `${heldActiveBasketNo} was held before recalling ${basket.transactionNo}.`,
        );
      }
    }
  }

  async function attachCustomer(customer: StoreCustomerSummary | null) {
    const result = await runAction((desktopRuntime) =>
      desktopRuntime.attachCustomerToActiveBasket({
        customerId: customer?.customerId ?? null,
      }),
    );

    if (result) {
      setSelectedCustomer(customer);
      setCustomerQuery(customer ? `${customer.customerNo} · ${customer.fullName}` : "");
      setCustomers([]);
    }
  }

  function resolveConfiguredPosDiscountRate(
    value: string | number | null | undefined,
  ) {
    const rate = Number(value);
    const configuredRates = snapshot?.optionSettings.posDiscountRates ?? [];

    if (!Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    return configuredRates.some(
      (configuredRate) => configuredRate.toFixed(2) === rate.toFixed(2),
    )
      ? Number(rate.toFixed(2))
      : null;
  }

  function resolveLineConfiguredPosDiscountRate(line: StoreBasketLineSummary) {
    if (!line.hasManualDiscountOverride || line.discountAmount <= 0) {
      return null;
    }

    return (snapshot?.optionSettings.posDiscountRates ?? []).find((rate) => {
      const expectedDiscount = Number(
        (line.quantity * line.unitPrice * (rate / 100)).toFixed(2),
      );

      return Math.abs(expectedDiscount - line.discountAmount) < 0.01;
    }) ?? null;
  }

  async function applyPosDiscountRate(lineId: string, value: string) {
    if (!runtime) {
      return;
    }

    const rate = resolveConfiguredPosDiscountRate(value);
    const line = activeBasket?.lines.find((candidate) => candidate.lineId === lineId);

    if (!line) {
      setNotice("Select an item before applying a POS discount.");
      return;
    }

    if (line.lineIntent !== "SALE" || line.sourceLineId) {
      setError("POS discounts can only be applied to editable sale lines.");
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const discountAmount =
        rate !== null
          ? Number((line.quantity * line.unitPrice * (rate / 100)).toFixed(2))
          : 0;
      const result = await runtime.updateBasketLine({
        lineId: line.lineId,
        quantity: line.quantity,
        deferInventoryValidationForSalesOrder: saleMode === "SALES_ORDER",
        serialNumbers: line.serialNumbers,
        overrideDiscountAmount: discountAmount,
        configuredDiscountRate: rate,
      });

      setSnapshot(result.snapshot);
      setPaymentDrafts([
        defaultPaymentDraft(result.snapshot, result.snapshot.activeBasket),
      ]);

      setNotice(
        rate !== null
          ? `Applied POS discount ${formatDiscountRate(rate)}% to ${line.productName}.`
          : `POS discount cleared for ${line.productName}.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Flash ERP could not apply the POS discount.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function activateSalesOrderMode() {
    setSaleMode("SALES_ORDER");

    if (!runtime) {
      return;
    }

    setIsBusy(true);

    try {
      const results = await runtime.searchCustomers({ query: "Other", limit: 24 });
      const otherCustomer =
        results.find((customer) => customer.customerType.trim().toUpperCase() === "OTHER") ??
        null;

      setCustomers(results);

      if (!otherCustomer) {
        setNotice("Sales order mode is on, but no customer with type Other was found.");
        return;
      }

      await attachCustomer(otherCustomer);
      setNotice(`Sales order mode loaded ${otherCustomer.fullName}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Flash ERP could not load the Other sales-order customer.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function searchCustomers() {
    if (!runtime) {
      return;
    }

    setIsBusy(true);

    try {
      const results = await runtime.searchCustomers({
        query: customerQuery,
        limit: 8,
      });
      setCustomers(results);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Customer search failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function loadSetupCustomers() {
    if (!runtime) {
      return [];
    }

    try {
      const results = await runtime.searchCustomers({ limit: 300 });
      setError(null);
      return results;
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Customer setup list could not be loaded.",
      );
      return [];
    }
  }

  async function searchAccountCustomers() {
    if (!runtime) {
      return;
    }

    setIsBusy(true);

    try {
      const results = await runtime.searchCustomers({
        query: accountCustomerQuery,
        limit: 10,
      });
      setAccountCustomers(
        results.filter((customer) => customer.receivableBalanceAmount > 0),
      );
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Customer account search failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function loadStoreReport(
    scope: "CASHIER" | "STORE",
    overrides: Partial<StoreReportBrowseRequest> = {},
  ) {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await runtime.browseStoreReports({
        scope,
        dateFrom: reportDateFrom || null,
        dateTo: reportDateTo || null,
        cashierCode:
          scope === "STORE"
            ? reportCashierCode.trim() || null
            : (activeShift?.cashierCode ??
              snapshot?.activeOperatorSession?.loginId ??
              null),
        customerQuery: reportCustomerQuery.trim() || null,
        productQuery: reportProductQuery.trim() || null,
        limit: 50,
        ...overrides,
      });

      if (scope === "STORE") {
        setStoreReport(result);
      } else {
        setCashierReport(result);
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The local report could not be loaded.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function loadDashboardReport() {
    if (!runtime || !snapshot?.activeOperatorSession) {
      setDashboardReport(null);
      return;
    }

    const supervisorEligible =
      snapshot.activeOperatorSession.capabilities.supervisorEligible === true;
    const today = todayInputValue();
    const normalizedDateFrom = dashboardDateFrom || today;
    const normalizedDateTo = dashboardDateTo || normalizedDateFrom;
    const isTodayScope =
      normalizedDateFrom === today && normalizedDateTo === today;
    const dashboardShiftId =
      !supervisorEligible && activeShift && isTodayScope
        ? activeShift.shiftId
        : null;

    try {
      const result = await runtime.browseStoreReports({
        scope: supervisorEligible ? "STORE" : "CASHIER",
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        cashierCode: supervisorEligible
          ? null
          : (activeShift?.cashierCode ??
            snapshot.activeOperatorSession.loginId),
        shiftId: dashboardShiftId,
        customerQuery: null,
        productQuery: null,
        limit: 100,
      });

      setDashboardReport(result);
    } catch (nextError) {
      setDashboardReport(null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The dashboard report could not be loaded.",
      );
    }
  }

  async function recordAccountPayment() {
    if (!selectedAccountCustomer) {
      setError("Choose a customer account before recording a payment.");
      return;
    }

    const amount = Number(accountPaymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid customer account payment amount.");
      return;
    }

    const result = await runAction((desktopRuntime) =>
      desktopRuntime.recordCustomerAccountPayment({
        customerId: selectedAccountCustomer.customerId,
        tenderMethodCode: accountPaymentTenderMethodCode,
        bankAccountId: accountPaymentBankAccountId || null,
        amount,
        reference: accountPaymentReference.trim() || null,
        note: accountPaymentNote.trim() || null,
      }),
    );

    if (result) {
      const entryNo =
        result.accountPaymentEntryNo ??
        result.snapshot.recentCustomerAccountEntries.find(
          (entry) => entry.customerId === selectedAccountCustomer.customerId,
        )?.entryNo ??
        null;

      setAccountPaymentAmount("");
      setAccountPaymentReference("");
      setAccountPaymentNote("");
      setAccountPaymentBankAccountId("");
      setSelectedAccountCustomer(null);
      setAccountCustomers([]);
      setAccountCustomerQuery("");
      setAccountPanelOpen(false);
      await refreshSnapshot();

      if (entryNo && runtime) {
        try {
          await runtime.printAccountPaymentReceipt({
            entryNo,
            autoPrint: true,
          });
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The account payment receipt could not be printed.",
          );
        }
      }
    }
  }

  function addPaymentRow() {
    setPaymentDrafts((drafts) => [
      ...drafts,
      defaultPaymentDraft(snapshot, null, ""),
    ]);
  }

  function removePaymentRow(paymentId: string) {
    setPaymentDrafts((drafts) =>
      drafts.length <= 1
        ? drafts
        : drafts.filter((draft) => draft.id !== paymentId),
    );
  }

  async function printReceipt(transactionNo: string, autoPrint = false) {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await runtime.printReceipt({ transactionNo, autoPrint });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The thermal receipt preview could not be opened.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function printAccountPaymentReceipt(
    entryNo: string,
    autoPrint = false,
  ) {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await runtime.printAccountPaymentReceipt({ entryNo, autoPrint });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The account payment receipt preview could not be opened.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function printSalesOrderReceipt(orderNo: string, autoPrint = false) {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await runtime.printSalesOrderReceipt({ orderNo, autoPrint });
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The sales order receipt preview could not be opened.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function startCorrectionFromReceipt(
    transactionNo: string,
    correctionType: "RETURN" | "EXCHANGE",
  ) {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const heldTransactionNo = snapshot?.activeBasket?.transactionNo ?? null;

      if (snapshot?.activeBasket) {
        await runtime.parkActiveBasket();
      }

      const result =
        correctionType === "RETURN"
          ? await runtime.startReturnFromReceipt(transactionNo)
          : await runtime.startExchangeFromReceipt(transactionNo);
      const lookup = await runtime.lookupReceiptForCorrection(transactionNo);

      if (!lookup || lookup.eligibleLineCount === 0) {
        throw new Error(
          `Receipt ${transactionNo} has no remaining quantity available for ${correctionType.toLowerCase()}.`,
        );
      }

      setSnapshot(result.snapshot);
      setNotice(
        heldTransactionNo
          ? `${heldTransactionNo} was held before opening the ${correctionType.toLowerCase()} for ${transactionNo}.`
          : result.message,
      );
      setReceiptLookup(lookup);
      setReceiptLineQuantityDrafts(buildReceiptLineQuantityDrafts(lookup));
      setReceiptLineSerialDrafts({});
      setPaymentDrafts([
        defaultPaymentDraft(result.snapshot, result.snapshot.activeBasket),
      ]);
      setReceiptQuery(transactionNo);
      setReceiptHistoryKind("SALES");
      setReceiptPanelOpen(true);
      setHeldSalePanelOpen(false);
      setSalesOrderPanelOpen(false);
      setAccountPanelOpen(false);
      setVoidModeTransactionNo(null);
      setActiveWorkspace("pos");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The receipt correction could not be started.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function startReturnFromReceipt(transactionNo: string) {
    await startCorrectionFromReceipt(transactionNo, "RETURN");
  }

  async function startExchangeFromReceipt(transactionNo: string) {
    await startCorrectionFromReceipt(transactionNo, "EXCHANGE");
  }

  async function addReceiptLineToBasket(
    line: StoreReceiptLookupResult["lines"][number],
    quantityOverride?: number,
    serialNumbersOverride?: string[],
    receiptLookupOverride?: StoreReceiptLookupResult,
  ) {
    const sourceLookup = receiptLookupOverride ?? receiptLookup;

    if (!runtime || !sourceLookup) {
      return false;
    }

    const selectedSerialNumbers =
      serialNumbersOverride ??
      parseSerialDraft(receiptLineSerialDrafts[line.sourceLineId] ?? "");
    const quantity =
      quantityOverride ??
      (line.availableSerialNumbersToReturn.length > 0
        ? selectedSerialNumbers.length
        : Number(receiptLineQuantityDrafts[line.sourceLineId] ?? "0"));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError(
        line.availableSerialNumbersToReturn.length > 0
          ? "Select at least one serial number from the original receipt line."
          : "Enter a valid return quantity before adding the receipt line.",
      );
      return false;
    }

    if (quantity > line.quantityAvailableToReturn) {
      setError(
        `Only ${formatNumber(line.quantityAvailableToReturn)} unit(s) of ${line.productName} remain available to return.`,
      );
      return false;
    }

    const availableSerialKeys = new Set(
      line.availableSerialNumbersToReturn.map((serialNumber) =>
        serialNumber.toUpperCase(),
      ),
    );
    const invalidSerialNumbers = selectedSerialNumbers.filter(
      (serialNumber) => !availableSerialKeys.has(serialNumber.toUpperCase()),
    );

    if (invalidSerialNumbers.length > 0) {
      setError(
        `These serials are not available on the original receipt line: ${invalidSerialNumbers.join(", ")}.`,
      );
      return false;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await runtime.addReceiptLineToBasket({
        sourceTransactionId: sourceLookup.sourceTransactionId,
        sourceLineId: line.sourceLineId,
        quantity,
        serialNumbers: selectedSerialNumbers,
      });
      const refreshedLookup =
        (await runtime.lookupReceiptForCorrection(
          sourceLookup.sourceTransactionNo,
        )) ?? sourceLookup;

      applyActionResult(result);
      setReceiptLookup(refreshedLookup);
      setReceiptLineQuantityDrafts(
        buildReceiptLineQuantityDrafts(refreshedLookup),
      );
      setReceiptLineSerialDrafts({});
      setPaymentDrafts(
        paymentDraftsFromReceiptLookup(
          result.snapshot,
          result.snapshot.activeBasket,
          refreshedLookup,
        ),
      );
      return true;
    } catch (nextError) {
      setError(formatDesktopActionError(nextError));
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function voidReceipt(receipt: StoreReceiptSearchResult) {
    if (!runtime) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const heldTransactionNo = snapshot?.activeBasket?.transactionNo ?? null;

      if (snapshot?.activeBasket) {
        await runtime.parkActiveBasket();
      }

      const lookup = await runtime.lookupReceiptForCorrection(
        receipt.transactionNo,
      );

      if (!lookup || lookup.eligibleLineCount === 0) {
        setError(
          `Receipt ${receipt.transactionNo} has no remaining quantity available to void.`,
        );
        return;
      }

      let result = await runtime.startReturnFromReceipt(receipt.transactionNo);

      for (const line of lookup.lines.filter(
        (item) => item.quantityAvailableToReturn > 0,
      )) {
        result = await runtime.addReceiptLineToBasket({
          sourceTransactionId: lookup.sourceTransactionId,
          sourceLineId: line.sourceLineId,
          quantity: line.quantityAvailableToReturn,
          serialNumbers:
            line.availableSerialNumbersToReturn.length > 0
              ? line.availableSerialNumbersToReturn.slice(
                  0,
                  Math.trunc(line.quantityAvailableToReturn),
                )
              : [],
        });
      }

      setSnapshot(result.snapshot);
      setNotice(
        heldTransactionNo
          ? `${heldTransactionNo} was held before voiding ${receipt.transactionNo}. Review the locked basket, then complete the void.`
          : `Void return staged for ${receipt.transactionNo}. Review the locked basket, then complete the void.`,
      );
      setPaymentDrafts(
        paymentDraftsFromReceiptLookup(
          result.snapshot,
          result.snapshot.activeBasket,
          lookup,
        ),
      );
      setReceiptPanelOpen(false);
      setVoidModeTransactionNo(receipt.transactionNo);
      setTransactionReference(`VOID ${receipt.transactionNo}`);
      setTransactionDetails(
        `Voided original receipt ${receipt.transactionNo}.`,
      );
      setActiveWorkspace("pos");
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The receipt could not be voided locally.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function openShift() {
    const result = await runAction((desktopRuntime) =>
      desktopRuntime.openShift({
        cashierCode: snapshot?.activeOperatorSession?.loginId ?? "",
        openingFloatAmount: Number(shiftOpeningFloat),
      }),
    );

    if (result) {
      await printShiftReport("X", true);
    }
  }

  async function closeShift() {
    const closeResult = await runAction((desktopRuntime) =>
      desktopRuntime.closeActiveShift({
        declaredCashAmount: Number(shiftDeclaredCash),
      }),
    );

    if (closeResult) {
      const closedShiftNo =
        closeResult.snapshot.recentClosedShifts[0]?.shiftNo ?? "Closed shift";

      setShiftCloseDialogOpen(false);
      const zReportResult = await runShiftReportPrint("Z", true);
      setShiftDeclaredCash("0");
      setShiftOpeningFloat(configuredShiftOpeningFloat);
      setHasEditedShiftOpeningFloat(false);

      if (zReportResult.ok) {
        setNotice(
          `${closedShiftNo} closed and the Z report was generated. Open the next shift when the lane is ready.`,
        );
      } else {
        setError(
          `${closedShiftNo} closed, but the Z report could not print: ${zReportResult.message}`,
        );
      }
    }
  }

  async function runShiftReportPrint(reportType: "X" | "Z", autoPrint = false) {
    if (!runtime) {
      const message =
        "Desktop runtime is unavailable. Launch this from the Electron store desktop.";
      setError(message);
      return { ok: false, message };
    }

    setIsBusy(true);
    setError(null);

    try {
      await runtime.printShiftReport({ reportType, autoPrint });
      return { ok: true, message: "" };
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : `The ${reportType} report could not be printed.`;
      setError(message);
      return { ok: false, message };
    } finally {
      setIsBusy(false);
    }
  }

  async function printShiftReport(reportType: "X" | "Z", autoPrint = false) {
    await runShiftReportPrint(reportType, autoPrint);
  }

  async function recordEod() {
    const targetShift =
      [
        snapshot?.activeShift,
        ...(snapshot?.openShifts ?? []),
        ...(snapshot?.recentStoreShifts ?? []),
        ...(snapshot?.recentClosedShifts ?? []),
      ].find((shift) => shift?.shiftId === managerShiftId) ??
      snapshot?.recentStoreShifts[0] ??
      snapshot?.recentClosedShifts[0] ??
      snapshot?.activeShift ??
      null;

    if (!targetShift) {
      setError("Open or close a shift before recording EOD.");
      return;
    }

    await runAction((desktopRuntime) =>
      desktopRuntime.recordEodReconciliation({
        shiftId: targetShift.shiftId,
        declaredCashAmount: Number(eodDeclaredCash),
        operatorName,
        note: eodNote.trim() || null,
      }),
    );
  }

  async function recordBanking() {
    if (!bankingReconciliationId) {
      setError("Select an EOD reconciliation before banking.");
      return;
    }

    await runAction((desktopRuntime) =>
      desktopRuntime.recordBankingDeposit({
        reconciliationId: bankingReconciliationId,
        amount: Number(bankingAmount),
        bankName: bankingBankName.trim() || null,
        bankAccountId: bankingBankAccountId || null,
        reference: bankingReference.trim() || null,
        operatorName,
      }),
    );
  }

  async function saveStockCount(input?: {
    productCode?: string;
    countedQuantity?: number;
  }) {
    await runAction((desktopRuntime) =>
      desktopRuntime.saveStockCountSessionDraft({
        inventoryLocationCode: inventoryLocation,
        productCode: (input?.productCode ?? stockCountProductCode).trim(),
        countedQuantity: input?.countedQuantity ?? Number(stockCountQuantity),
        note: stockCountNote.trim() || null,
        operatorName: operatorName ?? undefined,
      }),
    );
  }

  async function submitStockCount(sessionId: string) {
    await runAction((desktopRuntime) =>
      desktopRuntime.submitStockCountSession(sessionId),
    );
  }

  async function commitStockCount(sessionId: string, sessionNo: string) {
    const confirmed = window.confirm(
      `Commit ${sessionNo} and post the variance to local inventory? This will sync the committed count variance to HQ.`,
    );

    if (!confirmed) {
      return;
    }

    await runAction((desktopRuntime) =>
      desktopRuntime.commitStockCountSession(sessionId),
    );
  }

  async function createTransferRequest(input?: {
    sourceLocationCode?: string;
    destinationLocationCode?: string;
    productCode?: string;
    quantity?: number;
    externalReference?: string | null;
    note?: string | null;
  }): Promise<boolean> {
    const nextProductCode = (input?.productCode ?? transferProductCode).trim();
    const nextQuantity = input?.quantity ?? Number(transferQuantity);

    if (!nextProductCode) {
      setError(
        "Choose an item on the Details tab before saving the transfer request.",
      );
      return false;
    }

    const result = await runAction((desktopRuntime) =>
      desktopRuntime.saveInterStoreTransferRequestDraft({
        sourceLocationCode: input?.sourceLocationCode ?? transferSourceLocation,
        destinationLocationCode:
          input?.destinationLocationCode ?? transferDestinationLocation,
        productCode: nextProductCode.toUpperCase(),
        quantity: nextQuantity,
        externalReference: input?.externalReference ?? null,
        note: input?.note ?? null,
        operatorName: operatorName ?? undefined,
      }),
    );

    return Boolean(result);
  }

  async function submitTransferRequestDraft(draftId: string) {
    await runAction((desktopRuntime) =>
      desktopRuntime.submitInterStoreTransferRequestDraft(draftId),
    );
  }

  async function receivePurchaseOrder(
    order: StorePurchaseOrderSummary,
    line?: StorePurchaseOrderSummary["lines"][number],
    quantity?: number,
  ) {
    const targetLines = line ? [line] : order.lines;
    const receivableLines = targetLines.filter(
      (candidate) =>
        candidate.outstandingQuantity > 0 && !candidate.isSerialized,
    );

    if (receivableLines.length === 0) {
      setError(
        "This purchase order has no non-serialized outstanding lines for quick receipt.",
      );
      return;
    }

    await runAction((desktopRuntime) =>
      desktopRuntime.receivePurchaseOrder({
        purchaseOrderId: order.purchaseOrderId,
        operatorName: operatorName ?? undefined,
        lines: receivableLines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantity: Math.min(
            line.outstandingQuantity,
            Math.max(0, quantity ?? line.outstandingQuantity),
          ),
        })),
      }),
    );
  }

  async function createStandalonePurchaseOrder(
    input: StoreStandalonePurchaseOrderInput,
  ) {
    const result = await runAction((desktopRuntime) =>
      desktopRuntime.saveStandalonePurchaseOrder({
        ...input,
        operatorName: input.operatorName ?? operatorName ?? undefined,
      }),
    );

    if (result) {
      await browseInventory();
    }

    return Boolean(result);
  }

  async function browseAvailableSerialNumbers(
    productCode: string,
    locationCode: string,
  ) {
    if (!runtime) {
      return [];
    }

    const rows = await runtime.browseSerialRegistry({
      query: productCode,
      locationCode,
      status: "AVAILABLE",
      limit: 40,
    });

    return rows
      .filter(
        (row) =>
          row.productCode.toUpperCase() === productCode.trim().toUpperCase(),
      )
      .map((row) => row.serialNumber);
  }

  async function receiveSerializedPurchaseOrderLine(
    order: StorePurchaseOrderSummary,
    line: StorePurchaseOrderSummary["lines"][number],
    serialNumbers: string[],
  ) {
    await runAction((desktopRuntime) =>
      desktopRuntime.receivePurchaseOrder({
        purchaseOrderId: order.purchaseOrderId,
        operatorName: operatorName ?? undefined,
        lines: [
          {
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantity: serialNumbers.length,
            serialNumbers,
          },
        ],
      }),
    );
  }

  async function recordSupplierReturn(input: {
    receipt: StoreLocalGoodsReceiptSummary;
    line: StoreLocalGoodsReceiptSummary["lines"][number];
    quantity: number;
    reason: StoreLocalSupplierReturnReason;
    serialNumbers: string[];
    externalReference: string | null;
    note: string | null;
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      setError("Enter a supplier return quantity greater than zero.");
      return;
    }

    const availableSerials = new Set(
      input.line.serialNumbers.map((serialNumber) =>
        serialNumber.toUpperCase(),
      ),
    );
    const invalidSerials = input.serialNumbers.filter(
      (serialNumber) => !availableSerials.has(serialNumber.toUpperCase()),
    );

    if (
      input.line.serialNumbers.length > 0 &&
      input.serialNumbers.length !== input.quantity
    ) {
      setError(
        "Select the exact received serial numbers being returned to the supplier.",
      );
      return;
    }

    if (invalidSerials.length > 0) {
      setError(
        `These serials were not on the selected GRN line: ${invalidSerials.join(", ")}.`,
      );
      return;
    }

    await runAction((desktopRuntime) =>
      desktopRuntime.recordSupplierReturn({
        goodsReceiptId: input.receipt.goodsReceiptId,
        externalReference: input.externalReference,
        reason: input.reason,
        note: input.note,
        operatorName: operatorName ?? undefined,
        lines: [
          {
            goodsReceiptLineId: input.line.goodsReceiptLineId,
            quantity: input.quantity,
            serialNumbers: input.serialNumbers,
          },
        ],
      }),
    );
  }

  async function issueInterStoreTransfer(
    transfer: StoreInterStoreTransferSummary,
    serialNumbers: string[] = [],
  ) {
    await runAction((desktopRuntime) =>
      desktopRuntime.issueInterStoreTransfer({
        transferId: transfer.transferId,
        quantity: transfer.isSerialized
          ? serialNumbers.length
          : transfer.outstandingIssueQuantity,
        serialNumbers,
        operatorName: operatorName ?? undefined,
      }),
    );
  }

  async function receiveInterStoreTransfer(
    transfer: StoreInterStoreTransferSummary,
    serialNumbers: string[] = [],
    quantity?: number,
  ) {
    await runAction((desktopRuntime) =>
      desktopRuntime.receiveInterStoreTransfer({
        transferId: transfer.transferId,
        quantity: transfer.isSerialized
          ? serialNumbers.length
          : (quantity ?? transfer.outstandingReceiptQuantity),
        serialNumbers,
        operatorName: operatorName ?? undefined,
      }),
    );
  }

  async function searchReceipts(options?: {
    receiptKind?: StoreReceiptHistoryKind;
    transactionFilter?: "ALL" | "CORRECTABLE" | "SALE" | "RETURN" | "EXCHANGE";
  }) {
    if (!runtime) {
      return;
    }

    const nextReceiptKind = options?.receiptKind ?? receiptHistoryKind;
    const transactionFilter =
      options?.transactionFilter ??
      (nextReceiptKind === "ACCOUNT_PAYMENT" ? "ALL" : "CORRECTABLE");

    setIsBusy(true);

    try {
      const results = await runtime.searchReceipts({
        query: receiptQuery,
        completedWithinDays: Number(receiptWindowDays),
        receiptKind: nextReceiptKind,
        transactionFilter,
        limit: 30,
      });
      setReceiptResults(results);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Receipt search failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  function renderDesktopConfigDialog() {
    if (!desktopConfigOpen) {
      return null;
    }

    const postgresConnection = parsePostgresConnectionString(
      desktopConfigDraft.databaseUrl,
    );
    const mssqlConnection = parseMssqlConnectionString(
      desktopConfigDraft.databaseUrl,
    );

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-config-dialog">
          <div className="rms-panel-title">
            <div>
              <span>Desktop setup</span>
              <h2>Terminal and store connection</h2>
            </div>
            <button
              className="rms-button"
              disabled={desktopConfigSaving}
              onClick={() => setDesktopConfigOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="rms-dialog-body">
            <div className="rms-config-grid">
              <label className="rms-field">
                <span>Deployment</span>
                <select
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "deploymentMode",
                      event.target
                        .value as StoreDesktopConnectionConfig["deploymentMode"],
                    )
                  }
                  value={desktopConfigDraft.deploymentMode}
                >
                  <option value="ENTERPRISE_MANAGED">HQ managed</option>
                  <option value="STANDALONE">Standalone</option>
                </select>
              </label>
              <label className="rms-field">
                <span>Runtime</span>
                <select
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "runtimeRole",
                      event.target
                        .value as StoreDesktopConnectionConfig["runtimeRole"],
                    )
                  }
                  value={desktopConfigDraft.runtimeRole}
                >
                  <option value="embedded">Single terminal</option>
                  <option value="store-server">Store database server</option>
                  <option value="terminal-client">Terminal client</option>
                </select>
              </label>
              <label className="rms-field">
                <span>Database</span>
                <select
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "databaseProvider",
                      event.target
                        .value as StoreDesktopConnectionConfig["databaseProvider"],
                    )
                  }
                  value={desktopConfigDraft.databaseProvider}
                >
                  <option value="sqlite">SQLite</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="mssql">SQL Server</option>
                </select>
              </label>
              <label className="rms-field">
                <span>Store node code</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft("nodeCode", event.target.value)
                  }
                  placeholder="store-accra-central-01"
                  value={desktopConfigDraft.nodeCode}
                />
              </label>
              <label className="rms-field">
                <span>Terminal code</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft("terminalCode", event.target.value)
                  }
                  value={desktopConfigDraft.terminalCode}
                />
              </label>
              <label className="rms-field">
                <span>Terminal name</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft("terminalName", event.target.value)
                  }
                  value={desktopConfigDraft.terminalName}
                />
              </label>
              <label className="rms-field is-wide">
                <span>Store server URL</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "storeServerUrl",
                      event.target.value,
                    )
                  }
                  placeholder="http://store-server:4747"
                  value={desktopConfigDraft.storeServerUrl}
                />
              </label>
              <label className="rms-field">
                <span>Server token</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "storeServerToken",
                      event.target.value,
                    )
                  }
                  type="password"
                  value={desktopConfigDraft.storeServerToken}
                />
              </label>
              <label className="rms-field">
                <span>Timeout ms</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "storeServerTimeoutMs",
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={desktopConfigDraft.storeServerTimeoutMs}
                />
              </label>
              <div className="rms-config-section is-wide">
                <div className="rms-config-section-title">
                  <span>Database configuration</span>
                  <strong>
                    {formatDatabaseProvider(desktopConfigDraft.databaseProvider)}
                  </strong>
                </div>
                {desktopConfigDraft.databaseProvider === "sqlite" ? (
                  <div className="rms-config-subgrid">
                    <label className="rms-field is-wide">
                      <span>SQLite database path</span>
                      <input
                        onChange={(event) =>
                          updateDesktopConfigDraft(
                            "databasePath",
                            event.target.value,
                          )
                        }
                        placeholder="D:\FlashERP\store\flash-erp-store.sqlite"
                        value={desktopConfigDraft.databasePath}
                      />
                    </label>
                    <label className="rms-field is-wide">
                      <span>User data folder</span>
                      <input
                        onChange={(event) =>
                          updateDesktopConfigDraft(
                            "userDataPath",
                            event.target.value,
                          )
                        }
                        placeholder="D:\FlashERP\store"
                        value={desktopConfigDraft.userDataPath}
                      />
                    </label>
                    <p className="rms-field-note is-wide">
                      Leave the database path blank to use the user data folder
                      default.
                    </p>
                  </div>
                ) : null}
                {desktopConfigDraft.databaseProvider === "postgres" ? (
                  <div className="rms-config-subgrid">
                    <label className="rms-field">
                      <span>Host</span>
                      <input
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "host",
                            event.target.value,
                          )
                        }
                        placeholder="localhost"
                        value={postgresConnection.host}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Port</span>
                      <input
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "port",
                            event.target.value,
                          )
                        }
                        placeholder="5432"
                        type="number"
                        value={postgresConnection.port}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Database</span>
                      <input
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "database",
                            event.target.value,
                          )
                        }
                        placeholder="rms_store"
                        value={postgresConnection.database}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Schema</span>
                      <input
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "schema",
                            event.target.value,
                          )
                        }
                        placeholder="public"
                        value={postgresConnection.schema}
                      />
                    </label>
                    <label className="rms-field">
                      <span>User</span>
                      <input
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "username",
                            event.target.value,
                          )
                        }
                        value={postgresConnection.username}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Password</span>
                      <input
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "password",
                            event.target.value,
                          )
                        }
                        type="password"
                        value={postgresConnection.password}
                      />
                    </label>
                    <label className="rms-field">
                      <span>SSL mode</span>
                      <select
                        onChange={(event) =>
                          updatePostgresConnectionDraft(
                            "sslMode",
                            event.target.value,
                          )
                        }
                        value={postgresConnection.sslMode}
                      >
                        <option value="">Default</option>
                        <option value="disable">Disable</option>
                        <option value="require">Require</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                {desktopConfigDraft.databaseProvider === "mssql" ? (
                  <div className="rms-config-subgrid">
                    <label className="rms-field">
                      <span>Server or instance</span>
                      <input
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "server",
                            event.target.value,
                          )
                        }
                        placeholder="localhost\sql2017"
                        value={mssqlConnection.server}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Port</span>
                      <input
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "port",
                            event.target.value,
                          )
                        }
                        placeholder="1433"
                        type="number"
                        value={mssqlConnection.port}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Database</span>
                      <input
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "database",
                            event.target.value,
                          )
                        }
                        placeholder="rms_store"
                        value={mssqlConnection.database}
                      />
                    </label>
                    <label className="rms-field">
                      <span>User ID</span>
                      <input
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "username",
                            event.target.value,
                          )
                        }
                        value={mssqlConnection.username}
                      />
                    </label>
                    <label className="rms-field">
                      <span>Password</span>
                      <input
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "password",
                            event.target.value,
                          )
                        }
                        type="password"
                        value={mssqlConnection.password}
                      />
                    </label>
                    <label className="rms-config-switch-field">
                      <input
                        checked={
                          mssqlConnection.encrypt.toLowerCase() === "true"
                        }
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "encrypt",
                            event.target.checked ? "true" : "false",
                          )
                        }
                        type="checkbox"
                      />
                      <span>Encrypt connection</span>
                    </label>
                    <label className="rms-config-switch-field">
                      <input
                        checked={
                          mssqlConnection.trustServerCertificate.toLowerCase() ===
                          "true"
                        }
                        onChange={(event) =>
                          updateMssqlConnectionDraft(
                            "trustServerCertificate",
                            event.target.checked ? "true" : "false",
                          )
                        }
                        type="checkbox"
                      />
                      <span>Trust server certificate</span>
                    </label>
                  </div>
                ) : null}
              </div>
              <label className="rms-field is-wide">
                <span>HQ sync URL</span>
                <input
                  disabled={desktopConfigDraft.deploymentMode === "STANDALONE"}
                  onChange={(event) =>
                    updateDesktopConfigDraft("syncBaseUrl", event.target.value)
                  }
                  placeholder={
                    desktopConfigDraft.deploymentMode === "STANDALONE"
                      ? "Disabled in standalone"
                      : "https://hq.example.com"
                  }
                  value={desktopConfigDraft.syncBaseUrl}
                />
              </label>
              <label className="rms-field is-wide">
                <span>Update feed URL</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "updateFeedUrl",
                      event.target.value,
                    )
                  }
                  placeholder="https://updates.example.com/store-desktop/"
                  value={desktopConfigDraft.updateFeedUrl}
                />
              </label>
              <label className="rms-field">
                <span>Server host</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "storeServerHost",
                      event.target.value,
                    )
                  }
                  value={desktopConfigDraft.storeServerHost}
                />
              </label>
              <label className="rms-field">
                <span>Server port</span>
                <input
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "storeServerPort",
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={desktopConfigDraft.storeServerPort}
                />
              </label>
              <label className="rms-check-field">
                <input
                  checked={desktopConfigDraft.storeServerEnabled}
                  onChange={(event) =>
                    updateDesktopConfigDraft(
                      "storeServerEnabled",
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
                <span>Start LAN store service on this machine</span>
              </label>
            </div>
            <div className="rms-config-path">
              <span>Config file</span>
              <strong>{desktopConfigResult?.configPath ?? "Not loaded"}</strong>
            </div>
            <p className="rms-helper-text">
              Provision the selected store database first. In HQ managed mode,
              restart, sync sign-in data, sign in, then sync the remaining HQ
              setup. In standalone mode, create the local administrator and
              maintain setup data on this desktop.
            </p>
          </div>

          <div className="rms-dialog-actions">
            <button
              className="rms-button"
              disabled={
                isSyncRunning ||
                desktopConfigSaving ||
                !runtime ||
                desktopConfigDraft.deploymentMode === "STANDALONE"
              }
              onClick={() => void syncSignInData()}
              type="button"
            >
              Sync sign-in data
            </button>
            <button
              className="rms-button"
              disabled={desktopConfigSaving || !runtime}
              onClick={() => void provisionDesktopStoreDatabase()}
              type="button"
            >
              Provision fresh DB
            </button>
            <button
              className="rms-button"
              disabled={desktopConfigSaving}
              onClick={() => void saveDesktopConfig(false)}
              type="button"
            >
              Save
            </button>
            <button
              className="rms-button is-primary"
              disabled={desktopConfigSaving}
              onClick={() => void saveDesktopConfig(true)}
              type="button"
            >
              Save and restart
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!runtime) {
    return (
      <main
        className="rms-lock-screen"
        style={getLoginBackgroundStyle(snapshot)}
      >
        <section className="rms-login-card">
          <button
            aria-label="Configure terminal"
            className="rms-login-logo-button"
            onClick={() => void openDesktopConfig()}
            type="button"
          >
            <CompanyLogo className="rms-login-logo" snapshot={snapshot} />
          </button>
          <h1>Flash ERP Desktop</h1>
          <p>Desktop runtime is unavailable.</p>
        </section>
        {renderDesktopConfigDialog()}
      </main>
    );
  }

  if (licenseBlockMessage) {
    return (
      <main
        className="rms-lock-screen"
        style={getLoginBackgroundStyle(snapshot)}
      >
        <section className="rms-login-brand">
          <strong className="rms-login-title">
            {snapshot?.retailOrgName?.trim() || "Flash ERP"}
          </strong>
          <div className="rms-login-meta">
            <StatusPill>{snapshot?.storeName ?? "Store"}</StatusPill>
            <StatusPill>{snapshot?.terminalCode ?? "Terminal"}</StatusPill>
            <StatusPill tone="bad">License locked</StatusPill>
          </div>
        </section>
        <section className="rms-login-card">
          <div className="rms-login-card-logo">
            <button
              aria-label="Configure terminal"
              className="rms-login-logo-button"
              onClick={() => void openDesktopConfig()}
              type="button"
            >
              <CompanyLogo className="rms-login-logo" snapshot={snapshot} />
            </button>
          </div>
          <div className="rms-login-card-heading">
            <span>{snapshot?.retailOrgName?.trim() || "Flash ERP"}</span>
            <h2>License Required</h2>
          </div>
          <FloatingAlerts error={licenseBlockMessage} notice={notice} />
          <div className="rms-login-actions">
            <button
              className="rms-button"
              disabled={isSyncRunning || !runtime}
              onClick={() => void syncSignInData()}
              type="button"
            >
              {isSyncRunning ? "Syncing..." : "Sync license"}
            </button>
            <button
              className="rms-button"
              onClick={() => void openDesktopConfig()}
              type="button"
            >
              Configure terminal
            </button>
          </div>
        </section>
        {renderDesktopConfigDialog()}
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main
        className="rms-lock-screen"
        style={getLoginBackgroundStyle(snapshot)}
      >
        <section className="rms-login-brand">
          <strong className="rms-login-title">
            {snapshot?.retailOrgName?.trim() || "Flash ERP"}
          </strong>
          <div className="rms-login-meta">
            <StatusPill>{snapshot?.storeName ?? "Store"}</StatusPill>
            <StatusPill>{snapshot?.terminalCode ?? "Terminal"}</StatusPill>
            {runtimeStatus && runtimeStatus.role !== "embedded" ? (
              <StatusPill tone={runtimeStatus.connected ? "good" : "bad"}>
                {formatRuntimeRole(runtimeStatus.role)}
              </StatusPill>
            ) : null}
          </div>
        </section>

        <section className="rms-login-card">
          <div className="rms-login-card-logo">
            <button
              aria-label="Configure terminal"
              className="rms-login-logo-button"
              onClick={() => void openDesktopConfig()}
              type="button"
            >
              <CompanyLogo className="rms-login-logo" snapshot={snapshot} />
            </button>
          </div>
          <div className="rms-login-card-heading">
            <span>{snapshot?.retailOrgName?.trim() || "Flash ERP"}</span>
            <h2>Welcome Back</h2>
          </div>

          <FloatingAlerts
            error={error}
            notice={notice}
            warning={licenseRenewalWarning}
          />

          <form
            className="rms-login-form"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <label>
              <span>Login ID</span>
              <div className="rms-login-field">
                <input
                  autoComplete="username"
                  autoFocus
                  onChange={(event) => setLoginId(event.target.value)}
                  placeholder="Enter your username"
                  ref={loginIdInputRef}
                  value={loginId}
                />
              </div>
            </label>
            <label>
              <div className="rms-login-label-row">
                <span>Password</span>
                <button
                  className="rms-login-link-button"
                  disabled={isBusy}
                  onClick={openEnterprisePasswordRecovery}
                  type="button"
                >
                  Change password
                </button>
              </div>
              <div className="rms-login-field">
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="rms-login-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <div className="rms-login-actions">
              <button
                className="rms-button is-primary rms-login-submit"
                disabled={isBusy || !loginId || !password}
                type="submit"
              >
                Sign in
              </button>
            </div>
          </form>
          {snapshot?.standaloneBootstrapAvailable ? (
            <form
              className="rms-login-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createStandaloneAdmin();
              }}
            >
              <div className="rms-login-card-heading">
                <span>Standalone setup</span>
                <h2>First Administrator</h2>
              </div>
              <label>
                <span>Login ID</span>
                <div className="rms-login-field">
                  <input
                    autoComplete="username"
                    onChange={(event) =>
                      setBootstrapAdminDraft((draft) => ({
                        ...draft,
                        loginId: event.target.value,
                      }))
                    }
                    value={bootstrapAdminDraft.loginId}
                  />
                </div>
              </label>
              <label>
                <span>Display name</span>
                <div className="rms-login-field">
                  <input
                    onChange={(event) =>
                      setBootstrapAdminDraft((draft) => ({
                        ...draft,
                        displayName: event.target.value,
                      }))
                    }
                    value={bootstrapAdminDraft.displayName}
                  />
                </div>
              </label>
              <label>
                <span>Email</span>
                <div className="rms-login-field">
                  <input
                    onChange={(event) =>
                      setBootstrapAdminDraft((draft) => ({
                        ...draft,
                        email: event.target.value,
                      }))
                    }
                    value={bootstrapAdminDraft.email}
                  />
                </div>
              </label>
              <label>
                <span>Password</span>
                <div className="rms-login-field">
                  <input
                    autoComplete="new-password"
                    onChange={(event) =>
                      setBootstrapAdminDraft((draft) => ({
                        ...draft,
                        password: event.target.value,
                      }))
                    }
                    type="password"
                    value={bootstrapAdminDraft.password}
                  />
                </div>
              </label>
              <div className="rms-login-actions">
                <button
                  className="rms-button is-primary rms-login-submit"
                  disabled={
                    isBusy ||
                    !bootstrapAdminDraft.loginId.trim() ||
                    !bootstrapAdminDraft.displayName.trim() ||
                    !bootstrapAdminDraft.password.trim()
                  }
                  type="submit"
                >
                  Create administrator
                </button>
              </div>
            </form>
          ) : null}
        </section>
        {renderDesktopConfigDialog()}
      </main>
    );
  }

  return (
    <div
      className={`rms-desktop${sidebarCollapsed ? " is-sidebar-collapsed" : ""}${
        snapshot?.touchModeEnabled === false ? "" : " is-touch-optimized"
      }`}
    >
      <aside className="rms-sidebar">
        <div className="rms-sidebar-brand">
          <CompanyLogo snapshot={snapshot} />
          <div className="rms-sidebar-copy">
            <strong>Flash ERP</strong>
            <small>{snapshot?.storeName}</small>
          </div>
          <button
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            className="rms-sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            type="button"
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
        </div>

        <nav className="rms-nav" aria-label="Desktop workspaces">
          {visibleWorkspaces.map((item) => {
            if (item.id === "setup" || item.id === "security") {
              const isSetupMenu = item.id === "setup";
              const parentActive = renderedWorkspace === item.id;
              const parentExpanded = isSetupMenu
                ? setupMenuExpanded
                : securityMenuExpanded;
              const children = isSetupMenu
                ? standaloneSetupItems
                : standaloneSecurityItems;

              return (
                <div className="rms-nav-parent" key={item.id}>
                  <button
                    aria-current={parentActive ? "page" : undefined}
                    aria-expanded={parentExpanded}
                    className={parentActive ? "is-active" : ""}
                    onClick={() => {
                      if (!parentActive) {
                        if (isSetupMenu) {
                          openSetupSection(activeSetupSection);
                        } else {
                          openSecuritySection(activeSecuritySection);
                        }
                        return;
                      }

                      if (isSetupMenu) {
                        setSetupMenuExpanded((expanded) => !expanded);
                      } else {
                        setSecurityMenuExpanded((expanded) => !expanded);
                      }
                    }}
                    type="button"
                  >
                    <SidebarIcon name={item.icon} />
                    <strong>
                      <span className="rms-nav-abbrev">
                        {item.label.slice(0, 1)}
                      </span>
                      <span className="rms-nav-label">{item.label}</span>
                    </strong>
                    <span
                      aria-hidden="true"
                      className={`rms-nav-chevron${
                        parentExpanded ? " is-open" : ""
                      }`}
                    >
                      ›
                    </span>
                  </button>
                  {parentExpanded && !sidebarCollapsed ? (
                    <div className="rms-nav-children">
                      {children.map((child) => (
                        <button
                          aria-current={
                            parentActive &&
                            (isSetupMenu
                              ? activeSetupSection === child.id
                              : activeSecuritySection === child.id)
                              ? "page"
                              : undefined
                          }
                          className={
                            parentActive &&
                            (isSetupMenu
                              ? activeSetupSection === child.id
                              : activeSecuritySection === child.id)
                              ? "is-active"
                              : ""
                          }
                          key={child.id}
                          onClick={() => {
                            if (isSetupMenu) {
                              openSetupSection(child.id as StandaloneSetupSection);
                            } else {
                              openSecuritySection(
                                child.id as StandaloneSecuritySection,
                              );
                            }
                          }}
                          type="button"
                        >
                          <SidebarIcon name={child.icon} />
                          <strong>
                            <span className="rms-nav-label">
                              {child.label}
                            </span>
                          </strong>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <button
                aria-current={renderedWorkspace === item.id ? "page" : undefined}
                className={renderedWorkspace === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => switchWorkspace(item.id)}
                type="button"
              >
                <SidebarIcon name={item.icon} />
                <strong>
                  <span className="rms-nav-abbrev">{item.label.slice(0, 1)}</span>
                  <span className="rms-nav-label">{item.label}</span>
                </strong>
              </button>
            );
          })}
        </nav>

        <div className="rms-sidebar-status">
          <span>Operator</span>
          <strong>{snapshot?.activeOperatorSession?.displayName}</strong>
          <small>{snapshot?.activeOperatorSession?.roleNames.join(", ")}</small>
          <button
            className="rms-button is-ghost rms-log-out-button"
            disabled={isBusy}
            onClick={() => void signOutCurrentOperator()}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="rms-log-out-icon"
              viewBox="0 0 24 24"
            >
              <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
              <path d="M14 16l4-4-4-4" />
              <path d="M18 12H9" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <section className="rms-main">
        <header className="rms-topbar">
          <div>
            <span className="rms-kicker">{renderedTopbarItem.detail}</span>
            <h1>{renderedTopbarItem.label}</h1>
          </div>
          <div className="rms-topbar-meta">
            {activeShift ? (
              <StatusPill tone={activeShiftOwnedByOperator ? "good" : "warn"}>
                {`${activeShift.shiftNo} · ${activeShift.cashierCode}`}
              </StatusPill>
            ) : null}
            {activeShift ? (
              <StatusPill>{`Shift sales ${formatMoney(activeShift.netSalesAmount)}`}</StatusPill>
            ) : null}
            {activeShift ? (
              <StatusPill>{`Expected cash ${formatMoney(activeShift.expectedCashAmount)}`}</StatusPill>
            ) : null}
            {activeShift ? (
              <StatusPill>{`Account pay ${formatMoney(activeShift.accountPaymentsAmount)}`}</StatusPill>
            ) : null}
            {snapshot ? (
              <StatusPill>{`Open orders ${formatNumber(snapshot.operationsMetrics.openSalesOrders)}`}</StatusPill>
            ) : null}
            {runtimeStatus && runtimeStatus.role !== "embedded" ? (
              <StatusPill tone={runtimeStatus.connected ? "good" : "bad"}>
                {formatRuntimeRole(runtimeStatus.role)}
              </StatusPill>
            ) : null}
            {isStandaloneDeployment(snapshot) ? (
              <StatusPill tone="good">Standalone</StatusPill>
            ) : null}
            <StatusPill>{snapshot?.nodeCode ?? "Node"}</StatusPill>
            <StatusPill>{localClock}</StatusPill>
            <button
              className="rms-button is-compact is-warning"
              disabled={isBusy}
              onClick={lockScreen}
              type="button"
            >
              <span aria-hidden="true" className="rms-lock-symbol">
                🔒
              </span>
              Lock
            </button>
          </div>
        </header>

        <FloatingAlerts
          error={error}
          notice={notice}
          warning={
            licenseRenewalWarning ??
            (renderedWorkspace === "pos" ? posLaneBlockMessage : null)
          }
        />

        {renderedWorkspace === "dashboard" ? (
          <DashboardWorkspace
            activeShift={activeShift}
            dashboardDateFrom={dashboardDateFrom}
            dashboardDateTo={dashboardDateTo}
            dashboardReport={dashboardReport}
            openInventory={() => switchWorkspace("inventory")}
            openPos={() => switchWorkspace("pos")}
            openReports={() => switchWorkspace("reports")}
            refreshDashboard={() => void loadDashboardReport()}
            setDashboardDateFrom={setDashboardDateFrom}
            setDashboardDateTo={setDashboardDateTo}
            snapshot={snapshot}
          />
        ) : null}

        {renderedWorkspace === "pos" ? (
          <POSWorkspace
            activeBasket={activeBasket}
            activeShift={activeShift}
            accountCustomerQuery={accountCustomerQuery}
            accountCustomers={accountCustomers}
            accountPanelOpen={accountPanelOpen}
            accountPaymentAmount={accountPaymentAmount}
            accountPaymentBankAccountId={accountPaymentBankAccountId}
            accountPaymentNote={accountPaymentNote}
            accountPaymentReference={accountPaymentReference}
            accountPaymentTenderMethodCode={accountPaymentTenderMethodCode}
            accountTenderMethods={accountTenderMethods}
            canUsePosLane={!posLaneBlockMessage}
            addCatalogItem={addCatalogItem}
            addScannedItem={addScannedItem}
            attachCustomer={attachCustomer}
            browseCatalog={browseCatalog}
            catalogCategory={catalogCategory}
            catalogDepartment={catalogDepartment}
            catalogItems={catalogItems}
            catalogQuery={catalogQuery}
            categoriesForDepartment={categoriesForDepartment}
            checkoutBasket={checkoutBasket}
            cancelSalesOrder={cancelSalesOrder}
            clearSaleScreen={clearSaleScreen}
            fulfilSalesOrder={fulfilSalesOrder}
            customerQuery={customerQuery}
            customers={customers}
            isBusy={isBusy}
            isVoidReviewBasket={isVoidReviewBasket}
            itemSuggestions={itemSuggestions}
            lineQuantityDrafts={lineQuantityDrafts}
            openPriceDraft={openPriceDraft}
            paymentDrafts={paymentDrafts}
            salesOrderDepositAmount={salesOrderDepositAmount}
            salesOrderDepositReference={salesOrderDepositReference}
            salesOrderDepositTenderCode={salesOrderDepositTenderCode}
            saleMode={saleMode}
            cashierReport={cashierReport}
            reportPanelOpen={reportPanelOpen}
            reportDateFrom={reportDateFrom}
            reportDateTo={reportDateTo}
            reportCustomerQuery={reportCustomerQuery}
            reportProductQuery={reportProductQuery}
            receiptPanelOpen={receiptPanelOpen}
            receiptHistoryKind={receiptHistoryKind}
            receiptLineQuantityDrafts={receiptLineQuantityDrafts}
            receiptLineSerialDrafts={receiptLineSerialDrafts}
            receiptLookup={receiptLookup}
            receiptQuery={receiptQuery}
            receiptResults={receiptResults}
            receiptWindowDays={receiptWindowDays}
            heldSalePanelOpen={heldSalePanelOpen}
            heldSaleQuery={heldSaleQuery}
            heldSaleWindowDays={heldSaleWindowDays}
            salesOrderPanelOpen={salesOrderPanelOpen}
            salesOrderQuery={salesOrderQuery}
            salesOrderWindowDays={salesOrderWindowDays}
            scanQuery={scanQuery}
            scanQuantity={scanQuantity}
            searchCustomers={searchCustomers}
            searchReceipts={searchReceipts}
            searchAccountCustomers={searchAccountCustomers}
            selectedCustomer={selectedCustomer}
            selectedAccountCustomer={selectedAccountCustomer}
            setAccountCustomerQuery={setAccountCustomerQuery}
            setAccountPanelOpen={setAccountPanelOpen}
            setAccountPaymentAmount={setAccountPaymentAmount}
            setAccountPaymentBankAccountId={setAccountPaymentBankAccountId}
            setAccountPaymentNote={setAccountPaymentNote}
            setAccountPaymentReference={setAccountPaymentReference}
            setAccountPaymentTenderMethodCode={
              setAccountPaymentTenderMethodCode
            }
            setCatalogCategory={setCatalogCategory}
            setCatalogDepartment={setCatalogDepartment}
            setCatalogQuery={setCatalogQuery}
            setCustomerQuery={setCustomerQuery}
            setSaleMode={setSaleMode}
            setSalesOrderDepositAmount={setSalesOrderDepositAmount}
            setSalesOrderDepositReference={setSalesOrderDepositReference}
            setSalesOrderDepositTenderCode={setSalesOrderDepositTenderCode}
            setSelectedAccountCustomer={setSelectedAccountCustomer}
            setLineQuantityDrafts={setLineQuantityDrafts}
            setOpenPriceDraft={setOpenPriceDraft}
            setPaymentDrafts={setPaymentDrafts}
            setReportPanelOpen={setReportPanelOpen}
            setReportDateFrom={setReportDateFrom}
            setReportDateTo={setReportDateTo}
            setReportCustomerQuery={setReportCustomerQuery}
            setReportProductQuery={setReportProductQuery}
            setReceiptPanelOpen={setReceiptPanelOpen}
            setReceiptHistoryKind={setReceiptHistoryKind}
            setReceiptLineQuantityDrafts={setReceiptLineQuantityDrafts}
            setReceiptLineSerialDrafts={setReceiptLineSerialDrafts}
            setReceiptQuery={setReceiptQuery}
            setReceiptWindowDays={setReceiptWindowDays}
            setHeldSalePanelOpen={setHeldSalePanelOpen}
            setHeldSaleQuery={setHeldSaleQuery}
            setHeldSaleWindowDays={setHeldSaleWindowDays}
            setSalesOrderPanelOpen={setSalesOrderPanelOpen}
            setSalesOrderQuery={setSalesOrderQuery}
            setSalesOrderWindowDays={setSalesOrderWindowDays}
            setScanQuery={setScanQuery}
            setScanQuantity={setScanQuantity}
            setShiftCloseDialogOpen={setShiftCloseDialogOpen}
            setShiftDeclaredCash={setShiftDeclaredCash}
            setShiftOpeningFloat={handleShiftOpeningFloatChange}
            setTransactionDetails={setTransactionDetails}
            setTransactionDetailsOpen={setTransactionDetailsOpen}
            setTransactionReference={setTransactionReference}
            setTransactionReferenceSearchDismissed={
              setTransactionReferenceSearchDismissed
            }
            snapshot={snapshot}
            shiftDeclaredCash={shiftDeclaredCash}
            shiftOpeningFloat={shiftOpeningFloat}
            tenderMethods={tenderMethods}
            transactionDetails={transactionDetails}
            transactionDetailsOpen={transactionDetailsOpen}
            transactionReference={transactionReference}
            transactionReferenceMatches={transactionReferenceMatches}
            transactionReferenceSearchAttempted={
              transactionReferenceSearchAttempted
            }
            transactionReferenceSearchPending={
              transactionReferenceSearchPending
            }
            addReceiptLineToBasket={addReceiptLineToBasket}
            addPaymentRow={addPaymentRow}
            applyPosDiscountRate={applyPosDiscountRate}
            activateSalesOrderMode={activateSalesOrderMode}
            closeShift={closeShift}
            loadStoreReport={loadStoreReport}
            openShift={openShift}
            printShiftReport={printShiftReport}
            printAccountPaymentReceipt={printAccountPaymentReceipt}
            printReceipt={printReceipt}
            printSalesOrderReceipt={printSalesOrderReceipt}
            recordAccountPayment={recordAccountPayment}
            removePaymentRow={removePaymentRow}
            resumeHeldSale={resumeHeldSale}
            runAction={runAction}
            saveSalesOrderBasket={saveSalesOrderBasket}
            startReturnFromReceipt={startReturnFromReceipt}
            startExchangeFromReceipt={startExchangeFromReceipt}
            submitOpenPriceDraft={submitOpenPriceDraft}
            updateBasketLineQuantity={updateBasketLineQuantity}
            voidReceipt={voidReceipt}
          />
        ) : null}

        {renderedWorkspace === "setup" ? (
          <StandaloneSetupWorkspace
            activeSection={activeSetupSection}
            browseCatalog={browseCatalog}
            catalogItems={catalogItems}
            isBusy={isBusy}
            loadCustomers={loadSetupCustomers}
            runAction={runAction}
            snapshot={snapshot}
          />
        ) : null}

        {renderedWorkspace === "security" ? (
          <StandaloneSecurityWorkspace
            activeSection={activeSecuritySection}
            isBusy={isBusy}
            runAction={runAction}
            snapshot={snapshot}
          />
        ) : null}

        {renderedWorkspace === "inventory" ? (
          <InventoryWorkspace
            browseAvailableSerialNumbers={browseAvailableSerialNumbers}
            browseInventory={browseInventory}
            createStandalonePurchaseOrder={createStandalonePurchaseOrder}
            createTransferRequest={createTransferRequest}
            inventorySerialDraft={inventorySerialDraft}
            inventoryItems={inventoryItems}
            inventoryLocation={inventoryLocation}
            inventoryQuery={inventoryQuery}
            issueInterStoreTransfer={issueInterStoreTransfer}
            isBusy={isBusy}
            lookupRemoteInventory={lookupRemoteInventory}
            purchaseOrders={purchaseOrders}
            receiveInterStoreTransfer={receiveInterStoreTransfer}
            receivePurchaseOrder={receivePurchaseOrder}
            receiveSerializedPurchaseOrderLine={
              receiveSerializedPurchaseOrderLine
            }
            recordSupplierReturn={recordSupplierReturn}
            remoteInventoryItemFilter={remoteInventoryItemFilter}
            remoteInventoryLocationFilter={remoteInventoryLocationFilter}
            remoteInventoryQuery={remoteInventoryQuery}
            remoteInventoryRows={remoteInventoryRows}
            remoteInventoryStoreFilter={remoteInventoryStoreFilter}
            requestRemoteStock={requestRemoteStock}
            saveStockCount={saveStockCount}
            submitTransferRequestDraft={submitTransferRequestDraft}
            submitStockCount={submitStockCount}
            commitStockCount={commitStockCount}
            setInventoryLocation={setInventoryLocation}
            setInventoryQuery={setInventoryQuery}
            setInventorySerialDraft={setInventorySerialDraft}
            setError={setError}
            setRemoteInventoryItemFilter={setRemoteInventoryItemFilter}
            setRemoteInventoryLocationFilter={setRemoteInventoryLocationFilter}
            setRemoteInventoryQuery={setRemoteInventoryQuery}
            setRemoteInventoryStoreFilter={setRemoteInventoryStoreFilter}
            setStockCountNote={setStockCountNote}
            setStockCountProductCode={setStockCountProductCode}
            setStockCountQuantity={setStockCountQuantity}
            setStockCountRows={setStockCountRows}
            setTransferDestinationLocation={setTransferDestinationLocation}
            setTransferProductCode={setTransferProductCode}
            setTransferQuantity={setTransferQuantity}
            setTransferSourceLocation={setTransferSourceLocation}
            snapshot={snapshot}
            stockCountNote={stockCountNote}
            stockCountProductCode={stockCountProductCode}
            stockCountQuantity={stockCountQuantity}
            stockCountRows={stockCountRows}
            transferDestinationLocation={transferDestinationLocation}
            transferProductCode={transferProductCode}
            transferQuantity={transferQuantity}
            transferSourceLocation={transferSourceLocation}
            transfers={transfers}
          />
        ) : null}

        {renderedWorkspace === "manager" ? (
          <ManagerWorkspace
            activeShift={activeShift}
            activeShiftOwnedByOperator={activeShiftOwnedByOperator}
            capabilities={capabilities}
            bankingAmount={bankingAmount}
            bankingBankAccountId={bankingBankAccountId}
            bankingBankName={bankingBankName}
            bankingReconciliationId={bankingReconciliationId}
            bankingReference={bankingReference}
            closeShift={closeShift}
            eodDeclaredCash={eodDeclaredCash}
            eodNote={eodNote}
            isBusy={isBusy}
            managerReportPanelOpen={managerReportPanelOpen}
            managerShiftId={managerShiftId}
            openShift={openShift}
            printShiftReport={printShiftReport}
            recordBanking={recordBanking}
            recordEod={recordEod}
            runAction={runAction}
            loadStoreReport={loadStoreReport}
            setBankingAmount={setBankingAmount}
            setBankingBankAccountId={setBankingBankAccountId}
            setBankingBankName={setBankingBankName}
            setBankingReconciliationId={setBankingReconciliationId}
            setBankingReference={setBankingReference}
            setEodDeclaredCash={setEodDeclaredCash}
            setEodNote={setEodNote}
            setManagerReportPanelOpen={setManagerReportPanelOpen}
            setManagerShiftId={setManagerShiftId}
            setReportCashierCode={setReportCashierCode}
            setReportCustomerQuery={setReportCustomerQuery}
            setReportDateFrom={setReportDateFrom}
            setReportDateTo={setReportDateTo}
            setReportProductQuery={setReportProductQuery}
            setShiftCloseDialogOpen={setShiftCloseDialogOpen}
            setShiftDeclaredCash={setShiftDeclaredCash}
            setShiftOpeningFloat={handleShiftOpeningFloatChange}
            shiftDeclaredCash={shiftDeclaredCash}
            shiftOpeningFloat={shiftOpeningFloat}
            snapshot={snapshot}
            reportCashierCode={reportCashierCode}
            reportCustomerQuery={reportCustomerQuery}
            reportDateFrom={reportDateFrom}
            reportDateTo={reportDateTo}
            reportProductQuery={reportProductQuery}
            storeReport={storeReport}
          />
        ) : null}

        {renderedWorkspace === "reversals" ? (
          <ReversalsWorkspace
            isBusy={isBusy}
            receiptQuery={receiptQuery}
            receiptResults={receiptResults}
            receiptWindowDays={receiptWindowDays}
            runAction={runAction}
            searchReceipts={searchReceipts}
            setReceiptQuery={setReceiptQuery}
            setReceiptWindowDays={setReceiptWindowDays}
            snapshot={snapshot}
            startReturnFromReceipt={startReturnFromReceipt}
            startExchangeFromReceipt={startExchangeFromReceipt}
          />
        ) : null}

        {renderedWorkspace === "reports" ? (
          <ReportsLandingWorkspace
            openReport={(workspace) => switchWorkspace(workspace)}
            visibleReportWorkspaces={visibleReportWorkspaces}
          />
        ) : null}

        {isReportWorkspace(renderedWorkspace) ? (
          <ReportWorkspaceView
            canFilterCashier={
              getReportWorkspaceItem(renderedWorkspace)?.scope === "STORE"
            }
            isBusy={isBusy}
            loadStoreReport={loadStoreReport}
            report={
              getReportWorkspaceItem(renderedWorkspace)?.scope === "STORE"
                ? storeReport
                : cashierReport
            }
            reportCashierCode={reportCashierCode}
            reportCustomerQuery={reportCustomerQuery}
            reportDateFrom={reportDateFrom}
            reportDateTo={reportDateTo}
            reportProductQuery={reportProductQuery}
            reportWorkspace={getReportWorkspaceItem(renderedWorkspace)!}
            setReportCashierCode={setReportCashierCode}
            setReportCustomerQuery={setReportCustomerQuery}
            setReportDateFrom={setReportDateFrom}
            setReportDateTo={setReportDateTo}
            setReportProductQuery={setReportProductQuery}
            snapshot={snapshot}
            onBack={() => switchWorkspace("reports")}
          />
        ) : null}

        {renderedWorkspace === "sync" ? (
          <SyncWorkspace
            checkDesktopUpdate={checkDesktopUpdate}
            desktopWindowStatus={desktopWindowStatus}
            desktopUpdateStatus={desktopUpdateStatus}
            installDesktopUpdate={installDesktopUpdate}
            isBusy={isBusy}
            isSyncRunning={isSyncRunning}
            recoverDesktopWindow={recoverDesktopWindow}
            refreshDesktopWindowStatus={refreshDesktopWindowStatus}
            refreshRuntimeStatus={async () => {
              const nextRuntimeStatus = await runtime.getStoreRuntimeStatus();
              setRuntimeStatus(nextRuntimeStatus);
              await refreshDesktopWindowStatus();
            }}
            runAction={runAction}
            runSyncCycle={runSyncAction}
            runtimeStatus={runtimeStatus}
            snapshot={snapshot}
          />
        ) : null}
      </section>
      {shiftCloseDialogOpen ? (
        <ShiftCloseDialog
          activeShift={activeShift}
          closeShift={closeShift}
          isBusy={isBusy}
          onClose={() => setShiftCloseDialogOpen(false)}
          setShiftDeclaredCash={setShiftDeclaredCash}
          shiftDeclaredCash={shiftDeclaredCash}
        />
      ) : null}
      {criticalStockDialogOpen ? (
        <CriticalStockDialog
          onClose={() => setCriticalStockDialogOpen(false)}
          openInventory={() => {
            setCriticalStockDialogOpen(false);
            switchWorkspace("inventory");
          }}
          rows={criticalStockRows}
        />
      ) : null}
      {isScreenLocked ? (
        <div className="rms-lock-overlay" role="dialog" aria-modal="true">
          <section className="rms-login-card rms-lock-card">
            <div className="rms-panel-title">
              <div>
                <span>Screen locked</span>
                <h2>Unlock desktop</h2>
              </div>
              <StatusPill tone="warn">Preserved</StatusPill>
            </div>
            <form
              className="rms-login-form"
              onSubmit={(event) => {
                event.preventDefault();
                void unlockScreen();
              }}
            >
              <label>
                <span>Login ID</span>
                <input
                  autoComplete="username"
                  onChange={(event) => setLockLoginId(event.target.value)}
                  value={lockLoginId}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  autoFocus
                  onChange={(event) => setLockPassword(event.target.value)}
                  ref={lockPasswordInputRef}
                  type="password"
                  value={lockPassword}
                />
              </label>
              <div className="rms-login-actions">
                <button
                  className="rms-button is-primary"
                  disabled={isBusy || !lockLoginId || !lockPassword}
                  type="submit"
                >
                  Unlock
                </button>
                <button
                  className="rms-button"
                  disabled={isBusy}
                  onClick={openEnterprisePasswordRecovery}
                  type="button"
                >
                  Change password
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function StandaloneProductEditorForm(props: {
  categories: StoreSyncSnapshot["productCategories"];
  departments: StoreSyncSnapshot["productDepartments"];
  formClassName?: string;
  isBusy: boolean;
  isEditing: boolean;
  productDraft: StandaloneProductDraft;
  setProductDraft: Dispatch<SetStateAction<StandaloneProductDraft>>;
  taxRows: Array<{ taxProfileCode: string; taxProfileName: string }>;
  units: string[];
  onNew: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const categoriesForDepartment = props.categories.filter(
    (category) =>
      !props.productDraft.departmentCode ||
      category.departmentCode === props.productDraft.departmentCode,
  );

  function selectProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const imageDataUrl = typeof reader.result === "string" ? reader.result : "";

      if (imageDataUrl) {
        props.setProductDraft((draft) => ({
          ...draft,
          primaryImageUrl: imageDataUrl,
        }));
      }
    });
    reader.readAsDataURL(file);
  }

  return (
    <form
      className={
        props.formClassName ??
        "rms-form-grid rms-product-editor-form rms-product-dialog-form"
      }
      onSubmit={props.onSubmit}
    >
      <div className="rms-product-dialog-header rms-form-span-all">
        <div>
          <span>Product record</span>
          <strong>
            {props.isEditing ? props.productDraft.productCode : "New product"}
          </strong>
        </div>
        <div className="rms-editor-actions-bar">
          <button
            className="rms-button is-primary is-compact"
            disabled={
              props.isBusy ||
              !props.productDraft.productCode.trim() ||
              !props.productDraft.productName.trim()
            }
            type="submit"
          >
            {props.isEditing ? "Update product" : "Save product"}
          </button>
          {props.isEditing ? (
            <button
              className="rms-button is-compact"
              onClick={props.onNew}
              type="button"
            >
              New product
            </button>
          ) : null}
        </div>
      </div>

      <div className="rms-product-dialog-layout rms-form-span-all">
        <section className="rms-product-form-section is-identity">
          <div className="rms-form-section-title">
            <span>Identity</span>
            <strong>Product identity</strong>
          </div>
          <label>
            <span>Product code</span>
            <input
              disabled={props.isEditing}
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  productCode: event.target.value,
                }))
              }
              value={props.productDraft.productCode}
            />
          </label>
          <label>
            <span>Product name</span>
            <input
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  productName: event.target.value,
                }))
              }
              value={props.productDraft.productName}
            />
          </label>
          <label>
            <span>Short name</span>
            <input
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  shortName: event.target.value,
                }))
              }
              value={props.productDraft.shortName}
            />
          </label>
          <label>
            <span>Barcode</span>
            <input
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  barcode: event.target.value,
                }))
              }
              value={props.productDraft.barcode}
            />
          </label>
          <label className="rms-form-span-all">
            <span>Description</span>
            <textarea
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  description: event.target.value,
                }))
              }
              rows={2}
              value={props.productDraft.description}
            />
          </label>
        </section>

        <section className="rms-product-form-section is-media">
          <div className="rms-form-section-title">
            <span>Image</span>
            <strong>Product image</strong>
          </div>
          <div className="rms-product-image-picker">
            <input
              accept="image/*"
              onChange={selectProductImage}
              ref={imageFileInputRef}
              type="file"
            />
            <div className="rms-product-image-preview">
              {props.productDraft.primaryImageUrl ? (
                <img
                  alt=""
                  src={props.productDraft.primaryImageUrl}
                />
              ) : (
                <span>No image</span>
              )}
            </div>
            <div className="rms-product-image-actions">
              <button
                className="rms-button is-compact"
                onClick={() => imageFileInputRef.current?.click()}
                type="button"
              >
                Browse image
              </button>
              {props.productDraft.primaryImageUrl ? (
                <button
                  className="rms-button is-compact"
                  onClick={() =>
                    props.setProductDraft((draft) => ({
                      ...draft,
                      primaryImageUrl: "",
                    }))
                  }
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rms-product-form-section">
          <div className="rms-form-section-title">
            <span>Catalog</span>
            <strong>Classification</strong>
          </div>
          <label>
            <span>Department</span>
            <select
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  departmentCode: event.target.value,
                  categoryCode: "",
                }))
              }
              value={props.productDraft.departmentCode}
            >
              <option value="">None</option>
              {props.departments.map((department) => (
                <option
                  key={department.departmentCode}
                  value={department.departmentCode}
                >
                  {department.departmentName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  categoryCode: event.target.value,
                }))
              }
              value={props.productDraft.categoryCode}
            >
              <option value="">None</option>
              {categoriesForDepartment.map((category) => (
                <option key={category.categoryCode} value={category.categoryCode}>
                  {category.categoryName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Subcategory</span>
            <input
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  subcategory: event.target.value,
                }))
              }
              value={props.productDraft.subcategory}
            />
          </label>
          <label>
            <span>Unit</span>
            <select
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  unitOfMeasure: event.target.value,
                }))
              }
              value={props.productDraft.unitOfMeasure}
            >
              {props.units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort order</span>
            <input
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  catalogSortOrder: event.target.value,
                }))
              }
              type="number"
              value={props.productDraft.catalogSortOrder}
            />
          </label>
        </section>

        <section className="rms-product-form-section">
          <div className="rms-form-section-title">
            <span>Pricing</span>
            <strong>Price and tax</strong>
          </div>
          <label>
            <span>Unit price</span>
            <input
              min="0"
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  unitPrice: event.target.value,
                }))
              }
              step="0.01"
              type="number"
              value={props.productDraft.unitPrice}
            />
          </label>
          <label>
            <span>Tax profile</span>
            <select
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  taxProfileCode: event.target.value,
                }))
              }
              value={props.productDraft.taxProfileCode}
            >
              <option value="">No tax profile</option>
              {props.taxRows.map((tax) => (
                <option key={tax.taxProfileCode} value={tax.taxProfileCode}>
                  {tax.taxProfileName}
                </option>
              ))}
            </select>
          </label>
          <div className="rms-form-switch-strip is-compact">
            <label className="rms-check-field">
              <input
                checked={props.productDraft.taxable}
                onChange={(event) =>
                  props.setProductDraft((draft) => ({
                    ...draft,
                    taxable: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Taxable</span>
            </label>
            <label className="rms-check-field">
              <input
                checked={props.productDraft.mustEnterPriceAtPos}
                onChange={(event) =>
                  props.setProductDraft((draft) => ({
                    ...draft,
                    mustEnterPriceAtPos: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Price at POS</span>
            </label>
          </div>
        </section>

        <section className="rms-product-form-section is-stock">
          <div className="rms-form-section-title">
            <span>Stock</span>
            <strong>Inventory controls</strong>
          </div>
          <label>
            <span>Opening qty</span>
            <input
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  quantityOnHand: event.target.value,
                }))
              }
              step="0.001"
              type="number"
              value={props.productDraft.quantityOnHand}
            />
          </label>
          <label>
            <span>Min stock</span>
            <input
              min="0"
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  minStockLevel: event.target.value,
                }))
              }
              step="0.001"
              type="number"
              value={props.productDraft.minStockLevel}
            />
          </label>
          <label>
            <span>Reorder point</span>
            <input
              min="0"
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  reorderPoint: event.target.value,
                }))
              }
              step="0.001"
              type="number"
              value={props.productDraft.reorderPoint}
            />
          </label>
          <label>
            <span>Safety stock</span>
            <input
              min="0"
              onChange={(event) =>
                props.setProductDraft((draft) => ({
                  ...draft,
                  safetyStockLevel: event.target.value,
                }))
              }
              step="0.001"
              type="number"
              value={props.productDraft.safetyStockLevel}
            />
          </label>
          <div className="rms-form-switch-strip is-compact">
            <label className="rms-check-field">
              <input
                checked={props.productDraft.trackInventory}
                onChange={(event) =>
                  props.setProductDraft((draft) => ({
                    ...draft,
                    trackInventory: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Track stock</span>
            </label>
            <label className="rms-check-field">
              <input
                checked={props.productDraft.isSerialized}
                onChange={(event) =>
                  props.setProductDraft((draft) => ({
                    ...draft,
                    isSerialized: event.target.checked,
                    trackInventory: true,
                  }))
                }
                type="checkbox"
              />
              <span>Serialized</span>
            </label>
          </div>
        </section>
      </div>
    </form>
  );
}

function StandaloneSetupWorkspace(props: {
  activeSection: StandaloneSetupSection;
  snapshot: StoreSyncSnapshot | null;
  catalogItems: StoreCatalogBrowseItem[];
  browseCatalog: () => Promise<void>;
  isBusy: boolean;
  loadCustomers: () => Promise<StoreCustomerSummary[]>;
  runAction: (
    action: (desktopRuntime: DesktopRuntimeApi) => Promise<StoreSyncActionResult>,
  ) => Promise<StoreSyncActionResult | null>;
}) {
  const [settingsDraft, setSettingsDraft] = useState({
    storeName: props.snapshot?.storeName ?? "",
    shortName: "",
    currencyCode: props.snapshot?.receiptSettings.currencyCode ?? "GHS",
    timezone: props.snapshot?.receiptSettings.timezone ?? "Africa/Accra",
    touchModeEnabled: props.snapshot?.touchModeEnabled ?? true,
    showCriticalStocksOnStartup:
      props.snapshot?.optionSettings.showCriticalStocksOnStartup ?? true,
    companyLogoUrl: props.snapshot?.companyLogoUrl ?? "",
    receiptHeader: props.snapshot?.receiptSettings.receiptHeader ?? "",
    receiptFooter: props.snapshot?.receiptSettings.receiptFooter ?? "",
  });
  const [storeLogoDraftChanged, setStoreLogoDraftChanged] = useState(false);
  const [departmentDraft, setDepartmentDraft] = useState({
    departmentCode: "",
    departmentName: "",
    sortOrder: "0",
  });
  const [categoryDraft, setCategoryDraft] = useState({
    categoryCode: "",
    categoryName: "",
    departmentCode: "",
    sortOrder: "0",
  });
  const [unitDraft, setUnitDraft] = useState({
    uomCode: "EA",
    uomName: "Each",
    decimalPrecision: "0",
    allowFractionalSale: false,
  });
  const [taxDraft, setTaxDraft] = useState({
    taxProfileCode: "",
    taxProfileName: "",
    ratePercent: "0",
    isDefault: false,
    isTaxInclusive: false,
  });
  const [tenderDraft, setTenderDraft] = useState({
    tenderMethodCode: "",
    tenderMethodName: "",
    paymentMethod: "CASH",
    requiresReference: false,
    allowChange: true,
  });
  const [locationDraft, setLocationDraft] = useState({
    locationCode: "MAIN",
    locationName: "Main store",
    locationType: "STORE",
    status: "ACTIVE",
    warehouseCode: "",
    warehouseName: "",
    useForSalesDefault: true,
    useForReceivingDefault: true,
  });
  const [bankDraft, setBankDraft] = useState({
    bankAccountId: "",
    bankCode: "",
    bankName: "",
    branchCode: "MAIN",
    branchName: "Main branch",
    accountNumber: "",
    accountName: "",
    currencyCode: props.snapshot?.receiptSettings.currencyCode ?? "GHS",
  });
  const [supplierDraft, setSupplierDraft] = useState({
    supplierNo: "",
    supplierName: "",
    phone: "",
    email: "",
    taxNumber: "",
    addressLine1: "",
    city: "",
    countryCode: "GH",
    status: "ACTIVE",
  });
  const [priceDraft, setPriceDraft] = useState({
    priceListCode: "default-sell",
    priceListName: "Default selling price",
    productCode: "",
    unitPrice: "0",
    currencyCode: props.snapshot?.receiptSettings.currencyCode ?? "GHS",
    isDefault: true,
  });
  const [promotionDraft, setPromotionDraft] = useState(() =>
    createStandalonePromotionDraft(),
  );
  const [productDraft, setProductDraft] = useState<StandaloneProductDraft>(() =>
    createStandaloneProductDraft(),
  );
  const [customerDraft, setCustomerDraft] = useState({
    customerNo: "",
    fullName: "",
    customerType: "RETAIL",
    phone: "",
    email: "",
    addressLine1: "",
    city: "",
    countryCode: "GH",
    loyaltyEnrolled: false,
    loyaltyTier: "",
    loyaltyPointsBalance: "0",
    allowCreditSales: false,
    creditLimitAmount: "0",
    receivableBalanceAmount: "0",
    note: "",
    status: "ACTIVE",
  });
  const [operationTab, setOperationTab] = useState<"locations" | "banks" | "suppliers">(
    "locations",
  );
  const [pricingTab, setPricingTab] = useState<"prices" | "promotions">(
    "promotions",
  );
  const [promotionFormTab, setPromotionFormTab] =
    useState<StandalonePromotionEditorTab>("offer");
  const [entryDialog, setEntryDialog] = useState<string | null>(null);
  const [loadedCustomerRows, setLoadedCustomerRows] = useState<
    StoreCustomerSummary[] | null
  >(null);
  const [editingKeys, setEditingKeys] = useState<
    Partial<Record<
      | "location"
      | "bank"
      | "supplier"
      | "department"
      | "category"
      | "product"
      | "unit"
      | "tax"
      | "tender"
      | "price"
      | "promotion"
      | "user"
      | "customer",
      string
    >>
  >({});

  function markEditing(
    key: keyof typeof editingKeys,
    value: string | null | undefined,
  ) {
    setEditingKeys((current) => ({ ...current, [key]: value ?? "editing" }));
  }

  function isEditing(key: keyof typeof editingKeys) {
    return Boolean(editingKeys[key]);
  }

  function clearEditing(key: keyof typeof editingKeys) {
    setEditingKeys((current) => ({ ...current, [key]: undefined }));
  }

  function openEntryDialog(key: string) {
    setEntryDialog(key);
  }

  function closeEntryDialog() {
    setEntryDialog(null);
  }

  function entryFormClass(key: string, extraClassName = "") {
    return [
      "rms-form-grid",
      "rms-entry-dialog-form",
      entryDialog === key ? "is-open" : "",
      extraClassName,
    ]
      .filter(Boolean)
      .join(" ");
  }

  useEffect(() => {
    setSettingsDraft((current) => ({
      ...current,
      storeName: current.storeName || props.snapshot?.storeName || "",
      currencyCode:
        current.currencyCode || props.snapshot?.receiptSettings.currencyCode || "GHS",
      timezone:
        current.timezone || props.snapshot?.receiptSettings.timezone || "Africa/Accra",
      touchModeEnabled: props.snapshot?.touchModeEnabled ?? current.touchModeEnabled,
      showCriticalStocksOnStartup:
        props.snapshot?.optionSettings.showCriticalStocksOnStartup ??
        current.showCriticalStocksOnStartup,
      companyLogoUrl:
        current.companyLogoUrl || props.snapshot?.companyLogoUrl || "",
      receiptHeader:
        current.receiptHeader || props.snapshot?.receiptSettings.receiptHeader || "",
      receiptFooter:
        current.receiptFooter || props.snapshot?.receiptSettings.receiptFooter || "",
    }));
    setBankDraft((current) => ({
      ...current,
      currencyCode:
        current.currencyCode || props.snapshot?.receiptSettings.currencyCode || "GHS",
    }));
    setPriceDraft((current) => ({
      ...current,
      currencyCode:
        current.currencyCode || props.snapshot?.receiptSettings.currencyCode || "GHS",
    }));
  }, [
    props.snapshot?.storeName,
    props.snapshot?.touchModeEnabled,
    props.snapshot?.companyLogoUrl,
    props.snapshot?.receiptSettings.currencyCode,
    props.snapshot?.receiptSettings.timezone,
    props.snapshot?.optionSettings.showCriticalStocksOnStartup,
    props.snapshot?.receiptSettings.receiptHeader,
    props.snapshot?.receiptSettings.receiptFooter,
  ]);

  useEffect(() => {
    if (props.activeSection !== "customers") {
      return;
    }

    let disposed = false;

    void props.loadCustomers().then((rows) => {
      if (!disposed) {
        setLoadedCustomerRows(rows);
      }
    });

    return () => {
      disposed = true;
    };
  }, [
    props.activeSection,
    props.snapshot?.generatedAt,
    props.snapshot?.lastLocalWriteAt,
  ]);

  const departments = props.snapshot?.productDepartments ?? [];
  const categories = props.snapshot?.productCategories ?? [];
  const units = Array.from(
    new Set(["EA", unitDraft.uomCode, productDraft.unitOfMeasure]),
  ).filter(Boolean);
  const tenders = props.snapshot?.availableTenderMethods ?? [];
  const locations = props.snapshot?.inventoryLocations ?? [];
  const bankAccounts = props.snapshot?.availableBankAccounts ?? [];
  const suppliers =
    props.snapshot?.standaloneSuppliers ??
    props.snapshot?.availableSuppliers ??
    [];
  const priceListEntries = props.snapshot?.priceListEntries ?? [];
  const promotions = props.snapshot?.promotions ?? [];
  const customerRows = loadedCustomerRows ?? props.snapshot?.standaloneCustomers ?? [];
  const unitRows = units.map((unit) => ({
    uomCode: unit,
    uomName: unit,
    decimalPrecision: unit === unitDraft.uomCode ? Number(unitDraft.decimalPrecision) : 0,
    allowFractionalSale:
      unit === unitDraft.uomCode ? unitDraft.allowFractionalSale : false,
    status: "ACTIVE",
  }));
  const taxRows = Array.from(
    new Set([
      taxDraft.taxProfileCode || "VAT_STD",
      productDraft.taxProfileCode,
    ].filter(Boolean)),
  ).map((taxCode) => ({
    taxProfileCode: taxCode,
    taxProfileName:
      taxCode === taxDraft.taxProfileCode ? taxDraft.taxProfileName : taxCode,
    ratePercent:
      taxCode === taxDraft.taxProfileCode ? Number(taxDraft.ratePercent) : 0,
    isDefault: taxCode === taxDraft.taxProfileCode ? taxDraft.isDefault : false,
    isTaxInclusive:
      taxCode === taxDraft.taxProfileCode ? taxDraft.isTaxInclusive : false,
    status: "ACTIVE",
  }));
  const receiptTemplateRows = [
    {
      code: props.snapshot?.receiptSettings.salesReceiptTemplateCode ?? "sales-receipt",
      name: props.snapshot?.receiptSettings.salesReceiptTemplateName ?? "Sales receipt",
      type: "Sales",
      mode: props.snapshot?.receiptSettings.templateMode ?? "default",
      configured: Boolean(props.snapshot?.receiptSettings.salesReceiptTemplateHtml),
    },
    {
      code:
        props.snapshot?.receiptSettings.goodsReceiptTemplateCode ??
        "goods-receipt",
      name:
        props.snapshot?.receiptSettings.goodsReceiptTemplateName ??
        "Goods receipt",
      type: "Goods receipt",
      mode: props.snapshot?.receiptSettings.templateMode ?? "default",
      configured: Boolean(props.snapshot?.receiptSettings.goodsReceiptTemplateHtml),
    },
  ];
  const isStandalone = isStandaloneDeployment(props.snapshot);

  function onSubmit(event: FormEvent, work: () => void) {
    event.preventDefault();
    work();
    closeEntryDialog();
  }

  function exportProducts() {
    downloadTextFile(
      `flash-erp-products-${props.snapshot?.storeCode ?? "store"}.csv`,
      buildStandaloneProductCsv(props.catalogItems),
    );
  }

  async function importProducts(file: File | null) {
    if (!file) {
      return;
    }

    const rows = parseStandaloneProductCsv(await file.text());

    if (rows.length === 0) {
      return;
    }

    const result = await props.runAction(async (runtime) => {
      let lastResult: StoreSyncActionResult | null = null;

      for (const row of rows) {
        lastResult = await runtime.saveStandaloneProduct(row);
      }

      return {
        ...(lastResult as StoreSyncActionResult),
        message: `${formatNumber(rows.length)} product row(s) were imported into the standalone catalog.`,
      };
    });

    if (result) {
      await props.browseCatalog();
    }
  }

  function selectStoreLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const imageDataUrl = typeof reader.result === "string" ? reader.result : "";

      if (imageDataUrl) {
        setStoreLogoDraftChanged(true);
        setSettingsDraft((draft) => ({
          ...draft,
          companyLogoUrl: imageDataUrl,
        }));
      }
    });
    reader.readAsDataURL(file);
  }

  async function saveStoreLogoOverride() {
    const result = await props.runAction((runtime) =>
      runtime.saveLocalReceiptLogo({
        companyLogoUrl: settingsDraft.companyLogoUrl || null,
      }),
    );

    if (result) {
      setStoreLogoDraftChanged(false);
    }
  }

  if (!isStandalone) {
    return (
      <div className="rms-workspace">
        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Local receipt logo</span>
              <h2>Shop logo override</h2>
            </div>
            <StatusPill>{settingsDraft.companyLogoUrl ? "Configured" : "Default"}</StatusPill>
          </div>
          {settingsDraft.companyLogoUrl ? (
            <img
              alt="Store receipt logo preview"
              src={resolveProductImageUrl(
                settingsDraft.companyLogoUrl,
                props.snapshot,
              ) ?? ""}
              style={{
                display: "block",
                maxHeight: 64,
                maxWidth: 160,
                objectFit: "contain",
                marginBottom: 12,
              }}
            />
          ) : null}
          <div className="rms-editor-actions-bar">
            <label className="rms-button is-compact">
              Upload logo
              <input
                accept="image/*"
                hidden
                onChange={selectStoreLogo}
                type="file"
              />
            </label>
            <button
              className="rms-button is-primary is-compact"
              disabled={props.isBusy || !storeLogoDraftChanged}
              onClick={() => void saveStoreLogoOverride()}
              type="button"
            >
              Save local logo
            </button>
            {settingsDraft.companyLogoUrl ? (
              <button
                className="rms-button is-compact"
                onClick={() => {
                  setStoreLogoDraftChanged(true);
                  setSettingsDraft((draft) => ({
                    ...draft,
                    companyLogoUrl: "",
                  }));
                }}
                type="button"
              >
                Clear logo
              </button>
            ) : null}
          </div>
        </section>
        <section className="rms-panel">
          <EmptyState
            title="Standalone setup is off"
            detail="Switch this desktop to standalone deployment in Desktop setup before editing local master data."
          />
        </section>
      </div>
    );
  }

  return (
    <div className="rms-workspace rms-tabbed-workspace rms-standalone-setup-workspace">
      <div className="rms-tab-panel-stack">
        {props.activeSection === "shop" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Store</span>
              <h2>Shop settings</h2>
            </div>
            <StatusPill tone="good">Standalone</StatusPill>
          </div>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneSettings({
                    storeName: settingsDraft.storeName,
                    shortName: settingsDraft.shortName,
                    currencyCode: settingsDraft.currencyCode,
                    timezone: settingsDraft.timezone,
                    touchModeEnabled: settingsDraft.touchModeEnabled,
                    showCriticalStocksOnStartup:
                      settingsDraft.showCriticalStocksOnStartup,
                    ...(storeLogoDraftChanged
                      ? { companyLogoUrl: settingsDraft.companyLogoUrl }
                      : {}),
                    receiptHeader: settingsDraft.receiptHeader,
                    receiptFooter: settingsDraft.receiptFooter,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Shop name</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    storeName: event.target.value,
                  }))
                }
                value={settingsDraft.storeName}
              />
            </label>
            <label>
              <span>Short name</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    shortName: event.target.value,
                  }))
                }
                value={settingsDraft.shortName}
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    currencyCode: event.target.value,
                  }))
                }
                value={settingsDraft.currencyCode}
              />
            </label>
            <label>
              <span>Timezone</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    timezone: event.target.value,
                  }))
                }
                value={settingsDraft.timezone}
              />
            </label>
            <label className="rms-check-field">
              <input
                checked={settingsDraft.touchModeEnabled}
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    touchModeEnabled: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Touch mode</span>
            </label>
            <label className="rms-check-field">
              <input
                checked={settingsDraft.showCriticalStocksOnStartup}
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    showCriticalStocksOnStartup: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Critical stock popup</span>
            </label>
            <label className="rms-form-span-2">
              <span>Receipt header</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    receiptHeader: event.target.value,
                  }))
                }
                value={settingsDraft.receiptHeader}
              />
            </label>
            <label className="rms-form-span-2">
              <span>Receipt footer</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    receiptFooter: event.target.value,
                  }))
                }
                value={settingsDraft.receiptFooter}
              />
            </label>
            <button
              className="rms-button is-primary"
              disabled={props.isBusy || !settingsDraft.storeName.trim()}
              type="submit"
            >
              Save store
            </button>
          </form>
        </section>
          </div>
        ) : null}

        {props.activeSection === "operations" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Operations</span>
              <h2>Locations, banks, suppliers</h2>
            </div>
            <StatusPill>{`${formatNumber(locations.length)} loc`}</StatusPill>
          </div>
          <div className="rms-segmented-tabs" role="tablist">
            {[
              ["locations", "Locations"],
              ["banks", "Banks"],
              ["suppliers", "Suppliers"],
            ].map(([id, label]) => (
              <button
                className={operationTab === id ? "is-active" : ""}
                key={id}
                onClick={() => setOperationTab(id as typeof operationTab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {operationTab === "locations" ? (
            <>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("location", row.locationCode);
                      setLocationDraft({
                        locationCode: row.locationCode,
                        locationName: row.locationName,
                        locationType: row.locationType,
                        status: row.status,
                        warehouseCode: "",
                        warehouseName: "",
                        useForSalesDefault: row.defaults.includes("Sales"),
                        useForReceivingDefault: row.defaults.includes("Receiving"),
                      });
                      openEntryDialog("location");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.locationCode, width: "120px" },
                  { header: "Location", value: (row) => row.locationName },
                  { header: "Type", value: (row) => row.locationType, width: "130px" },
                  { header: "Defaults", value: (row) => row.defaults },
                  {
                    header: "On hand",
                    value: (row) => formatNumber(row.onHandQuantity),
                    exportValue: (row) => row.onHandQuantity,
                    width: "100px",
                  },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No locations have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-locations.csv`}
                filters={[
                  {
                    label: "Active",
                    value: "ACTIVE",
                    predicate: (row) => row.status === "ACTIVE",
                  },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("location");
                      setLocationDraft({
                        locationCode: "MAIN",
                        locationName: "Main store",
                        locationType: "STORE",
                        status: "ACTIVE",
                        warehouseCode: "",
                        warehouseName: "",
                        useForSalesDefault: true,
                        useForReceivingDefault: true,
                      });
                      openEntryDialog("location");
                    }}
                    type="button"
                  >
                    Add location
                  </button>
                }
                rows={locations}
                searchPlaceholder="Search locations"
              />
          <form
            className={entryFormClass("location")}
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneLocation({
                    locationCode: locationDraft.locationCode,
                    locationName: locationDraft.locationName,
                    locationType: locationDraft.locationType,
                    status: locationDraft.status,
                    useForSalesDefault: locationDraft.useForSalesDefault,
                    useForReceivingDefault:
                      locationDraft.useForReceivingDefault,
                    warehouseCode: locationDraft.warehouseCode,
                    warehouseName: locationDraft.warehouseName,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Location code</span>
              <input
                disabled={isEditing("location")}
                onChange={(event) =>
                  setLocationDraft((draft) => ({
                    ...draft,
                    locationCode: event.target.value,
                  }))
                }
                value={locationDraft.locationCode}
              />
            </label>
            <label>
              <span>Location name</span>
              <input
                onChange={(event) =>
                  setLocationDraft((draft) => ({
                    ...draft,
                    locationName: event.target.value,
                  }))
                }
                value={locationDraft.locationName}
              />
            </label>
            <label>
              <span>Type</span>
              <select
                onChange={(event) =>
                  setLocationDraft((draft) => ({
                    ...draft,
                    locationType: event.target.value,
                  }))
                }
                value={locationDraft.locationType}
              >
                <option value="STORE">Store</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="BACKROOM">Backroom</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                onChange={(event) =>
                  setLocationDraft((draft) => ({
                    ...draft,
                    status: event.target.value,
                  }))
                }
                value={locationDraft.status}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label>
              <span>Warehouse code</span>
              <input
                onChange={(event) =>
                  setLocationDraft((draft) => ({
                    ...draft,
                    warehouseCode: event.target.value,
                  }))
                }
                value={locationDraft.warehouseCode}
              />
            </label>
            <label>
              <span>Warehouse name</span>
              <input
                onChange={(event) =>
                  setLocationDraft((draft) => ({
                    ...draft,
                    warehouseName: event.target.value,
                  }))
                }
                value={locationDraft.warehouseName}
              />
            </label>
            <div className="rms-form-switch-strip is-compact">
              <label className="rms-check-field">
                <input
                  checked={locationDraft.useForSalesDefault}
                  onChange={(event) =>
                    setLocationDraft((draft) => ({
                      ...draft,
                      useForSalesDefault: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>Sales default</span>
              </label>
              <label className="rms-check-field">
                <input
                  checked={locationDraft.useForReceivingDefault}
                  onChange={(event) =>
                    setLocationDraft((draft) => ({
                      ...draft,
                      useForReceivingDefault: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>Receiving default</span>
              </label>
            </div>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !locationDraft.locationCode.trim() ||
                !locationDraft.locationName.trim()
              }
              type="submit"
            >
              {isEditing("location") ? "Update location" : "Save location"}
            </button>
            {isEditing("location") ? (
              <button
                className="rms-button"
                onClick={() => {
                  clearEditing("location");
                  setLocationDraft({
                    locationCode: "MAIN",
                    locationName: "Main store",
                    locationType: "STORE",
                    status: "ACTIVE",
                    warehouseCode: "",
                    warehouseName: "",
                    useForSalesDefault: true,
                    useForReceivingDefault: true,
                  });
                }}
                type="button"
              >
                New location
              </button>
            ) : null}
          </form>
            </>
          ) : null}
          {operationTab === "banks" ? (
            <>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("bank", row.bankAccountId);
                      setBankDraft({
                        bankAccountId: row.bankAccountId,
                        bankCode: row.bankCode,
                        bankName: row.bankName,
                        branchCode: row.branchCode,
                        branchName: row.branchName,
                        accountNumber: row.accountNumber,
                        accountName: row.accountName,
                        currencyCode: row.currencyCode,
                      });
                      openEntryDialog("bank");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Bank", value: (row) => row.bankName },
                  { header: "Branch", value: (row) => row.branchName },
                  { header: "Account", value: (row) => row.accountNumber },
                  { header: "Name", value: (row) => row.accountName },
                  { header: "Currency", value: (row) => row.currencyCode, width: "100px" },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No bank accounts have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-banks.csv`}
                filters={[
                  {
                    label: "Active",
                    value: "ACTIVE",
                    predicate: (row) => row.status === "ACTIVE",
                  },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("bank");
                      setBankDraft({
                        bankAccountId: "",
                        bankCode: "",
                        bankName: "",
                        branchCode: "MAIN",
                        branchName: "Main branch",
                        accountNumber: "",
                        accountName: "",
                        currencyCode:
                          props.snapshot?.receiptSettings.currencyCode ?? "GHS",
                      });
                      openEntryDialog("bank");
                    }}
                    type="button"
                  >
                    Add bank
                  </button>
                }
                rows={bankAccounts}
                searchPlaceholder="Search bank accounts"
              />
          <form
            className={entryFormClass("bank")}
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneBankAccount({
                    ...bankDraft,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Bank code</span>
              <input
                disabled={isEditing("bank")}
                onChange={(event) =>
                  setBankDraft((draft) => ({
                    ...draft,
                    bankCode: event.target.value,
                  }))
                }
                value={bankDraft.bankCode}
              />
            </label>
            <label>
              <span>Bank name</span>
              <input
                onChange={(event) =>
                  setBankDraft((draft) => ({
                    ...draft,
                    bankName: event.target.value,
                  }))
                }
                value={bankDraft.bankName}
              />
            </label>
            <label>
              <span>Branch</span>
              <input
                onChange={(event) =>
                  setBankDraft((draft) => ({
                    ...draft,
                    branchName: event.target.value,
                  }))
                }
                value={bankDraft.branchName}
              />
            </label>
            <label>
              <span>Account no</span>
              <input
                disabled={isEditing("bank")}
                onChange={(event) =>
                  setBankDraft((draft) => ({
                    ...draft,
                    accountNumber: event.target.value,
                  }))
                }
                value={bankDraft.accountNumber}
              />
            </label>
            <label>
              <span>Account name</span>
              <input
                onChange={(event) =>
                  setBankDraft((draft) => ({
                    ...draft,
                    accountName: event.target.value,
                  }))
                }
                value={bankDraft.accountName}
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                onChange={(event) =>
                  setBankDraft((draft) => ({
                    ...draft,
                    currencyCode: event.target.value,
                  }))
                }
                value={bankDraft.currencyCode}
              />
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !bankDraft.bankCode.trim() ||
                !bankDraft.bankName.trim() ||
                !bankDraft.accountNumber.trim() ||
                !bankDraft.accountName.trim()
              }
              type="submit"
            >
              {isEditing("bank") ? "Update bank" : "Save bank"}
            </button>
            {isEditing("bank") ? (
              <button
                className="rms-button"
                onClick={() => {
                  clearEditing("bank");
                  setBankDraft({
                    bankAccountId: "",
                    bankCode: "",
                    bankName: "",
                    branchCode: "MAIN",
                    branchName: "Main branch",
                    accountNumber: "",
                    accountName: "",
                    currencyCode:
                      props.snapshot?.receiptSettings.currencyCode ?? "GHS",
                  });
                }}
                type="button"
              >
                New bank
              </button>
            ) : null}
            <StatusPill>{`${formatNumber(bankAccounts.length)} bank`}</StatusPill>
          </form>
            </>
          ) : null}
          {operationTab === "suppliers" ? (
            <>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("supplier", row.supplierNo);
                      setSupplierDraft({
                        supplierNo: row.supplierNo,
                        supplierName: row.supplierName,
                        phone: row.phone ?? "",
                        email: row.email ?? "",
                        taxNumber: row.taxNumber ?? "",
                        addressLine1: row.addressLine1 ?? "",
                        city: row.city ?? "",
                        countryCode: row.countryCode ?? "GH",
                        status: row.status,
                      });
                      openEntryDialog("supplier");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Supplier", value: (row) => row.supplierName },
                  { header: "No", value: (row) => row.supplierNo, width: "130px" },
                  { header: "Phone", value: (row) => row.phone ?? "" },
                  { header: "Email", value: (row) => row.email ?? "" },
                  { header: "City", value: (row) => row.city ?? "", width: "120px" },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No suppliers have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-suppliers.csv`}
                filters={[
                  {
                    label: "Active",
                    value: "ACTIVE",
                    predicate: (row) => row.status === "ACTIVE",
                  },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("supplier");
                      setSupplierDraft({
                        supplierNo: "",
                        supplierName: "",
                        phone: "",
                        email: "",
                        taxNumber: "",
                        addressLine1: "",
                        city: "",
                        countryCode: "GH",
                        status: "ACTIVE",
                      });
                      openEntryDialog("supplier");
                    }}
                    type="button"
                  >
                    Add supplier
                  </button>
                }
                rows={suppliers}
                searchPlaceholder="Search suppliers"
              />
          <form
            className={entryFormClass("supplier")}
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneSupplier({
                    ...supplierDraft,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Supplier no</span>
              <input
                disabled={isEditing("supplier")}
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    supplierNo: event.target.value,
                  }))
                }
                value={supplierDraft.supplierNo}
              />
            </label>
            <label>
              <span>Supplier name</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    supplierName: event.target.value,
                  }))
                }
                value={supplierDraft.supplierName}
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    phone: event.target.value,
                  }))
                }
                value={supplierDraft.phone}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    email: event.target.value,
                  }))
                }
                value={supplierDraft.email}
              />
            </label>
            <label>
              <span>Tax no</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    taxNumber: event.target.value,
                  }))
                }
                value={supplierDraft.taxNumber}
              />
            </label>
            <label className="rms-form-span-2">
              <span>Address</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    addressLine1: event.target.value,
                  }))
                }
                value={supplierDraft.addressLine1}
              />
            </label>
            <label>
              <span>City</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    city: event.target.value,
                  }))
                }
                value={supplierDraft.city}
              />
            </label>
            <label>
              <span>Country</span>
              <input
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    countryCode: event.target.value,
                  }))
                }
                value={supplierDraft.countryCode}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                onChange={(event) =>
                  setSupplierDraft((draft) => ({
                    ...draft,
                    status: event.target.value,
                  }))
                }
                value={supplierDraft.status}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !supplierDraft.supplierNo.trim() ||
                !supplierDraft.supplierName.trim()
              }
              type="submit"
            >
              {isEditing("supplier") ? "Update supplier" : "Save supplier"}
            </button>
            {isEditing("supplier") ? (
              <button
                className="rms-button"
                onClick={() => {
                  clearEditing("supplier");
                  setSupplierDraft({
                    supplierNo: "",
                    supplierName: "",
                    phone: "",
                    email: "",
                    taxNumber: "",
                    addressLine1: "",
                    city: "",
                    countryCode: "GH",
                    status: "ACTIVE",
                  });
                }}
                type="button"
              >
                New supplier
              </button>
            ) : null}
            <StatusPill>{`${formatNumber(suppliers.length)} supplier`}</StatusPill>
          </form>
            </>
          ) : null}
        </section>
          </div>
        ) : null}

        {props.activeSection === "departments" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Departments</h2>
                </div>
                <StatusPill>{`${formatNumber(departments.length)} dept`}</StatusPill>
              </div>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("department", row.departmentCode);
                      setDepartmentDraft({
                        departmentCode: row.departmentCode,
                        departmentName: row.departmentName,
                        sortOrder: String(row.sortOrder),
                      });
                      openEntryDialog("department");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.departmentCode, width: "130px" },
                  { header: "Department", value: (row) => row.departmentName },
                  {
                    header: "Categories",
                    value: (row) => formatNumber(row.categoryCount),
                    exportValue: (row) => row.categoryCount,
                    width: "110px",
                  },
                  {
                    header: "Sort",
                    value: (row) => formatNumber(row.sortOrder),
                    exportValue: (row) => row.sortOrder,
                    width: "80px",
                  },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No departments have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-departments.csv`}
                filters={[
                  { label: "Active", value: "ACTIVE", predicate: (row) => row.status === "ACTIVE" },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("department");
                      setDepartmentDraft({
                        departmentCode: "",
                        departmentName: "",
                        sortOrder: "0",
                      });
                      openEntryDialog("department");
                    }}
                    type="button"
                  >
                    Add department
                  </button>
                }
                rows={departments}
                searchPlaceholder="Search departments"
              />
              <form
                className={entryFormClass("department")}
                onSubmit={(event) =>
                  onSubmit(event, () =>
                    void props.runAction((runtime) =>
                      runtime.saveStandaloneDepartment({
                        departmentCode: departmentDraft.departmentCode,
                        departmentName: departmentDraft.departmentName,
                        sortOrder: Number(departmentDraft.sortOrder),
                      }),
                    ),
                  )
                }
              >
                <label>
                  <span>Dept code</span>
                  <input
                    disabled={isEditing("department")}
                    onChange={(event) =>
                      setDepartmentDraft((draft) => ({
                        ...draft,
                        departmentCode: event.target.value,
                      }))
                    }
                    value={departmentDraft.departmentCode}
                  />
                </label>
                <label>
                  <span>Dept name</span>
                  <input
                    onChange={(event) =>
                      setDepartmentDraft((draft) => ({
                        ...draft,
                        departmentName: event.target.value,
                      }))
                    }
                    value={departmentDraft.departmentName}
                  />
                </label>
                <label>
                  <span>Sort</span>
                  <input
                    onChange={(event) =>
                      setDepartmentDraft((draft) => ({
                        ...draft,
                        sortOrder: event.target.value,
                      }))
                    }
                    type="number"
                    value={departmentDraft.sortOrder}
                  />
                </label>
                <button
                  className="rms-button is-primary"
                  disabled={
                    props.isBusy ||
                    !departmentDraft.departmentCode.trim() ||
                    !departmentDraft.departmentName.trim()
                  }
                  type="submit"
                >
                  {isEditing("department") ? "Update department" : "Save department"}
                </button>
                {isEditing("department") ? (
                  <button
                    className="rms-button"
                    onClick={() => {
                      clearEditing("department");
                      setDepartmentDraft({
                        departmentCode: "",
                        departmentName: "",
                        sortOrder: "0",
                      });
                    }}
                    type="button"
                  >
                    New department
                  </button>
                ) : null}
              </form>
            </section>
          </div>
        ) : null}

        {props.activeSection === "categories" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Categories</h2>
                </div>
                <StatusPill>{`${formatNumber(categories.length)} cat`}</StatusPill>
              </div>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("category", row.categoryCode);
                      setCategoryDraft({
                        categoryCode: row.categoryCode,
                        categoryName: row.categoryName,
                        departmentCode: row.departmentCode,
                        sortOrder: String(row.sortOrder),
                      });
                      openEntryDialog("category");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.categoryCode, width: "130px" },
                  { header: "Category", value: (row) => row.categoryName },
                  { header: "Department", value: (row) => row.departmentName },
                  {
                    header: "Sort",
                    value: (row) => formatNumber(row.sortOrder),
                    exportValue: (row) => row.sortOrder,
                    width: "80px",
                  },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No categories have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-categories.csv`}
                filters={departments.map((department) => ({
                  label: department.departmentName,
                  value: department.departmentCode,
                  predicate: (row: (typeof categories)[number]) =>
                    row.departmentCode === department.departmentCode,
                }))}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("category");
                      setCategoryDraft({
                        categoryCode: "",
                        categoryName: "",
                        departmentCode: "",
                        sortOrder: "0",
                      });
                      openEntryDialog("category");
                    }}
                    type="button"
                  >
                    Add category
                  </button>
                }
                rows={categories}
                searchPlaceholder="Search categories"
              />
              <form
                className={entryFormClass("category")}
                onSubmit={(event) =>
                  onSubmit(event, () =>
                    void props.runAction((runtime) =>
                      runtime.saveStandaloneCategory({
                        categoryCode: categoryDraft.categoryCode,
                        categoryName: categoryDraft.categoryName,
                        departmentCode: categoryDraft.departmentCode,
                        sortOrder: Number(categoryDraft.sortOrder),
                      }),
                    ),
                  )
                }
              >
                <label>
                  <span>Category code</span>
                  <input
                    disabled={isEditing("category")}
                    onChange={(event) =>
                      setCategoryDraft((draft) => ({
                        ...draft,
                        categoryCode: event.target.value,
                      }))
                    }
                    value={categoryDraft.categoryCode}
                  />
                </label>
                <label>
                  <span>Category name</span>
                  <input
                    onChange={(event) =>
                      setCategoryDraft((draft) => ({
                        ...draft,
                        categoryName: event.target.value,
                      }))
                    }
                    value={categoryDraft.categoryName}
                  />
                </label>
                <label>
                  <span>Department</span>
                  <select
                    onChange={(event) =>
                      setCategoryDraft((draft) => ({
                        ...draft,
                        departmentCode: event.target.value,
                      }))
                    }
                    value={categoryDraft.departmentCode}
                  >
                    <option value="">Select department</option>
                    {departments.map((department) => (
                      <option
                        key={department.departmentCode}
                        value={department.departmentCode}
                      >
                        {department.departmentName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Sort</span>
                  <input
                    onChange={(event) =>
                      setCategoryDraft((draft) => ({
                        ...draft,
                        sortOrder: event.target.value,
                      }))
                    }
                    type="number"
                    value={categoryDraft.sortOrder}
                  />
                </label>
                <button
                  className="rms-button is-primary"
                  disabled={
                    props.isBusy ||
                    !categoryDraft.categoryCode.trim() ||
                    !categoryDraft.categoryName.trim() ||
                    !categoryDraft.departmentCode
                  }
                  type="submit"
                >
                  {isEditing("category") ? "Update category" : "Save category"}
                </button>
                {isEditing("category") ? (
                  <button
                    className="rms-button"
                    onClick={() => {
                      clearEditing("category");
                      setCategoryDraft({
                        categoryCode: "",
                        categoryName: "",
                        departmentCode: "",
                        sortOrder: "0",
                      });
                    }}
                    type="button"
                  >
                    New category
                  </button>
                ) : null}
              </form>
            </section>
          </div>
        ) : null}

        {props.activeSection === "catalog" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Catalog</span>
              <h2>Departments and categories</h2>
            </div>
            <StatusPill>{`${formatNumber(departments.length)} dept`}</StatusPill>
          </div>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneDepartment({
                    departmentCode: departmentDraft.departmentCode,
                    departmentName: departmentDraft.departmentName,
                    sortOrder: Number(departmentDraft.sortOrder),
                  }),
                ),
              )
            }
          >
            <label>
              <span>Dept code</span>
              <input
                onChange={(event) =>
                  setDepartmentDraft((draft) => ({
                    ...draft,
                    departmentCode: event.target.value,
                  }))
                }
                value={departmentDraft.departmentCode}
              />
            </label>
            <label>
              <span>Dept name</span>
              <input
                onChange={(event) =>
                  setDepartmentDraft((draft) => ({
                    ...draft,
                    departmentName: event.target.value,
                  }))
                }
                value={departmentDraft.departmentName}
              />
            </label>
            <label>
              <span>Sort</span>
              <input
                onChange={(event) =>
                  setDepartmentDraft((draft) => ({
                    ...draft,
                    sortOrder: event.target.value,
                  }))
                }
                type="number"
                value={departmentDraft.sortOrder}
              />
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !departmentDraft.departmentCode.trim() ||
                !departmentDraft.departmentName.trim()
              }
              type="submit"
            >
              Save dept
            </button>
          </form>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneCategory({
                    categoryCode: categoryDraft.categoryCode,
                    categoryName: categoryDraft.categoryName,
                    departmentCode: categoryDraft.departmentCode,
                    sortOrder: Number(categoryDraft.sortOrder),
                  }),
                ),
              )
            }
          >
            <label>
              <span>Category code</span>
              <input
                onChange={(event) =>
                  setCategoryDraft((draft) => ({
                    ...draft,
                    categoryCode: event.target.value,
                  }))
                }
                value={categoryDraft.categoryCode}
              />
            </label>
            <label>
              <span>Category name</span>
              <input
                onChange={(event) =>
                  setCategoryDraft((draft) => ({
                    ...draft,
                    categoryName: event.target.value,
                  }))
                }
                value={categoryDraft.categoryName}
              />
            </label>
            <label>
              <span>Department</span>
              <select
                onChange={(event) =>
                  setCategoryDraft((draft) => ({
                    ...draft,
                    departmentCode: event.target.value,
                  }))
                }
                value={categoryDraft.departmentCode}
              >
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option
                    key={department.departmentCode}
                    value={department.departmentCode}
                  >
                    {department.departmentName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <input
                onChange={(event) =>
                  setCategoryDraft((draft) => ({
                    ...draft,
                    sortOrder: event.target.value,
                  }))
                }
                type="number"
                value={categoryDraft.sortOrder}
              />
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !categoryDraft.categoryCode.trim() ||
                !categoryDraft.categoryName.trim() ||
                !categoryDraft.departmentCode
              }
              type="submit"
            >
              Save category
            </button>
          </form>
        </section>
          </div>
        ) : null}

        {props.activeSection === "products" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Products</h2>
                </div>
                <StatusPill>{`${formatNumber(props.catalogItems.length)} item`}</StatusPill>
              </div>
              <div className="rms-export-buttons">
                <button
                  className="rms-button"
                  disabled={props.isBusy}
                  onClick={() => void props.browseCatalog()}
                  type="button"
                >
                  Refresh
                </button>
                <button
                  className="rms-button"
                  disabled={props.isBusy}
                  onClick={exportProducts}
                  type="button"
                >
                  Export CSV
                </button>
                <label className="rms-file-button">
                  Import CSV
                  <input
                    accept=".csv,.txt"
                    onChange={(event) => {
                      void importProducts(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
              </div>
              <StandaloneProductEditorForm
                categories={categories}
                departments={departments}
                formClassName={entryFormClass(
                  "product",
                  "rms-product-editor-form rms-product-dialog-form",
                )}
                isBusy={props.isBusy}
                isEditing={isEditing("product")}
                onNew={() => {
                  clearEditing("product");
                  setProductDraft(createStandaloneProductDraft());
                  closeEntryDialog();
                }}
                onSubmit={(event) =>
                  onSubmit(event, () => {
                    void (async () => {
                      const result = await props.runAction((runtime) =>
                        runtime.saveStandaloneProduct(
                          createStandaloneProductInput(productDraft),
                        ),
                      );

                      if (result) {
                        await props.browseCatalog();
                      }
                    })();
                  })
                }
                productDraft={productDraft}
                setProductDraft={setProductDraft}
                taxRows={taxRows}
                units={units}
              />
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("product", row.productCode);
                      setProductDraft(
                        createStandaloneProductDraftFromCatalogItem(row),
                      );
                      openEntryDialog("product");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  {
                    header: "Image",
                    value: (row) => (
                      <span className="rms-master-image-cell">
                        <ProductTileImage
                          imageUrl={row.primaryImageUrl}
                          productName={row.productName}
                          snapshot={props.snapshot}
                        />
                      </span>
                    ),
                    exportValue: (row) => (row.primaryImageUrl ? "Yes" : "No"),
                    searchValue: (row) =>
                      row.primaryImageUrl ? "has image" : "no image",
                    width: "70px",
                  },
                  { header: "Code", value: (row) => row.productCode, width: "130px" },
                  { header: "Product", value: (row) => row.productName },
                  { header: "Barcode", value: (row) => row.barcode ?? "" },
                  { header: "Department", value: (row) => row.departmentName ?? row.departmentCode ?? "" },
                  { header: "Unit", value: (row) => row.unitOfMeasure ?? "EA", width: "80px" },
                  {
                    header: "Tax",
                    value: (row) => row.taxProfileCode ?? (row.taxable === false ? "No" : ""),
                    width: "90px",
                  },
                  {
                    header: "Price",
                    value: (row) => formatMoney(row.unitPrice),
                    exportValue: (row) => row.unitPrice,
                    width: "110px",
                  },
                  {
                    header: "Qty",
                    value: (row) => formatNumber(row.quantityOnHand),
                    exportValue: (row) => row.quantityOnHand,
                    width: "90px",
                  },
                  {
                    header: "Stock",
                    value: (row) =>
                      row.trackInventory === false
                        ? "Not tracked"
                        : row.minStockLevel != null &&
                            row.quantityOnHand <= row.minStockLevel
                          ? "Low"
                          : "OK",
                    width: "110px",
                  },
                ]}
                emptyLabel="No products are loaded yet."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-products.csv`}
                filters={[
                  {
                    label: "Low stock",
                    value: "LOW_STOCK",
                    predicate: (row: StoreCatalogBrowseItem) =>
                      row.trackInventory !== false &&
                      row.minStockLevel != null &&
                      row.quantityOnHand <= row.minStockLevel,
                  },
                  {
                    label: "Serialized",
                    value: "SERIALIZED",
                    predicate: (row: StoreCatalogBrowseItem) => row.isSerialized,
                  },
                  {
                    label: "Manual price",
                    value: "MANUAL_PRICE",
                    predicate: (row: StoreCatalogBrowseItem) =>
                      row.mustEnterPriceAtPos,
                  },
                  ...departments.map((department) => ({
                    label: department.departmentName,
                    value: department.departmentCode,
                    predicate: (row: StoreCatalogBrowseItem) =>
                      row.departmentCode === department.departmentCode,
                  })),
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("product");
                      setProductDraft(createStandaloneProductDraft());
                      openEntryDialog("product");
                    }}
                    type="button"
                  >
                    Add product
                  </button>
                }
                rows={props.catalogItems}
                searchPlaceholder="Search products"
              />
            </section>
          </div>
        ) : null}

        {props.activeSection === "units" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Units</h2>
                </div>
                <StatusPill>{`${formatNumber(unitRows.length)} unit`}</StatusPill>
              </div>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("unit", row.uomCode);
                      setUnitDraft({
                        uomCode: row.uomCode,
                        uomName: row.uomName,
                        decimalPrecision: String(row.decimalPrecision),
                        allowFractionalSale: row.allowFractionalSale,
                      });
                      openEntryDialog("unit");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.uomCode, width: "120px" },
                  { header: "Unit", value: (row) => row.uomName },
                  {
                    header: "Decimals",
                    value: (row) => formatNumber(row.decimalPrecision),
                    exportValue: (row) => row.decimalPrecision,
                    width: "110px",
                  },
                  {
                    header: "Fractional",
                    value: (row) => (row.allowFractionalSale ? "Yes" : "No"),
                    width: "120px",
                  },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No units have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-units.csv`}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("unit");
                      setUnitDraft({
                        uomCode: "EA",
                        uomName: "Each",
                        decimalPrecision: "0",
                        allowFractionalSale: false,
                      });
                      openEntryDialog("unit");
                    }}
                    type="button"
                  >
                    Add unit
                  </button>
                }
                rows={unitRows}
                searchPlaceholder="Search units"
              />
              <form
                className={entryFormClass("unit")}
                onSubmit={(event) =>
                  onSubmit(event, () =>
                    void props.runAction((runtime) =>
                      runtime.saveStandaloneUnitOfMeasure({
                        uomCode: unitDraft.uomCode,
                        uomName: unitDraft.uomName,
                        decimalPrecision: Number(unitDraft.decimalPrecision),
                        allowFractionalSale: unitDraft.allowFractionalSale,
                      }),
                    ),
                  )
                }
              >
                <label>
                  <span>Unit code</span>
                  <input
                    disabled={isEditing("unit")}
                    onChange={(event) =>
                      setUnitDraft((draft) => ({ ...draft, uomCode: event.target.value }))
                    }
                    value={unitDraft.uomCode}
                  />
                </label>
                <label>
                  <span>Unit name</span>
                  <input
                    onChange={(event) =>
                      setUnitDraft((draft) => ({ ...draft, uomName: event.target.value }))
                    }
                    value={unitDraft.uomName}
                  />
                </label>
                <label>
                  <span>Decimals</span>
                  <input
                    onChange={(event) =>
                      setUnitDraft((draft) => ({ ...draft, decimalPrecision: event.target.value }))
                    }
                    type="number"
                    value={unitDraft.decimalPrecision}
                  />
                </label>
                <label className="rms-check-field">
                  <input
                    checked={unitDraft.allowFractionalSale}
                    onChange={(event) =>
                      setUnitDraft((draft) => ({
                        ...draft,
                        allowFractionalSale: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Fractional</span>
                </label>
                <button
                  className="rms-button is-primary"
                  disabled={props.isBusy || !unitDraft.uomCode.trim() || !unitDraft.uomName.trim()}
                  type="submit"
                >
                  {isEditing("unit") ? "Update unit" : "Save unit"}
                </button>
                {isEditing("unit") ? (
                  <button
                    className="rms-button"
                    onClick={() => {
                      clearEditing("unit");
                      setUnitDraft({
                        uomCode: "EA",
                        uomName: "Each",
                        decimalPrecision: "0",
                        allowFractionalSale: false,
                      });
                    }}
                    type="button"
                  >
                    New unit
                  </button>
                ) : null}
              </form>
            </section>
          </div>
        ) : null}

        {props.activeSection === "tax" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Tax</h2>
                </div>
                <StatusPill>{`${formatNumber(taxRows.length)} tax`}</StatusPill>
              </div>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("tax", row.taxProfileCode);
                      setTaxDraft({
                        taxProfileCode: row.taxProfileCode,
                        taxProfileName: row.taxProfileName,
                        ratePercent: String(row.ratePercent),
                        isDefault: row.isDefault,
                        isTaxInclusive: row.isTaxInclusive,
                      });
                      openEntryDialog("tax");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.taxProfileCode, width: "130px" },
                  { header: "Tax", value: (row) => row.taxProfileName },
                  {
                    header: "Rate",
                    value: (row) => `${formatNumber(row.ratePercent)}%`,
                    exportValue: (row) => row.ratePercent,
                    width: "100px",
                  },
                  { header: "Default", value: (row) => (row.isDefault ? "Yes" : "No"), width: "110px" },
                  { header: "Inclusive", value: (row) => (row.isTaxInclusive ? "Yes" : "No"), width: "110px" },
                ]}
                emptyLabel="No tax profiles have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-tax.csv`}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("tax");
                      setTaxDraft({
                        taxProfileCode: "",
                        taxProfileName: "",
                        ratePercent: "0",
                        isDefault: false,
                        isTaxInclusive: false,
                      });
                      openEntryDialog("tax");
                    }}
                    type="button"
                  >
                    Add tax
                  </button>
                }
                rows={taxRows}
                searchPlaceholder="Search tax profiles"
              />
              <form
                className={entryFormClass("tax")}
                onSubmit={(event) =>
                  onSubmit(event, () =>
                    void props.runAction((runtime) =>
                      runtime.saveStandaloneTaxProfile({
                        taxProfileCode: taxDraft.taxProfileCode,
                        taxProfileName: taxDraft.taxProfileName,
                        ratePercent: Number(taxDraft.ratePercent),
                        isDefault: taxDraft.isDefault,
                        isTaxInclusive: taxDraft.isTaxInclusive,
                      }),
                    ),
                  )
                }
              >
                <label>
                  <span>Tax code</span>
                  <input
                    disabled={isEditing("tax")}
                    onChange={(event) =>
                      setTaxDraft((draft) => ({ ...draft, taxProfileCode: event.target.value }))
                    }
                    value={taxDraft.taxProfileCode}
                  />
                </label>
                <label>
                  <span>Tax name</span>
                  <input
                    onChange={(event) =>
                      setTaxDraft((draft) => ({ ...draft, taxProfileName: event.target.value }))
                    }
                    value={taxDraft.taxProfileName}
                  />
                </label>
                <label>
                  <span>Rate %</span>
                  <input
                    onChange={(event) =>
                      setTaxDraft((draft) => ({ ...draft, ratePercent: event.target.value }))
                    }
                    type="number"
                    value={taxDraft.ratePercent}
                  />
                </label>
                <label className="rms-check-field">
                  <input
                    checked={taxDraft.isDefault}
                    onChange={(event) =>
                      setTaxDraft((draft) => ({ ...draft, isDefault: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  <span>Default</span>
                </label>
                <label className="rms-check-field">
                  <input
                    checked={taxDraft.isTaxInclusive}
                    onChange={(event) =>
                      setTaxDraft((draft) => ({ ...draft, isTaxInclusive: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  <span>Inclusive</span>
                </label>
                <button
                  className="rms-button is-primary"
                  disabled={
                    props.isBusy ||
                    !taxDraft.taxProfileCode.trim() ||
                    !taxDraft.taxProfileName.trim()
                  }
                  type="submit"
                >
                  {isEditing("tax") ? "Update tax" : "Save tax"}
                </button>
                {isEditing("tax") ? (
                  <button
                    className="rms-button"
                    onClick={() => {
                      clearEditing("tax");
                      setTaxDraft({
                        taxProfileCode: "",
                        taxProfileName: "",
                        ratePercent: "0",
                        isDefault: false,
                        isTaxInclusive: false,
                      });
                    }}
                    type="button"
                  >
                    New tax
                  </button>
                ) : null}
              </form>
            </section>
          </div>
        ) : null}

        {props.activeSection === "tenders" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Tender</h2>
                </div>
                <StatusPill>{`${formatNumber(tenders.length)} tender`}</StatusPill>
              </div>
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("tender", row.tenderMethodCode);
                      setTenderDraft({
                        tenderMethodCode: row.tenderMethodCode,
                        tenderMethodName: row.tenderMethodName,
                        paymentMethod: row.paymentMethod,
                        requiresReference: row.requiresReference,
                        allowChange: row.allowChange,
                      });
                      openEntryDialog("tender");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.tenderMethodCode, width: "130px" },
                  { header: "Tender", value: (row) => row.tenderMethodName },
                  { header: "Method", value: (row) => row.paymentMethod, width: "140px" },
                  { header: "Reference", value: (row) => (row.requiresReference ? "Yes" : "No"), width: "110px" },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No tender methods have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-tenders.csv`}
                filters={[
                  { label: "Cash", value: "CASH", predicate: (row) => row.paymentMethod === "CASH" },
                  { label: "Card", value: "CARD", predicate: (row) => row.paymentMethod === "CARD" },
                  {
                    label: "Mobile Money",
                    value: "MOBILE_MONEY",
                    predicate: (row) => row.paymentMethod === "MOBILE_MONEY",
                  },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("tender");
                      setTenderDraft({
                        tenderMethodCode: "",
                        tenderMethodName: "",
                        paymentMethod: "CASH",
                        requiresReference: false,
                        allowChange: true,
                      });
                      openEntryDialog("tender");
                    }}
                    type="button"
                  >
                    Add tender
                  </button>
                }
                rows={tenders}
                searchPlaceholder="Search tenders"
              />
              <form
                className={entryFormClass("tender")}
                onSubmit={(event) =>
                  onSubmit(event, () =>
                    void props.runAction((runtime) =>
                      runtime.saveStandaloneTenderMethod({
                        tenderMethodCode: tenderDraft.tenderMethodCode,
                        tenderMethodName: tenderDraft.tenderMethodName,
                        paymentMethod: tenderDraft.paymentMethod,
                        requiresReference: tenderDraft.requiresReference,
                        allowChange: tenderDraft.allowChange,
                      }),
                    ),
                  )
                }
              >
                <label>
                  <span>Tender code</span>
                  <input
                    disabled={isEditing("tender")}
                    onChange={(event) =>
                      setTenderDraft((draft) => ({
                        ...draft,
                        tenderMethodCode: event.target.value,
                      }))
                    }
                    value={tenderDraft.tenderMethodCode}
                  />
                </label>
                <label>
                  <span>Tender name</span>
                  <input
                    onChange={(event) =>
                      setTenderDraft((draft) => ({
                        ...draft,
                        tenderMethodName: event.target.value,
                      }))
                    }
                    value={tenderDraft.tenderMethodName}
                  />
                </label>
                <label>
                  <span>Method</span>
                  <select
                    onChange={(event) =>
                      setTenderDraft((draft) => ({ ...draft, paymentMethod: event.target.value }))
                    }
                    value={tenderDraft.paymentMethod}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="MOBILE_MONEY">Mobile money</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="rms-check-field">
                  <input
                    checked={tenderDraft.requiresReference}
                    onChange={(event) =>
                      setTenderDraft((draft) => ({
                        ...draft,
                        requiresReference: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Reference</span>
                </label>
                <button
                  className="rms-button is-primary"
                  disabled={
                    props.isBusy ||
                    !tenderDraft.tenderMethodCode.trim() ||
                    !tenderDraft.tenderMethodName.trim()
                  }
                  type="submit"
                >
                  {isEditing("tender") ? "Update tender" : "Save tender"}
                </button>
                {isEditing("tender") ? (
                  <button
                    className="rms-button"
                    onClick={() => {
                      clearEditing("tender");
                      setTenderDraft({
                        tenderMethodCode: "",
                        tenderMethodName: "",
                        paymentMethod: "CASH",
                        requiresReference: false,
                        allowChange: true,
                      });
                    }}
                    type="button"
                  >
                    New tender
                  </button>
                ) : null}
              </form>
            </section>
          </div>
        ) : null}

        {props.activeSection === "receipt-templates" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div>
                  <span>Master</span>
                  <h2>Receipt templates</h2>
                </div>
                <StatusPill>{props.snapshot?.receiptSettings.templateMode ?? "default"}</StatusPill>
              </div>
              <StandaloneRecordsGrid
                actions={() => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => openEntryDialog("receipt-template")}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Code", value: (row) => row.code },
                  { header: "Name", value: (row) => row.name },
                  { header: "Type", value: (row) => row.type, width: "150px" },
                  { header: "Mode", value: (row) => row.mode, width: "120px" },
                  {
                    header: "Configured",
                    value: (row) => (row.configured ? "Yes" : "No"),
                    width: "120px",
                  },
                ]}
                emptyLabel="No receipt template settings are available."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-receipt-templates.csv`}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => openEntryDialog("receipt-template")}
                    type="button"
                  >
                    Edit receipt text
                  </button>
                }
                rows={receiptTemplateRows}
                searchPlaceholder="Search receipt templates"
              />
              <form
                className={entryFormClass("receipt-template")}
                onSubmit={(event) =>
                  onSubmit(event, () =>
                    void props.runAction((runtime) =>
                      runtime.saveStandaloneSettings({
                        ...(storeLogoDraftChanged
                          ? { companyLogoUrl: settingsDraft.companyLogoUrl }
                          : {}),
                        receiptHeader: settingsDraft.receiptHeader,
                        receiptFooter: settingsDraft.receiptFooter,
                      }),
                    ),
                  )
                }
              >
                <div className="rms-form-span-2">
                  <span>Store logo</span>
                  {settingsDraft.companyLogoUrl ? (
                    <img
                      alt="Store receipt logo preview"
                      src={resolveProductImageUrl(
                        settingsDraft.companyLogoUrl,
                        props.snapshot,
                      ) ?? ""}
                      style={{
                        display: "block",
                        maxHeight: 64,
                        maxWidth: 160,
                        objectFit: "contain",
                        marginBottom: 8,
                      }}
                    />
                  ) : null}
                  <div className="rms-editor-actions-bar">
                    <label className="rms-button is-compact">
                      Upload logo
                      <input
                        accept="image/*"
                        hidden
                        onChange={selectStoreLogo}
                        type="file"
                      />
                    </label>
                    {settingsDraft.companyLogoUrl ? (
                      <button
                        className="rms-button is-compact"
                        onClick={() => {
                          setStoreLogoDraftChanged(true);
                          setSettingsDraft((draft) => ({
                            ...draft,
                            companyLogoUrl: "",
                          }));
                        }}
                        type="button"
                      >
                        Clear logo
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="rms-form-span-2">
                  <span>Receipt header</span>
                  <input
                    onChange={(event) =>
                      setSettingsDraft((draft) => ({
                        ...draft,
                        receiptHeader: event.target.value,
                      }))
                    }
                    value={settingsDraft.receiptHeader}
                  />
                </label>
                <label className="rms-form-span-2">
                  <span>Receipt footer</span>
                  <input
                    onChange={(event) =>
                      setSettingsDraft((draft) => ({
                        ...draft,
                        receiptFooter: event.target.value,
                      }))
                    }
                    value={settingsDraft.receiptFooter}
                  />
                </label>
                <button
                  className="rms-button is-primary is-compact"
                  disabled={props.isBusy}
                  type="submit"
                >
                  Save receipt text
                </button>
              </form>
            </section>
          </div>
        ) : null}

        {props.activeSection === "pricing" ? (
          <div className="rms-standalone-pricing-page" role="tabpanel">
        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Setup</span>
              <h2>Units, tax, tenders</h2>
            </div>
            <StatusPill>{`${formatNumber(tenders.length)} tender`}</StatusPill>
          </div>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneUnitOfMeasure({
                    uomCode: unitDraft.uomCode,
                    uomName: unitDraft.uomName,
                    decimalPrecision: Number(unitDraft.decimalPrecision),
                    allowFractionalSale: unitDraft.allowFractionalSale,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Unit code</span>
              <input
                onChange={(event) =>
                  setUnitDraft((draft) => ({
                    ...draft,
                    uomCode: event.target.value,
                  }))
                }
                value={unitDraft.uomCode}
              />
            </label>
            <label>
              <span>Unit name</span>
              <input
                onChange={(event) =>
                  setUnitDraft((draft) => ({
                    ...draft,
                    uomName: event.target.value,
                  }))
                }
                value={unitDraft.uomName}
              />
            </label>
            <label>
              <span>Decimals</span>
              <input
                onChange={(event) =>
                  setUnitDraft((draft) => ({
                    ...draft,
                    decimalPrecision: event.target.value,
                  }))
                }
                type="number"
                value={unitDraft.decimalPrecision}
              />
            </label>
            <label className="rms-check-field">
              <input
                checked={unitDraft.allowFractionalSale}
                onChange={(event) =>
                  setUnitDraft((draft) => ({
                    ...draft,
                    allowFractionalSale: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Fractional</span>
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !unitDraft.uomCode.trim() ||
                !unitDraft.uomName.trim()
              }
              type="submit"
            >
              Save unit
            </button>
          </form>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneTaxProfile({
                    taxProfileCode: taxDraft.taxProfileCode,
                    taxProfileName: taxDraft.taxProfileName,
                    ratePercent: Number(taxDraft.ratePercent),
                    isDefault: taxDraft.isDefault,
                    isTaxInclusive: taxDraft.isTaxInclusive,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Tax code</span>
              <input
                onChange={(event) =>
                  setTaxDraft((draft) => ({
                    ...draft,
                    taxProfileCode: event.target.value,
                  }))
                }
                value={taxDraft.taxProfileCode}
              />
            </label>
            <label>
              <span>Tax name</span>
              <input
                onChange={(event) =>
                  setTaxDraft((draft) => ({
                    ...draft,
                    taxProfileName: event.target.value,
                  }))
                }
                value={taxDraft.taxProfileName}
              />
            </label>
            <label>
              <span>Rate %</span>
              <input
                onChange={(event) =>
                  setTaxDraft((draft) => ({
                    ...draft,
                    ratePercent: event.target.value,
                  }))
                }
                type="number"
                value={taxDraft.ratePercent}
              />
            </label>
            <label className="rms-check-field">
              <input
                checked={taxDraft.isDefault}
                onChange={(event) =>
                  setTaxDraft((draft) => ({
                    ...draft,
                    isDefault: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Default</span>
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !taxDraft.taxProfileCode.trim() ||
                !taxDraft.taxProfileName.trim()
              }
              type="submit"
            >
              Save tax
            </button>
          </form>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneTenderMethod({
                    tenderMethodCode: tenderDraft.tenderMethodCode,
                    tenderMethodName: tenderDraft.tenderMethodName,
                    paymentMethod: tenderDraft.paymentMethod,
                    requiresReference: tenderDraft.requiresReference,
                    allowChange: tenderDraft.allowChange,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Tender code</span>
              <input
                onChange={(event) =>
                  setTenderDraft((draft) => ({
                    ...draft,
                    tenderMethodCode: event.target.value,
                  }))
                }
                value={tenderDraft.tenderMethodCode}
              />
            </label>
            <label>
              <span>Tender name</span>
              <input
                onChange={(event) =>
                  setTenderDraft((draft) => ({
                    ...draft,
                    tenderMethodName: event.target.value,
                  }))
                }
                value={tenderDraft.tenderMethodName}
              />
            </label>
            <label>
              <span>Method</span>
              <select
                onChange={(event) =>
                  setTenderDraft((draft) => ({
                    ...draft,
                    paymentMethod: event.target.value,
                  }))
                }
                value={tenderDraft.paymentMethod}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="rms-check-field">
              <input
                checked={tenderDraft.requiresReference}
                onChange={(event) =>
                  setTenderDraft((draft) => ({
                    ...draft,
                    requiresReference: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Reference</span>
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !tenderDraft.tenderMethodCode.trim() ||
                !tenderDraft.tenderMethodName.trim()
              }
              type="submit"
            >
              Save tender
            </button>
          </form>
        </section>

        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Catalog</span>
              <h2>Product master</h2>
            </div>
            <StatusPill>{`${formatNumber(props.snapshot?.operationsMetrics.catalogItems)} items`}</StatusPill>
          </div>
          <div className="rms-export-buttons">
            <button
              className="rms-button"
              disabled={props.isBusy}
              onClick={() => void props.browseCatalog()}
              type="button"
            >
              Refresh list
            </button>
            <button
              className="rms-button"
              disabled={props.isBusy}
              onClick={exportProducts}
              type="button"
            >
              Export CSV
            </button>
            <label className="rms-file-button">
              Import CSV
              <input
                accept=".csv,.txt"
                onChange={(event) => {
                  void importProducts(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          </div>
          <form
            className="rms-form-grid"
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneProduct(
                    createStandaloneProductInput(productDraft),
                  ),
                ),
              )
            }
          >
            <label>
              <span>Product code</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    productCode: event.target.value,
                  }))
                }
                value={productDraft.productCode}
              />
            </label>
            <label>
              <span>Product name</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    productName: event.target.value,
                  }))
                }
                value={productDraft.productName}
              />
            </label>
            <label>
              <span>Barcode</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    barcode: event.target.value,
                  }))
                }
                value={productDraft.barcode}
              />
            </label>
            <label>
              <span>Unit price</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    unitPrice: event.target.value,
                  }))
                }
                type="number"
                value={productDraft.unitPrice}
              />
            </label>
            <label>
              <span>Department</span>
              <select
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    departmentCode: event.target.value,
                    categoryCode: "",
                  }))
                }
                value={productDraft.departmentCode}
              >
                <option value="">None</option>
                {departments.map((department) => (
                  <option
                    key={department.departmentCode}
                    value={department.departmentCode}
                  >
                    {department.departmentName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Category</span>
              <select
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    categoryCode: event.target.value,
                  }))
                }
                value={productDraft.categoryCode}
              >
                <option value="">None</option>
                {categories
                  .filter(
                    (category) =>
                      !productDraft.departmentCode ||
                      category.departmentCode === productDraft.departmentCode,
                  )
                  .map((category) => (
                    <option
                      key={category.categoryCode}
                      value={category.categoryCode}
                    >
                      {category.categoryName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Unit</span>
              <select
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    unitOfMeasure: event.target.value,
                  }))
                }
                value={productDraft.unitOfMeasure}
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tax code</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    taxProfileCode: event.target.value,
                  }))
                }
                value={productDraft.taxProfileCode}
              />
            </label>
            <label>
              <span>Opening qty</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    quantityOnHand: event.target.value,
                  }))
                }
                type="number"
                value={productDraft.quantityOnHand}
              />
            </label>
            <label>
              <span>Min stock</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    minStockLevel: event.target.value,
                  }))
                }
                type="number"
                value={productDraft.minStockLevel}
              />
            </label>
            <label>
              <span>Sort</span>
              <input
                onChange={(event) =>
                  setProductDraft((draft) => ({
                    ...draft,
                    catalogSortOrder: event.target.value,
                  }))
                }
                type="number"
                value={productDraft.catalogSortOrder}
              />
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !productDraft.productCode.trim() ||
                !productDraft.productName.trim()
              }
              type="submit"
            >
              Save product
            </button>
          </form>
        </section>

        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Pricing</span>
              <h2>Prices and promotions</h2>
            </div>
            <StatusPill>{`${formatNumber(promotions.length)} promo`}</StatusPill>
          </div>
          <div className="rms-dashboard-mini-grid rms-standalone-summary-grid">
            <div className="rms-stat">
              <span>Price rows</span>
              <strong>{formatNumber(priceListEntries.length)}</strong>
            </div>
            <div className="rms-stat is-good">
              <span>Promotions</span>
              <strong>{formatNumber(promotions.length)}</strong>
            </div>
            <div className="rms-stat is-warn">
              <span>Coupon offers</span>
              <strong>
                {formatNumber(
                  promotions.filter((promotion) => promotion.couponRequired)
                    .length,
                )}
              </strong>
            </div>
            <div className="rms-stat is-slate">
              <span>Catalog items</span>
              <strong>{formatNumber(props.catalogItems.length)}</strong>
            </div>
          </div>
          <div className="rms-segmented-tabs rms-pricing-tabs" role="tablist">
            {[
              ["prices", "Price lists"],
              ["promotions", "Promotions"],
            ].map(([id, label]) => (
              <button
                className={pricingTab === id ? "is-active" : ""}
                key={id}
                onClick={() => setPricingTab(id as typeof pricingTab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {pricingTab === "prices" ? (
            <div className="rms-standalone-editor-grid">
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing(
                        "price",
                        `${row.priceListCode}:${row.productCode}`,
                      );
                      setPriceDraft({
                        priceListCode: row.priceListCode,
                        priceListName: row.priceListName,
                        productCode: row.productCode,
                        unitPrice: String(row.unitPrice),
                        currencyCode: row.currencyCode,
                        isDefault: row.isDefault,
                      });
                      openEntryDialog("price");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Price list", value: (row) => row.priceListName },
                  { header: "Code", value: (row) => row.priceListCode, width: "140px" },
                  { header: "Product", value: (row) => row.productCode },
                  {
                    header: "Price",
                    value: (row) => formatMoney(row.unitPrice),
                    exportValue: (row) => row.unitPrice,
                    width: "110px",
                  },
                  { header: "Currency", value: (row) => row.currencyCode, width: "100px" },
                  { header: "Default", value: (row) => (row.isDefault ? "Yes" : "No"), width: "100px" },
                ]}
                emptyLabel="No price list entries have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-prices.csv`}
                filters={[
                  {
                    label: "Default",
                    value: "DEFAULT",
                    predicate: (row) => row.isDefault,
                  },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("price");
                      setPriceDraft({
                        priceListCode: "default-sell",
                        priceListName: "Default selling price",
                        productCode: "",
                        unitPrice: "0",
                        currencyCode:
                          props.snapshot?.receiptSettings.currencyCode ?? "GHS",
                        isDefault: true,
                      });
                      openEntryDialog("price");
                    }}
                    type="button"
                  >
                    Add price
                  </button>
                }
                rows={priceListEntries}
                searchPlaceholder="Search prices"
              />
          <form
            className={entryFormClass("price", "rms-standalone-editor-form")}
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandalonePriceListEntry({
                    priceListCode: priceDraft.priceListCode,
                    priceListName: priceDraft.priceListName,
                    currencyCode: priceDraft.currencyCode,
                    productCode: priceDraft.productCode,
                    unitPrice: Number(priceDraft.unitPrice),
                    isDefault: priceDraft.isDefault,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Price list</span>
              <input
                disabled={isEditing("price")}
                onChange={(event) =>
                  setPriceDraft((draft) => ({
                    ...draft,
                    priceListCode: event.target.value,
                  }))
                }
                value={priceDraft.priceListCode}
              />
            </label>
            <label>
              <span>Name</span>
              <input
                onChange={(event) =>
                  setPriceDraft((draft) => ({
                    ...draft,
                    priceListName: event.target.value,
                  }))
                }
                value={priceDraft.priceListName}
              />
            </label>
            <label>
              <span>Product</span>
              <select
                disabled={isEditing("price")}
                onChange={(event) => {
                  const product = props.catalogItems.find(
                    (item) => item.productCode === event.target.value,
                  );
                  setPriceDraft((draft) => ({
                    ...draft,
                    productCode: event.target.value,
                    unitPrice:
                      product?.unitPrice == null
                        ? draft.unitPrice
                        : String(product.unitPrice),
                  }));
                }}
                value={priceDraft.productCode}
              >
                <option value="">Select product</option>
                {props.catalogItems.slice(0, 300).map((item) => (
                  <option key={item.productCode} value={item.productCode}>
                    {`${item.productCode} - ${item.productName}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Unit price</span>
              <input
                min="0"
                onChange={(event) =>
                  setPriceDraft((draft) => ({
                    ...draft,
                    unitPrice: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={priceDraft.unitPrice}
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                onChange={(event) =>
                  setPriceDraft((draft) => ({
                    ...draft,
                    currencyCode: event.target.value,
                  }))
                }
                value={priceDraft.currencyCode}
              />
            </label>
            <label className="rms-check-field">
              <input
                checked={priceDraft.isDefault}
                onChange={(event) =>
                  setPriceDraft((draft) => ({
                    ...draft,
                    isDefault: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Default POS price</span>
            </label>
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !priceDraft.productCode ||
                !priceDraft.priceListCode.trim()
              }
              type="submit"
            >
              {isEditing("price") ? "Update price" : "Save price"}
            </button>
            {isEditing("price") ? (
              <button
                className="rms-button"
                onClick={() => {
                  clearEditing("price");
                  setPriceDraft({
                    priceListCode: "default-sell",
                    priceListName: "Default selling price",
                    productCode: "",
                    unitPrice: "0",
                    currencyCode:
                      props.snapshot?.receiptSettings.currencyCode ?? "GHS",
                    isDefault: true,
                  });
                }}
                type="button"
              >
                New price
              </button>
            ) : null}
            <StatusPill>{`${formatNumber(priceListEntries.length)} prices`}</StatusPill>
          </form>
            </div>
          ) : null}
          {pricingTab === "promotions" ? (
            <div className="rms-standalone-editor-grid">
              <StandaloneRecordsGrid
                actions={(row) => (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      markEditing("promotion", row.promotionCode);
                      setPromotionDraft({
                        promotionCode: row.promotionCode,
                        promotionName: row.promotionName,
                        description: row.description ?? "",
                        discountType: row.discountType,
                        targetScope: row.targetScope,
                        discountValue: String(row.discountValue),
                        minimumBasketAmount:
                          row.minimumBasketAmount == null
                            ? ""
                            : String(row.minimumBasketAmount),
                        minimumLineQuantity:
                          row.minimumLineQuantity == null
                            ? ""
                            : String(row.minimumLineQuantity),
                        buyQuantity:
                          row.buyQuantity == null ? "" : String(row.buyQuantity),
                        rewardQuantity:
                          row.rewardQuantity == null
                            ? ""
                            : String(row.rewardQuantity),
                        targetDepartmentCode: row.targetDepartmentCode ?? "",
                        targetCategoryCode: row.targetCategoryCode ?? "",
                        targetProductCode: row.targetProductCode ?? "",
                        eligibleCustomerTypes: joinListDraft(
                          row.eligibleCustomerTypes,
                        ),
                        eligibleLoyaltyTiers: joinListDraft(
                          row.eligibleLoyaltyTiers,
                        ),
                        activeDaysOfWeek: row.activeDaysOfWeek ?? [],
                        activeFromTime: minutesToTimeDraft(row.activeFromMinutes),
                        activeToTime: minutesToTimeDraft(row.activeToMinutes),
                        couponRequired: row.couponRequired,
                        couponCode: row.couponCode ?? "",
                        allowWithLoyalty: row.allowWithLoyalty,
                        applyOncePerBasket: row.applyOncePerBasket,
                        priority: String(row.priority),
                        startAt: row.startAt?.slice(0, 10) ?? "",
                        endAt: row.endAt?.slice(0, 10) ?? "",
                        status: row.status,
                      });
                      setPromotionFormTab("offer");
                      openEntryDialog("promotion");
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                )}
                columns={[
                  { header: "Promotion", value: (row) => row.promotionName },
                  { header: "Code", value: (row) => row.promotionCode, width: "130px" },
                  { header: "Scope", value: (row) => row.targetScope, width: "140px" },
                  {
                    header: "Discount",
                    value: (row) =>
                      `${formatNumber(row.discountValue)} ${row.discountType}`,
                    exportValue: (row) => row.discountValue,
                    width: "140px",
                  },
                  {
                    header: "Coupon",
                    value: (row) => (row.couponRequired ? row.couponCode || "Required" : "No"),
                    width: "130px",
                  },
                  { header: "Status", value: (row) => row.status, width: "100px" },
                ]}
                emptyLabel="No promotions have been created."
                exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-promotions.csv`}
                filters={[
                  {
                    label: "Coupon",
                    value: "COUPON",
                    predicate: (row) => row.couponRequired,
                  },
                  {
                    label: "Automatic",
                    value: "AUTO",
                    predicate: (row) => !row.couponRequired,
                  },
                ]}
                primaryAction={
                  <button
                    className="rms-button is-primary is-compact"
                    onClick={() => {
                      clearEditing("promotion");
                      setPromotionDraft(createStandalonePromotionDraft());
                      setPromotionFormTab("offer");
                      openEntryDialog("promotion");
                    }}
                    type="button"
                  >
                    Add promo
                  </button>
                }
                rows={promotions}
                searchPlaceholder="Search promotions"
              />
          <form
            className={entryFormClass(
              "promotion",
              "rms-standalone-editor-form rms-promotion-editor-form",
            )}
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandalonePromotion({
                    promotionCode: promotionDraft.promotionCode,
                    promotionName: promotionDraft.promotionName,
                    description: promotionDraft.description,
                    discountType: promotionDraft.discountType,
                    targetScope: promotionDraft.targetScope,
                    discountValue: Number(promotionDraft.discountValue),
                    minimumBasketAmount: promotionDraft.minimumBasketAmount.trim()
                      ? Number(promotionDraft.minimumBasketAmount)
                      : null,
                    minimumLineQuantity: promotionDraft.minimumLineQuantity.trim()
                      ? Number(promotionDraft.minimumLineQuantity)
                      : null,
                    buyQuantity: promotionDraft.buyQuantity.trim()
                      ? Number(promotionDraft.buyQuantity)
                      : null,
                    rewardQuantity: promotionDraft.rewardQuantity.trim()
                      ? Number(promotionDraft.rewardQuantity)
                      : null,
                    targetDepartmentCode: promotionDraft.targetDepartmentCode,
                    targetCategoryCode: promotionDraft.targetCategoryCode,
                    targetProductCode: promotionDraft.targetProductCode,
                    eligibleCustomerTypes: csvListDraft(
                      promotionDraft.eligibleCustomerTypes,
                    ),
                    eligibleLoyaltyTiers: csvListDraft(
                      promotionDraft.eligibleLoyaltyTiers,
                    ),
                    activeDaysOfWeek: promotionDraft.activeDaysOfWeek,
                    activeFromMinutes: timeDraftToMinutes(
                      promotionDraft.activeFromTime,
                    ),
                    activeToMinutes: timeDraftToMinutes(
                      promotionDraft.activeToTime,
                    ),
                    couponRequired: promotionDraft.couponRequired,
                    couponCode: promotionDraft.couponCode,
                    allowWithLoyalty: promotionDraft.allowWithLoyalty,
                    applyOncePerBasket: promotionDraft.applyOncePerBasket,
                    priority: Number(promotionDraft.priority),
                    startAt: promotionDraft.startAt,
                    endAt: promotionDraft.endAt,
                    status: promotionDraft.status,
                  }),
                ),
              )
            }
          >
            <div className="rms-editor-tab-header rms-form-span-all">
              <div className="rms-editor-tab-strip" role="tablist">
                {standalonePromotionEditorTabs.map(([id, label]) => (
                  <button
                    aria-selected={promotionFormTab === id}
                    className={promotionFormTab === id ? "is-active" : ""}
                    key={id}
                    onClick={() => setPromotionFormTab(id)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="rms-editor-actions-bar">
                <button
                  className="rms-button is-primary is-compact"
                  disabled={
                    props.isBusy ||
                    !promotionDraft.promotionCode.trim() ||
                    !promotionDraft.promotionName.trim()
                  }
                  type="submit"
                >
                  {isEditing("promotion") ? "Update promo" : "Save promo"}
                </button>
                {isEditing("promotion") ? (
                  <button
                    className="rms-button is-compact"
                    onClick={() => {
                      clearEditing("promotion");
                      setPromotionDraft(createStandalonePromotionDraft());
                      setPromotionFormTab("offer");
                    }}
                    type="button"
                  >
                    New promo
                  </button>
                ) : null}
              </div>
            </div>

            {promotionFormTab === "offer" ? (
              <div className="rms-editor-tab-panel rms-form-span-all">
                <label>
                  <span>Promo code</span>
                  <input
                    disabled={isEditing("promotion")}
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        promotionCode: event.target.value,
                      }))
                    }
                    value={promotionDraft.promotionCode}
                  />
                </label>
                <label>
                  <span>Promo name</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        promotionName: event.target.value,
                      }))
                    }
                    value={promotionDraft.promotionName}
                  />
                </label>
                <label>
                  <span>Discount</span>
                  <select
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        discountType: event.target.value,
                      }))
                    }
                    value={promotionDraft.discountType}
                  >
                    <option value="PERCENT">Percent</option>
                    <option value="AMOUNT">Amount</option>
                    <option value="FIXED_PRICE">Fixed price</option>
                  </select>
                </label>
                <label>
                  <span>Value</span>
                  <input
                    min="0"
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        discountValue: event.target.value,
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={promotionDraft.discountValue}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        status: event.target.value,
                      }))
                    }
                    value={promotionDraft.status}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        priority: event.target.value,
                      }))
                    }
                    type="number"
                    value={promotionDraft.priority}
                  />
                </label>
                <label className="rms-form-span-2">
                  <span>Description</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        description: event.target.value,
                      }))
                    }
                    value={promotionDraft.description}
                  />
                </label>
              </div>
            ) : null}

            {promotionFormTab === "target" ? (
              <div className="rms-editor-tab-panel rms-form-span-all">
                <label>
                  <span>Scope</span>
                  <select
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        targetScope: event.target.value,
                      }))
                    }
                    value={promotionDraft.targetScope}
                  >
                    <option value="ALL_ITEMS">All items</option>
                    <option value="DEPARTMENT">Department</option>
                    <option value="CATEGORY">Category</option>
                    <option value="PRODUCT">Product</option>
                  </select>
                </label>
                {promotionDraft.targetScope === "DEPARTMENT" ? (
                  <label>
                    <span>Department</span>
                    <select
                      onChange={(event) =>
                        setPromotionDraft((draft) => ({
                          ...draft,
                          targetDepartmentCode: event.target.value,
                        }))
                      }
                      value={promotionDraft.targetDepartmentCode}
                    >
                      <option value="">Select department</option>
                      {departments.map((department) => (
                        <option
                          key={department.departmentCode}
                          value={department.departmentCode}
                        >
                          {department.departmentName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {promotionDraft.targetScope === "CATEGORY" ? (
                  <label>
                    <span>Category</span>
                    <select
                      onChange={(event) =>
                        setPromotionDraft((draft) => ({
                          ...draft,
                          targetCategoryCode: event.target.value,
                        }))
                      }
                      value={promotionDraft.targetCategoryCode}
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option
                          key={category.categoryCode}
                          value={category.categoryCode}
                        >
                          {category.categoryName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {promotionDraft.targetScope === "PRODUCT" ? (
                  <label className="rms-form-span-2">
                    <span>Product</span>
                    <select
                      onChange={(event) =>
                        setPromotionDraft((draft) => ({
                          ...draft,
                          targetProductCode: event.target.value,
                        }))
                      }
                      value={promotionDraft.targetProductCode}
                    >
                      <option value="">Select product</option>
                      {props.catalogItems.slice(0, 300).map((item) => (
                        <option key={item.productCode} value={item.productCode}>
                          {`${item.productCode} - ${item.productName}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  <span>Min basket</span>
                  <input
                    min="0"
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        minimumBasketAmount: event.target.value,
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={promotionDraft.minimumBasketAmount}
                  />
                </label>
                <label>
                  <span>Min line qty</span>
                  <input
                    min="0"
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        minimumLineQuantity: event.target.value,
                      }))
                    }
                    step="0.001"
                    type="number"
                    value={promotionDraft.minimumLineQuantity}
                  />
                </label>
                <label>
                  <span>Buy qty</span>
                  <input
                    min="0"
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        buyQuantity: event.target.value,
                      }))
                    }
                    step="0.001"
                    type="number"
                    value={promotionDraft.buyQuantity}
                  />
                </label>
                <label>
                  <span>Reward qty</span>
                  <input
                    min="0"
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        rewardQuantity: event.target.value,
                      }))
                    }
                    step="0.001"
                    type="number"
                    value={promotionDraft.rewardQuantity}
                  />
                </label>
                <div className="rms-form-switch-strip is-compact">
                  <label className="rms-check-field">
                    <input
                      checked={promotionDraft.applyOncePerBasket}
                      onChange={(event) =>
                        setPromotionDraft((draft) => ({
                          ...draft,
                          applyOncePerBasket: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Once per basket</span>
                  </label>
                </div>
              </div>
            ) : null}

            {promotionFormTab === "eligibility" ? (
              <div className="rms-editor-tab-panel rms-form-span-all">
                <label>
                  <span>Coupon</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        couponCode: event.target.value,
                      }))
                    }
                    value={promotionDraft.couponCode}
                  />
                </label>
                <label>
                  <span>Customer types</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        eligibleCustomerTypes: event.target.value,
                      }))
                    }
                    placeholder="RETAIL, WHOLESALE"
                    value={promotionDraft.eligibleCustomerTypes}
                  />
                </label>
                <label>
                  <span>Loyalty tiers</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        eligibleLoyaltyTiers: event.target.value,
                      }))
                    }
                    placeholder="SILVER, GOLD"
                    value={promotionDraft.eligibleLoyaltyTiers}
                  />
                </label>
                <div className="rms-form-switch-strip is-compact">
                  <label className="rms-check-field">
                    <input
                      checked={promotionDraft.couponRequired}
                      onChange={(event) =>
                        setPromotionDraft((draft) => ({
                          ...draft,
                          couponRequired: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Coupon required</span>
                  </label>
                  <label className="rms-check-field">
                    <input
                      checked={promotionDraft.allowWithLoyalty}
                      onChange={(event) =>
                        setPromotionDraft((draft) => ({
                          ...draft,
                          allowWithLoyalty: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Allow loyalty</span>
                  </label>
                </div>
              </div>
            ) : null}

            {promotionFormTab === "schedule" ? (
              <div className="rms-editor-tab-panel rms-form-span-all">
                <label>
                  <span>Start date</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        startAt: event.target.value,
                      }))
                    }
                    type="date"
                    value={promotionDraft.startAt}
                  />
                </label>
                <label>
                  <span>End date</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        endAt: event.target.value,
                      }))
                    }
                    type="date"
                    value={promotionDraft.endAt}
                  />
                </label>
                <label>
                  <span>Active from</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        activeFromTime: event.target.value,
                      }))
                    }
                    type="time"
                    value={promotionDraft.activeFromTime}
                  />
                </label>
                <label>
                  <span>Active to</span>
                  <input
                    onChange={(event) =>
                      setPromotionDraft((draft) => ({
                        ...draft,
                        activeToTime: event.target.value,
                      }))
                    }
                    type="time"
                    value={promotionDraft.activeToTime}
                  />
                </label>
                <div className="rms-form-switch-strip is-compact rms-day-selector">
                  {standalonePromotionDays.map((day) => (
                    <label className="rms-check-field" key={day}>
                      <input
                        checked={promotionDraft.activeDaysOfWeek.includes(day)}
                        onChange={(event) =>
                          setPromotionDraft((draft) => ({
                            ...draft,
                            activeDaysOfWeek: event.target.checked
                              ? [...draft.activeDaysOfWeek, day]
                              : draft.activeDaysOfWeek.filter(
                                  (value) => value !== day,
                                ),
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{day}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </form>
          <div className="rms-mini-list rms-pricing-preview-list">
            {promotions.slice(0, 4).map((promotion) => (
              <div className="rms-mini-row" key={promotion.promotionCode}>
                <span>{`${promotion.promotionCode} / ${promotion.targetScope}`}</span>
                <strong>{`${formatNumber(promotion.discountValue)} ${promotion.discountType}`}</strong>
              </div>
            ))}
          </div>
            </div>
          ) : null}
        </section>
          </div>
        ) : null}

        {props.activeSection === "customers" ? (
          <div className="rms-tab-grid rms-setup-tab-grid" role="tabpanel">
        <section className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Accounts</span>
              <h2>Customers & Accounts Receivable</h2>
            </div>
            <StatusPill>{`${formatNumber(customerRows.length)} customers`}</StatusPill>
          </div>
          <div className="rms-dashboard-mini-grid rms-standalone-summary-grid">
            <div className="rms-stat">
              <span>Open AR</span>
              <strong>
                {formatMoney(
                  customerRows.reduce(
                    (total, customer) =>
                      total + customer.receivableBalanceAmount,
                    0,
                  ),
                )}
              </strong>
            </div>
            <div className="rms-stat is-good">
              <span>Credit accounts</span>
              <strong>
                {formatNumber(
                  customerRows.filter((customer) => customer.allowCreditSales)
                    .length,
                )}
              </strong>
            </div>
            <div className="rms-stat is-slate">
              <span>Loyalty</span>
              <strong>
                {formatNumber(
                  customerRows.filter((customer) => customer.loyaltyEnrolled)
                    .length,
                )}
              </strong>
            </div>
          </div>
          <StandaloneRecordsGrid
            actions={(row) => (
              <button
                className="rms-button is-compact"
                onClick={() => {
                  markEditing("customer", row.customerNo);
                  setCustomerDraft({
                    customerNo: row.customerNo,
                    fullName: row.fullName,
                    customerType: row.customerType,
                    phone: row.phone ?? "",
                    email: row.email ?? "",
                    addressLine1: "",
                    city: row.city ?? "",
                    countryCode: row.countryCode ?? "GH",
                    loyaltyEnrolled: row.loyaltyEnrolled,
                    loyaltyTier: row.loyaltyTier ?? "",
                    loyaltyPointsBalance: String(row.loyaltyPointsBalance),
                    allowCreditSales: row.allowCreditSales,
                    creditLimitAmount:
                      row.creditLimitAmount == null
                        ? "0"
                        : String(row.creditLimitAmount),
                    receivableBalanceAmount: String(
                      row.receivableBalanceAmount,
                    ),
                    note: row.note ?? "",
                    status: row.status,
                  });
                  openEntryDialog("customer");
                }}
                type="button"
              >
                Edit
              </button>
            )}
            columns={[
              { header: "No", value: (row) => row.customerNo, width: "120px" },
              { header: "Customer", value: (row) => row.fullName },
              { header: "Type", value: (row) => row.customerType, width: "120px" },
              { header: "Phone", value: (row) => row.phone ?? "", width: "130px" },
              {
                header: "Credit",
                value: (row) =>
                  row.allowCreditSales
                    ? formatMoney(row.creditLimitAmount ?? 0)
                    : "No",
                width: "120px",
              },
              {
                header: "Balance",
                value: (row) => formatMoney(row.receivableBalanceAmount),
                exportValue: (row) => row.receivableBalanceAmount,
                width: "120px",
              },
              { header: "Status", value: (row) => row.status, width: "100px" },
            ]}
            emptyLabel="No standalone customers have been created."
            exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-customers.csv`}
            filters={[
              {
                label: "Credit",
                value: "CREDIT",
                predicate: (row) => row.allowCreditSales,
              },
              {
                label: "Open balance",
                value: "OPEN_AR",
                predicate: (row) => row.receivableBalanceAmount > 0,
              },
              {
                label: "Active",
                value: "ACTIVE",
                predicate: (row) => row.status === "ACTIVE",
              },
            ]}
            primaryAction={
              <button
                className="rms-button is-primary is-compact"
                onClick={() => {
                  clearEditing("customer");
                  setCustomerDraft({
                    customerNo: "",
                    fullName: "",
                    customerType: "RETAIL",
                    phone: "",
                    email: "",
                    addressLine1: "",
                    city: "",
                    countryCode: "GH",
                    loyaltyEnrolled: false,
                    loyaltyTier: "",
                    loyaltyPointsBalance: "0",
                    allowCreditSales: false,
                    creditLimitAmount: "0",
                    receivableBalanceAmount: "0",
                    note: "",
                    status: "ACTIVE",
                  });
                  openEntryDialog("customer");
                }}
                type="button"
              >
                Add customer
              </button>
            }
            rows={customerRows}
            searchPlaceholder="Search customers"
          />
          <form
            className={entryFormClass("customer")}
            onSubmit={(event) =>
              onSubmit(event, () =>
                void props.runAction((runtime) =>
                  runtime.saveStandaloneCustomer({
                    customerNo: customerDraft.customerNo,
                    fullName: customerDraft.fullName,
                    customerType: customerDraft.customerType,
                    phone: customerDraft.phone,
                    email: customerDraft.email,
                    addressLine1: customerDraft.addressLine1,
                    city: customerDraft.city,
                    countryCode: customerDraft.countryCode,
                    loyaltyEnrolled: customerDraft.loyaltyEnrolled,
                    loyaltyTier: customerDraft.loyaltyTier,
                    loyaltyPointsBalance: Number(
                      customerDraft.loyaltyPointsBalance,
                    ),
                    allowCreditSales: customerDraft.allowCreditSales,
                    creditLimitAmount: Number(customerDraft.creditLimitAmount),
                    receivableBalanceAmount: Number(
                      customerDraft.receivableBalanceAmount,
                    ),
                    note: customerDraft.note,
                    status: customerDraft.status,
                  }),
                ),
              )
            }
          >
            <label>
              <span>Customer no</span>
              <input
                disabled={isEditing("customer")}
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    customerNo: event.target.value,
                  }))
                }
                value={customerDraft.customerNo}
              />
            </label>
            <label>
              <span>Customer type</span>
              <select
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    customerType: event.target.value,
                  }))
                }
                value={customerDraft.customerType}
              >
                <option value="RETAIL">Retail</option>
                <option value="WHOLESALE">Wholesale</option>
                <option value="STAFF">Staff</option>
                <option value="VIP">VIP</option>
              </select>
            </label>
            <label>
              <span>Customer name</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    fullName: event.target.value,
                  }))
                }
                value={customerDraft.fullName}
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    phone: event.target.value,
                  }))
                }
                value={customerDraft.phone}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    email: event.target.value,
                  }))
                }
                value={customerDraft.email}
              />
            </label>
            <label className="rms-form-span-2">
              <span>Address</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    addressLine1: event.target.value,
                  }))
                }
                value={customerDraft.addressLine1}
              />
            </label>
            <label>
              <span>City</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    city: event.target.value,
                  }))
                }
                value={customerDraft.city}
              />
            </label>
            <label>
              <span>Country</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    countryCode: event.target.value,
                  }))
                }
                value={customerDraft.countryCode}
              />
            </label>
            <label>
              <span>Credit limit</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    creditLimitAmount: event.target.value,
                  }))
                }
                type="number"
                value={customerDraft.creditLimitAmount}
              />
            </label>
            <label>
              <span>Balance</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    receivableBalanceAmount: event.target.value,
                  }))
                }
                type="number"
                value={customerDraft.receivableBalanceAmount}
              />
            </label>
            <label>
              <span>Loyalty tier</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    loyaltyTier: event.target.value,
                  }))
                }
                value={customerDraft.loyaltyTier}
              />
            </label>
            <label>
              <span>Loyalty points</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    loyaltyPointsBalance: event.target.value,
                  }))
                }
                type="number"
                value={customerDraft.loyaltyPointsBalance}
              />
            </label>
            <label>
              <span>Status</span>
              <select
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    status: event.target.value,
                  }))
                }
                value={customerDraft.status}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <label className="rms-form-span-2">
              <span>Note</span>
              <input
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    note: event.target.value,
                  }))
                }
                value={customerDraft.note}
              />
            </label>
            <div className="rms-form-switch-strip is-compact">
            <label className="rms-check-field">
              <input
                checked={customerDraft.allowCreditSales}
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    allowCreditSales: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Credit sales</span>
            </label>
            <label className="rms-check-field">
              <input
                checked={customerDraft.loyaltyEnrolled}
                onChange={(event) =>
                  setCustomerDraft((draft) => ({
                    ...draft,
                    loyaltyEnrolled: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>Loyalty</span>
            </label>
            </div>
            <button
              className="rms-button is-primary is-compact"
              disabled={
                props.isBusy ||
                !customerDraft.customerNo.trim() ||
                !customerDraft.fullName.trim()
              }
              type="submit"
            >
              {isEditing("customer") ? "Update customer" : "Save customer"}
            </button>
            {isEditing("customer") ? (
              <button
                className="rms-button is-compact"
                onClick={() => {
                  clearEditing("customer");
                  setCustomerDraft({
                    customerNo: "",
                    fullName: "",
                    customerType: "RETAIL",
                    phone: "",
                    email: "",
                    addressLine1: "",
                    city: "",
                    countryCode: "GH",
                    loyaltyEnrolled: false,
                    loyaltyTier: "",
                    loyaltyPointsBalance: "0",
                    allowCreditSales: false,
                    creditLimitAmount: "0",
                    receivableBalanceAmount: "0",
                    note: "",
                    status: "ACTIVE",
                  });
                }}
                type="button"
              >
                New customer
              </button>
            ) : null}
          </form>
        </section>
          </div>
        ) : null}
      </div>
      {entryDialog ? (
        <>
          <button
            aria-hidden="true"
            className="rms-entry-dialog-backdrop"
            onClick={closeEntryDialog}
            tabIndex={-1}
            type="button"
          />
          <button
            aria-label="Close form"
            className="rms-entry-dialog-close"
            onClick={closeEntryDialog}
            title="Close form"
            type="button"
          >
            X
          </button>
        </>
      ) : null}
    </div>
  );
}

function StandaloneSecurityWorkspace(props: {
  activeSection: StandaloneSecuritySection;
  snapshot: StoreSyncSnapshot | null;
  isBusy: boolean;
  runAction: (
    action: (desktopRuntime: DesktopRuntimeApi) => Promise<StoreSyncActionResult>,
  ) => Promise<StoreSyncActionResult | null>;
}) {
  const [userDraft, setUserDraft] = useState({
    loginId: "",
    displayName: "",
    email: "",
    password: "",
    roleName: "Standalone cashier",
    cashierEligible: true,
    supervisorEligible: false,
  });
  const [roleDraft, setRoleDraft] = useState<StandaloneRoleDraft>({
    roleCode: "",
    roleName: "Standalone cashier",
    description: "",
    status: "ACTIVE",
    permissionCodes: [...standaloneCashierPermissionCodes],
  });
  const [passwordPolicyDraft, setPasswordPolicyDraft] =
    useState<StandalonePasswordPolicyDraft>(() =>
      createStandalonePasswordPolicyDraft(props.snapshot?.passwordPolicy),
    );
  const [editingUserLogin, setEditingUserLogin] = useState<string | null>(null);
  const [editingRoleCode, setEditingRoleCode] = useState<string | null>(null);
  const [securityDialog, setSecurityDialog] = useState<string | null>(null);
  const users = props.snapshot?.storeUsers ?? [];
  const roleOptions = buildStandaloneRoleOptions(
    users,
    props.snapshot?.standaloneRoles ?? [],
  );
  const permissionRows =
    props.snapshot?.standalonePermissions?.length
      ? props.snapshot.standalonePermissions
      : standaloneSupervisorPermissionCodes.map((permissionCode) => ({
          permissionCode,
          permissionName: formatPermissionLabel(permissionCode),
          description: null,
          updatedAt: props.snapshot?.generatedAt ?? "",
        }));
  const roleRows = useMemo(() => {
    if (props.snapshot?.standaloneRoles?.length) {
      return props.snapshot.standaloneRoles.map((role) => ({
        ...role,
        permissionCount: role.permissionCodes.length,
        permissions: role.permissionCodes.slice(0, 6).join(", "),
      }));
    }

    const roles = new Map<
      string,
      {
        roleCode: string;
        roleName: string;
        description: string | null;
        status: string;
        permissionCodes: string[];
        userCount: number;
        permissionCount: number;
        permissions: string;
        updatedAt: string;
      }
    >();

    for (const user of users) {
      user.roleCodes.forEach((roleCode, index) => {
        const roleName = user.roleNames[index] ?? roleCode;
        const existing =
          roles.get(roleCode) ??
          {
            roleCode,
            roleName,
            description: null,
            status: "ACTIVE",
            permissionCodes: user.permissionCodes,
            userCount: 0,
            permissionCount: 0,
            permissions: "",
            updatedAt: user.updatedAt,
          };

        existing.userCount += 1;
        existing.permissionCodes = user.permissionCodes;
        existing.permissionCount = Math.max(
          existing.permissionCount,
          user.permissionCodes.length,
        );
        existing.permissions = user.permissionCodes.slice(0, 6).join(", ");
        roles.set(roleCode, existing);
      });
    }

    return [...roles.values()];
  }, [props.snapshot?.standaloneRoles, users]);
  const auditRows = [
    ...(props.snapshot?.activityFeed ?? []).map((message, index) => ({
      id: `activity-${index}`,
      area: "Activity",
      event: message,
      status: "INFO",
      at: props.snapshot?.generatedAt ?? "",
    })),
    ...(props.snapshot?.recentSyncEvents ?? []).slice(0, 25).map((event) => ({
      id: event.id,
      area: event.aggregateType,
      event: event.summary,
      status: event.status,
      at: event.updatedAt,
    })),
  ];
  const isStandalone = isStandaloneDeployment(props.snapshot);

  useEffect(() => {
    setPasswordPolicyDraft(
      createStandalonePasswordPolicyDraft(props.snapshot?.passwordPolicy),
    );
  }, [props.snapshot?.passwordPolicy]);

  function openSecurityDialog(key: string) {
    setSecurityDialog(key);
  }

  function closeSecurityDialog() {
    setSecurityDialog(null);
  }

  function securityFormClass(key: string, extraClassName = "") {
    return [
      "rms-form-grid",
      "rms-entry-dialog-form",
      securityDialog === key ? "is-open" : "",
      extraClassName,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function resetUserDraft() {
    setEditingUserLogin(null);
    setUserDraft({
      loginId: "",
      displayName: "",
      email: "",
      password: "",
      roleName: "Standalone cashier",
      cashierEligible: true,
      supervisorEligible: false,
    });
  }

  function resetRoleDraft() {
    setEditingRoleCode(null);
    setRoleDraft({
      roleCode: "",
      roleName: "",
      description: "",
      status: "ACTIVE",
      permissionCodes: [...standaloneCashierPermissionCodes],
    });
  }

  function rolePermissionProfile(roleName: string) {
    const role = roleRows.find((item) => item.roleName === roleName);
    const permissionCodes = role?.permissionCodes ?? [];
    const supervisorEligible =
      permissionCodes.length > 0
        ? permissionCodes.some(
            (permissionCode) =>
              !standaloneCashierPermissionCodeSet.has(permissionCode),
          )
        : roleName !== "Standalone cashier";

    return {
      roleCode: role?.roleCode ?? null,
      permissionCodes,
      cashierEligible:
        permissionCodes.length === 0 ||
        permissionCodes.some((permissionCode) =>
          standaloneCashierPermissionCodeSet.has(permissionCode),
        ),
      supervisorEligible,
    };
  }

  function applyRoleSelection(roleName: string) {
    const profile = rolePermissionProfile(roleName);

    setUserDraft((draft) => ({
      ...draft,
      roleName,
      cashierEligible: profile.cashierEligible,
      supervisorEligible: profile.supervisorEligible,
    }));
  }

  function editRole(row: (typeof roleRows)[number]) {
    setEditingRoleCode(row.roleCode);
    setRoleDraft({
      roleCode: row.roleCode,
      roleName: row.roleName,
      description: row.description ?? "",
      status: row.status || "ACTIVE",
      permissionCodes:
        row.permissionCodes.length > 0
          ? [...row.permissionCodes]
          : [...standaloneCashierPermissionCodes],
    });
    openSecurityDialog("role");
  }

  function editUser(row: StoreSyncSnapshot["storeUsers"][number]) {
    setEditingUserLogin(row.loginId);
    setUserDraft({
      loginId: row.loginId,
      displayName: row.displayName,
      email: row.email ?? "",
      password: "",
      roleName: row.roleNames[0] ?? "Standalone cashier",
      cashierEligible: row.cashierEligible,
      supervisorEligible: row.supervisorEligible,
    });
    openSecurityDialog("user");
  }

  function toggleRolePermission(permissionCode: string, enabled: boolean) {
    setRoleDraft((draft) => {
      const permissionCodes = new Set(draft.permissionCodes);

      if (enabled) {
        permissionCodes.add(permissionCode);
      } else {
        permissionCodes.delete(permissionCode);
      }

      const knownOrder = [
        ...standaloneSupervisorPermissionCodes,
        ...permissionRows.map((row) => row.permissionCode),
      ];
      const ordered = knownOrder.filter((code, index) => {
        return knownOrder.indexOf(code) === index && permissionCodes.has(code);
      });
      const custom = [...permissionCodes].filter(
        (code) => !knownOrder.includes(code),
      );

      return {
        ...draft,
        permissionCodes: [...ordered, ...custom],
      };
    });
  }

  if (!isStandalone) {
    return (
      <div className="rms-workspace">
        <section className="rms-panel">
          <EmptyState
            title="Standalone security is off"
            detail="Security pages here are for the standalone store mode."
          />
        </section>
      </div>
    );
  }

  return (
    <div className="rms-workspace rms-tabbed-workspace rms-standalone-setup-workspace">
      <div className="rms-tab-panel-stack">
        {props.activeSection === "roles" ? (
          <section className="rms-panel">
            <div className="rms-panel-title">
              <div>
                <span>Security</span>
                <h2>Roles & Privileges</h2>
              </div>
              <StatusPill>{`${formatNumber(roleRows.length)} role`}</StatusPill>
            </div>
            <StandaloneRecordsGrid
              actions={(row) => (
                <button
                  className="rms-button is-compact"
                  onClick={() => editRole(row)}
                  type="button"
                >
                  Edit
                </button>
              )}
              columns={[
                { header: "Role", value: (row) => row.roleName },
                { header: "Code", value: (row) => row.roleCode, width: "150px" },
                {
                  header: "Users",
                  value: (row) => formatNumber(row.userCount),
                  exportValue: (row) => row.userCount,
                  width: "90px",
                },
                {
                  header: "Privileges",
                  value: (row) => formatNumber(row.permissionCount),
                  exportValue: (row) => row.permissionCount,
                  width: "120px",
                },
                { header: "Sample", value: (row) => row.permissions },
              ]}
              emptyLabel="No local roles are assigned yet."
              exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-roles.csv`}
              primaryAction={
                <button
                  className="rms-button is-primary is-compact"
                  onClick={() => {
                    resetRoleDraft();
                    openSecurityDialog("role");
                  }}
                  type="button"
                >
                  Add role
                </button>
              }
              rows={roleRows}
              searchPlaceholder="Search roles or privileges"
            />
            <form
              className={securityFormClass("role", "rms-security-role-form")}
              onSubmit={(event) => {
                event.preventDefault();
                closeSecurityDialog();
                void props.runAction((runtime) =>
                  runtime.saveStandaloneRole({
                    roleCode: roleDraft.roleCode,
                    roleName: roleDraft.roleName,
                    description: roleDraft.description,
                    status: roleDraft.status,
                    permissionCodes: roleDraft.permissionCodes,
                    cashierEligible: roleDraft.permissionCodes.some(
                      (permissionCode) =>
                        standaloneCashierPermissionCodeSet.has(permissionCode),
                    ),
                    supervisorEligible: roleDraft.permissionCodes.some(
                      (permissionCode) =>
                        !standaloneCashierPermissionCodeSet.has(permissionCode),
                    ),
                  }),
                );
              }}
            >
              <label>
                <span>Role code</span>
                <input
                  disabled={Boolean(editingRoleCode)}
                  onChange={(event) =>
                    setRoleDraft((draft) => ({
                      ...draft,
                      roleCode: event.target.value,
                    }))
                  }
                  placeholder="Auto from role name"
                  value={roleDraft.roleCode}
                />
              </label>
              <label>
                <span>Role name</span>
                <input
                  onChange={(event) =>
                    setRoleDraft((draft) => ({
                      ...draft,
                      roleName: event.target.value,
                    }))
                  }
                  value={roleDraft.roleName}
                />
              </label>
              <label>
                <span>Status</span>
                <select
                  onChange={(event) =>
                    setRoleDraft((draft) => ({
                      ...draft,
                      status: event.target.value,
                    }))
                  }
                  value={roleDraft.status}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <label className="rms-form-span-2">
                <span>Description</span>
                <textarea
                  onChange={(event) =>
                    setRoleDraft((draft) => ({
                      ...draft,
                      description: event.target.value,
                    }))
                  }
                  rows={2}
                  value={roleDraft.description}
                />
              </label>
              <div className="rms-form-span-all rms-permission-picker">
                {permissionRows.map((permission) => (
                  <label className="rms-check-field" key={permission.permissionCode}>
                    <input
                      checked={roleDraft.permissionCodes.includes(
                        permission.permissionCode,
                      )}
                      onChange={(event) =>
                        toggleRolePermission(
                          permission.permissionCode,
                          event.target.checked,
                        )
                      }
                      type="checkbox"
                    />
                    <span>{permission.permissionName}</span>
                  </label>
                ))}
              </div>
              <button
                className="rms-button is-primary is-compact"
                disabled={
                  props.isBusy ||
                  !roleDraft.roleName.trim() ||
                  roleDraft.permissionCodes.length === 0
                }
                type="submit"
              >
                {editingRoleCode ? "Update role" : "Save role"}
              </button>
              {editingRoleCode ? (
                <button
                  className="rms-button is-compact"
                  onClick={resetRoleDraft}
                  type="button"
                >
                  New role
                </button>
              ) : null}
            </form>
          </section>
        ) : null}

        {props.activeSection === "users" ? (
          <section className="rms-panel">
            <div className="rms-panel-title">
              <div>
                <span>Security</span>
                <h2>Users</h2>
              </div>
              <StatusPill>{`${formatNumber(users.length)} users`}</StatusPill>
            </div>
            <StandaloneRecordsGrid
              actions={(row) => (
                <button
                  className="rms-button is-compact"
                  onClick={() => editUser(row)}
                  type="button"
                >
                  Edit
                </button>
              )}
              columns={[
                { header: "Login", value: (row) => row.loginId, width: "140px" },
                { header: "Name", value: (row) => row.displayName },
                { header: "Email", value: (row) => row.email ?? "" },
                { header: "Roles", value: (row) => row.roleNames.join(", ") },
                { header: "Status", value: (row) => row.accountStatus, width: "110px" },
              ]}
              emptyLabel="No local users are available."
              exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-users.csv`}
              filters={[
                { label: "Active", value: "ACTIVE", predicate: (row) => row.accountStatus === "ACTIVE" },
              ]}
              primaryAction={
                <button
                  className="rms-button is-primary is-compact"
                  onClick={() => {
                    resetUserDraft();
                    openSecurityDialog("user");
                  }}
                  type="button"
                >
                  Add user
                </button>
              }
              rows={users}
              searchPlaceholder="Search users"
            />
            <form
              className={securityFormClass("user")}
              onSubmit={(event) => {
                event.preventDefault();
                const roleProfile = rolePermissionProfile(userDraft.roleName);
                closeSecurityDialog();
                void props.runAction((runtime) =>
                  runtime.saveStandaloneUser({
                    ...userDraft,
                    roleCode: roleProfile.roleCode,
                    permissionCodes:
                      roleProfile.permissionCodes.length > 0
                        ? roleProfile.permissionCodes
                        : null,
                  }),
                );
              }}
            >
              <label>
                <span>Login ID</span>
                <input
                  disabled={Boolean(editingUserLogin)}
                  onChange={(event) =>
                    setUserDraft((draft) => ({ ...draft, loginId: event.target.value }))
                  }
                  value={userDraft.loginId}
                />
              </label>
              <label>
                <span>Display name</span>
                <input
                  onChange={(event) =>
                    setUserDraft((draft) => ({ ...draft, displayName: event.target.value }))
                  }
                  value={userDraft.displayName}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  onChange={(event) =>
                    setUserDraft((draft) => ({ ...draft, email: event.target.value }))
                  }
                  value={userDraft.email}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  onChange={(event) =>
                    setUserDraft((draft) => ({ ...draft, password: event.target.value }))
                  }
                  type="password"
                  value={userDraft.password}
                />
              </label>
              <label>
                <span>Role</span>
                <select
                  onChange={(event) => applyRoleSelection(event.target.value)}
                  value={userDraft.roleName}
                >
                  {roleOptions.map((roleName) => (
                    <option key={roleName} value={roleName}>
                      {roleName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rms-check-field">
                <input
                  checked={userDraft.supervisorEligible}
                  onChange={(event) =>
                    setUserDraft((draft) => ({
                      ...draft,
                      supervisorEligible: event.target.checked,
                      cashierEligible: true,
                    }))
                  }
                  type="checkbox"
                />
                <span>Supervisor</span>
              </label>
              <button
                className="rms-button is-primary is-compact"
                disabled={
                  props.isBusy ||
                  !userDraft.loginId.trim() ||
                  !userDraft.displayName.trim()
                }
                type="submit"
              >
                {editingUserLogin ? "Update user" : "Save user"}
              </button>
              {editingUserLogin ? (
                <button
                  className="rms-button is-compact"
                  onClick={resetUserDraft}
                  type="button"
                >
                  New user
                </button>
              ) : null}
            </form>
          </section>
        ) : null}

        {props.activeSection === "audit" ? (
          <section className="rms-panel">
            <div className="rms-panel-title">
              <div>
                <span>Security</span>
                <h2>Audit</h2>
              </div>
              <StatusPill>{`${formatNumber(auditRows.length)} events`}</StatusPill>
            </div>
            <StandaloneRecordsGrid
              columns={[
                { header: "Area", value: (row) => row.area, width: "150px" },
                { header: "Event", value: (row) => row.event },
                { header: "Status", value: (row) => row.status, width: "110px" },
                { header: "At", value: (row) => formatRelative(row.at), width: "130px" },
              ]}
              emptyLabel="No audit events are available."
              exportFileName={`flash-erp-${props.snapshot?.storeCode ?? "store"}-audit.csv`}
              rows={auditRows}
              searchPlaceholder="Search audit events"
            />
          </section>
        ) : null}

        {props.activeSection === "password-policy" ? (
          <section className="rms-panel">
            <div className="rms-panel-title">
              <div>
                <span>Security</span>
                <h2>Password Policy</h2>
              </div>
              <StatusPill>
                {props.snapshot?.passwordPolicy?.updatedAt
                  ? `Updated ${formatRelative(props.snapshot.passwordPolicy.updatedAt)}`
                  : "Single policy"}
              </StatusPill>
            </div>
            <form
              className="rms-form-grid rms-password-policy-form"
              onSubmit={(event) => {
                event.preventDefault();
                void props.runAction((runtime) =>
                  runtime.saveStandalonePasswordPolicy(
                    createStandalonePasswordPolicyInput(passwordPolicyDraft),
                  ),
                );
              }}
            >
              <label>
                <span>Minimum length</span>
                <input
                  min="4"
                  onChange={(event) =>
                    setPasswordPolicyDraft((draft) => ({
                      ...draft,
                      minimumLength: event.target.value,
                    }))
                  }
                  type="number"
                  value={passwordPolicyDraft.minimumLength}
                />
              </label>
              <label>
                <span>Password expiry days</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setPasswordPolicyDraft((draft) => ({
                      ...draft,
                      passwordExpiryDays: event.target.value,
                    }))
                  }
                  type="number"
                  value={passwordPolicyDraft.passwordExpiryDays}
                />
              </label>
              <label>
                <span>Password history</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setPasswordPolicyDraft((draft) => ({
                      ...draft,
                      passwordHistoryCount: event.target.value,
                    }))
                  }
                  type="number"
                  value={passwordPolicyDraft.passwordHistoryCount}
                />
              </label>
              <label>
                <span>Failed login limit</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setPasswordPolicyDraft((draft) => ({
                      ...draft,
                      lockoutThreshold: event.target.value,
                    }))
                  }
                  type="number"
                  value={passwordPolicyDraft.lockoutThreshold}
                />
              </label>
              <label>
                <span>Lockout minutes</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setPasswordPolicyDraft((draft) => ({
                      ...draft,
                      lockoutMinutes: event.target.value,
                    }))
                  }
                  type="number"
                  value={passwordPolicyDraft.lockoutMinutes}
                />
              </label>
              <div className="rms-form-span-all rms-form-switch-strip is-compact">
                <label className="rms-check-field">
                  <input
                    checked={passwordPolicyDraft.requireUppercase}
                    onChange={(event) =>
                      setPasswordPolicyDraft((draft) => ({
                        ...draft,
                        requireUppercase: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Uppercase</span>
                </label>
                <label className="rms-check-field">
                  <input
                    checked={passwordPolicyDraft.requireLowercase}
                    onChange={(event) =>
                      setPasswordPolicyDraft((draft) => ({
                        ...draft,
                        requireLowercase: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Lowercase</span>
                </label>
                <label className="rms-check-field">
                  <input
                    checked={passwordPolicyDraft.requireNumber}
                    onChange={(event) =>
                      setPasswordPolicyDraft((draft) => ({
                        ...draft,
                        requireNumber: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Number</span>
                </label>
                <label className="rms-check-field">
                  <input
                    checked={passwordPolicyDraft.requireSymbol}
                    onChange={(event) =>
                      setPasswordPolicyDraft((draft) => ({
                        ...draft,
                        requireSymbol: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Symbol</span>
                </label>
                <label className="rms-check-field">
                  <input
                    checked={passwordPolicyDraft.temporaryPasswordMustChange}
                    onChange={(event) =>
                      setPasswordPolicyDraft((draft) => ({
                        ...draft,
                        temporaryPasswordMustChange: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Temp must change</span>
                </label>
              </div>
              <div className="rms-form-span-all rms-form-actions">
                <button
                  className="rms-button is-primary is-compact"
                  disabled={props.isBusy}
                  type="submit"
                >
                  Save policy
                </button>
                <button
                  className="rms-button is-compact"
                  onClick={() =>
                    setPasswordPolicyDraft(
                      createStandalonePasswordPolicyDraft(
                        props.snapshot?.passwordPolicy,
                      ),
                    )
                  }
                  type="button"
                >
                  Reset
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
      {securityDialog ? (
        <>
          <button
            aria-hidden="true"
            className="rms-entry-dialog-backdrop"
            onClick={closeSecurityDialog}
            tabIndex={-1}
            type="button"
          />
          <button
            aria-label="Close security form"
            className="rms-entry-dialog-close"
            onClick={closeSecurityDialog}
            title="Close form"
            type="button"
          >
            X
          </button>
        </>
      ) : null}
    </div>
  );
}

function DashboardWorkspace({
  activeShift,
  dashboardDateFrom,
  dashboardDateTo,
  dashboardReport,
  openInventory,
  openPos,
  openReports,
  refreshDashboard,
  setDashboardDateFrom,
  setDashboardDateTo,
  snapshot,
}: {
  activeShift: ReturnType<typeof firstOpenShift>;
  dashboardDateFrom: string;
  dashboardDateTo: string;
  dashboardReport: StoreReportResult | null;
  openInventory: () => void;
  openPos: () => void;
  openReports: () => void;
  refreshDashboard: () => void;
  setDashboardDateFrom: (value: string) => void;
  setDashboardDateTo: (value: string) => void;
  snapshot: StoreSyncSnapshot | null;
}) {
  const operations = snapshot?.operationsMetrics;
  const operator = snapshot?.activeOperatorSession;
  const supervisorView = operator?.capabilities.supervisorEligible === true;
  const reportFilters = dashboardReport?.filters;
  const isOpenShiftScope = Boolean(reportFilters?.shiftId);
  const dateScopeLabel =
    dashboardDateFrom &&
    dashboardDateTo &&
    dashboardDateFrom !== dashboardDateTo
      ? `${dashboardDateFrom} to ${dashboardDateTo}`
      : dashboardDateFrom || dashboardDateTo || "today";
  const dashboardScopeLabel = supervisorView
    ? `shop ${dateScopeLabel}`
    : isOpenShiftScope && activeShift
      ? "your open shift"
      : `your cashier ${dateScopeLabel}`;
  const openShifts = snapshot?.openShifts ?? [];
  const fallbackTenderTotals = supervisorView
    ? openShifts.flatMap((shift) => shift.tenderTotals)
    : (activeShift?.tenderTotals ?? []);
  const visibleTenderTotals = dashboardReport ? [] : fallbackTenderTotals;
  const openShiftNetSales = openShifts.reduce(
    (sum, shift) => sum + shift.netSalesAmount,
    0,
  );
  const openShiftExpectedCash = openShifts.reduce(
    (sum, shift) => sum + shift.expectedCashAmount,
    0,
  );
  const reportSalesRows = dashboardReport?.salesRows ?? [];
  const reportShiftRows = dashboardReport?.shiftRows ?? [];
  const scopedExpectedCash = dashboardReport
    ? reportShiftRows.reduce((sum, shift) => sum + shift.expectedCashAmount, 0)
    : supervisorView
      ? openShiftExpectedCash
      : (activeShift?.expectedCashAmount ?? 0);
  const saleRows = reportSalesRows.filter(
    (transaction) => transaction.transactionType === "SALE",
  );
  const returnRows = reportSalesRows.filter(
    (transaction) => transaction.transactionType === "RETURN",
  );
  const exchangeRows = reportSalesRows.filter(
    (transaction) => transaction.transactionType === "EXCHANGE",
  );
  const salesCount =
    dashboardReport?.summary.salesCount ??
    (supervisorView
      ? (operations?.completedSales ?? 0)
      : (activeShift?.salesCount ?? 0));
  const returnCount =
    dashboardReport?.summary.returnCount ??
    (supervisorView
      ? (snapshot?.recentTransactions ?? []).filter(
          (transaction) => transaction.transactionType === "RETURN",
        ).length
      : (activeShift?.returnCount ?? 0));
  const exchangeCount =
    dashboardReport?.summary.exchangeCount ??
    (supervisorView ? 0 : (activeShift?.exchangeCount ?? 0));
  const netSalesAmount =
    dashboardReport?.summary.netSalesAmount ??
    (supervisorView ? openShiftNetSales : (activeShift?.netSalesAmount ?? 0));
  const totalRefundAmount = Math.abs(
    returnRows.reduce(
      (sum, transaction) => sum + Math.min(0, transaction.totalAmount),
      0,
    ),
  );
  const voidCount = returnRows.filter(
    (transaction) => transaction.sourceTransactionNo,
  ).length;
  const returnRate =
    salesCount + returnCount > 0
      ? (returnCount / (salesCount + returnCount)) * 100
      : 0;
  const topProducts = (dashboardReport?.productRows ?? [])
    .filter((product) => product.netAmount > 0 || product.quantity > 0)
    .sort((left, right) => right.netAmount - left.netAmount)
    .slice(0, 5);
  const topProduct = topProducts[0] ?? null;
  const tenderTotalsByKey = new Map<
    string,
    {
      code: string | null;
      name: string;
      method: string;
      amount: number;
      count: number;
    }
  >();
  for (const tender of dashboardReport?.tenderRows ?? []) {
    const key = `${tender.tenderMethodCode ?? tender.tenderMethodName ?? tender.paymentMethod}:${tender.paymentMethod}`;
    const current = tenderTotalsByKey.get(key) ?? {
      code: tender.tenderMethodCode,
      name: tender.tenderMethodName ?? tender.paymentMethod,
      method: tender.paymentMethod,
      amount: 0,
      count: 0,
    };
    current.amount = Number(
      (current.amount + Math.abs(tender.netAmount)).toFixed(2),
    );
    current.count += tender.transactionCount;
    tenderTotalsByKey.set(key, current);
  }
  for (const tender of visibleTenderTotals) {
    const key = `${tender.tenderMethodCode ?? tender.tenderMethodName ?? tender.method}:${tender.method}`;
    if (tenderTotalsByKey.has(key)) {
      continue;
    }

    const current = tenderTotalsByKey.get(key) ?? {
      code: tender.tenderMethodCode,
      name: tender.tenderMethodName ?? tender.method,
      method: tender.method,
      amount: 0,
      count: 0,
    };
    current.amount = Number(
      (current.amount + Math.abs(tender.netAmount)).toFixed(2),
    );
    current.count += tender.transactionCount;
    tenderTotalsByKey.set(key, current);
  }
  const tenderBreakdown = [...tenderTotalsByKey.values()].sort(
    (left, right) => right.amount - left.amount,
  );
  const tenderTotal = tenderBreakdown.reduce(
    (sum, tender) => sum + tender.amount,
    0,
  );
  const tenderPalette = [
    "#147ad6",
    "#16a34a",
    "#f59e0b",
    "#be123c",
    "#7c3aed",
    "#0f766e",
    "#64748b",
  ];
  let tenderCursor = 0;
  const tenderGradient =
    tenderTotal > 0
      ? tenderBreakdown
          .map((tender, index) => {
            const nextCursor =
              tenderCursor + (tender.amount / tenderTotal) * 100;
            const segment = `${tenderPalette[index % tenderPalette.length]} ${tenderCursor}% ${nextCursor}%`;
            tenderCursor = nextCursor;
            return segment;
          })
          .join(", ")
      : "#cbd5e1 0 100%";
  const topTenderPercent =
    tenderTotal > 0 && tenderBreakdown[0]
      ? Math.round((tenderBreakdown[0].amount / tenderTotal) * 100)
      : 0;
  const inventoryLocations = snapshot?.inventoryLocations ?? [];
  const lowStockLocations = inventoryLocations.filter(
    (location) => location.negativePositions > 0,
  );
  const hourlySales = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    amount: 0,
    count: 0,
  }));

  for (const transaction of reportSalesRows) {
    if (!transaction.completedAt || transaction.transactionType !== "SALE") {
      continue;
    }

    const timestamp = transaction.completedAt;
    const hour = new Date(timestamp).getHours();

    hourlySales[hour].amount += Math.max(0, transaction.totalAmount);
    hourlySales[hour].count += 1;
  }
  const chartWidth = 640;
  const chartHeight = 210;
  const chartPadX = 28;
  const chartPadTop = 18;
  const chartPadBottom = 28;
  const chartInnerWidth = chartWidth - chartPadX * 2;
  const chartInnerHeight = chartHeight - chartPadTop - chartPadBottom;
  const maxHourlySales = Math.max(
    1,
    ...hourlySales.map((bucket) => bucket.amount),
  );
  const hourlyPoints = hourlySales.map((bucket, index) => {
    const x = chartPadX + (index / 23) * chartInnerWidth;
    const y =
      chartPadTop +
      chartInnerHeight -
      (bucket.amount / maxHourlySales) * chartInnerHeight;

    return {
      ...bucket,
      x,
      y,
    };
  });
  const hourlyLinePoints = hourlyPoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const hourlyAreaPoints = [
    `${chartPadX},${chartPadTop + chartInnerHeight}`,
    ...hourlyPoints.map((point) => `${point.x},${point.y}`),
    `${chartPadX + chartInnerWidth},${chartPadTop + chartInnerHeight}`,
  ].join(" ");
  const dashboardCards = [
    {
      label: "Net sales",
      value: formatMoney(netSalesAmount),
      detail: dashboardScopeLabel,
      tone: "blue",
      title: supervisorView
        ? "Net sales for the whole shop today."
        : "Net sales for the cashier's current open shift, falling back to today's cashier activity when no shift is open.",
    },
    {
      label: "Total refunds",
      value: formatMoney(totalRefundAmount),
      detail: `${formatNumber(returnCount)} return(s)`,
      tone: returnCount ? "amber" : "green",
      title:
        "Refund value from completed return receipts in the dashboard scope.",
    },
    {
      label: "Return rate",
      value: `${returnRate.toFixed(1)}%`,
      detail: `${formatNumber(salesCount)} sale(s)`,
      tone: returnRate > 10 ? "red" : returnRate > 4 ? "amber" : "green",
      title: "Returns divided by sales plus returns for the dashboard scope.",
    },
    {
      label: "Total voids",
      value: formatNumber(voidCount),
      detail: "linked correction receipts",
      tone: voidCount ? "amber" : "green",
      title:
        "Return/void receipts that are linked back to an original sale receipt.",
    },
    {
      label: "Top product",
      value: topProduct ? topProduct.productName : "None",
      detail: topProduct
        ? `${formatMoney(topProduct.netAmount)} / ${formatNumber(topProduct.quantity)} qty`
        : "No sales yet",
      tone: "slate",
      title: "Highest net-selling product in the dashboard scope.",
    },
    {
      label: "Open orders",
      value: formatNumber(operations?.openSalesOrders ?? 0),
      detail: `${formatNumber(operations?.parkedSales ?? 0)} held basket(s)`,
      tone: "amber",
      title:
        "Open sales orders and parked baskets currently known on this desktop.",
    },
  ];

  return (
    <div className="rms-workspace rms-dashboard">
      <section className="rms-dashboard-hero">
        <div>
          <span className="rms-kicker">Shop dashboard</span>
          <h2>Welcome, {operator?.displayName ?? "operator"}</h2>
          <p>
            {snapshot?.storeName ?? "Store"} ·{" "}
            {snapshot?.terminalCode ?? "Terminal"} ·{" "}
            {activeShift
              ? `${activeShift.shiftNo} open on this terminal · ${dashboardScopeLabel}`
              : `${formatNumber(openShifts.length)} open shift(s) in shop · ${dashboardScopeLabel}`}
          </p>
        </div>
        <div className="rms-dashboard-actions">
          <label className="rms-dashboard-date-field">
            <span>From</span>
            <input
              max={dashboardDateTo || undefined}
              onChange={(event) => setDashboardDateFrom(event.target.value)}
              type="date"
              value={dashboardDateFrom}
            />
          </label>
          <label className="rms-dashboard-date-field">
            <span>To</span>
            <input
              min={dashboardDateFrom || undefined}
              onChange={(event) => setDashboardDateTo(event.target.value)}
              type="date"
              value={dashboardDateTo}
            />
          </label>
          <button
            className="rms-button"
            onClick={refreshDashboard}
            type="button"
          >
            Apply
          </button>
          <button
            className="rms-button is-primary"
            onClick={openPos}
            type="button"
          >
            Open POS
          </button>
          <button className="rms-button" onClick={openReports} type="button">
            Reports
          </button>
          <button className="rms-button" onClick={openInventory} type="button">
            Inventory
          </button>
        </div>
      </section>

      <section className="rms-dashboard-kpis">
        {dashboardCards.map((card) => (
          <article
            className={`rms-dashboard-kpi is-${card.tone}`}
            key={card.label}
            title={card.title}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      <section className="rms-dashboard-split">
        <article
          className="rms-panel rms-dashboard-chart"
          title={`Hourly sales for ${dashboardScopeLabel}.`}
        >
          <div className="rms-panel-title">
            <div>
              <span>{dashboardScopeLabel}</span>
              <h2>Hourly sales</h2>
            </div>
            <StatusPill tone={snapshot?.health === "healthy" ? "good" : "warn"}>
              {formatMoney(
                saleRows.reduce(
                  (sum, transaction) =>
                    sum + Math.max(0, transaction.totalAmount),
                  0,
                ),
              )}
            </StatusPill>
          </div>
          <div
            className="rms-line-chart"
            aria-label={`Hourly sales for ${dashboardScopeLabel}`}
          >
            <svg role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
              <defs>
                <linearGradient
                  id="hourlySalesFill"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#147ad6" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#147ad6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((line) => {
                const y = chartPadTop + (line / 3) * chartInnerHeight;

                return (
                  <line
                    className="rms-chart-grid-line"
                    key={line}
                    x1={chartPadX}
                    x2={chartPadX + chartInnerWidth}
                    y1={y}
                    y2={y}
                  />
                );
              })}
              <polygon className="rms-chart-area" points={hourlyAreaPoints} />
              <polyline className="rms-chart-line" points={hourlyLinePoints} />
              {hourlyPoints
                .filter((point) => point.amount > 0)
                .map((point) => (
                  <circle
                    className="rms-chart-dot"
                    cx={point.x}
                    cy={point.y}
                    key={point.hour}
                    r="4"
                  />
                ))}
              {[0, 6, 12, 18, 23].map((hour) => (
                <text
                  className="rms-chart-label"
                  key={hour}
                  x={hourlyPoints[hour].x}
                  y={chartHeight - 6}
                >
                  {hour.toString().padStart(2, "0")}
                </text>
              ))}
            </svg>
            {!saleRows.length ? (
              <div className="rms-chart-empty">
                <EmptyState
                  title="No sales in scope"
                  detail="Hourly sales will draw as receipts are completed."
                />
              </div>
            ) : null}
          </div>
        </article>

        <article
          className="rms-panel rms-dashboard-donut-panel"
          title={`Tender mix for ${dashboardScopeLabel}.`}
        >
          <div className="rms-panel-title">
            <div>
              <span>Tenders</span>
              <h2>Tender mix</h2>
            </div>
          </div>
          <div className="rms-dashboard-donut-row">
            <div
              className="rms-dashboard-donut"
              style={{
                background: `conic-gradient(${tenderGradient})`,
              }}
            >
              <strong>{topTenderPercent}%</strong>
              <span>{tenderBreakdown[0]?.name ?? "No tender"}</span>
            </div>
            <div className="rms-dashboard-tender-list">
              {tenderBreakdown.length ? (
                tenderBreakdown.slice(0, 6).map((tender, index) => (
                  <div key={`${tender.code ?? tender.name}-${tender.method}`}>
                    <span>
                      <i
                        style={{
                          background:
                            tenderPalette[index % tenderPalette.length],
                        }}
                      />
                      {tender.name}
                    </span>
                    <strong>{formatMoney(tender.amount)}</strong>
                    <small>{formatNumber(tender.count)} txn</small>
                  </div>
                ))
              ) : (
                <div>
                  <span>No open-shift tender lines</span>
                  <strong>{formatMoney(0)}</strong>
                </div>
              )}
            </div>
          </div>
        </article>

        <article
          className="rms-panel rms-dashboard-list-panel"
          title={`Top products for ${dashboardScopeLabel}.`}
        >
          <div className="rms-panel-title">
            <div>
              <span>{dashboardScopeLabel}</span>
              <h2>Top products</h2>
            </div>
            <StatusPill>{`${formatNumber(topProducts.length)} item(s)`}</StatusPill>
          </div>
          <div className="rms-top-cashier-card">
            {topProduct ? (
              <>
                <div className="rms-top-cashier-rank">1</div>
                <div>
                  <span>Product</span>
                  <strong>{topProduct.productName}</strong>
                  <small>{topProduct.productCode}</small>
                </div>
                <strong>{formatMoney(topProduct.netAmount)}</strong>
              </>
            ) : (
              <EmptyState
                title="No product sales in scope"
                detail="Top products will appear after receipts are completed."
              />
            )}
          </div>
          <div className="rms-list rms-top-cashier-list">
            {topProducts.slice(1).map((product, index) => (
              <div className="rms-list-row" key={product.productCode}>
                <div>
                  <strong>
                    {index + 2}. {product.productName}
                  </strong>
                  <span>{formatNumber(product.quantity)} qty</span>
                </div>
                <strong>{formatMoney(product.netAmount)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rms-dashboard-lower">
        <article className="rms-panel">
          <div className="rms-panel-title">
            <div>
              <span>Inventory posture</span>
              <h2>Shop stock</h2>
            </div>
            <StatusPill tone={lowStockLocations.length ? "warn" : "good"}>
              {lowStockLocations.length
                ? `${lowStockLocations.length} alert(s)`
                : "Clear"}
            </StatusPill>
          </div>
          <div className="rms-dashboard-mini-grid">
            <Stat
              label="Locations"
              title="Inventory locations visible in this shop snapshot."
              value={formatNumber(inventoryLocations.length)}
            />
            <Stat
              label="Open POs"
              title="Open purchase orders affecting this shop."
              value={formatNumber(operations?.openPurchaseOrders ?? 0)}
            />
            <Stat
              label="Transfers"
              title="Open inter-store transfer instructions affecting this shop."
              value={formatNumber(operations?.openInterStoreTransfers ?? 0)}
            />
            <Stat
              label="Stock alerts"
              title="Locations currently carrying negative positions."
              value={formatNumber(lowStockLocations.length)}
              tone={lowStockLocations.length ? "warn" : "neutral"}
            />
          </div>
        </article>
        <article
          className="rms-panel"
          title={`Sales audit for ${dashboardScopeLabel}.`}
        >
          <div className="rms-panel-title">
            <div>
              <span>{dashboardScopeLabel}</span>
              <h2>Sales audit</h2>
            </div>
          </div>
          <div className="rms-dashboard-mini-grid">
            <Stat
              label="Sales"
              title="Completed sale receipts in scope."
              value={formatNumber(salesCount)}
            />
            <Stat
              label="Returns"
              title="Completed return receipts in scope."
              value={formatNumber(returnCount)}
              tone={returnCount ? "warn" : "neutral"}
            />
            <Stat
              label="Exchanges"
              title="Completed exchange receipts in scope."
              value={formatNumber(exchangeCount)}
            />
            <Stat
              label="Cash expected"
              title="Expected cash from shift summaries in the dashboard scope."
              value={formatMoney(scopedExpectedCash)}
              tone="good"
            />
          </div>
        </article>
      </section>
    </div>
  );
}

function POSWorkspace(props: {
  snapshot: StoreSyncSnapshot | null;
  activeBasket: StoreBasketSummary | null;
  activeShift: ReturnType<typeof firstOpenShift>;
  accountPanelOpen: boolean;
  canUsePosLane: boolean;
  catalogItems: StoreCatalogBrowseItem[];
  categoriesForDepartment: NonNullable<StoreSyncSnapshot["productCategories"]>;
  tenderMethods: NonNullable<StoreSyncSnapshot["availableTenderMethods"]>;
  accountTenderMethods: NonNullable<
    StoreSyncSnapshot["availableTenderMethods"]
  >;
  customers: StoreCustomerSummary[];
  accountCustomers: StoreCustomerSummary[];
  itemSuggestions: StoreCatalogBrowseItem[];
  selectedCustomer: StoreCustomerSummary | null;
  selectedAccountCustomer: StoreCustomerSummary | null;
  isBusy: boolean;
  isVoidReviewBasket: boolean;
  openPriceDraft: OpenPriceDraft | null;
  saleMode: SaleMode;
  salesOrderDepositAmount: string;
  salesOrderDepositReference: string;
  salesOrderDepositTenderCode: string;
  scanQuery: string;
  scanQuantity: string;
  catalogQuery: string;
  catalogDepartment: string;
  catalogCategory: string;
  customerQuery: string;
  accountCustomerQuery: string;
  accountPaymentTenderMethodCode: string;
  accountPaymentBankAccountId: string;
  accountPaymentAmount: string;
  accountPaymentReference: string;
  accountPaymentNote: string;
  shiftOpeningFloat: string;
  shiftDeclaredCash: string;
  lineQuantityDrafts: Record<string, string>;
  paymentDrafts: PaymentDraft[];
  cashierReport: StoreReportResult | null;
  reportPanelOpen: boolean;
  reportDateFrom: string;
  reportDateTo: string;
  reportCustomerQuery: string;
  reportProductQuery: string;
  receiptPanelOpen: boolean;
  receiptHistoryKind: StoreReceiptHistoryKind;
  receiptLookup: StoreReceiptLookupResult | null;
  receiptLineQuantityDrafts: Record<string, string>;
  receiptLineSerialDrafts: Record<string, string>;
  receiptQuery: string;
  receiptResults: StoreReceiptSearchResult[];
  receiptWindowDays: string;
  heldSalePanelOpen: boolean;
  heldSaleQuery: string;
  heldSaleWindowDays: string;
  salesOrderPanelOpen: boolean;
  salesOrderQuery: string;
  salesOrderWindowDays: string;
  transactionDetailsOpen: boolean;
  transactionReference: string;
  transactionDetails: string;
  transactionReferenceMatches: StoreTransactionReferenceSummary[];
  transactionReferenceSearchAttempted: boolean;
  transactionReferenceSearchPending: boolean;
  setScanQuery: (value: string) => void;
  setScanQuantity: (value: string) => void;
  setShiftCloseDialogOpen: (value: boolean) => void;
  setCatalogQuery: (value: string) => void;
  setCatalogDepartment: (value: string) => void;
  setCatalogCategory: (value: string) => void;
  setCustomerQuery: (value: string) => void;
  setSaleMode: (value: SaleMode) => void;
  setSalesOrderDepositAmount: (value: string) => void;
  setSalesOrderDepositReference: (value: string) => void;
  setSalesOrderDepositTenderCode: (value: string) => void;
  setAccountCustomerQuery: (value: string) => void;
  setAccountPanelOpen: (value: boolean) => void;
  setSelectedAccountCustomer: (customer: StoreCustomerSummary | null) => void;
  setAccountPaymentTenderMethodCode: (value: string) => void;
  setAccountPaymentBankAccountId: (value: string) => void;
  setAccountPaymentAmount: (value: string) => void;
  setAccountPaymentReference: (value: string) => void;
  setAccountPaymentNote: (value: string) => void;
  setOpenPriceDraft: Dispatch<SetStateAction<OpenPriceDraft | null>>;
  setLineQuantityDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setPaymentDrafts: Dispatch<SetStateAction<PaymentDraft[]>>;
  setReportPanelOpen: (value: boolean) => void;
  setReportDateFrom: (value: string) => void;
  setReportDateTo: (value: string) => void;
  setReportCustomerQuery: (value: string) => void;
  setReportProductQuery: (value: string) => void;
  setReceiptPanelOpen: (value: boolean) => void;
  setReceiptHistoryKind: (value: StoreReceiptHistoryKind) => void;
  setReceiptLineQuantityDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setReceiptLineSerialDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setReceiptQuery: (value: string) => void;
  setReceiptWindowDays: (value: string) => void;
  setHeldSalePanelOpen: (value: boolean) => void;
  setHeldSaleQuery: (value: string) => void;
  setHeldSaleWindowDays: (value: string) => void;
  setSalesOrderPanelOpen: (value: boolean) => void;
  setSalesOrderQuery: (value: string) => void;
  setSalesOrderWindowDays: (value: string) => void;
  setTransactionDetailsOpen: (value: boolean) => void;
  setTransactionReference: (value: string) => void;
  setTransactionReferenceSearchDismissed: (value: boolean) => void;
  setTransactionDetails: (value: string) => void;
  setShiftOpeningFloat: (value: string) => void;
  setShiftDeclaredCash: (value: string) => void;
  browseCatalog: () => Promise<void>;
  addReceiptLineToBasket: (
    line: StoreReceiptLookupResult["lines"][number],
  ) => Promise<boolean>;
  addScannedItem: () => Promise<void>;
  addCatalogItem: (item: StoreCatalogBrowseItem) => Promise<void>;
  checkoutBasket: () => Promise<void>;
  applyPosDiscountRate: (lineId: string, value: string) => Promise<void>;
  activateSalesOrderMode: () => Promise<void>;
  cancelSalesOrder: (order: StoreSalesOrderSummary) => Promise<void>;
  clearSaleScreen: () => Promise<void>;
  fulfilSalesOrder: (order: StoreSalesOrderSummary) => Promise<void>;
  submitOpenPriceDraft: () => Promise<void>;
  searchCustomers: () => Promise<void>;
  searchAccountCustomers: () => Promise<void>;
  searchReceipts: (options?: {
    receiptKind?: StoreReceiptHistoryKind;
    transactionFilter?: "ALL" | "CORRECTABLE" | "SALE" | "RETURN" | "EXCHANGE";
  }) => Promise<void>;
  attachCustomer: (customer: StoreCustomerSummary | null) => Promise<void>;
  updateBasketLineQuantity: (lineId: string) => Promise<void>;
  addPaymentRow: () => void;
  loadStoreReport: (scope: "CASHIER" | "STORE") => Promise<void>;
  removePaymentRow: (paymentId: string) => void;
  recordAccountPayment: () => Promise<void>;
  openShift: () => Promise<void>;
  closeShift: () => Promise<void>;
  printShiftReport: (
    reportType: "X" | "Z",
    autoPrint?: boolean,
  ) => Promise<void>;
  printAccountPaymentReceipt: (
    entryNo: string,
    autoPrint?: boolean,
  ) => Promise<void>;
  printReceipt: (transactionNo: string, autoPrint?: boolean) => Promise<void>;
  printSalesOrderReceipt: (
    orderNo: string,
    autoPrint?: boolean,
  ) => Promise<void>;
  startReturnFromReceipt: (transactionNo: string) => Promise<void>;
  startExchangeFromReceipt: (transactionNo: string) => Promise<void>;
  saveSalesOrderBasket: () => Promise<void>;
  resumeHeldSale: (
    basket: NonNullable<StoreSyncSnapshot["parkedBaskets"]>[number],
  ) => Promise<void>;
  voidReceipt: (receipt: StoreReceiptSearchResult) => Promise<void>;
  runAction: (
    action: (
      desktopRuntime: DesktopRuntimeApi,
    ) => Promise<StoreSyncActionResult>,
  ) => Promise<StoreSyncActionResult | null>;
}) {
  const selectedCustomer =
    props.selectedCustomer &&
    (props.selectedCustomer.customerId === props.activeBasket?.customerId ||
      props.selectedCustomer.customerNo === props.activeBasket?.customerNo)
      ? props.selectedCustomer
      : null;
  const customerName =
    props.activeBasket?.customerName ??
    selectedCustomer?.fullName ??
    props.activeBasket?.customerNo ??
    "Walk-in customer";
  const customerContact =
    selectedCustomer?.phone ?? selectedCustomer?.email ?? "No contact";
  const customerBalance = selectedCustomer?.receivableBalanceAmount ?? null;
  const customerCreditLimit = selectedCustomer?.creditLimitAmount ?? null;
  const canSell = props.canUsePosLane;
  const isReadOnlyVoid = props.isVoidReviewBasket;
  const activeSalesOrder =
    props.snapshot?.salesOrders.find(
      (order) =>
        order.status === "OPEN" &&
        order.sourceTransactionId === props.activeBasket?.transactionId,
    ) ?? null;
  const isReadOnlySalesOrder = Boolean(activeSalesOrder);
  const canEditBasket = canSell && !isReadOnlyVoid && !isReadOnlySalesOrder;
  const capabilities =
    props.snapshot?.activeOperatorSession?.capabilities ?? null;
  const canAttachCustomer =
    canEditBasket && capabilities?.canAttachCustomer === true;
  const canSearchReceipt = capabilities?.canSearchReceipt === true;
  const canProcessReturn = capabilities?.canProcessReturn === true;
  const canProcessExchange = capabilities?.canProcessExchange === true;
  const canCollectAccountPayment =
    capabilities?.canCollectAccountPayment === true;
  const canRedeemLoyalty = capabilities?.canRedeemLoyalty === true;
  const canReprintReceipt = capabilities?.canReprintReceipt === true;
  const selectedAccountTender = props.accountTenderMethods.find(
    (method) =>
      method.tenderMethodCode === props.accountPaymentTenderMethodCode,
  );
  const accountTenderNeedsBankAccount = tenderRequiresBankAccount(
    selectedAccountTender,
  );
  const paymentTotal = props.paymentDrafts.reduce(
    (sum, draft) => sum + (Number(draft.amount) || 0),
    0,
  );
  const basketTotal = Math.abs(props.activeBasket?.totalAmount ?? 0);
  const payableTotal = activeSalesOrder
    ? Math.max(0, activeSalesOrder.balanceAmount)
    : basketTotal;
  const amountDue = Math.max(0, payableTotal - paymentTotal);
  const changeDue = Math.max(0, paymentTotal - payableTotal);
  function resolveLineDiscountRate(line: StoreBasketLineSummary) {
    if (!line.hasManualDiscountOverride || line.discountAmount <= 0) {
      return null;
    }

    return (props.snapshot?.optionSettings.posDiscountRates ?? []).find((rate) => {
      const expectedDiscount = Number(
        (line.quantity * line.unitPrice * (rate / 100)).toFixed(2),
      );

      return Math.abs(expectedDiscount - line.discountAmount) < 0.01;
    }) ?? null;
  }

  const isTenderShort = payableTotal > 0 && amountDue > 0.005;
  const missingBankAccountTender = props.paymentDrafts.some((draft) => {
    const tender = props.tenderMethods.find(
      (method) => method.tenderMethodCode === draft.tenderMethodCode,
    );

    return tenderRequiresBankAccount(tender) && !draft.bankAccountId;
  });
  const visibleAccountEntries = props.selectedAccountCustomer
    ? (props.snapshot?.recentCustomerAccountEntries ?? []).filter(
        (entry) =>
          entry.customerId === props.selectedAccountCustomer?.customerId,
      )
    : (props.snapshot?.recentCustomerAccountEntries ?? []);
  const canCreateSalesOrder =
    canEditBasket &&
    props.activeBasket?.transactionType === "SALE" &&
    Boolean(props.activeBasket.customerId) &&
    Boolean(props.activeBasket.lines.length);
  const canOpenShift = capabilities?.canOpenShift === true;
  const canCloseShift = capabilities?.canCloseShift === true;
  const canPrintXReport =
    Boolean(props.activeShift) &&
    (capabilities?.cashierEligible === true ||
      capabilities?.canProcessSale === true ||
      capabilities?.canOpenShift === true);
  const visibleCatalogItems =
    props.saleMode === "SALES_ORDER"
      ? props.catalogItems
      : props.catalogItems.filter(isCatalogItemSellable);
  const receiptLinkedCorrectionActive =
    (props.activeBasket?.transactionType === "RETURN" ||
      props.activeBasket?.transactionType === "EXCHANGE") &&
    Boolean(props.activeBasket?.sourceTransactionId);
  const activeReceiptLookup =
    receiptLinkedCorrectionActive &&
    props.receiptLookup?.sourceTransactionId ===
      props.activeBasket?.sourceTransactionId
      ? props.receiptLookup
      : null;
  const availableReceiptReturnLines =
    activeReceiptLookup?.lines.filter(
      (line) => line.quantityAvailableToReturn > 0,
    ) ?? [];
  const terminalLicenseStatus =
    props.snapshot?.terminalLicenseStatus?.trim().toUpperCase() ?? "UNKNOWN";
  const terminalLicenseExpiry = props.snapshot?.terminalLicensedUntil
    ? formatDate(props.snapshot.terminalLicensedUntil)
    : "No expiry";
  const terminalLicenseExpiryTime = parseLicenseExpiry(
    props.snapshot?.terminalLicensedUntil,
  );
  const terminalLicenseTone =
    isUsableLicenseStatus(terminalLicenseStatus) &&
    (terminalLicenseExpiryTime === null || terminalLicenseExpiryTime >= Date.now())
      ? "good"
      : "bad";
  const selectedSerialNumbers = parseSerialDraft(
    props.openPriceDraft?.serialNumbers ?? "",
  );
  const openPriceQuantity = Number(props.openPriceDraft?.quantity ?? 0);
  const openPriceSerialMismatch =
    Boolean(props.openPriceDraft?.isSerialized) &&
    (!Number.isFinite(openPriceQuantity) ||
      selectedSerialNumbers.length !== openPriceQuantity);
  const openPriceMatrixVariants = props.openPriceDraft
    ? filterMatrixVariants(
        props.openPriceDraft.matrixVariants,
        props.openPriceDraft.variantSearch,
        props.openPriceDraft.productVariantCode,
      )
    : [];
  const openPriceIsMatrix =
    Boolean(props.openPriceDraft) &&
    props.openPriceDraft?.productType === "MATRIX" &&
    props.openPriceDraft.matrixVariants.length > 0;
  const openPriceSizeOptions = props.snapshot?.optionSettings.productSizes ?? [];
  const openPriceSelectedColour = normalizeProductColour(
    props.openPriceDraft?.variantColor,
  );
  const openPriceSelectedColourName = getProductColourName(
    props.openPriceDraft?.variantColor,
  );

  function setOpenPriceColour(value: string) {
    const nextColour = normalizeProductColour(value);

    props.setOpenPriceDraft((draft) =>
      draft ? { ...draft, variantColor: nextColour } : draft,
    );
  }

  function setSerialDraftMessage(message: string | null) {
    props.setOpenPriceDraft((draft) =>
      draft ? { ...draft, serialValidationMessage: message } : draft,
    );
  }

  function addSerialCandidates(candidates: string[]) {
    props.setOpenPriceDraft((draft) => {
      if (!draft) {
        return draft;
      }

      const availableByKey = new Map(
        draft.availableSerialNumbers.map((serialNumber) => [
          serialNumber.toUpperCase(),
          serialNumber,
        ]),
      );
      const current = parseSerialDraft(draft.serialNumbers);
      const currentKeys = new Set(
        current.map((serialNumber) => serialNumber.toUpperCase()),
      );
      const accepted: string[] = [];
      const rejected: string[] = [];

      for (const candidate of candidates
        .map((value) => value.trim())
        .filter(Boolean)) {
        const availableSerial = availableByKey.get(candidate.toUpperCase());

        if (!availableSerial) {
          rejected.push(candidate);
          continue;
        }

        if (!currentKeys.has(availableSerial.toUpperCase())) {
          currentKeys.add(availableSerial.toUpperCase());
          accepted.push(availableSerial);
        }
      }

      return {
        ...draft,
        serialNumbers: [...current, ...accepted].join("\n"),
        serialEntry: "",
        serialRangeStart: "",
        serialRangeEnd: "",
        serialValidationMessage: rejected.length
          ? `${rejected.slice(0, 3).join(", ")} ${rejected.length === 1 ? "is" : "are"} not available for this item and shop.`
          : accepted.length
            ? `${accepted.length} serial number(s) added.`
            : "No new serial numbers were added.",
      };
    });
  }

  function addSerialRange() {
    const draft = props.openPriceDraft;
    const start = draft?.serialRangeStart.trim().toUpperCase() ?? "";
    const end = draft?.serialRangeEnd.trim().toUpperCase() ?? "";

    if (!draft || !start || !end) {
      setSerialDraftMessage(
        "Enter both range start and range end serial numbers.",
      );
      return;
    }

    const [lower, upper] =
      start.localeCompare(end) <= 0 ? [start, end] : [end, start];
    const candidates = draft.availableSerialNumbers.filter((serialNumber) => {
      const key = serialNumber.toUpperCase();

      return key.localeCompare(lower) >= 0 && key.localeCompare(upper) <= 0;
    });

    if (!candidates.length) {
      setSerialDraftMessage(
        "No available serial numbers were found inside that range.",
      );
      return;
    }

    addSerialCandidates(candidates);
  }
  const filteredHeldSales = useMemo(() => {
    const query = props.heldSaleQuery.trim().toUpperCase();

    return (props.snapshot?.parkedBaskets ?? [])
      .filter((basket) =>
        isWithinDayWindow(basket.updatedAt, props.heldSaleWindowDays),
      )
      .filter((basket) =>
        matchesText(query, [
          basket.transactionNo,
          basket.sourceTransactionNo,
          basket.customerNo,
          basket.customerName,
          basket.transactionType,
        ]),
      )
      .slice(0, 30);
  }, [
    props.heldSaleQuery,
    props.heldSaleWindowDays,
    props.snapshot?.parkedBaskets,
  ]);
  const filteredSalesOrders = useMemo(() => {
    const query = props.salesOrderQuery.trim().toUpperCase();

    return (props.snapshot?.salesOrders ?? [])
      .filter((order) => order.status === "OPEN")
      .filter((order) =>
        isWithinDayWindow(
          order.updatedAt ?? order.createdAt,
          props.salesOrderWindowDays,
        ),
      )
      .filter((order) =>
        matchesText(query, [
          order.orderNo,
          order.sourceTransactionNo,
          order.customerNo,
          order.customerName,
          order.operatorName,
          order.status,
        ]),
      )
      .slice(0, 30);
  }, [
    props.salesOrderQuery,
    props.salesOrderWindowDays,
    props.snapshot?.salesOrders,
  ]);

  return (
    <div
      className={`rms-workspace rms-pos-grid${props.saleMode === "SALES_ORDER" ? " is-sales-order-mode" : ""}`}
    >
      <section className="rms-panel rms-pos-cart">
        {isReadOnlyVoid ? (
          <div className="rms-banner is-warn">
            Void review mode is locked. Review the loaded receipt lines, then
            use the final void button to post and print the correction receipt.
          </div>
        ) : null}
        {activeSalesOrder ? (
          <div className="rms-banner is-warn">
            <strong>{activeSalesOrder.orderNo}</strong> is locked for
            fulfilment. Deposit {formatMoney(activeSalesOrder.depositAmount)} -
            Balance {formatMoney(activeSalesOrder.balanceAmount)}
          </div>
        ) : null}
        <div className="rms-pos-head">
          <div>
            <span>Customer</span>
            <strong>{customerName}</strong>
            <div className="rms-customer-meta">
              <small>
                {selectedCustomer?.customerNo ??
                  props.activeBasket?.customerNo ??
                  "No customer account"}
              </small>
              {selectedCustomer ? <small>{customerContact}</small> : null}
              {customerBalance !== null ? (
                <small>Balance {formatMoney(customerBalance)}</small>
              ) : null}
              {customerCreditLimit !== null ? (
                <small>Limit {formatMoney(customerCreditLimit)}</small>
              ) : null}
              {selectedCustomer?.loyaltyEnrolled ? (
                <small>{`Loyalty ${formatNumber(selectedCustomer.loyaltyPointsBalance)} pts`}</small>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rms-typeahead">
          <div className="rms-customer-strip">
            <input
              disabled={isReadOnlyVoid || isReadOnlySalesOrder}
              onChange={(event) => props.setCustomerQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void props.searchCustomers();
                }
              }}
              placeholder="Start typing customer name, no, phone, or email"
              value={props.customerQuery}
            />
            <button
              className="rms-button"
              disabled={
                props.isBusy || !props.activeBasket || !canAttachCustomer
              }
              onClick={() => void props.attachCustomer(null)}
              type="button"
            >
              Walk-in
            </button>
          </div>

          {props.customers.length > 0 ? (
            <div className="rms-suggestion-list">
              {props.customers.map((customer) => (
                <button
                  className="rms-suggestion-row"
                  disabled={!canAttachCustomer}
                  key={customer.customerId}
                  onClick={() => void props.attachCustomer(customer)}
                  type="button"
                >
                  <div>
                    <strong>{customer.fullName}</strong>
                    <span>
                      {customer.customerNo} ·{" "}
                      {customer.phone ?? customer.email ?? "No contact"}
                      {customer.loyaltyEnrolled
                        ? ` · Loyalty ${formatNumber(customer.loyaltyPointsBalance)} pts`
                        : ""}
                    </span>
                  </div>
                  <small>{formatMoney(customer.receivableBalanceAmount)}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rms-typeahead">
          <div className="rms-scan-strip">
            <input
              autoFocus
              disabled={isReadOnlyVoid || isReadOnlySalesOrder}
              onChange={(event) => props.setScanQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void props.addScannedItem();
                }
              }}
              placeholder="Scan barcode or type product code"
              value={props.scanQuery}
            />
            <input
              disabled={isReadOnlyVoid}
              min="1"
              onChange={(event) => props.setScanQuantity(event.target.value)}
              step="1"
              type="number"
              value={props.scanQuantity}
            />
            <button
              className="rms-button is-primary"
              disabled={props.isBusy || !canEditBasket}
              onClick={() => void props.addScannedItem()}
              type="button"
            >
              Add
            </button>
          </div>

          {props.itemSuggestions.length > 0 ? (
            <div className="rms-suggestion-list is-product">
              {props.itemSuggestions.map((item) => (
                <button
                  className="rms-suggestion-row"
                  disabled={!canEditBasket}
                  key={item.productCode}
                  onClick={() => void props.addCatalogItem(item)}
                  type="button"
                >
                  <div>
                    <strong>{item.productName}</strong>
                    <span>
                      {item.productCode} · Stock{" "}
                      {formatNumber(
                        item.salesLocationQuantity ?? item.quantityOnHand,
                      )}
                    </span>
                  </div>
                  <small>
                    {item.mustEnterPriceAtPos
                      ? "Enter price"
                      : formatMoney(item.unitPrice)}
                  </small>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rms-table rms-cart-table">
          <div className="rms-table-head">
            <span>#</span>
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Total</span>
            <span />
          </div>
          {props.activeBasket?.lines.length ? (
            props.activeBasket.lines.map((line, index) => {
              const configuredDiscountRate = resolveLineDiscountRate(line);
              const configuredPosDiscountRates =
                props.snapshot?.optionSettings.posDiscountRates ?? [];

              return (
              <div className="rms-table-row" key={line.lineId}>
                <strong>{index + 1}</strong>
                <div>
                  <strong>{line.productName}</strong>
                  <small>
                    {[
                      line.variantAttributesSnapshot,
                      line.productVariantCode
                        ? `Variant ${line.productVariantCode}`
                        : null,
                      line.variantSize ? `Size ${line.variantSize}` : null,
                      line.variantColor ? `Colour ${line.variantColor}` : null,
                      line.serialNumbers.length
                        ? `Serial ${line.serialNumbers.join(", ")}`
                        : null,
                      line.lineNote ? `Note ${line.lineNote}` : null,
                      line.appliedPromotionName ?? line.productCode,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  <label className="rms-pos-discount-select is-line">
                    <span>Disc</span>
                    <select
                      disabled={
                        props.isBusy ||
                        !canEditBasket ||
                        configuredPosDiscountRates.length === 0
                      }
                      onChange={(event) =>
                        void props.applyPosDiscountRate(
                          line.lineId,
                          event.target.value,
                        )
                      }
                      value={configuredDiscountRate?.toFixed(2) ?? ""}
                    >
                      <option value="">
                        {configuredPosDiscountRates.length ? "None" : "No rates"}
                      </option>
                      {configuredPosDiscountRates.map((rate) => (
                        <option key={rate.toFixed(2)} value={rate.toFixed(2)}>
                          {formatDiscountRate(rate)}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <input
                  className="rms-qty-input"
                  disabled={props.isBusy || !canEditBasket}
                  min="1"
                  onBlur={() =>
                    void props.updateBasketLineQuantity(line.lineId)
                  }
                  onChange={(event) =>
                    props.setLineQuantityDrafts((drafts) => ({
                      ...drafts,
                      [line.lineId]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  step="1"
                  type="number"
                  value={
                    props.lineQuantityDrafts[line.lineId] ??
                    String(line.quantity)
                  }
                />
                <span>{formatMoney(line.unitPrice)}</span>
                <strong>{formatMoney(line.lineTotal)}</strong>
                <button
                  aria-label={`Remove ${line.productName}`}
                  className="rms-icon-button is-danger"
                  disabled={props.isBusy || !canEditBasket}
                  onClick={() =>
                    void props.runAction((desktopRuntime) =>
                      desktopRuntime.removeBasketLine(line.lineId),
                    )
                  }
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="rms-trash-svg"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 15h10l1-15" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
              );
            })
          ) : (
            <EmptyState title="No items" detail="Scan or select a product." />
          )}
        </div>

        <div className="rms-total-strip">
          <Stat
            label="Subtotal"
            value={formatMoney(props.activeBasket?.subtotalAmount)}
          />
          <Stat
            label="Discount"
            value={formatMoney(props.activeBasket?.discountAmount)}
          />
          <Stat
            label="Tax"
            value={formatMoney(props.activeBasket?.taxAmount)}
          />
          <Stat
            label="Total"
            tone="good"
            value={formatMoney(props.activeBasket?.totalAmount)}
          />
        </div>

        {props.activeBasket ? (
          <div className="rms-loyalty-strip">
            <div>
              <span>Promotions</span>
              <strong>
                {props.activeBasket.appliedPromotions.length
                  ? props.activeBasket.appliedPromotions
                      .map(
                        (promotion) =>
                          `${promotion.promotionName} (${formatMoney(promotion.discountAmount)})`,
                      )
                      .join(", ")
                  : (props.activeBasket.promotionStatusMessage ??
                    "No promotion applied")}
              </strong>
            </div>
            <div>
              <span>Loyalty</span>
              <strong>
                {props.activeBasket.customerLoyaltyEnrolled
                  ? `${formatNumber(props.activeBasket.customerLoyaltyPointsBalance)} pts · redeemable ${formatMoney(props.activeBasket.maxLoyaltyRedemptionAmount)}`
                  : (props.activeBasket.loyaltyRedemptionMessage ??
                    "No loyalty account")}
              </strong>
            </div>
            <button
              className="rms-row-button"
              disabled={
                props.isBusy ||
                !canEditBasket ||
                !canRedeemLoyalty ||
                !props.activeBasket.loyaltyRedemptionAllowed
              }
              onClick={() =>
                void props.runAction((desktopRuntime) =>
                  desktopRuntime.setActiveBasketLoyaltyRedemption({
                    pointsToRedeem:
                      props.activeBasket?.maxLoyaltyRedemptionPoints ?? 0,
                  }),
                )
              }
              type="button"
            >
              Redeem
            </button>
            <button
              className="rms-row-button"
              disabled={
                props.isBusy ||
                !canEditBasket ||
                props.activeBasket.loyaltyRedemptionPoints <= 0
              }
              onClick={() =>
                void props.runAction((desktopRuntime) =>
                  desktopRuntime.setActiveBasketLoyaltyRedemption({
                    pointsToRedeem: 0,
                  }),
                )
              }
              type="button"
            >
              Clear
            </button>
          </div>
        ) : null}

        {props.saleMode === "SALES_ORDER" ? (
          <div className="rms-payment-panel is-order-mode">
            <div className="rms-payment-summary">
              <strong>{formatMoney(basketTotal)}</strong>
              <span>
                Balance{" "}
                {formatMoney(
                  Math.max(
                    0,
                    basketTotal - (Number(props.salesOrderDepositAmount) || 0),
                  ),
                )}
              </span>
              <button
                className="rms-button is-primary"
                disabled={props.isBusy || !canCreateSalesOrder}
                onClick={() => void props.saveSalesOrderBasket()}
                type="button"
              >
                Save order
              </button>
            </div>
            <div className="rms-payment-row">
              <select
                onChange={(event) =>
                  props.setSalesOrderDepositTenderCode(event.target.value)
                }
                value={
                  props.salesOrderDepositTenderCode ||
                  props.tenderMethods[0]?.tenderMethodCode ||
                  ""
                }
              >
                {props.tenderMethods.length ? (
                  props.tenderMethods.map((method) => (
                    <option
                      key={method.tenderMethodCode}
                      value={method.tenderMethodCode}
                    >
                      {method.tenderMethodName}
                    </option>
                  ))
                ) : (
                  <option value="">No tenders synced</option>
                )}
              </select>
              <input
                min="0"
                onChange={(event) =>
                  props.setSalesOrderDepositAmount(event.target.value)
                }
                step="0.01"
                type="number"
                value={props.salesOrderDepositAmount}
              />
              <input
                onChange={(event) =>
                  props.setSalesOrderDepositReference(event.target.value)
                }
                placeholder="Deposit reference"
                value={props.salesOrderDepositReference}
              />
            </div>
          </div>
        ) : (
          <div className="rms-payment-panel">
            <div className="rms-payment-summary">
              <strong>{formatMoney(paymentTotal)}</strong>
              <span>
                {activeSalesOrder
                  ? `Deposit ${formatMoney(activeSalesOrder.depositAmount)} - `
                  : ""}
                Due {formatMoney(amountDue)} · Change {formatMoney(changeDue)}
              </span>
              <button
                className="rms-row-button is-add"
                disabled={
                  props.isBusy ||
                  isReadOnlyVoid ||
                  !canSell ||
                  !props.activeBasket
                }
                onClick={props.addPaymentRow}
                type="button"
              >
                Add
              </button>
            </div>
            {props.paymentDrafts.map((payment) => (
              <div className="rms-payment-row" key={payment.id}>
                <select
                  disabled={isReadOnlyVoid}
                  onChange={(event) =>
                    props.setPaymentDrafts((drafts) =>
                      drafts.map((draft) =>
                        draft.id === payment.id
                          ? {
                              ...draft,
                              tenderMethodCode: event.target.value,
                              bankAccountId: "",
                            }
                          : draft,
                      ),
                    )
                  }
                  value={payment.tenderMethodCode}
                >
                  {props.tenderMethods.length ? (
                    props.tenderMethods.map((method) => (
                      <option
                        key={method.tenderMethodCode}
                        value={method.tenderMethodCode}
                      >
                        {method.tenderMethodName}
                      </option>
                    ))
                  ) : (
                    <option value="">No tenders synced</option>
                  )}
                </select>
                <select
                  disabled={
                    isReadOnlyVoid ||
                    !tenderRequiresBankAccount(
                      props.tenderMethods.find(
                        (method) =>
                          method.tenderMethodCode === payment.tenderMethodCode,
                      ),
                    )
                  }
                  onChange={(event) =>
                    props.setPaymentDrafts((drafts) =>
                      drafts.map((draft) =>
                        draft.id === payment.id
                          ? { ...draft, bankAccountId: event.target.value }
                          : draft,
                      ),
                    )
                  }
                  value={payment.bankAccountId}
                >
                  <option value="">Bank account</option>
                  {props.snapshot?.availableBankAccounts.map((account) => (
                    <option
                      key={account.bankAccountId}
                      value={account.bankAccountId}
                    >
                      {account.bankName} · {account.branchName} ·{" "}
                      {account.accountNumber}
                    </option>
                  ))}
                </select>
                <input
                  disabled={isReadOnlyVoid}
                  onChange={(event) =>
                    props.setPaymentDrafts((drafts) =>
                      drafts.map((draft) =>
                        draft.id === payment.id
                          ? { ...draft, amount: event.target.value }
                          : draft,
                      ),
                    )
                  }
                  type="number"
                  value={payment.amount}
                />
                <input
                  disabled={isReadOnlyVoid}
                  onChange={(event) =>
                    props.setPaymentDrafts((drafts) =>
                      drafts.map((draft) =>
                        draft.id === payment.id
                          ? { ...draft, reference: event.target.value }
                          : draft,
                      ),
                    )
                  }
                  placeholder="Reference"
                  value={payment.reference}
                />
                <button
                  className="rms-row-button"
                  disabled={isReadOnlyVoid || props.paymentDrafts.length <= 1}
                  onClick={() => props.removePaymentRow(payment.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="rms-button is-primary"
              disabled={
                props.isBusy ||
                !canSell ||
                !props.activeBasket?.lines.length ||
                (!isReadOnlyVoid && (isTenderShort || missingBankAccountTender))
              }
              onClick={() => void props.checkoutBasket()}
              type="button"
            >
              {isReadOnlyVoid ? "Void transaction" : "Pay"}
            </button>
          </div>
        )}
      </section>

      <section className="rms-panel rms-product-panel">
        <div className="rms-panel-title">
          <div>
            <span>Products</span>
            <h2>Catalog</h2>
          </div>
          <button
            className="rms-button"
            disabled={props.isBusy || isReadOnlyVoid || isReadOnlySalesOrder}
            onClick={() => void props.browseCatalog()}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="rms-filter-row">
          <input
            disabled={isReadOnlyVoid}
            onChange={(event) => props.setCatalogQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void props.browseCatalog();
              }
            }}
            placeholder="Search product, SKU, barcode"
            value={props.catalogQuery}
          />
          <select
            disabled={isReadOnlyVoid}
            onChange={(event) => props.setCatalogDepartment(event.target.value)}
            value={props.catalogDepartment}
          >
            <option value="">All departments</option>
            {props.snapshot?.productDepartments.map((department) => (
              <option
                key={department.departmentCode}
                value={department.departmentCode}
              >
                {department.departmentName}
              </option>
            ))}
          </select>
          <select
            disabled={isReadOnlyVoid || !props.catalogDepartment}
            onChange={(event) => props.setCatalogCategory(event.target.value)}
            value={props.catalogCategory}
          >
            <option value="">All categories</option>
            {props.categoriesForDepartment.map((category) => (
              <option key={category.categoryCode} value={category.categoryCode}>
                {category.categoryName}
              </option>
            ))}
          </select>
        </div>

        <div className="rms-product-grid">
          {visibleCatalogItems.length ? (
            visibleCatalogItems.map((item) => (
              <button
                className="rms-product-tile"
                disabled={props.isBusy || !canEditBasket}
                key={item.productCode}
                onClick={() => void props.addCatalogItem(item)}
                type="button"
              >
                <ProductTileImage
                  imageUrl={item.primaryImageUrl}
                  productName={item.productName}
                  snapshot={props.snapshot}
                />
                <strong>{item.productName}</strong>
                <span>
                  {formatCatalogItemAvailability(item)}
                </span>
                <b>
                  {item.mustEnterPriceAtPos
                    ? "Enter price"
                    : formatMoney(item.unitPrice)}
                </b>
              </button>
            ))
          ) : (
            <EmptyState
              title={
                props.saleMode === "SALES_ORDER"
                  ? "No active catalog products"
                  : isStandaloneDeployment(props.snapshot)
                  ? "No local stock available"
                  : "No sellable stock available"
              }
              detail={
                props.saleMode === "SALES_ORDER"
                  ? "Sync or publish active products before creating this order."
                  : isStandaloneDeployment(props.snapshot)
                  ? "Add products with quantity on hand before using the POS lane."
                  : "Receive, transfer, or sync stock into the shop sales location."
              }
            />
          )}
        </div>
      </section>

      <aside className="rms-panel rms-pos-actions">
        <div className="rms-action-mode">
          <button
            className={`rms-action-button${props.saleMode === "SALE" ? " is-selected" : ""}`}
            disabled={props.isBusy || isReadOnlyVoid || isReadOnlySalesOrder}
            onClick={() => props.setSaleMode("SALE")}
            type="button"
          >
            Sale mode
          </button>
          <button
            className={`rms-action-button${props.saleMode === "SALES_ORDER" ? " is-selected is-order" : ""}`}
            disabled={props.isBusy || isReadOnlyVoid || isReadOnlySalesOrder}
            onClick={() => void props.activateSalesOrderMode()}
            type="button"
          >
            Sales order mode
          </button>
        </div>
        <button
          className="rms-action-button is-clear"
          disabled={props.isBusy || !props.activeBasket}
          onClick={() => void props.clearSaleScreen()}
          type="button"
        >
          {activeSalesOrder ? "Exit fulfilment" : "Clear screen"}
        </button>
        <button
          className="rms-action-button is-hold"
          disabled={
            props.isBusy ||
            isReadOnlyVoid ||
            isReadOnlySalesOrder ||
            !canSell ||
            !props.activeBasket
          }
          onClick={() =>
            void props
              .runAction((desktopRuntime) => desktopRuntime.parkActiveBasket())
              .then((result) => {
                if (result) {
                  props.setHeldSalePanelOpen(true);
                  props.setSalesOrderPanelOpen(false);
                  props.setReceiptPanelOpen(false);
                  props.setAccountPanelOpen(false);
                }
              })
          }
          type="button"
        >
          Hold sale
        </button>
        <button
          className="rms-action-button is-details"
          disabled={props.isBusy || isReadOnlyVoid || isReadOnlySalesOrder}
          onClick={() => props.setTransactionDetailsOpen(true)}
          type="button"
        >
          Details
        </button>
        <button
          className="rms-action-button is-save-order"
          disabled={props.isBusy || !canCreateSalesOrder}
          onClick={() => void props.saveSalesOrderBasket()}
          type="button"
        >
          Save order
        </button>
        <button
          className="rms-action-button is-pending-orders"
          disabled={props.isBusy || isReadOnlyVoid}
          onClick={() => {
            props.setSalesOrderPanelOpen(true);
            props.setHeldSalePanelOpen(false);
            props.setReceiptPanelOpen(false);
            props.setAccountPanelOpen(false);
          }}
          type="button"
        >
          Pending orders
        </button>
        <button
          className="rms-action-button is-account-pay"
          disabled={props.isBusy || isReadOnlyVoid || !canCollectAccountPayment}
          onClick={() => {
            props.setAccountPanelOpen(true);
            props.setHeldSalePanelOpen(false);
            props.setSalesOrderPanelOpen(false);
            props.setReceiptPanelOpen(false);
          }}
          type="button"
        >
          Account pay
        </button>
        <button
          className="rms-action-button is-recall"
          disabled={
            props.isBusy ||
            isReadOnlyVoid ||
            !canSell ||
            !props.snapshot?.parkedBaskets.length
          }
          onClick={() => {
            props.setHeldSalePanelOpen(true);
            props.setSalesOrderPanelOpen(false);
            props.setReceiptPanelOpen(false);
            props.setAccountPanelOpen(false);
          }}
          type="button"
        >
          Recall held
        </button>
        <button
          className="rms-action-button is-receipts"
          disabled={props.isBusy || isReadOnlyVoid || !canSearchReceipt}
          onClick={() => {
            props.setReceiptPanelOpen(true);
            props.setHeldSalePanelOpen(false);
            props.setSalesOrderPanelOpen(false);
            props.setAccountPanelOpen(false);
            void props.searchReceipts({
              receiptKind: props.receiptHistoryKind,
              transactionFilter: "ALL",
            });
          }}
          type="button"
        >
          Receipts
        </button>
        <div className="rms-shift-rail">
          {!props.activeShift && canOpenShift ? (
            <>
              <input
                aria-label="Opening float"
                disabled={isReadOnlyVoid}
                onChange={(event) =>
                  props.setShiftOpeningFloat(event.target.value)
                }
                type="number"
                value={props.shiftOpeningFloat}
              />
              <button
                className="rms-action-button is-open-shift"
                disabled={props.isBusy || isReadOnlyVoid}
                onClick={() => void props.openShift()}
                type="button"
              >
                Open shift
              </button>
            </>
          ) : null}
          <button
            className="rms-action-button is-report"
            disabled={props.isBusy || isReadOnlyVoid || !canPrintXReport}
            onClick={() => void props.printShiftReport("X")}
            type="button"
          >
            X report
          </button>
          {props.activeShift && canCloseShift ? (
            <button
              className="rms-action-button is-close-shift"
              disabled={props.isBusy || isReadOnlyVoid}
              onClick={() => props.setShiftCloseDialogOpen(true)}
              type="button"
            >
              Close shift
            </button>
          ) : null}
        </div>
        <div className="rms-pos-license-card">
          <span>Terminal license</span>
          <strong>{terminalLicenseStatus}</strong>
          <small>
            {props.snapshot?.terminalCode ?? "Terminal"} · {terminalLicenseExpiry}
          </small>
          <StatusPill tone={terminalLicenseTone}>
            {terminalLicenseTone === "good" ? "Licensed" : "Blocked"}
          </StatusPill>
        </div>
      </aside>

      {props.receiptPanelOpen ? (
        <section className="rms-panel rms-receipt-drawer">
          <div className="rms-panel-title">
            <div>
              <span>Receipts</span>
              <h2>History</h2>
            </div>
            <button
              className="rms-button"
              onClick={() => props.setReceiptPanelOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          {receiptLinkedCorrectionActive ? (
            <div className="rms-receipt-correction-panel">
              <div className="rms-receipt-correction-title">
                <strong>
                  {props.activeBasket?.transactionType === "EXCHANGE"
                    ? "Exchange return lines"
                    : "Return lines"}
                </strong>
                <small>
                  Add returned items from{" "}
                  {props.activeBasket?.sourceTransactionNo ??
                    "the original receipt"}
                  . Use product search only for exchange replacement items.
                </small>
              </div>
              {activeReceiptLookup ? (
                availableReceiptReturnLines.length ? (
                  <div className="rms-table rms-receipt-line-table">
                    <div className="rms-table-head">
                      <span>Item</span>
                      <span>Available</span>
                      <span>Qty</span>
                      <span>Serials</span>
                      <span>Add</span>
                    </div>
                    {availableReceiptReturnLines.map((line) => {
                      const serialDraft =
                        props.receiptLineSerialDrafts[line.sourceLineId] ?? "";
                      const selectedSerialNumbers = parseSerialDraft(serialDraft);
                      const isSerializedLine =
                        line.availableSerialNumbersToReturn.length > 0 ||
                        line.serialNumbers.length > 0;

                      return (
                        <div className="rms-table-row" key={line.sourceLineId}>
                          <div>
                            <strong>{line.productName}</strong>
                            <small>
                              {line.productCode} · Sold{" "}
                              {formatNumber(line.quantitySold)} · Returned{" "}
                              {formatNumber(line.quantityReturned)}
                              {line.quantityPending > 0
                                ? ` · Pending ${formatNumber(line.quantityPending)}`
                                : ""}
                            </small>
                          </div>
                          <strong>
                            {formatNumber(line.quantityAvailableToReturn)}
                          </strong>
                          {isSerializedLine ? (
                            <span>{formatNumber(selectedSerialNumbers.length)}</span>
                          ) : (
                            <input
                              className="rms-qty-input"
                              max={line.quantityAvailableToReturn}
                              min="0.001"
                              onChange={(event) =>
                                props.setReceiptLineQuantityDrafts((drafts) => ({
                                  ...drafts,
                                  [line.sourceLineId]: event.target.value,
                                }))
                              }
                              step="0.001"
                              type="number"
                              value={
                                props.receiptLineQuantityDrafts[
                                  line.sourceLineId
                                ] ?? ""
                              }
                            />
                          )}
                          <div className="rms-receipt-line-serials">
                            {isSerializedLine ? (
                              <>
                                <textarea
                                  onChange={(event) =>
                                    props.setReceiptLineSerialDrafts(
                                      (drafts) => ({
                                        ...drafts,
                                        [line.sourceLineId]: event.target.value,
                                      }),
                                    )
                                  }
                                  placeholder="Serials from the original receipt"
                                  rows={2}
                                  value={serialDraft}
                                />
                                <div className="rms-serial-list is-compact">
                                  {line.availableSerialNumbersToReturn.map(
                                    (serialNumber) => {
                                      const selected =
                                        selectedSerialNumbers.some(
                                          (candidate) =>
                                            candidate.toUpperCase() ===
                                            serialNumber.toUpperCase(),
                                        );

                                      return (
                                        <button
                                          className={`rms-row-button${
                                            selected ? " is-add" : ""
                                          }`}
                                          key={serialNumber}
                                          onClick={() =>
                                            props.setReceiptLineSerialDrafts(
                                              (drafts) => {
                                                const current = parseSerialDraft(
                                                  drafts[line.sourceLineId] ?? "",
                                                );
                                                const hasSerial = current.some(
                                                  (candidate) =>
                                                    candidate.toUpperCase() ===
                                                    serialNumber.toUpperCase(),
                                                );
                                                const next = hasSerial
                                                  ? current.filter(
                                                      (candidate) =>
                                                        candidate.toUpperCase() !==
                                                        serialNumber.toUpperCase(),
                                                    )
                                                  : [...current, serialNumber];

                                                return {
                                                  ...drafts,
                                                  [line.sourceLineId]:
                                                    next.join("\n"),
                                                };
                                              },
                                            )
                                          }
                                          type="button"
                                        >
                                          {serialNumber}
                                        </button>
                                      );
                                    },
                                  )}
                                </div>
                              </>
                            ) : (
                              <small>No serials</small>
                            )}
                          </div>
                          <button
                            className="rms-row-button is-add"
                            disabled={
                              props.isBusy ||
                              line.quantityAvailableToReturn <= 0 ||
                              (isSerializedLine &&
                                selectedSerialNumbers.length === 0)
                            }
                            onClick={() =>
                              void props.addReceiptLineToBasket(line)
                            }
                            type="button"
                          >
                            Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No returnable lines"
                    detail="Every line on the original receipt is already returned or pending."
                  />
                )
              ) : (
                <EmptyState
                  title="Loading receipt lines"
                  detail="The original receipt details are being prepared."
                />
              )}
            </div>
          ) : null}
          <div className="rms-receipt-filters">
            <select
              onChange={(event) =>
                props.setReceiptHistoryKind(
                  event.target.value as StoreReceiptHistoryKind,
                )
              }
              value={props.receiptHistoryKind}
            >
              <option value="SALES">Sales receipts</option>
              <option value="SALES_ORDER">Sales order receipts</option>
              <option value="ACCOUNT_PAYMENT">Account payment receipts</option>
            </select>
            <input
              onChange={(event) => props.setReceiptQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void props.searchReceipts({
                    receiptKind: props.receiptHistoryKind,
                    transactionFilter: "ALL",
                  });
                }
              }}
              placeholder={
                props.receiptHistoryKind === "ACCOUNT_PAYMENT"
                  ? "Receipt, customer, cashier, reference"
                  : props.receiptHistoryKind === "SALES_ORDER"
                    ? "Order, receipt, customer, cashier, item"
                  : "Receipt, customer, cashier, item"
              }
              value={props.receiptQuery}
            />
            <select
              onChange={(event) =>
                props.setReceiptWindowDays(event.target.value)
              }
              value={props.receiptWindowDays}
            >
              <option value="1">Today</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
            <button
              className="rms-button is-primary"
              disabled={props.isBusy || !canSearchReceipt}
              onClick={() =>
                void props.searchReceipts({
                  receiptKind: props.receiptHistoryKind,
                  transactionFilter: "ALL",
                })
              }
              type="button"
            >
              Filter
            </button>
          </div>
          <div className="rms-list rms-receipt-list">
            {props.receiptResults.length ? (
              props.receiptResults.map((receipt) => (
                <div
                  className="rms-list-row rms-receipt-row"
                  key={receipt.transactionId}
                >
                  <div>
                    <strong>{receipt.transactionNo}</strong>
                    <span>
                      {formatDate(receipt.completedAt)} ·{" "}
                      {receipt.customerName ?? "Walk-in"} ·{" "}
                      {receipt.cashierCode ?? "cashier"}
                    </span>
                    <small>
                      {receipt.receiptKind === "ACCOUNT_PAYMENT"
                        ? receipt.productPreview.join(", ") ||
                          "Account payment receipt"
                        : receipt.receiptKind === "SALES_ORDER"
                          ? receipt.productPreview.join(", ") ||
                            `${receipt.lineCount} order line(s)`
                        : receipt.productPreview.join(", ") ||
                          `${receipt.lineCount} line(s)`}
                    </small>
                  </div>
                  <strong>{formatMoney(receipt.totalAmount)}</strong>
                  <div
                    className={
                      receipt.receiptKind === "SALES"
                        ? "rms-receipt-actions is-four"
                        : "rms-receipt-actions"
                    }
                  >
                    <button
                      className="rms-row-button"
                      disabled={props.isBusy || !canReprintReceipt}
                      onClick={() =>
                        void (receipt.receiptKind === "ACCOUNT_PAYMENT"
                          ? props.printAccountPaymentReceipt(
                              receipt.transactionNo,
                            )
                          : receipt.receiptKind === "SALES_ORDER"
                            ? props.printSalesOrderReceipt(
                                receipt.transactionNo,
                              )
                          : props.printReceipt(receipt.transactionNo))
                      }
                      type="button"
                    >
                      Reprint
                    </button>
                    {receipt.receiptKind === "SALES" ? (
                      <>
                        <button
                          className="rms-row-button"
                          disabled={
                            props.isBusy ||
                            !canProcessReturn ||
                            !receipt.canStartReturn
                          }
                          onClick={() =>
                            void props.startReturnFromReceipt(
                              receipt.transactionNo,
                            )
                          }
                          type="button"
                        >
                          Return
                        </button>
                        <button
                          className="rms-row-button"
                          disabled={
                            props.isBusy ||
                            !canProcessExchange ||
                            !receipt.canStartExchange
                          }
                          onClick={() =>
                            void props.startExchangeFromReceipt(
                              receipt.transactionNo,
                            )
                          }
                          type="button"
                        >
                          Exchange
                        </button>
                        <button
                          className="rms-row-button is-danger"
                          disabled={
                            props.isBusy ||
                            !canProcessReturn ||
                            !receipt.canStartReturn
                          }
                          onClick={() => void props.voidReceipt(receipt)}
                          type="button"
                        >
                          Void
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No receipts"
                detail={
                  props.receiptHistoryKind === "ACCOUNT_PAYMENT"
                    ? "Filter account payment receipts by date, customer, cashier, reference, or receipt number."
                    : props.receiptHistoryKind === "SALES_ORDER"
                      ? "Filter sales order receipts by date, customer, cashier, order number, or item."
                    : "Filter receipt history by date, customer, cashier, receipt, or item."
                }
              />
            )}
          </div>
        </section>
      ) : null}

      {props.heldSalePanelOpen ? (
        <section className="rms-panel rms-receipt-drawer">
          <div className="rms-panel-title">
            <div>
              <span>Held sales</span>
              <h2>Recall</h2>
            </div>
            <button
              className="rms-button"
              onClick={() => props.setHeldSalePanelOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="rms-receipt-filters">
            <input
              onChange={(event) => props.setHeldSaleQuery(event.target.value)}
              placeholder="Receipt, customer, type"
              value={props.heldSaleQuery}
            />
            <select
              onChange={(event) =>
                props.setHeldSaleWindowDays(event.target.value)
              }
              value={props.heldSaleWindowDays}
            >
              <option value="1">Today</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
            <StatusPill>{`${filteredHeldSales.length} shown`}</StatusPill>
          </div>
          <div className="rms-list rms-receipt-list">
            {filteredHeldSales.length ? (
              filteredHeldSales.map((basket) => (
                <div
                  className="rms-list-row rms-receipt-row"
                  key={basket.transactionId}
                >
                  <div>
                    <strong>{basket.transactionNo}</strong>
                    <span>
                      {formatDate(basket.updatedAt)} ·{" "}
                      {basket.customerName ?? basket.customerNo ?? "Walk-in"} ·{" "}
                      {basket.transactionType}
                    </span>
                    <small>
                      {basket.sourceTransactionNo
                        ? `${basket.sourceTransactionNo} · `
                        : ""}
                      {formatNumber(basket.itemCount)} item(s) ·{" "}
                      {formatNumber(basket.lineCount)} line(s)
                    </small>
                  </div>
                  <strong>{formatMoney(basket.totalAmount)}</strong>
                  <div className="rms-receipt-actions is-two">
                    <StatusPill
                      tone={
                        basket.transactionType === "RETURN"
                          ? "warn"
                          : basket.transactionType === "EXCHANGE"
                            ? "neutral"
                            : "good"
                      }
                    >
                      {basket.transactionType}
                    </StatusPill>
                    <button
                      className="rms-row-button"
                      disabled={props.isBusy || !canSell || isReadOnlyVoid}
                      onClick={() => void props.resumeHeldSale(basket)}
                      type="button"
                    >
                      Resume
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No held sales"
                detail="No held baskets match the current filters."
              />
            )}
          </div>
        </section>
      ) : null}

      {props.salesOrderPanelOpen ? (
        <section className="rms-panel rms-receipt-drawer">
          <div className="rms-panel-title">
            <div>
              <span>Sales orders</span>
              <h2>Fulfilment</h2>
            </div>
            <button
              className="rms-button"
              onClick={() => props.setSalesOrderPanelOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="rms-receipt-filters">
            <input
              onChange={(event) => props.setSalesOrderQuery(event.target.value)}
              placeholder="Order, customer, cashier"
              value={props.salesOrderQuery}
            />
            <select
              onChange={(event) =>
                props.setSalesOrderWindowDays(event.target.value)
              }
              value={props.salesOrderWindowDays}
            >
              <option value="1">Today</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
            <StatusPill>{`${filteredSalesOrders.length} shown`}</StatusPill>
          </div>
          <div className="rms-list rms-receipt-list">
            {filteredSalesOrders.length ? (
              filteredSalesOrders.map((order) => (
                <div
                  className="rms-list-row rms-receipt-row"
                  key={order.orderId}
                >
                  <div>
                    <strong>{order.orderNo}</strong>
                    <span>
                      {formatDate(order.createdAt)} ·{" "}
                      {order.customerName ?? order.customerNo ?? "No customer"}{" "}
                      · {order.operatorName ?? "cashier"}
                    </span>
                    <small>
                      {order.sourceTransactionNo} ·{" "}
                      {formatNumber(order.itemCount)} item(s) · Deposit{" "}
                      {formatMoney(order.depositAmount)} · Balance{" "}
                      {formatMoney(order.balanceAmount)}
                    </small>
                  </div>
                  <strong>{formatMoney(order.totalAmount)}</strong>
                  <div className="rms-receipt-actions">
                    <StatusPill tone={getSalesOrderStatusTone(order)}>
                      {order.status}
                    </StatusPill>
                    <button
                      className="rms-row-button"
                      disabled={
                        props.isBusy ||
                        !canSell ||
                        Boolean(props.activeBasket) ||
                        order.status !== "OPEN"
                      }
                      onClick={() => void props.fulfilSalesOrder(order)}
                      type="button"
                    >
                      Fulfil
                    </button>
                    <button
                      className="rms-row-button is-danger"
                      disabled={props.isBusy || order.status !== "OPEN"}
                      onClick={() => void props.cancelSalesOrder(order)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No sales orders"
                detail="Filter by date, customer, order number, or sales cashier."
              />
            )}
          </div>
        </section>
      ) : null}

      {props.accountPanelOpen ? (
        <section className="rms-panel rms-receipt-drawer rms-account-drawer">
          <div className="rms-panel-title">
            <div>
              <span>Customer account</span>
              <h2>Payment</h2>
            </div>
            <button
              className="rms-button"
              onClick={() => props.setAccountPanelOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="rms-receipt-filters">
            <input
              onChange={(event) => {
                props.setAccountCustomerQuery(event.target.value);
                props.setSelectedAccountCustomer(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void props.searchAccountCustomers();
                }
              }}
              placeholder="Customer name, no, phone, or email"
              value={props.accountCustomerQuery}
            />
            <button
              className="rms-button is-primary"
              disabled={props.isBusy || !canCollectAccountPayment}
              onClick={() => void props.searchAccountCustomers()}
              type="button"
            >
              Search
            </button>
            <StatusPill>{`${props.accountCustomers.length} shown`}</StatusPill>
          </div>
          <div className="rms-account-layout">
            <div className="rms-list">
              {props.accountCustomers.length ? (
                props.accountCustomers.map((customer) => (
                  <button
                    className="rms-list-row rms-account-customer"
                    key={customer.customerId}
                    onClick={() => {
                      props.setSelectedAccountCustomer(customer);
                      props.setAccountPaymentAmount(
                        customer.receivableBalanceAmount.toFixed(2),
                      );
                    }}
                    type="button"
                  >
                    <div>
                      <strong>{customer.fullName}</strong>
                      <span>
                        {customer.customerNo} ·{" "}
                        {customer.phone ?? customer.email ?? "No contact"}
                      </span>
                    </div>
                    <strong>
                      {formatMoney(customer.receivableBalanceAmount)}
                    </strong>
                  </button>
                ))
              ) : (
                <EmptyState
                  title="No customer balances"
                  detail="Search for accounts with outstanding balances."
                />
              )}
            </div>
            <div className="rms-account-form">
              {props.selectedAccountCustomer ? (
                <>
                  <div className="rms-account-summary">
                    <span>Selected customer</span>
                    <strong>{props.selectedAccountCustomer.fullName}</strong>
                    <small>
                      {props.selectedAccountCustomer.customerNo} · Balance{" "}
                      {formatMoney(
                        props.selectedAccountCustomer.receivableBalanceAmount,
                      )}
                    </small>
                  </div>
                  <label className="rms-field">
                    <span>Tender</span>
                    <select
                      onChange={(event) =>
                        props.setAccountPaymentTenderMethodCode(
                          event.target.value,
                        )
                      }
                      value={props.accountPaymentTenderMethodCode}
                    >
                      {props.accountTenderMethods.map((method) => (
                        <option
                          key={method.tenderMethodCode}
                          value={method.tenderMethodCode}
                        >
                          {method.tenderMethodName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rms-field">
                    <span>Amount</span>
                    <input
                      max={
                        props.selectedAccountCustomer.receivableBalanceAmount
                      }
                      min="0.01"
                      onChange={(event) =>
                        props.setAccountPaymentAmount(event.target.value)
                      }
                      step="0.01"
                      type="number"
                      value={props.accountPaymentAmount}
                    />
                  </label>
                  <label className="rms-field">
                    <span>Reference</span>
                    <input
                      onChange={(event) =>
                        props.setAccountPaymentReference(event.target.value)
                      }
                      placeholder="Receipt, cheque, mobile money ref"
                      value={props.accountPaymentReference}
                    />
                  </label>
                  <label className="rms-field">
                    <span>Note</span>
                    <textarea
                      onChange={(event) =>
                        props.setAccountPaymentNote(event.target.value)
                      }
                      placeholder="Optional collection note"
                      value={props.accountPaymentNote}
                    />
                  </label>
                  {accountTenderNeedsBankAccount ? (
                    <label className="rms-field">
                      <span>Bank account</span>
                      <select
                        onChange={(event) =>
                          props.setAccountPaymentBankAccountId(
                            event.target.value,
                          )
                        }
                        value={props.accountPaymentBankAccountId}
                      >
                        <option value="">Select bank account</option>
                        {props.snapshot?.availableBankAccounts.map(
                          (account) => (
                            <option
                              key={account.bankAccountId}
                              value={account.bankAccountId}
                            >
                              {account.bankName} · {account.branchName} ·{" "}
                              {account.accountNumber}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  ) : null}
                  <button
                    className="rms-button is-primary"
                    disabled={
                      props.isBusy ||
                      !canCollectAccountPayment ||
                      (accountTenderNeedsBankAccount &&
                        !props.accountPaymentBankAccountId)
                    }
                    onClick={() => void props.recordAccountPayment()}
                    type="button"
                  >
                    Record payment
                  </button>
                </>
              ) : (
                <EmptyState
                  title="Select a customer"
                  detail="The updated receivable balance will be shown before collection."
                />
              )}
            </div>
          </div>
          <div className="rms-list rms-account-entries">
            {visibleAccountEntries.slice(0, 6).map((entry) => (
              <div className="rms-list-row" key={entry.entryId}>
                <div>
                  <strong>{entry.entryNo}</strong>
                  <span>
                    {entry.customerName} ·{" "}
                    {entry.tenderMethodName ?? entry.paymentMethod}
                  </span>
                </div>
                <strong>{formatMoney(entry.amount)}</strong>
                <small>{formatDate(entry.occurredAt)}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {props.reportPanelOpen ? (
        <section className="rms-panel rms-receipt-drawer rms-report-drawer">
          <div className="rms-panel-title">
            <div>
              <span>Cashier reports</span>
              <h2>My sales</h2>
            </div>
            <button
              className="rms-button"
              onClick={() => props.setReportPanelOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <ReportsView
            canFilterCashier={false}
            isBusy={props.isBusy}
            loadStoreReport={props.loadStoreReport}
            report={props.cashierReport}
            reportCashierCode=""
            reportCustomerQuery={props.reportCustomerQuery}
            reportDateFrom={props.reportDateFrom}
            reportDateTo={props.reportDateTo}
            reportProductQuery={props.reportProductQuery}
            scope="CASHIER"
            setReportCashierCode={() => undefined}
            setReportCustomerQuery={props.setReportCustomerQuery}
            setReportDateFrom={props.setReportDateFrom}
            setReportDateTo={props.setReportDateTo}
            setReportProductQuery={props.setReportProductQuery}
            snapshot={props.snapshot}
          />
        </section>
      ) : null}

      {props.transactionDetailsOpen ? (
        <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
          <section className="rms-dialog">
            <div className="rms-panel-title">
              <div>
                <span>Transaction</span>
                <h2>Additional details</h2>
              </div>
              <button
                className="rms-button"
                onClick={() => props.setTransactionDetailsOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="rms-typeahead rms-reference-typeahead">
              <label className="rms-field">
                <span>Reference</span>
                <input
                  autoComplete="off"
                  onChange={(event) => {
                    props.setTransactionReference(event.target.value);
                    props.setTransactionReferenceSearchDismissed(false);
                  }}
                  placeholder="Walk-in phone number"
                  value={props.transactionReference}
                />
              </label>
              {props.transactionReferenceMatches.length > 0 ? (
                <div className="rms-suggestion-list">
                  {props.transactionReferenceMatches.map((match) => (
                    <button
                      className="rms-suggestion-row"
                      key={match.id}
                      onClick={() => {
                        props.setTransactionReference(match.reference);
                        props.setTransactionDetails(match.details ?? "");
                        props.setTransactionReferenceSearchDismissed(true);
                      }}
                      type="button"
                    >
                      <div>
                        <strong>{match.reference}</strong>
                        <span>{match.details ?? "No saved details"}</span>
                      </div>
                      <small>{formatNumber(match.useCount)} use(s)</small>
                    </button>
                  ))}
                </div>
              ) : null}
              <small
                aria-live="polite"
                className="rms-reference-search-status"
              >
                {props.transactionReferenceSearchPending
                  ? "Searching saved references..."
                  : props.transactionReferenceSearchAttempted &&
                      props.transactionReferenceMatches.length === 0
                    ? "No saved reference matched."
                    : ""}
              </small>
            </div>
            <label className="rms-field">
              <span>Details</span>
              <textarea
                onChange={(event) =>
                  props.setTransactionDetails(event.target.value)
                }
                placeholder="Walk-in customer name or sale comments"
                value={props.transactionDetails}
              />
            </label>
            <div className="rms-dialog-actions">
              <button
                className="rms-button"
                onClick={() => props.setTransactionDetailsOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rms-button is-primary"
                onClick={() => props.setTransactionDetailsOpen(false)}
                type="button"
              >
                Save
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {props.openPriceDraft ? (
        <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
          <section className="rms-dialog">
            <div className="rms-panel-title">
              <div>
                <span>
                  {props.openPriceDraft.isSerialized
                    ? "Serialized item"
                    : "Open price"}
                </span>
                <h2>{props.openPriceDraft.productName}</h2>
              </div>
              <button
                className="rms-button"
                onClick={() => props.setOpenPriceDraft(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="rms-form-grid">
              <label className="rms-field">
                <span>Quantity</span>
                <input
                  min="0.001"
                  onChange={(event) =>
                    props.setOpenPriceDraft((draft) =>
                      draft
                        ? { ...draft, quantity: event.target.value }
                        : draft,
                    )
                  }
                  step="0.001"
                  type="number"
                  value={props.openPriceDraft.quantity}
                />
              </label>
              {openPriceIsMatrix ? (
                <label className="rms-field rms-variant-picker">
                  <span>Variant</span>
                  <input
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) =>
                        draft
                          ? { ...draft, variantSearch: event.target.value }
                          : draft,
                      )
                    }
                    placeholder="Search code, barcode, SKU, size, colour"
                    type="search"
                    value={props.openPriceDraft.variantSearch}
                  />
                  <select
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) => {
                        if (!draft) {
                          return draft;
                        }

                        const selectedVariant = resolveMatrixVariant(
                          draft.matrixVariants,
                          event.target.value || null,
                        );
                        const selectedLabel = selectedVariant
                          ? formatMatrixVariantLabel(selectedVariant)
                          : "";

                        return {
                          ...draft,
                          productVariantCode:
                            selectedVariant?.variantCode ?? null,
                          unitPrice:
                            selectedVariant && !draft.mustEnterPriceAtPos
                              ? String(selectedVariant.unitPrice)
                              : draft.unitPrice,
                          variantAttributesSnapshot: selectedLabel,
                        };
                      })
                    }
                    value={props.openPriceDraft.productVariantCode ?? ""}
                  >
                    <option value="">Select variant</option>
                    {openPriceMatrixVariants.map((variant) => (
                      <option
                        key={variant.variantCode}
                        value={variant.variantCode}
                      >
                        {`${formatMatrixVariantLabel(variant)} - ${formatMoney(variant.unitPrice)} - ${formatNumber(variant.quantityOnHand)} in stock`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!openPriceIsMatrix && props.openPriceDraft.trackSize ? (
                <label className="rms-field">
                  <span>Size</span>
                  <select
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) =>
                        draft
                          ? { ...draft, variantSize: event.target.value }
                          : draft,
                      )
                    }
                    value={props.openPriceDraft.variantSize}
                  >
                    <option value="">Select size</option>
                    {openPriceSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!openPriceIsMatrix && props.openPriceDraft.trackColor ? (
                <div className="rms-field rms-colour-picker rms-form-span-all">
                  <span>Colour</span>
                  <div className="rms-colour-picker-current">
                    <i
                      aria-hidden="true"
                      style={
                        {
                          "--rms-product-colour": openPriceSelectedColour,
                        } as CSSProperties
                      }
                    />
                    <strong>{openPriceSelectedColourName}</strong>
                  </div>
                  <div className="rms-colour-swatch-grid">
                    {productColourOptions.map((option) => {
                      const selected =
                        normalizeProductColour(option.value) ===
                        openPriceSelectedColour;

                      return (
                        <button
                          aria-label={`Colour ${option.name}`}
                          aria-pressed={selected}
                          className={`rms-colour-swatch${
                            selected ? " is-selected" : ""
                          }`}
                          key={option.value}
                          onClick={() => setOpenPriceColour(option.value)}
                          style={
                            {
                              "--rms-product-colour": option.value,
                            } as CSSProperties
                          }
                          title={option.name}
                          type="button"
                        >
                          <i aria-hidden="true" />
                          <span>{option.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label className="rms-colour-custom-picker">
                    <span>Custom</span>
                    <input
                      aria-label="Custom colour"
                      onChange={(event) => setOpenPriceColour(event.target.value)}
                      type="color"
                      value={openPriceSelectedColour}
                    />
                  </label>
                </div>
              ) : null}
              {props.openPriceDraft.mustEnterPriceAtPos ? (
                <label className="rms-field">
                  <span>Unit price</span>
                  <input
                    autoFocus
                    min="0.01"
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) =>
                        draft
                          ? { ...draft, unitPrice: event.target.value }
                          : draft,
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !props.openPriceDraft?.isSerialized
                      ) {
                        event.preventDefault();
                        void props.submitOpenPriceDraft();
                      }
                    }}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={props.openPriceDraft.unitPrice}
                  />
                </label>
              ) : (
                <div className="rms-readonly-field">
                  <span>Unit price</span>
                  <strong>
                    {formatMoney(Number(props.openPriceDraft.unitPrice))}
                  </strong>
                </div>
              )}
              <label className="rms-field rms-field-wide">
                <span>Item notes</span>
                <textarea
                  onChange={(event) =>
                    props.setOpenPriceDraft((draft) =>
                      draft ? { ...draft, lineNote: event.target.value } : draft,
                    )
                  }
                  placeholder="Additional note for this item"
                  rows={3}
                  value={props.openPriceDraft.lineNote}
                />
              </label>
            </div>
            {props.openPriceDraft.isSerialized ? (
              <div className="rms-serial-picker">
                <div className="rms-serial-entry-row">
                  <input
                    autoFocus={!props.openPriceDraft.mustEnterPriceAtPos}
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) =>
                        draft
                          ? { ...draft, serialEntry: event.target.value }
                          : draft,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addSerialCandidates([
                          props.openPriceDraft?.serialEntry ?? "",
                        ]);
                      }
                    }}
                    placeholder="Enter one serial number"
                    value={props.openPriceDraft.serialEntry}
                  />
                  <button
                    className="rms-button"
                    onClick={() =>
                      addSerialCandidates([
                        props.openPriceDraft?.serialEntry ?? "",
                      ])
                    }
                    type="button"
                  >
                    Add serial
                  </button>
                </div>
                <div className="rms-serial-entry-row is-range">
                  <input
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) =>
                        draft
                          ? { ...draft, serialRangeStart: event.target.value }
                          : draft,
                      )
                    }
                    placeholder="Range start"
                    value={props.openPriceDraft.serialRangeStart}
                  />
                  <input
                    onChange={(event) =>
                      props.setOpenPriceDraft((draft) =>
                        draft
                          ? { ...draft, serialRangeEnd: event.target.value }
                          : draft,
                      )
                    }
                    placeholder="Range end"
                    value={props.openPriceDraft.serialRangeEnd}
                  />
                  <button
                    className="rms-button"
                    onClick={addSerialRange}
                    type="button"
                  >
                    Add range
                  </button>
                </div>
                <div className="rms-serial-status">
                  <strong>
                    {selectedSerialNumbers.length} of{" "}
                    {Number.isFinite(openPriceQuantity)
                      ? formatNumber(openPriceQuantity)
                      : "0"}{" "}
                    selected
                  </strong>
                  <span>
                    {props.openPriceDraft.serialValidationMessage ??
                      "Serials must be available in this shop for this item."}
                  </span>
                </div>
                <div className="rms-serial-grid">
                  <div className="rms-serial-grid-head">
                    <span>#</span>
                    <span>Serial number</span>
                    <span />
                  </div>
                  {selectedSerialNumbers.length ? (
                    selectedSerialNumbers.map((serialNumber, index) => (
                      <div className="rms-serial-grid-row" key={serialNumber}>
                        <span>{index + 1}</span>
                        <strong>{serialNumber}</strong>
                        <button
                          className="rms-row-button is-danger"
                          onClick={() =>
                            props.setOpenPriceDraft((draft) =>
                              draft
                                ? {
                                    ...draft,
                                    serialNumbers: parseSerialDraft(
                                      draft.serialNumbers,
                                    )
                                      .filter(
                                        (entry) =>
                                          entry.toUpperCase() !==
                                          serialNumber.toUpperCase(),
                                      )
                                      .join("\n"),
                                    serialValidationMessage: `${serialNumber} removed.`,
                                  }
                                : draft,
                            )
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No serials selected"
                      detail="Add a single serial or a serial range."
                    />
                  )}
                </div>
                <div className="rms-serial-list">
                  {props.openPriceDraft.availableSerialNumbers.length ? (
                    props.openPriceDraft.availableSerialNumbers
                      .slice(0, 18)
                      .map((serialNumber) => (
                        <button
                          className="rms-row-button"
                          key={serialNumber}
                          onClick={() => addSerialCandidates([serialNumber])}
                          type="button"
                        >
                          {serialNumber}
                        </button>
                      ))
                  ) : (
                    <small>No synced available serials for this product.</small>
                  )}
                </div>
              </div>
            ) : null}
            <div className="rms-dialog-actions">
              <button
                className="rms-button"
                onClick={() => props.setOpenPriceDraft(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rms-button is-primary"
                disabled={props.isBusy || openPriceSerialMismatch}
                onClick={() => void props.submitOpenPriceDraft()}
                type="button"
              >
                Add item
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ShiftCloseDialog(props: {
  activeShift: ReturnType<typeof firstOpenShift>;
  shiftDeclaredCash: string;
  isBusy: boolean;
  setShiftDeclaredCash: (value: string) => void;
  closeShift: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmCloseVisible, setConfirmCloseVisible] = useState(false);

  return (
    <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
      <section className="rms-dialog rms-shift-close-dialog">
        <div className="rms-panel-title">
          <div>
            <span>Shift close</span>
            <h2>{props.activeShift?.shiftNo ?? "No open shift"}</h2>
          </div>
          <button
            className="rms-button"
            disabled={props.isBusy}
            onClick={props.onClose}
            type="button"
          >
            Close
          </button>
        </div>
        {props.activeShift ? (
          <>
            <div className="rms-stat-grid">
              <Stat
                label="Sales"
                value={formatMoney(props.activeShift.netSalesAmount)}
              />
              <Stat
                label="Cash"
                value={formatMoney(props.activeShift.cashTenderedAmount)}
              />
              <Stat
                label="Expected"
                value={formatMoney(props.activeShift.expectedCashAmount)}
              />
              <Stat
                label="Transactions"
                value={formatNumber(props.activeShift.transactionCount)}
              />
            </div>
            <label className="rms-field">
              <span>Closing cash amount</span>
              <input
                autoFocus
                min="0"
                onChange={(event) =>
                  props.setShiftDeclaredCash(event.target.value)
                }
                step="0.01"
                type="number"
                value={props.shiftDeclaredCash}
              />
            </label>
            <div className="rms-dialog-actions">
              <button
                className="rms-button"
                disabled={props.isBusy}
                onClick={props.onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rms-button is-primary"
                disabled={
                  props.isBusy ||
                  !Number.isFinite(Number(props.shiftDeclaredCash))
                }
                onClick={() => setConfirmCloseVisible(true)}
                type="button"
              >
                Close shift
              </button>
            </div>
            {confirmCloseVisible ? (
              <div
                className="rms-confirm-popover"
                role="alertdialog"
                aria-modal="false"
              >
                <div>
                  <strong>Close shift and print Z report?</strong>
                  <p>
                    A new zero-value shift will open automatically after the Z
                    report is generated.
                  </p>
                </div>
                <div className="rms-dialog-actions">
                  <button
                    className="rms-button"
                    disabled={props.isBusy}
                    onClick={() => setConfirmCloseVisible(false)}
                    type="button"
                  >
                    No
                  </button>
                  <button
                    className="rms-button is-primary"
                    disabled={props.isBusy}
                    onClick={() => {
                      setConfirmCloseVisible(false);
                      void props.closeShift();
                    }}
                    type="button"
                  >
                    Yes
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No open shift"
            detail="Open a shift before running the closeout."
          />
        )}
      </section>
    </div>
  );
}

function getCriticalStockFloor(row: StoreInventoryBrowseItem) {
  return (
    [row.minStockLevel, row.reorderPoint, row.safetyStockLevel].find(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    ) ?? null
  );
}

function CriticalStockDialog({
  onClose,
  openInventory,
  rows,
}: {
  onClose: () => void;
  openInventory: () => void;
  rows: StoreInventoryBrowseItem[];
}) {
  return (
    <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
      <section className="rms-dialog rms-wide-dialog rms-critical-stock-dialog">
        <div className="rms-panel-title">
          <div>
            <span>Inventory startup alert</span>
            <h2>Critical stock</h2>
          </div>
          <StatusPill tone="warn">{`${formatNumber(rows.length)} item(s)`}</StatusPill>
        </div>
        <div className="rms-dialog-body">
          <div className="rms-critical-stock-list">
            {rows.map((row) => (
              <div
                className="rms-critical-stock-row"
                key={`${row.locationCode}-${row.productCode}`}
              >
                <div>
                  <strong>{row.productName}</strong>
                  <span>
                    {row.productCode} · {row.locationName}
                  </span>
                </div>
                <div className="rms-critical-stock-qty">
                  <strong>{formatNumber(row.quantityOnHand)}</strong>
                  <span>
                    Floor {formatNumber(getCriticalStockFloor(row) ?? 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rms-dialog-actions">
          <button className="rms-button" onClick={onClose} type="button">
            Dismiss
          </button>
          <button
            className="rms-button is-primary"
            onClick={openInventory}
            type="button"
          >
            Open inventory
          </button>
        </div>
      </section>
    </div>
  );
}

function reportCategory(item: (typeof reportWorkspaceItems)[number]) {
  switch (item.reportKind) {
    case "inventory":
      return "Inventory";
    case "banking":
    case "account-payments":
    case "tenders":
      return "Banking";
    case "shifts":
      return "Audit";
    case "sales":
    case "products":
    default:
      return "Sales";
  }
}

function ReportsLandingWorkspace(props: {
  visibleReportWorkspaces: typeof reportWorkspaceItems;
  openReport: (workspace: ReportWorkspace) => void;
}) {
  const groups = ["Sales", "Inventory", "Banking", "Audit"].map((category) => ({
    category,
    items: props.visibleReportWorkspaces.filter(
      (item) => reportCategory(item) === category,
    ),
  }));

  return (
    <div className="rms-workspace rms-report-landing">
      <section className="rms-panel">
        <div className="rms-report-tree">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div className="rms-report-tree-group" key={group.category}>
                <div className="rms-report-tree-heading">
                  <span className="rms-caret" aria-hidden="true" />
                  <strong>{group.category}</strong>
                </div>
                {group.items.map((item) => (
                  <button
                    className="rms-report-tree-item"
                    key={item.id}
                    onClick={() => props.openReport(item.id)}
                    type="button"
                  >
                    <span className="rms-document-icon" aria-hidden="true" />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function ReportsView(props: {
  snapshot: StoreSyncSnapshot | null;
  report: StoreReportResult | null;
  scope: "CASHIER" | "STORE";
  activeReport?: ReportKind;
  reportTitle?: string;
  isBusy: boolean;
  canFilterCashier: boolean;
  reportDateFrom: string;
  reportDateTo: string;
  reportCashierCode: string;
  reportCustomerQuery: string;
  reportProductQuery: string;
  setReportDateFrom: (value: string) => void;
  setReportDateTo: (value: string) => void;
  setReportCashierCode: (value: string) => void;
  setReportCustomerQuery: (value: string) => void;
  setReportProductQuery: (value: string) => void;
  loadStoreReport: (scope: "CASHIER" | "STORE") => Promise<void>;
}) {
  const exportLabel = props.reportTitle ?? "Local Report";
  const activeReportKind = props.activeReport ?? "sales";
  const tableRows = props.report
    ? reportRowsForExport(props.report, activeReportKind)
    : [];

  return (
    <div className="rms-report-view">
      <div className="rms-report-filters">
        <input
          onChange={(event) => props.setReportDateFrom(event.target.value)}
          type="date"
          value={props.reportDateFrom}
        />
        <input
          onChange={(event) => props.setReportDateTo(event.target.value)}
          type="date"
          value={props.reportDateTo}
        />
        {props.canFilterCashier ? (
          <select
            onChange={(event) => props.setReportCashierCode(event.target.value)}
            value={props.reportCashierCode}
          >
            <option value="">All cashiers</option>
            {props.snapshot?.storeUsers
              .filter((user) => user.cashierEligible)
              .map((user) => (
                <option key={user.loginId} value={user.loginId}>
                  {user.displayName}
                </option>
              ))}
          </select>
        ) : null}
        <input
          onChange={(event) => props.setReportCustomerQuery(event.target.value)}
          placeholder="Customer"
          value={props.reportCustomerQuery}
        />
        <input
          onChange={(event) => props.setReportProductQuery(event.target.value)}
          placeholder="Product"
          value={props.reportProductQuery}
        />
        <button
          className="rms-button is-primary"
          disabled={props.isBusy}
          onClick={() => void props.loadStoreReport(props.scope)}
          type="button"
        >
          Run
        </button>
        {props.report ? (
          <div className="rms-export-buttons">
            <button
              className="rms-button"
              onClick={() =>
                exportReport(
                  props.report!,
                  props.activeReport ?? "sales",
                  exportLabel,
                  "csv",
                )
              }
              type="button"
            >
              CSV
            </button>
            <button
              className="rms-button"
              onClick={() =>
                exportReport(
                  props.report!,
                  props.activeReport ?? "sales",
                  exportLabel,
                  "excel",
                )
              }
              type="button"
            >
              Excel
            </button>
            <button
              className="rms-button"
              onClick={() =>
                exportReport(
                  props.report!,
                  props.activeReport ?? "sales",
                  exportLabel,
                  "pdf",
                )
              }
              type="button"
            >
              PDF
            </button>
          </div>
        ) : null}
      </div>

      {props.report ? (
        <>
          <div className="rms-stat-grid">
            <Stat
              label="Net sales"
              value={formatMoney(props.report.summary.netSalesAmount)}
            />
            <Stat
              label="Sales tenders"
              value={formatMoney(props.report.summary.tenderedAmount)}
            />
            <Stat
              label="Account payments"
              value={formatMoney(props.report.summary.accountPaymentsAmount)}
            />
            <Stat
              label="Tax"
              value={formatMoney(props.report.summary.taxAmount)}
            />
            <Stat
              label="Stock value"
              value={formatMoney(props.report.summary.inventoryStockValue)}
            />
          </div>
          <ReportDataTable
            rows={tableRows}
            emptyLabel={`${exportLabel} has no rows`}
          />
          {!props.activeReport ? (
            <div className="rms-report-suggestions">
              <div className="rms-mini-row">
                <strong>Void and return audit</strong>
                <span>
                  Supervisor review of corrections by cashier and receipt.
                </span>
              </div>
              <div className="rms-mini-row">
                <strong>Credit exposure</strong>
                <span>
                  Customers with open balances, limits, and collections.
                </span>
              </div>
              <div className="rms-mini-row">
                <strong>Serial movement</strong>
                <span>Serials sold, returned, transferred, or adjusted.</span>
              </div>
              <div className="rms-mini-row">
                <strong>Promotion effectiveness</strong>
                <span>Discounts, uplift, and margin impact by promotion.</span>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No report loaded"
          detail="Choose filters and run the report."
        />
      )}
    </div>
  );
}

function InventoryWorkspace(props: {
  snapshot: StoreSyncSnapshot | null;
  inventoryItems: StoreInventoryBrowseItem[];
  purchaseOrders: StorePurchaseOrderSummary[];
  transfers: StoreInterStoreTransferSummary[];
  inventorySerialDraft: InventorySerialDraft | null;
  isBusy: boolean;
  inventoryQuery: string;
  inventoryLocation: string;
  remoteInventoryQuery: string;
  remoteInventoryStoreFilter: string;
  remoteInventoryItemFilter: string;
  remoteInventoryLocationFilter: string;
  remoteInventoryRows: StoreRemoteInventoryLookupResult["rows"];
  stockCountRows: StockCountUploadRow[];
  stockCountProductCode: string;
  stockCountQuantity: string;
  stockCountNote: string;
  transferSourceLocation: string;
  transferDestinationLocation: string;
  transferProductCode: string;
  transferQuantity: string;
  setInventoryQuery: (value: string) => void;
  setInventoryLocation: (value: string) => void;
  setRemoteInventoryQuery: (value: string) => void;
  setRemoteInventoryStoreFilter: (value: string) => void;
  setRemoteInventoryItemFilter: (value: string) => void;
  setRemoteInventoryLocationFilter: (value: string) => void;
  setStockCountRows: Dispatch<SetStateAction<StockCountUploadRow[]>>;
  setStockCountProductCode: (value: string) => void;
  setStockCountQuantity: (value: string) => void;
  setStockCountNote: (value: string) => void;
  setTransferSourceLocation: (value: string) => void;
  setTransferDestinationLocation: (value: string) => void;
  setTransferProductCode: (value: string) => void;
  setTransferQuantity: (value: string) => void;
  setError: (value: string | null) => void;
  setInventorySerialDraft: Dispatch<
    SetStateAction<InventorySerialDraft | null>
  >;
  browseInventory: () => Promise<void>;
  lookupRemoteInventory: () => Promise<void>;
  requestRemoteStock: (
    row: StoreRemoteInventoryLookupResult["rows"][number],
  ) => Promise<void>;
  browseAvailableSerialNumbers: (
    productCode: string,
    locationCode: string,
  ) => Promise<string[]>;
  saveStockCount: (input?: {
    productCode?: string;
    countedQuantity?: number;
  }) => Promise<void>;
  submitStockCount: (sessionId: string) => Promise<void>;
  commitStockCount: (sessionId: string, sessionNo: string) => Promise<void>;
  createTransferRequest: (input?: {
    sourceLocationCode?: string;
    destinationLocationCode?: string;
    productCode?: string;
    quantity?: number;
    externalReference?: string | null;
    note?: string | null;
  }) => Promise<boolean>;
  createStandalonePurchaseOrder: (
    input: StoreStandalonePurchaseOrderInput,
  ) => Promise<boolean>;
  submitTransferRequestDraft: (draftId: string) => Promise<void>;
  receivePurchaseOrder: (
    order: StorePurchaseOrderSummary,
    line?: StorePurchaseOrderSummary["lines"][number],
    quantity?: number,
  ) => Promise<void>;
  receiveSerializedPurchaseOrderLine: (
    order: StorePurchaseOrderSummary,
    line: StorePurchaseOrderSummary["lines"][number],
    serialNumbers: string[],
  ) => Promise<void>;
  recordSupplierReturn: (input: {
    receipt: StoreLocalGoodsReceiptSummary;
    line: StoreLocalGoodsReceiptSummary["lines"][number];
    quantity: number;
    reason: StoreLocalSupplierReturnReason;
    serialNumbers: string[];
    externalReference: string | null;
    note: string | null;
  }) => Promise<void>;
  issueInterStoreTransfer: (
    transfer: StoreInterStoreTransferSummary,
    serialNumbers?: string[],
  ) => Promise<void>;
  receiveInterStoreTransfer: (
    transfer: StoreInterStoreTransferSummary,
    serialNumbers?: string[],
    quantity?: number,
  ) => Promise<void>;
}) {
  const capabilities =
    props.snapshot?.activeOperatorSession?.capabilities ?? null;
  const standaloneInventory = isStandaloneDeployment(props.snapshot);
  const canViewInventory = capabilities?.hasInventoryVisibility === true;
  const canReceiveGoods = capabilities?.canReceiveGoods === true;
  const canManageSupplierReturns =
    capabilities?.canManageSupplierReturns === true;
  const canCreateStandalonePurchaseOrder =
    standaloneInventory && capabilities?.supervisorEligible === true;
  const canRequestTransfer = capabilities?.canRequestTransfer === true;
  const canSubmitCount = capabilities?.canSubmitCount === true;
  const inventorySerialDraft = props.inventorySerialDraft;
  const selectedInventorySerials = parseSerialDraft(
    inventorySerialDraft?.serialNumbers ?? "",
  );
  const inventorySerialMismatch =
    inventorySerialDraft !== null &&
    selectedInventorySerials.length !== inventorySerialDraft.quantity;
  const [activeInventoryTab, setActiveInventoryTab] = useState<
    "stock" | "receiving" | "transfers" | "counts"
  >("stock");
  const [remoteLookupOpen, setRemoteLookupOpen] = useState(false);
  const [transferRequestDialogOpen, setTransferRequestDialogOpen] =
    useState(false);
  const [transferHistoryFrom, setTransferHistoryFrom] = useState("");
  const [transferHistoryTo, setTransferHistoryTo] = useState("");
  const [transferHistoryShop, setTransferHistoryShop] = useState("");
  const [transferDirectionFilter, setTransferDirectionFilter] =
    useState<TransferDirectionFilter>("ALL");
  const [transferRequestReference, setTransferRequestReference] = useState("");
  const [transferRequestNote, setTransferRequestNote] = useState("");
  const [transferRequiredDate, setTransferRequiredDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [transferReceiptQuantities, setTransferReceiptQuantities] = useState<
    Record<string, string>
  >({});
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<
    string | null
  >(null);
  const [selectedGoodsReceiptId, setSelectedGoodsReceiptId] = useState<
    string | null
  >(null);
  const [supplierReturnGoodsReceiptId, setSupplierReturnGoodsReceiptId] =
    useState("");
  const [
    supplierReturnGoodsReceiptLineId,
    setSupplierReturnGoodsReceiptLineId,
  ] = useState("");
  const [supplierReturnQuantity, setSupplierReturnQuantity] = useState("1");
  const [supplierReturnReason, setSupplierReturnReason] =
    useState<StoreLocalSupplierReturnReason>("DAMAGED");
  const [supplierReturnExternalReference, setSupplierReturnExternalReference] =
    useState("");
  const [supplierReturnNote, setSupplierReturnNote] = useState("");
  const [supplierReturnSerialNumbers, setSupplierReturnSerialNumbers] =
    useState("");
  const [selectedTransferDocumentKey, setSelectedTransferDocumentKey] =
    useState<string | null>(null);
  const [transferRequestLines, setTransferRequestLines] = useState<
    Array<{
      id: string;
      productCode: string;
      productName: string;
      quantity: number;
      unitPrice: number;
    }>
  >([]);
  const [activeTransferEntryTab, setActiveTransferEntryTab] = useState<
    "header" | "details"
  >("header");
  const [activeCountEntryTab, setActiveCountEntryTab] = useState<
    "header" | "sheet" | "variance"
  >("header");
  const [poReceiptQuantities, setPoReceiptQuantities] = useState<
    Record<string, string>
  >({});
  const [localPurchaseOrderDraft, setLocalPurchaseOrderDraft] = useState({
    supplierNo: "",
    inventoryLocationCode: "",
    externalReference: "",
    note: "",
    productCode: "",
    orderedQuantity: "1",
    unitCost: "0",
  });
  const [localPurchaseOrderLines, setLocalPurchaseOrderLines] = useState<
    Array<{
      id: string;
      productCode: string;
      productName: string;
      orderedQuantity: number;
      unitCost: number | null;
    }>
  >([]);
  const [localPurchaseOrderProductSearch, setLocalPurchaseOrderProductSearch] =
    useState("");
  const remoteStoreOptions = Array.from(
    new Map(
      [
        ...(props.snapshot?.transferRequestTargets ?? []).map(
          (target) =>
            [target.sourceStoreCode, target.sourceStoreName] as const,
        ),
        ...props.remoteInventoryRows.map(
          (row) => [row.storeCode, row.storeName] as const,
        ),
      ],
    ).entries(),
  ).sort((left, right) => left[1].localeCompare(right[1]));
  const remoteItemOptions = Array.from(
    new Map([
      ...props.remoteInventoryRows.map(
        (row) => [row.productCode, row.productName] as const,
      ),
      ...props.inventoryItems.map(
        (item) => [item.productCode, item.productName] as const,
      ),
    ]).entries(),
  );
  const remoteLocationOptions = Array.from(
    new Map(
      [
        ...(props.snapshot?.transferRequestTargets ?? [])
          .filter(
            (target) =>
              !props.remoteInventoryStoreFilter ||
              target.sourceStoreCode === props.remoteInventoryStoreFilter,
          )
          .map(
            (target) =>
              [
                target.sourceLocationCode,
                {
                  locationName: target.sourceLocationName,
                  storeName: target.sourceStoreName,
                },
              ] as const,
          ),
        ...props.remoteInventoryRows
          .filter(
            (row) =>
              !props.remoteInventoryStoreFilter ||
              row.storeCode === props.remoteInventoryStoreFilter,
          )
          .map(
            (row) =>
              [
                row.locationCode,
                {
                  locationName: row.locationName,
                  storeName: row.storeName,
                },
              ] as const,
          ),
      ],
    ).entries(),
  ).sort((left, right) =>
    left[1].locationName.localeCompare(right[1].locationName),
  );
  const countLocationItems = props.inventoryItems.filter(
    (item) =>
      !props.inventoryLocation || item.locationCode === props.inventoryLocation,
  );
  const requestableProducts = Array.from(
    new Map(
      props.inventoryItems.map((item) => [
        item.productCode,
        {
          productCode: item.productCode,
          productName: item.productName,
          unitPrice: item.unitPrice,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.productName.localeCompare(right.productName));
  const selectedTransferProduct = requestableProducts.find(
    (item) => item.productCode === props.transferProductCode,
  );
  const selectedLocalPurchaseProduct = requestableProducts.find(
    (item) => item.productCode === localPurchaseOrderDraft.productCode,
  );
  const filteredLocalPurchaseProducts = requestableProducts.filter((item) => {
    const query = localPurchaseOrderProductSearch.trim().toLowerCase();

    return (
      !query ||
      item.productCode.toLowerCase().includes(query) ||
      item.productName.toLowerCase().includes(query)
    );
  });
  const transferDocumentGroups = useMemo(
    () => buildTransferDocumentGroups(props.transfers),
    [props.transfers],
  );
  const selectedPurchaseOrder =
    props.purchaseOrders.find(
      (order) => order.purchaseOrderId === selectedPurchaseOrderId,
    ) ?? null;
  const selectedGoodsReceipt =
    props.snapshot?.recentGoodsReceipts.find(
      (receipt) => receipt.goodsReceiptId === selectedGoodsReceiptId,
    ) ?? null;
  const supplierReturnReceipts = props.snapshot?.recentGoodsReceipts ?? [];
  const selectedSupplierReturnReceipt =
    supplierReturnReceipts.find(
      (receipt) => receipt.goodsReceiptId === supplierReturnGoodsReceiptId,
    ) ?? null;
  const selectedSupplierReturnLine =
    selectedSupplierReturnReceipt?.lines.find(
      (line) => line.goodsReceiptLineId === supplierReturnGoodsReceiptLineId,
    ) ?? null;
  const selectedTransferDocument =
    transferDocumentGroups.find(
      (group) => group.key === selectedTransferDocumentKey,
    ) ?? null;
  const transferHistoryRows = [
    ...(props.snapshot?.transferRequestDrafts ?? []).map((draft) => ({
      id: draft.draftId,
      documentNo: draft.requestNo,
      status: draft.status,
      sourceShop: draft.sourceStoreName,
      sourceShopCode: draft.sourceStoreCode,
      destinationShop: draft.destinationStoreName,
      destinationShopCode: draft.destinationStoreCode,
      productName: draft.productName,
      productCode: draft.productCode,
      quantity: draft.quantity,
      reference: draft.externalReference,
      note: draft.note,
      updatedAt: draft.updatedAt,
      submittedAt: draft.submittedAt,
      kind: "Request" as const,
      draft,
    })),
    ...transferDocumentGroups.map((group) => ({
      id: group.key,
      documentNo: group.documentNo,
      status: getTransferRoleStatusLabel(group, transferDirectionFilter),
      sourceShop: group.sourceStoreName,
      sourceShopCode: group.sourceStoreCode,
      destinationShop: group.destinationStoreName,
      destinationShopCode: group.destinationStoreCode,
      productName: `${formatNumber(group.lines.length)} line(s)`,
      productCode: group.lines.map((line) => line.productCode).join(", "),
      quantity: group.requestedQuantity,
      outstandingQuantity: getTransferRoleOutstandingQuantity(
        group,
        transferDirectionFilter,
      ),
      reference: group.externalReference,
      note: null,
      updatedAt: group.updatedAt,
      submittedAt: group.lines[0]?.requestedAt ?? group.updatedAt,
      kind: "Transfer" as const,
      draft: null,
      group,
    })),
  ];
  const transferShopOptions = Array.from(
    new Map(
      transferHistoryRows.flatMap((row) => [
        [row.sourceShopCode, row.sourceShop] as const,
        [row.destinationShopCode, row.destinationShop] as const,
      ]),
    ).entries(),
  ).sort((left, right) => left[1].localeCompare(right[1]));
  const filteredTransferHistoryRows = transferHistoryRows
    .filter((row) => {
      const updatedDate = new Date(row.updatedAt);
      const transferGroup =
        row.kind === "Transfer" && "group" in row ? row.group : null;
      const fromMatch = transferHistoryFrom
        ? updatedDate >= new Date(`${transferHistoryFrom}T00:00:00`)
        : true;
      const toMatch = transferHistoryTo
        ? updatedDate <= new Date(`${transferHistoryTo}T23:59:59`)
        : true;
      const shopMatch = transferHistoryShop
        ? row.sourceShopCode === transferHistoryShop ||
          row.destinationShopCode === transferHistoryShop
        : true;
      const directionMatch =
        transferGroup === null ||
        transferDirectionFilter === "ALL" ||
        (transferDirectionFilter === "OUT" &&
          transferGroup.lines.some((line) => line.role === "SOURCE")) ||
        (transferDirectionFilter === "IN" &&
          transferGroup.lines.some((line) => line.role === "DESTINATION"));

      return fromMatch && toMatch && shopMatch && directionMatch;
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );

  useEffect(() => {
    if (standaloneInventory && activeInventoryTab === "transfers") {
      setActiveInventoryTab("stock");
    }
  }, [activeInventoryTab, standaloneInventory]);

  useEffect(() => {
    if (!supplierReturnGoodsReceiptId && supplierReturnReceipts[0]) {
      setSupplierReturnGoodsReceiptId(supplierReturnReceipts[0].goodsReceiptId);
      return;
    }

    if (
      supplierReturnGoodsReceiptId &&
      !supplierReturnReceipts.some(
        (receipt) => receipt.goodsReceiptId === supplierReturnGoodsReceiptId,
      )
    ) {
      setSupplierReturnGoodsReceiptId(
        supplierReturnReceipts[0]?.goodsReceiptId ?? "",
      );
    }
  }, [supplierReturnGoodsReceiptId, supplierReturnReceipts]);

  useEffect(() => {
    if (!selectedSupplierReturnReceipt) {
      if (supplierReturnGoodsReceiptLineId) {
        setSupplierReturnGoodsReceiptLineId("");
      }
      return;
    }

    if (
      !supplierReturnGoodsReceiptLineId ||
      !selectedSupplierReturnReceipt.lines.some(
        (line) => line.goodsReceiptLineId === supplierReturnGoodsReceiptLineId,
      )
    ) {
      setSupplierReturnGoodsReceiptLineId(
        selectedSupplierReturnReceipt.lines[0]?.goodsReceiptLineId ?? "",
      );
    }
  }, [selectedSupplierReturnReceipt, supplierReturnGoodsReceiptLineId]);

  function exportCountSheet() {
    const rows = countLocationItems.length
      ? countLocationItems
      : props.inventoryItems;
    const csv = [
      "productCode,productName,countedQuantity,systemQuantity",
      ...rows.map((item) =>
        [
          item.productCode,
          `"${item.productName.replace(/"/g, '""')}"`,
          "",
          item.quantityOnHand,
        ].join(","),
      ),
    ].join("\n");

    downloadTextFile(
      `flash-erp-count-sheet-${props.inventoryLocation || "all"}.csv`,
      csv,
    );
  }

  async function importCountSheet(file: File | null) {
    if (!file) {
      return;
    }

    const uploadedRows = parseStockCountCsv(await file.text());
    const inventoryByCode = new Map(
      props.inventoryItems.map((item) => [
        item.productCode.toUpperCase(),
        item,
      ]),
    );

    props.setStockCountRows(
      uploadedRows.map((row) => {
        const item = inventoryByCode.get(row.productCode);
        const systemQuantity = item?.quantityOnHand ?? 0;
        const varianceQuantity =
          row.countedQuantity === null
            ? null
            : Number((row.countedQuantity - systemQuantity).toFixed(3));

        return {
          productCode: row.productCode,
          productName: item?.productName ?? row.productCode,
          systemQuantity,
          countedQuantity: row.countedQuantity,
          varianceQuantity,
        };
      }),
    );
    setActiveCountEntryTab("variance");
  }

  function addTransferRequestLine() {
    const quantity = Number(props.transferQuantity);

    if (!props.transferProductCode || !selectedTransferProduct) {
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }

    setTransferRequestLines((currentLines) => [
      ...currentLines.filter(
        (line) => line.productCode !== selectedTransferProduct.productCode,
      ),
      {
        id: `${selectedTransferProduct.productCode}-${Date.now()}`,
        productCode: selectedTransferProduct.productCode,
        productName: selectedTransferProduct.productName,
        quantity,
        unitPrice: selectedTransferProduct.unitPrice,
      },
    ]);
    props.setTransferProductCode("");
    props.setTransferQuantity("1");
  }

  function addLocalPurchaseOrderLine() {
    const orderedQuantity = Number(localPurchaseOrderDraft.orderedQuantity);
    const unitCost = Number(localPurchaseOrderDraft.unitCost);

    if (!localPurchaseOrderDraft.productCode || !selectedLocalPurchaseProduct) {
      return;
    }

    if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
      props.setError("Enter a purchase order quantity greater than zero.");
      return;
    }

    setLocalPurchaseOrderLines((currentLines) => [
      ...currentLines.filter(
        (line) => line.productCode !== selectedLocalPurchaseProduct.productCode,
      ),
      {
        id: `${selectedLocalPurchaseProduct.productCode}-${Date.now()}`,
        productCode: selectedLocalPurchaseProduct.productCode,
        productName: selectedLocalPurchaseProduct.productName,
        orderedQuantity,
        unitCost: Number.isFinite(unitCost) ? unitCost : null,
      },
    ]);
    setLocalPurchaseOrderDraft((draft) => ({
      ...draft,
      productCode: "",
      orderedQuantity: "1",
      unitCost: "0",
    }));
    setLocalPurchaseOrderProductSearch("");
  }

  async function saveLocalPurchaseOrder() {
    const inlineQuantity = Number(localPurchaseOrderDraft.orderedQuantity);
    const inlineUnitCost = Number(localPurchaseOrderDraft.unitCost);
    const lines =
      localPurchaseOrderLines.length > 0
        ? localPurchaseOrderLines.map((line) => ({
            productCode: line.productCode,
            orderedQuantity: line.orderedQuantity,
            unitCost: line.unitCost,
          }))
        : localPurchaseOrderDraft.productCode && selectedLocalPurchaseProduct
          ? [
              {
                productCode: localPurchaseOrderDraft.productCode,
                orderedQuantity: inlineQuantity,
                unitCost: Number.isFinite(inlineUnitCost) ? inlineUnitCost : null,
              },
            ]
          : [];

    if (lines.length === 0) {
      props.setError("Add at least one line before creating the purchase order.");
      return;
    }

    const saved = await props.createStandalonePurchaseOrder({
      supplierNo: localPurchaseOrderDraft.supplierNo || null,
      inventoryLocationCode:
        localPurchaseOrderDraft.inventoryLocationCode || null,
      externalReference: localPurchaseOrderDraft.externalReference || null,
      note: localPurchaseOrderDraft.note || null,
      lines,
    });

    if (!saved) {
      return;
    }

    setLocalPurchaseOrderLines([]);
    setLocalPurchaseOrderProductSearch("");
    setLocalPurchaseOrderDraft((draft) => ({
      ...draft,
      externalReference: "",
      note: "",
      productCode: "",
      orderedQuantity: "1",
      unitCost: "0",
    }));
  }

  async function postSupplierReturn() {
    if (!selectedSupplierReturnReceipt || !selectedSupplierReturnLine) {
      props.setError(
        "Select the original goods receipt and line before posting a supplier return.",
      );
      return;
    }

    const serialNumbers = parseSerialDraft(supplierReturnSerialNumbers);
    const isSerialized = selectedSupplierReturnLine.serialNumbers.length > 0;
    const quantity = isSerialized
      ? serialNumbers.length
      : Number(supplierReturnQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      props.setError("Enter a supplier return quantity greater than zero.");
      return;
    }

    await props.recordSupplierReturn({
      receipt: selectedSupplierReturnReceipt,
      line: selectedSupplierReturnLine,
      quantity,
      reason: supplierReturnReason,
      serialNumbers: isSerialized ? serialNumbers : [],
      externalReference: supplierReturnExternalReference.trim() || null,
      note:
        supplierReturnNote.trim() ||
        `Returning stock from ${selectedSupplierReturnReceipt.goodsReceiptNo} to supplier.`,
    });

    setSupplierReturnQuantity("1");
    setSupplierReturnExternalReference("");
    setSupplierReturnNote("");
    setSupplierReturnSerialNumbers("");
  }

  async function saveTransferRequestLines() {
    if (
      !props.transferSourceLocation ||
      !props.transferDestinationLocation ||
      transferRequestLines.length === 0
    ) {
      return;
    }

    const selectedSourceTarget = props.snapshot?.transferRequestTargets.find(
      (target) => target.sourceLocationCode === props.transferSourceLocation,
    );

    if (!selectedSourceTarget) {
      props.setError(
        `Flash ERP has no synced enterprise transfer source target for ${props.transferSourceLocation}. Run sync, then choose a source from the Ship from dropdown.`,
      );
      return;
    }

    const note = [
      transferRequiredDate ? `Required ${transferRequiredDate}` : null,
      transferRequestNote.trim() || null,
    ]
      .filter(Boolean)
      .join(" | ");

    for (const line of transferRequestLines) {
      const saved = await props.createTransferRequest({
        sourceLocationCode: props.transferSourceLocation,
        destinationLocationCode: props.transferDestinationLocation,
        productCode: line.productCode,
        quantity: line.quantity,
        externalReference: transferRequestReference.trim() || null,
        note: note || null,
      });

      if (!saved) {
        return;
      }
    }

    setTransferRequestLines([]);
    setTransferRequestReference("");
    setTransferRequestNote("");
    setTransferRequestDialogOpen(false);
    setActiveTransferEntryTab("header");
  }

  function printGoodsReceipt(receipt: StoreLocalGoodsReceiptSummary) {
    const receiptSettings = props.snapshot?.receiptSettings;
    const totalOrderedQuantity = receipt.lines.reduce(
      (sum, line) => sum + line.orderedQuantity,
      0,
    );
    const popup = window.open("", "_blank", "width=1024,height=900");

    if (!popup) {
      return;
    }

    popup.document.write(
      buildGoodsReceiptPrintWindowHtml(
        {
          retailOrgName: props.snapshot?.retailOrgName ?? "Flash ERP",
          companyLogoUrl: props.snapshot?.companyLogoUrl ?? null,
          storeCode: props.snapshot?.storeCode ?? "",
          storeName: props.snapshot?.storeName ?? "Store",
          terminalCode: props.snapshot?.terminalCode ?? "",
          currencyCode: receiptSettings?.currencyCode ?? "USD",
          timezone: receiptSettings?.timezone ?? "UTC",
          receiptHeader: receiptSettings?.receiptHeader ?? null,
          receiptFooter: receiptSettings?.receiptFooter ?? null,
          goodsReceiptTemplateHtml:
            receiptSettings?.goodsReceiptTemplateHtml ?? null,
          goodsReceiptNo: receipt.goodsReceiptNo,
          purchaseOrderNo: receipt.purchaseOrderNo,
          supplierNo: receipt.supplierNo,
          supplierName: receipt.supplierName,
          inventoryLocationCode: receipt.inventoryLocationCode,
          inventoryLocationName: receipt.inventoryLocationName,
          externalReference: receipt.externalReference,
          note: receipt.note,
          operatorName: receipt.operatorName,
          totalOrderedQuantity: Number(totalOrderedQuantity.toFixed(3)),
          totalReceivedQuantity: receipt.totalQuantity,
          receivedAt: receipt.receivedAt,
          lines: receipt.lines.map((line) => ({
            goodsReceiptLineId: line.goodsReceiptLineId,
            purchaseOrderLineId: line.purchaseOrderLineId,
            lineNo: line.lineNo,
            productCode: line.productCode,
            productName: line.productName,
            orderedQuantity: line.orderedQuantity,
            receivedQuantity: line.quantity,
            serialNumbers: line.serialNumbers,
          })),
        },
        {
          autoPrint: true,
        },
      ),
    );
    popup.document.close();
    popup.focus();
  }

  function printTransferDocument(group: TransferDocumentGroup) {
    const popup = window.open("", "_blank", "width=1024,height=900");

    if (!popup) {
      return;
    }

    const lineRows = group.lines
      .map(
        (line) => `
          <tr>
            <td>${escapeMarkup(line.lineNo)}</td>
            <td><strong>${escapeMarkup(line.productName)}</strong><br /><span>${escapeMarkup(line.productCode)}</span></td>
            <td>${escapeMarkup(formatNumber(line.requestedQuantity))}</td>
            <td>${escapeMarkup(formatNumber(line.issuedQuantity))}</td>
            <td>${escapeMarkup(formatNumber(line.receivedQuantity))}</td>
            <td>${escapeMarkup(line.status)}</td>
          </tr>`,
      )
      .join("");

    popup.document.write(`<!doctype html>
      <html>
        <head>
          <title>${escapeMarkup(group.documentNo)} - Inter-store transfer</title>
          <style>
            body { margin: 0; background: #f5f7f5; color: #17211b; font-family: Arial, sans-serif; }
            main { width: min(980px, calc(100vw - 48px)); margin: 24px auto; background: #fff; padding: 28px; box-shadow: 0 18px 42px rgba(20, 30, 24, 0.16); }
            header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #17211b; padding-bottom: 18px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { margin: 4px 0 0; font-size: 15px; color: #5b6c60; text-transform: uppercase; }
            dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 22px 0; }
            dt { color: #607067; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            dd { margin: 3px 0 0; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #245f84; color: #fff; padding: 9px; text-align: left; font-size: 12px; text-transform: uppercase; }
            td { border-bottom: 1px solid #e4ebe5; padding: 10px 9px; vertical-align: top; font-size: 13px; }
            td span { color: #68786d; font-size: 12px; }
            .actions { margin-top: 18px; text-align: right; }
            button { border: 0; border-radius: 8px; background: #245f84; color: #fff; padding: 10px 16px; font-weight: 800; }
            @media print { body { background: #fff; } main { width: auto; margin: 0; box-shadow: none; } .actions { display: none; } }
          </style>
        </head>
        <body>
          <main>
            <header>
              <div>
                <h1>${escapeMarkup(group.documentNo)}</h1>
                <h2>Inter-store transfer</h2>
              </div>
              <div><strong>${escapeMarkup(group.statusLabel)}</strong><br />${escapeMarkup(formatRelative(group.updatedAt))}</div>
            </header>
            <dl>
              <div><dt>From</dt><dd>${escapeMarkup(group.sourceStoreName)}</dd></div>
              <div><dt>To</dt><dd>${escapeMarkup(group.destinationStoreName)}</dd></div>
              <div><dt>Requested</dt><dd>${escapeMarkup(formatNumber(group.requestedQuantity))}</dd></div>
              <div><dt>Received</dt><dd>${escapeMarkup(formatNumber(group.receivedQuantity))}</dd></div>
            </dl>
            <table>
              <thead><tr><th>Line</th><th>Item</th><th>Requested</th><th>Issued</th><th>Received</th><th>Status</th></tr></thead>
              <tbody>${lineRows}</tbody>
            </table>
            <div class="actions"><button onclick="window.print()">Print</button></div>
          </main>
        </body>
      </html>`);
    popup.document.close();
    popup.focus();
  }

  async function saveCalculatedCountRows() {
    for (const row of props.stockCountRows) {
      if (row.countedQuantity === null) {
        continue;
      }

      await props.saveStockCount({
        productCode: row.productCode,
        countedQuantity: row.countedQuantity,
      });
    }
  }

  function addInventorySerialCandidates(candidates: string[]) {
    props.setInventorySerialDraft((draft) => {
      if (!draft) {
        return draft;
      }

      const availableKeys = new Map(
        draft.availableSerialNumbers.map((serialNumber) => [
          serialNumber.toUpperCase(),
          serialNumber,
        ]),
      );
      const current = parseSerialDraft(draft.serialNumbers);
      const currentKeys = new Set(
        current.map((serialNumber) => serialNumber.toUpperCase()),
      );
      const accepted: string[] = [];
      const rejected: string[] = [];

      for (const candidate of candidates
        .map((value) => value.trim())
        .filter(Boolean)) {
        const availableSerial =
          draft.availableSerialNumbers.length > 0
            ? availableKeys.get(candidate.toUpperCase())
            : candidate;

        if (!availableSerial) {
          rejected.push(candidate);
          continue;
        }

        if (!currentKeys.has(availableSerial.toUpperCase())) {
          currentKeys.add(availableSerial.toUpperCase());
          accepted.push(availableSerial);
        }
      }

      return {
        ...draft,
        serialNumbers: [...current, ...accepted].join("\n"),
        serialEntry: "",
        serialRangeStart: "",
        serialRangeEnd: "",
        message: rejected.length
          ? `${rejected.slice(0, 3).join(", ")} ${rejected.length === 1 ? "is" : "are"} not available for this movement.`
          : `${accepted.length} serial number(s) added.`,
      };
    });
  }

  function addInventorySerialRange() {
    const draft = props.inventorySerialDraft;

    if (!draft?.serialRangeStart.trim() || !draft.serialRangeEnd.trim()) {
      props.setInventorySerialDraft((current) =>
        current
          ? { ...current, message: "Enter range start and range end." }
          : current,
      );
      return;
    }

    const expanded = expandSerialRange(
      draft.serialRangeStart,
      draft.serialRangeEnd,
    );
    const candidates =
      draft.availableSerialNumbers.length > 0
        ? (() => {
            const start = draft.serialRangeStart.trim().toUpperCase();
            const end = draft.serialRangeEnd.trim().toUpperCase();
            const [lower, upper] =
              start.localeCompare(end) <= 0 ? [start, end] : [end, start];

            return draft.availableSerialNumbers.filter((serialNumber) => {
              const key = serialNumber.toUpperCase();

              return (
                expanded.some((candidate) => candidate.toUpperCase() === key) ||
                (key.localeCompare(lower) >= 0 && key.localeCompare(upper) <= 0)
              );
            });
          })()
        : expanded;

    addInventorySerialCandidates(candidates);
  }

  async function openPurchaseOrderSerialReceipt(
    order: StorePurchaseOrderSummary,
    line: StorePurchaseOrderSummary["lines"][number],
  ) {
    props.setInventorySerialDraft({
      title: `Receive ${order.purchaseOrderNo}`,
      productName: line.productName,
      quantity: line.outstandingQuantity,
      availableSerialNumbers: [],
      serialNumbers: "",
      serialEntry: "",
      serialRangeStart: "",
      serialRangeEnd: "",
      message:
        "Enter or range-add the serials physically received for this GRN line.",
      submitLabel: "Receive serials",
      onSubmit: async (serialNumbers) => {
        await props.receiveSerializedPurchaseOrderLine(
          order,
          line,
          serialNumbers,
        );
      },
    });
  }

  async function openTransferIssueSerials(
    transfer: StoreInterStoreTransferSummary,
  ) {
    const availableSerialNumbers = await props.browseAvailableSerialNumbers(
      transfer.productCode,
      transfer.sourceLocationCode,
    );

    props.setInventorySerialDraft({
      title: `Issue ${transfer.transferNo}`,
      productName: transfer.productName,
      quantity: transfer.outstandingIssueQuantity,
      availableSerialNumbers,
      serialNumbers: "",
      serialEntry: "",
      serialRangeStart: "",
      serialRangeEnd: "",
      message: "Only serials available at the source location can be issued.",
      submitLabel: "Issue serials",
      onSubmit: async (serialNumbers) => {
        await props.issueInterStoreTransfer(transfer, serialNumbers);
      },
    });
  }

  function openTransferReceiveSerials(
    transfer: StoreInterStoreTransferSummary,
  ) {
    const alreadyReceived = new Set(
      transfer.receivedSerialNumbers.map((serialNumber) =>
        serialNumber.toUpperCase(),
      ),
    );
    const availableSerialNumbers = transfer.issuedSerialNumbers.filter(
      (serialNumber) => !alreadyReceived.has(serialNumber.toUpperCase()),
    );

    props.setInventorySerialDraft({
      title: `Receive ${transfer.transferNo}`,
      productName: transfer.productName,
      quantity: transfer.outstandingReceiptQuantity,
      availableSerialNumbers,
      serialNumbers: "",
      serialEntry: "",
      serialRangeStart: "",
      serialRangeEnd: "",
      message: "Receive only serials issued by the source location.",
      submitLabel: "Receive serials",
      onSubmit: async (serialNumbers) => {
        await props.receiveInterStoreTransfer(transfer, serialNumbers);
      },
    });
  }

  async function receiveAllPurchaseOrderLines(order: StorePurchaseOrderSummary) {
    const receivableLines = order.lines.filter(
      (line) => line.outstandingQuantity > 0 && !line.isSerialized,
    );

    if (receivableLines.length === 0) {
      props.setError(
        "This purchase order has no non-serialized outstanding lines to receive all.",
      );
      return;
    }

    await props.receivePurchaseOrder(order);
  }

  async function issueAllTransferLines(group: TransferDocumentGroup) {
    const issuableLines = group.lines.filter(
      (transfer) =>
        transfer.role === "SOURCE" &&
        transfer.outstandingIssueQuantity > 0 &&
        !transfer.isSerialized,
    );

    if (issuableLines.length === 0) {
      props.setError(
        "This transfer has no non-serialized outstanding source lines to issue all.",
      );
      return;
    }

    for (const transfer of issuableLines) {
      await props.issueInterStoreTransfer(transfer);
    }
  }

  async function receiveAllTransferLines(group: TransferDocumentGroup) {
    const receivableLines = group.lines.filter(
      (transfer) =>
        transfer.role === "DESTINATION" &&
        transfer.outstandingReceiptQuantity > 0 &&
        !transfer.isSerialized,
    );

    if (receivableLines.length === 0) {
      props.setError(
        "This transfer has no non-serialized outstanding destination lines to receive all.",
      );
      return;
    }

    for (const transfer of receivableLines) {
      await props.receiveInterStoreTransfer(
        transfer,
        [],
        transfer.outstandingReceiptQuantity,
      );
    }
  }

  const inventoryTabs: Array<{ id: typeof activeInventoryTab; label: string }> =
    [
      { id: "stock", label: "Stock" },
      { id: "receiving", label: "Receiving" },
      ...(standaloneInventory
        ? []
        : [{ id: "transfers" as const, label: "Transfers" }]),
      { id: "counts", label: "Counts" },
    ];

  function renderPurchaseOrderDialog() {
    if (!selectedPurchaseOrder) {
      return null;
    }

    const receivableLineCount = selectedPurchaseOrder.lines.filter(
      (line) => line.outstandingQuantity > 0 && !line.isSerialized,
    ).length;

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-document-dialog">
          <div className="rms-panel-title">
            <div>
              <span>Purchase order</span>
              <h2>{selectedPurchaseOrder.purchaseOrderNo}</h2>
            </div>
            <div className="rms-inline-actions">
              {canReceiveGoods ? (
                <button
                  className="rms-button is-primary"
                  disabled={props.isBusy || receivableLineCount === 0}
                  onClick={() =>
                    void receiveAllPurchaseOrderLines(selectedPurchaseOrder)
                  }
                  type="button"
                >
                  Receive all
                </button>
              ) : null}
              <button
                className="rms-button"
                onClick={() => setSelectedPurchaseOrderId(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
          <div className="rms-document-summary-grid">
            <Stat
              label="Supplier"
              value={selectedPurchaseOrder.supplierName ?? "Not set"}
            />
            <Stat
              label="Location"
              value={selectedPurchaseOrder.inventoryLocationName}
            />
            <Stat
              label="Outstanding"
              value={formatNumber(selectedPurchaseOrder.outstandingQuantity)}
              tone={
                selectedPurchaseOrder.outstandingQuantity > 0 ? "warn" : "good"
              }
            />
            <Stat
              label="Lines"
              value={formatNumber(selectedPurchaseOrder.lineCount)}
            />
          </div>
          <div className="rms-table rms-document-line-table">
            <div className="rms-table-head">
              <span>Item</span>
              <span>Ordered</span>
              <span>Received</span>
              <span>Outstanding</span>
              <span>Receive</span>
            </div>
            {selectedPurchaseOrder.lines.map((line) => (
              <div className="rms-table-row" key={line.purchaseOrderLineId}>
                <div>
                  <strong>{line.productName}</strong>
                  <small>
                    {line.productCode}
                    {line.isSerialized ? " · Serialized" : ""}
                  </small>
                </div>
                <span>{formatNumber(line.orderedQuantity)}</span>
                <span>{formatNumber(line.receivedQuantity)}</span>
                <strong>{formatNumber(line.outstandingQuantity)}</strong>
                {line.outstandingQuantity > 0 && canReceiveGoods ? (
                  line.isSerialized ? (
                    <button
                      className="rms-row-button"
                      disabled={props.isBusy}
                      onClick={() =>
                        void openPurchaseOrderSerialReceipt(
                          selectedPurchaseOrder,
                          line,
                        )
                      }
                      type="button"
                    >
                      Serials
                    </button>
                  ) : (
                    <div className="rms-inline-actions">
                      <input
                        aria-label={`Receive quantity for ${line.productName}`}
                        min="0.001"
                        onChange={(event) =>
                          setPoReceiptQuantities((current) => ({
                            ...current,
                            [line.purchaseOrderLineId]: event.target.value,
                          }))
                        }
                        step="0.001"
                        type="number"
                        value={
                          poReceiptQuantities[line.purchaseOrderLineId] ??
                          String(line.outstandingQuantity)
                        }
                      />
                      <button
                        className="rms-row-button"
                        disabled={props.isBusy}
                        onClick={() =>
                          void props.receivePurchaseOrder(
                            selectedPurchaseOrder,
                            line,
                            Number(
                              poReceiptQuantities[line.purchaseOrderLineId] ??
                                line.outstandingQuantity,
                            ),
                          )
                        }
                        type="button"
                      >
                        Save
                      </button>
                    </div>
                  )
                ) : (
                  <span>Done</span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderGoodsReceiptDialog() {
    if (!selectedGoodsReceipt) {
      return null;
    }

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-document-dialog">
          <div className="rms-panel-title">
            <div>
              <span>Goods receipt</span>
              <h2>{selectedGoodsReceipt.goodsReceiptNo}</h2>
            </div>
            <div className="rms-inline-actions">
              <button
                className="rms-button"
                onClick={() => printGoodsReceipt(selectedGoodsReceipt)}
                type="button"
              >
                Print GRN
              </button>
              <button
                className="rms-button"
                onClick={() => setSelectedGoodsReceiptId(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
          <div className="rms-document-summary-grid">
            <Stat
              label="Supplier"
              value={selectedGoodsReceipt.supplierName ?? "Not set"}
            />
            <Stat
              label="PO"
              value={selectedGoodsReceipt.purchaseOrderNo ?? "Direct"}
            />
            <Stat
              label="Received"
              value={formatNumber(selectedGoodsReceipt.totalQuantity)}
              tone="good"
            />
            <Stat
              label="Exceptions"
              value={formatNumber(selectedGoodsReceipt.exceptionQuantity)}
              tone={
                selectedGoodsReceipt.exceptionQuantity > 0 ? "warn" : "neutral"
              }
            />
          </div>
          <div className="rms-table rms-document-line-table">
            <div className="rms-table-head">
              <span>Item</span>
              <span>Ordered</span>
              <span>Received</span>
              <span>Serials</span>
              <span>Status</span>
            </div>
            {selectedGoodsReceipt.lines.map((line) => (
              <div className="rms-table-row" key={line.goodsReceiptLineId}>
                <div>
                  <strong>{line.productName}</strong>
                  <small>{line.productCode}</small>
                </div>
                <span>{formatNumber(line.orderedQuantity)}</span>
                <strong>{formatNumber(line.quantity)}</strong>
                <span>
                  {line.serialNumbers.length
                    ? `${line.serialNumbers.length} serial(s)`
                    : "None"}
                </span>
                <StatusPill tone="good">Posted</StatusPill>
              </div>
            ))}
          </div>
          {selectedGoodsReceipt.exceptions.length ? (
            <div className="rms-mini-list rms-document-exception-list">
              {selectedGoodsReceipt.exceptions.map((exception) => (
                <div
                  className="rms-mini-row"
                  key={exception.receiptExceptionId}
                >
                  <span>{exception.productName}</span>
                  <strong>
                    {exception.reason} · {formatNumber(exception.quantity)}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  function renderTransferDocumentDialog() {
    if (!selectedTransferDocument) {
      return null;
    }

    const issuableLineCount = selectedTransferDocument.lines.filter(
      (transfer) =>
        transfer.role === "SOURCE" &&
        transfer.outstandingIssueQuantity > 0 &&
        !transfer.isSerialized,
    ).length;
    const receivableLineCount = selectedTransferDocument.lines.filter(
      (transfer) =>
        transfer.role === "DESTINATION" &&
        transfer.outstandingReceiptQuantity > 0 &&
        !transfer.isSerialized,
    ).length;

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-document-dialog">
          <div className="rms-panel-title">
            <div>
              <span>Inter-store transfer</span>
              <h2>{selectedTransferDocument.documentNo}</h2>
            </div>
            <div className="rms-inline-actions">
              {issuableLineCount > 0 ? (
                <button
                  className="rms-button is-primary"
                  disabled={props.isBusy}
                  onClick={() =>
                    void issueAllTransferLines(selectedTransferDocument)
                  }
                  type="button"
                >
                  Issue all
                </button>
              ) : null}
              {receivableLineCount > 0 ? (
                <button
                  className="rms-button is-primary"
                  disabled={props.isBusy}
                  onClick={() =>
                    void receiveAllTransferLines(selectedTransferDocument)
                  }
                  type="button"
                >
                  Receive all
                </button>
              ) : null}
              <button
                className="rms-button"
                onClick={() => printTransferDocument(selectedTransferDocument)}
                type="button"
              >
                Print
              </button>
              <button
                className="rms-button"
                onClick={() => setSelectedTransferDocumentKey(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
          <div className="rms-document-summary-grid">
            <Stat
              label="From"
              value={selectedTransferDocument.sourceStoreName}
            />
            <Stat
              label="To"
              value={selectedTransferDocument.destinationStoreName}
            />
            <Stat
              label="Requested"
              value={formatNumber(selectedTransferDocument.requestedQuantity)}
            />
            <Stat
              label="Outstanding"
              value={formatNumber(
                selectedTransferDocument.outstandingReceiptQuantity,
              )}
              tone={
                selectedTransferDocument.outstandingReceiptQuantity > 0
                  ? "warn"
                  : "good"
              }
            />
          </div>
          <div className="rms-table rms-transfer-line-table">
            <div className="rms-table-head">
              <span>Item</span>
              <span>Requested</span>
              <span>Issued</span>
              <span>Received</span>
              <span>Outstanding</span>
              <span>Action</span>
            </div>
            {selectedTransferDocument.lines.map((transfer) => (
              <div className="rms-table-row" key={transfer.transferId}>
                <div>
                  <strong>{transfer.productName}</strong>
                  <small>
                    Line {transfer.lineNo} · {transfer.productCode}
                    {transfer.isSerialized ? " · Serialized" : ""}
                  </small>
                </div>
                <span>{formatNumber(transfer.requestedQuantity)}</span>
                <span>{formatNumber(transfer.issuedQuantity)}</span>
                <span>{formatNumber(transfer.receivedQuantity)}</span>
                <strong>
                  {formatNumber(
                    transfer.role === "SOURCE"
                      ? transfer.outstandingIssueQuantity
                      : transfer.outstandingReceiptQuantity,
                  )}
                </strong>
                {transfer.role === "SOURCE" &&
                transfer.outstandingIssueQuantity > 0 ? (
                  <button
                    className="rms-row-button"
                    disabled={props.isBusy}
                    onClick={() =>
                      transfer.isSerialized
                        ? void openTransferIssueSerials(transfer)
                        : void props.issueInterStoreTransfer(transfer)
                    }
                    type="button"
                  >
                    Issue
                  </button>
                ) : transfer.role === "DESTINATION" &&
                  transfer.outstandingReceiptQuantity > 0 ? (
                  transfer.isSerialized ? (
                    <button
                      className="rms-row-button"
                      disabled={props.isBusy}
                      onClick={() => openTransferReceiveSerials(transfer)}
                      type="button"
                    >
                      Serials
                    </button>
                  ) : (
                    <div className="rms-inline-actions">
                      <input
                        aria-label={`Receive quantity for ${transfer.transferNo}`}
                        min="0.001"
                        onChange={(event) =>
                          setTransferReceiptQuantities((current) => ({
                            ...current,
                            [transfer.transferId]: event.target.value,
                          }))
                        }
                        step="0.001"
                        type="number"
                        value={
                          transferReceiptQuantities[transfer.transferId] ??
                          String(transfer.outstandingReceiptQuantity)
                        }
                      />
                      <button
                        className="rms-row-button"
                        disabled={props.isBusy}
                        onClick={() =>
                          void props.receiveInterStoreTransfer(
                            transfer,
                            [],
                            Number(
                              transferReceiptQuantities[transfer.transferId] ??
                                transfer.outstandingReceiptQuantity,
                            ),
                          )
                        }
                        type="button"
                      >
                        Save
                      </button>
                    </div>
                  )
                ) : (
                  <StatusPill tone="good">Done</StatusPill>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderInventoryTabs() {
    return (
      <div
        className="rms-workspace-tabs"
        role="tablist"
        aria-label="Inventory workspace"
      >
        {inventoryTabs.map((tab) => (
          <button
            aria-selected={activeInventoryTab === tab.id}
            className={`rms-tab-button${activeInventoryTab === tab.id ? " is-active" : ""}`}
            key={tab.id}
            onClick={() => setActiveInventoryTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  function renderStockPanel() {
    return (
      <section className="rms-panel rms-tab-panel rms-inventory-browser">
        <div className="rms-panel-title">
          <div>
            <span>Stock</span>
            <h2>Inventory browser</h2>
          </div>
          <button
            className="rms-button"
            disabled={props.isBusy || !canViewInventory}
            onClick={() => void props.browseInventory()}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="rms-filter-row">
          <input
            onChange={(event) => props.setInventoryQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void props.browseInventory();
              }
            }}
            placeholder="Product, barcode, category"
            value={props.inventoryQuery}
          />
          <select
            onChange={(event) => props.setInventoryLocation(event.target.value)}
            value={props.inventoryLocation}
          >
            <option value="">All locations</option>
            {props.snapshot?.inventoryLocations.map((location) => (
              <option key={location.locationCode} value={location.locationCode}>
                {location.locationName}
              </option>
            ))}
          </select>
        </div>

        <div className="rms-table rms-inventory-table">
          <div className="rms-table-head">
            <span>Product</span>
            <span>Location</span>
            <span>On hand</span>
            <span>Price</span>
          </div>
          {props.inventoryItems.length ? (
            props.inventoryItems.map((item) => (
              <div
                className="rms-table-row"
                key={`${item.locationCode}-${item.productCode}`}
              >
                <div>
                  <strong>{item.productName}</strong>
                  <small>{item.productCode}</small>
                </div>
                <span>{item.locationName}</span>
                <strong>{formatNumber(item.quantityOnHand)}</strong>
                <span>{formatMoney(item.unitPrice)}</span>
              </div>
            ))
          ) : (
            <EmptyState title="No stock loaded" detail="Refresh inventory." />
          )}
        </div>
      </section>
    );
  }

  function renderReceivingPanel() {
    return (
      <section className="rms-panel rms-tab-panel">
        <div className="rms-panel-title">
          <div>
            <span>Receiving</span>
            <h2>Purchase orders</h2>
          </div>
        </div>
        {standaloneInventory ? (
          <div className="rms-standalone-po-composer">
            <div className="rms-panel-title rms-subsection-title">
              <div>
                <span>Standalone</span>
                <h2>Local purchase order</h2>
              </div>
              <StatusPill>{`${formatNumber(localPurchaseOrderLines.length)} line(s)`}</StatusPill>
            </div>
            <div className="rms-form-grid">
              <label>
                <span>Supplier</span>
                <select
                  disabled={!canCreateStandalonePurchaseOrder}
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      supplierNo: event.target.value,
                    }))
                  }
                  value={localPurchaseOrderDraft.supplierNo}
                >
                  <option value="">No supplier</option>
                  {props.snapshot?.availableSuppliers.map((supplier) => (
                    <option key={supplier.supplierNo} value={supplier.supplierNo}>
                      {supplier.supplierName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Location</span>
                <select
                  disabled={!canCreateStandalonePurchaseOrder}
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      inventoryLocationCode: event.target.value,
                    }))
                  }
                  value={localPurchaseOrderDraft.inventoryLocationCode}
                >
                  <option value="">Receiving default</option>
                  {props.snapshot?.inventoryLocations.map((location) => (
                    <option key={location.locationCode} value={location.locationCode}>
                      {location.locationName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Reference</span>
                <input
                  disabled={!canCreateStandalonePurchaseOrder}
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      externalReference: event.target.value,
                    }))
                  }
                  value={localPurchaseOrderDraft.externalReference}
                />
              </label>
              <label>
                <span>Note</span>
                <input
                  disabled={!canCreateStandalonePurchaseOrder}
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      note: event.target.value,
                    }))
                  }
                  value={localPurchaseOrderDraft.note}
                />
              </label>
              <label>
                <span>Product</span>
                <input
                  disabled={!canCreateStandalonePurchaseOrder}
                  onChange={(event) => {
                    setLocalPurchaseOrderProductSearch(event.target.value);
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      productCode: "",
                    }));
                  }}
                  placeholder="Search code or product name"
                  value={localPurchaseOrderProductSearch}
                />
                <select
                  disabled={!canCreateStandalonePurchaseOrder}
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      productCode: event.target.value,
                    }))
                  }
                  value={localPurchaseOrderDraft.productCode}
                >
                  <option value="">
                    {filteredLocalPurchaseProducts.length
                      ? "Select product"
                      : "No matching products"}
                  </option>
                  {filteredLocalPurchaseProducts.map((item) => (
                    <option key={item.productCode} value={item.productCode}>
                      {`${item.productCode} - ${item.productName}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Qty</span>
                <input
                  disabled={!canCreateStandalonePurchaseOrder}
                  min="0.001"
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      orderedQuantity: event.target.value,
                    }))
                  }
                  step="0.001"
                  type="number"
                  value={localPurchaseOrderDraft.orderedQuantity}
                />
              </label>
              <label>
                <span>Unit cost</span>
                <input
                  disabled={!canCreateStandalonePurchaseOrder}
                  min="0"
                  onChange={(event) =>
                    setLocalPurchaseOrderDraft((draft) => ({
                      ...draft,
                      unitCost: event.target.value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={localPurchaseOrderDraft.unitCost}
                />
              </label>
              <button
                className="rms-button"
                disabled={
                  props.isBusy ||
                  !canCreateStandalonePurchaseOrder ||
                  !localPurchaseOrderDraft.productCode
                }
                onClick={addLocalPurchaseOrderLine}
                type="button"
              >
                Add line
              </button>
              <button
                className="rms-button is-primary"
                disabled={
                  props.isBusy ||
                  !canCreateStandalonePurchaseOrder ||
                  (localPurchaseOrderLines.length === 0 &&
                    !localPurchaseOrderDraft.productCode)
                }
                onClick={() => void saveLocalPurchaseOrder()}
                type="button"
              >
                Create PO
              </button>
            </div>
            {localPurchaseOrderLines.length ? (
              <div className="rms-mini-list">
                {localPurchaseOrderLines.map((line) => (
                  <div className="rms-mini-row" key={line.id}>
                    <span>{line.productName}</span>
                    <strong>{`${formatNumber(line.orderedQuantity)} @ ${
                      line.unitCost == null ? "n/a" : formatMoney(line.unitCost)
                    }`}</strong>
                    <button
                      className="rms-link-button"
                      disabled={!canCreateStandalonePurchaseOrder}
                      onClick={() =>
                        setLocalPurchaseOrderLines((currentLines) =>
                          currentLines.filter((current) => current.id !== line.id),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="rms-table rms-receiving-header-table">
          <div className="rms-table-head">
            <span>Purchase order</span>
            <span>Supplier</span>
            <span>Location</span>
            <span>Outstanding</span>
            <span>Status</span>
            <span>View</span>
            <span>Receive</span>
          </div>
          {props.purchaseOrders.length ? (
            props.purchaseOrders.map((order) => (
              <div className="rms-table-row" key={order.purchaseOrderId}>
                <div>
                  <strong>{order.purchaseOrderNo}</strong>
                  <small>
                    {formatNumber(order.lineCount)} line(s) · updated{" "}
                    {formatRelative(order.updatedAt)}
                  </small>
                </div>
                <div>
                  <strong>{order.supplierName ?? "No supplier"}</strong>
                  <small>{order.supplierNo ?? "No supplier code"}</small>
                </div>
                <div>
                  <strong>{order.inventoryLocationName}</strong>
                  <small>{order.inventoryLocationCode}</small>
                </div>
                <strong>{formatNumber(order.outstandingQuantity)}</strong>
                <StatusPill>{order.status}</StatusPill>
                <ActionIconButton
                  label={`View ${order.purchaseOrderNo}`}
                  onClick={() =>
                    setSelectedPurchaseOrderId(order.purchaseOrderId)
                  }
                >
                  <ViewIcon />
                </ActionIconButton>
                <ActionIconButton
                  disabled={
                    props.isBusy ||
                    !canReceiveGoods ||
                    order.outstandingQuantity <= 0
                  }
                  label={`Receive ${order.purchaseOrderNo}`}
                  onClick={() =>
                    setSelectedPurchaseOrderId(order.purchaseOrderId)
                  }
                  tone="receive"
                >
                  <ReceiveIcon />
                </ActionIconButton>
              </div>
            ))
          ) : (
            <EmptyState title="No purchase orders" />
          )}
        </div>
        <div className="rms-panel-title rms-subsection-title">
          <div>
            <span>Goods receipt</span>
            <h2>Recent GRNs</h2>
          </div>
        </div>
        <div className="rms-table rms-grn-header-table">
          <div className="rms-table-head">
            <span>GRN</span>
            <span>Supplier</span>
            <span>Location</span>
            <span>Qty</span>
            <span>View</span>
            <span>Print</span>
          </div>
          {props.snapshot?.recentGoodsReceipts.length ? (
            props.snapshot.recentGoodsReceipts.map((receipt) => (
              <div className="rms-table-row" key={receipt.goodsReceiptId}>
                <div>
                  <strong>{receipt.goodsReceiptNo}</strong>
                  <small>
                    {receipt.purchaseOrderNo ?? "Direct receipt"} ·{" "}
                    {formatRelative(receipt.receivedAt)}
                  </small>
                </div>
                <div>
                  <strong>{receipt.supplierName ?? "Supplier not set"}</strong>
                  <small>{receipt.supplierNo ?? "No supplier code"}</small>
                </div>
                <div>
                  <strong>{receipt.inventoryLocationName}</strong>
                  <small>{receipt.inventoryLocationCode}</small>
                </div>
                <strong>{formatNumber(receipt.totalQuantity)}</strong>
                <ActionIconButton
                  label={`View ${receipt.goodsReceiptNo}`}
                  onClick={() =>
                    setSelectedGoodsReceiptId(receipt.goodsReceiptId)
                  }
                >
                  <ViewIcon />
                </ActionIconButton>
                <ActionIconButton
                  label={`Print ${receipt.goodsReceiptNo}`}
                  onClick={() => printGoodsReceipt(receipt)}
                  tone="print"
                >
                  <PrintIcon />
                </ActionIconButton>
              </div>
            ))
          ) : (
            <EmptyState title="No recent GRNs" />
          )}
        </div>
        <div className="rms-panel-title rms-subsection-title">
          <div>
            <span>Supplier return</span>
            <h2>Return against GRN</h2>
          </div>
        </div>
        <div className="rms-form-grid">
          <label>
            <span>Goods receipt</span>
            <select
              disabled={!canManageSupplierReturns}
              onChange={(event) =>
                setSupplierReturnGoodsReceiptId(event.target.value)
              }
              value={supplierReturnGoodsReceiptId}
            >
              <option value="">Select GRN</option>
              {supplierReturnReceipts.map((receipt) => (
                <option
                  key={receipt.goodsReceiptId}
                  value={receipt.goodsReceiptId}
                >
                  {receipt.goodsReceiptNo} ·{" "}
                  {receipt.supplierName ?? "Supplier not set"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Line</span>
            <select
              disabled={
                !canManageSupplierReturns || !selectedSupplierReturnReceipt
              }
              onChange={(event) =>
                setSupplierReturnGoodsReceiptLineId(event.target.value)
              }
              value={supplierReturnGoodsReceiptLineId}
            >
              <option value="">Select line</option>
              {(selectedSupplierReturnReceipt?.lines ?? []).map((line) => (
                <option
                  key={line.goodsReceiptLineId}
                  value={line.goodsReceiptLineId}
                >
                  {line.productName} · {formatNumber(line.quantity)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Reason</span>
            <select
              disabled={!canManageSupplierReturns}
              onChange={(event) =>
                setSupplierReturnReason(
                  event.target.value as StoreLocalSupplierReturnReason,
                )
              }
              value={supplierReturnReason}
            >
              {supplierReturnReasonOptions.map((reason) => (
                <option key={reason} value={reason}>
                  {formatSupplierReturnReason(reason)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Quantity</span>
            <input
              disabled={
                !canManageSupplierReturns ||
                (selectedSupplierReturnLine?.serialNumbers.length ?? 0) > 0
              }
              min="0.001"
              onChange={(event) =>
                setSupplierReturnQuantity(event.target.value)
              }
              step="0.001"
              type="number"
              value={
                (selectedSupplierReturnLine?.serialNumbers.length ?? 0) > 0
                  ? String(parseSerialDraft(supplierReturnSerialNumbers).length)
                  : supplierReturnQuantity
              }
            />
          </label>
          <label>
            <span>Reference</span>
            <input
              disabled={!canManageSupplierReturns}
              onChange={(event) =>
                setSupplierReturnExternalReference(event.target.value)
              }
              placeholder="Supplier claim or RMA"
              value={supplierReturnExternalReference}
            />
          </label>
          <label>
            <span>Note</span>
            <input
              disabled={!canManageSupplierReturns}
              onChange={(event) => setSupplierReturnNote(event.target.value)}
              placeholder="Condition, approval, or dispatch note"
              value={supplierReturnNote}
            />
          </label>
          {(selectedSupplierReturnLine?.serialNumbers.length ?? 0) > 0 ? (
            <label className="rms-form-span-2">
              <span>Serials</span>
              <textarea
                disabled={!canManageSupplierReturns}
                onChange={(event) =>
                  setSupplierReturnSerialNumbers(event.target.value)
                }
                placeholder={
                  selectedSupplierReturnLine?.serialNumbers.join(", ") ??
                  "Enter serials"
                }
                value={supplierReturnSerialNumbers}
              />
            </label>
          ) : null}
          <button
            className="rms-button is-primary"
            disabled={
              props.isBusy ||
              !canManageSupplierReturns ||
              !selectedSupplierReturnLine
            }
            onClick={() => void postSupplierReturn()}
            type="button"
          >
            Post supplier return
          </button>
        </div>
        <div className="rms-table rms-grn-header-table">
          <div className="rms-table-head">
            <span>Return</span>
            <span>Supplier</span>
            <span>GRN</span>
            <span>Reason</span>
            <span>Qty</span>
            <span>Status</span>
          </div>
          {props.snapshot?.recentSupplierReturns.length ? (
            props.snapshot.recentSupplierReturns.map((supplierReturn) => (
              <div
                className="rms-table-row"
                key={supplierReturn.supplierReturnId}
              >
                <div>
                  <strong>{supplierReturn.supplierReturnNo}</strong>
                  <small>{formatRelative(supplierReturn.returnedAt)}</small>
                </div>
                <div>
                  <strong>{supplierReturn.supplierName}</strong>
                  <small>{supplierReturn.supplierNo}</small>
                </div>
                <div>
                  <strong>{supplierReturn.goodsReceiptNo}</strong>
                  <small>{supplierReturn.inventoryLocationName}</small>
                </div>
                <span>{formatSupplierReturnReason(supplierReturn.reason)}</span>
                <strong>{formatNumber(supplierReturn.totalQuantity)}</strong>
                <StatusPill
                  tone={supplierReturn.status === "POSTED" ? "good" : "warn"}
                >
                  {supplierReturn.status}
                </StatusPill>
              </div>
            ))
          ) : (
            <EmptyState
              title="No supplier returns"
              detail="Post a return from a received GRN line."
            />
          )}
        </div>
        {renderPurchaseOrderDialog()}
        {renderGoodsReceiptDialog()}
      </section>
    );
  }

  function renderTransfersPanel() {
    const transferActionHeader =
      transferDirectionFilter === "OUT"
        ? "Issue"
        : transferDirectionFilter === "IN"
          ? "Receive"
          : "Issue / Receive";

    return (
      <section className="rms-panel rms-tab-panel rms-stock-request-panel">
        <div className="rms-panel-title">
          <div>
            <span>Stock request</span>
            <h2>Historical requests</h2>
          </div>
          <div className="rms-inline-actions">
            <button
              className="rms-button"
              disabled={props.isBusy}
              onClick={() => void props.browseInventory()}
              type="button"
            >
              Refresh
            </button>
            {!standaloneInventory ? (
              <button
                className="rms-button"
                disabled={props.isBusy || !props.snapshot?.enterpriseBaseUrl}
                onClick={() => setRemoteLookupOpen(true)}
                type="button"
              >
                Lookup HQ
              </button>
            ) : null}
            {canRequestTransfer ? (
              <button
                className="rms-button is-primary"
                disabled={props.isBusy}
                onClick={() => {
                  setTransferRequestDialogOpen(true);
                  setActiveTransferEntryTab("header");
                }}
                type="button"
              >
                Create new
              </button>
            ) : null}
          </div>
        </div>

        <div className="rms-filter-row">
          <input
            onChange={(event) => setTransferHistoryFrom(event.target.value)}
            type="date"
            value={transferHistoryFrom}
          />
          <input
            onChange={(event) => setTransferHistoryTo(event.target.value)}
            type="date"
            value={transferHistoryTo}
          />
          <select
            onChange={(event) =>
              setTransferDirectionFilter(
                event.target.value as TransferDirectionFilter,
              )
            }
            value={transferDirectionFilter}
          >
            <option value="ALL">Transfer in / out</option>
            <option value="IN">Transfer in</option>
            <option value="OUT">Transfer out</option>
          </select>
          <select
            onChange={(event) => setTransferHistoryShop(event.target.value)}
            value={transferHistoryShop}
          >
            <option value="">All shops</option>
            {transferShopOptions.map(([shopCode, shopName]) => (
              <option key={shopCode} value={shopCode}>
                {shopName}
              </option>
            ))}
          </select>
        </div>

        <div className="rms-table rms-stock-request-table">
          <div className="rms-table-head">
            <span>Document</span>
            <span>From</span>
            <span>To</span>
            <span>Lines</span>
            <span>Outstanding</span>
            <span>Status</span>
            <span>View</span>
            <span>{transferActionHeader}</span>
            <span>Print</span>
          </div>
          {filteredTransferHistoryRows.length ? (
            filteredTransferHistoryRows.map((row) => {
              const transferGroup =
                row.kind === "Transfer" && "group" in row ? row.group : null;
              const canIssueTransfer =
                transferGroup !== null &&
                transferGroup.lines.some((line) => line.role === "SOURCE") &&
                transferGroup.outstandingIssueQuantity > 0;
              const canReceiveTransfer =
                transferGroup !== null &&
                transferGroup.lines.some((line) => line.role === "DESTINATION") &&
                transferGroup.outstandingReceiptQuantity > 0;
              const canProcessTransfer =
                canIssueTransfer || canReceiveTransfer;
              const processLabel =
                canIssueTransfer ||
                (transferDirectionFilter === "OUT" && transferGroup !== null)
                  ? "Issue"
                  : "Receive";
              const displayQuantity =
                transferGroup && "outstandingQuantity" in row
                  ? row.outstandingQuantity
                  : row.quantity;

              return (
                <div className="rms-table-row" key={`${row.kind}-${row.id}`}>
                  <div>
                    <strong>{row.documentNo}</strong>
                    <small>
                      {row.kind} · {formatRelative(row.updatedAt)}
                      {row.reference ? ` · ${row.reference}` : ""}
                    </small>
                  </div>
                  <div>
                    <strong>{row.sourceShop}</strong>
                    <small>{row.sourceShopCode}</small>
                  </div>
                  <div>
                    <strong>{row.destinationShop}</strong>
                    <small>{row.destinationShopCode}</small>
                  </div>
                  <div>
                    <strong>{row.productName}</strong>
                    <small>{row.productCode}</small>
                  </div>
                  <strong>{formatNumber(displayQuantity)}</strong>
                  <StatusPill>{row.status}</StatusPill>
                  {transferGroup ? (
                    <ActionIconButton
                      label={`View ${transferGroup.documentNo}`}
                      onClick={() =>
                        setSelectedTransferDocumentKey(transferGroup.key)
                      }
                    >
                      <ViewIcon />
                    </ActionIconButton>
                  ) : (
                    <span />
                  )}
                  {transferGroup ? (
                    <ActionIconButton
                      disabled={props.isBusy || !canProcessTransfer}
                      label={`${processLabel} ${transferGroup.documentNo}`}
                      onClick={() =>
                        setSelectedTransferDocumentKey(transferGroup.key)
                      }
                      tone="receive"
                    >
                      <ReceiveIcon />
                    </ActionIconButton>
                  ) : row.draft?.status === "DRAFT" ? (
                    <button
                      className="rms-row-button"
                      disabled={props.isBusy}
                      onClick={() =>
                        void props.submitTransferRequestDraft(
                          row.draft!.draftId,
                        )
                      }
                      type="button"
                    >
                      Submit
                    </button>
                  ) : (
                    <span />
                  )}
                  {transferGroup ? (
                    <ActionIconButton
                      label={`Print ${transferGroup.documentNo}`}
                      onClick={() => printTransferDocument(transferGroup)}
                      tone="print"
                    >
                      <PrintIcon />
                    </ActionIconButton>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })
          ) : (
            <EmptyState
              title="No stock requests"
              detail="Create a request or adjust the date/shop filters."
            />
          )}
        </div>
        {renderTransferDocumentDialog()}

        {transferRequestDialogOpen ? (
          <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
            <section className="rms-dialog rms-wide-dialog rms-stock-request-dialog">
              <div className="rms-panel-title">
                <div>
                  <span>Stock request</span>
                  <h2>Create request</h2>
                </div>
                <button
                  className="rms-button"
                  onClick={() => setTransferRequestDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <div
                className="rms-workspace-tabs"
                role="tablist"
                aria-label="Stock request entry"
              >
                {(["header", "details"] as const).map((tab) => (
                  <button
                    aria-selected={activeTransferEntryTab === tab}
                    className={`rms-tab-button${activeTransferEntryTab === tab ? " is-active" : ""}`}
                    key={tab}
                    onClick={() => setActiveTransferEntryTab(tab)}
                    role="tab"
                    type="button"
                  >
                    {tab === "header" ? "Header" : "Details"}
                  </button>
                ))}
              </div>

              {activeTransferEntryTab === "header" ? (
                <div className="rms-form-grid">
                  <label>
                    <span>Ship from</span>
                    <select
                      onChange={(event) =>
                        props.setTransferSourceLocation(event.target.value)
                      }
                      value={props.transferSourceLocation}
                    >
                      <option value="">Source location</option>
                      {props.snapshot?.transferRequestTargets.map((target) => (
                        <option
                          key={`${target.sourceStoreCode}-${target.sourceLocationCode}`}
                          value={target.sourceLocationCode}
                        >
                          {target.sourceStoreName} · {target.sourceLocationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Ship to</span>
                    <select
                      onChange={(event) =>
                        props.setTransferDestinationLocation(event.target.value)
                      }
                      value={props.transferDestinationLocation}
                    >
                      <option value="">Destination location</option>
                      {props.snapshot?.inventoryLocations.map((location) => (
                        <option
                          key={location.locationCode}
                          value={location.locationCode}
                        >
                          {location.locationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Reference</span>
                    <input
                      onChange={(event) =>
                        setTransferRequestReference(event.target.value)
                      }
                      placeholder="Optional request reference"
                      value={transferRequestReference}
                    />
                  </label>
                  <label>
                    <span>Date required</span>
                    <input
                      onChange={(event) =>
                        setTransferRequiredDate(event.target.value)
                      }
                      type="date"
                      value={transferRequiredDate}
                    />
                  </label>
                  <label className="rms-form-span-2">
                    <span>Note</span>
                    <input
                      onChange={(event) =>
                        setTransferRequestNote(event.target.value)
                      }
                      placeholder="Reason, customer demand, or delivery instruction"
                      value={transferRequestNote}
                    />
                  </label>
                </div>
              ) : (
                <div className="rms-stock-request-details">
                  <div className="rms-form-grid">
                    <label>
                      <span>Item</span>
                      <select
                        onChange={(event) =>
                          props.setTransferProductCode(event.target.value)
                        }
                        value={props.transferProductCode}
                      >
                        <option value="">Select item</option>
                        {requestableProducts.map((item) => (
                          <option
                            key={item.productCode}
                            value={item.productCode}
                          >
                            {item.productName} · {item.productCode}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Quantity</span>
                      <input
                        onChange={(event) =>
                          props.setTransferQuantity(event.target.value)
                        }
                        min="0.001"
                        step="0.001"
                        type="number"
                        value={props.transferQuantity}
                      />
                    </label>
                    <button
                      className="rms-button"
                      disabled={
                        !props.transferProductCode ||
                        Number(props.transferQuantity) <= 0
                      }
                      onClick={addTransferRequestLine}
                      type="button"
                    >
                      Add line
                    </button>
                  </div>
                  <div className="rms-table rms-stock-request-line-table">
                    <div className="rms-table-head">
                      <span>Item</span>
                      <span>Code</span>
                      <span>Quantity</span>
                      <span />
                    </div>
                    {transferRequestLines.length ? (
                      transferRequestLines.map((line) => (
                        <div className="rms-table-row" key={line.id}>
                          <strong>{line.productName}</strong>
                          <span>{line.productCode}</span>
                          <span>{formatNumber(line.quantity)}</span>
                          <button
                            className="rms-row-button"
                            onClick={() =>
                              setTransferRequestLines((currentLines) =>
                                currentLines.filter(
                                  (currentLine) => currentLine.id !== line.id,
                                ),
                              )
                            }
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="No detail lines"
                        detail="Add the requested items before saving."
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="rms-total-strip">
                <Stat
                  label="Line count"
                  value={formatNumber(transferRequestLines.length)}
                />
                <Stat
                  label="Request qty"
                  value={formatNumber(
                    transferRequestLines.reduce(
                      (sum, line) => sum + line.quantity,
                      0,
                    ),
                  )}
                />
                <Stat
                  label="Date required"
                  value={transferRequiredDate || "Not set"}
                />
                <button
                  className="rms-button is-primary"
                  disabled={
                    props.isBusy ||
                    !props.transferSourceLocation ||
                    !props.transferDestinationLocation ||
                    transferRequestLines.length === 0
                  }
                  onClick={() => void saveTransferRequestLines()}
                  type="button"
                >
                  Save
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  function renderCountsPanel() {
    return (
      <section className="rms-panel rms-tab-panel">
        <div className="rms-panel-title">
          <div>
            <span>Count</span>
            <h2>Stock count</h2>
          </div>
        </div>
        {canSubmitCount ? (
          <div className="rms-workflow-card">
            <div
              className="rms-workspace-tabs"
              role="tablist"
              aria-label="Stock count workflow"
            >
              {(["header", "sheet", "variance"] as const).map((tab) => (
                <button
                  aria-selected={activeCountEntryTab === tab}
                  className={`rms-tab-button${activeCountEntryTab === tab ? " is-active" : ""}`}
                  key={tab}
                  onClick={() => setActiveCountEntryTab(tab)}
                  role="tab"
                  type="button"
                >
                  {tab === "header"
                    ? "Header"
                    : tab === "sheet"
                      ? "Count Sheet"
                      : "Variance"}
                </button>
              ))}
            </div>
            {activeCountEntryTab === "header" ? (
              <div className="rms-form-grid">
                <select
                  onChange={(event) =>
                    props.setInventoryLocation(event.target.value)
                  }
                  value={props.inventoryLocation}
                >
                  <option value="">Select count location</option>
                  {props.snapshot?.inventoryLocations.map((location) => (
                    <option
                      key={location.locationCode}
                      value={location.locationCode}
                    >
                      {location.locationName}
                    </option>
                  ))}
                </select>
                <input
                  onChange={(event) =>
                    props.setStockCountNote(event.target.value)
                  }
                  placeholder="Count title or note"
                  value={props.stockCountNote}
                />
                <input readOnly value="Count number: automatic on first save" />
                <button
                  className="rms-button"
                  disabled={props.isBusy || !props.inventoryLocation}
                  onClick={() => void props.browseInventory()}
                  type="button"
                >
                  Load items
                </button>
              </div>
            ) : null}
            {activeCountEntryTab === "sheet" ? (
              <div className="rms-form-grid">
                <select
                  onChange={(event) =>
                    props.setStockCountProductCode(event.target.value)
                  }
                  value={props.stockCountProductCode}
                >
                  <option value="">Add item manually</option>
                  {countLocationItems.map((item) => (
                    <option
                      key={`${item.locationCode}-${item.productCode}`}
                      value={item.productCode}
                    >
                      {item.productName} · system{" "}
                      {formatNumber(item.quantityOnHand)}
                    </option>
                  ))}
                </select>
                <input
                  onChange={(event) =>
                    props.setStockCountQuantity(event.target.value)
                  }
                  min="0"
                  step="0.001"
                  type="number"
                  value={props.stockCountQuantity}
                />
                <button
                  className="rms-button is-primary"
                  disabled={
                    props.isBusy ||
                    !props.inventoryLocation ||
                    !props.stockCountProductCode
                  }
                  onClick={() => void props.saveStockCount()}
                  type="button"
                >
                  Save line
                </button>
                <button
                  className="rms-button"
                  disabled={!props.inventoryItems.length}
                  onClick={exportCountSheet}
                  type="button"
                >
                  Export sheet
                </button>
                <label className="rms-file-button">
                  Upload Excel/CSV
                  <input
                    accept=".csv,.txt"
                    onChange={(event) =>
                      void importCountSheet(
                        event.currentTarget.files?.[0] ?? null,
                      )
                    }
                    type="file"
                  />
                </label>
              </div>
            ) : null}
            {activeCountEntryTab === "variance" ? (
              <div className="rms-count-variance">
                <div className="rms-table rms-count-variance-table">
                  <div className="rms-table-head">
                    <span>Item</span>
                    <span>System</span>
                    <span>Counted</span>
                    <span>Variance</span>
                  </div>
                  {props.stockCountRows.length ? (
                    props.stockCountRows.map((row) => (
                      <div
                        className={`rms-table-row is-variance-${
                          row.varianceQuantity === null ||
                          row.varianceQuantity === 0
                            ? "equal"
                            : row.varianceQuantity > 0
                              ? "over"
                              : "short"
                        }`}
                        key={row.productCode}
                      >
                        <div>
                          <strong>{row.productName}</strong>
                          <small>{row.productCode}</small>
                        </div>
                        <span>{formatNumber(row.systemQuantity)}</span>
                        <span>
                          {row.countedQuantity === null
                            ? "Missing"
                            : formatNumber(row.countedQuantity)}
                        </span>
                        <strong>
                          {row.varianceQuantity === null
                            ? "Review"
                            : formatNumber(row.varianceQuantity)}
                        </strong>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No uploaded count sheet"
                      detail="Export a count sheet, populate counted quantities, then upload it."
                    />
                  )}
                </div>
                <div className="rms-sync-actions">
                  <button
                    className="rms-button is-primary"
                    disabled={
                      props.isBusy ||
                      !props.stockCountRows.some(
                        (row) => row.countedQuantity !== null,
                      )
                    }
                    onClick={() => void saveCalculatedCountRows()}
                    type="button"
                  >
                    Save calculated rows
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="rms-list">
          {props.snapshot?.stockCountSessions.length ? (
            props.snapshot.stockCountSessions.map((session) => (
              <div className="rms-list-row" key={session.sessionId}>
                <div>
                  <strong>{session.sessionNo}</strong>
                  <span>
                    {session.productCode} · variance{" "}
                    {formatNumber(session.varianceQuantity)}
                  </span>
                </div>
                <StatusPill>{session.status}</StatusPill>
                {session.status === "DRAFT" ? (
                  <button
                    className="rms-row-button"
                    disabled={props.isBusy}
                    onClick={() =>
                      void props.submitStockCount(session.sessionId)
                    }
                    type="button"
                  >
                    Submit
                  </button>
                ) : null}
                {session.status === "SUBMITTED" ? (
                  <button
                    className="rms-row-button"
                    disabled={props.isBusy}
                    onClick={() =>
                      void props.commitStockCount(
                        session.sessionId,
                        session.sessionNo,
                      )
                    }
                    type="button"
                  >
                    Commit
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState title="No stock counts" />
          )}
        </div>
      </section>
    );
  }

  function renderRemoteInventoryDialog() {
    if (!remoteLookupOpen || standaloneInventory) {
      return null;
    }

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog">
          <div className="rms-panel-title">
            <div>
              <span>HQ inventory</span>
              <h2>Other shop stock</h2>
            </div>
            <button
              className="rms-button"
              onClick={() => setRemoteLookupOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="rms-dialog-body">
            <div className="rms-dialog-toolbar">
              <input
                autoFocus
                onChange={(event) =>
                  props.setRemoteInventoryQuery(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void props.lookupRemoteInventory();
                  }
                }}
                placeholder="Product, category, barcode"
                value={props.remoteInventoryQuery}
              />
              <select
                onChange={(event) =>
                  props.setRemoteInventoryStoreFilter(event.target.value)
                }
                value={props.remoteInventoryStoreFilter}
              >
                <option value="">All stores</option>
                {remoteStoreOptions.map(([storeCode, storeName]) => (
                  <option key={storeCode} value={storeCode}>
                    {storeName}
                  </option>
                ))}
              </select>
              <select
                onChange={(event) =>
                  props.setRemoteInventoryItemFilter(event.target.value)
                }
                value={props.remoteInventoryItemFilter}
              >
                <option value="">All items</option>
                {remoteItemOptions.map(([productCode, productName]) => (
                  <option key={productCode} value={productCode}>
                    {productName}
                  </option>
                ))}
              </select>
              <select
                onChange={(event) =>
                  props.setRemoteInventoryLocationFilter(event.target.value)
                }
                value={props.remoteInventoryLocationFilter}
              >
                <option value="">All locations</option>
                {remoteLocationOptions.map(
                  ([locationCode, { locationName, storeName }]) => (
                    <option key={locationCode} value={locationCode}>
                      {locationName} - {storeName}
                    </option>
                  ),
                )}
              </select>
              <button
                className="rms-button is-primary"
                disabled={props.isBusy || !props.snapshot?.enterpriseBaseUrl}
                onClick={() => void props.lookupRemoteInventory()}
                type="button"
              >
                Search HQ
              </button>
            </div>
            <div className="rms-table rms-remote-inventory-table">
              <div className="rms-table-head">
                <span>Product</span>
                <span>Shop</span>
                <span>Location</span>
                <span>On hand</span>
                <span>Updated</span>
                <span />
              </div>
              {props.remoteInventoryRows.length ? (
                props.remoteInventoryRows.map((row) => (
                  <div
                    className="rms-table-row"
                    key={`${row.storeCode}-${row.locationCode}-${row.productCode}`}
                  >
                    <div>
                      <strong>{row.productName}</strong>
                      <small>{row.productCode}</small>
                    </div>
                    <div>
                      <strong>{row.storeName}</strong>
                      <small>{row.storeCode}</small>
                    </div>
                    <div>
                      <strong>{row.locationName}</strong>
                      <small>{row.locationCode}</small>
                    </div>
                    <strong>{formatNumber(row.quantityOnHand)}</strong>
                    <span>{formatRelative(row.updatedAt)}</span>
                    <button
                      className="rms-row-button"
                      disabled={
                        props.isBusy || !props.transferDestinationLocation
                      }
                      onClick={() => void props.requestRemoteStock(row)}
                      type="button"
                    >
                      Request
                    </button>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No remote stock loaded"
                  detail="Search HQ for stock across other shops."
                />
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!canViewInventory) {
    return (
      <div className="rms-workspace">
        <section className="rms-panel">
          <EmptyState title="Inventory is not available for this operator" />
        </section>
      </div>
    );
  }

  return (
    <div className="rms-workspace rms-tabbed-workspace">
      {renderInventoryTabs()}
      <div className="rms-tab-panel-stack">
        {activeInventoryTab === "stock" ? renderStockPanel() : null}
        {activeInventoryTab === "receiving" ? renderReceivingPanel() : null}
        {activeInventoryTab === "transfers" ? renderTransfersPanel() : null}
        {activeInventoryTab === "counts" ? renderCountsPanel() : null}
      </div>
      {renderRemoteInventoryDialog()}
      {props.inventorySerialDraft ? (
        <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
          <section className="rms-dialog">
            <div className="rms-panel-title">
              <div>
                <span>Serial movement</span>
                <h2>{props.inventorySerialDraft.title}</h2>
              </div>
              <button
                className="rms-button"
                onClick={() => props.setInventorySerialDraft(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="rms-readonly-field">
              <span>{props.inventorySerialDraft.productName}</span>
              <strong>
                {selectedInventorySerials.length} of{" "}
                {formatNumber(props.inventorySerialDraft.quantity)} serial(s)
              </strong>
            </div>
            <div className="rms-serial-picker">
              <div className="rms-serial-entry-row">
                <input
                  autoFocus
                  onChange={(event) =>
                    props.setInventorySerialDraft((draft) =>
                      draft
                        ? { ...draft, serialEntry: event.target.value }
                        : draft,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addInventorySerialCandidates([
                        props.inventorySerialDraft?.serialEntry ?? "",
                      ]);
                    }
                  }}
                  placeholder="Enter one serial number"
                  value={props.inventorySerialDraft.serialEntry}
                />
                <button
                  className="rms-button"
                  onClick={() =>
                    addInventorySerialCandidates([
                      props.inventorySerialDraft?.serialEntry ?? "",
                    ])
                  }
                  type="button"
                >
                  Add serial
                </button>
              </div>
              <div className="rms-serial-entry-row is-range">
                <input
                  onChange={(event) =>
                    props.setInventorySerialDraft((draft) =>
                      draft
                        ? { ...draft, serialRangeStart: event.target.value }
                        : draft,
                    )
                  }
                  placeholder="Range start"
                  value={props.inventorySerialDraft.serialRangeStart}
                />
                <input
                  onChange={(event) =>
                    props.setInventorySerialDraft((draft) =>
                      draft
                        ? { ...draft, serialRangeEnd: event.target.value }
                        : draft,
                    )
                  }
                  placeholder="Range end"
                  value={props.inventorySerialDraft.serialRangeEnd}
                />
                <button
                  className="rms-button"
                  onClick={addInventorySerialRange}
                  type="button"
                >
                  Add range
                </button>
              </div>
              <div className="rms-serial-status">
                <strong>
                  {props.inventorySerialDraft.message ??
                    "Serials will be validated before posting."}
                </strong>
                <span>
                  {props.inventorySerialDraft.availableSerialNumbers.length
                    ? `${props.inventorySerialDraft.availableSerialNumbers.length} available serial(s) found for this movement.`
                    : "This movement accepts new serials and will reject duplicates during posting."}
                </span>
              </div>
              <div className="rms-serial-grid">
                <div className="rms-serial-grid-head">
                  <span>#</span>
                  <span>Serial number</span>
                  <span />
                </div>
                {selectedInventorySerials.length ? (
                  selectedInventorySerials.map((serialNumber, index) => (
                    <div className="rms-serial-grid-row" key={serialNumber}>
                      <span>{index + 1}</span>
                      <strong>{serialNumber}</strong>
                      <button
                        className="rms-row-button is-danger"
                        onClick={() =>
                          props.setInventorySerialDraft((draft) =>
                            draft
                              ? {
                                  ...draft,
                                  serialNumbers: parseSerialDraft(
                                    draft.serialNumbers,
                                  )
                                    .filter(
                                      (entry) =>
                                        entry.toUpperCase() !==
                                        serialNumber.toUpperCase(),
                                    )
                                    .join("\n"),
                                  message: `${serialNumber} removed.`,
                                }
                              : draft,
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No serials selected"
                    detail="Add serials until the count matches the quantity."
                  />
                )}
              </div>
            </div>
            <div className="rms-dialog-actions">
              <button
                className="rms-button"
                onClick={() => props.setInventorySerialDraft(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rms-button is-primary"
                disabled={props.isBusy || inventorySerialMismatch}
                onClick={() =>
                  void props.inventorySerialDraft
                    ?.onSubmit(selectedInventorySerials)
                    .then(() => {
                      props.setInventorySerialDraft(null);
                    })
                }
                type="button"
              >
                {props.inventorySerialDraft.submitLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ManagerWorkspace(props: {
  snapshot: StoreSyncSnapshot | null;
  activeShift: ReturnType<typeof firstOpenShift>;
  activeShiftOwnedByOperator: boolean;
  capabilities: ReturnType<typeof getCapabilities>;
  isBusy: boolean;
  managerReportPanelOpen: boolean;
  managerShiftId: string;
  storeReport: StoreReportResult | null;
  reportDateFrom: string;
  reportDateTo: string;
  reportCashierCode: string;
  reportCustomerQuery: string;
  reportProductQuery: string;
  shiftOpeningFloat: string;
  shiftDeclaredCash: string;
  eodDeclaredCash: string;
  eodNote: string;
  bankingReconciliationId: string;
  bankingAmount: string;
  bankingBankName: string;
  bankingBankAccountId: string;
  bankingReference: string;
  setShiftOpeningFloat: (value: string) => void;
  setShiftDeclaredCash: (value: string) => void;
  setEodDeclaredCash: (value: string) => void;
  setEodNote: (value: string) => void;
  setManagerReportPanelOpen: (value: boolean) => void;
  setManagerShiftId: (value: string) => void;
  setReportDateFrom: (value: string) => void;
  setReportDateTo: (value: string) => void;
  setReportCashierCode: (value: string) => void;
  setReportCustomerQuery: (value: string) => void;
  setReportProductQuery: (value: string) => void;
  setBankingReconciliationId: (value: string) => void;
  setBankingAmount: (value: string) => void;
  setBankingBankName: (value: string) => void;
  setBankingBankAccountId: (value: string) => void;
  setBankingReference: (value: string) => void;
  setShiftCloseDialogOpen: (value: boolean) => void;
  openShift: () => Promise<void>;
  closeShift: () => Promise<void>;
  printShiftReport: (
    reportType: "X" | "Z",
    autoPrint?: boolean,
  ) => Promise<void>;
  loadStoreReport: (scope: "CASHIER" | "STORE") => Promise<void>;
  recordEod: () => Promise<void>;
  recordBanking: () => Promise<void>;
  runAction: (
    action: (desktopRuntime: DesktopRuntimeApi) => Promise<StoreSyncActionResult>,
  ) => Promise<StoreSyncActionResult | null>;
}) {
  const canOpenShift = props.capabilities?.canOpenShift === true;
  const canPrintXReport =
    Boolean(props.activeShift) &&
    (props.capabilities?.cashierEligible === true ||
      props.capabilities?.canProcessSale === true ||
      props.capabilities?.canOpenShift === true);
  const canCloseShift =
    props.capabilities?.canCloseShift === true &&
    props.capabilities?.supervisorEligible === true;
  const shiftOptions = Array.from(
    new Map(
      [
        props.activeShift,
        ...(props.snapshot?.openShifts ?? []),
        ...(props.snapshot?.recentStoreShifts ?? []),
        ...(props.snapshot?.recentClosedShifts ?? []),
      ]
        .filter((shift): shift is NonNullable<typeof shift> => Boolean(shift))
        .map((shift) => [shift.shiftId, shift] as const),
    ).values(),
  );
  const selectedManagerShift =
    shiftOptions.find((shift) => shift.shiftId === props.managerShiftId) ??
    props.activeShift ??
    shiftOptions[0] ??
    null;
  const [activeManagerTab, setActiveManagerTab] = useState<
    "shift" | "eod" | "banking" | "expenses" | "summary"
  >("shift");
  const [expenseDraftId, setExpenseDraftId] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInputValue());
  const [expenseCategory, setExpenseCategory] = useState("GENERAL");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseSupplierName, setExpenseSupplierName] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("CASH");
  const [expenseReference, setExpenseReference] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseTaxAmount, setExpenseTaxAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseAttachment, setExpenseAttachment] = useState<{
    fileName: string;
    contentType: string;
    contentBase64: string;
  } | null>(null);
  const [expenseMessage, setExpenseMessage] = useState("");
  const [pendingExpenseConfirmation, setPendingExpenseConfirmation] = useState<{
    expenseId: string;
    expenseNo: string;
    amount: number;
  } | null>(null);

  function createLocalExpenseDraftId() {
    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return `local-expense-${randomId}`;
  }

  function resetExpenseDraft() {
    setExpenseDraftId("");
    setExpenseDate(todayInputValue());
    setExpenseCategory("GENERAL");
    setExpenseDescription("");
    setExpenseSupplierName("");
    setExpensePaymentMethod("CASH");
    setExpenseReference("");
    setExpenseAmount("");
    setExpenseTaxAmount("");
    setExpenseNote("");
    setExpenseAttachment(null);
    setPendingExpenseConfirmation(null);
  }

  function saveReceiptLogo(companyLogoUrl: string | null) {
    void props.runAction((runtime) =>
      runtime.saveLocalReceiptLogo({
        companyLogoUrl,
      }),
    );
  }

  function selectReceiptLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const imageDataUrl = typeof reader.result === "string" ? reader.result : "";

      if (imageDataUrl) {
        saveReceiptLogo(imageDataUrl);
      }
    });
    reader.readAsDataURL(file);
  }

  function selectExpenseAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",").pop() ?? "" : result;

      if (base64) {
        setExpenseAttachment({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64: base64,
        });
      }
    });
    reader.readAsDataURL(file);
  }

  async function saveStoreExpense(confirmAfterSave = false) {
    const nextExpenseId = expenseDraftId || createLocalExpenseDraftId();
    const payload: StoreStoreExpenseInput = {
      expenseId: nextExpenseId,
      expenseDate,
      category: expenseCategory,
      description: expenseDescription,
      supplierName: expenseSupplierName,
      paymentMethod: expensePaymentMethod,
      externalReference: expenseReference,
      amount: Number(expenseAmount),
      taxAmount: Number(expenseTaxAmount || 0),
      attachmentFileName: expenseAttachment?.fileName ?? null,
      attachmentContentType: expenseAttachment?.contentType ?? null,
      attachmentContentBase64: expenseAttachment?.contentBase64 ?? null,
      operatorName:
        props.snapshot?.activeOperatorSession?.displayName ??
        props.snapshot?.activeOperatorSession?.loginId ??
        null,
      note: expenseNote,
    };

    const saved = await props.runAction((runtime) =>
      runtime.saveStoreExpenseDraft(payload),
    );

    if (!saved) {
      return;
    }

    const savedExpenseId = saved.expenseId ?? nextExpenseId;
    setExpenseDraftId(savedExpenseId);
    setExpenseMessage(saved.message);

    if (confirmAfterSave) {
      setPendingExpenseConfirmation({
        expenseId: savedExpenseId,
        expenseNo: saved.expenseNo ?? "Expense",
        amount: Number(expenseAmount || 0) + Number(expenseTaxAmount || 0),
      });
    }
  }

  async function confirmPendingStoreExpense() {
    if (!pendingExpenseConfirmation) {
      return;
    }

    const confirmed = await props.runAction((runtime) =>
      runtime.confirmStoreExpense(pendingExpenseConfirmation.expenseId),
    );

    if (confirmed) {
      setExpenseMessage(confirmed.message);
      resetExpenseDraft();
    }
  }

  return (
    <div className="rms-workspace rms-tabbed-workspace">
      <div
        className="rms-workspace-tabs"
        role="tablist"
        aria-label="Manager workspace"
      >
        {(
          [
            ["shift", "Shift"],
            ["eod", "EOD"],
            ["banking", "Banking"],
            ["expenses", "Expenses"],
            ["summary", "Summary"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-selected={activeManagerTab === id}
            className={`rms-tab-button${activeManagerTab === id ? " is-active" : ""}`}
            key={id}
            onClick={() => setActiveManagerTab(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rms-tab-panel-stack">
        {activeManagerTab === "shift" ? (
          <section className="rms-panel rms-tab-panel">
            <div className="rms-panel-title">
              <div>
                <span>Supervisor shift review</span>
                <h2>{selectedManagerShift?.shiftNo ?? "No shift selected"}</h2>
              </div>
              <StatusPill
                tone={selectedManagerShift?.status === "OPEN" ? "good" : "warn"}
              >
                {selectedManagerShift?.status ?? "CLOSED"}
              </StatusPill>
            </div>
            <div className="rms-form-grid">
              <select
                onChange={(event) =>
                  props.setManagerShiftId(event.target.value)
                }
                value={
                  props.managerShiftId || selectedManagerShift?.shiftId || ""
                }
              >
                <option value="">Select shift</option>
                {shiftOptions.map((shift) => (
                  <option key={shift.shiftId} value={shift.shiftId}>
                    {shift.shiftNo} · {shift.terminalCode} · {shift.cashierCode}{" "}
                    · {shift.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="rms-stat-grid">
              <Stat
                label="Net sales"
                value={formatMoney(selectedManagerShift?.netSalesAmount)}
              />
              <Stat
                label="Terminal"
                value={selectedManagerShift?.terminalCode ?? "None"}
              />
              <Stat
                label="Cash"
                value={formatMoney(selectedManagerShift?.cashTenderedAmount)}
              />
              <Stat
                label="Expected"
                value={formatMoney(selectedManagerShift?.expectedCashAmount)}
              />
              <Stat
                label="Transactions"
                value={formatNumber(selectedManagerShift?.transactionCount)}
              />
            </div>
            <div className="rms-form-grid">
              {canOpenShift ? (
                <>
                  <input
                    onChange={(event) =>
                      props.setShiftOpeningFloat(event.target.value)
                    }
                    type="number"
                    value={props.shiftOpeningFloat}
                  />
                  <button
                    className="rms-button is-primary"
                    disabled={props.isBusy || Boolean(props.activeShift)}
                    onClick={() => void props.openShift()}
                    type="button"
                  >
                    Open shift
                  </button>
                </>
              ) : null}
              <button
                className="rms-button"
                disabled={props.isBusy || !canPrintXReport}
                onClick={() => void props.printShiftReport("X")}
                type="button"
              >
                Print X report
              </button>
              {canCloseShift ? (
                <button
                  className="rms-button"
                  disabled={props.isBusy || !props.activeShift}
                  onClick={() => props.setShiftCloseDialogOpen(true)}
                  type="button"
                >
                  Close shift
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeManagerTab === "eod" ? (
          <section className="rms-panel rms-tab-panel">
            <div className="rms-panel-title">
              <div>
                <span>EOD</span>
                <h2>Reconciliation</h2>
              </div>
            </div>
            <div className="rms-form-grid">
              <input
                onChange={(event) =>
                  props.setEodDeclaredCash(event.target.value)
                }
                type="number"
                value={props.eodDeclaredCash}
              />
              <input
                onChange={(event) => props.setEodNote(event.target.value)}
                placeholder="Variance note"
                value={props.eodNote}
              />
              <button
                className="rms-button is-primary"
                disabled={props.isBusy}
                onClick={() => void props.recordEod()}
                type="button"
              >
                Record EOD
              </button>
            </div>
            <div className="rms-list">
              {props.snapshot?.recentEodReconciliations
                .slice(0, 6)
                .map((row) => (
                  <div className="rms-list-row" key={row.reconciliationId}>
                    <div>
                      <strong>{row.reconciliationNo}</strong>
                      <span>
                        {row.shiftNo} · {formatDate(row.reconciledAt)}
                      </span>
                    </div>
                    <div>
                      <strong>{formatMoney(row.varianceAmount)}</strong>
                      <span>Variance</span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        {activeManagerTab === "banking" ? (
          <section className="rms-panel rms-tab-panel">
            <div className="rms-panel-title">
              <div>
                <span>Banking</span>
                <h2>Deposit cash</h2>
              </div>
            </div>
            <div className="rms-form-grid">
              <select
                onChange={(event) =>
                  props.setBankingReconciliationId(event.target.value)
                }
                value={props.bankingReconciliationId}
              >
                <option value="">Select EOD</option>
                {props.snapshot?.recentEodReconciliations.map((row) => (
                  <option
                    key={row.reconciliationId}
                    value={row.reconciliationId}
                  >
                    {row.reconciliationNo} · {row.shiftNo}
                  </option>
                ))}
              </select>
              <input
                onChange={(event) => props.setBankingAmount(event.target.value)}
                type="number"
                value={props.bankingAmount}
              />
              {props.snapshot?.availableBankAccounts.length ? (
                <select
                  onChange={(event) =>
                    props.setBankingBankAccountId(event.target.value)
                  }
                  value={props.bankingBankAccountId}
                >
                  <option value="">Select bank account</option>
                  {props.snapshot.availableBankAccounts.map((account) => (
                    <option
                      key={account.bankAccountId}
                      value={account.bankAccountId}
                    >
                      {account.bankName} · {account.branchName} ·{" "}
                      {account.accountNumber}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  onChange={(event) =>
                    props.setBankingBankName(event.target.value)
                  }
                  placeholder="Bank name"
                  value={props.bankingBankName}
                />
              )}
              <input
                onChange={(event) =>
                  props.setBankingReference(event.target.value)
                }
                placeholder="Reference"
                value={props.bankingReference}
              />
              <button
                className="rms-button is-primary"
                disabled={
                  props.isBusy ||
                  (Boolean(props.snapshot?.availableBankAccounts.length) &&
                    !props.bankingBankAccountId)
                }
                onClick={() => void props.recordBanking()}
                type="button"
              >
                Bank deposit
              </button>
            </div>
          </section>
        ) : null}

        {activeManagerTab === "expenses" ? (
          <section className="rms-panel rms-tab-panel">
            <div className="rms-panel-title">
              <div>
                <span>Supervisor expense</span>
                <h2>Store expense capture</h2>
              </div>
              <StatusPill tone={expenseDraftId ? "warn" : undefined}>
                {expenseDraftId ? "Draft active" : "New"}
              </StatusPill>
            </div>
            <div className="rms-form-grid">
              <input
                onChange={(event) => setExpenseDate(event.target.value)}
                type="date"
                value={expenseDate}
              />
              <select
                onChange={(event) => setExpensePaymentMethod(event.target.value)}
                value={expensePaymentMethod}
              >
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="PETTY_CASH">Petty cash</option>
              </select>
              <input
                onChange={(event) => setExpenseReference(event.target.value)}
                placeholder="Reference"
                value={expenseReference}
              />
              <input
                min="0"
                onChange={(event) => setExpenseAmount(event.target.value)}
                placeholder="Amount"
                step="0.01"
                type="number"
                value={expenseAmount}
              />
            </div>
            <div className="rms-form-grid">
              <textarea
                onChange={(event) => setExpenseDescription(event.target.value)}
                placeholder="Expense details"
                rows={3}
                value={expenseDescription}
              />
              <label className="rms-button">
                {expenseAttachment ? "Change attachment" : "Attach receipt"}
                <input
                  accept="image/*,application/pdf"
                  hidden
                  onChange={selectExpenseAttachment}
                  type="file"
                />
              </label>
              {expenseAttachment ? (
                <button
                  className="rms-button"
                  disabled={props.isBusy}
                  onClick={() => setExpenseAttachment(null)}
                  type="button"
                >
                  Remove attachment
                </button>
              ) : null}
            </div>
            {pendingExpenseConfirmation ? (
              <div className="rms-confirm-popover">
                <strong>Confirm store expense</strong>
                <p>
                  Send {pendingExpenseConfirmation.expenseNo} to HQ Finance for GL review?
                </p>
                <div className="rms-manager-action-strip">
                  <button
                    className="rms-button is-primary"
                    disabled={props.isBusy}
                    onClick={() => void confirmPendingStoreExpense()}
                    type="button"
                  >
                    Confirm for HQ
                  </button>
                  <button
                    className="rms-button"
                    disabled={props.isBusy}
                    onClick={() => setPendingExpenseConfirmation(null)}
                    type="button"
                  >
                    Keep as draft
                  </button>
                </div>
              </div>
            ) : null}
            <div className="rms-manager-action-strip">
              <button
                className="rms-button"
                disabled={props.isBusy}
                onClick={() => void saveStoreExpense(false)}
                type="button"
              >
                Save draft
              </button>
              <button
                className="rms-button is-primary"
                disabled={props.isBusy}
                onClick={() => void saveStoreExpense(true)}
                type="button"
              >
                Save & confirm for HQ
              </button>
              <button
                className="rms-button"
                disabled={props.isBusy}
                onClick={resetExpenseDraft}
                type="button"
              >
                Clear
              </button>
              {expenseAttachment ? (
                <StatusPill>{expenseAttachment.fileName}</StatusPill>
              ) : null}
            </div>
            {expenseMessage ? (
              <p className="rms-muted-text">{expenseMessage}</p>
            ) : null}
          </section>
        ) : null}

        {activeManagerTab === "summary" ? (
          <section className="rms-panel rms-tab-panel">
            <div className="rms-panel-title">
              <div>
                <span>Store</span>
                <h2>Local summary</h2>
              </div>
            </div>
            <div className="rms-manager-action-strip">
              {props.snapshot?.companyLogoUrl ? (
                <img
                  alt="Receipt logo preview"
                  src={
                    resolveProductImageUrl(
                      props.snapshot.companyLogoUrl,
                      props.snapshot,
                    ) ?? ""
                  }
                  style={{
                    display: "block",
                    maxHeight: 52,
                    maxWidth: 130,
                    objectFit: "contain",
                  }}
                />
              ) : null}
              <label className="rms-button">
                Upload receipt logo
                <input
                  accept="image/*"
                  hidden
                  onChange={selectReceiptLogo}
                  type="file"
                />
              </label>
              {props.snapshot?.companyLogoUrl ? (
                <button
                  className="rms-button"
                  disabled={props.isBusy}
                  onClick={() => saveReceiptLogo(null)}
                  type="button"
                >
                  Clear local logo
                </button>
              ) : null}
              <StatusPill>
                {props.snapshot?.companyLogoUrl ? "Logo ready" : "No logo"}
              </StatusPill>
            </div>
            <div className="rms-stat-grid">
              <Stat
                label="Sales"
                value={formatNumber(
                  props.snapshot?.operationsMetrics.completedSales,
                )}
              />
              <Stat
                label="Orders"
                value={formatNumber(
                  props.snapshot?.operationsMetrics.openSalesOrders,
                )}
              />
              <Stat
                label="Closeouts"
                value={formatNumber(
                  props.snapshot?.operationsMetrics.recentCloseouts,
                )}
              />
              <Stat
                label="Banked"
                value={formatMoney(
                  props.snapshot?.operationsMetrics.bankedAmount,
                )}
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ReversalsWorkspace(props: {
  snapshot: StoreSyncSnapshot | null;
  receiptQuery: string;
  receiptWindowDays: string;
  receiptResults: StoreReceiptSearchResult[];
  isBusy: boolean;
  setReceiptQuery: (value: string) => void;
  setReceiptWindowDays: (value: string) => void;
  searchReceipts: (options?: {
    receiptKind?: StoreReceiptHistoryKind;
    transactionFilter?: "ALL" | "CORRECTABLE" | "SALE" | "RETURN" | "EXCHANGE";
  }) => Promise<void>;
  startReturnFromReceipt: (transactionNo: string) => Promise<void>;
  startExchangeFromReceipt: (transactionNo: string) => Promise<void>;
  runAction: (
    action: (
      desktopRuntime: DesktopRuntimeApi,
    ) => Promise<StoreSyncActionResult>,
  ) => Promise<StoreSyncActionResult | null>;
}) {
  const capabilities =
    props.snapshot?.activeOperatorSession?.capabilities ?? null;
  const canSearchReceipt = capabilities?.canSearchReceipt === true;
  const canProcessReturn = capabilities?.canProcessReturn === true;
  const canProcessExchange = capabilities?.canProcessExchange === true;
  const canUseCorrectionLane = Boolean(props.snapshot?.activeShift);
  const salesReceiptResults = props.receiptResults.filter(
    (receipt) => receipt.receiptKind === "SALES",
  );

  return (
    <div className="rms-workspace rms-reversal-grid">
      <section className="rms-panel">
        <div className="rms-panel-title">
          <div>
            <span>Receipt</span>
            <h2>Correction search</h2>
          </div>
          <button
            className="rms-button"
            disabled={props.isBusy || !canSearchReceipt}
            onClick={() =>
              void props.searchReceipts({
                receiptKind: "SALES",
                transactionFilter: "CORRECTABLE",
              })
            }
            type="button"
          >
            Search
          </button>
        </div>
        <div className="rms-filter-row">
          <input
            onChange={(event) => props.setReceiptQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void props.searchReceipts({
                  receiptKind: "SALES",
                  transactionFilter: "CORRECTABLE",
                });
              }
            }}
            placeholder="Receipt no, customer, cashier, item"
            value={props.receiptQuery}
          />
          <select
            onChange={(event) => props.setReceiptWindowDays(event.target.value)}
            value={props.receiptWindowDays}
          >
            <option value="1">Today</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </div>
        <div className="rms-list">
          {salesReceiptResults.length ? (
            salesReceiptResults.map((receipt) => (
              <div className="rms-list-row" key={receipt.transactionId}>
                <div>
                  <strong>{receipt.transactionNo}</strong>
                  <span>
                    {receipt.customerName ?? "Walk-in"} ·{" "}
                    {formatMoney(receipt.totalAmount)}
                  </span>
                </div>
                {canProcessReturn ? (
                  <button
                    className="rms-button"
                    disabled={
                      props.isBusy ||
                      !canUseCorrectionLane ||
                      !receipt.canStartReturn
                    }
                    onClick={() =>
                      void props.startReturnFromReceipt(receipt.transactionNo)
                    }
                    type="button"
                  >
                    Return
                  </button>
                ) : null}
                {canProcessExchange ? (
                  <button
                    className="rms-button"
                    disabled={
                      props.isBusy ||
                      !canUseCorrectionLane ||
                      !receipt.canStartExchange
                    }
                    onClick={() =>
                      void props.startExchangeFromReceipt(receipt.transactionNo)
                    }
                    type="button"
                  >
                    Exchange
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState
              title="No receipts loaded"
              detail="Search recent completed sales."
            />
          )}
        </div>
      </section>

      <section className="rms-panel">
        <div className="rms-panel-title">
          <div>
            <span>Recent</span>
            <h2>Transactions</h2>
          </div>
        </div>
        <div className="rms-list">
          {props.snapshot?.recentTransactions
            .slice(0, 10)
            .map((transaction) => (
              <div className="rms-list-row" key={transaction.transactionNo}>
                <div>
                  <strong>{transaction.transactionNo}</strong>
                  <span>
                    {transaction.transactionType} ·{" "}
                    {transaction.customerName ?? "Walk-in"}
                  </span>
                </div>
                <strong>{formatMoney(transaction.totalAmount)}</strong>
                <StatusPill>{transaction.status}</StatusPill>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function escapeCsvValue(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadReportFile(
  fileName: string,
  mimeType: string,
  content: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function reportRowsForExport(report: StoreReportResult, kind: ReportKind) {
  switch (kind) {
    case "sales":
      return report.salesRows.map((row) => ({
        "Transaction No": row.transactionNo,
        Date: formatDate(row.completedAt),
        Cashier: row.cashierCode ?? "",
        Customer: row.customerName ?? "Walk-in",
        Type: row.transactionType,
        Lines: row.lineCount,
        Products: row.productPreview,
        Subtotal: row.subtotalAmount,
        Discount: row.discountAmount,
        Tax: row.taxAmount,
        Total: row.totalAmount,
        Paid: row.paidAmount,
      }));
    case "tenders":
      return report.tenderRows.map((row) => ({
        Source: row.source,
        "Payment Method": row.paymentMethod,
        "Tender Code": row.tenderMethodCode ?? "",
        Tender: row.tenderMethodName ?? row.paymentMethod,
        "Payment Lines": row.transactionCount,
        Amount: row.netAmount,
      }));
    case "products":
      return report.productRows.map((row) => ({
        "Product Code": row.productCode,
        Product: row.productName,
        Quantity: row.quantity,
        Gross: row.grossAmount,
        Discount: row.discountAmount,
        Tax: row.taxAmount,
        Net: row.netAmount,
      }));
    case "orders":
      return report.salesOrderRows.map((row) => ({
        "Order No": row.orderNo,
        Status: row.status,
        Created: formatDate(row.createdAt),
        Customer: row.customerName ?? "Customer",
        "Customer No": row.customerNo ?? "",
        Items: row.itemCount,
        Lines: row.lineCount,
        Total: row.totalAmount,
        Deposit: row.depositAmount,
        Balance: row.balanceAmount,
        "Deposit Tender": row.depositTenderMethodName ?? row.depositPaymentMethod ?? "",
        Reference: row.depositReference ?? "",
        Fulfilled: row.fulfilledAt ? formatDate(row.fulfilledAt) : "",
        "Fulfilled Receipt": row.fulfilledTransactionNo ?? "",
      }));
    case "inventory":
      return report.inventoryRows.map((row) => ({
        Location: row.locationName,
        "Location Code": row.locationCode,
        "Product Code": row.productCode,
        Product: row.productName,
        "On Hand": row.quantityOnHand,
        "Unit Price": row.unitPrice,
        "Stock Value": row.stockValue,
        Updated: formatDate(row.updatedAt),
      }));
    case "shifts":
      return report.shiftRows.map((row) => ({
        Shift: row.shiftNo,
        Terminal: row.terminalCode,
        Cashier: row.cashierCode,
        Status: row.status,
        Opened: formatDate(row.openedAt),
        Closed: row.closedAt ? formatDate(row.closedAt) : "",
        Float: row.openingFloatAmount,
        Transactions: row.transactionCount,
        Sales: row.salesCount,
        Returns: row.returnCount,
        Exchanges: row.exchangeCount,
        "Net Sales": row.netSalesAmount,
        "Account Payments": row.accountPaymentsAmount,
        "Expected Cash": row.expectedCashAmount,
        Variance: row.varianceAmount ?? "",
      }));
    case "account-payments":
      return report.accountPaymentRows.map((row) => ({
        "Entry No": row.entryNo,
        Date: formatDate(row.occurredAt),
        Cashier: row.cashierCode ?? "",
        "Customer No": row.customerNo,
        Customer: row.customerName,
        Method: row.tenderMethodName ?? row.paymentMethod,
        Amount: row.amount,
        Reference: row.reference ?? "",
      }));
    case "banking":
      return report.bankingRows.map((row) => ({
        "Deposit No": row.depositNo,
        Reconciliation: row.reconciliationNo,
        Shift: row.shiftNo,
        Date: formatDate(row.depositedAt),
        Operator: row.operatorName ?? "",
        Bank: row.bankName ?? "",
        Branch: row.branchName ?? "",
        "Account No": row.accountNumber ?? "",
        Amount: row.amount,
        Reference: row.reference ?? "",
      }));
    default:
      return [];
  }
}

function exportReport(
  report: StoreReportResult | null,
  kind: ReportKind,
  label: string,
  format: "csv" | "excel" | "pdf",
) {
  if (!report) {
    return;
  }

  const rows = reportRowsForExport(report, kind);
  const columns = Object.keys(
    rows[0] ?? { Report: label, Generated: formatDate(report.generatedAt) },
  );
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "report";

  if (format === "csv") {
    const csv = [
      columns.map(escapeCsvValue).join(","),
      ...rows.map((row) => {
        const record = row as Record<
          string,
          string | number | null | undefined
        >;

        return columns
          .map((column) => escapeCsvValue(record[column]))
          .join(",");
      }),
    ].join("\n");
    downloadReportFile(`flash-erp-${slug}.csv`, "text/csv;charset=utf-8", csv);
    return;
  }

  const tableRows = rows
    .map((row) => {
      const record = row as Record<string, string | number | null | undefined>;

      return `<tr>${columns.map((column) => `<td>${String(record[column] ?? "")}</td>`).join("")}</tr>`;
    })
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f2f2f2}</style></head><body><h1>${label}</h1><p>Generated ${formatDate(report.generatedAt)}</p><table><thead><tr>${columns
    .map((column) => `<th>${column}</th>`)
    .join("")}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;

  if (format === "excel") {
    downloadReportFile(
      `flash-erp-${slug}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
      html,
    );
    return;
  }

  const printWindow = window.open("", "_blank", "width=1100,height=800");

  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
}

function ReportDataTable({
  rows,
  emptyLabel,
}: {
  rows: Array<Record<string, string | number | null | undefined>>;
  emptyLabel: string;
}) {
  const columns = Object.keys(rows[0] ?? {});

  if (!rows.length || !columns.length) {
    return (
      <EmptyState
        title={emptyLabel}
        detail="Run the report or adjust the filters."
      />
    );
  }

  return (
    <div className="rms-report-table-wrap">
      <table className="rms-report-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${index}-${columns.map((column) => row[column]).join("-")}`}
            >
              {columns.map((column) => (
                <td key={column}>{row[column] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportWorkspaceView(props: {
  snapshot: StoreSyncSnapshot | null;
  report: StoreReportResult | null;
  reportWorkspace: (typeof reportWorkspaceItems)[number];
  isBusy: boolean;
  canFilterCashier: boolean;
  reportDateFrom: string;
  reportDateTo: string;
  reportCashierCode: string;
  reportCustomerQuery: string;
  reportProductQuery: string;
  setReportDateFrom: (value: string) => void;
  setReportDateTo: (value: string) => void;
  setReportCashierCode: (value: string) => void;
  setReportCustomerQuery: (value: string) => void;
  setReportProductQuery: (value: string) => void;
  loadStoreReport: (scope: "CASHIER" | "STORE") => Promise<void>;
  onBack: () => void;
}) {
  return (
    <div className="rms-workspace rms-report-page">
      <section className="rms-panel">
        <div className="rms-panel-title">
          <div>
            <span>Reports</span>
            <h2>{props.reportWorkspace.label}</h2>
          </div>
          <div className="rms-title-actions">
            <StatusPill>
              {props.reportWorkspace.scope === "STORE" ? "Store" : "Cashier"}
            </StatusPill>
            <button className="rms-button" onClick={props.onBack} type="button">
              Back
            </button>
          </div>
        </div>
        <ReportsView
          activeReport={props.reportWorkspace.reportKind}
          canFilterCashier={props.canFilterCashier}
          isBusy={props.isBusy}
          loadStoreReport={props.loadStoreReport}
          report={props.report}
          reportCashierCode={props.reportCashierCode}
          reportCustomerQuery={props.reportCustomerQuery}
          reportDateFrom={props.reportDateFrom}
          reportDateTo={props.reportDateTo}
          reportProductQuery={props.reportProductQuery}
          reportTitle={props.reportWorkspace.label}
          scope={props.reportWorkspace.scope}
          setReportCashierCode={props.setReportCashierCode}
          setReportCustomerQuery={props.setReportCustomerQuery}
          setReportDateFrom={props.setReportDateFrom}
          setReportDateTo={props.setReportDateTo}
          setReportProductQuery={props.setReportProductQuery}
          snapshot={props.snapshot}
        />
      </section>
    </div>
  );
}

function SyncWorkspace(props: {
  snapshot: StoreSyncSnapshot | null;
  runtimeStatus: StoreRuntimeStatus | null;
  desktopWindowStatus: StoreDesktopWindowStatus | null;
  desktopUpdateStatus: StoreDesktopUpdateStatus | null;
  isBusy: boolean;
  isSyncRunning: boolean;
  checkDesktopUpdate: () => Promise<void>;
  installDesktopUpdate: () => Promise<void>;
  recoverDesktopWindow: () => Promise<void>;
  refreshDesktopWindowStatus: () => Promise<StoreDesktopWindowStatus | null>;
  refreshRuntimeStatus: () => Promise<void>;
  runAction: (
    action: (
      desktopRuntime: DesktopRuntimeApi,
    ) => Promise<StoreSyncActionResult>,
  ) => Promise<StoreSyncActionResult | null>;
  runSyncCycle: (
    input: StoreSyncRunOptions,
    label: string,
    timeoutMs?: number,
  ) => Promise<StoreSyncActionResult | null>;
}) {
  const connectedTerminals = props.snapshot?.connectedTerminals ?? [];
  const serverHealth = props.runtimeStatus?.serverHealth ?? null;
  const [activeSyncTab, setActiveSyncTab] = useState<
    "runtime" | "queues" | "activity" | "recovery"
  >("runtime");
  const [activeRuntimeTab, setActiveRuntimeTab] = useState<
    "status" | "database" | "terminals"
  >("status");
  const [syncCountdownNow, setSyncCountdownNow] = useState(() => Date.now());
  const nextAutoSyncAt = useMemo(
    () => resolveNextAutoSyncAt(props.snapshot),
    [props.snapshot],
  );
  const nextAutoSyncCountdown = props.snapshot?.syncPolicy.autoSyncEnabled
    ? formatAutoSyncCountdown(nextAutoSyncAt, syncCountdownNow)
    : "Paused";
  const nextAutoSyncDateTime = props.snapshot?.syncPolicy.autoSyncEnabled
    ? formatScheduleDateTime(nextAutoSyncAt)
    : "Automatic sync is paused";
  const nextAutoSyncMetricClassName = [
    "rms-next-sync-card",
    !props.snapshot?.syncPolicy.autoSyncEnabled
      ? "is-paused"
      : nextAutoSyncAt && nextAutoSyncAt.getTime() <= syncCountdownNow
        ? "is-due"
        : "",
  ]
    .filter(Boolean)
    .join(" ");
  const syncTabs: Array<{ id: typeof activeSyncTab; label: string }> = [
    { id: "runtime", label: "Runtime" },
    { id: "queues", label: "Queues" },
    { id: "activity", label: "Activity" },
    { id: "recovery", label: "Recovery" },
  ];

  useEffect(() => {
    const handle = window.setInterval(
      () => setSyncCountdownNow(Date.now()),
      1000,
    );

    return () => window.clearInterval(handle);
  }, []);

  function renderSyncTabs() {
    return (
      <div
        className="rms-workspace-tabs"
        role="tablist"
        aria-label="Sync workspace"
      >
        {syncTabs.map((tab) => (
          <button
            aria-selected={activeSyncTab === tab.id}
            className={`rms-tab-button${activeSyncTab === tab.id ? " is-active" : ""}`}
            key={tab.id}
            onClick={() => setActiveSyncTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  function renderRuntimeTab() {
    const runtimeDeploymentMode =
      props.runtimeStatus?.deploymentMode ?? props.snapshot?.deploymentMode;
    const runtimeSyncBaseUrl =
      props.runtimeStatus?.syncBaseUrl ??
      props.snapshot?.enterpriseBaseUrl ??
      null;
    const runtimeIsStandalone = runtimeDeploymentMode === "STANDALONE";

    return (
      <div className="rms-runtime-tabs">
        <div
          className="rms-workspace-tabs"
          role="tablist"
          aria-label="Runtime detail"
        >
          {(
            [
              ["status", "Runtime Status"],
              ["database", "Database"],
              ["terminals", "Terminals"],
            ] as const
          ).map(([id, label]) => (
            <button
              aria-selected={activeRuntimeTab === id}
              className={`rms-tab-button${activeRuntimeTab === id ? " is-active" : ""}`}
              key={id}
              onClick={() => setActiveRuntimeTab(id)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {activeRuntimeTab === "status" ? (
          <section className="rms-panel rms-runtime-panel">
            <div className="rms-panel-title">
              <div>
                <span>Store node</span>
                <h2>Runtime status</h2>
              </div>
              <button
                className="rms-button"
                disabled={props.isBusy}
                onClick={() => void props.refreshRuntimeStatus()}
                type="button"
              >
                Check
              </button>
            </div>
            <div className="rms-dashboard-mini-grid">
              <Stat
                label="Deployment"
                tone={
                  runtimeIsStandalone
                    ? "neutral"
                    : runtimeSyncBaseUrl
                      ? "good"
                      : "bad"
                }
                value={formatDeploymentMode(runtimeDeploymentMode)}
              />
              <Stat
                label="Mode"
                value={formatRuntimeRole(props.runtimeStatus?.role)}
              />
              <Stat
                label="Database"
                value={formatDatabaseProvider(
                  props.runtimeStatus?.databaseProvider,
                )}
              />
              <Stat
                label="Terminal"
                value={
                  props.runtimeStatus?.terminalCode ??
                  props.snapshot?.terminalCode ??
                  "Not set"
                }
              />
              <Stat
                label="Connection"
                tone={props.runtimeStatus?.connected === false ? "bad" : "good"}
                value={
                  props.runtimeStatus?.connected === false ? "Offline" : "Ready"
                }
              />
              <Stat
                label="HQ sync"
                tone={
                  runtimeIsStandalone
                    ? "neutral"
                    : runtimeSyncBaseUrl
                      ? "good"
                      : "bad"
                }
                value={
                  runtimeIsStandalone
                    ? "Off"
                    : runtimeSyncBaseUrl
                      ? "Configured"
                      : "Missing"
                }
              />
            </div>
            <div className="rms-dashboard-mini-grid">
              <Stat
                label="DB size"
                value={formatBytes(serverHealth?.databaseSizeBytes)}
              />
              <Stat
                label="Uptime"
                value={formatDurationSeconds(serverHealth?.uptimeSeconds)}
              />
              <Stat
                label="LAN token"
                tone={serverHealth?.tokenRequired ? "good" : "warn"}
                value={serverHealth?.tokenRequired ? "Required" : "Not set"}
              />
              <Stat
                label="Timeout"
                value={`${formatNumber(props.runtimeStatus?.requestTimeoutMs ?? 0)} ms`}
              />
            </div>
            <div className="rms-list">
              <div className="rms-list-row">
                <div>
                  <strong>
                    {props.runtimeStatus?.message ??
                      "Runtime status has not been checked yet."}
                  </strong>
                  <span>
                    {props.runtimeStatus?.storeServerUrl ??
                      props.runtimeStatus?.localServerUrl ??
                      props.snapshot?.databasePath ??
                      "Local desktop service"}
                  </span>
                  <small>
                    {props.runtimeStatus?.serverHealth?.storeName ??
                      props.snapshot?.storeName ??
                      "Store"}
                    {" · "}
                    {props.runtimeStatus?.serverHealth?.nodeCode ??
                      props.snapshot?.nodeCode ??
                      "Node"}
                  </small>
                </div>
                <StatusPill
                  tone={
                    props.runtimeStatus?.connected === false ? "bad" : "good"
                  }
                >
                  {props.runtimeStatus?.serverHealth?.status ?? "unknown"}
                </StatusPill>
              </div>
            </div>
            <div className="rms-panel-title">
              <div>
                <span>Window health</span>
                <h2>Renderer watchdog</h2>
              </div>
              <div className="rms-title-actions">
                <button
                  className="rms-button"
                  disabled={props.isBusy}
                  onClick={() => void props.refreshDesktopWindowStatus()}
                  type="button"
                >
                  Refresh
                </button>
                <button
                  className="rms-button is-warning"
                  disabled={props.isBusy}
                  onClick={() => void props.recoverDesktopWindow()}
                  type="button"
                >
                  Recover
                </button>
              </div>
            </div>
            <div className="rms-dashboard-mini-grid">
              <Stat
                label="Renderer"
                tone={
                  props.desktopWindowStatus?.watchdogState === "healthy"
                    ? "good"
                    : "warn"
                }
                value={describeWindowWatchdog(props.desktopWindowStatus)}
              />
              <Stat
                label="Heartbeat"
                value={formatDurationMs(
                  props.desktopWindowStatus?.heartbeatAgeMs,
                )}
              />
              <Stat
                label="Recoveries"
                tone={
                  props.desktopWindowStatus?.recoveryCount ? "warn" : "neutral"
                }
                value={formatNumber(
                  props.desktopWindowStatus?.recoveryCount ?? 0,
                )}
              />
              <Stat
                label="Window"
                value={
                  props.desktopWindowStatus?.maximized
                    ? "Maximized"
                    : props.desktopWindowStatus?.visible
                      ? "Visible"
                      : "Hidden"
                }
              />
            </div>
            <div className="rms-list">
              <div className="rms-list-row">
                <div>
                  <strong>
                    {formatWindowBounds(
                      props.desktopWindowStatus?.bounds ?? null,
                    )}
                  </strong>
                  <span>
                    {props.desktopWindowStatus?.lastRecoveryReason
                      ? `Last recovery: ${props.desktopWindowStatus.lastRecoveryReason}`
                      : props.desktopWindowStatus?.lastReadyTimeoutAt
                        ? `Last ready timeout: ${formatRelative(props.desktopWindowStatus.lastReadyTimeoutAt)}`
                        : "Window state is persisted under the desktop user profile."}
                  </span>
                  <small>
                    {props.desktopWindowStatus?.lastLoadFailure ??
                      `Ready timeouts: ${formatNumber(props.desktopWindowStatus?.readyTimeoutCount ?? 0)} · stale heartbeats: ${formatNumber(props.desktopWindowStatus?.staleHeartbeatCount ?? 0)} · support log: ${
                        props.desktopWindowStatus?.supportLogPath ??
                        "Unavailable"
                      }`}
                  </small>
                </div>
                <StatusPill
                  tone={
                    props.desktopWindowStatus?.loadFailureCount
                      ? "warn"
                      : "good"
                  }
                >
                  {`${formatNumber(props.desktopWindowStatus?.loadFailureCount ?? 0)} load issue(s)`}
                </StatusPill>
              </div>
            </div>
            <div className="rms-panel-title">
              <div>
                <span>Desktop updates</span>
                <h2>Production package feed</h2>
              </div>
              <button
                className="rms-button"
                disabled={
                  props.isBusy ||
                  props.desktopUpdateStatus?.status === "checking"
                }
                onClick={() => void props.checkDesktopUpdate()}
                type="button"
              >
                Check updates
              </button>
            </div>
            <div className="rms-dashboard-mini-grid">
              <Stat
                label="Installed"
                value={props.desktopUpdateStatus?.currentVersion ?? "Unknown"}
              />
              <Stat
                label="Available"
                value={props.desktopUpdateStatus?.availableVersion ?? "None"}
              />
              <Stat
                label="State"
                tone={
                  props.desktopUpdateStatus?.status === "error"
                    ? "bad"
                    : props.desktopUpdateStatus?.status === "downloaded"
                      ? "good"
                      : "neutral"
                }
                value={formatDesktopUpdateStatus(
                  props.desktopUpdateStatus?.status,
                )}
              />
              <Stat
                label="Progress"
                value={
                  props.desktopUpdateStatus?.downloadPercent == null
                    ? "Idle"
                    : `${Math.round(props.desktopUpdateStatus.downloadPercent)}%`
                }
              />
            </div>
            <div className="rms-list">
              <div className="rms-list-row">
                <div>
                  <strong>
                    {props.desktopUpdateStatus?.message ??
                      "Desktop update status has not been checked yet."}
                  </strong>
                  <span>
                    {props.desktopUpdateStatus?.feedUrl ??
                      "Not configured in store-runtime-config.json"}
                  </span>
                  <small>
                    {props.desktopUpdateStatus?.checkedAt
                      ? `Checked ${formatRelative(props.desktopUpdateStatus.checkedAt)}`
                      : "Checks run at startup, periodically, and from this button."}
                  </small>
                </div>
                {props.desktopUpdateStatus?.status === "downloaded" ? (
                  <button
                    className="rms-button is-primary"
                    disabled={props.isBusy}
                    onClick={() => void props.installDesktopUpdate()}
                    type="button"
                  >
                    Install
                  </button>
                ) : (
                  <StatusPill
                    tone={
                      props.desktopUpdateStatus?.status === "error"
                        ? "bad"
                        : "neutral"
                    }
                  >
                    {formatDesktopUpdateStatus(
                      props.desktopUpdateStatus?.status,
                    )}
                  </StatusPill>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeRuntimeTab === "database" ? (
          <section className="rms-panel rms-runtime-panel">
            <div className="rms-panel-title">
              <div>
                <span>Store diagnostics</span>
                <h2>Shared database posture</h2>
              </div>
              <StatusPill tone={serverHealth?.deadLetter ? "bad" : "good"}>
                {serverHealth?.deadLetter ? "Review" : "Clear"}
              </StatusPill>
            </div>
            <div className="rms-dashboard-mini-grid">
              <Stat
                label="Open shifts"
                value={formatNumber(
                  serverHealth?.openShifts ??
                    props.snapshot?.operationsMetrics.openShifts ??
                    0,
                )}
              />
              <Stat
                label="Online tills"
                value={formatNumber(
                  serverHealth?.connectedTerminals ??
                    props.snapshot?.operationsMetrics.connectedTerminals ??
                    0,
                )}
              />
              <Stat
                label="Upstream"
                value={formatNumber(
                  serverHealth?.upstreamQueued ??
                    props.snapshot?.queueMetrics.upstreamQueued ??
                    0,
                )}
              />
              <Stat
                label="Downstream"
                value={formatNumber(
                  serverHealth?.downstreamQueued ??
                    props.snapshot?.queueMetrics.downstreamQueued ??
                    0,
                )}
              />
            </div>
            <div className="rms-list">
              <div className="rms-list-row">
                <div>
                  <strong>
                    {serverHealth?.databasePath ??
                      props.snapshot?.databasePath ??
                      "Store database path unavailable"}
                  </strong>
                  <span>
                    Started {formatDate(serverHealth?.serviceStartedAt)} ·
                    checked{" "}
                    {formatRelative(
                      serverHealth?.generatedAt ??
                        props.runtimeStatus?.checkedAt,
                    )}
                  </span>
                  <small>
                    Back up this database from the store-server machine with the
                    `db:backup` script.
                  </small>
                </div>
                <StatusPill
                  tone={serverHealth?.tokenRequired ? "good" : "warn"}
                >
                  {serverHealth?.tokenRequired ? "Protected" : "Token needed"}
                </StatusPill>
              </div>
            </div>
          </section>
        ) : null}

        {activeRuntimeTab === "terminals" ? (
          <section className="rms-panel rms-runtime-panel">
            <div className="rms-panel-title">
              <div>
                <span>LAN terminals</span>
                <h2>Connected tills</h2>
              </div>
              <StatusPill
                tone={
                  props.snapshot?.operationsMetrics.connectedTerminals
                    ? "good"
                    : "neutral"
                }
              >
                {`${formatNumber(props.snapshot?.operationsMetrics.connectedTerminals ?? 0)} online`}
              </StatusPill>
            </div>
            {connectedTerminals.length ? (
              <div className="rms-list">
                {connectedTerminals.map((terminal) => (
                  <div className="rms-list-row" key={terminal.terminalCode}>
                    <div>
                      <strong>{terminal.terminalCode}</strong>
                      <span>{terminal.clientName ?? "Flash ERP terminal"}</span>
                      <small>
                        {terminal.lastMethod ?? "heartbeat"} ·{" "}
                        {formatNumber(terminal.requestCount)} request(s) ·{" "}
                        {formatRelative(terminal.lastSeenAt)}
                      </small>
                    </div>
                    <StatusPill tone={terminal.online ? "good" : "neutral"}>
                      {terminal.online ? "Online" : "Recently seen"}
                    </StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No terminal heartbeat yet"
                detail="LAN terminals will appear after they connect to this store node."
              />
            )}
          </section>
        ) : null}
      </div>
    );
  }

  function renderQueuesTab() {
    return (
      <section className="rms-panel rms-tab-panel">
        <div className="rms-panel-title">
          <div>
            <span>Queues</span>
            <h2>Sync status</h2>
          </div>
          <button
            className="rms-button is-primary"
            disabled={props.isBusy || props.isSyncRunning}
            onClick={() =>
              void props.runSyncCycle(
                {
                  trigger: "manual",
                  drainDownstream: true,
                  snapshotMode: "status",
                },
                "Manual sync",
              )
            }
            type="button"
          >
            {props.isSyncRunning ? "Syncing..." : "Run sync"}
          </button>
        </div>
        <div className="rms-sync-metric-grid">
          <Stat
            label="Upstream"
            value={formatNumber(props.snapshot?.queueMetrics.upstreamQueued)}
          />
          <Stat
            label="In flight"
            value={formatNumber(props.snapshot?.queueMetrics.upstreamInFlight)}
          />
          <Stat
            label="Downstream"
            value={formatNumber(props.snapshot?.queueMetrics.downstreamQueued)}
          />
          <Stat
            label="Dead letters"
            tone={props.snapshot?.queueMetrics.deadLetter ? "bad" : "good"}
            value={formatNumber(props.snapshot?.queueMetrics.deadLetter)}
          />
          <div className={nextAutoSyncMetricClassName}>
            <span>Next auto sync</span>
            <strong>{nextAutoSyncCountdown}</strong>
            <small>{nextAutoSyncDateTime}</small>
          </div>
        </div>
        <div className="rms-sync-actions">
          <button
            className="rms-button"
            disabled={props.isBusy}
            onClick={() =>
              void props.runAction((desktopRuntime) =>
                desktopRuntime.requeueDeadLetters(),
              )
            }
            type="button"
          >
            Requeue failed
          </button>
        </div>
        {props.snapshot?.syncDeadLetters.length ? (
          <div className="rms-list rms-dead-letter-list">
            {props.snapshot.syncDeadLetters.map((letter) => (
              <div
                className="rms-list-row"
                key={`${letter.direction}-${letter.id}`}
              >
                <div>
                  <strong>{letter.eventType}</strong>
                  <span>
                    {letter.direction} · {letter.aggregateType} ·{" "}
                    {letter.aggregateId}
                  </span>
                  <small>{letter.diagnosticSummary}</small>
                  <small>
                    {letter.errorMessage ??
                      "No rejection message captured for this sync item."}
                  </small>
                  <details className="rms-sync-payload-detail">
                    <summary>Payload preview</summary>
                    <pre>{letter.payloadPreview}</pre>
                  </details>
                </div>
                <StatusPill
                  tone={letter.status === "DEAD_LETTER" ? "bad" : "warn"}
                >
                  {letter.status}
                </StatusPill>
                <small>{letter.attemptCount} tries</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No failed sync rows"
            detail="Dead-letter details will appear here when a sync item fails."
          />
        )}
      </section>
    );
  }

  function renderActivityTab() {
    return (
      <div className="rms-tab-grid is-wide">
        <section className="rms-panel rms-sync-activity-panel">
          <div className="rms-panel-title">
            <div>
              <span>Runs</span>
              <h2>Recent activity</h2>
            </div>
          </div>
          <div className="rms-list">
            {props.snapshot?.recentRuns.length ? (
              props.snapshot.recentRuns.map((run) => (
                <div className="rms-list-row" key={run.id}>
                  <div>
                    <strong>{run.runKind}</strong>
                    <span>{run.summary}</span>
                  </div>
                  <StatusPill tone={run.result === "SUCCESS" ? "good" : "warn"}>
                    {run.result}
                  </StatusPill>
                </div>
              ))
            ) : (
              <EmptyState title="No sync runs yet" />
            )}
          </div>
        </section>

        <section className="rms-panel rms-sync-details-panel">
          <div className="rms-panel-title">
            <div>
              <span>Records</span>
              <h2>Synced data details</h2>
            </div>
          </div>
          {props.snapshot?.recentSyncEvents.length ? (
            <div className="rms-list rms-sync-event-list">
              {props.snapshot.recentSyncEvents.map((event) => (
                <div
                  className="rms-list-row rms-sync-event-row"
                  key={`${event.direction}-${event.id}`}
                >
                  <div>
                    <strong>{event.summary}</strong>
                    <span>
                      {event.direction} · {event.aggregateType} ·{" "}
                      {event.eventType}
                    </span>
                    <small>
                      {event.nodeCode ?? "local"} ·{" "}
                      {formatRelative(event.updatedAt)}
                      {event.errorMessage ? ` · ${event.errorMessage}` : ""}
                    </small>
                    <details className="rms-sync-payload-detail">
                      <summary>Payload preview</summary>
                      <pre>{event.payloadPreview}</pre>
                    </details>
                  </div>
                  <StatusPill
                    tone={
                      event.status === "APPLIED" ||
                      event.status === "ACKNOWLEDGED"
                        ? "good"
                        : event.status === "FAILED" ||
                            event.status === "DEAD_LETTER"
                          ? "bad"
                          : "warn"
                    }
                  >
                    {event.status}
                  </StatusPill>
                  <small>
                    {event.attemptCount
                      ? `${event.attemptCount} tries`
                      : formatDate(event.createdAt)}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No sync records yet"
              detail="Published products, promotions, customers, and other packets will appear here as individual rows."
            />
          )}
        </section>
      </div>
    );
  }

  function renderRecoveryTab() {
    return (
      <section className="rms-panel rms-tab-panel">
        <div className="rms-panel-title">
          <div>
            <span>Recovery</span>
            <h2>Operator tasks</h2>
          </div>
        </div>
        <div className="rms-list">
          {props.snapshot?.recoveryTasks.length ? (
            props.snapshot.recoveryTasks.map((task) => (
              <div className="rms-list-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>
                    {task.productName ?? task.transactionNo ?? task.taskType}
                  </span>
                </div>
                <button
                  className="rms-button"
                  disabled={props.isBusy || task.status === "COMPLETED"}
                  onClick={() =>
                    void props.runAction((desktopRuntime) =>
                      desktopRuntime.completeRecoveryTask(task.id),
                    )
                  }
                  type="button"
                >
                  Complete
                </button>
              </div>
            ))
          ) : (
            <EmptyState title="No recovery tasks" />
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="rms-workspace rms-tabbed-workspace">
      {renderSyncTabs()}
      <div className="rms-tab-panel-stack">
        {activeSyncTab === "runtime" ? renderRuntimeTab() : null}
        {activeSyncTab === "queues" ? renderQueuesTab() : null}
        {activeSyncTab === "activity" ? renderActivityTab() : null}
        {activeSyncTab === "recovery" ? renderRecoveryTab() : null}
      </div>
    </div>
  );
}
