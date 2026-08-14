import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import {
  createEcommerceOrder,
  getEcommerceCustomerOrders
} from "@/server/ecommerce/ecommerce.repository";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    return NextResponse.json({
      orders: await runEnterpriseOperation("AUTHENTICATED_READ", () =>
        getEcommerceCustomerOrders(storeCode)
      )
    });
  } catch (error) {
    return ecommerceErrorResponse(error, "Your orders could not be loaded.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  try {
    const { storeCode } = await context.params;
    const body = (await request.json()) as Parameters<typeof createEcommerceOrder>[0];
    return NextResponse.json(
      await runEnterpriseOperation("TRANSACTIONAL_WRITE", () =>
        createEcommerceOrder({
          ...body,
          storeCode,
          idempotencyKey: request.headers.get("idempotency-key")
        })
      ),
      { status: 201 }
    );
  } catch (error) {
    return ecommerceErrorResponse(error, "Your order could not be placed.");
  }
}
