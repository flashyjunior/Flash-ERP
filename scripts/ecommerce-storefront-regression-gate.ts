import assert from "node:assert/strict";
import path from "node:path";

import { productCardRequiresSelection } from "../apps/enterprise-web/src/components/ecommerce/storefront-card-action";
import {
  buildStorefrontCategoryTree,
  getStorefrontSelectionLabel,
  productMatchesStorefrontSelection,
} from "../apps/enterprise-web/src/components/ecommerce/storefront-category-tree";
import { resolveEnterpriseWebRoot } from "../apps/enterprise-web/src/server/files/fuel-evidence-storage";

const expectedWebRoot = path.resolve(process.cwd(), "apps", "enterprise-web");

assert.equal(
  path.resolve(resolveEnterpriseWebRoot()),
  expectedWebRoot,
  "The production service working directory must store uploads under apps/enterprise-web/public."
);
assert.equal(productCardRequiresSelection(0), false, "A base product must add directly from its card.");
assert.equal(productCardRequiresSelection(1), false, "A product with one variant must add directly from its card.");
assert.equal(productCardRequiresSelection(2), true, "A product with multiple variants must open selection.");

const hierarchyProducts = [
  { department: "Electronics", category: "Computers", subcategory: "Laptops" },
  { department: "Electronics", category: "Computers", subcategory: "Desktops" },
  { department: "Electronics", category: "Accessories", subcategory: "Mice" },
  { department: "Home", category: "Furniture", subcategory: "Chairs" },
];
const categoryTree = buildStorefrontCategoryTree(hierarchyProducts);

assert.deepEqual(
  categoryTree.map((department) => [department.name, department.count]),
  [["Electronics", 3], ["Home", 1]],
  "The storefront menu must group and count departments deterministically.",
);
assert.deepEqual(
  categoryTree[0]?.categories.map((category) => [category.name, category.count]),
  [["Accessories", 1], ["Computers", 2]],
  "Each department must expose its categories in a stable order.",
);
assert.deepEqual(
  categoryTree[0]?.categories[1]?.subcategories.map((subcategory) => subcategory.name),
  ["Desktops", "Laptops"],
  "Each category must expose its subcategories in a stable order.",
);
assert.equal(
  hierarchyProducts.filter((product) => productMatchesStorefrontSelection(product, {
    level: "CATEGORY",
    department: "Electronics",
    category: "Computers",
  })).length,
  2,
  "Category selection must not leak products from another category or department.",
);
assert.equal(
  hierarchyProducts.filter((product) => productMatchesStorefrontSelection(product, {
    level: "SUBCATEGORY",
    department: "Electronics",
    category: "Computers",
    subcategory: "Laptops",
  })).length,
  1,
  "Subcategory selection must match the complete hierarchy path.",
);
assert.equal(
  getStorefrontSelectionLabel({
    level: "SUBCATEGORY",
    department: "Electronics",
    category: "Computers",
    subcategory: "Laptops",
  }),
  "Laptops",
  "The selected hierarchy label must identify the active catalogue level.",
);

console.log("Ecommerce storefront regression gate passed: uploads, product-card actions, and category hierarchy are deterministic.");
