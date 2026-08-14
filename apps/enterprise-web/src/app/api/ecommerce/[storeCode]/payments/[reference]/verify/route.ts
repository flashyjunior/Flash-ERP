import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { verifyCustomerEcommercePayment } from "@/server/ecommerce/ecommerce-payments";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string; reference: string }> }
) {
  try {
    const { storeCode, reference } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      providerTransactionId?: string | null;
    };
    return NextResponse.json(
      await verifyCustomerEcommercePayment({
        storeCode,
        reference,
        providerTransactionId: body.providerTransactionId
      })
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Payment could not be verified.");
  }
}
