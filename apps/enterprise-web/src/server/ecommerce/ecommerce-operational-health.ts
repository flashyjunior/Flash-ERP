import { Prisma } from "@prisma/client";
import { InterStoreTransferStatus } from "@flash-erp/domain";

import { prisma } from "@/lib/db/prisma";
import {
  ensureInterStoreTransferSchemaCompatibility,
  ensureMultiBranchEcommerceSchemaCompatibility,
} from "@/server/repositories/schema-compatibility.repository";

export type EcommerceOperationalHealthSeverity = "warning" | "critical";
export type EcommerceOperationalHealthStatus = "healthy" | "attention" | "critical";

type EcommerceOperationalHealthIncident = {
  key:
    | "STALE_RESERVATIONS"
    | "FAILED_PAYMENTS"
    | "BLOCKED_NETWORK_TRANSFERS"
    | "AGED_FULFILMENT_QUEUE"
    | "RESERVED_STOCK_SHORTFALL"
    | "UNRESOLVED_RESERVED_STOCK"
    | "HEALTH_SCAN_LIMIT";
  severity: EcommerceOperationalHealthSeverity;
  count: number;
  oldestAt: string | null;
  detail: string;
};

type HealthSignal = {
  count: number;
  oldestAt: Date | null;
  detail: string;
};

type EcommerceOperationalHealthInput = {
  checkedAt: Date;
  thresholds: {
    staleReservationHours: number;
    paymentFailureWindowHours: number;
    blockedTransferHours: number;
    queueAgeHours: number;
  };
  scan: {
    limit: number;
    scannedActiveReservations: number;
    activeReservationCount: number;
    activeOrderCount: number;
  };
  staleReservations: HealthSignal;
  failedPayments: HealthSignal;
  blockedTransfers: HealthSignal;
  agedFulfilments: HealthSignal;
  reservedStockShortfalls: HealthSignal;
  unresolvedReservedStock: HealthSignal;
};

export type EcommerceOperationalHealthSnapshot = {
  status: EcommerceOperationalHealthStatus;
  checkedAt: string;
  thresholds: EcommerceOperationalHealthInput["thresholds"];
  scan: EcommerceOperationalHealthInput["scan"] & { limited: boolean };
  incidents: EcommerceOperationalHealthIncident[];
};

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function toQuantity(value: number | Prisma.Decimal | null | undefined) {
  return Number(Number(value ?? 0).toFixed(3));
}

function normalizedCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function inventoryPositionKey(
  inventoryLocationId: string,
  productId: string,
  productVariantId?: string | null,
) {
  return `${inventoryLocationId}:${productId}:${productVariantId ?? ""}`;
}

function oldestDate(values: Array<Date | null | undefined>) {
  const dates = values.filter((value): value is Date => value instanceof Date);
  return dates.length > 0
    ? dates.reduce((oldest, value) => value < oldest ? value : oldest)
    : null;
}

function operationalOrderWhere(
  retailOrgId: string,
  storefrontStoreId: string,
): Prisma.EcommerceOrderWhereInput {
  return {
    retailOrgId,
    OR: [{ storeId: storefrontStoreId }, { storefrontStoreId }],
  };
}

function healthIncident(
  key: EcommerceOperationalHealthIncident["key"],
  severity: EcommerceOperationalHealthSeverity,
  signal: HealthSignal,
) {
  if (signal.count <= 0) return null;
  return {
    key,
    severity,
    count: signal.count,
    oldestAt: signal.oldestAt?.toISOString() ?? null,
    detail: signal.detail,
  } satisfies EcommerceOperationalHealthIncident;
}

export function buildEcommerceOperationalHealth(
  input: EcommerceOperationalHealthInput,
): EcommerceOperationalHealthSnapshot {
  const incidents = [
    healthIncident(
      "STALE_RESERVATIONS",
      "warning",
      input.staleReservations,
    ),
    healthIncident("FAILED_PAYMENTS", "warning", input.failedPayments),
    healthIncident("BLOCKED_NETWORK_TRANSFERS", "warning", input.blockedTransfers),
    healthIncident("AGED_FULFILMENT_QUEUE", "warning", input.agedFulfilments),
    healthIncident(
      "RESERVED_STOCK_SHORTFALL",
      "critical",
      input.reservedStockShortfalls,
    ),
    healthIncident(
      "UNRESOLVED_RESERVED_STOCK",
      "critical",
      input.unresolvedReservedStock,
    ),
  ].filter((incident): incident is EcommerceOperationalHealthIncident => incident !== null);

  const limited =
    input.scan.scannedActiveReservations < input.scan.activeReservationCount ||
    input.scan.activeOrderCount > input.scan.limit;
  if (limited) {
    incidents.push({
      key: "HEALTH_SCAN_LIMIT",
      severity: "warning",
      count: Math.max(
        input.scan.activeReservationCount - input.scan.scannedActiveReservations,
        input.scan.activeOrderCount - input.scan.limit,
        1,
      ),
      oldestAt: null,
      detail: `The current process sampled ${input.scan.limit} operational records. Narrow the active queue or raise the configured health scan limit before relying on a complete inventory shortfall scan.`,
    });
  }

  const status: EcommerceOperationalHealthStatus = incidents.some(
    (incident) => incident.severity === "critical",
  )
    ? "critical"
    : incidents.length > 0
      ? "attention"
      : "healthy";

  return {
    status,
    checkedAt: input.checkedAt.toISOString(),
    thresholds: input.thresholds,
    scan: { ...input.scan, limited },
    incidents,
  };
}

export async function getEcommerceOperationalHealth(input: {
  retailOrgId: string;
  storefrontStoreId: string;
}) {
  await Promise.all([
    ensureMultiBranchEcommerceSchemaCompatibility(),
    ensureInterStoreTransferSchemaCompatibility(),
  ]);

  const checkedAt = new Date();
  const thresholds = {
    staleReservationHours: positiveInteger(
      process.env.FLASH_ERP_ECOMMERCE_STALE_RESERVATION_HOURS,
      24,
      24 * 90,
    ),
    paymentFailureWindowHours: positiveInteger(
      process.env.FLASH_ERP_ECOMMERCE_PAYMENT_FAILURE_WINDOW_HOURS,
      24,
      24 * 30,
    ),
    blockedTransferHours: positiveInteger(
      process.env.FLASH_ERP_ECOMMERCE_BLOCKED_TRANSFER_HOURS,
      12,
      24 * 30,
    ),
    queueAgeHours: positiveInteger(
      process.env.FLASH_ERP_ECOMMERCE_QUEUE_AGE_HOURS,
      12,
      24 * 90,
    ),
  };
  const scanLimit = positiveInteger(
    process.env.FLASH_ERP_ECOMMERCE_HEALTH_SCAN_LIMIT,
    500,
    5_000,
  );
  const orderWhere = operationalOrderWhere(input.retailOrgId, input.storefrontStoreId);
  const activeOrderWhere: Prisma.EcommerceOrderWhereInput = {
    ...orderWhere,
    status: { notIn: ["CANCELLED", "DELIVERED"] },
  };
  const staleReservationBefore = new Date(
    checkedAt.getTime() - thresholds.staleReservationHours * 60 * 60 * 1_000,
  );
  const failedPaymentAfter = new Date(
    checkedAt.getTime() - thresholds.paymentFailureWindowHours * 60 * 60 * 1_000,
  );
  const blockedTransferBefore = new Date(
    checkedAt.getTime() - thresholds.blockedTransferHours * 60 * 60 * 1_000,
  );
  const agedFulfilmentBefore = new Date(
    checkedAt.getTime() - thresholds.queueAgeHours * 60 * 60 * 1_000,
  );
  const reservationWhere: Prisma.SalesOrderInventoryReservationWhereInput = {
    status: "ACTIVE",
    salesOrder: { ecommerceOrder: { is: orderWhere } },
  };

  const [
    activeReservationCount,
    staleReservationCount,
    reservations,
    failedPaymentCount,
    failedPayments,
    agedFulfilmentCount,
    agedFulfilments,
    activeOrderCount,
    activeOrders,
  ] = await Promise.all([
    prisma.salesOrderInventoryReservation.count({ where: reservationWhere }),
    prisma.salesOrderInventoryReservation.count({
      where: { ...reservationWhere, createdAt: { lt: staleReservationBefore } },
    }),
    prisma.salesOrderInventoryReservation.findMany({
      where: reservationWhere,
      orderBy: { createdAt: "asc" },
      take: scanLimit + 1,
      select: {
        inventoryLocationId: true,
        inventoryLocationCodeSnapshot: true,
        productCodeSnapshot: true,
        productVariantCodeSnapshot: true,
        baseQuantity: true,
        createdAt: true,
        salesOrder: { select: { orderNo: true } },
      },
    }),
    prisma.ecommercePayment.count({
      where: {
        status: "FAILED",
        failedAt: { gte: failedPaymentAfter },
        ecommerceOrder: { is: orderWhere },
      },
    }),
    prisma.ecommercePayment.findMany({
      where: {
        status: "FAILED",
        failedAt: { gte: failedPaymentAfter },
        ecommerceOrder: { is: orderWhere },
      },
      orderBy: { failedAt: "asc" },
      take: scanLimit + 1,
      select: {
        failedAt: true,
        failureMessage: true,
        ecommerceOrder: { select: { orderNo: true } },
      },
    }),
    prisma.ecommerceFulfillment.count({
      where: {
        ecommerceOrder: { is: orderWhere },
        fulfilledAt: null,
        cancelledAt: null,
        assignedAt: { lt: agedFulfilmentBefore },
      },
    }),
    prisma.ecommerceFulfillment.findMany({
      where: {
        ecommerceOrder: { is: orderWhere },
        fulfilledAt: null,
        cancelledAt: null,
        assignedAt: { lt: agedFulfilmentBefore },
      },
      orderBy: { assignedAt: "asc" },
      take: scanLimit + 1,
      select: {
        assignedAt: true,
        status: true,
        storeNameSnapshot: true,
        ecommerceOrder: { select: { orderNo: true } },
      },
    }),
    prisma.ecommerceOrder.count({ where: activeOrderWhere }),
    prisma.ecommerceOrder.findMany({
      where: activeOrderWhere,
      orderBy: { placedAt: "asc" },
      take: scanLimit + 1,
      select: { orderNo: true },
    }),
  ]);

  const scannedReservations = reservations.slice(0, scanLimit);
  const scannedOrders = activeOrders.slice(0, scanLimit);
  const productCodes = [
    ...new Set(scannedReservations.map((reservation) => normalizedCode(reservation.productCodeSnapshot))),
  ].filter(Boolean);
  const products = productCodes.length > 0
    ? await prisma.product.findMany({
        where: { retailOrgId: input.retailOrgId, code: { in: productCodes } },
        select: {
          id: true,
          code: true,
          productType: true,
          trackInventory: true,
          matrixVariants: { select: { id: true, code: true } },
        },
      })
    : [];
  const productsByCode = new Map(products.map((product) => [normalizedCode(product.code), product]));
  const reservedByPosition = new Map<string, {
    quantity: number;
    locationCode: string | null;
    productCode: string;
    variantCode: string | null;
    orderNo: string;
  }>();
  let unresolvedReservedStockCount = 0;

  for (const reservation of scannedReservations) {
    const product = productsByCode.get(normalizedCode(reservation.productCodeSnapshot));
    const variantCode = normalizedCode(reservation.productVariantCodeSnapshot);
    const variant = variantCode
      ? product?.matrixVariants.find((candidate) => normalizedCode(candidate.code) === variantCode)
      : null;
    if (
      !reservation.inventoryLocationId ||
      !product ||
      !product.trackInventory ||
      product.productType.trim().toUpperCase() === "SERVICE" ||
      (variantCode && !variant)
    ) {
      if (!product || !reservation.inventoryLocationId || (variantCode && !variant)) {
        unresolvedReservedStockCount += 1;
      }
      continue;
    }

    const key = inventoryPositionKey(
      reservation.inventoryLocationId,
      product.id,
      variant?.id,
    );
    const current = reservedByPosition.get(key);
    reservedByPosition.set(key, {
      quantity: toQuantity((current?.quantity ?? 0) + Number(reservation.baseQuantity)),
      locationCode: reservation.inventoryLocationCodeSnapshot,
      productCode: reservation.productCodeSnapshot,
      variantCode: reservation.productVariantCodeSnapshot,
      orderNo: current?.orderNo ?? reservation.salesOrder.orderNo,
    });
  }

  const positions = [...reservedByPosition.keys()].map((key) => key.split(":"));
  const inventoryLocationIds = [...new Set(positions.map(([locationId]) => locationId))];
  const productIds = [...new Set(positions.map(([, productId]) => productId))];
  const stockPositions = inventoryLocationIds.length > 0 && productIds.length > 0
    ? await prisma.inventoryLedgerEntry.groupBy({
        by: ["inventoryLocationId", "productId", "productVariantId"],
        where: {
          retailOrgId: input.retailOrgId,
          inventoryLocationId: { in: inventoryLocationIds },
          productId: { in: productIds },
        },
        _sum: { quantity: true },
      })
    : [];
  const onHandByPosition = new Map(stockPositions.map((position) => [
    inventoryPositionKey(position.inventoryLocationId, position.productId, position.productVariantId),
    toQuantity(position._sum.quantity),
  ]));
  const stockShortfalls = [...reservedByPosition.entries()].flatMap(([key, reservation]) => {
    const onHand = onHandByPosition.get(key) ?? 0;
    return onHand + 0.0001 < reservation.quantity
      ? [{ ...reservation, onHand }]
      : [];
  });

  const blockedTransfers = scannedOrders.length > 0
    ? await prisma.interStoreTransfer.findMany({
        where: {
          retailOrgId: input.retailOrgId,
          externalReference: { in: scannedOrders.map((order) => order.orderNo) },
          workflowType: "ECOMMERCE_NETWORK_ALLOCATION",
          requestedAt: { lt: blockedTransferBefore },
          status: {
            notIn: [
              InterStoreTransferStatus.RECEIVED,
              InterStoreTransferStatus.CLOSED,
              InterStoreTransferStatus.CANCELLED,
            ],
          },
        },
        orderBy: { requestedAt: "asc" },
        take: scanLimit + 1,
        select: {
          requestedAt: true,
          transferNo: true,
          status: true,
          externalReference: true,
        },
      })
    : [];

  const firstStaleReservation = scannedReservations.find(
    (reservation) => reservation.createdAt < staleReservationBefore,
  );
  const firstPaymentFailure = failedPayments[0];
  const firstAgedFulfilment = agedFulfilments[0];
  const firstBlockedTransfer = blockedTransfers[0];
  const firstStockShortfall = stockShortfalls[0];

  return buildEcommerceOperationalHealth({
    checkedAt,
    thresholds,
    scan: {
      limit: scanLimit,
      scannedActiveReservations: scannedReservations.length,
      activeReservationCount,
      activeOrderCount,
    },
    staleReservations: {
      count: staleReservationCount,
      oldestAt: firstStaleReservation?.createdAt ?? null,
      detail: firstStaleReservation
        ? `${firstStaleReservation.salesOrder.orderNo} has held an active reservation since ${firstStaleReservation.createdAt.toLocaleString()}.`
        : "Active reservations have exceeded the configured age threshold.",
    },
    failedPayments: {
      count: failedPaymentCount,
      oldestAt: firstPaymentFailure?.failedAt ?? null,
      detail: firstPaymentFailure
        ? `${firstPaymentFailure.ecommerceOrder.orderNo}: ${firstPaymentFailure.failureMessage ?? "payment verification failed"}`
        : "Recent payment verification failures need review.",
    },
    blockedTransfers: {
      count: Math.min(blockedTransfers.length, scanLimit),
      oldestAt: firstBlockedTransfer?.requestedAt ?? null,
      detail: firstBlockedTransfer
        ? `${firstBlockedTransfer.transferNo} for ${firstBlockedTransfer.externalReference ?? "an ecommerce order"} remains ${firstBlockedTransfer.status}.`
        : "Network transfers have exceeded the configured receipt threshold.",
    },
    agedFulfilments: {
      count: agedFulfilmentCount,
      oldestAt: firstAgedFulfilment?.assignedAt ?? null,
      detail: firstAgedFulfilment
        ? `${firstAgedFulfilment.ecommerceOrder.orderNo} remains ${firstAgedFulfilment.status} at ${firstAgedFulfilment.storeNameSnapshot}.`
        : "Assigned fulfilments have exceeded the configured queue-age threshold.",
    },
    reservedStockShortfalls: {
      count: stockShortfalls.length,
      oldestAt: null,
      detail: firstStockShortfall
        ? `${firstStockShortfall.productCode}${firstStockShortfall.variantCode ? ` (${firstStockShortfall.variantCode})` : ""} at ${firstStockShortfall.locationCode ?? "its source location"}: ${firstStockShortfall.quantity} reserved, ${firstStockShortfall.onHand} on hand.`
        : "Active ecommerce reservations exceed the ledger balance at one or more source locations.",
    },
    unresolvedReservedStock: {
      count: unresolvedReservedStockCount,
      oldestAt: null,
      detail: "Active ecommerce reservations reference a missing inventory location, product, or product variant.",
    },
  });
}
