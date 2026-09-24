import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  reconcileSalesOrderCollections,
  resolveSalesOrderCollectionAttribution,
} from "../packages/domain/src/sales-order-collections.js";

const order = {
  status: "FULFILLED",
  totalAmount: 1000,
  depositAmount: 500,
  balanceAmount: 0,
  depositPaidAt: "2026-09-01T10:00:00.000Z",
  fulfilledAt: "2026-09-22T14:00:00.000Z",
};

assert.deepEqual(
  reconcileSalesOrderCollections(
    { ...order, status: "OPEN", balanceAmount: 500, fulfilledAt: null },
    { dateFrom: "2026-09-01", dateTo: "2026-09-01" },
  ),
  {
    depositCollectedInPeriod: true,
    fulfilmentInPeriod: false,
    salesRecognizedAmount: 0,
    openingDepositCollectedAmount: 500,
    priorDepositAppliedAmount: 0,
    balanceCollectedAmount: 0,
    expectedTenderAmount: 500,
    outstandingBalanceAmount: 500,
  },
);

assert.deepEqual(
  reconcileSalesOrderCollections(order, { dateFrom: "2026-09-22", dateTo: "2026-09-22" }),
  {
    depositCollectedInPeriod: false,
    fulfilmentInPeriod: true,
    salesRecognizedAmount: 1000,
    openingDepositCollectedAmount: 0,
    priorDepositAppliedAmount: 500,
    balanceCollectedAmount: 500,
    expectedTenderAmount: 500,
    outstandingBalanceAmount: 0,
  },
);

const wholePeriod = reconcileSalesOrderCollections(order, { dateFrom: "2026-09-01", dateTo: "2026-09-22" });
assert.equal(wholePeriod?.expectedTenderAmount, 1000);
assert.equal(wholePeriod?.priorDepositAppliedAmount, 500);

assert.deepEqual(
  resolveSalesOrderCollectionAttribution({
    ...order,
    operatorName: "ORDER-CASHIER",
    fulfilledCashierCode: "FULFILMENT-CASHIER",
    payments: [
      {
        paymentPurpose: "SALES_ORDER_DEPOSIT",
        receivedCashierCode: "DEPOSIT-CASHIER",
        receivedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        paymentPurpose: "SALES_ORDER_BALANCE",
        receivedCashierCode: "BALANCE-CASHIER",
        receivedAt: "2026-09-22T14:00:00.000Z",
      },
    ],
  }),
  {
    orderCreatedBy: "ORDER-CASHIER",
    depositCollectedBy: "DEPOSIT-CASHIER",
    saleCompletedBy: "FULFILMENT-CASHIER",
    balanceCollectedBy: "BALANCE-CASHIER",
  },
);

assert.deepEqual(
  resolveSalesOrderCollectionAttribution({
    ...order,
    operatorName: "LEGACY-ORDER-CASHIER",
    fulfilledCashierCode: "LEGACY-FULFILMENT-CASHIER",
  }),
  {
    orderCreatedBy: "LEGACY-ORDER-CASHIER",
    depositCollectedBy: "LEGACY-ORDER-CASHIER",
    saleCompletedBy: "LEGACY-FULFILMENT-CASHIER",
    balanceCollectedBy: "LEGACY-FULFILMENT-CASHIER",
  },
);

for (const relativePath of [
  "apps/enterprise-web/src/server/repositories/enterprise-reporting.repository.ts",
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
  "apps/store-desktop/src/main/offline/local-store-service.ts",
  "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
  "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
  "apps/store-desktop/src/renderer/modern-app.tsx",
]) {
  const source = readFileSync(path.resolve(relativePath), "utf8");
  assert.match(source, /salesOrderCollectionRows|order-collections/);
  assert.match(source, /depositCollectedBy|deposit_collected_by/);
  assert.match(source, /balanceCollectedBy|balance_collected_by/);
}

for (const relativePath of [
  "apps/enterprise-web/src/server/repositories/enterprise-reporting.repository.ts",
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
  "apps/store-desktop/src/main/offline/local-store-service.ts",
  "apps/store-desktop/src/main/postgres/postgres-store-service.ts",
  "apps/store-desktop/src/main/mssql/mssql-store-service.ts",
]) {
  const source = readFileSync(path.resolve(relativePath), "utf8");
  assert.match(source, /orderType !== "LAYAWAY"/);
}

console.log("Sales-order collections reconciliation acceptance passed.");
