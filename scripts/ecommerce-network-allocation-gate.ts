import assert from "node:assert/strict";

import {
  calculateEcommerceNetworkAvailabilityByLocation,
  calculateEcommerceNetworkSellableBaseQuantity,
  calculateEcommerceSellableBaseQuantity,
  resolveEcommerceFulfillmentPlan,
} from "../apps/enterprise-web/src/server/ecommerce/ecommerce-fulfillment";

const storefront = {
  id: "storefront",
  retailOrgId: "org-1",
  code: "online-shop",
  name: "Online shop",
  shortName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  region: null,
  ecommerceAllowPickup: true,
  ecommerceAllowDelivery: true,
};

const locations = [
  {
    id: "config-alpha",
    supportsPickup: true,
    supportsDelivery: true,
    routingPriority: 1,
    store: {
      id: "store-alpha",
      code: "alpha",
      name: "Alpha shop",
      shortName: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      region: null,
    },
    inventoryLocation: { id: "location-alpha", code: "alpha-sales", name: "Alpha sales" },
  },
  {
    id: "config-beta",
    supportsPickup: true,
    supportsDelivery: true,
    routingPriority: 2,
    store: {
      id: "store-beta",
      code: "beta",
      name: "Beta shop",
      shortName: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      region: null,
    },
    inventoryLocation: { id: "location-beta", code: "beta-sales", name: "Beta sales" },
  },
];

const inventoryClient = {
  ecommerceFulfillmentLocation: {
    findMany: async () => locations,
  },
  inventoryLocation: {
    findFirst: async () => null,
  },
  inventoryLedgerEntry: {
    groupBy: async () => [
      { inventoryLocationId: "location-alpha", productId: "product-1", productVariantId: null, _sum: { quantity: 3 } },
      { inventoryLocationId: "location-beta", productId: "product-1", productVariantId: null, _sum: { quantity: 5 } },
    ],
  },
  salesOrderInventoryReservation: {
    findMany: async () => [
      {
        inventoryLocationId: "location-alpha",
        productCodeSnapshot: "WIDGET",
        productVariantCodeSnapshot: null,
        baseQuantity: 1,
      },
    ],
  },
};

const lines = [
  {
    product: {
      id: "product-1",
      code: "WIDGET",
      name: "Widget",
      productType: "STOCK",
      trackInventory: true,
      safetyStockLevel: 1,
    },
    variant: null,
    baseQuantity: 5,
  },
];

async function main() {
  assert.equal(
    calculateEcommerceSellableBaseQuantity({
      onHandBaseQuantity: 10,
      activeReservedBaseQuantity: 3,
      safetyStockBaseQuantity: 2,
    }),
    5,
    "Sellable ecommerce stock must exclude active reservations and the product safety stock.",
  );

  const receivedTransferPositions = [
    {
      inventoryLocationId: "location-alpha",
      onHandBaseQuantity: 53,
      activeReservedBaseQuantity: 23,
      safetyStockBaseQuantity: 5,
    },
    {
      inventoryLocationId: "location-beta",
      onHandBaseQuantity: 5,
      activeReservedBaseQuantity: 25,
      safetyStockBaseQuantity: 5,
    },
  ];
  assert.equal(
    calculateEcommerceNetworkSellableBaseQuantity(receivedTransferPositions),
    0,
    "Receiving reserved transfer stock must not make the same quantity sellable again at dispatch.",
  );
  assert.deepEqual(
    [...calculateEcommerceNetworkAvailabilityByLocation(receivedTransferPositions).values()],
    [0, 0],
    "A source reservation deficit must cap delivery availability across the eligible network.",
  );

  const deliveryPlan = await resolveEcommerceFulfillmentPlan(
    inventoryClient as never,
    storefront,
    lines,
    { fulfilmentMethod: "DELIVERY", actionLabel: "placing this order" },
  );

  assert.equal(deliveryPlan.routingMethod, "NETWORK_TRANSFER");
  assert.equal(deliveryPlan.store.code, "alpha");
  assert.equal(deliveryPlan.requiresInterStoreTransfer, true);
  assert.deepEqual(
    deliveryPlan.allocations.map((allocation) => [allocation.candidate.store.code, allocation.baseQuantity]),
    [["alpha", 1], ["beta", 4]],
    "Delivery must allocate only the sellable quantity at each source location.",
  );

  await assert.rejects(
    () => resolveEcommerceFulfillmentPlan(inventoryClient as never, storefront, lines, {
      fulfilmentMethod: "PICKUP",
      pickupStoreCode: "alpha",
      actionLabel: "checking out",
    }),
    /not available for collection at Alpha shop/,
    "Pickup must not combine availability from multiple shops.",
  );

  const receivedTransferInventoryClient = {
    ...inventoryClient,
    inventoryLedgerEntry: {
      groupBy: async () => [
        { inventoryLocationId: "location-alpha", productId: "product-1", productVariantId: null, _sum: { quantity: 53 } },
        { inventoryLocationId: "location-beta", productId: "product-1", productVariantId: null, _sum: { quantity: 5 } },
      ],
    },
    salesOrderInventoryReservation: {
      findMany: async () => [
        {
          inventoryLocationId: "location-alpha",
          productCodeSnapshot: "WIDGET",
          productVariantCodeSnapshot: null,
          baseQuantity: 23,
        },
        {
          inventoryLocationId: "location-beta",
          productCodeSnapshot: "WIDGET",
          productVariantCodeSnapshot: null,
          baseQuantity: 25,
        },
      ],
    },
  };
  const oneUnitLine = [{
    ...lines[0],
    product: { ...lines[0].product, safetyStockLevel: 5 },
    baseQuantity: 1,
  }];
  await assert.rejects(
    () => resolveEcommerceFulfillmentPlan(
      receivedTransferInventoryClient as never,
      storefront,
      oneUnitLine,
      { fulfilmentMethod: "DELIVERY", actionLabel: "placing this order" },
    ),
    /Only 0\.000 base unit\(s\)/,
    "Checkout must reject stock that is physically received but still reserved for another ecommerce order.",
  );
  await assert.rejects(
    () => resolveEcommerceFulfillmentPlan(
      receivedTransferInventoryClient as never,
      storefront,
      oneUnitLine,
      {
        fulfilmentMethod: "PICKUP",
        pickupStoreCode: "alpha",
        actionLabel: "checking out",
      },
    ),
    /not available for collection at Alpha shop/,
    "Pickup must not claim transferred stock that remains reserved by a delivery order.",
  );

  console.log("Ecommerce network allocation gate passed: safety stock, transferred reservations, delivery routing, and pickup isolation are enforced.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
