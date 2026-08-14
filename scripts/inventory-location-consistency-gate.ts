import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";

const loginId = "inventory.location.admin";
const password = "InventoryLocationGate123!";

function dbOf(service: LocalStoreService) {
  return (service as unknown as { db: DatabaseSync }).db;
}

async function main() {
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "flash-erp-inventory-location-"),
  );
  const service = new LocalStoreService(temporaryDirectory, {
    databasePath: path.join(temporaryDirectory, "store.db"),
    deploymentMode: "STANDALONE",
    nodeCode: "inventory-location-gate-node",
    terminalCode: "INVENTORY-LOCATION-GATE-01",
  });

  try {
    service.bootstrapStandaloneAdmin({
      loginId,
      displayName: "Inventory Location Admin",
      password,
    });
    service.signInOperator({ loginId, password });
    service.saveStandaloneLocation({
      locationCode: "OSU-SALES-FLOOR",
      locationName: "Osu Sales Floor",
      locationType: "STORE",
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true,
    });
    service.saveStandaloneProduct({
      productCode: "LOCATION-GATE-A",
      productName: "Legacy Aggregate Product",
      unitOfMeasure: "EA",
      unitPrice: 10,
      quantityOnHand: 5,
      trackInventory: true,
    });
    service.saveStandaloneProduct({
      productCode: "LOCATION-GATE-B",
      productName: "Location Balance Product",
      unitOfMeasure: "EA",
      unitPrice: 20,
      quantityOnHand: 7,
      trackInventory: true,
    });

    const db = dbOf(service);
    db.prepare(
      "UPDATE inventory_location_snapshot SET location_code = 'osu-sales-floor' WHERE location_code = 'OSU-SALES-FLOOR'",
    ).run();
    db.prepare(
      "DELETE FROM inventory_location_balance WHERE product_code = 'LOCATION-GATE-A'",
    ).run();

    const positions = service.browseInventoryPositions({ limit: 30 });
    const aggregatePosition = positions.find(
      (position) => position.productCode === "LOCATION-GATE-A",
    );
    const balancePosition = positions.find(
      (position) => position.productCode === "LOCATION-GATE-B",
    );

    assert.equal(aggregatePosition?.locationCode, "osu-sales-floor");
    assert.equal(aggregatePosition?.locationName, "Osu Sales Floor");
    assert.equal(balancePosition?.locationCode, "osu-sales-floor");
    assert.equal(balancePosition?.locationName, "Osu Sales Floor");
    assert.ok(
      positions.every((position) => position.locationName !== "Store stock"),
      "Inventory positions must use a canonical location name or an explicit unassigned label.",
    );

    service.saveStockCountSessionDraft({
      inventoryLocationCode: "osu-sales-floor",
      productCode: "LOCATION-GATE-A",
      countedQuantity: 4,
    });
    const count = db
      .prepare(
        `SELECT inventory_location_code, inventory_location_name
         FROM stock_count_session
         WHERE product_code = 'LOCATION-GATE-A'
         LIMIT 1`,
      )
      .get() as
      | {
          inventory_location_code: string;
          inventory_location_name: string;
        }
      | undefined;

    assert.equal(count?.inventory_location_code, "osu-sales-floor");
    assert.equal(count?.inventory_location_name, "Osu Sales Floor");
  } finally {
    service.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(
    "Inventory location consistency gate passed: aggregate stock and case-varied balances resolve to the synced location, and lowercase location codes can create stock counts.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
