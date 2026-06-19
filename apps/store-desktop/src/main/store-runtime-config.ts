import type { StoreTerminalContext } from "./offline/local-store-service.js";

export type StoreRuntimeRole = "embedded" | "store-server" | "terminal-client";
export type StoreDatabaseProvider = "sqlite" | "postgres" | "mssql";
export type StoreDeploymentMode = "ENTERPRISE_MANAGED" | "STANDALONE";

export type StoreRuntimeConfig = {
  deploymentMode: StoreDeploymentMode;
  role: StoreRuntimeRole;
  databaseProvider: StoreDatabaseProvider;
  databasePath: string | null;
  userDataPath: string | null;
  nodeCode: string | null;
  terminalContext: StoreTerminalContext;
  syncBaseUrl: string | null;
  storeServerUrl: string | null;
  storeServerToken: string | null;
  shouldStartStoreServer: boolean;
  storeServerHost: string;
  storeServerPort: number;
  storeServerTimeoutMs: number;
};

function normalizeRuntimeRole(value: string | null | undefined, hasStoreServerUrl: boolean): StoreRuntimeRole {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-") ?? "";

  if (normalized === "server" || normalized === "store-server") {
    return "store-server";
  }

  if (normalized === "terminal" || normalized === "terminal-client") {
    return "terminal-client";
  }

  if (normalized === "embedded" || normalized === "local") {
    return "embedded";
  }

  return hasStoreServerUrl ? "terminal-client" : "embedded";
}

function normalizeDatabaseProvider(value: string | null | undefined): StoreDatabaseProvider {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "mssql" || normalized === "sqlserver" || normalized === "sql-server") {
    return "mssql";
  }

  return normalized === "postgres" || normalized === "postgresql" ? "postgres" : "sqlite";
}

function normalizeDeploymentMode(value: string | null | undefined): StoreDeploymentMode {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, "-") ?? "";

  if (
    normalized === "standalone" ||
    normalized === "local" ||
    normalized === "single-store" ||
    normalized === "single-shop"
  ) {
    return "STANDALONE";
  }

  return "ENTERPRISE_MANAGED";
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function readPort(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

function readDurationMs(value: string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 500 && parsed <= 120_000 ? parsed : fallback;
}

export function resolveStoreRuntimeConfig(): StoreRuntimeConfig {
  const storeServerUrl = normalizeOptionalString(process.env.FLASH_ERP_STORE_SERVER_URL);
  const role = normalizeRuntimeRole(process.env.FLASH_ERP_STORE_RUNTIME_ROLE, Boolean(storeServerUrl));
  const shouldStartStoreServer =
    role === "store-server" || process.env.FLASH_ERP_STORE_SERVER_ENABLED === "1";
  const deploymentMode = normalizeDeploymentMode(process.env.FLASH_ERP_STORE_DEPLOYMENT_MODE);

  return {
    deploymentMode,
    role,
    databaseProvider: normalizeDatabaseProvider(process.env.FLASH_ERP_STORE_DATABASE_PROVIDER),
    databasePath: normalizeOptionalString(process.env.FLASH_ERP_STORE_DB_PATH),
    userDataPath: normalizeOptionalString(process.env.FLASH_ERP_STORE_USER_DATA_PATH),
    nodeCode: normalizeOptionalString(process.env.FLASH_ERP_STORE_NODE_CODE),
    terminalContext: {
      terminalCode: normalizeOptionalString(process.env.FLASH_ERP_STORE_TERMINAL_CODE),
      clientName: normalizeOptionalString(process.env.FLASH_ERP_STORE_TERMINAL_NAME)
    },
    syncBaseUrl:
      deploymentMode === "STANDALONE"
        ? null
        : normalizeOptionalString(process.env.FLASH_ERP_STORE_SYNC_BASE_URL),
    storeServerUrl,
    storeServerToken: normalizeOptionalString(process.env.FLASH_ERP_STORE_SERVER_TOKEN),
    shouldStartStoreServer,
    storeServerHost:
      normalizeOptionalString(process.env.FLASH_ERP_STORE_SERVER_HOST) ??
      (role === "store-server" ? "0.0.0.0" : "127.0.0.1"),
    storeServerPort: readPort(process.env.FLASH_ERP_STORE_SERVER_PORT, 4747),
    storeServerTimeoutMs: readDurationMs(process.env.FLASH_ERP_STORE_SERVER_TIMEOUT_MS, 8000)
  };
}
