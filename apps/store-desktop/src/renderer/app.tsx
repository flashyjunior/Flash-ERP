import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import type {
  DesktopRuntimeApi,
  DesktopRuntimeContext,
  StoreCatalogBrowseItem,
  StoreCatalogLookupResult,
  StoreBasketCheckoutPayment,
  StoreCustomerSummary,
  StoreInterStoreTransferRequestDraftSummary,
  StoreLocalGoodsReceiptExceptionSummary,
  StoreLocalSupplierReturnSummary,
  StoreLocalSupplierReturnReason,
  StoreInterStoreTransferStatus,
  StoreInterStoreTransferSummary,
  StoreInventoryBrowseItem,
  StoreReceiptSearchTransactionFilter,
  StoreReceiptSearchResult,
  StoreReceiptPrinterDevice,
  StoreReceiptLookupResult,
  StorePurchaseOrderStatus,
  StorePurchaseOrderSummary,
  StoreSerialRegistryBrowseItem,
  StoreSerialRegistryStatus,
  StoreStockCountSessionSummary,
  StoreTransferRequestTargetSummary,
  StoreSyncActionResult,
  StoreSyncSnapshot,
  StoreUserSummary
} from "@shared/desktop-runtime";

type QueueMetricKey = keyof StoreSyncSnapshot["queueMetrics"];
type OperationsMetricKey = keyof StoreSyncSnapshot["operationsMetrics"];

const navigationItems = ["Overview", "Sell", "Returns", "Inventory", "Sync"] as const;
type NavigationView = (typeof navigationItems)[number];
type TouchKeyboardTarget =
  | "scanQuery"
  | "scanQuantity"
  | "shiftOpeningFloat"
  | "shiftDeclaredCash"
  | "eodDeclaredCash"
  | "bankingDepositAmount"
  | "stockCountQuantity"
  | "transferRequestQuantity"
  | "accountPaymentAmount";

const navigationViewCopy: Record<
  NavigationView,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  Overview: {
    eyebrow: "Manager console",
    title: "Store operations command center",
    description:
      "Run manager-level stock, reconciliation, banking, and reporting checks without crowding the sales lane."
  },
  Sell: {
    eyebrow: "POS terminal",
    title: "Sales agent checkout lane",
    description:
      "Scan, browse, basket, tender, hold, and fulfil sales orders from a cashier-first interface built for touch and keyboard work."
  },
  Returns: {
    eyebrow: "Reversals desk",
    title: "Returns, exchanges, and corrections",
    description:
      "Review receipts, launch reversals, exchange items, and manage supplier returns away from the normal sales flow."
  },
  Inventory: {
    eyebrow: "Store / warehouse manager",
    title: "Stock requests, receipts, issues, and counts",
    description:
      "Request stock, receive purchase orders, issue transfers, receive transfers, and perform stock counts from the replicated store catalog."
  },
  Sync: {
    eyebrow: "Admin monitor",
    title: "Sync recovery and desktop telemetry",
    description:
      "Watch queue pressure, recovery work, and worker history so the local node stays aligned with enterprise even during unstable network conditions."
  }
};

const navigationLabels: Record<
  NavigationView,
  {
    label: string;
    detail: string;
  }
> = {
  Overview: {
    label: "Manager",
    detail: "EOD, banking, reports"
  },
  Sell: {
    label: "POS",
    detail: "Sales, orders, shifts"
  },
  Returns: {
    label: "Reversals",
    detail: "Returns, exchanges"
  },
  Inventory: {
    label: "Stock",
    detail: "Request, receive, count"
  },
  Sync: {
    label: "Sync",
    detail: "Queues, recovery"
  }
};

const queueMetricCards: Array<{
  key: QueueMetricKey;
  label: string;
  hint: string;
}> = [
  {
    key: "upstreamQueued",
    label: "Upstream queued",
    hint: "Local transactions and stock movements waiting for enterprise delivery."
  },
  {
    key: "upstreamInFlight",
    label: "Upstream in flight",
    hint: "Events currently being retried or acknowledged during a sync pass."
  },
  {
    key: "downstreamQueued",
    label: "Downstream queued",
    hint: "Enterprise catalog, price, and policy packets waiting to apply locally."
  },
  {
    key: "deadLetter",
    label: "Dead-letter",
    hint: "Items that need review instead of silent overwrite."
  }
];

const operationsMetricCards: Array<{
  key: OperationsMetricKey;
  label: string;
  hint: string;
}> = [
  {
    key: "completedSales",
    label: "Completed sales",
    hint: "Sales already persisted locally, even if enterprise is unavailable."
  },
  {
    key: "parkedSales",
    label: "Parked sales",
    hint: "Baskets that can be resumed without losing local state."
  },
  {
    key: "openShifts",
    label: "Open shifts",
    hint: "Cashier shifts still operating on the local desktop node."
  },
  {
    key: "openSalesOrders",
    label: "Open sales orders",
    hint: "Local hold orders still waiting for fulfilment or cancellation."
  },
  {
    key: "catalogItems",
    label: "Catalog items",
    hint: "Products already replicated into the store-local catalog."
  },
  {
    key: "barcodeLinks",
    label: "Barcode links",
    hint: "Scanner-ready barcode records already hydrated into the local store node."
  },
  {
    key: "availableUnits",
    label: "Available units",
    hint: "Store-facing quantity currently available from the local product snapshot."
  },
  {
    key: "openPurchaseOrders",
    label: "Open POs",
    hint: "Committed purchase orders waiting for local receiving or partial receipt follow-up."
  },
  {
    key: "openInterStoreTransfers",
    label: "Open transfers",
    hint: "Inter-store instructions waiting for local issue or local receipt execution."
  },
  {
    key: "openStockCountSessions",
    label: "Open counts",
    hint: "Local stock count sessions waiting for submission or commit from this desktop."
  },
  {
    key: "recentCloseouts",
    label: "Closeouts",
    hint: "EOD reconciliations already recorded on this desktop."
  },
  {
    key: "recentBankingDeposits",
    label: "Banking deposits",
    hint: "Bank deposits already recorded from local closeout activity."
  },
  {
    key: "bankedAmount",
    label: "Banked value",
    hint: "Cash already banked locally and waiting for or already received by enterprise."
  },
  {
    key: "pendingBankingAmount",
    label: "Pending banking",
    hint: "Declared cash that is reconciled locally but not fully banked yet."
  }
];

const receiptSearchWindowOptions = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" }
] as const;

const scannerSubmitModeOptions = [
  { value: "LOOKUP", label: "Lookup item only" },
  { value: "ADD_TO_BASKET", label: "Lookup and add to basket" },
  { value: "INSTANT_SALE", label: "Lookup and instant sale" }
] as const;

type ScannerSubmitMode = (typeof scannerSubmitModeOptions)[number]["value"];

const receiptSearchTransactionFilterOptions: Array<{
  value: StoreReceiptSearchTransactionFilter;
  label: string;
}> = [
  { value: "CORRECTABLE", label: "Correction-ready receipts" },
  { value: "ALL", label: "All completed receipts" },
  { value: "SALE", label: "Sales only" },
  { value: "RETURN", label: "Returns only" },
  { value: "EXCHANGE", label: "Exchanges only" }
];

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "GHS"
});

const touchKeyboardTargetLabels: Record<TouchKeyboardTarget, string> = {
  scanQuery: "barcode / product code",
  scanQuantity: "sale quantity",
  shiftOpeningFloat: "opening float",
  shiftDeclaredCash: "declared cash",
  eodDeclaredCash: "EOD declared cash",
  bankingDepositAmount: "banking deposit",
  stockCountQuantity: "counted quantity",
  transferRequestQuantity: "transfer quantity",
  accountPaymentAmount: "account payment"
};

const salesAgentWorkstreams: Array<{
  title: string;
  detail: string;
  view: NavigationView;
}> = [
  {
    title: "Sales lane",
    detail: "Scan, basket, tender, print, and keep selling while offline.",
    view: "Sell"
  },
  {
    title: "Reversals",
    detail: "Receipt search, return baskets, exchanges, and correction receipts.",
    view: "Returns"
  },
  {
    title: "Shift control",
    detail: "Open, monitor, reconcile, and close the cashier shift.",
    view: "Sell"
  },
  {
    title: "Sales orders",
    detail: "Use parked baskets as the current local hold/fulfilment lane.",
    view: "Sell"
  }
];

const managerWorkstreams: Array<{
  title: string;
  detail: string;
  view: NavigationView;
}> = [
  {
    title: "Request stock",
    detail: "Create transfer-in requests from another store or warehouse.",
    view: "Inventory"
  },
  {
    title: "Receive stock",
    detail: "Receive purchase orders and post accepted stock locally.",
    view: "Inventory"
  },
  {
    title: "Issue stock",
    detail: "Issue and receive inter-store transfer instructions.",
    view: "Inventory"
  },
  {
    title: "Stock count",
    detail: "Save drafts, submit counts, and commit local count variances.",
    view: "Inventory"
  },
  {
    title: "End of day",
    detail: "Review shift cash, tender totals, queue pressure, and banking readiness.",
    view: "Sell"
  },
  {
    title: "Reporting",
    detail: "Use local sales, stock, queue, and recovery reports from the node dashboard.",
    view: "Overview"
  }
];

type CheckoutPaymentDraft = {
  id: string;
  tenderMethodCode: string;
  amount: string;
  reference: string;
};

type ExchangeLineIntent = "SALE" | "RETURN";

function formatStoreUserLabel(user: { displayName: string; loginId: string }) {
  return `${user.displayName} (${user.loginId})`;
}

function createPaymentDraft(
  totalAmount = "",
  tenderMethodCode = ""
): CheckoutPaymentDraft {
  return {
    id: `payment-${Math.random().toString(36).slice(2, 10)}`,
    tenderMethodCode,
    amount: totalAmount,
    reference: ""
  };
}

function parseSerialDraft(value: string) {
  const nextValues: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of value.split(/[\n,;]+/)) {
    const nextValue = rawValue.trim();

    if (!nextValue) {
      continue;
    }

    const duplicateKey = nextValue.toUpperCase();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    nextValues.push(nextValue);
  }

  return nextValues;
}

function formatSerialDraft(serialNumbers: string[]) {
  return serialNumbers.join("\n");
}

function buildSuggestedSerialDraft(quantity: number, serialNumbers: string[]) {
  const wholeQuantity = Number.isInteger(quantity) ? Math.max(0, quantity) : 0;

  if (wholeQuantity <= 0) {
    return "";
  }

  return formatSerialDraft(serialNumbers.slice(0, wholeQuantity));
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function HealthBadge({
  health,
  children
}: {
  health: StoreSyncSnapshot["health"];
  children?: ReactNode;
}) {
  return (
    <span className={`desktop-health desktop-health-${health}`}>
      {children ?? health}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`desktop-task-status${
        status === "COMPLETED" ? " is-completed" : " is-open"
      }`}
    >
      {status === "COMPLETED" ? "Completed" : "Open"}
    </span>
  );
}

function formatSerialRegistryStatusLabel(status: StoreSerialRegistryStatus) {
  if (status === "IN_TRANSIT") {
    return "In transit";
  }

  if (status === "ADJUSTED_OUT") {
    return "Adjusted out";
  }

  return status === "AVAILABLE" ? "Available" : "Sold";
}

function describeSerialRegistryStatus(status: StoreSerialRegistryStatus) {
  if (status === "AVAILABLE") {
    return "This serial is currently available in the local registry and can be validated for sales, transfers, or count work from this desktop.";
  }

  if (status === "IN_TRANSIT") {
    return "This serial has been issued out locally for an inter-store transfer and is waiting to be received at the destination desktop.";
  }

  if (status === "SOLD") {
    return "This serial has already been issued on a completed local sale and remains traceable for receipt-linked returns or exchanges.";
  }

  return "This serial was moved out of availability by a stock-control action such as an adjustment, shrinkage, or count reconciliation.";
}

function formatPurchaseOrderStatusLabel(status: StorePurchaseOrderStatus) {
  if (status === "PART_RECEIVED") {
    return "Part received";
  }

  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatSupplierReturnReasonLabel(reason: StoreLocalSupplierReturnReason) {
  return reason
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatSupplierClaimReasonLabel(reason: StoreLocalGoodsReceiptExceptionSummary["reason"]) {
  return reason
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

const purchaseOrderExceptionReasonOptions: StoreLocalGoodsReceiptExceptionSummary["reason"][] = [
  "SHORT_SUPPLIED",
  "REJECTED_AT_RECEIPT",
  "DAMAGED_INBOUND",
  "WRONG_ITEM",
  "OTHER"
];

function formatInterStoreTransferStatusLabel(status: StoreInterStoreTransferStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatInterStoreTransferRoleLabel(role: StoreInterStoreTransferSummary["role"]) {
  return role === "SOURCE" ? "Source issue" : "Destination receipt";
}

function formatTransferRequestDraftStatusLabel(
  status: StoreInterStoreTransferRequestDraftSummary["status"]
) {
  return status === "SUBMITTED" ? "Submitted" : "Draft";
}

function formatStockCountSessionStatusLabel(status: StoreStockCountSessionSummary["status"]) {
  if (status === "SUBMITTED") {
    return "Submitted";
  }

  if (status === "COMMITTED") {
    return "Committed";
  }

  return "Draft";
}

function formatTransferRequestSourceModeLabel(target: StoreTransferRequestTargetSummary) {
  if (target.sourceStoreWarehouseEnabled && target.sourceStoreSalesEnabled) {
    return "Hybrid site";
  }

  if (target.sourceStoreWarehouseEnabled) {
    return "Warehouse";
  }

  if (target.sourceStoreSalesEnabled) {
    return "Sales store";
  }

  return "Store";
}

function getTaskActionLabel(taskType: string) {
  if (taskType === "APPLY_INVENTORY_ADJUSTMENT") {
    return "Apply stock adjustment";
  }

  if (taskType === "APPLY_COUNT_VARIANCE") {
    return "Confirm count variance";
  }

  if (taskType === "APPLY_STOCK_TRANSFER") {
    return "Apply stock transfer";
  }

  return "Mark resend queued";
}

function formatTransactionTypeLabel(transactionType: string | null) {
  if (!transactionType) {
    return "Account payment";
  }

  if (transactionType === "RETURN") {
    return "Return";
  }

  if (transactionType === "EXCHANGE") {
    return "Exchange";
  }

  return "Sale";
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getCorrectionSourceTransactionNo(transaction: {
  transactionNo: string;
  sourceTransactionNo: string | null;
  transactionType: string | null;
}) {
  if (!transaction.transactionType) {
    return null;
  }

  if (transaction.transactionType === "RETURN") {
    return transaction.sourceTransactionNo;
  }

  if (transaction.transactionType === "SALE" || transaction.transactionType === "EXCHANGE") {
    return transaction.transactionNo;
  }

  return null;
}

function getCorrectionSourceActionLabel(transactionType: string | null) {
  return transactionType === "RETURN" ? "Open original sale" : "Open correction source";
}

function formatLineIntentLabel(lineIntent: string) {
  return lineIntent === "RETURN" ? "Returned item" : "Replacement item";
}

function SerialChipList({
  serialNumbers,
  emptyLabel
}: {
  serialNumbers: string[];
  emptyLabel: string;
}) {
  return (
    <div className="desktop-serial-chip-list">
      {serialNumbers.length > 0 ? (
        serialNumbers.map((serialNumber) => (
          <span className="desktop-serial-chip" key={serialNumber}>
            {serialNumber}
          </span>
        ))
      ) : (
        <span className="desktop-serial-chip is-empty">{emptyLabel}</span>
      )}
    </div>
  );
}

function SectionCard({
  className,
  eyebrow,
  title,
  children,
  extra
}: {
  className?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <article className={className ? `desktop-card ${className}` : "desktop-card"}>
      <div className="desktop-card-header">
        <div>
          <p className="desktop-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {extra}
      </div>
      {children}
    </article>
  );
}

function TouchKeypad({
  target,
  onInput,
  onBackspace,
  onClear,
  onEnter,
  onClose
}: {
  target: TouchKeyboardTarget | null;
  onInput: (value: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  onClose: () => void;
}) {
  if (!target) {
    return null;
  }

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "00"];

  return (
    <section className="desktop-touch-keypad" aria-label="On-screen keypad">
      <div className="desktop-touch-keypad-head">
        <div>
          <p className="desktop-eyebrow">Touch keypad</p>
          <strong>{touchKeyboardTargetLabels[target]}</strong>
        </div>
        <button className="desktop-secondary-button desktop-compact-button" onClick={onClose} type="button">
          Hide
        </button>
      </div>
      <div className="desktop-touch-keypad-grid">
        {keys.map((key) => (
          <button
            className="desktop-touch-key"
            key={key}
            onClick={() => onInput(key)}
            type="button"
          >
            {key}
          </button>
        ))}
        <button className="desktop-touch-key is-wide" onClick={onBackspace} type="button">
          Back
        </button>
        <button className="desktop-touch-key" onClick={onClear} type="button">
          Clear
        </button>
        <button className="desktop-touch-key is-primary" onClick={onEnter} type="button">
          Enter
        </button>
      </div>
    </section>
  );
}

const desktopRuntimeUnavailableMessage =
  "Flash ERP desktop services are unavailable. Launch this workspace from the Electron store desktop shell.";

function readDesktopRuntime() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { desktopRuntime?: DesktopRuntimeApi }).desktopRuntime;
}

function isEditableFieldTarget(element: Element | null, exemptInput: HTMLInputElement | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element === exemptInput) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }

  return element instanceof HTMLInputElement;
}

export function App() {
  const [activeView, setActiveView] = useState<NavigationView>("Overview");
  const [context, setContext] = useState<DesktopRuntimeContext | null>(null);
  const [snapshot, setSnapshot] = useState<StoreSyncSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasUnlockedDesktop, setHasUnlockedDesktop] = useState(false);
  const [isTouchMode, setIsTouchMode] = useState(false);
  const [touchKeyboardTarget, setTouchKeyboardTarget] = useState<TouchKeyboardTarget | null>(null);
  const [loginScreenLoginId, setLoginScreenLoginId] = useState("");
  const [loginScreenPassword, setLoginScreenPassword] = useState("");
  const [scanQuery, setScanQuery] = useState("");
  const [scanQuantity, setScanQuantity] = useState("1");
  const [scanSerialDraft, setScanSerialDraft] = useState("");
  const [scanResult, setScanResult] = useState<StoreCatalogLookupResult | null>(null);
  const [scannerSubmitMode, setScannerSubmitMode] = useState<ScannerSubmitMode>("ADD_TO_BASKET");
  const [scannerKeepFocus, setScannerKeepFocus] = useState(true);
  const [lastScannerActionLabel, setLastScannerActionLabel] = useState<string | null>(null);
  const [lastScannerActionAt, setLastScannerActionAt] = useState<string | null>(null);
  const [catalogBrowseQuery, setCatalogBrowseQuery] = useState("");
  const [catalogBrowseDepartment, setCatalogBrowseDepartment] = useState("");
  const [catalogBrowseCategory, setCatalogBrowseCategory] = useState("");
  const [catalogBrowseSerializedOnly, setCatalogBrowseSerializedOnly] = useState(false);
  const [catalogBrowseResults, setCatalogBrowseResults] = useState<StoreCatalogBrowseItem[]>([]);
  const [isCatalogBrowseBusy, setIsCatalogBrowseBusy] = useState(false);
  const [inventoryBrowseQuery, setInventoryBrowseQuery] = useState("");
  const [inventoryBrowseLocation, setInventoryBrowseLocation] = useState("");
  const [inventoryBrowseDepartment, setInventoryBrowseDepartment] = useState("");
  const [inventoryBrowseCategory, setInventoryBrowseCategory] = useState("");
  const [inventoryBrowseSerializedOnly, setInventoryBrowseSerializedOnly] = useState(false);
  const [inventoryBrowseResults, setInventoryBrowseResults] = useState<StoreInventoryBrowseItem[]>([]);
  const [isInventoryBrowseBusy, setIsInventoryBrowseBusy] = useState(false);
  const [serialBrowseQuery, setSerialBrowseQuery] = useState("");
  const [serialBrowseLocation, setSerialBrowseLocation] = useState("");
  const [serialBrowseDepartment, setSerialBrowseDepartment] = useState("");
  const [serialBrowseCategory, setSerialBrowseCategory] = useState("");
  const [serialBrowseStatus, setSerialBrowseStatus] = useState<
    "" | StoreSerialRegistryStatus
  >("");
  const [serialBrowseResults, setSerialBrowseResults] = useState<StoreSerialRegistryBrowseItem[]>([]);
  const [isSerialBrowseBusy, setIsSerialBrowseBusy] = useState(false);
  const [purchaseOrderBrowseQuery, setPurchaseOrderBrowseQuery] = useState("");
  const [purchaseOrderBrowseStatus, setPurchaseOrderBrowseStatus] = useState<
    "" | StorePurchaseOrderStatus
  >("COMMITTED");
  const [purchaseOrderBrowseResults, setPurchaseOrderBrowseResults] = useState<
    StorePurchaseOrderSummary[]
  >([]);
  const [isPurchaseOrderBrowseBusy, setIsPurchaseOrderBrowseBusy] = useState(false);
  const [transferBrowseQuery, setTransferBrowseQuery] = useState("");
  const [transferBrowseRole, setTransferBrowseRole] = useState<"" | "SOURCE" | "DESTINATION">("");
  const [transferBrowseStatus, setTransferBrowseStatus] = useState<
    "" | StoreInterStoreTransferStatus
  >("");
  const [transferBrowseResults, setTransferBrowseResults] = useState<
    StoreInterStoreTransferSummary[]
  >([]);
  const [isTransferBrowseBusy, setIsTransferBrowseBusy] = useState(false);
  const [transferRequestSourceLocationCode, setTransferRequestSourceLocationCode] = useState("");
  const [transferRequestDestinationLocationCode, setTransferRequestDestinationLocationCode] =
    useState("");
  const [transferRequestProductCode, setTransferRequestProductCode] = useState("");
  const [transferRequestQuantity, setTransferRequestQuantity] = useState("1");
  const [transferRequestExternalReference, setTransferRequestExternalReference] = useState("");
  const [transferRequestOperatorName, setTransferRequestOperatorName] = useState("");
  const [transferRequestNote, setTransferRequestNote] = useState("");
  const [stockCountLocationCode, setStockCountLocationCode] = useState("");
  const [stockCountProductCode, setStockCountProductCode] = useState("");
  const [stockCountQuantity, setStockCountQuantity] = useState("0");
  const [stockCountSerialDraft, setStockCountSerialDraft] = useState("");
  const [stockCountOperatorName, setStockCountOperatorName] = useState("");
  const [stockCountNote, setStockCountNote] = useState("");
  const [transferIssueQuantityDrafts, setTransferIssueQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const [transferIssueSerialDrafts, setTransferIssueSerialDrafts] = useState<
    Record<string, string>
  >({});
  const [transferIssueNoteDrafts, setTransferIssueNoteDrafts] = useState<Record<string, string>>(
    {}
  );
  const [transferIssueOperatorDrafts, setTransferIssueOperatorDrafts] = useState<
    Record<string, string>
  >({});
  const [transferReceiveQuantityDrafts, setTransferReceiveQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const [transferReceiveSerialDrafts, setTransferReceiveSerialDrafts] = useState<
    Record<string, string>
  >({});
  const [transferReceiveNoteDrafts, setTransferReceiveNoteDrafts] = useState<
    Record<string, string>
  >({});
  const [transferReceiveOperatorDrafts, setTransferReceiveOperatorDrafts] = useState<
    Record<string, string>
  >({});
  const [purchaseOrderReceiveQuantityDrafts, setPurchaseOrderReceiveQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const [purchaseOrderReceiveSerialDrafts, setPurchaseOrderReceiveSerialDrafts] = useState<
    Record<string, string>
  >({});
  const [
    purchaseOrderReceiveExceptionQuantityDrafts,
    setPurchaseOrderReceiveExceptionQuantityDrafts
  ] = useState<Record<string, string>>({});
  const [
    purchaseOrderReceiveExceptionReasonDrafts,
    setPurchaseOrderReceiveExceptionReasonDrafts
  ] = useState<Record<string, "" | StoreLocalGoodsReceiptExceptionSummary["reason"]>>({});
  const [purchaseOrderReceiveExceptionNoteDrafts, setPurchaseOrderReceiveExceptionNoteDrafts] =
    useState<Record<string, string>>({});
  const [purchaseOrderReceiveReferenceDrafts, setPurchaseOrderReceiveReferenceDrafts] = useState<
    Record<string, string>
  >({});
  const [purchaseOrderReceiveNoteDrafts, setPurchaseOrderReceiveNoteDrafts] = useState<
    Record<string, string>
  >({});
  const [purchaseOrderReceiveOperatorDrafts, setPurchaseOrderReceiveOperatorDrafts] = useState<
    Record<string, string>
  >({});
  const [supplierReturnGoodsReceiptId, setSupplierReturnGoodsReceiptId] = useState("");
  const [supplierReturnGoodsReceiptLineId, setSupplierReturnGoodsReceiptLineId] = useState("");
  const [supplierReturnQuantity, setSupplierReturnQuantity] = useState("1");
  const [supplierReturnReason, setSupplierReturnReason] =
    useState<StoreLocalSupplierReturnReason>("DAMAGED");
  const [supplierReturnExternalReference, setSupplierReturnExternalReference] = useState("");
  const [supplierReturnOperatorName, setSupplierReturnOperatorName] = useState("");
  const [supplierReturnNote, setSupplierReturnNote] = useState("");
  const [supplierReturnSerialDraft, setSupplierReturnSerialDraft] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<StoreCustomerSummary[]>([]);
  const [isCustomerSearchBusy, setIsCustomerSearchBusy] = useState(false);
  const [accountCustomerSearchQuery, setAccountCustomerSearchQuery] = useState("");
  const [accountCustomerSearchResults, setAccountCustomerSearchResults] = useState<
    StoreCustomerSummary[]
  >([]);
  const [isAccountCustomerSearchBusy, setIsAccountCustomerSearchBusy] = useState(false);
  const [selectedAccountCustomerId, setSelectedAccountCustomerId] = useState("");
  const [accountPaymentTenderMethodCode, setAccountPaymentTenderMethodCode] = useState("");
  const [accountPaymentAmount, setAccountPaymentAmount] = useState("");
  const [accountPaymentReference, setAccountPaymentReference] = useState("");
  const [accountPaymentNote, setAccountPaymentNote] = useState("");
  const [salesOrderStatusFilter, setSalesOrderStatusFilter] = useState<
    "ALL" | "OPEN" | "FULFILLED" | "CANCELLED"
  >("OPEN");
  const [salesOrderOperatorName, setSalesOrderOperatorName] = useState("");
  const [salesOrderNote, setSalesOrderNote] = useState("");
  const [eodDeclaredCashAmount, setEodDeclaredCashAmount] = useState("");
  const [eodOperatorName, setEodOperatorName] = useState("");
  const [eodNote, setEodNote] = useState("");
  const [selectedBankingReconciliationId, setSelectedBankingReconciliationId] = useState("");
  const [bankingDepositAmount, setBankingDepositAmount] = useState("");
  const [bankingBankName, setBankingBankName] = useState("");
  const [bankingReference, setBankingReference] = useState("");
  const [bankingOperatorName, setBankingOperatorName] = useState("");
  const [bankingNote, setBankingNote] = useState("");
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptSearchWindowDays, setReceiptSearchWindowDays] = useState("30");
  const [receiptSearchTransactionFilter, setReceiptSearchTransactionFilter] =
    useState<StoreReceiptSearchTransactionFilter>("CORRECTABLE");
  const [receiptSearchResults, setReceiptSearchResults] = useState<StoreReceiptSearchResult[]>([]);
  const [hasSearchedReceipts, setHasSearchedReceipts] = useState(false);
  const [receiptLookup, setReceiptLookup] = useState<StoreReceiptLookupResult | null>(null);
  const [isReceiptLookupBusy, setIsReceiptLookupBusy] = useState(false);
  const [isReceiptSearchBusy, setIsReceiptSearchBusy] = useState(false);
  const [operatorLoginDraft, setOperatorLoginDraft] = useState("");
  const [operatorPasswordDraft, setOperatorPasswordDraft] = useState("");
  const [isSessionBusy, setIsSessionBusy] = useState(false);
  const [shiftCashierCodeDraft, setShiftCashierCodeDraft] = useState("");
  const [shiftOpeningFloatDraft, setShiftOpeningFloatDraft] = useState("0");
  const [hasEditedShiftOpeningFloatDraft, setHasEditedShiftOpeningFloatDraft] = useState(false);
  const [shiftDeclaredCashDraft, setShiftDeclaredCashDraft] = useState("0");
  const [manualCorrectionSupervisorCodeDraft, setManualCorrectionSupervisorCodeDraft] = useState("");
  const [manualCorrectionSupervisorPasswordDraft, setManualCorrectionSupervisorPasswordDraft] =
    useState("");
  const [manualCorrectionSupervisorNoteDraft, setManualCorrectionSupervisorNoteDraft] = useState("");
  const operatorLoginInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptLineQuantityDrafts, setReceiptLineQuantityDrafts] = useState<
    Record<string, string>
  >({});
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const receiptSearchTransactionFilterLabel = useMemo(
    () =>
      receiptSearchTransactionFilterOptions.find(
        (option) => option.value === receiptSearchTransactionFilter
      )?.label ?? "selected receipts",
    [receiptSearchTransactionFilter]
  );
  const [receiptLineSerialDrafts, setReceiptLineSerialDrafts] = useState<
    Record<string, string>
  >({});
  const [isLookupBusy, setIsLookupBusy] = useState(false);
  const [isThermalTestSlipBusy, setIsThermalTestSlipBusy] = useState(false);
  const [isCashDrawerBusy, setIsCashDrawerBusy] = useState(false);
  const [basketQuantityDrafts, setBasketQuantityDrafts] = useState<Record<string, string>>({});
  const [basketSerialDrafts, setBasketSerialDrafts] = useState<Record<string, string>>({});
  const [basketPriceDrafts, setBasketPriceDrafts] = useState<Record<string, string>>({});
  const [basketDiscountDrafts, setBasketDiscountDrafts] = useState<Record<string, string>>({});
  const [basketOverrideNoteDrafts, setBasketOverrideNoteDrafts] = useState<Record<string, string>>(
    {}
  );
  const [basketPricingSupervisorCodeDraft, setBasketPricingSupervisorCodeDraft] = useState("");
  const [basketPricingSupervisorPasswordDraft, setBasketPricingSupervisorPasswordDraft] =
    useState("");
  const [basketLoyaltyPointsDraft, setBasketLoyaltyPointsDraft] = useState("");
  const [paymentDrafts, setPaymentDrafts] = useState<CheckoutPaymentDraft[]>([]);
  const [exchangeLineIntent, setExchangeLineIntent] = useState<ExchangeLineIntent>("RETURN");
  const [taskBrowseQuery, setTaskBrowseQuery] = useState("");
  const [taskBrowseDepartment, setTaskBrowseDepartment] = useState("");
  const [taskBrowseCategory, setTaskBrowseCategory] = useState("");
  const [availableReceiptPrinters, setAvailableReceiptPrinters] = useState<
    StoreReceiptPrinterDevice[]
  >([]);
  const [isPrinterListBusy, setIsPrinterListBusy] = useState(false);
  const [receiptPrinterNameDraft, setReceiptPrinterNameDraft] = useState("");
  const [receiptSilentPrintEnabled, setReceiptSilentPrintEnabled] = useState(false);
  const [receiptAutoPrintOnComplete, setReceiptAutoPrintOnComplete] = useState(true);
  const [cashDrawerTenderMethodCode, setCashDrawerTenderMethodCode] = useState("");
  const [cashDrawerReasonDraft, setCashDrawerReasonDraft] = useState("");
  const [hasHydratedReceiptPrinterSettings, setHasHydratedReceiptPrinterSettings] = useState(false);
  const [hasLoadedReceiptPrinters, setHasLoadedReceiptPrinters] = useState(false);
  const actionInFlightRef = useRef(false);
  const snapshotRefreshInFlightRef = useRef(false);
  const hasDesktopRuntime = readDesktopRuntime() !== undefined;

  const refreshSnapshot = useEffectEvent(async () => {
    const desktopRuntime = readDesktopRuntime();

    if (!desktopRuntime) {
      startTransition(() => {
        setContext(null);
        setSnapshot(null);
        setError(desktopRuntimeUnavailableMessage);
      });
      return;
    }

    const activeElement = document.activeElement;
    const shouldDeferRefresh =
      Boolean(snapshot) &&
      (snapshotRefreshInFlightRef.current ||
        isBusy ||
        isSessionBusy ||
        isLookupBusy ||
        isReceiptLookupBusy ||
        isReceiptSearchBusy ||
        isCatalogBrowseBusy ||
        isInventoryBrowseBusy ||
        isSerialBrowseBusy ||
        isPurchaseOrderBrowseBusy ||
        isTransferBrowseBusy ||
        isCustomerSearchBusy ||
        isAccountCustomerSearchBusy ||
        Boolean(touchKeyboardTarget) ||
        isEditableFieldTarget(activeElement, null));

    if (shouldDeferRefresh) {
      return;
    }

    snapshotRefreshInFlightRef.current = true;

    try {
      const nextSnapshot = await desktopRuntime.getSyncSnapshot();

      if (!nextSnapshot) {
        throw new Error("Flash ERP could not load the local store node snapshot.");
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(nextError instanceof Error ? nextError.message : "Unable to load local node data.");
      });
    } finally {
      snapshotRefreshInFlightRef.current = false;
    }
  });

  const runAction = useEffectEvent(async (action: () => Promise<StoreSyncActionResult>) => {
    if (actionInFlightRef.current) {
      return;
    }

    actionInFlightRef.current = true;
    setIsBusy(true);

    try {
      const result = await action();

      if (!result) {
        throw new Error("Flash ERP could not complete the requested desktop action.");
      }

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(nextError instanceof Error ? nextError.message : "The action could not be completed.");
      });
    } finally {
      actionInFlightRef.current = false;
      setIsBusy(false);
    }
  });

  const runDesktopAction = useEffectEvent(
    async (action: (desktopRuntime: DesktopRuntimeApi) => Promise<StoreSyncActionResult>) => {
      await runAction(() => {
        const desktopRuntime = readDesktopRuntime();

        if (!desktopRuntime) {
          throw new Error(desktopRuntimeUnavailableMessage);
        }

        return action(desktopRuntime);
      });
    }
  );

  const signInOperator = useEffectEvent(
    async (credentials?: {
      loginId?: string;
      password?: string;
    }) => {
      const loginId = (credentials?.loginId ?? operatorLoginDraft).trim();
      const password = credentials?.password ?? operatorPasswordDraft;

      if (!loginId || !password.trim()) {
        startTransition(() => {
          setError("Enter the operator login ID and password to unlock this desktop.");
        });
        return;
      }

      setIsSessionBusy(true);

      try {
        const result = await window.desktopRuntime.signInOperator({
          loginId,
          password
        });

        startTransition(() => {
          setSnapshot(result.snapshot);
          setBanner(result.message);
          setError(null);
          setHasUnlockedDesktop(true);
          setActiveView("Overview");
          setLoginScreenLoginId(loginId);
          setLoginScreenPassword("");
          setOperatorLoginDraft(loginId);
          setOperatorPasswordDraft("");
        });
      } catch (nextError) {
        startTransition(() => {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The operator could not be signed in on this desktop."
          );
        });
      } finally {
        setIsSessionBusy(false);
      }
    }
  );

  const signOutOperator = useEffectEvent(async () => {
    setIsSessionBusy(true);

    try {
      const result = await window.desktopRuntime.signOutOperator();

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
        setHasUnlockedDesktop(false);
        setActiveView("Overview");
        setOperatorPasswordDraft("");
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The operator could not be signed out from this desktop."
        );
      });
    } finally {
      setIsSessionBusy(false);
    }
  });

  const openShift = useEffectEvent(async () => {
    const cashierCode = snapshot?.activeOperatorSession?.loginId?.trim() ?? "";
    const openingFloatAmount = Number(shiftOpeningFloatDraft);

    if (!cashierCode) {
      startTransition(() => {
        setError("Sign in with a cashier account before opening the local shift.");
      });
      return;
    }

    if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
      startTransition(() => {
        setError("Enter an opening float of zero or greater before opening the shift.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.openShift({
        cashierCode,
        openingFloatAmount
      })
    );
  });

  const startManualReturnBasket = useEffectEvent(async () => {
    const supervisorCode = manualCorrectionSupervisorCodeDraft.trim();

    if (!supervisorCode) {
      startTransition(() => {
        setError("Choose a synced supervisor before starting a manual return basket.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.startReturnBasket({
        supervisorCode,
        supervisorPassword: manualCorrectionSupervisorPasswordDraft,
        note: manualCorrectionSupervisorNoteDraft.trim() || null
      })
    );
  });

  const startManualExchangeBasket = useEffectEvent(async () => {
    const supervisorCode = manualCorrectionSupervisorCodeDraft.trim();

    if (!supervisorCode) {
      startTransition(() => {
        setError("Choose a synced supervisor before starting a manual exchange basket.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.startExchangeBasket({
        supervisorCode,
        supervisorPassword: manualCorrectionSupervisorPasswordDraft,
        note: manualCorrectionSupervisorNoteDraft.trim() || null
      })
    );
  });

  const closeActiveShift = useEffectEvent(async () => {
    const declaredCashAmount = Number(shiftDeclaredCashDraft);

    if (!Number.isFinite(declaredCashAmount) || declaredCashAmount < 0) {
      startTransition(() => {
        setError("Enter a declared cash amount of zero or greater before closing the shift.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.closeActiveShift({
        declaredCashAmount
      })
    );
  });

  const createSalesOrderFromActiveBasket = useEffectEvent(async () => {
    await runAction(() =>
      window.desktopRuntime.createSalesOrderFromActiveBasket({
        operatorName: salesOrderOperatorName.trim() || signedInOperatorLabel,
        note: salesOrderNote.trim() || null
      })
    );
    startTransition(() => {
      setSalesOrderNote("");
    });
  });

  const cancelSalesOrder = useEffectEvent(async (orderId: string) => {
    await runAction(() =>
      window.desktopRuntime.cancelSalesOrder({
        orderId,
        operatorName: salesOrderOperatorName.trim() || signedInOperatorLabel,
        note: salesOrderNote.trim() || null
      })
    );
  });

  const recordEodReconciliation = useEffectEvent(async () => {
    const declaredCashAmount = Number(eodDeclaredCashAmount);
    const targetShift = snapshot?.recentClosedShifts[0] ?? snapshot?.activeShift ?? null;

    if (!targetShift) {
      startTransition(() => {
        setError("Open or close a shift before recording end-of-day reconciliation.");
      });
      return;
    }

    if (!Number.isFinite(declaredCashAmount) || declaredCashAmount < 0) {
      startTransition(() => {
        setError("Enter a declared cash amount of zero or greater for EOD reconciliation.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.recordEodReconciliation({
        shiftId: targetShift.shiftId,
        declaredCashAmount,
        operatorName: eodOperatorName.trim() || signedInOperatorLabel,
        note: eodNote.trim() || null
      })
    );
  });

  const recordBankingDeposit = useEffectEvent(async () => {
    const amount = Number(bankingDepositAmount);
    const reconciliationId =
      selectedBankingReconciliationId ||
      snapshot?.recentEodReconciliations[0]?.reconciliationId ||
      "";

    if (!reconciliationId) {
      startTransition(() => {
        setError("Record or choose an EOD reconciliation before banking cash.");
      });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      startTransition(() => {
        setError("Enter a banking deposit amount greater than zero.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.recordBankingDeposit({
        reconciliationId,
        amount,
        bankName: bankingBankName.trim() || null,
        reference: bankingReference.trim() || null,
        operatorName: bankingOperatorName.trim() || signedInOperatorLabel,
        note: bankingNote.trim() || null
      })
    );
    startTransition(() => {
      setBankingDepositAmount("");
      setBankingReference("");
      setBankingNote("");
    });
  });

  const openReceiptPrintWindow = useEffectEvent(async (transactionNo: string, autoPrint = false) => {
    try {
      const result = await window.desktopRuntime.printReceipt({
        transactionNo,
        autoPrint
      });

      startTransition(() => {
        setBanner(result.message);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The thermal receipt preview could not be opened."
        );
      });
    }
  });

  const refreshReceiptPrinterList = useEffectEvent(async () => {
    setIsPrinterListBusy(true);

    try {
      const printers = await window.desktopRuntime.listReceiptPrinters();

      startTransition(() => {
        setAvailableReceiptPrinters(printers);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Flash ERP could not inspect the receipt printers on this desktop."
        );
      });
    } finally {
      setIsPrinterListBusy(false);
    }
  });

  const restoreSavedReceiptPrinterDrafts = useEffectEvent(() => {
    if (!snapshot) {
      return;
    }

    startTransition(() => {
      setReceiptPrinterNameDraft(snapshot.receiptPrinterSettings.selectedPrinterName ?? "");
      setReceiptSilentPrintEnabled(snapshot.receiptPrinterSettings.silentPrintEnabled);
      setReceiptAutoPrintOnComplete(snapshot.receiptPrinterSettings.autoPrintOnComplete);
      setError(null);
    });
  });

  const refocusScanField = useEffectEvent(() => {
    if (!scannerKeepFocus || !activeOperatorSession || activeView !== "Sell") {
      return;
    }

    window.setTimeout(() => {
      if (isEditableFieldTarget(document.activeElement, scanInputRef.current)) {
        return;
      }

      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }, 0);
  });

  const saveReceiptPrinterRouting = useEffectEvent(async () => {
    setIsBusy(true);

    try {
      const normalizedPrinterName = receiptPrinterNameDraft.trim() || null;
      const result = await window.desktopRuntime.saveReceiptPrinterSettings({
        selectedPrinterName: normalizedPrinterName,
        silentPrintEnabled: receiptSilentPrintEnabled,
        autoPrintOnComplete: receiptAutoPrintOnComplete
      });

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
        setReceiptPrinterNameDraft(normalizedPrinterName ?? "");
        setReceiptSilentPrintEnabled(receiptSilentPrintEnabled);
        setReceiptAutoPrintOnComplete(receiptAutoPrintOnComplete);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The receipt printer routing could not be saved on this desktop."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const printThermalTestSlip = useEffectEvent(async () => {
    setIsThermalTestSlipBusy(true);

    try {
      const result = await window.desktopRuntime.printThermalTestSlip();

      startTransition(() => {
        setBanner(result.message);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The thermal printer test slip could not be sent."
        );
      });
    } finally {
      setIsThermalTestSlipBusy(false);
    }
  });

  const kickCashDrawer = useEffectEvent(async () => {
    setIsCashDrawerBusy(true);

    try {
      const result = await window.desktopRuntime.kickCashDrawer({
        tenderMethodCode: selectedCashDrawerTenderMethod?.tenderMethodCode ?? null,
        reason: cashDrawerReasonDraft.trim() || null
      });

      startTransition(() => {
        setBanner(result.message);
        setError(null);
        setCashDrawerReasonDraft("");
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The cash drawer route could not be triggered."
        );
      });
    } finally {
      setIsCashDrawerBusy(false);
    }
  });

  const runLookup = useEffectEvent(async (overrideQuery?: string) => {
    const query = (overrideQuery ?? scanQuery).trim();

    if (!query) {
      startTransition(() => {
        setScanResult(null);
        setError("Enter a barcode or product code before running a local lookup.");
      });
      refocusScanField();
      return null;
    }

    setIsLookupBusy(true);

    try {
      const result = await window.desktopRuntime.lookupCatalogItem(query);

      startTransition(() => {
        setScanQuery(query);

        if (!result) {
          setScanResult(null);
          setScanSerialDraft("");
          setError(`Flash ERP could not find a local catalog match for "${query}".`);
          return;
        }

        setScanResult(result);
        setScanSerialDraft("");
        setBanner(
          result.matchedOn === "barcode" && result.barcode
            ? `Matched ${result.productName} from barcode ${result.barcode}.`
            : `Matched ${result.productName} from the local catalog.`
        );
        setError(null);
      });

      refocusScanField();
      return result;
    } catch (nextError) {
      startTransition(() => {
        setScanResult(null);
        setError(
          nextError instanceof Error ? nextError.message : "The local catalog lookup could not complete."
        );
      });
      refocusScanField();
      return null;
    } finally {
      setIsLookupBusy(false);
    }
  });

  const runCatalogBrowse = useEffectEvent(async () => {
    setIsCatalogBrowseBusy(true);

    try {
      const results = await window.desktopRuntime.browseCatalogItems({
        query: catalogBrowseQuery,
        departmentCode: catalogBrowseDepartment || null,
        categoryCode: catalogBrowseCategory || null,
        serializedOnly: catalogBrowseSerializedOnly,
        limit: 12
      });

      startTransition(() => {
        setCatalogBrowseResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local catalog browser could not be refreshed."
        );
      });
    } finally {
      setIsCatalogBrowseBusy(false);
    }
  });

  const stageCatalogBrowseItem = useEffectEvent(async (item: StoreCatalogBrowseItem) => {
    startTransition(() => {
      setScanQuery(item.productCode);
      setScanQuantity("1");
      setScanSerialDraft("");
      setScanResult(null);
    });

    await runLookup(item.productCode);
  });

  const runInventoryBrowse = useEffectEvent(async () => {
    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      startTransition(() => {
        setInventoryBrowseResults([]);
      });
      return;
    }

    setIsInventoryBrowseBusy(true);

    try {
      const results = await window.desktopRuntime.browseInventoryPositions({
        query: inventoryBrowseQuery,
        locationCode: inventoryBrowseLocation || null,
        departmentCode: inventoryBrowseDepartment || null,
        categoryCode: inventoryBrowseCategory || null,
        serializedOnly: inventoryBrowseSerializedOnly,
        limit: 12
      });

      startTransition(() => {
        setInventoryBrowseResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The offline inventory browser could not be refreshed."
        );
      });
    } finally {
      setIsInventoryBrowseBusy(false);
    }
  });

  const runSerialBrowse = useEffectEvent(async () => {
    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      startTransition(() => {
        setSerialBrowseResults([]);
      });
      return;
    }

    setIsSerialBrowseBusy(true);

    try {
      const results = await window.desktopRuntime.browseSerialRegistry({
        query: serialBrowseQuery,
        locationCode: serialBrowseLocation || null,
        departmentCode: serialBrowseDepartment || null,
        categoryCode: serialBrowseCategory || null,
        status: serialBrowseStatus || null,
        limit: 14
      });

      startTransition(() => {
        setSerialBrowseResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local serial registry browser could not be refreshed."
        );
      });
    } finally {
      setIsSerialBrowseBusy(false);
    }
  });

  const runPurchaseOrderBrowse = useEffectEvent(async () => {
    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      startTransition(() => {
        setPurchaseOrderBrowseResults([]);
      });
      return;
    }

    setIsPurchaseOrderBrowseBusy(true);

    try {
      const results = await window.desktopRuntime.browsePurchaseOrders({
        query: purchaseOrderBrowseQuery,
        status: purchaseOrderBrowseStatus || null,
        limit: 10
      });

      startTransition(() => {
        setPurchaseOrderBrowseResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local purchase-order browser could not be refreshed."
        );
      });
    } finally {
      setIsPurchaseOrderBrowseBusy(false);
    }
  });

  const receivePurchaseOrder = useEffectEvent(async (purchaseOrder: StorePurchaseOrderSummary) => {
    const stagedLines = purchaseOrder.lines
      .map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantity: Number(purchaseOrderReceiveQuantityDrafts[line.purchaseOrderLineId] ?? "0"),
        serialNumbers: parseSerialDraft(
          purchaseOrderReceiveSerialDrafts[line.purchaseOrderLineId] ?? ""
        )
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);

    const stagedExceptionLines = purchaseOrder.lines
      .map((line) => {
        const quantity = Number(
          purchaseOrderReceiveExceptionQuantityDrafts[line.purchaseOrderLineId] ?? "0"
        );
        const reason = purchaseOrderReceiveExceptionReasonDrafts[line.purchaseOrderLineId] ?? "";
        const note = (purchaseOrderReceiveExceptionNoteDrafts[line.purchaseOrderLineId] ?? "").trim();

        if (!Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }

        if (!reason) {
          throw new Error(`Choose an exception reason for ${line.productName} before posting the GRN.`);
        }

        return {
          purchaseOrderLineId: line.purchaseOrderLineId,
          quantity,
          reason,
          note: note || null
        };
      })
      .filter(
        (
          line
        ): line is {
          purchaseOrderLineId: string;
          quantity: number;
          reason: StoreLocalGoodsReceiptExceptionSummary["reason"];
          note: string | null;
        } => line !== null
      );

    if (stagedLines.length === 0 && stagedExceptionLines.length === 0) {
      startTransition(() => {
        setError(
          "Enter at least one received quantity or receipt exception before posting the goods receipt locally."
        );
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.receivePurchaseOrder({
        purchaseOrderId: purchaseOrder.purchaseOrderId,
        supplierNo: purchaseOrder.supplierNo,
        externalReference:
          (purchaseOrderReceiveReferenceDrafts[purchaseOrder.purchaseOrderId] ?? "").trim() || null,
        note:
          (purchaseOrderReceiveNoteDrafts[purchaseOrder.purchaseOrderId] ?? "").trim() ||
          `Receiving stock for ${purchaseOrder.purchaseOrderNo} into ${purchaseOrder.inventoryLocationName}.`,
        operatorName:
          (purchaseOrderReceiveOperatorDrafts[purchaseOrder.purchaseOrderId] ?? "").trim() ||
          "Flash ERP receiver",
        lines: stagedLines,
        exceptionLines: stagedExceptionLines
      })
    );

    startTransition(() => {
      const lineIds = new Set(purchaseOrder.lines.map((line) => line.purchaseOrderLineId));

      setPurchaseOrderReceiveQuantityDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([lineId]) => !lineIds.has(lineId))
        )
      );
      setPurchaseOrderReceiveSerialDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([lineId]) => !lineIds.has(lineId))
        )
      );
      setPurchaseOrderReceiveExceptionQuantityDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([lineId]) => !lineIds.has(lineId))
        )
      );
      setPurchaseOrderReceiveExceptionReasonDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([lineId]) => !lineIds.has(lineId))
        ) as Record<string, "" | StoreLocalGoodsReceiptExceptionSummary["reason"]>
      );
      setPurchaseOrderReceiveExceptionNoteDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([lineId]) => !lineIds.has(lineId))
        )
      );
      setPurchaseOrderReceiveReferenceDrafts((current) => ({
        ...current,
        [purchaseOrder.purchaseOrderId]: ""
      }));
      setPurchaseOrderReceiveNoteDrafts((current) => ({
        ...current,
        [purchaseOrder.purchaseOrderId]: ""
      }));
      setPurchaseOrderReceiveOperatorDrafts((current) => ({
        ...current,
        [purchaseOrder.purchaseOrderId]: ""
      }));
    });

    await runPurchaseOrderBrowse();
  });

  const recordSupplierReturn = useEffectEvent(async () => {
    if (!selectedSupplierReturnReceipt || !selectedSupplierReturnReceiptLine) {
      startTransition(() => {
        setError("Select the original goods receipt and line before posting a supplier return.");
      });
      return;
    }

    const quantity = Number(supplierReturnQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      startTransition(() => {
        setError("Enter a return quantity greater than zero before posting the supplier return.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.recordSupplierReturn({
        goodsReceiptId: selectedSupplierReturnReceipt.goodsReceiptId,
        externalReference: supplierReturnExternalReference.trim() || null,
        reason: supplierReturnReason,
        note:
          supplierReturnNote.trim() ||
          `Returning stock from ${selectedSupplierReturnReceipt.goodsReceiptNo} to supplier ${selectedSupplierReturnReceipt.supplierName}.`,
        operatorName: supplierReturnOperatorName.trim() || "Flash ERP returns officer",
        lines: [
          {
            goodsReceiptLineId: selectedSupplierReturnReceiptLine.goodsReceiptLineId,
            quantity,
            serialNumbers: parseSerialDraft(supplierReturnSerialDraft)
          }
        ]
      })
    );

    startTransition(() => {
      setSupplierReturnQuantity("1");
      setSupplierReturnExternalReference("");
      setSupplierReturnOperatorName("");
      setSupplierReturnNote("");
      setSupplierReturnSerialDraft("");
    });
  });

  const acknowledgeSupplierReturnCancellation = useEffectEvent(
    async (supplierReturn: StoreLocalSupplierReturnSummary) => {
      await runAction(() =>
        window.desktopRuntime.acknowledgeSupplierReturnCancellation({
          supplierReturnId: supplierReturn.supplierReturnId
        })
      );
    }
  );

  const runTransferBrowse = useEffectEvent(async () => {
    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      startTransition(() => {
        setTransferBrowseResults([]);
      });
      return;
    }

    setIsTransferBrowseBusy(true);

    try {
      const results = await window.desktopRuntime.browseInterStoreTransfers({
        query: transferBrowseQuery,
        role: transferBrowseRole || null,
        status: transferBrowseStatus || null,
        limit: 10
      });

      startTransition(() => {
        setTransferBrowseResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local inter-store transfer browser could not be refreshed."
        );
      });
    } finally {
      setIsTransferBrowseBusy(false);
    }
  });

  const saveInterStoreTransferRequestDraft = useEffectEvent(async () => {
    const productCode = transferRequestProductCode.trim().toUpperCase();

    if (!productCode) {
      startTransition(() => {
        setError("Enter a product code before saving the transfer-in request draft.");
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.saveInterStoreTransferRequestDraft({
        sourceLocationCode: transferRequestSourceLocationCode,
        destinationLocationCode: transferRequestDestinationLocationCode,
        productCode,
        quantity: Number(transferRequestQuantity),
        externalReference: transferRequestExternalReference.trim() || null,
        operatorName: transferRequestOperatorName.trim() || "Flash ERP requester",
        note: transferRequestNote.trim() || null
      });

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
        setTransferRequestSourceLocationCode("");
        setTransferRequestProductCode("");
        setTransferRequestQuantity("1");
        setTransferRequestExternalReference("");
        setTransferRequestOperatorName("");
        setTransferRequestNote("");
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The inter-store transfer request draft could not be saved locally."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const submitInterStoreTransferRequestDraft = useEffectEvent(async (draftId: string) => {
    await runDesktopAction((desktopRuntime) =>
      desktopRuntime.submitInterStoreTransferRequestDraft(draftId)
    );
  });

  const saveStockCountSessionDraft = useEffectEvent(async () => {
    const productCode = stockCountProductCode.trim().toUpperCase();

    if (!productCode) {
      startTransition(() => {
        setError("Enter a product code before saving the local stock count.");
      });
      return;
    }

    const countedQuantity = Number(stockCountQuantity);

    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      startTransition(() => {
        setError("Enter a counted quantity of zero or greater before saving the local stock count.");
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.saveStockCountSessionDraft({
        inventoryLocationCode: stockCountLocationCode,
        productCode,
        countedQuantity,
        serialNumbers: parseSerialDraft(stockCountSerialDraft),
        operatorName: stockCountOperatorName.trim() || "Flash ERP stock counter",
        note: stockCountNote.trim() || null
      });

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
        setStockCountProductCode("");
        setStockCountQuantity("0");
        setStockCountSerialDraft("");
        setStockCountOperatorName("");
        setStockCountNote("");
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local stock count session could not be saved."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const submitStockCountSession = useEffectEvent(async (sessionId: string) => {
    await runDesktopAction((desktopRuntime) => desktopRuntime.submitStockCountSession(sessionId));
  });

  const commitStockCountSession = useEffectEvent(async (sessionId: string) => {
    await runDesktopAction((desktopRuntime) => desktopRuntime.commitStockCountSession(sessionId));
  });

  const issueInterStoreTransfer = useEffectEvent(async (transfer: StoreInterStoreTransferSummary) => {
    const quantity = Number(
      transferIssueQuantityDrafts[transfer.transferId] ?? transfer.outstandingIssueQuantity
    );

    if (!Number.isFinite(quantity) || quantity <= 0) {
      startTransition(() => {
        setError("Enter a valid issued quantity before posting the transfer locally.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.issueInterStoreTransfer({
        transferId: transfer.transferId,
        quantity,
        serialNumbers: parseSerialDraft(transferIssueSerialDrafts[transfer.transferId] ?? ""),
        operatorName:
          (transferIssueOperatorDrafts[transfer.transferId] ?? "").trim() || "Flash ERP issuer",
        note:
          (transferIssueNoteDrafts[transfer.transferId] ?? "").trim() ||
          `Issued ${quantity.toFixed(3)} unit(s) of ${transfer.productName} from ${transfer.sourceLocationName}.`
      })
    );

    await runTransferBrowse();
  });

  const receiveInterStoreTransfer = useEffectEvent(
    async (transfer: StoreInterStoreTransferSummary) => {
      const quantity = Number(
        transferReceiveQuantityDrafts[transfer.transferId] ?? transfer.outstandingReceiptQuantity
      );

      if (!Number.isFinite(quantity) || quantity <= 0) {
        startTransition(() => {
          setError("Enter a valid received quantity before confirming the transfer locally.");
        });
        return;
      }

      await runAction(() =>
        window.desktopRuntime.receiveInterStoreTransfer({
          transferId: transfer.transferId,
          quantity,
          serialNumbers: parseSerialDraft(transferReceiveSerialDrafts[transfer.transferId] ?? ""),
          operatorName:
            (transferReceiveOperatorDrafts[transfer.transferId] ?? "").trim() ||
            "Flash ERP receiver",
          note:
            (transferReceiveNoteDrafts[transfer.transferId] ?? "").trim() ||
            `Received ${quantity.toFixed(3)} unit(s) of ${transfer.productName} into ${transfer.destinationLocationName}.`
        })
      );

      await runTransferBrowse();
    }
  );

  const runCustomerSearch = useEffectEvent(async () => {
    setIsCustomerSearchBusy(true);

    try {
      const results = await window.desktopRuntime.searchCustomers({
        query: customerSearchQuery,
        limit: 8
      });

      startTransition(() => {
        setCustomerSearchResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setCustomerSearchResults([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local customer search could not be completed."
        );
      });
    } finally {
      setIsCustomerSearchBusy(false);
    }
  });

  const runAccountCustomerSearch = useEffectEvent(async () => {
    setIsAccountCustomerSearchBusy(true);

    try {
      const results = await window.desktopRuntime.searchCustomers({
        query: accountCustomerSearchQuery,
        limit: 8
      });

      startTransition(() => {
        setAccountCustomerSearchResults(results);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setAccountCustomerSearchResults([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local customer account search could not be completed."
        );
      });
    } finally {
      setIsAccountCustomerSearchBusy(false);
    }
  });

  const selectAccountCustomer = useEffectEvent((customer: StoreCustomerSummary) => {
    startTransition(() => {
      setSelectedAccountCustomerId(customer.customerId);
      setAccountPaymentAmount(
        customer.receivableBalanceAmount > 0
          ? customer.receivableBalanceAmount.toFixed(2)
          : ""
      );
      setError(null);
    });
  });

  const recordCustomerAccountPayment = useEffectEvent(async () => {
    const selectedCustomer = accountCustomerSearchResults.find(
      (customer) => customer.customerId === selectedAccountCustomerId
    );
    const amount = Number(accountPaymentAmount);

    if (!activeShift) {
      startTransition(() => {
        setError("Open a cashier shift before collecting customer account payments.");
      });
      return;
    }

    if (!selectedCustomer) {
      startTransition(() => {
        setError("Choose a customer account before collecting a payment.");
      });
      return;
    }

    if (!accountPaymentTenderMethodCode.trim()) {
      startTransition(() => {
        setError("Choose a tender method before collecting the customer payment.");
      });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      startTransition(() => {
        setError("Enter a payment amount greater than zero for the customer account.");
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.recordCustomerAccountPayment({
        customerId: selectedCustomer.customerId,
        tenderMethodCode: accountPaymentTenderMethodCode,
        amount,
        reference: accountPaymentReference.trim() || null,
        note: accountPaymentNote.trim() || null
      });
      const nextReceivableBalance = Math.max(
        0,
        Number((selectedCustomer.receivableBalanceAmount - amount).toFixed(2))
      );

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
        setAccountPaymentReference("");
        setAccountPaymentNote("");
        setAccountPaymentAmount(
          nextReceivableBalance > 0 ? nextReceivableBalance.toFixed(2) : ""
        );
        setAccountCustomerSearchResults((current) =>
          current.map((customer) =>
            customer.customerId === selectedCustomer.customerId
              ? {
                  ...customer,
                  receivableBalanceAmount: nextReceivableBalance,
                  updatedAt: result.snapshot.lastLocalWriteAt ?? customer.updatedAt
                }
              : customer
          )
        );
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The customer account payment could not be collected locally."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const attachCustomerToBasket = useEffectEvent(async (customerId: string | null) => {
    await runAction(() =>
      window.desktopRuntime.attachCustomerToActiveBasket({
        customerId
      })
    );
  });

  const runReceiptSearch = useEffectEvent(async () => {
    setIsReceiptSearchBusy(true);
    setHasSearchedReceipts(true);

    try {
      const results = await window.desktopRuntime.searchReceipts({
        query: receiptQuery,
        completedWithinDays: Number(receiptSearchWindowDays),
        limit: 12,
        transactionFilter: receiptSearchTransactionFilter
      });

      startTransition(() => {
        setReceiptSearchResults(results);
        setBanner(
          results.length > 0
            ? `Flash ERP found ${results.length} ${receiptSearchTransactionFilterLabel.toLowerCase()} for review.`
            : `Flash ERP did not find any matching ${receiptSearchTransactionFilterLabel.toLowerCase()} in the selected window.`
        );
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setReceiptSearchResults([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The local receipt search could not be completed."
        );
      });
    } finally {
      setIsReceiptSearchBusy(false);
    }
  });

  const runReceiptLookup = useEffectEvent(async (overrideTransactionNo?: string) => {
    const transactionNo = (overrideTransactionNo ?? receiptQuery).trim().toUpperCase();

    if (!transactionNo) {
      startTransition(() => {
        setReceiptLookup(null);
        setError("Enter a receipt number before looking up a correction source.");
      });
      return null;
    }

    setIsReceiptLookupBusy(true);

    try {
      const result = await window.desktopRuntime.lookupReceiptForCorrection(transactionNo);

      startTransition(() => {
        setReceiptQuery(transactionNo);

        if (!result) {
          setReceiptLookup(null);
          setError(`Flash ERP could not find completed receipt "${transactionNo}" locally.`);
          return;
        }

        setReceiptLookup(result);
        setBanner(
          result.eligibleLineCount > 0
            ? `Receipt ${result.sourceTransactionNo} is ready for correction with ${result.eligibleLineCount} eligible line(s).`
            : `Receipt ${result.sourceTransactionNo} was found, but it has no remaining quantity eligible for return.`
        );
        setError(null);
      });

      return result;
    } catch (nextError) {
      startTransition(() => {
        setReceiptLookup(null);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The receipt lookup could not complete locally."
        );
      });

      return null;
    } finally {
      setIsReceiptLookupBusy(false);
    }
  });

  const startReceiptCorrectionBasket = useEffectEvent(
    async (transactionType: "RETURN" | "EXCHANGE", overrideTransactionNo?: string) => {
      const transactionNo = (
        overrideTransactionNo ??
        receiptLookup?.sourceTransactionNo ??
        receiptQuery
      )
        .trim()
        .toUpperCase();

      if (!transactionNo) {
        startTransition(() => {
          setError("Look up a receipt before starting a linked return or exchange.");
        });
        return;
      }

      setIsBusy(true);

      try {
        const result =
          transactionType === "RETURN"
            ? await window.desktopRuntime.startReturnFromReceipt(transactionNo)
            : await window.desktopRuntime.startExchangeFromReceipt(transactionNo);
        const refreshedReceipt =
          (await window.desktopRuntime.lookupReceiptForCorrection(transactionNo)) ?? receiptLookup;

        startTransition(() => {
          setSnapshot(result.snapshot);
          setReceiptQuery(transactionNo);
          setReceiptLookup(refreshedReceipt ?? null);
          setBanner(result.message);
          setError(null);
        });
      } catch (nextError) {
        startTransition(() => {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The receipt-linked correction basket could not be opened."
          );
        });
      } finally {
        setIsBusy(false);
      }
    }
  );

  const addReceiptLineToBasket = useEffectEvent(async (sourceLineId: string) => {
    if (!receiptLookup) {
      startTransition(() => {
        setError("Look up a receipt before adding returned items from it.");
      });
      return;
    }

    const quantity = Number(receiptLineQuantityDrafts[sourceLineId] ?? "0");

    if (!Number.isFinite(quantity) || quantity <= 0) {
      startTransition(() => {
        setError("Enter a valid quantity before adding a receipt line to the basket.");
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.addReceiptLineToBasket({
        sourceTransactionId: receiptLookup.sourceTransactionId,
        sourceLineId,
        quantity,
        serialNumbers: parseSerialDraft(receiptLineSerialDrafts[sourceLineId] ?? "")
      });
      const refreshedReceipt =
        (await window.desktopRuntime.lookupReceiptForCorrection(receiptLookup.sourceTransactionNo)) ??
        receiptLookup;

      startTransition(() => {
        setSnapshot(result.snapshot);
        setReceiptLookup(refreshedReceipt);
        setBanner(result.message);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The receipt line could not be added to the correction basket."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const captureScannerSale = useEffectEvent(
    async (override?: {
      query?: string;
      quantity?: string;
      serialDraft?: string;
    }) => {
      const query = (override?.query ?? scanQuery).trim();
      const quantityDraft = override?.quantity ?? scanQuantity;
      const serialDraft = override?.serialDraft ?? scanSerialDraft;

      if (!query) {
        startTransition(() => {
          setError("Enter a barcode or product code before capturing a sale.");
        });
        refocusScanField();
        return;
      }

      setIsBusy(true);

      try {
        const result = await window.desktopRuntime.captureScannedSale({
          lookupValue: query,
          quantity: Number(quantityDraft),
          serialNumbers: parseSerialDraft(serialDraft)
        });

        startTransition(() => {
          setSnapshot(result.snapshot);
          setBanner(result.message);
          setError(null);
          setScanQuery("");
          setScanQuantity("1");
          setScanSerialDraft("");
          setScanResult(null);
          setLastScannerActionLabel(`Instant sale captured from ${query.toUpperCase()}.`);
          setLastScannerActionAt(new Date().toISOString());
        });
      } catch (nextError) {
        startTransition(() => {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The scanned sale could not be captured locally."
          );
        });
      } finally {
        setIsBusy(false);
        refocusScanField();
      }
    }
  );

  const addScannerItemToBasket = useEffectEvent(
    async (override?: {
      query?: string;
      quantity?: string;
      serialDraft?: string;
    }) => {
      const query = (override?.query ?? scanQuery).trim();
      const quantityDraft = override?.quantity ?? scanQuantity;
      const serialDraft = override?.serialDraft ?? scanSerialDraft;

      if (!query) {
        startTransition(() => {
          setError("Enter a barcode or product code before adding an item to the basket.");
        });
        refocusScanField();
        return;
      }

      setIsBusy(true);

      try {
        const result = await window.desktopRuntime.addItemToBasket({
          lookupValue: query,
          quantity: Number(quantityDraft),
          serialNumbers: parseSerialDraft(serialDraft),
          lineIntent:
            snapshot?.activeBasket?.transactionType === "EXCHANGE" ? exchangeLineIntent : undefined
        });

        startTransition(() => {
          setSnapshot(result.snapshot);
          setBanner(result.message);
          setError(null);
          setScanQuery("");
          setScanQuantity("1");
          setScanSerialDraft("");
          setScanResult(null);
          setLastScannerActionLabel(`Basket line queued from ${query.toUpperCase()}.`);
          setLastScannerActionAt(new Date().toISOString());
        });
      } catch (nextError) {
        startTransition(() => {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "The basket item could not be queued locally."
          );
        });
      } finally {
        setIsBusy(false);
        refocusScanField();
      }
    }
  );

  const submitScannerQuery = useEffectEvent(async () => {
    const query = scanQuery.trim();
    const quantityDraft = scanQuantity;
    const serialDraft = scanSerialDraft;

    if (!query) {
      startTransition(() => {
        setError("Enter a barcode or product code before using the scanner submit action.");
      });
      refocusScanField();
      return;
    }

    const lookupResult = await runLookup(query);

    if (!lookupResult || scannerSubmitMode === "LOOKUP") {
      return;
    }

    if (lookupResult.isSerialized && parseSerialDraft(serialDraft).length === 0) {
      startTransition(() => {
        setBanner(
          `${lookupResult.productName} is serialized. Enter the required serial number${Number(quantityDraft) > 1 ? "s" : ""} before continuing.`
        );
        setError(null);
      });
      refocusScanField();
      return;
    }

    if (scannerSubmitMode === "INSTANT_SALE") {
      if (snapshot?.activeBasket) {
        startTransition(() => {
          setError(
            "Park, complete, or clear the current basket before using instant sale from the scanner."
          );
        });
        refocusScanField();
        return;
      }

      await captureScannerSale({
        query,
        quantity: quantityDraft,
        serialDraft
      });
      return;
    }

    if (needsReceiptLinkedReturnEntry) {
      startTransition(() => {
        setError(
          "Receipt-linked return lines still need to be added from the original receipt lookup instead of the generic scanner lane."
        );
      });
      refocusScanField();
      return;
    }

    await addScannerItemToBasket({
      query,
      quantity: quantityDraft,
      serialDraft
    });
  });

  const saveBasketLine = useEffectEvent(async (lineId: string) => {
    const activeLine = snapshot?.activeBasket?.lines.find((line) => line.lineId === lineId) ?? null;

    if (!activeLine) {
      startTransition(() => {
        setError("The basket line could not be found on this desktop anymore.");
      });
      return;
    }

    const overrideUnitPriceDraft = basketPriceDrafts[lineId]?.trim() ?? "";
    const overrideDiscountDraft = basketDiscountDrafts[lineId]?.trim() ?? "";
    const overrideUnitPrice =
      overrideUnitPriceDraft.length > 0 ? Number(overrideUnitPriceDraft) : undefined;
    const overrideDiscountAmount =
      overrideDiscountDraft.length > 0 ? Number(overrideDiscountDraft) : undefined;

    if (
      (typeof overrideUnitPrice === "number" && !Number.isFinite(overrideUnitPrice)) ||
      (typeof overrideDiscountAmount === "number" && !Number.isFinite(overrideDiscountAmount))
    ) {
      startTransition(() => {
        setError("Enter valid manual pricing values before updating the basket line.");
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.updateBasketLine({
        lineId,
        quantity: Number(basketQuantityDrafts[lineId] ?? "0"),
        serialNumbers: parseSerialDraft(basketSerialDrafts[lineId] ?? ""),
        overrideUnitPrice:
          activeLine.lineIntent === "SALE" && !activeLine.sourceLineId ? overrideUnitPrice : undefined,
        overrideDiscountAmount:
          activeLine.lineIntent === "SALE" && !activeLine.sourceLineId
            ? overrideDiscountAmount
            : undefined,
        supervisorCode: basketPricingSupervisorCodeDraft,
        supervisorPassword: basketPricingSupervisorPasswordDraft,
        overrideNote: basketOverrideNoteDrafts[lineId]?.trim() || null
      });

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error ? nextError.message : "The basket line could not be updated locally."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const clearBasketLinePricing = useEffectEvent(async (lineId: string) => {
    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.updateBasketLine({
        lineId,
        quantity: Number(basketQuantityDrafts[lineId] ?? "0"),
        serialNumbers: parseSerialDraft(basketSerialDrafts[lineId] ?? ""),
        clearPricingOverride: true,
        overrideNote: basketOverrideNoteDrafts[lineId]?.trim() || null
      });

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The basket pricing override could not be cleared locally."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const removeBasketLine = useEffectEvent(async (lineId: string) => {
    await runDesktopAction((desktopRuntime) => desktopRuntime.removeBasketLine(lineId));
  });

  const applyBasketLoyaltyRedemption = useEffectEvent(async () => {
    const pointsToRedeem = Math.max(0, Math.trunc(Number(basketLoyaltyPointsDraft || "0")));

    if (!Number.isFinite(pointsToRedeem) || pointsToRedeem < 0) {
      startTransition(() => {
        setError("Enter loyalty points as zero or a whole positive number.");
      });
      return;
    }

    await runAction(() =>
      window.desktopRuntime.setActiveBasketLoyaltyRedemption({
        pointsToRedeem
      })
    );
  });

  const checkoutBasket = useEffectEvent(async () => {
    const transactionNoToPrint = snapshot?.activeBasket?.transactionNo ?? "";
    const availableTenderMethods = snapshot?.availableTenderMethods ?? [];
    const activeTenderMethods =
      snapshot?.activeBasket &&
      (snapshot.activeBasket.transactionType === "RETURN" ||
        (snapshot.activeBasket.transactionType === "EXCHANGE" &&
          snapshot.activeBasket.totalAmount < 0))
        ? availableTenderMethods.filter((method) => method.allowRefund)
        : availableTenderMethods;

    if (settlementAmount > 0 && isRefundSettlement && activeTenderMethods.length === 0) {
      startTransition(() => {
        setError(
          "Flash ERP does not currently have an active refund-capable tender method for this basket."
        );
      });
      return;
    }

    if (settlementAmount > 0 && activeTenderMethods.length > 0) {
      const hasUnknownTender = paymentDrafts.some(
        (payment) =>
          !activeTenderMethods.some(
            (method) => method.tenderMethodCode === payment.tenderMethodCode
          )
      );

      if (hasUnknownTender) {
        startTransition(() => {
          setError("Select a valid enterprise tender method for each payment row.");
        });
        return;
      }
    }

    const payments = paymentDrafts
      .map<StoreBasketCheckoutPayment | null>((payment) => {
        const amount = Number(payment.amount);
        const tenderMethod =
          activeTenderMethods.find(
            (method) => method.tenderMethodCode === payment.tenderMethodCode
          ) ?? null;

        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        return {
          method: tenderMethod?.paymentMethod ?? "CASH",
          tenderMethodCode: tenderMethod?.tenderMethodCode ?? null,
          tenderMethodName: tenderMethod?.tenderMethodName ?? null,
          amount,
          reference: payment.reference.trim() ? payment.reference.trim() : null
        };
      })
      .filter((payment): payment is StoreBasketCheckoutPayment => payment !== null);

    if (settlementAmount > 0 && payments.length === 0) {
      startTransition(() => {
        setError("Add at least one tender amount before checking out the basket.");
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await window.desktopRuntime.checkoutActiveBasket({ payments });

      startTransition(() => {
        setSnapshot(result.snapshot);
        setBanner(result.message);
        setError(null);
      });

      if (transactionNoToPrint && snapshot?.receiptPrinterSettings.autoPrintOnComplete) {
        void openReceiptPrintWindow(transactionNoToPrint, true);
      }
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error ? nextError.message : "The basket could not be checked out locally."
        );
      });
    } finally {
      setIsBusy(false);
    }
  });

  const updateTouchKeyboardTargetValue = (updater: (value: string) => string) => {
    if (!touchKeyboardTarget) {
      return;
    }

    const update = (value: string) => updater(value);

    switch (touchKeyboardTarget) {
      case "scanQuery":
        setScanQuery(update);
        break;
      case "scanQuantity":
        setScanQuantity(update);
        break;
      case "shiftOpeningFloat":
        setShiftOpeningFloatDraft(update);
        break;
      case "shiftDeclaredCash":
        setShiftDeclaredCashDraft(update);
        break;
      case "eodDeclaredCash":
        setEodDeclaredCashAmount(update);
        break;
      case "bankingDepositAmount":
        setBankingDepositAmount(update);
        break;
      case "stockCountQuantity":
        setStockCountQuantity(update);
        break;
      case "transferRequestQuantity":
        setTransferRequestQuantity(update);
        break;
      case "accountPaymentAmount":
        setAccountPaymentAmount(update);
        break;
    }
  };

  const appendTouchKeyboardValue = (value: string) => {
    updateTouchKeyboardTargetValue((current) => `${current}${value}`);
  };

  const backspaceTouchKeyboardValue = () => {
    updateTouchKeyboardTargetValue((current) => current.slice(0, -1));
  };

  const clearTouchKeyboardValue = () => {
    updateTouchKeyboardTargetValue(() => "");
  };

  const submitTouchKeyboardTarget = () => {
    if (touchKeyboardTarget === "scanQuery") {
      void submitScannerQuery();
      return;
    }

    setTouchKeyboardTarget(null);
  };

  useEffect(() => {
    const desktopRuntime = readDesktopRuntime();

    if (!desktopRuntime) {
      startTransition(() => {
        setContext(null);
        setError(desktopRuntimeUnavailableMessage);
      });
      return;
    }

    startTransition(() => {
      setContext(desktopRuntime.getContext());
    });
    void refreshSnapshot();

    const intervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [refreshSnapshot]);

  useEffect(() => {
    startTransition(() => {
      setBasketQuantityDrafts(
        Object.fromEntries(
          (snapshot?.activeBasket?.lines ?? []).map((line) => [line.lineId, String(line.quantity)])
        )
      );
      setBasketSerialDrafts(
        Object.fromEntries(
          (snapshot?.activeBasket?.lines ?? []).map((line) => [
            line.lineId,
            formatSerialDraft(line.serialNumbers)
          ])
        )
      );
      setBasketPriceDrafts(
        Object.fromEntries(
          (snapshot?.activeBasket?.lines ?? []).map((line) => [
            line.lineId,
            line.hasManualPriceOverride ? line.unitPrice.toFixed(2) : ""
          ])
        )
      );
      setBasketDiscountDrafts(
        Object.fromEntries(
          (snapshot?.activeBasket?.lines ?? []).map((line) => [
            line.lineId,
            line.hasManualDiscountOverride ? line.discountAmount.toFixed(2) : ""
          ])
        )
      );
      setBasketOverrideNoteDrafts(
        Object.fromEntries((snapshot?.activeBasket?.lines ?? []).map((line) => [line.lineId, ""]))
      );
      setBasketLoyaltyPointsDraft(
        snapshot?.activeBasket?.loyaltyRedemptionPoints
          ? String(snapshot.activeBasket.loyaltyRedemptionPoints)
          : ""
      );
    });
  }, [snapshot?.activeBasket?.transactionId, snapshot?.activeBasket?.updatedAt]);

  useEffect(() => {
    startTransition(() => {
      setReceiptLineQuantityDrafts(
        Object.fromEntries(
          (receiptLookup?.lines ?? []).map((line) => [
            line.sourceLineId,
            line.quantityAvailableToReturn > 0
              ? String(Math.min(1, line.quantityAvailableToReturn))
              : "0"
          ])
        )
      );
      setReceiptLineSerialDrafts(
        Object.fromEntries(
          (receiptLookup?.lines ?? []).map((line) => [
            line.sourceLineId,
            buildSuggestedSerialDraft(
              Math.min(1, line.quantityAvailableToReturn),
              line.availableSerialNumbersToReturn
            )
          ])
        )
      );
    });
  }, [receiptLookup?.sourceTransactionId, receiptLookup?.eligibleLineCount]);

  useEffect(() => {
    startTransition(() => {
      if (!snapshot?.activeBasket) {
        setPaymentDrafts([]);
        return;
      }

      if (snapshot.activeBasket.totalAmount === 0) {
        setPaymentDrafts([]);
        return;
      }

      setPaymentDrafts([
        createPaymentDraft(
          Math.abs(snapshot.activeBasket.totalAmount).toFixed(2),
          (snapshot.activeBasket.transactionType === "RETURN" ||
          (snapshot.activeBasket.transactionType === "EXCHANGE" &&
            snapshot.activeBasket.totalAmount < 0)
            ? snapshot.availableTenderMethods.find(
                (method) => method.paymentMethod === "CASH" && method.allowRefund
              )?.tenderMethodCode ??
              snapshot.availableTenderMethods.find((method) => method.allowRefund)?.tenderMethodCode
            : snapshot.availableTenderMethods.find((method) => method.paymentMethod === "CASH")
                ?.tenderMethodCode ??
              snapshot.availableTenderMethods[0]?.tenderMethodCode) ??
            ""
        )
      ]);
    });
  }, [snapshot?.activeBasket?.transactionId, snapshot?.availableTenderMethods]);

  useEffect(() => {
    startTransition(() => {
      setExchangeLineIntent("RETURN");
    });
  }, [snapshot?.activeBasket?.transactionId]);

  useEffect(() => {
    if (!receiptLookup?.sourceTransactionNo) {
      return;
    }

    void runReceiptLookup(receiptLookup.sourceTransactionNo);
  }, [
    receiptLookup?.sourceTransactionNo,
    snapshot?.activeBasket?.transactionId,
    snapshot?.activeBasket?.updatedAt,
    runReceiptLookup
  ]);

  useEffect(() => {
    const availableCategoryCodes = new Set(
      (snapshot?.productCategories ?? [])
        .filter((category) => !catalogBrowseDepartment || category.departmentCode === catalogBrowseDepartment)
        .map((category) => category.categoryCode)
    );

    if (catalogBrowseCategory && !availableCategoryCodes.has(catalogBrowseCategory)) {
      startTransition(() => {
        setCatalogBrowseCategory("");
      });
    }
  }, [catalogBrowseCategory, catalogBrowseDepartment, snapshot?.productCategories]);

  useEffect(() => {
    const availableCategoryCodes = new Set(
      (snapshot?.productCategories ?? [])
        .filter(
          (category) => !inventoryBrowseDepartment || category.departmentCode === inventoryBrowseDepartment
        )
        .map((category) => category.categoryCode)
    );

    if (inventoryBrowseCategory && !availableCategoryCodes.has(inventoryBrowseCategory)) {
      startTransition(() => {
        setInventoryBrowseCategory("");
      });
    }
  }, [inventoryBrowseCategory, inventoryBrowseDepartment, snapshot?.productCategories]);

  useEffect(() => {
    const availableCategoryCodes = new Set(
      (snapshot?.productCategories ?? [])
        .filter((category) => !serialBrowseDepartment || category.departmentCode === serialBrowseDepartment)
        .map((category) => category.categoryCode)
    );

    if (serialBrowseCategory && !availableCategoryCodes.has(serialBrowseCategory)) {
      startTransition(() => {
        setSerialBrowseCategory("");
      });
    }
  }, [serialBrowseCategory, serialBrowseDepartment, snapshot?.productCategories]);

  useEffect(() => {
    const availableCategoryCodes = new Set(
      (snapshot?.productCategories ?? [])
        .filter((category) => !taskBrowseDepartment || category.departmentCode === taskBrowseDepartment)
        .map((category) => category.categoryCode)
    );

    if (taskBrowseCategory && !availableCategoryCodes.has(taskBrowseCategory)) {
      startTransition(() => {
        setTaskBrowseCategory("");
      });
    }
  }, [snapshot?.productCategories, taskBrowseCategory, taskBrowseDepartment]);

  useEffect(() => {
    if (
      transferRequestDestinationLocationCode ||
      !snapshot ||
      snapshot.inventoryLocations.length === 0
    ) {
      return;
    }

    const suggestedLocationCode =
      snapshot.inventoryLocations.find((location) =>
        location.defaults.toLowerCase().includes("receiving")
      )?.locationCode ?? snapshot.inventoryLocations[0]?.locationCode ?? "";

    if (!suggestedLocationCode) {
      return;
    }

    startTransition(() => {
      setTransferRequestDestinationLocationCode(suggestedLocationCode);
    });
  }, [snapshot, transferRequestDestinationLocationCode]);

  useEffect(() => {
    if (stockCountLocationCode || !snapshot || snapshot.inventoryLocations.length === 0) {
      return;
    }

    const suggestedLocationCode =
      snapshot.inventoryLocations.find((location) =>
        location.defaults.toLowerCase().includes("sales")
      )?.locationCode ?? snapshot.inventoryLocations[0]?.locationCode ?? "";

    if (!suggestedLocationCode) {
      return;
    }

    startTransition(() => {
      setStockCountLocationCode(suggestedLocationCode);
    });
  }, [snapshot, stockCountLocationCode]);

  const recentGoodsReceipts = snapshot?.recentGoodsReceipts ?? [];
  const recentSupplierReturns = snapshot?.recentSupplierReturns ?? [];
  const recentCustomerAccountEntries = snapshot?.recentCustomerAccountEntries ?? [];
  const activeOperatorSession = snapshot?.activeOperatorSession ?? null;
  const activeShift = snapshot?.activeShift ?? null;
  const configuredShiftOpeningFloatDraft = (
    snapshot?.optionSettings.shiftFloatPromptAmount ?? 0
  ).toFixed(2);
  const recentClosedShifts = snapshot?.recentClosedShifts ?? [];
  const storeUsers = snapshot?.storeUsers ?? [];
  const cashierUsers = useMemo(
    () => storeUsers.filter((user) => user.accountStatus === "ACTIVE" && user.cashierEligible),
    [storeUsers]
  );
  const supervisorUsers = useMemo(
    () => storeUsers.filter((user) => user.accountStatus === "ACTIVE" && user.supervisorEligible),
    [storeUsers]
  );
  const userByLoginId = useMemo(
    () =>
      new Map(
        storeUsers.map((user) => [user.loginId.trim().toUpperCase(), user] as const)
      ),
    [storeUsers]
  );
  const activeShiftCashierUser =
    activeShift ? userByLoginId.get(activeShift.cashierCode.trim().toUpperCase()) ?? null : null;
  const activeOperatorUser =
    activeOperatorSession
      ? userByLoginId.get(activeOperatorSession.loginId.trim().toUpperCase()) ?? null
      : null;
  const activeOperatorCapabilities = activeOperatorSession?.capabilities ?? null;
  const activeOperatorOwnsShift =
    Boolean(activeShift) &&
    Boolean(activeOperatorSession) &&
    activeShift!.cashierCode.trim().toUpperCase() ===
      activeOperatorSession!.loginId.trim().toUpperCase();
  const signedInOperatorLabel = activeOperatorUser
    ? formatStoreUserLabel(activeOperatorUser)
    : activeOperatorSession
      ? formatStoreUserLabel(activeOperatorSession)
      : null;
  const activeOperatorRoleLabel = activeOperatorSession
    ? activeOperatorSession.roleNames.length > 0
      ? activeOperatorSession.roleNames.join(", ")
      : activeOperatorSession.roleCodes.length > 0
        ? activeOperatorSession.roleCodes.join(", ")
        : "No enterprise role assignments synced yet"
    : null;
  const selectedSupplierReturnReceipt =
    recentGoodsReceipts.find((receipt) => receipt.goodsReceiptId === supplierReturnGoodsReceiptId) ??
    null;
  const selectedSupplierReturnReceiptLine =
    selectedSupplierReturnReceipt?.lines.find(
      (line) => line.goodsReceiptLineId === supplierReturnGoodsReceiptLineId
    ) ?? null;
  const selectedAccountCustomer =
    accountCustomerSearchResults.find((customer) => customer.customerId === selectedAccountCustomerId) ??
    null;
  const reconciliationTargetShift = recentClosedShifts[0] ?? activeShift ?? null;
  const latestEodReconciliation = snapshot?.recentEodReconciliations[0] ?? null;
  const selectedBankingReconciliation =
    snapshot?.recentEodReconciliations.find(
      (reconciliation) => reconciliation.reconciliationId === selectedBankingReconciliationId
    ) ??
    latestEodReconciliation ??
    null;
  const depositedAmountForSelectedReconciliation = selectedBankingReconciliation
    ? (snapshot?.recentBankingDeposits ?? [])
        .filter(
          (deposit) =>
            deposit.reconciliationId === selectedBankingReconciliation.reconciliationId
        )
        .reduce((sum, deposit) => sum + deposit.amount, 0)
    : 0;
  const remainingBankingCash = selectedBankingReconciliation
    ? Number(
        (
          selectedBankingReconciliation.declaredCashAmount -
          depositedAmountForSelectedReconciliation
        ).toFixed(2)
      )
    : 0;
  const salesOrderStatusCounts = useMemo(
    () => ({
      ALL: snapshot?.salesOrders.length ?? 0,
      OPEN: snapshot?.salesOrders.filter((order) => order.status === "OPEN").length ?? 0,
      FULFILLED:
        snapshot?.salesOrders.filter((order) => order.status === "FULFILLED").length ?? 0,
      CANCELLED:
        snapshot?.salesOrders.filter((order) => order.status === "CANCELLED").length ?? 0
    }),
    [snapshot?.salesOrders]
  );
  const filteredSalesOrders = useMemo(() => {
    const orders = snapshot?.salesOrders ?? [];

    if (salesOrderStatusFilter === "ALL") {
      return orders;
    }

    return orders.filter((order) => order.status === salesOrderStatusFilter);
  }, [salesOrderStatusFilter, snapshot?.salesOrders]);
  const shiftProjectedVariance = activeShift
    ? Number((Number(shiftDeclaredCashDraft || "0") - activeShift.expectedCashAmount).toFixed(2))
    : 0;
  const shiftProjectedVarianceTone =
    !activeShift || Math.abs(shiftProjectedVariance) < 0.005
      ? "balanced"
      : shiftProjectedVariance > 0
        ? "over"
        : "short";
  const bankingProgressRows = useMemo(
    () =>
      (snapshot?.recentEodReconciliations ?? []).map((reconciliation) => {
        const depositedAmount = (snapshot?.recentBankingDeposits ?? [])
          .filter((deposit) => deposit.reconciliationId === reconciliation.reconciliationId)
          .reduce((sum, deposit) => sum + deposit.amount, 0);
        const remainingAmount = Number(
          (reconciliation.declaredCashAmount - depositedAmount).toFixed(2)
        );

        return {
          reconciliation,
          depositedAmount,
          remainingAmount,
          fullyBanked: remainingAmount <= 0.009
        };
      }),
    [snapshot?.recentBankingDeposits, snapshot?.recentEodReconciliations]
  );
  const activeViewCopy = navigationViewCopy[activeView];
  const activeViewClassName = `desktop-shell is-view-${activeView.toLowerCase()}${
    isTouchMode ? " is-touch-mode" : ""
  }${touchKeyboardTarget ? " has-touch-keypad" : ""}`;
  const canCaptureDemoSale =
    isBusy || !hasDesktopRuntime || !activeShift || !activeOperatorOwnsShift;
  const showLoginScreen = Boolean(snapshot) && (!hasUnlockedDesktop || !activeOperatorSession);
  const isOperatorDirectoryReady = storeUsers.length > 0;
  const posBasket = snapshot?.activeBasket ?? null;
  const posBasketLines = posBasket?.lines ?? [];
  const posCatalogTiles = catalogBrowseResults.slice(0, 18);
  const posCustomerLabel =
    posBasket?.customerName ??
    posBasket?.customerNo ??
    "Walk-in customer";
  const posLocationLabel =
    snapshot?.inventoryLocations[0]?.locationName ??
    snapshot?.inventoryLocations[0]?.locationCode ??
    snapshot?.storeName ??
    "Store floor";
  const posClockLabel = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date());

  useEffect(() => {
    if (activeOperatorSession || !hasUnlockedDesktop) {
      return;
    }

    startTransition(() => {
      setHasUnlockedDesktop(false);
    });
  }, [activeOperatorSession, hasUnlockedDesktop]);

  useEffect(() => {
    if (activeOperatorSession) {
      startTransition(() => {
        setOperatorLoginDraft(activeOperatorSession.loginId);
      });
      return;
    }

    if (operatorLoginDraft.trim()) {
      return;
    }

    startTransition(() => {
      setOperatorLoginDraft(cashierUsers[0]?.loginId ?? supervisorUsers[0]?.loginId ?? "");
    });
  }, [activeOperatorSession, cashierUsers, operatorLoginDraft, supervisorUsers]);

  useEffect(() => {
    if (!showLoginScreen || loginScreenLoginId.trim()) {
      return;
    }

    startTransition(() => {
      setLoginScreenLoginId(
        activeOperatorSession?.loginId ??
          cashierUsers[0]?.loginId ??
          supervisorUsers[0]?.loginId ??
          ""
      );
    });
  }, [activeOperatorSession, cashierUsers, loginScreenLoginId, showLoginScreen, supervisorUsers]);

  useEffect(() => {
    if (!signedInOperatorLabel) {
      return;
    }

    startTransition(() => {
      if (!salesOrderOperatorName.trim()) {
        setSalesOrderOperatorName(signedInOperatorLabel);
      }
      if (!eodOperatorName.trim()) {
        setEodOperatorName(signedInOperatorLabel);
      }
      if (!bankingOperatorName.trim()) {
        setBankingOperatorName(signedInOperatorLabel);
      }
    });
  }, [bankingOperatorName, eodOperatorName, salesOrderOperatorName, signedInOperatorLabel]);

  useEffect(() => {
    if (activeShift) {
      startTransition(() => {
        setShiftCashierCodeDraft(activeShift.cashierCode);
        setShiftDeclaredCashDraft(activeShift.expectedCashAmount.toFixed(2));
      });
      return;
    }

    const fallbackCashierCode =
      activeOperatorSession?.loginId ??
      recentClosedShifts[0]?.cashierCode ??
      cashierUsers[0]?.loginId ??
      "";

    startTransition(() => {
      if (!shiftCashierCodeDraft.trim() || recentClosedShifts.length > 0) {
        setShiftCashierCodeDraft(fallbackCashierCode);
      }
      setShiftDeclaredCashDraft("0");
    });
  }, [activeOperatorSession, activeShift, cashierUsers, recentClosedShifts, shiftCashierCodeDraft]);

  useEffect(() => {
    if (!reconciliationTargetShift) {
      return;
    }

    startTransition(() => {
      if (!eodDeclaredCashAmount.trim()) {
        setEodDeclaredCashAmount(
          (
            reconciliationTargetShift.declaredCashAmount ??
            reconciliationTargetShift.expectedCashAmount
          ).toFixed(2)
        );
      }
    });
  }, [eodDeclaredCashAmount, reconciliationTargetShift]);

  useEffect(() => {
    const fallbackReconciliationId = latestEodReconciliation?.reconciliationId ?? "";

    if (
      selectedBankingReconciliationId &&
      snapshot?.recentEodReconciliations.some(
        (reconciliation) => reconciliation.reconciliationId === selectedBankingReconciliationId
      )
    ) {
      return;
    }

    startTransition(() => {
      setSelectedBankingReconciliationId(fallbackReconciliationId);
      if (!bankingDepositAmount.trim() && latestEodReconciliation) {
        const alreadyDeposited = (snapshot?.recentBankingDeposits ?? [])
          .filter(
            (deposit) =>
              deposit.reconciliationId === latestEodReconciliation.reconciliationId
          )
          .reduce((sum, deposit) => sum + deposit.amount, 0);
        setBankingDepositAmount(
          Math.max(
            0,
            latestEodReconciliation.declaredCashAmount - alreadyDeposited
          ).toFixed(2)
        );
      }
    });
  }, [
    bankingDepositAmount,
    latestEodReconciliation,
    selectedBankingReconciliationId,
    snapshot?.recentBankingDeposits,
    snapshot?.recentEodReconciliations
  ]);

  useEffect(() => {
    if (activeShift) {
      startTransition(() => {
        setShiftOpeningFloatDraft(activeShift.openingFloatAmount.toFixed(2));
        setHasEditedShiftOpeningFloatDraft(false);
      });
      return;
    }

    if (!hasEditedShiftOpeningFloatDraft && shiftOpeningFloatDraft !== configuredShiftOpeningFloatDraft) {
      startTransition(() => {
        setShiftOpeningFloatDraft(configuredShiftOpeningFloatDraft);
      });
    }
  }, [
    activeShift,
    configuredShiftOpeningFloatDraft,
    hasEditedShiftOpeningFloatDraft,
    shiftOpeningFloatDraft
  ]);

  useEffect(() => {
    if (supervisorUsers.length === 0) {
      if (!manualCorrectionSupervisorCodeDraft) {
        return;
      }

      startTransition(() => {
        setManualCorrectionSupervisorCodeDraft("");
      });
      return;
    }

    const hasExistingSupervisor = supervisorUsers.some(
      (user) => user.loginId === manualCorrectionSupervisorCodeDraft
    );

    if (hasExistingSupervisor) {
      return;
    }

    startTransition(() => {
      setManualCorrectionSupervisorCodeDraft(supervisorUsers[0]?.loginId ?? "");
    });
  }, [manualCorrectionSupervisorCodeDraft, supervisorUsers]);

  useEffect(() => {
    if (supervisorUsers.length === 0) {
      if (!basketPricingSupervisorCodeDraft) {
        return;
      }

      startTransition(() => {
        setBasketPricingSupervisorCodeDraft("");
      });
      return;
    }

    const hasExistingSupervisor = supervisorUsers.some(
      (user) => user.loginId === basketPricingSupervisorCodeDraft
    );

    if (hasExistingSupervisor) {
      return;
    }

    const activeOperatorCanApprovePricing =
      Boolean(activeOperatorSession) &&
      Boolean(
        activeOperatorCapabilities?.canApproveDiscountOverride ||
          activeOperatorCapabilities?.canApprovePriceOverride
      );

    startTransition(() => {
      setBasketPricingSupervisorCodeDraft(
        activeOperatorCanApprovePricing
          ? activeOperatorSession?.loginId ?? supervisorUsers[0]?.loginId ?? ""
          : supervisorUsers[0]?.loginId ?? ""
      );
    });
  }, [
    activeOperatorCapabilities?.canApproveDiscountOverride,
    activeOperatorCapabilities?.canApprovePriceOverride,
    activeOperatorSession,
    basketPricingSupervisorCodeDraft,
    supervisorUsers
  ]);

  useEffect(() => {
    if (recentGoodsReceipts.length === 0) {
      if (!supplierReturnGoodsReceiptId) {
        return;
      }

      startTransition(() => {
        setSupplierReturnGoodsReceiptId("");
        setSupplierReturnGoodsReceiptLineId("");
      });
      return;
    }

    if (
      supplierReturnGoodsReceiptId &&
      recentGoodsReceipts.some((receipt) => receipt.goodsReceiptId === supplierReturnGoodsReceiptId)
    ) {
      return;
    }

    startTransition(() => {
      setSupplierReturnGoodsReceiptId(recentGoodsReceipts[0]?.goodsReceiptId ?? "");
    });
  }, [recentGoodsReceipts, supplierReturnGoodsReceiptId]);

  useEffect(() => {
    if (!selectedSupplierReturnReceipt || selectedSupplierReturnReceipt.lines.length === 0) {
      if (!supplierReturnGoodsReceiptLineId) {
        return;
      }

      startTransition(() => {
        setSupplierReturnGoodsReceiptLineId("");
      });
      return;
    }

    if (
      supplierReturnGoodsReceiptLineId &&
      selectedSupplierReturnReceipt.lines.some(
        (line) => line.goodsReceiptLineId === supplierReturnGoodsReceiptLineId
      )
    ) {
      return;
    }

    startTransition(() => {
      setSupplierReturnGoodsReceiptLineId(
        selectedSupplierReturnReceipt.lines[0]?.goodsReceiptLineId ?? ""
      );
    });
  }, [selectedSupplierReturnReceipt, supplierReturnGoodsReceiptLineId]);

  useEffect(() => {
    if (!snapshot || showLoginScreen || activeView !== "Sell") {
      if (catalogBrowseResults.length === 0) {
        return;
      }

      startTransition(() => {
        setCatalogBrowseResults([]);
      });
      return;
    }

    void runCatalogBrowse();
  }, [
    activeView,
    catalogBrowseCategory,
    catalogBrowseDepartment,
    catalogBrowseResults.length,
    catalogBrowseQuery,
    catalogBrowseSerializedOnly,
    showLoginScreen,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runCatalogBrowse
  ]);

  useEffect(() => {
    if (!snapshot || activeView !== "Inventory") {
      return;
    }

    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      return;
    }

    void runInventoryBrowse();
  }, [
    activeView,
    activeOperatorCapabilities?.hasInventoryVisibility,
    inventoryBrowseCategory,
    inventoryBrowseDepartment,
    inventoryBrowseLocation,
    inventoryBrowseQuery,
    inventoryBrowseSerializedOnly,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runInventoryBrowse
  ]);

  useEffect(() => {
    if (!snapshot || activeView !== "Inventory") {
      return;
    }

    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      return;
    }

    void runSerialBrowse();
  }, [
    activeView,
    activeOperatorCapabilities?.hasInventoryVisibility,
    serialBrowseCategory,
    serialBrowseDepartment,
    serialBrowseLocation,
    serialBrowseQuery,
    serialBrowseStatus,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runSerialBrowse
  ]);

  useEffect(() => {
    if (!snapshot || activeView !== "Inventory") {
      return;
    }

    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      return;
    }

    void runPurchaseOrderBrowse();
  }, [
    activeView,
    activeOperatorCapabilities?.hasInventoryVisibility,
    purchaseOrderBrowseQuery,
    purchaseOrderBrowseStatus,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runPurchaseOrderBrowse
  ]);

  useEffect(() => {
    if (!snapshot || activeView !== "Inventory") {
      return;
    }

    if (!activeOperatorCapabilities?.hasInventoryVisibility) {
      return;
    }

    void runTransferBrowse();
  }, [
    activeView,
    activeOperatorCapabilities?.hasInventoryVisibility,
    transferBrowseQuery,
    transferBrowseRole,
    transferBrowseStatus,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runTransferBrowse
  ]);

  useEffect(() => {
    if (activeOperatorCapabilities?.hasInventoryVisibility) {
      return;
    }

    startTransition(() => {
      setInventoryBrowseResults([]);
      setSerialBrowseResults([]);
      setPurchaseOrderBrowseResults([]);
      setTransferBrowseResults([]);
    });
  }, [activeOperatorCapabilities?.hasInventoryVisibility]);

  useEffect(() => {
    if (!snapshot || showLoginScreen || activeView !== "Sell") {
      if (customerSearchResults.length === 0) {
        return;
      }

      startTransition(() => {
        setCustomerSearchResults([]);
      });
      return;
    }

    if (!customerSearchQuery.trim()) {
      if (customerSearchResults.length === 0) {
        return;
      }

      startTransition(() => {
        setCustomerSearchResults([]);
      });
      return;
    }

    void runCustomerSearch();
  }, [
    activeView,
    customerSearchQuery,
    customerSearchResults.length,
    showLoginScreen,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runCustomerSearch
  ]);

  useEffect(() => {
    if (!snapshot || showLoginScreen || activeView !== "Sell") {
      if (accountCustomerSearchResults.length === 0) {
        return;
      }

      startTransition(() => {
        setAccountCustomerSearchResults([]);
      });
      return;
    }

    if (!accountCustomerSearchQuery.trim()) {
      if (accountCustomerSearchResults.length === 0) {
        return;
      }

      startTransition(() => {
        setAccountCustomerSearchResults([]);
      });
      return;
    }

    void runAccountCustomerSearch();
  }, [
    accountCustomerSearchResults.length,
    accountCustomerSearchQuery,
    activeView,
    showLoginScreen,
    snapshot?.lastLocalWriteAt,
    snapshot?.lastSyncAt,
    runAccountCustomerSearch
  ]);

  useEffect(() => {
    if (!selectedAccountCustomerId) {
      return;
    }

    const customerStillVisible = accountCustomerSearchResults.some(
      (customer) => customer.customerId === selectedAccountCustomerId
    );

    if (customerStillVisible) {
      return;
    }

    startTransition(() => {
      setSelectedAccountCustomerId("");
      setAccountPaymentAmount("");
      setAccountPaymentReference("");
      setAccountPaymentNote("");
    });
  }, [accountCustomerSearchResults, selectedAccountCustomerId]);

  useEffect(() => {
    const nextCollectionTenderMethods =
      snapshot?.availableTenderMethods.filter((method) => method.paymentMethod !== "STORE_CREDIT") ??
      [];
    const nextDefaultTenderMethodCode =
      nextCollectionTenderMethods.find((method) => method.paymentMethod === "CASH")
        ?.tenderMethodCode ??
      nextCollectionTenderMethods[0]?.tenderMethodCode ??
      "";

    if (nextCollectionTenderMethods.length === 0) {
      if (!accountPaymentTenderMethodCode) {
        return;
      }

      startTransition(() => {
        setAccountPaymentTenderMethodCode("");
      });
      return;
    }

    const hasExistingTender = nextCollectionTenderMethods.some(
      (method) => method.tenderMethodCode === accountPaymentTenderMethodCode
    );

    if (hasExistingTender) {
      return;
    }

    startTransition(() => {
      setAccountPaymentTenderMethodCode(nextDefaultTenderMethodCode);
    });
  }, [accountPaymentTenderMethodCode, snapshot?.availableTenderMethods]);

  useEffect(() => {
    if (!snapshot || hasHydratedReceiptPrinterSettings || showLoginScreen) {
      return;
    }

    startTransition(() => {
      setReceiptPrinterNameDraft(snapshot.receiptPrinterSettings.selectedPrinterName ?? "");
      setReceiptSilentPrintEnabled(snapshot.receiptPrinterSettings.silentPrintEnabled);
      setReceiptAutoPrintOnComplete(snapshot.receiptPrinterSettings.autoPrintOnComplete);
      setHasHydratedReceiptPrinterSettings(true);
    });
  }, [hasHydratedReceiptPrinterSettings, showLoginScreen, snapshot]);

  useEffect(() => {
    if (!scannerKeepFocus || !activeOperatorSession || activeView !== "Sell") {
      return;
    }

    window.setTimeout(() => {
      if (isEditableFieldTarget(document.activeElement, scanInputRef.current)) {
        return;
      }

      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }, 0);
  }, [activeOperatorSession, activeView, scannerKeepFocus]);

  useEffect(() => {
    if (!showLoginScreen) {
      return;
    }

    window.setTimeout(() => {
      operatorLoginInputRef.current?.focus();
    }, 0);
  }, [showLoginScreen]);

  useEffect(() => {
    const nextDrawerTenderMethods = (snapshot?.availableTenderMethods ?? []).filter(
      (method) => method.allowOpenCashDrawer
    );

    if (nextDrawerTenderMethods.length === 0) {
      if (!cashDrawerTenderMethodCode) {
        return;
      }

      startTransition(() => {
        setCashDrawerTenderMethodCode("");
      });
      return;
    }

    const hasExistingDrawerTender = nextDrawerTenderMethods.some(
      (method) => method.tenderMethodCode === cashDrawerTenderMethodCode
    );

    if (hasExistingDrawerTender) {
      return;
    }

    startTransition(() => {
      setCashDrawerTenderMethodCode(nextDrawerTenderMethods[0]?.tenderMethodCode ?? "");
    });
  }, [cashDrawerTenderMethodCode, snapshot?.availableTenderMethods]);

  const printerOptions = useMemo(() => {
    const rows = new Map<
      string,
      {
        value: string;
        label: string;
      }
    >();

    rows.set("", {
      value: "",
      label: "Manual preview only"
    });

    for (const printer of availableReceiptPrinters) {
      rows.set(printer.name, {
        value: printer.name,
        label: `${printer.displayName}${printer.isDefault ? " • Default" : ""}`
      });
    }

    const currentSelection =
      receiptPrinterNameDraft.trim() ||
      snapshot?.receiptPrinterSettings.selectedPrinterName?.trim() ||
      "";

    if (currentSelection && !rows.has(currentSelection)) {
      rows.set(currentSelection, {
        value: currentSelection,
        label: `${currentSelection} • Saved on this desktop`
      });
    }

    return Array.from(rows.values());
  }, [
    availableReceiptPrinters,
    receiptPrinterNameDraft,
    snapshot?.receiptPrinterSettings.selectedPrinterName
  ]);

  if (showLoginScreen && snapshot) {
    return (
      <div className="desktop-login-shell">
        <section className="desktop-login-panel">
          <div className="desktop-login-intro">
            <div className="desktop-brand desktop-login-brand">
              <div className="desktop-brand-mark">R</div>
              <div>
                <p className="desktop-eyebrow">Flash ERP</p>
                <p className="desktop-title">Store Desktop</p>
              </div>
            </div>
            <p className="desktop-eyebrow">Operator access</p>
            <h1>Sign in to unlock this desktop</h1>
            <p className="desktop-subtle">
              This desktop behaves like the enterprise app now: the operator sign-in screen appears
              first, and the selling workspace only opens after a synced store user authenticates
              successfully on this device.
            </p>
            <div className="desktop-header-stack desktop-login-meta">
              <HealthBadge health={snapshot.health}>
                {snapshot.health === "healthy"
                  ? "Healthy"
                  : snapshot.health === "lagging"
                    ? "Lagging"
                    : "Attention"}
              </HealthBadge>
              <div className="desktop-pill">Node: {snapshot.nodeCode}</div>
              <div className="desktop-pill">Store: {snapshot.storeName}</div>
              <div className="desktop-pill">Terminal: {snapshot.terminalCode}</div>
            </div>
          </div>

          {banner ? <div className="desktop-banner desktop-banner-info">{banner}</div> : null}
          {error ? <div className="desktop-banner desktop-banner-error">{error}</div> : null}

          <article className="desktop-card desktop-login-card">
            <div className="desktop-card-header">
              <div>
                <p className="desktop-eyebrow">Sign in</p>
                <h2>Desktop operator session</h2>
              </div>
              <div className="desktop-mini-label">Locked</div>
            </div>

            {!isOperatorDirectoryReady ? (
              <div className="desktop-banner desktop-banner-info">
                No synced operator accounts are available on this desktop yet. Run a sync cycle to
                pull the store operator directory from enterprise, then sign in normally.
              </div>
            ) : null}

            <form
              className="desktop-login-form"
              onSubmit={(event) => {
                event.preventDefault();
                void signInOperator({
                  loginId: loginScreenLoginId,
                  password: loginScreenPassword
                });
              }}
            >
              <label className="desktop-field">
                <span>Login ID</span>
                <input
                  autoComplete="username"
                  className="desktop-input"
                  onChange={(event) => setLoginScreenLoginId(event.target.value)}
                  placeholder="hq.cashier or store.manager"
                  ref={operatorLoginInputRef}
                  spellCheck={false}
                  type="text"
                  value={loginScreenLoginId}
                />
              </label>
              <label className="desktop-field">
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  className="desktop-input"
                  onChange={(event) => setLoginScreenPassword(event.target.value)}
                  placeholder="Enter password"
                  type="password"
                  value={loginScreenPassword}
                />
              </label>
              <div className="desktop-login-actions">
                <button
                  className="desktop-primary-button desktop-login-submit"
                  disabled={isSessionBusy || !loginScreenLoginId.trim() || !loginScreenPassword.trim()}
                  type="submit"
                >
                  {isSessionBusy ? "Signing in..." : "Sign in"}
                </button>
                <button
                  className="desktop-secondary-button"
                  disabled={isBusy || isSessionBusy || !snapshot || !hasDesktopRuntime}
                  onClick={() =>
                    void runDesktopAction((desktopRuntime) => desktopRuntime.runSyncCycle())
                  }
                  type="button"
                >
                  {isBusy ? "Syncing..." : "Sync sign-in data"}
                </button>
              </div>
            </form>

            <div className="desktop-task-meta">
              <span>Synced operators: {numberFormatter.format(storeUsers.length)}</span>
              <span>
                Last sync: {snapshot.lastSyncAt ? formatRelativeTime(snapshot.lastSyncAt) : "Never"}
              </span>
              <span>
                Offline ready: {snapshot.offlineReady ? "Local writes available" : "Still preparing"}
              </span>
            </div>
          </article>
        </section>
      </div>
    );
  }

  const parsedPaymentDrafts = paymentDrafts.map((payment) => ({
    ...payment,
    parsedAmount: Number(payment.amount),
    tenderMethod:
      snapshot?.availableTenderMethods.find(
        (method) => method.tenderMethodCode === payment.tenderMethodCode
      ) ?? null
  }));
  const activeBasketCustomerId = snapshot?.activeBasket?.customerId ?? null;
  const hasAttachedCustomer = Boolean(activeBasketCustomerId);
  const activeBasketCustomer = activeBasketCustomerId
    ? customerSearchResults.find((customer) => customer.customerId === activeBasketCustomerId) ??
      accountCustomerSearchResults.find((customer) => customer.customerId === activeBasketCustomerId) ??
      null
    : null;
  const storeCreditDrafts = parsedPaymentDrafts.filter(
    (payment) => payment.tenderMethod?.paymentMethod === "STORE_CREDIT"
  );
  const storeCreditAmount = Number(
    storeCreditDrafts
      .reduce(
        (sum, payment) =>
          Number.isFinite(payment.parsedAmount) ? sum + payment.parsedAmount : sum,
        0
      )
      .toFixed(2)
  );
  const isStoreCreditTendered = storeCreditDrafts.length > 0 && storeCreditAmount > 0;
  const creditLimitAmount = activeBasketCustomer?.creditLimitAmount ?? null;
  const creditReceivableBalance = activeBasketCustomer?.receivableBalanceAmount ?? 0;
  const creditLimitRemaining =
    creditLimitAmount === null
      ? null
      : Number((creditLimitAmount - creditReceivableBalance).toFixed(2));
  const creditLimitShortfall =
    creditLimitRemaining === null
      ? 0
      : Number((storeCreditAmount - creditLimitRemaining).toFixed(2));
  const isCreditCustomerMissing = isStoreCreditTendered && !hasAttachedCustomer;
  const isCreditCustomerBlocked =
    isStoreCreditTendered &&
    activeBasketCustomer !== null &&
    activeBasketCustomer.allowCreditSales === false;
  const isCreditLimitExceeded =
    isStoreCreditTendered && creditLimitRemaining !== null && creditLimitShortfall > 0.01;
  const disableCheckoutForCredit =
    isCreditCustomerMissing || isCreditCustomerBlocked || isCreditLimitExceeded;
  const availableTenderMethods = snapshot?.availableTenderMethods ?? [];
  const cashDrawerEligibleTenderMethods = availableTenderMethods.filter(
    (method) => method.allowOpenCashDrawer
  );
  const selectedCashDrawerTenderMethod =
    cashDrawerEligibleTenderMethods.find(
      (method) => method.tenderMethodCode === cashDrawerTenderMethodCode
    ) ??
    cashDrawerEligibleTenderMethods[0] ??
    null;
  const loyaltySettings = snapshot?.loyaltySettings ?? null;
  const accountCollectionTenderMethods = availableTenderMethods.filter(
    (method) => method.paymentMethod !== "STORE_CREDIT"
  );
  const defaultAccountTenderMethodCode =
    accountCollectionTenderMethods.find((method) => method.paymentMethod === "CASH")?.tenderMethodCode ??
    accountCollectionTenderMethods[0]?.tenderMethodCode ??
    "";
  const totalDue = snapshot?.activeBasket?.totalAmount ?? 0;
  const settlementAmount = Number(Math.abs(totalDue).toFixed(2));
  const isRefundSettlement =
    snapshot?.activeBasket?.transactionType === "RETURN" ||
    (snapshot?.activeBasket?.transactionType === "EXCHANGE" && totalDue < 0);
  const isBalancedExchange =
    snapshot?.activeBasket?.transactionType === "EXCHANGE" && totalDue === 0;
  const settlementTenderMethods = isRefundSettlement
    ? availableTenderMethods.filter((method) => method.allowRefund)
    : availableTenderMethods;
  const defaultTenderMethodCode =
    (isRefundSettlement
      ? settlementTenderMethods.find((method) => method.paymentMethod === "CASH")?.tenderMethodCode ??
        settlementTenderMethods[0]?.tenderMethodCode
      : availableTenderMethods.find((method) => method.paymentMethod === "CASH")?.tenderMethodCode ??
        availableTenderMethods[0]?.tenderMethodCode) ?? "";
  const activeReceiptSourceTransactionId = snapshot?.activeBasket?.sourceTransactionId ?? null;
  const activeReceiptSourceTransactionNo = snapshot?.activeBasket?.sourceTransactionNo ?? null;
  const isReceiptLinkedBasket = Boolean(activeReceiptSourceTransactionId);
  const needsReceiptLinkedReturnEntry =
    Boolean(activeReceiptSourceTransactionId) &&
    (snapshot?.activeBasket?.transactionType === "RETURN" ||
      (snapshot?.activeBasket?.transactionType === "EXCHANGE" && exchangeLineIntent === "RETURN"));
  const canAddReceiptLinesToActiveBasket =
    receiptLookup !== null &&
    activeReceiptSourceTransactionId === receiptLookup.sourceTransactionId &&
    (snapshot?.activeBasket?.transactionType === "RETURN" ||
      snapshot?.activeBasket?.transactionType === "EXCHANGE");
  const totalTendered = Number(
    parsedPaymentDrafts
      .filter((payment) => Number.isFinite(payment.parsedAmount) && payment.parsedAmount > 0)
      .reduce((sum, payment) => sum + payment.parsedAmount, 0)
      .toFixed(2)
  );
  const loyaltyProgramLabel = loyaltySettings?.loyaltyProgramEnabled
    ? loyaltySettings.loyaltyRedemptionEnabled
      ? `Earn ${loyaltySettings.loyaltyPointsPerCurrencyUnit.toFixed(2)} pt(s) per currency unit, redeem in ${loyaltySettings.loyaltyRedemptionPointsStep}-point step(s).`
      : `Earn ${loyaltySettings.loyaltyPointsPerCurrencyUnit.toFixed(2)} pt(s) per currency unit. Redemption is disabled.`
    : "Enterprise loyalty is disabled for this store.";
  const remainingBalance = Number(Math.max(0, settlementAmount - totalTendered).toFixed(2));
  const computedChange = Number(Math.max(0, totalTendered - settlementAmount).toFixed(2));
  const receiptTemplateLabel =
    snapshot?.receiptSettings.templateMode === "linked"
      ? snapshot.receiptSettings.salesReceiptTemplateName ?? "Linked thermal template"
      : snapshot?.receiptSettings.templateMode === "legacy"
        ? "Legacy thermal template"
        : "Default thermal slip";
  const hasUnsavedReceiptPrinterSettings =
    (snapshot?.receiptPrinterSettings.selectedPrinterName ?? "") !== receiptPrinterNameDraft ||
    (snapshot?.receiptPrinterSettings.silentPrintEnabled ?? false) !== receiptSilentPrintEnabled ||
    (snapshot?.receiptPrinterSettings.autoPrintOnComplete ?? true) !== receiptAutoPrintOnComplete;
  const currentScanLineIntent =
    snapshot?.activeBasket?.transactionType === "RETURN"
      ? "RETURN"
      : snapshot?.activeBasket?.transactionType === "EXCHANGE"
        ? exchangeLineIntent
        : "SALE";
  const scanDraftSerialNumbers = parseSerialDraft(scanSerialDraft);
  const scanRequestedQuantity = Number(scanQuantity);
  const canShowSaleSerialAvailability = currentScanLineIntent === "SALE";
  const browseCategoryOptions = (snapshot?.productCategories ?? []).filter(
    (category) => !catalogBrowseDepartment || category.departmentCode === catalogBrowseDepartment
  );
  const inventoryBrowseCategoryOptions = (snapshot?.productCategories ?? []).filter(
    (category) => !inventoryBrowseDepartment || category.departmentCode === inventoryBrowseDepartment
  );
  const serialBrowseCategoryOptions = (snapshot?.productCategories ?? []).filter(
    (category) => !serialBrowseDepartment || category.departmentCode === serialBrowseDepartment
  );
  const taskCategoryOptions = (snapshot?.productCategories ?? []).filter(
    (category) => !taskBrowseDepartment || category.departmentCode === taskBrowseDepartment
  );
  const transferRequestTargets = snapshot?.transferRequestTargets ?? [];
  const transferRequestDrafts = snapshot?.transferRequestDrafts ?? [];
  const stockCountSessions = snapshot?.stockCountSessions ?? [];
  const selectedStockCountLocation =
    snapshot?.inventoryLocations.find((location) => location.locationCode === stockCountLocationCode) ??
    null;
  const selectedTransferRequestTarget =
    transferRequestTargets.find(
      (target) => target.sourceLocationCode === transferRequestSourceLocationCode
    ) ?? null;
  const selectedTransferRequestDestination =
    snapshot?.inventoryLocations.find(
      (location) => location.locationCode === transferRequestDestinationLocationCode
    ) ?? null;
  const filteredRecoveryTasks = (snapshot?.recoveryTasks ?? []).filter((task) => {
    if (taskBrowseDepartment && task.departmentCode !== taskBrowseDepartment) {
      return false;
    }

    if (taskBrowseCategory && task.categoryCode !== taskBrowseCategory) {
      return false;
    }

    const normalizedTaskQuery = taskBrowseQuery.trim().toUpperCase();

    if (!normalizedTaskQuery) {
      return true;
    }

    const haystacks = [
      task.title,
      task.instructions,
      task.transactionNo,
      task.productCode,
      task.productName,
      task.departmentCode,
      task.departmentName,
      task.categoryCode,
      task.categoryName,
      task.subcategory,
      task.serialNumbers.join(" "),
      task.locationCode,
      task.targetLocationCode,
      task.movementType,
      task.operatorNote
    ];

    return haystacks.some((value) => value?.toUpperCase().includes(normalizedTaskQuery));
  });

  return (
    <div className={activeViewClassName}>
      <aside className="desktop-rail">
        <div className="desktop-brand">
          <div className="desktop-brand-mark">R</div>
          <div>
            <p className="desktop-eyebrow">Flash ERP</p>
            <p className="desktop-title">Store Desktop</p>
          </div>
        </div>

        <nav className="desktop-nav">
          {navigationItems.map((item) => (
            <button
              aria-current={item === activeView ? "page" : undefined}
              className={`desktop-nav-item${item === activeView ? " is-active" : ""}`}
              key={item}
              onClick={() => setActiveView(item)}
              type="button"
            >
              <span>{navigationLabels[item].label}</span>
              <small>{navigationLabels[item].detail}</small>
            </button>
          ))}
        </nav>

        <div className="desktop-status-card">
          <p className="desktop-eyebrow">Local mode</p>
          <h2>Offline-first write path</h2>
          <p>
            The desktop node keeps sales durable locally, then syncs upstream and downstream when the network is available again.
          </p>
          {snapshot ? (
            <div className="desktop-status-stack">
              <div className="desktop-inline-chip">
                <span>Health</span>
                <HealthBadge health={snapshot.health} />
              </div>
              <div className="desktop-inline-chip">
                <span>Last sync</span>
                <strong>{formatRelativeTime(snapshot.lastSyncAt)}</strong>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="desktop-main">
        <header className="desktop-header">
          <div>
            <p className="desktop-eyebrow">{activeViewCopy.eyebrow}</p>
            <h1>{activeViewCopy.title}</h1>
            <p className="desktop-subtle">{activeViewCopy.description}</p>
          </div>

          <div className="desktop-header-stack">
            {snapshot ? (
              <HealthBadge health={snapshot.health}>
                {snapshot.health === "healthy"
                  ? "Healthy"
                  : snapshot.health === "lagging"
                    ? "Lagging"
                    : "Attention"}
              </HealthBadge>
            ) : null}
            <div className="desktop-pill">
              Node: {snapshot?.nodeCode ?? "Loading local node..."}
            </div>
          </div>
        </header>

        <section className="desktop-actions">
          {activeView === "Sell" ? (
            <button
              className="desktop-primary-button"
              disabled={canCaptureDemoSale}
              onClick={() =>
                void runDesktopAction((desktopRuntime) => desktopRuntime.captureDemoSale())
              }
              type="button"
            >
              Capture demo sale
            </button>
          ) : null}
          <button
            className={isTouchMode ? "desktop-primary-button" : "desktop-secondary-button"}
            onClick={() => {
              const nextTouchMode = !isTouchMode;

              setIsTouchMode(nextTouchMode);

              if (!nextTouchMode) {
                setTouchKeyboardTarget(null);
              }
            }}
            type="button"
          >
            {isTouchMode ? "Touch mode on" : "Touch mode"}
          </button>
          <button
            className="desktop-secondary-button"
            disabled={isBusy || !snapshot || !hasDesktopRuntime}
            onClick={() =>
              void runDesktopAction((desktopRuntime) => desktopRuntime.runSyncCycle())
            }
            type="button"
          >
            Run sync cycle
          </button>
          <button
            className="desktop-secondary-button"
            disabled={isBusy || !snapshot || !hasDesktopRuntime}
            onClick={() =>
              void runDesktopAction((desktopRuntime) => desktopRuntime.requeueDeadLetters())
            }
            type="button"
          >
            Requeue failed
          </button>
        </section>

        {banner ? <div className="desktop-banner desktop-banner-info">{banner}</div> : null}
        {error ? <div className="desktop-banner desktop-banner-error">{error}</div> : null}

        {isTouchMode ? (
          <TouchKeypad
            onBackspace={backspaceTouchKeyboardValue}
            onClear={clearTouchKeyboardValue}
            onClose={() => setTouchKeyboardTarget(null)}
            onEnter={submitTouchKeyboardTarget}
            onInput={appendTouchKeyboardValue}
            target={touchKeyboardTarget}
          />
        ) : null}

        {snapshot ? (
          <>
            <section className="desktop-grid desktop-role-workspace-grid desktop-view-panel desktop-view-overview">
              <SectionCard
                eyebrow="Sales agent"
                title="Lane workspace"
                extra={
                  <div className="desktop-mini-label">
                    {activeShift ? activeShift.shiftNo : "Shift closed"}
                  </div>
                }
              >
                <div className="desktop-command-grid">
                  {salesAgentWorkstreams.map((workstream) => (
                    <button
                      className="desktop-command-card"
                      key={workstream.title}
                      onClick={() => setActiveView(workstream.view)}
                      type="button"
                    >
                      <strong>{workstream.title}</strong>
                      <span>{workstream.detail}</span>
                    </button>
                  ))}
                </div>
                <div className="desktop-role-summary">
                  <div>
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.completedSales)}</strong>
                    <span>completed sales</span>
                  </div>
                  <div>
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.parkedSales)}</strong>
                    <span>parked baskets</span>
                  </div>
                  <div>
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.openShifts)}</strong>
                    <span>open shifts</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Store / warehouse manager"
                title="Stock, EOD and reporting"
                extra={
                  <div className="desktop-mini-label">
                    {snapshot.queueMetrics.deadLetter > 0 ? "Queue review" : "Operational"}
                  </div>
                }
              >
                <div className="desktop-command-grid">
                  {managerWorkstreams.map((workstream) => (
                    <button
                      className="desktop-command-card"
                      key={workstream.title}
                      onClick={() => setActiveView(workstream.view)}
                      type="button"
                    >
                      <strong>{workstream.title}</strong>
                      <span>{workstream.detail}</span>
                    </button>
                  ))}
                </div>
                <div className="desktop-role-summary">
                  <div>
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.openPurchaseOrders)}</strong>
                    <span>open POs</span>
                  </div>
                  <div>
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.openInterStoreTransfers)}</strong>
                    <span>open transfers</span>
                  </div>
                  <div>
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.openStockCountSessions)}</strong>
                    <span>open counts</span>
                  </div>
                </div>
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-panels desktop-view-panel desktop-view-overview">
              <SectionCard
                eyebrow="End of day"
                title="Reconciliation and banking readiness"
                extra={
                  <div className="desktop-mini-label">
                    {activeShift ? "Shift open" : recentClosedShifts.length > 0 ? "Last close" : "No closeout"}
                  </div>
                }
              >
                {activeShift ? (
                  <div className="desktop-stack">
                    <div className="desktop-basket-footer">
                      <div className="desktop-inline-card">
                        <strong>Expected cash</strong>
                        <span>{currencyFormatter.format(activeShift.expectedCashAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Non-cash</strong>
                        <span>{currencyFormatter.format(activeShift.nonCashTenderedAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Net sales</strong>
                        <span>{currencyFormatter.format(activeShift.netSalesAmount)}</span>
                      </div>
                    </div>
                    <div className="desktop-task-meta">
                      <span>Cashier: {activeShift.cashierCode}</span>
                      <span>{numberFormatter.format(activeShift.transactionCount)} transaction(s)</span>
                      <span>Opened {formatRelativeTime(activeShift.openedAt)}</span>
                    </div>
                    <div className="desktop-task-actions desktop-basket-actions">
                      <button
                        className="desktop-primary-button"
                        onClick={() => setActiveView("Sell")}
                        type="button"
                      >
                        Open cash reconciliation
                      </button>
                    </div>
                  </div>
                ) : recentClosedShifts.length > 0 ? (
                  <div className="desktop-stack">
                    <div className="desktop-basket-footer">
                      <div className="desktop-inline-card">
                        <strong>{recentClosedShifts[0].shiftNo}</strong>
                        <span>Closed {formatRelativeTime(recentClosedShifts[0].closedAt)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Declared cash</strong>
                        <span>
                          {currencyFormatter.format(
                            recentClosedShifts[0].declaredCashAmount ?? 0
                          )}
                        </span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Variance</strong>
                        <span>
                          {currencyFormatter.format(recentClosedShifts[0].varianceAmount ?? 0)}
                        </span>
                      </div>
                    </div>
                    <div className="desktop-task-meta">
                      <span>Net sales: {currencyFormatter.format(recentClosedShifts[0].netSalesAmount)}</span>
                      <span>Cash: {currencyFormatter.format(recentClosedShifts[0].cashTenderedAmount)}</span>
                      <span>
                        Non-cash: {currencyFormatter.format(recentClosedShifts[0].nonCashTenderedAmount)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No local closeout yet</strong>
                    <span>Open a shift from the sales lane before preparing EOD reconciliation.</span>
                  </div>
                )}
                {reconciliationTargetShift ? (
                  <div className="desktop-stack">
                    <div className="desktop-form-grid">
                      <label className="desktop-field">
                        <span>EOD declared cash</span>
                        <input
                          className="desktop-input"
                          min="0"
                          onChange={(event) => setEodDeclaredCashAmount(event.target.value)}
                          onFocus={() => {
                            if (isTouchMode) {
                              setTouchKeyboardTarget("eodDeclaredCash");
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={eodDeclaredCashAmount}
                        />
                      </label>
                      <label className="desktop-field">
                        <span>Reconciled by</span>
                        <input
                          className="desktop-input"
                          onChange={(event) => setEodOperatorName(event.target.value)}
                          placeholder="Manager or supervisor"
                          value={eodOperatorName}
                        />
                      </label>
                      <label className="desktop-field">
                        <span>EOD note</span>
                        <input
                          className="desktop-input"
                          onChange={(event) => setEodNote(event.target.value)}
                          placeholder="Optional variance note"
                          value={eodNote}
                        />
                      </label>
                      <button
                        className="desktop-primary-button"
                        disabled={isBusy || !hasDesktopRuntime}
                        onClick={() => void recordEodReconciliation()}
                        type="button"
                      >
                        Record EOD
                      </button>
                    </div>

                    {snapshot.recentEodReconciliations.length > 0 ? (
                      <div className="desktop-list">
                        {snapshot.recentEodReconciliations.map((reconciliation) => (
                          <div className="desktop-task-item" key={reconciliation.reconciliationId}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{reconciliation.reconciliationNo}</strong>
                                <p className="desktop-card-copy">
                                  {reconciliation.shiftNo} · cashier {reconciliation.cashierCode}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {currencyFormatter.format(reconciliation.varianceAmount)} variance
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              <span>Declared: {currencyFormatter.format(reconciliation.declaredCashAmount)}</span>
                              <span>Expected: {currencyFormatter.format(reconciliation.expectedCashAmount)}</span>
                              <span>{numberFormatter.format(reconciliation.transactionCount)} transaction(s)</span>
                              <span>{reconciliation.syncedAt ? "Synced" : "Queued"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {bankingProgressRows.length > 0 ? (
                      <div className="desktop-list">
                        {bankingProgressRows.map((item) => (
                          <div className="desktop-task-item" key={`progress-${item.reconciliation.reconciliationId}`}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{item.reconciliation.reconciliationNo}</strong>
                                <p className="desktop-card-copy">
                                  {item.reconciliation.shiftNo} · cashier {item.reconciliation.cashierCode}
                                </p>
                              </div>
                              <span
                                className={`desktop-task-status ${
                                  item.fullyBanked ? "is-completed" : "is-warning"
                                }`}
                              >
                                {item.fullyBanked ? "Fully banked" : "Banking pending"}
                              </span>
                            </div>
                            <div className="desktop-progress-track">
                              <span
                                className="desktop-progress-fill"
                                style={{
                                  width: `${Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      item.reconciliation.declaredCashAmount > 0
                                        ? (item.depositedAmount / item.reconciliation.declaredCashAmount) * 100
                                        : 0
                                    )
                                  )}%`
                                }}
                              />
                            </div>
                            <div className="desktop-task-meta">
                              <span>Banked: {currencyFormatter.format(item.depositedAmount)}</span>
                              <span>Remaining: {currencyFormatter.format(item.remainingAmount)}</span>
                              <span>Variance: {currencyFormatter.format(item.reconciliation.varianceAmount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="desktop-form-grid">
                      <label className="desktop-field">
                        <span>Banking reconciliation</span>
                        <select
                          className="desktop-input desktop-select"
                          disabled={snapshot.recentEodReconciliations.length === 0}
                          onChange={(event) =>
                            setSelectedBankingReconciliationId(event.target.value)
                          }
                          value={selectedBankingReconciliationId}
                        >
                          <option value="">Choose EOD</option>
                          {snapshot.recentEodReconciliations.map((reconciliation) => (
                            <option
                              key={reconciliation.reconciliationId}
                              value={reconciliation.reconciliationId}
                            >
                              {reconciliation.reconciliationNo} · {reconciliation.shiftNo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="desktop-field">
                        <span>Deposit amount</span>
                        <input
                          className="desktop-input"
                          min="0"
                          onChange={(event) => setBankingDepositAmount(event.target.value)}
                          onFocus={() => {
                            if (isTouchMode) {
                              setTouchKeyboardTarget("bankingDepositAmount");
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={bankingDepositAmount}
                        />
                      </label>
                      <button
                        className="desktop-secondary-button"
                        disabled={!selectedBankingReconciliation || remainingBankingCash <= 0}
                        onClick={() => setBankingDepositAmount(remainingBankingCash.toFixed(2))}
                        type="button"
                      >
                        Use remaining
                      </button>
                      <label className="desktop-field">
                        <span>Bank</span>
                        <input
                          className="desktop-input"
                          onChange={(event) => setBankingBankName(event.target.value)}
                          placeholder="Bank or cash office"
                          value={bankingBankName}
                        />
                      </label>
                      <label className="desktop-field">
                        <span>Reference</span>
                        <input
                          className="desktop-input"
                          onChange={(event) => setBankingReference(event.target.value)}
                          placeholder="Slip or deposit reference"
                          value={bankingReference}
                        />
                      </label>
                      <label className="desktop-field">
                        <span>Banked by</span>
                        <input
                          className="desktop-input"
                          onChange={(event) => setBankingOperatorName(event.target.value)}
                          placeholder="Manager or cashier"
                          value={bankingOperatorName}
                        />
                      </label>
                      <button
                        className="desktop-primary-button"
                        disabled={
                          isBusy ||
                          !hasDesktopRuntime ||
                          !selectedBankingReconciliation ||
                          remainingBankingCash <= 0
                        }
                        onClick={() => void recordBankingDeposit()}
                        type="button"
                      >
                        Record banking
                      </button>
                    </div>
                    {selectedBankingReconciliation ? (
                      <div className="desktop-inline-card">
                        <strong>Banking balance</strong>
                        <span>
                          {currencyFormatter.format(remainingBankingCash)} remaining from{" "}
                          {selectedBankingReconciliation.reconciliationNo}.
                        </span>
                      </div>
                    ) : null}
                    {snapshot.recentBankingDeposits.length > 0 ? (
                      <div className="desktop-list">
                        {snapshot.recentBankingDeposits.map((deposit) => (
                          <div className="desktop-task-item" key={deposit.depositId}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{deposit.depositNo}</strong>
                                <p className="desktop-card-copy">
                                  {deposit.reconciliationNo} · {deposit.shiftNo}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {currencyFormatter.format(deposit.amount)}
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              {deposit.bankName ? <span>Bank: {deposit.bankName}</span> : null}
                              {deposit.reference ? <span>Ref: {deposit.reference}</span> : null}
                              <span>{deposit.syncedAt ? "Synced" : "Queued"}</span>
                              <span>{formatRelativeTime(deposit.depositedAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard
                eyebrow="Reporting"
                title="Manager operating snapshot"
                extra={<div className="desktop-mini-label">{formatRelativeTime(snapshot.generatedAt)}</div>}
              >
                <div className="desktop-basket-footer">
                  <div className="desktop-inline-card">
                    <strong>{currencyFormatter.format(activeShift?.netSalesAmount ?? 0)}</strong>
                    <span>current shift net sales</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.openSalesOrders)}</strong>
                    <span>open sales orders</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>{numberFormatter.format(snapshot.operationsMetrics.availableUnits)}</strong>
                    <span>available units</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>{numberFormatter.format(snapshot.queueMetrics.upstreamQueued)}</strong>
                    <span>waiting upstream</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>{numberFormatter.format(snapshot.recentEodReconciliations.length)}</strong>
                    <span>recent EODs</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>{currencyFormatter.format(snapshot.operationsMetrics.bankedAmount)}</strong>
                    <span>banked total</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>{currencyFormatter.format(snapshot.operationsMetrics.pendingBankingAmount)}</strong>
                    <span>pending banking</span>
                  </div>
                </div>
                <div className="desktop-task-actions desktop-basket-actions">
                  <button
                    className="desktop-secondary-button"
                    onClick={() => setActiveView("Inventory")}
                    type="button"
                  >
                    Open stock reports
                  </button>
                  <button
                    className="desktop-secondary-button"
                    onClick={() => setActiveView("Sync")}
                    type="button"
                  >
                    Open sync reports
                  </button>
                </div>
              </SectionCard>
            </section>

            <section className="desktop-pos-workstation desktop-view-panel desktop-view-sell">
              <div className="desktop-pos-topbar">
                <div className="desktop-pos-location">
                  <span>Location</span>
                  <strong>{posLocationLabel}</strong>
                </div>
                <div className="desktop-pos-clock">{posClockLabel}</div>
                <div className="desktop-pos-session">
                  <span>{activeShift ? activeShift.shiftNo : "Shift closed"}</span>
                  <strong>{signedInOperatorLabel ?? activeOperatorSession?.loginId ?? "Operator"}</strong>
                </div>
                <div className="desktop-pos-health">
                  <HealthBadge health={snapshot.health}>
                    {snapshot.health === "healthy"
                      ? "Online"
                      : snapshot.health === "lagging"
                        ? "Lagging"
                        : "Check"}
                  </HealthBadge>
                </div>
              </div>

              <div className="desktop-pos-body">
                <div className="desktop-pos-sale-panel">
                  <div className="desktop-pos-customer-row">
                    <div className="desktop-pos-customer">
                      <span>Customer</span>
                      <strong>{posCustomerLabel}</strong>
                    </div>
                    <button
                      className="desktop-pos-icon-button"
                      onClick={() => setActiveView("Sell")}
                      title="Attach customer"
                      type="button"
                    >
                      +
                    </button>
                  </div>

                  <div className="desktop-pos-scan-row">
                    <input
                      className="desktop-pos-scan-input"
                      onChange={(event) => setScanQuery(event.target.value)}
                      onFocus={() => {
                        if (isTouchMode) {
                          setTouchKeyboardTarget("scanQuery");
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitScannerQuery();
                        }
                      }}
                      placeholder="Scan barcode or enter item"
                      ref={scanInputRef}
                      value={scanQuery}
                    />
                    <input
                      className="desktop-pos-qty-input"
                      min={scanResult?.isSerialized ? "1" : "0.001"}
                      onChange={(event) => setScanQuantity(event.target.value)}
                      onFocus={() => {
                        if (isTouchMode) {
                          setTouchKeyboardTarget("scanQuantity");
                        }
                      }}
                      step={scanResult?.isSerialized ? "1" : "0.001"}
                      type="number"
                      value={scanQuantity}
                    />
                    <button
                      className="desktop-pos-icon-button is-accept"
                      disabled={
                        isBusy ||
                        isLookupBusy ||
                        !activeShift ||
                        !scanQuery.trim() ||
                        Number(scanQuantity) <= 0 ||
                        needsReceiptLinkedReturnEntry
                      }
                      onClick={() => void addScannerItemToBasket()}
                      title="Add item"
                      type="button"
                    >
                      +
                    </button>
                  </div>

                  <div className="desktop-pos-cart">
                    <div className="desktop-pos-cart-head">
                      <span>#</span>
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Price</span>
                      <span>Total</span>
                      <span />
                    </div>
                    {posBasketLines.length > 0 ? (
                      posBasketLines.map((line, index) => (
                        <div className="desktop-pos-cart-row" key={line.lineId}>
                          <span>{index + 1}</span>
                          <div>
                            <strong>{line.productName}</strong>
                            <small>{line.productCode}</small>
                          </div>
                          <span>{numberFormatter.format(line.quantity)}</span>
                          <span>{currencyFormatter.format(line.unitPrice)}</span>
                          <strong>{currencyFormatter.format(line.lineTotal)}</strong>
                          <button
                            className="desktop-pos-row-action"
                            disabled={isBusy}
                            onClick={() => void removeBasketLine(line.lineId)}
                            title="Remove line"
                            type="button"
                          >
                            x
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="desktop-pos-empty-cart">
                        <strong>No items in the sale</strong>
                        <span>Scan or choose a product tile to stage the next line.</span>
                      </div>
                    )}
                  </div>

                  <div className="desktop-pos-tender-row">
                    {availableTenderMethods.slice(0, 4).map((method) => (
                      <button
                        className="desktop-pos-tender"
                        disabled={isBusy || !posBasket || posBasket.lines.length === 0}
                        key={method.tenderMethodCode}
                        onClick={() =>
                          setPaymentDrafts([
                            createPaymentDraft(settlementAmount.toFixed(2), method.tenderMethodCode)
                          ])
                        }
                        type="button"
                      >
                        {method.tenderMethodName}
                      </button>
                    ))}
                    {availableTenderMethods.length === 0 ? (
                      <span className="desktop-pos-muted">Tender sync pending</span>
                    ) : null}
                  </div>

                  <div className="desktop-pos-total-strip">
                    <div>
                      <span>Items</span>
                      <strong>{numberFormatter.format(posBasket?.itemCount ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Discount</span>
                      <strong>{currencyFormatter.format(posBasket?.discountAmount ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Tax</span>
                      <strong>{currencyFormatter.format(posBasket?.taxAmount ?? 0)}</strong>
                    </div>
                    <div className="is-payable">
                      <span>Total payable</span>
                      <strong>{currencyFormatter.format(posBasket?.totalAmount ?? 0)}</strong>
                    </div>
                  </div>
                </div>

                <div className="desktop-pos-product-panel">
                  <div className="desktop-pos-filter-row">
                    <input
                      className="desktop-pos-search"
                      onChange={(event) => setCatalogBrowseQuery(event.target.value)}
                      placeholder="Search product by name, sku, or barcode"
                      value={catalogBrowseQuery}
                    />
                    <select
                      className="desktop-pos-select"
                      onChange={(event) => setCatalogBrowseDepartment(event.target.value)}
                      value={catalogBrowseDepartment}
                    >
                      <option value="">All departments</option>
                      {snapshot.productDepartments.map((department) => (
                        <option key={department.departmentCode} value={department.departmentCode}>
                          {department.departmentName}
                        </option>
                      ))}
                    </select>
                    <select
                      className="desktop-pos-select"
                      disabled={!catalogBrowseDepartment}
                      onChange={(event) => setCatalogBrowseCategory(event.target.value)}
                      value={catalogBrowseCategory}
                    >
                      <option value="">
                        {catalogBrowseDepartment ? "All categories" : "Select category"}
                      </option>
                      {browseCategoryOptions.map((category) => (
                        <option key={category.categoryCode} value={category.categoryCode}>
                          {category.categoryName}
                        </option>
                      ))}
                    </select>
                    <button
                      className="desktop-pos-icon-button"
                      disabled={isCatalogBrowseBusy}
                      onClick={() => void runCatalogBrowse()}
                      title="Refresh products"
                      type="button"
                    >
                      {isCatalogBrowseBusy ? "..." : "+"}
                    </button>
                  </div>

                  <div className="desktop-pos-product-grid">
                    {posCatalogTiles.length > 0 ? (
                      posCatalogTiles.map((item) => (
                        <button
                          className="desktop-pos-product-tile"
                          disabled={isBusy || isLookupBusy}
                          key={item.productCode}
                          onClick={() => void stageCatalogBrowseItem(item)}
                          type="button"
                        >
                          <span className="desktop-pos-product-image">NO IMAGE</span>
                          <strong>{item.productName}</strong>
                          <small>{item.productCode}</small>
                          <span>
                            Stock {numberFormatter.format(item.salesLocationQuantity ?? item.quantityOnHand)}
                          </span>
                          <b>{currencyFormatter.format(item.unitPrice)}</b>
                        </button>
                      ))
                    ) : (
                      <div className="desktop-pos-product-empty">
                        <strong>No local products found</strong>
                        <span>Refresh the browser or clear the filters.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="desktop-pos-actionbar">
                <button
                  className="desktop-pos-danger"
                  disabled={isBusy || !posBasket}
                  onClick={() =>
                    void runDesktopAction((desktopRuntime) => desktopRuntime.parkActiveBasket())
                  }
                  type="button"
                >
                  Hold
                </button>
                <button
                  className="desktop-pos-secondary"
                  disabled={
                    isBusy ||
                    !hasDesktopRuntime ||
                    !posBasket ||
                    posBasket.transactionType !== "SALE" ||
                    posBasket.lines.length === 0
                  }
                  onClick={() => void createSalesOrderFromActiveBasket()}
                  type="button"
                >
                  Save order
                </button>
                <button
                  className="desktop-pos-secondary"
                  disabled={isBusy}
                  onClick={() => {
                    startTransition(() => {
                      setScanQuery("");
                      setScanQuantity("1");
                      setScanSerialDraft("");
                      setScanResult(null);
                      setError(null);
                    });
                    refocusScanField();
                  }}
                  type="button"
                >
                  Clear
                </button>
                <div className="desktop-pos-payable">
                  <span>Total payable</span>
                  <strong>{currencyFormatter.format(posBasket?.totalAmount ?? 0)}</strong>
                </div>
                <button
                  className="desktop-pos-pay"
                  disabled={isBusy || disableCheckoutForCredit || !posBasket || posBasket.lines.length === 0}
                  onClick={() => void checkoutBasket()}
                  type="button"
                >
                  Pay
                </button>
              </div>
            </section>

            <section className="desktop-grid desktop-panels desktop-view-panel desktop-view-sell">
              <SectionCard
                eyebrow="Security"
                title="Desktop operator session"
                extra={
                  <div className="desktop-mini-label">
                    {activeOperatorSession ? "Signed in" : "Locked"}
                  </div>
                }
              >
                <div className="desktop-stack">
                  <div className="desktop-inline-card">
                    <strong>
                      {activeOperatorSession
                        ? `${signedInOperatorLabel ?? activeOperatorSession.loginId} is signed in`
                        : "No operator is signed in on this desktop"}
                    </strong>
                    <span>
                      {activeOperatorSession
                        ? "Flash ERP now ties cashier actions, inventory workflows, and receipt reprints to the active local operator session."
                        : "Sign in with a synced store user before opening a shift or running permission-gated lane and inventory workflows."}
                    </span>
                  </div>

                  {activeOperatorSession ? (
                    <>
                      <div className="desktop-task-meta">
                        <span>Login: {activeOperatorSession.loginId}</span>
                        <span>Roles: {activeOperatorRoleLabel}</span>
                        <span>Session opened: {formatRelativeTime(activeOperatorSession.openedAt)}</span>
                        <span>Last activity: {formatRelativeTime(activeOperatorSession.lastSeenAt)}</span>
                      </div>
                      <div className="desktop-basket-footer">
                        <div className="desktop-inline-card">
                          <strong>Cashier-ready</strong>
                          <span>
                            {activeOperatorCapabilities?.cashierEligible
                              ? activeOperatorCapabilities.canOpenShift
                                ? "This operator can open and run cashier shifts on this node."
                                : "This operator is marked cashier-eligible but is missing shift-open permission."
                              : "This operator is not cashier-enabled for local lane work."}
                          </span>
                        </div>
                        <div className="desktop-inline-card">
                          <strong>Supervisor override</strong>
                          <span>
                            {activeOperatorCapabilities?.canApproveNoReceiptReturn
                              ? "Can approve receipt-less return and exchange corrections."
                              : "Cannot approve manual correction overrides on this node."}
                          </span>
                        </div>
                        <div className="desktop-inline-card">
                          <strong>Inventory access</strong>
                          <span>
                            {activeOperatorCapabilities?.hasInventoryVisibility
                              ? "Can view store inventory and serial posture offline."
                              : "Inventory views remain locked for this operator."}
                          </span>
                        </div>
                      </div>
                      {activeShift && !activeOperatorOwnsShift ? (
                        <div className="desktop-inline-card">
                          <strong>Another cashier owns the open shift</strong>
                          <span>
                            {activeShift.shiftNo} is currently open for{" "}
                            {activeShiftCashierUser
                              ? formatStoreUserLabel(activeShiftCashierUser)
                              : activeShift.cashierCode}
                            . Sign back in as that cashier before continuing POS work on this
                            desktop.
                          </span>
                        </div>
                      ) : null}
                      <div className="desktop-task-actions">
                        <button
                          className="desktop-secondary-button"
                          disabled={
                            isBusy ||
                            isSessionBusy ||
                            (Boolean(activeShift) && activeOperatorOwnsShift)
                          }
                          onClick={() => void signOutOperator()}
                          type="button"
                        >
                          Sign out operator
                        </button>
                      </div>
                      {activeShift && activeOperatorOwnsShift ? (
                        <div className="desktop-inline-card">
                          <strong>Shift close required before sign-out</strong>
                          <span>
                            Close {activeShift.shiftNo} first so the cashier shift and active
                            desktop session stay aligned.
                          </span>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="desktop-auth-grid">
                      <label className="desktop-field">
                        <span>Login ID</span>
                        <input
                          autoComplete="username"
                          className="desktop-input"
                          onChange={(event) => setOperatorLoginDraft(event.target.value)}
                          placeholder="hq.cashier or store.manager"
                          value={operatorLoginDraft}
                        />
                      </label>
                      <label className="desktop-field">
                        <span>Password</span>
                        <input
                          autoComplete="current-password"
                          className="desktop-input"
                          onChange={(event) => setOperatorPasswordDraft(event.target.value)}
                          placeholder="Enter password"
                          type="password"
                          value={operatorPasswordDraft}
                        />
                      </label>
                      <button
                        className="desktop-primary-button desktop-auth-submit"
                        disabled={
                          isBusy ||
                          isSessionBusy ||
                          !operatorLoginDraft.trim() ||
                          !operatorPasswordDraft.trim()
                        }
                        onClick={() => void signInOperator()}
                        type="button"
                      >
                        {isSessionBusy ? "Signing in..." : "Sign in"}
                      </button>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Sell lane"
                title="Scanner-ready checkout"
                extra={<div className="desktop-mini-label">{snapshot.terminalCode}</div>}
              >
                <div className="desktop-inline-card">
                  <strong>How this lane works</strong>
                  <span>
                    Scan a barcode or enter a product code, confirm the local posture, then add it
                    to the active basket or post it instantly into the offline store database.
                  </span>
                </div>
                <div className="desktop-task-meta">
                  <span>
                    Active mode:{" "}
                    {snapshot.activeBasket
                      ? formatTransactionTypeLabel(snapshot.activeBasket.transactionType)
                      : "Sale by default"}
                  </span>
                  {activeReceiptSourceTransactionNo ? (
                    <span>Source receipt: {activeReceiptSourceTransactionNo}</span>
                  ) : null}
                  {snapshot.activeBasket?.transactionType === "RETURN" ? (
                    <span>Return baskets restore stock locally and require exact refund tenders.</span>
                  ) : snapshot.activeBasket?.transactionType === "EXCHANGE" ? (
                    <span>
                      Exchange baskets can mix returned and replacement items and now support
                      either extra customer payment or a net refund back to the shopper.
                    </span>
                  ) : (
                    <span>Sale baskets validate available stock before checkout.</span>
                  )}
                  <span>
                    Scanner submit:{" "}
                    {
                      scannerSubmitModeOptions.find((option) => option.value === scannerSubmitMode)
                        ?.label
                    }
                  </span>
                  <span>Sticky focus: {scannerKeepFocus ? "Enabled" : "Disabled"}</span>
                  {lastScannerActionLabel && lastScannerActionAt ? (
                    <span>
                      Last scanner action: {lastScannerActionLabel} {formatRelativeTime(lastScannerActionAt)}
                    </span>
                  ) : null}
                </div>

                <div className="desktop-form-grid">
                  <label className="desktop-field">
                    <span>Scanner submit mode</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setScannerSubmitMode(event.target.value as ScannerSubmitMode)
                      }
                      value={scannerSubmitMode}
                    >
                      {scannerSubmitModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={scannerKeepFocus ? "desktop-primary-button" : "desktop-secondary-button"}
                    onClick={() => setScannerKeepFocus((current) => !current)}
                    type="button"
                  >
                    {scannerKeepFocus ? "Sticky scanner focus on" : "Enable sticky scanner focus"}
                  </button>
                  <button
                    className="desktop-secondary-button"
                    disabled={!scanQuery && !scanResult && !scanSerialDraft}
                    onClick={() => {
                      startTransition(() => {
                        setScanQuery("");
                        setScanQuantity("1");
                        setScanSerialDraft("");
                        setScanResult(null);
                        setError(null);
                      });
                      refocusScanField();
                    }}
                    type="button"
                  >
                    Clear scanner lane
                  </button>
                </div>

                {snapshot.activeBasket?.transactionType === "EXCHANGE" ? (
                  <div className="desktop-task-actions">
                    <button
                      className={
                        exchangeLineIntent === "RETURN"
                          ? "desktop-primary-button"
                          : "desktop-secondary-button"
                      }
                      disabled={isBusy || isLookupBusy}
                      onClick={() => setExchangeLineIntent("RETURN")}
                      type="button"
                    >
                      Returned item
                    </button>
                    <button
                      className={
                        exchangeLineIntent === "SALE"
                          ? "desktop-primary-button"
                          : "desktop-secondary-button"
                      }
                      disabled={isBusy || isLookupBusy}
                      onClick={() => setExchangeLineIntent("SALE")}
                      type="button"
                    >
                      Replacement item
                    </button>
                  </div>
                ) : null}

                <div className="desktop-form-grid">
                  <label className="desktop-field">
                    <span>Barcode or product code</span>
                    <input
                      className="desktop-input"
                      ref={scanInputRef}
                      onChange={(event) => setScanQuery(event.target.value)}
                      onFocus={() => {
                        if (isTouchMode) {
                          setTouchKeyboardTarget("scanQuery");
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitScannerQuery();
                        }
                      }}
                      placeholder="Scan barcode or enter product code, then press Enter"
                      value={scanQuery}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Quantity</span>
                    <input
                      className="desktop-input"
                      min={scanResult?.isSerialized ? "1" : "0.001"}
                      onChange={(event) => setScanQuantity(event.target.value)}
                      onFocus={() => {
                        if (isTouchMode) {
                          setTouchKeyboardTarget("scanQuantity");
                        }
                      }}
                      step={scanResult?.isSerialized ? "1" : "0.001"}
                      type="number"
                      value={scanQuantity}
                    />
                  </label>
                  <button
                    className="desktop-secondary-button"
                    disabled={isBusy || isLookupBusy}
                    onClick={() => void runLookup()}
                    type="button"
                  >
                    {isLookupBusy ? "Looking up..." : "Lookup item"}
                  </button>
                  <button
                    className="desktop-primary-button"
                    disabled={
                      isBusy ||
                      isLookupBusy ||
                      !activeShift ||
                      !scanQuery.trim() ||
                      Number(scanQuantity) <= 0 ||
                      needsReceiptLinkedReturnEntry
                    }
                    onClick={() => void addScannerItemToBasket()}
                    type="button"
                  >
                    {needsReceiptLinkedReturnEntry
                      ? "Add returned item from receipt"
                      : isBusy
                        ? "Adding..."
                        : "Add to basket"}
                  </button>
                  <button
                    className="desktop-secondary-button"
                    disabled={
                      isBusy ||
                      isLookupBusy ||
                      !activeShift ||
                      !scanQuery.trim() ||
                      Number(scanQuantity) <= 0
                    }
                    onClick={() => void captureScannerSale()}
                    type="button"
                  >
                    {isBusy ? "Capturing..." : "Instant sale"}
                  </button>
                </div>

                {scanResult ? (
                  <div className="desktop-match-card">
                    <div className="desktop-match-head">
                      <div>
                        <strong>{scanResult.productName}</strong>
                        <p className="desktop-card-copy">
                          {scanResult.productCode}
                          {scanResult.barcode ? ` • ${scanResult.barcode}` : ""}
                        </p>
                      </div>
                      <div className="desktop-mini-label">
                        {scanResult.matchedOn === "barcode" ? "Matched by barcode" : "Matched by code"}
                      </div>
                    </div>
                    <div className="desktop-task-meta">
                      <span>Sell price: {currencyFormatter.format(scanResult.unitPrice)}</span>
                      {scanResult.departmentName ? (
                        <span>
                          Department: {scanResult.departmentName}
                          {scanResult.departmentCode ? ` (${scanResult.departmentCode})` : ""}
                        </span>
                      ) : null}
                      {scanResult.categoryName ? (
                        <span>
                          Category: {scanResult.categoryName}
                          {scanResult.categoryCode ? ` (${scanResult.categoryCode})` : ""}
                        </span>
                      ) : null}
                      {scanResult.subcategory ? <span>Subcategory: {scanResult.subcategory}</span> : null}
                      {snapshot.activeBasket?.transactionType === "EXCHANGE" ? (
                        <span>Next line: {formatLineIntentLabel(exchangeLineIntent)}</span>
                      ) : null}
                      <span>Total on hand: {numberFormatter.format(scanResult.quantityOnHand)}</span>
                      {scanResult.salesLocationCode ? (
                        <span>
                          Sales position: {numberFormatter.format(scanResult.salesLocationQuantity ?? 0)} in{" "}
                          {scanResult.salesLocationCode}
                        </span>
                      ) : (
                        <span>No sales location default is configured locally.</span>
                      )}
                      {scanResult.barcodeType ? <span>Barcode type: {scanResult.barcodeType}</span> : null}
                    </div>
                    {scanResult.isSerialized ? (
                      <div className="desktop-serial-panel">
                        <div className="desktop-serial-copy">
                          <strong>Serialized item control</strong>
                          <span>
                            Flash ERP requires one serial number per whole unit before this line can
                            post. Enter {numberFormatter.format(scanDraftSerialNumbers.length)} of{" "}
                            {Number.isFinite(scanRequestedQuantity) ? scanQuantity : "the required"} serial
                            number(s) for this {currentScanLineIntent === "RETURN" ? "return" : "sale"}.
                          </span>
                        </div>
                        {canShowSaleSerialAvailability ? (
                          <div className="desktop-stack-compact">
                            <span className="desktop-serial-caption">Available serials in the local sales position</span>
                            <SerialChipList
                              emptyLabel="No locally available serials were found."
                              serialNumbers={scanResult.availableSerialNumbers}
                            />
                          </div>
                        ) : (
                          <div className="desktop-inline-card">
                            <strong>Return validation</strong>
                            <span>
                              Manual serialized returns can still be entered here, but Flash ERP will
                              only accept serials already known as sold locally. Receipt-linked returns
                              remain the safer path.
                            </span>
                          </div>
                        )}
                        <label className="desktop-field">
                          <span>
                            {currentScanLineIntent === "RETURN"
                              ? "Serial numbers to return"
                              : "Serial numbers to sell"}
                          </span>
                          <textarea
                            className="desktop-input desktop-textarea"
                            onChange={(event) => setScanSerialDraft(event.target.value)}
                            placeholder="Enter one serial per line or separate with commas"
                            rows={3}
                            value={scanSerialDraft}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No current lookup result</strong>
                    <span>
                      Once Flash ERP finds a local match, the sell lane will show scanner details
                      and stock posture here before you capture the sale.
                    </span>
                  </div>
                )}

                <div className="desktop-stack">
                  <div className="desktop-inline-card">
                    <strong>Offline catalog browser</strong>
                    <span>
                      Browse the locally synced assortment by department and category when a cashier
                      needs guided lookup instead of an exact barcode scan.
                    </span>
                  </div>
                  <div className="desktop-form-grid">
                    <label className="desktop-field">
                      <span>Search catalog</span>
                      <input
                        className="desktop-input"
                        onChange={(event) => setCatalogBrowseQuery(event.target.value)}
                        placeholder="Search by code, name, category, or barcode"
                        value={catalogBrowseQuery}
                      />
                    </label>
                    <label className="desktop-field">
                      <span>Department</span>
                      <select
                        className="desktop-input desktop-select"
                        onChange={(event) => setCatalogBrowseDepartment(event.target.value)}
                        value={catalogBrowseDepartment}
                      >
                        <option value="">All departments</option>
                        {snapshot.productDepartments.map((department) => (
                          <option key={department.departmentCode} value={department.departmentCode}>
                            {department.departmentName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="desktop-field">
                      <span>Category</span>
                      <select
                        className="desktop-input desktop-select"
                        disabled={!catalogBrowseDepartment}
                        onChange={(event) => setCatalogBrowseCategory(event.target.value)}
                        value={catalogBrowseCategory}
                      >
                        <option value="">
                          {catalogBrowseDepartment ? "All categories" : "Select department first"}
                        </option>
                        {browseCategoryOptions.map((category) => (
                          <option key={category.categoryCode} value={category.categoryCode}>
                            {category.categoryName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="desktop-field">
                      <span>Serialized only</span>
                      <select
                        className="desktop-input desktop-select"
                        onChange={(event) => setCatalogBrowseSerializedOnly(event.target.value === "YES")}
                        value={catalogBrowseSerializedOnly ? "YES" : "NO"}
                      >
                        <option value="NO">All products</option>
                        <option value="YES">Serialized only</option>
                      </select>
                    </label>
                    <button
                      className="desktop-secondary-button"
                      disabled={isCatalogBrowseBusy}
                      onClick={() => void runCatalogBrowse()}
                      type="button"
                    >
                      {isCatalogBrowseBusy ? "Refreshing..." : "Refresh browser"}
                    </button>
                  </div>
                  {catalogBrowseResults.length > 0 ? (
                    <div className="desktop-list">
                      {catalogBrowseResults.map((item) => (
                        <div className="desktop-task-item" key={item.productCode}>
                          <div className="desktop-task-head">
                            <div>
                              <strong>{item.productName}</strong>
                              <p className="desktop-card-copy">
                                {item.productCode}
                                {item.barcode ? ` • ${item.barcode}` : ""}
                              </p>
                            </div>
                            <div className="desktop-mini-label">
                              {currencyFormatter.format(item.unitPrice)}
                            </div>
                          </div>
                          <div className="desktop-task-meta">
                            <span>{item.departmentName ?? "Unassigned department"}</span>
                            <span>{item.categoryName ?? "Unassigned category"}</span>
                            {item.subcategory ? <span>{item.subcategory}</span> : null}
                            <span>On hand: {numberFormatter.format(item.quantityOnHand)}</span>
                            {item.salesLocationCode ? (
                              <span>
                                Sales floor: {numberFormatter.format(item.salesLocationQuantity ?? 0)} in{" "}
                                {item.salesLocationCode}
                              </span>
                            ) : null}
                            {item.isSerialized ? <span>Serialized</span> : <span>Standard</span>}
                          </div>
                          <div className="desktop-task-actions">
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isLookupBusy || isBusy}
                              onClick={() => void stageCatalogBrowseItem(item)}
                              type="button"
                            >
                              Stage in sell lane
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="desktop-inline-card">
                      <strong>No matching local products</strong>
                      <span>
                        Adjust the hierarchy filters or search term and Flash ERP will narrow the
                        local assortment again.
                      </span>
                    </div>
                  )}
                </div>

                <div className="desktop-stack">
                  <div className="desktop-inline-card">
                    <strong>Receipt-linked corrections</strong>
                    <span>
                      Search by receipt, customer, cashier, item, or barcode, then reprint the
                      slip or start the next return or exchange from the exact local source sale.
                    </span>
                  </div>
                  <div className="desktop-form-grid">
                    <label className="desktop-field">
                      <span>Receipt finder</span>
                      <input
                        className="desktop-input"
                        onChange={(event) => setReceiptQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void runReceiptSearch();
                          }
                        }}
                        placeholder="Receipt no, customer, cashier, item, or barcode"
                        value={receiptQuery}
                      />
                    </label>
                    <label className="desktop-field">
                      <span>Search window</span>
                      <select
                        className="desktop-input desktop-select"
                        onChange={(event) => setReceiptSearchWindowDays(event.target.value)}
                        value={receiptSearchWindowDays}
                      >
                        {receiptSearchWindowOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="desktop-field">
                      <span>Receipt type</span>
                      <select
                        className="desktop-input desktop-select"
                        onChange={(event) =>
                          setReceiptSearchTransactionFilter(
                            event.target.value as StoreReceiptSearchTransactionFilter
                          )
                        }
                        value={receiptSearchTransactionFilter}
                      >
                        {receiptSearchTransactionFilterOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="desktop-secondary-button"
                      disabled={isBusy || isReceiptSearchBusy}
                      onClick={() => void runReceiptSearch()}
                      type="button"
                    >
                      {isReceiptSearchBusy ? "Searching..." : "Search receipts"}
                    </button>
                    <button
                      className="desktop-secondary-button"
                      disabled={isBusy || isReceiptLookupBusy}
                      onClick={() => void runReceiptLookup()}
                      type="button"
                    >
                      {isReceiptLookupBusy ? "Opening..." : "Open correction source"}
                    </button>
                    <button
                      className="desktop-secondary-button"
                      disabled={isBusy || !receiptLookup?.sourceTransactionNo}
                      onClick={() =>
                        receiptLookup?.sourceTransactionNo
                          ? void openReceiptPrintWindow(receiptLookup.sourceTransactionNo)
                          : undefined
                      }
                      type="button"
                    >
                      Print receipt
                    </button>
                  </div>

                  {receiptSearchResults.length > 0 ? (
                    <div className="desktop-list">
                      {receiptSearchResults.map((result) => {
                        const correctionSourceTransactionNo =
                          getCorrectionSourceTransactionNo(result);

                        return (
                          <div className="desktop-task-item" key={result.transactionId}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{result.transactionNo}</strong>
                                <p className="desktop-card-copy">
                                  {formatTransactionTypeLabel(result.transactionType)} posted{" "}
                                  {formatRelativeTime(result.completedAt)}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {currencyFormatter.format(result.totalAmount)}
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              <span>
                                Customer:{" "}
                                {result.customerName ??
                                  result.customerNo ??
                                  "Walk-in / no local customer"}
                              </span>
                              {result.cashierCode ? (
                                <span>Cashier: {result.cashierCode}</span>
                              ) : null}
                              {result.shiftNo ? <span>Shift: {result.shiftNo}</span> : null}
                              {result.sourceTransactionNo ? (
                                <span>Source: {result.sourceTransactionNo}</span>
                              ) : null}
                              <span>{numberFormatter.format(result.lineCount)} line(s)</span>
                            </div>
                            {result.productPreview.length > 0 ? (
                              <div className="desktop-task-meta">
                                <span>Items: {result.productPreview.join(", ")}</span>
                              </div>
                            ) : null}
                            <div className="desktop-task-actions">
                              {correctionSourceTransactionNo ? (
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy || isReceiptLookupBusy}
                                  onClick={() => void runReceiptLookup(correctionSourceTransactionNo)}
                                  type="button"
                                >
                                  {getCorrectionSourceActionLabel(result.transactionType)}
                                </button>
                              ) : null}
                              {result.canStartReturn ? (
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy || Boolean(snapshot?.activeBasket)}
                                  onClick={() =>
                                    void startReceiptCorrectionBasket(
                                      "RETURN",
                                      result.transactionNo
                                    )
                                  }
                                  type="button"
                                >
                                  Start return
                                </button>
                              ) : null}
                              {result.canStartExchange ? (
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy || Boolean(snapshot?.activeBasket)}
                                  onClick={() =>
                                    void startReceiptCorrectionBasket(
                                      "EXCHANGE",
                                      result.transactionNo
                                    )
                                  }
                                  type="button"
                                >
                                  Start exchange
                                </button>
                              ) : null}
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy}
                                onClick={() => void openReceiptPrintWindow(result.transactionNo)}
                                type="button"
                              >
                                Reprint slip
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : hasSearchedReceipts && !isReceiptSearchBusy ? (
                    <div className="desktop-inline-card">
                      <strong>No matching completed receipts</strong>
                      <span>
                        Try a wider date window, switch the receipt type, or search by customer,
                        cashier, product code, barcode, or exact receipt number.
                      </span>
                    </div>
                  ) : null}

                  {receiptLookup ? (
                    <div className="desktop-stack">
                      <div className="desktop-inline-card">
                        <strong>Receipt {receiptLookup.sourceTransactionNo}</strong>
                        <span>
                          {formatTransactionTypeLabel(receiptLookup.transactionType)} posted{" "}
                          {formatRelativeTime(receiptLookup.completedAt)} with{" "}
                          {numberFormatter.format(receiptLookup.eligibleLineCount)} eligible line(s)
                          remaining for correction.
                        </span>
                        {receiptLookup.customerName ?? receiptLookup.customerNo ? (
                          <span>
                            Customer: {receiptLookup.customerName ?? "Unnamed customer"}
                            {receiptLookup.customerNo ? ` (${receiptLookup.customerNo})` : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="desktop-task-actions desktop-basket-actions">
                        <button
                          className="desktop-secondary-button"
                          disabled={
                            isBusy ||
                            isReceiptLookupBusy ||
                            !receiptLookup.canStartReturn ||
                            Boolean(snapshot?.activeBasket)
                          }
                          onClick={() => void startReceiptCorrectionBasket("RETURN")}
                          type="button"
                        >
                          Start return from receipt
                        </button>
                        <button
                          className="desktop-secondary-button"
                          disabled={
                            isBusy ||
                            isReceiptLookupBusy ||
                            !receiptLookup.canStartExchange ||
                            Boolean(snapshot?.activeBasket)
                          }
                          onClick={() => void startReceiptCorrectionBasket("EXCHANGE")}
                          type="button"
                        >
                          Start exchange from receipt
                        </button>
                        <button
                          className="desktop-secondary-button"
                          disabled={isBusy}
                          onClick={() => void openReceiptPrintWindow(receiptLookup.sourceTransactionNo)}
                          type="button"
                        >
                          Reprint thermal slip
                        </button>
                      </div>
                      <div className="desktop-list">
                        {receiptLookup.lines.map((line) => (
                          <div className="desktop-task-item" key={line.sourceLineId}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{line.productName}</strong>
                                <p className="desktop-card-copy">
                                  {line.productCode}
                                  {line.barcode ? ` • ${line.barcode}` : ""}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {currencyFormatter.format(line.lineTotal)}
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              <span>Sold: {numberFormatter.format(line.quantitySold)}</span>
                              <span>Returned: {numberFormatter.format(line.quantityReturned)}</span>
                              <span>Pending: {numberFormatter.format(line.quantityPending)}</span>
                              <span>
                                Available: {numberFormatter.format(line.quantityAvailableToReturn)}
                              </span>
                            </div>
                            {line.serialNumbers.length > 0 ? (
                              <div className="desktop-serial-panel">
                                <div className="desktop-stack-compact">
                                  <span className="desktop-serial-caption">Original sale serials</span>
                                  <SerialChipList
                                    emptyLabel="No serial snapshot was stored on the original line."
                                    serialNumbers={line.serialNumbers}
                                  />
                                </div>
                                <div className="desktop-stack-compact">
                                  <span className="desktop-serial-caption">Still returnable now</span>
                                  <SerialChipList
                                    emptyLabel="All original serials from this line are already consumed."
                                    serialNumbers={line.availableSerialNumbersToReturn}
                                  />
                                </div>
                              </div>
                            ) : null}
                            {canAddReceiptLinesToActiveBasket ? (
                              <div className="desktop-serial-action-grid">
                                <label className="desktop-field">
                                  <span>Return qty</span>
                                  <input
                                    className="desktop-input"
                                    min="0"
                                    onChange={(event) =>
                                      setReceiptLineQuantityDrafts((current) => ({
                                        ...current,
                                        [line.sourceLineId]: event.target.value
                                      }))
                                    }
                                    step={line.serialNumbers.length > 0 ? "1" : "0.001"}
                                    type="number"
                                    value={
                                      receiptLineQuantityDrafts[line.sourceLineId] ??
                                      String(Math.min(1, line.quantityAvailableToReturn))
                                    }
                                  />
                                </label>
                                {line.serialNumbers.length > 0 ? (
                                  <label className="desktop-field">
                                    <span>Serial numbers to return</span>
                                    <textarea
                                      className="desktop-input desktop-textarea"
                                      onChange={(event) =>
                                        setReceiptLineSerialDrafts((current) => ({
                                          ...current,
                                          [line.sourceLineId]: event.target.value
                                        }))
                                      }
                                      placeholder="Enter one return serial per line"
                                      rows={3}
                                      value={
                                        receiptLineSerialDrafts[line.sourceLineId] ??
                                        buildSuggestedSerialDraft(
                                          Math.min(1, line.quantityAvailableToReturn),
                                          line.availableSerialNumbersToReturn
                                        )
                                      }
                                    />
                                  </label>
                                ) : null}
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy || line.quantityAvailableToReturn <= 0}
                                  onClick={() => void addReceiptLineToBasket(line.sourceLineId)}
                                  type="button"
                                >
                                  Add returned item
                                </button>
                              </div>
                            ) : (
                              <div className="desktop-task-meta">
                                {line.quantityAvailableToReturn <= 0 ? (
                                  <span>This line has no remaining returnable quantity.</span>
                                ) : snapshot?.activeBasket ? (
                                  <span>
                                    Open a linked correction basket for this receipt before adding
                                    returned items.
                                  </span>
                                ) : (
                                  <span>
                                    Start a return or exchange from this receipt to add returned
                                    items line by line.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Active basket"
                title={
                  snapshot.activeBasket
                    ? `${formatTransactionTypeLabel(snapshot.activeBasket.transactionType)} basket ${snapshot.activeBasket.transactionNo}`
                    : "No active basket"
                }
                extra={
                  snapshot.activeBasket ? (
                    <div className="desktop-mini-label">
                      {formatTransactionTypeLabel(snapshot.activeBasket.transactionType)}
                    </div>
                  ) : undefined
                }
              >
                {snapshot.activeBasket ? (
                  <div className="desktop-stack">
                    <div className="desktop-inline-card">
                      <strong>Basket posture</strong>
                      <span>
                        {numberFormatter.format(snapshot.activeBasket.itemCount)} unit(s) across{" "}
                        {numberFormatter.format(snapshot.activeBasket.lineCount)} line(s), totaling{" "}
                        {currencyFormatter.format(Math.abs(snapshot.activeBasket.totalAmount))}{" "}
                        {snapshot.activeBasket.transactionType === "RETURN"
                          ? "to refund."
                          : snapshot.activeBasket.transactionType === "EXCHANGE"
                            ? snapshot.activeBasket.totalAmount > 0
                              ? "for the customer to pay."
                              : snapshot.activeBasket.totalAmount < 0
                                ? "to refund."
                                : "with no settlement difference."
                            : "to collect."}
                      </span>
                    </div>
                    {snapshot.activeBasket.sourceTransactionNo ? (
                      <div className="desktop-inline-card">
                        <strong>Source receipt</strong>
                        <span>
                          This correction basket is linked to receipt{" "}
                          {snapshot.activeBasket.sourceTransactionNo}. Flash ERP will only accept
                          returned lines that validate against that original sale.
                        </span>
                      </div>
                    ) : null}
                    <div className="desktop-inline-card">
                      <strong>Customer attachment</strong>
                      <span>
                        {snapshot.activeBasket.customerName ?? snapshot.activeBasket.customerNo
                          ? `${snapshot.activeBasket.customerName ?? "Unnamed customer"}${
                              snapshot.activeBasket.customerNo
                                ? ` (${snapshot.activeBasket.customerNo})`
                                : ""
                            } is attached to this basket.`
                          : "This basket is currently set to walk-in customer."}
                      </span>
                    </div>
                    <div className="desktop-inline-card">
                      <strong>Loyalty posture</strong>
                      <span>
                        {loyaltyProgramLabel}
                        {snapshot.activeBasket.customerId
                          ? snapshot.activeBasket.customerLoyaltyEnrolled
                            ? ` Attached customer balance: ${numberFormatter.format(snapshot.activeBasket.customerLoyaltyPointsBalance ?? 0)} pt(s).`
                            : " The attached customer is not enrolled for loyalty redemption."
                          : " Attach a customer before attempting redemption."}
                      </span>
                    </div>
                    <div className="desktop-form-grid">
                      <label className="desktop-field">
                        <span>Find customer</span>
                        <input
                          className="desktop-input"
                          onChange={(event) => setCustomerSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void runCustomerSearch();
                            }
                          }}
                          placeholder="Customer no, name, phone, or email"
                          value={customerSearchQuery}
                        />
                      </label>
                      <button
                        className="desktop-secondary-button"
                        disabled={isBusy || isCustomerSearchBusy}
                        onClick={() => void runCustomerSearch()}
                        type="button"
                      >
                        {isCustomerSearchBusy ? "Searching..." : "Refresh customers"}
                      </button>
                      <button
                        className="desktop-secondary-button"
                        disabled={
                          isBusy ||
                          (!snapshot.activeBasket.customerName && !snapshot.activeBasket.customerNo)
                        }
                        onClick={() => void attachCustomerToBasket(null)}
                        type="button"
                      >
                        Clear to walk-in
                      </button>
                    </div>
                    {customerSearchResults.length > 0 ? (
                      <div className="desktop-list">
                        {customerSearchResults.map((customer) => {
                          const isAttached =
                            snapshot.activeBasket?.customerId === customer.customerId;
                          const isActiveCustomer = customer.status === "ACTIVE";

                          return (
                            <div className="desktop-task-item" key={customer.customerId}>
                              <div className="desktop-task-head">
                                <div>
                                  <strong>{customer.fullName}</strong>
                                  <p className="desktop-card-copy">
                                    {customer.customerNo} • {customer.customerType}
                                  </p>
                                </div>
                                <div className="desktop-mini-label">
                                  {isAttached ? "Attached" : isActiveCustomer ? "Available" : customer.status}
                                </div>
                              </div>
                              <div className="desktop-task-meta">
                                {customer.phone ? <span>Phone: {customer.phone}</span> : null}
                                {customer.email ? <span>Email: {customer.email}</span> : null}
                                {customer.homeStoreName ? (
                                  <span>Home store: {customer.homeStoreName}</span>
                                ) : null}
                                {customer.loyaltyEnrolled ? (
                                  <span>
                                    Loyalty: {customer.loyaltyPointsBalance} pts
                                    {customer.loyaltyTier ? ` • ${customer.loyaltyTier}` : ""}
                                  </span>
                                ) : null}
                                {customer.allowCreditSales ? (
                                  <span>
                                    Credit: {currencyFormatter.format(customer.receivableBalanceAmount)}
                                    {customer.creditLimitAmount !== null
                                      ? ` / ${currencyFormatter.format(customer.creditLimitAmount)}`
                                      : ""}
                                  </span>
                                ) : null}
                                <span>Updated {formatRelativeTime(customer.updatedAt)}</span>
                              </div>
                              <div className="desktop-task-actions">
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy || isAttached || !isActiveCustomer}
                                  onClick={() => void attachCustomerToBasket(customer.customerId)}
                                  type="button"
                                >
                                  {isAttached
                                    ? "Attached"
                                    : isActiveCustomer
                                      ? "Attach customer"
                                      : "Inactive account"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="desktop-inline-card">
                        <strong>No local customers found</strong>
                        <span>
                          Flash ERP will show matching customers here once the local customer list
                          is available on this desktop.
                        </span>
                      </div>
                    )}
                    <div className="desktop-inline-card">
                      <strong>Loyalty redemption</strong>
                      <span>
                        {snapshot.activeBasket.loyaltyRedemptionAllowed ||
                        snapshot.activeBasket.loyaltyRedemptionPoints > 0
                          ? `Spend up to ${numberFormatter.format(snapshot.activeBasket.maxLoyaltyRedemptionPoints)} point(s), worth ${currencyFormatter.format(snapshot.activeBasket.maxLoyaltyRedemptionAmount)} on this basket.`
                          : snapshot.activeBasket.loyaltyRedemptionMessage ??
                            "This basket is not currently eligible for loyalty redemption."}
                      </span>
                    </div>
                    <div className="desktop-form-grid">
                      <label className="desktop-field">
                        <span>Redeem loyalty points</span>
                        <input
                          className="desktop-input"
                          min="0"
                          onChange={(event) => setBasketLoyaltyPointsDraft(event.target.value)}
                          placeholder={
                            snapshot.activeBasket.maxLoyaltyRedemptionPoints > 0
                              ? `Up to ${snapshot.activeBasket.maxLoyaltyRedemptionPoints} points`
                              : "No points available"
                          }
                          step="1"
                          type="number"
                          value={basketLoyaltyPointsDraft}
                        />
                      </label>
                      <div className="desktop-inline-card">
                        <strong>Applied</strong>
                        <span>
                          {snapshot.activeBasket.loyaltyRedemptionPoints > 0
                            ? `${numberFormatter.format(snapshot.activeBasket.loyaltyRedemptionPoints)} pt(s) = ${currencyFormatter.format(snapshot.activeBasket.loyaltyRedemptionAmount)}`
                            : "No loyalty redemption is applied to this basket yet."}
                        </span>
                      </div>
                      <div className="desktop-task-actions">
                        <button
                          className="desktop-secondary-button"
                          disabled={
                            isBusy ||
                            (!snapshot.activeBasket.loyaltyRedemptionAllowed &&
                              snapshot.activeBasket.loyaltyRedemptionPoints === 0)
                          }
                          onClick={() => void applyBasketLoyaltyRedemption()}
                          type="button"
                        >
                          Apply points
                        </button>
                        <button
                          className="desktop-secondary-button"
                          disabled={isBusy || snapshot.activeBasket.loyaltyRedemptionPoints === 0}
                          onClick={() =>
                            void runDesktopAction((desktopRuntime) =>
                              desktopRuntime.setActiveBasketLoyaltyRedemption({
                                pointsToRedeem: 0
                              })
                            )
                          }
                          type="button"
                        >
                          Clear loyalty
                        </button>
                      </div>
                    </div>
                    {snapshot.activeBasket.lines.some(
                      (line) => line.lineIntent === "SALE" && !line.sourceLineId
                    ) ? (
                      <div className="desktop-stack">
                        <div className="desktop-inline-card">
                          <strong>Pricing override approval</strong>
                          <span>
                            Manual price and markdown changes on locally built sale lines require a
                            synced supervisor with the matching override privilege. Leave the manual
                            pricing fields blank to keep automatic pricing and promotions.
                          </span>
                        </div>
                        <div className="desktop-override-approval-grid">
                          <label className="desktop-field">
                            <span>Supervisor</span>
                            <select
                              className="desktop-input desktop-select"
                              onChange={(event) =>
                                setBasketPricingSupervisorCodeDraft(event.target.value)
                              }
                              value={basketPricingSupervisorCodeDraft}
                            >
                              <option value="">Choose supervisor</option>
                              {supervisorUsers.map((user) => (
                                <option key={user.userId} value={user.loginId}>
                                  {formatStoreUserLabel(user)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="desktop-field">
                            <span>Supervisor password</span>
                            <input
                              autoComplete="current-password"
                              className="desktop-input"
                              onChange={(event) =>
                                setBasketPricingSupervisorPasswordDraft(event.target.value)
                              }
                              placeholder="Required only when price or discount changes"
                              type="password"
                              value={basketPricingSupervisorPasswordDraft}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                    <div className="desktop-list">
                      {snapshot.activeBasket.lines.map((line) => {
                        const priceDraft =
                          basketPriceDrafts[line.lineId] ??
                          (line.hasManualPriceOverride ? line.unitPrice.toFixed(2) : "");
                        const discountDraft =
                          basketDiscountDrafts[line.lineId] ??
                          (line.hasManualDiscountOverride ? line.discountAmount.toFixed(2) : "");
                        const supportsPricingOverride =
                          line.lineIntent === "SALE" && !line.sourceLineId;
                        const parsedPriceDraft = priceDraft.trim() ? Number(priceDraft) : null;
                        const parsedDiscountDraft = discountDraft.trim() ? Number(discountDraft) : null;
                        const hasPriceDraftChange =
                          parsedPriceDraft !== null &&
                          Number.isFinite(parsedPriceDraft) &&
                          parsedPriceDraft !== line.unitPrice;
                        const hasDiscountDraftChange =
                          parsedDiscountDraft !== null &&
                          Number.isFinite(parsedDiscountDraft) &&
                          parsedDiscountDraft !== line.discountAmount;
                        const requiresPricingSupervisor =
                          supportsPricingOverride && (hasPriceDraftChange || hasDiscountDraftChange);

                        return (
                          <div className="desktop-basket-line" key={line.lineId}>
                            <div className="desktop-basket-line-head">
                              <div>
                                <strong>{line.productName}</strong>
                                <p className="desktop-card-copy">
                                  {line.productCode}
                                  {line.barcode ? ` • ${line.barcode}` : ""}
                                </p>
                              </div>
                              <div className="desktop-task-meta">
                                {snapshot.activeBasket?.transactionType === "EXCHANGE" ? (
                                  <div className="desktop-mini-label">
                                    {formatLineIntentLabel(line.lineIntent)}
                                  </div>
                                ) : null}
                                {line.sourceLineId ? (
                                  <div className="desktop-mini-label">From receipt</div>
                                ) : null}
                                {line.hasManualPriceOverride ? (
                                  <div className="desktop-mini-label">Price override</div>
                                ) : null}
                                {line.hasManualDiscountOverride ? (
                                  <div className="desktop-mini-label">Discount override</div>
                                ) : null}
                                <strong>{currencyFormatter.format(line.lineTotal)}</strong>
                              </div>
                            </div>
                            {line.isSerialized ? (
                              <div className="desktop-serial-panel">
                                <div className="desktop-stack-compact">
                                  <span className="desktop-serial-caption">Selected serials</span>
                                  <SerialChipList
                                    emptyLabel="No serials are currently attached to this line."
                                    serialNumbers={line.serialNumbers}
                                  />
                                </div>
                                <div className="desktop-stack-compact">
                                  <span className="desktop-serial-caption">Still valid for this line</span>
                                  <SerialChipList
                                    emptyLabel="No additional serials are available for this line."
                                    serialNumbers={line.availableSerialNumbers}
                                  />
                                </div>
                              </div>
                            ) : null}
                            {line.isSerialized ? (
                              <label className="desktop-field">
                                <span>Serial numbers</span>
                                <textarea
                                  className="desktop-input desktop-textarea"
                                  onChange={(event) =>
                                    setBasketSerialDrafts((current) => ({
                                      ...current,
                                      [line.lineId]: event.target.value
                                    }))
                                  }
                                  placeholder="Enter one serial per line"
                                  rows={3}
                                  value={basketSerialDrafts[line.lineId] ?? formatSerialDraft(line.serialNumbers)}
                                />
                              </label>
                            ) : null}
                            <div className="desktop-basket-line-controls">
                              <label className="desktop-field">
                                <span>Quantity</span>
                                <input
                                  className="desktop-input"
                                  min="0"
                                  onChange={(event) =>
                                    setBasketQuantityDrafts((current) => ({
                                      ...current,
                                      [line.lineId]: event.target.value
                                    }))
                                  }
                                  step={line.isSerialized ? "1" : "0.001"}
                                  type="number"
                                  value={basketQuantityDrafts[line.lineId] ?? String(line.quantity)}
                                />
                              </label>
                              <div className="desktop-task-meta">
                                <span>Unit: {currencyFormatter.format(line.unitPrice)}</span>
                                {line.discountAmount > 0 ? (
                                  <span>
                                    {line.appliedPromotionName
                                      ? `${line.appliedPromotionName}: `
                                      : "Discount: "}
                                    {currencyFormatter.format(line.discountAmount)}
                                  </span>
                                ) : null}
                                <span>Tax: {currencyFormatter.format(line.taxAmount)}</span>
                              </div>
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={
                                  isBusy ||
                                  (requiresPricingSupervisor &&
                                    (!basketPricingSupervisorCodeDraft.trim() ||
                                      !basketPricingSupervisorPasswordDraft.trim()))
                                }
                                onClick={() => void saveBasketLine(line.lineId)}
                                type="button"
                              >
                                Update
                              </button>
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy}
                                onClick={() => void removeBasketLine(line.lineId)}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                            {supportsPricingOverride ? (
                              <div className="desktop-line-override-grid">
                                <label className="desktop-field">
                                  <span>Manual unit price</span>
                                  <input
                                    className="desktop-input"
                                    min="0"
                                    onChange={(event) =>
                                      setBasketPriceDrafts((current) => ({
                                        ...current,
                                        [line.lineId]: event.target.value
                                      }))
                                    }
                                    placeholder="Blank keeps current pricing"
                                    step="0.01"
                                    type="number"
                                    value={priceDraft}
                                  />
                                </label>
                                <label className="desktop-field">
                                  <span>Manual discount</span>
                                  <input
                                    className="desktop-input"
                                    min="0"
                                    onChange={(event) =>
                                      setBasketDiscountDrafts((current) => ({
                                        ...current,
                                        [line.lineId]: event.target.value
                                      }))
                                    }
                                    placeholder="Blank keeps current discount"
                                    step="0.01"
                                    type="number"
                                    value={discountDraft}
                                  />
                                </label>
                                <label className="desktop-field desktop-line-override-note">
                                  <span>Override note</span>
                                  <input
                                    className="desktop-input"
                                    onChange={(event) =>
                                      setBasketOverrideNoteDrafts((current) => ({
                                        ...current,
                                        [line.lineId]: event.target.value
                                      }))
                                    }
                                    placeholder="Optional reason for audit history"
                                    value={basketOverrideNoteDrafts[line.lineId] ?? ""}
                                  />
                                </label>
                                <div className="desktop-task-meta">
                                  <span>
                                    Current unit price: {currencyFormatter.format(line.unitPrice)}
                                  </span>
                                  {line.hasManualPriceOverride || line.hasManualDiscountOverride ? (
                                    <span>Manual pricing is active on this line.</span>
                                  ) : (
                                    <span>Automatic promotions still apply until an override is saved.</span>
                                  )}
                                </div>
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={
                                    isBusy ||
                                    (!line.hasManualPriceOverride && !line.hasManualDiscountOverride)
                                  }
                                  onClick={() => void clearBasketLinePricing(line.lineId)}
                                  type="button"
                                >
                                  Reset pricing
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="desktop-basket-footer">
                      <div className="desktop-inline-card">
                        <strong>Subtotal</strong>
                        <span>{currencyFormatter.format(snapshot.activeBasket.subtotalAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Discount</strong>
                        <span>{currencyFormatter.format(snapshot.activeBasket.discountAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Tax</strong>
                        <span>{currencyFormatter.format(snapshot.activeBasket.taxAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Total due</strong>
                        <span>{currencyFormatter.format(snapshot.activeBasket.totalAmount)}</span>
                      </div>
                    </div>
                    {snapshot.activeBasket.appliedPromotions.length > 0 ? (
                      <div className="desktop-inline-card">
                        <strong>Applied promotions</strong>
                        <span>
                          {snapshot.activeBasket.appliedPromotions
                            .map(
                              (promotion) =>
                                `${promotion.promotionName} (${currencyFormatter.format(
                                  promotion.discountAmount
                                )})`
                            )
                            .join(" • ")}
                        </span>
                      </div>
                    ) : null}
                    <div className="desktop-stack">
                      <div className="desktop-inline-card">
                        <strong>
                          {isRefundSettlement
                            ? "Refunding"
                            : isBalancedExchange
                              ? "Settlement"
                            : "Tendering"}
                        </strong>
                        <span>
                          {isRefundSettlement
                            ? "Allocate the refund across cash, card reversal, mobile money, or other payout methods. Flash ERP requires the refund tenders to match the return total exactly."
                            : isBalancedExchange
                              ? "This exchange is currently balanced, so Flash ERP does not require a payment row to complete it."
                            : "Split the checkout across cash, card, mobile money, or other tenders. Flash ERP will only allow change when cash is part of the basket."}
                        </span>
                      </div>
                      {snapshot.activeBasket.transactionType === "EXCHANGE" && totalDue < 0 ? (
                        <div className="desktop-inline-card">
                          <strong>Exchange settlement note</strong>
                          <span>
                            This exchange currently ends in a net refund. Flash ERP will settle it
                            directly as a refund, using only tender methods that allow refund
                            payouts.
                          </span>
                        </div>
                      ) : null}
                        {isRefundSettlement && settlementAmount > 0 && settlementTenderMethods.length === 0 ? (
                          <div className="desktop-inline-card">
                            <strong>Refund tender required</strong>
                            <span>
                              No active refund-capable tender methods are currently synced to this
                              store node. Activate one at enterprise before completing this basket.
                            </span>
                          </div>
                        ) : null}
                        {isStoreCreditTendered ? (
                          <div className="desktop-inline-card">
                            <strong>Store credit check</strong>
                            <span>
                              {isCreditCustomerMissing
                                ? "Attach a customer before using Store Credit on this basket."
                                : !activeBasketCustomer && hasAttachedCustomer
                                  ? "Customer details are not fully hydrated yet. Sync this store to validate credit limits."
                                  : isCreditCustomerBlocked
                                  ? "This customer is not enabled for credit sales."
                                  : isCreditLimitExceeded
                                    ? `Store Credit exceeds the remaining limit by ${currencyFormatter.format(
                                        creditLimitShortfall
                                      )}.`
                                    : `Store Credit will post ${currencyFormatter.format(
                                        storeCreditAmount
                                      )} to the customer receivable balance.`}
                              {activeBasketCustomer && creditLimitRemaining !== null ? (
                                <> Remaining limit: {currencyFormatter.format(creditLimitRemaining)}.</>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                        {isBalancedExchange ? null : (
                        <div className="desktop-list">
                        {paymentDrafts.map((payment) => {
                          const paymentDraft = parsedPaymentDrafts.find(
                            (draft) => draft.id === payment.id
                          );

                          return (
                          <div className="desktop-payment-row" key={payment.id}>
                            <label className="desktop-field">
                              <span>Tender</span>
                              <select
                                className="desktop-input desktop-select"
                                onChange={(event) =>
                                  setPaymentDrafts((current) =>
                                    current.map((item) =>
                                      item.id === payment.id
                                        ? {
                                            ...item,
                                            tenderMethodCode: event.target.value
                                          }
                                        : item
                                    )
                                  )
                                }
                                value={payment.tenderMethodCode}
                              >
                                {settlementTenderMethods.length === 0 ? (
                                  <option value="">
                                    {isRefundSettlement
                                      ? "No refund-capable tender synced"
                                      : "Awaiting enterprise tender sync"}
                                  </option>
                                ) : (
                                    settlementTenderMethods.map((option) => (
                                      <option
                                        disabled={
                                          option.paymentMethod === "STORE_CREDIT" &&
                                          (!hasAttachedCustomer ||
                                            activeBasketCustomer?.allowCreditSales === false)
                                        }
                                        key={option.tenderMethodCode}
                                        value={option.tenderMethodCode}
                                      >
                                        {option.paymentMethod === "STORE_CREDIT" &&
                                        (!hasAttachedCustomer ||
                                          activeBasketCustomer?.allowCreditSales === false)
                                          ? `${option.tenderMethodName} (attach credit customer)`
                                          : `${option.tenderMethodName} (${option.paymentMethod})`}
                                      </option>
                                    ))
                                  )}
                                </select>
                              </label>
                            <label className="desktop-field">
                              <span>Amount</span>
                              <input
                                className="desktop-input"
                                min="0"
                                onChange={(event) =>
                                  setPaymentDrafts((current) =>
                                    current.map((item) =>
                                      item.id === payment.id
                                        ? { ...item, amount: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                step="0.01"
                                type="number"
                                value={payment.amount}
                              />
                            </label>
                            <label className="desktop-field">
                              <span>Reference</span>
                              <input
                                className="desktop-input"
                                onChange={(event) =>
                                  setPaymentDrafts((current) =>
                                    current.map((item) =>
                                      item.id === payment.id
                                        ? { ...item, reference: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder={
                                  paymentDraft?.tenderMethod?.requiresReference
                                    ? "Required reference"
                                    : paymentDraft?.tenderMethod?.paymentMethod === "CASH"
                                      ? "Optional cash note"
                                      : "Approval or wallet reference"
                                }
                                value={payment.reference}
                              />
                            </label>
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy || paymentDrafts.length === 1}
                              onClick={() =>
                                setPaymentDrafts((current) =>
                                  current.filter((item) => item.id !== payment.id)
                                )
                              }
                              type="button"
                            >
                              Remove tender
                            </button>
                          </div>
                          );
                        })}
                      </div>
                      )}
                      <div className="desktop-basket-payment-summary">
                        <div className="desktop-inline-card">
                          <strong>
                            {isRefundSettlement
                              ? "Refund assigned"
                              : isBalancedExchange
                                ? "Settlement"
                              : "Tendered"}
                          </strong>
                          <span>{currencyFormatter.format(isBalancedExchange ? 0 : totalTendered)}</span>
                        </div>
                        <div className="desktop-inline-card">
                          <strong>
                            {isRefundSettlement
                              ? "Refund remaining"
                              : isBalancedExchange
                                ? "Difference"
                              : "Remaining"}
                          </strong>
                          <span>{currencyFormatter.format(isBalancedExchange ? 0 : remainingBalance)}</span>
                        </div>
                        <div className="desktop-inline-card">
                          <strong>
                            {isRefundSettlement
                              ? "Excess refund"
                              : isBalancedExchange
                                ? "Change"
                              : "Change"}
                          </strong>
                          <span>{currencyFormatter.format(isBalancedExchange ? 0 : computedChange)}</span>
                        </div>
                      </div>
                      {isBalancedExchange ? null : (
                      <div className="desktop-task-actions desktop-basket-actions">
                        <button
                          className="desktop-secondary-button"
                          disabled={isBusy}
                          onClick={() =>
                            setPaymentDrafts((current) => [
                              ...current,
                              createPaymentDraft("", defaultTenderMethodCode)
                            ])
                          }
                          type="button"
                        >
                          Add tender row
                        </button>
                      </div>
                      )}
                    </div>
                    <div className="desktop-task-actions desktop-basket-actions">
                        <button
                          className="desktop-primary-button"
                          disabled={
                            isBusy ||
                            disableCheckoutForCredit ||
                            snapshot.activeBasket.lines.length === 0
                          }
                          onClick={() => void checkoutBasket()}
                          type="button"
                        >
                        {snapshot.activeBasket.transactionType === "RETURN"
                          ? "Complete return"
                          : snapshot.activeBasket.transactionType === "EXCHANGE"
                            ? "Complete exchange"
                          : "Checkout basket"}
                      </button>
                      <button
                        className="desktop-secondary-button"
                        disabled={isBusy || !hasDesktopRuntime}
                        onClick={() =>
                          void runDesktopAction((desktopRuntime) => desktopRuntime.parkActiveBasket())
                        }
                        type="button"
                      >
                        Park basket
                      </button>
                      <button
                        className="desktop-secondary-button"
                        disabled={
                          isBusy ||
                          !hasDesktopRuntime ||
                          snapshot.activeBasket.transactionType !== "SALE" ||
                          snapshot.activeBasket.lines.length === 0
                        }
                        onClick={() => void createSalesOrderFromActiveBasket()}
                        type="button"
                      >
                        Save order
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="desktop-stack">
                    <div className="desktop-inline-card">
                      <strong>No active basket</strong>
                      <span>
                        Scan or enter an item to start a sale basket, or open a return or exchange
                        basket first when the cashier is handling after-sale corrections.
                      </span>
                    </div>
                    <div className="desktop-inline-card">
                      <strong>Supervisor override</strong>
                      <span>
                        Manual return and exchange baskets now require a synced supervisor approval.
                        Receipt-linked corrections still start from receipt search without this extra
                        step.
                      </span>
                    </div>
                    {supervisorUsers.length > 0 ? (
                      <div className="desktop-form-grid">
                        <label className="desktop-field">
                          <span>Supervisor</span>
                          <select
                            className="desktop-input desktop-select"
                            onChange={(event) =>
                              setManualCorrectionSupervisorCodeDraft(event.target.value)
                            }
                            value={manualCorrectionSupervisorCodeDraft}
                          >
                            <option value="">Choose supervisor</option>
                            {supervisorUsers.map((user) => (
                              <option key={user.userId} value={user.loginId}>
                                {formatStoreUserLabel(user)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="desktop-field">
                          <span>Supervisor password</span>
                          <input
                            autoComplete="current-password"
                            className="desktop-input"
                            onChange={(event) =>
                              setManualCorrectionSupervisorPasswordDraft(event.target.value)
                            }
                            placeholder="Required for override approval"
                            type="password"
                            value={manualCorrectionSupervisorPasswordDraft}
                          />
                        </label>
                        <label className="desktop-field">
                          <span>Override note</span>
                          <input
                            className="desktop-input"
                            onChange={(event) =>
                              setManualCorrectionSupervisorNoteDraft(event.target.value)
                            }
                            placeholder="Optional reason for the receipt-less correction"
                            value={manualCorrectionSupervisorNoteDraft}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="desktop-inline-card">
                        <strong>No supervisors synced yet</strong>
                        <span>
                          Run a sync cycle after enterprise publishes users, roles, and permissions
                          to this desktop.
                        </span>
                      </div>
                    )}
                    <div className="desktop-task-actions desktop-basket-actions">
                      <button
                        className="desktop-secondary-button"
                        disabled={
                          isBusy ||
                          !activeShift ||
                          supervisorUsers.length === 0 ||
                          !manualCorrectionSupervisorCodeDraft.trim() ||
                          !manualCorrectionSupervisorPasswordDraft.trim()
                        }
                        onClick={() => void startManualReturnBasket()}
                        type="button"
                      >
                        Start return basket
                      </button>
                      <button
                        className="desktop-secondary-button"
                        disabled={
                          isBusy ||
                          !activeShift ||
                          supervisorUsers.length === 0 ||
                          !manualCorrectionSupervisorCodeDraft.trim() ||
                          !manualCorrectionSupervisorPasswordDraft.trim()
                        }
                        onClick={() => void startManualExchangeBasket()}
                        type="button"
                      >
                        Start exchange basket
                      </button>
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Shift control"
                title="Cash reconciliation"
                extra={
                  <div className="desktop-mini-label">
                    {activeShift ? activeShift.shiftNo : "No open shift"}
                  </div>
                }
              >
                {activeShift ? (
                  <div className="desktop-stack">
                    <div className="desktop-inline-card">
                      <strong>{activeShift.shiftNo} is active on this desktop</strong>
                      <span>
                        Reconcile the drawer against the expected local cash posture before closing
                        the lane. Flash ERP will keep the shift open until the basket queue is clear.
                      </span>
                    </div>
                    <div className="desktop-task-meta">
                      <span>
                        Cashier:{" "}
                        {activeShiftCashierUser
                          ? formatStoreUserLabel(activeShiftCashierUser)
                          : activeShift.cashierCode}
                      </span>
                      <span>Opened: {formatRelativeTime(activeShift.openedAt)}</span>
                      <span>
                        Transactions: {numberFormatter.format(activeShift.transactionCount)}
                      </span>
                      <span>Sales: {numberFormatter.format(activeShift.salesCount)}</span>
                      <span>Returns: {numberFormatter.format(activeShift.returnCount)}</span>
                      <span>Exchanges: {numberFormatter.format(activeShift.exchangeCount)}</span>
                    </div>
                    <div className="desktop-basket-footer">
                      <div className="desktop-inline-card">
                        <strong>Opening float</strong>
                        <span>{currencyFormatter.format(activeShift.openingFloatAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Expected cash</strong>
                        <span>{currencyFormatter.format(activeShift.expectedCashAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Cash movement</strong>
                        <span>{currencyFormatter.format(activeShift.cashTenderedAmount)}</span>
                      </div>
                      <div className="desktop-inline-card">
                        <strong>Non-cash movement</strong>
                        <span>{currencyFormatter.format(activeShift.nonCashTenderedAmount)}</span>
                      </div>
                    </div>
                    {activeShift.tenderTotals.length > 0 ? (
                      <div className="desktop-list">
                        {activeShift.tenderTotals.map((tender) => (
                          <div
                            className="desktop-task-item"
                            key={`${tender.method}-${tender.tenderMethodCode ?? tender.tenderMethodName ?? "unmapped"}`}
                          >
                            <div className="desktop-task-head">
                              <div>
                                <strong>{tender.tenderMethodName ?? tender.method}</strong>
                                <p className="desktop-card-copy">
                                  {tender.tenderMethodCode ?? tender.method}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {currencyFormatter.format(tender.netAmount)}
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              <span>{numberFormatter.format(tender.transactionCount)} payment row(s)</span>
                              <span>Method: {tender.method}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="desktop-form-grid">
                      <label className="desktop-field">
                        <span>Declared cash</span>
                        <input
                          className="desktop-input"
                          min="0"
                          onChange={(event) => setShiftDeclaredCashDraft(event.target.value)}
                          onFocus={() => {
                            if (isTouchMode) {
                              setTouchKeyboardTarget("shiftDeclaredCash");
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={shiftDeclaredCashDraft}
                        />
                      </label>
                      <div className="desktop-inline-card">
                        <strong>Projected variance</strong>
                        <span>{currencyFormatter.format(shiftProjectedVariance)}</span>
                        <div className="desktop-task-actions">
                          <span
                            className={`desktop-task-status ${
                              shiftProjectedVarianceTone === "balanced"
                                ? "is-completed"
                                : shiftProjectedVarianceTone === "over"
                                  ? "is-warning"
                                  : "is-cancelled"
                            }`}
                          >
                            {shiftProjectedVarianceTone === "balanced"
                              ? "Balanced"
                              : shiftProjectedVarianceTone === "over"
                                ? "Over"
                                : "Short"}
                          </span>
                        </div>
                      </div>
                      <button
                        className="desktop-primary-button"
                        disabled={isBusy || Boolean(snapshot.activeBasket)}
                        onClick={() => void closeActiveShift()}
                        type="button"
                      >
                        Close shift
                      </button>
                    </div>
                    {snapshot.activeBasket ? (
                      <div className="desktop-inline-card">
                        <strong>Basket still active</strong>
                        <span>
                          Complete or park the active basket before closing this cashier shift.
                        </span>
                      </div>
                    ) : null}
                    <div className="desktop-checklist-grid">
                      <div
                        className={`desktop-checklist-item${
                          snapshot.activeBasket ? " is-warning" : " is-success"
                        }`}
                      >
                        <strong>{snapshot.activeBasket ? "Basket open" : "Basket clear"}</strong>
                        <span>
                          {snapshot.activeBasket
                            ? "Park or complete the active basket before final closeout."
                            : "The lane is clear for cashier closeout."}
                        </span>
                      </div>
                      <div
                        className={`desktop-checklist-item${
                          salesOrderStatusCounts.OPEN > 0 ? " is-warning" : " is-success"
                        }`}
                      >
                        <strong>
                          {salesOrderStatusCounts.OPEN > 0
                            ? `${numberFormatter.format(salesOrderStatusCounts.OPEN)} order(s) open`
                            : "Order queue clear"}
                        </strong>
                        <span>
                          {salesOrderStatusCounts.OPEN > 0
                            ? "Outstanding sales orders still need fulfilment or cancellation follow-up."
                            : "No local sales orders are waiting on the lane."}
                        </span>
                      </div>
                      <div
                        className={`desktop-checklist-item${
                          snapshot.queueMetrics.deadLetter > 0 ? " is-danger" : " is-success"
                        }`}
                      >
                        <strong>
                          {snapshot.queueMetrics.deadLetter > 0
                            ? `${numberFormatter.format(snapshot.queueMetrics.deadLetter)} dead-letter item(s)`
                            : "Queue clear"}
                        </strong>
                        <span>
                          {snapshot.queueMetrics.deadLetter > 0
                            ? "Resolve the blocked packet(s) before the next full reconciliation cycle."
                            : "No blocked queue items are currently slowing closeout."}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="desktop-stack">
                    <div className="desktop-inline-card">
                      <strong>No active cashier shift</strong>
                      <span>
                        Open a local shift before starting sales, returns, or exchanges so the
                        drawer posture and cashier accountability stay consistent offline.
                      </span>
                    </div>
                    {!activeOperatorSession ? (
                      <div className="desktop-inline-card">
                        <strong>Operator sign-in required</strong>
                        <span>
                          Sign in with a cashier-enabled store user first. Flash ERP will open the
                          shift against the active operator instead of letting the lane pick any
                          cashier from a free list.
                        </span>
                      </div>
                    ) : activeOperatorCapabilities?.cashierEligible &&
                      activeOperatorCapabilities.canOpenShift ? (
                      <div className="desktop-form-grid">
                        <div className="desktop-inline-card">
                          <strong>Cashier</strong>
                          <span>{signedInOperatorLabel ?? activeOperatorSession.loginId}</span>
                        </div>
                        <label className="desktop-field">
                          <span>Opening float</span>
                          <input
                            className="desktop-input"
                            min="0"
                            onChange={(event) => {
                              setHasEditedShiftOpeningFloatDraft(true);
                              setShiftOpeningFloatDraft(event.target.value);
                            }}
                            onFocus={() => {
                              if (isTouchMode) {
                                setTouchKeyboardTarget("shiftOpeningFloat");
                              }
                            }}
                            step="0.01"
                            type="number"
                            value={shiftOpeningFloatDraft}
                          />
                        </label>
                        <button
                          className="desktop-primary-button"
                          disabled={isBusy || isSessionBusy}
                          onClick={() => void openShift()}
                          type="button"
                        >
                          Open shift
                        </button>
                      </div>
                    ) : (
                      <div className="desktop-inline-card">
                        <strong>Signed-in operator cannot open cashier shift</strong>
                        <span>
                          Sign in with a synced user that is cashier-enabled and has both
                          `pos.shift.open` and `pos.sale.process` before opening the lane.
                        </span>
                      </div>
                    )}
                    {recentClosedShifts.length > 0 ? (
                      <div className="desktop-list">
                        {recentClosedShifts.map((shift) => (
                          <div className="desktop-task-item" key={shift.shiftId}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{shift.shiftNo}</strong>
                                <p className="desktop-card-copy">
                                  {userByLoginId.get(shift.cashierCode.trim().toUpperCase())
                                    ? formatStoreUserLabel(
                                        userByLoginId.get(shift.cashierCode.trim().toUpperCase())!
                                      )
                                    : shift.cashierCode}{" "}
                                  • closed {formatRelativeTime(shift.closedAt)}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {currencyFormatter.format(shift.varianceAmount ?? 0)}
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              <span>Expected: {currencyFormatter.format(shift.expectedCashAmount)}</span>
                              <span>
                                Declared: {currencyFormatter.format(shift.declaredCashAmount ?? 0)}
                              </span>
                              <span>
                                Transactions: {numberFormatter.format(shift.transactionCount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Customer accounts"
                title="Receivable collection"
                extra={
                  <div className="desktop-mini-label">
                    {recentCustomerAccountEntries.length} recent collection
                    {recentCustomerAccountEntries.length === 1 ? "" : "s"}
                  </div>
                }
              >
                <div className="desktop-stack">
                  <div className="desktop-inline-card">
                    <strong>Collect against receivables from the lane</strong>
                    <span>
                      Search a synced customer account, collect against the outstanding balance, and
                      let Flash ERP queue the settlement upstream during the next store sync.
                    </span>
                  </div>
                  {!activeShift ? (
                    <div className="desktop-inline-card">
                      <strong>Shift required</strong>
                      <span>
                        Open a cashier shift before collecting customer account payments so the
                        tender movement lands in local reconciliation.
                      </span>
                    </div>
                  ) : null}
                  {accountCollectionTenderMethods.length === 0 ? (
                    <div className="desktop-inline-card">
                      <strong>No collection tender available</strong>
                      <span>
                        Flash ERP needs at least one active non-credit tender method from
                        enterprise before the lane can collect customer payments.
                      </span>
                    </div>
                  ) : null}
                  <div className="desktop-form-grid">
                    <label className="desktop-field">
                      <span>Find customer account</span>
                      <input
                        className="desktop-input"
                        onChange={(event) => setAccountCustomerSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void runAccountCustomerSearch();
                          }
                        }}
                        placeholder="Customer no, name, phone, or email"
                        value={accountCustomerSearchQuery}
                      />
                    </label>
                    <button
                      className="desktop-secondary-button"
                      disabled={isBusy || isAccountCustomerSearchBusy}
                      onClick={() => void runAccountCustomerSearch()}
                      type="button"
                    >
                      {isAccountCustomerSearchBusy ? "Searching..." : "Refresh accounts"}
                    </button>
                    <button
                      className="desktop-secondary-button"
                      disabled={isBusy || !selectedAccountCustomer}
                      onClick={() => {
                        startTransition(() => {
                          setSelectedAccountCustomerId("");
                          setAccountPaymentAmount("");
                          setAccountPaymentReference("");
                          setAccountPaymentNote("");
                        });
                      }}
                      type="button"
                    >
                      Clear selection
                    </button>
                  </div>
                  {accountCustomerSearchResults.length > 0 ? (
                    <div className="desktop-list">
                      {accountCustomerSearchResults.map((customer) => {
                        const isSelected = selectedAccountCustomerId === customer.customerId;
                        const canCollect =
                          customer.status === "ACTIVE" && customer.receivableBalanceAmount > 0;

                        return (
                          <div className="desktop-task-item" key={customer.customerId}>
                            <div className="desktop-task-head">
                              <div>
                                <strong>{customer.fullName}</strong>
                                <p className="desktop-card-copy">
                                  {customer.customerNo} • {customer.customerType}
                                </p>
                              </div>
                              <div className="desktop-mini-label">
                                {isSelected
                                  ? "Selected"
                                  : canCollect
                                    ? "Collectable"
                                    : customer.status !== "ACTIVE"
                                      ? customer.status
                                      : "Settled"}
                              </div>
                            </div>
                            <div className="desktop-task-meta">
                              <span>
                                Receivable:{" "}
                                {currencyFormatter.format(customer.receivableBalanceAmount)}
                              </span>
                              {customer.loyaltyEnrolled ? (
                                <span>
                                  Loyalty: {customer.loyaltyPointsBalance} pts
                                  {customer.loyaltyTier ? ` • ${customer.loyaltyTier}` : ""}
                                </span>
                              ) : null}
                              {customer.phone ? <span>Phone: {customer.phone}</span> : null}
                              <span>Updated {formatRelativeTime(customer.updatedAt)}</span>
                            </div>
                            <div className="desktop-task-actions">
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy || !canCollect}
                                onClick={() => selectAccountCustomer(customer)}
                                type="button"
                              >
                                {isSelected ? "Selected" : canCollect ? "Collect payment" : "No balance"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="desktop-inline-card">
                      <strong>No customer accounts found</strong>
                      <span>
                        Flash ERP will show synced customer accounts here once the local customer
                        master is available on this desktop.
                      </span>
                    </div>
                  )}
                  {selectedAccountCustomer ? (
                    <div className="desktop-stack">
                      <div className="desktop-inline-card">
                        <strong>
                          Collecting for {selectedAccountCustomer.fullName} (
                          {selectedAccountCustomer.customerNo})
                        </strong>
                        <span>
                          Outstanding receivable balance is{" "}
                          {currencyFormatter.format(
                            selectedAccountCustomer.receivableBalanceAmount
                          )}
                          .
                        </span>
                      </div>
                      <div className="desktop-form-grid">
                        <label className="desktop-field">
                          <span>Tender</span>
                          <select
                            className="desktop-input desktop-select"
                            onChange={(event) =>
                              setAccountPaymentTenderMethodCode(event.target.value)
                            }
                            value={accountPaymentTenderMethodCode}
                          >
                            {accountCollectionTenderMethods.length === 0 ? (
                              <option value="">Awaiting tender sync</option>
                            ) : (
                              accountCollectionTenderMethods.map((method) => (
                                <option
                                  key={method.tenderMethodCode}
                                  value={method.tenderMethodCode}
                                >
                                  {method.tenderMethodName} ({method.paymentMethod})
                                </option>
                              ))
                            )}
                          </select>
                        </label>
                        <label className="desktop-field">
                          <span>Amount</span>
                          <input
                            className="desktop-input"
                            max={selectedAccountCustomer.receivableBalanceAmount}
                            min="0"
                            onChange={(event) => setAccountPaymentAmount(event.target.value)}
                            onFocus={() => {
                              if (isTouchMode) {
                                setTouchKeyboardTarget("accountPaymentAmount");
                              }
                            }}
                            step="0.01"
                            type="number"
                            value={accountPaymentAmount}
                          />
                        </label>
                        <label className="desktop-field">
                          <span>Reference</span>
                          <input
                            className="desktop-input"
                            onChange={(event) => setAccountPaymentReference(event.target.value)}
                            placeholder="Receipt, wallet, approval, or deposit reference"
                            value={accountPaymentReference}
                          />
                        </label>
                        <label className="desktop-field">
                          <span>Note</span>
                          <input
                            className="desktop-input"
                            onChange={(event) => setAccountPaymentNote(event.target.value)}
                            placeholder="Optional note for this collection"
                            value={accountPaymentNote}
                          />
                        </label>
                        <button
                          className="desktop-primary-button"
                          disabled={
                            isBusy ||
                            !activeShift ||
                            accountCollectionTenderMethods.length === 0 ||
                            !selectedAccountCustomerId ||
                            !accountPaymentTenderMethodCode.trim()
                          }
                          onClick={() => void recordCustomerAccountPayment()}
                          type="button"
                        >
                          Collect payment
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {recentCustomerAccountEntries.length > 0 ? (
                    <div className="desktop-list">
                      {recentCustomerAccountEntries.map((entry) => (
                        <div className="desktop-task-item" key={entry.entryId}>
                          <div className="desktop-task-head">
                            <div>
                              <strong>{entry.entryNo}</strong>
                              <p className="desktop-card-copy">
                                {entry.customerName} ({entry.customerNo})
                              </p>
                            </div>
                            <div className="desktop-mini-label">
                              {entry.syncedAt ? "Acknowledged" : "Awaiting sync"}
                            </div>
                          </div>
                          <div className="desktop-task-meta">
                            <span>{currencyFormatter.format(entry.amount)}</span>
                            <span>{entry.tenderMethodName ?? entry.paymentMethod}</span>
                            {entry.shiftNo ? <span>Shift: {entry.shiftNo}</span> : null}
                            {entry.reference ? <span>Ref: {entry.reference}</span> : null}
                            <span>Posted {formatRelativeTime(entry.occurredAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-panels desktop-view-panel desktop-view-sell">
              <SectionCard
                eyebrow="Sales agent"
                title="Quick lane actions"
                extra={
                  <div className="desktop-mini-label">
                    {isTouchMode ? "Touch mode" : "Keyboard mode"}
                  </div>
                }
              >
                <div className="desktop-lane-action-grid">
                  <button
                    className="desktop-lane-action"
                    onClick={() => {
                      if (isTouchMode) {
                        setTouchKeyboardTarget("scanQuery");
                      }

                      refocusScanField();
                    }}
                    type="button"
                  >
                    <strong>Focus scanner</strong>
                    <span>Keep the sell lane ready for the next barcode or product code.</span>
                  </button>
                  <button
                    className="desktop-lane-action"
                    disabled={isBusy || !snapshot.activeBasket}
                    onClick={() =>
                      void runDesktopAction((desktopRuntime) => desktopRuntime.parkActiveBasket())
                    }
                    type="button"
                  >
                    <strong>Park basket</strong>
                    <span>Move the current basket out of the lane without losing local progress.</span>
                  </button>
                  <button
                    className="desktop-lane-action"
                    disabled={
                      isBusy ||
                      !hasDesktopRuntime ||
                      !snapshot.activeBasket ||
                      snapshot.activeBasket.transactionType !== "SALE" ||
                      snapshot.activeBasket.lines.length === 0
                    }
                    onClick={() => void createSalesOrderFromActiveBasket()}
                    type="button"
                  >
                    <strong>Save order</strong>
                    <span>Turn the active sale basket into a local fulfilment order.</span>
                  </button>
                  <button
                    className="desktop-lane-action"
                    onClick={() => setActiveView("Returns")}
                    type="button"
                  >
                    <strong>Receipt search</strong>
                    <span>Jump into reversals, exchanges, and receipt-led corrections.</span>
                  </button>
                  <button
                    className="desktop-lane-action"
                    onClick={() => setActiveView("Overview")}
                    type="button"
                  >
                    <strong>Open closeout</strong>
                    <span>Review EOD reconciliation, banking progress, and manager reporting.</span>
                  </button>
                </div>
                <div className="desktop-role-summary">
                  <div>
                    <strong>{numberFormatter.format(salesOrderStatusCounts.OPEN)}</strong>
                    <span>open orders</span>
                  </div>
                  <div>
                    <strong>{currencyFormatter.format(snapshot.operationsMetrics.pendingBankingAmount)}</strong>
                    <span>pending banking</span>
                  </div>
                  <div>
                    <strong>{scannerKeepFocus ? "On" : "Off"}</strong>
                    <span>scanner focus</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Scanner posture"
                title="Local scanner coverage"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(snapshot.operationsMetrics.barcodeLinks)} links
                  </div>
                }
              >
                <div className="desktop-stack">
                  <div className="desktop-inline-card">
                    <strong>Barcode coverage</strong>
                    <span>
                      {numberFormatter.format(snapshot.operationsMetrics.barcodeLinks)} barcode link(s)
                      are currently hydrated into this store node for scanner-driven selling.
                    </span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>Catalog posture</strong>
                    <span>
                      {numberFormatter.format(snapshot.operationsMetrics.catalogItems)} catalog item(s)
                      are locally available, and new enterprise barcodes will flow down on the next
                      successful store pull.
                    </span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>Operator hint</strong>
                    <span>
                      If a known item does not scan locally, run a sync cycle first so Flash ERP can
                      pull the latest barcode publications from enterprise.
                    </span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Sales orders"
                title="Parked baskets and fulfilment queue"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(
                      snapshot.salesOrders.filter((order) => order.status === "OPEN").length
                    )}{" "}
                    open
                  </div>
                }
              >
                <div className="desktop-stack">
                  <div className="desktop-form-grid">
                    <label className="desktop-field">
                      <span>Order operator</span>
                      <input
                        className="desktop-input"
                        onChange={(event) => setSalesOrderOperatorName(event.target.value)}
                        placeholder="Operator or sales agent"
                        value={salesOrderOperatorName}
                      />
                    </label>
                    <label className="desktop-field">
                      <span>Order note</span>
                      <input
                        className="desktop-input"
                        onChange={(event) => setSalesOrderNote(event.target.value)}
                        placeholder="Optional customer reference"
                        value={salesOrderNote}
                      />
                    </label>
                    <button
                      className="desktop-primary-button"
                      disabled={
                        isBusy ||
                        !hasDesktopRuntime ||
                        !snapshot.activeBasket ||
                        snapshot.activeBasket.transactionType !== "SALE" ||
                        snapshot.activeBasket.lines.length === 0
                      }
                      onClick={() => void createSalesOrderFromActiveBasket()}
                      type="button"
                    >
                      Create order
                    </button>
                  </div>

                  <div className="desktop-filter-chip-row">
                    {(["OPEN", "FULFILLED", "CANCELLED", "ALL"] as const).map((status) => (
                      <button
                        className={`desktop-filter-chip${
                          salesOrderStatusFilter === status ? " is-active" : ""
                        }`}
                        key={status}
                        onClick={() => setSalesOrderStatusFilter(status)}
                        type="button"
                      >
                        {status === "ALL" ? "All" : toTitleCase(status)}
                        <span>
                          {numberFormatter.format(
                            salesOrderStatusCounts[status === "ALL" ? "ALL" : status]
                          )}
                        </span>
                      </button>
                    ))}
                  </div>

                  {filteredSalesOrders.length > 0 ? (
                    <div className="desktop-list">
                      {filteredSalesOrders.map((order) => (
                        <div className="desktop-task-item" key={order.orderId}>
                          <div className="desktop-task-head">
                            <div>
                              <strong>{order.orderNo}</strong>
                              <p className="desktop-card-copy">
                                Basket {order.sourceTransactionNo} ·{" "}
                                {numberFormatter.format(order.itemCount)} unit(s) across{" "}
                                {numberFormatter.format(order.lineCount)} line(s).
                              </p>
                            </div>
                            <span
                              className={`desktop-task-status ${
                                order.status === "OPEN"
                                  ? "is-open"
                                  : order.status === "FULFILLED"
                                    ? "is-completed"
                                    : "is-cancelled"
                              }`}
                            >
                              {toTitleCase(order.status)}
                            </span>
                          </div>
                          <div className="desktop-task-meta">
                            {order.customerName ?? order.customerNo ? (
                              <span>
                                Customer: {order.customerName ?? "Unnamed customer"}
                                {order.customerNo ? ` (${order.customerNo})` : ""}
                              </span>
                            ) : null}
                            <span>Value: {currencyFormatter.format(order.totalAmount)}</span>
                            {order.operatorName ? <span>Operator: {order.operatorName}</span> : null}
                            <span>{order.syncedAt ? "Synced" : "Queued"}</span>
                            <span>Created {formatRelativeTime(order.createdAt)}</span>
                            {order.fulfilledTransactionNo ? (
                              <span>Fulfilled by {order.fulfilledTransactionNo}</span>
                            ) : null}
                            {order.fulfilledAt ? (
                              <span>Fulfilled {formatRelativeTime(order.fulfilledAt)}</span>
                            ) : null}
                            {order.cancelledAt ? (
                              <span>Cancelled {formatRelativeTime(order.cancelledAt)}</span>
                            ) : null}
                            {order.note ? <span>Note: {order.note}</span> : null}
                          </div>
                          <div className="desktop-task-actions">
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy || !hasDesktopRuntime || order.status !== "OPEN"}
                              onClick={() =>
                                void runDesktopAction((desktopRuntime) =>
                                  desktopRuntime.resumeSalesOrder(order.orderId)
                                )
                              }
                              type="button"
                            >
                              Fulfil
                            </button>
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy || !hasDesktopRuntime || order.status !== "OPEN"}
                              onClick={() => void cancelSalesOrder(order.orderId)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="desktop-inline-card">
                      <strong>No matching sales orders</strong>
                      <span>
                        Create one from an active sale basket, then fulfil it back through the sell
                        lane.
                      </span>
                    </div>
                  )}
                </div>

                {snapshot.parkedBaskets.length > 0 ? (
                  <div className="desktop-list">
                    {snapshot.parkedBaskets.map((basket) => (
                      <div className="desktop-task-item" key={basket.transactionId}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{basket.transactionNo}</strong>
                            <p className="desktop-card-copy">
                              {numberFormatter.format(basket.itemCount)} unit(s) across{" "}
                              {numberFormatter.format(basket.lineCount)} line(s).
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {currencyFormatter.format(basket.totalAmount)}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          <span>Type: {formatTransactionTypeLabel(basket.transactionType)}</span>
                          {basket.sourceTransactionNo ? (
                            <span>Source receipt: {basket.sourceTransactionNo}</span>
                          ) : null}
                          {basket.customerName ?? basket.customerNo ? (
                            <span>
                              Customer: {basket.customerName ?? "Unnamed customer"}
                              {basket.customerNo ? ` (${basket.customerNo})` : ""}
                            </span>
                          ) : null}
                          <span>Updated {formatRelativeTime(basket.updatedAt)}</span>
                        </div>
                        <div className="desktop-task-actions">
                          <button
                            className="desktop-secondary-button desktop-compact-button"
                            disabled={isBusy || !hasDesktopRuntime}
                            onClick={() =>
                              void runDesktopAction((desktopRuntime) =>
                                desktopRuntime.resumeParkedBasket(basket.transactionId)
                              )
                            }
                            type="button"
                          >
                            Resume / fulfil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No parked baskets</strong>
                    <span>
                      Parked baskets will appear here so the cashier can resume them without losing
                      local progress.
                    </span>
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-metrics desktop-view-panel desktop-view-overview desktop-view-sync">
              {queueMetricCards.map((card) => (
                <SectionCard
                  eyebrow="Queue metric"
                  key={card.key}
                  title={numberFormatter.format(snapshot.queueMetrics[card.key])}
                  extra={
                    card.key === "deadLetter" && snapshot.queueMetrics.deadLetter > 0 ? (
                      <HealthBadge health="attention">review</HealthBadge>
                    ) : null
                  }
                >
                  <p>{card.label}</p>
                  <p className="desktop-card-copy">{card.hint}</p>
                </SectionCard>
              ))}
            </section>

            <section className="desktop-grid desktop-ops-grid desktop-view-panel desktop-view-overview desktop-view-sync">
              {operationsMetricCards.map((card) => (
                <SectionCard
                  eyebrow="Store ops"
                  key={card.key}
                  title={numberFormatter.format(snapshot.operationsMetrics[card.key])}
                >
                  <p>{card.label}</p>
                  <p className="desktop-card-copy">{card.hint}</p>
                </SectionCard>
              ))}
            </section>

            <section className="desktop-grid desktop-panels desktop-view-panel desktop-view-overview desktop-view-sync">
              <SectionCard
                eyebrow="Node posture"
                title={`${snapshot.storeName} • ${snapshot.terminalCode}`}
                extra={<div className="desktop-mini-label">{snapshot.storeCode}</div>}
              >
                <div className="desktop-meta-grid">
                  <div className="desktop-meta-row">
                    <span>Last local write</span>
                    <strong>{formatRelativeTime(snapshot.lastLocalWriteAt)}</strong>
                  </div>
                  <div className="desktop-meta-row">
                    <span>Last enterprise ack</span>
                    <strong>{formatRelativeTime(snapshot.lastEnterpriseAckAt)}</strong>
                  </div>
                  <div className="desktop-meta-row">
                    <span>Database</span>
                    <strong className="desktop-path">{snapshot.databasePath}</strong>
                  </div>
                </div>

                <div className="desktop-list">
                  {snapshot.activityFeed.map((item) => (
                    <div className="desktop-list-item" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="Platform runtime"
                title={context ? `${context.platform} • Electron ${context.electronVersion}` : "Loading platform"}
                extra={<div className="desktop-mini-label">{context?.nodeVersion ?? "Node"}</div>}
              >
                <div className="desktop-stack">
                  <div className="desktop-inline-card">
                    <strong>Enterprise owner</strong>
                    <span>{snapshot.retailOrgName}</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>Offline ready</strong>
                    <span>{snapshot.offlineReady ? "Yes, local store writes are durable." : "Not ready yet."}</span>
                  </div>
                  <div className="desktop-inline-card">
                    <strong>Latest refresh</strong>
                    <span>{formatRelativeTime(snapshot.generatedAt)}</span>
                  </div>
                </div>
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-inventory">
              <SectionCard
                eyebrow="Local inventory"
                title="Per-location stock posture"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(snapshot.inventoryLocations.length)} locations
                    {isInventoryBrowseBusy ? " • refreshing" : ""}
                  </div>
                }
              >
                {snapshot.inventoryLocations.length > 0 ? (
                  <div className="desktop-table">
                    <div className="desktop-table-row desktop-table-head">
                      <span>Location</span>
                      <span>Tracked</span>
                      <span>On hand</span>
                      <span>Signals</span>
                    </div>
                    {snapshot.inventoryLocations.map((location) => (
                      <div className="desktop-table-row" key={location.locationCode}>
                        <span>
                          <strong>{location.locationName}</strong>
                          <small>
                            {location.locationCode} • {location.defaults}
                          </small>
                        </span>
                        <span>{numberFormatter.format(location.trackedProducts)}</span>
                        <span>{numberFormatter.format(location.onHandQuantity)}</span>
                        <span>
                          <strong>
                            {location.negativePositions > 0
                              ? `${location.negativePositions} negative`
                              : "Stable"}
                          </strong>
                          <small>
                            {location.highlightedProducts.length > 0
                              ? location.highlightedProducts.join(", ")
                              : `Updated ${formatRelativeTime(location.updatedAt)}`}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No local locations yet</strong>
                    <span>
                      Flash ERP will hydrate local location posture here as soon as the desktop has
                      seed data or downstream location publications.
                    </span>
                  </div>
                )}
                <div className="desktop-inline-card">
                  <strong>Hierarchy-aware stock browsing</strong>
                  <span>
                    Department and category masters now drive the offline inventory browser too,
                    so counting and stock-control work can narrow to the same enterprise
                    classification the desktop already synced.
                  </span>
                </div>
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Search stock</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setInventoryBrowseQuery(event.target.value)}
                      placeholder="Product, barcode, location, department"
                      type="text"
                      value={inventoryBrowseQuery}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Location</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setInventoryBrowseLocation(event.target.value)}
                      value={inventoryBrowseLocation}
                    >
                      <option value="">All locations</option>
                      {snapshot.inventoryLocations.map((location) => (
                        <option key={location.locationCode} value={location.locationCode}>
                          {location.locationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Department</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setInventoryBrowseDepartment(event.target.value)}
                      value={inventoryBrowseDepartment}
                    >
                      <option value="">All departments</option>
                      {snapshot.productDepartments.map((department) => (
                        <option key={department.departmentCode} value={department.departmentCode}>
                          {department.departmentName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Category</span>
                    <select
                      className="desktop-input desktop-select"
                      disabled={!inventoryBrowseDepartment}
                      onChange={(event) => setInventoryBrowseCategory(event.target.value)}
                      value={inventoryBrowseCategory}
                    >
                      <option value="">
                        {inventoryBrowseDepartment ? "All categories" : "Select department first"}
                      </option>
                      {inventoryBrowseCategoryOptions.map((category) => (
                        <option key={category.categoryCode} value={category.categoryCode}>
                          {category.categoryName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Serialized only</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setInventoryBrowseSerializedOnly(event.target.value === "YES")}
                      value={inventoryBrowseSerializedOnly ? "YES" : "NO"}
                    >
                      <option value="NO">All products</option>
                      <option value="YES">Serialized only</option>
                    </select>
                  </label>
                </div>
                {inventoryBrowseResults.length > 0 ? (
                  <div className="desktop-list">
                    {inventoryBrowseResults.map((item) => (
                      <div
                        className="desktop-task-item"
                        key={`${item.locationCode}:${item.productCode}`}
                      >
                        <div className="desktop-task-head">
                          <div>
                            <strong>{item.productName}</strong>
                            <p className="desktop-card-copy">
                              {item.locationName} • {item.locationCode}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {numberFormatter.format(item.quantityOnHand)} on hand
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          <span>Product: {item.productCode}</span>
                          {item.barcode ? <span>Barcode: {item.barcode}</span> : null}
                          {item.departmentName ? <span>Department: {item.departmentName}</span> : null}
                          {item.categoryName ? <span>Category: {item.categoryName}</span> : null}
                          {item.subcategory ? <span>Subcategory: {item.subcategory}</span> : null}
                          <span>{item.isSerialized ? "Serialized item" : "Standard item"}</span>
                        </div>
                        <div className="desktop-inline-card">
                          <strong>Stock signal</strong>
                          <span>
                            {item.departmentName
                              ? `${item.departmentName}${item.categoryName ? ` / ${item.categoryName}` : ""}${item.subcategory ? ` / ${item.subcategory}` : ""}`
                              : "No department/category classification synced yet"}{" "}
                            • Unit price {currencyFormatter.format(item.unitPrice)} • Updated{" "}
                            {formatRelativeTime(item.updatedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : snapshot.inventoryLocations.length > 0 ? (
                  <div className="desktop-inline-card">
                    <strong>No matching stock positions</strong>
                    <span>
                      Try another department, category, location, or search term to surface local
                      stock balances.
                    </span>
                  </div>
                ) : null}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-inventory">
              <SectionCard
                eyebrow="Stock control"
                title="Local stock counts"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(stockCountSessions.length)} session
                    {stockCountSessions.length === 1 ? "" : "s"}
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Shop-led count flow</strong>
                  <span>
                    Start the physical count locally, submit the session upstream for enterprise
                    visibility, then commit it locally when the branch is ready to post the result
                    into stock.
                  </span>
                </div>
                <div className="desktop-inline-card">
                  <strong>Serialized control</strong>
                  <span>
                    For serialized items, paste the exact counted serials here. Flash ERP will use
                    that list as the counted posture and block the commit if local stock changed
                    after the session was started.
                  </span>
                </div>
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Location</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setStockCountLocationCode(event.target.value)}
                      value={stockCountLocationCode}
                    >
                      <option value="">Select location</option>
                      {snapshot.inventoryLocations.map((location) => (
                        <option key={location.locationCode} value={location.locationCode}>
                          {location.locationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Product code</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setStockCountProductCode(event.target.value)}
                      placeholder="Enter locally synced product code"
                      type="text"
                      value={stockCountProductCode}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Counted qty</span>
                    <input
                      className="desktop-input"
                      min="0"
                      onChange={(event) => setStockCountQuantity(event.target.value)}
                      onFocus={() => {
                        if (isTouchMode) {
                          setTouchKeyboardTarget("stockCountQuantity");
                        }
                      }}
                      step="0.001"
                      type="number"
                      value={stockCountQuantity}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Counter</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setStockCountOperatorName(event.target.value)}
                      placeholder="Flash ERP stock counter"
                      type="text"
                      value={stockCountOperatorName}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Count note</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setStockCountNote(event.target.value)}
                      placeholder="What was counted physically"
                      type="text"
                      value={stockCountNote}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Counted serials</span>
                    <textarea
                      className="desktop-input"
                      onChange={(event) => setStockCountSerialDraft(event.target.value)}
                      placeholder="Optional for standard items. Use one serial per line for serialized counts."
                      rows={4}
                      value={stockCountSerialDraft}
                    />
                  </label>
                </div>
                {selectedStockCountLocation ? (
                  <div className="desktop-task-meta">
                    <span>
                      Location: {selectedStockCountLocation.locationName} /{" "}
                      {selectedStockCountLocation.locationCode}
                    </span>
                    <span>Defaults: {selectedStockCountLocation.defaults}</span>
                    <span>
                      On hand in location: {numberFormatter.format(selectedStockCountLocation.onHandQuantity)}
                    </span>
                  </div>
                ) : null}
                <div className="desktop-task-actions">
                  <button
                    className="desktop-secondary-button"
                    disabled={
                      isBusy ||
                      !stockCountLocationCode ||
                      !stockCountProductCode.trim() ||
                      Number(stockCountQuantity) < 0
                    }
                    onClick={() => void saveStockCountSessionDraft()}
                    type="button"
                  >
                    Save count draft
                  </button>
                </div>
                {stockCountSessions.length > 0 ? (
                  <div className="desktop-list">
                    {stockCountSessions.map((session) => (
                      <div className="desktop-task-item" key={session.sessionId}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{session.sessionNo}</strong>
                            <p className="desktop-card-copy">
                              {session.productName} • {session.productCode}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {formatStockCountSessionStatusLabel(session.status)}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          <span>
                            Location: {session.inventoryLocationName} / {session.inventoryLocationCode}
                          </span>
                          <span>
                            Previous: {numberFormatter.format(session.previousQuantity)} • Counted:{" "}
                            {numberFormatter.format(session.countedQuantity)} • Variance:{" "}
                            {numberFormatter.format(session.varianceQuantity)}
                          </span>
                          {session.departmentName ? <span>Department: {session.departmentName}</span> : null}
                          {session.categoryName ? <span>Category: {session.categoryName}</span> : null}
                          {session.subcategory ? <span>Subcategory: {session.subcategory}</span> : null}
                          <span>{session.isSerialized ? "Serialized item" : "Standard item"}</span>
                          <span>Updated {formatRelativeTime(session.updatedAt)}</span>
                          {session.submittedAt ? (
                            <span>Submitted {formatRelativeTime(session.submittedAt)}</span>
                          ) : null}
                          {session.committedAt ? (
                            <span>Committed {formatRelativeTime(session.committedAt)}</span>
                          ) : null}
                        </div>
                        {session.note ? (
                          <div className="desktop-inline-card">
                            <strong>Count note</strong>
                            <span>{session.note}</span>
                          </div>
                        ) : null}
                        {session.countedSerialNumbers.length > 0 ? (
                          <div className="desktop-inline-card">
                            <strong>Counted serials</strong>
                            <SerialChipList
                              emptyLabel="No counted serials"
                              serialNumbers={session.countedSerialNumbers}
                            />
                          </div>
                        ) : null}
                        <div className="desktop-task-actions">
                          {session.status === "DRAFT" ? (
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy}
                              onClick={() => void submitStockCountSession(session.sessionId)}
                              type="button"
                            >
                              Submit count
                            </button>
                          ) : null}
                          {session.status === "SUBMITTED" ? (
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy}
                              onClick={() => void commitStockCountSession(session.sessionId)}
                              type="button"
                            >
                              Commit locally
                            </button>
                          ) : null}
                          {session.status === "COMMITTED" ? (
                            <div className="desktop-inline-card">
                              <strong>Committed</strong>
                              <span>
                                The branch already posted this count into local stock and queued the
                                resulting variance upstream.
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No local stock counts</strong>
                    <span>
                      Save a count session here when the shop manager starts a physical count from
                      the branch desktop.
                    </span>
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-inventory">
              <SectionCard
                eyebrow="Purchasing"
                title="Committed purchase orders"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(purchaseOrderBrowseResults.length)} visible
                    {isPurchaseOrderBrowseBusy ? " • refreshing" : ""}
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Offline receiving</strong>
                  <span>
                    Enterprise now issues purchase orders downstream to this desktop node. Flash ERP
                    lets the store or warehouse receive them locally first, then sync the GRN back
                    to enterprise on the next cycle.
                  </span>
                </div>
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Search orders</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setPurchaseOrderBrowseQuery(event.target.value)}
                      placeholder="PO, supplier, product, location"
                      type="text"
                      value={purchaseOrderBrowseQuery}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Status</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setPurchaseOrderBrowseStatus(event.target.value as "" | StorePurchaseOrderStatus)
                      }
                      value={purchaseOrderBrowseStatus}
                    >
                      <option value="">All statuses</option>
                      <option value="COMMITTED">Committed</option>
                      <option value="PART_RECEIVED">Part received</option>
                      <option value="RECEIVED">Received</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </label>
                </div>
                {purchaseOrderBrowseResults.length > 0 ? (
                  <div className="desktop-list">
                    {purchaseOrderBrowseResults.map((purchaseOrder) => (
                      <div className="desktop-task-item" key={purchaseOrder.purchaseOrderId}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{purchaseOrder.purchaseOrderNo}</strong>
                            <p className="desktop-card-copy">
                              {purchaseOrder.inventoryLocationName} • {purchaseOrder.inventoryLocationCode}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {formatPurchaseOrderStatusLabel(purchaseOrder.status)}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          {purchaseOrder.supplierName ? (
                            <span>
                              Supplier: {purchaseOrder.supplierName}
                              {purchaseOrder.supplierNo ? ` • ${purchaseOrder.supplierNo}` : ""}
                            </span>
                          ) : null}
                          {purchaseOrder.externalReference ? (
                            <span>Reference: {purchaseOrder.externalReference}</span>
                          ) : null}
                          <span>
                            Ordered: {numberFormatter.format(purchaseOrder.orderedQuantity)}
                          </span>
                          <span>
                            Received: {numberFormatter.format(purchaseOrder.receivedQuantity)}
                          </span>
                          <span>
                            Exceptions: {numberFormatter.format(purchaseOrder.exceptionQuantity)}
                          </span>
                          <span>
                            Outstanding: {numberFormatter.format(purchaseOrder.outstandingQuantity)}
                          </span>
                          <span>Updated {formatRelativeTime(purchaseOrder.updatedAt)}</span>
                        </div>
                        {purchaseOrder.note ? (
                          <div className="desktop-inline-card">
                            <strong>Enterprise note</strong>
                            <span>{purchaseOrder.note}</span>
                          </div>
                        ) : null}
                        <div className="desktop-list">
                          {purchaseOrder.lines.map((line) => (
                            <div
                              className="desktop-inline-card"
                              key={line.purchaseOrderLineId}
                            >
                              <strong>
                                {line.productName} ({line.productCode})
                              </strong>
                              <span>
                                Ordered {numberFormatter.format(line.orderedQuantity)} • Received{" "}
                                {numberFormatter.format(line.receivedQuantity)} • Exceptions{" "}
                                {numberFormatter.format(line.exceptionQuantity)} • Outstanding{" "}
                                {numberFormatter.format(line.outstandingQuantity)}
                                {line.departmentName
                                  ? ` • ${line.departmentName}${line.categoryName ? ` / ${line.categoryName}` : ""}${line.subcategory ? ` / ${line.subcategory}` : ""}`
                                  : ""}
                                {line.isSerialized ? " • Serialized" : ""}
                              </span>
                              {purchaseOrder.status === "COMMITTED" ||
                              purchaseOrder.status === "PART_RECEIVED" ? (
                                <div className="desktop-list">
                                  <div className="desktop-filter-grid">
                                    <label className="desktop-field">
                                      <span>Receive qty</span>
                                      <input
                                        className="desktop-input"
                                        min="0.001"
                                        onChange={(event) =>
                                          setPurchaseOrderReceiveQuantityDrafts((current) => ({
                                            ...current,
                                            [line.purchaseOrderLineId]: event.target.value
                                          }))
                                        }
                                        step="0.001"
                                        type="number"
                                        value={
                                          purchaseOrderReceiveQuantityDrafts[line.purchaseOrderLineId] ?? ""
                                        }
                                      />
                                    </label>
                                    <label className="desktop-field">
                                      <span>Exception qty</span>
                                      <input
                                        className="desktop-input"
                                        min="0.001"
                                        onChange={(event) =>
                                          setPurchaseOrderReceiveExceptionQuantityDrafts((current) => ({
                                            ...current,
                                            [line.purchaseOrderLineId]: event.target.value
                                          }))
                                        }
                                        step="0.001"
                                        type="number"
                                        value={
                                          purchaseOrderReceiveExceptionQuantityDrafts[
                                            line.purchaseOrderLineId
                                          ] ?? ""
                                        }
                                      />
                                    </label>
                                    <label className="desktop-field">
                                      <span>Exception reason</span>
                                      <select
                                        className="desktop-input"
                                        onChange={(event) =>
                                          setPurchaseOrderReceiveExceptionReasonDrafts((current) => ({
                                            ...current,
                                            [line.purchaseOrderLineId]: event.target.value as
                                              | ""
                                              | StoreLocalGoodsReceiptExceptionSummary["reason"]
                                          }))
                                        }
                                        value={
                                          purchaseOrderReceiveExceptionReasonDrafts[
                                            line.purchaseOrderLineId
                                          ] ?? ""
                                        }
                                      >
                                        <option value="">Select reason</option>
                                        {purchaseOrderExceptionReasonOptions.map((reason) => (
                                          <option key={reason} value={reason}>
                                            {formatSupplierClaimReasonLabel(reason)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="desktop-field">
                                      <span>Exception note</span>
                                      <input
                                        className="desktop-input"
                                        onChange={(event) =>
                                          setPurchaseOrderReceiveExceptionNoteDrafts((current) => ({
                                            ...current,
                                            [line.purchaseOrderLineId]: event.target.value
                                          }))
                                        }
                                        placeholder="Damage, shortage, rejection, or other details"
                                        type="text"
                                        value={
                                          purchaseOrderReceiveExceptionNoteDrafts[
                                            line.purchaseOrderLineId
                                          ] ?? ""
                                        }
                                      />
                                    </label>
                                  </div>
                                  <label className="desktop-field">
                                    <span>Receiving posture</span>
                                    <div className="desktop-inline-card">
                                      <strong>Accepted stock updates local inventory immediately</strong>
                                      <span>
                                        Exception quantities do not enter stock. They sync back as
                                        supplier claims for enterprise follow-up and credit-note handling.
                                        {line.isSerialized
                                          ? " Serialized exception quantities must stay whole-number."
                                          : ""}
                                      </span>
                                    </div>
                                  </label>
                                  {line.isSerialized ? (
                                    <label className="desktop-field">
                                      <span>Serials</span>
                                      <textarea
                                        className="desktop-input"
                                        onChange={(event) =>
                                          setPurchaseOrderReceiveSerialDrafts((current) => ({
                                            ...current,
                                            [line.purchaseOrderLineId]: event.target.value
                                          }))
                                        }
                                        placeholder="One serial per line"
                                        rows={3}
                                        value={
                                          purchaseOrderReceiveSerialDrafts[line.purchaseOrderLineId] ?? ""
                                        }
                                      />
                                    </label>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {purchaseOrder.status === "COMMITTED" ||
                        purchaseOrder.status === "PART_RECEIVED" ? (
                          <>
                            <div className="desktop-filter-grid">
                              <label className="desktop-field">
                                <span>Receipt reference</span>
                                <input
                                  className="desktop-input"
                                  onChange={(event) =>
                                    setPurchaseOrderReceiveReferenceDrafts((current) => ({
                                      ...current,
                                      [purchaseOrder.purchaseOrderId]: event.target.value
                                    }))
                                  }
                                  placeholder="Invoice, delivery note, truck ref"
                                  type="text"
                                  value={
                                    purchaseOrderReceiveReferenceDrafts[purchaseOrder.purchaseOrderId] ?? ""
                                  }
                                />
                              </label>
                              <label className="desktop-field">
                                <span>Receiver</span>
                                <input
                                  className="desktop-input"
                                  onChange={(event) =>
                                    setPurchaseOrderReceiveOperatorDrafts((current) => ({
                                      ...current,
                                      [purchaseOrder.purchaseOrderId]: event.target.value
                                    }))
                                  }
                                  placeholder="Flash ERP receiver"
                                  type="text"
                                  value={
                                    purchaseOrderReceiveOperatorDrafts[purchaseOrder.purchaseOrderId] ?? ""
                                  }
                                />
                              </label>
                              <label className="desktop-field">
                                <span>Receipt note</span>
                                <input
                                  className="desktop-input"
                                  onChange={(event) =>
                                    setPurchaseOrderReceiveNoteDrafts((current) => ({
                                      ...current,
                                      [purchaseOrder.purchaseOrderId]: event.target.value
                                    }))
                                  }
                                  placeholder="What arrived physically"
                                  type="text"
                                  value={
                                    purchaseOrderReceiveNoteDrafts[purchaseOrder.purchaseOrderId] ?? ""
                                  }
                                />
                              </label>
                            </div>
                            <div className="desktop-task-actions">
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy}
                                onClick={() => void receivePurchaseOrder(purchaseOrder)}
                                type="button"
                              >
                                Post local GRN
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No matching purchase orders</strong>
                    <span>
                      Committed enterprise purchase orders will appear here after the next downstream sync pull.
                    </span>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Receiving history"
                title="Recent local GRNs"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(recentGoodsReceipts.length)} visible
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Execution evidence</strong>
                  <span>
                    These are goods receipts already posted on this desktop. Unsynced receipts stay
                    fully visible offline until enterprise acknowledges them on a later sync.
                  </span>
                </div>
                {recentGoodsReceipts.length > 0 ? (
                  <div className="desktop-list">
                    {recentGoodsReceipts.map((receipt) => (
                      <div className="desktop-task-item" key={receipt.goodsReceiptId}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{receipt.goodsReceiptNo}</strong>
                            <p className="desktop-card-copy">
                              {receipt.inventoryLocationName} • {receipt.inventoryLocationCode}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {receipt.syncedAt ? "Synced to enterprise" : "Waiting for sync"}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          {receipt.purchaseOrderNo ? <span>PO: {receipt.purchaseOrderNo}</span> : null}
                          {receipt.supplierName ? (
                            <span>
                              Supplier: {receipt.supplierName}
                              {receipt.supplierNo ? ` • ${receipt.supplierNo}` : ""}
                            </span>
                          ) : null}
                          {receipt.externalReference ? (
                            <span>Reference: {receipt.externalReference}</span>
                          ) : null}
                          <span>
                            Qty: {numberFormatter.format(receipt.totalQuantity)} across{" "}
                            {numberFormatter.format(receipt.lineCount)} line
                            {receipt.lineCount === 1 ? "" : "s"}
                          </span>
                          <span>
                            Exceptions: {numberFormatter.format(receipt.exceptionQuantity)} across{" "}
                            {numberFormatter.format(receipt.exceptionCount)} exception
                            {receipt.exceptionCount === 1 ? "" : "s"}
                          </span>
                          <span>Received {formatRelativeTime(receipt.receivedAt)}</span>
                          <span>
                            {receipt.syncedAt
                              ? `Acknowledged ${formatRelativeTime(receipt.syncedAt)}`
                              : "Not yet acknowledged by enterprise"}
                          </span>
                        </div>
                        {receipt.note ? (
                          <div className="desktop-inline-card">
                            <strong>Receipt note</strong>
                            <span>{receipt.note}</span>
                          </div>
                        ) : null}
                        {receipt.exceptions.length > 0 ? (
                          <div className="desktop-inline-card">
                            <strong>Receipt exceptions</strong>
                            <span>
                              These quantities were not accepted into local stock. Flash ERP has
                              kept them linked to the GRN so enterprise can follow up with the
                              supplier claim and any credit-note outcome.
                            </span>
                          </div>
                        ) : null}
                        <div className="desktop-list">
                          {receipt.lines.map((line) => (
                            <div className="desktop-inline-card" key={line.goodsReceiptLineId}>
                              <strong>
                                {line.productName} ({line.productCode})
                              </strong>
                              <span>
                                Line {line.lineNo} • Qty {numberFormatter.format(line.quantity)}
                                {line.unitCost !== null
                                  ? ` • Unit cost ${currencyFormatter.format(line.unitCost)}`
                                  : ""}
                                {line.purchaseOrderLineId ? " • Linked to PO line" : ""}
                              </span>
                              {line.serialNumbers.length > 0 ? (
                                <SerialChipList
                                  emptyLabel="No serials captured"
                                  serialNumbers={line.serialNumbers}
                                />
                              ) : null}
                            </div>
                          ))}
                          {receipt.exceptions.map((exception) => (
                            <div className="desktop-inline-card" key={exception.receiptExceptionId}>
                              <strong>
                                {exception.productName} ({exception.productCode})
                              </strong>
                              <span>
                                Exception line {exception.lineNo} • Qty{" "}
                                {numberFormatter.format(exception.quantity)} •{" "}
                                {formatSupplierClaimReasonLabel(exception.reason)}
                                {exception.unitCost !== null
                                  ? ` • Unit cost ${currencyFormatter.format(exception.unitCost)}`
                                  : ""}
                              </span>
                              {exception.note ? <span>Note: {exception.note}</span> : null}
                            </div>
                          ))}
                        </div>
                        <div className="desktop-task-meta">
                          <span>Receiver: {receipt.operatorName}</span>
                          <span>Updated {formatRelativeTime(receipt.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No local GRNs yet</strong>
                    <span>
                      Once this node receives a committed purchase order locally, the posted goods
                      receipt will appear here even before the next sync succeeds.
                    </span>
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-returns">
              <SectionCard
                eyebrow="Supplier returns"
                title="Return to vendor from original receipt"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(recentSupplierReturns.length)} visible
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Receipt-linked RTV</strong>
                  <span>
                    Start from the original local GRN, pick the exact received line, then post the
                    supplier return offline with quantity and serial validation before it syncs back
                    to enterprise.
                  </span>
                </div>
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Original goods receipt</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setSupplierReturnGoodsReceiptId(event.target.value)}
                      value={supplierReturnGoodsReceiptId}
                    >
                      <option value="">Select goods receipt</option>
                      {recentGoodsReceipts.map((receipt) => (
                        <option key={receipt.goodsReceiptId} value={receipt.goodsReceiptId}>
                          {receipt.goodsReceiptNo} • {receipt.inventoryLocationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Receipt line</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setSupplierReturnGoodsReceiptLineId(event.target.value)}
                      value={supplierReturnGoodsReceiptLineId}
                    >
                      <option value="">Select line</option>
                      {(selectedSupplierReturnReceipt?.lines ?? []).map((line) => (
                        <option key={line.goodsReceiptLineId} value={line.goodsReceiptLineId}>
                          {line.productName} • {line.productCode} • Qty{" "}
                          {numberFormatter.format(line.quantity)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Return reason</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setSupplierReturnReason(event.target.value as StoreLocalSupplierReturnReason)
                      }
                      value={supplierReturnReason}
                    >
                      <option value="DAMAGED">Damaged</option>
                      <option value="REJECTED_AT_RECEIPT">Rejected at receipt</option>
                      <option value="QUALITY_HOLD">Quality hold</option>
                      <option value="SHORT_EXPIRY">Short expiry</option>
                      <option value="WRONG_ITEM">Wrong item</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Return qty</span>
                    <input
                      className="desktop-input"
                      min="0.001"
                      onChange={(event) => setSupplierReturnQuantity(event.target.value)}
                      readOnly={(selectedSupplierReturnReceiptLine?.serialNumbers.length ?? 0) > 0}
                      step="0.001"
                      type="number"
                      value={
                        (selectedSupplierReturnReceiptLine?.serialNumbers.length ?? 0) > 0
                          ? String(parseSerialDraft(supplierReturnSerialDraft).length)
                          : supplierReturnQuantity
                      }
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Operator</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setSupplierReturnOperatorName(event.target.value)}
                      placeholder="Flash ERP returns officer"
                      type="text"
                      value={supplierReturnOperatorName}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Reference</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setSupplierReturnExternalReference(event.target.value)}
                      placeholder="Vendor RMA, debit note, approval"
                      type="text"
                      value={supplierReturnExternalReference}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Return note</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setSupplierReturnNote(event.target.value)}
                      placeholder="Why this stock is going back to the supplier"
                      type="text"
                      value={supplierReturnNote}
                    />
                  </label>
                </div>
                {selectedSupplierReturnReceipt ? (
                  <div className="desktop-inline-card">
                    <strong>Selected receipt posture</strong>
                    <span>
                      {selectedSupplierReturnReceipt.goodsReceiptNo} • Supplier{" "}
                      {selectedSupplierReturnReceipt.supplierName}
                      {selectedSupplierReturnReceipt.supplierNo
                        ? ` • ${selectedSupplierReturnReceipt.supplierNo}`
                        : ""}
                    </span>
                    <span>
                      {selectedSupplierReturnReceipt.inventoryLocationName} • Received{" "}
                      {formatRelativeTime(selectedSupplierReturnReceipt.receivedAt)}
                    </span>
                  </div>
                ) : null}
                {selectedSupplierReturnReceiptLine ? (
                  <div className="desktop-inline-card">
                    <strong>
                      {selectedSupplierReturnReceiptLine.productName} (
                      {selectedSupplierReturnReceiptLine.productCode})
                    </strong>
                    <span>
                      Original line {selectedSupplierReturnReceiptLine.lineNo} • Qty{" "}
                      {numberFormatter.format(selectedSupplierReturnReceiptLine.quantity)}
                      {selectedSupplierReturnReceiptLine.unitCost !== null
                        ? ` • Unit cost ${currencyFormatter.format(
                            selectedSupplierReturnReceiptLine.unitCost
                          )}`
                        : ""}
                    </span>
                    <span>
                      {selectedSupplierReturnReceiptLine.serialNumbers.length > 0
                        ? "Serialized item"
                        : "Standard item"}
                    </span>
                    {selectedSupplierReturnReceiptLine.serialNumbers.length > 0 ? (
                      <>
                        <textarea
                          className="desktop-input"
                          onChange={(event) => setSupplierReturnSerialDraft(event.target.value)}
                          placeholder="One serial per line"
                          rows={3}
                          value={supplierReturnSerialDraft}
                        />
                        <SerialChipList
                          emptyLabel="No original serials captured"
                          serialNumbers={selectedSupplierReturnReceiptLine.serialNumbers}
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className="desktop-task-actions">
                  <button
                    className="desktop-secondary-button"
                    disabled={
                      isBusy || !selectedSupplierReturnReceipt || !selectedSupplierReturnReceiptLine
                    }
                    onClick={() => void recordSupplierReturn()}
                    type="button"
                  >
                    Post supplier return
                  </button>
                </div>
                {recentSupplierReturns.length > 0 ? (
                  <div className="desktop-list">
                    {recentSupplierReturns.map((supplierReturn) => (
                      <div className="desktop-task-item" key={supplierReturn.supplierReturnId}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{supplierReturn.supplierReturnNo}</strong>
                            <p className="desktop-card-copy">
                              {supplierReturn.goodsReceiptNo} • {supplierReturn.inventoryLocationName}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {supplierReturn.status === "CANCELLED"
                              ? supplierReturn.cancellationAcknowledgedAt
                                ? "Stock restored locally"
                                : "Awaiting local stock confirmation"
                              : supplierReturn.syncedAt
                                ? "Synced to enterprise"
                                : "Waiting for sync"}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          <span>
                            Supplier: {supplierReturn.supplierName}
                            {supplierReturn.supplierNo ? ` • ${supplierReturn.supplierNo}` : ""}
                          </span>
                          <span>
                            Reason: {formatSupplierReturnReasonLabel(supplierReturn.reason)}
                          </span>
                          <span>Status: {supplierReturn.status === "CANCELLED" ? "Cancelled" : "Posted"}</span>
                          <span>
                            Qty: {numberFormatter.format(supplierReturn.totalQuantity)} across{" "}
                            {numberFormatter.format(supplierReturn.lineCount)} line
                            {supplierReturn.lineCount === 1 ? "" : "s"}
                          </span>
                          <span>Returned {formatRelativeTime(supplierReturn.returnedAt)}</span>
                          <span>
                            {supplierReturn.syncedAt
                              ? `Acknowledged ${formatRelativeTime(supplierReturn.syncedAt)}`
                              : "Not yet acknowledged by enterprise"}
                          </span>
                          {supplierReturn.cancelledAt ? (
                            <span>
                              Cancelled {formatRelativeTime(supplierReturn.cancelledAt)}
                              {supplierReturn.cancellationOperatorName
                                ? ` by ${supplierReturn.cancellationOperatorName}`
                                : ""}
                            </span>
                          ) : null}
                          {supplierReturn.cancellationAcknowledgedAt ? (
                            <span>
                              Store confirmed{" "}
                              {formatRelativeTime(supplierReturn.cancellationAcknowledgedAt)}
                              {supplierReturn.cancellationAcknowledgedBy
                                ? ` by ${supplierReturn.cancellationAcknowledgedBy}`
                                : ""}
                              {supplierReturn.cancellationAcknowledgementSyncedAt
                                ? ` • Synced ${formatRelativeTime(
                                    supplierReturn.cancellationAcknowledgementSyncedAt
                                  )}`
                                : " • Waiting for enterprise sync"}
                            </span>
                          ) : supplierReturn.status === "CANCELLED" ? (
                            <span>Waiting for local confirmation that stock is back on hand</span>
                          ) : null}
                        </div>
                        {supplierReturn.note ? (
                          <div className="desktop-inline-card">
                            <strong>Return note</strong>
                            <span>{supplierReturn.note}</span>
                          </div>
                        ) : null}
                        {supplierReturn.cancellationNote ? (
                          <div className="desktop-inline-card">
                            <strong>Cancellation note</strong>
                            <span>{supplierReturn.cancellationNote}</span>
                          </div>
                        ) : null}
                        {supplierReturn.cancellationAcknowledgementNote ? (
                          <div className="desktop-inline-card">
                            <strong>Restoration confirmation</strong>
                            <span>{supplierReturn.cancellationAcknowledgementNote}</span>
                          </div>
                        ) : null}
                        {supplierReturn.status === "CANCELLED" &&
                        !supplierReturn.cancellationAcknowledgedAt ? (
                          <div className="desktop-task-actions">
                            <button
                              className="desktop-secondary-button"
                              disabled={isBusy}
                              onClick={() => void acknowledgeSupplierReturnCancellation(supplierReturn)}
                              type="button"
                            >
                              Confirm stock restored locally
                            </button>
                          </div>
                        ) : null}
                        <div className="desktop-list">
                          {supplierReturn.lines.map((line) => (
                            <div className="desktop-inline-card" key={line.supplierReturnLineId}>
                              <strong>
                                {line.productName} ({line.productCode})
                              </strong>
                              <span>
                                Line {line.lineNo} • Qty {numberFormatter.format(line.quantity)}
                                {line.unitCost !== null
                                  ? ` • Unit cost ${currencyFormatter.format(line.unitCost)}`
                                  : ""}
                                {line.goodsReceiptLineId ? " • Linked to GRN line" : ""}
                              </span>
                              {line.serialNumbers.length > 0 ? (
                                <SerialChipList
                                  emptyLabel="No serials captured"
                                  serialNumbers={line.serialNumbers}
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="desktop-task-meta">
                          <span>Operator: {supplierReturn.operatorName}</span>
                          <span>Updated {formatRelativeTime(supplierReturn.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No supplier returns yet</strong>
                    <span>
                      Once this node posts a local RTV against an original goods receipt, it will
                      remain visible here offline until enterprise acknowledges it.
                    </span>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Inter-store movement"
                title="Enterprise-issued transfer instructions"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(transferBrowseResults.length)} visible
                    {isTransferBrowseBusy ? " • refreshing" : ""}
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Instruction-led execution</strong>
                  <span>
                    Flash ERP lets enterprise publish paired transfer instructions to the source and
                    destination desktops, while the actual issue and receipt still happen locally
                    when the goods move physically.
                  </span>
                </div>
                <div className="desktop-inline-card">
                  <strong>Shop-initiated transfer-in requests</strong>
                  <span>
                    Save a request draft locally first, then submit it when the shop is ready to sync.
                    Enterprise will convert that request into the canonical source-issue and
                    destination-receipt transfer instructions on the next successful sync.
                  </span>
                </div>
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Source shop/location</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setTransferRequestSourceLocationCode(event.target.value)}
                      value={transferRequestSourceLocationCode}
                    >
                      <option value="">Select source location</option>
                      {transferRequestTargets.map((target) => (
                        <option key={target.sourceLocationCode} value={target.sourceLocationCode}>
                          {target.sourceStoreName} • {target.sourceLocationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Destination location</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setTransferRequestDestinationLocationCode(event.target.value)
                      }
                      value={transferRequestDestinationLocationCode}
                    >
                      <option value="">Select destination</option>
                      {snapshot.inventoryLocations.map((location) => (
                        <option key={location.locationCode} value={location.locationCode}>
                          {location.locationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Product code</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setTransferRequestProductCode(event.target.value)}
                      placeholder="Enter locally synced product code"
                      type="text"
                      value={transferRequestProductCode}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Requested qty</span>
                    <input
                      className="desktop-input"
                      min="0.001"
                      onChange={(event) => setTransferRequestQuantity(event.target.value)}
                      onFocus={() => {
                        if (isTouchMode) {
                          setTouchKeyboardTarget("transferRequestQuantity");
                        }
                      }}
                      step="0.001"
                      type="number"
                      value={transferRequestQuantity}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Requester</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setTransferRequestOperatorName(event.target.value)}
                      placeholder="Flash ERP requester"
                      type="text"
                      value={transferRequestOperatorName}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Reference</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setTransferRequestExternalReference(event.target.value)}
                      placeholder="Optional request reference"
                      type="text"
                      value={transferRequestExternalReference}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Request note</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setTransferRequestNote(event.target.value)}
                      placeholder="Why this stock is needed locally"
                      type="text"
                      value={transferRequestNote}
                    />
                  </label>
                </div>
                {selectedTransferRequestTarget || selectedTransferRequestDestination ? (
                  <div className="desktop-task-meta">
                    {selectedTransferRequestTarget ? (
                      <span>
                        Source: {selectedTransferRequestTarget.sourceStoreName} /{" "}
                        {selectedTransferRequestTarget.sourceLocationName} •{" "}
                        {formatTransferRequestSourceModeLabel(selectedTransferRequestTarget)}
                      </span>
                    ) : null}
                    {selectedTransferRequestTarget?.sourceWarehouseName ? (
                      <span>Warehouse: {selectedTransferRequestTarget.sourceWarehouseName}</span>
                    ) : null}
                    {selectedTransferRequestDestination ? (
                      <span>
                        Destination: {snapshot.storeName} /{" "}
                        {selectedTransferRequestDestination.locationName}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="desktop-task-actions">
                  <button
                    className="desktop-secondary-button"
                    disabled={
                      isBusy ||
                      !transferRequestSourceLocationCode ||
                      !transferRequestDestinationLocationCode ||
                      !transferRequestProductCode.trim() ||
                      Number(transferRequestQuantity) <= 0
                    }
                    onClick={() => void saveInterStoreTransferRequestDraft()}
                    type="button"
                  >
                    Save request draft
                  </button>
                </div>
                {transferRequestDrafts.length > 0 ? (
                  <div className="desktop-list">
                    {transferRequestDrafts.map((draft) => (
                      <div className="desktop-task-item" key={draft.draftId}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{draft.requestNo}</strong>
                            <p className="desktop-card-copy">
                              {draft.productName} • {draft.productCode}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {formatTransferRequestDraftStatusLabel(draft.status)}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          <span>
                            Route: {draft.sourceStoreName} / {draft.sourceLocationName} to{" "}
                            {draft.destinationStoreName} / {draft.destinationLocationName}
                          </span>
                          <span>Requested: {numberFormatter.format(draft.quantity)}</span>
                          {draft.departmentName ? <span>Department: {draft.departmentName}</span> : null}
                          {draft.categoryName ? <span>Category: {draft.categoryName}</span> : null}
                          {draft.subcategory ? <span>Subcategory: {draft.subcategory}</span> : null}
                          <span>{draft.isSerialized ? "Serialized item" : "Standard item"}</span>
                          <span>
                            Updated {formatRelativeTime(draft.updatedAt)}
                            {draft.submittedAt ? ` • Submitted ${formatRelativeTime(draft.submittedAt)}` : ""}
                          </span>
                        </div>
                        {draft.note ? (
                          <div className="desktop-inline-card">
                            <strong>Request note</strong>
                            <span>{draft.note}</span>
                          </div>
                        ) : null}
                        <div className="desktop-task-actions">
                          {draft.status === "DRAFT" ? (
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy}
                              onClick={() => void submitInterStoreTransferRequestDraft(draft.draftId)}
                              type="button"
                            >
                              Submit request
                            </button>
                          ) : (
                            <div className="desktop-inline-card">
                              <strong>Waiting for enterprise</strong>
                              <span>
                                This submitted request will disappear from drafts once enterprise
                                returns the canonical transfer instructions on a downstream sync.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No local request drafts</strong>
                    <span>
                      Save a transfer-in request here when the shop needs stock from another store or
                      warehouse before you submit it upstream.
                    </span>
                  </div>
                )}
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Search transfers</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setTransferBrowseQuery(event.target.value)}
                      placeholder="Transfer, store, location, product"
                      type="text"
                      value={transferBrowseQuery}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Role</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setTransferBrowseRole(event.target.value as "" | "SOURCE" | "DESTINATION")
                      }
                      value={transferBrowseRole}
                    >
                      <option value="">All roles</option>
                      <option value="SOURCE">Source issue</option>
                      <option value="DESTINATION">Destination receipt</option>
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Status</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setTransferBrowseStatus(
                          event.target.value as "" | StoreInterStoreTransferStatus
                        )
                      }
                      value={transferBrowseStatus}
                    >
                      <option value="">All statuses</option>
                      <option value="REQUESTED">Requested</option>
                      <option value="PART_ISSUED">Part issued</option>
                      <option value="ISSUED">Issued</option>
                      <option value="PART_RECEIVED">Part received</option>
                      <option value="RECEIVED">Received</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </label>
                </div>
                {transferBrowseResults.length > 0 ? (
                  <div className="desktop-list">
                    {transferBrowseResults.map((transfer) => {
                      const canIssueLocally =
                        transfer.role === "SOURCE" &&
                        transfer.outstandingIssueQuantity > 0 &&
                        (transfer.status === "REQUESTED" ||
                          transfer.status === "PART_ISSUED" ||
                          transfer.status === "PART_RECEIVED");
                      const canReceiveLocally =
                        transfer.role === "DESTINATION" &&
                        transfer.outstandingReceiptQuantity > 0 &&
                        (transfer.status === "PART_ISSUED" ||
                          transfer.status === "ISSUED" ||
                          transfer.status === "PART_RECEIVED");
                      const outstandingIssuedSerialNumbers = transfer.issuedSerialNumbers.filter(
                        (serialNumber) =>
                          !transfer.receivedSerialNumbers.some(
                            (receivedSerialNumber) =>
                              receivedSerialNumber.toUpperCase() === serialNumber.toUpperCase()
                          )
                      );

                      return (
                        <div className="desktop-task-item" key={transfer.transferId}>
                          <div className="desktop-task-head">
                            <div>
                              <strong>{transfer.transferNo}</strong>
                              <p className="desktop-card-copy">
                                {transfer.productName} • {transfer.productCode}
                              </p>
                            </div>
                            <div className="desktop-mini-label">
                              {formatInterStoreTransferStatusLabel(transfer.status)}
                            </div>
                          </div>
                          <div className="desktop-task-meta">
                            <span>Role: {formatInterStoreTransferRoleLabel(transfer.role)}</span>
                            <span>
                              Route: {transfer.sourceStoreName} / {transfer.sourceLocationName} to{" "}
                              {transfer.destinationStoreName} / {transfer.destinationLocationName}
                            </span>
                            <span>Requested: {numberFormatter.format(transfer.requestedQuantity)}</span>
                            <span>Issued: {numberFormatter.format(transfer.issuedQuantity)}</span>
                            <span>Received: {numberFormatter.format(transfer.receivedQuantity)}</span>
                            {transfer.departmentName ? (
                              <span>Department: {transfer.departmentName}</span>
                            ) : null}
                            {transfer.categoryName ? (
                              <span>Category: {transfer.categoryName}</span>
                            ) : null}
                            {transfer.subcategory ? <span>Subcategory: {transfer.subcategory}</span> : null}
                            <span>{transfer.isSerialized ? "Serialized item" : "Standard item"}</span>
                            <span>Origin: {transfer.origin === "ENTERPRISE" ? "Enterprise" : "Store request"}</span>
                          </div>
                          <div className="desktop-inline-card">
                            <strong>Execution signal</strong>
                            <span>
                              {transfer.role === "SOURCE"
                                ? `${numberFormatter.format(transfer.outstandingIssueQuantity)} unit(s) are still waiting to issue from ${transfer.sourceLocationCode}.`
                                : `${numberFormatter.format(transfer.outstandingReceiptQuantity)} unit(s) are still waiting to receive into ${transfer.destinationLocationCode}.`}{" "}
                              Updated {formatRelativeTime(transfer.updatedAt)}.
                            </span>
                          </div>
                          {transfer.requestNote ? (
                            <div className="desktop-inline-card">
                              <strong>Instruction note</strong>
                              <span>{transfer.requestNote}</span>
                            </div>
                          ) : null}
                          {transfer.isSerialized ? (
                            <div className="desktop-serial-panel">
                              <div className="desktop-stack-compact">
                                <span className="desktop-serial-caption">Issued serials</span>
                                <SerialChipList
                                  emptyLabel="No issued serials are recorded yet."
                                  serialNumbers={transfer.issuedSerialNumbers}
                                />
                              </div>
                              <div className="desktop-stack-compact">
                                <span className="desktop-serial-caption">Received serials</span>
                                <SerialChipList
                                  emptyLabel="No received serials are recorded yet."
                                  serialNumbers={transfer.receivedSerialNumbers}
                                />
                              </div>
                            </div>
                          ) : null}
                          {canIssueLocally ? (
                            <>
                              <div className="desktop-filter-grid">
                                <label className="desktop-field">
                                  <span>Issue qty</span>
                                  <input
                                    className="desktop-input"
                                    min={transfer.isSerialized ? "1" : "0.001"}
                                    onChange={(event) =>
                                      setTransferIssueQuantityDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder={String(transfer.outstandingIssueQuantity)}
                                    step={transfer.isSerialized ? "1" : "0.001"}
                                    type="number"
                                    value={
                                      transferIssueQuantityDrafts[transfer.transferId] ??
                                      String(transfer.outstandingIssueQuantity)
                                    }
                                  />
                                </label>
                                <label className="desktop-field">
                                  <span>Issuer</span>
                                  <input
                                    className="desktop-input"
                                    onChange={(event) =>
                                      setTransferIssueOperatorDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder="Flash ERP issuer"
                                    type="text"
                                    value={transferIssueOperatorDrafts[transfer.transferId] ?? ""}
                                  />
                                </label>
                                <label className="desktop-field">
                                  <span>Issue note</span>
                                  <input
                                    className="desktop-input"
                                    onChange={(event) =>
                                      setTransferIssueNoteDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder="What was physically dispatched"
                                    type="text"
                                    value={transferIssueNoteDrafts[transfer.transferId] ?? ""}
                                  />
                                </label>
                              </div>
                              {transfer.isSerialized ? (
                                <label className="desktop-field">
                                  <span>Serials to issue</span>
                                  <textarea
                                    className="desktop-input desktop-textarea"
                                    onChange={(event) =>
                                      setTransferIssueSerialDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder="Enter one serial per line"
                                    rows={3}
                                    value={transferIssueSerialDrafts[transfer.transferId] ?? ""}
                                  />
                                </label>
                              ) : null}
                              <div className="desktop-task-actions">
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy}
                                  onClick={() => void issueInterStoreTransfer(transfer)}
                                  type="button"
                                >
                                  Issue locally
                                </button>
                              </div>
                            </>
                          ) : null}
                          {canReceiveLocally ? (
                            <>
                              <div className="desktop-filter-grid">
                                <label className="desktop-field">
                                  <span>Receive qty</span>
                                  <input
                                    className="desktop-input"
                                    min={transfer.isSerialized ? "1" : "0.001"}
                                    onChange={(event) =>
                                      setTransferReceiveQuantityDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder={String(transfer.outstandingReceiptQuantity)}
                                    step={transfer.isSerialized ? "1" : "0.001"}
                                    type="number"
                                    value={
                                      transferReceiveQuantityDrafts[transfer.transferId] ??
                                      String(transfer.outstandingReceiptQuantity)
                                    }
                                  />
                                </label>
                                <label className="desktop-field">
                                  <span>Receiver</span>
                                  <input
                                    className="desktop-input"
                                    onChange={(event) =>
                                      setTransferReceiveOperatorDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder="Flash ERP receiver"
                                    type="text"
                                    value={transferReceiveOperatorDrafts[transfer.transferId] ?? ""}
                                  />
                                </label>
                                <label className="desktop-field">
                                  <span>Receipt note</span>
                                  <input
                                    className="desktop-input"
                                    onChange={(event) =>
                                      setTransferReceiveNoteDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder="What was received physically"
                                    type="text"
                                    value={transferReceiveNoteDrafts[transfer.transferId] ?? ""}
                                  />
                                </label>
                              </div>
                              {transfer.isSerialized ? (
                                <label className="desktop-field">
                                  <span>Serials to receive</span>
                                  <textarea
                                    className="desktop-input desktop-textarea"
                                    onChange={(event) =>
                                      setTransferReceiveSerialDrafts((current) => ({
                                        ...current,
                                        [transfer.transferId]: event.target.value
                                      }))
                                    }
                                    placeholder="Enter one serial per line"
                                    rows={3}
                                    value={
                                      transferReceiveSerialDrafts[transfer.transferId] ??
                                      formatSerialDraft(outstandingIssuedSerialNumbers)
                                    }
                                  />
                                </label>
                              ) : null}
                              <div className="desktop-task-actions">
                                <button
                                  className="desktop-secondary-button desktop-compact-button"
                                  disabled={isBusy}
                                  onClick={() => void receiveInterStoreTransfer(transfer)}
                                  type="button"
                                >
                                  Receive locally
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No matching transfers</strong>
                    <span>
                      Enterprise-issued inter-store instructions will appear here after the next
                      downstream sync pull.
                    </span>
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-inventory">
              <SectionCard
                eyebrow="Serialized stock"
                title="Authoritative local serial registry"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(serialBrowseResults.length)} visible
                    {isSerialBrowseBusy ? " • refreshing" : ""}
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Local source of truth</strong>
                  <span>
                    Flash ERP keeps serialized unit posture on the store desktop itself, so sales,
                    receipt-linked corrections, and queued stock-control tasks can all validate the
                    same offline registry.
                  </span>
                </div>
                <div className="desktop-inline-card">
                  <strong>Status guide</strong>
                  <span>
                    Available serials can be sold or moved locally, Sold serials stay traceable for
                    returns and exchanges, In transit serials are already on an outbound transfer,
                    and Adjusted out serials were removed by local stock control.
                  </span>
                </div>
                <div className="desktop-filter-grid">
                  <label className="desktop-field">
                    <span>Search serials</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setSerialBrowseQuery(event.target.value)}
                      placeholder="Serial, product, receipt, location"
                      type="text"
                      value={serialBrowseQuery}
                    />
                  </label>
                  <label className="desktop-field">
                    <span>Location</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setSerialBrowseLocation(event.target.value)}
                      value={serialBrowseLocation}
                    >
                      <option value="">All locations</option>
                      {snapshot.inventoryLocations.map((location) => (
                        <option key={location.locationCode} value={location.locationCode}>
                          {location.locationName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Department</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setSerialBrowseDepartment(event.target.value)}
                      value={serialBrowseDepartment}
                    >
                      <option value="">All departments</option>
                      {snapshot.productDepartments.map((department) => (
                        <option key={department.departmentCode} value={department.departmentCode}>
                          {department.departmentName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Category</span>
                    <select
                      className="desktop-input desktop-select"
                      disabled={!serialBrowseDepartment}
                      onChange={(event) => setSerialBrowseCategory(event.target.value)}
                      value={serialBrowseCategory}
                    >
                      <option value="">
                        {serialBrowseDepartment ? "All categories" : "Select department first"}
                      </option>
                      {serialBrowseCategoryOptions.map((category) => (
                        <option key={category.categoryCode} value={category.categoryCode}>
                          {category.categoryName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Status</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) =>
                        setSerialBrowseStatus(event.target.value as "" | StoreSerialRegistryStatus)
                      }
                      value={serialBrowseStatus}
                    >
                      <option value="">All statuses</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="IN_TRANSIT">In transit</option>
                      <option value="SOLD">Sold</option>
                      <option value="ADJUSTED_OUT">Adjusted out</option>
                    </select>
                  </label>
                </div>
                {serialBrowseResults.length > 0 ? (
                  <div className="desktop-list">
                    {serialBrowseResults.map((item) => (
                      <div
                        className="desktop-task-item"
                        key={`${item.productCode}:${item.serialNumber}`}
                      >
                        <div className="desktop-task-head">
                          <div>
                            <strong>{item.serialNumber}</strong>
                            <p className="desktop-card-copy">
                              {item.productName} • {item.productCode}
                            </p>
                          </div>
                          <div className="desktop-mini-label">
                            {formatSerialRegistryStatusLabel(item.status)}
                          </div>
                        </div>
                        <div className="desktop-task-meta">
                          <span>
                            Location:{" "}
                            {item.locationName
                              ? `${item.locationName}${item.locationCode ? ` • ${item.locationCode}` : ""}`
                              : item.locationCode ?? "Unassigned"}
                          </span>
                          {item.departmentName ? <span>Department: {item.departmentName}</span> : null}
                          {item.categoryName ? <span>Category: {item.categoryName}</span> : null}
                          {item.subcategory ? <span>Subcategory: {item.subcategory}</span> : null}
                          {item.sourceTransactionNo ? (
                            <span>Reference: {item.sourceTransactionNo}</span>
                          ) : null}
                        </div>
                        <div className="desktop-inline-card">
                          <strong>Registry signal</strong>
                          <span>
                            {describeSerialRegistryStatus(item.status)} Updated{" "}
                            {formatRelativeTime(item.updatedAt)}.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : snapshot.inventoryLocations.length > 0 ? (
                  <div className="desktop-inline-card">
                    <strong>No matching serials</strong>
                    <span>
                      Try another serial, receipt, location, department, category, or status filter
                      to bring the local registry back into view.
                    </span>
                  </div>
                ) : null}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-inventory">
              <SectionCard
                eyebrow="Catalog hierarchy"
                title="Offline department and category masters"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(snapshot.productDepartments.length)} dept •{" "}
                    {numberFormatter.format(snapshot.productCategories.length)} cat
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Store-ready classification</strong>
                  <span>
                    Flash ERP now hydrates enterprise departments and categories into the store node
                    as offline setup data, so product workflows can rely on the same hierarchy even
                    during network interruptions.
                  </span>
                </div>
                {snapshot.productDepartments.length > 0 ? (
                  <div className="desktop-table">
                    <div className="desktop-table-row desktop-table-head">
                      <span>Department</span>
                      <span>Status</span>
                      <span>Categories</span>
                      <span>Signals</span>
                    </div>
                    {snapshot.productDepartments.map((department) => (
                      <div className="desktop-table-row" key={department.departmentCode}>
                        <span>
                          <strong>{department.departmentName}</strong>
                          <small>{department.departmentCode}</small>
                        </span>
                        <span>{department.status}</span>
                        <span>{numberFormatter.format(department.categoryCount)}</span>
                        <span>
                          <strong>
                            {department.description?.trim() || "No enterprise note"}
                          </strong>
                          <small>Updated {formatRelativeTime(department.updatedAt)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No local hierarchy masters yet</strong>
                    <span>
                      Departments and categories will appear here after the next downstream setup pull.
                    </span>
                  </div>
                )}
                {snapshot.productCategories.length > 0 ? (
                  <div className="desktop-table">
                    <div className="desktop-table-row desktop-table-head">
                      <span>Category</span>
                      <span>Department</span>
                      <span>Status</span>
                      <span>Signals</span>
                    </div>
                    {snapshot.productCategories.slice(0, 8).map((category) => (
                      <div className="desktop-table-row" key={category.categoryCode}>
                        <span>
                          <strong>{category.categoryName}</strong>
                          <small>{category.categoryCode}</small>
                        </span>
                        <span>{category.departmentName}</span>
                        <span>{category.status}</span>
                        <span>
                          <strong>
                            {category.description?.trim() || "No enterprise note"}
                          </strong>
                          <small>Updated {formatRelativeTime(category.updatedAt)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-sync">
              <SectionCard
                eyebrow="Store tasks"
                title="Enterprise follow-up tasks"
                extra={
                  <div className="desktop-mini-label">
                    {numberFormatter.format(snapshot.operationsMetrics.openRecoveryTasks)} open
                  </div>
                }
              >
                {snapshot.recoveryTasks.length > 0 ? (
                  <div className="desktop-filter-grid">
                    <label className="desktop-field">
                      <span>Search tasks</span>
                      <input
                        className="desktop-input"
                        onChange={(event) => setTaskBrowseQuery(event.target.value)}
                        placeholder="Task, product, transaction, location"
                        type="text"
                        value={taskBrowseQuery}
                      />
                    </label>
                    <label className="desktop-field">
                      <span>Department</span>
                      <select
                        className="desktop-input desktop-select"
                        onChange={(event) => setTaskBrowseDepartment(event.target.value)}
                        value={taskBrowseDepartment}
                      >
                        <option value="">All departments</option>
                        {snapshot.productDepartments.map((department) => (
                          <option key={department.departmentCode} value={department.departmentCode}>
                            {department.departmentName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="desktop-field">
                      <span>Category</span>
                      <select
                        className="desktop-input desktop-select"
                        disabled={!taskBrowseDepartment}
                        onChange={(event) => setTaskBrowseCategory(event.target.value)}
                        value={taskBrowseCategory}
                      >
                        <option value="">
                          {taskBrowseDepartment ? "All categories" : "Select department first"}
                        </option>
                        {taskCategoryOptions.map((category) => (
                          <option key={category.categoryCode} value={category.categoryCode}>
                            {category.categoryName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
                {filteredRecoveryTasks.length > 0 ? (
                  <div className="desktop-list">
                    {filteredRecoveryTasks.map((task) => (
                      <div className="desktop-task-item" key={task.id}>
                        <div className="desktop-task-head">
                          <div>
                            <strong>{task.title}</strong>
                            <p className="desktop-card-copy">{task.instructions}</p>
                          </div>
                          <TaskStatusBadge status={task.status} />
                        </div>
                        <div className="desktop-task-meta">
                          <span>Type: {task.taskType}</span>
                          <span>Requested {formatRelativeTime(task.requestedAt)}</span>
                          {task.taskType === "REQUEST_UPSTREAM_RESEND" ? (
                            <span>Inbound packet: {task.sourceInboundEventId}</span>
                          ) : null}
                          {task.transactionNo ? <span>Transaction: {task.transactionNo}</span> : null}
                          {task.productCode ? <span>Product: {task.productCode}</span> : null}
                          {task.productName ? <span>Name: {task.productName}</span> : null}
                          {task.departmentName ? <span>Department: {task.departmentName}</span> : null}
                          {task.categoryName ? <span>Category: {task.categoryName}</span> : null}
                          {task.subcategory ? <span>Subcategory: {task.subcategory}</span> : null}
                          {task.locationCode ? <span>Location: {task.locationCode}</span> : null}
                          {task.targetLocationCode ? (
                            <span>Target: {task.targetLocationCode}</span>
                          ) : null}
                          {task.movementType ? <span>Movement: {task.movementType}</span> : null}
                          {task.quantity !== null ? (
                            <span>Quantity: {numberFormatter.format(task.quantity)}</span>
                          ) : null}
                          {task.productCode ? (
                            <span>{task.isSerialized ? "Serialized item" : "Standard item"}</span>
                          ) : null}
                        </div>
                        {task.productName || task.departmentName || task.categoryName ? (
                          <div className="desktop-inline-card">
                            <strong>Matched local product context</strong>
                            <span>
                              {task.productName ?? task.productCode ?? "Unknown product"}
                              {task.departmentName ? ` • ${task.departmentName}` : ""}
                              {task.categoryName ? ` / ${task.categoryName}` : ""}
                              {task.subcategory ? ` / ${task.subcategory}` : ""}
                            </span>
                          </div>
                        ) : null}
                        {task.serialNumbers.length > 0 ? (
                          <div className="desktop-inline-card">
                            <strong>Task serials</strong>
                            <div className="desktop-serial-chip-list">
                              {task.serialNumbers.map((serialNumber) => (
                                <span className="desktop-serial-chip" key={serialNumber}>
                                  {serialNumber}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {task.isSerialized &&
                        (task.taskType === "APPLY_INVENTORY_ADJUSTMENT" ||
                          task.taskType === "APPLY_COUNT_VARIANCE" ||
                          task.taskType === "APPLY_STOCK_TRANSFER") ? (
                          <div className="desktop-inline-card">
                            <strong>Serialized control warning</strong>
                            <span>
                              This task targets a serialized item. Flash ERP will validate the
                              exact serial list locally before applying the adjustment, count
                              variance, or transfer.
                            </span>
                          </div>
                        ) : null}
                        <div className="desktop-inline-card">
                          <strong>Enterprise note</strong>
                          <span>
                            {task.operatorName}: {task.operatorNote}
                          </span>
                        </div>
                        {task.status === "COMPLETED" ? (
                          <div className="desktop-inline-card">
                            <strong>Store follow-up</strong>
                            <span>
                              {task.storeNote ?? "The store acknowledged this recovery task locally."}
                            </span>
                          </div>
                        ) : (
                          <div className="desktop-task-actions">
                            <button
                              className="desktop-secondary-button desktop-compact-button"
                              disabled={isBusy || !hasDesktopRuntime}
                              onClick={() =>
                                void runDesktopAction((desktopRuntime) =>
                                  desktopRuntime.completeRecoveryTask(task.id)
                                )
                              }
                              type="button"
                            >
                              {getTaskActionLabel(task.taskType)}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : snapshot.recoveryTasks.length > 0 ? (
                  <div className="desktop-inline-card">
                    <strong>No matching enterprise tasks</strong>
                    <span>
                      Adjust the task search, department, or category filter to bring the pending
                      store follow-up list back into view.
                    </span>
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No enterprise tasks</strong>
                    <span>
                      Enterprise resend and stock-control requests will appear here the next time
                      the store pulls downstream sync work.
                    </span>
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-panels desktop-view-panel desktop-view-overview desktop-view-sync desktop-view-returns desktop-split-panels">
              <SectionCard
                className="desktop-view-card desktop-view-overview desktop-view-sync"
                eyebrow="Recent sync runs"
                title="Worker history"
              >
                <div className="desktop-table">
                  <div className="desktop-table-row desktop-table-head">
                    <span>Run</span>
                    <span>Result</span>
                    <span>Processed</span>
                    <span>Started</span>
                  </div>
                  {snapshot.recentRuns.map((run) => (
                    <div className="desktop-table-row" key={run.id}>
                      <span>
                        <strong>{run.runKind}</strong>
                        <small>{run.summary}</small>
                      </span>
                      <span>{run.result}</span>
                      <span>
                        {run.upstreamProcessed}/{run.downstreamApplied}
                      </span>
                      <span>{formatRelativeTime(run.startedAt)}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                className="desktop-view-card desktop-view-returns"
                eyebrow="Recent local sales"
                title="Transaction ledger"
                extra={
                  <div className="desktop-mini-label">
                    {snapshot.receiptSettings.templateMode === "linked"
                      ? snapshot.receiptSettings.salesReceiptTemplateName ??
                        "Linked thermal template"
                      : snapshot.receiptSettings.templateMode === "legacy"
                        ? "Legacy thermal template"
                        : "Default thermal slip"}
                  </div>
                }
              >
                <div className="desktop-table">
                  <div className="desktop-table-row desktop-table-head">
                    <span>Transaction</span>
                    <span>Status</span>
                    <span>Total</span>
                    <span>Updated</span>
                  </div>
                  {snapshot.recentTransactions.map((transaction) => {
                    const correctionSourceTransactionNo =
                      transaction.completedAt !== null
                        ? getCorrectionSourceTransactionNo(transaction)
                        : null;
                    const canStartReturn =
                      transaction.completedAt !== null &&
                      (transaction.transactionType === "SALE" ||
                        transaction.transactionType === "EXCHANGE");
                    const canStartExchange = canStartReturn;

                    return (
                      <div className="desktop-table-row" key={transaction.transactionNo}>
                        <span>
                          <strong>{transaction.transactionNo}</strong>
                          <small>
                            {formatTransactionTypeLabel(transaction.transactionType)} •{" "}
                            {transaction.completedAt
                              ? `Completed ${formatRelativeTime(transaction.completedAt)}`
                              : "Still local-only"}
                          </small>
                          <div className="desktop-task-meta">
                            <span>
                              Customer:{" "}
                              {transaction.customerName ??
                                transaction.customerNo ??
                                "Walk-in / no local customer"}
                            </span>
                            {transaction.cashierCode ? (
                              <span>Cashier: {transaction.cashierCode}</span>
                            ) : null}
                            {transaction.shiftNo ? <span>Shift: {transaction.shiftNo}</span> : null}
                            {transaction.sourceTransactionNo ? (
                              <span>Source: {transaction.sourceTransactionNo}</span>
                            ) : null}
                            <span>{numberFormatter.format(transaction.lineCount)} line(s)</span>
                          </div>
                          <div className="desktop-task-actions">
                            {correctionSourceTransactionNo ? (
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy || isReceiptLookupBusy}
                                onClick={() => {
                                  setActiveView("Sell");
                                  void runReceiptLookup(correctionSourceTransactionNo);
                                }}
                                type="button"
                              >
                                {getCorrectionSourceActionLabel(transaction.transactionType)}
                              </button>
                            ) : null}
                            {canStartReturn ? (
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy || Boolean(snapshot?.activeBasket)}
                                onClick={() => {
                                  setActiveView("Sell");
                                  void startReceiptCorrectionBasket(
                                    "RETURN",
                                    transaction.transactionNo
                                  );
                                }}
                                type="button"
                              >
                                Start return
                              </button>
                            ) : null}
                            {canStartExchange ? (
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                disabled={isBusy || Boolean(snapshot?.activeBasket)}
                                onClick={() => {
                                  setActiveView("Sell");
                                  void startReceiptCorrectionBasket(
                                    "EXCHANGE",
                                    transaction.transactionNo
                                  );
                                }}
                                type="button"
                              >
                                Start exchange
                              </button>
                            ) : null}
                            {transaction.completedAt ? (
                              <button
                                className="desktop-secondary-button desktop-compact-button"
                                onClick={() => void openReceiptPrintWindow(transaction.transactionNo)}
                                type="button"
                              >
                                Print thermal slip
                              </button>
                            ) : null}
                          </div>
                        </span>
                        <span>{transaction.status}</span>
                        <span>{currencyFormatter.format(transaction.totalAmount)}</span>
                        <span>{formatRelativeTime(transaction.updatedAt)}</span>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </section>

            <section className="desktop-grid desktop-view-panel desktop-view-sell">
              <SectionCard
                eyebrow="Lane hardware"
                title="Thermal receipt routing"
                extra={
                  <div className="desktop-mini-label">
                    {snapshot.receiptPrinterSettings.selectedPrinterName ?? "Preview only"}
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Dedicated printer route for this desktop</strong>
                  <span>
                    Choose the thermal printer this node should target. Flash ERP can either open
                    an interactive slip preview or send the receipt directly to the saved device
                    when silent printing is enabled.
                  </span>
                </div>

                <div className="desktop-task-meta">
                  <span>
                    Current route:{" "}
                    {snapshot.receiptPrinterSettings.selectedPrinterName ?? "Manual preview only"}
                  </span>
                  <span>
                    Silent print:{" "}
                    {snapshot.receiptPrinterSettings.silentPrintEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <span>
                    Auto print on checkout:{" "}
                    {snapshot.receiptPrinterSettings.autoPrintOnComplete ? "Enabled" : "Disabled"}
                  </span>
                  <span>Receipt template: {receiptTemplateLabel}</span>
                </div>

                <div className="desktop-form-grid desktop-printer-grid">
                  <label className="desktop-field">
                    <span>Receipt printer</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setReceiptPrinterNameDraft(event.target.value)}
                      value={receiptPrinterNameDraft}
                    >
                      {printerOptions.map((option) => (
                        <option key={option.value || "manual-preview"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="desktop-secondary-button"
                    disabled={isPrinterListBusy}
                    onClick={() => void refreshReceiptPrinterList()}
                    type="button"
                  >
                    {isPrinterListBusy ? "Refreshing..." : "Refresh printers"}
                  </button>
                  <button
                    className="desktop-primary-button"
                    disabled={
                      isBusy ||
                      !hasUnsavedReceiptPrinterSettings ||
                      (receiptSilentPrintEnabled && !receiptPrinterNameDraft.trim())
                    }
                    onClick={() => void saveReceiptPrinterRouting()}
                    type="button"
                  >
                    {isBusy ? "Saving..." : "Save routing"}
                  </button>
                </div>

                <div className="desktop-toggle-grid">
                  <button
                    className={
                      receiptSilentPrintEnabled
                        ? "desktop-primary-button"
                        : "desktop-secondary-button"
                    }
                    onClick={() => setReceiptSilentPrintEnabled((current) => !current)}
                    type="button"
                  >
                    {receiptSilentPrintEnabled
                      ? "Silent direct print enabled"
                      : "Enable silent direct print"}
                  </button>
                  <button
                    className={
                      receiptAutoPrintOnComplete
                        ? "desktop-primary-button"
                        : "desktop-secondary-button"
                    }
                    onClick={() => setReceiptAutoPrintOnComplete((current) => !current)}
                    type="button"
                  >
                    {receiptAutoPrintOnComplete
                      ? "Auto print after checkout enabled"
                      : "Enable auto print after checkout"}
                  </button>
                  <button
                    className="desktop-secondary-button"
                    disabled={!hasUnsavedReceiptPrinterSettings}
                    onClick={() => restoreSavedReceiptPrinterDrafts()}
                    type="button"
                  >
                    Restore saved routing
                  </button>
                </div>

                {receiptSilentPrintEnabled && !receiptPrinterNameDraft.trim() ? (
                  <div className="desktop-inline-card">
                    <strong>Printer required for silent mode</strong>
                    <span>
                      Select a receipt printer before enabling silent direct printing. Otherwise
                      Flash ERP will fall back to interactive thermal preview only.
                    </span>
                  </div>
                ) : null}

                {availableReceiptPrinters.length > 0 ? (
                  <div className="desktop-stack-compact">
                    <span className="desktop-serial-caption">Discovered printers on this desktop</span>
                    <div className="desktop-serial-chip-list">
                      {availableReceiptPrinters.map((printer) => (
                        <span className="desktop-serial-chip" key={printer.name}>
                          {printer.displayName}
                          {printer.isDefault ? " • default" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No printers discovered yet</strong>
                    <span>
                      Refresh the device list after the operating system has loaded the thermal
                      printer. Manual preview and interactive printing will still work meanwhile.
                    </span>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                eyebrow="Lane hardware"
                title="Scanner and drawer control"
                extra={
                  <div className="desktop-mini-label">
                    {selectedCashDrawerTenderMethod?.tenderMethodName ?? "Scanner assist"}
                  </div>
                }
              >
                <div className="desktop-inline-card">
                  <strong>Keyboard-wedge scanning and drawer trigger</strong>
                  <span>
                    Flash ERP can keep the sell lane focused for continuous scanning, print a
                    thermal hardware test slip, and send a drawer-trigger slip through the saved
                    thermal route for cash-enabled tenders.
                  </span>
                </div>

                <div className="desktop-task-meta">
                  <span>
                    Saved printer route:{" "}
                    {snapshot.receiptPrinterSettings.selectedPrinterName ?? "Not configured"}
                  </span>
                  <span>
                    Scanner submit:{" "}
                    {
                      scannerSubmitModeOptions.find((option) => option.value === scannerSubmitMode)
                        ?.label
                    }
                  </span>
                  <span>Sticky focus: {scannerKeepFocus ? "Enabled" : "Disabled"}</span>
                  <span>
                    Drawer-enabled tenders:{" "}
                    {numberFormatter.format(cashDrawerEligibleTenderMethods.length)}
                  </span>
                </div>

                <div className="desktop-form-grid desktop-printer-grid">
                  <label className="desktop-field">
                    <span>Drawer tender</span>
                    <select
                      className="desktop-input desktop-select"
                      onChange={(event) => setCashDrawerTenderMethodCode(event.target.value)}
                      value={cashDrawerTenderMethodCode}
                    >
                      {cashDrawerEligibleTenderMethods.length === 0 ? (
                        <option value="">No drawer-enabled tender methods</option>
                      ) : (
                        cashDrawerEligibleTenderMethods.map((method) => (
                          <option key={method.tenderMethodCode} value={method.tenderMethodCode}>
                            {method.tenderMethodName} ({method.paymentMethod})
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="desktop-field">
                    <span>Drawer note</span>
                    <input
                      className="desktop-input"
                      onChange={(event) => setCashDrawerReasonDraft(event.target.value)}
                      placeholder="Optional note for the drawer trigger slip"
                      value={cashDrawerReasonDraft}
                    />
                  </label>
                  <button
                    className="desktop-secondary-button"
                    disabled={
                      isThermalTestSlipBusy || !snapshot.receiptPrinterSettings.selectedPrinterName
                    }
                    onClick={() => void printThermalTestSlip()}
                    type="button"
                  >
                    {isThermalTestSlipBusy ? "Printing..." : "Print test slip"}
                  </button>
                  <button
                    className="desktop-primary-button"
                    disabled={
                      isCashDrawerBusy ||
                      !snapshot.receiptPrinterSettings.selectedPrinterName ||
                      !activeShift ||
                      !activeOperatorOwnsShift ||
                      cashDrawerEligibleTenderMethods.length === 0
                    }
                    onClick={() => void kickCashDrawer()}
                    type="button"
                  >
                    {isCashDrawerBusy ? "Triggering..." : "Trigger cash drawer"}
                  </button>
                </div>

                {cashDrawerEligibleTenderMethods.length > 0 ? (
                  <div className="desktop-stack-compact">
                    <span className="desktop-serial-caption">Drawer-enabled tender methods</span>
                    <div className="desktop-serial-chip-list">
                      {cashDrawerEligibleTenderMethods.map((method) => (
                        <span className="desktop-serial-chip" key={method.tenderMethodCode}>
                          {method.tenderMethodName}
                          {method.paymentMethod ? ` • ${method.paymentMethod}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="desktop-inline-card">
                    <strong>No drawer-enabled tenders are synced</strong>
                    <span>
                      Activate at least one tender method with drawer access at enterprise, then
                      sync this desktop again before triggering the cash drawer route locally.
                    </span>
                  </div>
                )}

                {!snapshot.receiptPrinterSettings.selectedPrinterName ? (
                  <div className="desktop-inline-card">
                    <strong>Saved thermal route required</strong>
                    <span>
                      Save a receipt printer in the thermal routing card first. Flash ERP sends the
                      hardware test slip and drawer trigger through that saved device route.
                    </span>
                  </div>
                ) : null}

                {!activeShift || !activeOperatorOwnsShift ? (
                  <div className="desktop-inline-card">
                    <strong>Active cashier shift required for drawer trigger</strong>
                    <span>
                      Sign in as the cashier who owns the current open shift before sending the
                      drawer-trigger slip. Thermal test slips can still be printed separately.
                    </span>
                  </div>
                ) : null}
              </SectionCard>
            </section>
          </>
        ) : (
          <div className="desktop-card desktop-loading-card">
            <p className="desktop-eyebrow">Loading</p>
            <h2>
              {error === desktopRuntimeUnavailableMessage
                ? "Desktop runtime unavailable"
                : "Preparing the local store node"}
            </h2>
            <p>
              {error === desktopRuntimeUnavailableMessage
                ? "Open the sell workspace from the Electron store desktop shell so local sync commands and cashier actions are available."
                : "The desktop runtime is opening the store database and reading queue telemetry."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
