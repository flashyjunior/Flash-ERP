import { Prisma } from "@prisma/client";
import { readJsonObject, readJsonStringArray } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import {
  PosTransactionStatus,
  RecordStatus,
  SyncEventStatus,
  SyncNodeType
} from "@flash-erp/domain";


const exceptionStatuses: SyncEventStatus[] = [
  SyncEventStatus.FAILED,
  SyncEventStatus.DEAD_LETTER
];

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

function latestDate(...values: Array<Date | null | undefined>) {
  return (
    values
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
  );
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

function getFirstNumber(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const nextValues: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const nextValue = entry.trim();

    if (!nextValue) {
      continue;
    }

    const duplicateKey = nextValue.toUpperCase();

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    nextValues.push(nextValue);
  }

  return nextValues;
}

function toTitleLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function stringifyPayload(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function formatPaymentMethod(value: string) {
  return toTitleLabel(value);
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
  retailOrg: {
    name: string;
    baseCurrencyCode: string;
  };
};

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
  return prisma.syncNode.findFirst({
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
          baseCurrencyCode: true
        }
      }
    }
  });
}

type StoreNodeRow = {
  code: string;
  originNodeCode: string;
  store: {
    id: string;
    name: string;
    code: string;
  } | null;
};

async function getStoreNodes(retailOrgId: string) {
  const [desktopStoreNodes, onlineStores] = await Promise.all([
    prisma.syncNode.findMany({
      where: {
        retailOrgId,
        nodeType: SyncNodeType.STORE_DESKTOP,
        status: RecordStatus.ACTIVE,
        store: {
          is: {
            salesEnabled: true
          }
        }
      },
      select: {
        code: true,
        store: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    }),
    prisma.store.findMany({
      where: {
        retailOrgId,
        storeMode: "ONLINE_DIRECT",
        salesEnabled: true,
        status: RecordStatus.ACTIVE
      },
      orderBy: {
        name: "asc"
      },
      select: {
        id: true,
        name: true,
        code: true
      }
    })
  ]);
  const storeNodes: StoreNodeRow[] = [
    ...desktopStoreNodes.map((node) => ({
      code: node.code,
      originNodeCode: node.code,
      store: node.store
    })),
    ...onlineStores.map((store) => ({
      code: `ONLINE_DIRECT:${store.code}`,
      originNodeCode: "ONLINE_DIRECT",
      store: {
        id: store.id,
        name: store.name,
        code: store.code
      }
    }))
  ].sort((left, right) => {
    const leftName = left.store?.name ?? left.code;
    const rightName = right.store?.name ?? right.code;

    return leftName.localeCompare(rightName);
  });

  const nodeCodes = [...new Set(storeNodes.map((node) => node.originNodeCode))];
  const byNodeCode = new Map<string, StoreNodeRow>(
    storeNodes
      .filter((node) => node.originNodeCode === node.code)
      .map((node) => [node.code, node] as const)
  );

  return {
    storeNodes,
    nodeCodes,
    byNodeCode
  };
}

export type EnterprisePosWorkspaceFilters = {
  storeCode?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type EnterprisePosWorkspaceData = {
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
    completedTransactions: number;
    postedRevenue: number;
    averageBasket: number;
    exceptionCount: number;
  };
  transactionRows: Array<{
    transactionNo: string;
    store: string;
    storeCode: string;
    terminal: string | null;
    cashierCode: string | null;
    originNodeCode: string | null;
    totalAmount: number;
    taxAmount: number;
    itemCount: number;
    tenderSummary: string;
    productSummary: string;
    promotionSummary: string | null;
    completedAt: string | null;
    completedAtLabel: string;
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
    createdAt: string;
    createdAtLabel: string;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  exceptionRows: Array<{
    eventId: string;
    sourceNodeCode: string;
    store: string;
    storeCode: string;
    aggregateType: string;
    eventType: string;
    status: string;
    referenceLabel: string;
    productCode: string | null;
    errorMessage: string | null;
    receivedAt: string;
    receivedAtLabel: string;
    retryable: boolean;
  }>;
  laneRows: Array<{
    store: string;
    storeCode: string;
    nodeCode: string;
    completedTransactions: number;
    salesValue: number;
    exceptionCount: number;
    lastTransactionAt: string | null;
    lastTransactionAtLabel: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterprisePosWorkspace(
  reason: string
): EnterprisePosWorkspaceData {
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
      completedTransactions: 0,
      postedRevenue: 0,
      averageBasket: 0,
      exceptionCount: 0
    },
    transactionRows: [],
    salesOrderRows: [],
    exceptionRows: [],
    laneRows: [],
    postureMessages: [
      "Flash ERP will surface posted sales and upstream POS exceptions here once the enterprise database is available.",
      "This workspace is designed to separate transport health from transaction detail."
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the seed script to provision the sample store nodes.",
      "Capture a store sale and run sync so enterprise POS history has data to inspect."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterprisePosWorkspace(
  input?: EnterprisePosWorkspaceFilters
): Promise<EnterprisePosWorkspaceData> {
  const requestedDateFrom = parseDateBoundary(input?.dateFrom, "start");
  const requestedDateTo = parseDateBoundary(input?.dateTo, "end");
  const dateFrom = requestedDateFrom?.date ?? null;
  const dateTo = requestedDateTo?.date ?? null;
  const dateFromKey = requestedDateFrom?.key ?? "";
  const dateToKey = requestedDateTo?.key ?? "";
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterprisePosWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read POS history."
    );
  }

  const { storeNodes } = await getStoreNodes(enterpriseNode.retailOrgId);
  const requestedStoreCode = input?.storeCode?.trim() ?? "";
  const selectedStoreNodes = requestedStoreCode
    ? storeNodes.filter(
        (node) => node.store?.code.toLowerCase() === requestedStoreCode.toLowerCase()
      )
    : [];
  const selectedStoreNode = selectedStoreNodes[0] ?? null;
  const selectedStoreCode = selectedStoreNode?.store?.code ?? "";
  const selectedStoreName = selectedStoreNode?.store?.name ?? "";
  const scopedStoreNodes = selectedStoreNodes.length > 0 ? selectedStoreNodes : storeNodes;
  const nodeCodes = [...new Set(scopedStoreNodes.map((node) => node.originNodeCode))];
  const storeIds = [...new Set(scopedStoreNodes.map((node) => node.store?.id).filter((storeId): storeId is string => Boolean(storeId)))];
  const byNodeCode = new Map<string, StoreNodeRow>(
    scopedStoreNodes.map((node) => [node.code, node] as const)
  );
  const dateFilter = buildDateRangeFilter(dateFrom, dateTo);
  const transactionDateWhere: Prisma.PosTransactionWhereInput = dateFilter
    ? {
        OR: [
          { completedAt: dateFilter },
          { completedAt: null, createdAt: dateFilter }
        ]
      }
    : {};
  const transactionWhere: Prisma.PosTransactionWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    status: PosTransactionStatus.COMPLETED,
    ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
    ...(nodeCodes.length > 0 ? { originNodeCode: { in: nodeCodes } } : {}),
    ...transactionDateWhere
  };
  const salesOrderWhere: Prisma.SalesOrderWhereInput = {
    retailOrgId: enterpriseNode.retailOrgId,
    ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
    ...(nodeCodes.length > 0 ? { originNodeCode: { in: nodeCodes } } : {}),
    ...(dateFilter
      ? {
          OR: [{ createdAt: dateFilter }, { updatedAt: dateFilter }]
        }
      : {})
  };
  const exceptionWhere: Prisma.SyncInboundEventWhereInput = {
    syncNodeId: enterpriseNode.id,
    sourceNodeCode: {
      in: nodeCodes
    },
    aggregateType: {
      in: ["posTransaction", "salesOrder"]
    },
    status: {
      in: exceptionStatuses
    },
    ...(dateFilter ? { receivedAt: dateFilter } : {})
  };
  const hasFocusedTransactionFilter = Boolean(selectedStoreCode || dateFromKey || dateToKey);

  const [
    transactionAggregate,
    recentTransactions,
    recentSalesOrders,
    recentExceptions,
    transactionGroups,
    exceptionGroups
  ] = await Promise.all([
    prisma.posTransaction.aggregate({
      where: transactionWhere,
      _count: {
        _all: true
      },
      _sum: {
        totalAmount: true
      }
    }),
    prisma.posTransaction.findMany({
      where: transactionWhere,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      ...(hasFocusedTransactionFilter ? {} : { take: 16 }),
      select: {
        id: true,
        transactionNo: true,
        totalAmount: true,
        taxAmount: true,
        completedAt: true,
        createdAt: true,
        originNodeCode: true,
        cashierCodeSnapshot: true,
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
            productCodeSnapshot: true,
            appliedPromotionCodeSnapshot: true,
            appliedPromotionNameSnapshot: true,
            quantity: true
          }
        },
        payments: {
          select: {
            method: true
          }
        }
      }
    }),
    prisma.salesOrder.findMany({
      where: salesOrderWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 16,
      select: {
        orderNo: true,
        sourceTransactionNo: true,
        status: true,
        totalAmount: true,
        operatorName: true,
        fulfilledTransactionNo: true,
        createdAt: true,
        updatedAt: true,
        customerNoSnapshot: true,
        customerNameSnapshot: true,
        customer: {
          select: {
            customerNo: true,
            fullName: true
          }
        },
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
    prisma.syncInboundEvent.findMany({
      where: exceptionWhere,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 16,
      select: {
        id: true,
        sourceNodeCode: true,
        aggregateType: true,
        eventType: true,
        status: true,
        errorMessage: true,
        receivedAt: true,
        payload: true
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
    prisma.syncInboundEvent.groupBy({
      by: ["sourceNodeCode"],
      where: exceptionWhere,
      _count: {
        _all: true
      },
      _max: {
        receivedAt: true
      }
    })
  ]);

  const completedTransactions = transactionAggregate._count._all;
  const postedRevenue = Number(transactionAggregate._sum.totalAmount ?? 0);
  const averageBasket = completedTransactions > 0 ? postedRevenue / completedTransactions : 0;
  const exceptionCount = recentExceptions.length > 0
    ? await prisma.syncInboundEvent.count({
        where: exceptionWhere
      })
    : 0;

  const transactionGroupByStoreId = new Map(
    transactionGroups.map((group) => [group.storeId ?? "unassigned", group] as const)
  );
  const exceptionGroupByNodeCode = new Map(
    exceptionGroups.map((group) => [group.sourceNodeCode, group] as const)
  );

  const laneRows = scopedStoreNodes
    .map((node) => {
      if (!node.store) {
        return null;
      }

      const salesGroup = transactionGroupByStoreId.get(node.store.id);
      const exceptionGroup = exceptionGroupByNodeCode.get(node.code);
      const lastTransactionAt = latestDate(
        salesGroup?._max.completedAt ?? null,
        salesGroup?._max.createdAt ?? null
      );

      return {
        store: node.store.name,
        storeCode: node.store.code,
        nodeCode: node.code,
        completedTransactions: salesGroup?._count._all ?? 0,
        salesValue: Number(salesGroup?._sum.totalAmount ?? 0),
        exceptionCount: exceptionGroup?._count._all ?? 0,
        lastTransactionAt: toIsoString(lastTransactionAt),
        lastTransactionAtLabel: formatRelativeTime(lastTransactionAt)
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => {
      if (right.completedTransactions !== left.completedTransactions) {
        return right.completedTransactions - left.completedTransactions;
      }

      return right.salesValue - left.salesValue;
    });

  const activePostingStores = laneRows.filter((row) => row.completedTransactions > 0).length;
  const silentStores = laneRows.length - activePostingStores;
  const openSalesOrders = recentSalesOrders.filter((order) => order.status === "OPEN").length;

  const priorities: string[] = [];

  if (exceptionCount > 0) {
    priorities.push(
      `${exceptionCount} upstream POS packet(s) still need operator review before enterprise can trust them as canonical sales history.`
    );
  }

  if (completedTransactions === 0) {
    priorities.push(
      "No canonical store sales have landed in enterprise yet. Capture a transaction locally and run sync."
    );
  }

  if (silentStores > 0) {
    priorities.push(
      `${activePostingStores} of ${laneRows.length} store node(s) have posted canonical sales so far. Bring the remaining POS lanes online and verify their sync cycles.`
    );
  }

  if (openSalesOrders > 0) {
    priorities.push(
      `${openSalesOrders} recent sales order(s) are still open in enterprise visibility. Follow up on fulfilment and cashier handoff across store lanes.`
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Canonical POS posting is healthy. The next lane is settlement, cashier accountability, and richer search across transaction history."
    );
  }

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    filters: {
      storeCode: selectedStoreCode,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      scopeLabel: selectedStoreName || "All shops"
    },
    shopOptions: storeNodes
      .map((node) =>
        node.store
          ? {
              storeCode: node.store.code,
              storeName: node.store.name,
              nodeCode: node.code
            }
          : null
      )
      .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    metrics: {
      completedTransactions,
      postedRevenue,
      averageBasket,
      exceptionCount
    },
    transactionRows: recentTransactions.map((transaction) => {
      const completedAt = transaction.completedAt ?? transaction.createdAt;
      const productSummary = [...new Set(transaction.lines.map((line) => line.productCodeSnapshot))]
        .slice(0, 3)
        .join(", ");
      const promotionSummary =
        [...new Set(
          transaction.lines
            .map((line) => line.appliedPromotionNameSnapshot ?? line.appliedPromotionCodeSnapshot)
            .filter((value): value is string => Boolean(value))
        )]
          .slice(0, 2)
          .join(", ") || null;
      const tenderSummary = [...new Set(transaction.payments.map((payment) => payment.method))]
        .map((method) => formatPaymentMethod(method))
        .join(", ");
      const itemCount = transaction.lines.reduce(
        (sum, line) => sum + Number(line.quantity),
        0
      );

      return {
        transactionNo: transaction.transactionNo,
        store: transaction.store.name,
        storeCode: transaction.store.code,
        terminal: transaction.terminal?.code ?? null,
        cashierCode: transaction.cashierCodeSnapshot,
        originNodeCode: transaction.originNodeCode,
        totalAmount: Number(transaction.totalAmount),
        taxAmount: Number(transaction.taxAmount),
        itemCount,
        tenderSummary,
        productSummary,
        promotionSummary,
        completedAt: toIsoString(completedAt),
        completedAtLabel: formatRelativeTime(completedAt)
      };
    }),
    salesOrderRows: recentSalesOrders.map((order) => ({
      orderNo: order.orderNo,
      store: order.store.name,
      storeCode: order.store.code,
      terminal: order.terminal?.code ?? null,
      sourceTransactionNo: order.sourceTransactionNo,
      customerNo: order.customer?.customerNo ?? order.customerNoSnapshot ?? null,
      customerName: order.customer?.fullName ?? order.customerNameSnapshot ?? null,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      operatorName: order.operatorName,
      fulfilledTransactionNo: order.fulfilledTransactionNo,
      createdAt: order.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(order.createdAt),
      updatedAt: order.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(order.updatedAt)
    })),
    exceptionRows: recentExceptions.map((event) => {
      const sourceNode = byNodeCode.get(event.sourceNodeCode);
      const payload = getPayloadRecord(event.payload);
      const transactionNo = getFirstString(payload, [
        "transactionNo",
        "orderNo",
        "externalReference",
        "referenceId",
        "transactionId"
      ]);
      const productCode = getFirstString(payload, ["productCode"]);
      const referenceLabel =
        [transactionNo, productCode].filter(Boolean).join(" • ") || event.id;

      return {
        eventId: event.id,
        sourceNodeCode: event.sourceNodeCode,
        store: sourceNode?.store?.name ?? event.sourceNodeCode,
        storeCode: sourceNode?.store?.code ?? "unknown-store",
        aggregateType: event.aggregateType,
        eventType: event.eventType,
        status: event.status,
        referenceLabel,
        productCode,
        errorMessage: event.errorMessage,
        receivedAt: event.receivedAt.toISOString(),
        receivedAtLabel: formatRelativeTime(event.receivedAt),
        retryable: event.status === SyncEventStatus.FAILED
      };
    }),
    laneRows,
    postureMessages: [
      `${completedTransactions} canonical completed store transaction(s) are available for enterprise review, worth ${postedRevenue.toFixed(2)} ${enterpriseNode.retailOrg.baseCurrencyCode}.`,
      exceptionCount > 0
        ? `${exceptionCount} POS-related inbound packet(s) are currently failed or dead-letter and should be reviewed from the recovery flow.`
        : "There are no current POS projection exceptions in the enterprise inbound queue.",
      `${activePostingStores} store node(s) have posted canonical sales into Flash ERP enterprise so far.`,
      openSalesOrders > 0
        ? `${openSalesOrders} recent sales order(s) are still open and waiting on fulfilment visibility from store lanes.`
        : "Recent sales orders are either fulfilled, cancelled, or still waiting for the next store-created hold to appear."
    ],
    priorities,
    statusMessage: `Live Flash ERP POS workspace from ${enterpriseNode.name} in ${enterpriseNode.retailOrg.name}. Review posted sales here and use sync node control for replay or recovery.`,
    refreshedAt: new Date().toISOString()
  };
}

export type EnterprisePosTransactionDetailData = {
  currencyCode: string;
  transaction: {
    id: string;
    transactionNo: string;
    sourceTransactionId: string | null;
    sourceTransactionNo: string | null;
    transactionType: string;
    status: string;
    storeName: string;
    storeCode: string;
    terminalName: string | null;
    terminalCode: string | null;
    cashierCode: string | null;
    originNodeCode: string | null;
    customerName: string | null;
    notes: string | null;
    subtotalAmount: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    paidAmount: number;
    changeAmount: number;
    completedAt: string | null;
    completedAtLabel: string;
    createdAt: string;
    createdAtLabel: string;
  };
  lines: Array<{
    id: string;
    lineIntent: string;
    sourceLineId: string | null;
    productCode: string;
    productName: string;
    barcode: string | null;
    appliedPromotionCode: string | null;
    appliedPromotionName: string | null;
    serialNumbers: string[];
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  appliedPromotions: Array<{
    promotionCode: string | null;
    promotionName: string | null;
    discountAmount: number;
    lineCount: number;
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    reference: string | null;
    receivedAt: string;
    receivedAtLabel: string;
  }>;
  inventoryRows: Array<{
    id: string;
    movementType: string;
    productCode: string;
    productName: string;
    quantity: number;
    externalReference: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  syncTrail: Array<{
    eventId: string;
    aggregateType: string;
    eventType: string;
    status: string;
    receivedAt: string;
    receivedAtLabel: string;
    appliedAt: string | null;
    appliedAtLabel: string;
    errorMessage: string | null;
    idempotencyKey: string;
  }>;
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterprisePosTransactionDetail(
  transactionNo: string
): Promise<EnterprisePosTransactionDetailData | null> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return null;
  }

  const transaction = await prisma.posTransaction.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      transactionNo
    },
    select: {
      id: true,
      transactionNo: true,
      sourceTransactionId: true,
      sourceTransactionNo: true,
      transactionType: true,
      status: true,
      customerNameSnapshot: true,
      notes: true,
      subtotalAmount: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      paidAmount: true,
      changeAmount: true,
      completedAt: true,
      createdAt: true,
      originNodeCode: true,
      cashierCodeSnapshot: true,
      store: {
        select: {
          name: true,
          code: true
        }
      },
      terminal: {
        select: {
          name: true,
          code: true
        }
      },
      lines: {
        orderBy: {
          createdAt: "asc"
        },
        select: {
          id: true,
          lineIntent: true,
          sourceLineId: true,
          productCodeSnapshot: true,
          productNameSnapshot: true,
          barcodeSnapshot: true,
          appliedPromotionCodeSnapshot: true,
          appliedPromotionNameSnapshot: true,
          serialNumbersSnapshot: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          taxAmount: true,
          lineTotal: true
        }
      },
      payments: {
        orderBy: {
          receivedAt: "asc"
        },
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
          receivedAt: true
        }
      }
    }
  });

  if (!transaction) {
    return null;
  }

  const [inventoryRows, inboundEvents] = await Promise.all([
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        OR: [
          {
            referenceId: transaction.id
          },
          {
            externalReference: transaction.transactionNo
          }
        ]
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        movementType: true,
        quantity: true,
        externalReference: true,
        occurredAt: true,
        product: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    transaction.originNodeCode
      ? prisma.syncInboundEvent.findMany({
          where: {
            syncNodeId: enterpriseNode.id,
            sourceNodeCode: transaction.originNodeCode,
            aggregateType: {
              in: ["posTransaction", "inventoryLedgerEntry"]
            }
          },
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          take: 60,
          select: {
            id: true,
            aggregateType: true,
            aggregateId: true,
            eventType: true,
            status: true,
            idempotencyKey: true,
            receivedAt: true,
            appliedAt: true,
            errorMessage: true,
            payload: true
          }
        })
      : Promise.resolve([])
  ]);

  const relatedInboundEvents = inboundEvents.filter((event) => {
    const payload = getPayloadRecord(event.payload);
    const matchesTransactionId =
      event.aggregateId === transaction.id ||
      getFirstString(payload, ["transactionId", "referenceId"]) === transaction.id;
    const matchesTransactionNo =
      getFirstString(payload, ["transactionNo", "externalReference"]) === transaction.transactionNo;

    return matchesTransactionId || matchesTransactionNo;
  });

  const appliedPromotionMetrics = new Map<
    string,
    {
      promotionCode: string | null;
      promotionName: string | null;
      discountAmount: number;
      lineCount: number;
    }
  >();

  for (const line of transaction.lines) {
    const promotionCode = line.appliedPromotionCodeSnapshot ?? null;
    const promotionName = line.appliedPromotionNameSnapshot ?? null;

    if (!promotionCode && !promotionName) {
      continue;
    }

    const key = `${promotionCode ?? "promotion"}::${promotionName ?? "unnamed"}`;
    const existing = appliedPromotionMetrics.get(key);

    if (existing) {
      existing.discountAmount += Number(line.discountAmount);
      existing.lineCount += 1;
      continue;
    }

    appliedPromotionMetrics.set(key, {
      promotionCode,
      promotionName,
      discountAmount: Number(line.discountAmount),
      lineCount: 1
    });
  }

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    transaction: {
      id: transaction.id,
      transactionNo: transaction.transactionNo,
      sourceTransactionId: transaction.sourceTransactionId,
      sourceTransactionNo: transaction.sourceTransactionNo,
      transactionType: transaction.transactionType,
      status: transaction.status,
      storeName: transaction.store.name,
      storeCode: transaction.store.code,
      terminalName: transaction.terminal?.name ?? null,
      terminalCode: transaction.terminal?.code ?? null,
      cashierCode: transaction.cashierCodeSnapshot,
      originNodeCode: transaction.originNodeCode,
      customerName: transaction.customerNameSnapshot ?? null,
      notes: transaction.notes,
      subtotalAmount: Number(transaction.subtotalAmount),
      discountAmount: Number(transaction.discountAmount),
      taxAmount: Number(transaction.taxAmount),
      totalAmount: Number(transaction.totalAmount),
      paidAmount: Number(transaction.paidAmount),
      changeAmount: Number(transaction.changeAmount),
      completedAt: toIsoString(transaction.completedAt),
      completedAtLabel: formatRelativeTime(transaction.completedAt),
      createdAt: transaction.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(transaction.createdAt)
    },
    lines: transaction.lines.map((line) => ({
      id: line.id,
      lineIntent: line.lineIntent,
      sourceLineId: line.sourceLineId,
      productCode: line.productCodeSnapshot,
      productName: line.productNameSnapshot,
      barcode: line.barcodeSnapshot,
      appliedPromotionCode: line.appliedPromotionCodeSnapshot ?? null,
      appliedPromotionName: line.appliedPromotionNameSnapshot ?? null,
      serialNumbers: getStringArray(line.serialNumbersSnapshot),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountAmount: Number(line.discountAmount),
      taxAmount: Number(line.taxAmount),
      lineTotal: Number(line.lineTotal)
    })),
    appliedPromotions: [...appliedPromotionMetrics.values()].sort(
      (left, right) => right.discountAmount - left.discountAmount
    ),
    payments: transaction.payments.map((payment) => ({
      id: payment.id,
      method: formatPaymentMethod(payment.method),
      amount: Number(payment.amount),
      reference: payment.reference,
      receivedAt: payment.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(payment.receivedAt)
    })),
    inventoryRows: inventoryRows.map((entry) => ({
      id: entry.id,
      movementType: entry.movementType,
      productCode: entry.product.code,
      productName: entry.product.name,
      quantity: Number(entry.quantity),
      externalReference: entry.externalReference,
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt)
    })),
    syncTrail: relatedInboundEvents.map((event) => ({
      eventId: event.id,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      status: event.status,
      receivedAt: event.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(event.receivedAt),
      appliedAt: toIsoString(event.appliedAt),
      appliedAtLabel: formatRelativeTime(event.appliedAt),
      errorMessage: event.errorMessage,
      idempotencyKey: event.idempotencyKey
    })),
    statusMessage: `Flash ERP enterprise is showing canonical POS detail for ${transaction.transactionNo}. Review the basket, stock movements, and related inbound sync trail from one workspace.`,
    refreshedAt: new Date().toISOString()
  };
}

export type EnterpriseSalesOrderDetailData = {
  currencyCode: string;
  order: {
    id: string;
    orderNo: string;
    status: string;
    storeName: string;
    storeCode: string;
    terminalCode: string | null;
    sourceTransactionNo: string;
    customerNo: string | null;
    customerName: string | null;
    operatorName: string | null;
    note: string | null;
    totalAmount: number;
    depositAmount: number;
    balanceAmount: number;
    depositTenderName: string | null;
    depositReference: string | null;
    fulfilledTransactionNo: string | null;
    createdAt: string;
    updatedAt: string;
    fulfilledAt: string | null;
    cancelledAt: string | null;
  };
  lines: Array<{
    id: string;
    productCode: string;
    productName: string;
    variant: string | null;
    lineNote: string | null;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
    promotionName: string | null;
  }>;
  syncTrail: Array<{
    eventId: string;
    eventType: string;
    status: string;
    receivedAt: string;
    receivedAtLabel: string;
    errorMessage: string | null;
  }>;
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterpriseSalesOrderDetail(
  orderNo: string
): Promise<EnterpriseSalesOrderDetailData | null> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return null;
  }

  const order = await prisma.salesOrder.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      orderNo
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      sourceTransactionId: true,
      sourceTransactionNo: true,
      customerNoSnapshot: true,
      customerNameSnapshot: true,
      operatorName: true,
      note: true,
      totalAmount: true,
      depositAmount: true,
      balanceAmount: true,
      depositTenderMethodNameSnapshot: true,
      depositReference: true,
      fulfilledTransactionNo: true,
      createdAt: true,
      updatedAt: true,
      fulfilledAt: true,
      cancelledAt: true,
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
      customer: {
        select: {
          customerNo: true,
          fullName: true
        }
      },
      lines: {
        select: {
          id: true,
          productCodeSnapshot: true,
          productNameSnapshot: true,
          productVariantCodeSnapshot: true,
          variantSizeSnapshot: true,
          variantColorSnapshot: true,
          variantAttributesSnapshot: true,
          lineNote: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          taxAmount: true,
          lineTotal: true,
          appliedPromotionName: true,
          appliedPromotionCode: true
        }
      }
    }
  });

  if (!order) {
    return null;
  }

  const [fallbackLines, syncTrail] = await Promise.all([
    order.lines.length === 0
      ? prisma.posTransactionLine.findMany({
          where: {
            posTransactionId: order.sourceTransactionId
          },
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            variantSizeSnapshot: true,
            variantColorSnapshot: true,
            lineNote: true,
            quantity: true,
            unitPrice: true,
            discountAmount: true,
            taxAmount: true,
            lineTotal: true,
            appliedPromotionNameSnapshot: true,
            appliedPromotionCodeSnapshot: true
          }
        })
      : Promise.resolve([]),
    prisma.syncInboundEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        aggregateType: "salesOrder",
        aggregateId: order.id
      },
      orderBy: {
        receivedAt: "desc"
      },
      take: 20,
      select: {
        id: true,
        eventType: true,
        status: true,
        receivedAt: true,
        errorMessage: true
      }
    })
  ]);
  const lines = order.lines.length > 0
    ? order.lines.map((line) => ({
        id: line.id,
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variant:
          [
            line.productVariantCodeSnapshot,
            line.variantSizeSnapshot,
            line.variantColorSnapshot,
            line.variantAttributesSnapshot
          ].filter(Boolean).join(" · ") || null,
        lineNote: line.lineNote,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount),
        taxAmount: Number(line.taxAmount),
        lineTotal: Number(line.lineTotal),
        promotionName: line.appliedPromotionName ?? line.appliedPromotionCode
      }))
    : fallbackLines.map((line) => ({
        id: line.id,
        productCode: line.productCodeSnapshot,
        productName: line.productNameSnapshot,
        variant:
          [line.variantSizeSnapshot, line.variantColorSnapshot]
            .filter(Boolean)
            .join(" · ") || null,
        lineNote: line.lineNote,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountAmount: Number(line.discountAmount),
        taxAmount: Number(line.taxAmount),
        lineTotal: Number(line.lineTotal),
        promotionName:
          line.appliedPromotionNameSnapshot ?? line.appliedPromotionCodeSnapshot
      }));

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      storeName: order.store.name,
      storeCode: order.store.code,
      terminalCode: order.terminal?.code ?? null,
      sourceTransactionNo: order.sourceTransactionNo,
      customerNo: order.customer?.customerNo ?? order.customerNoSnapshot,
      customerName: order.customer?.fullName ?? order.customerNameSnapshot,
      operatorName: order.operatorName,
      note: order.note,
      totalAmount: Number(order.totalAmount),
      depositAmount: Number(order.depositAmount),
      balanceAmount: Number(order.balanceAmount),
      depositTenderName: order.depositTenderMethodNameSnapshot,
      depositReference: order.depositReference,
      fulfilledTransactionNo: order.fulfilledTransactionNo,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      fulfilledAt: toIsoString(order.fulfilledAt),
      cancelledAt: toIsoString(order.cancelledAt)
    },
    lines,
    syncTrail: syncTrail.map((event) => ({
      eventId: event.id,
      eventType: event.eventType,
      status: event.status,
      receivedAt: event.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(event.receivedAt),
      errorMessage: event.errorMessage
    })),
    statusMessage:
      lines.length > 0
        ? `${lines.length} original order line(s) are available for enterprise review.`
        : "This order was synced before line-level sales-order detail was enabled.",
    refreshedAt: new Date().toISOString()
  };
}

export type EnterprisePosExceptionDetailData = {
  currencyCode: string;
  event: {
    id: string;
    sourceNodeCode: string;
    sourceNodeName: string;
    storeName: string;
    storeCode: string;
    terminalName: string | null;
    terminalCode: string | null;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    status: string;
    idempotencyKey: string;
    errorMessage: string | null;
    receivedAt: string;
    receivedAtLabel: string;
    appliedAt: string | null;
    appliedAtLabel: string;
  };
  context: {
    transactionNo: string | null;
    transactionId: string | null;
    externalReference: string | null;
    referenceId: string | null;
    productCode: string | null;
    productName: string | null;
    quantity: number | null;
    totalAmount: number | null;
    lineCount: number | null;
  };
  relatedTransaction: {
    transactionNo: string;
    status: string;
    totalAmount: number;
    completedAt: string | null;
    completedAtLabel: string;
    storeName: string;
    storeCode: string;
  } | null;
  relatedInventoryEntry: {
    entryId: string;
    movementType: string;
    productCode: string;
    productName: string;
    quantity: number;
    externalReference: string | null;
    inventoryLocationCode: string;
    inventoryLocationName: string;
    occurredAt: string;
    occurredAtLabel: string;
    storeName: string | null;
    storeCode: string | null;
  } | null;
  recoveryOutcome: {
    replacementCount: number;
    summary: string;
    latestReplacementEvent: {
      eventId: string;
      recordVersion: number;
      status: string;
      idempotencyKey: string;
      receivedAt: string;
      receivedAtLabel: string;
      appliedAt: string | null;
      appliedAtLabel: string;
      errorMessage: string | null;
    };
  } | null;
  payloadSummary: Array<{
    label: string;
    value: string;
  }>;
  payloadJson: string;
  availableActions: {
    canReprocess: boolean;
    canRequestResend: boolean;
  };
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

export async function getEnterprisePosExceptionDetail(
  eventId: string
): Promise<EnterprisePosExceptionDetailData | null> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return null;
  }

  const { nodeCodes } = await getStoreNodes(enterpriseNode.retailOrgId);

  const event = await prisma.syncInboundEvent.findFirst({
    where: {
      id: eventId,
      syncNodeId: enterpriseNode.id,
      sourceNodeCode: {
        in: nodeCodes
      },
      aggregateType: {
        in: ["posTransaction", "inventoryLedgerEntry"]
      }
    },
    select: {
      id: true,
      sourceNodeCode: true,
      aggregateType: true,
      aggregateId: true,
      eventType: true,
      status: true,
      idempotencyKey: true,
      payload: true,
      errorMessage: true,
      receivedAt: true,
      appliedAt: true
    }
  });

  if (!event) {
    return null;
  }

  const payload = getPayloadRecord(event.payload);
  const lineRecords = Array.isArray(payload.lines)
    ? payload.lines.filter(isRecord)
    : [];
  const transactionNo = getFirstString(payload, ["transactionNo"]);
  const transactionId = getFirstString(payload, ["transactionId"]);
  const externalReference = getFirstString(payload, ["externalReference"]);
  const referenceId = getFirstString(payload, ["referenceId"]);
  const fallbackProductCode =
    lineRecords.length > 0
      ? getFirstString(lineRecords[0], ["productCode", "sku", "code"])
      : null;
  const productCode = getFirstString(payload, ["productCode"]) ?? fallbackProductCode;
  const computedQuantity = lineRecords.reduce((sum, line) => {
    const quantity = getFirstNumber(line, ["quantity"]);
    return sum + (quantity ?? 0);
  }, 0);
  const quantity = getFirstNumber(payload, ["quantity"]) ?? (computedQuantity > 0 ? computedQuantity : null);
  const totalAmount = getFirstNumber(payload, ["totalAmount", "grossTotal", "amount"]);
  const lineCount = lineRecords.length > 0 ? lineRecords.length : null;

  const [sourceNode, relatedTransaction, relatedInventoryEntry, product, replacementEvents] =
    await Promise.all([
    prisma.syncNode.findFirst({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        code: event.sourceNodeCode
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
        },
        terminal: {
          select: {
            name: true,
            code: true
          }
        }
      }
    }),
    transactionNo || transactionId || referenceId
      ? prisma.posTransaction.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            OR: [
              ...(event.aggregateType === "posTransaction" ? [{ id: event.aggregateId }] : []),
              ...(transactionNo ? [{ transactionNo }] : []),
              ...(transactionId ? [{ id: transactionId }] : []),
              ...(referenceId ? [{ id: referenceId }] : [])
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
        })
      : Promise.resolve(null),
    event.aggregateType === "inventoryLedgerEntry"
      ? prisma.inventoryLedgerEntry.findUnique({
          where: {
            id: event.aggregateId
          },
          select: {
            id: true,
            movementType: true,
            quantity: true,
            externalReference: true,
            occurredAt: true,
            store: {
              select: {
                name: true,
                code: true
              }
            },
            inventoryLocation: {
              select: {
                code: true,
                name: true
              }
            },
            product: {
              select: {
                code: true,
                name: true
              }
            }
          }
        })
      : Promise.resolve(null),
    productCode
      ? prisma.product.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: productCode
          },
          select: {
            name: true
          }
        })
      : Promise.resolve(null),
    prisma.syncInboundEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        sourceNodeCode: event.sourceNodeCode,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        id: {
          not: event.id
        }
      },
      orderBy: [{ recordVersion: "desc" }, { receivedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        recordVersion: true,
        status: true,
        idempotencyKey: true,
        receivedAt: true,
        appliedAt: true,
        errorMessage: true
      }
    })
  ]);

  const operatorActions = await prisma.syncOperatorAction.findMany({
    where: {
      syncNodeId: sourceNode?.id ?? "__missing-node__",
      syncInboundEventId: event.id
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 6,
    select: {
      id: true,
      actionType: true,
      operatorName: true,
      note: true,
      createdAt: true
    }
  });

  const sourceStoreName = sourceNode?.store?.name ?? event.sourceNodeCode;
  const sourceStoreCode = sourceNode?.store?.code ?? "unknown-store";
  const sourceNodeName = sourceNode?.name ?? event.sourceNodeCode;
  const relatedCompletedAt = relatedTransaction
    ? relatedTransaction.completedAt ?? relatedTransaction.createdAt
    : null;
  const latestReplacementEvent = replacementEvents[0] ?? null;
  const replacementResolved =
    latestReplacementEvent?.status === SyncEventStatus.ACKNOWLEDGED ||
    latestReplacementEvent?.appliedAt !== null;
  const recoveryOutcome = latestReplacementEvent
    ? {
        replacementCount: replacementEvents.length,
        summary: replacementResolved
          ? `Store resend packet ${latestReplacementEvent.id} reached enterprise as record version ${latestReplacementEvent.recordVersion} and was acknowledged ${formatRelativeTime(latestReplacementEvent.appliedAt ?? latestReplacementEvent.receivedAt)}.`
          : `Store resend packet ${latestReplacementEvent.id} is back in flight at record version ${latestReplacementEvent.recordVersion}. Keep watching the inbound queue before raising another resend request.`,
        latestReplacementEvent: {
          eventId: latestReplacementEvent.id,
          recordVersion: latestReplacementEvent.recordVersion,
          status: latestReplacementEvent.status,
          idempotencyKey: latestReplacementEvent.idempotencyKey,
          receivedAt: latestReplacementEvent.receivedAt.toISOString(),
          receivedAtLabel: formatRelativeTime(latestReplacementEvent.receivedAt),
          appliedAt: toIsoString(latestReplacementEvent.appliedAt),
          appliedAtLabel: formatRelativeTime(latestReplacementEvent.appliedAt),
          errorMessage: latestReplacementEvent.errorMessage
        }
      }
    : null;

  const payloadSummary = [
    ["Transaction no", transactionNo],
    ["Transaction id", transactionId],
    ["External reference", externalReference],
    ["Reference id", referenceId],
    ["Product", productCode ? `${productCode}${product?.name ? ` • ${product.name}` : ""}` : null],
    ["Quantity", quantity !== null ? String(quantity) : null],
    [
      "Payload total",
      totalAmount !== null
        ? `${totalAmount.toFixed(2)} ${enterpriseNode.retailOrg.baseCurrencyCode}`
        : null
    ],
    ["Payload lines", lineCount !== null ? String(lineCount) : null]
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([label, value]) => ({
      label,
      value
    }));

  const recoveryMessages = [
    event.status === SyncEventStatus.DEAD_LETTER
      ? "This packet is dead-lettered in enterprise and will not retry automatically until an operator intervenes."
      : event.status === SyncEventStatus.FAILED
        ? "This packet failed during enterprise projection. Correct the underlying mismatch and then confirm the store resends or republishes cleanly."
        : "This packet is currently acknowledged in enterprise. Review the audit trail below to see how the failure was resolved.",
    recoveryOutcome
      ? recoveryOutcome.summary
      : "No replacement packet has been recorded for this exception yet. Recovery should focus on getting a clean upstream resend from the source store when reprocess is not appropriate.",
    relatedTransaction
      ? `Canonical transaction ${relatedTransaction.transactionNo} already exists in enterprise. Compare this packet against the posted basket before asking the store to resend, so we avoid double-posting.`
      : relatedInventoryEntry
        ? `Canonical inventory movement ${relatedInventoryEntry.id} already exists in enterprise for ${relatedInventoryEntry.product.code}. Review that ledger entry before taking any further resend action.`
        : "No canonical enterprise transaction or inventory movement is linked to this packet yet. Recovery should focus on getting a clean upstream resend from the source store.",
    `Open ${sourceStoreName} node control to inspect live store queue pressure, recent sync activity, and any operator recovery actions already taken.`
  ];

  if (operatorActions.length > 0) {
    recoveryMessages.push(
      `${operatorActions.length} operator action(s) have already been recorded against this packet. Review that audit trail before taking another recovery step.`
    );
  }

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    event: {
      id: event.id,
      sourceNodeCode: event.sourceNodeCode,
      sourceNodeName,
      storeName: sourceStoreName,
      storeCode: sourceStoreCode,
      terminalName: sourceNode?.terminal?.name ?? null,
      terminalCode: sourceNode?.terminal?.code ?? null,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      status: event.status,
      idempotencyKey: event.idempotencyKey,
      errorMessage: event.errorMessage,
      receivedAt: event.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(event.receivedAt),
      appliedAt: toIsoString(event.appliedAt),
      appliedAtLabel: formatRelativeTime(event.appliedAt)
    },
    context: {
      transactionNo,
      transactionId,
      externalReference,
      referenceId,
      productCode,
      productName: product?.name ?? null,
      quantity,
      totalAmount,
      lineCount
    },
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
    relatedInventoryEntry: relatedInventoryEntry
      ? {
          entryId: relatedInventoryEntry.id,
          movementType: relatedInventoryEntry.movementType,
          productCode: relatedInventoryEntry.product.code,
          productName: relatedInventoryEntry.product.name,
          quantity: Number(relatedInventoryEntry.quantity),
          externalReference: relatedInventoryEntry.externalReference,
          inventoryLocationCode: relatedInventoryEntry.inventoryLocation.code,
          inventoryLocationName: relatedInventoryEntry.inventoryLocation.name,
          occurredAt: relatedInventoryEntry.occurredAt.toISOString(),
          occurredAtLabel: formatRelativeTime(relatedInventoryEntry.occurredAt),
          storeName: relatedInventoryEntry.store?.name ?? null,
          storeCode: relatedInventoryEntry.store?.code ?? null
        }
      : null,
    recoveryOutcome,
    payloadSummary,
    payloadJson: stringifyPayload(event.payload),
    availableActions: {
      canReprocess:
        !replacementResolved &&
        (event.status === SyncEventStatus.FAILED || event.status === SyncEventStatus.DEAD_LETTER),
      canRequestResend:
        !replacementResolved &&
        (event.status === SyncEventStatus.FAILED || event.status === SyncEventStatus.DEAD_LETTER)
    },
    operatorActions: operatorActions.map((action) => ({
      id: action.id,
      actionType: action.actionType,
      operatorName: action.operatorName,
      note: action.note,
      createdAt: action.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(action.createdAt)
    })),
    recoveryMessages,
    statusMessage: recoveryOutcome
      ? `Flash ERP enterprise is showing POS exception ${event.id} alongside its latest recovery outcome. Use this workspace to confirm whether the store resend already produced a trustworthy canonical record.`
      : `Flash ERP enterprise is showing POS exception ${event.id}. Use the packet context here, then move to source-node recovery with the right transaction and product identifiers in hand.`,
    refreshedAt: new Date().toISOString()
  };
}
