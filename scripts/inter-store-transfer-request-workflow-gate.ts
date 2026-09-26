import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";

const loginId = "transfer.request.admin";
const password = "TransferRequestGate123!";

function dbOf(service: LocalStoreService) {
  return (service as unknown as { db: DatabaseSync }).db;
}

async function main() {
  const renderer = readFileSync(
    path.resolve(
      "apps/store-desktop/src/renderer/modern-app.tsx",
    ),
    "utf8",
  );
  const rendererStyles = readFileSync(
    path.resolve(
      "apps/store-desktop/src/renderer/modern-styles.css",
    ),
    "utf8",
  );
  const onlineStoreRepository = readFileSync(
    path.resolve(
      "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
    ),
    "utf8",
  );

  for (const label of [
    "Search product",
    "Source shop",
    "Product",
    "Request destination",
    "Total on hand",
    "Dispatch location",
  ]) {
    assert.ok(
      renderer.includes(`<span>${label}</span>`),
      `Other shop stock must label the ${label.toLowerCase()} control.`,
    );
  }
  assert.ok(
    renderer.includes("rms-stock-request-header-form"),
    "Stock request header must use its compact purpose-built form grid.",
  );
  assert.ok(
    renderer.includes("rms-stock-request-line-form"),
    "Stock request details must use its compact purpose-built line grid.",
  );
  assert.ok(
    rendererStyles.includes(".rms-stock-request-header-form"),
    "Stock request header layout styles must exist.",
  );
  assert.ok(
    rendererStyles.includes(".rms-remote-inventory-dialog .rms-toolbar-actions"),
    "Other shop stock toolbar actions must remain aligned responsively.",
  );
  assert.ok(
    onlineStoreRepository.includes("changed while it was being issued") &&
      onlineStoreRepository.includes("changed while it was being received") &&
      onlineStoreRepository.includes("sourceInventoryLocationId: selectedSourceLocation.id") &&
      onlineStoreRepository.includes("destinationInventoryLocationId: transfer.destinationInventoryLocationId"),
    "Online transfer issue and receipt must retain optimistic quantity and location guards.",
  );

  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "flash-erp-transfer-request-"),
  );
  const service = new LocalStoreService(temporaryDirectory, {
    databasePath: path.join(temporaryDirectory, "store.db"),
    deploymentMode: "STANDALONE",
    nodeCode: "transfer-request-gate-node",
    terminalCode: "TRANSFER-GATE-01",
  });

  try {
  service.bootstrapStandaloneAdmin({
    loginId,
    displayName: "Transfer Request Admin",
    password,
  });
  service.signInOperator({ loginId, password });
  service.saveStandaloneLocation({
    locationCode: "SHOP-FLOOR",
    locationName: "Shop Floor",
    locationType: "STORE",
    useForSalesDefault: true,
    useForSalesOrderDefault: true,
    useForReceivingDefault: true,
  });
  service.saveStandaloneLocation({
    locationCode: "BACKROOM",
    locationName: "Backroom",
    locationType: "STORE",
  });
  service.saveStandaloneProduct({
    productCode: "TRANSFER-GATE-A",
    productName: "Transfer Gate Product A",
    unitOfMeasure: "EA",
    unitPrice: 10,
    quantityOnHand: 0,
    trackInventory: true,
  });
  service.saveStandaloneProduct({
    productCode: "TRANSFER-GATE-B",
    productName: "Transfer Gate Product B",
    unitOfMeasure: "EA",
    unitPrice: 20,
    quantityOnHand: 0,
    trackInventory: true,
  });

  const db = dbOf(service);
  db.prepare(
    `INSERT INTO inter_store_transfer_request_target_snapshot (
       source_location_code, source_store_code, source_store_name,
       source_store_sales_enabled, source_store_warehouse_enabled,
       source_location_name, source_location_type, source_location_status,
       source_location_defaults, source_warehouse_code, source_warehouse_name,
       use_for_sales_default, use_for_receiving_default, updated_at
     ) VALUES (?, ?, ?, 1, 1, ?, 'STORE', 'ACTIVE', '', NULL, NULL, 1, 1, ?)`,
  ).run(
    "accra-central-sales-floor",
    "warehouse-hub",
    "Warehouse Hub",
    "Warehouse Hub Sales Floor",
    new Date().toISOString(),
  );

  (
    service as unknown as { isStandaloneDeployment: () => boolean }
  ).isStandaloneDeployment = () => false;

  const saved = await service.saveInterStoreTransferRequestDraft({
    sourceStoreCode: "WAREHOUSE-HUB",
    destinationLocationCode: "SHOP-FLOOR",
    externalReference: "TRANSFER-GATE",
    lines: [
      { productCode: "TRANSFER-GATE-A", quantity: 2, unitOfMeasure: "EA" },
      { productCode: "TRANSFER-GATE-B", quantity: 3, unitOfMeasure: "EA" },
    ],
  });
  const draft = saved.snapshot.transferRequestDrafts[0];

  assert.ok(draft, "Expected one saved transfer request draft.");
  assert.equal(saved.snapshot.transferRequestDrafts.length, 1);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.sourceStoreCode, "warehouse-hub");
  assert.equal(draft.sourceLocationCode, "accra-central-sales-floor");
  assert.equal(draft.lines.length, 2);
  assert.deepEqual(
    draft.lines.map((line) => line.requestedUnitQuantity),
    [2, 3],
  );

  const persistedBeforeAmendment = db
    .prepare(
      "SELECT status, lines_json FROM inter_store_transfer_request_draft WHERE id = ?",
    )
    .get(draft.draftId) as { status: string; lines_json: string };
  assert.equal(persistedBeforeAmendment.status, "DRAFT");
  assert.equal(JSON.parse(persistedBeforeAmendment.lines_json).length, 2);

  const amended = await service.saveInterStoreTransferRequestDraft({
    draftId: draft.draftId,
    sourceStoreCode: "warehouse-hub",
    destinationLocationCode: "SHOP-FLOOR",
    externalReference: "TRANSFER-GATE-AMENDED",
    lines: [
      { productCode: "TRANSFER-GATE-A", quantity: 4, unitOfMeasure: "EA" },
      { productCode: "TRANSFER-GATE-B", quantity: 5, unitOfMeasure: "EA" },
    ],
  });
  assert.equal(amended.snapshot.transferRequestDrafts.length, 1);
  assert.equal(amended.snapshot.transferRequestDrafts[0]?.draftId, draft.draftId);
  assert.deepEqual(
    amended.snapshot.transferRequestDrafts[0]?.lines.map(
      (line) => line.requestedUnitQuantity,
    ),
    [4, 5],
  );

  const submitted = await service.submitInterStoreTransferRequestDraft(
    draft.draftId,
  );
  const submittedDraft = submitted.snapshot.transferRequestDrafts.find(
    (candidate) => candidate.draftId === draft.draftId,
  );
  assert.equal(submittedDraft?.status, "SUBMITTED");
  assert.ok(submittedDraft?.submittedAt);

  const publications = db
    .prepare(
      `SELECT aggregate_id, payload_json
       FROM sync_outbox
       WHERE event_type = 'inter-store-transfer.requested'
       ORDER BY created_at, aggregate_id`,
    )
    .all() as Array<{ aggregate_id: string; payload_json: string }>;
  assert.equal(publications.length, 2);
  const payloads = publications.map((row) => JSON.parse(row.payload_json));
  assert.deepEqual(
    payloads.map((payload) => payload.transferBatchNo),
    [draft.requestNo, draft.requestNo],
  );
  assert.deepEqual(
    payloads.map((payload) => payload.lineNo).sort(),
    [1, 2],
  );
  assert.ok(payloads.every((payload) => payload.sourceStoreCode === "warehouse-hub"));
  assert.ok(
    payloads.every((payload) => payload.sourceLocationCode === undefined),
    "The requesting shop must not choose or publish a source location.",
  );

  const directSaved = await service.saveInterStoreTransferRequestDraft({
    direction: "DIRECT_OUT",
    sourceStoreCode: "WAREHOUSE-HUB",
    destinationLocationCode: "BACKROOM",
    externalReference: "DIRECT-OUT-GATE",
    lines: [
      { productCode: "TRANSFER-GATE-A", quantity: 1, unitOfMeasure: "EA" },
    ],
  });
  const directDraft = directSaved.snapshot.transferRequestDrafts.find(
    (candidate) => candidate.externalReference === "DIRECT-OUT-GATE",
  );
  assert.ok(directDraft, "Expected one direct transfer-out draft.");
  assert.equal(directDraft.sourceStoreCode, directSaved.snapshot.storeCode);
  assert.equal(directDraft.sourceLocationCode, "BACKROOM");
  assert.equal(directDraft.destinationStoreCode, "warehouse-hub");
  assert.equal(
    directDraft.destinationLocationCode,
    "accra-central-sales-floor",
  );

  await service.submitInterStoreTransferRequestDraft(directDraft.draftId);
  const directPublication = db
    .prepare(
      `SELECT payload_json
       FROM sync_outbox
       WHERE event_type = 'inter-store-transfer.requested'
         AND aggregate_id = ?`,
    )
    .get(directDraft.lines[0]?.lineId) as { payload_json: string } | undefined;
  assert.ok(directPublication, "Expected a queued direct transfer-out publication.");
  const directPayload = JSON.parse(directPublication.payload_json);
  assert.equal(directPayload.direction, "DIRECT_OUT");
  assert.equal(directPayload.sourceStoreCode, directSaved.snapshot.storeCode);
  assert.equal(directPayload.sourceLocationCode, "BACKROOM");
  assert.equal(directPayload.destinationLocationCode, "accra-central-sales-floor");
  db.prepare(
    `INSERT INTO sync_outbox (
       id, target_node_code, aggregate_type, aggregate_id, event_type,
       idempotency_key, payload_json, status, attempt_count, record_version,
       created_at, updated_at
     ) VALUES (
       'old-low-priority-event', 'ENTERPRISE-HQ', 'storeExpense',
       'old-low-priority-expense', 'store-expense.confirmed',
       'old-low-priority-expense-key', '{}', 'PENDING', 0, 1,
       '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z'
     )`,
  ).run();
  const prioritizedRows = (
    service as unknown as {
      getPendingUpstreamRows: (
        limit: number,
      ) => Array<{ aggregate_type: string }>;
    }
  ).getPendingUpstreamRows(1);
  assert.equal(
    prioritizedRows[0]?.aggregate_type,
    "interStoreTransfer",
    "Critical transfer events must move ahead of older lower-priority backlog records.",
  );

  const issueTransferId = "transfer-request-gate-issue";
  const timestamp = new Date().toISOString();
  db.prepare(
    `UPDATE product_snapshot
     SET quantity_on_hand = 10, updated_at = ?
     WHERE product_code = 'TRANSFER-GATE-A'`,
  ).run(timestamp);
  db.prepare(
    `INSERT INTO inventory_location_balance (
       location_code, product_code, quantity_on_hand, updated_at
     ) VALUES ('BACKROOM', 'TRANSFER-GATE-A', 10, ?)
     ON CONFLICT(location_code, product_code) DO UPDATE SET
       quantity_on_hand = excluded.quantity_on_hand,
       updated_at = excluded.updated_at`,
  ).run(timestamp);
  db.prepare(
    `INSERT INTO inter_store_transfer_snapshot (
       id, transfer_no, role, origin, status,
       source_store_code, source_store_name,
       source_location_code, source_location_name,
       destination_store_code, destination_store_name,
       destination_location_code, destination_location_name,
       product_code, product_name, is_serialized,
       requested_quantity, issued_quantity, received_quantity,
       outstanding_issue_quantity, outstanding_receipt_quantity,
       requested_at, updated_at
     ) VALUES (?, 'TR-GATE-ISSUE-001', 'SOURCE', 'STORE_REQUEST', 'REQUESTED',
       'local-shop', 'Local Shop',
       'SHOP-FLOOR', 'Provisional request location',
       'destination-shop', 'Destination Shop',
       'DEST-FLOOR', 'Destination Floor',
       'TRANSFER-GATE-A', 'Transfer Gate Product A', 0,
       5, 0, 0, 5, 0, ?, ?)`,
  ).run(issueTransferId, timestamp, timestamp);

  await service.issueInterStoreTransfer({
    transferId: issueTransferId,
    sourceLocationCode: "BACKROOM",
    quantity: 4,
  });

  const issuedTransfer = db
    .prepare(
      `SELECT source_location_code, source_location_name, issued_quantity
       FROM inter_store_transfer_snapshot
       WHERE id = ?`,
    )
    .get(issueTransferId) as {
      source_location_code: string;
      source_location_name: string;
      issued_quantity: number;
    };
  const backroomBalance = db
    .prepare(
      `SELECT quantity_on_hand
       FROM inventory_location_balance
       WHERE location_code = 'BACKROOM' AND product_code = 'TRANSFER-GATE-A'`,
    )
    .get() as { quantity_on_hand: number };
  assert.equal(issuedTransfer.source_location_code, "BACKROOM");
  assert.equal(issuedTransfer.source_location_name, "Backroom");
  assert.equal(Number(issuedTransfer.issued_quantity), 4);
  assert.equal(Number(backroomBalance.quantity_on_hand), 6);

  db.prepare(
    `UPDATE inter_store_transfer_snapshot
     SET role = 'DESTINATION', updated_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), issueTransferId);

  assert.throws(
    () => service.receiveInterStoreTransfer({ transferId: issueTransferId, quantity: 5 }),
    /Only 4\.000 unit\(s\) remain to receive/,
    "A destination must not receive more stock than the source has issued.",
  );

  service.receiveInterStoreTransfer({ transferId: issueTransferId, quantity: 2 });
  service.receiveInterStoreTransfer({ transferId: issueTransferId, quantity: 2 });

  const partiallyReceivedTransfer = db
    .prepare(
      `SELECT transfer.status, transfer.issued_quantity, transfer.received_quantity,
              transfer.outstanding_issue_quantity, transfer.outstanding_receipt_quantity,
              source.quantity_on_hand AS source_quantity_on_hand,
              destination.quantity_on_hand AS destination_quantity_on_hand,
              product.quantity_on_hand AS product_quantity_on_hand
       FROM inter_store_transfer_snapshot transfer
       INNER JOIN inventory_location_balance source
         ON source.location_code = transfer.source_location_code
        AND source.product_code = transfer.product_code
       INNER JOIN inventory_location_balance destination
         ON destination.location_code = transfer.destination_location_code
        AND destination.product_code = transfer.product_code
       INNER JOIN product_snapshot product
         ON product.product_code = transfer.product_code
       WHERE transfer.id = ?`,
    )
    .get(issueTransferId) as {
    status: string;
    issued_quantity: number;
    received_quantity: number;
    outstanding_issue_quantity: number;
    outstanding_receipt_quantity: number;
    source_quantity_on_hand: number;
    destination_quantity_on_hand: number;
    product_quantity_on_hand: number;
  };
  assert.equal(partiallyReceivedTransfer.status, "PART_RECEIVED");
  assert.equal(Number(partiallyReceivedTransfer.issued_quantity), 4);
  assert.equal(Number(partiallyReceivedTransfer.received_quantity), 4);
  assert.equal(Number(partiallyReceivedTransfer.outstanding_issue_quantity), 1);
  assert.equal(Number(partiallyReceivedTransfer.outstanding_receipt_quantity), 0);
  assert.equal(Number(partiallyReceivedTransfer.source_quantity_on_hand), 6);
  assert.equal(Number(partiallyReceivedTransfer.destination_quantity_on_hand), 4);
  assert.equal(Number(partiallyReceivedTransfer.product_quantity_on_hand), 10);

  db.prepare(
    `UPDATE inter_store_transfer_snapshot
     SET role = 'SOURCE', updated_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), issueTransferId);
  service.issueInterStoreTransfer({
    transferId: issueTransferId,
    sourceLocationCode: "BACKROOM",
    quantity: 1,
  });
  db.prepare(
    `UPDATE inter_store_transfer_snapshot
     SET role = 'DESTINATION', updated_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), issueTransferId);
  service.receiveInterStoreTransfer({ transferId: issueTransferId, quantity: 1 });

  const completedTransfer = db
    .prepare(
      `SELECT transfer.status, transfer.issued_quantity, transfer.received_quantity,
              source.quantity_on_hand AS source_quantity_on_hand,
              destination.quantity_on_hand AS destination_quantity_on_hand,
              product.quantity_on_hand AS product_quantity_on_hand
       FROM inter_store_transfer_snapshot transfer
       INNER JOIN inventory_location_balance source
         ON source.location_code = transfer.source_location_code
        AND source.product_code = transfer.product_code
       INNER JOIN inventory_location_balance destination
         ON destination.location_code = transfer.destination_location_code
        AND destination.product_code = transfer.product_code
       INNER JOIN product_snapshot product
         ON product.product_code = transfer.product_code
       WHERE transfer.id = ?`,
    )
    .get(issueTransferId) as {
    status: string;
    issued_quantity: number;
    received_quantity: number;
    source_quantity_on_hand: number;
    destination_quantity_on_hand: number;
    product_quantity_on_hand: number;
  };
  assert.equal(completedTransfer.status, "RECEIVED");
  assert.equal(Number(completedTransfer.issued_quantity), 5);
  assert.equal(Number(completedTransfer.received_quantity), 5);
  assert.equal(Number(completedTransfer.source_quantity_on_hand), 5);
  assert.equal(Number(completedTransfer.destination_quantity_on_hand), 5);
  assert.equal(Number(completedTransfer.product_quantity_on_hand), 10);
  } finally {
    service.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(
    "Inter-store transfer request gate passed: requesting, priority publication, guarded issue and receipt, partial completion, final receipt, and stock conservation all agree.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
