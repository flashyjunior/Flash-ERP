import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePaths(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))];
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

const baseUrl = (process.env.FLASH_ERP_CAPACITY_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const cookie = process.env.FLASH_ERP_CAPACITY_COOKIE?.trim() || "";
const paths = parsePaths(process.env.FLASH_ERP_CAPACITY_HQ_PATHS);
const virtualUsers = positiveInteger(process.env.FLASH_ERP_SOAK_USERS, 200);
const durationSeconds = positiveInteger(process.env.FLASH_ERP_SOAK_DURATION_SECONDS, 300);
const rampSeconds = positiveInteger(process.env.FLASH_ERP_SOAK_RAMP_SECONDS, 60);
const thinkMinMs = positiveInteger(process.env.FLASH_ERP_SOAK_THINK_MIN_MS, 5_000);
const thinkMaxMs = Math.max(
  thinkMinMs,
  positiveInteger(process.env.FLASH_ERP_SOAK_THINK_MAX_MS, 15_000)
);
const requestTimeoutMs = positiveInteger(process.env.FLASH_ERP_CAPACITY_REQUEST_TIMEOUT_MS, 30_000);
const p95TargetMs = positiveInteger(process.env.FLASH_ERP_CAPACITY_P95_TARGET_MS, 2_500);
const randomSeed = positiveInteger(process.env.FLASH_ERP_CAPACITY_ROUTE_SEED, 13_371);

if (!cookie) throw new Error("FLASH_ERP_CAPACITY_COOKIE is required for the authenticated soak.");
if (paths.length === 0) throw new Error("FLASH_ERP_CAPACITY_HQ_PATHS must include at least one authenticated route.");
if (rampSeconds >= durationSeconds) throw new Error("FLASH_ERP_SOAK_RAMP_SECONDS must be shorter than the soak duration.");

async function runtimeSnapshot() {
  try {
    const response = await fetch(new URL("/api/system/runtime-capacity", baseUrl), {
      headers: { accept: "application/json", "x-request-id": crypto.randomUUID() },
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
    return response.ok ? await response.json() : { status: response.status };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function executeRequest(route) {
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(route, baseUrl), {
      method: "GET",
      headers: {
        accept: "application/json,text/html",
        cookie,
        "x-request-id": crypto.randomUUID()
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
      redirect: "manual"
    });
    await response.arrayBuffer();
    return {
      route,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      worker: response.headers.get("x-flash-erp-worker") ?? "unknown",
      durationMs: performance.now() - startedAt,
      error: null
    };
  } catch (error) {
    return {
      route,
      ok: false,
      status: 0,
      worker: "unavailable",
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

const before = await runtimeSnapshot();
const startedAt = performance.now();
const deadline = startedAt + durationSeconds * 1_000;
const results = [];

await Promise.all(
  Array.from({ length: virtualUsers }, async (_, userIndex) => {
    const random = seededRandom(randomSeed + userIndex * 104_729);
    const rampDelayMs = (rampSeconds * 1_000 * userIndex) / virtualUsers;
    await delay(rampDelayMs);
    let requestIndex = 0;

    while (performance.now() < deadline) {
      const route = paths[(userIndex + requestIndex) % paths.length];
      results.push(await executeRequest(route));
      requestIndex += 1;
      const thinkMs = thinkMinMs + Math.floor(random() * (thinkMaxMs - thinkMinMs + 1));
      if (performance.now() + thinkMs >= deadline) break;
      await delay(thinkMs);
    }
  })
);

const wallMs = Math.round(performance.now() - startedAt);
await delay(2_000);
const recoveryStartedAt = performance.now();
const recovery = await executeRequest(paths[0]);
const recoveryMs = Math.round(performance.now() - recoveryStartedAt);
const after = await runtimeSnapshot();
const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
const summarize = (routeResults) => {
  const routeDurations = routeResults
    .map((result) => result.durationMs)
    .sort((left, right) => left - right);
  return {
    requests: routeResults.length,
    succeeded: routeResults.filter((result) => result.ok).length,
    failed: routeResults.filter((result) => !result.ok).length,
    p50Ms: Math.round(percentile(routeDurations, 0.5)),
    p95Ms: Math.round(percentile(routeDurations, 0.95)),
    p99Ms: Math.round(percentile(routeDurations, 0.99)),
    maxMs: Math.round(routeDurations.at(-1) ?? 0)
  };
};
const statusDistribution = results.reduce((summary, result) => {
  summary[result.status] = (summary[result.status] ?? 0) + 1;
  return summary;
}, {});
const workerDistribution = results.reduce((summary, result) => {
  summary[result.worker] = (summary[result.worker] ?? 0) + 1;
  return summary;
}, {});
const perRoute = paths.map((route) => ({
  route,
  ...summarize(results.filter((result) => result.route === route))
}));
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  virtualUsers,
  durationSeconds,
  rampSeconds,
  thinkTimeMs: { min: thinkMinMs, max: thinkMaxMs },
  requestTimeoutMs,
  randomSeed,
  paths,
  ...summarize(results),
  wallMs,
  throughputPerSecond: Number((results.length / (wallMs / 1_000)).toFixed(2)),
  minMs: Math.round(durations[0] ?? 0),
  statusDistribution,
  workerDistribution,
  perRoute,
  firstError: results.find((result) => result.error)?.error ?? null,
  recovery: {
    ok: recovery.ok,
    status: recovery.status,
    durationMs: recoveryMs
  },
  runtime: { before, after },
  target: { failedRequests: 0, p95Ms: p95TargetMs, recoveryMs: 2_500 }
};
const outputPath = path.resolve(
  process.env.FLASH_ERP_CAPACITY_OUTPUT_PATH ?? "artifacts/capacity/enterprise-soak-latest.json"
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(summary)}\n`);
process.stdout.write(`Capacity soak evidence written to ${outputPath}\n`);

if (summary.failed > 0 || summary.p95Ms > p95TargetMs || !recovery.ok || recoveryMs > 2_500) {
  process.exitCode = 1;
}
