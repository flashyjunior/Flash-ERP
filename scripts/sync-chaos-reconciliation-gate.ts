import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

function requireFile(relativePath: string) {
  const absolutePath = path.join(workspaceRoot, relativePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Sync chaos gate is missing ${relativePath}.`);
  }

  return readFileSync(absolutePath, "utf8");
}

function requireIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`Sync chaos gate failed: ${label}`);
  }
}

const rootPackage = JSON.parse(requireFile("package.json")) as {
  scripts?: Record<string, string>;
};
const syncContracts = requireFile("packages/sync-core/src/contracts.ts");
const syncPolicies = requireFile("packages/sync-core/src/policies.ts");
const enterpriseSync = requireFile(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts"
);
const posRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-pos.repository.ts"
);
const inventoryRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-inventory.repository.ts"
);
const financeRepository = requireFile(
  "apps/enterprise-web/src/server/repositories/enterprise-finance.repository.ts"
);
const sqliteStore = requireFile("apps/store-desktop/src/main/offline/local-store-service.ts");
const postgresStore = requireFile("apps/store-desktop/src/main/postgres/postgres-store-service.ts");
const syncDocs = requireFile("docs/09-sync-hardening-and-observability.md");
const hardeningPack = requireFile("docs/15-production-hardening-execution-pack.md");
const uatEvidence = requireFile("docs/14-uat-evidence-log.md");

if (!rootPackage.scripts?.["acceptance:sync-chaos"]) {
  throw new Error("Root package.json must expose acceptance:sync-chaos.");
}

for (const [source, label] of [
  [syncContracts, "sync contracts"],
  [enterpriseSync, "enterprise sync repository"],
  [sqliteStore, "SQLite desktop store"],
  [postgresStore, "PostgreSQL desktop store"]
] as const) {
  requireIncludes(source, "syncRunId", `${label} must carry sync run correlation.`);
}

requireIncludes(syncPolicies, "MAX_SYNC_RETRY_ATTEMPTS", "shared retry ceiling must be centralized.");
requireIncludes(syncPolicies, "getRetryDelayMs", "shared retry delay helper must be centralized.");
requireIncludes(enterpriseSync, "prisma.$transaction", "enterprise sync must commit projection and evidence atomically.");
requireIncludes(enterpriseSync, "sync.inbound-duplicate.ignored", "duplicate accepted packets must not double-project.");
requireIncludes(enterpriseSync, "sync.inbound-duplicate.reprocessing", "failed duplicate packets must have a recovery path.");
requireIncludes(enterpriseSync, "STALE_VERSION", "stale record versions must reject safely.");
requireIncludes(enterpriseSync, "event.originatingNodeCode !== nodeCode", "wrong-source node packets must be rejected.");
requireIncludes(enterpriseSync, "event.targetNodeCode !== enterpriseNode.code", "wrong-target packets must be rejected.");
requireIncludes(enterpriseSync, "rejectedAcknowledgementIds", "wrong-node ACKs must be returned to the caller.");
requireIncludes(
  enterpriseSync,
  "sync.downstream-acknowledgement.rejected",
  "invalid downstream ACKs must write security evidence."
);
requireIncludes(enterpriseSync, "checkpointHasAppliedWork", "telemetry-only pushes must not advance checkpoints.");
requireIncludes(enterpriseSync, "isDownstreamRetryDue", "downstream pulls must respect retry windows.");
requireIncludes(enterpriseSync, "sync.downstream-dead-lettered", "exhausted downstream packets must dead-letter.");
requireIncludes(enterpriseSync, "replayStoreNodeDownstream", "node-level downstream replay must exist.");
requireIncludes(enterpriseSync, "replayStoreNodeDownstreamEvent", "single-packet downstream replay must exist.");
requireIncludes(enterpriseSync, "reprocessStoreInboundEvent", "inbound reprocess must exist.");
requireIncludes(enterpriseSync, "requestStoreInboundEventResend", "trusted resend request path must exist.");
requireIncludes(posRepository, "Canonical transaction", "POS exception detail must guard against double-posting.");
requireIncludes(posRepository, "idempotencyKey", "POS recovery detail must expose idempotency evidence.");
requireIncludes(inventoryRepository, "prisma.inventoryLedgerEntry", "inventory reconciliation must use canonical ledger facts.");
requireIncludes(financeRepository, "retailOrgId_sourceType_sourceId", "GL posting must be idempotent by source fact.");
requireIncludes(financeRepository, "POS_SALE", "sales must reconcile to GL source rows.");
requireIncludes(financeRepository, "INVENTORY_COGS", "inventory COGS must reconcile to GL source rows.");
requireIncludes(financeRepository, "INVENTORY_RECEIPT", "receipts must reconcile to GL source rows.");

for (const [source, label] of [
  [sqliteStore, "SQLite desktop store"],
  [postgresStore, "PostgreSQL desktop store"]
] as const) {
  requireIncludes(source, "StoreSyncTransportError", `${label} must classify network and HTTP failures.`);
  requireIncludes(source, "markOutboxAttemptStarted", `${label} must mark attempts before sending.`);
  requireIncludes(source, "markOutboxTransportFailure", `${label} must preserve broken pushes for retry.`);
  requireIncludes(source, "getPendingDownstreamAcknowledgements", `${label} must ACK applied downstream packets.`);
  requireIncludes(source, "markInboxAcknowledged", `${label} must persist downstream ACK posture.`);
  requireIncludes(source, "requeueDeadLetters", `${label} must expose operator retry for dead letters.`);
  requireIncludes(source, "next_retry_at", `${label} must persist retry windows.`);
  requireIncludes(source, "DEAD_LETTER", `${label} must stop exhausted retries from looping silently.`);
}

requireIncludes(syncDocs, "idempotency", "sync hardening docs must describe idempotency.");
requireIncludes(syncDocs, "rejected acknowledgement", "sync hardening docs must describe invalid ACK handling.");
requireIncludes(hardeningPack, "CH-01 upstream network break", "hardening pack must define upstream network chaos drill.");
requireIncludes(hardeningPack, "CH-09 business reconciliation", "hardening pack must define business reconciliation drill.");
requireIncludes(hardeningPack, "canonical fact count", "hardening pack must require double-post evidence.");
requireIncludes(uatEvidence, "Sync chaos and reconciliation", "UAT log must include sync chaos evidence row.");

console.log("Sync chaos and reconciliation gate passed.");
