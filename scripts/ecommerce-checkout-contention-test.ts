import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

type JsonRecord = Record<string, unknown>;

type HttpResult = {
  status: number;
  ok: boolean;
  durationMs: number;
  serverTiming: string | null;
  writeActive: number | null;
  writeQueued: number | null;
  payload: JsonRecord;
};

type CheckoutAttempt = HttpResult & {
  attempt: number;
  idempotencyKey: string;
  orderId: string | null;
  orderNo: string | null;
  message: string | null;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values: number[], value: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * value) - 1));
  return Number((sorted[index] ?? 0).toFixed(2));
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function redactSensitiveText(value: string) {
  return value
    .replace(/sqlserver:\/\/[^\s]+/gi, "sqlserver://[redacted]")
    .replace(/(password\s*=\s*)[^;\s]+/gi, "$1[redacted]")
    .replace(/(cookie\s*[:=]\s*)[^;\s]+/gi, "$1[redacted]");
}

function shortMessage(value: unknown) {
  return typeof value === "string" ? redactSensitiveText(value).slice(0, 500) : null;
}

function readPayloadValue(payload: JsonRecord, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function parseCookieHeader(value: string, cookieName: string) {
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    throw new Error(`${cookieName} test cookie is required and must be a single header value.`);
  }
  return trimmed.includes("=") ? trimmed : `${cookieName}=${trimmed}`;
}

function cookieValue(cookieHeader: string, cookieName: string) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  if (!match?.[1]) {
    throw new Error(`Each supplied customer cookie must contain ${cookieName}.`);
  }
  return match[1];
}

function parseCustomerCookies(value: string | undefined) {
  const entries = String(value ?? "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => parseCookieHeader(entry, "flash_erp_shop_session"));
  if (entries.length < 2) {
    throw new Error(
      "Set FLASH_ERP_ECOMMERCE_CONTENTION_CUSTOMER_COOKIES to at least two disposable customer sessions, separated by |.",
    );
  }
  return entries;
}

function isLocalHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

function isStockRejection(result: HttpResult) {
  const message = shortMessage(result.payload.message) ?? "";
  return result.status === 409 && /available|stock|fulfil/i.test(message);
}

function asNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readJson(response: Response) {
  try {
    return asRecord(await response.json());
  } catch {
    return {};
  }
}

const baseUrl = (process.env.FLASH_ERP_ECOMMERCE_CONTENTION_BASE_URL ?? "http://127.0.0.1:3100")
  .trim()
  .replace(/\/$/, "");
const storefrontStoreCode = process.env.FLASH_ERP_ECOMMERCE_CONTENTION_STORE_CODE?.trim();
const pickupStoreCode = process.env.FLASH_ERP_ECOMMERCE_CONTENTION_PICKUP_STORE_CODE?.trim();
const productId = process.env.FLASH_ERP_ECOMMERCE_CONTENTION_PRODUCT_ID?.trim();
const variantCode = process.env.FLASH_ERP_ECOMMERCE_CONTENTION_VARIANT_CODE?.trim() || null;
const sellingUnitOfMeasure = process.env.FLASH_ERP_ECOMMERCE_CONTENTION_SELLING_UOM?.trim() || null;
const maximumProbeQuantity = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_CONTENTION_MAX_PROBE, 20);
const overflowAttempts = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_CONTENTION_OVERFLOW, 2);
const requestTimeoutMs = positiveInteger(process.env.FLASH_ERP_ECOMMERCE_CONTENTION_TIMEOUT_MS, 30_000);
const runId = `ecommerce-contention-${crypto.randomUUID()}`;
const outputPath = path.resolve(
  process.env.FLASH_ERP_ECOMMERCE_CONTENTION_OUTPUT_PATH ?? "artifacts/capacity/ecommerce-contention-latest.json",
);
const safeBaseUrl = (() => {
  try {
    const target = new URL(baseUrl);
    target.username = "";
    target.password = "";
    return target.toString().replace(/\/$/, "");
  } catch {
    return "invalid-url";
  }
})();

const evidence: JsonRecord = {
  runId,
  generatedAt: new Date().toISOString(),
  baseUrl: safeBaseUrl,
  storefrontStoreCode: storefrontStoreCode ?? null,
  pickupStoreCode: pickupStoreCode ?? null,
  productId: productId ?? null,
  variantCode,
  sellingUnitOfMeasure,
  maximumProbeQuantity,
  overflowAttempts,
  phases: {},
};

let prisma: PrismaClient | null = null;
let acceptedAttempts: CheckoutAttempt[] = [];
let customerCookies: string[] = [];
let staffCookie = "";

async function requestJson(url: string, init: RequestInit): Promise<HttpResult> {
  const startedAt = performance.now();
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  return {
    status: response.status,
    ok: response.ok,
    durationMs: performance.now() - startedAt,
    serverTiming: response.headers.get("server-timing"),
    writeActive: asNumber(response.headers.get("x-flash-erp-write-active")),
    writeQueued: asNumber(response.headers.get("x-flash-erp-write-queued")),
    payload: await readJson(response),
  };
}

function quoteBody(quantity: number) {
  return {
    lines: [{
      productId,
      variantCode,
      sellingUnitOfMeasure,
      quantity,
    }],
    delivery: {
      fulfilmentMethod: "PICKUP",
      pickupStoreCode,
    },
  };
}

async function quote(quantity: number, customerCookie: string) {
  assert.ok(storefrontStoreCode, "FLASH_ERP_ECOMMERCE_CONTENTION_STORE_CODE is required.");
  const result = await requestJson(
    `${baseUrl}/api/ecommerce/${encodeURIComponent(storefrontStoreCode)}/quote`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: customerCookie,
      },
      body: JSON.stringify(quoteBody(quantity)),
    },
  );
  return result;
}

async function findMaximumWholeQuantity() {
  const firstQuote = await quote(1, customerCookies[0]);
  assert.ok(
    firstQuote.ok,
    `The one-unit preflight quote failed with HTTP ${firstQuote.status}: ${shortMessage(firstQuote.payload.message) ?? "unknown error"}`,
  );
  const quoteLine = Array.isArray(firstQuote.payload.lines) ? asRecord(firstQuote.payload.lines[0]) : {};
  const baseQuantity = Number(quoteLine.baseQuantity);
  assert.ok(Number.isFinite(baseQuantity) && baseQuantity > 0, "The preflight quote did not return a stock-reserved base quantity.");

  const upperQuote = await quote(maximumProbeQuantity, customerCookies[0]);
  if (upperQuote.ok) {
    throw new Error(
      `The fixture can quote ${maximumProbeQuantity} units. Use a dedicated low-stock test product or increase FLASH_ERP_ECOMMERCE_CONTENTION_MAX_PROBE; this run must cross its available quantity.`,
    );
  }
  if (!isStockRejection(upperQuote)) {
    throw new Error(
      `The upper-bound quote failed for an unexpected reason (HTTP ${upperQuote.status}): ${shortMessage(upperQuote.payload.message) ?? "unknown error"}`,
    );
  }

  let accepted = 1;
  let rejected = maximumProbeQuantity;
  while (rejected - accepted > 1) {
    const candidate = Math.floor((accepted + rejected) / 2);
    const candidateQuote = await quote(candidate, customerCookies[0]);
    if (candidateQuote.ok) {
      accepted = candidate;
    } else if (isStockRejection(candidateQuote)) {
      rejected = candidate;
    } else {
      throw new Error(
        `The ${candidate}-unit preflight quote failed unexpectedly (HTTP ${candidateQuote.status}): ${shortMessage(candidateQuote.payload.message) ?? "unknown error"}`,
      );
    }
  }

  evidence.phases = {
    ...asRecord(evidence.phases),
    preflight: {
      maximumAcceptedWholeQuantity: accepted,
      rejectedQuantity: rejected,
      baseQuantityPerOrder: baseQuantity,
      firstQuoteServerTiming: firstQuote.serverTiming,
    },
  };
  return { maximumAcceptedWholeQuantity: accepted, baseQuantityPerOrder: baseQuantity };
}

async function verifyCustomerSessions() {
  assert.ok(prisma, "Database client is not available.");
  const tokenHashes = customerCookies.map((cookie) =>
    crypto.createHash("sha256").update(cookieValue(cookie, "flash_erp_shop_session")).digest("hex"),
  );
  const sessions = await prisma.ecommerceCustomerSession.findMany({
    where: {
      tokenHash: { in: tokenHashes },
      revokedAt: null,
      expiresAt: { gt: new Date() },
      customerAccount: { status: "ACTIVE" },
    },
    select: { tokenHash: true, customerAccountId: true, retailOrgId: true },
  });
  assert.equal(sessions.length, tokenHashes.length, "One or more supplied customer sessions are invalid, expired, or revoked.");
  assert.equal(
    new Set(sessions.map((session) => session.customerAccountId)).size,
    sessions.length,
    "Supply sessions for distinct disposable customer accounts so the contention represents independent buyers.",
  );
  assert.equal(
    new Set(sessions.map((session) => session.retailOrgId)).size,
    1,
    "All contention customer sessions must belong to one retail organization.",
  );
  evidence.customerSessionCount = sessions.length;
}

async function placeOrder(attempt: number): Promise<CheckoutAttempt> {
  assert.ok(storefrontStoreCode, "FLASH_ERP_ECOMMERCE_CONTENTION_STORE_CODE is required.");
  const idempotencyKey = `${runId}:${attempt}`;
  const customerCookie = customerCookies[(attempt - 1) % customerCookies.length];
  const result = await requestJson(
    `${baseUrl}/api/ecommerce/${encodeURIComponent(storefrontStoreCode)}/orders`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        cookie: customerCookie,
      },
      body: JSON.stringify({
        lines: [{ productId, variantCode, sellingUnitOfMeasure, quantity: 1 }],
        delivery: {
          fulfilmentMethod: "PICKUP",
          pickupStoreCode,
          recipientName: "Ecommerce capacity test",
          phone: "+233200000000",
          saveAddress: false,
        },
        paymentMethodCode: "PAY_ON_DELIVERY",
      }),
    },
  );
  return {
    ...result,
    attempt,
    idempotencyKey,
    orderId: readPayloadValue(result.payload, "orderId"),
    orderNo: readPayloadValue(result.payload, "orderNo"),
    message: shortMessage(result.payload.message),
  };
}

async function verifyReservations(expectedAcceptedCount: number, baseQuantityPerOrder: number, keys: string[]) {
  assert.ok(prisma, "Database client is not available.");
  const orders = await prisma.ecommerceOrder.findMany({
    where: { checkoutRequestKey: { in: keys } },
    select: { id: true, orderNo: true, salesOrderId: true, status: true },
  });
  assert.equal(orders.length, expectedAcceptedCount, "The persisted order count does not match successful checkout responses.");
  assert.equal(
    new Set(orders.map((order) => order.orderNo)).size,
    orders.length,
    "Distinct buyers received duplicate ecommerce order numbers.",
  );
  assert.ok(orders.every((order) => order.status === "PLACED"), "A successful contention checkout was not left in PLACED status.");

  const reservations = await prisma.salesOrderInventoryReservation.findMany({
    where: { salesOrderId: { in: orders.map((order) => order.salesOrderId) } },
    select: { salesOrderId: true, status: true, baseQuantity: true },
  });
  const activeReservations = reservations.filter((reservation) => reservation.status === "ACTIVE");
  const activeReservationsBySalesOrderId = new Set(activeReservations.map((reservation) => reservation.salesOrderId));
  assert.equal(
    activeReservationsBySalesOrderId.size,
    orders.length,
    "Every successful checkout must hold a location-level active reservation.",
  );
  const activeReservedQuantity = activeReservations.reduce(
    (sum, reservation) => sum + Number(reservation.baseQuantity),
    0,
  );
  const expectedReservedQuantity = expectedAcceptedCount * baseQuantityPerOrder;
  assert.ok(
    Math.abs(activeReservedQuantity - expectedReservedQuantity) <= 0.001,
    `Active reservation quantity ${activeReservedQuantity} does not match expected ${expectedReservedQuantity}.`,
  );

  evidence.phases = {
    ...asRecord(evidence.phases),
    reservationVerification: {
      persistedOrderCount: orders.length,
      activeReservationCount: activeReservations.length,
      activeReservedBaseQuantity: activeReservedQuantity,
      expectedReservedBaseQuantity: expectedReservedQuantity,
    },
  };
}

async function cancelAcceptedOrders() {
  if (acceptedAttempts.length === 0) return { cancelled: 0, failures: [] as string[] };
  const cancellationResults = await Promise.all(
    acceptedAttempts.map(async (attempt) => {
      if (!attempt.orderId) return `Attempt ${attempt.attempt} did not return an order ID.`;
      try {
        const result = await requestJson(
          `${baseUrl}/api/online-store/ecommerce/orders/${encodeURIComponent(attempt.orderId)}`,
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              cookie: staffCookie,
            },
            body: JSON.stringify({
              status: "CANCELLED",
              note: `Disposable ecommerce capacity contention probe ${runId}`,
            }),
          },
        );
        return result.ok
          ? null
          : `${attempt.orderNo ?? attempt.orderId}: HTTP ${result.status} ${shortMessage(result.payload.message) ?? "unknown error"}`;
      } catch (error) {
        return `${attempt.orderNo ?? attempt.orderId}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }),
  );
  const failures = cancellationResults.filter((result): result is string => Boolean(result));

  if (failures.length === 0) {
    assert.ok(prisma, "Database client is not available.");
    const orders = await prisma.ecommerceOrder.findMany({
      where: { id: { in: acceptedAttempts.map((attempt) => attempt.orderId!).filter(Boolean) } },
      select: { salesOrderId: true, status: true },
    });
    const activeReservations = await prisma.salesOrderInventoryReservation.count({
      where: { salesOrderId: { in: orders.map((order) => order.salesOrderId) }, status: "ACTIVE" },
    });
    const releasedReservations = await prisma.salesOrderInventoryReservation.count({
      where: { salesOrderId: { in: orders.map((order) => order.salesOrderId) }, status: "RELEASED" },
    });
    if (orders.length !== acceptedAttempts.length || !orders.every((order) => order.status === "CANCELLED") || activeReservations !== 0 || releasedReservations === 0) {
      failures.push("Cancellation did not leave every test order cancelled with all reservations released.");
    }
    evidence.phases = {
      ...asRecord(evidence.phases),
      cleanup: {
        cancelledOrderCount: orders.filter((order) => order.status === "CANCELLED").length,
        activeReservationCount: activeReservations,
        releasedReservationCount: releasedReservations,
      },
    };
  }

  return { cancelled: acceptedAttempts.length - failures.length, failures };
}

async function main() {
  if (process.env.FLASH_ERP_ECOMMERCE_CONTENTION_RUN !== "1") {
    throw new Error("Set FLASH_ERP_ECOMMERCE_CONTENTION_RUN=1 to run this disposable-data checkout test.");
  }
  if (!storefrontStoreCode || !pickupStoreCode || !productId) {
    throw new Error(
      "FLASH_ERP_ECOMMERCE_CONTENTION_STORE_CODE, FLASH_ERP_ECOMMERCE_CONTENTION_PICKUP_STORE_CODE, and FLASH_ERP_ECOMMERCE_CONTENTION_PRODUCT_ID are required.",
    );
  }
  if (maximumProbeQuantity < 2) {
    throw new Error("FLASH_ERP_ECOMMERCE_CONTENTION_MAX_PROBE must be at least 2.");
  }
  const target = new URL(baseUrl);
  if (!isLocalHost(target.hostname) && process.env.FLASH_ERP_ECOMMERCE_CONTENTION_ALLOW_REMOTE !== "1") {
    throw new Error("Remote targets require FLASH_ERP_ECOMMERCE_CONTENTION_ALLOW_REMOTE=1 and must be disposable test environments.");
  }
  customerCookies = parseCustomerCookies(process.env.FLASH_ERP_ECOMMERCE_CONTENTION_CUSTOMER_COOKIES);
  staffCookie = parseCookieHeader(
    process.env.FLASH_ERP_ECOMMERCE_CONTENTION_STAFF_COOKIE ?? "",
    "flash_rms_session",
  );
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to verify reservations and cleanup after contention.");
  }
  const datasourceUrl = process.env.DATABASE_URL;
  prisma = new PrismaClient({ adapter: new PrismaMssql(datasourceUrl) });

  await verifyCustomerSessions();
  const preflight = await findMaximumWholeQuantity();
  const attemptCount = preflight.maximumAcceptedWholeQuantity + overflowAttempts;
  const attempts = await Promise.all(Array.from({ length: attemptCount }, (_, index) => placeOrder(index + 1)));
  acceptedAttempts = attempts.filter((attempt) => attempt.ok);
  const rejectedAttempts = attempts.filter((attempt) => !attempt.ok);
  const unexpectedRejections = rejectedAttempts.filter((attempt) => !isStockRejection(attempt));
  const durations = attempts.map((attempt) => attempt.durationMs);
  const acceptedWriteActive = attempts.map((attempt) => attempt.writeActive ?? 0);
  const acceptedWriteQueued = attempts.map((attempt) => attempt.writeQueued ?? 0);

  evidence.phases = {
    ...asRecord(evidence.phases),
    checkoutContention: {
      attempts: attemptCount,
      accepted: acceptedAttempts.length,
      rejected: rejectedAttempts.length,
      expectedAccepted: preflight.maximumAcceptedWholeQuantity,
      expectedRejectedAtLeast: overflowAttempts,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      maxMs: Number(Math.max(...durations).toFixed(2)),
      maxObservedWriteActive: Math.max(...acceptedWriteActive),
      maxObservedWriteQueued: Math.max(...acceptedWriteQueued),
      serverTiming: attempts.map((attempt) => attempt.serverTiming).filter(Boolean),
      statuses: attempts.reduce<Record<string, number>>((summary, attempt) => {
        summary[String(attempt.status)] = (summary[String(attempt.status)] ?? 0) + 1;
        return summary;
      }, {}),
      rejectionMessages: rejectedAttempts.map((attempt) => attempt.message).filter(Boolean),
    },
  };

  assert.equal(
    acceptedAttempts.length,
    preflight.maximumAcceptedWholeQuantity,
    `Accepted ${acceptedAttempts.length} orders for ${preflight.maximumAcceptedWholeQuantity} sellable units.`,
  );
  assert.ok(
    rejectedAttempts.length >= overflowAttempts,
    "The deliberate over-demand did not produce the expected stock rejections.",
  );
  assert.equal(
    unexpectedRejections.length,
    0,
    `Unexpected checkout rejection: ${unexpectedRejections[0]?.message ?? "unknown error"}`,
  );
  assert.ok(
    acceptedAttempts.every((attempt) => attempt.status === 201 && attempt.orderId && attempt.orderNo),
    "Every accepted contention checkout must return a newly created order ID and order number.",
  );

  await verifyReservations(
    acceptedAttempts.length,
    preflight.baseQuantityPerOrder,
    attempts.map((attempt) => attempt.idempotencyKey),
  );
  const exhaustedQuote = await quote(1, customerCookies[0]);
  assert.ok(
    isStockRejection(exhaustedQuote),
    "A further unit was still quotable after every sellable unit had been reserved.",
  );
  evidence.phases = {
    ...asRecord(evidence.phases),
    exhaustedQuote: { status: exhaustedQuote.status, message: shortMessage(exhaustedQuote.payload.message) },
  };
}

async function run() {
  let runError: unknown = null;
  let cleanupFailures: string[] = [];
  try {
    await main();
  } catch (error) {
    runError = error;
  } finally {
    try {
      const cleanup = await cancelAcceptedOrders();
      cleanupFailures = cleanup.failures;
      if (cleanupFailures.length === 0 && acceptedAttempts.length > 0 && customerCookies.length > 0) {
        const preflight = asRecord(asRecord(evidence.phases).preflight);
        const restoredQuantity = Number(preflight.maximumAcceptedWholeQuantity);
        if (Number.isFinite(restoredQuantity) && restoredQuantity > 0) {
          const restoredQuote = await quote(restoredQuantity, customerCookies[0]);
          const overRestoredQuote = await quote(restoredQuantity + 1, customerCookies[0]);
          if (!restoredQuote.ok || !isStockRejection(overRestoredQuote)) {
            cleanupFailures.push("Post-cancellation availability did not return to its preflight boundary.");
          }
          evidence.phases = {
            ...asRecord(evidence.phases),
            restoredAvailability: {
              restoredQuantityStatus: restoredQuote.status,
              overflowQuantityStatus: overRestoredQuote.status,
            },
          };
        }
      }
    } catch (error) {
      cleanupFailures.push(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    }
    evidence.completedAt = new Date().toISOString();
    evidence.result = runError || cleanupFailures.length > 0 ? "failed" : "passed";
    evidence.error = runError instanceof Error
      ? redactSensitiveText(runError.message)
      : runError
        ? redactSensitiveText(String(runError))
        : null;
    evidence.cleanupFailures = cleanupFailures;
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await prisma?.$disconnect();
  }

  if (runError) throw runError;
  if (cleanupFailures.length > 0) {
    throw new Error(`Checkout contention cleanup failed: ${cleanupFailures.join(" | ")}`);
  }
  process.stdout.write(`Ecommerce checkout contention passed. Evidence written to ${outputPath}\n`);
}

void run().catch((error) => {
  console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
