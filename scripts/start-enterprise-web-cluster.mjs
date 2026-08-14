import cluster from "node:cluster";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { availableParallelism } from "node:os";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const workerCount = positiveInteger(
  process.env.FLASH_ERP_WEB_WORKERS,
  Math.min(4, availableParallelism())
);
const poolPerWorker = positiveInteger(process.env.FLASH_ERP_DB_POOL_MAX, 20);
const shutdownTimeoutMs = positiveInteger(
  process.env.FLASH_ERP_WEB_SHUTDOWN_TIMEOUT_MS,
  30_000
);
const crashWindowMs = 60_000;
const maxCrashesPerWindow = 5;
const startupWarmupEnabled = process.env.FLASH_ERP_STARTUP_WARMUP !== "0";
const warmupTimeoutMs = positiveInteger(process.env.FLASH_ERP_STARTUP_WARMUP_TIMEOUT_MS, 180_000);

if (cluster.isPrimary) {
  cluster.schedulingPolicy = cluster.SCHED_RR;
  let shuttingDown = false;
  const crashTimes = [];
  const workerRuntimeIds = new Map();
  const listeningRuntimeIds = new Set();
  const warmedRuntimeIds = new Set();
  let warmupInProgress = false;
  const warmupToken = randomUUID();
  if (startupWarmupEnabled) {
    process.env.FLASH_ERP_STARTUP_WARMUP_ENABLED = "true";
    process.env.FLASH_ERP_INTERNAL_WARMUP_TOKEN = warmupToken;
  }

  process.stdout.write(
    `[enterprise-cluster] Starting ${workerCount} web workers with up to ${poolPerWorker} SQL connections each (${workerCount * poolPerWorker} maximum).\n`
  );

  const forkWorker = () => {
    const runtimeId = randomUUID();
    const worker = cluster.fork({
      ...process.env,
      FLASH_ERP_WEB_WORKER_ID: runtimeId
    });
    workerRuntimeIds.set(worker.id, runtimeId);
    worker.on("listening", (address) => {
      listeningRuntimeIds.add(runtimeId);
      process.stdout.write(
        `[enterprise-cluster] Worker ${worker.id} listening on ${address.address}:${address.port}.\n`
      );
      void beginWarmupWhenListening();
    });
  };

  const broadcastReadiness = (ready) => {
    for (const worker of Object.values(cluster.workers)) {
      if (worker?.isConnected()) worker.send({ type: "enterprise-cluster-readiness", ready });
    }
  };

  const warmOneWorker = () =>
    new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port: Number(process.env.PORT ?? 3000),
          path: "/api/system/warmup",
          method: "POST",
          agent: false,
          headers: {
            connection: "close",
            "content-length": "0",
            "x-flash-erp-warmup-token": warmupToken
          }
        },
        (response) => {
          response.resume();
          response.on("end", () => {
            const runtimeId = String(response.headers["x-flash-erp-worker"] ?? "");
            if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300 && runtimeId) {
              resolve(runtimeId);
            } else {
              reject(new Error(`Warm-up returned HTTP ${response.statusCode ?? "unknown"}.`));
            }
          });
        }
      );
      request.setTimeout(warmupTimeoutMs, () => request.destroy(new Error("Worker warm-up timed out.")));
      request.on("error", reject);
      request.end();
    });

  async function beginWarmupWhenListening() {
    if (!startupWarmupEnabled || warmupInProgress || shuttingDown) return;
    if (listeningRuntimeIds.size < workerCount) return;
    warmupInProgress = true;
    broadcastReadiness(false);
    const deadline = Date.now() + warmupTimeoutMs;
    process.stdout.write("[enterprise-cluster] Warming Enterprise read models on every worker.\n");
    try {
      while (warmedRuntimeIds.size < workerCount) {
        if (Date.now() >= deadline) throw new Error("Cluster warm-up deadline expired.");
        const runtimeId = await warmOneWorker();
        if (listeningRuntimeIds.has(runtimeId)) warmedRuntimeIds.add(runtimeId);
      }
      broadcastReadiness(true);
      process.stdout.write(
        `[enterprise-cluster] All ${workerCount} workers are warm; Enterprise traffic is ready.\n`
      );
    } catch (error) {
      process.stderr.write(
        `[enterprise-cluster] Startup warm-up failed: ${error instanceof Error ? error.message : String(error)}\n`
      );
      shutdown("WARMUP_FAILURE", 1);
    } finally {
      warmupInProgress = false;
    }
  }

  for (let index = 0; index < workerCount; index += 1) forkWorker();

  cluster.on("exit", (worker, code, signal) => {
    process.stderr.write(
      `[enterprise-cluster] Worker ${worker.id} exited (code ${code ?? "none"}, signal ${signal ?? "none"}).\n`
    );
    if (shuttingDown) return;

    const runtimeId = workerRuntimeIds.get(worker.id);
    workerRuntimeIds.delete(worker.id);
    if (runtimeId) {
      listeningRuntimeIds.delete(runtimeId);
      warmedRuntimeIds.delete(runtimeId);
    }
    broadcastReadiness(false);

    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes[0] && crashTimes[0] < now - crashWindowMs) crashTimes.shift();
    if (crashTimes.length > maxCrashesPerWindow) {
      process.stderr.write(
        "[enterprise-cluster] Crash-loop threshold exceeded; stopping for the service manager to investigate.\n"
      );
      process.exit(1);
    }
    setTimeout(() => {
      forkWorker();
      void beginWarmupWhenListening();
    }, 500).unref();
  });

  const shutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`[enterprise-cluster] ${signal} received; draining workers.\n`);

    const forcedExit = setTimeout(() => {
      for (const worker of Object.values(cluster.workers)) worker?.kill();
      process.exit(1);
    }, shutdownTimeoutMs);
    forcedExit.unref();

    cluster.disconnect(() => {
      clearTimeout(forcedExit);
      process.exit(exitCode);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
} else {
  await import("./start-enterprise-web.mjs");
}
