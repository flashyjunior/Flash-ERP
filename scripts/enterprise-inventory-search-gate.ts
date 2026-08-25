import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { matchesInventorySearchTerms } from "../apps/enterprise-web/src/components/enterprise/enterprise-inventory-search";
import { readStoreEcommerceFulfillmentEligibility } from "../apps/store-desktop/src/shared/desktop-runtime";

const shopValues = [
  "east-legon-market",
  "East Legon Shop",
  null,
  null,
  "east-legon-sales-floor",
  "East Legon Sales Floor",
];
const productValues = [
  "VPS-COM-DES-085",
  "6200000000085",
  "ASUS ROG Gaming Desktop Ryzen 7",
];

assert.equal(matchesInventorySearchTerms(shopValues, "legon"), true);
assert.equal(matchesInventorySearchTerms(shopValues, "east shop"), true);
assert.equal(
  matchesInventorySearchTerms(
    shopValues,
    "East Legon Shop / East Legon Sales Floor (east-legon-sales-floor)",
  ),
  true,
);
assert.equal(matchesInventorySearchTerms(shopValues, "Kumasi"), false);
assert.equal(matchesInventorySearchTerms(productValues, "rog gaming"), true);
assert.equal(matchesInventorySearchTerms(productValues, "des 085"), true);
assert.equal(matchesInventorySearchTerms(productValues, "Adidas"), false);

const desktopEligibility = readStoreEcommerceFulfillmentEligibility(
  JSON.stringify([
    {
      inventoryLocationCode: "east-legon-sales-floor",
      storefrontStoreCode: "accra-shop",
      storefrontStoreName: "Accra Shop",
      supportsPickup: true,
      supportsDelivery: false,
      routingPriority: 20,
    },
    {
      inventoryLocationCode: "EAST-LEGON-SALES-FLOOR",
      storefrontStoreCode: "ghana-store",
      storefrontStoreName: "Ghana Store",
      supportsPickup: false,
      supportsDelivery: true,
      routingPriority: 10,
    },
  ]),
).get("EAST-LEGON-SALES-FLOOR");
assert.deepEqual(desktopEligibility, {
  supportsPickup: true,
  supportsDelivery: true,
  routingPriority: 10,
  label:
    "Accra Shop: pickup (priority 20); Ghana Store: delivery (priority 10)",
});

const workspace = readFileSync(
  "apps/enterprise-web/src/components/enterprise/enterprise-inventory-workspace.tsx",
  "utf8",
);
for (const expected of [
  'type="search"',
  'placeholder="Search shop or location"',
  'placeholder="Search product name, code, or SKU"',
  "matchesInventorySearchTerms",
  'header: "Active reserved"',
  'header: "Safety stock"',
  'header: "Web sellable"',
  'header: "Ecommerce eligibility"',
]) {
  assert.ok(workspace.includes(expected), `Item Dynamic live filtering is missing ${expected}.`);
}
assert.equal(
  workspace.includes("row.locationCode === stockShopFilter"),
  false,
  "Item Dynamic must not require an exact location-code match.",
);
assert.equal(
  workspace.includes("row.productCode === stockProductFilter"),
  false,
  "Item Dynamic must not require an exact product-code match.",
);

const enterpriseInventoryRepository = readFileSync(
  "apps/enterprise-web/src/server/repositories/enterprise-inventory.repository.ts",
  "utf8",
);
for (const expected of [
  "activeReservationGroups",
  "ecommerceFulfillmentLocations",
  "activeReservedQuantity",
  "safetyStockLevel",
  "ecommerceSellableQuantity",
  "ecommerceEligibilityLabel",
]) {
  assert.ok(
    enterpriseInventoryRepository.includes(expected),
    `HQ Item Dynamic stock breakdown is missing ${expected}.`,
  );
}

const onlineStoreWorkspace = readFileSync(
  "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
  "utf8",
);
const desktopWorkspace = readFileSync(
  "apps/store-desktop/src/renderer/modern-app.tsx",
  "utf8",
);
for (const [surface, source] of [
  ["Online Store", onlineStoreWorkspace],
  ["Store Desktop", desktopWorkspace],
] as const) {
  for (const expected of [
    "Reserved",
    "Safety",
    "Web sellable",
    "Ecommerce",
    "Location breakdown",
  ]) {
    assert.ok(
      source.includes(expected),
      `${surface} inventory breakdown is missing ${expected}.`,
    );
  }
}

for (const providerPath of [
  "apps/store-desktop/src/main/offline/local-store-service.ts",
  "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
  "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
]) {
  const provider = readFileSync(providerPath, "utf8");

  for (const expected of [
    "ecommerce_fulfillment_locations_json",
    "activeReservedQuantity",
    "ecommerceSellableQuantity",
    "readStoreEcommerceFulfillmentEligibility",
  ]) {
    assert.ok(
      provider.includes(expected),
      `${providerPath} stock breakdown is missing ${expected}.`,
    );
  }
}

console.log("Enterprise Item Dynamic search and ecommerce stock breakdown gate passed.");
