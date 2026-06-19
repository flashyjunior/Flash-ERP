import type { StoreDatabaseProvider } from "./store-runtime-config.js";
import { probeStorePostgresDatabase, type StorePostgresProbeResult } from "./postgres/store-postgres-adapter.js";
import { probeStoreMssqlDatabase, type StoreMssqlProbeResult } from "./mssql/store-mssql-adapter.js";

export type StoreDataEngineDescriptor = {
  provider: StoreDatabaseProvider;
  mode: "embedded-sqlite" | "postgres-store-node" | "mssql-store-node";
  connectionString: string | null;
  operational: boolean;
  schemaReady: boolean | null;
  workflowAdapterReady: boolean;
  probe: StorePostgresProbeResult | StoreMssqlProbeResult | null;
  message: string;
};

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function resolveStoreDataEngineDescriptor(input: {
  provider: StoreDatabaseProvider;
}): StoreDataEngineDescriptor {
  if (input.provider === "postgres") {
    const connectionString = normalizeOptionalString(process.env.FLASH_ERP_STORE_DATABASE_URL);

    return {
      provider: "postgres",
      mode: "postgres-store-node",
      connectionString,
      operational: false,
      schemaReady: null,
      workflowAdapterReady: false,
      probe: null,
      message: connectionString
        ? "PostgreSQL store engine is configured; run the store schema probe before enabling workflows."
        : "PostgreSQL store engine needs FLASH_ERP_STORE_DATABASE_URL before it can be provisioned."
    };
  }

  if (input.provider === "mssql") {
    const connectionString = normalizeOptionalString(process.env.FLASH_ERP_STORE_DATABASE_URL);

    return {
      provider: "mssql",
      mode: "mssql-store-node",
      connectionString,
      operational: false,
      schemaReady: null,
      workflowAdapterReady: false,
      probe: null,
      message: connectionString
        ? "SQL Server store engine is configured; run the store schema probe before enabling workflows."
        : "SQL Server store engine needs FLASH_ERP_STORE_DATABASE_URL before it can be provisioned."
    };
  }

  return {
    provider: "sqlite",
    mode: "embedded-sqlite",
    connectionString: null,
    operational: true,
    schemaReady: null,
    workflowAdapterReady: true,
    probe: null,
    message: "SQLite compatibility engine is active behind the store-service boundary."
  };
}

export async function probeStoreDataEngineDescriptor(input: {
  provider: StoreDatabaseProvider;
  timeoutMs?: number;
}): Promise<StoreDataEngineDescriptor> {
  const descriptor = resolveStoreDataEngineDescriptor(input);

  if (!descriptor.connectionString) {
    return descriptor;
  }

  if (descriptor.provider === "mssql") {
    const probe = await probeStoreMssqlDatabase(descriptor.connectionString, input.timeoutMs);

    return {
      ...descriptor,
      operational: probe.schemaReady,
      schemaReady: probe.schemaReady,
      workflowAdapterReady: probe.schemaReady,
      probe,
      message: probe.schemaReady
        ? "SQL Server store database is reachable and schema-provisioned for store-server sync workflows."
        : probe.reachable
          ? "SQL Server store database is reachable but needs the Flash ERP store schema."
          : `SQL Server store database is not reachable: ${probe.errorMessage ?? "connection failed"}.`
    };
  }

  if (descriptor.provider !== "postgres") {
    return descriptor;
  }

  const probe = await probeStorePostgresDatabase(descriptor.connectionString, input.timeoutMs);

  return {
    ...descriptor,
    operational: probe.schemaReady,
    schemaReady: probe.schemaReady,
    workflowAdapterReady: probe.schemaReady,
    probe,
    message: probe.schemaReady
      ? "PostgreSQL store database is reachable and schema-provisioned for metadata, terminal heartbeat, operator sessions, and shifts."
      : probe.reachable
        ? "PostgreSQL store database is reachable but needs the Flash ERP store schema."
        : `PostgreSQL store database is not reachable: ${probe.errorMessage ?? "connection failed"}.`
  };
}
