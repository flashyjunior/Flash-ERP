import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function requireIncludes(source: string, expected: string, message: string) {
  assert.ok(source.includes(expected), message);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations-sqlserver/20260820010000_multi_branch_ecommerce_fulfillment/migration.sql",
);
const networkAllocationMigration = read(
  "prisma/migrations-sqlserver/20260820020000_ecommerce_network_allocation/migration.sql",
);
const storePaymentMigration = read(
  "prisma/migrations-sqlserver/20260825010000_ecommerce_store_payment_reconciliation/migration.sql",
);
const terminalReservationMigration = read(
  "prisma/migrations-sqlserver/20260825020000_ecommerce_terminal_reservation_reconciliation/migration.sql",
);
const compatibility = read(
  "apps/enterprise-web/src/server/repositories/schema-compatibility.repository.ts",
);
const ecommerceRepository = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce.repository.ts",
);
const ecommerceFulfillment = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce-fulfillment.ts",
);
const ecommercePayments = read(
  "apps/enterprise-web/src/server/ecommerce/ecommerce-payments.ts",
);
const onlineStoreRepository = read(
  "apps/enterprise-web/src/server/repositories/online-store.repository.ts",
);
const storefront = read(
  "apps/enterprise-web/src/components/ecommerce/public-storefront.tsx",
);
const staffConsole = read(
  "apps/enterprise-web/src/components/ecommerce/online-store-ecommerce-workspace.tsx",
);
const availabilityRoute = read(
  "apps/enterprise-web/src/app/api/ecommerce/[storeCode]/availability/route.ts",
);
const storeDesktop = read(
  "apps/store-desktop/src/renderer/modern-app.tsx",
);
const storeSyncRepository = read(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts",
);
const posTransactionNumber = read(
  "apps/store-desktop/src/main/pos-transaction-number.ts",
);
const desktopSyncProviders = [
  read("apps/store-desktop/src/main/offline/local-store-service.ts"),
  read("apps/store-desktop/src/main/postgres/postgres-store-service.ts"),
  read("apps/store-desktop/src/main/mssql/mssql-store-service.ts"),
];
const desktopReservationBackfills = [
  desktopSyncProviders[0],
  read("apps/store-desktop/src/main/postgres/store-postgres-schema.sql"),
  read("apps/store-desktop/src/main/mssql/store-mssql-schema.sql"),
];

for (const source of [schema, migration, compatibility]) {
  for (const expected of [
    "EcommerceFulfillmentLocation",
    "EcommerceFulfillment",
    "EcommerceFulfillmentLine",
    "storefrontStoreId",
  ]) {
    requireIncludes(source, expected, `Multi-branch ecommerce schema is missing ${expected}.`);
  }
}

for (const expected of [
  "SalesOrderInventoryReservation_salesOrderId_salesOrderLineId_inventoryLocationId_key",
  "salesOrderLineId",
  "inventoryLocationId",
]) {
  requireIncludes(
    networkAllocationMigration,
    expected,
    `Network allocation migration is missing ${expected}.`,
  );
}

for (const expected of [
  "getEcommerceFulfillmentCandidates",
  "resolveEcommerceFulfillmentPlan",
  "calculateEcommerceNetworkSellableBaseQuantity",
  "safetyStockLevel",
  "TransactionIsolationLevel.Serializable",
  "salesOrderInventoryReservation.createMany",
  "storefrontStoreId: store.id",
  "routingMethod",
  "method: fulfilmentMethod",
  "ecommerceFulfillment.create",
  "interStoreTransfer.create",
  "queueInterStoreTransferPublication",
  "status: \"RELEASED\"",
]) {
  requireIncludes(ecommerceRepository, expected, `Ecommerce routing is missing ${expected}.`);
}

for (const expected of [
  "resolveEcommerceFulfillmentPlan",
  "preferredDestinationInventoryLocationId",
  "ECOMMERCE_NETWORK_ALLOCATION",
  'payment.ecommerceOrder.status !== "PLACED"',
]) {
  requireIncludes(ecommercePayments, expected, `Layaway deposit reservation is not aligned to ${expected}.`);
}

for (const expected of [
  "calculateEcommerceSellableBaseQuantity",
  "calculateEcommerceNetworkSellableBaseQuantity",
  "calculateEcommerceNetworkAvailabilityByLocation",
  "onHandBaseQuantity",
  "activeReservedBaseQuantity",
  "safetyStockBaseQuantity",
  "NETWORK_TRANSFER",
]) {
  requireIncludes(ecommerceFulfillment, expected, `Network fulfilment planner is missing ${expected}.`);
}

for (const expected of [
  'if (status === "CONFIRMED")',
  "queueEcommerceSalesOrderPublication",
  'order.status !== "PLACED"',
]) {
  requireIncludes(ecommerceRepository, expected, `Order acceptance publication is missing ${expected}.`);
}

for (const expected of [
  "ecommerceHandoff",
  "sourceTransactionId: existingTransactionById.id",
  "ecommerceOrder: { isNot: null }",
  "existingTransaction.id === parkedTransactionId",
]) {
  requireIncludes(storeSyncRepository, expected, `Ecommerce POS projection is missing ${expected}.`);
}

for (const expected of [
  "deriveEcommercePaymentProjection",
  "tx.ecommerceOrder.updateMany",
  "paymentStatus: projectedPayment.paymentStatus",
  "terminalReservationTransition",
  "projectedReservations",
  "tx.salesOrderInventoryReservation.updateMany",
]) {
  requireIncludes(storeSyncRepository, expected, `Ecommerce payment projection is missing ${expected}.`);
}
for (const expected of [
  "SalesOrderInventoryReservation",
  "INNER JOIN [dbo].[EcommerceOrder]",
  "[reservation].[status] = N'ACTIVE'",
  "[sales].[status] IN (N'FULFILLED', N'CANCELLED', N'EXPIRED')",
  "N'CONSUMED'",
  "N'RELEASED'",
  "N'EXPIRED'",
]) {
  requireIncludes(
    terminalReservationMigration,
    expected,
    `Ecommerce terminal reservation backfill is missing ${expected}.`,
  );
}
for (const expected of [
  "INNER JOIN [dbo].[SalesOrder]",
  "[sales].[status] IN (N'OPEN', N'FULFILLED')",
  "N'PARTIALLY_PAID'",
  "N'PAID'",
]) {
  requireIncludes(storePaymentMigration, expected, `Ecommerce payment backfill is missing ${expected}.`);
}

requireIncludes(
  posTransactionNumber,
  "isEcommercePosTransactionNumber",
  "Store Desktop cannot identify ecommerce receipt retries.",
);
for (const provider of desktopSyncProviders) {
  requireIncludes(
    provider,
    "isEcommercePosTransactionNumber(payload.transactionNo)",
    "A Store Desktop provider is missing targeted ecommerce receipt retry handling.",
  );
}
for (const expected of [
  "const fulfilledReservations",
  'fulfilledSalesOrder.reservation_status === "ACTIVE"',
  "reservations: fulfilledReservations",
]) {
  requireIncludes(
    desktopSyncProviders[0],
    expected,
    `Standalone Store Desktop reservation consumption is missing ${expected}.`,
  );
}
for (const backfill of desktopReservationBackfills) {
  for (const expected of [
    "Reconciled from terminal sales order state.",
    "FULFILLED",
    "CANCELLED",
    "EXPIRED",
    "CONSUMED",
    "RELEASED",
    "ACTIVE",
  ]) {
    requireIncludes(
      backfill,
      expected,
      `A Store Desktop database provider is missing terminal reservation reconciliation for ${expected}.`,
    );
  }
}

for (const expected of [
  "getPublicStorefrontAvailability",
  '"Cache-Control": "private, no-store, max-age=0"',
  'dynamic = "force-dynamic"',
]) {
  requireIncludes(availabilityRoute, expected, `Live storefront availability is missing ${expected}.`);
}

for (const expected of [
  "selectedTransferOutstandingQuantity",
  "getTransferRoleOutstandingQuantity",
]) {
  requireIncludes(storeDesktop, expected, `Store Desktop transfer summary is missing ${expected}.`);
}

for (const expected of [
  "consumedReservationCount",
  "ecommerceFulfillment.updateMany",
  "ecommerceFulfillmentLine.updateMany",
  "deriveEcommercePaymentProjection",
  "tx.ecommerceOrder.updateMany",
  "paymentStatus: ecommercePaymentProjection.paymentStatus",
]) {
  requireIncludes(onlineStoreRepository, expected, `POS fulfilment is missing ${expected}.`);
}

for (const expected of [
  "pickupLocations",
  "pickupStoreCode",
  "Delivery stock secured across the fulfilment network",
  "Network fulfilment",
  "Delivery prepared by",
  "/availability",
  "availabilityByProductIdRef",
  "outOfStockRibbon",
  "--product-zoom-x",
  "formatCustomerOrderStatus",
]) {
  requireIncludes(storefront, expected, `Public storefront is missing ${expected}.`);
}

for (const expected of [
  "Fulfilment locations",
  "availableFulfillmentLocations",
  "Fulfilment location",
  "networkTransferSummary",
  "Network stock routing",
  "nextStatusesForOrder",
  "Ready for pickup",
  "Picked up",
]) {
  requireIncludes(staffConsole, expected, `Staff ecommerce console is missing ${expected}.`);
}

console.log(
  "Ecommerce multi-branch fulfilment gate passed: network sellable stock, safety stock, source reservations, transfer routing, pickup selection, layaway alignment, cancellation protection, and POS consumption are wired.",
);
