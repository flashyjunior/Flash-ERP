// String-backed enum shims for database providers that do not generate Prisma enum exports.
// Keep these names aligned with prisma/schema.prisma values and the legacy PostgreSQL enum names.
const makeEnum = (value) => Object.freeze(value);
export const RecordStatus = makeEnum({
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
    ARCHIVED: "ARCHIVED",
    DELETED: "DELETED",
});
export const UserAccountStatus = makeEnum({
    INVITED: "INVITED",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DISABLED: "DISABLED",
});
export const CustomerType = makeEnum({
    INDIVIDUAL: "INDIVIDUAL",
    CORPORATE: "CORPORATE",
    WHOLESALE: "WHOLESALE",
    STAFF: "STAFF",
    OTHER: "OTHER",
});
export const CustomerAccountEntryType = makeEnum({
    ACCOUNT_PAYMENT: "ACCOUNT_PAYMENT",
    POS_RECEIVABLE_CHARGE: "POS_RECEIVABLE_CHARGE",
    POS_RECEIVABLE_SETTLEMENT: "POS_RECEIVABLE_SETTLEMENT",
    POS_LOYALTY_ACCRUAL: "POS_LOYALTY_ACCRUAL",
    POS_LOYALTY_REVERSAL: "POS_LOYALTY_REVERSAL",
    MANUAL_RECEIVABLE_ADJUSTMENT: "MANUAL_RECEIVABLE_ADJUSTMENT",
    MANUAL_LOYALTY_ADJUSTMENT: "MANUAL_LOYALTY_ADJUSTMENT",
});
export const SyncNodeType = makeEnum({
    ENTERPRISE: "ENTERPRISE",
    STORE_DESKTOP: "STORE_DESKTOP",
    MOBILE: "MOBILE",
});
export const SyncDirection = makeEnum({
    UPSTREAM: "UPSTREAM",
    DOWNSTREAM: "DOWNSTREAM",
    BIDIRECTIONAL: "BIDIRECTIONAL",
});
export const SyncEventStatus = makeEnum({
    PENDING: "PENDING",
    IN_FLIGHT: "IN_FLIGHT",
    ACKNOWLEDGED: "ACKNOWLEDGED",
    FAILED: "FAILED",
    DEAD_LETTER: "DEAD_LETTER",
});
export const SecurityLogKind = makeEnum({
    AUDIT: "AUDIT",
    SECURITY: "SECURITY",
});
export const SecurityLogSeverity = makeEnum({
    INFO: "INFO",
    WARNING: "WARNING",
    ERROR: "ERROR",
    CRITICAL: "CRITICAL",
});
export const SyncOperatorActionType = makeEnum({
    REPLAY_PACKET: "REPLAY_PACKET",
    REPLAY_ESCALATIONS: "REPLAY_ESCALATIONS",
    REPROCESS_INBOUND_PACKET: "REPROCESS_INBOUND_PACKET",
    REQUEST_UPSTREAM_RESEND: "REQUEST_UPSTREAM_RESEND",
    REQUEST_INVENTORY_ADJUSTMENT: "REQUEST_INVENTORY_ADJUSTMENT",
    REQUEST_COUNT_VARIANCE: "REQUEST_COUNT_VARIANCE",
    REQUEST_STOCK_TRANSFER: "REQUEST_STOCK_TRANSFER",
    PUBLISH_LOCATION_TOPOLOGY: "PUBLISH_LOCATION_TOPOLOGY",
    STORE_TASK_COMPLETED: "STORE_TASK_COMPLETED",
});
export const LocationType = makeEnum({
    STORE_FLOOR: "STORE_FLOOR",
    BACKROOM: "BACKROOM",
    WAREHOUSE: "WAREHOUSE",
    RETURNS: "RETURNS",
    HOLD: "HOLD",
    TRANSIT: "TRANSIT",
});
export const InventoryMovementType = makeEnum({
    OPENING_BALANCE: "OPENING_BALANCE",
    GOODS_RECEIPT: "GOODS_RECEIPT",
    RETURN_TO_VENDOR: "RETURN_TO_VENDOR",
    STOCK_TRANSFER_OUT: "STOCK_TRANSFER_OUT",
    STOCK_TRANSFER_IN: "STOCK_TRANSFER_IN",
    SALE: "SALE",
    RETURN: "RETURN",
    ADJUSTMENT_POSITIVE: "ADJUSTMENT_POSITIVE",
    ADJUSTMENT_NEGATIVE: "ADJUSTMENT_NEGATIVE",
    COUNT_VARIANCE: "COUNT_VARIANCE",
});
export const SerialInventoryStatus = makeEnum({
    AVAILABLE: "AVAILABLE",
    IN_TRANSIT: "IN_TRANSIT",
    SOLD: "SOLD",
    ADJUSTED_OUT: "ADJUSTED_OUT",
});
export const PosShiftStatus = makeEnum({
    OPEN: "OPEN",
    CLOSED: "CLOSED",
    POSTED: "POSTED",
    VOIDED: "VOIDED",
});
export const PosTransactionType = makeEnum({
    SALE: "SALE",
    RETURN: "RETURN",
    EXCHANGE: "EXCHANGE",
});
export const PosTransactionLineIntent = makeEnum({
    SALE: "SALE",
    RETURN: "RETURN",
});
export const PosTransactionStatus = makeEnum({
    PARKED: "PARKED",
    COMPLETED: "COMPLETED",
    VOIDED: "VOIDED",
    REFUNDED: "REFUNDED",
});
export const SalesOrderStatus = makeEnum({
    OPEN: "OPEN",
    FULFILLED: "FULFILLED",
    CANCELLED: "CANCELLED",
});
export const PaymentMethod = makeEnum({
    CASH: "CASH",
    CARD: "CARD",
    BANK_TRANSFER: "BANK_TRANSFER",
    MOBILE_MONEY: "MOBILE_MONEY",
    STORE_CREDIT: "STORE_CREDIT",
    GIFT_CARD: "GIFT_CARD",
    OTHER: "OTHER",
});
export const PaymentGatewayProvider = makeEnum({
    PAYSTACK: "PAYSTACK",
    FLUTTERWAVE: "FLUTTERWAVE",
    OTHER: "OTHER",
});
export const PaymentGatewayMode = makeEnum({
    TEST: "TEST",
    LIVE: "LIVE",
});
export const PaymentGatewayStatus = makeEnum({
    DISABLED: "DISABLED",
    READY: "READY",
    NEEDS_REVIEW: "NEEDS_REVIEW",
});
export const GlAccountType = makeEnum({
    ASSET: "ASSET",
    LIABILITY: "LIABILITY",
    EQUITY: "EQUITY",
    REVENUE: "REVENUE",
    COST_OF_SALES: "COST_OF_SALES",
    EXPENSE: "EXPENSE",
});
export const GlNormalBalance = makeEnum({
    DEBIT: "DEBIT",
    CREDIT: "CREDIT",
});
export const GlJournalStatus = makeEnum({
    DRAFT: "DRAFT",
    POSTED: "POSTED",
    VOIDED: "VOIDED",
});
export const OperatingExpenseStatus = makeEnum({
    DRAFT: "DRAFT",
    APPROVED: "APPROVED",
    POSTED: "POSTED",
    VOIDED: "VOIDED",
});
export const PromotionDiscountType = makeEnum({
    PERCENT: "PERCENT",
    AMOUNT: "AMOUNT",
    FIXED_PRICE: "FIXED_PRICE",
});
export const PromotionTargetScope = makeEnum({
    ALL_ITEMS: "ALL_ITEMS",
    DEPARTMENT: "DEPARTMENT",
    CATEGORY: "CATEGORY",
    PRODUCT: "PRODUCT",
});
export const ProductType = makeEnum({
    STOCK: "STOCK",
    SERVICE: "SERVICE",
    BUNDLE: "BUNDLE",
    DIGITAL: "DIGITAL",
    VOUCHER: "VOUCHER",
});
export const PurchaseOrderStatus = makeEnum({
    DRAFT: "DRAFT",
    COMMITTED: "COMMITTED",
    PART_RECEIVED: "PART_RECEIVED",
    RECEIVED: "RECEIVED",
    CLOSED: "CLOSED",
    CANCELLED: "CANCELLED",
});
export const PurchaseOrderClosureReason = makeEnum({
    FULFILLED: "FULFILLED",
    SHORT_SUPPLIED: "SHORT_SUPPLIED",
    CANCELLED_BY_SUPPLIER: "CANCELLED_BY_SUPPLIER",
    REJECTED_AT_RECEIPT: "REJECTED_AT_RECEIPT",
    RETURNED_TO_VENDOR: "RETURNED_TO_VENDOR",
    OTHER: "OTHER",
});
export const SupplierClaimStatus = makeEnum({
    OPEN: "OPEN",
    CREDIT_REQUESTED: "CREDIT_REQUESTED",
    CREDIT_RECEIVED: "CREDIT_RECEIVED",
    WRITTEN_OFF: "WRITTEN_OFF",
    CLOSED: "CLOSED",
});
export const SupplierClaimReason = makeEnum({
    SHORT_SUPPLIED: "SHORT_SUPPLIED",
    REJECTED_AT_RECEIPT: "REJECTED_AT_RECEIPT",
    DAMAGED_INBOUND: "DAMAGED_INBOUND",
    WRONG_ITEM: "WRONG_ITEM",
    OTHER: "OTHER",
});
export const SupplierReturnStatus = makeEnum({
    POSTED: "POSTED",
    CANCELLED: "CANCELLED",
});
export const SupplierReturnReason = makeEnum({
    DAMAGED: "DAMAGED",
    REJECTED_AT_RECEIPT: "REJECTED_AT_RECEIPT",
    QUALITY_HOLD: "QUALITY_HOLD",
    SHORT_EXPIRY: "SHORT_EXPIRY",
    WRONG_ITEM: "WRONG_ITEM",
    OTHER: "OTHER",
});
export const StockCountSessionStatus = makeEnum({
    SUBMITTED: "SUBMITTED",
    COMMITTED: "COMMITTED",
    CANCELLED: "CANCELLED",
});
export const InterStoreTransferOrigin = makeEnum({
    ENTERPRISE: "ENTERPRISE",
    STORE_REQUEST: "STORE_REQUEST",
});
export const InterStoreTransferStatus = makeEnum({
    DRAFT: "DRAFT",
    REQUESTED: "REQUESTED",
    PART_ISSUED: "PART_ISSUED",
    ISSUED: "ISSUED",
    PART_RECEIVED: "PART_RECEIVED",
    RECEIVED: "RECEIVED",
    CLOSED: "CLOSED",
    CANCELLED: "CANCELLED",
});
