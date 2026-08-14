import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))];
}

function parsePaths(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const baseUrl = (process.env.FLASH_ERP_CAPACITY_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const storeCode = process.env.FLASH_ERP_CAPACITY_STORE_CODE?.trim() || "ACCRA-CENTRAL";
const concurrency = positiveInteger(process.env.FLASH_ERP_CAPACITY_CONCURRENCY, 200);
const requestCount = positiveInteger(process.env.FLASH_ERP_CAPACITY_REQUESTS, 200);
const requestTimeoutMs = positiveInteger(process.env.FLASH_ERP_CAPACITY_REQUEST_TIMEOUT_MS, 30_000);
const p95TargetMs = positiveInteger(process.env.FLASH_ERP_CAPACITY_P95_TARGET_MS, 2_000);
const cookie = process.env.FLASH_ERP_CAPACITY_COOKIE?.trim() || "";
const hqPaths = parsePaths(process.env.FLASH_ERP_CAPACITY_HQ_PATHS);
const includePublicScenarios = process.env.FLASH_ERP_CAPACITY_INCLUDE_PUBLIC !== "0";
const mixHqScenarios = process.env.FLASH_ERP_CAPACITY_MIXED_HQ === "1";
const closeConnections = process.env.FLASH_ERP_CAPACITY_CLOSE_CONNECTIONS === "1";
const routeShuffleSeed = positiveInteger(process.env.FLASH_ERP_CAPACITY_ROUTE_SEED, 13_371);

if (hqPaths.length > 0 && !cookie) {
  throw new Error("FLASH_ERP_CAPACITY_COOKIE is required when authenticated HQ paths are supplied.");
}

const scenarios = [
  ...(includePublicScenarios
    ? [
        { name: "public-catalog", route: `/api/ecommerce/${encodeURIComponent(storeCode)}/catalog`, authenticated: false },
        { name: "public-storefront", route: `/shop/${encodeURIComponent(storeCode)}`, authenticated: false },
        { name: "runtime-capacity", route: "/api/system/runtime-capacity", authenticated: false }
      ]
    : []),
  ...(mixHqScenarios && hqPaths.length > 0
    ? [{ name: "hq-read-mixed", route: "mixed HQ routes", routes: hqPaths, authenticated: true }]
    : hqPaths.map((route, index) => ({ name: `hq-read-${index + 1}`, route, authenticated: true })))
];

if (scenarios.length === 0) {
  throw new Error("Enable public scenarios or provide FLASH_ERP_CAPACITY_HQ_PATHS.");
}

function buildBalancedRouteSchedule(routes, count, seed) {
  const schedule = Array.from({ length: count }, (_, index) => routes[index % routes.length]);
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };

  for (let index = schedule.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [schedule[index], schedule[swapIndex]] = [schedule[swapIndex], schedule[index]];
  }

  return schedule;
}

async function executeRequest(scenario, requestIndex = 0, scheduledRoute) {
  const startedAt = performance.now();
  const route = scheduledRoute ?? scenario.routes?.[requestIndex % scenario.routes.length] ?? scenario.route;
  try {
    const response = await fetch(new URL(route, baseUrl), {
      method: "GET",
      headers: {
        accept: "application/json,text/html",
        "x-request-id": crypto.randomUUID(),
        ...(closeConnections ? { connection: "close" } : {}),
        ...(scenario.authenticated ? { cookie } : {})
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
      redirect: "manual"
    });
    await response.arrayBuffer();
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      worker: response.headers.get("x-flash-erp-worker") ?? "unknown",
      route,
      durationMs: performance.now() - startedAt,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      worker: "unavailable",
      route,
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function runScenario(scenario) {
  const warmupRoutes = scenario.routes ?? [scenario.route];
  for (let round = 0; round < 3; round += 1) {
    const warmups = await Promise.all(
      warmupRoutes.map((route) =>
        executeRequest({ ...scenario, route, routes: undefined })
      )
    );
    for (let index = 0; index < warmups.length; index += 1) {
      const route = warmupRoutes[index];
      const warmup = warmups[index];
      if (!warmup.ok) throw new Error(`${scenario.name} warm-up failed for ${route} with status ${warmup.status}: ${warmup.error ?? "request failed"}`);
    }
  }

  const startedAt = performance.now();
  const results = new Array(requestCount);
  const routeSchedule = scenario.routes
    ? buildBalancedRouteSchedule(scenario.routes, requestCount, routeShuffleSeed)
    : null;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, requestCount) }, async () => {
    while (cursor < requestCount) {
      const index = cursor;
      cursor += 1;
      results[index] = await executeRequest(scenario, index, routeSchedule?.[index]);
    }
  });
  await Promise.all(workers);

  const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
  const statuses = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
    return summary;
  }, {});
  const workerDistribution = results.reduce((summary, result) => {
    summary[result.worker] = (summary[result.worker] ?? 0) + 1;
    return summary;
  }, {});
  const perRoute = Object.entries(
    results.reduce((groups, result) => {
      (groups[result.route] ??= []).push(result);
      return groups;
    }, {})
  ).map(([route, routeResults]) => {
    const routeDurations = routeResults
      .map((result) => result.durationMs)
      .sort((left, right) => left - right);
    return {
      route,
      requests: routeResults.length,
      succeeded: routeResults.filter((result) => result.ok).length,
      failed: routeResults.filter((result) => !result.ok).length,
      p50Ms: Math.round(percentile(routeDurations, 0.5)),
      p95Ms: Math.round(percentile(routeDurations, 0.95)),
      p99Ms: Math.round(percentile(routeDurations, 0.99)),
      maxMs: Math.round(routeDurations.at(-1) ?? 0),
      workerDistribution: routeResults.reduce((summary, result) => {
        summary[result.worker] = (summary[result.worker] ?? 0) + 1;
        return summary;
      }, {})
    };
  });
  const summary = {
    ...scenario,
    baseUrl,
    concurrency,
    routeShuffleSeed: routeSchedule ? routeShuffleSeed : null,
    requests: requestCount,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    statuses,
    workerDistribution,
    perRoute,
    wallMs: Math.round(performance.now() - startedAt),
    minMs: Math.round(durations[0] ?? 0),
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    p99Ms: Math.round(percentile(durations, 0.99)),
    maxMs: Math.round(durations.at(-1) ?? 0),
    firstError: results.find((result) => result.error)?.error ?? null
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary;
}

const summaries = [];
for (const scenario of scenarios) summaries.push(await runScenario(scenario));

const evidence = {
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  targets: { p95Ms: p95TargetMs, failedRequests: 0 },
  summaries
};
const outputPath = path.resolve(
  process.env.FLASH_ERP_CAPACITY_OUTPUT_PATH ?? "artifacts/capacity/enterprise-capacity-latest.json"
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

const failed = summaries.some((summary) => summary.failed > 0 || summary.p95Ms > p95TargetMs);
process.stdout.write(`Capacity evidence written to ${outputPath}\n`);
if (failed) process.exitCode = 1;
