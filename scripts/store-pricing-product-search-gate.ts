import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.resolve(
    process.cwd(),
    "apps/enterprise-web/src/components/enterprise/enterprise-store-pricing-workspace.tsx",
  ),
  "utf8",
);

function requireSource(fragment: string, message: string) {
  assert.ok(source.includes(fragment), message);
}

const pickerUses = source.match(/<ProductTargetCombobox/g) ?? [];
assert.equal(
  pickerUses.length,
  2,
  "Price overrides and selling units must both use the searchable product picker.",
);
for (const searchableField of [
  "target.productName",
  "target.productCode",
  "target.productType",
  "target.productVariantName",
  "target.productVariantCode",
]) {
  requireSource(
    searchableField,
    `The Shop Prices product picker must search ${searchableField}.`,
  );
}
requireSource('role="combobox"', "The product search must expose combobox semantics.");
requireSource('role="listbox"', "The product results must expose listbox semantics.");
requireSource('role="option"', "Each product result must expose option semantics.");
requireSource(
  'event.key === "ArrowDown"',
  "The product search must support keyboard result navigation.",
);
requireSource(
  'event.key === "Enter"',
  "The product search must support keyboard selection.",
);
requireSource(
  'No products match that search.',
  "The product search must provide an empty-result state.",
);

process.stdout.write(
  "Shop Prices searchable product picker acceptance passed for price overrides and selling units.\n",
);
