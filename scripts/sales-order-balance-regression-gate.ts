import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string) {
  return readFileSync(resolve(relativePath), "utf8");
}

const compatibility = read(
  "apps/enterprise-web/src/server/repositories/schema-compatibility.repository.ts",
);
const desktop = read("apps/store-desktop/src/renderer/modern-app.tsx");
const onlineStore = read(
  "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
);
const sqlServerMigration = read(
  "prisma/migrations-sqlserver/20260923010000_sales_order_balance_reconciliation/migration.sql",
);
const postgresMigration = read(
  "prisma/migrations/20260923010000_sales_order_balance_reconciliation/migration.sql",
);
const runtimeReadiness = read(
  "apps/enterprise-web/src/server/readiness/enterprise-database-readiness.ts",
);
const readinessGate = read("scripts/database-readiness-gate.ts");

const compatibilityStart = compatibility.indexOf(
  "export function ensureProductVariantSalesOrderDepositSchemaCompatibility()",
);
const compatibilityEnd = compatibility.indexOf(
  "export function ensureInventoryExpirySchemaCompatibility()",
  compatibilityStart,
);
const compatibilitySource = compatibility.slice(
  compatibilityStart,
  compatibilityEnd,
);

assert.ok(compatibilityStart >= 0 && compatibilityEnd > compatibilityStart);
assert.doesNotMatch(
  compatibilitySource,
  /SET \[balanceAmount\] = \[totalAmount\]/,
  "SQL Server compatibility must not restore the whole order total as the balance.",
);
assert.doesNotMatch(
  compatibilitySource,
  /SET "balanceAmount" = "totalAmount"/,
  "PostgreSQL compatibility must not restore the whole order total as the balance.",
);
assert.match(
  compatibilitySource,
  /IF COL_LENGTH\(N'dbo\.SalesOrder', N'balanceAmount'\) IS NULL[\s\S]*?\[totalAmount\] - \[paidAmount\]/,
  "SQL Server legacy balance backfill must run only while adding the column.",
);
assert.match(
  compatibilitySource,
  /IF NOT EXISTS \([\s\S]*?column_name = 'balanceAmount'[\s\S]*?GREATEST\("totalAmount" - "paidAmount", 0\)/,
  "PostgreSQL legacy balance backfill must run only while adding the column.",
);

assert.match(
  sqlServerMigration,
  /WHEN \[totalAmount\] > \[paidAmount\] THEN \[totalAmount\] - \[paidAmount\][\s\S]*?ELSE 0/,
);
assert.match(sqlServerMigration, /WHERE \[status\] = N'OPEN'/);
assert.match(
  postgresMigration,
  /GREATEST\("totalAmount" - "paidAmount", 0\)/,
);
assert.match(postgresMigration, /WHERE "status" = 'OPEN'/);
for (const readinessSource of [runtimeReadiness, readinessGate]) {
  assert.match(
    readinessSource,
    /20260923010000_sales_order_balance_reconciliation/,
    "SQL Server readiness must require the corrective balance migration.",
  );
}

const reconcileBalance = (totalAmount: number, paidAmount: number) =>
  Math.max(totalAmount - paidAmount, 0);
assert.equal(reconcileBalance(1350, 1350), 0);
assert.equal(reconcileBalance(5000, 2000), 3000);
assert.equal(reconcileBalance(1350, 1500), 0);

assert.match(
  desktop,
  /async function activateSalesOrderMode\(\)[\s\S]*?defaultPaymentDraft\(snapshot, snapshot\?\.activeBasket \?\? null, "0\.00"\)/,
  "Store Desktop Sales Order mode must start with a zero deposit.",
);
assert.match(
  desktop,
  /function activateSaleMode\(\)[\s\S]*?setSaleMode\("SALE"\)[\s\S]*?defaultPaymentDraft\(snapshot, snapshot\?\.activeBasket \?\? null\)/,
  "Store Desktop Sale mode must restore the ordinary full payable draft.",
);
assert.match(
  desktop,
  /activateSaleMode=\{activateSaleMode\}/,
  "Store Desktop must pass the Sale mode transition through the POS workspace contract.",
);
assert.match(
  desktop,
  /onClick=\{props\.activateSaleMode\}/,
  "Store Desktop's Sale button must use the restoring transition handler.",
);
assert.doesNotMatch(
  desktop,
  /onClick=\{\(\) => props\.setSaleMode\("SALE"\)\}/,
  "Store Desktop's Sale button must not bypass payment-draft restoration.",
);
assert.match(
  desktop,
  /saleMode === "SALES_ORDER" && result\.snapshot\.activeBasket[\s\S]*?drafts\.length > 0[\s\S]*?\? drafts/,
  "Store Desktop must preserve an entered Sales Order deposit while the basket changes.",
);
assert.match(
  desktop,
  /function activateLayawayMode\(\)[\s\S]*?defaultPaymentDraft\(snapshot, snapshot\?\.activeBasket \?\? null\)/,
  "Store Desktop layaway mode must retain its existing basket-total prefill.",
);
assert.match(
  onlineStore,
  /function activateSalesOrderMode\(\)[\s\S]*?createPaymentDraft\(defaultTenderCode, "0\.00"\)/,
  "Online Store Sales Order mode must start with a zero deposit.",
);
assert.match(
  onlineStore,
  /saleMode === "SALES_ORDER" && !fulfillingSalesOrderId[\s\S]*?drafts\[0\]\.amount[\s\S]*?payableTotal\.toFixed\(2\)/,
  "Online Store must preserve an entered Sales Order deposit and restore payable total outside Sales Order mode.",
);

process.stdout.write(
  "FLASH-ERP sales-order balance regression passed: OPEN balances reconcile against paid amount and new Sales Orders default to zero deposit.\n",
);
