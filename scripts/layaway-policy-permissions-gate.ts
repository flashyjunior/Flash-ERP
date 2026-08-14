import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";
import {
  defaultLayawaySettings,
  normalizeLayawaySettings,
  type LayawaySettings,
} from "../packages/domain/src/layaway-settings";
import {
  groupSecurityPermissions,
  securityPermissionCatalog,
} from "../packages/domain/src/security-permissions";

const workspaceRoot = process.cwd();
const layawayPermissionCodes = [
  "pos.layaway.create",
  "pos.layaway.payment.receive",
  "pos.layaway.cancel-refund",
  "pos.layaway.reservation.release",
  "pos.layaway.policy.override",
  "pos.layaway.fulfil",
] as const;
const layawayMetadata = {
  layaway_enabled: "1",
  layaway_reserve_stock_on_deposit: "1",
  layaway_minimum_deposit_percent: "25.00",
  layaway_require_full_payment_before_fulfilment: "1",
  layaway_refund_payments_on_cancellation: "1",
  layaway_cancellation_fee_type: "FIXED_AMOUNT",
  layaway_cancellation_fee_value: "15.00",
} as const;
const customPolicy: LayawaySettings = {
  enabled: true,
  reserveStockOnDeposit: true,
  minimumDepositPercent: 25,
  requireFullPaymentBeforeFulfilment: true,
  refundPaymentsOnCancellation: true,
  cancellationFeeType: "FIXED_AMOUNT",
  cancellationFeeValue: 15,
};

function requireIncludes(relativePath: string, needles: readonly string[]) {
  const source = readFileSync(path.join(workspaceRoot, relativePath), "utf8");

  for (const needle of needles) {
    assert.ok(
      source.includes(needle),
      `Layaway policy gate is missing ${JSON.stringify(needle)} in ${relativePath}.`,
    );
  }
}

function readMetadata(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT key, value
       FROM app_metadata
       WHERE key LIKE 'layaway_%'`,
    )
    .all() as Array<{ key: string; value: string }>;

  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function readRolePermissions(db: DatabaseSync, roleCode: string) {
  const row = db
    .prepare(
      `SELECT permission_codes_json
       FROM role_snapshot
       WHERE role_code = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .get(roleCode) as { permission_codes_json: string | null } | undefined;

  assert.ok(row, `Expected persisted standalone role ${roleCode}.`);
  return JSON.parse(row.permission_codes_json ?? "[]") as string[];
}

assert.deepEqual(defaultLayawaySettings, {
  enabled: false,
  reserveStockOnDeposit: true,
  minimumDepositPercent: 20,
  requireFullPaymentBeforeFulfilment: true,
  refundPaymentsOnCancellation: true,
  cancellationFeeType: "PERCENTAGE",
  cancellationFeeValue: 0,
});
assert.deepEqual(normalizeLayawaySettings(customPolicy), customPolicy);
assert.deepEqual(
  normalizeLayawaySettings({
    minimumDepositPercent: 120,
    cancellationFeeType: "PERCENTAGE",
    cancellationFeeValue: -5,
  }),
  {
    ...defaultLayawaySettings,
    minimumDepositPercent: 100,
    cancellationFeeValue: 0,
  },
);

const layawayDefinitions = securityPermissionCatalog.filter((permission) =>
  layawayPermissionCodes.includes(
    permission.code as (typeof layawayPermissionCodes)[number],
  ),
);
assert.deepEqual(
  layawayDefinitions.map((permission) => permission.code).sort(),
  [...layawayPermissionCodes].sort(),
);
for (const permission of layawayDefinitions) {
  assert.equal(permission.domain, "POS");
  assert.equal(permission.group, "Layaway");
  assert.equal(permission.surface, "store");
}
const groupedLayawayPermissions = groupSecurityPermissions([
  ...layawayPermissionCodes,
]);
assert.deepEqual(
  groupedLayawayPermissions
    .flatMap((domain) => domain.groups)
    .find((group) => group.group === "Layaway")
    ?.permissions.map((permission) => permission.code)
    .sort(),
  [...layawayPermissionCodes].sort(),
);

requireIncludes(
  "apps/enterprise-web/src/components/enterprise/enterprise-settings-workspace.tsx",
  [
    '{ key: "layaway", label: "Layaway" }',
    'title="Layaway policy"',
    "reserveStockOnDeposit",
    "minimumDepositPercent",
    "requireFullPaymentBeforeFulfilment",
    "refundPaymentsOnCancellation",
    "cancellationFeeType",
    "cancellationFeeValue",
  ],
);
requireIncludes(
  "apps/enterprise-web/src/server/repositories/enterprise-settings.repository.ts",
  [
    "normalizeLayawaySettingsForUpdate",
    "Layaway minimum deposit must be between 0% and 100%.",
    "Layaway cancellation fee",
    "layawaySettings: normalizeLayawaySettingsForUpdate(",
  ],
);
requireIncludes("packages/sync-core/src/contracts.ts", [
  "layawaySettings?: LayawaySettings | null;",
]);
for (const domainIndexPath of [
  "packages/domain/src/index.ts",
  "packages/domain/src/index.js",
] as const) {
  requireIncludes(domainIndexPath, ['export * from "./layaway.js";']);
}
requireIncludes("packages/domain/src/layaway.js", [
  "buildLayawayPolicySnapshot",
  "evaluateLayawayOpening",
  "calculateLayawayCancellationAmounts",
  "calculateLayawayAvailableBaseQuantity",
  "assertLayawayFulfilmentEligible",
]);
requireIncludes("scripts/bootstrap-store-operators.ts", [
  "layawayCashierPermissionCodes",
  "layawaySupervisorPermissionCodes",
  "...layawayCashierPermissionCodes",
  "...layawaySupervisorPermissionCodes",
  ...layawayPermissionCodes,
]);
requireIncludes(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts",
  [
    "function readLayawaySettings",
    "layawaySettings: readLayawaySettings(",
  ],
);
requireIncludes(
  "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
  [
    '{ id: "layaway", label: "Layaway" }',
    "settings.layawaySettings.reserveStockOnDeposit",
    "settings.layawaySettings.minimumDepositPercent",
    "settings.layawaySettings.cancellationFeeValue",
  ],
);

const desktopProviderPaths = [
  "apps/store-desktop/src/main/offline/local-store-service.ts",
  "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
  "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
] as const;
for (const providerPath of desktopProviderPaths) {
  requireIncludes(providerPath, [
    ...Object.keys(layawayMetadata),
    ...layawayPermissionCodes,
  ]);
}
requireIncludes("apps/store-desktop/src/renderer/modern-app.tsx", [
  '{ id: "layaway", label: "Layaway" }',
  "runtime.saveStandaloneSettings({ layawaySettings: layawayDraft })",
  "settings.layawaySettings.requireFullPaymentBeforeFulfilment",
  ...layawayPermissionCodes,
]);

const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "flash-erp-layaway-policy-"),
);
const databasePath = path.join(temporaryDirectory, "store.db");
const serviceOptions = {
  databasePath,
  deploymentMode: "STANDALONE" as const,
  nodeCode: "layaway-policy-gate-node",
  terminalCode: "LAYAWAY-GATE-01",
};
const loginId = "layaway.gate.admin";
const password = "LayawayGateAdmin123!";
let service: LocalStoreService | null = new LocalStoreService(
  temporaryDirectory,
  serviceOptions,
);

try {
  service.bootstrapStandaloneAdmin({
    loginId,
    displayName: "Layaway Gate Admin",
    password,
  });
  service.signInOperator({ loginId, password });
  service.saveStandaloneSettings({ layawaySettings: customPolicy });
  service.saveStandaloneRole({
    roleCode: "LAYAWAY-SUPERVISOR",
    roleName: "Layaway Supervisor",
    description: "Acceptance role for the governed layaway lifecycle.",
    status: "ACTIVE",
    permissionCodes: [...layawayPermissionCodes],
    cashierEligible: true,
    supervisorEligible: true,
  });

  let internals = service as unknown as { db: DatabaseSync };
  assert.deepEqual(readMetadata(internals.db), layawayMetadata);
  assert.deepEqual(
    readRolePermissions(internals.db, "LAYAWAY-SUPERVISOR").sort(),
    [...layawayPermissionCodes].sort(),
  );

  service.close();
  service = null;

  const reopenedService = new LocalStoreService(
    temporaryDirectory,
    serviceOptions,
  );
  service = reopenedService;
  reopenedService.signInOperator({ loginId, password });
  internals = reopenedService as unknown as { db: DatabaseSync };
  assert.deepEqual(readMetadata(internals.db), layawayMetadata);
  assert.deepEqual(
    readRolePermissions(internals.db, "LAYAWAY-SUPERVISOR").sort(),
    [...layawayPermissionCodes].sort(),
  );

  const snapshot = reopenedService.getSyncSnapshot();
  const persistedRole = snapshot.standaloneRoles?.find(
    (role) => role.roleCode === "LAYAWAY-SUPERVISOR",
  );
  assert.ok(persistedRole, "Expected the custom layaway role after restart.");
  assert.deepEqual(
    [...persistedRole.permissionCodes].sort(),
    [...layawayPermissionCodes].sort(),
  );
} finally {
  service?.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  "Layaway policy and permissions gate passed: HQ policy, sync/provider wiring, persisted standalone settings, and granular role permissions agree.",
);
