import { getEnterpriseSyncDashboard } from "@/server/repositories/enterprise-dashboard.repository";
import { getEnterpriseCustomerWorkspace } from "@/server/repositories/enterprise-customers.repository";
import { getEnterpriseInventoryWorkspace } from "@/server/repositories/enterprise-inventory.repository";
import {
  getEnterpriseOperationsDashboard,
  type EnterpriseOperationsDashboardFilters
} from "@/server/repositories/enterprise-operations.repository";
import {
  getEnterprisePosWorkspace,
  type EnterprisePosWorkspaceData
} from "@/server/repositories/enterprise-pos.repository";
import {
  getEnterprisePromotionWorkspace,
  type EnterprisePromotionWorkspaceData
} from "@/server/repositories/enterprise-promotions.repository";
import {
  getEnterprisePurchasesWorkspace
} from "@/server/repositories/enterprise-purchases.repository";
import {
  getEnterpriseSecurityWorkspace
} from "@/server/repositories/enterprise-security.repository";
import {
  getEnterpriseSupplierWorkspace
} from "@/server/repositories/enterprise-suppliers.repository";
import { type Prisma } from "@prisma/client";
import { readJsonStringArray } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import {
  InventoryMovementType,
  PosTransactionStatus,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const nextValues: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();

    if (!normalized) {
      continue;
    }

    const duplicateKey = normalized.toUpperCase();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    nextValues.push(normalized);
  }

  return nextValues;
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatPromotionDiscountLabel(
  promotion: EnterprisePromotionWorkspaceData["promotionRows"][number],
  currencyCode: string
) {
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode
  });

  if (promotion.discountType === "PERCENT") {
    return `${promotion.discountValue.toFixed(2)}% off`;
  }

  if (promotion.discountType === "FIXED_PRICE") {
    return `${currencyFormatter.format(promotion.discountValue)} fixed price`;
  }

  return `${currencyFormatter.format(promotion.discountValue)} off`;
}

function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not posted yet";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));

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

function parseDateStart(value: string | null | undefined) {
  const parsed = parseIso(value);

  if (!parsed) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function parseDateEnd(value: string | null | undefined) {
  const parsed = parseIso(value);

  if (!parsed) {
    return null;
  }

  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

function readStringArray(value: unknown) {
  return readJsonStringArray(value);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function daysSince(value: Date | null) {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 86_400_000));
}

type StoreLaneAggregate = {
  store: string;
  storeCode: string;
  nodeCodes: string[];
  completedTransactions: number;
  salesValue: number;
  exceptionCount: number;
  lastTransactionAt: string | null;
  lastTransactionAtLabel: string;
};

function buildLaneAggregateByStore(
  laneRows: EnterprisePosWorkspaceData["laneRows"]
): Map<string, StoreLaneAggregate> {
  const rows = new Map<string, StoreLaneAggregate>();

  for (const lane of laneRows) {
    const current = rows.get(lane.storeCode);
    const currentDate = parseIso(current?.lastTransactionAt);
    const nextDate = parseIso(lane.lastTransactionAt);

    if (!current) {
      rows.set(lane.storeCode, {
        store: lane.store,
        storeCode: lane.storeCode,
        nodeCodes: [lane.nodeCode],
        completedTransactions: lane.completedTransactions,
        salesValue: lane.salesValue,
        exceptionCount: lane.exceptionCount,
        lastTransactionAt: lane.lastTransactionAt,
        lastTransactionAtLabel: lane.lastTransactionAtLabel
      });
      continue;
    }

    const shouldReplaceTimestamp =
      Boolean(nextDate) && (!currentDate || nextDate!.getTime() >= currentDate.getTime());

    current.nodeCodes = uniqueStrings([...current.nodeCodes, lane.nodeCode]);
    current.completedTransactions += lane.completedTransactions;
    current.salesValue += lane.salesValue;
    current.exceptionCount += lane.exceptionCount;

    if (shouldReplaceTimestamp) {
      current.lastTransactionAt = lane.lastTransactionAt;
      current.lastTransactionAtLabel = lane.lastTransactionAtLabel;
    }
  }

  return rows;
}

export type EnterpriseReportingDashboardData = {
  currencyCode: string;
  filters: {
    storeCode: string;
    dateFrom: string;
    dateTo: string;
    scopeLabel: string;
  };
  shopOptions: Array<{
    storeCode: string;
    storeName: string;
    nodeCode: string | null;
  }>;
  metrics: {
    activeStores: number;
    attentionNodes: number;
    completedTransactions: number;
    postedRevenue: number;
    discountAmount: number;
    averageBasket: number;
    openSalesOrders: number;
    closeoutsPosted: number;
    bankedAmount: number;
    receivableExposureAmount: number;
    negativePositions: number;
    activePromotions: number;
    openSupplierClaims: number;
    tenderMethodsUsed: number;
    receipts: number;
    purchaseOrders: number;
    goodsReceipts: number;
    transfers: number;
    activeSuppliers: number;
    activeUsers: number;
    cogsAmount: number;
    grossProfitAmount: number;
    grossMarginPercent: number;
    trackedExpenseAmount: number;
    operatingProfitAmount: number;
    slowMovingItems: number;
  };
  tenderReportRows: Array<{
    tenderKey: string;
    tenderCode: string | null;
    tenderName: string;
    paymentMethod: string;
    netAmount: number;
    transactionCount: number;
    share: number;
  }>;
  receiptReportRows: Array<{
    transactionNo: string;
    store: string;
    storeCode: string;
    cashierCode: string | null;
    terminal: string | null;
    originNodeCode: string | null;
    totalAmount: number;
    taxAmount: number;
    itemCount: number;
    tenderSummary: string;
    productSummary: string;
    completedAt: string | null;
    completedAtLabel: string;
  }>;
  cashierSalesRows: Array<{
    cashierCode: string;
    store: string;
    storeCode: string;
    transactionCount: number;
    netSales: number;
    discountAmount: number;
    averageBasket: number;
    lastSaleAt: string | null;
    lastSaleAtLabel: string;
  }>;
  itemSalesRows: Array<{
    productCode: string;
    productName: string;
    department: string | null;
    category: string | null;
    store: string;
    storeCode: string;
    quantitySold: number;
    netSales: number;
    discountAmount: number;
    transactionCount: number;
    lastSoldAt: string | null;
    lastSoldAtLabel: string;
  }>;
  promotionPerformanceRows: Array<{
    promotionCode: string;
    promotionName: string;
    store: string;
    storeCode: string;
    lineCount: number;
    transactionCount: number;
    quantitySold: number;
    discountAmount: number;
    netSales: number;
    lastAppliedAt: string | null;
    lastAppliedAtLabel: string;
  }>;
  stockValuationRows: Array<{
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    warehouseCode: string | null;
    warehouseName: string | null;
    productCode: string;
    productName: string;
    onHandQuantity: number;
    unitCost: number;
    stockValue: number;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
  }>;
  cogsReportRows: Array<{
    productCode: string;
    productName: string;
    department: string | null;
    category: string | null;
    store: string;
    storeCode: string;
    quantitySold: number;
    netSales: number;
    cogsAmount: number;
    grossProfit: number;
    grossMarginPercent: number;
    transactionCount: number;
    lastSoldAt: string | null;
    lastSoldAtLabel: string;
  }>;
  profitAndLossRows: Array<{
    lineCode: string;
    section: string;
    lineItem: string;
    amount: number;
    lineType: "income" | "contra" | "expense" | "subtotal" | "tax";
    basis: string;
    sortOrder: number;
  }>;
  expenseTrackingRows: Array<{
    expenseId: string;
    expenseType: string;
    category: string;
    referenceNo: string;
    storeCode: string | null;
    storeName: string | null;
    supplierName: string | null;
    status: string;
    amount: number;
    recognizedAmount: number;
    source: string;
    incurredAt: string | null;
    incurredAtLabel: string;
  }>;
  slowMovingItemRows: Array<{
    productCode: string;
    productName: string;
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    warehouseName: string | null;
    onHandQuantity: number;
    unitCost: number;
    stockValue: number;
    quantitySoldInScope: number;
    revenueInScope: number;
    lastSaleAt: string | null;
    lastSaleAtLabel: string;
    daysSinceLastSale: number | null;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
    riskBand: string;
  }>;
  kpiScorecardRows: Array<{
    kpiCode: string;
    kpiName: string;
    group: string;
    value: number;
    displayKind: "currency" | "number" | "percent";
    status: "Healthy" | "Watch" | "Review";
    basis: string;
  }>;
  cashierVarianceRows: Array<{
    cashierCode: string;
    store: string;
    storeCode: string;
    closeoutCount: number;
    declaredCashAmount: number;
    varianceAmount: number;
    bankedAmount: number;
    lastCloseoutAt: string | null;
    lastCloseoutAtLabel: string;
  }>;
  purchaseOrderReportRows: Array<{
    purchaseOrderNo: string;
    status: string;
    supplierNo: string | null;
    supplierName: string | null;
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    orderedQuantity: number;
    receivedQuantity: number;
    outstandingQuantity: number;
    grandTotalAmount: number;
    lineCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  goodsReceiptReportRows: Array<{
    goodsReceiptNo: string;
    purchaseOrderNo: string | null;
    supplierNo: string | null;
    supplierName: string | null;
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    totalQuantity: number;
    lineCount: number;
    receivedAt: string;
    receivedAtLabel: string;
  }>;
  transferReportRows: Array<{
    transferNo: string;
    transferBatchNo: string | null;
    status: string;
    origin: string;
    sourceStoreName: string;
    sourceLocationCode: string;
    destinationStoreName: string;
    destinationLocationCode: string;
    productCode: string;
    productName: string;
    requestedQuantity: number;
    issuedQuantity: number;
    receivedQuantity: number;
    inTransitQuantity: number;
    requestedAt: string;
    requestedAtLabel: string;
  }>;
  supplierReportRows: Array<{
    supplierNo: string;
    name: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    linkedProductCount: number;
    openPurchaseOrderCount: number;
    openSupplierClaimCount: number;
    postedSupplierReturnCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  userReportRows: Array<{
    loginId: string;
    displayName: string;
    email: string | null;
    accountStatus: string;
    homeStoreCode: string | null;
    homeStoreName: string | null;
    roleCodes: string[];
    cashierEligible: boolean;
    supervisorEligible: boolean;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  storePerformanceRows: Array<{
    store: string;
    storeCode: string;
    nodeCode: string | null;
    completedTransactions: number;
    salesValue: number;
    averageBasket: number;
    exceptionCount: number;
    lastActivityAt: string | null;
    lastActivityAtLabel: string;
  }>;
  receivableRows: Array<{
    customerNo: string;
    fullName: string;
    homeStoreName: string | null;
    allowCreditSales: boolean;
    creditLimitAmount: number | null;
    receivableBalanceAmount: number;
    loyaltyPointsBalance: number;
    lastTransactionAt: string | null;
    lastTransactionAtLabel: string;
  }>;
  inventoryRiskRows: Array<{
    locationCode: string;
    locationName: string;
    storeName: string | null;
    warehouseName: string | null;
    negativePositions: number;
    productCount: number;
    onHandQuantity: number;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
  }>;
  promotionRows: Array<{
    promotionCode: string;
    name: string;
    targetScope: string;
    discountLabel: string;
    mechanicLabel: string;
    eligibilityLabel: string;
    status: string;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  exceptionRows: Array<{
    eventId: string;
    store: string;
    storeCode: string;
    aggregateType: string;
    eventType: string;
    status: string;
    referenceLabel: string;
    errorMessage: string | null;
    receivedAt: string;
    receivedAtLabel: string;
    retryable: boolean;
  }>;
  salesOrderRows: Array<{
    orderNo: string;
    store: string;
    storeCode: string;
    terminal: string | null;
    sourceTransactionNo: string;
    customerNo: string | null;
    customerName: string | null;
    status: string;
    totalAmount: number;
    operatorName: string | null;
    fulfilledTransactionNo: string | null;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  closeoutRows: Array<{
    reconciliationNo: string;
    store: string;
    storeCode: string;
    terminal: string | null;
    shiftNo: string;
    cashierCode: string;
    declaredCashAmount: number;
    varianceAmount: number;
    bankedAmount: number;
    remainingBankingAmount: number;
    reconciledAt: string;
    reconciledAtLabel: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export type EnterpriseReportingDashboardFilters = EnterpriseOperationsDashboardFilters;

type ReportingFactRows = Pick<
  EnterpriseReportingDashboardData,
  | "itemSalesRows"
  | "promotionPerformanceRows"
  | "stockValuationRows"
  | "cogsReportRows"
  | "slowMovingItemRows"
> & {
  financialTotals: {
    grossReceipts: number;
    netSalesExTax: number;
    discountAmount: number;
    taxAmount: number;
    cogsAmount: number;
    grossProfitAmount: number;
    grossMarginPercent: number;
  };
};

function buildUnavailableFilters(input?: EnterpriseReportingDashboardFilters) {
  const storeCode = input?.storeCode?.trim() ?? "";

  return {
    storeCode,
    dateFrom: input?.dateFrom?.trim() ?? "",
    dateTo: input?.dateTo?.trim() ?? "",
    scopeLabel: storeCode || "All shops"
  };
}

export function buildUnavailableEnterpriseReportingDashboard(
  reason: string,
  input?: EnterpriseReportingDashboardFilters
): EnterpriseReportingDashboardData {
  return {
    currencyCode: "USD",
    filters: buildUnavailableFilters(input),
    shopOptions: [],
    metrics: {
      activeStores: 0,
      attentionNodes: 0,
      completedTransactions: 0,
      postedRevenue: 0,
      discountAmount: 0,
      averageBasket: 0,
      openSalesOrders: 0,
    closeoutsPosted: 0,
    bankedAmount: 0,
      receivableExposureAmount: 0,
      negativePositions: 0,
      activePromotions: 0,
      openSupplierClaims: 0,
      tenderMethodsUsed: 0,
      receipts: 0,
      purchaseOrders: 0,
      goodsReceipts: 0,
      transfers: 0,
      activeSuppliers: 0,
      activeUsers: 0,
      cogsAmount: 0,
      grossProfitAmount: 0,
      grossMarginPercent: 0,
      trackedExpenseAmount: 0,
      operatingProfitAmount: 0,
      slowMovingItems: 0
    },
    tenderReportRows: [],
    receiptReportRows: [],
    cashierSalesRows: [],
    itemSalesRows: [],
    promotionPerformanceRows: [],
    stockValuationRows: [],
    cogsReportRows: [],
    profitAndLossRows: [],
    expenseTrackingRows: [],
    slowMovingItemRows: [],
    kpiScorecardRows: [],
    cashierVarianceRows: [],
    purchaseOrderReportRows: [],
    goodsReceiptReportRows: [],
    transferReportRows: [],
    supplierReportRows: [],
    userReportRows: [],
    storePerformanceRows: [],
    receivableRows: [],
    inventoryRiskRows: [],
    promotionRows: [],
    exceptionRows: [],
    salesOrderRows: [],
    closeoutRows: [],
    postureMessages: [
      "Flash ERP reporting will appear here once the enterprise control-plane database is available.",
      "This workspace is intended to consolidate sales, receivables, inventory posture, promotions, and branch attention in one reporting lane."
    ],
    priorities: [
      "Start the configured SQL Server service and confirm the primary enterprise node is active.",
      "Run the seed and a store sync cycle so enterprise receives posted sales, stock, and customer activity.",
      "Reopen this workspace once the control-plane repositories can read live data."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

async function getReportingEnterpriseContext() {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true
    }
  });
}

function buildCompletedTransactionWhere(
  retailOrgId: string,
  filters: EnterpriseReportingDashboardData["filters"]
): Prisma.PosTransactionWhereInput {
  const dateFrom = parseDateStart(filters.dateFrom);
  const dateTo = parseDateEnd(filters.dateTo);

  return {
    retailOrgId,
    status: PosTransactionStatus.COMPLETED,
    deletedAt: null,
    ...(filters.storeCode
      ? {
          store: {
            code: filters.storeCode
          }
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          completedAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {})
          }
        }
      : {})
  };
}

async function getReportingFactRows(
  filters: EnterpriseReportingDashboardData["filters"]
): Promise<ReportingFactRows> {
  const enterpriseContext = await getReportingEnterpriseContext();

  if (!enterpriseContext) {
    return {
      itemSalesRows: [],
      promotionPerformanceRows: [],
      stockValuationRows: [],
      cogsReportRows: [],
      slowMovingItemRows: [],
      financialTotals: {
        grossReceipts: 0,
        netSalesExTax: 0,
        discountAmount: 0,
        taxAmount: 0,
        cogsAmount: 0,
        grossProfitAmount: 0,
        grossMarginPercent: 0
      }
    };
  }

  const transactionWhere = buildCompletedTransactionWhere(enterpriseContext.retailOrgId, filters);
  const movementDateFrom = parseDateStart(filters.dateFrom);
  const movementDateTo = parseDateEnd(filters.dateTo);
  const [transactionAggregate, saleLines, stockMovements, financialMovements] = await Promise.all([
    prisma.posTransaction.aggregate({
      where: transactionWhere,
      _sum: {
        subtotalAmount: true,
        discountAmount: true,
        taxAmount: true,
        totalAmount: true
      }
    }),
    prisma.posTransactionLine.findMany({
      where: {
        lineIntent: "SALE",
        posTransaction: transactionWhere
      },
      orderBy: {
        posTransaction: {
          completedAt: "desc"
        }
      },
      take: 2000,
      select: {
        posTransactionId: true,
        productCodeSnapshot: true,
        productNameSnapshot: true,
        appliedPromotionCodeSnapshot: true,
        appliedPromotionNameSnapshot: true,
        quantity: true,
        discountAmount: true,
        lineTotal: true,
        product: {
          select: {
            department: true,
            category: true
          }
        },
        posTransaction: {
          select: {
            completedAt: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseContext.retailOrgId,
        ...(filters.storeCode
          ? {
              store: {
                code: filters.storeCode
              }
            }
          : {})
      },
      orderBy: {
        occurredAt: "desc"
      },
      take: 3000,
      select: {
        movementType: true,
        quantity: true,
        unitCost: true,
        occurredAt: true,
        product: {
          select: {
            code: true,
            name: true,
            baseCostPrice: true
          }
        },
        inventoryLocation: {
          select: {
            code: true,
            name: true,
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
          }
        }
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseContext.retailOrgId,
        movementType: {
          in: [InventoryMovementType.SALE, InventoryMovementType.RETURN]
        },
        ...(filters.storeCode
          ? {
              store: {
                code: filters.storeCode
              }
            }
          : {}),
        ...(movementDateFrom || movementDateTo
          ? {
              occurredAt: {
                ...(movementDateFrom ? { gte: movementDateFrom } : {}),
                ...(movementDateTo ? { lte: movementDateTo } : {})
              }
            }
          : {})
      },
      orderBy: {
        occurredAt: "desc"
      },
      take: 3000,
      select: {
        movementType: true,
        quantity: true,
        unitCost: true,
        referenceId: true,
        externalReference: true,
        occurredAt: true,
        product: {
          select: {
            code: true,
            name: true,
            department: true,
            category: true,
            baseCostPrice: true
          }
        },
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    })
  ]);

  const itemAggregates = new Map<
    string,
    {
      productCode: string;
      productName: string;
      department: string | null;
      category: string | null;
      store: string;
      storeCode: string;
      quantitySold: number;
      netSales: number;
      discountAmount: number;
      transactionIds: Set<string>;
      lastSoldAt: Date | null;
    }
  >();
  const promotionAggregates = new Map<
    string,
    {
      promotionCode: string;
      promotionName: string;
      store: string;
      storeCode: string;
      lineCount: number;
      transactionIds: Set<string>;
      quantitySold: number;
      discountAmount: number;
      netSales: number;
      lastAppliedAt: Date | null;
    }
  >();

  for (const line of saleLines) {
    const storeCode = line.posTransaction.store.code;
    const productKey = `${storeCode}:${line.productCodeSnapshot}`;
    const existingItem = itemAggregates.get(productKey) ?? {
      productCode: line.productCodeSnapshot,
      productName: line.productNameSnapshot,
      department: line.product.department,
      category: line.product.category,
      store: line.posTransaction.store.name,
      storeCode,
      quantitySold: 0,
      netSales: 0,
      discountAmount: 0,
      transactionIds: new Set<string>(),
      lastSoldAt: null
    };

    existingItem.quantitySold += Number(line.quantity);
    existingItem.netSales += Number(line.lineTotal);
    existingItem.discountAmount += Number(line.discountAmount);
    existingItem.transactionIds.add(line.posTransactionId);

    if (
      line.posTransaction.completedAt &&
      (!existingItem.lastSoldAt ||
        line.posTransaction.completedAt.getTime() > existingItem.lastSoldAt.getTime())
    ) {
      existingItem.lastSoldAt = line.posTransaction.completedAt;
    }

    itemAggregates.set(productKey, existingItem);

    if (!line.appliedPromotionCodeSnapshot || Number(line.discountAmount) <= 0) {
      continue;
    }

    const promotionKey = `${storeCode}:${line.appliedPromotionCodeSnapshot}`;
    const existingPromotion = promotionAggregates.get(promotionKey) ?? {
      promotionCode: line.appliedPromotionCodeSnapshot,
      promotionName: line.appliedPromotionNameSnapshot ?? line.appliedPromotionCodeSnapshot,
      store: line.posTransaction.store.name,
      storeCode,
      lineCount: 0,
      transactionIds: new Set<string>(),
      quantitySold: 0,
      discountAmount: 0,
      netSales: 0,
      lastAppliedAt: null
    };

    existingPromotion.lineCount += 1;
    existingPromotion.quantitySold += Number(line.quantity);
    existingPromotion.discountAmount += Number(line.discountAmount);
    existingPromotion.netSales += Number(line.lineTotal);
    existingPromotion.transactionIds.add(line.posTransactionId);

    if (
      line.posTransaction.completedAt &&
      (!existingPromotion.lastAppliedAt ||
        line.posTransaction.completedAt.getTime() > existingPromotion.lastAppliedAt.getTime())
    ) {
      existingPromotion.lastAppliedAt = line.posTransaction.completedAt;
    }

    promotionAggregates.set(promotionKey, existingPromotion);
  }

  const stockAggregates = new Map<
    string,
    {
      locationCode: string;
      locationName: string;
      storeCode: string | null;
      storeName: string | null;
      warehouseCode: string | null;
      warehouseName: string | null;
      productCode: string;
      productName: string;
      onHandQuantity: number;
      unitCost: number;
      lastMovementAt: Date | null;
    }
  >();

  for (const movement of stockMovements) {
    const locationCode = movement.inventoryLocation.code;
    const productCode = movement.product.code;
    const key = `${locationCode}:${productCode}`;
    const unitCost = Number(movement.unitCost ?? movement.product.baseCostPrice ?? 0);
    const existing = stockAggregates.get(key) ?? {
      locationCode,
      locationName: movement.inventoryLocation.name,
      storeCode: movement.inventoryLocation.store?.code ?? null,
      storeName: movement.inventoryLocation.store?.name ?? null,
      warehouseCode: movement.inventoryLocation.warehouse?.code ?? null,
      warehouseName: movement.inventoryLocation.warehouse?.name ?? null,
      productCode,
      productName: movement.product.name,
      onHandQuantity: 0,
      unitCost,
      lastMovementAt: null
    };

    existing.onHandQuantity += Number(movement.quantity);

    if (unitCost > 0) {
      existing.unitCost = unitCost;
    }

    if (!existing.lastMovementAt || movement.occurredAt.getTime() > existing.lastMovementAt.getTime()) {
      existing.lastMovementAt = movement.occurredAt;
    }

    stockAggregates.set(key, existing);
  }

  const cogsAggregates = new Map<
    string,
    {
      productCode: string;
      productName: string;
      department: string | null;
      category: string | null;
      store: string;
      storeCode: string;
      quantitySold: number;
      cogsAmount: number;
      transactionIds: Set<string>;
      lastSoldAt: Date | null;
    }
  >();

  for (const movement of financialMovements) {
    const storeCode = movement.store?.code ?? "UNASSIGNED";
    const store = movement.store?.name ?? "Unassigned";
    const productCode = movement.product.code;
    const key = `${storeCode}:${productCode}`;
    const unitCost = Number(movement.unitCost ?? movement.product.baseCostPrice ?? 0);
    const movementQuantity = Number(movement.quantity);
    const cogsDelta = -movementQuantity * unitCost;
    const existing = cogsAggregates.get(key) ?? {
      productCode,
      productName: movement.product.name,
      department: movement.product.department,
      category: movement.product.category,
      store,
      storeCode,
      quantitySold: 0,
      cogsAmount: 0,
      transactionIds: new Set<string>(),
      lastSoldAt: null
    };

    existing.quantitySold += -movementQuantity;
    existing.cogsAmount += cogsDelta;

    if (movement.referenceId) {
      existing.transactionIds.add(movement.referenceId);
    }

    if (!existing.lastSoldAt || movement.occurredAt.getTime() > existing.lastSoldAt.getTime()) {
      existing.lastSoldAt = movement.occurredAt;
    }

    cogsAggregates.set(key, existing);
  }

  const cogsReportRows = [...cogsAggregates.values()]
    .map((row) => {
      const salesAggregate = itemAggregates.get(`${row.storeCode}:${row.productCode}`);
      const netSales = salesAggregate?.netSales ?? 0;
      const grossProfit = netSales - row.cogsAmount;

      return {
        productCode: row.productCode,
        productName: row.productName,
        department: row.department,
        category: row.category,
        store: row.store,
        storeCode: row.storeCode,
        quantitySold: roundQuantity(row.quantitySold),
        netSales: roundMoney(netSales),
        cogsAmount: roundMoney(row.cogsAmount),
        grossProfit: roundMoney(grossProfit),
        grossMarginPercent:
          netSales > 0 ? roundMoney((grossProfit / netSales) * 100) : 0,
        transactionCount: row.transactionIds.size,
        lastSoldAt: row.lastSoldAt?.toISOString() ?? null,
        lastSoldAtLabel: formatRelativeTime(row.lastSoldAt)
      };
    })
    .sort((left, right) => right.cogsAmount - left.cogsAmount)
    .slice(0, 150);

  const stockValuationRows = [...stockAggregates.values()]
    .filter((row) => Math.abs(row.onHandQuantity) > 0.0001)
    .sort((left, right) => Math.abs(right.onHandQuantity * right.unitCost) - Math.abs(left.onHandQuantity * left.unitCost))
    .slice(0, 150)
    .map((row) => ({
      locationCode: row.locationCode,
      locationName: row.locationName,
      storeCode: row.storeCode,
      storeName: row.storeName,
      warehouseCode: row.warehouseCode,
      warehouseName: row.warehouseName,
      productCode: row.productCode,
      productName: row.productName,
      onHandQuantity: roundQuantity(row.onHandQuantity),
      unitCost: roundMoney(row.unitCost),
      stockValue: roundMoney(row.onHandQuantity * row.unitCost),
      lastMovementAt: row.lastMovementAt?.toISOString() ?? null,
      lastMovementAtLabel: formatRelativeTime(row.lastMovementAt)
    }));

  const slowMovingItemRows = stockValuationRows
    .filter((row) => row.onHandQuantity > 0)
    .map((row) => {
      const salesAggregate = row.storeCode
        ? itemAggregates.get(`${row.storeCode}:${row.productCode}`)
        : undefined;
      const lastSaleAt = salesAggregate?.lastSoldAt ?? null;
      const daysSinceLastSale = daysSince(lastSaleAt);
      const riskBand =
        !lastSaleAt ? "No sales" : daysSinceLastSale !== null && daysSinceLastSale >= 60 ? "Slow" : "Moving";

      return {
        productCode: row.productCode,
        productName: row.productName,
        locationCode: row.locationCode,
        locationName: row.locationName,
        storeCode: row.storeCode,
        storeName: row.storeName,
        warehouseName: row.warehouseName,
        onHandQuantity: row.onHandQuantity,
        unitCost: row.unitCost,
        stockValue: row.stockValue,
        quantitySoldInScope: roundQuantity(salesAggregate?.quantitySold ?? 0),
        revenueInScope: roundMoney(salesAggregate?.netSales ?? 0),
        lastSaleAt: lastSaleAt?.toISOString() ?? null,
        lastSaleAtLabel: formatRelativeTime(lastSaleAt),
        daysSinceLastSale,
        lastMovementAt: row.lastMovementAt,
        lastMovementAtLabel: row.lastMovementAtLabel,
        riskBand
      };
    })
    .filter((row) => row.riskBand !== "Moving")
    .sort((left, right) => {
      if (left.riskBand !== right.riskBand) {
        return left.riskBand === "No sales" ? -1 : 1;
      }

      if ((right.daysSinceLastSale ?? 9999) !== (left.daysSinceLastSale ?? 9999)) {
        return (right.daysSinceLastSale ?? 9999) - (left.daysSinceLastSale ?? 9999);
      }

      return right.stockValue - left.stockValue;
    })
    .slice(0, 150);

  const grossReceipts = Number(transactionAggregate._sum.totalAmount ?? 0);
  const discountAmount = Number(transactionAggregate._sum.discountAmount ?? 0);
  const taxAmount = Number(transactionAggregate._sum.taxAmount ?? 0);
  const netSalesExTax =
    Number(transactionAggregate._sum.subtotalAmount ?? 0) - discountAmount;
  const cogsAmount = cogsReportRows.reduce((sum, row) => sum + row.cogsAmount, 0);
  const grossProfitAmount = netSalesExTax - cogsAmount;

  return {
    itemSalesRows: [...itemAggregates.values()]
      .sort((left, right) => right.netSales - left.netSales)
      .slice(0, 100)
      .map((row) => ({
        productCode: row.productCode,
        productName: row.productName,
        department: row.department,
        category: row.category,
        store: row.store,
        storeCode: row.storeCode,
        quantitySold: Number(row.quantitySold.toFixed(3)),
        netSales: Number(row.netSales.toFixed(2)),
        discountAmount: Number(row.discountAmount.toFixed(2)),
        transactionCount: row.transactionIds.size,
        lastSoldAt: row.lastSoldAt?.toISOString() ?? null,
        lastSoldAtLabel: formatRelativeTime(row.lastSoldAt)
      })),
    promotionPerformanceRows: [...promotionAggregates.values()]
      .sort((left, right) => right.discountAmount - left.discountAmount)
      .slice(0, 100)
      .map((row) => ({
        promotionCode: row.promotionCode,
        promotionName: row.promotionName,
        store: row.store,
        storeCode: row.storeCode,
        lineCount: row.lineCount,
        transactionCount: row.transactionIds.size,
        quantitySold: Number(row.quantitySold.toFixed(3)),
        discountAmount: Number(row.discountAmount.toFixed(2)),
        netSales: Number(row.netSales.toFixed(2)),
        lastAppliedAt: row.lastAppliedAt?.toISOString() ?? null,
        lastAppliedAtLabel: formatRelativeTime(row.lastAppliedAt)
      })),
    stockValuationRows,
    cogsReportRows,
    slowMovingItemRows,
    financialTotals: {
      grossReceipts: roundMoney(grossReceipts),
      netSalesExTax: roundMoney(netSalesExTax),
      discountAmount: roundMoney(discountAmount),
      taxAmount: roundMoney(taxAmount),
      cogsAmount: roundMoney(cogsAmount),
      grossProfitAmount: roundMoney(grossProfitAmount),
      grossMarginPercent:
        netSalesExTax > 0 ? roundMoney((grossProfitAmount / netSalesExTax) * 100) : 0
    }
  };
}

export async function getEnterpriseReportingDashboard(
  input?: EnterpriseReportingDashboardFilters
): Promise<EnterpriseReportingDashboardData> {
  const [
    syncDashboard,
    operationsDashboard,
    posWorkspace,
    inventoryWorkspace,
    customerWorkspace,
    promotionWorkspace,
    purchasesWorkspace,
    supplierWorkspace,
    securityWorkspace
  ] = await Promise.all([
    getEnterpriseSyncDashboard(),
    getEnterpriseOperationsDashboard(input),
    getEnterprisePosWorkspace(input),
    getEnterpriseInventoryWorkspace(),
    getEnterpriseCustomerWorkspace(),
    getEnterprisePromotionWorkspace(),
    getEnterprisePurchasesWorkspace(),
    getEnterpriseSupplierWorkspace(),
    getEnterpriseSecurityWorkspace()
  ]);

  const currencyCode = operationsDashboard.currencyCode || posWorkspace.currencyCode || "USD";
  const reportingFacts = await getReportingFactRows(operationsDashboard.filters);
  const laneAggregateByStore = buildLaneAggregateByStore(posWorkspace.laneRows);
  const storeCodes = uniqueStrings([
    ...operationsDashboard.storeSummaries.map((row) => row.storeCode),
    ...Array.from(laneAggregateByStore.keys())
  ]);
  const operationsByStoreCode = new Map(
    operationsDashboard.storeSummaries.map((row) => [row.storeCode, row] as const)
  );

  const storePerformanceRows = storeCodes
    .map((storeCode) => {
      const operationsRow = operationsByStoreCode.get(storeCode);
      const laneAggregate = laneAggregateByStore.get(storeCode);
      const completedTransactions =
        operationsRow?.postedTransactions ?? laneAggregate?.completedTransactions ?? 0;
      const salesValue = operationsRow?.salesValue ?? laneAggregate?.salesValue ?? 0;
      const lastOperationsAt = parseIso(operationsRow?.lastPostedAt ?? null);
      const lastLaneAt = parseIso(laneAggregate?.lastTransactionAt ?? null);
      const useLaneTimestamp =
        Boolean(lastLaneAt) &&
        (!lastOperationsAt || lastLaneAt!.getTime() >= lastOperationsAt.getTime());

      return {
        store: operationsRow?.store ?? laneAggregate?.store ?? storeCode,
        storeCode,
        nodeCode: operationsRow?.nodeCode ?? laneAggregate?.nodeCodes[0] ?? null,
        completedTransactions,
        salesValue,
        averageBasket:
          completedTransactions > 0
            ? Number((salesValue / completedTransactions).toFixed(2))
            : 0,
        exceptionCount: laneAggregate?.exceptionCount ?? 0,
        lastActivityAt: useLaneTimestamp
          ? laneAggregate?.lastTransactionAt ?? null
          : operationsRow?.lastPostedAt ?? laneAggregate?.lastTransactionAt ?? null,
        lastActivityAtLabel: useLaneTimestamp
          ? laneAggregate?.lastTransactionAtLabel ?? "Not posted yet"
          : operationsRow?.lastPostedAtLabel ??
            laneAggregate?.lastTransactionAtLabel ??
            "Not posted yet"
      };
    })
    .sort((left, right) => {
      if (right.salesValue !== left.salesValue) {
        return right.salesValue - left.salesValue;
      }

      return right.completedTransactions - left.completedTransactions;
    });

  const receivableRows = customerWorkspace.customerRows
    .filter(
      (row) =>
        row.receivableBalanceAmount > 0 ||
        row.allowCreditSales ||
        (row.creditLimitAmount ?? 0) > 0
    )
    .sort((left, right) => {
      if (right.receivableBalanceAmount !== left.receivableBalanceAmount) {
        return right.receivableBalanceAmount - left.receivableBalanceAmount;
      }

      return (right.creditLimitAmount ?? 0) - (left.creditLimitAmount ?? 0);
    })
    .slice(0, 12)
    .map((row) => ({
      customerNo: row.customerNo,
      fullName: row.fullName,
      homeStoreName: row.homeStoreName,
      allowCreditSales: row.allowCreditSales,
      creditLimitAmount: row.creditLimitAmount,
      receivableBalanceAmount: row.receivableBalanceAmount,
      loyaltyPointsBalance: row.loyaltyPointsBalance,
      lastTransactionAt: row.lastTransactionAt,
      lastTransactionAtLabel: row.lastTransactionAtLabel
    }));

  const inventoryRiskRows = inventoryWorkspace.locationRows
    .filter((row) => row.negativePositions > 0 || row.productCount > 0)
    .sort((left, right) => {
      if (right.negativePositions !== left.negativePositions) {
        return right.negativePositions - left.negativePositions;
      }

      return right.onHandQuantity - left.onHandQuantity;
    })
    .slice(0, 12)
    .map((row) => ({
      locationCode: row.locationCode,
      locationName: row.locationName,
      storeName: row.storeName,
      warehouseName: row.warehouseName,
      negativePositions: row.negativePositions,
      productCount: row.productCount,
      onHandQuantity: row.onHandQuantity,
      lastMovementAt: row.lastMovementAt,
      lastMovementAtLabel: row.lastMovementAtLabel
    }));

  const promotionRows = promotionWorkspace.promotionRows
    .slice()
    .sort((left, right) => {
      const leftRank = left.status === "ACTIVE" ? 0 : left.status === "SCHEDULED" ? 1 : 2;
      const rightRank = right.status === "ACTIVE" ? 0 : right.status === "SCHEDULED" ? 1 : 2;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 10)
    .map((row) => ({
      promotionCode: row.promotionCode,
      name: row.name,
      targetScope: row.targetScope,
      discountLabel: formatPromotionDiscountLabel(row, currencyCode),
      mechanicLabel:
        row.buyQuantity && row.rewardQuantity
          ? `Buy ${row.buyQuantity} get ${row.rewardQuantity}`
          : row.minimumLineQuantity
            ? `Min line ${row.minimumLineQuantity}`
            : row.applyOncePerBasket
              ? "Basket rule"
              : "Line rule",
      eligibilityLabel: uniqueStrings([
        row.eligibleStoreCodes?.length ? `${row.eligibleStoreCodes.length} shop(s)` : null,
        row.eligibleCustomerTypes?.join(", "),
        row.eligibleLoyaltyTiers?.join(", "),
        row.activeDaysOfWeek?.join(", "),
        row.couponRequired ? "Coupon required" : null
      ]).join(" • ") || "All eligible",
      status: row.status,
      updatedAt: row.updatedAt,
      updatedAtLabel: row.updatedAtLabel
    }));

  const exceptionRows = posWorkspace.exceptionRows.slice(0, 10).map((row) => ({
    eventId: row.eventId,
    store: row.store,
    storeCode: row.storeCode,
    aggregateType: row.aggregateType,
    eventType: row.eventType,
    status: row.status,
    referenceLabel: row.referenceLabel,
    errorMessage: row.errorMessage,
    receivedAt: row.receivedAt,
    receivedAtLabel: row.receivedAtLabel,
    retryable: row.retryable
  }));
  const salesOrderRows = posWorkspace.salesOrderRows
    .slice()
    .sort((left, right) => {
      const leftRank = left.status === "OPEN" ? 0 : left.status === "FULFILLED" ? 1 : 2;
      const rightRank = right.status === "OPEN" ? 0 : right.status === "FULFILLED" ? 1 : 2;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 10)
    .map((row) => ({
      orderNo: row.orderNo,
      store: row.store,
      storeCode: row.storeCode,
      terminal: row.terminal,
      sourceTransactionNo: row.sourceTransactionNo,
      customerNo: row.customerNo,
      customerName: row.customerName,
      status: row.status,
      totalAmount: row.totalAmount,
      operatorName: row.operatorName,
      fulfilledTransactionNo: row.fulfilledTransactionNo,
      updatedAt: row.updatedAt,
      updatedAtLabel: row.updatedAtLabel
    }));
  const closeoutRows = operationsDashboard.reconciliationRows
    .slice()
    .sort((left, right) => {
      if (right.remainingBankingAmount !== left.remainingBankingAmount) {
        return right.remainingBankingAmount - left.remainingBankingAmount;
      }

      return right.reconciledAt.localeCompare(left.reconciledAt);
    })
    .slice(0, 10)
    .map((row) => ({
      reconciliationNo: row.reconciliationNo,
      store: row.store,
      storeCode: row.storeCode,
      terminal: row.terminal,
      shiftNo: row.shiftNo,
      cashierCode: row.cashierCode,
      declaredCashAmount: row.declaredCashAmount,
      varianceAmount: row.varianceAmount,
      bankedAmount: row.bankedAmount,
      remainingBankingAmount: row.remainingBankingAmount,
      reconciledAt: row.reconciledAt,
      reconciledAtLabel: row.reconciledAtLabel
    }));
  const openSalesOrders = posWorkspace.salesOrderRows.filter((row) => row.status === "OPEN").length;
  const tenderReportRows = operationsDashboard.tenderRows
    .slice()
    .sort((left, right) => right.netAmount - left.netAmount)
    .map((row) => ({
      tenderKey: row.tenderKey,
      tenderCode: row.tenderCode,
      tenderName: row.tenderName,
      paymentMethod: row.paymentMethod,
      netAmount: row.netAmount,
      transactionCount: row.transactionCount,
      share: Number(row.share.toFixed(2))
    }));
  const receiptReportRows = posWorkspace.transactionRows.map((row) => ({
    transactionNo: row.transactionNo,
    store: row.store,
    storeCode: row.storeCode,
    cashierCode: row.cashierCode,
    terminal: row.terminal,
    originNodeCode: row.originNodeCode,
    totalAmount: row.totalAmount,
    taxAmount: row.taxAmount,
    itemCount: row.itemCount,
    tenderSummary: row.tenderSummary,
    productSummary: row.productSummary,
    completedAt: row.completedAt,
    completedAtLabel: row.completedAtLabel
  }));
  const cashierSalesRows = receiptReportRows
    .reduce((rows, receipt) => {
      const cashierCode = receipt.cashierCode?.trim() || "UNASSIGNED";
      const key = `${receipt.storeCode}:${cashierCode}`;
      const current = rows.get(key) ?? {
        cashierCode,
        store: receipt.store,
        storeCode: receipt.storeCode,
        transactionCount: 0,
        netSales: 0,
        discountAmount: 0,
        lastSaleAt: null as string | null,
        lastSaleAtLabel: "Not posted yet"
      };
      const currentDate = parseIso(current.lastSaleAt);
      const receiptDate = parseIso(receipt.completedAt);

      current.transactionCount += 1;
      current.netSales += receipt.totalAmount;

      if (receiptDate && (!currentDate || receiptDate.getTime() >= currentDate.getTime())) {
        current.lastSaleAt = receipt.completedAt;
        current.lastSaleAtLabel = receipt.completedAtLabel;
      }

      rows.set(key, current);
      return rows;
    }, new Map<string, {
      cashierCode: string;
      store: string;
      storeCode: string;
      transactionCount: number;
      netSales: number;
      discountAmount: number;
      lastSaleAt: string | null;
      lastSaleAtLabel: string;
    }>())
    .values();
  const cashierSalesReportRows = [...cashierSalesRows]
    .map((row) => ({
      ...row,
      netSales: Number(row.netSales.toFixed(2)),
      discountAmount: Number(row.discountAmount.toFixed(2)),
      averageBasket:
        row.transactionCount > 0 ? Number((row.netSales / row.transactionCount).toFixed(2)) : 0
    }))
    .sort((left, right) => right.netSales - left.netSales);
  const cashierVarianceRows = operationsDashboard.reconciliationRows
    .reduce((rows, row) => {
      const key = `${row.storeCode}:${row.cashierCode}`;
      const current = rows.get(key) ?? {
        cashierCode: row.cashierCode,
        store: row.store,
        storeCode: row.storeCode,
        closeoutCount: 0,
        declaredCashAmount: 0,
        varianceAmount: 0,
        bankedAmount: 0,
        lastCloseoutAt: null as string | null,
        lastCloseoutAtLabel: "Not posted yet"
      };
      const currentDate = parseIso(current.lastCloseoutAt);
      const closeoutDate = parseIso(row.reconciledAt);

      current.closeoutCount += 1;
      current.declaredCashAmount += row.declaredCashAmount;
      current.varianceAmount += row.varianceAmount;
      current.bankedAmount += row.bankedAmount;

      if (closeoutDate && (!currentDate || closeoutDate.getTime() >= currentDate.getTime())) {
        current.lastCloseoutAt = row.reconciledAt;
        current.lastCloseoutAtLabel = row.reconciledAtLabel;
      }

      rows.set(key, current);
      return rows;
    }, new Map<string, EnterpriseReportingDashboardData["cashierVarianceRows"][number]>())
    .values();
  const cashierVarianceReportRows = [...cashierVarianceRows]
    .map((row) => ({
      ...row,
      declaredCashAmount: Number(row.declaredCashAmount.toFixed(2)),
      varianceAmount: Number(row.varianceAmount.toFixed(2)),
      bankedAmount: Number(row.bankedAmount.toFixed(2))
    }))
    .sort((left, right) => Math.abs(right.varianceAmount) - Math.abs(left.varianceAmount));
  const purchaseOrderReportRows = purchasesWorkspace.purchaseOrderRows.map((row) => ({
    purchaseOrderNo: row.purchaseOrderNo,
    status: row.statusLabel,
    supplierNo: row.supplierNo,
    supplierName: row.supplierName,
    locationCode: row.locationCode,
    locationName: row.locationName,
    storeCode: row.storeCode,
    storeName: row.storeName,
    orderedQuantity: row.orderedQuantity,
    receivedQuantity: row.receivedQuantity,
    outstandingQuantity: row.outstandingQuantity,
    grandTotalAmount: row.grandTotalAmount,
    lineCount: row.lineCount,
    updatedAt: row.updatedAt,
    updatedAtLabel: row.updatedAtLabel
  }));
  const goodsReceiptReportRows = purchasesWorkspace.goodsReceiptRows.map((row) => ({
    goodsReceiptNo: row.goodsReceiptNo,
    purchaseOrderNo: row.purchaseOrderNo,
    supplierNo: row.supplierNo,
    supplierName: row.supplierName,
    locationCode: row.locationCode,
    locationName: row.locationName,
    storeCode: row.storeCode,
    storeName: row.storeName,
    totalQuantity: row.totalQuantity,
    lineCount: row.lineCount,
    receivedAt: row.receivedAt,
    receivedAtLabel: row.receivedAtLabel
  }));
  const transferReportRows = inventoryWorkspace.interStoreTransferRows.map((row) => ({
    transferNo: row.transferNo,
    transferBatchNo: row.transferBatchNo,
    status: row.statusLabel,
    origin: row.origin,
    sourceStoreName: row.sourceStoreName,
    sourceLocationCode: row.sourceLocationCode,
    destinationStoreName: row.destinationStoreName,
    destinationLocationCode: row.destinationLocationCode,
    productCode: row.productCode,
    productName: row.productName,
    requestedQuantity: row.requestedQuantity,
    issuedQuantity: row.issuedQuantity,
    receivedQuantity: row.receivedQuantity,
    inTransitQuantity: row.inTransitQuantity,
    requestedAt: row.requestedAt,
    requestedAtLabel: row.requestedAtLabel
  }));
  const supplierReportRows = supplierWorkspace.supplierRows.map((row) => ({
    supplierNo: row.supplierNo,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    status: row.status,
    linkedProductCount: row.linkedProductCount,
    openPurchaseOrderCount: row.openPurchaseOrderCount,
    openSupplierClaimCount: row.openSupplierClaimCount,
    postedSupplierReturnCount: row.postedSupplierReturnCount,
    updatedAt: row.updatedAt,
    updatedAtLabel: row.updatedAtLabel
  }));
  const userReportRows = securityWorkspace.userRows.map((row) => ({
    loginId: row.loginId,
    displayName: row.displayName,
    email: row.email,
    accountStatus: row.accountStatus,
    homeStoreCode: row.homeStoreCode,
    homeStoreName: row.homeStoreName,
    roleCodes: row.roleCodes,
    cashierEligible: row.cashierEligible,
    supervisorEligible: row.supervisorEligible,
    updatedAt: row.updatedAt,
    updatedAtLabel: row.updatedAtLabel
  }));

  const scopeDateFrom = parseDateStart(operationsDashboard.filters.dateFrom);
  const scopeDateTo = parseDateEnd(operationsDashboard.filters.dateTo);

  function isWithinReportingDate(value: string | null | undefined) {
    if (!scopeDateFrom && !scopeDateTo) {
      return true;
    }

    const parsed = parseIso(value);

    if (!parsed) {
      return false;
    }

    if (scopeDateFrom && parsed < scopeDateFrom) {
      return false;
    }

    if (scopeDateTo && parsed > scopeDateTo) {
      return false;
    }

    return true;
  }

  function isWithinReportingStore(storeCode: string | null | undefined) {
    if (!operationsDashboard.filters.storeCode) {
      return true;
    }

    return (
      storeCode?.trim().toLowerCase() ===
      operationsDashboard.filters.storeCode.trim().toLowerCase()
    );
  }

  const expenseTrackingRows = [
    ...purchasesWorkspace.purchaseOrderRows.flatMap((row) => {
      if (!isWithinReportingStore(row.storeCode) || !isWithinReportingDate(row.updatedAt)) {
        return [] as EnterpriseReportingDashboardData["expenseTrackingRows"];
      }

      return [
        {
          expenseId: `${row.purchaseOrderId}:shipping`,
          expenseType: "Shipping",
          category: "Purchasing landed cost",
          amount: row.shippingAmount
        },
        {
          expenseId: `${row.purchaseOrderId}:freight`,
          expenseType: "Freight",
          category: "Purchasing landed cost",
          amount: row.freightAmount
        },
        {
          expenseId: `${row.purchaseOrderId}:other`,
          expenseType: "Other PO charge",
          category: "Purchasing landed cost",
          amount: row.otherChargesAmount
        }
      ]
        .filter((charge) => charge.amount > 0)
        .map((charge) => ({
          expenseId: charge.expenseId,
          expenseType: charge.expenseType,
          category: charge.category,
          referenceNo: row.purchaseOrderNo,
          storeCode: row.storeCode,
          storeName: row.storeName,
          supplierName: row.supplierName,
          status: row.statusLabel,
          amount: roundMoney(charge.amount),
          recognizedAmount: roundMoney(charge.amount),
          source: "Purchase order",
          incurredAt: row.updatedAt,
          incurredAtLabel: row.updatedAtLabel
        }));
    }),
    ...operationsDashboard.reconciliationRows
      .filter(
        (row) =>
          row.varianceAmount < 0 &&
          isWithinReportingStore(row.storeCode) &&
          isWithinReportingDate(row.reconciledAt)
      )
      .map((row) => ({
        expenseId: `${row.reconciliationNo}:cash-shortage`,
        expenseType: "Cash shortage",
        category: "Cash control",
        referenceNo: row.reconciliationNo,
        storeCode: row.storeCode,
        storeName: row.store,
        supplierName: null,
        status: "Posted",
        amount: roundMoney(Math.abs(row.varianceAmount)),
        recognizedAmount: roundMoney(Math.abs(row.varianceAmount)),
        source: "EOD reconciliation",
        incurredAt: row.reconciledAt,
        incurredAtLabel: row.reconciledAtLabel
      })),
    ...inventoryWorkspace.supplierClaimRows
      .filter(
        (row) =>
          row.remainingAmount > 0 &&
          isWithinReportingStore(row.storeCode) &&
          isWithinReportingDate(row.createdAt)
      )
      .map((row) => ({
        expenseId: `${row.supplierClaimId}:supplier-claim`,
        expenseType: row.status === "WRITTEN_OFF" ? "Supplier claim write-off" : "Supplier claim exposure",
        category: "Supplier recovery",
        referenceNo: row.claimNo,
        storeCode: row.storeCode,
        storeName: row.storeName,
        supplierName: row.supplierName,
        status: row.statusLabel,
        amount: roundMoney(row.remainingAmount),
        recognizedAmount: row.status === "WRITTEN_OFF" ? roundMoney(row.remainingAmount) : 0,
        source: row.goodsReceiptNo ? `Goods receipt ${row.goodsReceiptNo}` : "Supplier claim",
        incurredAt: row.createdAt,
        incurredAtLabel: row.createdAtLabel
      }))
  ]
    .sort((left, right) => {
      const leftDate = parseIso(left.incurredAt)?.getTime() ?? 0;
      const rightDate = parseIso(right.incurredAt)?.getTime() ?? 0;

      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }

      return right.amount - left.amount;
    })
    .slice(0, 150);

  const trackedExpenseAmount = roundMoney(
    expenseTrackingRows.reduce((sum, row) => sum + row.recognizedAmount, 0)
  );
  const operatingProfitAmount = roundMoney(
    reportingFacts.financialTotals.grossProfitAmount - trackedExpenseAmount
  );
  const expenseRatio =
    reportingFacts.financialTotals.netSalesExTax > 0
      ? roundMoney((trackedExpenseAmount / reportingFacts.financialTotals.netSalesExTax) * 100)
      : 0;
  const stockValue = roundMoney(
    reportingFacts.stockValuationRows.reduce((sum, row) => sum + row.stockValue, 0)
  );
  const slowMovingStockValue = roundMoney(
    reportingFacts.slowMovingItemRows.reduce((sum, row) => sum + row.stockValue, 0)
  );
  const slowMovingStockShare =
    stockValue > 0 ? roundMoney((slowMovingStockValue / stockValue) * 100) : 0;
  const profitAndLossRows: EnterpriseReportingDashboardData["profitAndLossRows"] = [
    {
      lineCode: "gross-receipts",
      section: "Sales",
      lineItem: "Gross receipts",
      amount: reportingFacts.financialTotals.grossReceipts,
      lineType: "income",
      basis: "Completed POS transaction totals in the selected HQ scope.",
      sortOrder: 10
    },
    {
      lineCode: "tax-collected",
      section: "Sales",
      lineItem: "Tax collected",
      amount: reportingFacts.financialTotals.taxAmount,
      lineType: "tax",
      basis: "Tax posted on completed POS transactions; shown separately from operating revenue.",
      sortOrder: 20
    },
    {
      lineCode: "net-sales-ex-tax",
      section: "Sales",
      lineItem: "Net sales excluding tax",
      amount: reportingFacts.financialTotals.netSalesExTax,
      lineType: "subtotal",
      basis: "Subtotal less discounts from completed POS transactions.",
      sortOrder: 30
    },
    {
      lineCode: "cogs",
      section: "Cost of sales",
      lineItem: "Cost of goods sold",
      amount: -reportingFacts.financialTotals.cogsAmount,
      lineType: "expense",
      basis: "SALE and RETURN inventory ledger quantities valued by ledger unit cost or product base cost.",
      sortOrder: 40
    },
    {
      lineCode: "gross-profit",
      section: "Margin",
      lineItem: "Gross profit",
      amount: reportingFacts.financialTotals.grossProfitAmount,
      lineType: "subtotal",
      basis: "Net sales excluding tax less computed COGS.",
      sortOrder: 50
    },
    {
      lineCode: "tracked-expenses",
      section: "Operating expenses",
      lineItem: "Tracked expenses",
      amount: -trackedExpenseAmount,
      lineType: "expense",
      basis: "Recognized PO landed charges, cash shortages, and supplier claim write-offs currently captured in RMS.",
      sortOrder: 60
    },
    {
      lineCode: "operating-profit",
      section: "Operating result",
      lineItem: "Operating profit",
      amount: operatingProfitAmount,
      lineType: "subtotal",
      basis: "Gross profit less tracked RMS expense rows; external GL expenses are not included yet.",
      sortOrder: 70
    }
  ];
  const kpiScorecardRows: EnterpriseReportingDashboardData["kpiScorecardRows"] = [
    {
      kpiCode: "posted-revenue",
      kpiName: "Posted revenue",
      group: "Sales",
      value: reportingFacts.financialTotals.grossReceipts,
      displayKind: "currency",
      status: reportingFacts.financialTotals.grossReceipts > 0 ? "Healthy" : "Watch",
      basis: "Completed POS receipts in the selected HQ scope."
    },
    {
      kpiCode: "tax-collected",
      kpiName: "Tax collected",
      group: "Sales",
      value: reportingFacts.financialTotals.taxAmount,
      displayKind: "currency",
      status: reportingFacts.financialTotals.taxAmount > 0 ? "Healthy" : "Watch",
      basis: "Tax posted on completed POS receipts."
    },
    {
      kpiCode: "gross-margin",
      kpiName: "Gross margin",
      group: "Margin",
      value: reportingFacts.financialTotals.grossMarginPercent,
      displayKind: "percent",
      status:
        reportingFacts.financialTotals.grossMarginPercent >= 30
          ? "Healthy"
          : reportingFacts.financialTotals.grossMarginPercent >= 15
            ? "Watch"
            : "Review",
      basis: "Gross profit divided by net sales excluding tax."
    },
    {
      kpiCode: "operating-profit",
      kpiName: "Operating profit",
      group: "Margin",
      value: operatingProfitAmount,
      displayKind: "currency",
      status: operatingProfitAmount >= 0 ? "Healthy" : "Review",
      basis: "Gross profit less expense rows currently recognized inside RMS."
    },
    {
      kpiCode: "expense-ratio",
      kpiName: "Tracked expense ratio",
      group: "Expenses",
      value: expenseRatio,
      displayKind: "percent",
      status: expenseRatio <= 5 ? "Healthy" : expenseRatio <= 12 ? "Watch" : "Review",
      basis: "Recognized RMS expenses as a percentage of net sales excluding tax."
    },
    {
      kpiCode: "slow-moving-stock",
      kpiName: "Slow/no-movement stock",
      group: "Inventory",
      value: slowMovingStockValue,
      displayKind: "currency",
      status: slowMovingStockShare === 0 ? "Healthy" : slowMovingStockShare <= 20 ? "Watch" : "Review",
      basis: `${reportingFacts.slowMovingItemRows.length} stocked item row(s) with no sale or at least 60 days since last sale.`
    }
  ];

  const postureMessages = uniqueStrings([
    `${syncDashboard.metrics.attentionNodes} node(s) currently need sync attention across ${syncDashboard.metrics.activeStores} active store node(s).`,
    `${openSalesOrders} open sales order(s), ${operationsDashboard.metrics.closeoutsPosted} posted closeout(s), and ${operationsDashboard.metrics.bankedAmount.toFixed(2)} ${currencyCode} in banked cash are visible from the store estate.`,
    `${customerWorkspace.metrics.creditEnabledCustomers} credit-enabled customer account(s) are live with ${customerWorkspace.metrics.receivableExposureAmount.toFixed(2)} in receivable exposure.`,
    `${inventoryWorkspace.metrics.negativePositions} negative stock position(s) and ${inventoryWorkspace.metrics.openSupplierClaims} open supplier claim(s) are visible in enterprise inventory posture.`,
    `${reportingFacts.financialTotals.cogsAmount.toFixed(2)} ${currencyCode} in COGS and ${reportingFacts.financialTotals.grossMarginPercent.toFixed(2)}% gross margin are visible from current ledger facts.`,
    `${purchaseOrderReportRows.length} purchase order(s), ${goodsReceiptReportRows.length} goods receipt(s), and ${transferReportRows.length} transfer line(s) are ready for export from HQ reporting.`,
    `${tenderReportRows.length} tender method(s), ${supplierReportRows.length} supplier(s), and ${userReportRows.length} user account(s) are available in reportable master-data views.`,
    `${promotionWorkspace.metrics.activePromotions} promotion(s) are active across Flash ERP enterprise pricing.`,
    ...syncDashboard.syncPostureMessages.slice(0, 1),
    ...posWorkspace.postureMessages.slice(0, 1),
    ...inventoryWorkspace.postureMessages.slice(0, 1),
    ...customerWorkspace.postureMessages.slice(0, 1)
  ]).slice(0, 4);

  const priorities = uniqueStrings([
    ...(syncDashboard.metrics.attentionNodes > 0 ? syncDashboard.priorities.slice(0, 1) : []),
    ...(posWorkspace.metrics.exceptionCount > 0 ? posWorkspace.priorities.slice(0, 1) : []),
    ...(openSalesOrders > 0
      ? ["Follow up on open store sales orders and verify fulfilment handoff across active cashier lanes."]
      : []),
    ...(inventoryWorkspace.metrics.negativePositions > 0
      ? inventoryWorkspace.priorities.slice(0, 1)
      : []),
    ...(customerWorkspace.metrics.receivableExposureAmount > 0
      ? customerWorkspace.priorities.slice(0, 1)
      : []),
    ...promotionWorkspace.priorities.slice(0, 1)
  ]).slice(0, 5);

  const refreshedAt = [
    syncDashboard.refreshedAt,
    operationsDashboard.refreshedAt,
    posWorkspace.refreshedAt,
    inventoryWorkspace.refreshedAt,
    customerWorkspace.refreshedAt,
    promotionWorkspace.refreshedAt,
    purchasesWorkspace.refreshedAt,
    supplierWorkspace.refreshedAt,
    securityWorkspace.refreshedAt
  ]
    .map((value) => parseIso(value))
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0]
    ?.toISOString() ?? new Date().toISOString();

  return {
    currencyCode,
    filters: operationsDashboard.filters,
    shopOptions: operationsDashboard.shopOptions,
    metrics: {
      activeStores: syncDashboard.metrics.activeStores,
      attentionNodes: syncDashboard.metrics.attentionNodes,
      completedTransactions: posWorkspace.metrics.completedTransactions,
      postedRevenue: posWorkspace.metrics.postedRevenue,
      discountAmount: reportingFacts.financialTotals.discountAmount,
      averageBasket: posWorkspace.metrics.averageBasket,
      openSalesOrders,
      closeoutsPosted: operationsDashboard.metrics.closeoutsPosted,
      bankedAmount: operationsDashboard.metrics.bankedAmount,
      receivableExposureAmount: customerWorkspace.metrics.receivableExposureAmount,
      negativePositions: inventoryWorkspace.metrics.negativePositions,
      activePromotions: promotionWorkspace.metrics.activePromotions,
      openSupplierClaims: inventoryWorkspace.metrics.openSupplierClaims,
      tenderMethodsUsed: tenderReportRows.length,
      receipts: receiptReportRows.length,
      purchaseOrders: purchaseOrderReportRows.length,
      goodsReceipts: goodsReceiptReportRows.length,
      transfers: transferReportRows.length,
      activeSuppliers: supplierWorkspace.metrics.activeSuppliers,
      activeUsers: securityWorkspace.metrics.activeUsers,
      cogsAmount: reportingFacts.financialTotals.cogsAmount,
      grossProfitAmount: reportingFacts.financialTotals.grossProfitAmount,
      grossMarginPercent: reportingFacts.financialTotals.grossMarginPercent,
      trackedExpenseAmount,
      operatingProfitAmount,
      slowMovingItems: reportingFacts.slowMovingItemRows.length
    },
    tenderReportRows,
    receiptReportRows,
    cashierSalesRows: cashierSalesReportRows,
    itemSalesRows: reportingFacts.itemSalesRows,
    promotionPerformanceRows: reportingFacts.promotionPerformanceRows,
    stockValuationRows: reportingFacts.stockValuationRows,
    cogsReportRows: reportingFacts.cogsReportRows,
    profitAndLossRows,
    expenseTrackingRows,
    slowMovingItemRows: reportingFacts.slowMovingItemRows,
    kpiScorecardRows,
    cashierVarianceRows: cashierVarianceReportRows,
    purchaseOrderReportRows,
    goodsReceiptReportRows,
    transferReportRows,
    supplierReportRows,
    userReportRows,
    storePerformanceRows,
    receivableRows,
    inventoryRiskRows,
    promotionRows,
    exceptionRows,
    salesOrderRows,
    closeoutRows,
    postureMessages,
    priorities,
    statusMessage: `Flash ERP enterprise reporting now consolidates posted sales, tender mix, COGS, margin, tracked expenses, inventory movement, purchasing, suppliers, users, customer receivables, promotions, and branch exceptions from ${syncDashboard.metrics.activeStores} active store node(s).`,
    refreshedAt
  };
}
