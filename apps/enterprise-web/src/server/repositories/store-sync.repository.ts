import { randomUUID } from "node:crypto";
import { readJsonObject, readJsonStringArray, serializeJsonField, serializeRequiredJsonField } from "./json-field";

import { Prisma, type PrismaClient } from "@prisma/client";
import {
  CustomerAccountEntryType,
  type EntityOwnershipRule,
  entityOwnershipRules,
  InterStoreTransferOrigin,
  InterStoreTransferStatus,
  InventoryMovementType,
  OperatingExpenseStatus,
  PaymentMethod,
  PosTransactionStatus,
  PosTransactionType,
  PurchaseOrderClosureReason,
  PurchaseOrderStatus,
  RecordStatus,
  type RetailEntityKey,
  SalesOrderStatus,
  SerialInventoryStatus,
  StockCountSessionStatus,
  SupplierClaimReason,
  SupplierClaimStatus,
  SupplierReturnReason,
  SupplierReturnStatus,
  SyncEventStatus,
  SyncNodeType,
  SyncOperatorActionType
} from "@flash-erp/domain";

import type {
  CustomerAccountPostingCustomer,
  LoyaltyPolicy,
  EnterpriseBarcodePublishedPayload,
  EnterpriseCatalogProductPublishedPayload,
  EnterpriseCustomerPublishedPayload,
  EnterpriseBankAccountPublishedPayload,
  EnterpriseInventoryAdjustmentTaskPayload,
  EnterpriseInventoryCountVarianceTaskPayload,
  EnterpriseInventoryLocationPublishedPayload,
  EnterpriseGiftCertificatePublishedPayload,
  EnterprisePermissionPublishedPayload,
  EnterpriseRetailUserPublishedPayload,
  EnterpriseRolePublishedPayload,
  EnterpriseStoreSettingsPublishedPayload,
  EnterpriseInventorySerialSnapshotPublishedPayload,
  EnterpriseSupplierReturnPublishedPayload,
  EnterpriseInterStoreTransferRequestTargetPublishedPayload,
  EnterpriseProductCategoryPublishedPayload,
  EnterpriseProductDepartmentPublishedPayload,
  EnterprisePriceListPublishedPayload,
  EnterprisePromotionPublishedPayload,
  EnterpriseTaxProfilePublishedPayload,
  EnterpriseTenderMethodPublishedPayload,
  EnterpriseUnitOfMeasurePublishedPayload,
  EnterpriseInventoryTransferTaskPayload,
  EnterpriseInterStoreTransferPublishedPayload,
  EnterprisePurchaseOrderPublishedPayload,
  EnterpriseSyncRecoveryTaskPayload,
  CreateInterStoreTransferBatchRequest,
  CreateInterStoreTransferBatchResponse,
  CreateInterStoreTransferRequest,
  CreateInterStoreTransferResponse,
  CreatePurchaseOrderRequest,
  CreatePurchaseOrderResponse,
  UpdatePurchaseOrderRequest,
  ClosePurchaseOrderRequest,
  CancelSupplierReturnRequest,
  CancelSupplierReturnResponse,
  UpdateSupplierClaimRequest,
  UpdateSupplierClaimResponse,
  InventoryAdjustmentTaskRequest,
  InventoryAdjustmentTaskResponse,
  InventoryCountVarianceTaskRequest,
  InventoryCountVarianceTaskResponse,
  PublishStoreLocationsRequest,
  PublishStoreLocationsResponse,
  StoreInventoryLedgerRecordedPayload,
  StoreInventoryTransferRecordedPayload,
  StoreStockCountSessionSubmittedPayload,
  StoreNodeInboundActionRequest,
  StoreNodeInboundActionResponse,
  StoreNodePullRequest,
  StoreNodePullResponse,
  StoreNodePushRequest,
  StoreNodePushResponse,
  StoreNodeSyncPolicy,
  StoreBankingDepositRecordedPayload,
  StoreCustomerAccountEntryRecordedPayload,
  StoreEodReconciliationRecordedPayload,
  StoreExpenseConfirmedPayload,
  StorePosShiftClosedPayload,
  StorePosShiftOpenedPayload,
  StorePosTransactionCompletedPayload,
  StoreSalesOrderRecordedPayload,
  StoreSyncRecoveryTaskCompletedPayload,
  StoreSyncTaskCompletedPayload,
  StoreRemoteInterStoreRequestInput,
  StoreRemoteInventoryLookupRequest,
  StoreRemoteInventoryLookupResponse,
  InventoryTransferTaskRequest,
  InventoryTransferTaskResponse,
  StoreNodeReplayRequest,
  StoreNodeReplayResponse,
  SyncCheckpoint,
  SyncEnvelope,
  SyncRejectedEnvelope,
  InventoryGoodsReceiptRequest,
  InventoryGoodsReceiptResponse,
  PurchaseOrderLifecycleResponse,
  UpdateInterStoreTransferBatchRequest,
  PurchaseOrderClosureReason as SyncPurchaseOrderClosureReason,
  StoreGoodsReceiptRecordedPayload,
  StoreSupplierReturnCancellationAcknowledgedPayload,
  StoreSupplierReturnRecordedPayload,
  StoreInterStoreTransferRequestedPayload,
  StoreInterStoreTransferIssuedPayload,
  StoreInterStoreTransferReceivedPayload,
  StoreSalesOrderStatus,
  SupplierClaimStatus as SyncSupplierClaimStatus,
  SyncInventoryMovementType,
  SyncPaymentMethod,
  SyncPosTransactionType,
  SyncPromotionDiscountType,
  SyncPromotionTargetScope,
} from "@flash-erp/sync-core";
import {
  deriveCustomerAccountPostingEffect,
  getRetryDelayMs,
  MAX_SYNC_RETRY_ATTEMPTS,
  normalizeLoyaltyPolicy,
  shouldMoveToDeadLetter,
} from "@flash-erp/sync-core";

import { prisma } from "@/lib/db/prisma";
import {
  describeErrorForLog,
  SecurityLogKind,
  SecurityLogSeverity,
  writeEnterpriseSecurityLog,
  writeEnterpriseSecurityLogSafely,
} from "@/server/repositories/enterprise-observability.repository";
import {
  ensureEnterpriseAccountPaymentReceiptTemplate,
  ensureEnterpriseGoodsReceiptTemplate,
  resolveStoreReceiptTemplateSelection,
} from "@/server/repositories/receipt-template-support";
import {
  ensureInterStoreTransferSchemaCompatibility,
  ensureInventoryLocationSalesOrderSchemaCompatibility,
  ensureOperatingExpenseSchemaCompatibility,
  ensureProductVariantSalesOrderDepositSchemaCompatibility,
} from "@/server/repositories/schema-compatibility.repository";
import {
  captureTransactionReference,
  sendSaleSmsNotificationSafely
} from "@/server/repositories/sale-sms.repository";
import { writeStoreExpenseAttachment } from "@/server/files/store-expense-storage";
import {
  shouldPostStockImmediately,
  STOCK_UPDATE_STATUS_PENDING,
  STOCK_UPDATE_STATUS_POSTED
} from "@/server/repositories/inventory-stock-policy.repository";
import { postPosTransactionAccountingInTransaction } from "@/server/services/erp-pos-sale-accounting";

const allowedAggregateTypes = new Set([
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
  "storeExpense",
  "bankAccount",
  "supplier",
  "taxProfile",
  "tenderMethod",
  "promotion",
  "productDepartment",
  "productCategory",
  "product",
  "barcode",
  "priceList",
  "inventoryLocation",
  "inventorySerialSnapshot",
  "purchaseOrder",
  "stockCountSession",
  "interStoreTransfer",
  "goodsReceipt",
  "supplierReturn",
  "syncTask",
  "inventoryTransfer",
  "inventoryLedgerEntry",
  "posShift",
  "posTransaction",
  "posTransactionLine",
  "posPayment",
]);
const onlineStoreRoleCodes = new Set([
  "ONLINE_STORE_CASHIER",
  "ONLINE_STORE_SUPERVISOR"
]);

const localOwnershipRuleFallbacks: Partial<
  Record<string, EntityOwnershipRule>
> = {
  goodsReceipt: {
    authority: "shared",
    upstreamFlow: true,
    downstreamFlow: false,
    conflictPolicy: "accept-append-only",
    notes:
      "Goods receipts are append-only receiving facts created at enterprise or synced back from store nodes.",
  },
  storeExpense: {
    authority: "shared",
    upstreamFlow: true,
    downstreamFlow: false,
    conflictPolicy: "accept-append-only",
    notes:
      "Store expense approvals are append-only operational facts created by online-store or desktop supervisors and posted later by HQ Finance.",
  },
};

function readCompanySettingsObject(value: unknown) {
  return readJsonObject(value) as Record<string, Prisma.JsonValue>;
}

function readCompanyLogoUrl(value: Prisma.JsonValue | null | undefined) {
  const payload = readCompanySettingsObject(value);
  return typeof payload.companyLogoUrl === "string"
    ? payload.companyLogoUrl
    : null;
}

function readLoginBackgroundImageUrl(
  value: Prisma.JsonValue | null | undefined,
) {
  const payload = readCompanySettingsObject(value);
  return typeof payload.loginBackgroundImageUrl === "string"
    ? payload.loginBackgroundImageUrl
    : null;
}

function readDocumentNumberFormats(value: Prisma.JsonValue | null | undefined) {
  const payload = readCompanySettingsObject(value);
  const formats = payload.documentNumberFormats;

  return formats && typeof formats === "object" && !Array.isArray(formats)
    ? (formats as Record<
        string,
        {
          prefix: string;
          digits: number;
          includeStoreCode: boolean;
        }
      >)
    : null;
}

function readProductSizes(value: Prisma.JsonValue | null | undefined) {
  const payload = readCompanySettingsObject(value);
  const rawSizes = Array.isArray(payload.productSizes) ? payload.productSizes : [];
  const seen = new Set<string>();
  const sizes: string[] = [];

  for (const rawSize of rawSizes) {
    const size = String(rawSize ?? "").trim().slice(0, 24);
    const key = size.toUpperCase();

    if (!size || seen.has(key)) {
      continue;
    }

    seen.add(key);
    sizes.push(size);
  }

  return sizes;
}

function readPosDiscountRates(value: Prisma.JsonValue | null | undefined) {
  const payload = readCompanySettingsObject(value);
  const rawRates = Array.isArray(payload.posDiscountRates) ? payload.posDiscountRates : [];
  const seen = new Set<string>();
  const rates: number[] = [];

  for (const rawRate of rawRates) {
    const rate = Number(rawRate);

    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      continue;
    }

    const normalizedRate = Number(rate.toFixed(2));
    const key = normalizedRate.toFixed(2);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rates.push(normalizedRate);
  }

  return rates;
}

function readShiftFloatPromptAmount(
  value: Prisma.JsonValue | null | undefined,
) {
  const payload = readCompanySettingsObject(value);
  const rawAmount = payload.shiftFloatPromptAmount;

  return typeof rawAmount === "number" && Number.isFinite(rawAmount)
    ? Number(Math.max(0, rawAmount).toFixed(2))
    : 0;
}

function readShowCriticalStocksOnStartup(
  value: Prisma.JsonValue | null | undefined,
) {
  const payload = readCompanySettingsObject(value);
  return payload.showCriticalStocksOnStartup === true;
}

const maxDownstreamPullLimit = 50;

const syncNodePolicySelect = {
  autoSyncEnabled: true,
  syncIntervalMinutes: true,
  syncActiveFromMinutes: true,
  syncActiveToMinutes: true,
  syncJitterSeconds: true,
  syncBackoffBaseSeconds: true,
  syncBackoffMaxSeconds: true,
  nextScheduledSyncAt: true,
  lastManualSyncAt: true,
  lastAutoSyncAt: true,
} satisfies Prisma.SyncNodeSelect;

type SyncNodePolicyRow = {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  syncActiveFromMinutes: number;
  syncActiveToMinutes: number;
  syncJitterSeconds: number;
  syncBackoffBaseSeconds: number;
  syncBackoffMaxSeconds: number;
  nextScheduledSyncAt: Date | null;
  lastManualSyncAt: Date | null;
  lastAutoSyncAt: Date | null;
};

function toStoreNodeSyncPolicy(node: SyncNodePolicyRow): StoreNodeSyncPolicy {
  return {
    autoSyncEnabled: node.autoSyncEnabled,
    intervalMinutes: node.syncIntervalMinutes,
    activeFromMinutes: node.syncActiveFromMinutes,
    activeToMinutes: node.syncActiveToMinutes,
    jitterSeconds: node.syncJitterSeconds,
    backoffBaseSeconds: node.syncBackoffBaseSeconds,
    backoffMaxSeconds: node.syncBackoffMaxSeconds,
    nextScheduledSyncAt: node.nextScheduledSyncAt?.toISOString() ?? null,
    lastManualSyncAt: node.lastManualSyncAt?.toISOString() ?? null,
    lastAutoSyncAt: node.lastAutoSyncAt?.toISOString() ?? null,
  };
}

type StoreSyncTarget = {
  storeNode: {
    id: string;
    code: string;
    retailOrgId: string;
    name: string;
    store: {
      id: string;
      code: string;
      name: string;
      currencyCode: string;
      licenseStatus: string;
      licensedUntil: Date | null;
      catalogPolicyJson: Prisma.JsonValue | null;
    } | null;
    terminal: {
      id: string;
      code: string;
      licenseStatus: string;
      licenseKey: string | null;
      licensedUntil: Date | null;
      updatedAt: Date;
    } | null;
    syncPolicy: StoreNodeSyncPolicy;
  };
  enterpriseNode: {
    id: string;
    code: string;
    name: string;
  };
};

export class StoreNodeLicenseError extends Error {
  readonly code = "STORE_NODE_LICENSE_REQUIRED";

  constructor(
    readonly licenseScope: "store" | "terminal",
    readonly nodeCode: string,
    readonly licenseStatus: string | null,
    readonly licensedUntil: Date | null,
  ) {
    super(
      licenseScope === "store"
        ? `Store node "${nodeCode}" is not licensed at HQ and cannot sync right now.`
        : `Terminal for store node "${nodeCode}" is not licensed at HQ and cannot sync right now.`,
    );
    this.name = "StoreNodeLicenseError";
  }
}

export function isStoreNodeLicenseError(
  error: unknown,
): error is StoreNodeLicenseError {
  return error instanceof StoreNodeLicenseError;
}

type OperatorAuditInput = {
  operatorName: string;
  note: string;
};

export type StoreDatabaseInstructionRequest = {
  instructionType?:
    | "VACUUM"
    | "ANALYZE"
    | "BACKUP"
    | "REINDEX"
    | "SYNC_NOW"
    | string
    | null;
  target?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH" | string | null;
  operatorName?: string | null;
  note?: string | null;
};

export type StoreDatabaseInstructionResponse = {
  nodeCode: string;
  taskId: string;
  instructionType: string;
  priority: string;
  message: string;
  serverProcessedAt: string;
};

type InboundProjectionEvent = {
  id: string;
  sourceNodeCode: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  recordVersion: number;
  payload: Prisma.JsonValue;
  occurredAt: Date;
};

class StoreProjectionError extends Error {
  readonly reasonCode: SyncRejectedEnvelope["reasonCode"];
  readonly retryable: boolean;

  constructor(
    reasonCode: SyncRejectedEnvelope["reasonCode"],
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "StoreProjectionError";
    this.reasonCode = reasonCode;
    this.retryable = retryable;
  }
}

function getOwnershipRule(aggregateType: string) {
  return Object.prototype.hasOwnProperty.call(
    entityOwnershipRules,
    aggregateType,
  )
    ? entityOwnershipRules[aggregateType as RetailEntityKey]
    : (localOwnershipRuleFallbacks[aggregateType] ?? null);
}

function assertUpstreamSyncPolicy(event: SyncEnvelope) {
  const ownershipRule = getOwnershipRule(event.aggregateType);

  if (!ownershipRule) {
    throw new StoreProjectionError(
      "UNKNOWN_AGGREGATE",
      `Flash ERP does not have an ownership rule for aggregate type "${event.aggregateType}".`,
      false,
    );
  }

  if (!ownershipRule.upstreamFlow) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Flash ERP rejected upstream ${event.aggregateType}:${event.eventType} from "${event.originatingNodeCode}" because ${event.aggregateType} is ${ownershipRule.authority}-owned and uses ${ownershipRule.conflictPolicy} conflict policy.`,
      false,
    );
  }
}

function toProjectionRejection(
  eventId: string,
  error: unknown,
): SyncRejectedEnvelope {
  if (error instanceof StoreProjectionError) {
    return toRejectedEnvelope(eventId, error);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        eventId,
        reasonCode: "STALE_VERSION",
        message:
          "Flash ERP detected a data-integrity conflict while applying this sync packet. Check the idempotency key, aggregate id, record version, and the unique fields in the diagnostic details.",
        retryable: false,
      };
    }

    if (error.code === "P2003" || error.code === "P2025") {
      return {
        eventId,
        reasonCode: "DEPENDENCY_MISSING",
        message:
          "Flash ERP could not apply this sync packet because a required enterprise record is missing or no longer available.",
        retryable: true,
      };
    }
  }

  return {
    eventId,
    reasonCode: "DEPENDENCY_MISSING",
    message:
      error instanceof Error
        ? `Flash ERP hit an unexpected sync projection error: ${error.message}`
        : "Flash ERP hit an unexpected sync projection error.",
    retryable: true,
  };
}

function getRejectionSeverity(rejection: SyncRejectedEnvelope) {
  if (!rejection.retryable || rejection.reasonCode === "STALE_VERSION") {
    return SecurityLogSeverity.ERROR;
  }

  return SecurityLogSeverity.WARNING;
}

async function writeSyncSecurityEvent(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  input: {
    severity: SecurityLogSeverity;
    category: string;
    action: string;
    actorLabel?: string;
    targetType?: string | null;
    targetRef?: string | null;
    message: string;
    details: Prisma.InputJsonValue;
  },
) {
  await writeEnterpriseSecurityLog(tx, {
    retailOrgId: target.storeNode.retailOrgId,
    kind: SecurityLogKind.SECURITY,
    severity: input.severity,
    category: input.category,
    action: input.action,
    actorLabel: input.actorLabel ?? target.storeNode.code,
    targetType: input.targetType ?? null,
    targetRef: input.targetRef ?? null,
    sourceNodeCode: target.storeNode.code,
    message: input.message,
    details: input.details,
  });
}

async function writeSyncAuditEvent(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  input: {
    action: string;
    actorLabel: string;
    targetType?: string | null;
    targetRef?: string | null;
    message: string;
    details: Prisma.InputJsonValue;
  },
) {
  await writeEnterpriseSecurityLog(tx, {
    retailOrgId: target.storeNode.retailOrgId,
    kind: SecurityLogKind.AUDIT,
    severity: SecurityLogSeverity.INFO,
    category: "Sync audit",
    action: input.action,
    actorLabel: input.actorLabel,
    targetType: input.targetType ?? null,
    targetRef: input.targetRef ?? null,
    sourceNodeCode: target.storeNode.code,
    message: input.message,
    details: input.details,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toJsonObject(
  value: unknown,
  aggregateType: string,
  eventType: string,
) {
  const payload = readJsonObject(value);

  if (!isRecord(payload)) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP expected an object payload for ${aggregateType}:${eventType}.`,
      false,
    );
  }

  return payload;
}

function readRequiredString(
  payload: Record<string, unknown>,
  fieldName: string,
  aggregateType: string,
  eventType: string,
) {
  const value = payload[fieldName];

  if (!isString(value)) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP expected "${fieldName}" in the ${aggregateType}:${eventType} payload.`,
      false,
    );
  }

  return value.trim();
}

function readOptionalString(
  payload: Record<string, unknown>,
  fieldName: string,
) {
  const value = payload[fieldName];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalStringArray(
  payload: Record<string, unknown>,
  fieldName: string,
) {
  const value = payload[fieldName];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeSerialNumbers(serialNumbers?: string[] | null) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const rawValue of serialNumbers ?? []) {
    const nextValue = rawValue.trim();

    if (!nextValue) {
      continue;
    }

    const duplicateKey = nextValue.toUpperCase();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    values.push(nextValue);
  }

  return values;
}

function serialNumberSetsMatch(left: string[], right: string[]) {
  const leftValues = normalizeSerialNumbers(left);
  const rightValues = normalizeSerialNumbers(right);

  if (leftValues.length !== rightValues.length) {
    return false;
  }

  const leftKeys = new Set(
    leftValues.map((serialNumber) => serialNumber.toUpperCase()),
  );
  return rightValues.every((serialNumber) =>
    leftKeys.has(serialNumber.toUpperCase()),
  );
}

function readFirstOptionalString(
  payload: Record<string, unknown>,
  fieldNames: string[],
) {
  for (const fieldName of fieldNames) {
    const value = readOptionalString(payload, fieldName);

    if (value) {
      return value;
    }
  }

  return null;
}

function readRequiredNumber(
  payload: Record<string, unknown>,
  fieldName: string,
  aggregateType: string,
  eventType: string,
) {
  const value = payload[fieldName];
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP expected "${fieldName}" to be numeric in the ${aggregateType}:${eventType} payload.`,
      false,
    );
  }

  return numericValue;
}

function readOptionalNumber(payload: Record<string, unknown>, fieldName: string) {
  const value = payload[fieldName];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : null;
}

function readRequiredDate(
  payload: Record<string, unknown>,
  fieldName: string,
  aggregateType: string,
  eventType: string,
) {
  const rawValue = readRequiredString(
    payload,
    fieldName,
    aggregateType,
    eventType,
  );
  const parsed = toOptionalDate(rawValue);

  if (!parsed) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP could not parse "${fieldName}" for ${aggregateType}:${eventType}.`,
      false,
    );
  }

  return parsed;
}

function toMoneyString(value: number) {
  return value.toFixed(2);
}

function toQuantityString(value: number) {
  return value.toFixed(3);
}

function toWholeNumber(value: number) {
  return Math.trunc(value);
}

function toOptionalRoundedNumber(
  value: Prisma.Decimal | number | null | undefined,
  fractionDigits: number,
) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(Number(value).toFixed(fractionDigits));
}

function toSignedInventoryQuantity(
  movementType: InventoryMovementType,
  quantity: number,
) {
  const absoluteQuantity = Math.abs(quantity);

  switch (movementType) {
    case InventoryMovementType.SALE:
    case InventoryMovementType.RETURN_TO_VENDOR:
    case InventoryMovementType.STOCK_TRANSFER_OUT:
    case InventoryMovementType.ADJUSTMENT_NEGATIVE:
      return absoluteQuantity * -1;
    case InventoryMovementType.OPENING_BALANCE:
    case InventoryMovementType.GOODS_RECEIPT:
    case InventoryMovementType.STOCK_TRANSFER_IN:
    case InventoryMovementType.RETURN:
    case InventoryMovementType.ADJUSTMENT_POSITIVE:
      return absoluteQuantity;
    case InventoryMovementType.COUNT_VARIANCE:
      return quantity;
    default:
      return quantity;
  }
}

function getEnterpriseSyncTaskEventType(taskType: string) {
  switch (taskType) {
    case "APPLY_INVENTORY_ADJUSTMENT":
      return "inventory.adjustment.requested";
    case "APPLY_COUNT_VARIANCE":
      return "inventory.count-variance.requested";
    case "APPLY_STOCK_TRANSFER":
      return "inventory.transfer.requested";
    default:
      return "sync.task.requested";
  }
}

function getEnterpriseSyncTaskActionType(taskType: string) {
  switch (taskType) {
    case "APPLY_INVENTORY_ADJUSTMENT":
      return SyncOperatorActionType.REQUEST_INVENTORY_ADJUSTMENT;
    case "APPLY_COUNT_VARIANCE":
      return SyncOperatorActionType.REQUEST_COUNT_VARIANCE;
    case "APPLY_STOCK_TRANSFER":
      return SyncOperatorActionType.REQUEST_STOCK_TRANSFER;
    default:
      return SyncOperatorActionType.REQUEST_UPSTREAM_RESEND;
  }
}

function formatLocationDefaults(input: {
  useForSalesDefault: boolean;
  useForSalesOrderDefault?: boolean;
  useForReceivingDefault: boolean;
}) {
  const labels: string[] = [];

  if (input.useForSalesDefault) {
    labels.push("Sales default");
  }

  if (input.useForSalesOrderDefault) {
    labels.push("Sales order default");
  }

  if (input.useForReceivingDefault) {
    labels.push("Receiving default");
  }

  return labels.length > 0 ? labels.join(" • ") : "Standard";
}

function toRejectedEnvelope(
  eventId: string,
  error: StoreProjectionError,
): SyncRejectedEnvelope {
  return {
    eventId,
    reasonCode: error.reasonCode,
    message: error.message,
    retryable: error.retryable,
  };
}

function assertStoreBinding(
  storeCode: string,
  target: StoreSyncTarget,
  aggregateType: string,
  eventType: string,
) {
  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (storeCode !== target.storeNode.store.code) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store payload ${aggregateType}:${eventType} declared store "${storeCode}" but node "${target.storeNode.code}" is bound to "${target.storeNode.store.code}".`,
      false,
    );
  }
}

function assertTerminalBinding(
  terminalCode: string,
  target: StoreSyncTarget,
  aggregateType: string,
  eventType: string,
) {
  if (!target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a terminal binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (terminalCode !== target.storeNode.terminal.code) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store payload ${aggregateType}:${eventType} declared terminal "${terminalCode}" but node "${target.storeNode.code}" is bound to "${target.storeNode.terminal.code}".`,
      false,
    );
  }
}

function toPosTransactionType(value: string): SyncPosTransactionType {
  if (value === PosTransactionType.SALE) {
    return "SALE";
  }

  if (value === PosTransactionType.RETURN) {
    return "RETURN";
  }

  if (value === PosTransactionType.EXCHANGE) {
    return "EXCHANGE";
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support POS transaction type "${value}" from store nodes.`,
    false,
  );
}

function toPosTransactionLineIntent(value: string) {
  if (value === "SALE") {
    return "SALE";
  }

  if (value === "RETURN") {
    return "RETURN";
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support POS line intent "${value}" from store nodes.`,
    false,
  );
}

function toSalesOrderStatus(value: string): StoreSalesOrderStatus {
  if (value === SalesOrderStatus.OPEN) {
    return "OPEN";
  }

  if (value === SalesOrderStatus.FULFILLED) {
    return "FULFILLED";
  }

  if (value === SalesOrderStatus.CANCELLED) {
    return "CANCELLED";
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support sales-order status "${value}" from store nodes.`,
    false,
  );
}

function toInventoryMovementType(value: string): SyncInventoryMovementType {
  if (
    Object.values(InventoryMovementType).includes(
      value as InventoryMovementType,
    )
  ) {
    return value as SyncInventoryMovementType;
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support inventory movement type "${value}" from store nodes.`,
    false,
  );
}

function toPurchaseOrderClosureReason(
  value: string | null | undefined,
): SyncPurchaseOrderClosureReason | null {
  if (!value) {
    return null;
  }

  if (
    value === PurchaseOrderClosureReason.FULFILLED ||
    value === PurchaseOrderClosureReason.SHORT_SUPPLIED ||
    value === PurchaseOrderClosureReason.CANCELLED_BY_SUPPLIER ||
    value === PurchaseOrderClosureReason.REJECTED_AT_RECEIPT ||
    value === PurchaseOrderClosureReason.RETURNED_TO_VENDOR ||
    value === PurchaseOrderClosureReason.OTHER
  ) {
    return value as SyncPurchaseOrderClosureReason;
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support purchase-order closure reason "${value}".`,
    false,
  );
}

function toSupplierReturnReason(value: string): EnterpriseSupplierReturnPublishedPayload["reason"] {
  if (
    value === SupplierReturnReason.DAMAGED ||
    value === SupplierReturnReason.REJECTED_AT_RECEIPT ||
    value === SupplierReturnReason.QUALITY_HOLD ||
    value === SupplierReturnReason.SHORT_EXPIRY ||
    value === SupplierReturnReason.WRONG_ITEM ||
    value === SupplierReturnReason.OTHER
  ) {
    return value as EnterpriseSupplierReturnPublishedPayload["reason"];
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support supplier-return reason "${value}" from store nodes.`,
    false,
  );
}

function toSupplierClaimReason(value: string) {
  if (
    value === SupplierClaimReason.SHORT_SUPPLIED ||
    value === SupplierClaimReason.REJECTED_AT_RECEIPT ||
    value === SupplierClaimReason.DAMAGED_INBOUND ||
    value === SupplierClaimReason.WRONG_ITEM ||
    value === SupplierClaimReason.OTHER
  ) {
    return value as SyncSupplierClaimStatus;
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support supplier-claim reason "${value}" from store nodes.`,
    false,
  );
}

function toSupplierClaimStatus(value: string): SyncSupplierClaimStatus {
  if (
    value === SupplierClaimStatus.OPEN ||
    value === SupplierClaimStatus.CREDIT_REQUESTED ||
    value === SupplierClaimStatus.CREDIT_RECEIVED ||
    value === SupplierClaimStatus.WRITTEN_OFF ||
    value === SupplierClaimStatus.CLOSED
  ) {
    return value as SyncSupplierClaimStatus;
  }

  throw new Error(
    `Flash ERP does not support supplier-claim status "${value}".`,
  );
}

function toPaymentMethod(value: string): SyncPaymentMethod {
  if (Object.values(PaymentMethod).includes(value as PaymentMethod)) {
    return value as SyncPaymentMethod;
  }

  throw new StoreProjectionError(
    "INVALID_PAYLOAD",
    `Flash ERP does not support payment method "${value}" from store nodes.`,
    false,
  );
}

function toOptionalPaymentMethod(value: string | null): SyncPaymentMethod | null {
  return value ? toPaymentMethod(value) : null;
}

function isNonRetryableAggregateType(aggregateType: string) {
  return !allowedAggregateTypes.has(aggregateType);
}

function toOptionalDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDownstreamRetryDue(
  input: {
    status: SyncEventStatus;
    attemptCount: number;
    lastAttemptAt: Date | null;
  },
  now: Date,
) {
  if (input.status === SyncEventStatus.PENDING) {
    return true;
  }

  if (input.status !== SyncEventStatus.IN_FLIGHT) {
    return false;
  }

  if (!input.lastAttemptAt) {
    return true;
  }

  const retryAt =
    input.lastAttemptAt.getTime() + getRetryDelayMs(input.attemptCount);
  return retryAt <= now.getTime();
}

function downstreamRetryAfterSeconds(
  input: {
    status: SyncEventStatus;
    attemptCount: number;
    lastAttemptAt: Date | null;
  },
  now: Date,
) {
  if (input.status !== SyncEventStatus.IN_FLIGHT || !input.lastAttemptAt) {
    return null;
  }

  const retryAt =
    input.lastAttemptAt.getTime() + getRetryDelayMs(input.attemptCount);
  return Math.max(0, Math.ceil((retryAt - now.getTime()) / 1000));
}

function toOperatorAuditInput(
  input?:
    | StoreNodeReplayRequest
    | StoreNodeInboundActionRequest
    | CreateInterStoreTransferRequest
    | {
        operatorName?: string | null;
        note?: string | null;
      }
    | null,
  fallbackNote = "Operator replay requested from the Flash ERP enterprise workspace.",
): OperatorAuditInput {
  const operatorName = input?.operatorName?.trim() || "Flash ERP operator";
  const note = input?.note?.trim() || fallbackNote;

  return {
    operatorName,
    note,
  };
}

function toCheckpoint(
  checkpoint: {
    lastEventId: string | null;
    remoteNodeCode: string;
    lastReceivedCursor: string | null;
    lastReceivedAt: Date | null;
    lastAppliedAt: Date | null;
  } | null,
  localNodeCode: string,
): SyncCheckpoint | null {
  if (!checkpoint) {
    return null;
  }

  return {
    localNodeCode,
    remoteNodeCode: checkpoint.remoteNodeCode,
    lastEventId: checkpoint.lastEventId,
    lastCursor: checkpoint.lastReceivedCursor,
    lastReceivedAt: checkpoint.lastReceivedAt?.toISOString() ?? null,
    lastAppliedAt: checkpoint.lastAppliedAt?.toISOString() ?? null,
  };
}

function isLicenseUsable(
  status: string | null | undefined,
  licensedUntil: Date | null | undefined,
) {
  const normalized = status?.trim().toUpperCase() ?? "LICENSED";

  if (normalized !== "LICENSED" && normalized !== "TRIAL") {
    return false;
  }

  return !licensedUntil || licensedUntil.getTime() >= Date.now();
}

function readCatalogPolicy(value: Prisma.JsonValue | null | undefined) {
  const record = readJsonObject(value);

  if (Object.keys(record).length === 0) {
    return null;
  }
  const readCodes = (key: string) => {
    const rawValues = Array.isArray(record[key]) ? record[key] : [];
    const values = rawValues
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(
        (entry, index, items) =>
          entry.length > 0 && items.indexOf(entry) === index,
      );

    return values.length > 0 ? values : null;
  };
  const readProductSortOrders = () => {
    const rawSortOrders = record.productSortOrders;

    if (
      !rawSortOrders ||
      typeof rawSortOrders !== "object" ||
      Array.isArray(rawSortOrders)
    ) {
      return null;
    }

    const entries = Object.entries(rawSortOrders as Record<string, unknown>)
      .map(([rawProductCode, rawSortOrder]) => {
        const productCode = rawProductCode.trim().toUpperCase();
        const sortOrder =
          typeof rawSortOrder === "number"
            ? rawSortOrder
            : typeof rawSortOrder === "string"
              ? Number(rawSortOrder)
              : Number.NaN;

        return {
          productCode,
          sortOrder,
        };
      })
      .filter(
        (entry) =>
          entry.productCode.length > 0 &&
          Number.isFinite(entry.sortOrder) &&
          entry.sortOrder > 0,
      );

    return entries.length > 0
      ? Object.fromEntries(
          entries.map((entry) => [
            entry.productCode,
            Math.trunc(entry.sortOrder),
          ]),
        )
      : null;
  };

  return {
    catalogCodes: readCodes("catalogCodes"),
    departmentCodes: readCodes("departmentCodes"),
    categoryCodes: readCodes("categoryCodes"),
    productCodes: readCodes("productCodes"),
    productSortOrders: readProductSortOrders(),
  };
}

function resolveStoreCatalogPolicy(
  legacyPolicyJson: Prisma.JsonValue | null | undefined,
  catalogLinks:
    | Array<{
        updatedAt: Date;
        catalog: {
          code: string;
          name: string;
          status: RecordStatus;
          updatedAt: Date;
          products: Array<{
            updatedAt: Date;
            sortOrder: number;
            product: {
              code: string;
              updatedAt: Date;
            };
          }>;
        };
      }>
    | null
    | undefined,
) {
  const activeLinks =
    catalogLinks?.filter(
      (link) => link.catalog.status === RecordStatus.ACTIVE,
    ) ?? [];

  if (activeLinks.length === 0) {
    return readCatalogPolicy(legacyPolicyJson);
  }

  const catalogCodes = new Set<string>();
  const productCodes = new Set<string>();
  const productSortOrders = new Map<string, number>();

  for (const link of activeLinks) {
    catalogCodes.add(link.catalog.code);

    for (const productLink of link.catalog.products) {
      const productCode = productLink.product.code;
      productCodes.add(productCode);
      const existingSortOrder = productSortOrders.get(productCode);

      if (
        existingSortOrder === undefined ||
        productLink.sortOrder < existingSortOrder
      ) {
        productSortOrders.set(productCode, productLink.sortOrder);
      }
    }
  }

  return {
    catalogCodes: [...catalogCodes],
    departmentCodes: null,
    categoryCodes: null,
    productCodes: [...productCodes],
    productSortOrders:
      productSortOrders.size > 0
        ? Object.fromEntries(
            [...productSortOrders.entries()].sort(
              (left, right) =>
                left[1] === right[1]
                  ? left[0].localeCompare(right[0])
                  : left[1] - right[1],
            ),
          )
        : null,
  };
}

function catalogPolicyAllowsProduct(
  policy: ReturnType<typeof readCatalogPolicy>,
  product: {
    code: string;
    department: string | null;
    category: string | null;
  },
) {
  if (!policy) {
    return true;
  }

  const productCode = product.code.trim().toUpperCase();
  const departmentCode = product.department?.trim().toUpperCase() ?? "";
  const categoryCode = product.category?.trim().toUpperCase() ?? "";
  const productCodes = new Set(
    (policy.productCodes ?? []).map((code) => code.trim().toUpperCase()),
  );
  const departmentCodes = new Set(
    (policy.departmentCodes ?? []).map((code) => code.trim().toUpperCase()),
  );
  const categoryCodes = new Set(
    (policy.categoryCodes ?? []).map((code) => code.trim().toUpperCase()),
  );

  return (
    productCodes.has(productCode) ||
    (departmentCode.length > 0 && departmentCodes.has(departmentCode)) ||
    (categoryCode.length > 0 && categoryCodes.has(categoryCode)) ||
    (productCodes.size === 0 &&
      departmentCodes.size === 0 &&
      categoryCodes.size === 0)
  );
}

function isServiceProductType(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase() === "SERVICE";
}

function normalizeDatabaseInstructionType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "SYNC_NOW";

  if (
    normalized === "VACUUM" ||
    normalized === "ANALYZE" ||
    normalized === "BACKUP" ||
    normalized === "REINDEX" ||
    normalized === "SYNC_NOW"
  ) {
    return normalized;
  }

  throw new Error(
    "Flash ERP does not support that database administration instruction.",
  );
}

function normalizeInstructionPriority(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "NORMAL";

  if (
    normalized === "LOW" ||
    normalized === "NORMAL" ||
    normalized === "HIGH"
  ) {
    return normalized;
  }

  throw new Error(
    "Flash ERP only supports LOW, NORMAL, or HIGH database instruction priority.",
  );
}

async function runPrismaQueriesSequentially<T extends readonly unknown[]>(
  tasks: readonly [...{ [Index in keyof T]: () => Promise<T[Index]> }],
): Promise<T> {
  const results: unknown[] = [];

  for (const task of tasks) {
    results.push(await task());
  }

  return results as unknown as T;
}

async function getStoreSyncTarget(
  tx: Prisma.TransactionClient | PrismaClient,
  nodeCode: string,
): Promise<StoreSyncTarget> {
  const storeNode = await tx.syncNode.findUnique({
    where: { code: nodeCode },
    select: {
      id: true,
      code: true,
      retailOrgId: true,
      name: true,
      nodeType: true,
      status: true,
      ...syncNodePolicySelect,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          licenseStatus: true,
          licensedUntil: true,
          catalogPolicyJson: true,
        },
      },
      terminal: {
        select: {
          id: true,
          code: true,
          licenseStatus: true,
          licenseKey: true,
          licensedUntil: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!storeNode || storeNode.nodeType !== SyncNodeType.STORE_DESKTOP) {
    throw new Error(
      `Flash ERP could not find a store desktop node for "${nodeCode}".`,
    );
  }

  if (storeNode.status !== RecordStatus.ACTIVE) {
    throw new Error(
      `Store node "${nodeCode}" is not active and cannot sync right now.`,
    );
  }

  if (
    !storeNode.store ||
    !isLicenseUsable(
      storeNode.store.licenseStatus,
      storeNode.store.licensedUntil,
    )
  ) {
    throw new StoreNodeLicenseError(
      "store",
      nodeCode,
      storeNode.store?.licenseStatus ?? null,
      storeNode.store?.licensedUntil ?? null,
    );
  }

  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      retailOrgId: storeNode.retailOrgId,
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!enterpriseNode) {
    throw new Error(
      `Flash ERP does not have an active primary enterprise node for "${nodeCode}".`,
    );
  }

  return {
    storeNode: {
      id: storeNode.id,
      code: storeNode.code,
      retailOrgId: storeNode.retailOrgId,
      name: storeNode.name,
      store: storeNode.store,
      terminal: storeNode.terminal,
      syncPolicy: toStoreNodeSyncPolicy(storeNode),
    },
    enterpriseNode,
  };
}

export async function recordStoreSyncRequestFailure(
  nodeCode: string,
  operation: string,
  error: unknown,
) {
  const syncNode = await prisma.syncNode
    .findUnique({
      where: {
        code: nodeCode,
      },
      select: {
        code: true,
        retailOrgId: true,
        nodeType: true,
        status: true,
      },
    })
    .catch(() => null);

  if (!syncNode) {
    return;
  }

  await writeEnterpriseSecurityLogSafely({
    retailOrgId: syncNode.retailOrgId,
    kind: SecurityLogKind.SECURITY,
    severity: SecurityLogSeverity.ERROR,
    category: "Sync exceptions",
    action: operation,
    actorLabel: syncNode.code,
    targetType: "Sync request",
    targetRef: operation,
    sourceNodeCode: syncNode.code,
    message: `Flash ERP could not complete ${operation} for ${nodeCode}.`,
    details: {
      nodeCode,
      nodeType: syncNode.nodeType,
      nodeStatus: syncNode.status,
      operation,
      error: describeErrorForLog(error),
    },
  });
}

async function queueAutomaticStoreMasterDataPublications(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  now: Date,
  options?: {
    mode?: "bootstrap" | "delta";
  },
) {
  if (!target.storeNode.store) {
    return 0;
  }

  const targetStore = target.storeNode.store;
  const mode = options?.mode ?? "delta";
  const bootstrapToken =
    mode === "bootstrap" ? `${target.storeNode.code}:${now.getTime()}` : null;
  const existingPublicationKeys =
    mode === "delta"
      ? (
          await tx.syncOutboxEvent.findMany({
            where: {
              syncNodeId: target.enterpriseNode.id,
              targetNodeCode: target.storeNode.code,
              eventType: {
                in: [
                  "store.settings.published",
                  "inventory.location.published",
                  "security.permission.published",
                  "security.role.published",
                  "security.user.published",
                  "customer.published",
                  "setup.product-department.published",
                  "setup.product-category.published",
                  "setup.unit-of-measure.published",
                  "setup.promotion.published",
                  "catalog.product.published",
                  "inventory.serial-snapshot.published",
                  "purchase-order.published",
                  "catalog.barcode.published",
                  "pricing.price-list.published",
                  "setup.tax-profile.published",
                  "setup.tender-method.published",
                  "setup.bank-account.published",
                  "gift-certificate.published",
                ],
              },
            },
            select: {
              idempotencyKey: true,
            },
          })
        ).map((event) => event.idempotencyKey)
      : [];

  if (bootstrapToken) {
    const inFlightBootstrapCount = await tx.syncOutboxEvent.count({
      where: {
        syncNodeId: target.enterpriseNode.id,
        targetNodeCode: target.storeNode.code,
        status: {
          in: [SyncEventStatus.PENDING, SyncEventStatus.IN_FLIGHT],
        },
        idempotencyKey: {
          contains: ":bootstrap:",
        },
      },
    });

    if (inFlightBootstrapCount > 0) {
      return 0;
    }
  }

  const hasExistingMasterPublication = (
    aggregateType:
      | "store"
      | "inventoryLocation"
      | "interStoreTransferTarget"
      | "permission"
      | "role"
      | "retailUser"
      | "customer"
      | "promotion"
      | "productDepartment"
      | "productCategory"
      | "unitOfMeasure"
      | "product"
      | "inventorySerialSnapshot"
      | "purchaseOrder"
      | "barcode"
      | "priceList"
      | "taxProfile"
      | "tenderMethod"
      | "bankAccount"
      | "giftCertificate",
    entityKey: string,
    versionStamp: number,
  ) =>
    existingPublicationKeys.some(
      (key) =>
        key.includes(`:${aggregateType}:`) &&
        key.endsWith(`:${entityKey}:${versionStamp}`),
    );

  const [
    storeSettings,
    locations,
    transferRequestSourceLocations,
    permissions,
    roles,
    retailUsers,
    customers,
    departments,
    categories,
    unitOfMeasures,
    promotions,
    products,
    barcodes,
    priceLists,
    storeProductPrices,
    productInventorySums,
    taxProfiles,
    tenderMethods,
    bankAccounts,
    giftCertificates,
    serialUnits,
    purchaseOrders,
  ] = await runPrismaQueriesSequentially([
    () =>
      tx.store.findUnique({
        where: {
          id: targetStore.id,
        },
        select: {
          id: true,
          code: true,
          name: true,
          shortName: true,
          storeGroupCode: true,
          storeGroupName: true,
          storeGroupType: true,
          licenseStatus: true,
          licenseKey: true,
          licensedUntil: true,
          touchModeEnabled: true,
          catalogPolicyJson: true,
          inventoryCatalogLinks: {
            where: {
              catalog: {
                deletedAt: null,
              },
            },
            select: {
              updatedAt: true,
              catalog: {
                select: {
                  code: true,
                  name: true,
                  status: true,
                  updatedAt: true,
                  products: {
                    orderBy: [
                      {
                        sortOrder: "asc",
                      },
                      {
                        product: {
                          name: "asc",
                        },
                      },
                    ],
                    select: {
                      updatedAt: true,
                      sortOrder: true,
                      product: {
                        select: {
                          code: true,
                          name: true,
                          updatedAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          timezone: true,
          currencyCode: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          salesEnabled: true,
          warehouseEnabled: true,
          receiptHeader: true,
          receiptFooter: true,
          salesReceiptTemplateHtml: true,
          salesReceiptTemplate: {
            select: {
              code: true,
              name: true,
              isDefault: true,
              templateHtml: true,
              updatedAt: true,
            },
          },
          updatedAt: true,
          retailOrg: {
            select: {
              name: true,
              companySettingsJson: true,
              optionsSettingsJson: true,
              updatedAt: true,
              loyaltyProgramEnabled: true,
              loyaltyPointsPerCurrencyUnit: true,
              loyaltyRedemptionEnabled: true,
              loyaltyRedemptionPointsStep: true,
              loyaltyRedemptionValueAmount: true,
              loyaltyMinimumRedeemPoints: true,
              loyaltyMaximumRedeemPercentOfSale: true,
            },
          },
        },
      }),
    () =>
      tx.inventoryLocation.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          storeId: targetStore.id,
        },
        orderBy: [{ useForSalesDefault: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          locationType: true,
          status: true,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
          updatedAt: true,
          warehouse: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      }),
    () =>
      tx.inventoryLocation.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          status: RecordStatus.ACTIVE,
          storeId: {
            not: targetStore.id,
          },
          store: {
            status: RecordStatus.ACTIVE,
          },
        },
        orderBy: [
          { store: { name: "asc" } },
          { useForReceivingDefault: "desc" },
          { name: "asc" },
        ],
        select: {
          id: true,
          code: true,
          name: true,
          locationType: true,
          status: true,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
          updatedAt: true,
          warehouse: {
            select: {
              code: true,
              name: true,
            },
          },
          store: {
            select: {
              code: true,
              name: true,
              salesEnabled: true,
              warehouseEnabled: true,
            },
          },
        },
      }),
    () =>
      tx.permission.findMany({
        orderBy: {
          code: "asc",
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.role.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          code: {
            notIn: [...onlineStoreRoleCodes],
          },
        },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          status: true,
          updatedAt: true,
          rolePermissions: {
            select: {
              createdAt: true,
              permission: {
                select: {
                  code: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      }),
    () =>
      tx.retailUser.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          homeStoreId: targetStore.id,
          deletedAt: null,
          NOT: {
            userRoles: {
              some: {
                role: {
                  code: {
                    in: [...onlineStoreRoleCodes],
                  },
                },
              },
            },
          },
        },
        orderBy: [{ displayName: "asc" }, { loginId: "asc" }],
        select: {
          id: true,
          loginId: true,
          email: true,
          displayName: true,
          accountStatus: true,
          passwordHash: true,
          passwordUpdatedAt: true,
          updatedAt: true,
          homeStore: {
            select: {
              code: true,
              name: true,
            },
          },
          userRoles: {
            select: {
              assignedAt: true,
              role: {
                select: {
                  code: true,
                  name: true,
                  status: true,
                  updatedAt: true,
                  rolePermissions: {
                    select: {
                      createdAt: true,
                      permission: {
                        select: {
                          code: true,
                          updatedAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    () =>
      tx.customer.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ fullName: "asc" }, { customerNo: "asc" }],
        select: {
          id: true,
          customerNo: true,
          fullName: true,
          customerType: true,
          phone: true,
          email: true,
          addressLine1: true,
          city: true,
          countryCode: true,
          loyaltyEnrolled: true,
          loyaltyTier: true,
          loyaltyPointsBalance: true,
          allowCreditSales: true,
          creditLimitAmount: true,
          receivableBalanceAmount: true,
          note: true,
          status: true,
          updatedAt: true,
          store: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      }),
    () =>
      tx.productDepartment.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          status: true,
          sortOrder: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.productCategory.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          status: true,
          sortOrder: true,
          updatedAt: true,
          department: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      }),
    () =>
      tx.unitOfMeasure.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          decimalPrecision: true,
          allowFractionalSale: true,
          status: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.promotionCampaign.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ priority: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          discountType: true,
          targetScope: true,
          discountValue: true,
          minimumBasketAmount: true,
          minimumLineQuantity: true,
          buyQuantity: true,
          rewardQuantity: true,
          targetDepartmentCode: true,
          targetCategoryCode: true,
          targetProductCode: true,
          eligibleStoreCodes: true,
          eligibleCustomerTypes: true,
          eligibleLoyaltyTiers: true,
          activeDaysOfWeek: true,
          activeFromMinutes: true,
          activeToMinutes: true,
          couponRequired: true,
          couponCode: true,
          allowWithLoyalty: true,
          applyOncePerBasket: true,
          priority: true,
          startAt: true,
          endAt: true,
          status: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.product.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          code: true,
          sku: true,
          name: true,
          shortName: true,
          description: true,
          productType: true,
          department: true,
          category: true,
          subcategory: true,
          brand: true,
          seasonCode: true,
          unitOfMeasure: true,
          baseUnitOfMeasure: {
            select: {
              code: true,
              name: true,
            },
          },
          uomSchedule: {
            select: {
              code: true,
              name: true,
              baseUnitOfMeasure: {
                select: {
                  code: true,
                },
              },
              lines: {
                orderBy: [{ isBaseUnit: "desc" }, { sortOrder: "asc" }],
                select: {
                  conversionFactor: true,
                  isBaseUnit: true,
                  allowSale: true,
                  allowPurchase: true,
                  unitOfMeasure: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          packSize: true,
          countryOfOrigin: true,
          primaryImageUrl: true,
          notes: true,
          taxable: true,
          trackInventory: true,
          isSerialized: true,
          trackSize: true,
          trackColor: true,
          allowPriceOverride: true,
          mustEnterPriceAtPos: true,
          minStockLevel: true,
          reorderPoint: true,
          reorderQuantity: true,
          safetyStockLevel: true,
          shelfLifeDays: true,
          weightKg: true,
          volumeLitres: true,
          baseUnitPrice: true,
          updatedAt: true,
          taxProfile: {
            select: {
              code: true,
              name: true,
              ratePercent: true,
              isTaxInclusive: true,
            },
          },
          matrixVariants: {
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            select: {
              id: true,
              code: true,
              sku: true,
              displayName: true,
              unitPrice: true,
              quantityOnHand: true,
              barcode: true,
              status: true,
              values: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: {
                  attribute: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                  attributeValue: {
                    select: {
                      code: true,
                      label: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    () =>
      tx.barcode.findMany({
        where: {
          product: {
            retailOrgId: target.storeNode.retailOrgId,
            status: RecordStatus.ACTIVE,
            deletedAt: null,
          },
        },
        orderBy: [
          {
            product: {
              name: "asc",
            },
          },
          {
            code: "asc",
          },
        ],
        select: {
          id: true,
          code: true,
          barcodeType: true,
          updatedAt: true,
          product: {
            select: {
              code: true,
            },
          },
        },
      }),
    () =>
      tx.priceList.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          status: RecordStatus.ACTIVE,
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          currencyCode: true,
          isDefault: true,
          customerType: true,
          loyaltyTier: true,
          status: true,
          updatedAt: true,
          entries: {
            select: {
              id: true,
              unitPrice: true,
              updatedAt: true,
              product: {
                select: {
                  id: true,
                  code: true,
                },
              },
            },
          },
        },
      }),
    () =>
      tx.storeProductPrice.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          storeId: targetStore.id,
        },
        select: {
          id: true,
          productId: true,
          productVariantId: true,
          unitPrice: true,
          status: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.inventoryLedgerEntry.groupBy({
        by: ["productId"],
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          storeId: targetStore.id,
        },
        _sum: {
          quantity: true,
        },
      }),
    () =>
      tx.taxProfile.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          ratePercent: true,
          isDefault: true,
          isTaxInclusive: true,
          status: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.tenderMethod.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          paymentMethod: true,
          gatewayProvider: true,
          gatewayMode: true,
          gatewayMerchantId: true,
          gatewayPublicKey: true,
          gatewayCallbackUrl: true,
          gatewayActive: true,
          gatewayStatus: true,
          description: true,
          requiresReference: true,
          allowChange: true,
          allowRefund: true,
          allowOpenCashDrawer: true,
          status: true,
          sortOrder: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.bankAccount.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
        },
        orderBy: [
          { branch: { bank: { name: "asc" } } },
          { branch: { name: "asc" } },
        ],
        select: {
          id: true,
          accountNumber: true,
          accountName: true,
          currencyCode: true,
          status: true,
          updatedAt: true,
          branch: {
            select: {
              code: true,
              name: true,
              status: true,
              updatedAt: true,
              bank: {
                select: {
                  code: true,
                  name: true,
                  status: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      }),
    () =>
      tx.giftCertificate.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          deletedAt: null,
          OR: [
            {
              storeId: null,
            },
            {
              storeId: targetStore.id,
            },
          ],
        },
        orderBy: [{ updatedAt: "asc" }, { certificateNo: "asc" }],
        select: {
          id: true,
          certificateNo: true,
          recipientName: true,
          purchaserName: true,
          originalAmount: true,
          balanceAmount: true,
          currencyCode: true,
          issueDate: true,
          expiryDate: true,
          status: true,
          updatedAt: true,
        },
      }),
    () =>
      tx.inventorySerialUnit.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          storeId: targetStore.id,
        },
        orderBy: [{ product: { name: "asc" } }, { serialNumber: "asc" }],
        select: {
          id: true,
          serialNumber: true,
          status: true,
          sourceReferenceType: true,
          sourceReferenceId: true,
          sourceReferenceLabel: true,
          updatedAt: true,
          inventoryLocation: {
            select: {
              code: true,
            },
          },
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              updatedAt: true,
            },
          },
        },
      }),
    () =>
      tx.purchaseOrder.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          storeId: targetStore.id,
          status: {
            in: [
              PurchaseOrderStatus.COMMITTED,
              PurchaseOrderStatus.PART_RECEIVED,
              PurchaseOrderStatus.RECEIVED,
              PurchaseOrderStatus.CLOSED,
            ],
          },
        },
        orderBy: [{ updatedAt: "asc" }, { purchaseOrderNo: "asc" }],
        select: {
          id: true,
          purchaseOrderNo: true,
          externalReference: true,
          status: true,
          note: true,
          operatorName: true,
          committedAt: true,
          closedAt: true,
          closureReason: true,
          closureNote: true,
          closureOperatorName: true,
          updatedAt: true,
          inventoryLocation: {
            select: {
              code: true,
              name: true,
            },
          },
          supplier: {
            select: {
              supplierNo: true,
              name: true,
            },
          },
          lines: {
            orderBy: {
              lineNo: "asc",
            },
            select: {
              id: true,
              lineNo: true,
              orderedQuantity: true,
              receivedQuantity: true,
              exceptionQuantity: true,
              unitCost: true,
              product: {
                select: {
                  code: true,
                  name: true,
                  department: true,
                  category: true,
                  subcategory: true,
                  isSerialized: true,
                },
              },
            },
          },
        },
      }),
  ]);

  const defaultPriceList =
    priceLists.find((priceList) => priceList.isDefault) ?? null;
  const priceEntryByProductId = new Map(
    (defaultPriceList?.entries ?? []).map(
      (entry) =>
        [
          entry.product.id,
          {
            id: entry.id,
            productCode: entry.product.code,
            unitPrice: Number(entry.unitPrice),
            updatedAt: entry.updatedAt,
          },
        ] as const,
    ),
  );
  const storeCatalogPolicy = resolveStoreCatalogPolicy(
    storeSettings?.catalogPolicyJson,
    storeSettings?.inventoryCatalogLinks,
  );
  const catalogSortOrderByProductCode = new Map(
    Object.entries(storeCatalogPolicy?.productSortOrders ?? {}).map(
      ([productCode, sortOrder]) => [productCode.trim().toUpperCase(), sortOrder],
    ),
  );
  const productsForStore = products
    .filter(
      (product) =>
        catalogPolicyAllowsProduct(storeCatalogPolicy, product) ||
        isServiceProductType(product.productType),
    )
    .sort((left, right) => {
      const leftSortOrder =
        catalogSortOrderByProductCode.get(left.code.trim().toUpperCase()) ??
        Number.MAX_SAFE_INTEGER;
      const rightSortOrder =
        catalogSortOrderByProductCode.get(right.code.trim().toUpperCase()) ??
        Number.MAX_SAFE_INTEGER;

      return leftSortOrder === rightSortOrder
        ? left.name.localeCompare(right.name)
        : leftSortOrder - rightSortOrder;
    });
  const activeProductIds = new Set(
    productsForStore.map((product) => product.id),
  );
  const storeProductPricesForSync = storeProductPrices.filter(
    (entry) => entry.status === RecordStatus.ACTIVE,
  );

  if (mode === "bootstrap" && defaultPriceList) {
    const baseStorePriceByProductId = new Map(
      storeProductPrices
        .filter((entry) => !entry.productVariantId)
        .map((entry) => [entry.productId, entry] as const),
    );

    for (const product of productsForStore) {
      const priceEntry = priceEntryByProductId.get(product.id);

      if (!priceEntry) {
        continue;
      }

      const existingStorePrice = baseStorePriceByProductId.get(product.id);

      if (existingStorePrice?.status === RecordStatus.ACTIVE) {
        continue;
      }

      const seededPrice = {
        id: existingStorePrice?.id ?? randomUUID(),
        productId: product.id,
        productVariantId: null,
        unitPrice: new Prisma.Decimal(priceEntry.unitPrice),
        status: RecordStatus.ACTIVE,
        updatedAt: now,
      };

      if (existingStorePrice) {
        await tx.storeProductPrice.update({
          where: {
            id: existingStorePrice.id,
          },
          data: {
            unitPrice: priceEntry.unitPrice,
            status: RecordStatus.ACTIVE,
          },
        });
      } else {
        await tx.storeProductPrice.create({
          data: {
            id: seededPrice.id,
            retailOrgId: target.storeNode.retailOrgId,
            storeId: targetStore.id,
            productId: product.id,
            productVariantId: null,
            unitPrice: priceEntry.unitPrice,
            status: RecordStatus.ACTIVE,
          },
        });
      }

      storeProductPricesForSync.push(seededPrice);
    }
  }

  const storePriceByProductId = new Map(
    storeProductPricesForSync
      .filter((entry) => !entry.productVariantId)
      .map(
        (entry) =>
          [
            entry.productId,
            {
              id: entry.id,
              unitPrice: Number(entry.unitPrice),
              updatedAt: entry.updatedAt,
            },
          ] as const,
      ),
  );
  const storePriceByVariantId = new Map(
    storeProductPricesForSync
      .filter((entry) => entry.productVariantId)
      .map(
        (entry) =>
          [
            entry.productVariantId as string,
            {
              id: entry.id,
              unitPrice: Number(entry.unitPrice),
              updatedAt: entry.updatedAt,
            },
          ] as const,
      ),
  );
  const quantityByProductId = new Map(
    productInventorySums.map(
      (row) =>
        [
          row.productId,
          Number(Number(row._sum?.quantity ?? 0).toFixed(3)),
        ] as const,
    ),
  );
  const serialUnitsByProductId = new Map<
    string,
    Array<{
      id: string;
      serialNumber: string;
      status: SerialInventoryStatus;
      sourceReferenceType: string | null;
      sourceReferenceId: string | null;
      sourceReferenceLabel: string | null;
      updatedAt: Date;
      inventoryLocation: {
        code: string;
      } | null;
    }>
  >();

  for (const serialUnit of serialUnits) {
    const existingRows = serialUnitsByProductId.get(serialUnit.product.id);

    if (existingRows) {
      existingRows.push(serialUnit);
      continue;
    }

    serialUnitsByProductId.set(serialUnit.product.id, [serialUnit]);
  }
  const outboxRows: Prisma.SyncOutboxEventCreateManyInput[] = [];
  const accountPaymentReceiptTemplate = target.storeNode.store
    ? await ensureEnterpriseAccountPaymentReceiptTemplate(
        tx,
        target.storeNode.retailOrgId,
      )
    : null;
  const goodsReceiptTemplate = target.storeNode.store
    ? await ensureEnterpriseGoodsReceiptTemplate(
        tx,
        target.storeNode.retailOrgId,
      )
    : null;
  const storeReceiptTemplateResolution = storeSettings
    ? resolveStoreReceiptTemplateSelection({
        salesReceiptTemplateHtml: storeSettings.salesReceiptTemplateHtml,
        salesReceiptTemplate: storeSettings.salesReceiptTemplate,
      })
    : null;
  const storeSettingsVersionStamp = storeSettings
    ? Math.max(
        storeSettings.updatedAt.getTime(),
        storeSettings.retailOrg.updatedAt.getTime(),
        target.storeNode.terminal?.updatedAt.getTime() ?? 0,
        storeReceiptTemplateResolution?.versionAt?.getTime() ?? 0,
        accountPaymentReceiptTemplate?.updatedAt.getTime() ?? 0,
        goodsReceiptTemplate?.updatedAt.getTime() ?? 0,
        ...storeSettings.inventoryCatalogLinks.flatMap((link) => [
          link.updatedAt.getTime(),
          link.catalog.updatedAt.getTime(),
          ...link.catalog.products.map((productLink) =>
            Math.max(
              productLink.updatedAt.getTime(),
              productLink.product.updatedAt.getTime(),
            ),
          ),
        ]),
      )
    : 0;

  if (
    storeSettings &&
    !(
      mode === "delta" &&
      hasExistingMasterPublication(
        "store",
        storeSettings.code,
        storeSettingsVersionStamp,
      )
    )
  ) {
    const payload: EnterpriseStoreSettingsPublishedPayload = {
      retailOrgName: storeSettings.retailOrg.name,
      companyLogoUrl: readCompanyLogoUrl(
        storeSettings.retailOrg.companySettingsJson,
      ),
      loginBackgroundImageUrl: readLoginBackgroundImageUrl(
        storeSettings.retailOrg.companySettingsJson,
      ),
      documentNumberFormats: readDocumentNumberFormats(
        storeSettings.retailOrg.companySettingsJson,
      ),
      productSizes: readProductSizes(storeSettings.retailOrg.companySettingsJson),
      posDiscountRates: readPosDiscountRates(storeSettings.retailOrg.companySettingsJson),
      storeCode: storeSettings.code,
      storeName: storeSettings.name,
      storePhone: storeSettings.phone,
      storeAddressLine1: storeSettings.addressLine1,
      storeAddressLine2: storeSettings.addressLine2,
      shortName: storeSettings.shortName,
      storeGroupCode: storeSettings.storeGroupCode,
      storeGroupName: storeSettings.storeGroupName,
      storeGroupType: storeSettings.storeGroupType,
      licenseStatus: storeSettings.licenseStatus,
      licenseKey: storeSettings.licenseKey,
      licensedUntil: storeSettings.licensedUntil?.toISOString() ?? null,
      terminalLicenseStatus:
        target.storeNode.terminal?.licenseStatus ?? "LICENSED",
      terminalLicenseKey: target.storeNode.terminal?.licenseKey ?? null,
      terminalLicensedUntil:
        target.storeNode.terminal?.licensedUntil?.toISOString() ?? null,
      touchModeEnabled: storeSettings.touchModeEnabled,
      catalogPolicy: storeCatalogPolicy,
      timezone: storeSettings.timezone,
      currencyCode: storeSettings.currencyCode,
      salesEnabled: storeSettings.salesEnabled,
      warehouseEnabled: storeSettings.warehouseEnabled,
      shiftFloatPromptAmount: readShiftFloatPromptAmount(
        storeSettings.retailOrg.optionsSettingsJson,
      ),
      showCriticalStocksOnStartup: readShowCriticalStocksOnStartup(
        storeSettings.retailOrg.optionsSettingsJson,
      ),
      loyaltyProgramEnabled: storeSettings.retailOrg.loyaltyProgramEnabled,
      loyaltyPointsPerCurrencyUnit: Number(
        storeSettings.retailOrg.loyaltyPointsPerCurrencyUnit,
      ),
      loyaltyRedemptionEnabled:
        storeSettings.retailOrg.loyaltyRedemptionEnabled,
      loyaltyRedemptionPointsStep:
        storeSettings.retailOrg.loyaltyRedemptionPointsStep,
      loyaltyRedemptionValueAmount: Number(
        storeSettings.retailOrg.loyaltyRedemptionValueAmount,
      ),
      loyaltyMinimumRedeemPoints:
        storeSettings.retailOrg.loyaltyMinimumRedeemPoints,
      loyaltyMaximumRedeemPercentOfSale: Number(
        storeSettings.retailOrg.loyaltyMaximumRedeemPercentOfSale,
      ),
      receiptHeader: storeSettings.receiptHeader,
      receiptFooter: storeSettings.receiptFooter,
      salesReceiptTemplateCode: storeReceiptTemplateResolution?.code ?? null,
      salesReceiptTemplateName: storeReceiptTemplateResolution?.name ?? null,
      salesReceiptTemplateMode:
        storeReceiptTemplateResolution?.mode ?? "default",
      salesReceiptTemplateHtml: storeReceiptTemplateResolution?.html ?? null,
      accountPaymentReceiptTemplateCode:
        accountPaymentReceiptTemplate?.code ?? null,
      accountPaymentReceiptTemplateName:
        accountPaymentReceiptTemplate?.name ?? null,
      accountPaymentReceiptTemplateHtml:
        accountPaymentReceiptTemplate?.templateHtml ?? null,
      goodsReceiptTemplateCode: goodsReceiptTemplate?.code ?? null,
      goodsReceiptTemplateName: goodsReceiptTemplate?.name ?? null,
      goodsReceiptTemplateHtml: goodsReceiptTemplate?.templateHtml ?? null,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "store",
      aggregateId: storeSettings.id,
      eventType: "store.settings.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:store:bootstrap:${bootstrapToken}:${storeSettings.code}:${storeSettingsVersionStamp}`
        : `${target.enterpriseNode.code}:store:auto:${target.storeNode.code}:${storeSettings.code}:${storeSettingsVersionStamp}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const location of locations) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "inventoryLocation",
        location.code,
        location.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseInventoryLocationPublishedPayload = {
      storeCode: target.storeNode.store.code,
      locationCode: location.code,
      locationName: location.name,
      locationType: location.locationType,
      status: location.status,
      defaults: formatLocationDefaults(location),
      useForSalesDefault: location.useForSalesDefault,
      useForSalesOrderDefault: location.useForSalesOrderDefault,
      useForReceivingDefault: location.useForReceivingDefault,
      warehouseCode: location.warehouse?.code ?? null,
      warehouseName: location.warehouse?.name ?? null,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "inventoryLocation",
      aggregateId: location.id,
      eventType: "inventory.location.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:inventoryLocation:bootstrap:${bootstrapToken}:${location.code}:${location.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:inventoryLocation:auto:${target.storeNode.code}:${location.code}:${location.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const location of transferRequestSourceLocations) {
    if (!location.store) {
      continue;
    }

    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "interStoreTransferTarget",
        location.code,
        location.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseInterStoreTransferRequestTargetPublishedPayload = {
      storeCode: target.storeNode.store.code,
      sourceStoreCode: location.store.code,
      sourceStoreName: location.store.name,
      sourceStoreSalesEnabled: location.store.salesEnabled,
      sourceStoreWarehouseEnabled: location.store.warehouseEnabled,
      sourceLocationCode: location.code,
      sourceLocationName: location.name,
      sourceLocationType: location.locationType,
      sourceLocationStatus: location.status,
      sourceLocationDefaults: formatLocationDefaults(location),
      sourceWarehouseCode: location.warehouse?.code ?? null,
      sourceWarehouseName: location.warehouse?.name ?? null,
      useForSalesDefault: location.useForSalesDefault,
      useForReceivingDefault: location.useForReceivingDefault,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "interStoreTransferTarget",
      aggregateId: location.id,
      eventType: "inter-store-transfer.target.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:interStoreTransferTarget:bootstrap:${bootstrapToken}:${location.code}:${location.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:interStoreTransferTarget:auto:${target.storeNode.code}:${location.code}:${location.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const permission of permissions) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "permission",
        permission.code,
        permission.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterprisePermissionPublishedPayload = {
      storeCode: target.storeNode.store.code,
      permissionCode: permission.code,
      permissionName: permission.name,
      description: permission.description,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "permission",
      aggregateId: permission.id,
      eventType: "security.permission.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:permission:bootstrap:${bootstrapToken}:${permission.code}:${permission.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:permission:auto:${target.storeNode.code}:${permission.code}:${permission.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const role of roles) {
    const roleVersionStamp = Math.max(
      role.updatedAt.getTime(),
      ...role.rolePermissions.map((rolePermission) =>
        Math.max(
          rolePermission.createdAt.getTime(),
          rolePermission.permission.updatedAt.getTime(),
        ),
      ),
    );

    if (
      mode === "delta" &&
      hasExistingMasterPublication("role", role.code, roleVersionStamp)
    ) {
      continue;
    }

    const permissionCodes = [
      ...new Set(role.rolePermissions.map((entry) => entry.permission.code)),
    ].sort();
    const payload: EnterpriseRolePublishedPayload = {
      storeCode: target.storeNode.store.code,
      roleCode: role.code,
      roleName: role.name,
      description: role.description,
      status: role.status,
      permissionCodes,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "role",
      aggregateId: role.id,
      eventType: "security.role.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:role:bootstrap:${bootstrapToken}:${role.code}:${roleVersionStamp}`
        : `${target.enterpriseNode.code}:role:auto:${target.storeNode.code}:${role.code}:${roleVersionStamp}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const retailUser of retailUsers) {
    const userPermissionCodes = new Set<string>();
    const userRoleCodes = new Set<string>();
    const userRoleNames = new Set<string>();
    let userVersionStamp = retailUser.updatedAt.getTime();

    for (const userRole of retailUser.userRoles) {
      userVersionStamp = Math.max(
        userVersionStamp,
        userRole.assignedAt.getTime(),
        userRole.role.updatedAt.getTime(),
      );
      userRoleCodes.add(userRole.role.code);
      userRoleNames.add(userRole.role.name);

      if (userRole.role.status !== RecordStatus.ACTIVE) {
        continue;
      }

      for (const rolePermission of userRole.role.rolePermissions) {
        userVersionStamp = Math.max(
          userVersionStamp,
          rolePermission.createdAt.getTime(),
          rolePermission.permission.updatedAt.getTime(),
        );
        userPermissionCodes.add(rolePermission.permission.code);
      }
    }

    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "retailUser",
        retailUser.loginId,
        userVersionStamp,
      )
    ) {
      continue;
    }

    const payload: EnterpriseRetailUserPublishedPayload = {
      storeCode: target.storeNode.store.code,
      userId: retailUser.id,
      loginId: retailUser.loginId,
      email: retailUser.email,
      displayName: retailUser.displayName,
      accountStatus: retailUser.accountStatus,
      homeStoreCode: retailUser.homeStore?.code ?? null,
      homeStoreName: retailUser.homeStore?.name ?? null,
      roleCodes: [...userRoleCodes].sort(),
      roleNames: [...userRoleNames].sort(),
      permissionCodes: [...userPermissionCodes].sort(),
      passwordHash: retailUser.passwordHash,
      passwordUpdatedAt: retailUser.passwordUpdatedAt?.toISOString() ?? null,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "retailUser",
      aggregateId: retailUser.id,
      eventType: "security.user.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:retailUser:bootstrap:${bootstrapToken}:${retailUser.loginId}:${userVersionStamp}`
        : `${target.enterpriseNode.code}:retailUser:auto:${target.storeNode.code}:${retailUser.loginId}:${userVersionStamp}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const customer of customers) {
    const customerVersionStamp = customer.updatedAt.getTime();

    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "customer",
        customer.customerNo,
        customerVersionStamp,
      )
    ) {
      continue;
    }

    const payload: EnterpriseCustomerPublishedPayload = {
      storeCode: target.storeNode.store.code,
      customerId: customer.id,
      customerNo: customer.customerNo,
      fullName: customer.fullName,
      customerType: customer.customerType,
      phone: customer.phone,
      email: customer.email,
      addressLine1: customer.addressLine1,
      city: customer.city,
      countryCode: customer.countryCode,
      homeStoreCode: customer.store?.code ?? null,
      homeStoreName: customer.store?.name ?? null,
      loyaltyEnrolled: customer.loyaltyEnrolled,
      loyaltyTier: customer.loyaltyTier,
      loyaltyPointsBalance: customer.loyaltyPointsBalance,
      allowCreditSales: customer.allowCreditSales,
      creditLimitAmount:
        customer.creditLimitAmount === null
          ? null
          : Number(customer.creditLimitAmount),
      receivableBalanceAmount: Number(customer.receivableBalanceAmount),
      note: customer.note,
      status: customer.status,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "customer",
      aggregateId: customer.id,
      eventType: "customer.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:customer:bootstrap:${bootstrapToken}:${customer.customerNo}:${customerVersionStamp}`
        : `${target.enterpriseNode.code}:customer:auto:${target.storeNode.code}:${customer.customerNo}:${customerVersionStamp}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const department of departments) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "productDepartment",
        department.code,
        department.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseProductDepartmentPublishedPayload = {
      storeCode: target.storeNode.store.code,
      departmentCode: department.code,
      departmentName: department.name,
      description: department.description,
      status: department.status,
      sortOrder: department.sortOrder,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "productDepartment",
      aggregateId: department.id,
      eventType: "setup.product-department.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:productDepartment:bootstrap:${bootstrapToken}:${department.code}:${department.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:productDepartment:auto:${target.storeNode.code}:${department.code}:${department.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const category of categories) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "productCategory",
        category.code,
        category.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseProductCategoryPublishedPayload = {
      storeCode: target.storeNode.store.code,
      categoryCode: category.code,
      categoryName: category.name,
      departmentCode: category.department.code,
      departmentName: category.department.name,
      description: category.description,
      status: category.status,
      sortOrder: category.sortOrder,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "productCategory",
      aggregateId: category.id,
      eventType: "setup.product-category.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:productCategory:bootstrap:${bootstrapToken}:${category.code}:${category.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:productCategory:auto:${target.storeNode.code}:${category.code}:${category.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const unitOfMeasure of unitOfMeasures) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "unitOfMeasure",
        unitOfMeasure.code,
        unitOfMeasure.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseUnitOfMeasurePublishedPayload = {
      storeCode: target.storeNode.store.code,
      uomCode: unitOfMeasure.code,
      uomName: unitOfMeasure.name,
      description: unitOfMeasure.description,
      decimalPrecision: unitOfMeasure.decimalPrecision,
      allowFractionalSale: unitOfMeasure.allowFractionalSale,
      status: unitOfMeasure.status,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "unitOfMeasure",
      aggregateId: unitOfMeasure.id,
      eventType: "setup.unit-of-measure.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:unitOfMeasure:bootstrap:${bootstrapToken}:${unitOfMeasure.code}:${unitOfMeasure.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:unitOfMeasure:auto:${target.storeNode.code}:${unitOfMeasure.code}:${unitOfMeasure.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const promotion of promotions) {
    const eligibleStoreCodes = toOptionalStringArraySnapshot(
      promotion.eligibleStoreCodes,
    );
    const eligibleStoreSet = new Set(
      eligibleStoreCodes.map((code) => code.trim().toUpperCase()),
    );

    if (
      eligibleStoreSet.size > 0 &&
      !eligibleStoreSet.has(target.storeNode.store.code.trim().toUpperCase())
    ) {
      continue;
    }

    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "promotion",
        promotion.code,
        promotion.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterprisePromotionPublishedPayload = {
      storeCode: target.storeNode.store.code,
      promotionId: promotion.id,
      promotionCode: promotion.code,
      promotionName: promotion.name,
      description: promotion.description,
      discountType: promotion.discountType as SyncPromotionDiscountType,
      targetScope: promotion.targetScope as SyncPromotionTargetScope,
      discountValue: Number(promotion.discountValue),
      minimumBasketAmount:
        promotion.minimumBasketAmount === null
          ? null
          : Number(promotion.minimumBasketAmount),
      minimumLineQuantity:
        promotion.minimumLineQuantity === null
          ? null
          : Number(promotion.minimumLineQuantity),
      buyQuantity:
        promotion.buyQuantity === null ? null : Number(promotion.buyQuantity),
      rewardQuantity:
        promotion.rewardQuantity === null
          ? null
          : Number(promotion.rewardQuantity),
      targetDepartmentCode: promotion.targetDepartmentCode,
      targetCategoryCode: promotion.targetCategoryCode,
      targetProductCode: promotion.targetProductCode,
      eligibleStoreCodes:
        eligibleStoreCodes.length > 0 ? eligibleStoreCodes : null,
      eligibleCustomerTypes: toOptionalStringArraySnapshot(
        promotion.eligibleCustomerTypes,
      ),
      eligibleLoyaltyTiers: toOptionalStringArraySnapshot(
        promotion.eligibleLoyaltyTiers,
      ),
      activeDaysOfWeek: toOptionalStringArraySnapshot(
        promotion.activeDaysOfWeek,
      ),
      activeFromMinutes: promotion.activeFromMinutes,
      activeToMinutes: promotion.activeToMinutes,
      couponRequired: promotion.couponRequired,
      couponCode: promotion.couponCode,
      allowWithLoyalty: promotion.allowWithLoyalty,
      applyOncePerBasket: promotion.applyOncePerBasket,
      priority: promotion.priority,
      startAt: promotion.startAt?.toISOString() ?? null,
      endAt: promotion.endAt?.toISOString() ?? null,
      status: promotion.status,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "promotion",
      aggregateId: promotion.id,
      eventType: "setup.promotion.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:promotion:bootstrap:${bootstrapToken}:${promotion.code}:${promotion.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:promotion:auto:${target.storeNode.code}:${promotion.code}:${promotion.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const product of productsForStore) {
    const storeProductPrice = storePriceByProductId.get(product.id);
    const storeVariantVersionStamps = product.matrixVariants
      .map((variant) => storePriceByVariantId.get(variant.id)?.updatedAt.getTime() ?? 0);
    const productVersionStamp = Math.max(
      product.updatedAt.getTime(),
      storeProductPrice?.updatedAt.getTime() ?? 0,
      ...storeVariantVersionStamps,
    );
    const shouldPublishProduct =
      mode !== "delta" ||
      !hasExistingMasterPublication(
        "product",
        product.code,
        productVersionStamp,
      );
    const priceEntry = priceEntryByProductId.get(product.id);
    if (shouldPublishProduct) {
      const payload: EnterpriseCatalogProductPublishedPayload = {
        storeCode: target.storeNode.store.code,
        productCode: product.code,
        productName: product.name,
        sku: product.sku,
        shortName: product.shortName,
        description: product.description,
        productType: product.productType,
        department: product.department,
        category: product.category,
        subcategory: product.subcategory,
        brand: product.brand,
        seasonCode: product.seasonCode,
        unitOfMeasure: product.unitOfMeasure,
        baseUnitOfMeasure:
          product.baseUnitOfMeasure?.code ?? product.unitOfMeasure,
        uomScheduleCode: product.uomSchedule?.code ?? null,
        uomScheduleName: product.uomSchedule?.name ?? null,
        uomScheduleBaseUnit:
          product.uomSchedule?.baseUnitOfMeasure.code ?? null,
        uomConversions:
          product.uomSchedule?.lines.map((line) => ({
            uomCode: line.unitOfMeasure.code,
            uomName: line.unitOfMeasure.name,
            conversionFactor: Number(line.conversionFactor),
            isBaseUnit: line.isBaseUnit,
            allowSale: line.allowSale,
            allowPurchase: line.allowPurchase,
          })) ?? [],
        packSize: product.packSize,
        countryOfOrigin: product.countryOfOrigin,
        primaryImageUrl: product.primaryImageUrl,
        notes: product.notes,
        taxable: product.taxable,
        taxProfileCode: product.taxProfile?.code ?? null,
        taxProfileName: product.taxProfile?.name ?? null,
        taxRatePercent: toOptionalRoundedNumber(
          product.taxProfile?.ratePercent,
          2,
        ),
        taxInclusive: product.taxProfile?.isTaxInclusive ?? false,
        trackInventory: product.trackInventory,
        isSerialized: product.isSerialized,
        trackSize: product.trackSize,
        trackColor: product.trackColor,
        allowPriceOverride: product.allowPriceOverride,
        mustEnterPriceAtPos: product.mustEnterPriceAtPos,
        minStockLevel: toOptionalRoundedNumber(product.minStockLevel, 3),
        reorderPoint: toOptionalRoundedNumber(product.reorderPoint, 3),
        reorderQuantity: toOptionalRoundedNumber(product.reorderQuantity, 3),
        safetyStockLevel: toOptionalRoundedNumber(product.safetyStockLevel, 3),
        shelfLifeDays: product.shelfLifeDays,
        weightKg: toOptionalRoundedNumber(product.weightKg, 3),
        volumeLitres: toOptionalRoundedNumber(product.volumeLitres, 3),
        unitPrice:
          storeProductPrice?.unitPrice ??
          priceEntry?.unitPrice ??
          Number(product.baseUnitPrice),
        quantityOnHand: quantityByProductId.get(product.id) ?? 0,
        catalogSortOrder:
          catalogSortOrderByProductCode.get(product.code.trim().toUpperCase()) ??
          null,
        matrixVariants: product.matrixVariants
          .filter((variant) => variant.status !== "ARCHIVED")
          .map((variant) => {
            const storeVariantPrice = storePriceByVariantId.get(variant.id);

            return {
              variantId: variant.id,
              variantCode: variant.code,
              sku: variant.sku,
              displayName: variant.displayName,
              unitPrice: storeVariantPrice?.unitPrice ?? Number(variant.unitPrice),
              quantityOnHand: Number(variant.quantityOnHand),
              barcode: variant.barcode,
              status: variant.status,
              attributes: variant.values.map((value) => ({
                attributeCode: value.attribute.code,
                attributeName: value.attribute.name,
                valueCode: value.attributeValue.code,
                valueLabel: value.attributeValue.label,
              })),
            };
          }),
        publishedAt: now.toISOString(),
      };

      outboxRows.push({
        id: randomUUID(),
        syncNodeId: target.enterpriseNode.id,
        targetNodeCode: target.storeNode.code,
        aggregateType: "product",
        aggregateId: product.id,
        eventType: "catalog.product.published",
        idempotencyKey: bootstrapToken
          ? `${target.enterpriseNode.code}:product:bootstrap:${bootstrapToken}:${product.code}:${productVersionStamp}`
          : `${target.enterpriseNode.code}:product:auto:${target.storeNode.code}:${product.code}:${productVersionStamp}`,
        payload: serializeRequiredJsonField(payload),
        status: SyncEventStatus.PENDING,
      });
    }

    if (!product.isSerialized) {
      continue;
    }

    const productSerialUnits = serialUnitsByProductId.get(product.id) ?? [];
    const serialSnapshotVersionStamp = Math.max(
      product.updatedAt.getTime(),
      ...productSerialUnits.map((serialUnit) => serialUnit.updatedAt.getTime()),
    );

    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "inventorySerialSnapshot",
        product.code,
        serialSnapshotVersionStamp,
      )
    ) {
      continue;
    }

    const serialPayload: EnterpriseInventorySerialSnapshotPublishedPayload = {
      storeCode: target.storeNode.store.code,
      productCode: product.code,
      productName: product.name,
      availableQuantity: productSerialUnits.filter(
        (serialUnit) => serialUnit.status === SerialInventoryStatus.AVAILABLE,
      ).length,
      serialItems: productSerialUnits.map((serialUnit) => ({
        serialNumber: serialUnit.serialNumber,
        locationCode: serialUnit.inventoryLocation?.code ?? null,
        status:
          serialUnit.status as EnterpriseInventorySerialSnapshotPublishedPayload["serialItems"][number]["status"],
        sourceReferenceType: serialUnit.sourceReferenceType,
        sourceReferenceId: serialUnit.sourceReferenceId,
        sourceReferenceLabel: serialUnit.sourceReferenceLabel,
        updatedAt: serialUnit.updatedAt.toISOString(),
      })),
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "inventorySerialSnapshot",
      aggregateId: product.id,
      eventType: "inventory.serial-snapshot.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:inventorySerialSnapshot:bootstrap:${bootstrapToken}:${product.code}:${serialSnapshotVersionStamp}`
        : `${target.enterpriseNode.code}:inventorySerialSnapshot:auto:${target.storeNode.code}:${product.code}:${serialSnapshotVersionStamp}`,
      payload: serializeRequiredJsonField(serialPayload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const barcode of barcodes) {
    const productForBarcode = productsForStore.find(
      (product) => product.code === barcode.product.code,
    );

    if (!productForBarcode) {
      continue;
    }

    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "barcode",
        barcode.code,
        barcode.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseBarcodePublishedPayload = {
      storeCode: target.storeNode.store.code,
      productCode: barcode.product.code,
      barcode: barcode.code,
      barcodeType: barcode.barcodeType,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "barcode",
      aggregateId: barcode.id,
      eventType: "catalog.barcode.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:barcode:bootstrap:${bootstrapToken}:${barcode.code}:${barcode.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:barcode:auto:${target.storeNode.code}:${barcode.code}:${barcode.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const taxProfile of taxProfiles) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "taxProfile",
        taxProfile.code,
        taxProfile.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseTaxProfilePublishedPayload = {
      storeCode: target.storeNode.store.code,
      taxProfileCode: taxProfile.code,
      taxProfileName: taxProfile.name,
      description: taxProfile.description,
      ratePercent: Number(taxProfile.ratePercent),
      isDefault: taxProfile.isDefault,
      isTaxInclusive: taxProfile.isTaxInclusive,
      status: taxProfile.status,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "taxProfile",
      aggregateId: taxProfile.id,
      eventType: "setup.tax-profile.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:taxProfile:bootstrap:${bootstrapToken}:${taxProfile.code}:${taxProfile.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:taxProfile:auto:${target.storeNode.code}:${taxProfile.code}:${taxProfile.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const tenderMethod of tenderMethods) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "tenderMethod",
        tenderMethod.code,
        tenderMethod.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseTenderMethodPublishedPayload = {
      storeCode: target.storeNode.store.code,
      tenderMethodCode: tenderMethod.code,
      tenderMethodName: tenderMethod.name,
      paymentMethod: tenderMethod.paymentMethod as SyncPaymentMethod,
      gatewayProvider: tenderMethod.gatewayProvider as EnterpriseTenderMethodPublishedPayload["gatewayProvider"],
      gatewayMode: tenderMethod.gatewayMode as EnterpriseTenderMethodPublishedPayload["gatewayMode"],
      gatewayMerchantId: tenderMethod.gatewayMerchantId,
      gatewayPublicKey: tenderMethod.gatewayPublicKey,
      gatewayCallbackUrl: tenderMethod.gatewayCallbackUrl,
      gatewayActive: tenderMethod.gatewayActive,
      gatewayStatus: tenderMethod.gatewayStatus as EnterpriseTenderMethodPublishedPayload["gatewayStatus"],
      description: tenderMethod.description,
      requiresReference: tenderMethod.requiresReference,
      allowChange: tenderMethod.allowChange,
      allowRefund: tenderMethod.allowRefund,
      allowOpenCashDrawer: tenderMethod.allowOpenCashDrawer,
      status: tenderMethod.status,
      sortOrder: tenderMethod.sortOrder,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "tenderMethod",
      aggregateId: tenderMethod.id,
      eventType: "setup.tender-method.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:tenderMethod:bootstrap:${bootstrapToken}:${tenderMethod.code}:${tenderMethod.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:tenderMethod:auto:${target.storeNode.code}:${tenderMethod.code}:${tenderMethod.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const bankAccount of bankAccounts) {
    const versionStamp = Math.max(
      bankAccount.updatedAt.getTime(),
      bankAccount.branch.updatedAt.getTime(),
      bankAccount.branch.bank.updatedAt.getTime(),
    );

    if (
      mode === "delta" &&
      hasExistingMasterPublication("bankAccount", bankAccount.id, versionStamp)
    ) {
      continue;
    }

    const payload: EnterpriseBankAccountPublishedPayload = {
      storeCode: target.storeNode.store.code,
      bankAccountId: bankAccount.id,
      bankCode: bankAccount.branch.bank.code,
      bankName: bankAccount.branch.bank.name,
      branchCode: bankAccount.branch.code,
      branchName: bankAccount.branch.name,
      accountNumber: bankAccount.accountNumber,
      accountName: bankAccount.accountName,
      currencyCode: bankAccount.currencyCode,
      status:
        bankAccount.status === RecordStatus.ACTIVE &&
        bankAccount.branch.status === RecordStatus.ACTIVE &&
        bankAccount.branch.bank.status === RecordStatus.ACTIVE
          ? "ACTIVE"
          : "INACTIVE",
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "bankAccount",
      aggregateId: bankAccount.id,
      eventType: "setup.bank-account.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:bankAccount:bootstrap:${bootstrapToken}:${bankAccount.id}:${versionStamp}`
        : `${target.enterpriseNode.code}:bankAccount:auto:${target.storeNode.code}:${bankAccount.id}:${versionStamp}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const giftCertificate of giftCertificates) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "giftCertificate",
        giftCertificate.certificateNo,
        giftCertificate.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const payload: EnterpriseGiftCertificatePublishedPayload = {
      storeCode: target.storeNode.store.code,
      certificateId: giftCertificate.id,
      certificateNo: giftCertificate.certificateNo,
      recipientName: giftCertificate.recipientName,
      purchaserName: giftCertificate.purchaserName,
      originalAmount: Number(giftCertificate.originalAmount),
      balanceAmount: Number(giftCertificate.balanceAmount),
      currencyCode: giftCertificate.currencyCode,
      issueDate: giftCertificate.issueDate.toISOString(),
      expiryDate: giftCertificate.expiryDate?.toISOString() ?? null,
      status: giftCertificate.status,
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "giftCertificate",
      aggregateId: giftCertificate.id,
      eventType: "gift-certificate.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:giftCertificate:bootstrap:${bootstrapToken}:${giftCertificate.certificateNo}:${giftCertificate.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:giftCertificate:auto:${target.storeNode.code}:${giftCertificate.certificateNo}:${giftCertificate.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const purchaseOrder of purchaseOrders) {
    if (
      mode === "delta" &&
      hasExistingMasterPublication(
        "purchaseOrder",
        purchaseOrder.id,
        purchaseOrder.updatedAt.getTime(),
      )
    ) {
      continue;
    }

    const orderedQuantity = Number(
      purchaseOrder.lines
        .reduce((sum, line) => sum + Number(line.orderedQuantity), 0)
        .toFixed(3),
    );
    const receivedQuantity = Number(
      purchaseOrder.lines
        .reduce((sum, line) => sum + Number(line.receivedQuantity), 0)
        .toFixed(3),
    );
    const exceptionQuantity = Number(
      purchaseOrder.lines
        .reduce((sum, line) => sum + Number(line.exceptionQuantity), 0)
        .toFixed(3),
    );
    const outstandingQuantity = Number(
      Math.max(
        0,
        orderedQuantity - receivedQuantity - exceptionQuantity,
      ).toFixed(3),
    );
    const payload: EnterprisePurchaseOrderPublishedPayload = {
      storeCode: target.storeNode.store.code,
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      locationCode: purchaseOrder.inventoryLocation.code,
      locationName: purchaseOrder.inventoryLocation.name,
      supplierNo: purchaseOrder.supplier?.supplierNo ?? null,
      supplierName: purchaseOrder.supplier?.name ?? null,
      externalReference: purchaseOrder.externalReference,
      status: (
        purchaseOrder.status === PurchaseOrderStatus.RECEIVED ||
        purchaseOrder.status === PurchaseOrderStatus.CLOSED
          ? purchaseOrder.status
          : purchaseOrder.status === PurchaseOrderStatus.PART_RECEIVED
            ? "PART_RECEIVED"
            : "COMMITTED"
      ) as EnterprisePurchaseOrderPublishedPayload["status"],
      note: purchaseOrder.note,
      operatorName: purchaseOrder.operatorName,
      committedAt: purchaseOrder.committedAt?.toISOString() ?? null,
      closedAt: purchaseOrder.closedAt?.toISOString() ?? null,
      closureReason: purchaseOrder.closureReason as SyncPurchaseOrderClosureReason | null,
      closureNote: purchaseOrder.closureNote,
      closureOperatorName: purchaseOrder.closureOperatorName,
      orderedQuantity,
      receivedQuantity,
      exceptionQuantity,
      outstandingQuantity,
      lines: purchaseOrder.lines.map((line) => {
        const lineOrderedQuantity = Number(
          Number(line.orderedQuantity).toFixed(3),
        );
        const lineReceivedQuantity = Number(
          Number(line.receivedQuantity).toFixed(3),
        );
        const lineExceptionQuantity = Number(
          Number(line.exceptionQuantity).toFixed(3),
        );

        return {
          purchaseOrderLineId: line.id,
          lineNo: line.lineNo,
          productCode: line.product.code,
          productName: line.product.name,
          departmentCode: line.product.department,
          departmentName: line.product.department,
          categoryCode: line.product.category,
          categoryName: line.product.category,
          subcategory: line.product.subcategory,
          isSerialized: line.product.isSerialized,
          orderedQuantity: lineOrderedQuantity,
          receivedQuantity: lineReceivedQuantity,
          exceptionQuantity: lineExceptionQuantity,
          outstandingQuantity: Number(
            Math.max(
              0,
              lineOrderedQuantity -
                lineReceivedQuantity -
                lineExceptionQuantity,
            ).toFixed(3),
          ),
          unitCost: line.unitCost === null ? null : Number(line.unitCost),
        };
      }),
      publishedAt: now.toISOString(),
    };

    outboxRows.push({
      id: randomUUID(),
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "purchaseOrder",
      aggregateId: purchaseOrder.id,
      eventType: "purchase-order.published",
      idempotencyKey: bootstrapToken
        ? `${target.enterpriseNode.code}:purchaseOrder:bootstrap:${bootstrapToken}:${purchaseOrder.id}:${purchaseOrder.updatedAt.getTime()}`
        : `${target.enterpriseNode.code}:purchaseOrder:auto:${target.storeNode.code}:${purchaseOrder.id}:${purchaseOrder.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    });
  }

  for (const priceList of priceLists) {
    for (const entry of priceList.entries) {
      if (!activeProductIds.has(entry.product.id)) {
        continue;
      }

      const storeProductPrice = priceList.isDefault
        ? storePriceByProductId.get(entry.product.id)
        : null;
      const versionStamp = Math.max(
        priceList.updatedAt.getTime(),
        entry.updatedAt.getTime(),
        storeProductPrice?.updatedAt.getTime() ?? 0,
      );

      if (
        mode === "delta" &&
        hasExistingMasterPublication("priceList", entry.id, versionStamp)
      ) {
        continue;
      }

      const payload: EnterprisePriceListPublishedPayload = {
        storeCode: target.storeNode.store.code,
        priceListCode: priceList.code,
        priceListName: priceList.name,
        currencyCode: priceList.currencyCode,
        isDefault: priceList.isDefault,
        customerType: priceList.customerType,
        loyaltyTier: priceList.loyaltyTier,
        status: priceList.status,
        productCode: entry.product.code,
        unitPrice: storeProductPrice?.unitPrice ?? Number(entry.unitPrice),
        publishedAt: now.toISOString(),
      };

      outboxRows.push({
        id: randomUUID(),
        syncNodeId: target.enterpriseNode.id,
        targetNodeCode: target.storeNode.code,
        aggregateType: "priceList",
        aggregateId: entry.id,
        eventType: "pricing.price-list.published",
        idempotencyKey: bootstrapToken
          ? `${target.enterpriseNode.code}:priceList:bootstrap:${bootstrapToken}:${entry.id}:${versionStamp}`
          : `${target.enterpriseNode.code}:priceList:auto:${target.storeNode.code}:${entry.id}:${versionStamp}`,
        payload: serializeRequiredJsonField(payload),
        status: SyncEventStatus.PENDING,
      });
    }
  }

  if (outboxRows.length === 0) {
    return 0;
  }

  const dedupedOutboxRows = Array.from(
    new Map(outboxRows.map((row) => [row.idempotencyKey, row])).values(),
  );
  const alreadyQueuedKeys = new Set(
    (
      await tx.syncOutboxEvent.findMany({
        where: {
          idempotencyKey: {
            in: dedupedOutboxRows.map((row) => row.idempotencyKey),
          },
        },
        select: {
          idempotencyKey: true,
        },
      })
    ).map((row) => row.idempotencyKey),
  );
  const rowsToCreate = dedupedOutboxRows.filter(
    (row) => !alreadyQueuedKeys.has(row.idempotencyKey),
  );

  if (rowsToCreate.length === 0) {
    return 0;
  }

  const result = await tx.syncOutboxEvent.createMany({
    data: rowsToCreate.map((row, index) => {
      const stampedAt = new Date(now.getTime() + index);

      return {
        ...row,
        createdAt: stampedAt,
        updatedAt: stampedAt,
      };
    }),
    });

  return result.count;
}

async function createOperatorAuditAction(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    syncNodeId: string;
    syncOutboxEventId: string | null;
    syncInboundEventId: string | null;
    actionType: SyncOperatorActionType;
    operatorName: string;
    note: string;
    aggregateType: string | null;
    eventType: string | null;
  },
) {
  const syncNode = await tx.syncNode.findUnique({
    where: {
      id: input.syncNodeId,
    },
    select: {
      code: true,
      retailOrgId: true,
    },
  });

  await tx.syncOperatorAction.create({
    data: {
      syncNodeId: input.syncNodeId,
      syncOutboxEventId: input.syncOutboxEventId,
      syncInboundEventId: input.syncInboundEventId,
      actionType: input.actionType,
      operatorName: input.operatorName,
      note: input.note,
      aggregateType: input.aggregateType,
      eventType: input.eventType,
    },
  });

  if (syncNode) {
    await writeEnterpriseSecurityLog(tx, {
      retailOrgId: syncNode.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "Sync recovery",
      action: input.actionType,
      actorLabel: input.operatorName,
      targetType: input.aggregateType,
      targetRef: input.syncInboundEventId ?? input.syncOutboxEventId,
      sourceNodeCode: syncNode.code,
      message: `${input.operatorName} recorded ${input.actionType.toLowerCase().replaceAll("_", " ")} for ${input.aggregateType ?? "sync packet"}.`,
      details: {
        syncNodeCode: syncNode.code,
        syncOutboxEventId: input.syncOutboxEventId,
        syncInboundEventId: input.syncInboundEventId,
        actionType: input.actionType,
        aggregateType: input.aggregateType,
        eventType: input.eventType,
        note: input.note,
      },
    });
  }
}

function parseStorePosShiftOpenedPayload(
  event: SyncEnvelope,
): StorePosShiftOpenedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    shiftId: readRequiredString(
      payload,
      "shiftId",
      event.aggregateType,
      event.eventType,
    ),
    shiftNo: readRequiredString(
      payload,
      "shiftNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    cashierCode: readRequiredString(
      payload,
      "cashierCode",
      event.aggregateType,
      event.eventType,
    ),
    openingFloatAmount: readRequiredNumber(
      payload,
      "openingFloatAmount",
      event.aggregateType,
      event.eventType,
    ),
    openedAt: readRequiredDate(
      payload,
      "openedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStorePosShiftClosedPayload(
  event: SyncEnvelope,
): StorePosShiftClosedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const totalAmount = readRequiredNumber(
    payload,
    "totalAmount",
    event.aggregateType,
    event.eventType,
  );
  const depositAmount = Math.max(
    0,
    readOptionalNumber(payload, "depositAmount") ?? 0,
  );
  return {
    shiftId: readRequiredString(
      payload,
      "shiftId",
      event.aggregateType,
      event.eventType,
    ),
    shiftNo: readRequiredString(
      payload,
      "shiftNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    cashierCode: readRequiredString(
      payload,
      "cashierCode",
      event.aggregateType,
      event.eventType,
    ),
    openingFloatAmount: readRequiredNumber(
      payload,
      "openingFloatAmount",
      event.aggregateType,
      event.eventType,
    ),
    closingDeclaredCash: readRequiredNumber(
      payload,
      "closingDeclaredCash",
      event.aggregateType,
      event.eventType,
    ),
    closingVariance: readRequiredNumber(
      payload,
      "closingVariance",
      event.aggregateType,
      event.eventType,
    ),
    openedAt: readRequiredDate(
      payload,
      "openedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    closedAt: readRequiredDate(
      payload,
      "closedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStorePosTransactionCompletedPayload(
  event: SyncEnvelope,
): StorePosTransactionCompletedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const rawLines = payload.lines;
  const rawPayments = payload.payments;
  const transactionType = toPosTransactionType(
    readRequiredString(
      payload,
      "transactionType",
      event.aggregateType,
      event.eventType,
    ),
  );
  const totalAmount = readRequiredNumber(
    payload,
    "totalAmount",
    event.aggregateType,
    event.eventType,
  );

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP expected at least one line item in the store POS transaction payload.",
      false,
    );
  }

  if (!Array.isArray(rawPayments)) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP expected payments to be encoded as an array in the store POS transaction payload.",
      false,
    );
  }

  if (rawPayments.length === 0 && totalAmount !== 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP expected at least one payment in the store POS transaction payload.",
      false,
    );
  }

  const status = readRequiredString(
    payload,
    "status",
    event.aggregateType,
    event.eventType,
  );

  if (status !== "COMPLETED") {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP only projects completed store transactions, but received "${status}".`,
      false,
    );
  }

  return {
    transactionId: readRequiredString(
      payload,
      "transactionId",
      event.aggregateType,
      event.eventType,
    ),
    transactionNo: readRequiredString(
      payload,
      "transactionNo",
      event.aggregateType,
      event.eventType,
    ),
    sourceTransactionId: readOptionalString(payload, "sourceTransactionId"),
    sourceTransactionNo: readOptionalString(payload, "sourceTransactionNo"),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    shiftId: readOptionalString(payload, "shiftId"),
    shiftNo: readOptionalString(payload, "shiftNo"),
    cashierCode: readOptionalString(payload, "cashierCode"),
    customerId: readOptionalString(payload, "customerId"),
    customerNo: readOptionalString(payload, "customerNo"),
    customerName: readOptionalString(payload, "customerName"),
    transactionType,
    status: "COMPLETED",
    subtotalAmount: readRequiredNumber(
      payload,
      "subtotalAmount",
      event.aggregateType,
      event.eventType,
    ),
    discountAmount: readRequiredNumber(
      payload,
      "discountAmount",
      event.aggregateType,
      event.eventType,
    ),
    loyaltyPointsRedeemed: readRequiredNumber(
      payload,
      "loyaltyPointsRedeemed",
      event.aggregateType,
      event.eventType,
    ),
    loyaltyRedemptionAmount: readRequiredNumber(
      payload,
      "loyaltyRedemptionAmount",
      event.aggregateType,
      event.eventType,
    ),
    taxAmount: readRequiredNumber(
      payload,
      "taxAmount",
      event.aggregateType,
      event.eventType,
    ),
    totalAmount,
    paidAmount: readRequiredNumber(
      payload,
      "paidAmount",
      event.aggregateType,
      event.eventType,
    ),
    changeAmount: readRequiredNumber(
      payload,
      "changeAmount",
      event.aggregateType,
      event.eventType,
    ),
    notes: readOptionalString(payload, "notes"),
    headerReference: readOptionalString(payload, "headerReference"),
    additionalDetails: readOptionalString(payload, "additionalDetails"),
    completedAt: readRequiredDate(
      payload,
      "completedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    lines: rawLines.map((rawLine, index) => {
      const linePayload = toJsonObject(
        rawLine,
        event.aggregateType,
        `${event.eventType}:line:${index + 1}`,
      );

      return {
        lineId: readRequiredString(
          linePayload,
          "lineId",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        lineIntent: toPosTransactionLineIntent(
          readOptionalString(linePayload, "lineIntent") ??
            (transactionType === PosTransactionType.RETURN ? "RETURN" : "SALE"),
        ),
        sourceLineId: readOptionalString(linePayload, "sourceLineId"),
        productCode: readRequiredString(
          linePayload,
          "productCode",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        productVariantCode: readOptionalString(linePayload, "productVariantCode"),
        productName: readRequiredString(
          linePayload,
          "productName",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        barcode: readOptionalString(linePayload, "barcode"),
        variantSize: readOptionalString(linePayload, "variantSize"),
        variantColor: readOptionalString(linePayload, "variantColor"),
        variantAttributesSnapshot: readOptionalString(
          linePayload,
          "variantAttributesSnapshot",
        ),
        lineNote: readOptionalString(linePayload, "lineNote"),
        serialNumbers: readOptionalStringArray(linePayload, "serialNumbers"),
        quantity: readRequiredNumber(
          linePayload,
          "quantity",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        unitPrice: readRequiredNumber(
          linePayload,
          "unitPrice",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        discountAmount: readRequiredNumber(
          linePayload,
          "discountAmount",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        appliedPromotionCode: readOptionalString(
          linePayload,
          "appliedPromotionCode",
        ),
        appliedPromotionName: readOptionalString(
          linePayload,
          "appliedPromotionName",
        ),
        inventoryLocationCode: readOptionalString(
          linePayload,
          "inventoryLocationCode",
        ),
        taxAmount: readRequiredNumber(
          linePayload,
          "taxAmount",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        lineTotal: readRequiredNumber(
          linePayload,
          "lineTotal",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
      };
    }),
    payments: rawPayments.map((rawPayment, index) => {
      const paymentPayload = toJsonObject(
        rawPayment,
        event.aggregateType,
        `${event.eventType}:payment:${index + 1}`,
      );

      return {
        paymentId: readRequiredString(
          paymentPayload,
          "paymentId",
          event.aggregateType,
          `${event.eventType}:payment:${index + 1}`,
        ),
        method: toPaymentMethod(
          readRequiredString(
            paymentPayload,
            "method",
            event.aggregateType,
            `${event.eventType}:payment:${index + 1}`,
          ),
        ),
        amount: readRequiredNumber(
          paymentPayload,
          "amount",
          event.aggregateType,
          `${event.eventType}:payment:${index + 1}`,
        ),
        tenderMethodCode: readOptionalString(
          paymentPayload,
          "tenderMethodCode",
        ),
        tenderMethodName: readOptionalString(
          paymentPayload,
          "tenderMethodName",
        ),
        bankAccountId: readOptionalString(paymentPayload, "bankAccountId"),
        bankCode: readOptionalString(paymentPayload, "bankCode"),
        bankName: readOptionalString(paymentPayload, "bankName"),
        bankBranchCode: readOptionalString(paymentPayload, "bankBranchCode"),
        bankBranchName: readOptionalString(paymentPayload, "bankBranchName"),
        bankAccountNumber: readOptionalString(
          paymentPayload,
          "bankAccountNumber",
        ),
        bankAccountName: readOptionalString(paymentPayload, "bankAccountName"),
        reference: readOptionalString(paymentPayload, "reference"),
        receivedAt: readRequiredDate(
          paymentPayload,
          "receivedAt",
          event.aggregateType,
          `${event.eventType}:payment:${index + 1}`,
        ).toISOString(),
      };
    }),
  };
}

function parseStoreCustomerAccountEntryRecordedPayload(
  event: SyncEnvelope,
): StoreCustomerAccountEntryRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const entryType = readRequiredString(
    payload,
    "entryType",
    event.aggregateType,
    event.eventType,
  );

  if (entryType !== "ACCOUNT_PAYMENT") {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP does not support customer account entry type "${entryType}" from store nodes.`,
      false,
    );
  }

  return {
    entryId: readRequiredString(
      payload,
      "entryId",
      event.aggregateType,
      event.eventType,
    ),
    entryNo: readRequiredString(
      payload,
      "entryNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    shiftId: readRequiredString(
      payload,
      "shiftId",
      event.aggregateType,
      event.eventType,
    ),
    shiftNo: readOptionalString(payload, "shiftNo"),
    cashierCode: readOptionalString(payload, "cashierCode"),
    customerId: readRequiredString(
      payload,
      "customerId",
      event.aggregateType,
      event.eventType,
    ),
    customerNo: readRequiredString(
      payload,
      "customerNo",
      event.aggregateType,
      event.eventType,
    ),
    customerName: readRequiredString(
      payload,
      "customerName",
      event.aggregateType,
      event.eventType,
    ),
    entryType: "ACCOUNT_PAYMENT",
    paymentMethod: toPaymentMethod(
      readRequiredString(
        payload,
        "paymentMethod",
        event.aggregateType,
        event.eventType,
      ),
    ),
    tenderMethodCode: readOptionalString(payload, "tenderMethodCode"),
    tenderMethodName: readOptionalString(payload, "tenderMethodName"),
    bankAccountId: readOptionalString(payload, "bankAccountId"),
    bankCode: readOptionalString(payload, "bankCode"),
    bankName: readOptionalString(payload, "bankName"),
    bankBranchCode: readOptionalString(payload, "bankBranchCode"),
    bankBranchName: readOptionalString(payload, "bankBranchName"),
    bankAccountNumber: readOptionalString(payload, "bankAccountNumber"),
    bankAccountName: readOptionalString(payload, "bankAccountName"),
    amount: readRequiredNumber(
      payload,
      "amount",
      event.aggregateType,
      event.eventType,
    ),
    reference: readOptionalString(payload, "reference"),
    note: readOptionalString(payload, "note"),
    occurredAt: readRequiredDate(
      payload,
      "occurredAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreSalesOrderRecordedPayload(
  event: SyncEnvelope,
): StoreSalesOrderRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const totalAmount = readRequiredNumber(
    payload,
    "totalAmount",
    event.aggregateType,
    event.eventType,
  );
  const depositAmount = Math.max(
    0,
    readOptionalNumber(payload, "depositAmount") ?? 0,
  );
  const rawLines = Array.isArray(payload.lines) ? payload.lines : null;

  return {
    orderId: readRequiredString(
      payload,
      "orderId",
      event.aggregateType,
      event.eventType,
    ),
    orderNo: readRequiredString(
      payload,
      "orderNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    sourceTransactionId: readRequiredString(
      payload,
      "sourceTransactionId",
      event.aggregateType,
      event.eventType,
    ),
    sourceTransactionNo: readRequiredString(
      payload,
      "sourceTransactionNo",
      event.aggregateType,
      event.eventType,
    ),
    customerId: readOptionalString(payload, "customerId"),
    customerNo: readOptionalString(payload, "customerNo"),
    customerName: readOptionalString(payload, "customerName"),
    totalAmount,
    depositAmount,
    balanceAmount:
      readOptionalNumber(payload, "balanceAmount") ??
      Math.max(0, Number((totalAmount - depositAmount).toFixed(2))),
    depositTenderMethodCode: readOptionalString(
      payload,
      "depositTenderMethodCode",
    ),
    depositTenderMethodName: readOptionalString(
      payload,
      "depositTenderMethodName",
    ),
    depositPaymentMethod: toOptionalPaymentMethod(
      readOptionalString(payload, "depositPaymentMethod"),
    ),
    depositReference: readOptionalString(payload, "depositReference"),
    depositPaidAt:
      toOptionalDate(
        readOptionalString(payload, "depositPaidAt"),
      )?.toISOString() ?? null,
    status: toSalesOrderStatus(
      readRequiredString(
        payload,
        "status",
        event.aggregateType,
        event.eventType,
      ),
    ),
    operatorName: readOptionalString(payload, "operatorName"),
    note: readOptionalString(payload, "note"),
    createdAt: readRequiredDate(
      payload,
      "createdAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    fulfilledTransactionId: readOptionalString(
      payload,
      "fulfilledTransactionId",
    ),
    fulfilledTransactionNo: readOptionalString(
      payload,
      "fulfilledTransactionNo",
    ),
    fulfilledAt:
      toOptionalDate(
        readOptionalString(payload, "fulfilledAt"),
      )?.toISOString() ?? null,
    cancelledAt:
      toOptionalDate(
        readOptionalString(payload, "cancelledAt"),
      )?.toISOString() ?? null,
    lines: rawLines?.map((rawLine, index) => {
      const lineEventType = `${event.eventType}:line:${index + 1}`;
      const line = toJsonObject(
        rawLine,
        event.aggregateType,
        lineEventType,
      );

      return {
        lineId: readRequiredString(
          line,
          "lineId",
          event.aggregateType,
          lineEventType,
        ),
        productCode: readRequiredString(
          line,
          "productCode",
          event.aggregateType,
          lineEventType,
        ),
        productVariantCode: readOptionalString(line, "productVariantCode"),
        productName: readRequiredString(
          line,
          "productName",
          event.aggregateType,
          lineEventType,
        ),
        variantSize: readOptionalString(line, "variantSize"),
        variantColor: readOptionalString(line, "variantColor"),
        variantAttributesSnapshot: readOptionalString(
          line,
          "variantAttributesSnapshot",
        ),
        lineNote: readOptionalString(line, "lineNote"),
        quantity: readRequiredNumber(
          line,
          "quantity",
          event.aggregateType,
          lineEventType,
        ),
        unitPrice: readRequiredNumber(
          line,
          "unitPrice",
          event.aggregateType,
          lineEventType,
        ),
        discountAmount: readRequiredNumber(
          line,
          "discountAmount",
          event.aggregateType,
          lineEventType,
        ),
        taxAmount: readRequiredNumber(
          line,
          "taxAmount",
          event.aggregateType,
          lineEventType,
        ),
        lineTotal: readRequiredNumber(
          line,
          "lineTotal",
          event.aggregateType,
          lineEventType,
        ),
        appliedPromotionCode: readOptionalString(
          line,
          "appliedPromotionCode",
        ),
        appliedPromotionName: readOptionalString(
          line,
          "appliedPromotionName",
        ),
      };
    }),
  };
}

function parseStoreEodReconciliationRecordedPayload(
  event: SyncEnvelope,
): StoreEodReconciliationRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    reconciliationId: readRequiredString(
      payload,
      "reconciliationId",
      event.aggregateType,
      event.eventType,
    ),
    reconciliationNo: readRequiredString(
      payload,
      "reconciliationNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    shiftId: readRequiredString(
      payload,
      "shiftId",
      event.aggregateType,
      event.eventType,
    ),
    shiftNo: readRequiredString(
      payload,
      "shiftNo",
      event.aggregateType,
      event.eventType,
    ),
    cashierCode: readRequiredString(
      payload,
      "cashierCode",
      event.aggregateType,
      event.eventType,
    ),
    expectedCashAmount: readRequiredNumber(
      payload,
      "expectedCashAmount",
      event.aggregateType,
      event.eventType,
    ),
    declaredCashAmount: readRequiredNumber(
      payload,
      "declaredCashAmount",
      event.aggregateType,
      event.eventType,
    ),
    varianceAmount: readRequiredNumber(
      payload,
      "varianceAmount",
      event.aggregateType,
      event.eventType,
    ),
    netSalesAmount: readRequiredNumber(
      payload,
      "netSalesAmount",
      event.aggregateType,
      event.eventType,
    ),
    cashTenderedAmount: readRequiredNumber(
      payload,
      "cashTenderedAmount",
      event.aggregateType,
      event.eventType,
    ),
    nonCashTenderedAmount: readRequiredNumber(
      payload,
      "nonCashTenderedAmount",
      event.aggregateType,
      event.eventType,
    ),
    transactionCount: readRequiredNumber(
      payload,
      "transactionCount",
      event.aggregateType,
      event.eventType,
    ),
    operatorName: readOptionalString(payload, "operatorName"),
    note: readOptionalString(payload, "note"),
    reconciledAt: readRequiredDate(
      payload,
      "reconciledAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreBankingDepositRecordedPayload(
  event: SyncEnvelope,
): StoreBankingDepositRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    depositId: readRequiredString(
      payload,
      "depositId",
      event.aggregateType,
      event.eventType,
    ),
    depositNo: readRequiredString(
      payload,
      "depositNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    reconciliationId: readRequiredString(
      payload,
      "reconciliationId",
      event.aggregateType,
      event.eventType,
    ),
    reconciliationNo: readRequiredString(
      payload,
      "reconciliationNo",
      event.aggregateType,
      event.eventType,
    ),
    shiftId: readRequiredString(
      payload,
      "shiftId",
      event.aggregateType,
      event.eventType,
    ),
    shiftNo: readRequiredString(
      payload,
      "shiftNo",
      event.aggregateType,
      event.eventType,
    ),
    amount: readRequiredNumber(
      payload,
      "amount",
      event.aggregateType,
      event.eventType,
    ),
    bankName: readOptionalString(payload, "bankName"),
    bankAccountId: readOptionalString(payload, "bankAccountId"),
    bankCode: readOptionalString(payload, "bankCode"),
    bankBranchCode: readOptionalString(payload, "bankBranchCode"),
    bankBranchName: readOptionalString(payload, "bankBranchName"),
    bankAccountNumber: readOptionalString(payload, "bankAccountNumber"),
    bankAccountName: readOptionalString(payload, "bankAccountName"),
    reference: readOptionalString(payload, "reference"),
    operatorName: readOptionalString(payload, "operatorName"),
    note: readOptionalString(payload, "note"),
    depositedAt: readRequiredDate(
      payload,
      "depositedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreExpenseConfirmedPayload(
  event: SyncEnvelope,
): StoreExpenseConfirmedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    expenseId: readRequiredString(
      payload,
      "expenseId",
      event.aggregateType,
      event.eventType,
    ),
    expenseNo: readRequiredString(
      payload,
      "expenseNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    expenseDate: readRequiredDate(
      payload,
      "expenseDate",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    category: readRequiredString(
      payload,
      "category",
      event.aggregateType,
      event.eventType,
    ),
    description: readRequiredString(
      payload,
      "description",
      event.aggregateType,
      event.eventType,
    ),
    supplierName: readOptionalString(payload, "supplierName"),
    paymentMethod: readOptionalString(payload, "paymentMethod"),
    externalReference: readOptionalString(payload, "externalReference"),
    amount: readRequiredNumber(
      payload,
      "amount",
      event.aggregateType,
      event.eventType,
    ),
    taxAmount: readRequiredNumber(
      payload,
      "taxAmount",
      event.aggregateType,
      event.eventType,
    ),
    attachmentFileName: readOptionalString(payload, "attachmentFileName"),
    attachmentUrl: readOptionalString(payload, "attachmentUrl"),
    attachmentContentType: readOptionalString(payload, "attachmentContentType"),
    attachmentContentBase64: readOptionalString(payload, "attachmentContentBase64"),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    note: readOptionalString(payload, "note"),
    confirmedAt: readRequiredDate(
      payload,
      "confirmedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreInventoryLedgerRecordedPayload(
  event: SyncEnvelope,
): StoreInventoryLedgerRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    ledgerEntryId: readRequiredString(
      payload,
      "ledgerEntryId",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    inventoryLocationCode: readOptionalString(payload, "inventoryLocationCode"),
    productCode: readRequiredString(
      payload,
      "productCode",
      event.aggregateType,
      event.eventType,
    ),
    movementType: toInventoryMovementType(
      readRequiredString(
        payload,
        "movementType",
        event.aggregateType,
        event.eventType,
      ),
    ),
    quantity: readRequiredNumber(
      payload,
      "quantity",
      event.aggregateType,
      event.eventType,
    ),
    serialNumbers: readOptionalStringArray(payload, "serialNumbers"),
    unitCost:
      payload.unitCost === null || payload.unitCost === undefined
        ? null
        : readRequiredNumber(
            payload,
            "unitCost",
            event.aggregateType,
            event.eventType,
          ),
    referenceType: readRequiredString(
      payload,
      "referenceType",
      event.aggregateType,
      event.eventType,
    ),
    referenceId: readRequiredString(
      payload,
      "referenceId",
      event.aggregateType,
      event.eventType,
    ),
    externalReference: readOptionalString(payload, "externalReference"),
    occurredAt: readRequiredDate(
      payload,
      "occurredAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreInventoryTransferRecordedPayload(
  event: SyncEnvelope,
): StoreInventoryTransferRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    transferId: readRequiredString(
      payload,
      "transferId",
      event.aggregateType,
      event.eventType,
    ),
    outboundLedgerEntryId: readRequiredString(
      payload,
      "outboundLedgerEntryId",
      event.aggregateType,
      event.eventType,
    ),
    inboundLedgerEntryId: readRequiredString(
      payload,
      "inboundLedgerEntryId",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    sourceInventoryLocationCode: readRequiredString(
      payload,
      "sourceInventoryLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    destinationInventoryLocationCode: readRequiredString(
      payload,
      "destinationInventoryLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    productCode: readRequiredString(
      payload,
      "productCode",
      event.aggregateType,
      event.eventType,
    ),
    quantity: readRequiredNumber(
      payload,
      "quantity",
      event.aggregateType,
      event.eventType,
    ),
    serialNumbers: readOptionalStringArray(payload, "serialNumbers"),
    unitCost:
      payload.unitCost === null || payload.unitCost === undefined
        ? null
        : readRequiredNumber(
            payload,
            "unitCost",
            event.aggregateType,
            event.eventType,
          ),
    referenceType: readRequiredString(
      payload,
      "referenceType",
      event.aggregateType,
      event.eventType,
    ),
    referenceId: readRequiredString(
      payload,
      "referenceId",
      event.aggregateType,
      event.eventType,
    ),
    externalReference: readOptionalString(payload, "externalReference"),
    occurredAt: readRequiredDate(
      payload,
      "occurredAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreGoodsReceiptRecordedPayload(
  event: SyncEnvelope,
): StoreGoodsReceiptRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
  const rawExceptions = Array.isArray(payload.exceptions)
    ? payload.exceptions
    : [];

  if (rawLines.length === 0 && rawExceptions.length === 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP expected at least one goods-receipt line or receipt exception from the store node.",
      false,
    );
  }

  return {
    goodsReceiptId: readRequiredString(
      payload,
      "goodsReceiptId",
      event.aggregateType,
      event.eventType,
    ),
    goodsReceiptNo: readRequiredString(
      payload,
      "goodsReceiptNo",
      event.aggregateType,
      event.eventType,
    ),
    purchaseOrderId: readOptionalString(payload, "purchaseOrderId"),
    purchaseOrderNo: readOptionalString(payload, "purchaseOrderNo"),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    inventoryLocationCode: readRequiredString(
      payload,
      "inventoryLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    supplierNo: readOptionalString(payload, "supplierNo"),
    supplierName: readOptionalString(payload, "supplierName"),
    externalReference: readOptionalString(payload, "externalReference"),
    note: readOptionalString(payload, "note"),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    receivedAt: readRequiredDate(
      payload,
      "receivedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    lines: rawLines.map((rawLine, index) => {
      const linePayload = toJsonObject(
        rawLine,
        event.aggregateType,
        `${event.eventType}:line:${index + 1}`,
      );

      return {
        goodsReceiptLineId: readRequiredString(
          linePayload,
          "goodsReceiptLineId",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        purchaseOrderLineId: readOptionalString(
          linePayload,
          "purchaseOrderLineId",
        ),
        lineNo: readRequiredNumber(
          linePayload,
          "lineNo",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        productCode: readRequiredString(
          linePayload,
          "productCode",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        productName: readRequiredString(
          linePayload,
          "productName",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        quantity: readRequiredNumber(
          linePayload,
          "quantity",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        unitCost:
          linePayload.unitCost === null || linePayload.unitCost === undefined
            ? null
            : readRequiredNumber(
                linePayload,
                "unitCost",
                event.aggregateType,
                `${event.eventType}:line:${index + 1}`,
              ),
        serialNumbers: readOptionalStringArray(linePayload, "serialNumbers"),
      };
    }),
    exceptions: rawExceptions.map((rawException, index) => {
      const exceptionPayload = toJsonObject(
        rawException,
        event.aggregateType,
        `${event.eventType}:exception:${index + 1}`,
      );

      return {
        receiptExceptionId: readRequiredString(
          exceptionPayload,
          "receiptExceptionId",
          event.aggregateType,
          `${event.eventType}:exception:${index + 1}`,
        ),
        purchaseOrderLineId: readOptionalString(
          exceptionPayload,
          "purchaseOrderLineId",
        ),
        lineNo: readRequiredNumber(
          exceptionPayload,
          "lineNo",
          event.aggregateType,
          `${event.eventType}:exception:${index + 1}`,
        ),
        productCode: readRequiredString(
          exceptionPayload,
          "productCode",
          event.aggregateType,
          `${event.eventType}:exception:${index + 1}`,
        ),
        productName: readRequiredString(
          exceptionPayload,
          "productName",
          event.aggregateType,
          `${event.eventType}:exception:${index + 1}`,
        ),
        quantity: readRequiredNumber(
          exceptionPayload,
          "quantity",
          event.aggregateType,
          `${event.eventType}:exception:${index + 1}`,
        ),
        unitCost:
          exceptionPayload.unitCost === null ||
          exceptionPayload.unitCost === undefined
            ? null
            : readRequiredNumber(
                exceptionPayload,
                "unitCost",
                event.aggregateType,
                `${event.eventType}:exception:${index + 1}`,
              ),
        reason: readRequiredString(
          exceptionPayload,
          "reason",
          event.aggregateType,
          `${event.eventType}:exception:${index + 1}`,
        ) as StoreGoodsReceiptRecordedPayload["exceptions"][number]["reason"],
        note: readOptionalString(exceptionPayload, "note"),
      };
    }),
  };
}

function parseStoreSupplierReturnRecordedPayload(
  event: SyncEnvelope,
): StoreSupplierReturnRecordedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];

  if (rawLines.length === 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP expected at least one supplier-return line from the store node.",
      false,
    );
  }

  return {
    supplierReturnId: readRequiredString(
      payload,
      "supplierReturnId",
      event.aggregateType,
      event.eventType,
    ),
    supplierReturnNo: readRequiredString(
      payload,
      "supplierReturnNo",
      event.aggregateType,
      event.eventType,
    ),
    purchaseOrderId: readOptionalString(payload, "purchaseOrderId"),
    purchaseOrderNo: readOptionalString(payload, "purchaseOrderNo"),
    goodsReceiptId: readOptionalString(payload, "goodsReceiptId"),
    goodsReceiptNo: readOptionalString(payload, "goodsReceiptNo"),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    inventoryLocationCode: readRequiredString(
      payload,
      "inventoryLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    supplierNo: readRequiredString(
      payload,
      "supplierNo",
      event.aggregateType,
      event.eventType,
    ),
    supplierName: readRequiredString(
      payload,
      "supplierName",
      event.aggregateType,
      event.eventType,
    ),
    externalReference: readOptionalString(payload, "externalReference"),
    reason: toSupplierReturnReason(
      readRequiredString(
        payload,
        "reason",
        event.aggregateType,
        event.eventType,
      ),
    ),
    note: readOptionalString(payload, "note"),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    returnedAt: readRequiredDate(
      payload,
      "returnedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    lines: rawLines.map((rawLine, index) => {
      const linePayload = toJsonObject(
        rawLine,
        event.aggregateType,
        `${event.eventType}:line:${index + 1}`,
      );

      return {
        supplierReturnLineId: readRequiredString(
          linePayload,
          "supplierReturnLineId",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        goodsReceiptLineId: readOptionalString(
          linePayload,
          "goodsReceiptLineId",
        ),
        purchaseOrderLineId: readOptionalString(
          linePayload,
          "purchaseOrderLineId",
        ),
        lineNo: readRequiredNumber(
          linePayload,
          "lineNo",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        productCode: readRequiredString(
          linePayload,
          "productCode",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        productName: readRequiredString(
          linePayload,
          "productName",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        quantity: readRequiredNumber(
          linePayload,
          "quantity",
          event.aggregateType,
          `${event.eventType}:line:${index + 1}`,
        ),
        unitCost:
          linePayload.unitCost === null || linePayload.unitCost === undefined
            ? null
            : readRequiredNumber(
                linePayload,
                "unitCost",
                event.aggregateType,
                `${event.eventType}:line:${index + 1}`,
              ),
        serialNumbers: readOptionalStringArray(linePayload, "serialNumbers"),
      };
    }),
  };
}

function parseStoreSupplierReturnCancellationAcknowledgedPayload(
  event: SyncEnvelope,
): StoreSupplierReturnCancellationAcknowledgedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    supplierReturnId: readRequiredString(
      payload,
      "supplierReturnId",
      event.aggregateType,
      event.eventType,
    ),
    supplierReturnNo: readRequiredString(
      payload,
      "supplierReturnNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    acknowledgedAt: readRequiredDate(
      payload,
      "acknowledgedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    note: readOptionalString(payload, "note"),
  };
}

function parseStoreStockCountSessionSubmittedPayload(
  event: SyncEnvelope,
): StoreStockCountSessionSubmittedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    sessionId: readRequiredString(
      payload,
      "sessionId",
      event.aggregateType,
      event.eventType,
    ),
    sessionNo: readRequiredString(
      payload,
      "sessionNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    inventoryLocationCode: readRequiredString(
      payload,
      "inventoryLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    productCode: readRequiredString(
      payload,
      "productCode",
      event.aggregateType,
      event.eventType,
    ),
    previousQuantity: readRequiredNumber(
      payload,
      "previousQuantity",
      event.aggregateType,
      event.eventType,
    ),
    countedQuantity: readRequiredNumber(
      payload,
      "countedQuantity",
      event.aggregateType,
      event.eventType,
    ),
    varianceQuantity: readRequiredNumber(
      payload,
      "varianceQuantity",
      event.aggregateType,
      event.eventType,
    ),
    previousSerialNumbers: readOptionalStringArray(
      payload,
      "previousSerialNumbers",
    ),
    countedSerialNumbers: readOptionalStringArray(
      payload,
      "countedSerialNumbers",
    ),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    note: readOptionalString(payload, "note"),
    submittedAt: readRequiredDate(
      payload,
      "submittedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreInterStoreTransferIssuedPayload(
  event: SyncEnvelope,
): StoreInterStoreTransferIssuedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    transferId: readRequiredString(
      payload,
      "transferId",
      event.aggregateType,
      event.eventType,
    ),
    transferNo: readRequiredString(
      payload,
      "transferNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    sourceLocationCode: readRequiredString(
      payload,
      "sourceLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    destinationLocationCode: readRequiredString(
      payload,
      "destinationLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    productCode: readRequiredString(
      payload,
      "productCode",
      event.aggregateType,
      event.eventType,
    ),
    quantity: readRequiredNumber(
      payload,
      "quantity",
      event.aggregateType,
      event.eventType,
    ),
    serialNumbers: readOptionalStringArray(payload, "serialNumbers"),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    note: readOptionalString(payload, "note"),
    occurredAt: readRequiredDate(
      payload,
      "occurredAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreInterStoreTransferRequestedPayload(
  event: SyncEnvelope,
): StoreInterStoreTransferRequestedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    requestId: readRequiredString(
      payload,
      "requestId",
      event.aggregateType,
      event.eventType,
    ),
    requestNo: readRequiredString(
      payload,
      "requestNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    sourceLocationCode: readRequiredString(
      payload,
      "sourceLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    destinationLocationCode: readRequiredString(
      payload,
      "destinationLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    productCode: readRequiredString(
      payload,
      "productCode",
      event.aggregateType,
      event.eventType,
    ),
    quantity: readRequiredNumber(
      payload,
      "quantity",
      event.aggregateType,
      event.eventType,
    ),
    externalReference: readOptionalString(payload, "externalReference"),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    note: readOptionalString(payload, "note"),
    occurredAt: readRequiredDate(
      payload,
      "occurredAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreInterStoreTransferReceivedPayload(
  event: SyncEnvelope,
): StoreInterStoreTransferReceivedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );

  return {
    transferId: readRequiredString(
      payload,
      "transferId",
      event.aggregateType,
      event.eventType,
    ),
    transferNo: readRequiredString(
      payload,
      "transferNo",
      event.aggregateType,
      event.eventType,
    ),
    storeCode: readRequiredString(
      payload,
      "storeCode",
      event.aggregateType,
      event.eventType,
    ),
    terminalCode: readRequiredString(
      payload,
      "terminalCode",
      event.aggregateType,
      event.eventType,
    ),
    sourceLocationCode: readRequiredString(
      payload,
      "sourceLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    destinationLocationCode: readRequiredString(
      payload,
      "destinationLocationCode",
      event.aggregateType,
      event.eventType,
    ),
    productCode: readRequiredString(
      payload,
      "productCode",
      event.aggregateType,
      event.eventType,
    ),
    quantity: readRequiredNumber(
      payload,
      "quantity",
      event.aggregateType,
      event.eventType,
    ),
    serialNumbers: readOptionalStringArray(payload, "serialNumbers"),
    operatorName: readRequiredString(
      payload,
      "operatorName",
      event.aggregateType,
      event.eventType,
    ),
    note: readOptionalString(payload, "note"),
    occurredAt: readRequiredDate(
      payload,
      "occurredAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
  };
}

function parseStoreSyncRecoveryTaskCompletedPayload(
  event: SyncEnvelope,
): StoreSyncRecoveryTaskCompletedPayload {
  const payload = toJsonObject(
    event.payload,
    event.aggregateType,
    event.eventType,
  );
  const taskType = readRequiredString(
    payload,
    "taskType",
    event.aggregateType,
    event.eventType,
  );
  const outcome = readRequiredString(
    payload,
    "outcome",
    event.aggregateType,
    event.eventType,
  );

  if (
    taskType !== "REQUEST_UPSTREAM_RESEND" &&
    taskType !== "APPLY_INVENTORY_ADJUSTMENT" &&
    taskType !== "APPLY_COUNT_VARIANCE" &&
    taskType !== "APPLY_STOCK_TRANSFER"
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP does not support task type "${taskType}" from store nodes.`,
      false,
    );
  }

  if (
    outcome !== "RESENT_QUEUED" &&
    outcome !== "ADJUSTMENT_QUEUED" &&
    outcome !== "COUNT_VARIANCE_QUEUED" &&
    outcome !== "TRANSFER_QUEUED"
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP does not support task outcome "${outcome}" from store nodes.`,
      false,
    );
  }

  if (
    (taskType === "REQUEST_UPSTREAM_RESEND" && outcome !== "RESENT_QUEUED") ||
    (taskType === "APPLY_INVENTORY_ADJUSTMENT" &&
      outcome !== "ADJUSTMENT_QUEUED") ||
    (taskType === "APPLY_COUNT_VARIANCE" &&
      outcome !== "COUNT_VARIANCE_QUEUED") ||
    (taskType === "APPLY_STOCK_TRANSFER" && outcome !== "TRANSFER_QUEUED")
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP received mismatched task outcome "${outcome}" for task type "${taskType}".`,
      false,
    );
  }

  return {
    taskId: readRequiredString(
      payload,
      "taskId",
      event.aggregateType,
      event.eventType,
    ),
    taskType: taskType as StoreSyncTaskCompletedPayload["taskType"],
    sourceInboundEventId: readRequiredString(
      payload,
      "sourceInboundEventId",
      event.aggregateType,
      event.eventType,
    ),
    sourceEventType: readRequiredString(
      payload,
      "sourceEventType",
      event.aggregateType,
      event.eventType,
    ),
    replacementEventId: readRequiredString(
      payload,
      "replacementEventId",
      event.aggregateType,
      event.eventType,
    ),
    replacementIdempotencyKey: readRequiredString(
      payload,
      "replacementIdempotencyKey",
      event.aggregateType,
      event.eventType,
    ),
    completedAt: readRequiredDate(
      payload,
      "completedAt",
      event.aggregateType,
      event.eventType,
    ).toISOString(),
    outcome: outcome as StoreSyncTaskCompletedPayload["outcome"],
    storeNote:
      readOptionalString(payload, "storeNote") ??
      (taskType === "REQUEST_UPSTREAM_RESEND"
        ? "Store operator acknowledged the resend task locally."
        : "Store operator acknowledged the enterprise inventory task locally."),
  };
}

async function resolveProductsByCode(
  tx: Prisma.TransactionClient | PrismaClient,
  retailOrgId: string,
  productCodes: string[],
) {
  const uniqueCodes = [
    ...new Set(productCodes.map((code) => code.trim()).filter(Boolean)),
  ];

  const products = await tx.product.findMany({
    where: {
      retailOrgId,
      OR: [
        {
          code: {
            in: uniqueCodes,
          },
        },
        {
          sku: {
            in: uniqueCodes,
          },
        },
      ],
    },
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      isSerialized: true,
      baseCostPrice: true,
    },
  });

  const productByCode = new Map<string, (typeof products)[number]>();

  for (const product of products) {
    productByCode.set(product.code, product);

    if (product.sku) {
      productByCode.set(product.sku, product);
    }
  }

  for (const code of uniqueCodes) {
    if (!productByCode.has(code)) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not resolve product "${code}" in the enterprise catalog yet.`,
        true,
      );
    }
  }

  return productByCode;
}

async function resolveInventoryLocation(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  inventoryLocationCode: string | null,
) {
  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (inventoryLocationCode) {
    const inventoryLocation = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: target.storeNode.retailOrgId,
        code: inventoryLocationCode,
        storeId: target.storeNode.store.id,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        warehouseId: true,
      },
    });

    if (!inventoryLocation) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not find inventory location "${inventoryLocationCode}" for "${target.storeNode.store.code}".`,
        true,
      );
    }

    return inventoryLocation;
  }

  const defaultInventoryLocation = await tx.inventoryLocation.findFirst({
    where: {
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      useForSalesDefault: true,
      status: RecordStatus.ACTIVE,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
    ],
    select: {
      id: true,
      code: true,
      warehouseId: true,
    },
  });

  if (!defaultInventoryLocation) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a default sales inventory location for "${target.storeNode.store.code}".`,
      true,
    );
  }

  return defaultInventoryLocation;
}

function buildGoodsReceiptNo(locationCode: string, now: Date) {
  const locationToken =
    locationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 10) || "LOC";
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 17);

  return `GRN-${locationToken}-${stamp}`;
}

function buildPurchaseOrderNo(locationCode: string, now: Date) {
  const locationToken =
    locationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 10) || "LOC";
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 17);

  return `PO-${locationToken}-${stamp}`;
}

function buildSupplierClaimNo(locationCode: string, now: Date) {
  const locationToken =
    locationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 10) || "LOC";
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 17);

  return `CLM-${locationToken}-${stamp}`;
}

function derivePurchaseOrderStatus(input: {
  currentStatus: PurchaseOrderStatus;
  closedAt: Date | null;
  committedAt: Date | null;
  lines: Array<{
    orderedQuantity: Prisma.Decimal | number;
    receivedQuantity: Prisma.Decimal | number;
    exceptionQuantity?: Prisma.Decimal | number;
  }>;
}) {
  if (input.closedAt) {
    return PurchaseOrderStatus.CLOSED;
  }

  if (!input.committedAt || input.currentStatus === PurchaseOrderStatus.DRAFT) {
    return PurchaseOrderStatus.DRAFT;
  }

  const orderedQuantity = input.lines.reduce(
    (sum, line) => sum + Number(line.orderedQuantity),
    0,
  );
  const receivedQuantity = input.lines.reduce(
    (sum, line) => sum + Number(line.receivedQuantity),
    0,
  );
  const exceptionQuantity = input.lines.reduce(
    (sum, line) => sum + Number(line.exceptionQuantity ?? 0),
    0,
  );

  if (receivedQuantity <= 0 && exceptionQuantity <= 0) {
    return PurchaseOrderStatus.COMMITTED;
  }

  if (
    receivedQuantity + exceptionQuantity + 0.0001 >= orderedQuantity &&
    exceptionQuantity <= 0.0001
  ) {
    return PurchaseOrderStatus.RECEIVED;
  }

  return PurchaseOrderStatus.PART_RECEIVED;
}

function toPurchaseOrderLifecycleResponseStatus(
  status: PurchaseOrderStatus,
): PurchaseOrderLifecycleResponse["status"] {
  switch (status) {
    case PurchaseOrderStatus.DRAFT:
      return "DRAFT";
    case PurchaseOrderStatus.COMMITTED:
      return "COMMITTED";
    case PurchaseOrderStatus.PART_RECEIVED:
      return "PART_RECEIVED";
    case PurchaseOrderStatus.RECEIVED:
      return "RECEIVED";
    case PurchaseOrderStatus.CLOSED:
    case PurchaseOrderStatus.CANCELLED:
      return "CLOSED";
    default:
      return "DRAFT";
  }
}

function buildInterStoreTransferNo(
  sourceLocationCode: string,
  destinationLocationCode: string,
  now: Date,
) {
  const sourceToken =
    sourceLocationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "SRC";
  const destinationToken =
    destinationLocationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "DST";
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 17);

  return `ITR-${sourceToken}-${destinationToken}-${stamp}`;
}

function buildInterStoreTransferBatchNo(
  sourceLocationCode: string,
  destinationLocationCode: string,
  now: Date,
) {
  const sourceToken =
    sourceLocationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "SRC";
  const destinationToken =
    destinationLocationCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "DST";
  const stamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 17);

  return `TRF-${sourceToken}-${destinationToken}-${stamp}`;
}

function deriveInterStoreTransferStatus(input: {
  currentStatus: InterStoreTransferStatus;
  closedAt: Date | null;
  requestedQuantity: Prisma.Decimal | number;
  issuedQuantity: Prisma.Decimal | number;
  receivedQuantity: Prisma.Decimal | number;
}) {
  if (input.closedAt) {
    return InterStoreTransferStatus.CLOSED;
  }

  if (input.currentStatus === InterStoreTransferStatus.CANCELLED) {
    return InterStoreTransferStatus.CANCELLED;
  }

  const requestedQuantity = Number(input.requestedQuantity);
  const issuedQuantity = Number(input.issuedQuantity);
  const receivedQuantity = Number(input.receivedQuantity);

  if (receivedQuantity > 0) {
    if (receivedQuantity + 0.0001 >= requestedQuantity) {
      return InterStoreTransferStatus.RECEIVED;
    }

    return InterStoreTransferStatus.PART_RECEIVED;
  }

  if (issuedQuantity > 0) {
    if (issuedQuantity + 0.0001 >= requestedQuantity) {
      return InterStoreTransferStatus.ISSUED;
    }

    return InterStoreTransferStatus.PART_ISSUED;
  }

  return InterStoreTransferStatus.REQUESTED;
}

function toInterStoreTransferLifecycleStatus(
  status: InterStoreTransferStatus,
): CreateInterStoreTransferResponse["status"] {
  switch (status) {
    case InterStoreTransferStatus.DRAFT:
      return "DRAFT";
    case InterStoreTransferStatus.REQUESTED:
      return "REQUESTED";
    case InterStoreTransferStatus.PART_ISSUED:
      return "PART_ISSUED";
    case InterStoreTransferStatus.ISSUED:
      return "ISSUED";
    case InterStoreTransferStatus.PART_RECEIVED:
      return "PART_RECEIVED";
    case InterStoreTransferStatus.RECEIVED:
      return "RECEIVED";
    case InterStoreTransferStatus.CLOSED:
    case InterStoreTransferStatus.CANCELLED:
      return "CLOSED";
    default:
      return "REQUESTED";
  }
}

function toOptionalStringArraySnapshot(
  value: Prisma.JsonValue | null | undefined,
) {
  return readJsonStringArray(value) ?? [];
}

async function getInventoryLocationOnHandQuantity(
  tx: Prisma.TransactionClient | PrismaClient,
  retailOrgId: string,
  inventoryLocationId: string,
  productId: string,
) {
  const aggregate = await tx.inventoryLedgerEntry.aggregate({
    where: {
      retailOrgId,
      inventoryLocationId,
      productId,
    },
    _sum: {
      quantity: true,
    },
  });

  return Number(Number(aggregate._sum.quantity ?? 0).toFixed(3));
}

async function findStoreExecutionNode(
  tx: Prisma.TransactionClient | PrismaClient,
  retailOrgId: string,
  storeId: string | null,
) {
  if (!storeId) {
    return null;
  }

  return tx.syncNode.findFirst({
    where: {
      retailOrgId,
      storeId,
      nodeType: SyncNodeType.STORE_DESKTOP,
      status: RecordStatus.ACTIVE,
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      terminal: {
        select: {
          code: true,
        },
      },
    },
  });
}

async function queueInventorySerialSnapshotPublication(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    storeId: string | null;
    productId: string;
    publishedAt?: Date;
  },
) {
  if (!input.storeId) {
    return null;
  }

  const storeId = input.storeId;
  const [product, enterpriseNode, targetStoreNode, store, serialUnits] =
    await runPrismaQueriesSequentially([
      () =>
        tx.product.findUnique({
          where: {
            id: input.productId,
          },
          select: {
            id: true,
            code: true,
            name: true,
            isSerialized: true,
            updatedAt: true,
          },
        }),
      () =>
        tx.syncNode.findFirst({
          where: {
            retailOrgId: input.retailOrgId,
            nodeType: SyncNodeType.ENTERPRISE,
            isPrimary: true,
            status: RecordStatus.ACTIVE,
          },
          select: {
            id: true,
            code: true,
          },
        }),
      () => findStoreExecutionNode(tx, input.retailOrgId, storeId),
      () =>
        tx.store.findUnique({
          where: {
            id: storeId,
          },
          select: {
            code: true,
          },
        }),
      () =>
        tx.inventorySerialUnit.findMany({
          where: {
            retailOrgId: input.retailOrgId,
            storeId,
            productId: input.productId,
          },
          orderBy: [{ serialNumber: "asc" }],
          select: {
            serialNumber: true,
            status: true,
            sourceReferenceType: true,
            sourceReferenceId: true,
            sourceReferenceLabel: true,
            updatedAt: true,
            inventoryLocation: {
              select: {
                code: true,
              },
            },
          },
        }),
    ]);

  if (!product?.isSerialized || !enterpriseNode || !targetStoreNode || !store) {
    return null;
  }

  const publishedAt = input.publishedAt ?? new Date();
  const serialSnapshotVersionStamp = Math.max(
    product.updatedAt.getTime(),
    publishedAt.getTime(),
    ...serialUnits.map((serialUnit) => serialUnit.updatedAt.getTime()),
  );
  const payload: EnterpriseInventorySerialSnapshotPublishedPayload = {
    storeCode: store.code,
    productCode: product.code,
    productName: product.name,
    availableQuantity: serialUnits.filter(
      (serialUnit) => serialUnit.status === SerialInventoryStatus.AVAILABLE,
    ).length,
    serialItems: serialUnits.map((serialUnit) => ({
      serialNumber: serialUnit.serialNumber,
      locationCode: serialUnit.inventoryLocation?.code ?? null,
      status:
        serialUnit.status as EnterpriseInventorySerialSnapshotPublishedPayload["serialItems"][number]["status"],
      sourceReferenceType: serialUnit.sourceReferenceType,
      sourceReferenceId: serialUnit.sourceReferenceId,
      sourceReferenceLabel: serialUnit.sourceReferenceLabel,
      updatedAt: serialUnit.updatedAt.toISOString(),
    })),
    publishedAt: publishedAt.toISOString(),
  };

  await tx.syncOutboxEvent.create({
    data: {
      id: randomUUID(),
      syncNodeId: enterpriseNode.id,
      targetNodeCode: targetStoreNode.code,
      aggregateType: "inventorySerialSnapshot",
      aggregateId: product.id,
      eventType: "inventory.serial-snapshot.published",
      idempotencyKey: `${enterpriseNode.code}:inventorySerialSnapshot:manual:${targetStoreNode.code}:${product.id}:${serialSnapshotVersionStamp}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    },
  });

  return {
    nodeCode: targetStoreNode.code,
  };
}

async function queueInventoryLedgerPublication(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    storeId: string | null;
    inventoryLocationId: string;
    productId: string;
    ledgerEntryId: string;
    movementType: InventoryMovementType;
    quantity: number;
    serialNumbers: string[];
    unitCost: number | null;
    referenceType: string;
    referenceId: string;
    externalReference: string | null;
    occurredAt: Date;
  },
) {
  if (!input.storeId) {
    return null;
  }

  const storeId = input.storeId;
  const [enterpriseNode, targetStoreNode, store, inventoryLocation, product] =
    await runPrismaQueriesSequentially([
      () =>
        tx.syncNode.findFirst({
          where: {
            retailOrgId: input.retailOrgId,
            nodeType: SyncNodeType.ENTERPRISE,
            isPrimary: true,
            status: RecordStatus.ACTIVE,
          },
          select: {
            id: true,
            code: true,
          },
        }),
      () => findStoreExecutionNode(tx, input.retailOrgId, storeId),
      () =>
        tx.store.findUnique({
          where: {
            id: storeId,
          },
          select: {
            code: true,
          },
        }),
      () =>
        tx.inventoryLocation.findUnique({
          where: {
            id: input.inventoryLocationId,
          },
          select: {
            code: true,
          },
        }),
      () =>
        tx.product.findUnique({
          where: {
            id: input.productId,
          },
          select: {
            code: true,
          },
        }),
    ]);

  if (
    !enterpriseNode ||
    !targetStoreNode?.terminal?.code ||
    !store?.code ||
    !inventoryLocation?.code ||
    !product?.code
  ) {
    return null;
  }

  const payload: StoreInventoryLedgerRecordedPayload = {
    ledgerEntryId: input.ledgerEntryId,
    storeCode: store.code,
    terminalCode: targetStoreNode.terminal.code,
    inventoryLocationCode: inventoryLocation.code,
    productCode: product.code,
    movementType: input.movementType as SyncInventoryMovementType,
    quantity: input.quantity,
    ...(input.serialNumbers.length > 0
      ? { serialNumbers: input.serialNumbers }
      : {}),
    unitCost: input.unitCost,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    externalReference: input.externalReference,
    occurredAt: input.occurredAt.toISOString(),
  };

  await tx.syncOutboxEvent.create({
    data: {
      id: randomUUID(),
      syncNodeId: enterpriseNode.id,
      targetNodeCode: targetStoreNode.code,
      aggregateType: "inventoryLedgerEntry",
      aggregateId: input.ledgerEntryId,
      eventType: "inventory.ledger.published",
      idempotencyKey: `${enterpriseNode.code}:inventoryLedgerEntry:manual:${targetStoreNode.code}:${input.ledgerEntryId}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    },
  });

  return {
    nodeCode: targetStoreNode.code,
  };
}

async function queuePurchaseOrderPublication(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    purchaseOrderId: string;
    publishedAt?: Date;
  },
) {
  const purchaseOrder = await tx.purchaseOrder.findUnique({
    where: {
      id: input.purchaseOrderId,
    },
    select: {
      id: true,
      retailOrgId: true,
      storeId: true,
      purchaseOrderNo: true,
      externalReference: true,
      status: true,
      note: true,
      operatorName: true,
      committedAt: true,
      closedAt: true,
      closureReason: true,
      closureNote: true,
      closureOperatorName: true,
      updatedAt: true,
      inventoryLocation: {
        select: {
          code: true,
          name: true,
          store: {
            select: {
              code: true,
            },
          },
        },
      },
      supplier: {
        select: {
          supplierNo: true,
          name: true,
        },
      },
      lines: {
        orderBy: {
          lineNo: "asc",
        },
        select: {
          id: true,
          lineNo: true,
          orderedQuantity: true,
          receivedQuantity: true,
          exceptionQuantity: true,
          unitCost: true,
          product: {
            select: {
              code: true,
              name: true,
              department: true,
              category: true,
              subcategory: true,
              isSerialized: true,
            },
          },
        },
      },
    },
  });

  if (
    !purchaseOrder ||
    !purchaseOrder.storeId ||
    !purchaseOrder.inventoryLocation.store?.code
  ) {
    return null;
  }

  if (
    purchaseOrder.status === PurchaseOrderStatus.DRAFT ||
    purchaseOrder.status === PurchaseOrderStatus.CANCELLED
  ) {
    return null;
  }

  const [enterpriseNode, targetStoreNode] = await runPrismaQueriesSequentially([
    () =>
      tx.syncNode.findFirst({
        where: {
          retailOrgId: purchaseOrder.retailOrgId,
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
        },
      }),
    () =>
      findStoreExecutionNode(
        tx,
        purchaseOrder.retailOrgId,
        purchaseOrder.storeId,
      ),
  ]);

  if (!enterpriseNode || !targetStoreNode) {
    return null;
  }

  const orderedQuantity = Number(
    purchaseOrder.lines
      .reduce((sum, line) => sum + Number(line.orderedQuantity), 0)
      .toFixed(3),
  );
  const receivedQuantity = Number(
    purchaseOrder.lines
      .reduce((sum, line) => sum + Number(line.receivedQuantity), 0)
      .toFixed(3),
  );
  const exceptionQuantity = Number(
    purchaseOrder.lines
      .reduce((sum, line) => sum + Number(line.exceptionQuantity), 0)
      .toFixed(3),
  );
  const outstandingQuantity = Number(
    Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity).toFixed(
      3,
    ),
  );
  const publishedAt = input.publishedAt ?? new Date();
  const payload: EnterprisePurchaseOrderPublishedPayload = {
    storeCode: purchaseOrder.inventoryLocation.store.code,
    purchaseOrderId: purchaseOrder.id,
    purchaseOrderNo: purchaseOrder.purchaseOrderNo,
    locationCode: purchaseOrder.inventoryLocation.code,
    locationName: purchaseOrder.inventoryLocation.name,
    supplierNo: purchaseOrder.supplier?.supplierNo ?? null,
    supplierName: purchaseOrder.supplier?.name ?? null,
    externalReference: purchaseOrder.externalReference,
    status: (
        purchaseOrder.status === PurchaseOrderStatus.RECEIVED ||
        purchaseOrder.status === PurchaseOrderStatus.CLOSED
          ? purchaseOrder.status
          : purchaseOrder.status === PurchaseOrderStatus.PART_RECEIVED
            ? "PART_RECEIVED"
            : "COMMITTED"
      ) as EnterprisePurchaseOrderPublishedPayload["status"],
    note: purchaseOrder.note,
    operatorName: purchaseOrder.operatorName,
    committedAt: purchaseOrder.committedAt?.toISOString() ?? null,
    closedAt: purchaseOrder.closedAt?.toISOString() ?? null,
    closureReason: purchaseOrder.closureReason as SyncPurchaseOrderClosureReason | null,
    closureNote: purchaseOrder.closureNote,
    closureOperatorName: purchaseOrder.closureOperatorName,
    orderedQuantity,
    receivedQuantity,
    exceptionQuantity,
    outstandingQuantity,
    lines: purchaseOrder.lines.map((line) => {
      const lineOrderedQuantity = Number(
        Number(line.orderedQuantity).toFixed(3),
      );
      const lineReceivedQuantity = Number(
        Number(line.receivedQuantity).toFixed(3),
      );
      const lineExceptionQuantity = Number(
        Number(line.exceptionQuantity).toFixed(3),
      );

      return {
        purchaseOrderLineId: line.id,
        lineNo: line.lineNo,
        productCode: line.product.code,
        productName: line.product.name,
        departmentCode: line.product.department,
        departmentName: line.product.department,
        categoryCode: line.product.category,
        categoryName: line.product.category,
        subcategory: line.product.subcategory,
        isSerialized: line.product.isSerialized,
        orderedQuantity: lineOrderedQuantity,
        receivedQuantity: lineReceivedQuantity,
        exceptionQuantity: lineExceptionQuantity,
        outstandingQuantity: Number(
          Math.max(
            0,
            lineOrderedQuantity - lineReceivedQuantity - lineExceptionQuantity,
          ).toFixed(3),
        ),
        unitCost: line.unitCost === null ? null : Number(line.unitCost),
      };
    }),
    publishedAt: publishedAt.toISOString(),
  };

  await tx.syncOutboxEvent.create({
    data: {
      id: randomUUID(),
      syncNodeId: enterpriseNode.id,
      targetNodeCode: targetStoreNode.code,
      aggregateType: "purchaseOrder",
      aggregateId: purchaseOrder.id,
      eventType: "purchase-order.published",
      idempotencyKey: `${enterpriseNode.code}:purchaseOrder:${targetStoreNode.code}:${purchaseOrder.id}:${purchaseOrder.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    },
  });

  return {
    nodeCode: targetStoreNode.code,
  };
}

async function queueSupplierReturnPublication(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    supplierReturnId: string;
    publishedAt?: Date;
  },
) {
  const supplierReturn = await tx.supplierReturn.findUnique({
    where: {
      id: input.supplierReturnId,
    },
    select: {
      id: true,
      retailOrgId: true,
      storeId: true,
      supplierReturnNo: true,
      externalReference: true,
      reason: true,
      status: true,
      note: true,
      operatorName: true,
      returnedAt: true,
      postedAt: true,
      cancelledAt: true,
      cancellationNote: true,
      cancellationOperatorName: true,
      cancellationAcknowledgedAt: true,
      cancellationAcknowledgedByNodeCode: true,
      cancellationAcknowledgedBy: true,
      cancellationAcknowledgementNote: true,
      updatedAt: true,
      inventoryLocation: {
        select: {
          code: true,
          name: true,
          store: {
            select: {
              code: true,
            },
          },
        },
      },
      purchaseOrder: {
        select: {
          id: true,
          purchaseOrderNo: true,
        },
      },
      goodsReceipt: {
        select: {
          id: true,
          receiptNo: true,
        },
      },
      supplier: {
        select: {
          supplierNo: true,
          name: true,
        },
      },
      lines: {
        orderBy: {
          lineNo: "asc",
        },
        select: {
          id: true,
          lineNo: true,
          quantity: true,
          unitCost: true,
          serialNumbersSnapshot: true,
          product: {
            select: {
              code: true,
              name: true,
            },
          },
          goodsReceiptLine: {
            select: {
              id: true,
              purchaseOrderLineId: true,
            },
          },
        },
      },
    },
  });

  if (
    !supplierReturn ||
    !supplierReturn.storeId ||
    !supplierReturn.inventoryLocation.store?.code ||
    !supplierReturn.goodsReceipt?.id ||
    !supplierReturn.goodsReceipt.receiptNo
  ) {
    return null;
  }

  const [enterpriseNode, targetStoreNode] = await runPrismaQueriesSequentially([
    () =>
      tx.syncNode.findFirst({
        where: {
          retailOrgId: supplierReturn.retailOrgId,
          nodeType: SyncNodeType.ENTERPRISE,
          isPrimary: true,
          status: RecordStatus.ACTIVE,
        },
        select: {
          id: true,
          code: true,
        },
      }),
    () =>
      findStoreExecutionNode(
        tx,
        supplierReturn.retailOrgId,
        supplierReturn.storeId,
      ),
  ]);

  if (!enterpriseNode || !targetStoreNode) {
    return null;
  }

  const publishedAt = input.publishedAt ?? new Date();
  const totalQuantity = Number(
    supplierReturn.lines
      .reduce((sum, line) => sum + Number(line.quantity), 0)
      .toFixed(3),
  );
  const payload: EnterpriseSupplierReturnPublishedPayload = {
    storeCode: supplierReturn.inventoryLocation.store.code,
    supplierReturnId: supplierReturn.id,
    supplierReturnNo: supplierReturn.supplierReturnNo,
    purchaseOrderId: supplierReturn.purchaseOrder?.id ?? null,
    purchaseOrderNo: supplierReturn.purchaseOrder?.purchaseOrderNo ?? null,
    goodsReceiptId: supplierReturn.goodsReceipt.id,
    goodsReceiptNo: supplierReturn.goodsReceipt.receiptNo,
    inventoryLocationCode: supplierReturn.inventoryLocation.code,
    inventoryLocationName: supplierReturn.inventoryLocation.name,
    supplierNo: supplierReturn.supplier.supplierNo,
    supplierName: supplierReturn.supplier.name,
    externalReference: supplierReturn.externalReference,
    reason: supplierReturn.reason as EnterpriseSupplierReturnPublishedPayload["reason"],
    status: supplierReturn.status as EnterpriseSupplierReturnPublishedPayload["status"],
    note: supplierReturn.note,
    operatorName: supplierReturn.operatorName ?? "Flash ERP operator",
    totalQuantity,
    returnedAt: supplierReturn.returnedAt.toISOString(),
    postedAt: supplierReturn.postedAt.toISOString(),
    cancelledAt: supplierReturn.cancelledAt?.toISOString() ?? null,
    cancellationNote: supplierReturn.cancellationNote,
    cancellationOperatorName: supplierReturn.cancellationOperatorName,
    cancellationAcknowledgedAt:
      supplierReturn.cancellationAcknowledgedAt?.toISOString() ?? null,
    cancellationAcknowledgedByNodeCode:
      supplierReturn.cancellationAcknowledgedByNodeCode,
    cancellationAcknowledgedBy: supplierReturn.cancellationAcknowledgedBy,
    cancellationAcknowledgementNote:
      supplierReturn.cancellationAcknowledgementNote,
    lines: supplierReturn.lines.map((line) => ({
      supplierReturnLineId: line.id,
      goodsReceiptLineId: line.goodsReceiptLine?.id ?? null,
      purchaseOrderLineId: line.goodsReceiptLine?.purchaseOrderLineId ?? null,
      lineNo: line.lineNo,
      productCode: line.product.code,
      productName: line.product.name,
      quantity: Number(Number(line.quantity).toFixed(3)),
      unitCost: line.unitCost === null ? null : Number(line.unitCost),
      serialNumbers: toOptionalStringArraySnapshot(line.serialNumbersSnapshot),
    })),
    publishedAt: publishedAt.toISOString(),
  };

  await tx.syncOutboxEvent.create({
    data: {
      id: randomUUID(),
      syncNodeId: enterpriseNode.id,
      targetNodeCode: targetStoreNode.code,
      aggregateType: "supplierReturn",
      aggregateId: supplierReturn.id,
      eventType: "supplier-return.published",
      idempotencyKey: `${enterpriseNode.code}:supplierReturn:${targetStoreNode.code}:${supplierReturn.id}:${supplierReturn.updatedAt.getTime()}`,
      payload: serializeRequiredJsonField(payload),
      status: SyncEventStatus.PENDING,
    },
  });

  return {
    nodeCode: targetStoreNode.code,
  };
}

export async function queueInterStoreTransferPublication(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    transferId: string;
    publishedAt?: Date;
  },
) {
  const transfer = await tx.interStoreTransfer.findUnique({
    where: {
      id: input.transferId,
    },
    select: {
      id: true,
      retailOrgId: true,
      sourceStoreId: true,
      destinationStoreId: true,
      transferNo: true,
      transferBatchNo: true,
      lineNo: true,
      externalReference: true,
      transporterName: true,
      vehicleRegistrationNo: true,
      driverName: true,
      driverContact: true,
      deliveryNoteNo: true,
      origin: true,
      status: true,
      requestedQuantity: true,
      issuedQuantity: true,
      receivedQuantity: true,
      unitCost: true,
      issuedSerialNumbersSnapshot: true,
      receivedSerialNumbersSnapshot: true,
      requestNote: true,
      issueNote: true,
      receiptNote: true,
      requestOperatorName: true,
      issueOperatorName: true,
      receiptOperatorName: true,
      requestedByNodeCode: true,
      sourceNodeCode: true,
      destinationNodeCode: true,
      requestedAt: true,
      requiredAt: true,
      issuedAt: true,
      receivedAt: true,
      closedAt: true,
      updatedAt: true,
      sourceStore: {
        select: {
          code: true,
          name: true,
        },
      },
      destinationStore: {
        select: {
          code: true,
          name: true,
        },
      },
      sourceInventoryLocation: {
        select: {
          code: true,
          name: true,
        },
      },
      destinationInventoryLocation: {
        select: {
          code: true,
          name: true,
        },
      },
      product: {
        select: {
          code: true,
          name: true,
          department: true,
          category: true,
          subcategory: true,
          isSerialized: true,
        },
      },
    },
  });

  if (!transfer || transfer.status === InterStoreTransferStatus.CANCELLED) {
    return null;
  }

  const [enterpriseNode, sourceNode, destinationNode] =
    await runPrismaQueriesSequentially([
      () =>
        tx.syncNode.findFirst({
          where: {
            retailOrgId: transfer.retailOrgId,
            nodeType: SyncNodeType.ENTERPRISE,
            isPrimary: true,
            status: RecordStatus.ACTIVE,
          },
          select: {
            id: true,
            code: true,
          },
        }),
      () =>
        findStoreExecutionNode(
          tx,
          transfer.retailOrgId,
          transfer.sourceStoreId,
        ),
      () =>
        findStoreExecutionNode(
          tx,
          transfer.retailOrgId,
          transfer.destinationStoreId,
        ),
    ]);

  if (!enterpriseNode || (!sourceNode && !destinationNode)) {
    return null;
  }

  const requestedQuantity = Number(
    Number(transfer.requestedQuantity).toFixed(3),
  );
  const issuedQuantity = Number(Number(transfer.issuedQuantity).toFixed(3));
  const receivedQuantity = Number(Number(transfer.receivedQuantity).toFixed(3));
  const issuedSerialNumbers = toOptionalStringArraySnapshot(
    transfer.issuedSerialNumbersSnapshot,
  );
  const receivedSerialNumbers = toOptionalStringArraySnapshot(
    transfer.receivedSerialNumbersSnapshot,
  );
  const publishedAt = input.publishedAt ?? new Date();
  const publishToNode = async (
    targetNodeCode: string,
    storeCode: string,
    role: EnterpriseInterStoreTransferPublishedPayload["role"],
  ) => {
    const payload: EnterpriseInterStoreTransferPublishedPayload = {
      storeCode,
      role,
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      transferBatchNo: transfer.transferBatchNo,
      lineNo: transfer.lineNo,
      origin: transfer.origin as EnterpriseInterStoreTransferPublishedPayload["origin"],
      status: toInterStoreTransferLifecycleStatus(transfer.status),
      externalReference: transfer.externalReference,
      transporterName: transfer.transporterName,
      vehicleRegistrationNo: transfer.vehicleRegistrationNo,
      driverName: transfer.driverName,
      driverContact: transfer.driverContact,
      deliveryNoteNo: transfer.deliveryNoteNo,
      sourceStoreCode: transfer.sourceStore.code,
      sourceStoreName: transfer.sourceStore.name,
      sourceLocationCode: transfer.sourceInventoryLocation.code,
      sourceLocationName: transfer.sourceInventoryLocation.name,
      destinationStoreCode: transfer.destinationStore.code,
      destinationStoreName: transfer.destinationStore.name,
      destinationLocationCode: transfer.destinationInventoryLocation.code,
      destinationLocationName: transfer.destinationInventoryLocation.name,
      productCode: transfer.product.code,
      productName: transfer.product.name,
      departmentCode: transfer.product.department,
      departmentName: transfer.product.department,
      categoryCode: transfer.product.category,
      categoryName: transfer.product.category,
      subcategory: transfer.product.subcategory,
      isSerialized: transfer.product.isSerialized,
      requestedQuantity,
      issuedQuantity,
      receivedQuantity,
      outstandingIssueQuantity: Number(
        Math.max(0, requestedQuantity - issuedQuantity).toFixed(3),
      ),
      outstandingReceiptQuantity: Number(
        Math.max(0, issuedQuantity - receivedQuantity).toFixed(3),
      ),
      unitCost: transfer.unitCost === null ? null : Number(transfer.unitCost),
      issuedSerialNumbers,
      receivedSerialNumbers,
      requestNote: transfer.requestNote,
      issueNote: transfer.issueNote,
      receiptNote: transfer.receiptNote,
      requestOperatorName: transfer.requestOperatorName,
      issueOperatorName: transfer.issueOperatorName,
      receiptOperatorName: transfer.receiptOperatorName,
      requestedByNodeCode: transfer.requestedByNodeCode,
      sourceNodeCode: transfer.sourceNodeCode,
      destinationNodeCode: transfer.destinationNodeCode,
      requestedAt: transfer.requestedAt.toISOString(),
      requiredAt: transfer.requiredAt?.toISOString() ?? null,
      issuedAt: transfer.issuedAt?.toISOString() ?? null,
      receivedAt: transfer.receivedAt?.toISOString() ?? null,
      closedAt: transfer.closedAt?.toISOString() ?? null,
      publishedAt: publishedAt.toISOString(),
    };

    await tx.syncOutboxEvent.create({
      data: {
        id: randomUUID(),
        syncNodeId: enterpriseNode.id,
        targetNodeCode,
        aggregateType: "interStoreTransfer",
        aggregateId: transfer.id,
        eventType: "inter-store-transfer.published",
        idempotencyKey: `${enterpriseNode.code}:interStoreTransfer:${targetNodeCode}:${transfer.id}:${transfer.updatedAt.getTime()}`,
        payload: serializeRequiredJsonField(payload),
        status: SyncEventStatus.PENDING,
      },
    });
  };

  if (sourceNode) {
    await publishToNode(sourceNode.code, transfer.sourceStore.code, "SOURCE");
  }

  if (destinationNode && destinationNode.code !== sourceNode?.code) {
    await publishToNode(
      destinationNode.code,
      transfer.destinationStore.code,
      "DESTINATION",
    );
  }

  return {
    sourceNodeCode: sourceNode?.code ?? null,
    destinationNodeCode: destinationNode?.code ?? null,
  };
}

async function upsertEnterpriseSerialUnit(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    storeId: string | null;
    warehouseId: string | null;
    inventoryLocationId: string | null;
    productId: string;
    serialNumber: string;
    status: SerialInventoryStatus;
    sourceReferenceType: string | null;
    sourceReferenceId: string | null;
    sourceReferenceLabel: string | null;
    sourceNodeCode: string | null;
    occurredAt: Date;
  },
) {
  await tx.inventorySerialUnit.upsert({
    where: {
      retailOrgId_productId_serialNumber: {
        retailOrgId: input.retailOrgId,
        productId: input.productId,
        serialNumber: input.serialNumber,
      },
    },
    update: {
      storeId: input.storeId,
      warehouseId: input.warehouseId,
      inventoryLocationId: input.inventoryLocationId,
      status: input.status,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceReferenceLabel: input.sourceReferenceLabel,
      sourceNodeCode: input.sourceNodeCode,
      lastOccurredAt: input.occurredAt,
    },
    create: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      warehouseId: input.warehouseId,
      inventoryLocationId: input.inventoryLocationId,
      productId: input.productId,
      serialNumber: input.serialNumber,
      status: input.status,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceReferenceLabel: input.sourceReferenceLabel,
      sourceNodeCode: input.sourceNodeCode,
      lastOccurredAt: input.occurredAt,
    },
  });
}

async function applyEnterpriseSerializedLedgerMovement(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    storeId: string | null;
    warehouseId: string | null;
    inventoryLocationId: string;
    productId: string;
    movementType: InventoryMovementType;
    serialNumbers: string[];
    sourceReferenceType: string;
    sourceReferenceId: string;
    sourceReferenceLabel: string | null;
    sourceNodeCode: string | null;
    occurredAt: Date;
  },
) {
  const serialNumbers = normalizeSerialNumbers(input.serialNumbers);

  if (serialNumbers.length === 0) {
    return;
  }

  if (input.movementType === InventoryMovementType.COUNT_VARIANCE) {
    const existingAvailableRows = await tx.inventorySerialUnit.findMany({
      where: {
        retailOrgId: input.retailOrgId,
        productId: input.productId,
        inventoryLocationId: input.inventoryLocationId,
        status: SerialInventoryStatus.AVAILABLE,
      },
      select: {
        serialNumber: true,
      },
    });
    const countedKeys = new Set(
      serialNumbers.map((serialNumber) => serialNumber.toUpperCase()),
    );
    const serialNumbersToAdjustOut = existingAvailableRows
      .map((row) => row.serialNumber)
      .filter((serialNumber) => !countedKeys.has(serialNumber.toUpperCase()));

    if (serialNumbersToAdjustOut.length > 0) {
      await tx.inventorySerialUnit.updateMany({
        where: {
          retailOrgId: input.retailOrgId,
          productId: input.productId,
          inventoryLocationId: input.inventoryLocationId,
          serialNumber: {
            in: serialNumbersToAdjustOut,
          },
        },
        data: {
          status: SerialInventoryStatus.ADJUSTED_OUT,
          sourceReferenceType: input.sourceReferenceType,
          sourceReferenceId: input.sourceReferenceId,
          sourceReferenceLabel: input.sourceReferenceLabel,
          sourceNodeCode: input.sourceNodeCode,
          lastOccurredAt: input.occurredAt,
        },
      });
    }

    for (const serialNumber of serialNumbers) {
      await upsertEnterpriseSerialUnit(tx, {
        retailOrgId: input.retailOrgId,
        storeId: input.storeId,
        warehouseId: input.warehouseId,
        inventoryLocationId: input.inventoryLocationId,
        productId: input.productId,
        serialNumber,
        status: SerialInventoryStatus.AVAILABLE,
        sourceReferenceType: input.sourceReferenceType,
        sourceReferenceId: input.sourceReferenceId,
        sourceReferenceLabel: input.sourceReferenceLabel,
        sourceNodeCode: input.sourceNodeCode,
        occurredAt: input.occurredAt,
      });
    }

    return;
  }

  const nextStatus =
    input.movementType === InventoryMovementType.SALE
      ? SerialInventoryStatus.SOLD
      : input.movementType === InventoryMovementType.ADJUSTMENT_NEGATIVE ||
          input.movementType === InventoryMovementType.RETURN_TO_VENDOR
        ? SerialInventoryStatus.ADJUSTED_OUT
        : SerialInventoryStatus.AVAILABLE;

  for (const serialNumber of serialNumbers) {
    await upsertEnterpriseSerialUnit(tx, {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      warehouseId: input.warehouseId,
      inventoryLocationId: input.inventoryLocationId,
      productId: input.productId,
      serialNumber,
      status: nextStatus,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceReferenceLabel: input.sourceReferenceLabel,
      sourceNodeCode: input.sourceNodeCode,
      occurredAt: input.occurredAt,
    });
  }
}

async function applyEnterpriseSerializedTransfer(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    storeId: string | null;
    warehouseId: string | null;
    destinationInventoryLocationId: string;
    productId: string;
    serialNumbers: string[];
    sourceReferenceType: string;
    sourceReferenceId: string;
    sourceReferenceLabel: string | null;
    sourceNodeCode: string | null;
    occurredAt: Date;
  },
) {
  for (const serialNumber of normalizeSerialNumbers(input.serialNumbers)) {
    await upsertEnterpriseSerialUnit(tx, {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      warehouseId: input.warehouseId,
      inventoryLocationId: input.destinationInventoryLocationId,
      productId: input.productId,
      serialNumber,
      status: SerialInventoryStatus.AVAILABLE,
      sourceReferenceType: input.sourceReferenceType,
      sourceReferenceId: input.sourceReferenceId,
      sourceReferenceLabel: input.sourceReferenceLabel,
      sourceNodeCode: input.sourceNodeCode,
      occurredAt: input.occurredAt,
    });
  }
}

async function resolveEnterpriseCustomerForPosTransaction(
  tx: Prisma.TransactionClient | PrismaClient,
  retailOrgId: string,
  payload: StorePosTransactionCompletedPayload,
): Promise<CustomerAccountPostingCustomer | null> {
  if (!payload.customerId && !payload.customerNo) {
    return null;
  }

  const customerById = payload.customerId
    ? await tx.customer.findFirst({
        where: {
          retailOrgId,
          id: payload.customerId,
          deletedAt: null,
        },
        select: {
          id: true,
          customerNo: true,
          fullName: true,
          status: true,
          loyaltyEnrolled: true,
          loyaltyPointsBalance: true,
          allowCreditSales: true,
          creditLimitAmount: true,
          receivableBalanceAmount: true,
        },
      })
    : null;

  if (customerById) {
    if (payload.customerNo && customerById.customerNo !== payload.customerNo) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `POS transaction "${payload.transactionNo}" referenced a customer id that does not match customer number "${payload.customerNo}".`,
        false,
      );
    }

    return {
      customerId: customerById.id,
      customerNo: customerById.customerNo,
      fullName: customerById.fullName,
      status: customerById.status,
      loyaltyEnrolled: customerById.loyaltyEnrolled,
      loyaltyPointsBalance: customerById.loyaltyPointsBalance,
      allowCreditSales: customerById.allowCreditSales,
      creditLimitAmount:
        customerById.creditLimitAmount === null
          ? null
          : Number(customerById.creditLimitAmount),
      receivableBalanceAmount: Number(customerById.receivableBalanceAmount),
    };
  }

  if (!payload.customerNo) {
    return null;
  }

  const customerByNo = await tx.customer.findFirst({
    where: {
      retailOrgId,
      customerNo: payload.customerNo,
      deletedAt: null,
    },
    select: {
      id: true,
      customerNo: true,
      fullName: true,
      status: true,
      loyaltyEnrolled: true,
      loyaltyPointsBalance: true,
      allowCreditSales: true,
      creditLimitAmount: true,
      receivableBalanceAmount: true,
    },
  });

  if (!customerByNo) {
    return null;
  }

  return {
    customerId: customerByNo.id,
    customerNo: customerByNo.customerNo,
    fullName: customerByNo.fullName,
    status: customerByNo.status,
    loyaltyEnrolled: customerByNo.loyaltyEnrolled,
    loyaltyPointsBalance: customerByNo.loyaltyPointsBalance,
    allowCreditSales: customerByNo.allowCreditSales,
    creditLimitAmount:
      customerByNo.creditLimitAmount === null
        ? null
        : Number(customerByNo.creditLimitAmount),
    receivableBalanceAmount: Number(customerByNo.receivableBalanceAmount),
  };
}

async function resolveEnterpriseCustomerByIdentity(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    customerId: string;
    customerNo: string;
    sourceLabel: string;
  },
): Promise<CustomerAccountPostingCustomer> {
  const customerById = await tx.customer.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      id: input.customerId,
      deletedAt: null,
    },
    select: {
      id: true,
      customerNo: true,
      fullName: true,
      status: true,
      loyaltyEnrolled: true,
      loyaltyPointsBalance: true,
      allowCreditSales: true,
      creditLimitAmount: true,
      receivableBalanceAmount: true,
    },
  });

  if (!customerById) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve customer "${input.customerNo}" for ${input.sourceLabel}.`,
      true,
    );
  }

  if (customerById.customerNo !== input.customerNo) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `${input.sourceLabel} referenced a customer id that does not match customer number "${input.customerNo}".`,
      false,
    );
  }

  return {
    customerId: customerById.id,
    customerNo: customerById.customerNo,
    fullName: customerById.fullName,
    status: customerById.status,
    loyaltyEnrolled: customerById.loyaltyEnrolled,
    loyaltyPointsBalance: customerById.loyaltyPointsBalance,
    allowCreditSales: customerById.allowCreditSales,
    creditLimitAmount:
      customerById.creditLimitAmount === null
        ? null
        : Number(customerById.creditLimitAmount),
    receivableBalanceAmount: Number(customerById.receivableBalanceAmount),
  };
}

async function resolveEnterpriseCustomerForSalesOrder(
  tx: Prisma.TransactionClient | PrismaClient,
  retailOrgId: string,
  payload: StoreSalesOrderRecordedPayload,
) {
  if (!payload.customerId && !payload.customerNo) {
    return null;
  }

  const customerById = payload.customerId
    ? await tx.customer.findFirst({
        where: {
          retailOrgId,
          id: payload.customerId,
          deletedAt: null,
        },
        select: {
          id: true,
          customerNo: true,
          fullName: true,
        },
      })
    : null;

  if (customerById) {
    if (payload.customerNo && customerById.customerNo !== payload.customerNo) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Sales order "${payload.orderNo}" referenced a customer id that does not match customer number "${payload.customerNo}".`,
        false,
      );
    }

    return customerById;
  }

  if (!payload.customerNo) {
    return null;
  }

  return tx.customer.findFirst({
    where: {
      retailOrgId,
      customerNo: payload.customerNo,
      deletedAt: null,
    },
    select: {
      id: true,
      customerNo: true,
      fullName: true,
    },
  });
}

async function resolveEnterpriseLoyaltyPolicy(
  tx: Prisma.TransactionClient | PrismaClient,
  retailOrgId: string,
): Promise<LoyaltyPolicy> {
  const retailOrg = await tx.retailOrg.findUnique({
    where: {
      id: retailOrgId,
    },
    select: {
      loyaltyProgramEnabled: true,
      loyaltyPointsPerCurrencyUnit: true,
      loyaltyRedemptionEnabled: true,
      loyaltyRedemptionPointsStep: true,
      loyaltyRedemptionValueAmount: true,
      loyaltyMinimumRedeemPoints: true,
      loyaltyMaximumRedeemPercentOfSale: true,
    },
  });

  if (!retailOrg) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve retail org "${retailOrgId}" for loyalty policy.`,
      true,
    );
  }

  return normalizeLoyaltyPolicy({
    loyaltyProgramEnabled: retailOrg.loyaltyProgramEnabled,
    loyaltyPointsPerCurrencyUnit: Number(
      retailOrg.loyaltyPointsPerCurrencyUnit,
    ),
    loyaltyRedemptionEnabled: retailOrg.loyaltyRedemptionEnabled,
    loyaltyRedemptionPointsStep: retailOrg.loyaltyRedemptionPointsStep,
    loyaltyRedemptionValueAmount: Number(
      retailOrg.loyaltyRedemptionValueAmount,
    ),
    loyaltyMinimumRedeemPoints: retailOrg.loyaltyMinimumRedeemPoints,
    loyaltyMaximumRedeemPercentOfSale: Number(
      retailOrg.loyaltyMaximumRedeemPercentOfSale,
    ),
  });
}

async function applyEnterpriseCustomerAccountPostingForPosTransaction(
  tx: Prisma.TransactionClient | PrismaClient,
  input: {
    retailOrgId: string;
    storeId: string;
    terminalId: string;
    originNodeCode: string;
    transactionId: string;
    transactionNo: string;
    sourceTransactionNo: string | null;
    completedAt: Date;
    customer: CustomerAccountPostingCustomer | null;
    loyaltyPolicy: LoyaltyPolicy;
    payload: StorePosTransactionCompletedPayload;
  },
) {
  if (!input.customer) {
    if (
      input.payload.payments.some(
        (payment) => payment.method === "STORE_CREDIT",
      )
    ) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `POS transaction "${input.transactionNo}" used Store Credit without a resolvable enterprise customer.`,
        false,
      );
    }

    return;
  }

  let postingEffect;

  try {
    postingEffect = deriveCustomerAccountPostingEffect({
      customer: input.customer,
      transactionType: input.payload.transactionType,
      totalAmount: input.payload.totalAmount,
      loyaltyPolicy: input.loyaltyPolicy,
      loyaltyPointsRedeemed: input.payload.loyaltyPointsRedeemed,
      loyaltyRedemptionAmount: input.payload.loyaltyRedemptionAmount,
      payments: input.payload.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
      })),
    });
  } catch (error) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      error instanceof Error
        ? error.message
        : "Flash ERP rejected the customer account posting.",
      false,
    );
  }

  if (
    postingEffect.receivableDeltaAmount === 0 &&
    postingEffect.loyaltyPointsDelta === 0
  ) {
    return;
  }

  const resultingReceivableBalance =
    postingEffect.nextReceivableBalanceAmount ??
    input.customer.receivableBalanceAmount;
  const resultingLoyaltyPointsBalance =
    postingEffect.nextLoyaltyPointsBalance ??
    input.customer.loyaltyPointsBalance;

  await tx.customer.update({
    where: {
      id: input.customer.customerId,
    },
    data: {
      receivableBalanceAmount: toMoneyString(resultingReceivableBalance),
      loyaltyPointsBalance: toWholeNumber(resultingLoyaltyPointsBalance),
      lastModifiedByNodeCode: input.originNodeCode,
    },
  });

  const entries: Prisma.CustomerAccountEntryCreateManyInput[] = [];

  if (postingEffect.receivableDeltaAmount !== 0) {
    entries.push({
      id: randomUUID(),
      retailOrgId: input.retailOrgId,
      customerId: input.customer.customerId,
      storeId: input.storeId,
      terminalId: input.terminalId,
      posTransactionId: input.transactionId,
      entryType:
        postingEffect.receivableDeltaAmount > 0
          ? "POS_RECEIVABLE_CHARGE"
          : "POS_RECEIVABLE_SETTLEMENT",
      transactionNoSnapshot: input.transactionNo,
      sourceTransactionNoSnapshot: input.sourceTransactionNo,
      receivableDeltaAmount: toMoneyString(postingEffect.receivableDeltaAmount),
      loyaltyPointsDelta: 0,
      resultingReceivableBalance: toMoneyString(resultingReceivableBalance),
      resultingLoyaltyPointsBalance: toWholeNumber(
        resultingLoyaltyPointsBalance,
      ),
      note:
        postingEffect.receivableDeltaAmount > 0
          ? `POS transaction ${input.transactionNo} increased customer receivables through Store Credit tender.`
          : `POS transaction ${input.transactionNo} reduced customer receivables through Store Credit tender.`,
      originNodeCode: input.originNodeCode,
      occurredAt: input.completedAt,
    });
  }

  if (postingEffect.loyaltyPointsDelta !== 0) {
    entries.push({
      id: randomUUID(),
      retailOrgId: input.retailOrgId,
      customerId: input.customer.customerId,
      storeId: input.storeId,
      terminalId: input.terminalId,
      posTransactionId: input.transactionId,
      entryType:
        postingEffect.loyaltyPointsDelta > 0
          ? "POS_LOYALTY_ACCRUAL"
          : "POS_LOYALTY_REVERSAL",
      transactionNoSnapshot: input.transactionNo,
      sourceTransactionNoSnapshot: input.sourceTransactionNo,
      receivableDeltaAmount: toMoneyString(0),
      loyaltyPointsDelta: postingEffect.loyaltyPointsDelta,
      resultingReceivableBalance: toMoneyString(resultingReceivableBalance),
      resultingLoyaltyPointsBalance: toWholeNumber(
        resultingLoyaltyPointsBalance,
      ),
      note:
        postingEffect.loyaltyPointsDelta > 0
          ? postingEffect.loyaltyPointsRedeemed > 0
            ? `POS transaction ${input.transactionNo} redeemed ${postingEffect.loyaltyPointsRedeemed} point(s) and then accrued loyalty points on the net sale.`
            : `POS transaction ${input.transactionNo} accrued loyalty points.`
          : postingEffect.loyaltyPointsRedeemed > 0
            ? `POS transaction ${input.transactionNo} redeemed ${postingEffect.loyaltyPointsRedeemed} point(s) and finished with a net loyalty reduction.`
            : `POS transaction ${input.transactionNo} reversed loyalty points.`,
      originNodeCode: input.originNodeCode,
      occurredAt: input.completedAt,
    });
  }

  if (entries.length > 0) {
    await tx.customerAccountEntry.createMany({
      data: entries,
    });
  }
}

async function projectStoreCustomerAccountEntry(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreCustomerAccountEntryRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (payload.entryId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Customer account entry "${payload.entryNo}" did not match the envelope aggregate id.`,
      false,
    );
  }

  if (payload.entryType !== "ACCOUNT_PAYMENT") {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP does not support customer account entry type "${payload.entryType}" from store nodes.`,
      false,
    );
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Customer account entry "${payload.entryNo}" requires an amount greater than zero.`,
      false,
    );
  }

  if (payload.paymentMethod === PaymentMethod.STORE_CREDIT) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Customer account entry "${payload.entryNo}" cannot use Store Credit as a settlement method.`,
      false,
    );
  }

  const customer = await resolveEnterpriseCustomerByIdentity(tx, {
    retailOrgId: target.storeNode.retailOrgId,
    customerId: payload.customerId,
    customerNo: payload.customerNo,
    sourceLabel: `customer account entry "${payload.entryNo}"`,
  });

  const nextReceivableBalance = Number(
    (customer.receivableBalanceAmount - payload.amount).toFixed(2),
  );

  if (nextReceivableBalance < 0) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Flash ERP cannot collect more than ${customer.fullName}'s outstanding receivable balance for ${payload.entryNo}.`,
      false,
    );
  }

  await tx.customer.update({
    where: {
      id: customer.customerId,
    },
    data: {
      receivableBalanceAmount: toMoneyString(nextReceivableBalance),
      lastModifiedByNodeCode: target.storeNode.code,
    },
  });

  const noteParts = [
    `Collected locally from ${payload.storeCode}/${payload.terminalCode}.`,
    payload.shiftNo ? `Shift ${payload.shiftNo}.` : null,
    payload.cashierCode ? `Cashier ${payload.cashierCode}.` : null,
    payload.tenderMethodName
      ? `Tender ${payload.tenderMethodName} (${payload.paymentMethod}).`
      : `Method ${payload.paymentMethod}.`,
    payload.reference ? `Reference ${payload.reference}.` : null,
    payload.note ? payload.note : null,
  ].filter((value): value is string => Boolean(value));

  await tx.customerAccountEntry.create({
    data: {
      id: payload.entryId,
      retailOrgId: target.storeNode.retailOrgId,
      customerId: customer.customerId,
      storeId: target.storeNode.store?.id ?? null,
      terminalId: target.storeNode.terminal?.id ?? null,
      posTransactionId: null,
      ...(payload.bankAccountId
        ? { bankAccountId: payload.bankAccountId }
        : {}),
      entryType: CustomerAccountEntryType.ACCOUNT_PAYMENT,
      transactionNoSnapshot: payload.entryNo,
      sourceTransactionNoSnapshot: payload.reference ?? null,
      bankCodeSnapshot: payload.bankCode ?? null,
      bankNameSnapshot: payload.bankName ?? null,
      bankBranchCodeSnapshot: payload.bankBranchCode ?? null,
      bankBranchNameSnapshot: payload.bankBranchName ?? null,
      bankAccountNumberSnapshot: payload.bankAccountNumber ?? null,
      bankAccountNameSnapshot: payload.bankAccountName ?? null,
      receivableDeltaAmount: toMoneyString(payload.amount * -1),
      loyaltyPointsDelta: 0,
      resultingReceivableBalance: toMoneyString(nextReceivableBalance),
      resultingLoyaltyPointsBalance: customer.loyaltyPointsBalance,
      note: noteParts.join(" "),
      originNodeCode: target.storeNode.code,
      occurredAt: new Date(payload.occurredAt),
    },
  });

  return true;
}

async function projectStoreSalesOrder(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreSalesOrderRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store || !target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store or terminal bindings for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.orderId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Sales order packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (!Number.isFinite(payload.totalAmount) || payload.totalAmount <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Sales order "${payload.orderNo}" requires a total amount greater than zero.`,
      false,
    );
  }

  const expectedStatus =
    event.eventType === "sales-order.recorded"
      ? SalesOrderStatus.OPEN
      : event.eventType === "sales-order.fulfilled"
        ? SalesOrderStatus.FULFILLED
        : event.eventType === "sales-order.cancelled"
          ? SalesOrderStatus.CANCELLED
          : null;

  if (!expectedStatus) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Flash ERP does not support sales-order event "${event.eventType}".`,
      false,
    );
  }

  if (payload.status !== expectedStatus) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Sales order "${payload.orderNo}" reported status "${payload.status}" for event "${event.eventType}".`,
      false,
    );
  }

  if (
    payload.status === SalesOrderStatus.FULFILLED &&
    (!payload.fulfilledTransactionId ||
      !payload.fulfilledTransactionNo ||
      !payload.fulfilledAt)
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Sales order "${payload.orderNo}" needs fulfilment transaction details before enterprise can project it.`,
      false,
    );
  }

  if (payload.status === SalesOrderStatus.CANCELLED && !payload.cancelledAt) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Sales order "${payload.orderNo}" needs a cancellation timestamp before enterprise can project it.`,
      false,
    );
  }

  const customer = await resolveEnterpriseCustomerForSalesOrder(
    tx,
    target.storeNode.retailOrgId,
    payload,
  );
  const existingOrder = await tx.salesOrder.findUnique({
    where: {
      id: payload.orderId,
    },
    select: {
      id: true,
      storeId: true,
      originNodeCode: true,
      recordVersion: true,
    },
  });
  const nextRecordVersion = Math.max(1, event.recordVersion);
  const data = {
    retailOrgId: target.storeNode.retailOrgId,
    storeId: target.storeNode.store.id,
    terminalId: target.storeNode.terminal.id,
    customerId: customer?.id ?? null,
    orderNo: payload.orderNo,
    sourceTransactionId: payload.sourceTransactionId,
    sourceTransactionNo: payload.sourceTransactionNo,
    customerNoSnapshot: payload.customerNo,
    customerNameSnapshot: payload.customerName,
    status: payload.status,
    totalAmount: toMoneyString(payload.totalAmount),
    depositAmount: toMoneyString(payload.depositAmount ?? 0),
    balanceAmount: toMoneyString(payload.balanceAmount ?? 0),
    depositTenderMethodCodeSnapshot: payload.depositTenderMethodCode ?? null,
    depositTenderMethodNameSnapshot: payload.depositTenderMethodName ?? null,
    depositPaymentMethodSnapshot: payload.depositPaymentMethod ?? null,
    depositReference: payload.depositReference ?? null,
    depositPaidAt: payload.depositPaidAt ? new Date(payload.depositPaidAt) : null,
    operatorName: payload.operatorName,
    note: payload.note,
    fulfilledTransactionId: payload.fulfilledTransactionId,
    fulfilledTransactionNo: payload.fulfilledTransactionNo,
    originNodeCode: target.storeNode.code,
    recordVersion: nextRecordVersion,
    createdAt: new Date(payload.createdAt),
    fulfilledAt: payload.fulfilledAt ? new Date(payload.fulfilledAt) : null,
    cancelledAt: payload.cancelledAt ? new Date(payload.cancelledAt) : null,
  } satisfies Prisma.SalesOrderUncheckedCreateInput;

  if (existingOrder) {
    if (
      existingOrder.storeId !== target.storeNode.store.id ||
      existingOrder.originNodeCode !== target.storeNode.code
    ) {
      throw new StoreProjectionError(
        "STALE_VERSION",
        `Flash ERP already has sales order "${payload.orderNo}" from another store event.`,
        false,
      );
    }

    if (existingOrder.recordVersion > nextRecordVersion) {
      return true;
    }

    await tx.salesOrder.update({
      where: {
        id: payload.orderId,
      },
      data,
    });

  } else {
    await tx.salesOrder.create({
      data: {
        id: payload.orderId,
        ...data,
      },
    });
  }

  if (payload.lines !== undefined) {
    await tx.salesOrderLine.deleteMany({
      where: {
        salesOrderId: payload.orderId,
      },
    });

    if (payload.lines.length > 0) {
      await tx.salesOrderLine.createMany({
        data: payload.lines.map((line) => ({
          id: line.lineId,
          salesOrderId: payload.orderId,
          productCodeSnapshot: line.productCode,
          productVariantCodeSnapshot: line.productVariantCode,
          productNameSnapshot: line.productName,
          variantSizeSnapshot: line.variantSize,
          variantColorSnapshot: line.variantColor,
          variantAttributesSnapshot: line.variantAttributesSnapshot,
          lineNote: line.lineNote,
          quantity: line.quantity,
          unitPrice: toMoneyString(line.unitPrice),
          discountAmount: toMoneyString(line.discountAmount),
          taxAmount: toMoneyString(line.taxAmount),
          lineTotal: toMoneyString(line.lineTotal),
          appliedPromotionCode: line.appliedPromotionCode,
          appliedPromotionName: line.appliedPromotionName,
        })),
      });
    }
  }

  return true;
}

async function projectStoreEodReconciliation(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreEodReconciliationRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store || !target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store or terminal bindings for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.reconciliationId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `EOD reconciliation packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (
    !Number.isInteger(payload.transactionCount) ||
    payload.transactionCount < 0
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `EOD reconciliation "${payload.reconciliationNo}" requires a whole transaction count of zero or more.`,
      false,
    );
  }

  if (payload.expectedCashAmount < 0 || payload.declaredCashAmount < 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `EOD reconciliation "${payload.reconciliationNo}" cannot carry negative cash values.`,
      false,
    );
  }

  const existingReconciliation = await tx.eodReconciliation.findUnique({
    where: {
      id: payload.reconciliationId,
    },
    select: {
      id: true,
      storeId: true,
      originNodeCode: true,
      recordVersion: true,
    },
  });
  const nextRecordVersion = Math.max(1, event.recordVersion);
  const data = {
    retailOrgId: target.storeNode.retailOrgId,
    storeId: target.storeNode.store.id,
    terminalId: target.storeNode.terminal.id,
    shiftId: payload.shiftId,
    shiftNo: payload.shiftNo,
    cashierCode: payload.cashierCode,
    reconciliationNo: payload.reconciliationNo,
    expectedCashAmount: toMoneyString(payload.expectedCashAmount),
    declaredCashAmount: toMoneyString(payload.declaredCashAmount),
    varianceAmount: toMoneyString(payload.varianceAmount),
    netSalesAmount: toMoneyString(payload.netSalesAmount),
    cashTenderedAmount: toMoneyString(payload.cashTenderedAmount),
    nonCashTenderedAmount: toMoneyString(payload.nonCashTenderedAmount),
    transactionCount: payload.transactionCount,
    operatorName: payload.operatorName,
    note: payload.note,
    originNodeCode: target.storeNode.code,
    recordVersion: nextRecordVersion,
    reconciledAt: new Date(payload.reconciledAt),
  } satisfies Prisma.EodReconciliationUncheckedCreateInput;

  if (existingReconciliation) {
    if (
      existingReconciliation.storeId !== target.storeNode.store.id ||
      existingReconciliation.originNodeCode !== target.storeNode.code
    ) {
      throw new StoreProjectionError(
        "STALE_VERSION",
        `Flash ERP already has EOD reconciliation "${payload.reconciliationNo}" from another store event.`,
        false,
      );
    }

    if (existingReconciliation.recordVersion > nextRecordVersion) {
      return true;
    }

    await tx.eodReconciliation.update({
      where: {
        id: payload.reconciliationId,
      },
      data,
    });

    return true;
  }

  await tx.eodReconciliation.create({
    data: {
      id: payload.reconciliationId,
      ...data,
    },
  });

  return true;
}

async function projectStoreBankingDeposit(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreBankingDepositRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store || !target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store or terminal bindings for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.depositId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Banking deposit packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Banking deposit "${payload.depositNo}" requires an amount greater than zero.`,
      false,
    );
  }

  const reconciliation = await tx.eodReconciliation.findUnique({
    where: {
      id: payload.reconciliationId,
    },
    select: {
      id: true,
      reconciliationNo: true,
      shiftId: true,
      shiftNo: true,
      declaredCashAmount: true,
    },
  });

  if (!reconciliation) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find reconciliation "${payload.reconciliationNo}" before applying banking deposit "${payload.depositNo}".`,
      true,
    );
  }

  if (
    reconciliation.reconciliationNo !== payload.reconciliationNo ||
    reconciliation.shiftId !== payload.shiftId ||
    reconciliation.shiftNo !== payload.shiftNo
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Banking deposit "${payload.depositNo}" did not match the referenced reconciliation snapshot.`,
      false,
    );
  }

  const existingDeposit = await tx.bankingDeposit.findUnique({
    where: {
      id: payload.depositId,
    },
    select: {
      id: true,
      storeId: true,
      originNodeCode: true,
      recordVersion: true,
      amount: true,
    },
  });
  const bankedAggregate = await tx.bankingDeposit.aggregate({
    where: {
      reconciliationId: payload.reconciliationId,
      ...(existingDeposit ? { id: { not: existingDeposit.id } } : {}),
    },
    _sum: {
      amount: true,
    },
  });
  const alreadyBankedAmount = Number(bankedAggregate._sum.amount ?? 0);
  const declaredCashAmount = Number(reconciliation.declaredCashAmount);

  if (alreadyBankedAmount + payload.amount - declaredCashAmount > 0.0001) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Banking deposit "${payload.depositNo}" exceeds the declared cash balance on reconciliation "${payload.reconciliationNo}".`,
      false,
    );
  }

  const nextRecordVersion = Math.max(1, event.recordVersion);
  const data = {
    retailOrgId: target.storeNode.retailOrgId,
    storeId: target.storeNode.store.id,
    terminalId: target.storeNode.terminal.id,
    reconciliationId: payload.reconciliationId,
    depositNo: payload.depositNo,
    reconciliationNo: payload.reconciliationNo,
    shiftId: payload.shiftId,
    shiftNo: payload.shiftNo,
    amount: toMoneyString(payload.amount),
    ...(payload.bankAccountId ? { bankAccountId: payload.bankAccountId } : {}),
    bankName: payload.bankName,
    bankCodeSnapshot: payload.bankCode ?? null,
    bankNameSnapshot: payload.bankName ?? null,
    bankBranchCodeSnapshot: payload.bankBranchCode ?? null,
    bankBranchNameSnapshot: payload.bankBranchName ?? null,
    bankAccountNumberSnapshot: payload.bankAccountNumber ?? null,
    bankAccountNameSnapshot: payload.bankAccountName ?? null,
    reference: payload.reference,
    operatorName: payload.operatorName,
    note: payload.note,
    originNodeCode: target.storeNode.code,
    recordVersion: nextRecordVersion,
    depositedAt: new Date(payload.depositedAt),
  } satisfies Prisma.BankingDepositUncheckedCreateInput;

  if (existingDeposit) {
    if (
      existingDeposit.storeId !== target.storeNode.store.id ||
      existingDeposit.originNodeCode !== target.storeNode.code
    ) {
      throw new StoreProjectionError(
        "STALE_VERSION",
        `Flash ERP already has banking deposit "${payload.depositNo}" from another store event.`,
        false,
      );
    }

    if (existingDeposit.recordVersion > nextRecordVersion) {
      return true;
    }

    await tx.bankingDeposit.update({
      where: {
        id: payload.depositId,
      },
      data,
    });

    return true;
  }

  await tx.bankingDeposit.create({
    data: {
      id: payload.depositId,
      ...data,
    },
  });

  return true;
}

function inferStoreExpenseAttachmentFileName(payload: StoreExpenseConfirmedPayload) {
  const safeSourceName =
    payload.attachmentFileName?.trim().replace(/[^a-zA-Z0-9._-]/g, "") || "";
  const lowerName = safeSourceName.toLowerCase();
  const supportedExtension = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"].find((extension) =>
    lowerName.endsWith(extension)
  );

  if (supportedExtension) {
    return `${Date.now()}-desktop-expense-${payload.expenseId}${supportedExtension}`;
  }

  const contentType = payload.attachmentContentType?.toLowerCase() ?? "";
  const inferredExtension =
    contentType === "application/pdf"
      ? ".pdf"
      : contentType === "image/png"
        ? ".png"
        : contentType === "image/webp"
          ? ".webp"
          : contentType === "image/gif"
            ? ".gif"
            : contentType === "image/jpeg" || contentType === "image/jpg"
              ? ".jpg"
              : ".jpg";

  return `${Date.now()}-desktop-expense-${payload.expenseId}${inferredExtension}`;
}

async function projectStoreExpenseConfirmed(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreExpenseConfirmedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.expenseId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store expense packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store expense "${payload.expenseNo}" requires an amount greater than zero.`,
      false,
    );
  }

  if (!Number.isFinite(payload.taxAmount) || payload.taxAmount < 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store expense "${payload.expenseNo}" cannot carry a negative tax amount.`,
      false,
    );
  }

  await ensureOperatingExpenseSchemaCompatibility();

  let attachmentFileName = payload.attachmentFileName;
  let attachmentUrl = payload.attachmentUrl;

  if (payload.attachmentContentBase64) {
    const attachment = await writeStoreExpenseAttachment({
      fileName: inferStoreExpenseAttachmentFileName(payload),
      content: Buffer.from(payload.attachmentContentBase64, "base64"),
    });
    attachmentFileName = attachment.fileName;
    attachmentUrl = attachment.url;
  }

  const existingExpense = await tx.operatingExpense.findUnique({
    where: {
      id: payload.expenseId,
    },
    select: {
      id: true,
      storeId: true,
      status: true,
      postedAt: true,
    },
  });
  const confirmedAt = new Date(payload.confirmedAt);
  const data = {
    retailOrgId: target.storeNode.retailOrgId,
    storeId: target.storeNode.store.id,
    expenseNo: payload.expenseNo,
    expenseDate: new Date(payload.expenseDate),
    category: payload.category,
    description: payload.description,
    supplierName: payload.supplierName,
    paymentMethod: payload.paymentMethod,
    externalReference: payload.externalReference,
    attachmentFileName,
    attachmentUrl,
    amount: toMoneyString(payload.amount),
    taxAmount: toMoneyString(payload.taxAmount),
    status: OperatingExpenseStatus.APPROVED,
    confirmedBy: payload.operatorName,
    confirmedAt,
    approvedBy: payload.operatorName,
    approvedAt: confirmedAt,
    note: payload.note,
  } satisfies Prisma.OperatingExpenseUncheckedCreateInput;

  if (existingExpense) {
    if (existingExpense.storeId !== target.storeNode.store.id) {
      throw new StoreProjectionError(
        "STALE_VERSION",
        `Flash ERP already has store expense "${payload.expenseNo}" from another store event.`,
        false,
      );
    }

    if (existingExpense.status === OperatingExpenseStatus.POSTED || existingExpense.postedAt) {
      return true;
    }

    await tx.operatingExpense.update({
      where: {
        id: payload.expenseId,
      },
      data,
    });

    return true;
  }

  await tx.operatingExpense.create({
    data: {
      id: payload.expenseId,
      ...data,
    },
  });

  return true;
}

async function resolveStoreShiftCashier(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  cashierCode: string,
) {
  const cashier = await tx.retailUser.findUnique({
    where: {
      retailOrgId_loginId: {
        retailOrgId: target.storeNode.retailOrgId,
        loginId: cashierCode,
      },
    },
    select: {
      id: true,
      loginId: true,
      homeStoreId: true,
    },
  });

  if (!cashier) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve cashier "${cashierCode}" before projecting the store shift.`,
      true,
    );
  }

  if (
    cashier.homeStoreId &&
    target.storeNode.store &&
    cashier.homeStoreId !== target.storeNode.store.id
  ) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Cashier "${cashierCode}" is not assigned to store "${target.storeNode.store.code}".`,
      false,
    );
  }

  return cashier;
}

async function projectStorePosShiftOpened(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStorePosShiftOpenedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store || !target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store or terminal bindings for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.shiftId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store shift-open packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const existingShift = await tx.posShift.findUnique({
    where: {
      id: payload.shiftId,
    },
    select: {
      id: true,
      storeId: true,
      terminalId: true,
      originNodeCode: true,
      recordVersion: true,
    },
  });

  if (existingShift) {
    if (
      existingShift.storeId === target.storeNode.store.id &&
      existingShift.terminalId === target.storeNode.terminal.id &&
      existingShift.originNodeCode === target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has shift "${payload.shiftNo}" from another store event.`,
      false,
    );
  }

  const cashier = await resolveStoreShiftCashier(
    tx,
    target,
    payload.cashierCode,
  );

  await tx.posShift.create({
    data: {
      id: payload.shiftId,
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      terminalId: target.storeNode.terminal.id,
      cashierUserId: cashier.id,
      shiftNo: payload.shiftNo,
      status: "OPEN",
      openingFloatAmount: toMoneyString(payload.openingFloatAmount),
      originNodeCode: target.storeNode.code,
      recordVersion: Math.max(1, event.recordVersion),
      openedAt: new Date(payload.openedAt),
    },
  });

  return true;
}

async function projectStorePosShiftClosed(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStorePosShiftClosedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store || !target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store or terminal bindings for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.shiftId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store shift-close packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const existingShift = await tx.posShift.findUnique({
    where: {
      id: payload.shiftId,
    },
    select: {
      id: true,
      storeId: true,
      terminalId: true,
      originNodeCode: true,
      recordVersion: true,
      status: true,
    },
  });

  if (!existingShift) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find shift "${payload.shiftNo}" before applying the close packet.`,
      true,
    );
  }

  if (
    existingShift.storeId !== target.storeNode.store.id ||
    existingShift.terminalId !== target.storeNode.terminal.id ||
    existingShift.originNodeCode !== target.storeNode.code
  ) {
    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has shift "${payload.shiftNo}" from another store event.`,
      false,
    );
  }

  if (existingShift.recordVersion > event.recordVersion) {
    return true;
  }

  await tx.posShift.update({
    where: {
      id: payload.shiftId,
    },
    data: {
      status: "CLOSED",
      openingFloatAmount: toMoneyString(payload.openingFloatAmount),
      closingDeclaredCash: toMoneyString(payload.closingDeclaredCash),
      closingVariance: toMoneyString(payload.closingVariance),
      recordVersion: Math.max(1, event.recordVersion),
      closedAt: new Date(payload.closedAt),
    },
  });

  return true;
}

async function projectStorePosTransaction(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStorePosTransactionCompletedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store || !target.storeNode.terminal) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP is missing store or terminal bindings for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.transactionId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Store transaction packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const existingTransaction = await tx.posTransaction.findUnique({
    where: {
      retailOrgId_transactionNo: {
        retailOrgId: target.storeNode.retailOrgId,
        transactionNo: payload.transactionNo,
      },
    },
    select: {
      id: true,
      storeId: true,
      originNodeCode: true,
    },
  });

  if (existingTransaction) {
    if (
      existingTransaction.id === payload.transactionId &&
      existingTransaction.storeId === target.storeNode.store.id &&
      existingTransaction.originNodeCode === target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has transaction "${payload.transactionNo}" from another store event.`,
      false,
    );
  }

  const productsByCode = await resolveProductsByCode(
    tx,
    target.storeNode.retailOrgId,
    payload.lines.map((line) => line.productCode),
  );
  const productVariantCodes = [
    ...new Set(
      payload.lines
        .map((line) => line.productVariantCode?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const productVariantsByCode =
    productVariantCodes.length > 0
      ? new Map(
          (
            await tx.productMatrixVariant.findMany({
              where: {
                retailOrgId: target.storeNode.retailOrgId,
                code: {
                  in: productVariantCodes,
                },
              },
              select: {
                id: true,
                code: true,
                productId: true,
              },
            })
          ).map((variant) => [variant.code.toUpperCase(), variant] as const),
        )
      : new Map<
          string,
          {
            id: string;
            code: string;
            productId: string;
          }
        >();
  const customer = await resolveEnterpriseCustomerForPosTransaction(
    tx,
    target.storeNode.retailOrgId,
    payload,
  );
  const loyaltyPolicy = await resolveEnterpriseLoyaltyPolicy(
    tx,
    target.storeNode.retailOrgId,
  );
  const projectedShift = payload.shiftId
    ? await tx.posShift.findUnique({
        where: {
          id: payload.shiftId,
        },
        select: {
          id: true,
          storeId: true,
          terminalId: true,
          originNodeCode: true,
        },
      })
    : null;
  const completedAt = new Date(payload.completedAt);
  const inventoryLocationCodes = [
    ...new Set(
      payload.lines
        .map((line) => line.inventoryLocationCode?.trim())
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const inventoryLocations =
    inventoryLocationCodes.length > 0
      ? await tx.inventoryLocation.findMany({
          where: {
            retailOrgId: target.storeNode.retailOrgId,
            storeId: target.storeNode.store.id,
            code: {
              in: inventoryLocationCodes,
            },
          },
          select: {
            id: true,
            code: true,
          },
        })
      : [];
  const inventoryLocationIdByCode = new Map(
    inventoryLocations.map((location) => [location.code, location.id] as const),
  );
  const tenderCodes = [
    ...new Set(
      payload.payments
        .map((payment) => payment.tenderMethodCode?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const tenderMethodIdByCode =
    tenderCodes.length > 0
      ? new Map(
          (
            await tx.tenderMethod.findMany({
              where: {
                retailOrgId: target.storeNode.retailOrgId,
                code: {
                  in: tenderCodes,
                },
                status: RecordStatus.ACTIVE,
                deletedAt: null,
              },
              select: {
                id: true,
                code: true,
              },
            })
          ).map((method) => [method.code.toUpperCase(), method.id] as const),
        )
      : new Map<string, string>();

  await tx.posTransaction.create({
    data: {
      id: payload.transactionId,
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      terminalId: target.storeNode.terminal.id,
      posShiftId:
        projectedShift &&
        projectedShift.storeId === target.storeNode.store.id &&
        projectedShift.terminalId === target.storeNode.terminal.id &&
        projectedShift.originNodeCode === target.storeNode.code
          ? projectedShift.id
          : null,
      customerId: customer?.customerId ?? null,
      sourceTransactionId: payload.sourceTransactionId,
      sourceTransactionNo: payload.sourceTransactionNo,
      transactionNo: payload.transactionNo,
      transactionType: payload.transactionType,
      status: PosTransactionStatus.COMPLETED,
      customerNameSnapshot: payload.customerName ?? customer?.fullName ?? null,
      cashierCodeSnapshot: payload.cashierCode,
      subtotalAmount: toMoneyString(payload.subtotalAmount),
      discountAmount: toMoneyString(payload.discountAmount),
      taxAmount: toMoneyString(payload.taxAmount),
      totalAmount: toMoneyString(payload.totalAmount),
      paidAmount: toMoneyString(payload.paidAmount),
      changeAmount: toMoneyString(payload.changeAmount),
      notes: payload.notes,
      originNodeCode: target.storeNode.code,
      recordVersion: Math.max(1, event.recordVersion),
      completedAt,
      lines: {
        createMany: {
          data: payload.lines.map((line) => {
            const product = productsByCode.get(line.productCode);

            if (!product) {
              throw new StoreProjectionError(
                "DEPENDENCY_MISSING",
                `Flash ERP could not resolve product "${line.productCode}" in the enterprise catalog yet.`,
                true,
              );
            }
            const productVariant = line.productVariantCode
              ? productVariantsByCode.get(
                  line.productVariantCode.trim().toUpperCase(),
                )
              : null;

            if (line.productVariantCode && !productVariant) {
              throw new StoreProjectionError(
                "DEPENDENCY_MISSING",
                `Flash ERP could not resolve product variant "${line.productVariantCode}" in the enterprise catalog yet.`,
                true,
              );
            }

            if (productVariant && productVariant.productId !== product.id) {
              throw new StoreProjectionError(
                "INVALID_PAYLOAD",
                `Store transaction line "${line.lineId}" linked variant "${line.productVariantCode}" to product "${line.productCode}", but the variant belongs to another product.`,
                false,
              );
            }

            return {
              id: line.lineId,
              productId: product.id,
              productVariantId: productVariant?.id ?? null,
              inventoryLocationId: line.inventoryLocationCode
                ? inventoryLocationIdByCode.get(line.inventoryLocationCode) ?? null
                : null,
              lineIntent: line.lineIntent,
              sourceLineId: line.sourceLineId,
              productCodeSnapshot: line.productCode,
              productNameSnapshot: line.productName,
              barcodeSnapshot: line.barcode,
              variantSizeSnapshot:
                line.variantSize ?? line.variantAttributesSnapshot ?? null,
              variantColorSnapshot: line.variantColor ?? null,
              variantAttributesSnapshot: line.variantAttributesSnapshot ?? null,
              lineNote: line.lineNote ?? null,
              appliedPromotionCodeSnapshot: line.appliedPromotionCode,
              appliedPromotionNameSnapshot: line.appliedPromotionName,
              ...(line.serialNumbers.length > 0
                ? { serialNumbersSnapshot: serializeJsonField(line.serialNumbers) }
                : {}),
              quantity: toQuantityString(line.quantity),
              unitPrice: toMoneyString(line.unitPrice),
              discountAmount: toMoneyString(line.discountAmount),
              taxAmount: toMoneyString(line.taxAmount),
              lineTotal: toMoneyString(line.lineTotal),
            };
          }),
        },
      },
      payments: {
        createMany: {
          data: payload.payments.map((payment) => ({
            id: payment.paymentId,
            tenderMethodId: payment.tenderMethodCode
              ? tenderMethodIdByCode.get(payment.tenderMethodCode.trim().toUpperCase()) ?? null
              : null,
            ...(payment.bankAccountId
              ? { bankAccountId: payment.bankAccountId }
              : {}),
            tenderMethodCodeSnapshot: payment.tenderMethodCode,
            tenderMethodNameSnapshot: payment.tenderMethodName,
            bankCodeSnapshot: payment.bankCode,
            bankNameSnapshot: payment.bankName,
            bankBranchCodeSnapshot: payment.bankBranchCode,
            bankBranchNameSnapshot: payment.bankBranchName,
            bankAccountNumberSnapshot: payment.bankAccountNumber,
            bankAccountNameSnapshot: payment.bankAccountName,
            method: payment.method,
            amount: toMoneyString(payment.amount),
            reference: payment.reference,
            receivedAt: new Date(payment.receivedAt),
          })),
        },
      },
    },
  });

  for (const line of payload.lines) {
    if (!line.productVariantCode) {
      continue;
    }

    const productVariant = productVariantsByCode.get(
      line.productVariantCode.trim().toUpperCase(),
    );

    if (!productVariant) {
      continue;
    }

    const quantityDelta =
      line.lineIntent === "RETURN" ? line.quantity : line.quantity * -1;

    await tx.productMatrixVariant.update({
      where: {
        id: productVariant.id,
      },
      data: {
        quantityOnHand: {
          increment: toQuantityString(quantityDelta),
        },
      },
    });
  }

  await applyEnterpriseCustomerAccountPostingForPosTransaction(tx, {
    retailOrgId: target.storeNode.retailOrgId,
    storeId: target.storeNode.store.id,
    terminalId: target.storeNode.terminal.id,
    originNodeCode: target.storeNode.code,
    transactionId: payload.transactionId,
    transactionNo: payload.transactionNo,
    sourceTransactionNo: payload.sourceTransactionNo,
    completedAt,
    customer,
    loyaltyPolicy,
    payload,
  });
  await postPosTransactionAccountingInTransaction(tx as Prisma.TransactionClient, {
    retailOrgId: target.storeNode.retailOrgId,
    transactionId: payload.transactionId,
    postedBy: "Store sync POS"
  });

  await captureTransactionReference(tx, {
    retailOrgId: target.storeNode.retailOrgId,
    reference: payload.headerReference,
    transactionNo: payload.transactionNo,
    source: "STORE_DESKTOP",
    customerName: customer?.fullName ?? payload.customerName ?? null,
    notes: payload.additionalDetails ?? payload.notes ?? null,
  });

  if (payload.headerReference && target.storeNode.store) {
    await sendSaleSmsNotificationSafely({
      retailOrgId: target.storeNode.retailOrgId,
      phoneReference: payload.headerReference,
      transactionNo: payload.transactionNo,
      storeName: target.storeNode.store.name,
      currencyCode: target.storeNode.store.currencyCode,
      totalAmount: payload.totalAmount,
      details: payload.additionalDetails ?? payload.notes,
    }, "synced sale SMS");
  }

  return true;
}

async function projectStoreInventoryLedgerEntry(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreInventoryLedgerRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.ledgerEntryId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inventory ledger packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const existingLedgerEntry = await tx.inventoryLedgerEntry.findUnique({
    where: {
      id: payload.ledgerEntryId,
    },
    select: {
      id: true,
      sourceNodeCode: true,
      storeId: true,
    },
  });

  if (existingLedgerEntry) {
    if (
      existingLedgerEntry.storeId === target.storeNode.store.id &&
      existingLedgerEntry.sourceNodeCode === target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has inventory ledger entry "${payload.ledgerEntryId}" from another source.`,
      false,
    );
  }

  const productsByCode = await resolveProductsByCode(
    tx,
    target.storeNode.retailOrgId,
    [payload.productCode],
  );
  const product = productsByCode.get(payload.productCode);

  if (!product) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve product "${payload.productCode}" in the enterprise catalog yet.`,
      true,
    );
  }

  const inventoryLocation = await resolveInventoryLocation(
    tx,
    target,
    payload.inventoryLocationCode,
  );
  const relatedStockCountSession =
    payload.referenceType === "STOCK_COUNT_SESSION"
      ? await tx.stockCountSession.findUnique({
          where: {
            id: payload.referenceId,
          },
          select: {
            id: true,
            status: true,
            inventoryLocationId: true,
            productId: true,
            varianceQuantity: true,
            countedSerialNumbersSnapshot: true,
          },
        })
      : null;

  if (
    payload.referenceType === "STOCK_COUNT_SESSION" &&
    !relatedStockCountSession
  ) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find stock count session "${payload.referenceId}" before applying the committed count variance.`,
      true,
    );
  }

  if (
    relatedStockCountSession &&
    (relatedStockCountSession.inventoryLocationId !== inventoryLocation.id ||
      relatedStockCountSession.productId !== product.id)
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Committed stock count session "${payload.referenceId}" does not match the referenced location or product.`,
      false,
    );
  }

  if (
    relatedStockCountSession &&
    Math.abs(
      Number(relatedStockCountSession.varianceQuantity) - payload.quantity,
    ) > 0.0001
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Committed stock count session "${payload.referenceId}" carried a different variance than the session originally submitted.`,
      false,
    );
  }

  if (
    relatedStockCountSession &&
    product.isSerialized &&
    !serialNumberSetsMatch(
      readOptionalStringArray(
        {
          countedSerialNumbersSnapshot:
            relatedStockCountSession.countedSerialNumbersSnapshot,
        },
        "countedSerialNumbersSnapshot",
      ),
      payload.serialNumbers ?? [],
    )
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Committed stock count session "${payload.referenceId}" carried a different counted serial list than the submitted session.`,
      false,
    );
  }

  await tx.inventoryLedgerEntry.create({
    data: {
      id: payload.ledgerEntryId,
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      warehouseId: inventoryLocation.warehouseId,
      inventoryLocationId: inventoryLocation.id,
      productId: product.id,
      movementType: payload.movementType,
      quantity: toQuantityString(
        toSignedInventoryQuantity(payload.movementType, payload.quantity),
      ),
      unitCost:
        payload.unitCost === null
          ? (product.baseCostPrice?.toString() ?? null)
          : toMoneyString(payload.unitCost),
      referenceType: payload.referenceType,
      referenceId: payload.referenceId,
      externalReference: payload.externalReference,
      sourceNodeCode: target.storeNode.code,
      occurredAt: new Date(payload.occurredAt),
    },
  });
  if (
    payload.referenceType === "POS_TRANSACTION" &&
    (payload.movementType === InventoryMovementType.SALE ||
      payload.movementType === InventoryMovementType.RETURN)
  ) {
    await postPosTransactionAccountingInTransaction(tx as Prisma.TransactionClient, {
      retailOrgId: target.storeNode.retailOrgId,
      transactionId: payload.referenceId,
      postedBy: "Store sync inventory"
    });
  }

  if (product.isSerialized) {
    await applyEnterpriseSerializedLedgerMovement(tx, {
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      warehouseId: inventoryLocation.warehouseId ?? null,
      inventoryLocationId: inventoryLocation.id,
      productId: product.id,
      movementType: payload.movementType,
      serialNumbers: payload.serialNumbers ?? [],
      sourceReferenceType: payload.referenceType,
      sourceReferenceId: payload.referenceId,
      sourceReferenceLabel: payload.externalReference,
      sourceNodeCode: target.storeNode.code,
      occurredAt: new Date(payload.occurredAt),
    });
  }

  if (relatedStockCountSession) {
    await tx.stockCountSession.update({
      where: {
        id: relatedStockCountSession.id,
      },
      data: {
        status: StockCountSessionStatus.COMMITTED,
        committedByNodeCode: target.storeNode.code,
        committedAt: new Date(payload.occurredAt),
      },
    });
  }

  return true;
}

async function projectStoreInventoryTransfer(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreInventoryTransferRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.transferId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inventory transfer packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (
    payload.sourceInventoryLocationCode ===
    payload.destinationInventoryLocationCode
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP requires different source and destination locations for a stock transfer.",
      false,
    );
  }

  if (payload.quantity <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP requires a positive quantity for a stock transfer.",
      false,
    );
  }

  const existingEntries = await tx.inventoryLedgerEntry.findMany({
    where: {
      id: {
        in: [payload.outboundLedgerEntryId, payload.inboundLedgerEntryId],
      },
    },
    select: {
      id: true,
      sourceNodeCode: true,
      storeId: true,
    },
  });

  if (existingEntries.length > 0) {
    if (
      existingEntries.length === 2 &&
      existingEntries.every(
        (entry) =>
          entry.storeId === target.storeNode.store?.id &&
          entry.sourceNodeCode === target.storeNode.code,
      )
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has transfer "${payload.transferId}" from another source or in a partial state.`,
      false,
    );
  }

  const productsByCode = await resolveProductsByCode(
    tx,
    target.storeNode.retailOrgId,
    [payload.productCode],
  );
  const product = productsByCode.get(payload.productCode);

  if (!product) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve product "${payload.productCode}" in the enterprise catalog yet.`,
      true,
    );
  }

  const [sourceInventoryLocation, destinationInventoryLocation] =
    await runPrismaQueriesSequentially([
      () =>
        resolveInventoryLocation(
          tx,
          target,
          payload.sourceInventoryLocationCode,
        ),
      () =>
        resolveInventoryLocation(
          tx,
          target,
          payload.destinationInventoryLocationCode,
        ),
    ]);

  await tx.inventoryLedgerEntry.createMany({
    data: [
      {
        id: payload.outboundLedgerEntryId,
        retailOrgId: target.storeNode.retailOrgId,
        storeId: target.storeNode.store.id,
        warehouseId: sourceInventoryLocation.warehouseId,
        inventoryLocationId: sourceInventoryLocation.id,
        productId: product.id,
        movementType: InventoryMovementType.STOCK_TRANSFER_OUT,
        quantity: toQuantityString(payload.quantity * -1),
        unitCost:
          payload.unitCost === null
            ? (product.baseCostPrice?.toString() ?? null)
            : toMoneyString(payload.unitCost),
        referenceType: payload.referenceType,
        referenceId: payload.referenceId,
        externalReference: payload.externalReference,
        sourceNodeCode: target.storeNode.code,
        occurredAt: new Date(payload.occurredAt),
      },
      {
        id: payload.inboundLedgerEntryId,
        retailOrgId: target.storeNode.retailOrgId,
        storeId: target.storeNode.store.id,
        warehouseId: destinationInventoryLocation.warehouseId,
        inventoryLocationId: destinationInventoryLocation.id,
        productId: product.id,
        movementType: InventoryMovementType.STOCK_TRANSFER_IN,
        quantity: toQuantityString(payload.quantity),
        unitCost:
          payload.unitCost === null
            ? (product.baseCostPrice?.toString() ?? null)
            : toMoneyString(payload.unitCost),
        referenceType: payload.referenceType,
        referenceId: payload.referenceId,
        externalReference: payload.externalReference,
        sourceNodeCode: target.storeNode.code,
        occurredAt: new Date(payload.occurredAt),
      },
    ],
  });

  if (product.isSerialized) {
    await applyEnterpriseSerializedTransfer(tx, {
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      warehouseId: destinationInventoryLocation.warehouseId ?? null,
      destinationInventoryLocationId: destinationInventoryLocation.id,
      productId: product.id,
      serialNumbers: payload.serialNumbers ?? [],
      sourceReferenceType: payload.referenceType,
      sourceReferenceId: payload.referenceId,
      sourceReferenceLabel: payload.externalReference,
      sourceNodeCode: target.storeNode.code,
      occurredAt: new Date(payload.occurredAt),
    });
  }

  return true;
}

async function projectStoreInterStoreTransferRequest(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreInterStoreTransferRequestedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.requestId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer request packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP needs a positive requested quantity for an inter-store transfer.",
      false,
    );
  }

  const existingTransfer = await tx.interStoreTransfer.findUnique({
    where: {
      id: payload.requestId,
    },
    select: {
      id: true,
    },
  });

  if (existingTransfer) {
    await queueInterStoreTransferPublication(tx, {
      transferId: existingTransfer.id,
    });
    return true;
  }

  const destinationLocation = await tx.inventoryLocation.findFirst({
    where: {
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      code: payload.destinationLocationCode,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeId: true,
    },
  });

  if (!destinationLocation) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find destination location "${payload.destinationLocationCode}" for "${target.storeNode.store.code}".`,
      false,
    );
  }

  const sourceLocation = await tx.inventoryLocation.findFirst({
    where: {
      retailOrgId: target.storeNode.retailOrgId,
      code: payload.sourceLocationCode,
      status: RecordStatus.ACTIVE,
      storeId: {
        not: target.storeNode.store.id,
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeId: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!sourceLocation || !sourceLocation.storeId || !sourceLocation.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find active source location "${payload.sourceLocationCode}" in another store.`,
      false,
    );
  }

  const product = await tx.product.findFirst({
    where: {
      retailOrgId: target.storeNode.retailOrgId,
      code: payload.productCode,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      code: true,
      name: true,
      isSerialized: true,
      baseCostPrice: true,
    },
  });

  if (!product) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find active product "${payload.productCode}" for the transfer request.`,
      false,
    );
  }

  if (product.isSerialized && !Number.isInteger(payload.quantity)) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Serialized product "${product.code}" needs a whole-number requested quantity.`,
      false,
    );
  }

  const occurredAt = new Date(payload.occurredAt);
  const transferNo = buildInterStoreTransferNo(
    sourceLocation.code,
    destinationLocation.code,
    occurredAt,
  );

  await tx.interStoreTransfer.create({
    data: {
      id: payload.requestId,
      retailOrgId: target.storeNode.retailOrgId,
      sourceStoreId: sourceLocation.storeId,
      destinationStoreId: target.storeNode.store.id,
      sourceInventoryLocationId: sourceLocation.id,
      destinationInventoryLocationId: destinationLocation.id,
      productId: product.id,
      transferNo,
      externalReference: payload.externalReference?.trim() || payload.requestNo,
      origin: InterStoreTransferOrigin.STORE_REQUEST,
      status: InterStoreTransferStatus.REQUESTED,
      requestedQuantity: toQuantityString(payload.quantity),
      issuedQuantity: toQuantityString(0),
      receivedQuantity: toQuantityString(0),
      unitCost: product.baseCostPrice?.toString() ?? null,
      requestOperatorName: payload.operatorName,
      requestNote:
        payload.note?.trim() ||
        `${target.storeNode.store.code} requested ${payload.quantity.toFixed(3)} unit(s) of ${product.name} from ${sourceLocation.store.name} / ${sourceLocation.name}.`,
      requestedByNodeCode: target.storeNode.code,
      requestedAt: occurredAt,
    },
  });

  await queueInterStoreTransferPublication(tx, {
    transferId: payload.requestId,
    publishedAt: occurredAt,
  });

  return true;
}

async function projectStoreInterStoreTransferIssue(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreInterStoreTransferIssuedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.transferId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer issue packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP needs a positive issued quantity for an inter-store transfer.",
      false,
    );
  }

  const transfer = await tx.interStoreTransfer.findUnique({
    where: {
      id: payload.transferId,
    },
    select: {
      id: true,
      transferNo: true,
      retailOrgId: true,
      sourceStoreId: true,
      destinationStoreId: true,
      sourceInventoryLocationId: true,
      destinationInventoryLocationId: true,
      productId: true,
      status: true,
      requestedQuantity: true,
      issuedQuantity: true,
      receivedQuantity: true,
      unitCost: true,
      issuedSerialNumbersSnapshot: true,
      closedAt: true,
      sourceInventoryLocation: {
        select: {
          code: true,
          name: true,
          warehouseId: true,
        },
      },
      destinationInventoryLocation: {
        select: {
          code: true,
          name: true,
        },
      },
      product: {
        select: {
          code: true,
          name: true,
          isSerialized: true,
          baseCostPrice: true,
        },
      },
    },
  });

  if (!transfer) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find inter-store transfer "${payload.transferId}" in enterprise yet.`,
      true,
    );
  }

  if (transfer.transferNo !== payload.transferNo) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${payload.transferId}" used mismatched transfer number "${payload.transferNo}".`,
      false,
    );
  }

  if (transfer.sourceStoreId !== target.storeNode.store.id) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" is assigned to another source store.`,
      false,
    );
  }

  if (
    transfer.status === InterStoreTransferStatus.CANCELLED ||
    transfer.status === InterStoreTransferStatus.CLOSED ||
    transfer.status === InterStoreTransferStatus.RECEIVED
  ) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Inter-store transfer "${transfer.transferNo}" is no longer open for issue.`,
      false,
    );
  }

  if (
    payload.sourceLocationCode !== transfer.sourceInventoryLocation.code ||
    payload.destinationLocationCode !==
      transfer.destinationInventoryLocation.code
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" targeted different locations than the enterprise document.`,
      false,
    );
  }

  if (payload.productCode !== transfer.product.code) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" targeted product "${payload.productCode}" instead of "${transfer.product.code}".`,
      false,
    );
  }

  const remainingIssueQuantity = Number(
    Math.max(
      0,
      Number(transfer.requestedQuantity) - Number(transfer.issuedQuantity),
    ).toFixed(3),
  );

  if (payload.quantity - remainingIssueQuantity > 0.0001) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Inter-store transfer "${transfer.transferNo}" exceeds the outstanding quantity available to issue.`,
      false,
    );
  }

  const serialNumbers = normalizeSerialNumbers(payload.serialNumbers);

  if (transfer.product.isSerialized) {
    if (!Number.isInteger(payload.quantity)) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized product "${transfer.product.code}" needs a whole-number issued quantity.`,
        false,
      );
    }

    if (serialNumbers.length !== payload.quantity) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized transfer "${transfer.transferNo}" needs ${payload.quantity} issued serial number(s).`,
        false,
      );
    }

    const existingSerialUnits = await tx.inventorySerialUnit.findMany({
      where: {
        retailOrgId: transfer.retailOrgId,
        productId: transfer.productId,
        serialNumber: {
          in: serialNumbers,
        },
      },
      select: {
        serialNumber: true,
        status: true,
        inventoryLocationId: true,
      },
    });

    if (existingSerialUnits.length !== serialNumbers.length) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Flash ERP could not find all requested serials for "${transfer.product.name}" at the source location.`,
        false,
      );
    }

    const invalidSerials = existingSerialUnits.filter(
      (serialUnit) =>
        serialUnit.status !== SerialInventoryStatus.AVAILABLE ||
        serialUnit.inventoryLocationId !== transfer.sourceInventoryLocationId,
    );

    if (invalidSerials.length > 0) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Serial number(s) ${invalidSerials.map((serialUnit) => serialUnit.serialNumber).join(", ")} are not currently available to issue from ${transfer.sourceInventoryLocation.name}.`,
        false,
      );
    }
  } else if (serialNumbers.length > 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" cannot issue serials for non-serialized product "${transfer.product.code}".`,
      false,
    );
  } else {
    const onHandQuantity = await getInventoryLocationOnHandQuantity(
      tx,
      transfer.retailOrgId,
      transfer.sourceInventoryLocationId,
      transfer.productId,
    );

    if (payload.quantity - onHandQuantity > 0.0001) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Only ${onHandQuantity.toFixed(3)} unit(s) of ${transfer.product.name} are currently available at ${transfer.sourceInventoryLocation.name}.`,
        false,
      );
    }
  }

  const occurredAt = new Date(payload.occurredAt);
  const postStockImmediately = await shouldPostStockImmediately(
    tx,
    transfer.retailOrgId,
    transfer.sourceStoreId,
  );
  const nextIssuedQuantity = Number(
    (Number(transfer.issuedQuantity) + payload.quantity).toFixed(3),
  );
  const nextIssuedSerialNumbers = normalizeSerialNumbers([
    ...toOptionalStringArraySnapshot(transfer.issuedSerialNumbersSnapshot),
    ...serialNumbers,
  ]);
  const nextStatus = deriveInterStoreTransferStatus({
    currentStatus: transfer.status,
    closedAt: transfer.closedAt,
    requestedQuantity: transfer.requestedQuantity,
    issuedQuantity: nextIssuedQuantity,
    receivedQuantity: transfer.receivedQuantity,
  });

  if (postStockImmediately) {
    await tx.inventoryLedgerEntry.create({
      data: {
        id: randomUUID(),
        retailOrgId: transfer.retailOrgId,
        storeId: transfer.sourceStoreId,
        warehouseId: transfer.sourceInventoryLocation.warehouseId,
        inventoryLocationId: transfer.sourceInventoryLocationId,
        productId: transfer.productId,
        movementType: InventoryMovementType.STOCK_TRANSFER_OUT,
        quantity: toQuantityString(payload.quantity * -1),
        unitCost:
          transfer.unitCost === null
            ? (transfer.product.baseCostPrice?.toString() ?? null)
            : toMoneyString(Number(transfer.unitCost)),
        referenceType: "INTERSTORE_TRANSFER",
        referenceId: transfer.id,
        externalReference: transfer.transferNo,
        sourceNodeCode: target.storeNode.code,
        occurredAt,
      },
    });
  }

  if (postStockImmediately && transfer.product.isSerialized) {
    for (const serialNumber of serialNumbers) {
      await upsertEnterpriseSerialUnit(tx, {
        retailOrgId: transfer.retailOrgId,
        storeId: null,
        warehouseId: null,
        inventoryLocationId: null,
        productId: transfer.productId,
        serialNumber,
        status: SerialInventoryStatus.IN_TRANSIT,
        sourceReferenceType: "INTERSTORE_TRANSFER",
        sourceReferenceId: transfer.id,
        sourceReferenceLabel: transfer.transferNo,
        sourceNodeCode: target.storeNode.code,
        occurredAt,
      });
    }
  }

  await tx.interStoreTransfer.update({
    where: {
      id: transfer.id,
    },
    data: {
      status: nextStatus,
      issuedQuantity: toQuantityString(nextIssuedQuantity),
      ...(nextIssuedSerialNumbers.length > 0
        ? { issuedSerialNumbersSnapshot: serializeJsonField(nextIssuedSerialNumbers) }
        : {}),
      issueOperatorName: payload.operatorName,
      issueNote: payload.note,
      issueStockUpdateStatus: postStockImmediately
        ? STOCK_UPDATE_STATUS_POSTED
        : STOCK_UPDATE_STATUS_PENDING,
      issueStockConfirmedAt: postStockImmediately ? occurredAt : null,
      issueStockConfirmedBy: postStockImmediately ? payload.operatorName : null,
      sourceNodeCode: target.storeNode.code,
      issuedAt: occurredAt,
    },
  });

  await queueInterStoreTransferPublication(tx, {
    transferId: transfer.id,
    publishedAt: occurredAt,
  });

  return true;
}

async function projectStoreInterStoreTransferReceipt(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreInterStoreTransferReceivedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.transferId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer receipt packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP needs a positive received quantity for an inter-store transfer.",
      false,
    );
  }

  const transfer = await tx.interStoreTransfer.findUnique({
    where: {
      id: payload.transferId,
    },
    select: {
      id: true,
      transferNo: true,
      retailOrgId: true,
      sourceStoreId: true,
      destinationStoreId: true,
      sourceInventoryLocationId: true,
      destinationInventoryLocationId: true,
      productId: true,
      status: true,
      requestedQuantity: true,
      issuedQuantity: true,
      receivedQuantity: true,
      unitCost: true,
      issuedSerialNumbersSnapshot: true,
      receivedSerialNumbersSnapshot: true,
      closedAt: true,
      destinationInventoryLocation: {
        select: {
          code: true,
          name: true,
          warehouseId: true,
        },
      },
      sourceInventoryLocation: {
        select: {
          code: true,
          name: true,
        },
      },
      product: {
        select: {
          code: true,
          name: true,
          isSerialized: true,
          baseCostPrice: true,
        },
      },
    },
  });

  if (!transfer) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find inter-store transfer "${payload.transferId}" in enterprise yet.`,
      true,
    );
  }

  if (transfer.transferNo !== payload.transferNo) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${payload.transferId}" used mismatched transfer number "${payload.transferNo}".`,
      false,
    );
  }

  if (transfer.destinationStoreId !== target.storeNode.store.id) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" is assigned to another destination store.`,
      false,
    );
  }

  if (
    transfer.status === InterStoreTransferStatus.CANCELLED ||
    transfer.status === InterStoreTransferStatus.CLOSED
  ) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Inter-store transfer "${transfer.transferNo}" is no longer open for receiving.`,
      false,
    );
  }

  if (
    payload.sourceLocationCode !== transfer.sourceInventoryLocation.code ||
    payload.destinationLocationCode !==
      transfer.destinationInventoryLocation.code
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" targeted different locations than the enterprise document.`,
      false,
    );
  }

  if (payload.productCode !== transfer.product.code) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" targeted product "${payload.productCode}" instead of "${transfer.product.code}".`,
      false,
    );
  }

  const remainingReceiptQuantity = Number(
    Math.max(
      0,
      Number(transfer.issuedQuantity) - Number(transfer.receivedQuantity),
    ).toFixed(3),
  );

  if (payload.quantity - remainingReceiptQuantity > 0.0001) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Inter-store transfer "${transfer.transferNo}" exceeds the quantity that has been issued but not yet received.`,
      false,
    );
  }

  const serialNumbers = normalizeSerialNumbers(payload.serialNumbers);

  if (transfer.product.isSerialized) {
    if (!Number.isInteger(payload.quantity)) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized product "${transfer.product.code}" needs a whole-number received quantity.`,
        false,
      );
    }

    if (serialNumbers.length !== payload.quantity) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized transfer "${transfer.transferNo}" needs ${payload.quantity} received serial number(s).`,
        false,
      );
    }

    const issuedSerialNumbers = new Set(
      toOptionalStringArraySnapshot(transfer.issuedSerialNumbersSnapshot).map(
        (serialNumber) => serialNumber.toUpperCase(),
      ),
    );
    const receivedSerialNumbers = new Set(
      toOptionalStringArraySnapshot(transfer.receivedSerialNumbersSnapshot).map(
        (serialNumber) => serialNumber.toUpperCase(),
      ),
    );
    const invalidSerialNumbers = serialNumbers.filter(
      (serialNumber) =>
        !issuedSerialNumbers.has(serialNumber.toUpperCase()) ||
        receivedSerialNumbers.has(serialNumber.toUpperCase()),
    );

    if (invalidSerialNumbers.length > 0) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Serial number(s) ${invalidSerialNumbers.join(", ")} are not available to receive on "${transfer.transferNo}".`,
        false,
      );
    }
  } else if (serialNumbers.length > 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Inter-store transfer "${transfer.transferNo}" cannot receive serials for non-serialized product "${transfer.product.code}".`,
      false,
    );
  }

  const occurredAt = new Date(payload.occurredAt);
  const postStockImmediately = await shouldPostStockImmediately(
    tx,
    transfer.retailOrgId,
    transfer.destinationStoreId,
  );
  const nextReceivedQuantity = Number(
    (Number(transfer.receivedQuantity) + payload.quantity).toFixed(3),
  );
  const nextReceivedSerialNumbers = normalizeSerialNumbers([
    ...toOptionalStringArraySnapshot(transfer.receivedSerialNumbersSnapshot),
    ...serialNumbers,
  ]);
  const nextStatus = deriveInterStoreTransferStatus({
    currentStatus: transfer.status,
    closedAt: transfer.closedAt,
    requestedQuantity: transfer.requestedQuantity,
    issuedQuantity: transfer.issuedQuantity,
    receivedQuantity: nextReceivedQuantity,
  });

  if (postStockImmediately) {
    await tx.inventoryLedgerEntry.create({
      data: {
        id: randomUUID(),
        retailOrgId: transfer.retailOrgId,
        storeId: transfer.destinationStoreId,
        warehouseId: transfer.destinationInventoryLocation.warehouseId,
        inventoryLocationId: transfer.destinationInventoryLocationId,
        productId: transfer.productId,
        movementType: InventoryMovementType.STOCK_TRANSFER_IN,
        quantity: toQuantityString(payload.quantity),
        unitCost:
          transfer.unitCost === null
            ? (transfer.product.baseCostPrice?.toString() ?? null)
            : toMoneyString(Number(transfer.unitCost)),
        referenceType: "INTERSTORE_TRANSFER",
        referenceId: transfer.id,
        externalReference: transfer.transferNo,
        sourceNodeCode: target.storeNode.code,
        occurredAt,
      },
    });
  }

  if (postStockImmediately && transfer.product.isSerialized) {
    for (const serialNumber of serialNumbers) {
      await upsertEnterpriseSerialUnit(tx, {
        retailOrgId: transfer.retailOrgId,
        storeId: transfer.destinationStoreId,
        warehouseId: transfer.destinationInventoryLocation.warehouseId ?? null,
        inventoryLocationId: transfer.destinationInventoryLocationId,
        productId: transfer.productId,
        serialNumber,
        status: SerialInventoryStatus.AVAILABLE,
        sourceReferenceType: "INTERSTORE_TRANSFER",
        sourceReferenceId: transfer.id,
        sourceReferenceLabel: transfer.transferNo,
        sourceNodeCode: target.storeNode.code,
        occurredAt,
      });
    }
  }

  await tx.interStoreTransfer.update({
    where: {
      id: transfer.id,
    },
    data: {
      status: nextStatus,
      receivedQuantity: toQuantityString(nextReceivedQuantity),
      ...(nextReceivedSerialNumbers.length > 0
        ? { receivedSerialNumbersSnapshot: serializeJsonField(nextReceivedSerialNumbers) }
        : {}),
      receiptOperatorName: payload.operatorName,
      receiptNote: payload.note,
      receiptStockUpdateStatus: postStockImmediately
        ? STOCK_UPDATE_STATUS_POSTED
        : STOCK_UPDATE_STATUS_PENDING,
      receiptStockConfirmedAt: postStockImmediately ? occurredAt : null,
      receiptStockConfirmedBy: postStockImmediately ? payload.operatorName : null,
      destinationNodeCode: target.storeNode.code,
      receivedAt: occurredAt,
    },
  });

  await queueInterStoreTransferPublication(tx, {
    transferId: transfer.id,
    publishedAt: occurredAt,
  });

  return true;
}

async function projectStoreGoodsReceipt(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreGoodsReceiptRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.goodsReceiptId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Goods receipt packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const existingReceipt = await tx.goodsReceipt.findUnique({
    where: {
      id: payload.goodsReceiptId,
    },
    select: {
      id: true,
      storeId: true,
      sourceNodeCode: true,
    },
  });

  if (existingReceipt) {
    if (
      existingReceipt.storeId === target.storeNode.store.id &&
      existingReceipt.sourceNodeCode === target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has goods receipt "${payload.goodsReceiptNo}" from another source.`,
      false,
    );
  }

  const inventoryLocation = await resolveInventoryLocation(
    tx,
    target,
    payload.inventoryLocationCode,
  );
  const productsByCode = await resolveProductsByCode(
    tx,
    target.storeNode.retailOrgId,
    [
      ...payload.lines.map((line) => line.productCode),
      ...payload.exceptions.map((line) => line.productCode),
    ],
  );
  const supplier =
    payload.supplierNo === null
      ? null
      : await tx.supplier.findFirst({
          where: {
            retailOrgId: target.storeNode.retailOrgId,
            supplierNo: payload.supplierNo,
            status: RecordStatus.ACTIVE,
          },
          select: {
            id: true,
            supplierNo: true,
          },
        });

  if (payload.supplierNo && !supplier) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve supplier "${payload.supplierNo}" in enterprise yet.`,
      true,
    );
  }

  const purchaseOrder =
    payload.purchaseOrderId === null
      ? null
      : await tx.purchaseOrder.findUnique({
          where: {
            id: payload.purchaseOrderId,
          },
          select: {
            id: true,
            purchaseOrderNo: true,
            status: true,
            committedAt: true,
            closedAt: true,
            storeId: true,
            inventoryLocationId: true,
            supplierId: true,
            lines: {
              select: {
                id: true,
                productId: true,
                orderedQuantity: true,
                receivedQuantity: true,
                exceptionQuantity: true,
              },
            },
          },
        });

  if (payload.purchaseOrderId && !purchaseOrder) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find purchase order "${payload.purchaseOrderId}" in enterprise yet.`,
      true,
    );
  }

  if (purchaseOrder) {
    if (purchaseOrder.purchaseOrderNo !== payload.purchaseOrderNo) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt "${payload.goodsReceiptNo}" referenced purchase order "${payload.purchaseOrderNo}" but enterprise resolved "${purchaseOrder.purchaseOrderNo}".`,
        false,
      );
    }

    if (purchaseOrder.storeId !== target.storeNode.store.id) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt "${payload.goodsReceiptNo}" targeted a purchase order assigned to another store.`,
        false,
      );
    }

    if (purchaseOrder.inventoryLocationId !== inventoryLocation.id) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt "${payload.goodsReceiptNo}" targeted ${payload.inventoryLocationCode}, but its purchase order is assigned to another location.`,
        false,
      );
    }

    if (
      purchaseOrder.status === PurchaseOrderStatus.DRAFT ||
      purchaseOrder.status === PurchaseOrderStatus.CLOSED ||
      purchaseOrder.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Purchase order "${purchaseOrder.purchaseOrderNo}" is not open for receiving.`,
        false,
      );
    }

    if (
      purchaseOrder.supplierId &&
      supplier &&
      purchaseOrder.supplierId !== supplier.id
    ) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt "${payload.goodsReceiptNo}" referenced a supplier that does not match the purchase order.`,
        false,
      );
    }
  }

  const purchaseOrderLineMetrics = new Map<
    string,
    {
      orderedQuantity: number;
      receivedQuantity: number;
      exceptionQuantity: number;
    }
  >(
    (purchaseOrder?.lines ?? []).map((line) => [
      line.id,
      {
        orderedQuantity: Number(line.orderedQuantity),
        receivedQuantity: Number(line.receivedQuantity),
        exceptionQuantity: Number(line.exceptionQuantity),
      },
    ]),
  );
  const purchaseOrderLinesByProductId = new Map(
    (purchaseOrder?.lines ?? []).map((line) => [line.productId, line] as const),
  );
  const occurredAt = new Date(payload.receivedAt);
  const postedAt = new Date();
  const postStockImmediately = await shouldPostStockImmediately(
    tx,
    target.storeNode.retailOrgId,
    target.storeNode.store.id,
  );
  const receiptExternalReference =
    payload.externalReference ?? payload.goodsReceiptNo;

  if (
    payload.exceptions.length > 0 &&
    !supplier &&
    !purchaseOrder?.supplierId
  ) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Goods receipt "${payload.goodsReceiptNo}" needs a supplier before Flash ERP can project supplier claims for receipt exceptions.`,
      false,
    );
  }

  for (const line of payload.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt line ${line.lineNo} needs a quantity greater than zero.`,
        false,
      );
    }

    const product = productsByCode.get(line.productCode);

    if (!product) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not resolve product "${line.productCode}" in the enterprise catalog yet.`,
        true,
      );
    }

    const purchaseOrderLine =
      line.purchaseOrderLineId &&
      purchaseOrderLineMetrics.has(line.purchaseOrderLineId)
        ? (purchaseOrder?.lines.find(
            (candidate) => candidate.id === line.purchaseOrderLineId,
          ) ?? null)
        : purchaseOrder
          ? (purchaseOrderLinesByProductId.get(product.id) ?? null)
          : null;

    if (purchaseOrder && !purchaseOrderLine) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt "${payload.goodsReceiptNo}" referenced a purchase-order line that enterprise could not match.`,
        false,
      );
    }

    if (purchaseOrderLine) {
      const lineMetrics = purchaseOrderLineMetrics.get(purchaseOrderLine.id);

      if (!lineMetrics) {
        throw new StoreProjectionError(
          "DEPENDENCY_MISSING",
          `Flash ERP could not find live purchase-order metrics for line "${purchaseOrderLine.id}".`,
          true,
        );
      }

      const outstandingQuantity = Number(
        Math.max(
          0,
          lineMetrics.orderedQuantity -
            lineMetrics.receivedQuantity -
            lineMetrics.exceptionQuantity,
        ).toFixed(3),
      );

      if (line.quantity - outstandingQuantity > 0.0001) {
        throw new StoreProjectionError(
          "POLICY_REJECTED",
          `Goods receipt "${payload.goodsReceiptNo}" exceeds the outstanding quantity on ${purchaseOrder?.purchaseOrderNo}.`,
          false,
        );
      }

      lineMetrics.receivedQuantity = Number(
        (lineMetrics.receivedQuantity + line.quantity).toFixed(3),
      );
    }

    if (product.isSerialized) {
      if (!Number.isInteger(line.quantity)) {
        throw new StoreProjectionError(
          "INVALID_PAYLOAD",
          `Serialized product "${product.code}" needs a whole-number receipt quantity.`,
          false,
        );
      }

      if (line.serialNumbers.length !== line.quantity) {
        throw new StoreProjectionError(
          "INVALID_PAYLOAD",
          `Serialized product "${product.code}" needs ${line.quantity} serial number(s) on goods receipt "${payload.goodsReceiptNo}".`,
          false,
        );
      }

      const existingSerialUnits = await tx.inventorySerialUnit.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          productId: product.id,
          serialNumber: {
            in: line.serialNumbers,
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingSerialUnits.length > 0) {
        throw new StoreProjectionError(
          "POLICY_REJECTED",
          `Flash ERP already knows serial number(s) ${existingSerialUnits
            .map((item) => item.serialNumber)
            .join(", ")} for ${product.name}.`,
          false,
        );
      }
    } else if (line.serialNumbers.length > 0) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Product "${product.code}" is not serialized, so its receipt line cannot include serial numbers.`,
        false,
      );
    }
  }

  for (const exception of payload.exceptions) {
    if (!Number.isFinite(exception.quantity) || exception.quantity <= 0) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Receipt exception line ${exception.lineNo} needs a quantity greater than zero.`,
        false,
      );
    }

    const product = productsByCode.get(exception.productCode);

    if (!product) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not resolve product "${exception.productCode}" in the enterprise catalog yet.`,
        true,
      );
    }

    const purchaseOrderLine =
      exception.purchaseOrderLineId &&
      purchaseOrderLineMetrics.has(exception.purchaseOrderLineId)
        ? (purchaseOrder?.lines.find(
            (candidate) => candidate.id === exception.purchaseOrderLineId,
          ) ?? null)
        : purchaseOrder
          ? (purchaseOrderLinesByProductId.get(product.id) ?? null)
          : null;

    if (purchaseOrder && !purchaseOrderLine) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Goods receipt "${payload.goodsReceiptNo}" referenced a purchase-order line exception that enterprise could not match.`,
        false,
      );
    }

    const claimReason = toSupplierClaimReason(exception.reason);

    if (product.isSerialized && !Number.isInteger(exception.quantity)) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized product "${product.code}" needs a whole-number exception quantity.`,
        false,
      );
    }

    if (!purchaseOrderLine) {
      continue;
    }

    const lineMetrics = purchaseOrderLineMetrics.get(purchaseOrderLine.id);

    if (!lineMetrics) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not find live purchase-order metrics for exception line "${purchaseOrderLine.id}".`,
        true,
      );
    }

    const outstandingQuantity = Number(
      Math.max(
        0,
        lineMetrics.orderedQuantity -
          lineMetrics.receivedQuantity -
          lineMetrics.exceptionQuantity,
      ).toFixed(3),
    );

    if (exception.quantity - outstandingQuantity > 0.0001) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Receipt exception on "${payload.goodsReceiptNo}" exceeds the outstanding quantity on ${purchaseOrder?.purchaseOrderNo ?? "the purchase order"}.`,
        false,
      );
    }

    lineMetrics.exceptionQuantity = Number(
      (lineMetrics.exceptionQuantity + exception.quantity).toFixed(3),
    );
  }

  await tx.goodsReceipt.create({
    data: {
      id: payload.goodsReceiptId,
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      warehouseId: inventoryLocation.warehouseId,
      inventoryLocationId: inventoryLocation.id,
      purchaseOrderId: purchaseOrder?.id ?? null,
      supplierId: supplier?.id ?? purchaseOrder?.supplierId ?? null,
      receiptNo: payload.goodsReceiptNo,
      externalReference: receiptExternalReference,
      note: payload.note,
      operatorName: payload.operatorName,
      stockUpdateStatus: postStockImmediately
        ? STOCK_UPDATE_STATUS_POSTED
        : STOCK_UPDATE_STATUS_PENDING,
      stockConfirmedAt: postStockImmediately ? postedAt : null,
      stockConfirmedBy: postStockImmediately ? payload.operatorName : null,
      receivedAt: occurredAt,
      postedAt,
      sourceNodeCode: target.storeNode.code,
    },
  });

  for (const line of payload.lines) {
    const product = productsByCode.get(line.productCode);

    if (!product) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not resolve product "${line.productCode}" in the enterprise catalog yet.`,
        true,
      );
    }

    const purchaseOrderLine =
      line.purchaseOrderLineId &&
      purchaseOrderLineMetrics.has(line.purchaseOrderLineId)
        ? (purchaseOrder?.lines.find(
            (candidate) => candidate.id === line.purchaseOrderLineId,
          ) ?? null)
        : purchaseOrder
          ? (purchaseOrderLinesByProductId.get(product.id) ?? null)
          : null;
    const ledgerEntryId = randomUUID();

    await tx.goodsReceiptLine.create({
      data: {
        id: line.goodsReceiptLineId,
        goodsReceiptId: payload.goodsReceiptId,
        purchaseOrderLineId: purchaseOrderLine?.id ?? null,
        productId: product.id,
        lineNo: line.lineNo,
        quantity: toQuantityString(line.quantity),
        unitCost:
          line.unitCost === null
            ? (product.baseCostPrice?.toString() ?? null)
            : toMoneyString(line.unitCost),
        ...(line.serialNumbers.length > 0
          ? { serialNumbersSnapshot: serializeJsonField(line.serialNumbers) }
          : {}),
      },
    });

    if (postStockImmediately) {
      await tx.inventoryLedgerEntry.create({
        data: {
          id: ledgerEntryId,
          retailOrgId: target.storeNode.retailOrgId,
          storeId: target.storeNode.store.id,
          warehouseId: inventoryLocation.warehouseId,
          inventoryLocationId: inventoryLocation.id,
          productId: product.id,
          movementType: InventoryMovementType.GOODS_RECEIPT,
          quantity: toQuantityString(line.quantity),
          unitCost:
            line.unitCost === null
              ? (product.baseCostPrice?.toString() ?? null)
              : toMoneyString(line.unitCost),
          referenceType: "GOODS_RECEIPT",
          referenceId: payload.goodsReceiptId,
          externalReference: receiptExternalReference,
          sourceNodeCode: target.storeNode.code,
          occurredAt,
        },
      });
    }

    if (postStockImmediately && product.isSerialized) {
      await applyEnterpriseSerializedLedgerMovement(tx, {
        retailOrgId: target.storeNode.retailOrgId,
        storeId: target.storeNode.store.id,
        warehouseId: inventoryLocation.warehouseId ?? null,
        inventoryLocationId: inventoryLocation.id,
        productId: product.id,
        movementType: InventoryMovementType.GOODS_RECEIPT,
        serialNumbers: line.serialNumbers,
        sourceReferenceType: "GOODS_RECEIPT",
        sourceReferenceId: payload.goodsReceiptId,
        sourceReferenceLabel: receiptExternalReference,
        sourceNodeCode: target.storeNode.code,
        occurredAt,
      });
    }
  }

  if (payload.exceptions.length > 0) {
    const supplierId = supplier?.id ?? purchaseOrder?.supplierId ?? null;

    if (!supplierId) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Goods receipt "${payload.goodsReceiptNo}" cannot create a supplier claim without a supplier.`,
        false,
      );
    }

    const supplierClaimId = randomUUID();

    await tx.supplierClaim.create({
      data: {
        id: supplierClaimId,
        retailOrgId: target.storeNode.retailOrgId,
        storeId: target.storeNode.store.id,
        warehouseId: inventoryLocation.warehouseId,
        inventoryLocationId: inventoryLocation.id,
        supplierId,
        purchaseOrderId: purchaseOrder?.id ?? null,
        goodsReceiptId: payload.goodsReceiptId,
        claimNo: buildSupplierClaimNo(inventoryLocation.code, postedAt),
        externalReference: receiptExternalReference,
        note:
          payload.note ??
          `Receipt exceptions were reported locally against ${payload.goodsReceiptNo} from ${target.storeNode.code}.`,
        operatorName: payload.operatorName,
        sourceNodeCode: target.storeNode.code,
      },
    });

    for (const exception of payload.exceptions) {
      const product = productsByCode.get(exception.productCode);

      if (!product) {
        throw new StoreProjectionError(
          "DEPENDENCY_MISSING",
          `Flash ERP could not resolve product "${exception.productCode}" in the enterprise catalog yet.`,
          true,
        );
      }

      const purchaseOrderLine =
        exception.purchaseOrderLineId &&
        purchaseOrderLineMetrics.has(exception.purchaseOrderLineId)
          ? (purchaseOrder?.lines.find(
              (candidate) => candidate.id === exception.purchaseOrderLineId,
            ) ?? null)
          : purchaseOrder
            ? (purchaseOrderLinesByProductId.get(product.id) ?? null)
            : null;

      await tx.supplierClaimLine.create({
        data: {
          id: exception.receiptExceptionId,
          supplierClaimId,
          purchaseOrderLineId: purchaseOrderLine?.id ?? null,
          goodsReceiptLineId: null,
          productId: product.id,
          lineNo: exception.lineNo,
          quantity: toQuantityString(exception.quantity),
          unitCost:
            exception.unitCost === null
              ? (product.baseCostPrice?.toString() ?? null)
              : toMoneyString(exception.unitCost),
          reason: toSupplierClaimReason(exception.reason),
          note: exception.note,
        },
      });
    }
  }

  if (purchaseOrder) {
    const touchedPurchaseOrderLineIds = [
      ...new Set(
        [
          ...payload.lines.map((line) => line.purchaseOrderLineId),
          ...payload.exceptions.map((line) => line.purchaseOrderLineId),
        ].filter((lineId): lineId is string => typeof lineId === "string"),
      ),
    ];

    for (const purchaseOrderLineId of touchedPurchaseOrderLineIds) {
      const lineMetrics = purchaseOrderLineMetrics.get(purchaseOrderLineId);

      if (!lineMetrics) {
        throw new StoreProjectionError(
          "DEPENDENCY_MISSING",
          `Flash ERP could not find purchase-order line metrics for "${purchaseOrderLineId}".`,
          true,
        );
      }

      await tx.purchaseOrderLine.update({
        where: {
          id: purchaseOrderLineId,
        },
        data: {
          receivedQuantity: toQuantityString(lineMetrics.receivedQuantity),
          exceptionQuantity: toQuantityString(lineMetrics.exceptionQuantity),
        },
      });
    }
  }

  if (purchaseOrder) {
    const nextStatus = derivePurchaseOrderStatus({
      currentStatus: purchaseOrder.status,
      committedAt: purchaseOrder.committedAt,
      closedAt: purchaseOrder.closedAt,
      lines: [...purchaseOrderLineMetrics.values()],
    });

    await tx.purchaseOrder.update({
      where: {
        id: purchaseOrder.id,
      },
      data: {
        status: nextStatus,
      },
    });

    await queuePurchaseOrderPublication(tx, {
      purchaseOrderId: purchaseOrder.id,
      publishedAt: postedAt,
    });
  }

  return true;
}

async function projectStoreSupplierReturn(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreSupplierReturnRecordedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.supplierReturnId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier return packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const existingReturn = await tx.supplierReturn.findUnique({
    where: {
      id: payload.supplierReturnId,
    },
    select: {
      id: true,
      storeId: true,
      sourceNodeCode: true,
    },
  });

  if (existingReturn) {
    if (
      existingReturn.storeId === target.storeNode.store.id &&
      existingReturn.sourceNodeCode === target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has supplier return "${payload.supplierReturnNo}" from another source.`,
      false,
    );
  }

  if (!payload.goodsReceiptId || !payload.goodsReceiptNo) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier return "${payload.supplierReturnNo}" must reference the original goods receipt.`,
      false,
    );
  }

  const inventoryLocation = await resolveInventoryLocation(
    tx,
    target,
    payload.inventoryLocationCode,
  );
  const productsByCode = await resolveProductsByCode(
    tx,
    target.storeNode.retailOrgId,
    payload.lines.map((line) => line.productCode),
  );
  const supplier = await tx.supplier.findFirst({
    where: {
      retailOrgId: target.storeNode.retailOrgId,
      supplierNo: payload.supplierNo,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      supplierNo: true,
    },
  });

  if (!supplier) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve supplier "${payload.supplierNo}" in enterprise yet.`,
      true,
    );
  }

  const goodsReceipt = await tx.goodsReceipt.findUnique({
    where: {
      id: payload.goodsReceiptId,
    },
    select: {
      id: true,
      receiptNo: true,
      storeId: true,
      inventoryLocationId: true,
      supplierId: true,
      purchaseOrderId: true,
      lines: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitCost: true,
          purchaseOrderLineId: true,
          serialNumbersSnapshot: true,
        },
      },
    },
  });

  if (!goodsReceipt) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find goods receipt "${payload.goodsReceiptId}" in enterprise yet.`,
      true,
    );
  }

  if (goodsReceipt.receiptNo !== payload.goodsReceiptNo) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier return "${payload.supplierReturnNo}" referenced goods receipt "${payload.goodsReceiptNo}" but enterprise resolved "${goodsReceipt.receiptNo}".`,
      false,
    );
  }

  if (goodsReceipt.storeId !== target.storeNode.store.id) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier return "${payload.supplierReturnNo}" targeted a goods receipt assigned to another store.`,
      false,
    );
  }

  if (goodsReceipt.inventoryLocationId !== inventoryLocation.id) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier return "${payload.supplierReturnNo}" targeted ${payload.inventoryLocationCode}, but its goods receipt belongs to another location.`,
      false,
    );
  }

  if (goodsReceipt.supplierId !== supplier.id) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier return "${payload.supplierReturnNo}" referenced a supplier that does not match the source goods receipt.`,
      false,
    );
  }

  const purchaseOrder =
    payload.purchaseOrderId || goodsReceipt.purchaseOrderId
      ? await tx.purchaseOrder.findUnique({
          where: {
            id: payload.purchaseOrderId ?? goodsReceipt.purchaseOrderId ?? "",
          },
          select: {
            id: true,
            purchaseOrderNo: true,
            storeId: true,
            inventoryLocationId: true,
            supplierId: true,
          },
        })
      : null;

  if (payload.purchaseOrderId && !purchaseOrder) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find purchase order "${payload.purchaseOrderId}" in enterprise yet.`,
      true,
    );
  }

  if (purchaseOrder) {
    if (
      payload.purchaseOrderNo &&
      purchaseOrder.purchaseOrderNo !== payload.purchaseOrderNo
    ) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" referenced purchase order "${payload.purchaseOrderNo}" but enterprise resolved "${purchaseOrder.purchaseOrderNo}".`,
        false,
      );
    }

    if (purchaseOrder.storeId !== target.storeNode.store.id) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" targeted a purchase order assigned to another store.`,
        false,
      );
    }

    if (purchaseOrder.inventoryLocationId !== inventoryLocation.id) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" targeted ${payload.inventoryLocationCode}, but its purchase order belongs to another location.`,
        false,
      );
    }

    if (purchaseOrder.supplierId && purchaseOrder.supplierId !== supplier.id) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" referenced a supplier that does not match the purchase order.`,
        false,
      );
    }
  }

  const goodsReceiptLineIds = payload.lines
    .map((line) => line.goodsReceiptLineId)
    .filter(
      (lineId): lineId is string =>
        typeof lineId === "string" && lineId.length > 0,
    );
  const priorReturnLines =
    goodsReceiptLineIds.length > 0
      ? await tx.supplierReturnLine.findMany({
          where: {
            goodsReceiptLineId: {
              in: goodsReceiptLineIds,
            },
            supplierReturn: {
              status: SupplierReturnStatus.POSTED,
            },
          },
          select: {
            goodsReceiptLineId: true,
            quantity: true,
            serialNumbersSnapshot: true,
          },
        })
      : [];
  const returnedQuantityByReceiptLineId = new Map<string, number>();
  const returnedSerialKeysByReceiptLineId = new Map<string, Set<string>>();

  for (const line of priorReturnLines) {
    if (!line.goodsReceiptLineId) {
      continue;
    }

    returnedQuantityByReceiptLineId.set(
      line.goodsReceiptLineId,
      Number(
        (
          (returnedQuantityByReceiptLineId.get(line.goodsReceiptLineId) ?? 0) +
          Number(line.quantity)
        ).toFixed(3),
      ),
    );

    const returnedKeys =
      returnedSerialKeysByReceiptLineId.get(line.goodsReceiptLineId) ??
      new Set<string>();
    for (const serialNumber of toOptionalStringArraySnapshot(
      line.serialNumbersSnapshot,
    )) {
      returnedKeys.add(serialNumber.toUpperCase());
    }
    returnedSerialKeysByReceiptLineId.set(
      line.goodsReceiptLineId,
      returnedKeys,
    );
  }

  const returnedAt = new Date(payload.returnedAt);
  const postedAt = new Date();
  const supplierReturnExternalReference =
    payload.externalReference ?? payload.supplierReturnNo;

  for (const line of payload.lines) {
    if (!line.goodsReceiptLineId) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" must link every line to its source goods-receipt line.`,
        false,
      );
    }

    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return line ${line.lineNo} needs a quantity greater than zero.`,
        false,
      );
    }

    const product = productsByCode.get(line.productCode);

    if (!product) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not resolve product "${line.productCode}" in the enterprise catalog yet.`,
        true,
      );
    }

    const goodsReceiptLine = goodsReceipt.lines.find(
      (candidate) => candidate.id === line.goodsReceiptLineId,
    );

    if (!goodsReceiptLine) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" referenced a goods-receipt line that enterprise could not match.`,
        false,
      );
    }

    if (goodsReceiptLine.productId !== product.id) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" linked ${line.productCode} to the wrong goods-receipt line.`,
        false,
      );
    }

    if (
      line.purchaseOrderLineId &&
      goodsReceiptLine.purchaseOrderLineId &&
      line.purchaseOrderLineId !== goodsReceiptLine.purchaseOrderLineId
    ) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Supplier return "${payload.supplierReturnNo}" carried a purchase-order line that does not match the source goods receipt.`,
        false,
      );
    }

    const alreadyReturnedQuantity =
      returnedQuantityByReceiptLineId.get(goodsReceiptLine.id) ?? 0;
    const outstandingReturnQuantity = Number(
      Math.max(
        0,
        Number(goodsReceiptLine.quantity) - alreadyReturnedQuantity,
      ).toFixed(3),
    );

    if (line.quantity - outstandingReturnQuantity > 0.0001) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Supplier return "${payload.supplierReturnNo}" exceeds the remaining returnable quantity on ${payload.goodsReceiptNo}.`,
        false,
      );
    }

    const onHandQuantity = await getInventoryLocationOnHandQuantity(
      tx,
      target.storeNode.retailOrgId,
      inventoryLocation.id,
      product.id,
    );

    if (line.quantity - onHandQuantity > 0.0001) {
      throw new StoreProjectionError(
        "POLICY_REJECTED",
        `Supplier return "${payload.supplierReturnNo}" exceeds the current on-hand quantity for ${product.code} in ${payload.inventoryLocationCode}.`,
        false,
      );
    }

    if (product.isSerialized) {
      if (!Number.isInteger(line.quantity)) {
        throw new StoreProjectionError(
          "INVALID_PAYLOAD",
          `Serialized product "${product.code}" needs a whole-number supplier-return quantity.`,
          false,
        );
      }

      if (line.serialNumbers.length !== line.quantity) {
        throw new StoreProjectionError(
          "INVALID_PAYLOAD",
          `Serialized product "${product.code}" needs ${line.quantity} serial number(s) on supplier return "${payload.supplierReturnNo}".`,
          false,
        );
      }

      const receiptSerialNumbers = toOptionalStringArraySnapshot(
        goodsReceiptLine.serialNumbersSnapshot,
      );
      const receiptSerialKeys = new Set(
        receiptSerialNumbers.map((serialNumber) => serialNumber.toUpperCase()),
      );
      const alreadyReturnedSerialKeys =
        returnedSerialKeysByReceiptLineId.get(goodsReceiptLine.id) ??
        new Set<string>();
      const unknownSerialNumbers = line.serialNumbers.filter(
        (serialNumber) => !receiptSerialKeys.has(serialNumber.toUpperCase()),
      );

      if (unknownSerialNumbers.length > 0) {
        throw new StoreProjectionError(
          "POLICY_REJECTED",
          `Supplier return "${payload.supplierReturnNo}" referenced serial number(s) ${unknownSerialNumbers.join(", ")} that were not received on ${payload.goodsReceiptNo}.`,
          false,
        );
      }

      const previouslyReturnedSerialNumbers = line.serialNumbers.filter(
        (serialNumber) =>
          alreadyReturnedSerialKeys.has(serialNumber.toUpperCase()),
      );

      if (previouslyReturnedSerialNumbers.length > 0) {
        throw new StoreProjectionError(
          "POLICY_REJECTED",
          `Supplier return "${payload.supplierReturnNo}" already removed serial number(s) ${previouslyReturnedSerialNumbers.join(", ")} from ${payload.goodsReceiptNo}.`,
          false,
        );
      }

      const existingSerialUnits = await tx.inventorySerialUnit.findMany({
        where: {
          retailOrgId: target.storeNode.retailOrgId,
          productId: product.id,
          inventoryLocationId: inventoryLocation.id,
          status: SerialInventoryStatus.AVAILABLE,
          serialNumber: {
            in: line.serialNumbers,
          },
        },
        select: {
          serialNumber: true,
        },
      });
      const existingSerialKeys = new Set(
        existingSerialUnits.map((serial) => serial.serialNumber.toUpperCase()),
      );
      const missingSerialNumbers = line.serialNumbers.filter(
        (serialNumber) => !existingSerialKeys.has(serialNumber.toUpperCase()),
      );

      if (missingSerialNumbers.length > 0) {
        throw new StoreProjectionError(
          "POLICY_REJECTED",
          `Supplier return "${payload.supplierReturnNo}" could not find available serial number(s) ${missingSerialNumbers.join(", ")} in ${payload.inventoryLocationCode}.`,
          false,
        );
      }
    } else if (line.serialNumbers.length > 0) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Product "${product.code}" is not serialized, so its supplier-return line cannot include serial numbers.`,
        false,
      );
    }
  }

  await tx.supplierReturn.create({
    data: {
      id: payload.supplierReturnId,
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      warehouseId: inventoryLocation.warehouseId,
      inventoryLocationId: inventoryLocation.id,
      supplierId: supplier.id,
      purchaseOrderId:
        purchaseOrder?.id ?? goodsReceipt.purchaseOrderId ?? null,
      goodsReceiptId: goodsReceipt.id,
      supplierReturnNo: payload.supplierReturnNo,
      externalReference: supplierReturnExternalReference,
      reason: payload.reason,
      status: SupplierReturnStatus.POSTED,
      note: payload.note,
      operatorName: payload.operatorName,
      returnedAt,
      postedAt,
      sourceNodeCode: target.storeNode.code,
    },
  });

  for (const line of payload.lines) {
    const product = productsByCode.get(line.productCode);
    const goodsReceiptLine =
      line.goodsReceiptLineId === null
        ? null
        : (goodsReceipt.lines.find(
            (candidate) => candidate.id === line.goodsReceiptLineId,
          ) ?? null);
    const ledgerEntryId = randomUUID();

    if (!product || !goodsReceiptLine) {
      throw new StoreProjectionError(
        "DEPENDENCY_MISSING",
        `Flash ERP could not resolve the source goods-receipt line for supplier return "${payload.supplierReturnNo}".`,
        true,
      );
    }

    await tx.supplierReturnLine.create({
      data: {
        id: line.supplierReturnLineId,
        supplierReturnId: payload.supplierReturnId,
        goodsReceiptLineId: goodsReceiptLine.id,
        productId: product.id,
        lineNo: line.lineNo,
        quantity: toQuantityString(line.quantity),
        unitCost:
          line.unitCost === null
            ? (goodsReceiptLine.unitCost?.toString() ??
              product.baseCostPrice?.toString() ??
              null)
            : toMoneyString(line.unitCost),
        ...(line.serialNumbers.length > 0
          ? { serialNumbersSnapshot: serializeJsonField(line.serialNumbers) }
          : {}),
      },
    });

    await tx.inventoryLedgerEntry.create({
      data: {
        id: ledgerEntryId,
        retailOrgId: target.storeNode.retailOrgId,
        storeId: target.storeNode.store.id,
        warehouseId: inventoryLocation.warehouseId,
        inventoryLocationId: inventoryLocation.id,
        productId: product.id,
        movementType: InventoryMovementType.RETURN_TO_VENDOR,
        quantity: toQuantityString(
          toSignedInventoryQuantity(
            InventoryMovementType.RETURN_TO_VENDOR,
            line.quantity,
          ),
        ),
        unitCost:
          line.unitCost === null
            ? (goodsReceiptLine.unitCost?.toString() ??
              product.baseCostPrice?.toString() ??
              null)
            : toMoneyString(line.unitCost),
        referenceType: "SUPPLIER_RETURN",
        referenceId: payload.supplierReturnId,
        externalReference: supplierReturnExternalReference,
        sourceNodeCode: target.storeNode.code,
        occurredAt: returnedAt,
      },
    });

    if (product.isSerialized) {
      await applyEnterpriseSerializedLedgerMovement(tx, {
        retailOrgId: target.storeNode.retailOrgId,
        storeId: target.storeNode.store.id,
        warehouseId: inventoryLocation.warehouseId ?? null,
        inventoryLocationId: inventoryLocation.id,
        productId: product.id,
        movementType: InventoryMovementType.RETURN_TO_VENDOR,
        serialNumbers: line.serialNumbers,
        sourceReferenceType: "SUPPLIER_RETURN",
        sourceReferenceId: payload.supplierReturnId,
        sourceReferenceLabel: supplierReturnExternalReference,
        sourceNodeCode: target.storeNode.code,
        occurredAt: returnedAt,
      });
    }
  }

  return true;
}

async function projectStoreSupplierReturnCancellationAcknowledgement(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload =
    parseStoreSupplierReturnCancellationAcknowledgedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.supplierReturnId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier-return acknowledgement packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const supplierReturn = await tx.supplierReturn.findUnique({
    where: {
      id: payload.supplierReturnId,
    },
    select: {
      id: true,
      supplierReturnNo: true,
      storeId: true,
      status: true,
      cancelledAt: true,
      cancellationAcknowledgedAt: true,
      cancellationAcknowledgedByNodeCode: true,
    },
  });

  if (!supplierReturn) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find supplier return "${payload.supplierReturnId}" in enterprise yet.`,
      true,
    );
  }

  if (supplierReturn.supplierReturnNo !== payload.supplierReturnNo) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier-return acknowledgement referenced "${payload.supplierReturnNo}" but enterprise resolved "${supplierReturn.supplierReturnNo}".`,
      false,
    );
  }

  if (supplierReturn.storeId !== target.storeNode.store.id) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Supplier-return acknowledgement "${payload.supplierReturnNo}" targeted a return assigned to another store.`,
      false,
    );
  }

  if (
    supplierReturn.status !== SupplierReturnStatus.CANCELLED ||
    !supplierReturn.cancelledAt
  ) {
    throw new StoreProjectionError(
      "POLICY_REJECTED",
      `Supplier return "${payload.supplierReturnNo}" is not yet cancelled in enterprise, so Flash ERP cannot accept a store-side rehydration acknowledgement.`,
      false,
    );
  }

  if (supplierReturn.cancellationAcknowledgedAt) {
    if (
      supplierReturn.cancellationAcknowledgedByNodeCode ===
      target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already recorded a rehydration acknowledgement for supplier return "${payload.supplierReturnNo}" from another source.`,
      false,
    );
  }

  const acknowledgedAt = new Date(payload.acknowledgedAt);

  await tx.supplierReturn.update({
    where: {
      id: supplierReturn.id,
    },
    data: {
      cancellationAcknowledgedAt: acknowledgedAt,
      cancellationAcknowledgedByNodeCode: target.storeNode.code,
      cancellationAcknowledgedBy: payload.operatorName,
      cancellationAcknowledgementNote: payload.note,
    },
  });

  await queueSupplierReturnPublication(tx, {
    supplierReturnId: supplierReturn.id,
    publishedAt: acknowledgedAt,
  });

  return true;
}

async function projectStoreStockCountSession(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreStockCountSessionSubmittedPayload(event);

  assertStoreBinding(
    payload.storeCode,
    target,
    event.aggregateType,
    event.eventType,
  );
  assertTerminalBinding(
    payload.terminalCode,
    target,
    event.aggregateType,
    event.eventType,
  );

  if (!target.storeNode.store) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find a store binding for node "${target.storeNode.code}".`,
      true,
    );
  }

  if (payload.sessionId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Stock count session packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  if (payload.countedQuantity < 0) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      "Flash ERP needs a counted quantity of zero or greater for a stock count session.",
      false,
    );
  }

  const existingSession = await tx.stockCountSession.findUnique({
    where: {
      id: payload.sessionId,
    },
    select: {
      id: true,
      submittedByNodeCode: true,
      storeId: true,
    },
  });

  if (existingSession) {
    if (
      existingSession.storeId === target.storeNode.store.id &&
      existingSession.submittedByNodeCode === target.storeNode.code
    ) {
      return true;
    }

    throw new StoreProjectionError(
      "STALE_VERSION",
      `Flash ERP already has stock count session "${payload.sessionId}" from another source.`,
      false,
    );
  }

  const productsByCode = await resolveProductsByCode(
    tx,
    target.storeNode.retailOrgId,
    [payload.productCode],
  );
  const product = productsByCode.get(payload.productCode);

  if (!product) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not resolve product "${payload.productCode}" in the enterprise catalog yet.`,
      true,
    );
  }

  const inventoryLocation = await resolveInventoryLocation(
    tx,
    target,
    payload.inventoryLocationCode,
  );
  const previousSerialNumbers = normalizeSerialNumbers(
    payload.previousSerialNumbers,
  );
  const countedSerialNumbers = normalizeSerialNumbers(
    payload.countedSerialNumbers,
  );

  if (product.isSerialized) {
    if (
      !Number.isInteger(payload.previousQuantity) ||
      !Number.isInteger(payload.countedQuantity)
    ) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized product "${product.code}" needs whole-number quantities in stock count sessions.`,
        false,
      );
    }

    if (previousSerialNumbers.length !== payload.previousQuantity) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized stock count session "${payload.sessionNo}" needs ${payload.previousQuantity} previous serial number(s).`,
        false,
      );
    }

    if (countedSerialNumbers.length !== payload.countedQuantity) {
      throw new StoreProjectionError(
        "INVALID_PAYLOAD",
        `Serialized stock count session "${payload.sessionNo}" needs ${payload.countedQuantity} counted serial number(s).`,
        false,
      );
    }
  } else if (
    previousSerialNumbers.length > 0 ||
    countedSerialNumbers.length > 0
  ) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Product "${product.code}" is not serialized, so its stock count session should not include serial numbers.`,
      false,
    );
  }

  await tx.stockCountSession.create({
    data: {
      id: payload.sessionId,
      retailOrgId: target.storeNode.retailOrgId,
      storeId: target.storeNode.store.id,
      warehouseId: inventoryLocation.warehouseId,
      inventoryLocationId: inventoryLocation.id,
      productId: product.id,
      sessionNo: payload.sessionNo,
      status: StockCountSessionStatus.SUBMITTED,
      previousQuantity: toQuantityString(payload.previousQuantity),
      countedQuantity: toQuantityString(payload.countedQuantity),
      varianceQuantity: toQuantityString(payload.varianceQuantity),
      previousSerialNumbersSnapshot: previousSerialNumbers.length > 0 ? serializeJsonField(previousSerialNumbers) : undefined,
      countedSerialNumbersSnapshot: countedSerialNumbers.length > 0 ? serializeJsonField(countedSerialNumbers) : undefined,
      note: payload.note,
      operatorName: payload.operatorName,
      submittedByNodeCode: target.storeNode.code,
      submittedAt: new Date(payload.submittedAt),
    },
  });

  return true;
}

async function projectStoreSyncTaskCompletion(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  const payload = parseStoreSyncRecoveryTaskCompletedPayload(event);

  if (payload.taskId !== event.aggregateId) {
    throw new StoreProjectionError(
      "INVALID_PAYLOAD",
      `Recovery task completion packet "${event.eventId}" does not match aggregate id "${event.aggregateId}".`,
      false,
    );
  }

  const relatedTaskPacket = await tx.syncOutboxEvent.findFirst({
    where: {
      syncNodeId: target.enterpriseNode.id,
      targetNodeCode: target.storeNode.code,
      aggregateType: "syncTask",
      aggregateId: payload.taskId,
      eventType: "sync.task.requested",
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
    },
  });

  const relatedInboundEvent =
    payload.taskType === "REQUEST_UPSTREAM_RESEND"
      ? await tx.syncInboundEvent.findFirst({
          where: {
            id: payload.sourceInboundEventId,
            syncNodeId: target.enterpriseNode.id,
            sourceNodeCode: target.storeNode.code,
          },
          select: {
            id: true,
            aggregateType: true,
            eventType: true,
          },
        })
      : null;

  if (payload.taskType === "REQUEST_UPSTREAM_RESEND" && !relatedInboundEvent) {
    throw new StoreProjectionError(
      "DEPENDENCY_MISSING",
      `Flash ERP could not find the referenced inbound packet "${payload.sourceInboundEventId}" for this recovery task completion.`,
      true,
    );
  }

  await createOperatorAuditAction(tx, {
    syncNodeId: target.storeNode.id,
    syncOutboxEventId: relatedTaskPacket?.id ?? null,
    syncInboundEventId: relatedInboundEvent?.id ?? null,
    actionType: SyncOperatorActionType.STORE_TASK_COMPLETED,
    operatorName: target.storeNode.name,
    note: `${payload.storeNote} Replacement event ${payload.replacementEventId} (${payload.replacementIdempotencyKey}) was queued from the store desktop.`,
    aggregateType:
      relatedInboundEvent?.aggregateType ??
      (payload.taskType === "APPLY_INVENTORY_ADJUSTMENT" ||
      payload.taskType === "APPLY_COUNT_VARIANCE"
        ? "inventoryLedgerEntry"
        : payload.taskType === "APPLY_STOCK_TRANSFER"
          ? "inventoryTransfer"
          : "syncTask"),
    eventType:
      payload.taskType === "REQUEST_UPSTREAM_RESEND"
        ? payload.sourceEventType
        : getEnterpriseSyncTaskEventType(payload.taskType),
  });

  return true;
}

async function applyStoreUpstreamEventProjection(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  event: SyncEnvelope,
) {
  assertUpstreamSyncPolicy(event);

  if (
    event.aggregateType === "customerAccountEntry" &&
    event.eventType === "customer-account-entry.recorded"
  ) {
    return projectStoreCustomerAccountEntry(tx, target, event);
  }

  if (
    event.aggregateType === "salesOrder" &&
    (event.eventType === "sales-order.recorded" ||
      event.eventType === "sales-order.fulfilled" ||
      event.eventType === "sales-order.cancelled")
  ) {
    return projectStoreSalesOrder(tx, target, event);
  }

  if (
    event.aggregateType === "eodReconciliation" &&
    event.eventType === "eod-reconciliation.recorded"
  ) {
    return projectStoreEodReconciliation(tx, target, event);
  }

  if (
    event.aggregateType === "bankingDeposit" &&
    event.eventType === "banking-deposit.recorded"
  ) {
    return projectStoreBankingDeposit(tx, target, event);
  }

  if (
    event.aggregateType === "storeExpense" &&
    event.eventType === "store-expense.confirmed"
  ) {
    return projectStoreExpenseConfirmed(tx, target, event);
  }

  if (
    event.aggregateType === "posShift" &&
    event.eventType === "pos.shift.opened"
  ) {
    return projectStorePosShiftOpened(tx, target, event);
  }

  if (
    event.aggregateType === "posShift" &&
    event.eventType === "pos.shift.closed"
  ) {
    return projectStorePosShiftClosed(tx, target, event);
  }

  if (
    event.aggregateType === "posTransaction" &&
    event.eventType === "pos.transaction.completed"
  ) {
    return projectStorePosTransaction(tx, target, event);
  }

  if (
    event.aggregateType === "inventoryLedgerEntry" &&
    event.eventType === "inventory.ledger.recorded"
  ) {
    return projectStoreInventoryLedgerEntry(tx, target, event);
  }

  if (
    event.aggregateType === "inventoryTransfer" &&
    event.eventType === "inventory.transfer.recorded"
  ) {
    return projectStoreInventoryTransfer(tx, target, event);
  }

  if (
    event.aggregateType === "goodsReceipt" &&
    event.eventType === "goods-receipt.recorded"
  ) {
    return projectStoreGoodsReceipt(tx, target, event);
  }

  if (
    event.aggregateType === "supplierReturn" &&
    event.eventType === "supplier-return.recorded"
  ) {
    return projectStoreSupplierReturn(tx, target, event);
  }

  if (
    event.aggregateType === "supplierReturn" &&
    event.eventType === "supplier-return.cancellation-acknowledged"
  ) {
    return projectStoreSupplierReturnCancellationAcknowledgement(
      tx,
      target,
      event,
    );
  }

  if (
    event.aggregateType === "stockCountSession" &&
    event.eventType === "stock-count-session.submitted"
  ) {
    return projectStoreStockCountSession(tx, target, event);
  }

  if (
    event.aggregateType === "interStoreTransfer" &&
    event.eventType === "inter-store-transfer.requested"
  ) {
    return projectStoreInterStoreTransferRequest(tx, target, event);
  }

  if (
    event.aggregateType === "interStoreTransfer" &&
    event.eventType === "inter-store-transfer.issued"
  ) {
    return projectStoreInterStoreTransferIssue(tx, target, event);
  }

  if (
    event.aggregateType === "interStoreTransfer" &&
    event.eventType === "inter-store-transfer.received"
  ) {
    return projectStoreInterStoreTransferReceipt(tx, target, event);
  }

  if (
    event.aggregateType === "syncTask" &&
    event.eventType === "sync.task.completed"
  ) {
    return projectStoreSyncTaskCompletion(tx, target, event);
  }

  throw new StoreProjectionError(
    "POLICY_REJECTED",
    `Flash ERP does not have an enterprise projector for ${event.aggregateType}:${event.eventType}. Check the store app version and sync contract before retrying this packet.`,
    false,
  );
}

async function applyInboundProjectionEvent(
  tx: Prisma.TransactionClient | PrismaClient,
  target: StoreSyncTarget,
  inboundEvent: InboundProjectionEvent,
  now: Date,
) {
  const envelope: SyncEnvelope = {
    eventId: inboundEvent.id,
    idempotencyKey: inboundEvent.idempotencyKey,
    aggregateType: inboundEvent.aggregateType as SyncEnvelope["aggregateType"],
    aggregateId: inboundEvent.aggregateId,
    eventType: inboundEvent.eventType,
    originatingNodeCode: inboundEvent.sourceNodeCode,
    targetNodeCode: target.enterpriseNode.code,
    recordVersion: Math.max(1, inboundEvent.recordVersion),
    occurredAt: inboundEvent.occurredAt.toISOString(),
    payload: inboundEvent.payload,
  };

  try {
    const wasProjected = await applyStoreUpstreamEventProjection(
      tx,
      target,
      envelope,
    );

    await tx.syncInboundEvent.update({
      where: {
        id: inboundEvent.id,
      },
      data: {
        status: SyncEventStatus.ACKNOWLEDGED,
        appliedAt: wasProjected ? now : null,
        errorMessage: null,
      },
    });

    return {
      status: SyncEventStatus.ACKNOWLEDGED,
      appliedAt: wasProjected ? now : null,
      rejection: null,
    };
  } catch (error) {
    const rejection = toProjectionRejection(inboundEvent.id, error);
    const nextStatus = rejection.retryable
      ? SyncEventStatus.FAILED
      : SyncEventStatus.DEAD_LETTER;
    const ownershipRule = getOwnershipRule(inboundEvent.aggregateType);

    await tx.syncInboundEvent.update({
      where: {
        id: inboundEvent.id,
      },
      data: {
        status: nextStatus,
        appliedAt: null,
        errorMessage: rejection.message,
      },
    });

    await writeSyncSecurityEvent(tx, target, {
      severity: getRejectionSeverity(rejection),
      category: "Sync exceptions",
      action: "sync.inbound-projection.failed",
      targetType: inboundEvent.aggregateType,
      targetRef: inboundEvent.aggregateId,
      message: `${inboundEvent.sourceNodeCode} ${nextStatus.toLowerCase()} ${inboundEvent.aggregateType}:${inboundEvent.eventType} (${rejection.reasonCode}).`,
      details: {
        eventId: inboundEvent.id,
        idempotencyKey: inboundEvent.idempotencyKey,
        aggregateType: inboundEvent.aggregateType,
        aggregateId: inboundEvent.aggregateId,
        eventType: inboundEvent.eventType,
        sourceNodeCode: inboundEvent.sourceNodeCode,
        targetNodeCode: target.enterpriseNode.code,
        recordVersion: inboundEvent.recordVersion,
        status: nextStatus,
        reasonCode: rejection.reasonCode,
        retryable: rejection.retryable,
        errorMessage: rejection.message,
        ownership: ownershipRule
          ? {
              authority: ownershipRule.authority,
              upstreamFlow: ownershipRule.upstreamFlow,
              downstreamFlow: ownershipRule.downstreamFlow,
              conflictPolicy: ownershipRule.conflictPolicy,
              notes: ownershipRule.notes,
            }
          : null,
        payloadKeys: isRecord(inboundEvent.payload)
          ? Object.keys(inboundEvent.payload).sort()
          : [],
        error: describeErrorForLog(error),
      },
    });

    return {
      status: nextStatus,
      appliedAt: null,
      rejection,
    };
  }
}

export async function pushStoreNodeSync(
  nodeCode: string,
  input: StoreNodePushRequest,
): Promise<StoreNodePushResponse> {
  if (input.sourceNodeCode !== nodeCode) {
    throw new Error(
      "The request source node does not match the targeted store node.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const acceptedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];
    const rejected: SyncRejectedEnvelope[] = [];
    const acknowledgedDownstreamEventIds: string[] = [];
    const rejectedAcknowledgementIds: string[] = [];

    const updatedStoreNode = await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
        lastTelemetryAt: input.telemetry
          ? (toOptionalDate(input.telemetry.generatedAt) ?? now)
          : undefined,
        lastReportedHealth: input.telemetry?.health ?? undefined,
        lastReportedUpstreamQueued:
          input.telemetry?.queueMetrics.upstreamQueued ?? undefined,
        lastReportedUpstreamInFlight:
          input.telemetry?.queueMetrics.upstreamInFlight ?? undefined,
        lastReportedDownstreamQueued:
          input.telemetry?.queueMetrics.downstreamQueued ?? undefined,
        lastReportedDeadLetter:
          input.telemetry?.queueMetrics.deadLetter ?? undefined,
        lastReportedLastSyncAt: input.telemetry
          ? toOptionalDate(input.telemetry.lastSyncAt)
          : undefined,
        lastReportedLastLocalWriteAt: input.telemetry
          ? toOptionalDate(input.telemetry.lastLocalWriteAt)
          : undefined,
        nextScheduledSyncAt:
          input.telemetry && input.telemetry.nextScheduledSyncAt !== undefined
            ? toOptionalDate(input.telemetry.nextScheduledSyncAt)
            : undefined,
        lastManualSyncAt:
          input.telemetry && input.telemetry.lastManualSyncAt !== undefined
            ? toOptionalDate(input.telemetry.lastManualSyncAt)
            : undefined,
        lastAutoSyncAt:
          input.telemetry && input.telemetry.lastAutoSyncAt !== undefined
            ? toOptionalDate(input.telemetry.lastAutoSyncAt)
            : undefined,
      },
      select: syncNodePolicySelect,
    });

    for (const event of input.upstreamEvents) {
      if (event.originatingNodeCode !== nodeCode) {
        const rejection: SyncRejectedEnvelope = {
          eventId: event.eventId,
          reasonCode: "INVALID_PAYLOAD",
          message: "The upstream event origin does not match the store node.",
          retryable: false,
        };
        rejected.push(rejection);
        await writeSyncSecurityEvent(
          tx,
          { storeNode, enterpriseNode },
          {
            severity: SecurityLogSeverity.ERROR,
            category: "Sync exceptions",
            action: "sync.inbound-validation.rejected",
            targetType: event.aggregateType,
            targetRef: event.aggregateId,
            message: `${nodeCode} sent ${event.aggregateType}:${event.eventType} with mismatched origin "${event.originatingNodeCode}".`,
            details: {
              eventId: event.eventId,
              idempotencyKey: event.idempotencyKey,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              expectedSourceNodeCode: nodeCode,
              receivedSourceNodeCode: event.originatingNodeCode,
              reasonCode: rejection.reasonCode,
              retryable: rejection.retryable,
            },
          },
        );
        continue;
      }

      if (
        event.targetNodeCode &&
        event.targetNodeCode !== enterpriseNode.code
      ) {
        const rejection: SyncRejectedEnvelope = {
          eventId: event.eventId,
          reasonCode: "POLICY_REJECTED",
          message: "The upstream event is targeting the wrong enterprise node.",
          retryable: false,
        };
        rejected.push(rejection);
        await writeSyncSecurityEvent(
          tx,
          { storeNode, enterpriseNode },
          {
            severity: SecurityLogSeverity.ERROR,
            category: "Sync exceptions",
            action: "sync.inbound-validation.rejected",
            targetType: event.aggregateType,
            targetRef: event.aggregateId,
            message: `${nodeCode} sent ${event.aggregateType}:${event.eventType} to wrong enterprise target "${event.targetNodeCode}".`,
            details: {
              eventId: event.eventId,
              idempotencyKey: event.idempotencyKey,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              expectedTargetNodeCode: enterpriseNode.code,
              receivedTargetNodeCode: event.targetNodeCode,
              reasonCode: rejection.reasonCode,
              retryable: rejection.retryable,
            },
          },
        );
        continue;
      }

      if (isNonRetryableAggregateType(event.aggregateType)) {
        const rejection: SyncRejectedEnvelope = {
          eventId: event.eventId,
          reasonCode: "UNKNOWN_AGGREGATE",
          message: `Flash ERP does not recognize aggregate type "${event.aggregateType}".`,
          retryable: false,
        };
        rejected.push(rejection);
        await writeSyncSecurityEvent(
          tx,
          { storeNode, enterpriseNode },
          {
            severity: SecurityLogSeverity.ERROR,
            category: "Sync exceptions",
            action: "sync.inbound-validation.rejected",
            targetType: event.aggregateType,
            targetRef: event.aggregateId,
            message: `${nodeCode} sent unknown sync aggregate "${event.aggregateType}".`,
            details: {
              eventId: event.eventId,
              idempotencyKey: event.idempotencyKey,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              reasonCode: rejection.reasonCode,
              retryable: rejection.retryable,
            },
          },
        );
        continue;
      }

      const existing = await tx.syncInboundEvent.findUnique({
        where: {
          idempotencyKey: event.idempotencyKey,
        },
        select: {
          id: true,
          sourceNodeCode: true,
          aggregateType: true,
          aggregateId: true,
          eventType: true,
          idempotencyKey: true,
          recordVersion: true,
          payload: true,
          status: true,
          appliedAt: true,
          errorMessage: true,
          receivedAt: true,
        },
      });

      if (existing) {
        const canReprocessExisting =
          (existing.status === SyncEventStatus.FAILED ||
            existing.status === SyncEventStatus.DEAD_LETTER) &&
          existing.sourceNodeCode === nodeCode &&
          existing.aggregateType === event.aggregateType &&
          existing.aggregateId === event.aggregateId &&
          existing.eventType === event.eventType;

        if (canReprocessExisting) {
          await writeSyncSecurityEvent(
            tx,
            { storeNode, enterpriseNode },
            {
              severity: SecurityLogSeverity.WARNING,
              category: "Sync idempotency",
              action: "sync.inbound-duplicate.reprocessing",
              targetType: existing.aggregateType,
              targetRef: existing.aggregateId,
              message: `${nodeCode} resent failed idempotency key ${event.idempotencyKey}; Flash ERP is reprocessing existing packet ${existing.id}.`,
              details: {
                incomingEventId: event.eventId,
                existingEventId: existing.id,
                idempotencyKey: event.idempotencyKey,
                aggregateType: existing.aggregateType,
                aggregateId: existing.aggregateId,
                eventType: existing.eventType,
                previousStatus: existing.status,
                previousErrorMessage: existing.errorMessage,
              },
            },
          );

          await tx.syncInboundEvent.update({
            where: {
              id: existing.id,
            },
            data: {
              status: SyncEventStatus.IN_FLIGHT,
              appliedAt: null,
              errorMessage: null,
            },
          });

          const projection = await applyInboundProjectionEvent(
            tx,
            { storeNode, enterpriseNode },
            {
              id: existing.id,
              sourceNodeCode: existing.sourceNodeCode,
              aggregateType: existing.aggregateType,
              aggregateId: existing.aggregateId,
              eventType: existing.eventType,
              idempotencyKey: existing.idempotencyKey,
              recordVersion: existing.recordVersion,
              payload: existing.payload,
              occurredAt: existing.receivedAt,
            },
            now,
          );

          if (!projection.rejection) {
            acceptedEventIds.push(event.eventId);
          } else {
            rejected.push({
              ...projection.rejection,
              eventId: event.eventId,
            });
          }
          continue;
        }

        duplicateEventIds.push(event.eventId);
        await writeSyncSecurityEvent(
          tx,
          { storeNode, enterpriseNode },
          {
            severity:
              existing.status === SyncEventStatus.ACKNOWLEDGED
                ? SecurityLogSeverity.INFO
                : SecurityLogSeverity.WARNING,
            category: "Sync idempotency",
            action: "sync.inbound-duplicate.ignored",
            targetType: event.aggregateType,
            targetRef: event.aggregateId,
            message: `${nodeCode} resent idempotency key ${event.idempotencyKey}; Flash ERP kept existing packet ${existing.id}.`,
            details: {
              incomingEventId: event.eventId,
              existingEventId: existing.id,
              idempotencyKey: event.idempotencyKey,
              incomingAggregateType: event.aggregateType,
              incomingAggregateId: event.aggregateId,
              incomingEventType: event.eventType,
              existingAggregateType: existing.aggregateType,
              existingAggregateId: existing.aggregateId,
              existingEventType: existing.eventType,
              existingStatus: existing.status,
              existingAppliedAt: existing.appliedAt?.toISOString() ?? null,
              existingErrorMessage: existing.errorMessage,
            },
          },
        );
        continue;
      }

      const storedInboundEvent: InboundProjectionEvent = {
        id: event.eventId,
        sourceNodeCode: nodeCode,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        idempotencyKey: event.idempotencyKey,
        recordVersion: Math.max(1, event.recordVersion),
        payload: serializeRequiredJsonField(event.payload),
        occurredAt: toOptionalDate(event.occurredAt) ?? now,
      };

      await tx.syncInboundEvent.create({
        data: {
          id: storedInboundEvent.id,
          syncNodeId: enterpriseNode.id,
          sourceNodeCode: nodeCode,
          aggregateType: storedInboundEvent.aggregateType,
          aggregateId: storedInboundEvent.aggregateId,
          eventType: storedInboundEvent.eventType,
          idempotencyKey: storedInboundEvent.idempotencyKey,
          recordVersion: storedInboundEvent.recordVersion,
          payload: serializeRequiredJsonField(storedInboundEvent.payload),
          status: SyncEventStatus.IN_FLIGHT,
          receivedAt: now,
        },
      });

      const projection = await applyInboundProjectionEvent(
        tx,
        { storeNode, enterpriseNode },
        storedInboundEvent,
        now,
      );

      if (!projection.rejection) {
        acceptedEventIds.push(event.eventId);
      } else {
        rejected.push(projection.rejection);
      }
    }

    if (input.acknowledgedDownstreamEventIds.length > 0) {
      const requestedAcknowledgementIds = Array.from(
        new Set(input.acknowledgedDownstreamEventIds),
      );
      const acknowledgementRows = await tx.syncOutboxEvent.findMany({
        where: {
          id: {
            in: requestedAcknowledgementIds,
          },
          syncNodeId: enterpriseNode.id,
          targetNodeCode: nodeCode,
        },
        select: {
          id: true,
          status: true,
          aggregateType: true,
          aggregateId: true,
          eventType: true,
          attemptCount: true,
          lastAttemptAt: true,
        },
      });
      const acknowledgementById = new Map(
        acknowledgementRows.map((event) => [event.id, event]),
      );

      for (const eventId of requestedAcknowledgementIds) {
        const event = acknowledgementById.get(eventId);

        if (
          event &&
          (event.status === SyncEventStatus.IN_FLIGHT ||
            event.status === SyncEventStatus.ACKNOWLEDGED)
        ) {
          acknowledgedDownstreamEventIds.push(eventId);
        } else {
          rejectedAcknowledgementIds.push(eventId);
        }
      }

      if (acknowledgedDownstreamEventIds.length > 0) {
        await tx.syncOutboxEvent.updateMany({
          where: {
            id: {
              in: acknowledgedDownstreamEventIds,
            },
            syncNodeId: enterpriseNode.id,
            targetNodeCode: nodeCode,
            status: {
              not: SyncEventStatus.ACKNOWLEDGED,
            },
          },
          data: {
            status: SyncEventStatus.ACKNOWLEDGED,
            acknowledgedAt: now,
          },
        });
      }

      if (rejectedAcknowledgementIds.length > 0) {
        await writeSyncSecurityEvent(
          tx,
          { storeNode, enterpriseNode },
          {
            severity: SecurityLogSeverity.WARNING,
            category: "Sync acknowledgements",
            action: "sync.downstream-acknowledgement.rejected",
            targetType: "Sync outbox acknowledgement",
            targetRef: rejectedAcknowledgementIds[0] ?? null,
            message: `${nodeCode} acknowledged ${rejectedAcknowledgementIds.length} downstream packet(s) that were not in a deliverable in-flight state.`,
            details: {
              nodeCode,
              syncRunId: input.syncRunId ?? null,
              trigger: input.trigger ?? null,
              clientStartedAt: input.clientStartedAt ?? null,
              requestedAcknowledgementIds,
              acknowledgedDownstreamEventIds,
              rejectedAcknowledgementIds,
              knownEvents: acknowledgementRows.map((event) => ({
                eventId: event.id,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                status: event.status,
                attemptCount: event.attemptCount,
                lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null,
              })),
            },
          },
        );
      }
    }

    const checkpointEventId =
      input.upstreamEvents[input.upstreamEvents.length - 1]?.eventId ??
      acknowledgedDownstreamEventIds[
        acknowledgedDownstreamEventIds.length - 1
      ] ??
      null;
    const checkpointHasAppliedWork =
      input.upstreamEvents.length > 0 ||
      acknowledgedDownstreamEventIds.length > 0;
    const checkpointUpdate: Prisma.SyncInboxCheckpointUpdateInput = {
      lastReceivedAt: now,
      ...(checkpointEventId ? { lastEventId: checkpointEventId } : {}),
      ...(input.cursor ? { lastReceivedCursor: input.cursor } : {}),
      ...(checkpointHasAppliedWork ? { lastAppliedAt: now } : {}),
    };

    await tx.syncInboxCheckpoint.upsert({
      where: {
        syncNodeId_remoteNodeCode: {
          syncNodeId: enterpriseNode.id,
          remoteNodeCode: nodeCode,
        },
      },
      update: checkpointUpdate,
      create: {
        syncNodeId: enterpriseNode.id,
        remoteNodeCode: nodeCode,
        lastEventId: checkpointEventId,
        lastReceivedCursor: input.cursor,
        lastReceivedAt: now,
        lastAppliedAt: checkpointHasAppliedWork ? now : null,
      },
    });

    return {
      acceptedEventIds,
      duplicateEventIds,
      rejected,
      acknowledgedDownstreamEventIds,
      rejectedAcknowledgementIds,
      serverReceivedAt: now.toISOString(),
      serverProcessedAt: now.toISOString(),
      syncRunId: input.syncRunId ?? null,
      syncPolicy: toStoreNodeSyncPolicy(updatedStoreNode),
    };
  }, {
    maxWait: 5_000,
    timeout: 15_000,
  });
}

export async function pullStoreNodeSync(
  nodeCode: string,
  input: StoreNodePullRequest,
): Promise<StoreNodePullResponse> {
  await ensureProductVariantSalesOrderDepositSchemaCompatibility();

  if (input.sourceNodeCode !== nodeCode) {
    throw new Error(
      "The pull request source node does not match the targeted store node.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const limit = Math.max(
      1,
      Math.min(input.limit ?? 25, maxDownstreamPullLimit),
    );

    await queueAutomaticStoreMasterDataPublications(
      tx,
      { storeNode, enterpriseNode },
      now,
      {
        mode: input.cursor ? "delta" : "bootstrap",
      },
    );

    const updatedStoreNode = await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
      },
      select: syncNodePolicySelect,
    });

    const exhaustedEvents = await tx.syncOutboxEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: SyncEventStatus.IN_FLIGHT,
        attemptCount: {
          gte: MAX_SYNC_RETRY_ATTEMPTS,
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 100,
    });

    if (exhaustedEvents.length > 0) {
      await tx.syncOutboxEvent.updateMany({
        where: {
          id: {
            in: exhaustedEvents.map((event) => event.id),
          },
        },
        data: {
          status: SyncEventStatus.DEAD_LETTER,
        },
      });

      await writeSyncSecurityEvent(
        tx,
        { storeNode, enterpriseNode },
        {
          severity: SecurityLogSeverity.ERROR,
          category: "Sync network",
          action: "sync.downstream-dead-lettered",
          targetType: "Sync outbox batch",
          targetRef: exhaustedEvents[0]?.id ?? null,
          message: `${nodeCode} has ${exhaustedEvents.length} downstream packet(s) moved to dead letter after repeated unacknowledged delivery attempts.`,
          details: {
            nodeCode,
            syncRunId: input.syncRunId ?? null,
            trigger: input.trigger ?? null,
            maxRetryAttempts: MAX_SYNC_RETRY_ATTEMPTS,
            events: exhaustedEvents.slice(0, 20).map((event) => ({
              eventId: event.id,
              idempotencyKey: event.idempotencyKey,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              eventType: event.eventType,
              attemptCount: event.attemptCount,
              lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null,
              status: event.status,
            })),
          },
        },
      );
    }

    const pendingEvents = await tx.syncOutboxEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: SyncEventStatus.PENDING,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    const remainingLimit = Math.max(0, limit - pendingEvents.length);
    const forceInFlightRedelivery =
      input.trigger === "manual" || input.trigger === "tray";
    const earliestRetryCutoff = new Date(now.getTime() - getRetryDelayMs(0));
    const inFlightCandidates =
      remainingLimit > 0
        ? await tx.syncOutboxEvent.findMany({
            where: {
              syncNodeId: enterpriseNode.id,
              targetNodeCode: nodeCode,
              status: SyncEventStatus.IN_FLIGHT,
              attemptCount: {
                lt: MAX_SYNC_RETRY_ATTEMPTS,
              },
              ...(forceInFlightRedelivery
                ? {}
                : {
                    OR: [
                      { lastAttemptAt: null },
                      {
                        lastAttemptAt: {
                          lte: earliestRetryCutoff,
                        },
                      },
                    ],
                  }),
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: Math.max(remainingLimit * 10, remainingLimit),
          })
        : [];
    const dueInFlightEvents = inFlightCandidates
      .filter((event) => !shouldMoveToDeadLetter(event.attemptCount))
      .filter((event) => forceInFlightRedelivery || isDownstreamRetryDue(event, now))
      .slice(0, remainingLimit);
    const waitingRetrySeconds = inFlightCandidates
      .filter((event) => !forceInFlightRedelivery && !isDownstreamRetryDue(event, now))
      .map((event) => downstreamRetryAfterSeconds(event, now))
      .filter((value): value is number => typeof value === "number");
    const retryAfterSeconds =
      waitingRetrySeconds.length > 0 ? Math.min(...waitingRetrySeconds) : null;
    const events = [...pendingEvents, ...dueInFlightEvents]
      .sort((left, right) => {
        const dateDiff = left.createdAt.getTime() - right.createdAt.getTime();
        return dateDiff === 0 ? left.id.localeCompare(right.id) : dateDiff;
      })
      .slice(0, limit);
    const redeliveredEvents = events.filter(
      (event) =>
        event.status === SyncEventStatus.IN_FLIGHT && event.attemptCount > 0,
    );

    if (events.length > 0) {
      await tx.syncOutboxEvent.updateMany({
        where: {
          id: {
            in: events.map((event) => event.id),
          },
        },
        data: {
          status: SyncEventStatus.IN_FLIGHT,
          lastAttemptAt: now,
          attemptCount: {
            increment: 1,
          },
        },
      });

      if (redeliveredEvents.length > 0) {
        await writeSyncSecurityEvent(
          tx,
          { storeNode, enterpriseNode },
          {
            severity: SecurityLogSeverity.WARNING,
            category: "Sync network",
            action: "sync.downstream-redelivered",
            targetType: "Sync outbox batch",
            targetRef: redeliveredEvents[0]?.id ?? null,
            message: `${nodeCode} is redelivering ${redeliveredEvents.length} in-flight downstream packet(s); this usually means the previous pull was interrupted before acknowledgement.`,
            details: {
              nodeCode,
              redeliveredCount: redeliveredEvents.length,
              limit,
              events: redeliveredEvents.slice(0, 10).map((event) => ({
                eventId: event.id,
                idempotencyKey: event.idempotencyKey,
                aggregateType: event.aggregateType,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                attemptCountBeforeThisPull: event.attemptCount,
                retryDelayMsBeforeThisPull: getRetryDelayMs(event.attemptCount),
                lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null,
                status: event.status,
              })),
            },
          },
        );
      }
    }

    const checkpoint = await tx.syncInboxCheckpoint.findUnique({
      where: {
        syncNodeId_remoteNodeCode: {
          syncNodeId: enterpriseNode.id,
          remoteNodeCode: nodeCode,
        },
      },
      select: {
        lastEventId: true,
        remoteNodeCode: true,
        lastReceivedCursor: true,
        lastReceivedAt: true,
        lastAppliedAt: true,
      },
    });

    const batchEvents = events.map<SyncEnvelope>((event) => ({
      eventId: event.id,
      idempotencyKey: event.idempotencyKey,
      aggregateType: event.aggregateType as SyncEnvelope["aggregateType"],
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      originatingNodeCode: enterpriseNode.code,
      targetNodeCode: event.targetNodeCode,
      recordVersion: 1,
      occurredAt: event.createdAt.toISOString(),
      payload: event.payload,
    }));

    return {
      batch: {
        direction: "downstream",
        sourceNodeCode: enterpriseNode.code,
        targetNodeCode: nodeCode,
        cursor: batchEvents[batchEvents.length - 1]?.eventId ?? input.cursor,
        sentAt: now.toISOString(),
        events: batchEvents,
      },
      serverCheckpoint: toCheckpoint(checkpoint, enterpriseNode.code),
      serverReceivedAt: now.toISOString(),
      serverProcessedAt: now.toISOString(),
      retryAfterSeconds: events.length > 0 ? null : retryAfterSeconds,
      syncRunId: input.syncRunId ?? null,
      syncPolicy: toStoreNodeSyncPolicy(updatedStoreNode),
    };
  });
}

export async function replayStoreNodeDownstream(
  nodeCode: string,
  input?: StoreNodeReplayRequest | null,
): Promise<StoreNodeReplayResponse> {
  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const audit = toOperatorAuditInput(input);
    const stalledEvents = await tx.syncOutboxEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        status: {
          in: [SyncEventStatus.FAILED, SyncEventStatus.DEAD_LETTER],
        },
      },
      select: {
        id: true,
        aggregateType: true,
        eventType: true,
      },
    });

    if (stalledEvents.length > 0) {
      await tx.syncOutboxEvent.updateMany({
        where: {
          id: {
            in: stalledEvents.map((event) => event.id),
          },
        },
        data: {
          status: SyncEventStatus.PENDING,
          attemptCount: 0,
          acknowledgedAt: null,
          lastAttemptAt: null,
        },
      });

      for (const event of stalledEvents) {
        await createOperatorAuditAction(tx, {
          syncNodeId: storeNode.id,
          syncOutboxEventId: event.id,
          syncInboundEventId: null,
          actionType: SyncOperatorActionType.REPLAY_ESCALATIONS,
          operatorName: audit.operatorName,
          note: audit.note,
          aggregateType: event.aggregateType,
          eventType: event.eventType,
        });
      }
    }

    await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode,
      eventId: null,
      actionType: "REPLAY_ESCALATIONS",
      note: audit.note,
      operatorName: audit.operatorName,
      replayedCount: stalledEvents.length,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function replayStoreNodeDownstreamEvent(
  nodeCode: string,
  eventId: string,
  input?: StoreNodeReplayRequest | null,
): Promise<StoreNodeReplayResponse> {
  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const audit = toOperatorAuditInput(input);
    const event = await tx.syncOutboxEvent.findFirst({
      where: {
        id: eventId,
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
      },
      select: {
        id: true,
        aggregateType: true,
        eventType: true,
        status: true,
      },
    });

    if (!event) {
      throw new Error(
        `Flash ERP could not find downstream packet "${eventId}" for "${nodeCode}".`,
      );
    }

    if (
      event.status !== SyncEventStatus.FAILED &&
      event.status !== SyncEventStatus.DEAD_LETTER
    ) {
      throw new Error(
        `Downstream packet "${eventId}" cannot be replayed because it is currently ${event.status.toLowerCase()}.`,
      );
    }

    await tx.syncOutboxEvent.update({
      where: {
        id: event.id,
      },
      data: {
        status: SyncEventStatus.PENDING,
        attemptCount: 0,
        acknowledgedAt: null,
        lastAttemptAt: null,
      },
    });

    await createOperatorAuditAction(tx, {
      syncNodeId: storeNode.id,
      syncOutboxEventId: event.id,
      syncInboundEventId: null,
      actionType: SyncOperatorActionType.REPLAY_PACKET,
      operatorName: audit.operatorName,
      note: audit.note,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
    });

    await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode,
      eventId: event.id,
      actionType: "REPLAY_PACKET",
      note: audit.note,
      operatorName: audit.operatorName,
      replayedCount: 1,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function reprocessStoreInboundEvent(
  nodeCode: string,
  eventId: string,
  input?: StoreNodeInboundActionRequest | null,
): Promise<StoreNodeInboundActionResponse> {
  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const audit = toOperatorAuditInput(
      input,
      "Operator requested inbound packet reprocessing from the Flash ERP enterprise workspace.",
    );
    const inboundEvent = await tx.syncInboundEvent.findFirst({
      where: {
        id: eventId,
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: nodeCode,
      },
      select: {
        id: true,
        sourceNodeCode: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        idempotencyKey: true,
        recordVersion: true,
        payload: true,
        status: true,
        receivedAt: true,
      },
    });

    if (!inboundEvent) {
      throw new Error(
        `Flash ERP could not find inbound packet "${eventId}" for "${nodeCode}".`,
      );
    }

    if (
      inboundEvent.status !== SyncEventStatus.FAILED &&
      inboundEvent.status !== SyncEventStatus.DEAD_LETTER
    ) {
      throw new Error(
        `Inbound packet "${eventId}" cannot be reprocessed because it is currently ${inboundEvent.status.toLowerCase()}.`,
      );
    }

    await tx.syncInboundEvent.update({
      where: {
        id: inboundEvent.id,
      },
      data: {
        status: SyncEventStatus.IN_FLIGHT,
        appliedAt: null,
        errorMessage: null,
      },
    });

    const projection = await applyInboundProjectionEvent(
      tx,
      { storeNode, enterpriseNode },
      {
        id: inboundEvent.id,
        sourceNodeCode: inboundEvent.sourceNodeCode,
        aggregateType: inboundEvent.aggregateType,
        aggregateId: inboundEvent.aggregateId,
        eventType: inboundEvent.eventType,
        idempotencyKey: inboundEvent.idempotencyKey,
        recordVersion: inboundEvent.recordVersion,
        payload: inboundEvent.payload,
        occurredAt: inboundEvent.receivedAt,
      },
      now,
    );

    await createOperatorAuditAction(tx, {
      syncNodeId: storeNode.id,
      syncOutboxEventId: null,
      syncInboundEventId: inboundEvent.id,
      actionType: SyncOperatorActionType.REPROCESS_INBOUND_PACKET,
      operatorName: audit.operatorName,
      note: audit.note,
      aggregateType: inboundEvent.aggregateType,
      eventType: inboundEvent.eventType,
    });

    await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode,
      eventId: inboundEvent.id,
      actionType: "REPROCESS_INBOUND_PACKET",
      note: audit.note,
      operatorName: audit.operatorName,
      status: projection.status,
      appliedAt: projection.appliedAt?.toISOString() ?? null,
      message: projection.rejection
        ? projection.rejection.message
        : `Flash ERP reprocessed inbound packet "${inboundEvent.id}" successfully.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function requestStoreInboundEventResend(
  nodeCode: string,
  eventId: string,
  input?: StoreNodeInboundActionRequest | null,
): Promise<StoreNodeInboundActionResponse> {
  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const audit = toOperatorAuditInput(
      input,
      "Operator requested a clean upstream resend from the Flash ERP enterprise workspace.",
    );
    const inboundEvent = await tx.syncInboundEvent.findFirst({
      where: {
        id: eventId,
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: nodeCode,
      },
      select: {
        id: true,
        sourceNodeCode: true,
        aggregateType: true,
        aggregateId: true,
        eventType: true,
        recordVersion: true,
        payload: true,
        status: true,
        appliedAt: true,
      },
    });

    if (!inboundEvent) {
      throw new Error(
        `Flash ERP could not find inbound packet "${eventId}" for "${nodeCode}".`,
      );
    }

    if (
      inboundEvent.status !== SyncEventStatus.FAILED &&
      inboundEvent.status !== SyncEventStatus.DEAD_LETTER
    ) {
      throw new Error(
        `Inbound packet "${eventId}" cannot request resend because it is currently ${inboundEvent.status.toLowerCase()}.`,
      );
    }

    const payload = isRecord(inboundEvent.payload) ? inboundEvent.payload : {};
    const taskId = randomUUID();
    const taskPayload: EnterpriseSyncRecoveryTaskPayload = {
      taskId,
      taskType: "REQUEST_UPSTREAM_RESEND",
      sourceInboundEventId: inboundEvent.id,
      sourceEventType: inboundEvent.eventType,
      aggregateType: inboundEvent.aggregateType,
      aggregateId: inboundEvent.aggregateId,
      transactionNo: readFirstOptionalString(payload, [
        "transactionNo",
        "externalReference",
        "referenceId",
      ]),
      productCode:
        readOptionalString(payload, "productCode") ??
        (Array.isArray((payload as { lines?: unknown }).lines) &&
        (payload as { lines: unknown[] }).lines.length > 0 &&
        isRecord((payload as { lines: unknown[] }).lines[0])
          ? readFirstOptionalString((payload as { lines: Record<string, unknown>[] }).lines[0], [
              "productCode",
              "sku",
              "code",
            ])
          : null),
      title: "Resend required",
      instructions:
        "Enterprise could not trust the original packet. Review the local transaction or stock movement, then publish a clean replacement packet with a new idempotency key.",
      operatorName: audit.operatorName,
      note: audit.note,
      requestedAt: now.toISOString(),
      replacementAggregateType: inboundEvent.aggregateType,
      replacementAggregateId: inboundEvent.aggregateId,
      replacementEventType: inboundEvent.eventType,
      replacementRecordVersion: Math.max(1, inboundEvent.recordVersion + 1),
      replacementPayload: inboundEvent.payload,
    };
    const taskOutboxEventId = randomUUID();

    await tx.syncOutboxEvent.create({
      data: {
        id: taskOutboxEventId,
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        aggregateType: "syncTask",
        aggregateId: taskId,
        eventType: "sync.task.requested",
        idempotencyKey: `${enterpriseNode.code}:syncTask:request-upstream-resend:${taskId}`,
        payload: serializeRequiredJsonField(taskPayload),
        status: SyncEventStatus.PENDING,
      },
    });

    await createOperatorAuditAction(tx, {
      syncNodeId: storeNode.id,
      syncOutboxEventId: taskOutboxEventId,
      syncInboundEventId: inboundEvent.id,
      actionType: SyncOperatorActionType.REQUEST_UPSTREAM_RESEND,
      operatorName: audit.operatorName,
      note: audit.note,
      aggregateType: inboundEvent.aggregateType,
      eventType: inboundEvent.eventType,
    });

    await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode,
      eventId: inboundEvent.id,
      actionType: "REQUEST_UPSTREAM_RESEND",
      note: audit.note,
      operatorName: audit.operatorName,
      status: inboundEvent.status,
      appliedAt: inboundEvent.appliedAt?.toISOString() ?? null,
      message: `Flash ERP recorded a resend request for inbound packet "${inboundEvent.id}" and queued a recovery task for ${nodeCode}. The store should publish a clean replacement packet with a new idempotency key after the underlying issue is corrected.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function requestStoreDatabaseInstruction(
  nodeCode: string,
  input?: StoreDatabaseInstructionRequest | null,
): Promise<StoreDatabaseInstructionResponse> {
  return prisma.$transaction(async (tx) => {
    const { storeNode, enterpriseNode } = await getStoreSyncTarget(
      tx,
      nodeCode,
    );
    const now = new Date();
    const audit = toOperatorAuditInput(
      input,
      "Operator queued a database administration instruction from the Flash ERP enterprise workspace.",
    );
    const instructionType = normalizeDatabaseInstructionType(
      input?.instructionType,
    );
    const priority = normalizeInstructionPriority(input?.priority);
    const taskId = randomUUID();
    const target = input?.target?.trim() || null;
    const taskPayload: EnterpriseSyncRecoveryTaskPayload = {
      taskId,
      taskType: "RUN_DATABASE_MAINTENANCE",
      sourceInboundEventId: `database-admin:${taskId}`,
      sourceEventType: "database.instruction.requested",
      aggregateType: "storeInstruction",
      aggregateId: taskId,
      transactionNo: null,
      productCode: null,
      title: `Database ${instructionType.toLowerCase().replace(/_/g, " ")}`,
      instructions:
        "HQ requested a database administration action for this store node. The desktop records the instruction and support operator acknowledgement through the sync recovery queue.",
      operatorName: audit.operatorName,
      note: audit.note,
      requestedAt: now.toISOString(),
      replacementAggregateType: "storeInstruction",
      replacementAggregateId: taskId,
      replacementEventType: "database.instruction.requested",
      replacementRecordVersion: 1,
      replacementPayload: {
        instructionType,
        target,
        priority,
        note: audit.note,
      },
      databaseInstruction: {
        instructionType,
        target,
        priority,
      },
    };

    await tx.syncOutboxEvent.create({
      data: {
        id: randomUUID(),
        syncNodeId: enterpriseNode.id,
        targetNodeCode: nodeCode,
        aggregateType: "syncTask",
        aggregateId: taskId,
        eventType: "sync.task.requested",
        idempotencyKey: `${enterpriseNode.code}:syncTask:database-instruction:${taskId}`,
        payload: serializeRequiredJsonField(taskPayload),
        status: SyncEventStatus.PENDING,
      },
    });

    await tx.syncNode.update({
      where: { id: storeNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode,
      taskId,
      instructionType,
      priority,
      message: `Flash ERP queued ${instructionType} for ${nodeCode}. The store desktop will receive it on the next sync pull.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function requestInventoryAdjustmentTask(
  locationCode: string,
  input: InventoryAdjustmentTaskRequest,
): Promise<InventoryAdjustmentTaskResponse> {
  return prisma.$transaction(async (tx) => {
    const requestedQuantity = Number(input.quantity);

    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new Error(
        "Inventory adjustment quantity must be greater than zero.",
      );
    }

    if (
      input.movementType !== InventoryMovementType.ADJUSTMENT_POSITIVE &&
      input.movementType !== InventoryMovementType.ADJUSTMENT_NEGATIVE
    ) {
      throw new Error(
        "Flash ERP only supports positive or negative inventory adjustments here.",
      );
    }

    const location = await tx.inventoryLocation.findFirst({
      where: {
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        store: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!location) {
      throw new Error(
        `Flash ERP could not find inventory location "${locationCode}".`,
      );
    }

    if (!location.storeId || !location.store) {
      throw new Error(
        `Inventory location "${locationCode}" is not attached to a store desktop workflow yet.`,
      );
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        `Flash ERP does not have an active primary enterprise node for location "${locationCode}".`,
      );
    }

    const targetStoreNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        storeId: location.storeId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        terminal: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!targetStoreNode || !targetStoreNode.terminal?.code) {
      throw new Error(
        `Flash ERP could not find an active desktop node with a terminal binding for ${location.store.name}.`,
      );
    }

    const product = await tx.product.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        code: input.productCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });

    if (!product) {
      throw new Error(
        `Flash ERP could not find active product "${input.productCode}" for inventory adjustment.`,
      );
    }
    const taskSerialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const quantity = product.isSerialized
      ? taskSerialNumbers.length
      : requestedQuantity;

    if (product.isSerialized) {
      if (!Number.isInteger(requestedQuantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number adjustment quantity.`,
        );
      }

      if (taskSerialNumbers.length === 0) {
        throw new Error(
          `Serialized product "${product.code}" needs exact serial numbers before Flash ERP can queue an adjustment task.`,
        );
      }

      if (requestedQuantity !== taskSerialNumbers.length) {
        throw new Error(
          `Serialized product "${product.code}" needs ${requestedQuantity} serial number(s) before Flash ERP can queue this adjustment task.`,
        );
      }
    } else if (taskSerialNumbers.length > 0) {
      throw new Error(
        `Product "${product.code}" is not serialized, so the adjustment task should not include serial numbers.`,
      );
    }

    const audit = toOperatorAuditInput(
      input,
      `Requesting ${quantity.toFixed(3)} units of ${product.name} as a ${
        input.movementType === InventoryMovementType.ADJUSTMENT_POSITIVE
          ? "positive"
          : "negative"
      } adjustment at ${location.name}.`,
    );
    const now = new Date();
    const taskId = randomUUID();
    const ledgerEntryId = `inventory-adjustment-${taskId}`;
    const taskPayload: EnterpriseInventoryAdjustmentTaskPayload = {
      taskId,
      taskType: "APPLY_INVENTORY_ADJUSTMENT",
      sourceInboundEventId: `enterprise-task:${taskId}`,
      sourceEventType: getEnterpriseSyncTaskEventType(
        "APPLY_INVENTORY_ADJUSTMENT",
      ),
      aggregateType: "inventoryLocation",
      aggregateId: location.id,
      transactionNo: null,
      productCode: product.code,
      locationCode: location.code,
      locationName: location.name,
      quantity,
      serialNumbers: taskSerialNumbers,
      movementType: input.movementType,
      title:
        input.movementType === InventoryMovementType.ADJUSTMENT_POSITIVE
          ? "Apply positive stock adjustment"
          : "Apply negative stock adjustment",
      instructions:
        input.movementType === InventoryMovementType.ADJUSTMENT_POSITIVE
          ? `Increase ${product.name} by ${quantity.toFixed(3)} units in ${location.name}${
              taskSerialNumbers.length > 0
                ? ` using serials ${taskSerialNumbers.join(", ")}`
                : ""
            }, then sync the adjustment upstream to enterprise.`
          : `Decrease ${product.name} by ${quantity.toFixed(3)} units in ${location.name}${
              taskSerialNumbers.length > 0
                ? ` using serials ${taskSerialNumbers.join(", ")}`
                : ""
            }, then sync the adjustment upstream to enterprise.`,
      operatorName: audit.operatorName,
      note: audit.note,
      requestedAt: now.toISOString(),
      replacementAggregateType: "inventoryLedgerEntry",
      replacementAggregateId: ledgerEntryId,
      replacementEventType: "inventory.ledger.recorded",
      replacementRecordVersion: 1,
      replacementPayload: {
        ledgerEntryId,
        storeCode: location.store.code,
        terminalCode: targetStoreNode.terminal.code,
        inventoryLocationCode: location.code,
        productCode: product.code,
        movementType: input.movementType,
        quantity,
        ...(taskSerialNumbers.length > 0
          ? { serialNumbers: taskSerialNumbers }
          : {}),
        unitCost:
          product.baseCostPrice === null ? null : Number(product.baseCostPrice),
        referenceType: "ENTERPRISE_TASK",
        referenceId: taskId,
        externalReference: `${enterpriseNode.name} adjustment • ${location.code} • ${product.code}`,
        occurredAt: now.toISOString(),
      } satisfies StoreInventoryLedgerRecordedPayload,
    };
    const taskOutboxEventId = randomUUID();

    await tx.syncOutboxEvent.create({
      data: {
        id: taskOutboxEventId,
        syncNodeId: enterpriseNode.id,
        targetNodeCode: targetStoreNode.code,
        aggregateType: "syncTask",
        aggregateId: taskId,
        eventType: "sync.task.requested",
        idempotencyKey: `${enterpriseNode.code}:syncTask:inventory-adjustment:${taskId}`,
        payload: serializeRequiredJsonField(taskPayload),
        status: SyncEventStatus.PENDING,
      },
    });

    await createOperatorAuditAction(tx, {
      syncNodeId: targetStoreNode.id,
      syncOutboxEventId: taskOutboxEventId,
      syncInboundEventId: null,
      actionType: getEnterpriseSyncTaskActionType("APPLY_INVENTORY_ADJUSTMENT"),
      operatorName: audit.operatorName,
      note: audit.note,
      aggregateType: "inventoryLocation",
      eventType: getEnterpriseSyncTaskEventType("APPLY_INVENTORY_ADJUSTMENT"),
    });

    await tx.syncNode.update({
      where: { id: targetStoreNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode: targetStoreNode.code,
      locationCode: location.code,
      taskId,
      actionType: "REQUEST_INVENTORY_ADJUSTMENT",
      taskType: "APPLY_INVENTORY_ADJUSTMENT",
      note: audit.note,
      operatorName: audit.operatorName,
      message: `Flash ERP queued an inventory adjustment task for ${product.name} at ${location.name} on ${targetStoreNode.code}. ${
        taskSerialNumbers.length > 0
          ? "The store desktop will validate the requested serials locally before applying it offline and syncing the resulting stock movement upstream."
          : "The store desktop can now apply it offline and sync the resulting stock movement upstream."
      }`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function requestInventoryCountVarianceTask(
  locationCode: string,
  input: InventoryCountVarianceTaskRequest,
): Promise<InventoryCountVarianceTaskResponse> {
  return prisma.$transaction(async (tx) => {
    const requestedCountedQuantity = Number(input.countedQuantity);

    if (
      !Number.isFinite(requestedCountedQuantity) ||
      requestedCountedQuantity < 0
    ) {
      throw new Error("Counted quantity must be zero or greater.");
    }

    const location = await tx.inventoryLocation.findFirst({
      where: {
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        store: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!location) {
      throw new Error(
        `Flash ERP could not find inventory location "${locationCode}".`,
      );
    }

    if (!location.storeId || !location.store) {
      throw new Error(
        `Inventory location "${locationCode}" is not attached to a store desktop workflow yet.`,
      );
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        `Flash ERP does not have an active primary enterprise node for location "${locationCode}".`,
      );
    }

    const targetStoreNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        storeId: location.storeId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        terminal: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!targetStoreNode || !targetStoreNode.terminal?.code) {
      throw new Error(
        `Flash ERP could not find an active desktop node with a terminal binding for ${location.store.name}.`,
      );
    }

    const product = await tx.product.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        code: input.productCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });

    if (!product) {
      throw new Error(
        `Flash ERP could not find active product "${input.productCode}" for count variance.`,
      );
    }
    const taskSerialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const countedQuantity = product.isSerialized
      ? taskSerialNumbers.length
      : requestedCountedQuantity;

    if (product.isSerialized) {
      if (!Number.isInteger(requestedCountedQuantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number counted quantity.`,
        );
      }

      if (taskSerialNumbers.length === 0 && requestedCountedQuantity > 0) {
        throw new Error(
          `Serialized product "${product.code}" needs counted serial numbers before Flash ERP can queue this variance task.`,
        );
      }

      if (requestedCountedQuantity !== taskSerialNumbers.length) {
        throw new Error(
          `Serialized product "${product.code}" needs ${requestedCountedQuantity} counted serial number(s) before Flash ERP can queue this variance task.`,
        );
      }
    } else if (taskSerialNumbers.length > 0) {
      throw new Error(
        `Product "${product.code}" is not serialized, so the count-variance task should not include serial numbers.`,
      );
    }

    const audit = toOperatorAuditInput(
      input,
      `Requesting a stock count confirmation of ${countedQuantity.toFixed(3)} units for ${product.name} in ${location.name}.`,
    );
    const now = new Date();
    const taskId = randomUUID();
    const ledgerEntryId = `inventory-count-variance-${taskId}`;
    const taskPayload: EnterpriseInventoryCountVarianceTaskPayload = {
      taskId,
      taskType: "APPLY_COUNT_VARIANCE",
      sourceInboundEventId: `enterprise-task:${taskId}`,
      sourceEventType: getEnterpriseSyncTaskEventType("APPLY_COUNT_VARIANCE"),
      aggregateType: "inventoryLocation",
      aggregateId: location.id,
      transactionNo: null,
      productCode: product.code,
      locationCode: location.code,
      locationName: location.name,
      quantity: countedQuantity,
      serialNumbers: taskSerialNumbers,
      movementType: "COUNT_VARIANCE",
      title: "Record stock count variance",
      instructions: `Count ${product.name} in ${location.name}, confirm ${countedQuantity.toFixed(3)} units locally${
        taskSerialNumbers.length > 0
          ? ` using serials ${taskSerialNumbers.join(", ")}`
          : ""
      }, and let Flash ERP sync only the resulting variance upstream.`,
      operatorName: audit.operatorName,
      note: audit.note,
      requestedAt: now.toISOString(),
      replacementAggregateType: "inventoryLedgerEntry",
      replacementAggregateId: ledgerEntryId,
      replacementEventType: "inventory.ledger.recorded",
      replacementRecordVersion: 1,
      replacementPayload: {
        ledgerEntryId,
        storeCode: location.store.code,
        terminalCode: targetStoreNode.terminal.code,
        inventoryLocationCode: location.code,
        productCode: product.code,
        movementType: "COUNT_VARIANCE",
        quantity: countedQuantity,
        countedQuantity,
        ...(taskSerialNumbers.length > 0
          ? { serialNumbers: taskSerialNumbers }
          : {}),
        unitCost:
          product.baseCostPrice === null ? null : Number(product.baseCostPrice),
        referenceType: "ENTERPRISE_TASK",
        referenceId: taskId,
        externalReference: `${enterpriseNode.name} count variance • ${location.code} • ${product.code}`,
        occurredAt: now.toISOString(),
      },
    };
    const taskOutboxEventId = randomUUID();

    await tx.syncOutboxEvent.create({
      data: {
        id: taskOutboxEventId,
        syncNodeId: enterpriseNode.id,
        targetNodeCode: targetStoreNode.code,
        aggregateType: "syncTask",
        aggregateId: taskId,
        eventType: "sync.task.requested",
        idempotencyKey: `${enterpriseNode.code}:syncTask:count-variance:${taskId}`,
        payload: serializeRequiredJsonField(taskPayload),
        status: SyncEventStatus.PENDING,
      },
    });

    await createOperatorAuditAction(tx, {
      syncNodeId: targetStoreNode.id,
      syncOutboxEventId: taskOutboxEventId,
      syncInboundEventId: null,
      actionType: getEnterpriseSyncTaskActionType("APPLY_COUNT_VARIANCE"),
      operatorName: audit.operatorName,
      note: audit.note,
      aggregateType: "inventoryLocation",
      eventType: getEnterpriseSyncTaskEventType("APPLY_COUNT_VARIANCE"),
    });

    await tx.syncNode.update({
      where: { id: targetStoreNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode: targetStoreNode.code,
      locationCode: location.code,
      taskId,
      actionType: "REQUEST_COUNT_VARIANCE",
      taskType: "APPLY_COUNT_VARIANCE",
      note: audit.note,
      operatorName: audit.operatorName,
      message: `Flash ERP queued a count-variance task for ${product.name} at ${location.name} on ${targetStoreNode.code}. ${
        taskSerialNumbers.length > 0
          ? "The store desktop will validate the counted serial list locally before syncing the resulting variance upstream."
          : "The store desktop can now confirm the local count offline and sync the resulting variance upstream."
      }`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function requestInventoryTransferTask(
  locationCode: string,
  input: InventoryTransferTaskRequest,
): Promise<InventoryTransferTaskResponse> {
  return prisma.$transaction(async (tx) => {
    const requestedQuantity = Number(input.quantity);

    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new Error("Transfer quantity must be greater than zero.");
    }

    const location = await tx.inventoryLocation.findFirst({
      where: {
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        store: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!location) {
      throw new Error(
        `Flash ERP could not find inventory location "${locationCode}".`,
      );
    }

    if (!location.storeId || !location.store) {
      throw new Error(
        `Inventory location "${locationCode}" is not attached to a store desktop workflow yet.`,
      );
    }

    const targetLocation = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        code: input.targetLocationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
      },
    });

    if (!targetLocation) {
      throw new Error(
        `Flash ERP could not find active target inventory location "${input.targetLocationCode}".`,
      );
    }

    if (targetLocation.id === location.id) {
      throw new Error(
        "Source and destination locations must be different for a stock transfer.",
      );
    }

    if (targetLocation.storeId !== location.storeId) {
      throw new Error(
        "Flash ERP currently supports inter-location transfers only within the same store desktop.",
      );
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        `Flash ERP does not have an active primary enterprise node for location "${locationCode}".`,
      );
    }

    const targetStoreNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        storeId: location.storeId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        terminal: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!targetStoreNode || !targetStoreNode.terminal?.code) {
      throw new Error(
        `Flash ERP could not find an active desktop node with a terminal binding for ${location.store.name}.`,
      );
    }

    const product = await tx.product.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        code: input.productCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });

    if (!product) {
      throw new Error(
        `Flash ERP could not find active product "${input.productCode}" for transfer.`,
      );
    }
    const taskSerialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const quantity = product.isSerialized
      ? taskSerialNumbers.length
      : requestedQuantity;

    if (product.isSerialized) {
      if (!Number.isInteger(requestedQuantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number transfer quantity.`,
        );
      }

      if (taskSerialNumbers.length === 0) {
        throw new Error(
          `Serialized product "${product.code}" needs exact serial numbers before Flash ERP can queue a transfer task.`,
        );
      }

      if (requestedQuantity !== taskSerialNumbers.length) {
        throw new Error(
          `Serialized product "${product.code}" needs ${requestedQuantity} serial number(s) before Flash ERP can queue this transfer task.`,
        );
      }
    } else if (taskSerialNumbers.length > 0) {
      throw new Error(
        `Product "${product.code}" is not serialized, so the transfer task should not include serial numbers.`,
      );
    }

    const audit = toOperatorAuditInput(
      input,
      `Requesting a transfer of ${quantity.toFixed(3)} units of ${product.name} from ${location.name} to ${targetLocation.name}.`,
    );
    const now = new Date();
    const taskId = randomUUID();
    const transferId = `inventory-transfer-${taskId}`;
    const outboundLedgerEntryId = `${transferId}:out`;
    const inboundLedgerEntryId = `${transferId}:in`;
    const taskPayload: EnterpriseInventoryTransferTaskPayload = {
      taskId,
      taskType: "APPLY_STOCK_TRANSFER",
      sourceInboundEventId: `enterprise-task:${taskId}`,
      sourceEventType: getEnterpriseSyncTaskEventType("APPLY_STOCK_TRANSFER"),
      aggregateType: "inventoryLocation",
      aggregateId: location.id,
      transactionNo: null,
      productCode: product.code,
      locationCode: location.code,
      locationName: location.name,
      targetLocationCode: targetLocation.code,
      targetLocationName: targetLocation.name,
      quantity,
      serialNumbers: taskSerialNumbers,
      movementType: "STOCK_TRANSFER_OUT",
      title: "Apply inter-location transfer",
      instructions: `Move ${quantity.toFixed(3)} units of ${product.name} from ${location.name} to ${targetLocation.name} locally${
        taskSerialNumbers.length > 0
          ? ` using serials ${taskSerialNumbers.join(", ")}`
          : ""
      }, then let Flash ERP sync the paired transfer movements upstream.`,
      operatorName: audit.operatorName,
      note: audit.note,
      requestedAt: now.toISOString(),
      replacementAggregateType: "inventoryTransfer",
      replacementAggregateId: transferId,
      replacementEventType: "inventory.transfer.recorded",
      replacementRecordVersion: 1,
      replacementPayload: {
        transferId,
        outboundLedgerEntryId,
        inboundLedgerEntryId,
        storeCode: location.store.code,
        terminalCode: targetStoreNode.terminal.code,
        sourceInventoryLocationCode: location.code,
        destinationInventoryLocationCode: targetLocation.code,
        productCode: product.code,
        quantity,
        ...(taskSerialNumbers.length > 0
          ? { serialNumbers: taskSerialNumbers }
          : {}),
        unitCost:
          product.baseCostPrice === null ? null : Number(product.baseCostPrice),
        referenceType: "ENTERPRISE_TASK",
        referenceId: taskId,
        externalReference: `${enterpriseNode.name} transfer • ${location.code} -> ${targetLocation.code} • ${product.code}`,
        occurredAt: now.toISOString(),
      } satisfies StoreInventoryTransferRecordedPayload,
    };
    const taskOutboxEventId = randomUUID();

    await tx.syncOutboxEvent.create({
      data: {
        id: taskOutboxEventId,
        syncNodeId: enterpriseNode.id,
        targetNodeCode: targetStoreNode.code,
        aggregateType: "syncTask",
        aggregateId: taskId,
        eventType: "sync.task.requested",
        idempotencyKey: `${enterpriseNode.code}:syncTask:transfer:${taskId}`,
        payload: serializeRequiredJsonField(taskPayload),
        status: SyncEventStatus.PENDING,
      },
    });

    await createOperatorAuditAction(tx, {
      syncNodeId: targetStoreNode.id,
      syncOutboxEventId: taskOutboxEventId,
      syncInboundEventId: null,
      actionType: getEnterpriseSyncTaskActionType("APPLY_STOCK_TRANSFER"),
      operatorName: audit.operatorName,
      note: audit.note,
      aggregateType: "inventoryLocation",
      eventType: getEnterpriseSyncTaskEventType("APPLY_STOCK_TRANSFER"),
    });

    await tx.syncNode.update({
      where: { id: targetStoreNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode: targetStoreNode.code,
      locationCode: location.code,
      taskId,
      actionType: "REQUEST_STOCK_TRANSFER",
      taskType: "APPLY_STOCK_TRANSFER",
      note: audit.note,
      operatorName: audit.operatorName,
      message: `Flash ERP queued a transfer task for ${product.name} from ${location.name} to ${targetLocation.name} on ${targetStoreNode.code}. ${
        taskSerialNumbers.length > 0
          ? "The store desktop will validate the requested serials locally before applying the transfer offline and syncing the paired movements upstream."
          : "The store desktop can now apply it offline and sync the paired transfer movements upstream."
      }`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function createInterStoreTransfer(
  locationCode: string,
  input: CreateInterStoreTransferRequest,
): Promise<CreateInterStoreTransferResponse> {
  return prisma.$transaction(async (tx) => {
    const requestedQuantity = Number(input.quantity);

    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new Error("Transfer quantity must be greater than zero.");
    }

    const sourceLocation = await tx.inventoryLocation.findFirst({
      where: {
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!sourceLocation) {
      throw new Error(
        `Flash ERP could not find inventory location "${locationCode}".`,
      );
    }

    if (!sourceLocation.storeId || !sourceLocation.store) {
      throw new Error(
        `Inventory location "${locationCode}" is not attached to a store execution node yet.`,
      );
    }

    const destinationLocation = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: sourceLocation.retailOrgId,
        code: input.destinationLocationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!destinationLocation) {
      throw new Error(
        `Flash ERP could not find active destination inventory location "${input.destinationLocationCode}".`,
      );
    }

    if (!destinationLocation.storeId || !destinationLocation.store) {
      throw new Error(
        `Inventory location "${input.destinationLocationCode}" is not attached to a store execution node yet.`,
      );
    }

    if (destinationLocation.id === sourceLocation.id) {
      throw new Error(
        "Source and destination locations must be different for an inter-store transfer.",
      );
    }

    if (destinationLocation.storeId === sourceLocation.storeId) {
      throw new Error(
        "Use the local inter-location transfer flow for locations inside the same store. Inter-store transfers need different source and destination shops.",
      );
    }

    const product = await tx.product.findFirst({
      where: {
        retailOrgId: sourceLocation.retailOrgId,
        code: input.productCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });

    if (!product) {
      throw new Error(
        `Flash ERP could not find active product "${input.productCode}" for transfer.`,
      );
    }

    if (product.isSerialized && !Number.isInteger(requestedQuantity)) {
      throw new Error(
        `Serialized product "${product.code}" needs a whole-number requested quantity.`,
      );
    }

    const audit = toOperatorAuditInput(
      input,
      `Creating an inter-store transfer instruction for ${product.name} from ${sourceLocation.name} to ${destinationLocation.name}.`,
    );
    const now = new Date();
    const transferNo = buildInterStoreTransferNo(
      sourceLocation.code,
      destinationLocation.code,
      now,
    );
    const transfer = await tx.interStoreTransfer.create({
      data: {
        retailOrgId: sourceLocation.retailOrgId,
        sourceStoreId: sourceLocation.storeId,
        destinationStoreId: destinationLocation.storeId,
        sourceInventoryLocationId: sourceLocation.id,
        destinationInventoryLocationId: destinationLocation.id,
        productId: product.id,
        transferNo,
        externalReference: input.externalReference?.trim() || null,
        origin: InterStoreTransferOrigin.ENTERPRISE,
        status: InterStoreTransferStatus.REQUESTED,
        requestedQuantity: toQuantityString(requestedQuantity),
        issuedQuantity: toQuantityString(0),
        receivedQuantity: toQuantityString(0),
        unitCost: product.baseCostPrice?.toString() ?? null,
        requestOperatorName: audit.operatorName,
        requestNote:
          input.note?.trim() ||
          `HQ instructed ${requestedQuantity.toFixed(3)} units of ${product.name} from ${sourceLocation.name} to ${destinationLocation.name}.`,
        requestedAt: now,
      },
    });

    const publication = await queueInterStoreTransferPublication(tx, {
      transferId: transfer.id,
      publishedAt: now,
    });

    return {
      transferId: transfer.id,
      transferNo,
      sourceLocationCode: sourceLocation.code,
      destinationLocationCode: destinationLocation.code,
      sourceNodeCode: publication?.sourceNodeCode ?? null,
      destinationNodeCode: publication?.destinationNodeCode ?? null,
      status: "REQUESTED",
      message:
        publication?.sourceNodeCode && publication.destinationNodeCode
          ? `Flash ERP created ${transferNo} and queued it for ${publication.sourceNodeCode} to issue and ${publication.destinationNodeCode} to receive on their next sync cycles.`
          : `Flash ERP created ${transferNo}, but one or both execution nodes are not currently available for downstream publication.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function createInterStoreTransferBatch(
  input: CreateInterStoreTransferBatchRequest,
): Promise<CreateInterStoreTransferBatchResponse> {
  await ensureInterStoreTransferSchemaCompatibility();

  return prisma.$transaction(async (tx) => {
    const sourceLocationCode = input.sourceLocationCode?.trim();
    const destinationLocationCode = input.destinationLocationCode?.trim();
    const lines =
      input.lines?.map((line, index) => ({
        lineNo: index + 1,
        productCode: line.productCode?.trim(),
        quantity: Number(line.quantity),
        externalReference:
          line.externalReference?.trim() ||
          input.externalReference?.trim() ||
          null,
        note: line.note?.trim() || input.note?.trim() || null,
      })) ?? [];
    const saveAsDraft = input.saveAsDraft === true;
    const requiredAt = input.requiredAt?.trim()
      ? new Date(input.requiredAt)
      : null;
    const transporterName = input.transporterName?.trim() || null;
    const vehicleRegistrationNo = input.vehicleRegistrationNo?.trim() || null;
    const driverName = input.driverName?.trim() || null;
    const driverContact = input.driverContact?.trim() || null;
    const deliveryNoteNo =
      input.deliveryNoteNo?.trim() || input.externalReference?.trim() || null;

    if (!sourceLocationCode) {
      throw new Error(
        "Choose the source shop/location for the inter-store request.",
      );
    }

    if (!destinationLocationCode) {
      throw new Error(
        "Choose the destination shop/location for the inter-store request.",
      );
    }

    if (lines.length === 0) {
      throw new Error(
        "Add at least one item before committing the inter-store request.",
      );
    }

    if (lines.length > 50) {
      throw new Error(
        "Inter-store requests can include up to 50 item lines at a time.",
      );
    }

    if (requiredAt && Number.isNaN(requiredAt.getTime())) {
      throw new Error(
        "Choose a valid required date for the inter-store request.",
      );
    }

    const sourceLocation = await tx.inventoryLocation.findFirst({
      where: {
        code: sourceLocationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!sourceLocation) {
      throw new Error(
        `Flash ERP could not find inventory location "${sourceLocationCode}".`,
      );
    }

    if (!sourceLocation.storeId || !sourceLocation.store) {
      throw new Error(
        `Inventory location "${sourceLocationCode}" is not attached to a store execution node yet.`,
      );
    }

    const destinationLocation = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: sourceLocation.retailOrgId,
        code: destinationLocationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!destinationLocation) {
      throw new Error(
        `Flash ERP could not find active destination inventory location "${destinationLocationCode}".`,
      );
    }

    if (!destinationLocation.storeId || !destinationLocation.store) {
      throw new Error(
        `Inventory location "${destinationLocationCode}" is not attached to a store execution node yet.`,
      );
    }

    if (destinationLocation.id === sourceLocation.id) {
      throw new Error(
        "Source and destination locations must be different for an inter-store transfer.",
      );
    }

    if (destinationLocation.storeId === sourceLocation.storeId) {
      throw new Error(
        "Use the local inter-location transfer flow for locations inside the same store. Inter-store transfers need different source and destination shops.",
      );
    }

    const productCodes = [
      ...new Set(lines.map((line) => line.productCode).filter(Boolean)),
    ] as string[];
    const products = await tx.product.findMany({
      where: {
        retailOrgId: sourceLocation.retailOrgId,
        code: {
          in: productCodes,
        },
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });
    const productsByCode = new Map(
      products.map((product) => [product.code, product]),
    );
    const audit = toOperatorAuditInput(
      input,
      `Creating an inter-store transfer instruction from ${sourceLocation.name} to ${destinationLocation.name}.`,
    );
    const now = new Date();
    const transferBatchNo = buildInterStoreTransferBatchNo(
      sourceLocation.code,
      destinationLocation.code,
      now,
    );
    const transfers: CreateInterStoreTransferResponse[] = [];

    for (const line of lines) {
      if (!line.productCode) {
        throw new Error(`Line ${line.lineNo} needs a product code.`);
      }

      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error(
          `Line ${line.lineNo} quantity must be greater than zero.`,
        );
      }

      const product = productsByCode.get(line.productCode);

      if (!product) {
        throw new Error(
          `Flash ERP could not find active product "${line.productCode}" for transfer.`,
        );
      }

      if (product.isSerialized && !Number.isInteger(line.quantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number requested quantity.`,
        );
      }

      const requestedAt = new Date(now.getTime() + line.lineNo);
      const transferNo = `${transferBatchNo}-L${String(line.lineNo).padStart(2, "0")}`;
      const transfer = await tx.interStoreTransfer.create({
        data: {
          retailOrgId: sourceLocation.retailOrgId,
          sourceStoreId: sourceLocation.storeId,
          destinationStoreId: destinationLocation.storeId,
          sourceInventoryLocationId: sourceLocation.id,
          destinationInventoryLocationId: destinationLocation.id,
          productId: product.id,
          transferNo,
          transferBatchNo,
          lineNo: line.lineNo,
          externalReference: line.externalReference,
          transporterName,
          vehicleRegistrationNo,
          driverName,
          driverContact,
          deliveryNoteNo,
          origin: InterStoreTransferOrigin.ENTERPRISE,
          status: saveAsDraft
            ? InterStoreTransferStatus.DRAFT
            : InterStoreTransferStatus.REQUESTED,
          requestedQuantity: toQuantityString(line.quantity),
          issuedQuantity: toQuantityString(0),
          receivedQuantity: toQuantityString(0),
          unitCost: product.baseCostPrice?.toString() ?? null,
          requestOperatorName: audit.operatorName,
          requestNote:
            line.note ||
            `HQ instructed ${line.quantity.toFixed(3)} units of ${product.name} from ${sourceLocation.name} to ${destinationLocation.name}.`,
          requestedAt,
          requiredAt,
        },
      });

      const publication = saveAsDraft
        ? null
        : await queueInterStoreTransferPublication(tx, {
            transferId: transfer.id,
            publishedAt: requestedAt,
          });

      transfers.push({
        transferId: transfer.id,
        transferNo,
        sourceLocationCode: sourceLocation.code,
        destinationLocationCode: destinationLocation.code,
        sourceNodeCode: publication?.sourceNodeCode ?? null,
        destinationNodeCode: publication?.destinationNodeCode ?? null,
        status: saveAsDraft ? "DRAFT" : "REQUESTED",
        message: saveAsDraft
          ? `Flash ERP saved ${transferBatchNo} line ${line.lineNo} as a draft transfer request.`
          : publication?.sourceNodeCode && publication.destinationNodeCode
            ? `Flash ERP created ${transferNo} and queued it for ${publication.sourceNodeCode} to issue and ${publication.destinationNodeCode} to receive on their next sync cycles.`
            : `Flash ERP created ${transferNo}, but one or both execution nodes are not currently available for downstream publication.`,
        serverProcessedAt: now.toISOString(),
      });
    }

    return {
      sourceLocationCode: sourceLocation.code,
      destinationLocationCode: destinationLocation.code,
      transferBatchNo,
      transferCount: transfers.length,
      transfers,
      message: saveAsDraft
        ? `Flash ERP saved ${transferBatchNo} as a draft transfer request with ${transfers.length} line(s).`
        : `Flash ERP committed ${transferBatchNo} with ${transfers.length} transfer line(s) from ${sourceLocation.name} to ${destinationLocation.name}.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function updateInterStoreTransferBatch(
  transferBatchNo: string,
  input: UpdateInterStoreTransferBatchRequest,
): Promise<CreateInterStoreTransferBatchResponse> {
  await ensureInterStoreTransferSchemaCompatibility();

  const normalizedTransferBatchNo = transferBatchNo.trim();

  if (!normalizedTransferBatchNo) {
    throw new Error("Choose a draft transfer request before editing it.");
  }

  return prisma.$transaction(async (tx) => {
    const existingTransfers = await tx.interStoreTransfer.findMany({
      where: {
        OR: [
          { transferBatchNo: normalizedTransferBatchNo },
          { transferNo: normalizedTransferBatchNo },
        ],
      },
      orderBy: [{ lineNo: "asc" }, { transferNo: "asc" }],
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        status: true,
        sourceStoreId: true,
        sourceInventoryLocationId: true,
        feedbackStatus: true,
        feedbackConfirmedAt: true,
        feedbackPostedAt: true,
      },
    });

    if (existingTransfers.length === 0) {
      throw new Error(
        `Flash ERP could not find transfer request "${normalizedTransferBatchNo}".`,
      );
    }

    const finalizedFeedbackTransfer = existingTransfers.find(
      (transfer) =>
        transfer.feedbackStatus === "CONFIRMED" ||
        transfer.feedbackStatus === "POSTED" ||
        transfer.feedbackConfirmedAt !== null ||
        transfer.feedbackPostedAt !== null,
    );

    if (finalizedFeedbackTransfer) {
      throw new Error(
        `Transfer request ${normalizedTransferBatchNo} already has confirmed station feedback and can no longer be changed from HQ.`,
      );
    }

    const isDraftBatch = existingTransfers.every(
      (transfer) => transfer.status === InterStoreTransferStatus.DRAFT,
    );

    const sourceLocationCode = input.sourceLocationCode?.trim();
    const destinationLocationCode = input.destinationLocationCode?.trim();
    const lines =
      input.lines?.map((line, index) => ({
        lineNo: index + 1,
        productCode: line.productCode?.trim(),
        quantity: Number(line.quantity),
        externalReference:
          line.externalReference?.trim() ||
          input.externalReference?.trim() ||
          null,
        note: line.note?.trim() || input.note?.trim() || null,
      })) ?? [];
    const requiredAt = input.requiredAt?.trim()
      ? new Date(input.requiredAt)
      : null;
    const transporterName = input.transporterName?.trim() || null;
    const vehicleRegistrationNo = input.vehicleRegistrationNo?.trim() || null;
    const driverName = input.driverName?.trim() || null;
    const driverContact = input.driverContact?.trim() || null;
    const deliveryNoteNo =
      input.deliveryNoteNo?.trim() || input.externalReference?.trim() || null;

    if (!sourceLocationCode) {
      throw new Error(
        "Choose the source shop/location for the inter-store request.",
      );
    }

    if (!destinationLocationCode) {
      throw new Error(
        "Choose the destination shop/location for the inter-store request.",
      );
    }

    if (lines.length === 0) {
      throw new Error(
        "Add at least one item before saving the inter-store request.",
      );
    }

    if (lines.length > 50) {
      throw new Error(
        "Inter-store requests can include up to 50 item lines at a time.",
      );
    }

    if (requiredAt && Number.isNaN(requiredAt.getTime())) {
      throw new Error(
        "Choose a valid required date for the inter-store request.",
      );
    }

    const sourceLocation = await tx.inventoryLocation.findFirst({
      where: {
        code: sourceLocationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!sourceLocation) {
      throw new Error(
        `Flash ERP could not find inventory location "${sourceLocationCode}".`,
      );
    }

    if (!sourceLocation.storeId || !sourceLocation.store) {
      throw new Error(
        `Inventory location "${sourceLocationCode}" is not attached to a store execution node yet.`,
      );
    }

    const destinationLocation = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: sourceLocation.retailOrgId,
        code: destinationLocationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
        store: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!destinationLocation) {
      throw new Error(
        `Flash ERP could not find active destination inventory location "${destinationLocationCode}".`,
      );
    }

    if (!destinationLocation.storeId || !destinationLocation.store) {
      throw new Error(
        `Inventory location "${destinationLocationCode}" is not attached to a store execution node yet.`,
      );
    }

    if (destinationLocation.id === sourceLocation.id) {
      throw new Error(
        "Source and destination locations must be different for an inter-store transfer.",
      );
    }

    if (destinationLocation.storeId === sourceLocation.storeId) {
      throw new Error(
        "Use the local inter-location transfer flow for locations inside the same store. Inter-store transfers need different source and destination shops.",
      );
    }

    const productCodes = [
      ...new Set(lines.map((line) => line.productCode).filter(Boolean)),
    ] as string[];
    const products = await tx.product.findMany({
      where: {
        retailOrgId: sourceLocation.retailOrgId,
        code: {
          in: productCodes,
        },
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });
    const productsByCode = new Map(
      products.map((product) => [product.code, product]),
    );
    const audit = toOperatorAuditInput(
      input,
      `Editing an inter-store transfer instruction from ${sourceLocation.name} to ${destinationLocation.name}.`,
    );
    const now = new Date();
    const existingBatchNo =
      existingTransfers[0]!.transferBatchNo ?? existingTransfers[0]!.transferNo;
    const transfers: CreateInterStoreTransferResponse[] = [];

    if (!isDraftBatch) {
      const sourceChanged = existingTransfers.some(
        (transfer) =>
          transfer.sourceStoreId !== sourceLocation.storeId ||
          transfer.sourceInventoryLocationId !== sourceLocation.id,
      );

      if (sourceChanged) {
        throw new Error(
          "The source location cannot be changed after a transfer has been committed. Open a new transfer request if stock must move from another shop.",
        );
      }

      for (const transfer of existingTransfers) {
        const updatedTransfer = await tx.interStoreTransfer.update({
          where: {
            id: transfer.id,
          },
          data: {
            destinationStoreId: destinationLocation.storeId,
            destinationInventoryLocationId: destinationLocation.id,
            externalReference: input.externalReference?.trim() || null,
            transporterName,
            vehicleRegistrationNo,
            driverName,
            driverContact,
            deliveryNoteNo,
            requiredAt,
            requestNote:
              input.note?.trim() ||
              `HQ rerouted ${transfer.transferNo} from ${sourceLocation.name} to ${destinationLocation.name}.`,
          },
          select: {
            id: true,
            transferNo: true,
            status: true,
          },
        });

        const publication = await queueInterStoreTransferPublication(tx, {
          transferId: updatedTransfer.id,
          publishedAt: now,
        });

        transfers.push({
          transferId: updatedTransfer.id,
          transferNo: updatedTransfer.transferNo,
          sourceLocationCode: sourceLocation.code,
          destinationLocationCode: destinationLocation.code,
          sourceNodeCode: publication?.sourceNodeCode ?? null,
          destinationNodeCode: publication?.destinationNodeCode ?? null,
          status: toInterStoreTransferLifecycleStatus(updatedTransfer.status),
          message: `Flash ERP rerouted ${updatedTransfer.transferNo} to ${destinationLocation.name}.`,
          serverProcessedAt: now.toISOString(),
        });
      }

      return {
        sourceLocationCode: sourceLocation.code,
        destinationLocationCode: destinationLocation.code,
        transferBatchNo: existingBatchNo,
        transferCount: transfers.length,
        transfers,
        message: `Flash ERP rerouted transfer request ${existingBatchNo} to ${destinationLocation.name} and queued the updated instruction for the shops.`,
        serverProcessedAt: now.toISOString(),
      };
    }

    for (const line of lines) {
      if (!line.productCode) {
        throw new Error(`Line ${line.lineNo} needs a product code.`);
      }

      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error(
          `Line ${line.lineNo} quantity must be greater than zero.`,
        );
      }

      const product = productsByCode.get(line.productCode);

      if (!product) {
        throw new Error(
          `Flash ERP could not find active product "${line.productCode}" for transfer.`,
        );
      }

      if (product.isSerialized && !Number.isInteger(line.quantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number requested quantity.`,
        );
      }
    }

    await tx.interStoreTransfer.deleteMany({
      where: {
        id: {
          in: existingTransfers.map((transfer) => transfer.id),
        },
      },
    });

    for (const line of lines) {
      const product = productsByCode.get(line.productCode);

      if (!product) {
        throw new Error(
          `Flash ERP could not find active product "${line.productCode}" for transfer.`,
        );
      }

      const requestedAt = new Date(now.getTime() + line.lineNo);
      const transferNo = `${existingBatchNo}-L${String(line.lineNo).padStart(2, "0")}`;
      const transfer = await tx.interStoreTransfer.create({
        data: {
          retailOrgId: sourceLocation.retailOrgId,
          sourceStoreId: sourceLocation.storeId,
          destinationStoreId: destinationLocation.storeId,
          sourceInventoryLocationId: sourceLocation.id,
          destinationInventoryLocationId: destinationLocation.id,
          productId: product.id,
          transferNo,
          transferBatchNo: existingBatchNo,
          lineNo: line.lineNo,
          externalReference: line.externalReference,
          transporterName,
          vehicleRegistrationNo,
          driverName,
          driverContact,
          deliveryNoteNo,
          origin: InterStoreTransferOrigin.ENTERPRISE,
          status: InterStoreTransferStatus.DRAFT,
          requestedQuantity: toQuantityString(line.quantity),
          issuedQuantity: toQuantityString(0),
          receivedQuantity: toQuantityString(0),
          unitCost: product.baseCostPrice?.toString() ?? null,
          requestOperatorName: audit.operatorName,
          requestNote:
            line.note ||
            `HQ instructed ${line.quantity.toFixed(3)} units of ${product.name} from ${sourceLocation.name} to ${destinationLocation.name}.`,
          requestedAt,
          requiredAt,
        },
      });

      transfers.push({
        transferId: transfer.id,
        transferNo,
        sourceLocationCode: sourceLocation.code,
        destinationLocationCode: destinationLocation.code,
        sourceNodeCode: null,
        destinationNodeCode: null,
        status: "DRAFT",
        message: `Flash ERP updated ${existingBatchNo} line ${line.lineNo} as a draft transfer request.`,
        serverProcessedAt: now.toISOString(),
      });
    }

    return {
      sourceLocationCode: sourceLocation.code,
      destinationLocationCode: destinationLocation.code,
      transferBatchNo: existingBatchNo,
      transferCount: transfers.length,
      transfers,
      message: `Flash ERP updated draft transfer request ${existingBatchNo} with ${transfers.length} line(s).`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function commitInterStoreTransferBatch(
  transferBatchNo: string,
): Promise<CreateInterStoreTransferBatchResponse> {
  await ensureInterStoreTransferSchemaCompatibility();

  const normalizedTransferBatchNo = transferBatchNo.trim();

  if (!normalizedTransferBatchNo) {
    throw new Error("Choose a draft transfer request before committing it.");
  }

  return prisma.$transaction(async (tx) => {
    const transfers = await tx.interStoreTransfer.findMany({
      where: {
        OR: [
          { transferBatchNo: normalizedTransferBatchNo },
          { transferNo: normalizedTransferBatchNo },
        ],
        status: InterStoreTransferStatus.DRAFT,
      },
      orderBy: [{ lineNo: "asc" }, { transferNo: "asc" }],
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        sourceInventoryLocation: {
          select: {
            code: true,
            name: true,
          },
        },
        destinationInventoryLocation: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (transfers.length === 0) {
      throw new Error(
        `Flash ERP could not find draft transfer request "${normalizedTransferBatchNo}".`,
      );
    }

    const now = new Date();
    const committedTransfers: CreateInterStoreTransferResponse[] = [];

    for (const transfer of transfers) {
      await tx.interStoreTransfer.update({
        where: {
          id: transfer.id,
        },
        data: {
          status: InterStoreTransferStatus.REQUESTED,
          requestedAt: now,
        },
      });

      const publication = await queueInterStoreTransferPublication(tx, {
        transferId: transfer.id,
        publishedAt: now,
      });

      committedTransfers.push({
        transferId: transfer.id,
        transferNo: transfer.transferNo,
        sourceLocationCode: transfer.sourceInventoryLocation.code,
        destinationLocationCode: transfer.destinationInventoryLocation.code,
        sourceNodeCode: publication?.sourceNodeCode ?? null,
        destinationNodeCode: publication?.destinationNodeCode ?? null,
        status: "REQUESTED",
        message:
          publication?.sourceNodeCode && publication.destinationNodeCode
            ? `Flash ERP committed ${transfer.transferNo} and queued it for shop execution.`
            : `Flash ERP committed ${transfer.transferNo}, but one or both execution nodes are not currently available for downstream publication.`,
        serverProcessedAt: now.toISOString(),
      });
    }

    const firstTransfer = transfers[0]!;
    const committedBatchNo =
      firstTransfer.transferBatchNo ?? firstTransfer.transferNo;

    return {
      sourceLocationCode: firstTransfer.sourceInventoryLocation.code,
      destinationLocationCode: firstTransfer.destinationInventoryLocation.code,
      transferBatchNo: committedBatchNo,
      transferCount: committedTransfers.length,
      transfers: committedTransfers,
      message: `Flash ERP committed ${committedBatchNo} with ${committedTransfers.length} line(s) for shop issue and receipt.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function lookupStoreNodeRemoteInventory(
  nodeCode: string,
  input: StoreRemoteInventoryLookupRequest,
): Promise<StoreRemoteInventoryLookupResponse> {
  const requester = await prisma.syncNode.findFirst({
    where: {
      code: nodeCode,
      nodeType: SyncNodeType.STORE_DESKTOP,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      retailOrgId: true,
      storeId: true,
    },
  });

  if (!requester?.storeId) {
    throw new Error(
      `Flash ERP could not find active store node "${nodeCode}" for remote inventory lookup.`,
    );
  }

  const query = input.query?.trim();
  const productCode = input.productCode?.trim();
  const storeCode = input.storeCode?.trim();
  const locationCode = input.locationCode?.trim();
  const requestedLimit = Number(input.limit ?? 25);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(50, Math.max(1, Math.trunc(requestedLimit)))
    : 25;
  const productWhere: Prisma.ProductWhereInput = {
    retailOrgId: requester.retailOrgId,
    status: RecordStatus.ACTIVE,
  };

  if (productCode) {
    productWhere.code = productCode;
  } else if (query) {
    productWhere.OR = [
      { code: { contains: query } },
      { sku: { contains: query } },
      { name: { contains: query } },
      { shortName: { contains: query } },
    ];
  }

  const [products, locations] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        code: true,
        name: true,
        department: true,
        category: true,
        subcategory: true,
        baseUnitPrice: true,
        priceListEntries: {
          where: {
            priceList: {
              isDefault: true,
              status: RecordStatus.ACTIVE,
            },
          },
          select: {
            unitPrice: true,
          },
          take: 1,
        },
      },
      orderBy: {
        name: "asc",
      },
      take: limit,
    }),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: requester.retailOrgId,
        status: RecordStatus.ACTIVE,
        storeId: {
          not: requester.storeId,
        },
        ...(locationCode ? { code: locationCode } : {}),
        store: {
          ...(storeCode ? { code: storeCode } : {}),
          status: RecordStatus.ACTIVE,
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        store: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    }),
  ]);
  const productIds = products.map((product) => product.id);
  const locationIds = locations.map((location) => location.id);

  if (productIds.length === 0 || locationIds.length === 0) {
    return {
      rows: [],
      serverProcessedAt: new Date().toISOString(),
    };
  }

  const [balances] = await Promise.all([
    prisma.inventoryLedgerEntry.groupBy({
      by: ["inventoryLocationId", "productId"],
      where: {
        retailOrgId: requester.retailOrgId,
        inventoryLocationId: {
          in: locationIds,
        },
        productId: {
          in: productIds,
        },
      },
      _sum: {
        quantity: true,
      },
      _max: {
        occurredAt: true,
      },
    }),
    prisma.syncNode.update({
      where: {
        id: requester.id,
      },
      data: {
        lastHeartbeatAt: new Date(),
      },
    }),
  ]);
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const locationsById = new Map(
    locations.map((location) => [location.id, location]),
  );
  const rows = balances
    .map((balance) => {
      const product = productsById.get(balance.productId);
      const location = locationsById.get(balance.inventoryLocationId);
      const quantityOnHand = Number(
        Number(balance._sum.quantity ?? 0).toFixed(3),
      );

      if (!product || !location?.store || quantityOnHand <= 0) {
        return null;
      }

      return {
        storeCode: location.store.code,
        storeName: location.store.name,
        locationCode: location.code,
        locationName: location.name,
        productCode: product.code,
        productName: product.name,
        departmentCode: product.department,
        categoryCode: product.category,
        subcategory: product.subcategory,
        quantityOnHand,
        unitPrice: Number(
          Number(
            product.priceListEntries[0]?.unitPrice ?? product.baseUnitPrice,
          ).toFixed(2),
        ),
        updatedAt:
          balance._max.occurredAt?.toISOString() ?? new Date().toISOString(),
      };
    })
    .filter(
      (row): row is StoreRemoteInventoryLookupResponse["rows"][number] =>
        row !== null,
    )
    .sort((left, right) => right.quantityOnHand - left.quantityOnHand)
    .slice(0, limit);

  return {
    rows,
    serverProcessedAt: new Date().toISOString(),
  };
}

export async function createStoreNodeRemoteInterStoreRequest(
  nodeCode: string,
  input: StoreRemoteInterStoreRequestInput,
): Promise<CreateInterStoreTransferResponse> {
  const requester = await prisma.syncNode.findFirst({
    where: {
      code: nodeCode,
      nodeType: SyncNodeType.STORE_DESKTOP,
      status: RecordStatus.ACTIVE,
    },
    select: {
      id: true,
      retailOrgId: true,
      storeId: true,
    },
  });

  if (!requester?.storeId) {
    throw new Error(
      `Flash ERP could not find active store node "${nodeCode}" for remote stock request.`,
    );
  }

  const [sourceLocation, destinationLocation] = await Promise.all([
    prisma.inventoryLocation.findFirst({
      where: {
        retailOrgId: requester.retailOrgId,
        code: input.sourceLocationCode?.trim(),
        status: RecordStatus.ACTIVE,
        storeId: {
          not: requester.storeId,
        },
        store: {
          status: RecordStatus.ACTIVE,
        },
      },
      select: {
        code: true,
      },
    }),
    input.destinationLocationCode?.trim()
      ? prisma.inventoryLocation.findFirst({
          where: {
            retailOrgId: requester.retailOrgId,
            code: input.destinationLocationCode.trim(),
            storeId: requester.storeId,
            status: RecordStatus.ACTIVE,
          },
          select: {
            code: true,
          },
        })
      : prisma.inventoryLocation.findFirst({
          where: {
            retailOrgId: requester.retailOrgId,
            storeId: requester.storeId,
            status: RecordStatus.ACTIVE,
          },
          orderBy: [
            { useForReceivingDefault: "desc" },
            { useForSalesDefault: "desc" },
            { name: "asc" },
          ],
          select: {
            code: true,
          },
        }),
  ]);

  if (!sourceLocation) {
    throw new Error(
      "Choose an active source location from another shop before requesting stock.",
    );
  }

  if (!destinationLocation) {
    throw new Error(
      "Flash ERP could not find an active destination location for this shop.",
    );
  }

  const response = await createInterStoreTransfer(sourceLocation.code, {
    productCode: input.productCode,
    destinationLocationCode: destinationLocation.code,
    quantity: input.quantity,
    externalReference: input.externalReference,
    note: input.note,
    operatorName: input.operatorName,
  });

  await prisma.syncNode.update({
    where: {
      id: requester.id,
    },
    data: {
      lastHeartbeatAt: new Date(),
    },
  });

  return response;
}

export async function createPurchaseOrder(
  locationCode: string,
  input: CreatePurchaseOrderRequest,
): Promise<CreatePurchaseOrderResponse> {
  return prisma.$transaction(async (tx) => {
    const lines =
      input.lines?.map((line) => ({
        productCode: line.productCode?.trim(),
        quantity: Number(line.quantity),
        unitCost:
          line.unitCost === null || line.unitCost === undefined
            ? null
            : Number(line.unitCost),
      })) ?? [];

    if (lines.length === 0) {
      throw new Error(
        "Flash ERP needs at least one purchase-order line before saving.",
      );
    }

    const duplicateProductCodes = new Set<string>();
    const seenProductCodes = new Set<string>();

    for (const line of lines) {
      if (!line.productCode) {
        throw new Error("Every purchase-order line needs a product code.");
      }

      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error(
          `Purchase-order line "${line.productCode}" needs a quantity greater than zero.`,
        );
      }

      if (
        line.unitCost !== null &&
        (!Number.isFinite(line.unitCost) || line.unitCost < 0)
      ) {
        throw new Error(
          `Purchase-order line "${line.productCode}" needs a unit cost that is zero or greater when provided.`,
        );
      }

      const duplicateKey = line.productCode.toUpperCase();

      if (seenProductCodes.has(duplicateKey)) {
        duplicateProductCodes.add(line.productCode);
      }

      seenProductCodes.add(duplicateKey);
    }

    if (duplicateProductCodes.size > 0) {
      throw new Error(
        `Flash ERP only allows one purchase-order line per product in this first purchasing slice. Duplicate lines were submitted for ${[...duplicateProductCodes].join(", ")}.`,
      );
    }

    function readChargeAmount(value: number | null | undefined, label: string) {
      const amount = value === null || value === undefined ? 0 : Number(value);

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} must be zero or greater.`);
      }

      return Number(amount.toFixed(2));
    }

    const discountAmount = readChargeAmount(
      input.discountAmount,
      "Discount amount",
    );
    const shippingAmount = readChargeAmount(
      input.shippingAmount,
      "Shipping amount",
    );
    const freightAmount = readChargeAmount(
      input.freightAmount,
      "Freight amount",
    );
    const otherChargesAmount = readChargeAmount(
      input.otherChargesAmount,
      "Other charges amount",
    );
    const taxAmount = readChargeAmount(input.taxAmount, "Tax amount");

    const location = await tx.inventoryLocation.findFirst({
      where: {
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        warehouseId: true,
        store: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!location) {
      throw new Error(
        `Flash ERP could not find inventory location "${locationCode}".`,
      );
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        code: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        `Flash ERP does not have an active primary enterprise node for location "${locationCode}".`,
      );
    }

    const supplierNo = input.supplierNo?.trim().toUpperCase() || "";

    if (!supplierNo) {
      throw new Error(
        "Choose an active supplier before saving a purchase order.",
      );
    }

    const supplier = await tx.supplier.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        supplierNo,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!supplier) {
      throw new Error(
        `Flash ERP could not find active supplier "${supplierNo}".`,
      );
    }

    const productsByCode = await resolveProductsByCode(
      tx,
      location.retailOrgId,
      lines.map((line) => line.productCode),
    );

    for (const line of lines) {
      const product = productsByCode.get(line.productCode);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${line.productCode}".`,
        );
      }

      if (product.isSerialized && !Number.isInteger(line.quantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number purchase-order quantity.`,
        );
      }
    }

    const now = new Date();
    const purchaseOrderId = randomUUID();
    const purchaseOrderNo = buildPurchaseOrderNo(location.code, now);
    const shouldCommit = input.autoCommit === true;
    const operatorName = input.operatorName?.trim() || "Flash ERP operator";
    const note =
      input.note?.trim() ||
      `Purchasing plan prepared for ${location.name} from the Flash ERP enterprise workspace.`;
    const subtotalAmount = Number(
      lines
        .reduce((sum, line) => {
          const product = productsByCode.get(line.productCode);
          const unitCost = line.unitCost ?? Number(product?.baseCostPrice ?? 0);

          return sum + line.quantity * unitCost;
        }, 0)
        .toFixed(2),
    );
    const grandTotalAmount = Number(
      Math.max(
        0,
        subtotalAmount -
          discountAmount +
          shippingAmount +
          freightAmount +
          otherChargesAmount +
          taxAmount,
      ).toFixed(2),
    );

    await tx.purchaseOrder.create({
      data: {
        id: purchaseOrderId,
        retailOrgId: location.retailOrgId,
        storeId: location.storeId,
        warehouseId: location.warehouseId,
        inventoryLocationId: location.id,
        supplierId: supplier.id,
        purchaseOrderNo,
        externalReference: input.externalReference?.trim() || null,
        status: shouldCommit
          ? PurchaseOrderStatus.COMMITTED
          : PurchaseOrderStatus.DRAFT,
        note,
        operatorName,
        subtotalAmount: toMoneyString(subtotalAmount),
        discountAmount: toMoneyString(discountAmount),
        shippingAmount: toMoneyString(shippingAmount),
        freightAmount: toMoneyString(freightAmount),
        otherChargesAmount: toMoneyString(otherChargesAmount),
        taxAmount: toMoneyString(taxAmount),
        grandTotalAmount: toMoneyString(grandTotalAmount),
        committedAt: shouldCommit ? now : null,
        sourceNodeCode: enterpriseNode.code,
        lines: {
          create: lines.map((line, index) => {
            const product = productsByCode.get(line.productCode);

            if (!product) {
              throw new Error(
                `Flash ERP could not find product "${line.productCode}".`,
              );
            }

            return {
              id: randomUUID(),
              lineNo: index + 1,
              productId: product.id,
              orderedQuantity: toQuantityString(line.quantity),
              receivedQuantity: toQuantityString(0),
              unitCost:
                line.unitCost === null
                  ? (product.baseCostPrice?.toString() ?? null)
                  : toMoneyString(line.unitCost),
            };
          }),
        },
      },
    });

    const publication = shouldCommit
      ? await queuePurchaseOrderPublication(tx, {
          purchaseOrderId,
          publishedAt: now,
        })
      : null;

    return {
      purchaseOrderId,
      purchaseOrderNo,
      locationCode: location.code,
      nodeCode: publication?.nodeCode ?? null,
      status: shouldCommit ? "COMMITTED" : "DRAFT",
      lineCount: lines.length,
      message: shouldCommit
        ? publication?.nodeCode
          ? `Flash ERP committed ${purchaseOrderNo} for ${location.name} and queued it for ${publication.nodeCode} to receive offline on the next sync pull.`
          : `Flash ERP committed ${purchaseOrderNo} for ${location.name}, but no active execution node is currently available to receive it downstream.`
        : `Flash ERP saved ${purchaseOrderNo} as a draft purchase order for ${location.name}.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function updatePurchaseOrder(
  purchaseOrderId: string,
  input: UpdatePurchaseOrderRequest,
): Promise<CreatePurchaseOrderResponse> {
  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId,
      },
      select: {
        id: true,
        retailOrgId: true,
        purchaseOrderNo: true,
        status: true,
        committedAt: true,
        inventoryLocation: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      throw new Error("Flash ERP could not find that purchase order.");
    }

    if (
      purchaseOrder.status !== PurchaseOrderStatus.DRAFT ||
      purchaseOrder.committedAt
    ) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchaseOrderNo} has already been pushed to the shop and can no longer be edited from HQ.`,
      );
    }

    const lines =
      input.lines?.map((line) => ({
        productCode: line.productCode?.trim(),
        quantity: Number(line.quantity),
        unitCost:
          line.unitCost === null || line.unitCost === undefined
            ? null
            : Number(line.unitCost),
      })) ?? [];

    if (lines.length === 0) {
      throw new Error(
        "Flash ERP needs at least one purchase-order line before saving.",
      );
    }

    const duplicateProductCodes = new Set<string>();
    const seenProductCodes = new Set<string>();

    for (const line of lines) {
      if (!line.productCode) {
        throw new Error("Every purchase-order line needs a product code.");
      }

      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new Error(
          `Purchase-order line "${line.productCode}" needs a quantity greater than zero.`,
        );
      }

      if (
        line.unitCost !== null &&
        (!Number.isFinite(line.unitCost) || line.unitCost < 0)
      ) {
        throw new Error(
          `Purchase-order line "${line.productCode}" needs a unit cost that is zero or greater when provided.`,
        );
      }

      const duplicateKey = line.productCode.toUpperCase();

      if (seenProductCodes.has(duplicateKey)) {
        duplicateProductCodes.add(line.productCode);
      }

      seenProductCodes.add(duplicateKey);
    }

    if (duplicateProductCodes.size > 0) {
      throw new Error(
        `Flash ERP only allows one purchase-order line per product. Duplicate lines were submitted for ${[...duplicateProductCodes].join(", ")}.`,
      );
    }

    function readChargeAmount(value: number | null | undefined, label: string) {
      const amount = value === null || value === undefined ? 0 : Number(value);

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} must be zero or greater.`);
      }

      return Number(amount.toFixed(2));
    }

    const locationCode =
      input.locationCode?.trim() || purchaseOrder.inventoryLocation.code;
    const location = await tx.inventoryLocation.findFirst({
      where: {
        retailOrgId: purchaseOrder.retailOrgId,
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
        warehouseId: true,
      },
    });

    if (!location) {
      throw new Error(
        `Flash ERP could not find active inventory location "${locationCode}".`,
      );
    }

    const supplierNo = input.supplierNo?.trim().toUpperCase() || "";

    if (!supplierNo) {
      throw new Error(
        "Choose an active supplier before saving a purchase order.",
      );
    }

    const [enterpriseNode, supplier, productsByCode] =
      await runPrismaQueriesSequentially([
        () =>
          tx.syncNode.findFirst({
            where: {
              retailOrgId: purchaseOrder.retailOrgId,
              nodeType: SyncNodeType.ENTERPRISE,
              isPrimary: true,
              status: RecordStatus.ACTIVE,
            },
            select: {
              code: true,
            },
          }),
        () =>
          tx.supplier.findFirst({
            where: {
              retailOrgId: purchaseOrder.retailOrgId,
              supplierNo,
              status: RecordStatus.ACTIVE,
            },
            select: {
              id: true,
            },
          }),
        () =>
          resolveProductsByCode(
            tx,
            purchaseOrder.retailOrgId,
            lines.map((line) => line.productCode),
          ),
      ]);

    if (!enterpriseNode) {
      throw new Error(
        "Flash ERP does not have an active primary enterprise node for purchase orders.",
      );
    }

    if (!supplier) {
      throw new Error(
        `Flash ERP could not find active supplier "${supplierNo}".`,
      );
    }

    for (const line of lines) {
      const product = productsByCode.get(line.productCode);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${line.productCode}".`,
        );
      }

      if (product.isSerialized && !Number.isInteger(line.quantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number purchase-order quantity.`,
        );
      }
    }

    const discountAmount = readChargeAmount(
      input.discountAmount,
      "Discount amount",
    );
    const shippingAmount = readChargeAmount(
      input.shippingAmount,
      "Shipping amount",
    );
    const freightAmount = readChargeAmount(
      input.freightAmount,
      "Freight amount",
    );
    const otherChargesAmount = readChargeAmount(
      input.otherChargesAmount,
      "Other charges amount",
    );
    const taxAmount = readChargeAmount(input.taxAmount, "Tax amount");
    const subtotalAmount = Number(
      lines
        .reduce((sum, line) => {
          const product = productsByCode.get(line.productCode);
          const unitCost = line.unitCost ?? Number(product?.baseCostPrice ?? 0);

          return sum + line.quantity * unitCost;
        }, 0)
        .toFixed(2),
    );
    const grandTotalAmount = Number(
      Math.max(
        0,
        subtotalAmount -
          discountAmount +
          shippingAmount +
          freightAmount +
          otherChargesAmount +
          taxAmount,
      ).toFixed(2),
    );
    const operatorName = input.operatorName?.trim() || "Flash ERP operator";
    const note =
      input.note?.trim() ||
      `Purchasing plan prepared for ${location.name} from the Flash ERP enterprise workspace.`;

    await tx.purchaseOrderLine.deleteMany({
      where: {
        purchaseOrderId: purchaseOrder.id,
      },
    });

    await tx.purchaseOrder.update({
      where: {
        id: purchaseOrder.id,
      },
      data: {
        storeId: location.storeId,
        warehouseId: location.warehouseId,
        inventoryLocationId: location.id,
        supplierId: supplier.id,
        externalReference: input.externalReference?.trim() || null,
        note,
        operatorName,
        subtotalAmount: toMoneyString(subtotalAmount),
        discountAmount: toMoneyString(discountAmount),
        shippingAmount: toMoneyString(shippingAmount),
        freightAmount: toMoneyString(freightAmount),
        otherChargesAmount: toMoneyString(otherChargesAmount),
        taxAmount: toMoneyString(taxAmount),
        grandTotalAmount: toMoneyString(grandTotalAmount),
        sourceNodeCode: enterpriseNode.code,
        lines: {
          create: lines.map((line, index) => {
            const product = productsByCode.get(line.productCode);

            if (!product) {
              throw new Error(
                `Flash ERP could not find product "${line.productCode}".`,
              );
            }

            return {
              id: randomUUID(),
              lineNo: index + 1,
              productId: product.id,
              orderedQuantity: toQuantityString(line.quantity),
              receivedQuantity: toQuantityString(0),
              unitCost:
                line.unitCost === null
                  ? (product.baseCostPrice?.toString() ?? null)
                  : toMoneyString(line.unitCost),
            };
          }),
        },
      },
    });

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      locationCode: location.code,
      nodeCode: null,
      status: "DRAFT",
      lineCount: lines.length,
      message: `Flash ERP updated draft purchase order ${purchaseOrder.purchaseOrderNo}.`,
      serverProcessedAt: new Date().toISOString(),
    };
  });
}

export async function commitPurchaseOrder(
  purchaseOrderId: string,
): Promise<PurchaseOrderLifecycleResponse> {
  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId,
      },
      select: {
        id: true,
        retailOrgId: true,
        purchaseOrderNo: true,
        status: true,
        committedAt: true,
        inventoryLocation: {
          select: {
            code: true,
            name: true,
          },
        },
        lines: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      throw new Error("Flash ERP could not find that purchase order.");
    }

    if (purchaseOrder.lines.length === 0) {
      throw new Error(
        "Flash ERP cannot commit a purchase order with no lines.",
      );
    }

    if (purchaseOrder.status === PurchaseOrderStatus.CLOSED) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchaseOrderNo} is already closed and cannot be recommitted.`,
      );
    }

    const now = new Date();

    if (purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
      await tx.purchaseOrder.update({
        where: {
          id: purchaseOrder.id,
        },
        data: {
          status: PurchaseOrderStatus.COMMITTED,
          committedAt: purchaseOrder.committedAt ?? now,
        },
      });
    }

    const publication = await queuePurchaseOrderPublication(tx, {
      purchaseOrderId: purchaseOrder.id,
      publishedAt: now,
    });

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      locationCode: purchaseOrder.inventoryLocation.code,
      nodeCode: publication?.nodeCode ?? null,
      status:
        purchaseOrder.status === PurchaseOrderStatus.DRAFT
          ? "COMMITTED"
          : toPurchaseOrderLifecycleResponseStatus(purchaseOrder.status),
      message: publication?.nodeCode
        ? `Flash ERP committed ${purchaseOrder.purchaseOrderNo} and queued it for ${publication.nodeCode}.`
        : `Flash ERP committed ${purchaseOrder.purchaseOrderNo}, but no active execution node is available for downstream publication yet.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function closePurchaseOrder(
  purchaseOrderId: string,
  input?: ClosePurchaseOrderRequest,
): Promise<PurchaseOrderLifecycleResponse> {
  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId,
      },
      select: {
        id: true,
        purchaseOrderNo: true,
        status: true,
        operatorName: true,
        closedAt: true,
        inventoryLocation: {
          select: {
            code: true,
          },
        },
        lines: {
          select: {
            orderedQuantity: true,
            receivedQuantity: true,
            exceptionQuantity: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      throw new Error("Flash ERP could not find that purchase order.");
    }

    if (purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
      throw new Error("Commit the purchase order before closing it.");
    }

    if (
      purchaseOrder.status === PurchaseOrderStatus.CLOSED ||
      purchaseOrder.closedAt
    ) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchaseOrderNo} is already closed.`,
      );
    }

    const orderedQuantity = purchaseOrder.lines.reduce(
      (sum, line) => sum + Number(line.orderedQuantity),
      0,
    );
    const receivedQuantity = purchaseOrder.lines.reduce(
      (sum, line) => sum + Number(line.receivedQuantity),
      0,
    );
    const exceptionQuantity = purchaseOrder.lines.reduce(
      (sum, line) => sum + Number(line.exceptionQuantity),
      0,
    );
    const outstandingQuantity = Number(
      Math.max(
        0,
        orderedQuantity - receivedQuantity - exceptionQuantity,
      ).toFixed(3),
    );
    const requestedClosureReason = toPurchaseOrderClosureReason(
      input?.closureReason ?? null,
    );
    const closureReason =
      requestedClosureReason ??
      (outstandingQuantity <= 0.0001
        ? PurchaseOrderClosureReason.FULFILLED
        : null);
    const closureNote = input?.closureNote?.trim() || null;
    const closureOperatorName =
      input?.operatorName?.trim() ||
      purchaseOrder.operatorName ||
      "Flash ERP operator";

    if (!closureReason) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchaseOrderNo} still has ${outstandingQuantity.toFixed(3)} unit(s) outstanding. Choose a closure reason before closing it.`,
      );
    }

    if (
      outstandingQuantity > 0.0001 &&
      closureReason === PurchaseOrderClosureReason.FULFILLED
    ) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchaseOrderNo} still has ${outstandingQuantity.toFixed(3)} unit(s) outstanding and cannot be closed as fulfilled.`,
      );
    }

    if (
      closureReason !== PurchaseOrderClosureReason.FULFILLED &&
      !closureNote
    ) {
      throw new Error(
        "Add a closure note describing the shortage, rejection, or supplier exception before closing this purchase order.",
      );
    }

    const now = new Date();

    await tx.purchaseOrder.update({
      where: {
        id: purchaseOrder.id,
      },
      data: {
        status: PurchaseOrderStatus.CLOSED,
        closedAt: now,
        closureReason,
        closureNote,
        closureOperatorName,
      },
    });

    const publication = await queuePurchaseOrderPublication(tx, {
      purchaseOrderId: purchaseOrder.id,
      publishedAt: now,
    });

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      locationCode: purchaseOrder.inventoryLocation.code,
      nodeCode: publication?.nodeCode ?? null,
      status: "CLOSED",
      message: publication?.nodeCode
        ? `Flash ERP closed ${purchaseOrder.purchaseOrderNo} as ${closureReason.toLowerCase().replace(/_/g, " ")} and queued the closure downstream for ${publication.nodeCode}.`
        : `Flash ERP closed ${purchaseOrder.purchaseOrderNo} as ${closureReason.toLowerCase().replace(/_/g, " ")}.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function updateSupplierClaim(
  claimId: string,
  input: UpdateSupplierClaimRequest,
): Promise<UpdateSupplierClaimResponse> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.supplierClaim.findUnique({
      where: {
        id: claimId,
      },
      select: {
        id: true,
        claimNo: true,
        status: true,
        note: true,
        operatorName: true,
        supplierCaseReference: true,
        creditRequestedAt: true,
        creditRequestedBy: true,
        creditNoteReference: true,
        creditNoteAmount: true,
        creditReceivedAt: true,
        resolvedAt: true,
      },
    });

    if (!claim) {
      throw new Error("Flash ERP could not find that supplier claim.");
    }

    const status = toSupplierClaimStatus(input.status);
    const note = input.note?.trim() || claim.note || null;
    const operatorName =
      input.operatorName?.trim() || claim.operatorName || "Flash ERP operator";
    const supplierCaseReference =
      input.supplierCaseReference === undefined
        ? claim.supplierCaseReference
        : input.supplierCaseReference?.trim() || null;
    const creditNoteReference =
      input.creditNoteReference === undefined
        ? claim.creditNoteReference
        : input.creditNoteReference?.trim() || null;
    const creditNoteAmount =
      input.creditNoteAmount === undefined
        ? claim.creditNoteAmount === null
          ? null
          : Number(claim.creditNoteAmount)
        : input.creditNoteAmount === null
          ? null
          : Number(input.creditNoteAmount);

    if (
      creditNoteAmount !== null &&
      (!Number.isFinite(creditNoteAmount) || creditNoteAmount < 0)
    ) {
      throw new Error(
        "Credit-note amount must be zero or greater when provided.",
      );
    }

    if (
      status === SupplierClaimStatus.CREDIT_RECEIVED &&
      !creditNoteReference &&
      creditNoteAmount === null
    ) {
      throw new Error(
        "Add a credit-note reference or amount before marking this supplier claim as credit received.",
      );
    }

    const now = new Date();
    const creditRequestedAt =
      status === SupplierClaimStatus.CREDIT_REQUESTED ||
      status === SupplierClaimStatus.CREDIT_RECEIVED
        ? (claim.creditRequestedAt ?? now)
        : status === SupplierClaimStatus.OPEN
          ? null
          : claim.creditRequestedAt;
    const creditRequestedBy =
      status === SupplierClaimStatus.CREDIT_REQUESTED ||
      status === SupplierClaimStatus.CREDIT_RECEIVED
        ? (claim.creditRequestedBy ?? operatorName)
        : status === SupplierClaimStatus.OPEN
          ? null
          : claim.creditRequestedBy;
    const creditReceivedAt =
      status === SupplierClaimStatus.CREDIT_RECEIVED
        ? now
        : status === SupplierClaimStatus.OPEN ||
            status === SupplierClaimStatus.CREDIT_REQUESTED
          ? null
          : claim.creditReceivedAt;
    const resolvedAt =
      status === SupplierClaimStatus.CLOSED ||
      status === SupplierClaimStatus.WRITTEN_OFF
        ? now
        : null;

    await tx.supplierClaim.update({
      where: {
        id: claim.id,
      },
      data: {
        status,
        note,
        operatorName,
        supplierCaseReference,
        creditRequestedAt,
        creditRequestedBy,
        creditNoteReference,
        creditNoteAmount:
          creditNoteAmount === null ? null : toMoneyString(creditNoteAmount),
        creditReceivedAt,
        resolvedAt,
      },
    });

    return {
      claimId: claim.id,
      claimNo: claim.claimNo,
      status,
      message:
        status === SupplierClaimStatus.CREDIT_RECEIVED
          ? `Flash ERP recorded supplier credit against ${claim.claimNo}.`
          : status === SupplierClaimStatus.CREDIT_REQUESTED
            ? `Flash ERP marked ${claim.claimNo} as credit requested and started settlement aging.`
            : `Flash ERP updated ${claim.claimNo} to ${status.toLowerCase().replace(/_/g, " ")}.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function cancelSupplierReturn(
  supplierReturnId: string,
  input?: CancelSupplierReturnRequest,
): Promise<CancelSupplierReturnResponse> {
  return prisma.$transaction(async (tx) => {
    const supplierReturn = await tx.supplierReturn.findUnique({
      where: {
        id: supplierReturnId,
      },
      select: {
        id: true,
        retailOrgId: true,
        storeId: true,
        warehouseId: true,
        inventoryLocationId: true,
        supplierReturnNo: true,
        externalReference: true,
        status: true,
        note: true,
        operatorName: true,
        cancelledAt: true,
        inventoryLocation: {
          select: {
            code: true,
            name: true,
          },
        },
        lines: {
          orderBy: {
            lineNo: "asc",
          },
          select: {
            id: true,
            lineNo: true,
            quantity: true,
            unitCost: true,
            serialNumbersSnapshot: true,
            productId: true,
            product: {
              select: {
                code: true,
                name: true,
                isSerialized: true,
              },
            },
          },
        },
      },
    });

    if (!supplierReturn) {
      throw new Error("Flash ERP could not find that supplier return.");
    }

    if (
      supplierReturn.status === SupplierReturnStatus.CANCELLED ||
      supplierReturn.cancelledAt
    ) {
      throw new Error(
        `Supplier return ${supplierReturn.supplierReturnNo} is already cancelled.`,
      );
    }

    if (supplierReturn.lines.length === 0) {
      throw new Error(
        `Supplier return ${supplierReturn.supplierReturnNo} has no lines to reverse back into stock.`,
      );
    }

    const cancellationNote = input?.cancellationNote?.trim() || null;
    const cancellationOperatorName =
      input?.operatorName?.trim() ||
      supplierReturn.operatorName ||
      "Flash ERP operator";

    if (!cancellationNote) {
      throw new Error(
        "Add a cancellation note explaining why Flash ERP is reversing this supplier return.",
      );
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: supplierReturn.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        code: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        "Flash ERP could not find the active primary enterprise node.",
      );
    }

    const now = new Date();
    const externalReference =
      supplierReturn.externalReference ?? supplierReturn.supplierReturnNo;
    const downstreamNodeCodes = new Set<string>();
    const serializedProductIds = new Set<string>();

    await tx.supplierReturn.update({
      where: {
        id: supplierReturn.id,
      },
      data: {
        status: SupplierReturnStatus.CANCELLED,
        cancelledAt: now,
        cancellationNote,
        cancellationOperatorName,
      },
    });

    for (const line of supplierReturn.lines) {
      const quantity = Number(Number(line.quantity).toFixed(3));
      const unitCost = line.unitCost === null ? null : Number(line.unitCost);
      const serialNumbers = toOptionalStringArraySnapshot(
        line.serialNumbersSnapshot,
      );
      const ledgerEntryId = randomUUID();

      await tx.inventoryLedgerEntry.create({
        data: {
          id: ledgerEntryId,
          retailOrgId: supplierReturn.retailOrgId,
          storeId: supplierReturn.storeId,
          warehouseId: supplierReturn.warehouseId,
          inventoryLocationId: supplierReturn.inventoryLocationId,
          productId: line.productId,
          movementType: InventoryMovementType.ADJUSTMENT_POSITIVE,
          quantity: toQuantityString(quantity),
          unitCost: unitCost === null ? null : toMoneyString(unitCost),
          referenceType: "SUPPLIER_RETURN_CANCELLATION",
          referenceId: supplierReturn.id,
          externalReference,
          sourceNodeCode: enterpriseNode.code,
          occurredAt: now,
        },
      });

      const ledgerPublication = await queueInventoryLedgerPublication(tx, {
        retailOrgId: supplierReturn.retailOrgId,
        storeId: supplierReturn.storeId,
        inventoryLocationId: supplierReturn.inventoryLocationId,
        productId: line.productId,
        ledgerEntryId,
        movementType: InventoryMovementType.ADJUSTMENT_POSITIVE,
        quantity,
        serialNumbers,
        unitCost,
        referenceType: "SUPPLIER_RETURN_CANCELLATION",
        referenceId: supplierReturn.id,
        externalReference,
        occurredAt: now,
      });

      if (ledgerPublication?.nodeCode) {
        downstreamNodeCodes.add(ledgerPublication.nodeCode);
      }

      if (line.product.isSerialized) {
        await applyEnterpriseSerializedLedgerMovement(tx, {
          retailOrgId: supplierReturn.retailOrgId,
          storeId: supplierReturn.storeId,
          warehouseId: supplierReturn.warehouseId,
          inventoryLocationId: supplierReturn.inventoryLocationId,
          productId: line.productId,
          movementType: InventoryMovementType.ADJUSTMENT_POSITIVE,
          serialNumbers,
          sourceReferenceType: "SUPPLIER_RETURN_CANCELLATION",
          sourceReferenceId: supplierReturn.id,
          sourceReferenceLabel: externalReference,
          sourceNodeCode: enterpriseNode.code,
          occurredAt: now,
        });
        serializedProductIds.add(line.productId);
      }
    }

    for (const productId of serializedProductIds) {
      const serialPublication = await queueInventorySerialSnapshotPublication(
        tx,
        {
          retailOrgId: supplierReturn.retailOrgId,
          storeId: supplierReturn.storeId,
          productId,
          publishedAt: now,
        },
      );

      if (serialPublication?.nodeCode) {
        downstreamNodeCodes.add(serialPublication.nodeCode);
      }
    }

    const supplierReturnPublication = await queueSupplierReturnPublication(tx, {
      supplierReturnId: supplierReturn.id,
      publishedAt: now,
    });

    if (supplierReturnPublication?.nodeCode) {
      downstreamNodeCodes.add(supplierReturnPublication.nodeCode);
    }

    const [primaryNodeCode] = [...downstreamNodeCodes];

    return {
      supplierReturnId: supplierReturn.id,
      supplierReturnNo: supplierReturn.supplierReturnNo,
      locationCode: supplierReturn.inventoryLocation.code,
      nodeCode: primaryNodeCode ?? null,
      status: "CANCELLED",
      message:
        downstreamNodeCodes.size > 0
          ? `Flash ERP cancelled ${supplierReturn.supplierReturnNo}, restored stock into ${supplierReturn.inventoryLocation.name}, and queued downstream rehydration for ${[...downstreamNodeCodes].join(", ")}.`
          : `Flash ERP cancelled ${supplierReturn.supplierReturnNo} and restored stock into ${supplierReturn.inventoryLocation.name}.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function recordInventoryGoodsReceipt(
  locationCode: string,
  input: InventoryGoodsReceiptRequest,
): Promise<InventoryGoodsReceiptResponse> {
  return prisma.$transaction(async (tx) => {
    const requestedQuantity = Number(input.quantity);

    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new Error("Goods receipt quantity must be greater than zero.");
    }

    const location = await tx.inventoryLocation.findFirst({
      where: {
        code: locationCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeId: true,
        warehouseId: true,
        store: {
          select: {
            code: true,
            name: true,
          },
        },
        warehouse: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!location) {
      throw new Error(
        `Flash ERP could not find inventory location "${locationCode}".`,
      );
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        `Flash ERP does not have an active primary enterprise node for location "${locationCode}".`,
      );
    }

    const product = await tx.product.findFirst({
      where: {
        retailOrgId: location.retailOrgId,
        code: input.productCode,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        trackInventory: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isSerialized: true,
        baseCostPrice: true,
      },
    });

    if (!product) {
      throw new Error(
        `Flash ERP could not find inventory-tracked product "${input.productCode}" for receipt posting.`,
      );
    }

    const serialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const receivedQuantity = product.isSerialized
      ? serialNumbers.length
      : requestedQuantity;

    if (product.isSerialized) {
      if (!Number.isInteger(requestedQuantity)) {
        throw new Error(
          `Serialized product "${product.code}" needs a whole-number goods receipt quantity.`,
        );
      }

      if (serialNumbers.length === 0) {
        throw new Error(
          `Serialized product "${product.code}" needs exact serial numbers before Flash ERP can post the goods receipt.`,
        );
      }

      if (requestedQuantity !== serialNumbers.length) {
        throw new Error(
          `Serialized product "${product.code}" needs ${requestedQuantity} serial number(s) before Flash ERP can post the goods receipt.`,
        );
      }

      const existingSerialUnits = await tx.inventorySerialUnit.findMany({
        where: {
          retailOrgId: location.retailOrgId,
          productId: product.id,
          serialNumber: {
            in: serialNumbers,
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingSerialUnits.length > 0) {
        throw new Error(
          `Flash ERP already knows serial number(s) ${existingSerialUnits
            .map((unit) => unit.serialNumber)
            .join(", ")} for ${product.name}.`,
        );
      }
    } else if (serialNumbers.length > 0) {
      throw new Error(
        `Product "${product.code}" is not serialized, so the goods receipt should not include serial numbers.`,
      );
    }

    const supplierNo = input.supplierNo?.trim().toUpperCase() || null;
    const supplier =
      supplierNo === null
        ? null
        : await tx.supplier.findFirst({
            where: {
              retailOrgId: location.retailOrgId,
              supplierNo,
              status: RecordStatus.ACTIVE,
            },
            select: {
              id: true,
              supplierNo: true,
              name: true,
            },
          });

    if (supplierNo && !supplier) {
      throw new Error(
        `Flash ERP could not find active supplier "${supplierNo}".`,
      );
    }

    const now = new Date();
    const receiptNo = buildGoodsReceiptNo(location.code, now);
    const goodsReceiptId = randomUUID();
    const ledgerEntryId = randomUUID();
    const postStockImmediately = await shouldPostStockImmediately(
      tx,
      location.retailOrgId,
      location.storeId,
    );
    const operatorName = input.operatorName?.trim() || "Flash ERP operator";
    const note =
      input.note?.trim() ||
      `Recording a goods receipt for ${product.name} into ${location.name} from the Flash ERP enterprise workspace.`;
    const externalReference = input.externalReference?.trim() || receiptNo;
    const unitCost =
      input.unitCost === null || input.unitCost === undefined
        ? product.baseCostPrice === null
          ? null
          : Number(product.baseCostPrice)
        : Number(input.unitCost);

    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      throw new Error("Unit cost must be zero or greater when provided.");
    }

    await tx.goodsReceipt.create({
      data: {
        id: goodsReceiptId,
        retailOrgId: location.retailOrgId,
        storeId: location.storeId,
        warehouseId: location.warehouseId,
        inventoryLocationId: location.id,
        supplierId: supplier?.id ?? null,
        receiptNo,
        externalReference,
        note,
        operatorName,
        stockUpdateStatus: postStockImmediately
          ? STOCK_UPDATE_STATUS_POSTED
          : STOCK_UPDATE_STATUS_PENDING,
        stockConfirmedAt: postStockImmediately ? now : null,
        stockConfirmedBy: postStockImmediately ? operatorName : null,
        receivedAt: now,
        postedAt: now,
        sourceNodeCode: enterpriseNode.code,
        lines: {
          create: {
            lineNo: 1,
            productId: product.id,
            quantity: toQuantityString(receivedQuantity),
            unitCost: unitCost === null ? null : toMoneyString(unitCost),
            ...(serialNumbers.length > 0
              ? { serialNumbersSnapshot: serializeJsonField(serialNumbers) }
              : {}),
          },
        },
      },
    });

    if (postStockImmediately) {
      await tx.inventoryLedgerEntry.create({
        data: {
          id: ledgerEntryId,
          retailOrgId: location.retailOrgId,
          storeId: location.storeId,
          warehouseId: location.warehouseId,
          inventoryLocationId: location.id,
          productId: product.id,
          movementType: InventoryMovementType.GOODS_RECEIPT,
          quantity: toQuantityString(receivedQuantity),
          unitCost: unitCost === null ? null : toMoneyString(unitCost),
          referenceType: "GOODS_RECEIPT",
          referenceId: goodsReceiptId,
          externalReference,
          sourceNodeCode: enterpriseNode.code,
          occurredAt: now,
        },
      });
    }

    if (postStockImmediately && product.isSerialized) {
      await applyEnterpriseSerializedLedgerMovement(tx, {
        retailOrgId: location.retailOrgId,
        storeId: location.storeId,
        warehouseId: location.warehouseId,
        inventoryLocationId: location.id,
        productId: product.id,
        movementType: InventoryMovementType.GOODS_RECEIPT,
        serialNumbers,
        sourceReferenceType: "GOODS_RECEIPT",
        sourceReferenceId: goodsReceiptId,
        sourceReferenceLabel: externalReference,
        sourceNodeCode: enterpriseNode.code,
        occurredAt: now,
      });
    }

    const targetStoreNode =
      location.storeId === null
        ? null
        : await tx.syncNode.findFirst({
            where: {
              retailOrgId: location.retailOrgId,
              storeId: location.storeId,
              nodeType: SyncNodeType.STORE_DESKTOP,
              status: RecordStatus.ACTIVE,
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              code: true,
              terminal: {
                select: {
                  code: true,
                },
              },
            },
          });

    if (postStockImmediately && location.store && targetStoreNode?.terminal?.code) {
      await tx.syncOutboxEvent.create({
        data: {
          id: randomUUID(),
          syncNodeId: enterpriseNode.id,
          targetNodeCode: targetStoreNode.code,
          aggregateType: "inventoryLedgerEntry",
          aggregateId: ledgerEntryId,
          eventType: "inventory.ledger.published",
          idempotencyKey: `${enterpriseNode.code}:inventoryLedgerEntry:goods-receipt:${ledgerEntryId}`,
          payload: serializeRequiredJsonField({
            ledgerEntryId,
            storeCode: location.store.code,
            terminalCode: targetStoreNode.terminal.code,
            inventoryLocationCode: location.code,
            productCode: product.code,
            movementType: "GOODS_RECEIPT",
            quantity: receivedQuantity,
            ...(serialNumbers.length > 0 ? { serialNumbers } : {}),
            unitCost,
            referenceType: "GOODS_RECEIPT",
            referenceId: goodsReceiptId,
            externalReference,
            occurredAt: now.toISOString(),
          } satisfies StoreInventoryLedgerRecordedPayload),
          status: SyncEventStatus.PENDING,
        },
      });
    }

    return {
      goodsReceiptId,
      receiptNo,
      locationCode: location.code,
      productCode: product.code,
      quantity: receivedQuantity,
      serialNumbers,
      operatorName,
      note,
      message:
        !postStockImmediately
          ? `Flash ERP saved goods receipt ${receiptNo} for ${product.name} into ${location.name}; stock update is pending HQ confirmation.`
          : location.store && targetStoreNode?.terminal?.code
          ? `Flash ERP posted goods receipt ${receiptNo} for ${product.name} into ${location.name} and queued the downstream receipt packet for ${targetStoreNode.code}.`
          : `Flash ERP posted goods receipt ${receiptNo} for ${product.name} into ${location.name}.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}

export async function publishStoreInventoryLocations(
  storeCode: string,
  input?: PublishStoreLocationsRequest | null,
): Promise<PublishStoreLocationsResponse> {
  await ensureInventoryLocationSalesOrderSchemaCompatibility();

  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        code: storeCode,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
        retailOrgId: true,
        storeMode: true,
      },
    });

    if (!store) {
      throw new Error(`Flash ERP could not find active store "${storeCode}".`);
    }

    const enterpriseNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: store.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: RecordStatus.ACTIVE,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!enterpriseNode) {
      throw new Error(
        `Flash ERP does not have an active primary enterprise node for store "${storeCode}".`,
      );
    }

    const targetStoreNode = await tx.syncNode.findFirst({
      where: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
      },
    });

    const locations = await tx.inventoryLocation.findMany({
      where: {
        retailOrgId: store.retailOrgId,
        storeId: store.id,
        status: RecordStatus.ACTIVE,
      },
      orderBy: [{ useForSalesDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        locationType: true,
        status: true,
          useForSalesDefault: true,
          useForSalesOrderDefault: true,
          useForReceivingDefault: true,
        warehouse: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (locations.length === 0) {
      throw new Error(
        `Flash ERP could not find any active inventory locations for store "${store.name}".`,
      );
    }

    if (!targetStoreNode && store.storeMode === "ONLINE_DIRECT") {
      const audit = toOperatorAuditInput(
        input,
        `Publishing ${locations.length} active inventory location(s) for online store ${store.code}.`,
      );
      const now = new Date();

      return {
        nodeCode: "ONLINE_DIRECT",
        storeCode: store.code,
        publishedCount: locations.length,
        note: audit.note,
        operatorName: audit.operatorName,
        message: `Flash ERP confirmed ${locations.length} active inventory location(s) for online store ${store.name}. Online shops read this topology directly from enterprise, so no desktop sync packet was queued.`,
        serverProcessedAt: now.toISOString(),
      };
    }

    if (!targetStoreNode) {
      throw new Error(
        `Flash ERP could not find an active desktop node for store "${store.name}".`,
      );
    }

    const audit = toOperatorAuditInput(
      input,
      `Publishing ${locations.length} active inventory location(s) from enterprise to ${targetStoreNode.code}.`,
    );
    const now = new Date();
    const publicationBatchId = randomUUID();

    for (const location of locations) {
      const outboxEventId = randomUUID();
      const payload: EnterpriseInventoryLocationPublishedPayload = {
        storeCode: store.code,
        locationCode: location.code,
        locationName: location.name,
        locationType: location.locationType,
        status: location.status,
        defaults: formatLocationDefaults(location),
        useForSalesDefault: location.useForSalesDefault,
        useForSalesOrderDefault: location.useForSalesOrderDefault,
        useForReceivingDefault: location.useForReceivingDefault,
        warehouseCode: location.warehouse?.code ?? null,
        warehouseName: location.warehouse?.name ?? null,
        publishedAt: now.toISOString(),
      };

      await tx.syncOutboxEvent.create({
        data: {
          id: outboxEventId,
          syncNodeId: enterpriseNode.id,
          targetNodeCode: targetStoreNode.code,
          aggregateType: "inventoryLocation",
          aggregateId: location.id,
          eventType: "inventory.location.published",
          idempotencyKey: `${enterpriseNode.code}:inventoryLocation:publish:${publicationBatchId}:${location.code}`,
          payload: serializeRequiredJsonField(payload),
          status: SyncEventStatus.PENDING,
        },
      });

      await createOperatorAuditAction(tx, {
        syncNodeId: targetStoreNode.id,
        syncOutboxEventId: outboxEventId,
        syncInboundEventId: null,
        actionType: SyncOperatorActionType.PUBLISH_LOCATION_TOPOLOGY,
        operatorName: audit.operatorName,
        note: audit.note,
        aggregateType: "inventoryLocation",
        eventType: "inventory.location.published",
      });
    }

    await tx.syncNode.update({
      where: { id: targetStoreNode.id },
      data: {
        lastHeartbeatAt: now,
      },
    });

    return {
      nodeCode: targetStoreNode.code,
      storeCode: store.code,
      publishedCount: locations.length,
      note: audit.note,
      operatorName: audit.operatorName,
      message: `Flash ERP queued ${locations.length} inventory location publication packet(s) for ${targetStoreNode.code}. The store desktop can now hydrate its local location topology from enterprise.`,
      serverProcessedAt: now.toISOString(),
    };
  });
}
