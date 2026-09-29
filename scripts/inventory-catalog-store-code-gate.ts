import assert from "node:assert/strict";

import {
  normalizeInventoryCatalogStoreCodes,
  resolveInventoryCatalogStores,
} from "../apps/enterprise-web/src/server/repositories/inventory-catalog-store-code";

const canonicalStores = [
  { id: "store-abdul-rauf", code: "ABDUL-RAUF" },
  { id: "store-accra-shop", code: "accra-shop" },
];

assert.deepEqual(
  normalizeInventoryCatalogStoreCodes(["ABDUL-RAUF", "abdul-rauf", " accra shop "]),
  ["ABDUL-RAUF", "accra-shop"],
  "catalog shop codes must retain canonical casing while deduplicating case-insensitively",
);

assert.deepEqual(
  resolveInventoryCatalogStores(["abdul-rauf", "ACCRA-SHOP"], canonicalStores),
  {
    stores: canonicalStores,
    missingStoreCodes: [],
  },
  "catalog assignment must resolve shop codes independently of database collation",
);

assert.deepEqual(
  resolveInventoryCatalogStores(["MISSING-SHOP"], canonicalStores),
  {
    stores: [],
    missingStoreCodes: ["MISSING-SHOP"],
  },
  "catalog assignment must still reject genuinely unknown shops",
);

console.log("Inventory catalog shop-code acceptance passed.");
