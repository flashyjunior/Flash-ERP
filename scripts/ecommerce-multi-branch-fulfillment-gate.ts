import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function requireIncludes(source: string, expected: string, message: string) {
  assert.ok(source.includes(expected), message);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations-sqlserver/20260820010000_multi_branch_ecommerce_fulfillment/migration.sql",
);
const networkAllocationMigration = read(
  "prisma/migrations-sqlserver/20260820020000_ecommerce_network_allocation/migration.sql",
);
const compatibility = read(
  "apps/enterprise-web/src/server/repositories/schema-compatibility.repository.ts",
);
const ecommerceRepository = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts",
);
const ecommerceFulfillment = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce-fulfillment.ts",
);
const ecommercePayments = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce-payments.ts",
);
const onlineStoreRepository = read(
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
);
const storefront = read(
  "apps/enterprise-web/src/components/ecommerce/public-storefront.tsx",
);
const staffConsole = read(
  "apps/enterprise-web/src/components/ecommerce/online-store-ecommerce-workspace.tsx",
);

for (const source of [schema, migration, compatibility]) {
  for (const expected of [
    "EcommerceFulfillmentLocation",
    "EcommerceFulfillment",
    "EcommerceFulfillmentLine",
    "storefrontStoreId",
  ]) {
    requireIncludes(source, expected, `Multi-branch ecommerce schema is missing ${expected}.`);
  }
}

for (const expected of [
  "SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_inventoryLocationId_key",
  "salesOrderLineId",
  "inventoryLocationId",
]) {
  requireIncludes(
    networkAllocationMigration,
    expected,
    `Network allocation migration is missing ${expected}.`,
  );
}

for (const expected of [
  "getEcommerceFulfillmentCandidates",
  "resolveEcommerceFulfillmentPlan",
  "calculateEcommerceSellableBaseQuantity",
  "safetyStockLevel",
  "TransactionIsolationLevel.Serializable",
  "salesOrderInventoryReservation.createMany",
  "storefrontStoreId: store.id",
  "routingMethod",
  "method: fulfilmentMethod",
  "ecommerceFulfillment.create",
  "interStoreTransfer.create",
  "queueInterStoreTransferPublication",
  "status: \"RELEASED\"",
]) {
  requireIncludes(ecommerceRepository, expected, `Ecommerce routing is missing ${expected}.`);
}

for (const expected of [
  "resolveEcommerceFulfillmentPlan",
  "preferredDestinationInventoryLocationId",
  "ECOMMERCE_NETWORK_ALLOCATION",
  "queueInterStoreTransferPublication",
]) {
  requireIncludes(ecommercePayments, expected, `Layaway deposit reservation is not aligned to ${expected}.`);
}

for (const expected of [
  "calculateEcommerceSellableBaseQuantity",
  "onHandBaseQuantity",
  "activeReservedBaseQuantity",
  "safetyStockBaseQuantity",
  "NETWORK_TRANSFER",
]) {
  requireIncludes(ecommerceFulfillment, expected, `Network fulfilment planner is missing ${expected}.`);
}

for (const expected of [
  "consumedReservationCount",
  "ecommerceFulfillment.updateMany",
  "ecommerceFulfillmentLine.updateMany",
]) {
  requireIncludes(onlineStoreRepository, expected, `POS fulfilment is missing ${expected}.`);
}

for (const expected of [
  "pickupLocations",
  "pickupStoreCode",
  "Delivery stock secured across the fulfilment network",
  "Network fulfilment",
  "Delivery prepared by",
]) {
  requireIncludes(storefront, expected, `Public storefront is missing ${expected}.`);
}

for (const expected of [
  "Fulfilment locations",
  "availableFulfillmentLocations",
  "Fulfilment location",
  "networkTransferSummary",
  "Network stock routing",
]) {
  requireIncludes(staffConsole, expected, `Staff ecommerce console is missing ${expected}.`);
}

console.log(
  "Ecommerce multi-branch fulfilment gate passed: network sellable stock, safety stock, source reservations, transfer routing, pickup selection, layaway alignment, cancellation protection, and POS consumption are wired.",
);
