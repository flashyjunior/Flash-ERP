import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { processPaystackWebhook } from "@/server/ecommerce/ecommerce-payments";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    return NextResponse.json(
      await processPaystackWebhook(rawBody, request.headers.get("x-paystack-signature"))
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Paystack webhook could not be processed.");
  }
}
