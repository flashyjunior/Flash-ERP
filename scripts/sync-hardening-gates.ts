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

function requireExcludes(source: string, needle: string, label: string) {
  if (source.includes(needle)) {
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
const mssqlStore = requireFile("apps/store-desktop/src/main/mssql/mssql-store-service.ts");
const mssqlSchema = requireFile("apps/store-desktop/src/main/mssql/store-mssql-schema.sql");
const desktopMain = requireFile("apps/store-desktop/electron/main.ts");
const desktopSyncWorker = requireFile(
  "apps/store-desktop/src/main/store-sync-worker-runtime.ts"
);
const desktopRenderer = requireFile("apps/store-desktop/src/renderer/modern-app.tsx");
const syncNodeDetail = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-sync-node-detail.tsx"
);
const syncNodeRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-sync-node.repository.ts"
);
const syncDashboard = requireFile(
  "apps/enterprise-web/src/components/enterprise/enterprise-sync-dashboard.tsx"
);
const syncDashboardRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-dashboard.repository.ts"
);
const masterDataPublicationRoute = requireFile(
  "apps/enterprise-web/src/app/api/sync/master-data-publications/route.ts"
);
const nodeMasterDataPublicationRoute = requireFile(
  "apps/enterprise-web/src/app/api/sync/store-nodes/[nodeCode]/publish-master-data/route.ts"
);
const deployBuild = requireFile("scripts/build-enterprise-web-deploy.mjs");
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
  contracts,
  "StoreMasterDataPublicationScope",
  "sync contracts must define selectable master-data publication groups."
);
requireIncludes(
  contracts,
  "StoreMasterDataDistributionRequest",
  "sync contracts must define the multi-shop master-data request."
);
requireIncludes(
  contracts,
  "StoreMasterDataDistributionResponse",
  "sync contracts must define the multi-shop master-data response."
);
requireIncludes(
  contracts,
  "EnterpriseSupplierPublishedPayload",
  "sync contracts must define the supplier publication payload."
);
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
requireIncludes(
  enterpriseSync,
  "priorityStoreTopologyEventTypes",
  "enterprise pull must prioritize store settings and inventory locations ahead of bulk master-data backlogs."
);
requireIncludes(
  enterpriseSync,
  "priorityStoreOperationsEventTypes",
  "enterprise pull must prioritize operator access, selling setup, transfers, and recovery instructions."
);
requireIncludes(
  enterpriseSync,
  "priorityStoreCatalogEventTypes",
  "enterprise pull must give catalog, price, serial, stock, and purchasing packets protected capacity."
);
requireIncludes(
  enterpriseSync,
  "Math.ceil(postTopologyCapacity * 0.5)",
  "enterprise pull must reserve capacity instead of allowing operational priority traffic to starve other data."
);
requireIncludes(
  enterpriseSync,
  "notIn: [...priorityStoreSyncEventTypes]",
  "enterprise pull must fill remaining packet capacity without duplicating any prioritized event tier."
);
requireIncludes(
  enterpriseSync,
  "fallbackPendingEvents",
  "enterprise pull must backfill unused tier capacity so packets are not left waiting behind empty priority classes."
);
requireIncludes(
  enterpriseSync,
  '"inter-store-transfer.target.published"',
  "automatic master publication deduplication must include transfer-target directory packets."
);
requireIncludes(
  enterpriseSync,
  "publishStoreMasterDataToNodes",
  "enterprise must expose governed multi-shop master-data publication."
);
requireIncludes(
  enterpriseSync,
  'SUPPLIERS: ["supplier.published"]',
  "manual publication must include suppliers."
);
requireIncludes(
  masterDataPublicationRoute,
  'const session = await assertEnterprisePermission(["sync.admin.reseed"])',
  "manual publication must require the sync reseed permission."
);
requireIncludes(
  masterDataPublicationRoute,
  "operatorName: session.displayName || session.loginId",
  "manual publication must attribute the authenticated HQ operator."
);
requireExcludes(
  masterDataPublicationRoute,
  "body.operatorName",
  "manual publication must not trust a browser-supplied operator name."
);
requireIncludes(
  enterpriseSync,
  'actionType: "PUBLISH_MASTER_DATA"',
  "manual publication must persist its required action type without a runtime enum lookup."
);
requireIncludes(
  enterpriseSync,
  "return prisma.$transaction(",
  "multi-shop publication must be queued within one governed database transaction."
);
requireIncludes(
  enterpriseSync,
  "const selectedStoreIds = new Set<string>()",
  "multi-shop publication must prevent duplicate desktop targets for one shop."
);
requireIncludes(
  syncNodeDetail,
  "publish-master-data",
  "shop node detail must expose governed per-shop master-data publication."
);
requireIncludes(
  nodeMasterDataPublicationRoute,
  "operatorName: session.displayName || session.loginId",
  "per-shop publication must attribute the authenticated HQ operator."
);
requireExcludes(
  nodeMasterDataPublicationRoute,
  "body.operatorName",
  "per-shop publication must not trust a browser-supplied operator name."
);
requireIncludes(
  syncDashboard,
  "/api/sync/master-data-publications",
  "the HQ command center must use the multi-shop publication route."
);
requireIncludes(
  syncDashboard,
  "Select shops",
  "the HQ command center must let the operator select destination shops."
);
requireIncludes(
  syncDashboard,
  "Select data groups",
  "the HQ command center must let the operator select data groups."
);
requireExcludes(
  syncDashboard,
  "operatorName",
  "HQ manual publication must not ask the signed-in operator to type their identity."
);
requireIncludes(
  deployBuild,
  "rmSync(nextBuildDirectory, { recursive: true, force: true })",
  "deployment builds must discard stale Next chunks before compiling."
);
requireIncludes(
  syncDashboard,
  "Queue master data",
  "HQ command center must expose the multi-shop manual publication workspace."
);
requireIncludes(
  syncDashboard,
  "postureReasons",
  "the shop grid must explain why a node needs attention."
);
requireIncludes(
  syncDashboardRepository,
  "describePosture",
  "the shop grid must derive concrete posture reasons from live sync state."
);
requireIncludes(
  syncNodeDetail,
  "initialPageSize={50}",
  "node event history must show a useful first page instead of only ten rows."
);
requireIncludes(
  syncNodeDetail,
  "latest 200",
  "node event history must disclose its bounded history window."
);
requireIncludes(
  syncNodeRepository,
  "take: 200",
  "node event history must load a bounded troubleshooting window."
);

for (const [source, label] of [
  [sqliteStore, "SQLite desktop store"],
  [postgresStore, "PostgreSQL desktop store"],
  [mssqlStore, "SQL Server desktop store"]
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
  requireIncludes(source, "POLICY_REJECTED", `${label} must leave permanent policy conflicts out of operator retry.`);
  requireIncludes(source, 'event.eventType === "supplier.published"', `${label} must apply supplier publications.`);
}

for (const [source, label] of [
  [sqliteSchema, "SQLite schema"],
  [postgresSchema, "PostgreSQL schema"],
  [mssqlSchema, "SQL Server schema"]
] as const) {
  requireIncludes(source, "next_retry_at", `${label} must include retry window storage.`);
  requireIncludes(source, "failure_kind", `${label} must include failure kind storage.`);
  requireIncludes(source, "last_http_status", `${label} must include HTTP status storage.`);
  requireIncludes(source, "idx_sync_outbox_retry", `${label} must index retryable upstream queues.`);
}

requireIncludes(mssqlStore, "getSyncDeadLetters", "SQL Server must expose failed sync rows to supervisors.");
requireIncludes(mssqlStore, "getRecentSyncEvents", "SQL Server must expose recent sync activity to supervisors.");
requireIncludes(mssqlStore, "getTerminalConnections", "SQL Server must expose terminal heartbeats to supervisors.");
requireIncludes(desktopRenderer, "Export diagnostics", "desktop supervisors must be able to export sync diagnostics.");
requireIncludes(desktopRenderer, "Retry eligible", "desktop retry must be clearly limited to eligible failures.");
requireIncludes(desktopMain, "rmSync(launcherScriptPath", "temporary sync launcher files containing runtime tokens must be removed.");
requireIncludes(
  desktopSyncWorker,
  "result.succeeded === false",
  "detached sync workers must fail visibly when a store adapter reports an unsuccessful cycle."
);
requireIncludes(
  desktopMain,
  "failureMatch",
  "desktop sync status must surface the worker failure message."
);

requireIncludes(syncDocs, "retry window", "sync docs must describe retry windows.");
requireIncludes(syncDocs, "sync run id", "sync docs must describe sync run correlation.");
requireIncludes(syncDocs, "rejected acknowledgement", "sync docs must describe rejected ACK handling.");
requireIncludes(
  syncDocs,
  "Manual Master-Data Publication",
  "sync docs must explain when automatic and manual master publication occurs."
);

console.log("Sync hardening gate passed.");
