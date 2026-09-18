import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { deriveEcommercePaymentProjection } from "../apps/enterprise-web/src/server/ecommerce/ecommerce-payment-state";

assert.deepEqual(
  deriveEcommercePaymentProjection({ totalAmount: 36998, paidAmount: 0, balanceAmount: 36998 }),
  { paidAmount: 0, balanceAmount: 36998, paymentStatus: "UNPAID" },
);
assert.deepEqual(
  deriveEcommercePaymentProjection({ totalAmount: 36998, paidAmount: 10000, balanceAmount: 26998 }),
  { paidAmount: 10000, balanceAmount: 26998, paymentStatus: "PARTIALLY_PAID" },
);
assert.deepEqual(
  deriveEcommercePaymentProjection({ totalAmount: 36998, paidAmount: 36998, balanceAmount: 0 }),
  { paidAmount: 36998, balanceAmount: 0, paymentStatus: "PAID" },
);
assert.deepEqual(
  deriveEcommercePaymentProjection({ totalAmount: 21552, paidAmount: 21552 }),
  { paidAmount: 21552, balanceAmount: 0, paymentStatus: "PAID" },
);

const migration = readFileSync(
  "prisma/migrations-sqlserver/20260825010000_ecommerce_store_payment_reconciliation/migration.sql",
  "utf8",
);
const onlineStoreRepository = readFileSync(
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
  "utf8",
);
for (const expected of [
  "deriveEcommercePaymentProjection",
  "tx.ecommerceOrder.updateMany",
  "paymentStatus: ecommercePaymentProjection.paymentStatus",
]) {
  assert.ok(
    onlineStoreRepository.includes(expected),
    `Direct-HQ ecommerce payment reconciliation is missing ${expected}.`,
  );
}

for (const expected of [
  "INNER JOIN [dbo].[SalesOrder]",
  "[sales].[status] IN (N'OPEN', N'FULFILLED')",
  "N'PARTIALLY_PAID'",
  "N'PAID'",
]) {
  assert.ok(migration.includes(expected), `Payment reconciliation migration is missing ${expected}.`);
}

console.log("Ecommerce POS payment reconciliation gate passed.");
