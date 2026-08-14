import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { requestEcommerceRefund } from "@/server/ecommerce/ecommerce.repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string; orderNo: string }> }
) {
  try {
    const { storeCode, orderNo } = await context.params;
    const body = (await request.json()) as {
      amount?: number;
      reason?: string;
      details?: string | null;
    };
    return NextResponse.json(await requestEcommerceRefund({ storeCode, orderNo, ...body }), {
      status: 201
    });
  } catch (error) {
    return ecommerceErrorResponse(error, "The refund request could not be submitted.");
  }
}
