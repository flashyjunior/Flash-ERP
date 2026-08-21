import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { processFlutterwaveWebhook } from "@/server/ecommerce/ecommerce-payments";
import {
  attachEcommerceServerTiming,
  recordEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const rawBody = await request.text();
    const value = await processFlutterwaveWebhook(
      rawBody,
      request.headers.get("flutterwave-signature"),
    );
    recordEcommerceOperation("PAYMENT_WEBHOOK", value.storeCode, performance.now() - startedAt, true);
    return attachEcommerceServerTiming(
      NextResponse.json({ received: value.received }),
      "PAYMENT_WEBHOOK",
      startedAt,
    );
  } catch (error) {
    recordEcommerceOperation("PAYMENT_WEBHOOK", "GATEWAY", performance.now() - startedAt, false);
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "Flutterwave webhook could not be processed."),
      "PAYMENT_WEBHOOK",
      startedAt,
    );
  }
}
