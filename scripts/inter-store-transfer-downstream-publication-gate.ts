import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { SyncEnvelope } from "@flash-erp/sync-core";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";

function dbOf(service: LocalStoreService) {
  return (service as unknown as { db: DatabaseSync }).db;
}

async function main() {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "flash-erp-transfer-publication-"),
  );
  const service = new LocalStoreService(temporaryDirectory, {
    databasePath: path.join(temporaryDirectory, "store.db"),
    deploymentMode: "STANDALONE",
    nodeCode: "transfer-publication-gate-node",
    terminalCode: "TRANSFER-PUBLICATION-01",
  });

  try {
    const db = dbOf(service);
    const storeCode = (
      db.prepare("SELECT value FROM app_metadata WHERE key = 'store_code'").get() as
        | { value: string }
        | undefined
    )?.value;

    assert.ok(storeCode, "The local store must expose its configured store code.");

    const event: SyncEnvelope = {
      eventId: "1d9a250c-012c-4e84-93fd-be5e92c23c7f",
      idempotencyKey: "transfer-publication-gate-key",
      aggregateType: "interStoreTransfer",
      aggregateId: "1d9a250c-012c-4e84-93fd-be5e92c23c7f",
      eventType: "inter-store-transfer.published",
      originatingNodeCode: "ENTERPRISE-HQ",
      targetNodeCode: "transfer-publication-gate-node",
      recordVersion: 1,
      occurredAt: new Date().toISOString(),
      payload: {
        storeCode,
        role: "DESTINATION",
        transferId: "1d9a250c-012c-4e84-93fd-be5e92c23c7f",
        transferNo: "ITR-CAPECO-OSUSAL-20260814103516891",
        transferBatchNo: "ITR-CAPECO-OSUSAL-20260814103516891",
        lineNo: 1,
        origin: "ENTERPRISE",
        status: "REQUESTED",
        externalReference: null,
        sourceStoreCode: "cape-coast-castle-road",
        sourceStoreName: "Cape Coast Castle Road",
        sourceLocationCode: "cape-coast-sales-floor",
        sourceLocationName: "Cape Coast Sales Floor",
        destinationStoreCode: storeCode,
        destinationStoreName: "Flash Store",
        destinationLocationCode: "osu-sales-floor",
        destinationLocationName: "Osu Sales Floor",
        productCode: "ACC-TGLASS-UNIV",
        productName: "Tempered Glass Screen Protector",
        departmentCode: "ACCESSORIES",
        departmentName: "ACCESSORIES",
        categoryCode: "PROTECTION",
        categoryName: "PROTECTION",
        subcategory: "Screen Protectors",
        isSerialized: false,
        trackExpiry: true,
        requestedQuantity: 1,
        requestedUnitOfMeasure: "PACK",
        requestedUnitQuantity: 1,
        uomConversionFactor: 5,
        baseUnitOfMeasure: "EA",
        issuedQuantity: 0,
        receivedQuantity: 0,
        outstandingIssueQuantity: 1,
        outstandingReceiptQuantity: 0,
        unitCost: 18,
        issuedSerialNumbers: [],
        receivedSerialNumbers: [],
        issuedBatchAllocations: [
          {
            batchId: "batch-gate-1",
            batchNo: "BATCH-GATE-1",
            manufacturedAt: "2026-08-01",
            expiryDate: "2027-08-01",
            quantity: 1,
          },
        ],
        receivedBatchAllocations: [],
        requestNote: "Transfer publication regression gate.",
        issueNote: null,
        receiptNote: null,
        requestOperatorName: "Gate operator",
        issueOperatorName: null,
        receiptOperatorName: null,
        requestedByNodeCode: null,
        sourceNodeCode: null,
        destinationNodeCode: "transfer-publication-gate-node",
        requestedAt: new Date().toISOString(),
        requiredAt: null,
        issuedAt: null,
        receivedAt: null,
        closedAt: null,
      },
    };

    const appliedIds = (
      service as unknown as {
        applyDownstreamBatch: (
          events: SyncEnvelope[],
          remoteNodeCode: string,
          cursor: string | null,
        ) => string[];
      }
    ).applyDownstreamBatch([event], "ENTERPRISE-HQ", "gate-cursor");

    assert.deepEqual(appliedIds, [event.eventId]);
    const transfer = db
      .prepare(
        `SELECT
           track_expiry,
           requested_unit_of_measure,
           requested_unit_quantity,
           uom_conversion_factor,
           base_unit_of_measure,
           issued_batch_allocations_json,
           received_batch_allocations_json
         FROM inter_store_transfer_snapshot
         WHERE id = ?`,
      )
      .get(event.aggregateId) as {
      track_expiry: number;
      requested_unit_of_measure: string;
      requested_unit_quantity: number;
      uom_conversion_factor: number;
      base_unit_of_measure: string;
      issued_batch_allocations_json: string;
      received_batch_allocations_json: string;
    };

    assert.equal(transfer.track_expiry, 1);
    assert.equal(transfer.requested_unit_of_measure, "PACK");
    assert.equal(transfer.requested_unit_quantity, 1);
    assert.equal(transfer.uom_conversion_factor, 5);
    assert.equal(transfer.base_unit_of_measure, "EA");
    assert.equal(JSON.parse(transfer.issued_batch_allocations_json).length, 1);
    assert.deepEqual(
      transfer.received_batch_allocations_json
        ? JSON.parse(transfer.received_batch_allocations_json)
        : [],
      [],
    );

    const localServiceSource = readFileSync(
      path.resolve("apps/store-desktop/src/main/offline/local-store-service.ts"),
      "utf8",
    );
    const syncRepositorySource = readFileSync(
      path.resolve("apps/enterprise-web/src/server/repositories/store-sync.repository.ts"),
      "utf8",
    );
    const syncDetailSource = readFileSync(
      path.resolve("apps/enterprise-web/src/components/enterprise/enterprise-sync-node-detail.tsx"),
      "utf8",
    );

    assert.match(localServiceSource, /failedDownstreamEvents:/);
    assert.match(syncRepositorySource, /errorMessage: failure\.errorMessage/);
    assert.match(syncDetailSource, /Failure reason/);

    console.log("Inter-store transfer downstream publication gate passed.");
  } finally {
    await service.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
