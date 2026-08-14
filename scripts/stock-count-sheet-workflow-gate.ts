import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";

const loginId = "count.sheet.admin";
const password = "CountSheetGate123!";

async function main() {
  const desktopSource = readFileSync(
    path.resolve("apps/store-desktop/src/renderer/modern-app.tsx"),
    "utf8",
  );
  const onlineSource = readFileSync(
    path.resolve(
      "apps/enterprise-web/src/components/enterprise/online-store-workspace.tsx",
    ),
    "utf8",
  );

  for (const [label, source] of [
    ["Store Desktop", desktopSource],
    ["Online Store", onlineSource],
  ] as const) {
    assert.match(source, /Add item/, `${label} must add items before persistence.`);
    assert.match(source, /Save count sheet/, `${label} must save one count sheet.`);
    assert.match(
      source,
      /Variance is calculated for review/,
      `${label} variance must be a review step without a row-level submit action.`,
    );
    assert.doesNotMatch(source, /Save line/);
    assert.doesNotMatch(source, /Save calculated rows/);
  }

  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "flash-erp-count-sheet-"),
  );
  const service = new LocalStoreService(temporaryDirectory, {
    databasePath: path.join(temporaryDirectory, "store.db"),
    deploymentMode: "STANDALONE",
    nodeCode: "count-sheet-gate-node",
    terminalCode: "COUNT-SHEET-01",
  });

  try {
    service.bootstrapStandaloneAdmin({
      loginId,
      displayName: "Count Sheet Administrator",
      password,
    });
    service.signInOperator({ loginId, password });
    service.saveStandaloneLocation({
      locationCode: "COUNT-FLOOR",
      locationName: "Count Floor",
      locationType: "STORE",
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true,
    });
    service.saveStandaloneProduct({
      productCode: "COUNT-GATE-A",
      productName: "Count Gate Product A",
      unitOfMeasure: "EA",
      unitPrice: 10,
      quantityOnHand: 5,
      trackInventory: true,
    });
    service.saveStandaloneProduct({
      productCode: "COUNT-GATE-B",
      productName: "Count Gate Product B",
      unitOfMeasure: "EA",
      unitPrice: 20,
      quantityOnHand: 8,
      trackInventory: true,
    });

    const sheetNo = "CNT-SHEET-20260814170000";
    const firstSave = service.saveStockCountSessionDraft({
      sheetNo,
      lineNo: 1,
      inventoryLocationCode: "COUNT-FLOOR",
      productCode: "COUNT-GATE-A",
      countedQuantity: 4,
    });
    const secondSave = service.saveStockCountSessionDraft({
      sheetNo,
      lineNo: 2,
      inventoryLocationCode: "COUNT-FLOOR",
      productCode: "COUNT-GATE-B",
      countedQuantity: 9,
    });
    const sheetLines = secondSave.snapshot.stockCountSessions.filter((session) =>
      session.sessionNo.startsWith(`${sheetNo}-L`),
    );

    assert.equal(sheetLines.length, 2);
    assert.deepEqual(
      sheetLines.map((line) => line.sessionNo).sort(),
      [`${sheetNo}-L001`, `${sheetNo}-L002`],
    );

    const firstLine = firstSave.snapshot.stockCountSessions.find(
      (session) => session.sessionNo === `${sheetNo}-L001`,
    );
    assert.ok(firstLine);
    const edited = service.saveStockCountSessionDraft({
      sessionId: firstLine.sessionId,
      sheetNo,
      lineNo: 1,
      inventoryLocationCode: "COUNT-FLOOR",
      productCode: "COUNT-GATE-A",
      countedQuantity: 3,
    });
    const editedLines = edited.snapshot.stockCountSessions.filter((session) =>
      session.sessionNo.startsWith(`${sheetNo}-L`),
    );

    assert.equal(editedLines.length, 2, "Editing a sheet line must not create a duplicate session.");
    assert.equal(
      editedLines.find((line) => line.sessionId === firstLine.sessionId)?.countedQuantity,
      3,
    );

    for (const line of editedLines) {
      service.submitStockCountSession(line.sessionId);
    }
    const submittedLines = service
      .getSyncSnapshot()
      .stockCountSessions.filter((session) => session.sessionNo.startsWith(`${sheetNo}-L`));
    assert.ok(submittedLines.every((line) => line.status === "SUBMITTED"));

    for (const line of submittedLines) {
      service.commitStockCountSession(line.sessionId);
    }
    const committedLines = service
      .getSyncSnapshot()
      .stockCountSessions.filter((session) => session.sessionNo.startsWith(`${sheetNo}-L`));
    assert.ok(committedLines.every((line) => line.status === "COMMITTED"));

    console.log("Stock count sheet workflow gate passed.");
  } finally {
    service.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
