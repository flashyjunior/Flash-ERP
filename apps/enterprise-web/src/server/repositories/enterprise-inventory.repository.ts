import { parseJsonField, readJsonStringArray } from "./json-field";


import { prisma } from "@/lib/db/prisma";
import { ensureInterStoreTransferSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";
import {
  buildEnterprisePageInfo,
  normalizeEnterprisePageInput,
  type EnterprisePageInfo,
  type EnterprisePageInput
} from "@/server/performance/enterprise-pagination";
import { RecordStatus, SyncNodeType } from "@flash-erp/domain";


function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not yet";
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

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalStringArray(value: unknown) {
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

function readTransferFeedbackEvidence(value: unknown) {
  const parsed = parseJsonField(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const url = readOptionalString(item.url);

      if (!url) {
        return null;
      }

      return {
        url,
        fileName: readOptionalString(item.fileName),
        capturedAt: readOptionalString(item.capturedAt),
        uploadedAt: readOptionalString(item.uploadedAt),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function calculateClaimAmount(
  lines: Array<{
    quantity: number;
    unitCost: number | null;
  }>
) {
  return Number(
    lines
      .reduce((sum, line) => sum + line.quantity * (line.unitCost ?? 0), 0)
      .toFixed(2)
  );
}

function calculateWholeDaysSince(value: Date | null) {
  if (!value) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 86_400_000));
}

function buildPostedSerialActivityLabel(transactionType: string, lineIntent: string) {
  if (transactionType === "RETURN") {
    return "Posted return serials";
  }

  if (transactionType === "EXCHANGE") {
    return lineIntent === "RETURN"
      ? "Posted exchange return serials"
      : "Posted exchange replacement serials";
  }

  return lineIntent === "RETURN" ? "Posted corrective return serials" : "Posted sale serials";
}

function buildTaskSerialActivityLabel(input: {
  taskType: string | null;
  currentLocationCode: string;
  locationCode: string | null;
  targetLocationCode: string | null;
}) {
  if (input.taskType === "APPLY_STOCK_TRANSFER") {
    if (input.targetLocationCode === input.currentLocationCode) {
      return "Requested transfer into this location";
    }

    return "Requested transfer out of this location";
  }

  if (input.taskType === "APPLY_COUNT_VARIANCE") {
    return "Requested serialized count variance";
  }

  if (input.taskType === "APPLY_INVENTORY_ADJUSTMENT") {
    return "Requested serialized adjustment";
  }

  return input.locationCode === input.currentLocationCode
    ? "Requested serialized stock-control task"
    : "Requested serialized follow-up task";
}

function getLocationDefaults(location: {
  useForSalesDefault: boolean;
  useForReceivingDefault: boolean;
}) {
  const labels: string[] = [];

  if (location.useForSalesDefault) {
    labels.push("Sales default");
  }

  if (location.useForReceivingDefault) {
    labels.push("Receiving default");
  }

  return labels.length > 0 ? labels.join(" • ") : "Standard";
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

type InventoryLocationRollup = {
  productIds: Set<string>;
  onHandQuantity: number;
  lastMovementAt: Date | null;
  negativePositions: number;
};

type InventoryProductRollup = {
  locationIds: Set<string>;
  onHandQuantity: number;
  lastMovementAt: Date | null;
};

export type EnterpriseInventoryWorkspaceData = {
  currencyCode: string;
  productPage: EnterprisePageInfo;
  metrics: {
    warehouses: number;
    locations: number;
    productsWithStock: number;
    negativePositions: number;
    openSupplierClaims: number;
    creditRequestedClaims: number;
    supplierClaimExposureAmount: number;
    postedSupplierReturns: number;
  };
  locationRows: Array<{
    locationCode: string;
    locationName: string;
    storeName: string | null;
    storeCode: string | null;
    warehouseName: string | null;
    warehouseCode: string | null;
    locationType: string;
    defaults: string;
    productCount: number;
    onHandQuantity: number;
    negativePositions: number;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
  }>;
  productRows: Array<{
    productCode: string;
    sku: string | null;
    productName: string;
    status: string;
    locationCount: number;
    onHandQuantity: number;
    estimatedRetailValue: number;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
  }>;
  transferLocationOptions: Array<{
    locationCode: string;
    locationName: string;
    storeCode: string;
    storeName: string;
  }>;
  transferProductOptions: Array<{
    productCode: string;
    sku: string | null;
    productName: string;
    isSerialized: boolean;
    baseUnitOfMeasure: string;
    uomConversions: Array<{
      uomCode: string;
      uomName: string;
      conversionFactor: number;
    }>;
  }>;
  stockPositionRows: Array<{
    locationCode: string;
    locationName: string;
    storeName: string | null;
    storeCode: string | null;
    warehouseName: string | null;
    warehouseCode: string | null;
    productCode: string;
    sku: string | null;
    productName: string;
    status: string;
    onHandQuantity: number;
    activeReservedQuantity: number;
    safetyStockLevel: number;
    ecommerceSellableQuantity: number;
    ecommercePickupEligible: boolean;
    ecommerceDeliveryEligible: boolean;
    ecommerceEligibilityLabel: string;
    estimatedRetailValue: number;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
  }>;
  movementRows: Array<{
    entryId: string;
    storeName: string | null;
    storeCode: string | null;
    locationCode: string;
    locationName: string;
    productCode: string;
    productName: string;
    movementType: string;
    quantity: number;
    referenceLabel: string;
    sourceNodeCode: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  serialLookupRows: Array<{
    lookupId: string;
    serialNumber: string;
    productCode: string;
    productName: string;
    sourceType: string;
    activityLabel: string;
    storeCode: string | null;
    storeName: string | null;
    locationCode: string | null;
    locationName: string | null;
    targetLocationCode: string | null;
    targetLocationName: string | null;
    referenceLabel: string;
    statusLabel: string | null;
    href: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  supplierClaimRows: Array<{
    supplierClaimId: string;
    claimNo: string;
    supplierNo: string;
    supplierName: string;
    storeCode: string | null;
    storeName: string | null;
    locationCode: string;
    locationName: string;
    purchaseOrderNo: string | null;
    goodsReceiptNo: string | null;
    status: string;
    statusLabel: string;
    supplierCaseReference: string | null;
    totalQuantity: number;
    lineCount: number;
    claimAmount: number;
    creditAmount: number | null;
    remainingAmount: number;
    ageDays: number;
    creditRequestedAt: string | null;
    creditRequestedAtLabel: string;
    creditReceivedAt: string | null;
    creditReceivedAtLabel: string;
    resolvedAt: string | null;
    resolvedAtLabel: string;
    createdAt: string;
    createdAtLabel: string;
    href: string;
  }>;
  supplierReturnRows: Array<{
    supplierReturnId: string;
    supplierReturnNo: string;
    supplierNo: string;
    supplierName: string;
    storeCode: string | null;
    storeName: string | null;
    locationCode: string;
    locationName: string;
    goodsReceiptNo: string | null;
    purchaseOrderNo: string | null;
    reason: string;
    reasonLabel: string;
    status: string;
    statusLabel: string;
    totalQuantity: number;
    totalValue: number;
    returnedAt: string;
    returnedAtLabel: string;
    postedAt: string;
    postedAtLabel: string;
    cancelledAt: string | null;
    cancelledAtLabel: string;
    cancellationNote: string | null;
    cancellationOperatorName: string | null;
    cancellationAcknowledgedAt: string | null;
    cancellationAcknowledgedAtLabel: string;
    cancellationAcknowledgedByNodeCode: string | null;
    cancellationAcknowledgedBy: string | null;
    cancellationAcknowledgementNote: string | null;
    href: string;
  }>;
  purchaseOrderRows: Array<{
    purchaseOrderId: string;
    purchaseOrderNo: string;
    status: string;
    statusLabel: string;
    supplierNo: string | null;
    supplierName: string | null;
    locationCode: string;
    locationName: string;
    storeCode: string | null;
    storeName: string | null;
    orderedQuantity: number;
    receivedQuantity: number;
    outstandingQuantity: number;
    lineCount: number;
    committedAt: string | null;
    committedAtLabel: string;
    updatedAt: string;
    updatedAtLabel: string;
    href: string;
  }>;
  interStoreTransferRows: Array<{
    transferId: string;
    transferNo: string;
    transferBatchNo: string | null;
    lineNo: number;
    status: string;
    statusLabel: string;
    origin: string;
    sourceStoreCode: string;
    sourceStoreName: string;
    sourceLocationCode: string;
    sourceLocationName: string;
    destinationStoreName: string;
    destinationLocationCode: string;
    destinationLocationName: string;
    productCode: string;
    productName: string;
    requestedQuantity: number;
    requestedUnitOfMeasure: string;
    requestedUnitQuantity: number;
    uomConversionFactor: number;
    baseUnitOfMeasure: string;
    issuedQuantity: number;
    receivedQuantity: number;
    inTransitQuantity: number;
    sourceNodeCode: string | null;
    destinationNodeCode: string | null;
    externalReference: string | null;
    transporterName: string | null;
    vehicleRegistrationNo: string | null;
    driverName: string | null;
    driverContact: string | null;
    deliveryNoteNo: string | null;
    workflowType: string | null;
    issueStockUpdateStatus: string;
    issueStockUpdateStatusLabel: string;
    issueStockConfirmedAt: string | null;
    issueStockConfirmedAtLabel: string;
    issueStockConfirmedBy: string | null;
    receiptStockUpdateStatus: string;
    receiptStockUpdateStatusLabel: string;
    receiptStockConfirmedAt: string | null;
    receiptStockConfirmedAtLabel: string;
    receiptStockConfirmedBy: string | null;
    feedbackStatus: string;
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
    feedbackRecordedAtLabel: string;
    feedbackConfirmedAt: string | null;
    feedbackPostedAt: string | null;
    feedbackOperatorName: string | null;
    requestedAt: string;
    requestedAtLabel: string;
    requiredAt: string | null;
    requiredAtLabel: string;
  }>;
  stockCountSessionRows: Array<{
    sessionId: string;
    sessionNo: string;
    status: string;
    statusLabel: string;
    storeCode: string | null;
    storeName: string | null;
    locationCode: string;
    locationName: string;
    productCode: string;
    productName: string;
    previousQuantity: number;
    countedQuantity: number;
    varianceQuantity: number;
    submittedAt: string;
    submittedAtLabel: string;
    committedAt: string | null;
    committedAtLabel: string;
  }>;
  exceptionPostureMessages: string[];
  serialPostureMessages: string[];
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterpriseInventoryWorkspace(
  reason: string,
  input?: EnterprisePageInput
): EnterpriseInventoryWorkspaceData {
  const productPage = normalizeEnterprisePageInput(input);

  return {
    currencyCode: "USD",
    productPage: buildEnterprisePageInfo(productPage, 0),
    metrics: {
      warehouses: 0,
      locations: 0,
      productsWithStock: 0,
      negativePositions: 0,
      openSupplierClaims: 0,
      creditRequestedClaims: 0,
      supplierClaimExposureAmount: 0,
      postedSupplierReturns: 0
    },
    locationRows: [],
    productRows: [],
    transferLocationOptions: [],
    transferProductOptions: [],
    stockPositionRows: [],
    movementRows: [],
    serialLookupRows: [],
    supplierClaimRows: [],
    supplierReturnRows: [],
    purchaseOrderRows: [],
    interStoreTransferRows: [],
    stockCountSessionRows: [],
    exceptionPostureMessages: [
      "Supplier exceptions will appear here once Flash ERP has receipt shortages, rejections, or supplier returns flowing back from the estate."
    ],
    serialPostureMessages: [
      "Enterprise-wide serial lookup will appear here once Flash ERP has canonical serialized transactions or enterprise-issued serialized stock-control tasks to index."
    ],
    postureMessages: [
      "Inventory posture will appear here once Flash ERP can read canonical warehouse, location, and ledger data.",
      "This workspace is intended to connect stock positions, locations, and recent movements in one place."
    ],
    priorities: [
      "Start the configured SQL Server service and apply the enterprise schema.",
      "Run the Flash ERP seed script to provision stores, warehouses, and opening balances.",
      "Capture store activity and sync it so the canonical inventory ledger has movements to display."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseInventoryWorkspace(
  input?: EnterprisePageInput
): Promise<EnterpriseInventoryWorkspaceData> {
  await ensureInterStoreTransferSchemaCompatibility();

  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseInventoryWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read canonical inventory posture.",
      input
    );
  }

  const productPage = normalizeEnterprisePageInput(input);
  const productPagingEnabled = Boolean(input);

  const [
    warehousesCount,
    locations,
    products,
    balanceGroups,
    activeReservationGroups,
    ecommerceFulfillmentLocations,
    recentEntries,
    serializedLines,
    serialTaskEvents,
    supplierClaims,
    supplierReturns,
    purchaseOrders,
    interStoreTransfers,
    stockCountSessions
  ] = await Promise.all([
    prisma.warehouse.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      }
    }),
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        locationType: true,
        useForSalesDefault: true,
        useForReceivingDefault: true,
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
    }),
    prisma.product.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: {
        name: "asc"
      },
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        status: true,
        trackInventory: true,
        isSerialized: true,
        safetyStockLevel: true,
        baseUnitPrice: true,
        unitOfMeasure: true,
        baseUnitOfMeasure: { select: { code: true } },
        uomSchedule: {
          select: {
            baseUnitOfMeasure: { select: { code: true } },
            lines: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                conversionFactor: true,
                unitOfMeasure: { select: { code: true, name: true } }
              }
            }
          }
        }
      }
    }),
    prisma.inventoryLedgerEntry.groupBy({
      by: ["inventoryLocationId", "productId"],
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      _sum: {
        quantity: true
      },
      _max: {
        occurredAt: true
      }
    }),
    prisma.salesOrderInventoryReservation.groupBy({
      by: ["inventoryLocationId", "productCodeSnapshot"],
      where: {
        status: "ACTIVE",
        inventoryLocationId: {
          not: null
        },
        salesOrder: {
          retailOrgId: enterpriseNode.retailOrgId
        }
      },
      _sum: {
        baseQuantity: true
      }
    }),
    prisma.ecommerceFulfillmentLocation.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
        storefrontStore: {
          status: RecordStatus.ACTIVE,
          ecommerceEnabled: true
        }
      },
      orderBy: [
        { inventoryLocationId: "asc" },
        { routingPriority: "asc" },
        { storefrontStore: { name: "asc" } }
      ],
      select: {
        inventoryLocationId: true,
        supportsPickup: true,
        supportsDelivery: true,
        routingPriority: true,
        storefrontStore: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        movementType: true,
        quantity: true,
        externalReference: true,
        referenceType: true,
        referenceId: true,
        sourceNodeCode: true,
        occurredAt: true,
        store: {
          select: {
            code: true,
            name: true
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
    }),
    prisma.posTransactionLine.findMany({
      where: {
        posTransaction: {
          retailOrgId: enterpriseNode.retailOrgId,
          completedAt: {
            not: null
          }
        }
      },
      orderBy: [{ posTransaction: { completedAt: "desc" } }, { createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        posTransactionId: true,
        productId: true,
        lineIntent: true,
        productCodeSnapshot: true,
        productNameSnapshot: true,
        serialNumbersSnapshot: true,
        quantity: true,
        posTransaction: {
          select: {
            id: true,
            transactionNo: true,
            transactionType: true,
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
    prisma.syncOutboxEvent.findMany({
      where: {
        syncNodeId: enterpriseNode.id,
        aggregateType: "syncTask",
        eventType: "sync.task.requested"
      },
      orderBy: [{ createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        aggregateId: true,
        targetNodeCode: true,
        status: true,
        payload: true,
        createdAt: true,
        acknowledgedAt: true
      }
    }),
    prisma.supplierClaim.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        claimNo: true,
        status: true,
        supplierCaseReference: true,
        creditRequestedAt: true,
        creditNoteAmount: true,
        creditReceivedAt: true,
        resolvedAt: true,
        createdAt: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
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
            }
          }
        },
        purchaseOrder: {
          select: {
            purchaseOrderNo: true
          }
        },
        goodsReceipt: {
          select: {
            receiptNo: true
          }
        },
        lines: {
          select: {
            quantity: true,
            unitCost: true
          }
        }
      }
    }),
    prisma.supplierReturn.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ postedAt: "desc" }],
      select: {
        id: true,
        supplierReturnNo: true,
        status: true,
        reason: true,
        returnedAt: true,
        postedAt: true,
        cancelledAt: true,
        cancellationNote: true,
        cancellationOperatorName: true,
        cancellationAcknowledgedAt: true,
        cancellationAcknowledgedByNodeCode: true,
        cancellationAcknowledgedBy: true,
        cancellationAcknowledgementNote: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
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
            }
          }
        },
        purchaseOrder: {
          select: {
            purchaseOrderNo: true
          }
        },
        goodsReceipt: {
          select: {
            receiptNo: true
          }
        },
        lines: {
          select: {
            quantity: true,
            unitCost: true
          }
        }
      }
    }),
    prisma.purchaseOrder.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ updatedAt: "desc" }, { purchaseOrderNo: "desc" }],
      take: 80,
      select: {
        id: true,
        purchaseOrderNo: true,
        status: true,
        committedAt: true,
        updatedAt: true,
        supplier: {
          select: {
            supplierNo: true,
            name: true
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
            }
          }
        },
        lines: {
          select: {
            orderedQuantity: true,
            receivedQuantity: true,
            exceptionQuantity: true
          }
        }
      }
    }),
    prisma.interStoreTransfer.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        OR: [
          {
            status: {
              in: ["DRAFT", "REQUESTED", "PART_ISSUED", "ISSUED", "PART_RECEIVED"]
            }
          },
          {
            updatedAt: {
              gte: new Date(Date.now() - 30 * 86_400_000)
            }
          }
        ]
      },
      orderBy: [{ updatedAt: "desc" }, { transferNo: "desc" }],
      take: 500,
      select: {
        id: true,
        transferNo: true,
        transferBatchNo: true,
        lineNo: true,
        origin: true,
        workflowType: true,
        issueStockUpdateStatus: true,
        issueStockConfirmedAt: true,
        issueStockConfirmedBy: true,
        receiptStockUpdateStatus: true,
        receiptStockConfirmedAt: true,
        receiptStockConfirmedBy: true,
        status: true,
        externalReference: true,
        requestedQuantity: true,
        requestedUnitOfMeasure: true,
        requestedUnitQuantity: true,
        uomConversionFactor: true,
        baseUnitOfMeasure: true,
        issuedQuantity: true,
        receivedQuantity: true,
        sourceNodeCode: true,
        destinationNodeCode: true,
        transporterName: true,
        vehicleRegistrationNo: true,
        driverName: true,
        driverContact: true,
        deliveryNoteNo: true,
        feedbackStatus: true,
        waterTestResult: true,
        quantityBeforeDelivery: true,
        expectedQuantityReceived: true,
        expectedStockQuantity: true,
        quantityAfterDelivery: true,
        actualQuantityReceived: true,
        feedbackVarianceQuantity: true,
        feedbackDipReading: true,
        beforeDischargeEvidenceJson: true,
        afterDischargeEvidenceJson: true,
        feedbackNote: true,
        feedbackRecordedAt: true,
        feedbackConfirmedAt: true,
        feedbackPostedAt: true,
        feedbackOperatorName: true,
        requestedAt: true,
        requiredAt: true,
        sourceStore: {
          select: {
            code: true,
            name: true
          }
        },
        destinationStore: {
          select: {
            name: true
          }
        },
        sourceInventoryLocation: {
          select: {
            code: true,
            name: true
          }
        },
        destinationInventoryLocation: {
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
    }).catch((error: unknown) => {
      console.error("Flash ERP could not load inter-store transfer rows.", error);
      return [];
    }),
    prisma.stockCountSession.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ updatedAt: "desc" }, { sessionNo: "desc" }],
      take: 80,
      select: {
        id: true,
        sessionNo: true,
        status: true,
        previousQuantity: true,
        countedQuantity: true,
        varianceQuantity: true,
        submittedAt: true,
        committedAt: true,
        inventoryLocation: {
          select: {
            code: true,
            name: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
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
  ]);

  const locationById = new Map(locations.map((location) => [location.id, location] as const));
  const locationByCode = new Map(locations.map((location) => [location.code, location] as const));
  const productById = new Map(products.map((product) => [product.id, product] as const));
  const serializedTransactionIds = [...new Set(serializedLines.map((line) => line.posTransactionId))];
  const serializedLineProductIds = [...new Set(serializedLines.map((line) => line.productId))];
  const serializedInventoryEntries =
    serializedTransactionIds.length > 0 && serializedLineProductIds.length > 0
      ? await prisma.inventoryLedgerEntry.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            referenceType: "POS_TRANSACTION",
            referenceId: {
              in: serializedTransactionIds
            },
            productId: {
              in: serializedLineProductIds
            }
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            referenceId: true,
            productId: true,
            movementType: true,
            occurredAt: true,
            inventoryLocation: {
              select: {
                code: true,
                name: true
              }
            }
          }
        })
      : [];
  const inventoryEntryByTransactionProduct = new Map<
    string,
    (typeof serializedInventoryEntries)[number]
  >();

  for (const entry of serializedInventoryEntries) {
    const key = `${entry.referenceId}:${entry.productId}`;

    if (!inventoryEntryByTransactionProduct.has(key)) {
      inventoryEntryByTransactionProduct.set(key, entry);
    }
  }
  const locationRollups = new Map<string, InventoryLocationRollup>();
  const productRollups = new Map<string, InventoryProductRollup>();
  let negativePositions = 0;

  for (const group of balanceGroups) {
    const quantity = Number(group._sum.quantity ?? 0);
    const lastMovementAt = group._max.occurredAt;

    const locationRollup = locationRollups.get(group.inventoryLocationId) ?? {
      productIds: new Set<string>(),
      onHandQuantity: 0,
      lastMovementAt: null,
      negativePositions: 0
    };
    const productRollup = productRollups.get(group.productId) ?? {
      locationIds: new Set<string>(),
      onHandQuantity: 0,
      lastMovementAt: null
    };

    if (quantity !== 0) {
      locationRollup.productIds.add(group.productId);
      productRollup.locationIds.add(group.inventoryLocationId);
    }

    if (quantity < 0) {
      negativePositions += 1;
      locationRollup.negativePositions += 1;
    }

    locationRollup.onHandQuantity += quantity;
    locationRollup.lastMovementAt = latestDate(locationRollup.lastMovementAt, lastMovementAt);
    productRollup.onHandQuantity += quantity;
    productRollup.lastMovementAt = latestDate(productRollup.lastMovementAt, lastMovementAt);

    locationRollups.set(group.inventoryLocationId, locationRollup);
    productRollups.set(group.productId, productRollup);
  }

  const locationRows = locations.map((location) => {
    const rollup = locationRollups.get(location.id);

    return {
      locationCode: location.code,
      locationName: location.name,
      storeName: location.store?.name ?? null,
      storeCode: location.store?.code ?? null,
      warehouseName: location.warehouse?.name ?? null,
      warehouseCode: location.warehouse?.code ?? null,
      locationType: location.locationType,
      defaults: getLocationDefaults(location),
      productCount: rollup?.productIds.size ?? 0,
      onHandQuantity: Number((rollup?.onHandQuantity ?? 0).toFixed(3)),
      negativePositions: rollup?.negativePositions ?? 0,
      lastMovementAt: toIsoString(rollup?.lastMovementAt ?? null),
      lastMovementAtLabel: formatRelativeTime(rollup?.lastMovementAt ?? null)
    };
  });

  const allProductRows = products
    .map((product) => {
      const rollup = productRollups.get(product.id);
      const onHandQuantity = Number((rollup?.onHandQuantity ?? 0).toFixed(3));

      return {
        productCode: product.code,
        sku: product.sku,
        productName: product.name,
        status: product.status,
        locationCount: rollup?.locationIds.size ?? 0,
        onHandQuantity,
        estimatedRetailValue: Number((onHandQuantity * Number(product.baseUnitPrice)).toFixed(2)),
        lastMovementAt: toIsoString(rollup?.lastMovementAt ?? null),
        lastMovementAtLabel: formatRelativeTime(rollup?.lastMovementAt ?? null)
      };
    })
    .sort((left, right) => {
      if (right.onHandQuantity !== left.onHandQuantity) {
        return right.onHandQuantity - left.onHandQuantity;
      }

      return left.productName.localeCompare(right.productName);
    });
  const matchingProductRows = productPage.search
    ? allProductRows.filter((product) =>
        [product.productCode, product.sku ?? "", product.productName, product.status]
          .join(" ")
          .toLowerCase()
          .includes(productPage.search.toLowerCase())
      )
    : allProductRows;
  const productRows = productPagingEnabled
    ? matchingProductRows.slice(productPage.skip, productPage.skip + productPage.pageSize)
    : matchingProductRows;
  const transferLocationOptions = locations
    .filter((location) => location.store?.code && location.store?.name)
    .map((location) => ({
      locationCode: location.code,
      locationName: location.name,
      storeCode: location.store!.code,
      storeName: location.store!.name
    }))
    .sort((left, right) => {
      const storeCompare = left.storeName.localeCompare(right.storeName);
      return storeCompare !== 0
        ? storeCompare
        : left.locationName.localeCompare(right.locationName);
    });
  const transferProductOptions = products
    .filter((product) => product.status === RecordStatus.ACTIVE && product.trackInventory)
    .map((product) => ({
      productCode: product.code,
      sku: product.sku,
      productName: product.name,
      isSerialized: product.isSerialized,
      baseUnitOfMeasure:
        product.baseUnitOfMeasure?.code ??
        product.uomSchedule?.baseUnitOfMeasure.code ??
        product.unitOfMeasure,
      uomConversions:
        product.uomSchedule?.lines.map((line) => ({
          uomCode: line.unitOfMeasure.code,
          uomName: line.unitOfMeasure.name,
          conversionFactor: Number(line.conversionFactor)
        })) ?? [
          {
            uomCode: product.unitOfMeasure,
            uomName: product.unitOfMeasure,
            conversionFactor: 1
          }
        ]
    }))
    .sort((left, right) => left.productName.localeCompare(right.productName));
  const balanceByLocationProduct = new Map(
    balanceGroups.map((group) => [
      `${group.inventoryLocationId}:${group.productId}`,
      {
        onHandQuantity: Number(group._sum.quantity ?? 0),
        lastMovementAt: group._max.occurredAt
      }
    ] as const)
  );
  const activeReservedByLocationProduct = new Map(
    activeReservationGroups.map((group) => [
      `${group.inventoryLocationId}:${group.productCodeSnapshot.trim().toUpperCase()}`,
      Number(group._sum.baseQuantity ?? 0)
    ] as const)
  );
  const ecommerceEligibilityByLocation = new Map<
    string,
    {
      supportsPickup: boolean;
      supportsDelivery: boolean;
      routingPriority: number;
      labels: string[];
    }
  >();

  for (const location of ecommerceFulfillmentLocations) {
    const current = ecommerceEligibilityByLocation.get(location.inventoryLocationId);
    const modes = [
      location.supportsPickup ? "pickup" : null,
      location.supportsDelivery ? "delivery" : null
    ].filter((value): value is string => Boolean(value));
    const label = `${location.storefrontStore.name}: ${modes.length ? modes.join(" + ") : "disabled"} (priority ${location.routingPriority})`;

    if (current) {
      current.supportsPickup ||= location.supportsPickup;
      current.supportsDelivery ||= location.supportsDelivery;
      current.routingPriority = Math.min(current.routingPriority, location.routingPriority);
      current.labels.push(label);
    } else {
      ecommerceEligibilityByLocation.set(location.inventoryLocationId, {
        supportsPickup: location.supportsPickup,
        supportsDelivery: location.supportsDelivery,
        routingPriority: location.routingPriority,
        labels: [label]
      });
    }
  }
  const stockPositionRows = locations
    .flatMap((location) =>
      products.map((product) => {
        const balance = balanceByLocationProduct.get(`${location.id}:${product.id}`);
        const onHandQuantity = Number((balance?.onHandQuantity ?? 0).toFixed(3));
        const activeReservedQuantity = Number(
          (activeReservedByLocationProduct.get(
            `${location.id}:${product.code.trim().toUpperCase()}`
          ) ?? 0).toFixed(3)
        );
        const safetyStockLevel = Number(Number(product.safetyStockLevel ?? 0).toFixed(3));
        const ecommerceEligibility = ecommerceEligibilityByLocation.get(location.id);
        const ecommerceSellableQuantity = ecommerceEligibility
          ? Number(
              Math.max(0, onHandQuantity - activeReservedQuantity - safetyStockLevel).toFixed(3)
            )
          : 0;

        return {
          locationCode: location.code,
          locationName: location.name,
          storeName: location.store?.name ?? null,
          storeCode: location.store?.code ?? null,
          warehouseName: location.warehouse?.name ?? null,
          warehouseCode: location.warehouse?.code ?? null,
          productCode: product.code,
          sku: product.sku,
          productName: product.name,
          status: product.status,
          onHandQuantity,
          activeReservedQuantity,
          safetyStockLevel,
          ecommerceSellableQuantity,
          ecommercePickupEligible: ecommerceEligibility?.supportsPickup ?? false,
          ecommerceDeliveryEligible: ecommerceEligibility?.supportsDelivery ?? false,
          ecommerceEligibilityLabel:
            ecommerceEligibility?.labels.join("; ") ?? "Not configured for ecommerce fulfilment",
          estimatedRetailValue: Number((onHandQuantity * Number(product.baseUnitPrice)).toFixed(2)),
          lastMovementAt: toIsoString(balance?.lastMovementAt ?? null),
          lastMovementAtLabel: formatRelativeTime(balance?.lastMovementAt ?? null)
        };
      })
    )
    .sort((left, right) => {
      const storeCompare = (left.storeName ?? left.warehouseName ?? "").localeCompare(
        right.storeName ?? right.warehouseName ?? ""
      );

      if (storeCompare !== 0) {
        return storeCompare;
      }

      const locationCompare = left.locationName.localeCompare(right.locationName);

      if (locationCompare !== 0) {
        return locationCompare;
      }

      return left.productName.localeCompare(right.productName);
    });

  const defaultSalesCount = locations.filter((location) => location.useForSalesDefault).length;
  const defaultReceivingCount = locations.filter((location) => location.useForReceivingDefault).length;
  const locationsWithoutMovement = locationRows.filter((location) => location.lastMovementAt === null).length;
  const inactiveProductsWithStock = allProductRows.filter(
    (product) => product.status !== RecordStatus.ACTIVE && product.onHandQuantity !== 0
  ).length;
  const productsWithStock = allProductRows.filter((product) => product.onHandQuantity > 0).length;
  const serializedProductsWithStock = new Set(
    balanceGroups
      .filter((group) => Number(group._sum.quantity ?? 0) > 0)
      .map((group) => {
        const product = productById.get(group.productId);
        return product?.isSerialized ? product.code : null;
      })
      .filter((productCode): productCode is string => Boolean(productCode))
  ).size;
  const productNameByCode = new Map(products.map((product) => [product.code, product.name] as const));
  const postedSerialLookupRows = serializedLines.flatMap((line) => {
    const serialNumbers = readOptionalStringArray(line.serialNumbersSnapshot);

    if (serialNumbers.length === 0) {
      return [];
    }

    const matchingInventoryEntry = inventoryEntryByTransactionProduct.get(
      `${line.posTransactionId}:${line.productId}`
    );

    return serialNumbers.map((serialNumber) => ({
      lookupId: `${line.id}:${serialNumber}`,
      serialNumber,
      productCode: line.productCodeSnapshot,
      productName: line.productNameSnapshot,
      sourceType: "POS transaction",
      activityLabel: buildPostedSerialActivityLabel(
        line.posTransaction.transactionType,
        line.lineIntent
      ),
      storeCode: line.posTransaction.store.code,
      storeName: line.posTransaction.store.name,
      locationCode: matchingInventoryEntry?.inventoryLocation.code ?? null,
      locationName: matchingInventoryEntry?.inventoryLocation.name ?? null,
      targetLocationCode: null,
      targetLocationName: null,
      referenceLabel: line.posTransaction.transactionNo,
      statusLabel: formatEnumLabel(line.posTransaction.transactionType),
      href: `/pos/transactions/${encodeURIComponent(line.posTransaction.transactionNo)}`,
      occurredAt:
        line.posTransaction.completedAt?.toISOString() ?? new Date().toISOString(),
      occurredAtLabel: formatRelativeTime(line.posTransaction.completedAt)
    }));
  });
  const taskSerialLookupRows = serialTaskEvents.flatMap((event) => {
    const payload = isRecord(event.payload) ? event.payload : null;

    if (!payload) {
      return [];
    }

    const replacementPayload = isRecord(payload.replacementPayload) ? payload.replacementPayload : null;
    const serialNumbers = [
      ...new Set([
        ...readOptionalStringArray(payload.serialNumbers),
        ...readOptionalStringArray(replacementPayload?.serialNumbers)
      ])
    ];

    if (serialNumbers.length === 0) {
      return [];
    }

    const locationCode = readOptionalString(payload.locationCode);
    const targetLocationCode = readOptionalString(payload.targetLocationCode);
    const resolvedLocation = locationCode ? locationByCode.get(locationCode) ?? null : null;
    const resolvedTargetLocation = targetLocationCode
      ? locationByCode.get(targetLocationCode) ?? null
      : null;
    const taskType = readOptionalString(payload.taskType);
    const productCode =
      readOptionalString(payload.productCode) ??
      readOptionalString(replacementPayload?.productCode) ??
      "Unknown";
    const requestedAt = readOptionalString(payload.requestedAt) ?? event.createdAt.toISOString();

    return serialNumbers.map((serialNumber) => ({
      lookupId: `${event.id}:${serialNumber}`,
      serialNumber,
      productCode,
      productName: productNameByCode.get(productCode) ?? productCode,
      sourceType: "Enterprise task",
      activityLabel: buildTaskSerialActivityLabel({
        taskType,
        currentLocationCode: locationCode ?? targetLocationCode ?? "",
        locationCode,
        targetLocationCode
      }),
      storeCode:
        resolvedLocation?.store?.code ??
        resolvedTargetLocation?.store?.code ??
        null,
      storeName:
        resolvedLocation?.store?.name ??
        resolvedTargetLocation?.store?.name ??
        null,
      locationCode,
      locationName:
        resolvedLocation?.name ??
        readOptionalString(payload.locationName),
      targetLocationCode,
      targetLocationName:
        resolvedTargetLocation?.name ??
        readOptionalString(payload.targetLocationName),
      referenceLabel:
        readOptionalString(payload.title) ??
        `${formatEnumLabel(taskType ?? "SYNC_TASK")} • ${event.aggregateId.slice(0, 8)}`,
      statusLabel: event.acknowledgedAt ? "Acknowledged by store" : formatEnumLabel(event.status),
      href: locationCode
        ? `/inventory/locations/${encodeURIComponent(locationCode)}`
        : targetLocationCode
          ? `/inventory/locations/${encodeURIComponent(targetLocationCode)}`
          : null,
      occurredAt: requestedAt,
      occurredAtLabel: formatRelativeTime(new Date(requestedAt))
    }));
  });
  const serialLookupRows = [...postedSerialLookupRows, ...taskSerialLookupRows]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 200);
  const supplierClaimRows = supplierClaims.map((supplierClaim) => {
    const totalQuantity = Number(
      supplierClaim.lines.reduce((sum, line) => sum + Number(line.quantity), 0).toFixed(3)
    );
    const claimAmount = calculateClaimAmount(
      supplierClaim.lines.map((line) => ({
        quantity: Number(line.quantity),
        unitCost: line.unitCost === null ? null : Number(line.unitCost)
      }))
    );
    const creditAmount =
      supplierClaim.creditNoteAmount === null ? null : Number(supplierClaim.creditNoteAmount);
    const remainingAmount = Number(Math.max(0, claimAmount - (creditAmount ?? 0)).toFixed(2));

    return {
      supplierClaimId: supplierClaim.id,
      claimNo: supplierClaim.claimNo,
      supplierNo: supplierClaim.supplier.supplierNo,
      supplierName: supplierClaim.supplier.name,
      storeCode: supplierClaim.inventoryLocation.store?.code ?? null,
      storeName: supplierClaim.inventoryLocation.store?.name ?? null,
      locationCode: supplierClaim.inventoryLocation.code,
      locationName: supplierClaim.inventoryLocation.name,
      purchaseOrderNo: supplierClaim.purchaseOrder?.purchaseOrderNo ?? null,
      goodsReceiptNo: supplierClaim.goodsReceipt?.receiptNo ?? null,
      status: supplierClaim.status,
      statusLabel: formatEnumLabel(supplierClaim.status),
      supplierCaseReference: supplierClaim.supplierCaseReference,
      totalQuantity,
      lineCount: supplierClaim.lines.length,
      claimAmount,
      creditAmount,
      remainingAmount,
      ageDays: calculateWholeDaysSince(supplierClaim.createdAt),
      creditRequestedAt: toIsoString(supplierClaim.creditRequestedAt),
      creditRequestedAtLabel: formatRelativeTime(supplierClaim.creditRequestedAt),
      creditReceivedAt: toIsoString(supplierClaim.creditReceivedAt),
      creditReceivedAtLabel: formatRelativeTime(supplierClaim.creditReceivedAt),
      resolvedAt: toIsoString(supplierClaim.resolvedAt),
      resolvedAtLabel: formatRelativeTime(supplierClaim.resolvedAt),
      createdAt: supplierClaim.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(supplierClaim.createdAt),
      href: `/inventory/locations/${encodeURIComponent(supplierClaim.inventoryLocation.code)}`
    };
  });
  const supplierReturnRows = supplierReturns.map((supplierReturn) => {
    const totalQuantity = Number(
      supplierReturn.lines.reduce((sum, line) => sum + Number(line.quantity), 0).toFixed(3)
    );
    const totalValue = Number(
      supplierReturn.lines
        .reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost ?? 0), 0)
        .toFixed(2)
    );

    return {
      supplierReturnId: supplierReturn.id,
      supplierReturnNo: supplierReturn.supplierReturnNo,
      supplierNo: supplierReturn.supplier.supplierNo,
      supplierName: supplierReturn.supplier.name,
      storeCode: supplierReturn.inventoryLocation.store?.code ?? null,
      storeName: supplierReturn.inventoryLocation.store?.name ?? null,
      locationCode: supplierReturn.inventoryLocation.code,
      locationName: supplierReturn.inventoryLocation.name,
      goodsReceiptNo: supplierReturn.goodsReceipt?.receiptNo ?? null,
      purchaseOrderNo: supplierReturn.purchaseOrder?.purchaseOrderNo ?? null,
      reason: supplierReturn.reason,
      reasonLabel: formatEnumLabel(supplierReturn.reason),
      status: supplierReturn.status,
      statusLabel: formatEnumLabel(supplierReturn.status),
      totalQuantity,
      totalValue,
      returnedAt: supplierReturn.returnedAt.toISOString(),
      returnedAtLabel: formatRelativeTime(supplierReturn.returnedAt),
      postedAt: supplierReturn.postedAt.toISOString(),
      postedAtLabel: formatRelativeTime(supplierReturn.postedAt),
      cancelledAt: toIsoString(supplierReturn.cancelledAt),
      cancelledAtLabel: formatRelativeTime(supplierReturn.cancelledAt),
      cancellationNote: supplierReturn.cancellationNote,
      cancellationOperatorName: supplierReturn.cancellationOperatorName,
      cancellationAcknowledgedAt: toIsoString(supplierReturn.cancellationAcknowledgedAt),
      cancellationAcknowledgedAtLabel: formatRelativeTime(
        supplierReturn.cancellationAcknowledgedAt
      ),
      cancellationAcknowledgedByNodeCode: supplierReturn.cancellationAcknowledgedByNodeCode,
      cancellationAcknowledgedBy: supplierReturn.cancellationAcknowledgedBy,
      cancellationAcknowledgementNote: supplierReturn.cancellationAcknowledgementNote,
      href: `/inventory/locations/${encodeURIComponent(supplierReturn.inventoryLocation.code)}`
    };
  });
  const purchaseOrderRows = purchaseOrders.map((purchaseOrder) => {
    const orderedQuantity = Number(
      purchaseOrder.lines.reduce((sum, line) => sum + Number(line.orderedQuantity), 0).toFixed(3)
    );
    const receivedQuantity = Number(
      purchaseOrder.lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0).toFixed(3)
    );
    const exceptionQuantity = Number(
      purchaseOrder.lines.reduce((sum, line) => sum + Number(line.exceptionQuantity), 0).toFixed(3)
    );

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      status: purchaseOrder.status,
      statusLabel: formatEnumLabel(purchaseOrder.status),
      supplierNo: purchaseOrder.supplier?.supplierNo ?? null,
      supplierName: purchaseOrder.supplier?.name ?? null,
      locationCode: purchaseOrder.inventoryLocation.code,
      locationName: purchaseOrder.inventoryLocation.name,
      storeCode: purchaseOrder.inventoryLocation.store?.code ?? null,
      storeName: purchaseOrder.inventoryLocation.store?.name ?? null,
      orderedQuantity,
      receivedQuantity,
      outstandingQuantity: Number(
        Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity).toFixed(3)
      ),
      lineCount: purchaseOrder.lines.length,
      committedAt: toIsoString(purchaseOrder.committedAt),
      committedAtLabel: formatRelativeTime(purchaseOrder.committedAt),
      updatedAt: purchaseOrder.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(purchaseOrder.updatedAt),
      href: `/inventory/locations/${encodeURIComponent(purchaseOrder.inventoryLocation.code)}`
    };
  });
  const interStoreTransferRows = interStoreTransfers.map((transfer) => {
    const requestedQuantity = Number(Number(transfer.requestedQuantity).toFixed(3));
    const issuedQuantity = Number(Number(transfer.issuedQuantity).toFixed(3));
    const receivedQuantity = Number(Number(transfer.receivedQuantity).toFixed(3));

    return {
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      transferBatchNo: transfer.transferBatchNo,
      lineNo: transfer.lineNo,
      status: transfer.status,
      statusLabel: formatEnumLabel(transfer.status),
      origin: formatEnumLabel(transfer.origin),
      sourceStoreCode: transfer.sourceStore.code,
      sourceStoreName: transfer.sourceStore.name,
      sourceLocationCode:
        issuedQuantity > 0 ? transfer.sourceInventoryLocation.code : "",
      sourceLocationName:
        issuedQuantity > 0
          ? transfer.sourceInventoryLocation.name
          : "Selected by source shop on issue",
      destinationStoreName: transfer.destinationStore.name,
      destinationLocationCode: transfer.destinationInventoryLocation.code,
      destinationLocationName: transfer.destinationInventoryLocation.name,
      productCode: transfer.product.code,
      productName: transfer.product.name,
      requestedQuantity,
      requestedUnitOfMeasure: transfer.requestedUnitOfMeasure,
      requestedUnitQuantity: Number(Number(transfer.requestedUnitQuantity).toFixed(3)),
      uomConversionFactor: Number(Number(transfer.uomConversionFactor).toFixed(6)),
      baseUnitOfMeasure: transfer.baseUnitOfMeasure,
      issuedQuantity,
      receivedQuantity,
      inTransitQuantity: Number(Math.max(0, issuedQuantity - receivedQuantity).toFixed(3)),
      sourceNodeCode: transfer.sourceNodeCode,
      destinationNodeCode: transfer.destinationNodeCode,
      externalReference: transfer.externalReference,
      transporterName: transfer.transporterName,
      vehicleRegistrationNo: transfer.vehicleRegistrationNo,
      driverName: transfer.driverName,
      driverContact: transfer.driverContact,
      deliveryNoteNo: transfer.deliveryNoteNo,
      workflowType: transfer.workflowType,
      issueStockUpdateStatus: transfer.issueStockUpdateStatus,
      issueStockUpdateStatusLabel: formatEnumLabel(transfer.issueStockUpdateStatus),
      issueStockConfirmedAt: toIsoString(transfer.issueStockConfirmedAt),
      issueStockConfirmedAtLabel: formatRelativeTime(transfer.issueStockConfirmedAt),
      issueStockConfirmedBy: transfer.issueStockConfirmedBy,
      receiptStockUpdateStatus: transfer.receiptStockUpdateStatus,
      receiptStockUpdateStatusLabel: formatEnumLabel(transfer.receiptStockUpdateStatus),
      receiptStockConfirmedAt: toIsoString(transfer.receiptStockConfirmedAt),
      receiptStockConfirmedAtLabel: formatRelativeTime(transfer.receiptStockConfirmedAt),
      receiptStockConfirmedBy: transfer.receiptStockConfirmedBy,
      feedbackStatus: transfer.feedbackStatus,
      waterTestResult: transfer.waterTestResult,
      quantityBeforeDelivery:
        transfer.quantityBeforeDelivery === null
          ? null
          : Number(Number(transfer.quantityBeforeDelivery).toFixed(3)),
      expectedQuantityReceived:
        transfer.expectedQuantityReceived === null
          ? null
          : Number(Number(transfer.expectedQuantityReceived).toFixed(3)),
      expectedStockQuantity:
        transfer.expectedStockQuantity === null
          ? null
          : Number(Number(transfer.expectedStockQuantity).toFixed(3)),
      quantityAfterDelivery:
        transfer.quantityAfterDelivery === null
          ? null
          : Number(Number(transfer.quantityAfterDelivery).toFixed(3)),
      actualQuantityReceived:
        transfer.actualQuantityReceived === null
          ? null
          : Number(Number(transfer.actualQuantityReceived).toFixed(3)),
      feedbackVarianceQuantity:
        transfer.feedbackVarianceQuantity === null
          ? null
          : Number(Number(transfer.feedbackVarianceQuantity).toFixed(3)),
      feedbackDipReading:
        transfer.feedbackDipReading === null
          ? null
          : Number(Number(transfer.feedbackDipReading).toFixed(3)),
      beforeDischargeEvidence: readTransferFeedbackEvidence(transfer.beforeDischargeEvidenceJson),
      afterDischargeEvidence: readTransferFeedbackEvidence(transfer.afterDischargeEvidenceJson),
      feedbackNote: transfer.feedbackNote,
      feedbackRecordedAt: toIsoString(transfer.feedbackRecordedAt),
      feedbackRecordedAtLabel: formatRelativeTime(transfer.feedbackRecordedAt),
      feedbackConfirmedAt: toIsoString(transfer.feedbackConfirmedAt),
      feedbackPostedAt: toIsoString(transfer.feedbackPostedAt),
      feedbackOperatorName: transfer.feedbackOperatorName,
      requestedAt: transfer.requestedAt.toISOString(),
      requestedAtLabel: formatRelativeTime(transfer.requestedAt),
      requiredAt: toIsoString(transfer.requiredAt),
      requiredAtLabel: formatRelativeTime(transfer.requiredAt)
    };
  });
  const stockCountSessionRows = stockCountSessions.map((session) => ({
    sessionId: session.id,
    sessionNo: session.sessionNo,
    status: session.status,
    statusLabel: formatEnumLabel(session.status),
    storeCode: session.inventoryLocation.store?.code ?? null,
    storeName: session.inventoryLocation.store?.name ?? null,
    locationCode: session.inventoryLocation.code,
    locationName: session.inventoryLocation.name,
    productCode: session.product.code,
    productName: session.product.name,
    previousQuantity: Number(Number(session.previousQuantity).toFixed(3)),
    countedQuantity: Number(Number(session.countedQuantity).toFixed(3)),
    varianceQuantity: Number(Number(session.varianceQuantity).toFixed(3)),
    submittedAt: session.submittedAt.toISOString(),
    submittedAtLabel: formatRelativeTime(session.submittedAt),
    committedAt: toIsoString(session.committedAt),
    committedAtLabel: formatRelativeTime(session.committedAt)
  }));
  const openSupplierClaims = supplierClaimRows.filter(
    (row) => row.status !== "CLOSED" && row.status !== "WRITTEN_OFF"
  ).length;
  const creditRequestedClaims = supplierClaimRows.filter(
    (row) => row.status === "CREDIT_REQUESTED"
  ).length;
  const supplierClaimExposureAmount = Number(
    supplierClaimRows
      .filter((row) => row.status !== "CLOSED" && row.status !== "WRITTEN_OFF")
      .reduce((sum, row) => sum + row.remainingAmount, 0)
      .toFixed(2)
  );
  const postedSupplierReturns = supplierReturnRows.filter((row) => row.status === "POSTED").length;
  const cancelledSupplierReturns = supplierReturnRows.filter(
    (row) => row.status === "CANCELLED"
  ).length;
  const acknowledgedCancelledSupplierReturns = supplierReturnRows.filter(
    (row) => row.status === "CANCELLED" && row.cancellationAcknowledgedAt
  ).length;
  const storesRepresentedInSerialLookup = new Set(
    serialLookupRows
      .map((row) => row.storeCode)
      .filter((storeCode): storeCode is string => Boolean(storeCode))
  ).size;
  const locationsRepresentedInSerialLookup = new Set(
    serialLookupRows
      .flatMap((row) => [row.locationCode, row.targetLocationCode])
      .filter((locationCode): locationCode is string => Boolean(locationCode))
  ).size;
  const serialPostureMessages = [
    "Enterprise-wide serial lookup in Flash ERP is advisory and history-based. The live serial registry remains on each store desktop so offline validation can continue even when enterprise is unreachable.",
    serializedProductsWithStock > 0
      ? `${serializedProductsWithStock} serialized product${
          serializedProductsWithStock === 1 ? "" : "s"
        } currently hold positive canonical stock across the estate.`
      : "No serialized products currently hold positive canonical stock in the enterprise snapshot.",
    serialLookupRows.length > 0
      ? `${serialLookupRows.length} recent serial activity row${
          serialLookupRows.length === 1 ? "" : "s"
        } are searchable across ${storesRepresentedInSerialLookup} store${
          storesRepresentedInSerialLookup === 1 ? "" : "s"
        } and ${locationsRepresentedInSerialLookup} location${
          locationsRepresentedInSerialLookup === 1 ? "" : "s"
        }.`
      : "No recent serialized transactions or enterprise-issued serialized stock-control tasks are available for enterprise lookup yet."
  ];
  const exceptionPostureMessages = [
    openSupplierClaims > 0
      ? `${openSupplierClaims} supplier claim${openSupplierClaims === 1 ? "" : "s"} still need settlement or explicit write-off across the estate.`
      : "No supplier claims are currently sitting open in Flash ERP enterprise.",
    creditRequestedClaims > 0
      ? `${creditRequestedClaims} claim${creditRequestedClaims === 1 ? "" : "s"} are already in formal credit-request posture and should be chased against supplier response timelines.`
      : "No claims are currently waiting in a formal credit-request posture.",
    supplierClaimExposureAmount > 0
      ? `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: enterpriseNode.retailOrg.baseCurrencyCode
        }).format(supplierClaimExposureAmount)} remains exposed across unsettled claims.`
      : "No unsettled supplier-claim value is currently exposed in the enterprise exception lane.",
    postedSupplierReturns > 0
      ? `${postedSupplierReturns} supplier return${postedSupplierReturns === 1 ? "" : "s"} have been posted, giving Flash ERP a matching physical vendor-return trail alongside credit claims.`
      : "No supplier returns are currently posted in the enterprise exception lane.",
    cancelledSupplierReturns > 0
      ? `${cancelledSupplierReturns} supplier return${cancelledSupplierReturns === 1 ? "" : "s"} have already been cancelled and rehydrated back to their originating execution nodes.`
      : "No supplier returns currently sit in cancelled posture.",
    acknowledgedCancelledSupplierReturns > 0
      ? `${acknowledgedCancelledSupplierReturns} cancelled supplier return${
          acknowledgedCancelledSupplierReturns === 1 ? "" : "s"
        } have already been confirmed back by the branch after local rehydration.`
      : "No cancelled supplier returns have been confirmed back by the branch yet."
  ];

  const postureMessages = [
    negativePositions > 0
      ? `${negativePositions} product-location positions are below zero and should be reconciled before further stock corrections.`
      : "No negative canonical stock positions are visible across the current Flash ERP location footprint.",
    locationsWithoutMovement > 0
      ? `${locationsWithoutMovement} active locations have not posted canonical ledger movement yet.`
      : "Every active inventory location has posted at least one canonical movement.",
    defaultSalesCount > 0 || defaultReceivingCount > 0
      ? `${defaultSalesCount} sales defaults and ${defaultReceivingCount} receiving defaults are configured across the estate.`
      : "No default sales or receiving locations are configured yet, which will block predictable posting posture."
  ];

  const priorities = [
    negativePositions > 0
      ? "Resolve the negative stock positions first so desktop resend and replay work against clean inventory posture."
      : "Review locations with the highest on-hand balances and confirm opening balances still match the physical estate.",
    locationsWithoutMovement > 0
      ? "Validate the quiet locations and decide whether they still belong in the rollout or need initial balances."
      : "Use this lane to track product-by-product stock posture before adding transfers and receiving workflows.",
    inactiveProductsWithStock > 0
      ? "Investigate inactive products that still hold stock so catalog status does not drift from operational reality."
      : "Keep barcode, catalog, and inventory ownership aligned so store sync packets always resolve to canonical products."
  ];

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    productPage: buildEnterprisePageInfo(productPage, matchingProductRows.length),
    metrics: {
      warehouses: warehousesCount,
      locations: locations.length,
      productsWithStock,
      negativePositions,
      openSupplierClaims,
      creditRequestedClaims,
      supplierClaimExposureAmount,
      postedSupplierReturns
    },
    locationRows,
    productRows,
    transferLocationOptions,
    transferProductOptions,
    stockPositionRows,
    movementRows: recentEntries.map((entry) => ({
      entryId: entry.id,
      storeName: entry.store?.name ?? null,
      storeCode: entry.store?.code ?? null,
      locationCode: entry.inventoryLocation.code,
      locationName: entry.inventoryLocation.name,
      productCode: entry.product.code,
      productName: entry.product.name,
      movementType: entry.movementType,
      quantity: Number(entry.quantity),
      referenceLabel:
        entry.externalReference ??
        `${entry.referenceType.toLowerCase().replace(/_/g, " ")} • ${entry.referenceId.slice(0, 8)}`,
      sourceNodeCode: entry.sourceNodeCode,
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt)
    })),
    serialLookupRows,
    supplierClaimRows,
    supplierReturnRows,
    purchaseOrderRows,
    interStoreTransferRows,
    stockCountSessionRows,
    exceptionPostureMessages,
    serialPostureMessages,
    postureMessages,
    priorities,
    statusMessage: `Flash ERP inventory is reading ${balanceGroups.length} active stock positions across ${locations.length} locations and ${recentEntries.length} recent canonical ledger movements.`,
    refreshedAt: new Date().toISOString()
  };
}

export type EnterpriseInventoryLocationDetailData = {
  currencyCode: string;
  location: {
    code: string;
    name: string;
    locationType: string;
    status: string;
    defaults: string;
    storeCode: string | null;
    storeName: string | null;
    primaryNodeCode: string | null;
    warehouseCode: string | null;
    warehouseName: string | null;
    updatedAt: string;
    updatedAtLabel: string;
  };
  metrics: {
    productsTracked: number;
    onHandQuantity: number;
    ledgerEntries: number;
    negativePositions: number;
  };
  availableDepartments: Array<{
    code: string;
    name: string;
  }>;
  availableCategories: Array<{
    code: string;
    name: string;
    departmentCode: string | null;
    departmentName: string | null;
  }>;
  availableSuppliers: Array<{
    supplierNo: string;
    name: string;
  }>;
  balanceRows: Array<{
    productCode: string;
    sku: string | null;
    productName: string;
    status: string;
    departmentCode: string | null;
    departmentName: string | null;
    categoryCode: string | null;
    categoryName: string | null;
    subcategory: string | null;
    isSerialized: boolean;
    onHandQuantity: number;
    estimatedRetailValue: number;
    lastMovementAt: string | null;
    lastMovementAtLabel: string;
  }>;
  receivingProductRows: Array<{
    productCode: string;
    sku: string | null;
    productName: string;
    status: string;
    departmentCode: string | null;
    departmentName: string | null;
    categoryCode: string | null;
    categoryName: string | null;
    subcategory: string | null;
    isSerialized: boolean;
    defaultUnitCost: number | null;
    primarySupplierNo: string | null;
    primarySupplierName: string | null;
  }>;
  purchaseOrderRows: Array<{
    purchaseOrderId: string;
    purchaseOrderNo: string;
    status: string;
    supplierNo: string | null;
    supplierName: string | null;
    externalReference: string | null;
    note: string | null;
    operatorName: string | null;
    orderedQuantity: number;
    receivedQuantity: number;
    exceptionQuantity: number;
    outstandingQuantity: number;
    lineCount: number;
    committedAt: string | null;
    committedAtLabel: string;
    closedAt: string | null;
    closedAtLabel: string;
    closureReason: string | null;
    closureReasonLabel: string | null;
    closureNote: string | null;
    closureOperatorName: string | null;
    lines: Array<{
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
    }>;
  }>;
  goodsReceiptRows: Array<{
    goodsReceiptId: string;
    goodsReceiptNo: string;
    purchaseOrderId: string | null;
    purchaseOrderNo: string | null;
    supplierNo: string | null;
    supplierName: string | null;
    externalReference: string | null;
    note: string | null;
    operatorName: string;
    sourceNodeCode: string | null;
    totalQuantity: number;
    lineCount: number;
    receivedAt: string;
    receivedAtLabel: string;
    postedAt: string;
    postedAtLabel: string;
    lines: Array<{
      goodsReceiptLineId: string;
      lineNo: number;
      productCode: string;
      productName: string;
      quantity: number;
      unitCost: number | null;
      serialNumbers: string[];
    }>;
  }>;
  supplierClaimRows: Array<{
    supplierClaimId: string;
    claimNo: string;
    purchaseOrderId: string | null;
    purchaseOrderNo: string | null;
    goodsReceiptId: string | null;
    goodsReceiptNo: string | null;
    supplierNo: string;
    supplierName: string;
    externalReference: string | null;
    status: string;
    statusLabel: string;
    note: string | null;
    operatorName: string;
    sourceNodeCode: string | null;
    supplierCaseReference: string | null;
    creditRequestedAt: string | null;
    creditRequestedAtLabel: string;
    creditRequestedBy: string | null;
    creditNoteReference: string | null;
    creditNoteAmount: number | null;
    creditReceivedAt: string | null;
    creditReceivedAtLabel: string;
    resolvedAt: string | null;
    resolvedAtLabel: string;
    lineCount: number;
    totalQuantity: number;
    claimAmount: number;
    remainingAmount: number;
    createdAt: string;
    createdAtLabel: string;
    lines: Array<{
      supplierClaimLineId: string;
      purchaseOrderLineId: string | null;
      goodsReceiptLineId: string | null;
      lineNo: number;
      productCode: string;
      productName: string;
      quantity: number;
      unitCost: number | null;
      reason: string;
      reasonLabel: string;
      note: string | null;
    }>;
  }>;
  supplierReturnRows: Array<{
    supplierReturnId: string;
    supplierReturnNo: string;
    purchaseOrderId: string | null;
    purchaseOrderNo: string | null;
    goodsReceiptId: string | null;
    goodsReceiptNo: string | null;
    supplierNo: string;
    supplierName: string;
    externalReference: string | null;
    reason: string;
    reasonLabel: string;
    status: string;
    statusLabel: string;
    note: string | null;
    operatorName: string;
    sourceNodeCode: string | null;
    totalQuantity: number;
    lineCount: number;
    returnedAt: string;
    returnedAtLabel: string;
    postedAt: string;
    postedAtLabel: string;
    cancelledAt: string | null;
    cancelledAtLabel: string;
    cancellationNote: string | null;
    cancellationOperatorName: string | null;
    cancellationAcknowledgedAt: string | null;
    cancellationAcknowledgedAtLabel: string;
    cancellationAcknowledgedByNodeCode: string | null;
    cancellationAcknowledgedBy: string | null;
    cancellationAcknowledgementNote: string | null;
    lines: Array<{
      supplierReturnLineId: string;
      lineNo: number;
      productCode: string;
      productName: string;
      quantity: number;
      unitCost: number | null;
      serialNumbers: string[];
    }>;
  }>;
  stockCountSessionRows: Array<{
    sessionId: string;
    sessionNo: string;
    status: string;
    productCode: string;
    productName: string;
    departmentCode: string | null;
    departmentName: string | null;
    categoryCode: string | null;
    categoryName: string | null;
    subcategory: string | null;
    isSerialized: boolean;
    previousQuantity: number;
    countedQuantity: number;
    varianceQuantity: number;
    previousSerialNumbers: string[];
    countedSerialNumbers: string[];
    operatorName: string;
    note: string | null;
    submittedByNodeCode: string | null;
    committedByNodeCode: string | null;
    submittedAt: string;
    submittedAtLabel: string;
    committedAt: string | null;
    committedAtLabel: string;
  }>;
  movementRows: Array<{
    entryId: string;
    productCode: string;
    productName: string;
    movementType: string;
    quantity: number;
    referenceLabel: string;
    sourceNodeCode: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  serialTraceRows: Array<{
    traceId: string;
    sourceType: string;
    activityLabel: string;
    productCode: string;
    productName: string;
    quantity: number;
    serialNumbers: string[];
    referenceLabel: string;
    statusLabel: string | null;
    note: string | null;
    href: string | null;
    occurredAt: string;
    occurredAtLabel: string;
  }>;
  serialRegistryRows: Array<{
    serialId: string;
    serialNumber: string;
    productCode: string;
    productName: string;
    status: string;
    sourceReferenceLabel: string | null;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  serialPostureMessages: string[];
  transferTargets: Array<{
    code: string;
    name: string;
    storeCode: string | null;
    storeName: string | null;
    locationType: string;
    defaults: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export async function getEnterpriseInventoryLocationDetail(
  locationCode: string
): Promise<EnterpriseInventoryLocationDetailData | null> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return null;
  }

  const location = await prisma.inventoryLocation.findFirst({
    where: {
      retailOrgId: enterpriseNode.retailOrgId,
      code: locationCode
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeId: true,
      locationType: true,
      status: true,
      useForSalesDefault: true,
      useForReceivingDefault: true,
      updatedAt: true,
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
  });

  if (!location) {
    return null;
  }

  const [
    primaryStoreNode,
    transferTargets,
    balanceGroups,
    recentEntries,
    ledgerEntryCount,
    departmentRows,
    categoryRows,
    serializedMovementEntries,
    receivingProducts,
    supplierRows,
    purchaseOrders,
    stockCountSessions,
    serialRegistryEntries,
    serializedGoodsReceipts,
    supplierClaims,
    supplierReturns
  ] =
    await Promise.all([
    location.storeId
      ? prisma.syncNode.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            storeId: location.storeId,
            nodeType: SyncNodeType.STORE_DESKTOP,
            status: RecordStatus.ACTIVE
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            code: true
          }
        })
      : Promise.resolve(null),
    location.storeId
      ? prisma.inventoryLocation.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            storeId: {
              not: location.storeId
            },
            status: RecordStatus.ACTIVE,
            NOT: {
              id: location.id
            }
          },
          orderBy: [{ useForReceivingDefault: "desc" }, { store: { name: "asc" } }, { name: "asc" }],
          select: {
            code: true,
            name: true,
            locationType: true,
            useForSalesDefault: true,
            useForReceivingDefault: true,
            store: {
              select: {
                code: true,
                name: true
              }
            }
          }
        })
      : Promise.resolve([]),
    prisma.inventoryLedgerEntry.groupBy({
      by: ["productId"],
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      _sum: {
        quantity: true
      },
      _max: {
        occurredAt: true
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        movementType: true,
        quantity: true,
        externalReference: true,
        referenceType: true,
        referenceId: true,
        sourceNodeCode: true,
        occurredAt: true,
        product: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.inventoryLedgerEntry.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      }
    }),
    prisma.productDepartment.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true
      }
    }),
    prisma.productCategory.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ department: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        department: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id,
        product: {
          isSerialized: true
        },
        referenceType: "POS_TRANSACTION"
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 18,
      select: {
        id: true,
        productId: true,
        movementType: true,
        quantity: true,
        referenceId: true,
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
    prisma.product.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        trackInventory: true
      },
      orderBy: [{ name: "asc" }],
      select: {
        code: true,
        sku: true,
        name: true,
        status: true,
        department: true,
        category: true,
        subcategory: true,
        isSerialized: true,
        baseCostPrice: true,
        supplierLinks: {
          where: {
            isPrimary: true
          },
          take: 1,
          select: {
            supplier: {
              select: {
                supplierNo: true,
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.supplier.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE
      },
      orderBy: [{ name: "asc" }],
      select: {
        supplierNo: true,
        name: true
      }
    }),
    prisma.purchaseOrder.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ updatedAt: "desc" }, { purchaseOrderNo: "desc" }],
      take: 24,
      select: {
        id: true,
        purchaseOrderNo: true,
        status: true,
        externalReference: true,
        note: true,
        operatorName: true,
        committedAt: true,
        closedAt: true,
        closureReason: true,
        closureNote: true,
        closureOperatorName: true,
        lines: {
          orderBy: {
            lineNo: "asc"
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
                isSerialized: true
              }
            }
          }
        },
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        }
      }
    }),
    prisma.stockCountSession.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ updatedAt: "desc" }, { sessionNo: "desc" }],
      take: 18,
      select: {
        id: true,
        sessionNo: true,
        status: true,
        previousQuantity: true,
        countedQuantity: true,
        varianceQuantity: true,
        previousSerialNumbersSnapshot: true,
        countedSerialNumbersSnapshot: true,
        note: true,
        operatorName: true,
        submittedByNodeCode: true,
        committedByNodeCode: true,
        submittedAt: true,
        committedAt: true,
        product: {
          select: {
            code: true,
            name: true,
            department: true,
            category: true,
            subcategory: true,
            isSerialized: true
          }
        }
      }
    }),
    prisma.inventorySerialUnit.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ updatedAt: "desc" }, { serialNumber: "asc" }],
      take: 60,
      select: {
        id: true,
        serialNumber: true,
        status: true,
        sourceReferenceLabel: true,
        updatedAt: true,
        product: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.goodsReceipt.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ postedAt: "desc" }],
      take: 12,
      select: {
        id: true,
        receiptNo: true,
        receivedAt: true,
        externalReference: true,
        note: true,
        operatorName: true,
        postedAt: true,
        sourceNodeCode: true,
        purchaseOrder: {
          select: {
            id: true,
            purchaseOrderNo: true
          }
        },
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
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
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.supplierClaim.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
      select: {
        id: true,
        claimNo: true,
        externalReference: true,
        status: true,
        note: true,
        operatorName: true,
        sourceNodeCode: true,
        supplierCaseReference: true,
        creditRequestedAt: true,
        creditRequestedBy: true,
        creditNoteReference: true,
        creditNoteAmount: true,
        creditReceivedAt: true,
        resolvedAt: true,
        createdAt: true,
        purchaseOrder: {
          select: {
            id: true,
            purchaseOrderNo: true
          }
        },
        goodsReceipt: {
          select: {
            id: true,
            receiptNo: true
          }
        },
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
          },
          select: {
            id: true,
            lineNo: true,
            quantity: true,
            unitCost: true,
            reason: true,
            note: true,
            purchaseOrderLineId: true,
            goodsReceiptLineId: true,
            product: {
              select: {
                code: true,
                name: true
              }
            }
          }
        }
      }
    }),
    prisma.supplierReturn.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: location.id
      },
      orderBy: [{ postedAt: "desc" }],
      take: 12,
      select: {
        id: true,
        supplierReturnNo: true,
        status: true,
        returnedAt: true,
        externalReference: true,
        reason: true,
        note: true,
        operatorName: true,
        postedAt: true,
        cancelledAt: true,
        cancellationNote: true,
        cancellationOperatorName: true,
        cancellationAcknowledgedAt: true,
        cancellationAcknowledgedByNodeCode: true,
        cancellationAcknowledgedBy: true,
        cancellationAcknowledgementNote: true,
        sourceNodeCode: true,
        purchaseOrder: {
          select: {
            id: true,
            purchaseOrderNo: true
          }
        },
        goodsReceipt: {
          select: {
            id: true,
            receiptNo: true
          }
        },
        supplier: {
          select: {
            supplierNo: true,
            name: true
          }
        },
        lines: {
          orderBy: {
            lineNo: "asc"
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
                name: true
              }
            }
          }
        }
      }
    })
  ]);

  const productIds = balanceGroups.map((group) => group.productId);
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: {
            id: {
              in: productIds
            }
          },
          select: {
            id: true,
            code: true,
            sku: true,
            name: true,
            status: true,
            department: true,
            category: true,
            subcategory: true,
            isSerialized: true,
            baseUnitPrice: true
          }
        })
      : [];

  const productById = new Map(products.map((product) => [product.id, product] as const));
  const productNameByCode = new Map(products.map((product) => [product.code, product.name] as const));
  const departmentNameByCode = new Map(
    departmentRows.map((department) => [department.code, department.name] as const)
  );
  const categoryByCode = new Map(
    categoryRows.map((category) => [
      category.code,
      {
        name: category.name,
        departmentCode: category.department.code,
        departmentName: category.department.name
      }
    ] as const)
  );

  for (const product of receivingProducts) {
    productNameByCode.set(product.code, product.name);
  }

  const balanceRows = balanceGroups
    .map((group) => {
      const product = productById.get(group.productId);

      if (!product) {
        return null;
      }

      const onHandQuantity = Number(Number(group._sum.quantity ?? 0).toFixed(3));
      const resolvedDepartmentCode = product.department?.trim() || null;
      const resolvedCategoryCode = product.category?.trim() || null;
      const resolvedDepartmentName =
        (resolvedDepartmentCode ? departmentNameByCode.get(resolvedDepartmentCode) : null) ??
        resolvedDepartmentCode;
      const resolvedCategory = resolvedCategoryCode
        ? categoryByCode.get(resolvedCategoryCode) ?? null
        : null;

      return {
        productCode: product.code,
        sku: product.sku,
        productName: product.name,
        status: product.status,
        departmentCode: resolvedDepartmentCode,
        departmentName:
          resolvedCategory?.departmentName ?? resolvedDepartmentName ?? null,
        categoryCode: resolvedCategoryCode,
        categoryName: resolvedCategory?.name ?? resolvedCategoryCode,
        subcategory: product.subcategory?.trim() || null,
        isSerialized: product.isSerialized,
        onHandQuantity,
        estimatedRetailValue: Number((onHandQuantity * Number(product.baseUnitPrice)).toFixed(2)),
        lastMovementAt: toIsoString(group._max.occurredAt ?? null),
        lastMovementAtLabel: formatRelativeTime(group._max.occurredAt ?? null)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => {
      if (left.onHandQuantity < 0 && right.onHandQuantity >= 0) {
        return -1;
      }

      if (right.onHandQuantity < 0 && left.onHandQuantity >= 0) {
        return 1;
      }

      if (right.onHandQuantity !== left.onHandQuantity) {
        return right.onHandQuantity - left.onHandQuantity;
      }

      return left.productName.localeCompare(right.productName);
    });

  const negativePositions = balanceRows.filter((row) => row.onHandQuantity < 0).length;
  const onHandQuantity = Number(
    balanceRows.reduce((sum, row) => sum + row.onHandQuantity, 0).toFixed(3)
  );
  const availableDepartments = departmentRows.map((department) => ({
    code: department.code,
    name: department.name
  }));
  const availableCategories = categoryRows.map((category) => ({
    code: category.code,
    name: category.name,
    departmentCode: category.department.code,
    departmentName: category.department.name
  })).sort((left, right) => {
    const departmentCompare = (left.departmentName ?? left.departmentCode ?? "").localeCompare(
      right.departmentName ?? right.departmentCode ?? ""
    );

    if (departmentCompare !== 0) {
      return departmentCompare;
    }

      return left.name.localeCompare(right.name);
  });
  const receivingProductRows = receivingProducts.map((product) => {
    const resolvedDepartmentCode = product.department?.trim() || null;
    const resolvedCategoryCode = product.category?.trim() || null;
    const resolvedDepartmentName =
      (resolvedDepartmentCode ? departmentNameByCode.get(resolvedDepartmentCode) : null) ??
      resolvedDepartmentCode;
    const resolvedCategory = resolvedCategoryCode
      ? categoryByCode.get(resolvedCategoryCode) ?? null
      : null;
    const primarySupplier = product.supplierLinks[0]?.supplier ?? null;

    return {
      productCode: product.code,
      sku: product.sku,
      productName: product.name,
      status: product.status,
      departmentCode: resolvedDepartmentCode,
      departmentName: resolvedCategory?.departmentName ?? resolvedDepartmentName ?? null,
      categoryCode: resolvedCategoryCode,
      categoryName: resolvedCategory?.name ?? resolvedCategoryCode,
      subcategory: product.subcategory?.trim() || null,
      isSerialized: product.isSerialized,
      defaultUnitCost:
        product.baseCostPrice === null ? null : Number(Number(product.baseCostPrice).toFixed(2)),
      primarySupplierNo: primarySupplier?.supplierNo ?? null,
      primarySupplierName: primarySupplier?.name ?? null
    };
  });
  const purchaseOrderRows = purchaseOrders.map((purchaseOrder) => {
    const lines = purchaseOrder.lines.map((line) => {
      const orderedQuantity = Number(Number(line.orderedQuantity).toFixed(3));
      const receivedQuantity = Number(Number(line.receivedQuantity).toFixed(3));
      const exceptionQuantity = Number(Number(line.exceptionQuantity).toFixed(3));
      const departmentCode = line.product.department?.trim() || null;
      const categoryCode = line.product.category?.trim() || null;

      return {
        purchaseOrderLineId: line.id,
        lineNo: line.lineNo,
        productCode: line.product.code,
        productName: line.product.name,
        departmentCode,
        departmentName:
          (departmentCode ? departmentNameByCode.get(departmentCode) : null) ?? departmentCode,
        categoryCode,
        categoryName: categoryCode ? (categoryByCode.get(categoryCode)?.name ?? categoryCode) : null,
        subcategory: line.product.subcategory?.trim() || null,
        isSerialized: line.product.isSerialized,
        orderedQuantity,
        receivedQuantity,
        exceptionQuantity,
        outstandingQuantity: Number(
          Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity).toFixed(3)
        ),
        unitCost: line.unitCost === null ? null : Number(line.unitCost)
      };
    });
    const orderedQuantity = Number(
      lines.reduce((sum, line) => sum + line.orderedQuantity, 0).toFixed(3)
    );
    const receivedQuantity = Number(
      lines.reduce((sum, line) => sum + line.receivedQuantity, 0).toFixed(3)
    );
    const exceptionQuantity = Number(
      lines.reduce((sum, line) => sum + line.exceptionQuantity, 0).toFixed(3)
    );

    return {
      purchaseOrderId: purchaseOrder.id,
      purchaseOrderNo: purchaseOrder.purchaseOrderNo,
      status: formatEnumLabel(purchaseOrder.status),
      supplierNo: purchaseOrder.supplier?.supplierNo ?? null,
      supplierName: purchaseOrder.supplier?.name ?? null,
      externalReference: purchaseOrder.externalReference,
      note: purchaseOrder.note,
      operatorName: purchaseOrder.operatorName,
      orderedQuantity,
      receivedQuantity,
      exceptionQuantity,
      outstandingQuantity: Number(
        Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity).toFixed(3)
      ),
      lineCount: lines.length,
      committedAt: toIsoString(purchaseOrder.committedAt),
      committedAtLabel: formatRelativeTime(purchaseOrder.committedAt),
      closedAt: toIsoString(purchaseOrder.closedAt),
      closedAtLabel: formatRelativeTime(purchaseOrder.closedAt),
      closureReason: purchaseOrder.closureReason,
      closureReasonLabel: purchaseOrder.closureReason
        ? formatEnumLabel(purchaseOrder.closureReason)
        : null,
      closureNote: purchaseOrder.closureNote,
      closureOperatorName: purchaseOrder.closureOperatorName,
      lines
    };
  });
  const supplierClaimRows = supplierClaims.map((supplierClaim) => {
    const lines = supplierClaim.lines.map((line) => ({
      supplierClaimLineId: line.id,
      purchaseOrderLineId: line.purchaseOrderLineId,
      goodsReceiptLineId: line.goodsReceiptLineId,
      lineNo: line.lineNo,
      productCode: line.product.code,
      productName: line.product.name,
      quantity: Number(Number(line.quantity).toFixed(3)),
      unitCost: line.unitCost === null ? null : Number(line.unitCost),
      reason: line.reason,
      reasonLabel: formatEnumLabel(line.reason),
      note: line.note
    }));
    const totalQuantity = Number(
      lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)
    );
    const claimAmount = calculateClaimAmount(
      lines.map((line) => ({
        quantity: line.quantity,
        unitCost: line.unitCost
      }))
    );
    const creditNoteAmount =
      supplierClaim.creditNoteAmount === null ? null : Number(supplierClaim.creditNoteAmount);
    const remainingAmount = Number(Math.max(0, claimAmount - (creditNoteAmount ?? 0)).toFixed(2));

    return {
      supplierClaimId: supplierClaim.id,
      claimNo: supplierClaim.claimNo,
      purchaseOrderId: supplierClaim.purchaseOrder?.id ?? null,
      purchaseOrderNo: supplierClaim.purchaseOrder?.purchaseOrderNo ?? null,
      goodsReceiptId: supplierClaim.goodsReceipt?.id ?? null,
      goodsReceiptNo: supplierClaim.goodsReceipt?.receiptNo ?? null,
      supplierNo: supplierClaim.supplier.supplierNo,
      supplierName: supplierClaim.supplier.name,
      externalReference: supplierClaim.externalReference,
      status: supplierClaim.status,
      statusLabel: formatEnumLabel(supplierClaim.status),
      note: supplierClaim.note,
      operatorName: supplierClaim.operatorName ?? "Flash ERP operator",
      sourceNodeCode: supplierClaim.sourceNodeCode,
      supplierCaseReference: supplierClaim.supplierCaseReference,
      creditRequestedAt: toIsoString(supplierClaim.creditRequestedAt),
      creditRequestedAtLabel: formatRelativeTime(supplierClaim.creditRequestedAt),
      creditRequestedBy: supplierClaim.creditRequestedBy,
      creditNoteReference: supplierClaim.creditNoteReference,
      creditNoteAmount,
      creditReceivedAt: toIsoString(supplierClaim.creditReceivedAt),
      creditReceivedAtLabel: formatRelativeTime(supplierClaim.creditReceivedAt),
      resolvedAt: toIsoString(supplierClaim.resolvedAt),
      resolvedAtLabel: formatRelativeTime(supplierClaim.resolvedAt),
      lineCount: lines.length,
      totalQuantity,
      claimAmount,
      remainingAmount,
      createdAt: supplierClaim.createdAt.toISOString(),
      createdAtLabel: formatRelativeTime(supplierClaim.createdAt),
      lines
    };
  });
  const goodsReceiptRows = serializedGoodsReceipts.map((receipt) => {
    const lines = receipt.lines.map((line) => ({
      goodsReceiptLineId: line.id,
      lineNo: line.lineNo,
      productCode: line.product.code,
      productName: line.product.name,
      quantity: Number(Number(line.quantity).toFixed(3)),
      unitCost: line.unitCost === null ? null : Number(line.unitCost),
      serialNumbers: readOptionalStringArray(line.serialNumbersSnapshot)
    }));
    const totalQuantity = Number(
      lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)
    );

    return {
      goodsReceiptId: receipt.id,
      goodsReceiptNo: receipt.receiptNo,
      purchaseOrderId: receipt.purchaseOrder?.id ?? null,
      purchaseOrderNo: receipt.purchaseOrder?.purchaseOrderNo ?? null,
      supplierNo: receipt.supplier?.supplierNo ?? null,
      supplierName: receipt.supplier?.name ?? null,
      externalReference: receipt.externalReference,
      note: receipt.note,
      operatorName: receipt.operatorName ?? "Flash ERP operator",
      sourceNodeCode: receipt.sourceNodeCode,
      totalQuantity,
      lineCount: lines.length,
      receivedAt: receipt.receivedAt.toISOString(),
      receivedAtLabel: formatRelativeTime(receipt.receivedAt),
      postedAt: receipt.postedAt.toISOString(),
      postedAtLabel: formatRelativeTime(receipt.postedAt),
      lines
    };
  });
  const supplierReturnRows = supplierReturns.map((supplierReturn) => {
    const lines = supplierReturn.lines.map((line) => ({
      supplierReturnLineId: line.id,
      lineNo: line.lineNo,
      productCode: line.product.code,
      productName: line.product.name,
      quantity: Number(Number(line.quantity).toFixed(3)),
      unitCost: line.unitCost === null ? null : Number(line.unitCost),
      serialNumbers: readOptionalStringArray(line.serialNumbersSnapshot)
    }));
    const totalQuantity = Number(
      lines.reduce((sum, line) => sum + line.quantity, 0).toFixed(3)
    );

    return {
      supplierReturnId: supplierReturn.id,
      supplierReturnNo: supplierReturn.supplierReturnNo,
      purchaseOrderId: supplierReturn.purchaseOrder?.id ?? null,
      purchaseOrderNo: supplierReturn.purchaseOrder?.purchaseOrderNo ?? null,
      goodsReceiptId: supplierReturn.goodsReceipt?.id ?? null,
      goodsReceiptNo: supplierReturn.goodsReceipt?.receiptNo ?? null,
      supplierNo: supplierReturn.supplier.supplierNo,
      supplierName: supplierReturn.supplier.name,
      externalReference: supplierReturn.externalReference,
      reason: supplierReturn.reason,
      reasonLabel: formatEnumLabel(supplierReturn.reason),
      status: supplierReturn.status,
      statusLabel: formatEnumLabel(supplierReturn.status),
      note: supplierReturn.note,
      operatorName: supplierReturn.operatorName ?? "Flash ERP operator",
      sourceNodeCode: supplierReturn.sourceNodeCode,
      totalQuantity,
      lineCount: lines.length,
      returnedAt: supplierReturn.returnedAt.toISOString(),
      returnedAtLabel: formatRelativeTime(supplierReturn.returnedAt),
      postedAt: supplierReturn.postedAt.toISOString(),
      postedAtLabel: formatRelativeTime(supplierReturn.postedAt),
      cancelledAt: toIsoString(supplierReturn.cancelledAt),
      cancelledAtLabel: formatRelativeTime(supplierReturn.cancelledAt),
      cancellationNote: supplierReturn.cancellationNote,
      cancellationOperatorName: supplierReturn.cancellationOperatorName,
      cancellationAcknowledgedAt: toIsoString(supplierReturn.cancellationAcknowledgedAt),
      cancellationAcknowledgedAtLabel: formatRelativeTime(
        supplierReturn.cancellationAcknowledgedAt
      ),
      cancellationAcknowledgedByNodeCode: supplierReturn.cancellationAcknowledgedByNodeCode,
      cancellationAcknowledgedBy: supplierReturn.cancellationAcknowledgedBy,
      cancellationAcknowledgementNote: supplierReturn.cancellationAcknowledgementNote,
      lines
    };
  });
  const stockCountSessionRows = stockCountSessions.map((session) => {
    const departmentCode = session.product.department?.trim() || null;
    const categoryCode = session.product.category?.trim() || null;

    return {
      sessionId: session.id,
      sessionNo: session.sessionNo,
      status: formatEnumLabel(session.status),
      productCode: session.product.code,
      productName: session.product.name,
      departmentCode,
      departmentName:
        (departmentCode ? departmentNameByCode.get(departmentCode) : null) ?? departmentCode,
      categoryCode,
      categoryName: categoryCode ? (categoryByCode.get(categoryCode)?.name ?? categoryCode) : null,
      subcategory: session.product.subcategory?.trim() || null,
      isSerialized: session.product.isSerialized,
      previousQuantity: Number(Number(session.previousQuantity).toFixed(3)),
      countedQuantity: Number(Number(session.countedQuantity).toFixed(3)),
      varianceQuantity: Number(Number(session.varianceQuantity).toFixed(3)),
      previousSerialNumbers: readOptionalStringArray(session.previousSerialNumbersSnapshot),
      countedSerialNumbers: readOptionalStringArray(session.countedSerialNumbersSnapshot),
      operatorName: session.operatorName,
      note: session.note,
      submittedByNodeCode: session.submittedByNodeCode,
      committedByNodeCode: session.committedByNodeCode,
      submittedAt: session.submittedAt.toISOString(),
      submittedAtLabel: formatRelativeTime(session.submittedAt),
      committedAt: toIsoString(session.committedAt),
      committedAtLabel: formatRelativeTime(session.committedAt)
    };
  });
  const serializedTransactionIds = [
    ...new Set(serializedMovementEntries.map((entry) => entry.referenceId))
  ];
  const serializedTransactionProductIds = [
    ...new Set(serializedMovementEntries.map((entry) => entry.productId))
  ];
  const serializedTransactionLines =
    serializedTransactionIds.length > 0 && serializedTransactionProductIds.length > 0
      ? await prisma.posTransactionLine.findMany({
          where: {
            posTransactionId: {
              in: serializedTransactionIds
            },
            productId: {
              in: serializedTransactionProductIds
            }
          },
          orderBy: [{ posTransaction: { completedAt: "desc" } }, { createdAt: "desc" }],
          select: {
            id: true,
            posTransactionId: true,
            productId: true,
            lineIntent: true,
            quantity: true,
            productCodeSnapshot: true,
            productNameSnapshot: true,
            serialNumbersSnapshot: true,
            posTransaction: {
              select: {
                transactionNo: true,
                transactionType: true,
                completedAt: true
              }
            }
          }
        })
      : [];
  const serialTransactionLinesByReference = new Map<
    string,
    typeof serializedTransactionLines
  >();

  for (const line of serializedTransactionLines) {
    const serialNumbers = readOptionalStringArray(line.serialNumbersSnapshot);

    if (serialNumbers.length === 0) {
      continue;
    }

    const key = `${line.posTransactionId}:${line.productId}`;
    const existingLines = serialTransactionLinesByReference.get(key);

    if (existingLines) {
      existingLines.push(line);
      continue;
    }

    serialTransactionLinesByReference.set(key, [line]);
  }

  const recentSerialTaskEvents =
    primaryStoreNode?.code
      ? await prisma.syncOutboxEvent.findMany({
          where: {
            syncNodeId: enterpriseNode.id,
            targetNodeCode: primaryStoreNode.code,
            aggregateType: "syncTask",
            eventType: "sync.task.requested"
          },
          orderBy: [{ createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            aggregateId: true,
            status: true,
            payload: true,
            createdAt: true,
            acknowledgedAt: true
          }
        })
      : [];

  const rawTaskTraceRows = recentSerialTaskEvents
    .map((event) => {
      const payload = isRecord(event.payload) ? event.payload : null;

      if (!payload) {
        return null;
      }

      const locationCodeFromPayload = readOptionalString(payload.locationCode);
      const targetLocationCode = readOptionalString(payload.targetLocationCode);

      if (
        locationCodeFromPayload !== location.code &&
        targetLocationCode !== location.code
      ) {
        return null;
      }

      const replacementPayload = isRecord(payload.replacementPayload)
        ? payload.replacementPayload
        : null;
      const serialNumbers = [
        ...new Set([
          ...readOptionalStringArray(payload.serialNumbers),
          ...readOptionalStringArray(replacementPayload?.serialNumbers)
        ])
      ];

      if (serialNumbers.length === 0) {
        return null;
      }

      const taskType = readOptionalString(payload.taskType);
      const productCode =
        readOptionalString(payload.productCode) ??
        readOptionalString(replacementPayload?.productCode) ??
        "Unknown";
      const quantityValue =
        typeof payload.quantity === "number"
          ? payload.quantity
          : typeof replacementPayload?.quantity === "number"
            ? replacementPayload.quantity
            : serialNumbers.length;
      const requestedAt =
        readOptionalString(payload.requestedAt) ?? event.createdAt.toISOString();

      return {
        traceId: event.id,
        sourceType: "Enterprise task",
        activityLabel: buildTaskSerialActivityLabel({
          taskType,
          currentLocationCode: location.code,
          locationCode: locationCodeFromPayload,
          targetLocationCode
        }),
        taskType,
        productCode,
        quantity: Number(Number(quantityValue).toFixed(3)),
        serialNumbers,
        referenceLabel:
          readOptionalString(payload.title) ??
          `${formatEnumLabel(taskType ?? "SYNC_TASK")} • ${event.aggregateId.slice(0, 8)}`,
        statusLabel: event.acknowledgedAt
          ? "Acknowledged by store"
          : formatEnumLabel(event.status),
        note: readOptionalString(payload.note),
        occurredAt: requestedAt,
        occurredAtLabel: formatRelativeTime(new Date(requestedAt))
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const missingTaskProductCodes = rawTaskTraceRows
    .map((row) => row.productCode)
    .filter((productCode) => !productNameByCode.has(productCode));
  const missingTaskProducts =
    missingTaskProductCodes.length > 0
      ? await prisma.product.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: {
              in: [...new Set(missingTaskProductCodes)]
            }
          },
          select: {
            code: true,
            name: true
          }
        })
      : [];

  for (const product of missingTaskProducts) {
    productNameByCode.set(product.code, product.name);
  }

  const postedSerialTraceRows = serializedMovementEntries.flatMap((entry) => {
    const matchingLines =
      serialTransactionLinesByReference.get(`${entry.referenceId}:${entry.productId}`) ?? [];

    return matchingLines.map((line) => ({
      traceId: `${entry.id}:${line.id}`,
      sourceType: "POS transaction",
      activityLabel: buildPostedSerialActivityLabel(
        line.posTransaction.transactionType,
        line.lineIntent
      ),
      productCode: line.productCodeSnapshot,
      productName: line.productNameSnapshot,
      quantity: Number(Number(line.quantity).toFixed(3)),
      serialNumbers: readOptionalStringArray(line.serialNumbersSnapshot),
      referenceLabel: entry.externalReference ?? line.posTransaction.transactionNo,
      statusLabel: formatEnumLabel(line.posTransaction.transactionType),
      note: `Posted as ${formatEnumLabel(entry.movementType)} into ${location.name}.`,
      href: `/pos/transactions/${encodeURIComponent(line.posTransaction.transactionNo)}`,
      occurredAt:
        line.posTransaction.completedAt?.toISOString() ?? entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(line.posTransaction.completedAt ?? entry.occurredAt)
    }));
  });
  const goodsReceiptSerialTraceRows = serializedGoodsReceipts.flatMap((receipt) =>
    receipt.lines.flatMap((line) => {
      const serialNumbers = readOptionalStringArray(line.serialNumbersSnapshot);

      if (serialNumbers.length === 0) {
        return [];
      }

      return [
        {
          traceId: `${receipt.id}:${line.product.code}`,
          sourceType: "Goods receipt",
          activityLabel: "Received serialized stock",
          productCode: line.product.code,
          productName: line.product.name,
          quantity: Number(Number(line.quantity).toFixed(3)),
          serialNumbers,
          referenceLabel: receipt.externalReference ?? receipt.receiptNo,
          statusLabel: "Posted",
          note: `Recorded directly in Flash ERP enterprise for ${location.name}.`,
          href: null,
          occurredAt: receipt.postedAt.toISOString(),
          occurredAtLabel: formatRelativeTime(receipt.postedAt)
        }
      ];
    })
  );
  const supplierReturnSerialTraceRows = supplierReturnRows.flatMap((supplierReturn) =>
    supplierReturn.lines.flatMap((line) =>
      line.serialNumbers.length > 0
        ? [
            {
              traceId: `${supplierReturn.supplierReturnId}:${line.supplierReturnLineId}`,
              sourceType: "Supplier return",
              activityLabel: "Returned serialized stock to supplier",
              productCode: line.productCode,
              productName: line.productName,
              quantity: line.quantity,
              serialNumbers: line.serialNumbers,
              referenceLabel: supplierReturn.externalReference ?? supplierReturn.supplierReturnNo,
              statusLabel:
                supplierReturn.status === "CANCELLED"
                  ? `${supplierReturn.reasonLabel} • ${supplierReturn.statusLabel}`
                  : supplierReturn.reasonLabel,
              note:
                supplierReturn.cancellationNote ??
                supplierReturn.note ??
                `${supplierReturn.operatorName} returned serialized stock from ${location.name}.`,
              href: null,
              occurredAt: supplierReturn.postedAt,
              occurredAtLabel: supplierReturn.postedAtLabel
            }
          ]
        : []
    )
  );
  const taskSerialTraceRows = rawTaskTraceRows.map((row) => ({
    traceId: row.traceId,
    sourceType: row.sourceType,
    activityLabel: row.activityLabel,
    productCode: row.productCode,
    productName: productNameByCode.get(row.productCode) ?? row.productCode,
    quantity: row.quantity,
    serialNumbers: row.serialNumbers,
    referenceLabel: row.referenceLabel,
    statusLabel: row.statusLabel,
    note: row.note,
    href: null,
    occurredAt: row.occurredAt,
    occurredAtLabel: row.occurredAtLabel
  }));
  const stockCountSerialTraceRows = stockCountSessionRows
    .filter((session) => session.countedSerialNumbers.length > 0)
    .map((session) => ({
      traceId: `${session.sessionId}:stock-count`,
      sourceType: "Stock count session",
      activityLabel:
        session.status === "Committed"
          ? "Committed serialized stock count"
          : "Submitted serialized stock count",
      productCode: session.productCode,
      productName: session.productName,
      quantity: session.countedQuantity,
      serialNumbers: session.countedSerialNumbers,
      referenceLabel: session.sessionNo,
      statusLabel: session.status,
      note:
        session.note ??
        `${session.operatorName} counted serialized stock in ${location.name} from the shop side.`,
      href: null,
      occurredAt: session.committedAt ?? session.submittedAt,
      occurredAtLabel: formatRelativeTime(
        new Date(session.committedAt ?? session.submittedAt)
      )
    }));
  const serialTraceRows = [
    ...postedSerialTraceRows,
    ...goodsReceiptSerialTraceRows,
    ...supplierReturnSerialTraceRows,
    ...taskSerialTraceRows,
    ...stockCountSerialTraceRows
  ]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 24);
  const serialRegistryRows = serialRegistryEntries.map((entry) => ({
    serialId: entry.id,
    serialNumber: entry.serialNumber,
    productCode: entry.product.code,
    productName: entry.product.name,
    status: entry.status,
    sourceReferenceLabel: entry.sourceReferenceLabel,
    updatedAt: entry.updatedAt.toISOString(),
    updatedAtLabel: formatRelativeTime(entry.updatedAt)
  }));
  const serializedBalanceRows = balanceRows.filter((row) => row.isSerialized);
  const serializedOnHandQuantity = Number(
    serializedBalanceRows.reduce((sum, row) => sum + row.onHandQuantity, 0).toFixed(3)
  );
  const serialPostureMessages = [
    "Flash ERP now keeps a canonical enterprise serial registry for this location while the store desktop continues to validate live offline execution at the branch.",
    serialRegistryRows.length > 0
      ? `${serialRegistryRows.length} live serial unit${
          serialRegistryRows.length === 1 ? "" : "s"
        } are currently indexed in the enterprise registry for this location.`
      : "No live serial registry rows are currently indexed for this location yet.",
    serializedBalanceRows.length > 0
      ? `${serializedBalanceRows.length} serialized product position${
          serializedBalanceRows.length === 1 ? "" : "s"
        } are currently visible here, covering ${serializedOnHandQuantity.toFixed(3)} canonical unit(s).`
      : "No serialized balances are currently visible in this canonical location posture.",
    serialTraceRows.length > 0
      ? `${postedSerialTraceRows.length} posted POS serial trace(s), ${goodsReceiptSerialTraceRows.length} goods-receipt trace(s), ${supplierReturnSerialTraceRows.length} supplier-return trace(s), ${taskSerialTraceRows.length} enterprise-issued serial task trace(s), and ${stockCountSerialTraceRows.length} shop-led stock count trace(s) are currently available for this location.`
      : "No recent serial traces have been posted or queued for this location yet."
  ];

  return {
    currencyCode: enterpriseNode.retailOrg.baseCurrencyCode,
    location: {
      code: location.code,
      name: location.name,
      locationType: location.locationType,
      status: location.status,
      defaults: getLocationDefaults(location),
      storeCode: location.store?.code ?? null,
      storeName: location.store?.name ?? null,
      primaryNodeCode: primaryStoreNode?.code ?? null,
      warehouseCode: location.warehouse?.code ?? null,
      warehouseName: location.warehouse?.name ?? null,
      updatedAt: location.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(location.updatedAt)
    },
    metrics: {
      productsTracked: balanceRows.filter((row) => row.onHandQuantity !== 0).length,
      onHandQuantity,
      ledgerEntries: ledgerEntryCount,
      negativePositions
    },
    availableDepartments,
    availableCategories,
    availableSuppliers: supplierRows.map((supplier) => ({
      supplierNo: supplier.supplierNo,
      name: supplier.name
    })),
    balanceRows,
    receivingProductRows,
    purchaseOrderRows,
    goodsReceiptRows,
    supplierReturnRows,
    supplierClaimRows,
    stockCountSessionRows,
    movementRows: recentEntries.map((entry) => ({
      entryId: entry.id,
      productCode: entry.product.code,
      productName: entry.product.name,
      movementType: entry.movementType,
      quantity: Number(entry.quantity),
      referenceLabel:
        entry.externalReference ??
        `${entry.referenceType.toLowerCase().replace(/_/g, " ")} • ${entry.referenceId.slice(0, 8)}`,
      sourceNodeCode: entry.sourceNodeCode,
      occurredAt: entry.occurredAt.toISOString(),
      occurredAtLabel: formatRelativeTime(entry.occurredAt)
    })),
    serialTraceRows,
    serialRegistryRows,
    serialPostureMessages,
    postureMessages: [
      negativePositions > 0
        ? `${negativePositions} product balances are below zero in this location and should be investigated.`
        : "No negative balances are visible in this canonical location snapshot.",
      location.useForSalesDefault
        ? "This location is configured as a default sales bucket for store-side posting."
        : "This location is not marked as a default sales bucket yet.",
      location.useForReceivingDefault
        ? "This location is configured as a default receiving bucket for inbound stock."
        : "This location is not marked as a default receiving bucket yet."
    ],
    transferTargets: transferTargets.map((target) => ({
      code: target.code,
      name: target.name,
      storeCode: target.store?.code ?? null,
      storeName: target.store?.name ?? null,
      locationType: target.locationType,
      defaults: getLocationDefaults(target)
    })),
    priorities: [
      negativePositions > 0
        ? "Reconcile the negative balances before approving further corrections or replay for this location."
        : "Review the top on-hand products here and confirm the physical count still matches the canonical ledger.",
      ledgerEntryCount === 0
        ? "Seed or capture the first canonical movement for this location so sync posture is easier to validate."
        : "Use the recent movement trail to confirm which node and reference created the latest stock changes.",
      location.store?.code
        ? "Cross-check this location against the parent store workspace if node health and stock posture drift apart."
        : "Attach this location to a store workflow if it should participate in live Flash ERP stock movement."
    ],
    statusMessage: `This Flash ERP location is backed by ${ledgerEntryCount} canonical ledger entries and ${balanceRows.length} tracked product positions.`,
    refreshedAt: new Date().toISOString()
  };
}
