import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { SyncEnvelope } from "@flash-erp/sync-core";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service.js";

const testRoot = mkdtempSync(path.join(tmpdir(), "flash-rms-sync-recovery-"));
const databasePath = path.join(testRoot, "store.sqlite");
const loginId = "sync.recovery.admin";
const password = "SyncRecovery123!";
const retryableEventId = "sync-retryable-network";
const permanentEventId = "sync-permanent-stale-version";
const ecommerceHandoffEventId = "sync-ecommerce-handoff-stale-version";
const supplierEventId = "sync-supplier-publication";
let activeService: LocalStoreService | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createService() {
  return new LocalStoreService(testRoot, {
    databasePath,
    deploymentMode: "STANDALONE",
    nodeCode: "sync-recovery-node",
    terminalCode: "sync-recovery-terminal",
  });
}

try {
  const setupService = createService();
  setupService.bootstrapStandaloneAdmin({
    loginId,
    displayName: "Sync Recovery Admin",
    password,
  });
  setupService.close();

  const database = new DatabaseSync(databasePath);
  const timestamp = new Date().toISOString();
  const storeCode = (
    database
      .prepare("SELECT value FROM app_metadata WHERE key = 'store_code'")
      .get() as { value: string }
  ).value;
  const insert = database.prepare(
    `INSERT INTO sync_outbox (
      id, target_node_code, aggregate_type, aggregate_id, event_type,
      idempotency_key, payload_json, status, attempt_count, error_message,
      failure_kind, last_http_status, last_attempt_at, next_retry_at,
      sync_run_id, record_version, created_at, updated_at
    ) VALUES (?, 'enterprise-primary', 'product', ?, 'product.updated', ?, ?,
      'DEAD_LETTER', 5, ?, ?, ?, ?, NULL, ?, 1, ?, ?)`,
  );
  insert.run(
    retryableEventId,
    "SYNC-RETRYABLE",
    "sync-retryable-key",
    JSON.stringify({ productCode: "SYNC-RETRYABLE" }),
    "NETWORK: HQ was unavailable.",
    "NETWORK",
    null,
    timestamp,
    "sync-run-network",
    timestamp,
    timestamp,
  );
  database.prepare(
    `INSERT INTO sync_outbox (
      id, target_node_code, aggregate_type, aggregate_id, event_type,
      idempotency_key, payload_json, status, attempt_count, error_message,
      failure_kind, last_http_status, last_attempt_at, next_retry_at,
      sync_run_id, record_version, created_at, updated_at
    ) VALUES (?, 'enterprise-primary', 'posTransaction', ?, 'pos.transaction.completed', ?, ?,
      'DEAD_LETTER', 1, ?, 'STALE_VERSION', 409, ?, NULL, ?, 1, ?, ?)`,
  ).run(
    ecommerceHandoffEventId,
    "ecommerce-handoff-transaction",
    "sync-ecommerce-handoff-key",
    JSON.stringify({
      transactionId: "ecommerce-handoff-transaction",
      transactionNo: "WEB-ECOM-EAST-LEGON-MARKET-1000-101",
    }),
    'STALE_VERSION: Flash ERP already has transaction id "ecommerce-handoff-transaction" from another store event.',
    timestamp,
    "sync-run-ecommerce-handoff",
    timestamp,
    timestamp,
  );
  insert.run(
    permanentEventId,
    "SYNC-PERMANENT",
    "sync-permanent-key",
    JSON.stringify({ productCode: "SYNC-PERMANENT" }),
    "STALE_VERSION: HQ already has a newer record.",
    "STALE_VERSION",
    409,
    timestamp,
    "sync-run-stale",
    timestamp,
    timestamp,
  );
  database.close();

  const service = createService();
  activeService = service;
  service.signInOperator({ loginId, password });
  const before = service.getSyncSnapshot();
  const retryableSummary = before.syncDeadLetters.find(
    (entry) => entry.id === retryableEventId,
  );
  const permanentSummary = before.syncDeadLetters.find(
    (entry) => entry.id === permanentEventId,
  );
  assert(retryableSummary?.failureKind === "NETWORK", "Retryable failure classification was not exposed.");
  assert(retryableSummary.syncRunId === "sync-run-network", "Retryable sync run correlation was not exposed.");
  assert(permanentSummary?.lastHttpStatus === 409, "Permanent failure HTTP status was not exposed.");

  const acknowledgedSupplierIds = (
    service as unknown as {
      applyDownstreamBatch(
        events: SyncEnvelope[],
        remoteNodeCode: string,
        cursor: string | null,
      ): string[];
    }
  ).applyDownstreamBatch(
    [
      {
        eventId: supplierEventId,
        idempotencyKey: "sync-supplier-publication-key",
        aggregateType: "supplier",
        aggregateId: "sync-supplier-id",
        eventType: "supplier.published",
        originatingNodeCode: "enterprise-primary",
        targetNodeCode: "sync-recovery-node",
        recordVersion: 1,
        occurredAt: timestamp,
        payload: {
          storeCode,
          supplierId: "sync-supplier-id",
          supplierNo: "SYNC-SUP-001",
          supplierName: "Sync Supplier",
          contactName: "Receiving Contact",
          phone: "+233000000001",
          email: "sync-supplier@example.test",
          addressLine1: "Sync Street",
          city: "Accra",
          countryCode: "GH",
          leadTimeDays: 2,
          status: "ACTIVE",
          publishedAt: timestamp,
        },
      },
    ],
    "enterprise-primary",
    "supplier-publication-cursor",
  );
  assert(
    acknowledgedSupplierIds.includes(supplierEventId),
    "Supplier publication was not acknowledged by the offline store.",
  );

  const result = service.requeueDeadLetters();
  assert(result.message.includes("Permanent conflicts were left unchanged"), "Retry result did not explain permanent conflict handling.");
  service.close();
  activeService = null;

  const verificationDatabase = new DatabaseSync(databasePath, { readOnly: true });
  const retryableRow = verificationDatabase
    .prepare("SELECT status, failure_kind FROM sync_outbox WHERE id = ?")
    .get(retryableEventId) as { status: string; failure_kind: string | null };
  const permanentRow = verificationDatabase
    .prepare("SELECT status, failure_kind FROM sync_outbox WHERE id = ?")
    .get(permanentEventId) as { status: string; failure_kind: string | null };
  const ecommerceHandoffRow = verificationDatabase
    .prepare("SELECT status, failure_kind FROM sync_outbox WHERE id = ?")
    .get(ecommerceHandoffEventId) as { status: string; failure_kind: string | null };
  const supplierRow = verificationDatabase
    .prepare(
      "SELECT supplier_name, phone, status FROM supplier_snapshot WHERE supplier_no = ?",
    )
    .get("SYNC-SUP-001") as
    | { supplier_name: string; phone: string | null; status: string }
    | undefined;
  verificationDatabase.close();

  assert(retryableRow.status === "PENDING", "Eligible network failure was not requeued.");
  assert(retryableRow.failure_kind === null, "Eligible failure metadata was not reset for retry.");
  assert(permanentRow.status === "DEAD_LETTER", "Permanent stale-version conflict was incorrectly requeued.");
  assert(permanentRow.failure_kind === "STALE_VERSION", "Permanent conflict diagnostics were erased.");
  assert(ecommerceHandoffRow.status === "PENDING", "The recognised ecommerce handoff was not requeued.");
  assert(ecommerceHandoffRow.failure_kind === null, "The ecommerce handoff retry metadata was not reset.");
  assert(supplierRow?.supplier_name === "Sync Supplier", "Supplier publication was not applied locally.");
  assert(supplierRow.phone === "+233000000001", "Supplier contact data was not applied locally.");
  assert(supplierRow.status === "ACTIVE", "Supplier status was not applied locally.");

  console.log("Desktop sync recovery policy gate passed.");
} finally {
  activeService?.close();

  try {
    rmSync(testRoot, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    });
  } catch {
    // A Windows scanner can briefly retain SQLite WAL files after the test.
  }
}
