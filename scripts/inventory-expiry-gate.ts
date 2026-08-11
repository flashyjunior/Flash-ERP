import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  allocateInventoryBatchesFefo,
  deriveInventoryBatchStatus,
  validateInventoryBatchReceipt,
} from "../packages/domain/src/inventory-expiry";

const workspaceRoot = process.cwd();

function requireIncludes(
  relativePath: string,
  needles: string[],
  label: string,
) {
  const source = readFileSync(path.join(workspaceRoot, relativePath), "utf8");

  for (const needle of needles) {
    assert.ok(
      source.includes(needle),
      `${label} is missing ${JSON.stringify(needle)} in ${relativePath}.`,
    );
  }
}

function requireExcludes(
  relativePath: string,
  needles: string[],
  label: string,
) {
  const source = readFileSync(path.join(workspaceRoot, relativePath), "utf8");

  for (const needle of needles) {
    assert.ok(
      !source.includes(needle),
      `${label} must not contain ${JSON.stringify(needle)} in ${relativePath}.`,
    );
  }
}

assert.throws(
  () =>
    validateInventoryBatchReceipt({
      productName: "Screen wipes",
      trackExpiry: true,
      batchNo: "",
      expiryDate: "2027-01-01",
      receivedAt: "2026-08-10",
    }),
  /batch or lot number/i,
);

assert.throws(
  () =>
    validateInventoryBatchReceipt({
      productName: "Screen wipes",
      trackExpiry: true,
      batchNo: "WIPES-OLD",
      expiryDate: "2026-08-09",
      receivedAt: "2026-08-10",
    }),
  /expired/i,
);

assert.deepEqual(
  validateInventoryBatchReceipt({
    productName: "Screen wipes",
    trackExpiry: true,
    batchNo: " wipes-new ",
    manufacturedAt: "2026-01-01",
    expiryDate: "2027-01-01",
    receivedAt: "2026-08-10",
  }),
  {
    batchNo: "WIPES-NEW",
    manufacturedAt: "2026-01-01",
    expiryDate: "2027-01-01",
  },
);

const allocations = allocateInventoryBatchesFefo({
  productName: "Repair adhesive",
  quantity: 7,
  at: "2026-08-10",
  batches: [
    {
      batchId: "expired",
      batchNo: "OLD",
      expiryDate: "2026-08-09",
      quantityOnHand: 20,
      status: "ACTIVE",
    },
    {
      batchId: "later",
      batchNo: "LATER",
      expiryDate: "2027-06-01",
      quantityOnHand: 10,
      status: "ACTIVE",
    },
    {
      batchId: "first",
      batchNo: "FIRST",
      expiryDate: "2026-12-01",
      quantityOnHand: 5,
      status: "ACTIVE",
    },
  ],
});

assert.deepEqual(
  allocations.map(({ batchId, quantity }) => ({ batchId, quantity })),
  [
    { batchId: "first", quantity: 5 },
    { batchId: "later", quantity: 2 },
  ],
);

const preferredAllocations = allocateInventoryBatchesFefo({
  productName: "Repair adhesive",
  quantity: 7,
  preferredBatchId: "later",
  at: "2026-08-10",
  batches: [
    {
      batchId: "later",
      batchNo: "LATER",
      expiryDate: "2027-06-01",
      quantityOnHand: 4,
      status: "ACTIVE",
    },
    {
      batchId: "first",
      batchNo: "FIRST",
      expiryDate: "2026-12-01",
      quantityOnHand: 5,
      status: "ACTIVE",
    },
  ],
});

assert.deepEqual(
  preferredAllocations.map(({ batchId, quantity }) => ({ batchId, quantity })),
  [
    { batchId: "later", quantity: 4 },
    { batchId: "first", quantity: 3 },
  ],
);
assert.throws(
  () =>
    allocateInventoryBatchesFefo({
      productName: "Repair adhesive",
      quantity: 1,
      preferredBatchId: "missing",
      at: "2026-08-10",
      batches: [
        {
          batchId: "first",
          batchNo: "FIRST",
          expiryDate: "2026-12-01",
          quantityOnHand: 5,
          status: "ACTIVE",
        },
      ],
    }),
  /selected batch.*no longer available/i,
);
assert.equal(
  deriveInventoryBatchStatus({
    expiryDate: "2026-08-09",
    quantityOnHand: 4,
    at: "2026-08-10",
  }),
  "EXPIRED",
);
assert.equal(
  deriveInventoryBatchStatus({
    expiryDate: "2027-01-01",
    quantityOnHand: 0,
    at: "2026-08-10",
  }),
  "DEPLETED",
);

for (const [relativePath, label] of [
  [
    "apps/store-desktop/src/main/offline/local-store-service.ts",
    "SQLite provider",
  ],
  [
    "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
    "PostgreSQL provider",
  ],
  [
    "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
    "SQL Server provider",
  ],
] as const) {
  requireIncludes(
    relativePath,
    [
      "inventory_batch_registry",
      "allocateInventoryBatchesFefo",
      "preferredBatchId",
      "batch_allocations_json",
      "previous_batch_quantities_json",
      "issued_batch_allocations_json",
    ],
    label,
  );
}

requireIncludes(
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
  ["inventoryBatch", "allocateInventoryBatchesFefo", "preferredBatchId", "batchCounts"],
  "Online store",
);
for (const [relativePath, label] of [
  [
    "apps/store-desktop/src/renderer/modern-app.tsx",
    "Desktop batch selector",
  ],
  [
    "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
    "Online-store batch selector",
  ],
] as const) {
  requireIncludes(
    relativePath,
    ["is-batch-selection", "preferredBatchId", "Automatic FEFO"],
    label,
  );
}
requireIncludes(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts",
  [
    "increaseEnterpriseInventoryBatches",
    "decreaseEnterpriseInventoryBatches",
    "previousBatchQuantitiesSnapshot",
  ],
  "HQ sync projection",
);

for (const [relativePath, label] of [
  [
    "apps/enterprise-web/src/server/repositories/enterprise-settings.repository.ts",
    "HQ expiry alert settings",
  ],
  [
    "apps/enterprise-web/src/server/repositories/store-sync.repository.ts",
    "HQ expiry alert publication",
  ],
  [
    "apps/store-desktop/src/main/offline/local-store-service.ts",
    "SQLite expiry alert settings",
  ],
  [
    "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
    "PostgreSQL expiry alert settings",
  ],
  [
    "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
    "SQL Server expiry alert settings",
  ],
  [
    "apps/store-desktop/src/renderer/modern-app.tsx",
    "Desktop expiry alert UI",
  ],
  [
    "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
    "Online-store expiry alert UI",
  ],
] as const) {
  requireIncludes(
    relativePath,
    ["expiryAlertLeadDays", "expiryCriticalDays"],
    label,
  );
}

requireExcludes(
  "apps/store-desktop/src/renderer/modern-app.tsx",
  ['className="rms-action-button is-save-order"'],
  "Desktop sales-order action rail",
);
requireExcludes(
  "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
  ['className="rms-action-button is-save-order"'],
  "Online-store sales-order action rail",
);

for (const relativePath of [
  "prisma/migrations/20260810_01_expiry_batch_inventory/migration.sql",
  "apps/enterprise-web/src/server/repositories/schema-compatibility.repository.ts",
]) {
  requireIncludes(
    relativePath,
    [
      "[retailOrgId] NVARCHAR(1000) NOT NULL",
      "[inventoryLocationId] NVARCHAR(1000) NOT NULL",
      "[productId] NVARCHAR(1000) NOT NULL",
      "ALTER COLUMN [retailOrgId] NVARCHAR(1000) NOT NULL",
    ],
    "SQL Server expiry schema compatibility",
  );
  requireExcludes(
    relativePath,
    ["ADD CONSTRAINT [InventoryBatch_retailOrgId_fkey]"],
    "Prisma-managed SQL Server expiry relations",
  );
}

console.log("Inventory expiry acceptance gate passed.");
