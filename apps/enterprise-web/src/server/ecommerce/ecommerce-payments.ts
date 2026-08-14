import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import {
  calculateLayawayAvailableBaseQuantity,
  normalizeLayawaySettings,
} from "@flash-erp/domain";

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
import { postLayawayAccountingInTransaction } from "@/server/services/erp-pos-sale-accounting";

type SupportedGateway = "PAYSTACK" | "FLUTTERWAVE";
const ecommerceTerminalCode = "ecommerce-web";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function toQuantity(value: number | Prisma.Decimal | null | undefined) {
  return Number(Number(value ?? 0).toFixed(3));
}

function readJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function activateEcommerceLayawayReservation(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    storeId: string;
    salesOrderId: string;
    reservationStatus: string;
    layawayPolicySnapshotJson: string | null;
    lines: Array<{
      id: string;
      productCodeSnapshot: string;
      productVariantCodeSnapshot: string | null;
      baseUnitOfMeasure: string;
      baseQuantity: Prisma.Decimal;
    }>;
  },
) {
  if (input.reservationStatus === "ACTIVE") return "ACTIVE";
  const policy = normalizeLayawaySettings(
    readJsonObject(input.layawayPolicySnapshotJson),
  );
  if (!policy.reserveStockOnDeposit) return "NOT_APPLICABLE";

  const location = await tx.inventoryLocation.findFirst({
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      status: "ACTIVE",
    },
    orderBy: [
      { useForSalesOrderDefault: "desc" },
      { useForSalesDefault: "desc" },
      { name: "asc" },
    ],
    select: { id: true, code: true },
  });
  if (!location) {
    throw new EcommerceAuthError(
      "The shop needs an active sales-order inventory location before this Layaway deposit can be accepted.",
      409,
    );
  }

  const productCodes = [...new Set(input.lines.map((line) => line.productCodeSnapshot))];
  const products = await tx.product.findMany({
    where: {
      retailOrgId: input.retailOrgId,
      code: { in: productCodes },
      status: "ACTIVE",
      deletedAt: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      productType: true,
      trackInventory: true,
      matrixVariants: {
        select: { id: true, code: true },
      },
    },
  });
  const productsByCode = new Map(products.map((product) => [product.code, product] as const));
  const reservableLines = input.lines.flatMap((line) => {
    const product = productsByCode.get(line.productCodeSnapshot);
    if (!product || !product.trackInventory || product.productType === "SERVICE") return [];
    const variantId = line.productVariantCodeSnapshot
      ? product.matrixVariants.find((variant) => variant.code === line.productVariantCodeSnapshot)?.id ?? null
      : null;
    return [{ line, product, variantId }];
  });
  if (reservableLines.length === 0) return "ACTIVE";

  const positionKey = (productId: string, variantId: string | null) =>
    `${productId}:${variantId ?? ""}`;
  const snapshotKey = (productCode: string, variantCode: string | null) =>
    `${productCode.trim().toUpperCase()}:${variantCode?.trim().toUpperCase() ?? ""}`;
  const requestedByPosition = new Map<string, number>();
  for (const { line, product, variantId } of reservableLines) {
    const key = positionKey(product.id, variantId);
    requestedByPosition.set(
      key,
      toQuantity((requestedByPosition.get(key) ?? 0) + Number(line.baseQuantity)),
    );
  }
  const stockPositions = await tx.inventoryLedgerEntry.groupBy({
    by: ["productId", "productVariantId"],
    where: {
      retailOrgId: input.retailOrgId,
      storeId: input.storeId,
      inventoryLocationId: location.id,
      productId: { in: [...new Set(reservableLines.map(({ product }) => product.id))] },
    },
    _sum: { quantity: true },
  });
  const onHandByPosition = new Map(
    stockPositions.map((position) => [
      positionKey(position.productId, position.productVariantId),
      toQuantity(position._sum.quantity),
    ] as const),
  );
  const activeReservations = await tx.salesOrderInventoryReservation.findMany({
    where: {
      inventoryLocationId: location.id,
      status: "ACTIVE",
      productCodeSnapshot: { in: productCodes },
    },
    select: {
      productCodeSnapshot: true,
      productVariantCodeSnapshot: true,
      baseQuantity: true,
    },
  });
  const activeReservedBySnapshot = new Map<string, number>();
  for (const reservation of activeReservations) {
    const key = snapshotKey(
      reservation.productCodeSnapshot,
      reservation.productVariantCodeSnapshot,
    );
    activeReservedBySnapshot.set(
      key,
      toQuantity((activeReservedBySnapshot.get(key) ?? 0) + Number(reservation.baseQuantity)),
    );
  }
  const checkedPositions = new Set<string>();
  for (const { line, product, variantId } of reservableLines) {
    const key = positionKey(product.id, variantId);
    if (checkedPositions.has(key)) continue;
    checkedPositions.add(key);
    const available = calculateLayawayAvailableBaseQuantity({
      onHandBaseQuantity: onHandByPosition.get(key) ?? 0,
      activeReservedBaseQuantity:
        activeReservedBySnapshot.get(
          snapshotKey(line.productCodeSnapshot, line.productVariantCodeSnapshot),
        ) ?? 0,
    });
    const requested = requestedByPosition.get(key) ?? 0;
    if (requested > available + 0.0005) {
      throw new EcommerceAuthError(
        `Only ${available.toFixed(3)} base unit(s) of ${product.name} remain after active Layaway reservations.`,
        409,
      );
    }
  }

  await tx.salesOrderInventoryReservation.createMany({
    data: reservableLines.map(({ line }) => ({
      salesOrderId: input.salesOrderId,
      salesOrderLineId: line.id,
      inventoryLocationId: location.id,
      inventoryLocationCodeSnapshot: location.code,
      productCodeSnapshot: line.productCodeSnapshot,
      productVariantCodeSnapshot: line.productVariantCodeSnapshot,
      baseUnitOfMeasure: line.baseUnitOfMeasure,
      baseQuantity: line.baseQuantity,
      status: "ACTIVE",
    })),
  });
  return "ACTIVE";
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
  amount?: unknown;
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
      salesOrder: {
        select: {
          id: true,
          orderType: true,
          paidAmount: true,
          balanceAmount: true,
          minimumDepositAmount: true,
        },
      }
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
  const isLayaway = order.salesOrder.orderType === "LAYAWAY";
  const requestedAmount = input.amount === null || input.amount === undefined
    ? null
    : toMoney(Number(input.amount));
  const amount = isLayaway
    ? requestedAmount ?? (
        Number(order.salesOrder.paidAmount) <= 0
          ? Number(order.layawayDepositAmount) > 0
            ? Number(order.layawayDepositAmount)
            : Number(order.salesOrder.minimumDepositAmount)
          : Number(order.balanceAmount)
      )
    : Number(order.balanceAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number(order.balanceAmount) + 0.005) {
    throw new EcommerceAuthError("Enter a payment amount within the outstanding balance.");
  }
  if (
    isLayaway &&
    Number(order.salesOrder.paidAmount) <= 0 &&
    amount + 0.005 < Number(order.salesOrder.minimumDepositAmount)
  ) {
    throw new EcommerceAuthError(
      `The opening Layaway deposit must be at least ${Number(order.salesOrder.minimumDepositAmount).toFixed(2)}.`,
    );
  }
  if (!isLayaway && requestedAmount !== null && Math.abs(requestedAmount - amount) > 0.005) {
    throw new EcommerceAuthError("A standard ecommerce order must be paid in full.");
  }
  const initializationRequestHash = hashEcommerceIdempotencyPayload({
    ecommerceOrderId: order.id,
    customerAccountId: session.customerAccount.id,
    tenderMethodCode,
    receiptEmail,
    amount: toMoney(amount),
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
  const gatewayAmount = toMoney(amount);
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
        amount: gatewayAmount,
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
          amount: String(Math.round(gatewayAmount * 100)),
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
          amount: gatewayAmount,
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
      amount: gatewayAmount,
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
          salesOrder: {
            include: { lines: true },
          }
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

    const currentSalesOrder = await tx.salesOrder.findUnique({
      where: { id: payment.ecommerceOrder.salesOrderId },
      include: { lines: true },
    });
    if (!currentSalesOrder || currentSalesOrder.status !== "OPEN") {
      throw new EcommerceAuthError("This order can no longer receive a payment.", 409);
    }
    const isLayaway = currentSalesOrder.orderType === "LAYAWAY";
    const previousPaidAmount = Number(currentSalesOrder.paidAmount);
    const nextPaidAmount = toMoney(
      Math.min(Number(currentSalesOrder.totalAmount), previousPaidAmount + expectedAmount)
    );
    const nextBalanceAmount = toMoney(Number(currentSalesOrder.totalAmount) - nextPaidAmount);
    const paymentStatus = nextBalanceAmount <= 0 ? "PAID" : "PARTIALLY_PAID";
    const isOpeningLayawayDeposit = isLayaway && previousPaidAmount <= 0.005;
    const reservationStatus = isOpeningLayawayDeposit
      ? await activateEcommerceLayawayReservation(tx, {
          retailOrgId: currentSalesOrder.retailOrgId,
          storeId: currentSalesOrder.storeId,
          salesOrderId: currentSalesOrder.id,
          reservationStatus: currentSalesOrder.reservationStatus,
          layawayPolicySnapshotJson: currentSalesOrder.layawayPolicySnapshotJson,
          lines: currentSalesOrder.lines,
        })
      : currentSalesOrder.reservationStatus;

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
          paymentPurpose: isLayaway
            ? isOpeningLayawayDeposit
              ? "LAYAWAY_DEPOSIT"
              : "LAYAWAY_INSTALLMENT"
            : "SALES_ORDER_DEPOSIT",
          receivedTerminalCodeSnapshot: ecommerceTerminalCode,
          receivedCashierCodeSnapshot: "ECOMMERCE",
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
        paidAmount: nextPaidAmount,
        balanceAmount: nextBalanceAmount,
        reservationStatus,
        ...(reservationStatus === "ACTIVE" && currentSalesOrder.reservationStatus !== "ACTIVE"
          ? { reservationCreatedAt: now }
          : {}),
        ...(!isLayaway || isOpeningLayawayDeposit
          ? {
              depositAmount: isLayaway ? expectedAmount : nextPaidAmount,
              depositTenderMethodCodeSnapshot: payment.tenderMethod?.code ?? null,
              depositTenderMethodNameSnapshot: payment.tenderMethod?.name ?? null,
              depositPaymentMethodSnapshot: payment.method,
              depositReference: payment.reference,
              depositPaidAt: now,
            }
          : {}),
        recordVersion: { increment: 1 }
      }
    });
    await tx.ecommerceOrderStatusEvent.create({
      data: {
        ecommerceOrderId: payment.ecommerceOrder.id,
        status: paymentStatus,
        label: isLayaway
          ? isOpeningLayawayDeposit
            ? "Layaway deposit received"
            : "Layaway installment received"
          : paymentStatus === "PAID"
            ? "Payment received"
            : "Part payment received",
        note: `${payment.currencyCode} ${expectedAmount.toFixed(2)} via ${payment.tenderMethod?.name ?? payment.provider ?? "online payment"}`,
        actorType: "PAYMENT_GATEWAY",
        actorLabel: payment.provider
      }
    });

    if (isLayaway) {
      await postLayawayAccountingInTransaction(tx, {
        retailOrgId: currentSalesOrder.retailOrgId,
        salesOrderId: currentSalesOrder.id,
        postedBy: "Public ecommerce payment verification",
      });
    }

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
