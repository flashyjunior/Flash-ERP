import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { LocalStoreService } from "./offline/local-store-service.js";
import { MssqlStoreService } from "./mssql/mssql-store-service.js";
import { PostgresStoreService } from "./postgres/postgres-store-service.js";
import { probeStoreDataEngineDescriptor } from "./store-data-engine.js";
import { resolveStoreRuntimeConfig } from "./store-runtime-config.js";
import type {
  StoreSyncActionResult,
  StoreSyncRunOptions,
} from "../shared/desktop-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StoreSyncWorkerRuntime = {
  runSyncCycle: (input?: StoreSyncRunOptions) => Promise<StoreSyncActionResult>;
  close?: () => unknown;
};

function loadEnv() {
  for (const candidate of [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
    path.resolve(__dirname, "..", "..", "..", ".env"),
  ]) {
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
      break;
    }
  }
}

function readWorkerSyncInput(): StoreSyncRunOptions {
  const encoded = process.argv[2];

  if (!encoded) {
    return {
      trigger: "manual",
      drainDownstream: false,
      snapshotMode: "status",
    };
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    console.warn("Store Desktop isolated sync worker could not parse input.", error);
    return {
      trigger: "manual",
      drainDownstream: false,
      snapshotMode: "status",
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
          `Flash ERP isolated sync worker timed out after ${Math.round(timeoutMs / 1000)} seconds while waiting for the enterprise sync endpoint.`,
        ),
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
      `Store Desktop isolated sync worker hard timeout after ${Math.round(timeoutMs / 1000)} seconds. The enterprise sync request did not release cleanly; exiting the worker process.`,
    );
    process.exit(124);
  }, timeoutMs);
}

async function createWorkerRuntime(): Promise<StoreSyncWorkerRuntime> {
  const config = resolveStoreRuntimeConfig();
  const dataEngine = await probeStoreDataEngineDescriptor({
    provider: config.databaseProvider,
    timeoutMs: config.storeServerTimeoutMs,
  });

  if (!dataEngine.operational) {
    console.warn(dataEngine.message);
  }

  if (
    (config.databaseProvider === "postgres" || config.databaseProvider === "mssql") &&
    !dataEngine.workflowAdapterReady
  ) {
    throw new Error(
      `${dataEngine.message} Provision the store ${config.databaseProvider === "mssql" ? "SQL Server" : "PostgreSQL"} schema before running sync.`,
    );
  }

  if (config.databaseProvider === "mssql") {
    const connectionString = dataEngine.connectionString;

    if (!connectionString) {
      throw new Error("FLASH_ERP_STORE_DATABASE_URL is required for SQL Server sync worker mode.");
    }

    return MssqlStoreService.create({
      connectionString,
      deploymentMode: config.deploymentMode,
      syncBaseUrl: config.syncBaseUrl,
      nodeCode: config.nodeCode,
      terminalCode: config.terminalContext.terminalCode,
      clientName: config.terminalContext.clientName,
      connectionTimeoutMs: config.storeServerTimeoutMs,
    });
  }

  if (config.databaseProvider === "postgres") {
    const connectionString = dataEngine.connectionString;

    if (!connectionString) {
      throw new Error("FLASH_ERP_STORE_DATABASE_URL is required for PostgreSQL sync worker mode.");
    }

    return PostgresStoreService.create({
      connectionString,
      deploymentMode: config.deploymentMode,
      syncBaseUrl: config.syncBaseUrl,
      nodeCode: config.nodeCode,
      terminalCode: config.terminalContext.terminalCode,
      clientName: config.terminalContext.clientName,
      connectionTimeoutMs: config.storeServerTimeoutMs,
    });
  }

  return new LocalStoreService(
    config.userDataPath ?? path.resolve(process.cwd(), ".flash-erp-store-sync-worker"),
    {
      deploymentMode: config.deploymentMode,
      syncBaseUrl: config.syncBaseUrl,
      databasePath: config.databasePath,
      nodeCode: config.nodeCode,
      terminalCode: config.terminalContext.terminalCode,
    },
  );
}

async function main() {
  loadEnv();
  process.env.FLASH_ERP_STORE_RUNTIME_ROLE = "embedded";

  const input = readWorkerSyncInput();
  const startedAtMs = Date.now();
  const workerTimeoutMs = readWorkerTimeoutMs();
  const hardExitTimer = startWorkerHardExitTimer(workerTimeoutMs + 2_000);
  const runtime = await createWorkerRuntime();

  try {
    console.info("Store Desktop isolated sync worker started.", {
      trigger: input.trigger ?? "manual",
      snapshotMode: input.snapshotMode ?? "status",
      drainDownstream: input.drainDownstream === true,
    });

    const result = await withWorkerTimeout(
      runtime.runSyncCycle({
        ...input,
        drainDownstream: input.drainDownstream === true,
        snapshotMode: input.snapshotMode ?? "status",
      }),
      workerTimeoutMs,
    );

    console.info("Store Desktop isolated sync worker completed.", {
      elapsedMs: Date.now() - startedAtMs,
      message: result.message,
      upstreamProcessed: result.upstreamProcessed ?? null,
      downstreamApplied: result.downstreamApplied ?? null,
      downstreamPullPasses: result.downstreamPullPasses ?? null,
      downstreamLimitReached: result.downstreamLimitReached ?? null,
      latestCursor: result.latestCursor ?? null,
    });
  } finally {
    try {
      await Promise.resolve(runtime.close?.());
    } finally {
      clearTimeout(hardExitTimer);
    }
  }
}

void main().catch((error) => {
  console.error(
    "Store Desktop isolated sync worker failed.",
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 250);
});
