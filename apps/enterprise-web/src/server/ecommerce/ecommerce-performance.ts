export const ecommerceOperationNames = [
  "CATALOG",
  "PRODUCT_DETAIL",
  "QUOTE",
  "ORDER_CREATE",
  "PAYMENT_INITIALIZE",
  "PAYMENT_VERIFY",
  "PAYMENT_WEBHOOK",
  "STAFF_QUEUE",
] as const;

export type EcommerceOperationName = (typeof ecommerceOperationNames)[number];

type EcommerceOperationMetric = {
  requests: number;
  completed: number;
  failed: number;
  totalDurationMs: number;
  maxDurationMs: number;
  samples: number[];
  lastCompletedAt: string | null;
  lastFailureAt: string | null;
};

type EcommercePerformanceState = {
  startedAt: number;
  scopes: Map<string, Map<EcommerceOperationName, EcommerceOperationMetric>>;
};

const globalForEcommercePerformance = globalThis as unknown as {
  flashErpEcommercePerformance?: EcommercePerformanceState;
};

const state = globalForEcommercePerformance.flashErpEcommercePerformance ?? {
  startedAt: Date.now(),
  scopes: new Map<string, Map<EcommerceOperationName, EcommerceOperationMetric>>(),
};

globalForEcommercePerformance.flashErpEcommercePerformance = state;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeScope(scope: string | null | undefined) {
  const normalized = (scope ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 48);
  return normalized || "UNKNOWN";
}

function emptyMetric(): EcommerceOperationMetric {
  return {
    requests: 0,
    completed: 0,
    failed: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    samples: [],
    lastCompletedAt: null,
    lastFailureAt: null,
  };
}

function metricFor(scope: string, operation: EcommerceOperationName) {
  const normalizedScope = normalizeScope(scope);
  const maxScopes = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_METRIC_MAX_SCOPES, 100);
  // Reserve the last scope for overflow so a busy multi-store process remains bounded.
  const trackedScope = state.scopes.has(normalizedScope)
    ? normalizedScope
    : maxScopes === 1 || state.scopes.size >= maxScopes - 1
      ? "OTHER"
      : normalizedScope;
  const operations = state.scopes.get(trackedScope) ?? new Map<EcommerceOperationName, EcommerceOperationMetric>();
  state.scopes.set(trackedScope, operations);
  const metric = operations.get(operation) ?? emptyMetric();
  operations.set(operation, metric);
  return metric;
}

function round(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function percentile(samples: number[], value: number) {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil((value / 100) * ordered.length) - 1),
  );
  return round(ordered[index] ?? 0);
}

export function recordEcommerceOperation(
  operation: EcommerceOperationName,
  scope: string | null | undefined,
  durationMs: number,
  succeeded: boolean,
) {
  const metric = metricFor(scope ?? "UNKNOWN", operation);
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  const now = new Date().toISOString();
  const sampleLimit = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_METRIC_SAMPLE_LIMIT, 120);

  metric.requests += 1;
  metric.totalDurationMs += duration;
  metric.maxDurationMs = Math.max(metric.maxDurationMs, duration);
  metric.samples.push(duration);
  if (metric.samples.length > sampleLimit) metric.samples.splice(0, metric.samples.length - sampleLimit);

  if (succeeded) {
    metric.completed += 1;
    metric.lastCompletedAt = now;
  } else {
    metric.failed += 1;
    metric.lastFailureAt = now;
  }

  return round(duration);
}

export async function measureEcommerceOperation<T>(
  operation: EcommerceOperationName,
  scope: string | null | undefined,
  action: () => Promise<T>,
) {
  const startedAt = performance.now();
  try {
    const value = await action();
    return {
      value,
      durationMs: recordEcommerceOperation(operation, scope, performance.now() - startedAt, true),
    };
  } catch (error) {
    recordEcommerceOperation(operation, scope, performance.now() - startedAt, false);
    throw error;
  }
}

export function ecommerceServerTiming(operation: EcommerceOperationName, durationMs: number) {
  return `ecommerce-${operation.toLowerCase().replaceAll("_", "-")};dur=${round(durationMs)}`;
}

export function attachEcommerceServerTiming(
  response: Response,
  operation: EcommerceOperationName,
  startedAt: number,
) {
  response.headers.set("Server-Timing", ecommerceServerTiming(operation, performance.now() - startedAt));
  return response;
}

export function getEcommercePerformanceSnapshot(scope: string | null | undefined) {
  const operations = state.scopes.get(normalizeScope(scope)) ?? new Map<EcommerceOperationName, EcommerceOperationMetric>();
  const slowRequestThresholdMs = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_SLOW_REQUEST_MS, 2_000);
  const failureWindowMs = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_FAILURE_WINDOW_MS, 15 * 60_000);
  const now = Date.now();
  let requestCount = 0;
  let hasSlowOperation = false;
  let hasRecentFailure = false;

  const metrics = Object.fromEntries(ecommerceOperationNames.map((operation) => {
    const metric = operations.get(operation) ?? emptyMetric();
    const averageDurationMs = metric.requests > 0
      ? round(metric.totalDurationMs / metric.requests)
      : 0;
    const p95DurationMs = percentile(metric.samples, 95);
    requestCount += metric.requests;
    hasSlowOperation ||= p95DurationMs >= slowRequestThresholdMs;
    hasRecentFailure ||= metric.lastFailureAt !== null &&
      now - new Date(metric.lastFailureAt).getTime() <= failureWindowMs;
    return [operation, {
      requests: metric.requests,
      completed: metric.completed,
      failed: metric.failed,
      averageDurationMs,
      p95DurationMs,
      maxDurationMs: round(metric.maxDurationMs),
      lastCompletedAt: metric.lastCompletedAt,
      lastFailureAt: metric.lastFailureAt,
    }];
  }));

  return {
    status: requestCount === 0 ? "awaiting-data" : hasSlowOperation || hasRecentFailure ? "degraded" : "healthy",
    startedAt: new Date(state.startedAt).toISOString(),
    checkedAt: new Date().toISOString(),
    slowRequestThresholdMs,
    sampleLimit: positiveInteger(process.env.FLASH_ERP_ECOMMERCE_METRIC_SAMPLE_LIMIT, 120),
    operations: metrics,
  };
}
