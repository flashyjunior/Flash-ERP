import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildLayawayPolicySnapshot,
  calculateLayawayMinimumDeposit,
} from "../packages/domain/src/layaway";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function requireIncludes(source: string, expected: string, message: string) {
  assert.ok(source.includes(expected), message);
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260814_03_ecommerce_layaway/migration.sql");
const compatibility = read(
  "apps/enterprise-web/src/server/repositories/schema-compatibility.repository.ts",
);
const ecommerceRepository = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts",
);
const ecommercePayments = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce-payments.ts",
);
const staffConsole = read(
  "apps/enterprise-web/src/components/ecommerce/online-store-ecommerce-workspace.tsx",
);
const storefront = read(
  "apps/enterprise-web/src/components/ecommerce/public-storefront.tsx",
);

assert.equal(calculateLayawayMinimumDeposit(475, 20), 95);
assert.deepEqual(
  buildLayawayPolicySnapshot(
    {
      enabled: true,
      reserveStockOnDeposit: true,
      minimumDepositPercent: 20,
      requireFullPaymentBeforeFulfilment: true,
      refundPaymentsOnCancellation: true,
      cancellationFeeType: "PERCENTAGE",
      cancellationFeeValue: 5,
    },
    "2026-08-14T12:00:00.000Z",
  ),
  {
    enabled: true,
    reserveStockOnDeposit: true,
    minimumDepositPercent: 20,
    requireFullPaymentBeforeFulfilment: true,
    refundPaymentsOnCancellation: true,
    cancellationFeeType: "PERCENTAGE",
    cancellationFeeValue: 5,
    capturedAt: "2026-08-14T12:00:00.000Z",
  },
);

for (const source of [schema, migration, compatibility]) {
  requireIncludes(
    source,
    "ecommerceLayawayEnabled",
    "The database must persist the store-level ecommerce Layaway opt-in.",
  );
  requireIncludes(
    source,
    "layawayDepositAmount",
    "The database must persist the requested ecommerce Layaway deposit.",
  );
}

for (const expected of [
  'orderType?: "SALES_ORDER" | "LAYAWAY"',
  "buildLayawayPolicySnapshot",
  "calculateLayawayMinimumDeposit",
  "ECOMMERCE_LAYAWAY_REQUESTED",
  "minimum opening deposit",
]) {
  requireIncludes(
    ecommerceRepository,
    expected,
    `Ecommerce order creation is missing ${expected}.`,
  );
}

for (const expected of [
  "activateEcommerceLayawayReservation",
  '"LAYAWAY_DEPOSIT"',
  '"LAYAWAY_INSTALLMENT"',
  "postLayawayAccountingInTransaction",
  "minimumDepositAmount",
]) {
  requireIncludes(
    ecommercePayments,
    expected,
    `Verified ecommerce payments are missing ${expected}.`,
  );
}

for (const expected of [
  "Offer Layaway online",
  "workspace.layawayPolicy.enabled",
  "layawayEnabled: settings.ecommerceLayawayEnabled",
]) {
  requireIncludes(staffConsole, expected, `The staff console is missing ${expected}.`);
}

for (const expected of [
  'useState<"SALES_ORDER" | "LAYAWAY">("SALES_ORDER")',
  "Deposit to pay now",
  "Pay Layaway balance",
  "layawayDepositAmount",
]) {
  requireIncludes(storefront, expected, `The public storefront is missing ${expected}.`);
}

console.log(
  "Ecommerce Layaway offer gate passed: opt-in policy, immutable terms, requested deposit, verified-payment reservation/accounting, checkout, and customer installments are wired.",
);
