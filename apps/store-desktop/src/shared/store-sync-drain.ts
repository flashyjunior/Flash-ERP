import type { StoreSyncActionResult } from "./desktop-runtime.js";

export type StoreSyncDrainStopReason =
  | "single-cycle"
  | "caught-up"
  | "no-progress"
  | "cycle-limit"
  | "time-limit";

export type StoreSyncDrainSessionOptions = {
  drainQueues: boolean;
  maxCycles: number;
  maxDurationMs: number;
  pauseMs: number;
  runCycle: (cycle: number) => Promise<StoreSyncActionResult>;
  onCycleCompleted?: (input: {
    cycle: number;
    result: StoreSyncActionResult;
    pendingWork: boolean;
  }) => void;
};

export function storeSyncResultHasPendingWork(result: StoreSyncActionResult) {
  return (
    result.downstreamLimitReached === true ||
    result.upstreamStillPending === true ||
    result.acknowledgementsStillPending === true
  );
}

function wait(delayMs: number) {
  return delayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

export async function runBoundedStoreSyncDrain(
  input: StoreSyncDrainSessionOptions,
): Promise<StoreSyncActionResult> {
  const startedAtMs = Date.now();
  const maxCycles = Math.max(1, Math.trunc(input.maxCycles));
  const maxDurationMs = Math.max(1_000, Math.trunc(input.maxDurationMs));
  const pauseMs = Math.max(0, Math.trunc(input.pauseMs));
  let lastResult: StoreSyncActionResult | null = null;
  let previousCursor: string | null | undefined;
  let consecutiveNoProgressCycles = 0;
  let cycleCount = 0;
  let totalUpstreamProcessed = 0;
  let totalDownstreamApplied = 0;
  let totalDownstreamAcknowledged = 0;
  let totalDownstreamPullPasses = 0;
  let stopReason: StoreSyncDrainStopReason = input.drainQueues
    ? "cycle-limit"
    : "single-cycle";

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    if (cycle > 1 && Date.now() - startedAtMs >= maxDurationMs) {
      stopReason = "time-limit";
      break;
    }

    const result = await input.runCycle(cycle);

    if (result.succeeded === false) {
      throw new Error(result.message);
    }

    lastResult = result;
    cycleCount = cycle;
    totalUpstreamProcessed += result.upstreamProcessed ?? 0;
    totalDownstreamApplied += result.downstreamApplied ?? 0;
    totalDownstreamAcknowledged += result.downstreamAcknowledged ?? 0;
    totalDownstreamPullPasses += result.downstreamPullPasses ?? 0;

    const pendingWork = storeSyncResultHasPendingWork(result);
    const madeProgress =
      (result.upstreamProcessed ?? 0) > 0 ||
      (result.downstreamApplied ?? 0) > 0 ||
      (result.downstreamAcknowledged ?? 0) > 0 ||
      (Boolean(result.latestCursor) && result.latestCursor !== previousCursor);

    consecutiveNoProgressCycles = madeProgress
      ? 0
      : consecutiveNoProgressCycles + 1;
    previousCursor = result.latestCursor;
    input.onCycleCompleted?.({ cycle, result, pendingWork });

    if (!input.drainQueues) {
      stopReason = "single-cycle";
      break;
    }

    if (!pendingWork) {
      stopReason = "caught-up";
      break;
    }

    if (consecutiveNoProgressCycles >= 2) {
      stopReason = "no-progress";
      break;
    }

    if (cycle >= maxCycles) {
      stopReason = "cycle-limit";
      break;
    }

    if (Date.now() - startedAtMs >= maxDurationMs) {
      stopReason = "time-limit";
      break;
    }

    await wait(pauseMs);
  }

  if (!lastResult) {
    throw new Error("The store sync drain ended before a sync cycle could run.");
  }

  return {
    ...lastResult,
    upstreamProcessed: totalUpstreamProcessed,
    downstreamApplied: totalDownstreamApplied,
    downstreamAcknowledged: totalDownstreamAcknowledged,
    downstreamPullPasses: totalDownstreamPullPasses,
    syncDrainCycles: cycleCount,
    syncDrainStopReason: stopReason,
  };
}
