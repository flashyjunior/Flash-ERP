import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { productCardRequiresSelection } from "../apps/enterprise-web/src/components/ecommerce/storefront-card-action";
import {
  buildStorefrontCategoryTree,
  formatStorefrontTaxonomyLabel,
  getStorefrontSelectionLabel,
  productMatchesStorefrontSelection,
} from "../apps/enterprise-web/src/components/ecommerce/storefront-category-tree";
import { resolveEnterpriseWebRoot } from "../apps/enterprise-web/src/server/files/fuel-evidence-storage";

const expectedWebRoot = path.resolve(process.cwd(), "apps", "enterprise-web");
const storefrontStyles = readFileSync(
  path.join(expectedWebRoot, "src", "components", "ecommerce", "public-storefront.module.css"),
  "utf8",
);

function readStandaloneZIndex(selector: string) {
  const matches = [
    ...storefrontStyles.matchAll(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`, "gs")),
  ];
  assert(matches.length > 0, `The ${selector} style rule must exist.`);
  const zIndex = matches
    .slice()
    .reverse()
    .map((match) => match[1]?.match(/z-index:\s*(\d+)/)?.[1])
    .find(Boolean);
  assert(zIndex, `The ${selector} style rule must declare a numeric z-index.`);
  return Number(zIndex);
}

assert.equal(
  path.resolve(resolveEnterpriseWebRoot()),
  expectedWebRoot,
  "The production service working directory must store uploads under apps/enterprise-web/public."
);
assert.equal(productCardRequiresSelection(0), false, "A base product must add directly from its card.");
assert.equal(productCardRequiresSelection(1), false, "A product with one variant must add directly from its card.");
assert.equal(productCardRequiresSelection(2), true, "A product with multiple variants must open selection.");
assert(
  readStandaloneZIndex("modalBackdrop") > readStandaloneZIndex("drawer"),
  "The customer authentication modal must remain above the cart and checkout drawer.",
);

const hierarchyProducts = [
  { department: "ELECTRONICS", category: "COMPUTERS", subcategory: "LAPTOPS" },
  { department: "Electronics", category: "Computers", subcategory: "Desktops" },
  { department: "Electronics", category: "Accessories", subcategory: "Mice" },
  { department: "Home", category: "Furniture", subcategory: "Chairs" },
];
const categoryTree = buildStorefrontCategoryTree(hierarchyProducts);

assert.equal(
  formatStorefrontTaxonomyLabel("HEALTH AND BEAUTY"),
  "Health and Beauty",
  "Storefront taxonomy labels must use consistent proper case without capitalising joining words.",
);
assert.equal(
  formatStorefrontTaxonomyLabel("LPG"),
  "Lpg",
  "Uppercase source labels must not leak into the public category experience.",
);

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

console.log("Ecommerce storefront regression gate passed: uploads, overlay stacking, product-card actions, proper-case taxonomy, and category hierarchy are deterministic.");
