import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { processFlutterwaveWebhook } from "@/server/ecommerce/ecommerce-payments";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    return NextResponse.json(
      await processFlutterwaveWebhook(rawBody, request.headers.get("flutterwave-signature"))
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Flutterwave webhook could not be processed.");
  }
}
