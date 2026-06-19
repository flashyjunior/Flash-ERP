import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Sync hardening gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Sync hardening gate failed: ${label}`);
  }
}

const contracts = requireFile("packages/sync-core/src/contracts.ts");
const policies = requireFile("packages/sync-core/src/policies.ts");
const httpParser = requireFile("apps/enterprise-web/src/server/sync/store-sync-http.ts");
const enterpriseSync = requireFile(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts"
);
const sqliteStore = requireFile("apps/store-desktop/src/main/offline/local-store-service.ts");
const sqliteSchema = requireFile("apps/store-desktop/src/main/offline/local-store-schema.ts");
const postgresStore = requireFile("apps/store-desktop/src/main/postgres/postgres-store-service.ts");
const postgresSchema = requireFile("apps/store-desktop/src/main/postgres/store-postgres-schema.sql");
const syncDocs = requireFile("docs/09-sync-hardening-and-observability.md");

requireIncludes(policies, "MAX_SYNC_RETRY_ATTEMPTS", "shared retry attempt limit must exist.");
requireIncludes(policies, "getRetryDelayMs", "shared retry delay helper must exist.");

for (const [source, label] of [
  [contracts, "sync contract"],
  [httpParser, "enterprise HTTP parser"]
] as const) {
  requireIncludes(source, "StoreNodeSyncTrigger", `${label} must include sync run trigger metadata.`);
  requireIncludes(source, "syncRunId", `${label} must include sync run correlation id.`);
  requireIncludes(source, "clientStartedAt", `${label} must include client run start timestamp.`);
}

requireIncludes(
  contracts,
  "rejectedAcknowledgementIds",
  "push responses must report rejected downstream acknowledgements."
);
requireIncludes(contracts, "retryAfterSeconds", "pull responses must expose downstream retry wait.");
requireIncludes(
  enterpriseSync,
  "sync.downstream-acknowledgement.rejected",
  "enterprise must log rejected downstream acknowledgements."
);
requireIncludes(
  enterpriseSync,
  "sync.downstream-dead-lettered",
  "enterprise must dead-letter exhausted downstream delivery."
);
requireIncludes(
  enterpriseSync,
  "isDownstreamRetryDue",
  "enterprise pull must gate in-flight redelivery by retry delay."
);
requireIncludes(
  enterpriseSync,
  "checkpointHasAppliedWork",
  "enterprise must not overwrite checkpoints on telemetry-only pushes."
);

for (const [source, label] of [
  [sqliteStore, "SQLite desktop store"],
  [postgresStore, "PostgreSQL desktop store"]
] as const) {
  requireIncludes(source, "StoreSyncTransportError", `${label} must classify transport failures.`);
  requireIncludes(source, "markOutboxAttemptStarted", `${label} must record outbound attempts before push.`);
  requireIncludes(source, "markOutboxTransportFailure", `${label} must preserve failed pushes for retry.`);
  requireIncludes(source, "expireExhaustedOutboxRetries", `${label} must dead-letter exhausted upstream retries.`);
  requireIncludes(source, "nextSyncRetryAt", `${label} must compute retry windows.`);
  requireIncludes(source, "next_retry_at", `${label} must persist retry windows.`);
  requireIncludes(source, "failure_kind", `${label} must persist failure classification.`);
  requireIncludes(source, "last_http_status", `${label} must persist HTTP failure status.`);
  requireIncludes(source, "syncRunId", `${label} must send sync run ids to enterprise.`);
}

for (const [source, label] of [
  [sqliteSchema, "SQLite schema"],
  [postgresSchema, "PostgreSQL schema"]
] as const) {
  requireIncludes(source, "next_retry_at", `${label} must include retry window storage.`);
  requireIncludes(source, "failure_kind", `${label} must include failure kind storage.`);
  requireIncludes(source, "last_http_status", `${label} must include HTTP status storage.`);
  requireIncludes(source, "idx_sync_outbox_retry", `${label} must index retryable upstream queues.`);
}

requireIncludes(syncDocs, "retry window", "sync docs must describe retry windows.");
requireIncludes(syncDocs, "sync run id", "sync docs must describe sync run correlation.");
requireIncludes(syncDocs, "rejected acknowledgement", "sync docs must describe rejected ACK handling.");

console.log("Sync hardening gate passed.");
