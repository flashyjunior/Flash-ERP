import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { verifyCustomerEcommercePayment } from "@/server/ecommerce/ecommerce-payments";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string; reference: string }> }
) {
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    const { reference, storeCode: requestedStoreCode } = await context.params;
    storeCode = requestedStoreCode;
    const body = (await request.json().catch(() => ({}))) as {
      providerTransactionId?: string | null;
    };
    const { value } = await measureEcommerceOperation("PAYMENT_VERIFY", storeCode, () =>
      verifyCustomerEcommercePayment({
        storeCode,
        reference,
        providerTransactionId: body.providerTransactionId
      }),
    );
    return attachEcommerceServerTiming(NextResponse.json(value), "PAYMENT_VERIFY", startedAt);
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "Payment could not be verified."),
      "PAYMENT_VERIFY",
      startedAt,
    );
  }
}
