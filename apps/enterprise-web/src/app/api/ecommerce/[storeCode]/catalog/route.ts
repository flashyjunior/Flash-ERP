import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getPublicStorefront } from "@/server/ecommerce/ecommerce.repository";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string }> }
) {
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    ({ storeCode } = await context.params);
    const { value } = await measureEcommerceOperation(
      "CATALOG",
      storeCode,
      () => getPublicStorefront(storeCode),
    );
    return attachEcommerceServerTiming(NextResponse.json(value, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60"
      }
    }), "CATALOG", startedAt);
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "The online shop could not be loaded."),
      "CATALOG",
      startedAt,
    );
  }
}
