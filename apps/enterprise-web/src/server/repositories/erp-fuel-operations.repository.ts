import { randomUUID } from "node:crypto";

import { type Prisma } from "@prisma/client";

import { deriveCustomerAccountPostingEffect } from "@flash-erp/sync-core";
import { parseJsonField, serializeRequiredJsonField } from "./json-field";
import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import {
  postAccountingDocumentInTransaction,
  type PostAccountingDocumentLine
} from "@/server/services/erp-posting-engine";
import {
  InventoryMovementType,
  InterStoreTransferOrigin,
  InterStoreTransferStatus,
  PaymentMethod,
  RecordStatus,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";
import { queueInterStoreTransferPublication } from "@/server/repositories/store-sync.repository";
import { ensureInterStoreTransferSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";

type FuelContext = {
  retailOrgId: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
    companyLogoUrl: string | null;
  };
};

type FuelCompany = {
  id: string;
  code: string;
  legalName: string;
  tradingName: string | null;
  baseCurrencyCode: string;
};

function readJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readJsonString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type UpsertFuelTankRequest = {
  tankId?: string | null;
  code?: string | null;
  name?: string | null;
  tankType?: string | null;
  operatingSiteId?: string | null;
  productProfileId?: string | null;
  capacityQuantity?: number | string | null;
  safeCapacityQuantity?: number | string | null;
  reorderLevelQuantity?: number | string | null;
  uomCode?: string | null;
  openingQuantity?: number | string | null;
  currentBookQuantity?: number | string | null;
  status?: string | null;
  notes?: string | null;
};

export type UpsertFuelPumpRequest = {
  pumpId?: string | null;
  code?: string | null;
  name?: string | null;
  pumpType?: string | null;
  operatingSiteId?: string | null;
  tankId?: string | null;
  manufacturer?: string | null;
  serialNo?: string | null;
  status?: string | null;
  notes?: string | null;
};

export type UpsertFuelNozzleRequest = {
  nozzleId?: string | null;
  pumpId?: string | null;
  tankId?: string | null;
  productProfileId?: string | null;
  code?: string | null;
  name?: string | null;
  meterUomCode?: string | null;
  openingMeterReading?: number | string | null;
  currentMeterReading?: number | string | null;
  status?: string | null;
  notes?: string | null;
};

export type CreateFuelTankDipRequest = {
  dipId?: string | null;
  tankId?: string | null;
  dipReference?: string | null;
  dipDate?: string | null;
  dipQuantity?: number | string | null;
  waterQuantity?: number | string | null;
  temperatureReading?: number | string | null;
  evidenceImageUrl?: string | null;
  evidenceFileName?: string | null;
  evidenceCapturedAt?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
};

export type CreateFuelMeterReadingRequest = {
  meterReadingId?: string | null;
  nozzleId?: string | null;
  readingDate?: string | null;
  shiftReference?: string | null;
  openingMeterReading?: number | string | null;
  closingMeterReading?: number | string | null;
  adjustmentQuantity?: number | string | null;
  unitSellingPrice?: number | string | null;
  salesAmount?: number | string | null;
  evidenceImageUrl?: string | null;
  evidenceFileName?: string | null;
  evidenceCapturedAt?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
};

export type CreateFuelDeliveryRequest = {
  operatingSiteId?: string | null;
  deliveryDate?: string | null;
  supplierName?: string | null;
  supplierDocumentNo?: string | null;
  transporterName?: string | null;
  vehicleRegistrationNo?: string | null;
  currencyCode?: string | null;
  notes?: string | null;
  lines?: Array<{
    tankId?: string | null;
    orderedQuantity?: number | string | null;
    deliveredQuantity?: number | string | null;
    acceptedQuantity?: number | string | null;
    unitCost?: number | string | null;
    notes?: string | null;
  }> | null;
};

export type UpsertFuelStationRequest = {
  stationId?: string | null;
  stationCode?: string | null;
  stationName?: string | null;
  stationType?: string | null;
  customerId?: string | null;
  storeId?: string | null;
  inventoryLocationId?: string | null;
  operatingSiteId?: string | null;
  location?: string | null;
  city?: string | null;
  gpsLatitude?: number | string | null;
  gpsLongitude?: number | string | null;
  contactName?: string | null;
  phone?: string | null;
  paymentTermsCode?: string | null;
  creditLimitAmount?: number | string | null;
  status?: string | null;
  notes?: string | null;
};

export type CreateFuelStationDeliveryRequest = {
  stationId?: string | null;
  sourceOperatingSiteId?: string | null;
  deliveryDate?: string | null;
  requestedDeliveryDate?: string | null;
  dueDate?: string | null;
  paymentMode?: string | null;
  amountReceived?: number | string | null;
  paymentReference?: string | null;
  paymentReceivedAt?: string | null;
  customerReference?: string | null;
  deliveryNoteNo?: string | null;
  transporterName?: string | null;
  vehicleRegistrationNo?: string | null;
  driverName?: string | null;
  driverContact?: string | null;
  currencyCode?: string | null;
  notes?: string | null;
  lines?: Array<{
    sourceTankId?: string | null;
    orderedQuantity?: number | string | null;
    loadedQuantity?: number | string | null;
    deliveredQuantity?: number | string | null;
    unitSellingPrice?: number | string | null;
    unitCost?: number | string | null;
    notes?: string | null;
  }> | null;
};

export type RecordFuelTransferFeedbackRequest = {
  waterTestResult?: string | null;
  quantityBeforeDelivery?: number | string | null;
  expectedQuantityReceived?: number | string | null;
  expectedStockQuantity?: number | string | null;
  quantityAfterDelivery?: number | string | null;
  actualQuantityReceived?: number | string | null;
  feedbackDipReading?: number | string | null;
  beforeDischargeEvidence?: unknown;
  afterDischargeEvidence?: unknown;
  feedbackNote?: string | null;
  feedbackOperatorName?: string | null;
  action?: "SAVE" | "CONFIRM" | "POST" | string | null;
};

type FuelSalePaymentRequest = {
  tenderMethodCode?: string | null;
  cashbookAccountId?: string | null;
  amount?: number | string | null;
  reference?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
};

export type CreateFuelSaleRequest = {
  documentMode?: string | null;
  sourceOperatingSiteId?: string | null;
  customerId?: string | null;
  stationId?: string | null;
  linkedStationDeliveryId?: string | null;
  paymentCashbookAccountId?: string | null;
  loadingDate?: string | null;
  dispatchDate?: string | null;
  customerName?: string | null;
  serviceType?: string | null;
  paymentReceivedAmount?: number | string | null;
  paymentDate?: string | null;
  paymentReference?: string | null;
  paymentDetails?: string | null;
  truckLoaded?: string | null;
  currencyCode?: string | null;
  notes?: string | null;
  payments?: FuelSalePaymentRequest[] | null;
  lines?: Array<{
    productProfileId?: string | null;
    productId?: string | null;
    quantity?: number | string | null;
    unitPrice?: number | string | null;
    notes?: string | null;
  }> | null;
};

export type UpsertFuelOperationsSettingsRequest = {
  defaultSaleSourceSiteId?: string | null;
  defaultDispatchSiteId?: string | null;
  saleReceiptPaperKind?: string | null;
  deliveryReceiptPaperKind?: string | null;
  salesOrderReceiptPaperKind?: string | null;
};

export type FulfillFuelSaleOrderRequest = {
  paymentCashbookAccountId?: string | null;
  paymentReceivedAmount?: number | string | null;
  paymentDate?: string | null;
  paymentReference?: string | null;
  paymentDetails?: string | null;
  truckLoaded?: string | null;
  dispatchDate?: string | null;
  notes?: string | null;
};

export type CreateFuelReconciliationRequest = {
  operatingSiteId?: string | null;
  reconciliationDate?: string | null;
  notes?: string | null;
};

export type FuelOperationsMutationResponse = {
  message: string;
  tankId?: string;
  pumpId?: string;
  nozzleId?: string;
  dipId?: string;
  meterReadingId?: string;
  deliveryId?: string;
  deliveryNo?: string;
  stationId?: string;
  stationDeliveryId?: string;
  stationDeliveryNo?: string;
  stationDeliveryReceipt?: FuelOperationsWorkspaceData["stationDeliveryRows"][number];
  fuelSaleId?: string;
  fuelSaleNo?: string;
  fuelSaleReceipt?: FuelOperationsWorkspaceData["fuelSaleRows"][number];
  reconciliationId?: string;
  reconciliationNo?: string;
  serverProcessedAt: string;
};

export type FuelOperationsWorkspaceData = {
  currencyCode: string;
  functionalCurrencyCode: string;
  companyName: string;
  companyLogoUrl: string | null;
  statusMessage: string;
  refreshedAt: string;
  defaultOperationDate: string;
  currencyOptions: Array<{
    code: string;
    name: string;
    symbol: string | null;
    isBaseCurrency: boolean;
    label: string;
  }>;
  fuelSettings: {
    defaultSaleSourceSiteId: string | null;
    defaultDispatchSiteId: string | null;
    saleReceiptPaperKind: string;
    deliveryReceiptPaperKind: string;
    salesOrderReceiptPaperKind: string;
  };
  receiptTemplateOptions: Array<{
    receiptTemplateCode: string;
    name: string;
    templateHtml: string;
    paperWidthMm: number;
    isDefault: boolean;
    label: string;
  }>;
  siteOptions: Array<{
    operatingSiteId: string;
    code: string;
    name: string;
    storeCode: string | null;
    warehouseCode: string | null;
    label: string;
  }>;
  storeOptions: Array<{
    storeId: string;
    storeCode: string;
    storeName: string;
    defaultInventoryLocationId: string | null;
    defaultInventoryLocationCode: string | null;
    defaultInventoryLocationName: string | null;
    label: string;
    locations: Array<{
      inventoryLocationId: string;
      code: string;
      name: string;
      label: string;
    }>;
  }>;
  userOptions: Array<{ userId: string; loginId: string; displayName: string; label: string }>;
  customerOptions: Array<{
    customerId: string;
    customerNo: string;
    fullName: string;
    customerType: string;
    loyaltyTier: string | null;
    paymentTermsCode: string | null;
    creditLimitAmount: number | null;
    label: string;
  }>;
  paymentAccountOptions: Array<{
    cashbookAccountId: string;
    code: string;
    name: string;
    accountType: string;
    glAccountCode: string;
    requiresReference: boolean;
    label: string;
  }>;
  paymentTenderOptions: Array<{
    tenderMethodCode: string;
    tenderMethodName: string;
    paymentMethod: string;
    cashbookAccountId: string | null;
    cashbookAccountCode: string | null;
    cashbookAccountName: string | null;
    accountType: string | null;
    glAccountCode: string | null;
    requiresReference: boolean;
    label: string;
  }>;
  productOptions: Array<{
    productProfileId: string;
    productId: string;
    code: string;
    sku: string | null;
    name: string;
    uomCode: string;
    baseUnitPrice: number;
    defaultUnitPrice: number | null;
    onHandQuantity: number;
    priceRows: Array<{
      sourceType: "SHOP_PRICE" | "PRICE_LIST" | "BASE_PRICE";
      unitPrice: number;
      storeCode: string | null;
      priceListCode: string | null;
      priceListName: string | null;
      customerType: string | null;
      loyaltyTier: string | null;
      isDefaultPriceList: boolean;
      label: string;
    }>;
    label: string;
  }>;
  tankOptions: Array<{
    tankId: string;
    code: string;
    name: string;
    label: string;
    operatingSiteId: string | null;
    productProfileId: string | null;
    uomCode: string;
  }>;
  pumpOptions: Array<{
    pumpId: string;
    code: string;
    name: string;
    label: string;
    tankId: string | null;
    productProfileId: string | null;
    operatingSiteId: string | null;
    uomCode: string | null;
  }>;
  nozzleOptions: Array<{
    nozzleId: string;
    code: string;
    name: string;
    label: string;
    tankId: string;
    currentMeterReading: number;
  }>;
  stationOptions: Array<{
    stationId: string;
    stationCode: string;
    stationName: string;
    label: string;
    customerId: string | null;
    customerNo: string | null;
    customerName: string | null;
    storeId: string | null;
    storeCode: string | null;
    storeName: string | null;
    inventoryLocationId: string | null;
    inventoryLocationCode: string | null;
    inventoryLocationName: string | null;
  }>;
  tankRows: Array<{
    tankId: string;
    operatingSiteId: string | null;
    productProfileId: string | null;
    code: string;
    name: string;
    tankType: string;
    siteCode: string | null;
    siteName: string | null;
    productCode: string | null;
    productName: string | null;
    uomCode: string;
    capacityQuantity: number;
    safeCapacityQuantity: number | null;
    reorderLevelQuantity: number | null;
    openingQuantity: number;
    currentBookQuantity: number;
    utilizationPercent: number;
    lastDipAt: string | null;
    status: string;
    notes: string | null;
  }>;
  pumpRows: Array<{
    pumpId: string;
    operatingSiteId: string | null;
    tankId: string | null;
    productProfileId: string | null;
    code: string;
    name: string;
    pumpType: string;
    siteCode: string | null;
    tankCode: string | null;
    productCode: string | null;
    nozzleCount: number;
    manufacturer: string | null;
    serialNo: string | null;
    status: string;
  }>;
  nozzleRows: Array<{
    nozzleId: string;
    pumpId: string;
    tankId: string;
    productProfileId: string | null;
    meterUomCode: string;
    code: string;
    name: string;
    pumpCode: string;
    tankCode: string;
    productCode: string | null;
    operatingSiteId: string | null;
    siteCode: string | null;
    openingMeterReading: number;
    currentMeterReading: number;
    status: string;
  }>;
  dipRows: Array<{
    dipId: string;
    tankId: string;
    tankCode: string;
    operatingSiteId: string | null;
    siteCode: string | null;
    siteName: string | null;
    stationCode: string | null;
    stationName: string | null;
    dipReference: string | null;
    dipDate: string;
    dipQuantity: number;
    waterQuantity: number;
    bookQuantity: number;
    varianceQuantity: number;
    evidenceImageUrl: string | null;
    evidenceFileName: string | null;
    evidenceCapturedAt: string | null;
    recordedBy: string | null;
    notes: string | null;
    status: string;
  }>;
  meterReadingRows: Array<{
    meterReadingId: string;
    nozzleId: string;
    nozzleCode: string;
    tankId: string;
    tankCode: string;
    operatingSiteId: string | null;
    siteCode: string | null;
    siteName: string | null;
    stationCode: string | null;
    stationName: string | null;
    readingDate: string;
    shiftReference: string | null;
    openingMeterReading: number;
    closingMeterReading: number;
    salesQuantity: number;
    adjustmentQuantity: number;
    unitSellingPrice: number;
    salesAmount: number;
    evidenceImageUrl: string | null;
    evidenceFileName: string | null;
    evidenceCapturedAt: string | null;
    recordedBy: string | null;
    notes: string | null;
    status: string;
  }>;
  deliveryRows: Array<{
    deliveryId: string;
    deliveryNo: string;
    deliveryDate: string;
    createdAt: string;
    supplierName: string | null;
    supplierDocumentNo: string | null;
    siteCode: string | null;
    uomSummary: string;
    totalOrderedQuantity: number;
    totalDeliveredQuantity: number;
    totalAcceptedQuantity: number;
    totalVarianceQuantity: number;
    totalCostAmount: number;
    status: string;
  }>;
  stationRows: Array<{
    stationId: string;
    customerId: string | null;
    storeId: string | null;
    inventoryLocationId: string | null;
    operatingSiteId: string | null;
    stationCode: string;
    stationName: string;
    stationType: string;
    customerNo: string | null;
    customerName: string | null;
    storeCode: string | null;
    storeName: string | null;
    inventoryLocationCode: string | null;
    inventoryLocationName: string | null;
    operatingSiteCode: string | null;
    paymentTermsCode: string | null;
    creditLimitAmount: number | null;
    location: string | null;
    city: string | null;
    contactName: string | null;
    phone: string | null;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    notes: string | null;
    status: string;
  }>;
  stationDeliveryRows: Array<{
    stationDeliveryId: string;
    deliveryNo: string;
    deliveryDate: string;
    createdAt: string;
    stationCode: string;
    stationName: string;
    customerNo: string | null;
    customerName: string;
    sourceSiteCode: string | null;
    currencyCode: string;
    totalLoadedQuantity: number;
    totalDeliveredQuantity: number;
    totalVarianceQuantity: number;
    totalSalesAmount: number;
    totalCostAmount: number;
    marginAmount: number;
    uomSummary: string;
    amountReceived: number;
    outstandingAmount: number;
    paymentMode: string;
    paymentReceivedAt: string | null;
    paymentReference: string | null;
    paymentStatus: string;
    invoiceStatus: string;
    lines: Array<{
      lineId: string;
      productCode: string | null;
      productName: string | null;
      uomCode: string;
      orderedQuantity: number;
      loadedQuantity: number;
      deliveredQuantity: number;
      unitSellingPrice: number;
      salesAmount: number;
      unitCost: number;
      costAmount: number;
      marginAmount: number;
      notes: string | null;
    }>;
    transferBatchNo: string | null;
    transferNo: string | null;
    destinationStoreCode: string | null;
    destinationStoreName: string | null;
    destinationLocationCode: string | null;
    destinationLocationName: string | null;
    transporterName: string | null;
    vehicleRegistrationNo: string | null;
    driverName: string | null;
    driverContact: string | null;
    deliveryNoteNo: string | null;
    feedbackStatus: string;
    valuationStatus: string;
    issueJournalEntryId: string | null;
    receiptJournalEntryId: string | null;
    issuedValuationAmount: number | null;
    receivedValuationAmount: number | null;
    varianceValuationAmount: number | null;
    valuationPostedAt: string | null;
    waterTestResult: string | null;
    quantityBeforeDelivery: number | null;
    expectedQuantityReceived: number | null;
    expectedStockQuantity: number | null;
    quantityAfterDelivery: number | null;
    actualQuantityReceived: number | null;
    feedbackVarianceQuantity: number | null;
    feedbackDipReading: number | null;
    beforeDischargeEvidence: Array<{
      url: string;
      fileName: string | null;
      capturedAt: string | null;
      uploadedAt: string | null;
    }>;
    afterDischargeEvidence: Array<{
      url: string;
      fileName: string | null;
      capturedAt: string | null;
      uploadedAt: string | null;
    }>;
    feedbackNote: string | null;
    feedbackRecordedAt: string | null;
    feedbackConfirmedAt: string | null;
    feedbackPostedAt: string | null;
    status: string;
  }>;
  fuelSaleRows: Array<{
    fuelSaleId: string;
    saleNo: string;
    loadingDate: string;
    dispatchDate: string | null;
    createdAt: string;
    sourceSiteCode: string;
    sourceSiteName: string;
    currencyCode: string;
    customerName: string;
    customerNo: string | null;
    stationCode: string | null;
    stationName: string | null;
    serviceType: string;
    productSummary: string;
    uomSummary: string;
    quantity: number;
    unitPrice: number | null;
    totalAmount: number;
    paymentReceivedAmount: number;
    balanceAmount: number;
    paymentDate: string | null;
    paymentAccountName: string | null;
    paymentReference: string | null;
    paymentDetails: string | null;
    truckLoaded: string | null;
    lines: Array<{
      lineId: string;
      productCode: string;
      productName: string;
      uomCode: string;
      quantity: number;
      unitPrice: number;
      lineAmount: number;
      notes: string | null;
    }>;
    payments: Array<{
      paymentId: string;
      tenderMethodCode: string | null;
      tenderMethodName: string | null;
      paymentMode: string;
      cashbookAccountCode: string | null;
      cashbookAccountName: string | null;
      amount: number;
      reference: string | null;
      receivedAt: string | null;
      notes: string | null;
    }>;
    paymentStatus: string;
    status: string;
  }>;
  reconciliationRows: Array<{
    reconciliationId: string;
    reconciliationNo: string;
    reconciliationDate: string;
    siteCode: string | null;
    totalDeliveredQuantity: number;
    totalStationDeliveryQuantity: number;
    totalMeterSalesQuantity: number;
    totalGainLossQuantity: number;
    totalSalesAmount: number;
    totalCostAmount: number;
    marginAmount: number;
    marginPercent: number;
    status: string;
  }>;
  reconciliationLineRows: Array<{
    reconciliationLineId: string;
    reconciliationNo: string;
    tankCode: string;
    productCode: string | null;
    openingQuantity: number;
    deliveredQuantity: number;
    stationDeliveryQuantity: number;
    meterSalesQuantity: number;
    bookClosingQuantity: number;
    dipClosingQuantity: number;
    gainLossQuantity: number;
    stationDeliverySalesAmount: number;
    stationDeliveryCostAmount: number;
    salesAmount: number;
    costAmount: number;
    marginAmount: number;
    marginPercent: number;
  }>;
  metrics: {
    activeTanks: number;
    activePumps: number;
    activeNozzles: number;
    totalTankCapacity: number;
    totalBookQuantity: number;
    latestGainLossQuantity: number;
    latestMarginAmount: number;
  };
};

export type FuelOperationsSettingsWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  defaultOperationDate: string;
  fuelSettings: FuelOperationsWorkspaceData["fuelSettings"];
  siteOptions: FuelOperationsWorkspaceData["siteOptions"];
};

const activeStatus = RecordStatus.ACTIVE;

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundRate(value: number) {
  return Number(value.toFixed(4));
}

function numberOrZero(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: number | string | null | undefined, label: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return parsed;
}

function optionalGpsCoordinate(
  value: number | string | null | undefined,
  label: string,
  minimum: number,
  maximum: number
) {
  const parsed = optionalNumber(value, label);

  if (parsed === null) {
    return null;
  }

  if (parsed < minimum || parsed > maximum) {
    throw new Error(`Flash ERP needs ${label} between ${minimum} and ${maximum}.`);
  }

  return Number(parsed.toFixed(7));
}

function positiveNumber(value: number | string | null | undefined, label: string) {
  const parsed = numberOrZero(value);

  if (parsed <= 0) {
    throw new Error(`Flash ERP needs a positive ${label}.`);
  }

  return parsed;
}

function normalizeCode(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  const code = normalized
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 32);

  if (!code) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return code;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function formatEnumLabelForData(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeStatus(value: string | null | undefined) {
  const status = normalizeOptionalText(value)?.toUpperCase() ?? activeStatus;
  return ["ACTIVE", "INACTIVE", "POSTED", "DRAFT"].includes(status) ? status : activeStatus;
}

function normalizeEvidenceImageUrl(value: string | null | undefined, label: string) {
  const url = normalizeOptionalText(value);

  if (!url) {
    throw new Error(`Flash ERP requires uploaded photo evidence before saving this ${label}.`);
  }

  if (!url.startsWith("/uploads/fuel-evidence/")) {
    throw new Error(`Flash ERP requires ${label} photo evidence uploaded through Fuel Operations.`);
  }

  return url;
}

function parseOperationDate(value: string | null | undefined, label: string) {
  const raw = normalizeOptionalText(value);

  if (!raw) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  const date = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return date;
}

function parseOptionalOperationDate(value: string | null | undefined) {
  const raw = normalizeOptionalText(value);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function dayRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function marginPercent(marginAmount: number, salesAmount: number) {
  return salesAmount === 0 ? 0 : roundRate((marginAmount / salesAmount) * 100);
}

function normalizeStationType(value: string | null | undefined) {
  const stationType = normalizeOptionalText(value)?.toUpperCase() ?? "CUSTOMER";
  return ["CUSTOMER", "OWNED", "DEALER", "OTHER"].includes(stationType) ? stationType : "CUSTOMER";
}

function normalizeServiceType(value: string | null | undefined) {
  const serviceType = normalizeOptionalText(value)?.toUpperCase().replace(/\s+/g, "_") ?? "COMBO";
  return ["COMBO", "BDC_ONLY", "OMC_ONLY", "OTHERS"].includes(serviceType)
    ? serviceType
    : "COMBO";
}

function normalizeFuelSaleDocumentMode(value: string | null | undefined) {
  const mode = normalizeOptionalText(value)?.toUpperCase().replace(/\s+/g, "_") ?? "SALE";
  return mode === "SALES_ORDER" ? "SALES_ORDER" : "SALE";
}

function normalizeReceiptPaperKind(value: string | null | undefined, fallback = "THERMAL") {
  const paperKind = normalizeOptionalText(value)?.toUpperCase().replace(/\s+/g, "_");

  if (paperKind === "A4") {
    return "A4";
  }

  return fallback === "A4" ? "A4" : "THERMAL";
}

function normalizeFuelCatalogKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type FuelCatalogProduct = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  shortName: string | null;
  department: string | null;
  category: string | null;
  subcategory: string | null;
  unitOfMeasure: string;
  baseUnitPrice: Prisma.Decimal;
  baseCostPrice: Prisma.Decimal | null;
};

const defaultFuelCatalogProducts = [
  {
    code: "PMS",
    name: "Premium Motor Spirit",
    shortName: "Petrol",
    category: "PETROL"
  },
  {
    code: "AGO",
    name: "Automotive Gas Oil",
    shortName: "Diesel",
    category: "DIESEL"
  },
  {
    code: "KERO",
    name: "Kerosene",
    shortName: "Kerosene",
    category: "KEROSENE"
  },
  {
    code: "LPG",
    name: "Liquefied Petroleum Gas",
    shortName: "LPG",
    category: "LPG"
  }
] as const;

async function ensureFuelVolumeUomSchedule(tx: Prisma.TransactionClient, context: FuelContext) {
  const literUnit = await tx.unitOfMeasure.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "LTR"
      }
    },
    update: {
      name: "Litre",
      description: "Base fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: activeStatus,
      deletedAt: null
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: "LTR",
      name: "Litre",
      description: "Base fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: activeStatus
    },
    select: {
      id: true
    }
  });

  const kiloliterUnit = await tx.unitOfMeasure.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "KL"
      }
    },
    update: {
      name: "Kilolitre",
      description: "Bulk fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: activeStatus,
      deletedAt: null
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: "KL",
      name: "Kilolitre",
      description: "Bulk fuel volume unit.",
      decimalPrecision: 3,
      allowFractionalSale: true,
      status: activeStatus
    },
    select: {
      id: true
    }
  });

  const schedule = await tx.unitOfMeasureSchedule.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "FUEL-VOLUME"
      }
    },
    update: {
      name: "Fuel Volume",
      description: "Fuel volume schedule for pump, tank, sale, and delivery quantities.",
      baseUnitOfMeasureId: literUnit.id,
      isDefaultForStock: true,
      status: activeStatus,
      deletedAt: null
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: "FUEL-VOLUME",
      name: "Fuel Volume",
      description: "Fuel volume schedule for pump, tank, sale, and delivery quantities.",
      baseUnitOfMeasureId: literUnit.id,
      isDefaultForStock: true,
      status: activeStatus
    },
    select: {
      id: true
    }
  });

  for (const line of [
    { unitOfMeasureId: literUnit.id, conversionFactor: "1.000000", isBaseUnit: true, sortOrder: 10 },
    { unitOfMeasureId: kiloliterUnit.id, conversionFactor: "1000.000000", isBaseUnit: false, sortOrder: 20 }
  ]) {
    await tx.unitOfMeasureScheduleLine.upsert({
      where: {
        scheduleId_unitOfMeasureId: {
          scheduleId: schedule.id,
          unitOfMeasureId: line.unitOfMeasureId
        }
      },
      update: {
        conversionFactor: line.conversionFactor,
        isBaseUnit: line.isBaseUnit,
        allowSale: true,
        allowPurchase: true,
        sortOrder: line.sortOrder
      },
      create: {
        scheduleId: schedule.id,
        unitOfMeasureId: line.unitOfMeasureId,
        conversionFactor: line.conversionFactor,
        isBaseUnit: line.isBaseUnit,
        allowSale: true,
        allowPurchase: true,
        sortOrder: line.sortOrder
      }
    });
  }

  return {
    literUnitId: literUnit.id,
    scheduleId: schedule.id
  };
}

function fuelCategoryName(code: string) {
  const labels: Record<string, string> = {
    DIESEL: "Diesel",
    KEROSENE: "Kerosene",
    LPG: "Liquefied Petroleum Gas",
    PETROL: "Petrol"
  };

  return labels[code] ?? code;
}

async function ensureFuelProductHierarchy(
  tx: Prisma.TransactionClient,
  context: FuelContext
) {
  const fuelDepartment = await tx.productDepartment.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "FUEL"
      }
    },
    update: {
      name: "Fuel",
      description: "Fuel and petroleum products.",
      sortOrder: 10,
      status: activeStatus,
      deletedAt: null
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: "FUEL",
      name: "Fuel",
      description: "Fuel and petroleum products.",
      sortOrder: 10,
      status: activeStatus
    },
    select: {
      id: true
    }
  });

  const categoryCodes = Array.from(
    new Set(defaultFuelCatalogProducts.map((product) => product.category))
  );

  for (const [index, categoryCode] of categoryCodes.entries()) {
    await tx.productCategory.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code: categoryCode
        }
      },
      update: {
        departmentId: fuelDepartment.id,
        name: fuelCategoryName(categoryCode),
        description: `${fuelCategoryName(categoryCode)} fuel category.`,
        sortOrder: (index + 1) * 10,
        status: activeStatus,
        deletedAt: null
      },
      create: {
        retailOrgId: context.retailOrgId,
        departmentId: fuelDepartment.id,
        code: categoryCode,
        name: fuelCategoryName(categoryCode),
        description: `${fuelCategoryName(categoryCode)} fuel category.`,
        sortOrder: (index + 1) * 10,
        status: activeStatus
      }
    });
  }
}

function isFuelCatalogProduct(product: FuelCatalogProduct) {
  const values = [
    product.code,
    product.sku,
    product.name,
    product.shortName,
    product.department,
    product.category,
    product.subcategory
  ].map(normalizeFuelCatalogKey);

  const exactFuelCodes = new Set([
    "AGO",
    "DIESEL",
    "AUTOMOTIVEGASOIL",
    "PMS",
    "PETROL",
    "GASOLINE",
    "PREMIUMMOTORSPIRIT",
    "LPG",
    "LIQUEFIEDPETROLEUMGAS",
    "NAPHTA",
    "NAPHTHA",
    "KEROSENE",
    "ATK",
    "JETFUEL"
  ]);

  if (values.some((value) => exactFuelCodes.has(value))) {
    return true;
  }

  return values.some((value) =>
    ["FUEL", "PETROL", "DIESEL", "GASOIL", "GASOLINE", "LPG", "NAPHT"].some((keyword) =>
      value.includes(keyword)
    )
  );
}

function fuelTransferProductWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      {
        code: {
          in: [
            "AGO",
            "DIESEL",
            "PMS",
            "PETROL",
            "LPG",
            "KERO",
            "KEROSENE",
            "ATK",
            "JETFUEL"
          ]
        }
      },
      {
        sku: {
          in: [
            "AGO",
            "DIESEL",
            "PMS",
            "PETROL",
            "LPG",
            "KERO",
            "KEROSENE",
            "ATK",
            "JETFUEL"
          ]
        }
      },
      {
        category: {
          in: ["FUEL", "DIESEL", "PETROL", "KEROSENE", "LPG"]
        }
      },
      {
        subcategory: {
          in: ["FUEL", "DIESEL", "PETROL", "KEROSENE", "LPG"]
        }
      },
      {
        department: {
          in: ["FUEL", "FUELS", "PETROLEUM"]
        }
      },
      {
        name: {
          contains: "Fuel"
        }
      },
      {
        name: {
          contains: "Diesel"
        }
      },
      {
        name: {
          contains: "Petrol"
        }
      },
      {
        name: {
          contains: "Kerosene"
        }
      },
      {
        name: {
          contains: "Gas Oil"
        }
      }
    ]
  };
}

async function getAvailableSkuForDefaultFuelProduct(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  code: string
) {
  for (const sku of [code, `FUEL-${code}`, `DEFAULT-FUEL-${code}`]) {
    const existingSkuOwner = await tx.product.findFirst({
      where: {
        retailOrgId,
        sku,
        code: {
          not: code
        }
      },
      select: {
        id: true
      }
    });

    if (!existingSkuOwner) {
      return sku;
    }
  }

  return `FLASH-FUEL-${code}`;
}

async function ensureDefaultFuelCatalogProducts(
  tx: Prisma.TransactionClient,
  context: FuelContext
) {
  const fuelUom = await ensureFuelVolumeUomSchedule(tx, context);
  await ensureFuelProductHierarchy(tx, context);

  for (const product of defaultFuelCatalogProducts) {
    const sku = await getAvailableSkuForDefaultFuelProduct(tx, context.retailOrgId, product.code);

    await tx.product.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code: product.code
        }
      },
      update: {
        sku,
        name: product.name,
        shortName: product.shortName,
        productType: "STOCK",
        department: "FUEL",
        category: product.category,
        unitOfMeasure: "LTR",
        baseUnitOfMeasureId: fuelUom.literUnitId,
        uomScheduleId: fuelUom.scheduleId,
        taxable: true,
        trackInventory: true,
        status: activeStatus,
        deletedAt: null
      },
      create: {
        retailOrgId: context.retailOrgId,
        code: product.code,
        sku,
        name: product.name,
        shortName: product.shortName,
        productType: "STOCK",
        department: "FUEL",
        category: product.category,
        unitOfMeasure: "LTR",
        baseUnitOfMeasureId: fuelUom.literUnitId,
        uomScheduleId: fuelUom.scheduleId,
        taxable: true,
        trackInventory: true,
        baseUnitPrice: "0.00",
        baseCostPrice: "0.00",
        status: activeStatus
      }
    });
  }
}

async function ensureFuelProductProfileFromCatalogProduct(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  product: FuelCatalogProduct
) {
  return tx.erpProductProfile.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: product.code
      }
    },
    update: {
      companyId: company.id,
      name: product.name,
      productFamily: "FUEL",
      defaultUomCode: product.unitOfMeasure || "LTR",
      trackingMode: "BULK_LIQUID",
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      code: product.code,
      name: product.name,
      productFamily: "FUEL",
      variantName: product.shortName,
      defaultUomCode: product.unitOfMeasure || "LTR",
      trackingMode: "BULK_LIQUID",
      status: activeStatus
    }
  });
}

async function getFuelCatalogProducts(tx: Prisma.TransactionClient, retailOrgId: string) {
  const products = await tx.product.findMany({
    where: {
      retailOrgId,
      status: activeStatus,
      deletedAt: null,
      trackInventory: true
    },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true,
      sku: true,
      name: true,
      shortName: true,
      department: true,
      category: true,
      subcategory: true,
      unitOfMeasure: true,
      baseUnitPrice: true,
      baseCostPrice: true
    }
  });

  return products.filter(isFuelCatalogProduct);
}

async function buildFuelProductOptions(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
): Promise<FuelOperationsWorkspaceData["productOptions"]> {
  let products = await getFuelCatalogProducts(tx, context.retailOrgId);

  if (products.length === 0) {
    await ensureDefaultFuelCatalogProducts(tx, context);
    products = await getFuelCatalogProducts(tx, context.retailOrgId);
  }

  const [profiles, stockGroups, storePrices, priceListEntries] = await Promise.all([
    Promise.all(
      products.map((product) => ensureFuelProductProfileFromCatalogProduct(tx, context, company, product))
    ),
    tx.inventoryLedgerEntry.groupBy({
      by: ["productId"],
      where: {
        retailOrgId: context.retailOrgId,
        productId: {
          in: products.map((product) => product.id)
        }
      },
      _sum: {
        quantity: true
      }
    }),
    tx.storeProductPrice.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        productId: {
          in: products.map((product) => product.id)
        },
        productVariantId: null,
        status: activeStatus
      },
      include: {
        store: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: [{ store: { code: "asc" } }, { updatedAt: "desc" }]
    }),
    tx.priceListEntry.findMany({
      where: {
        productId: {
          in: products.map((product) => product.id)
        },
        priceList: {
          retailOrgId: context.retailOrgId,
          status: activeStatus
        }
      },
      include: {
        priceList: true
      },
      orderBy: [{ priceList: { isDefault: "desc" } }, { priceList: { code: "asc" } }]
    })
  ]);

  const profileByCode = new Map(profiles.map((profile) => [profile.code, profile] as const));
  const onHandByProductId = new Map(
    stockGroups.map((group) => [group.productId, roundQuantity(toNumber(group._sum.quantity))] as const)
  );
  const storePricesByProductId = new Map<string, typeof storePrices>();
  const priceListEntriesByProductId = new Map<string, typeof priceListEntries>();

  for (const price of storePrices) {
    const rows = storePricesByProductId.get(price.productId) ?? [];
    rows.push(price);
    storePricesByProductId.set(price.productId, rows);
  }

  for (const entry of priceListEntries) {
    const rows = priceListEntriesByProductId.get(entry.productId) ?? [];
    rows.push(entry);
    priceListEntriesByProductId.set(entry.productId, rows);
  }

  return products.map((product) => {
    const profile = profileByCode.get(product.code);

    if (!profile) {
      throw new Error(`Flash ERP could not mirror fuel product ${product.code}.`);
    }

    const onHandQuantity = onHandByProductId.get(product.id) ?? 0;
    const defaultPriceEntry =
      priceListEntriesByProductId.get(product.id)?.find((entry) => entry.priceList.isDefault) ??
      null;
    const priceRows: FuelOperationsWorkspaceData["productOptions"][number]["priceRows"] = [
      ...(storePricesByProductId.get(product.id) ?? []).map((price) => ({
        sourceType: "SHOP_PRICE" as const,
        unitPrice: Number(price.unitPrice),
        storeCode: price.store.code,
        priceListCode: null,
        priceListName: null,
        customerType: null,
        loyaltyTier: null,
        isDefaultPriceList: false,
        label: `${price.store.code} shop price`
      })),
      ...(priceListEntriesByProductId.get(product.id) ?? []).map((entry) => ({
        sourceType: "PRICE_LIST" as const,
        unitPrice: Number(entry.unitPrice),
        storeCode: null,
        priceListCode: entry.priceList.code,
        priceListName: entry.priceList.name,
        customerType: entry.priceList.customerType,
        loyaltyTier: entry.priceList.loyaltyTier,
        isDefaultPriceList: entry.priceList.isDefault,
        label: entry.priceList.isDefault
          ? `${entry.priceList.code} default price`
          : `${entry.priceList.code} customer price`
      })),
      {
        sourceType: "BASE_PRICE",
        unitPrice: Number(product.baseUnitPrice),
        storeCode: null,
        priceListCode: null,
        priceListName: null,
        customerType: null,
        loyaltyTier: null,
        isDefaultPriceList: false,
        label: "Product base price"
      }
    ];

    return {
      productProfileId: profile.id,
      productId: product.id,
      code: product.code,
      sku: product.sku,
      name: product.name,
      uomCode: product.unitOfMeasure,
      baseUnitPrice: Number(product.baseUnitPrice),
      defaultUnitPrice: defaultPriceEntry ? Number(defaultPriceEntry.unitPrice) : null,
      onHandQuantity,
      priceRows,
      label: `${product.code} - ${product.name} (${numberFormatterForData(onHandQuantity)} ${product.unitOfMeasure} on hand)`
    };
  });
}

async function ensureDefaultFuelInventoryLocation(tx: Prisma.TransactionClient, context: FuelContext) {
  const existing = await tx.inventoryLocation.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ useForSalesDefault: "desc" }, { code: "asc" }],
    select: {
      id: true
    }
  });

  if (existing) {
    return existing;
  }

  return tx.inventoryLocation.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "MAIN-FUEL-SITE"
      }
    },
    update: {
      name: "Main Fuel Site",
      locationType: "FUEL_SITE",
      useForSalesDefault: true,
      useForReceivingDefault: true,
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: "MAIN-FUEL-SITE",
      name: "Main Fuel Site",
      locationType: "FUEL_SITE",
      useForSalesDefault: true,
      useForReceivingDefault: true,
      status: activeStatus
    },
    select: {
      id: true
    }
  });
}

async function buildFuelSourceSiteOptions(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  productOptions: FuelOperationsWorkspaceData["productOptions"]
): Promise<FuelOperationsWorkspaceData["siteOptions"]> {
  const productIds = productOptions.map((product) => product.productId);
  let locations = await tx.inventoryLocation.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    include: {
      store: {
        select: {
          code: true,
          name: true
        }
      },
      warehouse: {
        select: {
          code: true,
          name: true
        }
      }
    },
    orderBy: [
      { useForSalesDefault: "desc" },
      { useForReceivingDefault: "desc" },
      { code: "asc" }
    ]
  });

  if (locations.length === 0) {
    await ensureDefaultFuelInventoryLocation(tx, context);
    locations = await tx.inventoryLocation.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      },
      include: {
        store: {
          select: {
            code: true,
            name: true
          }
        },
        warehouse: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: [
        { useForSalesDefault: "desc" },
        { useForReceivingDefault: "desc" },
        { code: "asc" }
      ]
    });
  }

  const stockGroups =
    productIds.length > 0
      ? await tx.inventoryLedgerEntry.groupBy({
          by: ["inventoryLocationId"],
          where: {
            retailOrgId: context.retailOrgId,
            inventoryLocationId: {
              in: locations.map((location) => location.id)
            },
            productId: {
              in: productIds
            }
          },
          _sum: {
            quantity: true
          }
        })
      : [];
  const fuelStockByLocationId = new Map(
    stockGroups.map((group) => [
      group.inventoryLocationId,
      roundQuantity(toNumber(group._sum.quantity))
    ] as const)
  );

  const siteOptions: FuelOperationsWorkspaceData["siteOptions"] = [];

  for (const location of locations) {
    const siteName =
      location.store?.name ??
      location.warehouse?.name ??
      location.name;
    const site = await tx.erpOperatingSite.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code: location.code
        }
      },
      update: {
        companyId: company.id,
        name: siteName,
        siteType: location.locationType || "INVENTORY_LOCATION",
        location: location.name,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        code: location.code,
        name: siteName,
        siteType: location.locationType || "INVENTORY_LOCATION",
        location: location.name,
        status: activeStatus
      }
    });
    const fuelStock = fuelStockByLocationId.get(location.id) ?? 0;
    const stockLabel = `${numberFormatterForData(fuelStock)} fuel stock`;
    const parentLabel = location.store?.code
      ? `Store ${location.store.code}`
      : location.warehouse?.code
        ? `Warehouse ${location.warehouse.code}`
        : "Inventory location";

    siteOptions.push({
      operatingSiteId: site.id,
      code: site.code,
      name: site.name,
      storeCode: location.store?.code ?? null,
      warehouseCode: location.warehouse?.code ?? null,
      label: `${location.code} - ${location.name} (${parentLabel}; ${stockLabel})`
    });
  }

  return siteOptions;
}

async function buildFuelStationStoreOptions(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
): Promise<FuelOperationsWorkspaceData["storeOptions"]> {
  const stores = await tx.store.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    include: {
      inventoryLocations: {
        where: {
          status: activeStatus
        },
        orderBy: [
          { useForReceivingDefault: "desc" },
          { useForSalesDefault: "desc" },
          { code: "asc" }
        ]
      }
    },
    orderBy: [{ code: "asc" }]
  });

  for (const store of stores) {
    await ensureFuelStoreFinanceDimensions(tx, context, company, store);
  }

  return stores.map((store) => {
    const defaultLocation =
      store.inventoryLocations.find((location) => location.useForReceivingDefault) ??
      store.inventoryLocations.find((location) => location.useForSalesDefault) ??
      store.inventoryLocations[0] ??
      null;

    return {
      storeId: store.id,
      storeCode: store.code,
      storeName: store.name,
      defaultInventoryLocationId: defaultLocation?.id ?? null,
      defaultInventoryLocationCode: defaultLocation?.code ?? null,
      defaultInventoryLocationName: defaultLocation?.name ?? null,
      label: `${store.code} - ${store.name}`,
      locations: store.inventoryLocations.map((location) => ({
        inventoryLocationId: location.id,
        code: location.code,
        name: location.name,
        label: `${location.code} - ${location.name}`
      }))
    };
  });
}

function numberFormatterForData(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function formatNumberForMessage(value: number) {
  return numberFormatterForData(roundQuantity(value));
}

function normalizePaymentMode(value: string | null | undefined) {
  const paymentMode = normalizeOptionalText(value)?.toUpperCase() ?? "CREDIT";
  return ["CREDIT", "CASH_ON_DELIVERY", "PREPAID", "BANK_TRANSFER", "MOBILE_MONEY"].includes(
    paymentMode
  )
    ? paymentMode
    : "CREDIT";
}

function derivePaymentStatus(totalSalesAmount: number, amountReceived: number) {
  if (totalSalesAmount <= 0) {
    return "UNBILLED";
  }

  if (amountReceived >= totalSalesAmount) {
    return "PAID";
  }

  if (amountReceived > 0) {
    return "PARTIALLY_PAID";
  }

  return "UNPAID";
}

function fuelPaymentRequiresReference(accountType: string) {
  return accountType !== "CASH";
}

function isStoreCreditPaymentMethod(paymentMethod: string | null | undefined) {
  return paymentMethod === PaymentMethod.STORE_CREDIT;
}

function summarizeFuelPaymentReference(
  payments: Array<{ reference: string | null }>
) {
  const references = payments
    .map((payment) => payment.reference)
    .filter((reference): reference is string => Boolean(reference));

  if (references.length === 0) {
    return null;
  }

  return references.join(", ").slice(0, 1000);
}

async function prepareFuelSalePayments(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: CreateFuelSaleRequest,
  totalAmount: number
) {
  const explicitRows =
    input.payments?.filter(
      (payment) =>
        normalizeOptionalText(payment.tenderMethodCode) ||
        normalizeOptionalText(payment.cashbookAccountId) ||
        normalizeOptionalText(String(payment.amount ?? "")) ||
        normalizeOptionalText(payment.reference) ||
        normalizeOptionalText(payment.receivedAt) ||
        normalizeOptionalText(payment.notes)
    ) ?? [];
  const legacyAmount = roundMoney(numberOrZero(input.paymentReceivedAmount));
  const rows: FuelSalePaymentRequest[] =
    explicitRows.length > 0
      ? explicitRows
      : legacyAmount > 0 || normalizeOptionalText(input.paymentCashbookAccountId)
        ? [
            {
              cashbookAccountId: input.paymentCashbookAccountId,
              amount: legacyAmount,
              reference: input.paymentReference,
              receivedAt: input.paymentDate,
              notes: input.paymentDetails
            }
          ]
        : [];
  const tenderCodes = Array.from(
    new Set(
      rows
        .map((payment) => normalizeOptionalText(payment.tenderMethodCode)?.toUpperCase())
        .filter((tenderMethodCode): tenderMethodCode is string => Boolean(tenderMethodCode))
    )
  );
  const tenderMethods = tenderCodes.length
    ? await tx.tenderMethod.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          code: {
            in: tenderCodes
          },
          status: activeStatus,
          deletedAt: null
        },
        include: {
          cashbookAccount: true
        }
      })
    : [];
  const tenderByCode = new Map(tenderMethods.map((tender) => [tender.code, tender] as const));
  const accountIds = Array.from(
    new Set(
      rows
        .map((payment) => {
          const tenderMethodCode = normalizeOptionalText(payment.tenderMethodCode)?.toUpperCase();
          const tender = tenderMethodCode ? tenderByCode.get(tenderMethodCode) : null;
          return tender?.cashbookAccountId ?? normalizeOptionalText(payment.cashbookAccountId);
        })
        .filter((cashbookAccountId): cashbookAccountId is string => Boolean(cashbookAccountId))
    )
  );
  const accounts = accountIds.length
    ? await tx.erpCashbookAccount.findMany({
        where: {
          id: {
            in: accountIds
          },
          companyId: company.id,
          status: activeStatus,
          accountType: {
            in: ["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING", "OTHER"]
          }
        }
      })
    : [];
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));
  const preparedPayments: Array<{
    cashbookAccountId: string | null;
    tenderMethodId: string | null;
    tenderMethodCodeSnapshot: string | null;
    tenderMethodNameSnapshot: string | null;
    paymentMode: string;
    amount: number;
    reference: string | null;
    receivedAt: Date | null;
    notes: string | null;
  }> = [];
  let paymentTotal = 0;
  let cashPaymentTotal = 0;
  let creditTenderTotal = 0;

  for (const [index, payment] of rows.entries()) {
    const rowNo = index + 1;
    const amount = roundMoney(numberOrZero(payment.amount));

    if (amount < 0) {
      throw new Error(`Flash ERP payment row ${rowNo} cannot be negative.`);
    }

    if (amount === 0) {
      continue;
    }

    const tenderMethodCode = normalizeOptionalText(payment.tenderMethodCode)?.toUpperCase() ?? null;
    const tender = tenderMethodCode ? tenderByCode.get(tenderMethodCode) ?? null : null;

    if (tenderMethodCode && !tender) {
      throw new Error(`Flash ERP could not find active tender method "${tenderMethodCode}" for payment row ${rowNo}.`);
    }

    const cashbookAccountId = tender?.cashbookAccountId ?? normalizeOptionalText(payment.cashbookAccountId);
    const isCreditTender = isStoreCreditPaymentMethod(tender?.paymentMethod);

    if (!cashbookAccountId && !isCreditTender) {
      throw new Error(
        tender
          ? `${tender.name} is not mapped to a Finance cashbook account on the tender page.`
          : `Flash ERP needs a tender or Finance cashbook account for payment row ${rowNo}.`
      );
    }

    const account = cashbookAccountId ? accountById.get(cashbookAccountId) ?? null : null;

    if (cashbookAccountId && !account) {
      throw new Error(`Flash ERP could not find the Finance cashbook account for payment row ${rowNo}.`);
    }

    if (account && !normalizeOptionalText(account.glAccountCode)) {
      throw new Error(
        `${account.code} must be mapped to a GL account in Finance cashbook setup before it can receive fuel sale payments.`
      );
    }

    const reference = normalizeOptionalText(payment.reference);

    if ((tender?.requiresReference || (account ? fuelPaymentRequiresReference(account.accountType) : false)) && !reference) {
      throw new Error(`${tender?.name ?? account?.name ?? "Payment"} requires a payment reference before saving the fuel sale.`);
    }

    const receivedAt =
      parseOptionalOperationDate(payment.receivedAt) ??
      parseOptionalOperationDate(input.paymentDate) ??
      new Date();

    paymentTotal = roundMoney(paymentTotal + amount);
    if (isCreditTender) {
      creditTenderTotal = roundMoney(creditTenderTotal + amount);
    } else {
      cashPaymentTotal = roundMoney(cashPaymentTotal + amount);
    }
    preparedPayments.push({
      cashbookAccountId: account?.id ?? null,
      tenderMethodId: tender?.id ?? null,
      tenderMethodCodeSnapshot: tender?.code ?? null,
      tenderMethodNameSnapshot: tender?.name ?? null,
      paymentMode: tender?.paymentMethod ?? account?.accountType ?? "CREDIT",
      amount,
      reference,
      receivedAt,
      notes: normalizeOptionalText(payment.notes)
    });
  }

  if (paymentTotal > totalAmount) {
    throw new Error("Flash ERP received payment cannot exceed the fuel sale amount.");
  }

  const paymentModes = Array.from(new Set(preparedPayments.map((payment) => payment.paymentMode)));
  const paymentDate = preparedPayments[0]?.receivedAt ?? parseOptionalOperationDate(input.paymentDate);

  return {
    paymentTotal,
    cashPaymentTotal,
    creditTenderTotal,
    primaryCashbookAccountId:
      preparedPayments.find((payment) => payment.cashbookAccountId)?.cashbookAccountId ?? null,
    paymentDate,
    paymentReference: summarizeFuelPaymentReference(preparedPayments) ?? normalizeOptionalText(input.paymentReference),
    paymentDetails: normalizeOptionalText(input.paymentDetails),
    paymentMode: paymentModes.length > 1 ? "MIXED" : paymentModes[0] ?? "CREDIT",
    payments: preparedPayments
  };
}

type FuelReceivableCustomer = {
  id: string;
  customerNo: string;
  fullName: string;
  status: string;
  loyaltyEnrolled: boolean;
  loyaltyPointsBalance: number;
  allowCreditSales: boolean;
  creditLimitAmount: Prisma.Decimal | number | null;
  receivableBalanceAmount: Prisma.Decimal | number | null;
};

async function recordFuelReceivableCharge(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  input: {
    customer: FuelReceivableCustomer | null;
    transactionNo: string;
    totalAmount: number;
    receivableAmount: number;
    occurredAt: Date;
    note: string;
  }
) {
  if (input.receivableAmount <= 0) {
    return;
  }

  const customer = input.customer;

  if (!customer) {
    throw new Error("Flash ERP needs an AR customer account before a fuel receivable can be posted.");
  }

  const postingEffect = deriveCustomerAccountPostingEffect({
    customer: {
      customerId: customer.id,
      customerNo: customer.customerNo,
      fullName: customer.fullName,
      status: customer.status,
      loyaltyEnrolled: customer.loyaltyEnrolled,
      loyaltyPointsBalance: customer.loyaltyPointsBalance,
      allowCreditSales: customer.allowCreditSales,
      creditLimitAmount:
        customer.creditLimitAmount === null || customer.creditLimitAmount === undefined
          ? null
          : toNumber(customer.creditLimitAmount),
      receivableBalanceAmount: toNumber(customer.receivableBalanceAmount)
    },
    loyaltyPolicy: {
      loyaltyProgramEnabled: false
    },
    payments: [
      {
        method: "STORE_CREDIT",
        amount: input.receivableAmount
      }
    ],
    totalAmount: input.totalAmount,
    transactionType: "SALE"
  });

  if (postingEffect.receivableDeltaAmount <= 0) {
    return;
  }

  const resultingReceivableBalance =
    postingEffect.nextReceivableBalanceAmount ?? toNumber(customer.receivableBalanceAmount);
  const resultingLoyaltyPointsBalance =
    postingEffect.nextLoyaltyPointsBalance ?? customer.loyaltyPointsBalance;

  await tx.customer.update({
    where: {
      id: customer.id
    },
    data: {
      receivableBalanceAmount: resultingReceivableBalance,
      loyaltyPointsBalance: resultingLoyaltyPointsBalance,
      lastModifiedByNodeCode: context.retailOrg.code,
      recordVersion: {
        increment: 1
      }
    }
  });

  await tx.customerAccountEntry.create({
    data: {
      retailOrgId: context.retailOrgId,
      customerId: customer.id,
      storeId: null,
      terminalId: null,
      posTransactionId: null,
      entryType: "FUEL_RECEIVABLE_CHARGE",
      transactionNoSnapshot: input.transactionNo,
      sourceTransactionNoSnapshot: null,
      receivableDeltaAmount: roundMoney(postingEffect.receivableDeltaAmount),
      loyaltyPointsDelta: 0,
      resultingReceivableBalance,
      resultingLoyaltyPointsBalance,
      note: input.note,
      originNodeCode: context.retailOrg.code,
      occurredAt: input.occurredAt
    }
  });
}

async function getFuelContext(tx: Prisma.TransactionClient = prisma): Promise<FuelContext | null> {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      status: activeStatus
    },
    select: {
      retailOrgId: true
    },
    orderBy: [{ lastHeartbeatAt: "desc" }, { createdAt: "asc" }]
  });

  if (!enterpriseNode) {
    return null;
  }

  const retailOrg = await tx.retailOrg.findUnique({
    where: {
      id: enterpriseNode.retailOrgId
    },
    select: {
      code: true,
      name: true,
      baseCurrencyCode: true,
      timezone: true,
      companySettingsJson: true
    }
  });

  if (!retailOrg) {
    return null;
  }

  const companySettings = readJsonObject(retailOrg.companySettingsJson);

  return {
    retailOrgId: enterpriseNode.retailOrgId,
    retailOrg: {
      code: retailOrg.code,
      name: retailOrg.name,
      baseCurrencyCode: retailOrg.baseCurrencyCode,
      timezone: retailOrg.timezone,
      companyLogoUrl: readJsonString(companySettings, "companyLogoUrl")
    }
  };
}

async function getPrimaryCompany(tx: Prisma.TransactionClient, context: FuelContext) {
  return tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
  });
}

async function ensureFuelDocumentSequences(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
) {
  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: {
      companyId: company.id,
      status: {
        not: "CLOSED"
      }
    },
    orderBy: {
      startsOn: "desc"
    },
    select: {
      id: true
    }
  });

  if (!fiscalYear) {
    return;
  }

  for (const sequence of [
    { documentType: "FUEL_DELIVERY", prefix: "FD" },
    { documentType: "FUEL_STATION_DELIVERY", prefix: "FSD" },
    { documentType: "FUEL_SALE", prefix: "FS" },
    { documentType: "FUEL_RECONCILIATION", prefix: "FR" }
  ]) {
    await tx.erpDocumentSequence.upsert({
      where: {
        companyId_documentType_fiscalYearId: {
          companyId: company.id,
          documentType: sequence.documentType,
          fiscalYearId: fiscalYear.id
        }
      },
      update: {},
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        fiscalYearId: fiscalYear.id,
        documentType: sequence.documentType,
        prefix: sequence.prefix,
        paddingLength: 6,
        resetPolicy: "FISCAL_YEAR",
        status: activeStatus
      }
    });
  }
}

async function ensureFuelSite(tx: Prisma.TransactionClient, context: FuelContext, company: FuelCompany) {
  const existingSite = await tx.erpOperatingSite.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      status: activeStatus
    },
    orderBy: [{ code: "asc" }]
  });

  if (existingSite) {
    return existingSite;
  }

  return tx.erpOperatingSite.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "MAIN-FUEL-SITE"
      }
    },
    update: {
      companyId: company.id,
      siteType: "FUEL_SITE",
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      code: "MAIN-FUEL-SITE",
      name: "Main Fuel Site",
      siteType: "FUEL_SITE",
      status: activeStatus
    }
  });
}

async function getFuelAccountingSettings(tx: Prisma.TransactionClient, company: FuelCompany) {
  return tx.erpAccountingSettings.findUnique({
    where: {
      companyId: company.id
    },
    select: {
      baseCurrencyCode: true,
      cashControlAccountCode: true,
      arControlAccountCode: true,
      inventoryControlAccountCode: true
    }
  });
}

const fuelInTransitDimensionCode = "IN-TRANSIT";
const fuelInventoryAdjustmentAccountCode = "5100";

async function ensureFuelFinanceDimension(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    dimensionType: "OPERATING_UNIT" | "COST_CENTER";
    code: string;
    name: string;
    description: string;
  }
) {
  const code = normalizeCode(input.code, "finance dimension code");

  await tx.erpFinanceDimension.upsert({
    where: {
      companyId_dimensionType_code: {
        companyId: company.id,
        dimensionType: input.dimensionType,
        code
      }
    },
    update: {
      name: input.name,
      description: input.description,
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      dimensionType: input.dimensionType,
      code,
      name: input.name,
      description: input.description,
      status: activeStatus
    }
  });

  return code;
}

async function ensureFuelOperatingUnitDimension(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    code: string;
    name: string;
    description: string;
  }
) {
  return ensureFuelFinanceDimension(tx, context, company, {
    ...input,
    dimensionType: "OPERATING_UNIT"
  });
}

async function ensureFuelCostCenterDimension(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    code: string;
    name: string;
    description: string;
  }
) {
  return ensureFuelFinanceDimension(tx, context, company, {
    ...input,
    dimensionType: "COST_CENTER"
  });
}

async function ensureFuelStoreOperatingUnitDimension(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  store: { code: string; name: string }
) {
  return ensureFuelOperatingUnitDimension(tx, context, company, {
    code: store.code,
    name: store.name,
    description: `Shop operating unit for ${store.name}.`
  });
}

async function ensureFuelStoreCostCenterDimension(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  store: { code: string; name: string }
) {
  return ensureFuelCostCenterDimension(tx, context, company, {
    code: store.code,
    name: store.name,
    description: `Shop P&L cost center for ${store.name}.`
  });
}

async function ensureFuelStoreFinanceDimensions(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  store: { code: string; name: string }
) {
  const operatingUnitCode = await ensureFuelStoreOperatingUnitDimension(
    tx,
    context,
    company,
    store
  );
  const costCenterCode = await ensureFuelStoreCostCenterDimension(
    tx,
    context,
    company,
    store
  );

  return { operatingUnitCode, costCenterCode };
}

async function ensureFuelInTransitOperatingUnitDimension(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
) {
  return ensureFuelOperatingUnitDimension(tx, context, company, {
    code: fuelInTransitDimensionCode,
    name: "Inventory In Transit",
    description: "Inventory value issued from one shop and not yet financially received by another shop."
  });
}

type FuelTransferPostingLine = {
  transferId: string;
  transferNo: string;
  productCode: string;
  productName: string;
  issuedQuantity: number;
  unitCost: number;
};

async function postFuelTransferIssueFinance(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    batchNo: string;
    postingDate: Date;
    sourceStore: { id: string; code: string; name: string };
    destinationStore: { id: string; code: string; name: string };
    lines: FuelTransferPostingLine[];
  }
) {
  const settings = await getFuelAccountingSettings(tx, company);
  const inventoryAccountCode = settings?.inventoryControlAccountCode ?? "1200";
  const sourceDimensionCode = await ensureFuelStoreOperatingUnitDimension(
    tx,
    context,
    company,
    input.sourceStore
  );
  await ensureFuelStoreOperatingUnitDimension(tx, context, company, input.destinationStore);
  const inTransitDimensionCode = await ensureFuelInTransitOperatingUnitDimension(tx, context, company);
  const totalAmount = roundMoney(
    input.lines.reduce((sum, line) => sum + roundMoney(line.issuedQuantity * line.unitCost), 0)
  );

  if (totalAmount <= 0) {
    throw new Error(`Flash ERP needs positive transfer cost before posting issue valuation for ${input.batchNo}.`);
  }

  const postingLines: PostAccountingDocumentLine[] = [];

  const inTransitDebitLine = appendFuelPostingLine(
    postingLines,
    inventoryAccountCode,
    totalAmount,
    "debit",
    `${input.batchNo} fuel inventory in transit`
  );
  if (inTransitDebitLine) {
    inTransitDebitLine.dimensionType = "OPERATING_UNIT";
    inTransitDebitLine.dimensionCode = inTransitDimensionCode;
  }

  const sourceCreditLine = appendFuelPostingLine(
    postingLines,
    inventoryAccountCode,
    totalAmount,
    "credit",
    `${input.batchNo} fuel transfer issue from ${input.sourceStore.code}`
  );
  if (sourceCreditLine) {
    sourceCreditLine.storeId = input.sourceStore.id;
    sourceCreditLine.dimensionType = "OPERATING_UNIT";
    sourceCreditLine.dimensionCode = sourceDimensionCode;
  }

  return postAccountingDocumentInTransaction(tx, {
    retailOrgId: context.retailOrgId,
    companyId: company.id,
    documentType: "JOURNAL",
    batchSourceType: "ERP-FUEL-TRANSFER",
    journalType: "FUEL_TRANSFER",
    sourceType: "ERP-FUEL-TRANSFER-ISSUE",
    sourceId: input.batchNo,
    sourceReference: input.batchNo,
    postingDate: input.postingDate,
    description: `${input.batchNo} fuel transfer issue valuation`,
    postedBy: "Fuel Operations",
    lines: postingLines
  });
}

function allocateFuelTransferActualQuantities(
  transferLines: FuelTransferPostingLine[],
  actualQuantityReceived: number
) {
  const expectedQuantity = roundQuantity(
    transferLines.reduce((sum, line) => sum + line.issuedQuantity, 0)
  );

  if (expectedQuantity <= 0) {
    return new Map<string, number>();
  }

  let allocated = 0;
  const allocations = new Map<string, number>();

  transferLines.forEach((line, index) => {
    const quantity =
      index === transferLines.length - 1
        ? roundQuantity(actualQuantityReceived - allocated)
        : roundQuantity((actualQuantityReceived * line.issuedQuantity) / expectedQuantity);

    allocations.set(line.transferId, quantity);
    allocated = roundQuantity(allocated + quantity);
  });

  return allocations;
}

async function postFuelTransferReceiptFinance(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    batchNo: string;
    postingDate: Date;
    destinationStore: { id: string; code: string; name: string };
    actualQuantityReceived: number;
    lines: FuelTransferPostingLine[];
  }
) {
  const settings = await getFuelAccountingSettings(tx, company);
  const inventoryAccountCode = settings?.inventoryControlAccountCode ?? "1200";
  const destinationDimensionCode = await ensureFuelStoreOperatingUnitDimension(
    tx,
    context,
    company,
    input.destinationStore
  );
  const destinationCostCenterCode = await ensureFuelStoreCostCenterDimension(
    tx,
    context,
    company,
    input.destinationStore
  );
  const inTransitDimensionCode = await ensureFuelInTransitOperatingUnitDimension(tx, context, company);
  const actualByTransferId = allocateFuelTransferActualQuantities(
    input.lines,
    input.actualQuantityReceived
  );
  const issuedAmount = roundMoney(
    input.lines.reduce((sum, line) => sum + roundMoney(line.issuedQuantity * line.unitCost), 0)
  );
  const receivedAmount = roundMoney(
    input.lines.reduce(
      (sum, line) => sum + roundMoney((actualByTransferId.get(line.transferId) ?? 0) * line.unitCost),
      0
    )
  );
  const varianceAmount = roundMoney(issuedAmount - receivedAmount);

  if (issuedAmount <= 0) {
    throw new Error(`Flash ERP needs positive transfer cost before posting receipt valuation for ${input.batchNo}.`);
  }

  const postingLines: PostAccountingDocumentLine[] = [];

  const destinationDebitLine = appendFuelPostingLine(
    postingLines,
    inventoryAccountCode,
    receivedAmount,
    "debit",
    `${input.batchNo} fuel received into ${input.destinationStore.code}`
  );
  if (destinationDebitLine) {
    destinationDebitLine.storeId = input.destinationStore.id;
    destinationDebitLine.dimensionType = "OPERATING_UNIT";
    destinationDebitLine.dimensionCode = destinationDimensionCode;
  }

  if (varianceAmount > 0) {
    const shortageDebitLine = appendFuelPostingLine(
      postingLines,
      fuelInventoryAdjustmentAccountCode,
      varianceAmount,
      "debit",
      `${input.batchNo} fuel transfer shortage`
    );
    if (shortageDebitLine) {
      shortageDebitLine.storeId = input.destinationStore.id;
      shortageDebitLine.dimensionType = "COST_CENTER";
      shortageDebitLine.dimensionCode = destinationCostCenterCode;
    }
  }

  const inTransitCreditLine = appendFuelPostingLine(
    postingLines,
    inventoryAccountCode,
    issuedAmount,
    "credit",
    `${input.batchNo} clear fuel inventory in transit`
  );
  if (inTransitCreditLine) {
    inTransitCreditLine.dimensionType = "OPERATING_UNIT";
    inTransitCreditLine.dimensionCode = inTransitDimensionCode;
  }

  if (varianceAmount < 0) {
    const gainCreditLine = appendFuelPostingLine(
      postingLines,
      fuelInventoryAdjustmentAccountCode,
      Math.abs(varianceAmount),
      "credit",
      `${input.batchNo} fuel transfer gain`
    );
    if (gainCreditLine) {
      gainCreditLine.storeId = input.destinationStore.id;
      gainCreditLine.dimensionType = "COST_CENTER";
      gainCreditLine.dimensionCode = destinationCostCenterCode;
    }
  }

  const journal = await postAccountingDocumentInTransaction(tx, {
    retailOrgId: context.retailOrgId,
    companyId: company.id,
    documentType: "JOURNAL",
    batchSourceType: "ERP-FUEL-TRANSFER",
    journalType: "FUEL_TRANSFER",
    sourceType: "ERP-FUEL-TRANSFER-RECEIPT",
    sourceId: input.batchNo,
    sourceReference: input.batchNo,
    postingDate: input.postingDate,
    description: `${input.batchNo} fuel transfer receipt valuation`,
    postedBy: "Fuel Operations",
    lines: postingLines
  });

  return {
    journal,
    issuedAmount,
    receivedAmount,
    varianceAmount,
    actualByTransferId
  };
}

async function getFuelFunctionalCurrencyCode(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
) {
  const settings = await getFuelAccountingSettings(tx, company);

  return normalizeCode(
    settings?.baseCurrencyCode ?? company.baseCurrencyCode ?? context.retailOrg.baseCurrencyCode,
    "currency"
  );
}

function getFuelCurrencyMetadata(code: string) {
  const normalizedCode = normalizeCode(code, "currency");
  const metadata: Record<string, { name: string; symbol: string }> = {
    GHS: { name: "Ghanaian Cedi", symbol: "GHS" },
    NGN: { name: "Nigerian Naira", symbol: "NGN" },
    USD: { name: "US Dollar", symbol: "$" },
    EUR: { name: "Euro", symbol: "EUR" },
    GBP: { name: "British Pound", symbol: "GBP" },
    XOF: { name: "West African CFA Franc", symbol: "CFA" },
    ZAR: { name: "South African Rand", symbol: "R" }
  };

  return metadata[normalizedCode] ?? { name: normalizedCode, symbol: normalizedCode };
}

async function ensureFuelCurrency(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  currencyCode: string
) {
  const metadata = getFuelCurrencyMetadata(currencyCode);

  await tx.erpCurrency.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: currencyCode
      }
    },
    update: {
      name: metadata.name,
      symbol: metadata.symbol,
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: currencyCode,
      name: metadata.name,
      symbol: metadata.symbol,
      isBaseCurrency: currencyCode === context.retailOrg.baseCurrencyCode,
      exchangeRateToBase: "1.000000",
      status: activeStatus
    }
  });
}

async function getFuelCurrencyOptions(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  functionalCurrencyCode: string
): Promise<FuelOperationsWorkspaceData["currencyOptions"]> {
  await ensureFuelCurrency(tx, context, functionalCurrencyCode);

  const currencies = await tx.erpCurrency.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus
    },
    orderBy: [{ isBaseCurrency: "desc" }, { code: "asc" }]
  });

  return currencies.map((currency) => ({
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    isBaseCurrency: currency.code === functionalCurrencyCode || currency.isBaseCurrency,
    label: `${currency.code} - ${currency.name}${currency.symbol ? ` (${currency.symbol})` : ""}${
      currency.code === functionalCurrencyCode ? " - functional" : ""
    }`
  }));
}

async function resolveFuelPaymentGlAccount(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
) {
  const settings = await getFuelAccountingSettings(tx, company);
  const preferredAccountCode = settings?.cashControlAccountCode ?? "1000";
  const preferredAccount = await tx.glAccount.findUnique({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: preferredAccountCode
      }
    },
    select: {
      id: true,
      code: true
    }
  });

  if (preferredAccount) {
    return preferredAccount;
  }

  return tx.glAccount.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      status: activeStatus,
      accountType: "ASSET"
    },
    orderBy: [{ code: "asc" }],
    select: {
      id: true,
      code: true
    }
  });
}

async function ensureFuelPaymentAccounts(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
) {
  const functionalCurrencyCode = await getFuelFunctionalCurrencyCode(tx, context, company);
  const glAccount = await resolveFuelPaymentGlAccount(tx, context, company);
  const glAccountCode = glAccount?.code ?? "1000";
  const accountSeeds = [
    {
      code: "MAIN-CASH",
      name: "Main cash account",
      accountType: "CASH",
      bankName: null,
      mobileProviderName: null,
      isDefault: true
    },
    {
      code: "MAIN-BANK",
      name: "Main bank account",
      accountType: "BANK",
      bankName: "Main bank",
      mobileProviderName: null,
      isDefault: false
    },
    {
      code: "MAIN-MOMO",
      name: "Main mobile money account",
      accountType: "MOBILE_MONEY",
      bankName: null,
      mobileProviderName: "Mobile money",
      isDefault: false
    }
  ];

  for (const seed of accountSeeds) {
    await tx.erpCashbookAccount.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: seed.code
        }
      },
      update: {
        glAccountId: glAccount?.id ?? null,
        name: seed.name,
        accountType: seed.accountType,
        currencyCode: functionalCurrencyCode,
        glAccountCode,
        bankName: seed.bankName,
        mobileProviderName: seed.mobileProviderName,
        reconciliationEnabled: true,
        isDefault: seed.isDefault,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        glAccountId: glAccount?.id ?? null,
        code: seed.code,
        name: seed.name,
        accountType: seed.accountType,
        currencyCode: functionalCurrencyCode,
        glAccountCode,
        bankName: seed.bankName,
        mobileProviderName: seed.mobileProviderName,
        openingBalance: 0,
        reconciliationEnabled: true,
        isDefault: seed.isDefault,
        status: activeStatus
      }
    });
  }

  return tx.erpCashbookAccount.findMany({
    where: {
      companyId: company.id,
      status: activeStatus,
      accountType: {
        in: ["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING", "OTHER"]
      }
    },
    orderBy: [{ accountType: "asc" }, { code: "asc" }]
  });
}

async function ensureFuelTenderMappings(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany
) {
  const accounts = await ensureFuelPaymentAccounts(tx, context, company);
  const accountByType = new Map(accounts.map((account) => [account.accountType, account] as const));
  const defaultTenderSeeds = [
    {
      code: "CASH",
      name: "Cash",
      paymentMethod: "CASH",
      cashbookAccountId: accountByType.get("CASH")?.id ?? null,
      requiresReference: false,
      allowChange: true,
      allowOpenCashDrawer: true,
      sortOrder: 10
    },
    {
      code: "BANK-TRANSFER",
      name: "Bank Transfer",
      paymentMethod: "BANK_TRANSFER",
      cashbookAccountId: accountByType.get("BANK")?.id ?? null,
      requiresReference: true,
      allowChange: false,
      allowOpenCashDrawer: false,
      sortOrder: 20
    },
    {
      code: "MOMO",
      name: "Mobile Money",
      paymentMethod: "MOBILE_MONEY",
      cashbookAccountId: accountByType.get("MOBILE_MONEY")?.id ?? null,
      requiresReference: true,
      allowChange: false,
      allowOpenCashDrawer: false,
      sortOrder: 30
    },
    {
      code: "VISA-MASTERCARD",
      name: "Visa / Mastercard",
      paymentMethod: "CARD",
      cashbookAccountId: accountByType.get("CARD_CLEARING")?.id ?? accountByType.get("BANK")?.id ?? null,
      requiresReference: true,
      allowChange: false,
      allowOpenCashDrawer: false,
      sortOrder: 40
    },
    {
      code: "CUSTOMER-CREDIT",
      name: "Customer Credit",
      paymentMethod: PaymentMethod.STORE_CREDIT,
      cashbookAccountId: null,
      requiresReference: false,
      allowChange: false,
      allowOpenCashDrawer: false,
      sortOrder: 50
    }
  ];

  for (const seed of defaultTenderSeeds) {
    await tx.tenderMethod.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code: seed.code
        }
      },
      update: {
        name: seed.name,
        paymentMethod: seed.paymentMethod,
        cashbookAccountId: seed.cashbookAccountId,
        requiresReference: seed.requiresReference,
        allowChange: seed.allowChange,
        allowOpenCashDrawer: seed.allowOpenCashDrawer,
        sortOrder: seed.sortOrder,
        status: activeStatus,
        deletedAt: null,
        lastModifiedByNodeCode: context.retailOrg.code
      },
      create: {
        retailOrgId: context.retailOrgId,
        cashbookAccountId: seed.cashbookAccountId,
        code: seed.code,
        name: seed.name,
        paymentMethod: seed.paymentMethod,
        requiresReference: seed.requiresReference,
        allowChange: seed.allowChange,
        allowRefund: true,
        allowOpenCashDrawer: seed.allowOpenCashDrawer,
        sortOrder: seed.sortOrder,
        status: activeStatus,
        originNodeCode: context.retailOrg.code,
        lastModifiedByNodeCode: context.retailOrg.code
      }
    });
  }

  return tx.tenderMethod.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      status: activeStatus,
      deletedAt: null
    },
    include: {
      cashbookAccount: true
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

async function ensureFuelOperationsSettings(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  siteOptions: FuelOperationsWorkspaceData["siteOptions"]
) {
  const existing = await tx.erpFuelOperationsSettings.findUnique({
    where: {
      companyId: company.id
    }
  });
  const siteIds = new Set(siteOptions.map((site) => site.operatingSiteId));
  const firstSiteId = siteOptions[0]?.operatingSiteId ?? null;
  const defaultSaleSourceSiteId =
    existing?.defaultSaleSourceSiteId && siteIds.has(existing.defaultSaleSourceSiteId)
      ? existing.defaultSaleSourceSiteId
      : firstSiteId;
  const defaultDispatchSiteId =
    existing?.defaultDispatchSiteId && siteIds.has(existing.defaultDispatchSiteId)
      ? existing.defaultDispatchSiteId
      : defaultSaleSourceSiteId;
  const saleReceiptPaperKind = normalizeReceiptPaperKind(existing?.saleReceiptPaperKind, "THERMAL");
  const deliveryReceiptPaperKind = normalizeReceiptPaperKind(
    existing?.deliveryReceiptPaperKind,
    "THERMAL"
  );
  const salesOrderReceiptPaperKind = normalizeReceiptPaperKind(
    existing?.salesOrderReceiptPaperKind,
    "A4"
  );

  return tx.erpFuelOperationsSettings.upsert({
    where: {
      companyId: company.id
    },
    update: {
      defaultSaleSourceSiteId,
      defaultDispatchSiteId,
      saleReceiptPaperKind,
      deliveryReceiptPaperKind,
      salesOrderReceiptPaperKind,
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      defaultSaleSourceSiteId,
      defaultDispatchSiteId,
      saleReceiptPaperKind,
      deliveryReceiptPaperKind,
      salesOrderReceiptPaperKind,
      status: activeStatus
    },
    select: {
      defaultSaleSourceSiteId: true,
      defaultDispatchSiteId: true,
      saleReceiptPaperKind: true,
      deliveryReceiptPaperKind: true,
      salesOrderReceiptPaperKind: true
    }
  });
}

async function ensureFuelFoundation(tx: Prisma.TransactionClient) {
  const context = await getFuelContext(tx);

  if (!context) {
    throw new Error("Flash ERP Fuel Operations is waiting for an enterprise retail organization.");
  }

  const company = await getPrimaryCompany(tx, context);

  if (!company) {
    throw new Error("Flash ERP Fuel Operations needs the Finance company foundation first.");
  }

  await ensureFuelDocumentSequences(tx, context, company);
  await ensureFuelSite(tx, context, company);
  await ensureDefaultFuelCatalogProducts(tx, context);
  await ensureDefaultFuelInventoryLocation(tx, context);
  await ensureFuelTenderMappings(tx, context, company);

  return { context, company };
}

function emptyWorkspace(message: string): FuelOperationsWorkspaceData {
  const today = dateOnly(new Date());

  return {
    currencyCode: "USD",
    functionalCurrencyCode: "USD",
    companyName: "Flash ERP",
    companyLogoUrl: null,
    statusMessage: message,
    refreshedAt: new Date().toISOString(),
    defaultOperationDate: today,
    currencyOptions: [],
    fuelSettings: {
      defaultSaleSourceSiteId: null,
      defaultDispatchSiteId: null,
      saleReceiptPaperKind: "THERMAL",
      deliveryReceiptPaperKind: "THERMAL",
      salesOrderReceiptPaperKind: "A4"
    },
    receiptTemplateOptions: [],
    siteOptions: [],
    storeOptions: [],
    userOptions: [],
    customerOptions: [],
    paymentAccountOptions: [],
    paymentTenderOptions: [],
    productOptions: [],
    tankOptions: [],
    pumpOptions: [],
    nozzleOptions: [],
    stationOptions: [],
    tankRows: [],
    pumpRows: [],
    nozzleRows: [],
    dipRows: [],
    meterReadingRows: [],
    deliveryRows: [],
    stationRows: [],
    stationDeliveryRows: [],
    fuelSaleRows: [],
    reconciliationRows: [],
    reconciliationLineRows: [],
    metrics: {
      activeTanks: 0,
      activePumps: 0,
      activeNozzles: 0,
      totalTankCapacity: 0,
      totalBookQuantity: 0,
      latestGainLossQuantity: 0,
      latestMarginAmount: 0
    }
  };
}

export function buildUnavailableFuelOperationsWorkspace(message: string): FuelOperationsWorkspaceData {
  return emptyWorkspace(message);
}

export function buildUnavailableFuelOperationsSettingsWorkspace(
  message: string
): FuelOperationsSettingsWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: message,
    refreshedAt: new Date().toISOString(),
    defaultOperationDate: dateOnly(new Date()),
    fuelSettings: {
      defaultSaleSourceSiteId: null,
      defaultDispatchSiteId: null,
      saleReceiptPaperKind: "THERMAL",
      deliveryReceiptPaperKind: "THERMAL",
      salesOrderReceiptPaperKind: "A4"
    },
    siteOptions: []
  };
}

export async function getFuelOperationsSettingsWorkspace(): Promise<FuelOperationsSettingsWorkspaceData> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const productOptions = await buildFuelProductOptions(tx, context, company);
    const siteOptions = await buildFuelSourceSiteOptions(tx, context, company, productOptions);
    const fuelSettings = await ensureFuelOperationsSettings(tx, context, company, siteOptions);

    return {
      companyName: company.tradingName ?? company.legalName,
      statusMessage: "Fuel Operations settings are ready.",
      refreshedAt: new Date().toISOString(),
      defaultOperationDate: dateOnly(new Date()),
      fuelSettings: {
        defaultSaleSourceSiteId: fuelSettings.defaultSaleSourceSiteId,
        defaultDispatchSiteId: fuelSettings.defaultDispatchSiteId,
        saleReceiptPaperKind: fuelSettings.saleReceiptPaperKind,
        deliveryReceiptPaperKind: fuelSettings.deliveryReceiptPaperKind,
        salesOrderReceiptPaperKind: fuelSettings.salesOrderReceiptPaperKind
      },
      siteOptions
    };
  });
}

type FuelOperationsWorkspaceScope = {
  storeCode?: string | null;
};

export async function getFuelOperationsWorkspace(
  scope: FuelOperationsWorkspaceScope = {}
): Promise<FuelOperationsWorkspaceData> {
  await ensureInterStoreTransferSchemaCompatibility();

  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const productOptions = await buildFuelProductOptions(tx, context, company);
    const siteOptions = await buildFuelSourceSiteOptions(tx, context, company, productOptions);
    const storeOptions = await buildFuelStationStoreOptions(tx, context, company);
    const functionalCurrencyCode = await getFuelFunctionalCurrencyCode(tx, context, company);
    const currencyOptions = await getFuelCurrencyOptions(tx, context, functionalCurrencyCode);
    const fuelSettings = await ensureFuelOperationsSettings(tx, context, company, siteOptions);

    const [
      customers,
      users,
      paymentAccounts,
      tenderMethods,
      receiptTemplates,
      tanks,
      pumps,
      nozzles,
      stations,
      dips,
      meterReadings,
      deliveries,
      stationDeliveries,
      fuelTransferDeliveries,
      fuelSales,
      reconciliations,
      reconciliationLines
    ] = await Promise.all([
      tx.customer.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          status: activeStatus,
          deletedAt: null
        },
        include: {
          erpAccountingProfiles: {
            where: {
              companyId: company.id,
              partyType: "CUSTOMER",
              status: activeStatus
            },
            take: 1
          }
        },
        orderBy: [{ customerNo: "asc" }]
      }),
      tx.retailUser.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          deletedAt: null
        },
        orderBy: [{ displayName: "asc" }, { loginId: "asc" }],
        select: {
          id: true,
          loginId: true,
          displayName: true
        }
      }),
      tx.erpCashbookAccount.findMany({
        where: {
          companyId: company.id,
          status: activeStatus,
          accountType: {
            in: ["CASH", "BANK", "MOBILE_MONEY", "CARD_CLEARING", "OTHER"]
          }
        },
        orderBy: [{ accountType: "asc" }, { code: "asc" }]
      }),
      tx.tenderMethod.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          status: activeStatus,
          deletedAt: null
        },
        include: {
          cashbookAccount: true
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      tx.receiptTemplate.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          status: activeStatus
        },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: {
          code: true,
          name: true,
          templateHtml: true,
          paperWidthMm: true,
          isDefault: true
        }
      }),
      tx.erpFuelTank.findMany({
        where: {
          companyId: company.id
        },
        include: {
          operatingSite: true,
          productProfile: true
        },
        orderBy: [{ code: "asc" }]
      }),
      tx.erpFuelPump.findMany({
        where: {
          companyId: company.id
        },
        include: {
          operatingSite: true,
          tank: {
            include: {
              productProfile: true
            }
          },
          nozzles: true
        },
        orderBy: [{ code: "asc" }]
      }),
      tx.erpFuelNozzle.findMany({
        where: {
          companyId: company.id
        },
        include: {
          pump: true,
          tank: true,
          productProfile: true
        },
        orderBy: [{ code: "asc" }]
      }),
      tx.erpFuelStation.findMany({
        where: {
          companyId: company.id
        },
        include: {
          customer: {
            include: {
              erpAccountingProfiles: {
                where: {
                  companyId: company.id,
                  partyType: "CUSTOMER",
                  status: activeStatus
                },
                take: 1
              }
            }
          },
          operatingSite: true,
          store: true,
          inventoryLocation: true
        },
        orderBy: [{ stationCode: "asc" }]
      }),
      tx.erpFuelTankDip.findMany({
        where: {
          companyId: company.id
        },
        include: {
          tank: {
            include: {
              operatingSite: true
            }
          }
        },
        orderBy: [{ dipDate: "desc" }, { createdAt: "desc" }],
        take: 50
      }),
      tx.erpFuelMeterReading.findMany({
        where: {
          companyId: company.id
        },
        include: {
          nozzle: true,
          tank: {
            include: {
              operatingSite: true
            }
          }
        },
        orderBy: [{ readingDate: "desc" }, { createdAt: "desc" }],
        take: 50
      }),
      tx.erpFuelDelivery.findMany({
        where: {
          companyId: company.id
        },
        include: {
          operatingSite: true,
          lines: {
            include: {
              productProfile: true
            }
          }
        },
        orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
        take: 50
      }),
      tx.erpFuelStationDelivery.findMany({
        where: {
          companyId: company.id
        },
        include: {
          station: {
            include: {
              store: true,
              inventoryLocation: true
            }
          },
          customer: true,
          sourceOperatingSite: true,
          lines: {
            include: {
              productProfile: true
            }
          }
        },
        orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
        take: 50
      }),
      tx.interStoreTransfer.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          workflowType: "FUEL_TRANSFER"
        },
        include: {
          fuelStation: {
            include: {
              customer: true,
              store: true,
              inventoryLocation: true
            }
          },
          sourceStore: true,
          destinationStore: true,
          sourceInventoryLocation: true,
          destinationInventoryLocation: true,
          product: true
        },
        orderBy: [{ requestedAt: "desc" }, { transferNo: "desc" }],
        take: 75
      }),
      tx.erpFuelSale.findMany({
        where: {
          companyId: company.id
        },
        include: {
          sourceOperatingSite: true,
          customer: true,
          station: true,
          paymentCashbookAccount: true,
          payments: {
            include: {
              cashbookAccount: true,
              tenderMethod: true
            },
            orderBy: [{ createdAt: "asc" }]
          },
          lines: {
            include: {
              productProfile: true
            }
          }
        },
        orderBy: [{ loadingDate: "desc" }, { createdAt: "desc" }],
        take: 50
      }),
      tx.erpFuelDailyReconciliation.findMany({
        where: {
          companyId: company.id
        },
        include: {
          operatingSite: true
        },
        orderBy: [{ reconciliationDate: "desc" }, { createdAt: "desc" }],
        take: 20
      }),
      tx.erpFuelReconciliationLine.findMany({
        where: {
          companyId: company.id
        },
        include: {
          reconciliation: true,
          tank: true,
          productProfile: true
        },
        orderBy: [{ createdAt: "desc" }],
        take: 100
      })
    ]);

    const scopedStoreCode = scope.storeCode?.trim() || null;
    const scopedSiteOptions = scopedStoreCode
      ? siteOptions.filter((site) => site.storeCode === scopedStoreCode)
      : siteOptions;
    const scopedStoreOptions = scopedStoreCode
      ? storeOptions.filter((store) => store.storeCode === scopedStoreCode)
      : storeOptions;
    const scopedSiteIds = new Set(scopedSiteOptions.map((site) => site.operatingSiteId));
    const scopedSiteCodes = new Set(scopedSiteOptions.map((site) => site.code));
    const hasShopScope = Boolean(scopedStoreCode);
    let scopedProductOptions = productOptions;

    if (hasShopScope) {
      const scopedLocations = await tx.inventoryLocation.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          code: {
            in: [...scopedSiteCodes]
          },
          store: {
            code: scopedStoreCode ?? undefined
          },
          status: activeStatus
        },
        select: {
          id: true
        }
      });
      const scopedStockGroups =
        scopedLocations.length > 0
          ? await tx.inventoryLedgerEntry.groupBy({
              by: ["productId"],
              where: {
                retailOrgId: context.retailOrgId,
                productId: {
                  in: productOptions.map((product) => product.productId)
                },
                inventoryLocationId: {
                  in: scopedLocations.map((location) => location.id)
                }
              },
              _sum: {
                quantity: true
              }
            })
          : [];
      const scopedOnHandByProductId = new Map(
        scopedStockGroups.map((group) => [
          group.productId,
          roundQuantity(toNumber(group._sum.quantity))
        ] as const)
      );

      scopedProductOptions = productOptions.map((product) => {
        const onHandQuantity = scopedOnHandByProductId.get(product.productId) ?? 0;

        return {
          ...product,
          onHandQuantity,
          priceRows: product.priceRows.filter(
            (row) => row.sourceType !== "SHOP_PRICE" || row.storeCode === scopedStoreCode
          ),
          label: `${product.code} - ${product.name} (${numberFormatterForData(onHandQuantity)} ${product.uomCode} on hand)`
        };
      });
    }

    const isScopedSiteId = (siteId: string | null | undefined) =>
      !hasShopScope || Boolean(siteId && scopedSiteIds.has(siteId));
    const isScopedSiteCode = (siteCode: string | null | undefined) =>
      !hasShopScope || Boolean(siteCode && scopedSiteCodes.has(siteCode));
    const scopedTanks = hasShopScope
      ? tanks.filter((tank) => isScopedSiteId(tank.operatingSiteId))
      : tanks;
    const scopedTankIds = new Set(scopedTanks.map((tank) => tank.id));
    const scopedPumps = hasShopScope
      ? pumps.filter((pump) => isScopedSiteId(pump.operatingSiteId))
      : pumps;
    const scopedPumpIds = new Set(scopedPumps.map((pump) => pump.id));
    const scopedNozzles = hasShopScope
      ? nozzles.filter((nozzle) => scopedTankIds.has(nozzle.tankId) && scopedPumpIds.has(nozzle.pumpId))
      : nozzles;
    const scopedStations = hasShopScope
      ? stations.filter(
          (station) =>
            station.store?.code === scopedStoreCode ||
            isScopedSiteId(station.operatingSiteId) ||
            isScopedSiteCode(station.inventoryLocation?.code)
        )
      : stations;
    const scopedStationIds = new Set(scopedStations.map((station) => station.id));
    const scopedDips = hasShopScope ? dips.filter((dip) => scopedTankIds.has(dip.tankId)) : dips;
    const scopedMeterReadings = hasShopScope
      ? meterReadings.filter((reading) => scopedTankIds.has(reading.tankId))
      : meterReadings;
    const scopedDeliveries = hasShopScope
      ? deliveries.filter((delivery) => isScopedSiteId(delivery.operatingSiteId))
      : deliveries;
    const scopedStationDeliveries = hasShopScope
      ? stationDeliveries.filter(
          (delivery) =>
            scopedStationIds.has(delivery.stationId) || isScopedSiteId(delivery.sourceOperatingSiteId)
        )
      : stationDeliveries;
    const scopedFuelTransferDeliveries = hasShopScope
      ? fuelTransferDeliveries.filter(
          (transfer) =>
            transfer.sourceStore.code === scopedStoreCode ||
            transfer.destinationStore.code === scopedStoreCode ||
            isScopedSiteCode(transfer.sourceInventoryLocation.code) ||
            isScopedSiteCode(transfer.destinationInventoryLocation.code)
        )
      : fuelTransferDeliveries;
    const scopedFuelSales = hasShopScope
      ? fuelSales.filter((sale) => isScopedSiteId(sale.sourceOperatingSiteId))
      : fuelSales;
    const scopedReconciliations = hasShopScope
      ? reconciliations.filter((reconciliation) => isScopedSiteId(reconciliation.operatingSiteId))
      : reconciliations;
    const scopedReconciliationIds = new Set(scopedReconciliations.map((reconciliation) => reconciliation.id));
    const scopedReconciliationLines = hasShopScope
      ? reconciliationLines.filter(
          (line) => scopedReconciliationIds.has(line.reconciliationId) || scopedTankIds.has(line.tankId)
        )
      : reconciliationLines;
    const scopedDefaultSaleSourceSiteId =
      !hasShopScope || scopedSiteIds.has(fuelSettings.defaultSaleSourceSiteId ?? "")
        ? fuelSettings.defaultSaleSourceSiteId
        : scopedSiteOptions[0]?.operatingSiteId ?? null;
    const scopedDefaultDispatchSiteId =
      !hasShopScope || scopedSiteIds.has(fuelSettings.defaultDispatchSiteId ?? "")
        ? fuelSettings.defaultDispatchSiteId
        : scopedSiteOptions[0]?.operatingSiteId ?? null;

    const latestReconciliation = scopedReconciliations[0] ?? null;
    const siteById = new Map(scopedSiteOptions.map((site) => [site.operatingSiteId, site] as const));
    const stationBySiteId = new Map<string, (typeof scopedStations)[number]>();

    for (const station of scopedStations) {
      const directSiteId = station.operatingSiteId;
      const locationSiteId = scopedSiteOptions.find(
        (site) => site.code === station.inventoryLocation?.code
      )?.operatingSiteId;
      const storeSiteIds = scopedSiteOptions
        .filter((site) => site.storeCode === station.store?.code)
        .map((site) => site.operatingSiteId);

      for (const siteId of [directSiteId, locationSiteId, ...storeSiteIds]) {
        if (siteId && !stationBySiteId.has(siteId)) {
          stationBySiteId.set(siteId, station);
        }
      }
    }

    return {
      currencyCode: functionalCurrencyCode,
      functionalCurrencyCode,
      companyName: company.tradingName ?? company.legalName,
      companyLogoUrl: context.retailOrg.companyLogoUrl,
      statusMessage: "Fuel Operations is ready.",
      refreshedAt: new Date().toISOString(),
      defaultOperationDate: dateOnly(new Date()),
      currencyOptions,
      fuelSettings: {
        defaultSaleSourceSiteId: scopedDefaultSaleSourceSiteId,
        defaultDispatchSiteId: scopedDefaultDispatchSiteId,
        saleReceiptPaperKind: fuelSettings.saleReceiptPaperKind,
        deliveryReceiptPaperKind: fuelSettings.deliveryReceiptPaperKind,
        salesOrderReceiptPaperKind: fuelSettings.salesOrderReceiptPaperKind
      },
      receiptTemplateOptions: receiptTemplates.map((template) => ({
        receiptTemplateCode: template.code,
        name: template.name,
        templateHtml: template.templateHtml,
        paperWidthMm: template.paperWidthMm,
        isDefault: template.isDefault,
        label: `${template.name} (${template.code}; ${
          template.paperWidthMm >= 200 ? "A4" : `${template.paperWidthMm}mm`
        }${template.isDefault ? "; default" : ""})`
      })),
      siteOptions: scopedSiteOptions,
      storeOptions: scopedStoreOptions,
      userOptions: users.map((user) => ({
        userId: user.id,
        loginId: user.loginId,
        displayName: user.displayName,
        label: `${user.displayName} (${user.loginId})`
      })),
      customerOptions: customers.map((customer) => ({
        customerId: customer.id,
        customerNo: customer.customerNo,
        fullName: customer.fullName,
        customerType: customer.customerType,
        loyaltyTier: customer.loyaltyTier,
        paymentTermsCode:
          customer.erpAccountingProfiles[0]?.paymentTermsCode ??
          (customer.allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT"),
        creditLimitAmount:
          customer.erpAccountingProfiles[0]?.creditLimitAmount === null ||
          customer.erpAccountingProfiles[0]?.creditLimitAmount === undefined
            ? customer.creditLimitAmount === null
              ? null
              : toNumber(customer.creditLimitAmount)
            : toNumber(customer.erpAccountingProfiles[0].creditLimitAmount),
        label: `${customer.customerNo} - ${customer.fullName}`
      })),
      paymentAccountOptions: paymentAccounts.map((account) => {
        const accountName =
          account.accountType === "MOBILE_MONEY"
            ? account.mobileProviderName ?? account.name
            : account.bankName ?? account.name;

        return {
          cashbookAccountId: account.id,
          code: account.code,
          name: account.name,
          accountType: account.accountType,
          glAccountCode: account.glAccountCode,
          requiresReference: account.accountType !== "CASH",
          label: `${account.code} - ${accountName} (${formatEnumLabelForData(account.accountType)}; GL ${account.glAccountCode})`
        };
      }),
      paymentTenderOptions: tenderMethods.map((tender) => {
        const account = tender.cashbookAccount;
        const accountName = account
          ? account.accountType === "MOBILE_MONEY"
            ? account.mobileProviderName ?? account.name
            : account.bankName ?? account.name
          : null;

        return {
          tenderMethodCode: tender.code,
          tenderMethodName: tender.name,
          paymentMethod: tender.paymentMethod,
          cashbookAccountId: account?.id ?? null,
          cashbookAccountCode: account?.code ?? null,
          cashbookAccountName: accountName,
          accountType: account?.accountType ?? null,
          glAccountCode: account?.glAccountCode ?? null,
          requiresReference: tender.requiresReference || (account ? fuelPaymentRequiresReference(account.accountType) : false),
          label: account
            ? `${tender.name} (${tender.code}; ${account.code}; GL ${account.glAccountCode})`
            : isStoreCreditPaymentMethod(tender.paymentMethod)
              ? `${tender.name} (${tender.code}; AR customer receivable)`
              : `${tender.name} (${tender.code}; no Finance account)`
        };
      }),
      productOptions: scopedProductOptions,
      tankOptions: scopedTanks.map((tank) => ({
        tankId: tank.id,
        code: tank.code,
        name: tank.name,
        label: `${tank.code} - ${tank.name}${tank.operatingSite?.code ? ` (${tank.operatingSite.code})` : ""}`,
        operatingSiteId: tank.operatingSiteId,
        productProfileId: tank.productProfileId,
        uomCode: tank.uomCode
      })),
      pumpOptions: scopedPumps.map((pump) => ({
        pumpId: pump.id,
        code: pump.code,
        name: pump.name,
        label: `${pump.code} - ${pump.name}${pump.tank?.code ? ` (${pump.tank.code})` : ""}`,
        tankId: pump.tankId,
        productProfileId: pump.tank?.productProfileId ?? null,
        operatingSiteId: pump.operatingSiteId ?? pump.tank?.operatingSiteId ?? null,
        uomCode: pump.tank?.uomCode ?? null
      })),
      nozzleOptions: scopedNozzles.map((nozzle) => ({
        nozzleId: nozzle.id,
        code: nozzle.code,
        name: nozzle.name,
        label: `${nozzle.pump.code}/${nozzle.code} - ${nozzle.name}`,
        tankId: nozzle.tankId,
        currentMeterReading: toNumber(nozzle.currentMeterReading)
      })),
      stationOptions: scopedStations.map((station) => {
        const storeLabel = station.store
          ? `${station.store.code} - ${station.store.name}`
          : "No linked shop";

        return {
          stationId: station.id,
          stationCode: station.stationCode,
          stationName: station.stationName,
          label: `${station.stationCode} - ${station.stationName} (${storeLabel})`,
          customerId: station.customerId,
          customerNo: station.customer?.customerNo ?? null,
          customerName: station.customer?.fullName ?? null,
          storeId: station.storeId,
          storeCode: station.store?.code ?? null,
          storeName: station.store?.name ?? null,
          inventoryLocationId: station.inventoryLocationId,
          inventoryLocationCode: station.inventoryLocation?.code ?? null,
          inventoryLocationName: station.inventoryLocation?.name ?? null
        };
      }),
      tankRows: scopedTanks.map((tank) => {
        const capacity = toNumber(tank.capacityQuantity);
        const current = toNumber(tank.currentBookQuantity);

        return {
          tankId: tank.id,
          operatingSiteId: tank.operatingSiteId,
          productProfileId: tank.productProfileId,
          code: tank.code,
          name: tank.name,
          tankType: tank.tankType,
          siteCode: tank.operatingSite?.code ?? null,
          siteName: tank.operatingSite?.name ?? null,
          productCode: tank.productProfile?.code ?? null,
          productName: tank.productProfile?.name ?? null,
          uomCode: tank.uomCode,
          capacityQuantity: capacity,
          safeCapacityQuantity:
            tank.safeCapacityQuantity === null ? null : toNumber(tank.safeCapacityQuantity),
          reorderLevelQuantity:
            tank.reorderLevelQuantity === null ? null : toNumber(tank.reorderLevelQuantity),
          openingQuantity: toNumber(tank.openingQuantity),
          currentBookQuantity: current,
          utilizationPercent: capacity === 0 ? 0 : roundRate((current / capacity) * 100),
          lastDipAt: tank.lastDipAt?.toISOString() ?? null,
          status: tank.status,
          notes: tank.notes
        };
      }),
      pumpRows: scopedPumps.map((pump) => ({
        pumpId: pump.id,
        operatingSiteId: pump.operatingSiteId ?? pump.tank?.operatingSiteId ?? null,
        tankId: pump.tankId,
        productProfileId: pump.tank?.productProfileId ?? null,
        code: pump.code,
        name: pump.name,
        pumpType: pump.pumpType,
        siteCode: pump.operatingSite?.code ?? siteById.get(pump.tank?.operatingSiteId ?? "")?.code ?? null,
        tankCode: pump.tank?.code ?? null,
        productCode: pump.tank?.productProfile?.code ?? null,
        nozzleCount: pump.nozzles.length,
        manufacturer: pump.manufacturer,
        serialNo: pump.serialNo,
        status: pump.status
      })),
      nozzleRows: scopedNozzles.map((nozzle) => ({
        nozzleId: nozzle.id,
        pumpId: nozzle.pumpId,
        tankId: nozzle.tankId,
        productProfileId: nozzle.productProfileId,
        meterUomCode: nozzle.meterUomCode,
        code: nozzle.code,
        name: nozzle.name,
        pumpCode: nozzle.pump.code,
        tankCode: nozzle.tank.code,
        productCode: nozzle.productProfile?.code ?? null,
        operatingSiteId: nozzle.tank.operatingSiteId,
        siteCode: siteById.get(nozzle.tank.operatingSiteId ?? "")?.code ?? null,
        openingMeterReading: toNumber(nozzle.openingMeterReading),
        currentMeterReading: toNumber(nozzle.currentMeterReading),
        status: nozzle.status
      })),
      dipRows: scopedDips.map((dip) => {
        const station = stationBySiteId.get(dip.tank.operatingSiteId ?? "") ?? null;

        return {
          dipId: dip.id,
          tankId: dip.tankId,
          tankCode: dip.tank.code,
          operatingSiteId: dip.tank.operatingSiteId,
          siteCode: dip.tank.operatingSite?.code ?? null,
          siteName: dip.tank.operatingSite?.name ?? null,
          stationCode: station?.stationCode ?? null,
          stationName: station?.stationName ?? null,
          dipReference: dip.dipReference,
          dipDate: dip.dipDate.toISOString(),
          dipQuantity: toNumber(dip.dipQuantity),
          waterQuantity: toNumber(dip.waterQuantity),
          bookQuantity: toNumber(dip.bookQuantity),
          varianceQuantity: toNumber(dip.varianceQuantity),
          evidenceImageUrl: dip.evidenceImageUrl,
          evidenceFileName: dip.evidenceFileName,
          evidenceCapturedAt: dip.evidenceCapturedAt?.toISOString() ?? null,
          recordedBy: dip.recordedBy,
          notes: dip.notes,
          status: dip.status
        };
      }),
      meterReadingRows: scopedMeterReadings.map((reading) => {
        const station = stationBySiteId.get(reading.tank.operatingSiteId ?? "") ?? null;

        return {
          meterReadingId: reading.id,
          nozzleId: reading.nozzleId,
          nozzleCode: `${reading.nozzle.code}`,
          tankId: reading.tankId,
          tankCode: reading.tank.code,
          operatingSiteId: reading.tank.operatingSiteId,
          siteCode: reading.tank.operatingSite?.code ?? null,
          siteName: reading.tank.operatingSite?.name ?? null,
          stationCode: station?.stationCode ?? null,
          stationName: station?.stationName ?? null,
          readingDate: reading.readingDate.toISOString(),
          shiftReference: reading.shiftReference,
          openingMeterReading: toNumber(reading.openingMeterReading),
          closingMeterReading: toNumber(reading.closingMeterReading),
          salesQuantity: toNumber(reading.salesQuantity),
          adjustmentQuantity: toNumber(reading.adjustmentQuantity),
          unitSellingPrice: toNumber(reading.unitSellingPrice),
          salesAmount: toNumber(reading.salesAmount),
          evidenceImageUrl: reading.evidenceImageUrl,
          evidenceFileName: reading.evidenceFileName,
          evidenceCapturedAt: reading.evidenceCapturedAt?.toISOString() ?? null,
          recordedBy: reading.recordedBy,
          notes: reading.notes,
          status: reading.status
        };
      }),
      deliveryRows: scopedDeliveries.map((delivery) => {
        const uomCodes = Array.from(
          new Set(delivery.lines.map((line) => line.productProfile?.defaultUomCode ?? "LTR"))
        );

        return {
          deliveryId: delivery.id,
          deliveryNo: delivery.deliveryNo,
          deliveryDate: delivery.deliveryDate.toISOString(),
          createdAt: delivery.createdAt.toISOString(),
          supplierName: delivery.supplierName,
          supplierDocumentNo: delivery.supplierDocumentNo,
          siteCode: delivery.operatingSite?.code ?? null,
          uomSummary: uomCodes.length === 0 ? "LTR" : uomCodes.length === 1 ? uomCodes[0] : "Mixed",
          totalOrderedQuantity: toNumber(delivery.totalOrderedQuantity),
          totalDeliveredQuantity: toNumber(delivery.totalDeliveredQuantity),
          totalAcceptedQuantity: toNumber(delivery.totalAcceptedQuantity),
          totalVarianceQuantity: toNumber(delivery.totalVarianceQuantity),
          totalCostAmount: toNumber(delivery.totalCostAmount),
          status: delivery.status
        };
      }),
      stationRows: scopedStations.map((station) => ({
        stationId: station.id,
        customerId: station.customerId,
        storeId: station.storeId,
        inventoryLocationId: station.inventoryLocationId,
        operatingSiteId: station.operatingSiteId,
        stationCode: station.stationCode,
        stationName: station.stationName,
        stationType: station.stationType,
        customerNo: station.customer?.customerNo ?? null,
        customerName: station.customer?.fullName ?? null,
        storeCode: station.store?.code ?? null,
        storeName: station.store?.name ?? null,
        inventoryLocationCode: station.inventoryLocation?.code ?? null,
        inventoryLocationName: station.inventoryLocation?.name ?? null,
        operatingSiteCode: station.operatingSite?.code ?? null,
        paymentTermsCode:
          station.customer?.erpAccountingProfiles[0]?.paymentTermsCode ??
          station.paymentTermsCode ??
          (station.customer?.allowCreditSales ? "NET-30" : null),
        creditLimitAmount:
          station.customer?.erpAccountingProfiles[0]?.creditLimitAmount === null ||
          station.customer?.erpAccountingProfiles[0]?.creditLimitAmount === undefined
            ? station.customer?.creditLimitAmount === null || station.customer?.creditLimitAmount === undefined
              ? station.creditLimitAmount === null
                ? null
                : toNumber(station.creditLimitAmount)
              : toNumber(station.customer.creditLimitAmount)
            : toNumber(station.customer.erpAccountingProfiles[0].creditLimitAmount),
        location: station.location,
        city: station.city,
        contactName: station.contactName,
        phone: station.phone,
        gpsLatitude: station.gpsLatitude === null ? null : toNumber(station.gpsLatitude),
        gpsLongitude: station.gpsLongitude === null ? null : toNumber(station.gpsLongitude),
        notes: station.notes,
        status: station.status
      })),
      stationDeliveryRows: [
        ...scopedFuelTransferDeliveries.map((transfer) => {
          const issuedQuantity = toNumber(transfer.issuedQuantity);
          const receivedQuantity = toNumber(transfer.receivedQuantity);
          const unitCost = transfer.unitCost === null ? 0 : toNumber(transfer.unitCost);
          const costAmount = roundMoney(issuedQuantity * unitCost);
          const stationName =
            transfer.fuelStation?.stationName ?? transfer.destinationStore.name;
          const stationCode =
            transfer.fuelStation?.stationCode ?? transfer.destinationStore.code;
          const uomCode = transfer.product.unitOfMeasure ?? "LTR";

          return {
            stationDeliveryId: transfer.id,
            deliveryNo: transfer.transferBatchNo ?? transfer.transferNo,
            deliveryDate: transfer.issuedAt?.toISOString() ?? transfer.requestedAt.toISOString(),
            createdAt: transfer.createdAt.toISOString(),
            stationCode,
            stationName,
            customerNo: transfer.fuelStation?.customer?.customerNo ?? null,
            customerName: stationName,
            sourceSiteCode: transfer.sourceInventoryLocation.code,
            currencyCode: functionalCurrencyCode,
            totalLoadedQuantity: issuedQuantity,
            totalDeliveredQuantity: receivedQuantity,
            totalVarianceQuantity: roundQuantity(receivedQuantity - issuedQuantity),
            totalSalesAmount: 0,
            totalCostAmount: costAmount,
            marginAmount: 0,
            uomSummary: uomCode,
            amountReceived: 0,
            outstandingAmount: 0,
            paymentMode: "TRANSFER",
            paymentReceivedAt: null,
            paymentReference: transfer.externalReference,
            paymentStatus: "NOT_APPLICABLE",
            invoiceStatus: "NOT_APPLICABLE",
            lines: [
              {
                lineId: transfer.id,
                productCode: transfer.product.code,
                productName: transfer.product.name,
                uomCode,
                orderedQuantity: toNumber(transfer.requestedQuantity),
                loadedQuantity: issuedQuantity,
                deliveredQuantity: receivedQuantity,
                unitSellingPrice: 0,
                salesAmount: 0,
                unitCost,
                costAmount,
                marginAmount: 0,
                notes: transfer.issueNote ?? transfer.requestNote
              }
            ],
            transferBatchNo: transfer.transferBatchNo,
            transferNo: transfer.transferNo,
            destinationStoreCode: transfer.destinationStore.code,
            destinationStoreName: transfer.destinationStore.name,
            destinationLocationCode: transfer.destinationInventoryLocation.code,
            destinationLocationName: transfer.destinationInventoryLocation.name,
            transporterName: transfer.transporterName,
            vehicleRegistrationNo: transfer.vehicleRegistrationNo,
            driverName: transfer.driverName,
            driverContact: transfer.driverContact,
            deliveryNoteNo: transfer.deliveryNoteNo,
            feedbackStatus: transfer.feedbackStatus,
            valuationStatus: transfer.valuationStatus,
            issueJournalEntryId: transfer.issueJournalEntryId,
            receiptJournalEntryId: transfer.receiptJournalEntryId,
            issuedValuationAmount:
              transfer.issuedValuationAmount === null ? null : toNumber(transfer.issuedValuationAmount),
            receivedValuationAmount:
              transfer.receivedValuationAmount === null ? null : toNumber(transfer.receivedValuationAmount),
            varianceValuationAmount:
              transfer.varianceValuationAmount === null ? null : toNumber(transfer.varianceValuationAmount),
            valuationPostedAt: transfer.valuationPostedAt?.toISOString() ?? null,
            waterTestResult: transfer.waterTestResult,
            quantityBeforeDelivery:
              transfer.quantityBeforeDelivery === null ? null : toNumber(transfer.quantityBeforeDelivery),
            expectedQuantityReceived:
              transfer.expectedQuantityReceived === null ? null : toNumber(transfer.expectedQuantityReceived),
            expectedStockQuantity:
              transfer.expectedStockQuantity === null ? null : toNumber(transfer.expectedStockQuantity),
            quantityAfterDelivery:
              transfer.quantityAfterDelivery === null ? null : toNumber(transfer.quantityAfterDelivery),
            actualQuantityReceived:
              transfer.actualQuantityReceived === null ? null : toNumber(transfer.actualQuantityReceived),
            feedbackVarianceQuantity:
              transfer.feedbackVarianceQuantity === null ? null : toNumber(transfer.feedbackVarianceQuantity),
            feedbackDipReading:
              transfer.feedbackDipReading === null ? null : toNumber(transfer.feedbackDipReading),
            beforeDischargeEvidence: normalizeTransferFeedbackEvidence(
              transfer.beforeDischargeEvidenceJson
            ),
            afterDischargeEvidence: normalizeTransferFeedbackEvidence(
              transfer.afterDischargeEvidenceJson
            ),
            feedbackNote: transfer.feedbackNote,
            feedbackRecordedAt: transfer.feedbackRecordedAt?.toISOString() ?? null,
            feedbackConfirmedAt: transfer.feedbackConfirmedAt?.toISOString() ?? null,
            feedbackPostedAt: transfer.feedbackPostedAt?.toISOString() ?? null,
            status: transfer.status
          };
        }),
        ...scopedStationDeliveries.map((delivery) => {
          const uomCodes = Array.from(
            new Set(
              delivery.lines.map((line) => line.productProfile?.defaultUomCode ?? "LTR")
            )
          );

          return {
            stationDeliveryId: delivery.id,
            deliveryNo: delivery.deliveryNo,
            deliveryDate: delivery.deliveryDate.toISOString(),
            createdAt: delivery.createdAt.toISOString(),
            stationCode: delivery.station.stationCode,
            stationName: delivery.station.stationName,
            customerNo: delivery.customer?.customerNo ?? null,
            customerName: delivery.customer?.fullName ?? delivery.station.stationName,
            sourceSiteCode: delivery.sourceOperatingSite?.code ?? null,
            currencyCode: delivery.currencyCode,
            totalLoadedQuantity: toNumber(delivery.totalLoadedQuantity),
            totalDeliveredQuantity: toNumber(delivery.totalDeliveredQuantity),
            totalVarianceQuantity: toNumber(delivery.totalVarianceQuantity),
            totalSalesAmount: toNumber(delivery.totalSalesAmount),
            totalCostAmount: toNumber(delivery.totalCostAmount),
            marginAmount: toNumber(delivery.marginAmount),
            uomSummary: uomCodes.length === 0 ? "LTR" : uomCodes.length === 1 ? uomCodes[0] : "Mixed",
            amountReceived: toNumber(delivery.amountReceived),
            outstandingAmount: toNumber(delivery.outstandingAmount),
            paymentMode: delivery.paymentMode,
            paymentReceivedAt: delivery.paymentReceivedAt?.toISOString() ?? null,
            paymentReference: delivery.paymentReference,
            paymentStatus: delivery.paymentStatus,
            invoiceStatus: delivery.invoiceStatus,
            lines: delivery.lines.map((line) => ({
              lineId: line.id,
              productCode: line.productProfile?.code ?? null,
              productName: line.productProfile?.name ?? null,
              uomCode: line.productProfile?.defaultUomCode ?? "LTR",
              orderedQuantity: toNumber(line.orderedQuantity),
              loadedQuantity: toNumber(line.loadedQuantity),
              deliveredQuantity: toNumber(line.deliveredQuantity),
              unitSellingPrice: toNumber(line.unitSellingPrice),
              salesAmount: toNumber(line.salesAmount),
              unitCost: toNumber(line.unitCost),
              costAmount: toNumber(line.costAmount),
              marginAmount: toNumber(line.marginAmount),
              notes: line.notes
            })),
            transferBatchNo: null,
            transferNo: null,
            destinationStoreCode: delivery.station.store?.code ?? null,
            destinationStoreName: delivery.station.store?.name ?? null,
            destinationLocationCode: delivery.station.inventoryLocation?.code ?? null,
            destinationLocationName: delivery.station.inventoryLocation?.name ?? null,
            transporterName: delivery.transporterName,
            vehicleRegistrationNo: delivery.vehicleRegistrationNo,
            driverName: delivery.driverName,
            driverContact: null,
            deliveryNoteNo: delivery.deliveryNoteNo,
            feedbackStatus: "NOT_APPLICABLE",
            valuationStatus: "LEGACY_SALE",
            issueJournalEntryId: null,
            receiptJournalEntryId: null,
            issuedValuationAmount: toNumber(delivery.totalCostAmount),
            receivedValuationAmount: toNumber(delivery.totalCostAmount),
            varianceValuationAmount: 0,
            valuationPostedAt: null,
            waterTestResult: null,
            quantityBeforeDelivery: null,
            expectedQuantityReceived: null,
            expectedStockQuantity: null,
            quantityAfterDelivery: null,
            actualQuantityReceived: null,
            feedbackVarianceQuantity: null,
            feedbackDipReading: null,
            beforeDischargeEvidence: [],
            afterDischargeEvidence: [],
            feedbackNote: null,
            feedbackRecordedAt: null,
            feedbackConfirmedAt: null,
            feedbackPostedAt: null,
            status: delivery.status
          };
        })
      ],
      fuelSaleRows: scopedFuelSales.map((sale) => {
        const productCodes = Array.from(
          new Set(sale.lines.map((line) => line.productCodeSnapshot))
        );
        const uomCodes = Array.from(
          new Set(sale.lines.map((line) => line.productProfile?.defaultUomCode ?? "LTR"))
        );
        const unitPrices = Array.from(new Set(sale.lines.map((line) => toNumber(line.unitPrice))));
        const paymentAccount = sale.paymentCashbookAccount
          ? sale.paymentCashbookAccount.accountType === "MOBILE_MONEY"
            ? sale.paymentCashbookAccount.mobileProviderName ?? sale.paymentCashbookAccount.name
            : sale.paymentCashbookAccount.bankName ?? sale.paymentCashbookAccount.name
          : null;
        const paymentAccountNames = Array.from(
          new Set(
            sale.payments.map((payment) => {
              if (payment.tenderMethodNameSnapshot || payment.tenderMethod?.name) {
                return payment.tenderMethodNameSnapshot ?? payment.tenderMethod?.name ?? "Tender";
              }

              if (payment.cashbookAccount) {
                return payment.cashbookAccount.accountType === "MOBILE_MONEY"
                  ? payment.cashbookAccount.mobileProviderName ?? payment.cashbookAccount.name
                  : payment.cashbookAccount.bankName ?? payment.cashbookAccount.name;
              }

              return payment.paymentMode === PaymentMethod.STORE_CREDIT ? "Customer credit" : "Tender";
            })
          )
        );

        return {
          fuelSaleId: sale.id,
          saleNo: sale.saleNo,
          loadingDate: sale.loadingDate.toISOString(),
          dispatchDate: sale.dispatchDate?.toISOString() ?? null,
          createdAt: sale.createdAt.toISOString(),
          sourceSiteCode: sale.sourceOperatingSite.code,
          sourceSiteName: sale.sourceOperatingSite.name,
          currencyCode: sale.currencyCode,
          customerName: sale.customerName,
          customerNo: sale.customer?.customerNo ?? null,
          stationCode: sale.station?.stationCode ?? null,
          stationName: sale.station?.stationName ?? null,
          serviceType: sale.serviceType,
          productSummary:
            productCodes.length === 0
              ? "Not set"
              : productCodes.length === 1
                ? productCodes[0]
                : "Mixed",
          uomSummary: uomCodes.length === 0 ? "LTR" : uomCodes.length === 1 ? uomCodes[0] : "Mixed",
          quantity: toNumber(sale.totalQuantity),
          unitPrice: unitPrices.length === 1 ? unitPrices[0] : null,
          totalAmount: toNumber(sale.totalAmount),
          paymentReceivedAmount: toNumber(sale.paymentReceivedAmount),
          balanceAmount: toNumber(sale.balanceAmount),
          paymentDate: sale.paymentDate?.toISOString() ?? null,
          paymentAccountName:
            paymentAccountNames.length > 1
              ? "Mixed payments"
              : paymentAccountNames[0] ?? paymentAccount,
          paymentReference: sale.paymentReference,
          paymentDetails: sale.paymentDetails,
          truckLoaded: sale.truckLoaded,
          lines: sale.lines.map((line) => ({
            lineId: line.id,
            productCode: line.productCodeSnapshot,
            productName: line.productNameSnapshot,
            uomCode: line.productProfile?.defaultUomCode ?? "LTR",
            quantity: toNumber(line.quantity),
            unitPrice: toNumber(line.unitPrice),
            lineAmount: toNumber(line.lineAmount),
            notes: line.notes
          })),
          payments: sale.payments.map((payment) => ({
            paymentId: payment.id,
            tenderMethodCode: payment.tenderMethodCodeSnapshot ?? payment.tenderMethod?.code ?? null,
            tenderMethodName: payment.tenderMethodNameSnapshot ?? payment.tenderMethod?.name ?? null,
            paymentMode: payment.paymentMode,
            cashbookAccountCode: payment.cashbookAccount?.code ?? null,
            cashbookAccountName: payment.cashbookAccount?.name ?? null,
            amount: toNumber(payment.amount),
            reference: payment.reference,
            receivedAt: payment.receivedAt?.toISOString() ?? null,
            notes: payment.notes
          })),
          paymentStatus: sale.paymentStatus,
          status: sale.status
        };
      }),
      reconciliationRows: scopedReconciliations.map((reconciliation) => ({
        reconciliationId: reconciliation.id,
        reconciliationNo: reconciliation.reconciliationNo,
        reconciliationDate: reconciliation.reconciliationDate.toISOString(),
        siteCode: reconciliation.operatingSite?.code ?? null,
        totalDeliveredQuantity: toNumber(reconciliation.totalDeliveredQuantity),
        totalStationDeliveryQuantity: toNumber(reconciliation.totalStationDeliveryQuantity),
        totalMeterSalesQuantity: toNumber(reconciliation.totalMeterSalesQuantity),
        totalGainLossQuantity: toNumber(reconciliation.totalGainLossQuantity),
        totalSalesAmount: toNumber(reconciliation.totalSalesAmount),
        totalCostAmount: toNumber(reconciliation.totalCostAmount),
        marginAmount: toNumber(reconciliation.marginAmount),
        marginPercent: toNumber(reconciliation.marginPercent),
        status: reconciliation.status
      })),
      reconciliationLineRows: scopedReconciliationLines.map((line) => ({
        reconciliationLineId: line.id,
        reconciliationNo: line.reconciliation.reconciliationNo,
        tankCode: line.tank.code,
        productCode: line.productProfile?.code ?? null,
        openingQuantity: toNumber(line.openingQuantity),
        deliveredQuantity: toNumber(line.deliveredQuantity),
        stationDeliveryQuantity: toNumber(line.stationDeliveryQuantity),
        meterSalesQuantity: toNumber(line.meterSalesQuantity),
        bookClosingQuantity: toNumber(line.bookClosingQuantity),
        dipClosingQuantity: toNumber(line.dipClosingQuantity),
        gainLossQuantity: toNumber(line.gainLossQuantity),
        stationDeliverySalesAmount: toNumber(line.stationDeliverySalesAmount),
        stationDeliveryCostAmount: toNumber(line.stationDeliveryCostAmount),
        salesAmount: toNumber(line.salesAmount),
        costAmount: toNumber(line.costAmount),
        marginAmount: toNumber(line.marginAmount),
        marginPercent: toNumber(line.marginPercent)
      })),
      metrics: {
        activeTanks: scopedTanks.filter((tank) => tank.status === activeStatus).length,
        activePumps: scopedPumps.filter((pump) => pump.status === activeStatus).length,
        activeNozzles: scopedNozzles.filter((nozzle) => nozzle.status === activeStatus).length,
        totalTankCapacity: roundQuantity(
          scopedTanks.reduce((total, tank) => total + toNumber(tank.capacityQuantity), 0)
        ),
        totalBookQuantity: roundQuantity(
          scopedTanks.reduce((total, tank) => total + toNumber(tank.currentBookQuantity), 0)
        ),
        latestGainLossQuantity: latestReconciliation
          ? toNumber(latestReconciliation.totalGainLossQuantity)
          : 0,
        latestMarginAmount: latestReconciliation ? toNumber(latestReconciliation.marginAmount) : 0
      }
    };
  });
}

async function validateSite(
  tx: Prisma.TransactionClient,
  companyId: string,
  operatingSiteId: string | null
) {
  if (!operatingSiteId) {
    return null;
  }

  const site = await tx.erpOperatingSite.findFirst({
    where: {
      id: operatingSiteId,
      companyId
    }
  });

  if (!site) {
    throw new Error("Flash ERP could not find that fuel operating site.");
  }

  return site;
}

async function validateCustomer(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  customerId: string | null
) {
  if (!customerId) {
    return null;
  }

  const customer = await tx.customer.findFirst({
    where: {
      id: customerId,
      retailOrgId,
      deletedAt: null
    }
  });

  if (!customer) {
    throw new Error("Flash ERP could not find that filling-station customer.");
  }

  return customer;
}

async function resolveFuelStationStoreLocation(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  storeId: string | null,
  inventoryLocationId: string | null
) {
  if (!storeId) {
    throw new Error("Flash ERP needs a shop linked to this filling station.");
  }

  const store = await tx.store.findFirst({
    where: {
      id: storeId,
      retailOrgId,
      status: activeStatus
    },
    include: {
      inventoryLocations: {
        where: {
          status: activeStatus
        },
        orderBy: [
          { useForReceivingDefault: "desc" },
          { useForSalesDefault: "desc" },
          { code: "asc" }
        ]
      }
    }
  });

  if (!store) {
    throw new Error("Flash ERP could not find the selected filling-station shop.");
  }

  const destinationLocation = inventoryLocationId
    ? store.inventoryLocations.find((location) => location.id === inventoryLocationId) ?? null
    : store.inventoryLocations[0] ?? null;

  if (!destinationLocation) {
    if (inventoryLocationId) {
      throw new Error("Flash ERP needs the filling-station receiving location to belong to the linked shop.");
    }

    throw new Error(
      `Flash ERP needs an active inventory location for shop ${store.code} before fuel can be transferred there.`
    );
  }

  return {
    store,
    inventoryLocation: destinationLocation
  };
}

async function validateFuelProduct(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  productProfileId: string | null
) {
  if (!productProfileId) {
    return null;
  }

  const product = await tx.erpProductProfile.findFirst({
    where: {
      id: productProfileId,
      retailOrgId
    }
  });

  if (!product) {
    throw new Error("Flash ERP could not find that fuel product profile.");
  }

  return product;
}

async function resolveFuelCatalogProduct(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: { productId?: string | null; productProfileId?: string | null }
) {
  const productId = normalizeOptionalText(input.productId);
  const productProfileId = normalizeOptionalText(input.productProfileId);
  let product: FuelCatalogProduct | null = null;

  if (productId) {
    product = await tx.product.findFirst({
      where: {
        id: productId,
        retailOrgId: context.retailOrgId,
        status: activeStatus,
        deletedAt: null,
        trackInventory: true
      },
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        shortName: true,
        department: true,
        category: true,
        subcategory: true,
        unitOfMeasure: true,
        baseUnitPrice: true,
        baseCostPrice: true
      }
    });
  }

  if (!product && productProfileId) {
    const profile = await validateFuelProduct(tx, context.retailOrgId, productProfileId);

    if (profile) {
      product = await tx.product.findFirst({
        where: {
          retailOrgId: context.retailOrgId,
          status: activeStatus,
          deletedAt: null,
          trackInventory: true,
          OR: [{ code: profile.code }, { sku: profile.code }]
        },
        select: {
          id: true,
          code: true,
          sku: true,
          name: true,
          shortName: true,
          department: true,
          category: true,
          subcategory: true,
          unitOfMeasure: true,
          baseUnitPrice: true,
          baseCostPrice: true
        }
      });
    }
  }

  if (!product || !isFuelCatalogProduct(product)) {
    throw new Error(
      "Flash ERP needs a fuel product from the Products page before saving this fuel operation."
    );
  }

  const profile = await ensureFuelProductProfileFromCatalogProduct(tx, context, company, product);

  return { product, profile };
}

async function getSourceSiteInventoryLocationIds(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  sourceSite: { code: string }
) {
  const locations = await tx.inventoryLocation.findMany({
    where: {
      retailOrgId,
      status: activeStatus,
      OR: [
        { code: sourceSite.code },
        {
          store: {
            code: sourceSite.code
          }
        }
      ]
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeId: true,
      warehouseId: true,
      useForSalesDefault: true,
      useForReceivingDefault: true,
      store: {
        select: {
          code: true,
          name: true
        }
      }
    },
    orderBy: [
      { useForSalesDefault: "desc" },
      { useForReceivingDefault: "desc" },
      { code: "asc" }
    ]
  });

  return locations;
}

type FuelSourceInventoryLocation = Awaited<
  ReturnType<typeof getSourceSiteInventoryLocationIds>
>[number];

async function resolveFuelSourceStoreForCostCenter(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  sourceSite: { code: string }
) {
  const sourceLocations = await getSourceSiteInventoryLocationIds(tx, retailOrgId, sourceSite);
  const sourceLocation =
    sourceLocations.find((location) => location.storeId && location.store) ??
    sourceLocations.find((location) => location.storeId) ??
    null;

  if (!sourceLocation?.storeId || !sourceLocation.store) {
    return null;
  }

  return {
    id: sourceLocation.storeId,
    code: sourceLocation.store.code,
    name: sourceLocation.store.name
  };
}

async function resolveFuelTransferSourceInventoryLocation(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  sourceSite: { code: string }
) {
  const sourceLocations = await getSourceSiteInventoryLocationIds(tx, retailOrgId, sourceSite);
  const sourceLocation =
    sourceLocations.find((location) => location.storeId) ?? sourceLocations[0] ?? null;

  if (!sourceLocation) {
    throw new Error("Flash ERP could not find the selected source stock location.");
  }

  if (!sourceLocation.storeId) {
    throw new Error(
      `Flash ERP needs source location ${sourceLocation.code} linked to a shop before creating a store transfer.`
    );
  }

  return sourceLocation;
}

function normalizedMatch(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function scorePriceListForCustomer(
  priceList: { isDefault: boolean; customerType: string | null; loyaltyTier: string | null },
  customer: { customerType: string; loyaltyTier: string | null } | null
) {
  if (!customer) {
    return priceList.isDefault ? 10 : 0;
  }

  const customerTypeMatches =
    Boolean(priceList.customerType) &&
    normalizedMatch(priceList.customerType) === normalizedMatch(customer.customerType);
  const loyaltyTierMatches =
    Boolean(priceList.loyaltyTier) &&
    normalizedMatch(priceList.loyaltyTier) === normalizedMatch(customer.loyaltyTier);

  if (customerTypeMatches && loyaltyTierMatches) {
    return 40;
  }

  if (loyaltyTierMatches) {
    return 35;
  }

  if (customerTypeMatches) {
    return 30;
  }

  return priceList.isDefault ? 10 : 0;
}

async function resolveFuelSellingPrice(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  input: {
    sourceSite: { code: string };
    product: { id: string; code: string; baseUnitPrice: Prisma.Decimal };
    customer: { customerType: string; loyaltyTier: string | null } | null;
    requestedUnitPrice?: number | string | null;
  }
) {
  const requestedPrice = optionalNumber(input.requestedUnitPrice, "sale price");

  if (requestedPrice !== null && requestedPrice > 0) {
    return roundRate(requestedPrice);
  }

  const priceListEntries = await tx.priceListEntry.findMany({
    where: {
      productId: input.product.id,
      priceList: {
        retailOrgId: context.retailOrgId,
        status: activeStatus
      }
    },
    include: {
      priceList: true
    }
  });
  const bestPriceListEntry =
    priceListEntries
      .map((entry) => ({
        entry,
        score: scorePriceListForCustomer(entry.priceList, input.customer)
      }))
      .filter((entry) => entry.score > 0 && toNumber(entry.entry.unitPrice) > 0)
      .sort((left, right) => right.score - left.score)[0]?.entry ?? null;

  if (bestPriceListEntry && !bestPriceListEntry.priceList.isDefault) {
    return roundRate(toNumber(bestPriceListEntry.unitPrice));
  }

  const sourceLocations = await getSourceSiteInventoryLocationIds(
    tx,
    context.retailOrgId,
    input.sourceSite
  );
  const sourceStoreIds = Array.from(
    new Set(
      sourceLocations
        .map((location) => location.storeId)
        .filter((storeId): storeId is string => Boolean(storeId))
    )
  );

  if (sourceStoreIds.length > 0) {
    const storePrices = await tx.storeProductPrice.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        productId: input.product.id,
        productVariantId: null,
        storeId: {
          in: sourceStoreIds
        },
        status: activeStatus
      },
      orderBy: [{ updatedAt: "desc" }]
    });
    const storePriority = new Map(sourceStoreIds.map((storeId, index) => [storeId, index] as const));
    const storePrice =
      storePrices
        .filter((price) => toNumber(price.unitPrice) > 0)
        .sort(
          (left, right) =>
            (storePriority.get(left.storeId) ?? 999) - (storePriority.get(right.storeId) ?? 999)
        )[0] ?? null;

    if (storePrice) {
      return roundRate(toNumber(storePrice.unitPrice));
    }
  }

  if (bestPriceListEntry) {
    return roundRate(toNumber(bestPriceListEntry.unitPrice));
  }

  const basePrice = roundRate(toNumber(input.product.baseUnitPrice));

  if (basePrice > 0) {
    return basePrice;
  }

  throw new Error(
    `Flash ERP needs an active shop price, customer price list, default price list, or product base price for ${input.product.code}.`
  );
}

async function getWeightedAverageInventoryCostRate(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  sourceSite: { code: string },
  input: { productId: string; fallbackUnitCost: Prisma.Decimal | number | null }
) {
  const sourceLocations = await getSourceSiteInventoryLocationIds(
    tx,
    context.retailOrgId,
    sourceSite
  );
  const sourceLocationIds = sourceLocations.map((location) => location.id);

  if (sourceLocationIds.length === 0) {
    return roundRate(toNumber(input.fallbackUnitCost));
  }

  const costedEntries = await tx.inventoryLedgerEntry.findMany({
    where: {
      retailOrgId: context.retailOrgId,
      inventoryLocationId: {
        in: sourceLocationIds
      },
      productId: input.productId,
      unitCost: {
        not: null
      }
    },
    select: {
      quantity: true,
      unitCost: true
    }
  });
  let stockQuantity = 0;
  let stockValue = 0;

  for (const entry of costedEntries) {
    const quantity = toNumber(entry.quantity);
    const unitCost = toNumber(entry.unitCost);

    stockQuantity += quantity;
    stockValue += quantity * unitCost;
  }

  if (stockQuantity > 0 && stockValue > 0) {
    return roundRate(stockValue / stockQuantity);
  }

  const receiptEntries = costedEntries.filter((entry) => toNumber(entry.quantity) > 0);
  const receiptQuantity = receiptEntries.reduce((sum, entry) => sum + toNumber(entry.quantity), 0);
  const receiptValue = receiptEntries.reduce(
    (sum, entry) => sum + toNumber(entry.quantity) * toNumber(entry.unitCost),
    0
  );

  if (receiptQuantity > 0 && receiptValue > 0) {
    return roundRate(receiptValue / receiptQuantity);
  }

  return roundRate(toNumber(input.fallbackUnitCost));
}

type FuelInventorySaleLine = {
  catalogProductId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unitCost: number | null;
};

type FuelInventorySaleMovement = {
  line: FuelInventorySaleLine;
  location: FuelSourceInventoryLocation;
  quantity: number;
};

async function buildFuelInventorySaleMovements(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  sourceSite: { code: string },
  saleLines: FuelInventorySaleLine[],
  actionLabel: string
) {
  const requestedByProduct = new Map<string, { code: string; quantity: number }>();

  for (const line of saleLines) {
    const current = requestedByProduct.get(line.catalogProductId) ?? {
      code: line.productCodeSnapshot,
      quantity: 0
    };

    requestedByProduct.set(line.catalogProductId, {
      code: current.code,
      quantity: roundQuantity(current.quantity + line.quantity)
    });
  }

  const sourceLocations = await getSourceSiteInventoryLocationIds(
    tx,
    context.retailOrgId,
    sourceSite
  );

  if (sourceLocations.length === 0) {
    throw new Error(
      `Flash ERP could not match fuel source ${sourceSite.code} to an RMS inventory location. Select the GRN store/location from the Item Dynamic source list.`
    );
  }

  const sourceLocationIds = sourceLocations.map((location) => location.id);
  const requestedProductIds = [...requestedByProduct.keys()];
  const stockGroups = await tx.inventoryLedgerEntry.groupBy({
    by: ["productId", "inventoryLocationId"],
    where: {
      retailOrgId: context.retailOrgId,
      inventoryLocationId: {
        in: sourceLocationIds
      },
      productId: {
        in: requestedProductIds
      }
    },
    _sum: {
      quantity: true
    }
  });
  const stockByProductLocation = new Map(
    stockGroups.map((group) => [
      `${group.productId}:${group.inventoryLocationId}`,
      roundQuantity(toNumber(group._sum.quantity))
    ])
  );
  const stockBucketsByProduct = new Map<
    string,
    Array<{ location: FuelSourceInventoryLocation; availableQuantity: number }>
  >();

  for (const catalogProductId of requestedProductIds) {
    const buckets = sourceLocations
      .map((location) => ({
        location,
        availableQuantity: stockByProductLocation.get(`${catalogProductId}:${location.id}`) ?? 0
      }))
      .filter((bucket) => bucket.availableQuantity > 0);

    stockBucketsByProduct.set(catalogProductId, buckets);
  }

  for (const [catalogProductId, requested] of requestedByProduct.entries()) {
    const availableQuantity = roundQuantity(
      (stockBucketsByProduct.get(catalogProductId) ?? []).reduce(
        (sum, bucket) => sum + bucket.availableQuantity,
        0
      )
    );

    if (requested.quantity > availableQuantity) {
      throw new Error(
        `Flash ERP cannot ${actionLabel} ${requested.quantity.toFixed(3)} ${requested.code} from ${sourceSite.code}; Item Dynamic stock is ${availableQuantity.toFixed(3)}.`
      );
    }
  }

  const movements: FuelInventorySaleMovement[] = [];

  for (const line of saleLines) {
    let remainingQuantity = line.quantity;
    const buckets = stockBucketsByProduct.get(line.catalogProductId) ?? [];

    for (const bucket of buckets) {
      if (remainingQuantity <= 0) {
        break;
      }

      const movementQuantity = roundQuantity(
        Math.min(remainingQuantity, bucket.availableQuantity)
      );

      if (movementQuantity <= 0) {
        continue;
      }

      movements.push({
        line,
        location: bucket.location,
        quantity: movementQuantity
      });
      bucket.availableQuantity = roundQuantity(bucket.availableQuantity - movementQuantity);
      remainingQuantity = roundQuantity(remainingQuantity - movementQuantity);
    }

    if (remainingQuantity > 0) {
      throw new Error(
        `Flash ERP could not allocate ${remainingQuantity.toFixed(3)} ${line.productCodeSnapshot} from ${sourceSite.code}.`
      );
    }
  }

  return { sourceLocations, movements };
}

async function publishFuelInventorySaleMovements(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  movements: FuelInventorySaleMovement[],
  reference: {
    referenceType: "FUEL_SALE" | "FUEL_STATION_DELIVERY";
    referenceId: string;
    externalReference: string;
    occurredAt: Date;
    idempotencyPrefix: string;
  }
) {
  if (movements.length === 0) {
    return;
  }

  const storeIds = Array.from(
    new Set(
      movements
        .map((movement) => movement.location.storeId)
        .filter((storeId): storeId is string => Boolean(storeId))
    )
  );
  const [enterpriseNode, targetStoreNodes] = await Promise.all([
    tx.syncNode.findFirst({
      where: {
        retailOrgId: context.retailOrgId,
        nodeType: SyncNodeType.ENTERPRISE,
        isPrimary: true,
        status: activeStatus
      },
      select: {
        id: true,
        code: true
      }
    }),
    storeIds.length > 0
      ? tx.syncNode.findMany({
          where: {
            retailOrgId: context.retailOrgId,
            storeId: {
              in: storeIds
            },
            nodeType: SyncNodeType.STORE_DESKTOP,
            status: activeStatus
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            code: true,
            storeId: true,
            terminal: {
              select: {
                code: true
              }
            }
          }
        })
      : Promise.resolve([])
  ]);
  const targetStoreNodeByStoreId = new Map<string, (typeof targetStoreNodes)[number]>();

  for (const node of targetStoreNodes) {
    if (node.storeId && !targetStoreNodeByStoreId.has(node.storeId)) {
      targetStoreNodeByStoreId.set(node.storeId, node);
    }
  }

  for (const movement of movements) {
    const signedQuantity = roundQuantity(movement.quantity * -1);
    const ledger = await tx.inventoryLedgerEntry.create({
      data: {
        id: randomUUID(),
        retailOrgId: context.retailOrgId,
        storeId: movement.location.storeId,
        warehouseId: movement.location.warehouseId,
        inventoryLocationId: movement.location.id,
        productId: movement.line.catalogProductId,
        movementType: InventoryMovementType.SALE,
        quantity: signedQuantity,
        unitCost: movement.line.unitCost,
        referenceType: reference.referenceType,
        referenceId: reference.referenceId,
        externalReference: reference.externalReference,
        sourceNodeCode: enterpriseNode?.code ?? null,
        occurredAt: reference.occurredAt
      }
    });
    const targetStoreNode = movement.location.storeId
      ? targetStoreNodeByStoreId.get(movement.location.storeId)
      : null;

    if (enterpriseNode && movement.location.store?.code && targetStoreNode?.terminal?.code) {
      await tx.syncOutboxEvent.create({
        data: {
          id: randomUUID(),
          syncNodeId: enterpriseNode.id,
          targetNodeCode: targetStoreNode.code,
          aggregateType: "inventoryLedgerEntry",
          aggregateId: ledger.id,
          eventType: "inventory.ledger.published",
          idempotencyKey: `${enterpriseNode.code}:inventoryLedgerEntry:${reference.idempotencyPrefix}:${ledger.id}`,
          payload: serializeRequiredJsonField({
            ledgerEntryId: ledger.id,
            storeCode: movement.location.store.code,
            terminalCode: targetStoreNode.terminal.code,
            inventoryLocationCode: movement.location.code,
            productCode: movement.line.productCodeSnapshot,
            movementType: "SALE",
            quantity: signedQuantity,
            unitCost: movement.line.unitCost,
            referenceType: reference.referenceType,
            referenceId: reference.referenceId,
            externalReference: reference.externalReference,
            occurredAt: reference.occurredAt.toISOString()
          }),
          status: SyncEventStatus.PENDING
        }
      });
    }
  }
}

type FuelFinanceLine = {
  productCodeSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unitCost: number | null;
  lineAmount: number;
};

type FuelFinanceCashPayment = {
  cashbookAccountId: string | null;
  paymentMode: string;
  amount: number;
  reference: string | null;
  receivedAt: Date | null;
  notes: string | null;
};

function appendFuelPostingLine(
  lines: PostAccountingDocumentLine[],
  accountCode: string,
  amount: number,
  side: "debit" | "credit",
  memo: string
): PostAccountingDocumentLine | null {
  const roundedAmount = roundMoney(amount);

  if (roundedAmount <= 0) {
    return null;
  }

  const line: PostAccountingDocumentLine = {
    accountCode,
    debitAmount: side === "debit" ? roundedAmount : 0,
    creditAmount: side === "credit" ? roundedAmount : 0,
    memo
  };

  lines.push(line);

  return line;
}

async function resolveFuelReceivablesAccountCode(
  tx: Prisma.TransactionClient,
  company: FuelCompany,
  customerId: string | null,
  fallbackAccountCode: string | null | undefined
) {
  if (customerId) {
    const partyProfile = await tx.erpPartyAccountingProfile.findFirst({
      where: {
        companyId: company.id,
        customerId,
        partyType: "CUSTOMER",
        status: activeStatus
      },
      include: {
        postingProfile: true
      },
      orderBy: [{ updatedAt: "desc" }]
    });
    const profileAccountCode =
      partyProfile?.postingProfile?.receivablesControlAccountCode ?? null;

    if (profileAccountCode) {
      return profileAccountCode;
    }
  }

  return fallbackAccountCode ?? "1100";
}

async function resolveFuelCashPayments(
  tx: Prisma.TransactionClient,
  company: FuelCompany,
  payments: FuelFinanceCashPayment[]
) {
  const payableRows = payments.filter(
    (payment) => payment.cashbookAccountId && payment.amount > 0
  );
  const accountIds = Array.from(
    new Set(payableRows.map((payment) => payment.cashbookAccountId).filter(Boolean))
  ) as string[];
  const accounts = accountIds.length
    ? await tx.erpCashbookAccount.findMany({
        where: {
          id: {
            in: accountIds
          },
          companyId: company.id,
          status: activeStatus
        },
        select: {
          id: true,
          code: true,
          name: true,
          accountType: true,
          glAccountCode: true,
          bankName: true,
          mobileProviderName: true
        }
      })
    : [];
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));

  return payableRows.map((payment) => {
    const account = payment.cashbookAccountId
      ? accountById.get(payment.cashbookAccountId) ?? null
      : null;

    if (!account) {
      throw new Error("Flash ERP could not find a Finance cashbook account for a fuel payment.");
    }

    if (!account.glAccountCode) {
      throw new Error(
        `${account.code} must be mapped to a GL account before fuel payments can post to Finance.`
      );
    }

    return {
      ...payment,
      cashbookAccountId: account.id,
      account
    };
  });
}

async function postFuelCommercialFinance(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    sourceType: "ERP-FUEL-SALE" | "ERP-FUEL-STATION-DELIVERY";
    workflowType: "FUEL_SALE" | "FUEL_STATION_DELIVERY";
    sourceId: string;
    documentNo: string;
    postingDate: Date;
    currencyCode: string;
    customerId: string | null;
    customerName: string | null;
    totalAmount: number;
    profitStore?: { id: string; code: string; name: string } | null;
    cashPayments: FuelFinanceCashPayment[];
    lines: FuelFinanceLine[];
  }
) {
  const totalAmount = roundMoney(input.totalAmount);
  const cashPayments = await resolveFuelCashPayments(tx, company, input.cashPayments);
  const cashTotal = roundMoney(cashPayments.reduce((sum, payment) => sum + payment.amount, 0));
  const receivableAmount = roundMoney(totalAmount - cashTotal);
  const totalCostAmount = roundMoney(
    input.lines.reduce(
      (sum, line) => sum + roundMoney(line.quantity * Math.max(0, line.unitCost ?? 0)),
      0
    )
  );

  if (totalAmount <= 0 && totalCostAmount <= 0) {
    return null;
  }

  if (receivableAmount < -0.01) {
    throw new Error("Flash ERP fuel payment postings cannot exceed the fuel sale amount.");
  }

  const settings = await getFuelAccountingSettings(tx, company);
  const arAccountCode = await resolveFuelReceivablesAccountCode(
    tx,
    company,
    input.customerId,
    settings?.arControlAccountCode
  );
  const inventoryAccountCode = settings?.inventoryControlAccountCode ?? "1200";
  const revenueAccountCode = "4000";
  const cogsAccountCode = "5000";
  const profitCostCenterCode = input.profitStore
    ? await ensureFuelStoreCostCenterDimension(tx, context, company, input.profitStore)
    : null;
  const postingLines: PostAccountingDocumentLine[] = [];
  const applyStoreTrace = (line: PostAccountingDocumentLine | null) => {
    if (line && input.profitStore) {
      line.storeId = input.profitStore.id;
    }

    return line;
  };
  const applyProfitCostCenter = (line: PostAccountingDocumentLine | null) => {
    if (line && input.profitStore && profitCostCenterCode) {
      line.storeId = input.profitStore.id;
      line.dimensionType = "COST_CENTER";
      line.dimensionCode = profitCostCenterCode;
    }

    return line;
  };

  for (const payment of cashPayments) {
    const accountName =
      payment.account.accountType === "MOBILE_MONEY"
        ? payment.account.mobileProviderName ?? payment.account.name
        : payment.account.bankName ?? payment.account.name;

    applyStoreTrace(
      appendFuelPostingLine(
        postingLines,
        payment.account.glAccountCode ?? "1000",
        payment.amount,
        "debit",
        `${input.documentNo} ${accountName}`
      )
    );
  }

  applyStoreTrace(
    appendFuelPostingLine(
      postingLines,
      arAccountCode,
      Math.max(0, receivableAmount),
      "debit",
      `${input.documentNo} customer receivable`
    )
  );
  applyProfitCostCenter(
    appendFuelPostingLine(
      postingLines,
      revenueAccountCode,
      totalAmount,
      "credit",
      `${input.documentNo} fuel sales revenue`
    )
  );
  applyProfitCostCenter(
    appendFuelPostingLine(
      postingLines,
      cogsAccountCode,
      totalCostAmount,
      "debit",
      `${input.documentNo} weighted-average fuel cost`
    )
  );
  applyStoreTrace(
    appendFuelPostingLine(
      postingLines,
      inventoryAccountCode,
      totalCostAmount,
      "credit",
      `${input.documentNo} inventory relief`
    )
  );

  const journal = await postAccountingDocumentInTransaction(tx, {
    retailOrgId: context.retailOrgId,
    companyId: company.id,
    documentType: "JOURNAL",
    batchSourceType: input.sourceType,
    journalType: "FUEL_SALE",
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceReference: input.documentNo,
    postingDate: input.postingDate,
    description: `${input.documentNo} fuel commercial posting`,
    postedBy: "Fuel Operations",
    lines: postingLines
  });

  for (const payment of cashPayments) {
    const entryNo = await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      documentType: "CASHBOOK_ENTRY"
    });

    await tx.erpCashbookEntry.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        cashbookAccountId: payment.cashbookAccountId,
        postingJournalEntryId: journal.journalEntryId,
        entryNo: entryNo.documentNo,
        entryType: "RECEIPT",
        direction: "INFLOW",
        entryDate: payment.receivedAt ?? input.postingDate,
        postingDate: input.postingDate,
        valueDate: payment.receivedAt ?? input.postingDate,
        currencyCode: input.currencyCode,
        amount: roundMoney(payment.amount),
        offsetAccountCode: revenueAccountCode,
        counterpartyName: input.customerName,
        workflowType: input.workflowType,
        workflowReference: input.documentNo,
        providerReference: payment.reference,
        externalReference: input.documentNo,
        memo: payment.notes ?? `${input.documentNo} fuel payment`,
        status: "POSTED",
        postedAt: new Date(),
        postedBy: "Fuel Operations"
      }
    });
  }

  return journal;
}

async function resolveFuelStationDeliveryCashPayment(
  tx: Prisma.TransactionClient,
  context: FuelContext,
  company: FuelCompany,
  input: {
    paymentMode: string;
    amountReceived: number;
    paymentReference: string | null;
    paymentReceivedAt: Date | null;
    deliveryDate: Date;
  }
): Promise<FuelFinanceCashPayment[]> {
  if (input.amountReceived <= 0) {
    return [];
  }

  const normalizedPaymentMode = normalizePaymentMode(input.paymentMode);
  const tenderCodeByMode: Record<string, string> = {
    BANK_TRANSFER: "BANK-TRANSFER",
    CASH_ON_DELIVERY: "CASH",
    MOBILE_MONEY: "MOMO",
    PREPAID: "CASH"
  };
  const tenderCode = tenderCodeByMode[normalizedPaymentMode] ?? "CASH";
  const tender = await tx.tenderMethod.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      code: tenderCode,
      status: activeStatus,
      deletedAt: null
    },
    include: {
      cashbookAccount: true
    }
  });

  if (!tender?.cashbookAccountId) {
    throw new Error(`${tender?.name ?? tenderCode} must be mapped to a Finance cashbook account before station payments can post.`);
  }

  const account = await tx.erpCashbookAccount.findFirst({
    where: {
      id: tender.cashbookAccountId,
      companyId: company.id,
      status: activeStatus
    }
  });

  if (!account) {
    throw new Error("Flash ERP could not find the mapped station payment cashbook account.");
  }

  const reference = normalizeOptionalText(input.paymentReference);

  if ((tender.requiresReference || fuelPaymentRequiresReference(account.accountType)) && !reference) {
    throw new Error(`${tender.name} requires a payment reference before saving the station sale.`);
  }

  return [
    {
      cashbookAccountId: account.id,
      paymentMode: tender.paymentMethod,
      amount: input.amountReceived,
      reference,
      receivedAt: input.paymentReceivedAt ?? input.deliveryDate,
      notes: null
    }
  ];
}

export async function upsertFuelOperationsSettings(
  input: UpsertFuelOperationsSettingsRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const productOptions = await buildFuelProductOptions(tx, context, company);
    const siteOptions = await buildFuelSourceSiteOptions(tx, context, company, productOptions);
    const siteIds = new Set(siteOptions.map((site) => site.operatingSiteId));
    const defaultSaleSourceSiteId = normalizeOptionalText(input.defaultSaleSourceSiteId);
    const defaultDispatchSiteId = normalizeOptionalText(input.defaultDispatchSiteId);
    const saleReceiptPaperKind = normalizeReceiptPaperKind(input.saleReceiptPaperKind, "THERMAL");
    const deliveryReceiptPaperKind = normalizeReceiptPaperKind(
      input.deliveryReceiptPaperKind,
      "THERMAL"
    );
    const salesOrderReceiptPaperKind = normalizeReceiptPaperKind(
      input.salesOrderReceiptPaperKind,
      "A4"
    );

    if (defaultSaleSourceSiteId && !siteIds.has(defaultSaleSourceSiteId)) {
      throw new Error("Flash ERP could not find the selected default fuel sale source site.");
    }

    if (defaultDispatchSiteId && !siteIds.has(defaultDispatchSiteId)) {
      throw new Error("Flash ERP could not find the selected default fuel delivery dispatch site.");
    }

    await tx.erpFuelOperationsSettings.upsert({
      where: {
        companyId: company.id
      },
      update: {
        defaultSaleSourceSiteId: defaultSaleSourceSiteId ?? null,
        defaultDispatchSiteId: defaultDispatchSiteId ?? null,
        saleReceiptPaperKind,
        deliveryReceiptPaperKind,
        salesOrderReceiptPaperKind,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        defaultSaleSourceSiteId: defaultSaleSourceSiteId ?? null,
        defaultDispatchSiteId: defaultDispatchSiteId ?? null,
        saleReceiptPaperKind,
        deliveryReceiptPaperKind,
        salesOrderReceiptPaperKind,
        status: activeStatus
      }
    });

    return {
      message: "Flash ERP saved Fuel Operations defaults.",
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertFuelStation(
  input: UpsertFuelStationRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const stationCode = normalizeCode(input.stationCode, "station code");
    const stationName = normalizeOptionalText(input.stationName) ?? stationCode;
    const customerId = normalizeOptionalText(input.customerId);
    const customer = await validateCustomer(tx, context.retailOrgId, customerId);
    const storeId = normalizeOptionalText(input.storeId);
    const inventoryLocationId = normalizeOptionalText(input.inventoryLocationId);
    const stationStoreLocation = await resolveFuelStationStoreLocation(
      tx,
      context.retailOrgId,
      storeId,
      inventoryLocationId
    );
    const stationType = normalizeStationType(input.stationType);
    const operatingSiteId =
      stationType === "OWNED" ? normalizeOptionalText(input.operatingSiteId) : null;

    await validateSite(tx, company.id, operatingSiteId);

    const customerFinanceProfile = customer
      ? await tx.erpPartyAccountingProfile.findFirst({
          where: {
            companyId: company.id,
            customerId: customer.id,
            partyType: "CUSTOMER",
            status: activeStatus
          },
          orderBy: [{ updatedAt: "desc" }]
        })
      : null;

    const customerPaymentTermsCode = customer
      ? customerFinanceProfile?.paymentTermsCode ??
        (customer.allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT")
      : null;
    const customerCreditLimitAmount = customer
      ? customerFinanceProfile?.creditLimitAmount === null ||
        customerFinanceProfile?.creditLimitAmount === undefined
        ? customer.creditLimitAmount === null || customer.creditLimitAmount === undefined
          ? null
          : roundMoney(toNumber(customer.creditLimitAmount))
        : roundMoney(toNumber(customerFinanceProfile.creditLimitAmount))
      : null;

    const existing = input.stationId
      ? await tx.erpFuelStation.findFirst({ where: { id: input.stationId, companyId: company.id } })
      : await tx.erpFuelStation.findUnique({
          where: {
            companyId_stationCode: {
              companyId: company.id,
              stationCode
            }
          }
        });

    const data = {
      customerId,
      storeId: stationStoreLocation.store.id,
      inventoryLocationId: stationStoreLocation.inventoryLocation.id,
      operatingSiteId,
      stationCode,
      stationName,
      stationType,
      location: normalizeOptionalText(input.location) ?? customer?.addressLine1 ?? null,
      city: normalizeOptionalText(input.city) ?? customer?.city ?? null,
      gpsLatitude: optionalGpsCoordinate(input.gpsLatitude, "GPS latitude", -90, 90),
      gpsLongitude: optionalGpsCoordinate(input.gpsLongitude, "GPS longitude", -180, 180),
      contactName: normalizeOptionalText(input.contactName),
      phone: normalizeOptionalText(input.phone) ?? customer?.phone ?? null,
      paymentTermsCode: customerPaymentTermsCode,
      creditLimitAmount: customerCreditLimitAmount,
      status: normalizeStatus(input.status),
      notes: normalizeOptionalText(input.notes)
    };

    const station = existing
      ? await tx.erpFuelStation.update({
          where: { id: existing.id },
          data
        })
      : await tx.erpFuelStation.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data
          }
        });

    return {
      message: `Flash ERP saved filling station ${station.stationCode}.`,
      stationId: station.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertFuelTank(
  input: UpsertFuelTankRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const code = normalizeCode(input.code, "tank code");
    const name = normalizeOptionalText(input.name) ?? code;
    const operatingSiteId = normalizeOptionalText(input.operatingSiteId);
    const productProfileId = normalizeOptionalText(input.productProfileId);
    const capacityQuantity = positiveNumber(input.capacityQuantity, "tank capacity");
    const openingQuantity = roundQuantity(numberOrZero(input.openingQuantity));
    const currentBookQuantity =
      input.currentBookQuantity === undefined || input.currentBookQuantity === null
        ? openingQuantity
        : roundQuantity(numberOrZero(input.currentBookQuantity));

    await validateSite(tx, company.id, operatingSiteId);
    const productProfile = await validateFuelProduct(tx, context.retailOrgId, productProfileId);
    const productUomCode = productProfile?.defaultUomCode ?? "LTR";

    const existing = input.tankId
      ? await tx.erpFuelTank.findFirst({ where: { id: input.tankId, companyId: company.id } })
      : await tx.erpFuelTank.findUnique({
          where: {
            companyId_code: {
              companyId: company.id,
              code
            }
          }
        });

    const data = {
      operatingSiteId,
      productProfileId,
      code,
      name,
      tankType: normalizeCode(input.tankType ?? "UNDERGROUND", "tank type"),
      capacityQuantity: roundQuantity(capacityQuantity),
      safeCapacityQuantity:
        input.safeCapacityQuantity === undefined || input.safeCapacityQuantity === null
          ? null
          : roundQuantity(numberOrZero(input.safeCapacityQuantity)),
      reorderLevelQuantity:
        input.reorderLevelQuantity === undefined || input.reorderLevelQuantity === null
          ? null
          : roundQuantity(numberOrZero(input.reorderLevelQuantity)),
      uomCode: normalizeCode(productUomCode, "tank UOM"),
      openingQuantity,
      currentBookQuantity,
      status: normalizeStatus(input.status),
      notes: normalizeOptionalText(input.notes)
    };

    const tank = existing
      ? await tx.erpFuelTank.update({
          where: { id: existing.id },
          data
        })
      : await tx.erpFuelTank.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data
          }
        });

    return {
      message: `Flash ERP saved fuel tank ${tank.code}.`,
      tankId: tank.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertFuelPump(
  input: UpsertFuelPumpRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const code = normalizeCode(input.code, "pump code");
    const tankId = normalizeOptionalText(input.tankId);
    const requestedOperatingSiteId = normalizeOptionalText(input.operatingSiteId);

    if (!tankId) {
      throw new Error("Flash ERP needs a tank before saving a pump.");
    }

    const tank = await tx.erpFuelTank.findFirst({
      where: {
        id: tankId,
        companyId: company.id
      }
    });

    if (!tank) {
      throw new Error("Flash ERP could not find that tank.");
    }

    if (
      requestedOperatingSiteId &&
      tank.operatingSiteId &&
      requestedOperatingSiteId !== tank.operatingSiteId
    ) {
      throw new Error("Flash ERP cannot link a pump to a tank from a different site.");
    }

    const operatingSiteId = requestedOperatingSiteId ?? tank.operatingSiteId;
    await validateSite(tx, company.id, operatingSiteId);

    const existing = input.pumpId
      ? await tx.erpFuelPump.findFirst({ where: { id: input.pumpId, companyId: company.id } })
      : await tx.erpFuelPump.findUnique({
          where: {
            companyId_code: {
              companyId: company.id,
              code
            }
          }
        });

    const data = {
      operatingSiteId,
      tankId: tank.id,
      code,
      name: normalizeOptionalText(input.name) ?? code,
      pumpType: normalizeCode(input.pumpType ?? "DISPENSER", "pump type"),
      manufacturer: normalizeOptionalText(input.manufacturer),
      serialNo: normalizeOptionalText(input.serialNo),
      status: normalizeStatus(input.status),
      notes: normalizeOptionalText(input.notes)
    };

    const pump = existing
      ? await tx.erpFuelPump.update({
          where: { id: existing.id },
          data
        })
      : await tx.erpFuelPump.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data
          }
        });

    return {
      message: `Flash ERP saved fuel pump ${pump.code}.`,
      pumpId: pump.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertFuelNozzle(
  input: UpsertFuelNozzleRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const pumpId = normalizeOptionalText(input.pumpId);
    const requestedTankId = normalizeOptionalText(input.tankId);

    if (!pumpId) {
      throw new Error("Flash ERP needs a pump before saving a nozzle.");
    }

    const pump = await tx.erpFuelPump.findFirst({
      where: { id: pumpId, companyId: company.id },
      include: { tank: true }
    });

    if (!pump) {
      throw new Error("Flash ERP could not find that pump.");
    }

    if (pump.tankId && requestedTankId && requestedTankId !== pump.tankId) {
      throw new Error("Flash ERP cannot save a nozzle against a tank that differs from the pump tank.");
    }

    const tankId = pump.tankId ?? requestedTankId;

    if (!tankId) {
      throw new Error("Flash ERP needs the selected pump to be linked to a tank before saving a nozzle.");
    }

    const tank =
      pump.tankId && pump.tank
        ? pump.tank
        : await tx.erpFuelTank.findFirst({ where: { id: tankId, companyId: company.id } });

    if (!tank) {
      throw new Error("Flash ERP could not find that tank.");
    }

    const requestedProductProfileId = normalizeOptionalText(input.productProfileId);

    if (
      tank.productProfileId &&
      requestedProductProfileId &&
      requestedProductProfileId !== tank.productProfileId
    ) {
      throw new Error("Flash ERP cannot save a nozzle against a product that differs from the pump tank product.");
    }

    const productProfileId = tank.productProfileId ?? requestedProductProfileId;
    await validateFuelProduct(tx, context.retailOrgId, productProfileId);

    const code = normalizeCode(input.code, "nozzle code");
    const openingMeterReading = roundQuantity(numberOrZero(input.openingMeterReading));
    const currentMeterReading =
      input.currentMeterReading === undefined || input.currentMeterReading === null
        ? openingMeterReading
        : roundQuantity(numberOrZero(input.currentMeterReading));
    const existing = input.nozzleId
      ? await tx.erpFuelNozzle.findFirst({ where: { id: input.nozzleId, companyId: company.id } })
      : await tx.erpFuelNozzle.findUnique({
          where: {
            pumpId_code: {
              pumpId,
              code
            }
          }
        });

    const data = {
      pumpId,
      tankId,
      productProfileId,
      code,
      name: normalizeOptionalText(input.name) ?? code,
      meterUomCode: normalizeCode(input.meterUomCode ?? tank.uomCode, "meter UOM"),
      openingMeterReading,
      currentMeterReading,
      status: normalizeStatus(input.status),
      notes: normalizeOptionalText(input.notes)
    };

    const nozzle = existing
      ? await tx.erpFuelNozzle.update({
          where: { id: existing.id },
          data
        })
      : await tx.erpFuelNozzle.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data
          }
        });

    return {
      message: `Flash ERP saved nozzle ${nozzle.code}.`,
      nozzleId: nozzle.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createFuelTankDip(
  input: CreateFuelTankDipRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const tankId = normalizeOptionalText(input.tankId);

    if (!tankId) {
      throw new Error("Flash ERP needs a tank before recording a dip.");
    }

    const tank = await tx.erpFuelTank.findFirst({
      where: {
        id: tankId,
        companyId: company.id
      }
    });

    if (!tank) {
      throw new Error("Flash ERP could not find that tank.");
    }

    const dipDate = parseOperationDate(input.dipDate, "dip date");
    const dipQuantity = roundQuantity(positiveNumber(input.dipQuantity, "dip quantity"));
    const bookQuantity = toNumber(tank.currentBookQuantity);
    const varianceQuantity = roundQuantity(dipQuantity - bookQuantity);
    const evidenceImageUrl = normalizeEvidenceImageUrl(input.evidenceImageUrl, "tank dip");

    const data = {
      tankId: tank.id,
      dipReference: normalizeOptionalText(input.dipReference),
      dipDate,
      dipQuantity,
      waterQuantity: roundQuantity(numberOrZero(input.waterQuantity)),
      temperatureReading:
        input.temperatureReading === undefined || input.temperatureReading === null
          ? null
          : roundQuantity(numberOrZero(input.temperatureReading)),
      bookQuantity,
      varianceQuantity,
      evidenceImageUrl,
      evidenceFileName: normalizeOptionalText(input.evidenceFileName),
      evidenceCapturedAt: parseOptionalOperationDate(input.evidenceCapturedAt),
      evidenceUploadedAt: new Date(),
      recordedBy: normalizeOptionalText(input.recordedBy),
      notes: normalizeOptionalText(input.notes),
      status: "POSTED"
    };
    const existingDipId = normalizeOptionalText(input.dipId);
    const existingDip = existingDipId
      ? await tx.erpFuelTankDip.findFirst({
          where: {
            id: existingDipId,
            companyId: company.id
          }
        })
      : null;
    const dip = existingDip
      ? await tx.erpFuelTankDip.update({
          where: {
            id: existingDip.id
          },
          data
        })
      : await tx.erpFuelTankDip.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data
          }
        });

    await tx.erpFuelTank.update({
      where: {
        id: tank.id
      },
      data: {
        lastDipAt: dipDate
      }
    });

    return {
      message: `Flash ERP ${existingDip ? "updated" : "recorded"} dip for tank ${tank.code} with variance ${varianceQuantity.toFixed(3)}.`,
      dipId: dip.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createFuelMeterReading(
  input: CreateFuelMeterReadingRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const nozzleId = normalizeOptionalText(input.nozzleId);

    if (!nozzleId) {
      throw new Error("Flash ERP needs a nozzle before recording a meter reading.");
    }

    const nozzle = await tx.erpFuelNozzle.findFirst({
      where: {
        id: nozzleId,
        companyId: company.id
      },
      include: {
        tank: true
      }
    });

    if (!nozzle) {
      throw new Error("Flash ERP could not find that nozzle.");
    }

    const existingReadingId = normalizeOptionalText(input.meterReadingId);
    const readingDate = parseOperationDate(input.readingDate, "meter reading date");
    const openingMeterReading = existingReadingId
      ? roundQuantity(numberOrZero(input.openingMeterReading))
      : roundQuantity(toNumber(nozzle.currentMeterReading));
    const closingMeterReading = roundQuantity(positiveNumber(input.closingMeterReading, "closing meter reading"));
    const adjustmentQuantity = roundQuantity(numberOrZero(input.adjustmentQuantity));
    const salesQuantity = roundQuantity(closingMeterReading - openingMeterReading + adjustmentQuantity);

    if (salesQuantity < 0) {
      throw new Error("Flash ERP meter sales quantity cannot be negative.");
    }

    const unitSellingPrice = roundRate(numberOrZero(input.unitSellingPrice));
    const salesAmount =
      input.salesAmount === undefined || input.salesAmount === null
        ? roundMoney(salesQuantity * unitSellingPrice)
        : roundMoney(numberOrZero(input.salesAmount));
    const evidenceImageUrl = normalizeEvidenceImageUrl(input.evidenceImageUrl, "meter reading");

    const existingReading = existingReadingId
      ? await tx.erpFuelMeterReading.findFirst({
          where: {
            id: existingReadingId,
            companyId: company.id
          },
          include: {
            tank: true
          }
        })
      : null;
    const data = {
      nozzleId: nozzle.id,
      tankId: nozzle.tankId,
      readingDate,
      shiftReference: normalizeOptionalText(input.shiftReference),
      openingMeterReading,
      closingMeterReading,
      salesQuantity,
      adjustmentQuantity,
      unitSellingPrice,
      salesAmount,
      evidenceImageUrl,
      evidenceFileName: normalizeOptionalText(input.evidenceFileName),
      evidenceCapturedAt: parseOptionalOperationDate(input.evidenceCapturedAt),
      evidenceUploadedAt: new Date(),
      recordedBy: normalizeOptionalText(input.recordedBy),
      notes: normalizeOptionalText(input.notes),
      status: "POSTED"
    };
    const reading = existingReading
      ? await tx.erpFuelMeterReading.update({
          where: {
            id: existingReading.id
          },
          data
        })
      : await tx.erpFuelMeterReading.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            ...data
          }
        });

    await tx.erpFuelNozzle.update({
      where: {
        id: nozzle.id
      },
      data: {
        currentMeterReading: closingMeterReading
      }
    });
    if (existingReading && existingReading.tankId === nozzle.tankId) {
      await tx.erpFuelTank.update({
        where: {
          id: nozzle.tankId
        },
        data: {
          currentBookQuantity: roundQuantity(
            toNumber(nozzle.tank.currentBookQuantity) +
              toNumber(existingReading.salesQuantity) -
              salesQuantity
          )
        }
      });
    } else {
      if (existingReading) {
        await tx.erpFuelTank.update({
          where: {
            id: existingReading.tankId
          },
          data: {
            currentBookQuantity: roundQuantity(
              toNumber(existingReading.tank.currentBookQuantity) +
                toNumber(existingReading.salesQuantity)
            )
          }
        });
      }

      await tx.erpFuelTank.update({
        where: {
          id: nozzle.tankId
        },
        data: {
          currentBookQuantity: roundQuantity(toNumber(nozzle.tank.currentBookQuantity) - salesQuantity)
        }
      });
    }

    return {
      message: `Flash ERP ${existingReading ? "updated" : "recorded"} ${salesQuantity.toFixed(3)} ${nozzle.meterUomCode} from nozzle ${nozzle.code}.`,
      meterReadingId: reading.id,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createFuelDelivery(
  input: CreateFuelDeliveryRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const functionalCurrencyCode = await getFuelFunctionalCurrencyCode(tx, context, company);
    const deliveryDate = parseOperationDate(input.deliveryDate, "delivery date");
    const operatingSiteId = normalizeOptionalText(input.operatingSiteId);
    const lines = input.lines?.filter((line) => normalizeOptionalText(line.tankId)) ?? [];

    if (lines.length === 0) {
      throw new Error("Flash ERP needs at least one tank line for a fuel delivery.");
    }

    await validateSite(tx, company.id, operatingSiteId);

    const reserved = await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      documentType: "FUEL_DELIVERY"
    });

    const deliveryLines = [];

    for (const line of lines) {
      const tankId = normalizeOptionalText(line.tankId);

      if (!tankId) {
        continue;
      }

      const tank = await tx.erpFuelTank.findFirst({
        where: {
          id: tankId,
          companyId: company.id
        }
      });

      if (!tank) {
        throw new Error("Flash ERP could not find one of the delivery tanks.");
      }

      if (operatingSiteId && tank.operatingSiteId && tank.operatingSiteId !== operatingSiteId) {
        throw new Error("Flash ERP receiving tank does not belong to the selected receiving site.");
      }

      const deliveredQuantity = roundQuantity(positiveNumber(line.deliveredQuantity, "delivered quantity"));
      const orderedQuantity = roundQuantity(numberOrZero(line.orderedQuantity));
      const acceptedQuantity =
        line.acceptedQuantity === undefined || line.acceptedQuantity === null
          ? deliveredQuantity
          : roundQuantity(numberOrZero(line.acceptedQuantity));

      if (acceptedQuantity < 0) {
        throw new Error("Flash ERP accepted fuel quantity cannot be negative.");
      }

      const unitCost = roundRate(numberOrZero(line.unitCost));
      const lineCostAmount = roundMoney(acceptedQuantity * unitCost);

      deliveryLines.push({
        tank,
        data: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          tankId: tank.id,
          productProfileId: tank.productProfileId,
          orderedQuantity,
          deliveredQuantity,
          acceptedQuantity,
          varianceQuantity: roundQuantity(acceptedQuantity - orderedQuantity),
          unitCost,
          lineCostAmount,
          notes: normalizeOptionalText(line.notes)
        }
      });
    }

    const totals = deliveryLines.reduce(
      (current, line) => ({
        ordered: current.ordered + line.data.orderedQuantity,
        delivered: current.delivered + line.data.deliveredQuantity,
        accepted: current.accepted + line.data.acceptedQuantity,
        variance: current.variance + line.data.varianceQuantity,
        cost: current.cost + line.data.lineCostAmount
      }),
      { ordered: 0, delivered: 0, accepted: 0, variance: 0, cost: 0 }
    );

    const delivery = await tx.erpFuelDelivery.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        operatingSiteId,
        deliveryNo: reserved.documentNo,
        deliveryDate,
        supplierName: normalizeOptionalText(input.supplierName),
        supplierDocumentNo: normalizeOptionalText(input.supplierDocumentNo),
        transporterName: normalizeOptionalText(input.transporterName),
        vehicleRegistrationNo: normalizeOptionalText(input.vehicleRegistrationNo),
        currencyCode: normalizeCode(input.currencyCode ?? functionalCurrencyCode, "currency"),
        totalOrderedQuantity: roundQuantity(totals.ordered),
        totalDeliveredQuantity: roundQuantity(totals.delivered),
        totalAcceptedQuantity: roundQuantity(totals.accepted),
        totalVarianceQuantity: roundQuantity(totals.variance),
        totalCostAmount: roundMoney(totals.cost),
        notes: normalizeOptionalText(input.notes),
        status: "POSTED",
        lines: {
          create: deliveryLines.map((line) => line.data)
        }
      }
    });

    for (const line of deliveryLines) {
      await tx.erpFuelTank.update({
        where: {
          id: line.tank.id
        },
        data: {
          currentBookQuantity: roundQuantity(
            toNumber(line.tank.currentBookQuantity) + line.data.acceptedQuantity
          )
        }
      });
    }

    return {
      message: `Flash ERP recorded fuel delivery ${delivery.deliveryNo}.`,
      deliveryId: delivery.id,
      deliveryNo: delivery.deliveryNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createFuelSale(
  input: CreateFuelSaleRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const functionalCurrencyCode = await getFuelFunctionalCurrencyCode(tx, context, company);
    const documentMode = normalizeFuelSaleDocumentMode(input.documentMode);
    const sourceOperatingSiteId = normalizeOptionalText(input.sourceOperatingSiteId);

    if (!sourceOperatingSiteId) {
      throw new Error("Flash ERP needs the source store/site where the fuel GRN was received.");
    }

    const sourceSite = await validateSite(tx, company.id, sourceOperatingSiteId);

    if (!sourceSite) {
      throw new Error("Flash ERP could not find the selected source store/site.");
    }

    const loadingDate = parseOperationDate(input.loadingDate, "loading date");
    const dispatchDate =
      documentMode === "SALES_ORDER"
        ? parseOptionalOperationDate(input.dispatchDate)
        : parseOperationDate(input.dispatchDate, "dispatch date");

    if (dispatchDate && dispatchDate < loadingDate) {
      throw new Error("Flash ERP dispatch date cannot be before the loading date.");
    }

    const stationId = normalizeOptionalText(input.stationId);
    const station = stationId
      ? await tx.erpFuelStation.findFirst({
          where: {
            id: stationId,
            companyId: company.id
          },
          include: {
            customer: true
          }
        })
      : null;

    if (stationId && !station) {
      throw new Error("Flash ERP could not find that filling station for the fuel sale.");
    }

    const customerId = normalizeOptionalText(input.customerId);
    const customer = await validateCustomer(tx, context.retailOrgId, customerId);
    const customerName =
      normalizeOptionalText(input.customerName) ??
      customer?.fullName ??
      station?.stationName ??
      "Walk-in Customer";

    const linkedStationDeliveryId = normalizeOptionalText(input.linkedStationDeliveryId);

    if (linkedStationDeliveryId) {
      const linkedDelivery = await tx.erpFuelStationDelivery.findFirst({
        where: {
          id: linkedStationDeliveryId,
          companyId: company.id
        }
      });

      if (!linkedDelivery) {
        throw new Error("Flash ERP could not find the linked station delivery.");
      }
    }

    const rawLines =
      input.lines?.filter(
        (line) => normalizeOptionalText(line.productProfileId) || normalizeOptionalText(line.productId)
      ) ?? [];

    if (rawLines.length === 0) {
      throw new Error("Flash ERP needs at least one product line before saving a fuel sale.");
    }

    const saleLines = [];

    for (const line of rawLines) {
      const { product, profile } = await resolveFuelCatalogProduct(tx, context, company, {
        productId: line.productId,
        productProfileId: line.productProfileId
      });

      const quantity = roundQuantity(positiveNumber(line.quantity, "sale quantity"));
      const unitPrice = await resolveFuelSellingPrice(tx, context, {
        sourceSite,
        product,
        customer,
        requestedUnitPrice: line.unitPrice
      });
      const unitCost = await getWeightedAverageInventoryCostRate(tx, context, sourceSite, {
        productId: product.id,
        fallbackUnitCost: product.baseCostPrice
      });

      saleLines.push({
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        catalogProductId: product.id,
        unitCost,
        productProfileId: profile.id,
        productCodeSnapshot: product.code,
        productNameSnapshot: product.name,
        quantity,
        unitPrice,
        lineAmount: roundMoney(quantity * unitPrice),
        notes: normalizeOptionalText(line.notes)
      });
    }

    const saleInventoryMovements =
      documentMode === "SALE"
        ? (
            await buildFuelInventorySaleMovements(
              tx,
              context,
              sourceSite,
              saleLines,
              "sell"
            )
          ).movements
        : [];

    const totals = saleLines.reduce(
      (current, line) => ({
        quantity: current.quantity + line.quantity,
        amount: current.amount + line.lineAmount
      }),
      { quantity: 0, amount: 0 }
    );
    const totalAmount = roundMoney(totals.amount);
    const preparedPayment = await prepareFuelSalePayments(tx, context, company, input, totalAmount);

    if (preparedPayment.creditTenderTotal > 0 && documentMode !== "SALE") {
      throw new Error("Flash ERP Customer Credit tender can only be used on posted fuel sales.");
    }

    if ((documentMode === "SALES_ORDER" || preparedPayment.cashPaymentTotal < totalAmount) && !customerId) {
      throw new Error(
        "Flash ERP needs a customer account for fuel sales orders or unpaid/part-paid fuel sales so AR and later payments can be linked."
      );
    }

    const reserved = await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      documentType: "FUEL_SALE"
    });

    const sale = await tx.erpFuelSale.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        sourceOperatingSiteId,
        customerId,
        stationId,
        linkedStationDeliveryId,
        paymentCashbookAccountId: preparedPayment.primaryCashbookAccountId,
        saleNo: reserved.documentNo,
        loadingDate,
        dispatchDate,
        serviceType: normalizeServiceType(input.serviceType),
        customerName,
        paymentReceivedAmount: preparedPayment.cashPaymentTotal,
        balanceAmount: roundMoney(totalAmount - preparedPayment.cashPaymentTotal),
        paymentDate: preparedPayment.paymentDate,
        paymentReference: preparedPayment.paymentReference,
        paymentDetails: preparedPayment.paymentDetails,
        truckLoaded: normalizeOptionalText(input.truckLoaded),
        currencyCode: normalizeCode(input.currencyCode ?? functionalCurrencyCode, "currency"),
        totalQuantity: roundQuantity(totals.quantity),
        totalAmount,
        paymentStatus: derivePaymentStatus(totalAmount, preparedPayment.cashPaymentTotal),
        status: documentMode === "SALES_ORDER" ? "ORDERED" : "POSTED",
        notes: normalizeOptionalText(input.notes),
        lines: {
          create: saleLines.map(
            ({ catalogProductId: _catalogProductId, unitCost: _unitCost, ...line }) => line
          )
        }
      }
    });

    if (preparedPayment.payments.length > 0) {
      await tx.erpFuelSalePayment.createMany({
        data: preparedPayment.payments.map((payment) => ({
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          fuelSaleId: sale.id,
          cashbookAccountId: payment.cashbookAccountId,
          tenderMethodId: payment.tenderMethodId,
          tenderMethodCodeSnapshot: payment.tenderMethodCodeSnapshot,
          tenderMethodNameSnapshot: payment.tenderMethodNameSnapshot,
          paymentMode: payment.paymentMode,
          amount: payment.amount,
          reference: payment.reference,
          receivedAt: payment.receivedAt,
          notes: payment.notes
        }))
      });
    }

    if (documentMode === "SALE" && dispatchDate) {
      await publishFuelInventorySaleMovements(tx, context, saleInventoryMovements, {
        referenceType: "FUEL_SALE",
        referenceId: sale.id,
        externalReference: sale.saleNo,
        occurredAt: dispatchDate,
        idempotencyPrefix: "fuel-sale"
      });
      const profitStore = await resolveFuelSourceStoreForCostCenter(
        tx,
        context.retailOrgId,
        sourceSite
      );

      await postFuelCommercialFinance(tx, context, company, {
        sourceType: "ERP-FUEL-SALE",
        workflowType: "FUEL_SALE",
        sourceId: sale.id,
        documentNo: sale.saleNo,
        postingDate: dispatchDate,
        currencyCode: sale.currencyCode,
        customerId,
        customerName,
        totalAmount,
        profitStore,
        cashPayments: preparedPayment.payments,
        lines: saleLines
      });

      await recordFuelReceivableCharge(tx, context, {
        customer,
        transactionNo: sale.saleNo,
        totalAmount,
        receivableAmount: roundMoney(totalAmount - preparedPayment.cashPaymentTotal),
        occurredAt: dispatchDate,
        note: `Fuel sale ${sale.saleNo} increased customer receivables.`
      });
    }

    const receiptSale = await tx.erpFuelSale.findUniqueOrThrow({
      where: {
        id: sale.id
      },
      include: {
        sourceOperatingSite: true,
        customer: true,
        station: true,
        paymentCashbookAccount: true,
        payments: {
          include: {
            cashbookAccount: true,
            tenderMethod: true
          },
          orderBy: [{ createdAt: "asc" }]
        },
        lines: {
          include: {
            productProfile: true
          }
        }
      }
    });
    const receiptProductCodes = Array.from(
      new Set(receiptSale.lines.map((line) => line.productCodeSnapshot))
    );
    const receiptUomCodes = Array.from(
      new Set(receiptSale.lines.map((line) => line.productProfile?.defaultUomCode ?? "LTR"))
    );
    const receiptUnitPrices = Array.from(
      new Set(receiptSale.lines.map((line) => toNumber(line.unitPrice)))
    );
    const receiptPaymentAccount = receiptSale.paymentCashbookAccount
      ? receiptSale.paymentCashbookAccount.accountType === "MOBILE_MONEY"
        ? receiptSale.paymentCashbookAccount.mobileProviderName ??
          receiptSale.paymentCashbookAccount.name
        : receiptSale.paymentCashbookAccount.bankName ?? receiptSale.paymentCashbookAccount.name
      : null;
    const receiptPaymentAccountNames = Array.from(
      new Set(
        receiptSale.payments.map((payment) => {
          if (payment.tenderMethodNameSnapshot || payment.tenderMethod?.name) {
            return payment.tenderMethodNameSnapshot ?? payment.tenderMethod?.name ?? "Tender";
          }

          if (payment.cashbookAccount) {
            return payment.cashbookAccount.accountType === "MOBILE_MONEY"
              ? payment.cashbookAccount.mobileProviderName ?? payment.cashbookAccount.name
              : payment.cashbookAccount.bankName ?? payment.cashbookAccount.name;
          }

          return payment.paymentMode === PaymentMethod.STORE_CREDIT
            ? "Customer credit"
            : "Tender";
        })
      )
    );

    return {
      message:
        documentMode === "SALES_ORDER"
          ? `Flash ERP saved fuel sales order ${sale.saleNo}; stock will reduce when it is fulfilled.`
          : `Flash ERP saved fuel sale ${sale.saleNo} and reduced Item Dynamic stock from ${sourceSite.code}.`,
      fuelSaleId: sale.id,
      fuelSaleNo: sale.saleNo,
      fuelSaleReceipt: {
        fuelSaleId: receiptSale.id,
        saleNo: receiptSale.saleNo,
        loadingDate: receiptSale.loadingDate.toISOString(),
        dispatchDate: receiptSale.dispatchDate?.toISOString() ?? null,
        createdAt: receiptSale.createdAt.toISOString(),
        sourceSiteCode: receiptSale.sourceOperatingSite.code,
        sourceSiteName: receiptSale.sourceOperatingSite.name,
        currencyCode: receiptSale.currencyCode,
        customerName: receiptSale.customerName,
        customerNo: receiptSale.customer?.customerNo ?? null,
        stationCode: receiptSale.station?.stationCode ?? null,
        stationName: receiptSale.station?.stationName ?? null,
        serviceType: receiptSale.serviceType,
        productSummary:
          receiptProductCodes.length === 0
            ? "Not set"
            : receiptProductCodes.length === 1
              ? receiptProductCodes[0]
              : "Mixed",
        uomSummary:
          receiptUomCodes.length === 0
            ? "LTR"
            : receiptUomCodes.length === 1
              ? receiptUomCodes[0]
              : "Mixed",
        quantity: toNumber(receiptSale.totalQuantity),
        unitPrice: receiptUnitPrices.length === 1 ? receiptUnitPrices[0] : null,
        totalAmount: toNumber(receiptSale.totalAmount),
        paymentReceivedAmount: toNumber(receiptSale.paymentReceivedAmount),
        balanceAmount: toNumber(receiptSale.balanceAmount),
        paymentDate: receiptSale.paymentDate?.toISOString() ?? null,
        paymentAccountName:
          receiptPaymentAccountNames.length > 1
            ? "Mixed payments"
            : receiptPaymentAccountNames[0] ?? receiptPaymentAccount,
        paymentReference: receiptSale.paymentReference,
        paymentDetails: receiptSale.paymentDetails,
        truckLoaded: receiptSale.truckLoaded,
        lines: receiptSale.lines.map((line) => ({
          lineId: line.id,
          productCode: line.productCodeSnapshot,
          productName: line.productNameSnapshot,
          uomCode: line.productProfile?.defaultUomCode ?? "LTR",
          quantity: toNumber(line.quantity),
          unitPrice: toNumber(line.unitPrice),
          lineAmount: toNumber(line.lineAmount),
          notes: line.notes
        })),
        payments: receiptSale.payments.map((payment) => ({
          paymentId: payment.id,
          tenderMethodCode: payment.tenderMethodCodeSnapshot ?? payment.tenderMethod?.code ?? null,
          tenderMethodName: payment.tenderMethodNameSnapshot ?? payment.tenderMethod?.name ?? null,
          paymentMode: payment.paymentMode,
          cashbookAccountCode: payment.cashbookAccount?.code ?? null,
          cashbookAccountName: payment.cashbookAccount?.name ?? null,
          amount: toNumber(payment.amount),
          reference: payment.reference,
          receivedAt: payment.receivedAt?.toISOString() ?? null,
          notes: payment.notes
        })),
        paymentStatus: receiptSale.paymentStatus,
        status: receiptSale.status
      },
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function fulfillFuelSaleOrder(
  fuelSaleId: string,
  input: FulfillFuelSaleOrderRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const order = await tx.erpFuelSale.findFirst({
      where: {
        id: fuelSaleId,
        companyId: company.id,
        status: "ORDERED"
      },
      include: {
        sourceOperatingSite: true,
        customer: true,
        lines: true,
        payments: true
      }
    });

    if (!order) {
      throw new Error("Flash ERP could not find an open fuel sales order to fulfill.");
    }

    if (!order.customerId) {
      throw new Error(
        "Flash ERP needs this fuel sales order linked to a customer account before fulfillment."
      );
    }

    const dispatchDate =
      parseOptionalOperationDate(input.dispatchDate) ??
      order.dispatchDate ??
      new Date();

    if (dispatchDate < order.loadingDate) {
      throw new Error("Flash ERP dispatch date cannot be before the loading date.");
    }

    const additionalPaymentReceived = roundMoney(numberOrZero(input.paymentReceivedAmount));

    if (additionalPaymentReceived < 0) {
      throw new Error("Flash ERP received payment amount cannot be negative.");
    }

    const paymentCashbookAccountId =
      normalizeOptionalText(input.paymentCashbookAccountId) ?? order.paymentCashbookAccountId;

    if (additionalPaymentReceived > 0 && !paymentCashbookAccountId) {
      throw new Error("Flash ERP needs a Bank/MoMo account when payment has been received.");
    }

    const additionalPaymentAccount = paymentCashbookAccountId
      ? await tx.erpCashbookAccount.findFirst({
        where: {
          id: paymentCashbookAccountId,
          companyId: company.id,
          status: activeStatus,
          accountType: {
            in: ["BANK", "MOBILE_MONEY"]
          }
        }
      })
      : null;

    if (paymentCashbookAccountId && !additionalPaymentAccount) {
        throw new Error("Flash ERP could not find that Bank/MoMo payment account.");
    }

    const paymentReceivedAmount = roundMoney(
      toNumber(order.paymentReceivedAmount) + additionalPaymentReceived
    );
    const totalAmount = roundMoney(toNumber(order.totalAmount));

    if (paymentReceivedAmount > totalAmount) {
      throw new Error("Flash ERP received payment cannot exceed the fuel sale amount.");
    }

    const paymentDate =
      additionalPaymentReceived > 0
        ? parseOperationDate(input.paymentDate, "payment date")
        : parseOptionalOperationDate(input.paymentDate) ?? order.paymentDate;
    const additionalPaymentReference = normalizeOptionalText(input.paymentReference);
    const saleLines: FuelInventorySaleLine[] = [];

    for (const line of order.lines) {
      const { product } = await resolveFuelCatalogProduct(tx, context, company, {
        productProfileId: line.productProfileId
      });
      const unitCost = await getWeightedAverageInventoryCostRate(tx, context, order.sourceOperatingSite, {
        productId: product.id,
        fallbackUnitCost: product.baseCostPrice
      });

      saleLines.push({
        catalogProductId: product.id,
        unitCost,
        productCodeSnapshot: line.productCodeSnapshot,
        productNameSnapshot: line.productNameSnapshot,
        quantity: roundQuantity(toNumber(line.quantity))
      });
    }

    const { movements } = await buildFuelInventorySaleMovements(
      tx,
      context,
      order.sourceOperatingSite,
      saleLines,
      "fulfill"
    );

    await publishFuelInventorySaleMovements(tx, context, movements, {
      referenceType: "FUEL_SALE",
      referenceId: order.id,
      externalReference: order.saleNo,
      occurredAt: dispatchDate,
      idempotencyPrefix: "fuel-sale-fulfill"
    });

    const additionalPayment =
      additionalPaymentReceived > 0 && additionalPaymentAccount
        ? await tx.erpFuelSalePayment.create({
            data: {
              retailOrgId: context.retailOrgId,
              companyId: company.id,
              fuelSaleId: order.id,
              cashbookAccountId: additionalPaymentAccount.id,
              tenderMethodId: null,
              tenderMethodCodeSnapshot: null,
              tenderMethodNameSnapshot: null,
              paymentMode: additionalPaymentAccount.accountType,
              amount: additionalPaymentReceived,
              reference: additionalPaymentReference,
              receivedAt: paymentDate,
              notes: normalizeOptionalText(input.paymentDetails)
            }
          })
        : null;

    const sale = await tx.erpFuelSale.update({
      where: {
        id: order.id
      },
      data: {
        paymentCashbookAccountId,
        dispatchDate,
        paymentReceivedAmount,
        balanceAmount: roundMoney(totalAmount - paymentReceivedAmount),
        paymentDate,
        paymentReference:
          additionalPaymentReference ?? order.paymentReference,
        paymentDetails:
          normalizeOptionalText(input.paymentDetails) ?? order.paymentDetails,
        truckLoaded: normalizeOptionalText(input.truckLoaded) ?? order.truckLoaded,
        paymentStatus: derivePaymentStatus(totalAmount, paymentReceivedAmount),
        status: "POSTED",
        notes: normalizeOptionalText(input.notes) ?? order.notes
      }
    });

    const existingCashPaymentTotal = roundMoney(
      order.payments
        .filter((payment) => payment.cashbookAccountId)
        .reduce((sum, payment) => sum + toNumber(payment.amount), 0)
    );
    const legacyCashPayment =
      order.payments.length === 0 &&
      toNumber(order.paymentReceivedAmount) > 0 &&
      order.paymentCashbookAccountId
        ? [
            {
              cashbookAccountId: order.paymentCashbookAccountId,
              paymentMode: "LEGACY",
              amount: toNumber(order.paymentReceivedAmount),
              reference: order.paymentReference,
              receivedAt: order.paymentDate,
              notes: order.paymentDetails
            }
          ]
        : [];
    const financeCashPayments = [
      ...order.payments
        .filter((payment) => payment.cashbookAccountId)
        .map((payment) => ({
          cashbookAccountId: payment.cashbookAccountId,
          paymentMode: payment.paymentMode,
          amount: toNumber(payment.amount),
          reference: payment.reference,
          receivedAt: payment.receivedAt,
          notes: payment.notes
        })),
      ...legacyCashPayment,
      ...(additionalPayment
        ? [
            {
              cashbookAccountId: additionalPayment.cashbookAccountId,
              paymentMode: additionalPayment.paymentMode,
              amount: toNumber(additionalPayment.amount),
              reference: additionalPayment.reference,
              receivedAt: additionalPayment.receivedAt,
              notes: additionalPayment.notes
            }
          ]
        : [])
    ];
    const financeCashTotal = roundMoney(
      financeCashPayments.reduce((sum, payment) => sum + payment.amount, 0)
    );

    if (existingCashPaymentTotal > paymentReceivedAmount + 0.01) {
      throw new Error("Flash ERP fuel order payment rows exceed the fulfilled payment amount.");
    }

    const profitStore = await resolveFuelSourceStoreForCostCenter(
      tx,
      context.retailOrgId,
      order.sourceOperatingSite
    );

    await postFuelCommercialFinance(tx, context, company, {
      sourceType: "ERP-FUEL-SALE",
      workflowType: "FUEL_SALE",
      sourceId: sale.id,
      documentNo: sale.saleNo,
      postingDate: dispatchDate,
      currencyCode: sale.currencyCode,
      customerId: sale.customerId,
      customerName: sale.customerName,
      totalAmount,
      profitStore,
      cashPayments: financeCashPayments,
      lines: saleLines.map((line, index) => ({
        ...line,
        lineAmount: toNumber(order.lines[index]?.lineAmount)
      }))
    });

    await recordFuelReceivableCharge(tx, context, {
      customer: order.customer,
      transactionNo: sale.saleNo,
      totalAmount,
      receivableAmount: roundMoney(totalAmount - financeCashTotal),
      occurredAt: dispatchDate,
      note: `Fuel sales order ${sale.saleNo} increased customer receivables at fulfillment.`
    });

    return {
      message: `Flash ERP fulfilled fuel sales order ${sale.saleNo} and reduced Item Dynamic stock from ${order.sourceOperatingSite.code}.`,
      fuelSaleId: sale.id,
      fuelSaleNo: sale.saleNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function createFuelStationDelivery(
  input: CreateFuelStationDeliveryRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const functionalCurrencyCode = await getFuelFunctionalCurrencyCode(tx, context, company);
    const stationId = normalizeOptionalText(input.stationId);

    if (!stationId) {
      throw new Error("Flash ERP needs a filling station before recording an outbound delivery.");
    }

    const station = await tx.erpFuelStation.findFirst({
      where: {
        id: stationId,
        companyId: company.id
      },
      include: {
        customer: true,
        store: true,
        inventoryLocation: true
      }
    });

    if (!station) {
      throw new Error("Flash ERP could not find that filling station.");
    }

    if (!station.storeId || !station.inventoryLocationId || !station.store || !station.inventoryLocation) {
      throw new Error(
        "Flash ERP needs this filling station linked to a shop and receiving location before recording a transfer out."
      );
    }

    const deliveryDate = parseOperationDate(input.deliveryDate, "station delivery date");
    const sourceOperatingSiteId = normalizeOptionalText(input.sourceOperatingSiteId);
    const lines = input.lines?.filter((line) => normalizeOptionalText(line.sourceTankId)) ?? [];

    if (lines.length === 0) {
      throw new Error("Flash ERP needs at least one source tank line for a station delivery.");
    }

    const sourceSite = await validateSite(tx, company.id, sourceOperatingSiteId);

    if (!sourceSite) {
      throw new Error("Flash ERP needs the Item Dynamic source store/location for this fuel transfer.");
    }

    const sourceLocation = await resolveFuelTransferSourceInventoryLocation(
      tx,
      context.retailOrgId,
      sourceSite
    );
    const sourceStoreId = sourceLocation.storeId;
    const destinationStoreId = station.storeId;
    const destinationInventoryLocationId = station.inventoryLocationId;

    if (!sourceStoreId || !destinationStoreId || !destinationInventoryLocationId) {
      throw new Error("Flash ERP needs valid source and destination shops for this fuel transfer.");
    }

    if (sourceStoreId === destinationStoreId) {
      throw new Error("Flash ERP cannot transfer fuel from and to the same shop.");
    }

    const reserved = await reserveErpDocumentNumberInTransaction(tx, {
      retailOrgId: context.retailOrgId,
      companyId: company.id,
      documentType: "FUEL_STATION_DELIVERY"
    });

    const transferLines = [];
    const tankReductions = new Map<string, { tank: Awaited<ReturnType<typeof tx.erpFuelTank.findFirst>>; quantity: number }>();
    const productReductions = new Map<string, number>();
    const deliveryNoteNo = normalizeOptionalText(input.deliveryNoteNo) ?? reserved.documentNo;
    const customerReference = normalizeOptionalText(input.customerReference);

    for (const [index, line] of lines.entries()) {
      const sourceTankId = normalizeOptionalText(line.sourceTankId);

      if (!sourceTankId) {
        continue;
      }

      const tank = await tx.erpFuelTank.findFirst({
        where: {
          id: sourceTankId,
          companyId: company.id
        }
      });

      if (!tank) {
        throw new Error("Flash ERP could not find one of the station delivery source tanks.");
      }

      if (sourceOperatingSiteId && tank.operatingSiteId && tank.operatingSiteId !== sourceOperatingSiteId) {
        throw new Error("Flash ERP source tank does not belong to the selected dispatch site.");
      }

      const { product, profile } = await resolveFuelCatalogProduct(tx, context, company, {
        productProfileId: tank.productProfileId
      });
      const requestedQuantityInput = line.loadedQuantity ?? line.deliveredQuantity ?? line.orderedQuantity;
      const issuedQuantity = roundQuantity(
        positiveNumber(requestedQuantityInput, "transfer-out quantity")
      );
      const requestedQuantity =
        line.orderedQuantity === undefined || line.orderedQuantity === null
          ? issuedQuantity
          : roundQuantity(numberOrZero(line.orderedQuantity));
      const unitCost = await getWeightedAverageInventoryCostRate(tx, context, sourceSite, {
        productId: product.id,
        fallbackUnitCost: product.baseCostPrice
      });

      if (unitCost <= 0) {
        throw new Error(
          `Flash ERP needs a positive average or product cost for ${product.code} before issuing a valued fuel transfer.`
        );
      }

      const costAmount = roundMoney(issuedQuantity * unitCost);
      const existingReduction = tankReductions.get(tank.id);

      tankReductions.set(tank.id, {
        tank: existingReduction?.tank ?? tank,
        quantity: roundQuantity((existingReduction?.quantity ?? 0) + issuedQuantity)
      });
      productReductions.set(
        product.id,
        roundQuantity((productReductions.get(product.id) ?? 0) + issuedQuantity)
      );

      transferLines.push({
        lineNo: index + 1,
        tank,
        product,
        profile,
        requestedQuantity,
        issuedQuantity,
        unitCost,
        costAmount,
        notes: normalizeOptionalText(line.notes)
      });
    }

    if (transferLines.length === 0) {
      throw new Error("Flash ERP needs at least one valid source tank line for a fuel transfer.");
    }

    for (const reduction of tankReductions.values()) {
      if (!reduction.tank) {
        continue;
      }

      if (reduction.quantity > toNumber(reduction.tank.currentBookQuantity)) {
        throw new Error(`Flash ERP cannot dispatch more fuel than tank ${reduction.tank.code} has on book.`);
      }
    }

    for (const [productId, issuedQuantity] of productReductions.entries()) {
      const stock = await tx.inventoryLedgerEntry.aggregate({
        where: {
          retailOrgId: context.retailOrgId,
          inventoryLocationId: sourceLocation.id,
          productId
        },
        _sum: {
          quantity: true
        }
      });
      const availableQuantity = roundQuantity(toNumber(stock._sum.quantity));

      if (issuedQuantity > availableQuantity) {
        const productCode = transferLines.find((line) => line.product.id === productId)?.product.code ?? "product";

        throw new Error(
          `Flash ERP cannot transfer ${formatNumberForMessage(issuedQuantity)} ${productCode}; only ${formatNumberForMessage(availableQuantity)} is available at ${sourceLocation.code}.`
        );
      }
    }

    const totals = transferLines.reduce(
      (current, line) => ({
        ordered: current.ordered + line.requestedQuantity,
        loaded: current.loaded + line.issuedQuantity,
        delivered: current.delivered,
        variance: current.variance - line.issuedQuantity,
        cost: current.cost + line.costAmount
      }),
      { ordered: 0, loaded: 0, delivered: 0, variance: 0, cost: 0 }
    );
    const createdTransfers = [];

    for (const line of transferLines) {
      const transferNo =
        transferLines.length === 1
          ? reserved.documentNo
          : `${reserved.documentNo}-L${String(line.lineNo).padStart(2, "0")}`;
      const transfer = await tx.interStoreTransfer.create({
        data: {
          retailOrgId: context.retailOrgId,
          sourceStoreId,
          destinationStoreId,
          sourceInventoryLocationId: sourceLocation.id,
          destinationInventoryLocationId,
          productId: line.product.id,
          fuelStationId: station.id,
          sourceFuelTankId: line.tank?.id ?? null,
          transferNo,
          transferBatchNo: reserved.documentNo,
          lineNo: line.lineNo,
          externalReference: customerReference ?? deliveryNoteNo,
          workflowType: "FUEL_TRANSFER",
          origin: InterStoreTransferOrigin.ENTERPRISE,
          status: InterStoreTransferStatus.ISSUED,
          requestedQuantity: roundQuantity(line.requestedQuantity),
          issuedQuantity: roundQuantity(line.issuedQuantity),
          receivedQuantity: 0,
          unitCost: roundMoney(line.unitCost),
          transporterName: normalizeOptionalText(input.transporterName),
          vehicleRegistrationNo: normalizeOptionalText(input.vehicleRegistrationNo),
          driverName: normalizeOptionalText(input.driverName),
          driverContact: normalizeOptionalText(input.driverContact),
          deliveryNoteNo,
          feedbackStatus: "PENDING",
          valuationStatus: "IN_TRANSIT",
          issuedValuationAmount: roundMoney(line.costAmount),
          requestNote:
            line.notes ??
            normalizeOptionalText(input.notes) ??
            `HQ prepared ${formatNumberForMessage(line.issuedQuantity)} ${line.product.unitOfMeasure} of ${line.product.name} for ${station.stationName}.`,
          issueNote: `Issued ${formatNumberForMessage(line.issuedQuantity)} ${line.product.unitOfMeasure} of ${line.product.name} from ${sourceLocation.code} to ${station.inventoryLocation.code}.`,
          requestOperatorName: "Flash ERP",
          issueOperatorName: "Flash ERP",
          requestedAt: deliveryDate,
          requiredAt: parseOptionalOperationDate(input.requestedDeliveryDate),
          issuedAt: deliveryDate
        }
      });

      await tx.inventoryLedgerEntry.create({
        data: {
          retailOrgId: context.retailOrgId,
          storeId: sourceStoreId,
          warehouseId: sourceLocation.warehouseId,
          inventoryLocationId: sourceLocation.id,
          productId: line.product.id,
          movementType: InventoryMovementType.STOCK_TRANSFER_OUT,
          quantity: roundQuantity(line.issuedQuantity * -1),
          unitCost: roundMoney(line.unitCost),
          referenceType: "INTER_STORE_TRANSFER",
          referenceId: transfer.id,
          externalReference: transfer.transferNo,
          sourceNodeCode: "ENTERPRISE",
          occurredAt: deliveryDate
        }
      });

      await queueInterStoreTransferPublication(tx, {
        transferId: transfer.id,
        publishedAt: deliveryDate
      });

      createdTransfers.push({
        transfer,
        line
      });
    }

    const issueJournal = await postFuelTransferIssueFinance(tx, context, company, {
      batchNo: reserved.documentNo,
      postingDate: deliveryDate,
      sourceStore: {
        id: sourceStoreId,
        code: sourceLocation.store?.code ?? sourceLocation.code,
        name: sourceLocation.store?.name ?? sourceLocation.name
      },
      destinationStore: {
        id: station.store.id,
        code: station.store.code,
        name: station.store.name
      },
      lines: createdTransfers.map(({ transfer, line }) => ({
        transferId: transfer.id,
        transferNo: transfer.transferNo,
        productCode: line.product.code,
        productName: line.product.name,
        issuedQuantity: line.issuedQuantity,
        unitCost: line.unitCost
      }))
    });

    if (issueJournal) {
      for (const { transfer, line } of createdTransfers) {
        await tx.interStoreTransfer.update({
          where: {
            id: transfer.id
          },
          data: {
            issueJournalEntryId: issueJournal.journalEntryId,
            issuedValuationAmount: roundMoney(line.costAmount),
            valuationStatus: "IN_TRANSIT"
          }
        });
      }
    }

    for (const reduction of tankReductions.values()) {
      if (!reduction.tank) {
        continue;
      }

      await tx.erpFuelTank.update({
        where: {
          id: reduction.tank.id
        },
        data: {
          currentBookQuantity: roundQuantity(
            toNumber(reduction.tank.currentBookQuantity) - reduction.quantity
          )
        }
      });
    }

    const firstTransfer = createdTransfers[0]?.transfer;

    return {
      message: `Flash ERP issued fuel transfer ${reserved.documentNo} to ${station.stationName}, reducing Item Dynamic stock from ${sourceLocation.code}.`,
      stationDeliveryId: firstTransfer?.id,
      stationDeliveryNo: reserved.documentNo,
      stationDeliveryReceipt: {
        stationDeliveryId: firstTransfer?.id ?? reserved.documentNo,
        deliveryNo: reserved.documentNo,
        deliveryDate: deliveryDate.toISOString(),
        createdAt: new Date().toISOString(),
        stationCode: station.stationCode,
        stationName: station.stationName,
        customerNo: station.customer?.customerNo ?? null,
        customerName: station.stationName,
        sourceSiteCode: sourceLocation.code,
        currencyCode: normalizeCode(input.currencyCode ?? functionalCurrencyCode, "currency"),
        totalLoadedQuantity: roundQuantity(totals.loaded),
        totalDeliveredQuantity: 0,
        totalVarianceQuantity: roundQuantity(totals.variance),
        totalSalesAmount: 0,
        totalCostAmount: roundMoney(totals.cost),
        marginAmount: 0,
        uomSummary:
          Array.from(new Set(transferLines.map((line) => line.product.unitOfMeasure))).length === 1
            ? transferLines[0]?.product.unitOfMeasure ?? "LTR"
            : "Mixed",
        amountReceived: 0,
        outstandingAmount: 0,
        paymentMode: "TRANSFER",
        paymentReceivedAt: null,
        paymentReference: customerReference,
        paymentStatus: "NOT_APPLICABLE",
        invoiceStatus: "NOT_APPLICABLE",
        lines: createdTransfers.map(({ transfer, line }) => ({
          lineId: transfer.id,
          productCode: line.product.code,
          productName: line.product.name,
          uomCode: line.product.unitOfMeasure ?? line.profile.defaultUomCode ?? "LTR",
          orderedQuantity: line.requestedQuantity,
          loadedQuantity: line.issuedQuantity,
          deliveredQuantity: 0,
          unitSellingPrice: 0,
          salesAmount: 0,
          unitCost: line.unitCost,
          costAmount: line.costAmount,
          marginAmount: 0,
          notes: line.notes
        })),
        transferBatchNo: reserved.documentNo,
        transferNo: createdTransfers.length === 1 ? firstTransfer?.transferNo ?? null : null,
        destinationStoreCode: station.store.code,
        destinationStoreName: station.store.name,
        destinationLocationCode: station.inventoryLocation.code,
        destinationLocationName: station.inventoryLocation.name,
        transporterName: normalizeOptionalText(input.transporterName),
        vehicleRegistrationNo: normalizeOptionalText(input.vehicleRegistrationNo),
        driverName: normalizeOptionalText(input.driverName),
        driverContact: normalizeOptionalText(input.driverContact),
        deliveryNoteNo,
        feedbackStatus: "PENDING",
        valuationStatus: issueJournal ? "IN_TRANSIT" : "PENDING",
        issueJournalEntryId: issueJournal?.journalEntryId ?? null,
        receiptJournalEntryId: null,
        issuedValuationAmount: roundMoney(totals.cost),
        receivedValuationAmount: null,
        varianceValuationAmount: null,
        valuationPostedAt: null,
        waterTestResult: null,
        quantityBeforeDelivery: null,
        expectedQuantityReceived: roundQuantity(totals.loaded),
        expectedStockQuantity: null,
        quantityAfterDelivery: null,
        actualQuantityReceived: null,
        feedbackVarianceQuantity: null,
        feedbackDipReading: null,
        beforeDischargeEvidence: [],
        afterDischargeEvidence: [],
        feedbackNote: null,
        feedbackRecordedAt: null,
        feedbackConfirmedAt: null,
        feedbackPostedAt: null,
        status: InterStoreTransferStatus.ISSUED
      },
      serverProcessedAt: new Date().toISOString()
    };
  });
}

function normalizeWaterTestResult(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value)?.toUpperCase() ?? null;

  if (!normalized) {
    return null;
  }

  return ["POSITIVE", "NEGATIVE"].includes(normalized) ? normalized : null;
}

function normalizeTransferFeedbackEvidence(value: unknown) {
  const parsed = parseJsonField(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const url = normalizeOptionalText(
        typeof record.url === "string" ? record.url : null,
      );

      if (!url) {
        return null;
      }

      return {
        url,
        fileName: normalizeOptionalText(
          typeof record.fileName === "string" ? record.fileName : null,
        ),
        capturedAt: normalizeOptionalText(
          typeof record.capturedAt === "string" ? record.capturedAt : null,
        ),
        uploadedAt: normalizeOptionalText(
          typeof record.uploadedAt === "string" ? record.uploadedAt : null,
        ),
      };
    })
    .filter(
      (item): item is {
        url: string;
        fileName: string | null;
        capturedAt: string | null;
        uploadedAt: string | null;
      } => Boolean(item),
    )
    .slice(0, 30);
}

export async function recordFuelTransferFeedback(
  transferId: string,
  input: RecordFuelTransferFeedbackRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const fuelProductWhere = fuelTransferProductWhere();
    const transfer = await tx.interStoreTransfer.findFirst({
      where: {
        id: transferId,
        retailOrgId: context.retailOrgId,
        OR: [
          {
            workflowType: "FUEL_TRANSFER"
          },
          {
            product: fuelProductWhere
          }
        ]
      },
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        issuedQuantity: true,
        receiptJournalEntryId: true
      }
    });

    if (!transfer) {
      throw new Error("Flash ERP could not find that fuel transfer for feedback.");
    }

    const batchWhere: Prisma.InterStoreTransferWhereInput = transfer.transferBatchNo
      ? {
          retailOrgId: context.retailOrgId,
          OR: [
            {
              workflowType: "FUEL_TRANSFER"
            },
            {
              product: fuelProductWhere
            }
          ],
          transferBatchNo: transfer.transferBatchNo
        }
      : {
          retailOrgId: context.retailOrgId,
          OR: [
            {
              workflowType: "FUEL_TRANSFER"
            },
            {
              product: fuelProductWhere
            }
          ],
          id: transfer.id
        };
    const transferLines = await tx.interStoreTransfer.findMany({
      where: batchWhere,
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        issuedQuantity: true,
        receivedQuantity: true,
        unitCost: true,
        issueJournalEntryId: true,
        receiptJournalEntryId: true,
        product: {
          select: {
            code: true,
            name: true
          }
        },
        sourceStore: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        destinationStore: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    });
    const issuedFromTransfer = roundQuantity(
      transferLines.reduce((sum, line) => sum + toNumber(line.issuedQuantity), 0)
    );
    const receivedFromTransfer = roundQuantity(
      transferLines.reduce((sum, line) => sum + toNumber(line.receivedQuantity), 0)
    );
    const expectedQuantityReceived =
      optionalNumber(input.expectedQuantityReceived, "expected quantity received") ??
      (receivedFromTransfer > 0 ? receivedFromTransfer : issuedFromTransfer);
    const quantityBeforeDelivery = optionalNumber(
      input.quantityBeforeDelivery,
      "quantity before delivery"
    );
    const expectedStockQuantity =
      optionalNumber(input.expectedStockQuantity, "expected stock") ??
      (quantityBeforeDelivery === null
        ? null
        : roundQuantity(quantityBeforeDelivery + expectedQuantityReceived));
    const quantityAfterDelivery = optionalNumber(input.quantityAfterDelivery, "quantity after delivery");
    let actualQuantityReceived =
      optionalNumber(input.actualQuantityReceived, "actual quantity received") ??
      (receivedFromTransfer > 0
        ? receivedFromTransfer
        : null) ??
      (quantityBeforeDelivery === null || quantityAfterDelivery === null
        ? null
        : roundQuantity(quantityAfterDelivery - quantityBeforeDelivery));
    const action = normalizeOptionalText(input.action)?.toUpperCase() ?? "SAVE";
    const feedbackDipReading = optionalNumber(input.feedbackDipReading, "dip reading");
    const beforeDischargeEvidence = normalizeTransferFeedbackEvidence(
      input.beforeDischargeEvidence
    );
    const afterDischargeEvidence = normalizeTransferFeedbackEvidence(
      input.afterDischargeEvidence
    );

    if (action === "POST" && actualQuantityReceived === null) {
      actualQuantityReceived = receivedFromTransfer > 0 ? receivedFromTransfer : null;
    }

    if (action === "POST" && actualQuantityReceived === null) {
      throw new Error(
        "Flash ERP needs actual quantity received before posting transfer valuation."
      );
    }

    if (actualQuantityReceived !== null && actualQuantityReceived < 0) {
      throw new Error("Flash ERP actual quantity received cannot be negative.");
    }

    if (feedbackDipReading !== null && feedbackDipReading < 0) {
      throw new Error("Flash ERP dip reading cannot be negative.");
    }

    if ((action === "CONFIRM" || action === "POST") && feedbackDipReading === null) {
      throw new Error("Capture the transfer feedback dip reading before confirming feedback.");
    }

    if (
      (action === "CONFIRM" || action === "POST") &&
      beforeDischargeEvidence.length === 0
    ) {
      throw new Error("Upload at least one before-discharge photo before confirming feedback.");
    }

    if (
      (action === "CONFIRM" || action === "POST") &&
      afterDischargeEvidence.length === 0
    ) {
      throw new Error("Upload at least one after-discharge photo before confirming feedback.");
    }

    const feedbackVarianceQuantity =
      actualQuantityReceived === null
        ? null
        : roundQuantity(actualQuantityReceived - expectedQuantityReceived);
    const now = new Date();
    const feedbackStatus =
      action === "POST" ? "POSTED" : action === "CONFIRM" ? "CONFIRMED" : "RECORDED";
    const batchNo = transfer.transferBatchNo ?? transfer.transferNo;
    let receiptJournalEntryId: string | null = null;
    let receiptPosting:
      | Awaited<ReturnType<typeof postFuelTransferReceiptFinance>>
      | null = null;
    let postedActualQuantity: number | null = null;

    if (action === "POST") {
      if (transferLines.length === 0) {
        throw new Error("Flash ERP could not find fuel transfer lines for valuation posting.");
      }

      postedActualQuantity = actualQuantityReceived;
      if (postedActualQuantity === null) {
        throw new Error("Flash ERP needs actual quantity received before posting transfer valuation.");
      }

      const postingLines: FuelTransferPostingLine[] = transferLines.map((line) => ({
        transferId: line.id,
        transferNo: line.transferNo,
        productCode: line.product.code,
        productName: line.product.name,
        issuedQuantity: toNumber(line.issuedQuantity),
        unitCost: roundRate(toNumber(line.unitCost))
      }));
      const missingCostLine = postingLines.find((line) => line.unitCost <= 0);

      if (missingCostLine) {
        throw new Error(
          `Flash ERP needs a positive transfer cost for ${missingCostLine.productCode} before posting transfer valuation.`
        );
      }

      const sourceStore = transferLines[0].sourceStore;
      const destinationStore = transferLines[0].destinationStore;
      const existingIssueJournal = await tx.glJournalEntry.findFirst({
        where: {
          retailOrgId: context.retailOrgId,
          sourceType: "ERP-FUEL-TRANSFER-ISSUE",
          sourceId: batchNo
        },
        select: {
          id: true
        }
      });
      let issueJournalEntryId = existingIssueJournal?.id ?? null;

      if (!issueJournalEntryId) {
        const issueJournal = await postFuelTransferIssueFinance(tx, context, company, {
          batchNo,
          postingDate: now,
          sourceStore,
          destinationStore,
          lines: postingLines
        });

        issueJournalEntryId = issueJournal?.journalEntryId ?? null;
      }

      if (issueJournalEntryId) {
        for (const line of transferLines) {
          await tx.interStoreTransfer.update({
            where: {
              id: line.id
            },
            data: {
              issueJournalEntryId,
              issuedValuationAmount: roundMoney(toNumber(line.issuedQuantity) * toNumber(line.unitCost)),
              valuationStatus: "IN_TRANSIT"
            }
          });
        }
      }

      const existingReceiptJournal = await tx.glJournalEntry.findFirst({
        where: {
          retailOrgId: context.retailOrgId,
          sourceType: "ERP-FUEL-TRANSFER-RECEIPT",
          sourceId: batchNo
        },
        select: {
          id: true
        }
      });

      if (existingReceiptJournal) {
        receiptJournalEntryId = existingReceiptJournal.id;
      } else {
        receiptPosting = await postFuelTransferReceiptFinance(tx, context, company, {
          batchNo,
          postingDate: now,
          destinationStore,
          actualQuantityReceived: postedActualQuantity,
          lines: postingLines
        });
        receiptJournalEntryId = receiptPosting?.journal.journalEntryId ?? null;
      }
    }

    await tx.interStoreTransfer.updateMany({
      where: batchWhere,
      data: {
        workflowType: "FUEL_TRANSFER",
        feedbackStatus,
        waterTestResult: normalizeWaterTestResult(input.waterTestResult),
        quantityBeforeDelivery,
        expectedQuantityReceived,
        expectedStockQuantity,
        quantityAfterDelivery,
        actualQuantityReceived,
        feedbackVarianceQuantity,
        feedbackDipReading,
        beforeDischargeEvidenceJson: serializeRequiredJsonField(beforeDischargeEvidence),
        afterDischargeEvidenceJson: serializeRequiredJsonField(afterDischargeEvidence),
        feedbackNote: normalizeOptionalText(input.feedbackNote),
        feedbackRecordedAt: now,
        feedbackConfirmedAt: action === "CONFIRM" || action === "POST" ? now : undefined,
        feedbackPostedAt: action === "POST" ? now : undefined,
        feedbackOperatorName: normalizeOptionalText(input.feedbackOperatorName) ?? "Flash ERP"
      }
    });

    if (action === "POST" && receiptJournalEntryId) {
      if (postedActualQuantity === null) {
        throw new Error("Flash ERP needs actual quantity received before posting transfer valuation.");
      }

      const actualByTransferId =
        receiptPosting?.actualByTransferId ??
        allocateFuelTransferActualQuantities(
          transferLines.map((line) => ({
            transferId: line.id,
            transferNo: line.transferNo,
            productCode: line.product.code,
            productName: line.product.name,
            issuedQuantity: toNumber(line.issuedQuantity),
            unitCost: roundRate(toNumber(line.unitCost))
          })),
          postedActualQuantity
        );

      for (const line of transferLines) {
        const unitCost = roundRate(toNumber(line.unitCost));
        const issuedAmount = roundMoney(toNumber(line.issuedQuantity) * unitCost);
        const receivedAmount = roundMoney((actualByTransferId.get(line.id) ?? 0) * unitCost);

        await tx.interStoreTransfer.update({
          where: {
            id: line.id
          },
          data: {
            receiptJournalEntryId,
            receivedValuationAmount: receivedAmount,
            varianceValuationAmount: roundMoney(issuedAmount - receivedAmount),
            valuationStatus: "POSTED",
            valuationPostedAt: now
          }
        });
      }
    }

    return {
      message:
        action === "POST"
          ? `Flash ERP posted transfer valuation for fuel transfer ${batchNo}.`
          : action === "CONFIRM"
            ? `Flash ERP confirmed feedback for fuel transfer ${batchNo}.`
            : `Flash ERP saved feedback for fuel transfer ${batchNo}.`,
      stationDeliveryId: transfer.id,
      stationDeliveryNo: batchNo,
      serverProcessedAt: now.toISOString()
    };
  });
}

async function getLatestAverageCostRate(
  tx: Prisma.TransactionClient,
  tankId: string,
  beforeDate: Date
) {
  const latestCostLine = await tx.erpFuelDeliveryLine.findFirst({
    where: {
      tankId,
      acceptedQuantity: {
        gt: 0
      },
      delivery: {
        deliveryDate: {
          lt: beforeDate
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!latestCostLine) {
    return 0;
  }

  return roundRate(toNumber(latestCostLine.lineCostAmount) / toNumber(latestCostLine.acceptedQuantity));
}

export async function createFuelDailyReconciliation(
  input: CreateFuelReconciliationRequest
): Promise<FuelOperationsMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const { context, company } = await ensureFuelFoundation(tx);
    const reconciliationDate = parseOperationDate(input.reconciliationDate, "reconciliation date");
    const { start, end } = dayRange(reconciliationDate);
    const operatingSiteId = normalizeOptionalText(input.operatingSiteId);

    await validateSite(tx, company.id, operatingSiteId);

    const existing = await tx.erpFuelDailyReconciliation.findFirst({
      where: {
        companyId: company.id,
        operatingSiteId,
        reconciliationDate: start
      }
    });
    const tanks = await tx.erpFuelTank.findMany({
      where: {
        companyId: company.id,
        status: activeStatus,
        ...(operatingSiteId ? { operatingSiteId } : {})
      },
      orderBy: [{ code: "asc" }]
    });

    if (tanks.length === 0) {
      throw new Error("Flash ERP needs at least one active fuel tank for reconciliation.");
    }

    const reconciliationNo = existing
      ? existing.reconciliationNo
      : (
          await reserveErpDocumentNumberInTransaction(tx, {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            documentType: "FUEL_RECONCILIATION"
          })
        ).documentNo;

    const lines = [];

    for (const tank of tanks) {
      const previousReconciliation = await tx.erpFuelDailyReconciliation.findFirst({
        where: {
          companyId: company.id,
          reconciliationDate: {
            lt: start
          },
          lines: {
            some: {
              tankId: tank.id
            }
          }
        },
        include: {
          lines: {
            where: {
              tankId: tank.id
            }
          }
        },
        orderBy: {
          reconciliationDate: "desc"
        }
      });
      const previousLine = previousReconciliation?.lines[0] ?? null;
      const deliveryAggregate = await tx.erpFuelDeliveryLine.aggregate({
        where: {
          tankId: tank.id,
          delivery: {
            deliveryDate: {
              gte: start,
              lt: end
            }
          }
        },
        _sum: {
          acceptedQuantity: true,
          lineCostAmount: true
        }
      });
      const meterAggregate = await tx.erpFuelMeterReading.aggregate({
        where: {
          tankId: tank.id,
          readingDate: {
            gte: start,
            lt: end
          }
        },
        _sum: {
          salesQuantity: true,
          salesAmount: true
        }
      });
      const stationDeliveryAggregate = await tx.erpFuelStationDeliveryLine.aggregate({
        where: {
          sourceTankId: tank.id,
          stationDelivery: {
            deliveryDate: {
              gte: start,
              lt: end
            }
          }
        },
        _sum: {
          loadedQuantity: true,
          salesAmount: true,
          costAmount: true
        }
      });
      const fuelTransferLines = await tx.interStoreTransfer.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          workflowType: "FUEL_TRANSFER",
          sourceFuelTankId: tank.id,
          status: {
            not: InterStoreTransferStatus.CANCELLED
          },
          issuedAt: {
            gte: start,
            lt: end
          }
        },
        select: {
          issuedQuantity: true,
          unitCost: true
        }
      });
      const latestDip = await tx.erpFuelTankDip.findFirst({
        where: {
          tankId: tank.id,
          dipDate: {
            gte: start,
            lt: end
          }
        },
        orderBy: [{ dipDate: "desc" }, { createdAt: "desc" }]
      });

      const openingQuantity = roundQuantity(
        previousLine ? toNumber(previousLine.bookClosingQuantity) : toNumber(tank.openingQuantity)
      );
      const deliveredQuantity = roundQuantity(toNumber(deliveryAggregate._sum.acceptedQuantity));
      const meterSalesQuantity = roundQuantity(toNumber(meterAggregate._sum.salesQuantity));
      const transferOutQuantity = roundQuantity(
        fuelTransferLines.reduce((sum, transfer) => sum + toNumber(transfer.issuedQuantity), 0)
      );
      const stationDeliveryQuantity = roundQuantity(
        toNumber(stationDeliveryAggregate._sum.loadedQuantity) + transferOutQuantity
      );
      const bookClosingQuantity = roundQuantity(
        openingQuantity + deliveredQuantity - meterSalesQuantity - stationDeliveryQuantity
      );
      const dipClosingQuantity = latestDip ? toNumber(latestDip.dipQuantity) : bookClosingQuantity;
      const gainLossQuantity = roundQuantity(dipClosingQuantity - bookClosingQuantity);
      const sameDayAverageCost =
        deliveredQuantity > 0
          ? roundRate(toNumber(deliveryAggregate._sum.lineCostAmount) / deliveredQuantity)
          : 0;
      const averageCostRate =
        sameDayAverageCost > 0 ? sameDayAverageCost : await getLatestAverageCostRate(tx, tank.id, start);
      const stationDeliverySalesAmount = roundMoney(
        toNumber(stationDeliveryAggregate._sum.salesAmount)
      );
      const stationDeliveryCostAmount = roundMoney(
        toNumber(stationDeliveryAggregate._sum.costAmount) +
          fuelTransferLines.reduce(
            (sum, transfer) =>
              sum + toNumber(transfer.issuedQuantity) * toNumber(transfer.unitCost),
            0
          )
      );
      const salesAmount = roundMoney(
        toNumber(meterAggregate._sum.salesAmount) + stationDeliverySalesAmount
      );
      const costAmount = roundMoney(meterSalesQuantity * averageCostRate + stationDeliveryCostAmount);
      const lineMarginAmount = roundMoney(salesAmount - costAmount);

      lines.push({
        retailOrgId: context.retailOrgId,
        companyId: company.id,
        tankId: tank.id,
        productProfileId: tank.productProfileId,
        openingQuantity,
        deliveredQuantity,
        stationDeliveryQuantity,
        meterSalesQuantity,
        bookClosingQuantity,
        dipClosingQuantity,
        gainLossQuantity,
        averageCostRate,
        stationDeliverySalesAmount,
        stationDeliveryCostAmount,
        salesAmount,
        costAmount,
        marginAmount: lineMarginAmount,
        marginPercent: marginPercent(lineMarginAmount, salesAmount),
        notes: latestDip ? `Dip reference ${latestDip.dipReference ?? latestDip.id}` : null
      });
    }

    const totals = lines.reduce(
      (current, line) => ({
        opening: current.opening + line.openingQuantity,
        delivered: current.delivered + line.deliveredQuantity,
        stationDelivery: current.stationDelivery + line.stationDeliveryQuantity,
        salesQuantity: current.salesQuantity + line.meterSalesQuantity,
        bookClosing: current.bookClosing + line.bookClosingQuantity,
        dipClosing: current.dipClosing + line.dipClosingQuantity,
        gainLoss: current.gainLoss + line.gainLossQuantity,
        salesAmount: current.salesAmount + line.salesAmount,
        costAmount: current.costAmount + line.costAmount,
        marginAmount: current.marginAmount + line.marginAmount
      }),
      {
        opening: 0,
        delivered: 0,
        stationDelivery: 0,
        salesQuantity: 0,
        bookClosing: 0,
        dipClosing: 0,
        gainLoss: 0,
        salesAmount: 0,
        costAmount: 0,
        marginAmount: 0
      }
    );

    let reconciliation;

    if (existing) {
      await tx.erpFuelReconciliationLine.deleteMany({
        where: {
          reconciliationId: existing.id
        }
      });
      reconciliation = await tx.erpFuelDailyReconciliation.update({
        where: {
          id: existing.id
        },
        data: {
          reconciliationDate: start,
          notes: normalizeOptionalText(input.notes),
          totalOpeningQuantity: roundQuantity(totals.opening),
          totalDeliveredQuantity: roundQuantity(totals.delivered),
          totalStationDeliveryQuantity: roundQuantity(totals.stationDelivery),
          totalMeterSalesQuantity: roundQuantity(totals.salesQuantity),
          totalBookClosingQuantity: roundQuantity(totals.bookClosing),
          totalDipClosingQuantity: roundQuantity(totals.dipClosing),
          totalGainLossQuantity: roundQuantity(totals.gainLoss),
          totalSalesAmount: roundMoney(totals.salesAmount),
          totalCostAmount: roundMoney(totals.costAmount),
          marginAmount: roundMoney(totals.marginAmount),
          marginPercent: marginPercent(totals.marginAmount, totals.salesAmount),
          lines: {
            create: lines
          }
        }
      });
    } else {
      reconciliation = await tx.erpFuelDailyReconciliation.create({
        data: {
          retailOrgId: context.retailOrgId,
          companyId: company.id,
          operatingSiteId,
          reconciliationNo,
          reconciliationDate: start,
          notes: normalizeOptionalText(input.notes),
          status: "POSTED",
          totalOpeningQuantity: roundQuantity(totals.opening),
          totalDeliveredQuantity: roundQuantity(totals.delivered),
          totalStationDeliveryQuantity: roundQuantity(totals.stationDelivery),
          totalMeterSalesQuantity: roundQuantity(totals.salesQuantity),
          totalBookClosingQuantity: roundQuantity(totals.bookClosing),
          totalDipClosingQuantity: roundQuantity(totals.dipClosing),
          totalGainLossQuantity: roundQuantity(totals.gainLoss),
          totalSalesAmount: roundMoney(totals.salesAmount),
          totalCostAmount: roundMoney(totals.costAmount),
          marginAmount: roundMoney(totals.marginAmount),
          marginPercent: marginPercent(totals.marginAmount, totals.salesAmount),
          lines: {
            create: lines
          }
        }
      });
    }

    for (const line of lines) {
      await tx.erpFuelTank.update({
        where: {
          id: line.tankId
        },
        data: {
          currentBookQuantity: line.dipClosingQuantity
        }
      });
    }

    return {
      message: `Flash ERP reconciled fuel day ${reconciliation.reconciliationNo}.`,
      reconciliationId: reconciliation.id,
      reconciliationNo: reconciliation.reconciliationNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
