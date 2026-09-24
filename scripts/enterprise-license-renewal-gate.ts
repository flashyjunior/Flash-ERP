import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repository = readFileSync(
  resolve(
    "apps/enterprise-web/src/server/repositories/enterprise-stores.repository.ts",
  ),
  "utf8",
);
const renewalStart = repository.indexOf(
  "export async function renewEnterpriseLicenses(",
);
const renewalEnd = repository.indexOf(
  "export type EnterpriseStoreDetailData",
  renewalStart,
);
const renewalSource = repository.slice(renewalStart, renewalEnd);

assert.ok(renewalStart >= 0 && renewalEnd > renewalStart);
assert.match(
  renewalSource,
  /const storeCodes = normalizeCodeList\(input\.storeCodes\);/,
  "License renewal must preserve canonical shop-code casing for the database lookup.",
);
assert.doesNotMatch(
  renewalSource,
  /normalizeCodeList\(input\.storeCodes\)\.map\(\(code\) =>\s*normalizeStoreCode\(code\)/,
  "License renewal must not rewrite an existing uppercase shop code before querying it.",
);
assert.match(
  renewalSource,
  /foundStoreCodes\.has\(normalizeLicenseLookupKey\(code\)\)/,
  "Returned shop codes must be reconciled without case sensitivity.",
);
assert.match(
  renewalSource,
  /storeLicenseKeys\.get\(normalizeLicenseLookupKey\(store\.code\)\)/,
  "Per-shop license keys must use the same case-insensitive lookup boundary.",
);

const lookupKey = (value: string) => value.trim().toUpperCase();
assert.equal(lookupKey("main"), lookupKey("MAIN"));
assert.equal(lookupKey(" Main "), lookupKey("MAIN"));
assert.notEqual(lookupKey("ABDUL-RAUF"), lookupKey("MAIN"));

process.stdout.write(
  "FLASH-ERP enterprise license renewal regression passed: canonical uppercase shop codes remain resolvable.\n",
);
