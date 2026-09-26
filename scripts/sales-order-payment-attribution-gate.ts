import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";

type ShiftRow = {
  id: string;
  shift_no: string;
  terminal_code: string;
  cashier_code: string;
  status: "OPEN" | "CLOSED";
  opening_float_amount: number;
  closing_declared_cash: number | null;
  closing_variance: number | null;
  opened_at: string;
  closed_at: string | null;
  record_version: number;
};

type ShiftSummary = {
  netSalesAmount: number;
  cashTenderedAmount: number;
  nonCashTenderedAmount: number;
};

type ReportResult = {
  summary: {
    netSalesAmount: number;
    tenderedAmount: number;
  };
  salesRows: Array<{
    paidAmount: number;
  }>;
  tenderRows: Array<{
    paymentId: string;
    transactionNo: string;
    occurredAt: string;
    cashierCode: string | null;
    shiftNo: string | null;
    paymentPurpose: string;
    reference: string | null;
    amount: number;
  }>;
};

const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "flash-erp-sales-order-payments-"),
);
const service = new LocalStoreService(temporaryDirectory, {
  databasePath: path.join(temporaryDirectory, "store.db"),
  deploymentMode: "STANDALONE",
  nodeCode: "erp-payment-attribution-gate",
  terminalCode: "POS-GATE-01",
});
const internals = service as unknown as {
  db: DatabaseSync;
  requireActiveOperatorSession(): {
    loginId: string;
    capabilities: { supervisorEligible: boolean };
  };
  browseStoreReports(input: {
    scope: "STORE";
    dateFrom: string;
    dateTo: string;
  }): ReportResult;
  toShiftSummary(shift: ShiftRow): ShiftSummary;
};

try {
  const db = internals.db;
  db.exec(`
    DELETE FROM pos_payment;
    DELETE FROM pos_transaction_line;
    DELETE FROM sales_order;
    DELETE FROM pos_transaction;
    DELETE FROM pos_shift;
  `);

  db.prepare(
    `INSERT INTO pos_shift (
      id, shift_no, terminal_code, cashier_code, status,
      opening_float_amount, closing_declared_cash, closing_variance,
      opened_at, closed_at, record_version
    ) VALUES (?, ?, 'POS-GATE-01', ?, 'CLOSED', 0, NULL, NULL, ?, ?, 1)`,
  ).run(
    "shift-monday",
    "SHIFT-MONDAY",
    "cashier-monday",
    "2026-08-03T08:00:00.000Z",
    "2026-08-03T17:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO pos_shift (
      id, shift_no, terminal_code, cashier_code, status,
      opening_float_amount, closing_declared_cash, closing_variance,
      opened_at, closed_at, record_version
    ) VALUES (?, ?, 'POS-GATE-01', ?, 'CLOSED', 0, NULL, NULL, ?, ?, 1)`,
  ).run(
    "shift-friday",
    "SHIFT-FRIDAY",
    "cashier-friday",
    "2026-08-07T08:00:00.000Z",
    "2026-08-07T17:00:00.000Z",
  );

  db.prepare(
    `INSERT INTO pos_transaction (
      id, transaction_no, shift_id, cashier_code, transaction_type, status,
      subtotal_amount, discount_amount, tax_amount, total_amount,
      paid_amount, change_amount, completed_at, record_version, updated_at
    ) VALUES (?, ?, ?, ?, 'SALE', 'COMPLETED', 5000, 0, 0, 5000, 5000, 0, ?, 2, ?)`,
  ).run(
    "sales-order-transaction",
    "POS-GATE-0001",
    "shift-friday",
    "cashier-friday",
    "2026-08-07T17:00:00.000Z",
    "2026-08-07T17:00:00.000Z",
  );

  const insertPayment = db.prepare(
    `INSERT INTO pos_payment (
      id, pos_transaction_id, tender_method_code, tender_method_name,
      method, payment_purpose, amount, reference,
      received_shift_id, received_shift_no, received_terminal_code,
      received_cashier_code, received_at
    ) VALUES (?, 'sales-order-transaction', 'CASH', 'Cash', 'CASH', ?, ?, ?, ?, ?, 'POS-GATE-01', ?, ?)`,
  );
  insertPayment.run(
    "deposit-payment",
    "SALES_ORDER_DEPOSIT",
    2000,
    "DEP-GATE-0001",
    "shift-monday",
    "SHIFT-MONDAY",
    "cashier-monday",
    "2026-08-03T10:00:00.000Z",
  );
  insertPayment.run(
    "balance-payment",
    "SALES_ORDER_BALANCE",
    3000,
    "BAL-GATE-0001",
    "shift-friday",
    "SHIFT-FRIDAY",
    "cashier-friday",
    "2026-08-07T14:00:00.000Z",
  );

  const monday = internals.toShiftSummary(
    db.prepare("SELECT * FROM pos_shift WHERE id = ?").get("shift-monday") as ShiftRow,
  );
  const friday = internals.toShiftSummary(
    db.prepare("SELECT * FROM pos_shift WHERE id = ?").get("shift-friday") as ShiftRow,
  );

  assert.equal(monday.netSalesAmount, 0);
  assert.equal(monday.cashTenderedAmount, 2000);
  assert.equal(monday.nonCashTenderedAmount, 0);
  assert.equal(friday.netSalesAmount, 5000);
  assert.equal(friday.cashTenderedAmount, 3000);
  assert.equal(friday.nonCashTenderedAmount, 0);

  internals.requireActiveOperatorSession = () => ({
    loginId: "gate-supervisor",
    capabilities: { supervisorEligible: true },
  });
  const mondayReport = internals.browseStoreReports({
    scope: "STORE",
    dateFrom: "2026-08-03",
    dateTo: "2026-08-03",
  });
  const fridayReport = internals.browseStoreReports({
    scope: "STORE",
    dateFrom: "2026-08-07",
    dateTo: "2026-08-07",
  });

  assert.equal(mondayReport.summary.tenderedAmount, 2000);
  assert.equal(mondayReport.summary.netSalesAmount, 0);
  assert.deepEqual(
    mondayReport.tenderRows.map((row) => [
      row.paymentId,
      row.transactionNo,
      row.cashierCode,
      row.shiftNo,
      row.paymentPurpose,
      row.reference,
      row.amount,
    ]),
    [["deposit-payment", "POS-GATE-0001", "cashier-monday", "SHIFT-MONDAY", "SALES_ORDER_DEPOSIT", "DEP-GATE-0001", 2000]],
  );
  assert.equal(fridayReport.summary.tenderedAmount, 3000);
  assert.equal(fridayReport.summary.netSalesAmount, 5000);
  assert.equal(fridayReport.salesRows[0]?.paidAmount, 5000);
  assert.deepEqual(
    fridayReport.tenderRows.map((row) => [
      row.paymentId,
      row.transactionNo,
      row.cashierCode,
      row.shiftNo,
      row.paymentPurpose,
      row.reference,
      row.amount,
    ]),
    [["balance-payment", "POS-GATE-0001", "cashier-friday", "SHIFT-FRIDAY", "SALES_ORDER_BALANCE", "BAL-GATE-0001", 3000]],
  );

  const enterpriseOperationsSource = readFileSync(
    path.resolve(
      "apps/enterprise-web/src/server/repositories/enterprise-operations.repository.ts",
    ),
    "utf8",
  );
  const collectionsStart = enterpriseOperationsSource.indexOf(
    'if (input.view === "collections")',
  );
  const collectionsEnd = enterpriseOperationsSource.indexOf(
    "const viewWhere:",
    collectionsStart,
  );
  const collectionsSource = enterpriseOperationsSource.slice(
    collectionsStart,
    collectionsEnd,
  );

  assert.ok(collectionsStart >= 0 && collectionsEnd > collectionsStart);
  assert.match(collectionsSource, /p\.\[receivedAt\] >= \$\{dateFrom\}/);
  assert.match(collectionsSource, /p\.\[receivedAt\] <= \$\{dateTo\}/);
  assert.doesNotMatch(
    collectionsSource,
    /t\.\[status\].*PosTransactionStatus\.COMPLETED/,
  );

  const dashboardSource = readFileSync(
    path.resolve(
      "apps/enterprise-web/src/components/enterprise/enterprise-overview-dashboard.tsx",
    ),
    "utf8",
  );
  const shopCardsIndex = dashboardSource.indexOf(
    "operationsDashboard.storeSummaries.map",
  );
  const collectionsCardIndex = dashboardSource.indexOf(
    'label="Amount collected"',
  );
  const masterCardsIndex = dashboardSource.indexOf("masterSummaryCards.map");

  assert.ok(shopCardsIndex >= 0);
  assert.ok(collectionsCardIndex > shopCardsIndex);
  assert.ok(masterCardsIndex > collectionsCardIndex);

  process.stdout.write(
    "FLASH-ERP sales-order payment attribution passed: deposit 2000 Monday, balance 3000 and sale 5000 Friday across shift and date reports.\n",
  );
} finally {
  service.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
