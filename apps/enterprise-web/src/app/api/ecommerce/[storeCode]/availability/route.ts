import { NextResponse } from "next/server";

import { ecommerceErrorResponse } from "@/server/ecommerce/ecommerce-api";
import { getPublicStorefrontAvailability } from "@/server/ecommerce/ecommerce.repository";
import {
  attachEcommerceServerTiming,
  measureEcommerceOperation,
} from "@/server/ecommerce/ecommerce-performance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ storeCode: string }> },
) {
  const startedAt = performance.now();
  let storeCode = "UNKNOWN";
  try {
    ({ storeCode } = await context.params);
    const { value } = await measureEcommerceOperation(
      "CATALOG",
      storeCode,
      () => getPublicStorefrontAvailability(storeCode),
    );
    return attachEcommerceServerTiming(
      NextResponse.json(value, {
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }),
      "CATALOG",
      startedAt,
    );
  } catch (error) {
    return attachEcommerceServerTiming(
      ecommerceErrorResponse(error, "Current product availability could not be loaded."),
      "CATALOG",
      startedAt,
    );
  }
}
