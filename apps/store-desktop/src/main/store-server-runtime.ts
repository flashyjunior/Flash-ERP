import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { LocalStoreService } from "./offline/local-store-service.js";
import { MssqlStoreService } from "./mssql/mssql-store-service.js";
import { PostgresStoreService } from "./postgres/postgres-store-service.js";
import {
  startStoreServiceServer,
  type StoreServiceRuntime,
  type StoreServiceServerHandle
} from "./store-service-bridge.js";
import { probeStoreDataEngineDescriptor } from "./store-data-engine.js";
import { resolveStoreRuntimeConfig, type StoreRuntimeConfig } from "./store-runtime-config.js";
import type {
  StoreServerHealth,
  StoreSyncActionResult,
  StoreSyncRunOptions,
  StoreSyncSnapshot
} from "../shared/desktop-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverStartedAt = new Date();

function loadEnv() {
  for (const candidate of [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
    path.resolve(__dirname, "..", "..", "..", ".env")
  ]) {
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
      break;
    }
  }
}

function getDatabaseSizeBytes(databasePath: string | null | undefined) {
  if (!databasePath) {
    return null;
  }

  try {
    const stats = statSync(databasePath);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

type StoreWorkflowRuntime = StoreServiceRuntime & {
  getSyncSnapshot: () => StoreSyncSnapshot | Promise<StoreSyncSnapshot>;
  runSyncCycle: (input?: StoreSyncRunOptions) => Promise<StoreSyncActionResult>;
};

function readHealthSnapshot(service: StoreWorkflowRuntime) {
  const statusSnapshotReader = (
    service as unknown as {
      getSyncStatusSnapshot?: () => StoreSyncSnapshot | Promise<StoreSyncSnapshot>;
    }
  ).getSyncStatusSnapshot;

  return typeof statusSnapshotReader === "function"
    ? statusSnapshotReader.call(service)
    : service.getSyncSnapshot();
}

function readWorkerSyncInput(): StoreSyncRunOptions {
  const encoded = process.argv[2];

  if (!encoded) {
    return {
      trigger: "manual",
      drainDownstream: false,
      snapshotMode: "status"
    };
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    console.warn("Store Desktop isolated sync worker could not parse input.", error);
    return {
      trigger: "manual",
      drainDownstream: false,
      snapshotMode: "status"
    };
  }
}

function readWorkerTimeoutMs() {
  const parsed = Number(process.env.FLASH_ERP_DESKTOP_SYNC_WORKER_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 120_000
    ? parsed
    : 25_000;
}

function withWorkerTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `Flash ERP isolated sync worker timed out after ${Math.round(timeoutMs / 1000)} seconds while waiting for the enterprise sync endpoint.`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

function startWorkerHardExitTimer(timeoutMs: number) {
  return setTimeout(() => {
    console.error(
      `Store Desktop isolated sync worker hard timeout after ${Math.round(timeoutMs / 1000)} seconds. The enterprise sync request did not release cleanly; exiting the worker process.`
    );
    process.exit(124);
  }, timeoutMs);
}

async function buildHealth(
  config: StoreRuntimeConfig,
  snapshot: StoreSyncSnapshot | null,
  databasePath: string
): Promise<StoreServerHealth> {
  const queueMetrics = snapshot?.queueMetrics;
  const operationsMetrics = snapshot?.operationsMetrics;

  return {
    status: "ready",
    deploymentMode: config.deploymentMode,
    role: "store-server",
    databaseProvider: config.databaseProvider,
    storeCode: snapshot?.storeCode ?? null,
    storeName: snapshot?.storeName ?? null,
    nodeCode: snapshot?.nodeCode ?? config.nodeCode,
    terminalCode: snapshot?.terminalCode ?? config.terminalContext.terminalCode ?? null,
    databasePath: snapshot?.databasePath ?? databasePath,
    databaseSizeBytes: getDatabaseSizeBytes(snapshot?.databasePath ?? databasePath),
    serviceStartedAt: serverStartedAt.toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - serverStartedAt.getTime()) / 1000)),
    tokenRequired: Boolean(config.storeServerToken),
    connectedTerminals: operationsMetrics?.connectedTerminals ?? 0,
    openShifts: operationsMetrics?.openShifts ?? 0,
    upstreamQueued: queueMetrics?.upstreamQueued ?? 0,
    downstreamQueued: queueMetrics?.downstreamQueued ?? 0,
    deadLetter: queueMetrics?.deadLetter ?? 0,
    generatedAt: new Date().toISOString()
  };
}

async function createStoreWorkflowRuntime(config: StoreRuntimeConfig): Promise<StoreWorkflowRuntime> {
  const dataEngine = await probeStoreDataEngineDescriptor({
    provider: config.databaseProvider,
    timeoutMs: config.storeServerTimeoutMs
  });

  if (!dataEngine.operational) {
    console.warn(dataEngine.message);
  }

  if (
    (config.databaseProvider === "postgres" || config.databaseProvider === "mssql") &&
    !dataEngine.workflowAdapterReady
  ) {
    throw new Error(
      `${dataEngine.message} Provision the store ${config.databaseProvider === "mssql" ? "SQL Server" : "PostgreSQL"} schema before starting the shared store server.`
    );
  }

  if (config.databaseProvider === "mssql") {
    const connectionString = dataEngine.connectionString;

    if (!connectionString) {
      throw new Error("FLASH_ERP_STORE_DATABASE_URL is required for SQL Server store-server mode.");
    }

    return MssqlStoreService.create({
      connectionString,
      deploymentMode: config.deploymentMode,
      syncBaseUrl: config.syncBaseUrl,
      nodeCode: config.nodeCode,
      terminalCode: config.terminalContext.terminalCode,
      clientName: config.terminalContext.clientName,
      connectionTimeoutMs: config.storeServerTimeoutMs
    });
  } else if (config.databaseProvider === "postgres") {
    const connectionString = dataEngine.connectionString;

    if (!connectionString) {
      throw new Error("FLASH_ERP_STORE_DATABASE_URL is required for PostgreSQL store-server mode.");
    }

    return PostgresStoreService.create({
      connectionString,
      deploymentMode: config.deploymentMode,
      syncBaseUrl: config.syncBaseUrl,
      nodeCode: config.nodeCode,
      terminalCode: config.terminalContext.terminalCode,
      clientName: config.terminalContext.clientName,
      connectionTimeoutMs: config.storeServerTimeoutMs
    });
  } else {
    return new LocalStoreService(
      config.userDataPath ?? path.resolve(process.cwd(), ".flash-erp-store-server"),
      {
        deploymentMode: config.deploymentMode,
        syncBaseUrl: config.syncBaseUrl,
        databasePath: config.databasePath,
        nodeCode: config.nodeCode,
        terminalCode: config.terminalContext.terminalCode
      }
    );
  }
}

async function runIsolatedSyncWorker(config: StoreRuntimeConfig) {
  const input = readWorkerSyncInput();
  const startedAtMs = Date.now();
  const workerTimeoutMs = readWorkerTimeoutMs();
  const hardExitTimer = startWorkerHardExitTimer(workerTimeoutMs + 2_000);
  const service = await createStoreWorkflowRuntime(config);

  try {
    console.info("Store Desktop isolated sync worker started.", {
      trigger: input.trigger ?? "manual",
      snapshotMode: input.snapshotMode ?? "status",
      drainDownstream: input.drainDownstream === true
    });

    const result = await withWorkerTimeout(
      service.runSyncCycle({
        ...input,
        drainDownstream: input.drainDownstream === true,
        snapshotMode: input.snapshotMode ?? "status"
      }),
      workerTimeoutMs
    );

    console.info("Store Desktop isolated sync worker completed.", {
      elapsedMs: Date.now() - startedAtMs,
      message: result.message,
      upstreamProcessed: result.upstreamProcessed ?? null,
      downstreamApplied: result.downstreamApplied ?? null,
      downstreamPullPasses: result.downstreamPullPasses ?? null,
      downstreamLimitReached: result.downstreamLimitReached ?? null,
      latestCursor: result.latestCursor ?? null
    });
  } finally {
    try {
      await Promise.resolve(service.close?.());
    } finally {
      clearTimeout(hardExitTimer);
    }
  }
}

async function main() {
  loadEnv();
  const runningAsSyncWorker = process.env.FLASH_ERP_STORE_SYNC_WORKER === "1";
  process.env.FLASH_ERP_STORE_RUNTIME_ROLE = runningAsSyncWorker ? "embedded" : "store-server";

  const config = resolveStoreRuntimeConfig();

  if (runningAsSyncWorker) {
    await runIsolatedSyncWorker(config);
    return;
  }

  const service = await createStoreWorkflowRuntime(config);
  const healthSnapshot = await Promise.resolve(readHealthSnapshot(service)).catch((error) => {
    console.warn("Flash ERP store server could not prepare an initial health snapshot.", error);
    return null;
  });
  let handle: StoreServiceServerHandle | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.info(`Flash ERP store server received ${signal}; shutting down.`);

    try {
      await handle?.close();
    } finally {
      await Promise.resolve(service.close?.());
    }

    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  handle = await startStoreServiceServer({
    service,
    host: config.storeServerHost,
    port: config.storeServerPort,
    serverToken: config.storeServerToken,
    getHealth: () => buildHealth(config, healthSnapshot, service.databasePath)
  });

  console.info(`Flash ERP store server is listening at ${handle.url}.`);
  console.info(`Flash ERP store database: ${service.databasePath}`);
}

void main().catch((error) => {
  if (process.env.FLASH_ERP_STORE_SYNC_WORKER === "1") {
    console.error(
      "Store Desktop isolated sync worker failed.",
      error instanceof Error ? error.stack ?? error.message : error
    );
  } else {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
  }
  process.exitCode = 1;
  if (process.env.FLASH_ERP_STORE_SYNC_WORKER === "1") {
    setTimeout(() => process.exit(1), 250);
  }
});
