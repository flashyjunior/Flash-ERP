import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getEcommerceCustomerOrder } from "@/server/ecommerce/ecommerce.repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string; orderNo: string }> }
) {
  try {
    const { storeCode, orderNo } = await context.params;
    return NextResponse.json({ order: await getEcommerceCustomerOrder(storeCode, orderNo) });
  } catch (error) {
    return ecommerceErrorResponse(error, "That order could not be loaded.");
  }
}
