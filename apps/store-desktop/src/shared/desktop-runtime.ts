import type {
  PurchaseOrderClosureReason,
  InventoryBatchAllocationPayload,
  StoreRemoteInterStoreRequestInput,
  StoreRemoteInventoryLookupRequest,
  StoreRemoteInventoryLookupResponse,
  StoreNodeSyncPolicy,
  SupplierClaimReason,
  SyncPaymentMethod,
  SyncPosLineIntent,
  SyncPosTransactionType,
  SyncPromotionDiscountType,
  SyncPromotionTargetScope
} from "@flash-erp/sync-core";
import type { LayawaySettings } from "@flash-erp/domain";

export type StoreInventoryBatchAllocation = InventoryBatchAllocationPayload;

export type StoreEcommerceFulfillmentEligibility = {
  supportsPickup: boolean;
  supportsDelivery: boolean;
  routingPriority: number;
  label: string;
};

export function readStoreEcommerceFulfillmentEligibility(
  value: string | null | undefined,
) {
  const byLocation = new Map<string, StoreEcommerceFulfillmentEligibility>();

  if (!value?.trim()) {
    return byLocation;
  }

  let rows: unknown;

  try {
    rows = JSON.parse(value);
  } catch {
    return byLocation;
  }

  if (!Array.isArray(rows)) {
    return byLocation;
  }

  for (const row of rows) {
    if (
      typeof row !== "object" ||
      row === null ||
      typeof row.inventoryLocationCode !== "string" ||
      typeof row.storefrontStoreName !== "string" ||
      typeof row.supportsPickup !== "boolean" ||
      typeof row.supportsDelivery !== "boolean" ||
      typeof row.routingPriority !== "number"
    ) {
      continue;
    }

    const locationCode = row.inventoryLocationCode.trim().toUpperCase();

    if (!locationCode) {
      continue;
    }

    const modes = [
      row.supportsPickup ? "pickup" : null,
      row.supportsDelivery ? "delivery" : null,
    ].filter((mode): mode is string => Boolean(mode));
    const detail = `${row.storefrontStoreName}: ${modes.length ? modes.join(" + ") : "disabled"} (priority ${row.routingPriority})`;
    const current = byLocation.get(locationCode);

    byLocation.set(locationCode, {
      supportsPickup: (current?.supportsPickup ?? false) || row.supportsPickup,
      supportsDelivery:
        (current?.supportsDelivery ?? false) || row.supportsDelivery,
      routingPriority: Math.min(
        current?.routingPriority ?? Number.MAX_SAFE_INTEGER,
        row.routingPriority,
      ),
      label: current ? `${current.label}; ${detail}` : detail,
    });
  }

  return byLocation;
}

export type StoreCatalogBatchAvailability = {
  batchId: string;
  batchNo: string;
  manufacturedAt: string | null;
  expiryDate: string;
  quantityOnHand: number;
  status: string;
};

export type DesktopRuntimeContext = {
  mode: "store-desktop";
  offlineFirst: true;
  platform: string;
  nodeVersion: string;
  electronVersion: string;
  storeRuntimeRole: "embedded" | "store-server" | "terminal-client";
  storeDatabaseProvider: "sqlite" | "postgres" | "mssql";
  terminalCode: string | null;
  storeServerUrl: string | null;
};

export type StoreServerHealth = {
  status: "ready" | "unavailable";
  deploymentMode: StoreDeploymentMode;
  role: "embedded" | "store-server" | "terminal-client";
  databaseProvider: "sqlite" | "postgres" | "mssql";
  storeCode: string | null;
  storeName: string | null;
  nodeCode: string | null;
  terminalCode: string | null;
  databasePath: string | null;
  databaseSizeBytes: number | null;
  serviceStartedAt: string | null;
  uptimeSeconds: number | null;
  tokenRequired: boolean;
  connectedTerminals: number;
  openShifts: number;
  upstreamQueued: number;
  downstreamQueued: number;
  deadLetter: number;
  generatedAt: string;
};

export type StoreRuntimeStatus = {
  deploymentMode: StoreDeploymentMode;
  role: "embedded" | "store-server" | "terminal-client";
  databaseProvider: "sqlite" | "postgres" | "mssql";
  terminalCode: string | null;
  storeServerUrl: string | null;
  localServerUrl: string | null;
  syncBaseUrl: string | null;
  connected: boolean;
  message: string;
  serverHealth: StoreServerHealth | null;
  requestTimeoutMs: number;
  checkedAt: string;
};

export type StoreDesktopWindowStatus = {
  ready: boolean;
  watchdogState: "waiting" | "healthy" | "stale" | "recovering" | "unavailable";
  visible: boolean;
  focused: boolean;
  minimized: boolean;
  maximized: boolean;
  fullScreen: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  rendererReadyAt: string | null;
  lastRendererHeartbeatAt: string | null;
  heartbeatAgeMs: number | null;
  lastWatchdogCheckAt: string | null;
  lastReadyTimeoutAt: string | null;
  readyTimeoutCount: number;
  staleHeartbeatCount: number;
  lastRecoveryAt: string | null;
  lastRecoveryReason: string | null;
  recoveryInFlight: boolean;
  recoveryCount: number;
  loadFailureCount: number;
  lastLoadFailure: string | null;
  supportLogPath: string;
  checkedAt: string;
};

export type StoreDesktopUpdateStatus = {
  status:
    | "disabled"
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  currentVersion: string;
  availableVersion: string | null;
  message: string;
  feedUrl: string | null;
  checkedAt: string | null;
  downloadedAt: string | null;
  downloadPercent: number | null;
};

export type StoreDesktopConnectionConfig = {
  deploymentMode: StoreDeploymentMode;
  runtimeRole: "embedded" | "store-server" | "terminal-client";
  databaseProvider: "sqlite" | "postgres" | "mssql";
  nodeCode: string;
  terminalCode: string;
  terminalName: string;
  storeServerUrl: string;
  storeServerToken: string;
  storeServerHost: string;
  storeServerPort: number;
  storeServerTimeoutMs: number;
  storeServerEnabled: boolean;
  databaseUrl: string;
  databasePath: string;
  userDataPath: string;
  syncBaseUrl: string;
  updateFeedUrl: string;
};

export type StoreDeploymentMode = "ENTERPRISE_MANAGED" | "STANDALONE";

export type StoreDesktopConnectionConfigResult = {
  config: StoreDesktopConnectionConfig;
  configPath: string;
  supportLogPath: string;
  restartRequired: boolean;
};

export type StoreDesktopDatabaseProvisionResult = {
  message: string;
  schemaReady: boolean;
};

export type StoreSyncHealth = "healthy" | "lagging" | "attention";

const fullDayMinutes = 24 * 60;

export const defaultStoreNodeSyncPolicy: StoreNodeSyncPolicy = {
  autoSyncEnabled: true,
  intervalMinutes: 15,
  activeFromMinutes: 0,
  activeToMinutes: fullDayMinutes,
  jitterSeconds: 30,
  backoffBaseSeconds: 60,
  backoffMaxSeconds: 900,
  nextScheduledSyncAt: null,
  lastManualSyncAt: null,
  lastAutoSyncAt: null
};

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeStoreNodeSyncPolicy(
  input?: Partial<StoreNodeSyncPolicy> | null
): StoreNodeSyncPolicy {
  return {
    autoSyncEnabled:
      typeof input?.autoSyncEnabled === "boolean"
        ? input.autoSyncEnabled
        : defaultStoreNodeSyncPolicy.autoSyncEnabled,
    intervalMinutes: clampInteger(
      input?.intervalMinutes,
      defaultStoreNodeSyncPolicy.intervalMinutes,
      1,
      1440
    ),
    activeFromMinutes: clampInteger(
      input?.activeFromMinutes,
      defaultStoreNodeSyncPolicy.activeFromMinutes,
      0,
      fullDayMinutes - 1
    ),
    activeToMinutes: clampInteger(
      input?.activeToMinutes,
      defaultStoreNodeSyncPolicy.activeToMinutes,
      1,
      fullDayMinutes
    ),
    jitterSeconds: clampInteger(
      input?.jitterSeconds,
      defaultStoreNodeSyncPolicy.jitterSeconds,
      0,
      600
    ),
    backoffBaseSeconds: clampInteger(
      input?.backoffBaseSeconds,
      defaultStoreNodeSyncPolicy.backoffBaseSeconds,
      1,
      3600
    ),
    backoffMaxSeconds: clampInteger(
      input?.backoffMaxSeconds,
      defaultStoreNodeSyncPolicy.backoffMaxSeconds,
      1,
      7200
    ),
    nextScheduledSyncAt: normalizeIsoDate(input?.nextScheduledSyncAt),
    lastManualSyncAt: normalizeIsoDate(input?.lastManualSyncAt),
    lastAutoSyncAt: normalizeIsoDate(input?.lastAutoSyncAt)
  };
}

export function readStoreSyncPolicyFromMetadata(
  metadata: Record<string, string | undefined>
): StoreNodeSyncPolicy {
  return normalizeStoreNodeSyncPolicy({
    autoSyncEnabled: metadata.sync_auto_enabled == null ? undefined : metadata.sync_auto_enabled === "1",
    intervalMinutes: Number(metadata.sync_interval_minutes),
    activeFromMinutes: Number(metadata.sync_active_from_minutes),
    activeToMinutes: Number(metadata.sync_active_to_minutes),
    jitterSeconds: Number(metadata.sync_jitter_seconds),
    backoffBaseSeconds: Number(metadata.sync_backoff_base_seconds),
    backoffMaxSeconds: Number(metadata.sync_backoff_max_seconds),
    nextScheduledSyncAt: metadata.next_scheduled_sync_at ?? null,
    lastManualSyncAt: metadata.last_manual_sync_at ?? null,
    lastAutoSyncAt: metadata.last_auto_sync_at ?? null
  });
}

export function storeSyncPolicyToMetadataEntries(policy: StoreNodeSyncPolicy) {
  const normalized = normalizeStoreNodeSyncPolicy(policy);

  return [
    ["sync_auto_enabled", normalized.autoSyncEnabled ? "1" : "0"],
    ["sync_interval_minutes", String(normalized.intervalMinutes)],
    ["sync_active_from_minutes", String(normalized.activeFromMinutes)],
    ["sync_active_to_minutes", String(normalized.activeToMinutes)],
    ["sync_jitter_seconds", String(normalized.jitterSeconds)],
    ["sync_backoff_base_seconds", String(normalized.backoffBaseSeconds)],
    ["sync_backoff_max_seconds", String(normalized.backoffMaxSeconds)],
    ["next_scheduled_sync_at", normalized.nextScheduledSyncAt ?? ""],
    ["last_manual_sync_at", normalized.lastManualSyncAt ?? ""],
    ["last_auto_sync_at", normalized.lastAutoSyncAt ?? ""]
  ] as const;
}

function getMinutesSinceMidnight(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

function isWithinActiveWindow(value: Date, policy: StoreNodeSyncPolicy) {
  if (policy.activeFromMinutes === 0 && policy.activeToMinutes >= fullDayMinutes) {
    return true;
  }

  const minutes = getMinutesSinceMidnight(value);

  if (policy.activeFromMinutes < policy.activeToMinutes) {
    return minutes >= policy.activeFromMinutes && minutes < policy.activeToMinutes;
  }

  return minutes >= policy.activeFromMinutes || minutes < policy.activeToMinutes;
}

function setMinutesSinceMidnight(value: Date, minutes: number) {
  const next = new Date(value);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function nextActiveWindowStart(value: Date, policy: StoreNodeSyncPolicy) {
  const candidateToday = setMinutesSinceMidnight(value, policy.activeFromMinutes);

  if (policy.activeFromMinutes < policy.activeToMinutes) {
    if (value.getTime() < candidateToday.getTime()) {
      return candidateToday;
    }

    const tomorrow = new Date(candidateToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  if (getMinutesSinceMidnight(value) < policy.activeFromMinutes && getMinutesSinceMidnight(value) >= policy.activeToMinutes) {
    return candidateToday;
  }

  return value;
}

function applyActiveWindow(value: Date, policy: StoreNodeSyncPolicy) {
  return isWithinActiveWindow(value, policy) ? value : nextActiveWindowStart(value, policy);
}

export function computeNextStoreSyncAt(input: {
  policy: StoreNodeSyncPolicy;
  baseAt?: Date | string | null;
  failureCount?: number;
  includeJitter?: boolean;
}) {
  const policy = normalizeStoreNodeSyncPolicy(input.policy);
  const baseAt =
    input.baseAt instanceof Date
      ? input.baseAt
      : typeof input.baseAt === "string"
        ? new Date(input.baseAt)
        : new Date();
  const safeBaseAt = Number.isNaN(baseAt.getTime()) ? new Date() : baseAt;
  const failureCount = Math.max(0, Math.trunc(input.failureCount ?? 0));
  const delayMs =
    failureCount > 0
      ? Math.min(
          policy.backoffMaxSeconds,
          policy.backoffBaseSeconds * 2 ** Math.max(0, failureCount - 1)
        ) * 1000
      : policy.intervalMinutes * 60_000;
  const jitterMs =
    input.includeJitter === false || policy.jitterSeconds <= 0
      ? 0
      : Math.floor(Math.random() * (policy.jitterSeconds + 1)) * 1000;
  const next = new Date(safeBaseAt.getTime() + delayMs + jitterMs);

  return applyActiveWindow(next, policy).toISOString();
}

export function resolveInventoryTransferUom(input: {
  enteredQuantity: number;
  requestedUnitOfMeasure?: string | null;
  unitOfMeasure?: string | null;
  baseUnitOfMeasure?: string | null;
  uomConversions?: StoreCatalogBrowseItem["uomConversions"];
}) {
  const requestedUnitQuantity = Number(Number(input.enteredQuantity).toFixed(3));
  if (!Number.isFinite(requestedUnitQuantity) || requestedUnitQuantity <= 0) {
    throw new Error("Enter a transfer quantity greater than zero.");
  }

  const baseUnitOfMeasure = (
    input.baseUnitOfMeasure?.trim() ||
    input.unitOfMeasure?.trim() ||
    "EA"
  ).toUpperCase();
  const requestedUnitOfMeasure = (
    input.requestedUnitOfMeasure?.trim() ||
    input.unitOfMeasure?.trim() ||
    baseUnitOfMeasure
  ).toUpperCase();
  const conversion = (input.uomConversions ?? []).find(
    (item) => item.uomCode.trim().toUpperCase() === requestedUnitOfMeasure,
  );

  if (!conversion && requestedUnitOfMeasure !== baseUnitOfMeasure) {
    throw new Error(
      `Unit ${requestedUnitOfMeasure} is not configured for this product. Pull the latest product setup and try again.`,
    );
  }

  const uomConversionFactor =
    requestedUnitOfMeasure === baseUnitOfMeasure
      ? 1
      : Number(conversion?.conversionFactor ?? 0);
  if (!Number.isFinite(uomConversionFactor) || uomConversionFactor <= 0) {
    throw new Error(
      `Unit ${requestedUnitOfMeasure} has an invalid base-unit conversion.`,
    );
  }

  return {
    requestedUnitOfMeasure,
    requestedUnitQuantity,
    uomConversionFactor: Number(uomConversionFactor.toFixed(6)),
    baseUnitOfMeasure,
    baseQuantity: Number(
      (requestedUnitQuantity * uomConversionFactor).toFixed(3),
    ),
  };
}

export type StoreSyncRunOptions = {
  trigger?: "manual" | "scheduled" | "tray" | "startup";
  scheduledFor?: string | null;
  drainDownstream?: boolean | null;
  snapshotMode?: "full" | "status" | null;
};

export type StoreSyncCycleStartResult = {
  accepted: boolean;
  status: "started" | "busy" | "unavailable";
  trigger: NonNullable<StoreSyncRunOptions["trigger"]>;
  message: string;
  startedAt: string | null;
};

export type StoreSyncCycleStatusEvent = {
  traceId: string;
  trigger: NonNullable<StoreSyncRunOptions["trigger"]>;
  status: "completed" | "failed";
  message: string;
  elapsedMs: number;
  completedAt: string;
};

export type StoreQueueMetrics = {
  upstreamQueued: number;
  upstreamInFlight: number;
  downstreamQueued: number;
  deadLetter: number;
};

export type StoreOperationsMetrics = {
  completedSales: number;
  parkedSales: number;
  openShifts: number;
  connectedTerminals: number;
  openSalesOrders: number;
  catalogItems: number;
  barcodeLinks: number;
  availableUnits: number;
  openPurchaseOrders: number;
  openInterStoreTransfers: number;
  openStockCountSessions: number;
  recentCloseouts: number;
  recentBankingDeposits: number;
  bankedAmount: number;
  pendingBankingAmount: number;
  openRecoveryTasks: number;
};

export type StoreSyncRun = {
  id: string;
  runKind: string;
  result: string;
  summary: string;
  upstreamProcessed: number;
  downstreamApplied: number;
  startedAt: string;
  finishedAt: string | null;
};

export type StoreSyncDiagnosticsExportInput = {
  fileName: string;
  diagnostic: Record<string, unknown>;
};

export type StoreSyncDeadLetterSummary = {
  id: string;
  direction: "UPSTREAM" | "DOWNSTREAM";
  status: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  nodeCode: string | null;
  attemptCount: number;
  failureKind: string | null;
  lastHttpStatus: number | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  syncRunId: string | null;
  errorMessage: string | null;
  diagnosticSummary: string;
  payloadPreview: string;
  createdAt: string;
  updatedAt: string;
};

export type StoreSyncEventDetail = {
  id: string;
  direction: "UPSTREAM" | "DOWNSTREAM";
  status: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  nodeCode: string | null;
  attemptCount: number;
  failureKind: string | null;
  lastHttpStatus: number | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  syncRunId: string | null;
  summary: string;
  errorMessage: string | null;
  diagnosticSummary: string;
  payloadPreview: string;
  createdAt: string;
  appliedAt: string | null;
  acknowledgedAt: string | null;
  updatedAt: string;
};

export type StoreTransactionSummary = {
  transactionNo: string;
  sourceTransactionNo: string | null;
  transactionType: SyncPosTransactionType;
  status: string;
  totalAmount: number;
  customerNo: string | null;
  customerName: string | null;
  terminalCode: string | null;
  cashierCode: string | null;
  shiftNo: string | null;
  lineCount: number;
  updatedAt: string;
  completedAt: string | null;
};

export type StoreTerminalConnectionSummary = {
  terminalCode: string;
  clientName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  requestCount: number;
  lastMethod: string | null;
  remoteAddress: string | null;
  online: boolean;
};

export type StoreCustomerSummary = {
  customerId: string;
  customerNo: string;
  fullName: string;
  customerType: string;
  phone: string | null;
  email: string | null;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  city: string | null;
  countryCode: string | null;
  loyaltyEnrolled: boolean;
  loyaltyTier: string | null;
  loyaltyPointsBalance: number;
  allowCreditSales: boolean;
  creditLimitAmount: number | null;
  receivableBalanceAmount: number;
  status: string;
  note: string | null;
  updatedAt: string;
};

export type StoreCustomerAccountEntrySummary = {
  entryId: string;
  entryNo: string;
  customerId: string;
  customerNo: string;
  customerName: string;
  entryType: "ACCOUNT_PAYMENT";
  paymentMethod: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  amount: number;
  reference: string | null;
  note: string | null;
  shiftId: string;
  shiftNo: string | null;
  cashierCode: string | null;
  syncedAt: string | null;
  occurredAt: string;
  updatedAt: string;
};

export type StoreCustomerSearchRequest = {
  query?: string;
  limit?: number;
};

export type StoreTransactionReferenceSearchRequest = {
  query?: string;
  limit?: number;
};

export type StoreTransactionReferenceSummary = {
  id: string;
  reference: string;
  normalizedReference: string;
  details: string | null;
  firstTransactionNo: string | null;
  lastTransactionNo: string | null;
  useCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
};

export type StoreUserSummary = {
  userId: string;
  loginId: string;
  displayName: string;
  email: string | null;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  roleCodes: string[];
  roleNames: string[];
  permissionCodes: string[];
  cashierEligible: boolean;
  supervisorEligible: boolean;
  updatedAt: string;
};

export type StoreRoleSummary = {
  roleCode: string;
  roleName: string;
  description: string | null;
  status: string;
  permissionCodes: string[];
  userCount: number;
  updatedAt: string;
};

export type StorePermissionSummary = {
  permissionCode: string;
  permissionName: string;
  description: string | null;
  updatedAt: string;
};

export type StoreOperatorCapabilities = {
  cashierEligible: boolean;
  supervisorEligible: boolean;
  canOpenShift: boolean;
  canCloseShift: boolean;
  canProcessSale: boolean;
  canProcessReturn: boolean;
  canProcessExchange: boolean;
  canSearchReceipt: boolean;
  canReprintReceipt: boolean;
  canAttachCustomer: boolean;
  canCollectAccountPayment: boolean;
  canRedeemLoyalty: boolean;
  canApproveNoReceiptReturn: boolean;
  canApproveDiscountOverride: boolean;
  canApprovePriceOverride: boolean;
  hasInventoryVisibility: boolean;
  canAdjustInventory: boolean;
  canSubmitCount: boolean;
  canCommitCount: boolean;
  canRequestTransfer: boolean;
  canIssueTransfer: boolean;
  canReceiveTransfer: boolean;
  canReceiveGoods: boolean;
  canManageSupplierReturns: boolean;
  canOperateStoreSync: boolean;
};

export type StoreOperatorSessionSummary = {
  sessionId: string;
  userId: string;
  loginId: string;
  displayName: string;
  email: string | null;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  roleCodes: string[];
  roleNames: string[];
  permissionCodes: string[];
  openedAt: string;
  lastSeenAt: string;
  capabilities: StoreOperatorCapabilities;
};

export type StoreShiftTenderSummary = {
  method: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  netAmount: number;
  transactionCount: number;
};

export type StoreShiftSummary = {
  shiftId: string;
  shiftNo: string;
  terminalCode: string;
  cashierCode: string;
  status: "OPEN" | "CLOSED";
  openingFloatAmount: number;
  expectedCashAmount: number;
  declaredCashAmount: number | null;
  varianceAmount: number | null;
  transactionCount: number;
  salesCount: number;
  returnCount: number;
  exchangeCount: number;
  netSalesAmount: number;
  cashTenderedAmount: number;
  nonCashTenderedAmount: number;
  accountPaymentsAmount: number;
  openedAt: string;
  closedAt: string | null;
  tenderTotals: StoreShiftTenderSummary[];
};

export type StoreBasketLineSummary = {
  lineId: string;
  lineIntent: SyncPosLineIntent;
  sourceLineId: string | null;
  productCode: string;
  productVariantCode: string | null;
  productName: string;
  barcode: string | null;
  isSerialized: boolean;
  variantSize: string | null;
  variantColor: string | null;
  variantAttributesSnapshot: string | null;
  lineNote: string | null;
  serialNumbers: string[];
  availableSerialNumbers: string[];
  batchAllocations: StoreInventoryBatchAllocation[];
  quantity: number;
  sellingUnitOfMeasure: string;
  baseUnitOfMeasure: string;
  uomConversionFactor: number;
  baseQuantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  hasManualPriceOverride: boolean;
  hasManualDiscountOverride: boolean;
  appliedPromotionCode: string | null;
  appliedPromotionName: string | null;
};

export type StoreBasketAppliedPromotionSummary = {
  promotionCode: string;
  promotionName: string;
  discountAmount: number;
};

export type StoreBasketSummary = {
  transactionId: string;
  transactionNo: string;
  transactionType: SyncPosTransactionType;
  sourceTransactionId: string | null;
  sourceTransactionNo: string | null;
  customerId: string | null;
  customerNo: string | null;
  customerName: string | null;
  status: string;
  itemCount: number;
  lineCount: number;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  customerLoyaltyEnrolled: boolean;
  customerLoyaltyTier: string | null;
  customerLoyaltyPointsBalance: number | null;
  loyaltyRedemptionAllowed: boolean;
  loyaltyRedemptionMessage: string | null;
  loyaltyRedemptionPoints: number;
  loyaltyRedemptionAmount: number;
  maxLoyaltyRedemptionPoints: number;
  maxLoyaltyRedemptionAmount: number;
  appliedPromotions: StoreBasketAppliedPromotionSummary[];
  promotionStatusMessage: string | null;
  updatedAt: string;
  lines: StoreBasketLineSummary[];
};

export type StoreParkedBasketSummary = {
  transactionId: string;
  transactionNo: string;
  transactionType: SyncPosTransactionType;
  sourceTransactionNo: string | null;
  customerNo: string | null;
  customerName: string | null;
  itemCount: number;
  lineCount: number;
  totalAmount: number;
  updatedAt: string;
};

export type StoreSalesOrderStatus = "OPEN" | "FULFILLED" | "CANCELLED" | "EXPIRED";
export type StoreSalesOrderType = "SALES_ORDER" | "LAYAWAY";
export type StoreSalesOrderReservationStatus =
  | "NOT_APPLICABLE"
  | "ACTIVE"
  | "RELEASED"
  | "CONSUMED"
  | "EXPIRED";

export type StoreSalesOrderSummary = {
  orderId: string;
  orderNo: string;
  sourceTransactionId: string;
  sourceTransactionNo: string;
  customerId: string | null;
  customerNo: string | null;
  customerName: string | null;
  orderType: StoreSalesOrderType;
  status: StoreSalesOrderStatus;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  balanceAmount: number;
  depositTenderMethodCode: string | null;
  depositTenderMethodName: string | null;
  depositPaymentMethod: SyncPaymentMethod | null;
  depositReference: string | null;
  depositPaidAt: string | null;
  minimumDepositAmount: number;
  reservationStatus: StoreSalesOrderReservationStatus;
  reservationCreatedAt: string | null;
  reservationReleasedAt: string | null;
  layawayExpiresAt: string | null;
  expiredAt: string | null;
  cancellationFeeAmount: number;
  refundedAmount: number;
  lineCount: number;
  itemCount: number;
  operatorName: string | null;
  depositCollectedBy: string | null;
  saleCompletedBy: string | null;
  balanceCollectedBy: string | null;
  note: string | null;
  fulfilledTransactionId: string | null;
  fulfilledTransactionNo: string | null;
  syncedAt: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
};

export type StoreSalesOrderCollectionReconciliationRow = {
  orderId: string;
  orderNo: string;
  customerNo: string | null;
  customerName: string | null;
  status: StoreSalesOrderStatus;
  orderCreatedBy: string | null;
  depositCollectedBy: string | null;
  saleCompletedBy: string | null;
  balanceCollectedBy: string | null;
  depositPaidAt: string | null;
  fulfilledAt: string | null;
  activityAt: string;
  salesRecognizedAmount: number;
  openingDepositCollectedAmount: number;
  priorDepositAppliedAmount: number;
  balanceCollectedAmount: number;
  expectedTenderAmount: number;
  outstandingBalanceAmount: number;
};

export type StoreEodReconciliationSummary = {
  reconciliationId: string;
  reconciliationNo: string;
  shiftId: string;
  shiftNo: string;
  cashierCode: string;
  expectedCashAmount: number;
  declaredCashAmount: number;
  varianceAmount: number;
  netSalesAmount: number;
  cashTenderedAmount: number;
  nonCashTenderedAmount: number;
  transactionCount: number;
  operatorName: string | null;
  note: string | null;
  syncedAt: string | null;
  reconciledAt: string;
  updatedAt: string;
};

export type StoreBankingDepositSummary = {
  depositId: string;
  depositNo: string;
  reconciliationId: string;
  reconciliationNo: string;
  shiftId: string;
  shiftNo: string;
  amount: number;
  bankName: string | null;
  reference: string | null;
  operatorName: string | null;
  note: string | null;
  syncedAt: string | null;
  depositedAt: string;
  updatedAt: string;
};

export type StoreReceiptLookupLine = {
  sourceLineId: string;
  productCode: string;
  productName: string;
  barcode: string | null;
  serialNumbers: string[];
  availableSerialNumbersToReturn: string[];
  quantitySold: number;
  quantityReturned: number;
  quantityPending: number;
  quantityAvailableToReturn: number;
  sellingUnitOfMeasure: string;
  baseUnitOfMeasure: string;
  uomConversionFactor: number;
  baseQuantitySold: number;
  unitPrice: number;
  taxAmount: number;
  lineTotal: number;
};

export type StoreReceiptLookupPayment = {
  paymentId: string;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  bankAccountId: string | null;
  method: SyncPaymentMethod;
  amount: number;
  reference: string | null;
  receivedAt: string;
};

export type StoreReceiptLookupResult = {
  sourceTransactionId: string;
  sourceTransactionNo: string;
  customerId: string | null;
  transactionType: SyncPosTransactionType;
  status: string;
  totalAmount: number;
  completedAt: string | null;
  customerNo: string | null;
  customerName: string | null;
  headerReference: string | null;
  additionalDetails: string | null;
  eligibleLineCount: number;
  canStartReturn: boolean;
  canStartExchange: boolean;
  lines: StoreReceiptLookupLine[];
  payments: StoreReceiptLookupPayment[];
};

export type StoreReceiptSearchRequest = {
  query?: string;
  completedWithinDays?: number;
  limit?: number;
  receiptKind?: StoreReceiptHistoryKind;
  transactionFilter?: StoreReceiptSearchTransactionFilter;
};

export type StoreReceiptHistoryKind =
  | "SALES"
  | "SALES_ORDER"
  | "ACCOUNT_PAYMENT";

export type StoreReceiptSearchTransactionFilter =
  | "CORRECTABLE"
  | "ALL"
  | SyncPosTransactionType;

export type StoreReceiptSearchResult = {
  receiptKind: StoreReceiptHistoryKind;
  transactionId: string;
  transactionNo: string;
  sourceTransactionNo: string | null;
  transactionType: SyncPosTransactionType | "SALES_ORDER" | null;
  status: string;
  totalAmount: number;
  completedAt: string | null;
  customerNo: string | null;
  customerName: string | null;
  cashierCode: string | null;
  shiftNo: string | null;
  notes: string | null;
  lineCount: number;
  productPreview: string[];
  canStartReturn: boolean;
  canStartExchange: boolean;
};

export type StoreCatalogLookupResult = {
  query: string;
  matchedOn: "barcode" | "productCode";
  productCode: string;
  productVariantCode: string | null;
  productName: string;
  productType: string | null;
  primaryImageUrl: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  trackExpiry: boolean;
  trackSize: boolean;
  trackColor: boolean;
  mustEnterPriceAtPos: boolean;
  availableSerialNumbers: string[];
  availableBatches: StoreCatalogBatchAvailability[];
  sellingUnits: StoreProductSellingUnitSummary[];
  selectedSellingUnitOfMeasure: string;
  unitPrice: number;
  quantityOnHand: number;
  barcode: string | null;
  barcodeType: string | null;
  salesLocationCode: string | null;
  salesLocationQuantity: number | null;
  matrixVariants?: StoreCatalogMatrixVariant[];
};

export type StoreCatalogMatrixVariant = {
  variantCode: string;
  sku: string | null;
  displayName: string | null;
  unitPrice: number;
  quantityOnHand: number;
  barcode: string | null;
  status: string;
  attributes: Array<{
    attributeCode: string;
    attributeName: string;
    valueCode: string;
    valueLabel: string;
  }>;
};

export type StoreProductSellingUnitSummary = {
  productVariantCode: string | null;
  unitOfMeasureCode: string;
  unitOfMeasureName: string;
  conversionFactor: number;
  unitPrice: number;
  barcode: string | null;
  isDefault: boolean;
  allowFractionalSale: boolean;
  decimalPrecision: number;
};

export type StoreCatalogBrowseItem = {
  productCode: string;
  productName: string;
  productType: string | null;
  shortName: string | null;
  description?: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  unitOfMeasure?: string;
  baseUnitOfMeasure?: string;
  uomConversions?: Array<{
    uomCode: string;
    uomName: string;
    conversionFactor: number;
    isBaseUnit: boolean;
    allowSale: boolean;
    allowPurchase: boolean;
  }>;
  sellingUnits?: StoreProductSellingUnitSummary[];
  taxable?: boolean;
  taxProfileCode?: string | null;
  trackInventory?: boolean;
  trackExpiry?: boolean;
  shelfLifeDays?: number | null;
  earliestExpiryDate?: string | null;
  expiringQuantity?: number;
  trackSize?: boolean;
  trackColor?: boolean;
  primaryImageUrl: string | null;
  barcode: string | null;
  unitPrice: number;
  quantityOnHand: number;
  minStockLevel?: number | null;
  reorderPoint?: number | null;
  safetyStockLevel?: number | null;
  catalogSortOrder?: number | null;
  salesLocationCode: string | null;
  salesLocationQuantity: number | null;
  isSerialized: boolean;
  mustEnterPriceAtPos: boolean;
  matrixVariants?: StoreCatalogMatrixVariant[];
};

export type StoreCatalogBrowseRequest = {
  query?: string;
  departmentCode?: string | null;
  categoryCode?: string | null;
  serializedOnly?: boolean;
  sellableOnly?: boolean;
  includeInactiveCatalog?: boolean;
  limit?: number;
};

export type StoreRecoveryTaskSummary = {
  id: string;
  taskType: string;
  status: string;
  title: string;
  instructions: string;
  transactionNo: string | null;
  productCode: string | null;
  productName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  locationCode: string | null;
  targetLocationCode: string | null;
  movementType: string | null;
  quantity: number | null;
  serialNumbers: string[];
  operatorName: string;
  operatorNote: string;
  storeNote: string | null;
  requestedAt: string;
  completedAt: string | null;
  sourceInboundEventId: string;
};

export type StoreInventoryLocationSummary = {
  locationCode: string;
  locationName: string;
  locationType: string;
  status: string;
  defaults: string;
  trackedProducts: number;
  onHandQuantity: number;
  negativePositions: number;
  highlightedProducts: string[];
  updatedAt: string;
};

export type StoreInventoryBrowseItem = {
  locationCode: string;
  locationName: string;
  productCode: string;
  productName: string;
  shortName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  barcode: string | null;
  quantityOnHand: number;
  activeReservedQuantity: number;
  ecommerceSellableQuantity: number;
  ecommercePickupEligible: boolean;
  ecommerceDeliveryEligible: boolean;
  ecommerceEligibilityLabel: string;
  minStockLevel: number | null;
  reorderPoint: number | null;
  safetyStockLevel: number | null;
  unitPrice: number;
  isSerialized: boolean;
  trackExpiry: boolean;
  earliestExpiryDate: string | null;
  expiringQuantity: number;
  batchQuantities: StoreInventoryBatchAllocation[];
  updatedAt: string;
};

export type StoreInventoryBrowseRequest = {
  query?: string;
  locationCode?: string | null;
  departmentCode?: string | null;
  categoryCode?: string | null;
  serializedOnly?: boolean;
  criticalOnly?: boolean;
  expiringOnly?: boolean;
  forStartupAlert?: boolean;
  limit?: number;
};

export type StoreRemoteInventoryLookupInput = StoreRemoteInventoryLookupRequest;
export type StoreRemoteInventoryLookupResult = StoreRemoteInventoryLookupResponse;
export type StoreRemoteInterStoreStockRequestInput = StoreRemoteInterStoreRequestInput;

export type StoreSerialRegistryStatus = "AVAILABLE" | "IN_TRANSIT" | "SOLD" | "ADJUSTED_OUT";

export type StoreSerialRegistryBrowseItem = {
  productCode: string;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  serialNumber: string;
  locationCode: string | null;
  locationName: string | null;
  status: StoreSerialRegistryStatus;
  sourceTransactionId: string | null;
  sourceTransactionNo: string | null;
  updatedAt: string;
};

export type StoreSerialRegistryBrowseRequest = {
  query?: string;
  locationCode?: string | null;
  departmentCode?: string | null;
  categoryCode?: string | null;
  status?: StoreSerialRegistryStatus | null;
  limit?: number;
};

export type StorePurchaseOrderStatus =
  | "DRAFT"
  | "COMMITTED"
  | "PART_RECEIVED"
  | "RECEIVED"
  | "CLOSED";

export type StorePurchaseOrderLineSummary = {
  purchaseOrderLineId: string;
  lineNo: number;
  productCode: string;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  trackExpiry: boolean;
  orderedQuantity: number;
  receivedQuantity: number;
  exceptionQuantity: number;
  outstandingQuantity: number;
  unitCost: number | null;
};

export type StorePurchaseOrderSummary = {
  purchaseOrderId: string;
  purchaseOrderNo: string;
  status: StorePurchaseOrderStatus;
  inventoryLocationCode: string;
  inventoryLocationName: string;
  supplierNo: string | null;
  supplierName: string | null;
  externalReference: string | null;
  note: string | null;
  operatorName: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  exceptionQuantity: number;
  outstandingQuantity: number;
  lineCount: number;
  committedAt: string | null;
  closedAt: string | null;
  closureReason: PurchaseOrderClosureReason | null;
  closureNote: string | null;
  closureOperatorName: string | null;
  updatedAt: string;
  lines: StorePurchaseOrderLineSummary[];
};

export type StorePurchaseOrderBrowseRequest = {
  query?: string;
  status?: StorePurchaseOrderStatus | null;
  locationCode?: string | null;
  supplierNo?: string | null;
  limit?: number;
};

export type StorePurchaseOrderReceiptLineRequest = {
  purchaseOrderLineId: string;
  quantity: number;
  serialNumbers?: string[];
  batchNo?: string | null;
  manufacturedAt?: string | null;
  expiryDate?: string | null;
};

export type StorePurchaseOrderReceiptExceptionRequest = {
  purchaseOrderLineId: string;
  quantity: number;
  reason: SupplierClaimReason;
  note?: string | null;
};

export type StorePurchaseOrderReceiptRequest = {
  purchaseOrderId: string;
  supplierNo?: string | null;
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string;
  lines: StorePurchaseOrderReceiptLineRequest[];
  exceptionLines?: StorePurchaseOrderReceiptExceptionRequest[];
};

export type StoreLocalGoodsReceiptExceptionSummary = {
  receiptExceptionId: string;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  reason: SupplierClaimReason;
  note: string | null;
};

export type StoreLocalGoodsReceiptLineSummary = {
  goodsReceiptLineId: string;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  orderedQuantity: number;
  quantity: number;
  unitCost: number | null;
  serialNumbers: string[];
  batchNo: string | null;
  manufacturedAt: string | null;
  expiryDate: string | null;
};

export type StoreLocalGoodsReceiptSummary = {
  goodsReceiptId: string;
  goodsReceiptNo: string;
  purchaseOrderId: string | null;
  purchaseOrderNo: string | null;
  inventoryLocationCode: string;
  inventoryLocationName: string;
  supplierNo: string | null;
  supplierName: string | null;
  externalReference: string | null;
  note: string | null;
  operatorName: string;
  totalQuantity: number;
  lineCount: number;
  exceptionQuantity: number;
  exceptionCount: number;
  syncedAt: string | null;
  receivedAt: string;
  updatedAt: string;
  lines: StoreLocalGoodsReceiptLineSummary[];
  exceptions: StoreLocalGoodsReceiptExceptionSummary[];
};

export type StoreLocalSupplierReturnReason =
  | "DAMAGED"
  | "REJECTED_AT_RECEIPT"
  | "QUALITY_HOLD"
  | "SHORT_EXPIRY"
  | "WRONG_ITEM"
  | "OTHER";

export type StoreLocalSupplierReturnLineSummary = {
  supplierReturnLineId: string;
  goodsReceiptLineId: string | null;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  serialNumbers: string[];
  batchAllocations: StoreInventoryBatchAllocation[];
};

export type StoreLocalSupplierReturnSummary = {
  supplierReturnId: string;
  supplierReturnNo: string;
  purchaseOrderId: string | null;
  purchaseOrderNo: string | null;
  goodsReceiptId: string;
  goodsReceiptNo: string;
  inventoryLocationCode: string;
  inventoryLocationName: string;
  supplierNo: string;
  supplierName: string;
  externalReference: string | null;
  reason: StoreLocalSupplierReturnReason;
  status: "POSTED" | "CANCELLED";
  note: string | null;
  operatorName: string;
  totalQuantity: number;
  lineCount: number;
  syncedAt: string | null;
  returnedAt: string;
  cancelledAt: string | null;
  cancellationNote: string | null;
  cancellationOperatorName: string | null;
  cancellationAcknowledgedAt: string | null;
  cancellationAcknowledgedBy: string | null;
  cancellationAcknowledgementNote: string | null;
  cancellationAcknowledgementSyncedAt: string | null;
  updatedAt: string;
  lines: StoreLocalSupplierReturnLineSummary[];
};

export type StoreSupplierReturnCancellationAcknowledgementRequest = {
  supplierReturnId: string;
  note?: string | null;
  operatorName?: string;
};

export type StoreSupplierReturnLineRequest = {
  goodsReceiptLineId: string;
  quantity: number;
  serialNumbers?: string[];
};

export type StoreSupplierReturnRequest = {
  goodsReceiptId: string;
  externalReference?: string | null;
  reason: StoreLocalSupplierReturnReason;
  note?: string | null;
  operatorName?: string;
  lines: StoreSupplierReturnLineRequest[];
};

export type StoreInterStoreTransferStatus =
  | "REQUESTED"
  | "PART_ISSUED"
  | "ISSUED"
  | "PART_RECEIVED"
  | "RECEIVED"
  | "CLOSED";

export type StoreInterStoreTransferRole = "SOURCE" | "DESTINATION";

export type StoreInterStoreTransferSummary = {
  transferId: string;
  transferNo: string;
  transferBatchNo: string | null;
  lineNo: number;
  role: StoreInterStoreTransferRole;
  origin: "ENTERPRISE" | "STORE_REQUEST";
  status: StoreInterStoreTransferStatus;
  externalReference: string | null;
  sourceStoreCode: string;
  sourceStoreName: string;
  sourceLocationCode: string;
  sourceLocationName: string;
  destinationStoreCode: string;
  destinationStoreName: string;
  destinationLocationCode: string;
  destinationLocationName: string;
  productCode: string;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  trackExpiry: boolean;
  requestedQuantity: number;
  requestedUnitOfMeasure: string;
  requestedUnitQuantity: number;
  uomConversionFactor: number;
  baseUnitOfMeasure: string;
  issuedQuantity: number;
  receivedQuantity: number;
  outstandingIssueQuantity: number;
  outstandingReceiptQuantity: number;
  unitCost: number | null;
  issuedSerialNumbers: string[];
  receivedSerialNumbers: string[];
  issuedBatchAllocations: StoreInventoryBatchAllocation[];
  receivedBatchAllocations: StoreInventoryBatchAllocation[];
  requestNote: string | null;
  issueNote: string | null;
  receiptNote: string | null;
  requestOperatorName: string | null;
  issueOperatorName: string | null;
  receiptOperatorName: string | null;
  requestedByNodeCode: string | null;
  sourceNodeCode: string | null;
  destinationNodeCode: string | null;
  requestedAt: string;
  requiredAt: string | null;
  issuedAt: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
};

export type StoreInterStoreTransferBrowseRequest = {
  query?: string;
  role?: StoreInterStoreTransferRole | null;
  status?: StoreInterStoreTransferStatus | null;
  locationCode?: string | null;
  limit?: number;
};

export type StoreTransferRequestTargetSummary = {
  sourceStoreCode: string;
  sourceStoreName: string;
  sourceStoreSalesEnabled: boolean;
  sourceStoreWarehouseEnabled: boolean;
  sourceLocationCode: string;
  sourceLocationName: string;
  sourceLocationType: string;
  sourceLocationStatus: string;
  sourceLocationDefaults: string;
  sourceWarehouseCode: string | null;
  sourceWarehouseName: string | null;
  useForSalesDefault: boolean;
  useForReceivingDefault: boolean;
  updatedAt: string;
};

export type StoreInterStoreTransferRequestDraftStatus = "DRAFT" | "SUBMITTED";

export type StoreInterStoreTransferRequestDraftLine = {
  lineId: string;
  lineNo: number;
  productCode: string;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  quantity: number;
  requestedUnitOfMeasure: string;
  requestedUnitQuantity: number;
  uomConversionFactor: number;
  baseUnitOfMeasure: string;
};

export type StoreInterStoreTransferRequestDraftSummary = {
  draftId: string;
  requestNo: string;
  status: StoreInterStoreTransferRequestDraftStatus;
  sourceStoreCode: string;
  sourceStoreName: string;
  sourceLocationCode: string;
  sourceLocationName: string;
  destinationStoreCode: string;
  destinationStoreName: string;
  destinationLocationCode: string;
  destinationLocationName: string;
  productCode: string;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  quantity: number;
  requestedUnitOfMeasure: string;
  requestedUnitQuantity: number;
  uomConversionFactor: number;
  baseUnitOfMeasure: string;
  externalReference: string | null;
  note: string | null;
  operatorName: string;
  submittedAt: string | null;
  updatedAt: string;
  lines: StoreInterStoreTransferRequestDraftLine[];
};

export type StoreInterStoreTransferRequestDraftLineInput = {
  productCode: string;
  quantity: number;
  unitOfMeasure?: string | null;
};

export type StoreInterStoreTransferRequestDraftInput = {
  draftId?: string | null;
  direction?: "REQUEST_IN" | "DIRECT_OUT";
  sourceStoreCode: string;
  sourceLocationCode?: string | null;
  destinationLocationCode: string;
  productCode?: string;
  quantity?: number;
  unitOfMeasure?: string | null;
  lines?: StoreInterStoreTransferRequestDraftLineInput[];
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string;
};

export type StoreStockCountSessionStatus = "DRAFT" | "SUBMITTED" | "COMMITTED";

export type StoreStockCountSessionSummary = {
  sessionId: string;
  sessionNo: string;
  status: StoreStockCountSessionStatus;
  inventoryLocationCode: string;
  inventoryLocationName: string;
  productCode: string;
  productName: string;
  departmentCode: string | null;
  departmentName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  subcategory: string | null;
  isSerialized: boolean;
  previousQuantity: number;
  countedQuantity: number;
  varianceQuantity: number;
  previousSerialNumbers: string[];
  countedSerialNumbers: string[];
  previousBatchQuantities: StoreInventoryBatchAllocation[];
  countedBatchQuantities: StoreInventoryBatchAllocation[];
  operatorName: string;
  note: string | null;
  submittedAt: string | null;
  committedAt: string | null;
  updatedAt: string;
};

export type StoreStockCountSessionDraftInput = {
  sessionId?: string | null;
  sheetNo?: string | null;
  lineNo?: number | null;
  inventoryLocationCode: string;
  productCode: string;
  countedQuantity: number;
  serialNumbers?: string[];
  batchQuantities?: StoreInventoryBatchAllocation[];
  note?: string | null;
  operatorName?: string;
};

export type StoreInterStoreTransferIssueRequest = {
  transferId: string;
  sourceLocationCode: string;
  quantity: number;
  serialNumbers?: string[];
  batchAllocations?: StoreInventoryBatchAllocation[];
  operatorName?: string;
  note?: string | null;
};

export type StoreInterStoreTransferReceiveRequest = {
  transferId: string;
  quantity: number;
  serialNumbers?: string[];
  batchAllocations?: StoreInventoryBatchAllocation[];
  operatorName?: string;
  note?: string | null;
};

export type StoreProductDepartmentSummary = {
  departmentCode: string;
  departmentName: string;
  description: string | null;
  status: string;
  sortOrder: number;
  categoryCount: number;
  updatedAt: string;
};

export type StoreProductCategorySummary = {
  categoryCode: string;
  categoryName: string;
  departmentCode: string;
  departmentName: string;
  description: string | null;
  status: string;
  sortOrder: number;
  updatedAt: string;
};

export type StoreTenderMethodSummary = {
  tenderMethodCode: string;
  tenderMethodName: string;
  paymentMethod: SyncPaymentMethod;
  gatewayProvider: "PAYSTACK" | "FLUTTERWAVE" | "OTHER" | null;
  gatewayMode: "TEST" | "LIVE" | null;
  gatewayMerchantId: string | null;
  gatewayPublicKey: string | null;
  gatewayCallbackUrl: string | null;
  gatewayActive: boolean;
  gatewayStatus: "DISABLED" | "READY" | "NEEDS_REVIEW";
  requiresReference: boolean;
  allowChange: boolean;
  allowRefund: boolean;
  allowOpenCashDrawer: boolean;
  status: string;
  sortOrder: number;
  updatedAt: string;
};

export type StoreBankAccountSummary = {
  bankAccountId: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountNumber: string;
  accountName: string;
  currencyCode: string;
  status: string;
  updatedAt: string;
};

export type StoreSupplierSummary = {
  supplierNo: string;
  supplierName: string;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  addressLine1: string | null;
  city: string | null;
  countryCode: string | null;
  status: string;
  updatedAt: string;
};

export type StorePriceListEntrySummary = {
  priceListCode: string;
  priceListName: string;
  currencyCode: string;
  isDefault: boolean;
  customerType: string | null;
  loyaltyTier: string | null;
  productCode: string;
  unitPrice: number;
  status: string;
  updatedAt: string;
};

export type StorePromotionSummary = {
  promotionCode: string;
  promotionName: string;
  description: string | null;
  discountType: SyncPromotionDiscountType;
  targetScope: SyncPromotionTargetScope;
  discountValue: number;
  minimumBasketAmount: number | null;
  minimumLineQuantity?: number | null;
  buyQuantity?: number | null;
  rewardQuantity?: number | null;
  targetDepartmentCode: string | null;
  targetCategoryCode: string | null;
  targetProductCode: string | null;
  eligibleStoreCodes?: string[] | null;
  eligibleCustomerTypes?: string[] | null;
  eligibleLoyaltyTiers?: string[] | null;
  activeDaysOfWeek?: string[] | null;
  activeFromMinutes?: number | null;
  activeToMinutes?: number | null;
  couponRequired: boolean;
  couponCode: string | null;
  allowWithLoyalty: boolean;
  applyOncePerBasket: boolean;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  status: string;
  updatedAt: string;
};

export type StoreLoyaltySettingsSummary = {
  loyaltyProgramEnabled: boolean;
  loyaltyPointsPerCurrencyUnit: number;
  loyaltyRedemptionEnabled: boolean;
  loyaltyRedemptionPointsStep: number;
  loyaltyRedemptionValueAmount: number;
  loyaltyMinimumRedeemPoints: number;
  loyaltyMaximumRedeemPercentOfSale: number;
};

export type StoreOptionSettingsSummary = {
  allowNegativeInventory: boolean;
  allowOfflineSales: boolean;
  autoPrintReceipts: boolean;
  enforceSerializedScanAtPos: boolean;
  requireCustomerForCreditSales: boolean;
  requireSupervisorForReceiptlessReturn: boolean;
  defaultReceiptSearchDays: number;
  shiftFloatPromptAmount: number;
  showCriticalStocksOnStartup: boolean;
  showExpiringBatchesOnStartup: boolean;
  expiryAlertLeadDays: number;
  expiryCriticalDays: number;
  productSizes: string[];
  posDiscountRates: number[];
  posExpressChargeRates: number[];
  layawaySettings: LayawaySettings;
};

export type StoreReceiptSettingsSummary = {
  currencyCode: string;
  timezone: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  salesReceiptTemplateCode: string | null;
  salesReceiptTemplateName: string | null;
  salesReceiptTemplateHtml: string | null;
  goodsReceiptTemplateCode: string | null;
  goodsReceiptTemplateName: string | null;
  goodsReceiptTemplateHtml: string | null;
  templateMode: "default" | "linked" | "legacy";
};

export type StoreReceiptPrinterDevice = {
  name: string;
  displayName: string;
  description: string | null;
  status: number;
  isDefault: boolean;
};

export type StoreReceiptPrinterSettingsSummary = {
  selectedPrinterName: string | null;
  silentPrintEnabled: boolean;
  autoPrintOnComplete: boolean;
};

export type StoreReceiptPrintLine = {
  lineId: string;
  lineIntent: SyncPosLineIntent;
  sourceLineId: string | null;
  productCode: string;
  productName: string;
  variantSize: string | null;
  variantColor: string | null;
  lineNote: string | null;
  quantity: number;
  sellingUnitOfMeasure: string;
  baseQuantity: number;
  baseUnitOfMeasure: string;
  uomConversionFactor: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  serialNumbers: string[];
  appliedPromotionCode: string | null;
  appliedPromotionName: string | null;
};

export type StoreReceiptPrintPayment = {
  paymentId: string;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  method: SyncPaymentMethod;
  amount: number;
  reference: string | null;
  receivedAt: string;
};

export type StorePrintableReceiptDocument = {
  retailOrgName: string;
  companyLogoUrl: string | null;
  loginBackgroundImageUrl: string | null;
  storeCode: string;
  storeName: string;
  storeLocation?: string | null;
  storePhone?: string | null;
  storeAddress?: string | null;
  storeAddressLine2?: string | null;
  terminalCode: string;
  currencyCode: string;
  timezone: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  salesReceiptTemplateHtml: string | null;
  transactionId: string;
  transactionNo: string;
  transactionType: SyncPosTransactionType | "SALES_ORDER";
  status: string;
  sourceTransactionNo: string | null;
  shiftNo: string | null;
  cashierCode: string | null;
  customerNo: string | null;
  customerName: string | null;
  subtotalAmount: number;
  discountAmount: number;
  loyaltyRedemptionPoints: number;
  loyaltyRedemptionAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  notes: string | null;
  headerReference: string | null;
  additionalDetails: string | null;
  completedAt: string | null;
  lines: StoreReceiptPrintLine[];
  payments: StoreReceiptPrintPayment[];
};

export type StorePrintableAccountPaymentReceiptDocument = {
  retailOrgName: string;
  companyLogoUrl: string | null;
  loginBackgroundImageUrl: string | null;
  storeCode: string;
  storeName: string;
  storeLocation?: string | null;
  storePhone?: string | null;
  storeAddress?: string | null;
  storeAddressLine2?: string | null;
  terminalCode: string;
  currencyCode: string;
  timezone: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  accountPaymentReceiptTemplateHtml: string | null;
  entryId: string;
  entryNo: string;
  customerNo: string;
  customerName: string;
  paymentMethod: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  amount: number;
  reference: string | null;
  note: string | null;
  shiftNo: string | null;
  cashierCode: string | null;
  remainingBalanceAmount: number | null;
  occurredAt: string;
};

export type StorePrintableGoodsReceiptLine = {
  goodsReceiptLineId: string;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  serialNumbers: string[];
  batchNo: string | null;
  manufacturedAt: string | null;
  expiryDate: string | null;
};

export type StorePrintableGoodsReceiptDocument = {
  retailOrgName: string;
  companyLogoUrl: string | null;
  storeCode: string;
  storeName: string;
  terminalCode: string;
  currencyCode: string;
  timezone: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  goodsReceiptTemplateHtml: string | null;
  goodsReceiptNo: string;
  purchaseOrderNo: string | null;
  supplierNo: string | null;
  supplierName: string | null;
  inventoryLocationCode: string;
  inventoryLocationName: string;
  externalReference: string | null;
  note: string | null;
  operatorName: string | null;
  totalOrderedQuantity: number;
  totalReceivedQuantity: number;
  receivedAt: string;
  lines: StorePrintableGoodsReceiptLine[];
};

export type StoreReportScope = "CASHIER" | "STORE";

export type StoreReportBrowseRequest = {
  scope: StoreReportScope;
  dateFrom?: string | null;
  dateTo?: string | null;
  cashierCode?: string | null;
  shiftId?: string | null;
  customerQuery?: string | null;
  productQuery?: string | null;
  limit?: number;
};

export type StoreSalesReportRow = {
  transactionNo: string;
  transactionType: SyncPosTransactionType;
  sourceTransactionNo: string | null;
  completedAt: string | null;
  cashierCode: string | null;
  customerNo: string | null;
  customerName: string | null;
  lineCount: number;
  productPreview: string;
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
};

export type StoreTenderReportRow = {
  paymentId: string;
  transactionNo: string;
  transactionType: "SALE" | "RETURN" | "EXCHANGE";
  sourceTransactionNo: string | null;
  salesOrderNo: string | null;
  occurredAt: string;
  cashierCode: string | null;
  terminalCode: string | null;
  shiftNo: string | null;
  customerNo: string | null;
  customerName: string | null;
  paymentMethod: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  paymentPurpose: string;
  reference: string | null;
  amount: number;
};

export type StoreAccountPaymentReportRow = {
  entryNo: string;
  occurredAt: string;
  cashierCode: string | null;
  customerNo: string;
  customerName: string;
  paymentMethod: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  amount: number;
  reference: string | null;
};

export type StoreProductSalesReportRow = {
  productCode: string;
  productName: string;
  quantity: number;
  sellingUnitOfMeasure: string;
  baseQuantity: number;
  baseUnitOfMeasure: string;
  uomConversionFactor: number;
  grossAmount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
};

export type StoreShiftReportRow = {
  shiftNo: string;
  terminalCode: string;
  cashierCode: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  openingFloatAmount: number;
  transactionCount: number;
  salesCount: number;
  returnCount: number;
  exchangeCount: number;
  netSalesAmount: number;
  cashTenderedAmount: number;
  nonCashTenderedAmount: number;
  accountPaymentsAmount: number;
  expectedCashAmount: number;
  declaredCashAmount: number | null;
  varianceAmount: number | null;
};

export type StoreInventoryReportRow = {
  locationCode: string;
  locationName: string;
  productCode: string;
  productName: string;
  quantityOnHand: number;
  unitPrice: number;
  stockValue: number;
  updatedAt: string;
};

export type StoreSerialBatchSalesReportRow = {
  traceId: string;
  transactionNo: string;
  completedAt: string;
  cashierCode: string | null;
  productCode: string;
  productName: string;
  locationCode: string | null;
  trackingType: "Serial" | "Batch";
  serialNumber: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  quantity: number;
};

export type StoreBankingReportRow = {
  depositNo: string;
  reconciliationNo: string;
  shiftNo: string;
  depositedAt: string;
  operatorName: string | null;
  bankName: string | null;
  branchName: string | null;
  accountNumber: string | null;
  amount: number;
  reference: string | null;
};

export type StoreReportSummary = {
  salesCount: number;
  returnCount: number;
  exchangeCount: number;
  netSalesAmount: number;
  discountAmount: number;
  taxAmount: number;
  tenderedAmount: number;
  accountPaymentsAmount: number;
  inventoryStockValue: number;
  salesOrderRecognizedAmount: number;
  salesOrderOpeningDepositAmount: number;
  salesOrderPriorDepositAppliedAmount: number;
  salesOrderBalanceCollectedAmount: number;
  salesOrderExpectedTenderAmount: number;
  salesOrderOutstandingAmount: number;
};

export type StoreReportResult = {
  scope: StoreReportScope;
  generatedAt: string;
  filters: StoreReportBrowseRequest;
  summary: StoreReportSummary;
  salesRows: StoreSalesReportRow[];
  tenderRows: StoreTenderReportRow[];
  accountPaymentRows: StoreAccountPaymentReportRow[];
  productRows: StoreProductSalesReportRow[];
  salesOrderRows: StoreSalesOrderSummary[];
  salesOrderCollectionRows: StoreSalesOrderCollectionReconciliationRow[];
  shiftRows: StoreShiftReportRow[];
  inventoryRows: StoreInventoryReportRow[];
  serialBatchRows: StoreSerialBatchSalesReportRow[];
  bankingRows: StoreBankingReportRow[];
};

export type StoreCatalogPolicySummary = {
  catalogCodes: string[] | null;
  departmentCodes: string[] | null;
  categoryCodes: string[] | null;
  productCodes: string[] | null;
  productSortOrders?: Record<string, number> | null;
};

export type StoreSyncSnapshot = {
  deploymentMode: StoreDeploymentMode;
  standaloneBootstrapAvailable: boolean;
  retailOrgName: string;
  companyLogoUrl: string | null;
  loginBackgroundImageUrl: string | null;
  storeCode: string;
  storeName: string;
  storeGroupCode: string | null;
  storeGroupName: string | null;
  storeGroupType: string | null;
  storeLicenseStatus: string;
  storeLicenseKey: string | null;
  storeLicensedUntil: string | null;
  terminalLicenseStatus: string;
  terminalLicenseKey: string | null;
  terminalLicensedUntil: string | null;
  touchModeEnabled: boolean;
  catalogPolicy: StoreCatalogPolicySummary | null;
  terminalCode: string;
  nodeCode: string;
  enterpriseBaseUrl: string | null;
  databasePath: string;
  offlineReady: boolean;
  health: StoreSyncHealth;
  lastLocalWriteAt: string | null;
  lastSyncAt: string | null;
  lastEnterpriseAckAt: string | null;
  syncPolicy: StoreNodeSyncPolicy;
  queueMetrics: StoreQueueMetrics;
  operationsMetrics: StoreOperationsMetrics;
  recentRuns: StoreSyncRun[];
  syncDeadLetters: StoreSyncDeadLetterSummary[];
  recentSyncEvents: StoreSyncEventDetail[];
  connectedTerminals: StoreTerminalConnectionSummary[];
  recentTransactions: StoreTransactionSummary[];
  activeShift: StoreShiftSummary | null;
  openShifts: StoreShiftSummary[];
  recentClosedShifts: StoreShiftSummary[];
  recentStoreShifts: StoreShiftSummary[];
  activeOperatorSession: StoreOperatorSessionSummary | null;
  recoveryTasks: StoreRecoveryTaskSummary[];
  activeBasket: StoreBasketSummary | null;
  parkedBaskets: StoreParkedBasketSummary[];
  salesOrders: StoreSalesOrderSummary[];
  recentEodReconciliations: StoreEodReconciliationSummary[];
  recentBankingDeposits: StoreBankingDepositSummary[];
  inventoryLocations: StoreInventoryLocationSummary[];
  transferRequestTargets: StoreTransferRequestTargetSummary[];
  transferRequestDrafts: StoreInterStoreTransferRequestDraftSummary[];
  stockCountSessions: StoreStockCountSessionSummary[];
  recentGoodsReceipts: StoreLocalGoodsReceiptSummary[];
  recentSupplierReturns: StoreLocalSupplierReturnSummary[];
  recentCustomerAccountEntries: StoreCustomerAccountEntrySummary[];
  storeUsers: StoreUserSummary[];
  standaloneRoles?: StoreRoleSummary[];
  standalonePermissions?: StorePermissionSummary[];
  productDepartments: StoreProductDepartmentSummary[];
  productCategories: StoreProductCategorySummary[];
  availableTenderMethods: StoreTenderMethodSummary[];
  availableBankAccounts: StoreBankAccountSummary[];
  availableSuppliers: StoreSupplierSummary[];
  standaloneSuppliers?: StoreSupplierSummary[];
  priceListEntries: StorePriceListEntrySummary[];
  promotions: StorePromotionSummary[];
  standaloneCustomers?: StoreCustomerSummary[];
  passwordPolicy: StorePasswordPolicySummary;
  optionSettings: StoreOptionSettingsSummary;
  loyaltySettings: StoreLoyaltySettingsSummary;
  receiptSettings: StoreReceiptSettingsSummary;
  receiptPrinterSettings: StoreReceiptPrinterSettingsSummary;
  activityFeed: string[];
  generatedAt: string;
};

export type StoreSyncActionResult = {
  message: string;
  snapshot: StoreSyncSnapshot;
  succeeded?: boolean;
  accountPaymentEntryNo?: string | null;
  expenseId?: string | null;
  expenseNo?: string | null;
  expenseStatus?: string | null;
  salesOrderNo?: string | null;
  upstreamProcessed?: number;
  downstreamApplied?: number;
  downstreamPullPasses?: number;
  downstreamLimitReached?: boolean;
  latestCursor?: string | null;
};

export type StoreStandaloneSetupResult = StoreSyncActionResult;

export type StoreStandaloneSettingsInput = {
  storeName?: string | null;
  shortName?: string | null;
  currencyCode?: string | null;
  timezone?: string | null;
  touchModeEnabled?: boolean | null;
  showCriticalStocksOnStartup?: boolean | null;
  showExpiringBatchesOnStartup?: boolean | null;
  expiryAlertLeadDays?: number | null;
  expiryCriticalDays?: number | null;
  allowNegativeInventory?: boolean | null;
  allowOfflineSales?: boolean | null;
  autoPrintReceipts?: boolean | null;
  enforceSerializedScanAtPos?: boolean | null;
  requireCustomerForCreditSales?: boolean | null;
  requireSupervisorForReceiptlessReturn?: boolean | null;
  defaultReceiptSearchDays?: number | null;
  shiftFloatPromptAmount?: number | null;
  productSizes?: string[] | null;
  posDiscountRates?: number[] | null;
  posExpressChargeRates?: number[] | null;
  layawaySettings?: Partial<LayawaySettings> | null;
  companyLogoUrl?: string | null;
  loginBackgroundImageUrl?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
};

export type StoreStandaloneDepartmentInput = {
  departmentCode: string;
  departmentName: string;
  description?: string | null;
  status?: string | null;
  sortOrder?: number | null;
};

export type StoreStandaloneCategoryInput = {
  categoryCode: string;
  categoryName: string;
  departmentCode: string;
  departmentName?: string | null;
  description?: string | null;
  status?: string | null;
  sortOrder?: number | null;
};

export type StoreStandaloneUnitInput = {
  uomCode: string;
  uomName: string;
  description?: string | null;
  decimalPrecision?: number | null;
  allowFractionalSale?: boolean | null;
  status?: string | null;
};

export type StoreStandaloneTaxProfileInput = {
  taxProfileCode: string;
  taxProfileName: string;
  description?: string | null;
  ratePercent?: number | null;
  isDefault?: boolean | null;
  isTaxInclusive?: boolean | null;
  status?: string | null;
};

export type StoreStandaloneTenderInput = {
  tenderMethodCode: string;
  tenderMethodName: string;
  paymentMethod?: SyncPaymentMethod | string | null;
  description?: string | null;
  requiresReference?: boolean | null;
  allowChange?: boolean | null;
  allowRefund?: boolean | null;
  allowOpenCashDrawer?: boolean | null;
  status?: string | null;
  sortOrder?: number | null;
};

export type StoreStandaloneLocationInput = {
  locationCode: string;
  locationName: string;
  locationType?: string | null;
  status?: string | null;
  defaults?: string | null;
  useForSalesDefault?: boolean | null;
  useForSalesOrderDefault?: boolean | null;
  useForReceivingDefault?: boolean | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
};

export type StoreStandaloneBankAccountInput = {
  bankAccountId?: string | null;
  bankCode: string;
  bankName: string;
  branchCode?: string | null;
  branchName?: string | null;
  accountNumber: string;
  accountName: string;
  currencyCode?: string | null;
  status?: string | null;
};

export type StoreStandaloneSupplierInput = {
  supplierNo: string;
  supplierName: string;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  countryCode?: string | null;
  status?: string | null;
};

export type StoreStandalonePriceInput = {
  priceListCode?: string | null;
  priceListName?: string | null;
  currencyCode?: string | null;
  isDefault?: boolean | null;
  customerType?: string | null;
  loyaltyTier?: string | null;
  productCode: string;
  unitPrice?: number | null;
  status?: string | null;
};

export type StoreStandalonePromotionInput = {
  promotionCode: string;
  promotionName: string;
  description?: string | null;
  discountType?: SyncPromotionDiscountType | string | null;
  targetScope?: SyncPromotionTargetScope | string | null;
  discountValue?: number | null;
  minimumBasketAmount?: number | null;
  minimumLineQuantity?: number | null;
  buyQuantity?: number | null;
  rewardQuantity?: number | null;
  targetDepartmentCode?: string | null;
  targetCategoryCode?: string | null;
  targetProductCode?: string | null;
  eligibleCustomerTypes?: string[] | null;
  eligibleLoyaltyTiers?: string[] | null;
  activeDaysOfWeek?: string[] | null;
  activeFromMinutes?: number | null;
  activeToMinutes?: number | null;
  couponRequired?: boolean | null;
  couponCode?: string | null;
  allowWithLoyalty?: boolean | null;
  applyOncePerBasket?: boolean | null;
  priority?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  status?: string | null;
};

export type StoreStandaloneProductInput = {
  productCode: string;
  productName: string;
  shortName?: string | null;
  description?: string | null;
  primaryImageUrl?: string | null;
  departmentCode?: string | null;
  categoryCode?: string | null;
  subcategory?: string | null;
  unitOfMeasure?: string | null;
  unitPrice?: number | null;
  quantityOnHand?: number | null;
  taxProfileCode?: string | null;
  taxable?: boolean | null;
  trackInventory?: boolean | null;
  trackExpiry?: boolean | null;
  shelfLifeDays?: number | null;
  isSerialized?: boolean | null;
  trackSize?: boolean | null;
  trackColor?: boolean | null;
  mustEnterPriceAtPos?: boolean | null;
  minStockLevel?: number | null;
  reorderPoint?: number | null;
  safetyStockLevel?: number | null;
  catalogSortOrder?: number | null;
  barcode?: string | null;
  sellingUnits?: Array<{
    unitOfMeasureCode: string;
    unitOfMeasureName?: string | null;
    conversionFactor: number;
    unitPrice: number;
    barcode?: string | null;
    isDefault?: boolean | null;
    allowFractionalSale?: boolean | null;
    decimalPrecision?: number | null;
  }>;
};

export type StorePasswordPolicySummary = {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  temporaryPasswordMustChange: boolean;
  passwordExpiryDays: number;
  passwordHistoryCount: number;
  lockoutThreshold: number;
  lockoutMinutes: number;
  updatedAt: string | null;
};

export type StoreStandalonePasswordPolicyInput = {
  minimumLength?: number | null;
  requireUppercase?: boolean | null;
  requireLowercase?: boolean | null;
  requireNumber?: boolean | null;
  requireSymbol?: boolean | null;
  temporaryPasswordMustChange?: boolean | null;
  passwordExpiryDays?: number | null;
  passwordHistoryCount?: number | null;
  lockoutThreshold?: number | null;
  lockoutMinutes?: number | null;
};

export type StoreStandaloneUserInput = {
  loginId: string;
  displayName: string;
  email?: string | null;
  password?: string | null;
  roleCode?: string | null;
  roleName?: string | null;
  permissionCodes?: string[] | null;
  cashierEligible?: boolean | null;
  supervisorEligible?: boolean | null;
  accountStatus?: string | null;
};

export type StoreStandaloneRoleInput = {
  roleCode?: string | null;
  roleName: string;
  description?: string | null;
  status?: string | null;
  permissionCodes?: string[] | null;
  cashierEligible?: boolean | null;
  supervisorEligible?: boolean | null;
};

export type StoreStandaloneCustomerInput = {
  customerNo: string;
  fullName: string;
  customerType?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  countryCode?: string | null;
  loyaltyEnrolled?: boolean | null;
  loyaltyTier?: string | null;
  loyaltyPointsBalance?: number | null;
  allowCreditSales?: boolean | null;
  creditLimitAmount?: number | null;
  receivableBalanceAmount?: number | null;
  note?: string | null;
  status?: string | null;
};

export type StoreStandalonePurchaseOrderLineInput = {
  productCode: string;
  orderedQuantity?: number | null;
  unitCost?: number | null;
};

export type StoreStandalonePurchaseOrderInput = {
  purchaseOrderNo?: string | null;
  inventoryLocationCode?: string | null;
  supplierNo?: string | null;
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string | null;
  lines: StoreStandalonePurchaseOrderLineInput[];
};

export type StoreOperatorSignInInput = {
  loginId: string;
  password: string;
  traceId?: string | null;
};

export type StoreSellCaptureRequest = {
  lookupValue: string;
  quantity: number;
  deferInventoryValidationForSalesOrder?: boolean | null;
  productVariantCode?: string | null;
  serialNumbers?: string[];
  preferredBatchId?: string | null;
  sellingUnitOfMeasure?: string | null;
  unitPrice?: number | null;
  variantSize?: string | null;
  variantColor?: string | null;
  variantAttributesSnapshot?: string | null;
  lineNote?: string | null;
};

export type StoreBasketItemRequest = StoreSellCaptureRequest & {
  lineIntent?: SyncPosLineIntent;
};

export type StoreBasketLineUpdateRequest = {
  lineId: string;
  quantity: number;
  deferInventoryValidationForSalesOrder?: boolean | null;
  serialNumbers?: string[];
  overrideUnitPrice?: number | null;
  overrideDiscountAmount?: number | null;
  configuredDiscountRate?: number | null;
  supervisorCode?: string | null;
  supervisorPassword?: string | null;
  overrideNote?: string | null;
  clearPricingOverride?: boolean;
};

export type StoreReceiptLineReturnRequest = {
  sourceTransactionId: string;
  sourceLineId: string;
  quantity: number;
  serialNumbers?: string[];
};

export type StoreBasketCheckoutPayment = {
  method: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  bankAccountId?: string | null;
  amount: number;
  reference: string | null;
};

export type StoreBasketCheckoutRequest = {
  payments: StoreBasketCheckoutPayment[];
  headerReference?: string | null;
  additionalDetails?: string | null;
};

export type StoreBasketCustomerAttachmentInput = {
  customerId: string | null;
};

export type StoreBasketLoyaltyRedemptionInput = {
  pointsToRedeem: number;
};

export type StoreCustomerAccountPaymentRequest = {
  customerId: string;
  tenderMethodCode: string;
  bankAccountId?: string | null;
  amount: number;
  reference?: string | null;
  note?: string | null;
};

export type StoreCreateSalesOrderRequest = {
  orderType?: StoreSalesOrderType | null;
  operatorName?: string | null;
  note?: string | null;
  headerReference?: string | null;
  additionalDetails?: string | null;
  payments?: StoreBasketCheckoutPayment[] | null;
  depositAmount?: number | null;
  depositTenderMethodCode?: string | null;
  depositReference?: string | null;
  layawayExpiresAt?: string | null;
  policyOverrideApproved?: boolean | null;
};

export type StoreCancelSalesOrderRequest = {
  orderId: string;
  operatorName?: string | null;
  note?: string | null;
  refundPayments?: StoreBasketCheckoutPayment[] | null;
  policyOverrideApproved?: boolean | null;
};

export type StoreReceiveLayawayPaymentRequest = {
  orderId: string;
  payments: StoreBasketCheckoutPayment[];
  operatorName?: string | null;
  note?: string | null;
};

export type StoreReleaseLayawayReservationRequest = {
  orderId: string;
  reason: string;
  operatorName?: string | null;
};

export type StoreExpireLayawayRequest = {
  orderId: string;
  reason?: string | null;
  operatorName?: string | null;
};

export type StoreRecordEodReconciliationRequest = {
  shiftId?: string | null;
  declaredCashAmount: number;
  operatorName?: string | null;
  note?: string | null;
};

export type StoreRecordBankingDepositRequest = {
  reconciliationId: string;
  amount: number;
  bankAccountId?: string | null;
  bankName?: string | null;
  reference?: string | null;
  operatorName?: string | null;
  note?: string | null;
};

export type StoreStoreExpenseInput = {
  expenseId?: string | null;
  expenseDate?: string | null;
  category: string;
  description: string;
  supplierName?: string | null;
  paymentMethod?: string | null;
  externalReference?: string | null;
  amount: number;
  taxAmount?: number | null;
  attachmentFileName?: string | null;
  attachmentUrl?: string | null;
  attachmentContentType?: string | null;
  attachmentContentBase64?: string | null;
  operatorName?: string | null;
  note?: string | null;
};

export type StoreSupervisorOverrideInput = {
  supervisorCode: string;
  supervisorPassword?: string | null;
  note?: string | null;
};

export type StoreShiftOpenInput = {
  cashierCode: string;
  openingFloatAmount: number;
};

export type StoreShiftCloseInput = {
  declaredCashAmount: number;
};

export type StoreReceiptPrintRequest = {
  transactionNo: string;
  autoPrint?: boolean;
};

export type StoreReceiptPrintResult = {
  transactionNo: string;
  message: string;
};

export type StoreSalesOrderReceiptPrintRequest = {
  orderNo: string;
  autoPrint?: boolean;
};

export type StoreSalesOrderReceiptPrintResult = {
  orderNo: string;
  message: string;
};

export type StoreAccountPaymentReceiptPrintRequest = {
  entryNo: string;
  autoPrint?: boolean;
};

export type StoreAccountPaymentReceiptPrintResult = {
  entryNo: string;
  message: string;
};

export type StoreShiftReportPrintRequest = {
  reportType: "X" | "Z";
  autoPrint?: boolean;
};

export type StoreShiftReportPrintResult = {
  reportType: "X" | "Z";
  shiftNo: string;
  message: string;
};

export type StoreThermalTestSlipResult = {
  printerName: string;
  message: string;
};

export type StoreCashDrawerKickRequest = {
  tenderMethodCode?: string | null;
  reason?: string | null;
};

export type StoreCashDrawerKickResult = {
  printerName: string;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  message: string;
};

export type StoreReceiptPrinterSettingsInput = {
  selectedPrinterName: string | null;
  silentPrintEnabled: boolean;
  autoPrintOnComplete: boolean;
};

export type StoreLocalReceiptLogoInput = {
  companyLogoUrl?: string | null;
};

export type DesktopRuntimeApi = {
  getContext: () => DesktopRuntimeContext;
  ping: () => Promise<string>;
  getStoreRuntimeStatus: () => Promise<StoreRuntimeStatus>;
  getDesktopWindowStatus: () => Promise<StoreDesktopWindowStatus>;
  openDesktopSupportFolder: () => Promise<string>;
  exportSyncDiagnostics: (
    input: StoreSyncDiagnosticsExportInput,
  ) => Promise<string>;
  recoverDesktopWindow: (reason?: string | null) => Promise<StoreDesktopWindowStatus>;
  notifyRendererReady?: () => void;
  reportRendererHeartbeat?: () => void;
  writeDesktopDiagnostic?: (
    level: "info" | "warn" | "error",
    label: string,
    details?: Record<string, unknown>
  ) => void;
  getDesktopUpdateStatus: () => Promise<StoreDesktopUpdateStatus>;
  checkForDesktopUpdate: () => Promise<StoreDesktopUpdateStatus>;
  installDesktopUpdate: () => Promise<StoreDesktopUpdateStatus>;
  onDesktopUpdateStatus?: (
    listener: (status: StoreDesktopUpdateStatus) => void
  ) => () => void;
  onSyncCycleStatus?: (
    listener: (status: StoreSyncCycleStatusEvent) => void
  ) => () => void;
  getDesktopConnectionConfig: () => Promise<StoreDesktopConnectionConfigResult>;
  saveDesktopConnectionConfig: (
    input: StoreDesktopConnectionConfig
  ) => Promise<StoreDesktopConnectionConfigResult & { message: string }>;
  provisionStoreDatabase: (
    input: StoreDesktopConnectionConfig
  ) => Promise<StoreDesktopDatabaseProvisionResult>;
  restartDesktop: () => Promise<void>;
  getSyncSnapshot: () => Promise<StoreSyncSnapshot>;
  getSyncStatusSnapshot?: () => Promise<StoreSyncSnapshot>;
  bootstrapStandaloneAdmin: (
    input: StoreStandaloneUserInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneSettings: (
    input: StoreStandaloneSettingsInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneDepartment: (
    input: StoreStandaloneDepartmentInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneCategory: (
    input: StoreStandaloneCategoryInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneUnitOfMeasure: (
    input: StoreStandaloneUnitInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneTaxProfile: (
    input: StoreStandaloneTaxProfileInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneTenderMethod: (
    input: StoreStandaloneTenderInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneLocation: (
    input: StoreStandaloneLocationInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneBankAccount: (
    input: StoreStandaloneBankAccountInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneSupplier: (
    input: StoreStandaloneSupplierInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandalonePriceListEntry: (
    input: StoreStandalonePriceInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandalonePromotion: (
    input: StoreStandalonePromotionInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneProduct: (
    input: StoreStandaloneProductInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandalonePasswordPolicy: (
    input: StoreStandalonePasswordPolicyInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneRole: (
    input: StoreStandaloneRoleInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneUser: (
    input: StoreStandaloneUserInput
  ) => Promise<StoreStandaloneSetupResult>;
  saveStandaloneCustomer: (
    input: StoreStandaloneCustomerInput
  ) => Promise<StoreStandaloneSetupResult>;
  signInOperator: (input: StoreOperatorSignInInput) => Promise<StoreSyncActionResult>;
  signOutOperator: () => Promise<StoreSyncActionResult>;
  lookupCatalogItem: (query: string) => Promise<StoreCatalogLookupResult | null>;
  browseCatalogItems: (input?: StoreCatalogBrowseRequest) => Promise<StoreCatalogBrowseItem[]>;
  browseInventoryPositions: (
    input?: StoreInventoryBrowseRequest
  ) => Promise<StoreInventoryBrowseItem[]>;
  lookupRemoteStoreInventory: (
    input?: StoreRemoteInventoryLookupInput
  ) => Promise<StoreRemoteInventoryLookupResult>;
  requestRemoteInterStoreStock: (
    input: StoreRemoteInterStoreStockRequestInput
  ) => Promise<StoreSyncActionResult>;
  browseSerialRegistry: (
    input?: StoreSerialRegistryBrowseRequest
  ) => Promise<StoreSerialRegistryBrowseItem[]>;
  browsePurchaseOrders: (
    input?: StorePurchaseOrderBrowseRequest
  ) => Promise<StorePurchaseOrderSummary[]>;
  saveStandalonePurchaseOrder: (
    input: StoreStandalonePurchaseOrderInput
  ) => Promise<StoreSyncActionResult>;
  browseInterStoreTransfers: (
    input?: StoreInterStoreTransferBrowseRequest
  ) => Promise<StoreInterStoreTransferSummary[]>;
  searchCustomers: (input?: StoreCustomerSearchRequest) => Promise<StoreCustomerSummary[]>;
  searchTransactionReferences: (
    input?: StoreTransactionReferenceSearchRequest
  ) => Promise<StoreTransactionReferenceSummary[]>;
  browseStoreReports: (input: StoreReportBrowseRequest) => Promise<StoreReportResult>;
  recordCustomerAccountPayment: (
    input: StoreCustomerAccountPaymentRequest
  ) => Promise<StoreSyncActionResult>;
  createSalesOrderFromActiveBasket: (
    input?: StoreCreateSalesOrderRequest
  ) => Promise<StoreSyncActionResult>;
  resumeSalesOrder: (orderId: string) => Promise<StoreSyncActionResult>;
  receiveLayawayPayment: (
    input: StoreReceiveLayawayPaymentRequest
  ) => Promise<StoreSyncActionResult>;
  releaseLayawayReservation: (
    input: StoreReleaseLayawayReservationRequest
  ) => Promise<StoreSyncActionResult>;
  expireLayaway: (input: StoreExpireLayawayRequest) => Promise<StoreSyncActionResult>;
  cancelSalesOrder: (input: StoreCancelSalesOrderRequest) => Promise<StoreSyncActionResult>;
  recordEodReconciliation: (
    input: StoreRecordEodReconciliationRequest
  ) => Promise<StoreSyncActionResult>;
  recordBankingDeposit: (
    input: StoreRecordBankingDepositRequest
  ) => Promise<StoreSyncActionResult>;
  saveStoreExpenseDraft: (
    input: StoreStoreExpenseInput
  ) => Promise<StoreSyncActionResult>;
  confirmStoreExpense: (expenseId: string) => Promise<StoreSyncActionResult>;
  attachCustomerToActiveBasket: (
    input: StoreBasketCustomerAttachmentInput
  ) => Promise<StoreSyncActionResult>;
  setActiveBasketLoyaltyRedemption: (
    input: StoreBasketLoyaltyRedemptionInput
  ) => Promise<StoreSyncActionResult>;
  saveInterStoreTransferRequestDraft: (
    input: StoreInterStoreTransferRequestDraftInput
  ) => Promise<StoreSyncActionResult>;
  submitInterStoreTransferRequestDraft: (draftId: string) => Promise<StoreSyncActionResult>;
  saveStockCountSessionDraft: (
    input: StoreStockCountSessionDraftInput
  ) => Promise<StoreSyncActionResult>;
  submitStockCountSession: (sessionId: string) => Promise<StoreSyncActionResult>;
  commitStockCountSession: (sessionId: string) => Promise<StoreSyncActionResult>;
  openShift: (input: StoreShiftOpenInput) => Promise<StoreSyncActionResult>;
  closeActiveShift: (input: StoreShiftCloseInput) => Promise<StoreSyncActionResult>;
  searchReceipts: (input?: StoreReceiptSearchRequest) => Promise<StoreReceiptSearchResult[]>;
  lookupReceiptForCorrection: (transactionNo: string) => Promise<StoreReceiptLookupResult | null>;
  addItemToBasket: (input: StoreBasketItemRequest) => Promise<StoreSyncActionResult>;
  startReturnBasket: (input: StoreSupervisorOverrideInput) => Promise<StoreSyncActionResult>;
  startExchangeBasket: (input: StoreSupervisorOverrideInput) => Promise<StoreSyncActionResult>;
  startReturnFromReceipt: (transactionNo: string) => Promise<StoreSyncActionResult>;
  startExchangeFromReceipt: (transactionNo: string) => Promise<StoreSyncActionResult>;
  addReceiptLineToBasket: (input: StoreReceiptLineReturnRequest) => Promise<StoreSyncActionResult>;
  updateBasketLine: (input: StoreBasketLineUpdateRequest) => Promise<StoreSyncActionResult>;
  removeBasketLine: (lineId: string) => Promise<StoreSyncActionResult>;
  discardActiveBasket: () => Promise<StoreSyncActionResult>;
  checkoutActiveBasket: (input?: StoreBasketCheckoutRequest) => Promise<StoreSyncActionResult>;
  listReceiptPrinters: () => Promise<StoreReceiptPrinterDevice[]>;
  saveReceiptPrinterSettings: (
    input: StoreReceiptPrinterSettingsInput
  ) => Promise<StoreSyncActionResult>;
  saveLocalReceiptLogo: (
    input: StoreLocalReceiptLogoInput
  ) => Promise<StoreSyncActionResult>;
  printReceipt: (input: StoreReceiptPrintRequest) => Promise<StoreReceiptPrintResult>;
  printSalesOrderReceipt: (
    input: StoreSalesOrderReceiptPrintRequest
  ) => Promise<StoreSalesOrderReceiptPrintResult>;
  printAccountPaymentReceipt: (
    input: StoreAccountPaymentReceiptPrintRequest
  ) => Promise<StoreAccountPaymentReceiptPrintResult>;
  printShiftReport: (input: StoreShiftReportPrintRequest) => Promise<StoreShiftReportPrintResult>;
  printThermalTestSlip: () => Promise<StoreThermalTestSlipResult>;
  kickCashDrawer: (input?: StoreCashDrawerKickRequest) => Promise<StoreCashDrawerKickResult>;
  parkActiveBasket: () => Promise<StoreSyncActionResult>;
  resumeParkedBasket: (transactionId: string) => Promise<StoreSyncActionResult>;
  captureDemoSale: () => Promise<StoreSyncActionResult>;
  captureScannedSale: (input: StoreSellCaptureRequest) => Promise<StoreSyncActionResult>;
  receivePurchaseOrder: (input: StorePurchaseOrderReceiptRequest) => Promise<StoreSyncActionResult>;
  recordSupplierReturn: (input: StoreSupplierReturnRequest) => Promise<StoreSyncActionResult>;
  acknowledgeSupplierReturnCancellation: (
    input: StoreSupplierReturnCancellationAcknowledgementRequest
  ) => Promise<StoreSyncActionResult>;
  issueInterStoreTransfer: (
    input: StoreInterStoreTransferIssueRequest
  ) => Promise<StoreSyncActionResult>;
  receiveInterStoreTransfer: (
    input: StoreInterStoreTransferReceiveRequest
  ) => Promise<StoreSyncActionResult>;
  runSyncCycle: (input?: StoreSyncRunOptions) => Promise<StoreSyncActionResult>;
  startSyncCycle?: (input?: StoreSyncRunOptions) => Promise<StoreSyncCycleStartResult>;
  requeueDeadLetters: () => Promise<StoreSyncActionResult>;
  completeRecoveryTask: (taskId: string) => Promise<StoreSyncActionResult>;
};
