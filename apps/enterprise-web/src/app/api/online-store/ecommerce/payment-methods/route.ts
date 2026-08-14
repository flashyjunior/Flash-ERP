import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { updateEcommercePaymentOptions } from "@/server/ecommerce/ecommerce.repository";

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Parameters<typeof updateEcommercePaymentOptions>[0];
    return NextResponse.json(await updateEcommercePaymentOptions(body));
  } catch (error) {
    return ecommerceErrorResponse(error, "Payment options could not be saved.");
  }
}
