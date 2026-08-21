import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { quoteEcommerceOrder } from "@/server/ecommerce/ecommerce.repository";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";
import { runEnterpriseOperation } from "@/server/performance/enterprise-runtime-capacity";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    ({ storeCode } = await context.params);
    const body = (await request.json()) as Parameters<typeof quoteEcommerceOrder>[0];
    const { value } = await measureEcommerceOperation("QUOTE", storeCode, () =>
      runEnterpriseOperation("PUBLIC_READ", () => quoteEcommerceOrder({ ...body, storeCode })),
    );
    return attachEcommerceServerTiming(NextResponse.json(value), "QUOTE", startedAt);
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "The order total could not be calculated."),
      "QUOTE",
      startedAt,
    );
  }
}
