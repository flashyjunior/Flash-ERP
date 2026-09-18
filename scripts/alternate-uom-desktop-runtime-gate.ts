import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";
import { buildReceiptPrintWindowHtml } from "../apps/store-desktop/src/shared/receipt-printing";

const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "flash-erp-alternate-uom-"),
);
const loginId = "uom.gate.admin";
const password = "UomGateAdmin123!";
const service = new LocalStoreService(temporaryDirectory, {
  databasePath: path.join(temporaryDirectory, "store.db"),
  deploymentMode: "STANDALONE",
  nodeCode: "uom-gate-node",
  terminalCode: "UOM-GATE-01",
});
const internals = service as unknown as { db: DatabaseSync };

try {
  service.bootstrapStandaloneAdmin({
    loginId,
    displayName: "UOM Gate Admin",
    password,
  });
  service.signInOperator({ loginId, password });
  service.saveStandaloneUnitOfMeasure({
    uomCode: "CTN",
    uomName: "Carton",
    decimalPrecision: 0,
    allowFractionalSale: false,
  });
  service.saveStandaloneUnitOfMeasure({
    uomCode: "PK",
    uomName: "Pack",
    decimalPrecision: 0,
    allowFractionalSale: false,
  });
  service.saveStandaloneUnitOfMeasure({
    uomCode: "PAIR",
    uomName: "Pair",
    decimalPrecision: 0,
    allowFractionalSale: false,
  });
  service.saveStandaloneLocation({
    locationCode: "SHOP-FLOOR",
    locationName: "Shop Floor",
    locationType: "STORE",
    useForSalesDefault: true,
    useForSalesOrderDefault: true,
    useForReceivingDefault: true,
  });
  service.saveStandaloneLocation({
    locationCode: "WAREHOUSE",
    locationName: "Warehouse",
    locationType: "WAREHOUSE",
    useForSalesDefault: false,
    useForSalesOrderDefault: false,
    useForReceivingDefault: false,
  });
  service.saveStandaloneProduct({
    productCode: "UOM-GATE-COLA",
    productName: "UOM Gate Cola",
    unitOfMeasure: "EA",
    unitPrice: 3,
    quantityOnHand: 100,
    trackInventory: true,
    sellingUnits: [
      {
        unitOfMeasureCode: "CTN",
        unitOfMeasureName: "Carton",
        conversionFactor: 24,
        unitPrice: 60,
        barcode: "UOM-GATE-CTN-24",
        isDefault: true,
      },
    ],
  });
  service.saveStandaloneCustomer({
    customerNo: "UOM-GATE-CUSTOMER",
    fullName: "UOM Provider Gate Customer",
  });
  service.saveStandaloneProduct({
    productCode: "UOM-GATE-WIPES",
    productName: "UOM Gate Wipes",
    unitOfMeasure: "EA",
    unitPrice: 2,
    quantityOnHand: 30,
    trackInventory: true,
    trackExpiry: true,
    sellingUnits: [
      {
        unitOfMeasureCode: "PK",
        unitOfMeasureName: "Pack",
        conversionFactor: 10,
        unitPrice: 18,
        barcode: "UOM-GATE-WIPES-PK-10",
        isDefault: true,
      },
    ],
  });
  service.saveStandaloneProduct({
    productCode: "UOM-GATE-PHONES",
    productName: "UOM Gate Phones",
    unitOfMeasure: "EA",
    unitPrice: 100,
    quantityOnHand: 2,
    trackInventory: true,
    isSerialized: true,
    sellingUnits: [
      {
        unitOfMeasureCode: "PAIR",
        unitOfMeasureName: "Pair",
        conversionFactor: 2,
        unitPrice: 190,
        barcode: "UOM-GATE-PHONES-PAIR-2",
        isDefault: true,
      },
    ],
  });
  const inventoryControlTimestamp = new Date().toISOString();
  internals.db
    .prepare(
      `INSERT INTO inventory_batch_registry (
        id, product_code, inventory_location_code, batch_no, manufactured_at,
        expiry_date, quantity_on_hand, status, source_reference_type,
        source_reference_id, source_reference_label, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
    )
    .run(
      "uom-gate-batch-first",
      "UOM-GATE-WIPES",
      "SHOP-FLOOR",
      "WIPES-FIRST",
      "2026-01-01",
      "2030-01-01",
      6,
      "ACCEPTANCE_GATE",
      "uom-gate-batches",
      "Alternate UOM gate",
      inventoryControlTimestamp,
    );
  internals.db
    .prepare(
      `INSERT INTO inventory_batch_registry (
        id, product_code, inventory_location_code, batch_no, manufactured_at,
        expiry_date, quantity_on_hand, status, source_reference_type,
        source_reference_id, source_reference_label, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
    )
    .run(
      "uom-gate-batch-later",
      "UOM-GATE-WIPES",
      "SHOP-FLOOR",
      "WIPES-LATER",
      "2026-01-01",
      "2031-01-01",
      24,
      "ACCEPTANCE_GATE",
      "uom-gate-batches",
      "Alternate UOM gate",
      inventoryControlTimestamp,
    );
  for (const [id, serialNumber] of [
    ["uom-gate-phone-1", "UOM-PHONE-0001"],
    ["uom-gate-phone-2", "UOM-PHONE-0002"],
  ]) {
    internals.db
      .prepare(
        `INSERT INTO serial_registry (
          id, product_code, serial_number, inventory_location_code, status,
          source_transaction_id, source_transaction_no, updated_at
        ) VALUES (?, 'UOM-GATE-PHONES', ?, 'SHOP-FLOOR', 'AVAILABLE', NULL, NULL, ?)`,
      )
      .run(id, serialNumber, inventoryControlTimestamp);
  }
  service.openShift({ cashierCode: loginId, openingFloatAmount: 0 });
  service.captureScannedSale({
    lookupValue: "UOM-GATE-CTN-24",
    quantity: 2,
  });

  const completedSale = internals.db
    .prepare(
      `SELECT id, transaction_no
       FROM pos_transaction
       WHERE status = 'COMPLETED' AND transaction_type = 'SALE'
       ORDER BY completed_at DESC
       LIMIT 1`,
    )
    .get() as { id: string; transaction_no: string };
  const saleLine = internals.db
    .prepare(
      `SELECT id, quantity, selling_unit_of_measure, base_unit_of_measure,
              uom_conversion_factor, base_quantity, unit_price, line_total
       FROM pos_transaction_line
       WHERE pos_transaction_id = ? AND line_intent = 'SALE'
       LIMIT 1`,
    )
    .get(completedSale.id) as {
    id: string;
    quantity: number;
    selling_unit_of_measure: string;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    base_quantity: number;
    unit_price: number;
    line_total: number;
  };

  assert.equal(saleLine.quantity, 2);
  assert.equal(saleLine.selling_unit_of_measure, "CTN");
  assert.equal(saleLine.base_unit_of_measure, "EA");
  assert.equal(saleLine.uom_conversion_factor, 24);
  assert.equal(saleLine.base_quantity, 48);
  assert.equal(saleLine.unit_price, 60);
  assert.equal(saleLine.line_total, 120);

  const locationBalance = internals.db
    .prepare(
      `SELECT quantity_on_hand
       FROM inventory_location_balance
       WHERE product_code = 'UOM-GATE-COLA'
       LIMIT 1`,
    )
    .get() as { quantity_on_hand: number };
  assert.equal(locationBalance.quantity_on_hand, 52);

  service.startReturnFromReceipt(completedSale.transaction_no);
  service.addReceiptLineToBasket({
    sourceTransactionId: completedSale.id,
    sourceLineId: saleLine.id,
    quantity: 1,
  });
  service.checkoutActiveBasket();

  const returnLine = internals.db
    .prepare(
      `SELECT quantity, selling_unit_of_measure, base_unit_of_measure,
              uom_conversion_factor, base_quantity, unit_price, line_total
       FROM pos_transaction_line
       WHERE source_line_id = ? AND line_intent = 'RETURN'
       LIMIT 1`,
    )
    .get(saleLine.id) as {
    quantity: number;
    selling_unit_of_measure: string;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    base_quantity: number;
    unit_price: number;
    line_total: number;
  };

  assert.equal(returnLine.quantity, 1);
  assert.equal(returnLine.selling_unit_of_measure, "CTN");
  assert.equal(returnLine.base_unit_of_measure, "EA");
  assert.equal(returnLine.uom_conversion_factor, 24);
  assert.equal(returnLine.base_quantity, 24);
  assert.equal(returnLine.unit_price, 60);
  assert.equal(returnLine.line_total, 60);

  const returnedLocationBalance = internals.db
    .prepare(
      `SELECT quantity_on_hand
       FROM inventory_location_balance
       WHERE product_code = 'UOM-GATE-COLA'
       LIMIT 1`,
    )
    .get() as { quantity_on_hand: number };
  assert.equal(returnedLocationBalance.quantity_on_hand, 76);

  service.addItemToBasket({
    lookupValue: "UOM-GATE-CTN-24",
    quantity: 1,
    lineIntent: "SALE",
  });
  service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer",
  });
  service.createSalesOrderFromActiveBasket({
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 20,
        reference: "UOM-GATE-DEPOSIT",
      },
    ],
  });

  const openOrder = internals.db
    .prepare(
      `SELECT sales_order.id, sales_order.order_no, sales_order.status, sales_order.total_amount,
              sales_order.deposit_amount, sales_order.balance_amount,
              transaction_row.status AS transaction_status,
              line.quantity, line.selling_unit_of_measure, line.base_unit_of_measure,
              line.uom_conversion_factor, line.base_quantity, line.unit_price, line.line_total,
              COALESCE((SELECT SUM(amount) FROM pos_payment WHERE pos_transaction_id = sales_order.source_transaction_id), 0) AS paid_amount
       FROM sales_order
       INNER JOIN pos_transaction transaction_row
         ON transaction_row.id = sales_order.source_transaction_id
       INNER JOIN pos_transaction_line line
         ON line.pos_transaction_id = sales_order.source_transaction_id
       WHERE sales_order.status = 'OPEN'
       ORDER BY sales_order.created_at DESC
       LIMIT 1`,
    )
    .get() as {
    id: string;
    order_no: string;
    status: string;
    transaction_status: string;
    total_amount: number;
    deposit_amount: number;
    balance_amount: number;
    quantity: number;
    selling_unit_of_measure: string;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    base_quantity: number;
    unit_price: number;
    line_total: number;
    paid_amount: number;
  };

  assert.equal(openOrder.status, "OPEN");
  assert.equal(openOrder.transaction_status, "PARKED");
  assert.equal(openOrder.total_amount, 60);
  assert.equal(openOrder.deposit_amount, 20);
  assert.equal(openOrder.balance_amount, 40);
  assert.equal(openOrder.quantity, 1);
  assert.equal(openOrder.selling_unit_of_measure, "CTN");
  assert.equal(openOrder.base_unit_of_measure, "EA");
  assert.equal(openOrder.uom_conversion_factor, 24);
  assert.equal(openOrder.base_quantity, 24);
  assert.equal(openOrder.unit_price, 60);
  assert.equal(openOrder.line_total, 60);
  assert.equal(openOrder.paid_amount, 20);

  service.resumeSalesOrder(openOrder.id);
  service.discardActiveBasket();
  const recoveredOrder = internals.db
    .prepare(
      `SELECT sales_order.status, transaction_row.status AS transaction_status,
              line.quantity, line.selling_unit_of_measure, line.base_quantity,
              line.base_unit_of_measure, line.uom_conversion_factor
       FROM sales_order
       INNER JOIN pos_transaction transaction_row
         ON transaction_row.id = sales_order.source_transaction_id
       INNER JOIN pos_transaction_line line
         ON line.pos_transaction_id = sales_order.source_transaction_id
       WHERE sales_order.id = ?`,
    )
    .get(openOrder.id) as {
    status: string;
    transaction_status: string;
    quantity: number;
    selling_unit_of_measure: string;
    base_quantity: number;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
  };
  assert.equal(recoveredOrder.status, "OPEN");
  assert.equal(recoveredOrder.transaction_status, "PARKED");
  assert.equal(recoveredOrder.quantity, 1);
  assert.equal(recoveredOrder.selling_unit_of_measure, "CTN");
  assert.equal(recoveredOrder.base_quantity, 24);
  assert.equal(recoveredOrder.base_unit_of_measure, "EA");
  assert.equal(recoveredOrder.uom_conversion_factor, 24);
  service.resumeSalesOrder(openOrder.id);
  service.checkoutActiveBasket({
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 40,
        reference: "UOM-GATE-BALANCE",
      },
    ],
  });

  const fulfilledOrder = internals.db
    .prepare(
      `SELECT sales_order.status, sales_order.balance_amount,
              transaction_row.status AS transaction_status,
              line.quantity, line.selling_unit_of_measure, line.base_unit_of_measure,
              line.uom_conversion_factor, line.base_quantity, line.unit_price, line.line_total,
              balance.quantity_on_hand,
              COALESCE((SELECT SUM(amount) FROM pos_payment WHERE pos_transaction_id = sales_order.source_transaction_id), 0) AS paid_amount
       FROM sales_order
       INNER JOIN pos_transaction transaction_row
         ON transaction_row.id = sales_order.source_transaction_id
       INNER JOIN pos_transaction_line line
         ON line.pos_transaction_id = sales_order.source_transaction_id
       INNER JOIN inventory_location_balance balance
         ON balance.product_code = line.product_code_snapshot
       WHERE sales_order.id = ?`,
    )
    .get(openOrder.id) as {
    status: string;
    transaction_status: string;
    balance_amount: number;
    quantity: number;
    selling_unit_of_measure: string;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    base_quantity: number;
    unit_price: number;
    line_total: number;
    quantity_on_hand: number;
    paid_amount: number;
  };

  assert.equal(fulfilledOrder.status, "FULFILLED");
  assert.equal(fulfilledOrder.transaction_status, "COMPLETED");
  assert.equal(fulfilledOrder.balance_amount, 0);
  assert.equal(fulfilledOrder.quantity, 1);
  assert.equal(fulfilledOrder.selling_unit_of_measure, "CTN");
  assert.equal(fulfilledOrder.base_unit_of_measure, "EA");
  assert.equal(fulfilledOrder.uom_conversion_factor, 24);
  assert.equal(fulfilledOrder.base_quantity, 24);
  assert.equal(fulfilledOrder.unit_price, 60);
  assert.equal(fulfilledOrder.line_total, 60);
  assert.equal(fulfilledOrder.quantity_on_hand, 52);
  assert.equal(fulfilledOrder.paid_amount, 60);

  service.addItemToBasket({
    lookupValue: "UOM-GATE-CTN-24",
    quantity: 1,
    lineIntent: "SALE",
  });
  service.attachCustomerToActiveBasket({
    customerId: "standalone-customer-uom-gate-customer",
  });
  service.createSalesOrderFromActiveBasket({ payments: [] });
  const cancellableOrder = internals.db
    .prepare(
      `SELECT sales_order.id, sales_order.order_no
       FROM sales_order
       WHERE sales_order.status = 'OPEN'
       ORDER BY sales_order.created_at DESC
       LIMIT 1`,
    )
    .get() as { id: string; order_no: string };
  service.cancelSalesOrder({
    orderId: cancellableOrder.id,
    operatorName: "SQLite UOM Gate Admin",
    note: "Alternate-UOM cancellation acceptance",
  });
  const cancelledOrder = internals.db
    .prepare(
      `SELECT sales_order.status, transaction_row.status AS transaction_status,
              line.quantity, line.selling_unit_of_measure, line.base_unit_of_measure,
              line.uom_conversion_factor, line.base_quantity, line.unit_price, line.line_total,
              balance.quantity_on_hand,
              COALESCE((SELECT SUM(amount) FROM pos_payment WHERE pos_transaction_id = sales_order.source_transaction_id), 0) AS paid_amount
       FROM sales_order
       INNER JOIN pos_transaction transaction_row
         ON transaction_row.id = sales_order.source_transaction_id
       INNER JOIN pos_transaction_line line
         ON line.pos_transaction_id = sales_order.source_transaction_id
       INNER JOIN inventory_location_balance balance
         ON balance.product_code = line.product_code_snapshot
       WHERE sales_order.id = ?`,
    )
    .get(cancellableOrder.id) as {
    status: string;
    transaction_status: string;
    quantity: number;
    selling_unit_of_measure: string;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    base_quantity: number;
    unit_price: number;
    line_total: number;
    quantity_on_hand: number;
    paid_amount: number;
  };
  assert.equal(cancelledOrder.status, "CANCELLED");
  assert.equal(cancelledOrder.transaction_status, "CANCELLED");
  assert.equal(cancelledOrder.quantity, 1);
  assert.equal(cancelledOrder.selling_unit_of_measure, "CTN");
  assert.equal(cancelledOrder.base_unit_of_measure, "EA");
  assert.equal(cancelledOrder.uom_conversion_factor, 24);
  assert.equal(cancelledOrder.base_quantity, 24);
  assert.equal(cancelledOrder.unit_price, 60);
  assert.equal(cancelledOrder.line_total, 60);
  assert.equal(cancelledOrder.quantity_on_hand, 52);
  assert.equal(cancelledOrder.paid_amount, 0);

  const productReport = service.browseStoreReports({
    scope: "STORE",
    productQuery: "UOM-GATE-COLA",
    limit: 100,
  });
  const cartonReportRow = productReport.productRows.find(
    (row) =>
      row.productCode === "UOM-GATE-COLA" &&
      row.sellingUnitOfMeasure === "CTN",
  );
  assert.ok(cartonReportRow, "SQLite product report did not retain the carton UOM.");
  assert.equal(cartonReportRow.quantity, 2);
  assert.equal(cartonReportRow.baseQuantity, 48);
  assert.equal(cartonReportRow.baseUnitOfMeasure, "EA");
  assert.equal(cartonReportRow.uomConversionFactor, 24);
  assert.equal(cartonReportRow.grossAmount, 120);
  assert.equal(cartonReportRow.netAmount, 120);

  const saleReceipt = service.getPrintableReceiptDocument(
    completedSale.transaction_no,
  );
  const saleReceiptLine = saleReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(saleReceiptLine, "SQLite receipt did not retain the carton sale line.");
  assert.equal(saleReceiptLine.quantity, 2);
  assert.equal(saleReceiptLine.sellingUnitOfMeasure, "CTN");
  assert.equal(saleReceiptLine.baseQuantity, 48);
  assert.equal(saleReceiptLine.baseUnitOfMeasure, "EA");
  assert.equal(saleReceiptLine.uomConversionFactor, 24);
  const receiptHtml = buildReceiptPrintWindowHtml(saleReceipt);
  assert.match(receiptHtml, /2 CTN/);
  assert.match(receiptHtml, /1 CTN = 24 EA/);
  assert.match(receiptHtml, /48 EA base/);

  const salesOrderReceipt = service.getPrintableSalesOrderReceiptDocument(
    openOrder.order_no,
  );
  const salesOrderReceiptLine = salesOrderReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(
    salesOrderReceiptLine,
    "SQLite sales-order reprint did not retain the carton line.",
  );
  assert.equal(salesOrderReceiptLine.sellingUnitOfMeasure, "CTN");
  assert.equal(salesOrderReceiptLine.baseQuantity, 24);

  const cancelledOrderReceipt = service.getPrintableSalesOrderReceiptDocument(
    cancellableOrder.order_no,
  );
  const cancelledOrderReceiptLine = cancelledOrderReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(
    cancelledOrderReceiptLine,
    "SQLite cancelled sales-order reprint did not retain the carton line.",
  );
  assert.equal(cancelledOrderReceiptLine.quantity, 1);
  assert.equal(cancelledOrderReceiptLine.sellingUnitOfMeasure, "CTN");
  assert.equal(cancelledOrderReceiptLine.baseQuantity, 24);
  assert.equal(cancelledOrderReceiptLine.baseUnitOfMeasure, "EA");
  assert.equal(cancelledOrderReceiptLine.uomConversionFactor, 24);

  service.startReturnFromReceipt(completedSale.transaction_no);
  service.addReceiptLineToBasket({
    sourceTransactionId: completedSale.id,
    sourceLineId: saleLine.id,
    quantity: 1,
  });
  service.checkoutActiveBasket();

  const reversalSummary = internals.db
    .prepare(
      `SELECT COUNT(*) AS line_count, SUM(line.quantity) AS quantity,
              SUM(line.base_quantity) AS base_quantity,
              MAX(balance.quantity_on_hand) AS quantity_on_hand,
              MIN(CASE WHEN line.selling_unit_of_measure = 'CTN'
                AND line.base_unit_of_measure = 'EA'
                AND line.uom_conversion_factor = 24
                THEN 1 ELSE 0 END) AS snapshots_are_consistent
       FROM pos_transaction_line line
       INNER JOIN pos_transaction transaction_row
         ON transaction_row.id = line.pos_transaction_id
       INNER JOIN inventory_location_balance balance
         ON balance.product_code = line.product_code_snapshot
       WHERE line.source_line_id = ?
         AND line.line_intent = 'RETURN'
         AND transaction_row.status = 'COMPLETED'
         AND transaction_row.transaction_type = 'RETURN'`,
    )
    .get(saleLine.id) as {
    line_count: number;
    quantity: number;
    base_quantity: number;
    quantity_on_hand: number;
    snapshots_are_consistent: number;
  };
  assert.equal(reversalSummary.line_count, 2);
  assert.equal(reversalSummary.quantity, 2);
  assert.equal(reversalSummary.base_quantity, 48);
  assert.equal(reversalSummary.quantity_on_hand, 76);
  assert.equal(reversalSummary.snapshots_are_consistent, 1);
  assert.throws(() => {
    service.startReturnFromReceipt(completedSale.transaction_no);
    service.addReceiptLineToBasket({
      sourceTransactionId: completedSale.id,
      sourceLineId: saleLine.id,
      quantity: 1,
    });
  });
  try {
    service.discardActiveBasket();
  } catch {
    // The fully returned receipt is rejected before a basket is created.
  }

  const reversedProductReport = service.browseStoreReports({
    scope: "STORE",
    productQuery: "UOM-GATE-COLA",
    limit: 100,
  });
  const reversedCartonReportRow = reversedProductReport.productRows.find(
    (row) =>
      row.productCode === "UOM-GATE-COLA" &&
      row.sellingUnitOfMeasure === "CTN",
  );
  assert.ok(
    reversedCartonReportRow,
    "SQLite product report lost the carton UOM after reversal.",
  );
  assert.equal(reversedCartonReportRow.quantity, 1);
  assert.equal(reversedCartonReportRow.baseQuantity, 24);
  assert.equal(reversedCartonReportRow.netAmount, 60);

  const transferTimestamp = new Date().toISOString();
  internals.db
    .prepare(
      `UPDATE inventory_location_balance
       SET quantity_on_hand = 0, updated_at = ?
       WHERE location_code = 'SHOP-FLOOR' AND product_code = 'UOM-GATE-COLA'`,
    )
    .run(transferTimestamp);
  internals.db
    .prepare(
      `INSERT INTO inventory_location_balance (
        location_code, product_code, quantity_on_hand, updated_at
      ) VALUES ('WAREHOUSE', 'UOM-GATE-COLA', 76, ?)
      ON CONFLICT(location_code, product_code) DO UPDATE SET
        quantity_on_hand = excluded.quantity_on_hand,
        updated_at = excluded.updated_at`,
    )
    .run(transferTimestamp);
  internals.db
    .prepare(
      `INSERT INTO inter_store_transfer_snapshot (
        id, transfer_no, line_no, role, origin, status,
        source_store_code, source_store_name, source_location_code, source_location_name,
        destination_store_code, destination_store_name,
        destination_location_code, destination_location_name,
        product_code, product_name, is_serialized, track_expiry,
        requested_quantity, requested_unit_of_measure, requested_unit_quantity,
        uom_conversion_factor, base_unit_of_measure, issued_quantity, received_quantity,
        outstanding_issue_quantity, outstanding_receipt_quantity, requested_at, updated_at
      ) VALUES (
        'uom-gate-transfer', 'TR-UOM-GATE-0001', 1, 'SOURCE', 'ENTERPRISE', 'REQUESTED',
        'UOM-GATE', 'UOM Gate', 'WAREHOUSE', 'Warehouse',
        'UOM-GATE', 'UOM Gate', 'SHOP-FLOOR', 'Shop Floor',
        'UOM-GATE-COLA', 'UOM Gate Cola', 0, 0,
        24, 'CTN', 1, 24, 'EA', 0, 0, 24, 0, ?, ?
      )`,
    )
    .run(transferTimestamp, transferTimestamp);

  service.issueInterStoreTransfer({
    transferId: "uom-gate-transfer",
    sourceLocationCode: "WAREHOUSE",
    quantity: 24,
    operatorName: "UOM Gate Admin",
  });
  internals.db
    .prepare(
      `UPDATE inter_store_transfer_snapshot
       SET role = 'DESTINATION', updated_at = ?
       WHERE id = 'uom-gate-transfer'`,
    )
    .run(new Date().toISOString());
  service.receiveInterStoreTransfer({
    transferId: "uom-gate-transfer",
    quantity: 24,
    operatorName: "UOM Gate Admin",
  });

  const transfer = internals.db
    .prepare(
      `SELECT transfer.status, transfer.requested_quantity,
              transfer.requested_unit_of_measure, transfer.requested_unit_quantity,
              transfer.uom_conversion_factor, transfer.base_unit_of_measure,
              transfer.issued_quantity, transfer.received_quantity,
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
       WHERE transfer.id = 'uom-gate-transfer'`,
    )
    .get() as {
    status: string;
    requested_quantity: number;
    requested_unit_of_measure: string;
    requested_unit_quantity: number;
    uom_conversion_factor: number;
    base_unit_of_measure: string;
    issued_quantity: number;
    received_quantity: number;
    source_quantity_on_hand: number;
    destination_quantity_on_hand: number;
    product_quantity_on_hand: number;
  };
  assert.equal(transfer.status, "RECEIVED");
  assert.equal(transfer.requested_quantity, 24);
  assert.equal(transfer.requested_unit_of_measure, "CTN");
  assert.equal(transfer.requested_unit_quantity, 1);
  assert.equal(transfer.uom_conversion_factor, 24);
  assert.equal(transfer.base_unit_of_measure, "EA");
  assert.equal(transfer.issued_quantity, 24);
  assert.equal(transfer.received_quantity, 24);
  assert.equal(transfer.source_quantity_on_hand, 52);
  assert.equal(transfer.destination_quantity_on_hand, 24);
  assert.equal(transfer.product_quantity_on_hand, 76);

  service.captureScannedSale({
    lookupValue: "UOM-GATE-WIPES-PK-10",
    quantity: 1,
  });
  service.captureScannedSale({
    lookupValue: "UOM-GATE-PHONES-PAIR-2",
    quantity: 1,
    serialNumbers: ["UOM-PHONE-0001", "UOM-PHONE-0002"],
  });

  const expirySaleLine = internals.db
    .prepare(
      `SELECT quantity, selling_unit_of_measure, base_quantity,
              base_unit_of_measure, uom_conversion_factor, batch_allocations_json
       FROM pos_transaction_line
       WHERE product_code_snapshot = 'UOM-GATE-WIPES'
       ORDER BY rowid DESC
       LIMIT 1`,
    )
    .get() as {
    quantity: number;
    selling_unit_of_measure: string;
    base_quantity: number;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    batch_allocations_json: string;
  };
  const expiryAllocations = JSON.parse(expirySaleLine.batch_allocations_json) as Array<{
    batchId: string;
    quantity: number;
  }>;
  assert.equal(expirySaleLine.quantity, 1);
  assert.equal(expirySaleLine.selling_unit_of_measure, "PK");
  assert.equal(expirySaleLine.base_quantity, 10);
  assert.equal(expirySaleLine.base_unit_of_measure, "EA");
  assert.equal(expirySaleLine.uom_conversion_factor, 10);
  assert.deepEqual(
    expiryAllocations.map(({ batchId, quantity }) => ({ batchId, quantity })),
    [
      { batchId: "uom-gate-batch-first", quantity: 6 },
      { batchId: "uom-gate-batch-later", quantity: 4 },
    ],
  );
  const expiryBalances = internals.db
    .prepare(
      `SELECT id, quantity_on_hand
       FROM inventory_batch_registry
       WHERE product_code = 'UOM-GATE-WIPES'
       ORDER BY expiry_date ASC`,
    )
    .all() as Array<{ id: string; quantity_on_hand: number }>;
  assert.deepEqual(expiryBalances.map((row) => ({ ...row })), [
    { id: "uom-gate-batch-first", quantity_on_hand: 0 },
    { id: "uom-gate-batch-later", quantity_on_hand: 20 },
  ]);

  const serializedSaleLine = internals.db
    .prepare(
      `SELECT quantity, selling_unit_of_measure, base_quantity,
              base_unit_of_measure, uom_conversion_factor, serial_numbers_json
       FROM pos_transaction_line
       WHERE product_code_snapshot = 'UOM-GATE-PHONES'
       ORDER BY rowid DESC
       LIMIT 1`,
    )
    .get() as {
    quantity: number;
    selling_unit_of_measure: string;
    base_quantity: number;
    base_unit_of_measure: string;
    uom_conversion_factor: number;
    serial_numbers_json: string;
  };
  assert.equal(serializedSaleLine.quantity, 1);
  assert.equal(serializedSaleLine.selling_unit_of_measure, "PAIR");
  assert.equal(serializedSaleLine.base_quantity, 2);
  assert.equal(serializedSaleLine.base_unit_of_measure, "EA");
  assert.equal(serializedSaleLine.uom_conversion_factor, 2);
  assert.deepEqual(JSON.parse(serializedSaleLine.serial_numbers_json), [
    "UOM-PHONE-0001",
    "UOM-PHONE-0002",
  ]);
  const serialStatuses = internals.db
    .prepare(
      `SELECT serial_number, status
       FROM serial_registry
       WHERE product_code = 'UOM-GATE-PHONES'
       ORDER BY serial_number`,
    )
    .all() as Array<{ serial_number: string; status: string }>;
  assert.deepEqual(serialStatuses.map((row) => ({ ...row })), [
    { serial_number: "UOM-PHONE-0001", status: "SOLD" },
    { serial_number: "UOM-PHONE-0002", status: "SOLD" },
  ]);

  service.saveStandaloneProduct({
    productCode: "UOM-GATE-COLA",
    productName: "UOM Gate Cola",
    unitOfMeasure: "EA",
    unitPrice: 9,
    quantityOnHand: 76,
    trackInventory: true,
    sellingUnits: [
      {
        unitOfMeasureCode: "CTN",
        unitOfMeasureName: "Carton",
        conversionFactor: 12,
        unitPrice: 999,
        barcode: "UOM-GATE-CTN-12-UPDATED",
        isDefault: true,
      },
    ],
  });
  const historicalReceipt = service.getPrintableReceiptDocument(
    completedSale.transaction_no,
  );
  const historicalReceiptLine = historicalReceipt.lines.find(
    (line) => line.productCode === "UOM-GATE-COLA",
  );
  assert.ok(historicalReceiptLine);
  assert.equal(historicalReceiptLine.uomConversionFactor, 24);
  assert.equal(historicalReceiptLine.baseQuantity, 48);
  assert.equal(historicalReceiptLine.unitPrice, 60);
  const historicalReport = service.browseStoreReports({
    scope: "STORE",
    productQuery: "UOM-GATE-COLA",
    limit: 100,
  });
  const historicalReportRow = historicalReport.productRows.find(
    (row) =>
      row.productCode === "UOM-GATE-COLA" &&
      row.sellingUnitOfMeasure === "CTN",
  );
  assert.ok(historicalReportRow);
  assert.equal(historicalReportRow.uomConversionFactor, 24);
  assert.equal(historicalReportRow.baseQuantity, 24);
  assert.equal(historicalReportRow.netAmount, 60);

  console.log(
    "Alternate-UOM desktop runtime gate passed: sale, reversal, partial-deposit fulfilment, cancellation/recovery, report/reprint, carton transfer, FEFO batch allocation, and serial movement reconciled in base units.",
  );
} finally {
  service.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
