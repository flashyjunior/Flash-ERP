import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function requireIncludes(source: string, expected: string, message: string) {
  assert.ok(source.includes(expected), message);
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260820_01_multi_branch_ecommerce_fulfillment/migration.sql");
const compatibility = read(
  "apps/enterprise-web/src/server/repositories/schema-compatibility.repository.ts",
);
const ecommerceRepository = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts",
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
  "getEcommerceFulfillmentCandidates",
  "resolveEcommerceFulfillmentCandidate",
  "TransactionIsolationLevel.Serializable",
  "salesOrderInventoryReservation.createMany",
  "storefrontStoreId: store.id",
  "routingMethod",
  "ecommerceFulfillment.create",
  "status: \"RELEASED\"",
]) {
  requireIncludes(ecommerceRepository, expected, `Ecommerce routing is missing ${expected}.`);
}

for (const expected of [
  "ecommerceFulfillment.findUnique",
  "assignedFulfillment?.inventoryLocation",
  "inventoryLocationId: location.id",
]) {
  requireIncludes(ecommercePayments, expected, `Layaway deposit reservation is not aligned to ${expected}.`);
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
  "Stock assigned for delivery",
  "Fulfilled by",
]) {
  requireIncludes(storefront, expected, `Public storefront is missing ${expected}.`);
}

for (const expected of [
  "Fulfilment locations",
  "availableFulfillmentLocations",
  "Fulfilment location",
]) {
  requireIncludes(staffConsole, expected, `Staff ecommerce console is missing ${expected}.`);
}

console.log(
  "Ecommerce multi-branch fulfilment gate passed: central storefront routing, per-location reservation, staff allocation, customer pickup selection, layaway alignment, and POS consumption are wired.",
);
