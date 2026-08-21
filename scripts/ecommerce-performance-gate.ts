import assert from "node:assert/strict";

import {
  attachEcommerceServerTiming,
  ecommerceServerTiming,
  getEcommercePerformanceSnapshot,
  measureEcommerceOperation,
} from "../apps/enterprise-web/src/server/ecommerce/ecommerce-performance";
import { buildEcommerceOperationalHealth } from "../apps/enterprise-web/src/server/ecommerce/ecommerce-operational-health";

async function main() {
  const scope = "ECOM-PERFORMANCE-GATE";

  const successful = await measureEcommerceOperation("CATALOG", scope, async () => "catalogue");
  assert.equal(successful.value, "catalogue");
  assert.ok(successful.durationMs >= 0);

  await assert.rejects(
    () => measureEcommerceOperation("QUOTE", scope, async () => {
      throw new Error("Expected quote failure");
    }),
    /Expected quote failure/,
  );

  const snapshot = getEcommercePerformanceSnapshot(scope);
  assert.equal(snapshot.operations.CATALOG.requests, 1);
  assert.equal(snapshot.operations.CATALOG.completed, 1);
  assert.equal(snapshot.operations.CATALOG.failed, 0);
  assert.equal(snapshot.operations.QUOTE.requests, 1);
  assert.equal(snapshot.operations.QUOTE.completed, 0);
  assert.equal(snapshot.operations.QUOTE.failed, 1);
  assert.equal(snapshot.status, "degraded");
  assert.match(ecommerceServerTiming("PRODUCT_DETAIL", 12.345), /^ecommerce-product-detail;dur=12\.35$/);
  const timedResponse = attachEcommerceServerTiming(new Response(), "CATALOG", performance.now());
  assert.match(timedResponse.headers.get("Server-Timing") ?? "", /^ecommerce-catalog;dur=/);

  const operationalHealth = buildEcommerceOperationalHealth({
    checkedAt: new Date("2026-08-21T00:00:00.000Z"),
    thresholds: {
      staleReservationHours: 24,
      paymentFailureWindowHours: 24,
      blockedTransferHours: 12,
      queueAgeHours: 12,
    },
    scan: {
      limit: 500,
      scannedActiveReservations: 2,
      activeReservationCount: 2,
      activeOrderCount: 2,
    },
    staleReservations: {
      count: 1,
      oldestAt: new Date("2026-08-19T00:00:00.000Z"),
      detail: "SO-1001 has held an active reservation.",
    },
    failedPayments: { count: 0, oldestAt: null, detail: "" },
    blockedTransfers: { count: 0, oldestAt: null, detail: "" },
    agedFulfilments: { count: 0, oldestAt: null, detail: "" },
    reservedStockShortfalls: {
      count: 1,
      oldestAt: null,
      detail: "P-100 at MAIN: 4 reserved, 2 on hand.",
    },
    unresolvedReservedStock: { count: 0, oldestAt: null, detail: "" },
  });
  assert.equal(operationalHealth.status, "critical");
  assert.deepEqual(
    operationalHealth.incidents.map((incident) => incident.key),
    ["STALE_RESERVATIONS", "RESERVED_STOCK_SHORTFALL"],
  );

  console.log("Ecommerce performance gate passed: customer operations retain bounded latency and failure metrics.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
