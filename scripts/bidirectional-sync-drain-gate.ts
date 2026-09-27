import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { StoreSyncActionResult } from "../apps/store-desktop/src/shared/desktop-runtime.js";
import {
  runBoundedStoreSyncDrain,
  storeSyncResultHasPendingWork,
} from "../apps/store-desktop/src/shared/store-sync-drain.js";

const snapshot = {} as StoreSyncActionResult["snapshot"];

function result(
  input: Partial<StoreSyncActionResult>,
): StoreSyncActionResult {
  return {
    message: "sync cycle completed",
    snapshot,
    succeeded: true,
    latestCursor: null,
    ...input,
  };
}

async function verifyBidirectionalDrain() {
  const cycles = [
    result({
      upstreamProcessed: 25,
      upstreamStillPending: true,
      latestCursor: "cursor-1",
    }),
    result({
      downstreamApplied: 5,
      downstreamAcknowledged: 5,
      downstreamLimitReached: true,
      latestCursor: "cursor-2",
    }),
    result({
      upstreamProcessed: 10,
      downstreamAcknowledged: 2,
      upstreamStillPending: false,
      acknowledgementsStillPending: false,
      downstreamLimitReached: false,
      latestCursor: "cursor-2",
    }),
  ];

  const drained = await runBoundedStoreSyncDrain({
    drainQueues: true,
    maxCycles: 20,
    maxDurationMs: 60_000,
    pauseMs: 0,
    runCycle: async (cycle) => cycles[cycle - 1]!,
  });

  assert.equal(drained.syncDrainCycles, 3);
  assert.equal(drained.syncDrainStopReason, "caught-up");
  assert.equal(drained.upstreamProcessed, 35);
  assert.equal(drained.downstreamApplied, 5);
  assert.equal(drained.downstreamAcknowledged, 7);
  assert.equal(storeSyncResultHasPendingWork(drained), false);
}

async function verifyNoProgressGuard() {
  const stalled = await runBoundedStoreSyncDrain({
    drainQueues: true,
    maxCycles: 20,
    maxDurationMs: 60_000,
    pauseMs: 0,
    runCycle: async () =>
      result({
        upstreamStillPending: true,
      }),
  });

  assert.equal(stalled.syncDrainCycles, 2);
  assert.equal(stalled.syncDrainStopReason, "no-progress");
  assert.equal(stalled.upstreamStillPending, true);
}

async function verifySingleCycleCompatibility() {
  const single = await runBoundedStoreSyncDrain({
    drainQueues: false,
    maxCycles: 20,
    maxDurationMs: 60_000,
    pauseMs: 0,
    runCycle: async () =>
      result({
        downstreamLimitReached: true,
      }),
  });

  assert.equal(single.syncDrainCycles, 1);
  assert.equal(single.syncDrainStopReason, "single-cycle");
}

async function verifyFailureStopsImmediately() {
  await assert.rejects(
    runBoundedStoreSyncDrain({
      drainQueues: true,
      maxCycles: 20,
      maxDurationMs: 60_000,
      pauseMs: 0,
      runCycle: async () =>
        result({
          succeeded: false,
          message: "transport failed",
          upstreamStillPending: true,
        }),
    }),
    /transport failed/,
  );
}

function verifyRuntimeWiring() {
  const root = process.cwd();
  const renderer = readFileSync(
    path.join(root, "apps/store-desktop/src/renderer/modern-app.tsx"),
    "utf8",
  );
  const electronMain = readFileSync(
    path.join(root, "apps/store-desktop/electron/main.ts"),
    "utf8",
  );
  const isolatedWorker = readFileSync(
    path.join(root, "apps/store-desktop/src/main/store-sync-worker-runtime.ts"),
    "utf8",
  );

  assert.match(
    renderer,
    /trigger:\s*"scheduled",[\s\S]{0,160}drainDownstream:\s*true/,
  );
  assert.match(electronMain, /runBoundedStoreSyncDrain\(/);
  assert.match(electronMain, /drainDownstream:\s*false/);
  assert.match(electronMain, /return config\.role === "embedded"/);
  assert.match(electronMain, /defaultDetachedSyncDrainCycleLimit\s*=\s*250/);
  assert.match(electronMain, /FLASH_ERP_DESKTOP_SYNC_DRAIN_BUDGET_MS"[,]?\s*\r?\n\s*300_000/);
  assert.match(isolatedWorker, /runBoundedStoreSyncDrain\(/);
  assert.match(isolatedWorker, /drainDownstream:\s*false/);

  for (const file of [
    "apps/store-desktop/src/main/offline/local-store-service.ts",
    "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
    "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
  ]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, /upstreamStillPending/);
    assert.match(source, /acknowledgementsStillPending/);
    assert.match(source, /downstreamAcknowledged/);
  }
}

async function main() {
  await verifyBidirectionalDrain();
  await verifyNoProgressGuard();
  await verifySingleCycleCompatibility();
  await verifyFailureStopsImmediately();
  verifyRuntimeWiring();

  console.log("Bidirectional bounded store sync drain acceptance passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
