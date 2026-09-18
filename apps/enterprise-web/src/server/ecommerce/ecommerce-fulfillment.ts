import { Prisma } from "@prisma/client";
import { calculateLayawayAvailableBaseQuantity } from "@flash-erp/domain";

import { EcommerceAuthError } from "@/server/ecommerce/ecommerce-customer-auth";

export type EcommerceFulfilmentMethod = "DELIVERY" | "PICKUP";

export type EcommerceStorefrontContext = {
  id: string;
  retailOrgId: string;
  code: string;
  name: string;
  shortName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  ecommerceAllowPickup: boolean;
  ecommerceAllowDelivery: boolean;
};

export type EcommerceFulfillmentCandidate = {
  configurationId: string | null;
  retailOrgId: string;
  storefrontStoreId: string;
  store: {
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
  };
  inventoryLocation: {
    id: string;
    code: string;
    name: string;
  };
  supportsPickup: boolean;
  supportsDelivery: boolean;
  routingPriority: number;
  routingMethod: "PRIORITY_STOCK" | "PICKUP_SELECTION" | "DEFAULT_LOCATION";
};

export type EcommerceStockLine = {
  product: {
    id: string;
    code: string;
    name: string;
    productType: string;
    trackInventory: boolean;
    safetyStockLevel?: Prisma.Decimal | number | null;
  };
  variant: {
    id: string;
    code: string;
    displayName: string | null;
  } | null;
  baseQuantity: number;
};

export type EcommerceNetworkAllocation = {
  lineIndex: number;
  candidate: EcommerceFulfillmentCandidate;
  baseQuantity: number;
};

export type EcommerceFulfillmentPlan = Omit<EcommerceFulfillmentCandidate, "routingMethod"> & {
  routingMethod:
    | "PRIORITY_STOCK"
    | "PICKUP_SELECTION"
    | "DEFAULT_LOCATION"
    | "NETWORK_TRANSFER";
  allocations: EcommerceNetworkAllocation[];
  requiresInterStoreTransfer: boolean;
};

type EcommerceInventoryClient = Pick<
  Prisma.TransactionClient,
  "ecommerceFulfillmentLocation" | "inventoryLedgerEntry" | "inventoryLocation" | "salesOrderInventoryReservation"
>;

function toQuantity(value: number | Prisma.Decimal | string | null | undefined) {
  return Number(Number(value ?? 0).toFixed(3));
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isStockManagedProduct(product: EcommerceStockLine["product"]) {
  return Boolean(product.trackInventory) && product.productType.trim().toUpperCase() !== "SERVICE";
}

function positionKey(productId: string, productVariantId?: string | null) {
  return `${productId}:${productVariantId ?? ""}`;
}

function reservationKey(productCode: string, productVariantCode?: string | null) {
  return `${productCode.trim().toUpperCase()}:${productVariantCode?.trim().toUpperCase() ?? ""}`;
}

export function calculateEcommerceSellableBaseQuantity(input: {
  onHandBaseQuantity: number;
  activeReservedBaseQuantity: number;
  safetyStockBaseQuantity?: number | null;
}) {
  const afterReservations = calculateLayawayAvailableBaseQuantity({
    onHandBaseQuantity: input.onHandBaseQuantity,
    activeReservedBaseQuantity: input.activeReservedBaseQuantity,
  });
  return toQuantity(Math.max(0, afterReservations - toQuantity(input.safetyStockBaseQuantity)));
}

export type EcommerceNetworkAvailabilityPosition = {
  inventoryLocationId: string;
  onHandBaseQuantity: number;
  activeReservedBaseQuantity: number;
  safetyStockBaseQuantity?: number | null;
};

export function calculateEcommerceNetworkSellableBaseQuantity(
  positions: EcommerceNetworkAvailabilityPosition[],
) {
  const usableBeforeReservations = positions.reduce(
    (sum, position) =>
      sum + Math.max(
        0,
        toQuantity(position.onHandBaseQuantity) - toQuantity(position.safetyStockBaseQuantity),
      ),
    0,
  );
  const activeReservations = positions.reduce(
    (sum, position) => sum + Math.max(0, toQuantity(position.activeReservedBaseQuantity)),
    0,
  );

  // A received ecommerce transfer moves physical stock while its active reservation
  // deliberately remains at the source until POS fulfilment. Reconcile the whole
  // eligible network so that transferred reserved stock cannot become sellable again.
  return toQuantity(Math.max(0, usableBeforeReservations - activeReservations));
}

export function calculateEcommerceNetworkAvailabilityByLocation(
  positions: EcommerceNetworkAvailabilityPosition[],
) {
  const availabilityByLocation = new Map<string, number>();
  let remainingNetworkAvailability = calculateEcommerceNetworkSellableBaseQuantity(positions);

  for (const position of positions) {
    const localAvailability = calculateEcommerceSellableBaseQuantity(position);
    const availableQuantity = toQuantity(Math.min(localAvailability, remainingNetworkAvailability));
    availabilityByLocation.set(position.inventoryLocationId, availableQuantity);
    remainingNetworkAvailability = toQuantity(
      Math.max(0, remainingNetworkAvailability - availableQuantity),
    );
  }

  return availabilityByLocation;
}

export async function getEcommerceFulfillmentCandidates(
  client: EcommerceInventoryClient,
  storefrontStore: EcommerceStorefrontContext,
  fulfilmentMethod?: EcommerceFulfilmentMethod,
  pickupStoreCode?: string | null,
): Promise<EcommerceFulfillmentCandidate[]> {
  const configuredLocations = await client.ecommerceFulfillmentLocation.findMany({
    where: {
      retailOrgId: storefrontStore.retailOrgId,
      storefrontStoreId: storefrontStore.id,
      status: "ACTIVE",
      store: { status: "ACTIVE", salesEnabled: true },
      inventoryLocation: { status: "ACTIVE" },
    },
    orderBy: [{ routingPriority: "asc" }, { store: { name: "asc" } }, { inventoryLocation: { name: "asc" } }],
    select: {
      id: true,
      supportsPickup: true,
      supportsDelivery: true,
      routingPriority: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
          shortName: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
        },
      },
      inventoryLocation: { select: { id: true, code: true, name: true } },
    },
  });

  const candidates: EcommerceFulfillmentCandidate[] = configuredLocations.map((location) => ({
    configurationId: location.id,
    retailOrgId: storefrontStore.retailOrgId,
    storefrontStoreId: storefrontStore.id,
    store: location.store,
    inventoryLocation: location.inventoryLocation,
    supportsPickup: location.supportsPickup,
    supportsDelivery: location.supportsDelivery,
    routingPriority: location.routingPriority,
    routingMethod: "PRIORITY_STOCK",
  }));

  // Existing shops remain operational until a supervisor explicitly configures their network.
  if (candidates.length === 0) {
    const defaultLocation = await client.inventoryLocation.findFirst({
      where: { storeId: storefrontStore.id, status: "ACTIVE" },
      orderBy: [
        { useForSalesOrderDefault: "desc" },
        { useForSalesDefault: "desc" },
        { name: "asc" },
      ],
      select: { id: true, code: true, name: true },
    });
    if (defaultLocation) {
      candidates.push({
        configurationId: null,
        retailOrgId: storefrontStore.retailOrgId,
        storefrontStoreId: storefrontStore.id,
        store: {
          id: storefrontStore.id,
          code: storefrontStore.code,
          name: storefrontStore.name,
          shortName: storefrontStore.shortName,
          addressLine1: storefrontStore.addressLine1,
          addressLine2: storefrontStore.addressLine2,
          city: storefrontStore.city,
          region: storefrontStore.region,
        },
        inventoryLocation: defaultLocation,
        supportsPickup: storefrontStore.ecommerceAllowPickup,
        supportsDelivery: storefrontStore.ecommerceAllowDelivery,
        routingPriority: 100,
        routingMethod: "DEFAULT_LOCATION",
      });
    }
  }

  const expectedPickupStoreCode = optionalText(pickupStoreCode)?.toUpperCase();
  return candidates.filter((candidate) => {
    if (fulfilmentMethod === "PICKUP" && !candidate.supportsPickup) return false;
    if (fulfilmentMethod === "DELIVERY" && !candidate.supportsDelivery) return false;
    return !expectedPickupStoreCode || candidate.store.code.toUpperCase() === expectedPickupStoreCode;
  });
}

async function getCandidateAvailability(
  client: EcommerceInventoryClient,
  candidates: EcommerceFulfillmentCandidate[],
  lines: EcommerceStockLine[],
  fulfilmentMethod: EcommerceFulfilmentMethod,
  reservationScopeCandidates: EcommerceFulfillmentCandidate[] = candidates,
) {
  const inventoryLines = lines.filter((line) => isStockManagedProduct(line.product));
  const availableByCandidatePosition = new Map<string, number>();
  if (inventoryLines.length === 0 || candidates.length === 0) {
    return availableByCandidatePosition;
  }

  const productIds = [...new Set(inventoryLines.map((line) => line.product.id))];
  const inventoryLocationIds = [
    ...new Set(reservationScopeCandidates.map((candidate) => candidate.inventoryLocation.id)),
  ];
  const stockPositions = await client.inventoryLedgerEntry.groupBy({
    by: ["inventoryLocationId", "productId", "productVariantId"],
    where: {
      retailOrgId: candidates[0].retailOrgId,
      inventoryLocationId: { in: inventoryLocationIds },
      productId: { in: productIds },
    },
    _sum: { quantity: true },
  });
  const onHandByLocationPosition = new Map<string, number>(
    stockPositions.map((position) => [
      `${position.inventoryLocationId}:${positionKey(position.productId, position.productVariantId)}`,
      toQuantity(position._sum.quantity),
    ] as const),
  );

  const productCodes = [...new Set(inventoryLines.map((line) => line.product.code))];
  const activeReservations = await client.salesOrderInventoryReservation.findMany({
    where: {
      inventoryLocationId: { in: inventoryLocationIds },
      status: "ACTIVE",
      productCodeSnapshot: { in: productCodes },
    },
    select: {
      inventoryLocationId: true,
      productCodeSnapshot: true,
      productVariantCodeSnapshot: true,
      baseQuantity: true,
    },
  });
  const reservedByLocationSnapshot = new Map<string, number>();
  for (const reservation of activeReservations) {
    const key = `${reservation.inventoryLocationId ?? ""}:${reservationKey(
      reservation.productCodeSnapshot,
      reservation.productVariantCodeSnapshot,
    )}`;
    reservedByLocationSnapshot.set(
      key,
      toQuantity((reservedByLocationSnapshot.get(key) ?? 0) + Number(reservation.baseQuantity)),
    );
  }

  const seenPositions = new Set<string>();
  for (const line of inventoryLines) {
    const itemPositionKey = positionKey(line.product.id, line.variant?.id);
    if (seenPositions.has(itemPositionKey)) continue;
    seenPositions.add(itemPositionKey);

    const networkPositions = reservationScopeCandidates.map((candidate) => {
      const locationPrefix = `${candidate.inventoryLocation.id}:`;
      return {
        inventoryLocationId: candidate.inventoryLocation.id,
        onHandBaseQuantity:
          onHandByLocationPosition.get(`${locationPrefix}${itemPositionKey}`) ?? 0,
        activeReservedBaseQuantity:
          reservedByLocationSnapshot.get(
            `${locationPrefix}${reservationKey(line.product.code, line.variant?.code)}`,
          ) ?? 0,
        safetyStockBaseQuantity: Number(line.product.safetyStockLevel ?? 0),
      };
    });
    const networkAvailability = calculateEcommerceNetworkSellableBaseQuantity(networkPositions);
    const deliveryAvailabilityByLocation = calculateEcommerceNetworkAvailabilityByLocation(
      networkPositions.filter((position) =>
        candidates.some((candidate) => candidate.inventoryLocation.id === position.inventoryLocationId),
      ),
    );

    for (const candidate of candidates) {
      const locationPrefix = `${candidate.inventoryLocation.id}:`;
      const localAvailability = calculateEcommerceSellableBaseQuantity({
        onHandBaseQuantity:
          onHandByLocationPosition.get(`${locationPrefix}${itemPositionKey}`) ?? 0,
        activeReservedBaseQuantity:
          reservedByLocationSnapshot.get(
            `${locationPrefix}${reservationKey(line.product.code, line.variant?.code)}`,
          ) ?? 0,
        safetyStockBaseQuantity: Number(line.product.safetyStockLevel ?? 0),
      });
      availableByCandidatePosition.set(
        `${locationPrefix}${itemPositionKey}`,
        fulfilmentMethod === "PICKUP"
          ? toQuantity(Math.min(localAvailability, networkAvailability))
          : deliveryAvailabilityByLocation.get(candidate.inventoryLocation.id) ?? 0,
      );
    }
  }

  return availableByCandidatePosition;
}

function orderLineLabel(line: EcommerceStockLine) {
  return line.variant
    ? `${line.product.name} (${line.variant.displayName ?? line.variant.code})`
    : line.product.name;
}

export async function resolveEcommerceFulfillmentPlan(
  client: EcommerceInventoryClient,
  storefrontStore: EcommerceStorefrontContext,
  lines: EcommerceStockLine[],
  input: {
    fulfilmentMethod: EcommerceFulfilmentMethod;
    pickupStoreCode?: string | null;
    preferredDestinationInventoryLocationId?: string | null;
    actionLabel: string;
  },
): Promise<EcommerceFulfillmentPlan> {
  const candidates = await getEcommerceFulfillmentCandidates(
    client,
    storefrontStore,
    input.fulfilmentMethod,
    input.pickupStoreCode,
  );
  if (candidates.length === 0) {
    throw new EcommerceAuthError(
      input.fulfilmentMethod === "PICKUP"
        ? "Choose an available pickup shop."
        : "No fulfilment location is currently configured for delivery.",
      409,
    );
  }
  if (
    input.fulfilmentMethod === "PICKUP" &&
    !optionalText(input.pickupStoreCode) &&
    candidates.length > 1
  ) {
    throw new EcommerceAuthError("Choose the shop where you will collect this order.", 409);
  }

  const inventoryLines = lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(({ line }) => isStockManagedProduct(line.product));
  const reservationScopeCandidates = input.fulfilmentMethod === "PICKUP"
    ? await getEcommerceFulfillmentCandidates(client, storefrontStore)
    : candidates;
  const availableByCandidatePosition = await getCandidateAvailability(
    client,
    candidates,
    lines,
    input.fulfilmentMethod,
    reservationScopeCandidates,
  );
  const availableFor = (candidate: EcommerceFulfillmentCandidate, line: EcommerceStockLine) =>
    availableByCandidatePosition.get(
      `${candidate.inventoryLocation.id}:${positionKey(line.product.id, line.variant?.id)}`,
    ) ?? 0;

  const preferredDestination = input.preferredDestinationInventoryLocationId
    ? candidates.find(
        (candidate) => candidate.inventoryLocation.id === input.preferredDestinationInventoryLocationId,
      )
    : null;
  if (input.preferredDestinationInventoryLocationId && !preferredDestination) {
    throw new EcommerceAuthError("The assigned ecommerce fulfilment location is no longer available.", 409);
  }

  const candidateWithWholeBasket = (preferredDestination ? [preferredDestination] : candidates).find((candidate) => {
    const requestedByPosition = new Map<string, number>();
    for (const { line } of inventoryLines) {
      const key = positionKey(line.product.id, line.variant?.id);
      requestedByPosition.set(key, toQuantity((requestedByPosition.get(key) ?? 0) + line.baseQuantity));
    }
    return inventoryLines.every(({ line }) => {
      const key = positionKey(line.product.id, line.variant?.id);
      return (requestedByPosition.get(key) ?? 0) <= availableFor(candidate, line) + 0.0005;
    });
  });

  if (candidateWithWholeBasket) {
    return {
      ...candidateWithWholeBasket,
      routingMethod:
        input.fulfilmentMethod === "PICKUP" ? "PICKUP_SELECTION" : candidateWithWholeBasket.routingMethod,
      allocations: inventoryLines.map(({ line, lineIndex }) => ({
        candidate: candidateWithWholeBasket,
        lineIndex,
        baseQuantity: toQuantity(line.baseQuantity),
      })),
      requiresInterStoreTransfer: false,
    };
  }

  if (input.fulfilmentMethod === "PICKUP") {
    const selectedShop = candidates[0]?.store.name ?? "the selected shop";
    throw new EcommerceAuthError(
      `The full order is not available for collection at ${selectedShop}. Update your cart or choose another pickup shop.`,
      409,
    );
  }

  const remainingAvailability = new Map(availableByCandidatePosition);
  const allocations: EcommerceNetworkAllocation[] = [];
  for (const { line, lineIndex } of inventoryLines) {
    let remainingQuantity = toQuantity(line.baseQuantity);
    for (const candidate of candidates) {
      const key = `${candidate.inventoryLocation.id}:${positionKey(line.product.id, line.variant?.id)}`;
      const availableQuantity = remainingAvailability.get(key) ?? 0;
      const allocatedQuantity = toQuantity(Math.min(remainingQuantity, availableQuantity));
      if (allocatedQuantity <= 0) continue;
      allocations.push({ candidate, lineIndex, baseQuantity: allocatedQuantity });
      remainingAvailability.set(key, toQuantity(availableQuantity - allocatedQuantity));
      remainingQuantity = toQuantity(remainingQuantity - allocatedQuantity);
      if (remainingQuantity <= 0.0005) break;
    }
    if (remainingQuantity > 0.0005) {
      throw new EcommerceAuthError(
        `Only ${toQuantity(line.baseQuantity - remainingQuantity).toFixed(3)} base unit(s) of ${orderLineLabel(line)} are available across the ecommerce fulfilment network. Update your cart before ${input.actionLabel}.`,
        409,
      );
    }
  }

  const primaryCandidate = preferredDestination ?? candidates[0];
  return {
    ...primaryCandidate,
    routingMethod: "NETWORK_TRANSFER",
    allocations,
    requiresInterStoreTransfer: allocations.some(
      (allocation) => allocation.candidate.inventoryLocation.id !== primaryCandidate.inventoryLocation.id,
    ),
  };
}
