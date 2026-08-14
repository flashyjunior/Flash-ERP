import crypto from "node:crypto";
import path from "node:path";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

if (!process.env.DATABASE_URL) dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const datasourceUrl = process.env.DATABASE_URL;
if (!datasourceUrl) throw new Error("DATABASE_URL is required for the idempotency concurrency test.");

const prisma = new PrismaClient({ adapter: new PrismaMssql(datasourceUrl) });
const baseUrl = (process.env.FLASH_ERP_CAPACITY_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const configuredRequestCount = Number.parseInt(
  process.env.FLASH_ERP_IDEMPOTENCY_REQUESTS ?? "20",
  10
);
const requestCount = Number.isFinite(configuredRequestCount) && configuredRequestCount > 1
  ? configuredRequestCount
  : 20;
const suffix = crypto.randomUUID();
const customerNo = `CAP-IDEM-${suffix}`;
const checkoutKey = `capacity-checkout:${suffix}`;
const token = crypto.randomBytes(48).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
let customerId: string | null = null;
let accountId: string | null = null;

async function cleanup() {
  const orders = await prisma.ecommerceOrder.findMany({
    where: { checkoutRequestKey: checkoutKey },
    select: { id: true, salesOrderId: true, salesOrder: { select: { sourceTransactionId: true } } }
  });
  for (const order of orders) {
    await prisma.ecommerceOrderStatusEvent.deleteMany({ where: { ecommerceOrderId: order.id } });
    await prisma.ecommerceRefundRequest.deleteMany({ where: { ecommerceOrderId: order.id } });
    await prisma.ecommercePayment.deleteMany({ where: { ecommerceOrderId: order.id } });
    await prisma.ecommerceOrder.delete({ where: { id: order.id } });
    await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: order.salesOrderId } });
    await prisma.salesOrder.delete({ where: { id: order.salesOrderId } });
    if (order.salesOrder.sourceTransactionId) {
      await prisma.posTransactionLine.deleteMany({
        where: { posTransactionId: order.salesOrder.sourceTransactionId }
      });
      await prisma.posTransaction.delete({ where: { id: order.salesOrder.sourceTransactionId } });
    }
  }
  if (accountId) {
    await prisma.ecommerceCustomerSession.deleteMany({ where: { customerAccountId: accountId } });
    await prisma.ecommerceCustomerIdentity.deleteMany({ where: { customerAccountId: accountId } });
    await prisma.ecommerceCustomerAddress.deleteMany({ where: { customerAccountId: accountId } });
    await prisma.ecommerceCustomerAccount.deleteMany({ where: { id: accountId } });
  }
  if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
  await prisma.securityLog.deleteMany({
    where: { category: "ECOMMERCE", action: "ECOMMERCE_ORDER_PLACED", actorLabel: customerNo }
  });
}

async function main() {
  const store = await prisma.store.findFirst({
    where: {
      ecommerceEnabled: true,
      ecommercePayOnDeliveryEnabled: true,
      salesEnabled: true,
      status: "ACTIVE"
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, retailOrgId: true }
  });
  if (!store) throw new Error("No active pay-on-delivery ecommerce store is available for the test.");

  const pricedProduct = await prisma.storeProductPrice.findFirst({
    where: {
      storeId: store.id,
      status: "ACTIVE",
      unitPrice: { gt: 0 },
      product: { ecommercePublished: true, status: "ACTIVE", deletedAt: null }
    },
    orderBy: { createdAt: "asc" },
    select: { product: { select: { id: true } } }
  });
  if (!pricedProduct) throw new Error(`Store ${store.code} has no active priced ecommerce product.`);

  const customer = await prisma.customer.create({
    data: {
      retailOrgId: store.retailOrgId,
      storeId: store.id,
      customerNo,
      fullName: "Capacity Idempotency Test",
      phone: "+233200000000",
      status: "ACTIVE",
      originNodeCode: "CAPACITY-TEST",
      lastModifiedByNodeCode: "CAPACITY-TEST"
    },
    select: { id: true }
  });
  customerId = customer.id;
  const account = await prisma.ecommerceCustomerAccount.create({
    data: {
      retailOrgId: store.retailOrgId,
      customerId: customer.id,
      passwordHash: await bcrypt.hash(crypto.randomUUID(), 4),
      status: "ACTIVE"
    },
    select: { id: true }
  });
  accountId = account.id;
  await prisma.ecommerceCustomerSession.create({
    data: {
      retailOrgId: store.retailOrgId,
      customerAccountId: account.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });

  const body = JSON.stringify({
    lines: [{ productId: pricedProduct.product.id, variantCode: null, quantity: 1 }],
    delivery: {
      fulfilmentMethod: "PICKUP",
      recipientName: "Capacity Idempotency Test",
      phone: "+233200000000",
      saveAddress: false
    },
    paymentMethodCode: "PAY_ON_DELIVERY"
  });
  const responses = await Promise.all(
    Array.from({ length: requestCount }, () =>
      fetch(`${baseUrl}/api/ecommerce/${encodeURIComponent(store.code)}/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": checkoutKey,
          cookie: `flash_erp_shop_session=${token}`
        },
        body
      })
    )
  );
  const payloads = await Promise.all(responses.map((response) => response.json()));
  const maxObservedWriteActive = Math.max(
    ...responses.map((response) => Number(response.headers.get("x-flash-erp-write-active") ?? 0))
  );
  const maxObservedWriteQueued = Math.max(
    ...responses.map((response) => Number(response.headers.get("x-flash-erp-write-queued") ?? 0))
  );
  const reportedWriteLimit = Math.max(
    ...responses.map((response) => Number(response.headers.get("x-flash-erp-write-limit") ?? 0))
  );
  const failures = responses
    .map((response, index) => ({ status: response.status, payload: payloads[index] }))
    .filter((result) => result.status < 200 || result.status >= 300);
  if (failures.length > 0) throw new Error(`Duplicate checkout requests failed: ${JSON.stringify(failures[0])}`);

  const orderNumbers = new Set(payloads.map((payload) => String(payload.orderNo ?? "")));
  const persistedCount = await prisma.ecommerceOrder.count({ where: { checkoutRequestKey: checkoutKey } });
  if (orderNumbers.size !== 1 || persistedCount !== 1) {
    throw new Error(`Expected one persisted order, found ${persistedCount} rows and ${orderNumbers.size} order numbers.`);
  }
  if (reportedWriteLimit > 0 && maxObservedWriteActive > reportedWriteLimit) {
    throw new Error(
      `Observed ${maxObservedWriteActive} active writes above the reported limit ${reportedWriteLimit}.`
    );
  }

  const mismatch = await fetch(`${baseUrl}/api/ecommerce/${encodeURIComponent(store.code)}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": checkoutKey,
      cookie: `flash_erp_shop_session=${token}`
    },
    body: body.replace('"quantity":1', '"quantity":2')
  });
  if (mismatch.status !== 409) {
    throw new Error(`Changed-payload replay returned HTTP ${mismatch.status}; expected 409.`);
  }

  process.stdout.write(
    `Idempotency concurrency passed: ${requestCount} simultaneous requests, one order, one order number, changed payload rejected; write limit ${reportedWriteLimit || "not reported"}, max active ${maxObservedWriteActive}, max queued ${maxObservedWriteQueued}.\n`
  );
}

main()
  .finally(cleanup)
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
