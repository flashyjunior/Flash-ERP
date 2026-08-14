import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { LocalStoreService } from "../apps/store-desktop/src/main/offline/local-store-service";

const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "flash-erp-layaway-lifecycle-"),
);
const databasePath = path.join(temporaryDirectory, "store.db");
const serviceOptions = {
  databasePath,
  deploymentMode: "STANDALONE" as const,
  nodeCode: "layaway-lifecycle-gate-node",
  terminalCode: "LAYAWAY-LIFECYCLE-01",
};
const loginId = "layaway.lifecycle.admin";
const password = "LayawayLifecycleAdmin123!";
let service: LocalStoreService | null = new LocalStoreService(
  temporaryDirectory,
  serviceOptions,
);

function dbOf(currentService: LocalStoreService) {
  return (currentService as unknown as { db: DatabaseSync }).db;
}

function addLayawayBasket(currentService: LocalStoreService, quantity: number) {
  currentService.addItemToBasket({
    lookupValue: "LAYAWAY-GATE-PHONE",
    quantity,
    lineIntent: "SALE",
    deferInventoryValidationForSalesOrder: true,
  });
  currentService.attachCustomerToActiveBasket({
    customerId: "standalone-customer-layaway-gate-customer",
  });
}

function latestOpenLayaway(db: DatabaseSync) {
  const row = db
    .prepare(
      `SELECT id, order_no, source_transaction_id, total_amount, deposit_amount,
              paid_amount, balance_amount, minimum_deposit_amount,
              reservation_status, layaway_policy_snapshot_json, record_version
       FROM sales_order
       WHERE order_type = 'LAYAWAY' AND status = 'OPEN'
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get() as
    | {
        id: string;
        order_no: string;
        source_transaction_id: string;
        total_amount: number;
        deposit_amount: number;
        paid_amount: number;
        balance_amount: number;
        minimum_deposit_amount: number;
        reservation_status: string;
        layaway_policy_snapshot_json: string;
        record_version: number;
      }
    | undefined;

  assert.ok(row, "Expected an open layaway.");
  return row;
}

try {
  service.bootstrapStandaloneAdmin({
    loginId,
    displayName: "Layaway Lifecycle Admin",
    password,
  });
  service.signInOperator({ loginId, password });
  service.saveStandaloneSettings({
    layawaySettings: {
      enabled: true,
      reserveStockOnDeposit: true,
      minimumDepositPercent: 20,
      requireFullPaymentBeforeFulfilment: true,
      refundPaymentsOnCancellation: true,
      cancellationFeeType: "PERCENTAGE",
      cancellationFeeValue: 10,
    },
  });
  service.saveStandaloneLocation({
    locationCode: "SHOP-FLOOR",
    locationName: "Shop Floor",
    locationType: "STORE",
    useForSalesDefault: true,
    useForSalesOrderDefault: true,
    useForReceivingDefault: true,
  });
  service.saveStandaloneProduct({
    productCode: "LAYAWAY-GATE-PHONE",
    productName: "Layaway Gate Phone",
    unitOfMeasure: "EA",
    unitPrice: 100,
    quantityOnHand: 10,
    trackInventory: true,
  });
  service.saveStandaloneCustomer({
    customerNo: "LAYAWAY-GATE-CUSTOMER",
    fullName: "Layaway Gate Customer",
  });
  service.openShift({ cashierCode: loginId, openingFloatAmount: 0 });
  (
    service as unknown as { isStandaloneDeployment: () => boolean }
  ).isStandaloneDeployment = () => false;

  addLayawayBasket(service, 4);
  service.createSalesOrderFromActiveBasket({
    orderType: "LAYAWAY",
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 80,
        reference: "LAYAWAY-OPENING",
      },
    ],
    layawayExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });

  let db = dbOf(service);
  const fulfilmentOrder = latestOpenLayaway(db);
  assert.equal(fulfilmentOrder.total_amount, 400);
  assert.equal(fulfilmentOrder.deposit_amount, 80);
  assert.equal(fulfilmentOrder.paid_amount, 80);
  assert.equal(fulfilmentOrder.balance_amount, 320);
  assert.equal(fulfilmentOrder.minimum_deposit_amount, 80);
  assert.equal(fulfilmentOrder.reservation_status, "ACTIVE");
  const policySnapshot = JSON.parse(
    fulfilmentOrder.layaway_policy_snapshot_json,
  ) as { capturedAt: string };
  assert.deepEqual(policySnapshot, {
    enabled: true,
    reserveStockOnDeposit: true,
    minimumDepositPercent: 20,
    requireFullPaymentBeforeFulfilment: true,
    refundPaymentsOnCancellation: true,
    cancellationFeeType: "PERCENTAGE",
    cancellationFeeValue: 10,
    capturedAt: policySnapshot.capturedAt,
  });

  const activeReservation = db
    .prepare(
      `SELECT base_quantity, status
       FROM sales_order_inventory_reservation
       WHERE sales_order_id = ?`,
    )
    .get(fulfilmentOrder.id) as { base_quantity: number; status: string };
  assert.equal(activeReservation.base_quantity, 4);
  assert.equal(activeReservation.status, "ACTIVE");
  const openingStock = db
    .prepare(
      `SELECT quantity_on_hand
       FROM inventory_location_balance
       WHERE product_code = 'LAYAWAY-GATE-PHONE' AND location_code = 'SHOP-FLOOR'`,
    )
    .get() as { quantity_on_hand: number };
  assert.equal(openingStock.quantity_on_hand, 10);

  service.addItemToBasket({
    lookupValue: "LAYAWAY-GATE-PHONE",
    quantity: 7,
    lineIntent: "SALE",
  });
  assert.throws(
    () =>
      service?.checkoutActiveBasket({
        payments: [
          {
            method: "CASH",
            tenderMethodCode: null,
            tenderMethodName: null,
            amount: 700,
            reference: "LAYAWAY-OVERSELL-PROBE",
          },
        ],
      }),
    /only 6\.000 unit\(s\) are available at the sales location/i,
  );
  const oversellLine = service.getSyncSnapshot().activeBasket?.lines[0];
  assert.ok(oversellLine, "Expected the oversell probe line to remain editable.");
  service.removeBasketLine(oversellLine.lineId);
  service.discardActiveBasket();

  service.receiveLayawayPayment({
    orderId: fulfilmentOrder.id,
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 120,
        reference: "LAYAWAY-INSTALLMENT-1",
      },
    ],
  });
  let paymentState = db
    .prepare(
      "SELECT paid_amount, balance_amount, record_version FROM sales_order WHERE id = ?",
    )
    .get(fulfilmentOrder.id) as {
    paid_amount: number;
    balance_amount: number;
    record_version: number;
  };
  assert.equal(paymentState.paid_amount, 200);
  assert.equal(paymentState.balance_amount, 200);
  assert.equal(paymentState.record_version, 2);

  service.resumeSalesOrder(fulfilmentOrder.id);
  assert.throws(
    () => service?.checkoutActiveBasket({ payments: [] }),
    /paid in full/i,
  );
  service.discardActiveBasket();

  service.receiveLayawayPayment({
    orderId: fulfilmentOrder.id,
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 200,
        reference: "LAYAWAY-INSTALLMENT-2",
      },
    ],
  });
  service.resumeSalesOrder(fulfilmentOrder.id);
  service.checkoutActiveBasket({ payments: [] });

  const fulfilledState = db
    .prepare(
      `SELECT status, paid_amount, balance_amount, reservation_status,
              fulfilled_transaction_id, record_version
       FROM sales_order
       WHERE id = ?`,
    )
    .get(fulfilmentOrder.id) as {
    status: string;
    paid_amount: number;
    balance_amount: number;
    reservation_status: string;
    fulfilled_transaction_id: string;
    record_version: number;
  };
  assert.equal(fulfilledState.status, "FULFILLED");
  assert.equal(fulfilledState.paid_amount, 400);
  assert.equal(fulfilledState.balance_amount, 0);
  assert.equal(fulfilledState.reservation_status, "CONSUMED");
  assert.equal(fulfilledState.record_version, 4);
  assert.ok(fulfilledState.fulfilled_transaction_id);
  const fulfilledReservation = db
    .prepare(
      "SELECT status, released_at FROM sales_order_inventory_reservation WHERE sales_order_id = ?",
    )
    .get(fulfilmentOrder.id) as { status: string; released_at: string | null };
  assert.equal(fulfilledReservation.status, "CONSUMED");
  assert.ok(fulfilledReservation.released_at);
  const fulfilledStock = db
    .prepare(
      `SELECT quantity_on_hand
       FROM inventory_location_balance
       WHERE product_code = 'LAYAWAY-GATE-PHONE' AND location_code = 'SHOP-FLOOR'`,
    )
    .get() as { quantity_on_hand: number };
  assert.equal(fulfilledStock.quantity_on_hand, 6);
  const fulfilmentPayments = db
    .prepare(
      `SELECT payment_purpose, amount
       FROM pos_payment
       WHERE pos_transaction_id = ?
       ORDER BY received_at, id`,
    )
    .all(fulfilmentOrder.source_transaction_id) as Array<{
    payment_purpose: string;
    amount: number;
  }>;
  assert.deepEqual(
    fulfilmentPayments.map((payment) => payment.payment_purpose),
    ["LAYAWAY_DEPOSIT", "LAYAWAY_INSTALLMENT", "LAYAWAY_INSTALLMENT"],
  );
  assert.equal(
    fulfilmentPayments.reduce((sum, payment) => sum + payment.amount, 0),
    400,
  );
  const fulfilmentEvents = db
    .prepare(
      `SELECT event_type, record_version, payload_json
       FROM sync_outbox
       WHERE aggregate_type = 'salesOrder' AND aggregate_id = ?
       ORDER BY record_version`,
    )
    .all(fulfilmentOrder.id) as Array<{
    event_type: string;
    record_version: number;
    payload_json: string;
  }>;
  assert.deepEqual(
    fulfilmentEvents.map((event) => [event.event_type, event.record_version]),
    [
      ["sales-order.recorded", 1],
      ["sales-order.payment-received", 2],
      ["sales-order.payment-received", 3],
      ["sales-order.fulfilled", 4],
    ],
  );
  const fulfilmentPayload = JSON.parse(
    fulfilmentEvents.at(-1)?.payload_json ?? "{}",
  ) as {
    status?: string;
    paidAmount?: number;
    reservationStatus?: string;
    reservations?: Array<{ status: string }>;
  };
  assert.equal(fulfilmentPayload.status, "FULFILLED");
  assert.equal(fulfilmentPayload.paidAmount, 400);
  assert.equal(fulfilmentPayload.reservationStatus, "CONSUMED");
  assert.deepEqual(
    fulfilmentPayload.reservations?.map((reservation) => reservation.status),
    ["CONSUMED"],
  );

  addLayawayBasket(service, 2);
  service.createSalesOrderFromActiveBasket({
    orderType: "LAYAWAY",
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 40,
        reference: "LAYAWAY-CANCEL-DEPOSIT",
      },
    ],
  });
  const cancellableOrder = latestOpenLayaway(db);
  service.cancelSalesOrder({
    orderId: cancellableOrder.id,
    refundPayments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 36,
        reference: "LAYAWAY-CANCEL-REFUND",
      },
    ],
    note: "Lifecycle cancellation acceptance",
  });
  const cancelledState = db
    .prepare(
      `SELECT status, reservation_status, cancellation_fee_amount, refunded_amount,
              paid_amount, record_version
       FROM sales_order
       WHERE id = ?`,
    )
    .get(cancellableOrder.id) as {
    status: string;
    reservation_status: string;
    cancellation_fee_amount: number;
    refunded_amount: number;
    paid_amount: number;
    record_version: number;
  };
  assert.equal(cancelledState.status, "CANCELLED");
  assert.equal(cancelledState.reservation_status, "RELEASED");
  assert.equal(cancelledState.cancellation_fee_amount, 4);
  assert.equal(cancelledState.refunded_amount, 36);
  assert.equal(cancelledState.paid_amount, 40);
  assert.equal(cancelledState.record_version, 2);
  const cancelledPaymentTotal = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS amount FROM pos_payment WHERE pos_transaction_id = ?",
    )
    .get(cancellableOrder.source_transaction_id) as { amount: number };
  assert.equal(cancelledPaymentTotal.amount, 4);
  assert.deepEqual(
    (
      db
        .prepare(
          `SELECT event_type, record_version
           FROM sync_outbox
           WHERE aggregate_type = 'salesOrder' AND aggregate_id = ?
           ORDER BY record_version`,
        )
        .all(cancellableOrder.id) as Array<{
        event_type: string;
        record_version: number;
      }>
    ).map((event) => [event.event_type, event.record_version]),
    [
      ["sales-order.recorded", 1],
      ["sales-order.cancelled", 2],
    ],
  );

  addLayawayBasket(service, 1);
  service.createSalesOrderFromActiveBasket({
    orderType: "LAYAWAY",
    payments: [
      {
        method: "CASH",
        tenderMethodCode: null,
        tenderMethodName: null,
        amount: 20,
        reference: "LAYAWAY-EXPIRY-DEPOSIT",
      },
    ],
    layawayExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const expiringOrder = latestOpenLayaway(db);
  db.prepare(
    "UPDATE sales_order SET layaway_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
  ).run(expiringOrder.id);
  service.expireLayaway({
    orderId: expiringOrder.id,
    reason: "Lifecycle expiry acceptance",
  });
  const expiredState = db
    .prepare(
      `SELECT status, reservation_status, expired_at, record_version
       FROM sales_order
       WHERE id = ?`,
    )
    .get(expiringOrder.id) as {
    status: string;
    reservation_status: string;
    expired_at: string | null;
    record_version: number;
  };
  assert.equal(expiredState.status, "EXPIRED");
  assert.equal(expiredState.reservation_status, "EXPIRED");
  assert.ok(expiredState.expired_at);
  assert.equal(expiredState.record_version, 2);
  assert.deepEqual(
    (
      db
        .prepare(
          `SELECT event_type, record_version
           FROM sync_outbox
           WHERE aggregate_type = 'salesOrder' AND aggregate_id = ?
           ORDER BY record_version`,
        )
        .all(expiringOrder.id) as Array<{
        event_type: string;
        record_version: number;
      }>
    ).map((event) => [event.event_type, event.record_version]),
    [
      ["sales-order.recorded", 1],
      ["sales-order.expired", 2],
    ],
  );

  service.close();
  service = null;
  const reopenedService = new LocalStoreService(
    temporaryDirectory,
    serviceOptions,
  );
  service = reopenedService;
  reopenedService.signInOperator({ loginId, password });
  db = dbOf(reopenedService);
  assert.equal(
    (
      db
        .prepare("SELECT status FROM sales_order WHERE id = ?")
        .get(fulfilmentOrder.id) as { status: string }
    ).status,
    "FULFILLED",
  );
  assert.equal(
    (
      db
        .prepare("SELECT status FROM sales_order WHERE id = ?")
        .get(cancellableOrder.id) as { status: string }
    ).status,
    "CANCELLED",
  );
  assert.equal(
    (
      db
        .prepare("SELECT status FROM sales_order WHERE id = ?")
        .get(expiringOrder.id) as { status: string }
    ).status,
    "EXPIRED",
  );
} finally {
  service?.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  "Layaway lifecycle gate passed: immutable policy, base-stock reservation, installment, fulfilment, cancellation/refund, expiry, and restart persistence agree.",
);
