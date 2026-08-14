import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  EcommerceAuthError,
  getEcommerceCustomerSession
} from "@/server/ecommerce/ecommerce-customer-auth";
import {
  hashEcommerceIdempotencyPayload,
  isUniqueConstraintError,
  requireEcommerceIdempotencyKey
} from "@/server/ecommerce/ecommerce-idempotency";

type SupportedGateway = "PAYSTACK" | "FLUTTERWAVE";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function normalizeEmail(value: unknown) {
  const email = optionalText(value)?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EcommerceAuthError("Enter a valid email address for the payment receipt.");
  }
  return email;
}

function gatewayEnvironmentKey(provider: SupportedGateway) {
  return provider === "PAYSTACK"
    ? process.env.FLASH_ERP_PAYSTACK_SECRET_KEY
    : process.env.FLASH_ERP_FLUTTERWAVE_SECRET_KEY;
}

function resolveGatewaySecret(tender: {
  gatewayProvider: string | null;
  gatewaySecretMask: string | null;
}) {
  const provider = tender.gatewayProvider as SupportedGateway | null;
  if (!provider || !["PAYSTACK", "FLUTTERWAVE"].includes(provider)) {
    throw new EcommerceAuthError("This payment gateway is not supported.", 409);
  }

  const environmentSecret = optionalText(gatewayEnvironmentKey(provider));
  const configuredSecret = optionalText(tender.gatewaySecretMask);
  const secret = environmentSecret ?? configuredSecret;

  if (!secret || /^\*+$/.test(secret)) {
    throw new EcommerceAuthError(
      `${provider === "PAYSTACK" ? "Paystack" : "Flutterwave"} needs a server-side secret key before customer payments can be accepted.`,
      409
    );
  }

  return { provider, secret };
}

function callbackOrigin() {
  return (
    optionalText(process.env.FLASH_ERP_ECOMMERCE_PUBLIC_URL) ??
    optionalText(process.env.FLASH_ERP_ENTERPRISE_APP_URL) ??
    optionalText(process.env.NEXT_PUBLIC_ENTERPRISE_URL) ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

async function parseGatewayResponse(response: Response) {
  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Gateway returned HTTP ${response.status}.`;
    throw new EcommerceAuthError(`Payment gateway rejected the request: ${message}`, 502);
  }

  return payload as Record<string, unknown>;
}

export async function initializeEcommercePayment(input: {
  storeCode: string;
  orderNo: string;
  tenderMethodCode: unknown;
  receiptEmail: unknown;
  idempotencyKey?: unknown;
}) {
  const session = await getEcommerceCustomerSession({ storeCode: input.storeCode, required: true });
  if (!session) {
    throw new EcommerceAuthError("Sign in to pay for this order.", 401);
  }

  const tenderMethodCode = optionalText(input.tenderMethodCode)?.toUpperCase();
  if (!tenderMethodCode) {
    throw new EcommerceAuthError("Choose a payment method.");
  }
  const receiptEmail = normalizeEmail(input.receiptEmail);
  const initializationRequestKey = requireEcommerceIdempotencyKey(input.idempotencyKey);
  const order = await prisma.ecommerceOrder.findFirst({
    where: {
      orderNo: input.orderNo,
      customerAccountId: session.customerAccount.id,
      status: { notIn: ["CANCELLED", "REFUNDED"] }
    },
    include: {
      store: { select: { code: true, ecommerceDisplayName: true, name: true } },
      salesOrder: { select: { id: true } }
    }
  });

  if (!order || Number(order.balanceAmount) <= 0) {
    throw new EcommerceAuthError("This order does not have an outstanding balance.", 409);
  }
  if (
    order.paymentTiming !== "PREPAY" ||
    order.selectedPaymentMethodCode?.toUpperCase() !== tenderMethodCode
  ) {
    throw new EcommerceAuthError("Use the payment option selected for this order.", 409);
  }
  const initializationRequestHash = hashEcommerceIdempotencyPayload({
    ecommerceOrderId: order.id,
    customerAccountId: session.customerAccount.id,
    tenderMethodCode,
    receiptEmail,
    balanceAmount: toMoney(Number(order.balanceAmount))
  });
  const loadExistingPayment = () => prisma.ecommercePayment.findFirst({
    where: {
      initializationRequestKey,
      ecommerceOrderId: order.id
    },
    select: {
      id: true,
      initializationRequestHash: true,
      reference: true,
      provider: true,
      checkoutUrl: true,
      amount: true,
      currencyCode: true,
      status: true,
      failureMessage: true
    }
  });
  const mapExistingPayment = (
    payment: NonNullable<Awaited<ReturnType<typeof loadExistingPayment>>>
  ) => {
    if (payment.initializationRequestHash !== initializationRequestHash) {
      throw new EcommerceAuthError(
        "This payment request key was already used with different payment details.",
        409
      );
    }
    if (!payment.checkoutUrl || !payment.provider) {
      throw new EcommerceAuthError(
        payment.status === "FAILED"
          ? payment.failureMessage ?? "The earlier payment request failed. Start a new payment request."
          : "This payment request is already being initialized. Try it again shortly.",
        409
      );
    }
    return {
      paymentId: payment.id,
      reference: payment.reference,
      provider: payment.provider,
      checkoutUrl: payment.checkoutUrl,
      amount: Number(payment.amount),
      currencyCode: payment.currencyCode,
      idempotentReplay: true
    };
  };
  const existingPayment = await loadExistingPayment();
  if (existingPayment) return mapExistingPayment(existingPayment);

  const tender = await prisma.tenderMethod.findFirst({
    where: {
      retailOrgId: order.retailOrgId,
      code: tenderMethodCode,
      status: "ACTIVE",
      gatewayActive: true,
      gatewayStatus: "READY",
      gatewayProvider: { in: ["PAYSTACK", "FLUTTERWAVE"] },
      ecommerceStoreMethods: {
        some: { storeId: order.storeId, enabled: true }
      }
    }
  });

  if (!tender) {
    throw new EcommerceAuthError("That online payment method is not available.", 409);
  }

  const { provider, secret } = resolveGatewaySecret(tender);
  const reference = `ECOM-${order.store.code}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const amount = toMoney(Number(order.balanceAmount));
  const returnUrl = `${callbackOrigin()}/shop/${encodeURIComponent(order.store.code)}/payment-return?reference=${encodeURIComponent(reference)}&provider=${provider}`;
  let payment: { id: string };
  try {
    payment = await prisma.ecommercePayment.create({
      data: {
        ecommerceOrderId: order.id,
        tenderMethodId: tender.id,
        reference,
        initializationRequestKey,
        initializationRequestHash,
        provider,
        method: tender.paymentMethod,
        currencyCode: order.currencyCode,
        amount,
        status: "INITIALIZING"
      },
      select: { id: true }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await loadExistingPayment();
      if (existing) return mapExistingPayment(existing);
    }
    throw error;
  }

  try {
    let gatewayPayload: Record<string, unknown>;
    let checkoutUrl: string;
    let providerReference: string | null = null;

    if (provider === "PAYSTACK") {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: receiptEmail,
          amount: String(Math.round(amount * 100)),
          currency: order.currencyCode,
          reference,
          callback_url: returnUrl,
          metadata: JSON.stringify({
            ecommerceOrderId: order.id,
            orderNo: order.orderNo,
            storeCode: order.store.code
          })
        })
      });
      gatewayPayload = await parseGatewayResponse(response);
      const data = gatewayPayload.data as Record<string, unknown> | undefined;
      checkoutUrl = String(data?.authorization_url ?? "");
      providerReference = optionalText(data?.reference);
    } else {
      const response = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount,
          currency: order.currencyCode,
          redirect_url: returnUrl,
          customer: {
            email: receiptEmail,
            name: session.customerAccount.customer.fullName,
            phonenumber: session.customerAccount.customer.phone ?? order.deliveryPhone
          },
          payment_options: order.currencyCode === "GHS" ? "card,ghanamobilemoney" : undefined,
          customizations: {
            title: order.store.ecommerceDisplayName ?? order.store.name,
            description: `Payment for ${order.orderNo}`
          },
          meta: {
            ecommerceOrderId: order.id,
            orderNo: order.orderNo,
            storeCode: order.store.code
          },
          configurations: {
            session_duration: 30,
            max_retry_attempt: 5
          }
        })
      });
      gatewayPayload = await parseGatewayResponse(response);
      const data = gatewayPayload.data as Record<string, unknown> | undefined;
      checkoutUrl = String(data?.link ?? "");
    }

    if (!/^https:\/\//i.test(checkoutUrl)) {
      throw new EcommerceAuthError("The payment gateway did not return a secure checkout link.", 502);
    }

    await prisma.ecommercePayment.update({
      where: { id: payment.id },
      data: {
        status: "PENDING",
        checkoutUrl,
        providerReference,
        gatewayResponseJson: JSON.stringify(gatewayPayload)
      }
    });
    if (!session.customerAccount.customer.email) {
      await prisma.customer.update({
        where: { id: session.customerAccount.customerId },
        data: { email: receiptEmail, lastModifiedByNodeCode: "ECOMMERCE" }
      });
    }

    return {
      paymentId: payment.id,
      reference,
      provider,
      checkoutUrl,
      amount,
      currencyCode: order.currencyCode,
      idempotentReplay: false
    };
  } catch (error) {
    await prisma.ecommercePayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureMessage: error instanceof Error ? error.message : "Gateway initialization failed."
      }
    });
    throw error;
  }
}

async function verifyWithGateway(payment: {
  reference: string;
  provider: string | null;
  amount: Prisma.Decimal;
  currencyCode: string;
  tenderMethod: {
    gatewayProvider: string | null;
    gatewaySecretMask: string | null;
  } | null;
}, providerTransactionId?: string | null) {
  if (!payment.tenderMethod) {
    throw new EcommerceAuthError("The payment method configuration is no longer available.", 409);
  }
  const { provider, secret } = resolveGatewaySecret(payment.tenderMethod);

  if (provider === "PAYSTACK") {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.reference)}`,
      { headers: { authorization: `Bearer ${secret}` } }
    );
    const payload = await parseGatewayResponse(response);
    const data = payload.data as Record<string, unknown> | undefined;
    return {
      success: data?.status === "success",
      amount: Number(data?.amount ?? 0) / 100,
      currency: String(data?.currency ?? ""),
      reference: String(data?.reference ?? ""),
      providerReference: optionalText(data?.id) ?? optionalText(data?.reference),
      payload
    };
  }

  const transactionId = optionalText(providerTransactionId);
  if (!transactionId) {
    throw new EcommerceAuthError("Flutterwave did not provide a transaction ID for verification.", 409);
  }
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    { headers: { authorization: `Bearer ${secret}` } }
  );
  const payload = await parseGatewayResponse(response);
  const data = payload.data as Record<string, unknown> | undefined;
  return {
    success: data?.status === "successful",
    amount: Number(data?.amount ?? data?.charged_amount ?? 0),
    currency: String(data?.currency ?? ""),
    reference: String(data?.tx_ref ?? ""),
    providerReference: optionalText(data?.id) ?? optionalText(data?.flw_ref),
    payload
  };
}

export async function verifyEcommercePayment(input: {
  reference: string;
  providerTransactionId?: string | null;
  customerAccountId?: string | null;
}) {
  const payment = await prisma.ecommercePayment.findUnique({
    where: { reference: input.reference },
    include: {
      tenderMethod: true,
      ecommerceOrder: {
        include: {
          salesOrder: true
        }
      }
    }
  });

  if (!payment || (input.customerAccountId && payment.ecommerceOrder.customerAccountId !== input.customerAccountId)) {
    throw new EcommerceAuthError("That payment could not be found.", 404);
  }
  if (payment.status === "PAID") {
    return {
      status: "PAID",
      orderNo: payment.ecommerceOrder.orderNo,
      paymentStatus: payment.ecommerceOrder.paymentStatus,
      message: "Payment already verified."
    };
  }

  const verified = await verifyWithGateway(payment, input.providerTransactionId);
  const expectedAmount = Number(payment.amount);
  const valid =
    verified.success &&
    verified.reference === payment.reference &&
    verified.currency.toUpperCase() === payment.currencyCode.toUpperCase() &&
    toMoney(verified.amount) >= toMoney(expectedAmount);

  if (!valid) {
    await prisma.ecommercePayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        verifiedAt: new Date(),
        providerReference: verified.providerReference,
        gatewayResponseJson: JSON.stringify(verified.payload),
        failureMessage: "Gateway verification did not match the expected reference, amount, currency, and status."
      }
    });
    throw new EcommerceAuthError("Payment was not completed or could not be verified.", 409);
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const currentPayment = await tx.ecommercePayment.findUnique({
      where: { id: payment.id },
      select: { status: true }
    });
    if (currentPayment?.status === "PAID") {
      return {
        status: "PAID",
        orderNo: payment.ecommerceOrder.orderNo,
        paymentStatus: payment.ecommerceOrder.paymentStatus,
        message: "Payment already verified."
      };
    }

    const previousPaidAmount = Number(payment.ecommerceOrder.paidAmount);
    const nextPaidAmount = toMoney(
      Math.min(Number(payment.ecommerceOrder.totalAmount), previousPaidAmount + expectedAmount)
    );
    const nextBalanceAmount = toMoney(Number(payment.ecommerceOrder.totalAmount) - nextPaidAmount);
    const paymentStatus = nextBalanceAmount <= 0 ? "PAID" : "PARTIALLY_PAID";

    await tx.ecommercePayment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        verifiedAt: now,
        paidAt: now,
        providerReference: verified.providerReference,
        gatewayResponseJson: JSON.stringify(verified.payload),
        failureMessage: null
      }
    });
    await tx.ecommerceOrder.update({
      where: { id: payment.ecommerceOrder.id },
      data: {
        paidAmount: nextPaidAmount,
        balanceAmount: nextBalanceAmount,
        paymentStatus
      }
    });

    const existingPosPayment = await tx.posPayment.findFirst({
      where: {
        posTransactionId: payment.ecommerceOrder.salesOrder.sourceTransactionId,
        reference: payment.reference
      },
      select: { id: true }
    });
    if (!existingPosPayment) {
      await tx.posPayment.create({
        data: {
          posTransactionId: payment.ecommerceOrder.salesOrder.sourceTransactionId,
          tenderMethodId: payment.tenderMethodId,
          tenderMethodCodeSnapshot: payment.tenderMethod?.code ?? null,
          tenderMethodNameSnapshot: payment.tenderMethod?.name ?? null,
          method: payment.method,
          amount: expectedAmount,
          reference: payment.reference,
          paymentPurpose: "SALES_ORDER_DEPOSIT",
          receivedAt: now
        }
      });
    }
    await tx.posTransaction.update({
      where: { id: payment.ecommerceOrder.salesOrder.sourceTransactionId },
      data: { paidAmount: nextPaidAmount, recordVersion: { increment: 1 } }
    });
    await tx.salesOrder.update({
      where: { id: payment.ecommerceOrder.salesOrderId },
      data: {
        depositAmount: nextPaidAmount,
        balanceAmount: nextBalanceAmount,
        depositTenderMethodCodeSnapshot: payment.tenderMethod?.code ?? null,
        depositTenderMethodNameSnapshot: payment.tenderMethod?.name ?? null,
        depositPaymentMethodSnapshot: payment.method,
        depositReference: payment.reference,
        depositPaidAt: now,
        recordVersion: { increment: 1 }
      }
    });
    await tx.ecommerceOrderStatusEvent.create({
      data: {
        ecommerceOrderId: payment.ecommerceOrder.id,
        status: paymentStatus,
        label: paymentStatus === "PAID" ? "Payment received" : "Part payment received",
        note: `${payment.currencyCode} ${expectedAmount.toFixed(2)} via ${payment.tenderMethod?.name ?? payment.provider ?? "online payment"}`,
        actorType: "PAYMENT_GATEWAY",
        actorLabel: payment.provider
      }
    });

    return {
      status: "PAID",
      orderNo: payment.ecommerceOrder.orderNo,
      paymentStatus,
      paidAmount: nextPaidAmount,
      balanceAmount: nextBalanceAmount,
      message: "Payment verified."
    };
  });
}

export async function verifyCustomerEcommercePayment(input: {
  storeCode: string;
  reference: string;
  providerTransactionId?: string | null;
}) {
  const session = await getEcommerceCustomerSession({ storeCode: input.storeCode, required: true });
  if (!session) {
    throw new EcommerceAuthError("Sign in to verify this payment.", 401);
  }
  return verifyEcommercePayment({
    reference: input.reference,
    providerTransactionId: input.providerTransactionId,
    customerAccountId: session.customerAccount.id
  });
}

function timingSafeSignature(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function processPaystackWebhook(rawBody: string, signature: string | null) {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new EcommerceAuthError("Invalid webhook payload.", 400);
  }
  const data = event.data as Record<string, unknown> | undefined;
  const reference = optionalText(data?.reference);
  if (!reference || !signature) {
    throw new EcommerceAuthError("Webhook signature is missing.", 401);
  }
  const payment = await prisma.ecommercePayment.findUnique({
    where: { reference },
    include: { tenderMethod: true }
  });
  if (!payment?.tenderMethod) {
    throw new EcommerceAuthError("Payment reference was not recognized.", 404);
  }
  const { secret } = resolveGatewaySecret(payment.tenderMethod);
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  if (!timingSafeSignature(expected, signature)) {
    throw new EcommerceAuthError("Webhook signature is invalid.", 401);
  }
  if (event.event === "charge.success") {
    await verifyEcommercePayment({ reference });
  }
  return { received: true };
}

export async function processFlutterwaveWebhook(rawBody: string, signature: string | null) {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new EcommerceAuthError("Invalid webhook payload.", 400);
  }
  const data = event.data as Record<string, unknown> | undefined;
  const reference = optionalText(data?.tx_ref) ?? optionalText(data?.reference);
  if (!reference || !signature) {
    throw new EcommerceAuthError("Webhook signature is missing.", 401);
  }
  const payment = await prisma.ecommercePayment.findUnique({
    where: { reference },
    include: { tenderMethod: true }
  });
  if (!payment?.tenderMethod) {
    throw new EcommerceAuthError("Payment reference was not recognized.", 404);
  }
  const webhookSecret =
    optionalText(process.env.FLASH_ERP_FLUTTERWAVE_WEBHOOK_SECRET) ??
    optionalText(payment.tenderMethod.gatewayWebhookSecretMask);
  if (!webhookSecret) {
    throw new EcommerceAuthError("Flutterwave webhook verification is not configured.", 503);
  }
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("base64");
  if (!timingSafeSignature(expected, signature)) {
    throw new EcommerceAuthError("Webhook signature is invalid.", 401);
  }
  const transactionId = optionalText(data?.id);
  if (event.type === "charge.completed" || event.event === "charge.completed") {
    await verifyEcommercePayment({ reference, providerTransactionId: transactionId });
  }
  return { received: true };
}
