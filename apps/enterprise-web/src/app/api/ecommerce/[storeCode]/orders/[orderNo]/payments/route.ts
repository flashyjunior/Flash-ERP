import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { initializeEcommercePayment } from "@/server/ecommerce/ecommerce-payments";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string; orderNo: string }> }
) {
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    const { orderNo, storeCode: requestedStoreCode } = await context.params;
    storeCode = requestedStoreCode;
    const body = (await request.json()) as {
      tenderMethodCode?: string;
      receiptEmail?: string;
      amount?: number;
    };
    const { value } = await measureEcommerceOperation("PAYMENT_INITIALIZE", storeCode, () =>
      runEnterpriseOperation("TRANSACTIONAL_WRITE", () =>
        initializeEcommercePayment({
          storeCode,
          orderNo,
          tenderMethodCode: body.tenderMethodCode,
          receiptEmail: body.receiptEmail,
          amount: body.amount,
          idempotencyKey: request.headers.get("idempotency-key")
        })
      ),
    );
    return attachEcommerceServerTiming(
      NextResponse.json(value, { status: 201 }),
      "PAYMENT_INITIALIZE",
      startedAt,
    );
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "Payment could not be started."),
      "PAYMENT_INITIALIZE",
      startedAt,
    );
  }
}
