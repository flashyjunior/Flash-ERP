import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  enterpriseFinanceMenuGroups,
  enterpriseFinanceSettingsMenuItems,
  enterpriseFuelOperationsMenuItems,
  enterpriseNavigationSections,
  enterpriseSettingsMenuItems
} from "../apps/enterprise-web/src/lib/navigation/enterprise-navigation.ts";
import { securityPermissionCatalog } from "../packages/domain/src/security-permissions.ts";

const root = process.cwd();
const broadPermissionPattern = /(?:operations\.dashboard\.view|settings\.company\.manage)/;
const financePermissionPattern = /finance\.(?:view|manage|post|approve|setup\.manage)/;

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function filesBelow(relativeDirectory: string, fileName: string): string[] {
  const absoluteDirectory = path.join(root, relativeDirectory);

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      return filesBelow(relativePath, fileName);
    }

    return entry.isFile() && entry.name === fileName ? [relativePath] : [];
  });
}

function assertContains(relativePath: string, values: readonly string[]) {
  const source = read(relativePath);

  for (const value of values) {
    assert.ok(source.includes(value), `${relativePath} must contain ${JSON.stringify(value)}.`);
  }

  return source;
}

const dedicatedPermissionCodes = [
  "finance.view",
  "finance.manage",
  "finance.post",
  "finance.approve",
  "finance.setup.manage",
  "fuel.hq.view",
  "fuel.hq.manage"
] as const;
const catalogCodes = new Set(securityPermissionCatalog.map((permission) => permission.code));

for (const permissionCode of dedicatedPermissionCodes) {
  assert.ok(catalogCodes.has(permissionCode), `Missing ${permissionCode} from the permission catalogue.`);
}

const financeNavigation = enterpriseFinanceMenuGroups.flatMap((group) => group.items);
const financeViewRoutes = new Set([
  "/finance",
  "/finance/financial-statements",
  "/finance/trial-balance",
  "/finance/account-activity",
  "/finance/journal-inquiry"
]);
const financeManageRoutes = new Set([
  "/finance/journals",
  "/finance/recurring-journals",
  "/finance/operational-documents",
  "/finance/ar-ap-documents",
  "/finance/ar-ap-settlements",
  "/finance/cashbook",
  "/finance/bank-reconciliation",
  "/finance/fixed-assets",
  "/finance/budgets",
  "/finance/payroll-gl"
]);

for (const item of financeNavigation) {
  if (financeViewRoutes.has(item.href)) {
    assert.deepEqual(item.requiredPermissions, ["finance.view"], `${item.href} must use finance.view.`);
  } else if (financeManageRoutes.has(item.href)) {
    assert.deepEqual(
      item.requiredPermissions,
      ["finance.manage"],
      `${item.href} must use finance.manage.`
    );
  }
}

for (const item of enterpriseFinanceSettingsMenuItems) {
  assert.deepEqual(
    item.requiredPermissions,
    ["finance.setup.manage"],
    `${item.href} must use finance.setup.manage.`
  );
}

for (const item of enterpriseFuelOperationsMenuItems) {
  assert.deepEqual(item.requiredPermissions, ["fuel.hq.view"], `${item.href} must use fuel.hq.view.`);
}

assert.deepEqual(
  enterpriseSettingsMenuItems.find((item) => item.href === "/settings/fuel-operations")
    ?.requiredPermissions,
  ["fuel.hq.manage"],
  "Fuel Operations settings navigation must use fuel.hq.manage."
);

const financeSection = enterpriseNavigationSections.find((section) => section.key === "finance");
assert.ok(financeSection?.requiredPermissions.includes("finance.view"));
assert.ok(financeSection?.requiredPermissions.includes("finance.setup.manage"));
const fuelSection = enterpriseNavigationSections.find((section) => section.key === "fuel-operations");
assert.deepEqual(
  fuelSection?.requiredPermissions,
  ["fuel.hq.view", "fuel.hq.manage"],
  "HQ fuel section must use only dedicated HQ fuel permissions."
);

const financeSharedGuards = [
  "apps/enterprise-web/src/app/finance/_foundation-page.tsx",
  "apps/enterprise-web/src/app/finance/_gl-inquiry-page.tsx"
] as const;

for (const relativePath of financeSharedGuards) {
  const source = assertContains(relativePath, ["requireEnterprisePermission"]);
  assert.match(source, financePermissionPattern, `${relativePath} must use a dedicated Finance permission.`);
  assert.doesNotMatch(source, broadPermissionPattern, `${relativePath} retains a broad permission.`);
}

const financePageFiles = filesBelow("apps/enterprise-web/src/app/finance", "page.tsx");

for (const relativePath of financePageFiles) {
  const source = read(relativePath);
  const delegatesToGuardedRenderer =
    source.includes("renderErpFinanceFoundationPage") || source.includes("renderErpGlInquiryPage");
  const hasDirectGuard =
    source.includes("requireEnterprisePermission") && financePermissionPattern.test(source);

  assert.ok(
    delegatesToGuardedRenderer || hasDirectGuard,
    `${relativePath} must use a direct Finance guard or a guarded Finance renderer.`
  );
  assert.doesNotMatch(source, broadPermissionPattern, `${relativePath} retains a broad permission.`);
}

const financeApiFiles = filesBelow("apps/enterprise-web/src/app/api/finance", "route.ts");

for (const relativePath of financeApiFiles) {
  const source = read(relativePath);
  assert.ok(
    source.includes("assertEnterprisePermission") && financePermissionPattern.test(source),
    `${relativePath} must assert a dedicated Finance permission.`
  );
  assert.doesNotMatch(source, broadPermissionPattern, `${relativePath} retains a broad permission.`);
}

for (const relativePath of [
  "apps/enterprise-web/src/app/api/finance/ar-ap-settlements/[allocationId]/post/route.ts",
  "apps/enterprise-web/src/app/api/finance/cashbook/entries/[entryId]/post/route.ts",
  "apps/enterprise-web/src/app/api/finance/fixed-assets/transactions/post/route.ts",
  "apps/enterprise-web/src/app/api/finance/foundation/journal-batches/route.ts",
  "apps/enterprise-web/src/app/api/finance/operational-documents/[documentId]/post/route.ts",
  "apps/enterprise-web/src/app/api/finance/payroll-gl/batches/[batchId]/post/route.ts",
  "apps/enterprise-web/src/app/api/finance/recurring-journals/drafts/[journalBatchId]/post/route.ts"
] as const) {
  assertContains(relativePath, ['assertEnterprisePermission(["finance.post"])']);
}

for (const relativePath of [
  "apps/enterprise-web/src/app/api/finance/period-close/route.ts",
  "apps/enterprise-web/src/app/api/finance/foundation/journals/[journalEntryId]/reverse/route.ts",
  "apps/enterprise-web/src/app/api/finance/bank-reconciliation/matches/[matchId]/reverse/route.ts"
] as const) {
  assertContains(relativePath, ['assertEnterprisePermission(["finance.approve"])']);
}

assertContains("apps/enterprise-web/src/app/api/finance/budgets/versions/route.ts", [
  'assertEnterprisePermission(["finance.manage"])',
  'approvalStatuses = new Set(["APPROVED", "LOCKED"])',
  'assertEnterprisePermission(["finance.approve"])'
]);

assertContains("apps/enterprise-web/src/app/fuel-operations/page.tsx", [
  'requireEnterprisePermission(["fuel.hq.view"])'
]);
assertContains("apps/enterprise-web/src/app/fuel-operations/_fuel-page.tsx", [
  'requireEnterprisePermission(["fuel.hq.view"])'
]);

for (const relativePath of filesBelow("apps/enterprise-web/src/app/fuel-operations", "page.tsx")) {
  const source = read(relativePath);
  assert.ok(
    source.includes('requireEnterprisePermission(["fuel.hq.view"])') ||
      source.includes("FuelOperationsDedicatedPage"),
    `${relativePath} must use the HQ fuel view guard.`
  );
  assert.doesNotMatch(source, broadPermissionPattern, `${relativePath} retains a broad permission.`);
}

for (const relativePath of filesBelow("apps/enterprise-web/src/app/api/fuel-operations", "route.ts")) {
  const source = read(relativePath);
  const expectedPermission = relativePath.endsWith("evidence/[fileName]/route.ts")
    ? "fuel.hq.view"
    : "fuel.hq.manage";

  assert.ok(
    source.includes(`"${expectedPermission}"`),
    `${relativePath} must use ${expectedPermission} for HQ access.`
  );
  assert.doesNotMatch(source, broadPermissionPattern, `${relativePath} retains a broad permission.`);
}

assertContains("apps/enterprise-web/src/app/api/settings/fuel-operations/route.ts", [
  'assertEnterprisePermission(["fuel.hq.manage"])'
]);
assertContains("apps/enterprise-web/src/app/settings/[view]/page.tsx", [
  '"fuel-operations": "fuel.hq.manage"'
]);

const migration = read(
  "prisma/migrations-sqlserver/20260922040000_finance_fuel_permissions/migration.sql"
);
for (const permissionCode of dedicatedPermissionCodes) {
  assert.ok(migration.includes(`N'${permissionCode}'`), `Migration must seed ${permissionCode}.`);
}
assert.ok(migration.includes("[role].[code] = N'HQ_ADMIN'"), "Migration must grant HQ_ADMIN.");
assert.ok(!migration.includes("FLASH_SUPPORT"), "Migration must not grant FLASH_SUPPORT.");
assert.ok(!migration.includes("ONLINE_STORE_"), "Migration must not grant Online Store roles.");

console.log(
  `Finance and HQ fuel permission gate passed (${financePageFiles.length} Finance pages, ${financeApiFiles.length} Finance APIs).`
);
