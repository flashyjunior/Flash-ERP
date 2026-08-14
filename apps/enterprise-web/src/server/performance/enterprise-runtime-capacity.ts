import { monitorEventLoopDelay } from "node:perf_hooks";

export type EnterpriseOperationClass =
  | "PUBLIC_READ"
  | "AUTHENTICATED_READ"
  | "TRANSACTIONAL_WRITE"
  | "BACKGROUND";

type OperationMetric = {
  active: number;
  queued: number;
  accepted: number;
  completed: number;
  failed: number;
  rejected: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

type Waiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type RuntimeState = {
  startedAt: number;
  metrics: Record<EnterpriseOperationClass, OperationMetric>;
  waiters: Record<EnterpriseOperationClass, Waiter[]>;
  databasePoolErrors: number;
  databaseConnectionErrors: number;
  databaseQueryCount: number;
  databaseSlowQueryCount: number;
  databaseTotalQueryDurationMs: number;
  databaseMaxQueryDurationMs: number;
  lastSlowQueryAt: string | null;
  lastSlowQueryTarget: string | null;
  lastDatabaseErrorAt: string | null;
  eventLoop: ReturnType<typeof monitorEventLoopDelay>;
};

const operationClasses: EnterpriseOperationClass[] = [
  "PUBLIC_READ",
  "AUTHENTICATED_READ",
  "TRANSACTIONAL_WRITE",
  "BACKGROUND"
];

function emptyMetric(): OperationMetric {
  return {
    active: 0,
    queued: 0,
    accepted: 0,
    completed: 0,
    failed: 0,
    rejected: 0,
    totalDurationMs: 0,
    maxDurationMs: 0
  };
}

const globalForCapacity = globalThis as unknown as {
  flashErpEnterpriseRuntimeCapacity?: RuntimeState;
};

const state = globalForCapacity.flashErpEnterpriseRuntimeCapacity ?? (() => {
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  return {
    startedAt: Date.now(),
    metrics: {
      PUBLIC_READ: emptyMetric(),
      AUTHENTICATED_READ: emptyMetric(),
      TRANSACTIONAL_WRITE: emptyMetric(),
      BACKGROUND: emptyMetric()
    },
    waiters: {
      PUBLIC_READ: [],
      AUTHENTICATED_READ: [],
      TRANSACTIONAL_WRITE: [],
      BACKGROUND: []
    },
    databasePoolErrors: 0,
    databaseConnectionErrors: 0,
    databaseQueryCount: 0,
    databaseSlowQueryCount: 0,
    databaseTotalQueryDurationMs: 0,
    databaseMaxQueryDurationMs: 0,
    lastSlowQueryAt: null,
    lastSlowQueryTarget: null,
    lastDatabaseErrorAt: null,
    eventLoop
  };
})();

globalForCapacity.flashErpEnterpriseRuntimeCapacity = state;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function operationLimit(operationClass: EnterpriseOperationClass) {
  const defaults: Record<EnterpriseOperationClass, number> = {
    PUBLIC_READ: 64,
    AUTHENTICATED_READ: 48,
    TRANSACTIONAL_WRITE: 24,
    BACKGROUND: 12
  };
  return positiveInteger(
    process.env[`FLASH_ERP_CAPACITY_${operationClass}_CONCURRENCY`],
    defaults[operationClass]
  );
}

export class EnterpriseCapacityError extends Error {
  readonly status = 503;
  readonly code = "ENTERPRISE_CAPACITY_BUSY";

  constructor(message = "Flash ERP is handling unusually high demand. Try again shortly.") {
    super(message);
    this.name = "EnterpriseCapacityError";
  }
}

async function acquire(operationClass: EnterpriseOperationClass) {
  const metric = state.metrics[operationClass];
  if (metric.active < operationLimit(operationClass)) {
    metric.active += 1;
    metric.accepted += 1;
    return;
  }

  const queue = state.waiters[operationClass];
  const maxQueue = positiveInteger(process.env.FLASH_ERP_CAPACITY_MAX_QUEUE, 512);
  if (queue.length >= maxQueue) {
    metric.rejected += 1;
    throw new EnterpriseCapacityError();
  }

  const waitTimeoutMs = positiveInteger(process.env.FLASH_ERP_CAPACITY_QUEUE_TIMEOUT_MS, 10_000);
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        const index = queue.indexOf(waiter);
        if (index >= 0) queue.splice(index, 1);
        metric.queued = queue.length;
        metric.rejected += 1;
        reject(new EnterpriseCapacityError());
      }, waitTimeoutMs)
    };
    queue.push(waiter);
    metric.queued = queue.length;
  });

  metric.accepted += 1;
}

function release(operationClass: EnterpriseOperationClass) {
  const metric = state.metrics[operationClass];
  const queue = state.waiters[operationClass];
  const waiter = queue.shift();
  metric.queued = queue.length;
  if (waiter) {
    clearTimeout(waiter.timeout);
    waiter.resolve();
    return;
  }
  metric.active = Math.max(0, metric.active - 1);
}

export async function runEnterpriseOperation<T>(
  operationClass: EnterpriseOperationClass,
  operation: () => Promise<T>
): Promise<T> {
  await acquire(operationClass);
  const startedAt = performance.now();
  const metric = state.metrics[operationClass];

  try {
    const result = await operation();
    metric.completed += 1;
    return result;
  } catch (error) {
    metric.failed += 1;
    throw error;
  } finally {
    const durationMs = performance.now() - startedAt;
    metric.totalDurationMs += durationMs;
    metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
    release(operationClass);
  }
}

export function recordEnterpriseDatabaseError(kind: "POOL" | "CONNECTION") {
  if (kind === "POOL") state.databasePoolErrors += 1;
  else state.databaseConnectionErrors += 1;
  state.lastDatabaseErrorAt = new Date().toISOString();
}

export function recordEnterpriseDatabaseQuery(durationMs: number, target?: string) {
  const normalizedDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const slowQueryThresholdMs = positiveInteger(process.env.FLASH_ERP_DB_SLOW_QUERY_MS, 1_000);
  state.databaseQueryCount += 1;
  state.databaseTotalQueryDurationMs += normalizedDuration;
  state.databaseMaxQueryDurationMs = Math.max(
    state.databaseMaxQueryDurationMs,
    normalizedDuration
  );

  if (normalizedDuration >= slowQueryThresholdMs) {
    state.databaseSlowQueryCount += 1;
    state.lastSlowQueryAt = new Date().toISOString();
    state.lastSlowQueryTarget = target?.trim().slice(0, 160) || null;
  }
}

function roundMetric(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

export function getEnterpriseRuntimeCapacitySnapshot() {
  const memory = process.memoryUsage();
  const operations = Object.fromEntries(
    operationClasses.map((operationClass) => {
      const metric = state.metrics[operationClass];
      const finished = metric.completed + metric.failed;
      return [operationClass, {
        ...metric,
        averageDurationMs: finished > 0 ? roundMetric(metric.totalDurationMs / finished) : 0,
        maxDurationMs: roundMetric(metric.maxDurationMs),
        concurrencyLimit: operationLimit(operationClass)
      }];
    })
  );

  return {
    startedAt: new Date(state.startedAt).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    processId: process.pid,
    nodeVersion: process.version,
    memory: {
      rssMb: roundMetric(memory.rss / 1024 / 1024),
      heapUsedMb: roundMetric(memory.heapUsed / 1024 / 1024),
      heapTotalMb: roundMetric(memory.heapTotal / 1024 / 1024),
      externalMb: roundMetric(memory.external / 1024 / 1024)
    },
    eventLoop: {
      meanDelayMs: roundMetric(state.eventLoop.mean / 1_000_000),
      p95DelayMs: roundMetric(state.eventLoop.percentile(95) / 1_000_000),
      maxDelayMs: roundMetric(state.eventLoop.max / 1_000_000)
    },
    database: {
      poolErrors: state.databasePoolErrors,
      connectionErrors: state.databaseConnectionErrors,
      lastErrorAt: state.lastDatabaseErrorAt,
      queryCount: state.databaseQueryCount,
      slowQueryCount: state.databaseSlowQueryCount,
      slowQueryThresholdMs: positiveInteger(process.env.FLASH_ERP_DB_SLOW_QUERY_MS, 1_000),
      averageQueryDurationMs:
        state.databaseQueryCount > 0
          ? roundMetric(state.databaseTotalQueryDurationMs / state.databaseQueryCount)
          : 0,
      maxQueryDurationMs: roundMetric(state.databaseMaxQueryDurationMs),
      lastSlowQueryAt: state.lastSlowQueryAt,
      lastSlowQueryTarget: state.lastSlowQueryTarget
    },
    operations
  };
}
