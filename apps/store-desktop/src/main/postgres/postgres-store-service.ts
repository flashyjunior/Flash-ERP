import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  allocateInventoryBatchesFefo,
  assertLayawayFulfilmentEligible,
  calculateLayawayAvailableBaseQuantity,
  calculateLayawayCancellationAmounts,
  calculatePosBaseQuantity,
  deriveInventoryBatchStatus,
  deriveRetailUserCapabilities,
  evaluateLayawayOpening,
  normalizeLayawaySettings,
  normalizePosSellingUnits,
  reconcileSalesOrderCollections,
  resolvePosSellingUom,
  validateInventoryBatchReceipt,
} from "@flash-erp/domain";
import {
  calculateLoyaltyRedemption,
  getRetryDelayMs,
  MAX_SYNC_RETRY_ATTEMPTS,
  shouldMoveToDeadLetter,
} from "@flash-erp/sync-core";
import pg from "pg";

import {
  computeNextStoreSyncAt,
  readStoreEcommerceFulfillmentEligibility,
  readStoreSyncPolicyFromMetadata,
  resolveInventoryTransferUom,
  storeSyncPolicyToMetadataEntries,
} from "../../shared/desktop-runtime.js";
import {
  postSyncJsonRaw,
  SyncHttpClientError,
} from "../sync-http-client.js";
import {
  createPosReceiptSeriesToken,
  formatPosTransactionNumber,
  isEcommercePosTransactionNumber,
  isLegacyPosTransactionNumber,
  isPosReceiptSeriesToken,
  POS_RECEIPT_MAX_SEQUENCE,
  POS_RECEIPT_SEQUENCE_METADATA_KEY,
  POS_RECEIPT_SERIES_TOKEN_METADATA_KEY,
} from "../pos-transaction-number.js";
import type {
  EnterpriseBankAccountPublishedPayload,
  EnterpriseBarcodePublishedPayload,
  EnterpriseCatalogProductPublishedPayload,
  EnterpriseCustomerPublishedPayload,
  EnterpriseSupplierPublishedPayload,
  EnterpriseEcommerceSalesOrderPublishedPayload,
  EnterpriseInventoryLocationPublishedPayload,
  EnterpriseProductCategoryPublishedPayload,
  EnterpriseProductDepartmentPublishedPayload,
  EnterprisePurchaseOrderPublishedPayload,
  EnterpriseGiftCertificatePublishedPayload,
  EnterprisePermissionPublishedPayload,
  EnterprisePriceListPublishedPayload,
  EnterprisePromotionPublishedPayload,
  EnterpriseRetailUserPublishedPayload,
  EnterpriseRolePublishedPayload,
  EnterpriseStoreSettingsPublishedPayload,
  EnterpriseSyncTaskPayload,
  EnterpriseTaxProfilePublishedPayload,
  EnterpriseTenderMethodPublishedPayload,
  EnterpriseUnitOfMeasurePublishedPayload,
  StoreGoodsReceiptRecordedPayload,
  StoreInterStoreTransferIssuedPayload,
  StoreInterStoreTransferReceivedPayload,
  StoreInterStoreTransferRequestedPayload,
  StoreBankingDepositRecordedPayload,
  StoreCustomerAccountEntryRecordedPayload,
  StoreEodReconciliationRecordedPayload,
  StoreExpenseConfirmedPayload,
  StoreInventoryLedgerRecordedPayload,
  StoreInventoryTransferRecordedPayload,
  StoreNodePullResponse,
  StoreNodePushRequest,
  StoreNodePushResponse,
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
  SyncPromotionDiscountType,
  SyncPromotionTargetScope,
  SyncRejectedEnvelope,
} from "@flash-erp/sync-core";

import type {
  StoreBankingDepositSummary,
  StoreBankAccountSummary,
  StoreBasketCheckoutRequest,
  StoreBasketCustomerAttachmentInput,
  StoreBasketAppliedPromotionSummary,
  StoreBasketItemRequest,
  StoreBasketLoyaltyRedemptionInput,
  StoreBasketLineSummary,
  StoreBasketLineUpdateRequest,
  StoreBasketSummary,
  StoreCancelSalesOrderRequest,
  StoreCatalogBrowseItem,
  StoreCatalogBrowseRequest,
  StoreCatalogLookupResult,
  StoreCatalogMatrixVariant,
  StoreCreateSalesOrderRequest,
  StoreExpireLayawayRequest,
  StoreCustomerAccountEntrySummary,
  StoreCustomerAccountPaymentRequest,
  StoreCustomerSearchRequest,
  StoreCustomerSummary,
  StoreReceiveLayawayPaymentRequest,
  StoreReleaseLayawayReservationRequest,
  StoreTransactionReferenceSearchRequest,
  StoreTransactionReferenceSummary,
  StoreEodReconciliationSummary,
  StoreInventoryBrowseItem,
  StoreInventoryBrowseRequest,
  StoreInventoryBatchAllocation,
  StoreInventoryLocationSummary,
  StoreInterStoreTransferBrowseRequest,
  StoreInterStoreTransferIssueRequest,
  StoreInterStoreTransferReceiveRequest,
  StoreInterStoreTransferRequestDraftInput,
  StoreInterStoreTransferRequestDraftLine,
  StoreInterStoreTransferRequestDraftSummary,
  StoreInterStoreTransferSummary,
  StoreLoyaltySettingsSummary,
  StoreOptionSettingsSummary,
  StoreLocalGoodsReceiptSummary,
  StoreLocalSupplierReturnSummary,
  StoreLocalReceiptLogoInput,
  StoreOperationsMetrics,
  StoreOperatorCapabilities,
  StoreOperatorSessionSummary,
  StoreOperatorSignInInput,
  StorePrintableAccountPaymentReceiptDocument,
  StorePrintableReceiptDocument,
  StoreProductCategorySummary,
  StoreProductDepartmentSummary,
  StorePriceListEntrySummary,
  StorePromotionSummary,
  StorePurchaseOrderBrowseRequest,
  StorePurchaseOrderReceiptRequest,
  StorePurchaseOrderSummary,
  StoreQueueMetrics,
  StoreReportBrowseRequest,
  StoreReportResult,
  StoreSalesReportRow,
  StoreSerialBatchSalesReportRow,
  StoreRecoveryTaskSummary,
  StoreRemoteInterStoreStockRequestInput,
  StoreRemoteInventoryLookupInput,
  StoreRemoteInventoryLookupResult,
  StoreReceiptLineReturnRequest,
  StoreReceiptLookupLine,
  StoreReceiptLookupResult,
  StoreReceiptPrinterSettingsSummary,
  StoreReceiptPrinterSettingsInput,
  StoreReceiptSearchRequest,
  StoreReceiptSearchResult,
  StoreReceiptSettingsSummary,
  StoreSerialRegistryBrowseItem,
  StoreSerialRegistryBrowseRequest,
  StoreSerialRegistryStatus,
  StoreStockCountSessionDraftInput,
  StoreStockCountSessionSummary,
  StoreRecordBankingDepositRequest,
  StoreRecordEodReconciliationRequest,
  StoreStoreExpenseInput,
  StoreSalesOrderSummary,
  StoreSalesOrderCollectionReconciliationRow,
  StoreDeploymentMode,
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
  StoreStandaloneSettingsInput,
  StoreStandaloneSupplierInput,
  StoreStandaloneTaxProfileInput,
  StoreStandaloneTenderInput,
  StoreStandaloneUnitInput,
  StoreStandaloneUserInput,
  StoreAccountPaymentReportRow,
  StoreBankingReportRow,
  StoreCashDrawerKickRequest,
  StoreShiftCloseInput,
  StoreShiftOpenInput,
  StoreShiftReportRow,
  StoreShiftSummary,
  StoreShiftTenderSummary,
  StoreInventoryReportRow,
  StoreProductSalesReportRow,
  StoreSellCaptureRequest,
  StoreSupervisorOverrideInput,
  StoreSupplierReturnCancellationAcknowledgementRequest,
  StoreSupplierReturnRequest,
  StoreSyncActionResult,
  StoreSyncDeadLetterSummary,
  StoreSyncEventDetail,
  StoreSyncHealth,
  StoreSyncRunOptions,
  StoreSyncRun,
  StoreSyncSnapshot,
  StoreTenderReportRow,
  StoreTenderMethodSummary,
  StoreTerminalConnectionSummary,
  StoreTransferRequestTargetSummary,
  StoreTransactionSummary,
  StoreUserSummary,
  StoreSupplierSummary,
} from "../../shared/desktop-runtime.js";
import {
  readTransferRequestDraftLines,
  writeTransferRequestDraftLines,
} from "../transfer-request-draft.js";
import type { StoreTerminalContext } from "../offline/local-store-service.js";

const { Pool } = pg;

const defaultStoreConfig = {
  retailOrgName: "Flash Retail",
  storeCode: "accra-central",
  storeName: "Accra Central",
  terminalCode: "front-01",
  nodeCode: process.env.FLASH_ERP_STORE_NODE_CODE ?? "store-accra-central-01",
} as const;
const ENTERPRISE_NODE_CODE = "enterprise-primary";
const DEFAULT_SYNC_PULL_LIMIT = 5;
const MAX_SYNC_PULL_LIMIT = 10;
const MAX_SYNC_RESPONSE_BYTES = 8 * 1024 * 1024;
const syncPaymentMethods = new Set<SyncPaymentMethod>([
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "STORE_CREDIT",
  "GIFT_CARD",
  "OTHER",
]);

type PostgresStoreServiceOptions = {
  connectionString: string;
  deploymentMode?: StoreDeploymentMode | string | null;
  syncBaseUrl?: string | null;
  nodeCode?: string | null;
  terminalCode?: string | null;
  clientName?: string | null;
  connectionTimeoutMs?: number;
};

type DbRunner = pg.Pool | pg.PoolClient;

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
  base_unit_of_measure: string;
  uom_conversions_json: string;
  selling_units_json: string;
  taxable: string | number;
  tax_profile_code: string | null;
  tax_profile_name: string | null;
  tax_rate_percent: string | number | null;
  tax_inclusive: string | number;
  track_inventory: string | number;
  track_expiry: string | number;
  shelf_life_days: string | number | null;
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
  header_reference?: string | null;
  additional_details?: string | null;
  updated_at: string;
  completed_at: string | null;
  record_version: string | number;
};

type BasketLineRow = {
  id: string;
  pos_transaction_id: string;
  product_id: string;
  line_intent: SyncPosLineIntent;
  source_line_id: string | null;
  applied_promotion_code: string | null;
  applied_promotion_name: string | null;
  product_code_snapshot: string;
  product_variant_code_snapshot: string | null;
  product_name_snapshot: string;
  inventory_location_code: string | null;
  variant_size: string | null;
  variant_color: string | null;
  variant_attributes_snapshot: string | null;
  line_note: string | null;
  serial_numbers_json: string | null;
  batch_allocations_json: string | null;
  quantity: string | number;
  selling_unit_of_measure: string;
  base_unit_of_measure: string;
  uom_conversion_factor: string | number;
  base_quantity: string | number;
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
  payment_purpose: "TRANSACTION_SETTLEMENT" | "SALES_ORDER_DEPOSIT" | "SALES_ORDER_BALANCE";
  received_shift_id: string | null;
  received_shift_no: string | null;
  received_terminal_code: string | null;
  received_cashier_code: string | null;
  received_at: string;
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
  payment_id: string;
  transaction_no: string;
  transaction_type: SyncPosTransactionType;
  source_transaction_no: string | null;
  sales_order_no: string | null;
  occurred_at: string;
  cashier_code: string | null;
  terminal_code: string | null;
  shift_no: string | null;
  customer_no: string | null;
  customer_name: string | null;
  method: SyncPaymentMethod;
  tender_method_code: string | null;
  tender_method_name: string | null;
  payment_purpose: string;
  reference: string | null;
  amount: string | number;
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
  selling_unit_of_measure: string;
  base_quantity: string | number;
  base_unit_of_measure: string;
  uom_conversion_factor: string | number;
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

type ReportSerialBatchRow = {
  line_id: string;
  transaction_no: string;
  completed_at: string;
  cashier_code: string | null;
  product_code: string;
  product_name: string;
  inventory_location_code: string | null;
  serial_numbers_json: string | null;
  batch_allocations_json: string | null;
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

type SalesOrderRow = {
  id: string;
  order_no: string;
  source_transaction_id: string;
  source_transaction_no: string;
  customer_id: string | null;
  customer_no: string | null;
  customer_name: string | null;
  order_type: "SALES_ORDER" | "LAYAWAY";
  status: "OPEN" | "FULFILLED" | "CANCELLED" | "EXPIRED";
  total_amount: string | number;
  deposit_amount: string | number;
  paid_amount: string | number;
  balance_amount: string | number;
  deposit_tender_method_code: string | null;
  deposit_tender_method_name: string | null;
  deposit_payment_method: SyncPaymentMethod | null;
  deposit_reference: string | null;
  deposit_paid_at: string | null;
  layaway_policy_snapshot_json: string | null;
  minimum_deposit_amount: string | number;
  reservation_status: "NOT_APPLICABLE" | "ACTIVE" | "RELEASED" | "CONSUMED" | "EXPIRED";
  reservation_created_at: string | null;
  reservation_released_at: string | null;
  layaway_expires_at: string | null;
  expired_at: string | null;
  cancellation_fee_amount: string | number;
  refunded_amount: string | number;
  record_version: string | number;
  line_count: string | number;
  item_count: string | number;
  operator_name: string | null;
  deposit_collected_by: string | null;
  sale_completed_by: string | null;
  balance_collected_by: string | null;
  note: string | null;
  fulfilled_transaction_id: string | null;
  fulfilled_transaction_no: string | null;
  synced_at: string | null;
  created_at: string;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
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
  amount: string | number;
  bank_name: string | null;
  reference: string | null;
  operator_name: string | null;
  note: string | null;
  synced_at: string | null;
  deposited_at: string;
  updated_at: string;
};

type ReceiptHeaderRow = BasketHeaderRow & {
  shift_no: string | null;
  cashier_code: string | null;
  header_reference: string | null;
  additional_details: string | null;
};

type ReceiptSearchRow = ReceiptHeaderRow & {
  line_count: string | number;
  product_preview: string[] | null;
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
  active_reserved_quantity: string | number;
  min_stock_level: string | number | null;
  reorder_point: string | number | null;
  safety_stock_level: string | number | null;
  unit_price: string | number;
  is_serialized: string | number;
  track_expiry: string | number;
  earliest_expiry_date: string | null;
  expiring_quantity: string | number | null;
  batch_quantities_json: string | null;
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
  track_expiry: string | number;
  ordered_quantity: string | number;
  received_quantity: string | number;
  exception_quantity: string | number;
  outstanding_quantity: string | number;
  unit_cost: string | number | null;
  updated_at: string;
};

type LocalGoodsReceiptRow = {
  id: string;
  goods_receipt_no: string;
  purchase_order_id: string | null;
  purchase_order_no: string | null;
  inventory_location_code: string;
  inventory_location_name: string | null;
  supplier_no: string | null;
  supplier_name: string | null;
  external_reference: string | null;
  note: string | null;
  operator_name: string;
  total_quantity: string | number;
  line_count: string | number;
  exception_quantity: string | number;
  exception_count: string | number;
  synced_at: string | null;
  received_at: string;
  updated_at: string;
};

type LocalGoodsReceiptLineRow = {
  id: string;
  local_goods_receipt_id: string;
  purchase_order_line_id: string | null;
  line_no: string | number;
  product_code: string;
  product_name: string;
  ordered_quantity: string | number | null;
  quantity: string | number;
  unit_cost: string | number | null;
  serial_numbers_json: string | null;
  batch_no: string | null;
  manufactured_at: string | null;
  expiry_date: string | null;
};

type LocalGoodsReceiptExceptionRow = {
  id: string;
  local_goods_receipt_id: string;
  purchase_order_line_id: string | null;
  line_no: string | number;
  product_code: string;
  product_name: string;
  quantity: string | number;
  unit_cost: string | number | null;
  reason: StoreLocalGoodsReceiptSummary["exceptions"][number]["reason"];
  note: string | null;
};

type LocalSupplierReturnRow = {
  id: string;
  supplier_return_no: string;
  purchase_order_id: string | null;
  purchase_order_no: string | null;
  goods_receipt_id: string;
  goods_receipt_no: string;
  inventory_location_code: string;
  inventory_location_name: string | null;
  supplier_no: string;
  supplier_name: string;
  external_reference: string | null;
  reason: StoreLocalSupplierReturnSummary["reason"];
  status: StoreLocalSupplierReturnSummary["status"];
  note: string | null;
  operator_name: string;
  total_quantity: string | number;
  line_count: string | number;
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

type LocalSupplierReturnLineRow = {
  id: string;
  local_supplier_return_id: string;
  goods_receipt_line_id: string | null;
  purchase_order_line_id: string | null;
  line_no: string | number;
  product_code: string;
  product_name: string;
  quantity: string | number;
  unit_cost: string | number | null;
  serial_numbers_json: string | null;
  batch_allocations_json: string | null;
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
  track_expiry: string | number;
  requested_quantity: string | number;
  requested_unit_of_measure: string;
  requested_unit_quantity: string | number;
  uom_conversion_factor: string | number;
  base_unit_of_measure: string;
  issued_quantity: string | number;
  received_quantity: string | number;
  outstanding_issue_quantity: string | number;
  outstanding_receipt_quantity: string | number;
  unit_cost: string | number | null;
  issued_serial_numbers_json: string | null;
  received_serial_numbers_json: string | null;
  issued_batch_allocations_json: string | null;
  received_batch_allocations_json: string | null;
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
  requested_unit_of_measure: string;
  requested_unit_quantity: string | number;
  uom_conversion_factor: string | number;
  base_unit_of_measure: string;
  external_reference: string | null;
  note: string | null;
  operator_name: string;
  lines_json: string;
  submitted_at: string | null;
  updated_at: string;
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
  previous_batch_quantities_json: string | null;
  counted_batch_quantities_json: string | null;
  note: string | null;
  operator_name: string;
  submitted_at: string | null;
  committed_at: string | null;
  updated_at: string;
};

type RecoveryTaskRow = {
  id: string;
  task_type: string;
  status: string;
  title: string;
  instructions: string;
  source_inbound_event_id: string;
  source_event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  transaction_no: string | null;
  product_code: string | null;
  replacement_aggregate_type: string;
  replacement_aggregate_id: string;
  replacement_event_type: string;
  replacement_record_version: string | number;
  replacement_payload_json: string;
  operator_name: string;
  operator_note: string;
  store_note: string | null;
  requested_at: string;
  completed_at: string | null;
};

type RecoveryTaskSnapshotRow = RecoveryTaskRow & {
  product_name: string | null;
  department_code: string | null;
  department_name: string | null;
  category_code: string | null;
  category_name: string | null;
  subcategory: string | null;
  is_serialized: string | number | null;
};

type OutboxEnvelopeRow = {
  id: string;
  target_node_code: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  idempotency_key: string;
  payload_json: string;
  attempt_count: string | number;
  record_version: string | number;
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

type SyncDeadLetterRow = {
  id: string;
  direction: "UPSTREAM" | "DOWNSTREAM";
  status: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  node_code: string | null;
  attempt_count: string | number;
  failure_kind: string | null;
  last_http_status: string | number | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  sync_run_id: string | null;
  payload_json: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type SyncEventDetailRow = SyncDeadLetterRow & {
  applied_at: string | null;
  acknowledged_at: string | null;
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

const ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE =
  "ENTERPRISE_DATABASE_SCHEMA_NOT_READY";
const enterpriseDatabaseSchemaNotReadyMessage =
  "Enterprise database schema is not ready for this Flash ERP build. Apply the pending Prisma migrations on HQ and restart the enterprise server before retrying sync.";

type StoreSyncFailureKind =
  | "HTTP"
  | "SERVER"
  | "TIMEOUT"
  | "NETWORK"
  | "SCHEMA"
  | "UNKNOWN";

type RemoteLicenseFailure = {
  scope: "store" | "terminal";
  status: string | null;
  licensedUntil: string | null;
};

class StoreSyncTransportError extends Error {
  constructor(
    message: string,
    readonly failureKind: StoreSyncFailureKind,
    readonly httpStatus: number | null = null,
    readonly remoteLicenseFailure: RemoteLicenseFailure | null = null,
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

function addMillisecondsIso(value: string, milliseconds: number) {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
}

function nextSyncRetryAt(baseAt: string, attemptCount: number) {
  return addMillisecondsIso(baseAt, getRetryDelayMs(Math.max(0, attemptCount)));
}

function classifySyncFailure(error: unknown): {
  message: string;
  failureKind: StoreSyncFailureKind;
  httpStatus: number | null;
} {
  if (error instanceof StoreSyncTransportError) {
    return {
      message: error.message,
      failureKind: error.failureKind,
      httpStatus: error.httpStatus,
    };
  }

  return {
    message:
      error instanceof Error
        ? error.message
        : "The enterprise sync request failed.",
    failureKind: "UNKNOWN",
    httpStatus: null,
  };
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

function readRemoteLicenseFailure(payload: {
  code?: string;
  licenseScope?: unknown;
  licenseStatus?: unknown;
  licensedUntil?: unknown;
}): RemoteLicenseFailure | null {
  if (
    payload.code !== "STORE_NODE_LICENSE_REQUIRED" ||
    (payload.licenseScope !== "store" && payload.licenseScope !== "terminal")
  ) {
    return null;
  }

  return {
    scope: payload.licenseScope,
    status:
      typeof payload.licenseStatus === "string" && payload.licenseStatus.trim()
        ? payload.licenseStatus.trim().toUpperCase()
        : "UNLICENSED",
    licensedUntil:
      typeof payload.licensedUntil === "string" && payload.licensedUntil.trim()
        ? payload.licensedUntil.trim()
        : null,
  };
}

function minutesAgo(value: number) {
  return new Date(Date.now() - value * 60_000).toISOString();
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

function signedInventoryQuantity(
  movementType: StoreInventoryLedgerRecordedPayload["movementType"],
  quantity: number,
) {
  const normalizedQuantity = Number(Number(quantity).toFixed(3));

  if (
    movementType === "SALE" ||
    movementType === "RETURN_TO_VENDOR" ||
    movementType === "STOCK_TRANSFER_OUT" ||
    movementType === "ADJUSTMENT_NEGATIVE"
  ) {
    return normalizedQuantity * -1;
  }

  return normalizedQuantity;
}

function parsePayloadJson(payloadJson: string) {
  try {
    return JSON.parse(payloadJson) as unknown;
  } catch {
    return payloadJson;
  }
}

function parsePayloadRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    const parsed = parsePayloadJson(payload);
    return parsed === payload ? {} : parsePayloadRecord(parsed);
  }

  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}

function formatPayloadPreview(payloadJson: string) {
  const payload = parsePayloadJson(payloadJson);
  const formatted = JSON.stringify(payload, null, 2);

  return formatted.length > 1400 ? `${formatted.slice(0, 1400)}...` : formatted;
}

function describeSyncEventPayload(
  aggregateType: string,
  eventType: string,
  payloadJson: string,
) {
  const payload = parsePayloadRecord(parsePayloadJson(payloadJson));
  const readText = (...keys: string[]) => {
    for (const key of keys) {
      const value = payload[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return null;
  };
  const code = readText(
    "code",
    "customerNo",
    "productCode",
    "promotionCode",
    "transactionNo",
  );
  const name = readText(
    "name",
    "displayName",
    "fullName",
    "productName",
    "promotionName",
  );

  if (name && code) {
    return `${name} (${code})`;
  }

  return name ?? code ?? `${aggregateType} · ${eventType}`;
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

function minutesSince(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60_000),
  );
}

function asNumber(value: string | number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
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

function tracksInventoryForSale(row: {
  product_type?: string | null;
  track_inventory?: string | number | null;
}) {
  return (
    asBooleanFlag(row.track_inventory) &&
    row.product_type?.trim().toUpperCase() !== "SERVICE"
  );
}

function pushPgParam(params: unknown[], value: unknown) {
  params.push(value);
  return `$${params.length}`;
}

function normalizeCatalogCode(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.toUpperCase() : null;
}

function isServiceProductType(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase() === "SERVICE";
}

function normalizePromotionCode(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.toUpperCase() : "";
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

function normalizeTerminalCode(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "-") ?? "";
}

function normalizeDeploymentMode(
  value: StoreDeploymentMode | string | null | undefined,
): StoreDeploymentMode {
  const normalized = value?.trim().toUpperCase().replace(/[-\s]+/g, "_") ?? "";
  return normalized === "STANDALONE" ? "STANDALONE" : "ENTERPRISE_MANAGED";
}

function normalizeSetupCode(value: string | null | undefined, label: string) {
  const normalized = value?.trim().toUpperCase() ?? "";

  if (!normalized) {
    throw new Error(`${label} is required for standalone setup.`);
  }

  return normalized;
}

function normalizeSetupName(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`${label} is required for standalone setup.`);
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
  value: number | string | null | undefined,
  fallback: number,
  decimals = 2,
) {
  const parsed = Number(value ?? fallback);
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Number(normalized.toFixed(decimals));
}

function normalizePolicyInteger(
  value: number | string | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Math.trunc(Number(value ?? fallback));
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(minimum, normalized));
}

function readDownstreamPageLimit() {
  const configured = Number(process.env.FLASH_ERP_STORE_SYNC_PULL_LIMIT);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(Math.trunc(configured), MAX_SYNC_PULL_LIMIT));
  }

  return DEFAULT_SYNC_PULL_LIMIT;
}

function readDownstreamPullPassLimit(
  trigger: StoreSyncRunOptions["trigger"] | null | undefined,
  drainDownstream = false,
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

function validateStandalonePasswordPolicy(
  password: string,
  policy: {
    minimumLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
  },
) {
  const failures: string[] = [];

  if (password.length < policy.minimumLength) {
    failures.push(`at least ${policy.minimumLength} characters`);
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    failures.push("an uppercase letter");
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    failures.push("a lowercase letter");
  }

  if (policy.requireNumber && !/[0-9]/.test(password)) {
    failures.push("a number");
  }

  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    failures.push("a symbol");
  }

  if (failures.length > 0) {
    throw new Error(
      `Password policy requires ${failures.join(", ")}.`,
    );
  }
}

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
  "pos.layaway.create",
  "pos.layaway.payment.receive",
  "pos.layaway.cancel-refund",
  "pos.layaway.reservation.release",
  "pos.layaway.policy.override",
  "pos.layaway.fulfil",
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

function standalonePermissionCodes(input: {
  cashierEligible?: boolean | null;
  supervisorEligible?: boolean | null;
}) {
  const source =
    input.supervisorEligible === true
      ? standaloneSupervisorPermissionCodes
      : input.cashierEligible === false
        ? []
        : standaloneCashierPermissionCodes;

  return [...source];
}

function normalizeStandalonePaymentMethod(
  value: string | null | undefined,
): SyncPaymentMethod {
  const normalized = normalizeSetupCode(
    value ?? "CASH",
    "Tender payment method",
  ) as SyncPaymentMethod;

  return syncPaymentMethods.has(normalized) ? normalized : "OTHER";
}

const standalonePromotionDiscountTypes = new Set<SyncPromotionDiscountType>([
  "PERCENT",
  "AMOUNT",
  "FIXED_PRICE",
]);
const standalonePromotionTargetScopes = new Set<SyncPromotionTargetScope>([
  "ALL_ITEMS",
  "DEPARTMENT",
  "CATEGORY",
  "PRODUCT",
]);

function normalizeStandalonePromotionDiscountType(
  value: string | null | undefined,
): SyncPromotionDiscountType {
  const normalized = normalizeSetupCode(
    value ?? "PERCENT",
    "Promotion discount type",
  ) as SyncPromotionDiscountType;

  return standalonePromotionDiscountTypes.has(normalized)
    ? normalized
    : "PERCENT";
}

function normalizeStandalonePromotionTargetScope(
  value: string | null | undefined,
): SyncPromotionTargetScope {
  const normalized = normalizeSetupCode(
    value ?? "ALL_ITEMS",
    "Promotion target scope",
  ) as SyncPromotionTargetScope;

  return standalonePromotionTargetScopes.has(normalized)
    ? normalized
    : "ALL_ITEMS";
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

function parseProductUomConversions(
  value: string | null | undefined,
  baseUnitOfMeasure: string,
): NonNullable<StoreCatalogBrowseItem["uomConversions"]> {
  try {
    const parsed = JSON.parse(value || "[]") as unknown;
    if (Array.isArray(parsed)) {
      const rows = parsed.filter(
        (item): item is NonNullable<StoreCatalogBrowseItem["uomConversions"]>[number] =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { uomCode?: unknown }).uomCode === "string" &&
          Number.isFinite(Number((item as { conversionFactor?: unknown }).conversionFactor)),
      );
      if (rows.length) return rows;
    }
  } catch {}

  return [{
    uomCode: baseUnitOfMeasure,
    uomName: baseUnitOfMeasure,
    conversionFactor: 1,
    isBaseUnit: true,
    allowSale: true,
    allowPurchase: true,
  }];
}

function parseProductSellingUnits(
  value: string | null | undefined,
): NonNullable<StoreCatalogBrowseItem["sellingUnits"]> {
  try {
    const parsed = JSON.parse(value || "[]") as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is NonNullable<StoreCatalogBrowseItem["sellingUnits"]>[number] =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { unitOfMeasureCode?: unknown }).unitOfMeasureCode ===
          "string" &&
        Number.isFinite(
          Number((item as { conversionFactor?: unknown }).conversionFactor),
        ) &&
        Number.isFinite(Number((item as { unitPrice?: unknown }).unitPrice)),
    );
  } catch {
    return [];
  }
}

function normalizePublishedSellingUnits(
  value: unknown,
): NonNullable<StoreCatalogBrowseItem["sellingUnits"]> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const unitOfMeasureCode = String(candidate.uomCode ?? "")
      .trim()
      .toUpperCase();
    const conversionFactor = Number(candidate.conversionFactor);
    const unitPrice = Number(candidate.unitPrice);

    if (
      !unitOfMeasureCode ||
      !Number.isFinite(conversionFactor) ||
      conversionFactor <= 0 ||
      !Number.isFinite(unitPrice)
    ) {
      return [];
    }

    return [{
      productVariantCode:
        typeof candidate.productVariantCode === "string"
          ? candidate.productVariantCode
          : null,
      unitOfMeasureCode,
      unitOfMeasureName:
        typeof candidate.uomName === "string" && candidate.uomName.trim()
          ? candidate.uomName.trim()
          : unitOfMeasureCode,
      conversionFactor,
      unitPrice,
      barcode:
        typeof candidate.barcode === "string" && candidate.barcode.trim()
          ? candidate.barcode.trim()
          : null,
      isDefault: candidate.isDefault === true,
      allowFractionalSale: candidate.allowFractionalSale === true,
      decimalPrecision: Math.max(0, Math.trunc(Number(candidate.decimalPrecision) || 0)),
    }];
  });
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

function readCatalogPolicy(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const readCodes = (key: string) => {
      const codes = Array.isArray(parsed[key])
        ? parsed[key]
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(
              (entry, index, items) =>
                entry.length > 0 && items.indexOf(entry) === index,
            )
        : [];

      return codes.length > 0 ? codes : null;
    };
    const readProductSortOrders = () => {
      const rawSortOrders = parsed.productSortOrders;

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
            Number.isFinite(entry.sortOrder),
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
  } catch {
    return null;
  }
}

function readCatalogProductPolicy(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const productCodes = Array.isArray(record.productCodes)
    ? record.productCodes
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toUpperCase())
        .filter(
          (entry, index, items) =>
            entry.length > 0 && items.indexOf(entry) === index,
        )
    : null;
  const productSortOrders = new Map<string, number>();

  if (
    record.productSortOrders &&
    typeof record.productSortOrders === "object" &&
    !Array.isArray(record.productSortOrders)
  ) {
    for (const [rawProductCode, rawSortOrder] of Object.entries(
      record.productSortOrders as Record<string, unknown>,
    )) {
      const productCode = rawProductCode.trim().toUpperCase();
      const sortOrder =
        typeof rawSortOrder === "number"
          ? rawSortOrder
          : typeof rawSortOrder === "string"
            ? Number(rawSortOrder)
            : Number.NaN;

      if (productCode && Number.isFinite(sortOrder)) {
        productSortOrders.set(productCode, Math.trunc(sortOrder));
      }
    }
  }

  productCodes?.forEach((productCode, index) => {
    if (!productSortOrders.has(productCode)) {
      productSortOrders.set(productCode, index + 1);
    }
  });

  return {
    productCodes,
    productSortOrders,
  };
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

function readInventoryBatchAllocations(
  value: string | null | undefined,
): StoreInventoryBatchAllocation[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            return [];
          }

          const candidate = entry as Record<string, unknown>;
          const batchNo = typeof candidate.batchNo === "string" ? candidate.batchNo : "";
          const expiryDate = typeof candidate.expiryDate === "string" ? candidate.expiryDate : "";
          const quantity = Number(candidate.quantity);
          return batchNo && expiryDate && Number.isFinite(quantity) && quantity >= 0
            ? [{
                batchId: typeof candidate.batchId === "string" ? candidate.batchId : null,
                batchNo,
                manufacturedAt:
                  typeof candidate.manufacturedAt === "string"
                    ? candidate.manufacturedAt
                    : null,
                expiryDate,
                quantity: Number(quantity.toFixed(3)),
              }]
            : [];
        })
      : [];
  } catch {
    return [];
  }
}

function writeInventoryBatchAllocations(
  allocations: StoreInventoryBatchAllocation[] | null | undefined,
) {
  return allocations?.length ? JSON.stringify(allocations) : null;
}

function takeOutstandingInventoryBatchAllocations(input: {
  productName: string;
  quantity: number;
  issued: StoreInventoryBatchAllocation[];
  received: StoreInventoryBatchAllocation[];
}) {
  const receivedByBatch = new Map<string, number>();

  for (const allocation of input.received) {
    const key = `${allocation.batchNo.toUpperCase()}\u0000${allocation.expiryDate.slice(0, 10)}`;
    receivedByBatch.set(
      key,
      Number(
        ((receivedByBatch.get(key) ?? 0) + allocation.quantity).toFixed(3),
      ),
    );
  }

  let remainingQuantity = Number(input.quantity.toFixed(3));
  const allocations: StoreInventoryBatchAllocation[] = [];

  for (const issuedAllocation of input.issued) {
    if (remainingQuantity <= 0.0001) {
      break;
    }

    const key = `${issuedAllocation.batchNo.toUpperCase()}\u0000${issuedAllocation.expiryDate.slice(0, 10)}`;
    const availableQuantity = Number(
      Math.max(
        0,
        issuedAllocation.quantity - (receivedByBatch.get(key) ?? 0),
      ).toFixed(3),
    );
    const allocatedQuantity = Number(
      Math.min(availableQuantity, remainingQuantity).toFixed(3),
    );

    if (allocatedQuantity > 0) {
      allocations.push({
        ...issuedAllocation,
        quantity: allocatedQuantity,
      });
      remainingQuantity = Number(
        (remainingQuantity - allocatedQuantity).toFixed(3),
      );
    }
  }

  if (remainingQuantity > 0.0001) {
    throw new Error(
      `The source issue does not contain enough outstanding batch quantity for ${input.productName}. Sync the source issue before receiving.`,
    );
  }

  return allocations;
}

function writeSerializedLineNumbers(serialNumbers: string[]) {
  return serialNumbers.length > 0 ? JSON.stringify(serialNumbers) : null;
}

function hasLocalLoyaltyAccount(input: {
  loyalty_enrolled: string | number | null | undefined;
  loyalty_tier?: string | null;
  loyalty_points_balance: string | number | null | undefined;
}) {
  return (
    asBooleanFlag(input.loyalty_enrolled) ||
    Math.trunc(asNumber(input.loyalty_points_balance)) > 0 ||
    Boolean(input.loyalty_tier?.trim())
  );
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

function redactConnectionString(value: string) {
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

function emptyReceiptSettings(): StoreReceiptSettingsSummary {
  return {
    currencyCode: "GHS",
    timezone: "Africa/Accra",
    receiptHeader: null,
    receiptFooter: null,
    salesReceiptTemplateCode: null,
    salesReceiptTemplateName: null,
    salesReceiptTemplateHtml: null,
    goodsReceiptTemplateCode: null,
    goodsReceiptTemplateName: null,
    goodsReceiptTemplateHtml: null,
    templateMode: "default",
  };
}

function emptyLoyaltySettings(): StoreLoyaltySettingsSummary {
  return {
    loyaltyProgramEnabled: false,
    loyaltyPointsPerCurrencyUnit: 0,
    loyaltyRedemptionEnabled: false,
    loyaltyRedemptionPointsStep: 1,
    loyaltyRedemptionValueAmount: 0,
    loyaltyMinimumRedeemPoints: 0,
    loyaltyMaximumRedeemPercentOfSale: 0,
  };
}

function emptyPrinterSettings(): StoreReceiptPrinterSettingsSummary {
  return {
    selectedPrinterName: null,
    silentPrintEnabled: false,
    autoPrintOnComplete: false,
  };
}

export class PostgresStoreService {
  private readonly pool: pg.Pool;
  private readonly syncBaseUrl: string | null;
  private readonly deploymentMode: StoreDeploymentMode;
  private readonly fallbackNodeCode: string;
  private readonly fallbackTerminalCode: string;
  private syncCycleInFlight: Promise<StoreSyncActionResult> | null = null;
  private readonly terminalContextStorage =
    new AsyncLocalStorage<StoreTerminalContext | null>();

  readonly databasePath: string;

  private constructor(private readonly options: PostgresStoreServiceOptions) {
    this.databasePath = redactConnectionString(options.connectionString);
    this.deploymentMode = normalizeDeploymentMode(options.deploymentMode);
    this.syncBaseUrl = options.syncBaseUrl?.replace(/\/+$/, "") ?? null;
    this.fallbackNodeCode = options.nodeCode?.trim() || defaultStoreConfig.nodeCode;
    this.fallbackTerminalCode =
      normalizeTerminalCode(options.terminalCode) ||
      defaultStoreConfig.terminalCode;
    this.pool = new Pool({
      connectionString: options.connectionString,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 8000,
      idleTimeoutMillis: 1000,
      max: 8,
    });
  }

  static async create(options: PostgresStoreServiceOptions) {
    const service = new PostgresStoreService(options);
    await service.ensureDefaults();
    return service;
  }

  async close() {
    await this.pool.end();
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

  private async ensureDefaults() {
    const timestamp = isoNow();
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS unit_of_measure_snapshot (
        id TEXT PRIMARY KEY,
        uom_code TEXT NOT NULL UNIQUE,
        uom_name TEXT NOT NULL,
        description TEXT,
        decimal_precision INTEGER NOT NULL DEFAULT 0,
        allow_fractional_sale INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        updated_at TEXT NOT NULL
      )`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS gift_certificate_snapshot (
        id TEXT PRIMARY KEY,
        certificate_no TEXT NOT NULL UNIQUE,
        recipient_name TEXT,
        purchaser_name TEXT,
        original_amount NUMERIC NOT NULL,
        balance_amount NUMERIC NOT NULL,
        currency_code TEXT NOT NULL,
        issue_date TEXT NOT NULL,
        expiry_date TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        updated_at TEXT NOT NULL
      )`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS supplier_snapshot (
        supplier_no TEXT PRIMARY KEY,
        supplier_name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        tax_number TEXT,
        address_line1 TEXT,
        city TEXT,
        country_code TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        updated_at TEXT NOT NULL
      )`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS transaction_reference_capture (
        id TEXT PRIMARY KEY,
        reference_value TEXT NOT NULL,
        normalized_reference TEXT NOT NULL UNIQUE,
        details TEXT,
        first_transaction_no TEXT,
        last_transaction_no TEXT,
        use_count INTEGER NOT NULL DEFAULT 1,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    );
    await this.pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_reference_capture_key ON transaction_reference_capture(normalized_reference)",
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_transaction_reference_capture_seen ON transaction_reference_capture(last_seen_at DESC)",
    );
    await this.ensureColumn(
      "inter_store_transfer_snapshot",
      "transfer_batch_no",
      "TEXT",
    );
    await this.ensureColumn(
      "inter_store_transfer_snapshot",
      "line_no",
      "INTEGER NOT NULL DEFAULT 1",
    );
    await this.ensureColumn(
      "inter_store_transfer_snapshot",
      "required_at",
      "TEXT",
    );
    await this.ensureColumn(
      "product_snapshot",
      "base_unit_of_measure",
      "TEXT NOT NULL DEFAULT 'EA'",
    );
    await this.ensureColumn(
      "product_snapshot",
      "uom_conversions_json",
      "TEXT NOT NULL DEFAULT '[]'",
    );
    await this.ensureColumn(
      "product_snapshot",
      "selling_units_json",
      "TEXT NOT NULL DEFAULT '[]'",
    );
    await this.ensureColumn(
      "inter_store_transfer_request_draft",
      "lines_json",
      "TEXT NOT NULL DEFAULT '[]'",
    );
    for (const tableName of [
      "inter_store_transfer_snapshot",
      "inter_store_transfer_request_draft",
    ]) {
      await this.ensureColumn(
        tableName,
        "requested_unit_of_measure",
        "TEXT NOT NULL DEFAULT 'EA'",
      );
      await this.ensureColumn(
        tableName,
        "requested_unit_quantity",
        "NUMERIC NOT NULL DEFAULT 0",
      );
      await this.ensureColumn(
        tableName,
        "uom_conversion_factor",
        "NUMERIC NOT NULL DEFAULT 1",
      );
      await this.ensureColumn(
        tableName,
        "base_unit_of_measure",
        "TEXT NOT NULL DEFAULT 'EA'",
      );
    }
    await this.pool.query(
      "UPDATE inter_store_transfer_snapshot SET requested_unit_quantity = requested_quantity WHERE requested_unit_quantity <= 0",
    );
    await this.pool.query(
      "UPDATE inter_store_transfer_request_draft SET requested_unit_quantity = quantity WHERE requested_unit_quantity <= 0",
    );
    await this.ensureColumn("pos_transaction", "cashier_code", "TEXT");
    await this.ensureColumn(
      "product_snapshot",
      "product_type",
      "TEXT NOT NULL DEFAULT 'STANDARD'",
    );
    await this.ensureColumn("product_snapshot", "min_stock_level", "NUMERIC");
    await this.ensureColumn("product_snapshot", "reorder_point", "NUMERIC");
    await this.ensureColumn(
      "product_snapshot",
      "safety_stock_level",
      "NUMERIC",
    );
    await this.ensureColumn(
      "product_snapshot",
      "track_size",
      "INTEGER NOT NULL DEFAULT 0",
    );
    await this.ensureColumn(
      "product_snapshot",
      "track_color",
      "INTEGER NOT NULL DEFAULT 0",
    );
    await this.ensureColumn(
      "product_snapshot",
      "catalog_membership_active",
      "INTEGER NOT NULL DEFAULT 1",
    );
    await this.ensureColumn(
      "product_snapshot",
      "catalog_sort_order",
      "INTEGER",
    );
    await this.ensureColumn(
      "inventory_location_snapshot",
      "is_sales_order_default",
      "INTEGER NOT NULL DEFAULT 0",
    );
    await this.pool.query(
      `UPDATE inventory_location_snapshot
       SET is_sales_order_default = is_sales_default
       WHERE is_sales_order_default = 0
         AND is_sales_default = 1`,
    );
    await this.ensureColumn(
      "pos_transaction_line",
      "inventory_location_code",
      "TEXT",
    );
    await this.ensureColumn("pos_transaction_line", "variant_size", "TEXT");
    await this.ensureColumn("pos_transaction_line", "variant_color", "TEXT");
    await this.ensureColumn("pos_transaction_line", "line_note", "TEXT");
    await this.ensureColumn(
      "pos_transaction_line",
      "product_variant_code_snapshot",
      "TEXT",
    );
    await this.ensureColumn(
      "pos_transaction_line",
      "variant_attributes_snapshot",
      "TEXT",
    );
    await this.ensureColumn(
      "pos_transaction_line",
      "selling_unit_of_measure",
      "TEXT NOT NULL DEFAULT 'EA'",
    );
    await this.ensureColumn(
      "pos_transaction_line",
      "base_unit_of_measure",
      "TEXT NOT NULL DEFAULT 'EA'",
    );
    await this.ensureColumn(
      "pos_transaction_line",
      "uom_conversion_factor",
      "NUMERIC NOT NULL DEFAULT 1",
    );
    await this.ensureColumn(
      "pos_transaction_line",
      "base_quantity",
      "NUMERIC NOT NULL DEFAULT 0",
    );
    await this.pool.query(
      "UPDATE pos_transaction_line SET base_quantity = quantity WHERE base_quantity <= 0",
    );
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS product_variant_snapshot (id TEXT PRIMARY KEY, product_code TEXT NOT NULL, variant_code TEXT NOT NULL UNIQUE, sku TEXT, display_name TEXT, unit_price NUMERIC NOT NULL DEFAULT 0, quantity_on_hand NUMERIC NOT NULL DEFAULT 0, barcode TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', attributes_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)",
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_product_variant_product ON product_variant_snapshot(product_code)",
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_product_variant_barcode ON product_variant_snapshot(barcode)",
    );
    await this.ensureColumn(
      "sales_order",
      "deposit_amount",
      "NUMERIC NOT NULL DEFAULT 0",
    );
    await this.ensureColumn(
      "sales_order",
      "balance_amount",
      "NUMERIC NOT NULL DEFAULT 0",
    );
    await this.ensureColumn("sales_order", "deposit_tender_method_code", "TEXT");
    await this.ensureColumn("sales_order", "deposit_tender_method_name", "TEXT");
    await this.ensureColumn("sales_order", "deposit_payment_method", "TEXT");
    await this.ensureColumn("sales_order", "deposit_reference", "TEXT");
    await this.ensureColumn("sales_order", "deposit_paid_at", "TEXT");
    await this.pool.query(
      "UPDATE sales_order SET balance_amount = total_amount WHERE balance_amount = 0 AND status = 'OPEN'",
    );
    await this.pool.query(
      `UPDATE pos_payment AS payment
       SET received_shift_id = (
         SELECT shift.id
         FROM pos_shift AS shift
         WHERE shift.opened_at <= payment.received_at
           AND (shift.closed_at IS NULL OR shift.closed_at >= payment.received_at)
           AND shift.terminal_code = COALESCE(
             (
               SELECT transaction_shift.terminal_code
               FROM pos_transaction AS txn
               LEFT JOIN pos_shift AS transaction_shift
                 ON transaction_shift.id = txn.shift_id
               WHERE txn.id = payment.pos_transaction_id
             ),
             shift.terminal_code
           )
         ORDER BY shift.opened_at DESC
         LIMIT 1
       )
       WHERE payment.received_shift_id IS NULL`,
    );
    await this.pool.query(
      `UPDATE pos_payment AS payment
       SET received_shift_id = txn.shift_id
       FROM pos_transaction AS txn
       WHERE txn.id = payment.pos_transaction_id
         AND payment.received_shift_id IS NULL`,
    );
    await this.pool.query(
      `UPDATE pos_payment AS payment
       SET received_shift_no = COALESCE(payment.received_shift_no, shift.shift_no),
           received_terminal_code = COALESCE(payment.received_terminal_code, shift.terminal_code),
           received_cashier_code = COALESCE(payment.received_cashier_code, shift.cashier_code)
       FROM pos_shift AS shift
       WHERE shift.id = payment.received_shift_id`,
    );
    await this.pool.query(
      `UPDATE pos_payment AS payment
       SET payment_purpose = 'SALES_ORDER_DEPOSIT'
       FROM sales_order AS sales_order
       WHERE payment.payment_purpose = 'TRANSACTION_SETTLEMENT'
         AND sales_order.source_transaction_id = payment.pos_transaction_id
         AND sales_order.deposit_paid_at IS NOT NULL
         AND payment.received_at <= sales_order.deposit_paid_at`,
    );
    await this.pool.query(
      `UPDATE pos_payment AS payment
       SET payment_purpose = 'SALES_ORDER_BALANCE'
       FROM sales_order AS sales_order
       WHERE payment.payment_purpose = 'TRANSACTION_SETTLEMENT'
         AND sales_order.source_transaction_id = payment.pos_transaction_id
         AND (
           sales_order.deposit_paid_at IS NULL
           OR payment.received_at > sales_order.deposit_paid_at
         )`,
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "minimum_line_quantity",
      "NUMERIC",
    );
    await this.ensureColumn("promotion_snapshot", "buy_quantity", "NUMERIC");
    await this.ensureColumn("promotion_snapshot", "reward_quantity", "NUMERIC");
    await this.ensureColumn(
      "promotion_snapshot",
      "eligible_store_codes_json",
      "TEXT",
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "eligible_customer_types_json",
      "TEXT",
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "eligible_loyalty_tiers_json",
      "TEXT",
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "active_days_of_week_json",
      "TEXT",
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "active_from_minutes",
      "INTEGER",
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "active_to_minutes",
      "INTEGER",
    );
    await this.ensureColumn(
      "promotion_snapshot",
      "coupon_required",
      "INTEGER NOT NULL DEFAULT 0",
    );
    await this.ensureColumn("promotion_snapshot", "coupon_code", "TEXT");
    await this.ensureColumn(
      "tender_method_snapshot",
      "gateway_provider",
      "TEXT",
    );
    await this.ensureColumn("tender_method_snapshot", "gateway_mode", "TEXT");
    await this.ensureColumn(
      "tender_method_snapshot",
      "gateway_merchant_id",
      "TEXT",
    );
    await this.ensureColumn(
      "tender_method_snapshot",
      "gateway_public_key",
      "TEXT",
    );
    await this.ensureColumn(
      "tender_method_snapshot",
      "gateway_callback_url",
      "TEXT",
    );
    await this.ensureColumn(
      "tender_method_snapshot",
      "gateway_active",
      "INTEGER NOT NULL DEFAULT 0",
    );
    await this.ensureColumn(
      "tender_method_snapshot",
      "gateway_status",
      "TEXT NOT NULL DEFAULT 'DISABLED'",
    );
    await this.ensureColumn("tender_method_snapshot", "published_at", "TEXT");
    await this.ensureColumn("sync_outbox", "next_retry_at", "TEXT");
    await this.ensureColumn("sync_outbox", "failure_kind", "TEXT");
    await this.ensureColumn("sync_outbox", "last_http_status", "INTEGER");
    await this.ensureColumn("sync_outbox", "sync_run_id", "TEXT");
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS local_store_expense (
        id TEXT PRIMARY KEY,
        expense_no TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        supplier_name TEXT,
        payment_method TEXT,
        external_reference TEXT,
        amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
        attachment_file_name TEXT,
        attachment_url TEXT,
        attachment_content_type TEXT,
        attachment_content_base64 TEXT,
        operator_name TEXT NOT NULL,
        note TEXT,
        confirmed_by TEXT,
        confirmed_at TEXT,
        synced_at TEXT,
        updated_at TEXT NOT NULL
      )`,
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_local_store_expense_status_runtime ON local_store_expense(status, expense_date DESC)",
    );
    await this.pool.query(
      "CREATE INDEX IF NOT EXISTS idx_local_store_expense_synced_runtime ON local_store_expense(synced_at, confirmed_at DESC)",
    );

    const defaults = [
      ["retail_org_name", defaultStoreConfig.retailOrgName],
      ["store_code", defaultStoreConfig.storeCode],
      ["store_name", defaultStoreConfig.storeName],
      ["terminal_code", this.fallbackTerminalCode],
      ["node_code", this.fallbackNodeCode],
      ["deployment_mode", this.deploymentMode],
    ];

    for (const [key, value] of defaults) {
      await this.pool.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, value],
      );
    }

    await this.setMetadata("node_code", this.fallbackNodeCode);

    await this.pool.query(
      `INSERT INTO store_node_metadata (key, value, updated_at)
       VALUES ('last_postgres_service_start_at', $1, $1)
       ON CONFLICT (key) DO UPDATE
       SET value = excluded.value,
           updated_at = excluded.updated_at`,
      [timestamp],
    );
  }

  private async metadata() {
    const result = await this.pool.query<{ key: string; value: string }>(
      "SELECT key, value FROM app_metadata",
    );

    return Object.fromEntries(
      result.rows.map((row) => [row.key, row.value]),
    ) as Record<string, string | undefined>;
  }

  private async ensureColumn(
    tableName: string,
    columnName: string,
    columnDefinition: string,
  ) {
    const table = await this.pool.query<{ exists: string | null }>(
      "SELECT to_regclass($1) AS exists",
      [`public.${tableName}`],
    );

    if (!table.rows[0]?.exists) {
      return;
    }

    const existing = await this.pool.query<{ exists: number }>(
      `SELECT 1 AS exists
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
       LIMIT 1`,
      [tableName, columnName],
    );

    if (existing.rowCount) {
      return;
    }

    await this.pool.query(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
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

    await this.pool.query(
      `INSERT INTO terminal_connection (
        terminal_code,
        client_name,
        first_seen_at,
        last_seen_at,
        request_count,
        last_method,
        remote_address,
        user_agent
      ) VALUES ($1, $2, $3, $3, 1, $4, $5, $6)
      ON CONFLICT (terminal_code) DO UPDATE SET
        client_name = COALESCE(excluded.client_name, terminal_connection.client_name),
        last_seen_at = excluded.last_seen_at,
        request_count = terminal_connection.request_count + 1,
        last_method = excluded.last_method,
        remote_address = COALESCE(excluded.remote_address, terminal_connection.remote_address),
        user_agent = COALESCE(excluded.user_agent, terminal_connection.user_agent)`,
      [
        terminalCode,
        clientName,
        timestamp,
        input?.method?.trim() || null,
        input?.remoteAddress?.trim() || null,
        input?.userAgent?.trim() || null,
      ],
    );
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

  private formatOperatorLabel(input: { loginId: string; displayName: string }) {
    return `${input.displayName} (${input.loginId})`;
  }

  private async getStoreCode() {
    const metadata = await this.metadata();
    return metadata.store_code ?? defaultStoreConfig.storeCode;
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

  private requireStandaloneSetupMode() {
    if (!this.isStandaloneDeployment()) {
      throw new Error(
        "Desktop master-data setup is only available when this store desktop runs in standalone mode.",
      );
    }
  }

  private async requireStandaloneSupervisor() {
    const session = await this.requireActiveOperatorSession({
      purpose: "standalone setup",
    });

    if (!session.capabilities.supervisorEligible) {
      throw new Error(
        `${this.formatOperatorLabel(session)} is not eligible to manage standalone setup.`,
      );
    }

    return session;
  }

  private async buildLocalPublication<TPayload>(
    aggregateType: SyncEnvelope<TPayload>["aggregateType"],
    aggregateId: string,
    eventType: string,
    payload: TPayload,
    occurredAt: string,
  ): Promise<SyncEnvelope<TPayload>> {
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;

    return {
      eventId: randomUUID(),
      idempotencyKey: `standalone:${aggregateType}:${aggregateId}:${eventType}:${occurredAt}`,
      aggregateType,
      aggregateId,
      eventType,
      originatingNodeCode: nodeCode,
      targetNodeCode: nodeCode,
      recordVersion: Date.now(),
      occurredAt,
      payload,
    };
  }

  private async metadataValue(key: string) {
    const result = await this.pool.query<{ value: string }>(
      "SELECT value FROM app_metadata WHERE key = $1 LIMIT 1",
      [key],
    );

    return result.rows[0]?.value ?? null;
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

  private async deleteMetadata(key: string, runner: DbRunner = this.pool) {
    await runner.query("DELETE FROM app_metadata WHERE key = $1", [key]);
  }

  private async nextSequence(key: string) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<{ value: string }>(
        "SELECT value FROM app_metadata WHERE key = $1 FOR UPDATE",
        [key],
      );
      const nextValue = Math.trunc(asNumber(result.rows[0]?.value)) + 1;

      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, String(nextValue)],
      );
      await client.query("COMMIT");
      return nextValue;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async nextPosTransactionNumber() {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const transactionNo = await this.allocatePosTransactionNumber(client);
      await client.query("COMMIT");
      return transactionNo;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async allocatePosTransactionNumber(client: pg.PoolClient) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('flash_erp_pos_receipt_number'))",
    );
    const result = await client.query<{ key: string; value: string }>(
      `SELECT key, value
       FROM app_metadata
       WHERE key = ANY($1::text[])
       FOR UPDATE`,
      [
        [
          POS_RECEIPT_SEQUENCE_METADATA_KEY,
          POS_RECEIPT_SERIES_TOKEN_METADATA_KEY,
        ],
      ],
    );
    const metadata = Object.fromEntries(
      result.rows.map((row) => [row.key, row.value]),
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

    for (const [key, value] of [
      [POS_RECEIPT_SERIES_TOKEN_METADATA_KEY, seriesToken],
      [POS_RECEIPT_SEQUENCE_METADATA_KEY, String(nextSequence)],
    ] as const) {
      await client.query(
        `INSERT INTO app_metadata (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    }

    return formatPosTransactionNumber(seriesToken, nextSequence);
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
    const result = await this.pool.query<RetailUserRow>(
      `SELECT
        id,
        login_id,
        email,
        display_name,
        account_status,
        home_store_code,
        home_store_name,
        role_codes_json,
        role_names_json,
        permission_codes_json,
        password_hash,
        updated_at
      FROM retail_user_snapshot
      WHERE lower(login_id) = lower($1)
      LIMIT 1`,
      [loginId.trim()],
    );

    return result.rows[0] ?? null;
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

    console.info("Store Desktop PostgreSQL sign-in auth lookup started.", {
      traceId,
      loginId: normalizedLoginId,
    });
    const user = await this.getStoreUserByLoginId(normalizedLoginId);
    console.info("Store Desktop PostgreSQL sign-in auth lookup completed.", {
      traceId,
      loginId: normalizedLoginId,
      found: Boolean(user),
      elapsedMs: Date.now() - authStartedAt,
    });

    if (!user) {
      const countResult = await this.pool.query<{ value: string }>(
        "SELECT count(*) AS value FROM retail_user_snapshot",
      );

      if (Number(countResult.rows[0]?.value ?? 0) === 0) {
        throw new Error(
          this.isStandaloneDeployment()
            ? "No local operator accounts are available on this PostgreSQL store node yet."
            : "No synced operator accounts are available on this Postgres store node yet. Run a store migration or sync cycle, then try signing in again.",
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
    console.info("Store Desktop PostgreSQL sign-in password check started.", {
      traceId,
      loginId: user.login_id,
    });
    if (!bcrypt.compareSync(normalizedPassword, user.password_hash)) {
      throw new Error(
        "Invalid operator login ID or password for this store node.",
      );
    }
    console.info("Store Desktop PostgreSQL sign-in password check completed.", {
      traceId,
      loginId: user.login_id,
      elapsedMs: Date.now() - compareStartedAt,
    });

    return user;
  }

  private async getActiveOperatorSessionRow() {
    const result = await this.pool.query<ActiveOperatorSessionRow>(
      `SELECT
        session.id AS session_id,
        session.terminal_code,
        session.opened_at,
        session.last_seen_at,
        account.id AS user_id,
        account.id,
        account.login_id,
        account.email,
        account.display_name,
        account.account_status,
        account.home_store_code,
        account.home_store_name,
        account.role_codes_json,
        account.role_names_json,
        account.permission_codes_json,
        account.password_hash,
        account.updated_at
      FROM operator_session AS session
      JOIN retail_user_snapshot AS account
        ON account.id = session.retail_user_id
      WHERE session.closed_at IS NULL
        AND (session.terminal_code = $1 OR session.terminal_code IS NULL)
      ORDER BY session.opened_at DESC
      LIMIT 1`,
      [this.getTerminalCode()],
    );

    return result.rows[0] ?? null;
  }

  private async closeOperatorSession(
    sessionId: string,
    reason: string,
    timestamp: string,
  ) {
    await this.pool.query(
      `UPDATE operator_session
       SET closed_at = COALESCE(closed_at, $1),
           close_reason = COALESCE(close_reason, $2)
       WHERE id = $3`,
      [timestamp, reason, sessionId],
    );
  }

  private async touchOperatorSession(sessionId: string, timestamp: string) {
    await this.pool.query(
      "UPDATE operator_session SET last_seen_at = $1 WHERE id = $2 AND closed_at IS NULL",
      [timestamp, sessionId],
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
      `signin-postgres-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const timestamp = isoNow();
    const terminalCode = this.getTerminalCode();
    console.info("Store Desktop PostgreSQL sign-in started.", {
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
      const client = await this.pool.connect();

      console.info("Store Desktop PostgreSQL sign-in session write started.", {
        traceId,
        loginId: user.login_id,
      });
      await client.query("BEGIN");
      try {
        const activeResult = await client.query<{
          session_id: string;
          user_id: string;
        }>(
          `SELECT id AS session_id, retail_user_id AS user_id
           FROM operator_session
           WHERE closed_at IS NULL
             AND (terminal_code = $1 OR terminal_code IS NULL)
           ORDER BY opened_at DESC
           LIMIT 1`,
          [terminalCode],
        );
        const activeSession = activeResult.rows[0] ?? null;

        if (activeSession && activeSession.user_id === user.id) {
          await client.query(
            "UPDATE operator_session SET terminal_code = COALESCE(terminal_code, $1), last_seen_at = $2 WHERE id = $3",
            [terminalCode, timestamp, activeSession.session_id],
          );
        } else {
          await client.query(
            `UPDATE operator_session
             SET closed_at = $1,
                 close_reason = COALESCE(close_reason, 'REPLACED_SESSION')
             WHERE closed_at IS NULL
               AND (terminal_code = $2 OR terminal_code IS NULL)`,
            [timestamp, terminalCode],
          );
          await client.query(
            `INSERT INTO operator_session (
              id,
              retail_user_id,
              terminal_code,
              opened_at,
              last_seen_at,
              closed_at,
              close_reason
            ) VALUES ($1, $2, $3, $4, $4, NULL, NULL)`,
            [randomUUID(), user.id, terminalCode, timestamp],
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      console.info("Store Desktop PostgreSQL sign-in session write completed.", {
        traceId,
        elapsedMs: Date.now() - startedAt,
      });

      console.info("Store Desktop PostgreSQL sign-in snapshot started.", {
        traceId,
      });
      const snapshot = await this.getSyncSnapshot();
      console.info("Store Desktop PostgreSQL sign-in snapshot completed.", {
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
      console.error("Store Desktop PostgreSQL sign-in failed.", {
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

  async bootstrapStandaloneAdmin(
    input: StoreStandaloneUserInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    const countResult = await this.pool.query<{ value: string }>(
      "SELECT count(*) AS value FROM retail_user_snapshot",
    );

    if (Number(countResult.rows[0]?.value ?? 0) > 0) {
      throw new Error(
        "This standalone PostgreSQL store node already has local operator accounts. Sign in with a supervisor to manage users.",
      );
    }

    const timestamp = isoNow();
    const loginId = normalizeSetupCode(input.loginId, "Login ID");
    const displayName = normalizeSetupName(input.displayName, "Display name");
    const password = optionalSetupText(input.password);

    if (!password) {
      throw new Error("Password is required when creating the first standalone administrator.");
    }

    const metadata = await this.metadata();
    validateStandalonePasswordPolicy(
      password,
      this.getPasswordPolicySummary(metadata),
    );

    const roleName =
      optionalSetupText(input.roleName) ?? "Standalone administrator";
    const roleCode = roleName.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
    const passwordHash = bcrypt.hashSync(password, 10);
    const permissionCodes = standalonePermissionCodes({
      cashierEligible: true,
      supervisorEligible: true,
    });
    const storeCode = await this.getStoreCode();
    const userId = `standalone-user-${loginId.toLowerCase()}`;
    const event = await this.buildLocalPublication<EnterpriseRetailUserPublishedPayload>(
      "retailUser",
      userId,
      "security.user.published",
      {
        storeCode,
        userId,
        loginId,
        email: optionalSetupText(input.email),
        displayName,
        accountStatus: "ACTIVE",
        homeStoreCode: storeCode,
        homeStoreName: metadata.store_name ?? defaultStoreConfig.storeName,
        roleCodes: [roleCode || "STANDALONE-ADMINISTRATOR"],
        roleNames: [roleName],
        permissionCodes,
        passwordHash,
        passwordUpdatedAt: timestamp,
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${displayName} was created as the first standalone administrator.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneSettings(
    input: StoreStandaloneSettingsInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const currentMetadata = await this.metadata();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const storeName = optionalSetupText(input.storeName);
      const shortName = optionalSetupText(input.shortName);
      const currencyCode = optionalSetupText(input.currencyCode)?.toUpperCase();
      const timezone = optionalSetupText(input.timezone);
      const companyLogoUrl = optionalSetupText(input.companyLogoUrl);
      const loginBackgroundImageUrl = optionalSetupText(
        input.loginBackgroundImageUrl,
      );
      const receiptHeader = optionalSetupText(input.receiptHeader);
      const receiptFooter = optionalSetupText(input.receiptFooter);

      if (storeName) {
        await this.setMetadata("store_name", storeName, client);
      }

      if (shortName) {
        await this.setMetadata("store_short_name", shortName, client);
      } else if (input.shortName !== undefined) {
        await this.deleteMetadata("store_short_name", client);
      }

      if (currencyCode) {
        await this.setMetadata("currency_code", currencyCode, client);
      }

      if (timezone) {
        await this.setMetadata("timezone", timezone, client);
      }

      if (typeof input.touchModeEnabled === "boolean") {
        await this.setMetadata(
          "touch_mode_enabled",
          input.touchModeEnabled ? "1" : "0",
          client,
        );
      }

      if (typeof input.showCriticalStocksOnStartup === "boolean") {
        await this.setMetadata(
          "show_critical_stocks_on_startup",
          input.showCriticalStocksOnStartup ? "1" : "0",
          client,
        );
      }
      if (typeof input.showExpiringBatchesOnStartup === "boolean") {
        await this.setMetadata(
          "show_expiring_batches_on_startup",
          input.showExpiringBatchesOnStartup ? "1" : "0",
          client,
        );
      }
      if (
        (input.expiryAlertLeadDays !== undefined &&
          input.expiryAlertLeadDays !== null) ||
        (input.expiryCriticalDays !== undefined &&
          input.expiryCriticalDays !== null)
      ) {
        const expiryAlertLeadDays = normalizePolicyInteger(
          input.expiryAlertLeadDays ?? currentMetadata.expiry_alert_lead_days,
          30,
          1,
          3650,
        );
        const expiryCriticalDays = normalizePolicyInteger(
          input.expiryCriticalDays ?? currentMetadata.expiry_critical_days,
          7,
          0,
          expiryAlertLeadDays,
        );
        await this.setMetadata(
          "expiry_alert_lead_days",
          String(expiryAlertLeadDays),
          client,
        );
        await this.setMetadata(
          "expiry_critical_days",
          String(expiryCriticalDays),
          client,
        );
      }

      const booleanSettings = [
        ["allow_negative_inventory", input.allowNegativeInventory],
        ["allow_offline_sales", input.allowOfflineSales],
        ["auto_print_receipts", input.autoPrintReceipts],
        ["enforce_serialized_scan_at_pos", input.enforceSerializedScanAtPos],
        ["require_customer_for_credit_sales", input.requireCustomerForCreditSales],
        [
          "require_supervisor_for_receiptless_return",
          input.requireSupervisorForReceiptlessReturn,
        ],
      ] as const;

      for (const [key, value] of booleanSettings) {
        if (typeof value === "boolean") {
          await this.setMetadata(key, value ? "1" : "0", client);
        }
      }

      if (
        input.defaultReceiptSearchDays !== undefined &&
        input.defaultReceiptSearchDays !== null
      ) {
        await this.setMetadata(
          "default_receipt_search_days",
          String(
            normalizePolicyInteger(input.defaultReceiptSearchDays, 30, 1, 365),
          ),
          client,
        );
      }

      if (
        input.shiftFloatPromptAmount !== undefined &&
        input.shiftFloatPromptAmount !== null
      ) {
        await this.setMetadata(
          "shift_float_prompt_amount",
          Math.max(0, Number(input.shiftFloatPromptAmount) || 0).toFixed(2),
          client,
        );
      }

      const listSettings = [
        [
          "product_sizes_json",
          Array.isArray(input.productSizes)
            ? JSON.stringify(normalizeSetupStringList(input.productSizes) ?? [])
            : null,
        ],
        [
          "pos_discount_rates_json",
          Array.isArray(input.posDiscountRates)
            ? JSON.stringify(normalizeSetupNumberList(input.posDiscountRates) ?? [])
            : null,
        ],
        [
          "pos_express_charge_rates_json",
          Array.isArray(input.posExpressChargeRates)
            ? JSON.stringify(normalizeSetupNumberList(input.posExpressChargeRates) ?? [])
            : null,
        ],
      ] as const;

      for (const [key, value] of listSettings) {
        if (value !== null) {
          await this.setMetadata(key, value, client);
        }
      }

      if (input.layawaySettings) {
        const layawaySettings = normalizeLayawaySettings(input.layawaySettings);
        const layawayEntries = [
          ["layaway_enabled", layawaySettings.enabled ? "1" : "0"],
          ["layaway_reserve_stock_on_deposit", layawaySettings.reserveStockOnDeposit ? "1" : "0"],
          ["layaway_minimum_deposit_percent", layawaySettings.minimumDepositPercent.toFixed(2)],
          ["layaway_require_full_payment_before_fulfilment", layawaySettings.requireFullPaymentBeforeFulfilment ? "1" : "0"],
          ["layaway_refund_payments_on_cancellation", layawaySettings.refundPaymentsOnCancellation ? "1" : "0"],
          ["layaway_cancellation_fee_type", layawaySettings.cancellationFeeType],
          ["layaway_cancellation_fee_value", layawaySettings.cancellationFeeValue.toFixed(2)],
        ] as const;

        for (const [key, value] of layawayEntries) {
          await this.setMetadata(key, value, client);
        }
      }

      if (companyLogoUrl) {
        await this.setMetadata("local_company_logo_url", companyLogoUrl, client);
      } else if (input.companyLogoUrl !== undefined) {
        await this.deleteMetadata("local_company_logo_url", client);
      }

      if (loginBackgroundImageUrl) {
        await this.setMetadata(
          "login_background_image_url",
          loginBackgroundImageUrl,
          client,
        );
      } else if (input.loginBackgroundImageUrl !== undefined) {
        await this.deleteMetadata("login_background_image_url", client);
      }

      if (receiptHeader) {
        await this.setMetadata("receipt_header", receiptHeader, client);
      } else if (input.receiptHeader !== undefined) {
        await this.deleteMetadata("receipt_header", client);
      }

      if (receiptFooter) {
        await this.setMetadata("receipt_footer", receiptFooter, client);
      } else if (input.receiptFooter !== undefined) {
        await this.deleteMetadata("receipt_footer", client);
      }

      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: "Standalone store settings were saved on this desktop.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandalonePasswordPolicy(
    input: StoreStandalonePasswordPolicyInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const existing = this.getPasswordPolicySummary(await this.metadata());
    const nextPolicy = {
      minimumLength: normalizePolicyInteger(
        input.minimumLength,
        existing.minimumLength,
        4,
        128,
      ),
      requireUppercase:
        typeof input.requireUppercase === "boolean"
          ? input.requireUppercase
          : existing.requireUppercase,
      requireLowercase:
        typeof input.requireLowercase === "boolean"
          ? input.requireLowercase
          : existing.requireLowercase,
      requireNumber:
        typeof input.requireNumber === "boolean"
          ? input.requireNumber
          : existing.requireNumber,
      requireSymbol:
        typeof input.requireSymbol === "boolean"
          ? input.requireSymbol
          : existing.requireSymbol,
      temporaryPasswordMustChange:
        typeof input.temporaryPasswordMustChange === "boolean"
          ? input.temporaryPasswordMustChange
          : existing.temporaryPasswordMustChange,
      passwordExpiryDays: normalizePolicyInteger(
        input.passwordExpiryDays,
        existing.passwordExpiryDays,
        0,
        999,
      ),
      passwordHistoryCount: normalizePolicyInteger(
        input.passwordHistoryCount,
        existing.passwordHistoryCount,
        0,
        24,
      ),
      lockoutThreshold: normalizePolicyInteger(
        input.lockoutThreshold,
        existing.lockoutThreshold,
        0,
        20,
      ),
      lockoutMinutes: normalizePolicyInteger(
        input.lockoutMinutes,
        existing.lockoutMinutes,
        0,
        1440,
      ),
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.setMetadata(
        "password_policy_minimum_length",
        String(nextPolicy.minimumLength),
        client,
      );
      await this.setMetadata(
        "password_policy_require_uppercase",
        nextPolicy.requireUppercase ? "1" : "0",
        client,
      );
      await this.setMetadata(
        "password_policy_require_lowercase",
        nextPolicy.requireLowercase ? "1" : "0",
        client,
      );
      await this.setMetadata(
        "password_policy_require_number",
        nextPolicy.requireNumber ? "1" : "0",
        client,
      );
      await this.setMetadata(
        "password_policy_require_symbol",
        nextPolicy.requireSymbol ? "1" : "0",
        client,
      );
      await this.setMetadata(
        "password_policy_temporary_must_change",
        nextPolicy.temporaryPasswordMustChange ? "1" : "0",
        client,
      );
      await this.setMetadata(
        "password_policy_expiry_days",
        String(nextPolicy.passwordExpiryDays),
        client,
      );
      await this.setMetadata(
        "password_policy_history_count",
        String(nextPolicy.passwordHistoryCount),
        client,
      );
      await this.setMetadata(
        "password_policy_lockout_threshold",
        String(nextPolicy.lockoutThreshold),
        client,
      );
      await this.setMetadata(
        "password_policy_lockout_minutes",
        String(nextPolicy.lockoutMinutes),
        client,
      );
      await this.setMetadata("password_policy_updated_at", timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: "Standalone password policy was saved.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneDepartment(
    input: StoreStandaloneDepartmentInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const departmentCode = normalizeSetupCode(input.departmentCode, "Department code");
    const departmentName = normalizeSetupName(input.departmentName, "Department name");
    const event = await this.buildLocalPublication<EnterpriseProductDepartmentPublishedPayload>(
      "productDepartment",
      `standalone-department-${departmentCode.toLowerCase()}`,
      "setup.product-department.published",
      {
        storeCode: await this.getStoreCode(),
        departmentCode,
        departmentName,
        description: optionalSetupText(input.description),
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        sortOrder: Math.trunc(normalizeSetupNumber(input.sortOrder, 0, 0)),
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${departmentName} was saved in standalone departments.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneCategory(
    input: StoreStandaloneCategoryInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const categoryCode = normalizeSetupCode(input.categoryCode, "Category code");
    const categoryName = normalizeSetupName(input.categoryName, "Category name");
    const departmentCode = normalizeSetupCode(input.departmentCode, "Department code");
    const departmentResult = await this.pool.query<{ department_name: string }>(
      "SELECT department_name FROM product_department_snapshot WHERE department_code = $1 LIMIT 1",
      [departmentCode],
    );
    const departmentName =
      optionalSetupText(input.departmentName) ??
      departmentResult.rows[0]?.department_name ??
      departmentCode;
    const event = await this.buildLocalPublication<EnterpriseProductCategoryPublishedPayload>(
      "productCategory",
      `standalone-category-${categoryCode.toLowerCase()}`,
      "setup.product-category.published",
      {
        storeCode: await this.getStoreCode(),
        categoryCode,
        categoryName,
        departmentCode,
        departmentName,
        description: optionalSetupText(input.description),
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        sortOrder: Math.trunc(normalizeSetupNumber(input.sortOrder, 0, 0)),
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${categoryName} was saved in standalone categories.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneUnitOfMeasure(
    input: StoreStandaloneUnitInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const uomCode = normalizeSetupCode(input.uomCode, "Unit code");
    const uomName = normalizeSetupName(input.uomName, "Unit name");
    const event = await this.buildLocalPublication<EnterpriseUnitOfMeasurePublishedPayload>(
      "unitOfMeasure",
      `standalone-uom-${uomCode.toLowerCase()}`,
      "setup.unit-of-measure.published",
      {
        storeCode: await this.getStoreCode(),
        uomCode,
        uomName,
        description: optionalSetupText(input.description),
        decimalPrecision: Math.max(
          0,
          Math.trunc(normalizeSetupNumber(input.decimalPrecision, 0, 0)),
        ),
        allowFractionalSale: input.allowFractionalSale === true,
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${uomName} was saved in standalone units.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneTaxProfile(
    input: StoreStandaloneTaxProfileInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const taxProfileCode = normalizeSetupCode(input.taxProfileCode, "Tax code");
    const taxProfileName = normalizeSetupName(input.taxProfileName, "Tax name");
    const event = await this.buildLocalPublication<EnterpriseTaxProfilePublishedPayload>(
      "taxProfile",
      `standalone-tax-${taxProfileCode.toLowerCase()}`,
      "setup.tax-profile.published",
      {
        storeCode: await this.getStoreCode(),
        taxProfileCode,
        taxProfileName,
        description: optionalSetupText(input.description),
        ratePercent: normalizeSetupNumber(input.ratePercent, 0, 4),
        isDefault: input.isDefault === true,
        isTaxInclusive: input.isTaxInclusive === true,
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${taxProfileName} was saved in standalone tax profiles.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneTenderMethod(
    input: StoreStandaloneTenderInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const tenderMethodCode = normalizeSetupCode(input.tenderMethodCode, "Tender code");
    const tenderMethodName = normalizeSetupName(input.tenderMethodName, "Tender name");
    const event = await this.buildLocalPublication<EnterpriseTenderMethodPublishedPayload>(
      "tenderMethod",
      `standalone-tender-${tenderMethodCode.toLowerCase()}`,
      "setup.tender-method.published",
      {
        storeCode: await this.getStoreCode(),
        tenderMethodCode,
        tenderMethodName,
        paymentMethod: normalizeStandalonePaymentMethod(input.paymentMethod),
        gatewayProvider: null,
        gatewayMode: null,
        gatewayMerchantId: null,
        gatewayPublicKey: null,
        gatewayCallbackUrl: null,
        gatewayActive: false,
        gatewayStatus: "DISABLED",
        description: optionalSetupText(input.description),
        requiresReference: input.requiresReference === true,
        allowChange: input.allowChange !== false,
        allowRefund: input.allowRefund !== false,
        allowOpenCashDrawer: input.allowOpenCashDrawer !== false,
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        sortOrder: Math.trunc(normalizeSetupNumber(input.sortOrder, 0, 0)),
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${tenderMethodName} was saved in standalone tenders.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneLocation(
    input: StoreStandaloneLocationInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const locationCode = normalizeSetupCode(input.locationCode, "Location code");
    const locationName = normalizeSetupName(input.locationName, "Location name");
    const countResult = await this.pool.query<{ value: string }>(
      "SELECT count(*) AS value FROM inventory_location_snapshot",
    );
    const existingLocations = Number(countResult.rows[0]?.value ?? 0);
    const useForSalesDefault =
      input.useForSalesDefault ?? existingLocations === 0;
    const useForSalesOrderDefault =
      input.useForSalesOrderDefault ?? useForSalesDefault;
    const useForReceivingDefault =
      input.useForReceivingDefault ?? existingLocations === 0;
    const defaults =
      optionalSetupText(input.defaults) ??
      [
        useForSalesDefault ? "SALES" : null,
        useForSalesOrderDefault ? "SALES_ORDER" : null,
        useForReceivingDefault ? "RECEIVING" : null,
      ]
        .filter(Boolean)
        .join(",");
    const event = await this.buildLocalPublication<EnterpriseInventoryLocationPublishedPayload>(
      "inventoryLocation",
      `standalone-location-${locationCode.toLowerCase()}`,
      "inventory.location.published",
      {
        storeCode: await this.getStoreCode(),
        locationCode,
        locationName,
        locationType:
          optionalSetupText(input.locationType)?.toUpperCase() ?? "STORE",
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        defaults,
        useForSalesDefault,
        useForSalesOrderDefault,
        useForReceivingDefault,
        warehouseCode: optionalSetupText(input.warehouseCode)?.toUpperCase() ?? null,
        warehouseName: optionalSetupText(input.warehouseName),
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${locationName} was saved as a standalone inventory location.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneBankAccount(
    input: StoreStandaloneBankAccountInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const metadata = await this.metadata();
    const bankCode = normalizeSetupCode(input.bankCode, "Bank code");
    const bankName = normalizeSetupName(input.bankName, "Bank name");
    const accountNumber = normalizeSetupName(
      input.accountNumber,
      "Account number",
    );
    const accountName = normalizeSetupName(input.accountName, "Account name");
    const branchCode =
      optionalSetupText(input.branchCode)?.toUpperCase() ?? "MAIN";
    const branchName = optionalSetupText(input.branchName) ?? "Main branch";
    const currencyCode =
      optionalSetupText(input.currencyCode)?.toUpperCase() ??
      metadata.currency_code ??
      "GHS";
    const bankAccountId =
      optionalSetupText(input.bankAccountId) ??
      `standalone-bank-${bankCode.toLowerCase()}-${accountNumber
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
    const event = await this.buildLocalPublication<EnterpriseBankAccountPublishedPayload>(
      "bankAccount",
      bankAccountId,
      "setup.bank-account.published",
      {
        storeCode: await this.getStoreCode(),
        bankAccountId,
        bankCode,
        bankName,
        branchCode,
        branchName,
        accountNumber,
        accountName,
        currencyCode,
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${bankName} ${accountNumber} was saved as a standalone bank account.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneSupplier(
    input: StoreStandaloneSupplierInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const supplierNo = normalizeSetupCode(input.supplierNo, "Supplier number");
    const supplierName = normalizeSetupName(input.supplierName, "Supplier name");
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO supplier_snapshot (
          supplier_no,
          supplier_name,
          phone,
          email,
          tax_number,
          address_line1,
          city,
          country_code,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (supplier_no) DO UPDATE SET
          supplier_name = excluded.supplier_name,
          phone = excluded.phone,
          email = excluded.email,
          tax_number = excluded.tax_number,
          address_line1 = excluded.address_line1,
          city = excluded.city,
          country_code = excluded.country_code,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          supplierNo,
          supplierName,
          optionalSetupText(input.phone),
          optionalSetupText(input.email),
          optionalSetupText(input.taxNumber),
          optionalSetupText(input.addressLine1),
          optionalSetupText(input.city),
          optionalSetupText(input.countryCode)?.toUpperCase() ?? null,
          optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
          timestamp,
        ],
      );
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${supplierName} was saved in standalone suppliers.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandalonePriceListEntry(
    input: StoreStandalonePriceInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const productCode = normalizeSetupCode(input.productCode, "Product code");
    const productResult = await this.pool.query<{ product_name: string }>(
      "SELECT product_name FROM product_snapshot WHERE product_code = $1 LIMIT 1",
      [productCode],
    );
    const product = productResult.rows[0] ?? null;

    if (!product) {
      throw new Error(`Product ${productCode} does not exist in the standalone catalog.`);
    }

    const metadata = await this.metadata();
    const priceListCode =
      optionalSetupText(input.priceListCode) ?? "default-sell";
    const priceListName =
      optionalSetupText(input.priceListName) ?? "Default selling price";
    const currencyCode =
      optionalSetupText(input.currencyCode)?.toUpperCase() ??
      metadata.currency_code ??
      "GHS";
    const unitPrice = normalizeSetupNumber(input.unitPrice, 0, 2);
    const isDefault = input.isDefault ?? priceListCode.toLowerCase() === "default-sell";
    const event = await this.buildLocalPublication<EnterprisePriceListPublishedPayload>(
      "priceList",
      `standalone-price-${priceListCode.toLowerCase()}-${productCode.toLowerCase()}`,
      "pricing.price-list.published",
      {
        storeCode: await this.getStoreCode(),
        priceListCode,
        priceListName,
        currencyCode,
        isDefault,
        customerType: optionalSetupText(input.customerType)?.toUpperCase() ?? null,
        loyaltyTier: optionalSetupText(input.loyaltyTier)?.toUpperCase() ?? null,
        productCode,
        unitPrice,
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${product.product_name} was repriced in standalone pricing.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandalonePromotion(
    input: StoreStandalonePromotionInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const promotionCode = normalizeSetupCode(input.promotionCode, "Promotion code");
    const promotionName = normalizeSetupName(input.promotionName, "Promotion name");
    const targetScope = normalizeStandalonePromotionTargetScope(input.targetScope);
    const event = await this.buildLocalPublication<EnterprisePromotionPublishedPayload>(
      "promotion",
      `standalone-promotion-${promotionCode.toLowerCase()}`,
      "setup.promotion.published",
      {
        storeCode: await this.getStoreCode(),
        promotionId: `standalone-promotion-${promotionCode.toLowerCase()}`,
        promotionCode,
        promotionName,
        description: optionalSetupText(input.description),
        discountType: normalizeStandalonePromotionDiscountType(input.discountType),
        targetScope,
        discountValue: normalizeSetupNumber(input.discountValue, 0, 2),
        minimumBasketAmount:
          input.minimumBasketAmount == null
            ? null
            : normalizeSetupNumber(input.minimumBasketAmount, 0, 2),
        minimumLineQuantity: null,
        buyQuantity: null,
        rewardQuantity: null,
        targetDepartmentCode:
          targetScope === "DEPARTMENT"
            ? optionalSetupText(input.targetDepartmentCode)?.toUpperCase() ?? null
            : null,
        targetCategoryCode:
          targetScope === "CATEGORY"
            ? optionalSetupText(input.targetCategoryCode)?.toUpperCase() ?? null
            : null,
        targetProductCode:
          targetScope === "PRODUCT"
            ? optionalSetupText(input.targetProductCode)?.toUpperCase() ?? null
            : null,
        eligibleStoreCodes: null,
        eligibleCustomerTypes: null,
        eligibleLoyaltyTiers: null,
        activeDaysOfWeek: null,
        activeFromMinutes: null,
        activeToMinutes: null,
        couponRequired: input.couponRequired === true,
        couponCode: optionalSetupText(input.couponCode)?.toUpperCase() ?? null,
        allowWithLoyalty: input.allowWithLoyalty !== false,
        applyOncePerBasket: input.applyOncePerBasket === true,
        priority: Math.trunc(normalizeSetupNumber(input.priority, 0, 0)),
        startAt: optionalSetupText(input.startAt),
        endAt: optionalSetupText(input.endAt),
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${promotionName} was saved in standalone promotions.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneProduct(
    input: StoreStandaloneProductInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const productCode = normalizeSetupCode(input.productCode, "Product code");
    const productName = normalizeSetupName(input.productName, "Product name");
    const taxProfileCode = optionalSetupText(input.taxProfileCode)?.toUpperCase() ?? null;
    const standaloneQuantity =
      input.quantityOnHand == null
        ? null
        : normalizeSetupNumber(input.quantityOnHand, 0, 3);
    const taxProfile = taxProfileCode
      ? (
          await this.pool.query<{
            tax_profile_name: string;
            rate_percent: string | number;
            is_tax_inclusive: string | number;
          }>(
            "SELECT tax_profile_name, rate_percent, is_tax_inclusive FROM tax_profile_snapshot WHERE tax_profile_code = $1 LIMIT 1",
            [taxProfileCode],
          )
        ).rows[0] ?? null
      : null;
    const barcode = optionalSetupText(input.barcode);
    const baseUnitOfMeasure =
      optionalSetupText(input.unitOfMeasure)?.toUpperCase() ?? "EA";
    const sellingUnits = normalizePosSellingUnits({
      baseUnitOfMeasure,
      serialized: input.isSerialized === true,
      sellingUnits: input.sellingUnits?.map((unit) => ({
        ...unit,
        unitOfMeasureName:
          unit.unitOfMeasureName?.trim() || unit.unitOfMeasureCode,
        isDefault: unit.isDefault === true,
        allowFractionalSale: unit.allowFractionalSale === true,
        decimalPrecision: unit.decimalPrecision ?? 0,
      })),
    });
    const productEvent = await this.buildLocalPublication<EnterpriseCatalogProductPublishedPayload>(
      "product",
      `standalone-product-${productCode.toLowerCase()}`,
      "catalog.product.published",
      {
        storeCode: await this.getStoreCode(),
        productCode,
        productName,
        sku: null,
        shortName: optionalSetupText(input.shortName),
        description: optionalSetupText(input.description),
        productType: "STOCK",
        department: optionalSetupText(input.departmentCode)?.toUpperCase() ?? null,
        category: optionalSetupText(input.categoryCode)?.toUpperCase() ?? null,
        subcategory: optionalSetupText(input.subcategory),
        brand: null,
        seasonCode: null,
        unitOfMeasure: baseUnitOfMeasure,
        baseUnitOfMeasure,
        sellingUnits: sellingUnits.map((unit) => ({
          productVariantCode: null,
          uomCode: unit.unitOfMeasureCode,
          uomName: unit.unitOfMeasureName,
          conversionFactor: unit.conversionFactor,
          unitPrice: unit.unitPrice,
          barcode: unit.barcode ?? null,
          isDefault: unit.isDefault === true,
          allowFractionalSale: unit.allowFractionalSale === true,
          decimalPrecision: unit.decimalPrecision ?? 0,
        })),
        packSize: null,
        countryOfOrigin: null,
        primaryImageUrl: optionalSetupText(input.primaryImageUrl),
        notes: null,
        taxable: input.taxable !== false,
        taxProfileCode,
        taxProfileName: taxProfile?.tax_profile_name ?? null,
        taxRatePercent:
          taxProfile?.rate_percent === undefined ? null : asNumber(taxProfile.rate_percent),
        taxInclusive: taxProfile ? asBooleanFlag(taxProfile.is_tax_inclusive) : false,
        trackInventory: input.trackInventory !== false,
        trackExpiry: input.trackExpiry === true,
        isSerialized: input.isSerialized === true,
        trackSize: input.trackSize === true,
        trackColor: input.trackColor === true,
        allowPriceOverride: true,
        mustEnterPriceAtPos: input.mustEnterPriceAtPos === true,
        minStockLevel:
          input.minStockLevel == null
            ? null
            : normalizeSetupNumber(input.minStockLevel, 0, 3),
        reorderPoint:
          input.reorderPoint == null
            ? null
            : normalizeSetupNumber(input.reorderPoint, 0, 3),
        reorderQuantity: null,
        safetyStockLevel:
          input.safetyStockLevel == null
            ? null
            : normalizeSetupNumber(input.safetyStockLevel, 0, 3),
        shelfLifeDays:
          input.shelfLifeDays == null
            ? null
            : Math.trunc(normalizeSetupNumber(input.shelfLifeDays, 0, 0)),
        weightKg: null,
        volumeLitres: null,
        unitPrice: normalizeSetupNumber(input.unitPrice, 0, 2),
        quantityOnHand: standaloneQuantity,
        catalogSortOrder:
          input.catalogSortOrder == null
            ? null
            : Math.trunc(normalizeSetupNumber(input.catalogSortOrder, 0, 0)),
        publishedAt: timestamp,
      },
      timestamp,
    );
    const barcodeEvent = barcode
      ? await this.buildLocalPublication<EnterpriseBarcodePublishedPayload>(
          "barcode",
          `standalone-barcode-${barcode.toLowerCase()}`,
          "catalog.barcode.published",
          {
            storeCode: await this.getStoreCode(),
            productCode,
            barcode,
            barcodeType: "LOCAL",
            publishedAt: timestamp,
          },
          timestamp,
        )
      : null;
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(productEvent, timestamp, client);
      if (barcodeEvent) {
        await this.applyDownstreamPayload(barcodeEvent, timestamp, client);
      }
      if (standaloneQuantity !== null) {
        const salesLocationCode = await this.getDefaultSalesLocationCode();

        if (salesLocationCode) {
          await this.setLocationBalanceQuantity({
            locationCode: salesLocationCode,
            productCode,
            quantity: standaloneQuantity,
            updatedAt: timestamp,
            runner: client,
          });
        }
      }
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${productName} was saved in the standalone product catalog.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneUser(
    input: StoreStandaloneUserInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const loginId = normalizeSetupCode(input.loginId, "Login ID");
    const displayName = normalizeSetupName(input.displayName, "Display name");
    const existingResult = await this.pool.query<{
      id: string;
      password_hash: string | null;
    }>(
      "SELECT id, password_hash FROM retail_user_snapshot WHERE lower(login_id) = lower($1) LIMIT 1",
      [loginId],
    );
    const existing = existingResult.rows[0] ?? null;
    const password = optionalSetupText(input.password);
    const metadata = await this.metadata();
    if (password) {
      validateStandalonePasswordPolicy(
        password,
        this.getPasswordPolicySummary(metadata),
      );
    }
    const passwordHash = password
      ? bcrypt.hashSync(password, 10)
      : (existing?.password_hash ?? null);

    if (!passwordHash) {
      throw new Error("Password is required when creating a standalone operator.");
    }

    const roleName =
      optionalSetupText(input.roleName) ??
      (input.supervisorEligible ? "Standalone manager" : "Standalone cashier");
    const roleCode = roleName.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
    const permissionCodes = standalonePermissionCodes(input);
    const storeCode = await this.getStoreCode();
    const userId = existing?.id ?? `standalone-user-${loginId.toLowerCase()}`;
    const event = await this.buildLocalPublication<EnterpriseRetailUserPublishedPayload>(
      "retailUser",
      userId,
      "security.user.published",
      {
        storeCode,
        userId,
        loginId,
        email: optionalSetupText(input.email),
        displayName,
        accountStatus: optionalSetupText(input.accountStatus)?.toUpperCase() ?? "ACTIVE",
        homeStoreCode: storeCode,
        homeStoreName: metadata.store_name ?? defaultStoreConfig.storeName,
        roleCodes: [roleCode || "STANDALONE-CASHIER"],
        roleNames: [roleName],
        permissionCodes,
        passwordHash,
        passwordUpdatedAt: password ? timestamp : null,
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${displayName} was saved as a standalone operator.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async saveStandaloneCustomer(
    input: StoreStandaloneCustomerInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const customerNo = normalizeSetupCode(input.customerNo, "Customer number");
    const fullName = normalizeSetupName(input.fullName, "Customer name");
    const storeCode = await this.getStoreCode();
    const metadata = await this.metadata();
    const customerId = `standalone-customer-${customerNo.toLowerCase()}`;
    const event = await this.buildLocalPublication<EnterpriseCustomerPublishedPayload>(
      "customer",
      customerId,
      "customer.published",
      {
        storeCode,
        customerId,
        customerNo,
        fullName,
        customerType: optionalSetupText(input.customerType)?.toUpperCase() ?? "RETAIL",
        phone: optionalSetupText(input.phone),
        email: optionalSetupText(input.email),
        addressLine1: null,
        city: null,
        countryCode: null,
        homeStoreCode: storeCode,
        homeStoreName: metadata.store_name ?? defaultStoreConfig.storeName,
        loyaltyEnrolled: false,
        loyaltyTier: null,
        loyaltyPointsBalance: 0,
        allowCreditSales: input.allowCreditSales === true,
        creditLimitAmount:
          input.creditLimitAmount == null
            ? null
            : normalizeSetupNumber(input.creditLimitAmount, 0, 2),
        receivableBalanceAmount: 0,
        note: null,
        status: optionalSetupText(input.status)?.toUpperCase() ?? "ACTIVE",
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${fullName} was saved in standalone customers.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async getOpenShiftRow() {
    const result = await this.pool.query<PosShiftRow>(
      `SELECT
        id,
        shift_no,
        terminal_code,
        cashier_code,
        status,
        opening_float_amount,
        closing_declared_cash,
        closing_variance,
        opened_at,
        closed_at,
        record_version
      FROM pos_shift
      WHERE status = 'OPEN'
        AND terminal_code = $1
      ORDER BY opened_at DESC
      LIMIT 1`,
      [this.getTerminalCode()],
    );

    return result.rows[0] ?? null;
  }

  private async getShiftRows(whereSql = "", params: unknown[] = []) {
    const result = await this.pool.query<PosShiftRow>(
      `SELECT
        id,
        shift_no,
        terminal_code,
        cashier_code,
        status,
        opening_float_amount,
        closing_declared_cash,
        closing_variance,
        opened_at,
        closed_at,
        record_version
      FROM pos_shift
      ${whereSql}
      ORDER BY opened_at DESC
      LIMIT 20`,
      params,
    );

    return result.rows;
  }

  private async getShiftTransactionSummaryRows(shiftId: string) {
    const result = await this.pool.query<{
      transaction_type: SyncPosTransactionType;
      total_amount: string | number;
      change_amount: string | number;
      has_cash_payment: string | number;
    }>(
      `SELECT
        txn.transaction_type,
        txn.total_amount,
        txn.change_amount,
        CASE WHEN EXISTS (
          SELECT 1
          FROM pos_payment AS payment
          WHERE payment.pos_transaction_id = txn.id
            AND payment.method = 'CASH'
            AND COALESCE(payment.received_shift_id, txn.shift_id) = txn.shift_id
       ) THEN 1 ELSE 0 END AS has_cash_payment
       FROM pos_transaction AS txn
       WHERE txn.shift_id = $1
         AND txn.status = 'COMPLETED'
       ORDER BY txn.completed_at ASC, txn.transaction_no ASC`,
      [shiftId],
    );

    return result.rows;
  }

  private async getShiftPaymentSummaryRows(shiftId: string) {
    const result = await this.pool.query<{
      transaction_type: SyncPosTransactionType;
      method: SyncPaymentMethod;
      tender_method_code: string | null;
      tender_method_name: string | null;
      amount: string | number;
      total_amount: string | number;
    }>(
      `SELECT
        txn.transaction_type,
        payment.method,
        payment.tender_method_code,
        payment.tender_method_name,
        payment.amount,
        txn.total_amount
       FROM pos_payment AS payment
       INNER JOIN pos_transaction AS txn
         ON txn.id = payment.pos_transaction_id
       WHERE payment.received_shift_id = $1
          OR (
            payment.received_shift_id IS NULL
            AND txn.shift_id = $1
            AND txn.status = 'COMPLETED'
          )
       ORDER BY payment.received_at ASC, payment.id ASC`,
      [shiftId],
    );

    return result.rows;
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
    let salesCount = 0;
    let returnCount = 0;
    let exchangeCount = 0;

    for (const transaction of transactionRows) {
      const totalAmount = Number(asNumber(transaction.total_amount).toFixed(2));
      const isRefundSettlement =
        transaction.transaction_type === "RETURN" ||
        (transaction.transaction_type === "EXCHANGE" && totalAmount < 0);

      netSalesAmount = Number(
        (
          netSalesAmount +
          (transaction.transaction_type === "RETURN"
            ? -Math.abs(totalAmount)
            : totalAmount)
        ).toFixed(2),
      );

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
      accountPaymentsAmount: 0,
      openedAt: shift.opened_at,
      closedAt: shift.closed_at,
      tenderTotals: [...tenderTotalsByKey.values()].sort((left, right) =>
        left.method.localeCompare(right.method),
      ),
    };
  }

  private async getDefaultSalesLocationCode() {
    const result = await this.pool.query<{ location_code: string }>(
      `SELECT location_code
       FROM inventory_location_snapshot
       WHERE is_sales_default = 1
       ORDER BY updated_at ASC
       LIMIT 1`,
    );

    return result.rows[0]?.location_code ?? null;
  }

  private async getDefaultSalesOrderLocationCode() {
    const result = await this.pool.query<{ location_code: string }>(
      `SELECT location_code
       FROM inventory_location_snapshot
       WHERE is_sales_order_default = 1
       ORDER BY updated_at ASC
       LIMIT 1`,
    );

    return result.rows[0]?.location_code ?? (await this.getDefaultSalesLocationCode());
  }

  private async getOptionalLocationQuantity(
    locationCode: string,
    productCode: string,
  ) {
    const result = await this.pool.query<{ value: string | number }>(
      `SELECT quantity_on_hand AS value
       FROM inventory_location_balance
       WHERE location_code = $1
         AND product_code = $2
       LIMIT 1`,
      [locationCode, productCode],
    );

    return result.rows[0] ? asNumber(result.rows[0].value) : null;
  }

  private async getLocationQuantity(
    locationCode: string,
    productCode: string,
    runner: DbRunner = this.pool,
  ) {
    const result = await runner.query<{ value: string | number }>(
      `SELECT quantity_on_hand AS value
       FROM inventory_location_balance
       WHERE location_code = $1
         AND product_code = $2
       LIMIT 1`,
      [locationCode, productCode],
    );

    return Number(asNumber(result.rows[0]?.value).toFixed(3));
  }

  private async hasLocationBalance(
    locationCode: string,
    productCode: string,
    runner: DbRunner = this.pool,
  ) {
    const result = await runner.query<{ value: string | number }>(
      `SELECT count(*) AS value
       FROM inventory_location_balance
       WHERE location_code = $1
         AND product_code = $2`,
      [locationCode, productCode],
    );

    return Math.trunc(asNumber(result.rows[0]?.value)) > 0;
  }

  private async setLocationBalanceQuantity(input: {
    locationCode: string;
    productCode: string;
    quantity: number;
    updatedAt: string;
    runner?: DbRunner;
  }) {
    const runner = input.runner ?? this.pool;

    await runner.query(
      `INSERT INTO inventory_location_balance (
        location_code,
        product_code,
        quantity_on_hand,
        updated_at
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (location_code, product_code) DO UPDATE SET
        quantity_on_hand = excluded.quantity_on_hand,
        updated_at = excluded.updated_at`,
      [
        input.locationCode,
        input.productCode,
        Number(Number(input.quantity).toFixed(3)),
        input.updatedAt,
      ],
    );
  }

  private async applyLocationBalanceDelta(input: {
    locationCode: string;
    productCode: string;
    delta: number;
    updatedAt: string;
    runner?: DbRunner;
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
    runner: DbRunner = this.pool,
  ) {
    const result = await runner.query<SerialRegistryRow>(
      `SELECT
        id,
        product_code,
        serial_number,
        inventory_location_code,
        status,
        source_transaction_id,
        source_transaction_no,
        updated_at
       FROM serial_registry
       WHERE product_code = $1
         AND upper(serial_number) = upper($2)
       LIMIT 1`,
      [productCode, serialNumber],
    );

    return result.rows[0] ?? null;
  }

  private async upsertSerialRegistryEntry(input: {
    productCode: string;
    serialNumber: string;
    inventoryLocationCode: string | null;
    status: StoreSerialRegistryStatus;
    sourceTransactionId: string | null;
    sourceTransactionNo: string | null;
    updatedAt: string;
    runner?: DbRunner;
  }) {
    const runner = input.runner ?? this.pool;

    await runner.query(
      `INSERT INTO serial_registry (
        id,
        product_code,
        serial_number,
        inventory_location_code,
        status,
        source_transaction_id,
        source_transaction_no,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (product_code, serial_number) DO UPDATE SET
        inventory_location_code = excluded.inventory_location_code,
        status = excluded.status,
        source_transaction_id = excluded.source_transaction_id,
        source_transaction_no = excluded.source_transaction_no,
        updated_at = excluded.updated_at`,
      [
        randomUUID(),
        input.productCode,
        input.serialNumber,
        input.inventoryLocationCode,
        input.status,
        input.sourceTransactionId,
        input.sourceTransactionNo,
        input.updatedAt,
      ],
    );
  }

  private async listAvailableRegistrySerialNumbers(
    productCode: string,
    locationCode: string,
    runner: DbRunner = this.pool,
  ) {
    const result = await runner.query<{ serial_number: string }>(
      `SELECT serial_number
       FROM serial_registry
       WHERE product_code = $1
         AND inventory_location_code = $2
         AND status = 'AVAILABLE'
       ORDER BY serial_number ASC`,
      [productCode, locationCode],
    );

    return result.rows.map((row) => row.serial_number);
  }

  private async ensureInventoryTaskSerialNumbersNotReserved(
    productCode: string,
    productName: string,
    serialNumbers: string[],
    runner: DbRunner = this.pool,
  ) {
    if (serialNumbers.length === 0) {
      return;
    }

    const result = await runner.query<{
      serial_number: string;
      status: StoreSerialRegistryStatus;
    }>(
      `SELECT serial_number, status
       FROM serial_registry
       WHERE product_code = $1
         AND upper(serial_number) = ANY($2::text[])
         AND status = 'IN_TRANSIT'`,
      [
        productCode,
        serialNumbers.map((serialNumber) => serialNumber.toUpperCase()),
      ],
    );

    if (result.rows.length > 0) {
      throw new Error(
        `Flash ERP cannot use serial number(s) ${result.rows.map((row) => row.serial_number).join(", ")} for ${productName} because they are already reserved in another local inventory task.`,
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
    runner?: DbRunner;
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
    runner?: DbRunner;
  }) {
    const runner = input.runner ?? this.pool;
    const productResult = await runner.query<ProductRow>(
      `SELECT
        id,
        product_code,
        product_name,
        product_type,
        short_name,
        description,
        primary_image_url,
        department_code,
        category_code,
        subcategory,
        unit_of_measure,
        taxable,
        tax_profile_code,
        tax_profile_name,
        tax_rate_percent,
        tax_inclusive,
        track_inventory,
        track_expiry,
        shelf_life_days,
        is_serialized,
        must_enter_price_at_pos,
        min_stock_level,
        reorder_point,
        safety_stock_level,
        unit_price,
        quantity_on_hand,
        updated_at
       FROM product_snapshot
       WHERE product_code = $1
       LIMIT 1`,
      [input.productCode],
    );
    const product = productResult.rows[0] ?? null;

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

    await runner.query(
      "UPDATE product_snapshot SET quantity_on_hand = quantity_on_hand + $1, updated_at = $2 WHERE id = $3",
      [varianceQuantity, input.updatedAt, product.id],
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
    const result = await this.pool.query<{
      barcode_code: string;
      barcode_type: string;
    }>(
      `SELECT barcode_code, barcode_type
       FROM barcode_snapshot
       WHERE product_code = $1
       ORDER BY
         CASE barcode_type
           WHEN 'EAN13' THEN 0
           WHEN 'UPC' THEN 1
           ELSE 2
         END,
         barcode_code ASC
       LIMIT 1`,
      [productCode],
    );

    return result.rows[0] ?? null;
  }

  private async getProductByCode(
    productCode: string,
    runner: DbRunner = this.pool,
  ) {
    const result = await runner.query<ProductRow>(
      `SELECT
        id,
        product_code,
        product_name,
        short_name,
        description,
        primary_image_url,
        department_code,
        category_code,
        subcategory,
        unit_of_measure,
        taxable,
        tax_profile_code,
        tax_profile_name,
        tax_rate_percent,
        tax_inclusive,
        track_inventory,
        track_expiry,
        shelf_life_days,
        is_serialized,
        must_enter_price_at_pos,
        unit_price,
        quantity_on_hand,
        updated_at
       FROM product_snapshot
       WHERE product_code = $1
       LIMIT 1`,
      [productCode.trim().toUpperCase()],
    );

    return result.rows[0] ?? null;
  }

  private async listAvailableSaleSerialNumbers(
    productCode: string,
    locationCode: string | null,
  ) {
    const params: unknown[] = [productCode];
    const locationSql = locationCode
      ? "AND (inventory_location_code = $2 OR inventory_location_code IS NULL)"
      : "";

    if (locationCode) {
      params.push(locationCode);
    }

    const result = await this.pool.query<{ serial_number: string }>(
      `SELECT serial_number
       FROM serial_registry
       WHERE product_code = $1
         AND status = 'AVAILABLE'
         ${locationSql}
       ORDER BY serial_number ASC`,
      params,
    );

    return result.rows.map((row) => row.serial_number);
  }

  private async findCatalogLookup(query: string) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return null;
    }

    const normalizedVariantLookup = normalizedQuery.toUpperCase();
    const variantMatch = await this.pool.query<CatalogLookupRow>(
      `SELECT
        product.id,
        product.product_code,
        product.product_name,
        product.product_type,
        product.short_name,
        product.description,
        product.primary_image_url,
        product.department_code,
        product.category_code,
        product.subcategory,
        product.unit_of_measure,
        product.base_unit_of_measure,
        product.uom_conversions_json,
        product.selling_units_json,
        product.taxable,
        product.tax_profile_code,
        product.tax_profile_name,
        product.tax_rate_percent,
        product.tax_inclusive,
        product.track_inventory,
        product.is_serialized,
        product.track_size,
        product.track_color,
        product.must_enter_price_at_pos,
        product.min_stock_level,
        product.reorder_point,
        product.safety_stock_level,
        product.catalog_sort_order,
        variant.unit_price,
        variant.quantity_on_hand,
        product.updated_at,
        variant.barcode AS barcode_code,
        'MATRIX_VARIANT'::text AS barcode_type,
        'productCode' AS matched_on,
        variant.variant_code AS product_variant_code,
        NULL::text AS sales_location_code,
        NULL::numeric AS sales_location_quantity
       FROM product_variant_snapshot AS variant
       INNER JOIN product_snapshot AS product
         ON product.product_code = variant.product_code
       WHERE (
           upper(variant.variant_code) = $1
           OR upper(COALESCE(variant.sku, '')) = $1
           OR variant.barcode = $2
         )
         AND variant.status = 'ACTIVE'
         AND COALESCE(product.catalog_membership_active, 1) = 1
       LIMIT 1`,
      [normalizedVariantLookup, normalizedQuery],
    );
    const variantRow = variantMatch.rows[0] ?? null;

    if (variantRow) {
      return variantRow;
    }

    const barcodeMatch = await this.pool.query<CatalogLookupRow>(
      `SELECT
        product.id,
        product.product_code,
        product.product_name,
        product.product_type,
        product.short_name,
        product.description,
        product.primary_image_url,
        product.department_code,
        product.category_code,
        product.subcategory,
        product.unit_of_measure,
        product.base_unit_of_measure,
        product.uom_conversions_json,
        product.selling_units_json,
        product.taxable,
        product.tax_profile_code,
        product.tax_profile_name,
        product.tax_rate_percent,
        product.tax_inclusive,
        product.track_inventory,
        product.is_serialized,
        product.track_size,
        product.track_color,
        product.must_enter_price_at_pos,
        product.min_stock_level,
        product.reorder_point,
        product.safety_stock_level,
        product.catalog_sort_order,
        product.unit_price,
        product.quantity_on_hand,
        product.updated_at,
        barcode.barcode_code,
        barcode.barcode_type,
        'barcode' AS matched_on,
        NULL::text AS product_variant_code,
        NULL::text AS sales_location_code,
        NULL::numeric AS sales_location_quantity
       FROM barcode_snapshot AS barcode
       INNER JOIN product_snapshot AS product
         ON product.product_code = barcode.product_code
       WHERE barcode.barcode_code = $1
         AND COALESCE(product.catalog_membership_active, 1) = 1
       LIMIT 1`,
      [normalizedQuery],
    );
    const barcodeRow = barcodeMatch.rows[0] ?? null;

    if (barcodeRow) {
      const salesLocationCode = await this.getDefaultSalesLocationCode();
      return {
        ...barcodeRow,
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

    const productMatch = await this.pool.query<ProductRow>(
      `SELECT
        id,
        product_code,
        product_name,
        product_type,
        short_name,
        description,
        primary_image_url,
        department_code,
        category_code,
        subcategory,
        unit_of_measure,
        base_unit_of_measure,
        uom_conversions_json,
        selling_units_json,
        taxable,
        tax_profile_code,
        tax_profile_name,
        tax_rate_percent,
        tax_inclusive,
        track_inventory,
        track_expiry,
        shelf_life_days,
        is_serialized,
        track_size,
        track_color,
        must_enter_price_at_pos,
        unit_price,
        quantity_on_hand,
        updated_at
       FROM product_snapshot
       WHERE product_code = $1
         AND COALESCE(catalog_membership_active, 1) = 1
       LIMIT 1`,
      [normalizedQuery.toUpperCase()],
    );
    const productRow = productMatch.rows[0] ?? null;

    if (!productRow) {
      return null;
    }

    const barcode = await this.getRepresentativeBarcode(
      productRow.product_code,
    );
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
    const configuredSellingUnits = parseProductSellingUnits(
      match.selling_units_json,
    );
    const variantCode = match.product_variant_code?.trim().toUpperCase() ?? null;
    const scopedSellingUnits = configuredSellingUnits.filter(
      (unit) =>
        (unit.productVariantCode?.trim().toUpperCase() ?? null) === variantCode,
    );
    const barcodeSellingUnit = match.barcode_type?.startsWith("SELLING_UOM:")
      ? match.barcode_type.slice("SELLING_UOM:".length)
      : null;
    const selectedSellingUom = resolvePosSellingUom({
      baseUnitOfMeasure: match.base_unit_of_measure,
      baseUnitPrice: asNumber(match.unit_price),
      quantity: 1,
      selectedUnitOfMeasure: barcodeSellingUnit,
      scannedBarcode: match.matched_on === "barcode" ? match.barcode_code : null,
      sellingUnits: scopedSellingUnits,
      serialized: asBooleanFlag(match.is_serialized),
    });
    const [department, category, availableSerialNumbers, availableBatches] = await Promise.all([
      match.department_code
        ? this.pool.query<{ department_name: string }>(
            "SELECT department_name FROM product_department_snapshot WHERE department_code = $1 LIMIT 1",
            [match.department_code],
          )
        : Promise.resolve({ rows: [] as Array<{ department_name: string }> }),
      match.category_code
        ? this.pool.query<{ category_name: string }>(
            "SELECT category_name FROM product_category_snapshot WHERE category_code = $1 LIMIT 1",
            [match.category_code],
          )
        : Promise.resolve({ rows: [] as Array<{ category_name: string }> }),
      asBooleanFlag(match.is_serialized)
        ? this.listAvailableSaleSerialNumbers(
            match.product_code,
            match.sales_location_code,
          )
        : Promise.resolve([] as string[]),
      asBooleanFlag(match.track_expiry) && match.sales_location_code
        ? this.pool.query<{
            id: string;
            batch_no: string;
            manufactured_at: string | null;
            expiry_date: string;
            quantity_on_hand: string | number;
            status: string;
          }>(
            `SELECT id, batch_no, manufactured_at, expiry_date, quantity_on_hand, status
             FROM inventory_batch_registry
             WHERE inventory_location_code = $1
               AND product_code = $2
               AND quantity_on_hand > 0
               AND status = 'ACTIVE'
               AND expiry_date >= CURRENT_DATE::text
             ORDER BY expiry_date ASC, manufactured_at ASC, batch_no ASC`,
            [match.sales_location_code, match.product_code],
          )
        : Promise.resolve({
            rows: [] as Array<{
              id: string;
              batch_no: string;
              manufactured_at: string | null;
              expiry_date: string;
              quantity_on_hand: string | number;
              status: string;
            }>,
          }),
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
      departmentName: department.rows[0]?.department_name ?? null,
      categoryCode: match.category_code,
      categoryName: category.rows[0]?.category_name ?? null,
      subcategory: match.subcategory,
      isSerialized: asBooleanFlag(match.is_serialized),
      trackExpiry: asBooleanFlag(match.track_expiry),
      trackSize: asBooleanFlag(match.track_size),
      trackColor: asBooleanFlag(match.track_color),
      mustEnterPriceAtPos: asBooleanFlag(match.must_enter_price_at_pos),
      availableSerialNumbers,
      availableBatches: availableBatches.rows.map((batch) => ({
        batchId: batch.id,
        batchNo: batch.batch_no,
        manufacturedAt: batch.manufactured_at,
        expiryDate: batch.expiry_date,
        quantityOnHand: Number(asNumber(batch.quantity_on_hand).toFixed(3)),
        status: batch.status,
      })),
      sellingUnits: configuredSellingUnits,
      selectedSellingUnitOfMeasure:
        selectedSellingUom.sellingUnitOfMeasure,
      unitPrice: Number(asNumber(selectedSellingUom.unitPrice).toFixed(2)),
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
    const result = await this.pool.query<ProductVariantSnapshotRow>(
      `SELECT id, product_code, variant_code, sku, display_name, unit_price, quantity_on_hand, barcode, status, attributes_json, updated_at
       FROM product_variant_snapshot
       WHERE product_code = $1
         AND status = 'ACTIVE'
       ORDER BY variant_code ASC`,
      [productCode],
    );

    return result.rows.map((row) => this.toCatalogMatrixVariant(row));
  }

  private async getMatrixVariantByCode(productCode: string, variantCode: string) {
    const result = await this.pool.query<ProductVariantSnapshotRow>(
      `SELECT id, product_code, variant_code, sku, display_name, unit_price, quantity_on_hand, barcode, status, attributes_json, updated_at
       FROM product_variant_snapshot
       WHERE product_code = $1
         AND variant_code = $2
       LIMIT 1`,
      [productCode, variantCode],
    );

    return result.rows[0] ?? null;
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
    const normalizedDepartmentCode = normalizeCatalogCode(
      input?.departmentCode,
    );
    const normalizedCategoryCode = normalizeCatalogCode(input?.categoryCode);
    const serializedOnly = input?.serializedOnly === true;
    const sellableOnly = input?.sellableOnly === true;
    const limit = Math.min(Math.max(input?.limit ?? 12, 1), 30);
    const salesLocationCode = await this.getDefaultSalesLocationCode();
    const result = await this.pool.query<
      ProductRow & {
        department_name: string | null;
        category_name: string | null;
        barcode_code: string | null;
        sales_location_quantity: string | number | null;
      }
    >(
      `SELECT
        product.id,
        product.product_code,
        product.product_name,
        product.product_type,
        product.short_name,
        product.description,
        product.primary_image_url,
        product.department_code,
        product.category_code,
        product.subcategory,
        product.unit_of_measure,
        product.base_unit_of_measure,
        product.uom_conversions_json,
        product.selling_units_json,
        product.taxable,
        product.tax_profile_code,
        product.tax_profile_name,
        product.tax_rate_percent,
        product.tax_inclusive,
        product.track_inventory,
        product.is_serialized,
        product.track_size,
        product.track_color,
        product.must_enter_price_at_pos,
        product.min_stock_level,
        product.reorder_point,
        product.safety_stock_level,
        product.catalog_sort_order,
        product.unit_price,
        product.quantity_on_hand,
        product.updated_at,
        department.department_name,
        category.category_name,
        barcode.barcode_code,
        balance.quantity_on_hand AS sales_location_quantity
       FROM product_snapshot AS product
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = product.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = product.category_code
       LEFT JOIN LATERAL (
         SELECT barcode_code
         FROM barcode_snapshot
         WHERE product_code = product.product_code
         ORDER BY barcode_code ASC
         LIMIT 1
       ) AS barcode ON true
       LEFT JOIN inventory_location_balance AS balance
         ON balance.product_code = product.product_code
        AND balance.location_code = $1
       WHERE COALESCE(product.catalog_membership_active, 1) = 1
       ORDER BY COALESCE(product.catalog_sort_order, 2147483647), product.product_name ASC`,
      [salesLocationCode],
    );

    const filteredRows = result.rows
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
          baseUnitOfMeasure: row.base_unit_of_measure,
          uomConversions: parseProductUomConversions(
            row.uom_conversions_json,
            row.base_unit_of_measure,
          ),
          sellingUnits: parseProductSellingUnits(row.selling_units_json),
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
    const result = await this.pool.query<CustomerRow>(
      `SELECT
        id,
        customer_no,
        full_name,
        customer_type,
        phone,
        email,
        home_store_code,
        home_store_name,
        city,
        country_code,
        loyalty_enrolled,
        loyalty_tier,
        loyalty_points_balance,
        allow_credit_sales,
        credit_limit_amount,
        receivable_balance_amount,
        note,
        status,
        updated_at
       FROM customer
       WHERE deleted_at IS NULL
       ORDER BY full_name ASC, customer_no ASC`,
    );

    return result.rows
      .filter((row) => {
        if (!normalizedQuery) {
          return true;
        }

        const haystacks = [
          row.customer_no,
          row.full_name,
          row.customer_type,
          row.phone,
          row.email,
          row.home_store_name,
          row.city,
          row.country_code,
          row.loyalty_tier,
          row.status,
        ];

        return haystacks.some((value) =>
          value?.toUpperCase().includes(normalizedQuery),
        );
      })
      .slice(0, limit)
      .map<StoreCustomerSummary>((row) => ({
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
        loyaltyEnrolled: hasLocalLoyaltyAccount(row),
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
    const result = await this.pool.query<{
      id: string;
      reference_value: string;
      normalized_reference: string;
      details: string | null;
      first_transaction_no: string | null;
      last_transaction_no: string | null;
      use_count: string | number;
      first_seen_at: string;
      last_seen_at: string;
      updated_at: string;
    }>(
      `SELECT
        id,
        reference_value,
        normalized_reference,
        details,
        first_transaction_no,
        last_transaction_no,
        use_count,
        first_seen_at,
        last_seen_at,
        updated_at
       FROM transaction_reference_capture
       WHERE $1 = ''
          OR UPPER(reference_value) LIKE $2
          OR normalized_reference LIKE $3
          OR UPPER(COALESCE(details, '')) LIKE $2
       ORDER BY last_seen_at DESC, use_count DESC, reference_value ASC
       LIMIT $4`,
      [
        normalizedQuery,
        `%${normalizedQuery}%`,
        `%${normalizedReferenceQuery}%`,
        limit,
      ],
    );

    return result.rows.map((row) => ({
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
    runner: pg.PoolClient,
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

    await runner.query(
      `INSERT INTO transaction_reference_capture (
        id,
        reference_value,
        normalized_reference,
        details,
        first_transaction_no,
        last_transaction_no,
        use_count,
        first_seen_at,
        last_seen_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $5, 1, $6, $6, $6)
      ON CONFLICT (normalized_reference) DO UPDATE SET
        reference_value = excluded.reference_value,
        details = CASE
          WHEN excluded.details IS NULL OR excluded.details = ''
          THEN transaction_reference_capture.details
          ELSE excluded.details
        END,
        last_transaction_no = excluded.last_transaction_no,
        use_count = transaction_reference_capture.use_count + 1,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`,
      [
        randomUUID(),
        reference,
        normalizedReference,
        details,
        transactionNo,
        input.capturedAt,
      ],
    );
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

    const salesWhere = ["txn.status = 'COMPLETED'"];
    const salesParams: unknown[] = [];

    if (dateFrom) {
      salesWhere.push(
        `txn.completed_at >= ${pushPgParam(salesParams, dateFrom)}`,
      );
    }

    if (dateTo) {
      salesWhere.push(
        `txn.completed_at <= ${pushPgParam(salesParams, dateTo)}`,
      );
    }

    if (cashierCode) {
      salesWhere.push(
        `COALESCE(txn.cashier_code, shift.cashier_code) = ${pushPgParam(salesParams, cashierCode)}`,
      );
    }

    if (shiftId) {
      salesWhere.push(`txn.shift_id = ${pushPgParam(salesParams, shiftId)}`);
    }

    if (customerQuery) {
      const customerNoParam = pushPgParam(salesParams, `%${customerQuery}%`);
      const customerNameParam = pushPgParam(salesParams, `%${customerQuery}%`);

      salesWhere.push(
        `(UPPER(COALESCE(customer.customer_no, '')) LIKE ${customerNoParam} OR UPPER(COALESCE(customer.full_name, '')) LIKE ${customerNameParam})`,
      );
    }

    if (productQuery) {
      const productCodeParam = pushPgParam(salesParams, `%${productQuery}%`);
      const productNameParam = pushPgParam(salesParams, `%${productQuery}%`);

      salesWhere.push(
        `EXISTS (
          SELECT 1
          FROM pos_transaction_line AS line_filter
          WHERE line_filter.pos_transaction_id = txn.id
            AND (
              UPPER(line_filter.product_code_snapshot) LIKE ${productCodeParam}
              OR UPPER(line_filter.product_name_snapshot) LIKE ${productNameParam}
            )
        )`,
      );
    }

    const salesLimitParams = [...salesParams, limit];
    const salesResult = await this.pool.query<ReportSalesRow>(
      `SELECT
        txn.transaction_no,
        txn.transaction_type,
        txn.source_transaction_no,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.completed_at,
        customer.customer_no,
        customer.full_name AS customer_name,
        COALESCE(txn.cashier_code, shift.cashier_code) AS cashier_code,
        COUNT(line.id) AS line_count,
        string_agg(line.product_name_snapshot, ', ' ORDER BY line.product_name_snapshot) AS product_preview
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       LEFT JOIN pos_transaction_line AS line
         ON line.pos_transaction_id = txn.id
       WHERE ${salesWhere.join(" AND ")}
       GROUP BY
        txn.id,
        txn.transaction_no,
        txn.transaction_type,
        txn.source_transaction_no,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.completed_at,
        customer.customer_no,
        customer.full_name,
        COALESCE(txn.cashier_code, shift.cashier_code)
       ORDER BY txn.completed_at DESC, txn.transaction_no DESC
       LIMIT $${salesLimitParams.length}`,
      salesLimitParams,
    );

    const tenderWhere = ["1 = 1"];
    const tenderParams: unknown[] = [];

    if (dateFrom) {
      tenderWhere.push(
        `payment.received_at >= ${pushPgParam(tenderParams, dateFrom)}`,
      );
    }

    if (dateTo) {
      tenderWhere.push(
        `payment.received_at <= ${pushPgParam(tenderParams, dateTo)}`,
      );
    }

    if (cashierCode) {
      tenderWhere.push(
        `COALESCE(payment.received_cashier_code, txn.cashier_code, shift.cashier_code) = ${pushPgParam(tenderParams, cashierCode)}`,
      );
    }

    if (shiftId) {
      tenderWhere.push(
        `COALESCE(payment.received_shift_id, txn.shift_id) = ${pushPgParam(tenderParams, shiftId)}`,
      );
    }

    if (customerQuery) {
      const customerNoParam = pushPgParam(tenderParams, `%${customerQuery}%`);
      const customerNameParam = pushPgParam(tenderParams, `%${customerQuery}%`);
      tenderWhere.push(
        `(UPPER(COALESCE(customer.customer_no, '')) LIKE ${customerNoParam} OR UPPER(COALESCE(customer.full_name, '')) LIKE ${customerNameParam})`,
      );
    }

    if (productQuery) {
      const productCodeParam = pushPgParam(tenderParams, `%${productQuery}%`);
      const productNameParam = pushPgParam(tenderParams, `%${productQuery}%`);
      tenderWhere.push(
        `EXISTS (
          SELECT 1
          FROM pos_transaction_line AS line_filter
          WHERE line_filter.pos_transaction_id = txn.id
            AND (
              UPPER(line_filter.product_code_snapshot) LIKE ${productCodeParam}
              OR UPPER(line_filter.product_name_snapshot) LIKE ${productNameParam}
            )
        )`,
      );
    }

    const tenderLimitParams = [...tenderParams, limit];
    const tenderResult = await this.pool.query<ReportTenderRow>(
      `SELECT
        payment.id AS payment_id,
        txn.transaction_no,
        txn.transaction_type,
        txn.source_transaction_no,
        sales_order.order_no AS sales_order_no,
        payment.received_at AS occurred_at,
        COALESCE(payment.received_cashier_code, txn.cashier_code, shift.cashier_code) AS cashier_code,
        COALESCE(payment.received_terminal_code, shift.terminal_code) AS terminal_code,
        COALESCE(payment.received_shift_no, shift.shift_no) AS shift_no,
        customer.customer_no,
        customer.full_name AS customer_name,
        payment.method,
        payment.tender_method_code,
        payment.tender_method_name,
        payment.payment_purpose,
        payment.reference,
        CASE
          WHEN txn.transaction_type = 'RETURN'
            OR (txn.transaction_type = 'EXCHANGE' AND COALESCE(txn.total_amount, 0) < 0)
          THEN payment.amount * -1
          ELSE payment.amount
        END AS amount
       FROM pos_payment AS payment
       INNER JOIN pos_transaction AS txn
         ON txn.id = payment.pos_transaction_id
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = COALESCE(payment.received_shift_id, txn.shift_id)
       LEFT JOIN sales_order
         ON sales_order.source_transaction_id = txn.id
         OR sales_order.fulfilled_transaction_id = txn.id
       WHERE ${tenderWhere.join(" AND ")}
       ORDER BY payment.received_at DESC, txn.transaction_no DESC, payment.id DESC
       LIMIT $${tenderLimitParams.length}`,
      tenderLimitParams,
    );

    const accountWhere = ["1 = 1"];
    const accountParams: unknown[] = [];

    if (dateFrom) {
      accountWhere.push(
        `entry.occurred_at >= ${pushPgParam(accountParams, dateFrom)}`,
      );
    }

    if (dateTo) {
      accountWhere.push(
        `entry.occurred_at <= ${pushPgParam(accountParams, dateTo)}`,
      );
    }

    if (cashierCode) {
      accountWhere.push(
        `entry.cashier_code = ${pushPgParam(accountParams, cashierCode)}`,
      );
    }

    if (shiftId) {
      accountWhere.push(
        `entry.shift_id = ${pushPgParam(accountParams, shiftId)}`,
      );
    }

    if (customerQuery) {
      const accountCustomerNoParam = pushPgParam(
        accountParams,
        `%${customerQuery}%`,
      );
      const accountCustomerNameParam = pushPgParam(
        accountParams,
        `%${customerQuery}%`,
      );

      accountWhere.push(
        `(UPPER(entry.customer_no) LIKE ${accountCustomerNoParam} OR UPPER(entry.customer_name) LIKE ${accountCustomerNameParam})`,
      );
    }

    const accountLimitParams = [...accountParams, limit];
    const accountPaymentResult = await this.pool.query<ReportAccountPaymentRow>(
      `SELECT
        entry.entry_no,
        entry.occurred_at,
        entry.cashier_code,
        entry.customer_no,
        entry.customer_name,
        entry.payment_method,
        entry.tender_method_code,
        entry.tender_method_name,
        entry.amount,
        entry.reference
       FROM customer_account_entry AS entry
       WHERE ${accountWhere.join(" AND ")}
       ORDER BY entry.occurred_at DESC, entry.entry_no DESC
       LIMIT $${accountLimitParams.length}`,
      accountLimitParams,
    );

    const productLimitParams = [...salesParams, limit];
    const productResult = await this.pool.query<ReportProductRow>(
      `SELECT
        line.product_code_snapshot AS product_code,
        line.product_name_snapshot AS product_name,
        line.selling_unit_of_measure,
        line.base_unit_of_measure,
        line.uom_conversion_factor,
        SUM(CASE WHEN line.line_intent = 'RETURN' THEN line.quantity * -1 ELSE line.quantity END) AS quantity,
        SUM(CASE
          WHEN line.line_intent = 'RETURN'
            THEN (CASE WHEN line.base_quantity > 0 THEN line.base_quantity ELSE line.quantity END) * -1
          ELSE CASE WHEN line.base_quantity > 0 THEN line.base_quantity ELSE line.quantity END
        END) AS base_quantity,
        SUM(CASE WHEN line.line_intent = 'RETURN' THEN line.unit_price * line.quantity * -1 ELSE line.unit_price * line.quantity END) AS gross_amount,
        SUM(CASE WHEN line.line_intent = 'RETURN' THEN line.discount_amount * -1 ELSE line.discount_amount END) AS discount_amount,
        SUM(CASE WHEN line.line_intent = 'RETURN' THEN line.tax_amount * -1 ELSE line.tax_amount END) AS tax_amount,
        SUM(CASE WHEN line.line_intent = 'RETURN' THEN line.line_total * -1 ELSE line.line_total END) AS net_amount
       FROM pos_transaction_line AS line
       INNER JOIN pos_transaction AS txn
         ON txn.id = line.pos_transaction_id
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       WHERE ${salesWhere.join(" AND ")}
       GROUP BY line.product_code_snapshot, line.product_name_snapshot,
        line.selling_unit_of_measure, line.base_unit_of_measure, line.uom_conversion_factor
       ORDER BY ABS(SUM(CASE WHEN line.line_intent = 'RETURN' THEN line.line_total * -1 ELSE line.line_total END)) DESC,
        line.product_name_snapshot ASC
       LIMIT $${productLimitParams.length}`,
      productLimitParams,
    );

    const serialBatchResult = await this.pool.query<ReportSerialBatchRow>(
      `SELECT
        line.id AS line_id,
        txn.transaction_no,
        txn.completed_at,
        COALESCE(txn.cashier_code, shift.cashier_code) AS cashier_code,
        line.product_code_snapshot AS product_code,
        line.product_name_snapshot AS product_name,
        line.inventory_location_code,
        line.serial_numbers_json,
        line.batch_allocations_json
       FROM pos_transaction_line AS line
       INNER JOIN pos_transaction AS txn
         ON txn.id = line.pos_transaction_id
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       WHERE ${salesWhere.join(" AND ")}
         AND line.line_intent = 'SALE'
         AND (
           COALESCE(NULLIF(BTRIM(line.serial_numbers_json), ''), '[]') <> '[]'
           OR COALESCE(NULLIF(BTRIM(line.batch_allocations_json), ''), '[]') <> '[]'
         )
       ORDER BY txn.completed_at DESC, txn.transaction_no DESC, line.product_name_snapshot ASC
       LIMIT $${salesLimitParams.length}`,
      salesLimitParams,
    );

    const shiftWhere = ["1 = 1"];
    const shiftParams: unknown[] = [];

    if (dateFrom) {
      const openedParam = pushPgParam(shiftParams, dateFrom);
      const closedParam = pushPgParam(shiftParams, dateFrom);

      shiftWhere.push(
        `(shift.opened_at >= ${openedParam} OR shift.closed_at >= ${closedParam})`,
      );
    }

    if (dateTo) {
      const openedParam = pushPgParam(shiftParams, dateTo);
      const closedParam = pushPgParam(shiftParams, dateTo);

      shiftWhere.push(
        `(shift.opened_at <= ${openedParam} OR shift.closed_at <= ${closedParam})`,
      );
    }

    if (cashierCode) {
      shiftWhere.push(
        `shift.cashier_code = ${pushPgParam(shiftParams, cashierCode)}`,
      );
    }

    if (shiftId) {
      shiftWhere.push(`shift.id = ${pushPgParam(shiftParams, shiftId)}`);
    }

    const shiftLimitParams = [...shiftParams, limit];
    const shiftResult = await this.pool.query<PosShiftRow>(
      `SELECT
        id,
        shift_no,
        terminal_code,
        cashier_code,
        status,
        opening_float_amount,
        closing_declared_cash,
        closing_variance,
        opened_at,
        closed_at,
        record_version
       FROM pos_shift AS shift
       WHERE ${shiftWhere.join(" AND ")}
       ORDER BY COALESCE(shift.closed_at, shift.opened_at) DESC, shift.shift_no DESC
       LIMIT $${shiftLimitParams.length}`,
      shiftLimitParams,
    );

    const inventoryWhere = ["COALESCE(balance.quantity_on_hand, 0) != 0"];
    const inventoryParams: unknown[] = [];

    if (productQuery) {
      const inventoryProductCodeParam = pushPgParam(
        inventoryParams,
        `%${productQuery}%`,
      );
      const inventoryProductNameParam = pushPgParam(
        inventoryParams,
        `%${productQuery}%`,
      );

      inventoryWhere.push(
        `(UPPER(product.product_code) LIKE ${inventoryProductCodeParam} OR UPPER(product.product_name) LIKE ${inventoryProductNameParam})`,
      );
    }

    const inventoryLimitParams = [...inventoryParams, limit];
    const inventoryResult = await this.pool.query<ReportInventoryRow>(
      `SELECT
        location.location_code,
        location.location_name,
        product.product_code,
        product.product_name,
        balance.quantity_on_hand,
        product.unit_price,
        balance.updated_at
       FROM inventory_location_balance AS balance
       INNER JOIN inventory_location_snapshot AS location
         ON location.location_code = balance.location_code
       INNER JOIN product_snapshot AS product
         ON product.product_code = balance.product_code
       WHERE ${inventoryWhere.join(" AND ")}
       ORDER BY ABS(balance.quantity_on_hand * product.unit_price) DESC, product.product_name ASC
       LIMIT $${inventoryLimitParams.length}`,
      inventoryLimitParams,
    );

    const bankingWhere = ["1 = 1"];
    const bankingParams: unknown[] = [];

    if (dateFrom) {
      bankingWhere.push(
        `deposit.deposited_at >= ${pushPgParam(bankingParams, dateFrom)}`,
      );
    }

    if (dateTo) {
      bankingWhere.push(
        `deposit.deposited_at <= ${pushPgParam(bankingParams, dateTo)}`,
      );
    }

    if (cashierCode) {
      bankingWhere.push(
        `reconciliation.cashier_code = ${pushPgParam(bankingParams, cashierCode)}`,
      );
    }

    const bankingLimitParams = [...bankingParams, limit];
    const bankingResult = await this.pool.query<ReportBankingRow>(
      `SELECT
        deposit.deposit_no,
        deposit.reconciliation_no,
        deposit.shift_no,
        deposit.deposited_at,
        deposit.operator_name,
        deposit.bank_name,
        deposit.bank_branch_name,
        deposit.bank_account_number,
        deposit.amount,
        deposit.reference
       FROM banking_deposit AS deposit
       LEFT JOIN eod_reconciliation AS reconciliation
         ON reconciliation.id = deposit.reconciliation_id
       WHERE ${bankingWhere.join(" AND ")}
       ORDER BY deposit.deposited_at DESC, deposit.deposit_no DESC
       LIMIT $${bankingLimitParams.length}`,
      bankingLimitParams,
    );

    const mappedSalesRows = salesResult.rows.map<StoreSalesReportRow>(
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
    const mappedTenderRows = tenderResult.rows.map<StoreTenderReportRow>(
      (row) => ({
        paymentId: row.payment_id,
        transactionNo: row.transaction_no,
        transactionType: row.transaction_type,
        sourceTransactionNo: row.source_transaction_no,
        salesOrderNo: row.sales_order_no,
        occurredAt: row.occurred_at,
        cashierCode: row.cashier_code,
        terminalCode: row.terminal_code,
        shiftNo: row.shift_no,
        customerNo: row.customer_no,
        customerName: row.customer_name,
        paymentMethod: row.method,
        tenderMethodCode: row.tender_method_code,
        tenderMethodName: row.tender_method_name,
        paymentPurpose: row.payment_purpose,
        reference: row.reference,
        amount: Number(asNumber(row.amount).toFixed(2)),
      }),
    );
    const mappedAccountPaymentRows =
      accountPaymentResult.rows.map<StoreAccountPaymentReportRow>((row) => ({
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
      productResult.rows.map<StoreProductSalesReportRow>((row) => ({
        productCode: row.product_code,
        productName: row.product_name,
        quantity: Number(asNumber(row.quantity).toFixed(3)),
        sellingUnitOfMeasure: row.selling_unit_of_measure,
        baseQuantity: Number(asNumber(row.base_quantity).toFixed(3)),
        baseUnitOfMeasure: row.base_unit_of_measure,
        uomConversionFactor: Number(
          asNumber(row.uom_conversion_factor).toFixed(6),
        ),
        grossAmount: Number(asNumber(row.gross_amount).toFixed(2)),
        discountAmount: Number(asNumber(row.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(row.tax_amount).toFixed(2)),
        netAmount: Number(asNumber(row.net_amount).toFixed(2)),
      }));
    const shiftSummaries = await Promise.all(
      shiftResult.rows.map((shift) => this.toShiftSummary(shift)),
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
      inventoryResult.rows.map<StoreInventoryReportRow>((row) => {
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
    const mappedSerialBatchRows = serialBatchResult.rows
      .flatMap<StoreSerialBatchSalesReportRow>((row) => [
        ...readSerializedLineNumbers(row.serial_numbers_json).map(
          (serialNumber, index) => ({
            traceId: `${row.line_id}:serial:${index}:${serialNumber}`,
            transactionNo: row.transaction_no,
            completedAt: row.completed_at,
            cashierCode: row.cashier_code,
            productCode: row.product_code,
            productName: row.product_name,
            locationCode: row.inventory_location_code,
            trackingType: "Serial" as const,
            serialNumber,
            batchNo: null,
            expiryDate: null,
            quantity: 1,
          }),
        ),
        ...readInventoryBatchAllocations(row.batch_allocations_json).map(
          (batch, index) => ({
            traceId: `${row.line_id}:batch:${index}:${batch.batchNo}`,
            transactionNo: row.transaction_no,
            completedAt: row.completed_at,
            cashierCode: row.cashier_code,
            productCode: row.product_code,
            productName: row.product_name,
            locationCode: row.inventory_location_code,
            trackingType: "Batch" as const,
            serialNumber: null,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            quantity: batch.quantity,
          }),
        ),
      ])
      .slice(0, limit);
    const mappedBankingRows = bankingResult.rows.map<StoreBankingReportRow>(
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
    const salesOrderParams: unknown[] = [];
    const addSalesOrderParam = (value: unknown) => {
      salesOrderParams.push(value);
      return `$${salesOrderParams.length}`;
    };

    if (dateFrom) {
      salesOrderWhere.push(`sales_order.created_at >= ${addSalesOrderParam(dateFrom)}`);
    }

    if (dateTo) {
      salesOrderWhere.push(`sales_order.created_at <= ${addSalesOrderParam(dateTo)}`);
    }

    if (cashierCode) {
      salesOrderWhere.push(`UPPER(COALESCE(sales_order.operator_name, '')) = ${addSalesOrderParam(cashierCode.toUpperCase())}`);
    }

    if (customerQuery) {
      const customerParam = addSalesOrderParam(`%${customerQuery}%`);
      salesOrderWhere.push(
        `(UPPER(COALESCE(sales_order.customer_no, '')) LIKE ${customerParam} OR UPPER(COALESCE(sales_order.customer_name, '')) LIKE ${customerParam})`,
      );
    }

    if (productQuery) {
      const productParam = addSalesOrderParam(`%${productQuery}%`);
      salesOrderWhere.push(
        `EXISTS (
          SELECT 1
          FROM pos_transaction_line AS order_line
          WHERE order_line.pos_transaction_id = sales_order.source_transaction_id
            AND (
              UPPER(order_line.product_code_snapshot) LIKE ${productParam}
              OR UPPER(order_line.product_name_snapshot) LIKE ${productParam}
            )
        )`,
      );
    }

    const mappedSalesOrderRows = (
      await this.getSalesOrderRows(
        `WHERE ${salesOrderWhere.join(" AND ")}`,
        salesOrderParams,
      )
    )
      .map((row) => this.toSalesOrderSummary(row))
      .slice(0, limit);
    const collectionWhere = ["1 = 1"];
    const collectionParams: unknown[] = [];
    const addCollectionParam = (value: unknown) => {
      collectionParams.push(value);
      return `$${collectionParams.length}`;
    };

    if (dateFrom) {
      const fromParam = addCollectionParam(dateFrom);
      collectionWhere.push(`(sales_order.deposit_paid_at >= ${fromParam} OR sales_order.fulfilled_at >= ${fromParam})`);
    }

    if (dateTo) {
      const toParam = addCollectionParam(dateTo);
      collectionWhere.push(`(sales_order.deposit_paid_at <= ${toParam} OR sales_order.fulfilled_at <= ${toParam})`);
    }

    if (customerQuery) {
      const customerParam = addCollectionParam(`%${customerQuery}%`);
      collectionWhere.push(`(UPPER(COALESCE(sales_order.customer_no, '')) LIKE ${customerParam} OR UPPER(COALESCE(sales_order.customer_name, '')) LIKE ${customerParam})`);
    }

    if (productQuery) {
      const productParam = addCollectionParam(`%${productQuery}%`);
      collectionWhere.push(
        `EXISTS (
          SELECT 1
          FROM pos_transaction_line AS order_line
          WHERE order_line.pos_transaction_id = sales_order.source_transaction_id
            AND (
              UPPER(order_line.product_code_snapshot) LIKE ${productParam}
              OR UPPER(order_line.product_name_snapshot) LIKE ${productParam}
            )
        )`,
      );
    }

    const salesOrderCollectionRows = (
      await this.getSalesOrderRows(`WHERE ${collectionWhere.join(" AND ")}`, collectionParams)
    )
      .map((row) => this.toSalesOrderSummary(row))
      .filter((order) => order.orderType !== "LAYAWAY")
      .filter((order) =>
        !cashierCode || [order.operatorName, order.depositCollectedBy, order.saleCompletedBy, order.balanceCollectedBy]
          .some((value) => (value ?? "").toUpperCase() === cashierCode.toUpperCase()),
      )
      .map<StoreSalesOrderCollectionReconciliationRow | null>((order) => {
        const reconciliation = reconcileSalesOrderCollections(order, { dateFrom, dateTo });

        if (!reconciliation) {
          return null;
        }

        return {
          orderId: order.orderId,
          orderNo: order.orderNo,
          customerNo: order.customerNo,
          customerName: order.customerName,
          status: order.status,
          orderCreatedBy: order.operatorName,
          depositCollectedBy: order.depositCollectedBy,
          saleCompletedBy: order.saleCompletedBy,
          balanceCollectedBy: order.balanceCollectedBy,
          depositPaidAt: order.depositPaidAt,
          fulfilledAt: order.fulfilledAt,
          activityAt: reconciliation.fulfilmentInPeriod && order.fulfilledAt ? order.fulfilledAt : order.depositPaidAt ?? order.createdAt,
          salesRecognizedAmount: reconciliation.salesRecognizedAmount,
          openingDepositCollectedAmount: reconciliation.openingDepositCollectedAmount,
          priorDepositAppliedAmount: reconciliation.priorDepositAppliedAmount,
          balanceCollectedAmount: reconciliation.balanceCollectedAmount,
          expectedTenderAmount: reconciliation.expectedTenderAmount,
          outstandingBalanceAmount: reconciliation.outstandingBalanceAmount,
        };
      })
      .filter((row): row is StoreSalesOrderCollectionReconciliationRow => row !== null)
      .sort((left, right) => right.activityAt.localeCompare(left.activityAt))
      .slice(0, limit);
    const salesOrderCollectionTotals = salesOrderCollectionRows.reduce(
      (totals, row) => ({
        recognized: totals.recognized + row.salesRecognizedAmount,
        openingDeposit: totals.openingDeposit + row.openingDepositCollectedAmount,
        priorDeposit: totals.priorDeposit + row.priorDepositAppliedAmount,
        balanceCollected: totals.balanceCollected + row.balanceCollectedAmount,
        expectedTender: totals.expectedTender + row.expectedTenderAmount,
        outstanding: totals.outstanding + row.outstandingBalanceAmount,
      }),
      { recognized: 0, openingDeposit: 0, priorDeposit: 0, balanceCollected: 0, expectedTender: 0, outstanding: 0 },
    );

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
            .reduce(
              (sum, row) =>
                sum +
                (row.transactionType === "RETURN"
                  ? -Math.abs(row.totalAmount)
                  : row.totalAmount),
              0,
            )
            .toFixed(2),
        ),
        discountAmount: Number(
          mappedSalesRows
            .reduce(
              (sum, row) =>
                sum +
                (row.transactionType === "RETURN"
                  ? -Math.abs(row.discountAmount)
                  : row.discountAmount),
              0,
            )
            .toFixed(2),
        ),
        taxAmount: Number(
          mappedSalesRows
            .reduce(
              (sum, row) =>
                sum +
                (row.transactionType === "RETURN"
                  ? -Math.abs(row.taxAmount)
                  : row.taxAmount),
              0,
            )
            .toFixed(2),
        ),
        tenderedAmount: Number(
          mappedTenderRows
            .reduce((sum, row) => sum + row.amount, 0)
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
        salesOrderRecognizedAmount: Number(salesOrderCollectionTotals.recognized.toFixed(2)),
        salesOrderOpeningDepositAmount: Number(salesOrderCollectionTotals.openingDeposit.toFixed(2)),
        salesOrderPriorDepositAppliedAmount: Number(salesOrderCollectionTotals.priorDeposit.toFixed(2)),
        salesOrderBalanceCollectedAmount: Number(salesOrderCollectionTotals.balanceCollected.toFixed(2)),
        salesOrderExpectedTenderAmount: Number(salesOrderCollectionTotals.expectedTender.toFixed(2)),
        salesOrderOutstandingAmount: Number(salesOrderCollectionTotals.outstanding.toFixed(2)),
      },
      salesRows: mappedSalesRows,
      tenderRows: mappedTenderRows,
      accountPaymentRows: mappedAccountPaymentRows,
      productRows: mappedProductRows,
      salesOrderRows: mappedSalesOrderRows,
      salesOrderCollectionRows,
      shiftRows: mappedShiftRows,
      inventoryRows: mappedInventoryRows,
      serialBatchRows: mappedSerialBatchRows,
      bankingRows: mappedBankingRows,
    };
  }

  async browseInventoryPositions(
    input?: StoreInventoryBrowseRequest,
  ): Promise<StoreInventoryBrowseItem[]> {
    if (input?.forStartupAlert === true) {
      await this.requireActiveOperatorSession({
        purpose: "checking critical stock startup alerts",
      });
    } else {
      await this.requireActiveOperatorSession({
        permissionCodes: ["inventory.view"],
        purpose: "viewing inventory positions",
      });
    }

    const normalizedQuery = input?.query?.trim().toUpperCase() ?? "";
    const normalizedLocationCode = normalizeCatalogCode(input?.locationCode);
    const normalizedDepartmentCode = normalizeCatalogCode(
      input?.departmentCode,
    );
    const normalizedCategoryCode = normalizeCatalogCode(input?.categoryCode);
    const serializedOnly = input?.serializedOnly === true;
    const criticalOnly = input?.criticalOnly === true;
    const expiringOnly = input?.expiringOnly === true;
    const limit = Math.min(
      Math.max(input?.limit ?? 12, 1),
      criticalOnly || expiringOnly || input?.forStartupAlert === true ? 100 : 30,
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
    const result = await this.pool.query<InventoryBrowseRow>(
      `SELECT
        COALESCE(location.location_code, fallback_location.location_code, 'UNASSIGNED') AS location_code,
        COALESCE(location.location_name, fallback_location.location_name, 'Unassigned aggregate stock') AS location_name,
        product.product_code,
        product.product_name,
        product.short_name,
        product.department_code,
        department.department_name,
        product.category_code,
        category.category_name,
        product.subcategory,
        COALESCE(
          balance.quantity_on_hand,
          CASE WHEN $1::text IS NULL THEN product.quantity_on_hand ELSE 0 END
        ) AS quantity_on_hand,
        COALESCE((
          SELECT SUM(reservation.base_quantity)
          FROM sales_order_inventory_reservation AS reservation
          WHERE reservation.status = 'ACTIVE'
            AND upper(COALESCE(reservation.inventory_location_code, '')) = upper(COALESCE(location.location_code, fallback_location.location_code, 'UNASSIGNED'))
            AND upper(reservation.product_code) = upper(product.product_code)
        ), 0) AS active_reserved_quantity,
        product.min_stock_level,
        product.reorder_point,
        product.safety_stock_level,
        product.unit_price,
        product.is_serialized,
        product.track_expiry,
        (
          SELECT MIN(batch.expiry_date)
          FROM inventory_batch_registry AS batch
          WHERE batch.product_code = product.product_code
            AND batch.inventory_location_code = COALESCE(location.location_code, fallback_location.location_code, 'UNASSIGNED')
            AND batch.quantity_on_hand > 0
        ) AS earliest_expiry_date,
        COALESCE((
          SELECT SUM(batch.quantity_on_hand)
          FROM inventory_batch_registry AS batch
          WHERE batch.product_code = product.product_code
            AND batch.inventory_location_code = COALESCE(location.location_code, fallback_location.location_code, 'UNASSIGNED')
            AND batch.quantity_on_hand > 0
            AND batch.status = 'ACTIVE'
            AND batch.expiry_date >= CURRENT_DATE::text
            AND batch.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')::date::text
        ), 0) AS expiring_quantity,
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'batchId', batch.id,
              'batchNo', batch.batch_no,
              'manufacturedAt', batch.manufactured_at,
              'expiryDate', batch.expiry_date,
              'quantity', batch.quantity_on_hand
            )
            ORDER BY batch.expiry_date ASC, batch.batch_no ASC
          )::text
          FROM inventory_batch_registry AS batch
          WHERE batch.product_code = product.product_code
            AND batch.inventory_location_code = COALESCE(location.location_code, fallback_location.location_code, 'UNASSIGNED')
        ), '[]') AS batch_quantities_json,
        COALESCE(balance.updated_at, product.updated_at) AS updated_at
       FROM product_snapshot AS product
       LEFT JOIN inventory_location_balance AS balance
         ON balance.product_code = product.product_code
        AND ($1::text IS NULL OR upper(balance.location_code) = upper($1::text))
       LEFT JOIN inventory_location_snapshot AS location
         ON upper(location.location_code) = upper(balance.location_code)
       LEFT JOIN LATERAL (
         SELECT fallback.location_code, fallback.location_name
         FROM inventory_location_snapshot AS fallback
         WHERE fallback.status = 'ACTIVE'
           AND ((
             $1::text IS NOT NULL
             AND upper(fallback.location_code) = upper($1::text)
           )
           OR (
             $1::text IS NULL
           ))
         ORDER BY
           CASE
             WHEN $1::text IS NOT NULL AND upper(fallback.location_code) = upper($1::text) THEN 0
             WHEN fallback.is_sales_default = 1 THEN 1
             WHEN fallback.is_receiving_default = 1 THEN 2
             ELSE 3
           END,
           fallback.location_name ASC
         LIMIT 1
       ) AS fallback_location ON true
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = product.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = product.category_code
       ORDER BY ABS(COALESCE(balance.quantity_on_hand, product.quantity_on_hand, 0)) DESC,
         product.product_name ASC,
         COALESCE(location.location_name, fallback_location.location_name, 'Unassigned aggregate stock') ASC`,
      [input?.locationCode?.trim() || null],
    );
    const barcodeByProduct = await this.getRepresentativeBarcodeMap(
      result.rows.map((row) => row.product_code),
    );
    const metadata = await this.metadata();
    const ecommerceEligibilityByLocation =
      readStoreEcommerceFulfillmentEligibility(
        metadata.ecommerce_fulfillment_locations_json,
      );

    const filteredRows = result.rows.filter((row) => {
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

      if (
        expiringOnly &&
        (!asBooleanFlag(row.track_expiry) || asNumber(row.expiring_quantity) <= 0)
      ) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystacks = [
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
      ];

      return haystacks.some((value) =>
        value?.toUpperCase().includes(normalizedQuery),
      );
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
    } else if (expiringOnly) {
      filteredRows.sort((left, right) =>
        (left.earliest_expiry_date ?? "9999-12-31").localeCompare(
          right.earliest_expiry_date ?? "9999-12-31",
        ),
      );
    }

    return filteredRows
      .slice(0, limit)
      .map<StoreInventoryBrowseItem>((row) => {
        const quantityOnHand = Number(asNumber(row.quantity_on_hand).toFixed(3));
        const activeReservedQuantity = Number(
          asNumber(row.active_reserved_quantity).toFixed(3),
        );
        const safetyStockLevel =
          row.safety_stock_level === null
            ? 0
            : Number(asNumber(row.safety_stock_level).toFixed(3));
        const ecommerceEligibility = ecommerceEligibilityByLocation.get(
          row.location_code.trim().toUpperCase(),
        );
        const ecommerceEligible = Boolean(
          ecommerceEligibility?.supportsPickup ||
            ecommerceEligibility?.supportsDelivery,
        );

        return {
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
        quantityOnHand,
        activeReservedQuantity,
        ecommerceSellableQuantity: ecommerceEligible
          ? Number(
              Math.max(
                0,
                quantityOnHand - activeReservedQuantity - safetyStockLevel,
              ).toFixed(3),
            )
          : 0,
        ecommercePickupEligible: ecommerceEligibility?.supportsPickup ?? false,
        ecommerceDeliveryEligible:
          ecommerceEligibility?.supportsDelivery ?? false,
        ecommerceEligibilityLabel:
          ecommerceEligibility?.label ??
          "Not configured for ecommerce fulfilment",
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
        trackExpiry: asBooleanFlag(row.track_expiry),
        earliestExpiryDate: row.earliest_expiry_date,
        expiringQuantity: Number(asNumber(row.expiring_quantity).toFixed(3)),
        batchQuantities: readInventoryBatchAllocations(
          row.batch_quantities_json,
        ),
        updatedAt: row.updated_at,
        };
      });
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
        storeCode: input?.storeCode ?? null,
        locationCode: input?.locationCode ?? null,
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
    const limit = Math.min(Math.max(input?.limit ?? 16, 1), 500);
    const result = await this.pool.query<SerialRegistryBrowseRow>(
      `SELECT
        registry.product_code,
        product.product_name,
        product.department_code,
        department.department_name,
        product.category_code,
        category.category_name,
        product.subcategory,
        registry.serial_number,
        registry.inventory_location_code,
        location.location_name,
        registry.status,
        registry.source_transaction_id,
        registry.source_transaction_no,
        registry.updated_at
       FROM serial_registry AS registry
       LEFT JOIN product_snapshot AS product
         ON product.product_code = registry.product_code
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = product.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = product.category_code
       LEFT JOIN inventory_location_snapshot AS location
         ON location.location_code = registry.inventory_location_code
       ORDER BY registry.updated_at DESC, COALESCE(product.product_name, registry.product_code) ASC, registry.serial_number ASC`,
    );

    return result.rows
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
    const result = await this.pool.query<PurchaseOrderSnapshotRow>(
      `SELECT
        id,
        purchase_order_no,
        status,
        inventory_location_code,
        inventory_location_name,
        supplier_no,
        supplier_name,
        external_reference,
        note,
        operator_name,
        ordered_quantity,
        received_quantity,
        exception_quantity,
        outstanding_quantity,
        committed_at,
        closed_at,
        closure_reason,
        closure_note,
        closure_operator_name,
        updated_at
       FROM purchase_order_snapshot
       ORDER BY
        CASE status
          WHEN 'COMMITTED' THEN 0
          WHEN 'PART_RECEIVED' THEN 1
          WHEN 'RECEIVED' THEN 2
          WHEN 'CLOSED' THEN 3
          ELSE 4
        END,
        updated_at DESC,
        purchase_order_no DESC`,
    );
    const summaries = await this.toPurchaseOrderSummaries(result.rows);

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

  async saveStandalonePurchaseOrder(
    input: StoreStandalonePurchaseOrderInput,
  ): Promise<StoreSyncActionResult> {
    this.requireStandaloneSetupMode();
    const session = await this.requireStandaloneSupervisor();
    const timestamp = isoNow();
    const storeCode = await this.getStoreCode();
    const requestedLocationCode =
      optionalSetupText(input.inventoryLocationCode)?.toUpperCase() ?? null;
    const locationResult = requestedLocationCode
      ? await this.pool.query<{
          location_code: string;
          location_name: string;
        }>(
          "SELECT location_code, location_name FROM inventory_location_snapshot WHERE location_code = $1 LIMIT 1",
          [requestedLocationCode],
        )
      : await this.pool.query<{
          location_code: string;
          location_name: string;
        }>(
          `SELECT location_code, location_name
           FROM inventory_location_snapshot
           ORDER BY is_receiving_default DESC, is_sales_default DESC, location_name ASC
           LIMIT 1`,
        );
    const location = locationResult.rows[0] ?? null;

    if (!location) {
      throw new Error(
        "Create an inventory location before raising a standalone purchase order.",
      );
    }

    const supplierNo = optionalSetupText(input.supplierNo)?.toUpperCase() ?? null;
    const supplier = supplierNo
      ? (
          await this.pool.query<{
            supplier_no: string;
            supplier_name: string;
          }>(
            "SELECT supplier_no, supplier_name FROM supplier_snapshot WHERE supplier_no = $1 LIMIT 1",
            [supplierNo],
          )
        ).rows[0] ?? null
      : null;

    if (supplierNo && !supplier) {
      throw new Error(`Supplier ${supplierNo} does not exist on this standalone desktop.`);
    }

    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error("Add at least one product line to the standalone purchase order.");
    }

    const lines = await Promise.all(
      input.lines.map(async (line, index) => {
        const productCode = normalizeSetupCode(line.productCode, "Product code");
        const product = (
          await this.pool.query<{
            product_code: string;
            product_name: string;
            department_code: string | null;
            department_name: string | null;
            category_code: string | null;
            category_name: string | null;
            subcategory: string | null;
            is_serialized: string | number;
            track_expiry: string | number;
          }>(
            `SELECT
              product.product_code,
              product.product_name,
              product.department_code,
              department.department_name,
              product.category_code,
              category.category_name,
              product.subcategory,
              product.is_serialized,
              product.track_expiry
             FROM product_snapshot AS product
             LEFT JOIN product_department_snapshot AS department
               ON department.department_code = product.department_code
             LEFT JOIN product_category_snapshot AS category
               ON category.category_code = product.category_code
             WHERE product.product_code = $1
             LIMIT 1`,
            [productCode],
          )
        ).rows[0] ?? null;

        if (!product) {
          throw new Error(`Product ${productCode} does not exist in the standalone catalog.`);
        }

        const orderedQuantity = normalizeSetupNumber(line.orderedQuantity, 0, 3);

        if (orderedQuantity <= 0) {
          throw new Error(`Line ${index + 1} needs an ordered quantity greater than zero.`);
        }

        return {
          lineNo: index + 1,
          product,
          orderedQuantity,
          unitCost:
            line.unitCost == null
              ? null
              : normalizeSetupNumber(line.unitCost, 0, 2),
        };
      }),
    );
    const orderedQuantity = Number(
      lines.reduce((total, line) => total + line.orderedQuantity, 0).toFixed(3),
    );
    const purchaseOrderNo =
      optionalSetupText(input.purchaseOrderNo)?.toUpperCase() ??
      buildLocalDocumentNo(
        "PO",
        storeCode,
        await this.nextSequence("purchase_order_sequence"),
        timestamp,
      );
    const purchaseOrderId = `standalone-po-${purchaseOrderNo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
    const payloadLines: EnterprisePurchaseOrderPublishedPayload["lines"] =
      lines.map((line) => ({
        purchaseOrderLineId: `${purchaseOrderId}-line-${line.lineNo}`,
        lineNo: line.lineNo,
        productCode: line.product.product_code,
        productName: line.product.product_name,
        departmentCode: line.product.department_code,
        departmentName: line.product.department_name,
        categoryCode: line.product.category_code,
        categoryName: line.product.category_name,
        subcategory: line.product.subcategory,
        isSerialized: asBooleanFlag(line.product.is_serialized),
        trackExpiry: asBooleanFlag(line.product.track_expiry),
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: 0,
        exceptionQuantity: 0,
        outstandingQuantity: line.orderedQuantity,
        unitCost: line.unitCost,
      }));
    const event = await this.buildLocalPublication<EnterprisePurchaseOrderPublishedPayload>(
      "purchaseOrder",
      purchaseOrderId,
      "purchase-order.published",
      {
        storeCode,
        purchaseOrderId,
        purchaseOrderNo,
        locationCode: location.location_code,
        locationName: location.location_name,
        supplierNo: supplier?.supplier_no ?? null,
        supplierName: supplier?.supplier_name ?? null,
        externalReference: optionalSetupText(input.externalReference),
        status: "COMMITTED",
        note: optionalSetupText(input.note),
        operatorName:
          optionalSetupText(input.operatorName) ??
          this.formatOperatorLabel(session),
        committedAt: timestamp,
        closedAt: null,
        closureReason: null,
        closureNote: null,
        closureOperatorName: null,
        orderedQuantity,
        receivedQuantity: 0,
        exceptionQuantity: 0,
        outstandingQuantity: orderedQuantity,
        lines: payloadLines,
        publishedAt: timestamp,
      },
      timestamp,
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.applyDownstreamPayload(event, timestamp, client);
      await this.setMetadata("last_local_write_at", timestamp, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${purchaseOrderNo} was created for standalone receiving.`,
      snapshot: await this.getSyncSnapshot(),
    };
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
      const lineResult = await this.pool.query<PurchaseOrderLineSnapshotRow>(
        `SELECT
          line.id,
          line.purchase_order_id,
          line.line_no,
          line.product_code,
          line.product_name,
          line.department_code,
          department.department_name,
          line.category_code,
          category.category_name,
          line.subcategory,
          line.is_serialized,
          line.track_expiry,
          line.ordered_quantity,
          line.received_quantity,
          line.exception_quantity,
          line.outstanding_quantity,
          line.unit_cost,
          line.updated_at
         FROM purchase_order_line_snapshot AS line
         LEFT JOIN product_department_snapshot AS department
           ON department.department_code = line.department_code
         LEFT JOIN product_category_snapshot AS category
           ON category.category_code = line.category_code
         WHERE line.purchase_order_id = ANY($1::text[])
         ORDER BY line.purchase_order_id ASC, line.line_no ASC`,
        [purchaseOrderIds],
      );

      for (const line of lineResult.rows) {
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
          trackExpiry: asBooleanFlag(line.track_expiry),
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
          transfer.status,
          transfer.role,
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
    const result = await this.pool.query<InterStoreTransferSnapshotRow>(
      `SELECT
        transfer.id,
        transfer.transfer_no,
        transfer.transfer_batch_no,
        transfer.line_no,
        transfer.role,
        transfer.origin,
        transfer.status,
        transfer.external_reference,
        transfer.source_store_code,
        transfer.source_store_name,
        transfer.source_location_code,
        transfer.source_location_name,
        transfer.destination_store_code,
        transfer.destination_store_name,
        transfer.destination_location_code,
        transfer.destination_location_name,
        transfer.product_code,
        transfer.product_name,
        transfer.department_code,
        department.department_name,
        transfer.category_code,
        category.category_name,
        transfer.subcategory,
        transfer.is_serialized,
        transfer.track_expiry,
        transfer.requested_quantity,
        transfer.requested_unit_of_measure,
        transfer.requested_unit_quantity,
        transfer.uom_conversion_factor,
        transfer.base_unit_of_measure,
        transfer.issued_quantity,
        transfer.received_quantity,
        transfer.outstanding_issue_quantity,
        transfer.outstanding_receipt_quantity,
        transfer.unit_cost,
        transfer.issued_serial_numbers_json,
        transfer.received_serial_numbers_json,
        transfer.issued_batch_allocations_json,
        transfer.received_batch_allocations_json,
        transfer.request_note,
        transfer.issue_note,
        transfer.receipt_note,
        transfer.request_operator_name,
        transfer.issue_operator_name,
        transfer.receipt_operator_name,
        transfer.requested_by_node_code,
        transfer.source_node_code,
        transfer.destination_node_code,
        transfer.requested_at,
        transfer.required_at,
        transfer.issued_at,
        transfer.received_at,
        transfer.closed_at,
        transfer.updated_at
       FROM inter_store_transfer_snapshot AS transfer
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = transfer.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = transfer.category_code
       ORDER BY
        CASE transfer.status
          WHEN 'REQUESTED' THEN 0
          WHEN 'PART_ISSUED' THEN 1
          WHEN 'ISSUED' THEN 2
          WHEN 'PART_RECEIVED' THEN 3
          WHEN 'RECEIVED' THEN 4
          ELSE 5
        END,
        transfer.updated_at DESC,
        transfer.transfer_no DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
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
      trackExpiry: asBooleanFlag(row.track_expiry),
      requestedQuantity: Number(asNumber(row.requested_quantity).toFixed(3)),
      requestedUnitOfMeasure: row.requested_unit_of_measure,
      requestedUnitQuantity: Number(
        asNumber(row.requested_unit_quantity).toFixed(3),
      ),
      uomConversionFactor: Number(
        asNumber(row.uom_conversion_factor).toFixed(6),
      ),
      baseUnitOfMeasure: row.base_unit_of_measure,
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
      issuedBatchAllocations: readInventoryBatchAllocations(
        row.issued_batch_allocations_json,
      ),
      receivedBatchAllocations: readInventoryBatchAllocations(
        row.received_batch_allocations_json,
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
    const result = await this.pool.query<TransferRequestTargetSnapshotRow>(
      `SELECT
        source_store_code,
        source_store_name,
        source_store_sales_enabled,
        source_store_warehouse_enabled,
        source_location_code,
        source_location_name,
        source_location_type,
        source_location_status,
        source_location_defaults,
        source_warehouse_code,
        source_warehouse_name,
        use_for_sales_default,
        use_for_receiving_default,
        updated_at
       FROM inter_store_transfer_request_target_snapshot
       ORDER BY source_store_name ASC, source_location_name ASC`,
    );

    return result.rows.map((row) => ({
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

  private async getTransferRequestDraftSummaries(): Promise<
    StoreInterStoreTransferRequestDraftSummary[]
  > {
    const result = await this.pool.query<InterStoreTransferRequestDraftRow>(
      `SELECT
        draft.id,
        draft.request_no,
        draft.status,
        draft.source_store_code,
        draft.source_store_name,
        draft.source_location_code,
        draft.source_location_name,
        draft.destination_store_code,
        draft.destination_store_name,
        draft.destination_location_code,
        draft.destination_location_name,
        draft.product_code,
        draft.product_name,
        draft.department_code,
        department.department_name,
        draft.category_code,
        category.category_name,
        draft.subcategory,
        draft.is_serialized,
        draft.quantity,
        draft.requested_unit_of_measure,
        draft.requested_unit_quantity,
        draft.uom_conversion_factor,
        draft.base_unit_of_measure,
        draft.external_reference,
        draft.note,
        draft.operator_name,
        draft.lines_json,
        draft.submitted_at,
        draft.updated_at
       FROM inter_store_transfer_request_draft AS draft
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = draft.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = draft.category_code
       ORDER BY
        CASE draft.status WHEN 'DRAFT' THEN 0 ELSE 1 END,
        draft.updated_at DESC
       LIMIT 20`,
    );

    return result.rows.map((row) => {
      const lines = readTransferRequestDraftLines(row.lines_json, {
        lineId: row.id,
        lineNo: 1,
        productCode: row.product_code,
        productName: row.product_name,
        departmentCode: row.department_code,
        departmentName: row.department_name,
        categoryCode: row.category_code,
        categoryName: row.category_name,
        subcategory: row.subcategory,
        isSerialized: asBooleanFlag(row.is_serialized),
        quantity: Number(asNumber(row.quantity).toFixed(3)),
        requestedUnitOfMeasure: row.requested_unit_of_measure,
        requestedUnitQuantity: Number(asNumber(row.requested_unit_quantity).toFixed(3)),
        uomConversionFactor: Number(asNumber(row.uom_conversion_factor).toFixed(6)),
        baseUnitOfMeasure: row.base_unit_of_measure,
      });

      return {
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
      requestedUnitOfMeasure: row.requested_unit_of_measure,
      requestedUnitQuantity: Number(
        asNumber(row.requested_unit_quantity).toFixed(3),
      ),
      uomConversionFactor: Number(
        asNumber(row.uom_conversion_factor).toFixed(6),
      ),
      baseUnitOfMeasure: row.base_unit_of_measure,
      externalReference: row.external_reference,
      note: row.note,
      operatorName: row.operator_name,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      lines,
    };
    });
  }

  private async getStockCountSessionSummaries(): Promise<
    StoreStockCountSessionSummary[]
  > {
    const result = await this.pool.query<StockCountSessionRow>(
      `SELECT
        session.id,
        session.session_no,
        session.status,
        session.inventory_location_code,
        session.inventory_location_name,
        session.product_code,
        session.product_name,
        session.department_code,
        department.department_name,
        session.category_code,
        category.category_name,
        session.subcategory,
        session.is_serialized,
        session.previous_quantity,
        session.counted_quantity,
        session.variance_quantity,
        session.previous_serial_numbers_json,
        session.counted_serial_numbers_json,
        session.previous_batch_quantities_json,
        session.counted_batch_quantities_json,
        session.note,
        session.operator_name,
        session.submitted_at,
        session.committed_at,
        session.updated_at
       FROM stock_count_session AS session
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = session.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = session.category_code
       ORDER BY
        CASE session.status WHEN 'DRAFT' THEN 0 WHEN 'SUBMITTED' THEN 1 ELSE 2 END,
        session.updated_at DESC
       LIMIT 24`,
    );

    return result.rows.map((row) => ({
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
      previousBatchQuantities: readInventoryBatchAllocations(
        row.previous_batch_quantities_json,
      ),
      countedBatchQuantities: readInventoryBatchAllocations(
        row.counted_batch_quantities_json,
      ),
      operatorName: row.operator_name,
      note: row.note,
      submittedAt: row.submitted_at,
      committedAt: row.committed_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getRecentGoodsReceiptSummaries(
    limit = 12,
  ): Promise<StoreLocalGoodsReceiptSummary[]> {
    const result = await this.pool.query<LocalGoodsReceiptRow>(
      `SELECT
        receipt.id,
        receipt.goods_receipt_no,
        receipt.purchase_order_id,
        receipt.purchase_order_no,
        receipt.inventory_location_code,
        location.location_name AS inventory_location_name,
        receipt.supplier_no,
        receipt.supplier_name,
        receipt.external_reference,
        receipt.note,
        receipt.operator_name,
        receipt.total_quantity,
        COUNT(DISTINCT line.id) AS line_count,
        receipt.exception_quantity,
        COUNT(DISTINCT exception.id) AS exception_count,
        receipt.synced_at,
        receipt.received_at,
        receipt.updated_at
       FROM local_goods_receipt AS receipt
       LEFT JOIN inventory_location_snapshot AS location
         ON location.location_code = receipt.inventory_location_code
       LEFT JOIN local_goods_receipt_line AS line
         ON line.local_goods_receipt_id = receipt.id
       LEFT JOIN local_goods_receipt_exception AS exception
         ON exception.local_goods_receipt_id = receipt.id
       GROUP BY
        receipt.id,
        location.location_name
       ORDER BY receipt.received_at DESC
       LIMIT $1`,
      [limit],
    );
    const receiptIds = result.rows.map((row) => row.id);
    const linesByReceiptId = new Map<
      string,
      StoreLocalGoodsReceiptSummary["lines"]
    >();
    const exceptionsByReceiptId = new Map<
      string,
      StoreLocalGoodsReceiptSummary["exceptions"]
    >();

    if (receiptIds.length > 0) {
      const [lineResult, exceptionResult] = await Promise.all([
        this.pool.query<LocalGoodsReceiptLineRow>(
          `SELECT
            line.id,
            line.local_goods_receipt_id,
            line.purchase_order_line_id,
            line.line_no,
            line.product_code,
            line.product_name,
            COALESCE(po_line.ordered_quantity, line.quantity) AS ordered_quantity,
            line.quantity,
            line.unit_cost,
            line.serial_numbers_json,
            line.batch_no,
            line.manufactured_at,
            line.expiry_date
           FROM local_goods_receipt_line AS line
           LEFT JOIN purchase_order_line_snapshot AS po_line
             ON po_line.id = line.purchase_order_line_id
           WHERE line.local_goods_receipt_id = ANY($1::text[])
           ORDER BY line.local_goods_receipt_id ASC, line.line_no ASC`,
          [receiptIds],
        ),
        this.pool.query<LocalGoodsReceiptExceptionRow>(
          `SELECT
            id,
            local_goods_receipt_id,
            purchase_order_line_id,
            line_no,
            product_code,
            product_name,
            quantity,
            unit_cost,
            reason,
            note
           FROM local_goods_receipt_exception
           WHERE local_goods_receipt_id = ANY($1::text[])
           ORDER BY local_goods_receipt_id ASC, line_no ASC`,
          [receiptIds],
        ),
      ]);

      for (const line of lineResult.rows) {
        const currentLines =
          linesByReceiptId.get(line.local_goods_receipt_id) ?? [];
        currentLines.push({
          goodsReceiptLineId: line.id,
          purchaseOrderLineId: line.purchase_order_line_id,
          lineNo: Math.trunc(asNumber(line.line_no)),
          productCode: line.product_code,
          productName: line.product_name,
          orderedQuantity: Number(
            asNumber(line.ordered_quantity ?? line.quantity).toFixed(3),
          ),
          quantity: Number(asNumber(line.quantity).toFixed(3)),
          unitCost: asNullableNumber(line.unit_cost),
          serialNumbers: readSerializedLineNumbers(line.serial_numbers_json),
          batchNo: line.batch_no,
          manufacturedAt: line.manufactured_at,
          expiryDate: line.expiry_date,
        });
        linesByReceiptId.set(line.local_goods_receipt_id, currentLines);
      }

      for (const exception of exceptionResult.rows) {
        const currentExceptions =
          exceptionsByReceiptId.get(exception.local_goods_receipt_id) ?? [];
        currentExceptions.push({
          receiptExceptionId: exception.id,
          purchaseOrderLineId: exception.purchase_order_line_id,
          lineNo: Math.trunc(asNumber(exception.line_no)),
          productCode: exception.product_code,
          productName: exception.product_name,
          quantity: Number(asNumber(exception.quantity).toFixed(3)),
          unitCost: asNullableNumber(exception.unit_cost),
          reason: exception.reason,
          note: exception.note,
        });
        exceptionsByReceiptId.set(
          exception.local_goods_receipt_id,
          currentExceptions,
        );
      }
    }

    return result.rows.map((row) => ({
      goodsReceiptId: row.id,
      goodsReceiptNo: row.goods_receipt_no,
      purchaseOrderId: row.purchase_order_id,
      purchaseOrderNo: row.purchase_order_no,
      inventoryLocationCode: row.inventory_location_code,
      inventoryLocationName:
        row.inventory_location_name ?? row.inventory_location_code,
      supplierNo: row.supplier_no,
      supplierName: row.supplier_name,
      externalReference: row.external_reference,
      note: row.note,
      operatorName: row.operator_name,
      totalQuantity: Number(asNumber(row.total_quantity).toFixed(3)),
      lineCount: Math.trunc(asNumber(row.line_count)),
      exceptionQuantity: Number(asNumber(row.exception_quantity).toFixed(3)),
      exceptionCount: Math.trunc(asNumber(row.exception_count)),
      syncedAt: row.synced_at,
      receivedAt: row.received_at,
      updatedAt: row.updated_at,
      lines: linesByReceiptId.get(row.id) ?? [],
      exceptions: exceptionsByReceiptId.get(row.id) ?? [],
    }));
  }

  private async getRecentSupplierReturnSummaries(
    limit = 12,
  ): Promise<StoreLocalSupplierReturnSummary[]> {
    const result = await this.pool.query<LocalSupplierReturnRow>(
      `SELECT
        supplier_return.id,
        supplier_return.supplier_return_no,
        supplier_return.purchase_order_id,
        supplier_return.purchase_order_no,
        supplier_return.goods_receipt_id,
        supplier_return.goods_receipt_no,
        supplier_return.inventory_location_code,
        location.location_name AS inventory_location_name,
        supplier_return.supplier_no,
        supplier_return.supplier_name,
        supplier_return.external_reference,
        supplier_return.reason,
        supplier_return.status,
        supplier_return.note,
        supplier_return.operator_name,
        supplier_return.total_quantity,
        COUNT(line.id) AS line_count,
        supplier_return.synced_at,
        supplier_return.returned_at,
        supplier_return.cancelled_at,
        supplier_return.cancellation_note,
        supplier_return.cancellation_operator_name,
        supplier_return.cancellation_acknowledged_at,
        supplier_return.cancellation_acknowledged_by,
        supplier_return.cancellation_acknowledgement_note,
        supplier_return.cancellation_ack_synced_at,
        supplier_return.updated_at
       FROM local_supplier_return AS supplier_return
       LEFT JOIN inventory_location_snapshot AS location
         ON location.location_code = supplier_return.inventory_location_code
       LEFT JOIN local_supplier_return_line AS line
         ON line.local_supplier_return_id = supplier_return.id
       GROUP BY
        supplier_return.id,
        location.location_name
       ORDER BY supplier_return.returned_at DESC
       LIMIT $1`,
      [limit],
    );
    const returnIds = result.rows.map((row) => row.id);
    const linesByReturnId = new Map<
      string,
      StoreLocalSupplierReturnSummary["lines"]
    >();

    if (returnIds.length > 0) {
      const lineResult = await this.pool.query<LocalSupplierReturnLineRow>(
        `SELECT
          id,
          local_supplier_return_id,
          goods_receipt_line_id,
          purchase_order_line_id,
          line_no,
          product_code,
          product_name,
          quantity,
          unit_cost,
          serial_numbers_json,
          batch_allocations_json
         FROM local_supplier_return_line
         WHERE local_supplier_return_id = ANY($1::text[])
         ORDER BY local_supplier_return_id ASC, line_no ASC`,
        [returnIds],
      );

      for (const line of lineResult.rows) {
        const currentLines =
          linesByReturnId.get(line.local_supplier_return_id) ?? [];
        currentLines.push({
          supplierReturnLineId: line.id,
          goodsReceiptLineId: line.goods_receipt_line_id,
          purchaseOrderLineId: line.purchase_order_line_id,
          lineNo: Math.trunc(asNumber(line.line_no)),
          productCode: line.product_code,
          productName: line.product_name,
          quantity: Number(asNumber(line.quantity).toFixed(3)),
          unitCost: asNullableNumber(line.unit_cost),
          serialNumbers: readSerializedLineNumbers(line.serial_numbers_json),
          batchAllocations: readInventoryBatchAllocations(
            line.batch_allocations_json,
          ),
        });
        linesByReturnId.set(line.local_supplier_return_id, currentLines);
      }
    }

    return result.rows.map((row) => ({
      supplierReturnId: row.id,
      supplierReturnNo: row.supplier_return_no,
      purchaseOrderId: row.purchase_order_id,
      purchaseOrderNo: row.purchase_order_no,
      goodsReceiptId: row.goods_receipt_id,
      goodsReceiptNo: row.goods_receipt_no,
      inventoryLocationCode: row.inventory_location_code,
      inventoryLocationName:
        row.inventory_location_name ?? row.inventory_location_code,
      supplierNo: row.supplier_no,
      supplierName: row.supplier_name,
      externalReference: row.external_reference,
      reason: row.reason,
      status: row.status,
      note: row.note,
      operatorName: row.operator_name,
      totalQuantity: Number(asNumber(row.total_quantity).toFixed(3)),
      lineCount: Math.trunc(asNumber(row.line_count)),
      syncedAt: row.synced_at,
      returnedAt: row.returned_at,
      cancelledAt: row.cancelled_at,
      cancellationNote: row.cancellation_note,
      cancellationOperatorName: row.cancellation_operator_name,
      cancellationAcknowledgedAt: row.cancellation_acknowledged_at,
      cancellationAcknowledgedBy: row.cancellation_acknowledged_by,
      cancellationAcknowledgementNote: row.cancellation_acknowledgement_note,
      cancellationAcknowledgementSyncedAt: row.cancellation_ack_synced_at,
      updatedAt: row.updated_at,
      lines: linesByReturnId.get(row.id) ?? [],
    }));
  }

  private async getRepresentativeBarcodeMap(productCodes: string[]) {
    const normalizedCodes = [...new Set(productCodes.filter(Boolean))];
    const barcodeByProduct = new Map<string, string>();

    if (normalizedCodes.length === 0) {
      return barcodeByProduct;
    }

    const result = await this.pool.query<{
      product_code: string;
      barcode_code: string;
    }>(
      `SELECT DISTINCT ON (product_code)
        product_code,
        barcode_code
       FROM barcode_snapshot
       WHERE product_code = ANY($1::text[])
       ORDER BY product_code ASC, barcode_code ASC`,
      [normalizedCodes],
    );

    for (const row of result.rows) {
      barcodeByProduct.set(row.product_code, row.barcode_code);
    }

    return barcodeByProduct;
  }

  private async getProductDepartmentSummaries(): Promise<
    StoreProductDepartmentSummary[]
  > {
    const result = await this.pool.query<{
      department_code: string;
      department_name: string;
      description: string | null;
      status: string;
      sort_order: string | number;
      updated_at: string;
      category_count: string | number;
    }>(
      `SELECT
        department.department_code,
        department.department_name,
        department.description,
        department.status,
        department.sort_order,
        department.updated_at,
        COUNT(category.category_code) AS category_count
       FROM product_department_snapshot AS department
       LEFT JOIN product_category_snapshot AS category
         ON category.department_code = department.department_code
       GROUP BY
        department.department_code,
        department.department_name,
        department.description,
        department.status,
        department.sort_order,
        department.updated_at
       ORDER BY department.sort_order ASC, department.department_name ASC`,
    );

    return result.rows.map((row) => ({
      departmentCode: row.department_code,
      departmentName: row.department_name,
      description: row.description,
      status: row.status,
      sortOrder: Math.trunc(asNumber(row.sort_order)),
      categoryCount: Math.trunc(asNumber(row.category_count)),
      updatedAt: row.updated_at,
    }));
  }

  private async getProductCategorySummaries(): Promise<
    StoreProductCategorySummary[]
  > {
    const result = await this.pool.query<{
      category_code: string;
      category_name: string;
      department_code: string;
      department_name: string;
      description: string | null;
      status: string;
      sort_order: string | number;
      updated_at: string;
    }>(
      `SELECT
        category_code,
        category_name,
        department_code,
        department_name,
        description,
        status,
        sort_order,
        updated_at
       FROM product_category_snapshot
       ORDER BY department_name ASC, sort_order ASC, category_name ASC`,
    );

    return result.rows.map((row) => ({
      categoryCode: row.category_code,
      categoryName: row.category_name,
      departmentCode: row.department_code,
      departmentName: row.department_name,
      description: row.description,
      status: row.status,
      sortOrder: Math.trunc(asNumber(row.sort_order)),
      updatedAt: row.updated_at,
    }));
  }

  private async getInventoryLocationSummaries(): Promise<
    StoreInventoryLocationSummary[]
  > {
    const [locations, highlights] = await Promise.all([
      this.pool.query<{
        location_code: string;
        location_name: string;
        location_type: string;
        status: string;
        defaults: string;
        updated_at: string;
        tracked_products: string | number;
        on_hand_quantity: string | number;
        negative_positions: string | number;
      }>(
        `SELECT
          location.location_code,
          location.location_name,
          location.location_type,
          location.status,
          location.defaults,
          location.updated_at,
          COUNT(CASE WHEN COALESCE(balance.quantity_on_hand, 0) != 0 THEN 1 END) AS tracked_products,
          COALESCE(SUM(balance.quantity_on_hand), 0) AS on_hand_quantity,
          SUM(CASE WHEN COALESCE(balance.quantity_on_hand, 0) < 0 THEN 1 ELSE 0 END) AS negative_positions
         FROM inventory_location_snapshot AS location
         LEFT JOIN inventory_location_balance AS balance
           ON balance.location_code = location.location_code
         GROUP BY
          location.location_code,
          location.location_name,
          location.location_type,
          location.status,
          location.defaults,
          location.updated_at,
          location.is_sales_default
         ORDER BY location.is_sales_default DESC, location.location_name ASC`,
      ),
      this.pool.query<{
        location_code: string;
        product_code: string;
        quantity_on_hand: string | number;
      }>(
        `SELECT location_code, product_code, quantity_on_hand
         FROM inventory_location_balance
         WHERE quantity_on_hand != 0
         ORDER BY ABS(quantity_on_hand) DESC, product_code ASC`,
      ),
    ]);
    const highlightsByLocation = new Map<string, string[]>();

    for (const row of highlights.rows) {
      const items = highlightsByLocation.get(row.location_code) ?? [];

      if (items.length >= 3) {
        continue;
      }

      items.push(
        `${row.product_code} (${Number(asNumber(row.quantity_on_hand).toFixed(3))})`,
      );
      highlightsByLocation.set(row.location_code, items);
    }

    return locations.rows.map((row) => ({
      locationCode: row.location_code,
      locationName: row.location_name,
      locationType: row.location_type,
      status: row.status,
      defaults: row.defaults,
      trackedProducts: Math.trunc(asNumber(row.tracked_products)),
      onHandQuantity: Number(asNumber(row.on_hand_quantity).toFixed(3)),
      negativePositions: Math.trunc(asNumber(row.negative_positions)),
      highlightedProducts: highlightsByLocation.get(row.location_code) ?? [],
      updatedAt: row.updated_at,
    }));
  }

  private async listActiveTenderMethods(): Promise<StoreTenderMethodSummary[]> {
    const seededTenderDescriptionPattern =
      "%seeded into the flash rms store desktop.%";
    const tenderScopeSql = this.isStandaloneDeployment()
      ? `(
           published_at IS NOT NULL
           OR NOT EXISTS (
             SELECT 1
             FROM tender_method_snapshot AS enterprise_tender
             WHERE enterprise_tender.published_at IS NOT NULL
           )
         )`
      : `(
           published_at IS NOT NULL
           OR (
             NOT EXISTS (
               SELECT 1
               FROM tender_method_snapshot AS enterprise_tender
               WHERE enterprise_tender.published_at IS NOT NULL
             )
             AND (
               LOWER(COALESCE(description, '')) NOT LIKE $1
               OR NOT EXISTS (
                 SELECT 1
                 FROM tender_method_snapshot AS configured_tender
                 WHERE configured_tender.status = 'ACTIVE'
                   AND LOWER(COALESCE(configured_tender.description, '')) NOT LIKE $1
               )
             )
           )
         )`;
    const queryArgs = this.isStandaloneDeployment()
      ? []
      : [seededTenderDescriptionPattern];
    const result = await this.pool.query<{
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
        tender_method_code,
        tender_method_name,
        payment_method,
        gateway_provider,
        gateway_mode,
        gateway_merchant_id,
        gateway_public_key,
        gateway_callback_url,
        gateway_active,
        gateway_status,
        requires_reference,
        allow_change,
        allow_refund,
        allow_open_cash_drawer,
        status,
        sort_order,
        updated_at
       FROM tender_method_snapshot
       WHERE status = 'ACTIVE'
         AND ${tenderScopeSql}
       ORDER BY
         CASE
           WHEN payment_method = 'CASH' OR upper(tender_method_code) = 'CASH' THEN 0
           ELSE 1
         END,
         sort_order ASC,
         tender_method_name ASC`,
      queryArgs,
    );

    return result.rows.map((row) => ({
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
    const result = await this.pool.query<{
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
        id,
        bank_code,
        bank_name,
        branch_code,
        branch_name,
        account_number,
        account_name,
        currency_code,
        status,
        updated_at
       FROM bank_account_snapshot
       WHERE status = 'ACTIVE'
       ORDER BY bank_name ASC, branch_name ASC, account_number ASC`,
    );

    return result.rows.map((row) => ({
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

  private async listActiveSuppliers(): Promise<StoreSupplierSummary[]> {
    const result = await this.pool.query<{
      supplier_no: string;
      supplier_name: string;
      phone: string | null;
      email: string | null;
      tax_number: string | null;
      address_line1: string | null;
      city: string | null;
      country_code: string | null;
      status: string;
      updated_at: string;
    }>(
      `SELECT
        supplier_no,
        supplier_name,
        phone,
        email,
        tax_number,
        address_line1,
        city,
        country_code,
        status,
        updated_at
       FROM supplier_snapshot
       WHERE status = 'ACTIVE'
       ORDER BY supplier_name ASC, supplier_no ASC`,
    );

    return result.rows.map((row) => ({
      supplierNo: row.supplier_no,
      supplierName: row.supplier_name,
      phone: row.phone,
      email: row.email,
      taxNumber: row.tax_number,
      addressLine1: row.address_line1,
      city: row.city,
      countryCode: row.country_code,
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }

  private async listPriceListEntries(): Promise<StorePriceListEntrySummary[]> {
    const result = await this.pool.query<{
      price_list_code: string;
      price_list_name: string;
      currency_code: string;
      is_default: string | number;
      customer_type: string | null;
      loyalty_tier: string | null;
      product_code: string;
      unit_price: string | number;
      status: string;
      updated_at: string;
    }>(
      `SELECT
        price_list_code,
        price_list_name,
        currency_code,
        is_default,
        customer_type,
        loyalty_tier,
        product_code,
        unit_price,
        status,
        updated_at
       FROM price_list_entry_snapshot
       ORDER BY is_default DESC, price_list_name ASC, product_code ASC
       LIMIT 300`,
    );

    return result.rows.map((row) => ({
      priceListCode: row.price_list_code,
      priceListName: row.price_list_name,
      currencyCode: row.currency_code,
      isDefault: asBooleanFlag(row.is_default),
      customerType: row.customer_type,
      loyaltyTier: row.loyalty_tier,
      productCode: row.product_code,
      unitPrice: Number(asNumber(row.unit_price).toFixed(2)),
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }

  private async listPromotions(): Promise<StorePromotionSummary[]> {
    const result = await this.pool.query<{
      promotion_code: string;
      promotion_name: string;
      description: string | null;
      discount_type: SyncPromotionDiscountType;
      target_scope: SyncPromotionTargetScope;
      discount_value: string | number;
      minimum_basket_amount: string | number | null;
      target_department_code: string | null;
      target_category_code: string | null;
      target_product_code: string | null;
      coupon_required: string | number;
      coupon_code: string | null;
      allow_with_loyalty: string | number;
      apply_once_per_basket: string | number;
      priority: string | number;
      start_at: string | null;
      end_at: string | null;
      status: string;
      updated_at: string;
    }>(
      `SELECT
        promotion_code,
        promotion_name,
        description,
        discount_type,
        target_scope,
        discount_value,
        minimum_basket_amount,
        target_department_code,
        target_category_code,
        target_product_code,
        coupon_required,
        coupon_code,
        allow_with_loyalty,
        apply_once_per_basket,
        priority,
        start_at,
        end_at,
        status,
        updated_at
       FROM promotion_snapshot
       ORDER BY status ASC, priority ASC, promotion_name ASC
       LIMIT 200`,
    );

    return result.rows.map((row) => ({
      promotionCode: row.promotion_code,
      promotionName: row.promotion_name,
      description: row.description,
      discountType: row.discount_type,
      targetScope: row.target_scope,
      discountValue: Number(asNumber(row.discount_value).toFixed(2)),
      minimumBasketAmount:
        row.minimum_basket_amount == null
          ? null
          : Number(asNumber(row.minimum_basket_amount).toFixed(2)),
      targetDepartmentCode: row.target_department_code,
      targetCategoryCode: row.target_category_code,
      targetProductCode: row.target_product_code,
      couponRequired: asBooleanFlag(row.coupon_required),
      couponCode: row.coupon_code,
      allowWithLoyalty: asBooleanFlag(row.allow_with_loyalty),
      applyOncePerBasket: asBooleanFlag(row.apply_once_per_basket),
      priority: Math.trunc(asNumber(row.priority)),
      startAt: row.start_at,
      endAt: row.end_at,
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

  private getLoyaltySettingsSummary(
    metadata: Record<string, string | undefined>,
  ): StoreLoyaltySettingsSummary {
    return {
      loyaltyProgramEnabled: metadata.loyalty_program_enabled !== "0",
      loyaltyPointsPerCurrencyUnit: asNumber(
        metadata.loyalty_points_per_currency_unit,
      ),
      loyaltyRedemptionEnabled: metadata.loyalty_redemption_enabled === "1",
      loyaltyRedemptionPointsStep: Math.max(
        1,
        Math.trunc(asNumber(metadata.loyalty_redemption_points_step) || 100),
      ),
      loyaltyRedemptionValueAmount: Number(
        (asNumber(metadata.loyalty_redemption_value_amount) || 1).toFixed(2),
      ),
      loyaltyMinimumRedeemPoints: Math.max(
        1,
        Math.trunc(asNumber(metadata.loyalty_minimum_redeem_points) || 100),
      ),
      loyaltyMaximumRedeemPercentOfSale: Number(
        (
          asNumber(metadata.loyalty_maximum_redeem_percent_of_sale) || 100
        ).toFixed(2),
      ),
    };
  }

  private getOptionSettingsSummary(
    metadata: Record<string, string | undefined>,
  ): StoreOptionSettingsSummary {
    return {
      allowNegativeInventory: metadata.allow_negative_inventory === "1",
      allowOfflineSales: metadata.allow_offline_sales !== "0",
      autoPrintReceipts: metadata.auto_print_receipts !== "0",
      enforceSerializedScanAtPos:
        metadata.enforce_serialized_scan_at_pos !== "0",
      requireCustomerForCreditSales:
        metadata.require_customer_for_credit_sales !== "0",
      requireSupervisorForReceiptlessReturn:
        metadata.require_supervisor_for_receiptless_return !== "0",
      defaultReceiptSearchDays: normalizePolicyInteger(
        metadata.default_receipt_search_days,
        30,
        1,
        365,
      ),
      shiftFloatPromptAmount: Number(
        Math.max(0, asNumber(metadata.shift_float_prompt_amount)).toFixed(2),
      ),
      showCriticalStocksOnStartup:
        metadata.show_critical_stocks_on_startup !== "0",
      showExpiringBatchesOnStartup:
        metadata.show_expiring_batches_on_startup !== "0",
      expiryAlertLeadDays: normalizePolicyInteger(
        metadata.expiry_alert_lead_days,
        30,
        1,
        3650,
      ),
      expiryCriticalDays: normalizePolicyInteger(
        metadata.expiry_critical_days,
        7,
        0,
        normalizePolicyInteger(metadata.expiry_alert_lead_days, 30, 1, 3650),
      ),
      productSizes: readProductSizesMetadata(metadata.product_sizes_json),
      posDiscountRates: readPosDiscountRatesMetadata(metadata.pos_discount_rates_json),
      posExpressChargeRates: readPosDiscountRatesMetadata(
        metadata.pos_express_charge_rates_json,
      ),
      layawaySettings: normalizeLayawaySettings({
        enabled: metadata.layaway_enabled === "1",
        reserveStockOnDeposit: metadata.layaway_reserve_stock_on_deposit !== "0",
        minimumDepositPercent: metadata.layaway_minimum_deposit_percent,
        requireFullPaymentBeforeFulfilment:
          metadata.layaway_require_full_payment_before_fulfilment !== "0",
        refundPaymentsOnCancellation:
          metadata.layaway_refund_payments_on_cancellation !== "0",
        cancellationFeeType: metadata.layaway_cancellation_fee_type,
        cancellationFeeValue: metadata.layaway_cancellation_fee_value,
      }),
    };
  }

  private getPasswordPolicySummary(
    metadata: Record<string, string | undefined>,
  ) {
    return {
      minimumLength: normalizePolicyInteger(
        metadata.password_policy_minimum_length,
        8,
        4,
        128,
      ),
      requireUppercase: metadata.password_policy_require_uppercase !== "0",
      requireLowercase: metadata.password_policy_require_lowercase !== "0",
      requireNumber: metadata.password_policy_require_number !== "0",
      requireSymbol: metadata.password_policy_require_symbol === "1",
      temporaryPasswordMustChange:
        metadata.password_policy_temporary_must_change !== "0",
      passwordExpiryDays: normalizePolicyInteger(
        metadata.password_policy_expiry_days,
        0,
        0,
        999,
      ),
      passwordHistoryCount: normalizePolicyInteger(
        metadata.password_policy_history_count,
        0,
        0,
        24,
      ),
      lockoutThreshold: normalizePolicyInteger(
        metadata.password_policy_lockout_threshold,
        5,
        0,
        20,
      ),
      lockoutMinutes: normalizePolicyInteger(
        metadata.password_policy_lockout_minutes,
        15,
        0,
        1440,
      ),
      updatedAt: metadata.password_policy_updated_at ?? null,
    };
  }

  private getReceiptSettingsSummary(
    metadata: Record<string, string | undefined>,
  ): StoreReceiptSettingsSummary {
    const salesReceiptTemplateHtml =
      metadata.sales_receipt_template_html?.trim() || null;
    const templateMode =
      metadata.sales_receipt_template_mode === "linked" ||
      metadata.sales_receipt_template_mode === "legacy"
        ? metadata.sales_receipt_template_mode
        : salesReceiptTemplateHtml
          ? "legacy"
          : "default";

    return {
      currencyCode: metadata.currency_code ?? "GHS",
      timezone: metadata.timezone ?? "Africa/Accra",
      receiptHeader: metadata.receipt_header?.trim() || null,
      receiptFooter: metadata.receipt_footer?.trim() || null,
      salesReceiptTemplateCode:
        metadata.sales_receipt_template_code?.trim() || null,
      salesReceiptTemplateName:
        metadata.sales_receipt_template_name?.trim() || null,
      salesReceiptTemplateHtml,
      goodsReceiptTemplateCode:
        metadata.goods_receipt_template_code?.trim() || null,
      goodsReceiptTemplateName:
        metadata.goods_receipt_template_name?.trim() || null,
      goodsReceiptTemplateHtml:
        metadata.goods_receipt_template_html?.trim() || null,
      templateMode,
    };
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

  private async getActiveBasketId() {
    return this.metadataValue(this.getActiveBasketMetadataKey());
  }

  private async getBasketHeader(transactionId: string) {
    const result = await this.pool.query<BasketHeaderRow>(
      `SELECT
        txn.id,
        txn.transaction_no,
        txn.customer_id,
        customer.customer_no,
        customer.full_name AS customer_name,
        customer.customer_type,
        customer.loyalty_enrolled AS customer_loyalty_enrolled,
        customer.loyalty_tier AS customer_loyalty_tier,
        customer.loyalty_points_balance AS customer_loyalty_points_balance,
        txn.source_transaction_id,
        txn.source_transaction_no,
        txn.transaction_type,
        txn.status,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.loyalty_redemption_points,
        txn.loyalty_redemption_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.change_amount,
        txn.notes,
        txn.header_reference,
        txn.additional_details,
        txn.updated_at,
        txn.completed_at,
        txn.record_version
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       WHERE txn.id = $1
       LIMIT 1`,
      [transactionId],
    );

    return result.rows[0] ?? null;
  }

  private async getBasketLine(lineId: string) {
    const result = await this.pool.query<BasketLineRow>(
      `SELECT
        id,
        pos_transaction_id,
        product_id,
        line_intent,
        source_line_id,
        applied_promotion_code,
        applied_promotion_name,
        product_code_snapshot,
        product_variant_code_snapshot,
        product_name_snapshot,
        inventory_location_code,
        variant_size,
        variant_color,
        variant_attributes_snapshot,
        line_note,
        serial_numbers_json,
        batch_allocations_json,
        quantity,
        selling_unit_of_measure,
        base_unit_of_measure,
        uom_conversion_factor,
        base_quantity,
        unit_price,
        discount_amount,
        tax_amount,
        line_total,
        manual_price_override,
        manual_discount_override
       FROM pos_transaction_line
       WHERE id = $1
       LIMIT 1`,
      [lineId],
    );

    return result.rows[0] ?? null;
  }

  private async getBasketLineByProduct(
    transactionId: string,
    productCode: string,
    lineIntent: SyncPosLineIntent,
  ) {
    const result = await this.pool.query<BasketLineRow>(
      `SELECT
        id,
        pos_transaction_id,
        product_id,
        line_intent,
        source_line_id,
        applied_promotion_code,
        applied_promotion_name,
        product_code_snapshot,
        product_variant_code_snapshot,
        product_name_snapshot,
        inventory_location_code,
        variant_size,
        variant_color,
        variant_attributes_snapshot,
        line_note,
        serial_numbers_json,
        batch_allocations_json,
        quantity,
        selling_unit_of_measure,
        base_unit_of_measure,
        uom_conversion_factor,
        base_quantity,
        unit_price,
        discount_amount,
        tax_amount,
        line_total,
        manual_price_override,
        manual_discount_override
       FROM pos_transaction_line
       WHERE pos_transaction_id = $1
         AND product_code_snapshot = $2
         AND line_intent = $3
         AND source_line_id IS NULL
       LIMIT 1`,
      [transactionId, productCode, lineIntent],
    );

    return result.rows[0] ?? null;
  }

  private async getBasketLineBySourceLine(
    transactionId: string,
    sourceLineId: string,
    lineIntent: SyncPosLineIntent,
  ) {
    const result = await this.pool.query<BasketLineRow>(
      `SELECT
        id,
        pos_transaction_id,
        product_id,
        line_intent,
        source_line_id,
        applied_promotion_code,
        applied_promotion_name,
        product_code_snapshot,
        product_variant_code_snapshot,
        product_name_snapshot,
        inventory_location_code,
        variant_size,
        variant_color,
        variant_attributes_snapshot,
        line_note,
        serial_numbers_json,
        batch_allocations_json,
        quantity,
        selling_unit_of_measure,
        base_unit_of_measure,
        uom_conversion_factor,
        base_quantity,
        unit_price,
        discount_amount,
        tax_amount,
        line_total,
        manual_price_override,
        manual_discount_override
       FROM pos_transaction_line
       WHERE pos_transaction_id = $1
         AND source_line_id = $2
         AND line_intent = $3
       LIMIT 1`,
      [transactionId, sourceLineId, lineIntent],
    );

    return result.rows[0] ?? null;
  }

  private async getBasketLines(transactionId: string) {
    const result = await this.pool.query<BasketLineRow>(
      `SELECT
        id,
        pos_transaction_id,
        product_id,
        line_intent,
        source_line_id,
        applied_promotion_code,
        applied_promotion_name,
        product_code_snapshot,
        product_variant_code_snapshot,
        product_name_snapshot,
        inventory_location_code,
        variant_size,
        variant_color,
        variant_attributes_snapshot,
        line_note,
        serial_numbers_json,
        batch_allocations_json,
        quantity,
        selling_unit_of_measure,
        base_unit_of_measure,
        uom_conversion_factor,
        base_quantity,
        unit_price,
        discount_amount,
        tax_amount,
        line_total,
        manual_price_override,
        manual_discount_override
       FROM pos_transaction_line
       WHERE pos_transaction_id = $1
       ORDER BY line_intent DESC, product_name_snapshot ASC, id ASC`,
      [transactionId],
    );

    return result.rows;
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

    const result = await this.pool.query<ProductRow>(
      `SELECT
        id,
        product_code,
        product_name,
        product_type,
        short_name,
        description,
        primary_image_url,
        department_code,
        category_code,
        subcategory,
        unit_of_measure,
        taxable,
        tax_profile_code,
        tax_profile_name,
        tax_rate_percent,
        tax_inclusive,
        track_inventory,
        track_expiry,
        shelf_life_days,
        is_serialized,
        track_size,
        track_color,
        must_enter_price_at_pos,
        min_stock_level,
        reorder_point,
        safety_stock_level,
        catalog_membership_active,
        catalog_sort_order,
        unit_price,
        quantity_on_hand,
        updated_at
       FROM product_snapshot
       WHERE product_code = $1
       LIMIT 1`,
      [normalizedProductCode],
    );
    const product = result.rows[0] ?? null;

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
      batchAllocations: readInventoryBatchAllocations(
        line.batch_allocations_json,
      ),
      quantity: Number(asNumber(line.quantity).toFixed(3)),
      sellingUnitOfMeasure: line.selling_unit_of_measure,
      baseUnitOfMeasure: line.base_unit_of_measure,
      uomConversionFactor: Number(
        asNumber(line.uom_conversion_factor).toFixed(6),
      ),
      baseQuantity: Number(asNumber(line.base_quantity).toFixed(3)),
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
    const grossTotalAmount = Number(
      (asNumber(header.subtotal_amount) + asNumber(header.tax_amount)).toFixed(
        2,
      ),
    );
    const appliedPromotions =
      this.getPublicAppliedPromotionSummaries(basketLines);
    const loyaltyRedemption = await this.calculateBasketLoyaltyRedemption(
      header,
      grossTotalAmount,
    );
    const customerLoyaltyEnrolled = hasLocalLoyaltyAccount({
      loyalty_enrolled: header.customer_loyalty_enrolled,
      loyalty_tier: header.customer_loyalty_tier,
      loyalty_points_balance: header.customer_loyalty_points_balance,
    });

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
      customerLoyaltyEnrolled,
      customerLoyaltyTier: header.customer_loyalty_tier,
      customerLoyaltyPointsBalance: header.customer_id
        ? Math.max(
            0,
            Math.trunc(asNumber(header.customer_loyalty_points_balance)),
          )
        : null,
      loyaltyRedemptionAllowed: loyaltyRedemption.canRedeem,
      loyaltyRedemptionMessage: loyaltyRedemption.message,
      loyaltyRedemptionPoints: Math.trunc(
        asNumber(header.loyalty_redemption_points),
      ),
      loyaltyRedemptionAmount: Number(
        asNumber(header.loyalty_redemption_amount).toFixed(2),
      ),
      maxLoyaltyRedemptionPoints: loyaltyRedemption.maxRedeemablePoints,
      maxLoyaltyRedemptionAmount: loyaltyRedemption.maxRedeemableAmount,
      appliedPromotions,
      promotionStatusMessage:
        "PostgreSQL promotion pricing is waiting for the pricing adapter slice.",
      updatedAt: header.updated_at,
      lines,
    };
  }

  private getBasketLoyaltyCustomer(header: BasketHeaderRow) {
    if (!header.customer_id) {
      return null;
    }

    return {
      fullName:
        header.customer_name ?? header.customer_no ?? "Attached customer",
      loyaltyEnrolled: hasLocalLoyaltyAccount({
        loyalty_enrolled: header.customer_loyalty_enrolled,
        loyalty_tier: header.customer_loyalty_tier,
        loyalty_points_balance: header.customer_loyalty_points_balance,
      }),
      loyaltyPointsBalance: Math.max(
        0,
        Math.trunc(asNumber(header.customer_loyalty_points_balance)),
      ),
    };
  }

  private async calculateBasketLoyaltyRedemption(
    header: BasketHeaderRow,
    grossTotalAmount: number,
    requestedPoints?: number,
  ) {
    const metadata = await this.metadata();

    return calculateLoyaltyRedemption({
      customer: this.getBasketLoyaltyCustomer(header),
      totalAmount: grossTotalAmount,
      requestedPoints:
        requestedPoints === undefined
          ? Math.max(0, Math.trunc(asNumber(header.loyalty_redemption_points)))
          : Math.max(0, Math.trunc(requestedPoints)),
      policy: this.getLoyaltySettingsSummary(metadata),
    });
  }

  private getPublicAppliedPromotionSummaries(
    lines: Array<{
      applied_promotion_code: string | null;
      applied_promotion_name: string | null;
      discount_amount: string | number;
    }>,
  ) {
    const promotions = new Map<
      string,
      { promotionCode: string; promotionName: string; discountAmount: number }
    >();

    for (const line of lines) {
      const promotionCode = normalizePromotionCode(line.applied_promotion_code);
      const lineDiscountAmount = Number(
        asNumber(line.discount_amount).toFixed(2),
      );

      if (!promotionCode || lineDiscountAmount <= 0) {
        continue;
      }

      const existing = promotions.get(promotionCode);
      promotions.set(promotionCode, {
        promotionCode,
        promotionName:
          line.applied_promotion_name ??
          existing?.promotionName ??
          promotionCode,
        discountAmount: Number(
          ((existing?.discountAmount ?? 0) + lineDiscountAmount).toFixed(2),
        ),
      });
    }

    return [...promotions.values()]
      .sort((left, right) =>
        left.promotionName.localeCompare(right.promotionName),
      )
      .map<StoreBasketAppliedPromotionSummary>((promotion) => ({
        promotionCode: promotion.promotionCode,
        promotionName: promotion.promotionName,
        discountAmount: promotion.discountAmount,
      }));
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
    const result = await this.pool.query<BasketHeaderRow>(
      `SELECT
        txn.id,
        txn.transaction_no,
        txn.customer_id,
        customer.customer_no,
        customer.full_name AS customer_name,
        customer.customer_type,
        customer.loyalty_enrolled AS customer_loyalty_enrolled,
        customer.loyalty_tier AS customer_loyalty_tier,
        customer.loyalty_points_balance AS customer_loyalty_points_balance,
        txn.source_transaction_id,
        txn.source_transaction_no,
        txn.transaction_type,
        txn.status,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.loyalty_redemption_points,
        txn.loyalty_redemption_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.change_amount,
        txn.notes,
        txn.updated_at,
        txn.completed_at,
        txn.record_version
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       WHERE txn.status = 'PARKED'
       ORDER BY txn.updated_at DESC
       LIMIT 8`,
    );

    return Promise.all(
      result.rows
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
      throw new Error("Open a cashier shift before starting a sale basket.");
    }

    const transactionId = randomUUID();
    const transactionNo = await this.nextPosTransactionNumber();

    await this.pool.query(
      `INSERT INTO pos_transaction (
        id,
        transaction_no,
        shift_id,
        customer_id,
        source_transaction_id,
        source_transaction_no,
        transaction_type,
        status,
        subtotal_amount,
        discount_amount,
        loyalty_redemption_points,
        loyalty_redemption_amount,
        tax_amount,
        total_amount,
        paid_amount,
        change_amount,
        notes,
        completed_at,
        record_version,
        deleted_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PARKED', 0, 0, 0, 0, 0, 0, 0, 0, $8, NULL, 1, NULL, $9)`,
      [
        transactionId,
        transactionNo,
        shift.id,
        sourceTransaction?.customerId ?? null,
        sourceTransaction?.id ?? null,
        sourceTransaction?.transactionNo ?? null,
        transactionType,
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
      ],
    );
    await this.setMetadata(this.getActiveBasketMetadataKey(), transactionId);

    const basket = await this.getBasketHeader(transactionId);

    if (!basket) {
      throw new Error("Flash ERP could not create the active sale basket.");
    }

    return basket;
  }

  private async requireActiveBasket() {
    const basketId = await this.getActiveBasketId();

    if (!basketId) {
      throw new Error("Flash ERP does not have an active basket yet.");
    }

    const basket = await this.getBasketHeader(basketId);

    if (!basket || basket.status !== "PARKED") {
      await this.deleteMetadata(this.getActiveBasketMetadataKey());
      throw new Error("Flash ERP could not reopen the active basket.");
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
    const loyaltyRedemption = header
      ? await this.calculateBasketLoyaltyRedemption(header, grossTotalAmount)
      : {
          appliedPoints: 0,
          appliedAmount: 0,
        };
    const totalAmount = Number(
      (grossTotalAmount - loyaltyRedemption.appliedAmount).toFixed(2),
    );

    await this.pool.query(
      `UPDATE pos_transaction
       SET subtotal_amount = $1,
           discount_amount = $2,
           loyalty_redemption_points = $3,
           loyalty_redemption_amount = $4,
           tax_amount = $5,
           total_amount = $6,
           updated_at = $7,
           record_version = record_version + 1
       WHERE id = $8`,
      [
        subtotalAmount,
        discountAmount,
        loyaltyRedemption.appliedPoints,
        loyaltyRedemption.appliedAmount,
        taxAmount,
        totalAmount,
        updatedAt,
        transactionId,
      ],
    );
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
        (method) => method.paymentMethod === "CASH",
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
    const result = await this.pool.query<ReceiptHeaderRow>(
      `SELECT
        txn.id,
        txn.transaction_no,
        txn.customer_id,
        customer.customer_no,
        customer.full_name AS customer_name,
        customer.customer_type,
        customer.loyalty_enrolled AS customer_loyalty_enrolled,
        customer.loyalty_tier AS customer_loyalty_tier,
        customer.loyalty_points_balance AS customer_loyalty_points_balance,
        txn.source_transaction_id,
        txn.source_transaction_no,
        txn.transaction_type,
        txn.status,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.loyalty_redemption_points,
        txn.loyalty_redemption_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.change_amount,
        txn.notes,
        txn.header_reference,
        txn.additional_details,
        txn.updated_at,
        txn.completed_at,
        txn.record_version,
        shift.shift_no,
        COALESCE(txn.cashier_code, shift.cashier_code) AS cashier_code
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       WHERE UPPER(txn.transaction_no) = UPPER($1)
         AND txn.status = 'COMPLETED'
       LIMIT 1`,
      [transactionNo],
    );

    return result.rows[0] ?? null;
  }

  private async getReceiptHeaderById(transactionId: string) {
    const result = await this.pool.query<ReceiptHeaderRow>(
      `SELECT
        txn.id,
        txn.transaction_no,
        txn.customer_id,
        customer.customer_no,
        customer.full_name AS customer_name,
        customer.customer_type,
        customer.loyalty_enrolled AS customer_loyalty_enrolled,
        customer.loyalty_tier AS customer_loyalty_tier,
        customer.loyalty_points_balance AS customer_loyalty_points_balance,
        txn.source_transaction_id,
        txn.source_transaction_no,
        txn.transaction_type,
        txn.status,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.loyalty_redemption_points,
        txn.loyalty_redemption_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.change_amount,
        txn.notes,
        txn.header_reference,
        txn.additional_details,
        txn.updated_at,
        txn.completed_at,
        txn.record_version,
        shift.shift_no,
        COALESCE(txn.cashier_code, shift.cashier_code) AS cashier_code
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       WHERE txn.id = $1
         AND txn.status = 'COMPLETED'
       LIMIT 1`,
      [transactionId],
    );

    return result.rows[0] ?? null;
  }

  private async getReceiptPaymentRows(transactionId: string) {
    const result = await this.pool.query<PosPaymentRow>(
      `SELECT
        id,
        tender_method_code,
        tender_method_name,
        bank_account_id,
        bank_code,
        bank_name,
        bank_branch_code,
        bank_branch_name,
        bank_account_number,
        bank_account_name,
        method,
        amount,
        reference,
        payment_purpose,
        received_shift_id,
        received_shift_no,
        received_terminal_code,
        received_cashier_code,
        received_at
       FROM pos_payment
       WHERE pos_transaction_id = $1
       ORDER BY received_at ASC, id ASC`,
      [transactionId],
    );

    return result.rows;
  }

  private async getCorrectedReceiptLineQuantities(
    sourceTransactionId: string,
    sourceLineId: string,
    excludeLineId: string | null = null,
  ) {
    const result = await this.pool.query<{
      returned_quantity: string | number | null;
      pending_quantity: string | number | null;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN correction_txn.status = 'COMPLETED' THEN correction_line.quantity ELSE 0 END), 0) AS returned_quantity,
        COALESCE(SUM(CASE WHEN correction_txn.status = 'PARKED' THEN correction_line.quantity ELSE 0 END), 0) AS pending_quantity
       FROM pos_transaction_line AS correction_line
       INNER JOIN pos_transaction AS correction_txn
         ON correction_txn.id = correction_line.pos_transaction_id
       WHERE correction_line.source_line_id = $2
         AND correction_line.line_intent = 'RETURN'
         AND correction_txn.source_transaction_id = $1
         AND correction_txn.status IN ('COMPLETED', 'PARKED')
         AND ($3::text IS NULL OR correction_line.id <> $3)`,
      [sourceTransactionId, sourceLineId, excludeLineId],
    );
    const row = result.rows[0];

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
          sellingUnitOfMeasure: line.selling_unit_of_measure,
          baseUnitOfMeasure: line.base_unit_of_measure,
          uomConversionFactor: Number(
            asNumber(line.uom_conversion_factor).toFixed(6),
          ),
          baseQuantitySold: Number(asNumber(line.base_quantity).toFixed(3)),
          unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
          taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
          lineTotal: Number(asNumber(line.line_total).toFixed(2)),
        };
      }),
    );
  }

  private async getRecentTransactions() {
    const result = await this.pool.query<TransactionRow>(
      `SELECT
        txn.transaction_no,
        txn.source_transaction_no,
        txn.transaction_type,
        txn.status,
        txn.total_amount,
        customer.customer_no,
        customer.full_name AS customer_name,
        customer.customer_type,
        shift.terminal_code,
        COALESCE(txn.cashier_code, shift.cashier_code) AS cashier_code,
        shift.shift_no,
        (
          SELECT count(*)
          FROM pos_transaction_line AS line
          WHERE line.pos_transaction_id = txn.id
        ) AS line_count,
        txn.updated_at,
        txn.completed_at
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       ORDER BY txn.updated_at DESC, txn.transaction_no DESC
       LIMIT 200`,
    );

    return result.rows.map<StoreTransactionSummary>((transaction) => ({
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
    const result = await this.pool.query<CustomerAccountEntryRow>(
      `SELECT
        id,
        entry_no,
        customer_id,
        customer_no,
        customer_name,
        entry_type,
        payment_method,
        tender_method_code,
        tender_method_name,
        amount,
        reference,
        note,
        shift_id,
        shift_no,
        cashier_code,
        synced_at,
        occurred_at,
        updated_at
       FROM customer_account_entry
       ORDER BY occurred_at DESC, entry_no DESC
       LIMIT 30`,
    );

    return result.rows.map<StoreCustomerAccountEntrySummary>((row) => ({
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

  private async getSalesOrderRows(whereSql = "", params: unknown[] = []) {
    const result = await this.pool.query<SalesOrderRow>(
      `SELECT
        sales_order.id,
        sales_order.order_no,
        sales_order.source_transaction_id,
        sales_order.source_transaction_no,
        sales_order.customer_id,
        sales_order.customer_no,
        sales_order.customer_name,
        sales_order.order_type,
        sales_order.status,
        sales_order.total_amount,
        sales_order.deposit_amount,
        sales_order.paid_amount,
        sales_order.balance_amount,
        sales_order.deposit_tender_method_code,
        sales_order.deposit_tender_method_name,
        sales_order.deposit_payment_method,
        sales_order.deposit_reference,
        sales_order.deposit_paid_at,
        sales_order.layaway_policy_snapshot_json,
        sales_order.minimum_deposit_amount,
        sales_order.reservation_status,
        sales_order.reservation_created_at,
        sales_order.reservation_released_at,
        sales_order.layaway_expires_at,
        sales_order.expired_at,
        sales_order.cancellation_fee_amount,
        sales_order.refunded_amount,
        sales_order.record_version,
        COUNT(line.id) AS line_count,
        COALESCE(SUM(line.quantity), 0) AS item_count,
        sales_order.operator_name,
        (
          SELECT payment.received_cashier_code
          FROM pos_payment AS payment
          WHERE payment.pos_transaction_id = sales_order.source_transaction_id
            AND payment.payment_purpose = 'SALES_ORDER_DEPOSIT'
          ORDER BY payment.received_at ASC, payment.id ASC
          LIMIT 1
        ) AS deposit_collected_by,
        (
          SELECT transaction_row.cashier_code
          FROM pos_transaction AS transaction_row
          WHERE transaction_row.id = sales_order.fulfilled_transaction_id
          LIMIT 1
        ) AS sale_completed_by,
        (
          SELECT payment.received_cashier_code
          FROM pos_payment AS payment
          WHERE payment.pos_transaction_id = sales_order.source_transaction_id
            AND payment.payment_purpose = 'SALES_ORDER_BALANCE'
          ORDER BY payment.received_at DESC, payment.id DESC
          LIMIT 1
        ) AS balance_collected_by,
        sales_order.note,
        sales_order.fulfilled_transaction_id,
        sales_order.fulfilled_transaction_no,
        sales_order.synced_at,
        sales_order.created_at,
        sales_order.fulfilled_at,
        sales_order.cancelled_at,
        sales_order.updated_at
       FROM sales_order
       LEFT JOIN pos_transaction_line AS line
         ON line.pos_transaction_id = sales_order.source_transaction_id
       ${whereSql}
       GROUP BY
        sales_order.id,
        sales_order.order_no,
        sales_order.source_transaction_id,
        sales_order.source_transaction_no,
        sales_order.customer_id,
        sales_order.customer_no,
        sales_order.customer_name,
        sales_order.order_type,
        sales_order.status,
        sales_order.total_amount,
        sales_order.deposit_amount,
        sales_order.paid_amount,
        sales_order.balance_amount,
        sales_order.deposit_tender_method_code,
        sales_order.deposit_tender_method_name,
        sales_order.deposit_payment_method,
        sales_order.deposit_reference,
        sales_order.deposit_paid_at,
        sales_order.layaway_policy_snapshot_json,
        sales_order.minimum_deposit_amount,
        sales_order.reservation_status,
        sales_order.reservation_created_at,
        sales_order.reservation_released_at,
        sales_order.layaway_expires_at,
        sales_order.expired_at,
        sales_order.cancellation_fee_amount,
        sales_order.refunded_amount,
        sales_order.record_version,
        sales_order.operator_name,
        sales_order.note,
        sales_order.fulfilled_transaction_id,
        sales_order.fulfilled_transaction_no,
        sales_order.synced_at,
        sales_order.created_at,
        sales_order.fulfilled_at,
        sales_order.cancelled_at,
        sales_order.updated_at
       ORDER BY
        CASE sales_order.status WHEN 'OPEN' THEN 0 WHEN 'FULFILLED' THEN 1 ELSE 2 END,
        sales_order.updated_at DESC
       LIMIT 60`,
      params,
    );

    return result.rows;
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
      orderType: row.order_type,
      status: row.status,
      totalAmount: Number(asNumber(row.total_amount).toFixed(2)),
      depositAmount: Number(asNumber(row.deposit_amount).toFixed(2)),
      paidAmount: Number(asNumber(row.paid_amount).toFixed(2)),
      balanceAmount: Number(asNumber(row.balance_amount).toFixed(2)),
      depositTenderMethodCode: row.deposit_tender_method_code,
      depositTenderMethodName: row.deposit_tender_method_name,
      depositPaymentMethod: row.deposit_payment_method,
      depositReference: row.deposit_reference,
      depositPaidAt: row.deposit_paid_at,
      minimumDepositAmount: Number(
        asNumber(row.minimum_deposit_amount).toFixed(2),
      ),
      reservationStatus: row.reservation_status,
      reservationCreatedAt: row.reservation_created_at,
      reservationReleasedAt: row.reservation_released_at,
      layawayExpiresAt: row.layaway_expires_at,
      expiredAt: row.expired_at,
      cancellationFeeAmount: Number(
        asNumber(row.cancellation_fee_amount).toFixed(2),
      ),
      refundedAmount: Number(asNumber(row.refunded_amount).toFixed(2)),
      lineCount: Math.trunc(asNumber(row.line_count)),
      itemCount: Number(asNumber(row.item_count).toFixed(3)),
      operatorName: row.operator_name,
      depositCollectedBy:
        row.deposit_collected_by ??
        (asNumber(row.deposit_amount) > 0 ? row.operator_name : null),
      saleCompletedBy: row.sale_completed_by ?? row.balance_collected_by,
      balanceCollectedBy:
        row.balance_collected_by ??
        (row.status === "FULFILLED" &&
        asNumber(row.total_amount) - asNumber(row.deposit_amount) - asNumber(row.balance_amount) > 0
          ? row.sale_completed_by
          : null),
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
    const rows = await this.getSalesOrderRows("WHERE sales_order.id = $1", [
      orderId,
    ]);
    return rows[0] ?? null;
  }

  private async getLayawaySettings() {
    const metadata = await this.metadata();

    return normalizeLayawaySettings({
      enabled: metadata.layaway_enabled === "1",
      reserveStockOnDeposit: metadata.layaway_reserve_stock_on_deposit !== "0",
      minimumDepositPercent: metadata.layaway_minimum_deposit_percent,
      requireFullPaymentBeforeFulfilment:
        metadata.layaway_require_full_payment_before_fulfilment !== "0",
      refundPaymentsOnCancellation:
        metadata.layaway_refund_payments_on_cancellation !== "0",
      cancellationFeeType: metadata.layaway_cancellation_fee_type,
      cancellationFeeValue: metadata.layaway_cancellation_fee_value,
    });
  }

  private async getSalesOrderReservationPayloads(
    salesOrderId: string,
  ): Promise<NonNullable<StoreSalesOrderRecordedPayload["reservations"]>> {
    const result = await this.pool.query<{
      id: string;
      sales_order_line_id: string;
      inventory_location_code: string | null;
      product_code: string;
      product_variant_code: string | null;
      base_unit_of_measure: string;
      base_quantity: string | number;
      status: NonNullable<StoreSalesOrderRecordedPayload["reservations"]>[number]["status"];
      release_reason: string | null;
      created_at: string;
      released_at: string | null;
    }>(
      `SELECT id, sales_order_line_id, inventory_location_code, product_code,
              product_variant_code, base_unit_of_measure, base_quantity, status,
              release_reason, created_at, released_at
       FROM sales_order_inventory_reservation
       WHERE sales_order_id = $1
       ORDER BY created_at ASC, id ASC`,
      [salesOrderId],
    );

    return result.rows.map((row) => ({
      reservationId: row.id,
      salesOrderLineId: row.sales_order_line_id,
      inventoryLocationCode: row.inventory_location_code,
      productCode: row.product_code,
      productVariantCode: row.product_variant_code,
      baseUnitOfMeasure: row.base_unit_of_measure,
      baseQuantity: Number(asNumber(row.base_quantity).toFixed(3)),
      status: row.status,
      releaseReason: row.release_reason,
      createdAt: row.created_at,
      releasedAt: row.released_at,
    }));
  }

  private async buildSalesOrderLifecyclePayload(
    order: SalesOrderRow,
    overrides: Partial<StoreSalesOrderRecordedPayload> = {},
  ): Promise<StoreSalesOrderRecordedPayload> {
    const metadata = await this.metadata();

    return {
      orderId: order.id,
      orderNo: order.order_no,
      storeCode: metadata.store_code ?? defaultStoreConfig.storeCode,
      terminalCode: this.getTerminalCode(),
      sourceTransactionId: order.source_transaction_id,
      sourceTransactionNo: order.source_transaction_no,
      customerId: order.customer_id,
      customerNo: order.customer_no,
      customerName: order.customer_name,
      orderType: order.order_type,
      totalAmount: Number(asNumber(order.total_amount).toFixed(2)),
      depositAmount: Number(asNumber(order.deposit_amount).toFixed(2)),
      paidAmount: Number(asNumber(order.paid_amount).toFixed(2)),
      balanceAmount: Number(asNumber(order.balance_amount).toFixed(2)),
      depositTenderMethodCode: order.deposit_tender_method_code,
      depositTenderMethodName: order.deposit_tender_method_name,
      depositPaymentMethod: order.deposit_payment_method,
      depositReference: order.deposit_reference,
      depositPaidAt: order.deposit_paid_at,
      layawayPolicySnapshotJson: order.layaway_policy_snapshot_json,
      minimumDepositAmount: Number(asNumber(order.minimum_deposit_amount).toFixed(2)),
      reservationStatus: order.reservation_status,
      reservationCreatedAt: order.reservation_created_at,
      reservationReleasedAt: order.reservation_released_at,
      layawayExpiresAt: order.layaway_expires_at,
      expiredAt: order.expired_at,
      cancellationFeeAmount: Number(asNumber(order.cancellation_fee_amount).toFixed(2)),
      refundedAmount: Number(asNumber(order.refunded_amount).toFixed(2)),
      status: order.status,
      operatorName: order.operator_name,
      note: order.note,
      createdAt: order.created_at,
      fulfilledTransactionId: order.fulfilled_transaction_id,
      fulfilledTransactionNo: order.fulfilled_transaction_no,
      fulfilledAt: order.fulfilled_at,
      cancelledAt: order.cancelled_at,
      reservations: await this.getSalesOrderReservationPayloads(order.id),
      ...overrides,
    };
  }

  private async getSalesOrderSummaries() {
    return (await this.getSalesOrderRows()).map((row) =>
      this.toSalesOrderSummary(row),
    );
  }

  private async getRecentEodReconciliationSummaries() {
    const result = await this.pool.query<EodReconciliationRow>(
      `SELECT
        id,
        reconciliation_no,
        shift_id,
        shift_no,
        cashier_code,
        expected_cash_amount,
        declared_cash_amount,
        variance_amount,
        net_sales_amount,
        cash_tendered_amount,
        non_cash_tendered_amount,
        transaction_count,
        operator_name,
        note,
        synced_at,
        reconciled_at,
        updated_at
       FROM eod_reconciliation
       ORDER BY reconciled_at DESC
       LIMIT 30`,
    );

    return result.rows.map<StoreEodReconciliationSummary>((row) => ({
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
    const result = await this.pool.query<EodReconciliationRow>(
      `SELECT
        id,
        reconciliation_no,
        shift_id,
        shift_no,
        cashier_code,
        expected_cash_amount,
        declared_cash_amount,
        variance_amount,
        net_sales_amount,
        cash_tendered_amount,
        non_cash_tendered_amount,
        transaction_count,
        operator_name,
        note,
        synced_at,
        reconciled_at,
        updated_at
       FROM eod_reconciliation
       WHERE id = $1
       LIMIT 1`,
      [reconciliationId],
    );

    return result.rows[0] ?? null;
  }

  private async getRecentBankingDepositSummaries() {
    const result = await this.pool.query<BankingDepositRow>(
      `SELECT
        id,
        deposit_no,
        reconciliation_id,
        reconciliation_no,
        shift_id,
        shift_no,
        amount,
        bank_name,
        reference,
        operator_name,
        note,
        synced_at,
        deposited_at,
        updated_at
       FROM banking_deposit
       ORDER BY deposited_at DESC
       LIMIT 30`,
    );

    return result.rows.map<StoreBankingDepositSummary>((row) => ({
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

  private async resolveBasketUnitPrice(
    productCode: string,
    customerId: string | null,
    fallbackUnitPrice: string | number,
  ) {
    const defaultPrice = async () => {
      const result = await this.pool.query<{ unit_price: string | number }>(
        `SELECT unit_price
         FROM price_list_entry_snapshot
         WHERE product_code = $1
           AND status = 'ACTIVE'
           AND is_default = 1
         ORDER BY updated_at DESC, price_list_name ASC
         LIMIT 1`,
        [productCode],
      );

      return result.rows[0]?.unit_price ?? fallbackUnitPrice;
    };

    if (!customerId) {
      return Number(asNumber(await defaultPrice()).toFixed(2));
    }

    const customerResult = await this.pool.query<{
      customer_type: string | null;
      loyalty_tier: string | null;
    }>(
      `SELECT customer_type, loyalty_tier
       FROM customer
       WHERE id = $1
         AND deleted_at IS NULL
         AND status = 'ACTIVE'
       LIMIT 1`,
      [customerId],
    );
    const customer = customerResult.rows[0] ?? null;

    if (!customer) {
      return Number(asNumber(await defaultPrice()).toFixed(2));
    }

    const customerType = customer.customer_type?.trim().toUpperCase() ?? null;
    const loyaltyTier = customer.loyalty_tier?.trim() ?? null;

    if (loyaltyTier) {
      const tierResult = await this.pool.query<{ unit_price: string | number }>(
        `SELECT unit_price
         FROM price_list_entry_snapshot
         WHERE product_code = $1
           AND status = 'ACTIVE'
           AND loyalty_tier IS NOT NULL
           AND lower(loyalty_tier) = lower($2)
           AND (customer_type IS NULL OR customer_type = $3)
         ORDER BY CASE WHEN customer_type = $3 THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1`,
        [productCode, loyaltyTier, customerType],
      );

      if (tierResult.rows[0]) {
        return Number(asNumber(tierResult.rows[0].unit_price).toFixed(2));
      }
    }

    if (customerType) {
      const profileResult = await this.pool.query<{
        unit_price: string | number;
      }>(
        `SELECT unit_price
         FROM price_list_entry_snapshot
         WHERE product_code = $1
           AND status = 'ACTIVE'
           AND customer_type = $2
           AND loyalty_tier IS NULL
         ORDER BY updated_at DESC, price_list_name ASC
         LIMIT 1`,
        [productCode, customerType],
      );

      if (profileResult.rows[0]) {
        return Number(asNumber(profileResult.rows[0].unit_price).toFixed(2));
      }
    }

    return Number(asNumber(await defaultPrice()).toFixed(2));
  }

  private async repriceBasketSaleLinesForCustomer(
    transactionId: string,
    customerId: string | null,
  ) {
    const result = await this.pool.query<{
      id: string;
      product_code: string;
      quantity: string | number;
      taxable: string | number;
      tax_rate_percent: string | number | null;
      tax_inclusive: string | number;
      unit_price: string | number;
    }>(
      `SELECT
        line.id,
        product.product_code,
        line.quantity,
        product.taxable,
        product.tax_rate_percent,
        product.tax_inclusive,
        line.unit_price
       FROM pos_transaction_line AS line
       INNER JOIN product_snapshot AS product
         ON product.id = line.product_id
       WHERE line.pos_transaction_id = $1
         AND line.line_intent = 'SALE'
         AND line.source_line_id IS NULL
         AND COALESCE(line.manual_price_override, 0) = 0`,
      [transactionId],
    );

    for (const row of result.rows) {
      const unitPrice = await this.resolveBasketUnitPrice(
        row.product_code,
        customerId,
        row.unit_price,
      );
      const lineAmounts = calculateSaleLineAmounts({
        unitPrice,
        quantity: asNumber(row.quantity),
        taxable: asBooleanFlag(row.taxable),
        taxRatePercent: asNullableNumber(row.tax_rate_percent),
        taxInclusive: asBooleanFlag(row.tax_inclusive),
      });

      await this.pool.query(
        `UPDATE pos_transaction_line
         SET unit_price = $1,
             discount_amount = $2,
             tax_amount = $3,
             line_total = $4
         WHERE id = $5`,
        [
          unitPrice,
          lineAmounts.discountAmount,
          lineAmounts.taxAmount,
          lineAmounts.lineTotal,
          row.id,
        ],
      );
    }
  }

  private async assertBasketIsEditable(basketId: string) {
    const result = await this.pool.query<{ order_no: string }>(
      "SELECT order_no FROM sales_order WHERE source_transaction_id = $1 AND status = 'OPEN' LIMIT 1",
      [basketId],
    );

    if (result.rows[0]) {
      throw new Error(
        `${result.rows[0].order_no} is locked for fulfilment. Exit fulfilment to return it to pending orders.`,
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

    const configuredSellingUnits = parseProductSellingUnits(
      match.selling_units_json,
    );
    const selectedVariantCode = selectedVariant?.variant_code ?? null;
    const scopedSellingUnits = configuredSellingUnits.filter(
      (unit) =>
        (unit.productVariantCode?.trim().toUpperCase() ?? null) ===
        (selectedVariantCode?.trim().toUpperCase() ?? null),
    );
    const barcodeSellingUnit = match.barcode_type?.startsWith("SELLING_UOM:")
      ? match.barcode_type.slice("SELLING_UOM:".length)
      : null;
    const sellingUom = resolvePosSellingUom({
      baseUnitOfMeasure: match.base_unit_of_measure,
      baseUnitPrice: asNumber(selectedVariant?.unit_price ?? match.unit_price),
      quantity: normalizedQuantity,
      selectedUnitOfMeasure: input.sellingUnitOfMeasure ?? barcodeSellingUnit,
      scannedBarcode: match.matched_on === "barcode" ? match.barcode_code : null,
      sellingUnits: scopedSellingUnits,
      serialized: asBooleanFlag(match.is_serialized),
    });

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

    const automaticUnitPrice =
      lineIntent === "SALE" &&
      sellingUom.sellingUnitOfMeasure ===
        match.base_unit_of_measure.trim().toUpperCase() &&
      sellingUom.uomConversionFactor === 1
        ? await this.resolveBasketUnitPrice(
            match.product_code,
            basket.customer_id,
            selectedVariant?.unit_price ?? match.unit_price,
          )
        : sellingUom.unitPrice;
    const unitPrice = Number(
      asNumber(requestedUnitPrice ?? automaticUnitPrice).toFixed(2),
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
      .reduce((sum, line) => sum + asNumber(line.base_quantity), 0);
    const isSerialized = asBooleanFlag(match.is_serialized);
    const requestedSerialNumbers = input.serialNumbers ?? [];
    const validateSerialSelection =
      isSerialized &&
      (!deferInventoryValidation || requestedSerialNumbers.length > 0);
    const nextSerialNumbers = validateSerializedLineInput({
      isSerialized: validateSerialSelection,
      productName: match.product_name,
      quantity: sellingUom.baseQuantity,
      serialNumbers: requestedSerialNumbers,
    });
    const requestedQuantity = Number(
      (currentBasketProductQuantity + sellingUom.baseQuantity).toFixed(3),
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
    const preferredBatchAllocations =
      !deferInventoryValidation &&
      tracksInventoryForSale(match) &&
      asBooleanFlag(match.track_expiry) &&
      match.sales_location_code
        ? allocateInventoryBatchesFefo({
            productName: match.product_name,
            quantity: sellingUom.baseQuantity,
            preferredBatchId: optionalSetupText(input.preferredBatchId),
            batches: (
              await this.pool.query<{
                id: string;
                batch_no: string;
                manufactured_at: string | null;
                expiry_date: string;
                quantity_on_hand: string | number;
                status: string;
              }>(
                `SELECT id, batch_no, manufactured_at, expiry_date, quantity_on_hand, status
                 FROM inventory_batch_registry
                 WHERE inventory_location_code = $1
                   AND product_code = $2
                   AND quantity_on_hand > 0
                 ORDER BY expiry_date ASC, manufactured_at ASC, batch_no ASC`,
                [match.sales_location_code, match.product_code],
              )
            ).rows.map((batch) => ({
              batchId: batch.id,
              batchNo: batch.batch_no,
              manufacturedAt: batch.manufactured_at,
              expiryDate: batch.expiry_date,
              quantityOnHand: asNumber(batch.quantity_on_hand),
              status: batch.status,
            })),
          })
        : [];

    await this.pool.query(
      `INSERT INTO pos_transaction_line (
        id,
        pos_transaction_id,
        product_id,
        line_intent,
        source_line_id,
        product_code_snapshot,
        product_variant_code_snapshot,
        product_name_snapshot,
        variant_size,
        variant_color,
        variant_attributes_snapshot,
        line_note,
        serial_numbers_json,
        batch_allocations_json,
        quantity,
        selling_unit_of_measure,
        base_unit_of_measure,
        uom_conversion_factor,
        base_quantity,
        unit_price,
        discount_amount,
        tax_amount,
        line_total,
        manual_price_override,
        manual_discount_override
      ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 0)`,
      [
        randomUUID(),
        basket.id,
        match.id,
        lineIntent,
        match.product_code,
        selectedVariant?.variant_code ?? null,
        match.product_name,
        variantSize,
        variantColor,
        variantAttributesSnapshot,
        lineNote,
        writeSerializedLineNumbers(nextSerialNumbers),
        writeInventoryBatchAllocations(preferredBatchAllocations),
        normalizedQuantity,
        sellingUom.sellingUnitOfMeasure,
        sellingUom.baseUnitOfMeasure,
        sellingUom.uomConversionFactor,
        sellingUom.baseQuantity,
        unitPrice,
        lineAmounts.discountAmount,
        lineAmounts.taxAmount,
        lineAmounts.lineTotal,
        requestedUnitPrice === null ? 0 : 1,
      ],
    );

    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${match.product_name} was added to the PostgreSQL active basket.`,
      startedAt: timestamp,
    });

    return {
      message:
        lineIntent === "RETURN"
          ? `Flash ERP added ${match.product_name} as a returned item in the active basket.`
          : `Flash ERP added ${match.product_name} to the active basket.`,
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
            ? `Flash ERP captured ${match.product_name} from barcode ${match.barcode_code} on the shared PostgreSQL store database.`
            : `Flash ERP captured ${match.product_name} on the shared PostgreSQL store database.`
          : match.matched_on === "barcode" && match.barcode_code
            ? `Flash ERP captured ${match.product_name} from barcode ${match.barcode_code} on the shared PostgreSQL store database and queued the sale for enterprise sync.`
            : `Flash ERP captured ${match.product_name} on the shared PostgreSQL store database and queued the sale for enterprise sync.`,
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
    const result = await this.pool.query<ProductRow>(
      `SELECT
        product.id,
        product.product_code,
        product.product_name,
        product.product_type,
        product.short_name,
        product.description,
        product.primary_image_url,
        product.department_code,
        product.category_code,
        product.subcategory,
        product.unit_of_measure,
        product.taxable,
        product.tax_profile_code,
        product.tax_profile_name,
        product.tax_rate_percent,
        product.tax_inclusive,
        product.track_inventory,
        product.is_serialized,
        product.must_enter_price_at_pos,
        product.unit_price,
        product.quantity_on_hand,
        product.updated_at
       FROM product_snapshot AS product
       LEFT JOIN inventory_location_balance AS balance
         ON balance.product_code = product.product_code
        AND balance.location_code = $1
       WHERE product.must_enter_price_at_pos = 0
         AND (
          product.product_type = 'SERVICE'
          OR
          product.track_inventory = 0
          OR COALESCE(balance.quantity_on_hand, product.quantity_on_hand) > 0
        )
       ORDER BY product.is_serialized ASC, product.product_code ASC
       LIMIT 1`,
      [salesLocationCode],
    );
    const product = result.rows[0] ?? null;

    if (!product) {
      throw new Error(
        "Flash ERP could not find a saleable product in the shared PostgreSQL store database for demo capture.",
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
        ? "A local demo sale was captured on the shared PostgreSQL store database."
        : "A local demo sale was captured on the shared PostgreSQL store database and queued for enterprise sync.",
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
        "PostgreSQL return and exchange basket lines are waiting for the receipt-correction adapter slice.",
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
    const scopedSellingUnits = parseProductSellingUnits(
      product.selling_units_json,
    ).filter(
      (unit) =>
        (unit.productVariantCode?.trim().toUpperCase() ?? null) ===
        (line.product_variant_code_snapshot?.trim().toUpperCase() ?? null),
    );
    const standardSellingUom = resolvePosSellingUom({
      baseUnitOfMeasure: product.base_unit_of_measure,
      baseUnitPrice: asNumber(selectedVariant?.unit_price ?? product.unit_price),
      quantity: normalizedQuantity,
      selectedUnitOfMeasure: line.selling_unit_of_measure,
      sellingUnits: scopedSellingUnits,
      serialized: asBooleanFlag(product.is_serialized),
    });
    const normalizedBaseQuantity = standardSellingUom.baseQuantity;
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
    const standardUnitPrice = Number(
      asNumber(standardSellingUom.unitPrice).toFixed(2),
    );
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

    if (
      asBooleanFlag(product.track_inventory) &&
      !isServiceProductType(product.product_type) &&
      !deferInventoryValidation
    ) {
      const availableQuantity = asNumber(
        selectedVariant?.quantity_on_hand ??
          product.sales_location_quantity ??
          product.quantity_on_hand,
      );
      const basketBaseQuantity = (await this.getBasketLines(basket.id))
        .filter(
          (candidate) =>
            candidate.id !== line.id &&
            candidate.product_code_snapshot === line.product_code_snapshot &&
            (candidate.product_variant_code_snapshot ?? null) ===
              (line.product_variant_code_snapshot ?? null) &&
            candidate.line_intent === "SALE" &&
            candidate.source_line_id === null,
        )
        .reduce(
          (sum, candidate) => sum + asNumber(candidate.base_quantity),
          normalizedBaseQuantity,
        );

      if (availableQuantity < basketBaseQuantity) {
        throw new Error(
          `Only ${Number(asNumber(availableQuantity).toFixed(3))} unit(s) of ${product.product_name} are available in the local sales position.`,
        );
      }
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
      quantity: normalizedBaseQuantity,
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

    await this.pool.query(
      `UPDATE pos_transaction_line
       SET serial_numbers_json = $1,
           quantity = $2,
           base_quantity = $3,
           unit_price = $4,
           applied_promotion_code = $5,
           applied_promotion_name = $6,
           discount_amount = $7,
           tax_amount = $8,
           line_total = $9,
           manual_price_override = $10,
           manual_discount_override = $11
       WHERE id = $12`,
      [
        writeSerializedLineNumbers(nextSerialNumbers),
        normalizedQuantity,
        normalizedBaseQuantity,
        unitPrice,
        nextAppliedPromotionCode,
        nextAppliedPromotionName,
        lineAmounts.discountAmount,
        lineAmounts.taxAmount,
        lineAmounts.lineTotal,
        input.clearPricingOverride === true
          ? 0
          : requestedUnitPrice === undefined
            ? asBooleanFlag(line.manual_price_override) ? 1 : 0
            : requestedUnitPrice !== standardUnitPrice ? 1 : 0,
        input.clearPricingOverride === true
          ? 0
          : requestedDiscount === undefined
            ? asBooleanFlag(line.manual_discount_override) ? 1 : 0
            : requestedDiscount > 0 ? 1 : 0,
        line.id,
      ],
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

    await this.pool.query("DELETE FROM pos_transaction_line WHERE id = $1", [
      line.id,
    ]);
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
    const orderResult = await this.pool.query<{ order_no: string }>(
      "SELECT order_no FROM sales_order WHERE source_transaction_id = $1 AND status = 'OPEN' LIMIT 1",
      [basket.id],
    );
    const linkedOrder = orderResult.rows[0] ?? null;

    if (lines.length > 0 && !linkedOrder) {
      throw new Error(
        "Clear every basket line before resetting the active POS screen.",
      );
    }

    const timestamp = isoNow();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM app_metadata WHERE key = $1", [
        this.getActiveBasketMetadataKey(),
      ]);

      if (!linkedOrder) {
        await client.query(
          "DELETE FROM pos_transaction WHERE id = $1 AND status = 'PARKED'",
          [basket.id],
        );
      }

      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          linkedOrder
            ? `${basket.transaction_no} was removed from the PostgreSQL sell lane and ${linkedOrder.order_no} remains available for fulfilment.`
            : `${basket.transaction_no} was discarded from the PostgreSQL POS lane before completion.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: linkedOrder
        ? `${linkedOrder.order_no} was returned to pending orders.`
        : `Flash ERP cleared basket ${basket.transaction_no} from the POS screen.`,
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
      await this.pool.query(
        `UPDATE pos_transaction
         SET customer_id = NULL,
             updated_at = $1,
             record_version = record_version + 1
         WHERE id = $2`,
        [timestamp, basket.id],
      );
      await this.repriceBasketSaleLinesForCustomer(basket.id, null);
      await this.refreshBasketTotals(basket.id, timestamp);
      await this.setMetadata("last_local_write_at", timestamp);

      return {
        message: `Flash ERP cleared the customer from basket ${basket.transaction_no}.`,
        snapshot: await this.getSyncSnapshot(),
      };
    }

    const result = await this.pool.query<CustomerRow>(
      `SELECT
        id,
        customer_no,
        full_name,
        customer_type,
        phone,
        email,
        home_store_code,
        home_store_name,
        city,
        country_code,
        loyalty_enrolled,
        loyalty_tier,
        loyalty_points_balance,
        allow_credit_sales,
        credit_limit_amount,
        receivable_balance_amount,
        note,
        status,
        updated_at
       FROM customer
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [input.customerId],
    );
    const customer = result.rows[0] ?? null;

    if (!customer) {
      throw new Error(
        "Flash ERP could not find that customer in the shared store database.",
      );
    }

    if (customer.status !== "ACTIVE") {
      throw new Error(
        `Flash ERP cannot attach ${customer.full_name} because that customer is ${customer.status.toLowerCase()}.`,
      );
    }

    await this.pool.query(
      `UPDATE pos_transaction
       SET customer_id = $1,
           updated_at = $2,
           record_version = record_version + 1
       WHERE id = $3`,
      [customer.id, timestamp, basket.id],
    );
    await this.repriceBasketSaleLinesForCustomer(basket.id, customer.id);
    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${customer.full_name} (${customer.customer_no}) was attached to PostgreSQL basket ${basket.transaction_no}.`,
      startedAt: timestamp,
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

    const basket = await this.requireActiveBasket();
    await this.assertBasketIsEditable(basket.id);
    const timestamp = isoNow();
    const grossTotalAmount = Number(
      (asNumber(basket.subtotal_amount) + asNumber(basket.tax_amount)).toFixed(
        2,
      ),
    );
    const loyaltyRedemption = await this.calculateBasketLoyaltyRedemption(
      basket,
      grossTotalAmount,
      requestedPoints,
    );

    if (requestedPoints > 0 && loyaltyRedemption.appliedPoints <= 0) {
      throw new Error(
        loyaltyRedemption.message ??
          "Flash ERP cannot apply loyalty redemption to this basket right now.",
      );
    }

    await this.pool.query(
      `UPDATE pos_transaction
       SET loyalty_redemption_points = $1,
           loyalty_redemption_amount = $2,
           updated_at = $3,
           record_version = record_version + 1
       WHERE id = $4`,
      [
        loyaltyRedemption.appliedPoints,
        loyaltyRedemption.appliedAmount,
        timestamp,
        basket.id,
      ],
    );
    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary:
        loyaltyRedemption.appliedPoints > 0
          ? `${basket.transaction_no} applied PostgreSQL loyalty redemption for ${loyaltyRedemption.appliedPoints} point(s).`
          : `${basket.transaction_no} cleared PostgreSQL loyalty redemption locally.`,
      startedAt: timestamp,
    });

    return {
      message:
        loyaltyRedemption.appliedPoints > 0
          ? `Flash ERP applied ${loyaltyRedemption.appliedPoints} loyalty point(s) worth ${loyaltyRedemption.appliedAmount.toFixed(2)} to basket ${basket.transaction_no}.`
          : `Flash ERP cleared loyalty redemption from basket ${basket.transaction_no}.`,
      snapshot: await this.getSyncSnapshot(),
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
        `Flash ERP could not find completed receipt "${normalizedTransactionNo}" in the PostgreSQL store ledger.`,
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
      summary: `${basket.transaction_no} was opened as a receipt-linked ${transactionType.toLowerCase()} basket from ${sourceReceipt.sourceTransactionNo}.`,
      startedAt: timestamp,
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
        "Flash ERP could not reopen the original receipt from the PostgreSQL store ledger.",
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
    const uomConversionFactor = asNumber(sourceLine.uom_conversion_factor) || 1;
    const requestedBaseQuantity = calculatePosBaseQuantity(
      requestedQuantity,
      uomConversionFactor,
    );

    if (requestedQuantity > maxReturnQuantity) {
      throw new Error(
        `Only ${maxReturnQuantity.toFixed(3)} unit(s) of ${sourceLine.product_name_snapshot} remain eligible to return from receipt ${sourceHeader.transaction_no}.`,
      );
    }

    const nextSerialNumbers = validateSerializedLineInput({
      isSerialized,
      productName: sourceLine.product_name_snapshot,
      quantity: requestedBaseQuantity,
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
      await this.pool.query(
        `UPDATE pos_transaction_line
         SET serial_numbers_json = $1,
             quantity = $2,
             base_quantity = $3,
             unit_price = $4,
             applied_promotion_code = $5,
             applied_promotion_name = $6,
             discount_amount = $7,
             tax_amount = $8,
             line_total = $9
         WHERE id = $10`,
        [
          writeSerializedLineNumbers(nextSerialNumbers),
          nextAmounts.quantity,
          requestedBaseQuantity,
          nextAmounts.unitPrice,
          sourceLine.applied_promotion_code,
          sourceLine.applied_promotion_name,
          nextAmounts.discountAmount,
          nextAmounts.taxAmount,
          nextAmounts.lineTotal,
          existingLine.id,
        ],
      );
    } else {
      const insertedAmounts = buildSourceLineAmounts(
        sourceLine,
        normalizedQuantity,
      );

      await this.pool.query(
        `INSERT INTO pos_transaction_line (
          id,
          pos_transaction_id,
          product_id,
          line_intent,
          source_line_id,
          applied_promotion_code,
          applied_promotion_name,
          product_code_snapshot,
          product_variant_code_snapshot,
          product_name_snapshot,
          serial_numbers_json,
          quantity,
          selling_unit_of_measure,
          base_unit_of_measure,
          uom_conversion_factor,
          base_quantity,
          unit_price,
          discount_amount,
          tax_amount,
          line_total,
          manual_price_override,
          manual_discount_override
        ) VALUES ($1, $2, $3, 'RETURN', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 0, 0)`,
        [
          randomUUID(),
          basket.id,
          product.id,
          sourceLine.id,
          sourceLine.applied_promotion_code,
          sourceLine.applied_promotion_name,
          sourceLine.product_code_snapshot,
          sourceLine.product_variant_code_snapshot,
          sourceLine.product_name_snapshot,
          writeSerializedLineNumbers(nextSerialNumbers),
          insertedAmounts.quantity,
          sourceLine.selling_unit_of_measure,
          sourceLine.base_unit_of_measure,
          uomConversionFactor,
          calculatePosBaseQuantity(
            normalizedQuantity,
            uomConversionFactor,
          ),
          insertedAmounts.unitPrice,
          insertedAmounts.discountAmount,
          insertedAmounts.taxAmount,
          insertedAmounts.lineTotal,
        ],
      );
    }

    await this.refreshBasketTotals(basket.id, timestamp);
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${sourceLine.product_name_snapshot} was added from receipt ${sourceHeader.transaction_no} into the active PostgreSQL correction basket.`,
      startedAt: timestamp,
    });

    return {
      message:
        basket.transaction_type === "EXCHANGE"
          ? `Flash ERP added ${sourceLine.product_name_snapshot} as a returned item from receipt ${sourceHeader.transaction_no}.`
          : `Flash ERP added ${sourceLine.product_name_snapshot} from receipt ${sourceHeader.transaction_no} into the return basket.`,
      snapshot: await this.getSyncSnapshot(),
    };
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

    await this.pool.query(
      "UPDATE pos_transaction SET notes = $1, updated_at = $2 WHERE id = $3",
      [auditNote, timestamp, basket.id],
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

    await this.pool.query(
      "UPDATE pos_transaction SET notes = $1, updated_at = $2 WHERE id = $3",
      [auditNote, timestamp, basket.id],
    );
    await this.setMetadata("last_local_write_at", timestamp);

    return {
      message: `Flash ERP opened exchange basket ${basket.transaction_no} with supervisor approval from ${supervisor.displayName}.`,
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
        "Flash ERP could not find that parked basket in PostgreSQL.",
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
    const salesOrderResult = await this.pool.query<SalesOrderRow>(
      `SELECT
         id,
         order_no,
         source_transaction_id,
         source_transaction_no,
         customer_id,
         customer_no,
         customer_name,
         status,
         total_amount,
         deposit_amount,
         balance_amount,
         deposit_tender_method_code,
         deposit_tender_method_name,
         deposit_payment_method,
         deposit_reference,
         deposit_paid_at,
         0 AS line_count,
         0 AS item_count,
         operator_name,
         note,
         fulfilled_transaction_id,
         fulfilled_transaction_no,
         synced_at,
         created_at,
         fulfilled_at,
         cancelled_at,
         updated_at
       FROM sales_order
       WHERE source_transaction_id = $1
         AND status = 'OPEN'
       LIMIT 1`,
      [refreshedBasket.id],
    );
    const openSalesOrder = salesOrderResult.rows[0] ?? null;
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
        paymentPurpose: payment.payment_purpose,
        receivedShiftId: payment.received_shift_id,
        receivedShiftNo: payment.received_shift_no,
        receivedTerminalCode: payment.received_terminal_code,
        receivedCashierCode: payment.received_cashier_code,
        receivedAt: payment.received_at,
      }));
    const combinedPaymentPayloads: StorePosTransactionCompletedPayload["payments"] =
      [
        ...existingPaymentPayloads,
        ...checkoutPayments.payments.map(
          (payment): StorePosTransactionCompletedPayload["payments"][number] => ({
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
          paymentPurpose: openSalesOrder
            ? "SALES_ORDER_BALANCE"
            : "TRANSACTION_SETTLEMENT",
          receivedShiftId: shift.id,
          receivedShiftNo: shift.shift_no,
          receivedTerminalCode: terminalCode,
          receivedCashierCode: saleCashierCode,
          receivedAt: payment.receivedAt,
          }),
        ),
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
    const reservedBatchQuantityById = new Map<string, number>();
    const checkoutLines: Array<{
      line: BasketLineRow;
      product: CatalogLookupRow;
      lineIntent: SyncPosLineIntent;
      inventoryLocationCode: string | null;
      quantity: number;
      serialNumbers: string[];
      barcode: string | null;
      selectedVariant: ProductVariantSnapshotRow | null;
      batchAllocations: StoreInventoryBatchAllocation[];
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
          "PostgreSQL return and exchange basket lines are waiting for the receipt-correction adapter slice.",
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
      const quantity = Number(
        asNumber(line.base_quantity || line.quantity).toFixed(3),
      );
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

      const batchAllocations =
        lineIntent === "SALE" &&
        tracksInventoryForSale(product) &&
        asBooleanFlag(product.track_expiry) &&
        lineLocationCode
          ? allocateInventoryBatchesFefo({
              productName: line.product_name_snapshot,
              quantity,
              preferredBatchId:
                readInventoryBatchAllocations(line.batch_allocations_json)[0]
                  ?.batchId ?? null,
              batches: (
                await this.pool.query<{
                  id: string;
                  batch_no: string;
                  manufactured_at: string | null;
                  expiry_date: string;
                  quantity_on_hand: string | number;
                  status: string;
                }>(
                  `SELECT id, batch_no, manufactured_at, expiry_date, quantity_on_hand, status
                   FROM inventory_batch_registry
                   WHERE inventory_location_code = $1
                     AND product_code = $2
                     AND quantity_on_hand > 0
                   ORDER BY expiry_date ASC, manufactured_at ASC, batch_no ASC`,
                  [lineLocationCode, line.product_code_snapshot],
                )
              ).rows.map((batch) => ({
                batchId: batch.id,
                batchNo: batch.batch_no,
                manufacturedAt: batch.manufactured_at,
                expiryDate: batch.expiry_date,
                quantityOnHand: Number(
                  Math.max(
                    0,
                    asNumber(batch.quantity_on_hand) -
                      (reservedBatchQuantityById.get(batch.id) ?? 0),
                  ).toFixed(3),
                ),
                status: batch.status,
              })),
            })
          : [];

      for (const allocation of batchAllocations) {
        if (allocation.batchId) {
          reservedBatchQuantityById.set(
            allocation.batchId,
            Number(
              (
                (reservedBatchQuantityById.get(allocation.batchId) ?? 0) +
                allocation.quantity
              ).toFixed(3),
            ),
          );
        }
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
        batchAllocations,
      });
    }

    const salePayloadLines: StorePosTransactionCompletedPayload["lines"] =
      checkoutLines.map(
        ({ line, lineIntent, inventoryLocationCode, quantity, serialNumbers, barcode, selectedVariant, batchAllocations }) => ({
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
          quantity: Number(asNumber(line.quantity).toFixed(3)),
          sellingUnitOfMeasure: line.selling_unit_of_measure,
          baseUnitOfMeasure: line.base_unit_of_measure,
          uomConversionFactor: Number(
            asNumber(line.uom_conversion_factor).toFixed(6),
          ),
          baseQuantity: quantity,
          unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
          discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
          taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
          lineTotal: Number(asNumber(line.line_total).toFixed(2)),
          appliedPromotionCode: line.applied_promotion_code,
          appliedPromotionName: line.applied_promotion_name,
          inventoryLocationCode,
          batchAllocations,
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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE pos_transaction
         SET shift_id = $1,
             cashier_code = $2,
             status = 'COMPLETED',
             paid_amount = $3,
             change_amount = $4,
             header_reference = $5,
             additional_details = $6,
             completed_at = $7,
             record_version = $8,
             updated_at = $7
         WHERE id = $9`,
        [
          shift.id,
          saleCashierCode,
          paidAmount,
          checkoutPayments.changeAmount,
          headerReference,
          additionalDetails,
          timestamp,
          saleRecordVersion,
          refreshedBasket.id,
        ],
      );
      await this.recordTransactionReferenceCapture(client, {
        reference: headerReference,
        details: additionalDetails,
        transactionNo: refreshedBasket.transaction_no,
        capturedAt: timestamp,
      });

      for (const { line, inventoryLocationCode } of checkoutLines) {
        if (line.inventory_location_code === inventoryLocationCode) {
          continue;
        }

        await client.query(
          `UPDATE pos_transaction_line
           SET inventory_location_code = $1
           WHERE id = $2`,
          [inventoryLocationCode, line.id],
        );
      }

      for (const payment of checkoutPayments.payments) {
        await client.query(
          `INSERT INTO pos_payment (
            id,
            pos_transaction_id,
            tender_method_code,
            tender_method_name,
            bank_account_id,
            bank_code,
            bank_name,
            bank_branch_code,
            bank_branch_name,
            bank_account_number,
            bank_account_name,
            method,
            payment_purpose,
            amount,
            reference,
            received_shift_id,
            received_shift_no,
            received_terminal_code,
            received_cashier_code,
            received_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            payment.paymentId,
            refreshedBasket.id,
            payment.tenderMethodCode,
            payment.tenderMethodName,
            payment.bankAccountId,
            payment.bankCode,
            payment.bankName,
            payment.bankBranchCode,
            payment.bankBranchName,
            payment.bankAccountNumber,
            payment.bankAccountName,
            payment.method,
            openSalesOrder
              ? "SALES_ORDER_BALANCE"
              : "TRANSACTION_SETTLEMENT",
            payment.amount,
            payment.reference,
            shift.id,
            shift.shift_no,
            terminalCode,
            saleCashierCode,
            payment.receivedAt,
          ],
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
        batchAllocations,
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
          await client.query(
            "UPDATE pos_transaction_line SET batch_allocations_json = $1 WHERE id = $2",
            [writeInventoryBatchAllocations(batchAllocations), line.id],
          );

          for (const allocation of batchAllocations) {
            const batchResult = await client.query<{
              quantity_on_hand: string | number;
              expiry_date: string;
              status: string;
            }>(
              `SELECT quantity_on_hand, expiry_date, status
               FROM inventory_batch_registry
               WHERE id = $1
               FOR UPDATE`,
              [allocation.batchId],
            );
            const batch = batchResult.rows[0] ?? null;

            if (!batch || asNumber(batch.quantity_on_hand) < allocation.quantity) {
              throw new Error(
                `Batch ${allocation.batchNo} no longer has enough ${line.product_name_snapshot} to complete this sale.`,
              );
            }

            const nextBatchQuantity = Number(
              (asNumber(batch.quantity_on_hand) - allocation.quantity).toFixed(3),
            );
            await client.query(
              `UPDATE inventory_batch_registry
               SET quantity_on_hand = $1,
                   status = $2,
                   source_reference_type = 'POS_TRANSACTION',
                   source_reference_id = $3,
                   source_reference_label = $4,
                   updated_at = $5
               WHERE id = $6`,
              [
                nextBatchQuantity,
                deriveInventoryBatchStatus({
                  expiryDate: batch.expiry_date,
                  quantityOnHand: nextBatchQuantity,
                  status: batch.status,
                }),
                refreshedBasket.id,
                refreshedBasket.transaction_no,
                timestamp,
                allocation.batchId,
              ],
            );
          }
          await client.query(
            `UPDATE product_snapshot
             SET quantity_on_hand = quantity_on_hand + $1,
                 updated_at = $2
             WHERE product_code = $3`,
            [signedInventoryDelta, timestamp, line.product_code_snapshot],
          );

          if (selectedVariant) {
            await client.query(
              `UPDATE product_variant_snapshot
               SET quantity_on_hand = quantity_on_hand + $1,
                   updated_at = $2
               WHERE id = $3`,
              [signedInventoryDelta, timestamp, selectedVariant.id],
            );
          }

          if (inventoryLocationCode) {
            await client.query(
              `INSERT INTO inventory_location_balance (
                location_code,
                product_code,
                quantity_on_hand,
                updated_at
              ) VALUES ($1, $2, $3, $4)
              ON CONFLICT (location_code, product_code) DO NOTHING`,
              [
                inventoryLocationCode,
                line.product_code_snapshot,
                Number(asNumber(product.quantity_on_hand).toFixed(3)),
                timestamp,
              ],
            );
            await client.query(
              `UPDATE inventory_location_balance
               SET quantity_on_hand = quantity_on_hand + $1,
                   updated_at = $2
               WHERE location_code = $3
                 AND product_code = $4`,
              [
                signedInventoryDelta,
                timestamp,
                inventoryLocationCode,
                line.product_code_snapshot,
              ],
            );
            await client.query(
              "UPDATE inventory_location_snapshot SET updated_at = $1 WHERE location_code = $2",
              [timestamp, inventoryLocationCode],
            );
          }

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
            batchAllocations,
            unitCost: null,
            referenceType: "POS_TRANSACTION",
            referenceId: refreshedBasket.id,
            externalReference: refreshedBasket.transaction_no,
            occurredAt: timestamp,
          };

          if (shouldQueueEnterprise) {
            await client.query(
              `INSERT INTO sync_outbox (
                id,
                target_node_code,
                aggregate_type,
                aggregate_id,
                event_type,
                idempotency_key,
                payload_json,
                status,
                attempt_count,
                record_version,
                created_at,
                updated_at
              ) VALUES ($1, $2, 'inventoryLedgerEntry', $3, 'inventory.ledger.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
              [
                randomUUID(),
                ENTERPRISE_NODE_CODE,
                ledgerEntryId,
                `${nodeCode}:inventoryLedgerEntry:${ledgerEntryId}`,
                JSON.stringify(inventoryPayload),
                timestamp,
              ],
            );
          }
        }

        for (const serialNumber of serialNumbers) {
          if (lineIntent === "RETURN") {
            await client.query(
              `INSERT INTO serial_registry (
                id,
                product_code,
                serial_number,
                inventory_location_code,
                status,
                source_transaction_id,
                source_transaction_no,
                updated_at
              ) VALUES ($1, $2, $3, $4, 'AVAILABLE', $5, $6, $7)
              ON CONFLICT (product_code, serial_number) DO UPDATE SET
                inventory_location_code = excluded.inventory_location_code,
                status = 'AVAILABLE',
                source_transaction_id = excluded.source_transaction_id,
                source_transaction_no = excluded.source_transaction_no,
                updated_at = excluded.updated_at`,
              [
                randomUUID(),
                line.product_code_snapshot,
                serialNumber,
                inventoryLocationCode,
                refreshedBasket.id,
                refreshedBasket.transaction_no,
                timestamp,
              ],
            );
          } else {
            const serialResult = await client.query(
              `UPDATE serial_registry
               SET status = 'SOLD',
                   inventory_location_code = COALESCE($1, inventory_location_code),
                   source_transaction_id = $2,
                   source_transaction_no = $3,
                   updated_at = $4
               WHERE product_code = $5
                 AND UPPER(serial_number) = UPPER($6)
                 AND status = 'AVAILABLE'`,
              [
                inventoryLocationCode,
                refreshedBasket.id,
                refreshedBasket.transaction_no,
                timestamp,
                line.product_code_snapshot,
                serialNumber,
              ],
            );

            if (serialResult.rowCount !== 1) {
              throw new Error(
                `Flash ERP could not mark serial number ${serialNumber} as sold during checkout.`,
              );
            }
          }
        }
      }

      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'posTransaction', $3, 'pos.transaction.completed', $4, $5, 'PENDING', 0, $6, $7, $7)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            refreshedBasket.id,
            `${nodeCode}:posTransaction:${refreshedBasket.transaction_no}`,
            JSON.stringify(salePayload),
            saleRecordVersion,
            timestamp,
          ],
        );
      }
      const salesOrder = openSalesOrder;

      if (salesOrder) {
        const fulfilledReservations = (
          await this.getSalesOrderReservationPayloads(salesOrder.id)
        ).map((reservation) =>
          reservation.status === "ACTIVE"
            ? {
                ...reservation,
                status: "CONSUMED" as const,
                releaseReason: `Consumed by ${refreshedBasket.transaction_no}.`,
                releasedAt: timestamp,
              }
            : reservation,
        );
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
          orderType: salesOrder.order_type,
          totalAmount: Number(asNumber(salesOrder.total_amount).toFixed(2)),
          depositAmount: Number(asNumber(salesOrder.deposit_amount).toFixed(2)),
          paidAmount: Number(asNumber(salesOrder.total_amount).toFixed(2)),
          balanceAmount: 0,
          depositTenderMethodCode: salesOrder.deposit_tender_method_code,
          depositTenderMethodName: salesOrder.deposit_tender_method_name,
          depositPaymentMethod: salesOrder.deposit_payment_method,
          depositReference: salesOrder.deposit_reference,
          depositPaidAt: salesOrder.deposit_paid_at,
          layawayPolicySnapshotJson: salesOrder.layaway_policy_snapshot_json,
          minimumDepositAmount: Number(asNumber(salesOrder.minimum_deposit_amount).toFixed(2)),
          reservationStatus:
            salesOrder.order_type === "LAYAWAY" && salesOrder.reservation_status === "ACTIVE"
              ? "CONSUMED"
              : salesOrder.reservation_status,
          reservationCreatedAt: salesOrder.reservation_created_at,
          reservationReleasedAt:
            salesOrder.order_type === "LAYAWAY" && salesOrder.reservation_status === "ACTIVE"
              ? timestamp
              : salesOrder.reservation_released_at,
          layawayExpiresAt: salesOrder.layaway_expires_at,
          expiredAt: salesOrder.expired_at,
          cancellationFeeAmount: Number(asNumber(salesOrder.cancellation_fee_amount).toFixed(2)),
          refundedAmount: Number(asNumber(salesOrder.refunded_amount).toFixed(2)),
          status: "FULFILLED",
          operatorName: salesOrder.operator_name,
          note: salesOrder.note,
          createdAt: salesOrder.created_at,
          fulfilledTransactionId: refreshedBasket.id,
          fulfilledTransactionNo: refreshedBasket.transaction_no,
          fulfilledAt: timestamp,
          cancelledAt: null,
          reservations: fulfilledReservations,
        };

        await client.query(
          `UPDATE sales_order_inventory_reservation
           SET status = 'CONSUMED',
               release_reason = $1,
               released_at = $2,
               updated_at = $2
           WHERE sales_order_id = $3
             AND status = 'ACTIVE'`,
          [`Consumed by ${refreshedBasket.transaction_no}.`, timestamp, salesOrder.id],
        );

        await client.query(
          `UPDATE sales_order
           SET status = 'FULFILLED',
               paid_amount = total_amount,
               balance_amount = 0,
               reservation_status = CASE WHEN reservation_status = 'ACTIVE' THEN 'CONSUMED' ELSE reservation_status END,
               reservation_released_at = CASE WHEN reservation_status = 'ACTIVE' THEN $3 ELSE reservation_released_at END,
               fulfilled_transaction_id = $1,
               fulfilled_transaction_no = $2,
               fulfilled_at = $3,
               record_version = record_version + 1,
               updated_at = $3
           WHERE id = $4`,
          [
            refreshedBasket.id,
            refreshedBasket.transaction_no,
            timestamp,
            salesOrder.id,
          ],
        );
        if (shouldQueueEnterprise) {
          await client.query(
            `INSERT INTO sync_outbox (
              id,
              target_node_code,
              aggregate_type,
              aggregate_id,
              event_type,
              idempotency_key,
              payload_json,
              status,
              attempt_count,
              record_version,
              created_at,
              updated_at
            ) VALUES ($1, $2, 'salesOrder', $3, 'sales-order.fulfilled', $4, $5, 'PENDING', 0, 2, $6, $6)`,
            [
              randomUUID(),
              ENTERPRISE_NODE_CODE,
              salesOrder.id,
              `${nodeCode}:salesOrder:${salesOrder.order_no}:fulfilled`,
              JSON.stringify(salesOrderPayload),
              timestamp,
            ],
          );
        }
      }
      await client.query("DELETE FROM app_metadata WHERE key = $1", [
        this.getActiveBasketMetadataKey(),
      ]);
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (
          id,
          run_kind,
          result,
          summary,
          upstream_processed,
          downstream_applied,
          started_at,
          finished_at
        ) VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          this.isStandaloneDeployment()
            ? `${refreshedBasket.transaction_no} was completed from the PostgreSQL active basket locally.`
            : `${refreshedBasket.transaction_no} was completed from the PostgreSQL active basket and queued for enterprise sync.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: this.isStandaloneDeployment()
        ? `Flash ERP completed basket ${refreshedBasket.transaction_no} on the shared PostgreSQL store database.`
        : `Flash ERP completed basket ${refreshedBasket.transaction_no} on the shared PostgreSQL store database and queued it for enterprise sync.`,
      snapshot: await this.getSyncSnapshot(),
    };
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
      const orderParams: unknown[] = [daysAgo(completedWithinDays)];
      const whereParts = [
        "COALESCE(sales_order.fulfilled_at, sales_order.created_at) >= $1",
      ];

      if (normalizedQuery) {
        orderParams.push(`%${normalizedQuery}%`);
        whereParts.push(`(
          UPPER(sales_order.order_no) LIKE $${orderParams.length}
          OR UPPER(sales_order.source_transaction_no) LIKE $${orderParams.length}
          OR UPPER(COALESCE(sales_order.customer_no, '')) LIKE $${orderParams.length}
          OR UPPER(COALESCE(sales_order.customer_name, '')) LIKE $${orderParams.length}
          OR UPPER(sales_order.status) LIKE $${orderParams.length}
          OR UPPER(COALESCE(sales_order.operator_name, '')) LIKE $${orderParams.length}
          OR UPPER(COALESCE(sales_order.note, '')) LIKE $${orderParams.length}
          OR EXISTS (
            SELECT 1
            FROM pos_transaction_line AS search_line
            WHERE search_line.pos_transaction_id = sales_order.source_transaction_id
              AND (
                UPPER(search_line.product_code_snapshot) LIKE $${orderParams.length}
                OR UPPER(search_line.product_name_snapshot) LIKE $${orderParams.length}
              )
          )
        )`);
      }

      orderParams.push(limit);
      const orderResult = await this.pool.query<
        SalesOrderRow & { product_preview: string[] | null }
      >(
        `SELECT
          sales_order.id,
          sales_order.order_no,
          sales_order.source_transaction_id,
          sales_order.source_transaction_no,
          sales_order.customer_id,
          sales_order.customer_no,
          sales_order.customer_name,
          sales_order.status,
          sales_order.total_amount,
          sales_order.deposit_amount,
          sales_order.balance_amount,
          sales_order.deposit_tender_method_code,
          sales_order.deposit_tender_method_name,
          sales_order.deposit_payment_method,
          sales_order.deposit_reference,
          sales_order.deposit_paid_at,
          (
            SELECT COUNT(*)
            FROM pos_transaction_line AS line
            WHERE line.pos_transaction_id = sales_order.source_transaction_id
          ) AS line_count,
          COALESCE((
            SELECT SUM(line.quantity)
            FROM pos_transaction_line AS line
            WHERE line.pos_transaction_id = sales_order.source_transaction_id
          ), 0) AS item_count,
          sales_order.operator_name,
          sales_order.note,
          sales_order.fulfilled_transaction_id,
          sales_order.fulfilled_transaction_no,
          sales_order.synced_at,
          sales_order.created_at,
          sales_order.fulfilled_at,
          sales_order.cancelled_at,
          sales_order.updated_at,
          (
            SELECT array_remove(array_agg(preview.product_name_snapshot), NULL)
            FROM (
              SELECT DISTINCT line.product_name_snapshot
              FROM pos_transaction_line AS line
              WHERE line.pos_transaction_id = sales_order.source_transaction_id
              ORDER BY line.product_name_snapshot ASC
              LIMIT 3
            ) AS preview
          ) AS product_preview
         FROM sales_order
         WHERE ${whereParts.join(" AND ")}
         ORDER BY COALESCE(sales_order.fulfilled_at, sales_order.created_at) DESC,
           sales_order.order_no DESC
         LIMIT $${orderParams.length}`,
        orderParams,
      );

      return orderResult.rows.map<StoreReceiptSearchResult>((row) => ({
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
        productPreview: (row.product_preview ?? []).slice(0, 3),
        canStartReturn: false,
        canStartExchange: false,
      }));
    }

    if (input?.receiptKind === "ACCOUNT_PAYMENT") {
      const accountParams: unknown[] = [daysAgo(completedWithinDays)];
      const whereParts = ["entry.occurred_at >= $1"];

      if (normalizedQuery) {
        accountParams.push(`%${normalizedQuery}%`);
        whereParts.push(`(
          UPPER(entry.entry_no) LIKE $${accountParams.length}
          OR UPPER(entry.customer_no) LIKE $${accountParams.length}
          OR UPPER(entry.customer_name) LIKE $${accountParams.length}
          OR UPPER(COALESCE(entry.reference, '')) LIKE $${accountParams.length}
        )`);
      }

      accountParams.push(limit);
      const accountResult = await this.pool.query<CustomerAccountEntryRow>(
        `SELECT
          id,
          entry_no,
          customer_id,
          customer_no,
          customer_name,
          entry_type,
          payment_method,
          tender_method_code,
          tender_method_name,
          amount,
          reference,
          note,
          shift_id,
          shift_no,
          cashier_code,
          synced_at,
          occurred_at,
          updated_at
         FROM customer_account_entry AS entry
         WHERE ${whereParts.join(" AND ")}
         ORDER BY entry.occurred_at DESC, entry.entry_no DESC
         LIMIT $${accountParams.length}`,
        accountParams,
      );

      return accountResult.rows.map<StoreReceiptSearchResult>((row) => ({
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
    const whereParts = ["txn.status = 'COMPLETED'", "txn.completed_at >= $1"];
    const params: unknown[] = [daysAgo(completedWithinDays)];

    if (transactionFilter !== "ALL") {
      if (transactionFilter === "CORRECTABLE") {
        whereParts.push("txn.transaction_type = 'SALE'");
      } else {
        params.push(transactionFilter);
        whereParts.push(`txn.transaction_type = $${params.length}`);
      }
    }

    if (normalizedQuery) {
      params.push(`%${normalizedQuery}%`);
      whereParts.push(`(
        UPPER(txn.transaction_no) LIKE $${params.length}
        OR UPPER(COALESCE(customer.customer_no, '')) LIKE $${params.length}
        OR UPPER(COALESCE(customer.full_name, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM pos_transaction_line AS search_line
          WHERE search_line.pos_transaction_id = txn.id
            AND (
              UPPER(search_line.product_code_snapshot) LIKE $${params.length}
              OR UPPER(search_line.product_name_snapshot) LIKE $${params.length}
            )
        )
      )`);
    }

    params.push(limit);
    const result = await this.pool.query<ReceiptSearchRow>(
      `SELECT
        txn.id,
        txn.transaction_no,
        txn.customer_id,
        customer.customer_no,
        customer.full_name AS customer_name,
        customer.customer_type,
        customer.loyalty_enrolled AS customer_loyalty_enrolled,
        customer.loyalty_tier AS customer_loyalty_tier,
        customer.loyalty_points_balance AS customer_loyalty_points_balance,
        txn.source_transaction_id,
        txn.source_transaction_no,
        txn.transaction_type,
        txn.status,
        txn.subtotal_amount,
        txn.discount_amount,
        txn.loyalty_redemption_points,
        txn.loyalty_redemption_amount,
        txn.tax_amount,
        txn.total_amount,
        txn.paid_amount,
        txn.change_amount,
        txn.notes,
        txn.header_reference,
        txn.additional_details,
        txn.updated_at,
        txn.completed_at,
        txn.record_version,
        shift.shift_no,
        COALESCE(txn.cashier_code, shift.cashier_code) AS cashier_code,
        count(line.id) AS line_count,
        array_remove(array_agg(DISTINCT line.product_name_snapshot), NULL) AS product_preview
       FROM pos_transaction AS txn
       LEFT JOIN customer
         ON customer.id = txn.customer_id
       LEFT JOIN pos_shift AS shift
         ON shift.id = txn.shift_id
       LEFT JOIN pos_transaction_line AS line
         ON line.pos_transaction_id = txn.id
       WHERE ${whereParts.join(" AND ")}
       GROUP BY
        txn.id,
        customer.customer_no,
        customer.full_name,
        customer.customer_type,
        customer.loyalty_enrolled,
        customer.loyalty_tier,
        customer.loyalty_points_balance,
        shift.shift_no,
        COALESCE(txn.cashier_code, shift.cashier_code)
       ORDER BY txn.completed_at DESC, txn.transaction_no DESC
       LIMIT $${params.length}`,
      params,
    );

    return result.rows
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
        productPreview: (row.product_preview ?? []).slice(0, 3),
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
      headerReference: header.header_reference ?? null,
      additionalDetails: header.additional_details ?? null,
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
        `Flash ERP could not find completed receipt "${normalizedTransactionNo}" in the PostgreSQL store ledger.`,
      );
    }

    const [metadata, lineRows, paymentRows] = await Promise.all([
      this.metadata(),
      this.getBasketLines(header.id),
      this.getReceiptPaymentRows(header.id),
    ]);
    const receiptSettings = this.getReceiptSettingsSummary(metadata);

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
      currencyCode: receiptSettings.currencyCode,
      timezone: receiptSettings.timezone,
      receiptHeader: receiptSettings.receiptHeader,
      receiptFooter: receiptSettings.receiptFooter,
      salesReceiptTemplateHtml: receiptSettings.salesReceiptTemplateHtml,
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
      headerReference: header.header_reference ?? null,
      additionalDetails: header.additional_details ?? null,
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
        sellingUnitOfMeasure: line.selling_unit_of_measure,
        baseQuantity: Number(asNumber(line.base_quantity).toFixed(3)),
        baseUnitOfMeasure: line.base_unit_of_measure,
        uomConversionFactor: Number(
          asNumber(line.uom_conversion_factor).toFixed(6),
        ),
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
      "WHERE UPPER(sales_order.order_no) = $1",
      [normalizedOrderNo],
    );
    const order = rows[0] ?? null;

    if (!order) {
      throw new Error(
        `Flash ERP could not find sales order "${normalizedOrderNo}" in the PostgreSQL store ledger.`,
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
    const receiptSettings = this.getReceiptSettingsSummary(metadata);

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
      currencyCode: receiptSettings.currencyCode,
      timezone: receiptSettings.timezone,
      receiptHeader: receiptSettings.receiptHeader,
      receiptFooter: receiptSettings.receiptFooter,
      salesReceiptTemplateHtml: receiptSettings.salesReceiptTemplateHtml,
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
      headerReference: header.header_reference ?? null,
      additionalDetails: header.additional_details ?? null,
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
        sellingUnitOfMeasure: line.selling_unit_of_measure,
        baseQuantity: Number(asNumber(line.base_quantity).toFixed(3)),
        baseUnitOfMeasure: line.base_unit_of_measure,
        uomConversionFactor: Number(
          asNumber(line.uom_conversion_factor).toFixed(6),
        ),
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
        this.pool.query<CustomerRow>(
          `SELECT
          id,
          customer_no,
          full_name,
          customer_type,
          phone,
          email,
          home_store_code,
          home_store_name,
          city,
          country_code,
          loyalty_enrolled,
          loyalty_tier,
          loyalty_points_balance,
          allow_credit_sales,
          credit_limit_amount,
          receivable_balance_amount,
          note,
          status,
          updated_at
         FROM customer
         WHERE id = $1
           AND deleted_at IS NULL
         LIMIT 1`,
          [customerId],
        ),
        this.getTenderMethodByCode(tenderMethodCode),
        this.getBankAccountById(input.bankAccountId),
        this.metadata(),
      ]);
    const customer = customerResult.rows[0] ?? null;

    if (!customer) {
      throw new Error(
        "Flash ERP could not find that customer account in the shared store database.",
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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO customer_account_entry (
          id,
          entry_no,
          customer_id,
          customer_no,
          customer_name,
          entry_type,
          payment_method,
          tender_method_code,
          tender_method_name,
          bank_account_id,
          bank_code,
          bank_name,
          bank_branch_code,
          bank_branch_name,
          bank_account_number,
          bank_account_name,
          amount,
          reference,
          note,
          shift_id,
          shift_no,
          cashier_code,
          synced_at,
          occurred_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'ACCOUNT_PAYMENT', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NULL, $22, $22)`,
        [
          entryId,
          entryNo,
          customer.id,
          customer.customer_no,
          customer.full_name,
          tenderMethod.paymentMethod,
          tenderMethod.tenderMethodCode,
          tenderMethod.tenderMethodName,
          selectedBankAccount?.bankAccountId ?? null,
          selectedBankAccount?.bankCode ?? null,
          selectedBankAccount?.bankName ?? null,
          selectedBankAccount?.branchCode ?? null,
          selectedBankAccount?.branchName ?? null,
          selectedBankAccount?.accountNumber ?? null,
          selectedBankAccount?.accountName ?? null,
          amount,
          reference,
          note,
          shift.id,
          shift.shift_no,
          operatorSession.loginId,
          timestamp,
        ],
      );
      await client.query(
        "UPDATE customer SET receivable_balance_amount = $1, updated_at = $2 WHERE id = $3",
        [nextReceivableBalance, timestamp, customer.id],
      );
      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'customerAccountEntry', $3, 'customer-account-entry.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            entryId,
            ENTERPRISE_NODE_CODE,
            entryId,
            `${nodeCode}:customerAccountEntry:${entryNo}`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${entryNo} collected ${amount.toFixed(2)} from ${customer.full_name} on the PostgreSQL store node and queued enterprise sync.`
            : `${entryNo} collected ${amount.toFixed(2)} from ${customer.full_name} on the PostgreSQL store node for standalone receivables.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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
      this.pool.query<
        CustomerAccountEntryRow & {
          bank_account_id: string | null;
          bank_code: string | null;
          bank_name: string | null;
          bank_branch_code: string | null;
          bank_branch_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
        }
      >(
        `SELECT
          id,
          entry_no,
          customer_id,
          customer_no,
          customer_name,
          entry_type,
          payment_method,
          tender_method_code,
          tender_method_name,
          bank_account_id,
          bank_code,
          bank_name,
          bank_branch_code,
          bank_branch_name,
          bank_account_number,
          bank_account_name,
          amount,
          reference,
          note,
          shift_id,
          shift_no,
          cashier_code,
          synced_at,
          occurred_at,
          updated_at
         FROM customer_account_entry
         WHERE UPPER(entry_no) = $1
         LIMIT 1`,
        [normalizedEntryNo],
      ),
      this.metadata(),
    ]);
    const entry = entryResult.rows[0] ?? null;

    if (!entry) {
      throw new Error(
        `Flash ERP could not find account payment receipt "${normalizedEntryNo}" in the PostgreSQL store ledger.`,
      );
    }

    const receiptSettings = this.getReceiptSettingsSummary(metadata);

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
      currencyCode: receiptSettings.currencyCode,
      timezone: receiptSettings.timezone,
      receiptHeader: receiptSettings.receiptHeader,
      receiptFooter: receiptSettings.receiptFooter,
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
      remainingBalanceAmount: null,
      occurredAt: entry.occurred_at,
    };
  }

  async createSalesOrderFromActiveBasket(
    input: StoreCreateSalesOrderRequest | null = {},
  ): Promise<StoreSyncActionResult> {
    input ??= {};
    const orderType = input.orderType === "LAYAWAY" ? "LAYAWAY" : "SALES_ORDER";
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: [
        orderType === "LAYAWAY" ? "pos.layaway.create" : "pos.sale.process",
        ...(orderType === "LAYAWAY" && input.policyOverrideApproved
          ? ["pos.layaway.policy.override"]
          : []),
      ],
      purpose:
        orderType === "LAYAWAY"
          ? "creating a layaway from the active basket"
          : "creating a sales order from the active basket",
    });
    const openShift = await this.getOpenShiftRow();

    if (!openShift) {
      throw new Error(
        "Open a cashier shift before creating a sales order on this terminal.",
      );
    }

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
        ? refreshedBasket.header_reference ?? null
        : input.headerReference?.trim() || null;
    const additionalDetails =
      input.additionalDetails === undefined
        ? refreshedBasket.additional_details ?? null
        : input.additionalDetails?.trim() || null;

    const salesOrderLocationCode = await this.getDefaultSalesOrderLocationCode();
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
    const hasDepositPaymentRows =
      Array.isArray(input.payments) && input.payments.length > 0;
    const requestedDepositAmount = Number(
      (
        hasDepositPaymentRows
          ? input.payments!.reduce(
              (sum, payment) => sum + Number(payment.amount ?? 0),
              0,
            )
          : Number(input.depositAmount ?? 0)
      ).toFixed(2),
    );

    if (
      !Number.isFinite(requestedDepositAmount) ||
      requestedDepositAmount < 0
    ) {
      throw new Error("Enter a sales order deposit amount of zero or more.");
    }

    if (requestedDepositAmount > totalAmount) {
      throw new Error(
        "A sales order deposit cannot be greater than the order total.",
      );
    }

    const depositReference = input.depositReference?.trim() || null;
    const depositTender =
      !hasDepositPaymentRows && requestedDepositAmount > 0
        ? await this.getTenderMethodByCode(
            input.depositTenderMethodCode?.trim().toUpperCase() ?? "",
          )
        : null;

    if (!hasDepositPaymentRows && requestedDepositAmount > 0 && !depositTender) {
      throw new Error(
        "Choose an active tender method before taking a sales order deposit.",
      );
    }

    if (depositTender?.requiresReference && !depositReference) {
      throw new Error(
        `Flash ERP needs a reference for ${depositTender.tenderMethodName}.`,
      );
    }

    const depositPaymentRequest =
      hasDepositPaymentRows && input.payments
        ? input.payments
        : requestedDepositAmount > 0 && depositTender
          ? [
              {
                method: depositTender.paymentMethod,
                tenderMethodCode: depositTender.tenderMethodCode,
                tenderMethodName: depositTender.tenderMethodName,
                amount: requestedDepositAmount,
                reference: depositReference,
              },
            ]
          : [];
    const preparedDepositPayments =
      requestedDepositAmount > 0
        ? await this.normalizeCheckoutPayments(
            { payments: depositPaymentRequest },
            requestedDepositAmount,
            orderNo,
            timestamp,
            "SALE",
          )
        : {
            payments: [] as NormalizedCheckoutPayment[],
            paidAmount: 0,
            changeAmount: 0,
          };
    const depositAmount = preparedDepositPayments.paidAmount;
    const primaryDepositPayment = preparedDepositPayments.payments[0] ?? null;
    const layawayOpening =
      orderType === "LAYAWAY"
        ? evaluateLayawayOpening({
            totalAmount,
            openingPaymentAmount: depositAmount,
            settings: await this.getLayawaySettings(),
            capturedAt: timestamp,
            policyOverrideApproved: input.policyOverrideApproved === true,
          })
        : null;
    const paidAmount = layawayOpening?.paidAmount ?? depositAmount;
    const balanceAmount = Number((totalAmount - paidAmount).toFixed(2));
    const layawayExpiresAt = input.layawayExpiresAt?.trim() || null;

    if (
      layawayExpiresAt &&
      (!Number.isFinite(Date.parse(layawayExpiresAt)) ||
        Date.parse(layawayExpiresAt) <= Date.parse(timestamp))
    ) {
      throw new Error("Choose a layaway expiry date and time in the future.");
    }

    const reservationRows: NonNullable<StoreSalesOrderRecordedPayload["reservations"]> = [];
    const pendingReservedByKey = new Map<string, number>();

    if (layawayOpening?.reservationStatus === "ACTIVE") {
      for (const line of lines) {
        const product = await this.getProductByCode(line.product_code_snapshot);

        if (
          !product ||
          !asBooleanFlag(product.track_inventory) ||
          isServiceProductType(product.product_type)
        ) {
          continue;
        }

        const variant = line.product_variant_code_snapshot
          ? await this.getMatrixVariantByCode(
              line.product_code_snapshot,
              line.product_variant_code_snapshot,
            )
          : null;
        const onHandBaseQuantity = variant
          ? asNumber(variant.quantity_on_hand)
          : (await this.getOptionalLocationQuantity(
              salesOrderLocationCode,
              line.product_code_snapshot,
            )) ?? asNumber(product.quantity_on_hand);
        const reservedResult = await this.pool.query<{ value: string | number }>(
          `SELECT COALESCE(SUM(base_quantity), 0) AS value
           FROM sales_order_inventory_reservation
           WHERE inventory_location_code = $1
             AND product_code = $2
             AND (($3::text IS NULL AND product_variant_code IS NULL) OR product_variant_code = $3)
             AND status = 'ACTIVE'`,
          [salesOrderLocationCode, line.product_code_snapshot, line.product_variant_code_snapshot],
        );
        const availableBaseQuantity = calculateLayawayAvailableBaseQuantity({
          onHandBaseQuantity,
          activeReservedBaseQuantity: asNumber(reservedResult.rows[0]?.value),
        });
        const key = `${salesOrderLocationCode}:${line.product_code_snapshot}:${line.product_variant_code_snapshot ?? ""}`;
        const lineBaseQuantity = Number(asNumber(line.base_quantity || line.quantity).toFixed(3));
        const requestedBaseQuantity = Number(
          ((pendingReservedByKey.get(key) ?? 0) + lineBaseQuantity).toFixed(3),
        );

        if (requestedBaseQuantity > availableBaseQuantity) {
          throw new Error(
            `${line.product_name_snapshot} needs ${requestedBaseQuantity.toFixed(3)} available unit(s) for this layaway, but only ${availableBaseQuantity.toFixed(3)} unit(s) remain after active reservations.`,
          );
        }

        pendingReservedByKey.set(key, requestedBaseQuantity);
        reservationRows.push({
          reservationId: randomUUID(),
          salesOrderLineId: line.id,
          inventoryLocationCode: salesOrderLocationCode,
          productCode: line.product_code_snapshot,
          productVariantCode: line.product_variant_code_snapshot,
          baseUnitOfMeasure: line.base_unit_of_measure,
          baseQuantity: lineBaseQuantity,
          status: "ACTIVE",
          releaseReason: null,
          createdAt: timestamp,
          releasedAt: null,
        });
      }
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
      orderType,
      subtotalAmount: Number(asNumber(refreshedBasket.subtotal_amount).toFixed(2)),
      discountAmount: Number(asNumber(refreshedBasket.discount_amount).toFixed(2)),
      taxAmount: Number(asNumber(refreshedBasket.tax_amount).toFixed(2)),
      totalAmount,
      depositAmount,
      paidAmount,
      balanceAmount,
      depositTenderMethodCode: primaryDepositPayment?.tenderMethodCode ?? null,
      depositTenderMethodName: primaryDepositPayment?.tenderMethodName ?? null,
      depositPaymentMethod: primaryDepositPayment?.method ?? null,
      depositReference: primaryDepositPayment?.reference ?? null,
      depositPaidAt: depositAmount > 0 ? timestamp : null,
      layawayPolicySnapshotJson: layawayOpening
        ? JSON.stringify(layawayOpening.policySnapshot)
        : null,
      minimumDepositAmount: layawayOpening?.minimumDepositAmount ?? 0,
      reservationStatus: layawayOpening?.reservationStatus ?? "NOT_APPLICABLE",
      reservationCreatedAt: reservationRows.length > 0 ? timestamp : null,
      reservationReleasedAt: null,
      layawayExpiresAt,
      expiredAt: null,
      cancellationFeeAmount: 0,
      refundedAmount: 0,
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
        sellingUnitOfMeasure: line.selling_unit_of_measure,
        baseUnitOfMeasure: line.base_unit_of_measure,
        uomConversionFactor: Number(
          asNumber(line.uom_conversion_factor).toFixed(6),
        ),
        baseQuantity: Number(asNumber(line.base_quantity).toFixed(3)),
        unitPrice: Number(asNumber(line.unit_price).toFixed(2)),
        discountAmount: Number(asNumber(line.discount_amount).toFixed(2)),
        taxAmount: Number(asNumber(line.tax_amount).toFixed(2)),
        lineTotal: Number(asNumber(line.line_total).toFixed(2)),
        appliedPromotionCode: line.applied_promotion_code,
        appliedPromotionName: line.applied_promotion_name,
      })),
      payments: preparedDepositPayments.payments.map((payment) => ({
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
        paymentPurpose:
          orderType === "LAYAWAY" ? "LAYAWAY_DEPOSIT" : "SALES_ORDER_DEPOSIT",
        receivedShiftId: openShift.id,
        receivedShiftNo: openShift.shift_no,
        receivedTerminalCode: terminalCode,
        receivedCashierCode: operatorSession.loginId,
        receivedAt: payment.receivedAt,
      })),
      reservations: reservationRows,
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO sales_order (
          id,
          order_no,
          source_transaction_id,
          source_transaction_no,
          customer_id,
          customer_no,
          customer_name,
          order_type,
          status,
          total_amount,
          deposit_amount,
          paid_amount,
          balance_amount,
          deposit_tender_method_code,
          deposit_tender_method_name,
          deposit_payment_method,
          deposit_reference,
          deposit_paid_at,
          layaway_policy_snapshot_json,
          minimum_deposit_amount,
          reservation_status,
          reservation_created_at,
          reservation_released_at,
          layaway_expires_at,
          expired_at,
          cancellation_fee_amount,
          refunded_amount,
          operator_name,
          note,
          fulfilled_transaction_id,
          fulfilled_transaction_no,
          synced_at,
          created_at,
          fulfilled_at,
          cancelled_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NULL, $22, NULL, 0, 0, $23, $24, NULL, NULL, NULL, $25, NULL, NULL, $25)`,
        [
          orderId,
          orderNo,
          refreshedBasket.id,
          refreshedBasket.transaction_no,
          refreshedBasket.customer_id,
          refreshedBasket.customer_no,
          refreshedBasket.customer_name,
          orderType,
          totalAmount,
          depositAmount,
          paidAmount,
          balanceAmount,
          primaryDepositPayment?.tenderMethodCode ?? null,
          primaryDepositPayment?.tenderMethodName ?? null,
          primaryDepositPayment?.method ?? null,
          primaryDepositPayment?.reference ?? null,
          depositAmount > 0 ? timestamp : null,
          layawayOpening ? JSON.stringify(layawayOpening.policySnapshot) : null,
          layawayOpening?.minimumDepositAmount ?? 0,
          layawayOpening?.reservationStatus ?? "NOT_APPLICABLE",
          reservationRows.length > 0 ? timestamp : null,
          layawayExpiresAt,
          operatorName,
          note,
          timestamp,
        ],
      );
      for (const reservation of reservationRows) {
        await client.query(
          `INSERT INTO sales_order_inventory_reservation (
            id, sales_order_id, sales_order_line_id, inventory_location_code,
            product_code, product_variant_code, base_unit_of_measure, base_quantity,
            status, release_reason, created_at, released_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', NULL, $9, NULL, $9)`,
          [
            reservation.reservationId,
            orderId,
            reservation.salesOrderLineId,
            reservation.inventoryLocationCode,
            reservation.productCode,
            reservation.productVariantCode,
            reservation.baseUnitOfMeasure,
            reservation.baseQuantity,
            timestamp,
          ],
        );
      }
      for (const payment of preparedDepositPayments.payments) {
        await client.query(
          `INSERT INTO pos_payment (
            id,
            pos_transaction_id,
            tender_method_code,
            tender_method_name,
            bank_account_id,
            bank_code,
            bank_name,
            bank_branch_code,
            bank_branch_name,
            bank_account_number,
            bank_account_name,
            method,
            payment_purpose,
            amount,
            reference,
            received_shift_id,
            received_shift_no,
            received_terminal_code,
            received_cashier_code,
            received_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            payment.paymentId,
            refreshedBasket.id,
            payment.tenderMethodCode,
            payment.tenderMethodName,
            payment.bankAccountId,
            payment.bankCode,
            payment.bankName,
            payment.bankBranchCode,
            payment.bankBranchName,
            payment.bankAccountNumber,
            payment.bankAccountName,
            payment.method,
            orderType === "LAYAWAY" ? "LAYAWAY_DEPOSIT" : "SALES_ORDER_DEPOSIT",
            payment.amount,
            payment.reference,
            openShift.id,
            openShift.shift_no,
            terminalCode,
            operatorSession.loginId,
            payment.receivedAt,
          ],
        );
      }
      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'salesOrder', $3, 'sales-order.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            orderId,
            ENTERPRISE_NODE_CODE,
            orderId,
            `${nodeCode}:salesOrder:${orderNo}:recorded`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        `UPDATE pos_transaction
         SET status = 'PARKED',
             paid_amount = $1,
             header_reference = $2,
             additional_details = $3,
             updated_at = $4
         WHERE id = $5`,
        [
          depositAmount,
          headerReference,
          additionalDetails,
          timestamp,
          refreshedBasket.id,
        ],
      );
      await this.recordTransactionReferenceCapture(client, {
        reference: headerReference,
        details: additionalDetails,
        transactionNo: refreshedBasket.transaction_no,
        capturedAt: timestamp,
      });
      await client.query(
        `UPDATE pos_transaction_line
         SET inventory_location_code = $1
         WHERE pos_transaction_id = $2
           AND line_intent = 'SALE'`,
        [salesOrderLocationCode, refreshedBasket.id],
      );
      await client.query("DELETE FROM app_metadata WHERE key = $1", [
        this.getActiveBasketMetadataKey(),
      ]);
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${orderNo} was created from PostgreSQL basket ${refreshedBasket.transaction_no} and queued for enterprise sync.`
            : `${orderNo} was created from PostgreSQL basket ${refreshedBasket.transaction_no} for standalone fulfilment.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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
        "Flash ERP could not find that open sales order in PostgreSQL.",
      );
    }

    await this.requireActiveOperatorSession({
      permissionCodes: [
        order.order_type === "LAYAWAY" ? "pos.layaway.fulfil" : "pos.sale.process",
      ],
      purpose:
        order.order_type === "LAYAWAY"
          ? "fulfilling a layaway"
          : "fulfilling a sales order",
    });

    if (order.order_type === "LAYAWAY") {
      assertLayawayFulfilmentEligible({
        balanceAmount: asNumber(order.balance_amount),
        policySnapshot: order.layaway_policy_snapshot_json
          ? JSON.parse(order.layaway_policy_snapshot_json)
          : await this.getLayawaySettings(),
      });
    }

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
      summary: `${order.order_no} was opened in the PostgreSQL sell lane for fulfilment.`,
      startedAt: timestamp,
    });

    return {
      message: `${order.order_no} is ready in the sell lane for fulfilment.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async receiveLayawayPayment(
    input: StoreReceiveLayawayPaymentRequest,
  ): Promise<StoreSyncActionResult> {
    const order = await this.getSalesOrderRow(input.orderId);

    if (!order || order.status !== "OPEN" || order.order_type !== "LAYAWAY") {
      throw new Error("Flash ERP could not find that open layaway in PostgreSQL.");
    }

    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["pos.layaway.payment.receive"],
      purpose: "receiving a layaway installment",
    });
    const shift = await this.getOpenShiftRow();

    if (!shift) {
      throw new Error("Open a cashier shift before receiving a layaway payment.");
    }

    const timestamp = isoNow();
    const requestedAmount = Number(
      input.payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toFixed(2),
    );
    const currentBalance = Number(asNumber(order.balance_amount).toFixed(2));

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new Error("Enter a layaway installment greater than zero.");
    }

    if (requestedAmount > currentBalance + 0.005) {
      throw new Error(`The installment cannot exceed the ${currentBalance.toFixed(2)} layaway balance.`);
    }

    const preparedPayments = await this.normalizeCheckoutPayments(
      { payments: input.payments },
      requestedAmount,
      order.order_no,
      timestamp,
      "SALE",
    );
    const nextPaidAmount = Number((asNumber(order.paid_amount) + preparedPayments.paidAmount).toFixed(2));
    const nextBalanceAmount = Number(Math.max(0, asNumber(order.total_amount) - nextPaidAmount).toFixed(2));
    const nextRecordVersion = Math.max(1, asNumber(order.record_version) + 1);
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const operatorName = input.operatorName?.trim() || order.operator_name;
    const note = input.note?.trim() || order.note;
    const eventId = randomUUID();
    const paymentPayloads: NonNullable<StoreSalesOrderRecordedPayload["payments"]> =
      preparedPayments.payments.map((payment) => ({
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
        paymentPurpose: "LAYAWAY_INSTALLMENT",
        receivedShiftId: shift.id,
        receivedShiftNo: shift.shift_no,
        receivedTerminalCode: this.getTerminalCode(),
        receivedCashierCode: operatorSession.loginId,
        receivedAt: payment.receivedAt,
      }));
    const payload = await this.buildSalesOrderLifecyclePayload(
      {
        ...order,
        paid_amount: nextPaidAmount,
        balance_amount: nextBalanceAmount,
        operator_name: operatorName,
        note,
        record_version: nextRecordVersion,
        updated_at: timestamp,
      },
      { payments: paymentPayloads },
    );
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      for (const payment of preparedPayments.payments) {
        await client.query(
          `INSERT INTO pos_payment (
            id, pos_transaction_id, tender_method_code, tender_method_name,
            bank_account_id, bank_code, bank_name, bank_branch_code, bank_branch_name,
            bank_account_number, bank_account_name, method, payment_purpose, amount,
            reference, received_shift_id, received_shift_no, received_terminal_code,
            received_cashier_code, received_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'LAYAWAY_INSTALLMENT',$13,$14,$15,$16,$17,$18,$19)`,
          [
            payment.paymentId, order.source_transaction_id, payment.tenderMethodCode,
            payment.tenderMethodName, payment.bankAccountId, payment.bankCode,
            payment.bankName, payment.bankBranchCode, payment.bankBranchName,
            payment.bankAccountNumber, payment.bankAccountName, payment.method,
            payment.amount, payment.reference, shift.id, shift.shift_no,
            this.getTerminalCode(), operatorSession.loginId, payment.receivedAt,
          ],
        );
      }
      await client.query(
        `UPDATE pos_transaction SET paid_amount = $1, updated_at = $2 WHERE id = $3`,
        [nextPaidAmount, timestamp, order.source_transaction_id],
      );
      await client.query(
        `UPDATE sales_order
         SET paid_amount = $1, balance_amount = $2, operator_name = $3, note = $4,
             record_version = $5, updated_at = $6
         WHERE id = $7 AND status = 'OPEN'`,
        [nextPaidAmount, nextBalanceAmount, operatorName, note, nextRecordVersion, timestamp, order.id],
      );
      if (!this.isStandaloneDeployment()) {
        await client.query(
          `INSERT INTO sync_outbox (
            id, target_node_code, aggregate_type, aggregate_id, event_type,
            idempotency_key, payload_json, status, attempt_count, record_version,
            created_at, updated_at
          ) VALUES ($1,$2,'salesOrder',$3,'sales-order.payment-received',$4,$5,'PENDING',0,$6,$7,$7)`,
          [eventId, ENTERPRISE_NODE_CODE, order.id, `${nodeCode}:salesOrder:${order.order_no}:payment:${eventId}`, JSON.stringify(payload), nextRecordVersion, timestamp],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value) VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: `${preparedPayments.paidAmount.toFixed(2)} was received for ${order.order_no}; balance ${nextBalanceAmount.toFixed(2)}.`,
      snapshot: await this.getSyncSnapshot(),
      salesOrderNo: order.order_no,
    };
  }

  async releaseLayawayReservation(
    input: StoreReleaseLayawayReservationRequest,
  ): Promise<StoreSyncActionResult> {
    const order = await this.getSalesOrderRow(input.orderId);

    if (!order || order.status !== "OPEN" || order.order_type !== "LAYAWAY") {
      throw new Error("Flash ERP could not find that open layaway in PostgreSQL.");
    }

    await this.requireActiveOperatorSession({
      permissionCodes: ["pos.layaway.reservation.release"],
      purpose: "releasing a layaway stock reservation",
    });
    const reason = input.reason.trim();

    if (!reason) {
      throw new Error("Enter why the layaway reservation is being released.");
    }

    const timestamp = isoNow();
    const nextRecordVersion = Math.max(1, asNumber(order.record_version) + 1);
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const payload = await this.buildSalesOrderLifecyclePayload({
      ...order,
      reservation_status: "RELEASED",
      reservation_released_at: timestamp,
      operator_name: input.operatorName?.trim() || order.operator_name,
      record_version: nextRecordVersion,
      updated_at: timestamp,
    }, {
      reservations: (await this.getSalesOrderReservationPayloads(order.id)).map((reservation) =>
        reservation.status === "ACTIVE"
          ? { ...reservation, status: "RELEASED", releaseReason: reason, releasedAt: timestamp }
          : reservation,
      ),
    });
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE sales_order_inventory_reservation
         SET status = 'RELEASED', release_reason = $1, released_at = $2, updated_at = $2
         WHERE sales_order_id = $3 AND status = 'ACTIVE'`,
        [reason, timestamp, order.id],
      );
      await client.query(
        `UPDATE sales_order SET reservation_status = 'RELEASED', reservation_released_at = $1,
             operator_name = $2, record_version = $3, updated_at = $1
         WHERE id = $4 AND status = 'OPEN'`,
        [timestamp, input.operatorName?.trim() || order.operator_name, nextRecordVersion, order.id],
      );
      if (!this.isStandaloneDeployment()) {
        await client.query(
          `INSERT INTO sync_outbox (id,target_node_code,aggregate_type,aggregate_id,event_type,idempotency_key,payload_json,status,attempt_count,record_version,created_at,updated_at)
           VALUES ($1,$2,'salesOrder',$3,'sales-order.reservation-released',$4,$5,'PENDING',0,$6,$7,$7)`,
          [randomUUID(), ENTERPRISE_NODE_CODE, order.id, `${nodeCode}:salesOrder:${order.order_no}:reservation-released:${nextRecordVersion}`, JSON.stringify(payload), nextRecordVersion, timestamp],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return { message: `${order.order_no} stock reservation was released.`, snapshot: await this.getSyncSnapshot(), salesOrderNo: order.order_no };
  }

  async expireLayaway(input: StoreExpireLayawayRequest): Promise<StoreSyncActionResult> {
    const order = await this.getSalesOrderRow(input.orderId);

    if (!order || order.status !== "OPEN" || order.order_type !== "LAYAWAY") {
      throw new Error("Flash ERP could not find that open layaway in PostgreSQL.");
    }

    await this.requireActiveOperatorSession({ permissionCodes: ["pos.layaway.reservation.release"], purpose: "expiring a layaway" });
    const timestamp = isoNow();

    if (!order.layaway_expires_at) {
      throw new Error(`${order.order_no} does not have an expiry date.`);
    }
    if (Date.parse(order.layaway_expires_at) > Date.parse(timestamp)) {
      throw new Error(`${order.order_no} is not due to expire yet.`);
    }

    const reason = input.reason?.trim() || "Layaway expired before fulfilment.";
    const nextRecordVersion = Math.max(1, asNumber(order.record_version) + 1);
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const payload = await this.buildSalesOrderLifecyclePayload({
      ...order,
      status: "EXPIRED",
      reservation_status: "EXPIRED",
      reservation_released_at: timestamp,
      expired_at: timestamp,
      operator_name: input.operatorName?.trim() || order.operator_name,
      note: reason,
      record_version: nextRecordVersion,
      updated_at: timestamp,
    }, {
      reservations: (await this.getSalesOrderReservationPayloads(order.id)).map((reservation) =>
        reservation.status === "ACTIVE"
          ? { ...reservation, status: "EXPIRED", releaseReason: reason, releasedAt: timestamp }
          : reservation,
      ),
    });
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE sales_order_inventory_reservation SET status = 'EXPIRED', release_reason = $1,
             released_at = $2, updated_at = $2 WHERE sales_order_id = $3 AND status = 'ACTIVE'`,
        [reason, timestamp, order.id],
      );
      await client.query(
        `UPDATE sales_order SET status = 'EXPIRED', reservation_status = 'EXPIRED',
             reservation_released_at = $1, expired_at = $1, operator_name = $2, note = $3,
             record_version = $4, updated_at = $1 WHERE id = $5 AND status = 'OPEN'`,
        [timestamp, input.operatorName?.trim() || order.operator_name, reason, nextRecordVersion, order.id],
      );
      await client.query(`UPDATE pos_transaction SET status = 'CANCELLED', updated_at = $1 WHERE id = $2`, [timestamp, order.source_transaction_id]);
      if (!this.isStandaloneDeployment()) {
        await client.query(
          `INSERT INTO sync_outbox (id,target_node_code,aggregate_type,aggregate_id,event_type,idempotency_key,payload_json,status,attempt_count,record_version,created_at,updated_at)
           VALUES ($1,$2,'salesOrder',$3,'sales-order.expired',$4,$5,'PENDING',0,$6,$7,$7)`,
          [randomUUID(), ENTERPRISE_NODE_CODE, order.id, `${nodeCode}:salesOrder:${order.order_no}:expired`, JSON.stringify(payload), nextRecordVersion, timestamp],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return { message: `${order.order_no} expired and its stock reservation was released.`, snapshot: await this.getSyncSnapshot(), salesOrderNo: order.order_no };
  }

  async cancelSalesOrder(
    input: StoreCancelSalesOrderRequest,
  ): Promise<StoreSyncActionResult> {
    const order = await this.getSalesOrderRow(input.orderId);

    if (!order || order.status !== "OPEN") {
      throw new Error(
        "Flash ERP could not find that open sales order in PostgreSQL.",
      );
    }

    const isLayaway = order.order_type === "LAYAWAY";
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: [
        isLayaway ? "pos.layaway.cancel-refund" : "pos.sale.process",
        ...(isLayaway && input.policyOverrideApproved
          ? ["pos.layaway.policy.override"]
          : []),
      ],
      purpose: isLayaway ? "cancelling and refunding a layaway" : "cancelling a sales order",
    });
    const timestamp = isoNow();
    const cancellationAmounts = isLayaway
      ? calculateLayawayCancellationAmounts({
          paidAmount: asNumber(order.paid_amount),
          policySnapshot: order.layaway_policy_snapshot_json
            ? JSON.parse(order.layaway_policy_snapshot_json)
            : await this.getLayawaySettings(),
        })
      : { cancellationFeeAmount: 0, refundAmount: 0 };
    const refundShift = cancellationAmounts.refundAmount > 0 ? await this.getOpenShiftRow() : null;

    if (cancellationAmounts.refundAmount > 0 && !refundShift) {
      throw new Error("Open a cashier shift before refunding the layaway.");
    }
    if (
      cancellationAmounts.refundAmount > 0 &&
      (!input.refundPayments || input.refundPayments.length === 0)
    ) {
      throw new Error(`Choose refund tenders totalling ${cancellationAmounts.refundAmount.toFixed(2)} before cancelling this layaway.`);
    }

    const preparedRefundPayments = cancellationAmounts.refundAmount > 0
      ? await this.normalizeCheckoutPayments(
          { payments: input.refundPayments ?? [] },
          cancellationAmounts.refundAmount,
          order.order_no,
          timestamp,
          "RETURN",
        )
      : { payments: [] as NormalizedCheckoutPayment[], paidAmount: 0, changeAmount: 0 };
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const operatorName = input.operatorName?.trim() || order.operator_name;
    const note = input.note?.trim() || order.note;
    const nextRecordVersion = Math.max(1, asNumber(order.record_version) + 1);
    const refundPayloads: NonNullable<StoreSalesOrderRecordedPayload["payments"]> =
      preparedRefundPayments.payments.map((payment) => ({
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
        amount: Number((payment.amount * -1).toFixed(2)),
        reference: payment.reference,
        paymentPurpose: "LAYAWAY_REFUND",
        receivedShiftId: refundShift?.id ?? null,
        receivedShiftNo: refundShift?.shift_no ?? null,
        receivedTerminalCode: this.getTerminalCode(),
        receivedCashierCode: operatorSession.loginId,
        receivedAt: payment.receivedAt,
      }));
    const payload = await this.buildSalesOrderLifecyclePayload({
      ...order,
      status: "CANCELLED",
      reservation_status:
        isLayaway && order.reservation_status === "ACTIVE" ? "RELEASED" : order.reservation_status,
      reservation_released_at:
        isLayaway && order.reservation_status === "ACTIVE" ? timestamp : order.reservation_released_at,
      cancellation_fee_amount: cancellationAmounts.cancellationFeeAmount,
      refunded_amount: cancellationAmounts.refundAmount,
      operator_name: operatorName,
      note,
      cancelled_at: timestamp,
      record_version: nextRecordVersion,
      updated_at: timestamp,
    }, {
      payments: refundPayloads,
      reservations: (await this.getSalesOrderReservationPayloads(order.id)).map((reservation) =>
        isLayaway && reservation.status === "ACTIVE"
          ? { ...reservation, status: "RELEASED", releaseReason: `Released when ${order.order_no} was cancelled.`, releasedAt: timestamp }
          : reservation,
      ),
    });
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      for (const payment of preparedRefundPayments.payments) {
        await client.query(
          `INSERT INTO pos_payment (
            id,pos_transaction_id,tender_method_code,tender_method_name,bank_account_id,
            bank_code,bank_name,bank_branch_code,bank_branch_name,bank_account_number,
            bank_account_name,method,payment_purpose,amount,reference,received_shift_id,
            received_shift_no,received_terminal_code,received_cashier_code,received_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'LAYAWAY_REFUND',$13,$14,$15,$16,$17,$18,$19)`,
          [
            payment.paymentId, order.source_transaction_id, payment.tenderMethodCode,
            payment.tenderMethodName, payment.bankAccountId, payment.bankCode,
            payment.bankName, payment.bankBranchCode, payment.bankBranchName,
            payment.bankAccountNumber, payment.bankAccountName, payment.method,
            Number((payment.amount * -1).toFixed(2)), payment.reference,
            refundShift?.id ?? null, refundShift?.shift_no ?? null, this.getTerminalCode(),
            operatorSession.loginId, payment.receivedAt,
          ],
        );
      }
      if (isLayaway) {
        await client.query(
          `UPDATE sales_order_inventory_reservation
           SET status = 'RELEASED', release_reason = $1, released_at = $2, updated_at = $2
           WHERE sales_order_id = $3 AND status = 'ACTIVE'`,
          [`Released when ${order.order_no} was cancelled.`, timestamp, order.id],
        );
      }
      await client.query(
        `UPDATE sales_order SET status = 'CANCELLED',
             reservation_status = CASE WHEN order_type = 'LAYAWAY' AND reservation_status = 'ACTIVE' THEN 'RELEASED' ELSE reservation_status END,
             reservation_released_at = CASE WHEN order_type = 'LAYAWAY' AND reservation_status = 'ACTIVE' THEN $1 ELSE reservation_released_at END,
             cancellation_fee_amount = $2, refunded_amount = $3, operator_name = $4,
             note = $5, cancelled_at = $1, record_version = $6, updated_at = $1
         WHERE id = $7`,
        [timestamp, cancellationAmounts.cancellationFeeAmount, cancellationAmounts.refundAmount, operatorName, note, nextRecordVersion, order.id],
      );
      await client.query(
        "UPDATE pos_transaction SET status = 'CANCELLED', paid_amount = $1, updated_at = $2 WHERE id = $3",
        [Math.max(0, asNumber(order.paid_amount) - cancellationAmounts.refundAmount), timestamp, order.source_transaction_id],
      );

      if ((await this.getActiveBasketId()) === order.source_transaction_id) {
        await client.query("DELETE FROM app_metadata WHERE key = $1", [
          this.getActiveBasketMetadataKey(),
        ]);
      }

      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'salesOrder', $3, 'sales-order.cancelled', $4, $5, 'PENDING', 0, $6, $7, $7)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            order.id,
            `${nodeCode}:salesOrder:${order.order_no}:cancelled`,
            JSON.stringify(payload),
            nextRecordVersion,
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${order.order_no} was cancelled on the PostgreSQL store node and queued for enterprise sync.`
            : `${order.order_no} was cancelled on the PostgreSQL store node for standalone sales orders.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: isLayaway
        ? `${order.order_no} was cancelled; fee ${cancellationAmounts.cancellationFeeAmount.toFixed(2)}, refund ${cancellationAmounts.refundAmount.toFixed(2)}.`
        : `${order.order_no} was cancelled locally.`,
      snapshot: await this.getSyncSnapshot(),
      salesOrderNo: order.order_no,
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
      ? ((await this.getShiftRows("WHERE id = $1", [input.shiftId]))[0] ?? null)
      : await this.getOpenShiftRow();

    if (!shift) {
      throw new Error(
        "Choose an open or recently closed shift before recording EOD reconciliation.",
      );
    }

    const existing = await this.pool.query<{ id: string }>(
      "SELECT id FROM eod_reconciliation WHERE shift_id = $1 LIMIT 1",
      [shift.id],
    );

    if (existing.rows[0]) {
      throw new Error(
        `${shift.shift_no} has already been reconciled in PostgreSQL.`,
      );
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

    await this.pool.query(
      `INSERT INTO eod_reconciliation (
        id,
        reconciliation_no,
        shift_id,
        shift_no,
        cashier_code,
        expected_cash_amount,
        declared_cash_amount,
        variance_amount,
        net_sales_amount,
        cash_tendered_amount,
        non_cash_tendered_amount,
        transaction_count,
        operator_name,
        note,
        synced_at,
        reconciled_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL, $15, $15)`,
      [
        reconciliationId,
        reconciliationNo,
        shiftSummary.shiftId,
        shiftSummary.shiftNo,
        shiftSummary.cashierCode,
        shiftSummary.expectedCashAmount,
        declaredCashAmount,
        varianceAmount,
        shiftSummary.netSalesAmount,
        shiftSummary.cashTenderedAmount,
        shiftSummary.nonCashTenderedAmount,
        shiftSummary.transactionCount,
        operatorName,
        note,
        timestamp,
      ],
    );
    if (shouldQueueEnterprise) {
      await this.pool.query(
        `INSERT INTO sync_outbox (
        id,
        target_node_code,
        aggregate_type,
        aggregate_id,
        event_type,
        idempotency_key,
        payload_json,
        status,
        attempt_count,
        record_version,
        created_at,
        updated_at
      ) VALUES ($1, $2, 'eodReconciliation', $3, 'eod-reconciliation.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
        [
          reconciliationId,
          ENTERPRISE_NODE_CODE,
          reconciliationId,
          `${nodeCode}:eodReconciliation:${reconciliationNo}`,
          JSON.stringify(payload),
          timestamp,
        ],
      );
    }
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${reconciliationNo} reconciled ${shiftSummary.shiftNo} with a cash variance of ${varianceAmount.toFixed(2)}.`,
      startedAt: timestamp,
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

    const alreadyDeposited = await this.scalar(
      "SELECT COALESCE(sum(amount), 0) AS value FROM banking_deposit WHERE reconciliation_id = $1",
      [reconciliation.id],
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

    await this.pool.query(
      `INSERT INTO banking_deposit (
        id,
        deposit_no,
        reconciliation_id,
        reconciliation_no,
        shift_id,
        shift_no,
        amount,
        bank_account_id,
        bank_name,
        bank_code,
        bank_branch_code,
        bank_branch_name,
        bank_account_number,
        bank_account_name,
        reference,
        operator_name,
        note,
        synced_at,
        deposited_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NULL, $18, $18)`,
      [
        depositId,
        depositNo,
        reconciliation.id,
        reconciliation.reconciliation_no,
        reconciliation.shift_id,
        reconciliation.shift_no,
        amount,
        bankAccount?.bankAccountId ?? null,
        bankName,
        bankAccount?.bankCode ?? null,
        bankAccount?.branchCode ?? null,
        bankAccount?.branchName ?? null,
        bankAccount?.accountNumber ?? null,
        bankAccount?.accountName ?? null,
        reference,
        operatorName,
        note,
        timestamp,
      ],
    );
    if (shouldQueueEnterprise) {
      await this.pool.query(
        `INSERT INTO sync_outbox (
        id,
        target_node_code,
        aggregate_type,
        aggregate_id,
        event_type,
        idempotency_key,
        payload_json,
        status,
        attempt_count,
        record_version,
        created_at,
        updated_at
      ) VALUES ($1, $2, 'bankingDeposit', $3, 'banking-deposit.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
        [
          depositId,
          ENTERPRISE_NODE_CODE,
          depositId,
          `${nodeCode}:bankingDeposit:${depositNo}`,
          JSON.stringify(payload),
          timestamp,
        ],
      );
    }
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${depositNo} banked ${amount.toFixed(2)} against ${reconciliation.reconciliation_no}.`,
      startedAt: timestamp,
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
    const existingResult = await this.pool.query<{
      id: string;
      expense_no: string;
      status: string;
    }>(
      `SELECT id, expense_no, status
       FROM local_store_expense
       WHERE id = $1
       LIMIT 1`,
      [expenseId],
    );
    const existing = existingResult.rows[0] ?? null;

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

    await this.pool.query(
      `INSERT INTO local_store_expense (
        id,
        expense_no,
        status,
        expense_date,
        category,
        description,
        supplier_name,
        payment_method,
        external_reference,
        amount,
        tax_amount,
        attachment_file_name,
        attachment_url,
        attachment_content_type,
        attachment_content_base64,
        operator_name,
        note,
        confirmed_by,
        confirmed_at,
        synced_at,
        updated_at
      ) VALUES (
        $1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, NULL, NULL, NULL, $17
      )
      ON CONFLICT (id) DO UPDATE SET
        expense_date = excluded.expense_date,
        category = excluded.category,
        description = excluded.description,
        supplier_name = excluded.supplier_name,
        payment_method = excluded.payment_method,
        external_reference = excluded.external_reference,
        amount = excluded.amount,
        tax_amount = excluded.tax_amount,
        attachment_file_name = excluded.attachment_file_name,
        attachment_url = excluded.attachment_url,
        attachment_content_type = excluded.attachment_content_type,
        attachment_content_base64 = excluded.attachment_content_base64,
        operator_name = excluded.operator_name,
        note = excluded.note,
        updated_at = excluded.updated_at`,
      [
        expenseId,
        expenseNo,
        expenseDate,
        category,
        description,
        input.supplierName?.trim() || null,
        input.paymentMethod?.trim() || null,
        input.externalReference?.trim() || null,
        amount,
        taxAmount,
        input.attachmentFileName?.trim() || null,
        input.attachmentUrl?.trim() || null,
        input.attachmentContentType?.trim() || null,
        input.attachmentContentBase64?.trim() || null,
        operatorName,
        input.note?.trim() || null,
        timestamp,
      ],
    );

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${expenseNo} store expense draft saved.`,
      startedAt: timestamp,
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

    const rowResult = await this.pool.query<{
      id: string;
      expense_no: string;
      status: string;
      expense_date: string;
      category: string;
      description: string;
      supplier_name: string | null;
      payment_method: string | null;
      external_reference: string | null;
      amount: string | number;
      tax_amount: string | number | null;
      attachment_file_name: string | null;
      attachment_url: string | null;
      attachment_content_type: string | null;
      attachment_content_base64: string | null;
      operator_name: string | null;
      note: string | null;
      confirmed_at: string | null;
    }>(
      `SELECT id, expense_no, status, expense_date, category, description,
              supplier_name, payment_method, external_reference, amount,
              tax_amount, attachment_file_name, attachment_url,
              attachment_content_type, attachment_content_base64,
              operator_name, note, confirmed_at
       FROM local_store_expense
       WHERE id = $1
       LIMIT 1`,
      [normalizedExpenseId],
    );
    const row = rowResult.rows[0] ?? null;

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

    await this.pool.query(
      `UPDATE local_store_expense
       SET status = 'APPROVED',
           confirmed_by = $1,
           confirmed_at = $2,
           updated_at = $3
       WHERE id = $4`,
      [confirmedBy, confirmedAt, timestamp, normalizedExpenseId],
    );

    const outboxResult = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM sync_outbox
       WHERE aggregate_type = 'storeExpense'
         AND aggregate_id = $1
         AND event_type = 'store-expense.confirmed'
       LIMIT 1`,
      [normalizedExpenseId],
    );

    if (shouldQueueEnterprise && !outboxResult.rows[0]) {
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

      await this.pool.query(
        `INSERT INTO sync_outbox (
          id,
          target_node_code,
          aggregate_type,
          aggregate_id,
          event_type,
          idempotency_key,
          payload_json,
          status,
          attempt_count,
          record_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, 'storeExpense', $3, 'store-expense.confirmed', $4, $5, 'PENDING', 0, 1, $6, $6)`,
        [
          normalizedExpenseId,
          ENTERPRISE_NODE_CODE,
          normalizedExpenseId,
          `${nodeCode}:storeExpense:${row.expense_no}`,
          JSON.stringify(payload),
          timestamp,
        ],
      );
    }

    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${row.expense_no} store expense confirmed.`,
      startedAt: timestamp,
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
      summary:
        "Thermal receipt printer routing was updated on this PostgreSQL desktop node.",
      startedAt: timestamp,
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
      summary: companyLogoUrl
        ? "Local receipt logo was saved on this PostgreSQL desktop node."
        : "Local receipt logo was cleared on this PostgreSQL desktop node.",
      startedAt: timestamp,
    });

    return {
      message: companyLogoUrl
        ? "Local receipt logo was saved on this shop desktop."
        : "Local receipt logo was cleared on this shop desktop.",
      snapshot: await this.getSyncSnapshot(),
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

  async saveInterStoreTransferRequestDraft(
    input: StoreInterStoreTransferRequestDraftInput,
  ): Promise<StoreSyncActionResult> {
    const direction =
      input.direction === "DIRECT_OUT" ? "DIRECT_OUT" : "REQUEST_IN";
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: [
        direction === "DIRECT_OUT"
          ? "inventory.transfer.issue"
          : "inventory.transfer.request",
      ],
      purpose:
        direction === "DIRECT_OUT"
          ? "saving a direct inter-store transfer out"
          : "saving an inter-store transfer request",
    });
    const sourceStoreCode = input.sourceStoreCode?.trim() ?? "";
    const destinationLocationCode = input.destinationLocationCode.trim();
    const requestedLines =
      input.lines && input.lines.length > 0
        ? input.lines
        : input.productCode
          ? [{ productCode: input.productCode, quantity: Number(input.quantity ?? 0), unitOfMeasure: input.unitOfMeasure }]
          : [];

    if (
      !sourceStoreCode ||
      !destinationLocationCode
    ) {
      throw new Error(
        "Choose a source shop and local destination location before saving the transfer request.",
      );
    }

    if (requestedLines.length === 0) {
      throw new Error("Add at least one item before saving the transfer request.");
    }

    if (requestedLines.length > 50) {
      throw new Error("A transfer request can contain up to 50 item lines.");
    }

    const [metadata, targetResult, locationResult] = await Promise.all(
      [
        this.metadata(),
        this.pool.query<TransferRequestTargetSnapshotRow>(
          `SELECT
          source_store_code,
          source_store_name,
          source_store_sales_enabled,
          source_store_warehouse_enabled,
          source_location_code,
          source_location_name,
          source_location_type,
          source_location_status,
          source_location_defaults,
          source_warehouse_code,
          source_warehouse_name,
          use_for_sales_default,
          use_for_receiving_default,
          updated_at
         FROM inter_store_transfer_request_target_snapshot
         WHERE UPPER(source_store_code) = UPPER($1)
         ORDER BY use_for_sales_default DESC,
                  use_for_receiving_default DESC,
                  source_location_name
         LIMIT 1`,
          [sourceStoreCode],
        ),
        this.pool.query<{
          location_code: string;
          location_name: string;
        }>(
          `SELECT location_code, location_name
         FROM inventory_location_snapshot
         WHERE UPPER(location_code) = UPPER($1)
         LIMIT 1`,
          [destinationLocationCode],
        ),
      ],
    );
    const target = targetResult.rows[0] ?? null;
    const destinationLocation = locationResult.rows[0] ?? null;

    if (!target) {
      throw new Error(
        `Flash ERP has no synced enterprise transfer source shop for ${sourceStoreCode}. Pull the latest sync and select the source again.`,
      );
    }

    if (!destinationLocation) {
      throw new Error(
        `Flash ERP could not find local destination location "${destinationLocationCode}".`,
      );
    }

    const products = await Promise.all(
      requestedLines.map((line) => this.getProductByCode(line.productCode)),
    );
    const lines = requestedLines.map<StoreInterStoreTransferRequestDraftLine>(
      (line, index) => {
        const product = products[index];
        const quantity = Number(Number(line.quantity).toFixed(3));

        if (!product) {
          throw new Error(
            `Flash ERP could not find local product "${line.productCode}" on line ${index + 1}.`,
          );
        }

        if (!asBooleanFlag(product.track_inventory)) {
          throw new Error(
            `${product.product_name} is not configured for tracked inventory, so it cannot be requested through inter-store movement.`,
          );
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Transfer request line ${index + 1} needs a quantity greater than zero.`);
        }

        const transferUom = resolveInventoryTransferUom({
          enteredQuantity: quantity,
          requestedUnitOfMeasure: line.unitOfMeasure,
          unitOfMeasure: product.unit_of_measure,
          baseUnitOfMeasure: product.base_unit_of_measure,
          uomConversions: parseProductUomConversions(
            product.uom_conversions_json,
            product.base_unit_of_measure,
          ),
        });

        if (asBooleanFlag(product.is_serialized) && !Number.isInteger(transferUom.baseQuantity)) {
          throw new Error(
            `Serialized product "${product.product_code}" needs a whole-number base quantity.`,
          );
        }

        return {
          lineId: randomUUID(),
          lineNo: index + 1,
          productCode: product.product_code,
          productName: product.product_name,
          departmentCode: product.department_code,
          departmentName: null,
          categoryCode: product.category_code,
          categoryName: null,
          subcategory: product.subcategory,
          isSerialized: asBooleanFlag(product.is_serialized),
          quantity: transferUom.baseQuantity,
          requestedUnitOfMeasure: transferUom.requestedUnitOfMeasure,
          requestedUnitQuantity: transferUom.requestedUnitQuantity,
          uomConversionFactor: transferUom.uomConversionFactor,
          baseUnitOfMeasure: transferUom.baseUnitOfMeasure,
        };
      },
    );
    const firstLine = lines[0];

    if (!firstLine) {
      throw new Error("Add at least one valid item before saving the transfer request.");
    }

    const timestamp = isoNow();
    const storeCode = metadata.store_code ?? defaultStoreConfig.storeCode;
    const existingDraft = input.draftId?.trim()
      ? (
          await this.pool.query<InterStoreTransferRequestDraftRow>(
            "SELECT * FROM inter_store_transfer_request_draft WHERE id = $1 LIMIT 1",
            [input.draftId.trim()],
          )
        ).rows[0] ?? null
      : null;

    if (input.draftId?.trim() && !existingDraft) {
      throw new Error("Flash ERP could not find that saved transfer request draft in PostgreSQL.");
    }

    if (existingDraft && existingDraft.status !== "DRAFT") {
      throw new Error(`${existingDraft.request_no} has already been sent and cannot be amended.`);
    }

    const requestId = existingDraft?.id ?? randomUUID();
    const requestNo =
      existingDraft?.request_no ??
      buildLocalDocumentNo(
        "TRQ",
        storeCode,
        await this.nextSequence("inter_store_transfer_request_sequence"),
        timestamp,
      );
    const operatorName =
      input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);
    const externalReference = input.externalReference?.trim() || null;
    const note = input.note?.trim() || null;
    const linesJson = writeTransferRequestDraftLines(lines);
    const storeName = metadata.store_name ?? defaultStoreConfig.storeName;
    const resolvedSourceStoreCode =
      direction === "DIRECT_OUT" ? storeCode : target.source_store_code;
    const resolvedSourceStoreName =
      direction === "DIRECT_OUT" ? storeName : target.source_store_name;
    const resolvedSourceLocationCode =
      direction === "DIRECT_OUT"
        ? destinationLocation.location_code
        : target.source_location_code;
    const resolvedSourceLocationName =
      direction === "DIRECT_OUT"
        ? destinationLocation.location_name
        : target.source_location_name;
    const resolvedDestinationStoreCode =
      direction === "DIRECT_OUT" ? target.source_store_code : storeCode;
    const resolvedDestinationStoreName =
      direction === "DIRECT_OUT" ? target.source_store_name : storeName;
    const resolvedDestinationLocationCode =
      direction === "DIRECT_OUT"
        ? target.source_location_code
        : destinationLocation.location_code;
    const resolvedDestinationLocationName =
      direction === "DIRECT_OUT"
        ? target.source_location_name
        : destinationLocation.location_name;

    if (existingDraft) {
      await this.pool.query(
        `UPDATE inter_store_transfer_request_draft
         SET source_store_code = $1, source_store_name = $2,
             source_location_code = $3, source_location_name = $4,
             destination_store_code = $5, destination_store_name = $6,
             destination_location_code = $7, destination_location_name = $8,
             product_code = $9, product_name = $10, department_code = $11,
             category_code = $12, subcategory = $13, is_serialized = $14,
             quantity = $15, requested_unit_of_measure = $16,
             requested_unit_quantity = $17, uom_conversion_factor = $18,
             base_unit_of_measure = $19, external_reference = $20, note = $21,
             operator_name = $22, lines_json = $23, updated_at = $24
         WHERE id = $25 AND status = 'DRAFT'`,
        [
          resolvedSourceStoreCode,
          resolvedSourceStoreName,
          resolvedSourceLocationCode,
          resolvedSourceLocationName,
          resolvedDestinationStoreCode,
          resolvedDestinationStoreName,
          resolvedDestinationLocationCode,
          resolvedDestinationLocationName,
          firstLine.productCode,
          firstLine.productName,
          firstLine.departmentCode,
          firstLine.categoryCode,
          firstLine.subcategory,
          firstLine.isSerialized ? 1 : 0,
          firstLine.quantity,
          firstLine.requestedUnitOfMeasure,
          firstLine.requestedUnitQuantity,
          firstLine.uomConversionFactor,
          firstLine.baseUnitOfMeasure,
          externalReference,
          note,
          operatorName,
          linesJson,
          timestamp,
          requestId,
        ],
      );
    } else {
      await this.pool.query(
      `INSERT INTO inter_store_transfer_request_draft (
        id,
        request_no,
        status,
        source_store_code,
        source_store_name,
        source_location_code,
        source_location_name,
        destination_store_code,
        destination_store_name,
        destination_location_code,
        destination_location_name,
        product_code,
        product_name,
        department_code,
        category_code,
        subcategory,
        is_serialized,
        quantity,
        requested_unit_of_measure,
        requested_unit_quantity,
        uom_conversion_factor,
        base_unit_of_measure,
        external_reference,
        note,
        operator_name,
        lines_json,
        submitted_at,
        updated_at
      ) VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NULL, $26)`,
      [
        requestId,
        requestNo,
        resolvedSourceStoreCode,
        resolvedSourceStoreName,
        resolvedSourceLocationCode,
        resolvedSourceLocationName,
        resolvedDestinationStoreCode,
        resolvedDestinationStoreName,
        resolvedDestinationLocationCode,
        resolvedDestinationLocationName,
        firstLine.productCode,
        firstLine.productName,
        firstLine.departmentCode,
        firstLine.categoryCode,
        firstLine.subcategory,
        firstLine.isSerialized ? 1 : 0,
        firstLine.quantity,
        firstLine.requestedUnitOfMeasure,
        firstLine.requestedUnitQuantity,
        firstLine.uomConversionFactor,
        firstLine.baseUnitOfMeasure,
        externalReference,
        note,
        operatorName,
        linesJson,
        timestamp,
      ],
    );
    }
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${requestNo} was ${existingDraft ? "amended" : "saved"} as a PostgreSQL inter-store transfer request draft with ${lines.length} line(s).`,
      startedAt: timestamp,
    });

    return {
      message: `${requestNo} was ${existingDraft ? "updated" : "saved"} locally with ${lines.length} line(s). Send it when the request is ready for enterprise creation.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async submitInterStoreTransferRequestDraft(
    draftId: string,
  ): Promise<StoreSyncActionResult> {
    const normalizedDraftId = draftId.trim();

    if (!normalizedDraftId) {
      throw new Error(
        "Select a saved transfer request draft before submitting it.",
      );
    }

    const draftResult =
      await this.pool.query<InterStoreTransferRequestDraftRow>(
        `SELECT
        draft.id,
        draft.request_no,
        draft.status,
        draft.source_store_code,
        draft.source_store_name,
        draft.source_location_code,
        draft.source_location_name,
        draft.destination_store_code,
        draft.destination_store_name,
        draft.destination_location_code,
        draft.destination_location_name,
        draft.product_code,
        draft.product_name,
        draft.department_code,
        department.department_name,
        draft.category_code,
        category.category_name,
        draft.subcategory,
        draft.is_serialized,
        draft.quantity,
        draft.requested_unit_of_measure,
        draft.requested_unit_quantity,
        draft.uom_conversion_factor,
        draft.base_unit_of_measure,
        draft.external_reference,
        draft.note,
        draft.operator_name,
        draft.lines_json,
        draft.submitted_at,
        draft.updated_at
       FROM inter_store_transfer_request_draft AS draft
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = draft.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = draft.category_code
       WHERE draft.id = $1
       LIMIT 1`,
        [normalizedDraftId],
      );
    const draft = draftResult.rows[0] ?? null;

    if (!draft) {
      throw new Error(
        "Flash ERP could not find that transfer request draft in PostgreSQL.",
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
    const direction =
      draft.source_store_code.toUpperCase() === storeCode.toUpperCase()
        ? "DIRECT_OUT"
        : "REQUEST_IN";
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: [
        direction === "DIRECT_OUT"
          ? "inventory.transfer.issue"
          : "inventory.transfer.request",
      ],
      purpose:
        direction === "DIRECT_OUT"
          ? "submitting a direct inter-store transfer out"
          : "submitting an inter-store transfer request",
    });
    const terminalCode = this.getTerminalCode();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    const operatorName =
      draft.operator_name || this.formatOperatorLabel(operatorSession);
    const lines = readTransferRequestDraftLines(draft.lines_json, {
      lineId: draft.id,
      lineNo: 1,
      productCode: draft.product_code,
      productName: draft.product_name,
      departmentCode: draft.department_code,
      departmentName: draft.department_name,
      categoryCode: draft.category_code,
      categoryName: draft.category_name,
      subcategory: draft.subcategory,
      isSerialized: asBooleanFlag(draft.is_serialized),
      quantity: Number(asNumber(draft.quantity).toFixed(3)),
      requestedUnitOfMeasure: draft.requested_unit_of_measure,
      requestedUnitQuantity: Number(
        asNumber(draft.requested_unit_quantity).toFixed(3),
      ),
      uomConversionFactor: Number(
        asNumber(draft.uom_conversion_factor).toFixed(6),
      ),
      baseUnitOfMeasure: draft.base_unit_of_measure,
    });
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE inter_store_transfer_request_draft SET status = 'SUBMITTED', submitted_at = $1, updated_at = $1 WHERE id = $2",
        [timestamp, draft.id],
      );
      if (shouldQueueEnterprise) {
        for (const line of lines) {
          const payload: StoreInterStoreTransferRequestedPayload = {
            requestId: line.lineId,
            requestNo: draft.request_no,
            transferBatchNo: draft.request_no,
            lineNo: line.lineNo,
            direction,
            storeCode,
            terminalCode,
            sourceStoreCode: draft.source_store_code,
            sourceLocationCode:
              direction === "DIRECT_OUT" ? draft.source_location_code : undefined,
            destinationLocationCode: draft.destination_location_code,
            productCode: line.productCode,
            quantity: line.requestedUnitQuantity,
            unitOfMeasure: line.requestedUnitOfMeasure,
            externalReference: draft.external_reference,
            operatorName,
            note: draft.note,
            occurredAt: timestamp,
          };

          await client.query(
            `INSERT INTO sync_outbox (
              id,
              target_node_code,
              aggregate_type,
              aggregate_id,
              event_type,
              idempotency_key,
              payload_json,
              status,
              attempt_count,
              record_version,
              created_at,
              updated_at
            ) VALUES ($1, $2, 'interStoreTransfer', $3, 'inter-store-transfer.requested', $4, $5, 'PENDING', 0, 1, $6, $6)`,
            [
              randomUUID(),
              ENTERPRISE_NODE_CODE,
              line.lineId,
              `${nodeCode}:interStoreTransfer:${line.lineId}:requested`,
              JSON.stringify(payload),
              timestamp,
            ],
          );
        }
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${draft.request_no} was sent from PostgreSQL and queued upstream as one ${lines.length}-line inter-store transfer request.`
            : `${draft.request_no} was submitted from PostgreSQL for standalone transfer tracking.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: shouldQueueEnterprise
        ? `${draft.request_no} was sent with ${lines.length} line(s) and queued for enterprise creation.`
        : `${draft.request_no} was submitted locally for standalone transfer tracking.`,
      snapshot: await this.getSyncSnapshot(),
    };
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
    const requestedBatchQuantities = (input.batchQuantities ?? []).map(
      (batch) => ({
        batchId: batch.batchId ?? null,
        batchNo: batch.batchNo?.trim().toUpperCase(),
        manufacturedAt: batch.manufacturedAt?.trim() || null,
        expiryDate: batch.expiryDate?.trim(),
        quantity: Number(Number(batch.quantity).toFixed(3)),
      }),
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
      this.pool.query<{ location_code: string; location_name: string }>(
        "SELECT location_code, location_name FROM inventory_location_snapshot WHERE upper(location_code) = upper($1) AND status = 'ACTIVE' LIMIT 1",
        [locationCode],
      ),
      this.getProductByCode(productCode),
    ]);
    const location = locationResult.rows[0] ?? null;

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
    const previousBatchQuantities = asBooleanFlag(product.track_expiry)
      ? (
          await this.pool.query<{
            id: string;
            batch_no: string;
            manufactured_at: string | null;
            expiry_date: string;
            quantity_on_hand: string | number;
          }>(
            `SELECT id, batch_no, manufactured_at, expiry_date, quantity_on_hand
             FROM inventory_batch_registry
             WHERE inventory_location_code = $1
               AND product_code = $2
             ORDER BY expiry_date ASC, batch_no ASC`,
            [location.location_code, product.product_code],
          )
        ).rows.map((batch) => ({
          batchId: batch.id,
          batchNo: batch.batch_no,
          manufacturedAt: batch.manufactured_at,
          expiryDate: batch.expiry_date,
          quantity: Number(asNumber(batch.quantity_on_hand).toFixed(3)),
        }))
      : [];
    let countedBatchQuantities: StoreInventoryBatchAllocation[] = [];

    if (asBooleanFlag(product.track_expiry)) {
      const previousByBatchNo = new Map(
        previousBatchQuantities.map((batch) => [
          batch.batchNo.toUpperCase(),
          batch,
        ] as const),
      );
      const seenBatchNos = new Set<string>();

      countedBatchQuantities = requestedBatchQuantities.map((batch) => {
        if (
          !batch.batchNo ||
          !batch.expiryDate ||
          !Number.isFinite(batch.quantity) ||
          batch.quantity < 0
        ) {
          throw new Error(
            `${product.product_name} needs a valid non-negative counted quantity for every batch.`,
          );
        }

        if (seenBatchNos.has(batch.batchNo)) {
          throw new Error(
            `${batch.batchNo} was entered more than once in this stock count.`,
          );
        }
        seenBatchNos.add(batch.batchNo);

        const previousBatch = previousByBatchNo.get(batch.batchNo);
        if (!previousBatch) {
          throw new Error(
            `Batch ${batch.batchNo} is not registered for ${product.product_name} in ${location.location_code}. Receive it before counting it into stock.`,
          );
        }

        if (
          previousBatch.expiryDate.slice(0, 10) !==
          batch.expiryDate.slice(0, 10)
        ) {
          throw new Error(
            `Batch ${batch.batchNo} is registered with expiry ${previousBatch.expiryDate.slice(0, 10)}.`,
          );
        }

        return { ...previousBatch, quantity: batch.quantity };
      });

      const omittedBatch = previousBatchQuantities.find(
        (batch) => !seenBatchNos.has(batch.batchNo.toUpperCase()),
      );
      if (omittedBatch) {
        throw new Error(
          `Include batch ${omittedBatch.batchNo} in the count, using zero if no units remain.`,
        );
      }
    } else if (requestedBatchQuantities.length > 0) {
      throw new Error(
        `${product.product_name} is not configured for expiry batch tracking.`,
      );
    }

    const countedQuantity = asBooleanFlag(product.is_serialized)
      ? countedSerialNumbers.length
      : asBooleanFlag(product.track_expiry)
        ? Number(
            countedBatchQuantities
              .reduce((sum, batch) => sum + batch.quantity, 0)
              .toFixed(3),
          )
        : requestedCountedQuantity;

    if (
      asBooleanFlag(product.track_expiry) &&
      Math.abs(countedQuantity - requestedCountedQuantity) > 0.0001
    ) {
      throw new Error(
        `The batch count totals ${countedQuantity.toFixed(3)}, but the entered product count is ${requestedCountedQuantity.toFixed(3)}.`,
      );
    }

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
    const sessionId = input.sessionId?.trim() || randomUUID();
    const requestedSheetNo = input.sheetNo?.trim().toUpperCase() || null;
    const requestedLineNo = Math.max(1, Math.trunc(input.lineNo ?? 1));
    const sessionNo = requestedSheetNo
      ? `${requestedSheetNo}-L${String(requestedLineNo).padStart(3, "0")}`
      : buildLocalDocumentNo(
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

    await this.pool.query(
      `INSERT INTO stock_count_session (
        id,
        session_no,
        status,
        inventory_location_code,
        inventory_location_name,
        product_code,
        product_name,
        department_code,
        category_code,
        subcategory,
        is_serialized,
        previous_quantity,
        counted_quantity,
        variance_quantity,
        previous_serial_numbers_json,
        counted_serial_numbers_json,
        previous_batch_quantities_json,
        counted_batch_quantities_json,
        note,
        operator_name,
        submitted_at,
        committed_at,
        updated_at
      ) VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NULL, NULL, $20)
      ON CONFLICT (id) DO UPDATE SET
        session_no = excluded.session_no,
        inventory_location_code = excluded.inventory_location_code,
        inventory_location_name = excluded.inventory_location_name,
        product_code = excluded.product_code,
        product_name = excluded.product_name,
        department_code = excluded.department_code,
        category_code = excluded.category_code,
        subcategory = excluded.subcategory,
        is_serialized = excluded.is_serialized,
        previous_quantity = excluded.previous_quantity,
        counted_quantity = excluded.counted_quantity,
        variance_quantity = excluded.variance_quantity,
        previous_serial_numbers_json = excluded.previous_serial_numbers_json,
        counted_serial_numbers_json = excluded.counted_serial_numbers_json,
        previous_batch_quantities_json = excluded.previous_batch_quantities_json,
        counted_batch_quantities_json = excluded.counted_batch_quantities_json,
        note = excluded.note,
        operator_name = excluded.operator_name,
        updated_at = excluded.updated_at
      WHERE stock_count_session.status = 'DRAFT'`,
      [
        sessionId,
        sessionNo,
        location.location_code,
        location.location_name,
        product.product_code,
        product.product_name,
        product.department_code,
        product.category_code,
        product.subcategory,
        asBooleanFlag(product.is_serialized) ? 1 : 0,
        previousQuantity,
        countedQuantity,
        varianceQuantity,
        writeSerializedLineNumbers(previousSerialNumbers),
        writeSerializedLineNumbers(countedSerialNumbers),
        writeInventoryBatchAllocations(previousBatchQuantities),
        writeInventoryBatchAllocations(countedBatchQuantities),
        note,
        operatorName,
        timestamp,
      ],
    );
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${sessionNo} was saved locally as a PostgreSQL stock count session.`,
      startedAt: timestamp,
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

    const sessionResult = await this.pool.query<StockCountSessionRow>(
      `SELECT
        session.id,
        session.session_no,
        session.status,
        session.inventory_location_code,
        session.inventory_location_name,
        session.product_code,
        session.product_name,
        session.department_code,
        department.department_name,
        session.category_code,
        category.category_name,
        session.subcategory,
        session.is_serialized,
        session.previous_quantity,
        session.counted_quantity,
        session.variance_quantity,
        session.previous_serial_numbers_json,
        session.counted_serial_numbers_json,
        session.previous_batch_quantities_json,
        session.counted_batch_quantities_json,
        session.note,
        session.operator_name,
        session.submitted_at,
        session.committed_at,
        session.updated_at
       FROM stock_count_session AS session
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = session.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = session.category_code
       WHERE session.id = $1
       LIMIT 1`,
      [normalizedSessionId],
    );
    const session = sessionResult.rows[0] ?? null;

    if (!session) {
      throw new Error(
        "Flash ERP could not find that stock count session in PostgreSQL.",
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
      previousBatchQuantities: readInventoryBatchAllocations(
        session.previous_batch_quantities_json,
      ),
      countedBatchQuantities: readInventoryBatchAllocations(
        session.counted_batch_quantities_json,
      ),
      operatorName: session.operator_name,
      note: session.note,
      submittedAt: timestamp,
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
          id,
          target_node_code,
          aggregate_type,
          aggregate_id,
          event_type,
          idempotency_key,
          payload_json,
          status,
          attempt_count,
          record_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, 'stockCountSession', $3, 'stock-count-session.submitted', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            session.id,
            `${nodeCode}:stockCountSession:${session.id}:submitted:${timestamp}`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        "UPDATE stock_count_session SET status = 'SUBMITTED', submitted_at = $1, updated_at = $1 WHERE id = $2",
        [timestamp, session.id],
      );
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${session.session_no} was submitted as a PostgreSQL stock count session.`
            : `${session.session_no} was submitted locally for standalone stock-count review.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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

    const client = await this.pool.connect();
    let message = "";

    try {
      await client.query("BEGIN");
      const sessionResult = await client.query<StockCountSessionRow>(
        `SELECT
          session.id,
          session.session_no,
          session.status,
          session.inventory_location_code,
          session.inventory_location_name,
          session.product_code,
          session.product_name,
          session.department_code,
          department.department_name,
          session.category_code,
          category.category_name,
          session.subcategory,
          session.is_serialized,
          session.previous_quantity,
          session.counted_quantity,
          session.variance_quantity,
          session.previous_serial_numbers_json,
          session.counted_serial_numbers_json,
          session.previous_batch_quantities_json,
          session.counted_batch_quantities_json,
          session.note,
          session.operator_name,
          session.submitted_at,
          session.committed_at,
          session.updated_at
         FROM stock_count_session AS session
         LEFT JOIN product_department_snapshot AS department
           ON department.department_code = session.department_code
         LEFT JOIN product_category_snapshot AS category
           ON category.category_code = session.category_code
         WHERE session.id = $1
         LIMIT 1`,
        [normalizedSessionId],
      );
      const session = sessionResult.rows[0] ?? null;

      if (!session) {
        throw new Error(
          "Flash ERP could not find that stock count session in PostgreSQL.",
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
        client,
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
            client,
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

      const previousBatchQuantities = readInventoryBatchAllocations(
        session.previous_batch_quantities_json,
      );
      const countedBatchQuantities = readInventoryBatchAllocations(
        session.counted_batch_quantities_json,
      );

      if (
        previousBatchQuantities.length > 0 ||
        countedBatchQuantities.length > 0
      ) {
        const currentBatches = (
          await client.query<{
            id: string;
            batch_no: string;
            expiry_date: string;
            quantity_on_hand: string | number;
          }>(
            `SELECT id, batch_no, expiry_date, quantity_on_hand
             FROM inventory_batch_registry
             WHERE inventory_location_code = $1
               AND product_code = $2
             FOR UPDATE`,
            [session.inventory_location_code, session.product_code],
          )
        ).rows;
        const currentByBatchNo = new Map(
          currentBatches.map((batch) => [
            batch.batch_no.toUpperCase(),
            batch,
          ] as const),
        );
        const changedBatch = previousBatchQuantities.find((batch) => {
          const current = currentByBatchNo.get(batch.batchNo.toUpperCase());
          return (
            !current ||
            current.expiry_date.slice(0, 10) !==
              batch.expiryDate.slice(0, 10) ||
            Math.abs(asNumber(current.quantity_on_hand) - batch.quantity) >
              0.0001
          );
        });

        if (changedBatch) {
          throw new Error(
            `${session.session_no} can no longer be committed because batch ${changedBatch.batchNo} changed after the count was saved. Start a new count from the latest posture.`,
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
        runner: client,
      });

      for (const batch of countedBatchQuantities) {
        const result = await client.query(
          `UPDATE inventory_batch_registry
           SET quantity_on_hand = $1,
               status = $2,
               source_reference_type = 'STOCK_COUNT_SESSION',
               source_reference_id = $3,
               source_reference_label = $4,
               updated_at = $5
           WHERE id = $6`,
          [
            batch.quantity,
            deriveInventoryBatchStatus({
              expiryDate: batch.expiryDate,
              quantityOnHand: batch.quantity,
            }),
            session.id,
            session.session_no,
            timestamp,
            batch.batchId,
          ],
        );

        if (result.rowCount !== 1) {
          throw new Error(
            `Flash ERP could not update batch ${batch.batchNo} during ${session.session_no}.`,
          );
        }
      }
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
        await client.query(
          `INSERT INTO sync_outbox (
          id,
          target_node_code,
          aggregate_type,
          aggregate_id,
          event_type,
          idempotency_key,
          payload_json,
          status,
          attempt_count,
          record_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, 'inventoryLedgerEntry', $3, 'inventory.ledger.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            ledgerEntryId,
            `${nodeCode}:inventoryLedgerEntry:${ledgerEntryId}`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        "UPDATE stock_count_session SET status = 'COMMITTED', variance_quantity = $1, committed_at = $2, updated_at = $2 WHERE id = $3",
        [appliedCount.varianceQuantity, timestamp, session.id],
      );
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${session.session_no} was committed locally and queued upstream as a PostgreSQL stock count variance.`
            : `${session.session_no} was committed locally as a standalone stock count variance.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
      message = shouldQueueEnterprise
        ? `${session.session_no} was committed locally and queued upstream as a count variance.`
        : `${session.session_no} was committed locally. Flash ERP updated the standalone stock posture.`;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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
      batchNo: line.batchNo?.trim() || null,
      manufacturedAt: line.manufacturedAt?.trim() || null,
      expiryDate: line.expiryDate?.trim() || null,
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

    for (const line of requestedLines) {
      if (
        !line.purchaseOrderLineId ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0
      ) {
        throw new Error(
          "Each goods-receipt line must target a purchase-order line and quantity greater than zero.",
        );
      }
    }

    for (const line of requestedExceptionLines) {
      if (
        !line.purchaseOrderLineId ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !allowedExceptionReasons.has(line.reason)
      ) {
        throw new Error(
          "Each receipt exception needs a purchase-order line, valid reason, and quantity greater than zero.",
        );
      }
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

    const purchaseOrderResult = await this.pool.query<PurchaseOrderSnapshotRow>(
      `SELECT
        id,
        purchase_order_no,
        status,
        inventory_location_code,
        inventory_location_name,
        supplier_no,
        supplier_name,
        external_reference,
        note,
        operator_name,
        ordered_quantity,
        received_quantity,
        exception_quantity,
        outstanding_quantity,
        committed_at,
        closed_at,
        closure_reason,
        closure_note,
        closure_operator_name,
        updated_at
       FROM purchase_order_snapshot
       WHERE id = $1
       LIMIT 1`,
      [purchaseOrderId],
    );
    const purchaseOrder = purchaseOrderResult.rows[0] ?? null;

    if (!purchaseOrder) {
      throw new Error(
        "Flash ERP could not find that purchase order in the PostgreSQL snapshot.",
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

    const lineResult = await this.pool.query<PurchaseOrderLineSnapshotRow>(
      `SELECT
        line.id,
        line.purchase_order_id,
        line.line_no,
        line.product_code,
        line.product_name,
        line.department_code,
        department.department_name,
        line.category_code,
        category.category_name,
        line.subcategory,
        line.is_serialized,
        line.track_expiry,
        line.ordered_quantity,
        line.received_quantity,
        line.exception_quantity,
        line.outstanding_quantity,
        line.unit_cost,
        line.updated_at
       FROM purchase_order_line_snapshot AS line
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = line.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = line.category_code
       WHERE line.purchase_order_id = $1
       ORDER BY line.line_no ASC`,
      [purchaseOrderId],
    );
    const lineById = new Map(
      lineResult.rows.map((line) => [line.id, line] as const),
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

      const product = await this.getProductByCode(line.product_code);

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

      if (requestedLine) {
        const batch = validateInventoryBatchReceipt({
          productName: line.product_name,
          trackExpiry: asBooleanFlag(product.track_expiry),
          batchNo: requestedLine.batchNo,
          manufacturedAt: requestedLine.manufacturedAt,
          expiryDate: requestedLine.expiryDate,
        });
        requestedLine.batchNo = batch.batchNo;
        requestedLine.manufacturedAt = batch.manufacturedAt;
        requestedLine.expiryDate = batch.expiryDate;
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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO local_goods_receipt (
          id,
          goods_receipt_no,
          purchase_order_id,
          purchase_order_no,
          inventory_location_code,
          supplier_no,
          supplier_name,
          external_reference,
          note,
          operator_name,
          total_quantity,
          exception_quantity,
          synced_at,
          received_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13, $13)`,
        [
          goodsReceiptId,
          goodsReceiptNo,
          purchaseOrder.id,
          purchaseOrder.purchase_order_no,
          purchaseOrder.inventory_location_code,
          supplierNo,
          purchaseOrder.supplier_name,
          externalReference,
          note,
          operatorName,
          totalQuantity,
          totalExceptionQuantity,
          timestamp,
        ],
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

          await client.query(
            `INSERT INTO local_goods_receipt_line (
              id,
              local_goods_receipt_id,
              purchase_order_line_id,
              line_no,
              product_code,
              product_name,
              quantity,
              unit_cost,
              serial_numbers_json,
              batch_no,
              manufactured_at,
              expiry_date,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              goodsReceiptLineId,
              goodsReceiptId,
              line.id,
              Math.trunc(asNumber(line.line_no)),
              line.product_code,
              line.product_name,
              receivedQuantity,
              asNullableNumber(line.unit_cost),
              writeSerializedLineNumbers(requestedLine.serialNumbers),
              requestedLine.batchNo,
              requestedLine.manufacturedAt,
              requestedLine.expiryDate,
              timestamp,
            ],
          );

          if (requestedLine.batchNo && requestedLine.expiryDate) {
            const existingBatch = (
              await client.query<{
                id: string;
                expiry_date: string;
                quantity_on_hand: string | number;
                status: string;
              }>(
                `SELECT id, expiry_date, quantity_on_hand, status
                 FROM inventory_batch_registry
                 WHERE inventory_location_code = $1
                   AND product_code = $2
                   AND batch_no = $3
                 LIMIT 1`,
                [
                  purchaseOrder.inventory_location_code,
                  line.product_code,
                  requestedLine.batchNo,
                ],
              )
            ).rows[0] ?? null;

            if (
              existingBatch &&
              existingBatch.expiry_date.slice(0, 10) !==
                requestedLine.expiryDate.slice(0, 10)
            ) {
              throw new Error(
                `Batch ${requestedLine.batchNo} already exists for ${line.product_name} with a different expiry date.`,
              );
            }

            const nextBatchQuantity = Number(
              (
                asNumber(existingBatch?.quantity_on_hand ?? 0) +
                receivedQuantity
              ).toFixed(3),
            );
            const batchId = existingBatch?.id ?? randomUUID();

            await client.query(
              `INSERT INTO inventory_batch_registry (
                id, product_code, inventory_location_code, batch_no,
                manufactured_at, expiry_date, quantity_on_hand, status,
                source_reference_type, source_reference_id,
                source_reference_label, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GOODS_RECEIPT', $9, $10, $11)
              ON CONFLICT (inventory_location_code, product_code, batch_no)
              DO UPDATE SET
                manufactured_at = COALESCE(EXCLUDED.manufactured_at, inventory_batch_registry.manufactured_at),
                expiry_date = EXCLUDED.expiry_date,
                quantity_on_hand = EXCLUDED.quantity_on_hand,
                status = EXCLUDED.status,
                source_reference_type = EXCLUDED.source_reference_type,
                source_reference_id = EXCLUDED.source_reference_id,
                source_reference_label = EXCLUDED.source_reference_label,
                updated_at = EXCLUDED.updated_at`,
              [
                batchId,
                line.product_code,
                purchaseOrder.inventory_location_code,
                requestedLine.batchNo,
                requestedLine.manufacturedAt,
                requestedLine.expiryDate,
                nextBatchQuantity,
                deriveInventoryBatchStatus({
                  expiryDate: requestedLine.expiryDate,
                  quantityOnHand: nextBatchQuantity,
                  status: existingBatch?.status,
                }),
                goodsReceiptId,
                goodsReceiptNo,
                timestamp,
              ],
            );
          }
          await client.query(
            "UPDATE product_snapshot SET quantity_on_hand = quantity_on_hand + $1, updated_at = $2 WHERE id = $3",
            [receivedQuantity, timestamp, product.id],
          );

          if (
            !(await this.hasLocationBalance(
              purchaseOrder.inventory_location_code,
              line.product_code,
              client,
            ))
          ) {
            await this.setLocationBalanceQuantity({
              locationCode: purchaseOrder.inventory_location_code,
              productCode: line.product_code,
              quantity: asNumber(product.quantity_on_hand),
              updatedAt: timestamp,
              runner: client,
            });
          }

          await this.applyLocationBalanceDelta({
            locationCode: purchaseOrder.inventory_location_code,
            productCode: line.product_code,
            delta: receivedQuantity,
            updatedAt: timestamp,
            runner: client,
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
              runner: client,
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
            batchNo: requestedLine.batchNo ?? null,
            manufacturedAt: requestedLine.manufacturedAt ?? null,
            expiryDate: requestedLine.expiryDate ?? null,
          });
        }

        if (requestedExceptionLine && exceptionQuantity > 0) {
          const receiptExceptionId = randomUUID();

          await client.query(
            `INSERT INTO local_goods_receipt_exception (
              id,
              local_goods_receipt_id,
              purchase_order_line_id,
              line_no,
              product_code,
              product_name,
              quantity,
              unit_cost,
              reason,
              note,
              updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              receiptExceptionId,
              goodsReceiptId,
              line.id,
              Math.trunc(asNumber(line.line_no)),
              line.product_code,
              line.product_name,
              exceptionQuantity,
              asNullableNumber(line.unit_cost),
              requestedExceptionLine.reason,
              requestedExceptionLine.note,
              timestamp,
            ],
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

        await client.query(
          `UPDATE purchase_order_line_snapshot
           SET received_quantity = $1,
               exception_quantity = $2,
               outstanding_quantity = $3,
               updated_at = $4
           WHERE id = $5`,
          [
            nextReceivedQuantity,
            nextExceptionQuantity,
            nextOutstandingQuantity,
            timestamp,
            line.id,
          ],
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

      await client.query(
        `UPDATE purchase_order_snapshot
         SET supplier_no = $1,
             received_quantity = $2,
             exception_quantity = $3,
             outstanding_quantity = $4,
             status = $5,
             updated_at = $6
         WHERE id = $7`,
        [
          supplierNo,
          nextReceivedQuantity,
          nextExceptionQuantity,
          nextOutstandingQuantity,
          nextStatus,
          timestamp,
          purchaseOrder.id,
        ],
      );
      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
          id,
          target_node_code,
          aggregate_type,
          aggregate_id,
          event_type,
          idempotency_key,
          payload_json,
          status,
          attempt_count,
          record_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, 'goodsReceipt', $3, 'goods-receipt.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            goodsReceiptId,
            ENTERPRISE_NODE_CODE,
            goodsReceiptId,
            `${nodeCode}:goodsReceipt:${goodsReceiptNo}`,
            JSON.stringify(goodsReceiptPayload),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${goodsReceiptNo} was posted locally against ${purchaseOrder.purchase_order_no} on PostgreSQL and queued for enterprise projection.`
            : `${goodsReceiptNo} was posted locally against ${purchaseOrder.purchase_order_no} on standalone PostgreSQL.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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

    const goodsReceiptResult = await this.pool.query<
      Pick<
        LocalGoodsReceiptRow,
        | "id"
        | "goods_receipt_no"
        | "purchase_order_id"
        | "purchase_order_no"
        | "inventory_location_code"
        | "supplier_no"
        | "supplier_name"
        | "external_reference"
      > & { inventory_location_name: string | null }
    >(
      `SELECT
        receipt.id,
        receipt.goods_receipt_no,
        receipt.purchase_order_id,
        receipt.purchase_order_no,
        receipt.inventory_location_code,
        location.location_name AS inventory_location_name,
        receipt.supplier_no,
        receipt.supplier_name,
        receipt.external_reference
       FROM local_goods_receipt AS receipt
       LEFT JOIN inventory_location_snapshot AS location
         ON location.location_code = receipt.inventory_location_code
       WHERE receipt.id = $1
       LIMIT 1`,
      [goodsReceiptId],
    );
    const goodsReceipt = goodsReceiptResult.rows[0] ?? null;

    if (!goodsReceipt) {
      throw new Error("Flash ERP could not find that local goods receipt.");
    }

    if (!goodsReceipt.supplier_no || !goodsReceipt.supplier_name) {
      throw new Error(
        `Goods receipt ${goodsReceipt.goods_receipt_no} is not linked to a supplier, so Flash ERP cannot post a supplier return from it.`,
      );
    }

    const goodsReceiptLineResult =
      await this.pool.query<LocalGoodsReceiptLineRow>(
        `SELECT
        id,
        local_goods_receipt_id,
        purchase_order_line_id,
        line_no,
        product_code,
        product_name,
        quantity,
        unit_cost,
        serial_numbers_json,
        batch_no,
        manufactured_at,
        expiry_date
       FROM local_goods_receipt_line
       WHERE local_goods_receipt_id = $1
       ORDER BY line_no ASC`,
        [goodsReceiptId],
      );
    const goodsReceiptLineById = new Map(
      goodsReceiptLineResult.rows.map((line) => [line.id, line] as const),
    );
    const priorReturnLineResult = await this.pool.query<{
      goods_receipt_line_id: string;
      quantity: string | number;
      serial_numbers_json: string | null;
    }>(
      `SELECT goods_receipt_line_id, quantity, serial_numbers_json
       FROM local_supplier_return_line
       WHERE goods_receipt_line_id = ANY($1::text[])`,
      [requestedLines.map((line) => line.goodsReceiptLineId)],
    );
    const returnedQuantityByReceiptLine = new Map<string, number>();
    const returnedSerialKeysByReceiptLine = new Map<string, Set<string>>();

    for (const line of priorReturnLineResult.rows) {
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

      const product = await this.getProductByCode(
        goodsReceiptLine.product_code,
      );

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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO local_supplier_return (
          id,
          supplier_return_no,
          purchase_order_id,
          purchase_order_no,
          goods_receipt_id,
          goods_receipt_no,
          inventory_location_code,
          supplier_no,
          supplier_name,
          external_reference,
          reason,
          status,
          note,
          operator_name,
          total_quantity,
          synced_at,
          returned_at,
          cancelled_at,
          cancellation_note,
          cancellation_operator_name,
          cancellation_acknowledged_at,
          cancellation_acknowledged_by,
          cancellation_acknowledgement_note,
          cancellation_ack_synced_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'POSTED', $12, $13, $14, NULL, $15, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $15)`,
        [
          supplierReturnId,
          supplierReturnNo,
          goodsReceipt.purchase_order_id,
          goodsReceipt.purchase_order_no,
          goodsReceipt.id,
          goodsReceipt.goods_receipt_no,
          goodsReceipt.inventory_location_code,
          supplierNo,
          supplierName,
          externalReference,
          input.reason,
          note,
          operatorName,
          totalQuantity,
          timestamp,
        ],
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

        await client.query(
          `INSERT INTO local_supplier_return_line (
            id,
            local_supplier_return_id,
            goods_receipt_line_id,
            purchase_order_line_id,
            line_no,
            product_code,
            product_name,
            quantity,
            unit_cost,
            serial_numbers_json,
            batch_allocations_json,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            supplierReturnLineId,
            supplierReturnId,
            goodsReceiptLine.id,
            goodsReceiptLine.purchase_order_line_id,
            Math.trunc(asNumber(goodsReceiptLine.line_no)),
            goodsReceiptLine.product_code,
            goodsReceiptLine.product_name,
            requestedLine.quantity,
            asNullableNumber(goodsReceiptLine.unit_cost),
            writeSerializedLineNumbers(requestedLine.serialNumbers),
            writeInventoryBatchAllocations(
              goodsReceiptLine.batch_no && goodsReceiptLine.expiry_date
                ? [{
                    batchId: null,
                    batchNo: goodsReceiptLine.batch_no,
                    expiryDate: goodsReceiptLine.expiry_date,
                    quantity: requestedLine.quantity,
                  }]
                : [],
            ),
            timestamp,
          ],
        );

        const batchAllocations: StoreInventoryBatchAllocation[] = [];

        if (goodsReceiptLine.batch_no && goodsReceiptLine.expiry_date) {
          const batchResult = await client.query<{
            id: string;
            quantity_on_hand: string | number;
            expiry_date: string;
            status: string;
          }>(
            `SELECT id, quantity_on_hand, expiry_date, status
             FROM inventory_batch_registry
             WHERE inventory_location_code = $1
               AND product_code = $2
               AND batch_no = $3
             FOR UPDATE`,
            [
              goodsReceipt.inventory_location_code,
              goodsReceiptLine.product_code,
              goodsReceiptLine.batch_no,
            ],
          );
          const batch = batchResult.rows[0] ?? null;

          if (!batch || asNumber(batch.quantity_on_hand) < requestedLine.quantity) {
            throw new Error(
              `Batch ${goodsReceiptLine.batch_no} does not have enough ${goodsReceiptLine.product_name} for this supplier return.`,
            );
          }

          const nextBatchQuantity = Number(
            (asNumber(batch.quantity_on_hand) - requestedLine.quantity).toFixed(3),
          );
          await client.query(
            `UPDATE inventory_batch_registry
             SET quantity_on_hand = $1,
                 status = $2,
                 source_reference_type = 'SUPPLIER_RETURN',
                 source_reference_id = $3,
                 source_reference_label = $4,
                 updated_at = $5
             WHERE id = $6`,
            [
              nextBatchQuantity,
              deriveInventoryBatchStatus({
                expiryDate: batch.expiry_date,
                quantityOnHand: nextBatchQuantity,
                status: batch.status,
              }),
              supplierReturnId,
              supplierReturnNo,
              timestamp,
              batch.id,
            ],
          );
          batchAllocations.push({
            batchId: batch.id,
            batchNo: goodsReceiptLine.batch_no,
            expiryDate: goodsReceiptLine.expiry_date,
            quantity: requestedLine.quantity,
          });
          await client.query(
            "UPDATE local_supplier_return_line SET batch_allocations_json = $1 WHERE id = $2",
            [writeInventoryBatchAllocations(batchAllocations), supplierReturnLineId],
          );
        }
        await client.query(
          "UPDATE product_snapshot SET quantity_on_hand = quantity_on_hand - $1, updated_at = $2 WHERE id = $3",
          [requestedLine.quantity, timestamp, product.id],
        );

        if (
          !(await this.hasLocationBalance(
            goodsReceipt.inventory_location_code,
            goodsReceiptLine.product_code,
            client,
          ))
        ) {
          await this.setLocationBalanceQuantity({
            locationCode: goodsReceipt.inventory_location_code,
            productCode: goodsReceiptLine.product_code,
            quantity: asNumber(product.quantity_on_hand),
            updatedAt: timestamp,
            runner: client,
          });
        }

        await this.applyLocationBalanceDelta({
          locationCode: goodsReceipt.inventory_location_code,
          productCode: goodsReceiptLine.product_code,
          delta: requestedLine.quantity * -1,
          updatedAt: timestamp,
          runner: client,
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
            runner: client,
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
          batchAllocations,
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
        await client.query(
          `INSERT INTO sync_outbox (
          id,
          target_node_code,
          aggregate_type,
          aggregate_id,
          event_type,
          idempotency_key,
          payload_json,
          status,
          attempt_count,
          record_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, 'supplierReturn', $3, 'supplier-return.recorded', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            supplierReturnId,
            ENTERPRISE_NODE_CODE,
            supplierReturnId,
            `${nodeCode}:supplierReturn:${supplierReturnNo}`,
            JSON.stringify(supplierReturnPayload),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${supplierReturnNo} was posted locally against ${goodsReceipt.goods_receipt_no} on PostgreSQL and queued for enterprise projection.`
            : `${supplierReturnNo} was posted locally against ${goodsReceipt.goods_receipt_no} on standalone PostgreSQL.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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

    const supplierReturnResult = await this.pool.query<{
      id: string;
      supplier_return_no: string;
      inventory_location_code: string;
      status: StoreLocalSupplierReturnSummary["status"];
      cancelled_at: string | null;
      cancellation_acknowledged_at: string | null;
    }>(
      `SELECT
        id,
        supplier_return_no,
        inventory_location_code,
        status,
        cancelled_at,
        cancellation_acknowledged_at
       FROM local_supplier_return
       WHERE id = $1
       LIMIT 1`,
      [supplierReturnId],
    );
    const supplierReturn = supplierReturnResult.rows[0] ?? null;

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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE local_supplier_return
         SET cancellation_acknowledged_at = $1,
             cancellation_acknowledged_by = $2,
             cancellation_acknowledgement_note = $3,
             cancellation_ack_synced_at = NULL,
             updated_at = $1
         WHERE id = $4`,
        [timestamp, operatorName, note, supplierReturn.id],
      );
      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'supplierReturn', $3, 'supplier-return.cancellation-acknowledged', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            supplierReturn.id,
            `${nodeCode}:supplierReturn:${supplierReturn.supplier_return_no}:cancellation-ack`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${supplierReturn.supplier_return_no} rehydrated stock was acknowledged locally on PostgreSQL and queued for enterprise confirmation.`
            : `${supplierReturn.supplier_return_no} rehydrated stock was acknowledged locally on PostgreSQL for standalone supplier returns.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: shouldQueueEnterprise
        ? `${supplierReturn.supplier_return_no} stock rehydration was acknowledged locally and queued for enterprise sync.`
        : `${supplierReturn.supplier_return_no} stock rehydration was acknowledged locally for standalone supplier returns.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  async issueInterStoreTransfer(
    input: StoreInterStoreTransferIssueRequest,
  ): Promise<StoreSyncActionResult> {
    const operatorSession = await this.requireActiveOperatorSession({
      permissionCodes: ["inventory.transfer.issue"],
      purpose: "issuing an inter-store transfer",
    });
    const transferId = input.transferId.trim();
    const sourceLocationCode = input.sourceLocationCode.trim();
    const quantity = Number(Number(input.quantity).toFixed(3));

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

    if (!sourceLocationCode) {
      throw new Error(
        "Select the source shop dispatch location before issuing stock.",
      );
    }

    const serialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const client = await this.pool.connect();
    let message = "";

    try {
      await client.query("BEGIN");
      const transferResult = await client.query<InterStoreTransferSnapshotRow>(
        `SELECT
          transfer.id,
          transfer.transfer_no,
          transfer.role,
          transfer.origin,
          transfer.status,
          transfer.external_reference,
          transfer.source_store_code,
          transfer.source_store_name,
          transfer.source_location_code,
          transfer.source_location_name,
          transfer.destination_store_code,
          transfer.destination_store_name,
          transfer.destination_location_code,
          transfer.destination_location_name,
          transfer.product_code,
          transfer.product_name,
          transfer.department_code,
          department.department_name,
          transfer.category_code,
          category.category_name,
          transfer.subcategory,
          transfer.is_serialized,
          transfer.track_expiry,
          transfer.requested_quantity,
          transfer.issued_quantity,
          transfer.received_quantity,
          transfer.outstanding_issue_quantity,
          transfer.outstanding_receipt_quantity,
          transfer.unit_cost,
          transfer.issued_serial_numbers_json,
          transfer.received_serial_numbers_json,
          transfer.issued_batch_allocations_json,
          transfer.received_batch_allocations_json,
          transfer.request_note,
          transfer.issue_note,
          transfer.receipt_note,
          transfer.request_operator_name,
          transfer.issue_operator_name,
          transfer.receipt_operator_name,
          transfer.requested_by_node_code,
          transfer.source_node_code,
          transfer.destination_node_code,
          transfer.requested_at,
          transfer.issued_at,
          transfer.received_at,
          transfer.closed_at,
          transfer.updated_at
         FROM inter_store_transfer_snapshot AS transfer
         LEFT JOIN product_department_snapshot AS department
           ON department.department_code = transfer.department_code
         LEFT JOIN product_category_snapshot AS category
           ON category.category_code = transfer.category_code
         WHERE transfer.id = $1
         LIMIT 1`,
        [transferId],
      );
      const transfer = transferResult.rows[0] ?? null;

      if (!transfer) {
        throw new Error(
          "Flash ERP could not find that inter-store transfer in the PostgreSQL snapshot.",
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

      const sourceLocationResult = await client.query<{
        location_code: string;
        location_name: string;
      }>(
        `SELECT location_code, location_name
         FROM inventory_location_snapshot
         WHERE UPPER(location_code) = UPPER($1)
           AND status = 'ACTIVE'
         LIMIT 1`,
        [sourceLocationCode],
      );
      const sourceLocation = sourceLocationResult.rows[0] ?? null;

      if (!sourceLocation) {
        throw new Error(
          `Flash ERP could not find active dispatch location "${sourceLocationCode}" in this shop.`,
        );
      }

      if (
        asNumber(transfer.issued_quantity) > 0 &&
        transfer.source_location_code.toUpperCase() !==
          sourceLocation.location_code.toUpperCase()
      ) {
        throw new Error(
          `${transfer.transfer_no} has already been partly issued from ${transfer.source_location_name}. Continue issuing from the same location.`,
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

      const product = await this.getProductByCode(
        transfer.product_code,
        client,
      );

      if (!product) {
        throw new Error(
          `Flash ERP could not find product "${transfer.product_code}" while issuing ${transfer.transfer_no}.`,
        );
      }

      const sourceLocationQuantity = await this.getLocationQuantity(
        sourceLocation.location_code,
        transfer.product_code,
        client,
      );

      if (quantity - sourceLocationQuantity > 0.0001) {
        throw new Error(
          `Only ${sourceLocationQuantity.toFixed(3)} unit(s) of ${transfer.product_name} are available in ${sourceLocation.location_name}.`,
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
          client,
        );
        ensureSerialSelectionWithinAllowedSet({
          productName: transfer.product_name,
          selectedSerialNumbers: serialNumbers,
          allowedSerialNumbers: await this.listAvailableRegistrySerialNumbers(
            transfer.product_code,
            sourceLocation.location_code,
            client,
          ),
        });
        await this.applyInventoryTaskSerialRegistryChange({
          productCode: transfer.product_code,
          serialNumbers,
          inventoryLocationCode: null,
          status: "IN_TRANSIT",
          sourceReferenceId: transfer.id,
          sourceReferenceLabel: transfer.transfer_no,
          updatedAt: isoNow(),
          runner: client,
        });
      } else if (serialNumbers.length > 0) {
        throw new Error(
          `${transfer.product_name} is not serialized, so this issue cannot include serial numbers.`,
        );
      }

      const timestamp = isoNow();
      const batchAllocations = asBooleanFlag(product.track_expiry)
        ? allocateInventoryBatchesFefo({
            productName: transfer.product_name,
            quantity,
            batches: (
              await client.query<{
                id: string;
                batch_no: string;
                manufactured_at: string | null;
                expiry_date: string;
                quantity_on_hand: string | number;
                status: string;
              }>(
                `SELECT id, batch_no, manufactured_at, expiry_date, quantity_on_hand, status
                 FROM inventory_batch_registry
                 WHERE inventory_location_code = $1
                   AND product_code = $2
                   AND quantity_on_hand > 0
                 ORDER BY expiry_date ASC, manufactured_at ASC, batch_no ASC
                 FOR UPDATE`,
                [sourceLocation.location_code, transfer.product_code],
              )
            ).rows.map((batch) => ({
              batchId: batch.id,
              batchNo: batch.batch_no,
              manufacturedAt: batch.manufactured_at,
              expiryDate: batch.expiry_date,
              quantityOnHand: asNumber(batch.quantity_on_hand),
              status: batch.status,
            })),
          })
        : [];

      for (const allocation of batchAllocations) {
        const nextBatchQuantity = Number(
          (
            asNumber(
              (
                await client.query<{ quantity_on_hand: string | number }>(
                  `SELECT quantity_on_hand
                   FROM inventory_batch_registry
                   WHERE id = $1`,
                  [allocation.batchId],
                )
              ).rows[0]?.quantity_on_hand,
            ) - allocation.quantity
          ).toFixed(3),
        );
        await client.query(
          `UPDATE inventory_batch_registry
           SET quantity_on_hand = $1,
               status = $2,
               source_reference_type = 'INTER_STORE_TRANSFER',
               source_reference_id = $3,
               source_reference_label = $4,
               updated_at = $5
           WHERE id = $6`,
          [
            nextBatchQuantity,
            deriveInventoryBatchStatus({
              expiryDate: allocation.expiryDate,
              quantityOnHand: nextBatchQuantity,
            }),
            transfer.id,
            transfer.transfer_no,
            timestamp,
            allocation.batchId,
          ],
        );
      }
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
      const nextIssuedBatchAllocations = [
        ...readInventoryBatchAllocations(
          transfer.issued_batch_allocations_json,
        ),
        ...batchAllocations,
      ];
      const issueNote =
        input.note?.trim() ||
        `Issued ${quantity.toFixed(3)} unit(s) of ${transfer.product_name} from ${sourceLocation.location_name}.`;
      const operatorName =
        input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);

      await client.query(
        "UPDATE product_snapshot SET quantity_on_hand = quantity_on_hand - $1, updated_at = $2 WHERE id = $3",
        [quantity, timestamp, product.id],
      );
      await this.applyLocationBalanceDelta({
        locationCode: sourceLocation.location_code,
        productCode: transfer.product_code,
        delta: quantity * -1,
        updatedAt: timestamp,
        runner: client,
      });
      await client.query(
        `UPDATE inter_store_transfer_snapshot
         SET status = $1,
             issued_quantity = $2,
             outstanding_issue_quantity = $3,
             outstanding_receipt_quantity = $4,
             issued_serial_numbers_json = $5,
             issued_batch_allocations_json = $6,
             issue_note = $7,
             issue_operator_name = $8,
             source_node_code = $9,
             source_location_code = $10,
             source_location_name = $11,
             issued_at = $12,
             updated_at = $12
         WHERE id = $13`,
        [
          nextStatus,
          nextIssuedQuantity,
          Number(
            Math.max(
              0,
              asNumber(transfer.requested_quantity) - nextIssuedQuantity,
            ).toFixed(3),
          ),
          Number(
            Math.max(0, nextIssuedQuantity - nextReceivedQuantity).toFixed(3),
          ),
          writeSerializedLineNumbers(nextIssuedSerialNumbers),
          writeInventoryBatchAllocations(nextIssuedBatchAllocations),
          issueNote,
          operatorName,
          nodeCode,
          sourceLocation.location_code,
          sourceLocation.location_name,
          timestamp,
          transfer.id,
        ],
      );

      const payload: StoreInterStoreTransferIssuedPayload = {
        transferId: transfer.id,
        transferNo: transfer.transfer_no,
        storeCode,
        terminalCode,
        sourceLocationCode: sourceLocation.location_code,
        destinationLocationCode: transfer.destination_location_code,
        productCode: transfer.product_code,
        quantity,
        ...(serialNumbers.length > 0 ? { serialNumbers } : {}),
        ...(batchAllocations.length > 0 ? { batchAllocations } : {}),
        operatorName,
        note: issueNote,
        occurredAt: timestamp,
      };

      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'interStoreTransfer', $3, 'inter-store-transfer.issued', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            transfer.id,
            `${nodeCode}:interStoreTransfer:${transfer.id}:issued:${timestamp}`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${transfer.transfer_no} was issued locally from PostgreSQL and queued for enterprise sync.`
            : `${transfer.transfer_no} was issued locally from PostgreSQL for standalone transfer tracking.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
      message = shouldQueueEnterprise
        ? `${transfer.transfer_no} was issued locally and queued for enterprise projection.`
        : `${transfer.transfer_no} was issued locally for standalone transfer tracking.`;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

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

    const serialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const client = await this.pool.connect();
    let message = "";

    try {
      await client.query("BEGIN");
      const transferResult = await client.query<InterStoreTransferSnapshotRow>(
        `SELECT
          transfer.id,
          transfer.transfer_no,
          transfer.role,
          transfer.origin,
          transfer.status,
          transfer.external_reference,
          transfer.source_store_code,
          transfer.source_store_name,
          transfer.source_location_code,
          transfer.source_location_name,
          transfer.destination_store_code,
          transfer.destination_store_name,
          transfer.destination_location_code,
          transfer.destination_location_name,
          transfer.product_code,
          transfer.product_name,
          transfer.department_code,
          department.department_name,
          transfer.category_code,
          category.category_name,
          transfer.subcategory,
          transfer.is_serialized,
          transfer.track_expiry,
          transfer.requested_quantity,
          transfer.issued_quantity,
          transfer.received_quantity,
          transfer.outstanding_issue_quantity,
          transfer.outstanding_receipt_quantity,
          transfer.unit_cost,
          transfer.issued_serial_numbers_json,
          transfer.received_serial_numbers_json,
          transfer.issued_batch_allocations_json,
          transfer.received_batch_allocations_json,
          transfer.request_note,
          transfer.issue_note,
          transfer.receipt_note,
          transfer.request_operator_name,
          transfer.issue_operator_name,
          transfer.receipt_operator_name,
          transfer.requested_by_node_code,
          transfer.source_node_code,
          transfer.destination_node_code,
          transfer.requested_at,
          transfer.issued_at,
          transfer.received_at,
          transfer.closed_at,
          transfer.updated_at
         FROM inter_store_transfer_snapshot AS transfer
         LEFT JOIN product_department_snapshot AS department
           ON department.department_code = transfer.department_code
         LEFT JOIN product_category_snapshot AS category
           ON category.category_code = transfer.category_code
         WHERE transfer.id = $1
         LIMIT 1`,
        [transferId],
      );
      const transfer = transferResult.rows[0] ?? null;

      if (!transfer) {
        throw new Error(
          "Flash ERP could not find that inter-store transfer in the PostgreSQL snapshot.",
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

      const product = await this.getProductByCode(
        transfer.product_code,
        client,
      );

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
          client,
        );
        await this.applyInventoryTaskSerialRegistryChange({
          productCode: transfer.product_code,
          serialNumbers,
          inventoryLocationCode: transfer.destination_location_code,
          status: "AVAILABLE",
          sourceReferenceId: transfer.id,
          sourceReferenceLabel: transfer.transfer_no,
          updatedAt: isoNow(),
          runner: client,
        });
      } else if (serialNumbers.length > 0) {
        throw new Error(
          `${transfer.product_name} is not serialized, so this receipt cannot include serial numbers.`,
        );
      }

      const timestamp = isoNow();
      const receivedBatchAllocations = asBooleanFlag(product.track_expiry)
        ? takeOutstandingInventoryBatchAllocations({
            productName: transfer.product_name,
            quantity,
            issued: readInventoryBatchAllocations(
              transfer.issued_batch_allocations_json,
            ),
            received: readInventoryBatchAllocations(
              transfer.received_batch_allocations_json,
            ),
          })
        : [];

      for (const allocation of receivedBatchAllocations) {
        const existingBatch = (
          await client.query<{
            id: string;
            expiry_date: string;
            quantity_on_hand: string | number;
            status: string;
          }>(
            `SELECT id, expiry_date, quantity_on_hand, status
             FROM inventory_batch_registry
             WHERE inventory_location_code = $1
               AND product_code = $2
               AND batch_no = $3
             LIMIT 1
             FOR UPDATE`,
            [
              transfer.destination_location_code,
              transfer.product_code,
              allocation.batchNo,
            ],
          )
        ).rows[0] ?? null;

        if (
          existingBatch &&
          existingBatch.expiry_date.slice(0, 10) !==
            allocation.expiryDate.slice(0, 10)
        ) {
          throw new Error(
            `Batch ${allocation.batchNo} already exists for ${transfer.product_name} at the destination with a different expiry date.`,
          );
        }

        const nextBatchQuantity = Number(
          (
            asNumber(existingBatch?.quantity_on_hand ?? 0) +
            allocation.quantity
          ).toFixed(3),
        );
        const destinationBatchId = existingBatch?.id ?? randomUUID();

        await client.query(
          `INSERT INTO inventory_batch_registry (
            id, product_code, inventory_location_code, batch_no,
            manufactured_at, expiry_date, quantity_on_hand, status,
            source_reference_type, source_reference_id,
            source_reference_label, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'INTER_STORE_TRANSFER', $9, $10, $11)
          ON CONFLICT (inventory_location_code, product_code, batch_no)
          DO UPDATE SET
            manufactured_at = COALESCE(EXCLUDED.manufactured_at, inventory_batch_registry.manufactured_at),
            expiry_date = EXCLUDED.expiry_date,
            quantity_on_hand = EXCLUDED.quantity_on_hand,
            status = EXCLUDED.status,
            source_reference_type = EXCLUDED.source_reference_type,
            source_reference_id = EXCLUDED.source_reference_id,
            source_reference_label = EXCLUDED.source_reference_label,
            updated_at = EXCLUDED.updated_at`,
          [
            destinationBatchId,
            transfer.product_code,
            transfer.destination_location_code,
            allocation.batchNo,
            allocation.manufacturedAt ?? null,
            allocation.expiryDate,
            nextBatchQuantity,
            deriveInventoryBatchStatus({
              expiryDate: allocation.expiryDate,
              quantityOnHand: nextBatchQuantity,
              status: existingBatch?.status,
            }),
            transfer.id,
            transfer.transfer_no,
            timestamp,
          ],
        );

        allocation.batchId = destinationBatchId;
      }
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
      const nextReceivedBatchAllocations = [
        ...readInventoryBatchAllocations(
          transfer.received_batch_allocations_json,
        ),
        ...receivedBatchAllocations,
      ];
      const receiptNote =
        input.note?.trim() ||
        `Received ${quantity.toFixed(3)} unit(s) of ${transfer.product_name} into ${transfer.destination_location_code}.`;
      const operatorName =
        input.operatorName?.trim() || this.formatOperatorLabel(operatorSession);

      await client.query(
        "UPDATE product_snapshot SET quantity_on_hand = quantity_on_hand + $1, updated_at = $2 WHERE id = $3",
        [quantity, timestamp, product.id],
      );
      await this.applyLocationBalanceDelta({
        locationCode: transfer.destination_location_code,
        productCode: transfer.product_code,
        delta: quantity,
        updatedAt: timestamp,
        runner: client,
      });
      await client.query(
        `UPDATE inter_store_transfer_snapshot
         SET status = $1,
             received_quantity = $2,
             outstanding_receipt_quantity = $3,
             received_serial_numbers_json = $4,
             received_batch_allocations_json = $5,
             receipt_note = $6,
             receipt_operator_name = $7,
             destination_node_code = $8,
             received_at = $9,
             updated_at = $9
         WHERE id = $10`,
        [
          nextStatus,
          nextReceivedQuantity,
          Number(
            Math.max(0, nextIssuedQuantity - nextReceivedQuantity).toFixed(3),
          ),
          writeSerializedLineNumbers(nextReceivedSerialNumbers),
          writeInventoryBatchAllocations(nextReceivedBatchAllocations),
          receiptNote,
          operatorName,
          nodeCode,
          timestamp,
          transfer.id,
        ],
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
        ...(receivedBatchAllocations.length > 0
          ? { batchAllocations: receivedBatchAllocations }
          : {}),
        operatorName,
        note: receiptNote,
        occurredAt: timestamp,
      };

      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'interStoreTransfer', $3, 'inter-store-transfer.received', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            transfer.id,
            `${nodeCode}:interStoreTransfer:${transfer.id}:received:${timestamp}`,
            JSON.stringify(payload),
            timestamp,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [timestamp],
      );
      await client.query(
        `INSERT INTO sync_run_log (id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at)
         VALUES ($1, 'LOCAL_WRITE', 'SUCCESS', $2, 0, 0, $3, $3)`,
        [
          randomUUID(),
          shouldQueueEnterprise
            ? `${transfer.transfer_no} was received locally from PostgreSQL and queued for enterprise sync.`
            : `${transfer.transfer_no} was received locally from PostgreSQL for standalone transfer tracking.`,
          timestamp,
        ],
      );
      await client.query("COMMIT");
      message = shouldQueueEnterprise
        ? `${transfer.transfer_no} was received locally and queued for enterprise projection.`
        : `${transfer.transfer_no} was received locally for standalone transfer tracking.`;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message,
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

    const sequenceResult = await this.pool.query<{ value: string }>(
      "SELECT count(*) + 1 AS value FROM pos_shift",
    );
    const shiftNo = `SHIFT-${String(Number(sequenceResult.rows[0]?.value ?? 1)).padStart(4, "0")}`;
    const shiftId = randomUUID();

    await this.pool.query(
      `INSERT INTO pos_shift (
        id,
        shift_no,
        terminal_code,
        cashier_code,
        status,
        opening_float_amount,
        closing_declared_cash,
        closing_variance,
        opened_at,
        closed_at,
        record_version
      ) VALUES ($1, $2, $3, $4, 'OPEN', $5, NULL, NULL, $6, NULL, 1)`,
      [
        shiftId,
        shiftNo,
        this.getTerminalCode(),
        operatorSession.loginId,
        openingFloatAmount,
        timestamp,
      ],
    );
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${shiftNo} was opened on the PostgreSQL store node.`,
      startedAt: timestamp,
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

    await this.pool.query(
      `UPDATE pos_shift
       SET status = 'CLOSED',
           closing_declared_cash = $1,
           closing_variance = $2,
           closed_at = $3,
           record_version = $4
       WHERE id = $5`,
      [
        declaredCashAmount,
        varianceAmount,
        timestamp,
        nextRecordVersion,
        shift.id,
      ],
    );
    await this.setMetadata("last_local_write_at", timestamp);
    await this.insertRunLog({
      runKind: "LOCAL_WRITE",
      summary: `${shift.shift_no} was closed on the PostgreSQL store node.`,
      startedAt: timestamp,
    });

    return {
      message:
        varianceAmount === 0
          ? `${shift.shift_no} closed cleanly. Declared cash matched the expected drawer exactly.`
          : `${shift.shift_no} closed with declared cash ${declaredCashAmount.toFixed(2)} and variance ${varianceAmount.toFixed(2)}.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async persistRemoteSyncPolicy(
    policy:
      | StoreNodePushResponse["syncPolicy"]
      | StoreNodePullResponse["syncPolicy"]
      | null
      | undefined,
  ) {
    if (!policy) {
      return;
    }

    for (const [key, value] of storeSyncPolicyToMetadataEntries(policy)) {
      if (value) {
        await this.setMetadata(key, value);
      } else {
        await this.deleteMetadata(key);
      }
    }
  }

  private async persistRemoteLicenseFailure(error: unknown) {
    if (
      !(error instanceof StoreSyncTransportError) ||
      !error.remoteLicenseFailure
    ) {
      return;
    }

    const { scope, status, licensedUntil } = error.remoteLicenseFailure;
    const statusKey =
      scope === "store" ? "store_license_status" : "terminal_license_status";
    const expiryKey =
      scope === "store" ? "store_licensed_until" : "terminal_licensed_until";

    await this.setMetadata(statusKey, status ?? "UNLICENSED");

    if (licensedUntil) {
      await this.setMetadata(expiryKey, licensedUntil);
    } else {
      await this.deleteMetadata(expiryKey);
    }
  }

  private async recordSyncSchedule(
    trigger: StoreSyncRunOptions["trigger"],
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

  async runSyncCycle(
    input?: StoreSyncRunOptions,
  ): Promise<StoreSyncActionResult> {
    const startedAt = isoNow();
    const trigger =
      input?.trigger === "scheduled"
        ? "scheduled"
        : input?.trigger === "tray"
          ? "tray"
          : input?.trigger === "startup"
            ? "startup"
            : "manual";
    if (trigger === "manual") {
      if (this.isStandaloneDeployment()) {
        await this.requireActiveOperatorSession({
          purpose: "checking standalone store status",
        });
      } else {
        await this.requireActiveOperatorSession({
          permissionCodes: ["sync.store.operate"],
        });
      }
    }

    if (this.isStandaloneDeployment()) {
      const finishedAt = isoNow();
      await this.recordSyncSchedule(trigger, finishedAt, false);
      await this.pool.query(
        `INSERT INTO sync_run_log (
          id,
          run_kind,
          result,
          summary,
          upstream_processed,
          downstream_applied,
          started_at,
          finished_at
        ) VALUES ($1, 'SYNC_CYCLE', 'IDLE', $2, 0, 0, $3, $4)`,
        [
          randomUUID(),
          "Standalone mode is active; no HQ sync was required for this desktop.",
          startedAt,
          finishedAt,
        ],
      );

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
      await this.pool.query(
        `INSERT INTO sync_run_log (
          id,
          run_kind,
          result,
          summary,
          upstream_processed,
          downstream_applied,
          started_at,
          finished_at
        ) VALUES ($1, 'SYNC_CYCLE', 'WARNING', $2, 0, 0, $3, $4)`,
        [randomUUID(), message, startedAt, finishedAt],
      );
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
      await this.persistRemoteLicenseFailure(error);
      const message =
        error instanceof Error
          ? error.message
          : "The enterprise sync cycle was unavailable, so local queues were preserved.";
      const actionMessage =
        error instanceof StoreSyncTransportError
          ? `${message} Flash ERP kept every PostgreSQL queue item intact.`
          : "Enterprise sync was unavailable. Flash ERP kept every PostgreSQL queue item intact.";
      await this.recordSyncSchedule(trigger, finishedAt, true);

      await this.pool.query(
        `INSERT INTO sync_run_log (
          id,
          run_kind,
          result,
          summary,
          upstream_processed,
          downstream_applied,
          started_at,
          finished_at
        ) VALUES ($1, 'SYNC_CYCLE', 'WARNING', $2, 0, 0, $3, $4)`,
        [
          randomUUID(),
          `The enterprise sync cycle could not complete from PostgreSQL: ${message}`,
          startedAt,
          finishedAt,
        ],
      );

      return {
        message: actionMessage,
        snapshot: await this.getSyncSnapshot(),
        succeeded: false,
      };
    } finally {
      if (this.syncCycleInFlight === syncCycle) {
        this.syncCycleInFlight = null;
      }
    }
  }

  private async ensureLicenseAllowsSync() {
    if (this.isStandaloneDeployment()) {
      return;
    }

    const metadata = await this.metadata();
    const now = Date.now();
    const isUsableStatus = (status: string | undefined) => {
      const normalized = status?.trim().toUpperCase() || "LICENSED";
      return normalized === "LICENSED" || normalized === "TRIAL";
    };
    const isExpired = (value: string | undefined) => {
      if (!value) {
        return false;
      }

      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) && parsed < now;
    };

    if (
      !isUsableStatus(metadata.store_license_status) ||
      isExpired(metadata.store_licensed_until)
    ) {
      throw new Error(
        "This shop license is expired or inactive. Renew it at HQ before the desktop can sync.",
      );
    }

  }

  private async runLocalSyncSimulation(
    startedAt: string,
    trigger: StoreSyncRunOptions["trigger"] = "manual",
  ): Promise<StoreSyncActionResult> {
    const client = await this.pool.connect();
    let upstreamProcessed = 0;
    let downstreamApplied = 0;

    try {
      await client.query("BEGIN");
      const finishedAt = isoNow();
      await client.query(
        `UPDATE sync_outbox
         SET status = 'DEAD_LETTER',
             next_retry_at = NULL,
             error_message = COALESCE(error_message, 'Retry attempts exhausted before the local PostgreSQL sync pass.'),
             updated_at = $1
         WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
           AND attempt_count >= $2`,
        [finishedAt, MAX_SYNC_RETRY_ATTEMPTS],
      );
      const upstreamRows = await client.query<{
        id: string;
        attempt_count: string | number;
      }>(
        `SELECT id, attempt_count
         FROM sync_outbox
         WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
           AND attempt_count < $1
           AND (next_retry_at IS NULL OR next_retry_at <= $2)
         ORDER BY created_at ASC
         LIMIT 25`,
        [MAX_SYNC_RETRY_ATTEMPTS, finishedAt],
      );
      const downstreamRows = await client.query<{ id: string }>(
        `SELECT id
         FROM sync_inbox
         WHERE status IN ('RECEIVED', 'PENDING')
         ORDER BY received_at ASC
         LIMIT 25`,
      );
      for (const row of upstreamRows.rows) {
        await client.query(
          `UPDATE sync_outbox
           SET status = 'ACKNOWLEDGED',
               attempt_count = $1,
               last_attempt_at = $2,
               next_retry_at = NULL,
               failure_kind = NULL,
               last_http_status = NULL,
               error_message = NULL,
               acknowledged_at = $2,
               updated_at = $2
           WHERE id = $3`,
          [Math.trunc(asNumber(row.attempt_count)) + 1, finishedAt, row.id],
        );
      }

      for (const row of downstreamRows.rows) {
        await client.query(
          `UPDATE sync_inbox
           SET status = 'APPLIED',
               applied_at = $1,
               acknowledged_at = $1,
               error_message = NULL
           WHERE id = $2`,
          [finishedAt, row.id],
        );
      }

      upstreamProcessed = upstreamRows.rows.length;
      downstreamApplied = downstreamRows.rows.length;

      await client.query(
        `INSERT INTO sync_checkpoint (
          remote_node_code,
          last_event_id,
          last_received_cursor,
          last_received_at,
          last_applied_at
        ) VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (remote_node_code) DO UPDATE SET
          last_event_id = excluded.last_event_id,
          last_received_cursor = excluded.last_received_cursor,
          last_received_at = excluded.last_received_at,
          last_applied_at = excluded.last_applied_at`,
        [
          ENTERPRISE_NODE_CODE,
          `enterprise-event-${Date.now()}`,
          `cursor-${Date.now()}`,
          finishedAt,
        ],
      );

      if (upstreamProcessed > 0 || downstreamApplied > 0) {
        await client.query(
          `INSERT INTO app_metadata (key, value)
           VALUES ('last_sync_at', $1)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          [finishedAt],
        );
      }
      await this.recordSyncSchedule(trigger, finishedAt, false);

      await client.query(
        `INSERT INTO sync_run_log (
          id,
          run_kind,
          result,
          summary,
          upstream_processed,
          downstream_applied,
          started_at,
          finished_at
        ) VALUES ($1, 'SYNC_CYCLE', $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          upstreamProcessed > 0 || downstreamApplied > 0 ? "SUCCESS" : "IDLE",
          upstreamProcessed > 0 || downstreamApplied > 0
            ? `Local fallback sync acknowledged ${upstreamProcessed} upstream event(s) and applied ${downstreamApplied} downstream packet(s) on the PostgreSQL store node.`
            : "The PostgreSQL sync worker ran without pending work.",
          upstreamProcessed,
          downstreamApplied,
          startedAt,
          finishedAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message:
        upstreamProcessed > 0 || downstreamApplied > 0
          ? "The PostgreSQL local sync worker processed queued work."
          : "The PostgreSQL sync worker is healthy and currently idle.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async runRemoteSyncCycle(
    startedAt: string,
    trigger: StoreSyncRunOptions["trigger"],
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
            "Store Desktop PostgreSQL sync pull page was too large; retrying with a single downstream event.",
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
        requestedCursor === latestCursor
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
    const failedDownstreamResult = await this.pool.query<{
      event_id: string;
      status: "FAILED" | "DEAD_LETTER";
      error_message: string;
      failed_at: string;
    }>(
      `SELECT
         id AS event_id,
         status,
         error_message,
         COALESCE(applied_at, received_at) AS failed_at
       FROM sync_inbox
       WHERE status IN ('FAILED', 'DEAD_LETTER')
         AND error_message IS NOT NULL
       ORDER BY received_at ASC
       LIMIT 100`,
    );
    const pushPayload: StoreNodePushRequest = {
      sourceNodeCode: nodeCode,
      sentAt: pushStartedAt,
      cursor: latestCursor,
      syncRunId,
      trigger,
      clientStartedAt: startedAt,
      upstreamEvents: upstreamRows.map((row) =>
        this.toSyncEnvelope(row, nodeCode),
      ),
      acknowledgedDownstreamEventIds: acknowledgedDownstreamIdsForPush,
      failedDownstreamEvents: failedDownstreamResult.rows.map((event) => ({
        eventId: event.event_id,
        status: event.status,
        errorMessage: event.error_message,
        failedAt: event.failed_at,
      })),
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

    await this.upsertCheckpoint({
      remoteNodeCode: latestSourceNodeCode,
      lastEventId: latestDownstreamEventId,
      cursor: latestCursor,
      receivedAt: finishedAt,
      appliedAt:
        downstreamApplied > 0
          ? finishedAt
          : await this.currentCheckpointAppliedAt(ENTERPRISE_NODE_CODE),
    });
    await this.setMetadata("last_sync_at", finishedAt);
    await this.recordSyncSchedule(trigger, finishedAt, false);
    await this.pool.query(
      `INSERT INTO sync_run_log (
        id,
        run_kind,
        result,
        summary,
        upstream_processed,
        downstream_applied,
        started_at,
        finished_at
      ) VALUES ($1, 'SYNC_CYCLE', $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        upstreamProcessed > 0 || downstreamApplied > 0 ? "SUCCESS" : "IDLE",
        upstreamProcessed > 0 || downstreamApplied > 0
          ? `Pushed ${upstreamProcessed} upstream event(s), applied ${downstreamApplied} downstream packet(s) across ${downstreamPullPasses} pull page(s), and refreshed the PostgreSQL enterprise checkpoint.${downstreamLimitReached ? " More downstream packets may still be pending; run sync again to continue draining the queue." : ""}`
          : "The PostgreSQL enterprise sync cycle completed successfully with no pending work.",
        upstreamProcessed,
        downstreamApplied,
        startedAt,
        finishedAt,
      ],
    );

    return {
      message:
        upstreamProcessed > 0 || downstreamApplied > 0
          ? `Flash ERP completed a real PostgreSQL enterprise sync cycle across ${downstreamPullPasses} pull page(s).${downstreamLimitReached ? " More downstream packets may still be pending; run sync again to continue." : ""}`
          : "Flash ERP reached enterprise successfully and found no pending PostgreSQL sync work.",
      snapshot: await this.getSyncSnapshot(),
      upstreamProcessed,
      downstreamApplied,
      downstreamPullPasses,
      downstreamLimitReached,
      latestCursor,
    };
  }

  private async getPendingUpstreamRows(limit: number) {
    const result = await this.pool.query<OutboxEnvelopeRow>(
      `SELECT
        id,
        target_node_code,
        aggregate_type,
        aggregate_id,
        event_type,
        idempotency_key,
        payload_json,
        attempt_count,
       record_version,
        created_at
       FROM sync_outbox
       WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
         AND attempt_count < $1
         AND (next_retry_at IS NULL OR next_retry_at <= $2)
       ORDER BY CASE aggregate_type
         WHEN 'interStoreTransfer' THEN 0
         WHEN 'posTransaction' THEN 1
         WHEN 'salesOrder' THEN 1
         WHEN 'inventoryLedgerEntry' THEN 2
         WHEN 'goodsReceipt' THEN 2
         WHEN 'supplierReturn' THEN 2
         WHEN 'stockCountSession' THEN 2
         WHEN 'customerAccountEntry' THEN 3
         WHEN 'eodReconciliation' THEN 3
         WHEN 'bankingDeposit' THEN 3
         WHEN 'storeExpense' THEN 3
         ELSE 4
       END, created_at ASC, record_version ASC, id ASC
       LIMIT $3`,
      [MAX_SYNC_RETRY_ATTEMPTS, isoNow(), limit],
    );

    return result.rows;
  }

  private async getPendingDownstreamAcknowledgements(limit: number) {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM sync_inbox
       WHERE status = 'APPLIED'
         AND acknowledged_at IS NULL
       ORDER BY received_at ASC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => row.id);
  }

  private toSyncEnvelope(
    row: OutboxEnvelopeRow,
    nodeCode: string,
  ): SyncEnvelope {
    return {
      eventId: row.id,
      idempotencyKey: row.idempotency_key,
      aggregateType: row.aggregate_type as SyncEnvelope["aggregateType"],
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      originatingNodeCode: nodeCode,
      targetNodeCode: row.target_node_code,
      recordVersion: Math.max(1, Math.trunc(asNumber(row.record_version))),
      occurredAt: row.created_at,
      payload: parsePayloadJson(row.payload_json),
    };
  }

  private async buildStoreNodeTelemetry(): Promise<
    StoreNodePushRequest["telemetry"]
  > {
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
      await this.pool.query(
        `UPDATE sync_outbox
         SET status = 'IN_FLIGHT',
             attempt_count = attempt_count + 1,
             last_attempt_at = $1,
             next_retry_at = NULL,
             failure_kind = NULL,
             last_http_status = NULL,
             sync_run_id = $2,
             updated_at = $1
         WHERE id = $3
           AND status IN ('PENDING', 'IN_FLIGHT', 'FAILED')`,
        [attemptedAt, syncRunId, eventId],
      );
    }
  }

  private async expireExhaustedOutboxRetries(expiredAt: string) {
    await this.pool.query(
      `UPDATE sync_outbox
       SET status = 'DEAD_LETTER',
           next_retry_at = NULL,
           error_message = COALESCE(error_message, 'Retry attempts exhausted before the next enterprise sync pass.'),
           updated_at = $1
       WHERE status IN ('PENDING', 'IN_FLIGHT', 'FAILED')
         AND attempt_count >= $2`,
      [expiredAt, MAX_SYNC_RETRY_ATTEMPTS],
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
      const row = await this.pool.query<{ attempt_count: string | number }>(
        "SELECT attempt_count FROM sync_outbox WHERE id = $1 LIMIT 1",
        [eventId],
      );
      const attemptCount = Math.trunc(asNumber(row.rows[0]?.attempt_count));
      const deadLetter = shouldMoveToDeadLetter(attemptCount);

      await this.pool.query(
        `UPDATE sync_outbox
         SET status = $1,
             error_message = $2,
             failure_kind = $3,
             last_http_status = $4,
             next_retry_at = $5,
             updated_at = $6
         WHERE id = $7`,
        [
          deadLetter ? "DEAD_LETTER" : "FAILED",
          `${failure.failureKind}: ${failure.message}`,
          failure.failureKind,
          failure.httpStatus,
          deadLetter ? null : nextSyncRetryAt(failedAt, attemptCount),
          failedAt,
          eventId,
        ],
      );
    }
  }

  private async postJson<TResponse>(
    url: string,
    body: unknown,
  ): Promise<TResponse> {
    const timeoutMs = 20_000;
    const timeoutMessage =
      "Enterprise sync timed out after 20 seconds. Check that the enterprise app is reachable, then try again.";

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
        let remoteLicenseFailure: RemoteLicenseFailure | null = null;

        try {
          const payload = JSON.parse(response.body) as {
            error?: string;
            message?: string;
            code?: string;
            schemaDrift?: boolean;
            licenseScope?: unknown;
            licenseStatus?: unknown;
            licensedUntil?: unknown;
          };
          if (payload.error || payload.message) {
            message = payload.error ?? payload.message ?? message;
          }

          schemaDrift = isSyncSchemaDriftPayload(payload);
          schemaDriftMessage =
            payload.error ??
            payload.message ??
            enterpriseDatabaseSchemaNotReadyMessage;
          remoteLicenseFailure = readRemoteLicenseFailure(payload);
        } catch {}

        if (remoteLicenseFailure) {
          throw new StoreSyncTransportError(
            message,
            "HTTP",
            response.statusCode,
            remoteLicenseFailure,
          );
        }

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
          "Enterprise sync could not reach the network endpoint. Flash ERP preserved the PostgreSQL queue for a retry.",
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
      await this.pool.query(
        `UPDATE sync_outbox
         SET status = 'ACKNOWLEDGED',
             acknowledged_at = $1,
             last_attempt_at = $1,
             next_retry_at = NULL,
             failure_kind = NULL,
             last_http_status = NULL,
             error_message = NULL,
             updated_at = $1
         WHERE id = $2`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE local_goods_receipt
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'goodsReceipt' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE local_supplier_return
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'supplierReturn' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE customer_account_entry
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'customerAccountEntry' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE sales_order
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'salesOrder' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE eod_reconciliation
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'eodReconciliation' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE banking_deposit
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'bankingDeposit' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE local_store_expense
         SET synced_at = $1,
             updated_at = $1
         WHERE id = COALESCE((SELECT aggregate_id FROM sync_outbox WHERE id = $2 AND aggregate_type = 'storeExpense' LIMIT 1), $2)`,
        [acknowledgedAt, eventId],
      );
      await this.pool.query(
        `UPDATE local_supplier_return
         SET cancellation_ack_synced_at = $1,
             updated_at = $1
         WHERE id = (
          SELECT aggregate_id
          FROM sync_outbox
          WHERE id = $2
            AND aggregate_type = 'supplierReturn'
            AND event_type = 'supplier-return.cancellation-acknowledged'
          LIMIT 1
         )`,
        [acknowledgedAt, eventId],
      );
    }
  }

  private async markOutboxRejected(
    rejected: SyncRejectedEnvelope[],
    rejectedAt: string,
  ) {
    for (const item of rejected) {
      const row = await this.pool.query<{ attempt_count: string | number }>(
        "SELECT attempt_count FROM sync_outbox WHERE id = $1 LIMIT 1",
        [item.eventId],
      );
      const attemptCount = Math.trunc(asNumber(row.rows[0]?.attempt_count));
      const deadLetter =
        !item.retryable || shouldMoveToDeadLetter(attemptCount);

      await this.pool.query(
        `UPDATE sync_outbox
         SET status = $1,
             error_message = $2,
             failure_kind = $3,
             next_retry_at = $4,
             last_http_status = NULL,
             updated_at = $5
         WHERE id = $6`,
        [
          deadLetter ? "DEAD_LETTER" : "FAILED",
          `${item.reasonCode}: ${item.message}`,
          item.reasonCode,
          deadLetter ? null : nextSyncRetryAt(rejectedAt, attemptCount),
          rejectedAt,
          item.eventId,
        ],
      );
    }
  }

  private async markInboxAcknowledged(
    eventIds: string[],
    acknowledgedAt: string,
  ) {
    for (const eventId of eventIds) {
      await this.pool.query(
        "UPDATE sync_inbox SET acknowledged_at = $1, error_message = NULL WHERE id = $2",
        [acknowledgedAt, eventId],
      );
    }
  }

  private async reapplyFailedDownstreamInbox(limit: number) {
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const failedResult = await this.pool.query<FailedInboxEnvelopeRow>(
      `SELECT id,
        source_node_code,
        aggregate_type,
        aggregate_id,
        event_type,
        payload_json,
        received_at
       FROM sync_inbox
       WHERE status IN ('FAILED', 'DEAD_LETTER')
       ORDER BY CASE event_type
         WHEN 'security.user.published' THEN 0
         WHEN 'security.role.published' THEN 1
         WHEN 'security.permission.published' THEN 2
         ELSE 3
       END, received_at ASC
       LIMIT $1`,
      [limit],
    );
    const appliedIds: string[] = [];
    const appliedAt = isoNow();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const row of failedResult.rows) {
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
          payload: parsePayloadJson(row.payload_json),
        };

        try {
          await this.applyDownstreamPayload(event, appliedAt, client);
          await client.query(
            "UPDATE sync_inbox SET status = 'APPLIED', applied_at = $1, error_message = NULL WHERE id = $2",
            [appliedAt, row.id],
          );
          appliedIds.push(row.id);
        } catch (error) {
          await client.query(
            "UPDATE sync_inbox SET status = 'FAILED', error_message = $1 WHERE id = $2",
            [
              error instanceof Error
                ? error.message
                : "Flash ERP could not apply the downstream packet locally.",
              row.id,
            ],
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
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
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const event of events) {
        const existingResult = await client.query<InboxEnvelopeRow>(
          "SELECT id, status, acknowledged_at FROM sync_inbox WHERE id = $1 LIMIT 1",
          [event.eventId],
        );
        const existing = existingResult.rows[0] ?? null;

        if (existing?.acknowledged_at) {
          acknowledgedIds.push(event.eventId);
          continue;
        }

        if (existing?.status === "APPLIED") {
          acknowledgedIds.push(event.eventId);
          continue;
        }

        await client.query(
          `INSERT INTO sync_inbox (
            id,
            source_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            payload_json,
            status,
            received_at,
            applied_at,
            acknowledged_at,
            error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, 'RECEIVED', $7, NULL, NULL, NULL)
          ON CONFLICT (id) DO UPDATE SET
            payload_json = excluded.payload_json,
            status = 'RECEIVED',
            error_message = NULL`,
          [
            event.eventId,
            remoteNodeCode,
            event.aggregateType,
            event.aggregateId,
            event.eventType,
            JSON.stringify(event.payload),
            receivedAt,
          ],
        );

        try {
          await this.applyDownstreamPayload(event, receivedAt, client);
          await client.query(
            "UPDATE sync_inbox SET status = 'APPLIED', applied_at = $1, error_message = NULL WHERE id = $2",
            [receivedAt, event.eventId],
          );
          acknowledgedIds.push(event.eventId);
        } catch (error) {
          await client.query(
            "UPDATE sync_inbox SET status = 'FAILED', error_message = $1 WHERE id = $2",
            [
              error instanceof Error
                ? error.message
                : "Flash ERP could not apply the downstream packet locally.",
              event.eventId,
            ],
          );
        }
      }

      if (events.length > 0) {
        await this.upsertCheckpoint(
          {
            remoteNodeCode,
            lastEventId: events[events.length - 1]?.eventId ?? null,
            cursor,
            receivedAt,
            appliedAt:
              acknowledgedIds.length > 0
                ? receivedAt
                : await this.currentCheckpointAppliedAt(remoteNodeCode),
          },
          client,
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return acknowledgedIds;
  }

  private async applyCatalogProductPolicy(
    policy: NonNullable<ReturnType<typeof readCatalogProductPolicy>>,
    appliedAt: string,
    runner: DbRunner,
  ) {
    if (policy.productCodes === null) {
      await runner.query(
        "UPDATE product_snapshot SET catalog_membership_active = 1, catalog_sort_order = NULL, updated_at = $1",
        [appliedAt],
      );
      return;
    }

    await runner.query(
      "UPDATE product_snapshot SET catalog_membership_active = 0, catalog_sort_order = NULL, updated_at = $1",
      [appliedAt],
    );

    for (const productCode of policy.productCodes) {
      await runner.query(
        "UPDATE product_snapshot SET catalog_membership_active = 1, catalog_sort_order = $1, updated_at = $2 WHERE product_code = $3",
        [policy.productSortOrders.get(productCode) ?? null, appliedAt, productCode],
      );
    }
  }

  private async applyDownstreamPayload(
    event: SyncEnvelope,
    appliedAt: string,
    runner: DbRunner,
  ) {
    const payload = parsePayloadRecord(event.payload);
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
        typeof storePayload.storeName !== "string" ||
        typeof storePayload.timezone !== "string" ||
        typeof storePayload.currencyCode !== "string" ||
        typeof storePayload.salesEnabled !== "boolean" ||
        typeof storePayload.warehouseEnabled !== "boolean" ||
        (storePayload.shiftFloatPromptAmount !== undefined &&
          typeof storePayload.shiftFloatPromptAmount !== "number") ||
        (storePayload.showCriticalStocksOnStartup !== undefined &&
          typeof storePayload.showCriticalStocksOnStartup !== "boolean") ||
        (storePayload.showExpiringBatchesOnStartup !== undefined &&
          typeof storePayload.showExpiringBatchesOnStartup !== "boolean") ||
        (storePayload.expiryAlertLeadDays !== undefined &&
          typeof storePayload.expiryAlertLeadDays !== "number") ||
        (storePayload.expiryCriticalDays !== undefined &&
          typeof storePayload.expiryCriticalDays !== "number") ||
        typeof storePayload.loyaltyProgramEnabled !== "boolean" ||
        typeof storePayload.loyaltyPointsPerCurrencyUnit !== "number" ||
        typeof storePayload.loyaltyRedemptionEnabled !== "boolean" ||
        typeof storePayload.loyaltyRedemptionPointsStep !== "number" ||
        typeof storePayload.loyaltyRedemptionValueAmount !== "number" ||
        typeof storePayload.loyaltyMinimumRedeemPoints !== "number" ||
        typeof storePayload.loyaltyMaximumRedeemPercentOfSale !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid store settings publication payload.",
        );
      }

      await rememberInboundStoreCode(storePayload.storeCode);
      await this.setMetadata(
        "retail_org_name",
        storePayload.retailOrgName,
        runner,
      );
      await this.setMetadata("store_name", storePayload.storeName, runner);
      if (typeof storePayload.storePhone === "string" && storePayload.storePhone.trim()) {
        await this.setMetadata("store_phone", storePayload.storePhone.trim(), runner);
      } else {
        await this.deleteMetadata("store_phone", runner);
      }
      if (
        typeof storePayload.storeAddressLine1 === "string" &&
        storePayload.storeAddressLine1.trim()
      ) {
        await this.setMetadata(
          "store_address_line1",
          storePayload.storeAddressLine1.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_address_line1", runner);
      }
      if (
        typeof storePayload.storeAddressLine2 === "string" &&
        storePayload.storeAddressLine2.trim()
      ) {
        await this.setMetadata(
          "store_address_line2",
          storePayload.storeAddressLine2.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_address_line2", runner);
      }
      await this.setMetadata("timezone", storePayload.timezone, runner);
      await this.setMetadata(
        "currency_code",
        storePayload.currencyCode,
        runner,
      );
      await this.setMetadata(
        "sales_enabled",
        storePayload.salesEnabled ? "1" : "0",
        runner,
      );
      await this.setMetadata(
        "warehouse_enabled",
        storePayload.warehouseEnabled ? "1" : "0",
        runner,
      );
      await this.setMetadata(
        "store_license_status",
        storePayload.licenseStatus ?? "LICENSED",
        runner,
      );
      await this.setMetadata(
        "terminal_license_status",
        storePayload.terminalLicenseStatus ?? "LICENSED",
        runner,
      );
      await this.setMetadata(
        "touch_mode_enabled",
        storePayload.touchModeEnabled === false ? "0" : "1",
        runner,
      );
      await this.setMetadata(
        "shift_float_prompt_amount",
        String(
          Number(
            Math.max(0, storePayload.shiftFloatPromptAmount ?? 0).toFixed(2),
          ),
        ),
        runner,
      );
      await this.setMetadata(
        "show_critical_stocks_on_startup",
        storePayload.showCriticalStocksOnStartup ? "1" : "0",
        runner,
      );
      await this.setMetadata(
        "show_expiring_batches_on_startup",
        storePayload.showExpiringBatchesOnStartup === false ? "0" : "1",
        runner,
      );
      const expiryAlertLeadDays = normalizePolicyInteger(
        storePayload.expiryAlertLeadDays,
        30,
        1,
        3650,
      );
      await this.setMetadata(
        "expiry_alert_lead_days",
        String(expiryAlertLeadDays),
        runner,
      );
      await this.setMetadata(
        "expiry_critical_days",
        String(
          normalizePolicyInteger(
            storePayload.expiryCriticalDays,
            7,
            0,
            expiryAlertLeadDays,
          ),
        ),
        runner,
      );
      const layawaySettings = normalizeLayawaySettings(storePayload.layawaySettings);
      const layawayEntries = [
        ["layaway_enabled", layawaySettings.enabled ? "1" : "0"],
        ["layaway_reserve_stock_on_deposit", layawaySettings.reserveStockOnDeposit ? "1" : "0"],
        ["layaway_minimum_deposit_percent", layawaySettings.minimumDepositPercent.toFixed(2)],
        ["layaway_require_full_payment_before_fulfilment", layawaySettings.requireFullPaymentBeforeFulfilment ? "1" : "0"],
        ["layaway_refund_payments_on_cancellation", layawaySettings.refundPaymentsOnCancellation ? "1" : "0"],
        ["layaway_cancellation_fee_type", layawaySettings.cancellationFeeType],
        ["layaway_cancellation_fee_value", layawaySettings.cancellationFeeValue.toFixed(2)],
      ] as const;

      for (const [key, value] of layawayEntries) {
        await this.setMetadata(key, value, runner);
      }
      await this.setMetadata(
        "loyalty_program_enabled",
        storePayload.loyaltyProgramEnabled ? "1" : "0",
        runner,
      );
      await this.setMetadata(
        "loyalty_points_per_currency_unit",
        String(Number(storePayload.loyaltyPointsPerCurrencyUnit.toFixed(4))),
        runner,
      );
      await this.setMetadata(
        "loyalty_redemption_enabled",
        storePayload.loyaltyRedemptionEnabled ? "1" : "0",
        runner,
      );
      await this.setMetadata(
        "loyalty_redemption_points_step",
        String(
          Math.max(1, Math.trunc(storePayload.loyaltyRedemptionPointsStep)),
        ),
        runner,
      );
      await this.setMetadata(
        "loyalty_redemption_value_amount",
        String(Number(storePayload.loyaltyRedemptionValueAmount.toFixed(2))),
        runner,
      );
      await this.setMetadata(
        "loyalty_minimum_redeem_points",
        String(
          Math.max(1, Math.trunc(storePayload.loyaltyMinimumRedeemPoints)),
        ),
        runner,
      );
      await this.setMetadata(
        "loyalty_maximum_redeem_percent_of_sale",
        String(
          Number(storePayload.loyaltyMaximumRedeemPercentOfSale.toFixed(2)),
        ),
        runner,
      );

      if (
        typeof storePayload.shortName === "string" &&
        storePayload.shortName.trim()
      ) {
        await this.setMetadata(
          "store_short_name",
          storePayload.shortName.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_short_name", runner);
      }

      if (
        typeof storePayload.storeGroupCode === "string" &&
        storePayload.storeGroupCode.trim()
      ) {
        await this.setMetadata(
          "store_group_code",
          storePayload.storeGroupCode.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_group_code", runner);
      }

      if (
        typeof storePayload.storeGroupName === "string" &&
        storePayload.storeGroupName.trim()
      ) {
        await this.setMetadata(
          "store_group_name",
          storePayload.storeGroupName.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_group_name", runner);
      }

      if (
        typeof storePayload.storeGroupType === "string" &&
        storePayload.storeGroupType.trim()
      ) {
        await this.setMetadata(
          "store_group_type",
          storePayload.storeGroupType.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_group_type", runner);
      }

      if (
        typeof storePayload.licenseKey === "string" &&
        storePayload.licenseKey.trim()
      ) {
        await this.setMetadata(
          "store_license_key",
          storePayload.licenseKey.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("store_license_key", runner);
      }

      if (
        typeof storePayload.licensedUntil === "string" &&
        storePayload.licensedUntil.trim()
      ) {
        await this.setMetadata(
          "store_licensed_until",
          storePayload.licensedUntil,
          runner,
        );
      } else {
        await this.deleteMetadata("store_licensed_until", runner);
      }

      if (
        typeof storePayload.terminalLicenseKey === "string" &&
        storePayload.terminalLicenseKey.trim()
      ) {
        await this.setMetadata(
          "terminal_license_key",
          storePayload.terminalLicenseKey.trim(),
          runner,
        );
      } else {
        await this.deleteMetadata("terminal_license_key", runner);
      }

      if (
        typeof storePayload.terminalLicensedUntil === "string" &&
        storePayload.terminalLicensedUntil.trim()
      ) {
        await this.setMetadata(
          "terminal_licensed_until",
          storePayload.terminalLicensedUntil,
          runner,
        );
      } else {
        await this.deleteMetadata("terminal_licensed_until", runner);
      }

      if (
        storePayload.catalogPolicy &&
        typeof storePayload.catalogPolicy === "object"
      ) {
        await this.setMetadata(
          "catalog_policy_json",
          JSON.stringify(storePayload.catalogPolicy),
          runner,
        );
        await this.applyCatalogProductPolicy(
          readCatalogProductPolicy(storePayload.catalogPolicy) ?? {
            productCodes: null,
            productSortOrders: new Map<string, number>(),
          },
          appliedAt,
          runner,
        );
      } else {
        await this.deleteMetadata("catalog_policy_json", runner);
        await this.applyCatalogProductPolicy(
          {
            productCodes: null,
            productSortOrders: new Map<string, number>(),
          },
          appliedAt,
          runner,
        );
      }

      if (Array.isArray(storePayload.ecommerceFulfillmentLocations)) {
        await this.setMetadata(
          "ecommerce_fulfillment_locations_json",
          JSON.stringify(storePayload.ecommerceFulfillmentLocations),
          runner,
        );
      }

      if (Array.isArray(storePayload.productSizes)) {
        await this.setMetadata(
          "product_sizes_json",
          JSON.stringify(normalizeSetupStringList(storePayload.productSizes) ?? []),
          runner,
        );
      } else {
        await this.deleteMetadata("product_sizes_json", runner);
      }

      if (Array.isArray(storePayload.posDiscountRates)) {
        await this.setMetadata(
          "pos_discount_rates_json",
          JSON.stringify(normalizeSetupNumberList(storePayload.posDiscountRates) ?? []),
          runner,
        );
      } else {
        await this.deleteMetadata("pos_discount_rates_json", runner);
      }

      if (
        typeof storePayload.receiptHeader === "string" &&
        storePayload.receiptHeader.trim()
      ) {
        await this.setMetadata(
          "receipt_header",
          storePayload.receiptHeader,
          runner,
        );
      } else {
        await this.deleteMetadata("receipt_header", runner);
      }

      if (
        typeof storePayload.receiptFooter === "string" &&
        storePayload.receiptFooter.trim()
      ) {
        await this.setMetadata(
          "receipt_footer",
          storePayload.receiptFooter,
          runner,
        );
      } else {
        await this.deleteMetadata("receipt_footer", runner);
      }

      if (
        typeof storePayload.companyLogoUrl === "string" &&
        storePayload.companyLogoUrl.trim()
      ) {
        await this.setMetadata(
          "company_logo_url",
          storePayload.companyLogoUrl,
          runner,
        );
      } else {
        await this.deleteMetadata("company_logo_url", runner);
      }

      if (
        typeof storePayload.loginBackgroundImageUrl === "string" &&
        storePayload.loginBackgroundImageUrl.trim()
      ) {
        await this.setMetadata(
          "login_background_image_url",
          storePayload.loginBackgroundImageUrl,
          runner,
        );
      } else {
        await this.deleteMetadata("login_background_image_url", runner);
      }

      if (
        storePayload.documentNumberFormats &&
        typeof storePayload.documentNumberFormats === "object" &&
        !Array.isArray(storePayload.documentNumberFormats)
      ) {
        await this.setMetadata(
          "document_number_formats_json",
          JSON.stringify(storePayload.documentNumberFormats),
          runner,
        );
      } else {
        await this.deleteMetadata("document_number_formats_json", runner);
      }

      if (
        typeof storePayload.salesReceiptTemplateHtml === "string" &&
        storePayload.salesReceiptTemplateHtml.trim()
      ) {
        await this.setMetadata(
          "sales_receipt_template_html",
          storePayload.salesReceiptTemplateHtml,
          runner,
        );
      } else {
        await this.deleteMetadata("sales_receipt_template_html", runner);
      }

      if (
        typeof storePayload.salesReceiptTemplateCode === "string" &&
        storePayload.salesReceiptTemplateCode.trim()
      ) {
        await this.setMetadata(
          "sales_receipt_template_code",
          storePayload.salesReceiptTemplateCode,
          runner,
        );
      } else {
        await this.deleteMetadata("sales_receipt_template_code", runner);
      }

      if (
        typeof storePayload.salesReceiptTemplateName === "string" &&
        storePayload.salesReceiptTemplateName.trim()
      ) {
        await this.setMetadata(
          "sales_receipt_template_name",
          storePayload.salesReceiptTemplateName,
          runner,
        );
      } else {
        await this.deleteMetadata("sales_receipt_template_name", runner);
      }

      if (
        storePayload.salesReceiptTemplateMode === "default" ||
        storePayload.salesReceiptTemplateMode === "linked" ||
        storePayload.salesReceiptTemplateMode === "legacy"
      ) {
        await this.setMetadata(
          "sales_receipt_template_mode",
          storePayload.salesReceiptTemplateMode,
          runner,
        );
      } else {
        await this.deleteMetadata("sales_receipt_template_mode", runner);
      }

      if (
        typeof storePayload.accountPaymentReceiptTemplateHtml === "string" &&
        storePayload.accountPaymentReceiptTemplateHtml.trim()
      ) {
        await this.setMetadata(
          "account_payment_receipt_template_html",
          storePayload.accountPaymentReceiptTemplateHtml,
          runner,
        );
      } else {
        await this.deleteMetadata(
          "account_payment_receipt_template_html",
          runner,
        );
      }

      if (
        typeof storePayload.goodsReceiptTemplateHtml === "string" &&
        storePayload.goodsReceiptTemplateHtml.trim()
      ) {
        await this.setMetadata(
          "goods_receipt_template_html",
          storePayload.goodsReceiptTemplateHtml,
          runner,
        );
      } else {
        await this.deleteMetadata("goods_receipt_template_html", runner);
      }

      if (
        typeof storePayload.goodsReceiptTemplateCode === "string" &&
        storePayload.goodsReceiptTemplateCode.trim()
      ) {
        await this.setMetadata(
          "goods_receipt_template_code",
          storePayload.goodsReceiptTemplateCode,
          runner,
        );
      } else {
        await this.deleteMetadata("goods_receipt_template_code", runner);
      }

      if (
        typeof storePayload.goodsReceiptTemplateName === "string" &&
        storePayload.goodsReceiptTemplateName.trim()
      ) {
        await this.setMetadata(
          "goods_receipt_template_name",
          storePayload.goodsReceiptTemplateName,
          runner,
        );
      } else {
        await this.deleteMetadata("goods_receipt_template_name", runner);
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
      await runner.query(
        `INSERT INTO permission_snapshot (id, permission_code, permission_name, description, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (permission_code) DO UPDATE SET
           id = excluded.id,
           permission_name = excluded.permission_name,
           description = excluded.description,
           updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          permissionPayload.permissionCode,
          permissionPayload.permissionName,
          typeof permissionPayload.description === "string"
            ? permissionPayload.description
            : null,
          appliedAt,
        ],
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
      await runner.query(
        `INSERT INTO role_snapshot (id, role_code, role_name, description, status, permission_codes_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (role_code) DO UPDATE SET
           id = excluded.id,
           role_name = excluded.role_name,
           description = excluded.description,
           status = excluded.status,
           permission_codes_json = excluded.permission_codes_json,
           updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          rolePayload.roleCode,
          rolePayload.roleName,
          typeof rolePayload.description === "string"
            ? rolePayload.description
            : null,
          rolePayload.status,
          writeStringArray(
            rolePayload.permissionCodes.filter(
              (permissionCode): permissionCode is string =>
                typeof permissionCode === "string",
            ),
          ),
          appliedAt,
        ],
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
      const permissionCodes = userPayload.permissionCodes.filter(
        (permissionCode): permissionCode is string =>
          typeof permissionCode === "string",
      );

      if (
        typeof userPayload.homeStoreCode !== "string" ||
        normalizeLoginId(userPayload.homeStoreCode) !==
          normalizeLoginId(storeCode)
      ) {
        await runner.query(
          "DELETE FROM retail_user_snapshot WHERE lower(login_id) = lower($1)",
          [userPayload.loginId],
        );
        return;
      }

      const capabilities = capabilitiesFrom(
        permissionCodes,
        userPayload.accountStatus,
      );

      await runner.query(
        `INSERT INTO retail_user_snapshot (
           id,
           login_id,
           email,
           display_name,
           account_status,
           home_store_code,
           home_store_name,
           role_codes_json,
           role_names_json,
           permission_codes_json,
           password_hash,
           password_updated_at,
           cashier_eligible,
           supervisor_eligible,
           updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (login_id) DO UPDATE SET
           id = excluded.id,
           email = excluded.email,
           display_name = excluded.display_name,
           account_status = excluded.account_status,
           home_store_code = excluded.home_store_code,
           home_store_name = excluded.home_store_name,
           role_codes_json = excluded.role_codes_json,
           role_names_json = excluded.role_names_json,
           permission_codes_json = excluded.permission_codes_json,
           password_hash = excluded.password_hash,
           password_updated_at = excluded.password_updated_at,
           cashier_eligible = excluded.cashier_eligible,
           supervisor_eligible = excluded.supervisor_eligible,
           updated_at = excluded.updated_at`,
        [
          userPayload.userId,
          userPayload.loginId,
          typeof userPayload.email === "string" ? userPayload.email : null,
          userPayload.displayName,
          userPayload.accountStatus,
          typeof userPayload.homeStoreCode === "string"
            ? userPayload.homeStoreCode
            : null,
          typeof userPayload.homeStoreName === "string"
            ? userPayload.homeStoreName
            : null,
          writeStringArray(
            userPayload.roleCodes.filter(
              (roleCode): roleCode is string => typeof roleCode === "string",
            ),
          ),
          writeStringArray(
            userPayload.roleNames.filter(
              (roleName): roleName is string => typeof roleName === "string",
            ),
          ),
          writeStringArray(permissionCodes),
          typeof userPayload.passwordHash === "string"
            ? userPayload.passwordHash
            : null,
          typeof userPayload.passwordUpdatedAt === "string"
            ? userPayload.passwordUpdatedAt
            : null,
          capabilities.cashierEligible ? 1 : 0,
          capabilities.supervisorEligible ? 1 : 0,
          appliedAt,
        ],
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

      const conflictResult = await runner.query<{ id: string }>(
        "SELECT id FROM customer WHERE lower(customer_no) = lower($1) AND id <> $2 LIMIT 1",
        [customerPayload.customerNo, customerPayload.customerId],
      );
      const conflictingCustomer = conflictResult.rows[0] ?? null;

      if (conflictingCustomer) {
        await runner.query(
          "UPDATE pos_transaction SET customer_id = $1 WHERE customer_id = $2",
          [customerPayload.customerId, conflictingCustomer.id],
        );
        await runner.query(
          "UPDATE customer_account_entry SET customer_id = $1 WHERE customer_id = $2",
          [customerPayload.customerId, conflictingCustomer.id],
        );
        await runner.query(
          "UPDATE sales_order SET customer_id = $1 WHERE customer_id = $2",
          [customerPayload.customerId, conflictingCustomer.id],
        );
        await runner.query("DELETE FROM customer WHERE id = $1", [
          conflictingCustomer.id,
        ]);
      }

      await runner.query(
        `INSERT INTO customer (
          id,
          customer_no,
          full_name,
          customer_type,
          phone,
          email,
          home_store_code,
          home_store_name,
          address_line1,
          city,
          country_code,
          loyalty_enrolled,
          loyalty_tier,
          loyalty_points_balance,
          allow_credit_sales,
          credit_limit_amount,
          receivable_balance_amount,
          note,
          status,
          record_version,
          deleted_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 1, NULL, $20)
        ON CONFLICT (id) DO UPDATE SET
          customer_no = excluded.customer_no,
          full_name = excluded.full_name,
          customer_type = excluded.customer_type,
          phone = excluded.phone,
          email = excluded.email,
          home_store_code = excluded.home_store_code,
          home_store_name = excluded.home_store_name,
          address_line1 = excluded.address_line1,
          city = excluded.city,
          country_code = excluded.country_code,
          loyalty_enrolled = excluded.loyalty_enrolled,
          loyalty_tier = excluded.loyalty_tier,
          loyalty_points_balance = excluded.loyalty_points_balance,
          allow_credit_sales = excluded.allow_credit_sales,
          credit_limit_amount = excluded.credit_limit_amount,
          receivable_balance_amount = excluded.receivable_balance_amount,
          note = excluded.note,
          status = excluded.status,
          deleted_at = NULL,
          updated_at = excluded.updated_at`,
        [
          customerPayload.customerId,
          customerPayload.customerNo,
          customerPayload.fullName,
          customerPayload.customerType,
          typeof customerPayload.phone === "string"
            ? customerPayload.phone
            : null,
          typeof customerPayload.email === "string"
            ? customerPayload.email
            : null,
          typeof customerPayload.homeStoreCode === "string"
            ? customerPayload.homeStoreCode
            : null,
          typeof customerPayload.homeStoreName === "string"
            ? customerPayload.homeStoreName
            : null,
          typeof customerPayload.addressLine1 === "string"
            ? customerPayload.addressLine1
            : null,
          typeof customerPayload.city === "string"
            ? customerPayload.city
            : null,
          typeof customerPayload.countryCode === "string"
            ? customerPayload.countryCode
            : null,
          customerPayload.loyaltyEnrolled ? 1 : 0,
          typeof customerPayload.loyaltyTier === "string"
            ? customerPayload.loyaltyTier
            : null,
          customerPayload.loyaltyPointsBalance,
          customerPayload.allowCreditSales ? 1 : 0,
          typeof customerPayload.creditLimitAmount === "number"
            ? customerPayload.creditLimitAmount
            : null,
          customerPayload.receivableBalanceAmount,
          typeof customerPayload.note === "string"
            ? customerPayload.note
            : null,
          customerPayload.status,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "syncTask" &&
      event.eventType === "sync.task.requested"
    ) {
      const taskPayload = payload as Partial<EnterpriseSyncTaskPayload>;
      const hasReplacementPayload = Object.prototype.hasOwnProperty.call(
        taskPayload,
        "replacementPayload",
      );

      if (
        typeof taskPayload.taskId !== "string" ||
        (taskPayload.taskType !== "REQUEST_UPSTREAM_RESEND" &&
          taskPayload.taskType !== "APPLY_INVENTORY_ADJUSTMENT" &&
          taskPayload.taskType !== "APPLY_COUNT_VARIANCE" &&
          taskPayload.taskType !== "APPLY_STOCK_TRANSFER" &&
          taskPayload.taskType !== "RUN_DATABASE_MAINTENANCE") ||
        typeof taskPayload.title !== "string" ||
        typeof taskPayload.instructions !== "string" ||
        typeof taskPayload.sourceInboundEventId !== "string" ||
        typeof taskPayload.sourceEventType !== "string" ||
        typeof taskPayload.aggregateType !== "string" ||
        typeof taskPayload.aggregateId !== "string" ||
        typeof taskPayload.replacementAggregateType !== "string" ||
        typeof taskPayload.replacementAggregateId !== "string" ||
        typeof taskPayload.replacementEventType !== "string" ||
        typeof taskPayload.replacementRecordVersion !== "number" ||
        !Number.isFinite(taskPayload.replacementRecordVersion) ||
        !hasReplacementPayload ||
        typeof taskPayload.operatorName !== "string" ||
        typeof taskPayload.note !== "string" ||
        typeof taskPayload.requestedAt !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid enterprise task payload.",
        );
      }

      await runner.query(
        `INSERT INTO sync_recovery_task (
          id,
          task_type,
          status,
          title,
          instructions,
          source_inbound_event_id,
          source_event_type,
          aggregate_type,
          aggregate_id,
          transaction_no,
          product_code,
          replacement_aggregate_type,
          replacement_aggregate_id,
          replacement_event_type,
          replacement_record_version,
          replacement_payload_json,
          operator_name,
          operator_note,
          store_note,
          requested_at,
          completed_at,
          created_at,
          updated_at
        ) VALUES ($1, $2, 'OPEN', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NULL, $18, NULL, $19, $19)
        ON CONFLICT (id) DO UPDATE SET
          status = 'OPEN',
          title = excluded.title,
          instructions = excluded.instructions,
          source_inbound_event_id = excluded.source_inbound_event_id,
          source_event_type = excluded.source_event_type,
          aggregate_type = excluded.aggregate_type,
          aggregate_id = excluded.aggregate_id,
          transaction_no = excluded.transaction_no,
          product_code = excluded.product_code,
          replacement_aggregate_type = excluded.replacement_aggregate_type,
          replacement_aggregate_id = excluded.replacement_aggregate_id,
          replacement_event_type = excluded.replacement_event_type,
          replacement_record_version = excluded.replacement_record_version,
          replacement_payload_json = excluded.replacement_payload_json,
          operator_name = excluded.operator_name,
          operator_note = excluded.operator_note,
          requested_at = excluded.requested_at,
          updated_at = excluded.updated_at`,
        [
          taskPayload.taskId,
          taskPayload.taskType,
          taskPayload.title,
          taskPayload.instructions,
          taskPayload.sourceInboundEventId,
          taskPayload.sourceEventType,
          taskPayload.aggregateType,
          taskPayload.aggregateId,
          taskPayload.transactionNo ?? null,
          taskPayload.productCode ?? null,
          taskPayload.replacementAggregateType,
          taskPayload.replacementAggregateId,
          taskPayload.replacementEventType,
          Math.max(1, taskPayload.replacementRecordVersion),
          JSON.stringify(taskPayload.replacementPayload),
          taskPayload.operatorName,
          taskPayload.note,
          taskPayload.requestedAt,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "supplier" &&
      event.eventType === "supplier.published"
    ) {
      const supplierPayload =
        payload as Partial<EnterpriseSupplierPublishedPayload>;

      if (
        typeof supplierPayload.storeCode !== "string" ||
        supplierPayload.storeCode !== storeCode ||
        typeof supplierPayload.supplierId !== "string" ||
        typeof supplierPayload.supplierNo !== "string" ||
        typeof supplierPayload.supplierName !== "string" ||
        typeof supplierPayload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid supplier publication payload.",
        );
      }

      await runner.query(
        `INSERT INTO supplier_snapshot (
          supplier_no,
          supplier_name,
          phone,
          email,
          tax_number,
          address_line1,
          city,
          country_code,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9)
        ON CONFLICT (supplier_no) DO UPDATE SET
          supplier_name = excluded.supplier_name,
          phone = excluded.phone,
          email = excluded.email,
          address_line1 = excluded.address_line1,
          city = excluded.city,
          country_code = excluded.country_code,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          supplierPayload.supplierNo,
          supplierPayload.supplierName,
          typeof supplierPayload.phone === "string"
            ? supplierPayload.phone
            : null,
          typeof supplierPayload.email === "string"
            ? supplierPayload.email
            : null,
          typeof supplierPayload.addressLine1 === "string"
            ? supplierPayload.addressLine1
            : null,
          typeof supplierPayload.city === "string"
            ? supplierPayload.city
            : null,
          typeof supplierPayload.countryCode === "string"
            ? supplierPayload.countryCode
            : null,
          supplierPayload.status,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "purchaseOrder" &&
      event.eventType === "purchase-order.published"
    ) {
      if (
        typeof payload.storeCode !== "string" ||
        payload.storeCode !== storeCode ||
        typeof payload.purchaseOrderId !== "string" ||
        typeof payload.purchaseOrderNo !== "string" ||
        typeof payload.locationCode !== "string" ||
        typeof payload.locationName !== "string" ||
        typeof payload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid purchase-order publication payload.",
        );
      }

      await runner.query(
        `INSERT INTO purchase_order_snapshot (
          id,
          purchase_order_no,
          status,
          inventory_location_code,
          inventory_location_name,
          supplier_no,
          supplier_name,
          external_reference,
          note,
          operator_name,
          ordered_quantity,
          received_quantity,
          exception_quantity,
          outstanding_quantity,
          committed_at,
          closed_at,
          closure_reason,
          closure_note,
          closure_operator_name,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (id) DO UPDATE SET
          purchase_order_no = excluded.purchase_order_no,
          status = excluded.status,
          inventory_location_code = excluded.inventory_location_code,
          inventory_location_name = excluded.inventory_location_name,
          supplier_no = excluded.supplier_no,
          supplier_name = excluded.supplier_name,
          external_reference = excluded.external_reference,
          note = excluded.note,
          operator_name = excluded.operator_name,
          ordered_quantity = excluded.ordered_quantity,
          received_quantity = excluded.received_quantity,
          exception_quantity = excluded.exception_quantity,
          outstanding_quantity = excluded.outstanding_quantity,
          committed_at = excluded.committed_at,
          closed_at = excluded.closed_at,
          closure_reason = excluded.closure_reason,
          closure_note = excluded.closure_note,
          closure_operator_name = excluded.closure_operator_name,
          updated_at = excluded.updated_at`,
        [
          payload.purchaseOrderId,
          payload.purchaseOrderNo,
          payload.status,
          payload.locationCode,
          payload.locationName,
          typeof payload.supplierNo === "string" ? payload.supplierNo : null,
          typeof payload.supplierName === "string"
            ? payload.supplierName
            : null,
          typeof payload.externalReference === "string"
            ? payload.externalReference
            : null,
          typeof payload.note === "string" ? payload.note : null,
          typeof payload.operatorName === "string"
            ? payload.operatorName
            : null,
          typeof payload.orderedQuantity === "number"
            ? payload.orderedQuantity
            : 0,
          typeof payload.receivedQuantity === "number"
            ? payload.receivedQuantity
            : 0,
          typeof payload.exceptionQuantity === "number"
            ? payload.exceptionQuantity
            : 0,
          typeof payload.outstandingQuantity === "number"
            ? payload.outstandingQuantity
            : 0,
          typeof payload.committedAt === "string" ? payload.committedAt : null,
          typeof payload.closedAt === "string" ? payload.closedAt : null,
          typeof payload.closureReason === "string"
            ? payload.closureReason
            : null,
          typeof payload.closureNote === "string" ? payload.closureNote : null,
          typeof payload.closureOperatorName === "string"
            ? payload.closureOperatorName
            : null,
          appliedAt,
        ],
      );
      await runner.query(
        "DELETE FROM purchase_order_line_snapshot WHERE purchase_order_id = $1",
        [payload.purchaseOrderId],
      );

      for (const rawLine of Array.isArray(payload.lines) ? payload.lines : []) {
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

        await runner.query(
          `INSERT INTO purchase_order_line_snapshot (
            id,
            purchase_order_id,
            line_no,
            product_code,
            product_name,
            department_code,
            category_code,
            subcategory,
            is_serialized,
            track_expiry,
            ordered_quantity,
            received_quantity,
            exception_quantity,
            outstanding_quantity,
            unit_cost,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            line.purchaseOrderLineId,
            payload.purchaseOrderId,
            line.lineNo,
            line.productCode,
            line.productName,
            typeof line.departmentCode === "string"
              ? line.departmentCode
              : null,
            typeof line.categoryCode === "string" ? line.categoryCode : null,
            typeof line.subcategory === "string" ? line.subcategory : null,
            line.isSerialized === true ? 1 : 0,
            line.trackExpiry === true ? 1 : 0,
            typeof line.orderedQuantity === "number" ? line.orderedQuantity : 0,
            typeof line.receivedQuantity === "number"
              ? line.receivedQuantity
              : 0,
            typeof line.exceptionQuantity === "number"
              ? line.exceptionQuantity
              : 0,
            typeof line.outstandingQuantity === "number"
              ? line.outstandingQuantity
              : 0,
            typeof line.unitCost === "number" ? line.unitCost : null,
            appliedAt,
          ],
        );
      }

      return;
    }

    if (
      event.aggregateType === "interStoreTransferTarget" &&
      event.eventType === "inter-store-transfer.target.published"
    ) {
      if (
        typeof payload.storeCode !== "string" ||
        payload.storeCode !== storeCode ||
        typeof payload.sourceStoreCode !== "string" ||
        typeof payload.sourceStoreName !== "string" ||
        typeof payload.sourceLocationCode !== "string" ||
        typeof payload.sourceLocationName !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid transfer request target payload.",
        );
      }

      await runner.query(
        `INSERT INTO inter_store_transfer_request_target_snapshot (
          source_location_code,
          source_store_code,
          source_store_name,
          source_store_sales_enabled,
          source_store_warehouse_enabled,
          source_location_name,
          source_location_type,
          source_location_status,
          source_location_defaults,
          source_warehouse_code,
          source_warehouse_name,
          use_for_sales_default,
          use_for_receiving_default,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (source_location_code) DO UPDATE SET
          source_store_code = excluded.source_store_code,
          source_store_name = excluded.source_store_name,
          source_store_sales_enabled = excluded.source_store_sales_enabled,
          source_store_warehouse_enabled = excluded.source_store_warehouse_enabled,
          source_location_name = excluded.source_location_name,
          source_location_type = excluded.source_location_type,
          source_location_status = excluded.source_location_status,
          source_location_defaults = excluded.source_location_defaults,
          source_warehouse_code = excluded.source_warehouse_code,
          source_warehouse_name = excluded.source_warehouse_name,
          use_for_sales_default = excluded.use_for_sales_default,
          use_for_receiving_default = excluded.use_for_receiving_default,
          updated_at = excluded.updated_at`,
        [
          payload.sourceLocationCode,
          payload.sourceStoreCode,
          payload.sourceStoreName,
          payload.sourceStoreSalesEnabled === false ? 0 : 1,
          payload.sourceStoreWarehouseEnabled === false ? 0 : 1,
          payload.sourceLocationName,
          typeof payload.sourceLocationType === "string"
            ? payload.sourceLocationType
            : "STORE",
          typeof payload.sourceLocationStatus === "string"
            ? payload.sourceLocationStatus
            : "ACTIVE",
          typeof payload.sourceLocationDefaults === "string"
            ? payload.sourceLocationDefaults
            : "",
          typeof payload.sourceWarehouseCode === "string"
            ? payload.sourceWarehouseCode
            : null,
          typeof payload.sourceWarehouseName === "string"
            ? payload.sourceWarehouseName
            : null,
          payload.useForSalesDefault === true ? 1 : 0,
          payload.useForReceivingDefault === true ? 1 : 0,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "salesOrder" &&
      event.eventType === "sales-order.published"
    ) {
      const order = payload as Partial<EnterpriseEcommerceSalesOrderPublishedPayload>;
      const expectedStoreCode = expectedInboundStoreCode(order.storeCode);
      if (
        order.source !== "ECOMMERCE" || order.storeCode !== expectedStoreCode ||
        typeof order.orderId !== "string" || typeof order.orderNo !== "string" ||
        typeof order.sourceTransactionId !== "string" || typeof order.sourceTransactionNo !== "string" ||
        typeof order.totalAmount !== "number" || typeof order.paidAmount !== "number" ||
        typeof order.balanceAmount !== "number" || typeof order.salesOrderRecordVersion !== "number" ||
        !Array.isArray(order.lines) || !Array.isArray(order.reservations) ||
        (order.fulfilmentMethod !== "PICKUP" && order.fulfilmentMethod !== "DELIVERY") ||
        (order.paymentTiming !== "PREPAY" && order.paymentTiming !== "ON_DELIVERY") ||
        (order.status !== "OPEN" && order.status !== "CANCELLED" && order.status !== "EXPIRED")
      ) throw new Error("Flash ERP received an invalid ecommerce sales-order publication payload.");
      await rememberInboundStoreCode(order.storeCode);
      const existing = await runner.query<{ record_version: number }>("SELECT record_version FROM sales_order WHERE id = $1", [order.orderId]);
      if (existing.rows[0] && existing.rows[0].record_version > order.salesOrderRecordVersion) return;

      await runner.query(
        `INSERT INTO pos_transaction (id, transaction_no, shift_id, cashier_code, customer_id, source_transaction_id, source_transaction_no, transaction_type, status, subtotal_amount, discount_amount, loyalty_redemption_points, loyalty_redemption_amount, tax_amount, total_amount, paid_amount, change_amount, notes, header_reference, additional_details, completed_at, record_version, deleted_at, updated_at)
         VALUES ($1,$2,NULL,'ECOMMERCE',$3,$1,$2,'SALE',$4,$5,$6,0,0,$7,$8,$9,0,$10,$11,$12,NULL,$13,NULL,$14)
         ON CONFLICT (id) DO UPDATE SET status=excluded.status, customer_id=excluded.customer_id, subtotal_amount=excluded.subtotal_amount, discount_amount=excluded.discount_amount, tax_amount=excluded.tax_amount, total_amount=excluded.total_amount, paid_amount=excluded.paid_amount, notes=excluded.notes, header_reference=excluded.header_reference, additional_details=excluded.additional_details, record_version=excluded.record_version, updated_at=excluded.updated_at`,
        [order.sourceTransactionId, order.sourceTransactionNo, order.customerId ?? null, order.status === "OPEN" ? "PARKED" : "VOIDED", order.subtotalAmount ?? order.totalAmount, order.discountAmount ?? 0, order.taxAmount ?? 0, order.totalAmount, order.paidAmount, order.note ?? null, order.orderNo, JSON.stringify({ source: "ECOMMERCE", fulfilmentMethod: order.fulfilmentMethod, paymentTiming: order.paymentTiming, recipientName: order.recipientName ?? null, deliveryPhone: order.deliveryPhone ?? null, deliveryAddress: order.deliveryAddress ?? null, networkAllocation: order.networkAllocation === true }), order.salesOrderRecordVersion, appliedAt],
      );
      await runner.query("DELETE FROM pos_transaction_line WHERE pos_transaction_id = $1", [order.sourceTransactionId]);
      for (const line of order.lines) {
        if (typeof line !== "object" || line === null || typeof line.lineId !== "string" || typeof line.productCode !== "string" || typeof line.productName !== "string" || typeof line.quantity !== "number" || typeof line.unitPrice !== "number" || typeof line.lineTotal !== "number") throw new Error("Flash ERP received an invalid ecommerce sales-order line.");
        const product = await runner.query<{ id: string }>("SELECT id FROM product_snapshot WHERE product_code = $1 LIMIT 1", [line.productCode]);
        if (!product.rows[0]) throw new Error(`Flash ERP cannot prepare ${order.orderNo} until product ${line.productCode} has synced to this shop.`);
        await runner.query(
          `INSERT INTO pos_transaction_line (id,pos_transaction_id,product_id,line_intent,source_line_id,inventory_location_code,applied_promotion_code,applied_promotion_name,product_code_snapshot,product_variant_code_snapshot,product_name_snapshot,variant_size,variant_color,variant_attributes_snapshot,line_note,serial_numbers_json,batch_allocations_json,quantity,selling_unit_of_measure,base_unit_of_measure,uom_conversion_factor,base_quantity,unit_price,discount_amount,tax_amount,line_total,manual_price_override,manual_discount_override)
           VALUES ($1,$2,$3,'SALE',$1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'[]','[]',$14,$15,$16,$17,$18,$19,$20,$21,$22,0,0)`,
          [line.lineId,order.sourceTransactionId,product.rows[0].id,order.dispatchInventoryLocationCode ?? null,line.appliedPromotionCode ?? null,line.appliedPromotionName ?? null,line.productCode,line.productVariantCode ?? null,line.productName,line.variantSize ?? null,line.variantColor ?? null,line.variantAttributesSnapshot ?? null,line.lineNote ?? null,line.quantity,line.sellingUnitOfMeasure ?? "EA",line.baseUnitOfMeasure ?? "EA",line.uomConversionFactor ?? 1,line.baseQuantity ?? line.quantity,line.unitPrice,line.discountAmount ?? 0,line.taxAmount ?? 0,line.lineTotal],
        );
      }
      await runner.query(
        `INSERT INTO sales_order (id,order_no,source_transaction_id,source_transaction_no,customer_id,customer_no,customer_name,order_type,status,total_amount,deposit_amount,paid_amount,balance_amount,deposit_tender_method_code,deposit_tender_method_name,deposit_payment_method,deposit_reference,deposit_paid_at,layaway_policy_snapshot_json,minimum_deposit_amount,reservation_status,reservation_created_at,reservation_released_at,layaway_expires_at,expired_at,cancellation_fee_amount,refunded_amount,record_version,operator_name,note,fulfilled_transaction_id,fulfilled_transaction_no,synced_at,created_at,fulfilled_at,cancelled_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NULL,$33,$34,$35,$36)
         ON CONFLICT (id) DO UPDATE SET status=excluded.status,total_amount=excluded.total_amount,deposit_amount=excluded.deposit_amount,paid_amount=excluded.paid_amount,balance_amount=excluded.balance_amount,deposit_tender_method_code=excluded.deposit_tender_method_code,deposit_tender_method_name=excluded.deposit_tender_method_name,deposit_payment_method=excluded.deposit_payment_method,deposit_reference=excluded.deposit_reference,deposit_paid_at=excluded.deposit_paid_at,reservation_status=excluded.reservation_status,reservation_created_at=excluded.reservation_created_at,reservation_released_at=excluded.reservation_released_at,layaway_expires_at=excluded.layaway_expires_at,expired_at=excluded.expired_at,cancellation_fee_amount=excluded.cancellation_fee_amount,refunded_amount=excluded.refunded_amount,record_version=excluded.record_version,note=excluded.note,fulfilled_transaction_id=excluded.fulfilled_transaction_id,fulfilled_transaction_no=excluded.fulfilled_transaction_no,fulfilled_at=excluded.fulfilled_at,cancelled_at=excluded.cancelled_at,updated_at=excluded.updated_at`,
        [order.orderId,order.orderNo,order.sourceTransactionId,order.sourceTransactionNo,order.customerId ?? null,order.customerNo ?? null,order.customerName ?? null,order.orderType ?? "SALES_ORDER",order.status,order.totalAmount,order.depositAmount ?? 0,order.paidAmount,order.balanceAmount,order.depositTenderMethodCode ?? null,order.depositTenderMethodName ?? null,order.depositPaymentMethod ?? null,order.depositReference ?? null,order.depositPaidAt ?? null,order.layawayPolicySnapshotJson ?? null,order.minimumDepositAmount ?? 0,order.reservationStatus ?? "NOT_APPLICABLE",order.reservationCreatedAt ?? null,order.reservationReleasedAt ?? null,order.layawayExpiresAt ?? null,order.expiredAt ?? null,order.cancellationFeeAmount ?? 0,order.refundedAmount ?? 0,order.salesOrderRecordVersion,order.operatorName ?? "Customer web order",order.note ?? null,order.fulfilledTransactionId ?? null,order.fulfilledTransactionNo ?? null,order.createdAt ?? appliedAt,order.fulfilledAt ?? null,order.cancelledAt ?? null,appliedAt],
      );
      await runner.query("DELETE FROM sales_order_inventory_reservation WHERE sales_order_id = $1", [order.orderId]);
      for (const reservation of order.reservations) {
        if (typeof reservation !== "object" || reservation === null || typeof reservation.reservationId !== "string" || typeof reservation.salesOrderLineId !== "string" || typeof reservation.productCode !== "string" || typeof reservation.baseQuantity !== "number") throw new Error("Flash ERP received an invalid ecommerce sales-order reservation.");
        await runner.query("INSERT INTO sales_order_inventory_reservation (id,sales_order_id,sales_order_line_id,inventory_location_code,product_code,product_variant_code,base_unit_of_measure,base_quantity,status,release_reason,created_at,released_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [reservation.reservationId,order.orderId,reservation.salesOrderLineId,reservation.inventoryLocationCode ?? null,reservation.productCode,reservation.productVariantCode ?? null,reservation.baseUnitOfMeasure,reservation.baseQuantity,reservation.status,reservation.releaseReason ?? null,reservation.createdAt,reservation.releasedAt ?? null,appliedAt]);
      }
      return;
    }

    if (
      event.aggregateType === "interStoreTransfer" &&
      event.eventType === "inter-store-transfer.published"
    ) {
      if (
        typeof payload.storeCode !== "string" ||
        payload.storeCode !== storeCode ||
        typeof payload.transferId !== "string" ||
        typeof payload.transferNo !== "string" ||
        typeof payload.role !== "string" ||
        typeof payload.origin !== "string" ||
        typeof payload.status !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid inter-store transfer publication payload.",
        );
      }

      await runner.query(
        `INSERT INTO inter_store_transfer_snapshot (
          id,
          transfer_no,
          transfer_batch_no,
          line_no,
          role,
          origin,
          status,
          external_reference,
          source_store_code,
          source_store_name,
          source_location_code,
          source_location_name,
          destination_store_code,
          destination_store_name,
          destination_location_code,
          destination_location_name,
          product_code,
          product_name,
          department_code,
          category_code,
          subcategory,
          is_serialized,
          track_expiry,
          requested_quantity,
          requested_unit_of_measure,
          requested_unit_quantity,
          uom_conversion_factor,
          base_unit_of_measure,
          issued_quantity,
          received_quantity,
          outstanding_issue_quantity,
          outstanding_receipt_quantity,
          unit_cost,
          issued_serial_numbers_json,
          received_serial_numbers_json,
          issued_batch_allocations_json,
          received_batch_allocations_json,
          request_note,
          issue_note,
          receipt_note,
          request_operator_name,
          issue_operator_name,
          receipt_operator_name,
          requested_by_node_code,
          source_node_code,
          destination_node_code,
          requested_at,
          required_at,
          issued_at,
          received_at,
          closed_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52)
        ON CONFLICT (id) DO UPDATE SET
          transfer_no = excluded.transfer_no,
          transfer_batch_no = excluded.transfer_batch_no,
          line_no = excluded.line_no,
          role = excluded.role,
          origin = excluded.origin,
          status = excluded.status,
          external_reference = excluded.external_reference,
          source_store_code = excluded.source_store_code,
          source_store_name = excluded.source_store_name,
          source_location_code = excluded.source_location_code,
          source_location_name = excluded.source_location_name,
          destination_store_code = excluded.destination_store_code,
          destination_store_name = excluded.destination_store_name,
          destination_location_code = excluded.destination_location_code,
          destination_location_name = excluded.destination_location_name,
          product_code = excluded.product_code,
          product_name = excluded.product_name,
          department_code = excluded.department_code,
          category_code = excluded.category_code,
          subcategory = excluded.subcategory,
          is_serialized = excluded.is_serialized,
          track_expiry = excluded.track_expiry,
          requested_quantity = excluded.requested_quantity,
          requested_unit_of_measure = excluded.requested_unit_of_measure,
          requested_unit_quantity = excluded.requested_unit_quantity,
          uom_conversion_factor = excluded.uom_conversion_factor,
          base_unit_of_measure = excluded.base_unit_of_measure,
          issued_quantity = excluded.issued_quantity,
          received_quantity = excluded.received_quantity,
          outstanding_issue_quantity = excluded.outstanding_issue_quantity,
          outstanding_receipt_quantity = excluded.outstanding_receipt_quantity,
          unit_cost = excluded.unit_cost,
          issued_serial_numbers_json = excluded.issued_serial_numbers_json,
          received_serial_numbers_json = excluded.received_serial_numbers_json,
          issued_batch_allocations_json = excluded.issued_batch_allocations_json,
          received_batch_allocations_json = excluded.received_batch_allocations_json,
          request_note = excluded.request_note,
          issue_note = excluded.issue_note,
          receipt_note = excluded.receipt_note,
          request_operator_name = excluded.request_operator_name,
          issue_operator_name = excluded.issue_operator_name,
          receipt_operator_name = excluded.receipt_operator_name,
          requested_by_node_code = excluded.requested_by_node_code,
          source_node_code = excluded.source_node_code,
          destination_node_code = excluded.destination_node_code,
          requested_at = excluded.requested_at,
          required_at = excluded.required_at,
          issued_at = excluded.issued_at,
          received_at = excluded.received_at,
          closed_at = excluded.closed_at,
          updated_at = excluded.updated_at`,
        [
          payload.transferId,
          payload.transferNo,
          typeof payload.transferBatchNo === "string"
            ? payload.transferBatchNo
            : payload.transferNo,
          typeof payload.lineNo === "number"
            ? Math.max(1, Math.trunc(payload.lineNo))
            : 1,
          payload.role,
          payload.origin,
          payload.status,
          typeof payload.externalReference === "string"
            ? payload.externalReference
            : null,
          typeof payload.sourceStoreCode === "string"
            ? payload.sourceStoreCode
            : storeCode,
          typeof payload.sourceStoreName === "string"
            ? payload.sourceStoreName
            : storeCode,
          typeof payload.sourceLocationCode === "string"
            ? payload.sourceLocationCode
            : "",
          typeof payload.sourceLocationName === "string"
            ? payload.sourceLocationName
            : "",
          typeof payload.destinationStoreCode === "string"
            ? payload.destinationStoreCode
            : storeCode,
          typeof payload.destinationStoreName === "string"
            ? payload.destinationStoreName
            : storeCode,
          typeof payload.destinationLocationCode === "string"
            ? payload.destinationLocationCode
            : "",
          typeof payload.destinationLocationName === "string"
            ? payload.destinationLocationName
            : "",
          typeof payload.productCode === "string" ? payload.productCode : "",
          typeof payload.productName === "string" ? payload.productName : "",
          typeof payload.departmentCode === "string"
            ? payload.departmentCode
            : null,
          typeof payload.categoryCode === "string"
            ? payload.categoryCode
            : null,
          typeof payload.subcategory === "string" ? payload.subcategory : null,
          payload.isSerialized === true ? 1 : 0,
          payload.trackExpiry === true ? 1 : 0,
          typeof payload.requestedQuantity === "number"
            ? payload.requestedQuantity
            : 0,
          typeof payload.requestedUnitOfMeasure === "string"
            ? payload.requestedUnitOfMeasure
            : "EA",
          typeof payload.requestedUnitQuantity === "number"
            ? payload.requestedUnitQuantity
            : typeof payload.requestedQuantity === "number"
              ? payload.requestedQuantity
              : 0,
          typeof payload.uomConversionFactor === "number"
            ? payload.uomConversionFactor
            : 1,
          typeof payload.baseUnitOfMeasure === "string"
            ? payload.baseUnitOfMeasure
            : "EA",
          typeof payload.issuedQuantity === "number"
            ? payload.issuedQuantity
            : 0,
          typeof payload.receivedQuantity === "number"
            ? payload.receivedQuantity
            : 0,
          typeof payload.outstandingIssueQuantity === "number"
            ? payload.outstandingIssueQuantity
            : 0,
          typeof payload.outstandingReceiptQuantity === "number"
            ? payload.outstandingReceiptQuantity
            : 0,
          typeof payload.unitCost === "number" ? payload.unitCost : null,
          Array.isArray(payload.issuedSerialNumbers)
            ? writeSerializedLineNumbers(
                normalizeSerialNumbers(payload.issuedSerialNumbers as string[]),
              )
            : null,
          Array.isArray(payload.receivedSerialNumbers)
            ? writeSerializedLineNumbers(
                normalizeSerialNumbers(
                  payload.receivedSerialNumbers as string[],
                ),
              )
            : null,
          writeInventoryBatchAllocations(
            Array.isArray(payload.issuedBatchAllocations)
              ? payload.issuedBatchAllocations
              : [],
          ),
          writeInventoryBatchAllocations(
            Array.isArray(payload.receivedBatchAllocations)
              ? payload.receivedBatchAllocations
              : [],
          ),
          typeof payload.requestNote === "string" ? payload.requestNote : null,
          typeof payload.issueNote === "string" ? payload.issueNote : null,
          typeof payload.receiptNote === "string" ? payload.receiptNote : null,
          typeof payload.requestOperatorName === "string"
            ? payload.requestOperatorName
            : null,
          typeof payload.issueOperatorName === "string"
            ? payload.issueOperatorName
            : null,
          typeof payload.receiptOperatorName === "string"
            ? payload.receiptOperatorName
            : null,
          typeof payload.requestedByNodeCode === "string"
            ? payload.requestedByNodeCode
            : null,
          typeof payload.sourceNodeCode === "string"
            ? payload.sourceNodeCode
            : null,
          typeof payload.destinationNodeCode === "string"
            ? payload.destinationNodeCode
            : null,
          typeof payload.requestedAt === "string"
            ? payload.requestedAt
            : appliedAt,
          typeof payload.requiredAt === "string" ? payload.requiredAt : null,
          typeof payload.issuedAt === "string" ? payload.issuedAt : null,
          typeof payload.receivedAt === "string" ? payload.receivedAt : null,
          typeof payload.closedAt === "string" ? payload.closedAt : null,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO product_department_snapshot (
          id,
          department_code,
          department_name,
          description,
          status,
          sort_order,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (department_code) DO UPDATE SET
          id = excluded.id,
          department_name = excluded.department_name,
          description = excluded.description,
          status = excluded.status,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          departmentPayload.departmentCode,
          departmentPayload.departmentName,
          typeof departmentPayload.description === "string"
            ? departmentPayload.description
            : null,
          departmentPayload.status,
          departmentPayload.sortOrder,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO product_category_snapshot (
          id,
          category_code,
          category_name,
          department_code,
          department_name,
          description,
          status,
          sort_order,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (category_code) DO UPDATE SET
          id = excluded.id,
          category_name = excluded.category_name,
          department_code = excluded.department_code,
          department_name = excluded.department_name,
          description = excluded.description,
          status = excluded.status,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          categoryPayload.categoryCode,
          categoryPayload.categoryName,
          categoryPayload.departmentCode,
          categoryPayload.departmentName,
          typeof categoryPayload.description === "string"
            ? categoryPayload.description
            : null,
          categoryPayload.status,
          categoryPayload.sortOrder,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO unit_of_measure_snapshot (
          id,
          uom_code,
          uom_name,
          description,
          decimal_precision,
          allow_fractional_sale,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (uom_code) DO UPDATE SET
          id = excluded.id,
          uom_name = excluded.uom_name,
          description = excluded.description,
          decimal_precision = excluded.decimal_precision,
          allow_fractional_sale = excluded.allow_fractional_sale,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          uomPayload.uomCode,
          uomPayload.uomName,
          typeof uomPayload.description === "string"
            ? uomPayload.description
            : null,
          Math.max(0, Math.trunc(uomPayload.decimalPrecision)),
          uomPayload.allowFractionalSale ? 1 : 0,
          uomPayload.status,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO gift_certificate_snapshot (
          id,
          certificate_no,
          recipient_name,
          purchaser_name,
          original_amount,
          balance_amount,
          currency_code,
          issue_date,
          expiry_date,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (certificate_no) DO UPDATE SET
          id = excluded.id,
          recipient_name = excluded.recipient_name,
          purchaser_name = excluded.purchaser_name,
          original_amount = excluded.original_amount,
          balance_amount = excluded.balance_amount,
          currency_code = excluded.currency_code,
          issue_date = excluded.issue_date,
          expiry_date = excluded.expiry_date,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          certificatePayload.certificateId,
          certificatePayload.certificateNo,
          typeof certificatePayload.recipientName === "string"
            ? certificatePayload.recipientName
            : null,
          typeof certificatePayload.purchaserName === "string"
            ? certificatePayload.purchaserName
            : null,
          certificatePayload.originalAmount,
          certificatePayload.balanceAmount,
          certificatePayload.currencyCode,
          certificatePayload.issueDate,
          typeof certificatePayload.expiryDate === "string"
            ? certificatePayload.expiryDate
            : null,
          certificatePayload.status,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO promotion_snapshot (
          id,
          promotion_code,
          promotion_name,
          description,
          discount_type,
          target_scope,
          discount_value,
          minimum_basket_amount,
          minimum_line_quantity,
          buy_quantity,
          reward_quantity,
          target_department_code,
          target_category_code,
          target_product_code,
          eligible_store_codes_json,
          eligible_customer_types_json,
          eligible_loyalty_tiers_json,
          active_days_of_week_json,
          active_from_minutes,
          active_to_minutes,
          coupon_required,
          coupon_code,
          allow_with_loyalty,
          apply_once_per_basket,
          priority,
          start_at,
          end_at,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
        ON CONFLICT (promotion_code) DO UPDATE SET
          id = excluded.id,
          promotion_name = excluded.promotion_name,
          description = excluded.description,
          discount_type = excluded.discount_type,
          target_scope = excluded.target_scope,
          discount_value = excluded.discount_value,
          minimum_basket_amount = excluded.minimum_basket_amount,
          minimum_line_quantity = excluded.minimum_line_quantity,
          buy_quantity = excluded.buy_quantity,
          reward_quantity = excluded.reward_quantity,
          target_department_code = excluded.target_department_code,
          target_category_code = excluded.target_category_code,
          target_product_code = excluded.target_product_code,
          eligible_store_codes_json = excluded.eligible_store_codes_json,
          eligible_customer_types_json = excluded.eligible_customer_types_json,
          eligible_loyalty_tiers_json = excluded.eligible_loyalty_tiers_json,
          active_days_of_week_json = excluded.active_days_of_week_json,
          active_from_minutes = excluded.active_from_minutes,
          active_to_minutes = excluded.active_to_minutes,
          coupon_required = excluded.coupon_required,
          coupon_code = excluded.coupon_code,
          allow_with_loyalty = excluded.allow_with_loyalty,
          apply_once_per_basket = excluded.apply_once_per_basket,
          priority = excluded.priority,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          promotionPayload.promotionId,
          promotionPayload.promotionCode,
          promotionPayload.promotionName,
          typeof promotionPayload.description === "string"
            ? promotionPayload.description
            : null,
          promotionPayload.discountType,
          promotionPayload.targetScope,
          promotionPayload.discountValue,
          typeof promotionPayload.minimumBasketAmount === "number"
            ? promotionPayload.minimumBasketAmount
            : null,
          typeof promotionPayload.minimumLineQuantity === "number"
            ? promotionPayload.minimumLineQuantity
            : null,
          typeof promotionPayload.buyQuantity === "number"
            ? promotionPayload.buyQuantity
            : null,
          typeof promotionPayload.rewardQuantity === "number"
            ? promotionPayload.rewardQuantity
            : null,
          typeof promotionPayload.targetDepartmentCode === "string"
            ? promotionPayload.targetDepartmentCode
            : null,
          typeof promotionPayload.targetCategoryCode === "string"
            ? promotionPayload.targetCategoryCode
            : null,
          typeof promotionPayload.targetProductCode === "string"
            ? promotionPayload.targetProductCode
            : null,
          Array.isArray(promotionPayload.eligibleStoreCodes)
            ? writeStringArray(promotionPayload.eligibleStoreCodes)
            : null,
          Array.isArray(promotionPayload.eligibleCustomerTypes)
            ? writeStringArray(promotionPayload.eligibleCustomerTypes)
            : null,
          Array.isArray(promotionPayload.eligibleLoyaltyTiers)
            ? writeStringArray(promotionPayload.eligibleLoyaltyTiers)
            : null,
          Array.isArray(promotionPayload.activeDaysOfWeek)
            ? writeStringArray(promotionPayload.activeDaysOfWeek)
            : null,
          typeof promotionPayload.activeFromMinutes === "number"
            ? Math.trunc(promotionPayload.activeFromMinutes)
            : null,
          typeof promotionPayload.activeToMinutes === "number"
            ? Math.trunc(promotionPayload.activeToMinutes)
            : null,
          promotionPayload.couponRequired ? 1 : 0,
          typeof promotionPayload.couponCode === "string"
            ? promotionPayload.couponCode
            : null,
          promotionPayload.allowWithLoyalty ? 1 : 0,
          promotionPayload.applyOncePerBasket ? 1 : 0,
          Math.max(0, Math.trunc(promotionPayload.priority)),
          typeof promotionPayload.startAt === "string"
            ? promotionPayload.startAt
            : null,
          typeof promotionPayload.endAt === "string"
            ? promotionPayload.endAt
            : null,
          promotionPayload.status,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "product" &&
      event.eventType === "catalog.product.published"
    ) {
      if (
        typeof payload.storeCode !== "string" ||
        payload.storeCode !== storeCode ||
        typeof payload.productCode !== "string" ||
        typeof payload.productName !== "string" ||
        typeof payload.unitPrice !== "number"
      ) {
        throw new Error(
          "Flash ERP received an invalid catalog product publication payload.",
        );
      }

      const existingProduct = await this.getProductByCode(
        payload.productCode,
        runner,
      );
      const matrixVariants = Array.isArray(payload.matrixVariants)
        ? payload.matrixVariants.filter(
            (variant) =>
              typeof variant === "object" &&
              variant !== null &&
              typeof variant.variantCode === "string" &&
              typeof variant.unitPrice === "number",
          )
        : [];
      const sellingUnits = normalizePublishedSellingUnits(payload.sellingUnits);
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
          : typeof payload.quantityOnHand === "number"
            ? payload.quantityOnHand
            : asNumber(existingProduct?.quantity_on_hand);
      await runner.query(
        `INSERT INTO product_snapshot (
          id,
          product_code,
          product_name,
          product_type,
          short_name,
          description,
          primary_image_url,
          department_code,
          category_code,
          subcategory,
          unit_of_measure,
          base_unit_of_measure,
          uom_conversions_json,
          selling_units_json,
          taxable,
          tax_profile_code,
          tax_profile_name,
          tax_rate_percent,
          tax_inclusive,
          track_inventory,
          track_expiry,
          shelf_life_days,
          is_serialized,
          track_size,
          track_color,
          must_enter_price_at_pos,
          min_stock_level,
          reorder_point,
          safety_stock_level,
          catalog_membership_active,
          catalog_sort_order,
          unit_price,
          quantity_on_hand,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
        ON CONFLICT (product_code) DO UPDATE SET
          product_name = excluded.product_name,
          product_type = excluded.product_type,
          short_name = excluded.short_name,
          description = excluded.description,
          primary_image_url = excluded.primary_image_url,
          department_code = excluded.department_code,
          category_code = excluded.category_code,
          subcategory = excluded.subcategory,
          unit_of_measure = excluded.unit_of_measure,
          base_unit_of_measure = excluded.base_unit_of_measure,
          uom_conversions_json = excluded.uom_conversions_json,
          selling_units_json = excluded.selling_units_json,
          taxable = excluded.taxable,
          tax_profile_code = excluded.tax_profile_code,
          tax_profile_name = excluded.tax_profile_name,
          tax_rate_percent = excluded.tax_rate_percent,
          tax_inclusive = excluded.tax_inclusive,
          track_inventory = excluded.track_inventory,
          track_expiry = excluded.track_expiry,
          shelf_life_days = excluded.shelf_life_days,
          is_serialized = excluded.is_serialized,
          track_size = excluded.track_size,
          track_color = excluded.track_color,
          must_enter_price_at_pos = excluded.must_enter_price_at_pos,
          min_stock_level = excluded.min_stock_level,
          reorder_point = excluded.reorder_point,
          safety_stock_level = excluded.safety_stock_level,
          catalog_membership_active = excluded.catalog_membership_active,
          catalog_sort_order = excluded.catalog_sort_order,
          unit_price = excluded.unit_price,
          quantity_on_hand = excluded.quantity_on_hand,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          payload.productCode,
          payload.productName,
          typeof payload.productType === "string"
            ? payload.productType
            : "STANDARD",
          typeof payload.shortName === "string" ? payload.shortName : null,
          typeof payload.description === "string" ? payload.description : null,
          typeof payload.primaryImageUrl === "string"
            ? payload.primaryImageUrl
            : null,
          typeof payload.department === "string" ? payload.department : null,
          typeof payload.category === "string" ? payload.category : null,
          typeof payload.subcategory === "string" ? payload.subcategory : null,
          typeof payload.unitOfMeasure === "string"
            ? payload.unitOfMeasure
            : "EA",
          typeof payload.baseUnitOfMeasure === "string"
            ? payload.baseUnitOfMeasure
            : payload.unitOfMeasure ?? "EA",
          JSON.stringify(payload.uomConversions ?? []),
          JSON.stringify(sellingUnits),
          payload.taxable === false ? 0 : 1,
          typeof payload.taxProfileCode === "string"
            ? payload.taxProfileCode
            : null,
          typeof payload.taxProfileName === "string"
            ? payload.taxProfileName
            : null,
          typeof payload.taxRatePercent === "number"
            ? payload.taxRatePercent
            : null,
          payload.taxInclusive === true ? 1 : 0,
          payload.trackInventory === false ? 0 : 1,
          payload.trackExpiry === true ? 1 : 0,
          typeof payload.shelfLifeDays === "number"
            ? Math.trunc(payload.shelfLifeDays)
            : null,
          payload.isSerialized === true ? 1 : 0,
          payload.trackSize === true ? 1 : 0,
          payload.trackColor === true ? 1 : 0,
          payload.mustEnterPriceAtPos === true ? 1 : 0,
          typeof payload.minStockLevel === "number"
            ? payload.minStockLevel
            : null,
          typeof payload.reorderPoint === "number"
            ? payload.reorderPoint
            : null,
          typeof payload.safetyStockLevel === "number"
            ? payload.safetyStockLevel
            : null,
          1,
          typeof payload.catalogSortOrder === "number"
            ? Math.trunc(payload.catalogSortOrder)
            : null,
          payload.unitPrice,
          nextQuantity,
          appliedAt,
        ],
      );

      await runner.query(
        "DELETE FROM product_variant_snapshot WHERE product_code = $1",
        [payload.productCode],
      );

      for (const variant of matrixVariants) {
        await runner.query(
          `INSERT INTO product_variant_snapshot (
            id,
            product_code,
            variant_code,
            sku,
            display_name,
            unit_price,
            quantity_on_hand,
            barcode,
            status,
            attributes_json,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            typeof variant.variantId === "string"
              ? variant.variantId
              : randomUUID(),
            payload.productCode,
            variant.variantCode.toUpperCase(),
            typeof variant.sku === "string" ? variant.sku : null,
            typeof variant.displayName === "string"
              ? variant.displayName
              : null,
            variant.unitPrice,
            typeof variant.quantityOnHand === "number"
              ? variant.quantityOnHand
              : 0,
            typeof variant.barcode === "string" ? variant.barcode : null,
            typeof variant.status === "string" ? variant.status : "ACTIVE",
            writeMatrixVariantAttributes(
              Array.isArray(variant.attributes) ? variant.attributes : [],
            ),
            appliedAt,
          ],
        );
      }

      await runner.query(
        "DELETE FROM barcode_snapshot WHERE product_code = $1 AND barcode_type LIKE 'SELLING_UOM:%'",
        [payload.productCode],
      );

      for (const sellingUnit of sellingUnits) {
        if (!sellingUnit.barcode?.trim()) continue;

        await runner.query(
          `INSERT INTO barcode_snapshot (
            id, barcode_code, product_code, barcode_type, updated_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (barcode_code) DO UPDATE SET
            product_code = excluded.product_code,
            barcode_type = excluded.barcode_type,
            updated_at = excluded.updated_at`,
          [
            randomUUID(),
            sellingUnit.barcode.trim(),
            payload.productCode,
            `SELLING_UOM:${sellingUnit.unitOfMeasureCode}`,
            appliedAt,
          ],
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

      await runner.query(
        `INSERT INTO tax_profile_snapshot (
          id,
          tax_profile_code,
          tax_profile_name,
          description,
          rate_percent,
          is_default,
          is_tax_inclusive,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tax_profile_code) DO UPDATE SET
          id = excluded.id,
          tax_profile_name = excluded.tax_profile_name,
          description = excluded.description,
          rate_percent = excluded.rate_percent,
          is_default = excluded.is_default,
          is_tax_inclusive = excluded.is_tax_inclusive,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          taxPayload.taxProfileCode,
          taxPayload.taxProfileName,
          typeof taxPayload.description === "string"
            ? taxPayload.description
            : null,
          taxPayload.ratePercent,
          taxPayload.isDefault ? 1 : 0,
          taxPayload.isTaxInclusive ? 1 : 0,
          taxPayload.status,
          appliedAt,
        ],
      );

      await runner.query(
        `UPDATE product_snapshot
         SET tax_profile_name = $1,
             tax_rate_percent = $2,
             tax_inclusive = $3,
             updated_at = $4
         WHERE tax_profile_code = $5`,
        [
          taxPayload.taxProfileName,
          taxPayload.ratePercent,
          taxPayload.isTaxInclusive ? 1 : 0,
          appliedAt,
          taxPayload.taxProfileCode,
        ],
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

      await runner.query(
        `INSERT INTO tender_method_snapshot (
          id,
          tender_method_code,
          tender_method_name,
          payment_method,
          gateway_provider,
          gateway_mode,
          gateway_merchant_id,
          gateway_public_key,
          gateway_callback_url,
          gateway_active,
          gateway_status,
          description,
          requires_reference,
          allow_change,
          allow_refund,
          allow_open_cash_drawer,
          status,
          sort_order,
          published_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (tender_method_code) DO UPDATE SET
          id = excluded.id,
          tender_method_name = excluded.tender_method_name,
          payment_method = excluded.payment_method,
          gateway_provider = excluded.gateway_provider,
          gateway_mode = excluded.gateway_mode,
          gateway_merchant_id = excluded.gateway_merchant_id,
          gateway_public_key = excluded.gateway_public_key,
          gateway_callback_url = excluded.gateway_callback_url,
          gateway_active = excluded.gateway_active,
          gateway_status = excluded.gateway_status,
          description = excluded.description,
          requires_reference = excluded.requires_reference,
          allow_change = excluded.allow_change,
          allow_refund = excluded.allow_refund,
          allow_open_cash_drawer = excluded.allow_open_cash_drawer,
          status = excluded.status,
          sort_order = excluded.sort_order,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          tenderPayload.tenderMethodCode,
          tenderPayload.tenderMethodName,
          tenderPayload.paymentMethod,
          typeof tenderPayload.gatewayProvider === "string"
            ? tenderPayload.gatewayProvider
            : null,
          typeof tenderPayload.gatewayMode === "string"
            ? tenderPayload.gatewayMode
            : null,
          typeof tenderPayload.gatewayMerchantId === "string"
            ? tenderPayload.gatewayMerchantId
            : null,
          typeof tenderPayload.gatewayPublicKey === "string"
            ? tenderPayload.gatewayPublicKey
            : null,
          typeof tenderPayload.gatewayCallbackUrl === "string"
            ? tenderPayload.gatewayCallbackUrl
            : null,
          tenderPayload.gatewayActive ? 1 : 0,
          typeof tenderPayload.gatewayStatus === "string"
            ? tenderPayload.gatewayStatus
            : "DISABLED",
          typeof tenderPayload.description === "string"
            ? tenderPayload.description
            : null,
          tenderPayload.requiresReference ? 1 : 0,
          tenderPayload.allowChange ? 1 : 0,
          tenderPayload.allowRefund ? 1 : 0,
          tenderPayload.allowOpenCashDrawer ? 1 : 0,
          tenderPayload.status,
          tenderPayload.sortOrder,
          publishedAt,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO bank_account_snapshot (
          id,
          bank_code,
          bank_name,
          branch_code,
          branch_name,
          account_number,
          account_name,
          currency_code,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          bank_code = excluded.bank_code,
          bank_name = excluded.bank_name,
          branch_code = excluded.branch_code,
          branch_name = excluded.branch_name,
          account_number = excluded.account_number,
          account_name = excluded.account_name,
          currency_code = excluded.currency_code,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          bankPayload.bankAccountId,
          bankPayload.bankCode,
          bankPayload.bankName,
          bankPayload.branchCode,
          bankPayload.branchName,
          bankPayload.accountNumber,
          bankPayload.accountName,
          bankPayload.currencyCode,
          bankPayload.status,
          appliedAt,
        ],
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

      await runner.query(
        `INSERT INTO barcode_snapshot (
          id,
          barcode_code,
          product_code,
          barcode_type,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (barcode_code) DO UPDATE SET
          id = excluded.id,
          product_code = excluded.product_code,
          barcode_type = excluded.barcode_type,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          barcodePayload.barcode,
          barcodePayload.productCode,
          barcodePayload.barcodeType,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "priceList" &&
      event.eventType === "pricing.price-list.published"
    ) {
      const pricePayload =
        payload as Partial<EnterprisePriceListPublishedPayload>;

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
      const priceStatus =
        typeof pricePayload.status === "string"
          ? pricePayload.status
          : "ACTIVE";

      await runner.query(
        `INSERT INTO price_list_entry_snapshot (
          id,
          price_list_code,
          price_list_name,
          currency_code,
          is_default,
          customer_type,
          loyalty_tier,
          product_code,
          unit_price,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (price_list_code, product_code) DO UPDATE SET
          id = excluded.id,
          price_list_name = excluded.price_list_name,
          currency_code = excluded.currency_code,
          is_default = excluded.is_default,
          customer_type = excluded.customer_type,
          loyalty_tier = excluded.loyalty_tier,
          unit_price = excluded.unit_price,
          status = excluded.status,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          pricePayload.priceListCode,
          priceListName,
          currencyCode,
          isDefault ? 1 : 0,
          typeof pricePayload.customerType === "string"
            ? pricePayload.customerType
            : null,
          typeof pricePayload.loyaltyTier === "string"
            ? pricePayload.loyaltyTier
            : null,
          pricePayload.productCode,
          pricePayload.unitPrice,
          priceStatus,
          appliedAt,
        ],
      );

      if (!isDefault) {
        return;
      }

      await runner.query(
        `UPDATE product_snapshot
         SET unit_price = $1,
             updated_at = $2
         WHERE product_code = $3`,
        [pricePayload.unitPrice, appliedAt, pricePayload.productCode],
      );

      return;
    }

    if (
      event.aggregateType === "inventoryLocation" &&
      event.eventType === "inventory.location.published"
    ) {
      if (
        typeof payload.storeCode !== "string" ||
        payload.storeCode !== storeCode ||
        typeof payload.locationCode !== "string" ||
        typeof payload.locationName !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid inventory location publication payload.",
        );
      }

      if (payload.useForSalesDefault === true) {
        await runner.query(
          "UPDATE inventory_location_snapshot SET is_sales_default = 0, updated_at = $1 WHERE location_code <> $2",
          [appliedAt, payload.locationCode],
        );
      }

      if (payload.useForSalesOrderDefault === true) {
        await runner.query(
          "UPDATE inventory_location_snapshot SET is_sales_order_default = 0, updated_at = $1 WHERE location_code <> $2",
          [appliedAt, payload.locationCode],
        );
      }

      if (payload.useForReceivingDefault === true) {
        await runner.query(
          "UPDATE inventory_location_snapshot SET is_receiving_default = 0, updated_at = $1 WHERE location_code <> $2",
          [appliedAt, payload.locationCode],
        );
      }

      await runner.query(
        `INSERT INTO inventory_location_snapshot (
          id,
          location_code,
          location_name,
          location_type,
          status,
          defaults,
          is_sales_default,
          is_sales_order_default,
          is_receiving_default,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (location_code) DO UPDATE SET
          location_name = excluded.location_name,
          location_type = excluded.location_type,
          status = excluded.status,
          defaults = excluded.defaults,
          is_sales_default = excluded.is_sales_default,
          is_sales_order_default = excluded.is_sales_order_default,
          is_receiving_default = excluded.is_receiving_default,
          updated_at = excluded.updated_at`,
        [
          event.aggregateId,
          payload.locationCode,
          payload.locationName,
          typeof payload.locationType === "string"
            ? payload.locationType
            : "STORE",
          typeof payload.status === "string" ? payload.status : "ACTIVE",
          typeof payload.defaults === "string" ? payload.defaults : "",
          payload.useForSalesDefault === true ? 1 : 0,
          payload.useForSalesOrderDefault === true ? 1 : 0,
          payload.useForReceivingDefault === true ? 1 : 0,
          appliedAt,
        ],
      );

      return;
    }

    if (
      event.aggregateType === "supplierReturn" &&
      event.eventType === "supplier-return.published"
    ) {
      if (
        typeof payload.storeCode !== "string" ||
        payload.storeCode !== storeCode ||
        typeof payload.supplierReturnId !== "string" ||
        typeof payload.supplierReturnNo !== "string" ||
        typeof payload.goodsReceiptId !== "string" ||
        typeof payload.goodsReceiptNo !== "string" ||
        typeof payload.inventoryLocationCode !== "string" ||
        typeof payload.supplierNo !== "string" ||
        typeof payload.supplierName !== "string" ||
        typeof payload.reason !== "string" ||
        typeof payload.operatorName !== "string" ||
        typeof payload.returnedAt !== "string"
      ) {
        throw new Error(
          "Flash ERP received an invalid supplier-return publication payload.",
        );
      }

      await runner.query(
        `INSERT INTO local_supplier_return (
          id,
          supplier_return_no,
          purchase_order_id,
          purchase_order_no,
          goods_receipt_id,
          goods_receipt_no,
          inventory_location_code,
          supplier_no,
          supplier_name,
          external_reference,
          reason,
          status,
          note,
          operator_name,
          total_quantity,
          synced_at,
          returned_at,
          cancelled_at,
          cancellation_note,
          cancellation_operator_name,
          cancellation_acknowledged_at,
          cancellation_acknowledged_by,
          cancellation_acknowledgement_note,
          cancellation_ack_synced_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        ON CONFLICT (id) DO UPDATE SET
          supplier_return_no = excluded.supplier_return_no,
          purchase_order_id = excluded.purchase_order_id,
          purchase_order_no = excluded.purchase_order_no,
          goods_receipt_id = excluded.goods_receipt_id,
          goods_receipt_no = excluded.goods_receipt_no,
          inventory_location_code = excluded.inventory_location_code,
          supplier_no = excluded.supplier_no,
          supplier_name = excluded.supplier_name,
          external_reference = excluded.external_reference,
          reason = excluded.reason,
          status = excluded.status,
          note = excluded.note,
          operator_name = excluded.operator_name,
          total_quantity = excluded.total_quantity,
          synced_at = COALESCE(local_supplier_return.synced_at, excluded.synced_at),
          returned_at = excluded.returned_at,
          cancelled_at = excluded.cancelled_at,
          cancellation_note = excluded.cancellation_note,
          cancellation_operator_name = excluded.cancellation_operator_name,
          cancellation_acknowledged_at = excluded.cancellation_acknowledged_at,
          cancellation_acknowledged_by = excluded.cancellation_acknowledged_by,
          cancellation_acknowledgement_note = excluded.cancellation_acknowledgement_note,
          cancellation_ack_synced_at = COALESCE(local_supplier_return.cancellation_ack_synced_at, excluded.cancellation_ack_synced_at),
          updated_at = excluded.updated_at`,
        [
          payload.supplierReturnId,
          payload.supplierReturnNo,
          typeof payload.purchaseOrderId === "string"
            ? payload.purchaseOrderId
            : null,
          typeof payload.purchaseOrderNo === "string"
            ? payload.purchaseOrderNo
            : null,
          payload.goodsReceiptId,
          payload.goodsReceiptNo,
          payload.inventoryLocationCode,
          payload.supplierNo,
          payload.supplierName,
          typeof payload.externalReference === "string"
            ? payload.externalReference
            : null,
          payload.reason,
          payload.status === "CANCELLED" ? "CANCELLED" : "POSTED",
          typeof payload.note === "string" ? payload.note : null,
          payload.operatorName,
          typeof payload.totalQuantity === "number" ? payload.totalQuantity : 0,
          appliedAt,
          payload.returnedAt,
          typeof payload.cancelledAt === "string" ? payload.cancelledAt : null,
          typeof payload.cancellationNote === "string"
            ? payload.cancellationNote
            : null,
          typeof payload.cancellationOperatorName === "string"
            ? payload.cancellationOperatorName
            : null,
          typeof payload.cancellationAcknowledgedAt === "string"
            ? payload.cancellationAcknowledgedAt
            : null,
          typeof payload.cancellationAcknowledgedBy === "string"
            ? payload.cancellationAcknowledgedBy
            : null,
          typeof payload.cancellationAcknowledgementNote === "string"
            ? payload.cancellationAcknowledgementNote
            : null,
          typeof payload.cancellationAcknowledgedAt === "string"
            ? appliedAt
            : null,
          appliedAt,
        ],
      );

      return;
    }
  }

  private async getCheckpointCursor(remoteNodeCode: string) {
    const result = await this.pool.query<{
      last_received_cursor: string | null;
    }>(
      "SELECT last_received_cursor FROM sync_checkpoint WHERE remote_node_code = $1 LIMIT 1",
      [remoteNodeCode],
    );

    return result.rows[0]?.last_received_cursor ?? null;
  }

  private async currentCheckpointAppliedAt(remoteNodeCode: string) {
    const result = await this.pool.query<{ last_applied_at: string | null }>(
      "SELECT last_applied_at FROM sync_checkpoint WHERE remote_node_code = $1 LIMIT 1",
      [remoteNodeCode],
    );

    return result.rows[0]?.last_applied_at ?? null;
  }

  private async upsertCheckpoint(
    input: {
      remoteNodeCode: string;
      lastEventId: string | null;
      cursor: string | null;
      receivedAt: string;
      appliedAt: string | null;
    },
    runner: DbRunner = this.pool,
  ) {
    await runner.query(
      `INSERT INTO sync_checkpoint (
        remote_node_code,
        last_event_id,
        last_received_cursor,
        last_received_at,
        last_applied_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (remote_node_code) DO UPDATE SET
        last_event_id = excluded.last_event_id,
        last_received_cursor = excluded.last_received_cursor,
        last_received_at = excluded.last_received_at,
        last_applied_at = excluded.last_applied_at`,
      [
        input.remoteNodeCode,
        input.lastEventId,
        input.cursor,
        input.receivedAt,
        input.appliedAt,
      ],
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
      this.pool.query(
        `UPDATE sync_outbox
         SET status = 'PENDING',
             attempt_count = 0,
             updated_at = $1,
             last_attempt_at = NULL,
             next_retry_at = NULL,
             failure_kind = NULL,
             last_http_status = NULL,
             sync_run_id = NULL,
             error_message = NULL
         WHERE status IN ('FAILED', 'DEAD_LETTER')
           AND COALESCE(failure_kind, '') NOT IN ('STALE_VERSION', 'UNKNOWN_AGGREGATE', 'INVALID_PAYLOAD', 'POLICY_REJECTED')`,
        [finishedAt],
      ),
      this.pool.query(
        `UPDATE sync_inbox
         SET status = 'RECEIVED',
             error_message = NULL
         WHERE status IN ('FAILED', 'DEAD_LETTER')`,
      ),
    ]);
    const upstreamRequeued = upstreamResult.rowCount ?? 0;
    const downstreamRequeued = downstreamResult.rowCount ?? 0;

    await this.insertRunLog({
      runKind: "REQUEUE",
      summary:
        upstreamRequeued > 0 || downstreamRequeued > 0
          ? shouldQueueEnterprise
            ? `Requeued ${upstreamRequeued + downstreamRequeued} eligible PostgreSQL failed item(s) for another enterprise pass.`
            : `Requeued ${upstreamRequeued + downstreamRequeued} eligible PostgreSQL standalone recovery item(s) for local review. Permanent conflicts remained unchanged.`
          : "No eligible PostgreSQL failed items were waiting for retry. Permanent conflicts remain available for support review.",
      startedAt,
    });

    return {
      message:
        upstreamRequeued > 0 || downstreamRequeued > 0
          ? shouldQueueEnterprise
            ? "Eligible failed items were moved back into active PostgreSQL queues. Permanent conflicts were left unchanged."
            : "Eligible standalone recovery items were moved back into PostgreSQL local review queues. Permanent conflicts were left unchanged."
          : "There were no eligible failed items to retry. Permanent conflicts were left unchanged.",
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async repairLegacyPosTransactionConflicts(repairedAt: string) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string;
        aggregate_id: string;
        idempotency_key: string;
        payload_json: string;
      }>(
        `SELECT id, aggregate_id, idempotency_key, payload_json
         FROM sync_outbox
         WHERE aggregate_type = 'posTransaction'
           AND event_type = 'pos.transaction.completed'
           AND status IN ('FAILED', 'DEAD_LETTER')
           AND failure_kind = 'STALE_VERSION'
           AND error_message LIKE '%from another store event%'
         FOR UPDATE`,
      );

      for (const row of result.rows) {
        let payload: StorePosTransactionCompletedPayload;

        try {
          payload = JSON.parse(
            row.payload_json,
          ) as StorePosTransactionCompletedPayload;
        } catch {
          continue;
        }

        if (isEcommercePosTransactionNumber(payload.transactionNo)) {
          await client.query(
            `UPDATE sync_outbox
             SET failure_kind = NULL,
                 error_message = NULL,
                 updated_at = $1
             WHERE id = $2`,
            [repairedAt, row.id],
          );
          continue;
        }

        if (!isLegacyPosTransactionNumber(payload.transactionNo)) {
          continue;
        }

        const oldTransactionNo = payload.transactionNo;
        const newTransactionNo = await this.allocatePosTransactionNumber(client);
        const transactionUpdate = await client.query(
          `UPDATE pos_transaction
           SET transaction_no = $1, updated_at = $2
           WHERE id = $3 AND transaction_no = $4`,
          [newTransactionNo, repairedAt, row.aggregate_id, oldTransactionNo],
        );

        if (transactionUpdate.rowCount !== 1) {
          continue;
        }

        payload.transactionNo = newTransactionNo;
        await client.query(
          `UPDATE pos_transaction
           SET source_transaction_no = $1, updated_at = $2
           WHERE source_transaction_id = $3 AND source_transaction_no = $4`,
          [newTransactionNo, repairedAt, row.aggregate_id, oldTransactionNo],
        );
        await client.query(
          `UPDATE serial_registry
           SET source_transaction_no = $1, updated_at = $2
           WHERE source_transaction_id = $3 AND source_transaction_no = $4`,
          [newTransactionNo, repairedAt, row.aggregate_id, oldTransactionNo],
        );
        await client.query(
          `UPDATE sales_order
           SET fulfilled_transaction_no = $1, updated_at = $2
           WHERE fulfilled_transaction_id = $3 AND fulfilled_transaction_no = $4`,
          [newTransactionNo, repairedAt, row.aggregate_id, oldTransactionNo],
        );
        await client.query(
          `UPDATE sync_outbox
           SET id = $1, idempotency_key = $2, payload_json = $3, updated_at = $4
           WHERE id = $5`,
          [
            randomUUID(),
            row.idempotency_key.replace(oldTransactionNo, newTransactionNo),
            JSON.stringify(payload),
            repairedAt,
            row.id,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeRecoveryTask(taskId: string): Promise<StoreSyncActionResult> {
    if (this.isStandaloneDeployment()) {
      await this.requireActiveOperatorSession({
        purpose: "completing standalone recovery tasks",
      });
    } else {
      await this.requireActiveOperatorSession({
        permissionCodes: ["sync.store.operate"],
      });
    }

    const startedAt = isoNow();
    const metadata = await this.metadata();
    const nodeCode = metadata.node_code ?? defaultStoreConfig.nodeCode;
    const shouldQueueEnterprise = !this.isStandaloneDeployment();
    let taskTitle = "Enterprise task";
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const taskResult = await client.query<RecoveryTaskRow>(
        `SELECT
          id,
          task_type,
          status,
          title,
          instructions,
          source_inbound_event_id,
          source_event_type,
          aggregate_type,
          aggregate_id,
          transaction_no,
          product_code,
          replacement_aggregate_type,
          replacement_aggregate_id,
          replacement_event_type,
          replacement_record_version,
          replacement_payload_json,
          operator_name,
          operator_note,
          store_note,
          requested_at,
          completed_at
         FROM sync_recovery_task
         WHERE id = $1
         LIMIT 1`,
        [taskId],
      );
      const task = taskResult.rows[0] ?? null;

      if (!task) {
        throw new Error(
          `Flash ERP could not find enterprise task "${taskId}" in the PostgreSQL store.`,
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
      const replacementPayload = parsePayloadJson(
        task.replacement_payload_json,
      ) as
        | Partial<
            StoreInventoryLedgerRecordedPayload &
              StoreInventoryTransferRecordedPayload
          >
        | Record<string, unknown>;
      const replacementRecordVersion = Math.max(
        1,
        asNumber(task.replacement_record_version),
      );
      let replacementIdempotencyKey = `${nodeCode}:${task.replacement_aggregate_type}:${task.replacement_aggregate_id}:task:${task.id}`;
      let storeNote =
        "Store operator acknowledged the enterprise task locally.";
      let taskOutcome: StoreSyncRecoveryTaskCompletedPayload["outcome"] =
        "RESENT_QUEUED";
      let runKind = "RECOVERY_TASK";
      let runSummary = shouldQueueEnterprise
        ? `${task.title} was acknowledged locally and queued both a replacement business packet and enterprise confirmation upstream.`
        : `${task.title} was acknowledged locally for standalone recovery without HQ sync work.`;

      if (task.task_type === "REQUEST_UPSTREAM_RESEND") {
        replacementIdempotencyKey = `${nodeCode}:${task.replacement_aggregate_type}:${task.replacement_aggregate_id}:resend:${task.id}`;
        storeNote = shouldQueueEnterprise
          ? task.transaction_no
            ? `Store operator reviewed ${task.transaction_no} locally and queued a clean resend follow-up from the desktop workspace.`
            : "Store operator reviewed the enterprise resend task locally and queued a clean resend follow-up."
          : task.transaction_no
            ? `Store operator reviewed ${task.transaction_no} locally for standalone recovery.`
            : "Store operator reviewed the recovery task locally for standalone mode.";
      } else if (task.task_type === "APPLY_INVENTORY_ADJUSTMENT") {
        const productCode =
          typeof replacementPayload.productCode === "string"
            ? replacementPayload.productCode
            : task.product_code;
        const movementType =
          typeof replacementPayload.movementType === "string"
            ? replacementPayload.movementType
            : null;
        const locationCode =
          typeof replacementPayload.inventoryLocationCode === "string"
            ? replacementPayload.inventoryLocationCode
            : await this.getDefaultSalesLocationCode();
        const quantity =
          typeof replacementPayload.quantity === "number"
            ? replacementPayload.quantity
            : null;
        const taskSerialNumbers = normalizeSerialNumbers(
          Array.isArray(
            (replacementPayload as { serialNumbers?: unknown }).serialNumbers,
          )
            ? ((
                replacementPayload as { serialNumbers?: unknown[] }
              ).serialNumbers?.filter(
                (entry): entry is string => typeof entry === "string",
              ) ?? [])
            : [],
        );

        if (
          !productCode ||
          !movementType ||
          !locationCode ||
          quantity === null
        ) {
          throw new Error(
            `Inventory adjustment task "${task.title}" is missing product, location, movement, or quantity details locally.`,
          );
        }

        const productResult = await client.query<ProductRow>(
          `SELECT id, product_code, product_name, unit_price, quantity_on_hand, is_serialized
           FROM product_snapshot
           WHERE product_code = $1
           LIMIT 1`,
          [productCode],
        );
        const product = productResult.rows[0] ?? null;

        if (!product) {
          throw new Error(
            `Flash ERP could not find local product "${productCode}" for inventory adjustment task "${task.title}".`,
          );
        }

        if (asBooleanFlag(product.is_serialized)) {
          const selectedSerialNumbers = validateSerializedLineInput({
            isSerialized: true,
            productName: product.product_name,
            quantity: Math.abs(quantity),
            serialNumbers: taskSerialNumbers,
          });

          await this.ensureInventoryTaskSerialNumbersNotReserved(
            productCode,
            product.product_name,
            selectedSerialNumbers,
            client,
          );

          if (movementType === "ADJUSTMENT_NEGATIVE") {
            ensureSerialSelectionWithinAllowedSet({
              productName: product.product_name,
              selectedSerialNumbers,
              allowedSerialNumbers:
                await this.listAvailableRegistrySerialNumbers(
                  productCode,
                  locationCode,
                  client,
                ),
            });
            await this.applyInventoryTaskSerialRegistryChange({
              productCode,
              serialNumbers: selectedSerialNumbers,
              inventoryLocationCode: locationCode,
              status: "ADJUSTED_OUT",
              sourceReferenceId: task.id,
              sourceReferenceLabel: task.title,
              updatedAt: finishedAt,
              runner: client,
            });
          } else {
            const conflictingSerials: string[] = [];

            for (const serialNumber of selectedSerialNumbers) {
              const row = await this.getSerialRegistryEntry(
                productCode,
                serialNumber,
                client,
              );

              if (row?.status === "AVAILABLE") {
                conflictingSerials.push(serialNumber);
              }
            }

            if (conflictingSerials.length > 0) {
              throw new Error(
                `Flash ERP cannot add serialized unit(s) ${conflictingSerials.join(", ")} for ${product.product_name} because they are already available in the local registry.`,
              );
            }

            await this.applyInventoryTaskSerialRegistryChange({
              productCode,
              serialNumbers: selectedSerialNumbers,
              inventoryLocationCode: locationCode,
              status: "AVAILABLE",
              sourceReferenceId: task.id,
              sourceReferenceLabel: task.title,
              updatedAt: finishedAt,
              runner: client,
            });
          }
        }

        const signedDelta = signedInventoryQuantity(
          movementType as StoreInventoryLedgerRecordedPayload["movementType"],
          quantity,
        );

        await client.query(
          "UPDATE product_snapshot SET quantity_on_hand = quantity_on_hand + $1, updated_at = $2 WHERE id = $3",
          [signedDelta, finishedAt, product.id],
        );
        await this.applyLocationBalanceDelta({
          locationCode,
          productCode,
          delta: signedDelta,
          updatedAt: finishedAt,
          runner: client,
        });

        replacementIdempotencyKey = `${nodeCode}:${task.replacement_aggregate_type}:${task.replacement_aggregate_id}:adjustment:${task.id}`;
        storeNote = `Store operator applied ${Math.abs(quantity).toFixed(3)} units of ${movementType.toLowerCase().replace(/_/g, " ")} for ${productCode} in ${locationCode} locally${
          taskSerialNumbers.length > 0
            ? ` using serials ${taskSerialNumbers.join(", ")}`
            : ""
        }${
          shouldQueueEnterprise
            ? " and queued the stock movement upstream."
            : " for standalone inventory recovery."
        }`;
        taskOutcome = "ADJUSTMENT_QUEUED";
        runKind = "INVENTORY_TASK";
        runSummary = shouldQueueEnterprise
          ? `${task.title} was applied locally, the product snapshot and location balance were updated, and the resulting inventory movement plus enterprise confirmation were queued upstream.`
          : `${task.title} was applied locally for standalone inventory recovery.`;
      } else if (task.task_type === "APPLY_COUNT_VARIANCE") {
        const productCode =
          typeof replacementPayload.productCode === "string"
            ? replacementPayload.productCode
            : task.product_code;
        const movementType =
          typeof replacementPayload.movementType === "string"
            ? replacementPayload.movementType
            : null;
        const locationCode =
          typeof replacementPayload.inventoryLocationCode === "string"
            ? replacementPayload.inventoryLocationCode
            : await this.getDefaultSalesLocationCode();
        const countedQuantity =
          typeof (replacementPayload as { countedQuantity?: unknown })
            .countedQuantity === "number"
            ? (replacementPayload as { countedQuantity: number })
                .countedQuantity
            : typeof replacementPayload.quantity === "number"
              ? replacementPayload.quantity
              : null;
        const taskSerialNumbers = normalizeSerialNumbers(
          Array.isArray(
            (replacementPayload as { serialNumbers?: unknown }).serialNumbers,
          )
            ? ((
                replacementPayload as { serialNumbers?: unknown[] }
              ).serialNumbers?.filter(
                (entry): entry is string => typeof entry === "string",
              ) ?? [])
            : [],
        );

        if (
          !productCode ||
          !locationCode ||
          movementType !== "COUNT_VARIANCE" ||
          countedQuantity === null
        ) {
          throw new Error(
            `Count variance task "${task.title}" is missing product, location, movement, or counted quantity details locally.`,
          );
        }

        const appliedCount = await this.applyLocalCountVariance({
          referenceId: task.id,
          referenceLabel: task.title,
          productCode,
          locationCode,
          countedQuantity,
          countedSerialNumbers: taskSerialNumbers,
          updatedAt: finishedAt,
          runner: client,
        });

        Object.assign(replacementPayload as Record<string, unknown>, {
          quantity: appliedCount.varianceQuantity,
        });

        replacementIdempotencyKey = `${nodeCode}:${task.replacement_aggregate_type}:${task.replacement_aggregate_id}:count-variance:${task.id}`;
        storeNote = `Store operator confirmed ${countedQuantity.toFixed(3)} units for ${productCode} in ${locationCode} locally${
          taskSerialNumbers.length > 0
            ? ` using serials ${taskSerialNumbers.join(", ")}`
            : ""
        }${
          shouldQueueEnterprise
            ? ` and queued a count variance of ${appliedCount.varianceQuantity.toFixed(3)} upstream.`
            : ` with a local count variance of ${appliedCount.varianceQuantity.toFixed(3)} for standalone recovery.`
        }`;
        taskOutcome = "COUNT_VARIANCE_QUEUED";
        runKind = "INVENTORY_TASK";
        runSummary = shouldQueueEnterprise
          ? `${task.title} was applied locally, the counted stock replaced the previous location quantity, and the resulting count variance plus enterprise confirmation were queued upstream.`
          : `${task.title} was applied locally and the counted stock replaced the previous standalone location quantity.`;
      } else if (task.task_type === "APPLY_STOCK_TRANSFER") {
        const transferPayload =
          replacementPayload as Partial<StoreInventoryTransferRecordedPayload>;
        const productCode =
          typeof transferPayload.productCode === "string"
            ? transferPayload.productCode
            : task.product_code;
        const sourceLocationCode =
          typeof transferPayload.sourceInventoryLocationCode === "string"
            ? transferPayload.sourceInventoryLocationCode
            : null;
        const destinationLocationCode =
          typeof transferPayload.destinationInventoryLocationCode === "string"
            ? transferPayload.destinationInventoryLocationCode
            : null;
        const quantity =
          typeof transferPayload.quantity === "number"
            ? transferPayload.quantity
            : null;
        const taskSerialNumbers = normalizeSerialNumbers(
          Array.isArray(
            (transferPayload as { serialNumbers?: unknown }).serialNumbers,
          )
            ? ((
                transferPayload as { serialNumbers?: unknown[] }
              ).serialNumbers?.filter(
                (entry): entry is string => typeof entry === "string",
              ) ?? [])
            : [],
        );

        if (
          !productCode ||
          !sourceLocationCode ||
          !destinationLocationCode ||
          sourceLocationCode === destinationLocationCode ||
          quantity === null ||
          quantity <= 0
        ) {
          throw new Error(
            `Stock transfer task "${task.title}" is missing product, source, destination, or quantity details locally.`,
          );
        }

        const productResult = await client.query<ProductRow>(
          `SELECT id, product_code, product_name, unit_price, quantity_on_hand, is_serialized
           FROM product_snapshot
           WHERE product_code = $1
           LIMIT 1`,
          [productCode],
        );
        const product = productResult.rows[0] ?? null;

        if (!product) {
          throw new Error(
            `Flash ERP could not find local product "${productCode}" for stock transfer task "${task.title}".`,
          );
        }

        if (asBooleanFlag(product.is_serialized)) {
          const selectedSerialNumbers = validateSerializedLineInput({
            isSerialized: true,
            productName: product.product_name,
            quantity,
            serialNumbers: taskSerialNumbers,
          });

          await this.ensureInventoryTaskSerialNumbersNotReserved(
            productCode,
            product.product_name,
            selectedSerialNumbers,
            client,
          );
          ensureSerialSelectionWithinAllowedSet({
            productName: product.product_name,
            selectedSerialNumbers,
            allowedSerialNumbers: await this.listAvailableRegistrySerialNumbers(
              productCode,
              sourceLocationCode,
              client,
            ),
          });
          await this.applyInventoryTaskSerialRegistryChange({
            productCode,
            serialNumbers: selectedSerialNumbers,
            inventoryLocationCode: destinationLocationCode,
            status: "AVAILABLE",
            sourceReferenceId: task.id,
            sourceReferenceLabel: task.title,
            updatedAt: finishedAt,
            runner: client,
          });
        }

        await this.applyLocationBalanceDelta({
          locationCode: sourceLocationCode,
          productCode,
          delta: quantity * -1,
          updatedAt: finishedAt,
          runner: client,
        });
        await this.applyLocationBalanceDelta({
          locationCode: destinationLocationCode,
          productCode,
          delta: quantity,
          updatedAt: finishedAt,
          runner: client,
        });

        replacementIdempotencyKey = `${nodeCode}:${task.replacement_aggregate_type}:${task.replacement_aggregate_id}:transfer:${task.id}`;
        storeNote = `Store operator moved ${quantity.toFixed(3)} units of ${productCode} from ${sourceLocationCode} to ${destinationLocationCode} locally${
          taskSerialNumbers.length > 0
            ? ` using serials ${taskSerialNumbers.join(", ")}`
            : ""
        }${
          shouldQueueEnterprise
            ? " and queued the paired transfer movement upstream."
            : " for standalone transfer recovery."
        }`;
        taskOutcome = "TRANSFER_QUEUED";
        runKind = "INVENTORY_TASK";
        runSummary = shouldQueueEnterprise
          ? `${task.title} was completed locally, source and destination location balances were updated, aggregate store stock stayed unchanged, and the paired transfer movement plus enterprise confirmation were queued upstream.`
          : `${task.title} was completed locally for standalone transfer recovery.`;
      } else {
        throw new Error(
          `Flash ERP does not support enterprise task type "${task.task_type}" locally.`,
        );
      }

      const taskCompletionPayload: StoreSyncRecoveryTaskCompletedPayload = {
        taskId: task.id,
        taskType:
          task.task_type as StoreSyncRecoveryTaskCompletedPayload["taskType"],
        sourceInboundEventId: task.source_inbound_event_id,
        sourceEventType: task.source_event_type,
        replacementEventId,
        replacementIdempotencyKey,
        completedAt: finishedAt,
        outcome: taskOutcome,
        storeNote,
      };

      await client.query(
        "UPDATE sync_recovery_task SET status = 'COMPLETED', store_note = $1, completed_at = $2, updated_at = $2 WHERE id = $3",
        [storeNote, finishedAt, task.id],
      );
      if (shouldQueueEnterprise) {
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', 0, $8, $9, $9)`,
          [
            replacementEventId,
            ENTERPRISE_NODE_CODE,
            task.replacement_aggregate_type,
            task.replacement_aggregate_id,
            task.replacement_event_type,
            replacementIdempotencyKey,
            JSON.stringify(replacementPayload),
            replacementRecordVersion,
            finishedAt,
          ],
        );
        await client.query(
          `INSERT INTO sync_outbox (
            id,
            target_node_code,
            aggregate_type,
            aggregate_id,
            event_type,
            idempotency_key,
            payload_json,
            status,
            attempt_count,
            record_version,
            created_at,
            updated_at
          ) VALUES ($1, $2, 'syncTask', $3, 'sync.task.completed', $4, $5, 'PENDING', 0, 1, $6, $6)`,
          [
            randomUUID(),
            ENTERPRISE_NODE_CODE,
            task.id,
            `${nodeCode}:syncTask:${task.id}:completed`,
            JSON.stringify(taskCompletionPayload),
            completionQueuedAt,
          ],
        );
      }
      await client.query(
        `INSERT INTO app_metadata (key, value)
         VALUES ('last_local_write_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [finishedAt],
      );
      await client.query(
        `INSERT INTO sync_run_log (
          id,
          run_kind,
          result,
          summary,
          upstream_processed,
          downstream_applied,
          started_at,
          finished_at
        ) VALUES ($1, $2, 'SUCCESS', $3, $4, 0, $5, $6)`,
        [
          randomUUID(),
          runKind,
          runSummary,
          shouldQueueEnterprise ? 2 : 0,
          startedAt,
          finishedAt,
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    return {
      message: shouldQueueEnterprise
        ? `${taskTitle} was completed locally and queued both a replacement packet and enterprise confirmation.`
        : `${taskTitle} was completed locally for standalone recovery.`,
      snapshot: await this.getSyncSnapshot(),
    };
  }

  private async setMetadata(
    key: string,
    value: string,
    runner: DbRunner = this.pool,
  ) {
    await runner.query(
      `INSERT INTO app_metadata (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  private async insertRunLog(input: {
    runKind: string;
    summary: string;
    startedAt: string;
  }) {
    await this.pool.query(
      `INSERT INTO sync_run_log (
        id,
        run_kind,
        result,
        summary,
        upstream_processed,
        downstream_applied,
        started_at,
        finished_at
      ) VALUES ($1, $2, 'SUCCESS', $3, 0, 0, $4, $4)`,
      [randomUUID(), input.runKind, input.summary, input.startedAt],
    );
  }

  private async scalar(sql: string, params: unknown[] = []) {
    const result = await this.pool.query<{ value: string | number }>(
      sql,
      params,
    );
    return Math.trunc(asNumber(result.rows[0]?.value));
  }

  private async queueMetrics(): Promise<StoreQueueMetrics> {
    const [
      upstreamQueued,
      upstreamInFlight,
      downstreamQueued,
      outboxDead,
      inboxDead,
    ] = await Promise.all([
      this.scalar(
        "SELECT count(*) AS value FROM sync_outbox WHERE status = 'PENDING'",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM sync_outbox WHERE status = 'IN_FLIGHT'",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM sync_inbox WHERE status IN ('RECEIVED', 'PENDING')",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM sync_outbox WHERE status IN ('FAILED', 'DEAD_LETTER')",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM sync_inbox WHERE status IN ('FAILED', 'DEAD_LETTER')",
      ),
    ]);

    return {
      upstreamQueued,
      upstreamInFlight,
      downstreamQueued,
      deadLetter: outboxDead + inboxDead,
    };
  }

  private async getSyncDeadLetters(): Promise<StoreSyncDeadLetterSummary[]> {
    const result = await this.pool.query<SyncDeadLetterRow>(
      `SELECT
        id,
        'UPSTREAM' AS direction,
        status,
        aggregate_type,
        aggregate_id,
        event_type,
        target_node_code AS node_code,
        attempt_count,
        failure_kind,
        last_http_status,
        last_attempt_at,
        next_retry_at,
        sync_run_id,
        payload_json,
        error_message,
        created_at,
        updated_at
       FROM sync_outbox
       WHERE status IN ('FAILED', 'DEAD_LETTER')
       UNION ALL
       SELECT
        id,
        'DOWNSTREAM' AS direction,
        status,
        aggregate_type,
        aggregate_id,
        event_type,
        source_node_code AS node_code,
        0 AS attempt_count,
        NULL AS failure_kind,
        NULL AS last_http_status,
        NULL AS last_attempt_at,
        NULL AS next_retry_at,
        NULL AS sync_run_id,
        payload_json,
        error_message,
        received_at AS created_at,
        COALESCE(applied_at, received_at) AS updated_at
       FROM sync_inbox
       WHERE status IN ('FAILED', 'DEAD_LETTER')
       ORDER BY updated_at DESC
       LIMIT 20`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      status: row.status,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      nodeCode: row.node_code,
      attemptCount: Math.trunc(asNumber(row.attempt_count)),
      failureKind: row.failure_kind,
      lastHttpStatus:
        row.last_http_status == null
          ? null
          : Math.trunc(asNumber(row.last_http_status)),
      lastAttemptAt: row.last_attempt_at,
      nextRetryAt: row.next_retry_at,
      syncRunId: row.sync_run_id,
      errorMessage: row.error_message,
      diagnosticSummary: describeSyncEventPayload(
        row.aggregate_type,
        row.event_type,
        row.payload_json,
      ),
      payloadPreview: formatPayloadPreview(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getRecentSyncEvents(): Promise<StoreSyncEventDetail[]> {
    const result = await this.pool.query<SyncEventDetailRow>(
      `SELECT
        id,
        'UPSTREAM' AS direction,
        status,
        aggregate_type,
        aggregate_id,
        event_type,
        target_node_code AS node_code,
        attempt_count,
        failure_kind,
        last_http_status,
        last_attempt_at,
        next_retry_at,
        sync_run_id,
        payload_json,
        error_message,
        created_at,
        last_attempt_at AS applied_at,
        acknowledged_at,
        COALESCE(acknowledged_at, last_attempt_at, updated_at, created_at) AS updated_at
       FROM sync_outbox
       UNION ALL
       SELECT
        id,
        'DOWNSTREAM' AS direction,
        status,
        aggregate_type,
        aggregate_id,
        event_type,
        source_node_code AS node_code,
        0 AS attempt_count,
        NULL AS failure_kind,
        NULL AS last_http_status,
        NULL AS last_attempt_at,
        NULL AS next_retry_at,
        NULL AS sync_run_id,
        payload_json,
        error_message,
        received_at AS created_at,
        applied_at,
        acknowledged_at,
        COALESCE(acknowledged_at, applied_at, received_at) AS updated_at
       FROM sync_inbox
       ORDER BY updated_at DESC
       LIMIT 30`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      status: row.status,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      nodeCode: row.node_code,
      attemptCount: Math.trunc(asNumber(row.attempt_count)),
      failureKind: row.failure_kind,
      lastHttpStatus:
        row.last_http_status == null
          ? null
          : Math.trunc(asNumber(row.last_http_status)),
      lastAttemptAt: row.last_attempt_at,
      nextRetryAt: row.next_retry_at,
      syncRunId: row.sync_run_id,
      summary: describeSyncEventPayload(
        row.aggregate_type,
        row.event_type,
        row.payload_json,
      ),
      errorMessage: row.error_message,
      diagnosticSummary: describeSyncEventPayload(
        row.aggregate_type,
        row.event_type,
        row.payload_json,
      ),
      payloadPreview: formatPayloadPreview(row.payload_json),
      createdAt: row.created_at,
      appliedAt: row.applied_at,
      acknowledgedAt: row.acknowledged_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getRecoveryTaskSummaries(): Promise<
    StoreRecoveryTaskSummary[]
  > {
    const result = await this.pool.query<RecoveryTaskSnapshotRow>(
      `SELECT
        task.id,
        task.task_type,
        task.status,
        task.title,
        task.instructions,
        task.source_inbound_event_id,
        task.source_event_type,
        task.aggregate_type,
        task.aggregate_id,
        task.transaction_no,
        task.product_code,
        task.replacement_aggregate_type,
        task.replacement_aggregate_id,
        task.replacement_event_type,
        task.replacement_record_version,
        task.replacement_payload_json,
        task.operator_name,
        task.operator_note,
        task.store_note,
        task.requested_at,
        task.completed_at,
        product.product_name,
        product.department_code,
        department.department_name,
        product.category_code,
        category.category_name,
        product.subcategory,
        product.is_serialized
       FROM sync_recovery_task AS task
       LEFT JOIN product_snapshot AS product
         ON product.product_code = task.product_code
       LEFT JOIN product_department_snapshot AS department
         ON department.department_code = product.department_code
       LEFT JOIN product_category_snapshot AS category
         ON category.category_code = product.category_code
       ORDER BY CASE WHEN task.status = 'OPEN' THEN 0 ELSE 1 END, task.requested_at DESC
       LIMIT 6`,
    );

    return result.rows.map<StoreRecoveryTaskSummary>((task) => {
      const replacementPayload = parsePayloadJson(
        task.replacement_payload_json,
      ) as Partial<
        StoreInventoryLedgerRecordedPayload &
          StoreInventoryTransferRecordedPayload
      >;
      const sourceLocationCode =
        typeof replacementPayload.inventoryLocationCode === "string"
          ? replacementPayload.inventoryLocationCode
          : typeof replacementPayload.sourceInventoryLocationCode === "string"
            ? replacementPayload.sourceInventoryLocationCode
            : null;
      const targetLocationCode =
        typeof replacementPayload.destinationInventoryLocationCode === "string"
          ? replacementPayload.destinationInventoryLocationCode
          : null;

      return {
        id: task.id,
        taskType: task.task_type,
        status: task.status,
        title: task.title,
        instructions: task.instructions,
        transactionNo: task.transaction_no,
        productCode: task.product_code,
        productName: task.product_name,
        departmentCode: task.department_code,
        departmentName: task.department_name,
        categoryCode: task.category_code,
        categoryName: task.category_name,
        subcategory: task.subcategory,
        isSerialized: asBooleanFlag(task.is_serialized ?? 0),
        locationCode: sourceLocationCode,
        targetLocationCode,
        movementType:
          typeof replacementPayload.movementType === "string"
            ? replacementPayload.movementType
            : null,
        quantity:
          typeof replacementPayload.quantity === "number"
            ? replacementPayload.quantity
            : typeof (replacementPayload as { countedQuantity?: unknown })
                  .countedQuantity === "number"
              ? (replacementPayload as { countedQuantity: number })
                  .countedQuantity
              : null,
        serialNumbers: normalizeSerialNumbers(
          Array.isArray(
            (replacementPayload as { serialNumbers?: unknown }).serialNumbers,
          )
            ? ((
                replacementPayload as { serialNumbers?: unknown[] }
              ).serialNumbers?.filter(
                (entry): entry is string => typeof entry === "string",
              ) ?? [])
            : [],
        ),
        operatorName: task.operator_name,
        operatorNote: task.operator_note,
        storeNote: task.store_note,
        requestedAt: task.requested_at,
        completedAt: task.completed_at,
        sourceInboundEventId: task.source_inbound_event_id,
      };
    });
  }

  private async operationsMetrics(): Promise<StoreOperationsMetrics> {
    const [
      completedSales,
      parkedSales,
      openShifts,
      connectedTerminals,
      openSalesOrders,
      catalogItems,
      barcodeLinks,
      availableUnits,
      recentCloseouts,
      recentBankingDeposits,
      bankedAmount,
      pendingBankingAmount,
      openPurchaseOrders,
      openInterStoreTransfers,
      openStockCountSessions,
      openRecoveryTasks,
    ] = await Promise.all([
      this.scalar(
        "SELECT count(*) AS value FROM pos_transaction WHERE status = 'COMPLETED'",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM pos_transaction WHERE status = 'PARKED'",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM pos_shift WHERE status = 'OPEN'",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM terminal_connection WHERE last_seen_at >= $1",
        [minutesAgo(5)],
      ),
      this.scalar(
        "SELECT count(*) AS value FROM sales_order WHERE status = 'OPEN'",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM product_snapshot WHERE COALESCE(catalog_membership_active, 1) = 1",
      ),
      this.scalar("SELECT count(*) AS value FROM barcode_snapshot"),
      this.scalar(
        "SELECT COALESCE(sum(quantity_on_hand), 0) AS value FROM product_snapshot WHERE COALESCE(catalog_membership_active, 1) = 1",
      ),
      this.scalar("SELECT count(*) AS value FROM eod_reconciliation"),
      this.scalar("SELECT count(*) AS value FROM banking_deposit"),
      this.scalar(
        "SELECT COALESCE(sum(amount), 0) AS value FROM banking_deposit",
      ),
      this.scalar(
        `SELECT COALESCE(sum(reconciliation.declared_cash_amount), 0) - COALESCE((
          SELECT sum(deposit.amount)
          FROM banking_deposit AS deposit
        ), 0) AS value
        FROM eod_reconciliation AS reconciliation`,
      ),
      this.scalar(
        "SELECT count(*) AS value FROM purchase_order_snapshot WHERE status IN ('COMMITTED', 'PART_RECEIVED')",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM inter_store_transfer_snapshot WHERE status IN ('REQUESTED', 'PART_ISSUED', 'ISSUED', 'PART_RECEIVED')",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM stock_count_session WHERE status IN ('DRAFT', 'SUBMITTED')",
      ),
      this.scalar(
        "SELECT count(*) AS value FROM sync_recovery_task WHERE status = 'OPEN'",
      ),
    ]);

    return {
      completedSales,
      parkedSales,
      openShifts,
      connectedTerminals,
      openSalesOrders,
      catalogItems,
      barcodeLinks,
      availableUnits,
      openPurchaseOrders,
      openInterStoreTransfers,
      openStockCountSessions,
      recentCloseouts,
      recentBankingDeposits,
      bankedAmount,
      pendingBankingAmount,
      openRecoveryTasks,
    };
  }

  private getHealth(
    queueMetrics: StoreQueueMetrics,
    lastSyncAt: string | null,
    standalone = false,
  ): StoreSyncHealth {
    if (standalone) {
      if (queueMetrics.deadLetter > 0) {
        return "attention";
      }

      if (queueMetrics.upstreamQueued > 0 || queueMetrics.downstreamQueued > 0) {
        return "lagging";
      }

      return "healthy";
    }

    const lastSyncMinutes = minutesSince(lastSyncAt);

    if (
      queueMetrics.deadLetter > 0 ||
      lastSyncMinutes >= 120 ||
      queueMetrics.upstreamQueued >= 6 ||
      queueMetrics.downstreamQueued >= 5
    ) {
      return "attention";
    }

    if (
      lastSyncMinutes >= 30 ||
      queueMetrics.upstreamQueued > 0 ||
      queueMetrics.downstreamQueued > 0
    ) {
      return "lagging";
    }

    return "healthy";
  }

  async getSyncSnapshot(): Promise<StoreSyncSnapshot> {
    const metadata = await this.metadata();
    const queueMetrics = await this.queueMetrics();
    const operationsMetrics = await this.operationsMetrics();
    const standaloneBootstrapAvailable =
      this.isStandaloneDeployment() &&
      Number(
        (
          await this.pool.query<{ value: string | number }>(
            "SELECT count(*) AS value FROM retail_user_snapshot",
          )
        ).rows[0]?.value ?? 0,
      ) === 0;
    const activeShift = await this.getOpenShiftRow();
    const openShiftRows = await this.getShiftRows("WHERE status = 'OPEN'");
    const recentClosedShiftRows = await this.getShiftRows(
      "WHERE status = 'CLOSED'",
    );
    const terminalResult = await this.pool.query<{
      terminal_code: string;
      client_name: string | null;
      first_seen_at: string;
      last_seen_at: string;
      request_count: string | number;
      last_method: string | null;
      remote_address: string | null;
    }>(
      `SELECT terminal_code, client_name, first_seen_at, last_seen_at, request_count, last_method, remote_address
       FROM terminal_connection
       ORDER BY last_seen_at DESC, terminal_code ASC
       LIMIT 24`,
    );
    const recentRunsResult = await this.pool.query<{
      id: string;
      run_kind: string;
      result: string;
      summary: string;
      upstream_processed: string | number;
      downstream_applied: string | number;
      started_at: string;
      finished_at: string | null;
    }>(
      `SELECT id, run_kind, result, summary, upstream_processed, downstream_applied, started_at, finished_at
       FROM sync_run_log
       ORDER BY started_at DESC
       LIMIT 4`,
    );
    const storeUsersResult = await this.pool.query<RetailUserRow>(
      `SELECT
        id,
        login_id,
        email,
        display_name,
        account_status,
        home_store_code,
        home_store_name,
        role_codes_json,
        role_names_json,
        permission_codes_json,
        password_hash,
        updated_at
      FROM retail_user_snapshot
      ORDER BY display_name ASC
      LIMIT 200`,
    );
    const [
      inventoryLocations,
      productDepartments,
      productCategories,
      availableTenderMethods,
      availableBankAccounts,
      availableSuppliers,
      priceListEntries,
      promotions,
      activeBasket,
      recentTransactions,
      activeShiftSummary,
      openShiftSummaries,
      recentClosedShiftSummaries,
      salesOrders,
      recentEodReconciliations,
      recentBankingDeposits,
      recentCustomerAccountEntries,
      transferRequestTargets,
      transferRequestDrafts,
      stockCountSessions,
      recentGoodsReceipts,
      recentSupplierReturns,
      syncDeadLetters,
      recentSyncEvents,
      recoveryTasks,
    ] = await Promise.all([
      this.getInventoryLocationSummaries(),
      this.getProductDepartmentSummaries(),
      this.getProductCategorySummaries(),
      this.listActiveTenderMethods(),
      this.listActiveBankAccounts(),
      this.listActiveSuppliers(),
      this.listPriceListEntries(),
      this.listPromotions(),
      this.getActiveBasketSummary(),
      this.getRecentTransactions(),
      activeShift ? this.toShiftSummary(activeShift) : Promise.resolve(null),
      Promise.all(openShiftRows.map((shift) => this.toShiftSummary(shift))),
      Promise.all(
        recentClosedShiftRows.map((shift) => this.toShiftSummary(shift)),
      ),
      this.getSalesOrderSummaries(),
      this.getRecentEodReconciliationSummaries(),
      this.getRecentBankingDepositSummaries(),
      this.getRecentCustomerAccountEntries(),
      this.getTransferRequestTargetSummaries(),
      this.getTransferRequestDraftSummaries(),
      this.getStockCountSessionSummaries(),
      this.getRecentGoodsReceiptSummaries(),
      this.getRecentSupplierReturnSummaries(),
      this.getSyncDeadLetters(),
      this.getRecentSyncEvents(),
      this.getRecoveryTaskSummaries(),
    ]);
    const parkedBaskets = await this.getParkedBasketSummaries(
      activeBasket?.transactionId ?? null,
    );
    const recentStoreShifts = [
      ...openShiftSummaries,
      ...recentClosedShiftSummaries,
    ].slice(0, 20);
    const lastSyncAt = metadata.last_sync_at ?? null;
    const syncPolicy = readStoreSyncPolicyFromMetadata(metadata);
    const standalone = this.isStandaloneDeployment();
    const health =
      !standalone && !this.syncBaseUrl
        ? "attention"
        : this.getHealth(queueMetrics, lastSyncAt, standalone);

    return {
      deploymentMode: this.deploymentMode,
      standaloneBootstrapAvailable,
      retailOrgName:
        metadata.retail_org_name ?? defaultStoreConfig.retailOrgName,
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
      touchModeEnabled:
        metadata.touch_mode_enabled == null
          ? true
          : metadata.touch_mode_enabled === "1",
      catalogPolicy: readCatalogPolicy(metadata.catalog_policy_json),
      terminalCode: this.getTerminalCode(),
      nodeCode: metadata.node_code ?? defaultStoreConfig.nodeCode,
      enterpriseBaseUrl: this.syncBaseUrl,
      databasePath: this.databasePath,
      offlineReady: true,
      health,
      lastLocalWriteAt: metadata.last_local_write_at ?? null,
      lastSyncAt,
      lastEnterpriseAckAt: null,
      syncPolicy,
      queueMetrics,
      operationsMetrics,
      recentRuns: recentRunsResult.rows.map<StoreSyncRun>((run) => ({
        id: run.id,
        runKind: run.run_kind,
        result: run.result,
        summary: run.summary,
        upstreamProcessed: Math.trunc(asNumber(run.upstream_processed)),
        downstreamApplied: Math.trunc(asNumber(run.downstream_applied)),
        startedAt: run.started_at,
        finishedAt: run.finished_at,
      })),
      syncDeadLetters,
      recentSyncEvents,
      connectedTerminals:
        terminalResult.rows.map<StoreTerminalConnectionSummary>((row) => ({
          terminalCode: row.terminal_code,
          clientName: row.client_name,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          requestCount: Math.trunc(asNumber(row.request_count)),
          lastMethod: row.last_method,
          remoteAddress: row.remote_address,
          online: minutesSince(row.last_seen_at) <= 5,
        })),
      recentTransactions,
      activeShift: activeShiftSummary,
      openShifts: openShiftSummaries,
      recentClosedShifts: recentClosedShiftSummaries,
      recentStoreShifts,
      activeOperatorSession: await this.getActiveOperatorSessionSummary(),
      recoveryTasks,
      activeBasket,
      parkedBaskets,
      salesOrders,
      recentEodReconciliations,
      recentBankingDeposits,
      inventoryLocations,
      transferRequestTargets,
      transferRequestDrafts,
      stockCountSessions,
      recentGoodsReceipts,
      recentSupplierReturns,
      recentCustomerAccountEntries,
      storeUsers: storeUsersResult.rows.map((user) =>
        this.toStoreUserSummary(user),
      ),
      productDepartments,
      productCategories,
      availableTenderMethods,
      availableBankAccounts,
      availableSuppliers,
      priceListEntries,
      promotions,
      passwordPolicy: this.getPasswordPolicySummary(metadata),
      optionSettings: this.getOptionSettingsSummary(metadata),
      loyaltySettings: this.getLoyaltySettingsSummary(metadata),
      receiptSettings: this.getReceiptSettingsSummary(metadata),
      receiptPrinterSettings: this.getReceiptPrinterSettingsSummary(metadata),
      activityFeed: standalone
        ? [
            `PostgreSQL standalone store node is serving metadata, terminal heartbeat, operator sessions, shifts, catalog, customers, tender setup, inventory visibility, active basket edits, sale checkout, receipt-linked returns/exchanges, account payments, sales orders, EOD banking, purchasing receipts, supplier returns, transfer issue/receipt, transfer requests, stock counts, recovery tasks (${operationsMetrics.openRecoveryTasks} open), local queue controls, receipt printing, and serial status updates.`,
            "Standalone mode is active; operational documents stay in the PostgreSQL store database and local reports without HQ sync.",
          ]
        : [
            `PostgreSQL store node is serving metadata, terminal heartbeat, operator sessions, shifts, catalog, customers, tender setup, inventory visibility, active basket edits, sale checkout, receipt-linked returns/exchanges, account payments, sales orders, EOD banking, purchasing receipts, supplier returns, transfer issue/receipt, transfer requests, stock counts, recovery tasks (${operationsMetrics.openRecoveryTasks} open), local queue controls, receipt printing, serial status updates, and checkout outbox events.`,
            this.syncBaseUrl
              ? "Real enterprise push/pull sync is enabled for this PostgreSQL desktop node."
              : "HQ Managed mode is selected but no HQ sync URL is configured, so upload/download sync is blocked until Desktop setup is corrected.",
          ],
      generatedAt: isoNow(),
    };
  }

  async getSyncStatusSnapshot(): Promise<StoreSyncSnapshot> {
    return this.getSyncSnapshot();
  }
}
