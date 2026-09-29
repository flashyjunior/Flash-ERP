import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildStoreProductCatalogWhere,
  resolveStoreProductCatalogScope,
} from "../apps/enterprise-web/src/server/repositories/store-product-catalog-scope";

assert.deepEqual(
  resolveStoreProductCatalogScope({
    catalogPolicyJson: null,
    inventoryCatalogLinks: [
      {
        catalog: {
          products: [
            { product: { id: "product-pixel-7a", code: "PIXEL-7A" } },
            { product: { id: "product-common", code: "COMMON-ITEM" } },
          ],
        },
      },
      {
        catalog: {
          products: [
            { product: { id: "product-pixel-7a", code: "pixel-7a" } },
            { product: { id: "product-exclusive", code: "SHOP-EXCLUSIVE" } },
          ],
        },
      },
    ],
  }),
  {
    productIds: ["product-pixel-7a", "product-common", "product-exclusive"],
    productCodes: ["PIXEL-7A", "COMMON-ITEM", "SHOP-EXCLUSIVE"],
    departmentCodes: [],
    categoryCodes: [],
  },
  "mobile catalog scope must combine assigned active catalogs without duplicate products",
);

assert.deepEqual(
  resolveStoreProductCatalogScope({
    catalogPolicyJson: JSON.stringify({
      productCodes: ["legacy-item"],
      departmentCodes: ["phones"],
      categoryCodes: ["accessories"],
    }),
    inventoryCatalogLinks: [],
  }),
  {
    productIds: [],
    productCodes: ["LEGACY-ITEM"],
    departmentCodes: ["PHONES"],
    categoryCodes: ["ACCESSORIES"],
  },
  "mobile catalog scope must preserve the legacy shop policy fallback",
);

assert.equal(
  resolveStoreProductCatalogScope({
    catalogPolicyJson: null,
    inventoryCatalogLinks: [],
  }),
  null,
  "a shop without a configured policy must retain the existing unrestricted fallback",
);

assert.deepEqual(
  buildStoreProductCatalogWhere({
    productIds: ["product-shop-b"],
    productCodes: ["SHOP-B-ITEM"],
    departmentCodes: [],
    categoryCodes: [],
  }),
  {
    OR: [
      { productType: "SERVICE" },
      { id: { in: ["product-shop-b"] } },
      { code: { in: ["SHOP-B-ITEM"] } },
    ],
  },
  "shop-facing product queries must include only assigned products and service items",
);

const repositoryRoot = path.resolve(process.cwd());
const routeSource = readFileSync(
  path.join(repositoryRoot, "apps/enterprise-web/src/app/api/catalog/products/route.ts"),
  "utf8",
);
const mobileApiSource = readFileSync(
  path.join(repositoryRoot, "apps/mobile/lib/mobile-api.ts"),
  "utf8",
);
const onlineStoreSource = readFileSync(
  path.join(
    repositoryRoot,
    "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
  ),
  "utf8",
);

for (const requiredRouteFragment of [
  "resolveStoreProductCatalogScope(homeStore)",
  "buildStoreProductCatalogWhere(catalogScope)",
  "storeId: homeStore.id",
  "AND: [catalogWhere, searchWhere]",
]) {
  assert.ok(
    routeSource.includes(requiredRouteFragment),
    `mobile catalog route is missing ${requiredRouteFragment}`,
  );
}

for (const requiredOnlineStoreFragment of [
  "resolveStoreProductCatalogScope(assignment.store)",
  "buildStoreProductCatalogWhere(productCatalogScope)",
  "...(productCatalogWhere ? { AND: [productCatalogWhere] } : {})",
  "productsForCatalog.filter(isOnlineStoreStockManagedProduct)",
]) {
  assert.ok(
    onlineStoreSource.includes(requiredOnlineStoreFragment),
    `online-store inventory scope is missing ${requiredOnlineStoreFragment}`,
  );
}

assert.ok(
  mobileApiSource.includes("await mobileOfflineDb.pruneProducts(validProductCodes)"),
  "full mobile catalog refresh must remove products no longer assigned to the home shop",
);

console.log("Shop-facing inventory catalog scope acceptance passed.");
