import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { matchesInventorySearchTerms } from "../apps/enterprise-web/src/components/enterprise/enterprise-inventory-search";

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

const workspace = readFileSync(
  "apps/enterprise-web/src/components/enterprise/enterprise-inventory-workspace.tsx",
  "utf8",
);
for (const expected of [
  'type="search"',
  'placeholder="Search shop or location"',
  'placeholder="Search product name, code, or SKU"',
  "matchesInventorySearchTerms",
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

console.log("Enterprise Item Dynamic partial search gate passed.");
