import assert from "node:assert/strict";

import {
  applyStoreSyncCycleStatusToSnapshot,
  type StoreSyncCycleStatusEvent,
  type StoreSyncSnapshot,
} from "../apps/store-desktop/src/shared/desktop-runtime.js";

const activeOperatorSession = { sessionId: "session-1", loginId: "cashier" };
const activeBasket = { transactionId: "basket-1", lines: [{ lineId: "line-1" }] };
const snapshot = {
  activeOperatorSession,
  activeBasket,
  recentTransactions: [{ transactionId: "sale-1" }],
  lastSyncAt: "2026-09-27T09:00:00.000Z",
  generatedAt: "2026-09-27T09:00:00.000Z",
  syncPolicy: {
    autoSyncEnabled: true,
    intervalMinutes: 5,
    activeFromMinutes: 0,
    activeToMinutes: 1440,
    jitterSeconds: 0,
    backoffBaseSeconds: 30,
    backoffMaxSeconds: 300,
    nextScheduledSyncAt: "2026-09-27T09:05:00.000Z",
    lastManualSyncAt: null,
    lastAutoSyncAt: "2026-09-27T09:00:00.000Z",
  },
} as StoreSyncSnapshot;
const completedStatus: StoreSyncCycleStatusEvent = {
  traceId: "sync-1",
  trigger: "scheduled",
  status: "completed",
  message: "Sync completed.",
  elapsedMs: 1_500,
  completedAt: "2026-09-27T09:10:00.000Z",
};

const completed = applyStoreSyncCycleStatusToSnapshot(snapshot, completedStatus);

assert.ok(completed);
assert.strictEqual(completed.activeOperatorSession, activeOperatorSession);
assert.strictEqual(completed.activeBasket, activeBasket);
assert.strictEqual(completed.recentTransactions, snapshot.recentTransactions);
assert.equal(completed.lastSyncAt, completedStatus.completedAt);
assert.equal(completed.syncPolicy.lastAutoSyncAt, completedStatus.completedAt);
assert.equal(
  completed.syncPolicy.nextScheduledSyncAt,
  "2026-09-27T09:15:00.000Z",
);

const failedStatus: StoreSyncCycleStatusEvent = {
  ...completedStatus,
  status: "failed",
  completedAt: "2026-09-27T09:20:00.000Z",
};
assert.strictEqual(
  applyStoreSyncCycleStatusToSnapshot(snapshot, failedStatus),
  snapshot,
);

console.log("Desktop session continuity acceptance passed.");
