import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { initializeEcommercePayment } from "@/server/ecommerce/ecommerce-payments";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string; orderNo: string }> }
) {
  try {
    const { storeCode, orderNo } = await context.params;
    const body = (await request.json()) as {
      tenderMethodCode?: string;
      receiptEmail?: string;
      amount?: number;
    };
    return NextResponse.json(
      await runEnterpriseOperation("TRANSACTIONAL_WRITE", () =>
        initializeEcommercePayment({
          storeCode,
          orderNo,
          tenderMethodCode: body.tenderMethodCode,
          receiptEmail: body.receiptEmail,
          amount: body.amount,
          idempotencyKey: request.headers.get("idempotency-key")
        })
      ),
      { status: 201 }
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Payment could not be started.");
  }
}
