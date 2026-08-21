import assert from "node:assert/strict";

import {
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

  console.log("Ecommerce network allocation gate passed: safety stock, reservations, delivery transfers, and pickup isolation are enforced.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
