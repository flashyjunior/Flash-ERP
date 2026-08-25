"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { calculatePosBaseQuantity } from "@flash-erp/domain";
import { applyAutomaticPromotions, calculateLoyaltyRedemption } from "@flash-erp/sync-core";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import type { SheetData } from "write-excel-file/browser";

import {
  FuelOperationsWorkspace,
  type ViewKey as FuelOperationsViewKey
} from "@/components/enterprise/erp-fuel-operations-workspace";
import { OnlineStoreEcommerceWorkspace } from "@/components/ecommerce/online-store-ecommerce-workspace";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import type { OnlineStoreEcommerceWorkspaceData } from "@/server/ecommerce/ecommerce.repository";
import {
  defaultAccountPaymentReceiptTemplateHtml,
  defaultThermalReceiptTemplateHtml,
  documentTemplateRawHtml,
  renderDocumentTemplateHtml
} from "@/lib/templates/thermal-receipt-templates";
import type {
  CancelOnlineStoreSalesOrderResponse,
  CreateOnlineStoreCorrectionResponse,
  CreateOnlineStoreGoodsReceiptResponse,
  CreateOnlineStoreHeldSaleResponse,
  CreateOnlineStoreSaleResponse,
  CreateOnlineStoreSalesOrderFulfilmentTransferResponse,
  CreateOnlineStoreSalesOrderResponse,
  CreateOnlineStoreStockCountResponse,
  CreateOnlineStoreSupplierReturnResponse,
  CreateOnlineStoreTransferResponse,
  CommitOnlineStoreStockCountResponse,
  ProcessOnlineStoreTransferResponse,
  BrowseOnlineStoreReportsResponse,
  OnlineStoreRemoteInventoryLookupResponse,
  OnlineStoreLayawayActionResponse,
  OnlineStoreTransactionReferenceSummary,
  OnlineStoreWorkspaceData,
  OnlineStoreUnlockResponse,
  OpenOnlineStoreShiftResponse,
  RecordOnlineStoreAccountPaymentResponse,
  RecordOnlineStoreBankingResponse,
  RecordOnlineStoreEodResponse
} from "@/server/repositories/online-store.repository";

type Product = OnlineStoreWorkspaceData["products"][number];
type Customer = OnlineStoreWorkspaceData["customers"][number];
type HeldSale = OnlineStoreWorkspaceData["heldSales"][number];
type SalesOrder = OnlineStoreWorkspaceData["salesOrders"][number];
type AccountPayment = OnlineStoreWorkspaceData["accountPayments"][number];
type TenderMethod = OnlineStoreWorkspaceData["tenderMethods"][number];
type Receipt = CreateOnlineStoreSaleResponse["receipt"];
type AccountPaymentReceipt = RecordOnlineStoreAccountPaymentResponse["receipt"];
type OnlineShift = NonNullable<OnlineStoreWorkspaceData["shift"]>;
type WorkspaceId = "dashboard" | "pos" | "ecommerce" | "inventory" | "expenses" | "manager" | "reversals" | "reports" | "settings" | "fuel";
type ManagerTab = "shift" | "eod" | "banking" | "summary";
type ReportId =
  | "sales"
  | "products"
  | "orders"
  | "layaways"
  | "layawayPayments"
  | "tenders"
  | "inventory"
  | "banking"
  | "shifts";
type InventoryTab = "stock" | "receiving" | "transfers" | "counts";
type InventoryStockSection = "inventory-browser" | "batch-register";
type InventoryReceivingSection = "purchase-orders" | "goods-receipts" | "supplier-returns";
type TransferEntryTab = "header" | "details";
type CountEntryTab = "header" | "sheet" | "variance";
type PosDrawer = "details" | "held" | "orders" | "account" | "receipts" | "report" | null;
type SaleMode = "SALE" | "SALES_ORDER" | "LAYAWAY";
type LayawayActionKind = "PAYMENT" | "CANCEL" | "RELEASE" | "EXPIRE";
type LayawayActionDraft = {
  kind: LayawayActionKind;
  order: SalesOrder;
};
type ReceiptHistoryKind = "SALES" | "SALES_ORDER" | "ACCOUNT_PAYMENT";
type ShiftReportKind = "X" | "Z";
type PurchaseOrderDialogMode = "view" | "receive" | null;
type SupplierReturnReason = "DAMAGED" | "REJECTED_AT_RECEIPT" | "QUALITY_HOLD" | "SHORT_EXPIRY" | "WRONG_ITEM" | "OTHER";

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

type PurchaseOrderSummary = OnlineStoreWorkspaceData["purchaseOrders"][number];
type PurchaseOrderLine = PurchaseOrderSummary["lines"][number];
type GoodsReceiptSummary = OnlineStoreWorkspaceData["recentGoodsReceipts"][number];
type TransferRequest = OnlineStoreWorkspaceData["transferRequests"][number];
type RemoteInventoryRow = OnlineStoreRemoteInventoryLookupResponse["rows"][number];
type TransferFeedbackEvidence = TransferRequest["beforeDischargeEvidence"][number];
type TransferDirectionFilter = "ALL" | "IN" | "OUT";
type TransferDocumentGroup = {
  key: string;
  documentNo: string;
  statusLabel: string;
  workflowType: string | null;
  sourceStoreCode: string;
  sourceStoreName: string;
  destinationStoreCode: string;
  destinationStoreName: string;
  requestedQuantity: number;
  issuedQuantity: number;
  receivedQuantity: number;
  outstandingIssueQuantity: number;
  outstandingReceiptQuantity: number;
  externalReference: string | null;
  transporterName: string | null;
  vehicleRegistrationNo: string | null;
  driverName: string | null;
  driverContact: string | null;
  deliveryNoteNo: string | null;
  feedbackStatus: string;
  waterTestResult: string | null;
  quantityBeforeDelivery: number | null;
  expectedQuantityReceived: number | null;
  expectedStockQuantity: number | null;
  quantityAfterDelivery: number | null;
  actualQuantityReceived: number | null;
  feedbackVarianceQuantity: number | null;
  feedbackDipReading: number | null;
  beforeDischargeEvidence: TransferFeedbackEvidence[];
  afterDischargeEvidence: TransferFeedbackEvidence[];
  feedbackNote: string | null;
  feedbackRecordedAt: string | null;
  feedbackConfirmedAt: string | null;
  feedbackPostedAt: string | null;
  feedbackOperatorName: string | null;
  updatedAt: string;
  lines: TransferRequest[];
};

function getRemoteInventoryRowKey(row: RemoteInventoryRow) {
  return `${row.storeCode}::${row.productCode}`;
}
type StockCountUploadRow = {
  sessionId?: string | null;
  sheetNo?: string | null;
  productId: string;
  productCode: string;
  productName: string;
  systemQuantity: number;
  countedQuantity: number | null;
  varianceQuantity: number | null;
  batchCounts?: Array<{ batchId: string; countedQuantity: number }>;
};
type StockCountConfirmation =
  | { action: "COMMIT"; sessionIds: string[]; sessionNo: string }
  | { action: "SAVE_CALCULATED"; rowCount: number };

function stockCountSheetNo(sessionNo: string) {
  return sessionNo.replace(/-L\d{3}$/i, "");
}
type ExpenseConfirmation = {
  expenseId: string;
  expenseNo: string;
  amount: number;
  description: string;
};
type OnlineInventoryAlertRow = {
  productId: string;
  productCode: string;
  productName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  quantityOnHand: number;
  minStockLevel: number | null;
  reorderPoint: number | null;
  safetyStockLevel: number | null;
};
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
  requireExactQuantity?: boolean;
  onSubmit: (serialNumbers: string[]) => Promise<void>;
};
type BasketLine = {
  product: Product;
  quantity: number;
  sellingUnitOfMeasure: string;
  baseUnitOfMeasure: string;
  uomConversionFactor: number;
  baseQuantity: number;
  unitPrice: number;
  configuredDiscountRate: number | null;
  productVariantCode: string | null;
  productVariantLabel: string | null;
  variantSize: string | null;
  variantColor: string | null;
  lineNote: string | null;
  preferredBatchId: string | null;
};

const supplierReturnReasonOptions: SupplierReturnReason[] = [
  "DAMAGED",
  "REJECTED_AT_RECEIPT",
  "QUALITY_HOLD",
  "SHORT_EXPIRY",
  "WRONG_ITEM",
  "OTHER"
];
const onlineStoreServiceTypeOptions = [
  { value: "COMBO", label: "Combo" },
  { value: "BDC_ONLY", label: "BDC only" },
  { value: "OMC_ONLY", label: "OMC only" },
  { value: "OTHERS", label: "Others" }
];
type OpenPriceDraft = {
  product: Product;
  quantity: string;
  unitPrice: string;
  productVariantCode: string;
  sellingUnitOfMeasure: string;
  variantSize: string;
  variantColor: string;
  variantSearch: string;
  expressChargeSelected: boolean;
  expressChargeRate: string;
  lineNote: string;
  preferredBatchId: string;
};
type PaymentDraft = {
  id: string;
  tenderMethodCode: string;
  bankAccountId: string;
  amount: string;
  reference: string;
};
type CorrectionSelection = {
  transactionNo: string;
  correctionType: "RETURN" | "EXCHANGE";
};

const workspaceNav: Array<{
  id: WorkspaceId;
  label: string;
  detail: string;
  icon: "dashboard" | "pos" | "ecommerce" | "inventory" | "expenses" | "manager" | "reversals" | "reports" | "settings" | "fuel";
  requiresEcommerceConsoleAccess?: boolean;
  requiresFuelOperationsVisibility?: boolean;
}> = [
  { id: "dashboard", label: "Dashboard", detail: "Shop pulse, sales, stock", icon: "dashboard" },
  { id: "pos", label: "POS", detail: "Sales, orders, shifts", icon: "pos" },
  {
    id: "ecommerce",
    label: "Ecommerce",
    detail: "Orders, catalog, storefront",
    icon: "ecommerce",
    requiresEcommerceConsoleAccess: true
  },
  { id: "inventory", label: "Inventory", detail: "Request, receive, count", icon: "inventory" },
  { id: "expenses", label: "Expenses", detail: "Store expense capture", icon: "expenses" },
  {
    id: "fuel",
    label: "Fuel",
    detail: "Tanks, dips, readings",
    icon: "fuel",
    requiresFuelOperationsVisibility: true
  },
  { id: "manager", label: "Manager", detail: "EOD, banking, reports", icon: "manager" },
  { id: "reversals", label: "Reversals", detail: "Returns, exchanges", icon: "reversals" },
  { id: "reports", label: "Reports", detail: "Sales, stock, banking", icon: "reports" },
  { id: "settings", label: "Settings", detail: "HQ POS configuration", icon: "settings" }
];

const formatNumber = new Intl.NumberFormat("en-US");

function isServiceCatalogProduct(product: Pick<Product, "productType">) {
  return product.productType.trim().toUpperCase() === "SERVICE";
}

function isSellableCatalogProduct(
  product: Pick<Product, "productType" | "trackInventory" | "quantityOnHand">
) {
  return isServiceCatalogProduct(product) || product.trackInventory === false || product.quantityOnHand > 0;
}

function formatCatalogAvailability(
  product: Pick<Product, "productType" | "trackInventory" | "quantityOnHand">
) {
  if (isServiceCatalogProduct(product) || product.trackInventory === false) {
    return "Service";
  }

  return product.quantityOnHand > 0
    ? `Stock ${formatNumber.format(product.quantityOnHand)}`
    : "Out of stock";
}

function paymentDraftId() {
  return `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function basketLineKey(line: Pick<BasketLine, "product" | "productVariantCode" | "sellingUnitOfMeasure" | "variantSize" | "variantColor" | "lineNote" | "preferredBatchId">) {
  return [
    line.product.productId,
    line.productVariantCode ?? "",
    line.sellingUnitOfMeasure,
    line.variantSize ?? "",
    line.variantColor ?? "",
    line.lineNote ?? "",
    line.preferredBatchId ?? ""
  ].join(":");
}

function sellingUnitsForProduct(product: Product, productVariantCode?: string | null) {
  const selectedVariant = productVariantCode
    ? product.matrixVariants.find((variant) => variant.code === productVariantCode) ?? null
    : null;

  return product.sellingUnits.filter(
    (sellingUnit) =>
      sellingUnit.productVariantId === null ||
      sellingUnit.productVariantId === selectedVariant?.variantId
  );
}

function resolveProductSellingUnit(
  product: Product,
  productVariantCode?: string | null,
  selectedUnitOfMeasure?: string | null
) {
  const sellingUnits = sellingUnitsForProduct(product, productVariantCode);
  const normalizedSelected = selectedUnitOfMeasure?.trim().toUpperCase() ?? "";
  const selected =
    sellingUnits.find(
      (sellingUnit) => sellingUnit.unitOfMeasureCode.toUpperCase() === normalizedSelected
    ) ??
    sellingUnits.find((sellingUnit) => sellingUnit.isDefault) ??
    sellingUnits.find(
      (sellingUnit) =>
        sellingUnit.unitOfMeasureCode.toUpperCase() === product.baseUnitOfMeasure.toUpperCase()
    );
  const matrixVariant = productVariantCode
    ? product.matrixVariants.find((variant) => variant.code === productVariantCode) ?? null
    : null;

  return selected ?? {
    productVariantId: matrixVariant?.variantId ?? null,
    unitOfMeasureCode: product.baseUnitOfMeasure,
    unitOfMeasureName: product.baseUnitOfMeasure,
    conversionFactor: 1,
    unitPrice: matrixVariant?.unitPrice ?? product.price,
    barcode: null,
    isDefault: true,
    allowFractionalSale: false,
    decimalPrecision: 0
  };
}

function createPaymentDraft(tenderMethodCode: string, amount = "0.00"): PaymentDraft {
  return {
    id: paymentDraftId(),
    tenderMethodCode,
    bankAccountId: "",
    amount,
    reference: ""
  };
}

function isStoreCreditTender(tender: TenderMethod | null | undefined) {
  return tender?.paymentMethod === "STORE_CREDIT";
}

function parseAmount(value: string) {
  const amount = Number(value);

  return Number.isFinite(amount) ? amount : 0;
}

function formatMatrixVariantLabel(variant: Product["matrixVariants"][number]) {
  const attributes = variant.attributes.map((attribute) => attribute.valueLabel).join(" / ");

  return variant.displayName ?? (attributes || variant.code);
}

function getMatrixVariantSearchText(variant: Product["matrixVariants"][number]) {
  return [
    variant.code,
    variant.sku,
    variant.barcode,
    variant.displayName,
    ...variant.attributes.flatMap((attribute) => [attribute.attributeName, attribute.valueLabel])
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function filterMatrixVariants(
  variants: Product["matrixVariants"],
  query: string,
  selectedVariantCode: string | null
) {
  const normalizedQuery = query.trim().toUpperCase();
  const normalizedSelectedCode = selectedVariantCode?.trim().toUpperCase() ?? "";

  if (!normalizedQuery) {
    return variants;
  }

  return variants.filter(
    (variant) =>
      variant.code.toUpperCase() === normalizedSelectedCode ||
      getMatrixVariantSearchText(variant).includes(normalizedQuery)
  );
}

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: string | Date, timezone?: string | null) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timezone ? { timeZone: timezone } : {})
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function isWithinDateRange(value: string | null, from: string, to: string) {
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const start = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

  return timestamp >= start && timestamp <= end;
}

function isWithinWindow(value: string | null, days: string) {
  if (!value) {
    return false;
  }

  const dayCount = Math.max(1, Number(days) || 30);
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= dayCount * 24 * 60 * 60 * 1000;
}

function formatRelative(value: string | null) {
  if (!value) {
    return "unknown";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const units = [
    { label: "y", seconds: 365 * 24 * 60 * 60 },
    { label: "mo", seconds: 30 * 24 * 60 * 60 },
    { label: "d", seconds: 24 * 60 * 60 },
    { label: "h", seconds: 60 * 60 },
    { label: "m", seconds: 60 }
  ];
  const unit = units.find((candidate) => seconds >= candidate.seconds);

  return unit ? `${Math.floor(seconds / unit.seconds)}${unit.label} ago` : "just now";
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function parseStockCountCsv(text: string): Array<{ productCode: string; countedQuantity: number | null }> {
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
            : Number(countedQuantity)
      };
    })
    .filter((row) => row.productCode);
}

function normalizeFuelTransferLineKey(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isFuelTransferLine(line: Pick<TransferRequest, "productCode" | "productName">) {
  const values = [line.productCode, line.productName].map(normalizeFuelTransferLineKey);
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
    "KERO",
    "KEROSENE",
    "ATK",
    "JETFUEL"
  ]);

  if (values.some((value) => exactFuelCodes.has(value))) {
    return true;
  }

  return values.some((value) =>
    ["FUEL", "PETROL", "DIESEL", "GASOIL", "GASOLINE", "LPG"].some((keyword) =>
      value.includes(keyword)
    )
  );
}

function isFuelTransferDocument(transfer: Pick<TransferDocumentGroup, "workflowType" | "lines">) {
  return transfer.workflowType === "FUEL_TRANSFER" || transfer.lines.some(isFuelTransferLine);
}

function buildTransferDocumentGroups(transfers: TransferRequest[]): TransferDocumentGroup[] {
  const groups = new Map<string, TransferRequest[]>();

  for (const transfer of transfers) {
    const key = transfer.transferBatchNo ?? transfer.transferNo;
    groups.set(key, [...(groups.get(key) ?? []), transfer]);
  }

  return [...groups.entries()]
    .map(([key, lines]) => {
      const firstLine = lines[0];
      const requestedQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.requestedQuantity, 0));
      const issuedQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.issuedQuantity, 0));
      const receivedQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.receivedQuantity, 0));
      const outstandingIssueQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.outstandingIssueQuantity, 0));
      const outstandingReceiptQuantity = roundQuantity(lines.reduce((sum, line) => sum + line.outstandingReceiptQuantity, 0));

      return {
        key,
        documentNo: firstLine?.transferBatchNo ?? firstLine?.transferNo ?? key,
        statusLabel: lines.every((line) => line.status === lines[0]?.status) ? lines[0]?.status ?? "REQUESTED" : "MIXED",
        workflowType:
          firstLine?.workflowType ??
          (lines.some(isFuelTransferLine) ? "FUEL_TRANSFER" : null),
        sourceStoreCode: firstLine?.sourceStoreCode ?? "",
        sourceStoreName: firstLine?.sourceStoreName ?? "Source",
        destinationStoreCode: firstLine?.destinationStoreCode ?? "",
        destinationStoreName: firstLine?.destinationStoreName ?? "Destination",
        requestedQuantity,
        issuedQuantity,
        receivedQuantity,
        outstandingIssueQuantity,
        outstandingReceiptQuantity,
        externalReference: firstLine?.externalReference ?? null,
        transporterName: firstLine?.transporterName ?? null,
        vehicleRegistrationNo: firstLine?.vehicleRegistrationNo ?? null,
        driverName: firstLine?.driverName ?? null,
        driverContact: firstLine?.driverContact ?? null,
        deliveryNoteNo: firstLine?.deliveryNoteNo ?? null,
        feedbackStatus: firstLine?.feedbackStatus ?? "PENDING",
        waterTestResult: firstLine?.waterTestResult ?? null,
        quantityBeforeDelivery: firstLine?.quantityBeforeDelivery ?? null,
        expectedQuantityReceived:
          firstLine?.expectedQuantityReceived ??
          (issuedQuantity > 0 ? issuedQuantity : null),
        expectedStockQuantity: firstLine?.expectedStockQuantity ?? null,
        quantityAfterDelivery: firstLine?.quantityAfterDelivery ?? null,
        actualQuantityReceived: firstLine?.actualQuantityReceived ?? null,
        feedbackVarianceQuantity: firstLine?.feedbackVarianceQuantity ?? null,
        feedbackDipReading: firstLine?.feedbackDipReading ?? null,
        beforeDischargeEvidence: firstLine?.beforeDischargeEvidence ?? [],
        afterDischargeEvidence: firstLine?.afterDischargeEvidence ?? [],
        feedbackNote: firstLine?.feedbackNote ?? null,
        feedbackRecordedAt: firstLine?.feedbackRecordedAt ?? null,
        feedbackConfirmedAt: firstLine?.feedbackConfirmedAt ?? null,
        feedbackPostedAt: firstLine?.feedbackPostedAt ?? null,
        feedbackOperatorName: firstLine?.feedbackOperatorName ?? null,
        updatedAt: lines.map((line) => line.updatedAt).sort().at(-1) ?? firstLine?.requestedAt ?? "",
        lines
      };
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function getTransferDocumentRole(
  transfer: Pick<
    TransferDocumentGroup,
    "lines" | "issuedQuantity" | "receivedQuantity" | "outstandingIssueQuantity" | "outstandingReceiptQuantity"
  >,
  direction: TransferDirectionFilter
) {
  if (direction === "OUT") {
    return "SOURCE" as const;
  }

  if (direction === "IN") {
    return "DESTINATION" as const;
  }

  const hasSource = transfer.lines.some((line) => line.role === "SOURCE");
  const hasDestination = transfer.lines.some((line) => line.role === "DESTINATION");

  if (hasSource && !hasDestination) {
    return "SOURCE" as const;
  }

  if (hasDestination && !hasSource) {
    return "DESTINATION" as const;
  }

  return null;
}

function getTransferRoleStatusLabel(transfer: TransferDocumentGroup, direction: TransferDirectionFilter) {
  const role = getTransferDocumentRole(transfer, direction);

  if (role === "SOURCE") {
    if (transfer.issuedQuantity <= 0) {
      return "Requested";
    }

    return transfer.outstandingIssueQuantity > 0 ? "Part issued" : "Issued";
  }

  if (role === "DESTINATION") {
    if (transfer.receivedQuantity > 0) {
      return transfer.outstandingReceiptQuantity > 0 ? "Part received" : "Received";
    }

    return transfer.issuedQuantity > 0 ? "Ready to receive" : "Awaiting issue";
  }

  return formatEnumLabel(transfer.statusLabel);
}

function getTransferRoleOutstandingQuantity(transfer: TransferDocumentGroup, direction: TransferDirectionFilter) {
  const role = getTransferDocumentRole(transfer, direction);

  if (role === "SOURCE") {
    return transfer.outstandingIssueQuantity;
  }

  if (role === "DESTINATION") {
    return transfer.outstandingReceiptQuantity;
  }

  return transfer.outstandingIssueQuantity + transfer.outstandingReceiptQuantity;
}

function formatSupplierReturnReason(value: SupplierReturnReason | string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SidebarIcon({ name }: { name: (typeof workspaceNav)[number]["icon"] }) {
  const paths = {
    dashboard: (
      <>
        <path d="M4 4h6v7H4z" />
        <path d="M14 4h6v4h-6z" />
        <path d="M14 12h6v8h-6z" />
        <path d="M4 15h6v5H4z" />
      </>
    ),
    pos: (
      <>
        <path d="M4 5h16v10H4z" />
        <path d="M8 19h8" />
        <path d="M12 15v4" />
      </>
    ),
    inventory: (
      <>
        <path d="M21 16V8l-9-5-9 5v8l9 5z" />
        <path d="M3.3 7.5 12 12l8.7-4.5" />
        <path d="M12 22V12" />
      </>
    ),
    expenses: (
      <>
        <path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </>
    ),
    manager: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>
    ),
    reversals: (
      <>
        <path d="M7 7h9a5 5 0 1 1 0 10H8" />
        <path d="M7 7l3-3" />
        <path d="M7 7l3 3" />
      </>
    ),
    reports: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </>
    ),
    ecommerce: (
      <>
        <path d="M4 8h16l-1 12H5z" />
        <path d="M8 8a4 4 0 0 1 8 0" />
        <path d="M9 13h6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" />
      </>
    ),
    fuel: (
      <>
        <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0C6 9.5 12 3 12 3z" />
        <path d="M9 15a3 3 0 0 0 3 3" />
      </>
    )
  };

  return (
    <svg aria-hidden="true" className="rms-nav-icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function formatMoney(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: currencyCode
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function formatLineMoney(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function TrashIcon() {
  return <Trash2 aria-hidden="true" className="rms-trash-svg" />;
}

function roundMoney(amount: number) {
  return Number(amount.toFixed(2));
}

function roundQuantity(amount: number) {
  return Number(amount.toFixed(3));
}

function formatDiscountRate(rate: number) {
  return Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2);
}

function calculateBasketLineAmounts(line: BasketLine, discountAmount = 0) {
  const grossBeforeTax = roundMoney(line.quantity * line.unitPrice);
  const normalizedDiscount = roundMoney(Math.min(Math.max(0, discountAmount), grossBeforeTax));
  const taxableAmount = roundMoney(grossBeforeTax - normalizedDiscount);
  const rate = Math.max(0, line.product.taxRatePercent);
  const taxAmount = line.product.taxInclusive
    ? roundMoney(taxableAmount - taxableAmount / (1 + rate / 100))
    : roundMoney(taxableAmount * (rate / 100));

  return {
    discountAmount: normalizedDiscount,
    taxAmount,
    lineTotal: line.product.taxInclusive ? taxableAmount : roundMoney(taxableAmount + taxAmount)
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const friendlyColourNamesByHex: Record<string, string> = {
  "#000000": "Black",
  "#ffffff": "White",
  "#ff0000": "Red",
  "#008000": "Green",
  "#0000ff": "Blue",
  "#ffff00": "Yellow",
  "#ffa500": "Orange",
  "#800080": "Purple",
  "#ffc0cb": "Pink",
  "#a52a2a": "Brown",
  "#808080": "Grey",
  "#c0c0c0": "Silver",
  "#00ffff": "Cyan",
  "#ff00ff": "Magenta",
  "#111827": "Charcoal",
  "#1f2937": "Slate",
  "#6b7280": "Grey",
  "#78716c": "Stone",
  "#ef4444": "Red",
  "#f97316": "Orange",
  "#f59e0b": "Amber",
  "#eab308": "Yellow",
  "#22c55e": "Green",
  "#10b981": "Emerald",
  "#14b8a6": "Teal",
  "#06b6d4": "Cyan",
  "#3b82f6": "Blue",
  "#6366f1": "Indigo",
  "#8b5cf6": "Violet",
  "#a855f7": "Purple",
  "#ec4899": "Pink",
  "#f43f5e": "Rose"
};

function formatFriendlyColour(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const hex = normalized.toLowerCase();

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return friendlyColourNamesByHex[hex] ?? "Custom colour";
  }

  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

  const [lower, upper] = startNumber <= endNumber ? [startNumber, endNumber] : [endNumber, startNumber];
  const values: string[] = [];

  for (let value = lower; value <= upper && values.length < 500; value += 1) {
    values.push(`${prefix}${String(value).padStart(width, "0")}`);
  }

  return values;
}

function parseReceiptDetails(note: string | null | undefined) {
  const lines = (note ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const referenceLine = lines.find((line) => /^Reference:/i.test(line));
  const reference = referenceLine?.replace(/^Reference:\s*/i, "").trim() || null;
  const details = lines
    .filter((line) => line !== referenceLine)
    .join("\n")
    .trim();

  return {
    reference,
    details: details || null
  };
}

function escapeHtmlWithBreaks(value: string | null | undefined) {
  return escapeHtml(value ?? "").replace(/\r?\n/g, "<br />");
}

function splitReceiptAddressLines(
  addressLine1: string | null | undefined,
  addressLine2?: string | null | undefined
) {
  const explicitLine2 = addressLine2?.trim();
  const lines = (addressLine1 ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (explicitLine2) {
    return [lines[0] ?? "", explicitLine2].filter(Boolean);
  }

  return lines.slice(0, 2);
}

function renderReceiptStoreContactHtml(input: {
  addressLine1: string | null | undefined;
  addressLine2?: string | null | undefined;
  phone: string | null | undefined;
}) {
  const addressLines = splitReceiptAddressLines(input.addressLine1, input.addressLine2);
  const phone = input.phone?.trim();

  if (addressLines.length === 0 && !phone) {
    return "";
  }

  const locationIconHtml =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; margin-right:3px; vertical-align:-1px;"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
  const addressHtml = addressLines
    .map(
      (line) =>
        `<span style="display:block; text-align:center;">${locationIconHtml}<span>${escapeHtml(line)}</span></span>`
    )
    .join("");
  const phoneHtml = phone
    ? `<span style="display:block; margin-top:0.12rem; text-align:center;">${escapeHtml(phone)}</span>`
    : "";

  return `<span style="display:block; text-align:center; line-height:1.42;">${addressHtml}${phoneHtml}</span>`;
}

function getOnlineReceiptLogoStorageKey(storeCode: string | null | undefined) {
  return `flash-erp-online-store-receipt-logo:${storeCode?.trim() || "default"}`;
}

function readStoredOnlineReceiptLogoUrl(storeCode: string | null | undefined) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(getOnlineReceiptLogoStorageKey(storeCode));
  } catch {
    return null;
  }
}

function formatReceiptTitle(receipt: Receipt) {
  if (receipt.transactionType === "SALES_ORDER") {
    return "Sales Order";
  }

  if (receipt.transactionType === "RETURN") {
    return "Return Receipt";
  }

  if (receipt.transactionType === "EXCHANGE") {
    return "Exchange Receipt";
  }

  return "Sales Receipt";
}

function formatTransactionTypeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderReceiptTemplateLogo(companyLogoUrl: string | null | undefined, altLabel: string) {
  if (!companyLogoUrl?.trim()) {
    return "";
  }

  return `<div class="document-logo" style="margin-bottom:10px; text-align:center;">
    <img
      alt="${escapeHtml(altLabel)}"
      onerror="this.remove()"
      src="${escapeHtml(companyLogoUrl)}"
      style="display:inline-block; max-height:132px; max-width:280px; object-fit:contain;"
    />
  </div>`;
}

function renderReceiptTemplateValueRow(value: string | null | undefined) {
  if (!value?.trim()) {
    return "";
  }

  return `<tr>
    <td colspan="2" style="padding:0.22rem 0; text-align:right;">${escapeHtmlWithBreaks(value)}</td>
  </tr>`;
}

function renderReceiptTemplateDetailsBlock(value: string | null | undefined) {
  if (!value?.trim()) {
    return "";
  }

  return `<div style="margin-top:0.8rem; border-top:1px dashed #d6d3d1; padding-top:0.7rem; font-size:0.77rem; line-height:1.55; color:#44403c;">
    <div>${escapeHtmlWithBreaks(value)}</div>
  </div>`;
}

function shouldRenderReceiptAmount(amount: number) {
  return Math.abs(amount) >= 0.005;
}

function calculateReceiptSummarySubtotal(input: {
  totalAmount: number;
  discountAmount: number;
  taxAmount: number;
  loyaltyRedemptionAmount?: number;
}) {
  return roundMoney(
    input.totalAmount + input.discountAmount + (input.loyaltyRedemptionAmount ?? 0) - input.taxAmount
  );
}

function renderReceiptTemplateTaxRow(amount: number, currencyCode: string) {
  if (!shouldRenderReceiptAmount(amount)) {
    return "";
  }

  return `<tr>
      <td style="padding:0.12rem 0; font-size:0.74rem; text-transform:uppercase; color:#78716c;">Tax</td>
      <td style="padding:0.12rem 0; text-align:right;">${escapeHtml(formatMoney(amount, currencyCode))}</td>
    </tr>`;
}

function renderReceiptTemplateCommentsBlock(reference: string | null | undefined) {
  const comments = reference?.trim();

  if (!comments) {
    return "";
  }

  return `<div style="margin-top:0.5rem; text-align:center;">
    <div style="font-size:0.74rem; line-height:1.35; color:#44403c;">${escapeHtmlWithBreaks(comments)}</div>
  </div>`;
}

function renderReceiptTemplateItemTable(
  receipt: Receipt,
  lineMoney: (amount: number) => string
) {
  const rows = receipt.lines
    .map((line) => {
      const friendlyColour = formatFriendlyColour(line.variantColor);
      const variants = [
        `Unit ${line.sellingUnitOfMeasure}`,
        line.uomConversionFactor !== 1
          ? `Base ${formatNumber.format(line.baseQuantity)} ${line.baseUnitOfMeasure}`
          : null,
        line.variantSize ? `Size ${line.variantSize}` : null,
        friendlyColour ? `Colour ${friendlyColour}` : null,
        line.lineNote ? `Note ${line.lineNote}` : null,
        line.discountAmount > 0
          ? `${line.appliedPromotionName ?? "Discount"} -${lineMoney(line.discountAmount)}`
          : null
      ].filter((value): value is string => Boolean(value));

      return `<tr>
        <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4;">
          <div style="font-weight:600; color:#111827;">${escapeHtml(line.productName)}</div>
          <div style="font-size:0.69rem; color:#78716c;">${escapeHtml(["@ " + lineMoney(line.unitPrice), ...variants].join(" · "))}</div>
        </td>
        <td style="padding:0.28rem 0.2rem 0.24rem 0; border-top:1px dashed #e7e5e4; text-align:right; white-space:nowrap;">${formatNumber.format(line.quantity)} ${escapeHtml(line.sellingUnitOfMeasure)}</td>
        <td style="padding:0.28rem 0 0.24rem 0.42rem; border-top:1px dashed #e7e5e4; text-align:right; white-space:nowrap;">${escapeHtml(lineMoney(line.lineTotal))}</td>
      </tr>`;
    })
    .join("");

  return `<table style="margin-top:0.62rem; width:100%; table-layout:fixed; border-collapse:collapse;">
    <colgroup>
      <col style="width:56%;" />
      <col style="width:14%;" />
      <col style="width:30%;" />
    </colgroup>
    <thead>
      <tr>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Item</th>
        <th style="padding:0.24rem 0.2rem 0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Qty</th>
        <th style="padding:0.24rem 0 0.24rem 0.42rem; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderReceiptTemplatePaymentTable(receipt: Receipt, money: (amount: number) => string) {
  if (receipt.payments.length === 0) {
    return `<div style="margin-top:0.62rem; color:#78716c; font-size:0.74rem;">No tender lines were captured for this receipt.</div>`;
  }

  const rows = receipt.payments
    .map((payment) => `<tr>
      <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4;">
        <div style="font-weight:600; color:#111827;">${escapeHtml(payment.tenderMethodName ?? payment.method.replace(/_/g, " "))}</div>
        <div style="font-size:0.69rem; color:#78716c;">${escapeHtml(payment.reference ?? payment.method)}</div>
      </td>
      <td style="padding:0.28rem 0 0.24rem 0; border-top:1px dashed #e7e5e4; text-align:right;">${escapeHtml(money(payment.amount))}</td>
    </tr>`)
    .join("");

  return `<table style="margin-top:0.62rem; width:100%; border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:left; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Tender</th>
        <th style="padding:0.24rem 0; border-bottom:1px solid #d6d3d1; text-align:right; font-size:0.7rem; text-transform:uppercase; color:#78716c;">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildOnlineReceiptTemplateTokens(receipt: Receipt) {
  const receiptDetails = parseReceiptDetails(receipt.note);
  const transactionReference = receipt.reference ?? receiptDetails.reference;
  const additionalDetails = receipt.reference === undefined ? receiptDetails.details : receipt.note;
  const money = (amount: number) => formatMoney(amount, receipt.currencyCode);
  const summarySubtotal = calculateReceiptSummarySubtotal({
    totalAmount: receipt.totalAmount,
    discountAmount: receipt.discountAmount,
    taxAmount: receipt.taxAmount,
    loyaltyRedemptionAmount: receipt.loyaltyRedemptionAmount
  });
  const storeContact = renderReceiptStoreContactHtml({
    addressLine1: receipt.storeAddress,
    addressLine2: receipt.storeAddressLine2,
    phone: receipt.storePhone
  });

  return {
    RETAIL_ORG_NAME: "",
    COMPANY_LOGO_URL: receipt.companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderReceiptTemplateLogo(receipt.companyLogoUrl, `${receipt.storeName} logo`)
    ),
    STORE_NAME: receipt.storeName,
    STORE_CODE: receipt.storeCode,
    STORE_LOCATION: receipt.storeLocation,
    STORE_PHONE: receipt.storePhone,
    STORE_ADDRESS: receipt.storeAddress,
    STORE_ADDRESS_LINE_1: receipt.storeAddress,
    STORE_ADDRESS_LINE_2: receipt.storeAddressLine2,
    STORE_CONTACT: documentTemplateRawHtml(storeContact),
    TERMINAL_CODE: receipt.terminalCode,
    RECEIPT_TITLE: formatReceiptTitle(receipt),
    RECEIPT_NO: receipt.transactionNo,
    RECEIPT_DATE_TIME: formatDateTime(receipt.completedAt, receipt.timezone),
    TRANSACTION_TYPE: formatTransactionTypeLabel(receipt.transactionType),
    SOURCE_RECEIPT_NO: "",
    SHIFT_NO: receipt.shiftNo,
    CASHIER: receipt.cashierCode,
    CUSTOMER_NAME: receipt.customerName,
    CUSTOMER_NO: "",
    ITEM_TABLE: documentTemplateRawHtml(renderReceiptTemplateItemTable(receipt, formatLineMoney)),
    PAYMENT_TABLE: documentTemplateRawHtml(renderReceiptTemplatePaymentTable(receipt, money)),
    SUBTOTAL: money(summarySubtotal),
    PROMOTION_DISCOUNT: money(receipt.discountAmount),
    DISCOUNT: money(receipt.discountAmount),
    LOYALTY_POINTS_REDEEMED: receipt.loyaltyRedemptionPoints,
    LOYALTY_REDEMPTION_AMOUNT: money(receipt.loyaltyRedemptionAmount),
    TAX: shouldRenderReceiptAmount(receipt.taxAmount) ? money(receipt.taxAmount) : "",
    TAX_ROW: documentTemplateRawHtml(
      renderReceiptTemplateTaxRow(receipt.taxAmount, receipt.currencyCode)
    ),
    TOTAL: money(receipt.totalAmount),
    PAID: money(receipt.paidAmount),
    CHANGE: money(receipt.changeAmount),
    NOTES: additionalDetails,
    TRANSACTION_REFERENCE: transactionReference,
    TRANSACTION_REFERENCE_ROW: documentTemplateRawHtml(
      renderReceiptTemplateValueRow(transactionReference)
    ),
    TRANSACTION_REFERENCE_BLOCK: documentTemplateRawHtml(
      renderReceiptTemplateDetailsBlock(transactionReference)
    ),
    ADDITIONAL_DETAILS: additionalDetails,
    ADDITIONAL_DETAILS_BLOCK: documentTemplateRawHtml(
      renderReceiptTemplateDetailsBlock(additionalDetails)
    ),
    COMMENTS_BLOCK: documentTemplateRawHtml(
      renderReceiptTemplateCommentsBlock(additionalDetails)
    ),
    RECEIPT_HEADER: receipt.receiptHeader,
    RECEIPT_FOOTER: receipt.receiptFooter
  };
}

function renderOnlineReceiptTemplateBody(receipt: Receipt) {
  const templateHtml =
    receipt.salesReceiptTemplateHtml?.trim() || defaultThermalReceiptTemplateHtml;
  const logoHtml = /\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
    ? ""
    : renderReceiptTemplateLogo(receipt.companyLogoUrl, `${receipt.storeName} logo`);

  return `<div class="print-receipt-sheet">
    ${logoHtml}
    <div class="document-template-html document-template-html--receipt">
      ${renderDocumentTemplateHtml(templateHtml, buildOnlineReceiptTemplateTokens(receipt))}
    </div>
  </div>`;
}

function buildReceiptWindowHtml(receipt: Receipt) {
  const receiptBodyHtml = renderOnlineReceiptTemplateBody(receipt);

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(receipt.transactionNo)} • Flash ERP thermal receipt</title>
      <style>
        *{box-sizing:border-box} body{margin:0;background:#e8eef7;color:#0f172a;font-family:"Segoe UI",Inter,sans-serif}
        .receipt-window{min-height:100vh;padding:42px 24px}
        .receipt-toolbar{position:fixed;left:24px;right:24px;top:42px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:440px;border-radius:22px;background:white;padding:14px 18px;box-shadow:0 18px 40px rgba(15,23,42,.14)}
        .receipt-toolbar-copy{display:grid;gap:2px}.receipt-toolbar-copy strong{font-size:15px}.receipt-toolbar-copy span{color:#475569;font-size:12px}
        .receipt-toolbar-actions{display:flex;gap:10px}.receipt-toolbar button{min-height:44px;border:1px solid #cbd5e1;border-radius:999px;background:white;padding:0 18px;font-weight:800}
        .receipt-toolbar .is-primary{border-color:#0f766e;background:#0f766e;color:white}
        .print-receipt-sheet{width:286px;margin:90px auto 0;border-radius:22px;background:white;padding:10px 8px 12px;box-shadow:0 20px 45px rgba(15,23,42,.16)}
        .document-template-html{font-family:"Segoe UI",Inter,sans-serif;font-size:10.5px;line-height:1.3;color:#111827}
        @media print{.print-hidden{display:none!important}.receipt-window{padding:0;background:white}.print-receipt-sheet{box-shadow:none;margin:0;width:80mm;border-radius:0}@page{size:80mm auto;margin:0}}
      </style>
    </head>
    <body>
      <div class="receipt-window">
        <div class="receipt-toolbar print-hidden">
          <div class="receipt-toolbar-copy"><strong>${escapeHtml(receipt.transactionNo)}</strong><span>80mm thermal slip preview</span></div>
          <div class="receipt-toolbar-actions"><button onclick="window.close()">Close</button><button class="is-primary" onclick="window.print()">Print receipt</button></div>
        </div>
        ${receiptBodyHtml}
      </div>
    </body>
  </html>`;
}

function openReceiptWindow(receipt: Receipt) {
  const receiptWindow = window.open("", "_blank", "width=520,height=760");

  if (!receiptWindow) {
    return;
  }

  receiptWindow.document.open();
  receiptWindow.document.write(buildReceiptWindowHtml(receipt));
  receiptWindow.document.close();
}

function buildOnlineAccountPaymentTemplateTokens(receipt: AccountPaymentReceipt) {
  const storeContact = renderReceiptStoreContactHtml({
    addressLine1: receipt.storeAddress,
    addressLine2: receipt.storeAddressLine2,
    phone: receipt.storePhone
  });

  return {
    RETAIL_ORG_NAME: "",
    COMPANY_LOGO_URL: receipt.companyLogoUrl,
    COMPANY_LOGO_HTML: documentTemplateRawHtml(
      renderReceiptTemplateLogo(receipt.companyLogoUrl, `${receipt.storeName} logo`)
    ),
    STORE_NAME: receipt.storeName,
    STORE_CODE: receipt.storeCode,
    STORE_LOCATION: receipt.storeLocation,
    STORE_PHONE: receipt.storePhone,
    STORE_ADDRESS: receipt.storeAddress,
    STORE_ADDRESS_LINE_1: receipt.storeAddress,
    STORE_ADDRESS_LINE_2: receipt.storeAddressLine2,
    STORE_CONTACT: documentTemplateRawHtml(storeContact),
    TERMINAL_CODE: receipt.terminalCode,
    RECEIPT_TITLE: "Account Payment Receipt",
    RECEIPT_NO: receipt.entryNo,
    ENTRY_NO: receipt.entryNo,
    RECEIPT_DATE_TIME: formatDateTime(receipt.occurredAt, receipt.timezone),
    SHIFT_NO: receipt.shiftNo,
    CASHIER: receipt.cashierCode,
    CUSTOMER_NO: receipt.customerNo,
    CUSTOMER_NAME: receipt.customerName,
    PAYMENT_METHOD: receipt.tenderMethodName ?? receipt.paymentMethod,
    PAYMENT_REFERENCE: receipt.reference,
    AMOUNT: formatMoney(receipt.amount, receipt.currencyCode),
    TOTAL: formatMoney(receipt.amount, receipt.currencyCode),
    REMAINING_BALANCE:
      receipt.remainingBalanceAmount === null
        ? ""
        : formatMoney(receipt.remainingBalanceAmount, receipt.currencyCode),
    NOTES: receipt.note,
    RECEIPT_HEADER: receipt.receiptHeader,
    RECEIPT_FOOTER: receipt.receiptFooter
  };
}

function renderOnlineAccountPaymentTemplateBody(receipt: AccountPaymentReceipt) {
  const templateHtml =
    receipt.accountPaymentReceiptTemplateHtml?.trim() || defaultAccountPaymentReceiptTemplateHtml;
  const logoHtml = /\{COMPANY_LOGO_HTML\}/i.test(templateHtml)
    ? ""
    : renderReceiptTemplateLogo(receipt.companyLogoUrl, `${receipt.storeName} logo`);

  return `<div class="print-receipt-sheet">
    ${logoHtml}
    <div class="document-template-html document-template-html--receipt">
      ${renderDocumentTemplateHtml(templateHtml, buildOnlineAccountPaymentTemplateTokens(receipt))}
    </div>
  </div>`;
}

function buildAccountPaymentWindowHtml(receipt: AccountPaymentReceipt) {
  const receiptBodyHtml = renderOnlineAccountPaymentTemplateBody(receipt);

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(receipt.entryNo)} • Flash ERP account payment</title>
      <style>
        *{box-sizing:border-box} body{margin:0;background:#e8eef7;color:#0f172a;font-family:"Segoe UI",Inter,sans-serif}
        .receipt-window{min-height:100vh;padding:42px 24px}
        .receipt-toolbar{position:fixed;left:24px;right:24px;top:42px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:440px;border-radius:22px;background:white;padding:14px 18px;box-shadow:0 18px 40px rgba(15,23,42,.14)}
        .receipt-toolbar-copy{display:grid;gap:2px}.receipt-toolbar-copy strong{font-size:15px}.receipt-toolbar-copy span{color:#475569;font-size:12px}
        .receipt-toolbar-actions{display:flex;gap:10px}.receipt-toolbar button{min-height:44px;border:1px solid #cbd5e1;border-radius:999px;background:white;padding:0 18px;font-weight:800}
        .receipt-toolbar .is-primary{border-color:#0f766e;background:#0f766e;color:white}
        .print-receipt-sheet{width:286px;margin:90px auto 0;border-radius:22px;background:white;padding:10px 8px 12px;box-shadow:0 20px 45px rgba(15,23,42,.16)}
        .document-template-html{font-family:"Segoe UI",Inter,sans-serif;font-size:10.5px;line-height:1.3;color:#111827}
        @media print{.print-hidden{display:none!important}.receipt-window{padding:0;background:white}.print-receipt-sheet{box-shadow:none;margin:0;width:80mm;border-radius:0}@page{size:80mm auto;margin:0}}
      </style>
    </head>
    <body>
      <div class="receipt-window">
        <div class="receipt-toolbar print-hidden">
          <div class="receipt-toolbar-copy"><strong>${escapeHtml(receipt.entryNo)}</strong><span>Account payment receipt</span></div>
          <div class="receipt-toolbar-actions"><button onclick="window.close()">Close</button><button class="is-primary" onclick="window.print()">Print receipt</button></div>
        </div>
        ${receiptBodyHtml}
      </div>
    </body>
  </html>`;
}

function openAccountPaymentWindow(receipt: AccountPaymentReceipt) {
  const receiptWindow = window.open("", "_blank", "width=520,height=700");

  if (!receiptWindow) {
    return;
  }

  receiptWindow.document.open();
  receiptWindow.document.write(buildAccountPaymentWindowHtml(receipt));
  receiptWindow.document.close();
}

function buildShiftReportWindowHtml(input: {
  reportType: ShiftReportKind;
  workspace: OnlineStoreWorkspaceData;
  shift: OnlineShift;
  currencyCode: string;
  declaredCashAmount?: number | null;
  varianceAmount?: number | null;
}) {
  const money = (amount: number) => formatMoney(amount, input.currencyCode);
  const formatReportDate = (value: string | null | undefined) => {
    if (!value) {
      return "Open";
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(parsed);
  };
  const title = `${input.reportType} Report`;
  const subtitle = input.reportType === "Z" ? "Supervisor closeout report" : "Cashier in-shift report";
  const generatedAt = formatReportDate(new Date().toISOString());
  const declaredCashAmount = input.declaredCashAmount ?? input.shift.declaredCashAmount;
  const varianceAmount =
    input.varianceAmount ??
    input.shift.varianceAmount ??
    (declaredCashAmount === null || declaredCashAmount === undefined
      ? null
      : roundMoney(declaredCashAmount - input.shift.expectedCashAmount));
  const lineRows = [
    { label: "Shift", value: input.shift.shiftNo },
    { label: "Status", value: input.shift.status },
    { label: "Cashier", value: input.workspace.operator.loginId },
    { label: "Opened", value: formatReportDate(input.shift.openedAt) },
    { label: "Closed", value: formatReportDate(input.shift.closedAt) },
    { label: "Opening float", value: money(input.shift.openingFloatAmount) },
    { label: "Net sales", value: money(input.shift.netSalesAmount) },
    { label: "Cash tender", value: money(input.shift.cashTenderedAmount) },
    { label: "Non-cash tender", value: money(input.shift.nonCashTenderedAmount) },
    { label: "Expected cash", value: money(input.shift.expectedCashAmount) },
    {
      label: "Declared cash",
      value: declaredCashAmount === null || declaredCashAmount === undefined ? "Not declared" : money(declaredCashAmount)
    },
    {
      label: "Variance",
      value: varianceAmount === null || varianceAmount === undefined ? "Pending" : money(varianceAmount)
    },
    { label: "Transactions", value: String(input.shift.transactionCount) },
    { label: "Sales", value: String(input.shift.salesCount) },
    { label: "Returns", value: String(input.shift.returnCount) },
    { label: "Exchanges", value: String(input.shift.exchangeCount) }
  ]
    .map(
      (line) => `<div class="utility-line">
        <span>${escapeHtml(line.label)}</span>
        <strong>${escapeHtml(line.value)}</strong>
      </div>`
    )
    .join("");
  const storeName = input.workspace.store?.name ?? "Online store";
  const storeCode = input.workspace.store?.code ?? "online";
  const operatorLabel = `${input.workspace.operator.displayName} (${input.workspace.operator.loginId})`;

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
      <title>${escapeHtml(title)} • Flash ERP</title>
      <style>
        :root{color-scheme:light;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif}
        *{box-sizing:border-box}
        @page{size:80mm auto;margin:4mm}
        body{margin:0;background:#fff;color:#111827;font-family:inherit}
        .utility-sheet{width:72mm;margin:0 auto;padding:2mm 0 4mm}
        .utility-head{border-bottom:1px dashed #94a3b8;padding-bottom:3mm;text-align:center}
        .utility-head strong{display:block;font-size:16px;letter-spacing:.03em}
        .utility-head span,.utility-copy,.utility-foot{color:#475569;font-size:11px;line-height:1.45}
        .utility-title{margin-top:3mm;font-size:15px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .utility-subtitle{margin-top:1mm;font-size:11px}
        .utility-copy{display:grid;gap:1mm;margin-top:3mm}
        .utility-divider{border-top:1px dashed #94a3b8;margin:3mm 0}
        .utility-line{display:flex;align-items:baseline;justify-content:space-between;gap:3mm;padding:1mm 0;font-size:12px}
        .utility-line span{color:#475569}
        .utility-line strong{color:#0f172a;font-weight:800;text-align:right}
        .utility-foot{margin-top:4mm;border-top:1px dashed #94a3b8;padding-top:3mm;text-align:center}
        .utility-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;width:72mm;margin:0 auto 4mm;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;padding:8px 10px}
        .utility-toolbar strong,.utility-toolbar span{display:block}
        .utility-toolbar span{color:#64748b;font-size:11px}
        .utility-toolbar button{border:1px solid #0f766e;border-radius:8px;background:#0f766e;color:white;cursor:pointer;font:inherit;font-size:12px;font-weight:800;padding:8px 10px}
        @media print{.print-hidden{display:none!important}}
      </style>
    </head>
    <body>
      <div class="utility-toolbar print-hidden">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <button type="button" onclick="window.print()">Print ${escapeHtml(input.reportType)}</button>
      </div>
      <div class="utility-sheet">
        <div class="utility-head">
          <strong>Flash Retail</strong>
          <span>${escapeHtml(storeName)} (${escapeHtml(storeCode)})</span>
          <span>Terminal online-web</span>
        </div>
        <div class="utility-title">${escapeHtml(title)}</div>
        <div class="utility-subtitle">${escapeHtml(subtitle)}</div>
        <div class="utility-copy">
          <span>Operator: ${escapeHtml(operatorLabel)}</span>
          <span>Generated: ${escapeHtml(generatedAt)}</span>
        </div>
        <div class="utility-divider"></div>
        ${lineRows}
        <div class="utility-foot">Flash ERP ${escapeHtml(input.reportType)} report</div>
      </div>
    </body>
  </html>`;
}

function openShiftReportWindow(input: Parameters<typeof buildShiftReportWindowHtml>[0]) {
  const reportWindow = window.open("", "_blank", "width=480,height=760");

  if (!reportWindow) {
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(buildShiftReportWindowHtml(input));
  reportWindow.document.close();
}

function buildGoodsReceiptWindowHtml(input: {
  receipt: GoodsReceiptSummary;
  storeName: string;
  currencyCode: string;
}) {
  const { receipt, storeName, currencyCode } = input;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const totalCost = receipt.lines.reduce((sum, line) => sum + line.quantity * (line.unitCost ?? 0), 0);
  const rows = receipt.lines
    .map(
      (line) => `<tr>
        <td>${formatNumber.format(line.lineNo)}</td>
        <td><strong>${escapeHtml(line.productName)}</strong><br /><span>${escapeHtml(line.productCode)}</span></td>
        <td>${formatNumber.format(line.quantity)}</td>
        <td>${escapeHtml(line.unitCost === null ? "-" : money(line.unitCost))}</td>
        <td>${escapeHtml(line.serialNumbers.length ? line.serialNumbers.join(", ") : "None")}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(receipt.receiptNo)} • Goods receipt</title>
      <style>
        *{box-sizing:border-box} body{margin:0;background:#f5f7f5;color:#17211b;font-family:"Segoe UI",Arial,sans-serif}
        main{width:min(980px,calc(100vw - 48px));margin:24px auto;background:#fff;padding:28px;box-shadow:0 18px 42px rgba(20,30,24,.16)}
        header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #17211b;padding-bottom:18px}
        h1{margin:0;font-size:24px} h2{margin:4px 0 0;color:#5b6c60;font-size:13px;text-transform:uppercase}
        dl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}
        dt{color:#607067;font-size:11px;font-weight:800;text-transform:uppercase} dd{margin:3px 0 0;font-weight:800}
        table{width:100%;border-collapse:collapse} th{background:#245f84;color:#fff;padding:9px;text-align:left;font-size:12px;text-transform:uppercase}
        td{border-bottom:1px solid #e4ebe5;padding:10px 9px;vertical-align:top;font-size:13px} td span{color:#68786d;font-size:12px}
        .actions{margin-top:18px;text-align:right} button{border:0;border-radius:8px;background:#245f84;color:#fff;padding:10px 16px;font-weight:800}
        @media print{body{background:#fff} main{width:auto;margin:0;box-shadow:none}.actions{display:none}}
      </style>
    </head>
    <body>
      <main>
        <header>
          <div><h1>${escapeHtml(receipt.receiptNo)}</h1><h2>Goods receipt • ${escapeHtml(storeName)}</h2></div>
          <div><strong>${escapeHtml(receipt.operatorName ?? "Online operator")}</strong><br />${escapeHtml(new Date(receipt.receivedAt).toLocaleString())}</div>
        </header>
        <dl>
          <div><dt>Supplier</dt><dd>${escapeHtml(receipt.supplierName ?? "Not set")}</dd></div>
          <div><dt>PO</dt><dd>${escapeHtml(receipt.purchaseOrderNo ?? "Direct")}</dd></div>
          <div><dt>Received</dt><dd>${formatNumber.format(receipt.totalQuantity)}</dd></div>
          <div><dt>Value</dt><dd>${escapeHtml(money(totalCost))}</dd></div>
        </dl>
        <table>
          <thead><tr><th>Line</th><th>Item</th><th>Qty</th><th>Unit cost</th><th>Serials</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="actions"><button onclick="window.print()">Print GRN</button></div>
      </main>
    </body>
  </html>`;
}

function buildTransferDocumentWindowHtml(input: {
  transfer: TransferDocumentGroup;
  storeName: string;
  companyLogoUrl: string | null;
}) {
  const { transfer, storeName, companyLogoUrl } = input;
  const logoHtml = renderReceiptTemplateLogo(companyLogoUrl, `${storeName} logo`);
  const logisticsRows = [
    ["Waybill", transfer.deliveryNoteNo ?? transfer.documentNo],
    ["Vehicle", transfer.vehicleRegistrationNo ?? "Not captured"],
    ["Driver", transfer.driverName ?? "Not captured"],
    ["Driver contact", transfer.driverContact ?? "Not captured"],
    ["Transporter", transfer.transporterName ?? "Not captured"]
  ];
  const rows = transfer.lines
    .map(
      (line) => `<tr>
        <td><strong>${escapeHtml(line.productName)}</strong><br /><span>${escapeHtml(line.productCode)}</span></td>
        <td>${escapeHtml(line.sourceLocationName)}<br /><span>${escapeHtml(line.destinationLocationName)}</span></td>
        <td>${formatNumber.format(line.requestedQuantity)}</td>
        <td>${formatNumber.format(line.issuedQuantity)}</td>
        <td>${formatNumber.format(line.receivedQuantity)}</td>
        <td>${escapeHtml(line.status)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(transfer.documentNo)} • Waybill</title>
      <style>
        *{box-sizing:border-box} body{margin:0;background:#f5f7f5;color:#17211b;font-family:"Segoe UI",Arial,sans-serif}
        main{width:min(980px,calc(100vw - 48px));margin:24px auto;background:#fff;padding:28px;box-shadow:0 18px 42px rgba(20,30,24,.16)}
        header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #17211b;padding-bottom:18px}
        .brand{display:flex;align-items:flex-start;gap:14px}.brand .document-logo{margin:0!important;text-align:left!important}.brand .document-logo img{max-width:92px!important;max-height:64px!important}
        h1{margin:0;font-size:25px;text-transform:uppercase;letter-spacing:.05em} h2{margin:4px 0 0;color:#5b6c60;font-size:13px;text-transform:uppercase}
        dl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}
        dt{color:#607067;font-size:11px;font-weight:800;text-transform:uppercase} dd{margin:3px 0 0;font-weight:800}
        .logistics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px 0;padding:12px;border:1px solid #dbe6de;background:#f8fbf8}
        .logistics div{min-width:0}.logistics span{display:block;color:#607067;font-size:10px;font-weight:800;text-transform:uppercase}.logistics strong{display:block;margin-top:3px;font-size:12px}
        table{width:100%;border-collapse:collapse} th{background:#245f84;color:#fff;padding:9px;text-align:left;font-size:12px;text-transform:uppercase}
        td{border-bottom:1px solid #e4ebe5;padding:10px 9px;vertical-align:top;font-size:13px} td span{color:#68786d;font-size:12px}
        .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;margin-top:36px}.signatures div{border-top:1px solid #64756a;padding-top:8px;font-size:12px;color:#55645b}
        .actions{margin-top:18px;text-align:right} button{border:0;border-radius:8px;background:#245f84;color:#fff;padding:10px 16px;font-weight:800}
        @media print{body{background:#fff} main{width:auto;margin:0;box-shadow:none}.actions{display:none}}
      </style>
    </head>
    <body>
      <main>
        <header>
          <div class="brand">${logoHtml}<div><h1>Waybill</h1><h2>${escapeHtml(transfer.documentNo)} • ${escapeHtml(storeName)}</h2></div></div>
          <div><strong>${escapeHtml(transfer.statusLabel)}</strong><br />${escapeHtml(new Date(transfer.updatedAt).toLocaleString())}</div>
        </header>
        <dl>
          <div><dt>Source</dt><dd>${escapeHtml(transfer.sourceStoreName)}</dd></div>
          <div><dt>Destination</dt><dd>${escapeHtml(transfer.destinationStoreName)}</dd></div>
          <div><dt>Requested</dt><dd>${formatNumber.format(transfer.requestedQuantity)}</dd></div>
          <div><dt>Issued</dt><dd>${formatNumber.format(transfer.issuedQuantity)}</dd></div>
        </dl>
        <section class="logistics">
          ${logisticsRows
            .map(
              ([label, value]) =>
                `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
            )
            .join("")}
        </section>
        <table>
          <thead><tr><th>Item</th><th>From / To</th><th>Requested</th><th>Issued</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <section class="signatures"><div>Issued by</div><div>Driver</div><div>Received by</div></section>
        <div class="actions"><button onclick="window.print()">Print waybill</button></div>
      </main>
    </body>
  </html>`;
}

function StatusPill({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning";
}) {
  return <span className={`rms-pill ${tone === "good" ? "is-good" : tone === "warning" ? "is-warning" : ""}`}>{children}</span>;
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rms-empty">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

type OnlinePosSettingsTab = "sizes" | "discounts" | "express-charges" | "layaway" | "options";

const onlinePosSettingsTabs: Array<{ id: OnlinePosSettingsTab; label: string }> = [
  { id: "sizes", label: "Product sizes" },
  { id: "discounts", label: "POS discounts" },
  { id: "express-charges", label: "Express charges" },
  { id: "layaway", label: "Layaway" },
  { id: "options", label: "Options" }
];

function formatToggleSetting(value: boolean) {
  return value ? "Enabled" : "Disabled";
}

function SettingsTokenList({
  values,
  emptyTitle,
  emptyDetail,
  formatValue
}: {
  values: Array<number | string>;
  emptyTitle: string;
  emptyDetail?: string;
  formatValue: (value: number | string) => string;
}) {
  if (!values.length) {
    return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  }

  return (
    <div className="rms-settings-token-list">
      {values.map((value) => (
        <span className="rms-settings-token" key={String(value)}>
          {formatValue(value)}
        </span>
      ))}
    </div>
  );
}

function ReadonlySettingRow({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warning";
}) {
  return (
    <div className="rms-list-row rms-settings-row">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <StatusPill tone={tone}>{value}</StatusPill>
    </div>
  );
}

function OnlineStorePosSettingsWorkspace({
  workspace,
  currencyCode
}: {
  workspace: OnlineStoreWorkspaceData;
  currencyCode: string;
}) {
  const [activeTab, setActiveTab] = useState<OnlinePosSettingsTab>("sizes");
  const settings = workspace.optionSettings;
  const expressRates = settings.posExpressChargeRates ?? [];
  const discountRates = settings.posDiscountRates ?? [];
  const productSizes = settings.productSizes ?? [];
  const layawayRows = [
    {
      label: "Layaway",
      value: formatToggleSetting(settings.layawaySettings.enabled),
      tone: settings.layawaySettings.enabled ? "good" : "neutral"
    },
    {
      label: "Reserve stock on deposit",
      value: formatToggleSetting(settings.layawaySettings.reserveStockOnDeposit),
      tone: settings.layawaySettings.reserveStockOnDeposit ? "good" : "warning"
    },
    {
      label: "Minimum deposit",
      value: `${formatNumber.format(settings.layawaySettings.minimumDepositPercent)}%`,
      tone: "neutral"
    },
    {
      label: "Full payment before fulfilment",
      value: formatToggleSetting(settings.layawaySettings.requireFullPaymentBeforeFulfilment),
      tone: settings.layawaySettings.requireFullPaymentBeforeFulfilment ? "good" : "warning"
    },
    {
      label: "Refund payments on cancellation",
      value: formatToggleSetting(settings.layawaySettings.refundPaymentsOnCancellation),
      tone: settings.layawaySettings.refundPaymentsOnCancellation ? "good" : "neutral"
    },
    {
      label: "Cancellation fee",
      value:
        settings.layawaySettings.cancellationFeeType === "PERCENTAGE"
          ? `${formatNumber.format(settings.layawaySettings.cancellationFeeValue)}%`
          : formatMoney(settings.layawaySettings.cancellationFeeValue, currencyCode),
      tone: "neutral"
    }
  ];
  const optionRows = [
    {
      label: "Allow negative inventory",
      value: formatToggleSetting(settings.allowNegativeInventory),
      tone: settings.allowNegativeInventory ? "warning" : "good"
    },
    {
      label: "Allow offline sales",
      value: formatToggleSetting(settings.allowOfflineSales),
      tone: settings.allowOfflineSales ? "good" : "warning"
    },
    {
      label: "Auto-print receipts",
      value: formatToggleSetting(settings.autoPrintReceipts),
      tone: settings.autoPrintReceipts ? "good" : "neutral"
    },
    {
      label: "Enforce serialized scan",
      value: formatToggleSetting(settings.enforceSerializedScanAtPos),
      tone: settings.enforceSerializedScanAtPos ? "good" : "warning"
    },
    {
      label: "Require customer for credit sales",
      value: formatToggleSetting(settings.requireCustomerForCreditSales),
      tone: settings.requireCustomerForCreditSales ? "good" : "warning"
    },
    {
      label: "Require supervisor for receipt-less return",
      value: formatToggleSetting(settings.requireSupervisorForReceiptlessReturn),
      tone: settings.requireSupervisorForReceiptlessReturn ? "good" : "warning"
    },
    {
      label: "Show critical stocks on startup",
      value: formatToggleSetting(settings.showCriticalStocksOnStartup),
      tone: settings.showCriticalStocksOnStartup ? "good" : "neutral"
    },
    {
      label: "Show expiring batches on startup",
      value: formatToggleSetting(settings.showExpiringBatchesOnStartup),
      tone: settings.showExpiringBatchesOnStartup ? "good" : "neutral"
    },
    {
      label: "Expiry alert lead days",
      value: `${formatNumber.format(settings.expiryAlertLeadDays)} day(s)`,
      tone: "neutral"
    },
    {
      label: "Critical expiry days",
      value: `${formatNumber.format(settings.expiryCriticalDays)} day(s)`,
      tone: "neutral"
    },
    {
      label: "Default receipt search days",
      value: `${formatNumber.format(settings.defaultReceiptSearchDays)} day(s)`,
      tone: "neutral"
    },
    {
      label: "Shift float prompt amount",
      value: formatMoney(settings.shiftFloatPromptAmount, currencyCode),
      tone: "neutral"
    }
  ];

  return (
    <div className="rms-workspace rms-tabbed-workspace rms-settings-workspace">
      <div className="rms-workspace-tabs" role="tablist" aria-label="HQ POS settings">
        {onlinePosSettingsTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section className="rms-panel rms-tab-panel">
        <div className="rms-panel-title">
          <div>
            <span>{workspace.store?.name ?? "Online store"}</span>
            <h2>{onlinePosSettingsTabs.find((tab) => tab.id === activeTab)?.label ?? "Settings"}</h2>
          </div>
          <div className="rms-settings-title-pills">
            <StatusPill tone={expressRates.length ? "good" : "warning"}>
              {expressRates.length ? `${expressRates.length} express rate(s)` : "No express rates"}
            </StatusPill>
            <StatusPill>{`Loaded ${formatRelative(workspace.refreshedAt)}`}</StatusPill>
          </div>
        </div>

        {activeTab === "sizes" ? (
          <SettingsTokenList
            emptyTitle="No product sizes configured"
            values={productSizes}
            formatValue={(value) => String(value)}
          />
        ) : null}

        {activeTab === "discounts" ? (
          <SettingsTokenList
            emptyTitle="No POS discount rates configured"
            values={discountRates}
            formatValue={(value) => `${formatDiscountRate(Number(value))}%`}
          />
        ) : null}

        {activeTab === "express-charges" ? (
          <SettingsTokenList
            emptyTitle="No express charge rates configured"
            emptyDetail="The POS express checkbox stays disabled until this list has at least one HQ rate."
            values={expressRates}
            formatValue={(value) => `${formatDiscountRate(Number(value))}%`}
          />
        ) : null}

        {activeTab === "options" ? (
          <div className="rms-list rms-settings-list">
            {optionRows.map((row) => (
              <ReadonlySettingRow
                key={row.label}
                label={row.label}
                tone={row.tone as "neutral" | "good" | "warning"}
                value={row.value}
              />
            ))}
          </div>
        ) : null}

        {activeTab === "layaway" ? (
          <div className="rms-list rms-settings-list">
            {layawayRows.map((row) => (
              <ReadonlySettingRow
                key={row.label}
                label={row.label}
                tone={row.tone as "neutral" | "good" | "warning"}
                value={row.value}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DocumentStat({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warning";
}) {
  return (
    <div className={`rms-stat ${tone === "good" ? "is-good" : tone === "warning" ? "is-warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function ActionIconButton({
  label,
  tone = "view",
  disabled,
  onClick,
  children
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

function MoneyTile({
  label,
  value,
  detail,
  tone = "blue"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "amber" | "slate" | "red";
}) {
  return (
    <article className={`rms-dashboard-kpi is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function getOnlineCriticalStockFloor(row: OnlineInventoryAlertRow) {
  return (
    [row.minStockLevel, row.reorderPoint, row.safetyStockLevel].find(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0
    ) ?? null
  );
}

function OnlineInventoryStartupAlertsDialog({
  expiryAlertLeadDays,
  expiryCriticalDays,
  expiringRows,
  lowStockRows,
  onClose,
  openInventory
}: {
  expiryAlertLeadDays: number;
  expiryCriticalDays: number;
  expiringRows: OnlineStoreWorkspaceData["inventoryBatches"];
  lowStockRows: OnlineInventoryAlertRow[];
  onClose: () => void;
  openInventory: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"expiring" | "low-stock">(
    expiringRows.length ? "expiring" : "low-stock"
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const visibleCount = activeTab === "expiring" ? expiringRows.length : lowStockRows.length;
  const activeLabel = activeTab === "expiring" ? "Expiring batches" : "Low stock";

  async function exportActiveAlerts() {
    if (!visibleCount || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const headerStyle = {
        backgroundColor: "#245F84",
        fontWeight: "bold" as const,
        textColor: "#FFFFFF",
        height: 24
      };
      const sheetData: SheetData =
        activeTab === "expiring"
          ? [
              [
                { value: "Product code", ...headerStyle },
                { value: "Product", ...headerStyle },
                { value: "Location code", ...headerStyle },
                { value: "Location", ...headerStyle },
                { value: "Batch number", ...headerStyle },
                { value: "Expiry date", ...headerStyle },
                { value: "Days remaining", ...headerStyle },
                { value: "Quantity", ...headerStyle }
              ],
              ...expiringRows.map((row) => [
                row.productCode,
                row.productName,
                row.locationCode,
                row.locationName,
                row.batchNo,
                row.expiryDate.slice(0, 10),
                row.daysUntilExpiry,
                row.quantityOnHand
              ])
            ]
          : [
              [
                { value: "Product code", ...headerStyle },
                { value: "Product", ...headerStyle },
                { value: "Location code", ...headerStyle },
                { value: "Location", ...headerStyle },
                { value: "On hand", ...headerStyle },
                { value: "Minimum stock", ...headerStyle },
                { value: "Reorder point", ...headerStyle },
                { value: "Safety stock", ...headerStyle },
                { value: "Alert floor", ...headerStyle },
                { value: "Shortage", ...headerStyle }
              ],
              ...lowStockRows.map((row) => {
                const alertFloor = getOnlineCriticalStockFloor(row) ?? 0;

                return [
                  row.productCode,
                  row.productName,
                  row.locationCode,
                  row.locationName,
                  row.quantityOnHand,
                  row.minStockLevel ?? 0,
                  row.reorderPoint ?? 0,
                  row.safetyStockLevel ?? 0,
                  alertFloor,
                  Math.max(0, alertFloor - row.quantityOnHand)
                ];
              })
            ];
      const fileSlug = activeTab === "expiring" ? "expiring-batches" : "low-stock";
      const sheetName = activeTab === "expiring" ? "Expiring batches" : "Low stock";
      const columns =
        activeTab === "expiring"
          ? [14, 34, 14, 24, 18, 16, 16, 14]
          : [14, 34, 14, 24, 14, 16, 16, 16, 14, 14];

      await writeExcelFile(sheetData, {
        columns: columns.map((width) => ({ width })),
        sheet: sheetName,
        stickyRowsCount: 1
      }).toFile(`flash-erp-${fileSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "The Excel workbook could not be generated."
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="rms-modal-backdrop rms-inventory-alert-backdrop" role="dialog" aria-modal="true">
      <section className="rms-dialog rms-wide-dialog rms-online-inventory-alert-dialog">
        <div className="rms-panel-title">
          <div>
            <span>Inventory startup alert</span>
            <h2>Stock attention required</h2>
          </div>
          <StatusPill tone="warning">{`${formatNumber.format(visibleCount)} item(s)`}</StatusPill>
        </div>
        <div className="rms-inventory-alert-body">
          <div aria-label="Inventory alerts" className="rms-inventory-alert-tabs" role="tablist">
            <button
              aria-selected={activeTab === "expiring"}
              className={activeTab === "expiring" ? "is-active" : ""}
              onClick={() => {
                setActiveTab("expiring");
                setExportError(null);
              }}
              role="tab"
              type="button"
            >
              Expiring batches ({formatNumber.format(expiringRows.length)})
            </button>
            <button
              aria-selected={activeTab === "low-stock"}
              className={activeTab === "low-stock" ? "is-active" : ""}
              onClick={() => {
                setActiveTab("low-stock");
                setExportError(null);
              }}
              role="tab"
              type="button"
            >
              Low stock ({formatNumber.format(lowStockRows.length)})
            </button>
          </div>
          <div className="rms-inventory-alert-toolbar">
            <div>
              <strong>{activeLabel}</strong>
              <span>{`${formatNumber.format(visibleCount)} row(s) requiring attention`}</span>
            </div>
            <button
              className="rms-button rms-inventory-alert-export"
              disabled={!visibleCount || isExporting}
              onClick={() => void exportActiveAlerts()}
              type="button"
            >
              <FileSpreadsheet aria-hidden="true" />
              {isExporting ? "Exporting..." : "Export Excel"}
            </button>
          </div>
          {exportError ? <div className="rms-inventory-alert-export-error" role="alert">{exportError}</div> : null}
          <div className="rms-inventory-alert-grid">
            {activeTab === "expiring" ? (
              expiringRows.length ? (
                <table aria-label="Expiring batches">
                  <thead><tr><th>Product</th><th>Location</th><th>Batch</th><th>Expiry date</th><th>Days remaining</th><th className="is-numeric">Quantity</th></tr></thead>
                  <tbody>
                    {expiringRows.map((row) => (
                      <tr key={row.batchId}>
                        <td><strong>{row.productName}</strong><small>{row.productCode}</small></td>
                        <td><strong>{row.locationName}</strong><small>{row.locationCode}</small></td>
                        <td>{row.batchNo}</td>
                        <td>{new Date(row.expiryDate).toLocaleDateString("en-GB")}</td>
                        <td><span className={`rms-inventory-alert-status${row.daysUntilExpiry <= expiryCriticalDays ? " is-critical" : ""}`}>{row.daysUntilExpiry === 0 ? "Expires today" : `${formatNumber.format(row.daysUntilExpiry)} day(s)`}</span></td>
                        <td className="is-numeric">{formatNumber.format(row.quantityOnHand)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <EmptyState title="No batches expiring soon" detail={`No active stock batch expires within the next ${formatNumber.format(expiryAlertLeadDays)} days.`} />
            ) : lowStockRows.length ? (
              <table aria-label="Low stock">
                <thead><tr><th>Product</th><th>Location</th><th className="is-numeric">On hand</th><th className="is-numeric">Alert floor</th><th className="is-numeric">Shortage</th><th>Status</th></tr></thead>
                <tbody>
                  {lowStockRows.map((row) => {
                    const alertFloor = getOnlineCriticalStockFloor(row) ?? 0;

                    return (
                      <tr key={`${row.locationId}-${row.productId}`}>
                        <td><strong>{row.productName}</strong><small>{row.productCode}</small></td>
                        <td><strong>{row.locationName}</strong><small>{row.locationCode}</small></td>
                        <td className="is-numeric">{formatNumber.format(row.quantityOnHand)}</td>
                        <td className="is-numeric">{formatNumber.format(alertFloor)}</td>
                        <td className="is-numeric">{formatNumber.format(Math.max(0, alertFloor - row.quantityOnHand))}</td>
                        <td><span className="rms-inventory-alert-status is-critical">{row.quantityOnHand <= 0 ? "Out of stock" : "Low stock"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <EmptyState title="No low-stock items" detail="All configured stock thresholds are currently satisfied." />}
          </div>
        </div>
        <div className="rms-dialog-actions">
          <button className="rms-button" onClick={onClose} type="button">Dismiss</button>
          <button className="rms-button is-primary" onClick={openInventory} type="button">Open inventory</button>
        </div>
      </section>
    </div>
  );
}

export function OnlineStoreWorkspace({
  workspace,
  initialWorkspace = "dashboard"
}: {
  workspace: OnlineStoreWorkspaceData;
  initialWorkspace?: "dashboard" | "ecommerce";
}) {
  const router = useRouter();
  const currencyCode = workspace.store?.currencyCode ?? "GHS";
  const activeDate = formatDateInput(new Date());
  const nonCreditTenderMethods = useMemo(
    () => workspace.tenderMethods.filter((tender) => !isStoreCreditTender(tender)),
    [workspace.tenderMethods]
  );
  const defaultTenderCode = nonCreditTenderMethods[0]?.tenderMethodCode ?? workspace.tenderMethods[0]?.tenderMethodCode ?? "";
  const defaultSalesLocationId =
    workspace.inventoryLocations.find((location) => location.useForSalesDefault)?.locationId ??
    workspace.inventoryLocations[0]?.locationId ??
    "";
  const defaultReceivingLocationId =
    workspace.inventoryLocations.find((location) => location.useForReceivingDefault)?.locationId ??
    defaultSalesLocationId;
  const configuredShiftOpeningFloat = (workspace.optionSettings?.shiftFloatPromptAmount ?? 0).toFixed(2);
  const initialReportCriteria = workspace.reporting.lastCriteria;
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(() =>
    initialWorkspace === "ecommerce" && workspace.capabilities.canAccessEcommerceConsole
      ? "ecommerce"
      : "dashboard"
  );
  const [ecommerceWorkspace, setEcommerceWorkspace] =
    useState<OnlineStoreEcommerceWorkspaceData | null>(null);
  const [ecommerceLoadError, setEcommerceLoadError] = useState("");
  const [isLoadingEcommerce, setIsLoadingEcommerce] = useState(false);
  const [ecommerceLoadAttempt, setEcommerceLoadAttempt] = useState(0);
  const [managerTab, setManagerTab] = useState<ManagerTab>("shift");
  const [activeReport, setActiveReport] = useState<ReportId>("sales");
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>("stock");
  const [activeStockSection, setActiveStockSection] = useState<InventoryStockSection>("inventory-browser");
  const [activeReceivingSection, setActiveReceivingSection] = useState<InventoryReceivingSection>("purchase-orders");
  const [inventoryStartupAlertOpen, setInventoryStartupAlertOpen] = useState(false);
  const inventoryStartupAlertCheckedRef = useRef(false);
  const [dashboardDateFrom, setDashboardDateFrom] = useState(activeDate);
  const [dashboardDateTo, setDashboardDateTo] = useState(activeDate);
  const [reportDateFrom, setReportDateFrom] = useState(initialReportCriteria.dateFrom ?? activeDate);
  const [reportDateTo, setReportDateTo] = useState(initialReportCriteria.dateTo ?? activeDate);
  const [reportScope, setReportScope] = useState<"CASHIER" | "STORE">(initialReportCriteria.scope ?? "CASHIER");
  const [reportCashierCode, setReportCashierCode] = useState(initialReportCriteria.cashierCode ?? "");
  const [reportShiftId, setReportShiftId] = useState(initialReportCriteria.shiftId ?? "");
  const [reportQuery, setReportQuery] = useState(initialReportCriteria.searchQuery ?? "");
  const [reportCustomerQuery, setReportCustomerQuery] = useState(initialReportCriteria.customerQuery ?? "");
  const [reportProductQuery, setReportProductQuery] = useState(initialReportCriteria.productQuery ?? "");
  const [reportTenderMethodCode, setReportTenderMethodCode] = useState(initialReportCriteria.tenderMethodCode ?? "");
  const [reportLocationId, setReportLocationId] = useState(initialReportCriteria.locationId ?? "");
  const [reportLimit, setReportLimit] = useState(String(initialReportCriteria.limit ?? 100));
  const [reportResult, setReportResult] = useState<BrowseOnlineStoreReportsResponse | null>(null);
  const [reportMessage, setReportMessage] = useState("");
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [managerOverrideCode, setManagerOverrideCode] = useState("");
  const [managerOverridePassword, setManagerOverridePassword] = useState("");
  const [managerOverrideNote, setManagerOverrideNote] = useState("");
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [lockLoginId, setLockLoginId] = useState(workspace.operator.loginId);
  const [lockPassword, setLockPassword] = useState("");
  const [lockMessage, setLockMessage] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date(workspace.refreshedAt));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogDepartment, setCatalogDepartment] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [scanQuantity, setScanQuantity] = useState("1");
  const [openPriceDraft, setOpenPriceDraft] = useState<OpenPriceDraft | null>(null);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [paymentDrafts, setPaymentDrafts] = useState<PaymentDraft[]>(() => [
    createPaymentDraft(defaultTenderCode, "0.00")
  ]);
  const [customers, setCustomers] = useState<Customer[]>(workspace.customers);
  const [heldSales, setHeldSales] = useState<HeldSale[]>(workspace.heldSales);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(workspace.salesOrders);
  const [accountPayments, setAccountPayments] = useState<AccountPayment[]>(workspace.accountPayments);
  const [saleMode, setSaleMode] = useState<SaleMode>("SALE");
  const [layawayExpiresAt, setLayawayExpiresAt] = useState("");
  const [layawayPolicyOverrideApproved, setLayawayPolicyOverrideApproved] = useState(false);
  const [layawayActionDraft, setLayawayActionDraft] = useState<LayawayActionDraft | null>(null);
  const [layawayActionPayments, setLayawayActionPayments] = useState<PaymentDraft[]>([]);
  const [layawayActionReason, setLayawayActionReason] = useState("");
  const [expandedLayawayOrderId, setExpandedLayawayOrderId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [activeDrawer, setActiveDrawer] = useState<PosDrawer>(null);
  const [heldSaleQuery, setHeldSaleQuery] = useState("");
  const [heldSaleWindowDays, setHeldSaleWindowDays] = useState("30");
  const [salesOrderQuery, setSalesOrderQuery] = useState("");
  const [salesOrderWindowDays, setSalesOrderWindowDays] = useState("30");
  const [selectedFulfilmentSalesOrderIds, setSelectedFulfilmentSalesOrderIds] = useState<string[]>([]);
  const [salesOrderTransferNote, setSalesOrderTransferNote] = useState("");
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptWindowDays, setReceiptWindowDays] = useState("30");
  const [receiptHistoryKind, setReceiptHistoryKind] = useState<ReceiptHistoryKind>("SALES");
  const [sourceTransactionId, setSourceTransactionId] = useState<string | null>(null);
  const [fulfillingSalesOrderId, setFulfillingSalesOrderId] = useState<string | null>(null);
  const [transactionReference, setTransactionReference] = useState("");
  const [transactionServiceType, setTransactionServiceType] = useState("COMBO");
  const [transactionNote, setTransactionNote] = useState("");
  const [transactionReferenceMatches, setTransactionReferenceMatches] = useState<
    OnlineStoreTransactionReferenceSummary[]
  >([]);
  const [transactionReferenceSearchDismissed, setTransactionReferenceSearchDismissed] =
    useState(false);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState("0");
  const [isPostingPosAction, setIsPostingPosAction] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const [localReceiptLogoUrl, setLocalReceiptLogoUrl] = useState<string | null>(() =>
    readStoredOnlineReceiptLogoUrl(workspace.store?.code)
  );
  const [receiptLogoMessage, setReceiptLogoMessage] = useState("");
  const [accountPaymentCustomerId, setAccountPaymentCustomerId] = useState(
    workspace.customers.find((customer) => customer.receivableBalanceAmount > 0)?.customerId ?? ""
  );
  const [accountPaymentTenderCode, setAccountPaymentTenderCode] = useState(defaultTenderCode);
  const [accountPaymentBankAccountId, setAccountPaymentBankAccountId] = useState("");
  const [accountPaymentAmount, setAccountPaymentAmount] = useState("");
  const [accountPaymentReference, setAccountPaymentReference] = useState("");
  const [accountPaymentNote, setAccountPaymentNote] = useState("");
  const [accountPaymentMessage, setAccountPaymentMessage] = useState("");
  const [isPostingAccountPayment, setIsPostingAccountPayment] = useState(false);
  const [accountCustomerQuery, setAccountCustomerQuery] = useState("");
  const [correctionSelection, setCorrectionSelection] = useState<CorrectionSelection | null>(null);
  const [correctionQuery, setCorrectionQuery] = useState("");
  const [correctionWindowDays, setCorrectionWindowDays] = useState("30");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [exchangeProductId, setExchangeProductId] = useState("");
  const [exchangeQuantity, setExchangeQuantity] = useState("1");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionPayments, setCorrectionPayments] = useState<PaymentDraft[]>(() => [
    createPaymentDraft(defaultTenderCode, "0.00")
  ]);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [isPostingCorrection, setIsPostingCorrection] = useState(false);
  const [selectedEodShiftId, setSelectedEodShiftId] = useState(workspace.shift?.shiftId ?? workspace.reports.shiftRows[0]?.shiftId ?? "");
  const [eodDeclaredCash, setEodDeclaredCash] = useState("0");
  const [eodNote, setEodNote] = useState("");
  const [bankingReconciliationId, setBankingReconciliationId] = useState(workspace.eodReconciliations[0]?.reconciliationId ?? "");
  const [bankingAmount, setBankingAmount] = useState((workspace.eodReconciliations[0]?.remainingCashAmount ?? 0).toFixed(2));
  const [bankingBankAccountId, setBankingBankAccountId] = useState(workspace.bankAccounts[0]?.bankAccountId ?? "");
  const [bankingBankName, setBankingBankName] = useState("");
  const [bankingReference, setBankingReference] = useState("");
  const [managerMessage, setManagerMessage] = useState("");
  const [isManagerPosting, setIsManagerPosting] = useState(false);
  const [activeShift, setActiveShift] = useState(workspace.shift);
  const [shiftOpeningFloat, setShiftOpeningFloat] = useState((workspace.shift?.openingFloatAmount ?? workspace.optionSettings?.shiftFloatPromptAmount ?? 0).toFixed(2));
  const [hasEditedShiftOpeningFloat, setHasEditedShiftOpeningFloat] = useState(false);
  const [shiftCloseDialogOpen, setShiftCloseDialogOpen] = useState(false);
  const [isOpeningShift, setIsOpeningShift] = useState(false);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryDocumentQuery, setInventoryDocumentQuery] = useState("");
  const [transferDirectionFilter, setTransferDirectionFilter] = useState<TransferDirectionFilter>("ALL");
  const [transferStatusFilter, setTransferStatusFilter] = useState("");
  const [countVarianceFilter, setCountVarianceFilter] = useState<"all" | "variance" | "short" | "over">("all");
  const [inventoryProductId, setInventoryProductId] = useState(workspace.inventoryProducts[0]?.productId ?? "");
  const [inventoryLocationId, setInventoryLocationId] = useState(defaultSalesLocationId);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState(workspace.purchaseOrders[0]?.purchaseOrderId ?? "");
  const [purchaseOrderCreateDialogOpen, setPurchaseOrderCreateDialogOpen] = useState(false);
  const [purchaseOrderCreateSupplierNo, setPurchaseOrderCreateSupplierNo] = useState(
    workspace.purchaseOrderSuppliers[0]?.supplierNo ?? ""
  );
  const [purchaseOrderCreateLocationCode, setPurchaseOrderCreateLocationCode] = useState(
    workspace.inventoryLocations.find((location) => location.useForReceivingDefault)?.locationCode ??
      workspace.inventoryLocations[0]?.locationCode ??
      ""
  );
  const [purchaseOrderCreateReference, setPurchaseOrderCreateReference] = useState("");
  const [purchaseOrderCreateNote, setPurchaseOrderCreateNote] = useState("");
  const [purchaseOrderProductSearch, setPurchaseOrderProductSearch] = useState("");
  const [purchaseOrderProductCode, setPurchaseOrderProductCode] = useState("");
  const [purchaseOrderProductQuantity, setPurchaseOrderProductQuantity] = useState("1");
  const [purchaseOrderProductUnitCost, setPurchaseOrderProductUnitCost] = useState("");
  const [purchaseOrderCreateLines, setPurchaseOrderCreateLines] = useState<
    Array<{
      id: string;
      productCode: string;
      productName: string;
      quantity: number;
      unitCost: number | null;
    }>
  >([]);
  const [purchaseOrderDialogMode, setPurchaseOrderDialogMode] = useState<PurchaseOrderDialogMode>(null);
  const [dialogPurchaseOrderId, setDialogPurchaseOrderId] = useState("");
  const [purchaseOrderReceiptQuantities, setPurchaseOrderReceiptQuantities] = useState<Record<string, string>>({});
  const [purchaseOrderReceiptBatchNos, setPurchaseOrderReceiptBatchNos] = useState<Record<string, string>>({});
  const [purchaseOrderReceiptManufacturedDates, setPurchaseOrderReceiptManufacturedDates] = useState<Record<string, string>>({});
  const [purchaseOrderReceiptExpiryDates, setPurchaseOrderReceiptExpiryDates] = useState<Record<string, string>>({});
  const [selectedGoodsReceiptId, setSelectedGoodsReceiptId] = useState("");
  const [supplierReturnGoodsReceiptId, setSupplierReturnGoodsReceiptId] = useState(workspace.recentGoodsReceipts[0]?.receiptId ?? "");
  const [supplierReturnGoodsReceiptLineId, setSupplierReturnGoodsReceiptLineId] = useState(workspace.recentGoodsReceipts[0]?.lines[0]?.goodsReceiptLineId ?? "");
  const [supplierReturnReason, setSupplierReturnReason] = useState<SupplierReturnReason>("DAMAGED");
  const [supplierReturnQuantity, setSupplierReturnQuantity] = useState("1");
  const [supplierReturnExternalReference, setSupplierReturnExternalReference] = useState("");
  const [supplierReturnNote, setSupplierReturnNote] = useState("");
  const [supplierReturnSerialNumbers, setSupplierReturnSerialNumbers] = useState("");
  const [inventorySerialDraft, setInventorySerialDraft] = useState<InventorySerialDraft | null>(null);
  const [receiptQuantity, setReceiptQuantity] = useState("1");
  const [receiptUnitCost, setReceiptUnitCost] = useState("");
  const [receiptBatchNo, setReceiptBatchNo] = useState("");
  const [receiptManufacturedAt, setReceiptManufacturedAt] = useState("");
  const [receiptExpiryDate, setReceiptExpiryDate] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [transferSourceStoreId, setTransferSourceStoreId] = useState(workspace.transferStores[0]?.storeId ?? "");
  const [transferDestinationLocationId, setTransferDestinationLocationId] = useState(defaultReceivingLocationId);
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [transferUnitOfMeasure, setTransferUnitOfMeasure] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferRequiredDate, setTransferRequiredDate] = useState(activeDate);
  const [transferDeliveryNoteNo, setTransferDeliveryNoteNo] = useState("");
  const [transferTransporterName, setTransferTransporterName] = useState("");
  const [transferVehicleRegistrationNo, setTransferVehicleRegistrationNo] = useState("");
  const [transferDriverName, setTransferDriverName] = useState("");
  const [transferDriverContact, setTransferDriverContact] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferRequestDialogOpen, setTransferRequestDialogOpen] = useState(false);
  const [activeTransferDraftBatchNo, setActiveTransferDraftBatchNo] = useState("");
  const [activeTransferEntryTab, setActiveTransferEntryTab] = useState<TransferEntryTab>("header");
  const [transferRequestLines, setTransferRequestLines] = useState<Array<{
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    quantity: number;
    unitOfMeasure: string;
    baseQuantity: number;
    baseUnitOfMeasure: string;
  }>>([]);
  const [selectedTransferDocumentKey, setSelectedTransferDocumentKey] = useState<string | null>(null);
  const [transferReceiptQuantities, setTransferReceiptQuantities] = useState<Record<string, string>>({});
  const [transferActionNote, setTransferActionNote] = useState("");
  const [transferIssueLocationId, setTransferIssueLocationId] = useState(
    workspace.inventoryLocations.find((location) => location.useForSalesDefault)?.locationId ??
      workspace.inventoryLocations[0]?.locationId ??
      ""
  );
  const [selectedTransferFeedbackKey, setSelectedTransferFeedbackKey] = useState<string | null>(null);
  const [transferFeedbackWaterTest, setTransferFeedbackWaterTest] = useState("");
  const [transferFeedbackQuantityBefore, setTransferFeedbackQuantityBefore] = useState("");
  const [transferFeedbackExpectedReceived, setTransferFeedbackExpectedReceived] = useState("");
  const [transferFeedbackExpectedStock, setTransferFeedbackExpectedStock] = useState("");
  const [transferFeedbackQuantityAfter, setTransferFeedbackQuantityAfter] = useState("");
  const [transferFeedbackActualReceived, setTransferFeedbackActualReceived] = useState("");
  const [transferFeedbackDipReading, setTransferFeedbackDipReading] = useState("");
  const [transferFeedbackBeforeEvidence, setTransferFeedbackBeforeEvidence] = useState<TransferFeedbackEvidence[]>([]);
  const [transferFeedbackAfterEvidence, setTransferFeedbackAfterEvidence] = useState<TransferFeedbackEvidence[]>([]);
  const [transferFeedbackUploadingSection, setTransferFeedbackUploadingSection] = useState<"before" | "after" | null>(null);
  const [transferFeedbackNote, setTransferFeedbackNote] = useState("");
  const [expenseDraftId, setExpenseDraftId] = useState("");
  const [expenseDate, setExpenseDate] = useState(activeDate);
  const [expenseCategory, setExpenseCategory] = useState("GENERAL");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseSupplierName, setExpenseSupplierName] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("CASH");
  const [expenseReference, setExpenseReference] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseTaxAmount, setExpenseTaxAmount] = useState("0");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseAttachmentFileName, setExpenseAttachmentFileName] = useState("");
  const [expenseAttachmentUrl, setExpenseAttachmentUrl] = useState("");
  const [expenseMessage, setExpenseMessage] = useState("");
  const [pendingExpenseConfirmation, setPendingExpenseConfirmation] =
    useState<ExpenseConfirmation | null>(null);
  const [countedQuantity, setCountedQuantity] = useState("0");
  const [countedBatchQuantities, setCountedBatchQuantities] = useState<Record<string, string>>({});
  const [countNote, setCountNote] = useState("");
  const [activeCountEntryTab, setActiveCountEntryTab] = useState<CountEntryTab>("header");
  const [stockCountUploadRows, setStockCountUploadRows] = useState<StockCountUploadRow[]>([]);
  const [pendingStockCountConfirmation, setPendingStockCountConfirmation] =
    useState<StockCountConfirmation | null>(null);
  const [remoteInventoryRows, setRemoteInventoryRows] = useState<RemoteInventoryRow[]>([]);
  const [selectedRemoteInventoryKeys, setSelectedRemoteInventoryKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [remoteInventoryQuery, setRemoteInventoryQuery] = useState("");
  const [remoteInventoryStoreFilter, setRemoteInventoryStoreFilter] = useState("");
  const [remoteInventoryItemFilter, setRemoteInventoryItemFilter] = useState("");
  const [remoteLookupOpen, setRemoteLookupOpen] = useState(false);
  const [isLoadingRemoteInventory, setIsLoadingRemoteInventory] = useState(false);
  const [inventoryMessage, setInventoryMessage] = useState("");
  const [isPostingInventory, setIsPostingInventory] = useState(false);
  useEffect(() => {
    setSalesOrders(workspace.salesOrders);
  }, [workspace.salesOrders]);
  const visibleWorkspaceNav = useMemo(
    () =>
      workspaceNav.filter(
        (item) =>
          (!item.requiresEcommerceConsoleAccess ||
            workspace.capabilities.canAccessEcommerceConsole) &&
          (!item.requiresFuelOperationsVisibility ||
            workspace.capabilities.hasFuelOperationsVisibility)
      ),
    [
      workspace.capabilities.canAccessEcommerceConsole,
      workspace.capabilities.hasFuelOperationsVisibility
    ]
  );
  const onlineStoreFuelViews = useMemo<FuelOperationsViewKey[]>(() => {
    const views: FuelOperationsViewKey[] = [];

    if (workspace.capabilities.canManageFuelTanks) {
      views.push("tanks");
    }

    if (workspace.capabilities.canCaptureFuelDips) {
      views.push("dips");
    }

    if (workspace.capabilities.canCaptureFuelMeterReadings) {
      views.push("meter-readings");
    }

    if (workspace.capabilities.canCaptureSupplierFuelReceipts) {
      views.push("supplier-receipts");
    }

    if (workspace.capabilities.canManageFuelReconciliation) {
      views.push("reconciliation");
    }

    return views;
  }, [
    workspace.capabilities.canCaptureFuelDips,
    workspace.capabilities.canCaptureFuelMeterReadings,
    workspace.capabilities.canCaptureSupplierFuelReceipts,
    workspace.capabilities.canManageFuelReconciliation,
    workspace.capabilities.canManageFuelTanks
  ]);
  const renderedWorkspace = visibleWorkspaceNav.find((item) => item.id === activeWorkspace) ?? visibleWorkspaceNav[0] ?? workspaceNav[0];
  const localClock = clockFormatter.format(currentTime);
  const dashboardScopeLabel =
    dashboardDateFrom === dashboardDateTo ? `shop ${dashboardDateFrom}` : `${dashboardDateFrom} to ${dashboardDateTo}`;
  const dashboardTransactions = workspace.recentTransactions.filter((transaction) =>
    isWithinDateRange(transaction.completedAt, dashboardDateFrom, dashboardDateTo)
  );
  const dashboardSalesRows = workspace.reports.salesRows.filter((row) =>
    isWithinDateRange(row.completedAt, dashboardDateFrom, dashboardDateTo)
  );
  const dashboardSalesCount = dashboardSalesRows.filter((row) => row.transactionType === "SALE").length;
  const dashboardReturnCount = dashboardSalesRows.filter((row) => row.transactionType === "RETURN").length;
  const dashboardExchangeCount = dashboardSalesRows.filter((row) => row.transactionType === "EXCHANGE").length;
  const dashboardNetSalesAmount = roundMoney(dashboardSalesRows.reduce((sum, row) => sum + row.totalAmount, 0));
  const dashboardRefundAmount = roundMoney(
    dashboardSalesRows
      .filter((row) => row.transactionType === "RETURN")
      .reduce((sum, row) => sum + Math.abs(row.totalAmount), 0)
  );
  const dashboardReturnRate =
    dashboardSalesCount + dashboardReturnCount > 0
      ? (dashboardReturnCount / (dashboardSalesCount + dashboardReturnCount)) * 100
      : 0;
  const dashboardCorrectionCount = dashboardTransactions.filter(
    (transaction) => transaction.sourceTransactionNo && transaction.transactionType !== "SALE"
  ).length;
  const dashboardHourlySales = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, count: 0 }));

  dashboardTransactions.forEach((transaction) => {
    if (!transaction.completedAt || transaction.transactionType !== "SALE") {
      return;
    }

    const hour = new Date(transaction.completedAt).getHours();
    dashboardHourlySales[hour].amount = roundMoney(dashboardHourlySales[hour].amount + Math.max(0, transaction.totalAmount));
    dashboardHourlySales[hour].count += 1;
  });

  const dashboardProductTotals = new Map<
    string,
    { productCode: string; productName: string; quantity: number; netAmount: number }
  >();

  dashboardTransactions.forEach((transaction) => {
    transaction.lines.forEach((line) => {
      const current =
        dashboardProductTotals.get(line.productCode) ??
        {
          productCode: line.productCode,
          productName: line.productName,
          quantity: 0,
          netAmount: 0
        };
      const sign = line.lineIntent === "RETURN" ? -1 : 1;

      current.quantity = roundMoney(current.quantity + line.quantity * sign);
      current.netAmount = roundMoney(current.netAmount + line.lineTotal * sign);
      dashboardProductTotals.set(line.productCode, current);
    });
  });

  const dashboardTopProducts = [...dashboardProductTotals.values()].sort((left, right) => right.netAmount - left.netAmount);
  const dashboardTopProduct = dashboardTopProducts[0] ?? null;
  const dashboardTenderTotals = new Map<
    string,
    { paymentMethod: string; tenderMethodCode: string | null; tenderMethodName: string | null; transactionCount: number; netAmount: number }
  >();

  dashboardTransactions.forEach((transaction) => {
    const sign = transaction.transactionType === "RETURN" || transaction.totalAmount < 0 ? -1 : 1;

    transaction.payments.forEach((payment) => {
      const key = `${payment.paymentMethod}:${payment.tenderMethodCode ?? payment.tenderMethodName ?? "unmapped"}`;
      const current =
        dashboardTenderTotals.get(key) ??
        {
          paymentMethod: payment.paymentMethod,
          tenderMethodCode: payment.tenderMethodCode,
          tenderMethodName: payment.tenderMethodName,
          transactionCount: 0,
          netAmount: 0
        };

      current.transactionCount += 1;
      current.netAmount = roundMoney(current.netAmount + payment.amount * sign);
      dashboardTenderTotals.set(key, current);
    });
  });

  const dashboardTenderRows = [...dashboardTenderTotals.values()].sort(
    (left, right) => Math.abs(right.netAmount) - Math.abs(left.netAmount)
  );
  const tenderMixTotal = dashboardTenderRows.reduce((sum, row) => sum + Math.abs(row.netAmount), 0);
  const primaryTender = dashboardTenderRows[0] ?? null;
  const primaryTenderPercent = primaryTender && tenderMixTotal > 0 ? Math.round((Math.abs(primaryTender.netAmount) / tenderMixTotal) * 100) : 0;
  const chartWidth = 640;
  const chartHeight = 210;
  const chartPadX = 28;
  const chartPadTop = 18;
  const chartPadBottom = 28;
  const chartInnerWidth = chartWidth - chartPadX * 2;
  const chartInnerHeight = chartHeight - chartPadTop - chartPadBottom;
  const maxHourlySales = Math.max(1, ...dashboardHourlySales.map((bucket) => bucket.amount));
  const hourlyPoints = dashboardHourlySales.map((bucket, index) => {
    const x = chartPadX + (index / 23) * chartInnerWidth;
    const y = chartPadTop + chartInnerHeight - (bucket.amount / maxHourlySales) * chartInnerHeight;

    return { ...bucket, x, y };
  });
  const hourlyLinePoints = hourlyPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const hourlyAreaPoints = [
    `${chartPadX},${chartPadTop + chartInnerHeight}`,
    ...hourlyPoints.map((point) => `${point.x},${point.y}`),
    `${chartPadX + chartInnerWidth},${chartPadTop + chartInnerHeight}`
  ].join(" ");
  const tenderPalette = ["#147ad6", "#2f7d4d", "#d9901f", "#8170bd", "#279094", "#b84848"];
  const tenderGradient =
    dashboardTenderRows.length && tenderMixTotal > 0
      ? dashboardTenderRows
          .reduce(
            (segments, row, index) => {
              const nextPercent = segments.current + (Math.abs(row.netAmount) / tenderMixTotal) * 100;
              segments.values.push(`${tenderPalette[index % tenderPalette.length]} ${segments.current}% ${nextPercent}%`);
              segments.current = nextPercent;
              return segments;
            },
            { current: 0, values: [] as string[] }
          )
          .values.join(", ")
      : "#d6e0d6 0 100%";
  const modeProducts =
    saleMode !== "SALE"
      ? workspace.products
      : workspace.products.filter(isSellableCatalogProduct);
  const filteredProducts = modeProducts.filter((product) => {
    const query = searchQuery.trim().toLowerCase();
    const departmentMatch = !catalogDepartment || product.department === catalogDepartment;
    const categoryMatch = !catalogCategory || product.category === catalogCategory;

    if (!departmentMatch || !categoryMatch) {
      return false;
    }

    if (!query) {
      return true;
    }

    const matrixSearch = product.matrixVariants
      .map((variant) => `${variant.code} ${variant.sku ?? ""} ${variant.barcode ?? ""} ${variant.displayName ?? ""}`)
      .join(" ");
    const sellingUnitSearch = product.sellingUnits
      .map((sellingUnit) => `${sellingUnit.unitOfMeasureCode} ${sellingUnit.unitOfMeasureName} ${sellingUnit.barcode ?? ""}`)
      .join(" ");

    return `${product.productName} ${product.productCode} ${product.department ?? ""} ${product.category ?? ""} ${matrixSearch} ${sellingUnitSearch}`
      .toLowerCase()
      .includes(query);
  });
  const openPriceMatrixVariants = openPriceDraft
    ? filterMatrixVariants(
        openPriceDraft.product.matrixVariants,
        openPriceDraft.variantSearch,
        openPriceDraft.productVariantCode || null
      )
    : [];
  const openPriceIsMatrix = Boolean(
    openPriceDraft &&
      openPriceDraft.product.productType === "MATRIX" &&
      openPriceDraft.product.matrixVariants.length > 0
  );
  const openPriceSellingUnits = openPriceDraft
    ? sellingUnitsForProduct(openPriceDraft.product, openPriceDraft.productVariantCode || null)
    : [];
  const openPriceSelectedSellingUnit = openPriceDraft
    ? resolveProductSellingUnit(
        openPriceDraft.product,
        openPriceDraft.productVariantCode || null,
        openPriceDraft.sellingUnitOfMeasure
      )
    : null;
  const openPriceExpressEligible = Boolean(
    openPriceDraft &&
      openPriceDraft.product.trackSize &&
      openPriceDraft.product.trackColor
  );
  const openPriceAvailableBatches = openPriceDraft?.product.trackExpiry
    ? workspace.inventoryBatches
        .filter(
          (batch) =>
            batch.productId === openPriceDraft.product.productId &&
            (!defaultSalesLocationId || batch.locationId === defaultSalesLocationId) &&
            batch.quantityOnHand > 0 &&
            batch.daysUntilExpiry >= 0 &&
            batch.status.toUpperCase() === "ACTIVE"
        )
        .sort(
          (left, right) =>
            left.expiryDate.localeCompare(right.expiryDate) ||
            left.batchNo.localeCompare(right.batchNo)
        )
    : [];
  const openPriceBatchUnavailable =
    Boolean(openPriceDraft?.product.trackExpiry) &&
    saleMode === "SALE" &&
    openPriceAvailableBatches.length === 0;
  const configuredProductSizes = workspace.optionSettings?.productSizes ?? [];
  const configuredPosDiscountRates = workspace.optionSettings?.posDiscountRates ?? [];
  const configuredPosExpressChargeRates = workspace.optionSettings?.posExpressChargeRates ?? [];
  function resolveConfiguredPosDiscountRate(value: string | number | null | undefined) {
    const rate = Number(value);

    if (!Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    const matchedRate = configuredPosDiscountRates.find(
      (configuredRate) => configuredRate.toFixed(2) === rate.toFixed(2)
    );

    return matchedRate === undefined ? null : Number(matchedRate.toFixed(2));
  }

  function resolveConfiguredPosExpressChargeRate(value: string | number | null | undefined) {
    const rate = Number(value);

    if (!Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    const matchedRate = configuredPosExpressChargeRates.find(
      (configuredRate) => configuredRate.toFixed(2) === rate.toFixed(2)
    );

    return matchedRate === undefined ? null : Number(matchedRate.toFixed(2));
  }

  function inferConfiguredPosDiscountRate(input: {
    quantity: number;
    unitPrice: number;
    configuredDiscountRate?: number | null;
    discountAmount?: number | null;
    appliedPromotionName?: string | null;
  }) {
    const configuredRate = resolveConfiguredPosDiscountRate(input.configuredDiscountRate);

    if (configuredRate !== null) {
      return configuredRate;
    }

    const discountAmount = roundMoney(Number(input.discountAmount ?? 0));
    const appliedPromotionName = input.appliedPromotionName?.trim().toUpperCase() ?? "";

    if (discountAmount <= 0 || !appliedPromotionName.startsWith("POS DISCOUNT")) {
      return null;
    }

    return configuredPosDiscountRates.find((rate) => {
      const expectedDiscount = roundMoney(input.quantity * input.unitPrice * (rate / 100));

      return Math.abs(expectedDiscount - discountAmount) < 0.01;
    }) ?? null;
  }

  const customerMatches = customers
    .filter((customer) => {
      const query = customerQuery.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return `${customer.customerNo} ${customer.fullName} ${customer.phone ?? ""} ${customer.email ?? ""}`
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 5);
  const selectedAccountPaymentCustomer =
    customers.find((customer) => customer.customerId === accountPaymentCustomerId) ?? null;
  const accountPaymentTender =
    workspace.tenderMethods.find((tender) => tender.tenderMethodCode === accountPaymentTenderCode) ??
    nonCreditTenderMethods[0] ??
    null;
  const accountCustomerRows = customers.filter((customer) => {
    if (customer.receivableBalanceAmount <= 0) {
      return false;
    }

    const query = accountCustomerQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return `${customer.customerNo} ${customer.fullName} ${customer.phone ?? ""} ${customer.email ?? ""}`
      .toLowerCase()
      .includes(query);
  });
  const heldSaleRows = heldSales.filter((heldSale) => {
    const query = heldSaleQuery.trim().toLowerCase();

    if (!isWithinWindow(heldSale.updatedAt, heldSaleWindowDays)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${heldSale.transactionNo} ${heldSale.customerNo ?? ""} ${heldSale.customerName}`
      .toLowerCase()
      .includes(query);
  });
  const salesOrderRows = salesOrders.filter((order) => {
    const query = salesOrderQuery.trim().toLowerCase();

    if (order.status !== "OPEN") {
      return false;
    }

    if (!isWithinWindow(order.createdAt, salesOrderWindowDays)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${order.orderNo} ${order.sourceTransactionNo} ${order.customerNo ?? ""} ${order.customerName} ${order.originStoreCode} ${order.originStoreName} ${order.status}`
      .toLowerCase()
      .includes(query);
  });
  const selectableFulfilmentSalesOrderIds = salesOrderRows
    .filter((order) => order.isFulfilmentOrder && order.status === "OPEN")
    .map((order) => order.orderId);
  const selectedFulfilmentSalesOrders = salesOrderRows.filter((order) =>
    selectedFulfilmentSalesOrderIds.includes(order.orderId)
  );
  const receiptRows = workspace.recentTransactions.filter((transaction) => {
    const query = receiptQuery.trim().toLowerCase();

    if (receiptHistoryKind !== "SALES" || !isWithinWindow(transaction.completedAt, receiptWindowDays)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${transaction.transactionNo} ${transaction.customerName} ${transaction.transactionType} ${transaction.sourceTransactionNo ?? ""}`
      .toLowerCase()
      .includes(query);
  });
  const accountPaymentRows = accountPayments.filter((entry) => {
    const query = receiptQuery.trim().toLowerCase();

    if (receiptHistoryKind !== "ACCOUNT_PAYMENT" || !isWithinWindow(entry.occurredAt, receiptWindowDays)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${entry.entryNo} ${entry.customerNo} ${entry.customerName} ${entry.reference ?? ""}`
      .toLowerCase()
      .includes(query);
  });
  const salesOrderReceiptRows = salesOrders.filter((order) => {
    const query = receiptQuery.trim().toLowerCase();
    const receiptDate = order.fulfilledAt ?? order.createdAt;

    if (receiptHistoryKind !== "SALES_ORDER" || !isWithinWindow(receiptDate, receiptWindowDays)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${order.orderNo} ${order.sourceTransactionNo} ${order.customerNo ?? ""} ${order.customerName} ${order.status} ${order.operatorName ?? ""} ${order.lines.map((line) => `${line.productCode} ${line.productName}`).join(" ")}`
      .toLowerCase()
      .includes(query);
  });
  const receiptShownCount = receiptRows.length + salesOrderReceiptRows.length + accountPaymentRows.length;
  const activeSalesOrder = fulfillingSalesOrderId
    ? salesOrders.find((order) => order.orderId === fulfillingSalesOrderId) ?? null
    : null;
  const currentShift = activeShift?.status === "OPEN" ? activeShift : null;
  const isRecalledBasket = Boolean(sourceTransactionId);
  const hasSaleScreenState =
    basket.length > 0 ||
    Boolean(openPriceDraft) ||
    Boolean(sourceTransactionId) ||
    Boolean(fulfillingSalesOrderId) ||
    Boolean(selectedCustomer) ||
    transactionReference.trim().length > 0 ||
    transactionNote.trim().length > 0;
  const declaredCloseCashAmount = parseAmount(eodDeclaredCash);
  const shiftCloseVariance = currentShift ? roundMoney(declaredCloseCashAmount - currentShift.expectedCashAmount) : 0;
  const departments = Array.from(
    new Set(modeProducts.map((product) => product.department).filter((value): value is string => Boolean(value)))
  );
  const categories = Array.from(
    new Set(
      modeProducts
        .filter((product) => !catalogDepartment || product.department === catalogDepartment)
        .map((product) => product.category)
        .filter((value): value is string => Boolean(value))
    )
  );
  const selectedInventoryProduct = workspace.inventoryProducts.find((product) => product.productId === inventoryProductId) ?? null;
  const selectedInventoryRow = selectedInventoryProduct
    ? workspace.inventoryRows.find(
        (row) => row.productId === selectedInventoryProduct.productId && (!inventoryLocationId || row.locationId === inventoryLocationId)
      ) ?? null
    : null;
  const selectedCountBatches = workspace.inventoryBatches.filter(
    (batch) =>
      batch.productId === inventoryProductId &&
      (!inventoryLocationId || batch.locationId === inventoryLocationId),
  );
  const inventoryLedgerByProductLocation = new Map(
    workspace.inventoryRows.map((row) => [`${row.productId}:${row.locationId}`, row] as const)
  );
  const allInventoryBrowserRows = workspace.inventoryProducts
    .flatMap((product) =>
      workspace.inventoryLocations.length
        ? workspace.inventoryLocations.map((location) => {
            const ledgerRow = inventoryLedgerByProductLocation.get(`${product.productId}:${location.locationId}`);

            return {
              productId: product.productId,
              productCode: product.productCode,
              productName: product.productName,
              isSerialized: product.isSerialized,
              trackExpiry: product.trackExpiry,
              minStockLevel: product.minStockLevel,
              reorderPoint: product.reorderPoint,
              safetyStockLevel: product.safetyStockLevel,
              earliestExpiryDate:
                workspace.inventoryBatches
                  .filter(
                    (batch) =>
                      batch.productId === product.productId &&
                      batch.locationId === location.locationId &&
                      batch.quantityOnHand > 0,
                  )
                  .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate))[0]
                  ?.expiryDate ?? null,
              expiringQuantity: workspace.inventoryBatches
                .filter(
                  (batch) =>
                    batch.productId === product.productId &&
                    batch.locationId === location.locationId &&
                    batch.daysUntilExpiry >= 0 &&
                    batch.daysUntilExpiry <=
                      workspace.optionSettings.expiryAlertLeadDays,
                )
                .reduce((sum, batch) => sum + batch.quantityOnHand, 0),
              department: product.department,
              category: product.category,
              locationId: location.locationId,
              locationCode: location.locationCode,
              locationName: location.locationName,
              quantityOnHand: ledgerRow?.quantityOnHand ?? 0,
              activeReservedQuantity: ledgerRow?.activeReservedQuantity ?? 0,
              ecommerceSellableQuantity: ledgerRow?.ecommerceSellableQuantity ?? 0,
              ecommercePickupEligible: ledgerRow?.ecommercePickupEligible ?? false,
              ecommerceDeliveryEligible: ledgerRow?.ecommerceDeliveryEligible ?? false,
              ecommerceEligibilityLabel:
                ledgerRow?.ecommerceEligibilityLabel ??
                "Not configured for ecommerce fulfilment",
              price: ledgerRow?.price ?? product.price
            };
          })
        : [
            {
              productId: product.productId,
              productCode: product.productCode,
              productName: product.productName,
              isSerialized: product.isSerialized,
              trackExpiry: product.trackExpiry,
              minStockLevel: product.minStockLevel,
              reorderPoint: product.reorderPoint,
              safetyStockLevel: product.safetyStockLevel,
              earliestExpiryDate: product.earliestExpiryDate,
              expiringQuantity: product.expiringQuantity,
              department: product.department,
              category: product.category,
              locationId: "",
              locationCode: "",
              locationName: "No active location",
              quantityOnHand: product.quantityOnHand,
              activeReservedQuantity: 0,
              ecommerceSellableQuantity: 0,
              ecommercePickupEligible: false,
              ecommerceDeliveryEligible: false,
              ecommerceEligibilityLabel: "Not configured for ecommerce fulfilment",
              price: product.price
            }
          ]
    );
  const inventoryBrowserRows = allInventoryBrowserRows
    .filter((row) => {
      if (inventoryLocationId && row.locationId !== inventoryLocationId) {
        return false;
      }

      const query = inventoryQuery.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return `${row.productName} ${row.productCode} ${row.locationName} ${row.locationCode} ${row.department ?? ""} ${row.category ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  const visibleInventoryBatchRows = workspace.inventoryBatches
    .filter((batch) => !inventoryLocationId || batch.locationId === inventoryLocationId)
    .filter((batch) => {
      const query = inventoryQuery.trim().toLowerCase();

      return !query || `${batch.productName} ${batch.productCode} ${batch.batchNo} ${batch.locationName}`.toLowerCase().includes(query);
    })
    .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate));
  const stockAlertRows = allInventoryBrowserRows
    .filter((row) => {
      const alertFloor = getOnlineCriticalStockFloor(row);

      return alertFloor !== null && row.quantityOnHand <= alertFloor;
    })
    .sort((left, right) => {
      const leftShortage = (getOnlineCriticalStockFloor(left) ?? 0) - left.quantityOnHand;
      const rightShortage = (getOnlineCriticalStockFloor(right) ?? 0) - right.quantityOnHand;

      return rightShortage - leftShortage || left.productName.localeCompare(right.productName);
    });
  const startupExpiringBatchRows = workspace.inventoryBatches
    .filter(
      (batch) =>
        batch.quantityOnHand > 0 &&
        batch.daysUntilExpiry >= 0 &&
        batch.daysUntilExpiry <= workspace.optionSettings.expiryAlertLeadDays
    )
    .sort((left, right) => left.daysUntilExpiry - right.daysUntilExpiry || left.productName.localeCompare(right.productName));
  const openPurchaseOrderCount = workspace.purchaseOrders.filter((order) => order.outstandingQuantity > 0).length;
  const openTransferCount = workspace.transferRequests.filter((transfer) => !["CANCELLED", "RECEIVED", "COMPLETED"].includes(transfer.status)).length;
  const inventoryDocumentSearch = inventoryDocumentQuery.trim().toLowerCase();
  const purchaseOrderRows = workspace.purchaseOrders.filter((order) => {
    if (!inventoryDocumentSearch) {
      return true;
    }

    return `${order.purchaseOrderNo} ${order.supplierNo ?? ""} ${order.supplierName ?? ""} ${order.locationName} ${order.status}`
      .toLowerCase()
      .includes(inventoryDocumentSearch);
  });
  const goodsReceiptRows = workspace.recentGoodsReceipts.filter((receipt) => {
    if (!inventoryDocumentSearch) {
      return true;
    }

    return `${receipt.receiptNo} ${receipt.purchaseOrderNo ?? ""} ${receipt.supplierNo ?? ""} ${receipt.supplierName ?? ""} ${receipt.locationName}`
      .toLowerCase()
      .includes(inventoryDocumentSearch);
  });
  const supplierReturnRows = workspace.supplierReturns.filter((supplierReturn) => {
    if (!inventoryDocumentSearch) {
      return true;
    }

    return `${supplierReturn.supplierReturnNo} ${supplierReturn.supplierNo} ${supplierReturn.supplierName} ${supplierReturn.goodsReceiptNo ?? ""} ${supplierReturn.reason} ${supplierReturn.status}`
      .toLowerCase()
      .includes(inventoryDocumentSearch);
  });
  const transferRequestRows = workspace.transferRequests.filter((transfer) => {
    const statusMatch = !transferStatusFilter || transfer.status === transferStatusFilter;
    const directionMatch =
      transferDirectionFilter === "ALL" ||
      (transferDirectionFilter === "OUT" && transfer.role === "SOURCE") ||
      (transferDirectionFilter === "IN" && transfer.role === "DESTINATION");
    const queryMatch =
      !inventoryDocumentSearch ||
      `${transfer.transferNo} ${transfer.transferBatchNo ?? ""} ${transfer.sourceStoreName} ${transfer.sourceLocationName} ${transfer.destinationStoreName} ${transfer.destinationLocationName} ${transfer.productCode} ${transfer.productName} ${transfer.status} ${transfer.externalReference ?? ""}`
        .toLowerCase()
        .includes(inventoryDocumentSearch);

    return statusMatch && directionMatch && queryMatch;
  });
  const transferDocumentGroups = buildTransferDocumentGroups(transferRequestRows);
  const transferListHasIssueAction = transferDocumentGroups.some((transfer) =>
    transfer.lines.some((line) => line.role === "SOURCE" && line.outstandingIssueQuantity > 0)
  );
  const transferListHasReceiveAction = transferDocumentGroups.some((transfer) =>
    transfer.lines.some((line) => line.role === "DESTINATION" && line.outstandingReceiptQuantity > 0)
  );
  const transferProcessHeader =
    transferDirectionFilter === "OUT" || (transferListHasIssueAction && !transferListHasReceiveAction)
      ? "Issue"
      : transferDirectionFilter === "IN" || (transferListHasReceiveAction && !transferListHasIssueAction)
        ? "Receive"
        : "Issue / Receive";
  const selectedTransferDocument =
    transferDocumentGroups.find((group) => group.key === selectedTransferDocumentKey) ?? null;
  const selectedTransferFeedbackDocument =
    transferDocumentGroups.find((group) => group.key === selectedTransferFeedbackKey) ?? null;
  const selectedTransferSourceStore =
    workspace.transferStores.find((store) => store.storeId === transferSourceStoreId) ?? workspace.transferStores[0] ?? null;
  const selectedTransferDestinationLocation =
    workspace.inventoryLocations.find((location) => location.locationId === transferDestinationLocationId) ??
    workspace.inventoryLocations.find((location) => location.locationId === defaultReceivingLocationId) ??
    workspace.inventoryLocations[0] ??
    null;
  const countLocationItems = inventoryBrowserRows.filter(
    (row) => !inventoryLocationId || row.locationId === inventoryLocationId
  );
  const transferStatuses = Array.from(new Set(workspace.transferRequests.map((transfer) => transfer.status))).sort();
  const stockCountRows = workspace.stockCountSessions.filter((session) => {
    const queryMatch =
      !inventoryDocumentSearch ||
      `${session.sessionNo} ${session.productCode} ${session.productName} ${session.locationName} ${session.status} ${session.operatorName}`
        .toLowerCase()
        .includes(inventoryDocumentSearch);
    const varianceMatch =
      countVarianceFilter === "all" ||
      (countVarianceFilter === "variance" && session.varianceQuantity !== 0) ||
      (countVarianceFilter === "short" && session.varianceQuantity < 0) ||
      (countVarianceFilter === "over" && session.varianceQuantity > 0);

    return queryMatch && varianceMatch;
  });
  const stockCountSheetGroups = Array.from(
    stockCountRows.reduce((groups, session) => {
      const sheetNo = stockCountSheetNo(session.sessionNo);
      groups.set(sheetNo, [...(groups.get(sheetNo) ?? []), session]);
      return groups;
    }, new Map<string, typeof stockCountRows>()),
  ).map(([sheetNo, sessions]) => ({
    sheetNo,
    sessions,
    status: sessions.every((session) => session.status === "COMMITTED")
      ? "COMMITTED"
      : sessions.every((session) => session.status === "SUBMITTED")
        ? "SUBMITTED"
        : sessions[0]?.status ?? "DRAFT",
    varianceQuantity: roundQuantity(
      sessions.reduce((sum, session) => sum + session.varianceQuantity, 0),
    ),
    submittedAt: sessions[0]?.submittedAt ?? new Date().toISOString(),
    locationName: sessions[0]?.locationName ?? "",
  }));
  const activeReportBundle = reportResult?.reports ?? workspace.reports;
  const activeReporting = reportResult?.reporting ?? workspace.reporting;
  const activeReportDefinition =
    activeReporting.definitions.find((definition) => definition.reportId === activeReport) ??
    activeReporting.definitions[0] ??
    null;
  const activeReportParameterIds = activeReportDefinition?.parameterIds ?? [];
  const reportParameterById = new Map(activeReporting.parameters.map((parameter) => [parameter.parameterId, parameter] as const));
  const reportGroups = Array.from(
    activeReporting.definitions.reduce((groups, definition) => {
      const definitions = groups.get(definition.group) ?? [];

      definitions.push(definition);
      groups.set(definition.group, definitions);

      return groups;
    }, new Map<string, typeof activeReporting.definitions>())
  );
  const reportSalesRows = activeReportBundle.salesRows;
  const reportProductRows = activeReportBundle.productRows;
  const reportSalesOrderRows = activeReportBundle.salesOrderRows;
  const reportLayawayRows = activeReportBundle.layawayRows;
  const reportLayawayPaymentRows = activeReportBundle.layawayPaymentRows;
  const reportTenderRows = activeReportBundle.tenderRows;
  const reportInventoryRows = activeReportBundle.inventoryRows;
  const reportBankingRows = activeReportBundle.bankingRows;
  const reportShiftRows = activeReportBundle.shiftRows;
  const activeReportRowCount =
    activeReport === "sales"
      ? reportSalesRows.length
      : activeReport === "products"
        ? reportProductRows.length
        : activeReport === "orders"
          ? reportSalesOrderRows.length
          : activeReport === "layaways"
            ? reportLayawayRows.length
            : activeReport === "layawayPayments"
              ? reportLayawayPaymentRows.length
              : activeReport === "tenders"
                ? reportTenderRows.length
                : activeReport === "inventory"
                  ? reportInventoryRows.length
                  : activeReport === "banking"
                    ? reportBankingRows.length
                    : reportShiftRows.length;
  const selectedManagerShiftRow =
    workspace.reports.shiftRows.find((shift) => shift.shiftId === selectedEodShiftId) ?? null;
  const managerExpectedCash = selectedManagerShiftRow?.expectedCashAmount ?? currentShift?.expectedCashAmount ?? 0;
  const selectedBankingReconciliation =
    workspace.eodReconciliations.find((reconciliation) => reconciliation.reconciliationId === bankingReconciliationId) ??
    null;
  const correctionRows = workspace.recentTransactions.filter((transaction) => {
    const query = correctionQuery.trim().toLowerCase();

    if (transaction.transactionType === "RETURN" || !isWithinWindow(transaction.completedAt, correctionWindowDays)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return `${transaction.transactionNo} ${transaction.customerName} ${transaction.transactionType} ${transaction.sourceTransactionNo ?? ""} ${transaction.lines.map((line) => `${line.productCode} ${line.productName}`).join(" ")}`
      .toLowerCase()
      .includes(query);
  });
  const selectedPurchaseOrder =
    workspace.purchaseOrders.find((order) => order.purchaseOrderId === selectedPurchaseOrderId) ??
    workspace.purchaseOrders[0] ??
    null;
  const filteredPurchaseOrderProducts = workspace.inventoryProducts.filter((product) => {
    const query = purchaseOrderProductSearch.trim().toLowerCase();

    return (
      !query ||
      [product.productCode, product.productName, product.sku]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    );
  });
  const selectedPurchaseOrderProduct =
    workspace.inventoryProducts.find(
      (product) => product.productCode === purchaseOrderProductCode
    ) ?? null;
  const dialogPurchaseOrder =
    workspace.purchaseOrders.find((order) => order.purchaseOrderId === dialogPurchaseOrderId) ?? null;
  const selectedGoodsReceipt =
    workspace.recentGoodsReceipts.find((receipt) => receipt.receiptId === selectedGoodsReceiptId) ?? null;
  const selectedSupplierReturnReceipt =
    workspace.recentGoodsReceipts.find((receipt) => receipt.receiptId === supplierReturnGoodsReceiptId) ??
    workspace.recentGoodsReceipts[0] ??
    null;
  const selectedSupplierReturnLine =
    selectedSupplierReturnReceipt?.lines.find((line) => line.goodsReceiptLineId === supplierReturnGoodsReceiptLineId) ??
    selectedSupplierReturnReceipt?.lines[0] ??
    null;
  const selectedSupplierReturnSerials = parseSerialDraft(supplierReturnSerialNumbers);
  const selectedInventorySerials = inventorySerialDraft ? parseSerialDraft(inventorySerialDraft.serialNumbers) : [];
  const inventorySerialMismatch = inventorySerialDraft
    ? inventorySerialDraft.requireExactQuantity === false
      ? selectedInventorySerials.length <= 0
      : selectedInventorySerials.length !== inventorySerialDraft.quantity
    : false;
  const promotionPricing = useMemo(
    () =>
      applyAutomaticPromotions({
        promotions: workspace.promotions,
        storeCode: workspace.store?.code ?? null,
        customerType: selectedCustomer?.customerType ?? null,
        loyaltyTier: selectedCustomer?.loyaltyTier ?? null,
        lines: basket.map((line) => ({
          lineId: line.product.productId,
          lineIntent: "SALE",
          sourceLineId: null,
          productCode: line.product.productCode,
          departmentCode: line.product.department,
          categoryCode: line.product.category,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxable: line.product.taxRatePercent > 0,
          taxRatePercent: line.product.taxRatePercent,
          taxInclusive: line.product.taxInclusive
        }))
      }),
    [basket, selectedCustomer?.customerType, selectedCustomer?.loyaltyTier, workspace.promotions, workspace.store?.code]
  );
  const promotionLineById = useMemo(
    () => new Map(promotionPricing.lineResults.map((line) => [line.lineId, line] as const)),
    [promotionPricing.lineResults]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(max-width: 760px)").matches) {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (
      activeWorkspace !== "ecommerce" ||
      !workspace.capabilities.canAccessEcommerceConsole ||
      ecommerceWorkspace
    ) {
      return;
    }

    const controller = new AbortController();
    setIsLoadingEcommerce(true);
    setEcommerceLoadError("");

    void fetch("/api/online-store/ecommerce", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as
          | OnlineStoreEcommerceWorkspaceData
          | { message?: string };

        if (!response.ok || !("store" in payload)) {
          throw new Error(
            "message" in payload && payload.message
              ? payload.message
              : "Flash ERP could not load the ecommerce console."
          );
        }

        setIsLoadingEcommerce(false);
        setEcommerceWorkspace(payload);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setEcommerceLoadError(
            error instanceof Error
              ? error.message
              : "Flash ERP could not load the ecommerce console."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingEcommerce(false);
        }
      });

    return () => controller.abort();
  }, [
    activeWorkspace,
    ecommerceLoadAttempt,
    ecommerceWorkspace,
    workspace.capabilities.canAccessEcommerceConsole
  ]);
  const basketPricingLines = useMemo(
    () =>
      basket.map((line) => {
        const configuredDiscountRate = resolveConfiguredPosDiscountRate(line.configuredDiscountRate);

        if (configuredDiscountRate !== null) {
          const discountAmount = roundMoney(line.quantity * line.unitPrice * (configuredDiscountRate / 100));
          const amounts = calculateBasketLineAmounts(line, discountAmount);

          return {
            ...amounts,
            appliedPromotionName: `POS discount ${formatDiscountRate(configuredDiscountRate)}%`,
            appliedPromotionCode: null
          };
        }

        const pricedLine = promotionLineById.get(line.product.productId);

        return pricedLine
          ? {
              discountAmount: pricedLine.discountAmount,
              taxAmount: pricedLine.taxAmount,
              lineTotal: pricedLine.lineTotal,
              appliedPromotionName: pricedLine.appliedPromotionName,
              appliedPromotionCode: pricedLine.appliedPromotionCode
            }
          : {
              ...calculateBasketLineAmounts(line),
              appliedPromotionName: null,
              appliedPromotionCode: null
            };
      }),
    [basket, configuredPosDiscountRates, promotionLineById]
  );
  const promotionDiscountAmount = roundMoney(
    basketPricingLines.reduce((sum, line) => sum + line.discountAmount, 0)
  );
  const taxAmount = roundMoney(
    basketPricingLines.reduce((sum, line) => sum + line.taxAmount, 0)
  );
  const grossTotal = roundMoney(
    basketPricingLines.reduce((sum, line) => sum + line.lineTotal, 0)
  );
  const requestedLoyaltyPoints = Math.max(0, Math.trunc(parseAmount(loyaltyPointsToRedeem)));
  const loyaltyBlockedPromotionNames = promotionPricing.appliedPromotions
    .filter((promotion) => !promotion.allowWithLoyalty)
    .map((promotion) => promotion.promotionName);
  const promotionLoyaltyBlockMessage =
    requestedLoyaltyPoints > 0 && loyaltyBlockedPromotionNames.length > 0
      ? `Flash ERP cannot combine loyalty redemption with ${loyaltyBlockedPromotionNames.slice(0, 2).join(", ")}.`
      : "";
  const loyaltyRedemption = calculateLoyaltyRedemption({
    customer: selectedCustomer
      ? {
          fullName: selectedCustomer.fullName,
          loyaltyEnrolled: selectedCustomer.loyaltyEnrolled,
          loyaltyPointsBalance: selectedCustomer.loyaltyPointsBalance
        }
      : null,
    totalAmount: grossTotal,
    requestedPoints: requestedLoyaltyPoints,
    policy: workspace.loyaltyPolicy
  });
  const loyaltyRedemptionValidationMessage =
    requestedLoyaltyPoints <= 0
      ? ""
      : promotionLoyaltyBlockMessage
        ? promotionLoyaltyBlockMessage
        : !loyaltyRedemption.canRedeem
        ? loyaltyRedemption.message ?? "Flash ERP cannot apply loyalty redemption to this basket right now."
        : loyaltyRedemption.appliedPoints <= 0
          ? `Redeem at least ${formatNumber.format(loyaltyRedemption.policy.loyaltyMinimumRedeemPoints)} point(s) in ${formatNumber.format(loyaltyRedemption.policy.loyaltyRedemptionPointsStep)} point steps.`
          : loyaltyRedemption.appliedPoints !== requestedLoyaltyPoints
          ? `Flash ERP can only redeem ${formatNumber.format(loyaltyRedemption.appliedPoints)} point(s) on this basket right now.`
          : "";
  const loyaltyRedemptionAmount =
    requestedLoyaltyPoints > 0 && !loyaltyRedemptionValidationMessage ? loyaltyRedemption.appliedAmount : 0;
  const canApplyMaxLoyaltyRedemption =
    selectedCustomer !== null &&
    basket.length > 0 &&
    loyaltyRedemption.canRedeem &&
    loyaltyRedemption.maxRedeemablePoints > 0;
  const showPromotionSummary = promotionDiscountAmount > 0;
  const showLoyaltySummary = Boolean(
    selectedCustomer?.loyaltyEnrolled &&
      workspace.loyaltyPolicy.loyaltyRedemptionEnabled,
  );
  const total = Math.max(0, grossTotal - loyaltyRedemptionAmount);
  const summarySubtotal = calculateReceiptSummarySubtotal({
    totalAmount: total,
    discountAmount: promotionDiscountAmount,
    taxAmount,
    loyaltyRedemptionAmount
  });
  const payableTotal = activeSalesOrder
    ? Math.max(0, total - (activeSalesOrder.paidAmount ?? activeSalesOrder.depositAmount ?? 0))
    : total;
  const paymentTotal = paymentDrafts.reduce((sum, draft) => sum + parseAmount(draft.amount), 0);
  const amountDue = Math.max(0, payableTotal - paymentTotal);
  const changeDue = Math.max(0, paymentTotal - payableTotal);
  const storeCreditAmount = paymentDrafts.reduce((sum, draft) => {
    const tender = tenderForDraft(draft);

    return isStoreCreditTender(tender) ? sum + parseAmount(draft.amount) : sum;
  }, 0);
  const hasChangeTender = paymentDrafts.some((draft) => {
    const tender = tenderForDraft(draft);

    return parseAmount(draft.amount) > 0 && tender?.paymentMethod === "CASH" && tender.allowChange;
  });
  const storeCreditLimitExceededBy =
    selectedCustomer?.creditLimitAmount === null ||
    selectedCustomer?.creditLimitAmount === undefined ||
    selectedCustomer.creditLimitAmount <= 0
      ? 0
      : Math.max(0, selectedCustomer.receivableBalanceAmount + storeCreditAmount - selectedCustomer.creditLimitAmount);
  const missingBankAccountTender = paymentDrafts.some((draft) => {
    const tender = tenderForDraft(draft);

    return parseAmount(draft.amount) > 0 && Boolean(tender?.requiresBankAccount) && !draft.bankAccountId;
  });
  const missingReferenceTender = paymentDrafts.some((draft) => {
    const tender = tenderForDraft(draft);

    return parseAmount(draft.amount) > 0 && Boolean(tender?.requiresReference) && !draft.reference.trim();
  });
  const isCreatingOrder = saleMode !== "SALE" && !activeSalesOrder;
  const isCreatingLayaway = saleMode === "LAYAWAY" && !activeSalesOrder;
  const layawayMinimumDepositAmount = roundMoney(
    total * ((workspace.optionSettings.layawaySettings.minimumDepositPercent ?? 0) / 100)
  );
  const layawayDepositShort =
    isCreatingLayaway && paymentTotal + 0.005 < layawayMinimumDepositAmount;
  const salesOrderDepositOver = isCreatingOrder && paymentTotal - total > 0.005;
  const salesOrderHasInvalidTender =
    isCreatingOrder &&
    paymentDrafts.some((draft) => {
      const amount = parseAmount(draft.amount);

      return (
        amount > 0 &&
        !nonCreditTenderMethods.some(
          (method) => method.tenderMethodCode === draft.tenderMethodCode
        )
      );
    });
  const isTenderShort = amountDue > 0.005;
  const isTenderOverWithoutChange = changeDue > 0.005 && !hasChangeTender;
  const hasOpenShift = activeShift?.status === "OPEN";
  const storeCreditValidationMessage =
    storeCreditAmount <= 0
      ? ""
      : !selectedCustomer
        ? "Attach a customer before using Store Credit on this basket."
        : !selectedCustomer.allowCreditSales
          ? `Store Credit is disabled for ${selectedCustomer.fullName}.`
          : storeCreditLimitExceededBy > 0.005
            ? `Store Credit exceeds ${selectedCustomer.fullName}'s remaining limit by ${formatMoney(storeCreditLimitExceededBy, currencyCode)}.`
            : "";
  const canSaveSalesOrder =
    isCreatingOrder &&
    basket.length > 0 &&
    Boolean(selectedCustomer) &&
    hasOpenShift &&
    !isPostingPosAction &&
    (!isCreatingLayaway ||
      (workspace.optionSettings.layawaySettings.enabled &&
        workspace.capabilities.canCreateLayaway)) &&
    (!layawayDepositShort ||
      (workspace.capabilities.canOverrideLayawayPolicy && layawayPolicyOverrideApproved)) &&
    !salesOrderDepositOver &&
    !salesOrderHasInvalidTender &&
    !missingBankAccountTender &&
    !missingReferenceTender;
  const layawayActionExpectedAmount = layawayActionDraft
    ? layawayActionDraft.kind === "PAYMENT"
      ? layawayActionDraft.order.balanceAmount
      : layawayActionDraft.kind === "CANCEL"
        ? estimateLayawayRefund(layawayActionDraft.order)
        : 0
    : 0;
  const layawayActionPaymentTotal = layawayActionPayments.reduce(
    (sum, payment) => sum + parseAmount(payment.amount),
    0
  );
  const layawayActionNeedsPayment =
    layawayActionDraft?.kind === "PAYMENT" ||
    (layawayActionDraft?.kind === "CANCEL" && layawayActionExpectedAmount > 0.005);
  const layawayActionPaymentInvalid =
    layawayActionDraft?.kind === "PAYMENT"
      ? layawayActionPaymentTotal <= 0 ||
        layawayActionPaymentTotal - layawayActionExpectedAmount > 0.005
      : layawayActionNeedsPayment &&
        Math.abs(layawayActionPaymentTotal - layawayActionExpectedAmount) > 0.005;
  const layawayActionMissingBankAccount = layawayActionPayments.some((payment) => {
    const tender = tenderForDraft(payment);
    return parseAmount(payment.amount) > 0 && Boolean(tender?.requiresBankAccount) && !payment.bankAccountId;
  });
  const layawayActionMissingReference = layawayActionPayments.some((payment) => {
    const tender = tenderForDraft(payment);
    return parseAmount(payment.amount) > 0 && Boolean(tender?.requiresReference) && !payment.reference.trim();
  });
  const layawayActionReasonMissing =
    layawayActionDraft?.kind === "RELEASE" && !layawayActionReason.trim();
  const canCheckout =
    basket.length > 0 &&
    hasOpenShift &&
    workspace.tenderMethods.length > 0 &&
    !isCheckingOut &&
    !missingBankAccountTender &&
    !missingReferenceTender &&
    !isTenderOverWithoutChange &&
    !storeCreditValidationMessage &&
    !loyaltyRedemptionValidationMessage &&
    !isTenderShort;
  const selectedCorrectionTransaction = correctionSelection
    ? workspace.recentTransactions.find((transaction) => transaction.transactionNo === correctionSelection.transactionNo) ?? null
    : null;
  const correctionReturnTotal =
    selectedCorrectionTransaction?.lines.reduce((sum, line) => {
      const quantity = parseAmount(returnQuantities[line.lineId] ?? "0");
      const unitReturnTotal = line.quantity > 0 ? line.lineTotal / line.quantity : 0;

      return sum + Math.max(0, Math.min(line.returnableQuantity, quantity)) * unitReturnTotal;
    }, 0) ?? 0;
  const exchangeProduct = workspace.products.find((product) => product.productId === exchangeProductId) ?? null;
  const exchangeReplacementTotal =
    correctionSelection?.correctionType === "EXCHANGE" && exchangeProduct
      ? parseAmount(exchangeQuantity) * exchangeProduct.price
      : 0;
  const correctionSettlementTotal =
    correctionSelection?.correctionType === "EXCHANGE"
      ? exchangeReplacementTotal - correctionReturnTotal
      : correctionReturnTotal;
  const correctionSettlementAbs = Math.abs(correctionSettlementTotal);
  const correctionRequiresManagerOverride =
    Boolean(correctionSelection) && correctionNote.trim().toUpperCase().startsWith("VOID");
  const basketRequiresManagerOverride = basket.some(
    (line) => !line.product.mustEnterPriceAtPos && roundMoney(line.unitPrice) !== roundMoney(line.product.price)
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(new Date()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (inventoryStartupAlertCheckedRef.current) {
      return;
    }

    inventoryStartupAlertCheckedRef.current = true;
    const hasLowStockAlerts =
      workspace.optionSettings.showCriticalStocksOnStartup && stockAlertRows.length > 0;
    const hasExpiringBatchAlerts =
      workspace.optionSettings.showExpiringBatchesOnStartup &&
      startupExpiringBatchRows.length > 0;

    setInventoryStartupAlertOpen(hasLowStockAlerts || hasExpiringBatchAlerts);
  }, [
    startupExpiringBatchRows.length,
    stockAlertRows.length,
    workspace.optionSettings.showCriticalStocksOnStartup,
    workspace.optionSettings.showExpiringBatchesOnStartup
  ]);

  useEffect(() => {
    setLocalReceiptLogoUrl(readStoredOnlineReceiptLogoUrl(workspace.store?.code));
  }, [workspace.store?.code]);

  useEffect(() => {
    const openFulfilmentOrderIds = new Set(
      salesOrders
        .filter((order) => order.isFulfilmentOrder && order.status === "OPEN")
        .map((order) => order.orderId)
    );

    setSelectedFulfilmentSalesOrderIds((current) =>
      current.filter((orderId) => openFulfilmentOrderIds.has(orderId))
    );
  }, [salesOrders]);

  useEffect(() => {
    setPaymentDrafts((drafts) =>
      drafts.length === 1
        ? [{ ...drafts[0], tenderMethodCode: drafts[0].tenderMethodCode || defaultTenderCode, amount: payableTotal.toFixed(2) }]
        : drafts
    );
  }, [defaultTenderCode, fulfillingSalesOrderId, payableTotal]);

  useEffect(() => {
    if (accountPaymentTenderCode && nonCreditTenderMethods.some((tender) => tender.tenderMethodCode === accountPaymentTenderCode)) {
      return;
    }

    setAccountPaymentTenderCode(nonCreditTenderMethods[0]?.tenderMethodCode ?? "");
  }, [accountPaymentTenderCode, nonCreditTenderMethods]);

  useEffect(() => {
    setCorrectionPayments((drafts) =>
      drafts.length === 1
        ? [
            {
              ...drafts[0],
              tenderMethodCode: drafts[0].tenderMethodCode || defaultTenderCode,
              amount: correctionSettlementAbs.toFixed(2)
            }
          ]
        : drafts
    );
  }, [correctionSettlementAbs, defaultTenderCode]);

  useEffect(() => {
    if (activeShift) {
      setShiftOpeningFloat(activeShift.openingFloatAmount.toFixed(2));
      setHasEditedShiftOpeningFloat(false);
      return;
    }

    if (!hasEditedShiftOpeningFloat && shiftOpeningFloat !== configuredShiftOpeningFloat) {
      setShiftOpeningFloat(configuredShiftOpeningFloat);
    }
  }, [activeShift, configuredShiftOpeningFloat, hasEditedShiftOpeningFloat, shiftOpeningFloat]);

  useEffect(() => {
    const nextLocationId =
      inventoryTab === "receiving" || inventoryTab === "transfers"
        ? defaultReceivingLocationId
        : defaultSalesLocationId;

    if (nextLocationId) {
      setInventoryLocationId(nextLocationId);
    }
  }, [defaultReceivingLocationId, defaultSalesLocationId, inventoryTab]);

  useEffect(() => {
    if (catalogCategory && !categories.includes(catalogCategory)) {
      setCatalogCategory("");
    }
  }, [catalogCategory, categories]);

  useEffect(() => {
    if (
      activeDrawer !== "details" ||
      transactionReferenceSearchDismissed ||
      transactionReference.trim().length < 2
    ) {
      setTransactionReferenceMatches([]);
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          query: transactionReference.trim(),
          limit: "8"
        });
        const response = await fetch(`/api/online-store/transaction-references?${params}`, {
          signal: controller.signal
        });
        const payload = (await response.json()) as
          | OnlineStoreTransactionReferenceSummary[]
          | { message?: string };

        if (!response.ok || !Array.isArray(payload)) {
          throw new Error(
            Array.isArray(payload)
              ? "Flash ERP could not search saved transaction references."
              : payload.message ?? "Flash ERP could not search saved transaction references."
          );
        }

        setTransactionReferenceMatches(payload);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Flash ERP online reference lookup failed.", error);
          setTransactionReferenceMatches([]);
        }
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [activeDrawer, transactionReference, transactionReferenceSearchDismissed]);

  useEffect(() => {
    if (!selectedSupplierReturnReceipt) {
      if (supplierReturnGoodsReceiptLineId) {
        setSupplierReturnGoodsReceiptLineId("");
      }
      return;
    }

    if (
      !supplierReturnGoodsReceiptLineId ||
      !selectedSupplierReturnReceipt.lines.some((line) => line.goodsReceiptLineId === supplierReturnGoodsReceiptLineId)
    ) {
      setSupplierReturnGoodsReceiptLineId(selectedSupplierReturnReceipt.lines[0]?.goodsReceiptLineId ?? "");
    }
  }, [selectedSupplierReturnReceipt, supplierReturnGoodsReceiptLineId]);

  function tenderForDraft(draft: PaymentDraft) {
    return workspace.tenderMethods.find((tender) => tender.tenderMethodCode === draft.tenderMethodCode) ?? workspace.tenderMethods[0] ?? null;
  }

  function paymentPayload(drafts: PaymentDraft[]) {
    return drafts
      .map((draft) => ({
        tenderMethodCode: draft.tenderMethodCode,
        bankAccountId: draft.bankAccountId || null,
        amount: parseAmount(draft.amount),
        reference: draft.reference.trim() || null
      }))
      .filter((draft) => draft.amount > 0);
  }

  function buildManagerOverridePayload() {
    const supervisorCode = managerOverrideCode.trim();
    const supervisorPassword = managerOverridePassword.trim();
    const note = managerOverrideNote.trim();

    return supervisorCode || supervisorPassword || note
      ? {
          supervisorCode,
          supervisorPassword,
          note: note || null
        }
      : null;
  }

  function handleShiftOpeningFloatChange(value: string) {
    setHasEditedShiftOpeningFloat(true);
    setShiftOpeningFloat(value);
  }

  function lockScreen() {
    setLockLoginId(workspace.operator.loginId);
    setLockPassword("");
    setLockMessage("");
    setIsScreenLocked(true);
  }

  async function unlockScreen() {
    setIsUnlocking(true);
    setLockMessage("Unlocking...");

    try {
      const response = await fetch("/api/online-store/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          loginId: lockLoginId,
          password: lockPassword
        })
      });
      const payload = (await response.json()) as Partial<OnlineStoreUnlockResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not unlock this online store.");
      }

      setLockPassword("");
      setLockMessage(payload.message ?? "Flash ERP unlocked the online store.");
      setIsScreenLocked(false);
      setActiveWorkspace("dashboard");
    } catch (error) {
      setLockMessage(error instanceof Error ? error.message : "Flash ERP could not unlock this online store.");
    } finally {
      setIsUnlocking(false);
    }
  }

  function renderReportParameter(parameterId: string) {
    const parameter = reportParameterById.get(parameterId);
    const label = parameter?.label ?? parameterId;
    const options = parameter?.options ?? [];

    if (parameterId === "dateFrom") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <input max={reportDateTo || undefined} onChange={(event) => setReportDateFrom(event.target.value)} type="date" value={reportDateFrom} />
        </label>
      );
    }

    if (parameterId === "dateTo") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <input min={reportDateFrom || undefined} onChange={(event) => setReportDateTo(event.target.value)} type="date" value={reportDateTo} />
        </label>
      );
    }

    if (parameterId === "scope") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <select onChange={(event) => setReportScope(event.target.value === "STORE" ? "STORE" : "CASHIER")} value={reportScope}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (parameterId === "cashierCode") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <select disabled={reportScope === "CASHIER"} onChange={(event) => setReportCashierCode(event.target.value)} value={reportCashierCode}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (parameterId === "shiftId") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <select onChange={(event) => setReportShiftId(event.target.value)} value={reportShiftId}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (parameterId === "tenderMethodCode") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <select onChange={(event) => setReportTenderMethodCode(event.target.value)} value={reportTenderMethodCode}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (parameterId === "locationId") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <select onChange={(event) => setReportLocationId(event.target.value)} value={reportLocationId}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }

    if (parameterId === "customerQuery") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <input onChange={(event) => setReportCustomerQuery(event.target.value)} placeholder={parameter?.placeholder ?? "Customer"} value={reportCustomerQuery} />
        </label>
      );
    }

    if (parameterId === "productQuery") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <input onChange={(event) => setReportProductQuery(event.target.value)} placeholder={parameter?.placeholder ?? "Product"} value={reportProductQuery} />
        </label>
      );
    }

    if (parameterId === "searchQuery") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <input onChange={(event) => setReportQuery(event.target.value)} placeholder={parameter?.placeholder ?? "Search"} value={reportQuery} />
        </label>
      );
    }

    if (parameterId === "limit") {
      return (
        <label key={parameterId}>
          <span>{label}</span>
          <input min="1" max="500" onChange={(event) => setReportLimit(event.target.value)} type="number" value={reportLimit} />
        </label>
      );
    }

    return null;
  }

  function updatePaymentDraft(
    setter: Dispatch<SetStateAction<PaymentDraft[]>>,
    draftId: string,
    patch: Partial<PaymentDraft>
  ) {
    setter((drafts) => drafts.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft)));
  }

  function addPaymentDraft(setter: Dispatch<SetStateAction<PaymentDraft[]>>) {
    setter((drafts) => [...drafts, createPaymentDraft(defaultTenderCode, "")]);
  }

  function removePaymentDraft(setter: Dispatch<SetStateAction<PaymentDraft[]>>, draftId: string) {
    setter((drafts) => (drafts.length <= 1 ? drafts : drafts.filter((draft) => draft.id !== draftId)));
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerQuery(`${customer.customerNo} · ${customer.fullName}`);
    setLoyaltyPointsToRedeem("0");
  }

  function activateSalesOrderMode() {
    setSaleMode("SALES_ORDER");
    setLayawayExpiresAt("");
    setLayawayPolicyOverrideApproved(false);

    const otherCustomer = customers.find(
      (customer) => customer.customerType.trim().toUpperCase() === "OTHER"
    );

    if (otherCustomer) {
      selectCustomer(otherCustomer);
      setCheckoutMessage(`Sales order mode loaded ${otherCustomer.fullName}.`);
    } else {
      setCheckoutMessage("Sales order mode is on, but no customer with type Other was found.");
    }
  }

  function activateLayawayMode() {
    if (!workspace.optionSettings.layawaySettings.enabled) {
      setCheckoutMessage("Layaway is not enabled in Company Settings.");
      return;
    }

    if (!workspace.capabilities.canCreateLayaway) {
      setCheckoutMessage("Your role is not allowed to create layaways.");
      return;
    }

    setSaleMode("LAYAWAY");
    setLayawayPolicyOverrideApproved(false);
    setCheckoutMessage(
      `Layaway mode is ready. Attach a registered customer and collect at least ${workspace.optionSettings.layawaySettings.minimumDepositPercent}% as the opening deposit.`
    );
  }

  function resetTransactionDetails() {
    setTransactionReference("");
    setTransactionServiceType("COMBO");
    setTransactionNote("");
    setTransactionReferenceMatches([]);
    setTransactionReferenceSearchDismissed(false);
    setActiveDrawer((drawer) => (drawer === "details" ? null : drawer));
  }

  function clearSaleScreen() {
    setBasket([]);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setSourceTransactionId(null);
    setFulfillingSalesOrderId(null);
    resetTransactionDetails();
    setLoyaltyPointsToRedeem("0");
    setSaleMode("SALE");
    setLayawayExpiresAt("");
    setLayawayPolicyOverrideApproved(false);
    setPaymentDrafts([createPaymentDraft(defaultTenderCode, "0.00")]);
  }

  async function refreshPendingSalesOrders() {
    try {
      const response = await fetch("/api/online-store/sales-orders", { cache: "no-store" });
      const payload = (await response.json()) as {
        salesOrders?: SalesOrder[];
        message?: string;
      };

      if (!response.ok || !payload.salesOrders) {
        throw new Error(payload.message ?? "Flash ERP could not refresh pending orders.");
      }

      setSalesOrders((current) => [
        ...payload.salesOrders!,
        ...current.filter((order) => order.status !== "OPEN")
      ]);
    } catch (error) {
      setCheckoutMessage(
        error instanceof Error ? error.message : "Flash ERP could not refresh pending orders."
      );
    }
  }

  function applyLocalReceiptLogo(receipt: Receipt): Receipt {
    return {
      ...receipt,
      companyLogoUrl:
        localReceiptLogoUrl ??
        receipt.companyLogoUrl ??
        workspace.branding.companyLogoUrl,
      salesReceiptTemplateHtml:
        receipt.salesReceiptTemplateHtml ?? workspace.store?.salesReceiptTemplateHtml ?? null
    };
  }

  function printSalesReceipt(receipt: Receipt) {
    const preparedReceipt = applyLocalReceiptLogo(receipt);

    setLastReceipt(preparedReceipt);
    openReceiptWindow(preparedReceipt);
  }

  function selectLocalReceiptLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const imageDataUrl = typeof reader.result === "string" ? reader.result : "";

      if (!imageDataUrl) {
        setReceiptLogoMessage("Flash ERP could not read that logo file.");
        return;
      }

      try {
        window.localStorage.setItem(
          getOnlineReceiptLogoStorageKey(workspace.store?.code),
          imageDataUrl
        );
      } catch {
        setReceiptLogoMessage("This browser could not store the receipt logo locally.");
        return;
      }

      setLocalReceiptLogoUrl(imageDataUrl);
      setReceiptLogoMessage("Receipt logo saved on this browser.");
    });
    reader.readAsDataURL(file);
  }

  function clearLocalReceiptLogo() {
    try {
      window.localStorage.removeItem(getOnlineReceiptLogoStorageKey(workspace.store?.code));
    } catch {
      // The receipt will still fall back to the enterprise logo if local storage is unavailable.
    }

    setLocalReceiptLogoUrl(null);
    setReceiptLogoMessage("Local receipt logo cleared.");
  }

  function basketPayload() {
    return basket.map((line) => ({
      productId: line.product.productId,
      quantity: line.quantity,
      sellingUnitOfMeasure: line.sellingUnitOfMeasure,
      unitPrice: line.unitPrice,
      configuredDiscountRate: resolveConfiguredPosDiscountRate(line.configuredDiscountRate),
      productVariantCode: line.productVariantCode,
      variantSize: line.variantSize,
      variantColor: line.variantColor,
      lineNote: line.lineNote,
      preferredBatchId: line.preferredBatchId
    }));
  }

  function transactionNotePayload() {
    return transactionNote.trim();
  }

  function loadStoredLines(lines: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    productVariantCode?: string | null;
    variantSize?: string | null;
    variantColor?: string | null;
    lineNote?: string | null;
    sellingUnitOfMeasure?: string | null;
    baseUnitOfMeasure?: string | null;
    uomConversionFactor?: number | null;
    baseQuantity?: number | null;
    discountAmount?: number | null;
    appliedPromotionName?: string | null;
    configuredDiscountRate?: number | null;
  }>) {
    const nextBasket = lines.flatMap((line) => {
      const product =
        workspace.inventoryProducts.find((item) => item.productId === line.productId) ??
        workspace.products.find((item) => item.productId === line.productId) ??
        null;

      if (!product) {
        return [];
      }

      const matrixVariant =
        line.productVariantCode && product.matrixVariants.length > 0
          ? product.matrixVariants.find((variant) => variant.code === line.productVariantCode)
          : null;
      const sellingUnit = resolveProductSellingUnit(
        product,
        matrixVariant?.code ?? line.productVariantCode ?? null,
        line.sellingUnitOfMeasure
      );
      const quantity = Math.max(0.001, line.quantity);
      const conversionFactor = Number(line.uomConversionFactor ?? sellingUnit.conversionFactor);

      return [
        {
          product,
          quantity,
          sellingUnitOfMeasure: line.sellingUnitOfMeasure ?? sellingUnit.unitOfMeasureCode,
          baseUnitOfMeasure: line.baseUnitOfMeasure ?? product.baseUnitOfMeasure,
          uomConversionFactor: conversionFactor,
          baseQuantity: Number(
            line.baseQuantity ?? calculatePosBaseQuantity(quantity, conversionFactor)
          ),
          unitPrice: line.unitPrice,
          configuredDiscountRate: inferConfiguredPosDiscountRate({
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            configuredDiscountRate: line.configuredDiscountRate,
            discountAmount: line.discountAmount,
            appliedPromotionName: line.appliedPromotionName
          }),
          productVariantCode: matrixVariant?.code ?? null,
          productVariantLabel: matrixVariant?.displayName ?? matrixVariant?.code ?? null,
          variantSize: line.variantSize ?? null,
          variantColor: line.variantColor ?? null,
          lineNote: line.lineNote ?? null,
          preferredBatchId: null
        }
      ];
    });

    setBasket(nextBasket);

    if (nextBasket.length !== lines.length) {
      setCheckoutMessage("Some saved lines could not be restored because their products are no longer active.");
    }

    return nextBasket.length > 0;
  }

  async function holdSale() {
    if (!basket.length) {
      setCheckoutMessage("Add at least one item before holding the sale.");
      return;
    }

    setIsPostingPosAction(true);
    setCheckoutMessage("Holding sale...");

    try {
      const response = await fetch("/api/online-store/held-sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customerId: selectedCustomer?.customerId ?? null,
          lines: basketPayload(),
          note: transactionNotePayload()
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreHeldSaleResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.heldSale) {
        throw new Error(payload.message ?? "Flash ERP could not hold this sale.");
      }

      setHeldSales((rows) => [payload.heldSale as HeldSale, ...rows.filter((row) => row.transactionId !== payload.heldSale?.transactionId)]);
      clearSaleScreen();
      setActiveDrawer("held");
      setCheckoutMessage(payload.message ?? `${payload.heldSale.transactionNo} was held.`);
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Flash ERP could not hold this sale.");
    } finally {
      setIsPostingPosAction(false);
    }
  }

  async function saveSalesOrder() {
    const orderLabel = saleMode === "LAYAWAY" ? "layaway" : "sales order";

    if (!basket.length) {
      setCheckoutMessage(`Add at least one item before saving the ${orderLabel}.`);
      return;
    }

    if (!selectedCustomer) {
      setCheckoutMessage(`Attach a customer before saving the ${orderLabel}.`);
      setActiveDrawer("details");
      return;
    }

    if (!hasOpenShift) {
      setCheckoutMessage(`Open a shift before saving the ${orderLabel}.`);
      return;
    }

    if (paymentTotal > 0.005 && nonCreditTenderMethods.length === 0) {
      setCheckoutMessage(`Configure at least one non-credit tender before taking a ${orderLabel} deposit.`);
      return;
    }

    if (salesOrderHasInvalidTender) {
      setCheckoutMessage(`Choose an active non-credit tender for each ${orderLabel} deposit row.`);
      return;
    }

    if (salesOrderDepositOver) {
      setCheckoutMessage(`A ${orderLabel} deposit cannot be greater than the order total.`);
      return;
    }

    if (
      saleMode === "LAYAWAY" &&
      layawayDepositShort &&
      !(workspace.capabilities.canOverrideLayawayPolicy && layawayPolicyOverrideApproved)
    ) {
      setCheckoutMessage(
        `The opening deposit must be at least ${formatMoney(layawayMinimumDepositAmount, currencyCode)}.`
      );
      return;
    }

    if (missingBankAccountTender) {
      setCheckoutMessage("Select the bank, branch, and account number for bank-backed deposit tenders.");
      return;
    }

    if (missingReferenceTender) {
      setCheckoutMessage("Enter the required deposit reference before saving the order.");
      return;
    }

    setIsPostingPosAction(true);
    setCheckoutMessage(`Saving ${orderLabel}...`);

    try {
      const payments = paymentPayload(paymentDrafts);
      const depositAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const firstPayment = payments[0] ?? null;
      const response = await fetch("/api/online-store/sales-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customerId: selectedCustomer.customerId,
          lines: basketPayload(),
          orderType: saleMode,
          payments,
          depositAmount,
          depositTenderMethodCode: depositAmount > 0 ? firstPayment?.tenderMethodCode ?? null : null,
          depositReference: depositAmount > 0 ? firstPayment?.reference ?? null : null,
          serviceType: transactionServiceType,
          note: transactionNotePayload(),
          layawayExpiresAt:
            saleMode === "LAYAWAY" && layawayExpiresAt
              ? new Date(layawayExpiresAt).toISOString()
              : null,
          policyOverrideApproved:
            saleMode === "LAYAWAY" && layawayPolicyOverrideApproved
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreSalesOrderResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.salesOrder) {
        throw new Error(payload.message ?? `Flash ERP could not save this ${orderLabel}.`);
      }

      setSalesOrders((rows) => [payload.salesOrder as SalesOrder, ...rows.filter((row) => row.orderId !== payload.salesOrder?.orderId)]);
      if (payload.receipt) {
        printSalesReceipt(payload.receipt);
      }
      clearSaleScreen();
      setActiveDrawer("orders");
      setCheckoutMessage(payload.message ?? `${payload.salesOrder.orderNo} was saved.`);
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : `Flash ERP could not save this ${orderLabel}.`);
    } finally {
      setIsPostingPosAction(false);
    }
  }

  function resumeHeldSale(heldSale: HeldSale) {
    if (!loadStoredLines(heldSale.lines)) {
      return;
    }

    const customer = heldSale.customerId
      ? customers.find((row) => row.customerId === heldSale.customerId) ?? null
      : null;

    setSelectedCustomer(customer);
    setCustomerQuery(customer ? `${customer.customerNo} · ${customer.fullName}` : "");
    setSourceTransactionId(heldSale.transactionId);
    setFulfillingSalesOrderId(null);
    setLoyaltyPointsToRedeem("0");
    setSaleMode("SALE");
    resetTransactionDetails();
    setActiveDrawer(null);
    setCheckoutMessage(`${heldSale.transactionNo} is ready for checkout.`);
  }

  function fulfilSalesOrder(order: SalesOrder) {
    if (order.isFulfilmentOrder) {
      setCheckoutMessage(`${order.orderNo} is routed for transfer-out to ${order.originStoreName}.`);
      return;
    }

    if (order.status !== "OPEN") {
      setCheckoutMessage(`${order.orderNo} is not open for fulfilment.`);
      return;
    }

    if (order.orderType === "LAYAWAY" && !workspace.capabilities.canFulfilLayaway) {
      setCheckoutMessage("Your role is not allowed to fulfil layaways.");
      return;
    }

    if (
      order.orderType === "LAYAWAY" &&
      order.layawayPolicy?.requireFullPaymentBeforeFulfilment !== false &&
      order.balanceAmount > 0.005
    ) {
      setCheckoutMessage(
        `${order.orderNo} still has a balance of ${formatMoney(order.balanceAmount, currencyCode)}.`
      );
      return;
    }

    if (!loadStoredLines(order.lines)) {
      return;
    }

    const customer = order.customerId
      ? customers.find((row) => row.customerId === order.customerId) ?? null
      : null;

    setSelectedCustomer(customer);
    setCustomerQuery(customer ? `${customer.customerNo} · ${customer.fullName}` : order.customerName);
    setSourceTransactionId(order.sourceTransactionId);
    setFulfillingSalesOrderId(order.orderId);
    // The payable amount is populated from the freshly repriced basket effect.
    setPaymentDrafts([createPaymentDraft(defaultTenderCode, "0.00")]);
    setLoyaltyPointsToRedeem("0");
    setSaleMode("SALE");
    resetTransactionDetails();
    setTransactionNote(order.note ?? "");
    setActiveDrawer(null);
    setCheckoutMessage(`${order.orderNo} is ready for fulfilment checkout.`);
  }

  async function createSalesOrderTransferOuts() {
    const salesOrderIds = selectedFulfilmentSalesOrders
      .filter((order) => order.isFulfilmentOrder && order.status === "OPEN")
      .map((order) => order.orderId);

    if (!salesOrderIds.length) {
      setCheckoutMessage("Select open sales orders from other shops before creating transfer-outs.");
      return;
    }

    setIsPostingPosAction(true);
    setCheckoutMessage("Creating transfer-outs...");

    try {
      const response = await fetch("/api/online-store/sales-orders/transfer-outs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          salesOrderIds,
          note: salesOrderTransferNote.trim() || null
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreSalesOrderFulfilmentTransferResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.createdBatches) {
        throw new Error(payload.message ?? "Flash ERP could not create transfer-outs for those sales orders.");
      }

      setSelectedFulfilmentSalesOrderIds([]);
      setSalesOrderTransferNote("");
      setActiveWorkspace("inventory");
      setInventoryTab("transfers");
      setActiveDrawer(null);
      setCheckoutMessage(payload.message ?? "Transfer-outs were created.");
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Flash ERP could not create transfer-outs for those sales orders.");
    } finally {
      setIsPostingPosAction(false);
    }
  }

  async function cancelSalesOrder(order: SalesOrder) {
    const confirmed = window.confirm(
      `Cancel sales order ${order.orderNo}? The order will be closed and can no longer be fulfilled.`
    );

    if (!confirmed) {
      return;
    }

    setIsPostingPosAction(true);
    setCheckoutMessage(`Cancelling ${order.orderNo}...`);

    try {
      const response = await fetch(`/api/online-store/sales-orders/${encodeURIComponent(order.orderId)}/cancel`, {
        method: "POST"
      });
      const payload = (await response.json()) as Partial<CancelOnlineStoreSalesOrderResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.orderId) {
        throw new Error(payload.message ?? "Flash ERP could not cancel this sales order.");
      }

      setSalesOrders((rows) =>
        rows.map((row) =>
          row.orderId === payload.orderId
            ? { ...row, status: payload.status ?? "CANCELLED", cancelledAt: new Date().toISOString() }
            : row
        )
      );

      if (fulfillingSalesOrderId === payload.orderId) {
        clearSaleScreen();
      }

      setCheckoutMessage(payload.message ?? `${order.orderNo} was cancelled.`);
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Flash ERP could not cancel this sales order.");
    } finally {
      setIsPostingPosAction(false);
    }
  }

  async function recordAccountPayment() {
    if (!selectedAccountPaymentCustomer) {
      setAccountPaymentMessage("Choose a customer before recording account payment.");
      return;
    }

    const requestedAmount = Number(accountPaymentAmount || selectedAccountPaymentCustomer.receivableBalanceAmount);

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      setAccountPaymentMessage("Enter a valid customer account payment amount.");
      return;
    }

    if (!accountPaymentTender) {
      setAccountPaymentMessage("Configure a non-credit tender before recording account payments.");
      return;
    }

    if (isStoreCreditTender(accountPaymentTender)) {
      setAccountPaymentMessage("Store Credit cannot be used to settle a customer receivable balance.");
      return;
    }

    if (requestedAmount > selectedAccountPaymentCustomer.receivableBalanceAmount + 0.0001) {
      setAccountPaymentMessage(`Flash ERP cannot collect more than ${selectedAccountPaymentCustomer.fullName}'s outstanding receivable balance.`);
      return;
    }

    if (accountPaymentTender?.requiresBankAccount && !accountPaymentBankAccountId) {
      setAccountPaymentMessage(`Select the bank, branch, and account number for ${accountPaymentTender.tenderMethodName}.`);
      return;
    }

    setIsPostingAccountPayment(true);
    setAccountPaymentMessage("Recording account payment...");

    try {
      const response = await fetch("/api/online-store/account-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customerId: selectedAccountPaymentCustomer.customerId,
          tenderMethodCode: accountPaymentTenderCode,
          bankAccountId: accountPaymentBankAccountId || null,
          amount: requestedAmount,
          reference: accountPaymentReference,
          note: accountPaymentNote
        })
      });
      const payload = (await response.json()) as Partial<RecordOnlineStoreAccountPaymentResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.accountPayment || !payload.receipt) {
        throw new Error(payload.message ?? "Flash ERP could not record this account payment.");
      }

      const accountPayment = payload.accountPayment;
      const accountPaymentReceipt: AccountPaymentReceipt = {
        ...payload.receipt,
        companyLogoUrl:
          localReceiptLogoUrl ??
          payload.receipt.companyLogoUrl ??
          workspace.branding.companyLogoUrl,
        accountPaymentReceiptTemplateHtml:
          payload.receipt.accountPaymentReceiptTemplateHtml ??
          workspace.store?.accountPaymentReceiptTemplateHtml ??
          defaultAccountPaymentReceiptTemplateHtml
      };

      setAccountPayments((rows) => [accountPayment, ...rows]);
      setCustomers((rows) =>
        rows.map((customer) =>
          customer.customerId === accountPayment.customerId
            ? {
                ...customer,
                receivableBalanceAmount: Math.max(0, customer.receivableBalanceAmount - accountPayment.amount)
              }
            : customer
        )
      );
      setSelectedCustomer((customer) =>
        customer?.customerId === accountPayment.customerId
          ? {
              ...customer,
              receivableBalanceAmount: Math.max(0, customer.receivableBalanceAmount - accountPayment.amount)
            }
          : customer
      );
      setAccountPaymentAmount("");
      setAccountPaymentReference("");
      setAccountPaymentNote("");
      setAccountPaymentMessage(payload.message ?? `${accountPayment.entryNo} was recorded.`);
      openAccountPaymentWindow(accountPaymentReceipt);
    } catch (error) {
      setAccountPaymentMessage(error instanceof Error ? error.message : "Flash ERP could not record this account payment.");
    } finally {
      setIsPostingAccountPayment(false);
    }
  }

  function openTransactionReceipt(transaction: OnlineStoreWorkspaceData["recentTransactions"][number]) {
    const receipt: Receipt = {
      retailOrgName: workspace.branding.tradingName,
      companyLogoUrl: workspace.branding.companyLogoUrl,
      storeCode: workspace.store?.code ?? "ONLINE",
      storeName: workspace.store?.name ?? "Online store",
      storePhone: workspace.store?.phone ?? null,
      storeLocation: workspace.store?.location ?? null,
      storeAddress: workspace.store?.addressLine1 ?? null,
      storeAddressLine2: workspace.store?.addressLine2 ?? null,
      transactionNo: transaction.transactionNo,
      transactionType: transaction.transactionType,
      completedAt: transaction.completedAt ?? new Date().toISOString(),
      terminalCode: "online-web",
      shiftNo: null,
      cashierCode: workspace.operator.loginId,
      currencyCode,
      timezone: workspace.store?.timezone ?? "Africa/Accra",
      receiptHeader: workspace.store?.receiptHeader ?? null,
      receiptFooter: workspace.store?.receiptFooter ?? null,
      salesReceiptTemplateHtml: workspace.store?.salesReceiptTemplateHtml ?? null,
      customerName: transaction.customerName,
      subtotalAmount: transaction.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
      discountAmount: transaction.lines.reduce((sum, line) => sum + line.discountAmount, 0),
      loyaltyRedemptionPoints: 0,
      loyaltyRedemptionAmount: 0,
      taxAmount: transaction.lines.reduce((sum, line) => sum + line.taxAmount, 0),
      totalAmount: transaction.totalAmount,
      paidAmount: transaction.payments.reduce((sum, payment) => sum + payment.amount, 0),
      changeAmount: 0,
      note: transaction.note,
      lines: transaction.lines.map((line) => ({
        productCode: line.productCode,
        productName: line.productName,
        variantSize: line.variantSize,
        variantColor: line.variantColor,
        lineNote: line.lineNote,
        quantity: line.quantity,
        sellingUnitOfMeasure: line.sellingUnitOfMeasure ?? line.baseUnitOfMeasure ?? "EA",
        baseUnitOfMeasure: line.baseUnitOfMeasure ?? line.sellingUnitOfMeasure ?? "EA",
        uomConversionFactor: line.uomConversionFactor,
        baseQuantity: line.baseQuantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        appliedPromotionName: line.appliedPromotionName
      })),
      payments: transaction.payments.map((payment) => ({
        method: payment.paymentMethod,
        tenderMethodCode: payment.tenderMethodCode,
        tenderMethodName: payment.tenderMethodName,
        amount: payment.amount,
        reference: payment.reference
      }))
    };

    printSalesReceipt(receipt);
  }

  function openSalesOrderReceipt(order: SalesOrder) {
    const lineSubtotal = roundMoney(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    const discountAmount = roundMoney(order.lines.reduce((sum, line) => sum + line.discountAmount, 0));
    const taxAmount = roundMoney(order.lines.reduce((sum, line) => sum + line.taxAmount, 0));
    const receipt: Receipt = {
      retailOrgName: workspace.branding.tradingName,
      companyLogoUrl: workspace.branding.companyLogoUrl,
      storeCode: workspace.store?.code ?? "ONLINE",
      storeName: workspace.store?.name ?? "Online store",
      storePhone: workspace.store?.phone ?? null,
      storeLocation: workspace.store?.location ?? null,
      storeAddress: workspace.store?.addressLine1 ?? null,
      storeAddressLine2: workspace.store?.addressLine2 ?? null,
      transactionNo: order.orderNo,
      transactionType: "SALES_ORDER",
      completedAt: order.createdAt,
      terminalCode: "online-web",
      shiftNo: null,
      cashierCode: order.operatorName ?? workspace.operator.loginId,
      currencyCode,
      timezone: workspace.store?.timezone ?? "Africa/Accra",
      receiptHeader: workspace.store?.receiptHeader ?? null,
      receiptFooter: workspace.store?.receiptFooter ?? null,
      salesReceiptTemplateHtml: workspace.store?.salesReceiptTemplateHtml ?? null,
      customerName: order.customerName,
      subtotalAmount: lineSubtotal,
      discountAmount,
      loyaltyRedemptionPoints: 0,
      loyaltyRedemptionAmount: 0,
      taxAmount,
      totalAmount: order.totalAmount,
      paidAmount: order.depositAmount,
      changeAmount: 0,
      note: order.note,
      lines: order.lines.map((line) => ({
        productCode: line.productCode,
        productName: line.productName,
        variantSize: line.variantSize,
        variantColor: line.variantColor,
        lineNote: line.lineNote,
        quantity: line.quantity,
        sellingUnitOfMeasure: line.sellingUnitOfMeasure ?? line.baseUnitOfMeasure ?? "EA",
        baseUnitOfMeasure: line.baseUnitOfMeasure ?? line.sellingUnitOfMeasure ?? "EA",
        uomConversionFactor: line.uomConversionFactor,
        baseQuantity: line.baseQuantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        appliedPromotionName: line.appliedPromotionName
      })),
      payments:
        order.depositAmount > 0
          ? [
              {
                method: order.depositPaymentMethod ?? "CASH",
                tenderMethodCode: order.depositTenderMethodCode,
                tenderMethodName: order.depositTenderMethodName,
                amount: order.depositAmount,
                reference: order.depositReference ?? `DEP-${order.orderNo}`
              }
            ]
          : []
    };

    printSalesReceipt(receipt);
  }

  function openAccountPaymentEntry(entry: AccountPayment) {
    openAccountPaymentWindow({
      entryNo: entry.entryNo,
      retailOrgName: workspace.branding.tradingName,
      companyLogoUrl: localReceiptLogoUrl ?? workspace.branding.companyLogoUrl,
      storeCode: workspace.store?.code ?? "ONLINE",
      storeName: workspace.store?.name ?? "Online store",
      storePhone: workspace.store?.phone ?? null,
      storeLocation: workspace.store?.location ?? null,
      storeAddress: workspace.store?.addressLine1 ?? null,
      storeAddressLine2: workspace.store?.addressLine2 ?? null,
      terminalCode: "online-web",
      shiftNo: null,
      customerNo: entry.customerNo,
      customerName: entry.customerName,
      cashierCode: workspace.operator.loginId,
      paymentMethod: "ACCOUNT_PAYMENT",
      tenderMethodName: null,
      amount: entry.amount,
      remainingBalanceAmount: null,
      reference: entry.reference,
      note: entry.note,
      occurredAt: entry.occurredAt,
      currencyCode,
      timezone: workspace.store?.timezone ?? "Africa/Accra",
      receiptHeader: workspace.store?.receiptHeader ?? null,
      receiptFooter: workspace.store?.receiptFooter ?? null,
      accountPaymentReceiptTemplateHtml:
        workspace.store?.accountPaymentReceiptTemplateHtml ?? defaultAccountPaymentReceiptTemplateHtml
    });
  }

  function beginCorrection(transactionNo: string, correctionType: "RETURN" | "EXCHANGE") {
    const transaction = workspace.recentTransactions.find((item) => item.transactionNo === transactionNo);
    const quantities: Record<string, string> = {};

    transaction?.lines.forEach((line, index) => {
      quantities[line.lineId] = index === 0 && line.returnableQuantity > 0 ? String(Math.min(1, line.returnableQuantity)) : "0";
    });

    setCorrectionSelection({ transactionNo, correctionType });
    setReturnQuantities(quantities);
    setExchangeProductId("");
    setExchangeQuantity("1");
    setCorrectionNote("");
    setCorrectionMessage("");
    setActiveWorkspace("reversals");
  }

  function beginVoid(transactionNo: string) {
    if (basket.length > 0 || openPriceDraft || sourceTransactionId || fulfillingSalesOrderId) {
      setCheckoutMessage("Complete, hold, or clear the active POS basket before voiding a receipt.");
      setActiveDrawer(null);
      setActiveWorkspace("pos");
      return;
    }

    const transaction = workspace.recentTransactions.find((item) => item.transactionNo === transactionNo);
    const quantities: Record<string, string> = {};

    transaction?.lines.forEach((line) => {
      quantities[line.lineId] = line.returnableQuantity > 0 ? String(line.returnableQuantity) : "0";
    });

    setCorrectionSelection({ transactionNo, correctionType: "RETURN" });
    setReturnQuantities(quantities);
    setExchangeProductId("");
    setExchangeQuantity("1");
    setCorrectionNote(`VOID ${transactionNo}`);
    setCorrectionMessage("Review and post the staged void return.");
    setActiveDrawer(null);
    setActiveWorkspace("reversals");
  }

  function printShiftReport(reportType: ShiftReportKind, shift: OnlineShift | null = currentShift) {
    if (!shift) {
      setCheckoutMessage("Open a shift before printing an X or Z report.");
      setActiveWorkspace("pos");
      return false;
    }

    openShiftReportWindow({
      reportType,
      workspace,
      shift,
      currencyCode,
      declaredCashAmount: reportType === "Z" ? declaredCloseCashAmount : shift.declaredCashAmount,
      varianceAmount: reportType === "Z" ? shiftCloseVariance : shift.varianceAmount
    });

    return true;
  }

  function requestCloseShift() {
    if (basket.length > 0 || openPriceDraft || sourceTransactionId || fulfillingSalesOrderId) {
      setCheckoutMessage("Complete, hold, or clear the active POS basket before closing the shift.");
      setActiveWorkspace("pos");
      return;
    }

    if (!currentShift) {
      setCheckoutMessage("Open a shift before running the closeout.");
      setActiveWorkspace("pos");
      return;
    }

    setSelectedEodShiftId(currentShift.shiftId);
    setEodDeclaredCash("0");
    setManagerMessage("");
    setShiftCloseDialogOpen(true);
  }

  async function loadActiveReport() {
    setIsLoadingReport(true);
    setReportMessage("Loading report...");

    try {
      const response = await fetch("/api/online-store/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reportId: activeReport,
          scope: reportScope,
          dateFrom: reportDateFrom || null,
          dateTo: reportDateTo || null,
          cashierCode: reportCashierCode || null,
          shiftId: reportShiftId || null,
          searchQuery: reportQuery || null,
          customerQuery: reportCustomerQuery || null,
          productQuery: reportProductQuery || null,
          tenderMethodCode: reportTenderMethodCode || null,
          locationId: reportLocationId || null,
          limit: Number(reportLimit) || 100,
          managerOverride: buildManagerOverridePayload()
        })
      });
      const payload = (await response.json()) as Partial<BrowseOnlineStoreReportsResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.reports || !payload.reporting) {
        throw new Error(payload.message ?? "Flash ERP could not load that report.");
      }

      const criteria = payload.reporting.lastCriteria;

      setReportResult(payload as BrowseOnlineStoreReportsResponse);
      setActiveReport(criteria.reportId ?? activeReport);
      setReportScope(criteria.scope === "STORE" ? "STORE" : "CASHIER");
      setReportDateFrom(criteria.dateFrom ?? "");
      setReportDateTo(criteria.dateTo ?? "");
      setReportCashierCode(criteria.cashierCode ?? "");
      setReportShiftId(criteria.shiftId ?? "");
      setReportQuery(criteria.searchQuery ?? "");
      setReportCustomerQuery(criteria.customerQuery ?? "");
      setReportProductQuery(criteria.productQuery ?? "");
      setReportTenderMethodCode(criteria.tenderMethodCode ?? "");
      setReportLocationId(criteria.locationId ?? "");
      setReportLimit(String(criteria.limit ?? 100));
      setManagerOverridePassword("");
      setReportMessage(`Loaded ${criteria.reportId} report.`);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Flash ERP could not load that report.");
    } finally {
      setIsLoadingReport(false);
    }
  }

  function exportActiveReport() {
    const baseName = `online-store-${activeReport}-${reportDateFrom || "start"}-${reportDateTo || "end"}.csv`;

    if (activeReport === "sales") {
      downloadCsv(baseName, [
        ["Receipt", "Type", "Customer", "Items", "Total", "Paid", "Cashier", "Completed"],
        ...reportSalesRows.map((row) => [
          row.transactionNo,
          row.transactionType,
          row.customerName,
          row.lineCount,
          row.totalAmount,
          row.paidAmount,
          row.cashierCode,
          row.completedAt
        ])
      ]);
      return;
    }

    if (activeReport === "products") {
      downloadCsv(baseName, [
        ["Product", "Code", "Selling unit", "Selling quantity", "Base unit", "Base quantity", "Gross", "Discount", "Tax", "Net"],
        ...reportProductRows.map((row) => [
          row.productName,
          row.productCode,
          row.sellingUnitOfMeasure,
          row.quantity,
          row.baseUnitOfMeasure,
          row.baseQuantity,
          row.grossAmount,
          row.discountAmount,
          row.taxAmount,
          row.netAmount
        ])
      ]);
      return;
    }

    if (activeReport === "orders") {
      downloadCsv(baseName, [
        ["Order", "Status", "Customer", "Total", "Deposit", "Balance", "Tender", "Reference", "Created", "Fulfilled"],
        ...reportSalesOrderRows.map((row) => [
          row.orderNo,
          row.status,
          row.customerName,
          row.totalAmount,
          row.depositAmount,
          row.balanceAmount,
          row.depositTenderMethodName ?? row.depositPaymentMethod,
          row.depositReference,
          row.createdAt,
          row.fulfilledAt
        ])
      ]);
      return;
    }

    if (activeReport === "layaways") {
      downloadCsv(baseName, [
        ["Layaway", "Status", "Customer", "Total", "Paid", "Outstanding", "Age days", "Ageing", "Reservation", "Reserved base qty", "Cancellation fee", "Refunded", "Created", "Expires"],
        ...reportLayawayRows.map((row) => [
          row.orderNo,
          row.status,
          row.customerName,
          row.totalAmount,
          row.paidAmount,
          row.balanceAmount,
          row.ageDays,
          row.ageingBucket,
          row.reservationStatus,
          row.reservedBaseQuantity,
          row.cancellationFeeAmount,
          row.refundedAmount,
          row.createdAt,
          row.expiresAt
        ])
      ]);
      return;
    }

    if (activeReport === "layawayPayments") {
      downloadCsv(baseName, [
        ["Layaway", "Customer", "Purpose", "Tender", "Amount", "Reference", "Shift", "Terminal", "Cashier", "Received"],
        ...reportLayawayPaymentRows.map((row) => [
          row.orderNo,
          row.customerName,
          row.paymentPurpose,
          row.tenderName,
          row.amount,
          row.reference,
          row.shiftNo,
          row.terminalCode,
          row.cashierCode,
          row.receivedAt
        ])
      ]);
      return;
    }

    if (activeReport === "tenders") {
      downloadCsv(baseName, [
        ["Tender", "Code", "Method", "Transactions", "Net"],
        ...reportTenderRows.map((row) => [
          row.tenderMethodName ?? row.paymentMethod,
          row.tenderMethodCode,
          row.paymentMethod,
          row.transactionCount,
          row.netAmount
        ])
      ]);
      return;
    }

    if (activeReport === "inventory") {
      downloadCsv(baseName, [
        ["Product", "Code", "Location", "On hand", "Value"],
        ...reportInventoryRows.map((row) => [
          row.productName,
          row.productCode,
          row.locationName,
          row.quantityOnHand,
          row.stockValue
        ])
      ]);
      return;
    }

    if (activeReport === "banking") {
      downloadCsv(baseName, [
        ["Deposit", "EOD", "Shift", "Bank", "Account", "Amount", "Reference", "Deposited"],
        ...reportBankingRows.map((row) => [
          row.depositNo,
          row.reconciliationNo,
          row.shiftNo,
          row.bankName,
          row.accountNumber,
          row.amount,
          row.reference,
          row.depositedAt
        ])
      ]);
      return;
    }

    downloadCsv(baseName, [
      ["Shift", "Status", "Transactions", "Expected", "Declared", "Variance", "Opened", "Closed"],
      ...reportShiftRows.map((row) => [
        row.shiftNo,
        row.status,
        row.transactionCount,
        row.expectedCashAmount,
        row.declaredCashAmount,
        row.varianceAmount,
        row.openedAt,
        row.closedAt
      ])
    ]);
  }

  function openActiveReportWindow() {
    const reportWindow = window.open("", "_blank", "width=1024,height=900");

    if (!reportWindow) {
      setReportMessage("Allow pop-ups to print the report.");
      return;
    }

    const reportTitle = activeReportDefinition?.label ?? activeReport.toUpperCase();
    const criteriaLabel = reportDateFrom === reportDateTo ? reportDateFrom : `${reportDateFrom} to ${reportDateTo}`;
    const table =
      activeReport === "sales"
        ? {
            headers: ["Receipt", "Type", "Customer", "Items", "Total", "Cashier"],
            rows: reportSalesRows.map((row) => [
              row.transactionNo,
              row.transactionType,
              row.customerName,
              String(row.lineCount),
              formatMoney(row.totalAmount, currencyCode),
              row.cashierCode
            ])
          }
          : activeReport === "products"
            ? {
                headers: ["Product", "Code", "Unit", "Qty", "Base qty", "Gross", "Tax", "Net"],
                rows: reportProductRows.map((row) => [
                  row.productName,
                  row.productCode,
                  row.sellingUnitOfMeasure,
                  formatNumber.format(row.quantity),
                  `${formatNumber.format(row.baseQuantity)} ${row.baseUnitOfMeasure}`,
                  formatMoney(row.grossAmount, currencyCode),
                  formatMoney(row.taxAmount, currencyCode),
                  formatMoney(row.netAmount, currencyCode)
                ])
              }
            : activeReport === "orders"
              ? {
                  headers: ["Order", "Status", "Customer", "Total", "Deposit", "Balance"],
                  rows: reportSalesOrderRows.map((row) => [
                    row.orderNo,
                    row.status,
                    row.customerName,
                    formatMoney(row.totalAmount, currencyCode),
                    formatMoney(row.depositAmount, currencyCode),
                    formatMoney(row.balanceAmount, currencyCode)
                  ])
                }
              : activeReport === "layaways"
                ? {
                    headers: ["Layaway", "Status", "Customer", "Outstanding", "Ageing", "Reservation", "Refunded"],
                    rows: reportLayawayRows.map((row) => [
                      row.orderNo,
                      row.status,
                      row.customerName,
                      formatMoney(row.balanceAmount, currencyCode),
                      `${row.ageingBucket} (${row.ageDays}d)`,
                      `${row.reservationStatus} / ${formatNumber.format(row.reservedBaseQuantity)} base`,
                      formatMoney(row.refundedAmount, currencyCode)
                    ])
                  }
                : activeReport === "layawayPayments"
                  ? {
                      headers: ["Layaway", "Purpose", "Tender", "Amount", "Shift", "Cashier", "Received"],
                      rows: reportLayawayPaymentRows.map((row) => [
                        row.orderNo,
                        row.paymentPurpose,
                        row.tenderName,
                        formatMoney(row.amount, currencyCode),
                        row.shiftNo ?? "-",
                        row.cashierCode ?? "-",
                        new Date(row.receivedAt).toLocaleString()
                      ])
                    }
                  : activeReport === "tenders"
                    ? {
                        headers: ["Tender", "Method", "Txn", "Net"],
                        rows: reportTenderRows.map((row) => [
                          row.tenderMethodName ?? row.paymentMethod,
                          row.paymentMethod,
                          String(row.transactionCount),
                          formatMoney(row.netAmount, currencyCode)
                        ])
                      }
            : activeReport === "inventory"
              ? {
                  headers: ["Product", "Code", "Location", "On hand", "Value"],
                  rows: reportInventoryRows.map((row) => [
                    row.productName,
                    row.productCode,
                    row.locationName,
                    formatNumber.format(row.quantityOnHand),
                    formatMoney(row.stockValue, currencyCode)
                  ])
                }
              : activeReport === "banking"
                ? {
                    headers: ["Deposit", "EOD", "Shift", "Bank", "Amount", "Reference"],
                    rows: reportBankingRows.map((row) => [
                      row.depositNo,
                      row.reconciliationNo,
                      row.shiftNo,
                      row.bankName ?? row.accountNumber ?? "Manual",
                      formatMoney(row.amount, currencyCode),
                      row.reference ?? ""
                    ])
                  }
                : {
                    headers: ["Shift", "Status", "Txn", "Expected", "Declared", "Variance"],
                    rows: reportShiftRows.map((row) => [
                      row.shiftNo,
                      row.status,
                      String(row.transactionCount),
                      formatMoney(row.expectedCashAmount, currencyCode),
                      row.declaredCashAmount === null ? "-" : formatMoney(row.declaredCashAmount, currencyCode),
                      row.varianceAmount === null ? "-" : formatMoney(row.varianceAmount, currencyCode)
                    ])
                  };
    const headerHtml = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const rowHtml = table.rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`)
      .join("");

    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html>
      <html>
        <head>
          <title>${escapeHtml(reportTitle)} • Flash ERP</title>
          <style>
            *{box-sizing:border-box} body{margin:0;background:#f5f7f5;color:#17211b;font-family:"Segoe UI",Arial,sans-serif}
            main{width:min(1040px,calc(100vw - 48px));margin:24px auto;background:#fff;padding:28px;box-shadow:0 18px 42px rgba(20,30,24,.16)}
            header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #17211b;padding-bottom:18px}
            h1{margin:0;font-size:24px} h2{margin:4px 0 0;color:#5b6c60;font-size:13px;text-transform:uppercase}
            table{width:100%;border-collapse:collapse;margin-top:22px} th{background:#245f84;color:#fff;padding:9px;text-align:left;font-size:12px;text-transform:uppercase}
            td{border-bottom:1px solid #e4ebe5;padding:10px 9px;vertical-align:top;font-size:13px}
            .actions{margin-top:18px;text-align:right} button{border:0;border-radius:8px;background:#245f84;color:#fff;padding:10px 16px;font-weight:800}
            @media print{body{background:#fff} main{width:auto;margin:0;box-shadow:none}.actions{display:none}}
          </style>
        </head>
        <body>
          <main>
            <header>
              <div><h1>${escapeHtml(reportTitle)}</h1><h2>${escapeHtml(workspace.store?.name ?? "Online store")} • ${escapeHtml(criteriaLabel)}</h2></div>
              <div><strong>${escapeHtml(workspace.operator.loginId)}</strong><br />${escapeHtml(new Date().toLocaleString())}</div>
            </header>
            <table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>
            <div class="actions"><button onclick="window.print()">Print report</button></div>
          </main>
        </body>
      </html>`);
    reportWindow.document.close();
    reportWindow.focus();
  }

  function addProduct(
    product: Product,
    quantity = 1,
    unitPrice?: number,
    productVariantCode?: string | null,
    variantSize?: string | null,
    variantColor?: string | null,
    lineNote?: string | null,
    preferredBatchId?: string | null,
    sellingUnitOfMeasure?: string | null
  ) {
    if (isRecalledBasket) {
      setCheckoutMessage("Complete or clear the recalled basket before adding new items.");
      return;
    }

    const normalizedQuantity = Math.max(0.001, Number(quantity) || 1);

    const matrixVariant =
      productVariantCode && product.matrixVariants.length > 0
        ? product.matrixVariants.find((variant) => variant.code === productVariantCode)
        : null;
    const selectedSellingUnit = resolveProductSellingUnit(
      product,
      matrixVariant?.code ?? productVariantCode ?? null,
      sellingUnitOfMeasure
    );
    const requiresMatrixSelection = product.productType === "MATRIX" && product.matrixVariants.length > 0;
    const requiresTrackedOptionSelection = !requiresMatrixSelection && (product.trackSize || product.trackColor);
    const requiresBatchSelection = product.trackExpiry && saleMode === "SALE";
    const requiresSellingUnitSelection = sellingUnitsForProduct(
      product,
      matrixVariant?.code ?? productVariantCode ?? null
    ).length > 0;
    const requiresLineOptions = product.mustEnterPriceAtPos || requiresMatrixSelection || requiresTrackedOptionSelection || requiresBatchSelection || requiresSellingUnitSelection;

    if (
      requiresLineOptions &&
      unitPrice === undefined &&
      (!productVariantCode || requiresBatchSelection || requiresSellingUnitSelection)
    ) {
      setOpenPriceDraft({
        product,
        quantity: normalizedQuantity.toFixed(3).replace(/\.?0+$/, ""),
        unitPrice: product.mustEnterPriceAtPos ? "" : selectedSellingUnit.unitPrice.toFixed(2),
        productVariantCode: matrixVariant?.code ?? "",
        sellingUnitOfMeasure: selectedSellingUnit.unitOfMeasureCode,
        variantSize: "",
        variantColor: "#111827",
        variantSearch: "",
        expressChargeSelected: false,
        expressChargeRate: "",
        lineNote: "",
        preferredBatchId: ""
      });
      return;
    }

    if (requiresMatrixSelection && !matrixVariant) {
      setCheckoutMessage(`Choose the product option for ${product.productName}.`);
      return;
    }

    let baseQuantity: number;

    try {
      baseQuantity = calculatePosBaseQuantity(
        normalizedQuantity,
        selectedSellingUnit.conversionFactor
      );
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Enter a valid selling quantity.");
      return;
    }

    if (
      saleMode === "SALE" &&
      matrixVariant &&
      baseQuantity > matrixVariant.quantityOnHand
    ) {
      setCheckoutMessage(`Only ${formatNumber.format(matrixVariant.quantityOnHand)} unit(s) of ${matrixVariant.displayName ?? matrixVariant.code} are available.`);
      return;
    }

    const normalizedUnitPrice =
      unitPrice === undefined
        ? selectedSellingUnit.unitPrice
        : Math.max(0, Number(unitPrice) || 0);
    const normalizedVariantSize = variantSize?.trim() ?? "";
    const normalizedVariantColor = variantColor?.trim() ?? "";
    const normalizedLineNote = lineNote?.trim() ?? "";
    const normalizedPreferredBatchId = preferredBatchId?.trim() ?? "";
    const matrixVariantLabel = matrixVariant
      ? (matrixVariant.displayName ??
          matrixVariant.attributes.map((attribute) => attribute.valueLabel).join(" / ")) ||
        matrixVariant.code
      : null;

    if (product.mustEnterPriceAtPos && normalizedUnitPrice <= 0) {
      setCheckoutMessage(`Enter a valid price before adding ${product.productName}.`);
      return;
    }

    setBasket((lines) => {
      const currentLine = lines.find(
        (line) =>
          line.product.productId === product.productId &&
          line.productVariantCode === (matrixVariant?.code ?? null) &&
          line.sellingUnitOfMeasure === selectedSellingUnit.unitOfMeasureCode &&
          line.variantSize === (normalizedVariantSize || null) &&
          line.variantColor === (normalizedVariantColor || null) &&
          line.lineNote === (normalizedLineNote || null) &&
          line.preferredBatchId === (normalizedPreferredBatchId || null)
      );

      if (currentLine) {
        return lines.map((line) =>
          line.product.productId === product.productId &&
          line.productVariantCode === (matrixVariant?.code ?? null) &&
          line.sellingUnitOfMeasure === selectedSellingUnit.unitOfMeasureCode &&
          line.variantSize === (normalizedVariantSize || null) &&
          line.variantColor === (normalizedVariantColor || null) &&
          line.lineNote === (normalizedLineNote || null) &&
          line.preferredBatchId === (normalizedPreferredBatchId || null)
            ? {
                ...line,
                quantity: line.quantity + normalizedQuantity,
                baseQuantity: calculatePosBaseQuantity(
                  line.quantity + normalizedQuantity,
                  line.uomConversionFactor
                ),
                unitPrice: normalizedUnitPrice
              }
            : line
        );
      }

      return [
        ...lines,
        {
          product,
          quantity: normalizedQuantity,
          sellingUnitOfMeasure: selectedSellingUnit.unitOfMeasureCode,
          baseUnitOfMeasure: product.baseUnitOfMeasure,
          uomConversionFactor: selectedSellingUnit.conversionFactor,
          baseQuantity,
          unitPrice: normalizedUnitPrice,
          configuredDiscountRate: null,
          productVariantCode: matrixVariant?.code ?? null,
          productVariantLabel: matrixVariantLabel,
          variantSize: normalizedVariantSize || null,
          variantColor: normalizedVariantColor || null,
          lineNote: normalizedLineNote || null,
          preferredBatchId: normalizedPreferredBatchId || null
        }
      ];
    });
    setSearchQuery("");
    setScanQuantity("1");
  }

  function addScannedItem() {
    const product = filteredProducts[0];

    if (!product) {
      setCheckoutMessage(
        saleMode !== "SALE"
          ? "No matching active catalog item was found for the scan/search value."
          : "No matching stocked item was found for the scan/search value."
      );
      return;
    }

    const scanValue = searchQuery.trim().toUpperCase();
    const scannedMatrixVariant =
      product.matrixVariants.find(
        (variant) =>
          variant.code.toUpperCase() === scanValue ||
          variant.sku?.toUpperCase() === scanValue ||
          variant.barcode?.toUpperCase() === scanValue
      ) ?? null;
    const scannedSellingUnit = product.sellingUnits.find(
      (sellingUnit) => sellingUnit.barcode?.toUpperCase() === scanValue
    ) ?? null;
    const sellingUnitVariant = scannedSellingUnit?.productVariantId
      ? product.matrixVariants.find(
          (variant) => variant.variantId === scannedSellingUnit.productVariantId
        ) ?? null
      : null;

    addProduct(
      product,
      parseAmount(scanQuantity) || 1,
      undefined,
      scannedMatrixVariant?.code ?? sellingUnitVariant?.code ?? null,
      null,
      null,
      null,
      null,
      scannedSellingUnit?.unitOfMeasureCode ?? null
    );
  }

  function submitOpenPriceDraft() {
    if (!openPriceDraft) {
      return;
    }

    const quantity = parseAmount(openPriceDraft.quantity);
    const unitPrice = parseAmount(openPriceDraft.unitPrice);

    if (quantity <= 0) {
      setCheckoutMessage("Enter a valid quantity before adding the open-price item.");
      return;
    }

    if (unitPrice <= 0) {
      setCheckoutMessage("Enter a valid unit price before adding the open-price item.");
      return;
    }

    if (openPriceBatchUnavailable) {
      setCheckoutMessage(
        `No active, non-expired batch is available for ${openPriceDraft.product.productName}.`
      );
      return;
    }

    if (
      openPriceDraft.preferredBatchId &&
      !openPriceAvailableBatches.some(
        (batch) => batch.batchId === openPriceDraft.preferredBatchId
      )
    ) {
      setCheckoutMessage("The selected batch is no longer available. Choose another batch.");
      return;
    }

    const draft = openPriceDraft;
    const isMatrixDraft = draft.product.productType === "MATRIX" && draft.product.matrixVariants.length > 0;
    const variantSize = !isMatrixDraft && draft.product.trackSize ? draft.variantSize.trim() || null : null;
    const variantColor = !isMatrixDraft && draft.product.trackColor ? draft.variantColor.trim() || null : null;
    const expressChargeEligible = draft.product.trackSize && draft.product.trackColor;
    const configuredExpressRate =
      expressChargeEligible && draft.expressChargeSelected
        ? resolveConfiguredPosExpressChargeRate(draft.expressChargeRate)
        : null;

    if (draft.expressChargeSelected && configuredExpressRate === null) {
      setCheckoutMessage("Choose a configured express charge rate before adding the item.");
      return;
    }

    const effectiveUnitPrice =
      configuredExpressRate === null
        ? unitPrice
        : roundMoney(unitPrice * (1 + configuredExpressRate / 100));
    const expressChargeNote =
      configuredExpressRate === null
        ? null
        : `Express charge ${formatDiscountRate(configuredExpressRate)}%`;
    const lineNote =
      [draft.lineNote.trim(), expressChargeNote]
        .filter((value): value is string => Boolean(value))
        .join(" | ") || null;

    setOpenPriceDraft(null);
    addProduct(
      draft.product,
      quantity,
      effectiveUnitPrice,
      draft.productVariantCode || null,
      variantSize,
      variantColor,
      lineNote,
      draft.preferredBatchId || null,
      draft.sellingUnitOfMeasure
    );
  }

  async function checkout() {
    if (!basket.length) {
      setCheckoutMessage("Add at least one item before payment.");
      return;
    }

    if (!workspace.tenderMethods.length) {
      setCheckoutMessage("Configure tender methods in HQ before taking browser POS payments.");
      return;
    }

    if (storeCreditValidationMessage) {
      setCheckoutMessage(storeCreditValidationMessage);
      return;
    }

    if (loyaltyRedemptionValidationMessage) {
      setCheckoutMessage(loyaltyRedemptionValidationMessage);
      return;
    }

    if (isTenderOverWithoutChange) {
      setCheckoutMessage("Over-tendered payments need a cash tender that allows change.");
      return;
    }

    setIsCheckingOut(true);
    setCheckoutMessage("Posting sale...");

    try {
      const completedSourceTransactionId = sourceTransactionId;
      const completedSalesOrderId = fulfillingSalesOrderId;
      const response = await fetch("/api/online-store/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customerId: selectedCustomer?.customerId ?? null,
          sourceTransactionId: completedSourceTransactionId,
          salesOrderId: completedSalesOrderId,
          lines: basketPayload(),
          payments: paymentPayload(paymentDrafts),
          loyaltyPointsRedeemed: loyaltyRedemption.appliedPoints,
          loyaltyRedemptionAmount,
          managerOverride: buildManagerOverridePayload(),
          reference: transactionReference.trim() || null,
          serviceType: transactionServiceType,
          note: transactionNotePayload(),
          details: transactionNote.trim() || null
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreSaleResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.receipt) {
        throw new Error(payload.message ?? "Flash ERP could not complete checkout.");
      }

      setBasket([]);
      setPaymentDrafts([createPaymentDraft(defaultTenderCode, "0.00")]);
      if (payload.customerAccount) {
        setCustomers((rows) =>
          rows.map((customer) =>
            customer.customerId === payload.customerAccount?.customerId
              ? {
                  ...customer,
                  receivableBalanceAmount: payload.customerAccount.receivableBalanceAmount,
                  loyaltyPointsBalance: payload.customerAccount.loyaltyPointsBalance
                }
              : customer
          )
        );
      }
      setSourceTransactionId(null);
      setFulfillingSalesOrderId(null);
      resetTransactionDetails();
      setManagerOverridePassword("");
      setLoyaltyPointsToRedeem("0");
      setSelectedCustomer(null);
      setCustomerQuery("");
      setSaleMode("SALE");
      if (completedSourceTransactionId) {
        setHeldSales((rows) => rows.filter((row) => row.transactionId !== completedSourceTransactionId));
      }
      if (completedSalesOrderId) {
        setSalesOrders((rows) =>
          rows.map((order) =>
            order.orderId === completedSalesOrderId
              ? {
                  ...order,
                  status: "FULFILLED",
                  fulfilledTransactionNo: payload.transactionNo ?? null,
                  fulfilledAt: new Date().toISOString()
                }
              : order
          )
        );
      }
      setCheckoutMessage(payload.message ?? `Posted ${payload.transactionNo}.`);
      printSalesReceipt(payload.receipt);
      router.refresh();
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : "Flash ERP could not complete checkout.");
    } finally {
      setIsCheckingOut(false);
    }
  }

  async function submitCorrection() {
    if (!correctionSelection || !selectedCorrectionTransaction) {
      setCorrectionMessage("Choose a receipt before posting a correction.");
      return;
    }

    const returnLines = selectedCorrectionTransaction.lines
      .map((line) => ({
        sourceLineId: line.lineId,
        quantity: Math.max(0, Math.min(line.returnableQuantity, parseAmount(returnQuantities[line.lineId] ?? "0")))
      }))
      .filter((line) => line.quantity > 0);

    if (!returnLines.length) {
      setCorrectionMessage("Enter a return quantity for at least one receipt line.");
      return;
    }

    const saleLines =
      correctionSelection.correctionType === "EXCHANGE" && exchangeProduct
        ? [
            {
              productId: exchangeProduct.productId,
              quantity: Math.max(0, parseAmount(exchangeQuantity)),
              unitPrice: exchangeProduct.price
            }
          ]
        : [];

    if (correctionSelection.correctionType === "EXCHANGE" && (!saleLines.length || saleLines[0].quantity <= 0)) {
      setCorrectionMessage("Add a replacement item before posting the exchange.");
      return;
    }

    if (correctionRequiresManagerOverride) {
      const confirmed = window.confirm(
        `Void receipt ${correctionSelection.transactionNo}? This will post the reviewed return, reverse the sale, and cannot be undone.`
      );

      if (!confirmed) {
        return;
      }
    }

    setIsPostingCorrection(true);
    setCorrectionMessage("Posting correction...");

    try {
      const response = await fetch("/api/online-store/corrections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceTransactionNo: correctionSelection.transactionNo,
          correctionType: correctionSelection.correctionType,
          returnLines,
          saleLines,
          payments: paymentPayload(correctionPayments),
          managerOverride: buildManagerOverridePayload(),
          note: correctionNote
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreCorrectionResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.receipt) {
        throw new Error(payload.message ?? "Flash ERP could not post that correction.");
      }

      setCorrectionSelection(null);
      setReturnQuantities({});
      setCorrectionPayments([createPaymentDraft(defaultTenderCode, "0.00")]);
      setManagerOverridePassword("");
      setCorrectionMessage(payload.message ?? `Posted ${payload.transactionNo}.`);
      printSalesReceipt(payload.receipt);
      router.refresh();
    } catch (error) {
      setCorrectionMessage(error instanceof Error ? error.message : "Flash ERP could not post that correction.");
    } finally {
      setIsPostingCorrection(false);
    }
  }

  async function recordEod() {
    if (basket.length > 0 || openPriceDraft || sourceTransactionId || fulfillingSalesOrderId) {
      setManagerMessage("Complete, hold, or clear the active POS basket before closing the shift.");
      setActiveWorkspace("pos");
      return;
    }

    setIsManagerPosting(true);
    setManagerMessage("Recording EOD...");

    try {
      const response = await fetch("/api/online-store/eod", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          shiftId: selectedEodShiftId || currentShift?.shiftId || null,
          declaredCashAmount: Number(eodDeclaredCash),
          note: eodNote
        })
      });
      const payload = (await response.json()) as Partial<RecordOnlineStoreEodResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not record EOD.");
      }

      const closedAt = new Date().toISOString();
      const closedShift = activeShift
        ? {
            ...activeShift,
            status: "CLOSED",
            closedAt,
            declaredCashAmount: Number(eodDeclaredCash),
            varianceAmount: payload.varianceAmount ?? activeShift.varianceAmount
          }
        : null;

      setManagerMessage(payload.message ?? `Recorded ${payload.reconciliationNo}.`);
      setShiftCloseDialogOpen(false);
      setEodDeclaredCash("0");
      setManagerOverridePassword("");
      setActiveShift(closedShift);

      if (closedShift) {
        openShiftReportWindow({
          reportType: "Z",
          workspace,
          shift: closedShift,
          currencyCode,
          declaredCashAmount: Number(eodDeclaredCash),
          varianceAmount: payload.varianceAmount ?? closedShift.varianceAmount
        });
      }

      setShiftOpeningFloat(configuredShiftOpeningFloat);
      setHasEditedShiftOpeningFloat(false);
      router.refresh();
    } catch (error) {
      setManagerMessage(error instanceof Error ? error.message : "Flash ERP could not record EOD.");
    } finally {
      setIsManagerPosting(false);
    }
  }

  async function openShift() {
    setIsOpeningShift(true);
    setManagerMessage("Opening shift...");

    try {
      const response = await fetch("/api/online-store/shifts/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          openingFloatAmount: Number(shiftOpeningFloat),
          managerOverride: buildManagerOverridePayload()
        })
      });
      const payload = (await response.json()) as Partial<OpenOnlineStoreShiftResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.shift) {
        throw new Error(payload.message ?? "Flash ERP could not open the shift.");
      }

      setActiveShift(payload.shift);
      setSelectedEodShiftId(payload.shift.shiftId);
      setEodDeclaredCash(payload.shift.expectedCashAmount.toFixed(2));
      setShiftOpeningFloat(payload.shift.openingFloatAmount.toFixed(2));
      setHasEditedShiftOpeningFloat(false);
      setManagerOverridePassword("");
      setManagerMessage(payload.message ?? `${payload.shift.shiftNo} opened.`);
      openShiftReportWindow({
        reportType: "X",
        workspace,
        shift: payload.shift,
        currencyCode
      });
      router.refresh();
    } catch (error) {
      setManagerMessage(error instanceof Error ? error.message : "Flash ERP could not open the shift.");
    } finally {
      setIsOpeningShift(false);
    }
  }

  async function recordBanking() {
    setIsManagerPosting(true);
    setManagerMessage("Recording banking...");

    try {
      const response = await fetch("/api/online-store/banking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reconciliationId: bankingReconciliationId,
          amount: Number(bankingAmount),
          bankAccountId: bankingBankAccountId || null,
          bankName: bankingBankName,
          reference: bankingReference,
          managerOverride: buildManagerOverridePayload()
        })
      });
      const payload = (await response.json()) as Partial<RecordOnlineStoreBankingResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not record banking.");
      }

      setManagerMessage(payload.message ?? `Recorded ${payload.depositNo}.`);
      setManagerOverridePassword("");
    } catch (error) {
      setManagerMessage(error instanceof Error ? error.message : "Flash ERP could not record banking.");
    } finally {
      setIsManagerPosting(false);
    }
  }

  async function postGoodsReceipt() {
    if (!inventoryProductId || !selectedInventoryProduct) {
      setInventoryMessage("Choose a product before posting the receipt.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage("Posting goods receipt...");

    try {
      const receivingLocationId = inventoryLocationId || defaultReceivingLocationId || null;
      const response = await fetch("/api/online-store/goods-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inventoryLocationId: receivingLocationId,
          note: receiptNote,
          lines: [
            {
              productId: inventoryProductId,
              quantity: Number(receiptQuantity),
              unitCost: receiptUnitCost ? Number(receiptUnitCost) : null,
              batchNo: selectedInventoryProduct?.trackExpiry ? receiptBatchNo : null,
              manufacturedAt: selectedInventoryProduct?.trackExpiry ? receiptManufacturedAt || null : null,
              expiryDate: selectedInventoryProduct?.trackExpiry ? receiptExpiryDate : null
            }
          ]
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreGoodsReceiptResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the goods receipt.");
      }

      setInventoryMessage(payload.message ?? `Posted ${payload.receiptNo}.`);
      setReceiptQuantity("1");
      setReceiptUnitCost("");
      setReceiptBatchNo("");
      setReceiptManufacturedAt("");
      setReceiptExpiryDate("");
      setReceiptNote("");
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not post the goods receipt.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function addOnlinePurchaseOrderLine() {
    const quantity = Number(purchaseOrderProductQuantity);
    const enteredUnitCost = purchaseOrderProductUnitCost.trim()
      ? Number(purchaseOrderProductUnitCost)
      : selectedPurchaseOrderProduct?.unitCost ?? null;

    if (!selectedPurchaseOrderProduct || !Number.isFinite(quantity) || quantity <= 0) {
      setInventoryMessage("Choose a product and enter a purchase order quantity greater than zero.");
      return;
    }

    if (enteredUnitCost !== null && (!Number.isFinite(enteredUnitCost) || enteredUnitCost < 0)) {
      setInventoryMessage("Purchase order unit cost must be zero or greater.");
      return;
    }

    setPurchaseOrderCreateLines((lines) => [
      ...lines.filter((line) => line.productCode !== selectedPurchaseOrderProduct.productCode),
      {
        id: `${selectedPurchaseOrderProduct.productCode}-${Date.now()}`,
        productCode: selectedPurchaseOrderProduct.productCode,
        productName: selectedPurchaseOrderProduct.productName,
        quantity,
        unitCost: enteredUnitCost
      }
    ]);
    setPurchaseOrderProductSearch("");
    setPurchaseOrderProductCode("");
    setPurchaseOrderProductQuantity("1");
    setPurchaseOrderProductUnitCost("");
    setInventoryMessage("");
  }

  async function createOnlinePurchaseOrder() {
    if (
      !purchaseOrderCreateLocationCode ||
      !purchaseOrderCreateSupplierNo ||
      purchaseOrderCreateLines.length === 0
    ) {
      setInventoryMessage("Choose a receiving location, supplier, and at least one product.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage("Creating purchase order...");

    try {
      const response = await fetch(
        `/api/inventory/locations/${encodeURIComponent(purchaseOrderCreateLocationCode)}/purchase-orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierNo: purchaseOrderCreateSupplierNo,
            externalReference: purchaseOrderCreateReference.trim() || null,
            note: purchaseOrderCreateNote.trim() || null,
            operatorName: "Online store",
            autoCommit: true,
            lines: purchaseOrderCreateLines.map((line) => ({
              productCode: line.productCode,
              quantity: line.quantity,
              unitCost: line.unitCost
            }))
          })
        }
      );
      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? payload.message ?? "Flash ERP could not create the purchase order.");
      }

      setPurchaseOrderCreateDialogOpen(false);
      setPurchaseOrderCreateReference("");
      setPurchaseOrderCreateNote("");
      setPurchaseOrderProductSearch("");
      setPurchaseOrderProductCode("");
      setPurchaseOrderCreateLines([]);
      setInventoryMessage(payload.message ?? "Purchase order created and committed.");
      router.refresh();
    } catch (error) {
      setInventoryMessage(
        error instanceof Error ? error.message : "Flash ERP could not create the purchase order."
      );
    } finally {
      setIsPostingInventory(false);
    }
  }

  function resolvePurchaseOrderReceiptLocationId(order: PurchaseOrderSummary) {
    return order.locationId || inventoryLocationId || defaultReceivingLocationId || null;
  }

  async function postPurchaseOrderReceipt(
    order: PurchaseOrderSummary,
    line: PurchaseOrderLine,
    serialNumbers: string[] = []
  ) {
    const quantity = line.isSerialized
      ? serialNumbers.length
      : Number(purchaseOrderReceiptQuantities[line.purchaseOrderLineId] ?? line.outstandingQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setInventoryMessage("Enter a purchase-order receipt quantity greater than zero.");
      return;
    }

    if (line.isSerialized && serialNumbers.length !== quantity) {
      setInventoryMessage(`Select ${formatNumber.format(line.outstandingQuantity)} serial number(s) before receiving ${line.productName}.`);
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(`Receiving ${line.productName} on ${order.purchaseOrderNo}...`);

    try {
      const response = await fetch("/api/online-store/goods-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inventoryLocationId: resolvePurchaseOrderReceiptLocationId(order),
          purchaseOrderId: order.purchaseOrderId,
          note: receiptNote,
          lines: [
            {
              productId: line.productId,
              purchaseOrderLineId: line.purchaseOrderLineId,
              quantity,
              unitCost: line.unitCost,
              serialNumbers: line.isSerialized ? serialNumbers : [],
              batchNo: line.trackExpiry ? purchaseOrderReceiptBatchNos[line.purchaseOrderLineId] ?? "" : null,
              manufacturedAt: line.trackExpiry
                ? purchaseOrderReceiptManufacturedDates[line.purchaseOrderLineId] || null
                : null,
              expiryDate: line.trackExpiry ? purchaseOrderReceiptExpiryDates[line.purchaseOrderLineId] ?? "" : null
            }
          ]
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreGoodsReceiptResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the purchase-order receipt.");
      }

      setPurchaseOrderReceiptQuantities((current) => ({
        ...current,
        [line.purchaseOrderLineId]: Math.max(0, line.outstandingQuantity - quantity).toString()
      }));
      setReceiptNote("");
      setPurchaseOrderReceiptBatchNos((current) => {
        const next = { ...current };
        delete next[line.purchaseOrderLineId];
        return next;
      });
      setPurchaseOrderReceiptManufacturedDates((current) => {
        const next = { ...current };
        delete next[line.purchaseOrderLineId];
        return next;
      });
      setPurchaseOrderReceiptExpiryDates((current) => {
        const next = { ...current };
        delete next[line.purchaseOrderLineId];
        return next;
      });
      setInventoryMessage(payload.message ?? `Posted ${payload.receiptNo}.`);
      setInventorySerialDraft(null);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not post the purchase-order receipt.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  async function postPurchaseOrderReceiptAll(order: PurchaseOrderSummary) {
    const receivableLines = order.lines.filter(
      (line) => line.outstandingQuantity > 0 && !line.isSerialized && !line.trackExpiry
    );

    if (!receivableLines.length) {
      setInventoryMessage("This purchase order has no standard outstanding lines to receive all. Serialized and expiry-controlled lines must be received individually.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(`Receiving all open lines on ${order.purchaseOrderNo}...`);

    try {
      const response = await fetch("/api/online-store/goods-receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inventoryLocationId: resolvePurchaseOrderReceiptLocationId(order),
          purchaseOrderId: order.purchaseOrderId,
          note: receiptNote,
          lines: receivableLines.map((line) => ({
            productId: line.productId,
            purchaseOrderLineId: line.purchaseOrderLineId,
            quantity: line.outstandingQuantity,
            unitCost: line.unitCost,
            serialNumbers: []
          }))
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreGoodsReceiptResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the purchase-order receipt.");
      }

      setPurchaseOrderReceiptQuantities((current) => {
        const next = { ...current };

        for (const line of receivableLines) {
          delete next[line.purchaseOrderLineId];
        }

        return next;
      });
      setReceiptNote("");
      setInventorySerialDraft(null);
      setInventoryMessage(payload.message ?? `Posted ${payload.receiptNo}.`);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not post the purchase-order receipt.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  async function postSupplierReturn(serialOverride?: string[]) {
    if (!selectedSupplierReturnReceipt || !selectedSupplierReturnLine) {
      setInventoryMessage("Select the original goods receipt and line before posting supplier return.");
      return;
    }

    const isSerialized = selectedSupplierReturnLine.serialNumbers.length > 0;
    const serialNumbers = serialOverride ?? selectedSupplierReturnSerials;

    if (isSerialized && !serialOverride) {
      openSupplierReturnSerialDialog();
      return;
    }

    const quantity = isSerialized ? serialNumbers.length : Number(supplierReturnQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setInventoryMessage("Enter a supplier return quantity greater than zero.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(`Posting supplier return for ${selectedSupplierReturnReceipt.receiptNo}...`);

    try {
      const response = await fetch("/api/online-store/supplier-returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          goodsReceiptId: selectedSupplierReturnReceipt.receiptId,
          goodsReceiptLineId: selectedSupplierReturnLine.goodsReceiptLineId,
          quantity,
          reason: supplierReturnReason,
          externalReference: supplierReturnExternalReference || null,
          note: supplierReturnNote || null,
          serialNumbers: isSerialized ? serialNumbers : []
        })
      });
      const payload = (await response.json()) as Partial<CreateOnlineStoreSupplierReturnResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not post the supplier return.");
      }

      setSupplierReturnQuantity("1");
      setSupplierReturnExternalReference("");
      setSupplierReturnNote("");
      setSupplierReturnSerialNumbers("");
      setInventorySerialDraft(null);
      setInventoryMessage(payload.message ?? `Posted ${payload.supplierReturnNo}.`);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not post the supplier return.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function openPurchaseOrderDialog(order: PurchaseOrderSummary, mode: Exclude<PurchaseOrderDialogMode, null>) {
    setSelectedPurchaseOrderId(order.purchaseOrderId);
    setDialogPurchaseOrderId(order.purchaseOrderId);
    setPurchaseOrderDialogMode(mode);
    setPurchaseOrderReceiptQuantities((current) => {
      const next = { ...current };

      for (const line of order.lines) {
        if (!line.isSerialized && line.outstandingQuantity > 0 && !next[line.purchaseOrderLineId]) {
          next[line.purchaseOrderLineId] = String(line.outstandingQuantity);
        }
      }

      return next;
    });
  }

  function selectSupplierReturnReceipt(receiptId: string) {
    const receipt = workspace.recentGoodsReceipts.find((entry) => entry.receiptId === receiptId) ?? null;

    setSupplierReturnGoodsReceiptId(receiptId);
    setSupplierReturnGoodsReceiptLineId(receipt?.lines[0]?.goodsReceiptLineId ?? "");
    setSupplierReturnQuantity("1");
    setSupplierReturnSerialNumbers("");
  }

  function addInventorySerialCandidates(candidates: string[]) {
    setInventorySerialDraft((draft) => {
      if (!draft) {
        return draft;
      }

      const availableKeys = new Map(
        draft.availableSerialNumbers.map((serialNumber) => [serialNumber.toUpperCase(), serialNumber])
      );
      const current = parseSerialDraft(draft.serialNumbers);
      const currentKeys = new Set(current.map((serialNumber) => serialNumber.toUpperCase()));
      const accepted: string[] = [];
      const rejected: string[] = [];

      for (const candidate of candidates.map((value) => value.trim()).filter(Boolean)) {
        const availableSerial = draft.availableSerialNumbers.length
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
          : `${accepted.length} serial number(s) added.`
      };
    });
  }

  function addInventorySerialRange() {
    const draft = inventorySerialDraft;

    if (!draft?.serialRangeStart.trim() || !draft.serialRangeEnd.trim()) {
      setInventorySerialDraft((current) =>
        current
          ? {
              ...current,
              message: "Enter range start and range end."
            }
          : current
      );
      return;
    }

    const expanded = expandSerialRange(draft.serialRangeStart, draft.serialRangeEnd);
    const candidates = draft.availableSerialNumbers.length
      ? (() => {
          const start = draft.serialRangeStart.trim().toUpperCase();
          const end = draft.serialRangeEnd.trim().toUpperCase();
          const [lower, upper] = start.localeCompare(end) <= 0 ? [start, end] : [end, start];

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

  function openPurchaseOrderSerialReceipt(order: PurchaseOrderSummary, line: PurchaseOrderLine) {
    setInventorySerialDraft({
      title: `Receive ${order.purchaseOrderNo}`,
      productName: line.productName,
      quantity: line.outstandingQuantity,
      availableSerialNumbers: [],
      serialNumbers: "",
      serialEntry: "",
      serialRangeStart: "",
      serialRangeEnd: "",
      message: "Enter or range-add the serials physically received for this GRN line.",
      submitLabel: "Receive serials",
      onSubmit: async (serialNumbers) => {
        await postPurchaseOrderReceipt(order, line, serialNumbers);
      }
    });
  }

  function openSupplierReturnSerialDialog() {
    if (!selectedSupplierReturnReceipt || !selectedSupplierReturnLine) {
      setInventoryMessage("Select the original goods receipt and line before posting supplier return.");
      return;
    }

    setInventorySerialDraft({
      title: `Return ${selectedSupplierReturnReceipt.receiptNo}`,
      productName: selectedSupplierReturnLine.productName,
      quantity: selectedSupplierReturnLine.serialNumbers.length,
      availableSerialNumbers: selectedSupplierReturnLine.serialNumbers,
      serialNumbers: supplierReturnSerialNumbers,
      serialEntry: "",
      serialRangeStart: "",
      serialRangeEnd: "",
      message: "Select the exact received serial numbers being returned to the supplier.",
      submitLabel: "Post supplier return",
      requireExactQuantity: false,
      onSubmit: async (serialNumbers) => {
        setSupplierReturnSerialNumbers(serialNumbers.join("\n"));
        await postSupplierReturn(serialNumbers);
      }
    });
  }

  function openGoodsReceiptWindow(receipt: GoodsReceiptSummary) {
    const receiptWindow = window.open("", "_blank", "width=1024,height=900");

    if (!receiptWindow) {
      setInventoryMessage("Allow pop-ups to print the goods receipt.");
      return;
    }

    receiptWindow.document.open();
    receiptWindow.document.write(
      buildGoodsReceiptWindowHtml({
        receipt,
        storeName: workspace.store?.name ?? "Online store",
        currencyCode
      })
    );
    receiptWindow.document.close();
    receiptWindow.focus();
  }

  function openTransferDocumentWindow(transfer: TransferDocumentGroup) {
    const transferWindow = window.open("", "_blank", "width=1024,height=900");

    if (!transferWindow) {
      setInventoryMessage("Allow pop-ups to print the transfer document.");
      return;
    }

    transferWindow.document.open();
    transferWindow.document.write(
      buildTransferDocumentWindowHtml({
        transfer,
        storeName: workspace.store?.name ?? "Online store",
        companyLogoUrl: localReceiptLogoUrl ?? workspace.branding.companyLogoUrl
      })
    );
    transferWindow.document.close();
    transferWindow.focus();
  }

  async function lookupRemoteInventory() {
    setIsLoadingRemoteInventory(true);
    setInventoryMessage("Searching HQ inventory...");

    try {
      const response = await fetch("/api/online-store/inventory-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: remoteInventoryQuery.trim() || null,
          productCode: remoteInventoryItemFilter || null,
          storeCode: remoteInventoryStoreFilter || null,
          locationCode: null,
          limit: 30
        })
      });
      const payload = (await response.json()) as Partial<OnlineStoreRemoteInventoryLookupResponse> & {
        message?: string;
      };

      if (!response.ok || !payload.rows) {
        throw new Error(payload.message ?? "Flash ERP could not load remote inventory.");
      }

      setRemoteInventoryRows(payload.rows);
      setSelectedRemoteInventoryKeys(new Set());
      setInventoryMessage(
        payload.rows.length
          ? `Found ${payload.rows.length} HQ stock position(s) in other stores.`
          : "No matching stock was found in other stores."
      );
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not load remote inventory.");
    } finally {
      setIsLoadingRemoteInventory(false);
    }
  }

  function resetTransferRequestDraft() {
    setActiveTransferDraftBatchNo("");
    setTransferRequestLines([]);
    setTransferReference("");
    setTransferRequiredDate(activeDate);
    setTransferDeliveryNoteNo("");
    setTransferTransporterName("");
    setTransferVehicleRegistrationNo("");
    setTransferDriverName("");
    setTransferDriverContact("");
    setTransferQuantity("1");
    setTransferUnitOfMeasure("");
    setTransferNote("");
    setActiveTransferEntryTab("header");
  }

  function openNewTransferRequest() {
    resetTransferRequestDraft();
    setTransferRequestDialogOpen(true);
  }

  function openTransferRequestDraft(transfer: TransferDocumentGroup) {
    const firstLine = transfer.lines[0];
    const sourceStore = workspace.transferStores.find(
      (store) => store.storeCode === firstLine?.sourceStoreCode
    );

    if (!firstLine || !sourceStore) {
      setInventoryMessage("Flash ERP could not load that transfer request draft for amendment.");
      return;
    }

    setActiveTransferDraftBatchNo(transfer.documentNo);
    setTransferSourceStoreId(sourceStore.storeId);
    setTransferDestinationLocationId(firstLine.destinationLocationId);
    setTransferReference(firstLine.externalReference ?? "");
    setTransferRequiredDate(firstLine.requiredAt?.slice(0, 10) ?? activeDate);
    setTransferDeliveryNoteNo(firstLine.deliveryNoteNo ?? "");
    setTransferTransporterName(firstLine.transporterName ?? "");
    setTransferVehicleRegistrationNo(firstLine.vehicleRegistrationNo ?? "");
    setTransferDriverName(firstLine.driverName ?? "");
    setTransferDriverContact(firstLine.driverContact ?? "");
    setTransferNote(firstLine.requestNote ?? "");
    setTransferRequestLines(
      transfer.lines.map((line) => ({
        id: line.transferId,
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        quantity: line.requestedUnitQuantity,
        unitOfMeasure: line.requestedUnitOfMeasure,
        baseQuantity: line.requestedQuantity,
        baseUnitOfMeasure: line.baseUnitOfMeasure
      }))
    );
    setActiveTransferEntryTab("details");
    setTransferRequestDialogOpen(true);
  }

  function getRemoteRequestEligibility(row: RemoteInventoryRow) {
    const sourceStore = workspace.transferStores.find(
      (store) => store.storeCode === row.storeCode
    );
    const product = workspace.inventoryProducts.find(
      (item) => item.productCode === row.productCode
    );
    const selectedSource = remoteInventoryRows.find((candidate) =>
      selectedRemoteInventoryKeys.has(getRemoteInventoryRowKey(candidate))
    );

    if (!selectedTransferDestinationLocation) {
      return { eligible: false, reason: "Choose the destination location first." };
    }

    if (!sourceStore) {
      return {
        eligible: false,
        reason: "This shop is not available as a transfer source."
      };
    }

    if (!product) {
      return {
        eligible: false,
        reason: "This tracked product is not available in the store catalog."
      };
    }

    if (row.quantityOnHand <= 0) {
      return { eligible: false, reason: "No stock is available in this shop." };
    }

    if (
      selectedSource &&
      selectedSource.storeCode !== row.storeCode
    ) {
      return {
        eligible: false,
        reason: "One request can contain many items from one source shop."
      };
    }

    return { eligible: true, reason: "Available for this request." };
  }

  function toggleRemoteInventorySelection(row: RemoteInventoryRow) {
    const rowKey = getRemoteInventoryRowKey(row);
    const selected = selectedRemoteInventoryKeys.has(rowKey);

    if (!selected) {
      const eligibility = getRemoteRequestEligibility(row);
      if (!eligibility.eligible) {
        setInventoryMessage(eligibility.reason);
        return;
      }
    }

    setSelectedRemoteInventoryKeys((current) => {
      const next = new Set(current);
      if (selected) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  }

  function buildTransferDraftFromRemoteSelection() {
    const selectedRows = remoteInventoryRows.filter((row) =>
      selectedRemoteInventoryKeys.has(getRemoteInventoryRowKey(row))
    );
    const source = selectedRows[0];
    const sourceStore = workspace.transferStores.find(
      (store) => store.storeCode === source?.storeCode
    );

    if (!source || !sourceStore) {
      setInventoryMessage("Select at least one eligible stock row before building the request.");
      return;
    }

    resetTransferRequestDraft();
    setTransferSourceStoreId(sourceStore.storeId);
    setTransferRequestLines(
      selectedRows.map((row) => {
        const product = workspace.inventoryProducts.find(
          (item) => item.productCode === row.productCode
        )!;
        return {
          id: getRemoteInventoryRowKey(row),
          productId: product.productId,
          productCode: product.productCode,
          productName: product.productName,
          quantity: 1,
          unitOfMeasure: product.baseUnitOfMeasure,
          baseQuantity: 1,
          baseUnitOfMeasure: product.baseUnitOfMeasure
        };
      })
    );
    setSelectedRemoteInventoryKeys(new Set());
    setRemoteLookupOpen(false);
    setInventoryTab("transfers");
    setTransferRequestDialogOpen(true);
    setActiveTransferEntryTab("details");
  }

  function addTransferRequestLine() {
    const quantity = Number(transferQuantity);

    if (!selectedInventoryProduct) {
      setInventoryMessage("Choose an item before adding a transfer request line.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setInventoryMessage("Enter a transfer quantity greater than zero.");
      return;
    }

    setTransferRequestLines((lines) => [
      ...lines.filter((line) => line.productId !== selectedInventoryProduct.productId),
      {
        id: `${selectedInventoryProduct.productId}-${Date.now()}`,
        productId: selectedInventoryProduct.productId,
        productCode: selectedInventoryProduct.productCode,
        productName: selectedInventoryProduct.productName,
        quantity,
        unitOfMeasure:
          transferUnitOfMeasure || selectedInventoryProduct.baseUnitOfMeasure,
        baseQuantity: Number(
          (
            quantity *
            (selectedInventoryProduct.uomConversions.find(
              (unit) =>
                unit.uomCode ===
                (transferUnitOfMeasure ||
                  selectedInventoryProduct.baseUnitOfMeasure)
            )?.conversionFactor ?? 1)
          ).toFixed(3)
        ),
        baseUnitOfMeasure: selectedInventoryProduct.baseUnitOfMeasure
      }
    ]);
    setInventoryProductId("");
    setTransferUnitOfMeasure("");
    setTransferQuantity("1");
  }

  async function postTransferRequest() {
    const inlineQuantity = Number(transferQuantity);
    const lines =
      transferRequestLines.length > 0
        ? transferRequestLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitOfMeasure: line.unitOfMeasure
          }))
        : inventoryProductId && Number.isFinite(inlineQuantity) && inlineQuantity > 0
          ? [{ productId: inventoryProductId, quantity: inlineQuantity }]
          : [];

    if (!transferSourceStoreId || !selectedTransferDestinationLocation || !lines.length) {
      setInventoryMessage("Choose source, destination, and at least one item before requesting transfer.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(
      activeTransferDraftBatchNo
        ? "Updating transfer request draft..."
        : "Saving transfer request draft..."
    );

    try {
      const response = await fetch(
        activeTransferDraftBatchNo
          ? `/api/online-store/transfers/${encodeURIComponent(activeTransferDraftBatchNo)}`
          : "/api/online-store/transfers",
        {
        method: activeTransferDraftBatchNo ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceStoreId: transferSourceStoreId,
          destinationInventoryLocationId: selectedTransferDestinationLocation.locationId,
          lines,
          externalReference: transferReference,
          requiredAt: transferRequiredDate,
          deliveryNoteNo: transferDeliveryNoteNo,
          transporterName: transferTransporterName,
          vehicleRegistrationNo: transferVehicleRegistrationNo,
          driverName: transferDriverName,
          driverContact: transferDriverContact,
          note: transferNote
        })
        }
      );
      const payload = (await response.json()) as Partial<CreateOnlineStoreTransferResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not create the transfer request.");
      }

      setInventoryMessage(payload.message ?? `Saved ${payload.transferNo}.`);
      resetTransferRequestDraft();
      setTransferRequestDialogOpen(false);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not create the transfer request.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function estimateLayawayRefund(order: SalesOrder) {
    const policy = order.layawayPolicy;

    if (!policy?.refundPaymentsOnCancellation) {
      return 0;
    }

    const fee =
      policy.cancellationFeeType === "PERCENTAGE"
        ? order.paidAmount * (policy.cancellationFeeValue / 100)
        : policy.cancellationFeeValue;

    return roundMoney(Math.max(0, order.paidAmount - Math.min(order.paidAmount, fee)));
  }

  function openLayawayAction(kind: LayawayActionKind, order: SalesOrder) {
    const amount =
      kind === "PAYMENT"
        ? order.balanceAmount
        : kind === "CANCEL"
          ? estimateLayawayRefund(order)
          : 0;

    setLayawayActionDraft({ kind, order });
    setLayawayActionReason("");
    setLayawayActionPayments(
      amount > 0 ? [createPaymentDraft(defaultTenderCode, amount.toFixed(2))] : []
    );
  }

  async function submitLayawayAction() {
    if (!layawayActionDraft) {
      return;
    }

    const { kind, order } = layawayActionDraft;

    if (kind === "RELEASE") {
      const confirmed = window.confirm(
        `Release the reserved stock for layaway ${order.orderNo}? The stock will become available for other sales while the layaway remains open.`
      );

      if (!confirmed) {
        return;
      }
    } else if (kind === "CANCEL") {
      const confirmed = window.confirm(
        `Cancel layaway ${order.orderNo}? This will close the layaway, release its stock, and process the configured refund and cancellation fee. This cannot be undone.`
      );

      if (!confirmed) {
        return;
      }
    } else if (kind === "EXPIRE") {
      const confirmed = window.confirm(
        `Expire layaway ${order.orderNo}? This will mark the layaway as expired and release its reserved stock.`
      );

      if (!confirmed) {
        return;
      }
    }

    const payments = paymentPayload(layawayActionPayments);
    const endpointAction =
      kind === "PAYMENT"
        ? "payments"
        : kind === "RELEASE"
          ? "release"
          : kind === "EXPIRE"
            ? "expire"
            : "cancel";

    setIsPostingPosAction(true);
    setCheckoutMessage(
      kind === "PAYMENT"
        ? `Receiving payment for ${order.orderNo}...`
        : `${kind === "CANCEL" ? "Cancelling" : kind === "RELEASE" ? "Releasing stock for" : "Expiring"} ${order.orderNo}...`
    );

    try {
      const response = await fetch(
        `/api/online-store/sales-orders/${encodeURIComponent(order.orderId)}/${endpointAction}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "PAYMENT"
              ? { payments, note: layawayActionReason.trim() || null }
              : kind === "CANCEL"
                ? {
                    refundPayments: payments,
                    note: layawayActionReason.trim() || "Layaway cancelled from the online POS queue."
                  }
                : { reason: layawayActionReason.trim() || null }
          )
        }
      );
      const payload = (await response.json()) as Partial<OnlineStoreLayawayActionResponse> & {
        salesOrder?: SalesOrder;
        message?: string;
      };

      if (!response.ok || !payload.salesOrder) {
        throw new Error(payload.message ?? `Flash ERP could not complete the ${kind.toLowerCase()} action.`);
      }

      setSalesOrders((rows) =>
        rows.map((row) => (row.orderId === payload.salesOrder?.orderId ? payload.salesOrder as SalesOrder : row))
      );
      setLayawayActionDraft(null);
      setLayawayActionPayments([]);
      setLayawayActionReason("");
      setCheckoutMessage(payload.message ?? `${order.orderNo} was updated.`);
      router.refresh();
    } catch (error) {
      setCheckoutMessage(
        error instanceof Error ? error.message : `Flash ERP could not complete the ${kind.toLowerCase()} action.`
      );
    } finally {
      setIsPostingPosAction(false);
    }
  }

  async function sendTransferRequestDraft(transferBatchNo: string) {
    setIsPostingInventory(true);
    setInventoryMessage(`Sending ${transferBatchNo}...`);

    try {
      const response = await fetch(
        `/api/online-store/transfers/${encodeURIComponent(transferBatchNo)}/send`,
        { method: "POST" }
      );
      const payload = (await response.json()) as Partial<CreateOnlineStoreTransferResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not send the transfer request.");
      }

      setInventoryMessage(payload.message ?? `${transferBatchNo} was sent.`);
      router.refresh();
    } catch (error) {
      setInventoryMessage(
        error instanceof Error ? error.message : "Flash ERP could not send the transfer request."
      );
    } finally {
      setIsPostingInventory(false);
    }
  }

  async function processTransferAction(
    transfer: TransferRequest,
    action: "issue" | "receive",
    serialNumbers: string[] = []
  ) {
    const outstandingQuantity =
      action === "issue" ? transfer.outstandingIssueQuantity : transfer.outstandingReceiptQuantity;
    const quantity = Number(transferReceiptQuantities[transfer.transferId] ?? outstandingQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setInventoryMessage("Enter a transfer quantity greater than zero.");
      return;
    }

    if (action === "issue" && !transferIssueLocationId) {
      setInventoryMessage("Choose the dispatch location before issuing stock.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(`${action === "issue" ? "Issuing" : "Receiving"} ${transfer.transferNo}...`);

    try {
      const response = await fetch(`/api/online-store/transfers/${encodeURIComponent(transfer.transferId)}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          quantity,
          serialNumbers,
          ...(action === "issue"
            ? {
                sourceInventoryLocationId: transferIssueLocationId,
                transporterName: selectedTransferDocument?.transporterName ?? null,
                vehicleRegistrationNo: selectedTransferDocument?.vehicleRegistrationNo ?? null,
                driverName: selectedTransferDocument?.driverName ?? null,
                driverContact: selectedTransferDocument?.driverContact ?? null,
                deliveryNoteNo: selectedTransferDocument?.deliveryNoteNo ?? null
              }
            : {}),
          note: transferActionNote || null
        })
      });
      const payload = (await response.json()) as Partial<ProcessOnlineStoreTransferResponse> & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not process that transfer.");
      }

      setInventoryMessage(payload.message ?? `${transfer.transferNo} updated.`);
      setTransferActionNote("");
      setTransferReceiptQuantities((current) => {
        const next = { ...current };
        delete next[transfer.transferId];
        return next;
      });
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not process that transfer.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  async function processTransferDocumentActionAll(
    transferDocument: TransferDocumentGroup,
    action: "issue" | "receive"
  ) {
    const actionLines = transferDocument.lines.filter((transfer) =>
      action === "issue"
        ? transfer.role === "SOURCE" && transfer.outstandingIssueQuantity > 0 && !transfer.isSerialized
        : transfer.role === "DESTINATION" && transfer.outstandingReceiptQuantity > 0 && !transfer.isSerialized
    );

    if (!actionLines.length) {
      setInventoryMessage(
        `This transfer has no non-serialized line ready to ${action === "issue" ? "issue" : "receive"} all.`
      );
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(`${action === "issue" ? "Issuing" : "Receiving"} all open lines on ${transferDocument.documentNo}...`);

    try {
      let lastMessage = "";

      for (const transfer of actionLines) {
        const quantity =
          action === "issue" ? transfer.outstandingIssueQuantity : transfer.outstandingReceiptQuantity;
        const response = await fetch(`/api/online-store/transfers/${encodeURIComponent(transfer.transferId)}/${action}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            quantity,
            serialNumbers: [],
            ...(action === "issue"
              ? {
                  sourceInventoryLocationId: transferIssueLocationId,
                  transporterName: transferDocument.transporterName,
                  vehicleRegistrationNo: transferDocument.vehicleRegistrationNo,
                  driverName: transferDocument.driverName,
                  driverContact: transferDocument.driverContact,
                  deliveryNoteNo: transferDocument.deliveryNoteNo
                }
              : {}),
            note: transferActionNote || null
          })
        });
        const payload = (await response.json()) as Partial<ProcessOnlineStoreTransferResponse> & {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? `Flash ERP could not ${action} ${transfer.transferNo}.`);
        }

        lastMessage = payload.message ?? lastMessage;
      }

      setInventoryMessage(
        lastMessage ||
          `${action === "issue" ? "Issued" : "Received"} ${formatNumber.format(actionLines.length)} transfer line(s).`
      );
      setTransferActionNote("");
      setTransferReceiptQuantities((current) => {
        const next = { ...current };

        for (const transfer of actionLines) {
          delete next[transfer.transferId];
        }

        return next;
      });
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not process that transfer.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function openTransferFeedbackDialog(transferDocument: TransferDocumentGroup) {
    const expectedReceived =
      transferDocument.receivedQuantity > 0
        ? transferDocument.receivedQuantity
        : transferDocument.expectedQuantityReceived ?? transferDocument.issuedQuantity;
    const quantityBefore = transferDocument.quantityBeforeDelivery;
    const quantityAfter = transferDocument.quantityAfterDelivery;
    const expectedStock =
      transferDocument.expectedStockQuantity ??
      (quantityBefore === null ? null : roundQuantity(quantityBefore + expectedReceived));
    const actualReceived =
      transferDocument.actualQuantityReceived ??
      (transferDocument.receivedQuantity > 0 ? transferDocument.receivedQuantity : null) ??
      (quantityBefore === null || quantityAfter === null
        ? null
        : roundQuantity(quantityAfter - quantityBefore));

    setSelectedTransferFeedbackKey(transferDocument.key);
    setTransferFeedbackWaterTest(transferDocument.waterTestResult ?? "");
    setTransferFeedbackQuantityBefore(quantityBefore === null ? "" : String(quantityBefore));
    setTransferFeedbackExpectedReceived(String(expectedReceived));
    setTransferFeedbackExpectedStock(expectedStock === null ? "" : String(expectedStock));
    setTransferFeedbackQuantityAfter(quantityAfter === null ? "" : String(quantityAfter));
    setTransferFeedbackActualReceived(actualReceived === null ? "" : String(actualReceived));
    setTransferFeedbackDipReading(transferDocument.feedbackDipReading === null ? "" : String(transferDocument.feedbackDipReading));
    setTransferFeedbackBeforeEvidence(transferDocument.beforeDischargeEvidence);
    setTransferFeedbackAfterEvidence(transferDocument.afterDischargeEvidence);
    setTransferFeedbackNote(transferDocument.feedbackNote ?? "");
  }

  async function uploadTransferFeedbackEvidence(
    event: ChangeEvent<HTMLInputElement>,
    section: "before" | "after"
  ) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    setTransferFeedbackUploadingSection(section);
    setInventoryMessage(`Uploading ${files.length} transfer feedback photo${files.length === 1 ? "" : "s"}...`);

    try {
      const uploadedEvidence: TransferFeedbackEvidence[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append(
          "evidenceKind",
          section === "before" ? "transfer-before-discharge" : "transfer-after-discharge"
        );

        const response = await fetch("/api/fuel-operations/evidence", {
          method: "POST",
          body: formData
        });
        const payload = (await response.json()) as {
          url?: string;
          fileName?: string;
          capturedAt?: string;
          uploadedAt?: string;
          message?: string;
        };

        if (!response.ok || !payload.url) {
          throw new Error(payload.message ?? "Flash ERP could not upload that transfer feedback photo.");
        }

        uploadedEvidence.push({
          url: payload.url,
          fileName: payload.fileName ?? file.name,
          capturedAt: payload.capturedAt ?? new Date().toISOString(),
          uploadedAt: payload.uploadedAt ?? new Date().toISOString()
        });
      }

      if (section === "before") {
        setTransferFeedbackBeforeEvidence((current) => [...current, ...uploadedEvidence]);
      } else {
        setTransferFeedbackAfterEvidence((current) => [...current, ...uploadedEvidence]);
      }

      setInventoryMessage("Transfer feedback photo evidence uploaded.");
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not upload transfer feedback evidence.");
    } finally {
      setTransferFeedbackUploadingSection(null);
      event.target.value = "";
    }
  }

  async function postTransferFeedback(action: "SAVE" | "CONFIRM") {
    const transferDocument = selectedTransferFeedbackDocument;
    const transferId = transferDocument?.lines[0]?.transferId;

    if (!transferDocument || !transferId) {
      setInventoryMessage("Choose a fuel transfer before saving feedback.");
      return;
    }

    if (!transferFeedbackDipReading.trim()) {
      setInventoryMessage("Capture the transfer dip reading before saving feedback.");
      return;
    }

    if (transferFeedbackBeforeEvidence.length === 0 || transferFeedbackAfterEvidence.length === 0) {
      setInventoryMessage("Capture before-discharge and after-discharge photo evidence before saving feedback.");
      return;
    }

    if (transferFeedbackUploadingSection) {
      setInventoryMessage("Wait for the transfer feedback photo upload to finish before saving.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage(`${action === "CONFIRM" ? "Confirming" : "Saving"} transfer feedback...`);

    try {
      const receivedQuantity =
        transferDocument.receivedQuantity > 0
          ? transferDocument.receivedQuantity
          : transferDocument.expectedQuantityReceived ?? transferDocument.issuedQuantity;
      const beforeQuantity = Number(transferFeedbackQuantityBefore);
      const expectedStock =
        transferFeedbackExpectedStock ||
        (Number.isFinite(beforeQuantity)
          ? String(roundQuantity(beforeQuantity + receivedQuantity))
          : null);
      const response = await fetch(
        `/api/fuel-operations/station-deliveries/${encodeURIComponent(transferId)}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action,
            waterTestResult: transferFeedbackWaterTest || null,
            quantityBeforeDelivery: transferFeedbackQuantityBefore || null,
            expectedQuantityReceived: String(receivedQuantity),
            expectedStockQuantity: expectedStock,
            quantityAfterDelivery: transferFeedbackQuantityAfter || null,
            actualQuantityReceived: String(receivedQuantity),
            feedbackDipReading: transferFeedbackDipReading || null,
            beforeDischargeEvidence: transferFeedbackBeforeEvidence,
            afterDischargeEvidence: transferFeedbackAfterEvidence,
            feedbackNote: transferFeedbackNote || null,
            feedbackOperatorName: workspace.operator.displayName
          })
        }
      );
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not save transfer feedback.");
      }

      setInventoryMessage(payload.message ?? "Transfer feedback saved.");
      setSelectedTransferFeedbackKey(null);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not save transfer feedback.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function resetExpenseDraft() {
    setExpenseDraftId("");
    setExpenseDate(activeDate);
    setExpenseCategory("GENERAL");
    setExpenseDescription("");
    setExpenseSupplierName("");
    setExpensePaymentMethod("CASH");
    setExpenseReference("");
    setExpenseAmount("");
    setExpenseTaxAmount("0");
    setExpenseNote("");
    setExpenseAttachmentFileName("");
    setExpenseAttachmentUrl("");
  }

  function loadExpenseDraft(expense: (typeof workspace.storeExpenses)[number]) {
    if (expense.status !== "DRAFT") {
      setExpenseMessage("Only draft expenses can be edited from the store.");
      return;
    }

    setExpenseDraftId(expense.expenseId);
    const expenseDateValue = new Date(expense.expenseDate);
    setExpenseDate(
      Number.isNaN(expenseDateValue.getTime()) ? activeDate : formatDateInput(expenseDateValue)
    );
    setExpenseCategory(expense.category || "GENERAL");
    setExpenseDescription(expense.description);
    setExpenseSupplierName(expense.supplierName ?? "");
    setExpensePaymentMethod(expense.paymentMethod ?? "CASH");
    setExpenseReference(expense.externalReference ?? "");
    setExpenseAmount(String(expense.amount));
    setExpenseTaxAmount(String(expense.taxAmount ?? 0));
    setExpenseNote(expense.note ?? "");
    setExpenseAttachmentFileName(expense.attachmentFileName ?? "");
    setExpenseAttachmentUrl(expense.attachmentUrl ?? "");
    setExpenseMessage(`${expense.expenseNo} loaded for editing.`);
  }

  async function uploadExpenseAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      return;
    }

    setExpenseMessage("Uploading expense attachment...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/online-store/expenses/attachments", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as {
        url?: string;
        fileName?: string;
        message?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.message ?? "Flash ERP could not upload the expense attachment.");
      }

      setExpenseAttachmentUrl(payload.url);
      setExpenseAttachmentFileName(payload.fileName ?? file.name);
      setExpenseMessage(payload.message ?? "Expense attachment uploaded.");
    } catch (error) {
      setExpenseMessage(error instanceof Error ? error.message : "Flash ERP could not upload the expense attachment.");
    } finally {
      event.target.value = "";
    }
  }

  async function saveStoreExpense(confirmAfterSave = false) {
    setIsPostingInventory(true);
    setExpenseMessage(confirmAfterSave ? "Saving and confirming expense..." : "Saving expense...");

    try {
      const response = await fetch("/api/online-store/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          expenseId: expenseDraftId || null,
          expenseDate,
          category: expenseCategory,
          description: expenseDescription,
          supplierName: expenseSupplierName || null,
          paymentMethod: expensePaymentMethod || null,
          externalReference: expenseReference || null,
          attachmentFileName: expenseAttachmentFileName || null,
          attachmentUrl: expenseAttachmentUrl || null,
          amount: expenseAmount,
          taxAmount: expenseTaxAmount || "0",
          note: expenseNote || null
        })
      });
      const payload = (await response.json()) as {
        expenseId?: string;
        expenseNo?: string;
        message?: string;
      };

      if (!response.ok || !payload.expenseId) {
        throw new Error(payload.message ?? "Flash ERP could not save the store expense.");
      }

      if (confirmAfterSave) {
        setExpenseDraftId(payload.expenseId);
        setPendingExpenseConfirmation({
          expenseId: payload.expenseId,
          expenseNo: payload.expenseNo ?? "Expense",
          amount: Number(expenseAmount || 0) + Number(expenseTaxAmount || 0),
          description: expenseDescription.trim() || "Store expense"
        });
        setExpenseMessage(payload.message ?? `${payload.expenseNo ?? "Expense"} saved. Confirm when ready to send it to HQ Finance.`);
      } else {
        setExpenseDraftId(payload.expenseId);
        setExpenseMessage(payload.message ?? `${payload.expenseNo ?? "Expense"} saved.`);
      }

      router.refresh();
    } catch (error) {
      setExpenseMessage(error instanceof Error ? error.message : "Flash ERP could not save the store expense.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  async function confirmStoreExpense(expenseId: string) {
    setIsPostingInventory(true);
    setExpenseMessage("Confirming store expense...");

    try {
      const response = await fetch(
        `/api/online-store/expenses/${encodeURIComponent(expenseId)}/confirm`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Flash ERP could not confirm the store expense.");
      }

      setExpenseMessage(payload.message ?? "Store expense confirmed for HQ Finance.");
      setPendingExpenseConfirmation(null);
      resetExpenseDraft();
      router.refresh();
    } catch (error) {
      setExpenseMessage(error instanceof Error ? error.message : "Flash ERP could not confirm the store expense.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function requestExpenseConfirmation(expense: (typeof workspace.storeExpenses)[number]) {
    setPendingExpenseConfirmation({
      expenseId: expense.expenseId,
      expenseNo: expense.expenseNo,
      amount: expense.amount + expense.taxAmount,
      description: expense.description
    });
  }

  function openTransferSerialDialog(transfer: TransferRequest, action: "issue" | "receive") {
    const outstandingQuantity =
      action === "issue" ? transfer.outstandingIssueQuantity : transfer.outstandingReceiptQuantity;
    const requestedQuantity = Number(transferReceiptQuantities[transfer.transferId] ?? outstandingQuantity);
    const quantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0 ? requestedQuantity : outstandingQuantity;
    const availableSerialNumbers =
      action === "receive"
        ? transfer.issuedSerialNumbers.filter(
            (serialNumber) => !transfer.receivedSerialNumbers.some((received) => received.toUpperCase() === serialNumber.toUpperCase())
          )
        : [];

    setInventorySerialDraft({
      title: `${action === "issue" ? "Issue" : "Receive"} ${transfer.transferNo}`,
      productName: transfer.productName,
      quantity,
      availableSerialNumbers,
      serialNumbers: "",
      serialEntry: "",
      serialRangeStart: "",
      serialRangeEnd: "",
      message:
        action === "receive"
          ? "Select the issued serials physically received into this store."
          : "Enter the serials physically issued out of this store.",
      submitLabel: action === "issue" ? "Issue serials" : "Receive serials",
      onSubmit: async (serialNumbers) => {
        await processTransferAction(transfer, action, serialNumbers);
      }
    });
  }

  async function postStockCount() {
    if (!inventoryProductId || !selectedInventoryProduct) {
      setInventoryMessage("Choose a product before saving the count.");
      return;
    }

    const batchCounts = selectedInventoryProduct?.trackExpiry
        ? selectedCountBatches.map((batch) => ({
            batchId: batch.batchId,
            countedQuantity: Number(countedBatchQuantities[batch.batchId] ?? batch.quantityOnHand)
          }))
        : [];
    const effectiveCountedQuantity = selectedInventoryProduct?.trackExpiry
        ? batchCounts.reduce((sum, batch) => sum + batch.countedQuantity, 0)
        : Number(countedQuantity);
    if (!Number.isFinite(effectiveCountedQuantity) || effectiveCountedQuantity < 0) {
      setInventoryMessage("Enter a counted quantity of zero or greater before adding the item.");
      return;
    }

    const systemQuantity = selectedInventoryRow?.quantityOnHand ?? selectedInventoryProduct.quantityOnHand;
    setStockCountUploadRows((rows) => [
      ...rows.filter((row) => row.productId !== inventoryProductId),
      {
        productId: inventoryProductId,
        productCode: selectedInventoryProduct.productCode,
        productName: selectedInventoryProduct.productName,
        systemQuantity,
        countedQuantity: effectiveCountedQuantity,
        varianceQuantity: roundQuantity(effectiveCountedQuantity - systemQuantity),
        batchCounts
      }
    ]);
    setInventoryProductId("");
    setCountedQuantity("0");
    setCountedBatchQuantities({});
    setInventoryMessage(`${selectedInventoryProduct.productName} was added to the count sheet.`);
  }

  async function commitStockCount(sessionIds: string[], sessionNo: string) {
    setIsPostingInventory(true);
    setInventoryMessage(`Committing ${sessionNo}...`);

    try {
      for (const sessionId of sessionIds) {
        const response = await fetch(`/api/online-store/stock-counts/${encodeURIComponent(sessionId)}/commit`, {
          method: "POST"
        });
        const payload = (await response.json()) as Partial<CommitOnlineStoreStockCountResponse> & {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "Flash ERP could not commit the stock count.");
        }
      }

      setInventoryMessage(`Committed ${sessionNo}.`);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not commit the stock count.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function requestStockCountCommit(sessionIds: string[], sessionNo: string) {
    setPendingStockCountConfirmation({ action: "COMMIT", sessionIds, sessionNo });
  }

  function exportCountSheet() {
    if (stockCountUploadRows.length) {
      downloadCsv(`flash-erp-count-sheet-${stockCountUploadRows[0]?.sheetNo ?? (inventoryLocationId || "draft")}.csv`, [
        ["productCode", "productName", "countedQuantity", "systemQuantity"],
        ...stockCountUploadRows.map((row) => [
          row.productCode,
          row.productName,
          row.countedQuantity ?? "",
          row.systemQuantity
        ])
      ]);
      return;
    }

    const rows = countLocationItems.length ? countLocationItems : inventoryBrowserRows;

    downloadCsv(`flash-erp-count-sheet-${inventoryLocationId || "all"}.csv`, [
      ["productCode", "productName", "countedQuantity", "systemQuantity"],
      ...rows.map((row) => [row.productCode, row.productName, "", row.quantityOnHand])
    ]);
  }

  async function importCountSheet(file: File | null) {
    if (!file) {
      return;
    }

    const uploadedRows = parseStockCountCsv(await file.text());
    const inventoryByCode = new Map(
      inventoryBrowserRows.map((row) => [row.productCode.toUpperCase(), row] as const)
    );

    setStockCountUploadRows(
      uploadedRows.map((row) => {
        const item = inventoryByCode.get(row.productCode.toUpperCase());
        const systemQuantity = item?.quantityOnHand ?? 0;
        const countedQuantity = row.countedQuantity;

        return {
          productId: item?.productId ?? "",
          productCode: row.productCode,
          productName: item?.productName ?? row.productCode,
          systemQuantity,
          countedQuantity,
          varianceQuantity:
            countedQuantity === null ? null : roundQuantity(countedQuantity - systemQuantity)
        };
      })
    );
    setActiveCountEntryTab("variance");
  }

  function updateStockCountUploadRow(productCode: string, value: string) {
    setStockCountUploadRows((rows) =>
      rows.map((row) => {
        if (row.productCode !== productCode) {
          return row;
        }

        const countedQuantity = value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

        return {
          ...row,
          countedQuantity,
          varianceQuantity:
            countedQuantity === null ? null : roundQuantity(countedQuantity - row.systemQuantity)
        };
      })
    );
  }

  async function saveCalculatedCountRows() {
    const rows = stockCountUploadRows.filter((row) => row.productId && row.countedQuantity !== null);

    if (!rows.length) {
      setInventoryMessage("Upload count rows with counted quantities before saving.");
      return;
    }

    setIsPostingInventory(true);
    setInventoryMessage("Saving count sheet...");

    try {
      const sheetNo =
        rows.find((row) => row.sheetNo)?.sheetNo ??
        `WEB-CNT-SHEET-${Date.now()}`;

      for (const [index, row] of rows.entries()) {
        const response = await fetch("/api/online-store/stock-counts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inventoryLocationId: inventoryLocationId || defaultSalesLocationId || null,
            productId: row.productId,
            countedQuantity: row.countedQuantity,
            batchCounts: row.batchCounts ?? [],
            sheetNo,
            lineNo: index + 1,
            commitNow: false,
            note: countNote
          })
        });
        const payload = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(payload.message ?? `Flash ERP could not save ${row.productCode}.`);
        }
      }

      setInventoryMessage(`${sheetNo} was saved with ${rows.length} item(s).`);
      setStockCountUploadRows([]);
      router.refresh();
    } catch (error) {
      setInventoryMessage(error instanceof Error ? error.message : "Flash ERP could not save uploaded count rows.");
    } finally {
      setIsPostingInventory(false);
    }
  }

  function requestSaveCalculatedCountRows() {
    const rowCount = stockCountUploadRows.filter(
      (row) => row.productId && row.countedQuantity !== null
    ).length;

    if (!rowCount) {
      setInventoryMessage("Upload count rows with counted quantities before saving.");
      return;
    }

    setPendingStockCountConfirmation({ action: "SAVE_CALCULATED", rowCount });
  }

  function confirmPendingStockCountAction() {
    const pendingAction = pendingStockCountConfirmation;

    if (!pendingAction) {
      return;
    }

    setPendingStockCountConfirmation(null);

    if (pendingAction.action === "COMMIT") {
      void commitStockCount(pendingAction.sessionIds, pendingAction.sessionNo);
      return;
    }

    void saveCalculatedCountRows();
  }

  function renderPurchaseOrderDialog() {
    if (!purchaseOrderDialogMode) {
      return null;
    }

    const order = dialogPurchaseOrder ?? selectedPurchaseOrder;

    if (!order) {
      return null;
    }

    const isReceiveMode = purchaseOrderDialogMode === "receive";
    const receivableLineCount = order.lines.filter(
      (line) => line.outstandingQuantity > 0 && !line.isSerialized && !line.trackExpiry
    ).length;

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-document-dialog">
          <div className="rms-panel-title">
            <div><span>Purchase order</span><h2>{order.purchaseOrderNo}</h2></div>
            <div className="rms-dialog-button-row">
              {isReceiveMode ? (
                <button
                  className="rms-button is-primary"
                  disabled={isPostingInventory || receivableLineCount === 0}
                  onClick={() => void postPurchaseOrderReceiptAll(order)}
                  type="button"
                >
                  Receive all
                </button>
              ) : null}
              <button className="rms-button" onClick={() => setPurchaseOrderDialogMode(null)} type="button">Close</button>
            </div>
          </div>
          <div className="rms-document-summary-grid">
            <DocumentStat label="Supplier" value={order.supplierName ?? "Not set"} />
            <DocumentStat label="Location" value={order.locationName} />
            <DocumentStat label="Outstanding" tone={order.outstandingQuantity > 0 ? "warning" : "good"} value={formatNumber.format(order.outstandingQuantity)} />
            <DocumentStat label="Lines" value={formatNumber.format(order.lineCount)} />
          </div>
          <div className="rms-table rms-document-line-table rms-po-document-line-table">
            <div className="rms-table-head"><span>Item</span><span>Ordered</span><span>Received</span><span>Outstanding</span><span>Receive</span></div>
            {order.lines.map((line) => (
              <div className="rms-table-row" key={line.purchaseOrderLineId}>
                <div><strong>{line.productName}</strong><small>{line.productCode}{line.isSerialized ? " · Serialized" : ""}{line.trackExpiry ? " · Batch/expiry" : ""}</small></div>
                <span>{formatNumber.format(line.orderedQuantity)}</span>
                <span>{formatNumber.format(line.receivedQuantity)}</span>
                <strong>{formatNumber.format(line.outstandingQuantity)}</strong>
                {isReceiveMode && line.outstandingQuantity > 0 ? (
                  <div className={line.trackExpiry ? "rms-expiry-receive-cell" : "rms-receive-cell"}>
                    {line.trackExpiry ? (
                      <>
                        <label className="rms-receive-field">
                          <span>Batch number</span>
                          <input
                            aria-label={`Batch number for ${line.productName}`}
                            onChange={(event) => setPurchaseOrderReceiptBatchNos((current) => ({ ...current, [line.purchaseOrderLineId]: event.target.value }))}
                            value={purchaseOrderReceiptBatchNos[line.purchaseOrderLineId] ?? ""}
                          />
                        </label>
                        <label className="rms-receive-field">
                          <span>Manufactured date</span>
                          <input
                            aria-label={`Manufactured date for ${line.productName}`}
                            onChange={(event) => setPurchaseOrderReceiptManufacturedDates((current) => ({ ...current, [line.purchaseOrderLineId]: event.target.value }))}
                            type="date"
                            value={purchaseOrderReceiptManufacturedDates[line.purchaseOrderLineId] ?? ""}
                          />
                        </label>
                        <label className="rms-receive-field">
                          <span>Expiry date</span>
                          <input
                            aria-label={`Expiry date for ${line.productName}`}
                            onChange={(event) => setPurchaseOrderReceiptExpiryDates((current) => ({ ...current, [line.purchaseOrderLineId]: event.target.value }))}
                            type="date"
                            value={purchaseOrderReceiptExpiryDates[line.purchaseOrderLineId] ?? ""}
                          />
                        </label>
                      </>
                    ) : null}
                    {line.isSerialized ? (
                      <button className="rms-row-button" disabled={isPostingInventory} onClick={() => openPurchaseOrderSerialReceipt(order, line)} type="button">Serials</button>
                    ) : (
                      <>
                      <label className="rms-receive-field">
                        <span>Quantity to receive</span>
                        <input
                          aria-label={`Receive quantity for ${line.productName}`}
                          min="0.001"
                          onChange={(event) =>
                            setPurchaseOrderReceiptQuantities((current) => ({
                              ...current,
                              [line.purchaseOrderLineId]: event.target.value
                            }))
                          }
                          step="0.001"
                          type="number"
                          value={purchaseOrderReceiptQuantities[line.purchaseOrderLineId] ?? String(line.outstandingQuantity)}
                        />
                      </label>
                      <button className="rms-row-button rms-receive-action" disabled={isPostingInventory} onClick={() => void postPurchaseOrderReceipt(order, line)} type="button">Receive</button>
                      </>
                    )}
                  </div>
                ) : (
                  <span>{line.outstandingQuantity > 0 ? `${formatNumber.format(line.outstandingQuantity)} pending` : "Done"}</span>
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
            <div><span>Goods receipt</span><h2>{selectedGoodsReceipt.receiptNo}</h2></div>
            <div className="rms-dialog-button-row">
              <button className="rms-button" onClick={() => openGoodsReceiptWindow(selectedGoodsReceipt)} type="button">Print GRN</button>
              <button className="rms-button" onClick={() => setSelectedGoodsReceiptId("")} type="button">Close</button>
            </div>
          </div>
          <div className="rms-document-summary-grid">
            <DocumentStat label="Supplier" value={selectedGoodsReceipt.supplierName ?? "Not set"} />
            <DocumentStat label="PO" value={selectedGoodsReceipt.purchaseOrderNo ?? "Direct"} />
            <DocumentStat label="Received" tone="good" value={formatNumber.format(selectedGoodsReceipt.totalQuantity)} />
            <DocumentStat label="Lines" value={formatNumber.format(selectedGoodsReceipt.lineCount)} />
          </div>
          <div className="rms-table rms-document-line-table rms-grn-document-line-table">
            <div className="rms-table-head"><span>Item</span><span>Qty</span><span>Unit cost</span><span>Traceability</span><span>Status</span></div>
            {selectedGoodsReceipt.lines.map((line) => (
              <div className="rms-table-row" key={line.goodsReceiptLineId}>
                <div><strong>{line.productName}</strong><small>{line.productCode}</small></div>
                <strong>{formatNumber.format(line.quantity)}</strong>
                <span>{line.unitCost === null ? "-" : formatMoney(line.unitCost, currencyCode)}</span>
                <span>{line.batchNo ? `${line.batchNo} · exp ${new Date(line.expiryDate ?? "").toLocaleDateString("en-GB")}` : line.serialNumbers.length ? `${formatNumber.format(line.serialNumbers.length)} serial(s)` : "None"}</span>
                <StatusPill tone="good">Posted</StatusPill>
              </div>
            ))}
          </div>
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
        !transfer.isSerialized
    ).length;
    const receivableLineCount = selectedTransferDocument.lines.filter(
      (transfer) =>
        transfer.role === "DESTINATION" &&
        transfer.outstandingReceiptQuantity > 0 &&
        !transfer.isSerialized
    ).length;
    const canCaptureFeedback =
      isFuelTransferDocument(selectedTransferDocument) &&
      selectedTransferDocument.receivedQuantity > 0 &&
      selectedTransferDocument.lines.some((transfer) => transfer.role === "DESTINATION");
    const selectedTransferOutstandingQuantity = getTransferRoleOutstandingQuantity(
      selectedTransferDocument,
      transferDirectionFilter
    );

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-document-dialog rms-transfer-document-dialog">
          <div className="rms-panel-title">
            <div><span>Stock transfer</span><h2>{selectedTransferDocument.documentNo}</h2></div>
            <div className="rms-dialog-button-row">
              {issuableLineCount > 0 ? (
                <button
                  className="rms-button is-primary"
                  disabled={isPostingInventory || !transferIssueLocationId}
                  onClick={() => void processTransferDocumentActionAll(selectedTransferDocument, "issue")}
                  type="button"
                >
                  Issue all
                </button>
              ) : null}
              {receivableLineCount > 0 ? (
                <button
                  className="rms-button is-primary"
                  disabled={isPostingInventory}
                  onClick={() => void processTransferDocumentActionAll(selectedTransferDocument, "receive")}
                  type="button"
                >
                  Receive all
                </button>
              ) : null}
              {canCaptureFeedback ? (
                <button className="rms-button is-primary" onClick={() => openTransferFeedbackDialog(selectedTransferDocument)} type="button">
                  Feedback
                </button>
              ) : null}
              <button className="rms-button" onClick={() => openTransferDocumentWindow(selectedTransferDocument)} type="button">Print</button>
              <button className="rms-button" onClick={() => setSelectedTransferDocumentKey(null)} type="button">Close</button>
            </div>
          </div>
          <div className="rms-document-summary-grid">
            <DocumentStat label="Source" value={selectedTransferDocument.sourceStoreName} />
            <DocumentStat label="Destination" value={selectedTransferDocument.destinationStoreName} />
            <DocumentStat label="Requested" value={formatNumber.format(selectedTransferDocument.requestedQuantity)} />
            <DocumentStat
              label="Outstanding"
              tone={selectedTransferOutstandingQuantity > 0 ? "warning" : "good"}
              value={formatNumber.format(selectedTransferOutstandingQuantity)}
            />
            <DocumentStat label="Vehicle" value={selectedTransferDocument.vehicleRegistrationNo ?? "Not captured"} />
            <DocumentStat label="Driver" value={selectedTransferDocument.driverName ?? "Not captured"} />
            <DocumentStat
              label="Feedback"
              tone={selectedTransferDocument.feedbackStatus === "POSTED" || selectedTransferDocument.feedbackStatus === "CONFIRMED" ? "good" : "warning"}
              value={selectedTransferDocument.feedbackStatus}
            />
          </div>
          {issuableLineCount > 0 ? (
            <label className="rms-note-field rms-transfer-note">
              <span>Dispatch location</span>
              <select
                onChange={(event) => setTransferIssueLocationId(event.target.value)}
                value={transferIssueLocationId}
              >
                <option value="">Select source location</option>
                {workspace.inventoryLocations.map((location) => (
                  <option key={location.locationId} value={location.locationId}>
                    {location.locationName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="rms-note-field rms-transfer-note">
            <span>Action note</span>
            <input onChange={(event) => setTransferActionNote(event.target.value)} value={transferActionNote} />
          </label>
          <div className="rms-table rms-transfer-line-table">
            <div className="rms-table-head"><span>Item</span><span>From / To</span><span>Requested</span><span>Issued</span><span>Received</span><span>Status</span><span>Action</span></div>
            {selectedTransferDocument.lines.map((transfer) => {
              const canIssue = transfer.role === "SOURCE" && transfer.outstandingIssueQuantity > 0;
              const canReceive = transfer.role === "DESTINATION" && transfer.outstandingReceiptQuantity > 0;
              const action = canIssue ? "issue" : canReceive ? "receive" : null;
              const outstandingQuantity = action === "issue" ? transfer.outstandingIssueQuantity : transfer.outstandingReceiptQuantity;
              const quantityValue = transferReceiptQuantities[transfer.transferId] ?? String(outstandingQuantity);
              const roleCompleted =
                transfer.role === "SOURCE"
                  ? transfer.outstandingIssueQuantity <= 0 && transfer.issuedQuantity > 0
                  : transfer.outstandingReceiptQuantity <= 0 && transfer.receivedQuantity > 0;
              const roleStatusLabel =
                transfer.role === "SOURCE"
                  ? transfer.issuedQuantity <= 0
                    ? "Requested"
                    : transfer.outstandingIssueQuantity > 0
                      ? "Part issued"
                      : "Issued"
                  : transfer.receivedQuantity > 0
                    ? transfer.outstandingReceiptQuantity > 0
                      ? "Part received"
                      : "Received"
                    : transfer.issuedQuantity > 0
                      ? "Ready to receive"
                      : "Awaiting issue";

              return (
                <div className="rms-table-row" key={transfer.transferId}>
                  <div><strong>{transfer.productName}</strong><small>{transfer.productCode}{transfer.trackExpiry ? ` · ${transfer.issuedBatchAllocations.length} batch allocation(s)` : ""}</small></div>
                  <div>
                    <strong>
                      {transfer.issuedQuantity > 0
                        ? transfer.sourceLocationName
                        : "Source shop selects location"}
                    </strong>
                    <small>{transfer.destinationLocationName}</small>
                  </div>
                  <strong>{formatNumber.format(transfer.requestedQuantity)}</strong>
                  <span>{formatNumber.format(transfer.issuedQuantity)}</span>
                  <span>{formatNumber.format(transfer.receivedQuantity)}</span>
                  <StatusPill tone={roleCompleted ? "good" : "warning"}>{roleStatusLabel}</StatusPill>
                  {action ? (
                    <div className="rms-transfer-action-cell">
                      <input
                        min="0.001"
                        onChange={(event) =>
                          setTransferReceiptQuantities((quantities) => ({
                            ...quantities,
                            [transfer.transferId]: event.target.value
                          }))
                        }
                        step="0.001"
                        type="number"
                        value={quantityValue}
                      />
                      <button
                        className="rms-row-button is-add"
                        disabled={isPostingInventory || (action === "issue" && !transferIssueLocationId)}
                        onClick={() =>
                          transfer.isSerialized
                            ? openTransferSerialDialog(transfer, action)
                            : void processTransferAction(transfer, action)
                        }
                        type="button"
                      >
                        {transfer.isSerialized ? "Serials" : action === "issue" ? "Issue" : "Receive"}
                      </button>
                    </div>
                  ) : (
                    <StatusPill tone={roleCompleted ? "good" : "neutral"}>{roleCompleted ? "Done" : transfer.role.toLowerCase()}</StatusPill>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  function renderTransferFeedbackDialog() {
    if (!selectedTransferFeedbackDocument) {
      return null;
    }

    const beforeQuantity = Number(transferFeedbackQuantityBefore);
    const afterQuantity = Number(transferFeedbackQuantityAfter);
    const receivedQuantity =
      selectedTransferFeedbackDocument.receivedQuantity > 0
        ? selectedTransferFeedbackDocument.receivedQuantity
        : Number(transferFeedbackExpectedReceived);
    const expectedReceived = Number.isFinite(receivedQuantity)
      ? receivedQuantity
      : selectedTransferFeedbackDocument.issuedQuantity;
    const expectedStock =
      Number.isFinite(beforeQuantity)
        ? roundQuantity(beforeQuantity + expectedReceived)
        : transferFeedbackExpectedStock.trim()
          ? Number(transferFeedbackExpectedStock)
          : null;
    const actualReceivedFromStock =
      Number.isFinite(beforeQuantity) && Number.isFinite(afterQuantity)
        ? roundQuantity(afterQuantity - beforeQuantity)
        : null;
    const actualReceived =
      Number.isFinite(expectedReceived)
        ? expectedReceived
        : transferFeedbackActualReceived.trim() && Number.isFinite(Number(transferFeedbackActualReceived))
          ? Number(transferFeedbackActualReceived)
          : null;
    const variance =
      actualReceived !== null && Number.isFinite(expectedReceived)
        ? roundQuantity(actualReceived - expectedReceived)
        : null;

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-document-dialog rms-transfer-feedback-dialog">
          <div className="rms-panel-title">
            <div><span>Fuel delivery feedback</span><h2>{selectedTransferFeedbackDocument.documentNo}</h2></div>
            <button className="rms-button" onClick={() => setSelectedTransferFeedbackKey(null)} type="button">Close</button>
          </div>
          <div className="rms-document-summary-grid">
            <DocumentStat label="Source" value={selectedTransferFeedbackDocument.sourceStoreName} />
            <DocumentStat label="Destination" value={selectedTransferFeedbackDocument.destinationStoreName} />
            <DocumentStat label="Issued" value={formatNumber.format(selectedTransferFeedbackDocument.issuedQuantity)} />
            <DocumentStat label="Received" value={formatNumber.format(expectedReceived)} />
            <DocumentStat
              label="Variance"
              tone={variance === null || variance === 0 ? "good" : "warning"}
              value={variance === null ? "-" : formatNumber.format(variance)}
            />
          </div>
          <div className="rms-form-grid rms-transfer-feedback-grid">
            <label>
              <span>Water test</span>
              <select onChange={(event) => setTransferFeedbackWaterTest(event.target.value)} value={transferFeedbackWaterTest}>
                <option value="">Not captured</option>
                <option value="NEGATIVE">Negative</option>
                <option value="POSITIVE">Positive</option>
              </select>
            </label>
            <label><span>Qty before delivery</span><input min="0" onChange={(event) => {
              const nextBefore = event.target.value;
              setTransferFeedbackQuantityBefore(nextBefore);
              const before = Number(nextBefore);
              const expected = Number(transferFeedbackExpectedReceived);
              if (Number.isFinite(before) && Number.isFinite(expected)) {
                setTransferFeedbackExpectedStock(String(roundQuantity(before + expected)));
              }
            }} step="0.001" type="number" value={transferFeedbackQuantityBefore} /></label>
            <label><span>Expected qty received</span><input disabled readOnly step="0.001" type="number" value={String(expectedReceived)} /></label>
            <label><span>Expected stock</span><input disabled readOnly step="0.001" type="number" value={expectedStock === null || Number.isNaN(expectedStock) ? "" : String(expectedStock)} /></label>
            <label><span>Qty after delivery</span><input min="0" onChange={(event) => {
              const nextAfter = event.target.value;
              setTransferFeedbackQuantityAfter(nextAfter);
            }} step="0.001" type="number" value={transferFeedbackQuantityAfter} /></label>
            <label><span>Actual qty received</span><input disabled readOnly step="0.001" type="number" value={actualReceived === null ? "" : String(actualReceived)} /></label>
            <label><span>Dip reading</span><input min="0" onChange={(event) => setTransferFeedbackDipReading(event.target.value)} step="0.001" type="number" value={transferFeedbackDipReading} /></label>
            <label><span>Variance</span><input readOnly value={variance === null ? "" : String(variance)} /></label>
            <label className="rms-note-field rms-transfer-feedback-note"><span>Feedback note</span><textarea onChange={(event) => setTransferFeedbackNote(event.target.value)} rows={3} value={transferFeedbackNote} /></label>
          </div>
          <div className="rms-transfer-feedback-evidence-grid">
            {([
              {
                key: "before" as const,
                title: "Before discharge",
                evidence: transferFeedbackBeforeEvidence,
                onRemove: (url: string) =>
                  setTransferFeedbackBeforeEvidence((items) => items.filter((item) => item.url !== url))
              },
              {
                key: "after" as const,
                title: "After discharge",
                evidence: transferFeedbackAfterEvidence,
                onRemove: (url: string) =>
                  setTransferFeedbackAfterEvidence((items) => items.filter((item) => item.url !== url))
              }
            ]).map((section) => (
              <div className="rms-transfer-feedback-evidence-card" key={section.key}>
                <div>
                  <strong>{section.title}</strong>
                  <small>{section.evidence.length} photo{section.evidence.length === 1 ? "" : "s"}</small>
                </div>
                <label className="rms-evidence-capture-button">
                  <span>
                    {transferFeedbackUploadingSection === section.key
                      ? "Uploading photos..."
                      : section.key === "before"
                        ? "Capture before photos"
                        : "Capture after photos"}
                  </span>
                  <input
                    accept="image/*"
                    capture="environment"
                    disabled={transferFeedbackUploadingSection !== null}
                    multiple
                    onChange={(event) => void uploadTransferFeedbackEvidence(event, section.key)}
                    type="file"
                  />
                </label>
                {transferFeedbackUploadingSection === section.key ? (
                  <div className="rms-evidence-uploading" role="status">
                    <span className="rms-inline-spinner" aria-hidden="true" />
                    <span>Photo evidence is uploading. Keep this page open.</span>
                  </div>
                ) : null}
                <div className="rms-transfer-feedback-evidence-list">
                  {section.evidence.map((item) => (
                    <div className="rms-transfer-feedback-evidence-item" key={item.url}>
                      <a href={item.url} rel="noreferrer" target="_blank">{item.fileName ?? "Evidence photo"}</a>
                      <small>{formatDateTime(item.capturedAt ?? item.uploadedAt ?? new Date().toISOString(), workspace.store?.timezone ?? null)}</small>
                      <button className="rms-row-button" onClick={() => section.onRemove(item.url)} type="button">Remove</button>
                    </div>
                  ))}
                  {section.evidence.length === 0 ? <small>No photos captured yet.</small> : null}
                </div>
              </div>
            ))}
          </div>
          {actualReceivedFromStock !== null && Math.abs(actualReceivedFromStock - expectedReceived) > 0.0001 ? (
            <p className="rms-inline-warning">
              Stock before/after implies {formatNumber.format(actualReceivedFromStock)} received, while the transfer receipt is locked at {formatNumber.format(expectedReceived)}.
            </p>
          ) : null}
          <div className="rms-dialog-actions">
            <button className="rms-button" onClick={() => setSelectedTransferFeedbackKey(null)} type="button">Cancel</button>
            <button className="rms-button" disabled={isPostingInventory || transferFeedbackUploadingSection !== null} onClick={() => void postTransferFeedback("SAVE")} type="button">
              Save
            </button>
            <button className="rms-button is-primary" disabled={isPostingInventory || transferFeedbackUploadingSection !== null} onClick={() => void postTransferFeedback("CONFIRM")} type="button">
              Confirm
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderRemoteInventoryDialog() {
    if (!remoteLookupOpen) {
      return null;
    }

    const remoteStoreOptions = Array.from(
      new Map([
        ...workspace.transferStores.map((store) => [store.storeCode, store.storeName] as const),
        ...remoteInventoryRows.map((row) => [row.storeCode, row.storeName] as const)
      ])
    ).sort((left, right) => left[1].localeCompare(right[1]));
    const remoteItemOptions = Array.from(
      new Map(remoteInventoryRows.map((row) => [row.productCode, row.productName] as const))
    ).sort((left, right) => left[1].localeCompare(right[1]));
    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-remote-inventory-dialog">
          <div className="rms-panel-title">
            <div><span>HQ inventory</span><h2>Other store stock</h2></div>
            <button className="rms-button" onClick={() => setRemoteLookupOpen(false)} type="button">Close</button>
          </div>
          <div className="rms-dialog-toolbar">
            <input
              autoFocus
              onChange={(event) => setRemoteInventoryQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void lookupRemoteInventory();
                }
              }}
              placeholder="Product, category, barcode"
              value={remoteInventoryQuery}
            />
            <select onChange={(event) => { setRemoteInventoryStoreFilter(event.target.value); setSelectedRemoteInventoryKeys(new Set()); }} value={remoteInventoryStoreFilter}>
              <option value="">All stores</option>
              {remoteStoreOptions.map(([storeCode, storeName]) => <option key={storeCode} value={storeCode}>{storeName}</option>)}
            </select>
            <select onChange={(event) => { setRemoteInventoryItemFilter(event.target.value); setSelectedRemoteInventoryKeys(new Set()); }} value={remoteInventoryItemFilter}>
              <option value="">All items</option>
              {remoteItemOptions.map(([productCode, productName]) => <option key={productCode} value={productCode}>{productName}</option>)}
            </select>
            <select onChange={(event) => setTransferDestinationLocationId(event.target.value)} value={selectedTransferDestinationLocation?.locationId ?? transferDestinationLocationId}>
              <option value="">Request into location</option>
              {workspace.inventoryLocations.map((location) => (
                <option key={location.locationId} value={location.locationId}>Into {location.locationName}</option>
              ))}
            </select>
            <button className="rms-button is-primary" disabled={isLoadingRemoteInventory} onClick={() => void lookupRemoteInventory()} type="button">
              {isLoadingRemoteInventory ? "Searching..." : "Search HQ"}
            </button>
            <button className="rms-button is-primary" disabled={isLoadingRemoteInventory || selectedRemoteInventoryKeys.size === 0} onClick={buildTransferDraftFromRemoteSelection} type="button">
              Build request ({selectedRemoteInventoryKeys.size})
            </button>
          </div>
          <div className="rms-table rms-remote-inventory-table">
            <div className="rms-table-head"><span>Select</span><span>Product</span><span>Shop</span><span>Total on hand</span><span>Web stock</span><span>Updated</span><span>Request eligibility</span></div>
            {remoteInventoryRows.map((row) => {
              const rowKey = getRemoteInventoryRowKey(row);
              const eligibility = getRemoteRequestEligibility(row);
              const selected = selectedRemoteInventoryKeys.has(rowKey);

              return (
                <div className="rms-table-row" key={rowKey}>
                  <input
                    aria-label={`Select ${row.productName} from ${row.storeName}`}
                    checked={selected}
                    disabled={!selected && !eligibility.eligible}
                    onChange={() => toggleRemoteInventorySelection(row)}
                    title={eligibility.reason}
                    type="checkbox"
                  />
                  <div><strong>{row.productName}</strong><small>{row.productCode}</small></div>
                  <div><strong>{row.storeName}</strong><small>{row.storeCode}</small></div>
                  <strong>{formatNumber.format(row.quantityOnHand)}</strong>
                  <div className="rms-ecommerce-stock-breakdown">
                    <strong>
                      {row.ecommercePickupEligible || row.ecommerceDeliveryEligible
                        ? formatNumber.format(row.ecommerceSellableQuantity)
                        : "-"}
                    </strong>
                    <small>
                      {formatNumber.format(row.activeReservedQuantity)} reserved · {formatNumber.format(row.safetyStockQuantity)} safety
                    </small>
                    <details>
                      <summary>Location breakdown</summary>
                      <div className="rms-ecommerce-stock-breakdown-list">
                        {row.locationBreakdown.map((location) => (
                          <div key={location.locationCode}>
                            <strong>{location.locationName}</strong>
                            <small>
                              {formatNumber.format(location.quantityOnHand)} on hand · {formatNumber.format(location.activeReservedQuantity)} reserved · {formatNumber.format(location.safetyStockLevel)} safety · {location.ecommercePickupEligible || location.ecommerceDeliveryEligible ? `${formatNumber.format(location.ecommerceSellableQuantity)} sellable` : "not eligible"}
                            </small>
                            <small title={location.ecommerceEligibilityLabel}>
                              {[
                                location.ecommercePickupEligible ? "Pickup" : null,
                                location.ecommerceDeliveryEligible ? "Delivery" : null,
                              ]
                                .filter(Boolean)
                                .join(" + ") || "Not configured"}
                            </small>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                  <span>{formatRelative(row.updatedAt)}</span>
                  <small title={eligibility.reason}>{eligibility.eligible ? "Eligible" : eligibility.reason}</small>
                </div>
              );
            })}
            {!remoteInventoryRows.length ? <EmptyState title="No remote stock loaded" detail="Search HQ for stock across other stores." /> : null}
          </div>
        </section>
      </div>
    );
  }

  function renderInventorySerialDialog() {
    if (!inventorySerialDraft) {
      return null;
    }

    const requiresExactQuantity = inventorySerialDraft.requireExactQuantity !== false;

    return (
      <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
        <section className="rms-dialog rms-wide-dialog rms-serial-dialog">
          <div className="rms-panel-title">
            <div><span>Serial movement</span><h2>{inventorySerialDraft.title}</h2></div>
            <button className="rms-button" onClick={() => setInventorySerialDraft(null)} type="button">Close</button>
          </div>
          <div className="rms-readonly-field">
            <span>{inventorySerialDraft.productName}</span>
            <strong>
              {requiresExactQuantity
                ? `${selectedInventorySerials.length} of ${formatNumber.format(inventorySerialDraft.quantity)} serial(s)`
                : `${selectedInventorySerials.length} serial(s) selected`}
            </strong>
          </div>
          <div className="rms-serial-picker">
            <div className="rms-serial-entry-row">
              <input
                autoFocus
                onChange={(event) =>
                  setInventorySerialDraft((draft) =>
                    draft
                      ? {
                          ...draft,
                          serialEntry: event.target.value
                        }
                      : draft
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addInventorySerialCandidates([inventorySerialDraft.serialEntry]);
                  }
                }}
                placeholder="Enter one serial number"
                value={inventorySerialDraft.serialEntry}
              />
              <button className="rms-button" onClick={() => addInventorySerialCandidates([inventorySerialDraft.serialEntry])} type="button">Add serial</button>
            </div>
            <div className="rms-serial-entry-row is-range">
              <input
                onChange={(event) =>
                  setInventorySerialDraft((draft) =>
                    draft
                      ? {
                          ...draft,
                          serialRangeStart: event.target.value
                        }
                      : draft
                  )
                }
                placeholder="Range start"
                value={inventorySerialDraft.serialRangeStart}
              />
              <input
                onChange={(event) =>
                  setInventorySerialDraft((draft) =>
                    draft
                      ? {
                          ...draft,
                          serialRangeEnd: event.target.value
                        }
                      : draft
                  )
                }
                placeholder="Range end"
                value={inventorySerialDraft.serialRangeEnd}
              />
              <button className="rms-button" onClick={addInventorySerialRange} type="button">Add range</button>
            </div>
            <div className="rms-serial-status">
              <strong>{inventorySerialDraft.message ?? "Serials will be validated before posting."}</strong>
              <span>
                {inventorySerialDraft.availableSerialNumbers.length
                  ? `${formatNumber.format(inventorySerialDraft.availableSerialNumbers.length)} available serial(s) found for this movement.`
                  : "This movement accepts new serials and will reject duplicates during posting."}
              </span>
            </div>
            <div className="rms-serial-grid">
              <div className="rms-serial-grid-head"><span>#</span><span>Serial number</span><span /></div>
              {selectedInventorySerials.length ? (
                selectedInventorySerials.map((serialNumber, index) => (
                  <div className="rms-serial-grid-row" key={serialNumber}>
                    <span>{index + 1}</span>
                    <strong>{serialNumber}</strong>
                    <button
                      className="rms-row-button is-danger"
                      onClick={() =>
                        setInventorySerialDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                serialNumbers: parseSerialDraft(draft.serialNumbers)
                                  .filter((entry) => entry.toUpperCase() !== serialNumber.toUpperCase())
                                  .join("\n"),
                                message: `${serialNumber} removed.`
                              }
                            : draft
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <EmptyState title="No serials selected" detail="Add serials before posting this movement." />
              )}
            </div>
          </div>
          <div className="rms-dialog-actions">
            <button className="rms-button" onClick={() => setInventorySerialDraft(null)} type="button">Cancel</button>
            <button
              className="rms-button is-primary"
              disabled={isPostingInventory || inventorySerialMismatch}
              onClick={() => void inventorySerialDraft.onSubmit(selectedInventorySerials)}
              type="button"
            >
              {inventorySerialDraft.submitLabel}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!workspace.isAvailable) {
    return (
      <main className="rms-online-unavailable">
        <section className="rms-panel">
          <span className="rms-kicker">Online store</span>
          <h1>Workspace unavailable</h1>
          <p>{workspace.unavailableReason}</p>
        </section>
      </main>
    );
  }

  return (
    <div
      className={`rms-desktop rms-online-desktop is-touch-optimized${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
    >
      <aside className="rms-sidebar">
        <div className="rms-sidebar-brand">
          <button
            aria-label={sidebarCollapsed ? "Expand sidebar" : `${workspace.branding.tradingName} logo`}
            className={`rms-logo${workspace.branding.companyLogoUrl ? " has-image" : ""}`}
            onClick={() => {
              if (sidebarCollapsed) {
                setSidebarCollapsed(false);
              }
            }}
            title={sidebarCollapsed ? "Expand sidebar" : workspace.branding.tradingName}
            type="button"
          >
            {workspace.branding.companyLogoUrl ? (
              <img alt={`${workspace.branding.tradingName} logo`} src={workspace.branding.companyLogoUrl} />
            ) : (
              <span>ϟ</span>
            )}
          </button>
          <div className="rms-sidebar-copy">
            <strong>{workspace.branding.tradingName}</strong>
            <small>{workspace.store?.name}</small>
          </div>
          {!sidebarCollapsed ? (
            <button
              aria-label="Collapse sidebar"
              className="rms-sidebar-toggle"
              onClick={() => setSidebarCollapsed(true)}
              title="Collapse sidebar"
              type="button"
            >
              &lt;
            </button>
          ) : null}
        </div>

        <nav aria-label="Desktop workspaces" className="rms-nav">
          {visibleWorkspaceNav.map((item) => (
            <button
              aria-current={activeWorkspace === item.id ? "page" : undefined}
              aria-label={sidebarCollapsed ? item.label : undefined}
              className={activeWorkspace === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => {
                setActiveWorkspace(item.id);
                if (item.id === "pos") {
                  void refreshPendingSalesOrders();
                }
                if (typeof window !== "undefined") {
                  window.history.replaceState(
                    window.history.state,
                    "",
                    item.id === "ecommerce"
                      ? "/online-store?workspace=ecommerce"
                      : "/online-store"
                  );
                }
                if (
                  typeof window !== "undefined" &&
                  window.matchMedia("(max-width: 760px)").matches
                ) {
                  setSidebarCollapsed(true);
                }
              }}
              title={sidebarCollapsed ? item.label : undefined}
              type="button"
            >
              <SidebarIcon name={item.icon} />
              <strong>
                <span className="rms-nav-abbrev">{item.label.slice(0, 1)}</span>
                <span className="rms-nav-label">{item.label}</span>
              </strong>
            </button>
          ))}
        </nav>

        {!sidebarCollapsed ? (
            <div className="rms-sidebar-status">
              <span>Operator</span>
              <strong>{workspace.operator.displayName}</strong>
              <small>Store Operator</small>
              <form action="/api/auth/sign-out" method="post">
                <button className="rms-button is-ghost rms-log-out-button" type="submit">
                  <span>Log out</span>
                </button>
              </form>
            </div>
        ) : null}
      </aside>

      <section className="rms-main">
        <header className="rms-topbar">
          <div>
            <span className="rms-kicker">{renderedWorkspace.detail}</span>
            <h1>{renderedWorkspace.label}</h1>
          </div>
          <div className="rms-topbar-meta">
            <StatusPill tone={currentShift ? "good" : "warning"}>{`${currentShift?.shiftNo ?? "No open shift"} · ${workspace.operator.loginId}`}</StatusPill>
            <StatusPill>{`Shift sales ${formatMoney(workspace.metrics.todaySales, currencyCode)}`}</StatusPill>
            <StatusPill>{`Expected cash ${formatMoney(currentShift?.expectedCashAmount ?? workspace.metrics.expectedCash, currencyCode)}`}</StatusPill>
            <StatusPill>{`Account pay ${formatMoney(workspace.metrics.accountPayments, currencyCode)}`}</StatusPill>
            <StatusPill>{`Open orders ${formatNumber.format(workspace.metrics.openOrders)}`}</StatusPill>
            <StatusPill tone="good">Online Store</StatusPill>
            <StatusPill>{workspace.store?.code ?? "online-store"}</StatusPill>
            <StatusPill>{localClock}</StatusPill>
            <button className="rms-button is-compact is-warning" onClick={lockScreen} type="button">
              Lock
            </button>
          </div>
        </header>

        {activeWorkspace === "dashboard" ? (
          <div className="rms-workspace rms-dashboard">
            <section className="rms-dashboard-hero">
              <div>
                <span className="rms-kicker">Shop dashboard</span>
                <h2>Welcome, {workspace.operator.displayName}</h2>
                <p>
                  {workspace.store?.name} · online-web · {currentShift ? `${currentShift.shiftNo} open` : "no shift open"} on this terminal · {dashboardScopeLabel}
                </p>
              </div>
              <div className="rms-dashboard-actions">
                <label className="rms-dashboard-date-field">
                  <span>From</span>
                  <input max={dashboardDateTo || undefined} onChange={(event) => setDashboardDateFrom(event.target.value)} type="date" value={dashboardDateFrom} />
                </label>
                <label className="rms-dashboard-date-field">
                  <span>To</span>
                  <input min={dashboardDateFrom || undefined} onChange={(event) => setDashboardDateTo(event.target.value)} type="date" value={dashboardDateTo} />
                </label>
                <button className="rms-button" onClick={() => router.refresh()} type="button">Apply</button>
                <button className="rms-button is-primary" onClick={() => setActiveWorkspace("pos")} type="button">Open POS</button>
                <button className="rms-button" onClick={() => setActiveWorkspace("reports")} type="button">Reports</button>
                <button className="rms-button" onClick={() => setActiveWorkspace("inventory")} type="button">Inventory</button>
              </div>
            </section>
            <section className="rms-dashboard-kpis">
              <MoneyTile detail={dashboardScopeLabel} label="Net sales" value={formatMoney(dashboardNetSalesAmount, currencyCode)} />
              <MoneyTile detail={`${dashboardReturnCount} return(s)`} label="Total refunds" tone={dashboardReturnCount ? "amber" : "green"} value={formatMoney(dashboardRefundAmount, currencyCode)} />
              <MoneyTile detail={`${dashboardSalesCount} sale(s)`} label="Return rate" tone={dashboardReturnRate > 10 ? "red" : dashboardReturnRate > 4 ? "amber" : "green"} value={`${dashboardReturnRate.toFixed(1)}%`} />
              <MoneyTile detail="linked correction receipts" label="Total voids" tone={dashboardCorrectionCount ? "amber" : "green"} value={formatNumber.format(dashboardCorrectionCount)} />
              <MoneyTile detail={dashboardTopProduct ? `${formatMoney(dashboardTopProduct.netAmount, currencyCode)} / ${formatNumber.format(dashboardTopProduct.quantity)} qty` : "No sales yet"} label="Top product" tone="slate" value={dashboardTopProduct?.productName ?? "None"} />
              <MoneyTile detail={`${heldSales.length} held basket(s)`} label="Open orders" tone="amber" value={formatNumber.format(salesOrders.filter((order) => order.status === "OPEN").length)} />
            </section>
            <section className="rms-dashboard-split">
              <article className="rms-panel rms-dashboard-chart">
                <div className="rms-panel-title"><span>{dashboardScopeLabel}</span><h2>Hourly sales</h2><StatusPill>{formatMoney(dashboardNetSalesAmount, currencyCode)}</StatusPill></div>
                <div className="rms-line-chart">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
                    <defs>
                      <linearGradient id="onlineHourlySalesFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#147ad6" stopOpacity="0.24" />
                        <stop offset="100%" stopColor="#147ad6" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {[0, 1, 2, 3].map((line) => {
                      const y = chartPadTop + (line / 3) * chartInnerHeight;

                      return <line className="rms-chart-grid-line" key={line} x1={chartPadX} x2={chartPadX + chartInnerWidth} y1={y} y2={y} />;
                    })}
                    <polygon className="rms-chart-area" points={hourlyAreaPoints} />
                    <polyline className="rms-chart-line" points={hourlyLinePoints} />
                    {hourlyPoints.filter((point) => point.amount > 0).map((point) => (
                      <circle className="rms-chart-dot" cx={point.x} cy={point.y} key={point.hour} r="4" />
                    ))}
                    {[0, 6, 12, 18, 23].map((hour) => <text className="rms-chart-label" key={hour} x={hourlyPoints[hour].x} y="204">{String(hour).padStart(2, "0")}</text>)}
                  </svg>
                  {!dashboardTransactions.length ? <div className="rms-chart-empty"><EmptyState title="No sales in scope" detail="Hourly sales will draw as browser POS receipts are completed." /></div> : null}
                </div>
              </article>
              <article className="rms-panel rms-dashboard-donut-panel">
                <div className="rms-panel-title"><span>Tenders</span><h2>Tender mix</h2></div>
                <div className="rms-dashboard-donut-row">
                  <div className="rms-dashboard-donut" style={{ background: `conic-gradient(${tenderGradient})` }}>
                    <strong>{primaryTenderPercent}%</strong>
                    <span>{primaryTender?.tenderMethodName ?? "No tender"}</span>
                  </div>
                  <div className="rms-dashboard-tender-list">
                    {dashboardTenderRows.length ? dashboardTenderRows.slice(0, 6).map((row, index) => (
                      <div key={`${row.paymentMethod}:${row.tenderMethodCode}`}><span><i style={{ background: tenderPalette[index % tenderPalette.length] }} />{row.tenderMethodName ?? row.paymentMethod}</span><strong>{formatMoney(row.netAmount, currencyCode)}</strong><small>{row.transactionCount} txn</small></div>
                    )) : <div><span><i style={{ background: "#147ad6" }} />No tender posted</span><strong>{formatMoney(0, currencyCode)}</strong><small>0 txn</small></div>}
                  </div>
                </div>
              </article>
              <article className="rms-panel rms-dashboard-list-panel">
                <div className="rms-panel-title"><span>{dashboardScopeLabel}</span><h2>Top products</h2><StatusPill>{`${dashboardTopProducts.length} item(s)`}</StatusPill></div>
                <div className="rms-top-product-feature">
                  {dashboardTopProduct ? (
                    <>
                      <div className="rms-top-product-rank">1</div>
                      <div>
                        <span>Product</span>
                        <strong>{dashboardTopProduct.productName}</strong>
                        <small>{dashboardTopProduct.productCode}</small>
                      </div>
                      <strong>{formatMoney(dashboardTopProduct.netAmount, currencyCode)}</strong>
                    </>
                  ) : (
                    <EmptyState title="No product sales in scope" detail="Top products will appear after receipts are completed." />
                  )}
                </div>
                <div className="rms-list rms-top-product-list">
                  {dashboardTopProducts.slice(1, 6).map((product, index) => (
                    <div className="rms-list-row" key={product.productCode}>
                      <div>
                        <strong>{index + 2}. {product.productName}</strong>
                        <span>{formatNumber.format(product.quantity)} qty</span>
                      </div>
                      <strong>{formatMoney(product.netAmount, currencyCode)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </section>
            <section className="rms-dashboard-lower">
              <article className="rms-panel">
                <div className="rms-panel-title"><span>Inventory posture</span><h2>Shop stock</h2><StatusPill tone={stockAlertRows.length ? "warning" : "good"}>{stockAlertRows.length ? `${stockAlertRows.length} alert(s)` : "Clear"}</StatusPill></div>
                <div className="rms-dashboard-mini-grid">
                  <div><span>Locations</span><strong>{workspace.inventoryLocations.length}</strong></div>
                  <div><span>Open POs</span><strong>{openPurchaseOrderCount}</strong></div>
                  <div><span>Transfers</span><strong>{openTransferCount}</strong></div>
                  <div><span>Stock alerts</span><strong>{stockAlertRows.length}</strong></div>
                </div>
              </article>
              <article className="rms-panel">
                <div className="rms-panel-title"><span>{dashboardScopeLabel}</span><h2>Sales audit</h2></div>
                <div className="rms-dashboard-mini-grid">
                  <div><span>Sales</span><strong>{dashboardSalesCount}</strong></div>
                  <div><span>Returns</span><strong>{dashboardReturnCount}</strong></div>
                  <div><span>Exchanges</span><strong>{dashboardExchangeCount}</strong></div>
                  <div><span>Cash expected</span><strong>{formatMoney(currentShift?.expectedCashAmount ?? workspace.metrics.expectedCash, currencyCode)}</strong></div>
                </div>
              </article>
            </section>
          </div>
        ) : null}

        {activeWorkspace === "pos" ? (
          <div className="rms-workspace rms-pos-grid">
            <section className="rms-panel rms-pos-cart">
              <div className="rms-pos-head">
                <div>
                  <span>{saleMode === "LAYAWAY" ? "Layaway customer" : saleMode === "SALES_ORDER" ? "Sales order customer" : "Customer"}</span>
                  <strong>{selectedCustomer?.fullName ?? activeSalesOrder?.customerName ?? "Walk-in customer"}</strong>
                  <small>
                    {activeSalesOrder
                      ? `${activeSalesOrder.orderNo} · fulfilment`
                      : selectedCustomer
                        ? `${selectedCustomer.customerNo} · balance ${formatMoney(selectedCustomer.receivableBalanceAmount, currencyCode)}`
                        : "No customer account"}
                  </small>
                </div>
                <StatusPill tone={saleMode !== "SALE" || activeSalesOrder ? "warning" : "good"}>
                  {activeSalesOrder ? "FULFIL ORDER" : saleMode}
                </StatusPill>
              </div>
              {activeSalesOrder ? (
                <div className="rms-banner is-warn">
                  <strong>{activeSalesOrder.orderNo}</strong> is locked for fulfilment. Paid {formatMoney(activeSalesOrder.paidAmount, currencyCode)} · Balance {formatMoney(activeSalesOrder.balanceAmount, currencyCode)}
                </div>
              ) : null}
              <div className="rms-customer-strip">
                <input
                  disabled={isRecalledBasket}
                  onChange={(event) => {
                    setCustomerQuery(event.target.value);
                    if (!event.target.value.trim()) {
                      setSelectedCustomer(null);
                      setLoyaltyPointsToRedeem("0");
                    }
                  }}
                  placeholder="Start typing customer name, no, phone, or email"
                  value={customerQuery}
                />
                <label className="rms-pos-service-select">
                  <span>Service type</span>
                  <select
                    disabled={isRecalledBasket}
                    onChange={(event) => setTransactionServiceType(event.target.value)}
                    value={transactionServiceType}
                  >
                    {onlineStoreServiceTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="rms-button" disabled={isRecalledBasket} onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerQuery("");
                  setLoyaltyPointsToRedeem("0");
                }} type="button">Walk-in</button>
              </div>
              {customerQuery.trim() && !selectedCustomer && !isRecalledBasket ? (
                <div className="rms-customer-suggestions">
                  {customerMatches.length ? customerMatches.map((customer) => (
                    <button key={customer.customerId} onClick={() => selectCustomer(customer)} type="button">
                      <strong>{customer.fullName}</strong>
                      <span>{customer.customerNo} · {customer.phone ?? customer.customerType}</span>
                    </button>
                  )) : <span>No matching customer</span>}
                </div>
              ) : null}
              <div className="rms-scan-strip">
                <input
                  disabled={isRecalledBasket}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addScannedItem();
                    }
                  }}
                  placeholder="Scan barcode or type product code"
                  value={searchQuery}
                />
                <input className="rms-qty-input" disabled={isRecalledBasket} min="1" onChange={(event) => setScanQuantity(event.target.value)} type="number" value={scanQuantity} />
                <button className="rms-button is-primary" disabled={isRecalledBasket || !filteredProducts.length} onClick={addScannedItem} type="button">Add</button>
              </div>
              {searchQuery.trim() && filteredProducts.length ? (
                <div className="rms-customer-suggestions is-product">
                  {filteredProducts.slice(0, 5).map((product) => (
                    <button disabled={isRecalledBasket} key={product.productId} onClick={() => addProduct(product, parseAmount(scanQuantity) || 1)} type="button">
                      <div><strong>{product.productName}</strong><span>{product.productCode} · {formatCatalogAvailability(product)}</span></div>
                      <small>{product.mustEnterPriceAtPos ? "Enter price" : formatMoney(product.price, currencyCode)}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="rms-table rms-cart-table">
                <div className="rms-table-head"><span>#</span><span>Item</span><span>Qty</span><span>Price</span><span>Total</span><span /></div>
                {basket.map((line, index) => {
                  const pricedLine = basketPricingLines[index];
                  const lineTotal = pricedLine?.lineTotal ?? calculateBasketLineAmounts(line).lineTotal;
                  const promotionLabel = pricedLine?.appliedPromotionName ?? pricedLine?.appliedPromotionCode ?? null;
                  const variantLabel = [line.productVariantLabel, line.variantSize, line.variantColor, line.lineNote ? `Note ${line.lineNote}` : null].filter(Boolean).join(" · ");
                  const lineKey = basketLineKey(line);
                  const configuredDiscountRate = resolveConfiguredPosDiscountRate(line.configuredDiscountRate);
                  const preferredBatch = line.preferredBatchId
                    ? workspace.inventoryBatches.find((batch) => batch.batchId === line.preferredBatchId) ?? null
                    : null;

                  return (
                    <div className="rms-table-row" key={lineKey}>
                      <strong className="rms-cart-index">{index + 1}</strong>
                      <div className="rms-cart-item">
                        <strong>{line.product.productName}</strong>
                        <small>{line.product.productCode}{variantLabel ? ` · ${variantLabel}` : ""} · {line.sellingUnitOfMeasure}{line.uomConversionFactor !== 1 ? ` × ${formatNumber.format(line.uomConversionFactor)} = ${formatNumber.format(line.baseQuantity)} ${line.baseUnitOfMeasure}` : ""}{preferredBatch ? ` · Batch ${preferredBatch.batchNo}` : line.product.trackExpiry ? " · Batch FEFO" : ""}{promotionLabel ? ` · ${promotionLabel}` : ""}</small>
                        <label className="rms-pos-discount-select is-line">
                          <span>Disc</span>
                          <select
                            disabled={isRecalledBasket || configuredPosDiscountRates.length === 0}
                            onChange={(event) => {
                              const nextRate = resolveConfiguredPosDiscountRate(event.target.value);

                              setBasket((lines) =>
                                lines.map((item) =>
                                  basketLineKey(item) === lineKey
                                    ? { ...item, configuredDiscountRate: nextRate }
                                    : item
                                )
                              );
                            }}
                            value={configuredDiscountRate?.toFixed(2) ?? ""}
                          >
                            <option value="">{configuredPosDiscountRates.length ? "None" : "No rates"}</option>
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
                        disabled={isRecalledBasket}
                        min="0.001"
                        onChange={(event) => {
                          const nextQuantity = Math.max(0.001, Number(event.target.value) || 1);

                          try {
                            const nextBaseQuantity = calculatePosBaseQuantity(
                              nextQuantity,
                              line.uomConversionFactor
                            );
                            setBasket((lines) =>
                              lines.map((item) =>
                                basketLineKey(item) === lineKey
                                  ? { ...item, quantity: nextQuantity, baseQuantity: nextBaseQuantity }
                                  : item
                              )
                            );
                          } catch (error) {
                            setCheckoutMessage(
                              error instanceof Error ? error.message : "Enter a valid selling quantity."
                            );
                          }
                        }}
                        step="0.001"
                        type="number"
                        value={line.quantity}
                      />
                      <span className="rms-cart-price">{formatMoney(line.unitPrice, currencyCode)}</span>
                      <strong className="rms-cart-total">{formatMoney(lineTotal, currencyCode)}</strong>
                      <button
                        aria-label={`Remove ${line.product.productName}`}
                        className="rms-icon-button is-danger"
                        disabled={isRecalledBasket}
                        onClick={() => setBasket((lines) => lines.filter((item) => basketLineKey(item) !== lineKey))}
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="rms-checkout-dock">
              <div className="rms-total-strip is-sale-totals">
                <div className="rms-stat"><span>Subtotal</span><strong>{formatMoney(summarySubtotal, currencyCode)}</strong></div>
                <div className="rms-stat"><span>Discount</span><strong>{promotionDiscountAmount > 0 ? `-${formatMoney(promotionDiscountAmount, currencyCode)}` : formatMoney(0, currencyCode)}</strong></div>
                <div className="rms-stat"><span>Tax</span><strong>{formatMoney(taxAmount, currencyCode)}</strong></div>
                <div className="rms-stat is-good"><span>Total</span><strong>{formatMoney(total, currencyCode)}</strong></div>
              </div>
              {showPromotionSummary || showLoyaltySummary ? (
                <div className={`rms-loyalty-strip${showPromotionSummary && !showLoyaltySummary ? " is-promotions-only" : !showPromotionSummary && showLoyaltySummary ? " is-loyalty-only" : ""}`}>
                  {showPromotionSummary ? (
                    <div>
                      <span>Promotions</span>
                      <strong>-{formatMoney(promotionDiscountAmount, currencyCode)}</strong>
                    </div>
                  ) : null}
                  {showLoyaltySummary ? (
                    <>
                      <div>
                        <span>Loyalty</span>
                        <strong>{formatNumber.format(selectedCustomer?.loyaltyPointsBalance ?? 0)} pts{loyaltyRedemptionAmount > 0 ? ` · -${formatMoney(loyaltyRedemptionAmount, currencyCode)}` : ""}</strong>
                      </div>
                      <input
                        aria-label="Loyalty points to redeem"
                        disabled={isRecalledBasket || !basket.length}
                        min="0"
                        onChange={(event) => setLoyaltyPointsToRedeem(event.target.value)}
                        step={workspace.loyaltyPolicy.loyaltyRedemptionPointsStep}
                        type="number"
                        value={loyaltyPointsToRedeem}
                      />
                      <button
                        className="rms-row-button"
                        disabled={isRecalledBasket || !canApplyMaxLoyaltyRedemption}
                        onClick={() => setLoyaltyPointsToRedeem(String(loyaltyRedemption.maxRedeemablePoints))}
                        type="button"
                      >
                        Redeem
                      </button>
                      <button className="rms-row-button" disabled={isRecalledBasket || requestedLoyaltyPoints <= 0} onClick={() => setLoyaltyPointsToRedeem("0")} type="button">Clear</button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {saleMode !== "SALE" && !activeSalesOrder ? (
                <div className="rms-payment-panel is-order-mode">
                  <div className="rms-payment-toolbar">
                    <div>
                      <strong>Deposit payments</strong>
                      <span>
                        {nonCreditTenderMethods.length
                          ? `Add one or more payment methods for this ${saleMode === "LAYAWAY" ? "layaway" : "sales order"}.`
                          : "No non-credit tender methods have synced for deposits."}
                      </span>
                    </div>
                    <button
                      className="rms-row-button is-add"
                      disabled={isPostingPosAction || nonCreditTenderMethods.length === 0}
                      onClick={() => addPaymentDraft(setPaymentDrafts)}
                      type="button"
                    >
                      Add payment
                    </button>
                  </div>
                  <div className="rms-payment-summary">
                    <strong>{formatMoney(paymentTotal, currencyCode)}</strong>
                    <span>
                      {selectedCustomer ? `${saleMode === "LAYAWAY" ? "Layaway" : "Order"} customer ${selectedCustomer.fullName}` : `Attach a customer before saving the ${saleMode === "LAYAWAY" ? "layaway" : "order"}`}
                      {" · "}
                      Balance {formatMoney(Math.max(0, total - paymentTotal), currencyCode)}
                    </span>
                    <button className="rms-button is-primary" disabled={!canSaveSalesOrder} onClick={() => void saveSalesOrder()} type="button">{saleMode === "LAYAWAY" ? "Save layaway" : "Save order"}</button>
                  </div>
                  {saleMode === "LAYAWAY" ? (
                    <div className="rms-layaway-opening-options">
                      <label>
                        <span>Expiry date and time (optional)</span>
                        <input
                          min={new Date().toISOString().slice(0, 16)}
                          onChange={(event) => setLayawayExpiresAt(event.target.value)}
                          type="datetime-local"
                          value={layawayExpiresAt}
                        />
                      </label>
                      <div>
                        <strong>Minimum opening deposit</strong>
                        <span>{formatMoney(layawayMinimumDepositAmount, currencyCode)} ({workspace.optionSettings.layawaySettings.minimumDepositPercent}%)</span>
                      </div>
                      {workspace.capabilities.canOverrideLayawayPolicy ? (
                        <label className="rms-checkbox-field">
                          <input
                            checked={layawayPolicyOverrideApproved}
                            onChange={(event) => setLayawayPolicyOverrideApproved(event.target.checked)}
                            type="checkbox"
                          />
                          <span>Approve deposit policy override</span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {paymentDrafts.map((draft, index) => {
                    const tender = tenderForDraft(draft);
                    return (
                      <div className="rms-payment-row" key={draft.id}>
                        <select
                          onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { tenderMethodCode: event.target.value, bankAccountId: "" })}
                          value={draft.tenderMethodCode}
                        >
                          {nonCreditTenderMethods.length ? (
                            nonCreditTenderMethods.map((method) => (
                              <option key={method.tenderMethodCode} value={method.tenderMethodCode}>{method.tenderMethodName}</option>
                            ))
                          ) : (
                            <option value="">No non-credit tenders</option>
                          )}
                        </select>
                        <select
                          disabled={!tender?.requiresBankAccount}
                          onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { bankAccountId: event.target.value })}
                          value={draft.bankAccountId}
                        >
                          <option value="">Bank account</option>
                          {workspace.bankAccounts.map((account) => (
                            <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.accountNumber}</option>
                          ))}
                        </select>
                        <input
                          min="0"
                          onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { amount: event.target.value })}
                          step="0.01"
                          type="number"
                          value={draft.amount}
                        />
                        <input
                          onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { reference: event.target.value })}
                          placeholder={tender?.requiresReference ? "Deposit reference required" : "Deposit reference"}
                          value={draft.reference}
                        />
                        <button aria-label={`Remove payment ${index + 1}`} className="rms-icon-button is-danger rms-payment-remove-button" onClick={() => removePaymentDraft(setPaymentDrafts, draft.id)} title="Remove payment" type="button"><TrashIcon /></button>
                      </div>
                    );
                  })}
                  {salesOrderDepositOver ? <p className="rms-inline-message">Deposits cannot be greater than the order total.</p> : null}
                  {layawayDepositShort && !(workspace.capabilities.canOverrideLayawayPolicy && layawayPolicyOverrideApproved) ? <p className="rms-inline-message">The layaway opening deposit must be at least {formatMoney(layawayMinimumDepositAmount, currencyCode)}.</p> : null}
                  {!nonCreditTenderMethods.length ? <p className="rms-inline-message">Sync at least one active non-credit tender from HQ before adding sales order deposits.</p> : null}
                  {salesOrderHasInvalidTender ? <p className="rms-inline-message">Choose an active non-credit tender for each deposit row.</p> : null}
                  {missingBankAccountTender ? <p className="rms-inline-message">Select the bank, branch, and account number for bank-backed deposit tenders.</p> : null}
                  {missingReferenceTender ? <p className="rms-inline-message">Enter the required deposit reference before saving the order.</p> : null}
                  {!hasOpenShift ? <p className="rms-inline-message">Open a shift before saving sales orders.</p> : null}
                </div>
              ) : (
              <div className="rms-payment-panel">
                <div className="rms-payment-summary">
                  <strong>{formatMoney(payableTotal, currencyCode)}</strong>
                  <span>{activeSalesOrder ? `Paid ${formatMoney(activeSalesOrder.paidAmount, currencyCode)} · ` : ""}Due {formatMoney(amountDue, currencyCode)} · Change {formatMoney(changeDue, currencyCode)}</span>
                  <button className="rms-row-button is-add" onClick={() => addPaymentDraft(setPaymentDrafts)} type="button">Add</button>
                </div>
                {paymentDrafts.map((draft, index) => {
                  const tender = tenderForDraft(draft);
                  return (
                    <div className="rms-payment-row" key={draft.id}>
                      <select
                        onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { tenderMethodCode: event.target.value, bankAccountId: "" })}
                        value={draft.tenderMethodCode}
                      >
                        {workspace.tenderMethods.map((method) => {
                          const disableStoreCredit =
                            isStoreCreditTender(method) && (!selectedCustomer || !selectedCustomer.allowCreditSales);

                          return (
                            <option disabled={disableStoreCredit} key={method.tenderMethodCode} value={method.tenderMethodCode}>
                              {method.tenderMethodName}
                              {disableStoreCredit ? " · customer required" : ""}
                            </option>
                          );
                        })}
                      </select>
                      <select
                        disabled={!tender?.requiresBankAccount}
                        onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { bankAccountId: event.target.value })}
                        value={draft.bankAccountId}
                      >
                        <option value="">Bank account</option>
                        {workspace.bankAccounts.map((account) => (
                          <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.accountNumber}</option>
                        ))}
                      </select>
                      <input
                        onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { amount: event.target.value })}
                        type="number"
                        value={draft.amount}
                      />
                      <input
                        onChange={(event) => updatePaymentDraft(setPaymentDrafts, draft.id, { reference: event.target.value })}
                        placeholder={tender?.requiresReference ? "Reference required" : "Reference"}
                        value={draft.reference}
                      />
                      <button aria-label={`Remove payment ${index + 1}`} className="rms-icon-button is-danger rms-payment-remove-button" onClick={() => removePaymentDraft(setPaymentDrafts, draft.id)} title="Remove payment" type="button"><TrashIcon /></button>
                    </div>
                  );
                })}
                {basketRequiresManagerOverride ? (
                  <div className="rms-manager-form rms-override-form">
                    <label><span>Manager</span><input onChange={(event) => setManagerOverrideCode(event.target.value)} placeholder="Login" value={managerOverrideCode} /></label>
                    <label><span>Password</span><input onChange={(event) => setManagerOverridePassword(event.target.value)} type="password" value={managerOverridePassword} /></label>
                    <label><span>Reason</span><input onChange={(event) => setManagerOverrideNote(event.target.value)} placeholder="Price approval" value={managerOverrideNote} /></label>
                  </div>
                ) : null}
                <button className="rms-button is-primary rms-pay-button" disabled={!canCheckout} onClick={() => void checkout()} type="button">{isCheckingOut ? "Posting..." : activeSalesOrder ? "Fulfil order" : "Pay"}</button>
                {missingBankAccountTender ? <p className="rms-inline-message">Select the bank, branch, and account number for bank-backed tenders.</p> : null}
                {missingReferenceTender ? <p className="rms-inline-message">Enter the required payment reference before checkout.</p> : null}
                {isTenderOverWithoutChange ? <p className="rms-inline-message">Over-tendered payments need a cash tender that allows change.</p> : null}
                {storeCreditValidationMessage ? <p className="rms-inline-message">{storeCreditValidationMessage}</p> : null}
                {!hasOpenShift ? <p className="rms-inline-message">Open a shift before posting POS transactions.</p> : null}
              </div>
              )}
              {checkoutMessage ? <p className="rms-inline-message">{checkoutMessage}</p> : null}
              </div>
            </section>
            <section className="rms-panel rms-product-panel">
              <div className="rms-panel-title"><span>Products</span><h2>Catalog</h2><button className="rms-button" onClick={() => router.refresh()} type="button">Refresh</button></div>
              <div className="rms-filter-row">
                <input onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search product, SKU, barcode" value={searchQuery} />
                <select onChange={(event) => setCatalogDepartment(event.target.value)} value={catalogDepartment}>
                  <option value="">All departments</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <select onChange={(event) => setCatalogCategory(event.target.value)} value={catalogCategory}>
                  <option value="">All categories</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="rms-product-grid">
                {filteredProducts.length ? filteredProducts.map((product) => (
                  <button className="rms-product-tile" disabled={isRecalledBasket} key={product.productId} onClick={() => addProduct(product)} type="button">
                    {product.imageUrl ? <img alt="" src={product.imageUrl} /> : <span className="rms-product-placeholder">No image</span>}
                    <strong>{product.productName}</strong>
                    <span>{formatCatalogAvailability(product)}</span>
                    <b>{product.mustEnterPriceAtPos ? "Enter price" : formatMoney(product.price, currencyCode)}</b>
                  </button>
                )) : (
                  <div className="rms-empty-catalog">
                    {saleMode !== "SALE"
                      ? "No active catalog items are available for this online store."
                      : "No stock or service items are available for this online store location."}
                  </div>
                )}
              </div>
            </section>
            <aside className="rms-panel rms-pos-actions">
              <div className="rms-action-mode">
                <button className={`rms-action-button ${saleMode === "SALE" && !activeSalesOrder ? "is-selected" : ""}`} disabled={isRecalledBasket} onClick={() => setSaleMode("SALE")} type="button">Sale mode</button>
                <button className={`rms-action-button is-order ${saleMode === "SALES_ORDER" ? "is-selected" : ""}`} disabled={isRecalledBasket} onClick={activateSalesOrderMode} type="button">Sales order mode</button>
                <button className={`rms-action-button is-order ${saleMode === "LAYAWAY" ? "is-selected" : ""}`} disabled={isRecalledBasket || !workspace.optionSettings.layawaySettings.enabled || !workspace.capabilities.canCreateLayaway} onClick={activateLayawayMode} type="button">Layaway mode</button>
              </div>
              <button className="rms-action-button is-clear" disabled={!hasSaleScreenState} onClick={clearSaleScreen} type="button">{activeSalesOrder ? "Exit fulfilment" : "Clear screen"}</button>
              <button className="rms-action-button is-hold" disabled={isPostingPosAction || isRecalledBasket || !hasOpenShift || !basket.length} onClick={() => void holdSale()} type="button">Hold sale</button>
              <button className="rms-action-button is-details" disabled={isRecalledBasket} onClick={() => setActiveDrawer("details")} type="button">Details</button>
              <button className="rms-action-button is-pending-orders" onClick={() => { setActiveDrawer("orders"); void refreshPendingSalesOrders(); }} type="button">Pending orders</button>
              <button className="rms-action-button is-account-pay" disabled={!hasOpenShift || !workspace.tenderMethods.length} onClick={() => setActiveDrawer("account")} type="button">Account pay</button>
              <button className="rms-action-button is-recall" disabled={!heldSales.length} onClick={() => setActiveDrawer("held")} type="button">Recall held</button>
              <button className="rms-action-button is-receipts" onClick={() => setActiveDrawer("receipts")} type="button">Receipts</button>
              <div className="rms-shift-rail">
                <button className="rms-action-button is-report" disabled={!currentShift} onClick={() => {
                  if (printShiftReport("X")) {
                    setActiveDrawer("report");
                    setActiveReport("sales");
                  }
                }} type="button">X report</button>
                {!currentShift ? (
                  <>
                  <input className="rms-action-input" min="0" onChange={(event) => handleShiftOpeningFloatChange(event.target.value)} placeholder="Opening float" step="0.01" type="number" value={shiftOpeningFloat} />
                  <button className="rms-action-button is-open-shift" disabled={isOpeningShift} onClick={() => void openShift()} type="button">{isOpeningShift ? "Opening..." : "Open shift"}</button>
                  </>
                ) : null}
                <button className="rms-action-button is-close-shift" disabled={!currentShift} onClick={requestCloseShift} type="button">Close shift</button>
              </div>
              <div className="rms-pos-license-card"><span>Terminal license</span><strong>Licensed</strong><small>online-web</small><b>Licensed</b></div>
            </aside>
            {activeDrawer === "details" ? (
              <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
                <section className="rms-dialog">
                  <div className="rms-panel-title">
                    <div><span>Transaction</span><h2>Additional details</h2></div>
                    <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Close</button>
                  </div>
                  <label className="rms-note-field">
                    <span>Reference</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => {
                        setTransactionReference(event.target.value);
                        setTransactionReferenceSearchDismissed(false);
                      }}
                      placeholder="Customer PO, delivery note, promo ref"
                      value={transactionReference}
                    />
                  </label>
                  {transactionReferenceMatches.length > 0 ? (
                    <div className="rms-reference-suggestions">
                      {transactionReferenceMatches.map((match) => (
                        <button
                          key={match.id}
                          onClick={() => {
                            setTransactionReference(match.reference);
                            setTransactionNote(match.details ?? "");
                            setTransactionReferenceMatches([]);
                            setTransactionReferenceSearchDismissed(true);
                          }}
                          type="button"
                        >
                          <span>
                            <strong>{match.reference}</strong>
                            <small>
                              {match.details ??
                                match.customerName ??
                                match.sourceTransactionNo ??
                                "No saved details"}
                            </small>
                          </span>
                          <small>{match.sourceTransactionNo ?? match.source}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="rms-note-field">
                    <span>Service type</span>
                    <select
                      onChange={(event) => setTransactionServiceType(event.target.value)}
                      value={transactionServiceType}
                    >
                      {onlineStoreServiceTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rms-note-field"><span>Details</span><textarea onChange={(event) => setTransactionNote(event.target.value)} placeholder="Additional transaction details for the receipt" value={transactionNote} /></label>
                  <div className="rms-dialog-actions">
                    <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Cancel</button>
                    <button className="rms-button is-primary" onClick={() => setActiveDrawer(null)} type="button">Save</button>
                  </div>
                </section>
              </div>
            ) : null}
            {activeDrawer === "held" ? (
              <section className="rms-panel rms-receipt-drawer">
                <div className="rms-panel-title">
                  <div><span>Held sales</span><h2>Recall baskets</h2></div>
                  <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Close</button>
                </div>
                <div className="rms-receipt-filters">
                  <input onChange={(event) => setHeldSaleQuery(event.target.value)} placeholder="Basket, customer, phone" value={heldSaleQuery} />
                  <select onChange={(event) => setHeldSaleWindowDays(event.target.value)} value={heldSaleWindowDays}>
                    <option value="1">Today</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                  </select>
                  <StatusPill>{`${heldSaleRows.length} shown`}</StatusPill>
                </div>
                <div className="rms-list rms-receipt-list">
                  {heldSaleRows.length ? heldSaleRows.map((heldSale) => (
                    <div className="rms-list-row rms-receipt-row" key={heldSale.transactionId}>
                      <div>
                        <strong>{heldSale.transactionNo}</strong>
                        <span>{heldSale.customerName} · {formatNumber.format(heldSale.itemCount)} item(s)</span>
                        <small>{new Date(heldSale.updatedAt).toLocaleString()}</small>
                      </div>
                      <strong>{formatMoney(heldSale.totalAmount, currencyCode)}</strong>
                      <div className="rms-receipt-actions">
                        <button className="rms-row-button" disabled={isPostingPosAction || Boolean(basket.length)} onClick={() => resumeHeldSale(heldSale)} type="button">Resume</button>
                      </div>
                    </div>
                  )) : <div className="rms-empty-catalog">No held sales match the current filters.</div>}
                </div>
              </section>
            ) : null}
            {activeDrawer === "orders" ? (
              <section className="rms-panel rms-receipt-drawer">
                <div className="rms-panel-title">
                  <div><span>Sales orders</span><h2>Fulfilment</h2></div>
                  <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Close</button>
                </div>
                <div className="rms-receipt-filters">
                  <input onChange={(event) => setSalesOrderQuery(event.target.value)} placeholder="Order, customer, status" value={salesOrderQuery} />
                  <select onChange={(event) => setSalesOrderWindowDays(event.target.value)} value={salesOrderWindowDays}>
                    <option value="1">Today</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                  </select>
                  <StatusPill>{`${salesOrderRows.length} shown`}</StatusPill>
                </div>
                {workspace.salesOrderRouting.isFulfilmentStore ? (
                  <div className="rms-receipt-filters">
                    <button
                      className="rms-row-button"
                      disabled={!selectableFulfilmentSalesOrderIds.length || isPostingPosAction}
                      onClick={() =>
                        setSelectedFulfilmentSalesOrderIds((current) =>
                          current.length === selectableFulfilmentSalesOrderIds.length
                            ? []
                            : selectableFulfilmentSalesOrderIds
                        )
                      }
                      type="button"
                    >
                      {selectedFulfilmentSalesOrderIds.length === selectableFulfilmentSalesOrderIds.length ? "Clear" : "Select all"}
                    </button>
                    <input
                      onChange={(event) => setSalesOrderTransferNote(event.target.value)}
                      placeholder="Transfer note"
                      value={salesOrderTransferNote}
                    />
                    <button
                      className="rms-button is-primary"
                      disabled={isPostingPosAction || !selectedFulfilmentSalesOrders.length}
                      onClick={() => void createSalesOrderTransferOuts()}
                      type="button"
                    >
                      Create transfer out
                    </button>
                  </div>
                ) : null}
                <div className="rms-list rms-receipt-list">
                  {salesOrderRows.length ? salesOrderRows.map((order) => {
                    const isLayaway = order.orderType === "LAYAWAY";
                    const paymentRows = isLayaway
                      ? workspace.reports.layawayPaymentRows.filter((payment) => payment.orderNo === order.orderNo)
                      : [];
                    const canFulfil =
                      !isLayaway ||
                      (workspace.capabilities.canFulfilLayaway &&
                        (order.layawayPolicy?.requireFullPaymentBeforeFulfilment === false || order.balanceAmount <= 0.005));
                    const detailsOpen = expandedLayawayOrderId === order.orderId;

                    return (
                      <div className="rms-sales-order-entry" key={order.orderId}>
                        <div className="rms-list-row rms-receipt-row">
                          {order.isFulfilmentOrder ? (
                            <input
                              aria-label={`Select ${order.orderNo}`}
                              checked={selectedFulfilmentSalesOrderIds.includes(order.orderId)}
                              disabled={isPostingPosAction || order.status !== "OPEN"}
                              onChange={(event) =>
                                setSelectedFulfilmentSalesOrderIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, order.orderId])]
                                    : current.filter((orderId) => orderId !== order.orderId)
                                )
                              }
                              type="checkbox"
                            />
                          ) : null}
                          <div>
                            <strong>{order.orderNo}</strong>
                            <span>{order.customerName} · {order.sourceTransactionNo} · {order.originStoreName}</span>
                            <small>
                              {isLayaway ? "Layaway" : "Sales order"} · {formatNumber.format(order.itemCount)} item(s) · {new Date(order.createdAt).toLocaleString()}
                              {isLayaway ? ` · Reservation ${order.reservationStatus}` : ""}
                            </small>
                          </div>
                          <div className="rms-order-money-summary">
                            <strong>{formatMoney(order.totalAmount, currencyCode)}</strong>
                            {isLayaway ? <small>Paid {formatMoney(order.paidAmount, currencyCode)} · Due {formatMoney(order.balanceAmount, currencyCode)}</small> : null}
                          </div>
                          <div className="rms-receipt-actions">
                            <StatusPill tone={order.status === "OPEN" ? "warning" : order.status === "FULFILLED" ? "good" : "neutral"}>{order.status}</StatusPill>
                            {isLayaway ? (
                              <button className="rms-row-button" onClick={() => setExpandedLayawayOrderId(detailsOpen ? null : order.orderId)} type="button">{detailsOpen ? "Hide" : "Details"}</button>
                            ) : null}
                            <button className="rms-row-button" disabled={isPostingPosAction || Boolean(basket.length) || order.status !== "OPEN" || order.isFulfilmentOrder || !canFulfil} onClick={() => fulfilSalesOrder(order)} type="button">Fulfil</button>
                            {isLayaway && order.balanceAmount > 0.005 ? (
                              <button className="rms-row-button" disabled={isPostingPosAction || !workspace.capabilities.canReceiveLayawayPayment} onClick={() => openLayawayAction("PAYMENT", order)} type="button">Payment</button>
                            ) : null}
                            {isLayaway && order.reservationStatus === "ACTIVE" ? (
                              <button className="rms-row-button" disabled={isPostingPosAction || !workspace.capabilities.canReleaseLayawayReservation} onClick={() => openLayawayAction("RELEASE", order)} type="button">Release stock</button>
                            ) : null}
                            {isLayaway && order.layawayExpiresAt && Date.parse(order.layawayExpiresAt) <= Date.now() ? (
                              <button className="rms-row-button" disabled={isPostingPosAction || !workspace.capabilities.canReleaseLayawayReservation} onClick={() => openLayawayAction("EXPIRE", order)} type="button">Expire</button>
                            ) : null}
                            <button className="rms-row-button is-danger" disabled={isPostingPosAction || order.status !== "OPEN" || order.isFulfilmentOrder || (isLayaway && !workspace.capabilities.canCancelLayaway)} onClick={() => isLayaway ? openLayawayAction("CANCEL", order) : void cancelSalesOrder(order)} type="button">Cancel</button>
                          </div>
                        </div>
                        {isLayaway && detailsOpen ? (
                          <div className="rms-layaway-order-details">
                            <div className="rms-layaway-detail-grid">
                              <div><span>Minimum deposit</span><strong>{formatMoney(order.minimumDepositAmount, currencyCode)}</strong></div>
                              <div><span>Reservation</span><strong>{order.reservationStatus}</strong></div>
                              <div><span>Expires</span><strong>{order.layawayExpiresAt ? new Date(order.layawayExpiresAt).toLocaleString() : "No expiry"}</strong></div>
                              <div><span>Created by</span><strong>{order.operatorName ?? "Online cashier"}</strong></div>
                            </div>
                            <div className="rms-layaway-line-grid">
                              {order.lines.map((line) => (
                                <div key={`${order.orderId}-${line.productId}-${line.variantSize ?? ""}-${line.variantColor ?? ""}`}>
                                  <span>{line.productName}</span>
                                  <strong>{formatNumber.format(line.quantity)} {line.sellingUnitOfMeasure ?? line.baseUnitOfMeasure ?? "EA"} · {formatMoney(line.lineTotal, currencyCode)}</strong>
                                </div>
                              ))}
                            </div>
                            <div className="rms-layaway-payment-history">
                              <strong>Payment history</strong>
                              {paymentRows.length ? paymentRows.map((payment) => (
                                <div key={payment.paymentId}>
                                  <span>{new Date(payment.receivedAt).toLocaleString()} · {payment.tenderName}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                                  <strong>{formatMoney(payment.amount, currencyCode)}</strong>
                                </div>
                              )) : <small>No payment rows are available yet.</small>}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  }) : <div className="rms-empty-catalog">No sales orders match the current filters.</div>}
                </div>
              </section>
            ) : null}
            {layawayActionDraft ? (
              <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
                <section className="rms-dialog rms-layaway-action-dialog">
                  <div className="rms-panel-title">
                    <div>
                      <span>Layaway · {layawayActionDraft.order.orderNo}</span>
                      <h2>
                        {layawayActionDraft.kind === "PAYMENT"
                          ? "Receive installment"
                          : layawayActionDraft.kind === "CANCEL"
                            ? "Cancel and refund"
                            : layawayActionDraft.kind === "RELEASE"
                              ? "Release reserved stock"
                              : "Expire layaway"}
                      </h2>
                    </div>
                    <button className="rms-button" disabled={isPostingPosAction} onClick={() => setLayawayActionDraft(null)} type="button">Close</button>
                  </div>
                  <div className="rms-layaway-detail-grid">
                    <div><span>Order total</span><strong>{formatMoney(layawayActionDraft.order.totalAmount, currencyCode)}</strong></div>
                    <div><span>Paid</span><strong>{formatMoney(layawayActionDraft.order.paidAmount, currencyCode)}</strong></div>
                    <div><span>Balance</span><strong>{formatMoney(layawayActionDraft.order.balanceAmount, currencyCode)}</strong></div>
                    <div><span>Reservation</span><strong>{layawayActionDraft.order.reservationStatus}</strong></div>
                  </div>
                  {layawayActionNeedsPayment ? (
                    <div className="rms-layaway-payment-list">
                      <div className="rms-payment-toolbar">
                        <div>
                          <strong>{layawayActionDraft.kind === "CANCEL" ? "Refund tenders" : "Installment tenders"}</strong>
                          <span>{layawayActionDraft.kind === "CANCEL" ? "Refund due" : "Maximum payment"} {formatMoney(layawayActionExpectedAmount, currencyCode)}</span>
                        </div>
                        <button className="rms-row-button is-add" disabled={isPostingPosAction || !nonCreditTenderMethods.length} onClick={() => addPaymentDraft(setLayawayActionPayments)} type="button">Add tender</button>
                      </div>
                      {layawayActionPayments.map((payment, index) => {
                        const tender = tenderForDraft(payment);
                        return (
                          <div className="rms-payment-row" key={payment.id}>
                            <select disabled={isPostingPosAction} onChange={(event) => updatePaymentDraft(setLayawayActionPayments, payment.id, { tenderMethodCode: event.target.value, bankAccountId: "" })} value={payment.tenderMethodCode}>
                              {nonCreditTenderMethods.map((method) => <option key={method.tenderMethodCode} value={method.tenderMethodCode}>{method.tenderMethodName}</option>)}
                            </select>
                            <select disabled={isPostingPosAction || !tender?.requiresBankAccount} onChange={(event) => updatePaymentDraft(setLayawayActionPayments, payment.id, { bankAccountId: event.target.value })} value={payment.bankAccountId}>
                              <option value="">Bank account</option>
                              {workspace.bankAccounts.map((account) => <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.accountNumber}</option>)}
                            </select>
                            <input disabled={isPostingPosAction} min="0.01" onChange={(event) => updatePaymentDraft(setLayawayActionPayments, payment.id, { amount: event.target.value })} step="0.01" type="number" value={payment.amount} />
                            <input disabled={isPostingPosAction} onChange={(event) => updatePaymentDraft(setLayawayActionPayments, payment.id, { reference: event.target.value })} placeholder={tender?.requiresReference ? "Reference required" : "Reference"} value={payment.reference} />
                            <button aria-label={`Remove tender ${index + 1}`} className="rms-icon-button is-danger rms-payment-remove-button" disabled={isPostingPosAction || layawayActionPayments.length <= 1} onClick={() => removePaymentDraft(setLayawayActionPayments, payment.id)} title="Remove tender" type="button"><TrashIcon /></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <label className="rms-note-field">
                    <span>{layawayActionDraft.kind === "RELEASE" ? "Reason" : "Note"}</span>
                    <textarea disabled={isPostingPosAction} onChange={(event) => setLayawayActionReason(event.target.value)} placeholder={layawayActionDraft.kind === "RELEASE" ? "Why is the stock reservation being released?" : "Optional action note"} value={layawayActionReason} />
                  </label>
                  {layawayActionPaymentInvalid ? <p className="rms-inline-message">{layawayActionDraft.kind === "CANCEL" ? `Refund tenders must total ${formatMoney(layawayActionExpectedAmount, currencyCode)}.` : `Enter an installment above zero and not more than ${formatMoney(layawayActionExpectedAmount, currencyCode)}.`}</p> : null}
                  {layawayActionMissingBankAccount ? <p className="rms-inline-message">Select a bank account for each bank-backed tender.</p> : null}
                  {layawayActionMissingReference ? <p className="rms-inline-message">Enter the required payment reference.</p> : null}
                  {layawayActionReasonMissing ? <p className="rms-inline-message">Enter a reason before releasing reserved stock.</p> : null}
                  <div className="rms-dialog-actions">
                    <button className="rms-button" disabled={isPostingPosAction} onClick={() => setLayawayActionDraft(null)} type="button">Cancel</button>
                    <button className={`rms-button is-primary${layawayActionDraft.kind === "CANCEL" ? " is-danger" : ""}`} disabled={isPostingPosAction || layawayActionPaymentInvalid || layawayActionMissingBankAccount || layawayActionMissingReference || layawayActionReasonMissing} onClick={() => void submitLayawayAction()} type="button">
                      {isPostingPosAction
                        ? "Working..."
                        : layawayActionDraft.kind === "CANCEL"
                          ? "Cancel layaway"
                          : layawayActionDraft.kind === "RELEASE"
                            ? "Release reserved stock"
                            : layawayActionDraft.kind === "EXPIRE"
                              ? "Expire layaway"
                              : "Receive payment"}
                    </button>
                  </div>
                </section>
              </div>
            ) : null}
            {activeDrawer === "account" ? (
              <section className="rms-panel rms-receipt-drawer">
                <div className="rms-panel-title">
                  <div><span>Customer account</span><h2>Account payments</h2></div>
                  <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Close</button>
                </div>
                <div className="rms-account-layout">
                  <div className="rms-receipt-filters">
                    <input onChange={(event) => setAccountCustomerQuery(event.target.value)} placeholder="Customer name, no, phone, or email" value={accountCustomerQuery} />
                    <StatusPill>{`${accountCustomerRows.length} shown`}</StatusPill>
                  </div>
                  <div className="rms-list">
                    {accountCustomerRows.map((customer) => (
                      <button className="rms-list-row rms-account-customer" key={customer.customerId} onClick={() => {
                        setAccountPaymentCustomerId(customer.customerId);
                        setAccountPaymentAmount(customer.receivableBalanceAmount.toFixed(2));
                      }} type="button">
                        <div><strong>{customer.fullName}</strong><span>{customer.customerNo} · {customer.phone ?? customer.customerType}</span></div>
                        <b>{formatMoney(customer.receivableBalanceAmount, currencyCode)}</b>
                      </button>
                    ))}
                    {!accountCustomerRows.length ? <div className="rms-empty-catalog">No customer balances match the current search.</div> : null}
                  </div>
                  <div className="rms-account-form">
                    <div className="rms-account-summary">
                      <span>Selected customer</span>
                      <strong>{selectedAccountPaymentCustomer?.fullName ?? "Choose customer"}</strong>
                      <small>{selectedAccountPaymentCustomer ? `${selectedAccountPaymentCustomer.customerNo} · ${formatMoney(selectedAccountPaymentCustomer.receivableBalanceAmount, currencyCode)} outstanding` : "Only customers with receivable balances are listed."}</small>
                    </div>
                    <label><span>Tender</span><select disabled={!nonCreditTenderMethods.length} onChange={(event) => {
                      setAccountPaymentTenderCode(event.target.value);
                      setAccountPaymentBankAccountId("");
                    }} value={accountPaymentTenderCode}>{nonCreditTenderMethods.map((method) => <option key={method.tenderMethodCode} value={method.tenderMethodCode}>{method.tenderMethodName}</option>)}</select></label>
                    {accountPaymentTender?.requiresBankAccount ? <label><span>Bank account</span><select onChange={(event) => setAccountPaymentBankAccountId(event.target.value)} value={accountPaymentBankAccountId}><option value="">Select bank account</option>{workspace.bankAccounts.map((account) => <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.branchName} · {account.accountNumber}</option>)}</select></label> : null}
                    <label><span>Amount</span><input onChange={(event) => setAccountPaymentAmount(event.target.value)} type="number" value={accountPaymentAmount} /></label>
                    <label><span>Reference</span><input onChange={(event) => setAccountPaymentReference(event.target.value)} value={accountPaymentReference} /></label>
                    <label><span>Note</span><textarea onChange={(event) => setAccountPaymentNote(event.target.value)} value={accountPaymentNote} /></label>
                    <button className="rms-button is-primary" disabled={!hasOpenShift || isPostingAccountPayment || !selectedAccountPaymentCustomer || !accountPaymentTender || isStoreCreditTender(accountPaymentTender) || (accountPaymentTender.requiresBankAccount && !accountPaymentBankAccountId)} onClick={() => void recordAccountPayment()} type="button">{isPostingAccountPayment ? "Posting..." : "Record payment"}</button>
                    {!nonCreditTenderMethods.length ? <p className="rms-inline-message">Configure a non-credit tender before recording account payments.</p> : null}
                    {accountPaymentMessage ? <p className="rms-inline-message">{accountPaymentMessage}</p> : null}
                  </div>
                </div>
                <div className="rms-list rms-account-entries">
                  {accountPayments.slice(0, 6).map((entry) => (
                    <div className="rms-list-row" key={entry.entryId}>
                      <div><strong>{entry.entryNo}</strong><span>{entry.customerName} · {entry.reference ?? "No reference"}</span></div>
                      <strong>{formatMoney(entry.amount, currencyCode)}</strong>
                      <small>{new Date(entry.occurredAt).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {activeDrawer === "receipts" ? (
              <section className="rms-panel rms-receipt-drawer">
                <div className="rms-panel-title">
                  <div><span>Receipts</span><h2>Lookup and recall</h2></div>
                  <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Close</button>
                </div>
                <div className="rms-receipt-filters is-receipt-history">
                  <select onChange={(event) => setReceiptHistoryKind(event.target.value as ReceiptHistoryKind)} value={receiptHistoryKind}>
                    <option value="SALES">Sales receipts</option>
                    <option value="SALES_ORDER">Sales order receipts</option>
                    <option value="ACCOUNT_PAYMENT">Account payment receipts</option>
                  </select>
                  <input onChange={(event) => setReceiptQuery(event.target.value)} placeholder={receiptHistoryKind === "SALES_ORDER" ? "Order, customer, item" : "Receipt, customer, tender, account entry"} value={receiptQuery} />
                  <select onChange={(event) => setReceiptWindowDays(event.target.value)} value={receiptWindowDays}>
                    <option value="1">Today</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                  </select>
                  <button className="rms-button is-primary" onClick={() => setCheckoutMessage(`${receiptShownCount} receipt row(s) shown.`)} type="button">Filter</button>
                  <StatusPill>{`${receiptShownCount} shown`}</StatusPill>
                </div>
                <div className="rms-list rms-receipt-list">
                  {receiptRows.map((transaction) => {
                    const hasReturnableLines = transaction.transactionType !== "RETURN" && transaction.lines.some((line) => line.returnableQuantity > 0);

                    return (
                      <div className="rms-list-row rms-receipt-row" key={transaction.transactionId}>
                        <div>
                          <strong>{transaction.transactionNo}</strong>
                          <span>{transaction.customerName} · {transaction.transactionType}</span>
                          <small>{transaction.completedAt ? new Date(transaction.completedAt).toLocaleString() : "No completion time"}</small>
                        </div>
                        <strong>{formatMoney(transaction.totalAmount, currencyCode)}</strong>
                        <div className="rms-receipt-actions">
                          <button className="rms-row-button" onClick={() => openTransactionReceipt(transaction)} type="button">Reprint</button>
                          <button className="rms-row-button" disabled={!hasOpenShift || !hasReturnableLines} onClick={() => beginCorrection(transaction.transactionNo, "RETURN")} type="button">Return</button>
                          <button className="rms-row-button" disabled={!hasOpenShift || !hasReturnableLines} onClick={() => beginCorrection(transaction.transactionNo, "EXCHANGE")} type="button">Exchange</button>
                          <button className="rms-row-button is-danger" disabled={!hasOpenShift || !hasReturnableLines} onClick={() => beginVoid(transaction.transactionNo)} type="button">Void</button>
                        </div>
                      </div>
                    );
                  })}
                  {salesOrderReceiptRows.map((order) => (
                    <div className="rms-list-row rms-receipt-row" key={order.orderId}>
                      <div>
                        <strong>{order.orderNo}</strong>
                        <span>{order.customerName} · sales order · {order.status.toLowerCase()}</span>
                        <small>{new Date(order.fulfilledAt ?? order.createdAt).toLocaleString()}</small>
                      </div>
                      <strong>{formatMoney(order.totalAmount, currencyCode)}</strong>
                      <div className="rms-receipt-actions">
                        <button className="rms-row-button" onClick={() => openSalesOrderReceipt(order)} type="button">Reprint</button>
                      </div>
                    </div>
                  ))}
                  {accountPaymentRows.map((entry) => (
                    <div className="rms-list-row rms-receipt-row" key={entry.entryId}>
                      <div>
                        <strong>{entry.entryNo}</strong>
                        <span>{entry.customerName} · account payment</span>
                        <small>{new Date(entry.occurredAt).toLocaleString()}</small>
                      </div>
                      <strong>{formatMoney(entry.amount, currencyCode)}</strong>
                      <div className="rms-receipt-actions">
                        <button className="rms-row-button" onClick={() => openAccountPaymentEntry(entry)} type="button">Reprint</button>
                      </div>
                    </div>
                  ))}
                  {!receiptShownCount ? <div className="rms-empty-catalog">No receipts match the current filters.</div> : null}
                </div>
              </section>
            ) : null}
            {activeDrawer === "report" ? (
              <section className="rms-panel rms-receipt-drawer rms-report-drawer">
                <div className="rms-panel-title">
                  <div><span>Cashier reports</span><h2>My sales</h2></div>
                  <button className="rms-button" onClick={() => setActiveDrawer(null)} type="button">Close</button>
                </div>
                <div className="rms-receipt-filters is-report-filter">
                  <button className={activeReport === "sales" ? "rms-row-button is-selected" : "rms-row-button"} onClick={() => setActiveReport("sales")} type="button">Sales</button>
                  <button className={activeReport === "products" ? "rms-row-button is-selected" : "rms-row-button"} onClick={() => setActiveReport("products")} type="button">Products</button>
                  <button className={activeReport === "tenders" ? "rms-row-button is-selected" : "rms-row-button"} onClick={() => setActiveReport("tenders")} type="button">Tenders</button>
                  <button className="rms-button is-primary" disabled={!currentShift} onClick={() => printShiftReport("X")} type="button">Print X report</button>
                </div>
                <div className="rms-dashboard-mini-grid">
                  <div><span>Net sales</span><strong>{formatMoney(currentShift?.netSalesAmount ?? workspace.metrics.todaySales, currencyCode)}</strong></div>
                  <div><span>Cash</span><strong>{formatMoney(currentShift?.cashTenderedAmount ?? 0, currencyCode)}</strong></div>
                  <div><span>Expected</span><strong>{formatMoney(currentShift?.expectedCashAmount ?? workspace.metrics.expectedCash, currencyCode)}</strong></div>
                  <div><span>Transactions</span><strong>{currentShift?.transactionCount ?? workspace.metrics.todayTransactions}</strong></div>
                </div>
                {activeReport === "sales" ? (
                  <div className="rms-table rms-report-table">
                    <div className="rms-table-head"><span>Receipt</span><span>Type</span><span>Items</span><span>Total</span></div>
                    {workspace.reports.salesRows.filter((row) => row.cashierCode === workspace.operator.loginId).map((row) => (
                      <div className="rms-table-row" key={row.transactionNo}><strong>{row.transactionNo}<small>{row.productPreview}</small></strong><span>{row.transactionType}</span><span>{row.lineCount}</span><b>{formatMoney(row.totalAmount, currencyCode)}</b></div>
                    ))}
                  </div>
                ) : null}
                {activeReport === "products" ? (
                  <div className="rms-table rms-report-table">
                    <div className="rms-table-head"><span>Product</span><span>Qty</span><span>Gross</span><span>Net</span></div>
                    {workspace.reports.productRows.map((row) => (
                      <div className="rms-table-row" key={`${row.productCode}:${row.sellingUnitOfMeasure}`}><strong>{row.productName}<small>{row.productCode} · {row.sellingUnitOfMeasure} · base {formatNumber.format(row.baseQuantity)} {row.baseUnitOfMeasure}</small></strong><span>{formatNumber.format(row.quantity)}</span><span>{formatMoney(row.grossAmount, currencyCode)}</span><b>{formatMoney(row.netAmount, currencyCode)}</b></div>
                    ))}
                  </div>
                ) : null}
                {activeReport === "tenders" ? (
                  <div className="rms-table rms-report-table">
                    <div className="rms-table-head"><span>Tender</span><span>Method</span><span>Txn</span><span>Net</span></div>
                    {(currentShift?.tenderTotals ?? workspace.reports.tenderRows).map((row) => (
                      <div className="rms-table-row" key={`${row.paymentMethod}:${row.tenderMethodCode}`}><strong>{row.tenderMethodName ?? row.paymentMethod}<small>{row.tenderMethodCode ?? "unmapped"}</small></strong><span>{row.paymentMethod}</span><span>{row.transactionCount}</span><b>{formatMoney(row.netAmount, currencyCode)}</b></div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        {openPriceDraft ? (
          <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
            <section className={`rms-dialog rms-item-dialog${openPriceDraft.product.trackExpiry ? " is-batch-selection" : ""}`}>
              <div className="rms-panel-title">
                <div><span>{openPriceDraft.product.trackExpiry ? "Choose stock batch" : "Item details"}</span><h2>{openPriceDraft.product.productName}</h2></div>
                <button className="rms-button" onClick={() => setOpenPriceDraft(null)} type="button">Close</button>
              </div>
              <div className="rms-manager-form">
                <label><span>Quantity</span><input min="0.001" onChange={(event) => setOpenPriceDraft((draft) => draft ? { ...draft, quantity: event.target.value } : draft)} step="0.001" type="number" value={openPriceDraft.quantity} /></label>
                {openPriceIsMatrix ? (
                  <label className="rms-variant-picker"><span>Option</span><input onChange={(event) => setOpenPriceDraft((draft) => draft ? { ...draft, variantSearch: event.target.value } : draft)} placeholder="Search code, barcode, SKU, size, colour" type="search" value={openPriceDraft.variantSearch} /><select onChange={(event) => {
                    const selectedVariant = openPriceDraft.product.matrixVariants.find((variant) => variant.code === event.target.value) ?? null;
                    const sellingUnit = resolveProductSellingUnit(
                      openPriceDraft.product,
                      selectedVariant?.code ?? null
                    );
                    setOpenPriceDraft((draft) => draft ? {
                      ...draft,
                      productVariantCode: selectedVariant?.code ?? "",
                      sellingUnitOfMeasure: sellingUnit.unitOfMeasureCode,
                      unitPrice: draft.product.mustEnterPriceAtPos ? draft.unitPrice : sellingUnit.unitPrice.toFixed(2)
                    } : draft);
                  }} value={openPriceDraft.productVariantCode}>
                    <option value="">Select option</option>
                    {openPriceMatrixVariants.map((variant) => (
                      <option key={variant.code} value={variant.code}>
                        {formatMatrixVariantLabel(variant)} · {formatMoney(variant.unitPrice, currencyCode)} · stock {formatNumber.format(variant.quantityOnHand)}
                      </option>
                    ))}
                  </select></label>
                ) : null}
                {openPriceSellingUnits.length > 0 ? (
                  <label>
                    <span>Selling unit</span>
                    <select
                      onChange={(event) => {
                        const sellingUnit = resolveProductSellingUnit(
                          openPriceDraft.product,
                          openPriceDraft.productVariantCode || null,
                          event.target.value
                        );
                        setOpenPriceDraft((draft) =>
                          draft
                            ? {
                                ...draft,
                                sellingUnitOfMeasure: sellingUnit.unitOfMeasureCode,
                                unitPrice: draft.product.mustEnterPriceAtPos
                                  ? draft.unitPrice
                                  : sellingUnit.unitPrice.toFixed(2)
                              }
                            : draft
                        );
                      }}
                      value={openPriceSelectedSellingUnit?.unitOfMeasureCode ?? ""}
                    >
                      {openPriceSellingUnits.map((sellingUnit) => (
                        <option key={`${sellingUnit.productVariantId ?? "base"}:${sellingUnit.unitOfMeasureCode}`} value={sellingUnit.unitOfMeasureCode}>
                          {sellingUnit.unitOfMeasureName} ({formatNumber.format(sellingUnit.conversionFactor)} {openPriceDraft.product.baseUnitOfMeasure}) · {formatMoney(sellingUnit.unitPrice, currencyCode)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!openPriceIsMatrix && openPriceDraft.product.trackSize ? (
                  <label><span>Size</span><select onChange={(event) => setOpenPriceDraft((draft) => draft ? { ...draft, variantSize: event.target.value } : draft)} value={openPriceDraft.variantSize}>
                    <option value="">Select size</option>
                    {configuredProductSizes.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select></label>
                ) : null}
                {!openPriceIsMatrix && openPriceDraft.product.trackColor ? (
                  <label><span>Colour</span><input aria-label="Colour" onChange={(event) => setOpenPriceDraft((draft) => draft ? { ...draft, variantColor: event.target.value } : draft)} type="color" value={openPriceDraft.variantColor || "#111827"} /></label>
                ) : null}
                {openPriceExpressEligible ? (
                  <div className="rms-field-wide rms-express-charge-field">
                    <label className="rms-express-toggle">
                      <input
                        checked={openPriceDraft.expressChargeSelected}
                        disabled={configuredPosExpressChargeRates.length === 0}
                        onChange={(event) =>
                          setOpenPriceDraft((draft) =>
                            draft
                              ? {
                                  ...draft,
                                  expressChargeSelected: event.target.checked,
                                  expressChargeRate: event.target.checked
                                    ? draft.expressChargeRate ||
                                      configuredPosExpressChargeRates[0]?.toFixed(2) ||
                                      ""
                                    : ""
                                }
                              : draft
                          )
                        }
                        type="checkbox"
                      />
                      <span>Express</span>
                    </label>
                    {openPriceDraft.expressChargeSelected ? (
                      <label>
                        <span>Express rate</span>
                        <select
                          disabled={configuredPosExpressChargeRates.length === 0}
                          onChange={(event) =>
                            setOpenPriceDraft((draft) =>
                              draft ? { ...draft, expressChargeRate: event.target.value } : draft
                            )
                          }
                          value={openPriceDraft.expressChargeRate}
                        >
                          <option value="">Select rate</option>
                          {configuredPosExpressChargeRates.map((rate) => (
                            <option key={rate.toFixed(2)} value={rate.toFixed(2)}>
                              {formatDiscountRate(rate)}%
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {configuredPosExpressChargeRates.length === 0 ? (
                      <small>No express charge rates are configured in HQ.</small>
                    ) : null}
                  </div>
                ) : null}
                <label><span>Unit price</span><input autoFocus min="0.01" onChange={(event) => setOpenPriceDraft((draft) => draft ? { ...draft, unitPrice: event.target.value } : draft)} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitOpenPriceDraft();
                  }
                }} placeholder="0.00" step="0.01" type="number" value={openPriceDraft.unitPrice} /></label>
                <label className="rms-field-wide"><span>Item note</span><textarea onChange={(event) => setOpenPriceDraft((draft) => draft ? { ...draft, lineNote: event.target.value } : draft)} placeholder="Alteration, pickup note, serial remark" rows={3} value={openPriceDraft.lineNote} /></label>
              </div>
              {openPriceDraft.product.trackExpiry && saleMode === "SALE" ? (
                <div className="rms-batch-picker">
                  <div className="rms-batch-picker-title">
                    <div><strong>Stock batch</strong><span>Automatic FEFO uses the earliest valid expiry. Choose a batch to use it first.</span></div>
                    <small>{formatNumber.format(openPriceAvailableBatches.length)} batch(es)</small>
                  </div>
                  <div className="rms-batch-choice-grid">
                    <label className={`rms-batch-choice${!openPriceDraft.preferredBatchId ? " is-selected" : ""}`}>
                      <input checked={!openPriceDraft.preferredBatchId} name="online-preferred-batch" onChange={() => setOpenPriceDraft((draft) => draft ? { ...draft, preferredBatchId: "" } : draft)} type="radio" />
                      <div><strong>Automatic FEFO</strong><span>Earliest valid expiry first</span></div>
                    </label>
                    {openPriceAvailableBatches.map((batch) => (
                      <label className={`rms-batch-choice${openPriceDraft.preferredBatchId === batch.batchId ? " is-selected" : ""}`} key={batch.batchId}>
                        <input checked={openPriceDraft.preferredBatchId === batch.batchId} name="online-preferred-batch" onChange={() => setOpenPriceDraft((draft) => draft ? { ...draft, preferredBatchId: batch.batchId } : draft)} type="radio" />
                        <div><strong>{batch.batchNo}</strong><span>Expires {new Date(batch.expiryDate).toLocaleDateString("en-GB")}</span></div>
                        <small>{formatNumber.format(batch.quantityOnHand)} available</small>
                      </label>
                    ))}
                  </div>
                  {openPriceBatchUnavailable ? <small className="rms-inline-message">No active, non-expired batch is available for this item.</small> : null}
                </div>
              ) : null}
              <div className="rms-dialog-actions">
                <button className="rms-button" onClick={() => setOpenPriceDraft(null)} type="button">Cancel</button>
                <button className="rms-button is-primary" disabled={openPriceBatchUnavailable} onClick={submitOpenPriceDraft} type="button">Add item</button>
              </div>
            </section>
          </div>
        ) : null}

        {shiftCloseDialogOpen ? (
          <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
            <section className="rms-dialog rms-shift-close-dialog">
              <div className="rms-panel-title">
                <div><span>Shift close</span><h2>{currentShift?.shiftNo ?? "No open shift"}</h2></div>
                <button className="rms-button" disabled={isManagerPosting} onClick={() => setShiftCloseDialogOpen(false)} type="button">Close</button>
              </div>
              {currentShift ? (
                <>
                  <div className="rms-stat-grid">
                    <DocumentStat label="Sales" value={formatMoney(currentShift.netSalesAmount, currencyCode)} />
                    <DocumentStat label="Cash" value={formatMoney(currentShift.cashTenderedAmount, currencyCode)} />
                    <DocumentStat label="Expected" value={formatMoney(currentShift.expectedCashAmount, currencyCode)} />
                    <DocumentStat label="Transactions" value={formatNumber.format(currentShift.transactionCount)} />
                  </div>
                  <label className="rms-field">
                    <span>Closing cash amount</span>
                    <input autoFocus min="0" onChange={(event) => setEodDeclaredCash(event.target.value)} step="0.01" type="number" value={eodDeclaredCash} />
                  </label>
                  <div className="rms-dialog-actions">
                    <button className="rms-button" disabled={isManagerPosting} onClick={() => setShiftCloseDialogOpen(false)} type="button">Cancel</button>
                    <button className="rms-button is-primary" disabled={isManagerPosting || !Number.isFinite(Number(eodDeclaredCash))} onClick={() => void recordEod()} type="button">Close shift</button>
                  </div>
                  {managerMessage ? <p className="rms-inline-message">{managerMessage}</p> : null}
                </>
              ) : (
                <EmptyState title="No open shift" detail="Open a shift before running the closeout." />
              )}
            </section>
          </div>
        ) : null}

        {activeWorkspace === "inventory" ? (
          <div className="rms-workspace rms-tabbed-workspace">
            <div className="rms-workspace-tabs">
              {(["stock", "receiving", "transfers", "counts"] as InventoryTab[]).map((tab) => (
                <button className={inventoryTab === tab ? "is-active" : ""} key={tab} onClick={() => setInventoryTab(tab)} type="button">{tab.toUpperCase()}</button>
              ))}
            </div>
            <section className={`rms-panel rms-inventory-browser is-${inventoryTab}`}>
              {inventoryTab === "receiving" ? null : (
                <div className="rms-panel-title">
                  <span>Inventory execution</span>
                  <h2>{inventoryTab.toUpperCase()}</h2>
                  <div className="rms-dialog-button-row">
                    {inventoryTab === "stock" || inventoryTab === "transfers" ? (
                      <button className="rms-button" onClick={() => setRemoteLookupOpen(true)} type="button">HQ lookup</button>
                    ) : null}
                    <button className="rms-button" onClick={() => router.refresh()} type="button">Refresh</button>
                  </div>
                </div>
              )}
              {inventoryTab === "stock" ? (
                <>
                  <div className="rms-workspace-tabs rms-inventory-subtabs" role="tablist" aria-label="Stock views">
                    <button className={activeStockSection === "inventory-browser" ? "is-active" : ""} onClick={() => setActiveStockSection("inventory-browser")} role="tab" type="button">Inventory browser</button>
                    <button className={activeStockSection === "batch-register" ? "is-active" : ""} onClick={() => setActiveStockSection("batch-register")} role="tab" type="button">Batch register</button>
                  </div>
                  <div className="rms-filter-row">
                    <input onChange={(event) => setInventoryQuery(event.target.value)} placeholder="Product, barcode, category" value={inventoryQuery} />
                    <select onChange={(event) => setInventoryLocationId(event.target.value)} value={inventoryLocationId}>
                      <option value="">All locations</option>
                      {workspace.inventoryLocations.map((location) => (
                        <option key={location.locationId} value={location.locationId}>{location.locationName}</option>
                      ))}
                    </select>
                  </div>
                  {activeStockSection === "inventory-browser" ? (
                  <div className="rms-table rms-inventory-table rms-stock-section-grid">
                    <div className="rms-table-head"><span>Product</span><span>Location</span><span>On hand</span><span>Reserved</span><span>Safety</span><span>Web sellable</span><span>Ecommerce</span><span>Expiry</span><span>Price</span></div>
                    {inventoryBrowserRows.map((row) => (
                      <div className="rms-table-row" key={`${row.productId}:${row.locationId}`}>
                        <strong>{row.productName}<small>{row.productCode}{row.trackExpiry ? " · Batch controlled" : ""}</small></strong>
                        <span>{row.locationName}</span>
                        <b className={row.quantityOnHand <= 0 ? "is-empty-stock" : ""}>{formatNumber.format(row.quantityOnHand)}</b>
                        <b>{formatNumber.format(row.activeReservedQuantity)}</b>
                        <span>{formatNumber.format(row.safetyStockLevel ?? 0)}</span>
                        <b>
                          {row.ecommercePickupEligible || row.ecommerceDeliveryEligible
                            ? formatNumber.format(row.ecommerceSellableQuantity)
                            : "-"}
                        </b>
                        <span title={row.ecommerceEligibilityLabel}>
                          {[
                            row.ecommercePickupEligible ? "Pickup" : null,
                            row.ecommerceDeliveryEligible ? "Delivery" : null
                          ]
                            .filter(Boolean)
                            .join(" + ") || "Not eligible"}
                        </span>
                        <span>{row.trackExpiry ? row.earliestExpiryDate ? `${new Date(row.earliestExpiryDate).toLocaleDateString("en-GB")}${row.expiringQuantity > 0 ? ` · ${formatNumber.format(row.expiringQuantity)} soon` : ""}` : "No active batch" : "-"}</span>
                        <span>{formatMoney(row.price, currencyCode)}</span>
                      </div>
                    ))}
                    {!inventoryBrowserRows.length ? <div className="rms-empty-catalog">No inventory-managed items match the current filters.</div> : null}
                  </div>
                  ) : null}
                  {activeStockSection === "batch-register" ? (
                      <div className="rms-table rms-inventory-batch-table rms-stock-section-grid">
                        <div className="rms-table-head"><span>Product</span><span>Batch</span><span>Location</span><span>Expiry</span><span>Qty</span><span>Status</span></div>
                        {visibleInventoryBatchRows.map((batch) => (
                            <div className="rms-table-row" key={batch.batchId}>
                              <div><strong>{batch.productName}</strong><small>{batch.productCode}</small></div>
                              <strong>{batch.batchNo}</strong>
                              <span>{batch.locationName}</span>
                              <span>{new Date(batch.expiryDate).toLocaleDateString("en-GB")}</span>
                              <strong>{formatNumber.format(batch.quantityOnHand)}</strong>
                              <StatusPill tone={batch.daysUntilExpiry <= workspace.optionSettings.expiryAlertLeadDays ? "warning" : "good"}>{batch.daysUntilExpiry < 0 ? "Expired" : batch.daysUntilExpiry === 0 ? "Expires today" : `${batch.daysUntilExpiry} days`}</StatusPill>
                            </div>
                          ))}
                        {!visibleInventoryBatchRows.length ? <EmptyState title="No active batches" detail="No batch or expiry records match the current filters." /> : null}
                      </div>
                  ) : null}
                </>
              ) : null}
              {inventoryTab === "receiving" ? (
                <div className="rms-inventory-execution">
                  <div className="rms-panel-title">
                    <div><span>Inventory execution</span><h2>Receiving</h2></div>
                    <button className="rms-button" onClick={() => router.refresh()} type="button">Refresh</button>
                  </div>
                  <div className="rms-workspace-tabs rms-inventory-subtabs rms-receiving-subtabs" role="tablist" aria-label="Receiving views">
                    <button className={activeReceivingSection === "purchase-orders" ? "is-active" : ""} onClick={() => setActiveReceivingSection("purchase-orders")} role="tab" type="button">Purchase orders</button>
                    <button className={activeReceivingSection === "goods-receipts" ? "is-active" : ""} onClick={() => setActiveReceivingSection("goods-receipts")} role="tab" type="button">Goods receipts</button>
                    <button className={activeReceivingSection === "supplier-returns" ? "is-active" : ""} onClick={() => setActiveReceivingSection("supplier-returns")} role="tab" type="button">Supplier returns</button>
                  </div>
                  <div className="rms-filter-row rms-receiving-filter">
                    <input onChange={(event) => setInventoryDocumentQuery(event.target.value)} placeholder="PO, GRN, supplier, location, product" value={inventoryDocumentQuery} />
                    <StatusPill>{`${purchaseOrderRows.length} PO · ${goodsReceiptRows.length} GRN · ${supplierReturnRows.length} return(s)`}</StatusPill>
                  </div>
                  {activeReceivingSection === "purchase-orders" ? (
                  <div className="rms-receiving-section">
                  <div className="rms-panel-title">
                    <div><span>Receiving</span><h2>Purchase orders</h2></div>
                    <div className="rms-dialog-button-row">
                      <button
                        className="rms-button is-primary"
                        disabled={!workspace.purchaseOrderSuppliers.length || !workspace.inventoryProducts.length}
                        onClick={() => setPurchaseOrderCreateDialogOpen(true)}
                        type="button"
                      >
                        Create PO
                      </button>
                    </div>
                  </div>
                  {purchaseOrderCreateDialogOpen ? (
                    <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
                      <section className="rms-dialog rms-wide-dialog rms-stock-request-dialog">
                        <div className="rms-panel-title">
                          <div><span>Purchasing</span><h2>New purchase order</h2></div>
                          <button className="rms-button" onClick={() => setPurchaseOrderCreateDialogOpen(false)} type="button">Close</button>
                        </div>
                        <div className="rms-form-grid rms-transfer-header-grid">
                          <label>
                            <span>Supplier</span>
                            <select onChange={(event) => setPurchaseOrderCreateSupplierNo(event.target.value)} value={purchaseOrderCreateSupplierNo}>
                              <option value="">Select supplier</option>
                              {workspace.purchaseOrderSuppliers.map((supplier) => <option key={supplier.supplierNo} value={supplier.supplierNo}>{supplier.supplierName} · {supplier.supplierNo}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Receiving location</span>
                            <select onChange={(event) => setPurchaseOrderCreateLocationCode(event.target.value)} value={purchaseOrderCreateLocationCode}>
                              <option value="">Select location</option>
                              {workspace.inventoryLocations.map((location) => <option key={location.locationId} value={location.locationCode}>{location.locationName}</option>)}
                            </select>
                          </label>
                          <label><span>Reference</span><input onChange={(event) => setPurchaseOrderCreateReference(event.target.value)} value={purchaseOrderCreateReference} /></label>
                          <label><span>Note</span><input onChange={(event) => setPurchaseOrderCreateNote(event.target.value)} value={purchaseOrderCreateNote} /></label>
                        </div>
                        <div className="rms-transfer-detail-pane">
                          <div className="rms-form-grid rms-transfer-line-entry">
                            <label>
                              <span>Search product</span>
                              <input
                                onChange={(event) => {
                                  setPurchaseOrderProductSearch(event.target.value);
                                  setPurchaseOrderProductCode("");
                                }}
                                placeholder="Name, code, or SKU"
                                value={purchaseOrderProductSearch}
                              />
                            </label>
                            <label>
                              <span>Product</span>
                              <select onChange={(event) => {
                                const nextCode = event.target.value;
                                const nextProduct = workspace.inventoryProducts.find((product) => product.productCode === nextCode);
                                setPurchaseOrderProductCode(nextCode);
                                setPurchaseOrderProductUnitCost(nextProduct?.unitCost === null || nextProduct?.unitCost === undefined ? "" : String(nextProduct.unitCost));
                              }} value={purchaseOrderProductCode}>
                                <option value="">{filteredPurchaseOrderProducts.length ? "Select item" : "No matching products"}</option>
                                {filteredPurchaseOrderProducts.map((product) => <option key={product.productId} value={product.productCode}>{product.productName} · {product.productCode}{product.sku ? ` · ${product.sku}` : ""}</option>)}
                              </select>
                            </label>
                            <label><span>Quantity</span><input min="0.001" onChange={(event) => setPurchaseOrderProductQuantity(event.target.value)} step="0.001" type="number" value={purchaseOrderProductQuantity} /></label>
                            <label><span>Unit cost</span><input min="0" onChange={(event) => setPurchaseOrderProductUnitCost(event.target.value)} step="0.01" type="number" value={purchaseOrderProductUnitCost} /></label>
                            <button className="rms-button" disabled={!purchaseOrderProductCode} onClick={addOnlinePurchaseOrderLine} type="button">Add line</button>
                          </div>
                          <div className="rms-table rms-stock-request-line-table">
                            <div className="rms-table-head"><span>Item</span><span>Qty / cost</span><span>Remove</span></div>
                            {purchaseOrderCreateLines.map((line) => (
                              <div className="rms-table-row" key={line.id}>
                                <div><strong>{line.productName}</strong><small>{line.productCode}</small></div>
                                <strong>{formatNumber.format(line.quantity)} · {line.unitCost === null ? "Cost pending" : formatMoney(line.unitCost, currencyCode)}</strong>
                                <button aria-label={`Remove ${line.productName}`} className="rms-icon-button is-danger" onClick={() => setPurchaseOrderCreateLines((lines) => lines.filter((candidate) => candidate.id !== line.id))} title={`Remove ${line.productName}`} type="button"><TrashIcon /></button>
                              </div>
                            ))}
                            {!purchaseOrderCreateLines.length ? <EmptyState title="No purchase order lines" /> : null}
                          </div>
                        </div>
                        <div className="rms-dialog-actions">
                          <button className="rms-button" onClick={() => setPurchaseOrderCreateDialogOpen(false)} type="button">Cancel</button>
                          <button className="rms-button is-primary" disabled={isPostingInventory || !purchaseOrderCreateLines.length || !purchaseOrderCreateSupplierNo || !purchaseOrderCreateLocationCode} onClick={() => void createOnlinePurchaseOrder()} type="button">{isPostingInventory ? "Saving..." : "Create and commit"}</button>
                        </div>
                      </section>
                    </div>
                  ) : null}
                  <div className="rms-table rms-receiving-header-table">
                    <div className="rms-table-head"><span>Purchase order</span><span>Supplier</span><span>Location</span><span>Outstanding</span><span>Status</span><span>View</span><span>Receive</span></div>
                    {purchaseOrderRows.map((order) => (
                      <div className="rms-table-row" key={order.purchaseOrderId}>
                        <div><strong>{order.purchaseOrderNo}</strong><small>{formatNumber.format(order.lineCount)} line(s) · updated {formatRelative(order.updatedAt)}</small></div>
                        <div><strong>{order.supplierName ?? "No supplier"}</strong><small>{order.supplierNo ?? "No supplier code"}</small></div>
                        <div><strong>{order.locationName}</strong><small>{order.locationCode}</small></div>
                        <strong>{formatNumber.format(order.outstandingQuantity)}</strong>
                        <StatusPill tone={order.outstandingQuantity > 0 ? "warning" : "good"}>{order.status}</StatusPill>
                        <ActionIconButton label={`View ${order.purchaseOrderNo}`} onClick={() => openPurchaseOrderDialog(order, "view")}>
                          <ViewIcon />
                        </ActionIconButton>
                        <ActionIconButton
                          disabled={isPostingInventory || order.outstandingQuantity <= 0}
                          label={`Receive ${order.purchaseOrderNo}`}
                          onClick={() => openPurchaseOrderDialog(order, "receive")}
                          tone="receive"
                        >
                          <ReceiveIcon />
                        </ActionIconButton>
                      </div>
                    ))}
                    {!purchaseOrderRows.length ? <EmptyState title="No purchase orders" detail="No purchase orders match the current receiving filter." /> : null}
                  </div>
                  </div>
                  ) : null}
                  {activeReceivingSection === "goods-receipts" ? (
                  <div className="rms-receiving-section">
                  <div className="rms-panel-title rms-subsection-title">
                    <div><span>Goods receipt</span><h2>Recent GRNs</h2></div>
                  </div>
                  <div className="rms-table rms-grn-header-table">
                    <div className="rms-table-head"><span>GRN</span><span>Supplier</span><span>Location</span><span>Qty</span><span>View</span><span>Print</span></div>
                    {goodsReceiptRows.map((receipt) => (
                      <div className="rms-table-row" key={receipt.receiptNo}>
                        <div><strong>{receipt.receiptNo}</strong><small>{receipt.purchaseOrderNo ?? "Direct receipt"} · {formatRelative(receipt.receivedAt)}</small></div>
                        <div><strong>{receipt.supplierName ?? "Supplier not set"}</strong><small>{receipt.supplierNo ?? "No supplier code"}</small></div>
                        <div><strong>{receipt.locationName}</strong><small>{receipt.locationCode}</small></div>
                        <strong>{formatNumber.format(receipt.totalQuantity)}</strong>
                        <ActionIconButton label={`View ${receipt.receiptNo}`} onClick={() => setSelectedGoodsReceiptId(receipt.receiptId)}>
                          <ViewIcon />
                        </ActionIconButton>
                        <ActionIconButton label={`Print ${receipt.receiptNo}`} onClick={() => openGoodsReceiptWindow(receipt)} tone="print">
                          <PrintIcon />
                        </ActionIconButton>
                      </div>
                    ))}
                    {!goodsReceiptRows.length ? <EmptyState title="No recent GRNs" detail="Posted browser GRNs will appear here." /> : null}
                  </div>
                  </div>
                  ) : null}
                  {activeReceivingSection === "supplier-returns" ? (
                  <div className="rms-receiving-section">
                  <div className="rms-panel-title rms-subsection-title">
                    <div><span>Supplier return</span><h2>Return against GRN</h2></div>
                  </div>
                  <div className="rms-form-grid rms-supplier-return-form">
                    <label><span>Goods receipt</span><select onChange={(event) => selectSupplierReturnReceipt(event.target.value)} value={supplierReturnGoodsReceiptId}><option value="">Select GRN</option>{workspace.recentGoodsReceipts.map((receipt) => <option key={receipt.receiptId} value={receipt.receiptId}>{receipt.receiptNo} · {receipt.supplierName ?? "Supplier not set"}</option>)}</select></label>
                    <label><span>Line</span><select disabled={!selectedSupplierReturnReceipt} onChange={(event) => { setSupplierReturnGoodsReceiptLineId(event.target.value); setSupplierReturnSerialNumbers(""); }} value={selectedSupplierReturnLine?.goodsReceiptLineId ?? supplierReturnGoodsReceiptLineId}><option value="">Select line</option>{(selectedSupplierReturnReceipt?.lines ?? []).map((line) => <option key={line.goodsReceiptLineId} value={line.goodsReceiptLineId}>{line.productName} · {formatNumber.format(line.quantity)}</option>)}</select></label>
                    <label><span>Reason</span><select onChange={(event) => setSupplierReturnReason(event.target.value as SupplierReturnReason)} value={supplierReturnReason}>{supplierReturnReasonOptions.map((reason) => <option key={reason} value={reason}>{formatSupplierReturnReason(reason)}</option>)}</select></label>
                    <label><span>Quantity</span><input disabled={Boolean(selectedSupplierReturnLine?.serialNumbers.length)} min="0.001" onChange={(event) => setSupplierReturnQuantity(event.target.value)} step="0.001" type="number" value={selectedSupplierReturnLine?.serialNumbers.length ? String(selectedSupplierReturnSerials.length) : supplierReturnQuantity} /></label>
                    <label><span>Reference</span><input onChange={(event) => setSupplierReturnExternalReference(event.target.value)} placeholder="Supplier claim or RMA" value={supplierReturnExternalReference} /></label>
                    <label><span>Note</span><input onChange={(event) => setSupplierReturnNote(event.target.value)} placeholder="Condition, approval, or dispatch note" value={supplierReturnNote} /></label>
                    <button className="rms-button is-primary" disabled={isPostingInventory || !selectedSupplierReturnLine} onClick={() => void postSupplierReturn()} type="button">
                      {selectedSupplierReturnLine?.serialNumbers.length ? "Select serials" : "Post supplier return"}
                    </button>
                  </div>
                  <div className="rms-table rms-grn-header-table rms-supplier-return-table">
                    <div className="rms-table-head"><span>Return</span><span>Supplier</span><span>GRN</span><span>Reason</span><span>Qty</span><span>Status</span></div>
                    {supplierReturnRows.map((supplierReturn) => (
                      <div className="rms-table-row" key={supplierReturn.supplierReturnId}>
                        <div><strong>{supplierReturn.supplierReturnNo}</strong><small>{formatRelative(supplierReturn.returnedAt)}</small></div>
                        <div><strong>{supplierReturn.supplierName}</strong><small>{supplierReturn.supplierNo}</small></div>
                        <div><strong>{supplierReturn.goodsReceiptNo ?? "No GRN"}</strong><small>{supplierReturn.locationName}</small></div>
                        <span>{formatSupplierReturnReason(supplierReturn.reason)}</span>
                        <strong>{formatNumber.format(supplierReturn.totalQuantity)}</strong>
                        <StatusPill tone={supplierReturn.status === "POSTED" ? "good" : "warning"}>{supplierReturn.status}</StatusPill>
                      </div>
                    ))}
                    {!supplierReturnRows.length ? <EmptyState title="No supplier returns" detail="Post a return from a received GRN line." /> : null}
                  </div>
                  </div>
                  ) : null}
                </div>
              ) : null}
              {inventoryTab === "transfers" ? (
                <div className="rms-inventory-execution rms-stock-request-panel">
                  <div className="rms-stock-toolbar">
                    <div className="rms-filter-row rms-document-filter">
                      <input onChange={(event) => setInventoryDocumentQuery(event.target.value)} placeholder="Transfer, source, item, destination" value={inventoryDocumentQuery} />
                      <select onChange={(event) => setTransferDirectionFilter(event.target.value as TransferDirectionFilter)} value={transferDirectionFilter}>
                        <option value="ALL">Transfer in / out</option>
                        <option value="IN">Transfer in</option>
                        <option value="OUT">Transfer out</option>
                      </select>
                      <select onChange={(event) => setTransferStatusFilter(event.target.value)} value={transferStatusFilter}>
                        <option value="">All statuses</option>
                        {transferStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                    <button className="rms-button is-primary" onClick={openNewTransferRequest} type="button">Create new</button>
                  </div>
                  {transferRequestDialogOpen ? (
                    <div className="rms-modal-backdrop" role="dialog" aria-modal="true">
                      <section className="rms-dialog rms-wide-dialog rms-stock-request-dialog">
                        <div className="rms-panel-title">
                          <div><span>Stock request</span><h2>{activeTransferDraftBatchNo ? "Amend transfer draft" : "New transfer"}</h2></div>
                          <button className="rms-button" onClick={() => setTransferRequestDialogOpen(false)} type="button">Close</button>
                        </div>
                        <div className="rms-workspace-tabs rms-dialog-tabs">
                          {(["header", "details"] as TransferEntryTab[]).map((tab) => (
                            <button className={activeTransferEntryTab === tab ? "is-active" : ""} key={tab} onClick={() => setActiveTransferEntryTab(tab)} type="button">{tab.toUpperCase()}</button>
                          ))}
                        </div>
                        {activeTransferEntryTab === "header" ? (
                          <div className="rms-form-grid rms-transfer-header-grid">
                            <label><span>Source store</span><select onChange={(event) => setTransferSourceStoreId(event.target.value)} value={transferSourceStoreId}><option value="">Select source</option>{workspace.transferStores.map((store) => <option key={store.storeId} value={store.storeId}>{store.storeName}</option>)}</select></label>
                            <label><span>Destination</span><select onChange={(event) => setTransferDestinationLocationId(event.target.value)} value={selectedTransferDestinationLocation?.locationId ?? transferDestinationLocationId}>{workspace.inventoryLocations.map((location) => <option key={location.locationId} value={location.locationId}>{location.locationName}</option>)}</select></label>
                            <label><span>Required date</span><input onChange={(event) => setTransferRequiredDate(event.target.value)} type="date" value={transferRequiredDate} /></label>
                            <label><span>Reference</span><input onChange={(event) => setTransferReference(event.target.value)} value={transferReference} /></label>
                            <label><span>Waybill no.</span><input onChange={(event) => setTransferDeliveryNoteNo(event.target.value)} value={transferDeliveryNoteNo} /></label>
                            <label><span>Transporter</span><input onChange={(event) => setTransferTransporterName(event.target.value)} value={transferTransporterName} /></label>
                            <label><span>Vehicle no.</span><input onChange={(event) => setTransferVehicleRegistrationNo(event.target.value)} value={transferVehicleRegistrationNo} /></label>
                            <label><span>Driver</span><input onChange={(event) => setTransferDriverName(event.target.value)} value={transferDriverName} /></label>
                            <label><span>Driver contact</span><input onChange={(event) => setTransferDriverContact(event.target.value)} value={transferDriverContact} /></label>
                            <label><span>Note</span><input onChange={(event) => setTransferNote(event.target.value)} value={transferNote} /></label>
                          </div>
                        ) : null}
                        {activeTransferEntryTab === "details" ? (
                          <div className="rms-transfer-detail-pane">
                            <div className="rms-form-grid rms-transfer-line-entry">
                              <label><span>Product</span><select onChange={(event) => { const productId = event.target.value; const product = workspace.inventoryProducts.find((item) => item.productId === productId); setInventoryProductId(productId); setTransferUnitOfMeasure(product?.baseUnitOfMeasure ?? ""); }} value={inventoryProductId}><option value="">Select item</option>{workspace.inventoryProducts.map((product) => <option key={product.productId} value={product.productId}>{product.productName} · {product.productCode}</option>)}</select></label>
                              <label><span>Unit</span><select disabled={!selectedInventoryProduct} onChange={(event) => setTransferUnitOfMeasure(event.target.value)} value={transferUnitOfMeasure}>{(selectedInventoryProduct?.uomConversions.length ? selectedInventoryProduct.uomConversions : selectedInventoryProduct ? [{ uomCode: selectedInventoryProduct.baseUnitOfMeasure, uomName: selectedInventoryProduct.baseUnitOfMeasure, conversionFactor: 1 }] : []).map((unit) => <option key={unit.uomCode} value={unit.uomCode}>{unit.uomName} ({unit.uomCode}){unit.conversionFactor !== 1 ? ` = ${formatNumber.format(unit.conversionFactor)} ${selectedInventoryProduct?.baseUnitOfMeasure}` : ""}</option>)}</select></label>
                              <label><span>Quantity</span><input min="0.001" onChange={(event) => setTransferQuantity(event.target.value)} step="0.001" type="number" value={transferQuantity} /></label>
                              <button className="rms-button" onClick={addTransferRequestLine} type="button">Add line</button>
                            </div>
                            <div className="rms-table rms-stock-request-line-table">
                              <div className="rms-table-head"><span>Item</span><span>Qty</span><span>Remove</span></div>
                              {transferRequestLines.map((line) => (
                                <div className="rms-table-row" key={line.id}>
                                  <div><strong>{line.productName}</strong><small>{line.productCode}</small></div>
                                  <strong>
                                    <input
                                      aria-label={`Requested quantity for ${line.productName}`}
                                      min="0.001"
                                      onChange={(event) => {
                                        const quantity = Number(event.target.value);
                                        const product = workspace.inventoryProducts.find((item) => item.productId === line.productId);
                                        const conversionFactor = product?.uomConversions.find((unit) => unit.uomCode === line.unitOfMeasure)?.conversionFactor ?? 1;
                                        setTransferRequestLines((lines) => lines.map((candidate) => candidate.id === line.id ? { ...candidate, quantity, baseQuantity: Number((quantity * conversionFactor).toFixed(3)) } : candidate));
                                      }}
                                      step="0.001"
                                      type="number"
                                      value={line.quantity}
                                    /> {line.unitOfMeasure}{line.unitOfMeasure !== line.baseUnitOfMeasure ? ` = ${formatNumber.format(line.baseQuantity)} ${line.baseUnitOfMeasure}` : ""}
                                  </strong>
                                  <button
                                    aria-label={`Remove ${line.productName}`}
                                    className="rms-icon-button is-danger"
                                    onClick={() => setTransferRequestLines((lines) => lines.filter((candidate) => candidate.id !== line.id))}
                                    title={`Remove ${line.productName}`}
                                    type="button"
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>
                              ))}
                              {!transferRequestLines.length ? <EmptyState title="No request lines" /> : null}
                            </div>
                          </div>
                        ) : null}
                        <div className="rms-dialog-actions">
                          <button className="rms-button" onClick={() => setTransferRequestDialogOpen(false)} type="button">Cancel</button>
                          <button className="rms-button is-primary" disabled={isPostingInventory || !transferRequestLines.length} onClick={() => void postTransferRequest()} type="button">{isPostingInventory ? "Saving..." : "Save draft"}</button>
                        </div>
                      </section>
                    </div>
                  ) : null}
                  <div className="rms-table rms-stock-request-table">
                    <div className="rms-table-head"><span>Transfer</span><span>Source</span><span>Destination</span><span>Status</span><span>Requested</span><span>Outstanding</span><span>View</span><span>{transferProcessHeader}</span><span /><span /></div>
                    {transferDocumentGroups.map((transfer) => {
                      const canEditDraft =
                        transfer.statusLabel === "DRAFT" &&
                        transfer.lines.every((line) => line.role === "DESTINATION");
                      const canIssueTransfer =
                        transfer.statusLabel !== "DRAFT" &&
                        transfer.lines.some((line) => line.role === "SOURCE") &&
                        transfer.outstandingIssueQuantity > 0;
                      const canReceiveTransfer =
                        transfer.statusLabel !== "DRAFT" &&
                        transfer.lines.some((line) => line.role === "DESTINATION") &&
                        transfer.outstandingReceiptQuantity > 0;
                      const canProcessTransfer = canIssueTransfer || canReceiveTransfer;
                      const processLabel = canIssueTransfer
                        ? "Issue"
                        : canReceiveTransfer
                          ? "Receive"
                          : transfer.lines.some((line) => line.role === "SOURCE")
                            ? "Issue"
                            : "Receive";
                      const canCaptureFeedback =
                        isFuelTransferDocument(transfer) &&
                        transfer.receivedQuantity > 0 &&
                        transfer.lines.some((line) => line.role === "DESTINATION");
                      const roleStatusLabel = getTransferRoleStatusLabel(transfer, transferDirectionFilter);
                      const roleOutstandingQuantity = getTransferRoleOutstandingQuantity(transfer, transferDirectionFilter);
                      const statusTone =
                        roleOutstandingQuantity <= 0 && (roleStatusLabel === "Issued" || roleStatusLabel === "Received")
                          ? "good"
                          : "warning";

                      return (
                        <div className="rms-table-row" key={transfer.key}>
                          <div><strong>{transfer.documentNo}</strong><small>{transfer.lines.length} line(s) · {formatRelative(transfer.updatedAt)}</small></div>
                          <div><strong>{transfer.sourceStoreName}</strong><small>{transfer.sourceStoreCode}</small></div>
                          <div><strong>{transfer.destinationStoreName}</strong><small>{transfer.destinationStoreCode}</small></div>
                          <StatusPill tone={statusTone}>{roleStatusLabel}</StatusPill>
                          <strong>{formatNumber.format(transfer.requestedQuantity)}</strong>
                          <span>{formatNumber.format(roleOutstandingQuantity)}</span>
                          {canEditDraft ? (
                            <button className="rms-row-button" disabled={isPostingInventory} onClick={() => openTransferRequestDraft(transfer)} type="button">Edit</button>
                          ) : (
                            <ActionIconButton label={`Open ${transfer.documentNo}`} onClick={() => setSelectedTransferDocumentKey(transfer.key)}>
                              <ViewIcon />
                            </ActionIconButton>
                          )}
                          {canEditDraft ? (
                            <button className="rms-row-button" disabled={isPostingInventory} onClick={() => void sendTransferRequestDraft(transfer.documentNo)} type="button">Send</button>
                          ) : (
                            <ActionIconButton
                              disabled={isPostingInventory || !canProcessTransfer}
                              label={`${processLabel} ${transfer.documentNo}`}
                              onClick={() => setSelectedTransferDocumentKey(transfer.key)}
                              tone="receive"
                            >
                              <ReceiveIcon />
                            </ActionIconButton>
                          )}
                          <button
                            className="rms-row-button"
                            disabled={isPostingInventory || !canCaptureFeedback}
                            onClick={() => openTransferFeedbackDialog(transfer)}
                            type="button"
                          >
                            Feedback
                          </button>
                          <ActionIconButton label={`Print ${transfer.documentNo}`} onClick={() => openTransferDocumentWindow(transfer)} tone="print">
                            <PrintIcon />
                          </ActionIconButton>
                        </div>
                      );
                    })}
                    {!transferDocumentGroups.length ? <EmptyState title="No transfer requests" detail="Transfer requests posted from this online store will appear here." /> : null}
                  </div>
                </div>
              ) : null}
              {inventoryTab === "counts" ? (
                <div className="rms-inventory-execution rms-count-workspace">
                  <div className="rms-filter-row">
                    <input onChange={(event) => setInventoryDocumentQuery(event.target.value)} placeholder="Session, item, location, operator" value={inventoryDocumentQuery} />
                    <select onChange={(event) => setCountVarianceFilter(event.target.value as typeof countVarianceFilter)} value={countVarianceFilter}>
                      <option value="all">All counts</option>
                      <option value="variance">With variance</option>
                      <option value="short">Short count</option>
                      <option value="over">Over count</option>
                    </select>
                  </div>
                  <section className="rms-workflow-card rms-count-card">
                    <div className="rms-workspace-tabs rms-dialog-tabs">
                      {(["header", "sheet", "variance"] as CountEntryTab[]).map((tab) => (
                        <button className={activeCountEntryTab === tab ? "is-active" : ""} key={tab} onClick={() => setActiveCountEntryTab(tab)} type="button">{tab === "sheet" ? "COUNT SHEET" : tab.toUpperCase()}</button>
                      ))}
                    </div>
                    {activeCountEntryTab === "header" ? (
                      <div className="rms-form-grid rms-count-header-grid">
                        <label><span>Location</span><select onChange={(event) => setInventoryLocationId(event.target.value)} value={inventoryLocationId}><option value="">Default sales</option>{workspace.inventoryLocations.map((location) => <option key={location.locationId} value={location.locationId}>{location.locationName}</option>)}</select></label>
                        <label><span>Note</span><input onChange={(event) => setCountNote(event.target.value)} value={countNote} /></label>
                        <DocumentStat label="Items" value={formatNumber.format(countLocationItems.length)} />
                        <button className="rms-button is-primary" onClick={() => setActiveCountEntryTab("sheet")} type="button">Load items</button>
                      </div>
                    ) : null}
                    {activeCountEntryTab === "sheet" ? (
                      <div className="rms-count-sheet-pane">
                        <div className="rms-form-grid rms-count-line-entry">
                          <label><span>Product</span><select onChange={(event) => setInventoryProductId(event.target.value)} value={inventoryProductId}><option value="">Select item</option>{workspace.inventoryProducts.map((product) => <option key={product.productId} value={product.productId}>{product.productName} · {product.productCode}</option>)}</select></label>
                          <label><span>System qty</span><input readOnly value={selectedInventoryRow?.quantityOnHand.toFixed(3) ?? selectedInventoryProduct?.quantityOnHand.toFixed(3) ?? "0.000"} /></label>
                          <label><span>Counted qty</span><input min="0" onChange={(event) => setCountedQuantity(event.target.value)} readOnly={selectedInventoryProduct?.trackExpiry} step="0.001" type="number" value={selectedInventoryProduct?.trackExpiry ? selectedCountBatches.reduce((sum, batch) => sum + Number(countedBatchQuantities[batch.batchId] ?? batch.quantityOnHand), 0).toFixed(3) : countedQuantity} /></label>
                          <button className="rms-button is-primary" disabled={isPostingInventory || !inventoryProductId} onClick={() => void postStockCount()} type="button">Add item</button>
                          <button className="rms-button" onClick={exportCountSheet} type="button">Export sheet</button>
                          <label className="rms-row-button rms-file-button">
                            Upload CSV
                            <input accept=".csv,text/csv" onChange={(event) => void importCountSheet(event.currentTarget.files?.[0] ?? null)} type="file" />
                          </label>
                        </div>
                        {selectedInventoryProduct?.trackExpiry ? (
                          <div className="rms-table rms-inventory-batch-table">
                            <div className="rms-table-head"><span>Product</span><span>Batch</span><span>Location</span><span>Expiry</span><span>System</span><span>Counted</span></div>
                            {selectedCountBatches.map((batch) => (
                              <div className="rms-table-row" key={batch.batchId}>
                                <div><strong>{batch.productName}</strong><small>{batch.productCode}</small></div>
                                <strong>{batch.batchNo}</strong>
                                <span>{batch.locationName}</span>
                                <span>{new Date(batch.expiryDate).toLocaleDateString("en-GB")}</span>
                                <strong>{formatNumber.format(batch.quantityOnHand)}</strong>
                                <input
                                  aria-label={`Counted quantity for batch ${batch.batchNo}`}
                                  min="0"
                                  onChange={(event) => setCountedBatchQuantities((current) => ({ ...current, [batch.batchId]: event.target.value }))}
                                  step="0.001"
                                  type="number"
                                  value={countedBatchQuantities[batch.batchId] ?? String(batch.quantityOnHand)}
                                />
                              </div>
                            ))}
                            {!selectedCountBatches.length ? <EmptyState title="No batch stock" detail="Receive a valid batch before counting positive stock." /> : null}
                          </div>
                        ) : null}
                        <div className="rms-table rms-count-variance-table">
                          <div className="rms-table-head"><span>Item</span><span>System</span><span>Counted</span><span>Remove</span></div>
                          {stockCountUploadRows.map((row) => (
                            <div className="rms-table-row" key={row.productCode}>
                              <div><strong>{row.productName}</strong><small>{row.productCode}</small></div>
                              <span>{formatNumber.format(row.systemQuantity)}</span>
                              <input min="0" onChange={(event) => updateStockCountUploadRow(row.productCode, event.target.value)} step="0.001" type="number" value={row.countedQuantity ?? ""} />
                              <button aria-label={`Remove ${row.productName}`} className="rms-icon-button is-danger" onClick={() => setStockCountUploadRows((rows) => rows.filter((candidate) => candidate.productCode !== row.productCode))} title={`Remove ${row.productName}`} type="button"><TrashIcon /></button>
                            </div>
                          ))}
                          {!stockCountUploadRows.length ? <EmptyState title="No count-sheet items" detail="Select an item, enter its count, and add it to this sheet." /> : null}
                        </div>
                        <div className="rms-inline-actions">
                          <button className="rms-button" disabled={!stockCountUploadRows.length} onClick={() => setActiveCountEntryTab("variance")} type="button">Review variance</button>
                          <button className="rms-button is-primary" disabled={isPostingInventory || !stockCountUploadRows.length} onClick={requestSaveCalculatedCountRows} type="button">{isPostingInventory ? "Saving..." : "Save count sheet"}</button>
                        </div>
                      </div>
                    ) : null}
                    {activeCountEntryTab === "variance" ? (
                      <div className="rms-count-variance-pane">
                        <div className="rms-inline-actions">
                          <StatusPill>{`${stockCountUploadRows.length} count row(s)`}</StatusPill>
                          <button className="rms-button" disabled={!stockCountUploadRows.length} onClick={() => setStockCountUploadRows([])} type="button">Clear sheet</button>
                        </div>
                        <div className="rms-table rms-count-variance-table">
                          <div className="rms-table-head"><span>Item</span><span>System</span><span>Counted</span><span>Variance</span><span>Remove</span></div>
                          {stockCountUploadRows.map((row) => (
                            <div className="rms-table-row" key={row.productCode}>
                              <div><strong>{row.productName}</strong><small>{row.productCode}</small></div>
                              <span>{formatNumber.format(row.systemQuantity)}</span>
                              <input
                                min="0"
                                onChange={(event) => updateStockCountUploadRow(row.productCode, event.target.value)}
                                step="0.001"
                                type="number"
                                value={row.countedQuantity === null ? "" : String(row.countedQuantity)}
                              />
                              <b className={row.varianceQuantity === null || row.varianceQuantity === 0 ? "" : row.varianceQuantity < 0 ? "is-short-stock" : "is-over-stock"}>{row.varianceQuantity === null ? "-" : formatNumber.format(row.varianceQuantity)}</b>
                              <button
                                aria-label={`Remove ${row.productName}`}
                                className="rms-icon-button is-danger"
                                onClick={() => setStockCountUploadRows((rows) => rows.filter((candidate) => candidate.productCode !== row.productCode))}
                                title={`Remove ${row.productName}`}
                                type="button"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ))}
                          {!stockCountUploadRows.length ? <EmptyState title="No calculated rows" /> : null}
                        </div>
                        <p className="rms-inline-message">Variance is calculated for review. Return to Count Sheet to edit or save the document.</p>
                      </div>
                    ) : null}
                  </section>
                  <div className="rms-table rms-count-history-table">
                    <div className="rms-table-head"><span>Session</span><span>Item</span><span>Status</span><span>Variance</span><span>Date</span><span>Action</span></div>
                    {stockCountSheetGroups.map((sheet) => (
                      <div className="rms-table-row" key={sheet.sheetNo}>
                        <strong>{sheet.sheetNo}<small>{sheet.locationName}</small></strong>
                        <span>{sheet.sessions.length} item(s)</span>
                        <StatusPill tone={sheet.status === "COMMITTED" ? "good" : "warning"}>{sheet.status}</StatusPill>
                        <b className={sheet.varianceQuantity === 0 ? "" : sheet.varianceQuantity < 0 ? "is-short-stock" : "is-over-stock"}>{formatNumber.format(sheet.varianceQuantity)}</b>
                        <span>{new Date(sheet.submittedAt).toLocaleString()}</span>
                        {sheet.status === "SUBMITTED" ? (
                          <button className="rms-row-button is-add" disabled={isPostingInventory} onClick={() => requestStockCountCommit(sheet.sessions.map((session) => session.sessionId), sheet.sheetNo)} type="button">Commit</button>
                        ) : (
                          <StatusPill tone="good">Done</StatusPill>
                        )}
                      </div>
                    ))}
                    {!stockCountSheetGroups.length ? <EmptyState title="No stock counts" detail="Saved online count sheets will appear here." /> : null}
                  </div>
                </div>
              ) : null}
              {inventoryMessage ? <p className="rms-inline-message">{inventoryMessage}</p> : null}
            </section>
          </div>
        ) : null}

        {renderPurchaseOrderDialog()}
        {renderGoodsReceiptDialog()}
        {renderTransferDocumentDialog()}
        {renderTransferFeedbackDialog()}
        {renderRemoteInventoryDialog()}
        {renderInventorySerialDialog()}

        {activeWorkspace === "expenses" ? (
          <div className="rms-workspace rms-tabbed-workspace rms-expense-workspace">
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div><span>Store expenses</span><h2>Capture and confirm</h2></div>
                <StatusPill>{workspace.storeExpenses.length} row(s)</StatusPill>
              </div>
              <div className="rms-form-grid rms-expense-form">
                <label><span>Date</span><input onChange={(event) => setExpenseDate(event.target.value)} type="date" value={expenseDate} /></label>
                <label><span>Payment</span><select onChange={(event) => setExpensePaymentMethod(event.target.value)} value={expensePaymentMethod}>
                  <option value="CASH">Cash</option>
                  <option value="MOBILE_MONEY">Mobile money</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CARD">Card</option>
                  <option value="PAYABLE">Payable</option>
                </select></label>
                <label><span>Amount</span><input min="0.01" onChange={(event) => setExpenseAmount(event.target.value)} step="0.01" type="number" value={expenseAmount} /></label>
                <label><span>Reference</span><input onChange={(event) => setExpenseReference(event.target.value)} value={expenseReference} /></label>
                <label className="rms-note-field"><span>Details</span><textarea onChange={(event) => setExpenseDescription(event.target.value)} rows={3} value={expenseDescription} /></label>
              </div>
              <div className="rms-expense-attachment-row">
                <label className="rms-evidence-capture-button">
                  <span>{expenseAttachmentFileName ? "Replace attachment" : "Upload attachment"}</span>
                  <input accept="image/*,.pdf" onChange={(event) => void uploadExpenseAttachment(event)} type="file" />
                </label>
                {expenseAttachmentUrl ? (
                  <a className="rms-row-button" href={expenseAttachmentUrl} rel="noreferrer" target="_blank">
                    {expenseAttachmentFileName || "Open attachment"}
                  </a>
                ) : null}
              </div>
              <div className="rms-dialog-actions">
                <button className="rms-button" onClick={resetExpenseDraft} type="button">Clear</button>
                <button className="rms-button" disabled={isPostingInventory} onClick={() => void saveStoreExpense(false)} type="button">Save draft</button>
                <button className="rms-button is-primary" disabled={isPostingInventory} onClick={() => void saveStoreExpense(true)} type="button">Save & confirm</button>
              </div>
              {expenseMessage ? <p className="rms-inline-message">{expenseMessage}</p> : null}
            </section>
            <section className="rms-panel">
              <div className="rms-panel-title">
                <div><span>Recent expenses</span><h2>Store submissions</h2></div>
              </div>
              <div className="rms-table rms-expense-table">
                <div className="rms-table-head"><span>Expense</span><span>Date</span><span>Payment</span><span>Amount</span><span>Status</span><span>Attachment</span><span>Action</span></div>
                {workspace.storeExpenses.map((expense) => (
                  <div
                    className={`rms-table-row ${expense.status === "DRAFT" ? "is-clickable" : ""}`}
                    key={expense.expenseId}
                    onClick={() => {
                      if (expense.status === "DRAFT") {
                        loadExpenseDraft(expense);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        loadExpenseDraft(expense);
                      }
                    }}
                    role={expense.status === "DRAFT" ? "button" : undefined}
                    tabIndex={expense.status === "DRAFT" ? 0 : -1}
                    title={expense.status === "DRAFT" ? "Open draft expense for editing" : undefined}
                  >
                    <div><strong>{expense.expenseNo}</strong><small>{expense.description}</small></div>
                    <span>{formatDateTime(expense.expenseDate, workspace.store?.timezone ?? "Africa/Accra")}</span>
                    <span>{expense.paymentMethod ?? "Cash"}</span>
                    <strong>{formatMoney(expense.amount + expense.taxAmount, currencyCode)}</strong>
                    <StatusPill tone={expense.status === "POSTED" ? "good" : expense.status === "APPROVED" ? "warning" : "neutral"}>{expense.status}</StatusPill>
                    {expense.attachmentUrl ? (
                      <a
                        href={expense.attachmentUrl}
                        onClick={(event) => event.stopPropagation()}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open
                      </a>
                    ) : (
                      <span>-</span>
                    )}
                    {expense.status === "DRAFT" ? (
                      <button
                        className="rms-row-button is-add"
                        disabled={isPostingInventory}
                        onClick={(event) => {
                          event.stopPropagation();
                          requestExpenseConfirmation(expense);
                        }}
                        type="button"
                      >
                        Confirm
                      </button>
                    ) : (
                      <StatusPill>{expense.status === "POSTED" ? "Posted" : "HQ review"}</StatusPill>
                    )}
                  </div>
                ))}
                {!workspace.storeExpenses.length ? <EmptyState title="No store expenses" detail="Supervisor-captured store expenses will appear here." /> : null}
              </div>
            </section>
          </div>
        ) : null}

        {activeWorkspace === "fuel" ? (
          <div className="rms-workspace rms-fuel-workspace">
            {onlineStoreFuelViews.length > 0 ? (
              <FuelOperationsWorkspace
                autoRecordedBy={workspace.operator.displayName || workspace.operator.loginId}
                availableViews={onlineStoreFuelViews}
                defaultView={onlineStoreFuelViews[0] ?? "tanks"}
                embedInShell
                pageDescription="Station fuel controls for tanks, dips, meter readings, supplier receipts, and reconciliation."
                pageHeading="Fuel"
                workspace={workspace.fuelOperationsWorkspace}
              />
            ) : (
              <section className="rms-panel">
                <EmptyState
                  detail="Ask HQ to grant the fuel tank, dip, meter-reading, supplier-receipt, or reconciliation permission for this online-store role."
                  title="No fuel workspace permission"
                />
              </section>
            )}
          </div>
        ) : null}

        {activeWorkspace === "manager" ? (
          <div className="rms-workspace rms-tabbed-workspace">
            <div className="rms-workspace-tabs">
              {(["shift", "eod", "banking", "summary"] as ManagerTab[]).map((tab) => (
                <button className={managerTab === tab ? "is-active" : ""} key={tab} onClick={() => setManagerTab(tab)} type="button">{tab.toUpperCase()}</button>
              ))}
            </div>
            <section className="rms-panel rms-manager-grid">
              <div className="rms-panel-title"><span>Supervisor shift review</span><h2>{currentShift?.shiftNo ?? "No open shift"}</h2><StatusPill tone={currentShift ? "good" : "warning"}>{currentShift?.status ?? "Closed"}</StatusPill></div>
              {managerTab === "shift" ? (
                <>
                  {!currentShift ? (
                    <div className="rms-manager-form rms-shift-open-form">
                      <label><span>Opening float</span><input min="0" onChange={(event) => handleShiftOpeningFloatChange(event.target.value)} step="0.01" type="number" value={shiftOpeningFloat} /></label>
                      <button className="rms-button is-primary" disabled={isOpeningShift} onClick={() => void openShift()} type="button">{isOpeningShift ? "Opening..." : "Open shift"}</button>
                    </div>
                  ) : null}
                  <div className="rms-manager-action-strip">
                    <button className="rms-button" disabled={!currentShift} onClick={() => printShiftReport("X")} type="button">Print X report</button>
                    <button className="rms-button is-warning" disabled={!currentShift} onClick={requestCloseShift} type="button">Close shift</button>
                    <button className="rms-button" onClick={() => router.refresh()} type="button">Refresh</button>
                  </div>
                  <select onChange={(event) => setSelectedEodShiftId(event.target.value)} value={selectedEodShiftId}>
                    <option value="">Latest shift</option>
                    {workspace.reports.shiftRows.map((shift) => (
                      <option key={shift.shiftId} value={shift.shiftId}>{shift.shiftNo} · {shift.status} · {formatMoney(shift.expectedCashAmount, currencyCode)}</option>
                    ))}
                  </select>
                  <div className="rms-dashboard-mini-grid">
                    <div><span>Net sales</span><strong>{formatMoney(currentShift?.netSalesAmount ?? workspace.metrics.todaySales, currencyCode)}</strong></div>
                    <div><span>Terminal</span><strong>online-web</strong></div>
                    <div><span>Cash</span><strong>{formatMoney(currentShift?.cashTenderedAmount ?? 0, currencyCode)}</strong></div>
                    <div><span>Expected</span><strong>{formatMoney(currentShift?.expectedCashAmount ?? workspace.metrics.expectedCash, currencyCode)}</strong></div>
                    <div><span>Transactions</span><strong>{currentShift?.transactionCount ?? workspace.metrics.todayTransactions}</strong></div>
                  </div>
                  <div className="rms-table rms-report-table">
                    <div className="rms-table-head"><span>Tender</span><span>Method</span><span>Txn</span><span>Net</span></div>
                    {(currentShift?.tenderTotals ?? []).map((row) => (
                      <div className="rms-table-row" key={`${row.paymentMethod}:${row.tenderMethodCode}`}><strong>{row.tenderMethodName ?? row.paymentMethod}<small>{row.tenderMethodCode ?? "unmapped"}</small></strong><span>{row.paymentMethod}</span><span>{row.transactionCount}</span><b>{formatMoney(row.netAmount, currencyCode)}</b></div>
                    ))}
                    {!currentShift?.tenderTotals.length ? <EmptyState title="No tender movement" detail="Tender totals appear as receipts are posted in the open shift." /> : null}
                  </div>
                </>
              ) : null}
              {managerTab === "eod" ? (
                <div className="rms-manager-form">
                  <label><span>Shift</span><select onChange={(event) => setSelectedEodShiftId(event.target.value)} value={selectedEodShiftId}><option value="">Latest shift</option>{workspace.reports.shiftRows.map((shift) => <option key={shift.shiftId} value={shift.shiftId}>{shift.shiftNo} · {shift.status}</option>)}</select></label>
                  <label><span>Declared cash</span><input onChange={(event) => setEodDeclaredCash(event.target.value)} type="number" value={eodDeclaredCash} /></label>
                  <label><span>Expected cash</span><input readOnly value={managerExpectedCash.toFixed(2)} /></label>
                  <label><span>Variance</span><input readOnly value={(parseAmount(eodDeclaredCash) - managerExpectedCash).toFixed(2)} /></label>
                  <label><span>Note</span><input onChange={(event) => setEodNote(event.target.value)} value={eodNote} /></label>
                  <button className="rms-button is-primary" disabled={isManagerPosting} onClick={requestCloseShift} type="button">Close shift / Record EOD</button>
                </div>
              ) : null}
              {managerTab === "banking" ? (
                <div className="rms-manager-form">
                  <label><span>EOD</span><select onChange={(event) => {
                    const reconciliationId = event.target.value;
                    const reconciliation = workspace.eodReconciliations.find((eod) => eod.reconciliationId === reconciliationId);
                    setBankingReconciliationId(reconciliationId);
                    setBankingAmount((reconciliation?.remainingCashAmount ?? 0).toFixed(2));
                  }} value={bankingReconciliationId}><option value="">Select EOD</option>{workspace.eodReconciliations.map((eod) => <option key={eod.reconciliationId} value={eod.reconciliationId}>{eod.reconciliationNo} · remaining {formatMoney(eod.remainingCashAmount, currencyCode)}</option>)}</select></label>
                  <label><span>Amount</span><input onChange={(event) => setBankingAmount(event.target.value)} type="number" value={bankingAmount} /></label>
                  <label><span>Bank account</span><select onChange={(event) => setBankingBankAccountId(event.target.value)} value={bankingBankAccountId}><option value="">Bank account</option>{workspace.bankAccounts.map((account) => <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.accountNumber}</option>)}</select></label>
                  <label><span>Bank name</span><input onChange={(event) => setBankingBankName(event.target.value)} value={bankingBankName} /></label>
                  <label><span>Reference</span><input onChange={(event) => setBankingReference(event.target.value)} value={bankingReference} /></label>
                  <label><span>Manager</span><input onChange={(event) => setManagerOverrideCode(event.target.value)} placeholder="Login" value={managerOverrideCode} /></label>
                  <label><span>Password</span><input onChange={(event) => setManagerOverridePassword(event.target.value)} type="password" value={managerOverridePassword} /></label>
                  <label><span>Reason</span><input onChange={(event) => setManagerOverrideNote(event.target.value)} placeholder="Banking approval" value={managerOverrideNote} /></label>
                  <button className="rms-button is-primary" disabled={isManagerPosting} onClick={() => void recordBanking()} type="button">Record Banking</button>
                  <div className="rms-readonly-field"><span>Remaining cash</span><strong>{formatMoney(selectedBankingReconciliation?.remainingCashAmount ?? 0, currencyCode)}</strong></div>
                </div>
              ) : null}
              {managerTab === "summary" ? (
                <>
                  <div className="rms-manager-action-strip">
                    <label className="rms-button">
                      Upload receipt logo
                      <input accept="image/*" hidden onChange={selectLocalReceiptLogo} type="file" />
                    </label>
                    {localReceiptLogoUrl ? (
                      <button className="rms-button" onClick={clearLocalReceiptLogo} type="button">
                        Clear local logo
                      </button>
                    ) : null}
                    <StatusPill>{localReceiptLogoUrl ? "Local logo" : "Enterprise logo"}</StatusPill>
                  </div>
                  {receiptLogoMessage ? <p className="rms-inline-message">{receiptLogoMessage}</p> : null}
                  <div className="rms-table rms-report-table">
                    <div className="rms-table-head"><span>Document</span><span>Shift</span><span>Amount</span><span>Date</span></div>
                    {workspace.eodReconciliations.map((eod) => (
                      <div className="rms-table-row" key={eod.reconciliationId}><strong>{eod.reconciliationNo}</strong><span>{eod.shiftNo}</span><b>{formatMoney(eod.declaredCashAmount, currencyCode)}</b><span>{new Date(eod.reconciledAt).toLocaleString()}</span></div>
                    ))}
                    {workspace.bankingDeposits.map((deposit) => (
                      <div className="rms-table-row" key={deposit.depositId}><strong>{deposit.depositNo}</strong><span>{deposit.shiftNo}</span><b>{formatMoney(deposit.amount, currencyCode)}</b><span>{new Date(deposit.depositedAt).toLocaleString()}</span></div>
                    ))}
                    {!workspace.eodReconciliations.length && !workspace.bankingDeposits.length ? <EmptyState title="No manager documents" detail="EOD and banking documents will appear after closeout and cash deposit." /> : null}
                  </div>
                </>
              ) : null}
              {managerMessage ? <p className="rms-inline-message">{managerMessage}</p> : null}
            </section>
          </div>
        ) : null}

        {activeWorkspace === "reversals" ? (
          <div className="rms-workspace rms-reversal-grid">
            <section className="rms-panel">
              <div className="rms-panel-title"><span>Receipt</span><h2>Correction search</h2><StatusPill>{`${correctionRows.length} receipt(s)`}</StatusPill></div>
              <div className="rms-filter-row">
                <input onChange={(event) => setCorrectionQuery(event.target.value)} placeholder="Receipt no, customer, cashier, item" value={correctionQuery} />
                <select onChange={(event) => setCorrectionWindowDays(event.target.value)} value={correctionWindowDays}>
                  <option value="1">Today</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
              <div className="rms-mini-list">
                {correctionRows.map((transaction) => (
                  <div className="rms-mini-row" key={transaction.transactionNo}>
                    <strong>{transaction.transactionNo}<small>{transaction.customerName} · {formatMoney(transaction.totalAmount, currencyCode)}</small></strong>
                    <button className="rms-button" onClick={() => beginCorrection(transaction.transactionNo, "RETURN")} type="button">Return</button>
                    <button className="rms-button" onClick={() => beginCorrection(transaction.transactionNo, "EXCHANGE")} type="button">Exchange</button>
                  </div>
                ))}
                {!correctionRows.length ? <EmptyState title="No eligible receipts" detail="Completed sale receipts that match the filter will appear here." /> : null}
              </div>
            </section>
            <section className="rms-panel">
              <div className="rms-panel-title"><span>Execution</span><h2>{correctionSelection ? `${correctionSelection.correctionType} ${correctionSelection.transactionNo}` : "Select receipt"}</h2></div>
              {selectedCorrectionTransaction ? (
                <div className="rms-correction-form">
                  <div className="rms-table rms-report-table">
                    <div className="rms-table-head"><span>Item</span><span>Returnable</span><span>Qty</span><span>Value</span></div>
                    {selectedCorrectionTransaction.lines.map((line) => (
                      <div className="rms-table-row" key={line.lineId}>
                        <strong>{line.productName}<small>{line.productCode}</small></strong>
                        <span>{formatNumber.format(line.returnableQuantity)}</span>
                        <input
                          max={line.returnableQuantity}
                          min="0"
                          onChange={(event) => setReturnQuantities((quantities) => ({ ...quantities, [line.lineId]: event.target.value }))}
                          type="number"
                          value={returnQuantities[line.lineId] ?? "0"}
                        />
                        <b>{formatMoney(line.quantity > 0 ? (line.lineTotal / line.quantity) * parseAmount(returnQuantities[line.lineId] ?? "0") : 0, currencyCode)}</b>
                      </div>
                    ))}
                  </div>
                  {correctionSelection?.correctionType === "EXCHANGE" ? (
                    <div className="rms-manager-form">
                      <label><span>Replacement</span><select onChange={(event) => setExchangeProductId(event.target.value)} value={exchangeProductId}><option value="">Select item</option>{workspace.products.map((product) => <option key={product.productId} value={product.productId}>{product.productName} · {formatCatalogAvailability(product)}</option>)}</select></label>
                      <label><span>Quantity</span><input onChange={(event) => setExchangeQuantity(event.target.value)} type="number" value={exchangeQuantity} /></label>
                    </div>
                  ) : null}
                  <div className="rms-total-strip">
                    <div className="rms-stat"><span>Return</span><strong>{formatMoney(correctionReturnTotal, currencyCode)}</strong></div>
                    <div className="rms-stat"><span>Replacement</span><strong>{formatMoney(exchangeReplacementTotal, currencyCode)}</strong></div>
                    <div className="rms-stat is-good"><span>{correctionSettlementTotal < 0 ? "Refund" : "Due"}</span><strong>{formatMoney(Math.abs(correctionSettlementTotal), currencyCode)}</strong></div>
                  </div>
                  <label className="rms-note-field"><span>Note</span><input onChange={(event) => setCorrectionNote(event.target.value)} value={correctionNote} /></label>
                  {correctionRequiresManagerOverride ? (
                    <div className="rms-manager-form rms-override-form">
                      <label><span>Manager</span><input onChange={(event) => setManagerOverrideCode(event.target.value)} placeholder="Login" value={managerOverrideCode} /></label>
                      <label><span>Password</span><input onChange={(event) => setManagerOverridePassword(event.target.value)} type="password" value={managerOverridePassword} /></label>
                      <label><span>Reason</span><input onChange={(event) => setManagerOverrideNote(event.target.value)} placeholder="Void approval" value={managerOverrideNote} /></label>
                    </div>
                  ) : null}
                  <div className="rms-payment-panel">
                    <div className="rms-payment-summary">
                      <strong>{formatMoney(correctionSettlementAbs, currencyCode)}</strong>
                      <span>{correctionSettlementTotal < 0 || correctionSelection?.correctionType === "RETURN" ? "Refund tender" : "Payment tender"}</span>
                      <button className="rms-row-button is-add" onClick={() => addPaymentDraft(setCorrectionPayments)} type="button">Add</button>
                    </div>
                    {correctionPayments.map((draft, index) => {
                      const tender = tenderForDraft(draft);
                      return (
                        <div className="rms-payment-row" key={draft.id}>
                          <select onChange={(event) => updatePaymentDraft(setCorrectionPayments, draft.id, { tenderMethodCode: event.target.value, bankAccountId: "" })} value={draft.tenderMethodCode}>
                            {workspace.tenderMethods.map((method) => <option key={method.tenderMethodCode} value={method.tenderMethodCode}>{method.tenderMethodName}</option>)}
                          </select>
                          <select disabled={!tender?.requiresBankAccount} onChange={(event) => updatePaymentDraft(setCorrectionPayments, draft.id, { bankAccountId: event.target.value })} value={draft.bankAccountId}>
                            <option value="">Bank account</option>
                            {workspace.bankAccounts.map((account) => <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.accountNumber}</option>)}
                          </select>
                          <input onChange={(event) => updatePaymentDraft(setCorrectionPayments, draft.id, { amount: event.target.value })} type="number" value={draft.amount} />
                          <input onChange={(event) => updatePaymentDraft(setCorrectionPayments, draft.id, { reference: event.target.value })} placeholder={tender?.requiresReference ? "Reference required" : "Reference"} value={draft.reference} />
                          <button aria-label={`Remove payment ${index + 1}`} className="rms-icon-button is-danger rms-payment-remove-button" onClick={() => removePaymentDraft(setCorrectionPayments, draft.id)} title="Remove payment" type="button"><TrashIcon /></button>
                        </div>
                      );
                    })}
                  </div>
                  <button className="rms-button is-primary rms-pay-button" disabled={isPostingCorrection} onClick={() => void submitCorrection()} type="button">
                    {isPostingCorrection
                      ? "Posting..."
                      : correctionRequiresManagerOverride
                        ? "Void transaction"
                        : "Complete correction"}
                  </button>
                </div>
              ) : (
                <div className="rms-empty-catalog">Select a completed sale receipt to start a linked return or exchange.</div>
              )}
              {correctionMessage ? <p className="rms-inline-message">{correctionMessage}</p> : null}
            </section>
          </div>
        ) : null}

        {activeWorkspace === "reports" ? (
          <div className="rms-workspace rms-report-shell">
            <aside className="rms-reports-tree">
              {reportGroups.map(([group, definitions]) => (
                <details key={group} open>
                  <summary>{group}</summary>
                  {definitions.map((definition) => (
                    <button className={activeReport === definition.reportId ? "is-active" : ""} key={definition.reportId} onClick={() => setActiveReport(definition.reportId)} type="button">■ {definition.label}</button>
                  ))}
                </details>
              ))}
            </aside>
            <section className="rms-panel rms-report-detail">
              <div className="rms-panel-title"><span>{reportDateFrom === reportDateTo ? reportDateFrom : `${reportDateFrom} to ${reportDateTo}`}</span><h2>{activeReportDefinition?.label ?? activeReport.toUpperCase()}</h2><StatusPill>{`${activeReportRowCount} row(s)`}</StatusPill></div>
              <div className="rms-report-toolbar">
                {activeReportParameterIds.map((parameterId) => renderReportParameter(parameterId))}
                {reportScope === "STORE" ? (
                  <>
                    <label>
                      <span>Manager</span>
                      <input onChange={(event) => setManagerOverrideCode(event.target.value)} placeholder="Login" value={managerOverrideCode} />
                    </label>
                    <label>
                      <span>Password</span>
                      <input onChange={(event) => setManagerOverridePassword(event.target.value)} type="password" value={managerOverridePassword} />
                    </label>
                    <label>
                      <span>Reason</span>
                      <input onChange={(event) => setManagerOverrideNote(event.target.value)} placeholder="Optional" value={managerOverrideNote} />
                    </label>
                  </>
                ) : null}
                <button className="rms-button" disabled={isLoadingReport} onClick={() => void loadActiveReport()} type="button">{isLoadingReport ? "Loading..." : "Apply"}</button>
                <button className="rms-button" onClick={openActiveReportWindow} type="button">Print</button>
                <button className="rms-button is-primary" onClick={exportActiveReport} type="button">Export CSV</button>
              </div>
              {reportMessage ? <p className="rms-inline-message">{reportMessage}</p> : null}
              {activeReport === "sales" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Receipt</span><span>Type</span><span>Items</span><span>Total</span><span>Cashier</span></div>
                  {reportSalesRows.map((row) => (
                    <div className="rms-table-row" key={row.transactionNo}><strong>{row.transactionNo}<small>{row.productPreview}</small></strong><span>{row.transactionType}</span><span>{row.lineCount}</span><b>{formatMoney(row.totalAmount, currencyCode)}</b><span>{row.cashierCode}</span></div>
                  ))}
                  {!reportSalesRows.length ? <EmptyState title="No sales rows" detail="No receipts match the current report filter." /> : null}
                </div>
              ) : null}
              {activeReport === "products" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Product</span><span>Qty</span><span>Gross</span><span>Tax</span><span>Net</span></div>
                  {reportProductRows.map((row) => (
                    <div className="rms-table-row" key={`${row.productCode}:${row.sellingUnitOfMeasure}`}><strong>{row.productName}<small>{row.productCode} · {row.sellingUnitOfMeasure} · base {formatNumber.format(row.baseQuantity)} {row.baseUnitOfMeasure}</small></strong><span>{formatNumber.format(row.quantity)}</span><span>{formatMoney(row.grossAmount, currencyCode)}</span><span>{formatMoney(row.taxAmount, currencyCode)}</span><b>{formatMoney(row.netAmount, currencyCode)}</b></div>
                  ))}
                  {!reportProductRows.length ? <EmptyState title="No product rows" detail="No product movement matches the current search." /> : null}
                </div>
              ) : null}
              {activeReport === "orders" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Order</span><span>Status</span><span>Total</span><span>Deposit</span><span>Balance</span></div>
                  {reportSalesOrderRows.map((row) => (
                    <div className="rms-table-row" key={row.orderId}><strong>{row.orderNo}<small>{row.customerName}</small></strong><span>{row.status}</span><span>{formatMoney(row.totalAmount, currencyCode)}</span><span>{formatMoney(row.depositAmount, currencyCode)}</span><b>{formatMoney(row.balanceAmount, currencyCode)}</b></div>
                  ))}
                  {!reportSalesOrderRows.length ? <EmptyState title="No sales orders" detail="No sales orders match the current report filter." /> : null}
                </div>
              ) : null}
              {activeReport === "layaways" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Layaway</span><span>Status</span><span>Outstanding</span><span>Ageing</span><span>Reservation</span></div>
                  {reportLayawayRows.map((row) => (
                    <div className="rms-table-row" key={row.orderId}><strong>{row.orderNo}<small>{row.customerName}</small></strong><span>{row.status}</span><b>{formatMoney(row.balanceAmount, currencyCode)}<small>Paid {formatMoney(row.paidAmount, currencyCode)}</small></b><span>{row.ageingBucket}<small>{row.ageDays} day(s)</small></span><span>{row.reservationStatus}<small>{formatNumber.format(row.reservedBaseQuantity)} base unit(s)</small></span></div>
                  ))}
                  {!reportLayawayRows.length ? <EmptyState title="No layaways" detail="No layaway orders match the current report filter." /> : null}
                </div>
              ) : null}
              {activeReport === "layawayPayments" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Layaway</span><span>Purpose</span><span>Tender</span><span>Amount</span><span>Received by</span></div>
                  {reportLayawayPaymentRows.map((row) => (
                    <div className="rms-table-row" key={row.paymentId}><strong>{row.orderNo}<small>{row.customerName}</small></strong><span>{row.paymentPurpose}</span><span>{row.tenderName}<small>{row.reference ?? "No reference"}</small></span><b>{formatMoney(row.amount, currencyCode)}</b><span>{row.cashierCode ?? "Unassigned"}<small>{[row.shiftNo, row.terminalCode].filter(Boolean).join(" / ") || new Date(row.receivedAt).toLocaleString()}</small></span></div>
                  ))}
                  {!reportLayawayPaymentRows.length ? <EmptyState title="No layaway payments" detail="No deposits, installments, or refunds match the current report filter." /> : null}
                </div>
              ) : null}
              {activeReport === "tenders" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Tender</span><span>Method</span><span>Txn</span><span>Net</span></div>
                  {reportTenderRows.map((row) => (
                    <div className="rms-table-row" key={`${row.paymentMethod}:${row.tenderMethodCode}`}><strong>{row.tenderMethodName ?? row.paymentMethod}<small>{row.tenderMethodCode ?? "unmapped"}</small></strong><span>{row.paymentMethod}</span><span>{row.transactionCount}</span><b>{formatMoney(row.netAmount, currencyCode)}</b></div>
                  ))}
                  {!reportTenderRows.length ? <EmptyState title="No tender rows" detail="No tender movement matches the current search." /> : null}
                </div>
              ) : null}
              {activeReport === "inventory" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Product</span><span>Location</span><span>On hand</span><span>Value</span></div>
                  {reportInventoryRows.map((row) => (
                    <div className="rms-table-row" key={`${row.productCode}:${row.locationName}`}><strong>{row.productName}<small>{row.productCode}</small></strong><span>{row.locationName}</span><span>{formatNumber.format(row.quantityOnHand)}</span><b>{formatMoney(row.stockValue, currencyCode)}</b></div>
                  ))}
                  {!reportInventoryRows.length ? <EmptyState title="No inventory rows" detail="No inventory valuation rows match the current search." /> : null}
                </div>
              ) : null}
              {activeReport === "banking" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Deposit</span><span>EOD</span><span>Bank</span><span>Amount</span><span>Reference</span></div>
                  {reportBankingRows.map((row) => (
                    <div className="rms-table-row" key={row.depositNo}><strong>{row.depositNo}<small>{row.shiftNo}</small></strong><span>{row.reconciliationNo}</span><span>{row.bankName ?? row.accountNumber ?? "Manual"}</span><b>{formatMoney(row.amount, currencyCode)}</b><span>{row.reference}</span></div>
                  ))}
                  {!reportBankingRows.length ? <EmptyState title="No banking rows" detail="Banking deposits will appear after manager closeout and deposit posting." /> : null}
                </div>
              ) : null}
              {activeReport === "shifts" ? (
                <div className="rms-table rms-report-table">
                  <div className="rms-table-head"><span>Shift</span><span>Status</span><span>Txn</span><span>Expected</span><span>Variance</span></div>
                  {reportShiftRows.map((row) => (
                    <div className="rms-table-row" key={row.shiftId}><strong>{row.shiftNo}<small>{new Date(row.openedAt).toLocaleString()}</small></strong><span>{row.status}</span><span>{row.transactionCount}</span><b>{formatMoney(row.expectedCashAmount, currencyCode)}</b><span>{row.varianceAmount === null ? "-" : formatMoney(row.varianceAmount, currencyCode)}</span></div>
                  ))}
                  {!reportShiftRows.length ? <EmptyState title="No shift rows" detail="No shifts match the current report filter." /> : null}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {activeWorkspace === "settings" ? (
          <OnlineStorePosSettingsWorkspace currencyCode={currencyCode} workspace={workspace} />
        ) : null}

        {activeWorkspace === "ecommerce" ? (
          ecommerceWorkspace ? (
            <div className="rms-workspace rms-ecommerce-workspace">
              <OnlineStoreEcommerceWorkspace embedded initialWorkspace={ecommerceWorkspace} />
            </div>
          ) : (
            <div className="rms-workspace">
              <section className="rms-panel">
                <div className="rms-panel-title">
                  <span>Customer ordering</span>
                  <h2>{isLoadingEcommerce ? "Loading ecommerce" : "Ecommerce unavailable"}</h2>
                </div>
                {ecommerceLoadError ? (
                  <>
                    <p>{ecommerceLoadError}</p>
                    <button
                      className="rms-button is-primary"
                      onClick={() => setEcommerceLoadAttempt((attempt) => attempt + 1)}
                      type="button"
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  <p>Loading customer orders, products, payments, and storefront settings.</p>
                )}
              </section>
            </div>
          )
        ) : null}
      </section>
      <ConfirmationDialog
        confirmLabel={
          pendingStockCountConfirmation?.action === "COMMIT" ? "Commit stock count" : "Save count sheet"
        }
        description={
          pendingStockCountConfirmation?.action === "COMMIT" ? (
            <p>
              This will commit{" "}
              <strong>{pendingStockCountConfirmation.sessionNo}</strong> and post the variance to
              stock.
            </p>
          ) : (
            <p>
              This will save{" "}
              <strong>{pendingStockCountConfirmation?.rowCount ?? 0}</strong> item(s) as one count
              sheet for supervisor commit.
            </p>
          )
        }
        isSubmitting={isPostingInventory}
        onCancel={() => {
          if (!isPostingInventory) {
            setPendingStockCountConfirmation(null);
          }
        }}
        onConfirm={confirmPendingStockCountAction}
        open={Boolean(pendingStockCountConfirmation)}
        title={
          pendingStockCountConfirmation?.action === "COMMIT"
            ? "Commit stock count"
            : "Save count sheet"
        }
        tone={pendingStockCountConfirmation?.action === "COMMIT" ? "warning" : "default"}
      />
      <ConfirmationDialog
        confirmLabel="Confirm for HQ"
        description={
          <p>
            This will send <strong>{pendingExpenseConfirmation?.expenseNo ?? "this expense"}</strong>{" "}
            for HQ Finance review. Amount:{" "}
            <strong>{formatMoney(pendingExpenseConfirmation?.amount ?? 0, currencyCode)}</strong>.
          </p>
        }
        isSubmitting={isPostingInventory}
        onCancel={() => {
          if (!isPostingInventory) {
            setPendingExpenseConfirmation(null);
          }
        }}
        onConfirm={() => {
          if (pendingExpenseConfirmation) {
            void confirmStoreExpense(pendingExpenseConfirmation.expenseId);
          }
        }}
        open={Boolean(pendingExpenseConfirmation)}
        title="Confirm store expense"
        tone="warning"
      />
      {inventoryStartupAlertOpen ? (
        <OnlineInventoryStartupAlertsDialog
          expiryAlertLeadDays={workspace.optionSettings.expiryAlertLeadDays}
          expiryCriticalDays={workspace.optionSettings.expiryCriticalDays}
          expiringRows={
            workspace.optionSettings.showExpiringBatchesOnStartup
              ? startupExpiringBatchRows
              : []
          }
          lowStockRows={
            workspace.optionSettings.showCriticalStocksOnStartup ? stockAlertRows : []
          }
          onClose={() => setInventoryStartupAlertOpen(false)}
          openInventory={() => {
            setInventoryStartupAlertOpen(false);
            setActiveWorkspace("inventory");
            setInventoryTab("stock");
            setActiveStockSection("inventory-browser");
          }}
        />
      ) : null}
      {isScreenLocked ? (
        <div className="rms-lock-overlay" role="dialog" aria-modal="true">
          <section className="rms-login-card rms-lock-card">
            <div className="rms-panel-title">
              <div><span>Screen locked</span><h2>Unlock online store</h2></div>
              <StatusPill tone="warning">Preserved</StatusPill>
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
                <input autoComplete="username" onChange={(event) => setLockLoginId(event.target.value)} value={lockLoginId} />
              </label>
              <label>
                <span>Password</span>
                <input autoComplete="current-password" autoFocus onChange={(event) => setLockPassword(event.target.value)} type="password" value={lockPassword} />
              </label>
              <div className="rms-login-actions">
                <button className="rms-button is-primary" disabled={isUnlocking || !lockLoginId || !lockPassword} type="submit">
                  {isUnlocking ? "Unlocking..." : "Unlock"}
                </button>
                <button
                  className="rms-button"
                  disabled={isUnlocking}
                  onClick={() => {
                    void fetch("/api/auth/sign-out", { method: "POST" }).finally(() => {
                      window.location.href = "/sign-in";
                    });
                  }}
                  type="button"
                >
                  Sign out
                </button>
              </div>
              {lockMessage ? <p className="rms-inline-message">{lockMessage}</p> : null}
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
