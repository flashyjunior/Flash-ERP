import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import {
  createEcommerceOrder,
  getEcommerceCustomerOrders
} from "@/server/ecommerce/ecommerce.repository";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";
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
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    ({ storeCode } = await context.params);
    const body = (await request.json()) as Parameters<typeof createEcommerceOrder>[0];
    const { value } = await measureEcommerceOperation("ORDER_CREATE", storeCode, () =>
      runEnterpriseOperation("TRANSACTIONAL_WRITE", () =>
        createEcommerceOrder({
          ...body,
          storeCode,
          idempotencyKey: request.headers.get("idempotency-key")
        })
      ),
    );
    return attachEcommerceServerTiming(
      NextResponse.json(value, { status: 201 }),
      "ORDER_CREATE",
      startedAt,
    );
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "Your order could not be placed."),
      "ORDER_CREATE",
      startedAt,
    );
  }
}
