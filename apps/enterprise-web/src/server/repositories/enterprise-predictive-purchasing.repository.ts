import { readJsonObject } from "./json-field";


import { prisma } from "@/lib/db/prisma";
import {
  getEnterpriseCurrencyCode,
  resolveEnterpriseCurrencyCode
} from "@/server/repositories/enterprise-currency";
import {
  InventoryMovementType,
  PurchaseOrderStatus,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";


const averageIssueDays = 30;
const demandLookbackDays = 90;
const shortTrendDays = 14;
const longTrendDays = 56;
const planningBufferDays = 3;
const openPurchaseOrderStatuses: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.COMMITTED,
  PurchaseOrderStatus.PART_RECEIVED
];
const outboundMovementTypes: InventoryMovementType[] = [
  InventoryMovementType.SALE,
  InventoryMovementType.RETURN_TO_VENDOR,
  InventoryMovementType.STOCK_TRANSFER_OUT,
  InventoryMovementType.ADJUSTMENT_NEGATIVE
];

export type PredictivePurchaseOrderRow = {
  predictionId: string;
  severity: "critical" | "warning" | "missing_supplier";
  storeCode: string;
  storeName: string;
  locationCode: string;
  locationName: string;
  productCode: string;
  productName: string;
  supplierNo: string | null;
  supplierName: string | null;
  onHandQuantity: number;
  openPurchaseOrderQuantity: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  safetyStockLevel: number | null;
  averageDailyIssue: number;
  forecastDailyDemand: number;
  forecast14DayDemand: number;
  forecast30DayDemand: number;
  demandTrendPercent: number;
  demandConfidence: number;
  demandConfidenceLabel: "High" | "Medium" | "Low";
  demandSignal: "rising" | "stable" | "falling" | "sparse";
  demandModel: string;
  leadTimeDays: number;
  coverDays: number | null;
  projectedStockoutDate: string | null;
  projectedStockoutLabel: string;
  recommendedQuantity: number;
  unitCost: number | null;
  estimatedOrderValue: number;
  reason: string;
};

export type PredictivePurchaseOrderSnapshot = {
  currencyCode: string;
  rows: PredictivePurchaseOrderRow[];
  summary: {
    recommendations: number;
    critical: number;
    missingSupplier: number;
    estimatedOrderValue: number;
    averageDemandConfidence: number;
    risingDemand: number;
  };
  refreshedAt: string;
};

type DemandForecastSignal = {
  forecastDailyDemand: number;
  forecast14DayDemand: number;
  forecast30DayDemand: number;
  demandTrendPercent: number;
  demandConfidence: number;
  demandConfidenceLabel: "High" | "Medium" | "Low";
  demandSignal: "rising" | "stable" | "falling" | "sparse";
  demandModel: string;
};

function toNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundPercent(value: number) {
  return Number(value.toFixed(1));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function toDayLabel(value: Date | null) {
  if (!value) {
    return "No depletion date";
  }

  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function buildStockPositionKey(locationId: string, productId: string) {
  return `${locationId}:${productId}`;
}

function buildEmptyDemandForecast(): DemandForecastSignal {
  return {
    forecastDailyDemand: 0,
    forecast14DayDemand: 0,
    forecast30DayDemand: 0,
    demandTrendPercent: 0,
    demandConfidence: 0,
    demandConfidenceLabel: "Low",
    demandSignal: "sparse",
    demandModel: "weighted-moving-average-v1"
  };
}

function buildDemandForecastByPosition(
  movements: Array<{
    inventoryLocationId: string;
    productId: string;
    quantity: unknown;
    occurredAt: Date;
  }>,
  now: Date
) {
  const shortStart = addDays(now, -shortTrendDays);
  const longStart = addDays(now, -longTrendDays);
  const forecastByPosition = new Map<string, DemandForecastSignal>();
  const grouped = new Map<
    string,
    {
      shortQuantity: number;
      longQuantity: number;
      totalQuantity: number;
      activeDays: Set<string>;
    }
  >();

  for (const movement of movements) {
    const key = buildStockPositionKey(movement.inventoryLocationId, movement.productId);
    const bucket =
      grouped.get(key) ??
      {
        shortQuantity: 0,
        longQuantity: 0,
        totalQuantity: 0,
        activeDays: new Set<string>()
      };
    const quantity = Math.abs(Number(movement.quantity ?? 0));

    bucket.totalQuantity += quantity;
    bucket.activeDays.add(movement.occurredAt.toISOString().slice(0, 10));

    if (movement.occurredAt >= longStart) {
      bucket.longQuantity += quantity;
    }

    if (movement.occurredAt >= shortStart) {
      bucket.shortQuantity += quantity;
    }

    grouped.set(key, bucket);
  }

  for (const [key, bucket] of grouped) {
    const shortDailyDemand = bucket.shortQuantity / shortTrendDays;
    const longDailyDemand = bucket.longQuantity / longTrendDays;
    const lookbackDailyDemand = bucket.totalQuantity / demandLookbackDays;
    const weightedDailyDemand =
      shortDailyDemand * 0.5 + longDailyDemand * 0.3 + lookbackDailyDemand * 0.2;
    const fallbackDailyDemand = Math.max(shortDailyDemand, longDailyDemand, lookbackDailyDemand);
    const forecastDailyDemand = weightedDailyDemand > 0 ? weightedDailyDemand : fallbackDailyDemand;
    const demandTrendPercent =
      longDailyDemand > 0
        ? ((shortDailyDemand - longDailyDemand) / longDailyDemand) * 100
        : shortDailyDemand > 0
          ? 100
          : 0;
    const activeDayCount = bucket.activeDays.size;
    const confidence = clamp(
      25 +
        Math.min(45, activeDayCount * 5) +
        Math.min(25, bucket.totalQuantity) -
        Math.min(20, Math.abs(demandTrendPercent) * 0.08),
      10,
      95
    );
    const demandConfidenceLabel =
      confidence >= 75 ? "High" : confidence >= 50 ? "Medium" : "Low";
    const demandSignal =
      activeDayCount < 3
        ? "sparse"
        : demandTrendPercent >= 20
          ? "rising"
          : demandTrendPercent <= -20
            ? "falling"
            : "stable";

    forecastByPosition.set(key, {
      forecastDailyDemand: roundQuantity(forecastDailyDemand),
      forecast14DayDemand: roundQuantity(forecastDailyDemand * 14),
      forecast30DayDemand: roundQuantity(forecastDailyDemand * 30),
      demandTrendPercent: roundPercent(demandTrendPercent),
      demandConfidence: roundPercent(confidence),
      demandConfidenceLabel,
      demandSignal,
      demandModel: "weighted-moving-average-v1"
    });
  }

  return forecastByPosition;
}

export async function getPredictivePurchaseOrderSnapshot(input?: {
  storeCode?: string | null;
  limit?: number;
}): Promise<PredictivePurchaseOrderSnapshot> {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true,
      retailOrg: {
        select: {
          baseCurrencyCode: true,
          companySettingsJson: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return {
      currencyCode: await getEnterpriseCurrencyCode(),
      rows: [],
      summary: {
        recommendations: 0,
        critical: 0,
        missingSupplier: 0,
        estimatedOrderValue: 0,
        averageDemandConfidence: 0,
        risingDemand: 0
      },
      refreshedAt: new Date().toISOString()
    };
  }

  const currencyCode = resolveEnterpriseCurrencyCode(enterpriseNode.retailOrg);
  const normalizedStoreCode = input?.storeCode?.trim() ?? "";
  const now = new Date();
  const averageIssueStart = addDays(now, -averageIssueDays);
  const demandLookbackStart = addDays(now, -demandLookbackDays);

  const [locations, products] = await Promise.all([
    prisma.inventoryLocation.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: RecordStatus.ACTIVE,
        storeId: {
          not: null
        },
        ...(normalizedStoreCode
          ? {
              store: {
                code: {
                  equals: normalizedStoreCode
                }
              }
            }
          : {})
      },
      orderBy: [
        { store: { name: "asc" } },
        { useForReceivingDefault: "desc" },
        { name: "asc" }
      ],
      select: {
        id: true,
        code: true,
        name: true,
        store: {
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
        trackInventory: true,
        OR: [
          { reorderPoint: { not: null } },
          { reorderQuantity: { not: null } },
          { safetyStockLevel: { not: null } },
          { minStockLevel: { not: null } }
        ]
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        minStockLevel: true,
        reorderPoint: true,
        reorderQuantity: true,
        safetyStockLevel: true,
        baseCostPrice: true,
        supplierLinks: {
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          select: {
            packCostPrice: true,
            leadTimeDays: true,
            minimumOrderQuantity: true,
            isPrimary: true,
            supplier: {
              select: {
                supplierNo: true,
                name: true,
                leadTimeDays: true,
                status: true,
                deletedAt: true
              }
            }
          }
        }
      }
    })
  ]);

  const locationIds = locations.map((location) => location.id);
  const productIds = products.map((product) => product.id);

  if (locationIds.length === 0 || productIds.length === 0) {
    return {
      currencyCode,
      rows: [],
      summary: {
        recommendations: 0,
        critical: 0,
        missingSupplier: 0,
        estimatedOrderValue: 0,
        averageDemandConfidence: 0,
        risingDemand: 0
      },
      refreshedAt: now.toISOString()
    };
  }

  const [balanceGroups, issueGroups, demandMovements, openPurchaseOrderLines] = await Promise.all([
    prisma.inventoryLedgerEntry.groupBy({
      by: ["inventoryLocationId", "productId"],
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: {
          in: locationIds
        },
        productId: {
          in: productIds
        }
      },
      _sum: {
        quantity: true
      }
    }),
    prisma.inventoryLedgerEntry.groupBy({
      by: ["inventoryLocationId", "productId"],
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: {
          in: locationIds
        },
        productId: {
          in: productIds
        },
        occurredAt: {
          gte: averageIssueStart
        },
        movementType: {
          in: outboundMovementTypes
        }
      },
      _sum: {
        quantity: true
      }
    }),
    prisma.inventoryLedgerEntry.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        inventoryLocationId: {
          in: locationIds
        },
        productId: {
          in: productIds
        },
        occurredAt: {
          gte: demandLookbackStart
        },
        movementType: {
          in: outboundMovementTypes
        }
      },
      select: {
        inventoryLocationId: true,
        productId: true,
        quantity: true,
        occurredAt: true
      }
    }),
    prisma.purchaseOrderLine.findMany({
      where: {
        productId: {
          in: productIds
        },
        purchaseOrder: {
          retailOrgId: enterpriseNode.retailOrgId,
          inventoryLocationId: {
            in: locationIds
          },
          status: {
            in: openPurchaseOrderStatuses
          }
        }
      },
      select: {
        productId: true,
        orderedQuantity: true,
        receivedQuantity: true,
        exceptionQuantity: true,
        purchaseOrder: {
          select: {
            inventoryLocationId: true
          }
        }
      }
    })
  ]);

  const balanceByPosition = new Map(
    balanceGroups.map((group) => [
      buildStockPositionKey(group.inventoryLocationId, group.productId),
      Number(group._sum.quantity ?? 0)
    ])
  );
  const issueByPosition = new Map(
    issueGroups.map((group) => [
      buildStockPositionKey(group.inventoryLocationId, group.productId),
      Math.abs(Number(group._sum.quantity ?? 0)) / averageIssueDays
    ])
  );
  const demandForecastByPosition = buildDemandForecastByPosition(demandMovements, now);
  const openQuantityByPosition = new Map<string, number>();

  for (const line of openPurchaseOrderLines) {
    const orderedQuantity = Number(line.orderedQuantity);
    const receivedQuantity = Number(line.receivedQuantity);
    const exceptionQuantity = Number(line.exceptionQuantity);
    const outstandingQuantity = Math.max(0, orderedQuantity - receivedQuantity - exceptionQuantity);
    const key = buildStockPositionKey(line.purchaseOrder.inventoryLocationId, line.productId);
    openQuantityByPosition.set(key, (openQuantityByPosition.get(key) ?? 0) + outstandingQuantity);
  }

  const rows: PredictivePurchaseOrderRow[] = [];

  for (const location of locations) {
    if (!location.store) {
      continue;
    }

    for (const product of products) {
      const key = buildStockPositionKey(location.id, product.id);
      const onHandQuantity = roundQuantity(balanceByPosition.get(key) ?? 0);
      const averageDailyIssue = roundQuantity(issueByPosition.get(key) ?? 0);
      const demandForecast = demandForecastByPosition.get(key) ?? buildEmptyDemandForecast();
      const forecastDailyDemand = Math.max(demandForecast.forecastDailyDemand, averageDailyIssue);
      const openPurchaseOrderQuantity = roundQuantity(openQuantityByPosition.get(key) ?? 0);
      const reorderPoint = toNumber(product.reorderPoint ?? product.minStockLevel);
      const safetyStockLevel = toNumber(product.safetyStockLevel);
      const reorderQuantity = toNumber(product.reorderQuantity);
      const activeSupplierLink =
        product.supplierLinks.find(
          (link) => link.supplier.status === RecordStatus.ACTIVE && link.supplier.deletedAt === null
        ) ?? null;
      const leadTimeDays = activeSupplierLink?.leadTimeDays ?? activeSupplierLink?.supplier.leadTimeDays ?? 7;
      const projectedStockAfterLeadTime = onHandQuantity - forecastDailyDemand * leadTimeDays;
      const safetyFloor = safetyStockLevel ?? reorderPoint ?? 0;
      const isAtReorderPoint = reorderPoint !== null && onHandQuantity <= reorderPoint;
      const isProjectedBelowSafety =
        forecastDailyDemand > 0 && projectedStockAfterLeadTime <= safetyFloor;

      if (!isAtReorderPoint && !isProjectedBelowSafety) {
        continue;
      }

      const coverDays =
        forecastDailyDemand > 0 ? roundQuantity(Math.max(0, onHandQuantity) / forecastDailyDemand) : null;
      const projectedStockoutDate =
        forecastDailyDemand > 0 && coverDays !== null ? addDays(now, Math.ceil(coverDays)) : null;
      const baseRecommendation = Math.max(
        reorderQuantity ?? 0,
        safetyFloor + forecastDailyDemand * (leadTimeDays + planningBufferDays) - onHandQuantity
      );
      const minimumOrderQuantity = toNumber(activeSupplierLink?.minimumOrderQuantity);
      const recommendedQuantity = roundQuantity(
        Math.max(0, baseRecommendation, minimumOrderQuantity ?? 0) - openPurchaseOrderQuantity
      );

      if (recommendedQuantity <= 0) {
        continue;
      }

      const unitCost = toNumber(activeSupplierLink?.packCostPrice ?? product.baseCostPrice);
      const severity: PredictivePurchaseOrderRow["severity"] = activeSupplierLink
        ? onHandQuantity <= safetyFloor
          ? "critical"
          : "warning"
        : "missing_supplier";
      const reason = activeSupplierLink
        ? isAtReorderPoint
          ? `${location.store.name} is at or below reorder level for ${product.name}.`
          : `${product.name} is projected to fall below safety stock before supplier lead time completes. Forecast demand is ${forecastDailyDemand.toFixed(3)} per day with ${demandForecast.demandConfidenceLabel.toLowerCase()} confidence.`
        : `${product.name} needs a primary active supplier before Flash ERP can raise a predictive PO.`;

      rows.push({
        predictionId: `${location.code}:${product.code}:${activeSupplierLink?.supplier.supplierNo ?? "NO_SUPPLIER"}`,
        severity,
        storeCode: location.store.code,
        storeName: location.store.name,
        locationCode: location.code,
        locationName: location.name,
        productCode: product.code,
        productName: product.name,
        supplierNo: activeSupplierLink?.supplier.supplierNo ?? null,
        supplierName: activeSupplierLink?.supplier.name ?? null,
        onHandQuantity,
        openPurchaseOrderQuantity,
        reorderPoint: reorderPoint === null ? null : roundQuantity(reorderPoint),
        reorderQuantity: reorderQuantity === null ? null : roundQuantity(reorderQuantity),
        safetyStockLevel: safetyStockLevel === null ? null : roundQuantity(safetyStockLevel),
        averageDailyIssue,
        forecastDailyDemand: roundQuantity(forecastDailyDemand),
        forecast14DayDemand: demandForecast.forecast14DayDemand,
        forecast30DayDemand: demandForecast.forecast30DayDemand,
        demandTrendPercent: demandForecast.demandTrendPercent,
        demandConfidence: demandForecast.demandConfidence,
        demandConfidenceLabel: demandForecast.demandConfidenceLabel,
        demandSignal: demandForecast.demandSignal,
        demandModel: demandForecast.demandModel,
        leadTimeDays,
        coverDays,
        projectedStockoutDate: projectedStockoutDate?.toISOString() ?? null,
        projectedStockoutLabel: toDayLabel(projectedStockoutDate),
        recommendedQuantity,
        unitCost,
        estimatedOrderValue: roundMoney(recommendedQuantity * (unitCost ?? 0)),
        reason
      });
    }
  }

  const sortedRows = rows
    .sort((left, right) => {
      const severityWeight = { critical: 0, missing_supplier: 1, warning: 2 };
      const severityDiff = severityWeight[left.severity] - severityWeight[right.severity];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return right.estimatedOrderValue - left.estimatedOrderValue;
    })
    .slice(0, Math.max(1, input?.limit ?? 80));

  return {
    currencyCode,
    rows: sortedRows,
    summary: {
      recommendations: sortedRows.length,
      critical: sortedRows.filter((row) => row.severity === "critical").length,
      missingSupplier: sortedRows.filter((row) => row.severity === "missing_supplier").length,
      averageDemandConfidence: roundPercent(
        sortedRows.length
          ? sortedRows.reduce((sum, row) => sum + row.demandConfidence, 0) / sortedRows.length
          : 0
      ),
      risingDemand: sortedRows.filter((row) => row.demandSignal === "rising").length,
      estimatedOrderValue: roundMoney(
        sortedRows.reduce((sum, row) => sum + row.estimatedOrderValue, 0)
      )
    },
    refreshedAt: now.toISOString()
  };
}
