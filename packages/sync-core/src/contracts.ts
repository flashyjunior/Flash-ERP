import type { RetailEntityKey } from "@flash-erp/domain";

export type SyncBatchDirection = "upstream" | "downstream";

export type SyncEnvelope<TPayload = unknown> = {
  eventId: string;
  idempotencyKey: string;
  aggregateType: RetailEntityKey;
  aggregateId: string;
  eventType: string;
  originatingNodeCode: string;
  targetNodeCode: string | null;
  recordVersion: number;
  occurredAt: string;
  payload: TPayload;
};

export type SyncBatch<TPayload = unknown> = {
  direction: SyncBatchDirection;
  sourceNodeCode: string;
  targetNodeCode: string;
  cursor: string | null;
  sentAt: string;
  events: SyncEnvelope<TPayload>[];
};

export type SyncCheckpoint = {
  localNodeCode: string;
  remoteNodeCode: string;
  lastEventId: string | null;
  lastCursor: string | null;
  lastReceivedAt: string | null;
  lastAppliedAt: string | null;
};

export type SyncRejectedEnvelope = {
  eventId: string;
  reasonCode:
    | "STALE_VERSION"
    | "UNKNOWN_AGGREGATE"
    | "INVALID_PAYLOAD"
    | "POLICY_REJECTED"
    | "DEPENDENCY_MISSING";
  message: string;
  retryable: boolean;
};

export type SyncApplyResult = {
  acceptedEventIds: string[];
  rejected: SyncRejectedEnvelope[];
  nextCursor: string | null;
};

export type StoreNodeTelemetry = {
  generatedAt: string;
  health: "healthy" | "lagging" | "attention";
  lastSyncAt: string | null;
  lastLocalWriteAt: string | null;
  nextScheduledSyncAt?: string | null;
  lastManualSyncAt?: string | null;
  lastAutoSyncAt?: string | null;
  queueMetrics: {
    upstreamQueued: number;
    upstreamInFlight: number;
    downstreamQueued: number;
    deadLetter: number;
  };
};

export type StoreNodeSyncPolicy = {
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  activeFromMinutes: number;
  activeToMinutes: number;
  jitterSeconds: number;
  backoffBaseSeconds: number;
  backoffMaxSeconds: number;
  nextScheduledSyncAt: string | null;
  lastManualSyncAt: string | null;
  lastAutoSyncAt: string | null;
};

export type SyncPaymentMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "STORE_CREDIT"
  | "GIFT_CARD"
  | "OTHER";

export type SyncInventoryMovementType =
  | "OPENING_BALANCE"
  | "GOODS_RECEIPT"
  | "RETURN_TO_VENDOR"
  | "STOCK_TRANSFER_OUT"
  | "STOCK_TRANSFER_IN"
  | "SALE"
  | "RETURN"
  | "ADJUSTMENT_POSITIVE"
  | "ADJUSTMENT_NEGATIVE"
  | "COUNT_VARIANCE";

export type PurchaseOrderClosureReason =
  | "FULFILLED"
  | "SHORT_SUPPLIED"
  | "CANCELLED_BY_SUPPLIER"
  | "REJECTED_AT_RECEIPT"
  | "RETURNED_TO_VENDOR"
  | "OTHER";

export type SupplierClaimStatus =
  | "OPEN"
  | "CREDIT_REQUESTED"
  | "CREDIT_RECEIVED"
  | "WRITTEN_OFF"
  | "CLOSED";

export type SupplierClaimReason =
  | "SHORT_SUPPLIED"
  | "REJECTED_AT_RECEIPT"
  | "DAMAGED_INBOUND"
  | "WRONG_ITEM"
  | "OTHER";

export type SyncPosTransactionType = "SALE" | "RETURN" | "EXCHANGE";
export type SyncPosLineIntent = "SALE" | "RETURN";
export type SyncPromotionDiscountType = "PERCENT" | "AMOUNT" | "FIXED_PRICE";
export type SyncPromotionTargetScope =
  | "ALL_ITEMS"
  | "DEPARTMENT"
  | "CATEGORY"
  | "PRODUCT";

export type StorePosTransactionLinePayload = {
  lineId: string;
  lineIntent: SyncPosLineIntent;
  sourceLineId: string | null;
  productCode: string;
  productVariantCode?: string | null;
  productName: string;
  barcode: string | null;
  variantSize?: string | null;
  variantColor?: string | null;
  variantAttributesSnapshot?: string | null;
  lineNote?: string | null;
  serialNumbers: string[];
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  appliedPromotionCode?: string | null;
  appliedPromotionName?: string | null;
  inventoryLocationCode?: string | null;
};

export type StorePosPaymentPayload = {
  paymentId: string;
  method: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  bankAccountId?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  bankBranchCode?: string | null;
  bankBranchName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  amount: number;
  reference: string | null;
  receivedAt: string;
};

export type StorePosShiftOpenedPayload = {
  shiftId: string;
  shiftNo: string;
  storeCode: string;
  terminalCode: string;
  cashierCode: string;
  openingFloatAmount: number;
  openedAt: string;
};

export type StorePosShiftClosedPayload = {
  shiftId: string;
  shiftNo: string;
  storeCode: string;
  terminalCode: string;
  cashierCode: string;
  openingFloatAmount: number;
  closingDeclaredCash: number;
  closingVariance: number;
  openedAt: string;
  closedAt: string;
};

export type StorePosTransactionCompletedPayload = {
  transactionId: string;
  transactionNo: string;
  sourceTransactionId: string | null;
  sourceTransactionNo: string | null;
  storeCode: string;
  terminalCode: string;
  shiftId: string | null;
  shiftNo: string | null;
  cashierCode: string | null;
  customerId: string | null;
  customerNo: string | null;
  customerName: string | null;
  transactionType: SyncPosTransactionType;
  status: "COMPLETED";
  subtotalAmount: number;
  discountAmount: number;
  loyaltyPointsRedeemed: number;
  loyaltyRedemptionAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  notes: string | null;
  headerReference?: string | null;
  additionalDetails?: string | null;
  completedAt: string;
  lines: StorePosTransactionLinePayload[];
  payments: StorePosPaymentPayload[];
};

export type StoreCustomerAccountEntryRecordedPayload = {
  entryId: string;
  entryNo: string;
  storeCode: string;
  terminalCode: string;
  shiftId: string;
  shiftNo: string | null;
  cashierCode: string | null;
  customerId: string;
  customerNo: string;
  customerName: string;
  entryType: "ACCOUNT_PAYMENT";
  paymentMethod: SyncPaymentMethod;
  tenderMethodCode: string | null;
  tenderMethodName: string | null;
  bankAccountId?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  bankBranchCode?: string | null;
  bankBranchName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  amount: number;
  reference: string | null;
  note: string | null;
  occurredAt: string;
};

export type StoreSalesOrderStatus = "OPEN" | "FULFILLED" | "CANCELLED";

export type StoreSalesOrderRecordedPayload = {
  orderId: string;
  orderNo: string;
  storeCode: string;
  terminalCode: string;
  sourceTransactionId: string;
  sourceTransactionNo: string;
  customerId: string | null;
  customerNo: string | null;
  customerName: string | null;
  totalAmount: number;
  depositAmount?: number;
  balanceAmount?: number;
  depositTenderMethodCode?: string | null;
  depositTenderMethodName?: string | null;
  depositPaymentMethod?: SyncPaymentMethod | null;
  depositReference?: string | null;
  depositPaidAt?: string | null;
  status: StoreSalesOrderStatus;
  operatorName: string | null;
  note: string | null;
  createdAt: string;
  fulfilledTransactionId: string | null;
  fulfilledTransactionNo: string | null;
  fulfilledAt: string | null;
  cancelledAt: string | null;
};

export type StoreEodReconciliationRecordedPayload = {
  reconciliationId: string;
  reconciliationNo: string;
  storeCode: string;
  terminalCode: string;
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
  reconciledAt: string;
};

export type StoreBankingDepositRecordedPayload = {
  depositId: string;
  depositNo: string;
  storeCode: string;
  terminalCode: string;
  reconciliationId: string;
  reconciliationNo: string;
  shiftId: string;
  shiftNo: string;
  amount: number;
  bankName: string | null;
  bankAccountId?: string | null;
  bankCode?: string | null;
  bankBranchCode?: string | null;
  bankBranchName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  reference: string | null;
  operatorName: string | null;
  note: string | null;
  depositedAt: string;
};

export type StoreInventoryLedgerRecordedPayload = {
  ledgerEntryId: string;
  storeCode: string;
  terminalCode: string;
  inventoryLocationCode: string | null;
  productCode: string;
  movementType: SyncInventoryMovementType;
  quantity: number;
  serialNumbers?: string[];
  unitCost: number | null;
  referenceType: string;
  referenceId: string;
  externalReference: string | null;
  occurredAt: string;
};

export type StoreInventoryTransferRecordedPayload = {
  transferId: string;
  outboundLedgerEntryId: string;
  inboundLedgerEntryId: string;
  storeCode: string;
  terminalCode: string;
  sourceInventoryLocationCode: string;
  destinationInventoryLocationCode: string;
  productCode: string;
  quantity: number;
  serialNumbers?: string[];
  unitCost: number | null;
  referenceType: string;
  referenceId: string;
  externalReference: string | null;
  occurredAt: string;
};

export type EnterpriseInventoryLocationPublishedPayload = {
  storeCode: string;
  locationCode: string;
  locationName: string;
  locationType: string;
  status: string;
  defaults: string;
  useForSalesDefault: boolean;
  useForSalesOrderDefault: boolean;
  useForReceivingDefault: boolean;
  warehouseCode: string | null;
  warehouseName: string | null;
  publishedAt: string;
};

export type EnterpriseStoreSettingsPublishedPayload = {
  retailOrgName: string;
  companyLogoUrl: string | null;
  loginBackgroundImageUrl: string | null;
  productSizes: string[];
  posDiscountRates: number[];
  documentNumberFormats: Record<
    string,
    {
      prefix: string;
      digits: number;
      includeStoreCode: boolean;
    }
  > | null;
  storeCode: string;
  storeName: string;
  storePhone: string | null;
  storeAddressLine1: string | null;
  storeAddressLine2: string | null;
  shortName: string | null;
  timezone: string;
  currencyCode: string;
  salesEnabled: boolean;
  warehouseEnabled: boolean;
  shiftFloatPromptAmount: number;
  showCriticalStocksOnStartup: boolean;
  loyaltyProgramEnabled: boolean;
  loyaltyPointsPerCurrencyUnit: number;
  loyaltyRedemptionEnabled: boolean;
  loyaltyRedemptionPointsStep: number;
  loyaltyRedemptionValueAmount: number;
  loyaltyMinimumRedeemPoints: number;
  loyaltyMaximumRedeemPercentOfSale: number;
  receiptHeader: string | null;
  receiptFooter: string | null;
  salesReceiptTemplateCode: string | null;
  salesReceiptTemplateName: string | null;
  salesReceiptTemplateMode: "default" | "linked" | "legacy";
  salesReceiptTemplateHtml: string | null;
  accountPaymentReceiptTemplateCode: string | null;
  accountPaymentReceiptTemplateName: string | null;
  accountPaymentReceiptTemplateHtml: string | null;
  goodsReceiptTemplateCode: string | null;
  goodsReceiptTemplateName: string | null;
  goodsReceiptTemplateHtml: string | null;
  storeGroupCode: string | null;
  storeGroupName: string | null;
  storeGroupType: string | null;
  licenseStatus: string;
  licenseKey: string | null;
  licensedUntil: string | null;
  terminalLicenseStatus: string;
  terminalLicenseKey: string | null;
  terminalLicensedUntil: string | null;
  touchModeEnabled: boolean;
  catalogPolicy: {
    catalogCodes: string[] | null;
    departmentCodes: string[] | null;
    categoryCodes: string[] | null;
    productCodes: string[] | null;
    productSortOrders?: Record<string, number> | null;
  } | null;
  publishedAt: string;
};

export type EnterpriseUnitOfMeasurePublishedPayload = {
  storeCode: string;
  uomCode: string;
  uomName: string;
  description: string | null;
  decimalPrecision: number;
  allowFractionalSale: boolean;
  status: string;
  publishedAt: string;
};

export type EnterpriseGiftCertificatePublishedPayload = {
  storeCode: string;
  certificateId: string;
  certificateNo: string;
  recipientName: string | null;
  purchaserName: string | null;
  originalAmount: number;
  balanceAmount: number;
  currencyCode: string;
  issueDate: string;
  expiryDate: string | null;
  status: string;
  publishedAt: string;
};

export type EnterpriseBankAccountPublishedPayload = {
  storeCode: string;
  bankAccountId: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountNumber: string;
  accountName: string;
  currencyCode: string;
  status: string;
  publishedAt: string;
};

export type EnterprisePermissionPublishedPayload = {
  storeCode: string;
  permissionCode: string;
  permissionName: string;
  description: string | null;
  publishedAt: string;
};

export type EnterpriseRolePublishedPayload = {
  storeCode: string;
  roleCode: string;
  roleName: string;
  description: string | null;
  status: string;
  permissionCodes: string[];
  publishedAt: string;
};

export type EnterpriseRetailUserPublishedPayload = {
  storeCode: string;
  userId: string;
  loginId: string;
  email: string | null;
  displayName: string;
  accountStatus: string;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  roleCodes: string[];
  roleNames: string[];
  permissionCodes: string[];
  passwordHash: string | null;
  passwordUpdatedAt: string | null;
  publishedAt: string;
};

export type EnterpriseCustomerPublishedPayload = {
  storeCode: string;
  customerId: string;
  customerNo: string;
  fullName: string;
  customerType: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  countryCode: string | null;
  homeStoreCode: string | null;
  homeStoreName: string | null;
  loyaltyEnrolled: boolean;
  loyaltyTier: string | null;
  loyaltyPointsBalance: number;
  allowCreditSales: boolean;
  creditLimitAmount: number | null;
  receivableBalanceAmount: number;
  note: string | null;
  status: string;
  publishedAt: string;
};

export type EnterpriseProductDepartmentPublishedPayload = {
  storeCode: string;
  departmentCode: string;
  departmentName: string;
  description: string | null;
  status: string;
  sortOrder: number;
  publishedAt: string;
};

export type EnterpriseProductCategoryPublishedPayload = {
  storeCode: string;
  categoryCode: string;
  categoryName: string;
  departmentCode: string;
  departmentName: string;
  description: string | null;
  status: string;
  sortOrder: number;
  publishedAt: string;
};

export type EnterpriseCatalogProductPublishedPayload = {
  storeCode: string;
  productCode: string;
  productName: string;
  sku: string | null;
  shortName: string | null;
  description: string | null;
  productType: string;
  department: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  seasonCode: string | null;
  unitOfMeasure: string;
  baseUnitOfMeasure?: string | null;
  uomScheduleCode?: string | null;
  uomScheduleName?: string | null;
  uomScheduleBaseUnit?: string | null;
  uomConversions?: Array<{
    uomCode: string;
    uomName: string;
    conversionFactor: number;
    isBaseUnit: boolean;
    allowSale: boolean;
    allowPurchase: boolean;
  }>;
  packSize: string | null;
  countryOfOrigin: string | null;
  primaryImageUrl: string | null;
  notes: string | null;
  taxable: boolean;
  taxProfileCode: string | null;
  taxProfileName: string | null;
  taxRatePercent: number | null;
  taxInclusive: boolean;
  trackInventory: boolean;
  isSerialized: boolean;
  trackSize: boolean;
  trackColor: boolean;
  allowPriceOverride: boolean;
  mustEnterPriceAtPos: boolean;
  minStockLevel: number | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  safetyStockLevel: number | null;
  shelfLifeDays: number | null;
  weightKg: number | null;
  volumeLitres: number | null;
  unitPrice: number;
  quantityOnHand?: number | null;
  catalogSortOrder?: number | null;
  matrixVariants?: Array<{
    variantId: string;
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
  }>;
  publishedAt: string;
};

export type EnterpriseBarcodePublishedPayload = {
  storeCode: string;
  productCode: string;
  barcode: string;
  barcodeType: string;
  publishedAt: string;
};

export type EnterprisePriceListPublishedPayload = {
  storeCode: string;
  priceListCode: string;
  priceListName: string;
  currencyCode: string;
  isDefault: boolean;
  customerType: string | null;
  loyaltyTier: string | null;
  status: string;
  productCode: string;
  unitPrice: number;
  publishedAt: string;
};

export type EnterpriseTaxProfilePublishedPayload = {
  storeCode: string;
  taxProfileCode: string;
  taxProfileName: string;
  description: string | null;
  ratePercent: number;
  isDefault: boolean;
  isTaxInclusive: boolean;
  status: string;
  publishedAt: string;
};

export type EnterpriseTenderMethodPublishedPayload = {
  storeCode: string;
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
  description: string | null;
  requiresReference: boolean;
  allowChange: boolean;
  allowRefund: boolean;
  allowOpenCashDrawer: boolean;
  status: string;
  sortOrder: number;
  publishedAt: string;
};

export type EnterprisePromotionPublishedPayload = {
  storeCode: string;
  promotionId: string;
  promotionCode: string;
  promotionName: string;
  description: string | null;
  discountType: SyncPromotionDiscountType;
  targetScope: SyncPromotionTargetScope;
  discountValue: number;
  minimumBasketAmount: number | null;
  minimumLineQuantity: number | null;
  buyQuantity: number | null;
  rewardQuantity: number | null;
  targetDepartmentCode: string | null;
  targetCategoryCode: string | null;
  targetProductCode: string | null;
  eligibleStoreCodes: string[] | null;
  eligibleCustomerTypes: string[] | null;
  eligibleLoyaltyTiers: string[] | null;
  activeDaysOfWeek: string[] | null;
  activeFromMinutes: number | null;
  activeToMinutes: number | null;
  couponRequired: boolean;
  couponCode: string | null;
  allowWithLoyalty: boolean;
  applyOncePerBasket: boolean;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  status: string;
  publishedAt: string;
};

export type EnterpriseInventorySerialSnapshotItemPayload = {
  serialNumber: string;
  locationCode: string | null;
  status: "AVAILABLE" | "IN_TRANSIT" | "SOLD" | "ADJUSTED_OUT";
  sourceReferenceType: string | null;
  sourceReferenceId: string | null;
  sourceReferenceLabel: string | null;
  updatedAt: string;
};

export type EnterpriseInventorySerialSnapshotPublishedPayload = {
  storeCode: string;
  productCode: string;
  productName: string;
  availableQuantity: number;
  serialItems: EnterpriseInventorySerialSnapshotItemPayload[];
  publishedAt: string;
};

export type EnterprisePurchaseOrderPublishedLinePayload = {
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
  orderedQuantity: number;
  receivedQuantity: number;
  exceptionQuantity: number;
  outstandingQuantity: number;
  unitCost: number | null;
};

export type EnterprisePurchaseOrderPublishedPayload = {
  storeCode: string;
  purchaseOrderId: string;
  purchaseOrderNo: string;
  locationCode: string;
  locationName: string;
  supplierNo: string | null;
  supplierName: string | null;
  externalReference: string | null;
  status: "COMMITTED" | "PART_RECEIVED" | "RECEIVED" | "CLOSED";
  note: string | null;
  operatorName: string | null;
  committedAt: string | null;
  closedAt: string | null;
  closureReason: PurchaseOrderClosureReason | null;
  closureNote: string | null;
  closureOperatorName: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  exceptionQuantity: number;
  outstandingQuantity: number;
  lines: EnterprisePurchaseOrderPublishedLinePayload[];
  publishedAt: string;
};

export type EnterpriseSupplierReturnPublishedLinePayload = {
  supplierReturnLineId: string;
  goodsReceiptLineId: string | null;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  serialNumbers: string[];
};

export type EnterpriseSupplierReturnPublishedPayload = {
  storeCode: string;
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
  reason:
    | "DAMAGED"
    | "REJECTED_AT_RECEIPT"
    | "QUALITY_HOLD"
    | "SHORT_EXPIRY"
    | "WRONG_ITEM"
    | "OTHER";
  status: "POSTED" | "CANCELLED";
  note: string | null;
  operatorName: string;
  totalQuantity: number;
  returnedAt: string;
  postedAt: string;
  cancelledAt: string | null;
  cancellationNote: string | null;
  cancellationOperatorName: string | null;
  cancellationAcknowledgedAt: string | null;
  cancellationAcknowledgedByNodeCode: string | null;
  cancellationAcknowledgedBy: string | null;
  cancellationAcknowledgementNote: string | null;
  lines: EnterpriseSupplierReturnPublishedLinePayload[];
  publishedAt: string;
};

export type EnterpriseInterStoreTransferPublishedPayload = {
  storeCode: string;
  role: "SOURCE" | "DESTINATION";
  transferId: string;
  transferNo: string;
  transferBatchNo: string | null;
  lineNo: number;
  origin: "ENTERPRISE" | "STORE_REQUEST";
  status:
    | "DRAFT"
    | "REQUESTED"
    | "PART_ISSUED"
    | "ISSUED"
    | "PART_RECEIVED"
    | "RECEIVED"
    | "CLOSED";
  externalReference: string | null;
  transporterName?: string | null;
  vehicleRegistrationNo?: string | null;
  driverName?: string | null;
  driverContact?: string | null;
  deliveryNoteNo?: string | null;
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
  requestedQuantity: number;
  issuedQuantity: number;
  receivedQuantity: number;
  outstandingIssueQuantity: number;
  outstandingReceiptQuantity: number;
  unitCost: number | null;
  issuedSerialNumbers: string[];
  receivedSerialNumbers: string[];
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
  publishedAt: string;
};

export type EnterpriseInterStoreTransferRequestTargetPublishedPayload = {
  storeCode: string;
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
  publishedAt: string;
};

export type StoreNodeReplayRequest = {
  note?: string;
  operatorName?: string;
};

export type StoreNodeInboundActionRequest = {
  note?: string;
  operatorName?: string;
};

export type SyncRecoveryTaskType = "REQUEST_UPSTREAM_RESEND";

export type SyncTaskType =
  | "REQUEST_UPSTREAM_RESEND"
  | "APPLY_INVENTORY_ADJUSTMENT"
  | "APPLY_COUNT_VARIANCE"
  | "APPLY_STOCK_TRANSFER"
  | "RUN_DATABASE_MAINTENANCE";

export type SyncTaskCompletionOutcome =
  | "RESENT_QUEUED"
  | "ADJUSTMENT_QUEUED"
  | "COUNT_VARIANCE_QUEUED"
  | "TRANSFER_QUEUED"
  | "DATABASE_MAINTENANCE_ACKNOWLEDGED";

export type EnterpriseSyncTaskPayload = {
  taskId: string;
  taskType: SyncTaskType;
  sourceInboundEventId: string;
  sourceEventType: string;
  aggregateType: string;
  aggregateId: string;
  transactionNo: string | null;
  productCode: string | null;
  locationCode?: string | null;
  locationName?: string | null;
  quantity?: number | null;
  serialNumbers?: string[] | null;
  movementType?: SyncInventoryMovementType | null;
  title: string;
  instructions: string;
  operatorName: string;
  note: string;
  requestedAt: string;
  replacementAggregateType: string;
  replacementAggregateId: string;
  replacementEventType: string;
  replacementRecordVersion: number;
  replacementPayload: unknown;
  databaseInstruction?: {
    instructionType: "VACUUM" | "ANALYZE" | "BACKUP" | "REINDEX" | "SYNC_NOW";
    target: string | null;
    priority: "LOW" | "NORMAL" | "HIGH";
  } | null;
};

export type EnterpriseSyncRecoveryTaskPayload = EnterpriseSyncTaskPayload;

export type EnterpriseInventoryAdjustmentTaskPayload =
  EnterpriseSyncTaskPayload & {
    taskType: "APPLY_INVENTORY_ADJUSTMENT";
    productCode: string;
    locationCode: string;
    locationName: string;
    quantity: number;
    movementType: "ADJUSTMENT_POSITIVE" | "ADJUSTMENT_NEGATIVE";
  };

export type EnterpriseInventoryCountVarianceTaskPayload =
  EnterpriseSyncTaskPayload & {
    taskType: "APPLY_COUNT_VARIANCE";
    productCode: string;
    locationCode: string;
    locationName: string;
    quantity: number;
    movementType: "COUNT_VARIANCE";
  };

export type EnterpriseInventoryTransferTaskPayload =
  EnterpriseSyncTaskPayload & {
    taskType: "APPLY_STOCK_TRANSFER";
    productCode: string;
    locationCode: string;
    locationName: string;
    targetLocationCode: string;
    targetLocationName: string;
    quantity: number;
    movementType: "STOCK_TRANSFER_OUT";
  };

export type StoreSyncTaskCompletedPayload = {
  taskId: string;
  taskType: SyncTaskType;
  sourceInboundEventId: string;
  sourceEventType: string;
  replacementEventId: string;
  replacementIdempotencyKey: string;
  completedAt: string;
  outcome: SyncTaskCompletionOutcome;
  storeNote: string;
};

export type StoreSyncRecoveryTaskCompletedPayload =
  StoreSyncTaskCompletedPayload;

export type SyncOperatorActionType =
  | "REPLAY_PACKET"
  | "REPLAY_ESCALATIONS"
  | "REPROCESS_INBOUND_PACKET"
  | "REQUEST_UPSTREAM_RESEND"
  | "REQUEST_INVENTORY_ADJUSTMENT"
  | "REQUEST_COUNT_VARIANCE"
  | "REQUEST_STOCK_TRANSFER"
  | "PUBLISH_LOCATION_TOPOLOGY"
  | "STORE_TASK_COMPLETED";

export type StoreNodeSyncTrigger =
  | "manual"
  | "scheduled"
  | "tray"
  | "startup"
  | "telemetry";

export type StoreNodePushRequest<TPayload = unknown> = {
  sourceNodeCode: string;
  sentAt: string;
  cursor: string | null;
  syncRunId?: string | null;
  trigger?: StoreNodeSyncTrigger | null;
  clientStartedAt?: string | null;
  upstreamEvents: SyncEnvelope<TPayload>[];
  acknowledgedDownstreamEventIds: string[];
  telemetry?: StoreNodeTelemetry | null;
};

export type StoreNodePushResponse = {
  acceptedEventIds: string[];
  duplicateEventIds: string[];
  rejected: SyncRejectedEnvelope[];
  acknowledgedDownstreamEventIds: string[];
  rejectedAcknowledgementIds?: string[];
  serverReceivedAt: string;
  serverProcessedAt?: string;
  syncRunId?: string | null;
  syncPolicy: StoreNodeSyncPolicy;
};

export type StoreNodePullRequest = {
  sourceNodeCode: string;
  cursor: string | null;
  limit?: number;
  syncRunId?: string | null;
  trigger?: StoreNodeSyncTrigger | null;
  clientStartedAt?: string | null;
};

export type StoreNodePullResponse<TPayload = unknown> = {
  batch: SyncBatch<TPayload>;
  serverCheckpoint: SyncCheckpoint | null;
  serverReceivedAt?: string;
  serverProcessedAt?: string;
  retryAfterSeconds?: number | null;
  syncRunId?: string | null;
  syncPolicy: StoreNodeSyncPolicy;
};

export type StoreNodeReplayResponse = {
  nodeCode: string;
  eventId: string | null;
  actionType: SyncOperatorActionType;
  note: string;
  operatorName: string;
  replayedCount: number;
  serverProcessedAt: string;
};

export type StoreNodeInboundActionResponse = {
  nodeCode: string;
  eventId: string;
  actionType: SyncOperatorActionType;
  note: string;
  operatorName: string;
  status: string;
  appliedAt: string | null;
  message: string;
  serverProcessedAt: string;
};

export type InventoryAdjustmentTaskRequest = {
  productCode: string;
  movementType: "ADJUSTMENT_POSITIVE" | "ADJUSTMENT_NEGATIVE";
  quantity: number;
  serialNumbers?: string[];
  operatorName?: string;
  note?: string;
};

export type InventoryAdjustmentTaskResponse = {
  nodeCode: string;
  locationCode: string;
  taskId: string;
  actionType: SyncOperatorActionType;
  taskType: SyncTaskType;
  note: string;
  operatorName: string;
  message: string;
  serverProcessedAt: string;
};

export type InventoryCountVarianceTaskRequest = {
  productCode: string;
  countedQuantity: number;
  serialNumbers?: string[];
  operatorName?: string;
  note?: string;
};

export type InventoryCountVarianceTaskResponse = {
  nodeCode: string;
  locationCode: string;
  taskId: string;
  actionType: SyncOperatorActionType;
  taskType: SyncTaskType;
  note: string;
  operatorName: string;
  message: string;
  serverProcessedAt: string;
};

export type InventoryTransferTaskRequest = {
  productCode: string;
  targetLocationCode: string;
  quantity: number;
  serialNumbers?: string[];
  operatorName?: string;
  note?: string;
};

export type InventoryTransferTaskResponse = {
  nodeCode: string;
  locationCode: string;
  taskId: string;
  actionType: SyncOperatorActionType;
  taskType: SyncTaskType;
  note: string;
  operatorName: string;
  message: string;
  serverProcessedAt: string;
};

export type InventoryGoodsReceiptRequest = {
  productCode: string;
  quantity: number;
  unitCost?: number | null;
  supplierNo?: string | null;
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string;
  serialNumbers?: string[];
};

export type InventoryGoodsReceiptResponse = {
  goodsReceiptId: string;
  receiptNo: string;
  locationCode: string;
  productCode: string;
  quantity: number;
  serialNumbers: string[];
  operatorName: string;
  note: string;
  message: string;
  serverProcessedAt: string;
};

export type PurchaseOrderLineRequest = {
  productCode: string;
  quantity: number;
  unitCost?: number | null;
};

export type CreatePurchaseOrderRequest = {
  supplierNo?: string | null;
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string;
  autoCommit?: boolean;
  discountAmount?: number | null;
  shippingAmount?: number | null;
  freightAmount?: number | null;
  otherChargesAmount?: number | null;
  taxAmount?: number | null;
  lines: PurchaseOrderLineRequest[];
};

export type UpdatePurchaseOrderRequest = CreatePurchaseOrderRequest & {
  locationCode?: string | null;
};

export type CreatePurchaseOrderResponse = {
  purchaseOrderId: string;
  purchaseOrderNo: string;
  locationCode: string;
  nodeCode: string | null;
  status: "DRAFT" | "COMMITTED" | "PART_RECEIVED" | "RECEIVED" | "CLOSED";
  lineCount: number;
  message: string;
  serverProcessedAt: string;
};

export type PurchaseOrderLifecycleResponse = {
  purchaseOrderId: string;
  purchaseOrderNo: string;
  locationCode: string;
  nodeCode: string | null;
  status: "DRAFT" | "COMMITTED" | "PART_RECEIVED" | "RECEIVED" | "CLOSED";
  message: string;
  serverProcessedAt: string;
};

export type ClosePurchaseOrderRequest = {
  closureReason?: PurchaseOrderClosureReason | null;
  closureNote?: string | null;
  operatorName?: string | null;
};

export type CancelSupplierReturnRequest = {
  cancellationNote?: string | null;
  operatorName?: string | null;
};

export type CancelSupplierReturnResponse = {
  supplierReturnId: string;
  supplierReturnNo: string;
  locationCode: string;
  nodeCode: string | null;
  status: "CANCELLED";
  message: string;
  serverProcessedAt: string;
};

export type UpdateSupplierClaimRequest = {
  status: SupplierClaimStatus;
  supplierCaseReference?: string | null;
  creditNoteReference?: string | null;
  creditNoteAmount?: number | null;
  note?: string | null;
  operatorName?: string | null;
};

export type UpdateSupplierClaimResponse = {
  claimId: string;
  claimNo: string;
  status: SupplierClaimStatus;
  message: string;
  serverProcessedAt: string;
};

export type CreateInterStoreTransferRequest = {
  productCode: string;
  destinationLocationCode: string;
  quantity: number;
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string;
};

export type CreateInterStoreTransferResponse = {
  transferId: string;
  transferNo: string;
  sourceLocationCode: string;
  destinationLocationCode: string;
  sourceNodeCode: string | null;
  destinationNodeCode: string | null;
  status:
    | "DRAFT"
    | "REQUESTED"
    | "PART_ISSUED"
    | "ISSUED"
    | "PART_RECEIVED"
    | "RECEIVED"
    | "CLOSED";
  message: string;
  serverProcessedAt: string;
};

export type CreateInterStoreTransferBatchLineRequest = {
  productCode: string;
  quantity: number;
  externalReference?: string | null;
  note?: string | null;
};

export type CreateInterStoreTransferBatchRequest = {
  sourceLocationCode: string;
  destinationLocationCode: string;
  lines: CreateInterStoreTransferBatchLineRequest[];
  externalReference?: string | null;
  transporterName?: string | null;
  vehicleRegistrationNo?: string | null;
  driverName?: string | null;
  driverContact?: string | null;
  deliveryNoteNo?: string | null;
  note?: string | null;
  operatorName?: string;
  requiredAt?: string | null;
  saveAsDraft?: boolean;
};

export type UpdateInterStoreTransferBatchRequest =
  CreateInterStoreTransferBatchRequest;

export type CreateInterStoreTransferBatchResponse = {
  sourceLocationCode: string;
  destinationLocationCode: string;
  transferBatchNo: string;
  transferCount: number;
  transfers: CreateInterStoreTransferResponse[];
  message: string;
  serverProcessedAt: string;
};

export type StoreRemoteInventoryLookupRequest = {
  query?: string | null;
  productCode?: string | null;
  storeCode?: string | null;
  locationCode?: string | null;
  limit?: number | null;
};

export type StoreRemoteInventoryLookupRow = {
  storeCode: string;
  storeName: string;
  locationCode: string;
  locationName: string;
  productCode: string;
  productName: string;
  departmentCode: string | null;
  categoryCode: string | null;
  subcategory: string | null;
  quantityOnHand: number;
  unitPrice: number;
  updatedAt: string;
};

export type StoreRemoteInventoryLookupResponse = {
  rows: StoreRemoteInventoryLookupRow[];
  serverProcessedAt: string;
};

export type StoreRemoteInterStoreRequestInput = {
  sourceLocationCode: string;
  destinationLocationCode?: string | null;
  productCode: string;
  quantity: number;
  externalReference?: string | null;
  note?: string | null;
  operatorName?: string;
};

export type StoreGoodsReceiptRecordedLinePayload = {
  goodsReceiptLineId: string;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  serialNumbers: string[];
};

export type StoreGoodsReceiptRecordedExceptionPayload = {
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

export type StoreGoodsReceiptRecordedPayload = {
  goodsReceiptId: string;
  goodsReceiptNo: string;
  purchaseOrderId: string | null;
  purchaseOrderNo: string | null;
  storeCode: string;
  terminalCode: string;
  inventoryLocationCode: string;
  supplierNo: string | null;
  supplierName: string | null;
  externalReference: string | null;
  note: string | null;
  operatorName: string;
  receivedAt: string;
  lines: StoreGoodsReceiptRecordedLinePayload[];
  exceptions: StoreGoodsReceiptRecordedExceptionPayload[];
};

export type StoreSupplierReturnRecordedLinePayload = {
  supplierReturnLineId: string;
  goodsReceiptLineId: string | null;
  purchaseOrderLineId: string | null;
  lineNo: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
  serialNumbers: string[];
};

export type StoreSupplierReturnRecordedPayload = {
  supplierReturnId: string;
  supplierReturnNo: string;
  purchaseOrderId: string | null;
  purchaseOrderNo: string | null;
  goodsReceiptId: string | null;
  goodsReceiptNo: string | null;
  storeCode: string;
  terminalCode: string;
  inventoryLocationCode: string;
  supplierNo: string;
  supplierName: string;
  externalReference: string | null;
  reason:
    | "DAMAGED"
    | "REJECTED_AT_RECEIPT"
    | "QUALITY_HOLD"
    | "SHORT_EXPIRY"
    | "WRONG_ITEM"
    | "OTHER";
  note: string | null;
  operatorName: string;
  returnedAt: string;
  lines: StoreSupplierReturnRecordedLinePayload[];
};

export type StoreSupplierReturnCancellationAcknowledgedPayload = {
  supplierReturnId: string;
  supplierReturnNo: string;
  storeCode: string;
  terminalCode: string;
  acknowledgedAt: string;
  operatorName: string;
  note: string | null;
};

export type StoreStockCountSessionSubmittedPayload = {
  sessionId: string;
  sessionNo: string;
  storeCode: string;
  terminalCode: string;
  inventoryLocationCode: string;
  productCode: string;
  previousQuantity: number;
  countedQuantity: number;
  varianceQuantity: number;
  previousSerialNumbers?: string[];
  countedSerialNumbers?: string[];
  operatorName: string;
  note: string | null;
  submittedAt: string;
};

export type StoreInterStoreTransferIssuedPayload = {
  transferId: string;
  transferNo: string;
  storeCode: string;
  terminalCode: string;
  sourceLocationCode: string;
  destinationLocationCode: string;
  productCode: string;
  quantity: number;
  serialNumbers?: string[];
  operatorName: string;
  note: string | null;
  occurredAt: string;
};

export type StoreInterStoreTransferRequestedPayload = {
  requestId: string;
  requestNo: string;
  storeCode: string;
  terminalCode: string;
  sourceLocationCode: string;
  destinationLocationCode: string;
  productCode: string;
  quantity: number;
  externalReference: string | null;
  operatorName: string;
  note: string | null;
  occurredAt: string;
};

export type StoreInterStoreTransferReceivedPayload = {
  transferId: string;
  transferNo: string;
  storeCode: string;
  terminalCode: string;
  sourceLocationCode: string;
  destinationLocationCode: string;
  productCode: string;
  quantity: number;
  serialNumbers?: string[];
  operatorName: string;
  note: string | null;
  occurredAt: string;
};

export type PublishStoreLocationsRequest = {
  operatorName?: string;
  note?: string;
};

export type PublishStoreLocationsResponse = {
  nodeCode: string;
  storeCode: string;
  publishedCount: number;
  note: string;
  operatorName: string;
  message: string;
  serverProcessedAt: string;
};
