import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import sql from "mssql";
import { deriveRetailUserCapabilities } from "@flash-erp/domain";
import {
  getRetryDelayMs,
  MAX_SYNC_RETRY_ATTEMPTS,
  shouldMoveToDeadLetter,
} from "@flash-erp/sync-core";
import type {
  EnterpriseBankAccountPublishedPayload,
  EnterpriseBarcodePublishedPayload,
  EnterpriseCatalogProductPublishedPayload,
  EnterpriseCustomerPublishedPayload,
  EnterpriseGiftCertificatePublishedPayload,
  EnterpriseInventoryLocationPublishedPayload,
  EnterpriseInventorySerialSnapshotPublishedPayload,
  EnterpriseInterStoreTransferRequestTargetPublishedPayload,
  EnterprisePermissionPublishedPayload,
  EnterprisePriceListPublishedPayload,
  EnterpriseProductCategoryPublishedPayload,
  EnterpriseProductDepartmentPublishedPayload,
  EnterprisePromotionPublishedPayload,
  EnterprisePurchaseOrderPublishedPayload,
  EnterpriseRetailUserPublishedPayload,
  EnterpriseRolePublishedPayload,
  EnterpriseStoreSettingsPublishedPayload,
  EnterpriseTaxProfilePublishedPayload,
  EnterpriseTenderMethodPublishedPayload,
  EnterpriseUnitOfMeasurePublishedPayload,
  StoreNodePullResponse,
  StoreNodePushRequest,
  StoreNodePushResponse,
  StoreNodeSyncTrigger,
  StoreNodeTelemetry,
  StoreBankingDepositRecordedPayload,
  StoreCustomerAccountEntryRecordedPayload,
  StoreEodReconciliationRecordedPayload,
  StoreExpenseConfirmedPayload,
  StoreGoodsReceiptRecordedPayload,
  StoreInventoryLedgerRecordedPayload,
  StoreInterStoreTransferIssuedPayload,
  StoreInterStoreTransferReceivedPayload,
  StoreInterStoreTransferRequestedPayload,
  StorePosShiftClosedPayload,
  StorePosShiftOpenedPayload,
  StorePosTransactionCompletedPayload,
  StoreSalesOrderRecordedPayload,
  StoreStockCountSessionSubmittedPayload,
  StoreSupplierReturnCancellationAcknowledgedPayload,
  StoreSupplierReturnRecordedPayload,
  StoreSyncRecoveryTaskCompletedPayload,
  SyncEnvelope,
  SyncPaymentMethod,
  SyncPosLineIntent,
  SyncPosTransactionType,
  SyncRejectedEnvelope,
} from "@flash-erp/sync-core";

import {
  computeNextStoreSyncAt,
  readStoreSyncPolicyFromMetadata,
  storeSyncPolicyToMetadataEntries,
} from "../../shared/desktop-runtime.js";
import {
  postSyncJsonRaw,
  SyncHttpClientError,
} from "../sync-http-client.js";
import {
  createPosReceiptSeriesToken,
  formatPosTransactionNumber,
  isLegacyPosTransactionNumber,
  isPosReceiptSeriesToken,
  POS_RECEIPT_MAX_SEQUENCE,
  POS_RECEIPT_SEQUENCE_METADATA_KEY,
  POS_RECEIPT_SERIES_TOKEN_METADATA_KEY,
} from "../pos-transaction-number.js";
import type {
  StoreBankAccountSummary,
  StoreBasketCheckoutRequest,
  StoreBasketCustomerAttachmentInput,
  StoreBasketItemRequest,
  StoreBasketLoyaltyRedemptionInput,
  StoreBasketLineSummary,
  StoreBasketLineUpdateRequest,
  StoreBasketSummary,
  StoreCatalogBrowseItem,
  StoreCatalogBrowseRequest,
  StoreCatalogLookupResult,
  StoreCatalogMatrixVariant,
  StoreCashDrawerKickRequest,
  StoreCustomerAccountEntrySummary,
  StoreCustomerAccountPaymentRequest,
  StoreCustomerSearchRequest,
  StoreCustomerSummary,
  StoreTransactionReferenceSearchRequest,
  StoreTransactionReferenceSummary,
  StoreCancelSalesOrderRequest,
  StoreCreateSalesOrderRequest,
  StoreDeploymentMode,
  StoreAccountPaymentReportRow,
  StoreBankingDepositSummary,
  StoreBankingReportRow,
  StoreEodReconciliationSummary,
  StoreInventoryBrowseItem,
  StoreInventoryBrowseRequest,
  StoreInventoryLocationSummary,
  StoreInventoryReportRow,
  StoreInterStoreTransferBrowseRequest,
  StoreInterStoreTransferRequestDraftInput,
  StoreInterStoreTransferRequestDraftSummary,
  StoreInterStoreTransferSummary,
  StoreLocalGoodsReceiptSummary,
  StoreLocalSupplierReturnSummary,
  StoreLocalReceiptLogoInput,
  StoreOperationsMetrics,
  StoreOperatorCapabilities,
  StoreOperatorSessionSummary,
  StoreOperatorSignInInput,
  StoreProductSalesReportRow,
  StorePurchaseOrderBrowseRequest,
  StorePurchaseOrderReceiptRequest,
  StorePurchaseOrderSummary,
  StoreQueueMetrics,
  StorePrintableReceiptDocument,
  StorePrintableAccountPaymentReceiptDocument,
  StoreRecordBankingDepositRequest,
  StoreRecordEodReconciliationRequest,
  StoreStoreExpenseInput,
  StoreReceiptLineReturnRequest,
  StoreReceiptLookupLine,
  StoreReceiptLookupResult,
  StoreReceiptPrinterSettingsInput,
  StoreReceiptPrinterSettingsSummary,
  StoreReceiptSearchRequest,
  StoreReceiptSearchResult,
  StoreReportBrowseRequest,
  StoreReportResult,
  StoreRemoteInterStoreStockRequestInput,
  StoreRemoteInventoryLookupInput,
  StoreRemoteInventoryLookupResult,
  StoreSalesOrderSummary,
  StoreSellCaptureRequest,
  StoreShiftCloseInput,
  StoreShiftOpenInput,
  StoreShiftReportRow,
  StoreShiftSummary,
  StoreShiftTenderSummary,
  StoreSerialRegistryBrowseItem,
  StoreSerialRegistryBrowseRequest,
  StoreSerialRegistryStatus,
  StoreStandaloneBankAccountInput,
  StoreStandaloneCategoryInput,
  StoreStandaloneCustomerInput,
  StoreStandaloneDepartmentInput,
  StoreStandaloneLocationInput,
  StoreStandalonePasswordPolicyInput,
  StoreStandalonePriceInput,
  StoreStandaloneProductInput,
  StoreStandalonePromotionInput,
  StoreStandalonePurchaseOrderInput,
  StoreStandaloneRoleInput,
  StoreStandaloneSettingsInput,
  StoreStandaloneSetupResult,
  StoreStandaloneSupplierInput,
  StoreStandaloneTaxProfileInput,
  StoreStandaloneTenderInput,
  StoreStandaloneUnitInput,
  StoreStandaloneUserInput,
  StoreStockCountSessionDraftInput,
  StoreStockCountSessionSummary,
  StoreSupplierReturnCancellationAcknowledgementRequest,
  StoreSupplierReturnRequest,
  StoreInterStoreTransferIssueRequest,
  StoreInterStoreTransferReceiveRequest,
  StoreSalesReportRow,
  StoreSupervisorOverrideInput,
  StoreSyncActionResult,
  StoreSyncHealth,
  StoreSyncRun,
  StoreSyncRunOptions,
  StoreSyncSnapshot,
  StoreTenderReportRow,
  StoreTenderMethodSummary,
  StoreTransferRequestTargetSummary,
  StoreTransactionSummary,
  StoreUserSummary,
} from "../../shared/desktop-runtime.js";
import type { StoreTerminalContext } from "../offline/local-store-service.js";
import { normalizeStoreMssqlConnectionString } from "./store-mssql-adapter.js";

const ENTERPRISE_NODE_CODE = "enterprise-primary";
const DEFAULT_SYNC_PULL_LIMIT = 5;
const MAX_SYNC_PULL_LIMIT = 10;
const MAX_SYNC_RESPONSE_BYTES = 8 * 1024 * 1024;
const ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE =
  "ENTERPRISE_DATABASE_SCHEMA_NOT_READY";
const enterpriseDatabaseSchemaNotReadyMessage =
  "Enterprise database schema is not ready for this Flash ERP build. Apply the pending Prisma migrations on HQ and restart the enterprise server before retrying sync.";

const defaultStoreConfig = {
  retailOrgName: "Flash Retail",
  storeCode: "accra-central",
  storeName: "Accra Central",
  terminalCode: "front-01",
  nodeCode: process.env.FLASH_ERP_STORE_NODE_CODE ?? "store-accra-central-01",
} as const;
const syncPaymentMethods = new Set<SyncPaymentMethod>([
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "STORE_CREDIT",
  "GIFT_CARD",
  "OTHER",
]);

type MssqlStoreServiceOptions = {
  connectionString: string;
  deploymentMode?: StoreDeploymentMode | string | null;
  syncBaseUrl?: string | null;
  nodeCode?: string | null;
  terminalCode?: string | null;
  clientName?: string | null;
  connectionTimeoutMs?: number;
};

type MssqlRunner = sql.ConnectionPool | sql.Transaction;

type OutboxEnvelopeRow = {
  id: string;
  target_node_code: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  idempotency_key: string;
  payload_json: string;
  attempt_count: number;
  record_version: number;
  created_at: string;
};

type InboxEnvelopeRow = {
  id: string;
  status: string;
  acknowledged_at: string | null;
};

type FailedInboxEnvelopeRow = {
  id: string;
  source_node_code: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload_json: string;
  received_at: string;
};

type StoreMssqlUpstreamEventInput = {
  aggregateType: SyncEnvelope["aggregateType"];
  aggregateId: string;
  eventType: string;
  payload: unknown;
  idempotencyKey?: string | null;
  targetNodeCode?: string | null;
  recordVersion?: number | null;
  occurredAt?: string | null;
};

type StoreMssqlOutboxEventInput = StoreMssqlUpstreamEventInput & {
  nodeCode: string;
  eventId?: string | null;
  timestamp: string;
};

type StoreSyncFailureKind =
  | "HTTP"
  | "SERVER"
  | "TIMEOUT"
  | "NETWORK"
  | "SCHEMA"
  | "UNKNOWN";

type ProductRow = {
  id: string;
  product_code: string;
  product_name: string;
  product_type: string;
  short_name: string | null;
  description: string | null;
  primary_image_url: string | null;
  department_code: string | null;
  category_code: string | null;
  subcategory: string | null;
  unit_of_measure: string;
  taxable: string | number;
  tax_profile_code: string | null;
  tax_profile_name: string | null;
  tax_rate_percent: string | number | null;
  tax_inclusive: string | number;
  track_inventory: string | number;
  is_serialized: string | number;
  track_size: string | number;
  track_color: string | number;
  must_enter_price_at_pos: string | number;
  min_stock_level: string | number | null;
  reorder_point: string | number | null;
  safety_stock_level: string | number | null;
  catalog_membership_active?: string | number;
  catalog_sort_order?: string | number | null;
  unit_price: string | number;
  quantity_on_hand: string | number;
  updated_at?: string;
};

type ProductVariantSnapshotRow = {
  id: string;
  product_code: string;
  variant_code: string;
  sku: string | null;
  display_name: string | null;
  unit_price: string | number;
  quantity_on_hand: string | number;
  barcode: string | null;
  status: string;
  attributes_json: string | null;
  updated_at: string;
};

type CatalogLookupRow = ProductRow & {
  barcode_code: string | null;
  barcode_type: string | null;
  matched_on: "barcode" | "productCode";
  product_variant_code: string | null;
  sales_location_code: string | null;
  sales_location_quantity: string | number | null;
};

type CustomerRow = {
  id: string;
  customer_no: string;
  full_name: string;
  customer_type: string;
  phone: string | null;
  email: string | null;
  home_store_code: string | null;
  home_store_name: string | null;
  city: string | null;
  country_code: string | null;
  loyalty_enrolled: string | number;
  loyalty_tier: string | null;
  loyalty_points_balance: string | number;
  allow_credit_sales: string | number;
  credit_limit_amount: string | number | null;
  receivable_balance_amount: string | number;
  note: string | null;
  status: string;
  updated_at: string;
};

type InventoryBrowseRow = {
  location_code: string;
  location_name: string;
  product_code: string;
  product_name: string;
  short_name: string | null;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  quantity_on_hand: string | number;
  min_stock_level: string | number | null;
  reorder_point: string | number | null;
  safety_stock_level: string | number | null;
  unit_price: string | number;
  is_serialized: string | number;
  updated_at: string;
};

type SerialRegistryBrowseRow = {
  product_code: string;
  product_name: string | null;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  serial_number: string;
  inventory_location_code: string | null;
  location_name: string | null;
  status: StoreSerialRegistryStatus;
  source_transaction_id: string | null;
  source_transaction_no: string | null;
  updated_at: string;
};

type SerialRegistryRow = {
  id: string;
  product_code: string;
  serial_number: string;
  inventory_location_code: string | null;
  status: StoreSerialRegistryStatus;
  source_transaction_id: string | null;
  source_transaction_no: string | null;
  updated_at: string;
};

type PurchaseOrderSnapshotRow = {
  id: string;
  purchase_order_no: string;
  status: StorePurchaseOrderSummary["status"];
  inventory_location_code: string;
  inventory_location_name: string;
  supplier_no: string | null;
  supplier_name: string | null;
  external_reference: string | null;
  note: string | null;
  operator_name: string | null;
  ordered_quantity: string | number;
  received_quantity: string | number;
  exception_quantity: string | number;
  outstanding_quantity: string | number;
  committed_at: string | null;
  closed_at: string | null;
  closure_reason: StorePurchaseOrderSummary["closureReason"] | null;
  closure_note: string | null;
  closure_operator_name: string | null;
  updated_at: string;
};

type PurchaseOrderLineSnapshotRow = {
  id: string;
  purchase_order_id: string;
  line_no: string | number;
  product_code: string;
  product_name: string;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  is_serialized: string | number;
  ordered_quantity: string | number;
  received_quantity: string | number;
  exception_quantity: string | number;
  outstanding_quantity: string | number;
  unit_cost: string | number | null;
  updated_at: string;
};

type InterStoreTransferSnapshotRow = {
  id: string;
  transfer_no: string;
  transfer_batch_no: string | null;
  line_no: string | number;
  role: StoreInterStoreTransferSummary["role"];
  origin: StoreInterStoreTransferSummary["origin"];
  status: StoreInterStoreTransferSummary["status"];
  external_reference: string | null;
  source_store_code: string;
  source_store_name: string;
  source_location_code: string;
  source_location_name: string;
  destination_store_code: string;
  destination_store_name: string;
  destination_location_code: string;
  destination_location_name: string;
  product_code: string;
  product_name: string;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  is_serialized: string | number;
  requested_quantity: string | number;
  issued_quantity: string | number;
  received_quantity: string | number;
  outstanding_issue_quantity: string | number;
  outstanding_receipt_quantity: string | number;
  unit_cost: string | number | null;
  issued_serial_numbers_json: string | null;
  received_serial_numbers_json: string | null;
  request_note: string | null;
  issue_note: string | null;
  receipt_note: string | null;
  request_operator_name: string | null;
  issue_operator_name: string | null;
  receipt_operator_name: string | null;
  requested_by_node_code: string | null;
  source_node_code: string | null;
  destination_node_code: string | null;
  requested_at: string;
  required_at: string | null;
  issued_at: string | null;
  received_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

type TransferRequestTargetSnapshotRow = {
  source_store_code: string;
  source_store_name: string;
  source_store_sales_enabled: string | number;
  source_store_warehouse_enabled: string | number;
  source_location_code: string;
  source_location_name: string;
  source_location_type: string;
  source_location_status: string;
  source_location_defaults: string;
  source_warehouse_code: string | null;
  source_warehouse_name: string | null;
  use_for_sales_default: string | number;
  use_for_receiving_default: string | number;
  updated_at: string;
};

type InterStoreTransferRequestDraftRow = {
  id: string;
  request_no: string;
  status: StoreInterStoreTransferRequestDraftSummary["status"];
  source_store_code: string;
  source_store_name: string;
  source_location_code: string;
  source_location_name: string;
  destination_store_code: string;
  destination_store_name: string;
  destination_location_code: string;
  destination_location_name: string;
  product_code: string;
  product_name: string;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  is_serialized: string | number;
  quantity: string | number;
  external_reference: string | null;
  note: string | null;
  operator_name: string;
  submitted_at: string | null;
  updated_at: string;
};

type LocalGoodsReceiptRow = {
  id: string;
  goods_receipt_no: string;
  purchase_order_id: string | null;
  purchase_order_no: string | null;
  inventory_location_code: string;
  inventory_location_name?: string | null;
  supplier_no: string | null;
  supplier_name: string | null;
  external_reference: string | null;
  note?: string | null;
  operator_name?: string;
  total_quantity?: string | number;
  exception_quantity?: string | number;
  synced_at?: string | null;
  received_at?: string;
  updated_at?: string;
};

type LocalGoodsReceiptLineRow = {
  id: string;
  local_goods_receipt_id: string;
  purchase_order_line_id: string | null;
  line_no: string | number;
  product_code: string;
  product_name: string;
  quantity: string | number;
  unit_cost: string | number | null;
  serial_numbers_json: string | null;
  updated_at?: string;
};

type LocalSupplierReturnRow = {
  id: string;
  supplier_return_no: string;
  purchase_order_id: string | null;
  purchase_order_no: string | null;
  goods_receipt_id: string;
  goods_receipt_no: string;
  inventory_location_code: string;
  supplier_no: string;
  supplier_name: string;
  external_reference: string | null;
  reason: StoreLocalSupplierReturnSummary["reason"];
  status: StoreLocalSupplierReturnSummary["status"];
  note: string | null;
  operator_name: string;
  total_quantity: string | number;
  synced_at: string | null;
  returned_at: string;
  cancelled_at: string | null;
  cancellation_note: string | null;
  cancellation_operator_name: string | null;
  cancellation_acknowledged_at: string | null;
  cancellation_acknowledged_by: string | null;
  cancellation_acknowledgement_note: string | null;
  cancellation_ack_synced_at: string | null;
  updated_at: string;
};

type RecoveryTaskRow = {
  id: string;
  task_type: string;
  status: string;
  title: string;
  instructions: string;
  source_inbound_event_id: string | null;
  source_event_type: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  transaction_no: string | null;
  product_code: string | null;
  replacement_aggregate_type: SyncEnvelope["aggregateType"] | null;
  replacement_aggregate_id: string | null;
  replacement_event_type: string | null;
  replacement_record_version: string | number;
  replacement_payload_json: string | null;
  operator_name: string | null;
  operator_note: string | null;
  store_note: string | null;
  requested_at: string;
  completed_at: string | null;
};

type StockCountSessionRow = {
  id: string;
  session_no: string;
  status: StoreStockCountSessionSummary["status"];
  inventory_location_code: string;
  inventory_location_name: string;
  product_code: string;
  product_name: string;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  is_serialized: string | number;
  previous_quantity: string | number;
  counted_quantity: string | number;
  variance_quantity: string | number;
  previous_serial_numbers_json: string | null;
  counted_serial_numbers_json: string | null;
  note: string | null;
  operator_name: string;
  submitted_at: string | null;
  committed_at: string | null;
  updated_at: string;
};

type RetailUserRow = {
  id: string;
  login_id: string;
  email: string | null;
  display_name: string;
  account_status: string;
  home_store_code: string | null;
  home_store_name: string | null;
  role_codes_json: string | null;
  role_names_json: string | null;
  permission_codes_json: string | null;
  password_hash: string | null;
  updated_at: string;
};

type ActiveOperatorSessionRow = RetailUserRow & {
  session_id: string;
  terminal_code: string | null;
  opened_at: string;
  last_seen_at: string;
  user_id: string;
};

type PosShiftRow = {
  id: string;
  shift_no: string;
  terminal_code: string;
  cashier_code: string;
  status: "OPEN" | "CLOSED";
  opening_float_amount: string | number;
  closing_declared_cash: string | number | null;
  closing_variance: string | number | null;
  opened_at: string;
  closed_at: string | null;
  record_version: string | number;
};

type BasketHeaderRow = {
  id: string;
  transaction_no: string;
  customer_id: string | null;
  customer_no: string | null;
  customer_name: string | null;
  customer_type: string | null;
  customer_loyalty_enrolled: string | number | null;
  customer_loyalty_tier: string | null;
  customer_loyalty_points_balance: string | number | null;
  source_transaction_id: string | null;
  source_transaction_no: string | null;
  transaction_type: SyncPosTransactionType;
  status: string;
  subtotal_amount: string | number;
  discount_amount: string | number;
  loyalty_redemption_points: string | number;
  loyalty_redemption_amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  change_amount: string | number;
  notes: string | null;
  header_reference: string | null;
  additional_details: string | null;
  updated_at: string;
  completed_at: string | null;
  record_version: string | number;
};

type BasketLineRow = {
  id: string;
  pos_transaction_id: string;
  product_id: string;
  inventory_location_code: string | null;
  line_intent: SyncPosLineIntent;
  source_line_id: string | null;
  applied_promotion_code: string | null;
  applied_promotion_name: string | null;
  product_code_snapshot: string;
  product_variant_code_snapshot: string | null;
  product_name_snapshot: string;
  variant_size: string | null;
  variant_color: string | null;
  variant_attributes_snapshot: string | null;
  line_note: string | null;
  serial_numbers_json: string | null;
  quantity: string | number;
  unit_price: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  line_total: string | number;
  manual_price_override: string | number;
  manual_discount_override: string | number;
};

type PosPaymentRow = {
  id: string;
  tender_method_code: string | null;
  tender_method_name: string | null;
  bank_account_id: string | null;
  bank_code: string | null;
  bank_name: string | null;
  bank_branch_code: string | null;
  bank_branch_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  method: SyncPaymentMethod;
  amount: string | number;
  reference: string | null;
  received_at: string;
};

type InventoryLocationSummaryRow = {
  location_code: string;
  location_name: string;
  location_type: string;
  status: string;
  defaults: string | null;
  is_sales_default: string | number;
  is_sales_order_default: string | number;
  is_receiving_default: string | number;
  updated_at: string;
  tracked_products: string | number;
  on_hand_quantity: string | number;
  negative_positions: string | number;
};

type InventoryLocationHighlightRow = {
  location_code: string;
  product_code: string;
  quantity_on_hand: string | number;
};

type CustomerAccountEntryRow = {
  id: string;
  entry_no: string;
  customer_id: string;
  customer_no: string;
  customer_name: string;
  entry_type: "ACCOUNT_PAYMENT";
  payment_method: SyncPaymentMethod;
  tender_method_code: string | null;
  tender_method_name: string | null;
  amount: string | number;
  reference: string | null;
  note: string | null;
  shift_id: string;
  shift_no: string | null;
  cashier_code: string | null;
  synced_at: string | null;
  occurred_at: string;
  updated_at: string;
};

type ReportSalesRow = {
  transaction_no: string;
  transaction_type: SyncPosTransactionType;
  source_transaction_no: string | null;
  subtotal_amount: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  completed_at: string | null;
  customer_no: string | null;
  customer_name: string | null;
  cashier_code: string | null;
  line_count: string | number;
  product_preview: string | null;
};

type ReportTenderRow = {
  method: SyncPaymentMethod;
  tender_method_code: string | null;
  tender_method_name: string | null;
  transaction_count: string | number;
  net_amount: string | number;
};

type ReportAccountPaymentRow = {
  entry_no: string;
  occurred_at: string;
  cashier_code: string | null;
  customer_no: string;
  customer_name: string;
  payment_method: SyncPaymentMethod;
  tender_method_code: string | null;
  tender_method_name: string | null;
  amount: string | number;
  reference: string | null;
};

type ReportProductRow = {
  product_code: string;
  product_name: string;
  quantity: string | number;
  gross_amount: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  net_amount: string | number;
};

type ReportInventoryRow = {
  location_code: string;
  location_name: string;
  product_code: string;
  product_name: string;
  quantity_on_hand: string | number;
  unit_price: string | number;
  updated_at: string;
};

type ReportBankingRow = {
  deposit_no: string;
  reconciliation_no: string;
  shift_no: string;
  deposited_at: string;
  operator_name: string | null;
  bank_name: string | null;
  bank_branch_name: string | null;
  bank_account_number: string | null;
  amount: string | number;
  reference: string | null;
};

type EodReconciliationRow = {
  id: string;
  reconciliation_no: string;
  shift_id: string;
  shift_no: string;
  cashier_code: string;
  expected_cash_amount: string | number;
  declared_cash_amount: string | number;
  variance_amount: string | number;
  net_sales_amount: string | number;
  cash_tendered_amount: string | number;
  non_cash_tendered_amount: string | number;
  transaction_count: string | number;
  operator_name: string | null;
  note: string | null;
  synced_at: string | null;
  reconciled_at: string;
  updated_at: string;
};

type BankingDepositRow = {
  id: string;
  deposit_no: string;
  reconciliation_id: string;
  reconciliation_no: string;
  shift_id: string;
  shift_no: string;
  bank_account_id: string | null;
  bank_code: string | null;
  bank_name: string | null;
  bank_branch_code: string | null;
  bank_branch_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  amount: string | number;
  reference: string | null;
  note: string | null;
  operator_name: string | null;
  synced_at: string | null;
  deposited_at: string;
  updated_at: string;
};

type SalesOrderRow = {
  id: string;
  order_no: string;
  source_transaction_id: string;
  source_transaction_no: string;
  customer_id: string | null;
  customer_no: string | null;
  customer_name: string | null;
  status: "OPEN" | "FULFILLED" | "CANCELLED";
  total_amount: string | number;
  deposit_amount: string | number;
  balance_amount: string | number;
  deposit_tender_method_code: string | null;
  deposit_tender_method_name: string | null;
  deposit_payment_method: SyncPaymentMethod | null;
  deposit_reference: string | null;
  deposit_paid_at: string | null;
  line_count: string | number;
  item_count: string | number;
  operator_name: string | null;
  note: string | null;
  fulfilled_transaction_id: string | null;
  fulfilled_transaction_no: string | null;
  synced_at: string | null;
  created_at: string;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

type ReceiptHeaderRow = BasketHeaderRow & {
  shift_no: string | null;
  cashier_code: string | null;
};

type ReceiptSearchRow = ReceiptHeaderRow & {
  line_count: string | number;
  product_preview: string | null;
};

type TransactionRow = {
  transaction_no: string;
  source_transaction_no: string | null;
  transaction_type: SyncPosTransactionType;
  status: string;
  total_amount: string | number;
  customer_no: string | null;
  customer_name: string | null;
  terminal_code: string | null;
  cashier_code: string | null;
  shift_no: string | null;
  line_count: string | number;
  updated_at: string;
  completed_at: string | null;
};

type NormalizedCheckoutPayment = {
  paymentId: string;
  method: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  bankAccountId: string | null;
  bankCode: string | null;
  bankName: string | null;
  bankBranchCode: string | null;
  bankBranchName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  allowChange: boolean;
  amount: number;
  reference: string | null;
  receivedAt: string;
};

class StoreSyncTransportError extends Error {
  constructor(
    message: string,
    readonly failureKind: StoreSyncFailureKind,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "StoreSyncTransportError";
  }
}

function isOversizedSyncResponseError(error: unknown) {
  return (
    error instanceof StoreSyncTransportError &&
    error.failureKind === "SERVER" &&
    error.httpStatus === 413
  );
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }

  return `${value} B`;
}

function isoNow() {
  return new Date().toISOString();
}

function daysAgo(value: number) {
  return new Date(Date.now() - value * 86_400_000).toISOString();
}

function buildLocalDocumentNo(
  prefix: string,
  storeCode: string,
  sequence: number,
  timestamp: string,
) {
  const storeToken =
    storeCode
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 10) || "STORE";
  const stamp = timestamp.replace(/[-:TZ.]/g, "").slice(0, 14);

  return `${prefix}-${storeToken}-${String(sequence).padStart(4, "0")}-${stamp}`;
}

function addMillisecondsIso(value: string, milliseconds: number) {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

function nextSyncRetryAt(baseAt: string, attemptCount: number) {
  return addMillisecondsIso(baseAt, getRetryDelayMs(Math.max(0, attemptCount)));
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function asNullableNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return asNumber(value);
}

function asBooleanFlag(value: string | number | null | undefined) {
  return asNumber(value) > 0;
}

function formatMssqlLocationDefaults(row: Pick<
  InventoryLocationSummaryRow,
  "defaults" | "is_sales_default" | "is_sales_order_default" | "is_receiving_default"
>) {
  const labels = new Set(
    String(row.defaults ?? "")
      .split(/[,/]/)
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (asBooleanFlag(row.is_sales_default)) {
    labels.add("Sales default");
  }

  if (asBooleanFlag(row.is_sales_order_default)) {
    labels.add("Sales order default");
  }

  if (asBooleanFlag(row.is_receiving_default)) {
    labels.add("Receiving default");
  }

  return labels.size ? Array.from(labels).join(", ") : "Standard";
}

function readStringArray(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeCatalogCode(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.toUpperCase() : null;
}

function isServiceProductType(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase() === "SERVICE";
}

function normalizeTerminalCode(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeLoginId(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeCapturedTransactionReference(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "") || trimmed.toUpperCase();
}

function getLineDirection(
  transactionType: SyncPosTransactionType,
  lineIntent: SyncPosLineIntent,
) {
  if (transactionType === "RETURN") {
    return -1;
  }

  if (transactionType === "EXCHANGE" && lineIntent === "RETURN") {
    return -1;
  }

  return 1;
}

function normalizeDeploymentMode(value: StoreDeploymentMode | string | null | undefined): StoreDeploymentMode {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, "_") ?? "";
  return normalized === "STANDALONE" ? "STANDALONE" : "ENTERPRISE_MANAGED";
}

function writeStringArray(values: string[]) {
  return JSON.stringify([...new Set(values)].sort());
}

function readMatrixVariantAttributes(value: string | null | undefined) {
  if (!value) {
    return [] as StoreCatalogMatrixVariant["attributes"];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [] as StoreCatalogMatrixVariant["attributes"];
    }

    return parsed
      .map((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null,
      )
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({
        attributeCode:
          typeof entry.attributeCode === "string" ? entry.attributeCode : "",
        attributeName:
          typeof entry.attributeName === "string" ? entry.attributeName : "",
        valueCode: typeof entry.valueCode === "string" ? entry.valueCode : "",
        valueLabel:
          typeof entry.valueLabel === "string" ? entry.valueLabel : "",
      }))
      .filter(
        (entry) =>
          entry.attributeCode.trim().length > 0 &&
          entry.valueCode.trim().length > 0,
      );
  } catch {
    return [] as StoreCatalogMatrixVariant["attributes"];
  }
}

function writeMatrixVariantAttributes(
  attributes: StoreCatalogMatrixVariant["attributes"],
) {
  return JSON.stringify(
    attributes.filter(
      (attribute) =>
        attribute.attributeCode.trim().length > 0 &&
        attribute.valueCode.trim().length > 0,
    ),
  );
}

function formatMatrixVariantAttributes(
  attributes: StoreCatalogMatrixVariant["attributes"],
) {
  return attributes
    .map((attribute) => `${attribute.attributeName}: ${attribute.valueLabel}`)
    .join(" / ");
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function booleanFlag(value: unknown) {
  return value === true ? 1 : 0;
}

function normalizeSerialNumbers(serialNumbers?: string[] | null) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of serialNumbers ?? []) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const nextValue = rawValue.trim();

    if (!nextValue) {
      continue;
    }

    const duplicateKey = nextValue.toUpperCase();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    normalized.push(nextValue);
  }

  return normalized;
}

function readSerializedLineNumbers(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? normalizeSerialNumbers(parsed as string[])
      : [];
  } catch {
    return [];
  }
}

function writeSerializedLineNumbers(serialNumbers: string[]) {
  return serialNumbers.length > 0 ? JSON.stringify(serialNumbers) : null;
}

function validateSerializedLineInput(input: {
  isSerialized: boolean;
  productName: string;
  quantity: number;
  serialNumbers?: string[] | null;
}) {
  const normalizedSerialNumbers = normalizeSerialNumbers(input.serialNumbers);

  if (!input.isSerialized) {
    if (normalizedSerialNumbers.length > 0) {
      throw new Error(
        `${input.productName} is not configured as a serialized item in Flash ERP. Clear the serial numbers before continuing.`,
      );
    }

    return [] as string[];
  }

  if (!Number.isInteger(input.quantity)) {
    throw new Error(
      `${input.productName} is serialized, so Flash ERP requires a whole-number quantity.`,
    );
  }

  if (normalizedSerialNumbers.length !== input.quantity) {
    throw new Error(
      `${input.productName} is serialized, so Flash ERP needs exactly ${input.quantity} serial number(s).`,
    );
  }

  return normalizedSerialNumbers;
}

function ensureSerialSelectionWithinAllowedSet(input: {
  productName: string;
  selectedSerialNumbers: string[];
  allowedSerialNumbers: string[];
}) {
  const allowedKeys = new Set(
    input.allowedSerialNumbers.map((serialNumber) =>
      serialNumber.toUpperCase(),
    ),
  );
  const invalidSerialNumbers = input.selectedSerialNumbers.filter(
    (serialNumber) => !allowedKeys.has(serialNumber.toUpperCase()),
  );

  if (invalidSerialNumbers.length > 0) {
    throw new Error(
      `Flash ERP could not validate serial number(s) ${invalidSerialNumbers.join(", ")} for ${input.productName}.`,
    );
  }
}

function normalizeSetupCode(value: string | null | undefined, label: string) {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeSetupName(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function optionalSetupText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function normalizeSetupStringList(values: string[] | null | undefined) {
  const normalized = (values ?? [])
    .map((value) => value.trim())
    .filter(
      (value, index, items) =>
        value.length > 0 && items.indexOf(value) === index,
    );

  return normalized.length > 0 ? normalized : null;
}

function readProductSizesMetadata(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeSetupStringList(
      parsed.filter((item): item is string => typeof item === "string"),
    ) ?? [];
  } catch {
    return [];
  }
}

function normalizeSetupNumberList(values: Array<number | string> | null | undefined) {
  const seen = new Set<string>();
  const normalized: number[] = [];

  for (const value of values ?? []) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) {
      continue;
    }

    const rate = Number(numeric.toFixed(2));
    const key = rate.toFixed(2);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(rate);
  }

  return normalized.length > 0 ? normalized : null;
}

function readPosDiscountRatesMetadata(value: string | null | undefined) {
  if (!value) {
    return [] as number[];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeSetupNumberList(
      parsed.filter(
        (item): item is number | string =>
          typeof item === "number" || typeof item === "string",
      ),
    ) ?? [];
  } catch {
    return [];
  }
}

function formatDiscountRate(rate: number) {
  return Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2);
}

function normalizeSetupNumber(
  value: number | null | undefined,
  fallback: number,
  decimals: number,
) {
  const numeric = Number.isFinite(value) ? Number(value) : fallback;
  return Number(numeric.toFixed(decimals));
}

function standalonePermissionCodes(input: {
  permissionCodes?: string[] | null;
  cashierEligible?: boolean | null;
  supervisorEligible?: boolean | null;
}) {
  const permissionCodes = new Set(
    (input.permissionCodes ?? []).filter(
      (permissionCode): permissionCode is string =>
        typeof permissionCode === "string" && permissionCode.trim().length > 0,
    ),
  );

  if (input.cashierEligible !== false) {
    permissionCodes.add("pos.sell");
    permissionCodes.add("pos.shift.open");
  }

  if (input.supervisorEligible !== false) {
    permissionCodes.add("sync.store.operate");
    permissionCodes.add("inventory.grn.receive");
    permissionCodes.add("inventory.transfer.issue");
    permissionCodes.add("inventory.transfer.receive");
    permissionCodes.add("inventory.supplier-return.manage");
  }

  return [...permissionCodes].sort();
}

function deriveLocalInterStoreTransferStatus(input: {
  requestedQuantity: number;
  issuedQuantity: number;
  receivedQuantity: number;
  closedAt?: string | null;
}): StoreInterStoreTransferSummary["status"] {
  if (input.closedAt) {
    return "CLOSED";
  }

  if (input.receivedQuantity > 0) {
    return input.receivedQuantity + 0.0001 >= input.requestedQuantity
      ? "RECEIVED"
      : "PART_RECEIVED";
  }

  if (input.issuedQuantity > 0) {
    return input.issuedQuantity + 0.0001 >= input.requestedQuantity
      ? "ISSUED"
      : "PART_ISSUED";
  }

  return "REQUESTED";
}

function serialNumberSetsMatch(left: string[], right: string[]) {
  const leftKeys = new Set(
    left.map((serialNumber) => serialNumber.toUpperCase()),
  );
  const rightKeys = new Set(
    right.map((serialNumber) => serialNumber.toUpperCase()),
  );

  if (leftKeys.size !== rightKeys.size) {
    return false;
  }

  for (const key of leftKeys) {
    if (!rightKeys.has(key)) {
      return false;
    }
  }

  return true;
}

function calculateSaleLineAmounts(input: {
  unitPrice: number;
  quantity: number;
  discountAmount?: number;
  taxable: boolean;
  taxRatePercent: number | null;
  taxInclusive: boolean;
}) {
  const extendedPrice = Number((input.unitPrice * input.quantity).toFixed(2));
  const normalizedDiscountAmount = Number(
    Math.min(Math.max(0, input.discountAmount ?? 0), extendedPrice).toFixed(2),
  );
  const discountedPrice = Number(
    (extendedPrice - normalizedDiscountAmount).toFixed(2),
  );
  const effectiveRate = input.taxable
    ? Math.max(0, input.taxRatePercent ?? 0) / 100
    : 0;

  if (effectiveRate <= 0) {
    return {
      subtotal: discountedPrice,
      discountAmount: normalizedDiscountAmount,
      taxAmount: 0,
      lineTotal: discountedPrice,
    };
  }

  if (input.taxInclusive) {
    const subtotal = Number((discountedPrice / (1 + effectiveRate)).toFixed(2));
    const taxAmount = Number((discountedPrice - subtotal).toFixed(2));

    return {
      subtotal,
      discountAmount: normalizedDiscountAmount,
      taxAmount,
      lineTotal: discountedPrice,
    };
  }

  const subtotal = discountedPrice;
  const taxAmount = Number((subtotal * effectiveRate).toFixed(2));

  return {
    subtotal,
    discountAmount: normalizedDiscountAmount,
    taxAmount,
    lineTotal: Number((subtotal + taxAmount).toFixed(2)),
  };
}

function buildSourceLineAmounts(sourceLine: BasketLineRow, quantity: number) {
  const soldQuantity = Math.max(
    0.001,
    Number(asNumber(sourceLine.quantity).toFixed(3)),
  );
  const normalizedQuantity = Number(quantity.toFixed(3));
  const unitPrice = Number(asNumber(sourceLine.unit_price).toFixed(2));
  const discountAmount = Number(
    (
      (asNumber(sourceLine.discount_amount) / soldQuantity) *
      normalizedQuantity
    ).toFixed(2),
  );
  const taxAmount = Number(
    (
      (asNumber(sourceLine.tax_amount) / soldQuantity) *
      normalizedQuantity
    ).toFixed(2),
  );
  const lineTotal = Number(
    (
      (asNumber(sourceLine.line_total) / soldQuantity) *
      normalizedQuantity
    ).toFixed(2),
  );

  return {
    quantity: normalizedQuantity,
    unitPrice,
    discountAmount,
    taxAmount,
    lineTotal,
  };
}

function capabilitiesFrom(
  permissionCodes: string[],
  accountStatus: string,
): StoreOperatorCapabilities {
  const capabilities = deriveRetailUserCapabilities(
    permissionCodes,
    accountStatus,
  );

  return {
    cashierEligible: capabilities.cashierEligible,
    supervisorEligible: capabilities.supervisorEligible,
    canOpenShift: capabilities.canOpenShift,
    canCloseShift: capabilities.canCloseShift,
    canProcessSale: capabilities.canProcessSale,
    canProcessReturn: capabilities.canProcessReturn,
    canProcessExchange: capabilities.canProcessExchange,
    canSearchReceipt: capabilities.canSearchReceipt,
    canReprintReceipt: capabilities.canReprintReceipt,
    canAttachCustomer: capabilities.canAttachCustomer,
    canCollectAccountPayment: capabilities.canCollectAccountPayment,
    canRedeemLoyalty: capabilities.canRedeemLoyalty,
    canApproveNoReceiptReturn: capabilities.canApproveNoReceiptReturn,
    canApproveDiscountOverride: capabilities.canApproveDiscountOverride,
    canApprovePriceOverride: capabilities.canApprovePriceOverride,
    hasInventoryVisibility: capabilities.hasInventoryVisibility,
    canAdjustInventory: capabilities.canAdjustInventory,
    canSubmitCount: capabilities.canSubmitCount,
    canCommitCount: capabilities.canCommitCount,
    canRequestTransfer: capabilities.canRequestTransfer,
    canIssueTransfer: capabilities.canIssueTransfer,
    canReceiveTransfer: capabilities.canReceiveTransfer,
    canReceiveGoods: capabilities.canReceiveGoods,
    canManageSupplierReturns: capabilities.canManageSupplierReturns,
    canOperateStoreSync: capabilities.canOperateStoreSync,
  };
}

function readDownstreamPageLimit() {
  const configured = Number(process.env.FLASH_ERP_STORE_SYNC_PULL_LIMIT);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(Math.trunc(configured), MAX_SYNC_PULL_LIMIT));
  }

  return DEFAULT_SYNC_PULL_LIMIT;
}

function readDownstreamPullPassLimit(
  trigger: StoreNodeSyncTrigger | null | undefined,
  drainDownstream = false
) {
  const configured = Number(process.env.FLASH_ERP_STORE_SYNC_PULL_PASSES);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(Math.trunc(configured), 25));
  }

  if (trigger === "scheduled") {
    return 1;
  }

  if (drainDownstream) {
    return 15;
  }

  return 1;
}

function redactConnectionString(connectionString: string) {
  return connectionString.replace(/(password|pwd)\s*=\s*[^;]+/gi, "$1=***");
}

function isSyncSchemaDriftPayload(payload: {
  code?: string;
  schemaDrift?: boolean;
}) {
  return (
    payload.schemaDrift === true ||
    payload.code === ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE
  );
}

function classifySyncFailure(error: unknown): {
  failureKind: StoreSyncFailureKind;
  message: string;
  httpStatus: number | null;
} {
  if (error instanceof StoreSyncTransportError) {
    return {
      failureKind: error.failureKind,
      message: error.message,
      httpStatus: error.httpStatus,
    };
  }

  return {
    failureKind: "UNKNOWN",
    message:
      error instanceof Error
        ? error.message
        : "Flash ERP could not classify the enterprise sync failure.",
    httpStatus: null,
  };
}

export class MssqlStoreService {
  private readonly pool: sql.ConnectionPool;
  private readonly syncBaseUrl: string | null;
  private readonly deploymentMode: StoreDeploymentMode;
  private readonly fallbackNodeCode: string;
  private readonly fallbackTerminalCode: string;
  private syncCycleInFlight: Promise<StoreSyncActionResult> | null = null;
  private readonly terminalContextStorage =
    new AsyncLocalStorage<StoreTerminalContext | null>();

  readonly databasePath: string;

  private constructor(private readonly options: MssqlStoreServiceOptions) {
    const connectionString = normalizeStoreMssqlConnectionString(
      options.connectionString,
    );

    this.databasePath = redactConnectionString(connectionString);
    this.deploymentMode = normalizeDeploymentMode(options.deploymentMode);
    this.syncBaseUrl = options.syncBaseUrl?.replace(/\/+$/, "") ?? null;
    this.fallbackNodeCode = options.nodeCode?.trim() || defaultStoreConfig.nodeCode;
    this.fallbackTerminalCode =
      normalizeTerminalCode(options.terminalCode) ??
      defaultStoreConfig.terminalCode;
    this.pool = new sql.ConnectionPool(connectionString);
  }

  static async create(options: MssqlStoreServiceOptions) {
    const service = new MssqlStoreService(options);
    await service.pool.connect();
    await service.ensureRuntimeSchema();
    await service.ensureDefaults();
    return service;
  }

  async close() {
    await this.pool.close();
  }

  runWithTerminalContext<T>(
    context: StoreTerminalContext | null | undefined,
    work: () => T,
  ) {
    return this.terminalContextStorage.run(context ?? null, work);
  }

  private getTerminalCode() {
    const activeTerminalContext = this.terminalContextStorage.getStore();
    return (
      normalizeTerminalCode(activeTerminalContext?.terminalCode) ||
      this.fallbackTerminalCode ||
      defaultStoreConfig.terminalCode
    );
  }

  private request(
    runner: MssqlRunner = this.pool,
    params: Record<string, unknown> = {},
  ) {
    const request =
      runner instanceof sql.Transaction ? new sql.Request(runner) : runner.request();

    for (const [key, value] of Object.entries(params)) {
      request.input(key, value as sql.ISqlTypeFactoryWithNoParams | sql.ISqlTypeFactoryWithLength | unknown);
    }

    return request;
  }

  private async query<T>(
    text: string,
    params: Record<string, unknown> = {},
    runner: MssqlRunner = this.pool,
  ) {
    return this.request(runner, params).query<T>(text);
  }

  private async withTransaction<T>(work: (transaction: sql.Transaction) => Promise<T>) {
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();

    try {
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }

  private async ensureRuntimeSchema() {
    await this.query(`
      IF OBJECT_ID(N'[dbo].[pos_transaction_line]', N'U') IS NOT NULL
         AND COL_LENGTH(N'[dbo].[pos_transaction_line]', N'product_variant_code_snapshot') IS NULL
      BEGIN
        ALTER TABLE [dbo].[pos_transaction_line]
        ADD [product_variant_code_snapshot] nvarchar(100) NULL;
      END
    `);
    await this.query(`
      IF OBJECT_ID(N'[dbo].[pos_transaction_line]', N'U') IS NOT NULL
         AND COL_LENGTH(N'[dbo].[pos_transaction_line]', N'variant_attributes_snapshot') IS NULL
      BEGIN
        ALTER TABLE [dbo].[pos_transaction_line]
        ADD [variant_attributes_snapshot] nvarchar(1000) NULL;
      END
    `);
    await this.query(`
      IF OBJECT_ID(N'[dbo].[pos_transaction_line]', N'U') IS NOT NULL
         AND COL_LENGTH(N'[dbo].[pos_transaction_line]', N'variant_size') IS NULL
      BEGIN
        ALTER TABLE [dbo].[pos_transaction_line]
        ADD [variant_size] nvarchar(100) NULL;
      END
    `);
    await this.query(`
      IF OBJECT_ID(N'[dbo].[pos_transaction_line]', N'U') IS NOT NULL
         AND COL_LENGTH(N'[dbo].[pos_transaction_line]', N'variant_color') IS NULL
      BEGIN
        ALTER TABLE [dbo].[pos_transaction_line]
        ADD [variant_color] nvarchar(100) NULL;
      END
    `);
    await this.query(`
      IF OBJECT_ID(N'[dbo].[pos_transaction_line]', N'U') IS NOT NULL
         AND COL_LENGTH(N'[dbo].[pos_transaction_line]', N'line_note') IS NULL
      BEGIN
        ALTER TABLE [dbo].[pos_transaction_line]
        ADD [line_note] nvarchar(max) NULL;
      END
    `);
  }

  private async ensureDefaults() {
    const timestamp = isoNow();
    const defaults = [
      ["retail_org_name", defaultStoreConfig.retailOrgName],
      ["store_code", defaultStoreConfig.storeCode],
      ["store_name", defaultStoreConfig.storeName],
      ["terminal_code", this.fallbackTerminalCode],
      ["node_code", this.fallbackNodeCode],
      ["deployment_mode", this.deploymentMode],
    ] as const;

    await this.setStoreNodeMetadata("last_mssql_service_start_at", timestamp, timestamp);

    await this.query(
      `IF OBJECT_ID(N'[dbo].[transaction_reference_capture]', N'U') IS NULL
       BEGIN
         CREATE TABLE [dbo].[transaction_reference_capture] (
           [id] nvarchar(100) NOT NULL CONSTRAINT [PK_transaction_reference_capture] PRIMARY KEY,
           [reference_value] nvarchar(200) NOT NULL,
           [normalized_reference] nvarchar(200) NOT NULL,
           [details] nvarchar(max) NULL,
           [first_transaction_no] nvarchar(100) NULL,
           [last_transaction_no] nvarchar(100) NULL,
           [use_count] int NOT NULL CONSTRAINT [DF_transaction_reference_capture_use_count_runtime] DEFAULT 1,
           [first_seen_at] nvarchar(40) NOT NULL,
           [last_seen_at] nvarchar(40) NOT NULL,
           [updated_at] nvarchar(40) NOT NULL,
         CONSTRAINT [UQ_transaction_reference_capture_key_runtime] UNIQUE ([normalized_reference])
       );
       END`,
    );

    await this.query(
      `IF OBJECT_ID(N'[dbo].[local_store_expense]', N'U') IS NULL
       BEGIN
         CREATE TABLE [dbo].[local_store_expense] (
           [id] nvarchar(100) NOT NULL CONSTRAINT [PK_local_store_expense] PRIMARY KEY,
           [expense_no] nvarchar(120) NOT NULL,
           [status] nvarchar(30) NOT NULL CONSTRAINT [DF_local_store_expense_status_runtime] DEFAULT N'DRAFT',
           [expense_date] nvarchar(40) NOT NULL,
           [category] nvarchar(80) NOT NULL,
           [description] nvarchar(500) NOT NULL,
           [supplier_name] nvarchar(200) NULL,
           [payment_method] nvarchar(80) NULL,
           [external_reference] nvarchar(200) NULL,
           [amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_local_store_expense_amount_runtime] DEFAULT 0,
           [tax_amount] decimal(18, 4) NOT NULL CONSTRAINT [DF_local_store_expense_tax_runtime] DEFAULT 0,
           [attachment_file_name] nvarchar(260) NULL,
           [attachment_url] nvarchar(500) NULL,
           [attachment_content_type] nvarchar(120) NULL,
           [attachment_content_base64] nvarchar(max) NULL,
           [operator_name] nvarchar(160) NOT NULL,
           [note] nvarchar(1000) NULL,
           [confirmed_by] nvarchar(160) NULL,
           [confirmed_at] nvarchar(40) NULL,
           [synced_at] nvarchar(40) NULL,
           [updated_at] nvarchar(40) NOT NULL,
           CONSTRAINT [UQ_local_store_expense_no_runtime] UNIQUE ([expense_no])
         );
       END`,
    );
    await this.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_local_store_expense_status_runtime' AND [object_id] = OBJECT_ID(N'[dbo].[local_store_expense]'))
       BEGIN
         CREATE INDEX [IX_local_store_expense_status_runtime] ON [dbo].[local_store_expense] ([status], [expense_date] DESC);
       END`,
    );
    await this.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_local_store_expense_synced_runtime' AND [object_id] = OBJECT_ID(N'[dbo].[local_store_expense]'))
       BEGIN
         CREATE INDEX [IX_local_store_expense_synced_runtime] ON [dbo].[local_store_expense] ([synced_at], [confirmed_at] DESC);
       END`,
    );

    await this.query(
      `IF OBJECT_ID(N'[dbo].[tender_method_snapshot]', N'U') IS NOT NULL
         AND COL_LENGTH(N'[dbo].[tender_method_snapshot]', N'published_at') IS NULL
       BEGIN
         ALTER TABLE [dbo].[tender_method_snapshot]
         ADD [published_at] nvarchar(40) NULL;
       END`,
    );

    for (const [key, value] of defaults) {
      await this.query(
        `IF NOT EXISTS (SELECT 1 FROM [dbo].[app_metadata] WHERE [key] = @key)
         BEGIN
           INSERT INTO [dbo].[app_metadata] ([key], [value]) VALUES (@key, @value);
         END`,
        { key, value },
      );
    }

    await this.setMetadata("node_code", this.fallbackNodeCode);
  }

  private async metadata() {
    const result = await this.query<{ key: string; value: string }>(
      "SELECT [key], [value] FROM [dbo].[app_metadata]",
    );

    return Object.fromEntries(
      result.recordset.map((row) => [row.key, row.value]),
    ) as Record<string, string | undefined>;
  }

  private resolveEnterpriseMediaUrl(value: string | null | undefined) {
    const trimmedValue = value?.trim() ?? "";

    if (!trimmedValue) {
      return null;
    }

    if (/^(https?:|data:|file:|blob:)/i.test(trimmedValue)) {
      return trimmedValue;
    }

    if (!this.syncBaseUrl) {
      return trimmedValue;
    }

    try {
      const baseUrl = new URL(this.syncBaseUrl);
      const enterpriseRoot = `${baseUrl.protocol}//${baseUrl.host}`;

      return new URL(
        trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`,
        enterpriseRoot,
      ).toString();
    } catch {
      return trimmedValue;
    }
  }

  private resolveStoreLogoUrl(metadata: Record<string, string | undefined>) {
    return this.resolveEnterpriseMediaUrl(
      metadata.local_company_logo_url ?? metadata.company_logo_url,
    );
  }

  private async setMetadata(key: string, value: string, runner: MssqlRunner = this.pool) {
    await this.query(
      `MERGE [dbo].[app_metadata] AS target
       USING (SELECT @key AS [key], @value AS [value]) AS source
       ON target.[key] = source.[key]
       WHEN MATCHED THEN UPDATE SET [value] = source.[value]
       WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (source.[key], source.[value]);`,
      { key, value },
      runner,
    );
  }

  private async deleteMetadata(key: string, runner: MssqlRunner = this.pool) {
    await this.query(
      "DELETE FROM [dbo].[app_metadata] WHERE [key] = @key",
      { key },
      runner,
    );
  }

  private async setStoreNodeMetadata(key: string, value: string, updatedAt = isoNow()) {
    await this.query(
      `MERGE [dbo].[store_node_metadata] AS target
       USING (SELECT @key AS [key], @value AS [value], @updatedAt AS [updated_at]) AS source
       ON target.[key] = source.[key]
       WHEN MATCHED THEN UPDATE SET [value] = source.[value], [updated_at] = source.[updated_at]
       WHEN NOT MATCHED THEN INSERT ([key], [value], [updated_at])
       VALUES (source.[key], source.[value], source.[updated_at]);`,
      { key, value, updatedAt },
    );
  }

  private async mergeRow(
    tableName: string,
    matchColumns: string[],
    values: Record<string, unknown>,
    runner: MssqlRunner = this.pool,
  ) {
    const columns = Object.keys(values);
    const sourceColumns = columns
      .map((column) => `@${column} AS [${column}]`)
      .join(", ");
    const matchPredicate = matchColumns
      .map((column) => `target.[${column}] = source.[${column}]`)
      .join(" AND ");
    const updateColumns = columns.filter(
      (column) => !matchColumns.includes(column),
    );
    const updateClause =
      updateColumns.length > 0
        ? `WHEN MATCHED THEN UPDATE SET ${updateColumns
            .map((column) => `[${column}] = source.[${column}]`)
            .join(", ")}`
        : "";

    await this.query(
      `MERGE [dbo].[${tableName}] AS target
       USING (SELECT ${sourceColumns}) AS source
       ON ${matchPredicate}
       ${updateClause}
       WHEN NOT MATCHED THEN INSERT (${columns
         .map((column) => `[${column}]`)
         .join(", ")})
       VALUES (${columns.map((column) => `source.[${column}]`).join(", ")});`,
      values,
      runner,
    );
  }

  async recordTerminalHeartbeat(input?: {
    method?: string | null;
    remoteAddress?: string | null;
    userAgent?: string | null;
    clientName?: string | null;
  }) {
    const terminalCode = this.getTerminalCode();
    const timestamp = isoNow();
    const context = this.terminalContextStorage.getStore();
    const clientName =
      input?.clientName?.trim() || context?.clientName?.trim() || null;

    await this.query(
      `MERGE [dbo].[terminal_connection] AS target
       USING (
         SELECT
           @terminalCode AS [terminal_code],
           @clientName AS [client_name],
           @timestamp AS [seen_at],
           @method AS [last_method],
           @remoteAddress AS [remote_address],
           @userAgent AS [user_agent]
       ) AS source
       ON target.[terminal_code] = source.[terminal_code]
       WHEN MATCHED THEN UPDATE SET
         [client_name] = COALESCE(source.[client_name], target.[client_name]),
         [last_seen_at] = source.[seen_at],
         [request_count] = target.[request_count] + 1,
         [last_method] = source.[last_method],
         [remote_address] = COALESCE(source.[remote_address], target.[remote_address]),
         [user_agent] = COALESCE(source.[user_agent], target.[user_agent])
       WHEN NOT MATCHED THEN INSERT (
         [terminal_code], [client_name], [first_seen_at], [last_seen_at],
         [request_count], [last_method], [remote_address], [user_agent]
       ) VALUES (
         source.[terminal_code], source.[client_name], source.[seen_at], source.[seen_at],
         1, source.[last_method], source.[remote_address], source.[user_agent]
       );`,
      {
        terminalCode,
        clientName,
        timestamp,
        method: input?.method?.trim() || null,
        remoteAddress: input?.remoteAddress?.trim() || null,
        userAgent: input?.userAgent?.trim() || null,
      },
    );
  }

  private async metadataValue(key: string) {
    const result = await this.query<{ value: string }>(
      "SELECT TOP (1) [value] FROM [dbo].[app_metadata] WHERE [key] = @key",
      { key },
    );

    return result.recordset[0]?.value ?? null;
  }

  private getTerminalMetadataKey(key: string) {
    return `${key}:${this.getTerminalCode()}`;
  }

  private getActiveBasketMetadataKey() {
    return `active_basket_id:${this.getTerminalCode()}`;
  }

  private isStandaloneDeployment() {
    return this.deploymentMode === "STANDALONE";
  }

  private formatOperatorLabel(input: { loginId: string; displayName: string }) {
    return `${input.displayName} (${input.loginId})`;
  }

  private async getStoreCode() {
    const metadata = await this.metadata();
    return metadata.store_code ?? defaultStoreConfig.storeCode;
  }

  private toStoreUserSummary(row: RetailUserRow): StoreUserSummary {
    const permissionCodes = readStringArray(row.permission_codes_json);
    const capabilities = capabilitiesFrom(permissionCodes, row.account_status);

    return {
      userId: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      email: row.email,
      accountStatus: row.account_status,
      homeStoreCode: row.home_store_code,
      homeStoreName: row.home_store_name,
      roleCodes: readStringArray(row.role_codes_json),
      roleNames: readStringArray(row.role_names_json),
      permissionCodes,
      cashierEligible: capabilities.cashierEligible,
      supervisorEligible: capabilities.supervisorEligible,
      updatedAt: row.updated_at,
    };
  }

  private toOperatorSessionSummary(
    row: ActiveOperatorSessionRow,
  ): StoreOperatorSessionSummary {
    const permissionCodes = readStringArray(row.permission_codes_json);

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      loginId: row.login_id,
      displayName: row.display_name,
      email: row.email,
      accountStatus: row.account_status,
      homeStoreCode: row.home_store_code,
      homeStoreName: row.home_store_name,
      roleCodes: readStringArray(row.role_codes_json),
      roleNames: readStringArray(row.role_names_json),
      permissionCodes,
      openedAt: row.opened_at,
      lastSeenAt: row.last_seen_at,
      capabilities: capabilitiesFrom(permissionCodes, row.account_status),
    };
  }

  private async ensureStoreUserCanAccessThisStore(input: {
    loginId: string;
    homeStoreCode: string | null;
  }) {
    const storeCode = await this.getStoreCode();

    if (!input.homeStoreCode) {
      throw new Error(
        `${input.loginId} is not assigned to this Flash ERP store node.`,
      );
    }

    if (
      input.homeStoreCode &&
      normalizeLoginId(input.homeStoreCode) !== normalizeLoginId(storeCode)
    ) {
      throw new Error(
        `${input.loginId} is assigned to ${input.homeStoreCode}, not to this Flash ERP store node.`,
      );
    }
  }

  private async getStoreUserByLoginId(loginId: string) {
    const result = await this.query<RetailUserRow>(
      `SELECT TOP (1)
        [id],
        [login_id],
        [email],
        [display_name],
        [account_status],
        [home_store_code],
        [home_store_name],
        [role_codes_json],
        [role_names_json],
        [permission_codes_json],
        [password_hash],
        [updated_at]
       FROM [dbo].[retail_user_snapshot]
       WHERE LOWER([login_id]) = LOWER(@loginId)`,
      { loginId: loginId.trim() },
    );

    return result.recordset[0] ?? null;
  }

  private async authenticateStoreUser(
    loginId: string,
    password: string,
    traceId?: string | null,
  ) {
    const normalizedLoginId = loginId.trim();
    const normalizedPassword = password.trim();
    const authStartedAt = Date.now();

    if (!normalizedLoginId || !normalizedPassword) {
      throw new Error("Enter your operator login ID and password.");
    }

    console.info("Store Desktop SQL Server sign-in auth lookup started.", {
      traceId,
      loginId: normalizedLoginId,
    });
    const user = await this.getStoreUserByLoginId(normalizedLoginId);
    console.info("Store Desktop SQL Server sign-in auth lookup completed.", {
      traceId,
      loginId: normalizedLoginId,
      found: Boolean(user),
      elapsedMs: Date.now() - authStartedAt,
    });

    if (!user) {
      const userCount = await this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[retail_user_snapshot]",
      );

      if (userCount === 0) {
        throw new Error(
          this.isStandaloneDeployment()
            ? "No local operator accounts are available on this SQL Server store node yet."
            : "No synced operator accounts are available on this SQL Server store node yet. Run a store migration or sync cycle, then try signing in again.",
        );
      }

      throw new Error(
        "Invalid operator login ID or password for this store node.",
      );
    }

    if (user.account_status !== "ACTIVE") {
      throw new Error(
        "Invalid operator login ID or password for this store node.",
      );
    }

    await this.ensureStoreUserCanAccessThisStore({
      loginId: user.login_id,
      homeStoreCode: user.home_store_code,
    });

    if (!user.password_hash) {
      throw new Error(
        `${user.display_name} (${user.login_id}) has no local sign-in credential on this store node yet.`,
      );
    }

    const compareStartedAt = Date.now();
    console.info("Store Desktop SQL Server sign-in password check started.", {
      traceId,
      loginId: user.login_id,
    });
    if (!bcrypt.compareSync(normalizedPassword, user.password_hash)) {
      throw new Error(
        "Invalid operator login ID or password for this store node.",
      );
    }
    console.info("Store Desktop SQL Server sign-in password check completed.", {
      traceId,
      loginId: user.login_id,
      elapsedMs: Date.now() - compareStartedAt,
    });

    return user;
  }

  private async getActiveOperatorSessionRow() {
    const result = await this.query<ActiveOperatorSessionRow>(
      `SELECT TOP (1)
        session.[id] AS [session_id],
        session.[terminal_code],
        session.[opened_at],
        session.[last_seen_at],
        account.[id] AS [user_id],
        account.[id],
        account.[login_id],
        account.[email],
        account.[display_name],
        account.[account_status],
        account.[home_store_code],
        account.[home_store_name],
        account.[role_codes_json],
        account.[role_names_json],
        account.[permission_codes_json],
        account.[password_hash],
        account.[updated_at]
       FROM [dbo].[operator_session] AS session
       INNER JOIN [dbo].[retail_user_snapshot] AS account
         ON account.[id] = session.[retail_user_id]
       WHERE session.[closed_at] IS NULL
         AND (session.[terminal_code] = @terminalCode OR session.[terminal_code] IS NULL)
       ORDER BY session.[opened_at] DESC`,
      { terminalCode: this.getTerminalCode() },
    );

    return result.recordset[0] ?? null;
  }

  private async closeOperatorSession(
    sessionId: string,
    reason: string,
    timestamp: string,
    runner: MssqlRunner = this.pool,
  ) {
    await this.query(
      `UPDATE [dbo].[operator_session]
       SET [closed_at] = ISNULL([closed_at], @timestamp),
           [close_reason] = ISNULL([close_reason], @reason)
       WHERE [id] = @sessionId`,
      { timestamp, reason, sessionId },
      runner,
    );
  }

  private async touchOperatorSession(sessionId: string, timestamp: string) {
    await this.query(
      `UPDATE [dbo].[operator_session]
       SET [last_seen_at] = @timestamp
       WHERE [id] = @sessionId
         AND [closed_at] IS NULL`,
      { timestamp, sessionId },
    );
  }

  private async getActiveOperatorSessionSummary() {
    const row = await this.getActiveOperatorSessionRow();

    if (!row) {
      return null;
    }

    if (row.account_status !== "ACTIVE") {
      await this.closeOperatorSession(
        row.session_id,
        "ACCOUNT_INACTIVE",
        isoNow(),
      );
      return null;
    }

    try {
      await this.ensureStoreUserCanAccessThisStore({
        loginId: row.login_id,
        homeStoreCode: row.home_store_code,
      });
    } catch {
      await this.closeOperatorSession(
        row.session_id,
        "STORE_ASSIGNMENT_CHANGED",
        isoNow(),
      );
      return null;
    }

    return this.toOperatorSessionSummary(row);
  }

  private async requireActiveOperatorSession(input?: {
    permissionCodes?: string[];
    any?: boolean;
    purpose?: string;
  }) {
    const session = await this.getActiveOperatorSessionSummary();

    if (!session) {
      throw new Error(
        this.isStandaloneDeployment()
          ? "Sign in with a local Flash ERP operator account before using this desktop workflow."
          : "Sign in with a synced Flash ERP operator account before using this desktop workflow.",
      );
    }

    const permissionCodes = (input?.permissionCodes ?? []).filter(Boolean);

    if (permissionCodes.length > 0) {
      const authorized = input?.any
        ? permissionCodes.some((permissionCode) =>
            session.permissionCodes.includes(permissionCode),
          )
        : permissionCodes.every((permissionCode) =>
            session.permissionCodes.includes(permissionCode),
          );

      if (!authorized) {
        throw new Error(
          `${this.formatOperatorLabel(session)} does not have the required Flash ERP privilege for ${input?.purpose ?? "this workflow"}.`,
        );
      }
    }

    await this.touchOperatorSession(session.sessionId, isoNow());
    return session;
  }

  private async requireSupervisorOverride(input: StoreSupervisorOverrideInput) {
    const supervisorCode = input.supervisorCode.trim();
    const supervisorPassword = input.supervisorPassword?.trim() ?? "";

    if (!supervisorCode || !supervisorPassword) {
      throw new Error(
        "Enter a synced supervisor login and password before starting this correction.",
      );
    }

    const supervisor = await this.authenticateStoreUser(
      supervisorCode,
      supervisorPassword,
    );
    const permissionCodes = readStringArray(supervisor.permission_codes_json);
    const capabilities = capabilitiesFrom(
      permissionCodes,
      supervisor.account_status,
    );

    if (!capabilities.supervisorEligible) {
      throw new Error(
        `${supervisor.display_name} is not eligible to approve POS corrections.`,
      );
    }

    return this.toStoreUserSummary(supervisor);
  }

  async signInOperator(
    input: StoreOperatorSignInInput,
  ): Promise<StoreSyncActionResult> {
    const traceId =
      input.traceId?.trim() ??
      `signin-mssql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const timestamp = isoNow();
    const terminalCode = this.getTerminalCode();
    console.info("Store Desktop SQL Server sign-in started.", {
      traceId,
      loginId: input.loginId.trim(),
      terminalCode,
    });

    try {
      const user = await this.authenticateStoreUser(
        input.loginId,
        input.password,
        traceId,
      );
      const operatorLabel = this.formatOperatorLabel({
        loginId: user.login_id,
        displayName: user.display_name,
      });

      console.info("Store Desktop SQL Server sign-in session write started.", {
        traceId,
        loginId: user.login_id,
      });
      await this.withTransaction(async (transaction) => {
        const activeResult = await this.query<{
          session_id: string;
          user_id: string;
        }>(
          `SELECT TOP (1) [id] AS [session_id], [retail_user_id] AS [user_id]
           FROM [dbo].[operator_session]
           WHERE [closed_at] IS NULL
             AND ([terminal_code] = @terminalCode OR [terminal_code] IS NULL)
           ORDER BY [opened_at] DESC`,
          { terminalCode },
          transaction,
        );
        const activeSession = activeResult.recordset[0] ?? null;

        if (activeSession && activeSession.user_id === user.id) {
          await this.query(
            `UPDATE [dbo].[operator_session]
             SET [terminal_code] = ISNULL([terminal_code], @terminalCode),
                 [last_seen_at] = @timestamp
             WHERE [id] = @sessionId`,
            {
              terminalCode,
              timestamp,
              sessionId: activeSession.session_id,
            },
            transaction,
          );
        } else {
          await this.query(
            `UPDATE [dbo].[operator_session]
             SET [closed_at] = @timestamp,
                 [close_reason] = ISNULL([close_reason], N'REPLACED_SESSION')
             WHERE [closed_at] IS NULL
               AND ([terminal_code] = @terminalCode OR [terminal_code] IS NULL)`,
            { timestamp, terminalCode },
            transaction,
          );
          await this.query(
            `INSERT INTO [dbo].[operator_session] (
              [id],
              [retail_user_id],
              [terminal_code],
              [opened_at],
              [last_seen_at],
              [closed_at],
              [close_reason]
            ) VALUES (
              @sessionId,
              @userId,
              @terminalCode,
              @timestamp,
              @timestamp,
              NULL,
              NULL
            )`,
            {
              sessionId: randomUUID(),
              userId: user.id,
              terminalCode,
              timestamp,
            },
            transaction,
          );
        }
      });
      console.info("Store Desktop SQL Server sign-in session write completed.", {
        traceId,
        elapsedMs: Date.now() - startedAt,
      });

      console.info("Store Desktop SQL Server sign-in snapshot started.", {
        traceId,
      });
      const snapshot = await this.getSyncSnapshot();
      console.info("Store Desktop SQL Server sign-in snapshot completed.", {
        traceId,
        elapsedMs: Date.now() - startedAt,
        activeOperator: Boolean(snapshot.activeOperatorSession),
        storeUsers: snapshot.storeUsers.length,
      });

      return {
        message: `${operatorLabel} is now signed in on terminal ${terminalCode}.`,
        snapshot,
      };
    } catch (error) {
      console.error("Store Desktop SQL Server sign-in failed.", {
        traceId,
        elapsedMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }

  async signOutOperator(): Promise<StoreSyncActionResult> {
    const timestamp = isoNow();
    const activeSession = await this.getActiveOperatorSessionSummary();

    if (!activeSession) {
      return {
        message: "No operator is currently signed in on this desktop.",
        snapshot: await this.getSyncSnapshot(),
      };
    }

    const openShift = await this.getOpenShiftRow();
    await this.closeOperatorSession(
      activeSession.sessionId,
      "SIGNED_OUT",
      timestamp,
    );

    return {
      message: openShift
        ? `${this.formatOperatorLabel(activeSession)} signed out. ${openShift.shift_no} remains open on terminal ${this.getTerminalCode()}.`
        : `${this.formatOperatorLabel(activeSession)} signed out from terminal ${this.getTerminalCode()}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async insertOutboxEvent(
    input: StoreMssqlOutboxEventInput,
    runner: MssqlRunner = this.pool,
  ) {
    const recordVersion = Math.max(
      1,
      Math.trunc(asNumber(input.recordVersion ?? 1, 1)),
    );
    const eventId = input.eventId?.trim() || randomUUID();
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `${input.nodeCode}:${input.aggregateType}:${input.aggregateId}:${recordVersion}`;

    await this.query(
      `INSERT INTO [dbo].[sync_outbox] (
        [id],
        [target_node_code],
        [aggregate_type],
        [aggregate_id],
        [event_type],
        [idempotency_key],
        [payload_json],
        [status],
        [attempt_count],
        [record_version],
        [created_at],
        [updated_at]
      ) VALUES (
        @eventId,
        @targetNodeCode,
        @aggregateType,
        @aggregateId,
        @eventType,
        @idempotencyKey,
        @payloadJson,
        N'PENDING',
        0,
        @recordVersion,
        @timestamp,
        @timestamp
      );`,
      {
        eventId,
        targetNodeCode: input.targetNodeCode ?? ENTERPRISE_NODE_CODE,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        idempotencyKey,
        payloadJson: JSON.stringify(input.payload),
        recordVersion,
        timestamp: input.timestamp,
      },
      runner,
    );

    return eventId;
  }

  async enqueueUpstreamEvent(input: StoreMssqlUpstreamEventInput) {
    const timestamp = input.occurredAt?.trim() || isoNow();
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const eventId = await this.insertOutboxEvent({
      ...input,
      nodeCode,
      timestamp,
    });
    await this.setMetadata("last_local_write_at", timestamp);

    return eventId;
  }

  private async countScalar(
    sqlText: string,
    params: Record<string, unknown> = {},
  ) {
    const result = await this.query<{ value: number }>(sqlText, params);
    return asNumber(result.recordset[0]?.value);
  }

  private async nextSequence(key: string) {
    return this.withTransaction(async (transaction) => {
      const result = await this.query<{ value: string }>(
        `SELECT TOP (1) [value]
         FROM [dbo].[app_metadata] WITH (UPDLOCK, HOLDLOCK)
         WHERE [key] = @key`,
        { key },
        transaction,
      );
      let currentValue = Math.trunc(asNumber(result.recordset[0]?.value));

      if (currentValue <= 0 && key === "shift_sequence") {
        currentValue = await this.countScalar(
          "SELECT COUNT(*) AS [value] FROM [dbo].[pos_shift]",
        );
      } else if (currentValue <= 0 && key === "transaction_sequence") {
        currentValue = await this.countScalar(
          "SELECT COUNT(*) AS [value] FROM [dbo].[pos_transaction]",
        );
      } else if (
        currentValue <= 0 &&
        key === "customer_account_entry_sequence"
      ) {
        currentValue = await this.countScalar(
          "SELECT COUNT(*) AS [value] FROM [dbo].[customer_account_entry]",
        );
      } else if (currentValue <= 0 && key === "sales_order_sequence") {
        currentValue = await this.countScalar(
          "SELECT COUNT(*) AS [value] FROM [dbo].[sales_order]",
        );
      }

      const nextValue = currentValue + 1;

      await this.setMetadata(key, String(nextValue), transaction);
      return nextValue;
    });
  }

  private async nextPosTransactionNumber() {
    return this.withTransaction((transaction) =>
      this.allocatePosTransactionNumber(transaction),
    );
  }

  private async allocatePosTransactionNumber(transaction: sql.Transaction) {
    const result = await this.query<{ key: string; value: string }>(
      `SELECT [key], [value]
       FROM [dbo].[app_metadata] WITH (UPDLOCK, HOLDLOCK)
       WHERE [key] IN (@sequenceKey, @seriesTokenKey)`,
      {
        sequenceKey: POS_RECEIPT_SEQUENCE_METADATA_KEY,
        seriesTokenKey: POS_RECEIPT_SERIES_TOKEN_METADATA_KEY,
      },
      transaction,
    );
    const metadata = Object.fromEntries(
      result.recordset.map((row) => [row.key, row.value]),
    );
    let seriesToken = metadata[POS_RECEIPT_SERIES_TOKEN_METADATA_KEY];
    let currentSequence = Math.trunc(
      asNumber(metadata[POS_RECEIPT_SEQUENCE_METADATA_KEY]),
    );

    if (
      !isPosReceiptSeriesToken(seriesToken) ||
      currentSequence >= POS_RECEIPT_MAX_SEQUENCE
    ) {
      seriesToken = createPosReceiptSeriesToken();
      currentSequence = 0;
    }

    const nextSequence = currentSequence + 1;
    await this.setMetadata(
      POS_RECEIPT_SERIES_TOKEN_METADATA_KEY,
      seriesToken,
      transaction,
    );
    await this.setMetadata(
      POS_RECEIPT_SEQUENCE_METADATA_KEY,
      String(nextSequence),
      transaction,
    );
    return formatPosTransactionNumber(seriesToken, nextSequence);
  }

  private async listStoreUsers() {
    const result = await this.query<RetailUserRow>(
      `SELECT TOP (200)
        [id],
        [login_id],
        [email],
        [display_name],
        [account_status],
        [home_store_code],
        [home_store_name],
        [role_codes_json],
        [role_names_json],
        [permission_codes_json],
        [password_hash],
        [updated_at]
       FROM [dbo].[retail_user_snapshot]
       ORDER BY [display_name] ASC, [login_id] ASC`,
    );

    return result.recordset.map((row) => this.toStoreUserSummary(row));
  }

  private async listActiveTenderMethods(): Promise<StoreTenderMethodSummary[]> {
    const seededTenderDescriptionPattern =
      "%seeded into the flash rms store desktop.%";
    const tenderScopeSql = this.isStandaloneDeployment()
      ? `(
           [published_at] IS NOT NULL
           OR NOT EXISTS (
             SELECT 1
             FROM [dbo].[tender_method_snapshot] AS [enterprise_tender]
             WHERE [enterprise_tender].[published_at] IS NOT NULL
           )
         )`
      : `(
           [published_at] IS NOT NULL
           OR (
             NOT EXISTS (
               SELECT 1
               FROM [dbo].[tender_method_snapshot] AS [enterprise_tender]
               WHERE [enterprise_tender].[published_at] IS NOT NULL
             )
             AND (
               LOWER(COALESCE([description], N'')) NOT LIKE @seededTenderDescriptionPattern
               OR NOT EXISTS (
                 SELECT 1
                 FROM [dbo].[tender_method_snapshot] AS [configured_tender]
                 WHERE [configured_tender].[status] = N'ACTIVE'
                   AND LOWER(COALESCE([configured_tender].[description], N'')) NOT LIKE @seededTenderDescriptionPattern
               )
             )
           )
         )`;
    const queryParams = this.isStandaloneDeployment()
      ? {}
      : { seededTenderDescriptionPattern };
    const result = await this.query<{
      tender_method_code: string;
      tender_method_name: string;
      payment_method: SyncPaymentMethod;
      gateway_provider: "PAYSTACK" | "FLUTTERWAVE" | "OTHER" | null;
      gateway_mode: "TEST" | "LIVE" | null;
      gateway_merchant_id: string | null;
      gateway_public_key: string | null;
      gateway_callback_url: string | null;
      gateway_active: string | number;
      gateway_status: "DISABLED" | "READY" | "NEEDS_REVIEW";
      requires_reference: string | number;
      allow_change: string | number;
      allow_refund: string | number;
      allow_open_cash_drawer: string | number;
      status: string;
      sort_order: string | number;
      updated_at: string;
    }>(
      `SELECT
        [tender_method_code],
        [tender_method_name],
        [payment_method],
        [gateway_provider],
        [gateway_mode],
        [gateway_merchant_id],
        [gateway_public_key],
        [gateway_callback_url],
        [gateway_active],
        [gateway_status],
        [requires_reference],
        [allow_change],
        [allow_refund],
        [allow_open_cash_drawer],
        [status],
        [sort_order],
        [updated_at]
       FROM [dbo].[tender_method_snapshot]
       WHERE [status] = N'ACTIVE'
         AND ${tenderScopeSql}
       ORDER BY
         CASE
           WHEN [payment_method] = N'CASH' OR UPPER([tender_method_code]) = N'CASH' THEN 0
           ELSE 1
         END,
         [sort_order] ASC,
         [tender_method_name] ASC`,
      queryParams,
    );

    return result.recordset.map((row) => ({
      tenderMethodCode: row.tender_method_code,
      tenderMethodName: row.tender_method_name,
      paymentMethod: row.payment_method,
      gatewayProvider: row.gateway_provider,
      gatewayMode: row.gateway_mode,
      gatewayMerchantId: row.gateway_merchant_id,
      gatewayPublicKey: row.gateway_public_key,
      gatewayCallbackUrl: row.gateway_callback_url,
      gatewayActive: asBooleanFlag(row.gateway_active),
      gatewayStatus: row.gateway_status ?? "DISABLED",
      requiresReference: asBooleanFlag(row.requires_reference),
      allowChange: asBooleanFlag(row.allow_change),
      allowRefund: asBooleanFlag(row.allow_refund),
      allowOpenCashDrawer: asBooleanFlag(row.allow_open_cash_drawer),
      status: row.status,
      sortOrder: Math.trunc(asNumber(row.sort_order)),
      updatedAt: row.updated_at,
    }));
  }

  private async listActiveBankAccounts(): Promise<StoreBankAccountSummary[]> {
    const result = await this.query<{
      id: string;
      bank_code: string;
      bank_name: string;
      branch_code: string;
      branch_name: string;
      account_number: string;
      account_name: string;
      currency_code: string;
      status: string;
      updated_at: string;
    }>(
      `SELECT
        [id],
        [bank_code],
        [bank_name],
        [branch_code],
        [branch_name],
        [account_number],
        [account_name],
        [currency_code],
        [status],
        [updated_at]
       FROM [dbo].[bank_account_snapshot]
       WHERE [status] = N'ACTIVE'
       ORDER BY [bank_name] ASC, [branch_name] ASC, [account_number] ASC`,
    );

    return result.recordset.map((row) => ({
      bankAccountId: row.id,
      bankCode: row.bank_code,
      bankName: row.bank_name,
      branchCode: row.branch_code,
      branchName: row.branch_name,
      accountNumber: row.account_number,
      accountName: row.account_name,
      currencyCode: row.currency_code,
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }

  private async getTenderMethodByCode(
    tenderMethodCode: string | null | undefined,
  ) {
    if (!tenderMethodCode?.trim()) {
      return null;
    }

    return (
      (await this.listActiveTenderMethods()).find(
        (method) => method.tenderMethodCode === tenderMethodCode,
      ) ?? null
    );
  }

  private async getBankAccountById(bankAccountId: string | null | undefined) {
    if (!bankAccountId?.trim()) {
      return null;
    }

    return (
      (await this.listActiveBankAccounts()).find(
        (account) => account.bankAccountId === bankAccountId,
      ) ?? null
    );
  }

  private tenderRequiresBankAccount(
    method: StoreTenderMethodSummary | null | undefined,
  ) {
    if (!method) {
      return false;
    }

    const searchable =
      `${method.tenderMethodCode} ${method.tenderMethodName} ${method.paymentMethod}`.toUpperCase();

    return (
      method.paymentMethod === "BANK_TRANSFER" ||
      searchable.includes("CHEQUE") ||
      searchable.includes("CHECK") ||
      searchable.includes("BANK DEPOSIT") ||
      searchable.includes("DEPOSIT")
    );
  }

  private getReceiptPrinterSettingsSummary(
    metadata: Record<string, string | undefined>,
  ): StoreReceiptPrinterSettingsSummary {
    const terminalCode = this.getTerminalCode();
    const terminalPrinterName =
      metadata[`receipt_printer_name:${terminalCode}`]?.trim();
    const terminalSilentPrint =
      metadata[`receipt_printer_silent:${terminalCode}`];
    const terminalAutoPrint = metadata[`receipt_auto_print:${terminalCode}`];

    return {
      selectedPrinterName:
        terminalPrinterName || metadata.receipt_printer_name?.trim() || null,
      silentPrintEnabled:
        (terminalSilentPrint ?? metadata.receipt_printer_silent) === "1",
      autoPrintOnComplete:
        (terminalAutoPrint ?? metadata.receipt_auto_print) !== "0",
    };
  }

  private async getOpenShiftRow() {
    const result = await this.query<PosShiftRow>(
      `SELECT TOP (1)
        [id],
        [shift_no],
        [terminal_code],
        [cashier_code],
        [status],
        [opening_float_amount],
        [closing_declared_cash],
        [closing_variance],
        [opened_at],
        [closed_at],
        [record_version]
       FROM [dbo].[pos_shift]
       WHERE [status] = N'OPEN'
         AND [terminal_code] = @terminalCode
       ORDER BY [opened_at] DESC`,
      { terminalCode: this.getTerminalCode() },
    );

    return result.recordset[0] ?? null;
  }

  private async getShiftRows(whereSql = "", params: Record<string, unknown> = {}) {
    const result = await this.query<PosShiftRow>(
      `SELECT TOP (20)
        [id],
        [shift_no],
        [terminal_code],
        [cashier_code],
        [status],
        [opening_float_amount],
        [closing_declared_cash],
        [closing_variance],
        [opened_at],
        [closed_at],
        [record_version]
       FROM [dbo].[pos_shift]
       ${whereSql}
       ORDER BY [opened_at] DESC`,
      params,
    );

    return result.recordset;
  }

  private async getShiftTransactionSummaryRows(shiftId: string) {
    const result = await this.query<{
      transaction_type: SyncPosTransactionType;
      total_amount: string | number;
      change_amount: string | number;
      has_cash_payment: string | number;
    }>(
      `SELECT
        txn.[transaction_type],
        txn.[total_amount],
        txn.[change_amount],
        CASE WHEN EXISTS (
          SELECT 1
          FROM [dbo].[pos_payment] AS payment
          WHERE payment.[pos_transaction_id] = txn.[id]
            AND payment.[method] = N'CASH'
        ) THEN 1 ELSE 0 END AS [has_cash_payment]
       FROM [dbo].[pos_transaction] AS txn
       WHERE txn.[shift_id] = @shiftId
         AND txn.[status] = N'COMPLETED'
       ORDER BY txn.[completed_at] ASC, txn.[transaction_no] ASC`,
      { shiftId },
    );

    return result.recordset;
  }

  private async getShiftPaymentSummaryRows(shiftId: string) {
    const result = await this.query<{
      transaction_type: SyncPosTransactionType | "ACCOUNT_PAYMENT";
      method: SyncPaymentMethod;
      tender_method_code: string | null;
      tender_method_name: string | null;
      amount: string | number;
      total_amount: string | number;
    }>(
      `SELECT
        payment_rows.[transaction_type],
        payment_rows.[method],
        payment_rows.[tender_method_code],
        payment_rows.[tender_method_name],
        payment_rows.[amount],
        payment_rows.[total_amount]
       FROM (
         SELECT
           txn.[transaction_type],
           payment.[method],
           payment.[tender_method_code],
           payment.[tender_method_name],
           payment.[amount],
           txn.[total_amount],
           payment.[received_at] AS [sort_occurred_at],
           payment.[id] AS [sort_id]
         FROM [dbo].[pos_payment] AS payment
         INNER JOIN [dbo].[pos_transaction] AS txn
           ON txn.[id] = payment.[pos_transaction_id]
         WHERE txn.[shift_id] = @shiftId
           AND txn.[status] = N'COMPLETED'
         UNION ALL
         SELECT
           N'ACCOUNT_PAYMENT' AS [transaction_type],
           entry.[payment_method] AS [method],
           entry.[tender_method_code],
           entry.[tender_method_name],
           entry.[amount],
           entry.[amount] AS [total_amount],
           entry.[occurred_at] AS [sort_occurred_at],
           entry.[id] AS [sort_id]
         FROM [dbo].[customer_account_entry] AS entry
         WHERE entry.[shift_id] = @shiftId
       ) AS payment_rows
       ORDER BY payment_rows.[sort_occurred_at] ASC, payment_rows.[sort_id] ASC`,
      { shiftId },
    );

    return result.recordset;
  }

  private async toShiftSummary(shift: PosShiftRow): Promise<StoreShiftSummary> {
    const [transactionRows, paymentRows] = await Promise.all([
      this.getShiftTransactionSummaryRows(shift.id),
      this.getShiftPaymentSummaryRows(shift.id),
    ]);
    const tenderTotalsByKey = new Map<string, StoreShiftTenderSummary>();
    let expectedCashAmount = Number(
      asNumber(shift.opening_float_amount).toFixed(2),
    );
    let netSalesAmount = 0;
    let cashTenderedAmount = 0;
    let nonCashTenderedAmount = 0;
    let accountPaymentsAmount = 0;
    let salesCount = 0;
    let returnCount = 0;
    let exchangeCount = 0;

    for (const transaction of transactionRows) {
      const totalAmount = Number(asNumber(transaction.total_amount).toFixed(2));
      const isRefundSettlement =
        transaction.transaction_type === "RETURN" ||
        (transaction.transaction_type === "EXCHANGE" && totalAmount < 0);

      netSalesAmount = Number((netSalesAmount + totalAmount).toFixed(2));

      if (transaction.transaction_type === "SALE") {
        salesCount += 1;
      } else if (transaction.transaction_type === "RETURN") {
        returnCount += 1;
      } else {
        exchangeCount += 1;
      }

      if (asBooleanFlag(transaction.has_cash_payment) && !isRefundSettlement) {
        expectedCashAmount = Number(
          (expectedCashAmount - asNumber(transaction.change_amount)).toFixed(2),
        );
      }
    }

    for (const payment of paymentRows) {
      const totalAmount = Number(asNumber(payment.total_amount).toFixed(2));
      const signedAmount =
        payment.transaction_type === "RETURN" ||
        (payment.transaction_type === "EXCHANGE" && totalAmount < 0)
          ? Number((asNumber(payment.amount) * -1).toFixed(2))
          : Number(asNumber(payment.amount).toFixed(2));
      const tenderKey = `${payment.method}:${
        payment.tender_method_code ?? payment.tender_method_name ?? "unmapped"
      }`;
      const currentTender = tenderTotalsByKey.get(tenderKey) ?? {
        method: payment.method,
        tenderMethodCode: payment.tender_method_code,
        tenderMethodName: payment.tender_method_name,
        netAmount: 0,
        transactionCount: 0,
      };

      currentTender.netAmount = Number(
        (currentTender.netAmount + signedAmount).toFixed(2),
      );
      currentTender.transactionCount += 1;
      tenderTotalsByKey.set(tenderKey, currentTender);

      if (payment.transaction_type === "ACCOUNT_PAYMENT") {
        accountPaymentsAmount = Number(
          (accountPaymentsAmount + signedAmount).toFixed(2),
        );
      }

      if (payment.method === "CASH") {
        cashTenderedAmount = Number(
          (cashTenderedAmount + signedAmount).toFixed(2),
        );
        expectedCashAmount = Number(
          (expectedCashAmount + signedAmount).toFixed(2),
        );
      } else {
        nonCashTenderedAmount = Number(
          (nonCashTenderedAmount + signedAmount).toFixed(2),
        );
      }
    }

    return {
      shiftId: shift.id,
      shiftNo: shift.shift_no,
      terminalCode: shift.terminal_code,
      cashierCode: shift.cashier_code,
      status: shift.status,
      openingFloatAmount: Number(
        asNumber(shift.opening_float_amount).toFixed(2),
      ),
      expectedCashAmount,
      declaredCashAmount:
        shift.closing_declared_cash === null
          ? null
          : Number(asNumber(shift.closing_declared_cash).toFixed(2)),
      varianceAmount:
        shift.closing_variance === null
          ? null
          : Number(asNumber(shift.closing_variance).toFixed(2)),
      transactionCount: transactionRows.length,
      salesCount,
      returnCount,
      exchangeCount,
      netSalesAmount: Number(netSalesAmount.toFixed(2)),
      cashTenderedAmount: Number(cashTenderedAmount.toFixed(2)),
      nonCashTenderedAmount: Number(nonCashTenderedAmount.toFixed(2)),
      accountPaymentsAmount: Number(accountPaymentsAmount.toFixed(2)),
      openedAt: shift.opened_at,
      closedAt: shift.closed_at,
      tenderTotals: [...tenderTotalsByKey.values()].sort((left, right) =>
        left.method.localeCompare(right.method),
      ),
    };
  }

  private async getActiveBasketId() {
    return this.metadataValue(this.getActiveBasketMetadataKey());
  }

  private async getBasketHeader(transactionId: string) {
    const result = await this.query<BasketHeaderRow>(
      `SELECT TOP (1)
        txn.[id],
        txn.[transaction_no],
        txn.[customer_id],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        customer.[customer_type],
        customer.[loyalty_enrolled] AS [customer_loyalty_enrolled],
        customer.[loyalty_tier] AS [customer_loyalty_tier],
        customer.[loyalty_points_balance] AS [customer_loyalty_points_balance],
        txn.[source_transaction_id],
        txn.[source_transaction_no],
        txn.[transaction_type],
        txn.[status],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[loyalty_redemption_points],
        txn.[loyalty_redemption_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[change_amount],
        txn.[notes],
        txn.[header_reference],
        txn.[additional_details],
        txn.[updated_at],
        txn.[completed_at],
        txn.[record_version]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       WHERE txn.[id] = @transactionId`,
      { transactionId },
    );

    return result.recordset[0] ?? null;
  }

  private async getBasketLine(lineId: string) {
    const result = await this.query<BasketLineRow>(
      `SELECT TOP (1)
        [id],
        [pos_transaction_id],
        [product_id],
        [inventory_location_code],
        [line_intent],
        [source_line_id],
        [applied_promotion_code],
        [applied_promotion_name],
        [product_code_snapshot],
        [product_variant_code_snapshot],
        [product_name_snapshot],
        [variant_size],
        [variant_color],
        [variant_attributes_snapshot],
        [line_note],
        [serial_numbers_json],
        [quantity],
        [unit_price],
        [discount_amount],
        [tax_amount],
        [line_total],
        [manual_price_override],
        [manual_discount_override]
       FROM [dbo].[pos_transaction_line]
       WHERE [id] = @lineId`,
      { lineId },
    );

    return result.recordset[0] ?? null;
  }

  private async getBasketLineBySourceLine(
    transactionId: string,
    sourceLineId: string,
    lineIntent: SyncPosLineIntent,
  ) {
    const result = await this.query<BasketLineRow>(
      `SELECT TOP (1)
        [id],
        [pos_transaction_id],
        [product_id],
        [inventory_location_code],
        [line_intent],
        [source_line_id],
        [applied_promotion_code],
        [applied_promotion_name],
        [product_code_snapshot],
        [product_variant_code_snapshot],
        [product_name_snapshot],
        [variant_size],
        [variant_color],
        [variant_attributes_snapshot],
        [line_note],
        [serial_numbers_json],
        [quantity],
        [unit_price],
        [discount_amount],
        [tax_amount],
        [line_total],
        [manual_price_override],
        [manual_discount_override]
       FROM [dbo].[pos_transaction_line]
       WHERE [pos_transaction_id] = @transactionId
         AND [source_line_id] = @sourceLineId
         AND [line_intent] = @lineIntent`,
      { transactionId, sourceLineId, lineIntent },
    );

    return result.recordset[0] ?? null;
  }

  private async getBasketLines(transactionId: string) {
    const result = await this.query<BasketLineRow>(
      `SELECT
        [id],
        [pos_transaction_id],
        [product_id],
        [inventory_location_code],
        [line_intent],
        [source_line_id],
        [applied_promotion_code],
        [applied_promotion_name],
        [product_code_snapshot],
        [product_variant_code_snapshot],
        [product_name_snapshot],
        [variant_size],
        [variant_color],
        [variant_attributes_snapshot],
        [line_note],
        [serial_numbers_json],
        [quantity],
        [unit_price],
        [discount_amount],
        [tax_amount],
        [line_total],
        [manual_price_override],
        [manual_discount_override]
       FROM [dbo].[pos_transaction_line]
       WHERE [pos_transaction_id] = @transactionId
       ORDER BY [line_intent] DESC, [product_name_snapshot] ASC, [id] ASC`,
      { transactionId },
    );

    return result.recordset;
  }

  private async requireBasketProductLookup(productCode: string) {
    const match = await this.findBasketProductLookup(productCode);

    if (!match) {
      throw new Error(
        `Flash ERP could not find local product "${productCode}" anymore.`,
      );
    }

    return match;
  }

  private async findBasketProductLookup(productCode: string) {
    const activeMatch = await this.findCatalogLookup(productCode);

    if (activeMatch) {
      return activeMatch;
    }

    const normalizedProductCode = productCode.trim().toUpperCase();

    if (!normalizedProductCode) {
      return null;
    }

    const result = await this.query<ProductRow>(
      `SELECT TOP (1)
        [id],
        [product_code],
        [product_name],
        [product_type],
        [short_name],
        [description],
        [primary_image_url],
        [department_code],
        [category_code],
        [subcategory],
        [unit_of_measure],
        [taxable],
        [tax_profile_code],
        [tax_profile_name],
        [tax_rate_percent],
        [tax_inclusive],
        [track_inventory],
        [is_serialized],
        [track_size],
        [track_color],
        [must_enter_price_at_pos],
        [min_stock_level],
        [reorder_point],
        [safety_stock_level],
        [catalog_membership_active],
        [catalog_sort_order],
        [unit_price],
        [quantity_on_hand],
        [updated_at]
       FROM [dbo].[product_snapshot]
       WHERE [product_code] = @productCode`,
      { productCode: normalizedProductCode },
    );
    const product = result.recordset[0] ?? null;

    if (!product) {
      return null;
    }

    const [barcode, salesLocationCode] = await Promise.all([
      this.getRepresentativeBarcode(product.product_code),
      this.getDefaultSalesLocationCode(),
    ]);

    return {
      ...product,
      barcode_code: barcode?.barcode_code ?? null,
      barcode_type: barcode?.barcode_type ?? null,
      matched_on: "productCode" as const,
      product_variant_code: null,
      sales_location_code: salesLocationCode,
      sales_location_quantity:
        salesLocationCode !== null
          ? await this.getOptionalLocationQuantity(
              salesLocationCode,
              product.product_code,
            )
          : null,
    };
  }

  private async getBasketLineAvailableSerialNumbers(
    header: BasketHeaderRow,
    line: BasketLineRow,
  ) {
    if (line.line_intent !== "SALE" || header.transaction_type === "RETURN") {
      return readSerializedLineNumbers(line.serial_numbers_json);
    }

    const product = await this.findBasketProductLookup(
      line.product_code_snapshot,
    );

    if (!product) {
      return readSerializedLineNumbers(line.serial_numbers_json);
    }

    if (!asBooleanFlag(product.is_serialized)) {
      return [];
    }

    const selectedSerialNumbers = readSerializedLineNumbers(
      line.serial_numbers_json,
    );
    const availableSerialNumbers = await this.listAvailableSaleSerialNumbers(
      line.product_code_snapshot,
      line.inventory_location_code ?? product.sales_location_code,
    );

    return [
      ...new Set([...selectedSerialNumbers, ...availableSerialNumbers]),
    ].sort((left, right) => left.localeCompare(right));
  }

  private async toBasketLineSummary(
    header: BasketHeaderRow,
    line: BasketLineRow,
  ): Promise<StoreBasketLineSummary> {
    const [product, barcode, availableSerialNumbers] = await Promise.all([
      this.findBasketProductLookup(line.product_code_snapshot),
      this.getRepresentativeBarcode(line.product_code_snapshot),
      this.getBasketLineAvailableSerialNumbers(header, line),
    ]);
    const serialNumbers = readSerializedLineNumbers(line.serial_numbers_json);

    return {
      lineId: line.id,
      lineIntent: line.line_intent,
      sourceLineId: line.source_line_id,
      productCode: line.product_code_snapshot,
      productVariantCode: line.product_variant_code_snapshot,
      productName: line.product_name_snapshot,
      variantSize: line.variant_size,
      variantColor: line.variant_color,
      variantAttributesSnapshot: line.variant_attributes_snapshot,
      lineNote: line.line_note,
      barcode: barcode?.barcode_code ?? null,
      isSerialized:
        asBooleanFlag(product?.is_serialized) || serialNumbers.length > 0,
      serialNumbers,
      availableSerialNumbers,
      quantity: Number(asNumber(line.quantity).toFixed(3)),
      unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
      discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
      taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
      lineTotal: Number(asNumber(line.line_total).toFixed(2)),
      hasManualPriceOverride: asBooleanFlag(line.manual_price_override),
      hasManualDiscountOverride: asBooleanFlag(line.manual_discount_override),
      appliedPromotionCode: line.applied_promotion_code,
      appliedPromotionName: line.applied_promotion_name,
    };
  }

  private async toBasketSummary(
    header: BasketHeaderRow,
  ): Promise<StoreBasketSummary> {
    const basketLines = await this.getBasketLines(header.id);
    const lines = await Promise.all(
      basketLines.map((line) => this.toBasketLineSummary(header, line)),
    );

    return {
      transactionId: header.id,
      transactionNo: header.transaction_no,
      transactionType: header.transaction_type,
      sourceTransactionId: header.source_transaction_id,
      sourceTransactionNo: header.source_transaction_no,
      customerId: header.customer_id,
      customerNo: header.customer_no,
      customerName: header.customer_name,
      status: header.status,
      itemCount: Number(
        lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3),
      ),
      lineCount: lines.length,
      subtotalAmount: Number(asNumber(header.subtotal_amount).toFixed(2)),
      discountAmount: Number(asNumber(header.discount_amount).toFixed(2)),
      taxAmount: Number(asNumber(header.tax_amount).toFixed(2)),
      totalAmount: Number(asNumber(header.total_amount).toFixed(2)),
      customerLoyaltyEnrolled:
        asBooleanFlag(header.customer_loyalty_enrolled) ||
        Math.trunc(asNumber(header.customer_loyalty_points_balance)) > 0 ||
        Boolean(header.customer_loyalty_tier?.trim()),
      customerLoyaltyTier: header.customer_loyalty_tier,
      customerLoyaltyPointsBalance: header.customer_id
        ? Math.max(
            0,
            Math.trunc(asNumber(header.customer_loyalty_points_balance)),
          )
        : null,
      loyaltyRedemptionAllowed: false,
      loyaltyRedemptionMessage:
        "SQL Server loyalty redemption is waiting for the loyalty adapter slice.",
      loyaltyRedemptionPoints: Math.trunc(
        asNumber(header.loyalty_redemption_points),
      ),
      loyaltyRedemptionAmount: Number(
        asNumber(header.loyalty_redemption_amount).toFixed(2),
      ),
      maxLoyaltyRedemptionPoints: 0,
      maxLoyaltyRedemptionAmount: 0,
      appliedPromotions: [],
      promotionStatusMessage:
        "SQL Server promotion pricing is waiting for the pricing adapter slice.",
      updatedAt: header.updated_at,
      lines,
    };
  }

  private async getActiveBasketSummary() {
    const basketId = await this.getActiveBasketId();

    if (!basketId) {
      return null;
    }

    const basket = await this.getBasketHeader(basketId);

    if (!basket || basket.status !== "PARKED") {
      await this.deleteMetadata(this.getActiveBasketMetadataKey());
      return null;
    }

    return this.toBasketSummary(basket);
  }

  private async getParkedBasketSummaries(excludeTransactionId: string | null) {
    const result = await this.query<BasketHeaderRow>(
      `SELECT TOP (8)
        txn.[id],
        txn.[transaction_no],
        txn.[customer_id],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        customer.[customer_type],
        customer.[loyalty_enrolled] AS [customer_loyalty_enrolled],
        customer.[loyalty_tier] AS [customer_loyalty_tier],
        customer.[loyalty_points_balance] AS [customer_loyalty_points_balance],
        txn.[source_transaction_id],
        txn.[source_transaction_no],
        txn.[transaction_type],
        txn.[status],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[loyalty_redemption_points],
        txn.[loyalty_redemption_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[change_amount],
        txn.[notes],
        txn.[header_reference],
        txn.[additional_details],
        txn.[updated_at],
        txn.[completed_at],
        txn.[record_version]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       WHERE txn.[status] = N'PARKED'
       ORDER BY txn.[updated_at] DESC`,
    );

    return Promise.all(
      result.recordset
        .filter((row) => row.id !== excludeTransactionId)
        .map(async (row) => {
          const lines = await this.getBasketLines(row.id);

          return {
            transactionId: row.id,
            transactionNo: row.transaction_no,
            transactionType: row.transaction_type,
            sourceTransactionNo: row.source_transaction_no,
            customerNo: row.customer_no,
            customerName: row.customer_name,
            itemCount: Number(
              lines
                .reduce((sum, line) => sum + asNumber(line.quantity), 0)
                .toFixed(3),
            ),
            lineCount: lines.length,
            totalAmount: Number(asNumber(row.total_amount).toFixed(2)),
            updatedAt: row.updated_at,
          };
        }),
    );
  }

  private async getRecentTransactions() {
    const result = await this.query<TransactionRow>(
      `SELECT TOP (200)
        txn.[transaction_no],
        txn.[source_transaction_no],
        txn.[transaction_type],
        txn.[status],
        txn.[total_amount],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        shift.[terminal_code],
        ISNULL(txn.[cashier_code], shift.[cashier_code]) AS [cashier_code],
        shift.[shift_no],
        (
          SELECT COUNT(*)
          FROM [dbo].[pos_transaction_line] AS line
          WHERE line.[pos_transaction_id] = txn.[id]
        ) AS [line_count],
        txn.[updated_at],
        txn.[completed_at]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       LEFT JOIN [dbo].[pos_shift] AS shift
         ON shift.[id] = txn.[shift_id]
       ORDER BY txn.[updated_at] DESC, txn.[transaction_no] DESC`,
    );

    return result.recordset.map<StoreTransactionSummary>((transaction) => ({
      transactionNo: transaction.transaction_no,
      sourceTransactionNo: transaction.source_transaction_no,
      transactionType: transaction.transaction_type,
      status: transaction.status,
      totalAmount: Number(asNumber(transaction.total_amount).toFixed(2)),
      customerNo: transaction.customer_no,
      customerName: transaction.customer_name,
      terminalCode: transaction.terminal_code,
      cashierCode: transaction.cashier_code,
      shiftNo: transaction.shift_no,
      lineCount: Math.trunc(asNumber(transaction.line_count)),
      updatedAt: transaction.updated_at,
      completedAt: transaction.completed_at,
    }));
  }

  private async getRecentCustomerAccountEntries() {
    const result = await this.query<CustomerAccountEntryRow>(
      `SELECT TOP (30)
        [id],
        [entry_no],
        [customer_id],
        [customer_no],
        [customer_name],
        [entry_type],
        [payment_method],
        [tender_method_code],
        [tender_method_name],
        [amount],
        [reference],
        [note],
        [shift_id],
        [shift_no],
        [cashier_code],
        [synced_at],
        [occurred_at],
        [updated_at]
       FROM [dbo].[customer_account_entry]
       ORDER BY [occurred_at] DESC, [entry_no] DESC`,
    );

    return result.recordset.map<StoreCustomerAccountEntrySummary>((row) => ({
      entryId: row.id,
      entryNo: row.entry_no,
      customerId: row.customer_id,
      customerNo: row.customer_no,
      customerName: row.customer_name,
      entryType: row.entry_type,
      paymentMethod: row.payment_method,
      tenderMethodCode: row.tender_method_code,
      tenderMethodName: row.tender_method_name,
      amount: Number(asNumber(row.amount).toFixed(2)),
      reference: row.reference,
      note: row.note,
      shiftId: row.shift_id,
      shiftNo: row.shift_no,
      cashierCode: row.cashier_code,
      syncedAt: row.synced_at,
      occurredAt: row.occurred_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getSalesOrderRows(
    whereSql = "",
    params: Record<string, unknown> = {},
  ) {
    const result = await this.query<SalesOrderRow>(
      `SELECT TOP (60)
        sales_order.[id],
        sales_order.[order_no],
        sales_order.[source_transaction_id],
        sales_order.[source_transaction_no],
        sales_order.[customer_id],
        sales_order.[customer_no],
        sales_order.[customer_name],
        sales_order.[status],
        sales_order.[total_amount],
        sales_order.[deposit_amount],
        sales_order.[balance_amount],
        sales_order.[deposit_tender_method_code],
        sales_order.[deposit_tender_method_name],
        sales_order.[deposit_payment_method],
        sales_order.[deposit_reference],
        sales_order.[deposit_paid_at],
        COUNT(line.[id]) AS [line_count],
        COALESCE(SUM(line.[quantity]), 0) AS [item_count],
        sales_order.[operator_name],
        sales_order.[note],
        sales_order.[fulfilled_transaction_id],
        sales_order.[fulfilled_transaction_no],
        sales_order.[synced_at],
        sales_order.[created_at],
        sales_order.[fulfilled_at],
        sales_order.[cancelled_at],
        sales_order.[updated_at]
       FROM [dbo].[sales_order] AS sales_order
       LEFT JOIN [dbo].[pos_transaction_line] AS line
         ON line.[pos_transaction_id] = sales_order.[source_transaction_id]
       ${whereSql}
       GROUP BY
        sales_order.[id],
        sales_order.[order_no],
        sales_order.[source_transaction_id],
        sales_order.[source_transaction_no],
        sales_order.[customer_id],
        sales_order.[customer_no],
        sales_order.[customer_name],
        sales_order.[status],
        sales_order.[total_amount],
        sales_order.[deposit_amount],
        sales_order.[balance_amount],
        sales_order.[deposit_tender_method_code],
        sales_order.[deposit_tender_method_name],
        sales_order.[deposit_payment_method],
        sales_order.[deposit_reference],
        sales_order.[deposit_paid_at],
        sales_order.[operator_name],
        sales_order.[note],
        sales_order.[fulfilled_transaction_id],
        sales_order.[fulfilled_transaction_no],
        sales_order.[synced_at],
        sales_order.[created_at],
        sales_order.[fulfilled_at],
        sales_order.[cancelled_at],
        sales_order.[updated_at]
       ORDER BY
        CASE sales_order.[status] WHEN N'OPEN' THEN 0 WHEN N'FULFILLED' THEN 1 ELSE 2 END,
        sales_order.[updated_at] DESC`,
      params,
    );

    return result.recordset;
  }

  private toSalesOrderSummary(row: SalesOrderRow): StoreSalesOrderSummary {
    return {
      orderId: row.id,
      orderNo: row.order_no,
      sourceTransactionId: row.source_transaction_id,
      sourceTransactionNo: row.source_transaction_no,
      customerId: row.customer_id,
      customerNo: row.customer_no,
      customerName: row.customer_name,
      status: row.status,
      totalAmount: Number(asNumber(row.total_amount).toFixed(2)),
      depositAmount: Number(asNumber(row.deposit_amount).toFixed(2)),
      balanceAmount: Number(asNumber(row.balance_amount).toFixed(2)),
      depositTenderMethodCode: row.deposit_tender_method_code,
      depositTenderMethodName: row.deposit_tender_method_name,
      depositPaymentMethod: row.deposit_payment_method,
      depositReference: row.deposit_reference,
      depositPaidAt: row.deposit_paid_at,
      lineCount: Math.trunc(asNumber(row.line_count)),
      itemCount: Number(asNumber(row.item_count).toFixed(3)),
      operatorName: row.operator_name,
      note: row.note,
      fulfilledTransactionId: row.fulfilled_transaction_id,
      fulfilledTransactionNo: row.fulfilled_transaction_no,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
      fulfilledAt: row.fulfilled_at,
      cancelledAt: row.cancelled_at,
      updatedAt: row.updated_at,
    };
  }

  private async getSalesOrderRow(orderId: string) {
    const rows = await this.getSalesOrderRows(
      "WHERE sales_order.[id] = @orderId",
      { orderId },
    );

    return rows[0] ?? null;
  }

  private async getSalesOrderSummaries() {
    return (await this.getSalesOrderRows()).map((row) =>
      this.toSalesOrderSummary(row),
    );
  }

  private async getRecentEodReconciliationSummaries() {
    const result = await this.query<EodReconciliationRow>(
      `SELECT TOP (30)
        [id],
        [reconciliation_no],
        [shift_id],
        [shift_no],
        [cashier_code],
        [expected_cash_amount],
        [declared_cash_amount],
        [variance_amount],
        [net_sales_amount],
        [cash_tendered_amount],
        [non_cash_tendered_amount],
        [transaction_count],
        [operator_name],
        [note],
        [synced_at],
        [reconciled_at],
        [updated_at]
       FROM [dbo].[eod_reconciliation]
       ORDER BY [reconciled_at] DESC`,
    );

    return result.recordset.map<StoreEodReconciliationSummary>((row) => ({
      reconciliationId: row.id,
      reconciliationNo: row.reconciliation_no,
      shiftId: row.shift_id,
      shiftNo: row.shift_no,
      cashierCode: row.cashier_code,
      expectedCashAmount: Number(asNumber(row.expected_cash_amount).toFixed(2)),
      declaredCashAmount: Number(asNumber(row.declared_cash_amount).toFixed(2)),
      varianceAmount: Number(asNumber(row.variance_amount).toFixed(2)),
      netSalesAmount: Number(asNumber(row.net_sales_amount).toFixed(2)),
      cashTenderedAmount: Number(asNumber(row.cash_tendered_amount).toFixed(2)),
      nonCashTenderedAmount: Number(
        asNumber(row.non_cash_tendered_amount).toFixed(2),
      ),
      transactionCount: Math.trunc(asNumber(row.transaction_count)),
      operatorName: row.operator_name,
      note: row.note,
      syncedAt: row.synced_at,
      reconciledAt: row.reconciled_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getEodReconciliationRow(reconciliationId: string) {
    const result = await this.query<EodReconciliationRow>(
      `SELECT TOP (1)
        [id],
        [reconciliation_no],
        [shift_id],
        [shift_no],
        [cashier_code],
        [expected_cash_amount],
        [declared_cash_amount],
        [variance_amount],
        [net_sales_amount],
        [cash_tendered_amount],
        [non_cash_tendered_amount],
        [transaction_count],
        [operator_name],
        [note],
        [synced_at],
        [reconciled_at],
        [updated_at]
       FROM [dbo].[eod_reconciliation]
       WHERE [id] = @reconciliationId`,
      { reconciliationId },
    );

    return result.recordset[0] ?? null;
  }

  private async getRecentBankingDepositSummaries() {
    const result = await this.query<BankingDepositRow>(
      `SELECT TOP (30)
        [id],
        [deposit_no],
        [reconciliation_id],
        [reconciliation_no],
        [shift_id],
        [shift_no],
        [amount],
        [bank_account_id],
        [bank_code],
        [bank_name],
        [bank_branch_code],
        [bank_branch_name],
        [bank_account_number],
        [bank_account_name],
        [reference],
        [note],
        [operator_name],
        [synced_at],
        [deposited_at],
        [updated_at]
       FROM [dbo].[banking_deposit]
       ORDER BY [deposited_at] DESC`,
    );

    return result.recordset.map<StoreBankingDepositSummary>((row) => ({
      depositId: row.id,
      depositNo: row.deposit_no,
      reconciliationId: row.reconciliation_id,
      reconciliationNo: row.reconciliation_no,
      shiftId: row.shift_id,
      shiftNo: row.shift_no,
      amount: Number(asNumber(row.amount).toFixed(2)),
      bankName: row.bank_name,
      reference: row.reference,
      operatorName: row.operator_name,
      note: row.note,
      syncedAt: row.synced_at,
      depositedAt: row.deposited_at,
      updatedAt: row.updated_at,
    }));
  }

  private async requireActiveBasket() {
    const basketId = await this.getActiveBasketId();

    if (!basketId) {
      throw new Error("Flash ERP does not have an active basket yet.");
    }

    const basket = await this.getBasketHeader(basketId);

    if (!basket || basket.status !== "PARKED") {
      await this.deleteMetadata(this.getActiveBasketMetadataKey());
      throw new Error("Flash ERP does not have an active basket yet.");
    }

    return basket;
  }

  private async ensureActiveBasket(
    timestamp: string,
    transactionType: SyncPosTransactionType = "SALE",
    sourceTransaction?: {
      id: string;
      transactionNo: string;
      customerId?: string | null;
    } | null,
  ) {
    const existingBasketId = await this.getActiveBasketId();

    if (existingBasketId) {
      const existingBasket = await this.getBasketHeader(existingBasketId);

      if (existingBasket && existingBasket.status === "PARKED") {
        return existingBasket;
      }

      await this.deleteMetadata(this.getActiveBasketMetadataKey());
    }

    const shift = await this.getOpenShiftRow();

    if (!shift) {
      throw new Error("Open a cashier shift before starting a POS basket.");
    }

    const transactionId = randomUUID();
    const transactionNo = await this.nextPosTransactionNumber();

    await this.query(
      `INSERT INTO [dbo].[pos_transaction] (
        [id],
        [transaction_no],
        [shift_id],
        [cashier_code],
        [customer_id],
        [source_transaction_id],
        [source_transaction_no],
        [transaction_type],
        [status],
        [subtotal_amount],
        [discount_amount],
        [loyalty_redemption_points],
        [loyalty_redemption_amount],
        [tax_amount],
        [total_amount],
        [paid_amount],
        [change_amount],
        [notes],
        [completed_at],
        [record_version],
        [deleted_at],
        [updated_at]
      ) VALUES (
        @transactionId,
        @transactionNo,
        @shiftId,
        @cashierCode,
        @customerId,
        @sourceTransactionId,
        @sourceTransactionNo,
        @transactionType,
        N'PARKED',
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        @notes,
        NULL,
        1,
        NULL,
        @timestamp
      )`,
      {
        transactionId,
        transactionNo,
        shiftId: shift.id,
        cashierCode: shift.cashier_code,
        customerId: sourceTransaction?.customerId ?? null,
        sourceTransactionId: sourceTransaction?.id ?? null,
        sourceTransactionNo: sourceTransaction?.transactionNo ?? null,
        transactionType,
        notes:
          transactionType === "RETURN"
            ? sourceTransaction
              ? `Receipt-linked return basket in progress from ${sourceTransaction.transactionNo}.`
              : "Local return basket in progress on the Flash ERP return lane."
            : transactionType === "EXCHANGE"
              ? sourceTransaction
                ? `Receipt-linked exchange basket in progress from ${sourceTransaction.transactionNo}.`
                : "Local exchange basket in progress on the Flash ERP exchange lane."
              : "Local basket in progress on the Flash ERP sell lane.",
        timestamp,
      },
    );
    await this.setMetadata(this.getActiveBasketMetadataKey(), transactionId);

    const basket = await this.getBasketHeader(transactionId);

    if (!basket) {
      throw new Error("Flash ERP could not create the active POS basket.");
    }

    return basket;
  }

  private async refreshBasketTotals(transactionId: string, updatedAt: string) {
    const header = await this.getBasketHeader(transactionId);
    const transactionType = header?.transaction_type ?? "SALE";
    const lines = await this.getBasketLines(transactionId);
    const subtotalAmount = Number(
      lines
        .reduce(
          (sum, line) =>
            sum +
            (asNumber(line.line_total) - asNumber(line.tax_amount)) *
              getLineDirection(transactionType, line.line_intent),
          0,
        )
        .toFixed(2),
    );
    const discountAmount = Number(
      lines
        .reduce(
          (sum, line) =>
            sum +
            asNumber(line.discount_amount) *
              getLineDirection(transactionType, line.line_intent),
          0,
        )
        .toFixed(2),
    );
    const taxAmount = Number(
      lines
        .reduce(
          (sum, line) =>
            sum +
            asNumber(line.tax_amount) *
              getLineDirection(transactionType, line.line_intent),
          0,
        )
        .toFixed(2),
    );
    const grossTotalAmount = Number((subtotalAmount + taxAmount).toFixed(2));

    await this.query(
      `UPDATE [dbo].[pos_transaction]
       SET [subtotal_amount] = @subtotalAmount,
           [discount_amount] = @discountAmount,
           [loyalty_redemption_points] = 0,
           [loyalty_redemption_amount] = 0,
           [tax_amount] = @taxAmount,
           [total_amount] = @totalAmount,
           [updated_at] = @updatedAt,
           [record_version] = [record_version] + 1
       WHERE [id] = @transactionId`,
      {
        subtotalAmount,
        discountAmount,
        taxAmount,
        totalAmount: grossTotalAmount,
        updatedAt,
        transactionId,
      },
    );
  }

  async getSyncSnapshot(): Promise<StoreSyncSnapshot> {
    const metadata = await this.metadata();
    const [
      upstreamQueued,
      upstreamInFlight,
      downstreamQueued,
      deadLetter,
      catalogItems,
      connectedTerminals,
      completedSales,
      parkedSales,
      openShiftCount,
      openSalesOrders,
      openPurchaseOrders,
      openInterStoreTransfers,
      recentCloseouts,
      recentBankingDeposits,
      bankedAmount,
      barcodeLinks,
      availableUnits,
      openRecoveryTasks,
    ] = await Promise.all([
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[sync_outbox] WHERE [status] IN (N'PENDING', N'FAILED')",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[sync_outbox] WHERE [status] = N'IN_FLIGHT'",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[sync_inbox] WHERE [status] IN (N'RECEIVED', N'PENDING', N'FAILED') AND [acknowledged_at] IS NULL",
      ),
      this.countScalar(
        `SELECT
           (SELECT COUNT(*) FROM [dbo].[sync_outbox] WHERE [status] = N'DEAD_LETTER') +
           (SELECT COUNT(*) FROM [dbo].[sync_inbox] WHERE [status] = N'DEAD_LETTER') AS [value]`,
      ),
      this.countScalar("SELECT COUNT(*) AS [value] FROM [dbo].[product_snapshot]"),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[terminal_connection] WHERE [last_seen_at] >= @onlineSince",
        { onlineSince: new Date(Date.now() - 5 * 60_000).toISOString() },
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[pos_transaction] WHERE [status] = N'COMPLETED'",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[pos_transaction] WHERE [status] = N'PARKED'",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[pos_shift] WHERE [status] = N'OPEN'",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[sales_order] WHERE [status] = N'OPEN'",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[purchase_order_snapshot] WHERE [status] IN (N'COMMITTED', N'PART_RECEIVED')",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[inter_store_transfer_snapshot] WHERE [status] IN (N'REQUESTED', N'PART_ISSUED', N'ISSUED', N'PART_RECEIVED')",
      ),
      this.countScalar("SELECT COUNT(*) AS [value] FROM [dbo].[eod_reconciliation]"),
      this.countScalar("SELECT COUNT(*) AS [value] FROM [dbo].[banking_deposit]"),
      this.countScalar("SELECT ISNULL(SUM([amount]), 0) AS [value] FROM [dbo].[banking_deposit]"),
      this.countScalar("SELECT COUNT(*) AS [value] FROM [dbo].[barcode_snapshot]"),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[serial_registry] WHERE [status] = N'AVAILABLE'",
      ),
      this.countScalar(
        "SELECT COUNT(*) AS [value] FROM [dbo].[sync_recovery_task] WHERE [status] <> N'COMPLETED'",
      ),
    ]);
    const lastRunResult = await this.query<{
      id: string;
      run_kind: string;
      result: string;
      summary: string;
      upstream_processed: number;
      downstream_applied: number;
      started_at: string;
      finished_at: string | null;
    }>(
      `SELECT TOP (10) [id], [run_kind], [result], [summary], [upstream_processed],
        [downstream_applied], [started_at], [finished_at]
       FROM [dbo].[sync_run_log]
       ORDER BY [started_at] DESC`,
    );
    const recentRuns = lastRunResult.recordset.map<StoreSyncRun>((run) => ({
      id: run.id,
      runKind: run.run_kind,
      result: run.result,
      summary: run.summary,
      upstreamProcessed: asNumber(run.upstream_processed),
      downstreamApplied: asNumber(run.downstream_applied),
      startedAt: run.started_at,
      finishedAt: run.finished_at,
    }));
    const [
      activeOperatorSession,
      activeBasket,
      recentTransactions,
      activeShiftRow,
      openShiftRows,
      recentClosedShiftRows,
      recentStoreShiftRows,
      salesOrders,
      recentCustomerAccountEntries,
      storeUsers,
      availableTenderMethods,
      availableBankAccounts,
      inventoryLocations,
      transferRequestTargets,
      recentEodReconciliations,
      recentBankingDepositsList,
    ] = await Promise.all([
      this.getActiveOperatorSessionSummary(),
      this.getActiveBasketSummary(),
      this.getRecentTransactions(),
      this.getOpenShiftRow(),
      this.getShiftRows("WHERE [status] = N'OPEN'"),
      this.getShiftRows("WHERE [status] = N'CLOSED'"),
      this.getShiftRows(),
      this.getSalesOrderSummaries(),
      this.getRecentCustomerAccountEntries(),
      this.listStoreUsers(),
      this.listActiveTenderMethods(),
      this.listActiveBankAccounts(),
      this.getInventoryLocationSummaries(),
      this.getTransferRequestTargetSummaries(),
      this.getRecentEodReconciliationSummaries(),
      this.getRecentBankingDepositSummaries(),
    ]);
    const parkedBaskets = await this.getParkedBasketSummaries(
      activeBasket?.transactionId ?? null,
    );
    const [activeShift, openShifts, recentClosedShifts, recentStoreShifts] =
      await Promise.all([
        activeShiftRow ? this.toShiftSummary(activeShiftRow) : Promise.resolve(null),
        Promise.all(openShiftRows.map((shift) => this.toShiftSummary(shift))),
        Promise.all(
          recentClosedShiftRows.map((shift) => this.toShiftSummary(shift)),
        ),
        Promise.all(
          recentStoreShiftRows.map((shift) => this.toShiftSummary(shift)),
        ),
      ]);
    const queueMetrics: StoreQueueMetrics = {
      upstreamQueued,
      upstreamInFlight,
      downstreamQueued,
      deadLetter,
    };
    const operationsMetrics: StoreOperationsMetrics = {
      completedSales,
      parkedSales,
      openShifts: openShiftCount,
      connectedTerminals,
      openSalesOrders,
      catalogItems,
      barcodeLinks,
      availableUnits,
      openPurchaseOrders,
      openInterStoreTransfers,
      openStockCountSessions: 0,
      recentCloseouts,
      recentBankingDeposits,
      bankedAmount,
      pendingBankingAmount: 0,
      openRecoveryTasks,
    };
    const health: StoreSyncHealth =
      deadLetter > 0 || upstreamQueued > 10 || downstreamQueued > 10
        ? "attention"
        : upstreamQueued > 0 || downstreamQueued > 0
          ? "lagging"
          : "healthy";
    const syncPolicy = readStoreSyncPolicyFromMetadata(metadata);

    return {
      deploymentMode: this.deploymentMode,
      standaloneBootstrapAvailable: false,
      retailOrgName: metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
      companyLogoUrl: this.resolveStoreLogoUrl(metadata),
      loginBackgroundImageUrl: this.resolveEnterpriseMediaUrl(
        metadata.login_background_image_url,
      ),
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      storeName: metadata.store_name ?? defaultStoreConfig.storeName,
      storeGroupCode: metadata.store_group_code ?? null,
      storeGroupName: metadata.store_group_name ?? null,
      storeGroupType: metadata.store_group_type ?? null,
      storeLicenseStatus: metadata.store_license_status ?? "LICENSED",
      storeLicenseKey: metadata.store_license_key ?? null,
      storeLicensedUntil: metadata.store_licensed_until ?? null,
      terminalLicenseStatus: metadata.terminal_license_status ?? "LICENSED",
      terminalLicenseKey: metadata.terminal_license_key ?? null,
      terminalLicensedUntil: metadata.terminal_licensed_until ?? null,
      touchModeEnabled: metadata.touch_mode_enabled !== "0",
      catalogPolicy: null,
      terminalCode: this.getTerminalCode(),
      nodeCode: metadata.node_code ?? defaultStoreConfig.nodeCode,
      enterpriseBaseUrl: this.syncBaseUrl,
      databasePath: this.databasePath,
      offlineReady: true,
      health,
      lastLocalWriteAt: metadata.last_local_write_at ?? null,
      lastSyncAt: metadata.last_sync_at ?? null,
      lastEnterpriseAckAt: metadata.last_enterprise_ack_at ?? null,
      syncPolicy,
      queueMetrics,
      operationsMetrics,
      recentRuns,
      syncDeadLetters: [],
      recentSyncEvents: [],
      connectedTerminals: [],
      recentTransactions,
      activeShift,
      openShifts,
      recentClosedShifts,
      recentStoreShifts,
      activeOperatorSession,
      recoveryTasks: [],
      activeBasket,
      parkedBaskets,
      salesOrders,
      recentEodReconciliations,
      recentBankingDeposits: recentBankingDepositsList,
      inventoryLocations,
      transferRequestTargets,
      transferRequestDrafts: [],
      stockCountSessions: [],
      recentGoodsReceipts: [],
      recentSupplierReturns: [],
      recentCustomerAccountEntries,
      storeUsers,
      productDepartments: [],
      productCategories: [],
      availableTenderMethods,
      availableBankAccounts,
      availableSuppliers: [],
      priceListEntries: [],
      promotions: [],
      passwordPolicy: {} as StoreSyncSnapshot["passwordPolicy"],
      optionSettings: {
        shiftFloatPromptAmount: Number(
          Math.max(0, asNumber(metadata.shift_float_prompt_amount)).toFixed(2),
        ),
        showCriticalStocksOnStartup:
          metadata.show_critical_stocks_on_startup === "1",
        productSizes: readProductSizesMetadata(metadata.product_sizes_json),
        posDiscountRates: readPosDiscountRatesMetadata(metadata.pos_discount_rates_json),
      },
      loyaltySettings: {} as StoreSyncSnapshot["loyaltySettings"],
      receiptSettings: {} as StoreSyncSnapshot["receiptSettings"],
      receiptPrinterSettings: this.getReceiptPrinterSettingsSummary(metadata),
      activityFeed: [],
      generatedAt: isoNow(),
    };
  }

  private async recordSyncSchedule(
    trigger: StoreNodeSyncTrigger,
    timestamp: string,
    failed: boolean,
  ) {
    const metadata = await this.metadata();
    const currentPolicy = readStoreSyncPolicyFromMetadata(metadata);
    const failureCount = failed
      ? Math.trunc(asNumber(metadata.sync_failure_count)) + 1
      : 0;
    const nextPolicy = {
      ...currentPolicy,
      lastManualSyncAt:
        trigger === "manual" || trigger === "tray"
          ? timestamp
          : currentPolicy.lastManualSyncAt,
      lastAutoSyncAt:
        trigger === "scheduled" ? timestamp : currentPolicy.lastAutoSyncAt,
      nextScheduledSyncAt: currentPolicy.autoSyncEnabled
        ? computeNextStoreSyncAt({
            policy: currentPolicy,
            baseAt: timestamp,
            failureCount,
          })
        : null,
    };

    for (const [key, value] of storeSyncPolicyToMetadataEntries(nextPolicy)) {
      if (value) {
        await this.setMetadata(key, value);
      } else {
        await this.deleteMetadata(key);
      }
    }

    await this.setMetadata("sync_failure_count", String(failureCount));
  }

  async getSyncStatusSnapshot(): Promise<StoreSyncSnapshot> {
    return this.getSyncSnapshot();
  }

  async runSyncCycle(input?: StoreSyncRunOptions): Promise<StoreSyncActionResult> {
    const startedAt = isoNow();
    const trigger =
      input?.trigger === "scheduled"
        ? "scheduled"
        : input?.trigger === "tray"
          ? "tray"
          : input?.trigger === "startup"
            ? "startup"
            : "manual";

    if (this.deploymentMode === "STANDALONE") {
      const finishedAt = isoNow();
      await this.recordSyncSchedule(trigger, finishedAt, false);
      await this.insertRunLog({
        runKind: "SYNC_CYCLE",
        result: "IDLE",
        summary:
          "Standalone mode is active; no HQ sync was required for this SQL Server store node.",
        upstreamProcessed: 0,
        downstreamApplied: 0,
        startedAt,
        finishedAt,
      });

      return {
        message:
          "Standalone mode is active. No HQ sync is required; local store data is ready.",
        snapshot: await this.getSyncSnapshot(),
      };
    }

    if (!this.syncBaseUrl) {
      const finishedAt = isoNow();
      const message =
        "HQ Managed mode is selected, but no HQ sync URL is configured. Open Desktop setup, enter the HQ sync URL, save, and restart before running upload/download sync.";

      await this.recordSyncSchedule(trigger, finishedAt, true);
      await this.insertRunLog({
        runKind: "SYNC_CYCLE",
        result: "WARNING",
        summary: message,
        upstreamProcessed: 0,
        downstreamApplied: 0,
        startedAt,
        finishedAt,
      });
      throw new Error(message);
    }

    if (this.syncCycleInFlight) {
      return {
        message:
          "A store sync is already running. Flash ERP is keeping that existing sync cycle active instead of starting a second one.",
        snapshot: await this.getSyncSnapshot(),
      };
    }

    const syncCycle = this.runRemoteSyncCycle(
      startedAt,
      trigger,
      input?.drainDownstream === true,
    );
    this.syncCycleInFlight = syncCycle;

    try {
      return await syncCycle;
    } catch (error) {
      const finishedAt = isoNow();
      const message =
        error instanceof Error
          ? error.message
          : "The enterprise sync cycle was unavailable, so local queues were preserved.";
      const actionMessage =
        error instanceof StoreSyncTransportError
          ? `${message} Flash ERP kept every SQL Server store queue item intact.`
          : "Enterprise sync was unavailable. Flash ERP kept every SQL Server store queue item intact.";

      await this.recordSyncSchedule(trigger, finishedAt, true);
      await this.insertRunLog({
        runKind: "SYNC_CYCLE",
        result: "WARNING",
        summary: `The enterprise sync cycle could not complete: ${message}`,
        upstreamProcessed: 0,
        downstreamApplied: 0,
        startedAt,
        finishedAt,
      });

      return {
        message: actionMessage,
        snapshot: await this.getSyncSnapshot(),
      };
    } finally {
      if (this.syncCycleInFlight === syncCycle) {
        this.syncCycleInFlight = null;
      }
    }
  }

  private async getInventoryLocationSummaries(): Promise<
    StoreInventoryLocationSummary[]
  > {
    const result = await this.query<InventoryLocationSummaryRow>(
      `SELECT
        location.[location_code],
        location.[location_name],
        location.[location_type],
        location.[status],
        location.[defaults],
        location.[is_sales_default],
        location.[is_sales_order_default],
        location.[is_receiving_default],
        location.[updated_at],
        COUNT(CASE WHEN COALESCE(balance.[quantity_on_hand], 0) <> 0 THEN 1 END) AS [tracked_products],
        COALESCE(SUM(balance.[quantity_on_hand]), 0) AS [on_hand_quantity],
        SUM(CASE WHEN COALESCE(balance.[quantity_on_hand], 0) < 0 THEN 1 ELSE 0 END) AS [negative_positions]
       FROM [dbo].[inventory_location_snapshot] AS location
       LEFT JOIN [dbo].[inventory_location_balance] AS balance
         ON balance.[location_code] = location.[location_code]
       GROUP BY
        location.[location_code],
        location.[location_name],
        location.[location_type],
        location.[status],
        location.[defaults],
        location.[is_sales_default],
        location.[is_sales_order_default],
        location.[is_receiving_default],
        location.[updated_at]
       ORDER BY
        location.[is_sales_default] DESC,
        location.[is_sales_order_default] DESC,
        location.[is_receiving_default] DESC,
        location.[location_name] ASC`,
    );
    const highlightResult = await this.query<InventoryLocationHighlightRow>(
      `SELECT
        [location_code],
        [product_code],
        [quantity_on_hand]
       FROM [dbo].[inventory_location_balance]
       WHERE [quantity_on_hand] <> 0
       ORDER BY ABS([quantity_on_hand]) DESC, [product_code] ASC`,
    );
    const highlightsByLocation = new Map<string, string[]>();

    for (const row of highlightResult.recordset) {
      const items = highlightsByLocation.get(row.location_code) ?? [];

      if (items.length >= 3) {
        continue;
      }

      items.push(
        `${row.product_code} (${Number(asNumber(row.quantity_on_hand).toFixed(3))})`,
      );
      highlightsByLocation.set(row.location_code, items);
    }

    return result.recordset.map<StoreInventoryLocationSummary>((row) => ({
      locationCode: row.location_code,
      locationName: row.location_name,
      locationType: row.location_type,
      status: row.status,
      defaults: formatMssqlLocationDefaults(row),
      trackedProducts: asNumber(row.tracked_products),
      onHandQuantity: Number(asNumber(row.on_hand_quantity).toFixed(3)),
      negativePositions: asNumber(row.negative_positions),
      highlightedProducts: highlightsByLocation.get(row.location_code) ?? [],
      updatedAt: row.updated_at,
    }));
  }

  private async getDefaultSalesLocationCode() {
    const result = await this.query<{ location_code: string }>(
      `SELECT TOP (1) [location_code]
       FROM [dbo].[inventory_location_snapshot]
       WHERE [status] = N'ACTIVE'
       ORDER BY
         CASE
           WHEN [is_sales_default] = 1 THEN 0
           WHEN [is_receiving_default] = 1 THEN 1
           ELSE 2
         END,
         [location_name] ASC`,
    );

    return result.recordset[0]?.location_code ?? null;
  }

  private async getDefaultSalesOrderLocationCode() {
    const result = await this.query<{ location_code: string }>(
      `SELECT TOP (1) [location_code]
       FROM [dbo].[inventory_location_snapshot]
       WHERE [status] = N'ACTIVE'
       ORDER BY
         CASE
           WHEN [is_sales_order_default] = 1 THEN 0
           WHEN [is_sales_default] = 1 THEN 1
           WHEN [is_receiving_default] = 1 THEN 2
           ELSE 3
         END,
         [location_name] ASC`,
    );

    return result.recordset[0]?.location_code ?? null;
  }

  private async getDefaultReceivingLocationCode() {
    const result = await this.query<{ location_code: string }>(
      `SELECT TOP (1) [location_code]
       FROM [dbo].[inventory_location_snapshot]
       WHERE [status] = N'ACTIVE'
       ORDER BY
         CASE
           WHEN [is_receiving_default] = 1 THEN 0
           WHEN [is_sales_default] = 1 THEN 1
           ELSE 2
         END,
         [location_name] ASC`,
    );

    return result.recordset[0]?.location_code ?? null;
  }

  private async getOptionalLocationQuantity(
    locationCode: string,
    productCode: string,
  ) {
    const result = await this.query<{ quantity_on_hand: string | number }>(
      `SELECT TOP (1) [quantity_on_hand]
       FROM [dbo].[inventory_location_balance]
       WHERE [location_code] = @locationCode
         AND [product_code] = @productCode`,
      { locationCode, productCode },
    );

    const value = result.recordset[0]?.quantity_on_hand;
    return value === undefined ? null : asNumber(value);
  }

  private async getLocationQuantity(
    locationCode: string,
    productCode: string,
    runner: MssqlRunner = this.pool,
  ) {
    const result = await this.query<{ value: string | number }>(
      `SELECT TOP (1) [quantity_on_hand] AS [value]
       FROM [dbo].[inventory_location_balance]
       WHERE [location_code] = @locationCode
         AND [product_code] = @productCode`,
      { locationCode, productCode },
      runner,
    );

    return Number(asNumber(result.recordset[0]?.value).toFixed(3));
  }

  private async hasLocationBalance(
    locationCode: string,
    productCode: string,
    runner: MssqlRunner = this.pool,
  ) {
    const result = await this.query<{ value: string | number }>(
      `SELECT COUNT(*) AS [value]
       FROM [dbo].[inventory_location_balance]
       WHERE [location_code] = @locationCode
         AND [product_code] = @productCode`,
      { locationCode, productCode },
      runner,
    );

    return Math.trunc(asNumber(result.recordset[0]?.value)) > 0;
  }

  private async setLocationBalanceQuantity(input: {
    locationCode: string;
    productCode: string;
    quantity: number;
    updatedAt: string;
    runner?: MssqlRunner;
  }) {
    await this.query(
      `MERGE [dbo].[inventory_location_balance] AS target
       USING (
        SELECT
          @locationCode AS [location_code],
          @productCode AS [product_code],
          @quantity AS [quantity_on_hand],
          @updatedAt AS [updated_at]
       ) AS source
       ON target.[location_code] = source.[location_code]
        AND target.[product_code] = source.[product_code]
       WHEN MATCHED THEN UPDATE SET
        [quantity_on_hand] = source.[quantity_on_hand],
        [updated_at] = source.[updated_at]
       WHEN NOT MATCHED THEN INSERT (
        [location_code], [product_code], [quantity_on_hand], [updated_at]
       ) VALUES (
        source.[location_code], source.[product_code], source.[quantity_on_hand], source.[updated_at]
       );`,
      {
        locationCode: input.locationCode,
        productCode: input.productCode,
        quantity: Number(Number(input.quantity).toFixed(3)),
        updatedAt: input.updatedAt,
      },
      input.runner ?? this.pool,
    );
  }

  private async applyLocationBalanceDelta(input: {
    locationCode: string;
    productCode: string;
    delta: number;
    updatedAt: string;
    runner?: MssqlRunner;
  }) {
    const runner = input.runner ?? this.pool;
    const nextQuantity = Number(
      (
        (await this.getLocationQuantity(
          input.locationCode,
          input.productCode,
          runner,
        )) + input.delta
      ).toFixed(3),
    );

    await this.setLocationBalanceQuantity({
      locationCode: input.locationCode,
      productCode: input.productCode,
      quantity: nextQuantity,
      updatedAt: input.updatedAt,
      runner,
    });
  }

  private async getSerialRegistryEntry(
    productCode: string,
    serialNumber: string,
    runner: MssqlRunner = this.pool,
  ) {
    const result = await this.query<SerialRegistryRow>(
      `SELECT TOP (1)
        [id],
        [product_code],
        [serial_number],
        [inventory_location_code],
        [status],
        [source_transaction_id],
        [source_transaction_no],
        [updated_at]
       FROM [dbo].[serial_registry]
       WHERE [product_code] = @productCode
         AND UPPER([serial_number]) = UPPER(@serialNumber)`,
      { productCode, serialNumber },
      runner,
    );

    return result.recordset[0] ?? null;
  }

  private async upsertSerialRegistryEntry(input: {
    productCode: string;
    serialNumber: string;
    inventoryLocationCode: string | null;
    status: StoreSerialRegistryStatus;
    sourceTransactionId: string | null;
    sourceTransactionNo: string | null;
    updatedAt: string;
    runner?: MssqlRunner;
  }) {
    await this.query(
      `MERGE [dbo].[serial_registry] AS target
       USING (
        SELECT
          @productCode AS [product_code],
          @serialNumber AS [serial_number],
          @inventoryLocationCode AS [inventory_location_code],
          @status AS [status],
          @sourceTransactionId AS [source_transaction_id],
          @sourceTransactionNo AS [source_transaction_no],
          @updatedAt AS [updated_at]
       ) AS source
       ON target.[product_code] = source.[product_code]
        AND target.[serial_number] = source.[serial_number]
       WHEN MATCHED THEN UPDATE SET
        [inventory_location_code] = source.[inventory_location_code],
        [status] = source.[status],
        [source_transaction_id] = source.[source_transaction_id],
        [source_transaction_no] = source.[source_transaction_no],
        [updated_at] = source.[updated_at]
       WHEN NOT MATCHED THEN INSERT (
        [id], [product_code], [serial_number], [inventory_location_code],
        [status], [source_transaction_id], [source_transaction_no], [updated_at]
       ) VALUES (
        @id, source.[product_code], source.[serial_number], source.[inventory_location_code],
        source.[status], source.[source_transaction_id], source.[source_transaction_no], source.[updated_at]
       );`,
      {
        id: randomUUID(),
        productCode: input.productCode,
        serialNumber: input.serialNumber,
        inventoryLocationCode: input.inventoryLocationCode,
        status: input.status,
        sourceTransactionId: input.sourceTransactionId,
        sourceTransactionNo: input.sourceTransactionNo,
        updatedAt: input.updatedAt,
      },
      input.runner ?? this.pool,
    );
  }

  private async listAvailableRegistrySerialNumbers(
    productCode: string,
    locationCode: string,
    runner: MssqlRunner = this.pool,
  ) {
    const result = await this.query<{ serial_number: string }>(
      `SELECT [serial_number]
       FROM [dbo].[serial_registry]
       WHERE [product_code] = @productCode
         AND [inventory_location_code] = @locationCode
         AND [status] = N'AVAILABLE'
       ORDER BY [serial_number] ASC`,
      { productCode, locationCode },
      runner,
    );

    return result.recordset.map((row) => row.serial_number);
  }

  private async ensureInventoryTaskSerialNumbersNotReserved(
    productCode: string,
    productName: string,
    serialNumbers: string[],
    runner: MssqlRunner = this.pool,
  ) {
    if (serialNumbers.length === 0) {
      return;
    }

    const result = await this.query<{
      serial_number: string;
      status: StoreSerialRegistryStatus;
    }>(
      `SELECT [serial_number], [status]
       FROM [dbo].[serial_registry]
       WHERE [product_code] = @productCode
         AND UPPER([serial_number]) IN (${serialNumbers
           .map((_, index) => `@serialNumber${index}`)
           .join(", ")})
         AND [status] = N'IN_TRANSIT'`,
      {
        productCode,
        ...Object.fromEntries(
          serialNumbers.map((serialNumber, index) => [
            `serialNumber${index}`,
            serialNumber.toUpperCase(),
          ]),
        ),
      },
      runner,
    );

    if (result.recordset.length > 0) {
      throw new Error(
        `Flash ERP cannot use serial number(s) ${result.recordset.map((row) => row.serial_number).join(", ")} for ${productName} because they are already reserved in another local inventory task.`,
      );
    }
  }

  private async applyInventoryTaskSerialRegistryChange(input: {
    productCode: string;
    serialNumbers: string[];
    inventoryLocationCode: string | null;
    status: StoreSerialRegistryStatus;
    sourceReferenceId: string;
    sourceReferenceLabel: string;
    updatedAt: string;
    runner?: MssqlRunner;
  }) {
    const runner = input.runner ?? this.pool;

    for (const serialNumber of input.serialNumbers) {
      await this.upsertSerialRegistryEntry({
        productCode: input.productCode,
        serialNumber,
        inventoryLocationCode: input.inventoryLocationCode,
        status: input.status,
        sourceTransactionId: input.sourceReferenceId,
        sourceTransactionNo: input.sourceReferenceLabel,
        updatedAt: input.updatedAt,
        runner,
      });
    }
  }

  private async applyLocalCountVariance(input: {
    referenceId: string;
    referenceLabel: string;
    productCode: string;
    locationCode: string;
    countedQuantity: number;
    countedSerialNumbers: string[];
    updatedAt: string;
    runner?: MssqlRunner;
  }) {
    const runner = input.runner ?? this.pool;
    const product = await this.findCatalogLookup(input.productCode);

    if (!product) {
      throw new Error(
        `Flash ERP could not find local product "${input.productCode}" while committing the count session.`,
      );
    }

    const previousLocationQuantity = await this.getLocationQuantity(
      input.locationCode,
      input.productCode,
      runner,
    );
    const countedQuantity = asBooleanFlag(product.is_serialized)
      ? input.countedSerialNumbers.length
      : Number(Number(input.countedQuantity).toFixed(3));
    const varianceQuantity = Number(
      (countedQuantity - previousLocationQuantity).toFixed(3),
    );

    if (asBooleanFlag(product.is_serialized)) {
      const currentSerialNumbers =
        await this.listAvailableRegistrySerialNumbers(
          input.productCode,
          input.locationCode,
          runner,
        );
      const countedKeys = new Set(
        input.countedSerialNumbers.map((serialNumber) =>
          serialNumber.toUpperCase(),
        ),
      );
      const currentKeys = new Set(
        currentSerialNumbers.map((serialNumber) => serialNumber.toUpperCase()),
      );
      const serialNumbersToRemove = currentSerialNumbers.filter(
        (serialNumber) => !countedKeys.has(serialNumber.toUpperCase()),
      );
      const serialNumbersToAdd = input.countedSerialNumbers.filter(
        (serialNumber) => !currentKeys.has(serialNumber.toUpperCase()),
      );

      await this.applyInventoryTaskSerialRegistryChange({
        productCode: input.productCode,
        serialNumbers: serialNumbersToRemove,
        inventoryLocationCode: input.locationCode,
        status: "ADJUSTED_OUT",
        sourceReferenceId: input.referenceId,
        sourceReferenceLabel: input.referenceLabel,
        updatedAt: input.updatedAt,
        runner,
      });
      await this.applyInventoryTaskSerialRegistryChange({
        productCode: input.productCode,
        serialNumbers: serialNumbersToAdd,
        inventoryLocationCode: input.locationCode,
        status: "AVAILABLE",
        sourceReferenceId: input.referenceId,
        sourceReferenceLabel: input.referenceLabel,
        updatedAt: input.updatedAt,
        runner,
      });
    }

    await this.query(
      `UPDATE [dbo].[product_snapshot]
       SET [quantity_on_hand] = [quantity_on_hand] + @varianceQuantity,
           [updated_at] = @updatedAt
       WHERE [id] = @productId`,
      {
        varianceQuantity,
        updatedAt: input.updatedAt,
        productId: product.id,
      },
      runner,
    );
    await this.setLocationBalanceQuantity({
      locationCode: input.locationCode,
      productCode: input.productCode,
      quantity: countedQuantity,
      updatedAt: input.updatedAt,
      runner,
    });

    return {
      countedQuantity,
      countedSerialNumbers: input.countedSerialNumbers,
      varianceQuantity,
    };
  }

  private async getRepresentativeBarcode(productCode: string) {
    const result = await this.query<{
      barcode_code: string;
      barcode_type: string;
    }>(
      `SELECT TOP (1) [barcode_code], [barcode_type]
       FROM [dbo].[barcode_snapshot]
       WHERE [product_code] = @productCode
       ORDER BY
         CASE [barcode_type]
           WHEN N'EAN13' THEN 0
           WHEN N'UPC' THEN 1
           ELSE 2
         END,
         [barcode_code] ASC`,
      { productCode },
    );

    return result.recordset[0] ?? null;
  }

  private async getRepresentativeBarcodeMap(productCodes: string[]) {
    const uniqueProductCodes = [...new Set(productCodes.filter(Boolean))];
    const barcodeMap = new Map<string, string>();

    for (const productCode of uniqueProductCodes) {
      const barcode = await this.getRepresentativeBarcode(productCode);
      if (barcode?.barcode_code) {
        barcodeMap.set(productCode, barcode.barcode_code);
      }
    }

    return barcodeMap;
  }

  private async listAvailableSaleSerialNumbers(
    productCode: string,
    locationCode: string | null,
  ) {
    const result = await this.query<{ serial_number: string }>(
      `SELECT [serial_number]
       FROM [dbo].[serial_registry]
       WHERE [product_code] = @productCode
         AND [status] = N'AVAILABLE'
         AND (@locationCode IS NULL OR [inventory_location_code] = @locationCode OR [inventory_location_code] IS NULL)
       ORDER BY [serial_number] ASC`,
      { productCode, locationCode },
    );

    return result.recordset.map((row) => row.serial_number);
  }

  private async findCatalogLookup(query: string) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return null;
    }

    const normalizedVariantLookup = normalizedQuery.toUpperCase();
    const variantMatch = await this.query<CatalogLookupRow>(
      `SELECT TOP (1)
        product.[id],
        product.[product_code],
        product.[product_name],
        product.[product_type],
        product.[short_name],
        product.[description],
        product.[primary_image_url],
        product.[department_code],
        product.[category_code],
        product.[subcategory],
        product.[unit_of_measure],
        product.[taxable],
        product.[tax_profile_code],
        product.[tax_profile_name],
        product.[tax_rate_percent],
        product.[tax_inclusive],
        product.[track_inventory],
        product.[is_serialized],
        product.[track_size],
        product.[track_color],
        product.[must_enter_price_at_pos],
        product.[min_stock_level],
        product.[reorder_point],
        product.[safety_stock_level],
        product.[catalog_membership_active],
        product.[catalog_sort_order],
        variant.[unit_price],
        variant.[quantity_on_hand],
        product.[updated_at],
        variant.[barcode] AS [barcode_code],
        CAST(N'MATRIX_VARIANT' AS nvarchar(50)) AS [barcode_type],
        CAST(N'productCode' AS nvarchar(30)) AS [matched_on],
        variant.[variant_code] AS [product_variant_code],
        CAST(NULL AS nvarchar(100)) AS [sales_location_code],
        CAST(NULL AS decimal(18, 3)) AS [sales_location_quantity]
       FROM [dbo].[product_variant_snapshot] AS variant
       INNER JOIN [dbo].[product_snapshot] AS product
         ON product.[product_code] = variant.[product_code]
       WHERE (
           UPPER(variant.[variant_code]) = @variantLookup
           OR UPPER(ISNULL(variant.[sku], N'')) = @variantLookup
           OR variant.[barcode] = @query
         )
         AND variant.[status] = N'ACTIVE'
         AND ISNULL(product.[catalog_membership_active], 1) = 1`,
      { variantLookup: normalizedVariantLookup, query: normalizedQuery },
    );
    const variantRow = variantMatch.recordset[0] ?? null;

    if (variantRow) {
      return variantRow;
    }

    const barcodeMatch = await this.query<CatalogLookupRow>(
      `SELECT TOP (1)
        product.[id],
        product.[product_code],
        product.[product_name],
        product.[product_type],
        product.[short_name],
        product.[description],
        product.[primary_image_url],
        product.[department_code],
        product.[category_code],
        product.[subcategory],
        product.[unit_of_measure],
        product.[taxable],
        product.[tax_profile_code],
        product.[tax_profile_name],
        product.[tax_rate_percent],
        product.[tax_inclusive],
        product.[track_inventory],
        product.[is_serialized],
        product.[track_size],
        product.[track_color],
        product.[must_enter_price_at_pos],
        product.[min_stock_level],
        product.[reorder_point],
        product.[safety_stock_level],
        product.[catalog_membership_active],
        product.[catalog_sort_order],
        product.[unit_price],
        product.[quantity_on_hand],
        product.[updated_at],
        barcode.[barcode_code],
        barcode.[barcode_type],
        CAST(N'barcode' AS nvarchar(30)) AS [matched_on],
        CAST(NULL AS nvarchar(100)) AS [product_variant_code],
        CAST(NULL AS nvarchar(100)) AS [sales_location_code],
        CAST(NULL AS decimal(18, 3)) AS [sales_location_quantity]
       FROM [dbo].[barcode_snapshot] AS barcode
       INNER JOIN [dbo].[product_snapshot] AS product
         ON product.[product_code] = barcode.[product_code]
       WHERE barcode.[barcode_code] = @query
         AND ISNULL(product.[catalog_membership_active], 1) = 1`,
      { query: normalizedQuery },
    );
    const barcodeRow = barcodeMatch.recordset[0] ?? null;

    if (barcodeRow) {
      const salesLocationCode = await this.getDefaultSalesLocationCode();
      return {
        ...barcodeRow,
        matched_on: "barcode" as const,
        sales_location_code: salesLocationCode,
        sales_location_quantity:
          salesLocationCode !== null
            ? await this.getOptionalLocationQuantity(
                salesLocationCode,
                barcodeRow.product_code,
              )
            : null,
      };
    }

    const productMatch = await this.query<ProductRow>(
      `SELECT TOP (1)
        [id],
        [product_code],
        [product_name],
        [product_type],
        [short_name],
        [description],
        [primary_image_url],
        [department_code],
        [category_code],
        [subcategory],
        [unit_of_measure],
        [taxable],
        [tax_profile_code],
        [tax_profile_name],
        [tax_rate_percent],
        [tax_inclusive],
        [track_inventory],
        [is_serialized],
        [track_size],
        [track_color],
        [must_enter_price_at_pos],
        [min_stock_level],
        [reorder_point],
        [safety_stock_level],
        [catalog_membership_active],
        [catalog_sort_order],
        [unit_price],
        [quantity_on_hand],
        [updated_at]
       FROM [dbo].[product_snapshot]
       WHERE [product_code] = @productCode
         AND ISNULL([catalog_membership_active], 1) = 1`,
      { productCode: normalizedQuery.toUpperCase() },
    );
    const productRow = productMatch.recordset[0] ?? null;

    if (!productRow) {
      return null;
    }

    const barcode = await this.getRepresentativeBarcode(productRow.product_code);
    const salesLocationCode = await this.getDefaultSalesLocationCode();

    return {
      ...productRow,
      barcode_code: barcode?.barcode_code ?? null,
      barcode_type: barcode?.barcode_type ?? null,
      matched_on: "productCode" as const,
      product_variant_code: null,
      sales_location_code: salesLocationCode,
      sales_location_quantity:
        salesLocationCode !== null
          ? await this.getOptionalLocationQuantity(
              salesLocationCode,
              productRow.product_code,
            )
          : null,
    };
  }

  private async toCatalogLookupResult(
    match: CatalogLookupRow,
    query: string,
  ): Promise<StoreCatalogLookupResult> {
    const [department, category, availableSerialNumbers] = await Promise.all([
      match.department_code
        ? this.query<{ department_name: string }>(
            `SELECT TOP (1) [department_name]
             FROM [dbo].[product_department_snapshot]
             WHERE [department_code] = @departmentCode`,
            { departmentCode: match.department_code },
          )
        : Promise.resolve({ recordset: [] as Array<{ department_name: string }> }),
      match.category_code
        ? this.query<{ category_name: string }>(
            `SELECT TOP (1) [category_name]
             FROM [dbo].[product_category_snapshot]
             WHERE [category_code] = @categoryCode`,
            { categoryCode: match.category_code },
          )
        : Promise.resolve({ recordset: [] as Array<{ category_name: string }> }),
      asBooleanFlag(match.is_serialized)
        ? this.listAvailableSaleSerialNumbers(
            match.product_code,
            match.sales_location_code,
          )
        : Promise.resolve([] as string[]),
    ]);

    return {
      query,
      matchedOn: match.matched_on,
      productCode: match.product_code,
      productVariantCode: match.product_variant_code,
      productName: match.product_name,
      productType: match.product_type,
      primaryImageUrl: match.primary_image_url,
      departmentCode: match.department_code,
      departmentName: department.recordset[0]?.department_name ?? null,
      categoryCode: match.category_code,
      categoryName: category.recordset[0]?.category_name ?? null,
      subcategory: match.subcategory,
      isSerialized: asBooleanFlag(match.is_serialized),
      trackSize: asBooleanFlag(match.track_size),
      trackColor: asBooleanFlag(match.track_color),
      mustEnterPriceAtPos: asBooleanFlag(match.must_enter_price_at_pos),
      availableSerialNumbers,
      unitPrice: Number(asNumber(match.unit_price).toFixed(2)),
      quantityOnHand: Number(asNumber(match.quantity_on_hand).toFixed(3)),
      barcode: match.barcode_code,
      barcodeType: match.barcode_type,
      salesLocationCode: match.sales_location_code,
      salesLocationQuantity:
        match.sales_location_quantity === null
          ? null
          : Number(asNumber(match.sales_location_quantity).toFixed(3)),
      matrixVariants: await this.getMatrixVariantsForProduct(match.product_code),
    };
  }

  private toCatalogMatrixVariant(
    row: ProductVariantSnapshotRow,
  ): StoreCatalogMatrixVariant {
    return {
      variantCode: row.variant_code,
      sku: row.sku,
      displayName: row.display_name,
      unitPrice: Number(asNumber(row.unit_price).toFixed(2)),
      quantityOnHand: Number(asNumber(row.quantity_on_hand).toFixed(3)),
      barcode: row.barcode,
      status: row.status,
      attributes: readMatrixVariantAttributes(row.attributes_json),
    };
  }

  private async getMatrixVariantsForProduct(productCode: string) {
    const result = await this.query<ProductVariantSnapshotRow>(
      `SELECT [id], [product_code], [variant_code], [sku], [display_name], [unit_price], [quantity_on_hand], [barcode], [status], [attributes_json], [updated_at]
       FROM [dbo].[product_variant_snapshot]
       WHERE [product_code] = @productCode
         AND [status] = N'ACTIVE'
       ORDER BY [variant_code] ASC`,
      { productCode },
    );

    return result.recordset.map((row) => this.toCatalogMatrixVariant(row));
  }

  private async getMatrixVariantByCode(productCode: string, variantCode: string) {
    const result = await this.query<ProductVariantSnapshotRow>(
      `SELECT TOP (1) [id], [product_code], [variant_code], [sku], [display_name], [unit_price], [quantity_on_hand], [barcode], [status], [attributes_json], [updated_at]
       FROM [dbo].[product_variant_snapshot]
       WHERE [product_code] = @productCode
         AND [variant_code] = @variantCode`,
      { productCode, variantCode },
    );

    return result.recordset[0] ?? null;
  }

  async lookupCatalogItem(
    query: string,
  ): Promise<StoreCatalogLookupResult | null> {
    const match = await this.findCatalogLookup(query);
    return match ? this.toCatalogLookupResult(match, query) : null;
  }

  async browseCatalogItems(
    input?: StoreCatalogBrowseRequest,
  ): Promise<StoreCatalogBrowseItem[]> {
    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const normalizedDepartmentCode = normalizeCatalogCode(input?.departmentCode);
    const normalizedCategoryCode = normalizeCatalogCode(input?.categoryCode);
    const serializedOnly = input?.serializedOnly === true;
    const sellableOnly = input?.sellableOnly === true;
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 30);
    const salesLocationCode = await this.getDefaultSalesLocationCode();
    const result = await this.query<
      ProductRow & {
        department_name: string | null;
        category_name: string | null;
        barcode_code: string | null;
        sales_location_quantity: string | number | null;
      }
    >(
      `SELECT TOP (200)
        product.[id],
        product.[product_code],
        product.[product_name],
        product.[product_type],
        product.[short_name],
        product.[description],
        product.[primary_image_url],
        product.[department_code],
        product.[category_code],
        product.[subcategory],
        product.[unit_of_measure],
        product.[taxable],
        product.[tax_profile_code],
        product.[tax_profile_name],
        product.[tax_rate_percent],
        product.[tax_inclusive],
        product.[track_inventory],
        product.[is_serialized],
        product.[track_size],
        product.[track_color],
        product.[must_enter_price_at_pos],
        product.[min_stock_level],
        product.[reorder_point],
        product.[safety_stock_level],
        product.[catalog_membership_active],
        product.[catalog_sort_order],
        product.[unit_price],
        product.[quantity_on_hand],
        product.[updated_at],
        department.[department_name],
        category.[category_name],
        barcode.[barcode_code],
        balance.[quantity_on_hand] AS [sales_location_quantity]
       FROM [dbo].[product_snapshot] AS product
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = product.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = product.[category_code]
       OUTER APPLY (
         SELECT TOP (1) barcodeCandidate.[barcode_code]
         FROM [dbo].[barcode_snapshot] AS barcodeCandidate
         WHERE barcodeCandidate.[product_code] = product.[product_code]
         ORDER BY barcodeCandidate.[barcode_code] ASC
       ) AS barcode
       LEFT JOIN [dbo].[inventory_location_balance] AS balance
         ON balance.[product_code] = product.[product_code]
        AND balance.[location_code] = @salesLocationCode
       WHERE ISNULL(product.[catalog_membership_active], 1) = 1
       ORDER BY ISNULL(product.[catalog_sort_order], 2147483647), product.[product_name] ASC`,
      { salesLocationCode },
    );

    const filteredRows = result.recordset
      .filter((row) => {
        if (
          normalizedDepartmentCode &&
          normalizeCatalogCode(row.department_code) !== normalizedDepartmentCode
        ) {
          return false;
        }

        if (
          normalizedCategoryCode &&
          normalizeCatalogCode(row.category_code) !== normalizedCategoryCode
        ) {
          return false;
        }

        if (serializedOnly && !asBooleanFlag(row.is_serialized)) {
          return false;
        }

        if (sellableOnly && !isServiceProductType(row.product_type)) {
          const sellableQuantity =
            row.sales_location_quantity === null
              ? asNumber(row.quantity_on_hand)
              : asNumber(row.sales_location_quantity);

          if (sellableQuantity <= 0) {
            return false;
          }
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystacks = [
          row.product_code,
          row.product_name,
          row.short_name,
          row.department_code,
          row.department_name,
          row.category_code,
          row.category_name,
          row.subcategory,
          row.barcode_code,
        ];

        return haystacks.some((value) =>
          value?.toUpperCase().includes(normalizedQuery),
        );
      })
      .slice(0, limit);

    return Promise.all(
      filteredRows.map<Promise<StoreCatalogBrowseItem>>(async (row) => {
        const matrixVariants = await this.getMatrixVariantsForProduct(
          row.product_code,
        );
        const isMatrixProduct =
          row.product_type === "MATRIX" && matrixVariants.length > 0;
        const matrixQuantity = isMatrixProduct
          ? matrixVariants.reduce(
              (sum, variant) => sum + variant.quantityOnHand,
              0,
            )
          : null;
        const matrixPrice = isMatrixProduct
          ? Math.min(...matrixVariants.map((variant) => variant.unitPrice))
          : null;

        return {
          productCode: row.product_code,
          productName: row.product_name,
          productType: row.product_type,
          shortName: row.short_name,
          description: row.description,
          departmentCode: row.department_code,
          departmentName: row.department_name,
          categoryCode: row.category_code,
          categoryName: row.category_name,
          subcategory: row.subcategory,
          unitOfMeasure: row.unit_of_measure,
          taxable: asBooleanFlag(row.taxable),
          taxProfileCode: row.tax_profile_code,
          trackInventory: asBooleanFlag(row.track_inventory),
          trackSize: asBooleanFlag(row.track_size),
          trackColor: asBooleanFlag(row.track_color),
          primaryImageUrl: row.primary_image_url,
          barcode: row.barcode_code,
          unitPrice: Number(asNumber(matrixPrice ?? row.unit_price).toFixed(2)),
          quantityOnHand: Number(
            asNumber(matrixQuantity ?? row.quantity_on_hand).toFixed(3),
          ),
          minStockLevel:
            row.min_stock_level === null
              ? null
              : Number(asNumber(row.min_stock_level).toFixed(3)),
          reorderPoint:
            row.reorder_point === null
              ? null
              : Number(asNumber(row.reorder_point).toFixed(3)),
          safetyStockLevel:
            row.safety_stock_level === null
              ? null
              : Number(asNumber(row.safety_stock_level).toFixed(3)),
          catalogSortOrder:
            row.catalog_sort_order === null ||
            row.catalog_sort_order === undefined
              ? null
              : asNumber(row.catalog_sort_order),
          salesLocationCode,
          salesLocationQuantity:
            row.sales_location_quantity === null || isMatrixProduct
              ? null
              : Number(asNumber(row.sales_location_quantity).toFixed(3)),
          isSerialized: asBooleanFlag(row.is_serialized),
          mustEnterPriceAtPos: asBooleanFlag(row.must_enter_price_at_pos),
          matrixVariants,
        };
      }),
    );
  }

  async searchCustomers(
    input?: StoreCustomerSearchRequest,
  ): Promise<StoreCustomerSummary[]> {
    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const limit = Math.min(Math.max(input?.limit ?? 8, 1), 24);
    const result = await this.query<CustomerRow>(
      `SELECT TOP (200)
        [id],
        [customer_no],
        [full_name],
        [customer_type],
        [phone],
        [email],
        [home_store_code],
        [home_store_name],
        [city],
        [country_code],
        [loyalty_enrolled],
        [loyalty_tier],
        [loyalty_points_balance],
        [allow_credit_sales],
        [credit_limit_amount],
        [receivable_balance_amount],
        [note],
        [status],
        [updated_at]
       FROM [dbo].[customer]
       WHERE [deleted_at] IS NULL
       ORDER BY [full_name] ASC, [customer_no] ASC`,
    );

    return result.recordset
      .filter((row) => {
        if (!normalizedQuery) {
          return true;
        }

        return [
          row.customer_no,
          row.full_name,
          row.customer_type,
          row.phone,
          row.email,
          row.loyalty_tier,
          row.city,
        ].some((value) => value?.toUpperCase().includes(normalizedQuery));
      })
      .slice(0, limit)
      .map((row) => ({
        customerId: row.id,
        customerNo: row.customer_no,
        fullName: row.full_name,
        customerType: row.customer_type,
        phone: row.phone,
        email: row.email,
        homeStoreCode: row.home_store_code,
        homeStoreName: row.home_store_name,
        city: row.city,
        countryCode: row.country_code,
        loyaltyEnrolled: asBooleanFlag(row.loyalty_enrolled),
        loyaltyTier: row.loyalty_tier,
        loyaltyPointsBalance: Math.trunc(asNumber(row.loyalty_points_balance)),
        allowCreditSales: asBooleanFlag(row.allow_credit_sales),
        creditLimitAmount:
          row.credit_limit_amount === null
            ? null
            : Number(asNumber(row.credit_limit_amount).toFixed(2)),
        receivableBalanceAmount: Number(
          asNumber(row.receivable_balance_amount).toFixed(2),
        ),
        status: row.status,
        note: row.note,
        updatedAt: row.updated_at,
      }));
  }

  async searchTransactionReferences(
    input?: StoreTransactionReferenceSearchRequest,
  ): Promise<StoreTransactionReferenceSummary[]> {
    await this.requireActiveOperatorSession({
      purpose: "searching captured transaction references",
    });

    const query = input?.query?.trim() ?? "";
    const normalizedQuery = query.toUpperCase();
    const normalizedReferenceQuery =
      normalizeCapturedTransactionReference(query) ?? normalizedQuery;
    const limit = Math.min(Math.max(input?.limit ?? 8, 1), 30);
    const result = await this.query<{
      id: string;
      reference_value: string;
      normalized_reference: string;
      details: string | null;
      first_transaction_no: string | null;
      last_transaction_no: string | null;
      use_count: number;
      first_seen_at: string;
      last_seen_at: string;
      updated_at: string;
    }>(
      `SELECT TOP (@limit)
        [id],
        [reference_value],
        [normalized_reference],
        [details],
        [first_transaction_no],
        [last_transaction_no],
        [use_count],
        [first_seen_at],
        [last_seen_at],
        [updated_at]
       FROM [dbo].[transaction_reference_capture]
       WHERE @normalizedQuery = N''
          OR UPPER([reference_value]) LIKE @likeQuery
          OR [normalized_reference] LIKE @likeReferenceQuery
          OR UPPER(ISNULL([details], N'')) LIKE @likeQuery
       ORDER BY [last_seen_at] DESC, [use_count] DESC, [reference_value] ASC`,
      {
        limit,
        normalizedQuery,
        likeQuery: `%${normalizedQuery}%`,
        likeReferenceQuery: `%${normalizedReferenceQuery}%`,
      },
    );

    return result.recordset.map((row) => ({
      id: row.id,
      reference: row.reference_value,
      normalizedReference: row.normalized_reference,
      details: row.details,
      firstTransactionNo: row.first_transaction_no,
      lastTransactionNo: row.last_transaction_no,
      useCount: Math.trunc(asNumber(row.use_count)),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      updatedAt: row.updated_at,
    }));
  }

  private async recordTransactionReferenceCapture(
    runner: MssqlRunner,
    input: {
      reference: string | null | undefined;
      details: string | null | undefined;
      transactionNo: string | null | undefined;
      capturedAt: string;
    },
  ) {
    const reference = input.reference?.trim() ?? "";
    const normalizedReference = normalizeCapturedTransactionReference(reference);

    if (!normalizedReference) {
      return;
    }

    const details = input.details?.trim() || null;
    const transactionNo = input.transactionNo?.trim() || null;

    await this.query(
      `MERGE [dbo].[transaction_reference_capture] WITH (HOLDLOCK) AS target
       USING (
         SELECT
           @id AS [id],
           @reference AS [reference_value],
           @normalizedReference AS [normalized_reference],
           @details AS [details],
           @transactionNo AS [transaction_no],
           @capturedAt AS [captured_at]
       ) AS source
       ON target.[normalized_reference] = source.[normalized_reference]
       WHEN MATCHED THEN UPDATE SET
         [reference_value] = source.[reference_value],
         [details] = CASE
           WHEN source.[details] IS NULL OR source.[details] = N''
           THEN target.[details]
           ELSE source.[details]
         END,
         [last_transaction_no] = source.[transaction_no],
         [use_count] = target.[use_count] + 1,
         [last_seen_at] = source.[captured_at],
         [updated_at] = source.[captured_at]
       WHEN NOT MATCHED THEN INSERT (
         [id],
         [reference_value],
         [normalized_reference],
         [details],
         [first_transaction_no],
         [last_transaction_no],
         [use_count],
         [first_seen_at],
         [last_seen_at],
         [updated_at]
       ) VALUES (
         source.[id],
         source.[reference_value],
         source.[normalized_reference],
         source.[details],
         source.[transaction_no],
         source.[transaction_no],
         1,
         source.[captured_at],
         source.[captured_at],
         source.[captured_at]
       );`,
      {
        id: randomUUID(),
        reference,
        normalizedReference,
        details,
        transactionNo,
        capturedAt: input.capturedAt,
      },
      runner,
    );
  }

  async browseInventoryPositions(
    input?: StoreInventoryBrowseRequest,
  ): Promise<StoreInventoryBrowseItem[]> {
    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const normalizedLocationCode = normalizeCatalogCode(input?.locationCode);
    const normalizedDepartmentCode = normalizeCatalogCode(input?.departmentCode);
    const normalizedCategoryCode = normalizeCatalogCode(input?.categoryCode);
    const serializedOnly = input?.serializedOnly === true;
    const criticalOnly = input?.criticalOnly === true;
    const limit = Math.min(
      Math.max(input?.limit ?? 12, 1),
      criticalOnly ? 100 : 30,
    );
    const requestedLocationCode = input?.locationCode?.trim() || null;
    const result = await this.query<InventoryBrowseRow>(
      `SELECT TOP (300)
        ISNULL(location.[location_code], ISNULL(fallbackLocation.[location_code], N'UNASSIGNED')) AS [location_code],
        ISNULL(location.[location_name], ISNULL(fallbackLocation.[location_name], N'Store stock')) AS [location_name],
        product.[product_code],
        product.[product_name],
        product.[short_name],
        product.[department_code],
        department.[department_name],
        product.[category_code],
        category.[category_name],
        product.[subcategory],
        ISNULL(balance.[quantity_on_hand], CASE WHEN @locationCode IS NULL THEN product.[quantity_on_hand] ELSE 0 END) AS [quantity_on_hand],
        product.[min_stock_level],
        product.[reorder_point],
        product.[safety_stock_level],
        product.[unit_price],
        product.[is_serialized],
        ISNULL(balance.[updated_at], product.[updated_at]) AS [updated_at]
       FROM [dbo].[product_snapshot] AS product
       LEFT JOIN [dbo].[inventory_location_balance] AS balance
         ON balance.[product_code] = product.[product_code]
        AND (@locationCode IS NULL OR UPPER(balance.[location_code]) = UPPER(@locationCode))
       LEFT JOIN [dbo].[inventory_location_snapshot] AS location
         ON location.[location_code] = balance.[location_code]
       OUTER APPLY (
         SELECT TOP (1) fallback.[location_code], fallback.[location_name]
         FROM [dbo].[inventory_location_snapshot] AS fallback
         WHERE (
             @locationCode IS NOT NULL
             AND UPPER(fallback.[location_code]) = UPPER(@locationCode)
           )
           OR (
             @locationCode IS NULL
             AND (fallback.[is_sales_default] = 1 OR fallback.[is_receiving_default] = 1)
           )
         ORDER BY
           CASE
             WHEN @locationCode IS NOT NULL AND UPPER(fallback.[location_code]) = UPPER(@locationCode) THEN 0
             WHEN fallback.[is_sales_default] = 1 THEN 1
             WHEN fallback.[is_receiving_default] = 1 THEN 2
             ELSE 3
           END,
           fallback.[location_name] ASC
       ) AS fallbackLocation
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = product.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = product.[category_code]
       ORDER BY ABS(ISNULL(balance.[quantity_on_hand], product.[quantity_on_hand])) DESC,
         product.[product_name] ASC`,
      { locationCode: requestedLocationCode },
    );
    const barcodeByProduct = await this.getRepresentativeBarcodeMap(
      result.recordset.map((row) => row.product_code),
    );
    const getCriticalStockFloor = (row: InventoryBrowseRow) => {
      const thresholds = [
        row.min_stock_level,
        row.reorder_point,
        row.safety_stock_level,
      ]
        .map((value) => (value === null ? null : asNumber(value)))
        .filter(
          (value): value is number =>
            value !== null && Number.isFinite(value) && value > 0,
        );

      return thresholds[0] ?? null;
    };
    const filteredRows = result.recordset.filter((row) => {
      if (
        normalizedLocationCode &&
        normalizeCatalogCode(row.location_code) !== normalizedLocationCode
      ) {
        return false;
      }

      if (
        normalizedDepartmentCode &&
        normalizeCatalogCode(row.department_code) !== normalizedDepartmentCode
      ) {
        return false;
      }

      if (
        normalizedCategoryCode &&
        normalizeCatalogCode(row.category_code) !== normalizedCategoryCode
      ) {
        return false;
      }

      if (serializedOnly && !asBooleanFlag(row.is_serialized)) {
        return false;
      }

      if (criticalOnly) {
        const criticalStockFloor = getCriticalStockFloor(row);

        if (
          criticalStockFloor === null ||
          asNumber(row.quantity_on_hand) > criticalStockFloor
        ) {
          return false;
        }
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        row.location_code,
        row.location_name,
        row.product_code,
        row.product_name,
        row.short_name,
        row.department_code,
        row.department_name,
        row.category_code,
        row.category_name,
        row.subcategory,
        barcodeByProduct.get(row.product_code) ?? null,
      ].some((value) => value?.toUpperCase().includes(normalizedQuery));
    });

    if (criticalOnly) {
      filteredRows.sort((left, right) => {
        const leftFloor = getCriticalStockFloor(left) ?? 0;
        const rightFloor = getCriticalStockFloor(right) ?? 0;
        const leftGap = asNumber(left.quantity_on_hand) - leftFloor;
        const rightGap = asNumber(right.quantity_on_hand) - rightFloor;

        if (leftGap !== rightGap) {
          return leftGap - rightGap;
        }

        return left.product_name.localeCompare(right.product_name);
      });
    }

    return filteredRows
      .slice(0, limit)
      .map((row) => ({
        locationCode: row.location_code,
        locationName: row.location_name,
        productCode: row.product_code,
        productName: row.product_name,
        shortName: row.short_name,
        departmentCode: row.department_code,
        departmentName: row.department_name,
        categoryCode: row.category_code,
        categoryName: row.category_name,
        subcategory: row.subcategory,
        barcode: barcodeByProduct.get(row.product_code) ?? null,
        quantityOnHand: Number(asNumber(row.quantity_on_hand).toFixed(3)),
        minStockLevel:
          row.min_stock_level === null
            ? null
            : Number(asNumber(row.min_stock_level).toFixed(3)),
        reorderPoint:
          row.reorder_point === null
            ? null
            : Number(asNumber(row.reorder_point).toFixed(3)),
        safetyStockLevel:
          row.safety_stock_level === null
            ? null
            : Number(asNumber(row.safety_stock_level).toFixed(3)),
        unitPrice: Number(asNumber(row.unit_price).toFixed(2)),
        isSerialized: asBooleanFlag(row.is_serialized),
        updatedAt: row.updated_at,
      }));
  }

  async lookupRemoteStoreInventory(
    input?: StoreRemoteInventoryLookupInput,
  ): Promise<StoreRemoteInventoryLookupResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.view"],
      purpose: "looking up stock across shops",
    });

    if (this.isStandaloneDeployment()) {
      throw new Error(
        "Remote shop stock lookup is not available in standalone mode.",
      );
    }

    if (!this.syncBaseUrl) {
      throw new Error(
        "HQ connectivity is not configured for this store node, so Flash ERP cannot lookup stock in other shops.",
      );
    }

    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;

    return this.postJson<StoreRemoteInventoryLookupResult>(
      `${this.syncBaseUrl}/api/sync/store-nodes/${encodeURIComponent(nodeCode)}/inventory-lookup`,
      {
        query: input?.query ?? null,
        productCode: input?.productCode ?? null,
        limit: input?.limit ?? 25,
      },
    );
  }

  async requestRemoteInterStoreStock(
    input: StoreRemoteInterStoreStockRequestInput,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.transfer.request"],
      purpose: "requesting stock from another shop",
    });

    if (this.isStandaloneDeployment()) {
      throw new Error(
        "Remote shop stock requests are not available in standalone mode.",
      );
    }

    if (!this.syncBaseUrl) {
      throw new Error(
        "HQ connectivity is not configured for this store node, so Flash ERP cannot place a remote stock request.",
      );
    }

    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const response = await this.postJson<{ message?: string }>(
      `${this.syncBaseUrl}/api/sync/store-nodes/${encodeURIComponent(nodeCode)}/inter-store-stock-request`,
      input,
    );

    return {
      message:
        response.message ??
        "Flash ERP placed the remote stock request through HQ.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async browseSerialRegistry(
    input?: StoreSerialRegistryBrowseRequest,
  ): Promise<StoreSerialRegistryBrowseItem[]> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.view"],
      purpose: "viewing serialized inventory",
    });
    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const normalizedLocationCode = normalizeCatalogCode(input?.locationCode);
    const normalizedDepartmentCode = normalizeCatalogCode(
      input?.departmentCode,
    );
    const normalizedCategoryCode = normalizeCatalogCode(input?.categoryCode);
    const normalizedStatus = input?.status?.trim().toUpperCase() || null;
    const limit = Math.min(Math.max(input?.limit ?? 16, 1), 40);
    const result = await this.query<SerialRegistryBrowseRow>(
      `SELECT
        registry.[product_code],
        product.[product_name],
        product.[department_code],
        department.[department_name],
        product.[category_code],
        category.[category_name],
        product.[subcategory],
        registry.[serial_number],
        registry.[inventory_location_code],
        location.[location_name],
        registry.[status],
        registry.[source_transaction_id],
        registry.[source_transaction_no],
        registry.[updated_at]
       FROM [dbo].[serial_registry] AS registry
       LEFT JOIN [dbo].[product_snapshot] AS product
         ON product.[product_code] = registry.[product_code]
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = product.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = product.[category_code]
       LEFT JOIN [dbo].[inventory_location_snapshot] AS location
         ON location.[location_code] = registry.[inventory_location_code]
       ORDER BY registry.[updated_at] DESC,
        COALESCE(product.[product_name], registry.[product_code]) ASC,
        registry.[serial_number] ASC`,
    );

    return result.recordset
      .filter((row) => {
        if (
          normalizedLocationCode &&
          normalizeCatalogCode(row.inventory_location_code) !==
            normalizedLocationCode
        ) {
          return false;
        }

        if (
          normalizedDepartmentCode &&
          normalizeCatalogCode(row.department_code) !== normalizedDepartmentCode
        ) {
          return false;
        }

        if (
          normalizedCategoryCode &&
          normalizeCatalogCode(row.category_code) !== normalizedCategoryCode
        ) {
          return false;
        }

        if (normalizedStatus && row.status.toUpperCase() !== normalizedStatus) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystacks = [
          row.product_code,
          row.product_name,
          row.department_code,
          row.department_name,
          row.category_code,
          row.category_name,
          row.subcategory,
          row.serial_number,
          row.inventory_location_code,
          row.location_name,
          row.status,
          row.source_transaction_no,
        ];

        return haystacks.some((value) =>
          value?.toUpperCase().includes(normalizedQuery),
        );
      })
      .slice(0, limit)
      .map<StoreSerialRegistryBrowseItem>((row) => ({
        productCode: row.product_code,
        productName: row.product_name ?? row.product_code,
        departmentCode: row.department_code,
        departmentName: row.department_name,
        categoryCode: row.category_code,
        categoryName: row.category_name,
        subcategory: row.subcategory,
        serialNumber: row.serial_number,
        locationCode: row.inventory_location_code,
        locationName: row.location_name,
        status: row.status,
        sourceTransactionId: row.source_transaction_id,
        sourceTransactionNo: row.source_transaction_no,
        updatedAt: row.updated_at,
      }));
  }

  async browsePurchaseOrders(
    input?: StorePurchaseOrderBrowseRequest,
  ): Promise<StorePurchaseOrderSummary[]> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.view"],
      purpose: "viewing local purchase orders",
    });
    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const normalizedStatus = input?.status?.trim().toUpperCase() || null;
    const normalizedLocationCode = normalizeCatalogCode(input?.locationCode);
    const normalizedSupplierNo =
      input?.supplierNo?.trim().toUpperCase() || null;
    const limit = Math.min(Math.max(input?.limit ?? 10, 1), 24);
    const result = await this.query<PurchaseOrderSnapshotRow>(
      `SELECT
        [id],
        [purchase_order_no],
        [status],
        [inventory_location_code],
        [inventory_location_name],
        [supplier_no],
        [supplier_name],
        [external_reference],
        [note],
        [operator_name],
        [ordered_quantity],
        [received_quantity],
        [exception_quantity],
        [outstanding_quantity],
        [committed_at],
        [closed_at],
        [closure_reason],
        [closure_note],
        [closure_operator_name],
        [updated_at]
       FROM [dbo].[purchase_order_snapshot]
       ORDER BY
        CASE [status]
          WHEN N'COMMITTED' THEN 0
          WHEN N'PART_RECEIVED' THEN 1
          WHEN N'RECEIVED' THEN 2
          WHEN N'CLOSED' THEN 3
          ELSE 4
        END,
        [updated_at] DESC,
        [purchase_order_no] DESC`,
    );
    const summaries = await this.toPurchaseOrderSummaries(result.recordset);

    return summaries
      .filter((purchaseOrder) => {
        if (
          normalizedStatus &&
          purchaseOrder.status.toUpperCase() !== normalizedStatus
        ) {
          return false;
        }

        if (
          normalizedLocationCode &&
          purchaseOrder.inventoryLocationCode.toUpperCase() !==
            normalizedLocationCode
        ) {
          return false;
        }

        if (
          normalizedSupplierNo &&
          (purchaseOrder.supplierNo ?? "").toUpperCase() !==
            normalizedSupplierNo
        ) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystacks = [
          purchaseOrder.purchaseOrderNo,
          purchaseOrder.status,
          purchaseOrder.inventoryLocationCode,
          purchaseOrder.inventoryLocationName,
          purchaseOrder.supplierNo,
          purchaseOrder.supplierName,
          purchaseOrder.externalReference,
          ...purchaseOrder.lines.flatMap((line) => [
            line.productCode,
            line.productName,
            line.departmentCode,
            line.departmentName,
            line.categoryCode,
            line.categoryName,
            line.subcategory,
          ]),
        ];

        return haystacks.some((value) =>
          value?.toUpperCase().includes(normalizedQuery),
        );
      })
      .slice(0, limit);
  }

  private async toPurchaseOrderSummaries(
    rows: PurchaseOrderSnapshotRow[],
  ): Promise<StorePurchaseOrderSummary[]> {
    const purchaseOrderIds = rows.map((row) => row.id);
    const linesByPurchaseOrderId = new Map<
      string,
      StorePurchaseOrderSummary["lines"]
    >();

    if (purchaseOrderIds.length > 0) {
      const lineResult = await this.query<PurchaseOrderLineSnapshotRow>(
        `SELECT
          line.[id],
          line.[purchase_order_id],
          line.[line_no],
          line.[product_code],
          line.[product_name],
          line.[department_code],
          department.[department_name],
          line.[category_code],
          category.[category_name],
          line.[subcategory],
          line.[is_serialized],
          line.[ordered_quantity],
          line.[received_quantity],
          line.[exception_quantity],
          line.[outstanding_quantity],
          line.[unit_cost],
          line.[updated_at]
         FROM [dbo].[purchase_order_line_snapshot] AS line
         LEFT JOIN [dbo].[product_department_snapshot] AS department
           ON department.[department_code] = line.[department_code]
         LEFT JOIN [dbo].[product_category_snapshot] AS category
           ON category.[category_code] = line.[category_code]
         WHERE line.[purchase_order_id] IN (${purchaseOrderIds
           .map((_, index) => `@purchaseOrderId${index}`)
           .join(", ")})
         ORDER BY line.[purchase_order_id] ASC, line.[line_no] ASC`,
        Object.fromEntries(
          purchaseOrderIds.map((id, index) => [`purchaseOrderId${index}`, id]),
        ),
      );

      for (const line of lineResult.recordset) {
        const currentLines =
          linesByPurchaseOrderId.get(line.purchase_order_id) ?? [];

        currentLines.push({
          purchaseOrderLineId: line.id,
          lineNo: Math.trunc(asNumber(line.line_no)),
          productCode: line.product_code,
          productName: line.product_name,
          departmentCode: line.department_code,
          departmentName: line.department_name,
          categoryCode: line.category_code,
          categoryName: line.category_name,
          subcategory: line.subcategory,
          isSerialized: asBooleanFlag(line.is_serialized),
          orderedQuantity: Number(asNumber(line.ordered_quantity).toFixed(3)),
          receivedQuantity: Number(asNumber(line.received_quantity).toFixed(3)),
          exceptionQuantity: Number(
            asNumber(line.exception_quantity).toFixed(3),
          ),
          outstandingQuantity: Number(
            asNumber(line.outstanding_quantity).toFixed(3),
          ),
          unitCost: asNullableNumber(line.unit_cost),
        });
        linesByPurchaseOrderId.set(line.purchase_order_id, currentLines);
      }
    }

    return rows.map((purchaseOrder) => ({
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchase_order_no,
      status: purchaseOrder.status,
      inventoryLocationCode: purchaseOrder.inventory_location_code,
      inventoryLocationName: purchaseOrder.inventory_location_name,
      supplierNo: purchaseOrder.supplier_no,
      supplierName: purchaseOrder.supplier_name,
      externalReference: purchaseOrder.external_reference,
      note: purchaseOrder.note,
      operatorName: purchaseOrder.operator_name,
      orderedQuantity: Number(
        asNumber(purchaseOrder.ordered_quantity).toFixed(3),
      ),
      receivedQuantity: Number(
        asNumber(purchaseOrder.received_quantity).toFixed(3),
      ),
      exceptionQuantity: Number(
        asNumber(purchaseOrder.exception_quantity).toFixed(3),
      ),
      outstandingQuantity: Number(
        asNumber(purchaseOrder.outstanding_quantity).toFixed(3),
      ),
      lineCount: linesByPurchaseOrderId.get(purchaseOrder.id)?.length ?? 0,
      committedAt: purchaseOrder.committed_at,
      closedAt: purchaseOrder.closed_at,
      closureReason: purchaseOrder.closure_reason,
      closureNote: purchaseOrder.closure_note,
      closureOperatorName: purchaseOrder.closure_operator_name,
      updatedAt: purchaseOrder.updated_at,
      lines: linesByPurchaseOrderId.get(purchaseOrder.id) ?? [],
    }));
  }

  async browseInterStoreTransfers(
    input?: StoreInterStoreTransferBrowseRequest,
  ): Promise<StoreInterStoreTransferSummary[]> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.view"],
      purpose: "viewing inter-store transfers",
    });
    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const normalizedRole = input?.role?.trim().toUpperCase() || null;
    const normalizedStatus = input?.status?.trim().toUpperCase() || null;
    const normalizedLocationCode = normalizeCatalogCode(input?.locationCode);
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 24);
    const localStoreCode = normalizeCatalogCode(
      (await this.metadataValue("store_code")) ?? defaultStoreConfig.storeCode,
    );
    const summaries = await this.getInterStoreTransferSummaries(60);

    return summaries
      .filter((transfer) => {
        const sourceStoreCode = transfer.sourceStoreCode.trim().toUpperCase();
        const destinationStoreCode = transfer.destinationStoreCode
          .trim()
          .toUpperCase();

        if (
          transfer.role === "SOURCE" &&
          sourceStoreCode !== localStoreCode
        ) {
          return false;
        }

        if (
          transfer.role === "DESTINATION" &&
          destinationStoreCode !== localStoreCode
        ) {
          return false;
        }

        if (
          transfer.role !== "SOURCE" &&
          transfer.role !== "DESTINATION" &&
          sourceStoreCode !== localStoreCode &&
          destinationStoreCode !== localStoreCode
        ) {
          return false;
        }

        if (normalizedRole && transfer.role.toUpperCase() !== normalizedRole) {
          return false;
        }

        if (
          normalizedStatus &&
          transfer.status.toUpperCase() !== normalizedStatus
        ) {
          return false;
        }

        if (
          normalizedLocationCode &&
          transfer.sourceLocationCode.toUpperCase() !==
            normalizedLocationCode &&
          transfer.destinationLocationCode.toUpperCase() !==
            normalizedLocationCode
        ) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystacks = [
          transfer.transferNo,
          transfer.transferBatchNo,
          transfer.status,
          transfer.externalReference,
          transfer.sourceStoreCode,
          transfer.sourceStoreName,
          transfer.sourceLocationCode,
          transfer.sourceLocationName,
          transfer.destinationStoreCode,
          transfer.destinationStoreName,
          transfer.destinationLocationCode,
          transfer.destinationLocationName,
          transfer.productCode,
          transfer.productName,
          transfer.departmentCode,
          transfer.departmentName,
          transfer.categoryCode,
          transfer.categoryName,
          transfer.subcategory,
        ];

        return haystacks.some((value) =>
          value?.toUpperCase().includes(normalizedQuery),
        );
      })
      .slice(0, limit);
  }

  private async getInterStoreTransferSummaries(
    limit = 24,
  ): Promise<StoreInterStoreTransferSummary[]> {
    const result = await this.query<InterStoreTransferSnapshotRow>(
      `SELECT TOP (@limit)
        transfer.[id],
        transfer.[transfer_no],
        transfer.[transfer_batch_no],
        transfer.[line_no],
        transfer.[role],
        transfer.[origin],
        transfer.[status],
        transfer.[external_reference],
        transfer.[source_store_code],
        transfer.[source_store_name],
        transfer.[source_location_code],
        transfer.[source_location_name],
        transfer.[destination_store_code],
        transfer.[destination_store_name],
        transfer.[destination_location_code],
        transfer.[destination_location_name],
        transfer.[product_code],
        transfer.[product_name],
        transfer.[department_code],
        department.[department_name],
        transfer.[category_code],
        category.[category_name],
        transfer.[subcategory],
        transfer.[is_serialized],
        transfer.[requested_quantity],
        transfer.[issued_quantity],
        transfer.[received_quantity],
        transfer.[outstanding_issue_quantity],
        transfer.[outstanding_receipt_quantity],
        transfer.[unit_cost],
        transfer.[issued_serial_numbers_json],
        transfer.[received_serial_numbers_json],
        transfer.[request_note],
        transfer.[issue_note],
        transfer.[receipt_note],
        transfer.[request_operator_name],
        transfer.[issue_operator_name],
        transfer.[receipt_operator_name],
        transfer.[requested_by_node_code],
        transfer.[source_node_code],
        transfer.[destination_node_code],
        transfer.[requested_at],
        transfer.[required_at],
        transfer.[issued_at],
        transfer.[received_at],
        transfer.[closed_at],
        transfer.[updated_at]
       FROM [dbo].[inter_store_transfer_snapshot] AS transfer
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = transfer.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = transfer.[category_code]
       ORDER BY
        CASE transfer.[status]
          WHEN N'REQUESTED' THEN 0
          WHEN N'PART_ISSUED' THEN 1
          WHEN N'ISSUED' THEN 2
          WHEN N'PART_RECEIVED' THEN 3
          WHEN N'RECEIVED' THEN 4
          ELSE 5
        END,
        transfer.[updated_at] DESC,
        transfer.[transfer_no] DESC`,
      { limit },
    );

    return result.recordset.map((row) => ({
      transferId: row.id,
      transferNo: row.transfer_no,
      transferBatchNo: row.transfer_batch_no,
      lineNo: Math.max(1, Math.trunc(asNumber(row.line_no))),
      role: row.role,
      origin: row.origin,
      status: row.status,
      externalReference: row.external_reference,
      sourceStoreCode: row.source_store_code,
      sourceStoreName: row.source_store_name,
      sourceLocationCode: row.source_location_code,
      sourceLocationName: row.source_location_name,
      destinationStoreCode: row.destination_store_code,
      destinationStoreName: row.destination_store_name,
      destinationLocationCode: row.destination_location_code,
      destinationLocationName: row.destination_location_name,
      productCode: row.product_code,
      productName: row.product_name,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      subcategory: row.subcategory,
      isSerialized: asBooleanFlag(row.is_serialized),
      requestedQuantity: Number(asNumber(row.requested_quantity).toFixed(3)),
      issuedQuantity: Number(asNumber(row.issued_quantity).toFixed(3)),
      receivedQuantity: Number(asNumber(row.received_quantity).toFixed(3)),
      outstandingIssueQuantity: Number(
        asNumber(row.outstanding_issue_quantity).toFixed(3),
      ),
      outstandingReceiptQuantity: Number(
        asNumber(row.outstanding_receipt_quantity).toFixed(3),
      ),
      unitCost: asNullableNumber(row.unit_cost),
      issuedSerialNumbers: readSerializedLineNumbers(
        row.issued_serial_numbers_json,
      ),
      receivedSerialNumbers: readSerializedLineNumbers(
        row.received_serial_numbers_json,
      ),
      requestNote: row.request_note,
      issueNote: row.issue_note,
      receiptNote: row.receipt_note,
      requestOperatorName: row.request_operator_name,
      issueOperatorName: row.issue_operator_name,
      receiptOperatorName: row.receipt_operator_name,
      requestedByNodeCode: row.requested_by_node_code,
      sourceNodeCode: row.source_node_code,
      destinationNodeCode: row.destination_node_code,
      requestedAt: row.requested_at,
      requiredAt: row.required_at,
      issuedAt: row.issued_at,
      receivedAt: row.received_at,
      closedAt: row.closed_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getTransferRequestTargetSummaries(): Promise<
    StoreTransferRequestTargetSummary[]
  > {
    const result = await this.query<TransferRequestTargetSnapshotRow>(
      `SELECT
        [source_store_code],
        [source_store_name],
        [source_store_sales_enabled],
        [source_store_warehouse_enabled],
        [source_location_code],
        [source_location_name],
        [source_location_type],
        [source_location_status],
        [source_location_defaults],
        [source_warehouse_code],
        [source_warehouse_name],
        [use_for_sales_default],
        [use_for_receiving_default],
        [updated_at]
       FROM [dbo].[inter_store_transfer_request_target_snapshot]
       ORDER BY [source_store_name] ASC, [source_location_name] ASC`,
    );

    return result.recordset.map((row) => ({
      sourceStoreCode: row.source_store_code,
      sourceStoreName: row.source_store_name,
      sourceStoreSalesEnabled: asBooleanFlag(row.source_store_sales_enabled),
      sourceStoreWarehouseEnabled: asBooleanFlag(
        row.source_store_warehouse_enabled,
      ),
      sourceLocationCode: row.source_location_code,
      sourceLocationName: row.source_location_name,
      sourceLocationType: row.source_location_type,
      sourceLocationStatus: row.source_location_status,
      sourceLocationDefaults: row.source_location_defaults,
      sourceWarehouseCode: row.source_warehouse_code,
      sourceWarehouseName: row.source_warehouse_name,
      useForSalesDefault: asBooleanFlag(row.use_for_sales_default),
      useForReceivingDefault: asBooleanFlag(row.use_for_receiving_default),
      updatedAt: row.updated_at,
    }));
  }

  private async getInterStoreTransferRequestDraftRow(draftId: string) {
    const result = await this.query<InterStoreTransferRequestDraftRow>(
      `SELECT TOP (1)
        draft.[id],
        draft.[request_no],
        draft.[status],
        draft.[source_store_code],
        draft.[source_store_name],
        draft.[source_location_code],
        draft.[source_location_name],
        draft.[destination_store_code],
        draft.[destination_store_name],
        draft.[destination_location_code],
        draft.[destination_location_name],
        draft.[product_code],
        draft.[product_name],
        draft.[department_code],
        department.[department_name],
        draft.[category_code],
        category.[category_name],
        draft.[subcategory],
        draft.[is_serialized],
        draft.[quantity],
        draft.[external_reference],
        draft.[note],
        draft.[operator_name],
        draft.[submitted_at],
        draft.[updated_at]
       FROM [dbo].[inter_store_transfer_request_draft] AS draft
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = draft.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = draft.[category_code]
       WHERE draft.[id] = @draftId`,
      { draftId },
    );

    return result.recordset[0] ?? null;
  }

  private async getTransferRequestDraftSummaries(): Promise<
    StoreInterStoreTransferRequestDraftSummary[]
  > {
    const result = await this.query<InterStoreTransferRequestDraftRow>(
      `SELECT TOP (20)
        draft.[id],
        draft.[request_no],
        draft.[status],
        draft.[source_store_code],
        draft.[source_store_name],
        draft.[source_location_code],
        draft.[source_location_name],
        draft.[destination_store_code],
        draft.[destination_store_name],
        draft.[destination_location_code],
        draft.[destination_location_name],
        draft.[product_code],
        draft.[product_name],
        draft.[department_code],
        department.[department_name],
        draft.[category_code],
        category.[category_name],
        draft.[subcategory],
        draft.[is_serialized],
        draft.[quantity],
        draft.[external_reference],
        draft.[note],
        draft.[operator_name],
        draft.[submitted_at],
        draft.[updated_at]
       FROM [dbo].[inter_store_transfer_request_draft] AS draft
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = draft.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = draft.[category_code]
       ORDER BY
        CASE draft.[status] WHEN N'DRAFT' THEN 0 ELSE 1 END,
        draft.[updated_at] DESC`,
    );

    return result.recordset.map((row) => ({
      draftId: row.id,
      requestNo: row.request_no,
      status: row.status,
      sourceStoreCode: row.source_store_code,
      sourceStoreName: row.source_store_name,
      sourceLocationCode: row.source_location_code,
      sourceLocationName: row.source_location_name,
      destinationStoreCode: row.destination_store_code,
      destinationStoreName: row.destination_store_name,
      destinationLocationCode: row.destination_location_code,
      destinationLocationName: row.destination_location_name,
      productCode: row.product_code,
      productName: row.product_name,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      subcategory: row.subcategory,
      isSerialized: asBooleanFlag(row.is_serialized),
      quantity: Number(asNumber(row.quantity).toFixed(3)),
      externalReference: row.external_reference,
      note: row.note,
      operatorName: row.operator_name,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
    }));
  }

  async saveInterStoreTransferRequestDraft(
    input: StoreInterStoreTransferRequestDraftInput,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.transfer.request"],
      purpose: "saving an inter-store transfer request",
    });
    const sourceLocationCode = input.sourceLocationCode.trim().toUpperCase();
    const destinationLocationCode = input.destinationLocationCode
      .trim()
      .toUpperCase();
    const productCode = input.productCode.trim().toUpperCase();
    const quantity = Number(Number(input.quantity).toFixed(3));

    if (
      !sourceLocationCode ||
      !destinationLocationCode ||
      sourceLocationCode === destinationLocationCode
    ) {
      throw new Error(
        "Choose different source and destination locations before saving the transfer request.",
      );
    }

    if (!productCode) {
      throw new Error("Choose a product before saving the transfer request.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Enter a transfer request quantity greater than zero.");
    }

    const [metadata, targetResult, locationResult, product] = await Promise.all([
      this.metadata(),
      this.query<TransferRequestTargetSnapshotRow>(
        `SELECT TOP (1)
          [source_store_code],
          [source_store_name],
          [source_store_sales_enabled],
          [source_store_warehouse_enabled],
          [source_location_code],
          [source_location_name],
          [source_location_type],
          [source_location_status],
          [source_location_defaults],
          [source_warehouse_code],
          [source_warehouse_name],
          [use_for_sales_default],
          [use_for_receiving_default],
          [updated_at]
         FROM [dbo].[inter_store_transfer_request_target_snapshot]
         WHERE [source_location_code] = @sourceLocationCode`,
        { sourceLocationCode },
      ),
      this.query<{ location_code: string; location_name: string }>(
        `SELECT TOP (1) [location_code], [location_name]
         FROM [dbo].[inventory_location_snapshot]
         WHERE [location_code] = @destinationLocationCode`,
        { destinationLocationCode },
      ),
      this.findCatalogLookup(productCode),
    ]);
    const target = targetResult.recordset[0] ?? null;
    const destinationLocation = locationResult.recordset[0] ?? null;

    if (!target) {
      throw new Error(
        `Flash ERP has no enterprise transfer source target for ${sourceLocationCode}. Pull the latest sync before requesting stock.`,
      );
    }

    if (!destinationLocation) {
      throw new Error(
        `Flash ERP could not find local destination location "${destinationLocationCode}".`,
      );
    }

    if (!product) {
      throw new Error(
        `Flash ERP could not find local product "${productCode}".`,
      );
    }

    const timestamp = isoNow();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const requestId = randomUUID();
    const requestNo = buildLocalDocumentNo(
      "TRQ",
      storeCode,
      await this.nextSequence("inter_store_transfer_request_sequence"),
      timestamp,
    );
    const operatorName =
      input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);
    const externalReference = input.externalReference?.trim() || null;
    const note = input.note?.trim() || null;

    await this.query(
      `INSERT INTO [dbo].[inter_store_transfer_request_draft] (
        [id],
        [request_no],
        [status],
        [source_store_code],
        [source_store_name],
        [source_location_code],
        [source_location_name],
        [destination_store_code],
        [destination_store_name],
        [destination_location_code],
        [destination_location_name],
        [product_code],
        [product_name],
        [department_code],
        [category_code],
        [subcategory],
        [is_serialized],
        [quantity],
        [external_reference],
        [note],
        [operator_name],
        [submitted_at],
        [updated_at]
      ) VALUES (
        @requestId,
        @requestNo,
        N'DRAFT',
        @sourceStoreCode,
        @sourceStoreName,
        @sourceLocationCode,
        @sourceLocationName,
        @destinationStoreCode,
        @destinationStoreName,
        @destinationLocationCode,
        @destinationLocationName,
        @productCode,
        @productName,
        @departmentCode,
        @categoryCode,
        @subcategory,
        @isSerialized,
        @quantity,
        @externalReference,
        @note,
        @operatorName,
        NULL,
        @timestamp
      )`,
      {
        requestId,
        requestNo,
        sourceStoreCode: target.source_store_code,
        sourceStoreName: target.source_store_name,
        sourceLocationCode: target.source_location_code,
        sourceLocationName: target.source_location_name,
        destinationStoreCode: storeCode,
        destinationStoreName: metadata.store_name ?? defaultStoreConfig.storeName,
        destinationLocationCode: destinationLocation.location_code,
        destinationLocationName: destinationLocation.location_name,
        productCode: product.product_code,
        productName: product.product_name,
        departmentCode: product.department_code,
        categoryCode: product.category_code,
        subcategory: product.subcategory,
        isSerialized: asBooleanFlag(product.is_serialized) ? 1 : 0,
        quantity,
        externalReference,
        note,
        operatorName,
        timestamp,
      },
    );
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${requestNo} was saved as a SQL Server inter-store transfer request draft.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${requestNo} was saved locally. Submit it when the request is ready for enterprise creation.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async submitInterStoreTransferRequestDraft(
    draftId: string,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.transfer.request"],
      purpose: "submitting an inter-store transfer request",
    });
    const normalizedDraftId = draftId.trim();

    if (!normalizedDraftId) {
      throw new Error(
        "Select a saved transfer request draft before submitting it.",
      );
    }

    const draft = await this.getInterStoreTransferRequestDraftRow(
      normalizedDraftId,
    );

    if (!draft) {
      throw new Error(
        "Flash ERP could not find that transfer request draft in SQL Server.",
      );
    }

    if (draft.status !== "DRAFT") {
      throw new Error(
        `${draft.request_no} has already been submitted locally.`,
      );
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const operatorName =
      draft.operator_name || this.formatOperatorLabel(operatorSession);
    const payload: StoreInterStoreTransferRequestedPayload = {
      requestId: draft.id,
      requestNo: draft.request_no,
      storeCode,
      terminalCode,
      sourceLocationCode: draft.source_location_code,
      destinationLocationCode: draft.destination_location_code,
      productCode: draft.product_code,
      quantity: Number(asNumber(draft.quantity).toFixed(3)),
      externalReference: draft.external_reference,
      operatorName,
      note: draft.note,
      occurredAt: timestamp,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `UPDATE [dbo].[inter_store_transfer_request_draft]
         SET [status] = N'SUBMITTED',
             [submitted_at] = @timestamp,
             [updated_at] = @timestamp
         WHERE [id] = @draftId`,
        { timestamp, draftId: draft.id },
        transaction,
      );
      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "interStoreTransfer",
            aggregateId: draft.id,
            eventType: "inter-store-transfer.requested",
            idempotencyKey: `${nodeCode}:interStoreTransfer:${draft.id}:requested:${timestamp}`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${draft.request_no} was submitted from SQL Server and queued upstream as an inter-store transfer request.`
        : `${draft.request_no} was submitted from SQL Server for standalone transfer tracking.`,
      upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: shouldQueueEnterprise
        ? `${draft.request_no} was submitted and queued for enterprise creation.`
        : `${draft.request_no} was submitted locally for standalone transfer tracking.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private requireStandaloneSetupMode() {
    if (!this.isStandaloneDeployment()) {
      throw new Error(
        "Standalone setup is available only when this desktop is running in standalone mode.",
      );
    }
  }

  private async requireStandaloneSupervisor() {
    const session = await this.requireActiveOperatorSession({
      purpose: "managing standalone setup",
    });

    if (!session.capabilities.supervisorEligible) {
      throw new Error(
        `${this.formatOperatorLabel(session)} is not allowed to manage standalone setup.`,
      );
    }

    return session;
  }

  private async finishStandaloneSetupWrite(message: string, timestamp: string) {
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: message,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async bootstrapStandaloneAdmin(
    input: StoreStandaloneUserInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    const countResult = await this.query<{ value: string | number }>(
      "SELECT COUNT(*) AS [value] FROM [dbo].[retail_user_snapshot]",
    );

    if (asNumber(countResult.recordset[0]?.value) > 0) {
      throw new Error(
        "This standalone SQL Server store node already has local operator accounts. Sign in with a supervisor to manage users.",
      );
    }

    return this.saveStandaloneUser({
      ...input,
      roleCode: input.roleCode ?? "STANDALONE-ADMINISTRATOR",
      roleName: input.roleName ?? "Standalone administrator",
      cashierEligible: true,
      supervisorEligible: true,
      accountStatus: "ACTIVE",
    });
  }

  async saveStandaloneSettings(
    input: StoreStandaloneSettingsInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();

    await this.withTransaction(async (transaction) => {
      const entries = [
        ["store_name", optionalSetupText(input.storeName)],
        ["store_short_name", optionalSetupText(input.shortName)],
        ["currency_code", optionalSetupText(input.currencyCode)?.toUpperCase() ?? null],
        ["timezone", optionalSetupText(input.timezone)],
        ["local_company_logo_url", optionalSetupText(input.companyLogoUrl)],
        ["receipt_header", optionalSetupText(input.receiptHeader)],
        ["receipt_footer", optionalSetupText(input.receiptFooter)],
      ] as const;

      for (const [key, value] of entries) {
        if (value) {
          await this.setMetadata(key, value, transaction);
        } else if (
          (key === "store_short_name" && input.shortName !== undefined) ||
          (key === "local_company_logo_url" && input.companyLogoUrl !== undefined) ||
          (key === "receipt_header" && input.receiptHeader !== undefined) ||
          (key === "receipt_footer" && input.receiptFooter !== undefined)
        ) {
          await this.deleteMetadata(key, transaction);
        }
      }

      if (typeof input.touchModeEnabled === "boolean") {
        await this.setMetadata(
          "touch_mode_enabled",
          input.touchModeEnabled ? "1" : "0",
          transaction,
        );
      }
      if (typeof input.showCriticalStocksOnStartup === "boolean") {
        await this.setMetadata(
          "show_critical_stocks_on_startup",
          input.showCriticalStocksOnStartup ? "1" : "0",
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    return this.finishStandaloneSetupWrite(
      "Standalone store settings were saved on this SQL Server desktop.",
      timestamp,
    );
  }

  async saveStandaloneDepartment(
    input: StoreStandaloneDepartmentInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const departmentCode = normalizeSetupCode(input.departmentCode, "Department code");
    const departmentName = normalizeSetupName(input.departmentName, "Department name");

    await this.mergeRow("product_department_snapshot", ["department_code"], {
      id: `standalone-department-${departmentCode.toLowerCase()}`,
      department_code: departmentCode,
      department_name: departmentName,
      description: optionalSetupText(input.description),
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      sort_order: Math.trunc(normalizeSetupNumber(input.sortOrder, 0, 0)),
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(
      `${departmentName} was saved in standalone departments.`,
      timestamp,
    );
  }

  async saveStandaloneCategory(
    input: StoreStandaloneCategoryInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const categoryCode = normalizeSetupCode(input.categoryCode, "Category code");
    const categoryName = normalizeSetupName(input.categoryName, "Category name");
    const departmentCode = normalizeSetupCode(input.departmentCode, "Department code");
    const departmentName =
      optionalSetupText(input.departmentName) ?? departmentCode;

    await this.mergeRow("product_category_snapshot", ["category_code"], {
      id: `standalone-category-${categoryCode.toLowerCase()}`,
      category_code: categoryCode,
      category_name: categoryName,
      department_code: departmentCode,
      department_name: departmentName,
      description: optionalSetupText(input.description),
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      sort_order: Math.trunc(normalizeSetupNumber(input.sortOrder, 0, 0)),
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(
      `${categoryName} was saved in standalone categories.`,
      timestamp,
    );
  }

  async saveStandaloneUnitOfMeasure(
    input: StoreStandaloneUnitInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const uomCode = normalizeSetupCode(input.uomCode, "Unit code");
    const uomName = normalizeSetupName(input.uomName, "Unit name");

    await this.mergeRow("unit_of_measure_snapshot", ["uom_code"], {
      id: `standalone-uom-${uomCode.toLowerCase()}`,
      uom_code: uomCode,
      uom_name: uomName,
      description: optionalSetupText(input.description),
      decimal_precision: Math.trunc(normalizeSetupNumber(input.decimalPrecision, 0, 0)),
      allow_fractional_sale: input.allowFractionalSale ? 1 : 0,
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${uomName} was saved.`, timestamp);
  }

  async saveStandaloneTaxProfile(
    input: StoreStandaloneTaxProfileInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const taxProfileCode = normalizeSetupCode(input.taxProfileCode, "Tax code");
    const taxProfileName = normalizeSetupName(input.taxProfileName, "Tax name");

    await this.mergeRow("tax_profile_snapshot", ["tax_profile_code"], {
      id: `standalone-tax-${taxProfileCode.toLowerCase()}`,
      tax_profile_code: taxProfileCode,
      tax_profile_name: taxProfileName,
      description: optionalSetupText(input.description),
      rate_percent: normalizeSetupNumber(input.ratePercent, 0, 4),
      is_default: input.isDefault ? 1 : 0,
      is_tax_inclusive: input.isTaxInclusive ? 1 : 0,
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${taxProfileName} was saved.`, timestamp);
  }

  async saveStandaloneTenderMethod(
    input: StoreStandaloneTenderInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const tenderMethodCode = normalizeSetupCode(input.tenderMethodCode, "Tender code");
    const tenderMethodName = normalizeSetupName(input.tenderMethodName, "Tender name");

    await this.mergeRow("tender_method_snapshot", ["tender_method_code"], {
      id: `standalone-tender-${tenderMethodCode.toLowerCase()}`,
      tender_method_code: tenderMethodCode,
      tender_method_name: tenderMethodName,
      payment_method: optionalSetupText(input.paymentMethod)?.toUpperCase() ?? "CASH",
      gateway_provider: null,
      gateway_mode: null,
      gateway_merchant_id: null,
      gateway_public_key: null,
      gateway_callback_url: null,
      gateway_active: 0,
      gateway_status: "DISABLED",
      description: optionalSetupText(input.description),
      requires_reference: input.requiresReference ? 1 : 0,
      allow_change: input.allowChange ? 1 : 0,
      allow_refund: input.allowRefund === false ? 0 : 1,
      allow_open_cash_drawer: input.allowOpenCashDrawer ? 1 : 0,
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      sort_order: Math.trunc(normalizeSetupNumber(input.sortOrder, 0, 0)),
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${tenderMethodName} was saved.`, timestamp);
  }

  async saveStandaloneLocation(
    input: StoreStandaloneLocationInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const locationCode = normalizeSetupCode(input.locationCode, "Location code");
    const locationName = normalizeSetupName(input.locationName, "Location name");

    await this.mergeRow("inventory_location_snapshot", ["location_code"], {
      id: `standalone-location-${locationCode.toLowerCase()}`,
      location_code: locationCode,
      location_name: locationName,
      location_type: optionalSetupText(input.locationType)?.toUpperCase() ?? "STORE",
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      defaults: optionalSetupText(input.defaults) ?? "",
      is_sales_default: input.useForSalesDefault ? 1 : 0,
      is_sales_order_default: input.useForSalesOrderDefault ? 1 : 0,
      is_receiving_default: input.useForReceivingDefault ? 1 : 0,
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${locationName} was saved.`, timestamp);
  }

  async saveStandaloneBankAccount(
    input: StoreStandaloneBankAccountInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const bankCode = normalizeSetupCode(input.bankCode, "Bank code");
    const bankName = normalizeSetupName(input.bankName, "Bank name");
    const branchCode = optionalSetupText(input.branchCode)?.toUpperCase() ?? "MAIN";
    const branchName = optionalSetupText(input.branchName) ?? "Main branch";
    const accountNumber = normalizeSetupName(input.accountNumber, "Account number");
    const accountName = normalizeSetupName(input.accountName, "Account name");
    const bankAccountId =
      optionalSetupText(input.bankAccountId) ??
      `standalone-bank-${bankCode.toLowerCase()}-${accountNumber.toLowerCase()}`;

    await this.mergeRow("bank_account_snapshot", ["id"], {
      id: bankAccountId,
      bank_code: bankCode,
      bank_name: bankName,
      branch_code: branchCode,
      branch_name: branchName,
      account_number: accountNumber,
      account_name: accountName,
      currency_code: optionalSetupText(input.currencyCode)?.toUpperCase() ?? "GHS",
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${accountName} was saved.`, timestamp);
  }

  async saveStandaloneSupplier(
    input: StoreStandaloneSupplierInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const supplierNo = normalizeSetupCode(input.supplierNo, "Supplier number");
    const supplierName = normalizeSetupName(input.supplierName, "Supplier name");

    await this.mergeRow("supplier_snapshot", ["supplier_no"], {
      supplier_no: supplierNo,
      supplier_name: supplierName,
      phone: optionalSetupText(input.phone),
      email: optionalSetupText(input.email),
      tax_number: optionalSetupText(input.taxNumber),
      address_line1: optionalSetupText(input.addressLine1),
      city: optionalSetupText(input.city),
      country_code: optionalSetupText(input.countryCode)?.toUpperCase() ?? null,
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${supplierName} was saved.`, timestamp);
  }

  async saveStandalonePriceListEntry(
    input: StoreStandalonePriceInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const productCode = normalizeSetupCode(input.productCode, "Product code");
    const priceListCode = optionalSetupText(input.priceListCode) ?? "default-sell";
    const priceListName = optionalSetupText(input.priceListName) ?? "Default selling price";

    await this.mergeRow(
      "price_list_entry_snapshot",
      ["price_list_code", "product_code"],
      {
        id: `standalone-price-${priceListCode.toLowerCase()}-${productCode.toLowerCase()}`,
        price_list_code: priceListCode,
        price_list_name: priceListName,
        currency_code: optionalSetupText(input.currencyCode)?.toUpperCase() ?? "GHS",
        is_default: input.isDefault ? 1 : 0,
        customer_type: optionalSetupText(input.customerType)?.toUpperCase() ?? null,
        loyalty_tier: optionalSetupText(input.loyaltyTier)?.toUpperCase() ?? null,
        product_code: productCode,
        unit_price: normalizeSetupNumber(input.unitPrice, 0, 4),
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        updated_at: timestamp,
      },
    );

    return this.finishStandaloneSetupWrite(
      `${priceListName} was saved for ${productCode}.`,
      timestamp,
    );
  }

  async saveStandalonePromotion(
    input: StoreStandalonePromotionInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const promotionCode = normalizeSetupCode(input.promotionCode, "Promotion code");
    const promotionName = normalizeSetupName(input.promotionName, "Promotion name");

    await this.mergeRow("promotion_snapshot", ["promotion_code"], {
      id: `standalone-promotion-${promotionCode.toLowerCase()}`,
      promotion_code: promotionCode,
      promotion_name: promotionName,
      description: optionalSetupText(input.description),
      discount_type: optionalSetupText(input.discountType)?.toUpperCase() ?? "PERCENT_OFF",
      target_scope: optionalSetupText(input.targetScope)?.toUpperCase() ?? "ALL_ITEMS",
      discount_value: normalizeSetupNumber(input.discountValue, 0, 4),
      minimum_basket_amount: input.minimumBasketAmount == null ? null : normalizeSetupNumber(input.minimumBasketAmount, 0, 4),
      minimum_line_quantity: input.minimumLineQuantity == null ? null : normalizeSetupNumber(input.minimumLineQuantity, 0, 3),
      buy_quantity: input.buyQuantity == null ? null : normalizeSetupNumber(input.buyQuantity, 0, 3),
      reward_quantity: input.rewardQuantity == null ? null : normalizeSetupNumber(input.rewardQuantity, 0, 3),
      target_department_code: optionalSetupText(input.targetDepartmentCode)?.toUpperCase() ?? null,
      target_category_code: optionalSetupText(input.targetCategoryCode)?.toUpperCase() ?? null,
      target_product_code: optionalSetupText(input.targetProductCode)?.toUpperCase() ?? null,
      eligible_store_codes_json: writeStringArray([await this.getStoreCode()]),
      eligible_customer_types_json: writeStringArray(input.eligibleCustomerTypes ?? []),
      eligible_loyalty_tiers_json: writeStringArray(input.eligibleLoyaltyTiers ?? []),
      active_days_of_week_json: writeStringArray(input.activeDaysOfWeek ?? []),
      active_from_minutes: input.activeFromMinutes ?? null,
      active_to_minutes: input.activeToMinutes ?? null,
      coupon_required: input.couponRequired ? 1 : 0,
      coupon_code: optionalSetupText(input.couponCode)?.toUpperCase() ?? null,
      allow_with_loyalty: input.allowWithLoyalty === false ? 0 : 1,
      apply_once_per_basket: input.applyOncePerBasket ? 1 : 0,
      priority: Math.trunc(normalizeSetupNumber(input.priority, 0, 0)),
      start_at: optionalSetupText(input.startAt),
      end_at: optionalSetupText(input.endAt),
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${promotionName} was saved.`, timestamp);
  }

  async saveStandaloneProduct(
    input: StoreStandaloneProductInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const productCode = normalizeSetupCode(input.productCode, "Product code");
    const productName = normalizeSetupName(input.productName, "Product name");
    const quantityOnHand =
      input.trackInventory === false
        ? 0
        : normalizeSetupNumber(input.quantityOnHand, 0, 3);

    await this.mergeRow("product_snapshot", ["product_code"], {
      id: `standalone-product-${productCode.toLowerCase()}`,
      product_code: productCode,
      product_name: productName,
      short_name: optionalSetupText(input.shortName),
      description: optionalSetupText(input.description),
      primary_image_url: optionalSetupText(input.primaryImageUrl),
      department_code: optionalSetupText(input.departmentCode)?.toUpperCase() ?? null,
      category_code: optionalSetupText(input.categoryCode)?.toUpperCase() ?? null,
      subcategory: optionalSetupText(input.subcategory),
      unit_of_measure: optionalSetupText(input.unitOfMeasure)?.toUpperCase() ?? "EA",
      taxable: input.taxable === false ? 0 : 1,
      tax_profile_code: optionalSetupText(input.taxProfileCode)?.toUpperCase() ?? null,
      tax_profile_name: null,
      tax_rate_percent: null,
      tax_inclusive: 0,
      track_inventory: input.trackInventory === false ? 0 : 1,
      is_serialized: input.isSerialized ? 1 : 0,
      must_enter_price_at_pos: input.mustEnterPriceAtPos ? 1 : 0,
      min_stock_level: input.minStockLevel == null ? null : normalizeSetupNumber(input.minStockLevel, 0, 3),
      reorder_point: input.reorderPoint == null ? null : normalizeSetupNumber(input.reorderPoint, 0, 3),
      safety_stock_level: input.safetyStockLevel == null ? null : normalizeSetupNumber(input.safetyStockLevel, 0, 3),
      catalog_membership_active: 1,
      catalog_sort_order: input.catalogSortOrder == null ? null : Math.trunc(normalizeSetupNumber(input.catalogSortOrder, 0, 0)),
      unit_price: normalizeSetupNumber(input.unitPrice, 0, 4),
      quantity_on_hand: quantityOnHand,
      updated_at: timestamp,
    });

    const barcode = optionalSetupText(input.barcode);
    if (barcode) {
      await this.mergeRow("barcode_snapshot", ["barcode_code"], {
        id: `standalone-barcode-${barcode.toLowerCase()}`,
        barcode_code: barcode,
        product_code: productCode,
        barcode_type: "LOCAL",
        updated_at: timestamp,
      });
    }

    return this.finishStandaloneSetupWrite(`${productName} was saved.`, timestamp);
  }

  async saveStandalonePasswordPolicy(
    input: StoreStandalonePasswordPolicyInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const entries: Array<[string, string]> = [];

    if (input.minimumLength != null) entries.push(["password_policy_minimum_length", String(Math.trunc(input.minimumLength))]);
    if (typeof input.requireUppercase === "boolean") entries.push(["password_policy_require_uppercase", input.requireUppercase ? "1" : "0"]);
    if (typeof input.requireLowercase === "boolean") entries.push(["password_policy_require_lowercase", input.requireLowercase ? "1" : "0"]);
    if (typeof input.requireNumber === "boolean") entries.push(["password_policy_require_number", input.requireNumber ? "1" : "0"]);
    if (typeof input.requireSymbol === "boolean") entries.push(["password_policy_require_symbol", input.requireSymbol ? "1" : "0"]);
    if (typeof input.temporaryPasswordMustChange === "boolean") entries.push(["password_policy_temporary_must_change", input.temporaryPasswordMustChange ? "1" : "0"]);
    if (input.passwordExpiryDays != null) entries.push(["password_policy_expiry_days", String(Math.trunc(input.passwordExpiryDays))]);
    if (input.passwordHistoryCount != null) entries.push(["password_policy_history_count", String(Math.trunc(input.passwordHistoryCount))]);
    if (input.lockoutThreshold != null) entries.push(["password_policy_lockout_threshold", String(Math.trunc(input.lockoutThreshold))]);
    if (input.lockoutMinutes != null) entries.push(["password_policy_lockout_minutes", String(Math.trunc(input.lockoutMinutes))]);

    await this.withTransaction(async (transaction) => {
      for (const [key, value] of entries) {
        await this.setMetadata(key, value, transaction);
      }
      await this.setMetadata("password_policy_updated_at", timestamp, transaction);
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    return this.finishStandaloneSetupWrite(
      "Standalone password policy was saved.",
      timestamp,
    );
  }

  async saveStandaloneRole(
    input: StoreStandaloneRoleInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const roleName = normalizeSetupName(input.roleName, "Role name");
    const roleCode =
      optionalSetupText(input.roleCode)?.toUpperCase() ??
      roleName.toUpperCase().replace(/[^A-Z0-9]+/g, "-");

    await this.mergeRow("role_snapshot", ["role_code"], {
      id: `standalone-role-${roleCode.toLowerCase()}`,
      role_code: roleCode,
      role_name: roleName,
      description: optionalSetupText(input.description),
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      permission_codes_json: writeStringArray(standalonePermissionCodes(input)),
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${roleName} was saved.`, timestamp);
  }

  async saveStandaloneUser(
    input: StoreStandaloneUserInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    const countResult = await this.query<{ value: string | number }>(
      "SELECT COUNT(*) AS [value] FROM [dbo].[retail_user_snapshot]",
    );
    if (asNumber(countResult.recordset[0]?.value) > 0) {
      await this.requireStandaloneSupervisor();
    }

    const timestamp = isoNow();
    const loginId = normalizeSetupCode(input.loginId, "Login ID");
    const displayName = normalizeSetupName(input.displayName, "Display name");
    const roleName = optionalSetupText(input.roleName) ?? "Standalone operator";
    const roleCode =
      optionalSetupText(input.roleCode)?.toUpperCase() ??
      roleName.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
    const permissionCodes = standalonePermissionCodes(input);
    const password = optionalSetupText(input.password);
    const existingResult = await this.query<RetailUserRow>(
      `SELECT TOP (1)
        [id], [login_id], [email], [display_name], [account_status],
        [home_store_code], [home_store_name], [role_codes_json],
        [role_names_json], [permission_codes_json], [password_hash],
        [updated_at]
       FROM [dbo].[retail_user_snapshot]
       WHERE [login_id] = @loginId`,
      { loginId },
    );
    const existing = existingResult.recordset[0] ?? null;

    if (!existing && !password) {
      throw new Error("Password is required when creating a standalone user.");
    }

    await this.mergeRow("retail_user_snapshot", ["login_id"], {
      id: existing?.id ?? `standalone-user-${loginId.toLowerCase()}`,
      login_id: loginId,
      email: optionalSetupText(input.email),
      display_name: displayName,
      account_status: optionalSetupText(input.accountStatus)?.toUpperCase() ?? "ACTIVE",
      home_store_code: await this.getStoreCode(),
      home_store_name: (await this.metadata()).store_name ?? defaultStoreConfig.storeName,
      role_codes_json: writeStringArray([roleCode]),
      role_names_json: writeStringArray([roleName]),
      permission_codes_json: writeStringArray(permissionCodes),
      password_hash: password ? bcrypt.hashSync(password, 10) : existing?.password_hash ?? null,
      password_updated_at: password ? timestamp : null,
      cashier_eligible: input.cashierEligible === false ? 0 : 1,
      supervisor_eligible: input.supervisorEligible ? 1 : 0,
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${displayName} was saved.`, timestamp);
  }

  async saveStandaloneCustomer(
    input: StoreStandaloneCustomerInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const customerNo = normalizeSetupCode(input.customerNo, "Customer number");
    const fullName = normalizeSetupName(input.fullName, "Customer name");

    await this.mergeRow("customer", ["customer_no"], {
      id: `standalone-customer-${customerNo.toLowerCase()}`,
      customer_no: customerNo,
      full_name: fullName,
      customer_type: optionalSetupText(input.customerType)?.toUpperCase() ?? "RETAIL",
      phone: optionalSetupText(input.phone),
      email: optionalSetupText(input.email),
      home_store_code: await this.getStoreCode(),
      home_store_name: (await this.metadata()).store_name ?? defaultStoreConfig.storeName,
      address_line1: optionalSetupText(input.addressLine1),
      city: optionalSetupText(input.city),
      country_code: optionalSetupText(input.countryCode)?.toUpperCase() ?? null,
      loyalty_enrolled: input.loyaltyEnrolled ? 1 : 0,
      loyalty_tier: optionalSetupText(input.loyaltyTier)?.toUpperCase() ?? null,
      loyalty_points_balance: Math.trunc(normalizeSetupNumber(input.loyaltyPointsBalance, 0, 0)),
      allow_credit_sales: input.allowCreditSales ? 1 : 0,
      credit_limit_amount: input.creditLimitAmount == null ? null : normalizeSetupNumber(input.creditLimitAmount, 0, 4),
      receivable_balance_amount: normalizeSetupNumber(input.receivableBalanceAmount, 0, 4),
      note: optionalSetupText(input.note),
      status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
      record_version: 1,
      deleted_at: null,
      updated_at: timestamp,
    });

    return this.finishStandaloneSetupWrite(`${fullName} was saved.`, timestamp);
  }

  async saveStandalonePurchaseOrder(
    input: StoreStandalonePurchaseOrderInput,
  ): Promise<StoreStandaloneSetupResult> {
    this.requireStandaloneSetupMode();
    const session = await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const inventoryLocationCode =
      optionalSetupText(input.inventoryLocationCode)?.toUpperCase() ??
      (await this.getDefaultReceivingLocationCode()) ??
      (await this.getDefaultSalesLocationCode());

    if (!inventoryLocationCode) {
      throw new Error("Create a receiving inventory location before saving a purchase order.");
    }

    const locationResult = await this.query<{ location_name: string }>(
      `SELECT TOP (1) [location_name]
       FROM [dbo].[inventory_location_snapshot]
       WHERE [location_code] = @inventoryLocationCode`,
      { inventoryLocationCode },
    );
    const locationName = locationResult.recordset[0]?.location_name ?? inventoryLocationCode;
    const supplierNo = optionalSetupText(input.supplierNo)?.toUpperCase() ?? null;
    const supplierResult = supplierNo
      ? await this.query<{ supplier_name: string }>(
          `SELECT TOP (1) [supplier_name]
           FROM [dbo].[supplier_snapshot]
           WHERE [supplier_no] = @supplierNo`,
          { supplierNo },
        )
      : null;
    const supplierName = supplierResult?.recordset[0]?.supplier_name ?? null;
    const lines = input.lines ?? [];

    if (lines.length === 0) {
      throw new Error("Add at least one purchase-order line before saving it.");
    }

    const purchaseOrderId = randomUUID();
    const purchaseOrderNo =
      optionalSetupText(input.purchaseOrderNo)?.toUpperCase() ??
      buildLocalDocumentNo(
        "PO",
        storeCode,
        await this.nextSequence("purchase_order_sequence"),
        timestamp,
      );
    const normalizedLines: Array<{
      id: string;
      lineNo: number;
      product: CatalogLookupRow;
      orderedQuantity: number;
      unitCost: number | null;
    }> = [];
    let orderedQuantity = 0;

    for (const [index, line] of lines.entries()) {
      const productCode = normalizeSetupCode(line.productCode, "Product code");
      const product = await this.findCatalogLookup(productCode);
      if (!product) {
        throw new Error(`Flash ERP could not find local product "${productCode}".`);
      }
      const lineQuantity = normalizeSetupNumber(line.orderedQuantity, 0, 3);
      if (lineQuantity <= 0) {
        throw new Error(`Enter an ordered quantity greater than zero for ${product.product_name}.`);
      }
      orderedQuantity = Number((orderedQuantity + lineQuantity).toFixed(3));
      normalizedLines.push({
        id: randomUUID(),
        lineNo: index + 1,
        product,
        orderedQuantity: lineQuantity,
        unitCost:
          line.unitCost == null ? null : normalizeSetupNumber(line.unitCost, 0, 4),
      });
    }

    await this.withTransaction(async (transaction) => {
      await this.query(
        `INSERT INTO [dbo].[purchase_order_snapshot] (
          [id], [purchase_order_no], [status], [inventory_location_code],
          [inventory_location_name], [supplier_no], [supplier_name],
          [external_reference], [note], [operator_name], [ordered_quantity],
          [received_quantity], [exception_quantity], [outstanding_quantity],
          [committed_at], [closed_at], [closure_reason], [closure_note],
          [closure_operator_name], [updated_at]
        ) VALUES (
          @purchaseOrderId, @purchaseOrderNo, N'COMMITTED',
          @inventoryLocationCode, @inventoryLocationName, @supplierNo,
          @supplierName, @externalReference, @note, @operatorName,
          @orderedQuantity, 0, 0, @orderedQuantity, @timestamp,
          NULL, NULL, NULL, NULL, @timestamp
        )`,
        {
          purchaseOrderId,
          purchaseOrderNo,
          inventoryLocationCode,
          inventoryLocationName: locationName,
          supplierNo,
          supplierName,
          externalReference: optionalSetupText(input.externalReference),
          note: optionalSetupText(input.note),
          operatorName:
            optionalSetupText(input.operatorName) ??
            this.formatOperatorLabel(session),
          orderedQuantity,
          timestamp,
        },
        transaction,
      );

      for (const line of normalizedLines) {
        await this.query(
          `INSERT INTO [dbo].[purchase_order_line_snapshot] (
            [id], [purchase_order_id], [line_no], [product_code],
            [product_name], [department_code], [category_code], [subcategory],
            [is_serialized], [ordered_quantity], [received_quantity],
            [exception_quantity], [outstanding_quantity], [unit_cost],
            [updated_at]
          ) VALUES (
            @lineId, @purchaseOrderId, @lineNo, @productCode, @productName,
            @departmentCode, @categoryCode, @subcategory, @isSerialized,
            @orderedQuantity, 0, 0, @orderedQuantity, @unitCost, @timestamp
          )`,
          {
            lineId: line.id,
            purchaseOrderId,
            lineNo: line.lineNo,
            productCode: line.product.product_code,
            productName: line.product.product_name,
            departmentCode: line.product.department_code,
            categoryCode: line.product.category_code,
            subcategory: line.product.subcategory,
            isSerialized: asBooleanFlag(line.product.is_serialized) ? 1 : 0,
            orderedQuantity: line.orderedQuantity,
            unitCost: line.unitCost,
            timestamp,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    return this.finishStandaloneSetupWrite(
      `${purchaseOrderNo} was saved as a standalone purchase order.`,
      timestamp,
    );
  }

  private async getStockCountSessionRow(sessionId: string) {
    const result = await this.query<StockCountSessionRow>(
      `SELECT TOP (1)
        session.[id],
        session.[session_no],
        session.[status],
        session.[inventory_location_code],
        session.[inventory_location_name],
        session.[product_code],
        session.[product_name],
        session.[department_code],
        department.[department_name],
        session.[category_code],
        category.[category_name],
        session.[subcategory],
        session.[is_serialized],
        session.[previous_quantity],
        session.[counted_quantity],
        session.[variance_quantity],
        session.[previous_serial_numbers_json],
        session.[counted_serial_numbers_json],
        session.[note],
        session.[operator_name],
        session.[submitted_at],
        session.[committed_at],
        session.[updated_at]
       FROM [dbo].[stock_count_session] AS session
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = session.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = session.[category_code]
       WHERE session.[id] = @sessionId`,
      { sessionId },
    );

    return result.recordset[0] ?? null;
  }

  private async getStockCountSessionSummaries(): Promise<
    StoreStockCountSessionSummary[]
  > {
    const result = await this.query<StockCountSessionRow>(
      `SELECT TOP (24)
        session.[id],
        session.[session_no],
        session.[status],
        session.[inventory_location_code],
        session.[inventory_location_name],
        session.[product_code],
        session.[product_name],
        session.[department_code],
        department.[department_name],
        session.[category_code],
        category.[category_name],
        session.[subcategory],
        session.[is_serialized],
        session.[previous_quantity],
        session.[counted_quantity],
        session.[variance_quantity],
        session.[previous_serial_numbers_json],
        session.[counted_serial_numbers_json],
        session.[note],
        session.[operator_name],
        session.[submitted_at],
        session.[committed_at],
        session.[updated_at]
       FROM [dbo].[stock_count_session] AS session
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = session.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = session.[category_code]
       ORDER BY
        CASE session.[status] WHEN N'DRAFT' THEN 0 WHEN N'SUBMITTED' THEN 1 ELSE 2 END,
        session.[updated_at] DESC`,
    );

    return result.recordset.map((row) => ({
      sessionId: row.id,
      sessionNo: row.session_no,
      status: row.status,
      inventoryLocationCode: row.inventory_location_code,
      inventoryLocationName: row.inventory_location_name,
      productCode: row.product_code,
      productName: row.product_name,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      subcategory: row.subcategory,
      isSerialized: asBooleanFlag(row.is_serialized),
      previousQuantity: Number(asNumber(row.previous_quantity).toFixed(3)),
      countedQuantity: Number(asNumber(row.counted_quantity).toFixed(3)),
      varianceQuantity: Number(asNumber(row.variance_quantity).toFixed(3)),
      previousSerialNumbers: readSerializedLineNumbers(
        row.previous_serial_numbers_json,
      ),
      countedSerialNumbers: readSerializedLineNumbers(
        row.counted_serial_numbers_json,
      ),
      operatorName: row.operator_name,
      note: row.note,
      submittedAt: row.submitted_at,
      committedAt: row.committed_at,
      updatedAt: row.updated_at,
    }));
  }

  async saveStockCountSessionDraft(
    input: StoreStockCountSessionDraftInput,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.count.submit"],
      purpose: "saving a stock count session",
    });
    const locationCode = input.inventoryLocationCode.trim().toUpperCase();
    const productCode = input.productCode.trim().toUpperCase();
    const requestedCountedQuantity = Number(
      Number(input.countedQuantity).toFixed(3),
    );

    if (!locationCode || !productCode) {
      throw new Error(
        "Choose a location and product before saving the local stock count.",
      );
    }

    if (
      !Number.isFinite(requestedCountedQuantity) ||
      requestedCountedQuantity < 0
    ) {
      throw new Error(
        "Enter a counted quantity of zero or greater before saving the stock count.",
      );
    }

    const [metadata, locationResult, product] = await Promise.all([
      this.metadata(),
      this.query<{ location_code: string; location_name: string }>(
        `SELECT TOP (1) [location_code], [location_name]
         FROM [dbo].[inventory_location_snapshot]
         WHERE [location_code] = @locationCode`,
        { locationCode },
      ),
      this.findCatalogLookup(productCode),
    ]);
    const location = locationResult.recordset[0] ?? null;

    if (!location) {
      throw new Error(
        `Flash ERP could not find local inventory location "${locationCode}".`,
      );
    }

    if (!product) {
      throw new Error(
        `Flash ERP could not find local product "${productCode}".`,
      );
    }

    if (!asBooleanFlag(product.track_inventory)) {
      throw new Error(
        `${product.product_name} is not configured for tracked inventory, so it cannot be counted into stock posture.`,
      );
    }

    const countedSerialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const previousQuantity = await this.getLocationQuantity(
      location.location_code,
      product.product_code,
    );
    const previousSerialNumbers = asBooleanFlag(product.is_serialized)
      ? await this.listAvailableRegistrySerialNumbers(
          product.product_code,
          location.location_code,
        )
      : [];
    const countedQuantity = asBooleanFlag(product.is_serialized)
      ? countedSerialNumbers.length
      : requestedCountedQuantity;

    if (asBooleanFlag(product.is_serialized)) {
      validateSerializedLineInput({
        isSerialized: true,
        productName: product.product_name,
        quantity: countedQuantity,
        serialNumbers: countedSerialNumbers,
      });
    } else if (countedSerialNumbers.length > 0) {
      throw new Error(
        `${product.product_name} is not serialized, so this stock count cannot include serials.`,
      );
    }

    const timestamp = isoNow();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const sessionId = randomUUID();
    const sessionNo = buildLocalDocumentNo(
      "CNT",
      storeCode,
      await this.nextSequence("stock_count_session_sequence"),
      timestamp,
    );
    const operatorName =
      input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);
    const note = input.note?.trim() || null;
    const varianceQuantity = Number(
      (countedQuantity - previousQuantity).toFixed(3),
    );

    await this.query(
      `INSERT INTO [dbo].[stock_count_session] (
        [id],
        [session_no],
        [status],
        [inventory_location_code],
        [inventory_location_name],
        [product_code],
        [product_name],
        [department_code],
        [category_code],
        [subcategory],
        [is_serialized],
        [previous_quantity],
        [counted_quantity],
        [variance_quantity],
        [previous_serial_numbers_json],
        [counted_serial_numbers_json],
        [note],
        [operator_name],
        [submitted_at],
        [committed_at],
        [updated_at]
      ) VALUES (
        @sessionId,
        @sessionNo,
        N'DRAFT',
        @locationCode,
        @locationName,
        @productCode,
        @productName,
        @departmentCode,
        @categoryCode,
        @subcategory,
        @isSerialized,
        @previousQuantity,
        @countedQuantity,
        @varianceQuantity,
        @previousSerialNumbersJson,
        @countedSerialNumbersJson,
        @note,
        @operatorName,
        NULL,
        NULL,
        @timestamp
      )`,
      {
        sessionId,
        sessionNo,
        locationCode: location.location_code,
        locationName: location.location_name,
        productCode: product.product_code,
        productName: product.product_name,
        departmentCode: product.department_code,
        categoryCode: product.category_code,
        subcategory: product.subcategory,
        isSerialized: asBooleanFlag(product.is_serialized) ? 1 : 0,
        previousQuantity,
        countedQuantity,
        varianceQuantity,
        previousSerialNumbersJson:
          writeSerializedLineNumbers(previousSerialNumbers),
        countedSerialNumbersJson:
          writeSerializedLineNumbers(countedSerialNumbers),
        note,
        operatorName,
        timestamp,
      },
    );
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${sessionNo} was saved locally as a SQL Server stock count session.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${sessionNo} was saved locally. Submit it when the count is ready for enterprise visibility.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async submitStockCountSession(
    sessionId: string,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.count.submit"],
      purpose: "submitting a stock count session",
    });
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new Error(
        "Select a saved stock count session before submitting it.",
      );
    }

    const session = await this.getStockCountSessionRow(normalizedSessionId);

    if (!session) {
      throw new Error(
        "Flash ERP could not find that stock count session in SQL Server.",
      );
    }

    if (session.status !== "DRAFT") {
      throw new Error(
        `${session.session_no} has already been submitted or committed locally.`,
      );
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const payload: StoreStockCountSessionSubmittedPayload = {
      sessionId: session.id,
      sessionNo: session.session_no,
      storeCode,
      terminalCode,
      inventoryLocationCode: session.inventory_location_code,
      productCode: session.product_code,
      previousQuantity: Number(asNumber(session.previous_quantity).toFixed(3)),
      countedQuantity: Number(asNumber(session.counted_quantity).toFixed(3)),
      varianceQuantity: Number(asNumber(session.variance_quantity).toFixed(3)),
      previousSerialNumbers: readSerializedLineNumbers(
        session.previous_serial_numbers_json,
      ),
      countedSerialNumbers: readSerializedLineNumbers(
        session.counted_serial_numbers_json,
      ),
      operatorName: session.operator_name,
      note: session.note,
      submittedAt: timestamp,
    };

    await this.withTransaction(async (transaction) => {
      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "stockCountSession",
            aggregateId: session.id,
            eventType: "stock-count-session.submitted",
            idempotencyKey: `${nodeCode}:stockCountSession:${session.id}:submitted:${timestamp}`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.query(
        `UPDATE [dbo].[stock_count_session]
         SET [status] = N'SUBMITTED',
             [submitted_at] = @timestamp,
             [updated_at] = @timestamp
         WHERE [id] = @sessionId`,
        { timestamp, sessionId: session.id },
        transaction,
      );
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${session.session_no} was submitted as a SQL Server stock count session.`
        : `${session.session_no} was submitted locally for standalone stock-count review.`,
      upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: shouldQueueEnterprise
        ? `${session.session_no} was submitted and queued for enterprise visibility.`
        : `${session.session_no} was submitted locally for standalone stock-count review.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async commitStockCountSession(
    sessionId: string,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.count.commit"],
      purpose: "committing a stock count session",
    });
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new Error(
        "Select a submitted stock count session before committing it locally.",
      );
    }

    let message = "";

    await this.withTransaction(async (transaction) => {
      const session = await this.getStockCountSessionRow(normalizedSessionId);

      if (!session) {
        throw new Error(
          "Flash ERP could not find that stock count session in SQL Server.",
        );
      }

      if (session.status === "COMMITTED") {
        throw new Error(
          `${session.session_no} has already been committed locally.`,
        );
      }

      if (session.status !== "SUBMITTED") {
        throw new Error(
          `${session.session_no} must be submitted before it can be committed.`,
        );
      }

      const currentLocationQuantity = await this.getLocationQuantity(
        session.inventory_location_code,
        session.product_code,
        transaction,
      );
      const expectedPreviousQuantity = Number(
        asNumber(session.previous_quantity).toFixed(3),
      );

      if (
        Math.abs(currentLocationQuantity - expectedPreviousQuantity) > 0.0001
      ) {
        throw new Error(
          `${session.session_no} can no longer be committed because local stock changed from ${expectedPreviousQuantity.toFixed(3)} to ${currentLocationQuantity.toFixed(3)} in ${session.inventory_location_code}.`,
        );
      }

      if (asBooleanFlag(session.is_serialized)) {
        const currentSerialNumbers =
          await this.listAvailableRegistrySerialNumbers(
            session.product_code,
            session.inventory_location_code,
            transaction,
          );
        const previousSerialNumbers = readSerializedLineNumbers(
          session.previous_serial_numbers_json,
        );

        if (
          !serialNumberSetsMatch(currentSerialNumbers, previousSerialNumbers)
        ) {
          throw new Error(
            `${session.session_no} can no longer be committed because the serialized stock posture changed in ${session.inventory_location_code}.`,
          );
        }
      }

      const timestamp = isoNow();
      const metadata = await this.metadata();
      const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
      const terminalCode = this.getTerminalCode();
      const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
      const shouldQueueEnterprise = !this.isStandaloneDeployment();
      const appliedCount = await this.applyLocalCountVariance({
        referenceId: session.id,
        referenceLabel: session.session_no,
        productCode: session.product_code,
        locationCode: session.inventory_location_code,
        countedQuantity: Number(asNumber(session.counted_quantity).toFixed(3)),
        countedSerialNumbers: readSerializedLineNumbers(
          session.counted_serial_numbers_json,
        ),
        updatedAt: timestamp,
        runner: transaction,
      });
      const ledgerEntryId = `inventory-count-session-${session.id}`;
      const payload: StoreInventoryLedgerRecordedPayload = {
        ledgerEntryId,
        storeCode,
        terminalCode,
        inventoryLocationCode: session.inventory_location_code,
        productCode: session.product_code,
        movementType: "COUNT_VARIANCE",
        quantity: appliedCount.varianceQuantity,
        ...(appliedCount.countedSerialNumbers.length > 0
          ? { serialNumbers: appliedCount.countedSerialNumbers }
          : {}),
        unitCost: null,
        referenceType: "STOCK_COUNT_SESSION",
        referenceId: session.id,
        externalReference: session.session_no,
        occurredAt: timestamp,
      };

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "inventoryLedgerEntry",
            aggregateId: ledgerEntryId,
            eventType: "inventory.ledger.recorded",
            idempotencyKey: `${nodeCode}:inventoryLedgerEntry:${ledgerEntryId}`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.query(
        `UPDATE [dbo].[stock_count_session]
         SET [status] = N'COMMITTED',
             [variance_quantity] = @varianceQuantity,
             [committed_at] = @timestamp,
             [updated_at] = @timestamp
         WHERE [id] = @sessionId`,
        {
          varianceQuantity: appliedCount.varianceQuantity,
          timestamp,
          sessionId: session.id,
        },
        transaction,
      );
      await this.setMetadata("last_local_write_at", timestamp, transaction);
      await this.insertRunLog({
        runKind: "LOCAL_WRITE",
        result: "SUCCESS",
        summary: shouldQueueEnterprise
          ? `${session.session_no} was committed locally and queued upstream as a SQL Server stock count variance.`
          : `${session.session_no} was committed locally as a standalone stock count variance.`,
        upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
        downstreamApplied: 0,
        startedAt: timestamp,
        finishedAt: timestamp,
      });
      message = shouldQueueEnterprise
        ? `${session.session_no} was committed locally and queued upstream as a count variance.`
        : `${session.session_no} was committed locally. Flash ERP updated the standalone stock posture.`;
    });

    return {
      message,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async browseStoreReports(
    input: StoreReportBrowseRequest,
  ): Promise<StoreReportResult> {
    const session = await this.requireActiveOperatorSession({
      purpose: "viewing local desktop reports",
    });
    const scope = input.scope === "STORE" ? "STORE" : "CASHIER";

    if (scope === "STORE" && !session.capabilities.supervisorEligible) {
      throw new Error(
        "Only a synced supervisor can view whole-store desktop reports.",
      );
    }

    const dateFrom = input.dateFrom?.trim()
      ? new Date(`${input.dateFrom.trim()}T00:00:00.000`).toISOString()
      : null;
    const dateTo = input.dateTo?.trim()
      ? new Date(`${input.dateTo.trim()}T23:59:59.999`).toISOString()
      : null;
    const cashierCode =
      scope === "CASHIER" ? session.loginId : input.cashierCode?.trim() || null;
    const shiftId = input.shiftId?.trim() || null;
    const customerQuery = input.customerQuery?.trim().toUpperCase() || null;
    const productQuery = input.productQuery?.trim().toUpperCase() || null;
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
    const salesWhere = ["txn.[status] = N'COMPLETED'"];
    const salesParams: Record<string, unknown> = { limit };

    if (dateFrom) {
      salesWhere.push("txn.[completed_at] >= @dateFrom");
      salesParams.dateFrom = dateFrom;
    }

    if (dateTo) {
      salesWhere.push("txn.[completed_at] <= @dateTo");
      salesParams.dateTo = dateTo;
    }

    if (cashierCode) {
      salesWhere.push("ISNULL(txn.[cashier_code], shift.[cashier_code]) = @cashierCode");
      salesParams.cashierCode = cashierCode;
    }

    if (shiftId) {
      salesWhere.push("txn.[shift_id] = @shiftId");
      salesParams.shiftId = shiftId;
    }

    if (customerQuery) {
      salesWhere.push(
        "(UPPER(ISNULL(customer.[customer_no], N'')) LIKE @customerQuery OR UPPER(ISNULL(customer.[full_name], N'')) LIKE @customerQuery)",
      );
      salesParams.customerQuery = `%${customerQuery}%`;
    }

    if (productQuery) {
      salesWhere.push(
        `EXISTS (
          SELECT 1
          FROM [dbo].[pos_transaction_line] AS line_filter
          WHERE line_filter.[pos_transaction_id] = txn.[id]
            AND (
              UPPER(line_filter.[product_code_snapshot]) LIKE @productQuery
              OR UPPER(line_filter.[product_name_snapshot]) LIKE @productQuery
            )
        )`,
      );
      salesParams.productQuery = `%${productQuery}%`;
    }

    const salesResult = await this.query<ReportSalesRow>(
      `SELECT TOP (@limit)
        txn.[transaction_no],
        txn.[transaction_type],
        txn.[source_transaction_no],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[completed_at],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        ISNULL(txn.[cashier_code], shift.[cashier_code]) AS [cashier_code],
        COUNT(line.[id]) AS [line_count],
        STRING_AGG(CAST(line.[product_name_snapshot] AS nvarchar(max)), N', ') AS [product_preview]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       LEFT JOIN [dbo].[pos_shift] AS shift
         ON shift.[id] = txn.[shift_id]
       LEFT JOIN [dbo].[pos_transaction_line] AS line
         ON line.[pos_transaction_id] = txn.[id]
       WHERE ${salesWhere.join(" AND ")}
       GROUP BY
        txn.[id],
        txn.[transaction_no],
        txn.[transaction_type],
        txn.[source_transaction_no],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[completed_at],
        customer.[customer_no],
        customer.[full_name],
        ISNULL(txn.[cashier_code], shift.[cashier_code])
       ORDER BY txn.[completed_at] DESC, txn.[transaction_no] DESC`,
      salesParams,
    );
    const tenderResult = await this.query<ReportTenderRow>(
      `SELECT
        [method],
        [tender_method_code],
        [tender_method_name],
        COUNT(*) AS [transaction_count],
        SUM([net_amount]) AS [net_amount]
       FROM (
        SELECT
          payment.[method],
          payment.[tender_method_code],
          payment.[tender_method_name],
          CASE
            WHEN txn.[transaction_type] = N'RETURN'
              OR (txn.[transaction_type] = N'EXCHANGE' AND ISNULL(txn.[total_amount], 0) < 0)
            THEN payment.[amount] * -1
            ELSE payment.[amount]
          END AS [net_amount]
        FROM [dbo].[pos_payment] AS payment
        INNER JOIN [dbo].[pos_transaction] AS txn
          ON txn.[id] = payment.[pos_transaction_id]
        LEFT JOIN [dbo].[customer] AS customer
          ON customer.[id] = txn.[customer_id]
        LEFT JOIN [dbo].[pos_shift] AS shift
          ON shift.[id] = txn.[shift_id]
        WHERE ${salesWhere.join(" AND ")}
       ) AS tender_source
       GROUP BY [method], [tender_method_code], [tender_method_name]
       ORDER BY SUM([net_amount]) DESC, [method] ASC`,
      salesParams,
    );

    const accountWhere = ["1 = 1"];
    const accountParams: Record<string, unknown> = { limit };

    if (dateFrom) {
      accountWhere.push("entry.[occurred_at] >= @dateFrom");
      accountParams.dateFrom = dateFrom;
    }

    if (dateTo) {
      accountWhere.push("entry.[occurred_at] <= @dateTo");
      accountParams.dateTo = dateTo;
    }

    if (cashierCode) {
      accountWhere.push("entry.[cashier_code] = @cashierCode");
      accountParams.cashierCode = cashierCode;
    }

    if (shiftId) {
      accountWhere.push("entry.[shift_id] = @shiftId");
      accountParams.shiftId = shiftId;
    }

    if (customerQuery) {
      accountWhere.push(
        "(UPPER(entry.[customer_no]) LIKE @customerQuery OR UPPER(entry.[customer_name]) LIKE @customerQuery)",
      );
      accountParams.customerQuery = `%${customerQuery}%`;
    }

    const accountPaymentResult = await this.query<ReportAccountPaymentRow>(
      `SELECT TOP (@limit)
        entry.[entry_no],
        entry.[occurred_at],
        entry.[cashier_code],
        entry.[customer_no],
        entry.[customer_name],
        entry.[payment_method],
        entry.[tender_method_code],
        entry.[tender_method_name],
        entry.[amount],
        entry.[reference]
       FROM [dbo].[customer_account_entry] AS entry
       WHERE ${accountWhere.join(" AND ")}
       ORDER BY entry.[occurred_at] DESC, entry.[entry_no] DESC`,
      accountParams,
    );
    const productResult = await this.query<ReportProductRow>(
      `SELECT TOP (@limit)
        line.[product_code_snapshot] AS [product_code],
        line.[product_name_snapshot] AS [product_name],
        SUM(CASE WHEN line.[line_intent] = N'RETURN' THEN line.[quantity] * -1 ELSE line.[quantity] END) AS [quantity],
        SUM(CASE WHEN line.[line_intent] = N'RETURN' THEN line.[unit_price] * line.[quantity] * -1 ELSE line.[unit_price] * line.[quantity] END) AS [gross_amount],
        SUM(CASE WHEN line.[line_intent] = N'RETURN' THEN line.[discount_amount] * -1 ELSE line.[discount_amount] END) AS [discount_amount],
        SUM(CASE WHEN line.[line_intent] = N'RETURN' THEN line.[tax_amount] * -1 ELSE line.[tax_amount] END) AS [tax_amount],
        SUM(CASE WHEN line.[line_intent] = N'RETURN' THEN line.[line_total] * -1 ELSE line.[line_total] END) AS [net_amount]
       FROM [dbo].[pos_transaction_line] AS line
       INNER JOIN [dbo].[pos_transaction] AS txn
         ON txn.[id] = line.[pos_transaction_id]
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       LEFT JOIN [dbo].[pos_shift] AS shift
         ON shift.[id] = txn.[shift_id]
       WHERE ${salesWhere.join(" AND ")}
       GROUP BY line.[product_code_snapshot], line.[product_name_snapshot]
       ORDER BY ABS(SUM(CASE WHEN line.[line_intent] = N'RETURN' THEN line.[line_total] * -1 ELSE line.[line_total] END)) DESC,
        line.[product_name_snapshot] ASC`,
      salesParams,
    );

    const shiftWhere = ["1 = 1"];
    const shiftParams: Record<string, unknown> = { limit };

    if (dateFrom) {
      shiftWhere.push("(shift.[opened_at] >= @dateFrom OR shift.[closed_at] >= @dateFrom)");
      shiftParams.dateFrom = dateFrom;
    }

    if (dateTo) {
      shiftWhere.push("(shift.[opened_at] <= @dateTo OR shift.[closed_at] <= @dateTo)");
      shiftParams.dateTo = dateTo;
    }

    if (cashierCode) {
      shiftWhere.push("shift.[cashier_code] = @cashierCode");
      shiftParams.cashierCode = cashierCode;
    }

    if (shiftId) {
      shiftWhere.push("shift.[id] = @shiftId");
      shiftParams.shiftId = shiftId;
    }

    const shiftResult = await this.query<PosShiftRow>(
      `SELECT TOP (@limit)
        [id],
        [shift_no],
        [terminal_code],
        [cashier_code],
        [status],
        [opening_float_amount],
        [closing_declared_cash],
        [closing_variance],
        [opened_at],
        [closed_at],
        [record_version]
       FROM [dbo].[pos_shift] AS shift
       WHERE ${shiftWhere.join(" AND ")}
       ORDER BY ISNULL(shift.[closed_at], shift.[opened_at]) DESC, shift.[shift_no] DESC`,
      shiftParams,
    );

    const inventoryWhere = ["ISNULL(balance.[quantity_on_hand], 0) <> 0"];
    const inventoryParams: Record<string, unknown> = { limit };

    if (productQuery) {
      inventoryWhere.push(
        "(UPPER(product.[product_code]) LIKE @productQuery OR UPPER(product.[product_name]) LIKE @productQuery)",
      );
      inventoryParams.productQuery = `%${productQuery}%`;
    }

    const inventoryResult = await this.query<ReportInventoryRow>(
      `SELECT TOP (@limit)
        location.[location_code],
        location.[location_name],
        product.[product_code],
        product.[product_name],
        balance.[quantity_on_hand],
        product.[unit_price],
        balance.[updated_at]
       FROM [dbo].[inventory_location_balance] AS balance
       INNER JOIN [dbo].[inventory_location_snapshot] AS location
         ON location.[location_code] = balance.[location_code]
       INNER JOIN [dbo].[product_snapshot] AS product
         ON product.[product_code] = balance.[product_code]
       WHERE ${inventoryWhere.join(" AND ")}
       ORDER BY ABS(balance.[quantity_on_hand] * product.[unit_price]) DESC, product.[product_name] ASC`,
      inventoryParams,
    );
    const bankingWhere = ["1 = 1"];
    const bankingParams: Record<string, unknown> = { limit };

    if (dateFrom) {
      bankingWhere.push("deposit.[deposited_at] >= @dateFrom");
      bankingParams.dateFrom = dateFrom;
    }

    if (dateTo) {
      bankingWhere.push("deposit.[deposited_at] <= @dateTo");
      bankingParams.dateTo = dateTo;
    }

    if (cashierCode) {
      bankingWhere.push("reconciliation.[cashier_code] = @cashierCode");
      bankingParams.cashierCode = cashierCode;
    }

    const bankingResult = await this.query<ReportBankingRow>(
      `SELECT TOP (@limit)
        deposit.[deposit_no],
        deposit.[reconciliation_no],
        deposit.[shift_no],
        deposit.[deposited_at],
        deposit.[operator_name],
        deposit.[bank_name],
        deposit.[bank_branch_name],
        deposit.[bank_account_number],
        deposit.[amount],
        deposit.[reference]
       FROM [dbo].[banking_deposit] AS deposit
       LEFT JOIN [dbo].[eod_reconciliation] AS reconciliation
         ON reconciliation.[id] = deposit.[reconciliation_id]
       WHERE ${bankingWhere.join(" AND ")}
       ORDER BY deposit.[deposited_at] DESC, deposit.[deposit_no] DESC`,
      bankingParams,
    );
    const mappedSalesRows = salesResult.recordset.map<StoreSalesReportRow>(
      (row) => ({
        transactionNo: row.transaction_no,
        transactionType: row.transaction_type,
        sourceTransactionNo: row.source_transaction_no,
        completedAt: row.completed_at,
        cashierCode: row.cashier_code,
        customerNo: row.customer_no,
        customerName: row.customer_name,
        lineCount: Math.trunc(asNumber(row.line_count)),
        productPreview: row.product_preview ?? "",
        subtotalAmount: Number(asNumber(row.subtotal_amount).toFixed(2)),
        discountAmount: Number(asNumber(row.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(row.tax_amount).toFixed(2)),
        totalAmount: Number(asNumber(row.total_amount).toFixed(2)),
        paidAmount: Number(asNumber(row.paid_amount).toFixed(2)),
      }),
    );
    const mappedTenderRows = tenderResult.recordset.map<StoreTenderReportRow>(
      (row) => ({
        source: "SALES",
        paymentMethod: row.method,
        tenderMethodCode: row.tender_method_code,
        tenderMethodName: row.tender_method_name,
        transactionCount: Math.trunc(asNumber(row.transaction_count)),
        netAmount: Number(asNumber(row.net_amount).toFixed(2)),
      }),
    );
    const mappedAccountPaymentRows =
      accountPaymentResult.recordset.map<StoreAccountPaymentReportRow>((row) => ({
        entryNo: row.entry_no,
        occurredAt: row.occurred_at,
        cashierCode: row.cashier_code,
        customerNo: row.customer_no,
        customerName: row.customer_name,
        paymentMethod: row.payment_method,
        tenderMethodCode: row.tender_method_code,
        tenderMethodName: row.tender_method_name,
        amount: Number(asNumber(row.amount).toFixed(2)),
        reference: row.reference,
      }));
    const mappedProductRows =
      productResult.recordset.map<StoreProductSalesReportRow>((row) => ({
        productCode: row.product_code,
        productName: row.product_name,
        quantity: Number(asNumber(row.quantity).toFixed(3)),
        grossAmount: Number(asNumber(row.gross_amount).toFixed(2)),
        discountAmount: Number(asNumber(row.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(row.tax_amount).toFixed(2)),
        netAmount: Number(asNumber(row.net_amount).toFixed(2)),
      }));
    const shiftSummaries = await Promise.all(
      shiftResult.recordset.map((shift) => this.toShiftSummary(shift)),
    );
    const mappedShiftRows = shiftSummaries.map<StoreShiftReportRow>(
      (shift) => ({
        shiftNo: shift.shiftNo,
        terminalCode: shift.terminalCode,
        cashierCode: shift.cashierCode,
        status: shift.status,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        openingFloatAmount: shift.openingFloatAmount,
        transactionCount: shift.transactionCount,
        salesCount: shift.salesCount,
        returnCount: shift.returnCount,
        exchangeCount: shift.exchangeCount,
        netSalesAmount: shift.netSalesAmount,
        cashTenderedAmount: shift.cashTenderedAmount,
        nonCashTenderedAmount: shift.nonCashTenderedAmount,
        accountPaymentsAmount: shift.accountPaymentsAmount,
        expectedCashAmount: shift.expectedCashAmount,
        declaredCashAmount: shift.declaredCashAmount,
        varianceAmount: shift.varianceAmount,
      }),
    );
    const mappedInventoryRows =
      inventoryResult.recordset.map<StoreInventoryReportRow>((row) => {
        const quantity = Number(asNumber(row.quantity_on_hand).toFixed(3));
        const unitPrice = Number(asNumber(row.unit_price).toFixed(2));

        return {
          locationCode: row.location_code,
          locationName: row.location_name,
          productCode: row.product_code,
          productName: row.product_name,
          quantityOnHand: quantity,
          unitPrice,
          stockValue: Number((quantity * unitPrice).toFixed(2)),
          updatedAt: row.updated_at,
        };
      });
    const mappedBankingRows = bankingResult.recordset.map<StoreBankingReportRow>(
      (row) => ({
        depositNo: row.deposit_no,
        reconciliationNo: row.reconciliation_no,
        shiftNo: row.shift_no,
        depositedAt: row.deposited_at,
        operatorName: row.operator_name,
        bankName: row.bank_name,
        branchName: row.bank_branch_name,
        accountNumber: row.bank_account_number,
        amount: Number(asNumber(row.amount).toFixed(2)),
        reference: row.reference,
      }),
    );
    const salesOrderWhere = ["1 = 1"];
    const salesOrderParams: Record<string, unknown> = {};

    if (dateFrom) {
      salesOrderWhere.push("sales_order.[created_at] >= @dateFrom");
      salesOrderParams.dateFrom = dateFrom;
    }

    if (dateTo) {
      salesOrderWhere.push("sales_order.[created_at] <= @dateTo");
      salesOrderParams.dateTo = dateTo;
    }

    if (cashierCode) {
      salesOrderWhere.push("UPPER(ISNULL(sales_order.[operator_name], N'')) = @salesOrderCashierCode");
      salesOrderParams.salesOrderCashierCode = cashierCode.toUpperCase();
    }

    if (customerQuery) {
      salesOrderWhere.push(
        "(UPPER(ISNULL(sales_order.[customer_no], N'')) LIKE @salesOrderCustomerQuery OR UPPER(ISNULL(sales_order.[customer_name], N'')) LIKE @salesOrderCustomerQuery)",
      );
      salesOrderParams.salesOrderCustomerQuery = `%${customerQuery}%`;
    }

    if (productQuery) {
      salesOrderWhere.push(
        `EXISTS (
          SELECT 1
          FROM [dbo].[pos_transaction_line] AS order_line
          WHERE order_line.[pos_transaction_id] = sales_order.[source_transaction_id]
            AND (
              UPPER(order_line.[product_code_snapshot]) LIKE @salesOrderProductQuery
              OR UPPER(order_line.[product_name_snapshot]) LIKE @salesOrderProductQuery
            )
        )`,
      );
      salesOrderParams.salesOrderProductQuery = `%${productQuery}%`;
    }

    const mappedSalesOrderRows = (
      await this.getSalesOrderRows(
        `WHERE ${salesOrderWhere.join(" AND ")}`,
        salesOrderParams,
      )
    )
      .map((row) => this.toSalesOrderSummary(row))
      .slice(0, limit);

    return {
      scope,
      generatedAt: isoNow(),
      filters: {
        scope,
        dateFrom: input.dateFrom ?? null,
        dateTo: input.dateTo ?? null,
        cashierCode,
        customerQuery: input.customerQuery ?? null,
        productQuery: input.productQuery ?? null,
        limit,
      },
      summary: {
        salesCount: mappedSalesRows.filter(
          (row) => row.transactionType === "SALE",
        ).length,
        returnCount: mappedSalesRows.filter(
          (row) => row.transactionType === "RETURN",
        ).length,
        exchangeCount: mappedSalesRows.filter(
          (row) => row.transactionType === "EXCHANGE",
        ).length,
        netSalesAmount: Number(
          mappedSalesRows
            .reduce((sum, row) => sum + row.totalAmount, 0)
            .toFixed(2),
        ),
        discountAmount: Number(
          mappedSalesRows
            .reduce((sum, row) => sum + row.discountAmount, 0)
            .toFixed(2),
        ),
        taxAmount: Number(
          mappedSalesRows
            .reduce((sum, row) => sum + row.taxAmount, 0)
            .toFixed(2),
        ),
        tenderedAmount: Number(
          mappedTenderRows
            .reduce((sum, row) => sum + row.netAmount, 0)
            .toFixed(2),
        ),
        accountPaymentsAmount: Number(
          mappedAccountPaymentRows
            .reduce((sum, row) => sum + row.amount, 0)
            .toFixed(2),
        ),
        inventoryStockValue: Number(
          mappedInventoryRows
            .reduce((sum, row) => sum + row.stockValue, 0)
            .toFixed(2),
        ),
      },
      salesRows: mappedSalesRows,
      tenderRows: mappedTenderRows,
      accountPaymentRows: mappedAccountPaymentRows,
      productRows: mappedProductRows,
      salesOrderRows: mappedSalesOrderRows,
      shiftRows: mappedShiftRows,
      inventoryRows: mappedInventoryRows,
      bankingRows: mappedBankingRows,
    };
  }

  private async normalizeCheckoutPayments(
    input: StoreBasketCheckoutRequest | undefined,
    totalAmount: number,
    transactionNo: string,
    timestamp: string,
    transactionType: SyncPosTransactionType,
  ) {
    const settlementAmount = Number(Math.abs(totalAmount).toFixed(2));
    const isRefundSettlement =
      transactionType === "RETURN" ||
      (transactionType === "EXCHANGE" && totalAmount < 0);
    const [availableTenderMethods, availableBankAccounts] = await Promise.all([
      this.listActiveTenderMethods(),
      this.listActiveBankAccounts(),
    ]);
    const defaultTenderMethod =
      availableTenderMethods.find(
        (method) =>
          method.paymentMethod === "CASH" &&
          method.allowChange &&
          !method.requiresReference &&
          !this.tenderRequiresBankAccount(method),
      ) ??
      availableTenderMethods.find(
        (method) =>
          method.paymentMethod === "CASH" &&
          !this.tenderRequiresBankAccount(method),
      ) ??
      availableTenderMethods[0] ??
      null;

    if (settlementAmount === 0) {
      return {
        payments: [] as NormalizedCheckoutPayment[],
        paidAmount: 0,
        changeAmount: 0,
      };
    }

    const rawPayments =
      input?.payments && input.payments.length > 0
        ? input.payments
        : [
            {
              method: defaultTenderMethod?.paymentMethod ?? ("CASH" as const),
              tenderMethodCode: defaultTenderMethod?.tenderMethodCode ?? null,
              tenderMethodName: defaultTenderMethod?.tenderMethodName ?? null,
              amount: settlementAmount,
              reference:
                defaultTenderMethod?.paymentMethod === "CASH" ||
                !defaultTenderMethod
                  ? `CASH-${transactionNo}`
                  : "",
            },
          ];

    const normalizedPayments = rawPayments.map<NormalizedCheckoutPayment>(
      (payment, index) => {
        const selectedTenderMethod = payment.tenderMethodCode
          ? (availableTenderMethods.find(
              (method) => method.tenderMethodCode === payment.tenderMethodCode,
            ) ?? null)
          : (availableTenderMethods.find(
              (method) => method.paymentMethod === payment.method,
            ) ?? null);
        const method = selectedTenderMethod?.paymentMethod ?? payment.method;
        const amount = Number(Number(payment.amount).toFixed(2));
        const reference = payment.reference?.trim()
          ? payment.reference.trim()
          : null;
        const selectedBankAccount = payment.bankAccountId?.trim()
          ? (availableBankAccounts.find(
              (account) => account.bankAccountId === payment.bankAccountId,
            ) ?? null)
          : null;
        const requiresBankAccount =
          this.tenderRequiresBankAccount(selectedTenderMethod) ||
          method === "BANK_TRANSFER";

        if (!syncPaymentMethods.has(method)) {
          throw new Error(
            `Flash ERP does not recognise "${method}" as a supported payment method.`,
          );
        }

        if (availableTenderMethods.length > 0 && !selectedTenderMethod) {
          throw new Error(
            "Flash ERP needs each checkout payment to use an active enterprise tender method.",
          );
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(
            "Every checkout payment needs an amount greater than zero.",
          );
        }

        if (selectedTenderMethod?.requiresReference && !reference) {
          throw new Error(
            `Flash ERP needs a reference for ${selectedTenderMethod.tenderMethodName}.`,
          );
        }

        if (requiresBankAccount && !selectedBankAccount) {
          throw new Error(
            `Select the bank, branch, and account number for ${
              selectedTenderMethod?.tenderMethodName ?? method
            }.`,
          );
        }

        return {
          paymentId: randomUUID(),
          method,
          tenderMethodCode:
            selectedTenderMethod?.tenderMethodCode ??
            payment.tenderMethodCode ??
            null,
          tenderMethodName:
            selectedTenderMethod?.tenderMethodName ??
            payment.tenderMethodName ??
            null,
          bankAccountId: selectedBankAccount?.bankAccountId ?? null,
          bankCode: selectedBankAccount?.bankCode ?? null,
          bankName: selectedBankAccount?.bankName ?? null,
          bankBranchCode: selectedBankAccount?.branchCode ?? null,
          bankBranchName: selectedBankAccount?.branchName ?? null,
          bankAccountNumber: selectedBankAccount?.accountNumber ?? null,
          bankAccountName: selectedBankAccount?.accountName ?? null,
          allowChange: selectedTenderMethod?.allowChange ?? method === "CASH",
          amount,
          reference:
            reference ??
            (method === "CASH"
              ? `CASH-${transactionNo}`
              : `${method}-${transactionNo}-${index + 1}`),
          receivedAt: timestamp,
        };
      },
    );
    const paidAmount = Number(
      normalizedPayments
        .reduce((sum, payment) => sum + payment.amount, 0)
        .toFixed(2),
    );
    const rawDifference = Number((paidAmount - settlementAmount).toFixed(2));
    let changeAmount = 0;

    if (rawDifference < 0) {
      throw new Error(
        `Flash ERP still needs ${Number(
          Math.abs(rawDifference).toFixed(2),
        ).toFixed(2)} more before checkout can complete.`,
      );
    }

    if (isRefundSettlement && rawDifference > 0) {
      throw new Error(
        "Flash ERP cannot refund more than the return or exchange total. Adjust the refund tenders before completing the basket.",
      );
    }

    if (
      rawDifference > 0 &&
      !normalizedPayments.some((payment) => payment.allowChange)
    ) {
      throw new Error(
        "Flash ERP can only return change when at least one selected tender method allows change.",
      );
    }

    changeAmount = isRefundSettlement ? 0 : Math.max(0, rawDifference);

    return {
      payments: normalizedPayments,
      paidAmount,
      changeAmount,
    };
  }

  private isCorrectionEligibleReceiptTransactionType(
    transactionType: SyncPosTransactionType | null,
  ) {
    return transactionType === "SALE";
  }

  private matchesReceiptSearchTransactionFilter(
    transactionType: SyncPosTransactionType,
    transactionFilter: StoreReceiptSearchRequest["transactionFilter"],
  ) {
    if (!transactionFilter || transactionFilter === "CORRECTABLE") {
      return this.isCorrectionEligibleReceiptTransactionType(transactionType);
    }

    if (transactionFilter === "ALL") {
      return true;
    }

    return transactionType === transactionFilter;
  }

  private async getReceiptHeaderByTransactionNo(transactionNo: string) {
    const result = await this.query<ReceiptHeaderRow>(
      `SELECT TOP (1)
        txn.[id],
        txn.[transaction_no],
        txn.[customer_id],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        customer.[customer_type],
        customer.[loyalty_enrolled] AS [customer_loyalty_enrolled],
        customer.[loyalty_tier] AS [customer_loyalty_tier],
        customer.[loyalty_points_balance] AS [customer_loyalty_points_balance],
        txn.[source_transaction_id],
        txn.[source_transaction_no],
        txn.[transaction_type],
        txn.[status],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[loyalty_redemption_points],
        txn.[loyalty_redemption_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[change_amount],
        txn.[notes],
        txn.[header_reference],
        txn.[additional_details],
        txn.[updated_at],
        txn.[completed_at],
        txn.[record_version],
        shift.[shift_no],
        ISNULL(txn.[cashier_code], shift.[cashier_code]) AS [cashier_code]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       LEFT JOIN [dbo].[pos_shift] AS shift
         ON shift.[id] = txn.[shift_id]
       WHERE UPPER(txn.[transaction_no]) = @transactionNo
         AND txn.[status] = N'COMPLETED'`,
      { transactionNo: transactionNo.trim().toUpperCase() },
    );

    return result.recordset[0] ?? null;
  }

  private async getReceiptHeaderById(transactionId: string) {
    const result = await this.query<ReceiptHeaderRow>(
      `SELECT TOP (1)
        txn.[id],
        txn.[transaction_no],
        txn.[customer_id],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        customer.[customer_type],
        customer.[loyalty_enrolled] AS [customer_loyalty_enrolled],
        customer.[loyalty_tier] AS [customer_loyalty_tier],
        customer.[loyalty_points_balance] AS [customer_loyalty_points_balance],
        txn.[source_transaction_id],
        txn.[source_transaction_no],
        txn.[transaction_type],
        txn.[status],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[loyalty_redemption_points],
        txn.[loyalty_redemption_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[change_amount],
        txn.[notes],
        txn.[header_reference],
        txn.[additional_details],
        txn.[updated_at],
        txn.[completed_at],
        txn.[record_version],
        shift.[shift_no],
        ISNULL(txn.[cashier_code], shift.[cashier_code]) AS [cashier_code]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       LEFT JOIN [dbo].[pos_shift] AS shift
         ON shift.[id] = txn.[shift_id]
       WHERE txn.[id] = @transactionId
         AND txn.[status] = N'COMPLETED'`,
      { transactionId },
    );

    return result.recordset[0] ?? null;
  }

  private async getReceiptPaymentRows(transactionId: string) {
    const result = await this.query<PosPaymentRow>(
      `SELECT
        [id],
        [tender_method_code],
        [tender_method_name],
        [bank_account_id],
        [bank_code],
        [bank_name],
        [bank_branch_code],
        [bank_branch_name],
        [bank_account_number],
        [bank_account_name],
        [method],
        [amount],
        [reference],
        [received_at]
       FROM [dbo].[pos_payment]
       WHERE [pos_transaction_id] = @transactionId
       ORDER BY [received_at] ASC, [id] ASC`,
      { transactionId },
    );

    return result.recordset;
  }

  private async getCorrectedReceiptLineQuantities(
    sourceTransactionId: string,
    sourceLineId: string,
    excludeLineId: string | null = null,
  ) {
    const result = await this.query<{
      returned_quantity: string | number | null;
      pending_quantity: string | number | null;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN correction_txn.[status] = N'COMPLETED' THEN correction_line.[quantity] ELSE 0 END), 0) AS [returned_quantity],
        COALESCE(SUM(CASE WHEN correction_txn.[status] = N'PARKED' THEN correction_line.[quantity] ELSE 0 END), 0) AS [pending_quantity]
       FROM [dbo].[pos_transaction_line] AS correction_line
       INNER JOIN [dbo].[pos_transaction] AS correction_txn
         ON correction_txn.[id] = correction_line.[pos_transaction_id]
       WHERE correction_line.[source_line_id] = @sourceLineId
         AND correction_line.[line_intent] = N'RETURN'
         AND correction_txn.[source_transaction_id] = @sourceTransactionId
         AND correction_txn.[status] IN (N'COMPLETED', N'PARKED')
         AND (@excludeLineId IS NULL OR correction_line.[id] <> @excludeLineId)`,
      { sourceTransactionId, sourceLineId, excludeLineId },
    );
    const row = result.recordset[0];

    return {
      returnedQuantity: Number(asNumber(row?.returned_quantity).toFixed(3)),
      pendingQuantity: Number(asNumber(row?.pending_quantity).toFixed(3)),
    };
  }

  private async getReceiptLookupLines(
    header: ReceiptHeaderRow,
  ): Promise<StoreReceiptLookupLine[]> {
    const lines = await this.getBasketLines(header.id);

    return Promise.all(
      lines.map(async (line) => {
        const barcode = await this.getRepresentativeBarcode(
          line.product_code_snapshot,
        );
        const serialNumbers = readSerializedLineNumbers(
          line.serial_numbers_json,
        );
        const quantitySold = Number(asNumber(line.quantity).toFixed(3));
        const isEligible = this.isCorrectionEligibleReceiptTransactionType(
          header.transaction_type,
        );
        const corrected = isEligible
          ? await this.getCorrectedReceiptLineQuantities(header.id, line.id)
          : { returnedQuantity: 0, pendingQuantity: 0 };
        const quantityAvailableToReturn = isEligible
          ? Math.max(
              0,
              Number(
                (
                  quantitySold -
                  corrected.returnedQuantity -
                  corrected.pendingQuantity
                ).toFixed(3),
              ),
            )
          : 0;

        return {
          sourceLineId: line.id,
          productCode: line.product_code_snapshot,
          productName: line.product_name_snapshot,
          barcode: barcode?.barcode_code ?? null,
          serialNumbers,
          availableSerialNumbersToReturn: isEligible ? serialNumbers : [],
          quantitySold,
          quantityReturned: corrected.returnedQuantity,
          quantityPending: corrected.pendingQuantity,
          quantityAvailableToReturn,
          unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
          taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
          lineTotal: Number(asNumber(line.line_total).toFixed(2)),
        };
      }),
    );
  }

  async searchReceipts(
    input?: StoreReceiptSearchRequest,
  ): Promise<StoreReceiptSearchResult[]> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.receipt.search"],
      purpose: "searching receipt history",
    });

    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const requestedWindowDays = Number(input?.completedWithinDays ?? 30);
    const completedWithinDays = Number.isFinite(requestedWindowDays)
      ? Math.min(Math.max(Math.round(requestedWindowDays), 1), 365)
      : 30;
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 30);
    const transactionFilter = input?.transactionFilter ?? "CORRECTABLE";

    if (input?.receiptKind === "SALES_ORDER") {
      const whereParts = [
        "ISNULL(sales_order.[fulfilled_at], sales_order.[created_at]) >= @cutoff",
      ];
      const params: Record<string, unknown> = {
        cutoff: daysAgo(completedWithinDays),
        limit,
      };

      if (normalizedQuery) {
        params.searchQuery = `%${normalizedQuery}%`;
        whereParts.push(`(
          UPPER(sales_order.[order_no]) LIKE @searchQuery
          OR UPPER(sales_order.[source_transaction_no]) LIKE @searchQuery
          OR UPPER(ISNULL(sales_order.[customer_no], N'')) LIKE @searchQuery
          OR UPPER(ISNULL(sales_order.[customer_name], N'')) LIKE @searchQuery
          OR UPPER(sales_order.[status]) LIKE @searchQuery
          OR UPPER(ISNULL(sales_order.[operator_name], N'')) LIKE @searchQuery
          OR UPPER(ISNULL(sales_order.[note], N'')) LIKE @searchQuery
          OR EXISTS (
            SELECT 1
            FROM [dbo].[pos_transaction_line] AS search_line
            WHERE search_line.[pos_transaction_id] = sales_order.[source_transaction_id]
              AND (
                UPPER(search_line.[product_code_snapshot]) LIKE @searchQuery
                OR UPPER(search_line.[product_name_snapshot]) LIKE @searchQuery
              )
          )
        )`);
      }

      const orderResult = await this.query<
        SalesOrderRow & { product_preview: string | null }
      >(
        `SELECT TOP (@limit)
          sales_order.[id],
          sales_order.[order_no],
          sales_order.[source_transaction_id],
          sales_order.[source_transaction_no],
          sales_order.[customer_id],
          sales_order.[customer_no],
          sales_order.[customer_name],
          sales_order.[status],
          sales_order.[total_amount],
          sales_order.[deposit_amount],
          sales_order.[balance_amount],
          sales_order.[deposit_tender_method_code],
          sales_order.[deposit_tender_method_name],
          sales_order.[deposit_payment_method],
          sales_order.[deposit_reference],
          sales_order.[deposit_paid_at],
          line_stats.[line_count],
          line_stats.[item_count],
          sales_order.[operator_name],
          sales_order.[note],
          sales_order.[fulfilled_transaction_id],
          sales_order.[fulfilled_transaction_no],
          sales_order.[synced_at],
          sales_order.[created_at],
          sales_order.[fulfilled_at],
          sales_order.[cancelled_at],
          sales_order.[updated_at],
          preview_stats.[product_preview]
         FROM [dbo].[sales_order] AS sales_order
         OUTER APPLY (
           SELECT
             COUNT(*) AS [line_count],
             ISNULL(SUM(line.[quantity]), 0) AS [item_count]
           FROM [dbo].[pos_transaction_line] AS line
           WHERE line.[pos_transaction_id] = sales_order.[source_transaction_id]
         ) AS line_stats
         OUTER APPLY (
           SELECT STRING_AGG(CONVERT(nvarchar(max), preview.[product_name_snapshot]), N'|') AS [product_preview]
           FROM (
             SELECT DISTINCT TOP (3) line.[product_name_snapshot]
             FROM [dbo].[pos_transaction_line] AS line
             WHERE line.[pos_transaction_id] = sales_order.[source_transaction_id]
             ORDER BY line.[product_name_snapshot] ASC
           ) AS preview
         ) AS preview_stats
         WHERE ${whereParts.join(" AND ")}
         ORDER BY ISNULL(sales_order.[fulfilled_at], sales_order.[created_at]) DESC,
           sales_order.[order_no] DESC`,
        params,
      );

      return orderResult.recordset.map<StoreReceiptSearchResult>((row) => ({
        receiptKind: "SALES_ORDER",
        transactionId: row.id,
        transactionNo: row.order_no,
        sourceTransactionNo: row.source_transaction_no,
        transactionType: "SALES_ORDER",
        status: row.status,
        totalAmount: Number(asNumber(row.total_amount).toFixed(2)),
        completedAt: row.fulfilled_at ?? row.created_at,
        customerNo: row.customer_no,
        customerName: row.customer_name,
        cashierCode: row.operator_name,
        shiftNo: null,
        notes: row.note,
        lineCount: Math.trunc(asNumber(row.line_count)),
        productPreview: (row.product_preview ?? "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 3),
        canStartReturn: false,
        canStartExchange: false,
      }));
    }

    if (input?.receiptKind === "ACCOUNT_PAYMENT") {
      const whereParts = ["entry.[occurred_at] >= @cutoff"];
      const params: Record<string, unknown> = {
        cutoff: daysAgo(completedWithinDays),
        limit,
      };

      if (normalizedQuery) {
        params.searchQuery = `%${normalizedQuery}%`;
        whereParts.push(`(
          UPPER(entry.[entry_no]) LIKE @searchQuery
          OR UPPER(entry.[customer_no]) LIKE @searchQuery
          OR UPPER(entry.[customer_name]) LIKE @searchQuery
          OR UPPER(ISNULL(entry.[reference], N'')) LIKE @searchQuery
        )`);
      }

      const accountResult = await this.query<CustomerAccountEntryRow>(
        `SELECT TOP (@limit)
          [id],
          [entry_no],
          [customer_id],
          [customer_no],
          [customer_name],
          [entry_type],
          [payment_method],
          [tender_method_code],
          [tender_method_name],
          [amount],
          [reference],
          [note],
          [shift_id],
          [shift_no],
          [cashier_code],
          [synced_at],
          [occurred_at],
          [updated_at]
         FROM [dbo].[customer_account_entry] AS entry
         WHERE ${whereParts.join(" AND ")}
         ORDER BY entry.[occurred_at] DESC, entry.[entry_no] DESC`,
        params,
      );

      return accountResult.recordset.map<StoreReceiptSearchResult>((row) => ({
        receiptKind: "ACCOUNT_PAYMENT",
        transactionId: row.id,
        transactionNo: row.entry_no,
        sourceTransactionNo: null,
        transactionType: null,
        status: "COMPLETED",
        totalAmount: Number(asNumber(row.amount).toFixed(2)),
        completedAt: row.occurred_at,
        customerNo: row.customer_no,
        customerName: row.customer_name,
        cashierCode: row.cashier_code,
        shiftNo: row.shift_no,
        notes: row.note,
        lineCount: 0,
        productPreview: [
          row.tender_method_name ?? row.payment_method,
          row.reference ?? "",
        ].filter(Boolean) as string[],
        canStartReturn: false,
        canStartExchange: false,
      }));
    }

    const whereParts = [
      "txn.[status] = N'COMPLETED'",
      "txn.[completed_at] >= @cutoff",
    ];
    const params: Record<string, unknown> = {
      cutoff: daysAgo(completedWithinDays),
      limit,
    };

    if (transactionFilter !== "ALL") {
      if (transactionFilter === "CORRECTABLE") {
        whereParts.push("txn.[transaction_type] = N'SALE'");
      } else {
        params.transactionType = transactionFilter;
        whereParts.push("txn.[transaction_type] = @transactionType");
      }
    }

    if (normalizedQuery) {
      params.searchQuery = `%${normalizedQuery}%`;
      whereParts.push(`(
        UPPER(txn.[transaction_no]) LIKE @searchQuery
        OR UPPER(ISNULL(customer.[customer_no], N'')) LIKE @searchQuery
        OR UPPER(ISNULL(customer.[full_name], N'')) LIKE @searchQuery
        OR EXISTS (
          SELECT 1
          FROM [dbo].[pos_transaction_line] AS search_line
          WHERE search_line.[pos_transaction_id] = txn.[id]
            AND (
              UPPER(search_line.[product_code_snapshot]) LIKE @searchQuery
              OR UPPER(search_line.[product_name_snapshot]) LIKE @searchQuery
            )
        )
      )`);
    }

    const result = await this.query<ReceiptSearchRow>(
      `SELECT TOP (@limit)
        txn.[id],
        txn.[transaction_no],
        txn.[customer_id],
        customer.[customer_no],
        customer.[full_name] AS [customer_name],
        customer.[customer_type],
        customer.[loyalty_enrolled] AS [customer_loyalty_enrolled],
        customer.[loyalty_tier] AS [customer_loyalty_tier],
        customer.[loyalty_points_balance] AS [customer_loyalty_points_balance],
        txn.[source_transaction_id],
        txn.[source_transaction_no],
        txn.[transaction_type],
        txn.[status],
        txn.[subtotal_amount],
        txn.[discount_amount],
        txn.[loyalty_redemption_points],
        txn.[loyalty_redemption_amount],
        txn.[tax_amount],
        txn.[total_amount],
        txn.[paid_amount],
        txn.[change_amount],
        txn.[notes],
        txn.[header_reference],
        txn.[additional_details],
        txn.[updated_at],
        txn.[completed_at],
        txn.[record_version],
        shift.[shift_no],
        ISNULL(txn.[cashier_code], shift.[cashier_code]) AS [cashier_code],
        line_stats.[line_count],
        preview_stats.[product_preview]
       FROM [dbo].[pos_transaction] AS txn
       LEFT JOIN [dbo].[customer] AS customer
         ON customer.[id] = txn.[customer_id]
       LEFT JOIN [dbo].[pos_shift] AS shift
         ON shift.[id] = txn.[shift_id]
       OUTER APPLY (
         SELECT COUNT(*) AS [line_count]
         FROM [dbo].[pos_transaction_line] AS line
         WHERE line.[pos_transaction_id] = txn.[id]
       ) AS line_stats
       OUTER APPLY (
         SELECT STRING_AGG(CONVERT(nvarchar(max), preview.[product_name_snapshot]), N'|') AS [product_preview]
         FROM (
           SELECT DISTINCT TOP (3) line.[product_name_snapshot]
           FROM [dbo].[pos_transaction_line] AS line
           WHERE line.[pos_transaction_id] = txn.[id]
           ORDER BY line.[product_name_snapshot] ASC
         ) AS preview
       ) AS preview_stats
       WHERE ${whereParts.join(" AND ")}
       ORDER BY txn.[completed_at] DESC, txn.[transaction_no] DESC`,
      params,
    );

    return result.recordset
      .filter((row) =>
        this.matchesReceiptSearchTransactionFilter(
          row.transaction_type,
          transactionFilter,
        ),
      )
      .map<StoreReceiptSearchResult>((row) => ({
        receiptKind: "SALES",
        transactionId: row.id,
        transactionNo: row.transaction_no,
        sourceTransactionNo: row.source_transaction_no,
        transactionType: row.transaction_type,
        status: row.status,
        totalAmount: Number(asNumber(row.total_amount).toFixed(2)),
        completedAt: row.completed_at,
        customerNo: row.customer_no,
        customerName: row.customer_name,
        cashierCode: row.cashier_code,
        shiftNo: row.shift_no,
        notes: row.notes,
        lineCount: Math.trunc(asNumber(row.line_count)),
        productPreview: (row.product_preview ?? "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 3),
        canStartReturn: this.isCorrectionEligibleReceiptTransactionType(
          row.transaction_type,
        ),
        canStartExchange: this.isCorrectionEligibleReceiptTransactionType(
          row.transaction_type,
        ),
      }));
  }

  async lookupReceiptForCorrection(
    transactionNo: string,
  ): Promise<StoreReceiptLookupResult | null> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.receipt.search"],
      purpose: "opening a receipt for correction",
    });

    const normalizedTransactionNo = transactionNo.trim().toUpperCase();

    if (!normalizedTransactionNo) {
      return null;
    }

    const header = await this.getReceiptHeaderByTransactionNo(
      normalizedTransactionNo,
    );

    if (!header) {
      return null;
    }

    const lines = await this.getReceiptLookupLines(header);
    const payments = await this.getReceiptPaymentRows(header.id);
    const eligibleLineCount = lines.filter(
      (line) => line.quantityAvailableToReturn > 0,
    ).length;

    return {
      sourceTransactionId: header.id,
      sourceTransactionNo: header.transaction_no,
      customerId: header.customer_id,
      transactionType: header.transaction_type,
      status: header.status,
      totalAmount: Number(asNumber(header.total_amount).toFixed(2)),
      completedAt: header.completed_at,
      customerNo: header.customer_no,
      customerName: header.customer_name,
      headerReference: header.header_reference,
      additionalDetails: header.additional_details,
      eligibleLineCount,
      canStartReturn: eligibleLineCount > 0,
      canStartExchange: eligibleLineCount > 0,
      lines,
      payments: payments.map((payment) => ({
        paymentId: payment.id,
        tenderMethodCode: payment.tender_method_code,
        tenderMethodName: payment.tender_method_name,
        bankAccountId: payment.bank_account_id,
        method: payment.method,
        amount: Number(asNumber(payment.amount).toFixed(2)),
        reference: payment.reference,
        receivedAt: payment.received_at,
      })),
    };
  }

  async getPrintableReceiptDocument(
    transactionNo: string,
  ): Promise<StorePrintableReceiptDocument> {
    const normalizedTransactionNo = transactionNo.trim().toUpperCase();

    if (!normalizedTransactionNo) {
      throw new Error(
        "Flash ERP needs a receipt number before it can open the thermal print view.",
      );
    }

    const header = await this.getReceiptHeaderByTransactionNo(
      normalizedTransactionNo,
    );

    if (!header) {
      throw new Error(
        `Flash ERP could not find completed receipt "${normalizedTransactionNo}" in the SQL Server store ledger.`,
      );
    }

    const [metadata, lineRows, paymentRows] = await Promise.all([
      this.metadata(),
      this.getBasketLines(header.id),
      this.getReceiptPaymentRows(header.id),
    ]);

    return {
      retailOrgName:
        metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
      companyLogoUrl: this.resolveStoreLogoUrl(metadata),
      loginBackgroundImageUrl: this.resolveEnterpriseMediaUrl(
        metadata.login_background_image_url,
      ),
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      storeName: metadata.store_name ?? defaultStoreConfig.storeName,
      storePhone: metadata.store_phone ?? null,
      storeAddress: metadata.store_address_line1 ?? null,
      storeAddressLine2: metadata.store_address_line2 ?? null,
      terminalCode: this.getTerminalCode(),
      currencyCode: metadata.currency_code ?? "USD",
      timezone: metadata.timezone ?? "UTC",
      receiptHeader: metadata.receipt_header ?? null,
      receiptFooter: metadata.receipt_footer ?? null,
      salesReceiptTemplateHtml:
        metadata.sales_receipt_template_html?.trim() || null,
      transactionId: header.id,
      transactionNo: header.transaction_no,
      transactionType: header.transaction_type,
      status: header.status,
      sourceTransactionNo: header.source_transaction_no,
      shiftNo: header.shift_no,
      cashierCode: header.cashier_code,
      customerNo: header.customer_no,
      customerName: header.customer_name,
      subtotalAmount: Number(asNumber(header.subtotal_amount).toFixed(2)),
      discountAmount: Number(asNumber(header.discount_amount).toFixed(2)),
      loyaltyRedemptionPoints: Math.max(
        0,
        Math.trunc(asNumber(header.loyalty_redemption_points)),
      ),
      loyaltyRedemptionAmount: Number(
        asNumber(header.loyalty_redemption_amount).toFixed(2),
      ),
      taxAmount: Number(asNumber(header.tax_amount).toFixed(2)),
      totalAmount: Number(asNumber(header.total_amount).toFixed(2)),
      paidAmount: Number(asNumber(header.paid_amount).toFixed(2)),
      changeAmount: Number(asNumber(header.change_amount).toFixed(2)),
      notes: header.notes,
      headerReference: header.header_reference,
      additionalDetails: header.additional_details,
      completedAt: header.completed_at,
      lines: lineRows.map((line) => ({
        lineId: line.id,
        lineIntent: line.line_intent,
        sourceLineId: line.source_line_id,
        productCode: line.product_code_snapshot,
        productName: line.product_name_snapshot,
        variantSize: line.variant_size,
        variantColor: line.variant_color,
        lineNote: line.line_note,
        quantity: Number(asNumber(line.quantity).toFixed(3)),
        unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
        discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
        lineTotal: Number(asNumber(line.line_total).toFixed(2)),
        serialNumbers: readSerializedLineNumbers(line.serial_numbers_json),
        appliedPromotionCode: line.applied_promotion_code,
        appliedPromotionName: line.applied_promotion_name,
      })),
      payments: paymentRows.map((payment) => ({
        paymentId: payment.id,
        tenderMethodCode: payment.tender_method_code,
        tenderMethodName: payment.tender_method_name,
        method: payment.method,
        amount: Number(asNumber(payment.amount).toFixed(2)),
        reference: payment.reference,
        receivedAt: payment.received_at,
      })),
    };
  }

  async getPrintableSalesOrderReceiptDocument(
    orderNo: string,
  ): Promise<StorePrintableReceiptDocument> {
    const normalizedOrderNo = orderNo.trim().toUpperCase();

    if (!normalizedOrderNo) {
      throw new Error(
        "Flash ERP needs a sales order number before it can print the order receipt.",
      );
    }

    const rows = await this.getSalesOrderRows(
      "WHERE UPPER(sales_order.[order_no]) = @orderNo",
      { orderNo: normalizedOrderNo },
    );
    const order = rows[0] ?? null;

    if (!order) {
      throw new Error(
        `Flash ERP could not find sales order "${normalizedOrderNo}" in the SQL Server store ledger.`,
      );
    }

    const header = await this.getBasketHeader(order.source_transaction_id);

    if (!header) {
      throw new Error(
        `Flash ERP could not find the basket behind sales order "${order.order_no}".`,
      );
    }

    const [metadata, lineRows, paymentRows] = await Promise.all([
      this.metadata(),
      this.getBasketLines(order.source_transaction_id),
      this.getReceiptPaymentRows(order.source_transaction_id),
    ]);

    return {
      retailOrgName:
        metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
      companyLogoUrl: this.resolveStoreLogoUrl(metadata),
      loginBackgroundImageUrl: this.resolveEnterpriseMediaUrl(
        metadata.login_background_image_url,
      ),
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      storeName: metadata.store_name ?? defaultStoreConfig.storeName,
      storePhone: metadata.store_phone ?? null,
      storeAddress: metadata.store_address_line1 ?? null,
      storeAddressLine2: metadata.store_address_line2 ?? null,
      terminalCode: this.getTerminalCode(),
      currencyCode: metadata.currency_code ?? "USD",
      timezone: metadata.timezone ?? "UTC",
      receiptHeader: metadata.receipt_header ?? null,
      receiptFooter: metadata.receipt_footer ?? null,
      salesReceiptTemplateHtml:
        metadata.sales_receipt_template_html?.trim() || null,
      transactionId: order.id,
      transactionNo: order.order_no,
      transactionType: "SALES_ORDER",
      status: order.status,
      sourceTransactionNo: order.source_transaction_no,
      shiftNo: null,
      cashierCode: order.operator_name,
      customerNo: order.customer_no ?? header.customer_no,
      customerName: order.customer_name ?? header.customer_name,
      subtotalAmount: Number(asNumber(header.subtotal_amount).toFixed(2)),
      discountAmount: Number(asNumber(header.discount_amount).toFixed(2)),
      loyaltyRedemptionPoints: Math.max(
        0,
        Math.trunc(asNumber(header.loyalty_redemption_points)),
      ),
      loyaltyRedemptionAmount: Number(
        asNumber(header.loyalty_redemption_amount).toFixed(2),
      ),
      taxAmount: Number(asNumber(header.tax_amount).toFixed(2)),
      totalAmount: Number(asNumber(order.total_amount).toFixed(2)),
      paidAmount: Number(asNumber(order.deposit_amount).toFixed(2)),
      changeAmount: 0,
      notes: order.note,
      headerReference: header.header_reference,
      additionalDetails: header.additional_details,
      completedAt: order.created_at,
      lines: lineRows.map((line) => ({
        lineId: line.id,
        lineIntent: line.line_intent,
        sourceLineId: line.source_line_id,
        productCode: line.product_code_snapshot,
        productName: line.product_name_snapshot,
        variantSize: line.variant_size,
        variantColor: line.variant_color,
        lineNote: line.line_note,
        quantity: Number(asNumber(line.quantity).toFixed(3)),
        unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
        discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
        lineTotal: Number(asNumber(line.line_total).toFixed(2)),
        serialNumbers: readSerializedLineNumbers(line.serial_numbers_json),
        appliedPromotionCode: line.applied_promotion_code,
        appliedPromotionName: line.applied_promotion_name,
      })),
      payments: paymentRows.map((payment) => ({
        paymentId: payment.id,
        tenderMethodCode: payment.tender_method_code,
        tenderMethodName: payment.tender_method_name,
        method: payment.method,
        amount: Number(asNumber(payment.amount).toFixed(2)),
        reference: payment.reference,
        receivedAt: payment.received_at,
      })),
    };
  }

  async recordCustomerAccountPayment(
    input: StoreCustomerAccountPaymentRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["pos.customer.account.collect"],
      purpose: "collecting a customer account payment",
    });

    const shift = await this.getOpenShiftRow();

    if (!shift) {
      throw new Error(
        "Open a cashier shift before collecting a customer account payment.",
      );
    }

    const customerId = input.customerId.trim();
    const tenderMethodCode = input.tenderMethodCode.trim();
    const amount = Number(Number(input.amount).toFixed(2));

    if (!customerId) {
      throw new Error("Choose a customer account before collecting a payment.");
    }

    if (!tenderMethodCode) {
      throw new Error(
        "Choose an active enterprise tender method before collecting a payment.",
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "Enter a payment amount greater than zero for the customer account.",
      );
    }

    const [customerResult, tenderMethod, selectedBankAccount, metadata] =
      await Promise.all([
        this.query<CustomerRow>(
          `SELECT TOP (1)
            [id],
            [customer_no],
            [full_name],
            [customer_type],
            [phone],
            [email],
            [home_store_code],
            [home_store_name],
            [city],
            [country_code],
            [loyalty_enrolled],
            [loyalty_tier],
            [loyalty_points_balance],
            [allow_credit_sales],
            [credit_limit_amount],
            [receivable_balance_amount],
            [note],
            [status],
            [updated_at]
           FROM [dbo].[customer]
           WHERE [id] = @customerId
             AND [deleted_at] IS NULL`,
          { customerId },
        ),
        this.getTenderMethodByCode(tenderMethodCode),
        this.getBankAccountById(input.bankAccountId),
        this.metadata(),
      ]);
    const customer = customerResult.recordset[0] ?? null;

    if (!customer) {
      throw new Error(
        "Flash ERP could not find that customer account in the shared SQL Server store database.",
      );
    }

    if (customer.status !== "ACTIVE") {
      throw new Error(
        `Flash ERP cannot collect against ${customer.full_name} because that customer account is ${customer.status.toLowerCase()}.`,
      );
    }

    if (!tenderMethod) {
      throw new Error(
        "Flash ERP needs the account payment to use an active enterprise tender method.",
      );
    }

    if (tenderMethod.paymentMethod === "STORE_CREDIT") {
      throw new Error(
        "Store Credit cannot be used to settle a customer receivable balance.",
      );
    }

    const currentReceivableBalance = Number(
      asNumber(customer.receivable_balance_amount).toFixed(2),
    );

    if (currentReceivableBalance <= 0) {
      throw new Error(
        `${customer.full_name} does not currently have an outstanding receivable balance to collect.`,
      );
    }

    if (amount > currentReceivableBalance) {
      throw new Error(
        `Flash ERP cannot collect more than ${customer.full_name}'s outstanding receivable balance of ${currentReceivableBalance.toFixed(2)}.`,
      );
    }

    const reference = input.reference?.trim() || null;

    if (tenderMethod.requiresReference && !reference) {
      throw new Error(
        `Flash ERP needs a reference for ${tenderMethod.tenderMethodName}.`,
      );
    }

    if (this.tenderRequiresBankAccount(tenderMethod) && !selectedBankAccount) {
      throw new Error(
        `Select the bank, branch, and account number for ${tenderMethod.tenderMethodName}.`,
      );
    }

    const timestamp = isoNow();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const entryId = randomUUID();
    const entryNo = buildLocalDocumentNo(
      "CAP",
      storeCode,
      await this.nextSequence("customer_account_entry_sequence"),
      timestamp,
    );
    const note = input.note?.trim() || null;
    const nextReceivableBalance = Number(
      (currentReceivableBalance - amount).toFixed(2),
    );
    const payload: StoreCustomerAccountEntryRecordedPayload = {
      entryId,
      entryNo,
      storeCode,
      terminalCode,
      shiftId: shift.id,
      shiftNo: shift.shift_no,
      cashierCode: operatorSession.loginId,
      customerId: customer.id,
      customerNo: customer.customer_no,
      customerName: customer.full_name,
      entryType: "ACCOUNT_PAYMENT",
      paymentMethod: tenderMethod.paymentMethod,
      tenderMethodCode: tenderMethod.tenderMethodCode,
      tenderMethodName: tenderMethod.tenderMethodName,
      bankAccountId: selectedBankAccount?.bankAccountId ?? null,
      bankCode: selectedBankAccount?.bankCode ?? null,
      bankName: selectedBankAccount?.bankName ?? null,
      bankBranchCode: selectedBankAccount?.branchCode ?? null,
      bankBranchName: selectedBankAccount?.branchName ?? null,
      bankAccountNumber: selectedBankAccount?.accountNumber ?? null,
      bankAccountName: selectedBankAccount?.accountName ?? null,
      amount,
      reference,
      note,
      occurredAt: timestamp,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `INSERT INTO [dbo].[customer_account_entry] (
          [id],
          [entry_no],
          [customer_id],
          [customer_no],
          [customer_name],
          [entry_type],
          [payment_method],
          [tender_method_code],
          [tender_method_name],
          [bank_account_id],
          [bank_code],
          [bank_name],
          [bank_branch_code],
          [bank_branch_name],
          [bank_account_number],
          [bank_account_name],
          [amount],
          [reference],
          [note],
          [shift_id],
          [shift_no],
          [cashier_code],
          [synced_at],
          [occurred_at],
          [updated_at]
        ) VALUES (
          @entryId,
          @entryNo,
          @customerId,
          @customerNo,
          @customerName,
          N'ACCOUNT_PAYMENT',
          @paymentMethod,
          @tenderMethodCode,
          @tenderMethodName,
          @bankAccountId,
          @bankCode,
          @bankName,
          @bankBranchCode,
          @bankBranchName,
          @bankAccountNumber,
          @bankAccountName,
          @amount,
          @reference,
          @note,
          @shiftId,
          @shiftNo,
          @cashierCode,
          NULL,
          @timestamp,
          @timestamp
        )`,
        {
          entryId,
          entryNo,
          customerId: customer.id,
          customerNo: customer.customer_no,
          customerName: customer.full_name,
          paymentMethod: tenderMethod.paymentMethod,
          tenderMethodCode: tenderMethod.tenderMethodCode,
          tenderMethodName: tenderMethod.tenderMethodName,
          bankAccountId: selectedBankAccount?.bankAccountId ?? null,
          bankCode: selectedBankAccount?.bankCode ?? null,
          bankName: selectedBankAccount?.bankName ?? null,
          bankBranchCode: selectedBankAccount?.branchCode ?? null,
          bankBranchName: selectedBankAccount?.branchName ?? null,
          bankAccountNumber: selectedBankAccount?.accountNumber ?? null,
          bankAccountName: selectedBankAccount?.accountName ?? null,
          amount,
          reference,
          note,
          shiftId: shift.id,
          shiftNo: shift.shift_no,
          cashierCode: operatorSession.loginId,
          timestamp,
        },
        transaction,
      );

      await this.query(
        `UPDATE [dbo].[customer]
         SET [receivable_balance_amount] = @nextReceivableBalance,
             [record_version] = [record_version] + 1,
             [updated_at] = @timestamp
         WHERE [id] = @customerId`,
        {
          nextReceivableBalance,
          timestamp,
          customerId: customer.id,
        },
        transaction,
      );

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "customerAccountEntry",
            aggregateId: entryId,
            eventType: "customer-account-entry.recorded",
            idempotencyKey: `${nodeCode}:customerAccountEntry:${entryNo}`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }

      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${entryNo} collected ${amount.toFixed(2)} from ${customer.full_name} on the SQL Server store node and queued enterprise sync.`
        : `${entryNo} collected ${amount.toFixed(2)} from ${customer.full_name} on the SQL Server store node for standalone receivables.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${entryNo} collected ${amount.toFixed(2)} from ${customer.full_name}. ${
        nextReceivableBalance <= 0
          ? "The receivable is now fully settled locally."
          : `Remaining receivable balance is ${nextReceivableBalance.toFixed(2)} locally.`
      }`,
      snapshot: await this.getSyncSnapshot(),
      accountPaymentEntryNo: entryNo,
    };
  }

  async getPrintableAccountPaymentReceiptDocument(
    entryNo: string,
  ): Promise<StorePrintableAccountPaymentReceiptDocument> {
    const normalizedEntryNo = entryNo.trim().toUpperCase();

    if (!normalizedEntryNo) {
      throw new Error(
        "Flash ERP needs an account payment receipt number before it can print.",
      );
    }

    const [entryResult, metadata] = await Promise.all([
      this.query<CustomerAccountEntryRow & { remaining_balance_amount: string | number | null }>(
        `SELECT TOP (1)
          entry.[id],
          entry.[entry_no],
          entry.[customer_id],
          entry.[customer_no],
          entry.[customer_name],
          entry.[entry_type],
          entry.[payment_method],
          entry.[tender_method_code],
          entry.[tender_method_name],
          entry.[amount],
          entry.[reference],
          entry.[note],
          entry.[shift_id],
          entry.[shift_no],
          entry.[cashier_code],
          entry.[synced_at],
          entry.[occurred_at],
          entry.[updated_at],
          customer.[receivable_balance_amount] AS [remaining_balance_amount]
         FROM [dbo].[customer_account_entry] AS entry
         LEFT JOIN [dbo].[customer] AS customer
           ON customer.[id] = entry.[customer_id]
          AND customer.[deleted_at] IS NULL
         WHERE UPPER(entry.[entry_no]) = @entryNo`,
        { entryNo: normalizedEntryNo },
      ),
      this.metadata(),
    ]);
    const entry = entryResult.recordset[0] ?? null;

    if (!entry) {
      throw new Error(
        `Flash ERP could not find account payment receipt "${normalizedEntryNo}" in the SQL Server store ledger.`,
      );
    }

    return {
      retailOrgName:
        metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
      companyLogoUrl: this.resolveStoreLogoUrl(metadata),
      loginBackgroundImageUrl: this.resolveEnterpriseMediaUrl(
        metadata.login_background_image_url,
      ),
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      storeName: metadata.store_name ?? defaultStoreConfig.storeName,
      storePhone: metadata.store_phone ?? null,
      storeAddress: metadata.store_address_line1 ?? null,
      storeAddressLine2: metadata.store_address_line2 ?? null,
      terminalCode: this.getTerminalCode(),
      currencyCode: metadata.currency_code ?? "USD",
      timezone: metadata.timezone ?? "UTC",
      receiptHeader: metadata.receipt_header ?? null,
      receiptFooter: metadata.receipt_footer ?? null,
      accountPaymentReceiptTemplateHtml:
        metadata.account_payment_receipt_template_html?.trim() || null,
      entryId: entry.id,
      entryNo: entry.entry_no,
      customerNo: entry.customer_no,
      customerName: entry.customer_name,
      paymentMethod: entry.payment_method,
      tenderMethodCode: entry.tender_method_code,
      tenderMethodName: entry.tender_method_name,
      amount: Number(asNumber(entry.amount).toFixed(2)),
      reference: entry.reference,
      note: entry.note,
      shiftNo: entry.shift_no,
      cashierCode: entry.cashier_code,
      remainingBalanceAmount:
        entry.remaining_balance_amount === null
          ? null
          : Number(asNumber(entry.remaining_balance_amount).toFixed(2)),
      occurredAt: entry.occurred_at,
    };
  }

  async createSalesOrderFromActiveBasket(
    input: StoreCreateSalesOrderRequest | null = {},
  ): Promise<StoreSyncActionResult> {
    input ??= {};
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "creating a sales order from the active basket",
    });

    const timestamp = isoNow();
    const basket = await this.requireActiveBasket();

    if (basket.transaction_type !== "SALE") {
      throw new Error(
        "Flash ERP can only create sales orders from sale baskets.",
      );
    }

    await this.refreshBasketTotals(basket.id, timestamp);
    const refreshedBasket = await this.getBasketHeader(basket.id);

    if (!refreshedBasket) {
      throw new Error(
        "Flash ERP could not reload the basket before creating the sales order.",
      );
    }

    if (!refreshedBasket.customer_id) {
      throw new Error(
        "Select a registered customer before creating a sales order.",
      );
    }

    const lines = await this.getBasketLines(refreshedBasket.id);

    if (lines.length === 0) {
      throw new Error("Add at least one item before saving a sales order.");
    }

    const headerReference =
      input.headerReference === undefined
        ? refreshedBasket.header_reference
        : input.headerReference?.trim() || null;
    const additionalDetails =
      input.additionalDetails === undefined
        ? refreshedBasket.additional_details
        : input.additionalDetails?.trim() || null;

    const salesOrderLocationCode = await this.getDefaultSalesOrderLocationCode();

    const existingOrder = await this.query<{
      id: string;
      order_no: string;
    }>(
      `SELECT TOP (1) [id], [order_no]
       FROM [dbo].[sales_order]
       WHERE [source_transaction_id] = @transactionId
         AND [status] = N'OPEN'`,
      { transactionId: refreshedBasket.id },
    );
    const alreadySavedOrderNo = existingOrder.recordset[0]?.order_no ?? null;

    if (alreadySavedOrderNo) {
      await this.withTransaction(async (transaction) => {
        await this.query(
          `UPDATE [dbo].[pos_transaction]
           SET [status] = N'PARKED',
               [header_reference] = @headerReference,
               [additional_details] = @additionalDetails,
               [updated_at] = @timestamp
           WHERE [id] = @transactionId`,
          {
            headerReference,
            additionalDetails,
            timestamp,
            transactionId: refreshedBasket.id,
          },
          transaction,
        );
        await this.query(
          `UPDATE [dbo].[pos_transaction_line]
           SET [inventory_location_code] = @salesOrderLocationCode
           WHERE [pos_transaction_id] = @transactionId
             AND [line_intent] = N'SALE'`,
          {
            salesOrderLocationCode,
            transactionId: refreshedBasket.id,
          },
          transaction,
        );
        await this.recordTransactionReferenceCapture(transaction, {
          reference: headerReference,
          details: additionalDetails,
          transactionNo: refreshedBasket.transaction_no,
          capturedAt: timestamp,
        });
        await this.deleteMetadata(this.getActiveBasketMetadataKey(), transaction);
        await this.setMetadata("last_local_write_at", timestamp, transaction);
      });
      await this.insertRunLog({
        runKind: "LOCAL_WRITE",
        result: "IDLE",
        summary: `${alreadySavedOrderNo} was already saved from SQL Server basket ${refreshedBasket.transaction_no}.`,
        upstreamProcessed: 0,
        downstreamApplied: 0,
        startedAt: timestamp,
        finishedAt: timestamp,
      });

      return {
        message: `${alreadySavedOrderNo} was already saved as a local sales order.`,
        snapshot: await this.getSyncSnapshot(),
      };
    }

    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const orderId = randomUUID();
    const orderNo = buildLocalDocumentNo(
      "SO",
      storeCode,
      await this.nextSequence("sales_order_sequence"),
      timestamp,
    );
    const note = input.note?.trim() || null;
    const operatorName = input.operatorName?.trim() || null;
    const totalAmount = Number(
      asNumber(refreshedBasket.total_amount).toFixed(2),
    );
    const requestedDepositAmount = Number(
      Number(input.depositAmount ?? 0).toFixed(2),
    );

    if (
      !Number.isFinite(requestedDepositAmount) ||
      requestedDepositAmount < 0
    ) {
      throw new Error(
        "Enter a sales order deposit amount of zero or more.",
      );
    }

    if (requestedDepositAmount > totalAmount) {
      throw new Error(
        "A sales order deposit cannot be greater than the order total.",
      );
    }

    const depositAmount = requestedDepositAmount;
    const balanceAmount = Number((totalAmount - depositAmount).toFixed(2));
    const depositReference = input.depositReference?.trim() || null;
    const depositTender =
      depositAmount > 0
        ? await this.getTenderMethodByCode(
            input.depositTenderMethodCode?.trim().toUpperCase() ?? "",
          )
        : null;

    if (depositAmount > 0 && !depositTender) {
      throw new Error(
        "Choose an active tender method before taking a sales order deposit.",
      );
    }

    if (depositTender?.requiresReference && !depositReference) {
      throw new Error(
        `Flash ERP needs a reference for ${depositTender.tenderMethodName}.`,
      );
    }

    const payload: StoreSalesOrderRecordedPayload = {
      orderId,
      orderNo,
      storeCode,
      terminalCode,
      sourceTransactionId: refreshedBasket.id,
      sourceTransactionNo: refreshedBasket.transaction_no,
      customerId: refreshedBasket.customer_id,
      customerNo: refreshedBasket.customer_no,
      customerName: refreshedBasket.customer_name,
      totalAmount,
      depositAmount,
      balanceAmount,
      depositTenderMethodCode: depositTender?.tenderMethodCode ?? null,
      depositTenderMethodName: depositTender?.tenderMethodName ?? null,
      depositPaymentMethod: depositTender?.paymentMethod ?? null,
      depositReference,
      depositPaidAt: depositAmount > 0 ? timestamp : null,
      status: "OPEN",
      operatorName,
      note,
      createdAt: timestamp,
      fulfilledTransactionId: null,
      fulfilledTransactionNo: null,
      fulfilledAt: null,
      cancelledAt: null,
      lines: lines.map((line) => ({
        lineId: line.id,
        productCode: line.product_code_snapshot,
        productVariantCode: line.product_variant_code_snapshot,
        productName: line.product_name_snapshot,
        variantSize: line.variant_size,
        variantColor: line.variant_color,
        variantAttributesSnapshot: line.variant_attributes_snapshot,
        lineNote: line.line_note,
        quantity: Number(asNumber(line.quantity).toFixed(3)),
        unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
        discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
        lineTotal: Number(asNumber(line.line_total).toFixed(2)),
        appliedPromotionCode: line.applied_promotion_code,
        appliedPromotionName: line.applied_promotion_name,
      })),
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `INSERT INTO [dbo].[sales_order] (
          [id],
          [order_no],
          [source_transaction_id],
          [source_transaction_no],
          [customer_id],
          [customer_no],
          [customer_name],
          [status],
          [total_amount],
          [deposit_amount],
          [balance_amount],
          [deposit_tender_method_code],
          [deposit_tender_method_name],
          [deposit_payment_method],
          [deposit_reference],
          [deposit_paid_at],
          [operator_name],
          [note],
          [fulfilled_transaction_id],
          [fulfilled_transaction_no],
          [synced_at],
          [created_at],
          [fulfilled_at],
          [cancelled_at],
          [updated_at]
        ) VALUES (
          @orderId,
          @orderNo,
          @transactionId,
          @transactionNo,
          @customerId,
          @customerNo,
          @customerName,
          N'OPEN',
          @totalAmount,
          @depositAmount,
          @balanceAmount,
          @depositTenderMethodCode,
          @depositTenderMethodName,
          @depositPaymentMethod,
          @depositReference,
          @depositPaidAt,
          @operatorName,
          @note,
          NULL,
          NULL,
          NULL,
          @timestamp,
          NULL,
          NULL,
          @timestamp
        )`,
        {
          orderId,
          orderNo,
          transactionId: refreshedBasket.id,
          transactionNo: refreshedBasket.transaction_no,
          customerId: refreshedBasket.customer_id,
          customerNo: refreshedBasket.customer_no,
          customerName: refreshedBasket.customer_name,
          totalAmount,
          depositAmount,
          balanceAmount,
          depositTenderMethodCode: depositTender?.tenderMethodCode ?? null,
          depositTenderMethodName: depositTender?.tenderMethodName ?? null,
          depositPaymentMethod: depositTender?.paymentMethod ?? null,
          depositReference,
          depositPaidAt: depositAmount > 0 ? timestamp : null,
          operatorName,
          note,
          timestamp,
        },
        transaction,
      );

      if (depositAmount > 0 && depositTender) {
        await this.query(
          `INSERT INTO [dbo].[pos_payment] (
            [id],
            [pos_transaction_id],
            [tender_method_code],
            [tender_method_name],
            [method],
            [amount],
            [reference],
            [received_at]
          ) VALUES (
            @paymentId,
            @transactionId,
            @tenderMethodCode,
            @tenderMethodName,
            @method,
            @amount,
            @reference,
            @receivedAt
          )`,
          {
            paymentId: randomUUID(),
            transactionId: refreshedBasket.id,
            tenderMethodCode: depositTender.tenderMethodCode,
            tenderMethodName: depositTender.tenderMethodName,
            method: depositTender.paymentMethod,
            amount: depositAmount,
            reference: depositReference ?? `DEP-${orderNo}`,
            receivedAt: timestamp,
          },
          transaction,
        );
      }

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "salesOrder",
            aggregateId: orderId,
            eventType: "sales-order.recorded",
            idempotencyKey: `${nodeCode}:salesOrder:${orderNo}:recorded`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }

      await this.query(
        `UPDATE [dbo].[pos_transaction]
         SET [status] = N'PARKED',
             [paid_amount] = @depositAmount,
             [header_reference] = @headerReference,
             [additional_details] = @additionalDetails,
             [updated_at] = @timestamp
         WHERE [id] = @transactionId`,
        {
          depositAmount,
          headerReference,
          additionalDetails,
          timestamp,
          transactionId: refreshedBasket.id,
        },
        transaction,
      );
      await this.query(
        `UPDATE [dbo].[pos_transaction_line]
         SET [inventory_location_code] = @salesOrderLocationCode
         WHERE [pos_transaction_id] = @transactionId
           AND [line_intent] = N'SALE'`,
        {
          salesOrderLocationCode,
          transactionId: refreshedBasket.id,
        },
        transaction,
      );
      await this.recordTransactionReferenceCapture(transaction, {
        reference: headerReference,
        details: additionalDetails,
        transactionNo: refreshedBasket.transaction_no,
        capturedAt: timestamp,
      });
      await this.deleteMetadata(this.getActiveBasketMetadataKey(), transaction);
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${orderNo} was created from SQL Server basket ${refreshedBasket.transaction_no} and queued for enterprise sync.`
        : `${orderNo} was created from SQL Server basket ${refreshedBasket.transaction_no} for standalone fulfilment.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${orderNo} was saved as a local sales order for fulfilment.`,
      snapshot: await this.getSyncSnapshot(),
      salesOrderNo: orderNo,
    };
  }

  async resumeSalesOrder(orderId: string): Promise<StoreSyncActionResult> {
    const order = await this.getSalesOrderRow(orderId);

    if (!order || order.status !== "OPEN") {
      throw new Error(
        "Flash ERP could not find that open sales order in SQL Server.",
      );
    }

    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "fulfilling a sales order",
    });

    const basket = await this.getBasketHeader(order.source_transaction_id);

    if (!basket || basket.status !== "PARKED") {
      throw new Error(
        "The basket behind this sales order is no longer available.",
      );
    }

    const activeBasketId = await this.getActiveBasketId();

    if (activeBasketId && activeBasketId !== basket.id) {
      throw new Error(
        "Complete or park the active basket before fulfilling a sales order.",
      );
    }

    const timestamp = isoNow();
    await this.setMetadata(this.getActiveBasketMetadataKey(), basket.id);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${order.order_no} was opened in the SQL Server sell lane for fulfilment.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${order.order_no} is ready in the sell lane for fulfilment.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async cancelSalesOrder(
    input: StoreCancelSalesOrderRequest,
  ): Promise<StoreSyncActionResult> {
    const order = await this.getSalesOrderRow(input.orderId);

    if (!order || order.status !== "OPEN") {
      throw new Error(
        "Flash ERP could not find that open sales order in SQL Server.",
      );
    }

    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "cancelling a sales order",
    });

    const activeBasketId = await this.getActiveBasketId();
    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const operatorName = input.operatorName?.trim() || order.operator_name;
    const note = input.note?.trim() || order.note;
    const payload: StoreSalesOrderRecordedPayload = {
      orderId: order.id,
      orderNo: order.order_no,
      storeCode,
      terminalCode,
      sourceTransactionId: order.source_transaction_id,
      sourceTransactionNo: order.source_transaction_no,
      customerId: order.customer_id,
      customerNo: order.customer_no,
      customerName: order.customer_name,
      totalAmount: Number(asNumber(order.total_amount).toFixed(2)),
      depositAmount: Number(asNumber(order.deposit_amount).toFixed(2)),
      balanceAmount: Number(asNumber(order.balance_amount).toFixed(2)),
      depositTenderMethodCode: order.deposit_tender_method_code,
      depositTenderMethodName: order.deposit_tender_method_name,
      depositPaymentMethod: order.deposit_payment_method,
      depositReference: order.deposit_reference,
      depositPaidAt: order.deposit_paid_at,
      status: "CANCELLED",
      operatorName,
      note,
      createdAt: order.created_at,
      fulfilledTransactionId: null,
      fulfilledTransactionNo: null,
      fulfilledAt: null,
      cancelledAt: timestamp,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `UPDATE [dbo].[sales_order]
         SET [status] = N'CANCELLED',
             [operator_name] = @operatorName,
             [note] = @note,
             [cancelled_at] = @timestamp,
             [updated_at] = @timestamp
         WHERE [id] = @orderId`,
        {
          operatorName,
          note,
          timestamp,
          orderId: order.id,
        },
        transaction,
      );
      await this.query(
        `UPDATE [dbo].[pos_transaction]
         SET [status] = N'CANCELLED',
             [updated_at] = @timestamp
         WHERE [id] = @transactionId`,
        { timestamp, transactionId: order.source_transaction_id },
        transaction,
      );

      if (activeBasketId === order.source_transaction_id) {
        await this.deleteMetadata(this.getActiveBasketMetadataKey(), transaction);
      }

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "salesOrder",
            aggregateId: order.id,
            eventType: "sales-order.cancelled",
            idempotencyKey: `${nodeCode}:salesOrder:${order.order_no}:cancelled`,
            payload,
            recordVersion: 2,
          },
          transaction,
        );
      }

      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${order.order_no} was cancelled on the SQL Server store node and queued for enterprise sync.`
        : `${order.order_no} was cancelled on the SQL Server store node for standalone sales orders.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${order.order_no} was cancelled locally.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async recordEodReconciliation(
    input: StoreRecordEodReconciliationRequest,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      purpose: "recording end-of-day reconciliation",
    });

    const declaredCashAmount = Number(
      Number(input.declaredCashAmount).toFixed(2),
    );

    if (!Number.isFinite(declaredCashAmount) || declaredCashAmount < 0) {
      throw new Error(
        "Enter a declared cash amount of zero or more for EOD reconciliation.",
      );
    }

    const shift = input.shiftId
      ? ((await this.getShiftRows("WHERE [id] = @shiftId", { shiftId: input.shiftId }))[0] ?? null)
      : await this.getOpenShiftRow();

    if (!shift) {
      throw new Error(
        "Choose an open or recently closed shift before recording EOD reconciliation.",
      );
    }

    const existing = await this.query<{ id: string }>(
      "SELECT TOP (1) [id] FROM [dbo].[eod_reconciliation] WHERE [shift_id] = @shiftId",
      { shiftId: shift.id },
    );

    if (existing.recordset[0]) {
      throw new Error(`${shift.shift_no} has already been reconciled in SQL Server.`);
    }

    const timestamp = isoNow();
    const [metadata, shiftSummary] = await Promise.all([
      this.metadata(),
      this.toShiftSummary(shift),
    ]);
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const reconciliationId = randomUUID();
    const reconciliationNo = buildLocalDocumentNo(
      "EOD",
      storeCode,
      await this.nextSequence("eod_reconciliation_sequence"),
      timestamp,
    );
    const varianceAmount = Number(
      (declaredCashAmount - shiftSummary.expectedCashAmount).toFixed(2),
    );
    const operatorName = input.operatorName?.trim() || null;
    const note = input.note?.trim() || null;
    const payload: StoreEodReconciliationRecordedPayload = {
      reconciliationId,
      reconciliationNo,
      storeCode,
      terminalCode,
      shiftId: shiftSummary.shiftId,
      shiftNo: shiftSummary.shiftNo,
      cashierCode: shiftSummary.cashierCode,
      expectedCashAmount: shiftSummary.expectedCashAmount,
      declaredCashAmount,
      varianceAmount,
      netSalesAmount: shiftSummary.netSalesAmount,
      cashTenderedAmount: shiftSummary.cashTenderedAmount,
      nonCashTenderedAmount: shiftSummary.nonCashTenderedAmount,
      transactionCount: shiftSummary.transactionCount,
      operatorName,
      note,
      reconciledAt: timestamp,
    };

    await this.query(
      `INSERT INTO [dbo].[eod_reconciliation] (
        [id],
        [reconciliation_no],
        [shift_id],
        [shift_no],
        [cashier_code],
        [expected_cash_amount],
        [declared_cash_amount],
        [variance_amount],
        [net_sales_amount],
        [cash_tendered_amount],
        [non_cash_tendered_amount],
        [transaction_count],
        [operator_name],
        [note],
        [synced_at],
        [reconciled_at],
        [updated_at]
      ) VALUES (
        @reconciliationId,
        @reconciliationNo,
        @shiftId,
        @shiftNo,
        @cashierCode,
        @expectedCashAmount,
        @declaredCashAmount,
        @varianceAmount,
        @netSalesAmount,
        @cashTenderedAmount,
        @nonCashTenderedAmount,
        @transactionCount,
        @operatorName,
        @note,
        NULL,
        @timestamp,
        @timestamp
      )`,
      {
        reconciliationId,
        reconciliationNo,
        shiftId: shiftSummary.shiftId,
        shiftNo: shiftSummary.shiftNo,
        cashierCode: shiftSummary.cashierCode,
        expectedCashAmount: shiftSummary.expectedCashAmount,
        declaredCashAmount,
        varianceAmount,
        netSalesAmount: shiftSummary.netSalesAmount,
        cashTenderedAmount: shiftSummary.cashTenderedAmount,
        nonCashTenderedAmount: shiftSummary.nonCashTenderedAmount,
        transactionCount: shiftSummary.transactionCount,
        operatorName,
        note,
        timestamp,
      },
    );

    if (shouldQueueEnterprise) {
      await this.insertOutboxEvent({
        nodeCode,
        timestamp,
        aggregateType: "eodReconciliation",
        aggregateId: reconciliationId,
        eventType: "eod-reconciliation.recorded",
        idempotencyKey: `${nodeCode}:eodReconciliation:${reconciliationNo}`,
        payload,
        recordVersion: 1,
      });
    }

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${reconciliationNo} reconciled ${shiftSummary.shiftNo} with a cash variance of ${varianceAmount.toFixed(2)}.`,
      upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: shouldQueueEnterprise
        ? `${reconciliationNo} was recorded locally and queued for enterprise sync.`
        : `${reconciliationNo} was recorded locally for standalone EOD.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async recordBankingDeposit(
    input: StoreRecordBankingDepositRequest,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      purpose: "recording a banking deposit",
    });

    const amount = Number(Number(input.amount).toFixed(2));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a banking deposit amount greater than zero.");
    }

    const reconciliation = await this.getEodReconciliationRow(
      input.reconciliationId,
    );

    if (!reconciliation) {
      throw new Error(
        "Choose a recorded EOD reconciliation before banking cash.",
      );
    }

    const alreadyDeposited = await this.countScalar(
      "SELECT ISNULL(SUM([amount]), 0) AS [value] FROM [dbo].[banking_deposit] WHERE [reconciliation_id] = @reconciliationId",
      { reconciliationId: reconciliation.id },
    );
    const remainingCash = Number(
      (
        asNumber(reconciliation.declared_cash_amount) - alreadyDeposited
      ).toFixed(2),
    );

    if (amount > remainingCash) {
      throw new Error(
        `Flash ERP cannot bank more than the remaining declared cash balance of ${remainingCash.toFixed(2)}.`,
      );
    }

    const [metadata, bankAccount, bankAccounts] = await Promise.all([
      this.metadata(),
      this.getBankAccountById(input.bankAccountId),
      this.listActiveBankAccounts(),
    ]);

    if (bankAccounts.length > 0 && !bankAccount) {
      throw new Error(
        "Select the bank, branch, and account number before recording the banking deposit.",
      );
    }

    const timestamp = isoNow();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const depositId = randomUUID();
    const depositNo = buildLocalDocumentNo(
      "BNK",
      storeCode,
      await this.nextSequence("banking_deposit_sequence"),
      timestamp,
    );
    const bankName = bankAccount?.bankName ?? input.bankName?.trim() ?? null;
    const reference = input.reference?.trim() || null;
    const operatorName = input.operatorName?.trim() || null;
    const note = input.note?.trim() || null;
    const payload: StoreBankingDepositRecordedPayload = {
      depositId,
      depositNo,
      storeCode,
      terminalCode,
      reconciliationId: reconciliation.id,
      reconciliationNo: reconciliation.reconciliation_no,
      shiftId: reconciliation.shift_id,
      shiftNo: reconciliation.shift_no,
      amount,
      bankName,
      bankAccountId: bankAccount?.bankAccountId ?? null,
      bankCode: bankAccount?.bankCode ?? null,
      bankBranchCode: bankAccount?.branchCode ?? null,
      bankBranchName: bankAccount?.branchName ?? null,
      bankAccountNumber: bankAccount?.accountNumber ?? null,
      bankAccountName: bankAccount?.accountName ?? null,
      reference,
      operatorName,
      note,
      depositedAt: timestamp,
    };

    await this.query(
      `INSERT INTO [dbo].[banking_deposit] (
        [id],
        [deposit_no],
        [reconciliation_id],
        [reconciliation_no],
        [shift_id],
        [shift_no],
        [amount],
        [bank_account_id],
        [bank_name],
        [bank_code],
        [bank_branch_code],
        [bank_branch_name],
        [bank_account_number],
        [bank_account_name],
        [reference],
        [operator_name],
        [note],
        [synced_at],
        [deposited_at],
        [updated_at]
      ) VALUES (
        @depositId,
        @depositNo,
        @reconciliationId,
        @reconciliationNo,
        @shiftId,
        @shiftNo,
        @amount,
        @bankAccountId,
        @bankName,
        @bankCode,
        @bankBranchCode,
        @bankBranchName,
        @bankAccountNumber,
        @bankAccountName,
        @reference,
        @operatorName,
        @note,
        NULL,
        @timestamp,
        @timestamp
      )`,
      {
        depositId,
        depositNo,
        reconciliationId: reconciliation.id,
        reconciliationNo: reconciliation.reconciliation_no,
        shiftId: reconciliation.shift_id,
        shiftNo: reconciliation.shift_no,
        amount,
        bankAccountId: bankAccount?.bankAccountId ?? null,
        bankName,
        bankCode: bankAccount?.bankCode ?? null,
        bankBranchCode: bankAccount?.branchCode ?? null,
        bankBranchName: bankAccount?.branchName ?? null,
        bankAccountNumber: bankAccount?.accountNumber ?? null,
        bankAccountName: bankAccount?.accountName ?? null,
        reference,
        operatorName,
        note,
        timestamp,
      },
    );

    if (shouldQueueEnterprise) {
      await this.insertOutboxEvent({
        nodeCode,
        timestamp,
        aggregateType: "bankingDeposit",
        aggregateId: depositId,
        eventType: "banking-deposit.recorded",
        idempotencyKey: `${nodeCode}:bankingDeposit:${depositNo}`,
        payload,
        recordVersion: 1,
      });
    }

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${depositNo} banked ${amount.toFixed(2)} against ${reconciliation.reconciliation_no}.`,
      upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: shouldQueueEnterprise
        ? `${depositNo} was recorded locally and queued for enterprise sync.`
        : `${depositNo} was recorded locally for standalone banking.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStoreExpenseDraft(
    input: StoreStoreExpenseInput,
  ): Promise<StoreSyncActionResult> {
    const session = await this.requireActiveOperatorSession({
      purpose: "capturing a store expense",
    });

    if (!session.capabilities.supervisorEligible) {
      throw new Error(
        "Only a synced supervisor can capture store expenses from the desktop.",
      );
    }

    const category = input.category?.trim();
    const description = input.description?.trim();
    const amount = Number(Number(input.amount).toFixed(2));
    const taxAmount = Number(Number(input.taxAmount ?? 0).toFixed(2));

    if (!category) {
      throw new Error("Select or enter the expense category.");
    }

    if (!description) {
      throw new Error("Enter the expense details before saving.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter an expense amount greater than zero.");
    }

    if (!Number.isFinite(taxAmount) || taxAmount < 0) {
      throw new Error("Enter a tax amount of zero or greater.");
    }

    const expenseDateInput = input.expenseDate?.trim();
    const expenseDate = expenseDateInput
      ? new Date(`${expenseDateInput.slice(0, 10)}T00:00:00.000Z`).toISOString()
      : new Date().toISOString();

    if (Number.isNaN(new Date(expenseDate).getTime())) {
      throw new Error("Choose a valid expense date.");
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const expenseId = input.expenseId?.trim() || randomUUID();
    const existingResult = await this.query<{
      id: string;
      expense_no: string;
      status: string;
    }>(
      `SELECT TOP 1 [id], [expense_no], [status]
       FROM [dbo].[local_store_expense]
       WHERE [id] = @expenseId`,
      { expenseId },
    );
    const existing = existingResult.recordset[0] ?? null;

    if (existing && existing.status !== "DRAFT") {
      throw new Error(
        `${existing.expense_no} has already been confirmed and cannot be edited locally.`,
      );
    }

    const expenseNo =
      existing?.expense_no ??
      buildLocalDocumentNo(
        "EXP",
        storeCode,
        await this.nextSequence("store_expense_sequence"),
        timestamp,
      );
    const operatorName =
      input.operatorName?.trim() || session.displayName || session.loginId;

    await this.query(
      `MERGE [dbo].[local_store_expense] AS target
       USING (SELECT @expenseId AS [id]) AS source
       ON target.[id] = source.[id]
       WHEN MATCHED THEN
         UPDATE SET
           [expense_date] = @expenseDate,
           [category] = @category,
           [description] = @description,
           [supplier_name] = @supplierName,
           [payment_method] = @paymentMethod,
           [external_reference] = @externalReference,
           [amount] = @amount,
           [tax_amount] = @taxAmount,
           [attachment_file_name] = @attachmentFileName,
           [attachment_url] = @attachmentUrl,
           [attachment_content_type] = @attachmentContentType,
           [attachment_content_base64] = @attachmentContentBase64,
           [operator_name] = @operatorName,
           [note] = @note,
           [updated_at] = @timestamp
       WHEN NOT MATCHED THEN
         INSERT (
           [id], [expense_no], [status], [expense_date], [category],
           [description], [supplier_name], [payment_method],
           [external_reference], [amount], [tax_amount],
           [attachment_file_name], [attachment_url],
           [attachment_content_type], [attachment_content_base64],
           [operator_name], [note], [confirmed_by], [confirmed_at],
           [synced_at], [updated_at]
         )
         VALUES (
           @expenseId, @expenseNo, N'DRAFT', @expenseDate, @category,
           @description, @supplierName, @paymentMethod,
           @externalReference, @amount, @taxAmount,
           @attachmentFileName, @attachmentUrl,
           @attachmentContentType, @attachmentContentBase64,
           @operatorName, @note, NULL, NULL, NULL, @timestamp
         );`,
      {
        expenseId,
        expenseNo,
        expenseDate,
        category,
        description,
        supplierName: input.supplierName?.trim() || null,
        paymentMethod: input.paymentMethod?.trim() || null,
        externalReference: input.externalReference?.trim() || null,
        amount,
        taxAmount,
        attachmentFileName: input.attachmentFileName?.trim() || null,
        attachmentUrl: input.attachmentUrl?.trim() || null,
        attachmentContentType: input.attachmentContentType?.trim() || null,
        attachmentContentBase64: input.attachmentContentBase64?.trim() || null,
        operatorName,
        note: input.note?.trim() || null,
        timestamp,
      },
    );

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${expenseNo} store expense draft saved.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${expenseNo} was saved as a store expense draft.`,
      snapshot: await this.getSyncSnapshot(),
      expenseId,
      expenseNo,
      expenseStatus: "DRAFT",
    };
  }

  async confirmStoreExpense(expenseId: string): Promise<StoreSyncActionResult> {
    const session = await this.requireActiveOperatorSession({
      purpose: "confirming a store expense",
    });

    if (!session.capabilities.supervisorEligible) {
      throw new Error(
        "Only a synced supervisor can confirm store expenses from the desktop.",
      );
    }

    const normalizedExpenseId = expenseId.trim();

    if (!normalizedExpenseId) {
      throw new Error("Choose the expense draft before confirming it.");
    }

    const rowResult = await this.query<{
      id: string;
      expense_no: string;
      status: string;
      expense_date: string;
      category: string;
      description: string;
      supplier_name: string | null;
      payment_method: string | null;
      external_reference: string | null;
      amount: number;
      tax_amount: number | null;
      attachment_file_name: string | null;
      attachment_url: string | null;
      attachment_content_type: string | null;
      attachment_content_base64: string | null;
      operator_name: string | null;
      note: string | null;
      confirmed_at: string | null;
    }>(
      `SELECT TOP 1
         [id], [expense_no], [status], [expense_date], [category],
         [description], [supplier_name], [payment_method],
         [external_reference], [amount], [tax_amount],
         [attachment_file_name], [attachment_url],
         [attachment_content_type], [attachment_content_base64],
         [operator_name], [note], [confirmed_at]
       FROM [dbo].[local_store_expense]
       WHERE [id] = @expenseId`,
      { expenseId: normalizedExpenseId },
    );
    const row = rowResult.recordset[0] ?? null;

    if (!row) {
      throw new Error("Flash ERP could not find that local store expense draft.");
    }

    if (row.status === "POSTED") {
      return {
        message: `${row.expense_no} has already been posted by HQ Finance.`,
        snapshot: await this.getSyncSnapshot(),
        expenseId: normalizedExpenseId,
        expenseNo: row.expense_no,
        expenseStatus: "POSTED",
      };
    }

    if (row.status !== "DRAFT" && row.status !== "APPROVED") {
      throw new Error(`${row.expense_no} cannot be confirmed from status ${row.status}.`);
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const confirmedBy = session.displayName || session.loginId;
    const confirmedAt = row.confirmed_at ?? timestamp;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();

    await this.query(
      `UPDATE [dbo].[local_store_expense]
       SET [status] = N'APPROVED',
           [confirmed_by] = @confirmedBy,
           [confirmed_at] = @confirmedAt,
           [updated_at] = @timestamp
       WHERE [id] = @expenseId`,
      {
        confirmedBy,
        confirmedAt,
        timestamp,
        expenseId: normalizedExpenseId,
      },
    );

    const outboxResult = await this.query<{ id: string }>(
      `SELECT TOP 1 [id]
       FROM [dbo].[sync_outbox]
       WHERE [aggregate_type] = N'storeExpense'
         AND [aggregate_id] = @expenseId
         AND [event_type] = N'store-expense.confirmed'`,
      { expenseId: normalizedExpenseId },
    );

    if (shouldQueueEnterprise && !outboxResult.recordset[0]) {
      const payload: StoreExpenseConfirmedPayload = {
        expenseId: row.id,
        expenseNo: row.expense_no,
        storeCode,
        terminalCode,
        expenseDate: row.expense_date,
        category: row.category,
        description: row.description,
        supplierName: row.supplier_name,
        paymentMethod: row.payment_method,
        externalReference: row.external_reference,
        amount: Number(row.amount),
        taxAmount: Number(row.tax_amount ?? 0),
        attachmentFileName: row.attachment_file_name,
        attachmentUrl: row.attachment_url,
        attachmentContentType: row.attachment_content_type,
        attachmentContentBase64: row.attachment_content_base64,
        operatorName: row.operator_name ?? confirmedBy,
        note: row.note,
        confirmedAt,
      };

      await this.insertOutboxEvent({
        eventId: normalizedExpenseId,
        nodeCode,
        timestamp,
        aggregateType: "storeExpense",
        aggregateId: normalizedExpenseId,
        eventType: "store-expense.confirmed",
        idempotencyKey: `${nodeCode}:storeExpense:${row.expense_no}`,
        payload,
        recordVersion: 1,
      });
    }

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${row.expense_no} store expense confirmed.`,
      upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: shouldQueueEnterprise
        ? `${row.expense_no} was confirmed locally and queued for HQ Finance.`
        : `${row.expense_no} was confirmed locally for standalone expense review.`,
      snapshot: await this.getSyncSnapshot(),
      expenseId: normalizedExpenseId,
      expenseNo: row.expense_no,
      expenseStatus: "APPROVED",
    };
  }

  async authorizeReceiptPrint(input: { autoPrint?: boolean }) {
    if (input.autoPrint) {
      return;
    }

    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.receipt.reprint"],
      purpose: "printing a completed receipt",
    });
  }

  async saveReceiptPrinterSettings(
    input: StoreReceiptPrinterSettingsInput,
  ): Promise<StoreSyncActionResult> {
    const selectedPrinterName = input.selectedPrinterName?.trim() || null;

    if (input.silentPrintEnabled && !selectedPrinterName) {
      throw new Error(
        "Flash ERP needs a selected printer before silent thermal printing can be enabled.",
      );
    }

    const timestamp = isoNow();

    if (selectedPrinterName) {
      await this.setMetadata(
        this.getTerminalMetadataKey("receipt_printer_name"),
        selectedPrinterName,
      );
    } else {
      await this.deleteMetadata(
        this.getTerminalMetadataKey("receipt_printer_name"),
      );
    }

    await this.setMetadata(
      this.getTerminalMetadataKey("receipt_printer_silent"),
      input.silentPrintEnabled ? "1" : "0",
    );
    await this.setMetadata(
      this.getTerminalMetadataKey("receipt_auto_print"),
      input.autoPrintOnComplete ? "1" : "0",
    );
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary:
        "Thermal receipt printer routing was updated on this SQL Server store node.",
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    const printerLabel = selectedPrinterName ?? "manual preview only";

    return {
      message: input.silentPrintEnabled
        ? `Flash ERP will now auto-route thermal receipts to ${printerLabel} with silent printing when the lane is configured to print.`
        : `Flash ERP saved the thermal receipt routing. Completed baskets will ${
            input.autoPrintOnComplete
              ? "open the print flow"
              : "stay on screen until the cashier prints manually"
          }, and manual printing will use ${printerLabel}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveLocalReceiptLogo(
    input: StoreLocalReceiptLogoInput,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      purpose: "saving the local receipt logo",
    });
    const companyLogoUrl = optionalSetupText(input.companyLogoUrl);
    const timestamp = isoNow();

    if (companyLogoUrl) {
      await this.setMetadata("local_company_logo_url", companyLogoUrl);
    } else {
      await this.deleteMetadata("local_company_logo_url");
    }

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: companyLogoUrl
        ? "Local receipt logo was saved on this SQL Server store node."
        : "Local receipt logo was cleared on this SQL Server store node.",
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: companyLogoUrl
        ? "Local receipt logo was saved on this shop desktop."
        : "Local receipt logo was cleared on this shop desktop.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async prepareThermalTestSlip() {
    const session = await this.requireActiveOperatorSession({
      permissionCodes: ["pos.receipt.reprint"],
      purpose: "printing a thermal hardware test slip",
    });
    const metadata = await this.metadata();
    const printerSettings = this.getReceiptPrinterSettingsSummary(metadata);
    const selectedPrinterName =
      printerSettings.selectedPrinterName?.trim() || null;

    if (!selectedPrinterName) {
      throw new Error(
        "Select and save a receipt printer on this desktop before printing a thermal test slip.",
      );
    }

    return {
      retailOrgName:
        metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      storeName: metadata.store_name ?? defaultStoreConfig.storeName,
      terminalCode: this.getTerminalCode(),
      operatorLabel: this.formatOperatorLabel(session),
      selectedPrinterName,
      generatedAt: isoNow(),
    };
  }

  async prepareCashDrawerKick(input?: StoreCashDrawerKickRequest) {
    const session = await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "opening the cash drawer",
    });
    const openShift = await this.getOpenShiftRow();

    if (!openShift) {
      throw new Error("Open a cashier shift before opening the cash drawer.");
    }

    const metadata = await this.metadata();
    const printerSettings = this.getReceiptPrinterSettingsSummary(metadata);
    const selectedPrinterName =
      printerSettings.selectedPrinterName?.trim() || null;

    if (!selectedPrinterName) {
      throw new Error(
        "Select and save a receipt printer on this desktop before Flash ERP can trigger the cash drawer route.",
      );
    }

    const eligibleTenderMethods = (await this.listActiveTenderMethods()).filter(
      (method) => method.allowOpenCashDrawer,
    );

    if (eligibleTenderMethods.length === 0) {
      throw new Error(
        "No active tender method on this desktop is currently allowed to open the cash drawer.",
      );
    }

    const normalizedTenderMethodCode =
      input?.tenderMethodCode?.trim().toUpperCase() ?? "";
    const selectedTenderMethod =
      (normalizedTenderMethodCode
        ? eligibleTenderMethods.find(
            (method) =>
              method.tenderMethodCode.trim().toUpperCase() ===
              normalizedTenderMethodCode,
          )
        : eligibleTenderMethods[0]) ?? null;

    if (!selectedTenderMethod) {
      throw new Error(
        "Choose a drawer-enabled tender method before opening the cash drawer.",
      );
    }

    return {
      retailOrgName:
        metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      storeName: metadata.store_name ?? defaultStoreConfig.storeName,
      terminalCode: this.getTerminalCode(),
      shiftNo: openShift.shift_no,
      cashierCode: openShift.cashier_code,
      operatorLabel: this.formatOperatorLabel(session),
      selectedPrinterName,
      tenderMethodCode: selectedTenderMethod.tenderMethodCode,
      tenderMethodName: selectedTenderMethod.tenderMethodName,
      reason: input?.reason?.trim() || null,
      generatedAt: isoNow(),
    };
  }

  private async startReceiptLinkedBasket(
    transactionNo: string,
    transactionType: Extract<SyncPosTransactionType, "RETURN" | "EXCHANGE">,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: [
        transactionType === "RETURN"
          ? "pos.return.process"
          : "pos.exchange.process",
        "pos.receipt.search",
      ],
      purpose:
        transactionType === "RETURN"
          ? "starting a receipt-linked return"
          : "starting a receipt-linked exchange",
    });

    const normalizedTransactionNo = transactionNo.trim().toUpperCase();

    if (!normalizedTransactionNo) {
      throw new Error(
        "Enter a receipt number before starting a correction basket.",
      );
    }

    if (await this.getActiveBasketId()) {
      throw new Error(
        "Flash ERP already has an active basket. Park or complete it before starting a receipt-linked correction.",
      );
    }

    const sourceReceipt = await this.lookupReceiptForCorrection(
      normalizedTransactionNo,
    );

    if (!sourceReceipt) {
      throw new Error(
        `Flash ERP could not find completed receipt "${normalizedTransactionNo}" in the SQL Server store ledger.`,
      );
    }

    if (sourceReceipt.eligibleLineCount === 0) {
      throw new Error(
        `Receipt ${sourceReceipt.sourceTransactionNo} has no remaining quantity eligible for return or exchange.`,
      );
    }

    const timestamp = isoNow();
    const basket = await this.ensureActiveBasket(timestamp, transactionType, {
      id: sourceReceipt.sourceTransactionId,
      transactionNo: sourceReceipt.sourceTransactionNo,
      customerId: sourceReceipt.customerId,
    });
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${basket.transaction_no} was opened as a receipt-linked ${transactionType.toLowerCase()} basket from ${sourceReceipt.sourceTransactionNo} on SQL Server.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message:
        transactionType === "RETURN"
          ? `Flash ERP opened return basket ${basket.transaction_no} from receipt ${sourceReceipt.sourceTransactionNo}.`
          : `Flash ERP opened exchange basket ${basket.transaction_no} from receipt ${sourceReceipt.sourceTransactionNo}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async startReturnFromReceipt(
    transactionNo: string,
  ): Promise<StoreSyncActionResult> {
    return this.startReceiptLinkedBasket(transactionNo, "RETURN");
  }

  async startExchangeFromReceipt(
    transactionNo: string,
  ): Promise<StoreSyncActionResult> {
    return this.startReceiptLinkedBasket(transactionNo, "EXCHANGE");
  }

  async startReturnBasket(
    input: StoreSupervisorOverrideInput,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.return.process"],
      purpose: "starting a manual return basket",
    });
    const supervisor = await this.requireSupervisorOverride(input);

    if (await this.getActiveBasketId()) {
      throw new Error(
        "Flash ERP already has an active basket. Park or complete it before starting a return.",
      );
    }

    const timestamp = isoNow();
    const basket = await this.ensureActiveBasket(timestamp, "RETURN");
    const auditNote = [
      `Supervisor override approved by ${supervisor.displayName} (${supervisor.loginId}) for a manual return basket.`,
      input.note?.trim() || null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");

    await this.query(
      "UPDATE [dbo].[pos_transaction] SET [notes] = @auditNote, [updated_at] = @timestamp WHERE [id] = @basketId",
      { auditNote, timestamp, basketId: basket.id },
    );
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP opened return basket ${basket.transaction_no} with supervisor approval from ${supervisor.displayName}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async startExchangeBasket(
    input: StoreSupervisorOverrideInput,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.exchange.process"],
      purpose: "starting a manual exchange basket",
    });
    const supervisor = await this.requireSupervisorOverride(input);

    if (await this.getActiveBasketId()) {
      throw new Error(
        "Flash ERP already has an active basket. Park or complete it before starting an exchange.",
      );
    }

    const timestamp = isoNow();
    const basket = await this.ensureActiveBasket(timestamp, "EXCHANGE");
    const auditNote = [
      `Supervisor override approved by ${supervisor.displayName} (${supervisor.loginId}) for a manual exchange basket.`,
      input.note?.trim() || null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");

    await this.query(
      "UPDATE [dbo].[pos_transaction] SET [notes] = @auditNote, [updated_at] = @timestamp WHERE [id] = @basketId",
      { auditNote, timestamp, basketId: basket.id },
    );
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP opened exchange basket ${basket.transaction_no} with supervisor approval from ${supervisor.displayName}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async addReceiptLineToBasket(
    input: StoreReceiptLineReturnRequest,
  ): Promise<StoreSyncActionResult> {
    const activeBasket = await this.getActiveBasketSummary();

    await this.requireActiveOperatorSession({
      permissionCodes: [
        activeBasket?.transactionType === "EXCHANGE"
          ? "pos.exchange.process"
          : "pos.return.process",
      ],
      purpose: "adding a receipt line to the current correction basket",
    });

    const normalizedQuantity = Number(Number(input.quantity).toFixed(3));

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error(
        "Flash ERP needs a receipt return quantity greater than zero.",
      );
    }

    const basket = await this.requireActiveBasket();

    if (
      !basket.source_transaction_id ||
      basket.source_transaction_id !== input.sourceTransactionId
    ) {
      throw new Error(
        "Flash ERP could not match that receipt line to the currently active correction basket.",
      );
    }

    if (
      basket.transaction_type !== "RETURN" &&
      basket.transaction_type !== "EXCHANGE"
    ) {
      throw new Error(
        "Flash ERP only allows receipt-linked lines on return or exchange baskets.",
      );
    }

    const sourceHeader = await this.getReceiptHeaderById(
      input.sourceTransactionId,
    );

    if (!sourceHeader) {
      throw new Error(
        "Flash ERP could not reopen the original receipt from the SQL Server store ledger.",
      );
    }

    const sourceLine = (await this.getBasketLines(sourceHeader.id)).find(
      (line) => line.id === input.sourceLineId,
    );

    if (!sourceLine) {
      throw new Error("Flash ERP could not find that original receipt line.");
    }

    const product = await this.requireBasketProductLookup(
      sourceLine.product_code_snapshot,
    );
    const isSerialized =
      asBooleanFlag(product.is_serialized) ||
      readSerializedLineNumbers(sourceLine.serial_numbers_json).length > 0;
    const existingLine = await this.getBasketLineBySourceLine(
      basket.id,
      sourceLine.id,
      "RETURN",
    );
    const currentQuantity = existingLine
      ? Number(asNumber(existingLine.quantity).toFixed(3))
      : 0;
    const sourceQuantity = Number(asNumber(sourceLine.quantity).toFixed(3));
    const correctedQuantities =
      await this.getCorrectedReceiptLineQuantities(
        sourceHeader.id,
        sourceLine.id,
        existingLine?.id ?? null,
      );
    const maxReturnQuantity = Math.max(
      0,
      Number(
        (
          sourceQuantity -
          correctedQuantities.returnedQuantity -
          correctedQuantities.pendingQuantity
        ).toFixed(3),
      ),
    );
    const requestedQuantity = Number(
      (currentQuantity + normalizedQuantity).toFixed(3),
    );

    if (requestedQuantity > maxReturnQuantity) {
      throw new Error(
        `Only ${maxReturnQuantity.toFixed(3)} unit(s) of ${sourceLine.product_name_snapshot} can be returned from receipt ${sourceHeader.transaction_no}.`,
      );
    }

    const nextSerialNumbers = validateSerializedLineInput({
      isSerialized,
      productName: sourceLine.product_name_snapshot,
      quantity: requestedQuantity,
      serialNumbers: [
        ...readSerializedLineNumbers(existingLine?.serial_numbers_json),
        ...(input.serialNumbers ?? []),
      ],
    });
    const allowedSerialNumbers = readSerializedLineNumbers(
      sourceLine.serial_numbers_json,
    );

    if (isSerialized && nextSerialNumbers.length > 0) {
      ensureSerialSelectionWithinAllowedSet({
        productName: sourceLine.product_name_snapshot,
        selectedSerialNumbers: nextSerialNumbers,
        allowedSerialNumbers,
      });
    }

    const timestamp = isoNow();
    const nextAmounts = buildSourceLineAmounts(sourceLine, requestedQuantity);

    if (existingLine) {
      await this.query(
        `UPDATE [dbo].[pos_transaction_line]
         SET [serial_numbers_json] = @serialNumbersJson,
             [quantity] = @quantity,
             [unit_price] = @unitPrice,
             [applied_promotion_code] = @appliedPromotionCode,
             [applied_promotion_name] = @appliedPromotionName,
             [discount_amount] = @discountAmount,
             [tax_amount] = @taxAmount,
             [line_total] = @lineTotal
         WHERE [id] = @lineId`,
        {
          serialNumbersJson: writeSerializedLineNumbers(nextSerialNumbers),
          quantity: nextAmounts.quantity,
          unitPrice: nextAmounts.unitPrice,
          appliedPromotionCode: sourceLine.applied_promotion_code,
          appliedPromotionName: sourceLine.applied_promotion_name,
          discountAmount: nextAmounts.discountAmount,
          taxAmount: nextAmounts.taxAmount,
          lineTotal: nextAmounts.lineTotal,
          lineId: existingLine.id,
        },
      );
    } else {
      const insertedAmounts = buildSourceLineAmounts(
        sourceLine,
        normalizedQuantity,
      );

      await this.query(
        `INSERT INTO [dbo].[pos_transaction_line] (
          [id],
          [pos_transaction_id],
          [product_id],
          [inventory_location_code],
          [line_intent],
          [source_line_id],
          [applied_promotion_code],
          [applied_promotion_name],
          [product_code_snapshot],
          [product_name_snapshot],
          [serial_numbers_json],
          [quantity],
          [unit_price],
          [discount_amount],
          [tax_amount],
          [line_total],
          [manual_price_override],
          [manual_discount_override]
        ) VALUES (
          @lineId,
          @transactionId,
          @productId,
          @inventoryLocationCode,
          N'RETURN',
          @sourceLineId,
          @appliedPromotionCode,
          @appliedPromotionName,
          @productCode,
          @productName,
          @serialNumbersJson,
          @quantity,
          @unitPrice,
          @discountAmount,
          @taxAmount,
          @lineTotal,
          0,
          0
        )`,
        {
          lineId: randomUUID(),
          transactionId: basket.id,
          productId: product.id,
          inventoryLocationCode: sourceLine.inventory_location_code,
          sourceLineId: sourceLine.id,
          appliedPromotionCode: sourceLine.applied_promotion_code,
          appliedPromotionName: sourceLine.applied_promotion_name,
          productCode: sourceLine.product_code_snapshot,
          productName: sourceLine.product_name_snapshot,
          serialNumbersJson: writeSerializedLineNumbers(nextSerialNumbers),
          quantity: insertedAmounts.quantity,
          unitPrice: insertedAmounts.unitPrice,
          discountAmount: insertedAmounts.discountAmount,
          taxAmount: insertedAmounts.taxAmount,
          lineTotal: insertedAmounts.lineTotal,
        },
      );
    }

    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${sourceLine.product_name_snapshot} was added from receipt ${sourceHeader.transaction_no} into the active SQL Server correction basket.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message:
        basket.transaction_type === "EXCHANGE"
          ? `Flash ERP added ${sourceLine.product_name_snapshot} as a returned item from receipt ${sourceHeader.transaction_no}.`
          : `Flash ERP added ${sourceLine.product_name_snapshot} from receipt ${sourceHeader.transaction_no} into the return basket.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async attachCustomerToActiveBasket(
    input: StoreBasketCustomerAttachmentInput,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.customer.attach"],
      purpose: "attaching a customer to the active basket",
    });

    const timestamp = isoNow();
    const basket =
      input.customerId === null
        ? await this.requireActiveBasket()
        : await this.ensureActiveBasket(timestamp);
    await this.assertBasketIsEditable(basket.id);

    if (!input.customerId) {
      await this.query(
        `UPDATE [dbo].[pos_transaction]
         SET [customer_id] = NULL,
             [updated_at] = @timestamp,
             [record_version] = [record_version] + 1
         WHERE [id] = @transactionId`,
        { timestamp, transactionId: basket.id },
      );
      await this.refreshBasketTotals(basket.id, timestamp);
      await this.setMetadata("last_local_write_at", timestamp);

      return {
        message: `Flash ERP cleared the customer from basket ${basket.transaction_no}.`,
        snapshot: await this.getSyncSnapshot(),
      };
    }

    const result = await this.query<CustomerRow>(
      `SELECT TOP (1)
        [id],
        [customer_no],
        [full_name],
        [customer_type],
        [phone],
        [email],
        [home_store_code],
        [home_store_name],
        [city],
        [country_code],
        [loyalty_enrolled],
        [loyalty_tier],
        [loyalty_points_balance],
        [allow_credit_sales],
        [credit_limit_amount],
        [receivable_balance_amount],
        [note],
        [status],
        [updated_at]
       FROM [dbo].[customer]
       WHERE [id] = @customerId
         AND [deleted_at] IS NULL`,
      { customerId: input.customerId },
    );
    const customer = result.recordset[0] ?? null;

    if (!customer) {
      throw new Error(
        "Flash ERP could not find that customer in the shared SQL Server store database.",
      );
    }

    if (customer.status !== "ACTIVE") {
      throw new Error(
        `Flash ERP cannot attach ${customer.full_name} because that customer is ${customer.status.toLowerCase()}.`,
      );
    }

    await this.query(
      `UPDATE [dbo].[pos_transaction]
       SET [customer_id] = @customerId,
           [updated_at] = @timestamp,
           [record_version] = [record_version] + 1
       WHERE [id] = @transactionId`,
      {
        customerId: customer.id,
        timestamp,
        transactionId: basket.id,
      },
    );
    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${customer.full_name} (${customer.customer_no}) was attached to SQL Server basket ${basket.transaction_no}.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `Flash ERP attached ${customer.full_name} to basket ${basket.transaction_no}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async setActiveBasketLoyaltyRedemption(
    input: StoreBasketLoyaltyRedemptionInput,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.loyalty.redeem"],
      purpose: "redeeming loyalty on the active basket",
    });
    const requestedPoints = Math.max(
      0,
      Math.trunc(Number(input.pointsToRedeem ?? 0)),
    );

    if (!Number.isFinite(requestedPoints) || requestedPoints < 0) {
      throw new Error(
        "Flash ERP needs loyalty redemption points to be zero or greater.",
      );
    }

    if (requestedPoints > 0) {
      throw new Error(
        "SQL Server loyalty redemption is waiting for the loyalty adapter slice.",
      );
    }

    const basket = await this.requireActiveBasket();
    await this.assertBasketIsEditable(basket.id);
    const timestamp = isoNow();

    await this.query(
      `UPDATE [dbo].[pos_transaction]
       SET [loyalty_redemption_points] = 0,
           [loyalty_redemption_amount] = 0,
           [updated_at] = @timestamp,
           [record_version] = [record_version] + 1
       WHERE [id] = @basketId`,
      { timestamp, basketId: basket.id },
    );
    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${basket.transaction_no} cleared SQL Server loyalty redemption locally.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `Flash ERP cleared loyalty redemption from basket ${basket.transaction_no}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async assertBasketIsEditable(basketId: string) {
    const result = await this.query<{ order_no: string }>(
      `SELECT TOP (1) [order_no]
       FROM [dbo].[sales_order]
       WHERE [source_transaction_id] = @basketId
         AND [status] = N'OPEN'`,
      { basketId },
    );

    if (result.recordset[0]) {
      throw new Error(
        `${result.recordset[0].order_no} is locked for fulfilment. Exit fulfilment to return it to pending orders.`,
      );
    }
  }

  async addItemToBasket(
    input: StoreBasketItemRequest,
  ): Promise<StoreSyncActionResult> {
    const normalizedQuantity = Number(Number(input.quantity).toFixed(3));
    const deferInventoryValidation =
      input.deferInventoryValidationForSalesOrder === true;

    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "capturing basket items at the POS lane",
    });

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      throw new Error("Flash ERP needs a basket quantity greater than zero.");
    }

    const match = await this.findCatalogLookup(input.lookupValue);

    if (!match) {
      throw new Error(
        `Flash ERP could not find a local catalog item for "${input.lookupValue.trim()}".`,
      );
    }

    const timestamp = isoNow();
    const basket = await this.ensureActiveBasket(timestamp);
    await this.assertBasketIsEditable(basket.id);
    const lineIntent: SyncPosLineIntent =
      basket.transaction_type === "RETURN"
        ? "RETURN"
        : (input.lineIntent ?? "SALE");

    if (lineIntent !== "SALE") {
      throw new Error(
        "SQL Server return and exchange basket lines are waiting for the receipt-correction adapter slice.",
      );
    }

    const mustEnterPriceAtPos = asBooleanFlag(match.must_enter_price_at_pos);
    const requestedVariantCode =
      optionalSetupText(input.productVariantCode ?? match.product_variant_code)
        ?.toUpperCase() ?? null;
    const selectedVariant =
      match.product_type === "MATRIX" && requestedVariantCode
        ? await this.getMatrixVariantByCode(match.product_code, requestedVariantCode)
        : null;
    const selectedVariantAttributes = selectedVariant
      ? readMatrixVariantAttributes(selectedVariant.attributes_json)
      : [];
    const variantAttributesSnapshot =
      optionalSetupText(input.variantAttributesSnapshot) ??
      (selectedVariant
        ? formatMatrixVariantAttributes(selectedVariantAttributes)
        : null);

    if (match.product_type === "MATRIX" && !selectedVariant) {
      throw new Error(
        `Choose the matrix option for ${match.product_name} before adding it to the basket.`,
      );
    }

    const requestedUnitPrice =
      typeof input.unitPrice === "number"
        ? Number(input.unitPrice.toFixed(2))
        : null;

    if (
      mustEnterPriceAtPos &&
      (!Number.isFinite(requestedUnitPrice) ||
        requestedUnitPrice === null ||
        requestedUnitPrice <= 0)
    ) {
      throw new Error(
        `Enter the selling price for ${match.product_name} before adding it to the basket.`,
      );
    }

    const unitPrice = Number(
      asNumber(
        requestedUnitPrice ?? selectedVariant?.unit_price ?? match.unit_price,
      ).toFixed(2),
    );
    const activeBasketLines = await this.getBasketLines(basket.id);
    const currentBasketProductQuantity = activeBasketLines
      .filter(
        (line) =>
          line.product_code_snapshot === match.product_code &&
          (line.product_variant_code_snapshot ?? null) ===
            (selectedVariant?.variant_code ?? null) &&
          line.line_intent === lineIntent &&
          line.source_line_id === null,
      )
      .reduce((sum, line) => sum + asNumber(line.quantity), 0);
    const isSerialized = asBooleanFlag(match.is_serialized);
    const requestedSerialNumbers = input.serialNumbers ?? [];
    const validateSerialSelection =
      isSerialized &&
      (!deferInventoryValidation || requestedSerialNumbers.length > 0);
    const nextSerialNumbers = validateSerializedLineInput({
      isSerialized: validateSerialSelection,
      productName: match.product_name,
      quantity: normalizedQuantity,
      serialNumbers: requestedSerialNumbers,
    });
    const requestedQuantity = Number(
      (currentBasketProductQuantity + normalizedQuantity).toFixed(3),
    );
    const availableQuantity =
      selectedVariant
        ? asNumber(selectedVariant.quantity_on_hand)
        : asNumber(match.sales_location_quantity ?? match.quantity_on_hand);

    if (
      lineIntent === "SALE" &&
      asBooleanFlag(match.track_inventory) &&
      !isServiceProductType(match.product_type) &&
      !deferInventoryValidation &&
      availableQuantity < requestedQuantity
    ) {
      throw new Error(
        `Only ${Number(asNumber(availableQuantity).toFixed(3))} unit(s) of ${match.product_name} are available in the local sales position.`,
      );
    }

    if (
      lineIntent === "SALE" &&
      validateSerialSelection &&
      nextSerialNumbers.length > 0
    ) {
      const activeBasketSerialKeys = new Set(
        activeBasketLines
          .filter(
            (line) =>
              line.product_code_snapshot === match.product_code &&
              line.line_intent === lineIntent &&
              line.source_line_id === null,
          )
          .flatMap((line) =>
            readSerializedLineNumbers(line.serial_numbers_json),
          )
          .map((serialNumber) => serialNumber.toUpperCase()),
      );
      const duplicateSerialNumbers = nextSerialNumbers.filter((serialNumber) =>
        activeBasketSerialKeys.has(serialNumber.toUpperCase()),
      );

      if (duplicateSerialNumbers.length > 0) {
        throw new Error(
          `Serial number(s) ${duplicateSerialNumbers.join(", ")} are already in the active basket for ${match.product_name}.`,
        );
      }

      ensureSerialSelectionWithinAllowedSet({
        productName: match.product_name,
        selectedSerialNumbers: nextSerialNumbers,
        allowedSerialNumbers: await this.listAvailableSaleSerialNumbers(
          match.product_code,
          match.sales_location_code,
        ),
      });
    }

    const lineAmounts = calculateSaleLineAmounts({
      unitPrice,
      quantity: normalizedQuantity,
      taxable: asBooleanFlag(match.taxable),
      taxRatePercent: asNullableNumber(match.tax_rate_percent),
      taxInclusive: asBooleanFlag(match.tax_inclusive),
    });
    const variantSize = optionalSetupText(input.variantSize);
    const variantColor = optionalSetupText(input.variantColor);
    const lineNote = optionalSetupText(input.lineNote);

    await this.query(
      `INSERT INTO [dbo].[pos_transaction_line] (
        [id],
        [pos_transaction_id],
        [product_id],
        [inventory_location_code],
        [line_intent],
        [source_line_id],
        [product_code_snapshot],
        [product_variant_code_snapshot],
        [product_name_snapshot],
        [variant_size],
        [variant_color],
        [variant_attributes_snapshot],
        [line_note],
        [serial_numbers_json],
        [quantity],
        [unit_price],
        [discount_amount],
        [tax_amount],
        [line_total],
        [manual_price_override],
        [manual_discount_override]
      ) VALUES (
        @lineId,
        @transactionId,
        @productId,
        @inventoryLocationCode,
        @lineIntent,
        NULL,
        @productCode,
        @productVariantCode,
        @productName,
        @variantSize,
        @variantColor,
        @variantAttributesSnapshot,
        @lineNote,
        @serialNumbersJson,
        @quantity,
        @unitPrice,
        @discountAmount,
        @taxAmount,
        @lineTotal,
        @manualPriceOverride,
        0
      )`,
      {
        lineId: randomUUID(),
        transactionId: basket.id,
        productId: match.id,
        inventoryLocationCode: match.sales_location_code,
        lineIntent,
        productCode: match.product_code,
        productVariantCode: selectedVariant?.variant_code ?? null,
        productName: match.product_name,
        variantSize,
        variantColor,
        variantAttributesSnapshot,
        lineNote,
        serialNumbersJson: writeSerializedLineNumbers(nextSerialNumbers),
        quantity: normalizedQuantity,
        unitPrice,
        discountAmount: lineAmounts.discountAmount,
        taxAmount: lineAmounts.taxAmount,
        lineTotal: lineAmounts.lineTotal,
        manualPriceOverride: requestedUnitPrice === null ? 0 : 1,
      },
    );

    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: `${match.product_name} was added to the SQL Server active basket.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `Flash ERP added ${match.product_name} to the active basket.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async captureScannedSale(
    input: StoreSellCaptureRequest,
  ): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "capturing a scanned sale",
    });

    if (await this.getActiveBasketId()) {
      throw new Error(
        "Flash ERP already has an active basket. Complete or park it before using quick scanned capture.",
      );
    }

    const match = await this.findCatalogLookup(input.lookupValue);

    if (!match) {
      throw new Error(
        `Flash ERP could not find a local catalog item for "${input.lookupValue.trim()}".`,
      );
    }

    await this.addItemToBasket({
      ...input,
      lookupValue: input.lookupValue,
      lineIntent: "SALE",
    });
    const result = await this.checkoutActiveBasket();

    return {
      message:
        this.isStandaloneDeployment()
          ? match.matched_on === "barcode" && match.barcode_code
            ? `Flash ERP captured ${match.product_name} from barcode ${match.barcode_code} on the shared SQL Server store database.`
            : `Flash ERP captured ${match.product_name} on the shared SQL Server store database.`
          : match.matched_on === "barcode" && match.barcode_code
            ? `Flash ERP captured ${match.product_name} from barcode ${match.barcode_code} on the shared SQL Server store database and queued the sale for enterprise sync.`
            : `Flash ERP captured ${match.product_name} on the shared SQL Server store database and queued the sale for enterprise sync.`,
      snapshot: result.snapshot,
    };
  }

  async captureDemoSale(): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "capturing a demo sale",
    });

    if (await this.getActiveBasketId()) {
      throw new Error(
        "Flash ERP already has an active basket. Complete or park it before using demo capture.",
      );
    }

    const salesLocationCode = await this.getDefaultSalesLocationCode();
    const result = await this.query<ProductRow>(
      `SELECT TOP (1)
        product.[id],
        product.[product_code],
        product.[product_name],
        product.[product_type],
        product.[short_name],
        product.[description],
        product.[primary_image_url],
        product.[department_code],
        product.[category_code],
        product.[subcategory],
        product.[unit_of_measure],
        product.[taxable],
        product.[tax_profile_code],
        product.[tax_profile_name],
        product.[tax_rate_percent],
        product.[tax_inclusive],
        product.[track_inventory],
        product.[is_serialized],
        product.[must_enter_price_at_pos],
        product.[min_stock_level],
        product.[reorder_point],
        product.[safety_stock_level],
        product.[unit_price],
        product.[quantity_on_hand],
        product.[updated_at]
       FROM [dbo].[product_snapshot] AS product
       LEFT JOIN [dbo].[inventory_location_balance] AS balance
         ON balance.[product_code] = product.[product_code]
        AND balance.[location_code] = @salesLocationCode
       WHERE product.[must_enter_price_at_pos] = 0
         AND (
          product.[product_type] = 'SERVICE'
          OR
          product.[track_inventory] = 0
          OR ISNULL(balance.[quantity_on_hand], product.[quantity_on_hand]) > 0
        )
       ORDER BY product.[is_serialized] ASC, product.[product_code] ASC`,
      { salesLocationCode },
    );
    const product = result.recordset[0] ?? null;

    if (!product) {
      throw new Error(
        "Flash ERP could not find a saleable product in the shared SQL Server store database for demo capture.",
      );
    }

    const serialNumbers = asBooleanFlag(product.is_serialized)
      ? (
          await this.listAvailableSaleSerialNumbers(
            product.product_code,
            salesLocationCode,
          )
        ).slice(0, 1)
      : [];

    if (asBooleanFlag(product.is_serialized) && serialNumbers.length === 0) {
      throw new Error(
        `Flash ERP could not find an available serial number for ${product.product_name} in the shared store registry.`,
      );
    }

    const barcode = await this.getRepresentativeBarcode(product.product_code);
    const captureResult = await this.captureScannedSale({
      lookupValue: barcode?.barcode_code ?? product.product_code,
      quantity: 1,
      serialNumbers,
    });

    return {
      message: this.isStandaloneDeployment()
        ? "A local demo sale was captured on the shared SQL Server store database."
        : "A local demo sale was captured on the shared SQL Server store database and queued for enterprise sync.",
      snapshot: captureResult.snapshot,
    };
  }

  async updateBasketLine(
    input: StoreBasketLineUpdateRequest,
  ): Promise<StoreSyncActionResult> {
    const deferInventoryValidation =
      input.deferInventoryValidationForSalesOrder === true;
    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.sale.process"],
      purpose: "updating the active basket",
    });
    const normalizedQuantity = Number(Number(input.quantity).toFixed(3));

    if (!Number.isFinite(normalizedQuantity)) {
      throw new Error(
        "Flash ERP needs a valid basket quantity before updating the line.",
      );
    }

    if (normalizedQuantity <= 0) {
      return this.removeBasketLine(input.lineId);
    }

    const basket = await this.requireActiveBasket();
    await this.assertBasketIsEditable(basket.id);
    const line = await this.getBasketLine(input.lineId);

    if (!line || line.pos_transaction_id !== basket.id) {
      throw new Error(
        "Flash ERP could not find that line in the active basket.",
      );
    }

    if (line.line_intent !== "SALE" || line.source_line_id) {
      throw new Error(
        "SQL Server return and exchange basket lines are waiting for the receipt-correction adapter slice.",
      );
    }

    const product = await this.requireBasketProductLookup(
      line.product_code_snapshot,
    );
    const requestedUnitPrice =
      typeof input.overrideUnitPrice === "number" &&
      Number.isFinite(input.overrideUnitPrice)
        ? Number(input.overrideUnitPrice.toFixed(2))
        : undefined;
    const requestedDiscount =
      typeof input.overrideDiscountAmount === "number" &&
      Number.isFinite(input.overrideDiscountAmount)
        ? Number(input.overrideDiscountAmount.toFixed(2))
        : undefined;
    const requestedConfiguredDiscountRate =
      typeof input.configuredDiscountRate === "number" &&
      Number.isFinite(input.configuredDiscountRate) &&
      input.configuredDiscountRate > 0
        ? Number(input.configuredDiscountRate.toFixed(2))
        : null;
    const standardUnitPrice = Number(asNumber(product.unit_price).toFixed(2));
    const currentUnitPrice = Number(asNumber(line.unit_price).toFixed(2));
    const currentDiscountAmount = Number(asNumber(line.discount_amount).toFixed(2));
    const unitPrice =
      input.clearPricingOverride === true
        ? standardUnitPrice
        : requestedUnitPrice ?? currentUnitPrice;
    const discountAmount =
      input.clearPricingOverride === true
        ? 0
        : requestedDiscount ?? currentDiscountAmount;

    if (unitPrice <= 0) {
      throw new Error("Flash ERP needs a manual unit price greater than zero.");
    }

    if (discountAmount < 0) {
      throw new Error("Flash ERP needs a manual discount of zero or greater.");
    }

    const isSerialized = asBooleanFlag(product.is_serialized);
    const requestedSerialNumbers =
      input.serialNumbers ?? readSerializedLineNumbers(line.serial_numbers_json);
    const validateSerialSelection =
      isSerialized &&
      (!deferInventoryValidation || requestedSerialNumbers.length > 0);
    const nextSerialNumbers = validateSerializedLineInput({
      isSerialized: validateSerialSelection,
      productName: product.product_name,
      quantity: normalizedQuantity,
      serialNumbers: requestedSerialNumbers,
    });

    if (validateSerialSelection && nextSerialNumbers.length > 0) {
      ensureSerialSelectionWithinAllowedSet({
        productName: product.product_name,
        selectedSerialNumbers: nextSerialNumbers,
        allowedSerialNumbers: await this.listAvailableSaleSerialNumbers(
          product.product_code,
          product.sales_location_code,
        ),
      });
    }

    const lineAmounts = calculateSaleLineAmounts({
      unitPrice,
      quantity: normalizedQuantity,
      discountAmount,
      taxable: asBooleanFlag(product.taxable),
      taxRatePercent: asNullableNumber(product.tax_rate_percent),
      taxInclusive: asBooleanFlag(product.tax_inclusive),
    });
    const configuredDiscountRates = readPosDiscountRatesMetadata(
      (await this.metadata()).pos_discount_rates_json,
    );
    const configuredDiscountRateAllowed =
      requestedConfiguredDiscountRate !== null &&
      configuredDiscountRates.some(
        (rate) => rate.toFixed(2) === requestedConfiguredDiscountRate.toFixed(2),
      );
    const configuredDiscountAmountMatches =
      requestedConfiguredDiscountRate !== null &&
      requestedDiscount !== undefined &&
      Math.abs(
        discountAmount -
          Number(
            (unitPrice * normalizedQuantity * (requestedConfiguredDiscountRate / 100)).toFixed(2),
          ),
      ) < 0.01;
    const configuredDiscountLabel =
      configuredDiscountRateAllowed && configuredDiscountAmountMatches
        ? `POS discount ${formatDiscountRate(requestedConfiguredDiscountRate)}%`
        : null;
    const nextAppliedPromotionCode =
      input.clearPricingOverride === true ||
      requestedDiscount !== undefined ||
      requestedUnitPrice !== undefined
        ? null
        : line.applied_promotion_code;
    const nextAppliedPromotionName =
      input.clearPricingOverride === true
        ? null
        : configuredDiscountLabel ??
          (requestedDiscount !== undefined || requestedUnitPrice !== undefined
            ? null
            : line.applied_promotion_name);
    const timestamp = isoNow();

    await this.query(
      `UPDATE [dbo].[pos_transaction_line]
       SET [serial_numbers_json] = @serialNumbersJson,
           [quantity] = @quantity,
           [unit_price] = @unitPrice,
           [applied_promotion_code] = @appliedPromotionCode,
           [applied_promotion_name] = @appliedPromotionName,
           [discount_amount] = @discountAmount,
           [tax_amount] = @taxAmount,
           [line_total] = @lineTotal,
           [manual_price_override] = @manualPriceOverride,
           [manual_discount_override] = @manualDiscountOverride
       WHERE [id] = @lineId`,
      {
        serialNumbersJson: writeSerializedLineNumbers(nextSerialNumbers),
        quantity: normalizedQuantity,
        unitPrice,
        appliedPromotionCode: nextAppliedPromotionCode,
        appliedPromotionName: nextAppliedPromotionName,
        discountAmount: lineAmounts.discountAmount,
        taxAmount: lineAmounts.taxAmount,
        lineTotal: lineAmounts.lineTotal,
        manualPriceOverride:
          input.clearPricingOverride === true
            ? 0
            : requestedUnitPrice === undefined
              ? asBooleanFlag(line.manual_price_override) ? 1 : 0
              : requestedUnitPrice !== standardUnitPrice ? 1 : 0,
        manualDiscountOverride:
          input.clearPricingOverride === true
            ? 0
            : requestedDiscount === undefined
              ? asBooleanFlag(line.manual_discount_override) ? 1 : 0
              : requestedDiscount > 0 ? 1 : 0,
        lineId: line.id,
      },
    );
    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP updated ${line.product_name_snapshot} in the active basket.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async removeBasketLine(lineId: string): Promise<StoreSyncActionResult> {
    const activeBasket = await this.getActiveBasketSummary();

    await this.requireActiveOperatorSession({
      permissionCodes: [
        activeBasket?.transactionType === "RETURN"
          ? "pos.return.process"
          : activeBasket?.transactionType === "EXCHANGE"
            ? "pos.exchange.process"
            : "pos.sale.process",
      ],
      purpose: "removing an item from the active basket",
    });
    const basket = await this.requireActiveBasket();
    await this.assertBasketIsEditable(basket.id);
    const line = await this.getBasketLine(lineId);

    if (!line || line.pos_transaction_id !== basket.id) {
      throw new Error(
        "Flash ERP could not find that line in the active basket.",
      );
    }

    const timestamp = isoNow();

    await this.query(
      "DELETE FROM [dbo].[pos_transaction_line] WHERE [id] = @lineId",
      { lineId: line.id },
    );
    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP removed ${line.product_name_snapshot} from the active basket.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async discardActiveBasket(): Promise<StoreSyncActionResult> {
    await this.requireActiveOperatorSession({
      purpose: "clearing the active POS screen",
    });
    const basket = await this.requireActiveBasket();
    const lines = await this.getBasketLines(basket.id);
    const orderResult = await this.query<{ order_no: string }>(
      `SELECT TOP (1) [order_no]
       FROM [dbo].[sales_order]
       WHERE [source_transaction_id] = @transactionId
         AND [status] = N'OPEN'`,
      { transactionId: basket.id },
    );
    const linkedOrder = orderResult.recordset[0] ?? null;

    if (lines.length > 0 && !linkedOrder) {
      throw new Error(
        "Clear every basket line before resetting the active POS screen.",
      );
    }

    const timestamp = isoNow();

    await this.withTransaction(async (transaction) => {
      await this.deleteMetadata(this.getActiveBasketMetadataKey(), transaction);

      if (!linkedOrder) {
        await this.query(
          `DELETE FROM [dbo].[pos_transaction]
           WHERE [id] = @transactionId
             AND [status] = N'PARKED'`,
          { transactionId: basket.id },
          transaction,
        );
      }

      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: linkedOrder
        ? `${basket.transaction_no} was removed from the SQL Server sell lane and ${linkedOrder.order_no} remains available for fulfilment.`
        : `${basket.transaction_no} was discarded from the SQL Server POS lane before completion.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: linkedOrder
        ? `${linkedOrder.order_no} was returned to pending orders.`
        : `Flash ERP cleared basket ${basket.transaction_no} from the POS screen.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async parkActiveBasket(): Promise<StoreSyncActionResult> {
    const basket = await this.requireActiveBasket();
    await this.requireActiveOperatorSession({
      permissionCodes: [
        basket.transaction_type === "RETURN"
          ? "pos.return.process"
          : basket.transaction_type === "EXCHANGE"
            ? "pos.exchange.process"
            : "pos.sale.process",
      ],
      purpose: "parking the active basket",
    });

    const timestamp = isoNow();
    await this.deleteMetadata(this.getActiveBasketMetadataKey());
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP parked basket ${basket.transaction_no}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async resumeParkedBasket(
    transactionId: string,
  ): Promise<StoreSyncActionResult> {
    const basket = await this.getBasketHeader(transactionId);

    if (!basket || basket.status !== "PARKED") {
      throw new Error(
        "Flash ERP could not find that parked basket in SQL Server.",
      );
    }

    await this.requireActiveOperatorSession({
      permissionCodes: [
        basket.transaction_type === "RETURN"
          ? "pos.return.process"
          : basket.transaction_type === "EXCHANGE"
            ? "pos.exchange.process"
            : "pos.sale.process",
      ],
      purpose: "resuming a parked basket",
    });

    const timestamp = isoNow();
    await this.setMetadata(this.getActiveBasketMetadataKey(), basket.id);
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP resumed basket ${basket.transaction_no}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async checkoutActiveBasket(
    input?: StoreBasketCheckoutRequest,
  ): Promise<StoreSyncActionResult> {
    const basket = await this.requireActiveBasket();
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: [
        basket.transaction_type === "RETURN"
          ? "pos.return.process"
          : basket.transaction_type === "EXCHANGE"
            ? "pos.exchange.process"
            : "pos.sale.process",
      ],
      purpose: "checking out the active basket",
    });
    const timestamp = isoNow();

    await this.refreshBasketTotals(basket.id, timestamp);
    const refreshedBasket = await this.getBasketHeader(basket.id);

    if (!refreshedBasket) {
      throw new Error(
        "Flash ERP could not reload the active basket before checkout.",
      );
    }

    const lines = await this.getBasketLines(refreshedBasket.id);

    if (lines.length === 0) {
      throw new Error(
        "Add at least one item before checking out the active basket.",
      );
    }

    const shift = await this.getOpenShiftRow();

    if (!shift) {
      throw new Error(
        "Open a cashier shift before checking out the active basket.",
      );
    }

    const saleCashierCode = operatorSession.loginId;
    const totalAmount = Number(
      asNumber(refreshedBasket.total_amount).toFixed(2),
    );
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const salesOrderResult = await this.query<SalesOrderRow>(
      `SELECT TOP (1)
         [id],
         [order_no],
         [source_transaction_id],
         [source_transaction_no],
         [customer_id],
         [customer_no],
         [customer_name],
         [status],
         [total_amount],
         [deposit_amount],
         [balance_amount],
         [deposit_tender_method_code],
         [deposit_tender_method_name],
         [deposit_payment_method],
         [deposit_reference],
         [deposit_paid_at],
         0 AS [line_count],
         0 AS [item_count],
         [operator_name],
         [note],
         [fulfilled_transaction_id],
         [fulfilled_transaction_no],
         [synced_at],
         [created_at],
         [fulfilled_at],
         [cancelled_at],
         [updated_at]
       FROM [dbo].[sales_order]
       WHERE [source_transaction_id] = @transactionId
         AND [status] = N'OPEN'`,
      { transactionId: refreshedBasket.id },
    );
    const openSalesOrder = salesOrderResult.recordset[0] ?? null;
    const isSalesOrderFulfillment = Boolean(openSalesOrder);
    const depositCreditAmount = openSalesOrder
      ? Number(asNumber(openSalesOrder.deposit_amount).toFixed(2))
      : 0;
    const settlementAmount = openSalesOrder
      ? Number(Math.max(0, totalAmount - depositCreditAmount).toFixed(2))
      : totalAmount;
    const checkoutPayments = await this.normalizeCheckoutPayments(
      input,
      settlementAmount,
      refreshedBasket.transaction_no,
      timestamp,
      refreshedBasket.transaction_type,
    );
    const existingPaymentRows = openSalesOrder
      ? await this.getReceiptPaymentRows(refreshedBasket.id)
      : [];
    const existingPaymentPayloads: StorePosTransactionCompletedPayload["payments"] =
      existingPaymentRows.map((payment) => ({
        paymentId: payment.id,
        method: payment.method,
        tenderMethodCode: payment.tender_method_code,
        tenderMethodName: payment.tender_method_name,
        bankAccountId: payment.bank_account_id,
        bankCode: payment.bank_code,
        bankName: payment.bank_name,
        bankBranchCode: payment.bank_branch_code,
        bankBranchName: payment.bank_branch_name,
        bankAccountNumber: payment.bank_account_number,
        bankAccountName: payment.bank_account_name,
        amount: Number(asNumber(payment.amount).toFixed(2)),
        reference: payment.reference,
        receivedAt: payment.received_at,
      }));
    const combinedPaymentPayloads: StorePosTransactionCompletedPayload["payments"] =
      [
        ...existingPaymentPayloads,
        ...checkoutPayments.payments.map((payment) => ({
          paymentId: payment.paymentId,
          method: payment.method,
          tenderMethodCode: payment.tenderMethodCode,
          tenderMethodName: payment.tenderMethodName,
          bankAccountId: payment.bankAccountId,
          bankCode: payment.bankCode,
          bankName: payment.bankName,
          bankBranchCode: payment.bankBranchCode,
          bankBranchName: payment.bankBranchName,
          bankAccountNumber: payment.bankAccountNumber,
          bankAccountName: payment.bankAccountName,
          amount: payment.amount,
          reference: payment.reference,
          receivedAt: payment.receivedAt,
        })),
      ];
    const paidAmount = Number(
      combinedPaymentPayloads
        .reduce((sum, payment) => sum + payment.amount, 0)
        .toFixed(2),
    );
    const salesLocationCode = isSalesOrderFulfillment
      ? await this.getDefaultSalesOrderLocationCode()
      : await this.getDefaultSalesLocationCode();
    const headerReference = input?.headerReference?.trim() || null;
    const additionalDetails = input?.additionalDetails?.trim() || null;
    const saleRecordVersion = Math.max(
      1,
      asNumber(refreshedBasket.record_version) + 1,
    );
    const saleQuantityByProduct = new Map<string, number>();
    const checkoutLines: Array<{
      line: BasketLineRow;
      product: CatalogLookupRow;
      lineIntent: SyncPosLineIntent;
      inventoryLocationCode: string | null;
      quantity: number;
      serialNumbers: string[];
      barcode: string | null;
      selectedVariant: ProductVariantSnapshotRow | null;
    }> = [];

    for (const line of lines) {
      const lineIntent =
        refreshedBasket.transaction_type === "RETURN"
          ? "RETURN"
          : line.line_intent;

      if (
        refreshedBasket.transaction_type === "SALE" &&
        (line.line_intent !== "SALE" || line.source_line_id)
      ) {
        throw new Error(
          "SQL Server return and exchange basket lines are waiting for the receipt-correction adapter slice.",
        );
      }

      const product = await this.requireBasketProductLookup(
        line.product_code_snapshot,
      );
      const selectedVariant = line.product_variant_code_snapshot
        ? await this.getMatrixVariantByCode(
            line.product_code_snapshot,
            line.product_variant_code_snapshot,
          )
        : null;

      if (line.product_variant_code_snapshot && !selectedVariant) {
        throw new Error(
          `Flash ERP could not find local variant "${line.product_variant_code_snapshot}" for ${line.product_name_snapshot} during basket checkout.`,
        );
      }

      const lineLocationCode = isSalesOrderFulfillment
        ? salesLocationCode
        : line.inventory_location_code ?? salesLocationCode;
      const quantity = Number(asNumber(line.quantity).toFixed(3));
      const serialNumbers = validateSerializedLineInput({
        isSerialized: asBooleanFlag(product.is_serialized),
        productName: line.product_name_snapshot,
        quantity,
        serialNumbers: readSerializedLineNumbers(line.serial_numbers_json),
      });

      if (serialNumbers.length > 0 && lineIntent === "SALE") {
        ensureSerialSelectionWithinAllowedSet({
          productName: line.product_name_snapshot,
          selectedSerialNumbers: serialNumbers,
          allowedSerialNumbers: await this.listAvailableSaleSerialNumbers(
            line.product_code_snapshot,
            lineLocationCode,
          ),
        });
      }

      if (lineIntent === "SALE" && asBooleanFlag(product.track_inventory)) {
        const quantityKey = selectedVariant
          ? `${line.product_code_snapshot}:${selectedVariant.variant_code}`
          : line.product_code_snapshot;
        const availableQuantity =
          selectedVariant !== null
            ? selectedVariant.quantity_on_hand
            : lineLocationCode !== null
            ? await this.getOptionalLocationQuantity(
                lineLocationCode,
                line.product_code_snapshot,
              )
            : null;
        const localAvailableQuantity = Number(
          asNumber(availableQuantity ?? product.quantity_on_hand).toFixed(3),
        );
        const requestedProductQuantity = Number(
          (
            (saleQuantityByProduct.get(quantityKey) ?? 0) +
            quantity
          ).toFixed(3),
        );

        if (localAvailableQuantity < requestedProductQuantity) {
          throw new Error(
            openSalesOrder
              ? `${line.product_name_snapshot} requires ${requestedProductQuantity.toFixed(3)} available unit(s) to fulfil ${openSalesOrder.order_no}, but only ${localAvailableQuantity.toFixed(3)} unit(s) are available at the fulfilment location. Add or transfer inventory quantity before continuing.`
              : `${line.product_name_snapshot} requires ${requestedProductQuantity.toFixed(3)} available unit(s) to complete this sale, but only ${localAvailableQuantity.toFixed(3)} unit(s) are available at the sales location.`,
          );
        }

        saleQuantityByProduct.set(quantityKey, requestedProductQuantity);
      }

      checkoutLines.push({
        line,
        product,
        lineIntent,
        inventoryLocationCode: lineLocationCode,
        quantity,
        serialNumbers,
        barcode:
          selectedVariant?.barcode ??
          (await this.getRepresentativeBarcode(line.product_code_snapshot))
            ?.barcode_code ??
          null,
        selectedVariant,
      });
    }

    const salePayloadLines: StorePosTransactionCompletedPayload["lines"] =
      checkoutLines.map(
        ({ line, lineIntent, inventoryLocationCode, quantity, serialNumbers, barcode, selectedVariant }) => ({
          lineId: line.id,
          lineIntent,
          sourceLineId: line.source_line_id,
          productCode: line.product_code_snapshot,
          productVariantCode: selectedVariant?.variant_code ?? null,
          productName: line.product_name_snapshot,
          barcode,
          variantSize: line.variant_size,
          variantColor: line.variant_color,
          variantAttributesSnapshot: line.variant_attributes_snapshot,
          lineNote: line.line_note,
          serialNumbers,
          quantity,
          unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
          discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
          taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
          lineTotal: Number(asNumber(line.line_total).toFixed(2)),
          appliedPromotionCode: line.applied_promotion_code,
          appliedPromotionName: line.applied_promotion_name,
          inventoryLocationCode,
        }),
      );
    const salePayload: StorePosTransactionCompletedPayload = {
      transactionId: refreshedBasket.id,
      transactionNo: refreshedBasket.transaction_no,
      sourceTransactionId: refreshedBasket.source_transaction_id,
      sourceTransactionNo: refreshedBasket.source_transaction_no,
      storeCode,
      terminalCode,
      shiftId: shift.id,
      shiftNo: shift.shift_no,
      cashierCode: saleCashierCode,
      customerId: refreshedBasket.customer_id,
      customerNo: refreshedBasket.customer_no,
      customerName: refreshedBasket.customer_name,
      transactionType: refreshedBasket.transaction_type,
      status: "COMPLETED",
      subtotalAmount: Number(
        asNumber(refreshedBasket.subtotal_amount).toFixed(2),
      ),
      discountAmount: Number(
        asNumber(refreshedBasket.discount_amount).toFixed(2),
      ),
      loyaltyPointsRedeemed: Math.max(
        0,
        Math.trunc(asNumber(refreshedBasket.loyalty_redemption_points)),
      ),
      loyaltyRedemptionAmount: Number(
        asNumber(refreshedBasket.loyalty_redemption_amount).toFixed(2),
      ),
      taxAmount: Number(asNumber(refreshedBasket.tax_amount).toFixed(2)),
      totalAmount,
      paidAmount,
      changeAmount: checkoutPayments.changeAmount,
      notes: refreshedBasket.notes,
      headerReference,
      additionalDetails,
      completedAt: timestamp,
      lines: salePayloadLines,
      payments: combinedPaymentPayloads,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `UPDATE [dbo].[pos_transaction]
         SET [shift_id] = @shiftId,
             [cashier_code] = @cashierCode,
             [status] = N'COMPLETED',
             [paid_amount] = @paidAmount,
             [change_amount] = @changeAmount,
             [header_reference] = @headerReference,
             [additional_details] = @additionalDetails,
             [completed_at] = @timestamp,
             [record_version] = @saleRecordVersion,
             [updated_at] = @timestamp
         WHERE [id] = @transactionId`,
        {
          shiftId: shift.id,
          cashierCode: saleCashierCode,
          paidAmount,
          changeAmount: checkoutPayments.changeAmount,
          headerReference,
          additionalDetails,
          timestamp,
          saleRecordVersion,
          transactionId: refreshedBasket.id,
        },
        transaction,
      );
      await this.recordTransactionReferenceCapture(transaction, {
        reference: headerReference,
        details: additionalDetails,
        transactionNo: refreshedBasket.transaction_no,
        capturedAt: timestamp,
      });

      for (const { line, inventoryLocationCode } of checkoutLines) {
        if (line.inventory_location_code === inventoryLocationCode) {
          continue;
        }

        await this.query(
          `UPDATE [dbo].[pos_transaction_line]
           SET [inventory_location_code] = @inventoryLocationCode
           WHERE [id] = @lineId`,
          { inventoryLocationCode, lineId: line.id },
          transaction,
        );
      }

      for (const payment of checkoutPayments.payments) {
        await this.query(
          `INSERT INTO [dbo].[pos_payment] (
            [id],
            [pos_transaction_id],
            [tender_method_code],
            [tender_method_name],
            [bank_account_id],
            [bank_code],
            [bank_name],
            [bank_branch_code],
            [bank_branch_name],
            [bank_account_number],
            [bank_account_name],
            [method],
            [amount],
            [reference],
            [received_at]
          ) VALUES (
            @paymentId,
            @transactionId,
            @tenderMethodCode,
            @tenderMethodName,
            @bankAccountId,
            @bankCode,
            @bankName,
            @bankBranchCode,
            @bankBranchName,
            @bankAccountNumber,
            @bankAccountName,
            @method,
            @amount,
            @reference,
            @receivedAt
          )`,
          {
            paymentId: payment.paymentId,
            transactionId: refreshedBasket.id,
            tenderMethodCode: payment.tenderMethodCode,
            tenderMethodName: payment.tenderMethodName,
            bankAccountId: payment.bankAccountId,
            bankCode: payment.bankCode,
            bankName: payment.bankName,
            bankBranchCode: payment.bankBranchCode,
            bankBranchName: payment.bankBranchName,
            bankAccountNumber: payment.bankAccountNumber,
            bankAccountName: payment.bankAccountName,
            method: payment.method,
            amount: payment.amount,
            reference: payment.reference,
            receivedAt: payment.receivedAt,
          },
          transaction,
        );
      }

      for (const {
        line,
        product,
        lineIntent,
        inventoryLocationCode,
        quantity,
        serialNumbers,
        selectedVariant,
      } of checkoutLines) {
        const direction = getLineDirection(
          refreshedBasket.transaction_type,
          lineIntent,
        );
        const signedInventoryDelta = Number(
          (quantity * direction * -1).toFixed(3),
        );

        if (
          asBooleanFlag(product.track_inventory) &&
          !isServiceProductType(product.product_type)
        ) {
          await this.query(
            `UPDATE [dbo].[product_snapshot]
             SET [quantity_on_hand] = [quantity_on_hand] + @signedInventoryDelta,
                 [updated_at] = @timestamp
             WHERE [product_code] = @productCode`,
            {
              signedInventoryDelta,
              timestamp,
              productCode: line.product_code_snapshot,
            },
            transaction,
          );

          if (selectedVariant) {
            await this.query(
              `UPDATE [dbo].[product_variant_snapshot]
               SET [quantity_on_hand] = [quantity_on_hand] + @signedInventoryDelta,
                   [updated_at] = @timestamp
               WHERE [id] = @variantId`,
              {
                signedInventoryDelta,
                timestamp,
                variantId: selectedVariant.id,
              },
              transaction,
            );
          }

          if (inventoryLocationCode) {
            await this.query(
              `MERGE [dbo].[inventory_location_balance] AS target
               USING (
                 SELECT
                   @inventoryLocationCode AS [location_code],
                   @productCode AS [product_code],
                   @quantityOnHand AS [quantity_on_hand],
                   @timestamp AS [updated_at]
               ) AS source
               ON target.[location_code] = source.[location_code]
                AND target.[product_code] = source.[product_code]
               WHEN NOT MATCHED THEN INSERT (
                 [location_code],
                 [product_code],
                 [quantity_on_hand],
                 [updated_at]
               ) VALUES (
                 source.[location_code],
                 source.[product_code],
                 source.[quantity_on_hand],
                 source.[updated_at]
               );`,
              {
                inventoryLocationCode,
                productCode: line.product_code_snapshot,
                quantityOnHand: Number(asNumber(product.quantity_on_hand).toFixed(3)),
                timestamp,
              },
              transaction,
            );
            await this.query(
              `UPDATE [dbo].[inventory_location_balance]
               SET [quantity_on_hand] = [quantity_on_hand] + @signedInventoryDelta,
                   [updated_at] = @timestamp
               WHERE [location_code] = @inventoryLocationCode
                 AND [product_code] = @productCode`,
              {
                signedInventoryDelta,
                timestamp,
                inventoryLocationCode,
                productCode: line.product_code_snapshot,
              },
              transaction,
            );
            await this.query(
              `UPDATE [dbo].[inventory_location_snapshot]
               SET [updated_at] = @timestamp
               WHERE [location_code] = @inventoryLocationCode`,
              { timestamp, inventoryLocationCode },
              transaction,
            );
          }

          if (shouldQueueEnterprise) {
            const ledgerEntryId = randomUUID();
            const inventoryPayload: StoreInventoryLedgerRecordedPayload = {
              ledgerEntryId,
              storeCode,
              terminalCode,
              inventoryLocationCode,
              productCode: line.product_code_snapshot,
              movementType: lineIntent === "RETURN" ? "RETURN" : "SALE",
              quantity,
              ...(serialNumbers.length > 0 ? { serialNumbers } : {}),
              unitCost: null,
              referenceType: "POS_TRANSACTION",
              referenceId: refreshedBasket.id,
              externalReference: refreshedBasket.transaction_no,
              occurredAt: timestamp,
            };

            await this.insertOutboxEvent(
              {
                nodeCode,
                timestamp,
                aggregateType: "inventoryLedgerEntry",
                aggregateId: ledgerEntryId,
                eventType: "inventory.ledger.recorded",
                idempotencyKey: `${nodeCode}:inventoryLedgerEntry:${ledgerEntryId}`,
                payload: inventoryPayload,
                recordVersion: 1,
              },
              transaction,
            );
          }
        }

        for (const serialNumber of serialNumbers) {
          if (lineIntent === "RETURN") {
            await this.query(
              `MERGE [dbo].[serial_registry] AS target
               USING (
                 SELECT
                   @serialId AS [id],
                   @productCode AS [product_code],
                   @serialNumber AS [serial_number],
                    @inventoryLocationCode AS [inventory_location_code],
                   N'AVAILABLE' AS [status],
                   @transactionId AS [source_transaction_id],
                   @transactionNo AS [source_transaction_no],
                   @timestamp AS [updated_at]
               ) AS source
               ON target.[product_code] = source.[product_code]
                AND UPPER(target.[serial_number]) = UPPER(source.[serial_number])
               WHEN MATCHED THEN UPDATE SET
                 [status] = source.[status],
                 [inventory_location_code] = ISNULL(source.[inventory_location_code], target.[inventory_location_code]),
                 [source_transaction_id] = source.[source_transaction_id],
                 [source_transaction_no] = source.[source_transaction_no],
                 [updated_at] = source.[updated_at]
               WHEN NOT MATCHED THEN INSERT (
                 [id],
                 [product_code],
                 [serial_number],
                 [inventory_location_code],
                 [status],
                 [source_transaction_id],
                 [source_transaction_no],
                 [updated_at]
               ) VALUES (
                 source.[id],
                 source.[product_code],
                 source.[serial_number],
                 source.[inventory_location_code],
                 source.[status],
                 source.[source_transaction_id],
                 source.[source_transaction_no],
                 source.[updated_at]
               );`,
              {
                serialId: randomUUID(),
                inventoryLocationCode,
                transactionId: refreshedBasket.id,
                transactionNo: refreshedBasket.transaction_no,
                timestamp,
                productCode: line.product_code_snapshot,
                serialNumber,
              },
              transaction,
            );
            continue;
          }

          const serialResult = await this.query(
            `UPDATE [dbo].[serial_registry]
             SET [status] = N'SOLD',
                 [inventory_location_code] = ISNULL(@inventoryLocationCode, [inventory_location_code]),
                 [source_transaction_id] = @transactionId,
                 [source_transaction_no] = @transactionNo,
                 [updated_at] = @timestamp
             WHERE [product_code] = @productCode
               AND UPPER([serial_number]) = UPPER(@serialNumber)
               AND [status] = N'AVAILABLE'`,
            {
              inventoryLocationCode,
              transactionId: refreshedBasket.id,
              transactionNo: refreshedBasket.transaction_no,
              timestamp,
              productCode: line.product_code_snapshot,
              serialNumber,
            },
            transaction,
          );

          if ((serialResult.rowsAffected[0] ?? 0) !== 1) {
            throw new Error(
              `Flash ERP could not mark serial number ${serialNumber} as sold during checkout.`,
            );
          }
        }
      }

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "posTransaction",
            aggregateId: refreshedBasket.id,
            eventType: "pos.transaction.completed",
            idempotencyKey: `${nodeCode}:posTransaction:${refreshedBasket.transaction_no}`,
            payload: salePayload,
            recordVersion: saleRecordVersion,
          },
          transaction,
        );
      }

      const salesOrder = openSalesOrder;

      if (salesOrder) {
        const salesOrderPayload: StoreSalesOrderRecordedPayload = {
          orderId: salesOrder.id,
          orderNo: salesOrder.order_no,
          storeCode,
          terminalCode,
          sourceTransactionId: salesOrder.source_transaction_id,
          sourceTransactionNo: salesOrder.source_transaction_no,
          customerId: salesOrder.customer_id,
          customerNo: salesOrder.customer_no,
          customerName: salesOrder.customer_name,
          totalAmount: Number(asNumber(salesOrder.total_amount).toFixed(2)),
          depositAmount: Number(asNumber(salesOrder.deposit_amount).toFixed(2)),
          balanceAmount: 0,
          depositTenderMethodCode: salesOrder.deposit_tender_method_code,
          depositTenderMethodName: salesOrder.deposit_tender_method_name,
          depositPaymentMethod: salesOrder.deposit_payment_method,
          depositReference: salesOrder.deposit_reference,
          depositPaidAt: salesOrder.deposit_paid_at,
          status: "FULFILLED",
          operatorName: salesOrder.operator_name,
          note: salesOrder.note,
          createdAt: salesOrder.created_at,
          fulfilledTransactionId: refreshedBasket.id,
          fulfilledTransactionNo: refreshedBasket.transaction_no,
          fulfilledAt: timestamp,
          cancelledAt: null,
        };

        await this.query(
          `UPDATE [dbo].[sales_order]
           SET [status] = N'FULFILLED',
               [balance_amount] = 0,
               [fulfilled_transaction_id] = @transactionId,
               [fulfilled_transaction_no] = @transactionNo,
               [fulfilled_at] = @timestamp,
               [updated_at] = @timestamp
           WHERE [id] = @orderId`,
          {
            transactionId: refreshedBasket.id,
            transactionNo: refreshedBasket.transaction_no,
            timestamp,
            orderId: salesOrder.id,
          },
          transaction,
        );

        if (shouldQueueEnterprise) {
          await this.insertOutboxEvent(
            {
              nodeCode,
              timestamp,
              aggregateType: "salesOrder",
              aggregateId: salesOrder.id,
              eventType: "sales-order.fulfilled",
              idempotencyKey: `${nodeCode}:salesOrder:${salesOrder.order_no}:fulfilled`,
              payload: salesOrderPayload,
              recordVersion: 2,
            },
            transaction,
          );
        }
      }

      await this.deleteMetadata(this.getActiveBasketMetadataKey(), transaction);
      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });

    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: this.isStandaloneDeployment()
        ? `${refreshedBasket.transaction_no} was completed from the SQL Server active basket locally.`
        : `${refreshedBasket.transaction_no} was completed from the SQL Server active basket and queued for enterprise sync.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: this.isStandaloneDeployment()
        ? `Flash ERP completed basket ${refreshedBasket.transaction_no} on the shared SQL Server store database.`
        : `Flash ERP completed basket ${refreshedBasket.transaction_no} on the shared SQL Server store database and queued it for enterprise sync.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async getInterStoreTransferRow(
    transferId: string,
    runner: MssqlRunner = this.pool,
  ) {
    const result = await this.query<InterStoreTransferSnapshotRow>(
      `SELECT TOP (1)
        transfer.[id],
        transfer.[transfer_no],
        transfer.[transfer_batch_no],
        transfer.[line_no],
        transfer.[role],
        transfer.[origin],
        transfer.[status],
        transfer.[external_reference],
        transfer.[source_store_code],
        transfer.[source_store_name],
        transfer.[source_location_code],
        transfer.[source_location_name],
        transfer.[destination_store_code],
        transfer.[destination_store_name],
        transfer.[destination_location_code],
        transfer.[destination_location_name],
        transfer.[product_code],
        transfer.[product_name],
        transfer.[department_code],
        department.[department_name],
        transfer.[category_code],
        category.[category_name],
        transfer.[subcategory],
        transfer.[is_serialized],
        transfer.[requested_quantity],
        transfer.[issued_quantity],
        transfer.[received_quantity],
        transfer.[outstanding_issue_quantity],
        transfer.[outstanding_receipt_quantity],
        transfer.[unit_cost],
        transfer.[issued_serial_numbers_json],
        transfer.[received_serial_numbers_json],
        transfer.[request_note],
        transfer.[issue_note],
        transfer.[receipt_note],
        transfer.[request_operator_name],
        transfer.[issue_operator_name],
        transfer.[receipt_operator_name],
        transfer.[requested_by_node_code],
        transfer.[source_node_code],
        transfer.[destination_node_code],
        transfer.[requested_at],
        transfer.[required_at],
        transfer.[issued_at],
        transfer.[received_at],
        transfer.[closed_at],
        transfer.[updated_at]
       FROM [dbo].[inter_store_transfer_snapshot] AS transfer
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = transfer.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = transfer.[category_code]
       WHERE transfer.[id] = @transferId`,
      { transferId },
      runner,
    );

    return result.recordset[0] ?? null;
  }

  async issueInterStoreTransfer(
    input: StoreInterStoreTransferIssueRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.transfer.issue"],
      purpose: "issuing an inter-store transfer",
    });
    const transferId = input.transferId.trim();
    const quantity = Number(Number(input.quantity).toFixed(3));
    const serialNumbers = normalizeSerialNumbers(input.serialNumbers);

    if (!transferId) {
      throw new Error(
        "Select an inter-store transfer before issuing stock locally.",
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(
        "Enter an issued quantity greater than zero before syncing the transfer.",
      );
    }

    let message = "";

    await this.withTransaction(async (transaction) => {
      const transfer = await this.getInterStoreTransferRow(
        transferId,
        transaction,
      );

      if (!transfer) {
        throw new Error(
          "Flash ERP could not find that inter-store transfer in the SQL Server snapshot.",
        );
      }

      if (transfer.role !== "SOURCE") {
        throw new Error(
          `${transfer.transfer_no} is not waiting for source issue on this desktop.`,
        );
      }

      if (
        transfer.status !== "REQUESTED" &&
        transfer.status !== "PART_ISSUED" &&
        transfer.status !== "PART_RECEIVED"
      ) {
        throw new Error(
          `${transfer.transfer_no} is ${transfer.status.toLowerCase().replace(/_/g, " ")} and cannot issue more stock.`,
        );
      }

      const outstandingIssueQuantity = Number(
        asNumber(transfer.outstanding_issue_quantity).toFixed(3),
      );

      if (quantity - outstandingIssueQuantity > 0.0001) {
        throw new Error(
          `Only ${outstandingIssueQuantity.toFixed(3)} unit(s) remain to issue on ${transfer.transfer_no}.`,
        );
      }

      const product = await this.findCatalogLookup(transfer.product_code);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${transfer.product_code}" while issuing ${transfer.transfer_no}.`,
        );
      }

      const sourceLocationQuantity = await this.getLocationQuantity(
        transfer.source_location_code,
        transfer.product_code,
        transaction,
      );

      if (quantity - sourceLocationQuantity > 0.0001) {
        throw new Error(
          `Only ${sourceLocationQuantity.toFixed(3)} unit(s) of ${transfer.product_name} are available in ${transfer.source_location_code}.`,
        );
      }

      if (asBooleanFlag(transfer.is_serialized)) {
        if (!Number.isInteger(quantity) || serialNumbers.length !== quantity) {
          throw new Error(
            `Serialized transfer ${transfer.transfer_no} needs ${quantity} serial number(s) before issue.`,
          );
        }

        await this.ensureInventoryTaskSerialNumbersNotReserved(
          transfer.product_code,
          transfer.product_name,
          serialNumbers,
          transaction,
        );
        ensureSerialSelectionWithinAllowedSet({
          productName: transfer.product_name,
          selectedSerialNumbers: serialNumbers,
          allowedSerialNumbers: await this.listAvailableRegistrySerialNumbers(
            transfer.product_code,
            transfer.source_location_code,
            transaction,
          ),
        });
      } else if (serialNumbers.length > 0) {
        throw new Error(
          `${transfer.product_name} is not serialized, so this issue cannot include serial numbers.`,
        );
      }

      const timestamp = isoNow();
      const metadata = await this.metadata();
      const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
      const terminalCode = this.getTerminalCode();
      const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
      const shouldQueueEnterprise = !this.isStandaloneDeployment();
      const nextIssuedQuantity = Number(
        (asNumber(transfer.issued_quantity) + quantity).toFixed(3),
      );
      const nextReceivedQuantity = Number(
        asNumber(transfer.received_quantity).toFixed(3),
      );
      const nextStatus = deriveLocalInterStoreTransferStatus({
        requestedQuantity: asNumber(transfer.requested_quantity),
        issuedQuantity: nextIssuedQuantity,
        receivedQuantity: nextReceivedQuantity,
        closedAt: transfer.closed_at,
      });
      const nextIssuedSerialNumbers = normalizeSerialNumbers([
        ...readSerializedLineNumbers(transfer.issued_serial_numbers_json),
        ...serialNumbers,
      ]);
      const issueNote =
        input.note?.trim() ||
        `Issued ${quantity.toFixed(3)} unit(s) of ${transfer.product_name} from ${transfer.source_location_code}.`;
      const operatorName =
        input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);

      await this.query(
        `UPDATE [dbo].[product_snapshot]
         SET [quantity_on_hand] = [quantity_on_hand] - @quantity,
             [updated_at] = @timestamp
         WHERE [product_code] = @productCode`,
        { quantity, timestamp, productCode: transfer.product_code },
        transaction,
      );
      await this.applyLocationBalanceDelta({
        locationCode: transfer.source_location_code,
        productCode: transfer.product_code,
        delta: quantity * -1,
        updatedAt: timestamp,
        runner: transaction,
      });
      await this.applyInventoryTaskSerialRegistryChange({
        productCode: transfer.product_code,
        serialNumbers,
        inventoryLocationCode: null,
        status: "IN_TRANSIT",
        sourceReferenceId: transfer.id,
        sourceReferenceLabel: transfer.transfer_no,
        updatedAt: timestamp,
        runner: transaction,
      });
      await this.query(
        `UPDATE [dbo].[inter_store_transfer_snapshot]
         SET [status] = @nextStatus,
             [issued_quantity] = @nextIssuedQuantity,
             [outstanding_issue_quantity] = @outstandingIssueQuantity,
             [outstanding_receipt_quantity] = @outstandingReceiptQuantity,
             [issued_serial_numbers_json] = @issuedSerialNumbersJson,
             [issue_note] = @issueNote,
             [issue_operator_name] = @operatorName,
             [source_node_code] = @nodeCode,
             [issued_at] = @timestamp,
             [updated_at] = @timestamp
         WHERE [id] = @transferId`,
        {
          nextStatus,
          nextIssuedQuantity,
          outstandingIssueQuantity: Number(
            Math.max(
              0,
              asNumber(transfer.requested_quantity) - nextIssuedQuantity,
            ).toFixed(3),
          ),
          outstandingReceiptQuantity: Number(
            Math.max(0, nextIssuedQuantity - nextReceivedQuantity).toFixed(3),
          ),
          issuedSerialNumbersJson:
            writeSerializedLineNumbers(nextIssuedSerialNumbers),
          issueNote,
          operatorName,
          nodeCode,
          timestamp,
          transferId: transfer.id,
        },
        transaction,
      );

      const payload: StoreInterStoreTransferIssuedPayload = {
        transferId: transfer.id,
        transferNo: transfer.transfer_no,
        storeCode,
        terminalCode,
        sourceLocationCode: transfer.source_location_code,
        destinationLocationCode: transfer.destination_location_code,
        productCode: transfer.product_code,
        quantity,
        ...(serialNumbers.length > 0 ? { serialNumbers } : {}),
        operatorName,
        note: issueNote,
        occurredAt: timestamp,
      };

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "interStoreTransfer",
            aggregateId: transfer.id,
            eventType: "inter-store-transfer.issued",
            idempotencyKey: `${nodeCode}:interStoreTransfer:${transfer.id}:issued:${timestamp}`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
      await this.insertRunLog(
        {
          runKind: "LOCAL_WRITE",
          result: "SUCCESS",
          summary: shouldQueueEnterprise
            ? `${transfer.transfer_no} was issued locally from SQL Server and queued for enterprise sync.`
            : `${transfer.transfer_no} was issued locally from SQL Server for standalone transfer tracking.`,
          upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
          downstreamApplied: 0,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
        transaction,
      );
      message = shouldQueueEnterprise
        ? `${transfer.transfer_no} was issued locally and queued for enterprise projection.`
        : `${transfer.transfer_no} was issued locally for standalone transfer tracking.`;
    });

    return {
      message,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async receiveInterStoreTransfer(
    input: StoreInterStoreTransferReceiveRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.transfer.receive"],
      purpose: "receiving an inter-store transfer",
    });
    const transferId = input.transferId.trim();
    const quantity = Number(Number(input.quantity).toFixed(3));
    const serialNumbers = normalizeSerialNumbers(input.serialNumbers);

    if (!transferId) {
      throw new Error(
        "Select an inter-store transfer before receiving stock locally.",
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(
        "Enter a received quantity greater than zero before syncing the transfer.",
      );
    }

    let message = "";

    await this.withTransaction(async (transaction) => {
      const transfer = await this.getInterStoreTransferRow(
        transferId,
        transaction,
      );

      if (!transfer) {
        throw new Error(
          "Flash ERP could not find that inter-store transfer in the SQL Server snapshot.",
        );
      }

      if (transfer.role !== "DESTINATION") {
        throw new Error(
          `${transfer.transfer_no} is not waiting for destination receipt on this desktop.`,
        );
      }

      if (
        transfer.status !== "PART_ISSUED" &&
        transfer.status !== "ISSUED" &&
        transfer.status !== "PART_RECEIVED"
      ) {
        throw new Error(
          `${transfer.transfer_no} is ${transfer.status.toLowerCase().replace(/_/g, " ")} and cannot be received locally yet.`,
        );
      }

      const outstandingReceiptQuantity = Number(
        asNumber(transfer.outstanding_receipt_quantity).toFixed(3),
      );

      if (quantity - outstandingReceiptQuantity > 0.0001) {
        throw new Error(
          `Only ${outstandingReceiptQuantity.toFixed(3)} unit(s) remain to receive on ${transfer.transfer_no}.`,
        );
      }

      const product = await this.findCatalogLookup(transfer.product_code);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${transfer.product_code}" while receiving ${transfer.transfer_no}.`,
        );
      }

      if (asBooleanFlag(transfer.is_serialized)) {
        if (!Number.isInteger(quantity) || serialNumbers.length !== quantity) {
          throw new Error(
            `Serialized transfer ${transfer.transfer_no} needs ${quantity} serial number(s) before receipt.`,
          );
        }

        const issuedSerialKeys = new Set(
          readSerializedLineNumbers(transfer.issued_serial_numbers_json).map(
            (serialNumber) => serialNumber.toUpperCase(),
          ),
        );
        const receivedSerialKeys = new Set(
          readSerializedLineNumbers(transfer.received_serial_numbers_json).map(
            (serialNumber) => serialNumber.toUpperCase(),
          ),
        );
        const invalidSerialNumbers = serialNumbers.filter(
          (serialNumber) =>
            !issuedSerialKeys.has(serialNumber.toUpperCase()) ||
            receivedSerialKeys.has(serialNumber.toUpperCase()),
        );

        if (invalidSerialNumbers.length > 0) {
          throw new Error(
            `Serial number(s) ${invalidSerialNumbers.join(", ")} are not outstanding on ${transfer.transfer_no}.`,
          );
        }

        await this.ensureInventoryTaskSerialNumbersNotReserved(
          transfer.product_code,
          transfer.product_name,
          serialNumbers,
          transaction,
        );
      } else if (serialNumbers.length > 0) {
        throw new Error(
          `${transfer.product_name} is not serialized, so this receipt cannot include serial numbers.`,
        );
      }

      const timestamp = isoNow();
      const metadata = await this.metadata();
      const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
      const terminalCode = this.getTerminalCode();
      const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
      const shouldQueueEnterprise = !this.isStandaloneDeployment();
      const nextIssuedQuantity = Number(
        asNumber(transfer.issued_quantity).toFixed(3),
      );
      const nextReceivedQuantity = Number(
        (asNumber(transfer.received_quantity) + quantity).toFixed(3),
      );
      const nextStatus = deriveLocalInterStoreTransferStatus({
        requestedQuantity: asNumber(transfer.requested_quantity),
        issuedQuantity: nextIssuedQuantity,
        receivedQuantity: nextReceivedQuantity,
        closedAt: transfer.closed_at,
      });
      const nextReceivedSerialNumbers = normalizeSerialNumbers([
        ...readSerializedLineNumbers(transfer.received_serial_numbers_json),
        ...serialNumbers,
      ]);
      const receiptNote =
        input.note?.trim() ||
        `Received ${quantity.toFixed(3)} unit(s) of ${transfer.product_name} into ${transfer.destination_location_code}.`;
      const operatorName =
        input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);

      await this.query(
        `UPDATE [dbo].[product_snapshot]
         SET [quantity_on_hand] = [quantity_on_hand] + @quantity,
             [updated_at] = @timestamp
         WHERE [product_code] = @productCode`,
        { quantity, timestamp, productCode: transfer.product_code },
        transaction,
      );
      await this.applyLocationBalanceDelta({
        locationCode: transfer.destination_location_code,
        productCode: transfer.product_code,
        delta: quantity,
        updatedAt: timestamp,
        runner: transaction,
      });
      await this.applyInventoryTaskSerialRegistryChange({
        productCode: transfer.product_code,
        serialNumbers,
        inventoryLocationCode: transfer.destination_location_code,
        status: "AVAILABLE",
        sourceReferenceId: transfer.id,
        sourceReferenceLabel: transfer.transfer_no,
        updatedAt: timestamp,
        runner: transaction,
      });
      await this.query(
        `UPDATE [dbo].[inter_store_transfer_snapshot]
         SET [status] = @nextStatus,
             [received_quantity] = @nextReceivedQuantity,
             [outstanding_receipt_quantity] = @outstandingReceiptQuantity,
             [received_serial_numbers_json] = @receivedSerialNumbersJson,
             [receipt_note] = @receiptNote,
             [receipt_operator_name] = @operatorName,
             [destination_node_code] = @nodeCode,
             [received_at] = @timestamp,
             [updated_at] = @timestamp
         WHERE [id] = @transferId`,
        {
          nextStatus,
          nextReceivedQuantity,
          outstandingReceiptQuantity: Number(
            Math.max(0, nextIssuedQuantity - nextReceivedQuantity).toFixed(3),
          ),
          receivedSerialNumbersJson: writeSerializedLineNumbers(
            nextReceivedSerialNumbers,
          ),
          receiptNote,
          operatorName,
          nodeCode,
          timestamp,
          transferId: transfer.id,
        },
        transaction,
      );

      const payload: StoreInterStoreTransferReceivedPayload = {
        transferId: transfer.id,
        transferNo: transfer.transfer_no,
        storeCode,
        terminalCode,
        sourceLocationCode: transfer.source_location_code,
        destinationLocationCode: transfer.destination_location_code,
        productCode: transfer.product_code,
        quantity,
        ...(serialNumbers.length > 0 ? { serialNumbers } : {}),
        operatorName,
        note: receiptNote,
        occurredAt: timestamp,
      };

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "interStoreTransfer",
            aggregateId: transfer.id,
            eventType: "inter-store-transfer.received",
            idempotencyKey: `${nodeCode}:interStoreTransfer:${transfer.id}:received:${timestamp}`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
      await this.insertRunLog(
        {
          runKind: "LOCAL_WRITE",
          result: "SUCCESS",
          summary: shouldQueueEnterprise
            ? `${transfer.transfer_no} was received locally from SQL Server and queued for enterprise sync.`
            : `${transfer.transfer_no} was received locally from SQL Server for standalone transfer tracking.`,
          upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
          downstreamApplied: 0,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
        transaction,
      );
      message = shouldQueueEnterprise
        ? `${transfer.transfer_no} was received locally and queued for enterprise projection.`
        : `${transfer.transfer_no} was received locally for standalone transfer tracking.`;
    });

    return {
      message,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async receivePurchaseOrder(
    input: StorePurchaseOrderReceiptRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.grn.receive"],
      purpose: "receiving goods against a purchase order",
    });
    const purchaseOrderId = input.purchaseOrderId.trim();
    const requestedLines = (input.lines ?? []).map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId.trim(),
      quantity: Number(Number(line.quantity).toFixed(3)),
      serialNumbers: normalizeSerialNumbers(line.serialNumbers),
    }));
    const requestedExceptionLines = (input.exceptionLines ?? []).map(
      (line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId.trim(),
        quantity: Number(Number(line.quantity).toFixed(3)),
        reason: line.reason,
        note: line.note?.trim() || null,
      }),
    );
    const allowedExceptionReasons = new Set([
      "SHORT_SUPPLIED",
      "REJECTED_AT_RECEIPT",
      "DAMAGED_INBOUND",
      "WRONG_ITEM",
      "OTHER",
    ]);

    if (!purchaseOrderId) {
      throw new Error(
        "Select a purchase order before recording a local goods receipt.",
      );
    }

    if (requestedLines.length === 0 && requestedExceptionLines.length === 0) {
      throw new Error(
        "Add at least one received or exception line before posting the goods receipt.",
      );
    }

    if (
      requestedLines.some(
        (line) =>
          !line.purchaseOrderLineId ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0,
      )
    ) {
      throw new Error(
        "Each goods-receipt line must target a purchase-order line and quantity greater than zero.",
      );
    }

    if (
      requestedExceptionLines.some(
        (line) =>
          !line.purchaseOrderLineId ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !allowedExceptionReasons.has(line.reason),
      )
    ) {
      throw new Error(
        "Each receipt exception needs a purchase-order line, valid reason, and quantity greater than zero.",
      );
    }

    const duplicateLineIds = requestedLines
      .map((line) => line.purchaseOrderLineId)
      .filter((lineId, index, values) => values.indexOf(lineId) !== index);
    const duplicateExceptionLineIds = requestedExceptionLines
      .map((line) => line.purchaseOrderLineId)
      .filter((lineId, index, values) => values.indexOf(lineId) !== index);

    if (duplicateLineIds.length > 0 || duplicateExceptionLineIds.length > 0) {
      throw new Error(
        "Flash ERP received duplicate purchase-order lines in this receipt.",
      );
    }

    const purchaseOrderResult = await this.query<PurchaseOrderSnapshotRow>(
      `SELECT TOP (1)
        [id],
        [purchase_order_no],
        [status],
        [inventory_location_code],
        [inventory_location_name],
        [supplier_no],
        [supplier_name],
        [external_reference],
        [note],
        [operator_name],
        [ordered_quantity],
        [received_quantity],
        [exception_quantity],
        [outstanding_quantity],
        [committed_at],
        [closed_at],
        [closure_reason],
        [closure_note],
        [closure_operator_name],
        [updated_at]
       FROM [dbo].[purchase_order_snapshot]
       WHERE [id] = @purchaseOrderId`,
      { purchaseOrderId },
    );
    const purchaseOrder = purchaseOrderResult.recordset[0] ?? null;

    if (!purchaseOrder) {
      throw new Error(
        "Flash ERP could not find that purchase order in the SQL Server snapshot.",
      );
    }

    if (
      purchaseOrder.status !== "COMMITTED" &&
      purchaseOrder.status !== "PART_RECEIVED"
    ) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchase_order_no} is ${purchaseOrder.status.toLowerCase().replace(/_/g, " ")} and is not open for local receiving.`,
      );
    }

    const lineResult = await this.query<PurchaseOrderLineSnapshotRow>(
      `SELECT
        line.[id],
        line.[purchase_order_id],
        line.[line_no],
        line.[product_code],
        line.[product_name],
        line.[department_code],
        department.[department_name],
        line.[category_code],
        category.[category_name],
        line.[subcategory],
        line.[is_serialized],
        line.[ordered_quantity],
        line.[received_quantity],
        line.[exception_quantity],
        line.[outstanding_quantity],
        line.[unit_cost],
        line.[updated_at]
       FROM [dbo].[purchase_order_line_snapshot] AS line
       LEFT JOIN [dbo].[product_department_snapshot] AS department
         ON department.[department_code] = line.[department_code]
       LEFT JOIN [dbo].[product_category_snapshot] AS category
         ON category.[category_code] = line.[category_code]
       WHERE line.[purchase_order_id] = @purchaseOrderId
       ORDER BY line.[line_no] ASC`,
      { purchaseOrderId },
    );
    const lineById = new Map(
      lineResult.recordset.map((line) => [line.id, line] as const),
    );
    const requestedLineById = new Map(
      requestedLines.map((line) => [line.purchaseOrderLineId, line] as const),
    );
    const requestedExceptionLineById = new Map(
      requestedExceptionLines.map(
        (line) => [line.purchaseOrderLineId, line] as const,
      ),
    );
    const touchedLineIds = [
      ...new Set([
        ...requestedLines.map((line) => line.purchaseOrderLineId),
        ...requestedExceptionLines.map((line) => line.purchaseOrderLineId),
      ]),
    ];
    const productRowsByCode = new Map<string, ProductRow>();
    let totalQuantity = 0;
    let totalExceptionQuantity = 0;

    for (const lineId of touchedLineIds) {
      const line = lineById.get(lineId);
      const requestedLine = requestedLineById.get(lineId) ?? null;
      const requestedExceptionLine =
        requestedExceptionLineById.get(lineId) ?? null;

      if (!line) {
        throw new Error(
          `Flash ERP could not find purchase-order line "${lineId}" locally.`,
        );
      }

      const quantity = requestedLine?.quantity ?? 0;
      const exceptionQuantity = requestedExceptionLine?.quantity ?? 0;
      const outstandingQuantity = Number(
        asNumber(line.outstanding_quantity).toFixed(3),
      );

      if (quantity + exceptionQuantity - outstandingQuantity > 0.0001) {
        throw new Error(
          `Only ${outstandingQuantity.toFixed(3)} unit(s) of ${line.product_name} are still outstanding on ${purchaseOrder.purchase_order_no}.`,
        );
      }

      const product = await this.findCatalogLookup(line.product_code);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${line.product_code}" while posting the goods receipt.`,
        );
      }

      productRowsByCode.set(line.product_code, product);

      if (requestedLine && asBooleanFlag(line.is_serialized)) {
        if (
          !Number.isInteger(quantity) ||
          requestedLine.serialNumbers.length !== quantity
        ) {
          throw new Error(
            `Serialized product ${line.product_name} needs ${quantity} serial number(s) before receipt.`,
          );
        }

        await this.ensureInventoryTaskSerialNumbersNotReserved(
          line.product_code,
          line.product_name,
          requestedLine.serialNumbers,
        );

        for (const serialNumber of requestedLine.serialNumbers) {
          const existingSerial = await this.getSerialRegistryEntry(
            line.product_code,
            serialNumber,
          );
          if (existingSerial) {
            throw new Error(
              `Flash ERP already has serial number ${serialNumber} for ${line.product_name} in the local registry.`,
            );
          }
        }
      } else if (requestedLine && requestedLine.serialNumbers.length > 0) {
        throw new Error(
          `${line.product_name} is not serialized, so this receipt line cannot include serial numbers.`,
        );
      }

      totalQuantity = Number((totalQuantity + quantity).toFixed(3));
      totalExceptionQuantity = Number(
        (totalExceptionQuantity + exceptionQuantity).toFixed(3),
      );
    }

    const supplierNo =
      input.supplierNo?.trim().toUpperCase() ||
      purchaseOrder.supplier_no ||
      null;

    if (totalExceptionQuantity > 0 && !supplierNo) {
      throw new Error(
        `Purchase order ${purchaseOrder.purchase_order_no} needs a supplier before Flash ERP can raise receipt exceptions.`,
      );
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const goodsReceiptId = randomUUID();
    const goodsReceiptNo = buildLocalDocumentNo(
      "GRN",
      storeCode,
      await this.nextSequence("goods_receipt_sequence"),
      timestamp,
    );
    const externalReference =
      input.externalReference?.trim() ||
      purchaseOrder.purchase_order_no ||
      goodsReceiptNo;
    const operatorName =
      input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);
    const note =
      input.note?.trim() ||
      `Receiving stock for ${purchaseOrder.purchase_order_no} into ${purchaseOrder.inventory_location_name}.`;
    const payloadLines: StoreGoodsReceiptRecordedPayload["lines"] = [];
    const payloadExceptions: StoreGoodsReceiptRecordedPayload["exceptions"] =
      [];

    await this.withTransaction(async (transaction) => {
      await this.query(
        `INSERT INTO [dbo].[local_goods_receipt] (
          [id],
          [goods_receipt_no],
          [purchase_order_id],
          [purchase_order_no],
          [inventory_location_code],
          [supplier_no],
          [supplier_name],
          [external_reference],
          [note],
          [operator_name],
          [total_quantity],
          [exception_quantity],
          [synced_at],
          [received_at],
          [updated_at]
        ) VALUES (
          @goodsReceiptId,
          @goodsReceiptNo,
          @purchaseOrderId,
          @purchaseOrderNo,
          @inventoryLocationCode,
          @supplierNo,
          @supplierName,
          @externalReference,
          @note,
          @operatorName,
          @totalQuantity,
          @totalExceptionQuantity,
          NULL,
          @timestamp,
          @timestamp
        )`,
        {
          goodsReceiptId,
          goodsReceiptNo,
          purchaseOrderId: purchaseOrder.id,
          purchaseOrderNo: purchaseOrder.purchase_order_no,
          inventoryLocationCode: purchaseOrder.inventory_location_code,
          supplierNo,
          supplierName: purchaseOrder.supplier_name,
          externalReference,
          note,
          operatorName,
          totalQuantity,
          totalExceptionQuantity,
          timestamp,
        },
        transaction,
      );

      for (const lineId of touchedLineIds) {
        const line = lineById.get(lineId);
        const requestedLine = requestedLineById.get(lineId) ?? null;
        const requestedExceptionLine =
          requestedExceptionLineById.get(lineId) ?? null;

        if (!line) {
          throw new Error(
            `Flash ERP could not find purchase-order line "${lineId}" locally.`,
          );
        }

        const product = productRowsByCode.get(line.product_code);
        const receivedQuantity = requestedLine ? requestedLine.quantity : 0;
        const exceptionQuantity = requestedExceptionLine
          ? requestedExceptionLine.quantity
          : 0;

        if (!product) {
          throw new Error(
            `Flash ERP could not find product "${line.product_code}" while applying the receipt.`,
          );
        }

        if (requestedLine && receivedQuantity > 0) {
          const goodsReceiptLineId = randomUUID();

          await this.query(
            `INSERT INTO [dbo].[local_goods_receipt_line] (
              [id],
              [local_goods_receipt_id],
              [purchase_order_line_id],
              [line_no],
              [product_code],
              [product_name],
              [quantity],
              [unit_cost],
              [serial_numbers_json],
              [updated_at]
            ) VALUES (
              @goodsReceiptLineId,
              @goodsReceiptId,
              @purchaseOrderLineId,
              @lineNo,
              @productCode,
              @productName,
              @receivedQuantity,
              @unitCost,
              @serialNumbersJson,
              @timestamp
            )`,
            {
              goodsReceiptLineId,
              goodsReceiptId,
              purchaseOrderLineId: line.id,
              lineNo: Math.trunc(asNumber(line.line_no)),
              productCode: line.product_code,
              productName: line.product_name,
              receivedQuantity,
              unitCost: asNullableNumber(line.unit_cost),
              serialNumbersJson: writeSerializedLineNumbers(
                requestedLine.serialNumbers,
              ),
              timestamp,
            },
            transaction,
          );
          await this.query(
            `UPDATE [dbo].[product_snapshot]
             SET [quantity_on_hand] = [quantity_on_hand] + @receivedQuantity,
                 [updated_at] = @timestamp
             WHERE [product_code] = @productCode`,
            {
              receivedQuantity,
              timestamp,
              productCode: line.product_code,
            },
            transaction,
          );

          if (
            !(await this.hasLocationBalance(
              purchaseOrder.inventory_location_code,
              line.product_code,
              transaction,
            ))
          ) {
            await this.setLocationBalanceQuantity({
              locationCode: purchaseOrder.inventory_location_code,
              productCode: line.product_code,
              quantity: asNumber(product.quantity_on_hand),
              updatedAt: timestamp,
              runner: transaction,
            });
          }

          await this.applyLocationBalanceDelta({
            locationCode: purchaseOrder.inventory_location_code,
            productCode: line.product_code,
            delta: receivedQuantity,
            updatedAt: timestamp,
            runner: transaction,
          });

          for (const serialNumber of requestedLine.serialNumbers) {
            await this.upsertSerialRegistryEntry({
              productCode: line.product_code,
              serialNumber,
              inventoryLocationCode: purchaseOrder.inventory_location_code,
              status: "AVAILABLE",
              sourceTransactionId: goodsReceiptId,
              sourceTransactionNo: goodsReceiptNo,
              updatedAt: timestamp,
              runner: transaction,
            });
          }

          payloadLines.push({
            goodsReceiptLineId,
            purchaseOrderLineId: line.id,
            lineNo: Math.trunc(asNumber(line.line_no)),
            productCode: line.product_code,
            productName: line.product_name,
            quantity: receivedQuantity,
            unitCost: asNullableNumber(line.unit_cost),
            serialNumbers: requestedLine.serialNumbers,
          });
        }

        if (requestedExceptionLine && exceptionQuantity > 0) {
          const receiptExceptionId = randomUUID();

          await this.query(
            `INSERT INTO [dbo].[local_goods_receipt_exception] (
              [id],
              [local_goods_receipt_id],
              [purchase_order_line_id],
              [line_no],
              [product_code],
              [product_name],
              [quantity],
              [unit_cost],
              [reason],
              [note],
              [updated_at]
            ) VALUES (
              @receiptExceptionId,
              @goodsReceiptId,
              @purchaseOrderLineId,
              @lineNo,
              @productCode,
              @productName,
              @exceptionQuantity,
              @unitCost,
              @reason,
              @exceptionNote,
              @timestamp
            )`,
            {
              receiptExceptionId,
              goodsReceiptId,
              purchaseOrderLineId: line.id,
              lineNo: Math.trunc(asNumber(line.line_no)),
              productCode: line.product_code,
              productName: line.product_name,
              exceptionQuantity,
              unitCost: asNullableNumber(line.unit_cost),
              reason: requestedExceptionLine.reason,
              exceptionNote: requestedExceptionLine.note,
              timestamp,
            },
            transaction,
          );
          payloadExceptions.push({
            receiptExceptionId,
            purchaseOrderLineId: line.id,
            lineNo: Math.trunc(asNumber(line.line_no)),
            productCode: line.product_code,
            productName: line.product_name,
            quantity: exceptionQuantity,
            unitCost: asNullableNumber(line.unit_cost),
            reason: requestedExceptionLine.reason,
            note: requestedExceptionLine.note,
          });
        }

        const nextReceivedQuantity = Number(
          (asNumber(line.received_quantity) + receivedQuantity).toFixed(3),
        );
        const nextExceptionQuantity = Number(
          (asNumber(line.exception_quantity) + exceptionQuantity).toFixed(3),
        );
        const nextOutstandingQuantity = Number(
          Math.max(
            0,
            asNumber(line.ordered_quantity) -
              nextReceivedQuantity -
              nextExceptionQuantity,
          ).toFixed(3),
        );

        await this.query(
          `UPDATE [dbo].[purchase_order_line_snapshot]
           SET [received_quantity] = @nextReceivedQuantity,
               [exception_quantity] = @nextExceptionQuantity,
               [outstanding_quantity] = @nextOutstandingQuantity,
               [updated_at] = @timestamp
           WHERE [id] = @lineId`,
          {
            nextReceivedQuantity,
            nextExceptionQuantity,
            nextOutstandingQuantity,
            timestamp,
            lineId: line.id,
          },
          transaction,
        );
      }

      const nextReceivedQuantity = Number(
        (asNumber(purchaseOrder.received_quantity) + totalQuantity).toFixed(3),
      );
      const nextExceptionQuantity = Number(
        (
          asNumber(purchaseOrder.exception_quantity) + totalExceptionQuantity
        ).toFixed(3),
      );
      const nextOutstandingQuantity = Number(
        Math.max(
          0,
          asNumber(purchaseOrder.ordered_quantity) -
            nextReceivedQuantity -
            nextExceptionQuantity,
        ).toFixed(3),
      );
      const nextStatus =
        nextOutstandingQuantity <= 0.0001 && nextExceptionQuantity <= 0.0001
          ? "RECEIVED"
          : "PART_RECEIVED";
      const goodsReceiptPayload: StoreGoodsReceiptRecordedPayload = {
        goodsReceiptId,
        goodsReceiptNo,
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderNo: purchaseOrder.purchase_order_no,
        storeCode,
        terminalCode,
        inventoryLocationCode: purchaseOrder.inventory_location_code,
        supplierNo,
        supplierName: purchaseOrder.supplier_name,
        externalReference,
        note,
        operatorName,
        receivedAt: timestamp,
        lines: payloadLines,
        exceptions: payloadExceptions,
      };

      await this.query(
        `UPDATE [dbo].[purchase_order_snapshot]
         SET [supplier_no] = @supplierNo,
             [received_quantity] = @nextReceivedQuantity,
             [exception_quantity] = @nextExceptionQuantity,
             [outstanding_quantity] = @nextOutstandingQuantity,
             [status] = @nextStatus,
             [updated_at] = @timestamp
         WHERE [id] = @purchaseOrderId`,
        {
          supplierNo,
          nextReceivedQuantity,
          nextExceptionQuantity,
          nextOutstandingQuantity,
          nextStatus,
          timestamp,
          purchaseOrderId: purchaseOrder.id,
        },
        transaction,
      );
      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            eventId: goodsReceiptId,
            nodeCode,
            timestamp,
            aggregateType: "goodsReceipt",
            aggregateId: goodsReceiptId,
            eventType: "goods-receipt.recorded",
            idempotencyKey: `${nodeCode}:goodsReceipt:${goodsReceiptNo}`,
            payload: goodsReceiptPayload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
      await this.insertRunLog(
        {
          runKind: "LOCAL_WRITE",
          result: "SUCCESS",
          summary: shouldQueueEnterprise
            ? `${goodsReceiptNo} was posted locally against ${purchaseOrder.purchase_order_no} on SQL Server and queued for enterprise projection.`
            : `${goodsReceiptNo} was posted locally against ${purchaseOrder.purchase_order_no} on standalone SQL Server.`,
          upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
          downstreamApplied: 0,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
        transaction,
      );
    });

    return {
      message:
        totalExceptionQuantity > 0
          ? shouldQueueEnterprise
            ? `${goodsReceiptNo} was posted locally with receipt exceptions and queued for enterprise projection.`
            : `${goodsReceiptNo} was posted locally with receipt exceptions.`
          : shouldQueueEnterprise
            ? `${goodsReceiptNo} was received locally and queued for enterprise projection.`
            : `${goodsReceiptNo} was received locally for standalone purchasing.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async recordSupplierReturn(
    input: StoreSupplierReturnRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.supplier-return.manage"],
      purpose: "posting a supplier return",
    });
    const goodsReceiptId = input.goodsReceiptId.trim();
    const requestedLines = (input.lines ?? []).map((line) => ({
      goodsReceiptLineId: line.goodsReceiptLineId.trim(),
      quantity: Number(Number(line.quantity).toFixed(3)),
      serialNumbers: normalizeSerialNumbers(line.serialNumbers),
    }));
    const allowedReasons = new Set([
      "DAMAGED",
      "REJECTED_AT_RECEIPT",
      "QUALITY_HOLD",
      "SHORT_EXPIRY",
      "WRONG_ITEM",
      "OTHER",
    ]);

    if (!goodsReceiptId) {
      throw new Error(
        "Select the original goods receipt before recording a supplier return.",
      );
    }

    if (!allowedReasons.has(input.reason)) {
      throw new Error(
        "Choose a valid supplier-return reason before posting the RTV locally.",
      );
    }

    if (requestedLines.length === 0) {
      throw new Error(
        "Add at least one return line before posting the supplier return.",
      );
    }

    if (
      requestedLines.some(
        (line) =>
          !line.goodsReceiptLineId ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0,
      )
    ) {
      throw new Error(
        "Each supplier-return line must target a goods-receipt line and quantity greater than zero.",
      );
    }

    const duplicateLineIds = requestedLines
      .map((line) => line.goodsReceiptLineId)
      .filter((lineId, index, values) => values.indexOf(lineId) !== index);

    if (duplicateLineIds.length > 0) {
      throw new Error(
        "Flash ERP received duplicate goods-receipt lines in this supplier return.",
      );
    }

    const goodsReceiptResult = await this.query<
      LocalGoodsReceiptRow & { inventory_location_name: string | null }
    >(
      `SELECT TOP (1)
        receipt.[id],
        receipt.[goods_receipt_no],
        receipt.[purchase_order_id],
        receipt.[purchase_order_no],
        receipt.[inventory_location_code],
        location.[location_name] AS [inventory_location_name],
        receipt.[supplier_no],
        receipt.[supplier_name],
        receipt.[external_reference]
       FROM [dbo].[local_goods_receipt] AS receipt
       LEFT JOIN [dbo].[inventory_location_snapshot] AS location
         ON location.[location_code] = receipt.[inventory_location_code]
       WHERE receipt.[id] = @goodsReceiptId`,
      { goodsReceiptId },
    );
    const goodsReceipt = goodsReceiptResult.recordset[0] ?? null;

    if (!goodsReceipt) {
      throw new Error("Flash ERP could not find that local goods receipt.");
    }

    if (!goodsReceipt.supplier_no || !goodsReceipt.supplier_name) {
      throw new Error(
        `Goods receipt ${goodsReceipt.goods_receipt_no} is not linked to a supplier, so Flash ERP cannot post a supplier return from it.`,
      );
    }

    const goodsReceiptLineResult =
      await this.query<LocalGoodsReceiptLineRow>(
        `SELECT
          [id],
          [local_goods_receipt_id],
          [purchase_order_line_id],
          [line_no],
          [product_code],
          [product_name],
          [quantity],
          [unit_cost],
          [serial_numbers_json],
          [updated_at]
         FROM [dbo].[local_goods_receipt_line]
         WHERE [local_goods_receipt_id] = @goodsReceiptId
         ORDER BY [line_no] ASC`,
        { goodsReceiptId },
      );
    const goodsReceiptLineById = new Map(
      goodsReceiptLineResult.recordset.map((line) => [line.id, line] as const),
    );
    const returnedQuantityByReceiptLine = new Map<string, number>();
    const returnedSerialKeysByReceiptLine = new Map<string, Set<string>>();

    for (const requestedLine of requestedLines) {
      const priorReturnLineResult = await this.query<{
        goods_receipt_line_id: string;
        quantity: string | number;
        serial_numbers_json: string | null;
      }>(
        `SELECT
          [goods_receipt_line_id],
          [quantity],
          [serial_numbers_json]
         FROM [dbo].[local_supplier_return_line]
         WHERE [goods_receipt_line_id] = @goodsReceiptLineId`,
        { goodsReceiptLineId: requestedLine.goodsReceiptLineId },
      );

      for (const line of priorReturnLineResult.recordset) {
        returnedQuantityByReceiptLine.set(
          line.goods_receipt_line_id,
          Number(
            (
              (returnedQuantityByReceiptLine.get(line.goods_receipt_line_id) ??
                0) + asNumber(line.quantity)
            ).toFixed(3),
          ),
        );

        const serialKeys =
          returnedSerialKeysByReceiptLine.get(line.goods_receipt_line_id) ??
          new Set<string>();
        for (const serialNumber of readSerializedLineNumbers(
          line.serial_numbers_json,
        )) {
          serialKeys.add(serialNumber.toUpperCase());
        }
        returnedSerialKeysByReceiptLine.set(
          line.goods_receipt_line_id,
          serialKeys,
        );
      }
    }

    const productRowsByCode = new Map<string, ProductRow>();
    let totalQuantity = 0;

    for (const requestedLine of requestedLines) {
      const goodsReceiptLine = goodsReceiptLineById.get(
        requestedLine.goodsReceiptLineId,
      );

      if (!goodsReceiptLine) {
        throw new Error(
          `Flash ERP could not find goods-receipt line "${requestedLine.goodsReceiptLineId}" locally.`,
        );
      }

      const availableReturnQuantity = Number(
        Math.max(
          0,
          asNumber(goodsReceiptLine.quantity) -
            (returnedQuantityByReceiptLine.get(goodsReceiptLine.id) ?? 0),
        ).toFixed(3),
      );

      if (requestedLine.quantity - availableReturnQuantity > 0.0001) {
        throw new Error(
          `Only ${availableReturnQuantity.toFixed(3)} unit(s) of ${goodsReceiptLine.product_name} remain returnable from ${goodsReceipt.goods_receipt_no}.`,
        );
      }

      const product = await this.findCatalogLookup(goodsReceiptLine.product_code);

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${goodsReceiptLine.product_code}" while posting this supplier return.`,
        );
      }

      productRowsByCode.set(goodsReceiptLine.product_code, product);

      const currentLocationQuantity = await this.getLocationQuantity(
        goodsReceipt.inventory_location_code,
        goodsReceiptLine.product_code,
      );

      if (requestedLine.quantity - currentLocationQuantity > 0.0001) {
        throw new Error(
          `${goodsReceiptLine.product_name} only has ${currentLocationQuantity.toFixed(3)} unit(s) available in ${goodsReceipt.inventory_location_name ?? goodsReceipt.inventory_location_code}.`,
        );
      }

      if (asBooleanFlag(product.is_serialized)) {
        if (
          !Number.isInteger(requestedLine.quantity) ||
          requestedLine.serialNumbers.length !== requestedLine.quantity
        ) {
          throw new Error(
            `Serialized product ${goodsReceiptLine.product_name} needs ${requestedLine.quantity} serial number(s) before supplier return.`,
          );
        }

        const receiptSerialKeys = new Set(
          readSerializedLineNumbers(goodsReceiptLine.serial_numbers_json).map(
            (serialNumber) => serialNumber.toUpperCase(),
          ),
        );
        const alreadyReturnedSerialKeys =
          returnedSerialKeysByReceiptLine.get(goodsReceiptLine.id) ??
          new Set<string>();
        const invalidSerialNumbers = requestedLine.serialNumbers.filter(
          (serialNumber) =>
            !receiptSerialKeys.has(serialNumber.toUpperCase()) ||
            alreadyReturnedSerialKeys.has(serialNumber.toUpperCase()),
        );

        if (invalidSerialNumbers.length > 0) {
          throw new Error(
            `Serial number(s) ${invalidSerialNumbers.join(", ")} are not returnable from ${goodsReceipt.goods_receipt_no}.`,
          );
        }

        await this.ensureInventoryTaskSerialNumbersNotReserved(
          goodsReceiptLine.product_code,
          goodsReceiptLine.product_name,
          requestedLine.serialNumbers,
        );

        for (const serialNumber of requestedLine.serialNumbers) {
          const row = await this.getSerialRegistryEntry(
            goodsReceiptLine.product_code,
            serialNumber,
          );
          if (
            !row ||
            row.status !== "AVAILABLE" ||
            row.inventory_location_code !== goodsReceipt.inventory_location_code
          ) {
            throw new Error(
              `Flash ERP could not find serial number ${serialNumber} as available in ${goodsReceipt.inventory_location_code}.`,
            );
          }
        }
      } else if (requestedLine.serialNumbers.length > 0) {
        throw new Error(
          `${goodsReceiptLine.product_name} is not serialized, so this supplier-return line cannot include serial numbers.`,
        );
      }

      totalQuantity = Number(
        (totalQuantity + requestedLine.quantity).toFixed(3),
      );
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const supplierReturnId = randomUUID();
    const supplierReturnNo = buildLocalDocumentNo(
      "RTV",
      storeCode,
      await this.nextSequence("supplier_return_sequence"),
      timestamp,
    );
    const supplierNo = goodsReceipt.supplier_no;
    const supplierName = goodsReceipt.supplier_name;
    const externalReference =
      input.externalReference?.trim() || supplierReturnNo;
    const operatorName =
      input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);
    const note =
      input.note?.trim() ||
      `Returning stock from ${goodsReceipt.goods_receipt_no} back to supplier ${supplierName}.`;
    const payloadLines: StoreSupplierReturnRecordedPayload["lines"] = [];

    await this.withTransaction(async (transaction) => {
      await this.query(
        `INSERT INTO [dbo].[local_supplier_return] (
          [id],
          [supplier_return_no],
          [purchase_order_id],
          [purchase_order_no],
          [goods_receipt_id],
          [goods_receipt_no],
          [inventory_location_code],
          [supplier_no],
          [supplier_name],
          [external_reference],
          [reason],
          [status],
          [note],
          [operator_name],
          [total_quantity],
          [synced_at],
          [returned_at],
          [cancelled_at],
          [cancellation_note],
          [cancellation_operator_name],
          [cancellation_acknowledged_at],
          [cancellation_acknowledged_by],
          [cancellation_acknowledgement_note],
          [cancellation_ack_synced_at],
          [updated_at]
        ) VALUES (
          @supplierReturnId,
          @supplierReturnNo,
          @purchaseOrderId,
          @purchaseOrderNo,
          @goodsReceiptId,
          @goodsReceiptNo,
          @inventoryLocationCode,
          @supplierNo,
          @supplierName,
          @externalReference,
          @reason,
          N'POSTED',
          @note,
          @operatorName,
          @totalQuantity,
          NULL,
          @timestamp,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          @timestamp
        )`,
        {
          supplierReturnId,
          supplierReturnNo,
          purchaseOrderId: goodsReceipt.purchase_order_id,
          purchaseOrderNo: goodsReceipt.purchase_order_no,
          goodsReceiptId: goodsReceipt.id,
          goodsReceiptNo: goodsReceipt.goods_receipt_no,
          inventoryLocationCode: goodsReceipt.inventory_location_code,
          supplierNo,
          supplierName,
          externalReference,
          reason: input.reason,
          note,
          operatorName,
          totalQuantity,
          timestamp,
        },
        transaction,
      );

      for (const requestedLine of requestedLines) {
        const goodsReceiptLine = goodsReceiptLineById.get(
          requestedLine.goodsReceiptLineId,
        );

        if (!goodsReceiptLine) {
          throw new Error(
            `Flash ERP could not find goods-receipt line "${requestedLine.goodsReceiptLineId}" locally.`,
          );
        }

        const product = productRowsByCode.get(goodsReceiptLine.product_code);

        if (!product) {
          throw new Error(
            `Flash ERP could not find product "${goodsReceiptLine.product_code}".`,
          );
        }

        const supplierReturnLineId = randomUUID();

        await this.query(
          `INSERT INTO [dbo].[local_supplier_return_line] (
            [id],
            [local_supplier_return_id],
            [goods_receipt_line_id],
            [purchase_order_line_id],
            [line_no],
            [product_code],
            [product_name],
            [quantity],
            [unit_cost],
            [serial_numbers_json],
            [updated_at]
          ) VALUES (
            @supplierReturnLineId,
            @supplierReturnId,
            @goodsReceiptLineId,
            @purchaseOrderLineId,
            @lineNo,
            @productCode,
            @productName,
            @quantity,
            @unitCost,
            @serialNumbersJson,
            @timestamp
          )`,
          {
            supplierReturnLineId,
            supplierReturnId,
            goodsReceiptLineId: goodsReceiptLine.id,
            purchaseOrderLineId: goodsReceiptLine.purchase_order_line_id,
            lineNo: Math.trunc(asNumber(goodsReceiptLine.line_no)),
            productCode: goodsReceiptLine.product_code,
            productName: goodsReceiptLine.product_name,
            quantity: requestedLine.quantity,
            unitCost: asNullableNumber(goodsReceiptLine.unit_cost),
            serialNumbersJson: writeSerializedLineNumbers(
              requestedLine.serialNumbers,
            ),
            timestamp,
          },
          transaction,
        );
        await this.query(
          `UPDATE [dbo].[product_snapshot]
           SET [quantity_on_hand] = [quantity_on_hand] - @quantity,
               [updated_at] = @timestamp
           WHERE [product_code] = @productCode`,
          {
            quantity: requestedLine.quantity,
            timestamp,
            productCode: goodsReceiptLine.product_code,
          },
          transaction,
        );

        if (
          !(await this.hasLocationBalance(
            goodsReceipt.inventory_location_code,
            goodsReceiptLine.product_code,
            transaction,
          ))
        ) {
          await this.setLocationBalanceQuantity({
            locationCode: goodsReceipt.inventory_location_code,
            productCode: goodsReceiptLine.product_code,
            quantity: asNumber(product.quantity_on_hand),
            updatedAt: timestamp,
            runner: transaction,
          });
        }

        await this.applyLocationBalanceDelta({
          locationCode: goodsReceipt.inventory_location_code,
          productCode: goodsReceiptLine.product_code,
          delta: requestedLine.quantity * -1,
          updatedAt: timestamp,
          runner: transaction,
        });

        for (const serialNumber of requestedLine.serialNumbers) {
          await this.upsertSerialRegistryEntry({
            productCode: goodsReceiptLine.product_code,
            serialNumber,
            inventoryLocationCode: goodsReceipt.inventory_location_code,
            status: "ADJUSTED_OUT",
            sourceTransactionId: supplierReturnId,
            sourceTransactionNo: supplierReturnNo,
            updatedAt: timestamp,
            runner: transaction,
          });
        }

        payloadLines.push({
          supplierReturnLineId,
          goodsReceiptLineId: goodsReceiptLine.id,
          purchaseOrderLineId: goodsReceiptLine.purchase_order_line_id,
          lineNo: Math.trunc(asNumber(goodsReceiptLine.line_no)),
          productCode: goodsReceiptLine.product_code,
          productName: goodsReceiptLine.product_name,
          quantity: requestedLine.quantity,
          unitCost: asNullableNumber(goodsReceiptLine.unit_cost),
          serialNumbers: requestedLine.serialNumbers,
        });
      }

      const supplierReturnPayload: StoreSupplierReturnRecordedPayload = {
        supplierReturnId,
        supplierReturnNo,
        purchaseOrderId: goodsReceipt.purchase_order_id,
        purchaseOrderNo: goodsReceipt.purchase_order_no,
        goodsReceiptId: goodsReceipt.id,
        goodsReceiptNo: goodsReceipt.goods_receipt_no,
        storeCode,
        terminalCode,
        inventoryLocationCode: goodsReceipt.inventory_location_code,
        supplierNo,
        supplierName,
        externalReference,
        reason: input.reason,
        note,
        operatorName,
        returnedAt: timestamp,
        lines: payloadLines,
      };

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            eventId: supplierReturnId,
            nodeCode,
            timestamp,
            aggregateType: "supplierReturn",
            aggregateId: supplierReturnId,
            eventType: "supplier-return.recorded",
            idempotencyKey: `${nodeCode}:supplierReturn:${supplierReturnNo}`,
            payload: supplierReturnPayload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
      await this.insertRunLog(
        {
          runKind: "LOCAL_WRITE",
          result: "SUCCESS",
          summary: shouldQueueEnterprise
            ? `${supplierReturnNo} was posted locally against ${goodsReceipt.goods_receipt_no} on SQL Server and queued for enterprise projection.`
            : `${supplierReturnNo} was posted locally against ${goodsReceipt.goods_receipt_no} on standalone SQL Server.`,
          upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
          downstreamApplied: 0,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
        transaction,
      );
    });

    return {
      message: shouldQueueEnterprise
        ? `${supplierReturnNo} was posted locally and queued for enterprise projection.`
        : `${supplierReturnNo} was posted locally for standalone supplier returns.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async acknowledgeSupplierReturnCancellation(
    input: StoreSupplierReturnCancellationAcknowledgementRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.supplier-return.manage"],
      purpose: "acknowledging supplier-return stock rehydration",
    });
    const supplierReturnId = input.supplierReturnId.trim();

    if (!supplierReturnId) {
      throw new Error(
        "Select the cancelled supplier return before acknowledging rehydrated stock.",
      );
    }

    const supplierReturnResult = await this.query<LocalSupplierReturnRow>(
      `SELECT TOP (1)
        [id],
        [supplier_return_no],
        [purchase_order_id],
        [purchase_order_no],
        [goods_receipt_id],
        [goods_receipt_no],
        [inventory_location_code],
        [supplier_no],
        [supplier_name],
        [external_reference],
        [reason],
        [status],
        [note],
        [operator_name],
        [total_quantity],
        [synced_at],
        [returned_at],
        [cancelled_at],
        [cancellation_note],
        [cancellation_operator_name],
        [cancellation_acknowledged_at],
        [cancellation_acknowledged_by],
        [cancellation_acknowledgement_note],
        [cancellation_ack_synced_at],
        [updated_at]
       FROM [dbo].[local_supplier_return]
       WHERE [id] = @supplierReturnId`,
      { supplierReturnId },
    );
    const supplierReturn = supplierReturnResult.recordset[0] ?? null;

    if (!supplierReturn) {
      throw new Error("Flash ERP could not find that local supplier return.");
    }

    if (supplierReturn.status !== "CANCELLED" || !supplierReturn.cancelled_at) {
      throw new Error(
        `${supplierReturn.supplier_return_no} has not been cancelled in enterprise yet.`,
      );
    }

    if (supplierReturn.cancellation_acknowledged_at) {
      throw new Error(
        `${supplierReturn.supplier_return_no} rehydrated stock has already been acknowledged.`,
      );
    }

    const timestamp = isoNow();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const operatorName =
      input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);
    const note =
      input.note?.trim() ||
      `Rehydrated stock from ${supplierReturn.supplier_return_no} was physically confirmed in ${supplierReturn.inventory_location_code}.`;
    const payload: StoreSupplierReturnCancellationAcknowledgedPayload = {
      supplierReturnId: supplierReturn.id,
      supplierReturnNo: supplierReturn.supplier_return_no,
      storeCode,
      terminalCode,
      acknowledgedAt: timestamp,
      operatorName,
      note,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `UPDATE [dbo].[local_supplier_return]
         SET [cancellation_acknowledged_at] = @timestamp,
             [cancellation_acknowledged_by] = @operatorName,
             [cancellation_acknowledgement_note] = @note,
             [cancellation_ack_synced_at] = NULL,
             [updated_at] = @timestamp
         WHERE [id] = @supplierReturnId`,
        {
          timestamp,
          operatorName,
          note,
          supplierReturnId: supplierReturn.id,
        },
        transaction,
      );
      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "supplierReturn",
            aggregateId: supplierReturn.id,
            eventType: "supplier-return.cancellation-acknowledged",
            idempotencyKey: `${nodeCode}:supplierReturn:${supplierReturn.supplier_return_no}:cancellation-ack`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", timestamp, transaction);
      await this.insertRunLog(
        {
          runKind: "LOCAL_WRITE",
          result: "SUCCESS",
          summary: shouldQueueEnterprise
            ? `${supplierReturn.supplier_return_no} rehydrated stock was acknowledged locally on SQL Server and queued for enterprise confirmation.`
            : `${supplierReturn.supplier_return_no} rehydrated stock was acknowledged locally on SQL Server for standalone supplier returns.`,
          upstreamProcessed: shouldQueueEnterprise ? 1 : 0,
          downstreamApplied: 0,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
        transaction,
      );
    });

    return {
      message: shouldQueueEnterprise
        ? `${supplierReturn.supplier_return_no} stock rehydration was acknowledged locally and queued for enterprise sync.`
        : `${supplierReturn.supplier_return_no} stock rehydration was acknowledged locally for standalone supplier returns.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async completeRecoveryTask(taskId: string): Promise<StoreSyncActionResult> {
    const normalizedTaskId = taskId.trim();

    if (this.isStandaloneDeployment()) {
      await this.requireActiveOperatorSession({
        purpose: "completing standalone recovery tasks",
      });
    } else {
      await this.requireActiveOperatorSession({
        permissionCodes: ["sync.store.operate"],
        purpose: "completing enterprise recovery tasks",
      });
    }

    if (!normalizedTaskId) {
      throw new Error("Select a recovery task before completing it.");
    }

    const startedAt = isoNow();
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    let taskTitle = "Enterprise task";

    await this.withTransaction(async (transaction) => {
      const taskResult = await this.query<RecoveryTaskRow>(
        `SELECT TOP (1)
          [id],
          [task_type],
          [status],
          [title],
          [instructions],
          [source_inbound_event_id],
          [source_event_type],
          [aggregate_type],
          [aggregate_id],
          [transaction_no],
          [product_code],
          [replacement_aggregate_type],
          [replacement_aggregate_id],
          [replacement_event_type],
          [replacement_record_version],
          [replacement_payload_json],
          [operator_name],
          [operator_note],
          [store_note],
          [requested_at],
          [completed_at]
         FROM [dbo].[sync_recovery_task]
         WHERE [id] = @taskId`,
        { taskId: normalizedTaskId },
        transaction,
      );
      const task = taskResult.recordset[0] ?? null;

      if (!task) {
        throw new Error(
          `Flash ERP could not find enterprise task "${normalizedTaskId}" in the SQL Server store.`,
        );
      }

      taskTitle = task.title;

      if (task.status === "COMPLETED") {
        throw new Error(
          `Enterprise task "${task.title}" has already been completed locally.`,
        );
      }

      if (
        !task.replacement_aggregate_type ||
        !task.replacement_aggregate_id ||
        !task.replacement_event_type ||
        !task.replacement_payload_json
      ) {
        throw new Error(
          `Enterprise task "${task.title}" is missing replacement packet details locally. Pull the latest enterprise task before completing it.`,
        );
      }

      const finishedAt = isoNow();
      const completionQueuedAt = new Date(
        new Date(finishedAt).getTime() + 1,
      ).toISOString();
      const replacementEventId = randomUUID();
      const replacementPayload = this.parsePayloadJson(
        task.replacement_payload_json,
      );
      const replacementRecordVersion = Math.max(
        1,
        asNumber(task.replacement_record_version),
      );
      const replacementIdempotencyKey = `${nodeCode}:${task.replacement_aggregate_type}:${task.replacement_aggregate_id}:task:${task.id}`;
      const storeNote = shouldQueueEnterprise
        ? `Store operator acknowledged ${task.title} locally and queued a replacement packet upstream.`
        : `Store operator acknowledged ${task.title} locally for standalone recovery.`;
      const taskCompletionPayload: StoreSyncRecoveryTaskCompletedPayload = {
        taskId: task.id,
        taskType:
          task.task_type as StoreSyncRecoveryTaskCompletedPayload["taskType"],
        sourceInboundEventId: task.source_inbound_event_id ?? "",
        sourceEventType: task.source_event_type ?? "",
        replacementEventId,
        replacementIdempotencyKey,
        completedAt: finishedAt,
        outcome: "RESENT_QUEUED",
        storeNote,
      };

      await this.query(
        `UPDATE [dbo].[sync_recovery_task]
         SET [status] = N'COMPLETED',
             [store_note] = @storeNote,
             [completed_at] = @finishedAt,
             [updated_at] = @finishedAt
         WHERE [id] = @taskId`,
        {
          storeNote,
          finishedAt,
          taskId: task.id,
        },
        transaction,
      );
      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            eventId: replacementEventId,
            nodeCode,
            timestamp: finishedAt,
            aggregateType: task.replacement_aggregate_type,
            aggregateId: task.replacement_aggregate_id,
            eventType: task.replacement_event_type,
            idempotencyKey: replacementIdempotencyKey,
            payload: replacementPayload,
            recordVersion: replacementRecordVersion,
          },
          transaction,
        );
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp: completionQueuedAt,
            aggregateType: "syncTask",
            aggregateId: task.id,
            eventType: "sync.task.completed",
            idempotencyKey: `${nodeCode}:syncTask:${task.id}:completed`,
            payload: taskCompletionPayload,
            recordVersion: 1,
          },
          transaction,
        );
      }
      await this.setMetadata("last_local_write_at", finishedAt, transaction);
      await this.insertRunLog(
        {
          runKind: "RECOVERY_TASK",
          result: "SUCCESS",
          summary: shouldQueueEnterprise
            ? `${task.title} was acknowledged locally from SQL Server and queued both a replacement business packet and enterprise confirmation upstream.`
            : `${task.title} was acknowledged locally from SQL Server for standalone recovery.`,
          upstreamProcessed: shouldQueueEnterprise ? 2 : 0,
          downstreamApplied: 0,
          startedAt,
          finishedAt,
        },
        transaction,
      );
    });

    return {
      message: shouldQueueEnterprise
        ? `${taskTitle} was completed locally and queued both a replacement packet and enterprise confirmation.`
        : `${taskTitle} was completed locally for standalone recovery.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async openShift(input: StoreShiftOpenInput): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["pos.shift.open"],
      purpose: "opening a cashier shift",
    });
    const requestedCashierCode = input.cashierCode.trim();
    const openingFloatAmount = Number(
      Number(input.openingFloatAmount).toFixed(2),
    );

    if (
      requestedCashierCode &&
      normalizeLoginId(requestedCashierCode) !==
        normalizeLoginId(operatorSession.loginId)
    ) {
      throw new Error(
        `Flash ERP can only open the shift for the currently signed-in operator ${this.formatOperatorLabel(
          operatorSession,
        )}.`,
      );
    }

    if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
      throw new Error(
        "Enter an opening float of zero or greater before opening the shift.",
      );
    }

    const timestamp = isoNow();
    const existingOpenShift = await this.getOpenShiftRow();

    if (existingOpenShift) {
      throw new Error(
        `${existingOpenShift.shift_no} is already open on this desktop. Close it before opening another cashier shift.`,
      );
    }

    const shiftSequence = await this.nextSequence("shift_sequence");
    const shiftNo = `SHIFT-${String(shiftSequence).padStart(4, "0")}`;
    const shiftId = randomUUID();
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const payload: StorePosShiftOpenedPayload = {
      shiftId,
      shiftNo,
      storeCode,
      terminalCode,
      cashierCode: operatorSession.loginId,
      openingFloatAmount,
      openedAt: timestamp,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `INSERT INTO [dbo].[pos_shift] (
          [id],
          [shift_no],
          [terminal_code],
          [cashier_code],
          [status],
          [opening_float_amount],
          [closing_declared_cash],
          [closing_variance],
          [opened_at],
          [closed_at],
          [record_version]
        ) VALUES (
          @shiftId,
          @shiftNo,
          @terminalCode,
          @cashierCode,
          N'OPEN',
          @openingFloatAmount,
          NULL,
          NULL,
          @timestamp,
          NULL,
          1
        )`,
        {
          shiftId,
          shiftNo,
          terminalCode,
          cashierCode: operatorSession.loginId,
          openingFloatAmount,
          timestamp,
        },
        transaction,
      );

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "posShift",
            aggregateId: shiftId,
            eventType: "pos.shift.opened",
            idempotencyKey: `${nodeCode}:posShift:${shiftId}:opened`,
            payload,
            recordVersion: 1,
          },
          transaction,
        );
      }

      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${shiftNo} was opened on the SQL Server store node and queued for enterprise sync.`
        : `${shiftNo} was opened on the SQL Server store node.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message: `${shiftNo} is now open on this desktop with ${openingFloatAmount.toFixed(2)} opening float for cashier ${this.formatOperatorLabel(operatorSession)}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async closeActiveShift(
    input: StoreShiftCloseInput,
  ): Promise<StoreSyncActionResult> {
    const session = await this.requireActiveOperatorSession({
      permissionCodes: ["pos.shift.close"],
      purpose: "closing the active cashier shift",
    });

    if (!session.capabilities.supervisorEligible) {
      throw new Error(
        "Only a synced supervisor can close the active cashier shift and produce the Z report.",
      );
    }

    const declaredCashAmount = Number(
      Number(input.declaredCashAmount).toFixed(2),
    );

    if (!Number.isFinite(declaredCashAmount) || declaredCashAmount < 0) {
      throw new Error(
        "Enter a declared cash amount of zero or greater before closing the shift.",
      );
    }

    const shift = await this.getOpenShiftRow();

    if (!shift) {
      throw new Error(
        "Flash ERP could not find an open cashier shift to close.",
      );
    }

    const summary = await this.toShiftSummary(shift);
    const varianceAmount = Number(
      (declaredCashAmount - summary.expectedCashAmount).toFixed(2),
    );
    const timestamp = isoNow();
    const nextRecordVersion = Math.max(1, asNumber(shift.record_version) + 1);
    const metadata = await this.metadata();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const payload: StorePosShiftClosedPayload = {
      shiftId: shift.id,
      shiftNo: shift.shift_no,
      storeCode,
      terminalCode,
      cashierCode: shift.cashier_code,
      openingFloatAmount: Number(asNumber(shift.opening_float_amount).toFixed(2)),
      closingDeclaredCash: declaredCashAmount,
      closingVariance: varianceAmount,
      openedAt: shift.opened_at,
      closedAt: timestamp,
    };

    await this.withTransaction(async (transaction) => {
      await this.query(
        `UPDATE [dbo].[pos_shift]
         SET [status] = N'CLOSED',
             [closing_declared_cash] = @declaredCashAmount,
             [closing_variance] = @varianceAmount,
             [closed_at] = @timestamp,
             [record_version] = @nextRecordVersion
         WHERE [id] = @shiftId`,
        {
          declaredCashAmount,
          varianceAmount,
          timestamp,
          nextRecordVersion,
          shiftId: shift.id,
        },
        transaction,
      );

      if (shouldQueueEnterprise) {
        await this.insertOutboxEvent(
          {
            nodeCode,
            timestamp,
            aggregateType: "posShift",
            aggregateId: shift.id,
            eventType: "pos.shift.closed",
            idempotencyKey: `${nodeCode}:posShift:${shift.id}:closed`,
            payload,
            recordVersion: nextRecordVersion,
          },
          transaction,
        );
      }

      await this.setMetadata("last_local_write_at", timestamp, transaction);
    });
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      result: "SUCCESS",
      summary: shouldQueueEnterprise
        ? `${shift.shift_no} was closed on the SQL Server store node and queued for enterprise sync.`
        : `${shift.shift_no} was closed on the SQL Server store node.`,
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt: timestamp,
      finishedAt: timestamp,
    });

    return {
      message:
        varianceAmount === 0
          ? `${shift.shift_no} closed cleanly. Declared cash matched the expected drawer exactly.`
          : `${shift.shift_no} closed with declared cash ${declaredCashAmount.toFixed(2)} and variance ${varianceAmount.toFixed(2)}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async runRemoteSyncCycle(
    startedAt: string,
    trigger: StoreNodeSyncTrigger,
    drainDownstream = false,
  ): Promise<StoreSyncActionResult> {
    const syncRunId = randomUUID();
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const cursor = await this.getCheckpointCursor(ENTERPRISE_NODE_CODE);
    const downstreamPageLimit = readDownstreamPageLimit();
    const maxDownstreamPullPasses = readDownstreamPullPassLimit(
      trigger,
      drainDownstream,
    );

    await this.expireExhaustedOutboxRetries(startedAt);
    const upstreamRows = await this.getPendingUpstreamRows(25);
    const replayedDownstreamIds =
      await this.reapplyFailedDownstreamInbox(25);
    const acknowledgedDownstreamIds =
      await this.getPendingDownstreamAcknowledgements(25);
    let latestCursor = cursor;
    let latestSourceNodeCode = ENTERPRISE_NODE_CODE;
    let latestDownstreamEventId: string | null = null;
    let downstreamApplied = replayedDownstreamIds.length;
    const appliedDownstreamIds = [...replayedDownstreamIds];
    let downstreamPullPasses = 0;
    let downstreamLimitReached = false;

    for (let pass = 0; pass < maxDownstreamPullPasses; pass += 1) {
      const requestedCursor = latestCursor;
      const pullSyncRunId = randomUUID();
      const pullPayload = {
        sourceNodeCode: nodeCode,
        cursor: requestedCursor,
        limit: downstreamPageLimit,
        syncRunId: pullSyncRunId,
        trigger,
        clientStartedAt: startedAt,
      };
      let pullResponse: StoreNodePullResponse;

      try {
        pullResponse = await this.postJson<StoreNodePullResponse>(
          `${this.syncBaseUrl}/api/sync/store-nodes/${nodeCode}/pull`,
          pullPayload,
        );
      } catch (error) {
        if (downstreamPageLimit > 1 && isOversizedSyncResponseError(error)) {
          console.warn(
            "Store Desktop SQL Server sync pull page was too large; retrying with a single downstream event.",
            {
              trigger,
              pass: pass + 1,
              originalLimit: downstreamPageLimit,
            },
          );
          pullResponse = await this.postJson<StoreNodePullResponse>(
            `${this.syncBaseUrl}/api/sync/store-nodes/${nodeCode}/pull`,
            {
              ...pullPayload,
              limit: 1,
            },
          );
        } else {
          throw error;
        }
      }
      await this.persistRemoteSyncPolicy(pullResponse.syncPolicy);
      const batchEvents = pullResponse.batch.events;
      downstreamPullPasses += 1;
      const newlyAppliedDownstreamIds = await this.applyDownstreamBatch(
        batchEvents,
        pullResponse.batch.sourceNodeCode,
        pullResponse.batch.cursor,
      );

      latestSourceNodeCode = pullResponse.batch.sourceNodeCode;
      latestCursor = pullResponse.batch.cursor;
      latestDownstreamEventId =
        batchEvents[batchEvents.length - 1]?.eventId ?? latestDownstreamEventId;
      downstreamApplied += newlyAppliedDownstreamIds.length;
      appliedDownstreamIds.push(...newlyAppliedDownstreamIds);

      if (
        batchEvents.length === 0 ||
        batchEvents.length < downstreamPageLimit ||
        requestedCursor === pullResponse.batch.cursor
      ) {
        break;
      }

      if (pass + 1 >= maxDownstreamPullPasses) {
        downstreamLimitReached = true;
      }
    }

    const pushStartedAt = isoNow();
    const acknowledgedDownstreamIdsForPush = [
      ...new Set([...acknowledgedDownstreamIds, ...appliedDownstreamIds]),
    ];
    const pushPayload: StoreNodePushRequest = {
      sourceNodeCode: nodeCode,
      sentAt: pushStartedAt,
      cursor: latestCursor,
      syncRunId,
      trigger,
      clientStartedAt: startedAt,
      upstreamEvents: upstreamRows.map((row) => this.toSyncEnvelope(row, nodeCode)),
      acknowledgedDownstreamEventIds: acknowledgedDownstreamIdsForPush,
      telemetry: await this.buildStoreNodeTelemetry(),
    };

    await this.markOutboxAttemptStarted(
      upstreamRows.map((row) => row.id),
      pushStartedAt,
      syncRunId,
    );

    let pushResponse: StoreNodePushResponse;

    try {
      pushResponse = await this.postJson<StoreNodePushResponse>(
        `${this.syncBaseUrl}/api/sync/store-nodes/${nodeCode}/push`,
        pushPayload,
      );
    } catch (error) {
      await this.markOutboxTransportFailure(
        upstreamRows.map((row) => row.id),
        error,
        isoNow(),
      );
      throw error;
    }

    await this.persistRemoteSyncPolicy(pushResponse.syncPolicy);
    const pushAppliedAt = pushResponse.serverReceivedAt ?? isoNow();
    await this.markOutboxAccepted(
      [...pushResponse.acceptedEventIds, ...pushResponse.duplicateEventIds],
      pushAppliedAt,
    );
    await this.markOutboxRejected(pushResponse.rejected, pushAppliedAt);
    await this.markInboxAcknowledged(
      pushResponse.acknowledgedDownstreamEventIds,
      pushAppliedAt,
    );

    const finishedAt = isoNow();
    const upstreamProcessed =
      pushResponse.acceptedEventIds.length +
      pushResponse.duplicateEventIds.length;
    await this.upsertCheckpoint(
      latestSourceNodeCode,
      latestDownstreamEventId,
      latestCursor,
      finishedAt,
      downstreamApplied > 0
        ? finishedAt
        : await this.currentCheckpointAppliedAt(ENTERPRISE_NODE_CODE),
    );
    await this.setMetadata("last_sync_at", finishedAt);
    await this.recordSyncSchedule(trigger, finishedAt, false);
    await this.insertRunLog({
      runKind: "SYNC_CYCLE",
      result: upstreamProcessed > 0 || downstreamApplied > 0 ? "SUCCESS" : "IDLE",
      summary:
        upstreamProcessed > 0 || downstreamApplied > 0
          ? `Pushed ${upstreamProcessed} upstream event(s), applied ${downstreamApplied} downstream packet(s) across ${downstreamPullPasses} pull page(s), and refreshed the SQL Server store checkpoint.${downstreamLimitReached ? " More downstream packets may still be pending; run sync again to continue draining the queue." : ""}`
          : "The enterprise sync cycle completed successfully with no pending work.",
      upstreamProcessed,
      downstreamApplied,
      startedAt,
      finishedAt,
    });

    return {
      message:
        upstreamProcessed > 0 || downstreamApplied > 0
          ? `Flash ERP completed a real enterprise sync cycle for the SQL Server store server across ${downstreamPullPasses} pull page(s).${downstreamLimitReached ? " More downstream packets may still be pending; run sync again to continue." : ""}`
          : "Flash ERP reached enterprise successfully and found no pending sync work for the SQL Server store server.",
      snapshot: await this.getSyncSnapshot(),
      upstreamProcessed,
      downstreamApplied,
      downstreamPullPasses,
      downstreamLimitReached,
      latestCursor,
    };
  }

  private async getPendingUpstreamRows(limit: number) {
    const result = await this.query<OutboxEnvelopeRow>(
      `SELECT TOP (@limit) [id], [target_node_code], [aggregate_type], [aggregate_id],
        [event_type], [idempotency_key], [payload_json], [attempt_count],
        [record_version], [created_at]
       FROM [dbo].[sync_outbox]
       WHERE [status] IN (N'PENDING', N'IN_FLIGHT', N'FAILED')
         AND [attempt_count] < @maxAttempts
         AND ([next_retry_at] IS NULL OR [next_retry_at] <= @now)
       ORDER BY [created_at] ASC, [record_version] ASC, [id] ASC`,
      { limit, maxAttempts: MAX_SYNC_RETRY_ATTEMPTS, now: isoNow() },
    );

    return result.recordset;
  }

  private async getPendingDownstreamAcknowledgements(limit: number) {
    const result = await this.query<{ id: string }>(
      `SELECT TOP (@limit) [id]
       FROM [dbo].[sync_inbox]
       WHERE [status] = N'APPLIED'
         AND [acknowledged_at] IS NULL
       ORDER BY [received_at] ASC`,
      { limit },
    );

    return result.recordset.map((row) => row.id);
  }

  private toSyncEnvelope(row: OutboxEnvelopeRow, nodeCode: string): SyncEnvelope {
    return {
      eventId: row.id,
      idempotencyKey: row.idempotency_key,
      aggregateType: row.aggregate_type as SyncEnvelope["aggregateType"],
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      originatingNodeCode: nodeCode,
      targetNodeCode: row.target_node_code,
      recordVersion: Math.max(1, asNumber(row.record_version)),
      occurredAt: row.created_at,
      payload: this.parsePayloadJson(row.payload_json),
    };
  }

  private async buildStoreNodeTelemetry(): Promise<StoreNodeTelemetry> {
    const snapshot = await this.getSyncSnapshot();

    return {
      generatedAt: snapshot.generatedAt,
      health: snapshot.health,
      lastSyncAt: snapshot.lastSyncAt,
      lastLocalWriteAt: snapshot.lastLocalWriteAt,
      nextScheduledSyncAt: snapshot.syncPolicy.nextScheduledSyncAt,
      lastManualSyncAt: snapshot.syncPolicy.lastManualSyncAt,
      lastAutoSyncAt: snapshot.syncPolicy.lastAutoSyncAt,
      queueMetrics: {
        upstreamQueued: snapshot.queueMetrics.upstreamQueued,
        upstreamInFlight: snapshot.queueMetrics.upstreamInFlight,
        downstreamQueued: snapshot.queueMetrics.downstreamQueued,
        deadLetter: snapshot.queueMetrics.deadLetter,
      },
    };
  }

  private async markOutboxAttemptStarted(
    eventIds: string[],
    attemptedAt: string,
    syncRunId: string,
  ) {
    for (const eventId of eventIds) {
      await this.query(
        `UPDATE [dbo].[sync_outbox]
         SET [status] = N'IN_FLIGHT',
             [attempt_count] = [attempt_count] + 1,
             [last_attempt_at] = @attemptedAt,
             [next_retry_at] = NULL,
             [failure_kind] = NULL,
             [last_http_status] = NULL,
             [sync_run_id] = @syncRunId,
             [updated_at] = @attemptedAt
         WHERE [id] = @eventId
           AND [status] IN (N'PENDING', N'IN_FLIGHT', N'FAILED')`,
        { attemptedAt, syncRunId, eventId },
      );
    }
  }

  private async expireExhaustedOutboxRetries(expiredAt: string) {
    await this.query(
      `UPDATE [dbo].[sync_outbox]
       SET [status] = N'DEAD_LETTER',
           [next_retry_at] = NULL,
           [error_message] = COALESCE([error_message], N'Retry attempts exhausted before the next enterprise sync pass.'),
           [updated_at] = @expiredAt
       WHERE [status] IN (N'PENDING', N'IN_FLIGHT', N'FAILED')
         AND [attempt_count] >= @maxAttempts`,
      { expiredAt, maxAttempts: MAX_SYNC_RETRY_ATTEMPTS },
    );
  }

  private async markOutboxTransportFailure(
    eventIds: string[],
    error: unknown,
    failedAt: string,
  ) {
    if (eventIds.length === 0) {
      return;
    }

    const failure = classifySyncFailure(error);

    for (const eventId of eventIds) {
      const countResult = await this.query<{ attempt_count: number }>(
        "SELECT [attempt_count] FROM [dbo].[sync_outbox] WHERE [id] = @eventId",
        { eventId },
      );
      const attemptCount = Math.trunc(asNumber(countResult.recordset[0]?.attempt_count));
      const deadLetter = shouldMoveToDeadLetter(attemptCount);

      await this.query(
        `UPDATE [dbo].[sync_outbox]
         SET [status] = @status,
             [error_message] = @errorMessage,
             [failure_kind] = @failureKind,
             [last_http_status] = @httpStatus,
             [next_retry_at] = @nextRetryAt,
             [updated_at] = @failedAt
         WHERE [id] = @eventId`,
        {
          status: deadLetter ? "DEAD_LETTER" : "FAILED",
          errorMessage: `${failure.failureKind}: ${failure.message}`,
          failureKind: failure.failureKind,
          httpStatus: failure.httpStatus,
          nextRetryAt: deadLetter ? null : nextSyncRetryAt(failedAt, attemptCount),
          failedAt,
          eventId,
        },
      );
    }
  }

  private async postJson<TResponse>(
    url: string,
    body: unknown,
  ): Promise<TResponse> {
    const timeoutMs = 20_000;
    const timeoutMessage =
      "Enterprise sync timed out after 20 seconds. Check that the enterprise app is running and reachable, then try again.";

    try {
      const response = await postSyncJsonRaw(url, body, {
        maxResponseBytes: MAX_SYNC_RESPONSE_BYTES,
        timeoutMessage,
        timeoutMs,
        oversizedMessage: (limitBytes, contentLength) =>
          contentLength
            ? `Enterprise sync returned ${formatBytes(contentLength)}, which is larger than the desktop safety limit of ${formatBytes(limitBytes)}. Flash ERP will retry with a smaller downstream pull page.`
            : `Enterprise sync returned more than ${formatBytes(limitBytes)}. Flash ERP stopped reading that page to keep the desktop responsive and will retry with a smaller downstream pull page.`,
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        let message = `HTTP ${response.statusCode}`;
        let schemaDrift = false;
        let schemaDriftMessage: string | null = null;

        try {
          const payload = JSON.parse(response.body) as {
            error?: string;
            message?: string;
            code?: string;
            schemaDrift?: boolean;
          };
          if (payload.error || payload.message) {
            message = payload.error ?? payload.message ?? message;
          }

          schemaDrift = isSyncSchemaDriftPayload(payload);
          schemaDriftMessage =
            payload.error ??
            payload.message ??
            enterpriseDatabaseSchemaNotReadyMessage;
        } catch {}

        if (schemaDrift) {
          throw new StoreSyncTransportError(
            schemaDriftMessage ?? enterpriseDatabaseSchemaNotReadyMessage,
            "SCHEMA",
            response.statusCode,
          );
        }

        throw new StoreSyncTransportError(
          message,
          response.statusCode >= 500 ? "SERVER" : "HTTP",
          response.statusCode,
        );
      }

      return JSON.parse(response.body) as TResponse;
    } catch (error) {
      if (error instanceof StoreSyncTransportError) {
        throw error;
      }

      if (error instanceof SyncHttpClientError) {
        if (error.failureKind === "TIMEOUT") {
          throw new StoreSyncTransportError(timeoutMessage, "TIMEOUT");
        }

        if (error.failureKind === "OVERSIZED") {
          throw new StoreSyncTransportError(
            error.message,
            "SERVER",
            error.httpStatus ?? 413,
          );
        }
      }

      if (error instanceof Error) {
        throw new StoreSyncTransportError(
          "Enterprise sync could not reach the network endpoint. Flash ERP preserved the SQL Server store queue for a retry.",
          "NETWORK",
        );
      }

      throw error;
    }
  }

  private async readBoundedResponseText(response: Response) {
    const contentLength = Number(response.headers.get("content-length"));

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_SYNC_RESPONSE_BYTES
    ) {
      throw new StoreSyncTransportError(
        `Enterprise sync returned ${formatBytes(contentLength)}, which is larger than the desktop safety limit of ${formatBytes(MAX_SYNC_RESPONSE_BYTES)}. Flash ERP will retry with a smaller downstream pull page.`,
        "SERVER",
        413,
      );
    }

    if (!response.body) {
      return response.text();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        receivedBytes += value.byteLength;

        if (receivedBytes > MAX_SYNC_RESPONSE_BYTES) {
          await reader.cancel();
          throw new StoreSyncTransportError(
            `Enterprise sync returned more than ${formatBytes(MAX_SYNC_RESPONSE_BYTES)}. Flash ERP stopped reading that page to keep the desktop responsive and will retry with a smaller downstream pull page.`,
            "SERVER",
            413,
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return new TextDecoder().decode(Buffer.concat(chunks));
  }

  private async markOutboxAccepted(eventIds: string[], acknowledgedAt: string) {
    for (const eventId of eventIds) {
      await this.query(
        `UPDATE [dbo].[sync_outbox]
         SET [status] = N'ACKNOWLEDGED',
             [acknowledged_at] = @acknowledgedAt,
             [last_attempt_at] = @acknowledgedAt,
             [next_retry_at] = NULL,
             [failure_kind] = NULL,
             [last_http_status] = NULL,
             [error_message] = NULL,
             [updated_at] = @acknowledgedAt
         WHERE [id] = @eventId`,
        { acknowledgedAt, eventId },
      );
      await this.query(
        `UPDATE [dbo].[customer_account_entry]
         SET [synced_at] = @acknowledgedAt,
             [updated_at] = @acknowledgedAt
         WHERE [id] = COALESCE((
           SELECT TOP (1) [aggregate_id]
           FROM [dbo].[sync_outbox]
           WHERE [id] = @eventId
             AND [aggregate_type] = N'customerAccountEntry'
         ), @eventId)`,
        { acknowledgedAt, eventId },
      );
      await this.query(
        `UPDATE [dbo].[sales_order]
         SET [synced_at] = @acknowledgedAt,
             [updated_at] = @acknowledgedAt
         WHERE [id] = COALESCE((
           SELECT TOP (1) [aggregate_id]
           FROM [dbo].[sync_outbox]
           WHERE [id] = @eventId
             AND [aggregate_type] = N'salesOrder'
         ), @eventId)`,
        { acknowledgedAt, eventId },
      );
      await this.query(
        `UPDATE [dbo].[local_store_expense]
         SET [synced_at] = @acknowledgedAt,
             [updated_at] = @acknowledgedAt
         WHERE [id] = COALESCE((
           SELECT TOP (1) [aggregate_id]
           FROM [dbo].[sync_outbox]
           WHERE [id] = @eventId
             AND [aggregate_type] = N'storeExpense'
         ), @eventId)`,
        { acknowledgedAt, eventId },
      );
    }
  }

  private async markOutboxRejected(
    rejected: SyncRejectedEnvelope[],
    rejectedAt: string,
  ) {
    for (const item of rejected) {
      const countResult = await this.query<{ attempt_count: number }>(
        "SELECT [attempt_count] FROM [dbo].[sync_outbox] WHERE [id] = @eventId",
        { eventId: item.eventId },
      );
      const attemptCount = Math.trunc(asNumber(countResult.recordset[0]?.attempt_count));
      const deadLetter =
        !item.retryable || shouldMoveToDeadLetter(attemptCount);

      await this.query(
        `UPDATE [dbo].[sync_outbox]
         SET [status] = @status,
             [error_message] = @errorMessage,
             [failure_kind] = @failureKind,
             [next_retry_at] = @nextRetryAt,
             [last_http_status] = NULL,
             [updated_at] = @rejectedAt
         WHERE [id] = @eventId`,
        {
          status: deadLetter ? "DEAD_LETTER" : "FAILED",
          errorMessage: `${item.reasonCode}: ${item.message}`,
          failureKind: item.reasonCode,
          nextRetryAt: deadLetter ? null : nextSyncRetryAt(rejectedAt, attemptCount),
          rejectedAt,
          eventId: item.eventId,
        },
      );
    }
  }

  private async markInboxAcknowledged(eventIds: string[], acknowledgedAt: string) {
    for (const eventId of eventIds) {
      await this.query(
        `UPDATE [dbo].[sync_inbox]
         SET [acknowledged_at] = @acknowledgedAt,
             [error_message] = NULL
         WHERE [id] = @eventId`,
        { acknowledgedAt, eventId },
      );
    }
  }

  private async reapplyFailedDownstreamInbox(limit: number) {
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const failedResult = await this.query<FailedInboxEnvelopeRow>(
      `SELECT TOP (@limit)
          [id],
          [source_node_code],
          [aggregate_type],
          [aggregate_id],
          [event_type],
          [payload_json],
          [received_at]
       FROM [dbo].[sync_inbox]
       WHERE [status] IN (N'FAILED', N'DEAD_LETTER')
       ORDER BY CASE [event_type]
         WHEN N'security.user.published' THEN 0
         WHEN N'security.role.published' THEN 1
         WHEN N'security.permission.published' THEN 2
         ELSE 3
       END, [received_at] ASC`,
      { limit },
    );
    const appliedIds: string[] = [];
    const appliedAt = isoNow();

    for (const row of failedResult.recordset) {
      const event: SyncEnvelope = {
        eventId: row.id,
        idempotencyKey: row.id,
        aggregateType: row.aggregate_type as SyncEnvelope["aggregateType"],
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        originatingNodeCode: row.source_node_code,
        targetNodeCode: nodeCode,
        recordVersion: 1,
        occurredAt: row.received_at,
        payload: this.parsePayloadJson(row.payload_json),
      };

      const acknowledged = await this.applyDownstreamEvent(
        event,
        row.source_node_code,
        appliedAt,
      );

      if (acknowledged) {
        appliedIds.push(row.id);
      }
    }

    return appliedIds;
  }

  private async applyDownstreamBatch(
    events: SyncEnvelope[],
    remoteNodeCode: string,
    cursor: string | null,
  ) {
    const receivedAt = isoNow();
    const acknowledgedIds: string[] = [];

    for (const event of events) {
      const acknowledged = await this.applyDownstreamEvent(
        event,
        remoteNodeCode,
        receivedAt,
      );

      if (acknowledged) {
        acknowledgedIds.push(event.eventId);
      }
    }

    if (events.length > 0) {
      await this.upsertCheckpoint(
        remoteNodeCode,
        events[events.length - 1]?.eventId ?? null,
        cursor,
        receivedAt,
        acknowledgedIds.length > 0
          ? receivedAt
          : await this.currentCheckpointAppliedAt(remoteNodeCode),
      );
    }

    return acknowledgedIds;
  }

  private async applyDownstreamEvent(
    event: SyncEnvelope,
    remoteNodeCode: string,
    receivedAt: string,
  ) {
    return this.withTransaction(async (transaction) => {
      const existingResult = await this.query<InboxEnvelopeRow>(
        `SELECT TOP (1) [id], [status], [acknowledged_at]
         FROM [dbo].[sync_inbox]
         WHERE [id] = @eventId`,
        { eventId: event.eventId },
        transaction,
      );
      const existing = existingResult.recordset[0];

      if (existing?.acknowledged_at || existing?.status === "APPLIED") {
        return true;
      }

      await this.query(
        `MERGE [dbo].[sync_inbox] AS target
         USING (
           SELECT @id AS [id], @sourceNodeCode AS [source_node_code],
             @aggregateType AS [aggregate_type], @aggregateId AS [aggregate_id],
             @eventType AS [event_type], @payloadJson AS [payload_json],
             @receivedAt AS [received_at]
         ) AS source
         ON target.[id] = source.[id]
         WHEN MATCHED THEN UPDATE SET
           [source_node_code] = source.[source_node_code],
           [aggregate_type] = source.[aggregate_type],
           [aggregate_id] = source.[aggregate_id],
           [event_type] = source.[event_type],
           [payload_json] = source.[payload_json],
           [status] = N'RECEIVED',
           [error_message] = NULL
         WHEN NOT MATCHED THEN INSERT (
           [id], [source_node_code], [aggregate_type], [aggregate_id],
           [event_type], [payload_json], [status], [received_at],
           [applied_at], [acknowledged_at], [error_message]
         ) VALUES (
           source.[id], source.[source_node_code], source.[aggregate_type],
           source.[aggregate_id], source.[event_type], source.[payload_json],
           N'RECEIVED', source.[received_at], NULL, NULL, NULL
         );`,
        {
          id: event.eventId,
          sourceNodeCode: remoteNodeCode,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payloadJson:
            typeof event.payload === "string"
              ? event.payload
              : JSON.stringify(event.payload),
          receivedAt,
        },
        transaction,
      );

      try {
        await this.applyDownstreamPayload(event, receivedAt, transaction);
        await this.query(
          `UPDATE [dbo].[sync_inbox]
           SET [status] = N'APPLIED',
               [applied_at] = @receivedAt,
               [error_message] = NULL
           WHERE [id] = @eventId`,
          { receivedAt, eventId: event.eventId },
          transaction,
        );
        return true;
      } catch (error) {
        await this.query(
          `UPDATE [dbo].[sync_inbox]
           SET [status] = N'FAILED',
               [error_message] = @errorMessage
           WHERE [id] = @eventId`,
          {
            errorMessage:
              error instanceof Error
                ? error.message
                : "Flash ERP could not apply the downstream packet locally.",
            eventId: event.eventId,
          },
          transaction,
        );
        return false;
      }
    });
  }

  private async applyDownstreamPayload(
    event: SyncEnvelope,
    appliedAt: string,
    runner: MssqlRunner,
  ) {
    const payload = this.parsePayloadRecord(event.payload);
    const metadata = await this.metadata();
    let storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const expectedInboundStoreCode = (payloadStoreCode: unknown) => {
      if (typeof payloadStoreCode !== "string" || !payloadStoreCode.trim()) {
        return null;
      }

      return metadata.store_code ?? payloadStoreCode;
    };
    const rememberInboundStoreCode = async (payloadStoreCode: string) => {
      if (!metadata.store_code) {
        metadata.store_code = payloadStoreCode;
        storeCode = payloadStoreCode;
        await this.setMetadata("store_code", payloadStoreCode, runner);
      }
    };

    if (
      event.aggregateType === "store" &&
      event.eventType === "store.settings.published"
    ) {
      const storePayload =
        payload as Partial<EnterpriseStoreSettingsPublishedPayload>;
      const expectedStoreCode = expectedInboundStoreCode(
        storePayload.storeCode,
      );

      if (
        typeof storePayload.retailOrgName !== "string" ||
        typeof storePayload.storeCode !== "string" ||
        storePayload.storeCode !== expectedStoreCode ||
        typeof storePayload.storeName !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid store settings publication payload.",
        );
      }

      await rememberInboundStoreCode(storePayload.storeCode);
      await this.setMetadata("retail_org_name", storePayload.retailOrgName, runner);
      await this.setMetadata("store_name", storePayload.storeName, runner);
      await this.setMetadata("store_license_status", storePayload.licenseStatus ?? "LICENSED", runner);
      await this.setMetadata("terminal_license_status", storePayload.terminalLicenseStatus ?? "LICENSED", runner);

      for (const [key, value] of [
        ["store_license_key", storePayload.licenseKey],
        ["store_licensed_until", storePayload.licensedUntil],
        ["terminal_license_key", storePayload.terminalLicenseKey],
        ["terminal_licensed_until", storePayload.terminalLicensedUntil],
        ["store_phone", storePayload.storePhone],
        ["store_address_line1", storePayload.storeAddressLine1],
        ["store_address_line2", storePayload.storeAddressLine2],
        ["company_logo_url", storePayload.companyLogoUrl],
        ["login_background_image_url", storePayload.loginBackgroundImageUrl],
        ["sales_receipt_template_html", storePayload.salesReceiptTemplateHtml],
        [
          "product_sizes_json",
          Array.isArray(storePayload.productSizes)
            ? JSON.stringify(
                normalizeSetupStringList(storePayload.productSizes) ?? [],
              )
            : null,
        ],
        [
          "pos_discount_rates_json",
          Array.isArray(storePayload.posDiscountRates)
            ? JSON.stringify(
                normalizeSetupNumberList(storePayload.posDiscountRates) ?? [],
              )
            : null,
        ],
      ] as const) {
        if (typeof value === "string" && value.trim()) {
          await this.setMetadata(key, value, runner);
        } else {
          await this.deleteMetadata(key, runner);
        }
      }

      return;
    }

    if (
      event.aggregateType === "permission" &&
      event.eventType === "security.permission.published"
    ) {
      const permissionPayload =
        payload as Partial<EnterprisePermissionPublishedPayload>;
      const expectedStoreCode = expectedInboundStoreCode(
        permissionPayload.storeCode,
      );

      if (
        typeof permissionPayload.storeCode !== "string" ||
        permissionPayload.storeCode !== expectedStoreCode ||
        typeof permissionPayload.permissionCode !== "string" ||
        typeof permissionPayload.permissionName !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid permission publication payload.",
        );
      }

      await rememberInboundStoreCode(permissionPayload.storeCode);
      await this.mergeRow(
        "permission_snapshot",
        ["permission_code"],
        {
          id: event.aggregateId,
          permission_code: permissionPayload.permissionCode,
          permission_name: permissionPayload.permissionName,
          description: permissionPayload.description ?? null,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "role" &&
      event.eventType === "security.role.published"
    ) {
      const rolePayload = payload as Partial<EnterpriseRolePublishedPayload>;
      const expectedStoreCode = expectedInboundStoreCode(rolePayload.storeCode);

      if (
        typeof rolePayload.storeCode !== "string" ||
        rolePayload.storeCode !== expectedStoreCode ||
        typeof rolePayload.roleCode !== "string" ||
        typeof rolePayload.roleName !== "string" ||
        typeof rolePayload.status !== "string" ||
        !Array.isArray(rolePayload.permissionCodes)
      ) {
        throw new Error(
          "Flash ERP received an invalid role publication payload.",
        );
      }

      await rememberInboundStoreCode(rolePayload.storeCode);
      await this.mergeRow(
        "role_snapshot",
        ["role_code"],
        {
          id: event.aggregateId,
          role_code: rolePayload.roleCode,
          role_name: rolePayload.roleName,
          description: rolePayload.description ?? null,
          status: rolePayload.status,
          permission_codes_json: writeStringArray(
            rolePayload.permissionCodes.filter(
              (permissionCode): permissionCode is string =>
                typeof permissionCode === "string",
            ),
          ),
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "retailUser" &&
      event.eventType === "security.user.published"
    ) {
      const userPayload =
        payload as Partial<EnterpriseRetailUserPublishedPayload>;
      const expectedStoreCode = expectedInboundStoreCode(userPayload.storeCode);

      if (
        typeof userPayload.storeCode !== "string" ||
        userPayload.storeCode !== expectedStoreCode ||
        typeof userPayload.userId !== "string" ||
        typeof userPayload.loginId !== "string" ||
        typeof userPayload.displayName !== "string" ||
        typeof userPayload.accountStatus !== "string" ||
        !Array.isArray(userPayload.roleCodes) ||
        !Array.isArray(userPayload.roleNames) ||
        !Array.isArray(userPayload.permissionCodes)
      ) {
        throw new Error(
          "Flash ERP received an invalid retail-user publication payload.",
        );
      }

      await rememberInboundStoreCode(userPayload.storeCode);
      if (
        typeof userPayload.homeStoreCode !== "string" ||
        normalizeLoginId(userPayload.homeStoreCode) !== normalizeLoginId(storeCode)
      ) {
        await this.query(
          "DELETE FROM [dbo].[retail_user_snapshot] WHERE LOWER([login_id]) = LOWER(@loginId)",
          { loginId: userPayload.loginId },
          runner,
        );
        return;
      }

      const permissionCodes = userPayload.permissionCodes.filter(
        (permissionCode): permissionCode is string =>
          typeof permissionCode === "string",
      );
      const capabilities = capabilitiesFrom(
        permissionCodes,
        userPayload.accountStatus,
      );

      await this.mergeRow(
        "retail_user_snapshot",
        ["login_id"],
        {
          id: userPayload.userId,
          login_id: userPayload.loginId,
          email: userPayload.email ?? null,
          display_name: userPayload.displayName,
          account_status: userPayload.accountStatus,
          home_store_code: userPayload.homeStoreCode ?? null,
          home_store_name: userPayload.homeStoreName ?? null,
          role_codes_json: writeStringArray(
            userPayload.roleCodes.filter(
              (roleCode): roleCode is string => typeof roleCode === "string",
            ),
          ),
          role_names_json: writeStringArray(
            userPayload.roleNames.filter(
              (roleName): roleName is string => typeof roleName === "string",
            ),
          ),
          permission_codes_json: writeStringArray(permissionCodes),
          password_hash: userPayload.passwordHash ?? null,
          password_updated_at: userPayload.passwordUpdatedAt ?? null,
          cashier_eligible: capabilities.cashierEligible ? 1 : 0,
          supervisor_eligible: capabilities.supervisorEligible ? 1 : 0,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "customer" &&
      event.eventType === "customer.published"
    ) {
      const customerPayload =
        payload as Partial<EnterpriseCustomerPublishedPayload>;

      if (
        typeof customerPayload.storeCode !== "string" ||
        customerPayload.storeCode !== storeCode ||
        typeof customerPayload.customerId !== "string" ||
        typeof customerPayload.customerNo !== "string" ||
        typeof customerPayload.fullName !== "string" ||
        typeof customerPayload.customerType !== "string" ||
        typeof customerPayload.loyaltyEnrolled !== "boolean" ||
        typeof customerPayload.loyaltyPointsBalance !== "number" ||
        typeof customerPayload.allowCreditSales !== "boolean" ||
        typeof customerPayload.receivableBalanceAmount !== "number" ||
        typeof customerPayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid customer publication payload.",
        );
      }

      await this.mergeRow(
        "customer",
        ["id"],
        {
          id: customerPayload.customerId,
          customer_no: customerPayload.customerNo,
          full_name: customerPayload.fullName,
          customer_type: customerPayload.customerType,
          phone: customerPayload.phone ?? null,
          email: customerPayload.email ?? null,
          home_store_code: customerPayload.homeStoreCode ?? null,
          home_store_name: customerPayload.homeStoreName ?? null,
          address_line1: customerPayload.addressLine1 ?? null,
          city: customerPayload.city ?? null,
          country_code: customerPayload.countryCode ?? null,
          loyalty_enrolled: customerPayload.loyaltyEnrolled ? 1 : 0,
          loyalty_tier: customerPayload.loyaltyTier ?? null,
          loyalty_points_balance: Math.trunc(
            customerPayload.loyaltyPointsBalance,
          ),
          allow_credit_sales: customerPayload.allowCreditSales ? 1 : 0,
          credit_limit_amount: customerPayload.creditLimitAmount ?? null,
          receivable_balance_amount:
            customerPayload.receivableBalanceAmount,
          note: customerPayload.note ?? null,
          status: customerPayload.status,
          record_version: 1,
          deleted_at: null,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "productDepartment" &&
      event.eventType === "setup.product-department.published"
    ) {
      const departmentPayload =
        payload as Partial<EnterpriseProductDepartmentPublishedPayload>;

      if (
        typeof departmentPayload.storeCode !== "string" ||
        departmentPayload.storeCode !== storeCode ||
        typeof departmentPayload.departmentCode !== "string" ||
        typeof departmentPayload.departmentName !== "string" ||
        typeof departmentPayload.status !== "string" ||
        typeof departmentPayload.sortOrder !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid product department publication payload.",
        );
      }

      await this.mergeRow(
        "product_department_snapshot",
        ["department_code"],
        {
          id: event.aggregateId,
          department_code: departmentPayload.departmentCode,
          department_name: departmentPayload.departmentName,
          description: departmentPayload.description ?? null,
          status: departmentPayload.status,
          sort_order: Math.trunc(departmentPayload.sortOrder),
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "productCategory" &&
      event.eventType === "setup.product-category.published"
    ) {
      const categoryPayload =
        payload as Partial<EnterpriseProductCategoryPublishedPayload>;

      if (
        typeof categoryPayload.storeCode !== "string" ||
        categoryPayload.storeCode !== storeCode ||
        typeof categoryPayload.categoryCode !== "string" ||
        typeof categoryPayload.categoryName !== "string" ||
        typeof categoryPayload.departmentCode !== "string" ||
        typeof categoryPayload.departmentName !== "string" ||
        typeof categoryPayload.status !== "string" ||
        typeof categoryPayload.sortOrder !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid product category publication payload.",
        );
      }

      await this.mergeRow(
        "product_category_snapshot",
        ["category_code"],
        {
          id: event.aggregateId,
          category_code: categoryPayload.categoryCode,
          category_name: categoryPayload.categoryName,
          department_code: categoryPayload.departmentCode,
          department_name: categoryPayload.departmentName,
          description: categoryPayload.description ?? null,
          status: categoryPayload.status,
          sort_order: Math.trunc(categoryPayload.sortOrder),
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "unitOfMeasure" &&
      event.eventType === "setup.unit-of-measure.published"
    ) {
      const uomPayload =
        payload as Partial<EnterpriseUnitOfMeasurePublishedPayload>;

      if (
        typeof uomPayload.storeCode !== "string" ||
        uomPayload.storeCode !== storeCode ||
        typeof uomPayload.uomCode !== "string" ||
        typeof uomPayload.uomName !== "string" ||
        typeof uomPayload.decimalPrecision !== "number" ||
        typeof uomPayload.allowFractionalSale !== "boolean" ||
        typeof uomPayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid unit-of-measure publication payload.",
        );
      }

      await this.mergeRow(
        "unit_of_measure_snapshot",
        ["uom_code"],
        {
          id: event.aggregateId,
          uom_code: uomPayload.uomCode,
          uom_name: uomPayload.uomName,
          description: uomPayload.description ?? null,
          decimal_precision: Math.max(0, Math.trunc(uomPayload.decimalPrecision)),
          allow_fractional_sale: uomPayload.allowFractionalSale ? 1 : 0,
          status: uomPayload.status,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "giftCertificate" &&
      event.eventType === "gift-certificate.published"
    ) {
      const certificatePayload =
        payload as Partial<EnterpriseGiftCertificatePublishedPayload>;

      if (
        typeof certificatePayload.storeCode !== "string" ||
        certificatePayload.storeCode !== storeCode ||
        typeof certificatePayload.certificateId !== "string" ||
        typeof certificatePayload.certificateNo !== "string" ||
        typeof certificatePayload.originalAmount !== "number" ||
        typeof certificatePayload.balanceAmount !== "number" ||
        typeof certificatePayload.currencyCode !== "string" ||
        typeof certificatePayload.issueDate !== "string" ||
        typeof certificatePayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid gift certificate publication payload.",
        );
      }

      await this.mergeRow(
        "gift_certificate_snapshot",
        ["certificate_no"],
        {
          id: certificatePayload.certificateId,
          certificate_no: certificatePayload.certificateNo,
          recipient_name: certificatePayload.recipientName ?? null,
          purchaser_name: certificatePayload.purchaserName ?? null,
          original_amount: certificatePayload.originalAmount,
          balance_amount: certificatePayload.balanceAmount,
          currency_code: certificatePayload.currencyCode,
          issue_date: certificatePayload.issueDate,
          expiry_date: certificatePayload.expiryDate ?? null,
          status: certificatePayload.status,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "promotion" &&
      event.eventType === "setup.promotion.published"
    ) {
      const promotionPayload =
        payload as Partial<EnterprisePromotionPublishedPayload>;

      if (
        typeof promotionPayload.storeCode !== "string" ||
        promotionPayload.storeCode !== storeCode ||
        typeof promotionPayload.promotionId !== "string" ||
        typeof promotionPayload.promotionCode !== "string" ||
        typeof promotionPayload.promotionName !== "string" ||
        typeof promotionPayload.discountType !== "string" ||
        typeof promotionPayload.targetScope !== "string" ||
        typeof promotionPayload.discountValue !== "number" ||
        typeof promotionPayload.allowWithLoyalty !== "boolean" ||
        typeof promotionPayload.applyOncePerBasket !== "boolean" ||
        typeof promotionPayload.priority !== "number" ||
        typeof promotionPayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid promotion publication payload.",
        );
      }

      await this.mergeRow(
        "promotion_snapshot",
        ["promotion_code"],
        {
          id: promotionPayload.promotionId,
          promotion_code: promotionPayload.promotionCode,
          promotion_name: promotionPayload.promotionName,
          description: promotionPayload.description ?? null,
          discount_type: promotionPayload.discountType,
          target_scope: promotionPayload.targetScope,
          discount_value: promotionPayload.discountValue,
          minimum_basket_amount:
            promotionPayload.minimumBasketAmount ?? null,
          minimum_line_quantity:
            promotionPayload.minimumLineQuantity ?? null,
          buy_quantity: promotionPayload.buyQuantity ?? null,
          reward_quantity: promotionPayload.rewardQuantity ?? null,
          target_department_code:
            promotionPayload.targetDepartmentCode ?? null,
          target_category_code: promotionPayload.targetCategoryCode ?? null,
          target_product_code: promotionPayload.targetProductCode ?? null,
          eligible_store_codes_json: Array.isArray(
            promotionPayload.eligibleStoreCodes,
          )
            ? writeStringArray(promotionPayload.eligibleStoreCodes)
            : null,
          eligible_customer_types_json: Array.isArray(
            promotionPayload.eligibleCustomerTypes,
          )
            ? writeStringArray(promotionPayload.eligibleCustomerTypes)
            : null,
          eligible_loyalty_tiers_json: Array.isArray(
            promotionPayload.eligibleLoyaltyTiers,
          )
            ? writeStringArray(promotionPayload.eligibleLoyaltyTiers)
            : null,
          active_days_of_week_json: Array.isArray(
            promotionPayload.activeDaysOfWeek,
          )
            ? writeStringArray(promotionPayload.activeDaysOfWeek)
            : null,
          active_from_minutes:
            typeof promotionPayload.activeFromMinutes === "number"
              ? Math.trunc(promotionPayload.activeFromMinutes)
              : null,
          active_to_minutes:
            typeof promotionPayload.activeToMinutes === "number"
              ? Math.trunc(promotionPayload.activeToMinutes)
              : null,
          coupon_required: promotionPayload.couponRequired ? 1 : 0,
          coupon_code: promotionPayload.couponCode ?? null,
          allow_with_loyalty: promotionPayload.allowWithLoyalty ? 1 : 0,
          apply_once_per_basket: promotionPayload.applyOncePerBasket ? 1 : 0,
          priority: Math.max(0, Math.trunc(promotionPayload.priority)),
          start_at: promotionPayload.startAt ?? null,
          end_at: promotionPayload.endAt ?? null,
          status: promotionPayload.status,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "product" &&
      event.eventType === "catalog.product.published"
    ) {
      const productPayload =
        payload as Partial<EnterpriseCatalogProductPublishedPayload>;
      const metadata = await this.metadata();
      const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;

      if (
        typeof productPayload.storeCode !== "string" ||
        productPayload.storeCode !== storeCode ||
        typeof productPayload.productCode !== "string" ||
        typeof productPayload.productName !== "string" ||
        typeof productPayload.unitPrice !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid catalog product publication payload.",
        );
      }

      const matrixVariants = Array.isArray(productPayload.matrixVariants)
        ? productPayload.matrixVariants.filter(
            (variant) =>
              typeof variant === "object" &&
              variant !== null &&
              typeof variant.variantCode === "string" &&
              typeof variant.unitPrice === "number",
          )
        : [];
      const nextQuantity =
        matrixVariants.length > 0
          ? matrixVariants.reduce(
              (sum, variant) =>
                sum +
                (typeof variant.quantityOnHand === "number"
                  ? variant.quantityOnHand
                  : 0),
              0,
            )
          : typeof productPayload.quantityOnHand === "number"
            ? productPayload.quantityOnHand
            : 0;

      await this.query(
        `MERGE [dbo].[product_snapshot] AS target
         USING (
           SELECT
             @id AS [id],
             @productCode AS [product_code],
             @productName AS [product_name],
             @productType AS [product_type],
             @shortName AS [short_name],
             @description AS [description],
             @primaryImageUrl AS [primary_image_url],
             @departmentCode AS [department_code],
             @categoryCode AS [category_code],
             @subcategory AS [subcategory],
             @unitOfMeasure AS [unit_of_measure],
             @taxable AS [taxable],
             @taxProfileCode AS [tax_profile_code],
             @taxProfileName AS [tax_profile_name],
             @taxRatePercent AS [tax_rate_percent],
             @taxInclusive AS [tax_inclusive],
             @trackInventory AS [track_inventory],
             @isSerialized AS [is_serialized],
             @trackSize AS [track_size],
             @trackColor AS [track_color],
             @mustEnterPriceAtPos AS [must_enter_price_at_pos],
             @minStockLevel AS [min_stock_level],
             @reorderPoint AS [reorder_point],
             @safetyStockLevel AS [safety_stock_level],
             @catalogSortOrder AS [catalog_sort_order],
             @unitPrice AS [unit_price],
             @quantityOnHand AS [quantity_on_hand],
             @appliedAt AS [updated_at]
         ) AS source
         ON target.[product_code] = source.[product_code]
         WHEN MATCHED THEN UPDATE SET
           [product_name] = source.[product_name],
           [product_type] = source.[product_type],
           [short_name] = source.[short_name],
           [description] = source.[description],
           [primary_image_url] = source.[primary_image_url],
           [department_code] = source.[department_code],
           [category_code] = source.[category_code],
           [subcategory] = source.[subcategory],
           [unit_of_measure] = source.[unit_of_measure],
           [taxable] = source.[taxable],
           [tax_profile_code] = source.[tax_profile_code],
           [tax_profile_name] = source.[tax_profile_name],
           [tax_rate_percent] = source.[tax_rate_percent],
           [tax_inclusive] = source.[tax_inclusive],
           [track_inventory] = source.[track_inventory],
           [is_serialized] = source.[is_serialized],
           [track_size] = source.[track_size],
           [track_color] = source.[track_color],
           [must_enter_price_at_pos] = source.[must_enter_price_at_pos],
           [min_stock_level] = source.[min_stock_level],
           [reorder_point] = source.[reorder_point],
           [safety_stock_level] = source.[safety_stock_level],
           [catalog_membership_active] = 1,
           [catalog_sort_order] = source.[catalog_sort_order],
           [unit_price] = source.[unit_price],
           [quantity_on_hand] = source.[quantity_on_hand],
           [updated_at] = source.[updated_at]
         WHEN NOT MATCHED THEN INSERT (
           [id], [product_code], [product_name], [product_type], [short_name], [description],
           [primary_image_url], [department_code], [category_code], [subcategory],
           [unit_of_measure], [taxable], [tax_profile_code], [tax_profile_name],
           [tax_rate_percent], [tax_inclusive], [track_inventory], [is_serialized],
           [track_size], [track_color], [must_enter_price_at_pos], [min_stock_level], [reorder_point],
           [safety_stock_level], [catalog_membership_active], [catalog_sort_order],
           [unit_price], [quantity_on_hand], [updated_at]
         ) VALUES (
           source.[id], source.[product_code], source.[product_name],
           source.[product_type], source.[short_name], source.[description], source.[primary_image_url],
           source.[department_code], source.[category_code], source.[subcategory],
           source.[unit_of_measure], source.[taxable], source.[tax_profile_code],
           source.[tax_profile_name], source.[tax_rate_percent],
           source.[tax_inclusive], source.[track_inventory], source.[is_serialized],
           source.[track_size], source.[track_color],
           source.[must_enter_price_at_pos], source.[min_stock_level],
           source.[reorder_point], source.[safety_stock_level], 1,
           source.[catalog_sort_order], source.[unit_price],
           source.[quantity_on_hand], source.[updated_at]
         );`,
        {
          id: event.aggregateId,
          productCode: productPayload.productCode,
          productName: productPayload.productName,
          productType: productPayload.productType ?? "STANDARD",
          shortName: productPayload.shortName ?? null,
          description: productPayload.description ?? null,
          primaryImageUrl: productPayload.primaryImageUrl ?? null,
          departmentCode: productPayload.department ?? null,
          categoryCode: productPayload.category ?? null,
          subcategory: productPayload.subcategory ?? null,
          unitOfMeasure: productPayload.unitOfMeasure ?? "EA",
          taxable: productPayload.taxable === false ? 0 : 1,
          taxProfileCode: productPayload.taxProfileCode ?? null,
          taxProfileName: productPayload.taxProfileName ?? null,
          taxRatePercent: productPayload.taxRatePercent ?? null,
          taxInclusive: productPayload.taxInclusive ? 1 : 0,
          trackInventory: productPayload.trackInventory === false ? 0 : 1,
          isSerialized: productPayload.isSerialized ? 1 : 0,
          trackSize: productPayload.trackSize ? 1 : 0,
          trackColor: productPayload.trackColor ? 1 : 0,
          mustEnterPriceAtPos: productPayload.mustEnterPriceAtPos ? 1 : 0,
          minStockLevel: productPayload.minStockLevel ?? null,
          reorderPoint: productPayload.reorderPoint ?? null,
          safetyStockLevel: productPayload.safetyStockLevel ?? null,
          catalogSortOrder:
            typeof productPayload.catalogSortOrder === "number"
              ? Math.trunc(productPayload.catalogSortOrder)
              : null,
          unitPrice: productPayload.unitPrice,
          quantityOnHand: nextQuantity,
          appliedAt,
        },
        runner,
      );

      await this.query(
        `DELETE FROM [dbo].[product_variant_snapshot]
         WHERE [product_code] = @productCode`,
        { productCode: productPayload.productCode },
        runner,
      );

      for (const variant of matrixVariants) {
        await this.query(
          `INSERT INTO [dbo].[product_variant_snapshot] (
            [id],
            [product_code],
            [variant_code],
            [sku],
            [display_name],
            [unit_price],
            [quantity_on_hand],
            [barcode],
            [status],
            [attributes_json],
            [updated_at]
          ) VALUES (
            @id,
            @productCode,
            @variantCode,
            @sku,
            @displayName,
            @unitPrice,
            @quantityOnHand,
            @barcode,
            @status,
            @attributesJson,
            @updatedAt
          )`,
          {
            id:
              typeof variant.variantId === "string"
                ? variant.variantId
                : randomUUID(),
            productCode: productPayload.productCode,
            variantCode: variant.variantCode.toUpperCase(),
            sku: typeof variant.sku === "string" ? variant.sku : null,
            displayName:
              typeof variant.displayName === "string"
                ? variant.displayName
                : null,
            unitPrice: variant.unitPrice,
            quantityOnHand:
              typeof variant.quantityOnHand === "number"
                ? variant.quantityOnHand
                : 0,
            barcode: typeof variant.barcode === "string" ? variant.barcode : null,
            status: typeof variant.status === "string" ? variant.status : "ACTIVE",
            attributesJson: writeMatrixVariantAttributes(
              Array.isArray(variant.attributes) ? variant.attributes : [],
            ),
            updatedAt: appliedAt,
          },
          runner,
        );
      }

      return;
    }

    if (
      event.aggregateType === "taxProfile" &&
      event.eventType === "setup.tax-profile.published"
    ) {
      const taxPayload =
        payload as Partial<EnterpriseTaxProfilePublishedPayload>;

      if (
        typeof taxPayload.storeCode !== "string" ||
        taxPayload.storeCode !== storeCode ||
        typeof taxPayload.taxProfileCode !== "string" ||
        typeof taxPayload.taxProfileName !== "string" ||
        typeof taxPayload.ratePercent !== "number" ||
        typeof taxPayload.isDefault !== "boolean" ||
        typeof taxPayload.isTaxInclusive !== "boolean" ||
        typeof taxPayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid tax profile publication payload.",
        );
      }

      await this.mergeRow(
        "tax_profile_snapshot",
        ["tax_profile_code"],
        {
          id: event.aggregateId,
          tax_profile_code: taxPayload.taxProfileCode,
          tax_profile_name: taxPayload.taxProfileName,
          description: taxPayload.description ?? null,
          rate_percent: taxPayload.ratePercent,
          is_default: taxPayload.isDefault ? 1 : 0,
          is_tax_inclusive: taxPayload.isTaxInclusive ? 1 : 0,
          status: taxPayload.status,
          updated_at: appliedAt,
        },
        runner,
      );
      await this.query(
        `UPDATE [dbo].[product_snapshot]
         SET [tax_profile_name] = @taxProfileName,
             [tax_rate_percent] = @ratePercent,
             [tax_inclusive] = @taxInclusive,
             [updated_at] = @appliedAt
         WHERE [tax_profile_code] = @taxProfileCode`,
        {
          taxProfileName: taxPayload.taxProfileName,
          ratePercent: taxPayload.ratePercent,
          taxInclusive: taxPayload.isTaxInclusive ? 1 : 0,
          appliedAt,
          taxProfileCode: taxPayload.taxProfileCode,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "tenderMethod" &&
      event.eventType === "setup.tender-method.published"
    ) {
      const tenderPayload =
        payload as Partial<EnterpriseTenderMethodPublishedPayload>;

      if (
        typeof tenderPayload.storeCode !== "string" ||
        tenderPayload.storeCode !== storeCode ||
        typeof tenderPayload.tenderMethodCode !== "string" ||
        typeof tenderPayload.tenderMethodName !== "string" ||
        typeof tenderPayload.paymentMethod !== "string" ||
        typeof tenderPayload.requiresReference !== "boolean" ||
        typeof tenderPayload.allowChange !== "boolean" ||
        typeof tenderPayload.allowRefund !== "boolean" ||
        typeof tenderPayload.allowOpenCashDrawer !== "boolean" ||
        typeof tenderPayload.status !== "string" ||
        typeof tenderPayload.sortOrder !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid tender method publication payload.",
        );
      }

      const publishedAt =
        typeof tenderPayload.publishedAt === "string" &&
        tenderPayload.publishedAt.trim()
          ? tenderPayload.publishedAt
          : appliedAt;

      await this.mergeRow(
        "tender_method_snapshot",
        ["tender_method_code"],
        {
          id: event.aggregateId,
          tender_method_code: tenderPayload.tenderMethodCode,
          tender_method_name: tenderPayload.tenderMethodName,
          payment_method: tenderPayload.paymentMethod,
          gateway_provider: tenderPayload.gatewayProvider ?? null,
          gateway_mode: tenderPayload.gatewayMode ?? null,
          gateway_merchant_id: tenderPayload.gatewayMerchantId ?? null,
          gateway_public_key: tenderPayload.gatewayPublicKey ?? null,
          gateway_callback_url: tenderPayload.gatewayCallbackUrl ?? null,
          gateway_active: tenderPayload.gatewayActive ? 1 : 0,
          gateway_status: tenderPayload.gatewayStatus ?? "DISABLED",
          description: tenderPayload.description ?? null,
          requires_reference: tenderPayload.requiresReference ? 1 : 0,
          allow_change: tenderPayload.allowChange ? 1 : 0,
          allow_refund: tenderPayload.allowRefund ? 1 : 0,
          allow_open_cash_drawer: tenderPayload.allowOpenCashDrawer ? 1 : 0,
          status: tenderPayload.status,
          sort_order: Math.trunc(tenderPayload.sortOrder),
          published_at: publishedAt,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "bankAccount" &&
      event.eventType === "setup.bank-account.published"
    ) {
      const bankPayload =
        payload as Partial<EnterpriseBankAccountPublishedPayload>;

      if (
        typeof bankPayload.storeCode !== "string" ||
        bankPayload.storeCode !== storeCode ||
        typeof bankPayload.bankAccountId !== "string" ||
        typeof bankPayload.bankCode !== "string" ||
        typeof bankPayload.bankName !== "string" ||
        typeof bankPayload.branchCode !== "string" ||
        typeof bankPayload.branchName !== "string" ||
        typeof bankPayload.accountNumber !== "string" ||
        typeof bankPayload.accountName !== "string" ||
        typeof bankPayload.currencyCode !== "string" ||
        typeof bankPayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid bank account publication payload.",
        );
      }

      await this.mergeRow(
        "bank_account_snapshot",
        ["id"],
        {
          id: bankPayload.bankAccountId,
          bank_code: bankPayload.bankCode,
          bank_name: bankPayload.bankName,
          branch_code: bankPayload.branchCode,
          branch_name: bankPayload.branchName,
          account_number: bankPayload.accountNumber,
          account_name: bankPayload.accountName,
          currency_code: bankPayload.currencyCode,
          status: bankPayload.status,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "barcode" &&
      event.eventType === "catalog.barcode.published"
    ) {
      const barcodePayload =
        payload as Partial<EnterpriseBarcodePublishedPayload>;

      if (
        typeof barcodePayload.storeCode !== "string" ||
        barcodePayload.storeCode !== storeCode ||
        typeof barcodePayload.productCode !== "string" ||
        typeof barcodePayload.barcode !== "string" ||
        typeof barcodePayload.barcodeType !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid barcode publication payload.",
        );
      }

      await this.mergeRow(
        "barcode_snapshot",
        ["barcode_code"],
        {
          id: event.aggregateId,
          barcode_code: barcodePayload.barcode,
          product_code: barcodePayload.productCode,
          barcode_type: barcodePayload.barcodeType,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "priceList" &&
      event.eventType === "pricing.price-list.published"
    ) {
      const pricePayload =
        payload as Partial<EnterprisePriceListPublishedPayload>;
      const metadata = await this.metadata();
      const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;

      if (
        typeof pricePayload.storeCode !== "string" ||
        pricePayload.storeCode !== storeCode ||
        typeof pricePayload.priceListCode !== "string" ||
        typeof pricePayload.productCode !== "string" ||
        typeof pricePayload.unitPrice !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid price publication payload.",
        );
      }

      const priceListName =
        typeof pricePayload.priceListName === "string"
          ? pricePayload.priceListName
          : pricePayload.priceListCode;
      const currencyCode =
        typeof pricePayload.currencyCode === "string"
          ? pricePayload.currencyCode
          : (metadata.currency_code ?? "USD");
      const isDefault =
        typeof pricePayload.isDefault === "boolean"
          ? pricePayload.isDefault
          : pricePayload.priceListCode === "default-sell";

      await this.query(
        `MERGE [dbo].[price_list_entry_snapshot] AS target
         USING (
           SELECT @id AS [id], @priceListCode AS [price_list_code],
             @priceListName AS [price_list_name], @currencyCode AS [currency_code],
             @isDefault AS [is_default], @customerType AS [customer_type],
             @loyaltyTier AS [loyalty_tier], @productCode AS [product_code],
             @unitPrice AS [unit_price], @status AS [status], @appliedAt AS [updated_at]
         ) AS source
         ON target.[price_list_code] = source.[price_list_code]
            AND target.[product_code] = source.[product_code]
         WHEN MATCHED THEN UPDATE SET
           [id] = source.[id],
           [price_list_name] = source.[price_list_name],
           [currency_code] = source.[currency_code],
           [is_default] = source.[is_default],
           [customer_type] = source.[customer_type],
           [loyalty_tier] = source.[loyalty_tier],
           [unit_price] = source.[unit_price],
           [status] = source.[status],
           [updated_at] = source.[updated_at]
         WHEN NOT MATCHED THEN INSERT (
           [id], [price_list_code], [price_list_name], [currency_code],
           [is_default], [customer_type], [loyalty_tier], [product_code],
           [unit_price], [status], [updated_at]
         ) VALUES (
           source.[id], source.[price_list_code], source.[price_list_name],
           source.[currency_code], source.[is_default], source.[customer_type],
           source.[loyalty_tier], source.[product_code], source.[unit_price],
           source.[status], source.[updated_at]
         );`,
        {
          id: event.aggregateId,
          priceListCode: pricePayload.priceListCode,
          priceListName,
          currencyCode,
          isDefault: isDefault ? 1 : 0,
          customerType: pricePayload.customerType ?? null,
          loyaltyTier: pricePayload.loyaltyTier ?? null,
          productCode: pricePayload.productCode,
          unitPrice: pricePayload.unitPrice,
          status: pricePayload.status ?? "ACTIVE",
          appliedAt,
        },
        runner,
      );

      if (isDefault) {
        await this.query(
          `UPDATE [dbo].[product_snapshot]
           SET [unit_price] = @unitPrice,
               [updated_at] = @appliedAt
           WHERE [product_code] = @productCode`,
          {
            unitPrice: pricePayload.unitPrice,
            appliedAt,
            productCode: pricePayload.productCode,
          },
          runner,
        );
      }

      return;
    }

    if (
      event.aggregateType === "inventoryLocation" &&
      event.eventType === "inventory.location.published"
    ) {
      const locationPayload =
        payload as Partial<EnterpriseInventoryLocationPublishedPayload>;

      if (
        typeof locationPayload.storeCode !== "string" ||
        locationPayload.storeCode !== storeCode ||
        typeof locationPayload.locationCode !== "string" ||
        typeof locationPayload.locationName !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid inventory location publication payload.",
        );
      }

      if (locationPayload.useForSalesDefault === true) {
        await this.query(
          `UPDATE [dbo].[inventory_location_snapshot]
           SET [is_sales_default] = 0,
               [updated_at] = @appliedAt
           WHERE [location_code] <> @locationCode`,
          { appliedAt, locationCode: locationPayload.locationCode },
          runner,
        );
      }

      if (locationPayload.useForSalesOrderDefault === true) {
        await this.query(
          `UPDATE [dbo].[inventory_location_snapshot]
           SET [is_sales_order_default] = 0,
               [updated_at] = @appliedAt
           WHERE [location_code] <> @locationCode`,
          { appliedAt, locationCode: locationPayload.locationCode },
          runner,
        );
      }

      if (locationPayload.useForReceivingDefault === true) {
        await this.query(
          `UPDATE [dbo].[inventory_location_snapshot]
           SET [is_receiving_default] = 0,
               [updated_at] = @appliedAt
           WHERE [location_code] <> @locationCode`,
          { appliedAt, locationCode: locationPayload.locationCode },
          runner,
        );
      }

      await this.mergeRow(
        "inventory_location_snapshot",
        ["location_code"],
        {
          id: event.aggregateId,
          location_code: locationPayload.locationCode,
          location_name: locationPayload.locationName,
          location_type: locationPayload.locationType ?? "STORE",
          status: locationPayload.status ?? "ACTIVE",
          defaults: locationPayload.defaults ?? "",
          is_sales_default: locationPayload.useForSalesDefault ? 1 : 0,
          is_sales_order_default: locationPayload.useForSalesOrderDefault ? 1 : 0,
          is_receiving_default: locationPayload.useForReceivingDefault ? 1 : 0,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "interStoreTransferTarget" &&
      event.eventType === "inter-store-transfer.target.published"
    ) {
      const targetPayload =
        payload as Partial<EnterpriseInterStoreTransferRequestTargetPublishedPayload>;

      if (
        typeof targetPayload.storeCode !== "string" ||
        targetPayload.storeCode !== storeCode ||
        typeof targetPayload.sourceStoreCode !== "string" ||
        typeof targetPayload.sourceStoreName !== "string" ||
        typeof targetPayload.sourceLocationCode !== "string" ||
        typeof targetPayload.sourceLocationName !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid transfer request target payload.",
        );
      }

      await this.mergeRow(
        "inter_store_transfer_request_target_snapshot",
        ["source_location_code"],
        {
          source_location_code: targetPayload.sourceLocationCode,
          source_store_code: targetPayload.sourceStoreCode,
          source_store_name: targetPayload.sourceStoreName,
          source_store_sales_enabled:
            targetPayload.sourceStoreSalesEnabled === false ? 0 : 1,
          source_store_warehouse_enabled:
            targetPayload.sourceStoreWarehouseEnabled === false ? 0 : 1,
          source_location_name: targetPayload.sourceLocationName,
          source_location_type: targetPayload.sourceLocationType ?? "STORE",
          source_location_status: targetPayload.sourceLocationStatus ?? "ACTIVE",
          source_location_defaults: targetPayload.sourceLocationDefaults ?? "",
          source_warehouse_code: targetPayload.sourceWarehouseCode ?? null,
          source_warehouse_name: targetPayload.sourceWarehouseName ?? null,
          use_for_sales_default: targetPayload.useForSalesDefault ? 1 : 0,
          use_for_receiving_default: targetPayload.useForReceivingDefault ? 1 : 0,
          updated_at: appliedAt,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "inventorySerialSnapshot" &&
      event.eventType === "inventory.serial-snapshot.published"
    ) {
      const serialPayload =
        payload as Partial<EnterpriseInventorySerialSnapshotPublishedPayload>;

      if (
        typeof serialPayload.storeCode !== "string" ||
        serialPayload.storeCode !== storeCode ||
        typeof serialPayload.productCode !== "string" ||
        typeof serialPayload.productName !== "string" ||
        typeof serialPayload.availableQuantity !== "number" ||
        !Array.isArray(serialPayload.serialItems)
      ) {
        throw new Error(
          "Flash ERP received an invalid serial snapshot publication payload.",
        );
      }

      await this.query(
        "DELETE FROM [dbo].[serial_registry] WHERE [product_code] = @productCode",
        { productCode: serialPayload.productCode },
        runner,
      );

      for (const item of serialPayload.serialItems) {
        if (
          typeof item.serialNumber !== "string" ||
          typeof item.status !== "string" ||
          typeof item.updatedAt !== "string"
        ) {
          throw new Error(
            "Flash ERP received an invalid serial snapshot item payload.",
          );
        }

        await this.mergeRow(
          "serial_registry",
          ["product_code", "serial_number"],
          {
            id: randomUUID(),
            product_code: serialPayload.productCode,
            serial_number: item.serialNumber,
            inventory_location_code: item.locationCode ?? null,
            status: item.status,
            source_transaction_id: item.sourceReferenceId ?? null,
            source_transaction_no: item.sourceReferenceLabel ?? null,
            updated_at: item.updatedAt || appliedAt,
          },
          runner,
        );
      }

      await this.query(
        `UPDATE [dbo].[product_snapshot]
         SET [quantity_on_hand] = @availableQuantity,
             [updated_at] = @appliedAt
         WHERE [product_code] = @productCode`,
        {
          availableQuantity: serialPayload.availableQuantity,
          appliedAt,
          productCode: serialPayload.productCode,
        },
        runner,
      );

      return;
    }

    if (
      event.aggregateType === "purchaseOrder" &&
      event.eventType === "purchase-order.published"
    ) {
      const purchaseOrderPayload =
        payload as Partial<EnterprisePurchaseOrderPublishedPayload>;

      if (
        typeof purchaseOrderPayload.storeCode !== "string" ||
        purchaseOrderPayload.storeCode !== storeCode ||
        typeof purchaseOrderPayload.purchaseOrderId !== "string" ||
        typeof purchaseOrderPayload.purchaseOrderNo !== "string" ||
        typeof purchaseOrderPayload.locationCode !== "string" ||
        typeof purchaseOrderPayload.locationName !== "string" ||
        typeof purchaseOrderPayload.status !== "string" ||
        !Array.isArray(purchaseOrderPayload.lines)
      ) {
        throw new Error(
          "Flash ERP received an invalid purchase-order publication payload.",
        );
      }

      await this.mergeRow(
        "purchase_order_snapshot",
        ["id"],
        {
          id: purchaseOrderPayload.purchaseOrderId,
          purchase_order_no: purchaseOrderPayload.purchaseOrderNo,
          status: purchaseOrderPayload.status,
          inventory_location_code: purchaseOrderPayload.locationCode,
          inventory_location_name: purchaseOrderPayload.locationName,
          supplier_no: purchaseOrderPayload.supplierNo ?? null,
          supplier_name: purchaseOrderPayload.supplierName ?? null,
          external_reference: purchaseOrderPayload.externalReference ?? null,
          note: purchaseOrderPayload.note ?? null,
          operator_name: purchaseOrderPayload.operatorName ?? null,
          ordered_quantity: purchaseOrderPayload.orderedQuantity ?? 0,
          received_quantity: purchaseOrderPayload.receivedQuantity ?? 0,
          exception_quantity: purchaseOrderPayload.exceptionQuantity ?? 0,
          outstanding_quantity: purchaseOrderPayload.outstandingQuantity ?? 0,
          committed_at: purchaseOrderPayload.committedAt ?? null,
          closed_at: purchaseOrderPayload.closedAt ?? null,
          closure_reason: purchaseOrderPayload.closureReason ?? null,
          closure_note: purchaseOrderPayload.closureNote ?? null,
          closure_operator_name:
            purchaseOrderPayload.closureOperatorName ?? null,
          updated_at: appliedAt,
        },
        runner,
      );
      await this.query(
        "DELETE FROM [dbo].[purchase_order_line_snapshot] WHERE [purchase_order_id] = @purchaseOrderId",
        { purchaseOrderId: purchaseOrderPayload.purchaseOrderId },
        runner,
      );

      for (const rawLine of purchaseOrderPayload.lines) {
        const line = rawLine as Record<string, unknown>;
        if (
          typeof line.purchaseOrderLineId !== "string" ||
          typeof line.lineNo !== "number" ||
          typeof line.productCode !== "string" ||
          typeof line.productName !== "string"
        ) {
          throw new Error(
            "Flash ERP received an invalid purchase-order line payload.",
          );
        }

        await this.mergeRow(
          "purchase_order_line_snapshot",
          ["id"],
          {
            id: line.purchaseOrderLineId,
            purchase_order_id: purchaseOrderPayload.purchaseOrderId,
            line_no: Math.trunc(line.lineNo),
            product_code: line.productCode,
            product_name: line.productName,
            department_code: optionalString(line.departmentCode),
            category_code: optionalString(line.categoryCode),
            subcategory: optionalString(line.subcategory),
            is_serialized: booleanFlag(line.isSerialized),
            ordered_quantity:
              typeof line.orderedQuantity === "number"
                ? line.orderedQuantity
                : 0,
            received_quantity:
              typeof line.receivedQuantity === "number"
                ? line.receivedQuantity
                : 0,
            exception_quantity:
              typeof line.exceptionQuantity === "number"
                ? line.exceptionQuantity
                : 0,
            outstanding_quantity:
              typeof line.outstandingQuantity === "number"
                ? line.outstandingQuantity
                : 0,
            unit_cost: typeof line.unitCost === "number" ? line.unitCost : null,
            updated_at: appliedAt,
          },
          runner,
        );
      }

      return;
    }

    throw new Error(
      `SQL Server store server cannot apply downstream event ${event.aggregateType}:${event.eventType} yet.`,
    );
  }

  private parsePayloadJson(payloadJson: string) {
    try {
      return JSON.parse(payloadJson) as unknown;
    } catch {
      return payloadJson;
    }
  }

  private parsePayloadRecord(payload: unknown): Record<string, unknown> {
    if (typeof payload === "string") {
      const parsed = this.parsePayloadJson(payload);
      return parsed === payload ? {} : this.parsePayloadRecord(parsed);
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload)
    ) {
      return payload as Record<string, unknown>;
    }

    return {};
  }

  private async getCheckpointCursor(remoteNodeCode: string) {
    const result = await this.query<{ last_received_cursor: string | null }>(
      `SELECT TOP (1) [last_received_cursor]
       FROM [dbo].[sync_checkpoint]
       WHERE [remote_node_code] = @remoteNodeCode`,
      { remoteNodeCode },
    );

    return result.recordset[0]?.last_received_cursor ?? null;
  }

  private async currentCheckpointAppliedAt(remoteNodeCode: string) {
    const result = await this.query<{ last_applied_at: string | null }>(
      `SELECT TOP (1) [last_applied_at]
       FROM [dbo].[sync_checkpoint]
       WHERE [remote_node_code] = @remoteNodeCode`,
      { remoteNodeCode },
    );

    return result.recordset[0]?.last_applied_at ?? null;
  }

  private async upsertCheckpoint(
    remoteNodeCode: string,
    lastEventId: string | null,
    lastReceivedCursor: string | null,
    lastReceivedAt: string | null,
    lastAppliedAt: string | null,
    runner: MssqlRunner = this.pool,
  ) {
    await this.query(
      `MERGE [dbo].[sync_checkpoint] AS target
       USING (
         SELECT @remoteNodeCode AS [remote_node_code],
           @lastEventId AS [last_event_id],
           @lastReceivedCursor AS [last_received_cursor],
           @lastReceivedAt AS [last_received_at],
           @lastAppliedAt AS [last_applied_at]
       ) AS source
       ON target.[remote_node_code] = source.[remote_node_code]
       WHEN MATCHED THEN UPDATE SET
         [last_event_id] = source.[last_event_id],
         [last_received_cursor] = source.[last_received_cursor],
         [last_received_at] = source.[last_received_at],
         [last_applied_at] = source.[last_applied_at]
       WHEN NOT MATCHED THEN INSERT (
         [remote_node_code], [last_event_id], [last_received_cursor],
         [last_received_at], [last_applied_at]
       ) VALUES (
         source.[remote_node_code], source.[last_event_id],
         source.[last_received_cursor], source.[last_received_at],
         source.[last_applied_at]
       );`,
      {
        remoteNodeCode,
        lastEventId,
        lastReceivedCursor,
        lastReceivedAt,
        lastAppliedAt,
      },
      runner,
    );
  }

  async requeueDeadLetters(): Promise<StoreSyncActionResult> {
    if (this.isStandaloneDeployment()) {
      await this.requireActiveOperatorSession({
        purpose: "reviewing standalone recovery queues",
      });
    } else {
      await this.requireActiveOperatorSession({
        permissionCodes: ["sync.store.operate"],
      });
    }

    const startedAt = isoNow();
    const finishedAt = isoNow();
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    await this.repairLegacyPosTransactionConflicts(finishedAt);
    const [upstreamResult, downstreamResult] = await Promise.all([
      this.query<{ affected_count: number }>(
        `UPDATE [dbo].[sync_outbox]
         SET [status] = N'PENDING',
             [attempt_count] = 0,
             [updated_at] = @finishedAt,
             [last_attempt_at] = NULL,
             [next_retry_at] = NULL,
             [failure_kind] = NULL,
             [last_http_status] = NULL,
             [sync_run_id] = NULL,
             [error_message] = NULL
         OUTPUT 1 AS [affected_count]
         WHERE [status] IN (N'FAILED', N'DEAD_LETTER')`,
        { finishedAt },
      ),
      this.query<{ affected_count: number }>(
        `UPDATE [dbo].[sync_inbox]
         SET [status] = N'RECEIVED',
             [error_message] = NULL
         OUTPUT 1 AS [affected_count]
         WHERE [status] IN (N'FAILED', N'DEAD_LETTER')`,
      ),
    ]);
    const upstreamRequeued = upstreamResult.recordset.length;
    const downstreamRequeued = downstreamResult.recordset.length;

    await this.insertRunLog({
      runKind: "REQUEUE",
      result: "SUCCESS",
      summary:
        upstreamRequeued > 0 || downstreamRequeued > 0
          ? shouldQueueEnterprise
            ? `Requeued ${upstreamRequeued + downstreamRequeued} SQL Server dead-letter item(s) for another enterprise pass.`
            : `Requeued ${upstreamRequeued + downstreamRequeued} SQL Server standalone recovery item(s) for local review.`
          : "No SQL Server dead-letter items were waiting for requeue.",
      upstreamProcessed: 0,
      downstreamApplied: 0,
      startedAt,
      finishedAt,
    });

    return {
      message:
        upstreamRequeued > 0 || downstreamRequeued > 0
          ? shouldQueueEnterprise
            ? "Failed items were moved back into active SQL Server queues."
            : "Standalone recovery items were moved back into SQL Server local review queues."
          : "There were no dead-letter items to requeue.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async repairLegacyPosTransactionConflicts(repairedAt: string) {
    await this.withTransaction(async (transaction) => {
      const result = await this.query<{
        id: string;
        aggregate_id: string;
        idempotency_key: string;
        payload_json: string;
      }>(
        `SELECT [id], [aggregate_id], [idempotency_key], [payload_json]
         FROM [dbo].[sync_outbox] WITH (UPDLOCK, HOLDLOCK)
         WHERE [aggregate_type] = N'posTransaction'
           AND [event_type] = N'pos.transaction.completed'
           AND [status] IN (N'FAILED', N'DEAD_LETTER')
           AND [failure_kind] = N'STALE_VERSION'
           AND [error_message] LIKE N'%from another store event%'`,
        {},
        transaction,
      );

      for (const row of result.recordset) {
        let payload: StorePosTransactionCompletedPayload;

        try {
          payload = JSON.parse(
            row.payload_json,
          ) as StorePosTransactionCompletedPayload;
        } catch {
          continue;
        }

        if (!isLegacyPosTransactionNumber(payload.transactionNo)) {
          continue;
        }

        const oldTransactionNo = payload.transactionNo;
        const newTransactionNo =
          await this.allocatePosTransactionNumber(transaction);
        const transactionUpdate = await this.query(
          `UPDATE [dbo].[pos_transaction]
           SET [transaction_no] = @newTransactionNo, [updated_at] = @repairedAt
           WHERE [id] = @transactionId AND [transaction_no] = @oldTransactionNo`,
          {
            newTransactionNo,
            repairedAt,
            transactionId: row.aggregate_id,
            oldTransactionNo,
          },
          transaction,
        );

        if ((transactionUpdate.rowsAffected[0] ?? 0) !== 1) {
          continue;
        }

        payload.transactionNo = newTransactionNo;
        const referenceParams = {
          newTransactionNo,
          repairedAt,
          transactionId: row.aggregate_id,
          oldTransactionNo,
        };
        await this.query(
          `UPDATE [dbo].[pos_transaction]
           SET [source_transaction_no] = @newTransactionNo, [updated_at] = @repairedAt
           WHERE [source_transaction_id] = @transactionId
             AND [source_transaction_no] = @oldTransactionNo`,
          referenceParams,
          transaction,
        );
        await this.query(
          `UPDATE [dbo].[serial_registry]
           SET [source_transaction_no] = @newTransactionNo, [updated_at] = @repairedAt
           WHERE [source_transaction_id] = @transactionId
             AND [source_transaction_no] = @oldTransactionNo`,
          referenceParams,
          transaction,
        );
        await this.query(
          `UPDATE [dbo].[sales_order]
           SET [fulfilled_transaction_no] = @newTransactionNo, [updated_at] = @repairedAt
           WHERE [fulfilled_transaction_id] = @transactionId
             AND [fulfilled_transaction_no] = @oldTransactionNo`,
          referenceParams,
          transaction,
        );
        await this.query(
          `UPDATE [dbo].[sync_outbox]
           SET [id] = @newEventId,
               [idempotency_key] = @idempotencyKey,
               [payload_json] = @payloadJson,
               [updated_at] = @repairedAt
           WHERE [id] = @eventId`,
          {
            newEventId: randomUUID(),
            idempotencyKey: row.idempotency_key.replace(
              oldTransactionNo,
              newTransactionNo,
            ),
            payloadJson: JSON.stringify(payload),
            repairedAt,
            eventId: row.id,
          },
          transaction,
        );
      }
    });
  }

  private async insertRunLog(input: {
    runKind: string;
    result: string;
    summary: string;
    upstreamProcessed: number;
    downstreamApplied: number;
    startedAt: string;
    finishedAt: string | null;
  }, runner: MssqlRunner = this.pool) {
    await this.query(
      `INSERT INTO [dbo].[sync_run_log] (
         [id], [run_kind], [result], [summary], [upstream_processed],
         [downstream_applied], [started_at], [finished_at]
       ) VALUES (
         @id, @runKind, @result, @summary, @upstreamProcessed,
         @downstreamApplied, @startedAt, @finishedAt
       )`,
      {
        id: randomUUID(),
        runKind: input.runKind,
        result: input.result,
        summary: input.summary,
        upstreamProcessed: input.upstreamProcessed,
        downstreamApplied: input.downstreamApplied,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
      runner,
    );
  }

  private async persistRemoteSyncPolicy(
    policy: StoreNodePushResponse["syncPolicy"] | StoreNodePullResponse["syncPolicy"],
  ) {
    for (const [key, value] of storeSyncPolicyToMetadataEntries(policy)) {
      if (value) {
        await this.setMetadata(key, value);
      } else {
        await this.deleteMetadata(key);
      }
    }
  }
}
