import { Prisma } from "@prisma/client";
import { readJsonObject } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import { resolveEnterpriseCurrencyCode } from "@/server/repositories/enterprise-currency";
import {
  getPredictivePurchaseOrderSnapshot,
  type PredictivePurchaseOrderRow
} from "@/server/repositories/enterprise-predictive-purchasing.repository";
import {
  PosTransactionStatus,
  RecordStatus,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";


const escalatedStatuses: SyncEventStatus[] = [
  SyncEventStatus.FAILED,
  SyncEventStatus.DEAD_LETTER
];
const trendColors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed"];
const trendGranularities = ["daily", "weekly", "monthly"] as const;

type SalesTrendGranularity = (typeof trendGranularities)[number];
type SalesTrendRow = {
  period: string;
  label: string;
  transactions: number;
} & Record<string, string | number>;
type TotalSalesTrendRow = {
  period: string;
  label: string;
  salesValue: number;
  transactions: number;
};

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

function toIsoString(value: Date | null) {
  return value?.toISOString() ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPayloadRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function getFirstString(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function latestDate(...values: Array<Date | null | undefined>) {
  return (
    values
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toDayKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - daysSinceMonday);
  return date;
}

function startOfMonth(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function endOfWeek(value: Date) {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 6);
  return endOfDay(date);
}

function endOfMonth(value: Date) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + 1, 0);
  return endOfDay(date);
}

function startOfTrendPeriod(value: Date, granularity: SalesTrendGranularity) {
  if (granularity === "monthly") {
    return startOfMonth(value);
  }

  if (granularity === "weekly") {
    return startOfWeek(value);
  }

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addTrendPeriod(value: Date, granularity: SalesTrendGranularity, amount = 1) {
  const date = new Date(value);

  if (granularity === "monthly") {
    date.setMonth(date.getMonth() + amount);
    return startOfMonth(date);
  }

  if (granularity === "weekly") {
    date.setDate(date.getDate() + amount * 7);
    return startOfWeek(date);
  }

  date.setDate(date.getDate() + amount);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toTrendPeriodKey(
  value: Date,
  granularity: SalesTrendGranularity,
  minimumStart?: Date
) {
  let periodStart = startOfTrendPeriod(value, granularity);

  if (minimumStart && periodStart.getTime() < minimumStart.getTime()) {
    periodStart = new Date(minimumStart);
    periodStart.setHours(0, 0, 0, 0);
  }

  if (granularity === "monthly") {
    const year = periodStart.getFullYear();
    const month = `${periodStart.getMonth() + 1}`.padStart(2, "0");
    return `${year}-${month}`;
  }

  return toDayKey(periodStart);
}

function formatTrendPeriodLabel(key: string, granularity: SalesTrendGranularity) {
  const labelDate =
    granularity === "monthly" ? new Date(`${key}-01T00:00:00`) : new Date(`${key}T00:00:00`);

  if (Number.isNaN(labelDate.getTime())) {
    return key;
  }

  if (granularity === "monthly") {
    return labelDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    });
  }

  if (granularity === "weekly") {
    return `Week ${labelDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })}`;
  }

  return labelDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function getTrendWindow(input: {
  granularity: SalesTrendGranularity;
  dateFrom: Date | null;
  dateTo: Date | null;
}) {
  const now = new Date();
  const currentYearStart = new Date(now.getFullYear(), 0, 1);
  const currentYearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  const requestedAnchor = input.dateTo ?? now;
  const anchor =
    requestedAnchor < currentYearStart
      ? currentYearStart
      : requestedAnchor > currentYearEnd
        ? currentYearEnd
        : requestedAnchor;
  let start: Date;
  let end: Date;

  if (input.granularity === "daily") {
    start = startOfWeek(anchor);
    end = endOfWeek(anchor);
  } else if (input.granularity === "weekly") {
    start = startOfMonth(anchor);
    end = endOfMonth(anchor);
  } else {
    start = currentYearStart;
    end = currentYearEnd;
  }

  return {
    start: start < currentYearStart ? currentYearStart : start,
    end: end > currentYearEnd ? currentYearEnd : end
  };
}

function enumerateTrendPeriods(
  start: Date,
  end: Date,
  granularity: SalesTrendGranularity
) {
  const periods: string[] = [];
  let cursor = startOfTrendPeriod(start, granularity);
  if (cursor.getTime() < start.getTime()) {
    cursor = new Date(start);
  }
  const finalPeriod = startOfTrendPeriod(end, granularity);
  const maxPeriods = granularity === "daily" ? 370 : granularity === "weekly" ? 60 : 12;

  while (cursor.getTime() <= finalPeriod.getTime()) {
    periods.push(toTrendPeriodKey(cursor, granularity, start));

    if (periods.length > maxPeriods) {
      periods.shift();
    }

    cursor = addTrendPeriod(cursor, granularity);
  }

  return periods;
}

function parseDateBoundary(value: string | null | undefined, boundary: "start" | "end") {
  const normalized = value?.trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (boundary === "end") {
    date.setHours(23, 59, 59, 999);
  }

  return {
    key: normalized,
    date
  };
}

function buildDateRangeFilter(
  dateFrom: Date | null,
  dateTo: Date | null
): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) {
    return undefined;
  }

  return {
    ...(dateFrom ? { gte: dateFrom } : {}),
    ...(dateTo ? { lte: dateTo } : {})
  };
}

export type EnterpriseOperationsDashboardFilters = {
  storeCode?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type EnterpriseOperationsDashboardData = {
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
    postedTransactions: number;
    postedRevenue: number;
    discountAmount: number;
    stockMovements: number;
    projectionIssues: number;
    closeoutsPosted: number;
    bankedAmount: number;
  };
  masterCounts: {
    customers: number;
    loyaltyCustomers: number;
    products: number;
    suppliers: number;
    users: number;
    activePromotions: number;
  };
  salesRows: Array<{
    transactionNo: string;
    store: string;
    storeCode: string;
    terminal: string | null;
    originNodeCode: string | null;
    totalAmount: number;
    lineCount: number;
    productSummary: string;
    paymentSummary: string;
    completedAt: string | null;
    completedAtLabel: string;
  }>;
  salesTrendRows: Array<{
    day: string;
    label: string;
    transactions: number;
  } & Record<string, string | number>>;
  salesTrendByPeriod: Record<SalesTrendGranularity, SalesTrendRow[]>;
  salesTrendSeries: Array<{
    storeCode: string;
    storeName: string;
    color: string;
    revenue: number;
  }>;
  totalSalesTrendByPeriod: Record<SalesTrendGranularity, TotalSalesTrendRow[]>;
  topCustomerRows: Array<{
    customerKey: string;
    customerNo: string | null;
    customerName: string;
    totalSales: number;
    transactionCount: number;
    lastSaleAt: string | null;
    lastSaleAtLabel: string;
  }>;
  tenderRows: Array<{
    tenderKey: string;
    tenderCode: string | null;
    tenderName: string;
    paymentMethod: string;
    netAmount: number;
    transactionCount: number;
    share: number;
  }>;
  inventoryRows: Array<{
    entryId: string;
    store: string;
    storeCode: string;
    productCode: string;
    productName: string;
    movementType: string;
    quantity: number;
    externalReference: string | null;
    sourceNodeCode: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  reconciliationRows: Array<{
    reconciliationNo: string;
    store: string;
    storeCode: string;
    terminal: string | null;
    shiftNo: string;
    cashierCode: string;
    expectedCashAmount: number;
    declaredCashAmount: number;
    varianceAmount: number;
    bankedAmount: number;
    remainingBankingAmount: number;
    transactionCount: number;
    reconciledAt: string;
    reconciledAtLabel: string;
  }>;
  bankingRows: Array<{
    depositNo: string;
    store: string;
    storeCode: string;
    terminal: string | null;
    reconciliationNo: string;
    shiftNo: string;
    amount: number;
    bankName: string | null;
    reference: string | null;
    depositedAt: string;
    depositedAtLabel: string;
  }>;
  storeSummaries: Array<{
    store: string;
    storeCode: string;
    nodeCode: string | null;
    postedTransactions: number;
    salesOrders: number;
    salesValue: number;
    stockMovements: number;
    lastPostedAt: string | null;
    lastPostedAtLabel: string;
  }>;
  analytics: {
    averageBasket: number;
    cashCaptureRate: number;
    bankingGap: number;
    varianceAmount: number;
    storesPosting: number;
    silentStores: number;
    topTenderName: string | null;
    topTenderShare: number;
    stockMovementsPerTransaction: number;
  };
  stockRiskRows: PredictivePurchaseOrderRow[];
  projectionMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterpriseOperationsDashboard(
  reason: string
): EnterpriseOperationsDashboardData {
  return {
    currencyCode: "USD",
    filters: {
      storeCode: "",
      dateFrom: "",
      dateTo: "",
      scopeLabel: "All shops"
    },
    shopOptions: [],
    metrics: {
      postedTransactions: 0,
      postedRevenue: 0,
      discountAmount: 0,
      stockMovements: 0,
      projectionIssues: 0,
      closeoutsPosted: 0,
      bankedAmount: 0
    },
    masterCounts: {
      customers: 0,
      loyaltyCustomers: 0,
      products: 0,
      suppliers: 0,
      users: 0,
      activePromotions: 0
    },
    salesRows: [],
    salesTrendRows: [],
    salesTrendByPeriod: {
      daily: [],
      weekly: [],
      monthly: []
    },
    salesTrendSeries: [],
    totalSalesTrendByPeriod: {
      daily: [],
      weekly: [],
      monthly: []
    },
    topCustomerRows: [],
    tenderRows: [],
    inventoryRows: [],
    reconciliationRows: [],
    bankingRows: [],
    storeSummaries: [],
    analytics: {
      averageBasket: 0,
      cashCaptureRate: 0,
      bankingGap: 0,
      varianceAmount: 0,
      storesPosting: 0,
      silentStores: 0,
      topTenderName: null,
      topTenderShare: 0,
      stockMovementsPerTransaction: 0
    },
    stockRiskRows: [],
    projectionMessages: [
      "Canonical store-posted operations will appear here once the enterprise database is available.",
      "This workspace reads the projected POS transactions and inventory ledger, not just raw sync packets."
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the Flash ERP seed script to provision the sample stores and node topology.",
      "Capture a store sale and run sync so enterprise has canonical operations to display."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseOperationsDashboard(
  input?: EnterpriseOperationsDashboardFilters
): Promise<EnterpriseOperationsDashboardData> {
  const requestedDateFrom = parseDateBoundary(input?.dateFrom, "start");
  const requestedDateTo = parseDateBoundary(input?.dateTo, "end");
  const dateFrom = requestedDateFrom?.date ?? null;
  const dateTo = requestedDateTo?.date ?? null;
  const dateFromKey = requestedDateFrom?.key ?? "";
  const dateToKey = requestedDateTo?.key ?? "";
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          name: true,
          baseCurrencyCode: true,
          companySettingsJson: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseOperationsDashboard(
      "No primary enterprise node is available yet, so Flash ERP cannot read canonical operations."
    );
  }

  const [stores, storeNodes] = await Promise.all([
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: {
        name: "asc"
      },
      select: {
        id: true,
        name: true,
        code: true,
        salesEnabled: true
      }
    }),
    prisma.syncNode.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE
      },
      orderBy: [
        {
          store: {
            name: "asc"
          }
        },
        {
          isPrimary: "desc"
        },
        {
          code: "asc"
        }
      ],
      select: {
        code: true,
        storeId: true,
        isPrimary: true
      }
    })
  ]);

  const requestedStoreCode = input?.storeCode?.trim() ?? "";
  const primaryNodeCodeByStoreId = new Map<string, string>();

  for (const node of storeNodes) {
    if (!node.storeId) {
      continue;
    }

    if (node.isPrimary || !primaryNodeCodeByStoreId.has(node.storeId)) {
      primaryNodeCodeByStoreId.set(node.storeId, node.code);
    }
  }

  const salesStores = stores.filter((store) => store.salesEnabled);
  const selectedStore = requestedStoreCode
    ? salesStores.find((store) => store.code.toLowerCase() === requestedStoreCode.toLowerCase()) ?? null
    : null;
  const selectedStoreCode = selectedStore?.code ?? "";
  const selectedStoreName = selectedStore?.name ?? "";
  const scopedStores = selectedStore ? [selectedStore] : stores;
  const salesScopedStores = selectedStore ? [selectedStore] : salesStores;
  const scopedStoreIds = scopedStores.map((store) => store.id);
  const salesScopedStoreIds = salesScopedStores.map((store) => store.id);
  const allStoreIds = stores.map((store) => store.id);
  const allSalesStoreIds = salesStores.map((store) => store.id);
  const scopedStoreIdSet = new Set(scopedStoreIds);
  const storeNodeCodes = storeNodes
    .filter((node) => node.storeId && scopedStoreIdSet.has(node.storeId))
    .map((node) => node.code);
  const transactionDateFilter = buildDateRangeFilter(dateFrom, dateTo);
  const ledgerDateFilter = buildDateRangeFilter(dateFrom, dateTo);
  const transactionDateWhere: Prisma.PosTransactionWhereInput = transactionDateFilter
    ? {
        OR: [
          { completedAt: transactionDateFilter },
          { completedAt: null, createdAt: transactionDateFilter }
        ]
      }
    : {};
  const transactionWhere: Prisma.PosTransactionWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    status: PosTransactionStatus.COMPLETED,
    storeId: {
      in: salesScopedStoreIds
    },
    ...transactionDateWhere
  };
  const paymentWhere: Prisma.PosPaymentWhereInput = {
    posTransaction: {
      retailOrgId: enterpriseNode.retailOrgId,
      deletedAt: null,
      storeId: {
        in: salesScopedStoreIds
      }
    },
    ...(transactionDateFilter ? { receivedAt: transactionDateFilter } : {})
  };
  const allShopTransactionWhere: Prisma.PosTransactionWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    status: PosTransactionStatus.COMPLETED,
    storeId: {
      in: allSalesStoreIds
    },
    ...transactionDateWhere
  };
  const inventoryWhere: Prisma.InventoryLedgerEntryWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    storeId: {
      in: scopedStoreIds
    },
    ...(ledgerDateFilter ? { occurredAt: ledgerDateFilter } : {})
  };
  const reconciliationWhere: Prisma.EodReconciliationWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    storeId: {
      in: scopedStoreIds
    },
    ...(ledgerDateFilter ? { reconciledAt: ledgerDateFilter } : {})
  };
  const bankingWhere: Prisma.BankingDepositWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    storeId: {
      in: scopedStoreIds
    },
    ...(ledgerDateFilter ? { depositedAt: ledgerDateFilter } : {})
  };
  const salesOrderWhere: Prisma.SalesOrderWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    storeId: {
      in: salesScopedStoreIds
    },
    ...(transactionDateFilter
      ? {
          OR: [
            { createdAt: transactionDateFilter },
            { updatedAt: transactionDateFilter }
          ]
        }
      : {})
  };

  const [
    transactionAggregate,
    stockMovements,
    projectionIssues,
    projectedInboundCount,
    salesRows,
    analyticsTransactions,
    allShopAnalyticsTransactions,
    tenderGroups,
    inventoryRows,
    closeoutsPosted,
    bankedAggregate,
    cashCloseoutAggregate,
    reconciliationRows,
    bankingRows,
    transactionGroups,
    inventoryGroups,
    salesOrderGroups,
    customerCount,
    loyaltyCustomerCount,
    productCount,
    supplierCount,
    userCount,
    promotionCount,
    predictiveSnapshot
  ] = await Promise.all([
    prisma.posTransaction.aggregate({
      where: transactionWhere,
      _count: {
        _all: true
      },
      _sum: {
        totalAmount: true,
        discountAmount: true
      }
    }),
    prisma.inventoryLedgerEntry.count({
      where: inventoryWhere
    }),
    prisma.syncInboundEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: {
          in: storeNodeCodes
        },
        status: {
          in: escalatedStatuses
        }
      }
    }),
    prisma.syncInboundEvent.count({
      where: {
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: {
          in: storeNodeCodes
        },
        aggregateType: {
          in: [
            "posTransaction",
            "inventoryLedgerEntry",
            "salesOrder",
            "eodReconciliation",
            "bankingDeposit"
          ]
        },
        status: SyncEventStatus.ACKNOWLEDGED
      }
    }),
    prisma.posTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 14,
      select: {
        transactionNo: true,
        totalAmount: true,
        completedAt: true,
        createdAt: true,
        originNodeCode: true,
        store: {
          select: {
            name: true,
            code: true
          }
        },
        terminal: {
          select: {
            code: true
          }
        },
        lines: {
          select: {
            productCodeSnapshot: true
          }
        },
        payments: {
          select: {
            method: true,
            tenderMethodCodeSnapshot: true,
            tenderMethodNameSnapshot: true,
            tenderMethod: {
              select: {
                code: true,
                name: true
              }
            }
          }
        },
        _count: {
          select: {
            lines: true
          }
        }
      }
    }),
    prisma.posTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 5000,
      select: {
        totalAmount: true,
        completedAt: true,
        createdAt: true,
        customerNameSnapshot: true,
        customer: {
          select: {
            customerNo: true,
            fullName: true
          }
        },
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.posTransaction.findMany({
      where: allShopTransactionWhere,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 5000,
      select: {
        totalAmount: true,
        completedAt: true,
        createdAt: true,
        customerNameSnapshot: true,
        customer: {
          select: {
            customerNo: true,
            fullName: true
          }
        }
      }
    }),
    prisma.posPayment.groupBy({
      by: ["method", "tenderMethodCodeSnapshot", "tenderMethodNameSnapshot"],
      where: paymentWhere,
      _count: {
        _all: true
      },
      _sum: {
        amount: true
      },
      orderBy: {
        _sum: {
          amount: "desc"
        }
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: inventoryWhere,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 14,
      select: {
        id: true,
        movementType: true,
        quantity: true,
        occurredAt: true,
        externalReference: true,
        sourceNodeCode: true,
        store: {
          select: {
            name: true,
            code: true
          }
        },
        product: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.eodReconciliation.count({
      where: reconciliationWhere
    }),
    prisma.bankingDeposit.aggregate({
      where: bankingWhere,
      _sum: {
        amount: true
      }
    }),
    prisma.eodReconciliation.aggregate({
      where: reconciliationWhere,
      _sum: {
        declaredCashAmount: true,
        varianceAmount: true
      }
    }),
    prisma.eodReconciliation.findMany({
      where: reconciliationWhere,
      orderBy: [{ reconciledAt: "desc" }, { updatedAt: "desc" }],
      take: 14,
      select: {
        reconciliationNo: true,
        shiftNo: true,
        cashierCode: true,
        expectedCashAmount: true,
        declaredCashAmount: true,
        varianceAmount: true,
        transactionCount: true,
        reconciledAt: true,
        store: {
          select: {
            name: true,
            code: true
          }
        },
        terminal: {
          select: {
            code: true
          }
        },
        bankingDeposits: {
          select: {
            amount: true
          }
        }
      }
    }),
    prisma.bankingDeposit.findMany({
      where: bankingWhere,
      orderBy: [{ depositedAt: "desc" }, { updatedAt: "desc" }],
      take: 14,
      select: {
        depositNo: true,
        reconciliationNo: true,
        shiftNo: true,
        amount: true,
        bankName: true,
        reference: true,
        depositedAt: true,
        store: {
          select: {
            name: true,
            code: true
          }
        },
        terminal: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.posTransaction.groupBy({
      by: ["storeId"],
      where: transactionWhere,
      _count: {
        _all: true
      },
      _sum: {
        totalAmount: true
      },
      _max: {
        completedAt: true,
        createdAt: true
      }
    }),
    prisma.inventoryLedgerEntry.groupBy({
      by: ["storeId"],
      where: inventoryWhere,
      _count: {
        _all: true
      },
      _max: {
        occurredAt: true
      }
    }),
    prisma.salesOrder.groupBy({
      by: ["storeId"],
      where: salesOrderWhere,
      _count: {
        _all: true
      },
      _max: {
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.customer.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      }
    }),
    prisma.customer.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        loyaltyEnrolled: true,
        deletedAt: null
      }
    }),
    prisma.product.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      }
    }),
    prisma.supplier.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      }
    }),
    prisma.retailUser.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      }
    }),
    prisma.promotionCampaign.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null
      }
    }),
    getPredictivePurchaseOrderSnapshot({ storeCode: selectedStoreCode || null, limit: 8 })
  ]);

  const transactionGroupByStoreId = new Map(
    transactionGroups.map((group) => [group.storeId ?? "unassigned", group] as const)
  );
  const inventoryGroupByStoreId = new Map(
    inventoryGroups.map((group) => [group.storeId ?? "unassigned", group] as const)
  );
  const salesOrderGroupByStoreId = new Map(
    salesOrderGroups.map((group) => [group.storeId ?? "unassigned", group] as const)
  );

  const postedTransactions = transactionAggregate._count._all;
  const postedRevenue = Number(transactionAggregate._sum.totalAmount ?? 0);
  const discountAmount = Number(transactionAggregate._sum.discountAmount ?? 0);
  const bankedAmount = Number(bankedAggregate._sum.amount ?? 0);

  const storeSummaries = salesScopedStores
    .map((store) => {
      const salesGroup = transactionGroupByStoreId.get(store.id);
      const inventoryGroup = inventoryGroupByStoreId.get(store.id);
      const salesOrderGroup = salesOrderGroupByStoreId.get(store.id);
      const lastPostedAt = latestDate(
        salesGroup?._max.completedAt ?? null,
        salesGroup?._max.createdAt ?? null,
        inventoryGroup?._max.occurredAt ?? null,
        salesOrderGroup?._max.updatedAt ?? null,
        salesOrderGroup?._max.createdAt ?? null
      );

      return {
        store: store.name,
        storeCode: store.code,
        nodeCode: primaryNodeCodeByStoreId.get(store.id) ?? null,
        postedTransactions: salesGroup?._count._all ?? 0,
        salesOrders: salesOrderGroup?._count._all ?? 0,
        salesValue: Number(salesGroup?._sum.totalAmount ?? 0),
        stockMovements: inventoryGroup?._count._all ?? 0,
        lastPostedAt: toIsoString(lastPostedAt),
        lastPostedAtLabel: formatRelativeTime(lastPostedAt)
      };
    })
    .sort((left, right) => {
      if (right.postedTransactions !== left.postedTransactions) {
        return right.postedTransactions - left.postedTransactions;
      }

      return right.salesValue - left.salesValue;
    });

  const salesEnabledStoreCount = storeSummaries.length;
  const silentStores = storeSummaries.filter((row) => row.postedTransactions === 0).length;
  const storesPosting = salesEnabledStoreCount - silentStores;

  const priorities: string[] = [];

  if (projectionIssues > 0) {
    priorities.push(
      `Resolve ${projectionIssues} upstream projection issue(s) so every accepted store packet becomes a canonical Flash ERP fact.`
    );
  }

  if (postedTransactions === 0) {
    priorities.push(
      "Capture and sync a store sale so the enterprise operations ledger has its first canonical transaction."
    );
  }

  if (silentStores > 0) {
    priorities.push(
      `${storesPosting} of ${salesEnabledStoreCount} sales-enabled store node(s) have posted canonical sales so far. Bring the remaining selling sites online and verify their sync cycles.`
    );
  }

  if (closeoutsPosted === 0) {
    priorities.push(
      "No store EOD closeouts have landed in enterprise yet. Record an end-of-day reconciliation on the desktop and sync it through."
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Canonical postings are landing cleanly. The next lane is settlement reconciliation, exception handling, and richer enterprise search across stores."
    );
  }

  const revenueByTrendStore = new Map<string, { storeCode: string; storeName: string; revenue: number }>();

  for (const transaction of analyticsTransactions) {
    const storeCode = transaction.store.code;
    const current = revenueByTrendStore.get(storeCode) ?? {
      storeCode,
      storeName: transaction.store.name,
      revenue: 0
    };
    current.revenue += Number(transaction.totalAmount);
    revenueByTrendStore.set(storeCode, current);
  }

  const selectedTrendStores = selectedStore
    ? selectedStore.salesEnabled
      ? [
          {
            storeCode: selectedStore.code,
            storeName: selectedStore.name,
            revenue: revenueByTrendStore.get(selectedStore.code)?.revenue ?? 0
          }
        ]
      : []
    : [...revenueByTrendStore.values()]
        .sort((left, right) => right.revenue - left.revenue)
        .slice(0, 5);
  const salesTrendSeries = selectedTrendStores.map((store, index) => ({
    ...store,
    color: trendColors[index % trendColors.length],
    revenue: Number(store.revenue.toFixed(2))
  }));
  const trendStoreCodes = new Set(salesTrendSeries.map((series) => series.storeCode));

  function buildScopedSalesTrendRows(granularity: SalesTrendGranularity) {
    const window = getTrendWindow({
      granularity,
      dateFrom,
      dateTo
    });
    const periodKeys = enumerateTrendPeriods(window.start, window.end, granularity);
    const trendByPeriod = new Map<string, SalesTrendRow>(
      periodKeys.map((period) => {
        const row: SalesTrendRow = {
          period,
          label: formatTrendPeriodLabel(period, granularity),
          transactions: 0
        };

        for (const series of salesTrendSeries) {
          row[series.storeCode] = 0;
        }

        return [period, row];
      })
    );

    for (const transaction of analyticsTransactions) {
      const transactionDate = transaction.completedAt ?? transaction.createdAt;

      if (transactionDate < window.start || transactionDate > window.end) {
        continue;
      }

      const period = toTrendPeriodKey(transactionDate, granularity, window.start);
      const row = trendByPeriod.get(period);

      if (!row) {
        continue;
      }

      if (trendStoreCodes.has(transaction.store.code)) {
        row[transaction.store.code] =
          Number(row[transaction.store.code] ?? 0) + Number(transaction.totalAmount);
      }

      row.transactions += 1;
    }

    return periodKeys.map((period) => trendByPeriod.get(period)!).filter(Boolean);
  }

  function buildTotalSalesTrendRows(granularity: SalesTrendGranularity) {
    const window = getTrendWindow({
      granularity,
      dateFrom,
      dateTo
    });
    const periodKeys = enumerateTrendPeriods(window.start, window.end, granularity);
    const trendByPeriod = new Map<string, TotalSalesTrendRow>(
      periodKeys.map((period) => [
        period,
        {
          period,
          label: formatTrendPeriodLabel(period, granularity),
          salesValue: 0,
          transactions: 0
        }
      ])
    );

    for (const transaction of allShopAnalyticsTransactions) {
      const transactionDate = transaction.completedAt ?? transaction.createdAt;

      if (transactionDate < window.start || transactionDate > window.end) {
        continue;
      }

      const period = toTrendPeriodKey(transactionDate, granularity, window.start);
      const row = trendByPeriod.get(period);

      if (!row) {
        continue;
      }

      row.salesValue += Number(transaction.totalAmount);
      row.transactions += 1;
    }

    return periodKeys
      .map((period) => {
        const row = trendByPeriod.get(period)!;

        return {
          ...row,
          salesValue: Number(row.salesValue.toFixed(2))
        };
      })
      .filter(Boolean);
  }

  const salesTrendByPeriod: Record<SalesTrendGranularity, SalesTrendRow[]> = {
    daily: buildScopedSalesTrendRows("daily"),
    weekly: buildScopedSalesTrendRows("weekly"),
    monthly: buildScopedSalesTrendRows("monthly")
  };
  const salesTrendRows = salesTrendByPeriod.daily.map((row) => ({
    day: row.period,
    ...row
  }));
  const totalSalesTrendByPeriod: Record<SalesTrendGranularity, TotalSalesTrendRow[]> = {
    daily: buildTotalSalesTrendRows("daily"),
    weekly: buildTotalSalesTrendRows("weekly"),
    monthly: buildTotalSalesTrendRows("monthly")
  };

  const customerSalesByKey = new Map<
    string,
    {
      customerKey: string;
      customerNo: string | null;
      customerName: string;
      totalSales: number;
      transactionCount: number;
      lastSaleAt: Date | null;
    }
  >();

  for (const transaction of allShopAnalyticsTransactions) {
    const customerNo = transaction.customer?.customerNo ?? null;
    const customerName =
      transaction.customer?.fullName ?? transaction.customerNameSnapshot?.trim() ?? null;

    if (!customerNo && !customerName) {
      continue;
    }

    const customerKey = customerNo ?? customerName ?? "unknown-customer";
    const current = customerSalesByKey.get(customerKey) ?? {
      customerKey,
      customerNo,
      customerName: customerName ?? customerNo ?? "Customer",
      totalSales: 0,
      transactionCount: 0,
      lastSaleAt: null
    };
    const completedAt = transaction.completedAt ?? transaction.createdAt;

    current.totalSales += Number(transaction.totalAmount);
    current.transactionCount += 1;

    if (!current.lastSaleAt || completedAt.getTime() > current.lastSaleAt.getTime()) {
      current.lastSaleAt = completedAt;
    }

    customerSalesByKey.set(customerKey, current);
  }

  const topCustomerRows = [...customerSalesByKey.values()]
    .sort((left, right) => {
      if (right.totalSales !== left.totalSales) {
        return right.totalSales - left.totalSales;
      }

      return right.transactionCount - left.transactionCount;
    })
    .slice(0, 10)
    .map((row) => ({
      customerKey: row.customerKey,
      customerNo: row.customerNo,
      customerName: row.customerName,
      totalSales: Number(row.totalSales.toFixed(2)),
      transactionCount: row.transactionCount,
      lastSaleAt: toIsoString(row.lastSaleAt),
      lastSaleAtLabel: formatRelativeTime(row.lastSaleAt)
    }));
  const tenderTotals = new Map<
    string,
    {
      tenderKey: string;
      tenderCode: string | null;
      tenderName: string;
      paymentMethod: string;
      netAmount: number;
      transactionCount: number;
    }
  >();

  for (const row of tenderGroups) {
    const tenderName = row.tenderMethodNameSnapshot?.trim() || formatEnumLabel(row.method);
    const tenderCode = row.tenderMethodCodeSnapshot?.trim() || null;
    const tenderKey = tenderCode ?? row.method;
    const netAmount = Number(row._sum.amount ?? 0);
    const existingTender = tenderTotals.get(tenderKey);

    if (existingTender) {
      existingTender.netAmount += netAmount;
      existingTender.transactionCount += row._count._all;
      if (!existingTender.tenderCode && tenderCode) {
        existingTender.tenderCode = tenderCode;
      }
      continue;
    }

    tenderTotals.set(tenderKey, {
      tenderKey,
      tenderCode,
      tenderName,
      paymentMethod: formatEnumLabel(row.method),
      netAmount,
      transactionCount: row._count._all
    });
  }

  const tenderTotal = Array.from(tenderTotals.values()).reduce(
    (sum, row) => sum + row.netAmount,
    0
  );
  const tenderRows = Array.from(tenderTotals.values())
    .sort((left, right) => right.netAmount - left.netAmount)
    .map((row) => ({
      ...row,
      netAmount: Number(row.netAmount.toFixed(2)),
      share: tenderTotal > 0 ? (row.netAmount / tenderTotal) * 100 : 0
    }));
  const topTender = tenderRows[0] ?? null;
  const declaredCashAmount = Number(cashCloseoutAggregate._sum.declaredCashAmount ?? 0);
  const varianceAmount = Number(cashCloseoutAggregate._sum.varianceAmount ?? 0);
  const bankingGap = Math.max(0, declaredCashAmount - bankedAmount);
  const currencyCode = resolveEnterpriseCurrencyCode(enterpriseNode.retailOrg);
  const scopeLabel = selectedStoreName || "All shops";
  const shopOptions = salesStores.map((store) => ({
    storeCode: store.code,
    storeName: store.name,
    nodeCode: primaryNodeCodeByStoreId.get(store.id) ?? null
  }));

  return {
    currencyCode,
    filters: {
      storeCode: selectedStoreCode,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      scopeLabel
    },
    shopOptions,
    metrics: {
      postedTransactions,
      postedRevenue,
      discountAmount,
      stockMovements,
      projectionIssues,
      closeoutsPosted,
      bankedAmount
    },
    masterCounts: {
      customers: customerCount,
      loyaltyCustomers: loyaltyCustomerCount,
      products: productCount,
      suppliers: supplierCount,
      users: userCount,
      activePromotions: promotionCount
    },
    salesRows: salesRows.map((transaction) => {
      const completedAt = transaction.completedAt ?? transaction.createdAt;
      const productSummary = [...new Set(transaction.lines.map((line) => line.productCodeSnapshot))]
        .slice(0, 3)
        .join(", ");
      const paymentSummary = [
        ...new Set(
          transaction.payments.map(
            (payment) =>
              payment.tenderMethodNameSnapshot?.trim() ||
              payment.tenderMethod?.name ||
              payment.tenderMethodCodeSnapshot?.trim() ||
              formatEnumLabel(payment.method)
          )
        )
      ].join(", ");

      return {
        transactionNo: transaction.transactionNo,
        store: transaction.store.name,
        storeCode: transaction.store.code,
        terminal: transaction.terminal?.code ?? null,
        originNodeCode: transaction.originNodeCode,
        totalAmount: Number(transaction.totalAmount),
        lineCount: transaction._count.lines,
        productSummary,
        paymentSummary,
        completedAt: toIsoString(completedAt),
        completedAtLabel: formatRelativeTime(completedAt)
      };
    }),
    salesTrendRows,
    salesTrendByPeriod,
    salesTrendSeries,
    totalSalesTrendByPeriod,
    topCustomerRows,
    tenderRows,
    inventoryRows: inventoryRows.map((entry) => ({
      entryId: entry.id,
      store: entry.store?.name ?? "Unassigned store",
      storeCode: entry.store?.code ?? "unknown-store",
      productCode: entry.product.code,
      productName: entry.product.name,
      movementType: entry.movementType,
      quantity: Number(entry.quantity),
      externalReference: entry.externalReference,
      sourceNodeCode: entry.sourceNodeCode,
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt)
    })),
    reconciliationRows: reconciliationRows.map((reconciliation) => {
      const bankedAmountForReconciliation = reconciliation.bankingDeposits.reduce(
        (sum, deposit) => sum + Number(deposit.amount),
        0
      );

      return {
        reconciliationNo: reconciliation.reconciliationNo,
        store: reconciliation.store.name,
        storeCode: reconciliation.store.code,
        terminal: reconciliation.terminal?.code ?? null,
        shiftNo: reconciliation.shiftNo,
        cashierCode: reconciliation.cashierCode,
        expectedCashAmount: Number(reconciliation.expectedCashAmount),
        declaredCashAmount: Number(reconciliation.declaredCashAmount),
        varianceAmount: Number(reconciliation.varianceAmount),
        bankedAmount: bankedAmountForReconciliation,
        remainingBankingAmount: Number(reconciliation.declaredCashAmount) - bankedAmountForReconciliation,
        transactionCount: reconciliation.transactionCount,
        reconciledAt: reconciliation.reconciledAt.toISOString(),
        reconciledAtLabel: formatRelativeTime(reconciliation.reconciledAt)
      };
    }),
    bankingRows: bankingRows.map((deposit) => ({
      depositNo: deposit.depositNo,
      store: deposit.store.name,
      storeCode: deposit.store.code,
      terminal: deposit.terminal?.code ?? null,
      reconciliationNo: deposit.reconciliationNo,
      shiftNo: deposit.shiftNo,
      amount: Number(deposit.amount),
      bankName: deposit.bankName,
      reference: deposit.reference,
      depositedAt: deposit.depositedAt.toISOString(),
      depositedAtLabel: formatRelativeTime(deposit.depositedAt)
    })),
    storeSummaries,
    analytics: {
      averageBasket: postedTransactions > 0 ? Number((postedRevenue / postedTransactions).toFixed(2)) : 0,
      cashCaptureRate: postedRevenue > 0 ? Number(((bankedAmount / postedRevenue) * 100).toFixed(1)) : 0,
      bankingGap: Number(bankingGap.toFixed(2)),
      varianceAmount: Number(varianceAmount.toFixed(2)),
      storesPosting,
      silentStores,
      topTenderName: topTender?.tenderName ?? null,
      topTenderShare: topTender ? Number(topTender.share.toFixed(1)) : 0,
      stockMovementsPerTransaction:
        postedTransactions > 0 ? Number((stockMovements / postedTransactions).toFixed(2)) : 0
    },
    stockRiskRows: predictiveSnapshot.rows,
    projectionMessages: [
      `${postedTransactions} store-posted completed transaction(s) are now canonical in enterprise, worth ${postedRevenue.toFixed(2)} ${currencyCode}.`,
      `${stockMovements} store-sourced inventory movement(s) have landed in the enterprise ledger across ${storeSummaries.filter((row) => row.stockMovements > 0).length} active store node(s).`,
      `${closeoutsPosted} EOD reconciliation(s) and ${bankedAmount.toFixed(2)} ${currencyCode} in banked cash are now visible in enterprise closeout history.`,
      projectionIssues > 0
        ? `${projectionIssues} upstream packet(s) still need operator attention before they can be trusted as enterprise facts.`
        : `All current upstream retail packets have either projected successfully or are waiting only on normal store-side delivery.`
    ],
    priorities,
    statusMessage: `Live Flash ERP operations ledger from ${enterpriseNode.name} in ${enterpriseNode.retailOrg.name}. ${projectedInboundCount} upstream retail packet(s) have been acknowledged by enterprise so far.`,
    refreshedAt: new Date().toISOString()
  };
}

export type EnterpriseInventoryEntryDetailData = {
  currencyCode: string;
  entry: {
    id: string;
    movementType: string;
    quantity: number;
    unitCost: number | null;
    referenceType: string;
    referenceId: string;
    externalReference: string | null;
    sourceNodeCode: string | null;
    storeName: string | null;
    storeCode: string | null;
    warehouseName: string | null;
    warehouseCode: string | null;
    inventoryLocationName: string;
    inventoryLocationCode: string;
    productName: string;
    productCode: string;
    occurredAt: string;
    occurredAtLabel: string;
    createdAt: string;
    createdAtLabel: string;
  };
  sourceNode: {
    code: string;
    name: string;
    storeName: string | null;
    storeCode: string | null;
  } | null;
  relatedTransaction: {
    transactionNo: string;
    status: string;
    totalAmount: number;
    completedAt: string | null;
    completedAtLabel: string;
    storeName: string;
    storeCode: string;
  } | null;
  syncTrail: Array<{
    eventId: string;
    eventType: string;
    status: string;
    recordVersion: number;
    idempotencyKey: string;
    receivedAt: string;
    receivedAtLabel: string;
    appliedAt: string | null;
    appliedAtLabel: string;
    errorMessage: string | null;
  }>;
  operatorActions: Array<{
    id: string;
    actionType: string;
    operatorName: string;
    note: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  recoveryMessages: string[];
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterpriseInventoryEntryDetail(
  entryId: string
): Promise<EnterpriseInventoryEntryDetailData | null> {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      name: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          name: true,
          baseCurrencyCode: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return null;
  }

  const entry = await prisma.inventoryLedgerEntry.findFirst({
    where: {
      id: entryId,
      retailOrgId: enterpriseNode.retailOrgId
    },
    select: {
      id: true,
      movementType: true,
      quantity: true,
      unitCost: true,
      referenceType: true,
      referenceId: true,
      externalReference: true,
      sourceNodeCode: true,
      occurredAt: true,
      createdAt: true,
      store: {
        select: {
          name: true,
          code: true
        }
      },
      warehouse: {
        select: {
          name: true,
          code: true
        }
      },
      inventoryLocation: {
        select: {
          name: true,
          code: true
        }
      },
      product: {
        select: {
          name: true,
          code: true
        }
      }
    }
  });

  if (!entry) {
    return null;
  }

  const [sourceNode, relatedTransaction, syncTrail] = await Promise.all([
    entry.sourceNodeCode
      ? prisma.syncNode.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: entry.sourceNodeCode
          },
          select: {
            id: true,
            code: true,
            name: true,
            store: {
              select: {
                name: true,
                code: true
              }
            }
          }
        })
      : Promise.resolve(null),
    prisma.posTransaction.findFirst({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        OR: [
          { id: entry.referenceId },
          ...(entry.externalReference ? [{ transactionNo: entry.externalReference }] : [])
        ]
      },
      select: {
        transactionNo: true,
        status: true,
        totalAmount: true,
        completedAt: true,
        createdAt: true,
        store: {
          select: {
            name: true,
            code: true
          }
        }
      }
    }),
    entry.sourceNodeCode
      ? prisma.syncInboundEvent.findMany({
          where: {
            syncNodeId: enterpriseNode.id,
            sourceNodeCode: entry.sourceNodeCode,
            aggregateType: "inventoryLedgerEntry",
            aggregateId: entry.id
          },
          orderBy: [{ recordVersion: "desc" }, { receivedAt: "desc" }, { id: "desc" }],
          take: 20,
          select: {
            id: true,
            eventType: true,
            status: true,
            recordVersion: true,
            idempotencyKey: true,
            receivedAt: true,
            appliedAt: true,
            errorMessage: true,
            payload: true
          }
        })
      : Promise.resolve([])
  ]);

  const operatorActionRows =
    sourceNode && syncTrail.length > 0
      ? await prisma.syncOperatorAction.findMany({
          where: {
            syncNodeId: sourceNode.id,
            syncInboundEventId: {
              in: syncTrail.map((event) => event.id)
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 12,
          select: {
            id: true,
            actionType: true,
            operatorName: true,
            note: true,
            createdAt: true
          }
        })
      : [];

  const failedPackets = syncTrail.filter(
    (event) => event.status === SyncEventStatus.FAILED || event.status === SyncEventStatus.DEAD_LETTER
  );
  const latestPacket = syncTrail[0] ?? null;
  const latestPayload = latestPacket ? getPayloadRecord(latestPacket.payload) : {};
  const recoveryMessages = [
    latestPacket
      ? latestPacket.status === SyncEventStatus.ACKNOWLEDGED
        ? `Enterprise has acknowledged the latest inventory packet at record version ${latestPacket.recordVersion}. This ledger row is currently trusted as canonical stock history.`
        : `The latest inventory packet is still ${latestPacket.status.toLowerCase()}. Review the sync trail and operator audit before assuming this stock movement is settled.`
      : "No inbound sync trail is attached to this inventory movement yet. This usually means it was seeded or inserted outside the current store sync flow.",
    failedPackets.length > 0
      ? `${failedPackets.length} earlier packet(s) for this same inventory movement failed before enterprise accepted the current version.`
      : "No earlier failed packets were found for this inventory movement.",
    relatedTransaction
      ? `This stock movement is linked back to POS transaction ${relatedTransaction.transactionNo}, so operators can inspect the basket and stock impact together.`
      : entry.externalReference
        ? `This inventory movement carries external reference ${entry.externalReference}, but no canonical POS transaction is currently linked to it.`
        : "This inventory movement is not currently linked to a canonical POS transaction."
  ];

  if (latestPayload && Object.keys(latestPayload).length > 0) {
    const payloadLocation = getFirstString(latestPayload, ["inventoryLocationCode"]);

    if (payloadLocation && payloadLocation !== entry.inventoryLocation.code) {
      recoveryMessages.push(
        `The accepted payload referenced inventory location ${payloadLocation}, while enterprise posted the ledger row to ${entry.inventoryLocation.code}.`
      );
    }
  }

  const relatedCompletedAt = relatedTransaction
    ? relatedTransaction.completedAt ?? relatedTransaction.createdAt
    : null;

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    entry: {
      id: entry.id,
      movementType: entry.movementType,
      quantity: Number(entry.quantity),
      unitCost: entry.unitCost === null ? null : Number(entry.unitCost),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      externalReference: entry.externalReference,
      sourceNodeCode: entry.sourceNodeCode,
      storeName: entry.store?.name ?? null,
      storeCode: entry.store?.code ?? null,
      warehouseName: entry.warehouse?.name ?? null,
      warehouseCode: entry.warehouse?.code ?? null,
      inventoryLocationName: entry.inventoryLocation.name,
      inventoryLocationCode: entry.inventoryLocation.code,
      productName: entry.product.name,
      productCode: entry.product.code,
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt),
      createdAt: entry.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(entry.createdAt)
    },
    sourceNode: sourceNode
      ? {
          code: sourceNode.code,
          name: sourceNode.name,
          storeName: sourceNode.store?.name ?? null,
          storeCode: sourceNode.store?.code ?? null
        }
      : null,
    relatedTransaction: relatedTransaction
      ? {
          transactionNo: relatedTransaction.transactionNo,
          status: relatedTransaction.status,
          totalAmount: Number(relatedTransaction.totalAmount),
          completedAt: toIsoString(relatedCompletedAt),
          completedAtLabel: formatRelativeTime(relatedCompletedAt),
          storeName: relatedTransaction.store.name,
          storeCode: relatedTransaction.store.code
        }
      : null,
    syncTrail: syncTrail.map((event) => ({
      eventId: event.id,
      eventType: event.eventType,
      status: event.status,
      recordVersion: event.recordVersion,
      idempotencyKey: event.idempotencyKey,
      receivedAt: event.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(event.receivedAt),
      appliedAt: toIsoString(event.appliedAt),
      appliedAtLabel: formatRelativeTime(event.appliedAt),
      errorMessage: event.errorMessage
    })),
    operatorActions: operatorActionRows.map((action) => ({
      id: action.id,
      actionType: action.actionType,
      operatorName: action.operatorName,
      note: action.note,
      createdAt: action.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(action.createdAt)
    })),
    recoveryMessages,
    statusMessage: `Flash ERP enterprise is showing canonical inventory movement ${entry.id}. Review the stock fact, linked transaction context, and inbound sync history from one workspace.`,
    refreshedAt: new Date().toISOString()
  };
}
